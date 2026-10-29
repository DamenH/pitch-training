<script lang="ts" module>
  import type { TuneRound } from '../domain/anchor';

  interface Session {
    round: TuneRound;
    scored: boolean;
    rounds: number;
    found: number;
    totalMiss: number;
  }

  // Like the other tabs, Anchor keeps its round and tally while you visit other screens.
  let session: Session | undefined;
</script>

<script lang="ts">
  import { flushSync, onDestroy, untrack } from 'svelte';
  import { createTuneRound, isCold, type TuneResult } from '../domain/anchor';
  import { entryFromTune } from '../domain/history';
  import { ALL_PITCH_CLASSES, noteToMidi, pitchClassName, spokenPitchClassName } from '../domain/music';
  import {
    ANCHOR_OCTAVE_MAX,
    ANCHOR_OCTAVE_MIN,
    TUNE_TOLERANCE_MAX,
    TUNE_TOLERANCE_MIN,
    WAVEFORM_LABELS,
    type TuneLevel,
  } from '../domain/settings';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { history } from '../lib/history.svelte';
  import { anchorModes } from '../lib/anchorMode.svelte';
  import TuneQuestion from '../components/TuneQuestion.svelte';
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';

  const s = $derived(settings.value);

  function makeRound(): TuneRound {
    const last = history.entries.at(-1);
    return createTuneRound(settings.value, Math.random, isCold(last ? Date.parse(last.date) : undefined));
  }

  // An answered round is never reopened, so it can't be scored twice.
  const saved = untrack(() => session);
  let round = $state<TuneRound>(untrack(() => (saved && !saved.scored && fitsSettings(saved.round) ? saved.round : makeRound())));

  /** A saved round is only resumed if the anchor options haven't changed since. */
  function fitsSettings(r: TuneRound): boolean {
    const v = settings.value;
    return r.anchor === v.anchorPitchClass && r.target === noteToMidi(v.anchorPitchClass, v.anchorOctave) && r.exact === (v.tuneLevel === 'exact');
  }
  let scored = false;
  let autostart = $state(false);
  let rounds = $state(saved?.rounds ?? 0);
  let found = $state(saved?.found ?? 0);
  let totalMiss = $state(saved?.totalMiss ?? 0);
  let optionsOpen = $state(false);

  function onresult(result: TuneResult, responseMs: number) {
    scored = true;
    rounds += 1;
    if (result.correct) found += 1;
    // Like History, from the nearest anchor, so an octave slip doesn't swamp the average.
    totalMiss += Math.abs(result.pitchClassCents);
    history.add(entryFromTune(round, result, { responseMs }));
  }

  function next() {
    scored = false;
    flushSync(() => {
      autostart = true;
      round = makeRound();
    });
  }

  onDestroy(() => {
    session = { round, scored, rounds, found, totalMiss };
    stopAll();
  });

  const LEVELS: [TuneLevel, string][] = [['any', 'Any octave'], ['exact', 'Exact octave']];
  const OCTAVES = Array.from({ length: ANCHOR_OCTAVE_MAX - ANCHOR_OCTAVE_MIN + 1 }, (_, i) => ANCHOR_OCTAVE_MIN + i);
  const anchorName = $derived(pitchClassName(s.anchorPitchClass, s.spelling));
  const avgMiss = $derived(rounds > 0 ? Math.round(totalMiss / rounds) : null);
</script>

<div class="stack anchor">
  <p class="meta">
    <span aria-label={`This session: found ${found} of ${rounds}${avgMiss === null ? '' : `, average miss ${avgMiss} cents`}`}>
      {`Session ${found}/${rounds}${avgMiss === null ? '' : ` · avg miss ${avgMiss}¢`}`}
    </span>
    <button type="button" class="btn small plain" onclick={() => { optionsOpen = true; }}>
      <Icon name="sliders" size={18} /> Options
    </button>
  </p>

  {#if anchorModes.value === 'tune'}
    {#key round.id}
      <TuneQuestion {round} {autostart} {onresult} onnext={next} />
    {/key}
  {/if}
</div>

<Sheet bind:open={optionsOpen} label="Anchor options">
  <p class="sheet-title">Anchor options</p>
  <fieldset class="field">
    <legend>Anchor note</legend>
    <div class="pcs">
      {#each ALL_PITCH_CLASSES as pc (pc)}
        <label class:on={s.anchorPitchClass === pc}>
          <input
            type="radio"
            name="anchor-note"
            checked={s.anchorPitchClass === pc}
            onchange={() => settings.update({ anchorPitchClass: pc })}
            aria-label={spokenPitchClassName(pc, s.spelling)}
          />
          <span aria-hidden="true">{pitchClassName(pc, s.spelling)}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="field">
    <legend>Octave</legend>
    <div class="segmented">
      {#each OCTAVES as octave (octave)}
        <label class:checked={s.anchorOctave === octave}>
          <input type="radio" name="anchor-octave" value={octave} checked={s.anchorOctave === octave}
            onchange={() => settings.update({ anchorOctave: octave })} />
          {octave}
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset class="field">
    <legend>Level</legend>
    <div class="segmented">
      {#each LEVELS as [value, label] (value)}
        <label class:checked={s.tuneLevel === value}>
          <input type="radio" name="tune-level" {value} checked={s.tuneLevel === value}
            onchange={() => settings.update({ tuneLevel: value })} />
          {label}
        </label>
      {/each}
    </div>
  </fieldset>
  <p class="muted small">
    {#if s.tuneLevel === 'exact'}
      Only {anchorName}{s.anchorOctave} counts: {anchorName} in another octave is a miss.
    {:else}
      Any {anchorName} counts. Rounds start around {anchorName}{s.anchorOctave}, which is always in reach.
    {/if}
    Changes apply from the next round.
  </p>

  <p class="muted small">
    Sound: {WAVEFORM_LABELS[s.waveform]}, the instrument set in <a href="#/settings">Settings</a>.
    {s.waveform === 'piano' ? 'The piano is struck rather than held.' : ''}
  </p>

  {#if s.waveform === 'piano'}
    <label class="toggle">
      <span class="toggle-copy">
        <strong>Strike when you stop turning</strong>
        <small>Otherwise the piano only plays when you press Strike (or Space).</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        class="switch"
        checked={s.tuneAutoStrike}
        onchange={(e) => settings.update({ tuneAutoStrike: e.currentTarget.checked })}
      />
    </label>
  {/if}

  <label class="toggle">
    <span class="toggle-copy">
      <strong>Scramble before each round</strong>
      <small>Random notes wash out the last reveal, so you can't tune relative to it.</small>
    </span>
    <input
      type="checkbox"
      role="switch"
      class="switch"
      checked={s.tuneMasker}
      onchange={(e) => settings.update({ tuneMasker: e.currentTarget.checked })}
    />
  </label>

  <label class="field">
    <span>Counts as found within <output>±{s.tuneToleranceCents}¢</output></span>
    <input
      type="range"
      min={TUNE_TOLERANCE_MIN}
      max={TUNE_TOLERANCE_MAX}
      step="5"
      value={s.tuneToleranceCents}
      oninput={(e) => settings.update({ tuneToleranceCents: Number(e.currentTarget.value) })}
    />
  </label>

  <button type="button" class="btn plain block" onclick={() => { optionsOpen = false; }}>Done</button>
</Sheet>

<style>
  .anchor {
    flex: 1;
  }
  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .meta .btn {
    margin-right: -8px;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .pcs {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .pcs label {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-muted);
    font-weight: 700;
    -webkit-user-select: none;
    user-select: none;
  }
  .pcs label.on {
    background: var(--anchor);
    color: var(--anchor-text);
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
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block: var(--space-2);
  }
  .toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .toggle-copy small {
    color: var(--text-muted);
  }
  output {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
