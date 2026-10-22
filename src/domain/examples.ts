import { validateScore, type PianoScore, type ScoreNote } from './score';

export interface PianoExample {
  id: string;
  title: string;
  category: 'Practice patterns' | 'Public-domain melodies';
  description: string;
  credit: string;
  source?: { label: string; url: string };
  create: () => PianoScore;
}

type BeatNote = readonly [midi: number, beats: number];

function melody(events: readonly BeatNote[], bpm: number, offset = 0, transpose = 0, velocity = 0.75): ScoreNote[] {
  let beat = 0;
  return events.map(([midi, beats]) => {
    const note = { midi: midi + transpose, time: offset + beat * 60 / bpm, duration: beats * 60 / bpm * 0.9, velocity };
    beat += beats;
    return note;
  });
}

function scale(root: number, intervals: number[]): ScoreNote[] {
  const ascending = intervals.map((interval) => root + interval);
  return melody([...ascending, ...ascending.slice(0, -1).reverse()].map((midi) => [midi, 1]), 120);
}

function piece(title: string, notes: ScoreNote[]): PianoScore {
  return validateScore({ version: 1, title, notes });
}

const odeOpening: BeatNote[] = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64].map((n) => [n, 1]);
const twinklePhrase = (notes: number[]): BeatNote[] => notes.map((n, i) => [n, i === notes.length - 1 ? 2 : 1]);
const twinkleA = twinklePhrase([60, 60, 67, 67, 69, 69, 67]);
const twinkleB = twinklePhrase([65, 65, 64, 64, 62, 62, 60]);
const twinkleC = twinklePhrase([67, 67, 65, 65, 64, 64, 62]);
const repeat = (phrase: BeatNote[]): BeatNote[] => [...phrase, ...phrase];
const frere: BeatNote[] = [
  ...repeat([[60, 1], [62, 1], [64, 1], [60, 1]]),
  ...repeat([[64, 1], [65, 1], [67, 2]]),
  ...repeat([[67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1]]),
  ...repeat([[60, 1], [55, 1], [60, 2]]),
];

// Independent, deliberately simple transcriptions of the public-domain melodies.
// Source links identify the underlying works; no third-party MIDI/recordings or
// modern piano arrangements are bundled. Practice patterns are generated here.
export const PIANO_EXAMPLES: readonly PianoExample[] = [
  {
    id: 'c-major-scale', title: 'C major scale', category: 'Practice patterns',
    description: 'C4–C5, ascending and descending. 120 BPM.', credit: 'Generated practice pattern',
    create: () => piece('C major scale', scale(60, [0, 2, 4, 5, 7, 9, 11, 12])),
  },
  {
    id: 'a-natural-minor-scale', title: 'A natural minor scale', category: 'Practice patterns',
    description: 'A3–A4, ascending and descending. 120 BPM.', credit: 'Generated practice pattern',
    create: () => piece('A natural minor scale', scale(57, [0, 2, 3, 5, 7, 8, 10, 12])),
  },
  {
    id: 'chromatic-scale', title: 'Chromatic scale', category: 'Practice patterns',
    description: 'Every semitone from C4 to C5 and back. 120 BPM.', credit: 'Generated practice pattern',
    create: () => piece('Chromatic scale', scale(60, Array.from({ length: 13 }, (_, i) => i))),
  },
  {
    id: 'octave-leaps', title: 'Octave leaps', category: 'Practice patterns',
    description: 'C3–C4–C5 and back, then D and E octaves. 100 BPM.', credit: 'Generated practice pattern',
    create: () => piece('Octave leaps', melody([48, 60, 72, 60, 48, 50, 62, 74, 62, 50, 52, 64, 76, 64, 52].map((n) => [n, 1]), 100)),
  },
  {
    id: 'ode-to-joy', title: 'Ode to Joy — opening theme', category: 'Public-domain melodies',
    description: 'A short melody in C major. 108 BPM.', credit: 'Ludwig van Beethoven (1824) · Simple melody transcription',
    source: { label: 'Work reference · Mutopia', url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528' },
    create: () => piece('Ode to Joy — opening theme', melody([
      ...odeOpening, [64, 1.5], [62, 0.5], [62, 2],
      ...odeOpening, [62, 1.5], [60, 0.5], [60, 2],
    ], 108)),
  },
  {
    id: 'twinkle-twinkle', title: 'Twinkle, Twinkle, Little Star', category: 'Public-domain melodies',
    description: 'The familiar tune, melody only, in C major. 108 BPM.', credit: 'Traditional French melody · Simple melody transcription',
    source: { label: 'Tune reference · Mutopia', url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2236' },
    create: () => piece('Twinkle, Twinkle, Little Star', melody([...twinkleA, ...twinkleB, ...twinkleC, ...twinkleC, ...twinkleA, ...twinkleB], 108)),
  },
  {
    id: 'frere-jacques-round', title: 'Frère Jacques — two-voice round', category: 'Public-domain melodies',
    description: 'A second piano voice enters eight beats later, one octave below. 120 BPM.', credit: 'Traditional French round · Simple two-voice transcription',
    source: { label: 'Tune reference · Noctave', url: 'https://noctavepiano.com/en/sheet-music/trad-frere-jacques/' },
    create: () => piece('Frère Jacques — two-voice round', [...melody(frere, 120), ...melody(frere, 120, 4, -12, 0.6)]),
  },
];

export function pianoExample(id: string): PianoScore {
  const example = PIANO_EXAMPLES.find((entry) => entry.id === id);
  if (!example) throw new Error('Unknown built-in MIDI example. Choose one from the examples below.');
  return example.create();
}

export function exampleFromHash(hash: string): PianoScore | null {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const id = params.get('example');
  if (id === null) return null;
  if (params.has('midi') || params.has('score')) throw new Error('Use example, midi or score in the link, not more than one.');
  return pianoExample(id);
}
