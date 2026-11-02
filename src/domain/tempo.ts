// Tempo: beats per minute (quarter-note beats), the Italian terms written on sheet music,
// metronome beat scheduling and tap analysis. Pure, so it is fully unit-tested.

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
