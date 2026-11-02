// A steady click at a tempo that can change while it runs. Beats are scheduled a little ahead
// on the audio clock (never timed by setTimeout, which drifts); a tempo change applies from the
// next beat not yet scheduled.

import { getAudioContext, resumeAudio } from './context';
import { scheduleMetronomeClick } from './synth';
import { beatsUntil } from '../domain/tempo';

/** How often the scheduler wakes, and how far ahead it schedules (ms / s). */
const TICK_MS = 25;
const LOOKAHEAD = 0.12;
/** Background tabs throttle timers to about once a second: schedule further ahead there. */
const HIDDEN_LOOKAHEAD = 1.2;

export class Metronome {
  private bpm: number;
  private lastBeat = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private cues: ReturnType<typeof setTimeout>[] = [];
  private run = 0;
  private muted = false;

  /**
   * @param volume read at each beat, so volume changes apply straight away
   * @param onbeat called as each beat sounds (for a visual pulse)
   */
  constructor(
    bpm: number,
    private readonly volume: () => number,
    private readonly onbeat?: () => void,
  ) {
    this.bpm = bpm;
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  /** Call from a tap or key handler: it resumes audio within the gesture (iOS). */
  start(): void {
    if (this.running) return;
    const mine = ++this.run;
    const ctxPromise = resumeAudio();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    void ctxPromise.then((ctx) => {
      if (mine !== this.run) return;
      // The first beat sounds straight away.
      this.lastBeat = ctx.currentTime + 0.05 - 60 / this.bpm;
      this.tick();
    });
  }

  stop(): void {
    this.run++;
    clearInterval(this.timer);
    this.timer = undefined;
    for (const cue of this.cues) clearTimeout(cue);
    this.cues = [];
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  /** Silent beats keep their place, so unmuting picks up in time. */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private tick(): void {
    const ctx = getAudioContext();
    if (ctx.state !== 'running' || this.lastBeat === 0) return;
    const now = ctx.currentTime;
    const horizon = now + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
    for (const at of beatsUntil(this.lastBeat, this.bpm, now, horizon)) {
      if (!this.muted) scheduleMetronomeClick(ctx, at, this.volume());
      this.lastBeat = at;
      if (this.onbeat) {
        const cue = setTimeout(() => {
          this.cues = this.cues.filter((c) => c !== cue);
          this.onbeat?.();
        }, Math.max(0, (at - now) * 1000));
        this.cues.push(cue);
      }
    }
  }
}
