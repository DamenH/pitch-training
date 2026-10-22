// Reactive microphone controller shared by the singing exercises.
// Raw frames feed a StablePitchTracker; the UI sees a throttled LiveState.

import { MicError, PitchInput, type MicErrorCode } from '../audio/microphone';
import { StablePitchTracker, type LiveState } from '../domain/pitch';

export type MicStatus = 'idle' | 'starting' | 'running' | 'error';

const UI_INTERVAL_MS = 50;
const EMPTY: LiveState = { status: 'silent', smoothed: null, stable: null, raw: null };

class MicController {
  status = $state<MicStatus>('idle');
  error = $state<{ code: MicErrorCode; message: string } | null>(null);
  live = $state.raw<LiveState>(EMPTY);

  private input = new PitchInput();
  private tracker = new StablePitchTracker();
  private lastUiUpdate = 0;

  constructor() {
    // Release the microphone when the page is hidden (tab switch, phone locked).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.status !== 'idle') this.stop();
    });
  }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return;
    this.status = 'starting';
    this.error = null;
    this.tracker.reset();
    try {
      await this.input.start(
        (obs) => {
          const state = this.tracker.push(obs);
          if (obs.time - this.lastUiUpdate >= UI_INTERVAL_MS || state.status !== this.live.status) {
            this.lastUiUpdate = obs.time;
            this.live = state;
          }
        },
        (err) => this.fail(err),
      );
      if (this.input.running) this.status = 'running';
    } catch (err) {
      this.fail(err instanceof MicError ? err : new MicError('unknown', String(err)));
    }
  }

  stop(): void {
    this.input.stop();
    this.tracker.reset();
    this.live = EMPTY;
    if (this.status !== 'error') this.status = 'idle';
  }

  dismissError(): void {
    this.error = null;
    if (this.status === 'error') this.status = 'idle';
  }

  /** Forget previous pitches, e.g. when a new question starts. */
  resetTracking(): void {
    this.tracker.reset();
    this.live = EMPTY;
  }

  private fail(err: MicError): void {
    this.input.stop();
    this.status = 'error';
    this.error = { code: err.code, message: err.message };
    this.live = EMPTY;
  }
}

export const mic = new MicController();
