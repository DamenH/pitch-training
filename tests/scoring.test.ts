import { describe, expect, it } from 'vitest';
import { comparePitch, evaluateIdentify, evaluateIdentifyOctave, evaluateSing, type Question } from '../src/domain/exercise';
import { frequencyToMidi, midiToFrequency } from '../src/domain/music';
import type { StablePitch } from '../src/domain/pitch';
import type { ScoringPolicy } from '../src/domain/settings';

function question(targetMidi: number, scoringPolicy: ScoringPolicy = 'pitch-class'): Question {
  return {
    id: 'q',
    kind: 'sing-test',
    targetMidi,
    targetPitchClass: ((targetMidi % 12) + 12) % 12 as Question['targetPitchClass'],
    scoringPolicy,
    createdAt: 0,
  };
}

function stable(midi: number): { kind: 'ok'; pitch: StablePitch } {
  return { kind: 'ok', pitch: { midi, frequency: midiToFrequency(midi), time: 0, since: 0 } };
}

describe('octave-equivalent (pitch-class) scoring', () => {
  it('accepts A3, A4 and A5 for target A4', () => {
    for (const sung of [57, 69, 81]) {
      const r = comparePitch(sung, 69, 'pitch-class', 50);
      expect(r.withinTolerance).toBe(true);
      expect(r.cents).toBeCloseTo(0, 9);
      expect(r.referenceMidi).toBe(sung);
    }
  });

  it('measures deviation against the nearest octave-equivalent target', () => {
    const r = comparePitch(57.3, 69, 'pitch-class', 50);
    expect(r.referenceMidi).toBe(57);
    expect(r.cents).toBeCloseTo(30, 6);
    expect(r.detectedMidi).toBe(57);
  });

  it('rejects other pitch classes', () => {
    const r = comparePitch(67, 69, 'pitch-class', 50); // G4
    expect(r.withinTolerance).toBe(false);
    expect(r.cents).toBeCloseTo(-200, 6);
  });
});

describe('exact-note scoring', () => {
  it('rejects A3 for target A4', () => {
    const r = comparePitch(57, 69, 'exact', 50);
    expect(r.withinTolerance).toBe(false);
    expect(r.cents).toBeCloseTo(-1200, 6);
    expect(r.referenceMidi).toBe(69);
  });

  it('accepts the exact note', () => {
    expect(comparePitch(69.1, 69, 'exact', 50).withinTolerance).toBe(true);
  });
});

describe('tolerance boundaries', () => {
  it('is inclusive at exactly ±tolerance', () => {
    expect(comparePitch(69.5, 69, 'exact', 50).withinTolerance).toBe(true);
    expect(comparePitch(68.5, 69, 'exact', 50).withinTolerance).toBe(true);
    // Through a frequency round-trip, which introduces float error.
    const sharp50 = frequencyToMidi(440 * 2 ** (50 / 1200));
    expect(comparePitch(sharp50, 69, 'exact', 50).withinTolerance).toBe(true);
  });

  it('rejects just outside the tolerance', () => {
    expect(comparePitch(69.501, 69, 'exact', 50).withinTolerance).toBe(false);
    expect(comparePitch(68.499, 69, 'exact', 50).withinTolerance).toBe(false);
  });

  it('respects a custom tolerance', () => {
    expect(comparePitch(69.25, 69, 'exact', 20).withinTolerance).toBe(false);
    expect(comparePitch(69.2, 69, 'exact', 20).withinTolerance).toBe(true);
  });
});

describe('evaluateSing', () => {
  it('reports correct with detected note and cents', () => {
    const r = evaluateSing(question(69), stable(57.1), 50);
    expect(r.outcome).toBe('correct');
    if (r.outcome !== 'no-detection') {
      expect(r.comparison.detectedMidi).toBe(57);
      expect(r.comparison.cents).toBeCloseTo(10, 6);
    }
  });

  it('reports incorrect for a wrong note', () => {
    expect(evaluateSing(question(69), stable(70), 50).outcome).toBe('incorrect');
  });

  it('uses the policy captured on the question', () => {
    expect(evaluateSing(question(69, 'exact'), stable(57), 50).outcome).toBe('incorrect');
    expect(evaluateSing(question(69, 'pitch-class'), stable(57), 50).outcome).toBe('correct');
  });

  it('distinguishes missing and stale detections from wrong answers', () => {
    const none = evaluateSing(question(69), { kind: 'none' }, 50);
    const stale = evaluateSing(question(69), { kind: 'stale' }, 50);
    expect(none).toMatchObject({ outcome: 'no-detection', reason: 'never' });
    expect(stale).toMatchObject({ outcome: 'no-detection', reason: 'stale' });
  });
});

describe('evaluateIdentify', () => {
  it('compares pitch classes only', () => {
    const q = { ...question(57), kind: 'identify' as const };
    expect(evaluateIdentify(q, 9).correct).toBe(true);
    expect(evaluateIdentify(q, 10).correct).toBe(false);
  });

  it('scores scientific-pitch octaves across the B/C boundary', () => {
    expect(evaluateIdentifyOctave({ ...question(59), kind: 'identify-octave' }, 3).correct).toBe(true);
    expect(evaluateIdentifyOctave({ ...question(60), kind: 'identify-octave' }, 3).correct).toBe(false);
    expect(evaluateIdentifyOctave({ ...question(60), kind: 'identify-octave' }, 4).correct).toBe(true);
  });
});
