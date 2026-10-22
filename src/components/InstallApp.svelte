<script lang="ts">
  import { installApp, prepareOffline, pwa, updateAndReload } from '../lib/pwa.svelte';
</script>

<section class="card stack" aria-labelledby="install-h">
  <h2 id="install-h">Install &amp; offline use</h2>
  <div role="status" aria-live="polite">
    {#if pwa.status === 'ready'}
      <p>Ready offline — exercises and all piano sounds are saved on this device.</p>
    {:else if pwa.status === 'preparing'}
      <p>Saving the app and piano sounds for offline use… Keep this page open until it’s ready.</p>
    {:else if pwa.status === 'error'}
      <p>Couldn’t save the app for offline use. Connect to the internet and try again.</p>
    {:else}
      <p>Offline saving requires the hosted app in a browser that supports service workers.</p>
    {/if}
    {#if !pwa.online}<p>You’re offline.</p>{/if}
    {#if pwa.updateReady}<p>An update is ready. Use Update &amp; reload to apply it now.</p>{/if}
    {#if pwa.refreshError}<p role="alert">{pwa.refreshError}</p>{/if}
  </div>
  {#if pwa.status !== 'unavailable'}
    <button type="button" class="btn" onclick={updateAndReload} disabled={pwa.refreshing || pwa.status === 'preparing'}>
      {pwa.refreshing ? 'Updating…' : 'Update & reload'}
    </button>
    <p class="small muted">Checks for the latest version and reloads the app. Your settings, history and saved pieces stay on this device.</p>
  {/if}
  {#if pwa.status === 'error'}
    <button type="button" class="btn" onclick={prepareOffline}>Try saving again</button>
  {/if}
  {#if pwa.installed}
    <p class="small muted">You’re using the installed app.</p>
  {:else if pwa.canInstall}
    <button type="button" class="btn primary" onclick={installApp}>Install Pitch Training</button>
  {:else}
    <p class="small muted">On iPhone or iPad, open in Safari, tap Share, then Add to Home Screen. In Chrome or Edge, use the browser menu’s Install app option when available.</p>
  {/if}
  <p class="small muted">Singing uses your device’s microphone and needs permission. Settings and history stay on this device. Clearing browser data also removes offline downloads.</p>
</section>
