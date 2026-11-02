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

export async function verifyTap(page, url) {
  await page.goto(`${url}#/settings`);
  await page.locator('label:has(input[name="tempo-target-style"][value="number"])').click();
  await page.goto(`${url}#/test/tap`);
  await expect(page.getByRole('heading', { name: 'Test', exact: true })).toBeVisible();
  const clicks = await countClicks(page);
  const bpm = Number((await page.locator('.tap .target .value').innerText()).replace(/\D/g, ''));
  assert(bpm >= 60 && bpm <= 160, `Target ${bpm} is in the default range`);
  const before = await clicks();
  // Tap with Space at the target tempo, timed in the page so automation latency doesn't skew it.
  await page.locator('.pad').focus();
  await page.evaluate(async (interval) => {
    const pad = document.querySelector('.pad');
    for (let i = 0; i < 8; i++) {
      pad.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, interval));
    }
  }, 60000 / bpm);
  assert.equal(await clicks(), before, 'Taps make no sound');
  const verdict = page.locator('.tap .verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict.locator('.title')).toHaveText('On tempo');
  await page.getByRole('button', { name: 'Hear it' }).click();
  await expect.poll(clicks, { timeout: 8000 }).toBe(before + 8);
  await page.getByRole('button', { name: /Next tempo/ }).click();
  await expect(page.locator('.pad')).toBeVisible();
  await page.goto(`${url}#/history`);
  await expect(page.locator('.recent li').filter({ has: page.locator('strong', { hasText: /^Test tap$/ }) })).toHaveCount(1);
  await page.goto(`${url}#/settings`);
  await page.locator('label:has(input[name="tempo-target-style"][value="mark"])').click();
  console.log('  tap: silent taps scored against the target, hear it, next and history passed');
}

/** Drag, scroll and arrow keys all turn a wheel; returns once a reveal shows. */
async function turnAndLock(page, beforeLock = async () => {}) {
  const wheel = page.getByRole('slider', { name: /wheel/ });
  await expect(wheel).toHaveAttribute('aria-disabled', 'false', { timeout: 8000 });
  const box = await wheel.boundingBox();
  const before = Number(await wheel.getAttribute('aria-valuenow'));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 4 });
  await page.mouse.up();
  const dragged = Number(await wheel.getAttribute('aria-valuenow'));
  await page.mouse.wheel(0, 200);
  const scrolled = Number(await wheel.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  const keyed = Number(await wheel.getAttribute('aria-valuenow'));
  // Each turn moves the value unless it is pinned at an end of the range.
  assert(dragged !== before || dragged === 100, 'Dragging up turns the wheel');
  assert(scrolled !== dragged || scrolled === 0, 'Scrolling turns the wheel');
  assert(keyed !== scrolled || keyed === 100, 'Arrow keys turn the wheel');
  await beforeLock();
  await page.getByRole('button', { name: 'Lock in' }).click();
  await expect(page.locator('.reveal .verdict')).toBeVisible();
}

export async function verifyTune(page, url) {
  await page.goto(`${url}#/tune/pitch`);
  await page.getByRole('button', { name: 'Start round' }).click();
  await turnAndLock(page);
  await expect(page.getByRole('button', { name: /Compare again/ })).toBeVisible();

  await page.goto(`${url}#/tune/tempo`);
  await expect(page.getByRole('heading', { name: 'Tune', exact: true })).toBeVisible();
  await expect(page.locator('.mode')).toHaveText('Tempo');
  await expect(page.locator('.tempo-tune .target')).toContainText('your anchor tempo');
  const clicks = await countClicks(page);
  await page.getByRole('button', { name: 'Start round' }).click();
  // The scramble's uneven clicks, then the metronome.
  await expect(page.getByRole('slider', { name: /wheel/ })).toHaveAttribute('aria-disabled', 'false', { timeout: 8000 });
  const tuningFrom = await clicks();
  await page.waitForTimeout(1500);
  assert((await clicks()) - tuningFrom >= 1, 'The metronome clicks while tuning');
  // The tempo stays hidden while tuning.
  await expect(page.locator('.tempo-tune .tempo-mark')).toHaveCount(1);
  let locked = 0;
  await turnAndLock(page, async () => {
    // Let any beat already scheduled sound first.
    await page.waitForTimeout(150);
    locked = await clicks();
  });
  await expect(page.locator('.reveal .pct')).toHaveText(/^[+−]?\d+\.\d%$|^In range$/);
  await expect(page.locator('.reveal .detail .tempo-mark')).toHaveCount(2);
  // Lock in stops the metronome; the comparison plays 4 + 4 beats (and the metronome adds none).
  await page.waitForTimeout(1000);
  const settled = await clicks();
  assert(settled - locked >= 8 && settled - locked <= 9, `Expected the 8 comparison clicks, got ${settled - locked}`);
  await page.waitForTimeout(800);
  assert.equal(await clicks(), settled, 'Nothing clicks after the comparison');
  await page.getByRole('button', { name: /Next round/ }).click();
  await expect(page.getByRole('slider', { name: /wheel/ })).toBeVisible();
  await page.goto(`${url}#/history`);
  await expect(page.locator('.recent li').filter({ has: page.locator('strong', { hasText: /^Tune tempo$/ }) })).toHaveCount(1);
  console.log('  tune: pitch wheel drag/scroll/keys, tempo rounds with hidden tempo, compare, next and history passed');
}

export async function verifyIdentifyTempo(page, url) {
  await page.goto(`${url}#/identify/tempo`);
  await expect(page.locator('.mode')).toHaveText('Tempo');
  const clicks = await countClicks(page);
  const terms = page.getByRole('group', { name: 'Which tempo is it?' });
  // Nothing to judge until it has played.
  await expect(terms.getByRole('button').first()).toBeDisabled();
  const before = await clicks();
  await page.getByRole('button', { name: 'Play tempo' }).click();
  await expect.poll(clicks).toBe(before + 8);
  await terms.getByRole('button').first().click();
  await expect(page.locator('.feedback .verdict')).toBeVisible();
  await expect(page.locator('.feedback .detail')).toContainText('It was');
  // Next plays the new tempo straight away.
  const answered = await clicks();
  await page.getByRole('button', { name: /Next tempo/ }).click();
  await expect.poll(clicks).toBe(answered + 8);
  await expect(page.locator('.feedback .verdict')).toHaveCount(0);

  await page.goto(`${url}#/settings`);
  await page.locator('label:has(input[name="tempo-identify-answer"][value="number"])').click();
  await page.goto(`${url}#/identify/tempo`);
  await page.getByRole('button', { name: 'Play tempo' }).click();
  await page.getByRole('spinbutton', { name: /Your answer/ }).fill('100');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.locator('.feedback .detail')).toContainText('You said 100');
  await expect(page.locator('.feedback .meter')).toBeVisible();
  await page.goto(`${url}#/history`);
  await expect(page.locator('.recent li').filter({ has: page.locator('strong', { hasText: /^Identify tempo$/ }) })).toHaveCount(2);
  await page.goto(`${url}#/settings`);
  await page.locator('label:has(input[name="tempo-identify-answer"][value="term"])').click();
  console.log('  identify tempo: clicks before answering, term and number answers, autoplay on next and history passed');
}
