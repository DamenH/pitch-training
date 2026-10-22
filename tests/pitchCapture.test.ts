import { describe, expect, it } from 'vitest';
import { PitchCapture, CAPTURE_HOLD_MS } from '../src/domain/pitchCapture';
import { StablePitchTracker, type PitchObservation } from '../src/domain/pitch';
import { midiToFrequency } from '../src/domain/music';

function session() {
  const detector = new StablePitchTracker();
  const capture = new PitchCapture();
  let time = 0;
  function feed(ms: number, midi: number | null, clarity = 0.98) {
    for (let end = time + ms; time < end; time += 16) {
      const observation: PitchObservation = { time, frequency: midi === null ? 0 : midiToFrequency(midi), clarity, rms: midi === null ? 0 : 0.08 };
      capture.push(detector.push(observation));
    }
    return capture.state;
  }
  return { detector, capture, feed, now: () => time };
}

describe('held-note capture', () => {
  it('shows progress and locks only after about 800 ms of a steady pitch', () => {
    const s = session();
    expect(s.feed(400, 60).phase).toBe('holding');
    expect(s.capture.state.progress).toBeGreaterThan(0);
    expect(s.capture.state.progress).toBeLessThan(1);
    expect(s.feed(CAPTURE_HOLD_MS - 450, 60).pitch).toBeNull();
    expect(s.feed(100, 60).phase).toBe('locked');
    expect(s.capture.state.pitch!.midi).toBeCloseTo(60);
  });
  it('accepts any held pitch without knowing the question or target', () => {
    for (const midi of [45, 60.15, 74.9]) {
      const s = session();
      expect(s.feed(1000, midi).pitch!.midi).toBeCloseTo(midi);
    }
  });
  it('freezes the capture through silence, a new pitch and long delays', () => {
    const s = session();
    const locked = s.feed(1000, 60);
    expect(s.feed(5000, null)).toBe(locked);
    expect(s.feed(2000, 69)).toBe(locked);
    expect(Object.isFrozen(locked.pitch)).toBe(true);
  });
  it('resets progress after sustained silence and requires a fresh hold', () => {
    const s = session();
    s.feed(500, 60);
    expect(s.feed(150, null).progress).toBe(0);
    expect(s.feed(500, 60).pitch).toBeNull();
    expect(s.feed(400, 60).phase).toBe('locked');
  });
  it('tolerates a brief dropout without advancing progress during the silence', () => {
    const s = session();
    const before = s.feed(400, 60).progress;
    expect(s.feed(48, null).progress).toBe(before);
    expect(s.feed(500, 60).phase).toBe('locked');
  });
  it('requires a new hold when the singer changes notes', () => {
    const s = session();
    s.feed(600, 60);
    expect(s.feed(500, 64).pitch).toBeNull();
    expect(s.feed(500, 64).pitch!.midi).toBeCloseTo(64);
  });
  it('does not capture noise or out-of-range sound', () => {
    const s = session();
    expect(s.feed(2000, 60, 0.3).phase).toBe('listening');
    expect(s.feed(2000, 110).pitch).toBeNull();
    expect(s.feed(2000, null).pitch).toBeNull();
  });
  it('does not accumulate a slow glide into a supposedly held note', () => {
    const s = session();
    for (let i = 0; i < 100; i++) {
      expect(s.feed(32, 60 + i * 0.04).pitch).toBeNull();
    }
  });
  it('re-record clears the frozen pitch and cannot reuse the previous hold', () => {
    const s = session();
    s.feed(1200, 60);
    s.capture.reset(s.now());
    s.detector.reset();
    expect(s.capture.state.pitch).toBeNull();
    expect(s.feed(400, 60).pitch).toBeNull();
    expect(s.feed(500, 60).pitch!.midi).toBeCloseTo(60);
  });
});
