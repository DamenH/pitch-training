// Anchor tune: move a tone until it is the anchor note, then compare.
//   TuneRound (generated)  →  answer pitch (submitted)  →  TuneResult (evaluated)
// At the "any octave" level the anchor in any octave is a hit; at "exact" only the chosen octave is.

import { nearestMidiWithPitchClass, noteToMidi, type PitchClass } from './music';
import type { Settings } from './settings';
import type { Rng } from './exercise';

/** Semitones the control reaches either side of the anchor note, so every octave nearby is in reach. */
export const TUNE_REACH = 24;
/** Each end of the range moves by up to this many semitones a round, so an end is never a reference. */
export const TUNE_EDGE_JITTER = 5;
/** Rounds start within this many semitones of the anchor note. */
export const TUNE_START_SPREAD = 12;
/** Rounds never start within this many cents of the anchor (any octave), so there is always some tuning to do. */
export const TUNE_MIN_START_CENTS = 200;
/** C1 … C8: the range never leaves what can be heard and played. */
export const TUNE_MIDI_MIN = 24;
export const TUNE_MIDI_MAX = 108;
/** A round is cold when nothing was answered for this long: no recent labelled note to lean on. */
export const COLD_GAP_MS = 60 * 60 * 1000;
export const TUNE_PERFECT_CENTS = 10;
export const TUNE_CLOSE_CENTS = 25;

export interface TuneRound {
  id: string;
  anchor: PitchClass;
  /** The anchor note in the chosen octave: the centre of the range, and the target at the exact level. */
  target: number;
  /** Only `target` counts, not the anchor in another octave. */
  exact: boolean;
  /** Fractional MIDI pitches the control reaches. */
  low: number;
  high: number;
  /** Where the tone starts. */
  startMidi: number;
  /** No answers in the last COLD_GAP_MS when the round began. */
  cold: boolean;
  createdAt: number;
}

/** Signed cents from the nearest anchor in any octave, in [−600, 600). */
export function tuneError(midi: number, anchor: PitchClass): number {
  return (midi - nearestMidiWithPitchClass(midi, anchor)) * 100;
}

let idCounter = 0;

export function createTuneRound(settings: Settings, rng: Rng, cold: boolean, now: number = Date.now()): TuneRound {
  const anchor = settings.anchorPitchClass;
  const target = noteToMidi(anchor, settings.anchorOctave);
  const jitter = () => (rng() * 2 - 1) * TUNE_EDGE_JITTER;
  const low = Math.max(TUNE_MIDI_MIN, target - TUNE_REACH + jitter());
  const high = Math.min(TUNE_MIDI_MAX, target + TUNE_REACH + jitter());
  const pickStart = () => target + (rng() * 2 - 1) * TUNE_START_SPREAD;
  let startMidi = pickStart();
  // Most of the spread is far enough away, so a few tries always suffice in practice.
  for (let i = 0; i < 100 && Math.abs(tuneError(startMidi, anchor)) < TUNE_MIN_START_CENTS; i++) startMidi = pickStart();
  idCounter += 1;
  return {
    id: `${now.toString(36)}-t${idCounter}`,
    anchor,
    target,
    exact: settings.tuneLevel === 'exact',
    low,
    high,
    startMidi,
    cold,
    createdAt: now,
  };
}

export function isCold(lastAnswerAt: number | undefined, now: number = Date.now()): boolean {
  return lastAnswerAt === undefined || now - lastAnswerAt >= COLD_GAP_MS;
}

export type TuneGrade = 'perfect' | 'close' | 'found' | 'missed';

/** Perfect and close are fixed bands inside the user's tolerance, which decides found or missed. */
export function gradeTune(cents: number, toleranceCents: number): TuneGrade {
  const abs = Math.abs(Math.round(cents));
  if (abs <= Math.min(TUNE_PERFECT_CENTS, toleranceCents)) return 'perfect';
  if (abs <= Math.min(TUNE_CLOSE_CENTS, toleranceCents)) return 'close';
  return abs <= toleranceCents ? 'found' : 'missed';
}

export interface TuneResult {
  kind: 'anchor-tune';
  anchor: PitchClass;
  /** Fractional MIDI pitch the tone was left at. */
  answerMidi: number;
  /** The note the error is measured from: the round's target at the exact level, else the nearest anchor. */
  referenceMidi: number;
  /** The anchor in whichever octave is nearest the answer. */
  nearestMidi: number;
  /** Signed cents from `referenceMidi`: positive is sharp. */
  cents: number;
  /** Signed cents from `nearestMidi`, the same as `cents` unless the octave is wrong. */
  pitchClassCents: number;
  grade: TuneGrade;
  correct: boolean;
  /** Exact level: the anchor was found, but in another octave. */
  wrongOctave: boolean;
}

export function evaluateTune(round: TuneRound, answerMidi: number, toleranceCents: number): TuneResult {
  const nearestMidi = nearestMidiWithPitchClass(answerMidi, round.anchor);
  const referenceMidi = round.exact ? round.target : nearestMidi;
  const cents = (answerMidi - referenceMidi) * 100;
  const pitchClassCents = tuneError(answerMidi, round.anchor);
  const grade = gradeTune(cents, toleranceCents);
  return {
    kind: 'anchor-tune',
    anchor: round.anchor,
    answerMidi,
    referenceMidi,
    nearestMidi,
    cents,
    pitchClassCents,
    grade,
    correct: grade !== 'missed',
    wrongOctave: nearestMidi !== referenceMidi && gradeTune(pitchClassCents, toleranceCents) !== 'missed',
  };
}

/** Keep a dragged pitch inside the round's range. */
export function clampTune(round: TuneRound, midi: number): number {
  return Math.min(round.high, Math.max(round.low, midi));
}
