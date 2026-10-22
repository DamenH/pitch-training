<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { MAX_IMPORT_BYTES, parseMidi, parseScoreText, scoreDuration, scoreFromHash, scoreHash, scoreToMidi, type PianoScore } from '../domain/score';
  import { PIANO_EXAMPLES, exampleFromHash, pianoExample } from '../domain/examples';
  import { deleteScore, listScores, saveScore, type SavedScore } from '../lib/scores';
  import { settings } from '../lib/settings.svelte';
  import { playPianoScore, stopAll } from '../audio/synth';

  let { onnotes, onplay }: { onnotes: (notes: number[]) => void; onplay: () => void } = $props();
  const example = JSON.stringify({ version: 1, title: 'C major chord', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 1, velocity: 0.7 })) }, null, 2);
  let text = $state(example);
  let current = $state<PianoScore | null>(null);
  let title = $state('');
  let savedId = $state<string | undefined>();
  let entries = $state<SavedScore[]>([]);
  let playing = $state(false);
  let elapsed = $state(0);
  let notice = $state('');
  let error = $state('');
  let shareUrl = $state('');
  let saving = $state(false);
  let importing = $state(false);
  let dragging = $state(false);
  let playbackToken = 0;
  let importToken = 0;
  let selectionToken = 0;
  let examplesOpen = $state(true);
  let piecePanel = $state<HTMLElement>();
  let loadedExample: { id: string; signature: string } | undefined;
  const duration = $derived(current ? scoreDuration(current) : 0);
  const agentsUrl = new URL('agents.txt', document.baseURI).href;

  function loadExample(id: string) {
    try {
      load(parseMidi(scoreToMidi(pianoExample(id))));
      loadedExample = { id, signature: JSON.stringify(currentScore()) };
      notice = 'Loaded a built-in MIDI example. Play, save a copy, or download the MIDI file.';
    } catch (e) { fail(e); }
  }

  function fail(e: unknown) { error = e instanceof Error ? e.message : 'Something went wrong.'; }
  function stop() {
    playbackToken++;
    stopAll();
    playing = false;
    elapsed = 0;
    onnotes([]);
  }
  function load(score: PianoScore, id?: string) {
    importToken++;
    importing = false;
    selectionToken++;
    loadedExample = undefined;
    stop();
    current = score;
    title = score.title;
    savedId = id;
    text = JSON.stringify(score, null, 2);
    shareUrl = '';
    error = '';
    notice = 'Loaded. Play to listen; save to keep this piece on your device.';
    examplesOpen = false;
    queueMicrotask(() => piecePanel?.focus());
  }
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
  function currentScore(): PianoScore {
    if (!current) throw new Error('Load a piece first.');
    return { version: 1, title: title.trim() || 'Untitled', notes: current.notes.map((n) => ({ ...n })) };
  }
  async function play() {
    if (!current) return;
    onplay();
    const token = ++playbackToken;
    playing = true;
    error = '';
    try {
      await playPianoScore(currentScore(), settings.value.volume, (seconds, notes) => {
        if (token !== playbackToken) return;
        elapsed = seconds;
        onnotes(notes.map((n) => n.midi));
      });
    } catch (e) { if (token === playbackToken) fail(e); }
    finally { if (token === playbackToken) { playing = false; onnotes([]); } }
  }
  async function save() {
    if (saving) return;
    saving = true;
    const selection = selectionToken;
    error = '';
    try {
      const id = await saveScore(currentScore(), savedId);
      if (selection === selectionToken) savedId = id;
      entries = await listScores();
      notice = 'Saved on this device.';
    } catch (e) { fail(e); }
    finally { saving = false; }
  }
  async function remove(id: string) {
    try {
      await deleteScore(id);
      if (savedId === id) savedId = undefined;
      entries = await listScores();
      notice = 'Removed from your library.';
    } catch (e) { fail(e); }
  }
  async function share() {
    error = '';
    try {
      const url = new URL(location.href);
      const score = currentScore();
      url.hash = loadedExample?.signature === JSON.stringify(score)
        ? `#/reference?example=${loadedExample.id}` : scoreHash(score);
      shareUrl = url.href;
      try {
        await navigator.clipboard.writeText(shareUrl);
        notice = 'Link copied. Opening it loads the piece without playing or saving automatically.';
      } catch { notice = 'Select and copy the link below.'; }
    } catch (e) { fail(e); }
  }
  function download() {
    try {
      const score = currentScore();
      const blob = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${score.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'piano-score'}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { fail(e); }
  }
  function downloadMidi() {
    try {
      const score = currentScore();
      const url = URL.createObjectURL(new Blob([new Uint8Array(scoreToMidi(score))], { type: 'audio/midi' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${score.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'piano-score'}.mid`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { fail(e); }
  }
  let lastHash = '';
  function loadLink() {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    try {
      const builtin = exampleFromHash(location.hash);
      const score = builtin ? parseMidi(scoreToMidi(builtin)) : scoreFromHash(location.hash);
      if (score) {
        importToken++;
        importing = false;
        load(score);
        const id = new URLSearchParams(location.hash.split('?')[1]).get('example');
        if (id) loadedExample = { id, signature: JSON.stringify(currentScore()) };
        notice = 'Loaded from link. Play to listen; save to keep it on this device.';
      }
    } catch (e) { fail(e); }
  }
  onMount(() => {
    void listScores().then((scores) => { entries = scores; }).catch(fail);
    loadLink();
    window.addEventListener('hashchange', loadLink);
    return () => window.removeEventListener('hashchange', loadLink);
  });
  onDestroy(() => { importToken++; stop(); });
</script>

<section class="card stack library" aria-labelledby="library-heading">
  <h2 id="library-heading">Piano pieces</h2>
  <p class="small muted">Import MIDI or paste a JSON score. Chords, timing, velocity and sustain pedal are played using our sampled piano. Percussion is skipped; other instrument sounds and pitch bends are ignored. Long notes decay with the piano samples.</p>

  <section class="stack" aria-labelledby="examples-heading">
    <h3 id="examples-heading">Built-in MIDI examples</h3>
    <p class="small muted">Available offline without saving. Choose an example, then press Play piece. Save a copy to make it your own.</p>
    <details bind:open={examplesOpen}>
      <summary>Browse examples</summary>
      <div class="stack text-score">
    {#each ['Practice patterns', 'Public-domain melodies'] as category}
      <h4>{category}</h4>
      <ul class="example-grid">
        {#each PIANO_EXAMPLES.filter((entry) => entry.category === category) as entry (entry.id)}
          <li class="example-card">
            <button type="button" class="btn example-button" aria-label={`Load ${entry.title}`} onclick={() => loadExample(entry.id)}>
              <strong>{entry.title}</strong><span class="small">{entry.description}</span>
            </button>
            <p class="small muted">{entry.credit}</p>
            {#if entry.source}<a class="small" href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.label}</a>{/if}
          </li>
        {/each}
      </ul>
    {/each}
    <p class="small muted">The melodies are public-domain works, with simple transcriptions made for this app. No third-party MIDI performances are included.</p>
      </div>
    </details>
  </section>

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
        <textarea bind:value={text} rows="10" spellcheck="false"></textarea>
      </label>
      <div class="row">
        <button type="button" class="btn" onclick={fromText}>Load text score</button>
        <button type="button" class="btn" onclick={() => { text = example; }}>Show chord example</button>
      </div>
    </div>
  </details>

  {#if importing}<p role="status">Importing…</p>{/if}
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <p class="small" role="status" aria-live="polite">{notice}</p>

  {#if current}
    <section class="stack" aria-label="Loaded piano piece" tabindex="-1" bind:this={piecePanel}>
    <label class="field"><span>Piece title</span><input type="text" bind:value={title} maxlength="160" /></label>
    <p class="small muted">{current.notes.length.toLocaleString()} notes · {duration.toFixed(1)} seconds · Piano</p>
    <progress aria-label="Piece playback progress" value={elapsed} max={Math.max(1, duration)}></progress>
    <div class="row piece-actions">
      {#if playing}
        <button type="button" class="btn primary" onclick={stop}>Stop piece</button>
      {:else}
        <button type="button" class="btn primary" onclick={play}>Play piece</button>
      {/if}
      <button type="button" class="btn" onclick={save} disabled={saving}>{saving ? 'Saving…' : savedId ? 'Save changes' : 'Save to library'}</button>
      <button type="button" class="btn" onclick={share}>Copy piece link</button>
      <button type="button" class="btn" onclick={download}>Export score</button>
      <button type="button" class="btn" onclick={downloadMidi}>Download MIDI</button>
    </div>
    {#if shareUrl}<label class="field"><span>Piece link</span><input readonly value={shareUrl} onclick={(e) => e.currentTarget.select()} /></label>{/if}
    </section>
  {/if}

  <h3>Saved on this device</h3>
  {#if entries.length === 0}
    <p class="small muted">No saved pieces yet. Imported files, text scores and links can all be saved here.</p>
  {:else}
    <ul class="saved-pieces">
      {#each entries as entry (entry.id)}
        <li>
          <button type="button" class="btn saved-title" onclick={() => load(entry.score, entry.id)}>{entry.score.title}</button>
          <button type="button" class="btn" aria-label={`Delete ${entry.score.title}`} onclick={() => remove(entry.id)}>Delete</button>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="small muted">Saved in this app’s library, available offline. Export files for backups; clearing browser data removes saved pieces. <a href={agentsUrl} target="_blank" rel="noreferrer">agents.txt — text and MIDI link format</a></p>
</section>

<style>
  .library { margin-top: var(--gap); }
  .example-grid { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
  .example-card { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .example-card p { margin: 0; }
  .example-button { flex: 1; flex-direction: column; align-items: flex-start; text-align: left; gap: 6px; white-space: normal; }
  .drop-zone { border: 2px dashed var(--border); border-radius: var(--radius-sm); padding: 16px; }
  .drop-zone.dragging { border-color: var(--accent); background: var(--accent-soft); }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  input, textarea {
    width: 100%; min-width: 0; max-width: 100%; font: inherit; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 10px;
  }
  textarea { width: 100%; resize: vertical; font-family: monospace; font-size: 0.85rem; }
  summary { cursor: pointer; }
  .text-score { margin-top: 12px; }
  .piece-actions { flex-wrap: wrap; }
  progress { width: 100%; accent-color: var(--accent); }
  .saved-pieces { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .saved-pieces li { display: flex; gap: 8px; }
  .saved-title { flex: 1; overflow-wrap: anywhere; }
</style>
