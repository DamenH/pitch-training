import { describe, expect, it } from 'vitest';
import {
  clampTune,
  COLD_GAP_MS,
  createTuneRound,
  evaluateTune,
  gradeTune,
  isCold,
  TUNE_MIN_START_CENTS,
  TUNE_SPAN,
  tuneError,
  tuneWindow,
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
  it('keeps the range inside the Identify octaves and always reaches an anchor', () => {
    const rng = seeded(1);
    const s = settings({ playbackOctaveMin: 3, playbackOctaveMax: 5, anchorPitchClass: 4 });
    for (let i = 0; i < 500; i++) {
      const r = createTuneRound(s, rng, false);
      expect(r.low).toBeGreaterThanOrEqual(48);
      expect(r.low + TUNE_SPAN).toBeLessThanOrEqual(84);
      expect(r.startMidi).toBeGreaterThanOrEqual(r.low);
      expect(r.startMidi).toBeLessThanOrEqual(r.low + TUNE_SPAN);
      expect(Math.abs(tuneError(r.startMidi, 4))).toBeGreaterThanOrEqual(TUNE_MIN_START_CENTS);
      expect(r.anchor).toBe(4);
    }
  });

  it('widens a single octave to the full span around it', () => {
    const low = tuneWindow(settings({ playbackOctaveMin: 4, playbackOctaveMax: 4 }), () => 0.5);
    expect(low).toBe(60 + 6 - TUNE_SPAN / 2);
  });

  it('varies where the range sits, so no position gives the anchor away', () => {
    const rng = seeded(2);
    const lows = new Set(Array.from({ length: 50 }, () => Math.round(createTuneRound(settings(), rng, false).low)));
    expect(lows.size).toBeGreaterThan(5);
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

  it('evaluates against the anchor nearest the answer', () => {
    const round = createTuneRound(settings(), seeded(3), true);
    const result = evaluateTune(round, 71.7, 50);
    expect(result.referenceMidi).toBe(72);
    expect(result.cents).toBeCloseTo(-30);
    expect(result.correct).toBe(true);
  });

  it('clamps dragging to the range', () => {
    const round = createTuneRound(settings(), seeded(4), false);
    expect(clampTune(round, round.low - 3)).toBe(round.low);
    expect(clampTune(round, round.low + TUNE_SPAN + 1)).toBe(round.low + TUNE_SPAN);
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
    });
    expect(sanitizeHistory([entry])).toEqual([entry]);
  });

  it('summarizes miss and bias, overall and cold', () => {
    const warm: HistoryEntry = { ...entry, cents: 40, cold: false };
    const stats = tuneStats([entry, warm]);
    expect(stats.all).toEqual({ rounds: 2, meanMiss: 30, bias: 10 });
    expect(stats.cold).toEqual({ rounds: 1, meanMiss: 20, bias: -20 });
  });

  it('does not count tuning towards note accuracy', () => {
    expect(summarize([entry]).byPitchClass[0].answered).toBe(0);
    expect(summarize([entry]).byExercise['anchor-tune'].answered).toBe(1);
  });
});

describe('anchor settings', () => {
  it('sanitizes the anchor options', () => {
    const s = sanitizeSettings({ anchorPitchClass: 14, tuneWaveform: 'piano', tuneToleranceCents: 500, tuneMasker: 'yes' });
    expect(s.anchorPitchClass).toBe(2);
    expect(s.tuneWaveform).toBe('soft');
    expect(s.tuneToleranceCents).toBe(100);
    expect(s.tuneMasker).toBe(true);
  });
});
