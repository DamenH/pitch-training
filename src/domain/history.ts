import { ALL_PITCH_CLASSES, toPitchClass, type PitchClass } from './music';
import type { ExerciseResult, Question } from './exercise';
import type { ScoringPolicy } from './settings';

export type HistoryExercise = 'identify' | 'sing-test';
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
  /** Identify: chosen pitch class. Sing: nearest note sung (MIDI). */
  answer: number | null;
  /** Sing only: signed deviation from the reference, in cents. */
  cents: number | null;
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
  return {
    ...common,
    exercise: 'sing-test',
    outcome: result.outcome,
    answer: result.outcome === 'no-detection' ? null : result.comparison.detectedMidi,
    cents: result.outcome === 'no-detection' ? null : Math.round(result.comparison.cents),
    policy: result.policy,
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
  const byPitchClass = {} as Record<PitchClass, Tally>;
  for (const pc of ALL_PITCH_CLASSES) byPitchClass[pc] = tally(entries.filter((e) => e.targetPitchClass === pc));
  return {
    overall: tally(entries),
    byExercise: {
      identify: tally(entries.filter((e) => e.exercise === 'identify')),
      'sing-test': tally(entries.filter((e) => e.exercise === 'sing-test')),
    },
    byPitchClass,
  };
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
      (e.exercise !== 'identify' && e.exercise !== 'sing-test') ||
      (e.outcome !== 'correct' && e.outcome !== 'incorrect' && e.outcome !== 'no-detection') ||
      typeof e.targetMidi !== 'number' ||
      typeof e.responseMs !== 'number'
    ) {
      continue;
    }
    out.push({
      date: e.date,
      exercise: e.exercise,
      mixed: e.mixed === true,
      targetMidi: e.targetMidi,
      targetPitchClass: toPitchClass(e.targetMidi),
      outcome: e.outcome,
      answer: typeof e.answer === 'number' ? e.answer : null,
      cents: typeof e.cents === 'number' ? e.cents : null,
      policy: e.policy === 'exact' || e.policy === 'pitch-class' ? e.policy : null,
      responseMs: e.responseMs,
    });
  }
  return out;
}

/** Upper bound on stored entries so localStorage never fills up. */
export const HISTORY_LIMIT = 5000;
