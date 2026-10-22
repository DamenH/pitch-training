import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: null as unknown, load: vi.fn() }));
vi.mock('../src/audio/context', () => ({
  getAudioContext: () => mocks.context,
  resumeAudio: async () => mocks.context,
}));
vi.mock('../src/audio/piano', () => ({ loadPianoNote: mocks.load }));

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
}
function makeContext() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    get currentTime() { return Date.now() / 1000; },
    destination: {},
    createGain: () => {
      const node = { context: ctx, gain: parameter(), connect: vi.fn((destination) => destination), disconnect: vi.fn() };
      return node;
    },
    createDynamicsCompressor: () => ({ threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect: vi.fn() }),
    createBufferSource: () => {
      const source = { buffer: null, playbackRate: parameter(), connect: vi.fn((destination) => destination), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null };
      sources.push(source);
      return source;
    },
  };
  return { ctx, sources };
}
const opts = { waveform: 'piano' as const, duration: 4, volume: 0.5 };
const sample = { buffer: {}, normalize: 1, sample: { midi: 60, file: 'C4.mp3', tuningCents: 0 } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  mocks.load.mockReset().mockResolvedValue(sample);
});
afterEach(() => { vi.useRealTimers(); });

describe('polyphonic piano voices', () => {
  it('starts overlapping voices and releases each key independently', async () => {
    const { ctx, sources } = makeContext(); mocks.context = ctx;
    const { startPolyNote } = await import('../src/audio/synth');
    const releaseC = startPolyNote(261.6, opts);
    const releaseE = startPolyNote(329.6, opts);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.stop.mock.calls.length)).toEqual([1, 1]); // scheduled natural ends only
    releaseC();
    expect(sources.map((s) => s.stop.mock.calls.length)).toEqual([2, 1]);
    releaseE();
    expect(sources.map((s) => s.stop.mock.calls.length)).toEqual([2, 2]);
  });
  it('does not play a ghost note when a key is released before its sample loads', async () => {
    const { ctx, sources } = makeContext(); mocks.context = ctx;
    let loaded!: (value: unknown) => void;
    mocks.load.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    const { startPolyNote } = await import('../src/audio/synth');
    const release = startPolyNote(261.6, opts);
    release(); loaded(sample);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(0);
  });
  it('stop cancels pending key loads as well as sounding notes', async () => {
    const { ctx, sources } = makeContext(); mocks.context = ctx;
    let loaded!: (value: unknown) => void;
    mocks.load.mockReturnValue(new Promise((resolve) => { loaded = resolve; }));
    const { startPolyNote, stopAll } = await import('../src/audio/synth');
    startPolyNote(261.6, opts);
    stopAll(); loaded(sample);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(0);
  });
  it('schedules chord attacks together, keeps future notes unallocated, and stops transport', async () => {
    const { ctx, sources } = makeContext(); mocks.context = ctx;
    const { playPianoScore, stopAll } = await import('../src/audio/synth');
    const progress = vi.fn();
    const playing = playPianoScore({ version: 1, title: 'Chord', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 1, velocity: 0.8 })).concat([{ midi: 72, time: 10, duration: 1, velocity: 0.8 }]) }, 0.5, progress);
    await vi.advanceTimersByTimeAsync(100);
    expect(sources).toHaveLength(3);
    expect(new Set(sources.map((s) => s.start.mock.calls[0]?.[0])).size).toBe(1);
    expect(progress.mock.calls.some(([, notes]) => notes.length === 3)).toBe(true);
    stopAll(); await playing;
    await vi.advanceTimersByTimeAsync(11000);
    expect(sources).toHaveLength(3);
    expect(progress).toHaveBeenLastCalledWith(0, []);
  });
});
