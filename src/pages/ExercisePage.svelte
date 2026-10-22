<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import {
    createQuestion,
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

  let { kind }: { kind: ExerciseKind } = $props();

  const rng = Math.random;

  function makeQuestion(previous?: Question): Question {
    return createQuestion(kind, settings.value, rng, previous);
  }

  let question = $state<Question>(untrack(() => makeQuestion()));

  // Session tally (not persisted): answered questions and correct answers.
  let answered = $state(0);
  let correct = $state(0);

  // Only the first checked capture affects the session and persisted history.
  let scored = false;
  function next() {
    scored = false;
    question = makeQuestion(question);
  }

  function onIdentify(result: IdentifyResult, responseMs: number) {
    scored = true;
    answered += 1;
    if (result.correct) correct += 1;
    history.add(entryFromResult(question, result, { mixed: false, responseMs }));
  }

  function onSing(result: SingResult, responseMs: number) {
    if (scored || result.outcome === 'no-detection') return;
    scored = true;
    answered += 1;
    if (result.outcome === 'correct') correct += 1;
    history.add(entryFromResult(question, result, { mixed: false, responseMs }));
  }

  onDestroy(() => {
    mic.stop();
    stopAll();
  });

  const s = $derived(settings.value);

  $effect(() => {
    void [s.waveform, s.playbackOctaveMin, s.playbackOctaveMax];
    if (kind === 'identify') preloadPlaybackRange();
  });

  const showTally = $derived(question.kind !== 'sing-practice');
</script>

<div class="stack exercise">
  <div class="meta">
    <span class="badge" title="Enabled notes">{s.enabledPitchClasses.length} of 12 notes</span>
    {#if showTally}
      <span class="badge" aria-label={`This session: ${correct} correct out of ${answered}`}>
        Session {correct}/{answered}
      </span>
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
