<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { evaluateIdentify, type IdentifyResult, type Question } from '../domain/exercise';
  import { noteName, noteToMidi, pitchClassName, midiToOctave, type PitchClass } from '../domain/music';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidi, playMidiPoly } from '../lib/playback';
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
  <div class="card prompt">
    <button type="button" class="btn primary play" onclick={play} disabled={!canPlay}>
      <Icon name="play" />
      {#if plays === 0}Play note{:else if canPlay}Replay note{:else}Played (single play){/if}
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

  {#if result}
    <p class="small muted">Play the piano keys to compare notes in octave {midiToOctave(question.targetMidi)}.</p>
  {/if}

  {#if notice && !result}
    <p class="notice warn" role="status">{notice}</p>
  {/if}

  <div aria-live="polite" bind:this={feedback}>
    {#if result}
      <div class="notice" class:good={result.correct} class:bad={!result.correct}>
        <p class="verdict">
          <span aria-hidden="true">{result.correct ? '✓' : '✗'}</span>
          {result.correct ? 'Correct' : 'Not quite'}
        </p>
        <p class="detail">
          The note was <strong>{pitchClassName(question.targetPitchClass, s.spelling)}</strong>
          <span class="muted">(played as {noteName(question.targetMidi, s.spelling)})</span>.
          You chose <strong>{pitchClassName(result.answer, s.spelling)}</strong>.
        </p>
      </div>
    {/if}
  </div>

  <div class="action-bar">
    {#if result}
      {#if !result.correct}
        <button type="button" class="btn" onclick={playAnswer}>Hear your note</button>
      {/if}
      <button type="button" class="btn primary" bind:this={nextButton} onclick={onnext}>
        Next note <Icon name="arrow-right" />
      </button>
    {:else}
      <button type="button" class="btn primary" onclick={submit} disabled={selected === null || plays === 0}>
        Submit answer
      </button>
    {/if}
  </div>

  <p class="kbd-hint muted small">
    Keyboard: <kbd>R</kbd> or <kbd>Space</kbd> play · <kbd>C</kbd>–<kbd>B</kbd>
    {result ? 'play a comparison note' : 'choose a note'} ·
    <kbd>Shift</kbd>+letter for sharp · <kbd>Enter</kbd> submit / next
  </p>
</section>

<style>
  .prompt {
    display: flex;
    justify-content: center;
  }
  .verdict {
    font-size: 1.2rem;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .detail {
    margin: 0;
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .prompt { padding-block: 8px; }
    .identify { --piano-h: 170px; }
  }
</style>
