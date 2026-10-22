<script lang="ts">
  import { onMount } from 'svelte';
  import { parseMidi, scoreFromHash, scoreToMidi, type PianoScore } from '../domain/score';
  import { PIANO_EXAMPLES, exampleFromHash, pianoExample } from '../domain/examples';
  import { deleteScore, listScores, type SavedScore } from '../lib/scores';
  import { href } from '../lib/router.svelte';
  import { showToast } from '../lib/toast.svelte';
  import PiecePlayer from './PiecePlayer.svelte';
  import Icon from './Icon.svelte';

  let { onnotes, onplay }: { onnotes: (notes: number[]) => void; onplay: () => void } = $props();
  let entries = $state<SavedScore[]>([]);
  let selection = $state<{ score: PianoScore; id?: string; exampleId?: string } | null>(null);
  let error = $state('');
  let lastHash = '';
  const CATEGORIES = ['Practice patterns', 'Public-domain melodies'] as const;

  function fail(e: unknown) {
    error = e instanceof Error ? e.message : 'Could not load the library.';
  }

  async function refresh() {
    try {
      entries = await listScores();
    } catch (e) {
      fail(e);
    }
  }

  function load(score: PianoScore, id?: string, exampleId?: string) {
    error = '';
    selection = { score, id, exampleId };
  }

  function loadExample(id: string) {
    try {
      load(parseMidi(scoreToMidi(pianoExample(id))), undefined, id);
    } catch (e) {
      fail(e);
    }
  }

  async function remove(entry: SavedScore) {
    try {
      await deleteScore(entry.id);
      if (selection?.id === entry.id) selection = null;
      await refresh();
      showToast(`Deleted “${entry.score.title}”`);
    } catch (e) {
      fail(e);
    }
  }
  function loadLink() {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    try {
      const builtin = exampleFromHash(location.hash);
      const score = builtin ? parseMidi(scoreToMidi(builtin)) : scoreFromHash(location.hash);
      if (!score) return;
      load(score, undefined, new URLSearchParams(location.hash.split('?')[1]).get('example') ?? undefined);
      showToast('Opened from link');
    } catch (e) {
      fail(e);
    }
  }
  onMount(() => {
    void refresh();
    loadLink();
    window.addEventListener('hashchange', loadLink);
    return () => window.removeEventListener('hashchange', loadLink);
  });
</script>

<section class="library" aria-labelledby="library-heading">
  <div class="heading">
    <h2 id="library-heading">Pieces</h2>
    <a class="icon-btn add" href={href('import')} aria-label="Import a piece" title="Import a piece"><Icon name="plus" /></a>
  </div>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if selection}
    <div class="panel loaded">
      {#key selection}
        <PiecePlayer score={selection.score} savedId={selection.id} exampleId={selection.exampleId}
          {onnotes} {onplay} onsaved={refresh} />
      {/key}
    </div>
  {/if}

  {#if entries.length > 0}
    <h3 class="eyebrow">Saved</h3>
    <ul class="pieces">
      {#each entries as entry (entry.id)}
        <li class:current={selection?.id === entry.id}>
          <button type="button" class="piece-title" onclick={() => load(entry.score, entry.id)}>{entry.score.title}</button>
          <button type="button" class="icon-btn" aria-label={`Delete ${entry.score.title}`} title="Delete" onclick={() => remove(entry)}>
            <Icon name="trash" size={18} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#each CATEGORIES as category (category)}
    <h3 class="eyebrow">{category === 'Practice patterns' ? 'Practice' : 'Melodies'}</h3>
    <ul class="pieces">
      {#each PIANO_EXAMPLES.filter((entry) => entry.category === category) as entry (entry.id)}
        <li class:current={selection?.exampleId === entry.id && !selection?.id}>
          <button type="button" class="piece-title" aria-label={`Load ${entry.title}`} title={entry.credit} onclick={() => loadExample(entry.id)}>
            <span>{entry.title}</span>
            <span class="sub">{entry.description}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/each}
</section>

<style>
  .library {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--text-lg);
  }

  .add {
    color: var(--accent);
  }

  .loaded {
    margin-bottom: var(--space-3);
  }

  h3 {
    margin-top: var(--space-4);
  }

  .pieces {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .pieces li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    border-bottom: 1px solid var(--hairline);
  }

  .piece-title {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    min-width: 0;
    min-height: 48px;
    padding: var(--space-2) var(--space-2);
    margin-inline: calc(-1 * var(--space-2)) 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font-weight: 600;
    text-align: left;
    overflow-wrap: anywhere;
    transition: background-color 120ms;
  }

  .piece-title:active {
    background: var(--surface-2);
  }

  .current .piece-title {
    color: var(--accent);
  }

  .sub {
    font-size: var(--text-sm);
    font-weight: 400;
    color: var(--text-muted);
  }

  @media (hover: hover) {
    .piece-title:hover {
      background: var(--surface-2);
    }
  }
</style>
