import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../src/domain/music';
import {
  classifyObservation,
  isReliable,
  StablePitchTracker,
  type LiveState,
  type PitchObservation,
} from '../src/domain/pitch';
import { evaluateSing, type Question } from '../src/domain/exercise';

const FRAME_MS = 16; // ~60 fps analysis

function voiced(time: number, frequency: number, clarity = 0.97, rms = 0.05): PitchObservation {
  return { time, frequency, clarity, rms };
}
function silence(time: number): PitchObservation {
  return { time, frequency: 0, clarity: 0, rms: 0.0005 };
}
function noise(time: number): PitchObservation {
  // Loud but aperiodic: detectors report some frequency with low clarity.
  return { time, frequency: 300 + ((time * 7919) % 500), clarity: 0.4, rms: 0.05 };
}

/** Feed frames from `start` for `durationMs` and return the final state + end time. */
function feed(
  tracker: StablePitchTracker,
  start: number,
  durationMs: number,
  make: (t: number, i: number) => PitchObservation,
): { state: LiveState; end: number; states: LiveState[] } {
  const states: LiveState[] = [];
  let t = start;
  let i = 0;
  for (; t < start + durationMs; t += FRAME_MS, i++) states.push(tracker.push(make(t, i)));
  return { state: states[states.length - 1]!, end: t - FRAME_MS, states };
}

describe('observation reliability', () => {
  it('rejects quiet input as silence', () => {
    expect(classifyObservation(silence(0))).toBe('silent');
    expect(classifyObservation(voiced(0, 440, 0.99, 0.001))).toBe('silent');
  });

  it('rejects low-clarity input as unclear rather than as a note', () => {
    expect(classifyObservation(voiced(0, 440, 0.5))).toBe('unclear');
    expect(classifyObservation(voiced(0, 0, 0))).toBe('unclear');
  });

  it('rejects frequencies outside the vocal band', () => {
    expect(classifyObservation(voiced(0, 30))).toBe('out-of-range');
    expect(classifyObservation(voiced(0, 3000))).toBe('out-of-range');
  });

  it('accepts clear voiced input', () => {
    expect(isReliable(voiced(0, 220))).toBe(true);
  });
});

describe('StablePitchTracker', () => {
  it('reports silence and never produces a stable pitch from silence', () => {
    const tr = new StablePitchTracker();
    const { state, end } = feed(tr, 0, 1000, (t) => silence(t));
    expect(state.status).toBe('silent');
    expect(state.stable).toBeNull();
    expect(tr.latestStable(end, 2000).kind).toBe('none');
  });

  it('never classifies background noise as a note', () => {
    const tr = new StablePitchTracker();
    const { states, end } = feed(tr, 0, 1500, (t) => noise(t));
    expect(states.every((s) => s.stable === null && s.smoothed === null)).toBe(true);
    expect(states.at(-1)!.status).toBe('unclear');
    expect(tr.latestStable(end, 2000).kind).toBe('none');
  });

  it('becomes stable after ~250 ms of a consistent pitch, not before', () => {
    const tr = new StablePitchTracker();
    const f = midiToFrequency(57);
    const { states } = feed(tr, 0, 400, (t) => voiced(t, f * 2 ** ((Math.sin(t / 30) * 8) / 1200)));
    const firstStable = states.findIndex((s) => s.status === 'stable');
    expect(firstStable).toBeGreaterThan(0);
    const stableAt = firstStable * FRAME_MS;
    expect(stableAt).toBeGreaterThanOrEqual(250);
    expect(stableAt).toBeLessThan(300);
    expect(states.slice(0, firstStable).every((s) => s.status === 'unstable')).toBe(true);
    expect(states.at(-1)!.stable!.midi).toBeCloseTo(57, 1);
  });

  it('does not treat a glide (exploring the range) as stable', () => {
    const tr = new StablePitchTracker();
    // Slide from G3 to C5 over 1.2 s: ~1700 cents per second.
    const { states, end } = feed(tr, 0, 1200, (t) => voiced(t, midiToFrequency(55 + (t / 1200) * 17)));
    expect(states.every((s) => s.stable === null)).toBe(true);
    expect(states.at(-1)!.status).toBe('unstable');
    expect(tr.latestStable(end, 2000).kind).toBe('none');
  });

  it('only keeps the latest held pitch after exploring', () => {
    const tr = new StablePitchTracker();
    let t = feed(tr, 0, 400, (t) => voiced(t, midiToFrequency(60))).end; // hold C4
    t = feed(tr, t + FRAME_MS, 600, (tt) => voiced(tt, midiToFrequency(60 + ((tt - t) / 600) * 9))).end; // slide up
    t = feed(tr, t + FRAME_MS, 400, (tt) => voiced(tt, midiToFrequency(69.1))).end; // hold A4
    const r = tr.latestStable(t, 2000);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.pitch.midi).toBeCloseTo(69.1, 2);
  });

  it('survives brief dropouts but resets after longer gaps', () => {
    const f = midiToFrequency(64);
    const brief = new StablePitchTracker();
    const a = feed(brief, 0, 400, (t, i) => (i % 4 === 3 ? silence(t) : voiced(t, f)));
    expect(a.state.status).toBe('stable');

    const long = new StablePitchTracker();
    let t = feed(long, 0, 200, (tt) => voiced(tt, f)).end;
    t = feed(long, t + FRAME_MS, 200, (tt) => silence(tt)).end;
    const after = feed(long, t + FRAME_MS, 150, (tt) => voiced(tt, f));
    // 200 ms + 150 ms of voice but split by a 200 ms gap: not yet stable.
    expect(after.states.every((s) => s.status !== 'stable')).toBe(true);
  });

  it('outvotes an isolated octave glitch', () => {
    const tr = new StablePitchTracker();
    const f = midiToFrequency(45); // A2, low voice
    const { states } = feed(tr, 0, 500, (t, i) => voiced(t, i === 20 ? f * 2 : f));
    expect(states.at(-1)!.status).toBe('stable');
    expect(states.at(-1)!.stable!.midi).toBeCloseTo(45, 3);
  });

  it('retains the last stable pitch briefly after the voice stops, then reports it as stale', () => {
    const tr = new StablePitchTracker();
    const end = feed(tr, 0, 500, (t) => voiced(t, midiToFrequency(62))).end;
    const silentEnd = feed(tr, end + FRAME_MS, 3000, (t) => silence(t)).end;

    const soon = tr.latestStable(end + 800, 2000);
    expect(soon.kind).toBe('ok');
    if (soon.kind === 'ok') {
      expect(soon.pitch.midi).toBeCloseTo(62, 3);
      expect(soon.ageMs).toBeCloseTo(800, 0);
    }
    expect(tr.latestStable(silentEnd, 2000).kind).toBe('stale');
  });

  it('forgets everything on reset (new question)', () => {
    const tr = new StablePitchTracker();
    const end = feed(tr, 0, 500, (t) => voiced(t, 440)).end;
    tr.reset();
    expect(tr.latestStable(end, 2000).kind).toBe('none');
  });
});

describe('singing evaluation from synthetic observation sequences', () => {
  const q: Question = {
    id: 'q',
    kind: 'sing-test',
    targetMidi: 69,
    targetPitchClass: 9,
    scoringPolicy: 'pitch-class',
    createdAt: 0,
  };

  function submit(tr: StablePitchTracker, now: number) {
    const latest = tr.latestStable(now, 2000);
    return evaluateSing(q, latest.kind === 'ok' ? { kind: 'ok', pitch: latest.pitch } : latest, 50);
  }

  it('scores the settled pitch, not intermediate pitches from exploration', () => {
    const tr = new StablePitchTracker();
    // Scoop from F3 up past A3 to C4, settle on A3 slightly sharp, then stop and submit.
    let t = feed(tr, 0, 500, (tt) => voiced(tt, midiToFrequency(53 + (tt / 500) * 7))).end;
    t = feed(tr, t + FRAME_MS, 300, (tt) => voiced(tt, midiToFrequency(60 - ((tt - t) / 300) * 3))).end;
    t = feed(tr, t + FRAME_MS, 500, (tt) => voiced(tt, midiToFrequency(57.2))).end;
    t = feed(tr, t + FRAME_MS, 400, (tt) => silence(tt)).end;
    const r = submit(tr, t);
    expect(r.outcome).toBe('correct');
    if (r.outcome !== 'no-detection') {
      expect(r.comparison.detectedMidi).toBe(57);
      expect(r.comparison.cents).toBeCloseTo(20, 0);
    }
  });

  it('reports no detection for silence and noise instead of a wrong answer', () => {
    const tr = new StablePitchTracker();
    const t = feed(tr, 0, 1000, (tt, i) => (i % 2 ? noise(tt) : silence(tt))).end;
    expect(submit(tr, t)).toMatchObject({ outcome: 'no-detection', reason: 'never' });
  });

  it('refuses to evaluate stale data', () => {
    const tr = new StablePitchTracker();
    let t = feed(tr, 0, 500, (tt) => voiced(tt, 440)).end;
    t = feed(tr, t + FRAME_MS, 5000, (tt) => silence(tt)).end;
    expect(submit(tr, t)).toMatchObject({ outcome: 'no-detection', reason: 'stale' });
  });

  it('marks a held wrong note as incorrect', () => {
    const tr = new StablePitchTracker();
    const t = feed(tr, 0, 500, (tt) => voiced(tt, midiToFrequency(67))).end;
    expect(submit(tr, t).outcome).toBe('incorrect');
  });
});
