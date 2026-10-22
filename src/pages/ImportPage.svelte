<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MAX_IMPORT_BYTES, parseMidi, parseScoreText, type PianoScore } from '../domain/score';
  import { href } from '../lib/router.svelte';
  import PiecePlayer from '../components/PiecePlayer.svelte';
  const example = JSON.stringify({ version: 1, title: 'C major chord', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 1, velocity: 0.7 })) }, null, 2);
  const agentsUrl = new URL('agents.txt', document.baseURI).href;
  let text = $state(example);
  let current = $state<PianoScore | null>(null);
  let error = $state('');
  let importing = $state(false);
  let dragging = $state(false);
  let saved = $state(false);
  let importToken = 0;
  function fail(e: unknown) { error = e instanceof Error ? e.message : 'Could not import this piece.'; }
  function load(score: PianoScore) { current = score; text = JSON.stringify(score, null, 2); error = ''; saved = false; }
  function fromText() {
    importToken++;
    importing = false;
    try { load(parseScoreText(text)); } catch (e) { fail(e); }
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
    } catch (e) { if (token === importToken) fail(e); }
    finally { if (token === importToken) importing = false; }
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files.length !== 1) { error = 'Drop one MIDI or JSON score file at a time.'; return; }
    void fromFile(e.dataTransfer.files[0]);
  }
  onDestroy(() => { importToken++; });
</script>
<div class="stack import-page">
  <section class="card stack" aria-labelledby="import-heading">
    <h2 id="import-heading">Add a piano piece</h2>
    <p class="small muted">Preview a piece, then save it to find it in Reference.</p>
    <div class="drop-zone" class:dragging role="region" aria-label="Import a piano piece"
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => { dragging = false; }} ondrop={drop}>
      <label class="field">
        <span>Choose or drop a MIDI / JSON file</span>
        <input type="file" accept=".mid,.midi,.json,.txt,audio/midi,audio/x-midi,application/json" disabled={importing}
          onchange={(e) => { void fromFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
      </label>
      <span class="small muted">Maximum 2 MiB · 10,000 notes · one hour · 64 voices</span>
    </div>

    <details>
      <summary>Paste a text score (JSON)</summary>
      <div class="stack text-score">
        <label class="field"><span>Score JSON — time and duration in seconds, MIDI 60 = C4</span>
          <textarea bind:value={text} rows="8" spellcheck="false"></textarea>
        </label>
        <div class="row">
          <button type="button" class="btn" onclick={fromText}>Load text score</button>
          <button type="button" class="btn" onclick={() => { text = example; }}>Show chord example</button>
        </div>
      </div>
    </details>


    {#if importing}<p role="status">Importing…</p>{/if}
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  </section>
  {#if current}
    <section class="card stack" aria-label="Import preview">
      {#key current}<PiecePlayer score={current} onsaved={() => { saved = true; }} />{/key}
      {#if saved}<a href={href('reference')}>Open Reference library</a>{/if}
    </section>
  {/if}
  <section class="card stack" aria-label="Piece format information">
    <details>
      <summary>About MIDI, text scores and sharing</summary>
      <p class="small muted">Chords, timing, velocity and sustain pedal use our sampled piano. Percussion is skipped; other instrument sounds and pitch bends are ignored. Long notes decay with the samples.</p>
      <p class="small muted">Shared links open in Reference without playing or saving automatically. Saved pieces work offline. Download files for backups; clearing browser data removes saved pieces.</p>
      <a class="small" href={agentsUrl} target="_blank" rel="noreferrer">agents.txt — text and MIDI link format</a>
    </details>
  </section>
</div>
<style>
  .import-page { max-width: 640px; margin-inline: auto; }
  h2, p { margin: 0; }
  .drop-zone { display: flex; flex-direction: column; gap: 8px; border: 2px dashed var(--border); border-radius: var(--radius-sm); padding: 12px; }
  .dragging { border-color: var(--accent); background: var(--accent-soft); }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  input, textarea { width: 100%; min-width: 0; max-width: 100%; font: inherit; color: var(--text); }
  textarea { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; resize: vertical; font-family: monospace; font-size: 0.85rem; }
  summary { cursor: pointer; min-height: 36px; align-content: center; }
  .text-score { margin-top: 10px; }
  details > p { margin-block: 10px; }
</style>
