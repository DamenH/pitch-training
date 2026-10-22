<script lang="ts">
  import { mic } from '../lib/mic.svelte';
  import type { MicErrorCode } from '../audio/microphone';
  import Icon from './Icon.svelte';

  const HELP: Record<MicErrorCode, string> = {
    denied:
      'Microphone access is blocked. Allow it for this site in your browser settings (often via the icon next to the address bar), then try again.',
    'not-found': 'No microphone was found. Connect one, then try again.',
    busy: 'The microphone could not be started. Another app may be using it — close it and try again.',
    insecure: 'Microphone input needs a secure connection. Open the app over https:// or from localhost.',
    unsupported: 'This browser does not support microphone input. Try a current version of Chrome, Firefox, Safari or Edge.',
    interrupted: 'The microphone stopped (it may have been disconnected). Start it again to continue.',
    unknown: 'The microphone could not be started.',
  };
</script>

<div class="mic" aria-live="polite">
  {#if mic.status === 'idle'}
    <button type="button" class="btn primary block" onclick={() => mic.start()}>
      <Icon name="mic" /> Start microphone
    </button>
  {:else if mic.status === 'starting'}
    <button type="button" class="btn block" disabled>
      <Icon name="mic" /> Waiting for microphone…
    </button>
  {:else if mic.status === 'running'}
    <div class="running">
      <span class="on"><span class="dot" aria-hidden="true"></span> Microphone on</span>
      <button type="button" class="btn small" onclick={() => mic.stop()}>
        <Icon name="stop" size={16} /> Stop
      </button>
    </div>
  {:else if mic.status === 'error' && mic.error}
    <div class="notice bad" role="alert">
      <p><strong>Microphone unavailable.</strong> {HELP[mic.error.code]}</p>
      {#if mic.error.code === 'unknown'}<p class="small muted">{mic.error.message}</p>{/if}
      <div class="row">
        {#if mic.error.code !== 'unsupported' && mic.error.code !== 'insecure'}
          <button type="button" class="btn small" onclick={() => mic.start()}>Try again</button>
        {/if}
        <button type="button" class="btn small" onclick={() => mic.dismissError()}>Dismiss</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .mic p {
    margin: 8px 0 0;
    text-align: center;
  }
  .mic .notice p {
    text-align: left;
    margin: 0 0 8px;
  }
  .running {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .on {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--bad);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
