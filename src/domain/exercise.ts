// Exercise model shared by every exercise page:
//   Question (generated)  →  Answer (submitted)  →  Result (evaluated)
// Live microphone observations and stable pitches live in ./pitch.ts and only
// become an Answer when the user explicitly submits.

import {
  centsFromMidi,
  midiToOctave,
  midiToPitchClass,
  nearestMidiWithPitchClass,
  noteToMidi,
  type PitchClass,
} from './music';
import type { ScoringPolicy, Settings } from './settings';
import type { StablePitch } from './pitch';

export type ExerciseKind = 'identify' | 'identify-octave' | 'sing-practice' | 'sing-test';

export interface Question {
  id: string;
  kind: ExerciseKind;
  /** Exact MIDI note. For identify: the note that is played. For singing: the displayed target. */
  targetMidi: number;
  targetPitchClass: PitchClass;
  /** Scoring policy for singing questions, captured when the question was created. */
  scoringPolicy: ScoringPolicy;
  createdAt: number;
}

export type Rng = () => number;

function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** Every MIDI note an exercise of this kind may target under the given settings. */
export function candidateNotes(kind: ExerciseKind, settings: Settings): number[] {
  const enabled = new Set(settings.enabledPitchClasses);
  const notes: number[] = [];
  if (kind === 'identify' || kind === 'identify-octave') {
    for (let oct = settings.playbackOctaveMin; oct <= settings.playbackOctaveMax; oct++) {
      for (const pc of settings.enabledPitchClasses) notes.push(noteToMidi(pc, oct));
    }
  } else {
    for (let m = settings.vocalLow; m <= settings.vocalHigh; m++) {
      if (enabled.has(midiToPitchClass(m))) notes.push(m);
    }
  }
  return notes.sort((a, b) => a - b);
}

/**
 * Pick a random target. The pitch class is chosen uniformly from the enabled
 * set (so a wide octave range doesn't skew pitch-class frequencies), then an
 * octave is chosen uniformly among the candidates for that class.
 *
 * Only the previous *target* is consulted, and only to avoid an immediate
 * repeat: the previous answer never influences generation.
 */
export function generateTarget(kind: ExerciseKind, settings: Settings, rng: Rng, previousTargetMidi?: number): number {
  const candidates = candidateNotes(kind, settings);
  if (candidates.length === 0) throw new Error('No candidate notes for the current settings');

  if (kind === 'identify-octave') {
    const octaves = [...new Set(candidates.map(midiToOctave))];
    const previousOctave = previousTargetMidi === undefined ? undefined : midiToOctave(previousTargetMidi);
    const octavePool =
      octaves.length > 1 && previousOctave !== undefined ? octaves.filter((octave) => octave !== previousOctave) : octaves;
    const octave = pick(octavePool, rng);
    return pick(candidates.filter((midi) => midiToOctave(midi) === octave), rng);
  }

  // Pitch class is the objective, so avoid repeating the previous pitch class when
  // possible; with a single enabled class fall back to avoiding the same exact note.
  const pcs = [...new Set(candidates.map(midiToPitchClass))];
  const prevPc = previousTargetMidi === undefined ? undefined : midiToPitchClass(previousTargetMidi);
  const pcPool = pcs.length > 1 && prevPc !== undefined ? pcs.filter((pc) => pc !== prevPc) : pcs;
  const pc = pick(pcPool, rng);

  const octaves = candidates.filter((m) => midiToPitchClass(m) === pc);
  const octavePool =
    octaves.length > 1 && previousTargetMidi !== undefined ? octaves.filter((m) => m !== previousTargetMidi) : octaves;
  return pick(octavePool, rng);
}

let idCounter = 0;

export function createQuestion(
  kind: ExerciseKind,
  settings: Settings,
  rng: Rng,
  previous?: Question,
  now: number = Date.now(),
): Question {
  const targetMidi = generateTarget(kind, settings, rng, previous?.targetMidi);
  idCounter += 1;
  return {
    id: `${now.toString(36)}-${idCounter}`,
    kind,
    targetMidi,
    targetPitchClass: midiToPitchClass(targetMidi),
    scoringPolicy: settings.scoringPolicy,
    createdAt: now,
  };
}

// ---------------------------------------------------------------- scramble

/** E2 … E6: wide enough that no key or register lingers in the ear. */
export const SCRAMBLE_LOW = 40;
export const SCRAMBLE_HIGH = 88;
export const SCRAMBLE_NOTES = 14;

/**
 * A rapid, atonal run of random notes that washes out the previous pitch, so the
 * next one can't be judged relative to it. Consecutive notes never share a pitch
 * class or sit closer than a minor third, and the run never ends on `avoid`
 * (the upcoming target), which would hand it over for free.
 */
export function generateScramble(rng: Rng, avoid?: PitchClass, count = SCRAMBLE_NOTES): number[] {
  const all: number[] = [];
  for (let m = SCRAMBLE_LOW; m <= SCRAMBLE_HIGH; m++) all.push(m);
  const notes: number[] = [];
  for (let i = 0; i < count; i++) {
    const prev = notes[i - 1];
    const last = i === count - 1;
    const pool = all.filter(
      (m) =>
        (prev === undefined || (Math.abs(m - prev) >= 3 && midiToPitchClass(m) !== midiToPitchClass(prev))) &&
        !(last && midiToPitchClass(m) === avoid),
    );
    notes.push(pick(pool, rng));
  }
  return notes;
}

// ---------------------------------------------------------------- evaluation

export interface IdentifyResult {
  kind: 'identify';
  targetMidi: number;
  answer: PitchClass;
  correct: boolean;
}

export function evaluateIdentify(question: Question, answer: PitchClass): IdentifyResult {
  return {
    kind: 'identify',
    targetMidi: question.targetMidi,
    answer,
    correct: answer === question.targetPitchClass,
  };
}

export interface IdentifyOctaveResult {
  kind: 'identify-octave';
  targetMidi: number;
  answer: number;
  correct: boolean;
}

export function evaluateIdentifyOctave(question: Question, answer: number): IdentifyOctaveResult {
  return {
    kind: 'identify-octave',
    targetMidi: question.targetMidi,
    answer,
    correct: answer === midiToOctave(question.targetMidi),
  };
}

export interface PitchComparison {
  /** Nearest equal-tempered note to the sung pitch. */
  detectedMidi: number;
  /** Target the deviation was measured against (octave-equivalent in pitch-class mode). */
  referenceMidi: number;
  /** Signed cents from the reference (positive = sharp). */
  cents: number;
  withinTolerance: boolean;
}

/**
 * Compare a sung fractional MIDI pitch with a target.
 * - 'pitch-class': deviation is measured against the nearest octave of the target class.
 * - 'exact': deviation is measured against the exact target note.
 * Tolerance boundaries are inclusive.
 */
export function comparePitch(
  sungMidi: number,
  targetMidi: number,
  policy: ScoringPolicy,
  toleranceCents: number,
): PitchComparison {
  const referenceMidi =
    policy === 'pitch-class' ? nearestMidiWithPitchClass(sungMidi, midiToPitchClass(targetMidi)) : targetMidi;
  const cents = centsFromMidi(sungMidi, referenceMidi);
  // Round to 1e-6 cents so values such as exactly 50.000000000001 from float maths respect the boundary.
  const rounded = Math.round(cents * 1e6) / 1e6;
  return {
    detectedMidi: Math.round(sungMidi),
    referenceMidi,
    cents,
    withinTolerance: Math.abs(rounded) <= toleranceCents,
  };
}

export type SingResult =
  | {
      kind: 'sing';
      outcome: 'correct' | 'incorrect';
      targetMidi: number;
      policy: ScoringPolicy;
      toleranceCents: number;
      sungFrequency: number;
      comparison: PitchComparison;
    }
  | {
      kind: 'sing';
      outcome: 'no-detection';
      reason: 'never' | 'stale';
      targetMidi: number;
      policy: ScoringPolicy;
      toleranceCents: number;
    };

/**
 * Evaluate a frozen capture submitted with Check answer. Legacy missing/stale
 * inputs are still understood; intermediate exploratory pitches are not scored.
 */
export function evaluateSing(
  question: Question,
  submitted: { kind: 'ok'; pitch: StablePitch } | { kind: 'stale' } | { kind: 'none' },
  toleranceCents: number,
): SingResult {
  const base = { kind: 'sing' as const, targetMidi: question.targetMidi, policy: question.scoringPolicy, toleranceCents };
  if (submitted.kind !== 'ok') {
    return { ...base, outcome: 'no-detection', reason: submitted.kind === 'stale' ? 'stale' : 'never' };
  }
  const comparison = comparePitch(submitted.pitch.midi, question.targetMidi, question.scoringPolicy, toleranceCents);
  return {
    ...base,
    outcome: comparison.withinTolerance ? 'correct' : 'incorrect',
    sungFrequency: submitted.pitch.frequency,
    comparison,
  };
}

export type ExerciseResult = IdentifyResult | IdentifyOctaveResult | SingResult;

/** Human-oriented description of what counts as correct for a singing question. */
export function describePolicy(policy: ScoringPolicy): string {
  return policy === 'pitch-class' ? 'Any octave counts' : 'Exact octave required';
}
