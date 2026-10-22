// Loads and decodes the bundled piano samples on demand. Everything is served
// from the app's own origin; no network access beyond the static site is needed.

import { nearestPianoSample, pianoSamplesForRange, type PianoSample } from './pianoSamples';

export interface LoadedSample {
  buffer: AudioBuffer;
  /** Gain that brings this recording's peak to 1, so every register plays at a similar level. */
  normalize: number;
}

const cache = new Map<string, Promise<LoadedSample>>();

// Decode with an OfflineAudioContext so preloading never creates (or warns about) the
// real output context before a user gesture. AudioBuffers can be played in any context.
let decoder: OfflineAudioContext | null = null;
function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  decoder ??= new OfflineAudioContext(2, 1, 44100);
  return decoder.decodeAudioData(data);
}

function sampleUrl(file: string): string {
  return `${import.meta.env.BASE_URL}samples/piano/${file}`;
}

function withNormalization(buffer: AudioBuffer): LoadedSample {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  }
  return { buffer, normalize: peak > 0 ? 1 / peak : 1 };
}

export function loadPianoSample(sample: PianoSample): Promise<LoadedSample> {
  let p = cache.get(sample.file);
  if (!p) {
    p = fetch(sampleUrl(sample.file))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${sample.file}`);
        return r.arrayBuffer();
      })
      .then(decode)
      .then(withNormalization);
    // Allow a retry after a failure (e.g. offline on first visit).
    p.catch(() => cache.delete(sample.file));
    cache.set(sample.file, p);
  }
  return p;
}

export async function loadPianoNote(midi: number): Promise<LoadedSample & { sample: PianoSample }> {
  const sample = nearestPianoSample(midi);
  return { ...(await loadPianoSample(sample)), sample };
}

/** Warm the cache for a MIDI range in the background; failures are ignored here. */
export function preloadPianoRange(low: number, high: number): void {
  for (const s of pianoSamplesForRange(low, high)) loadPianoSample(s).catch(() => undefined);
}
