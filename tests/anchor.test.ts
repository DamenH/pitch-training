import { describe, expect, it } from 'vitest';
import {
  clampTune,
  COLD_GAP_MS,
  createTuneRound,
  evaluateTune,
  gradeTune,
  isCold,
  TUNE_EDGE_JITTER,
  TUNE_MIN_START_CENTS,
  TUNE_REACH,
  TUNE_START_SPREAD,
  tuneError,
} from '../src/domain/anchor';
import { entryFromTune, sanitizeHistory, summarize, tuneStats, type HistoryEntry } from '../src/domain/history';
import { defaultSettings, sanitizeSettings, type Settings } from '../src/domain/settings';
import type { Rng } from '../src/domain/exercise';

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...patch });

describe('tuneError', () => {
  it('measures from the nearest anchor in any octave', () => {
    expect(tuneError(60, 0)).toBe(0);
    expect(tuneError(72.35, 0)).toBeCloseTo(35);
    expect(tuneError(59.8, 0)).toBeCloseTo(-20);
    expect(tuneError(62, 0)).toBeCloseTo(200);
    expect(tuneError(69, 9)).toBe(0);
  });

  it('stays within half an octave', () => {
    for (let m = 40; m < 90; m += 0.37) {
      const e = tuneError(m, 7);
      expect(e).toBeGreaterThanOrEqual(-600);
      expect(e).toBeLessThan(600.0001);
    }
  });
});

describe('createTuneRound', () => {
  it('always reaches the anchor note and the octaves either side of it', () => {
    const rng = seeded(1);
    const s = settings({ anchorPitchClass: 4, anchorOctave: 4 });
    for (let i = 0; i < 500; i++) {
      const r = createTuneRound(s, rng, false);
      expect(r.target).toBe(64);
      expect(r.low).toBeLessThanOrEqual(64 - 12);
      expect(r.high).toBeGreaterThanOrEqual(64 + 12);
      expect(r.low).toBeGreaterThanOrEqual(64 - TUNE_REACH - TUNE_EDGE_JITTER);
      expect(r.high).toBeLessThanOrEqual(64 + TUNE_REACH + TUNE_EDGE_JITTER);
      expect(Math.abs(r.startMidi - 64)).toBeLessThanOrEqual(TUNE_START_SPREAD);
      expect(Math.abs(tuneError(r.startMidi, 4))).toBeGreaterThanOrEqual(TUNE_MIN_START_CENTS);
      expect(r.anchor).toBe(4);
      expect(r.exact).toBe(false);
    }
  });

  it('moves both ends of the range, so neither is a reference', () => {
    const rng = seeded(2);
    const rounds = Array.from({ length: 50 }, () => createTuneRound(settings(), rng, false));
    expect(new Set(rounds.map((r) => Math.round(r.low))).size).toBeGreaterThan(5);
    expect(new Set(rounds.map((r) => Math.round(r.high))).size).toBeGreaterThan(5);
  });

  it('stays audible at the lowest anchor octave', () => {
    const r = createTuneRound(settings({ anchorOctave: 2 }), () => 0, false);
    expect(r.low).toBeGreaterThanOrEqual(24);
  });
});

describe('grading', () => {
  it('uses fixed bands inside the tolerance', () => {
    expect(gradeTune(8, 50)).toBe('perfect');
    expect(gradeTune(-20, 50)).toBe('close');
    expect(gradeTune(50, 50)).toBe('found');
    expect(gradeTune(51, 50)).toBe('missed');
    expect(gradeTune(20, 15)).toBe('missed');
    expect(gradeTune(12, 15)).toBe('close');
  });

  it('evaluates against the anchor nearest the answer at the any-octave level', () => {
    const round = createTuneRound(settings(), seeded(3), true);
    const result = evaluateTune(round, 71.7, 50);
    expect(result.referenceMidi).toBe(72);
    expect(result.cents).toBeCloseTo(-30);
    expect(result.correct).toBe(true);
    expect(result.wrongOctave).toBe(false);
  });

  it('only counts the chosen octave at the exact level', () => {
    const round = createTuneRound(settings({ tuneLevel: 'exact' }), seeded(6), false);
    expect(round.exact).toBe(true);
    const hit = evaluateTune(round, 60.1, 50);
    expect(hit).toMatchObject({ referenceMidi: 60, correct: true, wrongOctave: false });
    const octaveOff = evaluateTune(round, 72.05, 50);
    expect(octaveOff.referenceMidi).toBe(60);
    expect(octaveOff.cents).toBeCloseTo(1205);
    expect(octaveOff.pitchClassCents).toBeCloseTo(5);
    expect(octaveOff).toMatchObject({ nearestMidi: 72, grade: 'missed', correct: false, wrongOctave: true });
    expect(evaluateTune(round, 74, 50).wrongOctave).toBe(false);
  });

  it('clamps dragging to the range', () => {
    const round = createTuneRound(settings(), seeded(4), false);
    expect(clampTune(round, round.low - 3)).toBe(round.low);
    expect(clampTune(round, round.high + 1)).toBe(round.high);
  });
});

describe('cold rounds', () => {
  it('are cold after an hour with nothing answered', () => {
    const now = 10 * COLD_GAP_MS;
    expect(isCold(undefined, now)).toBe(true);
    expect(isCold(now - COLD_GAP_MS, now)).toBe(true);
    expect(isCold(now - 1000, now)).toBe(false);
  });
});

describe('anchor history', () => {
  const round = { ...createTuneRound(settings(), seeded(5), true), startMidi: 63.456 };
  const entry = entryFromTune(round, evaluateTune(round, 59.8, 50), { responseMs: 4200, date: new Date(0) });

  it('records the error, start and cold flag', () => {
    expect(entry).toMatchObject({
      exercise: 'anchor-tune',
      targetMidi: 60,
      targetPitchClass: 0,
      outcome: 'correct',
      answer: 59.8,
      cents: -20,
      startMidi: 63.46,
      cold: true,
      exact: false,
    });
    expect(sanitizeHistory([entry])).toEqual([entry]);
  });

  it('summarizes miss and bias, overall and cold', () => {
    const warm: HistoryEntry = { ...entry, cents: 40, cold: false };
    const stats = tuneStats([entry, warm]);
    expect(stats.all).toEqual({ rounds: 2, meanMiss: 30, bias: 10 });
    expect(stats.cold).toEqual({ rounds: 1, meanMiss: 20, bias: -20 });
  });

  it('records the error from the nearest anchor at the exact level', () => {
    const exact = createTuneRound(settings({ tuneLevel: 'exact' }), seeded(7), false);
    const e = entryFromTune(exact, evaluateTune(exact, 72.2, 50), { responseMs: 1000 });
    expect(e).toMatchObject({ exact: true, outcome: 'incorrect', targetMidi: 60, cents: 20 });
  });

  it('does not count tuning towards note accuracy', () => {
    expect(summarize([entry]).byPitchClass[0].answered).toBe(0);
    expect(summarize([entry]).byExercise['anchor-tune'].answered).toBe(1);
  });
});

describe('anchor settings', () => {
  it('sanitizes the anchor options', () => {
    const s = sanitizeSettings({
      anchorPitchClass: 14,
      anchorOctave: 9,
      tuneLevel: 'hard',
      tuneAutoStrike: 1,
      tuneToleranceCents: 500,
      tuneMasker: 'yes',
    });
    expect(s.anchorPitchClass).toBe(2);
    expect(s.anchorOctave).toBe(6);
    expect(s.tuneLevel).toBe('any');
    expect(s.tuneAutoStrike).toBe(false);
    expect(s.tuneToleranceCents).toBe(100);
    expect(s.tuneMasker).toBe(true);
  });
});
