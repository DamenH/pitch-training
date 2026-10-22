import { describe, expect, it } from 'vitest';
import { PIANO_EXAMPLES } from '../src/domain/examples';
import { encodeBase64Url, scoreHash, scoreToMidi, validateScore } from '../src/domain/score';

describe('sharing size benchmark (fragment characters, excluding common host/path)', () => {
  it('measures compact links against verbose JSON and raw MIDI', () => {
    const chord = validateScore({ version: 1, title: 'C major chord', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 1, velocity: 0.7 })) });
    const pieces = [chord, ...PIANO_EXAMPLES.map((e) => e.create())];
    const rows = pieces.map((piece) => {
      const json = `#/reference?score=${encodeBase64Url(new TextEncoder().encode(JSON.stringify(piece)))}`.length;
      const midi = `#/reference?midi=${encodeBase64Url(scoreToMidi(piece))}`.length;
      const compact = scoreHash(piece).length;
      expect(compact).toBeLessThan(json * 0.35);
      return { piece: piece.title, JSON: json, MIDI: midi, compact, reduction: `${Math.round((1 - compact / json) * 100)}%` };
    });
    console.table(rows);
  });
});
