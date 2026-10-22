// Microphone capture + McLeod pitch detection (via Pitchy). Audio never leaves
// the browser: frames are analysed in memory and only numbers are reported.

import { PitchDetector } from 'pitchy';
import { resumeAudio } from './context';
import type { PitchObservation } from '../domain/pitch';

export type MicErrorCode = 'unsupported' | 'insecure' | 'denied' | 'not-found' | 'busy' | 'interrupted' | 'unknown';

export class MicError extends Error {
  constructor(
    readonly code: MicErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** ~43 ms at 48 kHz: several periods of even a low bass note (E2 ≈ 82 Hz). */
const WINDOW_SIZE = 2048;

function toMicError(err: unknown): MicError {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return new MicError('denied', 'Microphone permission was denied.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new MicError('not-found', 'No microphone was found.');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new MicError('busy', 'The microphone is in use by another application or could not be started.');
    default:
      return new MicError('unknown', err instanceof Error ? err.message : 'The microphone could not be started.');
  }
}

export function checkMicSupport(): MicErrorCode | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

async function openStream(): Promise<MediaStream> {
  // Raw-ish audio is best for pitch detection. Browsers may ignore these hints.
  const preferred: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: preferred, video: false });
  } catch (err) {
    if (err instanceof Error && err.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    throw err;
  }
}

export class PitchInput {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frame = 0;
  private stopped = true;
  /** Incremented on every start/stop so a superseded start() can bail out. */
  private session = 0;

  get running(): boolean {
    return !this.stopped;
  }

  /**
   * Must be called from a user gesture. Resolves once analysis is running; frames are
   * delivered to `onFrame` until stop(). `onEnded` fires if the device goes away.
   */
  async start(onFrame: (obs: PitchObservation) => void, onEnded: (err: MicError) => void): Promise<void> {
    const unsupported = checkMicSupport();
    if (unsupported) {
      throw new MicError(
        unsupported,
        unsupported === 'insecure'
          ? 'Microphone access needs a secure (https) connection.'
          : 'This browser does not support microphone input.',
      );
    }
    this.stop();
    this.stopped = false;
    const session = ++this.session;

    // Resume audio inside the gesture before awaiting permission (iOS requirement).
    const ctxPromise = resumeAudio();
    let stream: MediaStream;
    try {
      stream = await openStream();
    } catch (err) {
      if (session === this.session) this.stopped = true;
      throw toMicError(err);
    }
    const ctx = await ctxPromise;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    if (this.stopped || session !== this.session) {
      // stop() (or another start()) happened while we waited for permission.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = WINDOW_SIZE;
    this.source.connect(this.analyser); // not connected to the speakers

    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (!this.stopped) {
          this.stop();
          onEnded(new MicError('interrupted', 'The microphone stopped unexpectedly.'));
        }
      });
    }

    const detector = PitchDetector.forFloat32Array(WINDOW_SIZE);
    detector.minVolumeAbsolute = 0.001;
    const buffer = new Float32Array(WINDOW_SIZE);
    const sampleRate = ctx.sampleRate;
    const analyser = this.analyser;

    const tick = () => {
      if (this.stopped) return;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
      const rms = Math.sqrt(sum / buffer.length);
      const [frequency, clarity] = detector.findPitch(buffer, sampleRate);
      onFrame({ time: performance.now(), frequency: Number.isFinite(frequency) ? frequency : 0, clarity, rms });
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    this.stopped = true;
    this.session++;
    cancelAnimationFrame(this.frame);
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.analyser = null;
    this.stream = null;
  }
}
