<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    evaluateIdentify,
    evaluateIdentifyOctave,
    type IdentifyOctaveResult,
    type IdentifyResult,
    type Question,
  } from '../domain/exercise';
  import { noteName, noteToMidi, pitchClassName, midiToOctave, type PitchClass } from '../domain/music';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidi, playMidiPoly } from '../lib/playback';
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
    onresult: (result: IdentifyResult | IdentifyOctaveResult, responseMs: number) => void;
    onnext: () => void;
  } = $props();

  const s = $derived(settings.value);
  let plays = $state(0);
  let firstPlayAt: number | null = null;
  let selected = $state<PitchClass | null>(null);
  let selectedOctave = $state<number | null>(null);
  let result = $state<IdentifyResult | IdentifyOctaveResult | null>(null);
  let notice = $state('');

  // Single-play applies before the answer; afterwards replay is always allowed.
  const canPlay = $derived(result !== null || s.replayPolicy === 'unlimited' || plays === 0);
  const options = $derived(s.enabledPitchClasses);
  const octaveMode = $derived(question.kind === 'identify-octave');
  const octaves = $derived(
    Array.from({ length: s.playbackOctaveMax - s.playbackOctaveMin + 1 }, (_, i) => s.playbackOctaveMin + i),
  );

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
    if (octaveMode) {
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
    } else if (!result && !octaveMode && options.includes(pc)) {
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
    if (!octaveMode && pc !== null && (result !== null || options.includes(pc))) {
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
      <span>{#if plays === 0}Play note{:else if canPlay}Replay note{:else}Played once{/if}</span>
    </button>
  </div>

  {#if octaveMode}
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

  {#if notice && !result}
    <p class="notice warn" role="status">{notice}</p>
  {/if}

  <div class="feedback" aria-live="polite">
    {#if result}
      <div class="notice verdict" class:good={result.correct} class:bad={!result.correct}>
        <p class="title">{result.correct ? 'Correct' : 'Not quite'}</p>
        <p class="detail">
          {#if result.kind === 'identify-octave'}
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
      disabled={!result && (plays === 0 || (octaveMode ? selectedOctave === null : selected === null))}
      title={result ? 'Next note (Enter)' : 'Submit (Enter)'}
    >
      {#if result}
        Next note <Icon name="arrow-right" />
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
  .octave-answer {
    display: flex;
    flex-direction: column;
  }

  @media (orientation: portrait) and (max-width: 899px) {
    .identify {
      flex: 1;
    }
    .feedback {
      min-height: 88px;
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
