<script lang="ts">
  import { installApp, prepareOffline, pwa, updateAndReload } from '../lib/pwa.svelte';
</script>

<section aria-labelledby="install-h">
  <h2 id="install-h" class="eyebrow">App</h2>
  <div class="status" role="status" aria-live="polite">
    {#if pwa.status === 'ready'}
      <p>Ready offline</p>
    {:else if pwa.status === 'preparing'}
      <p>Saving for offline use…</p>
    {:else if pwa.status === 'error'}
      <p>Couldn’t save for offline use.</p>
    {:else}
      <p>Offline use isn’t available in this browser.</p>
    {/if}
    {#if !pwa.online}<p class="muted">You’re offline.</p>{/if}
    {#if pwa.updateReady}<p class="muted">An update is ready.</p>{/if}
    {#if pwa.refreshError}<p class="notice bad" role="alert">{pwa.refreshError}</p>{/if}
  </div>
  <div class="row">
    {#if pwa.status !== 'unavailable'}
      <button type="button" class="btn small" class:primary={pwa.updateReady} onclick={updateAndReload}
        disabled={pwa.refreshing || pwa.status === 'preparing'}>
        {pwa.refreshing ? 'Updating…' : 'Update & reload'}
      </button>
    {/if}
    {#if pwa.status === 'error'}
      <button type="button" class="btn small" onclick={prepareOffline}>Try again</button>
    {/if}
    {#if !pwa.installed && pwa.canInstall}
      <button type="button" class="btn small primary" onclick={installApp}>Install</button>
    {/if}
  </div>
  {#if !pwa.installed && !pwa.canInstall}
    <p class="hint">To install, use Share → Add to Home Screen in Safari, or Install in your browser’s menu.</p>
  {/if}
</section>

<style>
  .status {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-top: var(--space-3);
    border-top: 1px solid var(--hairline);
    font-weight: 600;
  }

  .status .muted {
    font-weight: 400;
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
