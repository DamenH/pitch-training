<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { evaluateSing, type Question, type SingResult } from '../domain/exercise';
  import { noteName, pitchClassName, spokenNoteName, spokenPitchClassName } from '../domain/music';
  import { describeDeviation, signedCents } from '../lib/format';
  import { PitchCapture } from '../domain/pitchCapture';
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
    result: Exclude<SingResult, { outcome: 'no-detection' }>;
  }
  let attempts = $state<Attempt[]>([]);
  let feedback: HTMLElement | undefined = $state();
  let checked = $state(false);
  const latest = $derived(checked ? attempts[0]?.result ?? null : null);
  const recorder = new PitchCapture();
  let capture = $state(recorder.state);

  $effect(() => {
    if (mode !== 'test') return;
    if (mic.status === 'running') capture = recorder.push(mic.live);
    else if (recorder.state.phase !== 'locked') capture = recorder.reset(performance.now());
  });

  function rerecord() {
    capture = recorder.reset(performance.now());
    checked = false;
    mic.resetTracking();
    void mic.start();
  }

  // A new question must never be scored with a pitch sung for the previous one.
  mic.resetTracking();

  // Test mode reveals only whether a steady voice is present, never what pitch it is.
  const voiceStatus = $derived.by(() => {
    if (capture.phase === 'locked') return 'Note locked';
    if (capture.phase === 'holding') return 'Keep holding…';
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
    if (!capture.pitch || checked) return;
    const result = evaluateSing(question, { kind: 'ok', pitch: capture.pitch }, s.toleranceCents);
    if (result.outcome === 'no-detection') return;
    checked = true;
    attempts = [{ n: attempts.length + 1, result }, ...attempts].slice(0, 6);
    onresult?.(result, Date.now() - question.createdAt);
    void tick().then(() => feedback?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLButtonElement) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'Enter' && mode === 'test') {
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

    {#if mode === 'practice' && mic.status === 'running'}
      <PitchMeter live={mic.live} targetMidi={question.targetMidi} policy={question.scoringPolicy}
        toleranceCents={s.toleranceCents} spelling={s.spelling} />
    {:else if mode === 'test'}
      {#if mic.status === 'running' || capture.phase === 'locked'}
        <p class="voice" class:steady={capture.phase === 'locked'} role="status">{voiceStatus}</p>
        <progress aria-label="Note capture progress" value={capture.progress} max="1"></progress>
      {/if}
      {#if capture.phase === 'locked'}
        <button type="button" class="btn" onclick={rerecord}>Re-record</button>
      {:else}
        <p class="small muted capture-help">Sing a note and hold it steady to lock your answer.</p>
      {/if}
    {/if}
  </div>

  {#if mode === 'test'}
    <div aria-live="polite" class="stack feedback" bind:this={feedback}>
      {#if latest}
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
    </div>
    {#if attempts.length > 1}
      <details class="attempts">
        <summary>Earlier checks for this note ({attempts.length - 1})</summary>
        <ol reversed>
          {#each attempts.slice(1) as a (a.n)}
            <li>
              {a.result.outcome === 'correct' ? '✓' : '✗'}
              {noteName(a.result.comparison.detectedMidi, s.spelling)}
              ({signedCents(a.result.comparison.cents)})
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  {/if}

  <div class="action-bar">
    {#if mode === 'test'}
      <button type="button" class="btn primary" onclick={check} disabled={capture.phase !== 'locked' || checked}>
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

  progress { width: 100%; height: 8px; accent-color: var(--accent); }
  .capture-help { margin: 0; }
  .feedback:empty { display: none; }
  @media (orientation: landscape) and (max-height: 500px) {
    .target { flex-direction: row; justify-content: center; align-items: baseline; gap: 12px; padding-block: 8px; }
    .note { font-size: 3rem; }
  }
</style>
