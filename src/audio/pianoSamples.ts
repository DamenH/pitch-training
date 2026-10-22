// Sample map for the bundled Salamander Grand Piano excerpts (public/samples/piano/).
// Pure data + maths so the mapping can be unit-tested without Web Audio.

export interface PianoSample {
  file: string;
  /** Nominal MIDI note of the recording. */
  midi: number;
  /**
   * Measured deviation of the recording's fundamental from 12-TET (A4 = 440 Hz), in cents.
   * Real pianos are stretch-tuned (bass flat, treble sharp); playback compensates so every
   * note the app plays is exactly equal-tempered. Measured with the McLeod pitch method
   * (median over the sustain portion of each sample).
   */
  tuningCents: number;
}

/** One sample every minor third, so any note is at most one semitone from a recording. */
export const PIANO_SAMPLES: readonly PianoSample[] = [
  // Lowest register: weak fundamentals make the measurement approximate (±5¢).
  { file: 'C1.mp3', midi: 24, tuningCents: -11.5 },
  { file: 'Ds1.mp3', midi: 27, tuningCents: -1.3 },
  { file: 'Fs1.mp3', midi: 30, tuningCents: 1.5 },
  { file: 'A1.mp3', midi: 33, tuningCents: 5.0 },
  { file: 'C2.mp3', midi: 36, tuningCents: 13.6 },
  { file: 'Ds2.mp3', midi: 39, tuningCents: 8.1 },
  { file: 'Fs2.mp3', midi: 42, tuningCents: 2.2 },
  { file: 'A2.mp3', midi: 45, tuningCents: 3.8 },
  { file: 'C3.mp3', midi: 48, tuningCents: -1.2 },
  { file: 'Ds3.mp3', midi: 51, tuningCents: 3.2 },
  { file: 'Fs3.mp3', midi: 54, tuningCents: -0.4 },
  { file: 'A3.mp3', midi: 57, tuningCents: 2.4 },
  { file: 'C4.mp3', midi: 60, tuningCents: 4.6 },
  { file: 'Ds4.mp3', midi: 63, tuningCents: 2.5 },
  { file: 'Fs4.mp3', midi: 66, tuningCents: 0.2 },
  { file: 'A4.mp3', midi: 69, tuningCents: 3.7 },
  { file: 'C5.mp3', midi: 72, tuningCents: 7.2 },
  { file: 'Ds5.mp3', midi: 75, tuningCents: 8.5 },
  { file: 'Fs5.mp3', midi: 78, tuningCents: 4.9 },
  { file: 'A5.mp3', midi: 81, tuningCents: 5.7 },
  { file: 'C6.mp3', midi: 84, tuningCents: 8.6 },
  { file: 'Ds6.mp3', midi: 87, tuningCents: 10.6 },
  { file: 'Fs6.mp3', midi: 90, tuningCents: 14.1 },
  { file: 'A6.mp3', midi: 93, tuningCents: 12.4 },
  { file: 'C7.mp3', midi: 96, tuningCents: 22.2 },
  { file: 'Ds7.mp3', midi: 99, tuningCents: 18.2 },
  { file: 'Fs7.mp3', midi: 102, tuningCents: 27.9 },
  { file: 'A7.mp3', midi: 105, tuningCents: 40.4 },
];

/** Samples are trimmed to this length; notes must be released before it. */
export const PIANO_SAMPLE_SECONDS = 4.6;

/** The recording closest to `midi` (ties go to the lower sample, which stretches upward). */
export function nearestPianoSample(midi: number): PianoSample {
  let best = PIANO_SAMPLES[0]!;
  for (const s of PIANO_SAMPLES) {
    if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
  }
  return best;
}

/** playbackRate that turns `sample` into an exactly equal-tempered `midi` (may be fractional). */
export function pianoPlaybackRate(midi: number, sample: PianoSample): number {
  return 2 ** ((midi - sample.midi) / 12 - sample.tuningCents / 1200);
}

/** Samples needed to play every note in [low, high]. */
export function pianoSamplesForRange(low: number, high: number): PianoSample[] {
  const set = new Set<PianoSample>();
  for (let m = Math.ceil(low); m <= high; m++) set.add(nearestPianoSample(m));
  return [...set];
}
