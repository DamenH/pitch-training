// Tempo: beats per minute (quarter-note beats), the Italian terms written on sheet music,
// metronome beat scheduling, tap analysis and tempo exercises. Pure, so it is fully unit-tested.

import type { Rng } from './exercise';
import type { Settings, TempoTargetStyle } from './settings';

export const BPM_MIN = 40;
export const BPM_MAX = 208;

export interface TempoTerm {
  name: string;
  meaning: string;
  /** The conventional range, as books give it: approximate, and overlapping its neighbours. */
  range: readonly [number, number | null];
  /** Disjoint and contiguous across BPM_MIN–BPM_MAX: used wherever exactly one term must be chosen. */
  band: readonly [number, number];
}

export const TEMPO_TERMS: readonly TempoTerm[] = [
  { name: 'Grave', meaning: 'very slow, solemn', range: [25, 45], band: [40, 44] },
  { name: 'Largo', meaning: 'broad', range: [40, 60], band: [45, 59] },
  { name: 'Adagio', meaning: 'at ease', range: [55, 75], band: [60, 75] },
  { name: 'Andante', meaning: 'at a walking pace', range: [75, 105], band: [76, 103] },
  { name: 'Moderato', meaning: 'moderate', range: [100, 120], band: [104, 115] },
  { name: 'Allegretto', meaning: 'fairly fast', range: [105, 125], band: [116, 119] },
  { name: 'Allegro', meaning: 'fast, bright', range: [120, 155], band: [120, 155] },
  { name: 'Vivace', meaning: 'lively', range: [150, 175], band: [156, 175] },
  { name: 'Presto', meaning: 'very fast', range: [170, 200], band: [176, 199] },
  { name: 'Prestissimo', meaning: 'as fast as possible', range: [200, null], band: [200, 208] },
];

/** Words for a tempo that changes, shown alongside the terms. */
export const TEMPO_CHANGES: readonly { name: string; meaning: string }[] = [
  { name: 'accelerando', meaning: 'gradually faster' },
  { name: 'ritardando, rallentando', meaning: 'gradually slower' },
  { name: 'a tempo', meaning: 'back to the original speed' },
  { name: 'rubato', meaning: 'flexible timing, pushed and pulled' },
  { name: 'più mosso, meno mosso', meaning: 'more motion, less motion' },
];

export function clampBpm(bpm: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

/** The one term whose band holds this tempo (rounded, and clamped into the bands). */
export function termForBpm(bpm: number): TempoTerm {
  const b = clampBpm(bpm);
  return TEMPO_TERMS.find((t) => b >= t.band[0] && b <= t.band[1])!;
}

export function termByName(name: string): TempoTerm | undefined {
  return TEMPO_TERMS.find((t) => t.name === name);
}

export function bandCentre(term: TempoTerm): number {
  return Math.round((term.band[0] + term.band[1]) / 2);
}

/** "40–60", or "200+" for an open range. */
export function formatRange(term: TempoTerm): string {
  const [low, high] = term.range;
  return high === null ? `${low}+` : `${low}–${high}`;
}

/** A metronome mark as printed on sheet music: ♩ = 96. */
export function formatMark(bpm: number): string {
  return `♩ = ${Math.round(bpm)}`;
}

/**
 * The beats to schedule after `lastBeat` up to (not including) `horizon`, `60 / bpm` apart.
 * A beat that would already be in the past (the tempo was just raised a lot) moves to `now`,
 * so changing tempo never doubles a beat, drops a run of beats, or schedules one late.
 */
export function beatsUntil(lastBeat: number, bpm: number, now: number, horizon: number): number[] {
  const step = 60 / bpm;
  const beats: number[] = [];
  let t = Math.max(lastBeat + step, now);
  while (t < horizon) {
    beats.push(t);
    t += step;
  }
  return beats;
}

/** Offsets (s) for `count` beats at a steady tempo, the first at 0. */
export function steadyBeats(bpm: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i * 60) / bpm);
}

/** Taps further apart than this (ms) start a new run: slower than the slowest tempo. */
export const TAP_RESTART_MS = 2000;
/** Tap tempo listens to this many of the latest intervals. */
export const TAP_WINDOW = 8;

export interface TapAnalysis {
  bpm: number;
  /** The intervals used, in ms. */
  intervals: number[];
  /** Coefficient of variation of the intervals: 0 is perfectly even. */
  cv: number;
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Tempo from tap times (ms, ascending): the median of the latest intervals, so one sloppy tap
 * barely moves it. A gap longer than TAP_RESTART_MS starts over. Null until there are two taps.
 */
export function analyzeTaps(times: readonly number[], window = TAP_WINDOW): TapAnalysis | null {
  let start = 0;
  for (let i = 1; i < times.length; i++) if (times[i]! - times[i - 1]! > TAP_RESTART_MS) start = i;
  const run = times.slice(start);
  if (run.length < 2) return null;
  const intervals = run.slice(1).map((t, i) => t - run[i]!).slice(-window);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const sd = Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length);
  return { bpm: 60000 / median(intervals), intervals, cv: mean > 0 ? sd / mean : 0 };
}

// ---------------------------------------------------------------- exercises

/** Terms used as targets and answers: Allegretto's band is too narrow to judge by ear. */
export const TARGET_TERMS: readonly TempoTerm[] = TEMPO_TERMS.filter((t) => t.name !== 'Allegretto');
/** A new number target differs from the last one by at least this fraction. */
const MIN_CHANGE = 0.08;

export interface TempoTarget {
  bpm: number;
  /** How the target is written. For a term, any tempo in its band counts and `bpm` is the band's centre. */
  style: TempoTargetStyle;
  term: string | null;
}

/** A target tempo within the range in Settings, clearly different from the previous one. */
export function createTempoTarget(settings: Settings, rng: Rng, previous?: TempoTarget): TempoTarget {
  const { tempoMin: min, tempoMax: max, tempoTargetStyle: style } = settings;
  if (style === 'term') {
    const inRange = TARGET_TERMS.filter((t) => t.band[0] <= max && t.band[1] >= min);
    const pool = inRange.length > 0 ? inRange : [termForBpm((min + max) / 2)];
    const fresh = pool.filter((t) => t.name !== previous?.term);
    const term = pick(fresh.length > 0 ? fresh : pool, rng);
    return { bpm: bandCentre(term), style, term: term.name };
  }
  let bpm = min;
  for (let i = 0; i < 50; i++) {
    bpm = min + Math.floor(rng() * (max - min + 1));
    if (!previous || Math.abs(bpm / previous.bpm - 1) >= MIN_CHANGE) break;
  }
  return { bpm, style, term: null };
}

/** A term's band as continuous tempos [low, high), matching how termForBpm rounds. */
function bandEdges(term: TempoTerm): [number, number] {
  return [term.band[0] - 0.5, term.band[1] + 0.5];
}

/** Signed % from the target (positive is fast); for a term, from the nearer edge of its band, 0 inside. */
export function tempoError(bpm: number, target: TempoTarget): number {
  const term = target.term === null ? undefined : termByName(target.term);
  if (!term) return (bpm / target.bpm - 1) * 100;
  const [low, high] = bandEdges(term);
  if (bpm < low) return (bpm / low - 1) * 100;
  if (bpm >= high) return (bpm / high - 1) * 100;
  return 0;
}

export interface TempoResult {
  bpm: number;
  errorPct: number;
  correct: boolean;
}

/** A term target counts anywhere in its band; a number within the tolerance in %. */
export function evaluateTempo(target: TempoTarget, bpm: number, tolerancePct: number): TempoResult {
  const errorPct = tempoError(bpm, target);
  const term = target.term === null ? undefined : termByName(target.term);
  let correct: boolean;
  if (term) {
    const [low, high] = bandEdges(term);
    correct = bpm >= low && bpm < high;
  } else {
    // A hair of slack, so 105 against 100 (5.000000000000004%) is within ±5%.
    correct = Math.abs(errorPct) <= tolerancePct + 1e-9;
  }
  return { bpm, errorPct, correct };
}

export type Steadiness = 'steady' | 'a little uneven' | 'uneven';

export function steadiness(cv: number): Steadiness {
  return cv < 0.03 ? 'steady' : cv < 0.06 ? 'a little uneven' : 'uneven';
}

/** "5.2% fast", "3% slow", "on tempo". */
export function describeTempoError(errorPct: number): string {
  const abs = Math.abs(errorPct);
  if (abs < 0.05) return 'on tempo';
  const shown = abs < 10 ? abs.toFixed(1).replace(/\.0$/, '') : Math.round(abs).toString();
  return `${shown}% ${errorPct > 0 ? 'fast' : 'slow'}`;
}

/** About this long (s) of clicks at random, uneven gaps: no steady pulse survives into the next round. */
export const TEMPO_SCRAMBLE_SECONDS = 2.5;

export function generateTempoScramble(rng: Rng): number[] {
  const offsets: number[] = [];
  for (let at = 0; at < TEMPO_SCRAMBLE_SECONDS; at += 0.12 + rng() * 0.48) offsets.push(at);
  return offsets;
}

/** Identify tempo by term: the choices, coarse enough to judge by ear. */
export const ANSWER_TERMS: readonly TempoTerm[] = TEMPO_TERMS.filter((t) =>
  ['Largo', 'Adagio', 'Andante', 'Moderato', 'Allegro', 'Vivace', 'Presto'].includes(t.name),
);
/** Identify tempo by term: targets keep at least this fraction clear of their band's edges. */
const EDGE_MARGIN = 0.04;

/** Where a term's targets may lie: inside the range and clear of the band's edges. Null if nowhere. */
function termWindow(term: TempoTerm, settings: Settings): [number, number] | null {
  const [edgeLow, edgeHigh] = bandEdges(term);
  const low = Math.max(edgeLow * (1 + EDGE_MARGIN), settings.tempoMin);
  const high = Math.min(edgeHigh / (1 + EDGE_MARGIN), settings.tempoMax);
  return Math.ceil(low) <= Math.floor(high) ? [Math.ceil(low), Math.floor(high)] : null;
}

/** The term choices for a tempo range: those with room for a target clear of their edges. */
export function answerTermsFor(settings: Settings): TempoTerm[] {
  const playable = ANSWER_TERMS.filter((t) => termWindow(t, settings) !== null);
  return playable.length > 0 ? playable : [termForBpm((settings.tempoMin + settings.tempoMax) / 2)];
}

/**
 * A tempo to identify. Answered by term, it lies inside one of the choices' bands, clear of the
 * edges so no tempo sits on a boundary; answered by number, anywhere in the range.
 */
export function createIdentifyTempoTarget(settings: Settings, rng: Rng, previous?: TempoTarget): TempoTarget {
  if (settings.tempoIdentifyAnswer === 'number') {
    return { ...createTempoTarget({ ...settings, tempoTargetStyle: 'number' }, rng, previous), term: null };
  }
  const terms = answerTermsFor(settings);
  const fresh = terms.filter((t) => t.name !== previous?.term);
  const term = pick(fresh.length > 0 ? fresh : terms, rng);
  const window = termWindow(term, settings);
  const bpm = window ? window[0] + Math.floor(rng() * (window[1] - window[0] + 1)) : bandCentre(term);
  return { bpm, style: 'term', term: term.name };
}
