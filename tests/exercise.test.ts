import { describe, expect, it } from 'vitest';
import {
  candidateNotes,
  CHROMA_DISTANCES,
  createQuestion,
  generateComparison,
  generateScramble,
  generateTarget,
  replayInRandomOctave,
  replayInSweep,
  SCRAMBLE_HIGH,
  SCRAMBLE_LOW,
  SCRAMBLE_NOTES,
  type Rng,
} from '../src/domain/exercise';
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

  it('uses the identify playback range for octave questions', () => {
    const s = settings({ enabledPitchClasses: [0, 9], playbackOctaveMin: 3, playbackOctaveMax: 4 });
    expect(candidateNotes('identify-octave', s)).toEqual([48, 57, 60, 69]);
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

  it('avoids repeating the octave for octave questions when possible', () => {
    const s = settings({ enabledPitchClasses: [0, 4, 7], playbackOctaveMin: 3, playbackOctaveMax: 5 });
    const rng = seeded(12);
    let prev = generateTarget('identify-octave', s, rng);
    for (let i = 0; i < 200; i++) {
      const next = generateTarget('identify-octave', s, rng, prev);
      expect(midiToOctave(next)).not.toBe(midiToOctave(prev));
      expect(s.enabledPitchClasses).toContain(midiToPitchClass(next));
      prev = next;
    }
  });

  it('still generates octave questions with a single configured octave', () => {
    const s = settings({ enabledPitchClasses: [0, 7], playbackOctaveMin: 4, playbackOctaveMax: 4 });
    expect(midiToOctave(generateTarget('identify-octave', s, seeded(13), 60))).toBe(4);
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

describe('chroma questions', () => {
  it('pairs the target with a note in another octave, same or different about half the time', () => {
    const s = settings({ playbackOctaveMin: 3, playbackOctaveMax: 5 });
    const rng = seeded(21);
    let same = 0;
    for (let i = 0; i < 2000; i++) {
      const q = createQuestion('identify-chroma', s, rng);
      const second = q.comparisonMidi!;
      expect(midiToOctave(second)).not.toBe(midiToOctave(q.targetMidi));
      expect(midiToOctave(second)).toBeGreaterThanOrEqual(3);
      expect(midiToOctave(second)).toBeLessThanOrEqual(5);
      expect(Math.abs(second - q.targetMidi)).toBeGreaterThanOrEqual(12);
      if (midiToPitchClass(second) === q.targetPitchClass) same++;
    }
    expect(same).toBeGreaterThan(850);
    expect(same).toBeLessThan(1150);
  });

  it('uses the chosen contrast for different notes', () => {
    for (const contrast of ['far', 'semitone', 'fifth', 'mixed'] as const) {
      const s = settings({ chromaContrast: contrast });
      const rng = seeded(22);
      for (let i = 0; i < 300; i++) {
        const target = 60 + (i % 12);
        const second = generateComparison(target, s, rng);
        const up = (((second - target) % 12) + 12) % 12;
        const distance = Math.min(up, 12 - up);
        if (distance !== 0) expect(CHROMA_DISTANCES[contrast]).toContain(distance);
      }
    }
  });

  it('reaches into a neighbouring octave when the range is a single octave', () => {
    const s = settings({ playbackOctaveMin: 4, playbackOctaveMax: 4 });
    const rng = seeded(23);
    for (let i = 0; i < 100; i++) {
      expect([3, 5]).toContain(midiToOctave(generateComparison(62, s, rng)));
    }
  });
});

describe('replayInRandomOctave', () => {
  it('keeps the pitch class and moves to another octave of the range', () => {
    const s = settings({ playbackOctaveMin: 2, playbackOctaveMax: 5 });
    const q = createQuestion('identify', s, seeded(24));
    const rng = seeded(25);
    let last = q.targetMidi;
    for (let i = 0; i < 100; i++) {
      const next = replayInRandomOctave(q, s, rng, last);
      expect(midiToPitchClass(next)).toBe(q.targetPitchClass);
      expect(midiToOctave(next)).not.toBe(midiToOctave(last));
      expect(midiToOctave(next)).toBeGreaterThanOrEqual(2);
      expect(midiToOctave(next)).toBeLessThanOrEqual(5);
      last = next;
    }
  });

  it('repeats the note when the range is a single octave', () => {
    const s = settings({ playbackOctaveMin: 4, playbackOctaveMax: 4 });
    const q = createQuestion('identify', s, seeded(26));
    expect(replayInRandomOctave(q, s, seeded(27), q.targetMidi)).toBe(q.targetMidi);
  });
});

describe('replayInSweep', () => {
  it('steps up to the top of the range, down to the bottom, and repeats', () => {
    const s = settings({ playbackOctaveMin: 2, playbackOctaveMax: 5 });
    const q = { ...createQuestion('identify', s, seeded(28)), targetPitchClass: 9 as PitchClass, targetMidi: 57 };
    let last = q.targetMidi;
    let direction: 1 | -1 = 1;
    const octaves: number[] = [];
    for (let i = 0; i < 8; i++) {
      ({ midi: last, direction } = replayInSweep(q, s, last, direction));
      expect(midiToPitchClass(last)).toBe(9);
      octaves.push(midiToOctave(last));
    }
    expect(octaves).toEqual([4, 5, 4, 3, 2, 3, 4, 5]);
  });

  it('repeats the note when the range is a single octave', () => {
    const s = settings({ playbackOctaveMin: 4, playbackOctaveMax: 4 });
    const q = createQuestion('identify', s, seeded(29));
    expect(replayInSweep(q, s, q.targetMidi, 1).midi).toBe(q.targetMidi);
  });
});

describe('generateScramble', () => {
  it('plays a wide, leaping run that never ends on the upcoming target', () => {
    const rng = seeded(11);
    for (let trial = 0; trial < 200; trial++) {
      const avoid = (trial % 12) as PitchClass;
      const notes = generateScramble(rng, avoid);
      expect(notes).toHaveLength(SCRAMBLE_NOTES);
      for (const [i, m] of notes.entries()) {
        expect(m).toBeGreaterThanOrEqual(SCRAMBLE_LOW);
        expect(m).toBeLessThanOrEqual(SCRAMBLE_HIGH);
        if (i > 0) {
          expect(Math.abs(m - notes[i - 1]!)).toBeGreaterThanOrEqual(3);
          expect(midiToPitchClass(m)).not.toBe(midiToPitchClass(notes[i - 1]!));
        }
      }
      expect(midiToPitchClass(notes.at(-1)!)).not.toBe(avoid);
    }
  });
});
