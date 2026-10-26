import { ALL_PITCH_CLASSES, NATURAL_PITCH_CLASSES, toPitchClass, type PitchClass, type Spelling } from './music';

export type ScoringPolicy = 'pitch-class' | 'exact';
export type ReplayPolicy = 'unlimited' | 'single';
export type Waveform = 'piano' | 'sine' | 'triangle' | 'warm';
/** Identify notes: whether replays repeat the note's octave, jump to another, or sweep up and down the range. */
export type ReplayOctave = 'same' | 'random' | 'sweep';
/** Identify chroma: how far a "different" note is from the first note. */
export type ChromaContrast = 'far' | 'semitone' | 'fifth' | 'mixed';
/** Reference keyboard: how many octaves to show side by side on wide screens. */
export type ReferenceOctaves = 1 | 2 | 3;

export interface Settings {
  /** Pitch classes that exercises may use. Never empty. */
  enabledPitchClasses: PitchClass[];
  /** Octave range for synthesized notes in Hear → Identify (inclusive). */
  playbackOctaveMin: number;
  playbackOctaveMax: number;
  /** Vocal range for See → Sing targets, as MIDI notes (inclusive, ≥ one octave wide). */
  vocalLow: number;
  vocalHigh: number;
  scoringPolicy: ScoringPolicy;
  replayPolicy: ReplayPolicy;
  replayOctave: ReplayOctave;
  chromaContrast: ChromaContrast;
  /** 0–1, perceptual. */
  volume: number;
  /** Seconds. */
  noteDuration: number;
  waveform: Waveform;
  /** ± cents accepted around the (octave-equivalent) target. */
  toleranceCents: number;
  spelling: Spelling;
  historyEnabled: boolean;
  /** Play a burst of random notes before each new exercise question, to break relative pitch. */
  scramble: boolean;
  referenceOctaves: ReferenceOctaves;
}

export const OCTAVE_MIN = 1;
export const OCTAVE_MAX = 7;
/** E1 … C7: generous bounds for the vocal range pickers. */
export const VOCAL_MIDI_MIN = 28;
export const VOCAL_MIDI_MAX = 96;
export const VOCAL_MIN_SPAN = 12;
export const TOLERANCE_MIN = 5;
export const TOLERANCE_MAX = 100;
export const DURATION_MIN = 0.3;
export const DURATION_MAX = 4;

export interface VocalPreset {
  id: string;
  label: string;
  low: number;
  high: number;
}

/** Comfortable (not extreme) ranges; users can fine-tune low/high individually. */
export const VOCAL_PRESETS: readonly VocalPreset[] = [
  { id: 'middle', label: 'Middle, any voice (C3–G4)', low: 48, high: 67 },
  { id: 'bass', label: 'Bass (E2–E4)', low: 40, high: 64 },
  { id: 'baritone', label: 'Baritone (G2–G4)', low: 43, high: 67 },
  { id: 'tenor', label: 'Tenor (C3–C5)', low: 48, high: 72 },
  { id: 'alto', label: 'Alto (F3–F5)', low: 53, high: 77 },
  { id: 'mezzo', label: 'Mezzo-soprano (A3–A5)', low: 57, high: 81 },
  { id: 'soprano', label: 'Soprano (C4–C6)', low: 60, high: 84 },
];

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabledPitchClasses: [...ALL_PITCH_CLASSES],
  playbackOctaveMin: 3,
  playbackOctaveMax: 5,
  // A neutral range most adult voices can reach somewhere (an octave and a fifth).
  vocalLow: 48,
  vocalHigh: 67,
  scoringPolicy: 'pitch-class',
  replayPolicy: 'unlimited',
  replayOctave: 'same',
  chromaContrast: 'far',
  volume: 0.7,
  noteDuration: 1.5,
  waveform: 'piano',
  toleranceCents: 50,
  spelling: 'sharps',
  historyEnabled: true,
  scramble: false,
  referenceOctaves: 1,
});

export function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    enabledPitchClasses: [...DEFAULT_SETTINGS.enabledPitchClasses],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/**
 * Turn arbitrary (possibly stale or hand-edited) stored data into valid Settings.
 * Guarantees: at least one pitch class, ordered ranges, vocal span ≥ one octave.
 */
export function sanitizeSettings(input: unknown): Settings {
  const d = defaultSettings();
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  let pcs: PitchClass[] = d.enabledPitchClasses;
  if (Array.isArray(raw.enabledPitchClasses)) {
    const parsed = raw.enabledPitchClasses.filter(
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 11,
    );
    const unique = [...new Set(parsed.map(toPitchClass))].sort((a, b) => a - b);
    if (unique.length > 0) pcs = unique;
  }

  let octMin = Math.round(clamp(num(raw.playbackOctaveMin, d.playbackOctaveMin), OCTAVE_MIN, OCTAVE_MAX));
  let octMax = Math.round(clamp(num(raw.playbackOctaveMax, d.playbackOctaveMax), OCTAVE_MIN, OCTAVE_MAX));
  if (octMin > octMax) [octMin, octMax] = [octMax, octMin];

  const legacyScramble =
    typeof raw.scramble === 'object' && raw.scramble !== null ? (raw.scramble as Record<string, unknown>) : null;
  const scramble =
    typeof raw.scramble === 'boolean'
      ? raw.scramble
      : legacyScramble !== null &&
        ['identify', 'sing-practice', 'sing-test'].some((kind) => legacyScramble[kind] === true);
  const { low, high } = normalizeVocalRange(num(raw.vocalLow, d.vocalLow), num(raw.vocalHigh, d.vocalHigh));

  return {
    enabledPitchClasses: pcs,
    playbackOctaveMin: octMin,
    playbackOctaveMax: octMax,
    vocalLow: low,
    vocalHigh: high,
    scoringPolicy: oneOf(raw.scoringPolicy, ['pitch-class', 'exact'] as const, d.scoringPolicy),
    replayPolicy: oneOf(raw.replayPolicy, ['unlimited', 'single'] as const, d.replayPolicy),
    replayOctave: oneOf(raw.replayOctave, ['same', 'random', 'sweep'] as const, d.replayOctave),
    chromaContrast: oneOf(raw.chromaContrast, ['far', 'semitone', 'fifth', 'mixed'] as const, d.chromaContrast),
    volume: clamp(num(raw.volume, d.volume), 0, 1),
    noteDuration: clamp(num(raw.noteDuration, d.noteDuration), DURATION_MIN, DURATION_MAX),
    waveform: oneOf(raw.waveform, ['piano', 'sine', 'triangle', 'warm'] as const, d.waveform),
    toleranceCents: Math.round(clamp(num(raw.toleranceCents, d.toleranceCents), TOLERANCE_MIN, TOLERANCE_MAX)),
    spelling: oneOf(raw.spelling, ['sharps', 'flats'] as const, d.spelling),
    historyEnabled: typeof raw.historyEnabled === 'boolean' ? raw.historyEnabled : d.historyEnabled,
    scramble,
    referenceOctaves: ([1, 2, 3] as const).find((n) => n === raw.referenceOctaves) ?? d.referenceOctaves,
  };
}

/**
 * The octaves shown on the reference keyboard: `count` consecutive octaves containing `selected`,
 * centred on it where possible and shifted inwards at the ends of the playable range.
 */
export function visibleOctaves(selected: number, count: number): number[] {
  const n = clamp(Math.round(count), 1, OCTAVE_MAX - OCTAVE_MIN + 1);
  const start = clamp(selected - Math.floor((n - 1) / 2), OCTAVE_MIN, OCTAVE_MAX - n + 1);
  return Array.from({ length: n }, (_, i) => start + i);
}

/** Clamp a vocal range into bounds and widen it to at least one octave. */
export function normalizeVocalRange(lowIn: number, highIn: number): { low: number; high: number } {
  let low = Math.round(clamp(lowIn, VOCAL_MIDI_MIN, VOCAL_MIDI_MAX));
  let high = Math.round(clamp(highIn, VOCAL_MIDI_MIN, VOCAL_MIDI_MAX));
  if (low > high) [low, high] = [high, low];
  if (high - low < VOCAL_MIN_SPAN) {
    high = Math.min(VOCAL_MIDI_MAX, low + VOCAL_MIN_SPAN);
    low = Math.min(low, high - VOCAL_MIN_SPAN);
  }
  return { low, high };
}

/** Toggle one pitch class, refusing to remove the last enabled one. */
export function togglePitchClass(enabled: readonly PitchClass[], pc: PitchClass): PitchClass[] {
  if (enabled.includes(pc)) {
    return enabled.length > 1 ? enabled.filter((p) => p !== pc) : [...enabled];
  }
  return [...enabled, pc].sort((a, b) => a - b);
}

export function allPitchClasses(): PitchClass[] {
  return [...ALL_PITCH_CLASSES];
}

export function naturalPitchClasses(): PitchClass[] {
  return [...NATURAL_PITCH_CLASSES];
}
