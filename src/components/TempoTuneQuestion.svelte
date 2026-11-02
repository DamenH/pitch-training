<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Metronome } from '../audio/metronome';
  import { playClicks, stopAll } from '../audio/synth';
  import {
    clampTempo,
    evaluateTempoTune,
    turnTempo,
    type TempoGrade,
    type TempoRound,
    type TempoTuneResult,
  } from '../domain/tempoTune';
  import { describeTempoError, formatRange, steadyBeats, termByName, termForBpm } from '../domain/tempo';
  import { settings } from '../lib/settings.svelte';
  import { playTempoScramble } from '../lib/scramble.svelte';
  import { haptic } from '../lib/native';
  import { shouldIgnoreShortcut } from '../lib/keys';
  import { signedPercent } from '../lib/format';
  import Icon from './Icon.svelte';
  import TempoMark from './TempoMark.svelte';
  import TempoMeter from './TempoMeter.svelte';
  import TempoTargetLabel from './TempoTargetLabel.svelte';
  import TuneWheel from './TuneWheel.svelte';

  let {
    round,
    autostart,
    onresult,
    onnext,
  }: {
    round: TempoRound;
    /** Begin straight away; the first round of a visit waits for a tap instead. */
    autostart: boolean;
    onresult: (result: TempoTuneResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  /** Drag sensitivity: % of tempo per px, so one swipe across the wheel covers about a third. */
  const PCT_PER_PX = 0.1;
  const NUDGE = 1;
  const BIG_NUDGE = 5;
  /** Compare plays this many beats of yours, a pause, then this many of the target. */
  const COMPARE_BEATS = 4;
  const COMPARE_GAP = 1;

  const s = $derived(settings.value);
  const term = $derived(round.target.term === null ? undefined : termByName(round.target.term));

  let phase = $state<'ready' | 'masking' | 'tuning' | 'revealed'>('ready');
  // svelte-ignore state_referenced_locally
  let bpm = $state(round.startBpm);
  let result = $state<TempoTuneResult | null>(null);
  let muted = $state(false);
  let startedAt = 0;
  let destroyed = false;
  let atEdge = false;
  // svelte-ignore state_referenced_locally
  const metronome = new Metronome(round.startBpm, () => settings.value.volume);

  async function begin() {
    if (phase !== 'ready') return;
    if (s.tuneMasker) {
      phase = 'masking';
      await playTempoScramble();
      if (destroyed) return;
    }
    phase = 'tuning';
    metronome.setBpm(bpm);
    metronome.setMuted(muted);
    metronome.start();
    startedAt = Date.now();
  }

  function move(pct: number) {
    if (phase !== 'tuning') return;
    const wanted = turnTempo(bpm, pct);
    const next = clampTempo(round, wanted);
    const edge = next !== wanted;
    if (edge && !atEdge) haptic('tap');
    atEdge = edge;
    bpm = next;
    metronome.setBpm(bpm);
  }

  function toggleMute() {
    if (phase !== 'tuning') return;
    muted = !muted;
    metronome.setMuted(muted);
  }

  function lock() {
    if (phase !== 'tuning') return;
    metronome.stop();
    result = evaluateTempoTune(round, bpm, s.tempoTolerancePct);
    phase = 'revealed';
    haptic(result.correct ? 'success' : 'error');
    onresult(result, Date.now() - startedAt);
    compare();
  }

  /** Yours, a pause, then the target. */
  function compare() {
    if (!result) return;
    const yours = steadyBeats(result.bpm, COMPARE_BEATS);
    const from = COMPARE_BEATS * (60 / result.bpm) + COMPARE_GAP;
    void playClicks([...yours, ...steadyBeats(round.target.bpm, COMPARE_BEATS).map((t) => from + t)], s.volume);
  }

  function onkeydown(e: KeyboardEvent) {
    // Keys inside the options sheet belong to its controls.
    if (shouldIgnoreShortcut(e) || (e.target instanceof Element && e.target.closest('dialog'))) return;
    if (e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (phase === 'ready') void begin();
      else if (phase === 'tuning') lock();
      else if (phase === 'revealed') onnext();
      return;
    }
    if ((e.key === 'm' || e.key === 'M') && phase === 'tuning') {
      e.preventDefault();
      toggleMute();
      return;
    }
    const step = e.shiftKey ? BIG_NUDGE : NUDGE;
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 10, PageDown: -10 }[e.key];
    if (delta !== undefined && phase === 'tuning') {
      e.preventDefault();
      move(delta);
    }
  }

  onMount(() => {
    if (autostart) void begin();
  });

  onDestroy(() => {
    destroyed = true;
    metronome.stop();
    stopAll();
  });

  /** Position within this round's random range, on the log scale the wheel turns on. */
  const position = $derived(Math.round((Math.log(bpm / round.low) / Math.log(round.high / round.low)) * 100));

  const GRADES: Record<TempoGrade, string> = {
    perfect: 'Perfect',
    close: 'Close',
    found: 'Found it',
    missed: 'Missed',
  };
</script>

<svelte:window {onkeydown} />

<section class="stack tempo-tune" aria-label="Tune the tempo">
  <p class="target">
    Tune to <strong><TempoTargetLabel target={round.target} /></strong>
    {#if round.anchor}<span class="muted">your anchor tempo</span>{:else if term}<span class="muted">anywhere in its range</span>{/if}
  </p>

  {#if phase === 'ready'}
    <div class="start">
      <button type="button" class="play" onclick={() => void begin()} title="Start (Enter)">
        <span class="disc"><Icon name="play" size={28} /></span>
        <span>Start round</span>
      </button>
      <p class="muted small">
        A metronome starts at a random tempo. Turn the wheel until it is
        {term ? term.name : 'the target'}, then lock it in. The tempo stays hidden until you do.
      </p>
    </div>
  {:else if phase === 'revealed' && result}
    <div class="reveal" aria-live="polite">
      <div class="verdict notice" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">
          {GRADES[result.grade]}
          {#if round.cold}<span class="badge" title="No tempo answered in the last hour">Cold</span>{/if}
        </p>
        <p class="pct">{term && result.correct ? 'In range' : signedPercent(result.errorPct)}</p>
        <p class="detail">
          You set <strong><TempoMark bpm={result.bpm} /></strong> ({termForBpm(result.bpm).name}){#if term},
            {result.correct ? 'inside' : `${describeTempoError(result.errorPct)} of`} <em>{term.name}</em>
            ({formatRange(term)}).
          {:else}: {describeTempoError(result.errorPct)} against <TempoMark bpm={round.target.bpm} />.{/if}
        </p>
      </div>
      <TempoMeter errorPct={result.errorPct} tolerancePct={term ? 0 : s.tempoTolerancePct} />
      <button type="button" class="btn" onclick={compare}><Icon name="play" size={16} /> Compare again</button>
      <p class="muted small">Plays {COMPARE_BEATS} beats at your tempo, then {COMPARE_BEATS} at the target.</p>
    </div>
  {:else}
    <TuneWheel
      enabled={phase === 'tuning'}
      travel={(Math.log(bpm) * 100) / PCT_PER_PX}
      {position}
      label="Tempo wheel. Drag, scroll or use the arrow keys to slow down or speed up the clicks."
      hint={phase === 'masking' ? 'Clearing your ear…' : 'Drag up to speed up'}
      onturn={(px) => move(px * PCT_PER_PX)}
      accent="var(--tempo)"
    />
    <div class="nudges">
      <button type="button" class="btn small" disabled={phase !== 'tuning'} onclick={() => move(-NUDGE)} title="Slower (↓)">
        Slower {NUDGE}%
      </button>
      <button
        type="button"
        class="btn small mute"
        disabled={phase !== 'tuning'}
        aria-pressed={muted}
        onclick={toggleMute}
        title={muted ? 'Unmute (M)' : 'Mute (M)'}
      >
        <Icon name={muted ? 'volume-off' : 'volume'} size={16} /> {muted ? 'Unmute' : 'Mute'}
      </button>
      <button type="button" class="btn small" disabled={phase !== 'tuning'} onclick={() => move(NUDGE)} title="Faster (↑)">
        Faster {NUDGE}%
      </button>
    </div>
  {/if}

  {#if phase !== 'ready'}
    <div class="action-bar">
      {#if phase === 'revealed'}
        <button type="button" class="btn primary" onclick={onnext} title="Next round (Enter)">
          Next round <Icon name="arrow-right" />
        </button>
      {:else}
        <button type="button" class="btn primary" onclick={lock} disabled={phase !== 'tuning'} title="Lock in (Enter)">
          Lock in
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .target {
    margin: 0;
    text-align: center;
    font-size: var(--text-lg);
  }
  .target strong {
    color: var(--tempo);
  }
  .target .muted {
    font-size: var(--text-sm);
  }

  .start {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding-block: var(--space-5);
    text-align: center;
  }
  .start p {
    max-width: 34ch;
    margin: 0;
  }
  .play {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .disc {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--tempo);
    color: var(--tempo-text);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--tempo) 35%, transparent);
    transition: transform 100ms var(--ease);
  }
  .play:active .disc {
    transform: scale(0.93);
  }
  .play:focus-visible {
    outline: none;
  }
  .play:focus-visible .disc {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }

  .nudges {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
    gap: var(--space-2);
  }
  .mute {
    border-color: var(--tempo);
    color: var(--tempo);
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
  .reveal .title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .pct {
    font-size: var(--text-display);
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .badge {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--tempo-soft);
    color: var(--tempo);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .tempo-tune {
      flex: 1;
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
    .tempo-tune:has(.action-bar) {
      padding-bottom: calc(var(--tap) + var(--space-4));
    }
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .pct {
      font-size: var(--text-xl);
    }
    .reveal {
      gap: var(--space-2);
    }
    .reveal .muted {
      display: none;
    }
  }
</style>
