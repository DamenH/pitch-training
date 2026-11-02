<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    analyzeTaps,
    describeTempoError,
    evaluateTempo,
    formatRange,
    steadiness,
    steadyBeats,
    TAP_RESTART_MS,
    termByName,
    termForBpm,
    type TempoResult,
    type TempoTarget,
  } from '../domain/tempo';
  import { playClicks, stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { haptic } from '../lib/native';
  import { shouldIgnoreShortcut } from '../lib/keys';
  import Icon from './Icon.svelte';
  import TempoMark from './TempoMark.svelte';
  import TempoMeter from './TempoMeter.svelte';
  import TempoTargetLabel from './TempoTargetLabel.svelte';

  let {
    target,
    onresult,
    onnext,
  }: {
    target: TempoTarget;
    onresult: (result: TempoResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  /** Taps per round: the median of 7 intervals is steady enough to score. */
  const TAPS = 8;

  const s = $derived(settings.value);
  let taps = $state<number[]>([]);
  let result = $state<TempoResult | null>(null);
  let cv = $state(0);
  /** Counts taps, so the pad flashes on each one. */
  let flash = $state(0);
  const term = $derived(target.term === null ? undefined : termByName(target.term));

  // Taps make no sound: hearing them would let you correct your drift by ear.
  function tap(time: number) {
    if (result) return;
    const last = taps.at(-1);
    taps = last !== undefined && time - last > TAP_RESTART_MS ? [time] : [...taps, time];
    flash += 1;
    haptic('tap');
    if (taps.length < TAPS) return;
    const analysis = analyzeTaps(taps)!;
    cv = analysis.cv;
    result = evaluateTempo(target, analysis.bpm, s.tempoTolerancePct);
    haptic(result.correct ? 'success' : 'error');
    onresult(result, taps.at(-1)! - taps[0]!);
  }

  function startOver() {
    if (!result) taps = [];
  }

  function hear() {
    void playClicks(steadyBeats(target.bpm, TAPS), s.volume);
  }

  function isTapKey(e: KeyboardEvent): boolean {
    return e.key === ' ' || e.key === 't' || e.key === 'T';
  }

  // The pad handles its own keys, so Space taps on key-down rather than as a (late) click.
  function padKeyDown(e: KeyboardEvent) {
    if (!isTapKey(e) && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat && e.key !== 'Enter') tap(e.timeStamp);
  }

  function onkeydown(e: KeyboardEvent) {
    if (shouldIgnoreShortcut(e) || (e.target instanceof Element && e.target.closest('dialog'))) return;
    if (e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement || !result) return;
      e.preventDefault();
      onnext();
    } else if (isTapKey(e)) {
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (!e.repeat) tap(e.timeStamp);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      startOver();
    }
  }

  onDestroy(stopAll);

  const title = $derived(!result ? '' : result.correct ? 'On tempo' : result.errorPct > 0 ? 'Too fast' : 'Too slow');
</script>

<svelte:window {onkeydown} />

<section class="stack tap" aria-label="Tap the tempo">
  <p class="target">
    <span class="eyebrow">Tap</span>
    <span class="value"><TempoTargetLabel {target} /></span>
  </p>

  {#if result}
    <div class="reveal" aria-live="polite">
      <div class="verdict notice" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">{title}</p>
        <p class="detail">
          You tapped <strong><TempoMark bpm={result.bpm} /></strong> ({termForBpm(result.bpm).name}){#if term},
            {result.correct ? 'inside' : `${describeTempoError(result.errorPct)} of`} <em>{term.name}</em>
            ({formatRange(term)}).
          {:else}: {describeTempoError(result.errorPct)} against <TempoMark bpm={target.bpm} />.{/if}
          Your taps were {steadiness(cv)}.
        </p>
      </div>
      <TempoMeter errorPct={result.errorPct} tolerancePct={term ? 0 : s.tempoTolerancePct} />
      <button type="button" class="btn" onclick={hear}><Icon name="play" size={16} /> Hear it</button>
      <p class="muted small">Plays {TAPS} beats at {term ? `the middle of ${term.name}` : 'the target'}.</p>
    </div>
  {:else}
    <button
      type="button"
      class="pad"
      aria-label={`Tap pad: ${taps.length} of ${TAPS} taps`}
      onpointerdown={(e) => { if (e.button === 0) tap(e.timeStamp); }}
      onkeydown={padKeyDown}
      onkeyup={(e) => { if (isTapKey(e)) e.preventDefault(); }}
      onclick={(e) => { if (e.detail === 0) tap(performance.now()); }}
    >
      {#key flash}<span class="ring" class:lit={flash > 0} aria-hidden="true"></span>{/key}
      <span class="hint">{taps.length === 0 ? 'Tap here, or press Space' : 'Keep going'}</span>
    </button>
    <ol class="dots" aria-hidden="true">
      {#each { length: TAPS } as _, i (i)}<li class:on={i < taps.length}></li>{/each}
    </ol>
  {/if}

  <div class="action-bar">
    {#if result}
      <button type="button" class="btn primary" onclick={onnext} title="Next (Enter)">
        Next tempo <Icon name="arrow-right" />
      </button>
    {:else}
      <button type="button" class="btn" onclick={startOver} disabled={taps.length === 0} title="Start over (Backspace)">
        Start over
      </button>
    {/if}
  </div>
</section>

<style>
  .target {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
  }
  .value {
    font-size: clamp(2.25rem, 11vw, 3.25rem);
    font-weight: 800;
    line-height: 1.1;
    color: var(--tempo);
  }
  .pad {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    min-height: 220px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text-muted);
    font-weight: 600;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    overflow: hidden;
  }
  .pad:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .ring {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }
  .ring.lit {
    animation: flash 200ms ease-out forwards;
  }
  @keyframes flash {
    from {
      background: var(--tempo-soft);
    }
    to {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring.lit {
      animation-duration: 1ms;
    }
  }
  .hint {
    position: relative;
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .dots li {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .dots li.on {
    background: var(--tempo);
  }
  .reveal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
  }
  .reveal .verdict {
    width: 100%;
  }
  .reveal p {
    margin: 0;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .tap {
      flex: 1;
      padding-bottom: calc(var(--tap) + var(--space-4));
    }
    .pad {
      flex: 1;
      max-height: 420px;
    }
    .action-bar {
      position: fixed;
      left: 50%;
      bottom: calc(var(--nav-height) + var(--safe-bottom) + var(--space-2));
      width: min(var(--page-max), calc(100vw - 2 * var(--gutter) - var(--safe-left) - var(--safe-right)));
      padding: 0;
      margin: 0;
      transform: translateX(-50%);
      background: none;
    }
  }

  /* Phones on their side: one line for the target and a tighter reveal, so Next stays on screen. */
  @media (orientation: landscape) and (max-height: 500px) {
    .target {
      flex-direction: row;
      justify-content: center;
      align-items: baseline;
      gap: var(--space-2);
    }
    .value {
      font-size: var(--text-xl);
    }
    .pad {
      min-height: 130px;
    }
    .reveal {
      gap: var(--space-2);
    }
    .reveal .muted {
      display: none;
    }
  }
</style>
