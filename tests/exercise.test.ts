import { describe, expect, it } from 'vitest';
import { candidateNotes, createQuestion, generateTarget, type Rng } from '../src/domain/exercise';
import { midiToOctave, midiToPitchClass, type PitchClass } from '../src/domain/music';
import { defaultSettings, type Settings } from '../src/domain/settings';

/** Deterministic PRNG (mulberry32) so tests are reproducible. */
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

function settings(patch: Partial<Settings>): Settings {
  return { ...defaultSettings(), ...patch };
}

describe('candidateNotes', () => {
  it('covers enabled pitch classes across the playback octave range for identify', () => {
    const s = settings({ enabledPitchClasses: [0, 9], playbackOctaveMin: 3, playbackOctaveMax: 4 });
    expect(candidateNotes('identify', s)).toEqual([48, 57, 60, 69]);
  });

  it('uses the vocal range for singing', () => {
    const s = settings({ enabledPitchClasses: [9], vocalLow: 50, vocalHigh: 70 });
    expect(candidateNotes('sing-test', s)).toEqual([57, 69]);
  });
});

describe('generateTarget', () => {
  it('only produces enabled pitch classes within the octave range', () => {
    const enabled: PitchClass[] = [1, 4, 8];
    const s = settings({ enabledPitchClasses: enabled, playbackOctaveMin: 2, playbackOctaveMax: 3 });
    const rng = seeded(1);
    let prev: number | undefined;
    for (let i = 0; i < 500; i++) {
      const m = generateTarget('identify', s, rng, prev);
      expect(enabled).toContain(midiToPitchClass(m));
      expect(midiToOctave(m)).toBeGreaterThanOrEqual(2);
      expect(midiToOctave(m)).toBeLessThanOrEqual(3);
      prev = m;
    }
  });

  it('only produces sung targets inside the vocal range', () => {
    const s = settings({ vocalLow: 45, vocalHigh: 60 });
    const rng = seeded(2);
    for (let i = 0; i < 300; i++) {
      const m = generateTarget('sing-test', s, rng);
      expect(m).toBeGreaterThanOrEqual(45);
      expect(m).toBeLessThanOrEqual(60);
    }
  });

  it('never repeats the previous pitch class when more than one is enabled', () => {
    const s = settings({ enabledPitchClasses: [0, 7] });
    const rng = seeded(3);
    let prev = generateTarget('identify', s, rng);
    for (let i = 0; i < 200; i++) {
      const next = generateTarget('identify', s, rng, prev);
      expect(midiToPitchClass(next)).not.toBe(midiToPitchClass(prev));
      prev = next;
    }
  });

  it('avoids repeating the exact note when only one pitch class is enabled', () => {
    const s = settings({ enabledPitchClasses: [9], playbackOctaveMin: 3, playbackOctaveMax: 5 });
    const rng = seeded(4);
    let prev = generateTarget('identify', s, rng);
    for (let i = 0; i < 100; i++) {
      const next = generateTarget('identify', s, rng, prev);
      expect(midiToPitchClass(next)).toBe(9);
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('still works when only a single note is possible', () => {
    const s = settings({ enabledPitchClasses: [9], playbackOctaveMin: 4, playbackOctaveMax: 4 });
    expect(generateTarget('identify', s, seeded(5), 69)).toBe(69);
  });

  it('chooses pitch classes roughly uniformly', () => {
    const s = settings({});
    const rng = seeded(6);
    const counts = new Array<number>(12).fill(0);
    for (let i = 0; i < 12000; i++) counts[midiToPitchClass(generateTarget('identify', s, rng))]!++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
});

describe('createQuestion', () => {
  it('captures the scoring policy and target pitch class', () => {
    const s = settings({ scoringPolicy: 'exact' });
    const q = createQuestion('sing-test', s, seeded(7));
    expect(q.scoringPolicy).toBe('exact');
    expect(q.targetPitchClass).toBe(midiToPitchClass(q.targetMidi));
  });

  it('gives each question a distinct id', () => {
    const s = settings({});
    const a = createQuestion('identify', s, seeded(8), undefined, 1);
    const b = createQuestion('identify', s, seeded(8), a, 1);
    expect(a.id).not.toBe(b.id);
  });

});
