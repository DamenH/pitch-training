// Web Audio note player: sampled grand piano (default) or simple oscillators.
// Each note is one source node + gain envelope. Only one note/sequence sounds at a
// time for exercises. Live keys and imported scores can use overlapping voices.

import { getAudioContext, resumeAudio } from './context';
import { loadPianoNote } from './piano';
import { PIANO_SAMPLE_SECONDS, pianoPlaybackRate, type PianoSample } from './pianoSamples';
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

interface Voice {
  source: AudioScheduledSourceNode;
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

function track(source: AudioScheduledSourceNode, gain: GainNode, end: number): Voice {
  const voice: Voice = { source, gain, end };
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    voices = voices.filter((v) => v !== voice);
  };
  return voice;
}

function release(opts: PlayOptions): number {
  return opts.waveform === 'piano' ? PIANO_RELEASE : RELEASE;
}

/** Piano notes are held for `duration` (capped by the sample length), then damped. */
function pianoHold(opts: PlayOptions): number {
  return Math.min(opts.duration, PIANO_SAMPLE_SECONDS - PIANO_RELEASE - 0.1);
}

function scheduleOscillator(ctx: AudioContext, frequency: number, start: number, opts: PlayOptions): Voice {
  const osc = ctx.createOscillator();
  if (opts.waveform === 'warm' || opts.waveform === 'piano') osc.setPeriodicWave(warm(ctx));
  else osc.type = opts.waveform;
  osc.frequency.setValueAtTime(frequency, start);

  const peak = perceptualGain(opts.volume, MAX_GAIN);
  const sustainEnd = start + Math.max(ATTACK, opts.duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + ATTACK);
  gain.gain.setValueAtTime(peak, sustainEnd);
  gain.gain.linearRampToValueAtTime(0, sustainEnd + RELEASE);

  osc.connect(gain).connect(output(ctx));
  const end = sustainEnd + RELEASE + 0.02;
  osc.start(start);
  osc.stop(end);
  return track(osc, gain, end);
}

function schedulePiano(ctx: AudioContext, frequency: number, note: PianoNote, start: number, opts: PlayOptions): Voice {
  const src = ctx.createBufferSource();
  src.buffer = note.buffer;
  src.playbackRate.setValueAtTime(pianoPlaybackRate(frequencyToMidi(frequency), note.sample), start);

  const peak = perceptualGain(opts.volume, PIANO_MAX_GAIN) * note.normalize;
  const sustainEnd = start + pianoHold(opts);
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
  return track(src, gain, end);
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
      v.source.stop(now + FAST_RELEASE + 0.01);
    } catch {
      // Already stopped.
    }
  }
}

/**
 * Play notes one after another (a single note is a sequence of one).
 * Resolves when the last note has finished, or early if interrupted by another call.
 */
export async function playSequence(frequencies: readonly number[], opts: PlayOptions, gapSeconds = 0.08): Promise<void> {
  stopAll();
  const myGeneration = generation;
  // resumeAudio() runs synchronously inside the user gesture, before any awaits (iOS).
  const ctxPromise = resumeAudio();
  let piano: (PianoNote | null)[] = [];
  if (opts.waveform === 'piano') {
    piano = await Promise.all(
      frequencies.map((f) =>
        loadPianoNote(frequencyToMidi(f)).catch((err: unknown) => {
          console.warn('Piano sample unavailable, using synthesized tone instead.', err);
          return null;
        }),
      ),
    );
  }
  const ctx = await ctxPromise;
  if (myGeneration !== generation || frequencies.length === 0) return;

  const step = (opts.waveform === 'piano' ? pianoHold(opts) : opts.duration) + release(opts) + gapSeconds;
  let start = ctx.currentTime + 0.03;
  let end = start;
  frequencies.forEach((f, i) => {
    const note = piano[i];
    const v = note ? schedulePiano(ctx, f, note, start, opts) : scheduleOscillator(ctx, f, start, opts);
    voices.push(v);
    end = v.end;
    start += step;
  });

  const waitMs = Math.max(0, (end - ctx.currentTime) * 1000);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, waitMs);
    function done() {
      clearTimeout(timer);
      if (finishCurrent === done) finishCurrent = null;
      resolve();
    }
    finishCurrent = done;
  });
}

export function playNote(frequency: number, opts: PlayOptions): Promise<void> {
  return playSequence([frequency], opts);
}

function addPolyVoice(voice: Voice): void {
  // Includes score playback plus live keys played over it.
  if (voices.length >= 64) {
    try { voices.shift()?.source.stop(); } catch { /* Already ended. */ }
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
      voice.source.stop(now + 0.12);
    } catch { /* Already ended. */ }
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
