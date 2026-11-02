<script lang="ts" module>
  import type { TempoTarget } from '../domain/tempo';

  interface Session {
    target: TempoTarget;
    scored: boolean;
    answered: number;
    correct: number;
  }

  // Like the other modes, Identify tempo keeps its target and tally while you visit other screens.
  let session: Session | undefined;
</script>

<script lang="ts">
  import { flushSync, onDestroy, untrack } from 'svelte';
  import { createIdentifyTempoTarget, type TempoResult } from '../domain/tempo';
  import { entryFromTempo } from '../domain/history';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { history } from '../lib/history.svelte';
  import { playTempoScramble } from '../lib/scramble.svelte';
  import IdentifyTempoQuestion from '../components/IdentifyTempoQuestion.svelte';

  const s = $derived(settings.value);

  /** A saved target is only resumed if it still matches how answers are given. */
  function fits(t: TempoTarget): boolean {
    return (t.term !== null) === (settings.value.tempoIdentifyAnswer === 'term');
  }

  const saved = untrack(() => session);
  let target = $state<TempoTarget>(
    untrack(() =>
      saved && !saved.scored && fits(saved.target)
        ? saved.target
        : createIdentifyTempoTarget(settings.value, Math.random, saved?.target),
    ),
  );
  let key = $state(0);
  let scored = false;
  let answered = $state(saved?.answered ?? 0);
  let correct = $state(saved?.correct ?? 0);
  let question = $state<IdentifyTempoQuestion>();

  function onresult(result: TempoResult, responseMs: number, answerTerm?: string) {
    scored = true;
    answered += 1;
    if (result.correct) correct += 1;
    history.add(entryFromTempo('identify-tempo', target, result, { responseMs, answerTerm }));
  }

  async function next() {
    scored = false;
    flushSync(() => {
      target = createIdentifyTempoTarget(settings.value, Math.random, target);
      key += 1;
    });
    const id = key;
    if (s.scramble) await playTempoScramble();
    // Play the new round straight away, once any scramble has finished.
    if (key === id) question?.autoplay();
  }

  onDestroy(() => {
    session = { target, scored, answered, correct };
    stopAll();
  });
</script>

<div class="stack identify-tempo-page">
  <p class="meta">
    <span>{s.tempoMin}–{s.tempoMax} BPM</span>
    <span aria-label={`This session: ${correct} correct out of ${answered}`}>Session {correct}/{answered}</span>
  </p>
  {#key key}
    <IdentifyTempoQuestion bind:this={question} {target} {onresult} onnext={next} />
  {/key}
</div>

<style>
  .identify-tempo-page {
    flex: 1;
  }
  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
