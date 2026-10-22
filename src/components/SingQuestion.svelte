<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { evaluateSing, type Question, type SingResult } from '../domain/exercise';
  import { noteName, pitchClassName, spokenNoteName, spokenPitchClassName } from '../domain/music';
  import { describeDeviation, signedCents } from '../lib/format';
  import { STABLE_RETENTION_MS } from '../domain/pitch';
  import { mic } from '../lib/mic.svelte';
  import { settings } from '../lib/settings.svelte';
  import MicPanel from './MicPanel.svelte';
  import PitchMeter from './PitchMeter.svelte';
  import Icon from './Icon.svelte';

  let {
    question,
    mode,
    onresult,
    onnext,
  }: {
    question: Question;
    mode: 'practice' | 'test';
    /** Test mode only: called for each Check Answer submission. */
    onresult?: (result: SingResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  const s = $derived(settings.value);
  const exact = $derived(question.scoringPolicy === 'exact');
  const targetLabel = $derived(
    exact ? noteName(question.targetMidi, s.spelling) : pitchClassName(question.targetPitchClass, s.spelling),
  );
  const targetSpoken = $derived(
    exact ? spokenNoteName(question.targetMidi, s.spelling) : spokenPitchClassName(question.targetPitchClass, s.spelling),
  );

  interface Attempt {
    n: number;
    result: SingResult;
  }
  let attempts = $state<Attempt[]>([]);
  let feedback: HTMLElement | undefined = $state();
  const latest = $derived(attempts[0]?.result ?? null);

  // A new question must never be scored with a pitch sung for the previous one.
  mic.resetTracking();

  // Test mode reveals only whether a steady voice is present, never what pitch it is.
  const voiceStatus = $derived.by(() => {
    if (mic.status !== 'running') return '';
    switch (mic.live.status) {
      case 'stable':
        return 'Hearing a steady note';
      case 'unstable':
        return 'Hearing your voice…';
      case 'unclear':
        return 'Sound detected, but no clear pitch';
      case 'out-of-range':
        return 'Sound outside the singing range';
      default:
        return 'Listening…';
    }
  });

  function check() {
    const latestStable = mic.latestStable(STABLE_RETENTION_MS);
    const submitted = latestStable.kind === 'ok' ? { kind: 'ok' as const, pitch: latestStable.pitch } : latestStable;
    const result = evaluateSing(question, submitted, s.toleranceCents);
    attempts = [{ n: attempts.length + 1, result }, ...attempts].slice(0, 6);
    onresult?.(result, Date.now() - question.createdAt);
    void tick().then(() => feedback?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLButtonElement) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'Enter' && mode === 'test' && mic.status === 'running') {
      e.preventDefault();
      check();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      onnext();
    }
  }

  onDestroy(() => mic.resetTracking());
</script>

<svelte:window {onkeydown} />

<section class="stack sing" aria-label={mode === 'practice' ? 'Sing practice' : 'Sing test'}>
  <div class="card target" role="group" aria-label={`Target note: ${targetSpoken}${exact ? '' : ', any octave'}`}>
    <span class="label">Sing</span>
    <span class="note" aria-hidden="true">{targetLabel}</span>
  </div>

  <div class="card stack mic-card">
    <MicPanel />

    {#if mic.status === 'running'}
      {#if mode === 'practice'}
        <PitchMeter
          live={mic.live}
          targetMidi={question.targetMidi}
          policy={question.scoringPolicy}
          toleranceCents={s.toleranceCents}
          spelling={s.spelling}
        />
      {:else}
        <p class="voice" class:steady={mic.live.status === 'stable'}>
          <Icon name={mic.live.status === 'stable' ? 'dot' : 'mic'} size={18} />
          {voiceStatus}
        </p>
      {/if}
    {/if}
  </div>

  {#if mode === 'test'}
    <div aria-live="polite" class="stack" bind:this={feedback}>
      {#if latest}
        {#if latest.outcome === 'no-detection'}
          <div class="notice warn">
            <p class="verdict"><span aria-hidden="true">?</span> No recent steady note</p>
            <p class="detail">
              {latest.reason === 'stale'
                ? 'Your last steady note was too long ago.'
                : 'Hold a note a little longer, then check.'}
            </p>
          </div>
        {:else}
          <div class="notice" class:good={latest.outcome === 'correct'} class:bad={latest.outcome === 'incorrect'}>
            <p class="verdict">
              <span aria-hidden="true">{latest.outcome === 'correct' ? '✓' : '✗'}</span>
              {latest.outcome === 'correct' ? 'Match' : 'No match'}
            </p>
            <p class="detail">
              You sang <strong>{noteName(latest.comparison.detectedMidi, s.spelling)}</strong>
              <span class="muted">({latest.sungFrequency.toFixed(1)} Hz)</span>:
              {describeDeviation(latest.comparison.cents)}
              {noteName(latest.comparison.referenceMidi, s.spelling)}.
            </p>
          </div>
        {/if}
      {/if}
    </div>
    {#if attempts.length > 1}
      <details class="attempts">
        <summary>Earlier checks for this note ({attempts.length - 1})</summary>
        <ol reversed>
          {#each attempts.slice(1) as a (a.n)}
            <li>
              {#if a.result.outcome === 'no-detection'}
                No steady note
              {:else}
                {a.result.outcome === 'correct' ? '✓' : '✗'}
                {noteName(a.result.comparison.detectedMidi, s.spelling)}
                ({signedCents(a.result.comparison.cents)})
              {/if}
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  {/if}

  <div class="action-bar">
    {#if mode === 'test'}
      <button type="button" class="btn primary" onclick={check} disabled={mic.status !== 'running'}>
        Check answer
      </button>
    {/if}
    <button type="button" class="btn" class:primary={mode === 'practice'} onclick={onnext}>
      Next note <Icon name="arrow-right" />
    </button>
  </div>

  <p class="kbd-hint muted small">
    Keyboard: {#if mode === 'test'}<kbd>Enter</kbd> check answer · {/if}<kbd>N</kbd> next note
  </p>
</section>

<style>
  .target {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
    padding-block: 20px;
  }
  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .note {
    font-size: clamp(3.5rem, 18vw, 5.5rem);
    font-weight: 800;
    line-height: 1;
  }
  .voice {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 600;
    margin: 0;
    min-height: 1.5em;
    color: var(--text-muted);
  }
  .voice.steady {
    color: var(--text);
  }
  .verdict {
    font-size: 1.2rem;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .detail {
    margin: 0;
  }
  .attempts summary {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .attempts ol {
    margin: 6px 0 0;
    font-size: 0.9rem;
  }

  /* Phone on its side: target, actions and feedback on the left; microphone and meter on the right. */
  @media (orientation: landscape) and (max-height: 500px) {
    .sing {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      grid-template-rows: repeat(5, auto) 1fr;
      align-items: start;
      gap: 12px var(--gap);
    }
    .sing > * {
      grid-column: 1;
    }
    .sing > .mic-card {
      grid-column: 2;
      grid-row: 1 / -1;
    }
    /* Actions sit right under the target so they never fall below the fold as feedback grows. */
    .sing > .action-bar {
      grid-row: 2;
    }
    .target {
      flex-direction: row;
      justify-content: center;
      align-items: baseline;
      gap: 12px;
      padding-block: 8px;
    }
    .note {
      font-size: 3.5rem;
    }
  }
</style>
