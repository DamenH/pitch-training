// One AudioContext for the whole app (iOS limits how many may exist).
// It is created lazily and resumed from a user gesture, as mobile browsers require.

let ctx: AudioContext | null = null;
let pendingResume: Promise<AudioContext> | null = null;

type AudioContextCtor = typeof AudioContext;

export function isWebAudioSupported(): boolean {
  return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
}

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    const Ctor: AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
    ctx = new Ctor({ latencyHint: 'interactive' });
  }
  return ctx;
}

async function attemptResume(c: AudioContext): Promise<boolean> {
  try {
    await c.resume();
  } catch {
    // Some mobile browsers reject resume() until the initiating tap completes.
  }
  return c.state === 'running';
}

function waitForCompletedGesture(c: AudioContext): { promise: Promise<void>; cancel: () => void } {
  let retrying = false;
  const events = ['pointerup', 'touchend', 'keydown'] as const;
  const cleanup = () => events.forEach((type) => window.removeEventListener(type, retry, true));
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  const retry = () => {
    if (retrying) return;
    retrying = true;
    void attemptResume(c).then((running) => {
      retrying = false;
      if (!running) return;
      cleanup();
      resolve();
    });
  };
  events.forEach((type) => window.addEventListener(type, retry, true));
  return { promise, cancel: cleanup };
}

/** Call from within a click/tap handler before producing or analysing sound. */
export function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state === 'running') return Promise.resolve(c);
  if (pendingResume) return pendingResume;

  const pending = (async () => {
    // Install the fallback synchronously so a quick pointer-up cannot slip past
    // while the first resume attempt is settling.
    const completedGesture = waitForCompletedGesture(c);
    if (await attemptResume(c)) completedGesture.cancel();
    else await completedGesture.promise;
    return c;
  })();
  pendingResume = pending;
  void pending.finally(() => {
    if (pendingResume === pending) pendingResume = null;
  });
  return pending;
}
