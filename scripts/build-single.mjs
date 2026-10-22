// A portable HTML build, including the piano samples, without extra dependencies.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { writeServiceWorker } from './pwa.mjs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const sampleDirectory = new URL('../public/samples/piano/', import.meta.url);
const samples = {};
for (const file of await readdir(sampleDirectory)) {
  if (file.endsWith('.mp3')) {
    samples[file] = `data:audio/mpeg;base64,${(await readFile(new URL(file, sampleDirectory))).toString('base64')}`;
  }
}

let embeddedSamples = false;
const result = await build({
  root,
  publicDir: false,
  plugins: [{
    name: 'embed-piano-samples',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== `${root}src/audio/piano.ts`) return;
      const original = 'return `${import.meta.env.BASE_URL}samples/piano/${file}`;';
      assert(code.includes(original), 'Piano loader changed; update the single-file build.');
      embeddedSamples = true;
      return code.replace(original, `return (${JSON.stringify(samples)})[file];`);
    },
  }],
  build: {
    write: false,
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: Infinity,
  },
});
assert(embeddedSamples, 'Piano samples were not embedded.');
assert(!Array.isArray(result) && 'output' in result);
const output = result.output;
const htmlAsset = output.find((item) => item.fileName === 'index.html');
assert(htmlAsset?.type === 'asset');
let html = String(htmlAsset.source);
for (const item of output) {
  if (item.type === 'chunk') {
    assert(item.isEntry && !item.imports.length && !item.dynamicImports.length,
      'Single-file build must contain only one self-contained entry module.');
    assert(!/<\/script/i.test(item.code), 'JavaScript contains an HTML closing script tag.');
    const tag = /<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/;
    assert(tag.test(html));
    html = html.replace(tag, () => `<script type="module">${item.code}</script>`);
  } else if (item.fileName.endsWith('.css')) {
    const tag = /<link\b[^>]*\brel="stylesheet"[^>]*>/;
    assert(tag.test(html));
    const css = String(item.source);
    assert(!/<\/style/i.test(css));
    html = html.replace(tag, () => `<style>${css}</style>`);
  } else {
    assert(item.fileName === 'index.html', `Unexpected external asset: ${item.fileName}`);
  }
}
const icon = `data:image/svg+xml;base64,${(await readFile(new URL('../public/icon.svg', import.meta.url))).toString('base64')}`;
html = html.replace('href="./icon.svg"', `href="${icon}"`);
const license = await readFile(new URL('LICENSE.txt', sampleDirectory), 'utf8');
assert(!license.includes('-->'));
html = html.replace('</head>', `<!--\n${license}\n-->\n</head>`);
assert(!/<script\b[^>]*src=/.test(html), 'External script left in HTML.');
const destination = new URL('../dist-single/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('index.html', destination), html);
for (const file of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'agents.txt']) {
  await copyFile(new URL(`../public/${file}`, import.meta.url), new URL(file, destination));
}
await writeServiceWorker(fileURLToPath(destination));
console.log(`Single-file build: dist-single/index.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB; ${Object.keys(samples).length} piano samples embedded).`);
