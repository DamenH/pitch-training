<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    clampTune,
    evaluateTune,
    type TuneGrade,
    type TuneResult,
    type TuneRound,
  } from '../domain/anchor';
  import { midiToFrequency, noteName, pitchClassName } from '../domain/music';
  import { stopAll, type Tone } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playTuneComparison, preloadTuneRange, startTuneTone, strikeTuneNote, strikeTuneOctave } from '../lib/playback';
  import { playScramble } from '../lib/scramble.svelte';
  import { describeDeviation, signedCents } from '../lib/format';
  import { haptic } from '../lib/native';
  import { shouldIgnoreShortcut } from '../lib/keys';
  import Icon from './Icon.svelte';

  let {
    round,
    autostart,
    onresult,
    onnext,
  }: {
    round: TuneRound;
    /** Begin straight away; the first round of a visit waits for a tap instead. */
    autostart: boolean;
    onresult: (result: TuneResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  /** Drag sensitivity: one swipe across the wheel covers several semitones. */
  const CENTS_PER_PX = 2.5;
  const NUDGE = 5;
  const BIG_NUDGE = 50;
  /** Ridge spacing on the wheel, in px. */
  const RIDGE = 14;
  /** The reveal meter spans ± this many cents. */
  const METER = 100;
  /** Auto-strike waits this long after the last turn, so a drag isn't a run of notes. */
  const STRIKE_PAUSE_MS = 350;

  const s = $derived(settings.value);
  /** "C" at the any-octave level, "C4" at the exact level. */
  const anchorName = $derived(round.exact ? noteName(round.target, s.spelling) : pitchClassName(round.anchor, s.spelling));
  /** The piano can't sustain, so it is struck: by the Strike button, or by itself after turning. */
  // svelte-ignore state_referenced_locally
  const struck = s.tuneWaveform === 'piano';

  let phase = $state<'ready' | 'masking' | 'tuning' | 'revealed'>('ready');
  // svelte-ignore state_referenced_locally
  let midi = $state(round.startMidi);
  let result = $state<TuneResult | null>(null);
  let tone: Tone | null = null;
  let startedAt = 0;
  let destroyed = false;
  let atEdge = false;
  let strikeTimer: ReturnType<typeof setTimeout> | undefined;

  async function begin() {
    if (phase !== 'ready') return;
    if (s.tuneMasker) {
      phase = 'masking';
      await playScramble(round.anchor);
      if (destroyed) return;
    }
    phase = 'tuning';
    if (struck) strike();
    else tone = startTuneTone(midi);
    startedAt = Date.now();
  }

  function strike() {
    if (phase !== 'tuning') return;
    clearTimeout(strikeTimer);
    void strikeTuneNote(midi);
  }

  /** Hear the current pitch an octave down or up, to carry the anchor into other octaves. */
  function strikeOctave(direction: -1 | 1) {
    if (phase !== 'tuning') return;
    clearTimeout(strikeTimer);
    strikeTuneOctave(midi + 12 * direction);
  }

  function move(cents: number) {
    if (phase !== 'tuning') return;
    const next = clampTune(round, midi + cents / 100);
    const edge = next !== midi + cents / 100;
    if (edge && !atEdge) haptic('tap');
    atEdge = edge;
    midi = next;
    tone?.retune(midiToFrequency(midi));
    if (struck && s.tuneAutoStrike) {
      clearTimeout(strikeTimer);
      strikeTimer = setTimeout(strike, STRIKE_PAUSE_MS);
    }
  }

  function lock() {
    if (phase !== 'tuning') return;
    clearTimeout(strikeTimer);
    tone?.stop();
    tone = null;
    result = evaluateTune(round, midi, s.tuneToleranceCents);
    phase = 'revealed';
    haptic(result.correct ? 'success' : 'error');
    onresult(result, Date.now() - startedAt);
    compare();
  }

  function compare() {
    if (result) void playTuneComparison(result.answerMidi, result.referenceMidi);
  }

  // Dragging: relative only, so where your finger is says nothing about the pitch.
  let dragY: number | null = null;
  function onpointerdown(e: PointerEvent) {
    if (phase !== 'tuning') return;
    dragY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onpointermove(e: PointerEvent) {
    if (dragY === null) return;
    move((dragY - e.clientY) * CENTS_PER_PX);
    dragY = e.clientY;
  }
  function onpointerup() {
    dragY = null;
  }

  let wheel: HTMLElement | undefined = $state();
  $effect(() => {
    if (!wheel) return;
    const el = wheel;
    // Not passive, so scrolling the wheel turns it instead of the page.
    const onwheel = (e: WheelEvent) => {
      if (phase !== 'tuning') return;
      e.preventDefault();
      move(-e.deltaY * (e.deltaMode === 1 ? 10 : 0.25));
    };
    el.addEventListener('wheel', onwheel, { passive: false });
    return () => el.removeEventListener('wheel', onwheel);
  });

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
    if (e.key === ' ' && struck && phase === 'tuning') {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      strike();
      return;
    }
    if ((e.key === '[' || e.key === ']') && phase === 'tuning') {
      e.preventDefault();
      strikeOctave(e.key === '[' ? -1 : 1);
      return;
    }
    const step = e.shiftKey ? BIG_NUDGE : NUDGE;
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 100, PageDown: -100 }[e.key];
    if (delta !== undefined && phase === 'tuning') {
      e.preventDefault();
      move(delta);
    }
  }

  onMount(() => {
    if (struck) preloadTuneRange(round.low, round.high);
    if (autostart) void begin();
  });

  onDestroy(() => {
    destroyed = true;
    clearTimeout(strikeTimer);
    tone?.stop();
    stopAll();
  });

  /** Ridges scroll with the pitch, like turning a knob. */
  const turn = $derived((((-midi * 100) / CENTS_PER_PX) % RIDGE + RIDGE) % RIDGE);
  /** Position within this round's random range: says nothing about where the anchor is. */
  const position = $derived(Math.round(((midi - round.low) / (round.high - round.low)) * 100));

  const GRADES: Record<TuneGrade, string> = {
    perfect: 'Perfect',
    close: 'Close',
    found: 'Found it',
    missed: 'Missed',
  };
  const detail = $derived.by(() => {
    if (!result) return '';
    if (result.wrongOctave) {
      const off = Math.round(result.pitchClassCents);
      const how = off === 0 ? 'right on it' : describeDeviation(off).replace(/ (from|of)$/, '');
      return `Right note, wrong octave: you were on ${noteName(result.nearestMidi, s.spelling)}, ${how}.`;
    }
    const r = Math.round(result.cents);
    if (Math.abs(r) < 100) {
      const text = `${describeDeviation(r)} ${anchorName}.`;
      return text[0]!.toUpperCase() + text.slice(1);
    }
    // To the nearest half semitone, so −350¢ doesn't read as 4.
    const semis = Math.round(Math.abs(r) / 50) / 2;
    return `About ${semis} semitone${semis === 1 ? '' : 's'} ${r > 0 ? 'above' : 'below'} ${anchorName}.`;
  });
  const meterAt = $derived(result ? Math.max(-1, Math.min(1, result.cents / METER)) : 0);
  const toleranceWidth = $derived(Math.min(1, s.tuneToleranceCents / METER));
</script>

<svelte:window {onkeydown} />

<section class="stack tune" aria-label={`Tune to ${anchorName}`}>
  <div class="target-row">
    <button
      type="button"
      class="btn small plain octave"
      disabled={phase !== 'tuning'}
      onclick={() => strikeOctave(-1)}
      aria-label="Play an octave below"
      title="Play an octave below ([)"
    >
      <Icon name="play" size={14} /> −1
    </button>
    <p class="target">
      Tune to <strong>{anchorName}</strong>{#if !round.exact}{' '}<span class="muted">any octave</span>{/if}
    </p>
    <button
      type="button"
      class="btn small plain octave"
      disabled={phase !== 'tuning'}
      onclick={() => strikeOctave(1)}
      aria-label="Play an octave above"
      title="Play an octave above (])"
    >
      <Icon name="play" size={14} /> +1
    </button>
  </div>

  {#if phase === 'ready'}
    <div class="start">
      <button type="button" class="play" onclick={() => void begin()} title="Start (Enter)">
        <span class="disc"><Icon name="play" size={28} /></span>
        <span>Start round</span>
      </button>
      <p class="muted small">
        {#if struck}
          A piano note plays at a random pitch. Turn the wheel, strike to hear it, and lock it in at {anchorName}.
        {:else}
          A tone plays at a random pitch. Drag the wheel until it is {anchorName}, then lock it in.
        {/if}
      </p>
    </div>
  {:else if phase === 'revealed' && result}
    <div class="reveal" aria-live="polite">
      <div class="verdict notice" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">
          {GRADES[result.grade]}
          {#if round.cold}<span class="badge" title="Nothing answered in the last hour">Cold</span>{/if}
        </p>
        <p class="cents">{signedCents(result.cents)}</p>
        <p class="detail">{detail}</p>
      </div>
      <div class="meter" aria-hidden="true">
        <span class="band" style:--w={toleranceWidth}></span>
        <span class="zero"></span>
        <span class="marker" class:off={Math.abs(result.cents) > METER} style:--at={meterAt}></span>
        <span class="tick flat">−{METER}¢</span>
        <span class="tick sharp">+{METER}¢</span>
      </div>
      <button type="button" class="btn" onclick={compare}><Icon name="play" size={16} /> Compare again</button>
      <p class="muted small">Plays where you left the tone, then {anchorName}.</p>
    </div>
  {:else}
    <div
      class="wheel"
      class:idle={phase !== 'tuning'}
      bind:this={wheel}
      role="slider"
      tabindex="0"
      aria-label="Tuning wheel. Drag, scroll or use the arrow keys to raise or lower the tone."
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={position}
      aria-disabled={phase !== 'tuning'}
      style:--turn={`${turn}px`}
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      onpointercancel={onpointerup}
    >
      <span class="hint">{phase === 'masking' ? 'Clearing your ear…' : 'Drag up or down'}</span>
    </div>
    <div class="nudges" class:struck>
      <button type="button" class="btn small" disabled={phase !== 'tuning'} onclick={() => move(-NUDGE)} title="Lower (↓)">
        Lower {NUDGE}¢
      </button>
      {#if struck}
        <button type="button" class="btn small strike" disabled={phase !== 'tuning'} onclick={strike} title="Strike (Space)">
          <Icon name="play" size={16} /> Strike
        </button>
      {/if}
      <button type="button" class="btn small" disabled={phase !== 'tuning'} onclick={() => move(NUDGE)} title="Higher (↑)">
        Higher {NUDGE}¢
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
  .target-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
  }
  .octave {
    font-variant-numeric: tabular-nums;
  }
  .target {
    margin: 0;
    text-align: center;
    font-size: var(--text-lg);
  }
  .target strong {
    color: var(--anchor);
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
    background: var(--anchor);
    color: var(--anchor-text);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--anchor) 35%, transparent);
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

  /* A knob seen side-on: ridges scroll past a fixed centre line, darker towards the edges. */
  .wheel {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 240px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background:
      linear-gradient(var(--surface), transparent 30%, transparent 70%, var(--surface)),
      repeating-linear-gradient(180deg, var(--border) 0 3px, transparent 3px 14px) 0 var(--turn) / 100% 14px,
      var(--surface-2);
    cursor: ns-resize;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .wheel::before {
    content: '';
    position: absolute;
    left: 12%;
    right: 12%;
    top: 50%;
    height: 2px;
    border-radius: 1px;
    background: var(--anchor);
    opacity: 0.7;
  }
  .wheel.idle {
    cursor: default;
    opacity: 0.6;
  }
  .wheel:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }
  .hint {
    position: relative;
    top: 28px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: var(--text-sm);
    pointer-events: none;
  }
  .nudges {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .nudges.struck {
    grid-template-columns: 1fr 1.4fr 1fr;
  }
  .strike {
    border-color: var(--anchor);
    color: var(--anchor);
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
  .reveal .title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .cents {
    margin: 0;
    font-size: var(--text-display);
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .badge {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--anchor-soft);
    color: var(--anchor);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .meter {
    position: relative;
    width: 100%;
    height: 44px;
    margin-bottom: var(--space-3);
  }
  .meter .band,
  .meter .zero,
  .meter .marker {
    position: absolute;
    top: 6px;
    height: 20px;
  }
  .meter::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 15px;
    height: 2px;
    background: var(--border);
  }
  .meter .band {
    left: calc(50% - var(--w) * 50%);
    width: calc(var(--w) * 100%);
    border-radius: 6px;
    background: var(--good-soft);
  }
  .meter .zero {
    left: calc(50% - 1px);
    width: 2px;
    background: var(--text-muted);
  }
  .meter .marker {
    left: calc(50% + var(--at) * 50% - 7px);
    width: 14px;
    border-radius: 7px;
    background: var(--anchor);
  }
  .meter .marker.off {
    opacity: 0.5;
  }
  .tick {
    position: absolute;
    bottom: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .tick.flat {
    left: 0;
  }
  .tick.sharp {
    right: 0;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .tune {
      flex: 1;
    }
    .wheel {
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
    .tune:has(.action-bar) {
      padding-bottom: calc(var(--tap) + var(--space-4));
    }
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .wheel {
      min-height: 150px;
    }
  }
</style>
