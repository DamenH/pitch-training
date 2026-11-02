import { describe, expect, it } from 'vitest';
import {
  analyzeTaps,
  answerTermsFor,
  createIdentifyTempoTarget,
  bandCentre,
  beatsUntil,
  BPM_MAX,
  BPM_MIN,
  clampBpm,
  createTempoTarget,
  describeTempoError,
  evaluateTempo,
  formatMark,
  formatRange,
  generateTempoScramble,
  steadiness,
  steadyBeats,
  TEMPO_SCRAMBLE_SECONDS,
  TEMPO_TERMS,
  termByName,
  termForBpm,
} from '../src/domain/tempo';
import { defaultSettings } from '../src/domain/settings';

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
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

describe('tempo terms', () => {
  it('has contiguous, disjoint bands covering the whole BPM range', () => {
    expect(TEMPO_TERMS[0]!.band[0]).toBe(BPM_MIN);
    expect(TEMPO_TERMS.at(-1)!.band[1]).toBe(BPM_MAX);
    for (let i = 1; i < TEMPO_TERMS.length; i++) {
      expect(TEMPO_TERMS[i]!.band[0]).toBe(TEMPO_TERMS[i - 1]!.band[1] + 1);
    }
    for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm++) {
      expect(TEMPO_TERMS.filter((t) => bpm >= t.band[0] && bpm <= t.band[1])).toHaveLength(1);
    }
  });

  it('names a tempo by its band, at the edges too', () => {
    expect(termForBpm(59).name).toBe('Largo');
    expect(termForBpm(60).name).toBe('Adagio');
    expect(termForBpm(119).name).toBe('Allegretto');
    expect(termForBpm(120).name).toBe('Allegro');
    expect(termForBpm(119.6).name).toBe('Allegro');
    expect(termForBpm(10).name).toBe('Grave');
    expect(termForBpm(400).name).toBe('Prestissimo');
  });

  it('keeps each band inside its conventional range', () => {
    for (const t of TEMPO_TERMS) {
      expect(t.band[0]).toBeGreaterThanOrEqual(t.range[0]);
      if (t.range[1] !== null) expect(t.band[1]).toBeLessThanOrEqual(t.range[1]);
    }
  });

  it('formats marks, ranges and band centres', () => {
    expect(formatMark(96.4)).toBe('♩ = 96');
    expect(formatRange(termByName('Largo')!)).toBe('40–60');
    expect(formatRange(termByName('Prestissimo')!)).toBe('200+');
    expect(bandCentre(termByName('Andante')!)).toBe(90);
    expect(termByName('Nope')).toBeUndefined();
    expect(clampBpm(12)).toBe(BPM_MIN);
    expect(clampBpm(999)).toBe(BPM_MAX);
  });
});

describe('beatsUntil', () => {
  it('schedules evenly spaced beats up to the horizon', () => {
    expect(beatsUntil(1, 120, 1, 2.6)).toEqual([1.5, 2, 2.5]);
    expect(beatsUntil(1, 120, 1, 1.4)).toEqual([]);
  });

  it('continues from the last beat after a tempo change, without doubling or dropping beats', () => {
    // At 60 BPM, beats at 0 and 1; then the tempo goes to 120 just after the beat at 1.
    expect(beatsUntil(1, 120, 1.1, 2.2)).toEqual([1.5, 2]);
    // Slowing down stretches the gap from the last beat.
    expect(beatsUntil(1, 40, 1.1, 2.6)).toEqual([2.5]);
  });

  it('spaces a finite run evenly', () => {
    expect(steadyBeats(120, 4)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('never schedules a beat in the past', () => {
    // The last beat was long ago (a big jump in tempo, or a stalled timer): start now.
    const beats = beatsUntil(0, 200, 5, 5.5);
    expect(beats[0]).toBe(5);
    expect(beats.every((t) => t >= 5)).toBe(true);
  });
});

describe('analyzeTaps', () => {
  it('needs two taps', () => {
    expect(analyzeTaps([])).toBeNull();
    expect(analyzeTaps([100])).toBeNull();
  });

  it('measures a steady run', () => {
    const r = analyzeTaps([0, 500, 1000, 1500, 2000])!;
    expect(r.bpm).toBeCloseTo(120, 6);
    expect(r.cv).toBeCloseTo(0, 6);
  });

  it('shrugs off one sloppy tap', () => {
    const r = analyzeTaps([0, 500, 1000, 1700, 2000, 2500, 3000])!;
    expect(r.bpm).toBeCloseTo(120, 6);
    expect(r.cv).toBeGreaterThan(0.1);
  });

  it('starts over after a long gap, and only uses the latest intervals', () => {
    expect(analyzeTaps([0, 1000, 2000, 5000, 5400, 5800])!.bpm).toBeCloseTo(150, 6);
    const slowThenFast = [0, 1000, 2000, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000];
    expect(analyzeTaps(slowThenFast)!.intervals).toHaveLength(8);
    expect(analyzeTaps(slowThenFast)!.bpm).toBeCloseTo(120, 6);
  });
});

describe('tempo exercises', () => {
  const base = { ...defaultSettings(), tempoMin: 60, tempoMax: 160 };

  it('draws number targets inside the range, clearly different from the last', () => {
    const rng = seeded(1);
    let previous = createTempoTarget({ ...base, tempoTargetStyle: 'mark' }, rng);
    for (let i = 0; i < 300; i++) {
      const t = createTempoTarget({ ...base, tempoTargetStyle: 'mark' }, rng, previous);
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(160);
      expect(Number.isInteger(t.bpm)).toBe(true);
      expect(Math.abs(t.bpm / previous.bpm - 1)).toBeGreaterThanOrEqual(0.08);
      expect(t.term).toBeNull();
      previous = t;
    }
  });

  it('draws term targets from terms in range, never Allegretto, never the same twice running', () => {
    const rng = seeded(2);
    const settings = { ...base, tempoTargetStyle: 'term' as const };
    let previous = createTempoTarget(settings, rng);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const t = createTempoTarget(settings, rng, previous);
      const term = termByName(t.term!)!;
      expect(t.term).not.toBe('Allegretto');
      expect(t.term).not.toBe(previous.term);
      expect(term.band[0]).toBeLessThanOrEqual(160);
      expect(term.band[1]).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBe(bandCentre(term));
      seen.add(t.term!);
      previous = t;
    }
    // Largo (45–59) and Presto (176–199) lie outside 60–160.
    expect([...seen].sort()).toEqual(['Adagio', 'Allegro', 'Andante', 'Moderato', 'Vivace']);
  });

  it('scores numbers by % against the tolerance, fast positive', () => {
    const target = { bpm: 100, style: 'number' as const, term: null };
    expect(evaluateTempo(target, 105, 5)).toEqual({ bpm: 105, errorPct: expect.closeTo(5, 6), correct: true });
    expect(evaluateTempo(target, 94.9, 5).correct).toBe(false);
    expect(evaluateTempo(target, 94.9, 5).errorPct).toBeCloseTo(-5.1, 6);
  });

  it('scores terms by their band, measuring a miss from the nearer edge', () => {
    const target = { bpm: 90, style: 'term' as const, term: 'Andante' };
    expect(evaluateTempo(target, 76, 5)).toMatchObject({ errorPct: 0, correct: true });
    expect(evaluateTempo(target, 103.4, 5)).toMatchObject({ errorPct: 0, correct: true });
    // 103.5 rounds to 104, which is Moderato.
    expect(evaluateTempo(target, 103.5, 5).correct).toBe(false);
    expect(termForBpm(103.5).name).toBe('Moderato');
    expect(evaluateTempo(target, 70, 5).errorPct).toBeCloseTo((70 / 75.5 - 1) * 100, 6);
  });

  it('describes errors and steadiness', () => {
    expect(describeTempoError(5.24)).toBe('5.2% fast');
    expect(describeTempoError(-3)).toBe('3% slow');
    expect(describeTempoError(-12.6)).toBe('13% slow');
    expect(describeTempoError(0.01)).toBe('on tempo');
    expect(steadiness(0.02)).toBe('steady');
    expect(steadiness(0.05)).toBe('a little uneven');
    expect(steadiness(0.2)).toBe('uneven');
  });

  it('scrambles with uneven clicks for about two and a half seconds', () => {
    const offsets = generateTempoScramble(seeded(3));
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)!).toBeLessThan(TEMPO_SCRAMBLE_SECONDS);
    const gaps = offsets.slice(1).map((t, i) => t - offsets[i]!);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(0.12);
      expect(g).toBeLessThanOrEqual(0.6);
    }
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(gaps.length / 2);
  });
});

describe('identify tempo targets', () => {
  const base = { ...defaultSettings(), tempoMin: 60, tempoMax: 160 };

  it('offers the coarse terms with room for a target in the range', () => {
    // Vivace (156–175) overlaps 60–160, but none of it is clear of its edges below 160.
    expect(answerTermsFor(base).map((t) => t.name)).toEqual(['Adagio', 'Andante', 'Moderato', 'Allegro']);
    expect(answerTermsFor({ ...base, tempoMin: 40, tempoMax: 208 }).map((t) => t.name)).toEqual([
      'Largo',
      'Adagio',
      'Andante',
      'Moderato',
      'Allegro',
      'Vivace',
      'Presto',
    ]);
  });

  it('plays a term target clear of its band edges, within the range', () => {
    const rng = seeded(5);
    let previous = createIdentifyTempoTarget(base, rng);
    for (let i = 0; i < 500; i++) {
      const t = createIdentifyTempoTarget(base, rng, previous);
      const term = termByName(t.term!)!;
      expect(t.style).toBe('term');
      expect(t.term).not.toBe(previous.term);
      expect(termForBpm(t.bpm).name).toBe(t.term);
      expect(t.bpm).toBeGreaterThanOrEqual((term.band[0] - 0.5) * 1.04 - 0.5);
      expect(t.bpm).toBeLessThanOrEqual((term.band[1] + 0.5) / 1.04 + 0.5);
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(160);
      previous = t;
    }
  });

  it('plays any tempo in the range when answered by number', () => {
    const rng = seeded(6);
    for (let i = 0; i < 200; i++) {
      const t = createIdentifyTempoTarget({ ...base, tempoIdentifyAnswer: 'number' }, rng);
      expect(t.term).toBeNull();
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(160);
    }
  });
});
