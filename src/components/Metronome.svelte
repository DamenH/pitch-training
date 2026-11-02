<script lang="ts" module>
  // The chosen tempo survives switching tabs, like the reference octave.
  let lastBpm = 120;
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Metronome } from '../audio/metronome';
  import {
    analyzeTaps,
    bandCentre,
    BPM_MAX,
    BPM_MIN,
    clampBpm,
    formatRange,
    TEMPO_CHANGES,
    TEMPO_TERMS,
    termForBpm,
  } from '../domain/tempo';
  import { settings } from '../lib/settings.svelte';
  import Icon from './Icon.svelte';
  import TempoMark from './TempoMark.svelte';

  let bpm = $state(lastBpm);
  let running = $state(false);
  /** Counts beats as they sound, for the pulse. */
  let beat = $state(0);
  let taps: number[] = [];
  const term = $derived(termForBpm(bpm));

  // svelte-ignore state_referenced_locally
  const metronome = new Metronome(bpm, () => settings.value.volume, () => { beat += 1; });

  function setBpm(value: number) {
    bpm = lastBpm = clampBpm(value);
    metronome.setBpm(bpm);
  }

  function toggle() {
    if (running) metronome.stop();
    else metronome.start();
    running = metronome.running;
    beat = 0;
  }

  /** Choosing a tempo term plays it. */
  function playTerm(value: number) {
    setBpm(value);
    if (!running) toggle();
  }

  /** Tap along to set the tempo; it doesn't start the clicks. */
  function tap(time: number) {
    taps = [...taps.slice(-15), time];
    const result = analyzeTaps(taps);
    if (result) setBpm(result.bpm);
  }

  onDestroy(() => metronome.stop());
</script>

<section class="metronome" aria-labelledby="metronome-h">
  <h2 id="metronome-h" class="eyebrow">Metronome</h2>
  <div class="controls">
    <button
      type="button"
      class="start"
      aria-pressed={running}
      aria-label={running ? 'Stop metronome' : 'Start metronome'}
      onclick={toggle}
    >
      <Icon name={running ? 'stop' : 'play'} size={20} />
    </button>
    <button type="button" class="icon-btn step" aria-label="Slower" title="Slower (Shift: 5 slower)"
      onclick={(e) => setBpm(bpm - (e.shiftKey ? 5 : 1))} disabled={bpm <= BPM_MIN}>−</button>
    <p class="reading">
      <span class="mark"><TempoMark {bpm} /></span>
      <span class="term" title={term.meaning}>{term.name}</span>
    </p>
    <button type="button" class="icon-btn step" aria-label="Faster" title="Faster (Shift: 5 faster)"
      onclick={(e) => setBpm(bpm + (e.shiftKey ? 5 : 1))} disabled={bpm >= BPM_MAX}>+</button>
    {#key beat}
      <span class="pulse" class:lit={running && beat > 0} class:odd={beat % 2 === 1} aria-hidden="true"></span>
    {/key}
    <button
      type="button"
      class="btn small tap"
      title="Tap along to set the tempo"
      onpointerdown={(e) => { if (e.button === 0) tap(e.timeStamp); }}
      onclick={(e) => { if (e.detail === 0) tap(performance.now()); }}
    >
      Tap
    </button>
  </div>
  <input
    type="range"
    min={BPM_MIN}
    max={BPM_MAX}
    step="1"
    value={bpm}
    aria-label="Tempo"
    aria-valuetext={`${bpm} beats per minute, ${term.name}`}
    oninput={(e) => setBpm(Number(e.currentTarget.value))}
  />

  <details class="terms">
    <summary>Tempo terms</summary>
    <p class="muted small">
      Sheet music gives tempo as a metronome mark, like <strong><TempoMark bpm={96} /></strong> (96 quarter-note
      beats a minute; sometimes written <em>M.M.</em>, for Maelzel's Metronome), or as an Italian word. The words'
      ranges are conventions, not rules, and books disagree. Tap a word to hear it.
    </p>
    <ul class="term-list">
      {#each TEMPO_TERMS as t (t.name)}
        <li>
          <button type="button" class:current={t === term} onclick={() => playTerm(bandCentre(t))}>
            <strong>{t.name}</strong>
            <span class="meaning">{t.meaning}</span>
            <span class="range">{formatRange(t)}</span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="muted small">When the tempo changes:</p>
    <dl class="changes">
      {#each TEMPO_CHANGES as c (c.name)}
        <dt><em>{c.name}</em></dt>
        <dd>{c.meaning}</dd>
      {/each}
    </dl>
  </details>
</section>

<style>
  .metronome {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .start {
    display: grid;
    place-items: center;
    flex: none;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
  }
  .start[aria-pressed='true'] {
    background: var(--surface-3);
    color: var(--text);
  }
  .start:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .step {
    flex: none;
    font-size: var(--text-lg);
    font-weight: 700;
  }
  .reading {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 0;
    margin: 0;
    line-height: 1.15;
  }
  .mark {
    font-size: var(--text-lg);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .term {
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-style: italic;
  }
  .pulse {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--surface-3);
  }
  .pulse.lit {
    animation: beat 220ms ease-out forwards;
  }
  @keyframes beat {
    from {
      background: var(--accent);
      transform: scale(1.3);
    }
    to {
      background: var(--surface-3);
      transform: scale(1);
    }
  }
  /* Without motion, the dot alternates colour on each beat instead of flashing. */
  @media (prefers-reduced-motion: reduce) {
    .pulse.lit {
      animation: none;
      background: var(--accent);
    }
    .pulse.lit.odd {
      background: var(--text-muted);
    }
  }
  .tap {
    flex: none;
    min-width: 64px;
    touch-action: manipulation;
  }
  input[type='range'] {
    width: 100%;
  }

  .terms > p {
    margin: var(--space-2) 0;
  }
  .term-list {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .term-list button {
    display: grid;
    grid-template-columns: 7.5rem 1fr auto;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    min-height: 40px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text);
    text-align: left;
  }
  .term-list button.current {
    background: var(--surface-2);
  }
  .term-list strong {
    font-style: italic;
  }
  .meaning {
    color: var(--text-muted);
    font-size: var(--text-sm);
    min-width: 0;
  }
  .range {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-sm);
  }
  .changes {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
  }
  .changes dd {
    margin: 0;
    color: var(--text-muted);
  }
  @media (max-width: 380px) {
    .term-list button {
      grid-template-columns: 6.5rem 1fr auto;
    }
  }
</style>
