import { describe, expect, it } from 'vitest';
import { describeDeviation, signedCents } from '../src/lib/format';

describe('deviation formatting', () => {
  it('formats signed cents', () => {
    expect(signedCents(12.4)).toBe('+12¢');
    expect(signedCents(-30)).toBe('−30¢');
    expect(signedCents(0.2)).toBe('0¢');
  });

  it('describes small and large deviations', () => {
    expect(describeDeviation(0)).toBe('exactly on');
    expect(describeDeviation(12)).toBe('12¢ sharp of');
    expect(describeDeviation(-49.6)).toBe('50¢ flat of');
    expect(describeDeviation(-401)).toBe('≈4 semitones (−401¢) below');
    expect(describeDeviation(100)).toBe('≈1 semitone (+100¢) above');
  });
});
