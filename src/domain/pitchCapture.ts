import { frequencyToMidi, midiToFrequency } from './music';
import { classifyObservation, DEFAULT_DETECTOR_CONFIG, type LiveState, type StablePitch } from './pitch';

export const CAPTURE_HOLD_MS = 800;
export interface CaptureState {
  phase: 'listening' | 'holding' | 'locked';
  progress: number;
  pitch: Readonly<StablePitch> | null;
}

/** Target-independent capture. Only explicit reset can replace a locked answer. */
export class PitchCapture {
  state: CaptureState = { phase: 'listening', progress: 0, pitch: null };
  private anchor: number | null = null;
  private samples: number[] = [];
  private elapsed = 0;
  private lastAccepted = -Infinity;
  private lastFrame = -Infinity;
  private earliest = -Infinity;

  reset(now = -Infinity): CaptureState {
    this.anchor = null;
    this.samples = [];
    this.elapsed = 0;
    this.lastAccepted = -Infinity;
    this.lastFrame = now;
    this.earliest = now;
    return this.state = { phase: 'listening', progress: 0, pitch: null };
  }

  push(live: LiveState): CaptureState {
    if (this.state.phase === 'locked' || !live.raw) return this.state;
    const now = live.raw.time;
    if (now <= this.lastFrame) return this.state;
    const step = now - this.lastFrame;
    this.lastFrame = now;
    const stable = live.stable;
    const reliable = classifyObservation(live.raw) === 'reliable';
    const coherent = stable && reliable &&
      Math.abs(frequencyToMidi(live.raw.frequency) - stable.midi) * 100 <= DEFAULT_DETECTOR_CONFIG.maxSpreadCents;
    if (!coherent) {
      if (this.anchor !== null && now - this.lastAccepted > DEFAULT_DETECTOR_CONFIG.maxGapMs) this.reset(now);
      else if (this.anchor === null && !reliable) this.earliest = now;
      return this.state;
    }
    if (this.anchor !== null && Math.abs(stable.midi - this.anchor) * 100 > DEFAULT_DETECTOR_CONFIG.maxSpreadCents) {
      this.reset(now);
    }
    if (this.anchor === null) {
      this.anchor = stable.midi;
      this.elapsed = Math.max(0, now - Math.max(stable.since, this.earliest));
    } else {
      // Unreliable frames don't advance the bar. Short dropouts don't erase it.
      this.elapsed += Math.min(step, DEFAULT_DETECTOR_CONFIG.maxGapMs);
    }
    this.lastAccepted = now;
    this.samples.push(stable.midi);
    if (this.elapsed >= CAPTURE_HOLD_MS) {
      const sorted = [...this.samples].sort((a, b) => a - b);
      const middle = sorted.length >> 1;
      const midi = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
      const pitch = Object.freeze({ midi, frequency: midiToFrequency(midi), time: now, since: now - this.elapsed });
      return this.state = { phase: 'locked', progress: 1, pitch };
    }
    return this.state = { phase: 'holding', progress: this.elapsed / CAPTURE_HOLD_MS, pitch: null };
  }
}
