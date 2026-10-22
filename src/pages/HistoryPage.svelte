<script lang="ts">
  import { ALL_PITCH_CLASSES, noteName, pitchClassName } from '../domain/music';
  import { summarize, type HistoryEntry, type Tally } from '../domain/history';
  import { history } from '../lib/history.svelte';
  import { settings } from '../lib/settings.svelte';
  import { href } from '../lib/router.svelte';

  const s = $derived(settings.value);
  const summary = $derived(summarize(history.entries));
  const recent = $derived(history.entries.slice(-25).reverse());

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
    return `${noteName(e.answer, s.spelling)}${e.cents !== null ? ` (${e.cents > 0 ? '+' : ''}${e.cents}¢)` : ''}`;
  }

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function clear() {
    if (confirm('Delete all exercise history stored on this device?')) history.clear();
  }
</script>

<div class="page stack">
  {#if !s.historyEnabled}
    <p class="notice warn">
      History tracking is off, so new answers are not being saved. Turn it on in <a href={href('settings')}>Settings</a>.
    </p>
  {/if}

  {#if history.entries.length === 0}
    <div class="card">
      <p>No history yet.</p>
    </div>
  {:else}
    <section class="card stack" aria-labelledby="sum-h">
      <h2 id="sum-h">Summary</h2>
      <div class="tiles">
        <div class="tile"><span class="v">{summary.overall.answered}</span><span class="k">answered</span></div>
        <div class="tile"><span class="v">{summary.overall.correct}</span><span class="k">correct</span></div>
        <div class="tile"><span class="v">{summary.overall.incorrect}</span><span class="k">incorrect</span></div>
        <div class="tile"><span class="v">{pct(summary.overall)}</span><span class="k">accuracy</span></div>
      </div>
      <div class="table-wrap">
        <table class="by-exercise">
          <thead>
            <tr>
              <th scope="col">Exercise</th>
              <th scope="col">Answered</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Avg. time</th>
              <th scope="col">No detection</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Hear → Identify</th>
              <td data-label="Answered">{summary.byExercise.identify.answered}</td>
              <td data-label="Accuracy">{pct(summary.byExercise.identify)}</td>
              <td data-label="Avg. time">{secs(summary.byExercise.identify.meanResponseMs)}</td>
              <td data-label="No detection">—</td>
            </tr>
            <tr>
              <th scope="row">See → Sing (test)</th>
              <td data-label="Answered">{summary.byExercise['sing-test'].answered}</td>
              <td data-label="Accuracy">{pct(summary.byExercise['sing-test'])}</td>
              <td data-label="Avg. time">{secs(summary.byExercise['sing-test'].meanResponseMs)}</td>
              <td data-label="No detection">{summary.byExercise['sing-test'].noDetection}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card stack" aria-labelledby="pc-h">
      <h2 id="pc-h">Accuracy by note</h2>
      <ul class="bars">
        {#each ALL_PITCH_CLASSES as pc (pc)}
          {@const t = summary.byPitchClass[pc]}
          <li>
            <span class="pc">{pitchClassName(pc, s.spelling)}</span>
            <span class="bar" aria-hidden="true">
              <span class="fill" style:width={`${(t.accuracy ?? 0) * 100}%`}></span>
            </span>
            <span class="num">{pct(t)} <span class="muted">({t.correct}/{t.answered})</span></span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="card stack" aria-labelledby="recent-h">
      <h2 id="recent-h">Recent answers</h2>
      <ol class="recent">
        {#each recent as e, i (e.date + i)}
          <li>
            <span class="mark" aria-hidden="true">
              {e.outcome === 'correct' ? '✓' : e.outcome === 'incorrect' ? '✗' : '?'}
            </span>
            <span class="what">
              <strong>{e.exercise === 'identify' ? 'Identify' : 'Sing'}</strong>
              {e.mixed ? '(mixed)' : ''} · target
              {e.exercise === 'sing-test' && e.policy === 'exact'
                ? noteName(e.targetMidi, s.spelling)
                : pitchClassName(e.targetPitchClass, s.spelling)} · answer {answerText(e)}
              <span class="visually-hidden">— {e.outcome.replace('-', ' ')}</span>
            </span>
            <span class="when muted small">{dateFmt.format(new Date(e.date))} · {secs(e.responseMs)}</span>
          </li>
        {/each}
      </ol>
    </section>

    <div class="row">
      <button type="button" class="btn danger" onclick={clear}>Clear history</button>
      <span class="muted small">{history.entries.length} entries stored locally.</span>
    </div>
  {/if}
</div>

<style>
  .page {
    max-width: 640px;
    margin: 0 auto;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  @media (min-width: 360px) {
    .tiles {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 4px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .v {
    font-size: 1.4rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .k {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  thead th {
    color: var(--text-muted);
    font-weight: 600;
  }
  /* Phones: each exercise becomes a labelled block rather than a table that scrolls sideways. */
  @media (max-width: 639px) {
    .by-exercise thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .by-exercise tr {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }
    .by-exercise th,
    .by-exercise td {
      padding: 0;
      border: 0;
    }
    .by-exercise tbody th {
      grid-column: 1 / -1;
    }
    .by-exercise td {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .by-exercise td::before {
      content: attr(data-label);
      color: var(--text-muted);
    }
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bars li {
    display: grid;
    grid-template-columns: 2.5em 1fr 7.5em;
    gap: 8px;
    align-items: center;
  }
  .pc {
    font-weight: 700;
  }
  .bar {
    height: 12px;
    border-radius: 6px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .num {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .recent {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .recent li {
    display: grid;
    grid-template-columns: 1.5em 1fr;
    gap: 0 6px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .recent .when {
    grid-column: 2;
  }
  .mark {
    font-weight: 700;
  }
</style>
