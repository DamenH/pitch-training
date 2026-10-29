import { noteSpan, playNote, playTimeline, startPolyNote, startTone, type Tone } from '../audio/synth';
import { preloadPianoRange } from '../audio/piano';
import { chromaTimeline, type ChromaCue, type Question } from '../domain/exercise';
import { midiToFrequency } from '../domain/music';
import type { Waveform } from '../domain/settings';
import { settings } from './settings.svelte';

function options() {
  const s = settings.value;
  return { duration: s.noteDuration, volume: s.volume, waveform: s.waveform };
}

export function playMidi(midi: number): Promise<void> {
  return playNote(midiToFrequency(midi), options());
}

/** Masking notes sit back a little, so the test notes stand out by ear as well as on screen. */
const MASK_VOLUME = 0.6;
let chromaRun = 0;

/**
 * Play a chroma pair, with any masker the settings ask for. `oncue` reports which part
 * is sounding as it starts, and null once playback ends or is interrupted.
 */
export function playChromaPair(
  question: Question,
  replay: boolean,
  oncue: (cue: ChromaCue | null) => void,
): Promise<void> {
  const mine = ++chromaRun;
  const s = settings.value;
  const steps = chromaTimeline(question, s, Math.random, noteSpan(s.noteDuration, s.waveform), replay);
  const notes = steps.map((step) => ({
    frequency: midiToFrequency(step.midi),
    at: step.at,
    duration: step.duration,
    volume: step.cue === 'mask' ? s.volume * MASK_VOLUME : s.volume,
  }));
  return playTimeline(notes, s.waveform, (i) => {
    if (mine === chromaRun) oncue(steps[i]!.cue);
  }).finally(() => {
    if (mine === chromaRun) oncue(null);
  });
}

export function playMidiPoly(midi: number): void {
  startPolyNote(midiToFrequency(midi), options());
}

/** Start fetching piano samples for a range of notes, if the piano sound is selected. */
export function preloadNotes(low: number, high: number): void {
  if (settings.value.waveform === 'piano') preloadPianoRange(low, high);
}

/** Preload the notes Hear → Identify can play under the current settings. */
export function preloadPlaybackRange(): void {
  const s = settings.value;
  preloadNotes((s.playbackOctaveMin + 1) * 12, (s.playbackOctaveMax + 1) * 12 + 11);
}

/** Anchor tune: the sustained tone being tuned, at a fractional MIDI pitch. */
export function startTuneTone(midi: number): Tone {
  const s = settings.value;
  return startTone(midiToFrequency(midi), { volume: s.volume, waveform: s.tuneWaveform });
}

/** Anchor tune with the piano: one struck note at the current (fractional) pitch. */
export function strikeTuneNote(midi: number): Promise<void> {
  const s = settings.value;
  return playTimeline([{ frequency: midiToFrequency(midi), at: 0, duration: STRIKE_NOTE, volume: s.volume }], 'piano');
}

/**
 * Anchor tune: the current pitch an octave away, as a single note. A sustained tone keeps
 * sounding underneath, so the two can be heard together; the piano just strikes.
 */
export function strikeTuneOctave(midi: number): void {
  const s = settings.value;
  if (s.tuneWaveform === 'piano') void strikeTuneNote(midi);
  else startPolyNote(midiToFrequency(midi), { duration: STRIKE_NOTE, volume: s.volume, waveform: s.tuneWaveform });
}

/** Fetch the piano samples a tune round can reach, if the piano is its sound. */
export function preloadTuneRange(low: number, high: number): void {
  if (settings.value.tuneWaveform === 'piano') preloadPianoRange(low, high);
}

const STRIKE_NOTE = 1.6;
const COMPARE_NOTE = 1.1;
const COMPARE_GAP = 0.25;

/** Anchor tune reveal: where you left the tone, then the real anchor. */
export function playTuneComparison(answerMidi: number, referenceMidi: number): Promise<void> {
  const s = settings.value;
  const step = noteSpan(COMPARE_NOTE, s.tuneWaveform) + COMPARE_GAP;
  return playTimeline(
    [answerMidi, referenceMidi].map((midi, i) => ({
      frequency: midiToFrequency(midi),
      at: i * step,
      duration: COMPARE_NOTE,
      volume: s.volume,
    })),
    s.tuneWaveform,
  );
}

/** Try a tuning sound on a random note, never the anchor, which would hand over a reference. */
export function previewToneSound(waveform: Waveform, avoid: number): Promise<void> {
  let midi = 55 + Math.floor(Math.random() * 18);
  if (midi % 12 === avoid) midi += 5;
  return playTimeline(
    [{ frequency: midiToFrequency(midi), at: 0, duration: COMPARE_NOTE, volume: settings.value.volume }],
    waveform,
  );
}
