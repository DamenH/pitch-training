<script lang="ts">
  import { onDestroy } from 'svelte';
  import { playClicks, stopAll } from '../audio/synth';
  import {
    answerTermsFor,
    bandCentre,
    BPM_MAX,
    BPM_MIN,
    clampBpm,
    describeTempoError,
    evaluateTempo,
    formatRange,
    steadyBeats,
    termByName,
    type TempoResult,
    type TempoTarget,
  } from '../domain/tempo';
  import { settings } from '../lib/settings.svelte';
  import { haptic, onPress } from '../lib/native';
  import { shouldIgnoreShortcut } from '../lib/keys';
  import Icon from './Icon.svelte';
  import TempoMark from './TempoMark.svelte';
  import TempoMeter from './TempoMeter.svelte';

  let {
    target,
    onresult,
    onnext,
  }: {
    target: TempoTarget;
    /** `answerTerm` is set when the answer was a term rather than a number. */
    onresult: (result: TempoResult, responseMs: number, answerTerm?: string) => void;
    onnext: () => void;
  } = $props();

  /** Beats per play: enough to settle into the pulse. */
  const BEATS = 8;

  const s = $derived(settings.value);
  // svelte-ignore state_referenced_locally
  const byTerm = target.term !== null;
  // svelte-ignore state_referenced_locally
  const choices = answerTermsFor(settings.value);
  let plays = $state(0);
  let firstPlayAt: number | null = null;
  /** The beat sounding now, for the dots; -1 when silent. */
  let beat = $state(-1);
  /** The typed answer; a number input binds a number, or null when empty. */
  let typed = $state<number | null>(null);
  let chosen = $state<string | null>(null);
  let result = $state<TempoResult | null>(null);

  // Single-play applies before the answer; afterwards replay is always allowed.
  const canPlay = $derived(result !== null || s.replayPolicy === 'unlimited' || plays === 0);
  const answerBpm = $derived(typeof typed === 'number' && Number.isFinite(typed) ? typed : null);
  const validNumber = $derived(answerBpm !== null && answerBpm >= BPM_MIN && answerBpm <= BPM_MAX);

  function play() {
    if (!canPlay) return;
    if (firstPlayAt === null) firstPlayAt = Date.now();
    plays += 1;
    void playClicks(steadyBeats(target.bpm, BEATS), s.volume, (i) => {
      beat = i;
    }).finally(() => {
      beat = -1;
    });
  }

  /** Start a new round without a tap; single-play mode leaves its one play to the user. */
  export function autoplay() {
    if (plays === 0 && s.replayPolicy === 'unlimited') play();
  }

  function finish(r: TempoResult, answerTerm?: string) {
    result = r;
    haptic(r.correct ? 'success' : 'error');
    onresult(r, Date.now() - (firstPlayAt ?? Date.now()), answerTerm);
  }

  function chooseTerm(name: string) {
    if (result || plays === 0) return;
    chosen = name;
    const term = termByName(name)!;
    finish({ bpm: bandCentre(term), errorPct: 0, correct: name === target.term }, name);
  }

  function submitNumber() {
    if (result || plays === 0 || !validNumber) return;
    finish(evaluateTempo({ ...target, term: null }, answerBpm!, s.tempoTolerancePct));
  }

  /** −/+ step from the typed answer, or from the middle of the range, which says nothing about the target. */
  function nudge(delta: number) {
    if (result) return;
    typed = clampBpm((answerBpm ?? Math.round((s.tempoMin + s.tempoMax) / 2)) + delta);
  }

  function onkeydown(e: KeyboardEvent) {
    if (shouldIgnoreShortcut(e)) return;
    if (e.key === 'Enter') {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (result) onnext();
      else if (!byTerm) submitNumber();
      return;
    }
    if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      play();
      return;
    }
    // Digits pick a term, in the order shown.
    const n = Number(e.key);
    if (byTerm && Number.isInteger(n) && n >= 1 && n <= choices.length) {
      e.preventDefault();
      chooseTerm(choices[n - 1]!.name);
    }
  }

  onDestroy(stopAll);

  const term = $derived(target.term === null ? undefined : termByName(target.term));
</script>

<svelte:window {onkeydown} />

<section class="stack identify-tempo" aria-label="Hear and identify the tempo">
  <div class="prompt">
    <button type="button" class="play" {...onPress(play)} disabled={!canPlay} title="Play (R)">
      <span class="disc"><Icon name="play" size={28} /></span>
      <span>{plays === 0 ? 'Play tempo' : canPlay ? 'Replay tempo' : 'Played once'}</span>
    </button>
    <ol class="beats" aria-hidden="true">
      {#each { length: BEATS } as _, i (i)}<li class:on={i === beat}></li>{/each}
    </ol>
  </div>

  {#if byTerm}
    <fieldset class="terms" disabled={plays === 0 || result !== null}>
      <legend>Which tempo is it?</legend>
      <div class="choices">
        {#each choices as c, i (c.name)}
          <button
            type="button"
            class:correct={result !== null && c.name === target.term}
            class:wrong={result !== null && c.name === chosen && c.name !== target.term}
            title={`${c.name}, ${formatRange(c)} (${i + 1})`}
            onclick={() => chooseTerm(c.name)}
          >
            {#if result !== null && c.name === target.term}<span aria-hidden="true">✓ </span>{/if}
            {#if result !== null && c.name === chosen && c.name !== target.term}<span aria-hidden="true">✗ </span>{/if}
            <em>{c.name}</em>
            <span class="range">{formatRange(c)}</span>
          </button>
        {/each}
      </div>
    </fieldset>
  {:else}
    <div class="number">
      <button type="button" class="icon-btn step" aria-label="Slower" disabled={plays === 0 || result !== null}
        onclick={(e) => nudge(e.shiftKey ? -5 : -1)}>−</button>
      <label class="entry">
        <span class="visually-hidden">Your answer, in beats per minute</span>
        <input
          class="input"
          type="number"
          inputmode="numeric"
          min={BPM_MIN}
          max={BPM_MAX}
          placeholder="BPM"
          bind:value={typed}
          disabled={plays === 0 || result !== null}
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNumber(); } }}
        />
      </label>
      <button type="button" class="icon-btn step" aria-label="Faster" disabled={plays === 0 || result !== null}
        onclick={(e) => nudge(e.shiftKey ? 5 : 1)}>+</button>
    </div>
  {/if}

  <div class="feedback" aria-live="polite">
    {#if result}
      <div class="notice verdict" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">{result.correct ? 'Correct' : 'Not quite'}</p>
        <p class="detail">
          It was <strong><TempoMark bpm={target.bpm} /></strong>{#if term}, <em>{term.name}</em>{/if}.
          {#if !byTerm && answerBpm !== null}You said {answerBpm}: {describeTempoError(result.errorPct)}.{/if}
        </p>
      </div>
      {#if !byTerm}<TempoMeter errorPct={result.errorPct} tolerancePct={s.tempoTolerancePct} />{/if}
    {/if}
  </div>

  <div class="action-bar">
    {#if result}
      <button type="button" class="btn primary" onclick={onnext} title="Next tempo (Enter)">
        Next tempo <Icon name="arrow-right" />
      </button>
    {:else if !byTerm}
      <button type="button" class="btn primary" onclick={submitNumber} disabled={plays === 0 || !validNumber} title="Submit (Enter)">
        Submit answer
      </button>
    {/if}
  </div>
</section>

<style>
  .prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-2);
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
    transition:
      transform 100ms var(--ease),
      filter 120ms;
  }
  .play:active:not(:disabled) .disc {
    transform: scale(0.93);
    filter: brightness(0.92);
  }
  .play:disabled {
    color: var(--text-muted);
  }
  .play:disabled .disc {
    background: var(--surface-3);
    color: var(--text-muted);
    box-shadow: none;
  }
  .play:focus-visible {
    outline: none;
  }
  .play:focus-visible .disc {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }
  .beats {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .beats li {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .beats li.on {
    background: var(--tempo);
  }

  .terms {
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .terms legend {
    width: 100%;
    margin-bottom: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-2);
  }
  .choices button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 60px;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-base);
    font-weight: 700;
  }
  .choices .range {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .choices button.correct {
    border-color: var(--good);
    background: var(--good);
    color: var(--surface);
  }
  .choices button.wrong {
    border-color: var(--bad);
    background: var(--bad);
    color: var(--surface);
  }
  .choices button.correct .range,
  .choices button.wrong .range {
    color: inherit;
  }

  .number {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .step {
    font-size: var(--text-lg);
    font-weight: 700;
  }
  .entry input {
    width: 7.5rem;
    font-size: var(--text-xl);
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .feedback {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 88px;
  }
  .feedback p {
    margin: 0;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .identify-tempo {
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
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .prompt {
      flex-direction: row;
      justify-content: center;
      padding-block: 0;
    }
    .play {
      flex-direction: row;
    }
    .disc {
      width: 48px;
      height: 48px;
    }
  }
</style>
