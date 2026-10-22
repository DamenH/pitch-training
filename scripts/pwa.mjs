import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Precache the complete build, including every piano sample, atomically. */
export async function writeServiceWorker(directory) {
  async function filesAt(path = '') {
    const entries = await readdir(join(directory, path), { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
      const name = path ? `${path}/${entry.name}` : entry.name;
      return entry.isDirectory() ? filesAt(name) : [name];
    }));
    return files.flat().filter((file) => file !== 'sw.js').sort();
  }
  const files = await filesAt();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(await readFile(join(directory, file)));
  const version = hash.digest('hex').slice(0, 16);
  await writeFile(join(directory, 'sw.js'), `
const PREFIX = 'pitch-training:' + self.registration.scope;
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((file) => new Request(new URL(file, self.registration.scope), { cache: 'reload' })));
  })());
});
// Normally wait for all app windows to close; Settings can explicitly activate an update.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
// Files shared to the installed app (Android share sheet) arrive as a form POST.
// Stash the file for the page, then open Import, which picks it up.
const SHARE_CACHE = 'pitch-training-share';
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.href !== new URL('share-target', self.registration.scope).href) return;
  event.respondWith((async () => {
    try {
      const file = (await event.request.formData()).get('file');
      if (file instanceof File) {
        const cache = await caches.open(SHARE_CACHE);
        await cache.put(new URL('shared-file', self.registration.scope).href,
          new Response(file, { headers: { 'X-Filename': encodeURIComponent(file.name) } }));
      }
    } catch {}
    return Response.redirect(new URL('./#/import?shared=1', self.registration.scope).href, 303);
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Hash routes all use the cached root document. Match real files first so
    // navigating to agents.txt returns text, even when controlled and offline.
    return (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request);
  })());
});
`);
}
