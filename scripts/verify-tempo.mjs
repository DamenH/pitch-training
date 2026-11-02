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

/** Counts metronome clicks (1760 Hz oscillators) as they're started. */
async function countClicks(page) {
  await page.evaluate(() => {
    if (globalThis.tempoClicks !== undefined) return;
    globalThis.tempoClicks = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      if (this.frequency.value === 1760) globalThis.tempoClicks++;
      return start.apply(this, args);
    };
  });
  return () => page.evaluate(() => globalThis.tempoClicks);
}

export async function verifyMetronome(page, url) {
  await page.goto(`${url}#/reference`);
  const clicks = await countClicks(page);
  const panel = page.getByRole('region', { name: 'Metronome' });
  await expect(panel.locator('.reading .mark', { hasText: /= 120$/ })).toBeVisible();
  await expect(panel.locator('.reading .term', { hasText: /^Allegro$/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Slower', exact: true }).click();
  await expect(panel.locator('.reading .mark', { hasText: /= 119$/ })).toBeVisible();
  await expect(panel.locator('.reading .term', { hasText: /^Allegretto$/ })).toBeVisible();
  await panel.getByRole('slider', { name: 'Tempo' }).fill('60');
  await expect(panel.locator('.reading .mark', { hasText: /= 60$/ })).toBeVisible();
  await expect(panel.locator('.reading .term', { hasText: /^Adagio$/ })).toBeVisible();
  // A tempo term sets the tempo to the middle of its band.
  await panel.getByText('Tempo terms', { exact: true }).click();
  await panel.getByRole('button', { name: /^Allegro\b/ }).click();
  await expect(panel.locator('.reading .mark', { hasText: /= 138$/ })).toBeVisible();
  // …and plays it.
  await panel.getByRole('button', { name: 'Stop metronome' }).click();
  // Tap tempo: four taps 500 ms apart is 120 BPM (the timing is approximate under automation).
  const tapButton = panel.getByRole('button', { name: 'Tap', exact: true });
  for (let i = 0; i < 4; i++) {
    await tapButton.click();
    await page.waitForTimeout(500);
  }
  const tapped = Number((await panel.locator('.mark').innerText()).replace(/\D/g, ''));
  assert(tapped >= 100 && tapped <= 125, `Tap tempo read ${tapped}`);
  await panel.getByRole('slider', { name: 'Tempo' }).fill('120');

  const before = await clicks();
  await panel.getByRole('button', { name: 'Start metronome' }).click();
  await page.waitForTimeout(1600);
  const during = (await clicks()) - before;
  assert(during >= 3 && during <= 5, `Expected about 4 clicks in 1.6 s at 120 BPM, got ${during}`);
  await expect(panel.locator('.pulse.lit')).toHaveCount(1);
  // Changing tempo while running keeps clicking.
  await panel.getByRole('slider', { name: 'Tempo' }).fill('180');
  await page.waitForTimeout(1000);
  assert((await clicks()) - before > during, 'Clicks continue after a tempo change');

  // Leaving the tab stops it.
  await page.goto(`${url}#/identify`);
  const left = await clicks();
  await page.waitForTimeout(800);
  assert.equal(await clicks(), left, 'The metronome stops when you leave Reference');
  console.log('  metronome: marks and terms, tap tempo, steady clicks, tempo changes and stop on leaving passed');
}
