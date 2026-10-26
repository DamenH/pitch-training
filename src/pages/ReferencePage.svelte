<script lang="ts" module>
  // The chosen octave survives switching tabs.
  let lastOctave = 4;
</script>

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
  import { OCTAVE_MAX, OCTAVE_MIN, visibleOctaves } from '../domain/settings';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { playMidiPoly, preloadNotes } from '../lib/playback';
  import { mic } from '../lib/mic.svelte';
  import { pianoPitchClassFromKey, shouldIgnoreShortcut } from '../lib/keys';
  import Piano from '../components/Piano.svelte';
  import ScoreLibrary from '../components/ScoreLibrary.svelte';
  import MicPanel from '../components/MicPanel.svelte';
  import PitchMeter from '../components/PitchMeter.svelte';
  import OctavePicker from '../components/OctavePicker.svelte';

  const s = $derived(settings.value);
  let octave = $state(lastOctave);
  let selectedMidi = $state<number | null>(null);
  let held = $state<number[]>([]);
  let scoreNotes = $state<number[]>([]);
  const keyboardNotes = new Map<string, number>();
  // Extra octaves around the chosen one; narrow screens hide them (see the styles below).
  const shown = $derived(visibleOctaves(octave, s.referenceOctaves));
  const sounding = $derived([...held, ...scoreNotes]);

  function activeIn(o: number): PitchClass[] {
    return [...new Set(sounding.filter((m) => midiToOctave(m) === o).map(midiToPitchClass))];
  }

  function selectedIn(o: number): PitchClass | null {
    return selectedMidi !== null && midiToOctave(selectedMidi) === o ? midiToPitchClass(selectedMidi) : null;
  }

  // Fetch samples for the visible octaves (and their neighbours' edges) ahead of the first tap.
  $effect(() => {
    void s.waveform;
    const low = Math.min(...shown), high = Math.max(...shown);
    preloadNotes((low + 1) * 12 - 1, (high + 1) * 12 + 12);
  });

  function press(pc: PitchClass, o = octave) {
    const midi = noteToMidi(pc, o);
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
    octave = lastOctave = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o));
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

<div class="reference" class:multi={shown.length > 1}>
  <div class="stack instrument">
    <section class="stack keyboard" aria-labelledby="kb-heading">
      <h2 id="kb-heading" class="visually-hidden">Keyboard</h2>
      <OctavePicker {octaves} value={octave} onselect={setOctave} />
      <div class="keys">
        {#each shown as o (o)}
          <div class="octave" class:current={o === octave}>
            <Piano octave={o} selected={selectedIn(o)} spelling={s.spelling} onpress={(pc) => press(pc, o)}
              onrelease={(pc) => releaseMidi(noteToMidi(pc, o))} active={activeIn(o)} />
          </div>
        {/each}
      </div>
      <p class="readout" aria-live="polite">
        {#if selectedMidi !== null}
          <span class="note">{noteName(selectedMidi, s.spelling)}</span>
          <span class="freq">{midiToFrequency(selectedMidi).toFixed(2)} Hz</span>
        {/if}
      </p>
    </section>

    <section class="stack voice" aria-label="Match with your voice">
      <MicPanel quiet />
      {#if mic.status === 'running'}
        <PitchMeter live={mic.live} targetMidi={selectedMidi} policy={s.scoringPolicy}
          toleranceCents={s.toleranceCents} spelling={s.spelling} />
      {/if}
    </section>
  </div>

  <ScoreLibrary onnotes={(notes) => { scoreNotes = notes; }} onplay={releaseKeys} />
</div>

<style>
  .reference {
    display: grid;
    gap: var(--space-6);
  }

  .instrument {
    gap: var(--space-3);
    min-width: 0;
  }

  /* Octave picker, keys and readout share the keyboard's width. */
  .keyboard {
    gap: 0;
  }

  .readout,
  .keys {
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
  }

  .keys {
    display: flex;
  }

  .octave {
    flex: 1;
    min-width: 0;
  }

  /* Several octaves need room: below that, only the chosen octave is shown. */
  @container (max-width: 719px) {
    .octave:not(.current) {
      display: none;
    }
  }

  @container (min-width: 720px) {
    .multi .keys,
    .multi .readout,
    .multi .keyboard :global(.octaves) {
      max-width: none;
    }
  }

  /* Height reserved so nothing below moves when a key is first pressed. */
  .readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-2);
    min-height: 1.75rem;
    margin-top: var(--space-2);
  }

  .note {
    font-size: var(--text-lg);
    font-weight: 800;
    line-height: 1;
  }

  .freq {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .voice {
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
    gap: var(--space-3);
  }

  /* Wide windows: the instrument on the left, pieces alongside (below a multi-octave keyboard). */
  @container (min-width: 860px) {
    .reference:not(.multi) {
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, 1fr);
      align-items: start;
    }
  }
</style>
