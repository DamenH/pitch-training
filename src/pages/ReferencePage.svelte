<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    midiToFrequency,
    midiToOctave,
    midiToPitchClass,
    noteName,
    noteToMidi,
    spokenNoteName,
    type PitchClass,
  } from '../domain/music';
  import { OCTAVE_MAX, OCTAVE_MIN } from '../domain/settings';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidiPoly, holdMidi, playMidiSequence, preloadNotes } from '../lib/playback';
  import { loadJson, saveJson } from '../lib/storage';
  import { pianoPitchClassFromKey, shouldIgnoreShortcut } from '../lib/keys';
  import Piano from '../components/Piano.svelte';
  import Icon from '../components/Icon.svelte';
  import ScoreLibrary from '../components/ScoreLibrary.svelte';

  const SEQUENCE_KEY = 'reference-sequence/v1';
  const MAX_SEQUENCE = 16;

  function loadSequence(): number[] {
    const raw = loadJson(SEQUENCE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((m): m is number => typeof m === 'number' && Number.isInteger(m) && m >= 12 && m <= 108)
      .slice(0, MAX_SEQUENCE);
  }

  const s = $derived(settings.value);
  let octave = $state(4);
  let selectedMidi = $state<number | null>(null);
  let sequence = $state<number[]>(loadSequence());
  let playingSequence = $state(false);
  let announce = $state('');
  let held = $state<number[]>([]);
  let scoreNotes = $state<number[]>([]);
  const releases = new Map<number, () => void>();
  const keyboardNotes = new Map<string, number>();
  const active = $derived([...new Set([...held, ...scoreNotes].filter((m) => midiToOctave(m) === octave).map(midiToPitchClass))]);

  // Fetch samples for the visible octave (and its neighbours' edges) ahead of the first tap.
  $effect(() => {
    void s.waveform;
    preloadNotes((octave + 1) * 12 - 1, (octave + 1) * 12 + 12);
  });

  const selectedPc = $derived<PitchClass | null>(
    selectedMidi !== null && midiToOctave(selectedMidi) === octave ? midiToPitchClass(selectedMidi) : null,
  );

  function press(pc: PitchClass) {
    const midi = noteToMidi(pc, octave);
    selectedMidi = midi;
    if (playingSequence) stopSeq();
    if (releases.has(midi)) return;
    releases.set(midi, holdMidi(midi));
    held = [...releases.keys()];
  }

  function releaseMidi(midi: number) {
    releases.get(midi)?.();
    releases.delete(midi);
    held = [...releases.keys()];
  }

  function releaseKeys() {
    for (const release of releases.values()) release();
    releases.clear();
    keyboardNotes.clear();
    held = [];
  }

  function replay() {
    if (selectedMidi !== null) playMidiPoly(selectedMidi);
  }

  function setOctave(o: number) {
    releaseKeys();
    octave = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o));
  }

  function saveSequence(next: number[]) {
    sequence = next;
    saveJson(SEQUENCE_KEY, next);
  }

  function addToSequence() {
    if (selectedMidi === null || sequence.length >= MAX_SEQUENCE) return;
    saveSequence([...sequence, selectedMidi]);
    announce = `Added ${spokenNoteName(selectedMidi, s.spelling)}. ${sequence.length} notes in sequence.`;
  }

  function removeAt(i: number) {
    saveSequence(sequence.filter((_, j) => j !== i));
    announce = `Removed. ${sequence.length} notes in sequence.`;
  }

  async function playSeq() {
    if (sequence.length === 0) return;
    releaseKeys();
    playingSequence = true;
    await playMidiSequence(sequence);
    playingSequence = false;
  }

  function stopSeq() {
    releaseKeys();
    stopAll();
    playingSequence = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (shouldIgnoreShortcut(e)) return;
    const pc = pianoPitchClassFromKey(e);
    if (pc !== null) {
      e.preventDefault();
      if (!e.repeat) {
        press(pc);
        keyboardNotes.set(e.code, noteToMidi(pc, octave));
      }
    } else if (e.code === 'KeyZ') {
      e.preventDefault();
      setOctave(octave - 1);
    } else if (e.code === 'KeyX') {
      e.preventDefault();
      setOctave(octave + 1);
    }
  }

  function onkeyup(e: KeyboardEvent) {
    const midi = keyboardNotes.get(e.code);
    if (midi !== undefined) {
      releaseMidi(midi);
      keyboardNotes.delete(e.code);
    }
  }

  onDestroy(() => { releaseKeys(); stopAll(); });

  const octaves = Array.from({ length: OCTAVE_MAX - OCTAVE_MIN + 1 }, (_, i) => OCTAVE_MIN + i);
</script>

<svelte:window {onkeydown} {onkeyup} onblur={releaseKeys} />

<div class="layout">
  <section class="card stack keyboard" aria-labelledby="kb-heading">
    <h2 id="kb-heading" class="visually-hidden">Keyboard</h2>

    <div class="selected" aria-live="polite">
      {#if selectedMidi !== null}
        <span class="note">{noteName(selectedMidi, s.spelling)}</span>
        <span class="freq">{midiToFrequency(selectedMidi).toFixed(2)} Hz</span>
      {:else}
        <span class="note muted">—</span>
        <span class="freq muted">&nbsp;</span>
      {/if}
    </div>

    <fieldset class="octaves">
      <legend>Octave</legend>
      <div class="seg">
        {#each octaves as o (o)}
          <label class:checked={octave === o}>
            <input type="radio" name="octave" value={o} checked={octave === o} onchange={() => setOctave(o)} />
            <span>{o}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <Piano {octave} selected={selectedPc} spelling={s.spelling} onpress={press}
      onrelease={(pc) => releaseMidi(noteToMidi(pc, octave))} {active} />

    <div class="row controls">
      <button type="button" class="btn" onclick={replay} disabled={selectedMidi === null}>
        <Icon name="play" /> Play again
      </button>
      <button
        type="button"
        class="btn"
        onclick={addToSequence}
        disabled={selectedMidi === null || sequence.length >= MAX_SEQUENCE}
      >
        <Icon name="plus" /> Add to sequence
      </button>
    </div>
    <p class="kbd-hint muted small">
      Keyboard: <kbd>A</kbd><kbd>W</kbd><kbd>S</kbd><kbd>E</kbd><kbd>D</kbd><kbd>F</kbd><kbd>T</kbd><kbd>G</kbd><kbd
        >Y</kbd
      ><kbd>H</kbd><kbd>U</kbd><kbd>J</kbd> play C to B · <kbd>Z</kbd>/<kbd>X</kbd> octave down/up
    </p>
  </section>

  <section class="card stack" aria-labelledby="seq-heading">
    <div class="seq-head">
      <h2 id="seq-heading">Reference sequence</h2>
      <span class="muted small">{sequence.length}/{MAX_SEQUENCE}</span>
    </div>
    {#if sequence.length === 0}
      <p class="muted small">Empty — select a key, then “Add to sequence”.</p>
    {:else}
      <ol class="chips">
        {#each sequence as m, i (i)}
          <li>
            <span>{noteName(m, s.spelling)}</span>
            <button
              type="button"
              class="chip-x"
              aria-label={`Remove ${spokenNoteName(m, s.spelling)} (position ${i + 1})`}
              onclick={() => removeAt(i)}
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        {/each}
      </ol>
    {/if}
    <div class="row">
      {#if playingSequence}
        <button type="button" class="btn primary" onclick={stopSeq}><Icon name="stop" /> Stop</button>
      {:else}
        <button type="button" class="btn primary" onclick={playSeq} disabled={sequence.length === 0}>
          <Icon name="play" /> Play sequence
        </button>
      {/if}
      <button type="button" class="btn" onclick={() => saveSequence([])} disabled={sequence.length === 0}>
        Clear
      </button>
    </div>
    <p class="visually-hidden" aria-live="polite">{announce}</p>
  </section>
</div>

<ScoreLibrary onnotes={(notes) => { scoreNotes = notes; }} onplay={stopSeq} />

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }

  .selected {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 12px;
    min-height: 3.2rem;
  }

  .note {
    font-size: 2.6rem;
    font-weight: 800;
    line-height: 1;
  }

  .freq {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .octaves {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .octaves legend {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .seg {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .seg label {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    font-weight: 700;
    cursor: pointer;
    border-left: 1px solid var(--border);
    background: var(--surface);
  }

  .seg label:first-child {
    border-left: 0;
  }

  .seg label.checked {
    background: var(--accent);
    color: var(--accent-text);
  }

  .seg label:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: -3px;
  }

  .seg input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: inherit;
  }

  .controls .btn {
    flex: 1 1 140px;
  }

  .seq-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .seq-head h2 {
    margin: 0;
  }

  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chips li {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding-left: 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    font-weight: 700;
  }

  .chip-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 0;
    background: transparent;
    border-radius: 50%;
    color: var(--text-muted);
  }

  @media (hover: hover) {
    .chip-x:hover {
      color: var(--bad);
    }
  }

  /* Phone on its side: note readout beside the octave picker, leaving height for a wide piano. */
  @media (orientation: landscape) and (max-height: 500px) {
    .keyboard {
      --piano-h: clamp(140px, calc(100dvh - 230px), 240px);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: end;
      gap: 12px var(--gap);
    }
    .keyboard > *,
    .keyboard > :global(.piano) {
      grid-column: 1 / -1;
    }
    .keyboard > .selected {
      grid-column: 1;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-height: 0;
      min-width: 6.5em;
    }
    .keyboard > .octaves {
      grid-column: 2;
    }
    .note {
      font-size: 2rem;
    }
    .freq {
      font-size: 0.85rem;
    }
  }

  @media (min-width: 900px) {
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
      align-items: start;
    }
  }
</style>
