// Anchor tune: drag a sustained tone until it is the anchor note, then compare.
//   TuneRound (generated)  →  answer pitch (submitted)  →  TuneResult (evaluated)
// Only the pitch class counts: landing on the anchor in any octave is a hit.

import { nearestMidiWithPitchClass, type PitchClass } from './music';
import type { Settings } from './settings';
import type { Rng } from './exercise';

/** Semitones the tuning control covers: more than an octave, so an anchor is always in reach. */
export const TUNE_SPAN = 18;
/** Rounds never start within this many cents of the anchor, so there is always some tuning to do. */
export const TUNE_MIN_START_CENTS = 200;
/** A round is cold when nothing was answered for this long: no recent labelled note to lean on. */
export const COLD_GAP_MS = 60 * 60 * 1000;
export const TUNE_PERFECT_CENTS = 10;
export const TUNE_CLOSE_CENTS = 25;

export interface TuneRound {
  id: string;
  anchor: PitchClass;
  /** Lowest fractional MIDI pitch the control reaches; the highest is `low + TUNE_SPAN`. */
  low: number;
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

/**
 * The control's range sits somewhere random inside the Identify octaves (widened when
 * they span less than TUNE_SPAN), so no position or starting register gives the anchor away.
 */
export function tuneWindow(settings: Settings, rng: Rng): number {
  let lo = (settings.playbackOctaveMin + 1) * 12;
  let hi = (settings.playbackOctaveMax + 2) * 12;
  if (hi - lo < TUNE_SPAN) {
    const mid = (lo + hi) / 2;
    lo = mid - TUNE_SPAN / 2;
    hi = mid + TUNE_SPAN / 2;
  }
  return lo + rng() * (hi - lo - TUNE_SPAN);
}

let idCounter = 0;

export function createTuneRound(settings: Settings, rng: Rng, cold: boolean, now: number = Date.now()): TuneRound {
  const anchor = settings.anchorPitchClass;
  const low = tuneWindow(settings, rng);
  let startMidi = low + rng() * TUNE_SPAN;
  // Most of the range is far enough away, so a few tries always suffice in practice.
  for (let i = 0; i < 100 && Math.abs(tuneError(startMidi, anchor)) < TUNE_MIN_START_CENTS; i++) {
    startMidi = low + rng() * TUNE_SPAN;
  }
  idCounter += 1;
  return { id: `${now.toString(36)}-t${idCounter}`, anchor, low, startMidi, cold, createdAt: now };
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
  /** The anchor nearest the answer, which the error is measured from. */
  referenceMidi: number;
  /** Signed: positive is sharp. */
  cents: number;
  grade: TuneGrade;
  correct: boolean;
}

export function evaluateTune(round: TuneRound, answerMidi: number, toleranceCents: number): TuneResult {
  const cents = tuneError(answerMidi, round.anchor);
  const grade = gradeTune(cents, toleranceCents);
  return {
    kind: 'anchor-tune',
    anchor: round.anchor,
    answerMidi,
    referenceMidi: nearestMidiWithPitchClass(answerMidi, round.anchor),
    cents,
    grade,
    correct: grade !== 'missed',
  };
}

/** Keep a dragged pitch inside the round's range. */
export function clampTune(round: TuneRound, midi: number): number {
  return Math.min(round.low + TUNE_SPAN, Math.max(round.low, midi));
}
