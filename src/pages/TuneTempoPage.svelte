<script lang="ts" module>
  import type { TempoRound } from '../domain/tempoTune';

  interface Session {
    round: TempoRound;
    scored: boolean;
    rounds: number;
    found: number;
    totalMiss: number;
  }

  // Like the other tabs, Tune tempo keeps its round and tally while you visit other screens.
  let session: Session | undefined;
</script>

<script lang="ts">
  import { flushSync, onDestroy, untrack } from 'svelte';
  import { isCold } from '../domain/anchor';
  import { createTempoRound, type TempoTuneResult } from '../domain/tempoTune';
  import { entryFromTempo, isTempoExercise, lastAnswerAt } from '../domain/history';
  import { BPM_MAX, BPM_MIN, termForBpm } from '../domain/tempo';
  import { TEMPO_TOLERANCE_MAX, TEMPO_TOLERANCE_MIN, type TempoTuneLevel } from '../domain/settings';
  import { stopAll } from '../audio/synth';
  import { settings } from '../lib/settings.svelte';
  import { history } from '../lib/history.svelte';
  import TempoTuneQuestion from '../components/TempoTuneQuestion.svelte';
  import TempoMark from '../components/TempoMark.svelte';
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';

  const s = $derived(settings.value);

  function makeRound(previous?: TempoRound): TempoRound {
    // Only tempo answers give you a recent tempo to lean on.
    const last = lastAnswerAt(history.entries, (e) => isTempoExercise(e.exercise));
    return createTempoRound(settings.value, Math.random, isCold(last), previous?.target);
  }

  /** A saved round is only resumed if the tempo options haven't changed since. */
  function fitsSettings(r: TempoRound): boolean {
    const v = settings.value;
    if (r.anchor !== (v.tempoTuneLevel === 'anchor')) return false;
    return r.anchor ? r.target.bpm === v.tempoAnchorBpm : r.target.style === v.tempoTargetStyle;
  }

  // An answered round is never reopened, so it can't be scored twice.
  const saved = untrack(() => session);
  let round = $state<TempoRound>(
    untrack(() => (saved && !saved.scored && fitsSettings(saved.round) ? saved.round : makeRound(saved?.round))),
  );
  let scored = false;
  let autostart = $state(false);
  let rounds = $state(saved?.rounds ?? 0);
  let found = $state(saved?.found ?? 0);
  let totalMiss = $state(saved?.totalMiss ?? 0);
  let optionsOpen = $state(false);

  function onresult(result: TempoTuneResult, responseMs: number) {
    scored = true;
    rounds += 1;
    if (result.correct) found += 1;
    totalMiss += Math.abs(result.errorPct);
    history.add(entryFromTempo('tune-tempo', round.target, result, { responseMs, cold: round.cold }));
  }

  function next() {
    scored = false;
    flushSync(() => {
      autostart = true;
      round = makeRound(round);
    });
  }

  onDestroy(() => {
    session = { round, scored, rounds, found, totalMiss };
    stopAll();
  });

  const LEVELS: [TempoTuneLevel, string][] = [['anchor', 'Anchor tempo'], ['shown', 'Shown target']];
  const avgMiss = $derived(rounds > 0 ? totalMiss / rounds : null);
</script>

<div class="stack tune">
  <p class="meta">
    <span aria-label={`This session: found ${found} of ${rounds}${avgMiss === null ? '' : `, average miss ${avgMiss.toFixed(1)} percent`}`}>
      {`Session ${found}/${rounds}${avgMiss === null ? '' : ` · avg miss ${avgMiss.toFixed(1)}%`}`}
    </span>
    <button type="button" class="btn small plain" onclick={() => { optionsOpen = true; }}>
      <Icon name="sliders" size={18} /> Options
    </button>
  </p>

  {#key round.id}
    <TempoTuneQuestion {round} {autostart} {onresult} onnext={next} />
  {/key}
</div>

<Sheet bind:open={optionsOpen} label="Tune tempo options">
  <p class="sheet-title">Tune tempo options</p>

  <fieldset class="field">
    <legend>Tune to</legend>
    <div class="segmented">
      {#each LEVELS as [value, label] (value)}
        <label class:checked={s.tempoTuneLevel === value}>
          <input type="radio" name="tempo-tune-level" {value} checked={s.tempoTuneLevel === value}
            onchange={() => settings.update({ tempoTuneLevel: value })} />
          {label}
        </label>
      {/each}
    </div>
  </fieldset>

  {#if s.tempoTuneLevel === 'anchor'}
    <label class="field">
      <span>Anchor tempo <output><TempoMark bpm={s.tempoAnchorBpm} /> · {termForBpm(s.tempoAnchorBpm).name}</output></span>
      <input
        type="range"
        min={BPM_MIN}
        max={BPM_MAX}
        step="1"
        value={s.tempoAnchorBpm}
        aria-valuetext={`${s.tempoAnchorBpm} beats per minute`}
        oninput={(e) => settings.update({ tempoAnchorBpm: Number(e.currentTarget.value) })}
      />
    </label>
    <p class="muted small">One tempo to learn by heart, like the anchor note. Changes apply from the next round.</p>
  {:else}
    <p class="muted small">
      Each round shows a new target from {s.tempoMin}–{s.tempoMax} BPM, written as set in
      <a href="#/settings">Settings → Tempo</a>. Changes apply from the next round.
    </p>
  {/if}

  <label class="toggle">
    <span class="toggle-copy">
      <strong>Scramble before each round</strong>
      <small>Uneven clicks wash out the last reveal. Shared with Tune pitch.</small>
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
    <span>Counts as found within <output>±{s.tempoTolerancePct}%</output></span>
    <input
      type="range"
      min={TEMPO_TOLERANCE_MIN}
      max={TEMPO_TOLERANCE_MAX}
      step="1"
      value={s.tempoTolerancePct}
      oninput={(e) => settings.update({ tempoTolerancePct: Number(e.currentTarget.value) })}
    />
  </label>
  <p class="muted small">Shared with every tempo exercise. A term target counts anywhere in its range.</p>

  <button type="button" class="btn plain block" onclick={() => { optionsOpen = false; }}>Done</button>
</Sheet>

<style>
  .tune {
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
