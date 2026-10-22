// Small platform integrations that make the web app behave like an installed one.
// Each is optional: unsupported browsers simply skip it.

type HapticKind = 'tap' | 'success' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: 18,
  error: [28, 60, 28],
};

/** Brief vibration feedback (Android); a no-op where vibration is unavailable. */
export function haptic(kind: HapticKind): void {
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    // Some browsers throw when vibration is blocked by policy.
  }
}

/**
 * Handlers for controls that make a sound: fire on touch-down rather than on release,
 * as a native instrument would. Keyboard and assistive activation still use click.
 */
export function onPress(action: () => void) {
  return {
    onpointerdown(e: PointerEvent) {
      if (e.button !== 0 || (e.currentTarget as HTMLButtonElement).disabled) return;
      action();
    },
    onclick(e: MouseEvent) {
      if (e.detail === 0) action();
    },
  };
}

type AudioSessionType = 'playback' | 'play-and-record' | 'auto';

/**
 * Safari: "playback" keeps notes audible with the ringer switched off, like a music app.
 * Recording needs "play-and-record" while the microphone is open.
 */
export function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // Ignore browsers that reject a type they don't support.
  }
}

// Keep the screen on while the microphone listens or a piece plays.
const awakeReasons = new Set<string>();
let sentinel: { release(): Promise<void> } | null = null;
let requesting = false;

async function syncWakeLock() {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
  if (!wakeLock) return;
  if (awakeReasons.size === 0) {
    const held = sentinel;
    sentinel = null;
    await held?.release().catch(() => {});
    return;
  }
  if (sentinel || requesting || document.visibilityState !== 'visible') return;
  requesting = true;
  try {
    const lock = await wakeLock.request('screen');
    if (awakeReasons.size === 0) await lock.release();
    else sentinel = lock;
  } catch {
    // Denied (e.g. low battery); the screen may dim as usual.
  } finally {
    requesting = false;
  }
}

/** Ask for the screen to stay on (or no longer) for a named reason. */
export function keepAwake(reason: string, on: boolean): void {
  if (on) awakeReasons.add(reason);
  else awakeReasons.delete(reason);
  void syncWakeLock();
}

document.addEventListener('visibilitychange', () => {
  // The system drops wake locks when the page is hidden; take it again on return.
  if (document.visibilityState === 'visible') {
    sentinel = null;
    void syncWakeLock();
  }
});

/** Phones and tablets get the system share sheet; desktops copy the link. */
export function prefersShareSheet(): boolean {
  return typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
}
