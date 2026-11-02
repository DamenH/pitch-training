// Tune tempo: turn a metronome's rate until it is the target tempo, then compare.
//   TempoRound (generated)  →  answer tempo (locked in)  →  TempoTuneResult (evaluated)
// At the anchor level the target is your one remembered tempo; at the shown level a target
// written as Settings → Tempo says (a term counts anywhere in its band).

import type { Rng } from './exercise';
import type { Settings } from './settings';
import { BPM_MAX, BPM_MIN, createTempoTarget, evaluateTempo, type TempoResult, type TempoTarget } from './tempo';

/** The control reaches from this fraction of the target to this multiple of it, before jitter. */
export const TEMPO_REACH_LOW = 0.6;
export const TEMPO_REACH_HIGH = 1.6;
/** Each end moves by up to this fraction a round, so an end is never a reference. */
export const TEMPO_EDGE_JITTER = 0.05;
/** Rounds never start within this fraction of the target, so there is always some tuning to do. */
export const TEMPO_MIN_START = 0.1;
export const TEMPO_PERFECT_PCT = 1;
export const TEMPO_CLOSE_PCT = 2.5;

export interface TempoRound {
  id: string;
  target: TempoTarget;
  /** The anchor level: the target is your anchor tempo. */
  anchor: boolean;
  /** Tempos the control reaches (BPM). */
  low: number;
  high: number;
  startBpm: number;
  /** Nothing tempo-related answered in the last hour when the round began. */
  cold: boolean;
  createdAt: number;
}

let idCounter = 0;

export function createTempoRound(
  settings: Settings,
  rng: Rng,
  cold: boolean,
  previous?: TempoTarget,
  now: number = Date.now(),
): TempoRound {
  idCounter++;
  const anchor = settings.tempoTuneLevel === 'anchor';
  const target: TempoTarget = anchor
    ? { bpm: settings.tempoAnchorBpm, style: 'mark', term: null }
    : createTempoTarget(settings, rng, previous);
  const jitter = () => 1 + (rng() * 2 - 1) * TEMPO_EDGE_JITTER;
  const low = Math.max(BPM_MIN, target.bpm * TEMPO_REACH_LOW * jitter());
  const high = Math.min(BPM_MAX, target.bpm * TEMPO_REACH_HIGH * jitter());
  // Log-uniform, so slower and faster starts are equally likely.
  const pickStart = () => low * (high / low) ** rng();
  const farEnough = (bpm: number) =>
    Math.abs(Math.log(bpm / target.bpm)) >= Math.log(1 + TEMPO_MIN_START) && !evaluateTempo(target, bpm, 0).correct;
  let startBpm = pickStart();
  for (let i = 0; i < 100 && !farEnough(startBpm); i++) startBpm = pickStart();
  if (!farEnough(startBpm)) startBpm = target.bpm * 1.25 <= high ? target.bpm * 1.25 : target.bpm * 0.75;
  return {
    id: `${now.toString(36)}-m${idCounter}`,
    target,
    anchor,
    low,
    high,
    startBpm: clampTempo({ low, high }, startBpm),
    cold,
    createdAt: now,
  };
}

/** Keep a turned tempo inside the round's range. */
export function clampTempo(round: Pick<TempoRound, 'low' | 'high'>, bpm: number): number {
  return Math.min(round.high, Math.max(round.low, bpm));
}

/** Turning works in proportion: `pct` moves the tempo the same amount at 60 BPM as at 180. */
export function turnTempo(bpm: number, pct: number): number {
  return bpm * Math.exp(pct / 100);
}

export type TempoGrade = 'perfect' | 'close' | 'found' | 'missed';

export interface TempoTuneResult extends TempoResult {
  grade: TempoGrade;
}

/** Perfect and close are fixed bands inside the tolerance; a term target is found anywhere in its band. */
export function evaluateTempoTune(round: TempoRound, bpm: number, tolerancePct: number): TempoTuneResult {
  const result = evaluateTempo(round.target, bpm, tolerancePct);
  const abs = Math.abs(result.errorPct);
  let grade: TempoGrade;
  if (!result.correct) grade = 'missed';
  else if (round.target.term !== null) grade = 'found';
  else if (abs <= Math.min(TEMPO_PERFECT_PCT, tolerancePct) + 1e-9) grade = 'perfect';
  else if (abs <= Math.min(TEMPO_CLOSE_PCT, tolerancePct) + 1e-9) grade = 'close';
  else grade = 'found';
  return { ...result, grade };
}
