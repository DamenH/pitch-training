<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    midiToFrequency,
    midiToOctave,
    midiToPitchClass,
    noteName,
    noteToMidi,
    type PitchClass,
  } from '../domain/music';
  import { OCTAVE_MAX, OCTAVE_MIN } from '../domain/settings';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidiPoly, preloadNotes } from '../lib/playback';
  import { mic } from '../lib/mic.svelte';
  import { pianoPitchClassFromKey, shouldIgnoreShortcut } from '../lib/keys';
  import Piano from '../components/Piano.svelte';
  import ScoreLibrary from '../components/ScoreLibrary.svelte';
  import MicPanel from '../components/MicPanel.svelte';
  import PitchMeter from '../components/PitchMeter.svelte';

  const s = $derived(settings.value);
  let octave = $state(4);
  let selectedMidi = $state<number | null>(null);
  let held = $state<number[]>([]);
  let scoreNotes = $state<number[]>([]);
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
    if (held.includes(midi)) return;
    playMidiPoly(midi);
    held = [...held, midi];
  }

  function releaseMidi(midi: number) {
    // Releasing the key changes its highlight; the reference tone finishes naturally.
    held = held.filter((note) => note !== midi);
  }

  function releaseKeys() {
    keyboardNotes.clear();
    held = [];
  }

  function setOctave(o: number) {
    releaseKeys();
    octave = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o));
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

  mic.resetTracking();
  onDestroy(() => { releaseKeys(); stopAll(); mic.stop(); });

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

    <details class="kbd-hint muted small"><summary>Keyboard shortcuts</summary><p>
      Keyboard: <kbd>A</kbd><kbd>W</kbd><kbd>S</kbd><kbd>E</kbd><kbd>D</kbd><kbd>F</kbd><kbd>T</kbd><kbd>G</kbd><kbd
        >Y</kbd
      ><kbd>H</kbd><kbd>U</kbd><kbd>J</kbd> play C to B · <kbd>Z</kbd>/<kbd>X</kbd> octave down/up
    </p></details>
  </section>

  <section class="card stack voice-card" aria-label="Match with your voice">
    <MicPanel />
    {#if mic.status === 'running'}
      <PitchMeter live={mic.live} targetMidi={selectedMidi} policy={s.scoringPolicy}
        toleranceCents={s.toleranceCents} spelling={s.spelling} />
    {/if}
    <p class="muted small">Play a piano key, then match it with your voice.</p>
  </section>
</div>

<ScoreLibrary onnotes={(notes) => { scoreNotes = notes; }} onplay={releaseKeys} />

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }
  .voice-card p { margin: 0; }
  .kbd-hint summary { cursor: pointer; }
  .kbd-hint p { margin-block: 8px 0; }

  .selected {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 12px;
    min-height: 2rem;
  }

  .note {
    font-size: 1.8rem;
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

  .keyboard { gap: 10px; }
  .keyboard :global(.piano) { --piano-h: clamp(150px, 42vw, 220px); }
  @media (max-width: 600px) {
    .keyboard { margin-inline: -12px; padding: 12px 0 0; overflow: hidden; }
    .selected, .octaves, .kbd-hint { margin-inline: 12px; }
    .kbd-hint { margin-bottom: 10px; }
  }
</style>
