import { describe, expect, it } from 'vitest';
import {
  analyzeTaps,
  bandCentre,
  beatsUntil,
  BPM_MAX,
  BPM_MIN,
  clampBpm,
  formatMark,
  formatRange,
  steadyBeats,
  TEMPO_TERMS,
  termByName,
  termForBpm,
} from '../src/domain/tempo';

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
