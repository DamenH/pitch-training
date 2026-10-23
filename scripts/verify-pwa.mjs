import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { verifyLibrary, verifyStorageFallback } from './verify-library.mjs';
import { verifyLayout, verifyScramble, verifySinging } from './verify-singing.mjs';

// Exercise real service workers under subpaths, as on shared hosting / GitHub Pages.
let update = false;
let failUpdateCheck = false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const match = /^\/(standard|portable)\/(.*)$/.exec(pathname);
    if (!match) { response.writeHead(404).end(); return; }
    if (failUpdateCheck && match[2] === 'sw.js') { response.writeHead(503).end(); return; }
    const root = resolve(match[1] === 'standard' ? 'dist' : 'dist-single');
    const path = resolve(root, match[2] || 'index.html');
    assert(path.startsWith(`${root}/`));
    let bytes = await readFile(path);
    if (update && match[2] === 'sw.js') {
      bytes = Buffer.from(bytes.toString().replace(/const CACHE = PREFIX \+ '([^']+)'/, "const CACHE = PREFIX + '$1-test-update'"));
    }
    if (update && (!match[2] || match[2] === 'index.html')) {
      bytes = Buffer.from(bytes.toString().replace('</head>', '<meta name="test-release" content="updated"></head>'));
    }
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'text/plain', 'Cache-Control': 'no-cache' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox'],
});
try {
  for (const variant of ['standard', 'portable']) {
    update = false;
    const context = await browser.newContext();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = `${origin}/${variant}/`;
    await page.goto(`${url}#/settings`);
    await expect(page.getByText('Ready offline', { exact: false })).toBeVisible({ timeout: 20000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    // Check the actual page color and browser hint together, including live OS theme changes.
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    for (const [colorScheme, color, background] of [
      ['dark', '#16171a', 'rgb(22, 23, 26)'],
      ['light', '#f7f6f2', 'rgb(247, 246, 242)'],
    ]) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', color);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), colorScheme);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), background);
    }
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    assert.equal(manifest.errors.length, 0, JSON.stringify(manifest.errors));
    const installability = await cdp.send('Page.getInstallabilityErrors');
    // Playwright's isolated contexts are incognito, where Chrome disables installing.
    assert.deepEqual(installability.installabilityErrors.filter((error) => error.errorId !== 'in-incognito'), []);
    const icons = JSON.parse(manifest.data).icons;
    assert(icons.some((icon) => icon.sizes === '192x192'));
    assert(icons.some((icon) => icon.sizes === '512x512'));
    assert(icons.some((icon) => icon.purpose === 'maskable'));
    await page.getByLabel('Lowest octave').selectOption('4');
    await page.getByLabel('Highest octave').selectOption('4');
    await page.evaluate(() => caches.open('unrelated-app-cache'));

    await context.setOffline(true);
    await expect(page.getByText('You’re offline.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Ready offline', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Lowest octave')).toHaveValue('4');
    const docs = await context.newPage();
    const docsResponse = await docs.goto(`${url}agents.txt`);
    assert(docsResponse.headers()['content-type'].startsWith('text/plain'));
    await expect(docs.locator('body')).toContainText('Pitch Training - piano import and sharing protocol');
    await docs.close();
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const cache = await caches.open(names.find((name) => name.startsWith('pitch-training:')));
      const requests = await cache.keys();
      const sounds = requests.filter((r) => r.url.endsWith('.mp3'));
      const decoder = new OfflineAudioContext(2, 1, 44100);
      for (const request of sounds) {
        const response = await fetch(request.url);
        await decoder.decodeAudioData(await response.arrayBuffer());
      }
      return { sounds: sounds.length, paths: requests.map((request) => new URL(request.url).pathname) };
    });
    assert.equal(cached.sounds, variant === 'standard' ? 28 : 0);
    for (const file of ['', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
      assert(cached.paths.includes(`/${variant}/${file}`), `Missing cached ${file}`);
    }
    await page.goto(`${url}#/identify`);
    await page.getByRole('button', { name: 'Play note', exact: true }).click();
    await page.getByRole('group', { name: 'Which note did you hear?' }).getByRole('button', { name: 'C', exact: true }).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('button', { name: 'Next note' })).toBeVisible();
    await page.getByRole('group', { name: 'Play notes to compare with the answer' }).getByRole('button').first().click();
    // Every octave remains playable without fetching a new piano sample.
    await page.goto(`${url}#/reference`);
    for (const octave of ['1', '7']) {
      await page.getByRole('radio', { name: octave, exact: true }).check();
      await page.locator('.piano button').first().click();
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Reference', exact: true })).toBeVisible();

    await verifyLibrary(context, page, url);
    await verifySinging(page, url);
    await verifyScramble(page, url);
    await verifyLayout(page, url);

    await context.setOffline(false);
    update = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.goto(`${url}#/settings`);
    await expect(page.getByText('An update is ready.', { exact: false })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
    const oldController = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    assert(oldController.endsWith(`/${variant}/sw.js`));
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(`${url}#/settings`);
    await expect(reopened.getByText('Ready offline', { exact: false })).toBeVisible();
    await expect(reopened.locator('meta[name="test-release"]')).toHaveAttribute('content', 'updated');
    await expect(reopened.getByLabel('Lowest octave')).toHaveValue('4');
    await expect.poll(() => reopened.evaluate(() => caches.keys())).toContain('unrelated-app-cache');
    await expect.poll(async () => (await reopened.evaluate(() => caches.keys())).filter((key) => key.startsWith(`pitch-training:${url}`)))
      .toEqual([expect.stringContaining('-test-update')]);
    await context.setOffline(true);
    await reopened.reload();
    await expect(reopened.locator('meta[name="test-release"]')).toHaveAttribute('content', 'updated');
    // Explicit update works without closing another window and preserves user data.
    await reopened.getByRole('button', { name: 'Update & reload', exact: true }).click();
    await expect(reopened.getByRole('alert')).toHaveText('Connect to the internet to update the app.');
    await context.setOffline(false);
    const stillOpen = await context.newPage();
    await stillOpen.goto(`${url}#/settings`);
    update = false; // Publish another release (the original shell), while both windows stay open.
    await reopened.getByRole('button', { name: 'Update & reload', exact: true }).click();
    await expect(reopened.locator('meta[name="test-release"]')).toHaveCount(0, { timeout: 20000 });
    await expect(reopened.getByText('Ready offline', { exact: false })).toBeVisible();
    await expect(reopened.getByLabel('Lowest octave')).toHaveValue('4');
    assert.equal(await reopened.evaluate(() => localStorage.getItem('unrelated-app:sentinel')), 'keep me');
    await expect(stillOpen.locator('meta[name="test-release"]')).toHaveCount(1);
    await expect.poll(() => reopened.evaluate(() => caches.keys())).toContain('unrelated-app-cache');
    await reopened.goto(`${url}#/reference`);
    await expect(reopened.getByRole('button', { name: 'Imported MIDI chord', exact: true })).toBeVisible();
    await reopened.goto(`${url}#/settings`);
    failUpdateCheck = true;
    await reopened.getByRole('button', { name: 'Update & reload', exact: true }).click();
    await expect(reopened.getByRole('alert')).toBeVisible();
    failUpdateCheck = false;
    await expect(reopened.getByRole('button', { name: 'Update & reload', exact: true })).toBeEnabled();
    // No new release: the same button still reloads, then remains usable offline.
    await Promise.all([
      reopened.waitForEvent('load'),
      reopened.getByRole('button', { name: 'Update & reload', exact: true }).click(),
    ]);
    await context.setOffline(true);
    await reopened.reload();
    await expect(reopened.getByText('Ready offline', { exact: false })).toBeVisible();
    await expect(reopened.getByLabel('Lowest octave')).toHaveValue('4');
    await stillOpen.close();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${variant}: manifest, offline reload, piano, settings, deferred/forced updates, data preservation and update failure recovery passed`);
  }
  await verifyStorageFallback(browser, origin);
} finally {
  await browser.close();
  server.close();
}
