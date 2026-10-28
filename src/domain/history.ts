import { ALL_PITCH_CLASSES, toPitchClass, type PitchClass } from './music';
import type { ExerciseResult, Question } from './exercise';
import type { TuneResult, TuneRound } from './anchor';
import type { ScoringPolicy } from './settings';

export type HistoryExercise = 'identify' | 'identify-octave' | 'identify-chroma' | 'anchor-tune' | 'sing-test';
const HISTORY_EXERCISES: readonly HistoryExercise[] = [
  'identify',
  'identify-octave',
  'identify-chroma',
  'anchor-tune',
  'sing-test',
];
export type HistoryOutcome = 'correct' | 'incorrect' | 'no-detection';

export interface HistoryEntry {
  /** ISO date-time of the submission. */
  date: string;
  exercise: HistoryExercise;
  /** True when the question came from Mixed Practice. */
  mixed: boolean;
  targetMidi: number;
  targetPitchClass: PitchClass;
  outcome: HistoryOutcome;
  /**
   * Identify notes: pitch class. Identify octaves: octave number. Identify chroma: 1 = same, 0 = different.
   * Anchor tune: the fractional MIDI pitch the tone was left at. Sing: nearest MIDI note.
   */
  answer: number | null;
  /** Identify chroma only: the second note of the pair. */
  comparisonMidi: number | null;
  /** Sing and anchor tune: signed deviation from the reference, in cents. */
  cents: number | null;
  /** Anchor tune only: the fractional MIDI pitch the tone started at. */
  startMidi: number | null;
  /** Anchor tune only: nothing had been answered for a while, so no recent reference helped. */
  cold: boolean | null;
  policy: ScoringPolicy | null;
  /** Milliseconds from question start (identify: first playback) to submission. */
  responseMs: number;
}

export function entryFromResult(
  question: Question,
  result: ExerciseResult,
  opts: { mixed: boolean; responseMs: number; date?: Date },
): HistoryEntry {
  const common = {
    date: (opts.date ?? new Date()).toISOString(),
    mixed: opts.mixed,
    targetMidi: question.targetMidi,
    targetPitchClass: question.targetPitchClass,
    comparisonMidi: null,
    startMidi: null,
    cold: null,
    responseMs: Math.max(0, Math.round(opts.responseMs)),
  };
  if (result.kind === 'identify') {
    return {
      ...common,
      exercise: 'identify',
      outcome: result.correct ? 'correct' : 'incorrect',
      answer: result.answer,
      cents: null,
      policy: null,
    };
  }
  if (result.kind === 'identify-octave') {
    return {
      ...common,
      exercise: 'identify-octave',
      outcome: result.correct ? 'correct' : 'incorrect',
      answer: result.answer,
      cents: null,
      policy: null,
    };
  }
  if (result.kind === 'identify-chroma') {
    return {
      ...common,
      exercise: 'identify-chroma',
      outcome: result.correct ? 'correct' : 'incorrect',
      answer: result.answer === 'same' ? 1 : 0,
      comparisonMidi: result.comparisonMidi,
      cents: null,
      policy: null,
    };
  }
  return {
    ...common,
    exercise: 'sing-test',
    outcome: result.outcome,
    answer: result.outcome === 'no-detection' ? null : result.comparison.detectedMidi,
    cents: result.outcome === 'no-detection' ? null : Math.round(result.comparison.cents),
    policy: result.policy,
  };
}

export function entryFromTune(
  round: TuneRound,
  result: TuneResult,
  opts: { responseMs: number; date?: Date },
): HistoryEntry {
  return {
    date: (opts.date ?? new Date()).toISOString(),
    exercise: 'anchor-tune',
    mixed: false,
    targetMidi: result.referenceMidi,
    targetPitchClass: result.anchor,
    outcome: result.correct ? 'correct' : 'incorrect',
    answer: Math.round(result.answerMidi * 100) / 100,
    comparisonMidi: null,
    cents: Math.round(result.cents),
    policy: null,
    startMidi: Math.round(round.startMidi * 100) / 100,
    cold: round.cold,
    responseMs: Math.max(0, Math.round(opts.responseMs)),
  };
}

export interface Tally {
  answered: number;
  correct: number;
  incorrect: number;
  /** Singing submissions with no usable pitch; not counted as answered. */
  noDetection: number;
  /** correct / answered, or null when nothing answered. */
  accuracy: number | null;
  meanResponseMs: number | null;
}

export interface HistorySummary {
  overall: Tally;
  byExercise: Record<HistoryExercise, Tally>;
  byPitchClass: Record<PitchClass, Tally>;
}

function tally(entries: readonly HistoryEntry[]): Tally {
  let correct = 0;
  let incorrect = 0;
  let noDetection = 0;
  let responseTotal = 0;
  for (const e of entries) {
    if (e.outcome === 'correct') correct++;
    else if (e.outcome === 'incorrect') incorrect++;
    else noDetection++;
    if (e.outcome !== 'no-detection') responseTotal += e.responseMs;
  }
  const answered = correct + incorrect;
  return {
    answered,
    correct,
    incorrect,
    noDetection,
    accuracy: answered > 0 ? correct / answered : null,
    meanResponseMs: answered > 0 ? responseTotal / answered : null,
  };
}

export function summarize(entries: readonly HistoryEntry[]): HistorySummary {
  // Chroma answers say "same" or "different", not which note it was, and tuning is a different
  // skill from naming, so neither counts towards a note.
  const byNote = entries.filter((e) => e.exercise !== 'identify-chroma' && e.exercise !== 'anchor-tune');
  const byPitchClass = {} as Record<PitchClass, Tally>;
  for (const pc of ALL_PITCH_CLASSES) byPitchClass[pc] = tally(byNote.filter((e) => e.targetPitchClass === pc));
  return {
    overall: tally(entries),
    byExercise: {
      identify: tally(entries.filter((e) => e.exercise === 'identify')),
      'identify-octave': tally(entries.filter((e) => e.exercise === 'identify-octave')),
      'identify-chroma': tally(entries.filter((e) => e.exercise === 'identify-chroma')),
      'anchor-tune': tally(entries.filter((e) => e.exercise === 'anchor-tune')),
      'sing-test': tally(entries.filter((e) => e.exercise === 'sing-test')),
    },
    byPitchClass,
  };
}

export interface TuneStats {
  rounds: number;
  /** Mean absolute error in cents. */
  meanMiss: number | null;
  /** Mean signed error in cents: positive means you tend to land sharp. */
  bias: number | null;
}

function tuneStatsOf(entries: readonly HistoryEntry[]): TuneStats {
  const cents = entries.flatMap((e) => (e.cents === null ? [] : [e.cents]));
  const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { rounds: cents.length, meanMiss: mean(cents.map(Math.abs)), bias: mean(cents) };
}

/** Anchor tune accuracy overall and on cold rounds, which show what you remember unaided. */
export function tuneStats(entries: readonly HistoryEntry[]): { all: TuneStats; cold: TuneStats } {
  const tune = entries.filter((e) => e.exercise === 'anchor-tune');
  return { all: tuneStatsOf(tune), cold: tuneStatsOf(tune.filter((e) => e.cold === true)) };
}

/** Validate stored history, dropping malformed entries. */
export function sanitizeHistory(input: unknown): HistoryEntry[] {
  if (!Array.isArray(input)) return [];
  const out: HistoryEntry[] = [];
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue;
    const e = raw as Record<string, unknown>;
    if (
      typeof e.date !== 'string' ||
      !HISTORY_EXERCISES.includes(e.exercise as HistoryExercise) ||
      (e.outcome !== 'correct' && e.outcome !== 'incorrect' && e.outcome !== 'no-detection') ||
      typeof e.targetMidi !== 'number' ||
      typeof e.responseMs !== 'number'
    ) {
      continue;
    }
    out.push({
      date: e.date,
      exercise: e.exercise as HistoryExercise,
      mixed: e.mixed === true,
      targetMidi: e.targetMidi,
      targetPitchClass: toPitchClass(e.targetMidi),
      outcome: e.outcome,
      answer: typeof e.answer === 'number' ? e.answer : null,
      comparisonMidi: typeof e.comparisonMidi === 'number' ? e.comparisonMidi : null,
      cents: typeof e.cents === 'number' ? e.cents : null,
      startMidi: typeof e.startMidi === 'number' ? e.startMidi : null,
      cold: typeof e.cold === 'boolean' ? e.cold : null,
      policy: e.policy === 'exact' || e.policy === 'pitch-class' ? e.policy : null,
      responseMs: e.responseMs,
    });
  }
  return out;
}

/** Upper bound on stored entries so localStorage never fills up. */
export const HISTORY_LIMIT = 5000;
