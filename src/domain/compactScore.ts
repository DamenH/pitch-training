import { deflateSync, Inflate } from 'fflate';
import type { PianoScore, ScoreNote } from './score';

// Experimental sharing wire format. It does not replace the stored JSON schema.
const VERSION = 1;
const MAX_BYTES = 200_000;
const MAX_TIME_MS = 3_600_000;
const MAX_NOTES = 10_000;

interface WireNote { midi: number; time: number; duration: number; velocity: number }

function wireNotes(score: PianoScore): WireNote[] {
  return score.notes.map((note) => {
    const time = Math.min(MAX_TIME_MS - 1, Math.round(note.time * 1000));
    return {
      midi: note.midi,
      time,
      duration: Math.min(MAX_TIME_MS - time, Math.max(1, Math.round(note.duration * 1000))),
      velocity: Math.round(note.velocity * 127),
    };
  }).sort((a, b) => a.time - b.time || a.midi - b.midi || a.duration - b.duration || a.velocity - b.velocity);
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  let result = values[0]!;
  let most = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > most) { result = value; most = count; }
  }
  return result;
}

function writeUint(bytes: number[], value: number): void {
  do {
    const low = value % 128;
    value = Math.floor(value / 128);
    bytes.push(low | (value ? 0x80 : 0));
  } while (value);
}

/** Call with a validated score. Times are quantized to milliseconds and velocity to 7 bits. */
export function packScore(score: PianoScore): Uint8Array {
  const notes = wireNotes(score);
  const duration = mode(notes.map((n) => n.duration));
  const velocity = mode(notes.map((n) => n.velocity));
  const title = new TextEncoder().encode(score.title === 'Untitled' ? '' : score.title);
  const bytes: number[] = [];
  writeUint(bytes, title.length);
  bytes.push(...title);
  writeUint(bytes, notes.length);
  writeUint(bytes, duration);
  bytes.push(velocity);
  let previousTime = 0;
  for (let i = 0; i < notes.length;) {
    const time = notes[i]!.time;
    let end = i + 1;
    while (end < notes.length && notes[end]!.time === time) end++;
    writeUint(bytes, time - previousTime);
    writeUint(bytes, end - i);
    previousTime = time;
    while (i < end) {
      const note = notes[i++]!;
      const flags = (note.duration !== duration ? 1 : 0) | (note.velocity !== velocity ? 2 : 0);
      bytes.push(note.midi | (flags ? 0x80 : 0));
      if (flags) {
        bytes.push(flags);
        if (flags & 1) writeUint(bytes, note.duration);
        if (flags & 2) bytes.push(note.velocity);
      }
    }
  }
  const raw = Uint8Array.from(bytes);
  const compressed = deflateSync(raw, { level: 9 });
  const useCompressed = compressed.length < raw.length;
  const body = useCompressed ? compressed : raw;
  const packet = new Uint8Array(2 + body.length);
  packet.set([VERSION, useCompressed ? 1 : 0]);
  packet.set(body, 2);
  return packet;
}

function inflateBounded(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let finished = false;
  const inflate = new Inflate((chunk, final) => {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Compact link expands beyond the size limit.');
    chunks.push(chunk.slice());
    finished = final;
  });
  // Small input chunks bound each expansion allocation before checking its size.
  for (let i = 0; i < bytes.length; i += 128) {
    inflate.push(bytes.subarray(i, i + 128), i + 128 >= bytes.length);
  }
  if (!finished) throw new Error('Incomplete compressed link.');
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

class Reader {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}
  byte(): number {
    if (this.offset >= this.bytes.length) throw new Error('Incomplete compact link.');
    return this.bytes[this.offset++]!;
  }
  uint(max: number): number {
    let value = 0;
    let factor = 1;
    for (let i = 0; i < 5; i++) {
      const byte = this.byte();
      value += (byte & 127) * factor;
      if (value > max) throw new Error('Compact link contains an out-of-range value.');
      if (!(byte & 128)) {
        if (i > 0 && byte === 0) throw new Error('Invalid compact integer.');
        return value;
      }
      factor *= 128;
    }
    throw new Error('Invalid compact integer.');
  }
}

/** Returns an untrusted score; the caller must still apply validateScore. */
export function unpackScore(packet: Uint8Array): PianoScore {
  if (packet.length < 3 || packet.length > MAX_BYTES + 2) throw new Error('Invalid compact link size.');
  if (packet[0] !== VERSION) throw new Error('Unsupported compact link version.');
  if (packet[1] !== 0 && packet[1] !== 1) throw new Error('Unsupported compact link flags.');
  const body = packet[1] === 1 ? inflateBounded(packet.subarray(2)) : packet.subarray(2);
  const r = new Reader(body);
  const titleLength = r.uint(640);
  if (r.offset + titleLength > body.length) throw new Error('Incomplete compact title.');
  const title = new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(r.offset, r.offset + titleLength)) || 'Untitled';
  r.offset += titleLength;
  const count = r.uint(MAX_NOTES);
  if (!count) throw new Error('Compact links must contain notes.');
  const defaultDuration = r.uint(MAX_TIME_MS);
  if (!defaultDuration) throw new Error('Compact note durations must be positive.');
  const defaultVelocity = r.byte();
  if (defaultVelocity > 127) throw new Error('Invalid compact velocity.');
  const notes: ScoreNote[] = [];
  let time = 0;
  while (notes.length < count) {
    time += r.uint(MAX_TIME_MS);
    if (time >= MAX_TIME_MS) throw new Error('Compact link exceeds one hour.');
    const group = r.uint(Math.min(64, count - notes.length));
    if (!group) throw new Error('Compact onset groups must contain notes.');
    for (let i = 0; i < group; i++) {
      const pitch = r.byte();
      let duration = defaultDuration;
      let velocity = defaultVelocity;
      if (pitch & 128) {
        const flags = r.byte();
        if (flags < 1 || flags > 3) throw new Error('Invalid compact note flags.');
        if (flags & 1) duration = r.uint(MAX_TIME_MS);
        if (flags & 2) velocity = r.byte();
      }
      if (!duration || time + duration > MAX_TIME_MS || velocity > 127) throw new Error('Invalid compact note.');
      notes.push({ midi: pitch & 127, time: time / 1000, duration: duration / 1000, velocity: velocity / 127 });
    }
  }
  if (r.offset !== body.length) throw new Error('Unexpected trailing compact data.');
  return { version: 1, title, notes };
}
