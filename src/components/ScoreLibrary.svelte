<script lang="ts">
  import { onMount } from 'svelte';
  import { parseMidi, scoreFromHash, scoreToMidi, type PianoScore } from '../domain/score';
  import { PIANO_EXAMPLES, exampleFromHash, pianoExample } from '../domain/examples';
  import { deleteScore, listScores, type SavedScore } from '../lib/scores';
  import { href } from '../lib/router.svelte';
  import PiecePlayer from './PiecePlayer.svelte';

  let { onnotes, onplay }: { onnotes: (notes: number[]) => void; onplay: () => void } = $props();
  let entries = $state<SavedScore[]>([]);
  let selection = $state<{ score: PianoScore; id?: string; exampleId?: string } | null>(null);
  let examplesOpen = $state(false);
  let notice = $state('');
  let error = $state('');
  let lastHash = '';
  function fail(e: unknown) { error = e instanceof Error ? e.message : 'Could not load the library.'; }
  async function refresh() { try { entries = await listScores(); } catch (e) { fail(e); } }
  function load(score: PianoScore, id?: string, exampleId?: string) {
    error = '';
    notice = '';
    selection = { score, id, exampleId };
    examplesOpen = false;
  }
  function loadExample(id: string) {
    try { load(parseMidi(scoreToMidi(pianoExample(id))), undefined, id); } catch (e) { fail(e); }
  }
  async function remove(id: string) {
    try {
      await deleteScore(id);
      if (selection?.id === id) selection = null;
      await refresh();
      notice = 'Removed from your library.';
    } catch (e) { fail(e); }
  }
  function loadLink() {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    try {
      const builtin = exampleFromHash(location.hash);
      const score = builtin ? parseMidi(scoreToMidi(builtin)) : scoreFromHash(location.hash);
      if (!score) return;
      load(score, undefined, new URLSearchParams(location.hash.split('?')[1]).get('example') ?? undefined);
      notice = 'Loaded from link. Play to listen; save to keep it on this device.';
    } catch (e) { fail(e); }
  }
  onMount(() => {
    void refresh();
    loadLink();
    window.addEventListener('hashchange', loadLink);
    return () => window.removeEventListener('hashchange', loadLink);
  });
</script>

<section class="card stack library" aria-labelledby="library-heading">
  <div class="heading"><h2 id="library-heading">Piano pieces</h2><a class="small" href={href('import')}>Import a piece</a></div>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="small" role="status">{notice}</p>{/if}
  {#if selection}
    {#key selection}
      <PiecePlayer score={selection.score} savedId={selection.id} exampleId={selection.exampleId}
        {onnotes} {onplay} onsaved={refresh} />
    {/key}
  {/if}
  <details bind:open={examplesOpen}>
    <summary>Browse examples</summary>
    {#each ['Practice patterns', 'Public-domain melodies'] as category}
      <h3>{category}</h3>
      <ul class="pieces">
        {#each PIANO_EXAMPLES.filter((entry) => entry.category === category) as entry (entry.id)}
          <li class="example-row">
            <button type="button" class="btn piece-title" aria-label={`Load ${entry.title}`} onclick={() => loadExample(entry.id)}>{entry.title}</button>
            <details class="description"><summary aria-label={`About ${entry.title}`}>About</summary>
              <p class="small muted">{entry.description}<br />{entry.credit}</p>
              {#if entry.source}<a class="small" href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.label}</a>{/if}
            </details>
          </li>
        {/each}
      </ul>
    {/each}
  </details>
  <h3>Saved on this device</h3>
  {#if entries.length === 0}
    <p class="small muted">No saved pieces yet. <a href={href('import')}>Import a piece</a> or save an example.</p>
  {:else}
    <ul class="pieces">
      {#each entries as entry (entry.id)}
        <li class="saved-row">
          <button type="button" class="btn piece-title" onclick={() => load(entry.score, entry.id)}>{entry.score.title}</button>
          <button type="button" class="btn" aria-label={`Delete ${entry.score.title}`} onclick={() => remove(entry.id)}>Delete</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .library { margin-top: var(--gap); gap: 12px; }
  .heading { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  h2, h3, p { margin: 0; }
  h3 { font-size: 0.9rem; margin-block: 12px 8px; }
  summary { cursor: pointer; min-height: 36px; align-content: center; }
  .pieces { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .piece-title { flex: 1; justify-content: flex-start; text-align: left; overflow-wrap: anywhere; min-width: 0; }
  .saved-row, .example-row { display: flex; align-items: start; gap: 8px; }
  .description { flex: 0 1 auto; max-width: 50%; font-size: 0.875rem; }
  .description p { margin-block: 6px; }
</style>
