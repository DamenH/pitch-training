import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { writeServiceWorker } from './scripts/pwa.mjs';

// The app uses hash-based routing and relative asset URLs, so the same build
// works at a domain root or under any GitHub Pages repository subpath
// (e.g. https://user.github.io/pitch-training/). Set BASE_PATH to force an
// absolute base such as "/pitch-training/" if you prefer.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [svelte(), {
    name: 'offline-app',
    apply: 'build',
    async writeBundle(options) {
      if (options.dir) await writeServiceWorker(resolve(options.dir));
    },
  }],
  build: {
    target: 'es2020',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
