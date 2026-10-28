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
  toPitchClass,
  type PitchClass,
} from './music';
import { OCTAVE_MAX, OCTAVE_MIN, type ChromaContrast, type ChromaMasker, type ScoringPolicy, type Settings } from './settings';
import type { StablePitch } from './pitch';

export type ExerciseKind = 'identify' | 'identify-octave' | 'identify-chroma' | 'sing-practice' | 'sing-test';

export interface Question {
  id: string;
  kind: ExerciseKind;
  /** Exact MIDI note. For identify: the note that is played. For singing: the displayed target. */
  targetMidi: number;
  targetPitchClass: PitchClass;
  /** Identify chroma only: the second note, always in a different octave from the target. */
  comparisonMidi?: number;
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
  if (kind === 'identify' || kind === 'identify-octave' || kind === 'identify-chroma') {
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
    ...(kind === 'identify-chroma' ? { comparisonMidi: generateComparison(targetMidi, settings, rng) } : {}),
    scoringPolicy: settings.scoringPolicy,
    createdAt: now,
  };
}

// ---------------------------------------------------------------- chroma

/** Pitch-class distances (in semitones, either direction) a "different" chroma pair may use. */
export const CHROMA_DISTANCES: Record<ChromaContrast, readonly number[]> = {
  far: [3, 4, 6],
  semitone: [1],
  fifth: [5],
  mixed: [1, 2, 3, 4, 5, 6],
};

/** Octaves other than `octave` in the playback range, or its neighbours when the range is a single octave. */
function otherOctaves(octave: number, settings: Settings): number[] {
  const inRange: number[] = [];
  for (let o = settings.playbackOctaveMin; o <= settings.playbackOctaveMax; o++) if (o !== octave) inRange.push(o);
  return inRange.length > 0 ? inRange : [octave - 1, octave + 1].filter((o) => o >= OCTAVE_MIN && o <= OCTAVE_MAX);
}

/**
 * The second note of a chroma question: half the time the target's pitch class,
 * otherwise one at a distance chosen by `chromaContrast`, always in another octave.
 * Notes at least an octave away are preferred so that a small leap never gives
 * away "different" (a same-note pair is always a whole number of octaves apart).
 */
export function generateComparison(targetMidi: number, settings: Settings, rng: Rng): number {
  const targetPc = midiToPitchClass(targetMidi);
  const pcs: PitchClass[] =
    rng() < 0.5
      ? [targetPc]
      : CHROMA_DISTANCES[settings.chromaContrast].flatMap((d) => [toPitchClass(targetPc + d), toPitchClass(targetPc - d)]);
  const notes = otherOctaves(midiToOctave(targetMidi), settings).flatMap((o) =>
    [...new Set(pcs)].map((pc) => noteToMidi(pc, o)),
  );
  const wide = notes.filter((m) => Math.abs(m - targetMidi) >= 12);
  return pick(wide.length > 0 ? wide : notes, rng);
}

/** Masking notes played between the two notes (and before the first on a replay). */
export const CHROMA_MASKER_NOTES: Record<ChromaMasker, number> = { off: 0, short: 5, long: 10 };
/** Masking notes run at the scramble's pace, then pause so the test note stands apart. */
export const MASK_STEP = 0.2;
export const MASK_NOTE = 0.16;
export const MASK_PAUSE = 0.4;
/** Gap between the two notes when there is no masker. */
const PAIR_GAP = 0.08;

export type ChromaCue = 'mask' | 'first' | 'second';

export interface ChromaStep {
  midi: number;
  /** Seconds from the start of playback. */
  at: number;
  duration: number;
  cue: ChromaCue;
}

/**
 * Everything one play of a chroma pair sounds: the first note, a masker, then the second note.
 * A replay starts with a masker too, so the second note of the last play can't be compared
 * with the first. `noteSeconds` is how long a test note sounds including its release,
 * which depends on the instrument.
 */
export function chromaTimeline(
  question: Question,
  settings: Settings,
  rng: Rng,
  noteSeconds: number,
  replay = false,
): ChromaStep[] {
  const count = CHROMA_MASKER_NOTES[settings.chromaMasker];
  const second = question.comparisonMidi ?? question.targetMidi;
  const steps: ChromaStep[] = [];
  let at = 0;
  const mask = (avoid: PitchClass) => {
    if (count === 0) return;
    for (const midi of generateScramble(rng, avoid, count)) {
      steps.push({ midi, at, duration: MASK_NOTE, cue: 'mask' });
      at += MASK_STEP;
    }
    at += MASK_PAUSE - MASK_STEP + MASK_NOTE;
  };
  if (replay) mask(question.targetPitchClass);
  steps.push({ midi: question.targetMidi, at, duration: settings.noteDuration, cue: 'first' });
  at += noteSeconds + (count === 0 ? PAIR_GAP : MASK_PAUSE);
  mask(midiToPitchClass(second));
  steps.push({ midi: second, at, duration: settings.noteDuration, cue: 'second' });
  return steps;
}

/** Note mode, random replay octave: the target's pitch class in another octave of the range than the last one played. */
export function replayInRandomOctave(question: Question, settings: Settings, rng: Rng, lastMidi: number): number {
  const lastOctave = midiToOctave(lastMidi);
  const octaves: number[] = [];
  for (let o = settings.playbackOctaveMin; o <= settings.playbackOctaveMax; o++) if (o !== lastOctave) octaves.push(o);
  return octaves.length > 0 ? noteToMidi(question.targetPitchClass, pick(octaves, rng)) : lastMidi;
}

/**
 * Note mode, sweeping replay: one octave further in `direction` through the playback range,
 * turning back at either end, so replays run up to the top, down to the bottom, and repeat.
 */
export function replayInSweep(
  question: Question,
  settings: Settings,
  lastMidi: number,
  direction: 1 | -1,
): { midi: number; direction: 1 | -1 } {
  const { playbackOctaveMin: min, playbackOctaveMax: max } = settings;
  const octave = midiToOctave(lastMidi);
  if (min === max) return { midi: noteToMidi(question.targetPitchClass, min), direction };
  const turn = octave + direction > max || octave + direction < min;
  const next: 1 | -1 = turn ? (direction === 1 ? -1 : 1) : direction;
  return { midi: noteToMidi(question.targetPitchClass, Math.min(max, Math.max(min, octave + next))), direction: next };
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

export type ChromaAnswer = 'same' | 'different';

export interface IdentifyChromaResult {
  kind: 'identify-chroma';
  targetMidi: number;
  comparisonMidi: number;
  answer: ChromaAnswer;
  correct: boolean;
}

export function evaluateIdentifyChroma(question: Question, answer: ChromaAnswer): IdentifyChromaResult {
  const comparisonMidi = question.comparisonMidi ?? question.targetMidi;
  const same = midiToPitchClass(comparisonMidi) === question.targetPitchClass;
  return {
    kind: 'identify-chroma',
    targetMidi: question.targetMidi,
    comparisonMidi,
    answer,
    correct: (answer === 'same') === same,
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

export type IdentifyAnyResult = IdentifyResult | IdentifyOctaveResult | IdentifyChromaResult;

export type ExerciseResult = IdentifyAnyResult | SingResult;

/** Human-oriented description of what counts as correct for a singing question. */
export function describePolicy(policy: ScoringPolicy): string {
  return policy === 'pitch-class' ? 'Any octave counts' : 'Exact octave required';
}
