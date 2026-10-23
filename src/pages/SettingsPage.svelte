<script lang="ts">
  import {
    ALL_PITCH_CLASSES,
    midiToFrequency,
    noteName,
    pitchClassName,
    spokenPitchClassName,
    type PitchClass,
  } from '../domain/music';
  import {
    allPitchClasses,
    DURATION_MAX,
    DURATION_MIN,
    naturalPitchClasses,
    normalizeVocalRange,
    OCTAVE_MAX,
    OCTAVE_MIN,
    togglePitchClass,
    TOLERANCE_MAX,
    TOLERANCE_MIN,
    VOCAL_MIDI_MAX,
    VOCAL_MIDI_MIN,
    VOCAL_PRESETS,
    type ScoringPolicy,
    type ReplayPolicy,
    type Waveform,
  } from '../domain/settings';
  import { settings } from '../lib/settings.svelte';
  import { playMidi } from '../lib/playback';
  import { onPress } from '../lib/native';
  import InstallApp from '../components/InstallApp.svelte';
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';

  const s = $derived(settings.value);
  let notice = $state('');
  let confirmReset = $state(false);

  const octaves = Array.from({ length: OCTAVE_MAX - OCTAVE_MIN + 1 }, (_, i) => OCTAVE_MIN + i);
  const vocalNotes = Array.from({ length: VOCAL_MIDI_MAX - VOCAL_MIDI_MIN + 1 }, (_, i) => VOCAL_MIDI_MIN + i);

  const presetId = $derived(VOCAL_PRESETS.find((p) => p.low === s.vocalLow && p.high === s.vocalHigh)?.id ?? 'custom');

  function toggle(pc: PitchClass) {
    if (s.enabledPitchClasses.length === 1 && s.enabledPitchClasses[0] === pc) {
      notice = 'At least one note must stay enabled.';
      return;
    }
    notice = '';
    settings.update({ enabledPitchClasses: togglePitchClass(s.enabledPitchClasses, pc) });
  }

  function setVocal(low: number, high: number) {
    const r = normalizeVocalRange(low, high);
    settings.update({ vocalLow: r.low, vocalHigh: r.high });
  }

  function choosePreset(id: string) {
    const p = VOCAL_PRESETS.find((x) => x.id === id);
    if (p) setVocal(p.low, p.high);
  }

  function setOctaveMin(v: number) {
    settings.update({ playbackOctaveMin: v, playbackOctaveMax: Math.max(v, s.playbackOctaveMax) });
  }

  function setOctaveMax(v: number) {
    settings.update({ playbackOctaveMax: v, playbackOctaveMin: Math.min(v, s.playbackOctaveMin) });
  }

  function reset() {
    confirmReset = false;
    settings.reset();
  }

  const REPLAYS: [ReplayPolicy, string][] = [['unlimited', 'Unlimited'], ['single', 'Single play']];
  const SCORING: [ScoringPolicy, string][] = [['pitch-class', 'Any octave'], ['exact', 'Exact octave']];
</script>

<div class="settings">
  <section aria-labelledby="notes-h">
    <h2 id="notes-h" class="eyebrow">Notes</h2>
    <fieldset class="pcs">
      <legend class="visually-hidden">Enabled notes</legend>
      {#each ALL_PITCH_CLASSES as pc (pc)}
        {@const on = s.enabledPitchClasses.includes(pc)}
        <label class:on>
          <input
            type="checkbox"
            checked={on}
            onchange={(e) => {
              toggle(pc);
              // Keep the checkbox in sync if the change was refused.
              (e.currentTarget as HTMLInputElement).checked = settings.value.enabledPitchClasses.includes(pc);
            }}
            aria-label={spokenPitchClassName(pc, s.spelling)}
          />
          <span aria-hidden="true">{pitchClassName(pc, s.spelling)}</span>
        </label>
      {/each}
    </fieldset>
    {#if notice}<p class="notice warn small" role="status">{notice}</p>{/if}
    <div class="row">
      <button type="button" class="btn small" onclick={() => settings.update({ enabledPitchClasses: allPitchClasses() })}>
        All 12 notes
      </button>
      <button type="button" class="btn small" onclick={() => settings.update({ enabledPitchClasses: naturalPitchClasses() })}>
        Naturals only
      </button>
    </div>
  </section>

  <section aria-labelledby="sound-h">
    <h2 id="sound-h" class="eyebrow">Sound</h2>
    <div class="item">
      <label class="field grow">
        <span>Instrument</span>
        <select value={s.waveform} onchange={(e) => settings.update({ waveform: e.currentTarget.value as Waveform })}>
          <option value="piano">Grand piano</option>
          <option value="sine">Sine</option>
          <option value="triangle">Triangle</option>
          <option value="warm">Warm</option>
        </select>
      </label>
      <button type="button" class="btn" {...onPress(() => playMidi(69))}><Icon name="play" size={16} /> Test</button>
    </div>
    <label class="field item">
      <span>Volume <output>{Math.round(s.volume * 100)}%</output></span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={s.volume}
        oninput={(e) => settings.update({ volume: Number(e.currentTarget.value) })}
      />
    </label>
    <label class="item toggle">
      <span class="toggle-copy">
        <strong>Scramble before each new note</strong>
        <small>Play a brief random run to break relative pitch.</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        checked={s.scramble}
        onchange={(e) => settings.update({ scramble: e.currentTarget.checked })}
      />
    </label>
    <label class="field item">
      <span>Note length <output>{s.noteDuration.toFixed(1)} s</output></span>
      <input
        type="range"
        min={DURATION_MIN}
        max={DURATION_MAX}
        step="0.1"
        value={s.noteDuration}
        oninput={(e) => settings.update({ noteDuration: Number(e.currentTarget.value) })}
      />
    </label>
    {#if s.waveform === 'piano'}
      <p class="credit">
        <a href="https://archive.org/details/SalamanderGrandPianoV3" target="_blank" rel="noopener noreferrer"
          >Salamander Grand Piano</a
        >
        by Alexander Holm,
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a>;
        retuned to equal temperament.
      </p>
    {/if}
  </section>

  <section aria-labelledby="identify-h">
    <h2 id="identify-h" class="eyebrow">Identify &amp; Reference</h2>
    <div class="pair item">
      <label class="field">
        <span>Lowest octave</span>
        <select value={s.playbackOctaveMin} onchange={(e) => setOctaveMin(Number(e.currentTarget.value))}>
          {#each octaves as o (o)}<option value={o}>{o} (from {noteName((o + 1) * 12, s.spelling)})</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Highest octave</span>
        <select value={s.playbackOctaveMax} onchange={(e) => setOctaveMax(Number(e.currentTarget.value))}>
          {#each octaves as o (o)}<option value={o}>{o} (to {noteName((o + 1) * 12 + 11, s.spelling)})</option>{/each}
        </select>
      </label>
    </div>
    <div class="item">
<fieldset class="field">
      <legend>Replays</legend>
      <div class="segmented">
        {#each REPLAYS as [value, label] (value)}
          <label class:checked={s.replayPolicy === value}>
            <input type="radio" name="replay" {value} checked={s.replayPolicy === value}
              onchange={() => settings.update({ replayPolicy: value })} />
            {label}
          </label>
        {/each}
      </div>
    </fieldset>
    </div>
  </section>

  <section aria-labelledby="sing-h">
    <h2 id="sing-h" class="eyebrow">Singing</h2>
    <label class="field item">
      <span>Vocal range</span>
      <select value={presetId} onchange={(e) => choosePreset(e.currentTarget.value)}>
        {#each VOCAL_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        <option value="custom" disabled={presetId !== 'custom'}>Custom</option>
      </select>
    </label>
    <div class="pair item">
      <label class="field">
        <span>Lowest note</span>
        <select value={s.vocalLow} onchange={(e) => setVocal(Number(e.currentTarget.value), s.vocalHigh)}>
          {#each vocalNotes as m (m)}<option value={m}>{noteName(m, s.spelling)} ({midiToFrequency(m).toFixed(0)} Hz)</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Highest note</span>
        <select value={s.vocalHigh} onchange={(e) => setVocal(s.vocalLow, Number(e.currentTarget.value))}>
          {#each vocalNotes as m (m)}<option value={m}>{noteName(m, s.spelling)} ({midiToFrequency(m).toFixed(0)} Hz)</option>{/each}
        </select>
      </label>
    </div>
    <div class="item">
<fieldset class="field">
      <legend>Counts as correct</legend>
      <div class="segmented">
        {#each SCORING as [value, label] (value)}
          <label class:checked={s.scoringPolicy === value}>
            <input type="radio" name="scoring" {value} checked={s.scoringPolicy === value}
              onchange={() => settings.update({ scoringPolicy: value })} />
            {label}
          </label>
        {/each}
      </div>
    </fieldset>
    </div>
    <label class="field item">
      <span>Tolerance <output>±{s.toleranceCents}¢</output></span>
      <input
        type="range"
        min={TOLERANCE_MIN}
        max={TOLERANCE_MAX}
        step="5"
        value={s.toleranceCents}
        oninput={(e) => settings.update({ toleranceCents: Number(e.currentTarget.value) })}
      />
    </label>
  </section>

  <section aria-labelledby="disp-h">
    <h2 id="disp-h" class="eyebrow">Display &amp; data</h2>
    <div class="item">
<fieldset class="field">
      <legend>Note names</legend>
      <div class="segmented">
        <label class:checked={s.spelling === 'sharps'}>
          <input type="radio" name="spelling" checked={s.spelling === 'sharps'} onchange={() => settings.update({ spelling: 'sharps' })} />
          Sharps ♯
        </label>
        <label class:checked={s.spelling === 'flats'}>
          <input type="radio" name="spelling" checked={s.spelling === 'flats'} onchange={() => settings.update({ spelling: 'flats' })} />
          Flats ♭
        </label>
      </div>
    </fieldset>
    </div>
    <label class="item toggle">
      <span>Keep history</span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        checked={s.historyEnabled}
        onchange={(e) => settings.update({ historyEnabled: e.currentTarget.checked })}
      />
    </label>
    <div class="item">
      <button type="button" class="btn danger small" onclick={() => { confirmReset = true; }}>Reset settings</button>
    </div>
  </section>

  <InstallApp />
</div>

<Sheet bind:open={confirmReset} label="Reset settings">
  <p class="sheet-title">Reset all settings?</p>
  <p class="sheet-text">History and saved pieces are kept.</p>
  <button type="button" class="btn danger block" onclick={reset}>Reset settings</button>
  <button type="button" class="btn plain block" onclick={() => { confirmReset = false; }}>Cancel</button>
</Sheet>

<style>
  /* Sections flow into two balanced columns when there is room. */
  .settings {
    column-gap: var(--space-6);
  }

  @container (min-width: 760px) {
    .settings {
      columns: 2;
    }
  }

  .settings > :global(section) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    margin-bottom: var(--space-6);
    break-inside: avoid;
  }

  .item {
    padding-top: var(--space-3);
    border-top: 1px solid var(--hairline);
  }

  div.item {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
  }

  div.item > .field {
    flex: 1;
  }

  .grow {
    flex: 1;
  }

  .pair {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-weight: 600;
  }

  .toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-copy small {
    color: var(--text-muted);
    font-weight: 400;
  }

  .pcs {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  @media (max-width: 380px) {
    .pcs {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .pcs label {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border-radius: var(--radius-sm);
    font-weight: 700;
    background: var(--surface-2);
    color: var(--text-muted);
    -webkit-user-select: none;
    user-select: none;
    transition:
      background-color 120ms,
      color 120ms;
  }

  .pcs label.on {
    background: var(--accent);
    color: var(--accent-text);
  }

  .pcs label:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }

  .pcs input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
  }

  output {
    font-weight: 400;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .credit {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
