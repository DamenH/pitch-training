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
  let octave = $state(lastOctave);
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

<div class="reference">
  <div class="stack instrument">
    <section class="stack keyboard" aria-labelledby="kb-heading">
      <h2 id="kb-heading" class="visually-hidden">Keyboard</h2>
      <fieldset class="octaves">
        <legend class="visually-hidden">Octave</legend>
        <div class="segmented board">
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

  .octaves,
  .readout {
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
  }

  .octaves {
    border: 0;
    padding: 0;
    min-width: 0;
  }

  /* The octave picker reads as the piano's name board: a dark strip across the top of the keys. */
  .board {
    padding: 4px 4px 5px;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: var(--key-black);
  }

  .board label {
    color: color-mix(in srgb, var(--key-black-text) 60%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .board label.checked {
    background: var(--key-black-selected);
    color: var(--key-black-selected-text);
    box-shadow: none;
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

  /* Wide windows: the instrument on the left, pieces alongside. */
  @container (min-width: 860px) {
    .reference {
      grid-template-columns: minmax(0, 1.45fr) minmax(280px, 1fr);
      align-items: start;
    }
  }
</style>
