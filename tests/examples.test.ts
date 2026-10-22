import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { PIANO_EXAMPLES, exampleFromHash, pianoExample } from '../src/domain/examples';
import { parseMidi, scoreToMidi, validateScore } from '../src/domain/score';

const pitches = (id: string) => pianoExample(id).notes.map((note) => note.midi);

describe('built-in MIDI examples', () => {
  it('plays the major, natural minor and chromatic intervals up and down', () => {
    expect(pitches('c-major-scale')).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
    expect(pitches('a-natural-minor-scale')).toEqual([57, 59, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 59, 57]);
    const chromatic = pitches('chromatic-scale');
    expect(chromatic).toHaveLength(25);
    expect(chromatic[0]).toBe(60);
    expect(chromatic[12]).toBe(72);
    expect(chromatic[24]).toBe(60);
    expect(chromatic.slice(1).every((note, i) => Math.abs(note - chromatic[i]!) === 1)).toBe(true);
  });
  it('plays the five-note major and minor pentatonic scales up and down', () => {
    expect(pitches('c-major-pentatonic-scale')).toEqual([60, 62, 64, 67, 69, 72, 69, 67, 64, 62, 60]);
    expect(pitches('a-minor-pentatonic-scale')).toEqual([57, 60, 62, 64, 67, 69, 67, 64, 62, 60, 57]);
  });
  it('uses exact octave leaps inside each C, D and E exercise', () => {
    const notes = pitches('octave-leaps');
    for (const start of [0, 5, 10]) {
      expect(notes.slice(start + 1, start + 5).map((n, i) => Math.abs(n - notes[start + i]!))).toEqual([12, 12, 12, 12]);
    }
  });
  it('includes recognizable complete melody phrases with a final tonic', () => {
    expect(pitches('ode-to-joy').slice(0, 8)).toEqual([64, 64, 65, 67, 67, 65, 64, 62]);
    expect(pitches('twinkle-twinkle').slice(0, 7)).toEqual([60, 60, 67, 67, 69, 69, 67]);
    expect(pitches('twinkle-twinkle')).toHaveLength(42);
    expect(pitches('ode-to-joy').at(-1)).toBe(60);
    expect(pitches('twinkle-twinkle').at(-1)).toBe(60);
  });
  it('makes Frère Jacques genuinely polyphonic, entering eight beats later', () => {
    const score = pianoExample('frere-jacques-round');
    expect(score.notes).toHaveLength(64);
    expect(score.notes.filter((n) => n.time === 4).map((n) => n.midi)).toEqual([48, 64]);
  });
  for (const example of PIANO_EXAMPLES) {
    it(`${example.id} exports a playable MIDI with its notes, timing, velocity and title`, () => {
      const score = example.create();
      expect(validateScore(score)).toEqual(score);
      const bytes = scoreToMidi(score);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
      const imported = parseMidi(bytes);
      expect(imported.title).toBe(score.title);
      expect(imported.notes).toHaveLength(score.notes.length);
      imported.notes.forEach((note, i) => {
        expect(note.midi).toBe(score.notes[i]!.midi);
        expect(Math.abs(note.time - score.notes[i]!.time)).toBeLessThanOrEqual(1 / 960);
        expect(Math.abs(note.duration - score.notes[i]!.duration)).toBeLessThanOrEqual(2 / 960);
        expect(Math.abs(note.velocity - score.notes[i]!.velocity)).toBeLessThanOrEqual(1 / 127);
      });
    });
  }
  it('returns independent copies so saving/editing cannot alter a default', () => {
    const edited = pianoExample('c-major-scale');
    edited.title = 'My copy';
    edited.notes[0]!.midi = 20;
    expect(pianoExample('c-major-scale').title).toBe('C major scale');
    expect(pitches('c-major-scale')[0]).toBe(60);
  });
  it('loads stable example links and rejects unknown or ambiguous requests', () => {
    expect(exampleFromHash('#/reference?example=c-major-scale')).toEqual(pianoExample('c-major-scale'));
    expect(exampleFromHash('#/reference')).toBeNull();
    expect(() => exampleFromHash('#/reference?example=missing')).toThrow(/Unknown/);
    expect(() => exampleFromHash('#/reference?example=c-major-scale&midi=abc')).toThrow(/not more than one/);
  });
  it('preserves UTF-8 MIDI titles without breaking legacy Latin-1 names', () => {
    const score = pianoExample('c-major-scale');
    score.title = '三和音 🎹';
    expect(parseMidi(scoreToMidi(score)).title).toBe(score.title);
    const legacy = new Midi();
    legacy.header.name = 'Étude';
    legacy.addTrack().addNote({ midi: 60, time: 0, duration: 1 });
    expect(parseMidi(legacy.toArray()).title).toBe('Étude');
  });
  it('keeps separate durations and velocities for overlapping notes of the same pitch', () => {
    const score = validateScore({ version: 1, title: 'Independent voices', notes: [
      { midi: 60, time: 0, duration: 2, velocity: 0.8 },
      { midi: 60, time: 0.5, duration: 0.5, velocity: 0.4 },
    ] });
    const imported = parseMidi(scoreToMidi(score));
    expect(imported.notes.map((n) => [n.time, n.duration])).toEqual([[0, 2], [0.5, 0.5]]);
    expect(imported.notes[0]!.velocity).toBeCloseTo(0.8, 1);
    expect(imported.notes[1]!.velocity).toBeCloseTo(0.4, 1);
  });
});
