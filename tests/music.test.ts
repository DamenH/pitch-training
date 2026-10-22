import { describe, expect, it } from 'vitest';
import {
  centsBetween,
  centsFromMidi,
  frequencyToMidi,
  midiToFrequency,
  midiToOctave,
  midiToPitchClass,
  nearestMidiWithPitchClass,
  noteName,
  noteToMidi,
  pitchClassName,
  sameNote,
  samePitchClass,
  toPitchClass,
} from '../src/domain/music';

describe('frequency ↔ MIDI', () => {
  it('maps A4 (MIDI 69) to 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(frequencyToMidi(440)).toBe(69);
  });

  it('maps C4 to MIDI 60 (~261.63 Hz)', () => {
    expect(noteToMidi(0, 4)).toBe(60);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(frequencyToMidi(261.6256)).toBeCloseTo(60, 4);
    expect(noteName(60)).toBe('C4');
  });

  it('doubles per octave', () => {
    expect(midiToFrequency(57)).toBeCloseTo(220, 9);
    expect(midiToFrequency(81)).toBeCloseTo(880, 9);
  });

  it('returns fractional MIDI for in-between frequencies', () => {
    expect(frequencyToMidi(midiToFrequency(69.5))).toBeCloseTo(69.5, 9);
  });

  it('rejects non-positive frequencies', () => {
    expect(() => frequencyToMidi(0)).toThrow(RangeError);
    expect(() => frequencyToMidi(-1)).toThrow(RangeError);
    expect(() => frequencyToMidi(NaN)).toThrow(RangeError);
  });
});

describe('pitch classes and naming', () => {
  it('normalises pitch classes, including negatives', () => {
    expect(toPitchClass(12)).toBe(0);
    expect(toPitchClass(-1)).toBe(11);
    expect(toPitchClass(-13)).toBe(11);
    expect(midiToPitchClass(69)).toBe(9);
    expect(midiToPitchClass(21)).toBe(9);
  });

  it('computes octaves across the B/C boundary', () => {
    expect(midiToOctave(59)).toBe(3);
    expect(midiToOctave(60)).toBe(4);
    expect(midiToOctave(0)).toBe(-1);
  });

  it('spells notes with sharps or flats', () => {
    expect(noteName(61)).toBe('C♯4');
    expect(noteName(61, 'flats')).toBe('D♭4');
    expect(pitchClassName(10, 'flats')).toBe('B♭');
    expect(pitchClassName(10)).toBe('A♯');
  });

  it('compares pitch classes and exact notes', () => {
    expect(samePitchClass(57, 69)).toBe(true);
    expect(samePitchClass(57, 70)).toBe(false);
    expect(sameNote(69, 69)).toBe(true);
    expect(sameNote(57, 69)).toBe(false);
  });
});

describe('cents', () => {
  it('measures one semitone as 100 cents and an octave as 1200', () => {
    expect(centsBetween(midiToFrequency(70), 440)).toBeCloseTo(100, 9);
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 9);
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 9);
  });

  it('computes cents from fractional MIDI', () => {
    expect(centsFromMidi(69.25, 69)).toBeCloseTo(25, 9);
    expect(centsFromMidi(68.6, 69)).toBeCloseTo(-40, 9);
  });
});

describe('nearestMidiWithPitchClass', () => {
  it('finds the nearest octave of the pitch class', () => {
    expect(nearestMidiWithPitchClass(57.2, 9)).toBe(57); // A3
    expect(nearestMidiWithPitchClass(68.7, 9)).toBe(69); // A4
    expect(nearestMidiWithPitchClass(60, 9)).toBe(57); // C4: A3 is 3 below, A4 is 9 above
    expect(nearestMidiWithPitchClass(62, 9)).toBe(57); // D4: A3 is 5 below, A4 is 7 above
    expect(nearestMidiWithPitchClass(64, 9)).toBe(69); // E4: A4 is 5 above
  });

  it('resolves exact tritone ties upward', () => {
    expect(nearestMidiWithPitchClass(63, 9)).toBe(69);
  });

  it('works for low and negative-offset values', () => {
    expect(nearestMidiWithPitchClass(1, 11)).toBe(-1);
    expect(nearestMidiWithPitchClass(40.4, 4)).toBe(40);
  });
});
