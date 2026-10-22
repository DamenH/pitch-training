// One AudioContext for the whole app (iOS limits how many may exist).
// It is created lazily and resumed from a user gesture, as mobile browsers require.

let ctx: AudioContext | null = null;

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

/** Call from within a click/tap handler before producing or analysing sound. */
export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      // Some browsers reject resume() outside a gesture; playback will simply be silent.
    }
  }
  return c;
}
