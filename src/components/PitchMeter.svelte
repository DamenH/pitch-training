<script lang="ts">
  import { comparePitch } from '../domain/exercise';
  import { midiToFrequency, noteName, spokenNoteName, type Spelling } from '../domain/music';
  import type { LiveState } from '../domain/pitch';
  import type { ScoringPolicy } from '../domain/settings';
  import { signedCents } from '../lib/format';

  let {
    live,
    targetMidi,
    policy,
    toleranceCents,
    spelling,
  }: {
    live: LiveState;
    targetMidi: number | null;
    policy: ScoringPolicy;
    toleranceCents: number;
    spelling: Spelling;
  } = $props();

  /** Visible span either side of the target. */
  const RANGE = 600;

  const reading = $derived(live.stable ?? live.smoothed);
  const cmp = $derived(reading && targetMidi !== null ? comparePitch(reading.midi, targetMidi, policy, toleranceCents) : null);
  const offTheScale = $derived(cmp !== null && Math.abs(cmp.cents) > RANGE);
  const position = $derived(cmp ? Math.max(-1, Math.min(1, cmp.cents / RANGE)) : 0);
  const centsToNearest = $derived(reading ? Math.round((reading.midi - Math.round(reading.midi)) * 100) : 0);

  const direction = $derived.by(() => {
    if (!cmp) return null;
    if (cmp.withinTolerance) return 'on' as const;
    return cmp.cents < 0 ? ('higher' as const) : ('lower' as const);
  });

  const statusText = $derived.by(() => {
    switch (live.status) {
      case 'silent':
        return 'Listening…';
      case 'unclear':
        return 'No clear pitch';
      case 'out-of-range':
        return 'Out of range';
      case 'unstable':
        return 'Unstable';
      case 'stable':
        return 'Steady';
    }
  });

  function describeOffset(cents: number): string {
    const abs = Math.abs(Math.round(cents));
    if (abs < 100) return `${abs}¢`;
    const semis = Math.round(abs / 100);
    return `≈${semis} semitone${semis === 1 ? '' : 's'}`;
  }

  // Screen-reader summary: only when a new steady note is reached, at most every 2 s.
  let announcement = $state('');
  let lastAnnounced = '';
  let lastAnnouncedAt = 0;
  $effect(() => {
    if (live.status !== 'stable' || !live.stable || !cmp) return;
    const key = `${cmp.detectedMidi}:${direction}`;
    const now = performance.now();
    if (key === lastAnnounced || now - lastAnnouncedAt < 2000) return;
    lastAnnounced = key;
    lastAnnouncedAt = now;
    announcement = `Steady ${spokenNoteName(cmp.detectedMidi, spelling)}. ${
      direction === 'on' ? 'On target.' : direction === 'higher' ? 'Sing higher.' : 'Sing lower.'
    }`;
  });
</script>

<div class="meter" class:stable={live.status === 'stable'}>
  <div class="readout">
    <div class="detected">
      <span class="label">Detected</span>
      <span class="note">{reading ? noteName(Math.round(reading.midi), spelling) : '—'}</span>
      <span class="sub">
        {#if reading}{signedCents(centsToNearest)} · {reading.frequency.toFixed(1)} Hz{:else}&nbsp;{/if}
      </span>
    </div>
    <div class="hint" data-dir={direction ?? 'none'}>
      {#if direction === 'on'}
        <span class="arrow" aria-hidden="true">●</span> On target
        <span class="sub">{signedCents(cmp!.cents)}</span>
      {:else if direction === 'higher'}
        <span class="arrow" aria-hidden="true">▲</span> Sing higher
        <span class="sub">{describeOffset(cmp!.cents)} below</span>
      {:else if direction === 'lower'}
        <span class="arrow" aria-hidden="true">▼</span> Sing lower
        <span class="sub">{describeOffset(cmp!.cents)} above</span>
      {:else if targetMidi === null}
        <span class="sub">Select a piano key to match</span>
      {:else}
        <span class="sub">&nbsp;</span>
      {/if}
    </div>
  </div>

  {#if targetMidi !== null}
    <div class="track" aria-hidden="true">
      <div class="zone" style:width={`${(toleranceCents / RANGE) * 50}%`}></div>
      {#each [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as t (t)}
        <div class="tick" class:centre={t === 0} style:left={`${50 + (t / 6) * 50}%`}></div>
      {/each}
      {#if cmp}
        <div class="needle" class:edge={offTheScale} style:left={`${50 + position * 50}%`}></div>
      {/if}
    </div>
    <div class="scale" aria-hidden="true">
      <span>−6</span><span>target</span><span>+6</span>
    </div>
  {/if}

  <p class="status" class:steady={live.status === 'stable'}>{statusText}</p>

  <details class="diag">
    <summary>Detector details</summary>
    <dl>
      <dt>Status</dt>
      <dd>{live.status}</dd>
      <dt>Raw frequency</dt>
      <dd>{live.raw && live.raw.frequency > 0 ? `${live.raw.frequency.toFixed(2)} Hz` : '—'}</dd>
      <dt>Clarity</dt>
      <dd>{live.raw ? live.raw.clarity.toFixed(2) : '—'}</dd>
      <dt>Input level</dt>
      <dd>{live.raw && live.raw.rms > 0 ? `${(20 * Math.log10(live.raw.rms)).toFixed(0)} dBFS` : '—'}</dd>
      <dt>Detected (MIDI)</dt>
      <dd>{reading ? reading.midi.toFixed(2) : '—'}</dd>
      <dt>Compared with</dt>
      <dd>
        {#if cmp}
          {noteName(cmp.referenceMidi, spelling)} ({midiToFrequency(cmp.referenceMidi).toFixed(2)} Hz)
        {:else}—{/if}
      </dd>
    </dl>
  </details>

  <p class="visually-hidden" aria-live="polite">{announcement}</p>
</div>

<style>
  .meter {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .readout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: center;
  }

  .detected,
  .hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .note {
    font-size: 2.4rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .sub {
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    font-weight: 400;
  }

  .hint {
    font-weight: 700;
    font-size: 1.1rem;
  }

  .hint[data-dir='on'] {
    color: var(--good);
  }

  .hint[data-dir='higher'],
  .hint[data-dir='lower'] {
    color: var(--warn);
  }

  .arrow {
    font-size: 1.6rem;
    line-height: 1;
  }

  .track {
    position: relative;
    height: 36px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .zone {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    background: var(--good-soft);
    min-width: 4px;
  }

  .tick {
    position: absolute;
    top: 40%;
    bottom: 40%;
    width: 1px;
    background: var(--text-muted);
    opacity: 0.35;
  }

  .tick.centre {
    top: 20%;
    bottom: 20%;
    width: 2px;
    margin-left: -1px;
    background: var(--good);
    opacity: 1;
  }

  .needle {
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 6px;
    margin-left: -3px;
    border-radius: 3px;
    background: var(--text);
    transition: left 80ms linear;
  }

  .needle.edge {
    background: var(--warn);
  }

  .meter:not(.stable) .needle {
    opacity: 0.55;
  }

  .scale {
    display: flex;
    justify-content: space-between;
    margin-top: -4px;
    padding-inline: var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .status {
    text-align: center;
    margin: 0;
    font-weight: 600;
    color: var(--text-muted);
    min-height: 1.45em;
  }

  .status.steady {
    color: var(--text);
  }

  .diag dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: var(--space-2) 0;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .diag dt {
    color: var(--text-muted);
  }

  .diag dd {
    margin: 0;
  }
</style>
