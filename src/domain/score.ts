import { Midi } from '@tonejs/midi';

export interface ScoreNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}
export interface PianoScore {
  version: 1;
  title: string;
  notes: ScoreNote[];
}
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_LINK_CHARS = 64_000;
export const MAX_NOTES = 10_000;
export const MAX_SECONDS = 3600;

export function validateScore(raw: unknown): PianoScore {
  if (!raw || typeof raw !== 'object') throw new Error('Expected a piano score object.');
  const score = raw as Record<string, unknown>;
  if (score.version !== 1) throw new Error('Score version must be 1.');
  if (!Array.isArray(score.notes) || !score.notes.length || score.notes.length > MAX_NOTES) {
    throw new Error(`Scores must contain 1–${MAX_NOTES.toLocaleString()} notes.`);
  }
  const notes = score.notes.map((raw, i): ScoreNote => {
    const n = raw as Partial<ScoreNote> | null;
    if (!n || typeof n !== 'object' || !Number.isInteger(n.midi) || n.midi! < 0 || n.midi! > 127 ||
      typeof n.time !== 'number' || !Number.isFinite(n.time) || n.time < 0 ||
      typeof n.duration !== 'number' || !Number.isFinite(n.duration) || n.duration <= 0 ||
      n.time + n.duration > MAX_SECONDS ||
      (n.velocity !== undefined && (typeof n.velocity !== 'number' || !Number.isFinite(n.velocity) || n.velocity < 0 || n.velocity > 1))) {
      throw new Error(`Invalid note ${i + 1}. Use MIDI 0–127, nonnegative time, positive duration (seconds), and velocity 0–1; maximum length is one hour.`);
    }
    return { midi: n.midi!, time: n.time, duration: n.duration, velocity: n.velocity ?? 0.8 };
  }).sort((a, b) => a.time - b.time || a.midi - b.midi || a.duration - b.duration || a.velocity - b.velocity);
  // Limit simultaneous sounding notes to keep scheduling bounded on phones.
  const events = notes.flatMap((n) => [[n.time, 1], [n.time + Math.min(n.duration, 4.15) + 0.37, -1]]);
  events.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
  let active = 0;
  for (const [, delta] of events) {
    active += delta!;
    if (active > 64) throw new Error('This score exceeds the 64-voice piano limit.');
  }
  return { version: 1, title: typeof score.title === 'string' ? score.title.trim().slice(0, 160) || 'Untitled' : 'Untitled', notes };
}

export function parseScoreText(text: string): PianoScore {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Text is too large (maximum 2 MiB).');
  try { return validateScore(JSON.parse(text)); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('Paste a JSON piano score. See the example or agents.txt.');
    throw error;
  }
}

/** Type 0/1 PPQ Standard MIDI Files; all melodic tracks use our piano. */
export function parseMidi(bytes: Uint8Array, title = 'Imported MIDI'): PianoScore {
  if (bytes.length > MAX_IMPORT_BYTES) throw new Error('MIDI file is too large (maximum 2 MiB).');
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'MThd') throw new Error('Not a Standard MIDI File.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4) !== 6 || view.getUint16(8) > 1 || view.getUint16(12) === 0 || view.getUint16(12) & 0x8000) {
    throw new Error('Use a type 0 or 1 MIDI file with PPQ timing. Type 2 and SMPTE timing are not supported.');
  }
  let midi: Midi;
  try { midi = new Midi(bytes); }
  catch { throw new Error('The MIDI file is incomplete or invalid.'); }
  const notes: ScoreNote[] = [];
  for (const track of midi.tracks) {
    if (track.channel === 9) continue; // GM percussion is not pitched piano.
    const pedal = track.controlChanges[64] ?? [];
    let releaseTime = Math.max(track.duration, midi.header.ticksToSeconds(track.endOfTrackTicks ?? track.durationTicks));
    const nextRelease = new Array<number>(pedal.length);
    for (let i = pedal.length - 1; i >= 0; i--) {
      if (pedal[i]!.value < 0.5) releaseTime = pedal[i]!.time;
      nextRelease[i] = releaseTime;
    }
    const nextStarts = new Map<number, number>();
    for (let i = track.notes.length - 1; i >= 0; i--) {
      const note = track.notes[i]!;
      let end = note.time + note.duration;
      let low = 0;
      let high = pedal.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pedal[middle]!.time <= end) low = middle + 1;
        else high = middle;
      }
      const before = pedal[low - 1];
      if (before && before.value >= 0.5) {
        end = Math.max(end, Math.min(nextRelease[low - 1]!, nextStarts.get(note.midi) ?? Infinity));
      }
      nextStarts.set(note.midi, note.time);
      if (note.duration > 0 && note.velocity > 0) notes.push({ midi: note.midi, time: note.time, duration: end - note.time, velocity: note.velocity });
      if (notes.length > MAX_NOTES) throw new Error(`MIDI has more than ${MAX_NOTES.toLocaleString()} notes.`);
    }
  }
  if (!notes.length) throw new Error('No pitched notes found. Percussion-only files are not supported.');
  // midi-file represents text meta-events as byte strings. Prefer UTF-8, but
  // retain older Latin-1 names when those bytes aren't valid UTF-8.
  let name = midi.name;
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(name, (c) => c.charCodeAt(0))); }
  catch { /* Keep the legacy name. */ }
  return validateScore({ version: 1, title: name || title.replace(/\.midi?$/i, ''), notes });
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(encoded: string): Uint8Array {
  if (!encoded || encoded.length > MAX_LINK_CHARS || !/^[\w-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('Invalid or oversized base64url payload (maximum 64,000 characters).');
  }
  try { return Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); }
  catch { throw new Error('Invalid base64url payload.'); }
}

export function scoreFromHash(hash: string): PianoScore | null {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const score = params.get('score');
  const midi = params.get('midi');
  if (score !== null && midi !== null) throw new Error('Use either score or midi in the link, not both.');
  if (score !== null) return parseScoreText(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(score)));
  if (midi !== null) return parseMidi(decodeBase64Url(midi));
  return null;
}

export function scoreHash(score: PianoScore): string {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(validateScore(score))));
  if (payload.length > MAX_LINK_CHARS) throw new Error('This piece is too large for a link. Export the score and share the file instead.');
  return `#/reference?score=${payload}`;
}

export function scoreDuration(score: PianoScore): number {
  return Math.max(...score.notes.map((n) => n.time + n.duration));
}

/** Export our piano-only score as a Standard MIDI File, using 120 BPM / 480 PPQ. */
export function scoreToMidi(score: PianoScore): Uint8Array {
  const validated = validateScore(score);
  const midi = new Midi();
  midi.header.name = String.fromCharCode(...new TextEncoder().encode(validated.title));
  midi.header.setTempo(120);
  // Separate overlapping instances of the same pitch onto melodic channels;
  // otherwise MIDI note-offs cannot unambiguously identify which voice ends.
  const channels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  const tracks = new Map<number, ReturnType<Midi['addTrack']>>();
  const ending = channels.map(() => new Map<number, number>());
  for (const note of validated.notes) {
    if (note.velocity === 0) continue;
    const ticks = Math.round(midi.header.secondsToTicks(note.time));
    const end = Math.round(midi.header.secondsToTicks(note.time + note.duration));
    const durationTicks = Math.max(1, end - ticks);
    const index = ending.findIndex((notes) => (notes.get(note.midi) ?? -1) <= ticks);
    if (index < 0) throw new Error('MIDI export supports up to 15 overlapping voices of the same pitch. Export the JSON score instead.');
    ending[index]!.set(note.midi, ticks + durationTicks);
    const channel = channels[index]!;
    let track = tracks.get(channel);
    if (!track) {
      track = midi.addTrack();
      track.channel = channel;
      track.instrument.number = 0;
      tracks.set(channel, track);
    }
    track.addNote({ midi: note.midi, ticks, durationTicks, velocity: note.velocity });
  }
  return midi.toArray();
}
