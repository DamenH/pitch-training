// Live pitch observations → reliable readings → stable pitches.
// Everything here is pure and driven by explicit timestamps, so it can be tested
// with synthetic observation sequences instead of real microphone input.

import { frequencyToMidi } from './music';

/** One raw analysis frame from the pitch detector. */
export interface PitchObservation {
  /** Milliseconds (any monotonic clock). */
  time: number;
  /** Detected fundamental in Hz, or 0 when the detector found none. */
  frequency: number;
  /** Detector clarity, 0–1 (McLeod "clarity"). */
  clarity: number;
  /** RMS level of the frame, 0–1. */
  rms: number;
}

export interface DetectorConfig {
  minClarity: number;
  minRms: number;
  minFrequency: number;
  maxFrequency: number;
  /** How long a pitch must be held to count as stable. */
  stableWindowMs: number;
  /** Max deviation from the window median, in cents, for a frame to count as consistent. */
  maxSpreadCents: number;
  /** Share of frames in the window that must be consistent. */
  minConsistentRatio: number;
  /** Minimum number of reliable frames in the window. */
  minFrames: number;
  /** A run of voiced sound survives dropouts shorter than this. */
  maxGapMs: number;
  /** Frames used for the smoothed live reading. */
  smoothingWindowMs: number;
}

export const DEFAULT_DETECTOR_CONFIG: Readonly<DetectorConfig> = Object.freeze({
  minClarity: 0.85,
  minRms: 0.006,
  minFrequency: 55, // ~A1, below a typical bass's comfortable range
  maxFrequency: 1600, // ~G6
  stableWindowMs: 250,
  maxSpreadCents: 35,
  minConsistentRatio: 0.8,
  minFrames: 5,
  maxGapMs: 90,
  smoothingWindowMs: 120,
});

export type ObservationQuality = 'silent' | 'unclear' | 'out-of-range' | 'reliable';

export function classifyObservation(obs: PitchObservation, cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG): ObservationQuality {
  if (!(obs.rms >= cfg.minRms)) return 'silent';
  if (!(obs.frequency > 0) || !(obs.clarity >= cfg.minClarity)) return 'unclear';
  if (obs.frequency < cfg.minFrequency || obs.frequency > cfg.maxFrequency) return 'out-of-range';
  return 'reliable';
}

export function isReliable(obs: PitchObservation, cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG): boolean {
  return classifyObservation(obs, cfg) === 'reliable';
}

/** A pitch that was held consistently for at least `stableWindowMs`. */
export interface StablePitch {
  frequency: number;
  /** Fractional MIDI note. */
  midi: number;
  /** Time of the most recent frame that confirmed this pitch. */
  time: number;
  /** When the current stable stretch began. */
  since: number;
}

export type LiveStatus = 'silent' | 'unclear' | 'out-of-range' | 'unstable' | 'stable';

export interface LiveState {
  status: LiveStatus;
  /** Smoothed recent reading (median of the last few reliable frames), if any. */
  smoothed: { frequency: number; midi: number } | null;
  /** The pitch currently being held, if stable right now. */
  stable: StablePitch | null;
  /** Last raw frame, for diagnostics. */
  raw: PitchObservation | null;
}

export type LatestStableResult =
  | { kind: 'ok'; pitch: StablePitch; ageMs: number }
  | { kind: 'stale'; pitch: StablePitch; ageMs: number }
  | { kind: 'none' };

interface Frame {
  time: number;
  frequency: number;
  midi: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Tracks a run of voiced frames and decides when the pitch is stable.
 *
 * - Unreliable frames (silence, noise, low clarity) are never turned into notes.
 * - Short dropouts (< maxGapMs) do not break a run; longer ones end it.
 * - Stability requires the run to have lasted `stableWindowMs` and most frames in
 *   that window to sit within `maxSpreadCents` of their median. A momentary octave
 *   jump or glitch is outvoted rather than accepted.
 * - The most recent stable pitch is remembered after the voice stops, so it can
 *   be submitted shortly afterwards; callers decide how old is too old.
 */
export class StablePitchTracker {
  private run: Frame[] = [];
  private lastReliableTime = -Infinity;
  private currentStable: StablePitch | null = null;
  private lastStable: StablePitch | null = null;
  private lastRaw: PitchObservation | null = null;
  private lastQuality: ObservationQuality = 'silent';
  readonly config: DetectorConfig;

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  }

  reset(): void {
    this.run = [];
    this.lastReliableTime = -Infinity;
    this.currentStable = null;
    this.lastStable = null;
    this.lastRaw = null;
    this.lastQuality = 'silent';
  }

  push(obs: PitchObservation): LiveState {
    const cfg = this.config;
    this.lastRaw = obs;
    this.lastQuality = classifyObservation(obs, cfg);

    if (this.lastQuality === 'reliable') {
      if (obs.time - this.lastReliableTime > cfg.maxGapMs) this.run = [];
      this.lastReliableTime = obs.time;
      this.run.push({ time: obs.time, frequency: obs.frequency, midi: frequencyToMidi(obs.frequency) });
      // Keep only what the stability window needs (plus one frame to prove duration).
      const cutoff = obs.time - cfg.stableWindowMs;
      while (this.run.length > 1 && this.run[1]!.time <= cutoff) this.run.shift();
    } else if (obs.time - this.lastReliableTime > cfg.maxGapMs) {
      this.run = [];
    }

    this.currentStable = this.evaluateStability(obs.time);
    if (this.currentStable) this.lastStable = this.currentStable;
    return this.state(obs.time);
  }

  private evaluateStability(now: number): StablePitch | null {
    const cfg = this.config;
    const first = this.run[0];
    if (!first || now - this.lastReliableTime > cfg.maxGapMs) return null;
    if (now - first.time < cfg.stableWindowMs) return null;

    const window = this.run.filter((f) => f.time >= now - cfg.stableWindowMs);
    if (window.length < cfg.minFrames) return null;

    const centre = median(window.map((f) => f.midi));
    const consistent = window.filter((f) => Math.abs(f.midi - centre) * 100 <= cfg.maxSpreadCents);
    if (consistent.length / window.length < cfg.minConsistentRatio) return null;

    const midi = median(consistent.map((f) => f.midi));
    const frequency = median(consistent.map((f) => f.frequency));
    // Continue the existing stable stretch if the pitch hasn't moved.
    const prev = this.currentStable;
    const continuing = prev !== null && Math.abs(prev.midi - midi) * 100 <= cfg.maxSpreadCents;
    return { frequency, midi, time: this.lastReliableTime, since: continuing ? prev.since : window[0]!.time };
  }

  private state(now: number): LiveState {
    const cfg = this.config;
    const recent = this.run.filter((f) => f.time >= now - cfg.smoothingWindowMs);
    const smoothed =
      recent.length > 0 && now - this.lastReliableTime <= cfg.maxGapMs
        ? { frequency: median(recent.map((f) => f.frequency)), midi: median(recent.map((f) => f.midi)) }
        : null;

    let status: LiveStatus;
    if (this.currentStable) status = 'stable';
    else if (smoothed) status = 'unstable';
    else status = this.lastQuality === 'reliable' ? 'unstable' : this.lastQuality;

    return { status, smoothed, stable: this.currentStable, raw: this.lastRaw };
  }

  /**
   * The most recent stable pitch, classified by age. A pitch that is being held
   * right now has age 0; one that ended more than `maxAgeMs` ago is 'stale'.
   */
  latestStable(now: number, maxAgeMs: number): LatestStableResult {
    const p = this.lastStable;
    if (!p) return { kind: 'none' };
    const ageMs = Math.max(0, now - p.time);
    return ageMs <= maxAgeMs ? { kind: 'ok', pitch: p, ageMs } : { kind: 'stale', pitch: p, ageMs };
  }
}

/** How long after singing stops a stable pitch can still be submitted. */
export const STABLE_RETENTION_MS = 2000;
