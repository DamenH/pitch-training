import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import { decodeBase64Url, encodeBase64Url, parseMidi, parseScoreText, scoreFromHash, scoreHash, validateScore, MAX_IMPORT_BYTES, MAX_NOTES } from '../src/domain/score';

const chord = { version: 1, title: '三和音 🎹', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 1, velocity: 0.7 })) };

describe('piano score text and links', () => {
  it('round-trips overlapping notes and UTF-8 titles through the versioned hash', () => {
    const restored = scoreFromHash(scoreHash(validateScore(chord)))!;
    expect(restored.title).toBe(chord.title);
    expect(restored.notes.map((n) => [n.midi, n.time, n.duration])).toEqual(chord.notes.map((n) => [n.midi, n.time, n.duration]));
    expect(restored.notes[0]!.velocity).toBeCloseTo(0.7, 2);
  });
  it('defaults velocity/title and sorts note starts without changing overlap', () => {
    const s = parseScoreText(JSON.stringify({ version: 1, notes: [{ midi: 64, time: 1, duration: 1 }, { midi: 60, time: 0, duration: 2 }] }));
    expect(s.title).toBe('Untitled');
    expect(s.notes.map((n) => n.midi)).toEqual([60, 64]);
    expect(s.notes[0]?.velocity).toBe(0.8);
  });
  it.each([
    null, { ...chord, version: 2 }, { ...chord, notes: [] },
    ...[{ midi: 128 }, { midi: 60.5 }, { time: -1 }, { duration: 0 }, { duration: Infinity }, { velocity: NaN }, { time: 3599, duration: 2 }]
      .map((patch) => ({ ...chord, notes: [{ ...chord.notes[0], ...patch }] })),
  ])('rejects invalid score data: %j', (raw) => expect(() => validateScore(raw)).toThrow());
  it('bounds note count, simultaneous voices, file size and generated link length', () => {
    expect(() => validateScore({ ...chord, notes: Array(MAX_NOTES + 1).fill(chord.notes[0]) })).toThrow(/notes/);
    expect(() => validateScore({ ...chord, notes: Array(65).fill(chord.notes[0]) })).toThrow(/64-voice/);
    expect(() => parseScoreText(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow(/large/);
    const large = validateScore({ version: 1, notes: Array.from({ length: 1000 }, (_, i) => ({ midi: 60, time: i, duration: 0.5 })) });
    expect(scoreHash(large).length).toBeLessThan(300);
  });
  it('rejects ambiguous/malformed/oversized link payloads', () => {
    expect(scoreFromHash('#/reference')).toBeNull();
    for (const payload of ['', 'not+url/safe', 'A', 'a'.repeat(64_001)]) expect(() => decodeBase64Url(payload)).toThrow();
    expect(() => scoreFromHash('#/reference?score=e30&midi=e30')).toThrow(/either/);
    expect(() => scoreFromHash('#/reference?score=_w')).toThrow();
  });
  it('encodes binary bytes without percent-encoding or padding', () => {
    const bytes = new Uint8Array([0, 127, 128, 255, 250]);
    const encoded = encodeBase64Url(bytes);
    expect(encoded).toMatch(/^[\w-]+$/);
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });
});

describe('Standard MIDI File import', () => {
  it('merges pitched tracks, keeps tempo changes, velocity and overlap, skips percussion', () => {
    const midi = new Midi();
    midi.header.name = 'Tempo test';
    midi.header.tempos = [{ ticks: 0, bpm: 120 }, { ticks: 480, bpm: 60 }];
    midi.header.update();
    midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 960, velocity: 0.5 });
    midi.addTrack().addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.8 });
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 480 });
    const score = parseMidi(midi.toArray());
    expect(score.title).toBe('Tempo test');
    expect(score.notes).toHaveLength(2);
    expect(score.notes[0]?.duration).toBeCloseTo(1.5);
    expect(score.notes[1]?.time).toBeCloseTo(0.5);
    expect(score.notes[1]?.duration).toBeCloseTo(1);
    expect(score.notes[0]?.velocity).toBeCloseTo(0.5, 1);
    expect(scoreFromHash(`#/reference?midi=${encodeBase64Url(midi.toArray())}`)).toEqual(score);
  });
  it('extends notes under sustain to pedal up or same-note retrigger', () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addCC({ number: 64, ticks: 0, value: 1 });
    track.addCC({ number: 64, ticks: 1920, value: 0 });
    track.addNote({ midi: 60, ticks: 0, durationTicks: 240 });
    track.addNote({ midi: 64, ticks: 0, durationTicks: 240 });
    track.addNote({ midi: 60, ticks: 960, durationTicks: 240 });
    const score = parseMidi(midi.toArray());
    expect(score.notes[0]?.duration).toBeCloseTo(1);
    expect(score.notes[1]?.duration).toBeCloseTo(2);
    expect(score.notes[2]?.duration).toBeCloseTo(1);
  });
  it('rejects percussion-only, invalid, type-2, SMPTE and oversized files', () => {
    const midi = new Midi();
    const track = midi.addTrack(); track.channel = 9;
    track.addNote({ midi: 36, time: 0, duration: 1 });
    expect(() => parseMidi(midi.toArray())).toThrow(/No pitched notes/);
    expect(() => parseMidi(new Uint8Array([1, 2, 3]))).toThrow(/Not a Standard/);
    expect(() => parseMidi(new Uint8Array(MAX_IMPORT_BYTES + 1))).toThrow(/large/);
    const type2 = midi.toArray(); type2[9] = 2;
    expect(() => parseMidi(type2)).toThrow(/type 0 or 1/);
    const smpte = midi.toArray(); smpte[12] = 0x80;
    expect(() => parseMidi(smpte)).toThrow(/SMPTE/);
  });
});
