<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import {
    createQuestion,
    pickKind,
    type ExerciseKind,
    type IdentifyResult,
    type Question,
    type SingResult,
  } from '../domain/exercise';
  import { entryFromResult } from '../domain/history';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { history } from '../lib/history.svelte';
  import { mic } from '../lib/mic.svelte';
  import { href } from '../lib/router.svelte';
  import { preloadPlaybackRange } from '../lib/playback';
  import IdentifyQuestion from '../components/IdentifyQuestion.svelte';
  import SingQuestion from '../components/SingQuestion.svelte';

  let { kinds, mixed = false }: { kinds: readonly ExerciseKind[]; mixed?: boolean } = $props();

  const rng = Math.random;

  function makeQuestion(previous?: Question): Question {
    return createQuestion(pickKind(kinds, rng), settings.value, rng, previous);
  }

  let question = $state<Question>(untrack(() => makeQuestion()));

  // Session tally (not persisted): answered questions and correct answers.
  let answered = $state(0);
  let correct = $state(0);

  // Per-question bookkeeping for singing tests: the first musical answer is the one that
  // is scored; later checks are feedback only. A question that only ever produced
  // "no detection" is logged once, as a failed detection, when the user moves on.
  let scored = false;
  let pendingNoDetection: SingResult | null = null;
  let pendingNoDetectionMs = 0;

  function flushPending() {
    if (!scored && pendingNoDetection) {
      history.add(entryFromResult(question, pendingNoDetection, { mixed, responseMs: pendingNoDetectionMs }));
    }
    scored = false;
    pendingNoDetection = null;
  }

  function next() {
    flushPending();
    question = makeQuestion(question);
  }

  function onIdentify(result: IdentifyResult, responseMs: number) {
    scored = true;
    answered += 1;
    if (result.correct) correct += 1;
    history.add(entryFromResult(question, result, { mixed, responseMs }));
  }

  function onSing(result: SingResult, responseMs: number) {
    if (scored) return;
    if (result.outcome === 'no-detection') {
      pendingNoDetection = result;
      pendingNoDetectionMs = responseMs;
      return;
    }
    scored = true;
    answered += 1;
    if (result.outcome === 'correct') correct += 1;
    history.add(entryFromResult(question, result, { mixed, responseMs }));
  }

  onDestroy(() => {
    flushPending();
    mic.stop();
    stopAll();
  });

  const kindLabel: Record<ExerciseKind, string> = {
    identify: 'Hear → Identify',
    'sing-practice': 'See → Sing (practice)',
    'sing-test': 'See → Sing (test)',
  };

  const s = $derived(settings.value);

  $effect(() => {
    void [s.waveform, s.playbackOctaveMin, s.playbackOctaveMax];
    if (kinds.includes('identify')) preloadPlaybackRange();
  });

  const showTally = $derived(question.kind !== 'sing-practice');
</script>

<div class="stack exercise">
  <div class="meta">
    {#if mixed}
      <span class="badge">{kindLabel[question.kind]}</span>
    {/if}
    <span class="badge" title="Enabled notes">{s.enabledPitchClasses.length} of 12 notes</span>
    {#if showTally}
      <span class="badge" aria-label={`This session: ${correct} correct out of ${answered}`}>
        Session {correct}/{answered}
      </span>
    {/if}
    {#if mixed && question.kind === 'identify' && mic.status === 'running'}
      <button type="button" class="badge mic-off" onclick={() => mic.stop()}>Mic on · stop</button>
    {/if}
    <a class="settings-link small" href={href('settings')}>Adjust notes &amp; range</a>
  </div>

  {#key question.id}
    {#if question.kind === 'identify'}
      <IdentifyQuestion {question} onresult={onIdentify} onnext={next} />
    {:else}
      <SingQuestion
        {question}
        mode={question.kind === 'sing-practice' ? 'practice' : 'test'}
        onresult={onSing}
        onnext={next}
      />
    {/if}
  {/key}
</div>

<style>
  .exercise {
    max-width: 640px;
    margin: 0 auto;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .settings-link {
    margin-left: auto;
  }
  .mic-off {
    border: 1px solid var(--bad);
    color: var(--bad);
    background: var(--bad-soft);
    cursor: pointer;
    min-height: 36px;
  }
  @media (pointer: fine) {
    .mic-off {
      min-height: 28px;
    }
  }
  /* Comfortable touch target without making the link look like a button. */
  @media (pointer: coarse) {
    .settings-link {
      padding-block: 8px;
      margin-block: -8px;
    }
  }
  @media (orientation: landscape) and (max-height: 500px) {
    .exercise {
      max-width: none;
    }
  }
</style>
