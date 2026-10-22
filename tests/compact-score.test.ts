import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { packScore, unpackScore } from '../src/domain/compactScore';
import { encodeBase64Url, scoreFromHash, scoreHash, validateScore } from '../src/domain/score';
import { PIANO_EXAMPLES, exampleFromHash } from '../src/domain/examples';

const note = { midi: 60, time: 0, duration: 1, velocity: 1 };
const chord = validateScore({ version: 1, title: 'Untitled', notes: [60, 64, 67].map((midi) => ({ ...note, midi })) });
const raw = [1, 0, 0, 3, 232, 7, 127, 0, 3, 60, 64, 67];

describe('compact sharing experiment', () => {
  it('matches the documented uncompressed chord wire fixture', () => {
    expect([...packScore(chord)]).toEqual(raw);
    expect(unpackScore(Uint8Array.from(raw))).toEqual(chord);
    expect(scoreHash(chord).length).toBe(30);
  });
  it('retains all pitches, overlap, Unicode titles, rests and variable dynamics', () => {
    const original = validateScore({ version: 1, title: '三和音 🎹', notes: [
      { midi: 0, time: 0.12567, duration: 0.12345, velocity: 0 },
      { midi: 127, time: 0.12678, duration: 1.99999, velocity: 1 },
      { midi: 60, time: 1700.123456, duration: 0.76543, velocity: 0.7 },
    ] });
    const restored = scoreFromHash(scoreHash(original))!;
    expect(restored.title).toBe(original.title);
    restored.notes.forEach((n, i) => {
      const source = original.notes[i]!;
      expect(n.midi).toBe(source.midi);
      expect(Math.abs(n.time - source.time)).toBeLessThanOrEqual(0.000501);
      expect(Math.abs(n.duration - source.duration)).toBeLessThanOrEqual(0.000501);
      expect(Math.abs(n.velocity - source.velocity)).toBeLessThanOrEqual(0.5 / 127 + 1e-12);
    });
    expect(original.notes[0]!.time).toBe(0.12567);
  });
  it('bounds rounding near the one-hour limit and for submillisecond durations', () => {
    const score = validateScore({ version: 1, notes: [{ ...note, time: 3599.9996, duration: 0.0002 }] });
    const restored = scoreFromHash(scoreHash(score))!;
    expect(restored.notes[0]!.time + restored.notes[0]!.duration).toBe(3600);
    expect(restored.notes[0]!.duration).toBe(0.001);
  });
  it('uses DEFLATE only when it shortens the binary payload', () => {
    expect(packScore(chord)[1]).toBe(0);
    const scale = PIANO_EXAMPLES[0]!.create();
    expect(packScore(scale)[1]).toBe(1);
    expect(scoreFromHash(scoreHash(scale))!.notes).toHaveLength(scale.notes.length);
  });
  it('keeps legacy JSON and MIDI decoders and rejects mixed link formats', () => {
    const legacy = `#/reference?score=${encodeBase64Url(new TextEncoder().encode(JSON.stringify(chord)))}`;
    expect(scoreFromHash(legacy)).toEqual(chord);
    for (const extra of ['score=abc', 'midi=abc']) expect(() => scoreFromHash(`${scoreHash(chord)}&${extra}`)).toThrow();
    expect(() => exampleFromHash('#/reference?example=c-major-scale&p=abc')).toThrow();
  });
  it('rejects unsupported versions, flags, truncated/extra data and noncanonical integers', () => {
    const cases = [
      [], [1, 0], [2, ...raw.slice(1)], [1, 2, ...raw.slice(2)],
      raw.slice(0, -1), [...raw, 0], [1, 0, 128, 0, ...raw.slice(3)],
      [1, 0, 1, 255, ...raw.slice(3)], // malformed UTF-8 title
      [1, 0, 0, 0, ...raw.slice(4)], // no notes
      [1, 0, 0, 3, 0, ...raw.slice(6)], // zero duration
      [1, 0, 0, 3, 232, 7, 128, ...raw.slice(7)], // invalid default velocity
      [1, 0, ...raw.slice(2, 8), 4, ...raw.slice(9)], // onset group larger than note count
      [1, 0, ...raw.slice(2, 9), 188, 4, 64, 67], // unknown per-note property flags
    ];
    for (const bytes of cases) expect(() => unpackScore(Uint8Array.from(bytes)), JSON.stringify(bytes)).toThrow();
  });
  it('bounds decompression before accepting a payload', () => {
    const body = deflateSync(new Uint8Array(1_000_000));
    const packet = Uint8Array.from([1, 1, ...body]);
    expect(() => unpackScore(packet)).toThrow(/size limit/);
    expect(() => unpackScore(new Uint8Array(200_003))).toThrow(/size/);
    expect(() => unpackScore(Uint8Array.from([1, 1, 255, 255]))).toThrow();
  });
  it('rejects a quantized score that would violate the existing voice limit', () => {
    const original = validateScore({ version: 1, notes: [
      { ...note, time: 0.0006, duration: 0.1006 },
      ...Array.from({ length: 64 }, (_, midi) => ({ ...note, midi, time: 0.4713, duration: 0.1 })),
    ] });
    expect(() => scoreHash(original)).toThrow(/64-voice/);
  });
});
