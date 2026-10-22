<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { scoreDuration, scoreHash, scoreToMidi, type PianoScore } from '../domain/score';
  import { saveScore } from '../lib/scores';
  import { settings } from '../lib/settings.svelte';
  import { playPianoScore, stopAll } from '../audio/synth';
  let { score, savedId, exampleId, onnotes = () => {}, onplay = () => {}, onsaved = () => {} }: {
    score: PianoScore; savedId?: string; exampleId?: string;
    onnotes?: (notes: number[]) => void; onplay?: () => void; onsaved?: () => void;
  } = $props();
  // Parents key this component by selection; edits belong to that piece only.
  let title = $state(untrack(() => score.title));
  const initialTitle = untrack(() => score.title);
  let id = $state(untrack(() => savedId));
  let playing = $state(false);
  let elapsed = $state(0);
  let notice = $state('');
  let error = $state('');
  let shareUrl = $state('');
  let saving = $state(false);
  let playbackToken = 0;
  let disposed = false;
  let panel: HTMLElement | undefined = $state();
  const duration = $derived(scoreDuration(score));
  function fail(e: unknown) { error = e instanceof Error ? e.message : 'Something went wrong.'; }
  function stop() { playbackToken++; stopAll(); playing = false; elapsed = 0; onnotes([]); }
  function currentScore(): PianoScore {
    return { version: 1, title: title.trim() || 'Untitled', notes: score.notes.map((n) => ({ ...n })) };
  }
  async function play() {
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
    error = '';
    try {
      const saved = await saveScore(currentScore(), id);
      if (disposed) return;
      id = saved;
      onsaved();
      notice = 'Saved on this device.';
    } catch (e) { if (!disposed) fail(e); }
    finally { if (!disposed) saving = false; }
  }
  async function share() {
    error = '';
    try {
      const url = new URL(location.href);
      const score = currentScore();
      url.hash = exampleId && score.title === initialTitle
        ? `#/reference?example=${exampleId}` : scoreHash(score);
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
  onMount(() => panel?.focus({ preventScroll: true }));
  onDestroy(() => { disposed = true; stop(); });
</script>
<section class="stack piece" aria-label="Loaded piano piece" tabindex="-1" bind:this={panel}>
  <label class="field"><span>Piece title</span><input type="text" bind:value={title} maxlength="160" /></label>
  <p class="small muted">{score.notes.length.toLocaleString()} notes · {duration.toFixed(1)} seconds · Piano</p>
  <progress aria-label="Piece playback progress" value={elapsed} max={Math.max(1, duration)}></progress>
  <div class="row piece-actions">
    {#if playing}
      <button type="button" class="btn primary" aria-label="Stop piece" onclick={stop}>Stop</button>
    {:else}
      <button type="button" class="btn primary" aria-label="Play piece" onclick={play}>Play</button>
    {/if}
    <button type="button" class="btn" aria-label={id ? 'Save changes' : 'Save to library'} onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    <button type="button" class="btn" aria-label="Copy piece link" onclick={share}>Share</button>
  </div>
  <details><summary>Download piece</summary><div class="row downloads">
    <button type="button" class="btn" onclick={download}>Export score</button>
    <button type="button" class="btn" onclick={downloadMidi}>Download MIDI</button>
  </div></details>
  {#if shareUrl}<label class="field"><span>Piece link</span><input readonly value={shareUrl} onclick={(e) => e.currentTarget.select()} /></label>{/if}
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  {#if notice}<p class="small" role="status">{notice}</p>{/if}
</section>
<style>
  .piece { gap: 10px; min-width: 0; outline: none; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  input { width: 100%; min-width: 0; font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  p { margin: 0; }
  progress { width: 100%; height: 6px; accent-color: var(--accent); }
  summary { cursor: pointer; font-size: 0.875rem; color: var(--text-muted); min-height: 32px; align-content: center; }
  .downloads { margin-top: 8px; }
</style>
