<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MAX_IMPORT_BYTES, parseMidi, parseScoreText, type PianoScore } from '../domain/score';
  import { href } from '../lib/router.svelte';
  import { incoming } from '../lib/incoming.svelte';
  import PiecePlayer from '../components/PiecePlayer.svelte';
  import Icon from '../components/Icon.svelte';

  const example = JSON.stringify(
    { version: 1, title: 'C major chord', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 1, velocity: 0.7 })) },
    null,
    2,
  );
  const agentsUrl = new URL('agents.txt', document.baseURI).href;
  let text = $state(example);
  let current = $state<PianoScore | null>(null);
  let error = $state('');
  let importing = $state(false);
  let dragging = $state(false);
  let saved = $state(false);
  let importToken = 0;

  function fail(e: unknown) {
    error = e instanceof Error ? e.message : 'Could not import this piece.';
  }

  function load(score: PianoScore) {
    current = score;
    text = JSON.stringify(score, null, 2);
    error = '';
    saved = false;
  }

  function fromText() {
    importToken++;
    importing = false;
    try {
      load(parseScoreText(text));
    } catch (e) {
      fail(e);
    }
  }

  async function fromFile(file?: File) {
    if (!file) return;
    const token = ++importToken;
    error = '';
    importing = true;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('File is too large (maximum 2 MiB).');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== importToken) return;
      const midi = /\.midi?$/i.test(file.name) || new TextDecoder().decode(bytes.subarray(0, 4)) === 'MThd';
      load(midi ? parseMidi(bytes, file.name) : parseScoreText(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    } catch (e) {
      if (token === importToken) fail(e);
    } finally {
      if (token === importToken) importing = false;
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files.length !== 1) {
      error = 'Drop one MIDI or JSON file at a time.';
      return;
    }
    void fromFile(e.dataTransfer.files[0]);
  }

  // A file opened with, or shared to, the installed app.
  $effect(() => {
    const file = incoming.file;
    if (!file) return;
    incoming.file = null;
    void fromFile(file);
  });

  onDestroy(() => {
    importToken++;
  });
</script>

<div class="stack import-page">
  <div
    class="drop-zone"
    class:dragging
    role="region"
    aria-label="Import a piano piece"
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => { dragging = false; }}
    ondrop={drop}
  >
    <span class="glyph"><Icon name="upload" size={26} /></span>
    <p class="lead">Drop a MIDI or JSON file</p>
    <label class="btn primary choose" class:disabled={importing}>
      {importing ? 'Importing…' : 'Choose file'}
      <input
        class="visually-hidden"
        type="file"
        aria-label="Choose a MIDI or JSON file"
        accept=".mid,.midi,.json,.txt,audio/midi,audio/x-midi,application/json"
        disabled={importing}
        onchange={(e) => { void fromFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }}
      />
    </label>
    <p class="limits">Up to 2 MiB · 10,000 notes · 1 hour · 64 voices</p>
  </div>

  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}

  {#if current}
    <div class="panel stack" aria-label="Import preview" role="region">
      {#key current}<PiecePlayer score={current} onsaved={() => { saved = true; }} />{/key}
      {#if saved}<a class="small" href={href('reference')}>Open in Reference</a>{/if}
    </div>
  {/if}

  <details>
    <summary>Paste a score</summary>
    <div class="stack text-score">
      <label class="field">
        <span class="visually-hidden">Score JSON</span>
        <textarea bind:value={text} rows="8" spellcheck="false"></textarea>
      </label>
      <div class="row">
        <button type="button" class="btn" onclick={fromText}>Load score</button>
        <a class="small format" href={agentsUrl} target="_blank" rel="noreferrer">Format reference</a>
      </div>
    </div>
  </details>
</div>

<style>
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    text-align: center;
    transition:
      border-color 120ms,
      background-color 120ms;
  }

  .dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
  }

  .lead {
    font-weight: 600;
  }

  /* Phones have no drag and drop; the button says it all. */
  @media (pointer: coarse) {
    .drop-zone {
      border: 0;
      background: var(--surface);
    }
    .lead {
      display: none;
    }
  }

  .choose {
    margin-top: var(--space-2);
    min-width: 160px;
  }

  .choose:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }

  .choose.disabled {
    opacity: 0.45;
  }

  .limits {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .text-score {
    margin-top: var(--space-2);
    gap: var(--space-3);
  }

  .format {
    margin-left: auto;
  }
</style>
