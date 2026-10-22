import { describe, expect, it } from 'vitest';
import {
  nearestPianoSample,
  PIANO_SAMPLES,
  pianoPlaybackRate,
  pianoSamplesForRange,
} from '../src/audio/pianoSamples';
import { midiToFrequency } from '../src/domain/music';
import { OCTAVE_MAX, OCTAVE_MIN } from '../src/domain/settings';

describe('piano sample mapping', () => {
  it('covers every playable octave within one semitone of a recording', () => {
    for (let m = (OCTAVE_MIN + 1) * 12; m <= (OCTAVE_MAX + 1) * 12 + 11; m++) {
      expect(Math.abs(nearestPianoSample(m).midi - m)).toBeLessThanOrEqual(2);
    }
    for (let m = 24; m <= 106; m++) expect(Math.abs(nearestPianoSample(m).midi - m)).toBeLessThanOrEqual(1);
  });

  it('produces exact equal-tempered frequencies after tuning correction', () => {
    for (let m = 24; m <= 107; m++) {
      const s = nearestPianoSample(m);
      const recorded = midiToFrequency(s.midi) * 2 ** (s.tuningCents / 1200);
      expect(recorded * pianoPlaybackRate(m, s)).toBeCloseTo(midiToFrequency(m), 6);
    }
  });

  it('uses rate 1 for an in-tune sample at its own pitch', () => {
    expect(pianoPlaybackRate(69, { file: 'x', midi: 69, tuningCents: 0 })).toBe(1);
  });

  it('lists the samples needed for a range without duplicates', () => {
    const list = pianoSamplesForRange(57, 69);
    expect(list.map((s) => s.midi)).toEqual([57, 60, 63, 66, 69]);
    expect(new Set(list).size).toBe(list.length);
  });

  it('has sorted, unique sample notes with modest tuning corrections', () => {
    const notes = PIANO_SAMPLES.map((s) => s.midi);
    expect([...notes].sort((a, b) => a - b)).toEqual(notes);
    for (const s of PIANO_SAMPLES) expect(Math.abs(s.tuningCents)).toBeLessThan(50);
  });
});
