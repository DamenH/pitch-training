import { playNote, playSequence, startPolyNote } from '../audio/synth';
import { preloadPianoRange } from '../audio/piano';
import { midiToFrequency } from '../domain/music';
import { settings } from './settings.svelte';

function options() {
  const s = settings.value;
  return { duration: s.noteDuration, volume: s.volume, waveform: s.waveform };
}

export function playMidi(midi: number): Promise<void> {
  return playNote(midiToFrequency(midi), options());
}

export function playMidiPoly(midi: number): void {
  startPolyNote(midiToFrequency(midi), options());
}

export function playMidiSequence(notes: readonly number[]): Promise<void> {
  return playSequence(notes.map(midiToFrequency), options());
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
