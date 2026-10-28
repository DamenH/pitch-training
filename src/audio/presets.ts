// Synthesizer voices described as data: a new sound (or, later, a sound editor) only adds a preset.

export interface SynthPreset {
  /** Oscillators mixed together. Detune is in cents; symmetric pairs keep the perceived pitch centred. */
  oscillators: readonly { type: OscillatorType; detune: number; gain: number }[];
  /** Low-pass cutoff as a multiple of the note's frequency. */
  brightness: number;
  /** Low-pass resonance (Q). */
  resonance: number;
  /** Seconds. */
  attack: number;
  release: number;
}

export type PresetName = 'soft';

export const PRESETS: Record<PresetName, SynthPreset> = {
  // Two gently detuned saws for body, a sine to anchor the fundamental, rounded off by the filter.
  // No vibrato: it would smear the pitch being judged.
  soft: {
    oscillators: [
      { type: 'sawtooth', detune: -4, gain: 0.35 },
      { type: 'sawtooth', detune: 4, gain: 0.35 },
      { type: 'sine', detune: 0, gain: 0.6 },
    ],
    brightness: 2.2,
    resonance: 0.5,
    attack: 0.06,
    release: 0.3,
  },
};

/** Cutoffs stay above muddy and below fizzy, whatever the note. */
export const CUTOFF_MIN = 400;
export const CUTOFF_MAX = 7000;

export function cutoffFor(preset: SynthPreset, frequency: number): number {
  return Math.min(CUTOFF_MAX, Math.max(CUTOFF_MIN, frequency * preset.brightness));
}

export function isPreset(name: string): name is PresetName {
  return name in PRESETS;
}
