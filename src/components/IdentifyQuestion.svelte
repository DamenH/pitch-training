<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { evaluateIdentify, type IdentifyResult, type Question } from '../domain/exercise';
  import { noteName, noteToMidi, pitchClassName, midiToOctave, type PitchClass } from '../domain/music';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidi, playMidiPoly } from '../lib/playback';
  import { haptic, onPress } from '../lib/native';
  import { pitchClassFromKey, shouldIgnoreShortcut } from '../lib/keys';
  import Piano from './Piano.svelte';
  import Icon from './Icon.svelte';

  let {
    question,
    onresult,
    onnext,
  }: {
    question: Question;
    onresult: (result: IdentifyResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  const s = $derived(settings.value);
  let plays = $state(0);
  let firstPlayAt: number | null = null;
  let selected = $state<PitchClass | null>(null);
  let result = $state<IdentifyResult | null>(null);
  let notice = $state('');
  let nextButton: HTMLButtonElement | undefined = $state();
  let feedback: HTMLElement | undefined = $state();

  // Single-play applies before the answer; afterwards replay is always allowed.
  const canPlay = $derived(result !== null || s.replayPolicy === 'unlimited' || plays === 0);
  const options = $derived(s.enabledPitchClasses);

  function play() {
    if (!canPlay) return;
    if (firstPlayAt === null) firstPlayAt = Date.now();
    plays += 1;
    notice = '';
    void playMidi(question.targetMidi);
  }

  function submit() {
    if (result) return;
    if (plays === 0) {
      notice = 'Play the note first.';
      return;
    }
    if (selected === null) {
      notice = 'Choose a note, then submit.';
      return;
    }
    result = evaluateIdentify(question, selected);
    haptic(result.correct ? 'success' : 'error');
    onresult(result, Date.now() - (firstPlayAt ?? question.createdAt));
    // On small screens the verdict can land below the fold; bring it into view, then move focus.
    void tick().then(() => {
      feedback?.scrollIntoView({ block: 'nearest' });
      nextButton?.focus({ preventScroll: true });
    });
  }

  function playAnswer() {
    if (!result) return;
    // The chosen pitch class in the same octave as the target, for comparison.
    void playMidi(noteToMidi(result.answer, midiToOctave(question.targetMidi)));
  }

  function pressKey(pc: PitchClass) {
    if (result) {
      playMidiPoly(noteToMidi(pc, midiToOctave(question.targetMidi)));
    } else if (options.includes(pc)) {
      selected = pc;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (shouldIgnoreShortcut(e)) return;
    if (e.key === 'Enter') {
      // Let Enter activate a focused button normally.
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (result) onnext();
      else submit();
      return;
    }
    if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
      if (e.key === ' ' && (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)) return;
      e.preventDefault();
      play();
      return;
    }
    const pc = pitchClassFromKey(e);
    if (pc !== null && (result !== null || options.includes(pc))) {
      e.preventDefault();
      pressKey(pc);
    }
  }

  onDestroy(stopAll);
</script>

<svelte:window {onkeydown} />

<section class="stack identify" aria-label="Hear and identify">
  <div class="prompt">
    <button type="button" class="play" {...onPress(play)} disabled={!canPlay} title="Play note (R)">
      <span class="disc"><Icon name="play" size={30} /></span>
      <span>{#if plays === 0}Play note{:else if canPlay}Replay note{:else}Played once{/if}</span>
    </button>
  </div>

  <!-- Silent while guessing; after submission, play comparison notes in the target's octave. -->
  <Piano
    spelling={s.spelling}
    {selected}
    enabled={result ? null : options}
    correct={result ? question.targetPitchClass : null}
    label={result ? 'Play notes to compare with the answer' : 'Which note did you hear?'}
    onpress={pressKey}
  />

  {#if notice && !result}
    <p class="notice warn" role="status">{notice}</p>
  {/if}

  <div aria-live="polite" bind:this={feedback}>
    {#if result}
      <div class="notice verdict" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">{result.correct ? 'Correct' : 'Not quite'}</p>
        <p class="detail">
          It was <strong>{pitchClassName(question.targetPitchClass, s.spelling)}</strong>
          <span class="muted">({noteName(question.targetMidi, s.spelling)})</span>{#if !result.correct}.
            You chose <strong>{pitchClassName(result.answer, s.spelling)}</strong>{/if}.
        </p>
      </div>
    {/if}
  </div>

  <div class="action-bar">
    {#if result}
      {#if !result.correct}
        <button type="button" class="btn" {...onPress(playAnswer)}>Hear your note</button>
      {/if}
      <button type="button" class="btn primary" bind:this={nextButton} onclick={onnext} title="Next note (Enter)">
        Next note <Icon name="arrow-right" />
      </button>
    {:else}
      <button type="button" class="btn primary" onclick={submit} disabled={selected === null || plays === 0} title="Submit (Enter)">
        Submit answer
      </button>
    {/if}
  </div>
</section>

<style>
  .prompt {
    display: flex;
    justify-content: center;
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
    width: 80px;
    height: 80px;
    padding-left: 4px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 35%, transparent);
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
  @media (hover: hover) {
    .play:hover:not(:disabled) .disc {
      filter: brightness(1.08);
    }
  }
  .play:focus-visible {
    outline: none;
  }
  .play:focus-visible .disc {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .prompt {
      padding-block: 0;
    }
    .play {
      flex-direction: row;
    }
    .disc {
      width: 52px;
      height: 52px;
    }
  }
</style>
