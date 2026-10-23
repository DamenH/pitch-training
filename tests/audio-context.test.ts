import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('audio context activation', () => {
  it('waits for a completed gesture when pointer-down cannot unlock audio', async () => {
    class FakeAudioContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn(async () => {
        if (this.resume.mock.calls.length === 1) throw new DOMException('Gesture has not completed', 'NotAllowedError');
        this.state = 'running';
      });
    }

    const browser = new EventTarget() as EventTarget & { AudioContext: typeof AudioContext };
    const context = new FakeAudioContext();
    browser.AudioContext = class {
      constructor() { return context; }
    } as unknown as typeof AudioContext;
    vi.stubGlobal('window', browser);

    const { resumeAudio } = await import('../src/audio/context');
    const resumed = resumeAudio();
    let settled = false;
    void resumed.then(() => { settled = true; });
    await vi.waitFor(() => expect(context.resume).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);

    browser.dispatchEvent(new Event('pointerup'));

    await expect(resumed).resolves.toBe(context);
    expect(context.state).toBe('running');
    expect(context.resume).toHaveBeenCalledTimes(2);
  });
});
