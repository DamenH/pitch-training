<script lang="ts" module>
  import type { ExerciseKind, Question } from '../domain/exercise';

  interface Session {
    question: Question;
    scored: boolean;
    answered: number;
    correct: number;
  }

  // Like native tabs, each exercise keeps its question and tally while you visit other screens.
  const sessions = new Map<ExerciseKind, Session>();
</script>

<script lang="ts">
  import { flushSync, onDestroy, untrack } from 'svelte';
  import { createQuestion, type IdentifyAnyResult, type SingResult } from '../domain/exercise';
  import { entryFromResult } from '../domain/history';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { history } from '../lib/history.svelte';
  import { mic } from '../lib/mic.svelte';
  import { preloadPlaybackRange } from '../lib/playback';
  import { playScramble } from '../lib/scramble.svelte';
  import IdentifyQuestion from '../components/IdentifyQuestion.svelte';
  import SingQuestion from '../components/SingQuestion.svelte';

  let { kind }: { kind: ExerciseKind } = $props();

  const rng = Math.random;

  function makeQuestion(previous?: Question): Question {
    return createQuestion(kind, settings.value, rng, previous);
  }

  // An answered question is never reopened, so it can't be scored twice.
  const saved = untrack(() => sessions.get(kind));
  const resume = untrack(() =>
    saved && !saved.scored && settings.value.enabledPitchClasses.includes(saved.question.targetPitchClass)
      ? saved.question
      : undefined,
  );
  let question = $state<Question>(untrack(() => resume ?? makeQuestion(saved?.question)));

  // Session tally (not persisted): answered questions and correct answers.
  let answered = $state(saved?.answered ?? 0);
  let correct = $state(saved?.correct ?? 0);

  // Only the first checked capture affects the session and persisted history.
  let scored = false;
  let identify = $state<IdentifyQuestion>();
  async function next() {
    scored = false;
    // Swap the question first: the old one stops its sounds as it goes.
    flushSync(() => {
      question = makeQuestion(question);
    });
    const id = question.id;
    if (s.scramble) await playScramble(question.targetPitchClass);
    // Play the new round straight away, once any scramble has finished.
    if (question.id === id) identify?.autoplay();
  }

  function onIdentify(result: IdentifyAnyResult, responseMs: number) {
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
    sessions.set(kind, { question, scored, answered, correct });
    mic.stop();
    stopAll();
  });

  const s = $derived(settings.value);

  $effect(() => {
    void [s.waveform, s.playbackOctaveMin, s.playbackOctaveMax];
    if (kind === 'identify' || kind === 'identify-octave' || kind === 'identify-chroma') preloadPlaybackRange();
  });

  const showTally = $derived(question.kind !== 'sing-practice');
</script>

<div class="stack exercise">
  <p class="meta">
    <span>{s.enabledPitchClasses.length === 12 ? 'All notes' : `${s.enabledPitchClasses.length} of 12 notes`}</span>
    {#if showTally}
      <span aria-label={`This session: ${correct} correct out of ${answered}`}>Session {correct}/{answered}</span>
    {/if}
  </p>

  {#key question.id}
    {#if question.kind === 'identify' || question.kind === 'identify-octave' || question.kind === 'identify-chroma'}
      <IdentifyQuestion bind:this={identify} {question} onresult={onIdentify} onnext={next} />
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
    flex: 1;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    justify-content: space-between;
  }
  @media (orientation: landscape) and (max-height: 500px) {
    .exercise {
      gap: var(--space-3);
    }
  }
</style>
