import { describe, expect, it } from 'vitest';
import {
  clampTempo,
  createTempoRound,
  evaluateTempoTune,
  TEMPO_MIN_START,
  turnTempo,
} from '../src/domain/tempoTune';
import { defaultSettings, sanitizeSettings } from '../src/domain/settings';
import { BPM_MAX, BPM_MIN, evaluateTempo, termByName } from '../src/domain/tempo';
import { entryFromTempo, lastAnswerAt, type HistoryEntry } from '../src/domain/history';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tempo tune rounds', () => {
  it('tunes to the anchor tempo at the anchor level, starting well away from it', () => {
    const rng = seeded(1);
    const settings = { ...defaultSettings(), tempoAnchorBpm: 90 };
    for (let i = 0; i < 300; i++) {
      const r = createTempoRound(settings, rng, false);
      expect(r.anchor).toBe(true);
      expect(r.target).toEqual({ bpm: 90, style: 'mark', term: null });
      expect(r.low).toBeLessThan(90);
      expect(r.high).toBeGreaterThan(90);
      expect(r.startBpm).toBeGreaterThanOrEqual(r.low);
      expect(r.startBpm).toBeLessThanOrEqual(r.high);
      expect(Math.abs(Math.log(r.startBpm / 90))).toBeGreaterThanOrEqual(Math.log(1 + TEMPO_MIN_START) - 1e-9);
    }
  });

  it('keeps the range inside the metronome and moves its ends from round to round', () => {
    const rng = seeded(2);
    const lows = new Set<number>();
    for (const bpm of [BPM_MIN, 120, BPM_MAX]) {
      for (let i = 0; i < 50; i++) {
        const r = createTempoRound({ ...defaultSettings(), tempoAnchorBpm: bpm }, rng, false);
        expect(r.low).toBeGreaterThanOrEqual(BPM_MIN);
        expect(r.high).toBeLessThanOrEqual(BPM_MAX);
        expect(r.target.bpm).toBeGreaterThanOrEqual(r.low);
        expect(r.target.bpm).toBeLessThanOrEqual(r.high);
        if (bpm === 120) lows.add(Math.round(r.low * 10));
      }
    }
    expect(lows.size).toBeGreaterThan(10);
  });

  it("uses a shown target at the shown level, starting outside a term target's band", () => {
    const rng = seeded(3);
    const settings = { ...defaultSettings(), tempoTuneLevel: 'shown' as const, tempoTargetStyle: 'term' as const };
    for (let i = 0; i < 200; i++) {
      const r = createTempoRound(settings, rng, true);
      expect(r.anchor).toBe(false);
      expect(r.cold).toBe(true);
      expect(termByName(r.target.term!)).toBeDefined();
      expect(evaluateTempo(r.target, r.startBpm, 0).correct).toBe(false);
    }
  });

  it('turns in proportion and clamps to the range', () => {
    expect(turnTempo(100, 10)).toBeCloseTo(110.517, 3);
    expect(turnTempo(turnTempo(100, 10), -10)).toBeCloseTo(100, 9);
    expect(clampTempo({ low: 70, high: 190 }, 60)).toBe(70);
    expect(clampTempo({ low: 70, high: 190 }, 200)).toBe(190);
  });

  it('grades by % within the tolerance, and finds a term anywhere in its band', () => {
    const round = createTempoRound({ ...defaultSettings(), tempoAnchorBpm: 100 }, seeded(4), false);
    expect(evaluateTempoTune(round, 101, 5).grade).toBe('perfect');
    expect(evaluateTempoTune(round, 97.5, 5).grade).toBe('close');
    expect(evaluateTempoTune(round, 105, 5)).toMatchObject({ grade: 'found', correct: true });
    expect(evaluateTempoTune(round, 106, 5)).toMatchObject({ grade: 'missed', correct: false });
    // A tight tolerance caps the bands.
    expect(evaluateTempoTune(round, 101.5, 1).grade).toBe('missed');
    const termRound = { ...round, target: { bpm: 90, style: 'term' as const, term: 'Andante' } };
    expect(evaluateTempoTune(termRound, 77, 5)).toMatchObject({ grade: 'found', errorPct: 0 });
    expect(evaluateTempoTune(termRound, 110, 5).grade).toBe('missed');
  });

  it('validates the tune tempo settings', () => {
    expect(sanitizeSettings({ tempoAnchorBpm: 96.4, tempoTuneLevel: 'shown' })).toMatchObject({
      tempoAnchorBpm: 96,
      tempoTuneLevel: 'shown',
    });
    expect(sanitizeSettings({ tempoAnchorBpm: 5, tempoTuneLevel: 'x' })).toMatchObject({
      tempoAnchorBpm: BPM_MIN,
      tempoTuneLevel: 'anchor',
    });
  });
});

describe('lastAnswerAt', () => {
  it('finds the latest matching answer', () => {
    const target = { bpm: 100, style: 'number' as const, term: null };
    const tempo = entryFromTempo('tune-tempo', target, { bpm: 100, errorPct: 0, correct: true }, {
      responseMs: 1,
      date: new Date('2026-11-02T10:00:00Z'),
    });
    const pitch = { ...tempo, exercise: 'identify', date: '2026-11-02T11:00:00.000Z' } as HistoryEntry;
    const entries = [tempo, pitch];
    expect(lastAnswerAt(entries, (e) => e.exercise === 'tune-tempo')).toBe(Date.parse('2026-11-02T10:00:00Z'));
    expect(lastAnswerAt(entries, () => true)).toBe(Date.parse('2026-11-02T11:00:00Z'));
    expect(lastAnswerAt(entries, () => false)).toBeUndefined();
  });
});
