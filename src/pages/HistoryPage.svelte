<script lang="ts">
  import { ALL_PITCH_CLASSES, noteName, pitchClassName } from '../domain/music';
  import { summarize, tuneStats, type HistoryEntry, type Tally, type TuneStats } from '../domain/history';
  import { history } from '../lib/history.svelte';
  import { settings } from '../lib/settings.svelte';
  import { href } from '../lib/router.svelte';
  import { signedCents } from '../lib/format';
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';

  const s = $derived(settings.value);
  const summary = $derived(summarize(history.entries));
  const recent = $derived(history.entries.slice(-25).reverse());
  const tune = $derived(tuneStats(history.entries));

  function miss(t: TuneStats): string {
    return t.meanMiss === null ? '—' : `${Math.round(t.meanMiss)}¢`;
  }

  function bias(t: TuneStats): string {
    if (t.bias === null) return '—';
    const r = Math.round(t.bias);
    return r === 0 ? 'neither way' : `${signedCents(r)} ${r > 0 ? 'sharp' : 'flat'}`;
  }

  function pct(t: Tally): string {
    return t.accuracy === null ? '—' : `${Math.round(t.accuracy * 100)}%`;
  }

  function secs(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`;
  }

  function answerText(e: HistoryEntry): string {
    if (e.outcome === 'no-detection') return 'no steady note detected';
    if (e.answer === null) return '—';
    if (e.exercise === 'identify') return pitchClassName(e.answer as 0, s.spelling);
    if (e.exercise === 'identify-octave') return `${pitchClassName(e.targetPitchClass, s.spelling)}${e.answer}`;
    if (e.exercise === 'identify-chroma') return e.answer === 1 ? 'same' : 'different';
    if (e.exercise === 'anchor-tune') return e.cents === null ? '—' : signedCents(e.cents);
    return `${noteName(e.answer, s.spelling)}${e.cents !== null ? ` (${signedCents(e.cents)})` : ''}`;
  }

  function targetText(e: HistoryEntry): string {
    if (e.exercise === 'identify-chroma') {
      const second = e.comparisonMidi === null ? '?' : noteName(e.comparisonMidi, s.spelling);
      return `${noteName(e.targetMidi, s.spelling)} → ${second}`;
    }
    return e.exercise === 'identify-octave' || (e.exercise === 'sing-test' && e.policy === 'exact')
      ? noteName(e.targetMidi, s.spelling)
      : pitchClassName(e.targetPitchClass, s.spelling);
  }

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  let confirmClear = $state(false);

  function clear() {
    confirmClear = false;
    history.clear();
  }

  const EXERCISES = [
    ['identify', 'Identify notes'],
    ['identify-octave', 'Identify octaves'],
    ['identify-chroma', 'Identify chroma'],
    ['anchor-tune', 'Anchor tune'],
    ['sing-test', 'Sing test'],
  ] as const;

  const EXERCISE_NAMES: Record<HistoryEntry['exercise'], string> = {
    identify: 'Identify notes',
    'identify-octave': 'Identify octaves',
    'identify-chroma': 'Identify chroma',
    'anchor-tune': 'Anchor tune',
    'sing-test': 'Sing',
  };
</script>

<div class="history">
  {#if !s.historyEnabled}
    <p class="notice warn">History is off. <a href={href('settings')}>Turn it on in Settings</a>.</p>
  {/if}

  {#if history.entries.length === 0}
    <div class="empty">
      <span class="glyph"><Icon name="chart" size={28} /></span>
      <p class="lead">No answers yet</p>
      <p class="muted small">Results from Identify and Sing test appear here.</p>
    </div>
  {:else}
    <section class="summary" aria-label="Summary">
      <div class="figure"><span class="v">{pct(summary.overall)}</span><span class="k">accuracy</span></div>
      <div class="figure"><span class="v">{summary.overall.answered}</span><span class="k">answered</span></div>
      <div class="figure"><span class="v">{summary.overall.correct}</span><span class="k">correct</span></div>
    </section>

    <section aria-labelledby="ex-h">
      <h2 id="ex-h" class="eyebrow">By exercise</h2>
      <ul class="exercises">
        {#each EXERCISES as [key, label] (key)}
          {@const t = summary.byExercise[key]}
          <li>
            <span class="name">{label}</span>
            <span class="stat">{pct(t)}</span>
            <span class="muted small">{t.answered} answered · {secs(t.meanResponseMs)} avg{#if key === 'sing-test' && t.noDetection} · {t.noDetection} unheard{/if}</span>
          </li>
        {/each}
      </ul>
    </section>

    {#if tune.all.rounds > 0}
      <section aria-labelledby="tune-h">
        <h2 id="tune-h" class="eyebrow">Anchor tune</h2>
        <ul class="exercises">
          {#each [['All rounds', tune.all], ['Cold rounds', tune.cold]] as const as [label, t] (label)}
            <li>
              <span class="name">{label}</span>
              <span class="stat">{miss(t)}</span>
              <span class="muted small">{t.rounds} {t.rounds === 1 ? 'round' : 'rounds'} · average miss · leans {bias(t)}</span>
            </li>
          {/each}
        </ul>
        <p class="muted small">Cold rounds come after an hour with nothing answered, so they show what you remember unaided.</p>
      </section>
    {/if}

    <section aria-labelledby="pc-h">
      <h2 id="pc-h" class="eyebrow">By note</h2>
      <ul class="bars">
        {#each ALL_PITCH_CLASSES as pc (pc)}
          {@const t = summary.byPitchClass[pc]}
          <li>
            <span class="pc">{pitchClassName(pc, s.spelling)}</span>
            <span class="bar" aria-hidden="true">
              <span class="fill" style:width={`${(t.accuracy ?? 0) * 100}%`}></span>
            </span>
            <span class="num">{pct(t)} <span class="muted">{t.correct}/{t.answered}</span></span>
          </li>
        {/each}
      </ul>
    </section>

    <section aria-labelledby="recent-h">
      <h2 id="recent-h" class="eyebrow">Recent</h2>
      <ol class="recent">
        {#each recent as e, i (e.date + i)}
          <li class={e.outcome}>
            <span class="mark" aria-hidden="true">
              {e.outcome === 'correct' ? '✓' : e.outcome === 'incorrect' ? '✗' : '?'}
            </span>
            <span class="what">
              <strong>{EXERCISE_NAMES[e.exercise]}</strong>
              {e.mixed ? '(mixed)' : ''} · target
              {targetText(e)} · answer {answerText(e)}
              <span class="visually-hidden">— {e.outcome.replace('-', ' ')}</span>
            </span>
            <span class="when muted small">{dateFmt.format(new Date(e.date))} · {secs(e.responseMs)}</span>
          </li>
        {/each}
      </ol>
    </section>

    <div class="row footer">
      <span class="muted small">{history.entries.length} entries on this device</span>
      <button type="button" class="btn danger small" onclick={() => { confirmClear = true; }}>Clear history</button>
    </div>
  {/if}
</div>

<Sheet bind:open={confirmClear} label="Clear history">
  <p class="sheet-title">Clear all history?</p>
  <p class="sheet-text">This can’t be undone.</p>
  <button type="button" class="btn danger block" onclick={clear}>Clear history</button>
  <button type="button" class="btn plain block" onclick={() => { confirmClear = false; }}>Cancel</button>
</Sheet>

<style>
  .history {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding-block: 15vh;
    text-align: center;
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    margin-bottom: var(--space-2);
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text-muted);
  }

  .lead {
    font-weight: 700;
    font-size: var(--text-lg);
  }

  .summary {
    flex-direction: row;
    gap: var(--space-6);
  }

  .figure {
    display: flex;
    flex-direction: column;
  }

  .v {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .k {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  ul,
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .exercises li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 var(--space-3);
    padding-block: var(--space-2);
    border-top: 1px solid var(--hairline);
  }

  .name {
    font-weight: 600;
  }

  .stat {
    grid-row: span 2;
    align-self: center;
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bars li {
    display: grid;
    grid-template-columns: 2.5em 1fr 6.5em;
    gap: var(--space-2);
    align-items: center;
  }

  .pc {
    font-weight: 700;
  }

  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--accent);
  }

  .num {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .recent li {
    display: grid;
    grid-template-columns: 1.5em 1fr;
    gap: 0 6px;
    padding-block: var(--space-2);
    border-top: 1px solid var(--hairline);
  }

  .recent .when {
    grid-column: 2;
  }

  .mark {
    font-weight: 700;
    color: var(--text-muted);
  }

  .correct .mark {
    color: var(--good);
  }

  .incorrect .mark {
    color: var(--bad);
  }

  .footer {
    justify-content: space-between;
  }
</style>
