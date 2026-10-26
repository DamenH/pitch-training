<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    evaluateIdentify,
    evaluateIdentifyChroma,
    evaluateIdentifyOctave,
    replayInRandomOctave,
    replayInSweep,
    type ChromaAnswer,
    type IdentifyAnyResult,
    type Question,
  } from '../domain/exercise';
  import { noteName, noteToMidi, pitchClassName, midiToOctave, midiToPitchClass, type PitchClass } from '../domain/music';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidi, playMidiPoly, playMidiSequence } from '../lib/playback';
  import { haptic, onPress } from '../lib/native';
  import { pitchClassFromKey, shouldIgnoreShortcut } from '../lib/keys';
  import Piano from './Piano.svelte';
  import Icon from './Icon.svelte';
  import OctavePicker from './OctavePicker.svelte';

  let {
    question,
    onresult,
    onnext,
  }: {
    question: Question;
    onresult: (result: IdentifyAnyResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  const s = $derived(settings.value);
  let plays = $state(0);
  let firstPlayAt: number | null = null;
  let selected = $state<PitchClass | null>(null);
  let selectedOctave = $state<number | null>(null);
  let selectedChroma = $state<ChromaAnswer | null>(null);
  let result = $state<IdentifyAnyResult | null>(null);
  /** The note the last (re)play sounded; random-octave replays move away from it. */
  let lastPlayed: number | null = null;
  /** Sweep replays: which way the next octave step goes. */
  let sweepDirection: 1 | -1 = 1;
  let notice = $state('');

  // Single-play applies before the answer; afterwards replay is always allowed.
  const canPlay = $derived(result !== null || s.replayPolicy === 'unlimited' || plays === 0);
  const options = $derived(s.enabledPitchClasses);
  const octaveMode = $derived(question.kind === 'identify-octave');
  const chromaMode = $derived(question.kind === 'identify-chroma');
  const notesMode = $derived(question.kind === 'identify');
  const comparisonMidi = $derived(question.comparisonMidi ?? question.targetMidi);
  const chromaTruth = $derived<ChromaAnswer>(
    midiToPitchClass(comparisonMidi) === question.targetPitchClass ? 'same' : 'different',
  );
  const octaves = $derived(
    Array.from({ length: s.playbackOctaveMax - s.playbackOctaveMin + 1 }, (_, i) => s.playbackOctaveMin + i),
  );

  function play() {
    if (!canPlay) return;
    if (firstPlayAt === null) firstPlayAt = Date.now();
    plays += 1;
    notice = '';
    if (chromaMode) {
      void playMidiSequence([question.targetMidi, comparisonMidi]);
      return;
    }
    let midi = question.targetMidi;
    if (notesMode && lastPlayed !== null && s.replayOctave === 'random') {
      midi = replayInRandomOctave(question, s, Math.random, lastPlayed);
    } else if (notesMode && lastPlayed !== null && s.replayOctave === 'sweep') {
      ({ midi, direction: sweepDirection } = replayInSweep(question, s, lastPlayed, sweepDirection));
    }
    lastPlayed = midi;
    void playMidi(midi);
  }

  /** Start a new round without a tap; single-play mode leaves its one play to the user. */
  export function autoplay() {
    if (plays === 0 && s.replayPolicy === 'unlimited') play();
  }

  function submit() {
    if (result) return;
    if (plays === 0) {
      notice = chromaMode ? 'Play the notes first.' : 'Play the note first.';
      return;
    }
    if (chromaMode) {
      if (selectedChroma === null) {
        notice = 'Choose same or different, then submit.';
        return;
      }
      result = evaluateIdentifyChroma(question, selectedChroma);
    } else if (octaveMode) {
      if (selectedOctave === null) {
        notice = 'Choose an octave, then submit.';
        return;
      }
      result = evaluateIdentifyOctave(question, selectedOctave);
    } else {
      if (selected === null) {
        notice = 'Choose a note, then submit.';
        return;
      }
      result = evaluateIdentify(question, selected);
    }
    haptic(result.correct ? 'success' : 'error');
    onresult(result, Date.now() - (firstPlayAt ?? question.createdAt));
  }

  function pressKey(pc: PitchClass) {
    if (result?.kind === 'identify') {
      playMidiPoly(noteToMidi(pc, midiToOctave(question.targetMidi)));
    } else if (!result && notesMode && options.includes(pc)) {
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
    if (chromaMode) {
      const key = e.key.toLowerCase();
      if (!result && (key === 's' || key === 'd')) {
        e.preventDefault();
        selectedChroma = key === 's' ? 'same' : 'different';
      }
      return;
    }
    const pc = pitchClassFromKey(e);
    if (notesMode && pc !== null && (result !== null || options.includes(pc))) {
      e.preventDefault();
      pressKey(pc);
      return;
    }
    if (octaveMode && !result && /^\d$/.test(e.key)) {
      const octave = Number(e.key);
      if (octaves.includes(octave)) {
        e.preventDefault();
        selectedOctave = octave;
      }
    }
  }

  onDestroy(stopAll);
</script>

<svelte:window {onkeydown} />

<section class="stack identify" aria-label="Hear and identify">
  <div class="prompt">
    <button type="button" class="play" {...onPress(play)} disabled={!canPlay} title="Play note (R)">
      <span class="disc"><Icon name="play" size={28} /></span>
      <span>
        {#if plays === 0}Play {chromaMode ? 'notes' : 'note'}{:else if canPlay}Replay {chromaMode ? 'notes' : 'note'}{:else}Played once{/if}
      </span>
    </button>
  </div>

  {#if chromaMode}
    <fieldset class="chroma-answer" disabled={result !== null}>
      <legend>Two notes in different octaves. Is it the same note?</legend>
      <div class="choices">
        {#each [['same', 'Same note', 'S'], ['different', 'Different', 'D']] as const as [value, label, key] (value)}
          <button
            type="button"
            class:selected={selectedChroma === value}
            class:correct={result !== null && chromaTruth === value}
            class:wrong={result !== null && selectedChroma === value && chromaTruth !== value}
            aria-pressed={selectedChroma === value}
            title={`${label} (${key})`}
            onclick={() => { selectedChroma = value; }}
          >
            {#if result !== null && chromaTruth === value}<span aria-hidden="true">✓ </span>{/if}
            {#if result !== null && selectedChroma === value && chromaTruth !== value}<span aria-hidden="true">✗ </span>{/if}
            {label}
          </button>
        {/each}
      </div>
    </fieldset>
  {:else if octaveMode}
    <div class="octave-answer">
      <OctavePicker
        {octaves}
        value={result ? midiToOctave(question.targetMidi) : selectedOctave}
        onselect={(octave) => { selectedOctave = octave; }}
        answer={result?.kind === 'identify-octave' ? result.answer : null}
        correct={result ? midiToOctave(question.targetMidi) : null}
        disabled={result !== null}
      />
      <Piano
        octave={result ? midiToOctave(question.targetMidi) : selectedOctave}
        spelling={s.spelling}
        enabled={[question.targetPitchClass]}
        interactive={false}
        label={`${pitchClassName(question.targetPitchClass, s.spelling)}, choose its octave`}
        onpress={() => {}}
      />
    </div>
  {:else}
    <!-- Silent while guessing; after submission, play comparison notes in the target's octave. -->
    <Piano
      spelling={s.spelling}
      {selected}
      enabled={result ? null : options}
      correct={result ? question.targetPitchClass : null}
      label={result ? 'Play notes to compare with the answer' : 'Which note did you hear?'}
      onpress={pressKey}
    />
  {/if}

  <!-- Fixed height, so the answer appearing doesn't move the button below it. -->
  <div class="feedback" aria-live="polite">
    {#if notice && !result}
      <p class="notice warn" role="status">{notice}</p>
    {:else if result}
      <div class="notice verdict" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">{result.correct ? 'Correct' : 'Not quite'}</p>
        <p class="detail">
          {#if result.kind === 'identify-chroma'}
            <strong>{noteName(question.targetMidi, s.spelling)}</strong> then
            <strong>{noteName(comparisonMidi, s.spelling)}</strong>:
            {chromaTruth === 'same' ? 'the same note' : 'different notes'}.
          {:else if result.kind === 'identify-octave'}
            It was <strong>{noteName(question.targetMidi, s.spelling)}</strong>{#if !result.correct}.
              You chose <strong>{pitchClassName(question.targetPitchClass, s.spelling)}{result.answer}</strong>{/if}.
          {:else}
            It was <strong>{pitchClassName(question.targetPitchClass, s.spelling)}</strong>
            <span class="muted">({noteName(question.targetMidi, s.spelling)})</span>{#if !result.correct}.
              You chose <strong>{pitchClassName(result.answer, s.spelling)}</strong>{/if}.
          {/if}
        </p>
      </div>
    {/if}
  </div>

  <div class="action-bar">
    <button
      type="button"
      class="btn primary"
      onclick={result ? onnext : submit}
      disabled={!result &&
        (plays === 0 ||
          (chromaMode ? selectedChroma === null : octaveMode ? selectedOctave === null : selected === null))}
      title={result ? 'Next note (Enter)' : 'Submit (Enter)'}
    >
      {#if result}
        {chromaMode ? 'Next pair' : 'Next note'} <Icon name="arrow-right" />
      {:else}
        Submit answer
      {/if}
    </button>
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
    width: 72px;
    height: 72px;
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
  .chroma-answer {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .chroma-answer legend {
    margin-bottom: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
    width: 100%;
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .choices button {
    min-height: 64px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-base);
    font-weight: 600;
  }
  .choices button.selected {
    border-color: var(--chroma);
    background: var(--chroma);
    color: var(--chroma-text);
  }
  .choices button.correct {
    border-color: var(--good);
    background: var(--good);
    color: var(--surface);
  }
  .choices button.wrong {
    border-color: var(--bad);
    background: var(--bad);
    color: var(--surface);
  }
  .octave-answer {
    display: flex;
    flex-direction: column;
  }
  .feedback {
    min-height: 88px;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .identify {
      flex: 1;
    }
    .action-bar {
      position: fixed;
      left: 50%;
      bottom: calc(var(--nav-height) + var(--safe-bottom) + var(--space-2));
      width: min(
        var(--page-max),
        calc(100vw - 2 * var(--gutter) - var(--safe-left) - var(--safe-right))
      );
      padding: 0;
      margin: 0;
      transform: translateX(-50%);
      background: none;
    }
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .prompt {
      padding-block: 0;
    }
    .play {
      flex-direction: row;
    }
    .disc {
      width: 48px;
      height: 48px;
    }
  }
</style>
