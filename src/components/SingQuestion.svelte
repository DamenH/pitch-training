<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { evaluateSing, type Question, type SingResult } from '../domain/exercise';
  import { noteName, pitchClassName, spokenNoteName, spokenPitchClassName } from '../domain/music';
  import { describeDeviation, signedCents } from '../lib/format';
  import { PitchCapture } from '../domain/pitchCapture';
  import { mic } from '../lib/mic.svelte';
  import { settings } from '../lib/settings.svelte';
  import { shouldIgnoreShortcut } from '../lib/keys';
  import { haptic } from '../lib/native';
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
    if (mic.status === 'running') {
      const wasLocked = recorder.state.phase === 'locked';
      const next = recorder.push(mic.live);
      if (!wasLocked && next.phase === 'locked') haptic('tap');
      capture = next;
    }
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
    haptic(result.outcome === 'correct' ? 'success' : 'error');
    attempts = [{ n: attempts.length + 1, result }, ...attempts].slice(0, 6);
    onresult?.(result, Date.now() - question.createdAt);
    void tick().then(() => feedback?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    // Let Enter activate a focused button normally.
    if (shouldIgnoreShortcut(e) || e.target instanceof HTMLButtonElement) return;
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
  <div class="target" role="group" aria-label={`Target note: ${targetSpoken}${exact ? '' : ', any octave'}`}>
    <span class="eyebrow">Sing</span>
    <span class="note" aria-hidden="true">{targetLabel}</span>
  </div>

  <div class="stack listen">
    <MicPanel />

    {#if mode === 'practice' && mic.status === 'running'}
      <PitchMeter live={mic.live} targetMidi={question.targetMidi} policy={question.scoringPolicy}
        toleranceCents={s.toleranceCents} spelling={s.spelling} />
    {:else if mode === 'test' && (mic.status === 'running' || capture.phase === 'locked')}
      <div class="capture">
        <p class="voice" class:steady={capture.phase === 'locked'} role="status">{voiceStatus}</p>
        <progress aria-label="Note capture progress" value={capture.progress} max="1"></progress>
      </div>
      {#if capture.phase === 'locked'}
        <button type="button" class="btn" onclick={rerecord}>Re-record</button>
      {/if}
    {/if}
  </div>

  {#if mode === 'test'}
    <div aria-live="polite" class="stack feedback" bind:this={feedback}>
      {#if latest}
        <div class="notice verdict" class:good={latest.outcome === 'correct'} class:bad={latest.outcome === 'incorrect'}>
          <p class="title">{latest.outcome === 'correct' ? 'Match' : 'No match'}</p>
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
        <summary>Earlier checks ({attempts.length - 1})</summary>
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
      <button type="button" class="btn primary" onclick={check} disabled={capture.phase !== 'locked' || checked}
        title="Check answer (Enter)">
        Check answer
      </button>
    {/if}
    <button type="button" class="btn" class:primary={mode === 'practice'} onclick={onnext} title="Next note (N)">
      Next note <Icon name="arrow-right" />
    </button>
  </div>
</section>

<style>
  .target {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-1);
    padding-block: var(--space-4) var(--space-2);
  }
  .note {
    font-size: var(--text-display);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .capture {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .voice {
    text-align: center;
    font-weight: 600;
    min-height: 1.5em;
    color: var(--text-muted);
  }
  .voice.steady {
    color: var(--text);
  }
  .attempts ol {
    margin: 6px 0 0;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  progress {
    height: 8px;
  }
  .feedback:empty {
    display: none;
  }
  @media (orientation: landscape) and (max-height: 500px) {
    .target {
      flex-direction: row;
      justify-content: center;
      align-items: baseline;
      gap: var(--space-3);
      padding-block: 0;
    }
    .note {
      font-size: 3rem;
    }
  }
</style>
