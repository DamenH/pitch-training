<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { scoreDuration, scoreHash, scoreToMidi, type PianoScore } from '../domain/score';
  import { saveScore } from '../lib/scores';
  import { settings } from '../lib/settings.svelte';
  import { showToast } from '../lib/toast.svelte';
  import { downloadBlob, fileSafeName } from '../lib/files';
  import { keepAwake, onPress, prefersShareSheet } from '../lib/native';
  import { playPianoScore, stopAll } from '../audio/synth';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { score, savedId, exampleId, onnotes = () => {}, onplay = () => {}, onsaved = () => {} }: {
    score: PianoScore;
    savedId?: string;
    exampleId?: string;
    onnotes?: (notes: number[]) => void;
    onplay?: () => void;
    onsaved?: () => void;
  } = $props();

  // Parents key this component by selection; edits belong to that piece only.
  let title = $state(untrack(() => score.title));
  const initialTitle = untrack(() => score.title);
  let id = $state(untrack(() => savedId));
  let playing = $state(false);
  let elapsed = $state(0);
  let error = $state('');
  let shareUrl = $state('');
  let saving = $state(false);
  let downloadsOpen = $state(false);
  let playbackToken = 0;
  let disposed = false;
  let panel: HTMLElement | undefined = $state();
  const duration = $derived(scoreDuration(score));

  function fail(e: unknown) {
    error = e instanceof Error ? e.message : 'Something went wrong.';
  }

  function currentScore(): PianoScore {
    return { version: 1, title: title.trim() || 'Untitled', notes: score.notes.map((n) => ({ ...n })) };
  }

  /** System media controls (lock screen, notification, hardware keys) for the playing piece. */
  function setMediaSession(active: boolean) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (active) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: title.trim() || 'Untitled', artist: 'Pitch Training' });
        for (const action of ['pause', 'stop'] as const) navigator.mediaSession.setActionHandler(action, stop);
        navigator.mediaSession.setActionHandler('play', () => void play());
      }
      navigator.mediaSession.playbackState = active ? 'playing' : 'paused';
    } catch {
      // Some actions are unsupported on some platforms.
    }
  }

  function stop() {
    playbackToken++;
    stopAll();
    playing = false;
    elapsed = 0;
    onnotes([]);
    keepAwake('piece', false);
    setMediaSession(false);
  }

  async function play() {
    if (playing) return;
    onplay();
    const token = ++playbackToken;
    playing = true;
    error = '';
    keepAwake('piece', true);
    setMediaSession(true);
    try {
      await playPianoScore(currentScore(), settings.value.volume, (seconds, notes) => {
        if (token !== playbackToken) return;
        elapsed = seconds;
        onnotes(notes.map((n) => n.midi));
      });
    } catch (e) {
      if (token === playbackToken) fail(e);
    } finally {
      if (token === playbackToken) {
        playing = false;
        onnotes([]);
        keepAwake('piece', false);
        setMediaSession(false);
      }
    }
  }

  function toggle() {
    if (playing) stop();
    else void play();
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
      showToast('Saved to your library');
    } catch (e) {
      if (!disposed) fail(e);
    } finally {
      if (!disposed) saving = false;
    }
  }

  async function share() {
    error = '';
    shareUrl = '';
    try {
      const url = new URL(location.href);
      const piece = currentScore();
      url.hash = exampleId && piece.title === initialTitle ? `#/reference?example=${exampleId}` : scoreHash(piece);
      if (prefersShareSheet()) {
        try {
          await navigator.share({ title: piece.title, url: url.href });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url.href);
        showToast('Link copied');
      } catch {
        shareUrl = url.href;
      }
    } catch (e) {
      fail(e);
    }
  }

  function download(kind: 'json' | 'midi') {
    downloadsOpen = false;
    try {
      const piece = currentScore();
      const name = fileSafeName(piece.title, 'piano-score');
      if (kind === 'json') {
        downloadBlob(`${name}.json`, new Blob([JSON.stringify(piece, null, 2)], { type: 'application/json' }));
      } else {
        downloadBlob(`${name}.mid`, new Blob([new Uint8Array(scoreToMidi(piece))], { type: 'audio/midi' }));
      }
    } catch (e) {
      fail(e);
    }
  }

  function clock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  onMount(() => panel?.focus({ preventScroll: true }));
  onDestroy(() => {
    disposed = true;
    stop();
  });
</script>

<section class="piece" aria-label="Loaded piano piece" tabindex="-1" bind:this={panel}>
  <label class="title">
    <span class="visually-hidden">Piece title</span>
    <input type="text" bind:value={title} maxlength="160" spellcheck="false" />
  </label>
  <p class="meta">{score.notes.length.toLocaleString()} notes</p>

  <div class="transport">
    <!-- One button that toggles, so a press never lands on a control swapped in under the finger. -->
    <button type="button" class="round" aria-label={playing ? 'Stop piece' : 'Play piece'} {...onPress(toggle)}>
      <Icon name={playing ? 'stop' : 'play'} size={playing ? 18 : 20} />
    </button>
    <progress aria-label="Piece playback progress" value={elapsed} max={Math.max(1, duration)}></progress>
    <span class="time">{clock(playing ? elapsed : duration)}</span>
  </div>

  <div class="actions">
    <button type="button" class="btn small" aria-label={id ? 'Save changes' : 'Save to library'} onclick={save} disabled={saving}>
      {id ? 'Save changes' : 'Save'}
    </button>
    <button type="button" class="btn small" aria-label="Copy piece link" onclick={share}>
      <Icon name="share" size={16} /> Share
    </button>
    <button type="button" class="btn small" onclick={() => { downloadsOpen = true; }}>
      <Icon name="download" size={16} /> Download
    </button>
  </div>

  {#if shareUrl}
    <label class="field link">
      <span class="small">Piece link</span>
      <input class="input" readonly value={shareUrl} onclick={(e) => e.currentTarget.select()} />
    </label>
  {/if}
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
</section>

<Sheet bind:open={downloadsOpen} label="Download piece">
  <p class="sheet-title">Download “{title.trim() || 'Untitled'}”</p>
  <button type="button" class="btn block" onclick={() => download('midi')}>MIDI file</button>
  <button type="button" class="btn block" onclick={() => download('json')}>JSON score</button>
  <button type="button" class="btn plain block" onclick={() => { downloadsOpen = false; }}>Cancel</button>
</Sheet>

<style>
  .piece {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    outline: none;
  }

  .title input {
    width: 100%;
    min-width: 0;
    margin: 0 -6px;
    padding: 2px 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-size: var(--text-lg);
    font-weight: 700;
    text-overflow: ellipsis;
  }

  .title input:hover,
  .title input:focus {
    border-color: var(--border);
    background: var(--surface);
  }

  .title input:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 0;
  }

  .meta {
    margin-top: calc(-1 * var(--space-3));
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .transport {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .round {
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    padding: 0 0 0 2px;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    transition: transform 90ms var(--ease);
  }

  .round:active {
    transform: scale(0.92);
  }

  .time {
    min-width: 2.6em;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    text-align: right;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .actions .btn {
    flex: 1 1 0;
  }
</style>
