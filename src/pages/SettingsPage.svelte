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
  import { href } from '../lib/router.svelte';
  import InstallApp from '../components/InstallApp.svelte';

  const s = $derived(settings.value);
  let notice = $state('');

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
    if (confirm('Reset all settings to their defaults? Your history is kept.')) settings.reset();
  }
</script>

<div class="page stack">
  <InstallApp />
  <section class="card stack" aria-labelledby="notes-h">
    <h2 id="notes-h">Notes in exercises</h2>
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
      <button
        type="button"
        class="btn small"
        onclick={() => settings.update({ enabledPitchClasses: naturalPitchClasses() })}
      >
        Natural notes only
      </button>
      <span class="muted small">{s.enabledPitchClasses.length} enabled</span>
    </div>
  </section>

  <section class="card stack" aria-labelledby="play-h">
    <h2 id="play-h">Playback (Identify &amp; Reference)</h2>
    <div class="grid2">
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

    <fieldset class="field">
      <legend>Replays in Identify</legend>
      <div class="radios">
        {#each [['unlimited', 'Unlimited replays'], ['single', 'Single play (no replay before answering)']] as [value, label] (value)}
          <label>
            <input
              type="radio"
              name="replay"
              {value}
              checked={s.replayPolicy === value}
              onchange={() => settings.update({ replayPolicy: value as ReplayPolicy })}
            />
            {label}
          </label>
        {/each}
      </div>
    </fieldset>

    <label class="field">
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

    <label class="field">
      <span>Note duration <output>{s.noteDuration.toFixed(1)} s</output></span>
      <input
        type="range"
        min={DURATION_MIN}
        max={DURATION_MAX}
        step="0.1"
        value={s.noteDuration}
        oninput={(e) => settings.update({ noteDuration: Number(e.currentTarget.value) })}
      />
    </label>

    <div class="grid2 end">
      <label class="field">
        <span>Sound</span>
        <select value={s.waveform} onchange={(e) => settings.update({ waveform: e.currentTarget.value as Waveform })}>
          <option value="piano">Grand piano (sampled)</option>
          <option value="sine">Sine (pure)</option>
          <option value="triangle">Triangle (brighter)</option>
          <option value="warm">Warm (soft harmonics, clearer on phone speakers)</option>
        </select>
      </label>
      <button type="button" class="btn" onclick={() => playMidi(69)}>Test sound (A4)</button>
    </div>
    {#if s.waveform === 'piano'}
      <p class="muted small">
        Piano: <a href="https://archive.org/details/SalamanderGrandPianoV3" target="_blank" rel="noopener noreferrer"
          >Salamander Grand Piano</a
        >
        by Alexander Holm (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer"
          >CC BY 3.0</a
        >), bundled with the app and retuned to exact equal temperament.
      </p>
    {/if}
  </section>

  <section class="card stack" aria-labelledby="sing-h">
    <h2 id="sing-h">Singing</h2>
    <label class="field">
      <span>Vocal range preset</span>
      <select value={presetId} onchange={(e) => choosePreset(e.currentTarget.value)}>
        {#each VOCAL_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        <option value="custom" disabled={presetId !== 'custom'}>Custom</option>
      </select>
    </label>
    <div class="grid2">
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

    <fieldset class="field">
      <legend>Scoring</legend>
      <div class="radios">
        {#each [['pitch-class', 'Any octave (pitch class)', 'A3, A4 and A5 all count for A.'], ['exact', 'Exact note', 'A3 does not count for A4.']] as [value, label, help] (value)}
          <label>
            <input
              type="radio"
              name="scoring"
              {value}
              checked={s.scoringPolicy === value}
              onchange={() => settings.update({ scoringPolicy: value as ScoringPolicy })}
            />
            <span><strong>{label}</strong><br /><span class="muted small">{help}</span></span>
          </label>
        {/each}
      </div>
    </fieldset>

    <label class="field">
      <span>Tolerance <output>±{s.toleranceCents} cents</output></span>
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

  <section class="card stack" aria-labelledby="disp-h">
    <h2 id="disp-h">Display &amp; data</h2>
    <fieldset class="field">
      <legend>Note names</legend>
      <div class="radios inline">
        <label>
          <input type="radio" name="spelling" checked={s.spelling === 'sharps'} onchange={() => settings.update({ spelling: 'sharps' })} />
          Sharps (C♯, F♯)
        </label>
        <label>
          <input type="radio" name="spelling" checked={s.spelling === 'flats'} onchange={() => settings.update({ spelling: 'flats' })} />
          Flats (D♭, G♭)
        </label>
      </div>
    </fieldset>
    <label class="check">
      <input
        type="checkbox"
        checked={s.historyEnabled}
        onchange={(e) => settings.update({ historyEnabled: e.currentTarget.checked })}
      />
      <span>Keep exercise history on this device (<a href={href('history')}>view</a>)</span>
    </label>
  </section>

  <div class="row">
    <button type="button" class="btn danger" onclick={reset}>Reset settings</button>
  </div>
</div>

<style>
  .page {
    max-width: 640px;
    margin: 0 auto;
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
    min-height: 48px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    font-weight: 700;
    cursor: pointer;
    background: var(--surface);
    color: var(--text-muted);
    text-decoration: line-through;
    text-decoration-color: var(--border);
  }

  .pcs label.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    text-decoration: none;
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
    cursor: inherit;
  }

  .grid2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  @media (min-width: 480px) {
    .grid2 {
      grid-template-columns: 1fr 1fr;
    }
  }

  .grid2.end {
    align-items: end;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .field > span:first-child,
  .field legend {
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 0;
    margin-bottom: 6px;
  }

  output {
    font-weight: 400;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  select {
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    max-width: 100%;
  }

  input[type='range'] {
    width: 100%;
    min-height: var(--tap);
    accent-color: var(--accent);
  }

  .radios {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .radios.inline {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 16px;
  }

  .radios label,
  .check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-height: 44px;
    padding-block: 10px;
    cursor: pointer;
  }

  .radios {
    gap: 0;
  }

  /* Mouse users get the denser layout; touch keeps whole-row targets of at least 44px. */
  @media (pointer: fine) {
    input[type='range'] {
      min-height: 32px;
    }
    .radios {
      gap: 8px;
    }
    .radios label,
    .check {
      min-height: 32px;
      padding-block: 0;
    }
  }

  .radios input,
  .check input {
    width: 20px;
    height: 20px;
    margin: 2px 0 0;
    flex: none;
    accent-color: var(--accent);
  }
</style>
