import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Links to the renamed tabs land on their new routes. */
export async function verifyRoutes(page, url) {
  for (const [legacy, current, heading] of [
    ['#/anchor/tune', '#/tune/pitch', 'Tune'],
    ['#/sing-test', '#/test/sing', 'Test'],
  ]) {
    await page.goto(`${url}${legacy}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).hash, current);
  }
  console.log('  routes: Anchor and Sing test links land on Tune and Test passed');
}
