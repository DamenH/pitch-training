// Files handed to the installed app by the OS: "Open with" on desktop
// (file_handlers) and the Android share sheet (share_target).

import { href } from './router.svelte';

export const incoming = $state<{ file: File | null }>({ file: null });

function receive(file: File) {
  incoming.file = file;
  location.hash = href('import');
}

/** Stashed by the service worker when a file is shared to the app. */
async function takeSharedFile() {
  if (!/[?&]shared=1/.test(location.hash) || !('caches' in window)) return;
  try {
    const cache = await caches.open('pitch-training-share');
    const url = new URL('shared-file', new URL(import.meta.env.BASE_URL, document.baseURI)).href;
    const response = await cache.match(url);
    if (!response) return;
    await cache.delete(url);
    const name = decodeURIComponent(response.headers.get('X-Filename') ?? 'shared');
    receive(new File([await response.blob()], name));
  } catch {
    // Nothing to import; Import stays empty.
  }
}

interface LaunchParams {
  files: readonly { getFile(): Promise<File> }[];
}

export function initializeIncomingFiles() {
  const launchQueue = (window as Window & { launchQueue?: { setConsumer(fn: (p: LaunchParams) => void): void } })
    .launchQueue;
  launchQueue?.setConsumer(async (params) => {
    const handle = params.files[0];
    if (handle) receive(await handle.getFile());
  });
  void takeSharedFile();
}
