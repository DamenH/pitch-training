// Pure music-theory helpers. 12-tone equal temperament, A4 = 440 Hz,
// MIDI note numbers with C4 = 60 (scientific pitch notation).

/** Pitch class: 0 = C, 1 = C♯/D♭, …, 11 = B. */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type Spelling = 'sharps' | 'flats';

export const A4_MIDI = 69;
export const A4_FREQUENCY = 440;

export const ALL_PITCH_CLASSES: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const NATURAL_PITCH_CLASSES: readonly PitchClass[] = [0, 2, 4, 5, 7, 9, 11];

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
/** Plain-ASCII names suitable for screen readers ("C sharp" reads better than "C♯"). */
const SHARP_SPOKEN = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'] as const;
const FLAT_SPOKEN = ['C', 'D flat', 'D', 'E flat', 'E', 'F', 'G flat', 'G', 'A flat', 'A', 'B flat', 'B'] as const;

export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}

/** Fractional MIDI note number for a frequency (e.g. 440 → 69, 452.9 → ~69.5). */
export function frequencyToMidi(frequency: number): number {
  if (!(frequency > 0) || !Number.isFinite(frequency)) {
    throw new RangeError(`Frequency must be a positive finite number, got ${frequency}`);
  }
  return A4_MIDI + 12 * Math.log2(frequency / A4_FREQUENCY);
}

/** Normalise any integer (including negatives) into a pitch class 0–11. */
export function toPitchClass(value: number): PitchClass {
  return ((((Math.round(value) % 12) + 12) % 12) as PitchClass);
}

export function midiToPitchClass(midi: number): PitchClass {
  return toPitchClass(midi);
}

/** Scientific-pitch octave number: MIDI 60 → 4, MIDI 59 (B3) → 3. */
export function midiToOctave(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

export function noteToMidi(pitchClass: PitchClass, octave: number): number {
  return (octave + 1) * 12 + pitchClass;
}

export function isNatural(pc: PitchClass): boolean {
  return NATURAL_PITCH_CLASSES.includes(pc);
}

export function pitchClassName(pc: PitchClass, spelling: Spelling = 'sharps'): string {
  return (spelling === 'flats' ? FLAT_NAMES : SHARP_NAMES)[pc];
}

export function spokenPitchClassName(pc: PitchClass, spelling: Spelling = 'sharps'): string {
  return (spelling === 'flats' ? FLAT_SPOKEN : SHARP_SPOKEN)[pc];
}

/** e.g. 69 → "A4", 61 → "C♯4" / "D♭4". */
export function noteName(midi: number, spelling: Spelling = 'sharps'): string {
  return `${pitchClassName(midiToPitchClass(midi), spelling)}${midiToOctave(midi)}`;
}

export function spokenNoteName(midi: number, spelling: Spelling = 'sharps'): string {
  return `${spokenPitchClassName(midiToPitchClass(midi), spelling)} ${midiToOctave(midi)}`;
}

/** Signed cents from `reference` to `frequency` (positive = frequency is sharp). */
export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

/** Signed cents of a fractional MIDI value relative to an integer target. */
export function centsFromMidi(fractionalMidi: number, targetMidi: number): number {
  return (fractionalMidi - targetMidi) * 100;
}

/**
 * The MIDI note with pitch class `pc` that is closest to `fractionalMidi`.
 * Ties (exactly a tritone away) resolve upward.
 */
export function nearestMidiWithPitchClass(fractionalMidi: number, pc: PitchClass): number {
  // Math.round rounds .5 toward +∞, which gives the "ties resolve upward" behaviour.
  return pc + 12 * Math.round((fractionalMidi - pc) / 12);
}

export function samePitchClass(a: number, b: number): boolean {
  return midiToPitchClass(a) === midiToPitchClass(b);
}

export function sameNote(a: number, b: number): boolean {
  return Math.round(a) === Math.round(b);
}
