// Web Audio note player: sampled grand piano (default), simple oscillators or synth presets.
// Each note is a few source nodes + one gain envelope. Only one note/sequence sounds at a
// time for exercises. Live keys and imported scores can use overlapping voices.

import { getAudioContext, resumeAudio } from './context';
import { loadPianoNote } from './piano';
import { PIANO_SAMPLE_SECONDS, pianoPlaybackRate, type PianoSample } from './pianoSamples';
import { cutoffFor, isPreset, PRESETS } from './presets';
import { frequencyToMidi } from '../domain/music';
import type { Waveform } from '../domain/settings';
import { midiToFrequency } from '../domain/music';
import type { PianoScore, ScoreNote } from '../domain/score';

export interface PlayOptions {
  /** Seconds the note sounds, including attack but not release. */
  duration: number;
  /** 0–1, perceptual. */
  volume: number;
  waveform: Waveform;
}

const ATTACK = 0.02;
const RELEASE = 0.12;
/** Piano: tiny fade-in only (the recording has its own attack) and a damper-like release. */
const PIANO_ATTACK = 0.004;
const PIANO_RELEASE = 0.35;
const FAST_RELEASE = 0.03;
/** Headroom so loud settings never clip, even with harmonics. */
const MAX_GAIN = 0.5;
/** Normalized piano peaks sit a little below full scale. */
const PIANO_MAX_GAIN = 0.8;
/** Glide time constant for a sustained tone changing pitch: smooth, but quick enough to feel direct. */
const GLIDE = 0.012;
/** Fade time constant for muting a sustained tone: no click, but no audible tail either. */
const MUTE_FADE = 0.015;

interface Voice {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  end: number;
}

type PianoNote = { buffer: AudioBuffer; normalize: number; sample: PianoSample };

let voices: Voice[] = [];
let master: GainNode | null = null;
let warmWave: { ctx: AudioContext; wave: PeriodicWave } | null = null;
let generation = 0;
let finishCurrent: (() => void) | null = null;

function output(ctx: AudioContext): GainNode {
  if (!master || master.context !== ctx) {
    master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
  }
  return master;
}

function warm(ctx: AudioContext): PeriodicWave {
  if (!warmWave || warmWave.ctx !== ctx) {
    // A few gentle harmonics: clearer than a sine on small phone speakers, still unambiguous in pitch.
    const real = new Float32Array([0, 0, 0, 0, 0, 0]);
    const imag = new Float32Array([0, 1, 0.45, 0.2, 0.08, 0.04]);
    warmWave = { ctx, wave: ctx.createPeriodicWave(real, imag) };
  }
  return warmWave.wave;
}

function perceptualGain(volume: number, max: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return Math.max(0.0001, v * v * max);
}

function track(sources: AudioScheduledSourceNode[], gain: GainNode, end: number): Voice {
  const voice: Voice = { sources, gain, end };
  sources[0]!.onended = () => {
    for (const source of sources) source.disconnect();
    gain.disconnect();
    voices = voices.filter((v) => v !== voice);
  };
  return voice;
}

function stopSources(voice: Voice, when: number): void {
  for (const source of voice.sources) {
    try {
      source.stop(when);
    } catch {
      // Already stopped.
    }
  }
}

function release(waveform: Waveform): number {
  if (waveform === 'piano') return PIANO_RELEASE;
  return isPreset(waveform) ? PRESETS[waveform].release : RELEASE;
}

/** Piano notes are held for `duration` (capped by the sample length), then damped. */
function pianoHold(duration: number): number {
  return Math.min(duration, PIANO_SAMPLE_SECONDS - PIANO_RELEASE - 0.1);
}

/** Seconds a note of this length sounds for, release included. */
export function noteSpan(duration: number, waveform: Waveform): number {
  return (waveform === 'piano' ? pianoHold(duration) : duration) + release(waveform);
}

interface OscillatorVoice {
  oscillators: OscillatorNode[];
  filter: BiquadFilterNode | null;
  gain: GainNode;
  peak: number;
  attack: number;
  release: number;
  /** Glide every oscillator (and the filter, which tracks the note) to a new frequency. */
  retune(frequency: number, at: number): void;
}

/** Oscillators, mixer and filter for one note, wired to a silent gain envelope and not yet started. */
function buildOscillators(ctx: AudioContext, frequency: number, start: number, waveform: Waveform, volume: number): OscillatorVoice {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.connect(output(ctx));
  if (isPreset(waveform)) {
    const preset = PRESETS[waveform];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = preset.resonance;
    filter.frequency.setValueAtTime(cutoffFor(preset, frequency), start);
    filter.connect(gain);
    const total = preset.oscillators.reduce((sum, o) => sum + o.gain, 0);
    const oscillators = preset.oscillators.map((o) => {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.setValueAtTime(frequency, start);
      osc.detune.setValueAtTime(o.detune, start);
      const mix = ctx.createGain();
      mix.gain.value = o.gain / total;
      osc.connect(mix).connect(filter);
      return osc;
    });
    return {
      oscillators,
      filter,
      gain,
      peak: perceptualGain(volume, MAX_GAIN),
      attack: preset.attack,
      release: preset.release,
      retune(f, at) {
        for (const osc of oscillators) osc.frequency.setTargetAtTime(f, at, GLIDE);
        filter.frequency.setTargetAtTime(cutoffFor(preset, f), at, GLIDE);
      },
    };
  }
  const osc = ctx.createOscillator();
  if (waveform === 'warm' || waveform === 'piano') osc.setPeriodicWave(warm(ctx));
  else osc.type = waveform;
  osc.frequency.setValueAtTime(frequency, start);
  osc.connect(gain);
  return {
    oscillators: [osc],
    filter: null,
    gain,
    peak: perceptualGain(volume, MAX_GAIN),
    attack: ATTACK,
    release: RELEASE,
    retune(f, at) {
      osc.frequency.setTargetAtTime(f, at, GLIDE);
    },
  };
}

function scheduleOscillator(ctx: AudioContext, frequency: number, start: number, opts: PlayOptions): Voice {
  const v = buildOscillators(ctx, frequency, start, opts.waveform, opts.volume);
  const sustainEnd = start + Math.max(v.attack, opts.duration);
  v.gain.gain.linearRampToValueAtTime(v.peak, start + v.attack);
  v.gain.gain.setValueAtTime(v.peak, sustainEnd);
  v.gain.gain.linearRampToValueAtTime(0, sustainEnd + v.release);
  const end = sustainEnd + v.release + 0.02;
  for (const osc of v.oscillators) {
    osc.start(start);
    osc.stop(end);
  }
  return track(v.oscillators, v.gain, end);
}

function schedulePiano(ctx: AudioContext, frequency: number, note: PianoNote, start: number, opts: PlayOptions): Voice {
  const src = ctx.createBufferSource();
  src.buffer = note.buffer;
  src.playbackRate.setValueAtTime(pianoPlaybackRate(frequencyToMidi(frequency), note.sample), start);

  const peak = perceptualGain(opts.volume, PIANO_MAX_GAIN) * note.normalize;
  const sustainEnd = start + pianoHold(opts.duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + PIANO_ATTACK);
  gain.gain.setValueAtTime(peak, sustainEnd);
  // Exponential-ish damping sounds like a key release rather than a fade.
  gain.gain.setTargetAtTime(0, sustainEnd, PIANO_RELEASE / 4);

  src.connect(gain).connect(output(ctx));
  const end = sustainEnd + PIANO_RELEASE + 0.02;
  src.start(start);
  src.stop(end);
  return track([src], gain, end);
}

/** Fade out anything currently sounding or scheduled. */
export function stopAll(): void {
  generation++;
  finishCurrent?.();
  finishCurrent = null;
  if (voices.length === 0) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  for (const v of voices) {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + FAST_RELEASE);
    } catch {
      // Already stopped.
    }
    stopSources(v, now + FAST_RELEASE + 0.01);
  }
}

/** One note of a timeline: `at` seconds after the timeline starts. */
export interface TimedNote {
  frequency: number;
  at: number;
  duration: number;
  volume: number;
}

/**
 * Play notes at given offsets, calling `onstart(i)` as each one begins (for visual cues).
 * Resolves when the last note has finished, or early if interrupted by another call.
 */
export async function playTimeline(
  notes: readonly TimedNote[],
  waveform: Waveform,
  onstart?: (index: number) => void,
): Promise<void> {
  stopAll();
  const myGeneration = generation;
  // resumeAudio() runs synchronously inside the user gesture, before any awaits (iOS).
  const ctxPromise = resumeAudio();
  let piano: (PianoNote | null)[] = [];
  if (waveform === 'piano') {
    piano = await Promise.all(
      notes.map((n) =>
        loadPianoNote(frequencyToMidi(n.frequency)).catch((err: unknown) => {
          console.warn('Piano sample unavailable, using synthesized tone instead.', err);
          return null;
        }),
      ),
    );
  }
  const ctx = await ctxPromise;
  if (myGeneration !== generation || notes.length === 0) return;

  const base = ctx.currentTime + 0.03;
  let end = base;
  const cues: ReturnType<typeof setTimeout>[] = [];
  notes.forEach((n, i) => {
    const start = base + n.at;
    const opts: PlayOptions = { duration: n.duration, volume: n.volume, waveform };
    const sample = piano[i];
    const v = sample ? schedulePiano(ctx, n.frequency, sample, start, opts) : scheduleOscillator(ctx, n.frequency, start, opts);
    voices.push(v);
    end = Math.max(end, v.end);
    if (onstart) cues.push(setTimeout(() => onstart(i), Math.max(0, (start - ctx.currentTime) * 1000)));
  });

  const waitMs = Math.max(0, (end - ctx.currentTime) * 1000);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, waitMs);
    function done() {
      clearTimeout(timer);
      for (const cue of cues) clearTimeout(cue);
      if (finishCurrent === done) finishCurrent = null;
      resolve();
    }
    finishCurrent = done;
  });
}

/**
 * Play notes one after another (a single note is a sequence of one).
 * Notes start `gapSeconds` after the previous one's release, or every `stepSeconds`
 * when given, letting each ring into the next.
 * Resolves when the last note has finished, or early if interrupted by another call.
 */
export function playSequence(
  frequencies: readonly number[],
  opts: PlayOptions,
  gapSeconds = 0.08,
  stepSeconds?: number,
): Promise<void> {
  const step = stepSeconds ?? noteSpan(opts.duration, opts.waveform) + gapSeconds;
  return playTimeline(
    frequencies.map((frequency, i) => ({ frequency, at: i * step, duration: opts.duration, volume: opts.volume })),
    opts.waveform,
  );
}

export function playNote(frequency: number, opts: PlayOptions): Promise<void> {
  return playSequence([frequency], opts);
}

export interface Tone {
  /** Glide to a new frequency. */
  retune(frequency: number): void;
  /** Fade the tone out or back in without stopping it. */
  mute(muted: boolean): void;
  /** Fade out and release the tone. */
  stop(): void;
}

/**
 * A tone that sustains until stopped, for tuning by ear. The piano can't sustain,
 * so it falls back to the soft synth. Starting a tone interrupts other exercise playback.
 */
export function startTone(frequency: number, opts: Omit<PlayOptions, 'duration'>): Tone {
  stopAll();
  const myGeneration = generation;
  const waveform: Waveform = opts.waveform === 'piano' ? 'soft' : opts.waveform;
  let current = frequency;
  let muted = false;
  let stopped = false;
  let voice: Voice | undefined;
  let built: OscillatorVoice | undefined;
  void resumeAudio()
    .then((ctx) => {
      if (stopped || myGeneration !== generation) return;
      const start = ctx.currentTime + 0.01;
      built = buildOscillators(ctx, current, start, waveform, opts.volume);
      if (!muted) built.gain.gain.linearRampToValueAtTime(built.peak, start + built.attack);
      for (const osc of built.oscillators) osc.start(start);
      voice = track(built.oscillators, built.gain, Infinity);
      voices.push(voice);
    })
    .catch((error: unknown) => console.warn('Unable to start tone.', error));
  return {
    retune(f) {
      current = f;
      if (built && !stopped) built.retune(f, built.gain.context.currentTime);
    },
    mute(m) {
      muted = m;
      if (!built || stopped) return;
      const now = built.gain.context.currentTime;
      built.gain.gain.cancelScheduledValues(now);
      built.gain.gain.setValueAtTime(built.gain.gain.value, now);
      built.gain.gain.setTargetAtTime(m ? 0 : built.peak, now, MUTE_FADE);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (!voice || !built) return;
      const now = built.gain.context.currentTime;
      try {
        built.gain.gain.cancelScheduledValues(now);
        built.gain.gain.setValueAtTime(built.gain.gain.value, now);
        built.gain.gain.linearRampToValueAtTime(0, now + built.release);
      } catch {
        // Already stopped.
      }
      stopSources(voice, now + built.release + 0.02);
    },
  };
}

function addPolyVoice(voice: Voice): void {
  // Includes score playback plus live keys played over it.
  if (voices.length >= 64) {
    const oldest = voices.shift();
    if (oldest) stopSources(oldest, 0);
  }
  voices.push(voice);
}

/** Add a voice without interrupting other keys. Release can cancel a still-loading sample. */
export function startPolyNote(frequency: number, opts: PlayOptions): () => void {
  const myGeneration = generation;
  const ctxPromise = resumeAudio();
  let released = false;
  let voice: Voice | undefined;
  void (async () => {
    const note = opts.waveform === 'piano' ? await loadPianoNote(frequencyToMidi(frequency)).catch(() => null) : null;
    const ctx = await ctxPromise;
    if (released || myGeneration !== generation) return;
    voice = note ? schedulePiano(ctx, frequency, note, ctx.currentTime + 0.005, opts)
      : scheduleOscillator(ctx, frequency, ctx.currentTime + 0.005, opts);
    addPolyVoice(voice);
  })().catch((error: unknown) => console.warn('Unable to play note.', error));
  return () => {
    released = true;
    if (!voice) return;
    const now = voice.gain.context.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.025);
    } catch { /* Already ended. */ }
    stopSources(voice, now + 0.12);
  };
}

/**
 * A key held down: sounds for at least `opts.duration`, and on for as long as it is held.
 * Synth sounds sustain indefinitely; the piano until its recording runs out.
 * Returns the release. Doesn't interrupt other keys.
 */
export function startHeldNote(frequency: number, opts: PlayOptions): () => void {
  const myGeneration = generation;
  const ctxPromise = resumeAudio();
  let released = false;
  let release: (() => void) | undefined;
  void (async () => {
    const note = opts.waveform === 'piano' ? await loadPianoNote(frequencyToMidi(frequency)).catch(() => null) : null;
    const ctx = await ctxPromise;
    if (myGeneration !== generation) return;
    const start = ctx.currentTime + 0.005;
    // Let go before the sound was ready: just play an ordinary note.
    if (released) {
      addPolyVoice(note ? schedulePiano(ctx, frequency, note, start, opts) : scheduleOscillator(ctx, frequency, start, opts));
      return;
    }
    if (note) {
      // Held to the end of the recording; letting go sooner damps it early.
      const voice = schedulePiano(ctx, frequency, note, start, { ...opts, duration: Infinity });
      addPolyVoice(voice);
      const earliest = start + pianoHold(opts.duration);
      release = () => {
        const at = Math.max(ctx.currentTime, earliest);
        if (at >= voice.end - PIANO_RELEASE) return;
        try {
          voice.gain.gain.cancelScheduledValues(at);
          voice.gain.gain.setTargetAtTime(0, at, PIANO_RELEASE / 4);
        } catch { /* Already ended. */ }
        stopSources(voice, at + PIANO_RELEASE + 0.02);
      };
      return;
    }
    const v = buildOscillators(ctx, frequency, start, opts.waveform, opts.volume);
    v.gain.gain.linearRampToValueAtTime(v.peak, start + v.attack);
    for (const osc of v.oscillators) osc.start(start);
    const voice = track(v.oscillators, v.gain, Infinity);
    addPolyVoice(voice);
    // The attack is always over by then, so the release starts from the full level.
    const earliest = start + Math.max(v.attack, opts.duration);
    release = () => {
      const at = Math.max(ctx.currentTime, earliest);
      try {
        v.gain.gain.cancelScheduledValues(at);
        v.gain.gain.setValueAtTime(v.peak, at);
        v.gain.gain.linearRampToValueAtTime(0, at + v.release);
      } catch { /* Already ended. */ }
      stopSources(voice, at + v.release + 0.02);
    };
  })().catch((error: unknown) => console.warn('Unable to play note.', error));
  return () => {
    if (released) return;
    released = true;
    release?.();
  };
}

/** Schedule a piano score with a short lookahead instead of allocating the whole piece. */
export async function playPianoScore(score: PianoScore, volume: number, onprogress: (seconds: number, notes: readonly ScoreNote[]) => void): Promise<void> {
  stopAll();
  const myGeneration = generation;
  const ctxPromise = resumeAudio();
  const samples = new Map<number, PianoNote>();
  await Promise.all([...new Set(score.notes.map((n) => n.midi))].map(async (midi) => {
    samples.set(midi, await loadPianoNote(midi));
  }));
  const ctx = await ctxPromise;
  if (myGeneration !== generation) return;
  const start = ctx.currentTime + 0.05;
  const duration = Math.max(...score.notes.map((n) => n.time + n.duration));
  let next = 0;
  let visible: ScoreNote[] = [];
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    function done() {
      clearTimeout(timer);
      if (finishCurrent === done) finishCurrent = null;
      onprogress(0, []);
      resolve();
    }
    function tick() {
      if (myGeneration !== generation) { done(); return; }
      const time = Math.max(0, ctx.currentTime - start);
      visible = visible.filter((n) => n.time + Math.min(n.duration, 4.15) > time);
      while (next < score.notes.length && score.notes[next]!.time <= time + 0.15) {
        const n = score.notes[next++]!;
        // A suspended/throttled page skips missed attacks instead of playing a burst.
        if (n.time + Math.min(n.duration, 4.15) <= time) continue;
        const opts: PlayOptions = { waveform: 'piano', duration: n.duration, volume: volume * Math.sqrt(n.velocity) };
        const voice = schedulePiano(ctx, midiToFrequency(n.midi), samples.get(n.midi)!, Math.max(ctx.currentTime, start + n.time), opts);
        addPolyVoice(voice);
        visible.push(n);
      }
      onprogress(time, visible.filter((n) => n.time <= time));
      if (next === score.notes.length && time > duration + PIANO_RELEASE) { done(); return; }
      timer = setTimeout(tick, 25);
    }
    finishCurrent = done;
    tick();
  });
}
