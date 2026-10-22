import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifySinging(page, url) {
  await page.goto(`${url}#/settings`);
  // A known target makes scoring assertions independent of random question generation.
  for (const checkbox of await page.locator('.pcs input').all()) {
    if (await checkbox.getAttribute('aria-label') !== 'A' && await checkbox.isChecked()) await checkbox.uncheck();
  }
  await page.goto(`${url}#/sing-test`);
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    oscillator.frequency.value = 440;
    const gain = audio.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain);
    oscillator.start();
    globalThis.singCaptureTest = { audio, oscillator, gain, original };
    navigator.mediaDevices.getUserMedia = async () => {
      const destination = audio.createMediaStreamDestination();
      gain.connect(destination);
      globalThis.singCaptureTest.stream = destination.stream;
      await audio.resume();
      return destination.stream;
    };
  });
  const check = page.getByRole('button', { name: 'Check answer', exact: true });
  const progress = page.getByRole('progressbar', { name: 'Note capture progress', exact: true });
  const record = page.getByRole('button', { name: 'Re-record', exact: true });
  const setSound = (frequency, volume = 0.3) => page.evaluate(([frequency, volume]) => {
    const test = globalThis.singCaptureTest;
    test.oscillator.frequency.value = frequency;
    test.gain.gain.value = volume;
  }, [frequency, volume]);
  await expect(check).toBeDisabled();
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await setSound(440);
  await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(0);
  await expect(page.locator('.sing .meter')).toHaveCount(0);
  await expect(page.locator('.sing .verdict')).toHaveCount(0);
  await expect(page.getByText('Note locked', { exact: true })).toBeVisible();
  await expect(check).toBeEnabled();
  // Re-record before checking discards the capture without scoring it.
  await setSound(440, 0);
  await record.click();
  await expect(check).toBeDisabled();
  await expect(progress).toHaveAttribute('value', '0');
  await expect(page.getByText('Session 0/0', { exact: true })).toBeVisible();
  await setSound(261.6256);
  await expect(page.getByText('Note locked', { exact: true })).toBeVisible();
  // An incorrect pitch must lock just as readily. Later correct singing cannot replace it.
  await setSound(440);
  await page.waitForTimeout(2300); // Beyond the old two-second last-stable retention window.
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(check).toBeEnabled();
  await check.click();
  await expect(page.locator('.verdict')).toContainText('No match');
  await expect(page.locator('.detail')).toContainText('C4');
  await expect(page.getByText('Session 0/1', { exact: true })).toBeVisible();
  await expect(check).toBeDisabled();
  await record.click();
  await expect(page.getByText('Note locked', { exact: true })).toBeVisible();
  await check.click();
  await expect(page.locator('.verdict')).toContainText('Match');
  await expect(page.locator('.detail')).toContainText('A4');
  await expect(page.getByText('Session 0/1', { exact: true })).toBeVisible();
  // A new question must not reuse a locked answer, even with the microphone still running.
  await page.getByRole('button', { name: 'Next note', exact: false }).click();
  await expect(check).toBeDisabled();
  await expect(record).toHaveCount(0);
  // Practice keeps its live meter, sharing the detector but not the capture workflow.
  await page.goto(`${url}#/sing-practice`);
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(page.locator('.sing .meter .hint')).toContainText('On target');
  await expect(check).toHaveCount(0);
  await expect(progress).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.evaluate(async () => {
    const test = globalThis.singCaptureTest;
    navigator.mediaDevices.getUserMedia = test.original;
    await test.audio.close();
    delete globalThis.singCaptureTest;
  });
  await page.goto(`${url}#/settings`);
  await page.getByRole('button', { name: 'All 12 notes', exact: true }).click();
  await page.goto(`${url}#/history`);
  await expect(page.locator('.recent')).toContainText('C4');
  await expect(page.locator('.recent li').filter({ has: page.locator('strong', { hasText: /^Sing$/ }) })).toHaveCount(1);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => key.endsWith('history/v1'))), true);
  console.log('  singing: progress, target-independent locking, re-record, frozen scoring, retention, next-question reset and history passed');
}

export async function verifyLayout(page, url) {
  const original = page.viewportSize();
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${url}#/reference`);
    await expect(page.getByRole('region', { name: 'Match with your voice', exact: true })).toBeVisible();
    const boxes = await page.evaluate(() => {
      const box = (selector) => {
        const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
        return { x, y, width, height };
      };
      return { piano: box('.piano'), keyboard: box('.keyboard'), mic: box('[aria-label="Match with your voice"]'), library: box('.library'), width: document.documentElement.scrollWidth };
    });
    assert(boxes.mic.y >= boxes.keyboard.y + boxes.keyboard.height, 'Microphone must be below the piano');
    // Narrow layouts stack the pieces below; wide windows put them alongside the instrument.
    const beside = boxes.library.x >= boxes.keyboard.x + boxes.keyboard.width;
    assert(beside || boxes.library.y >= boxes.mic.y + boxes.mic.height, 'Library must be below or beside the instrument');
    if (viewport.width >= 1280) assert(beside, 'Wide windows show pieces alongside the piano');
    assert.equal(boxes.width, viewport.width, 'No horizontal overflow');
    if (viewport.width <= 600) assert(boxes.piano.width >= viewport.width - 40, 'Piano should use almost all mobile width');
    await expect(page.getByRole('button', { name: /Add to sequence|Play again|Play sequence/ })).toHaveCount(0);
    await expect(page.getByLabel('Choose a MIDI or JSON file')).toHaveCount(0);
    await expect(page.getByText('Paste a score', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Mixed/ })).toHaveCount(0);
    await expect(page.getByText('Keyboard shortcuts', { exact: false })).toHaveCount(0);
    await page.goto(`${url}#/import`);
    await expect(page.getByLabel('Choose a MIDI or JSON file')).toBeAttached();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
  }
  await page.goto(`${url}#/mixed`);
  await expect(page.getByRole('heading', { name: 'Identify', exact: true })).toBeVisible();
  await page.setViewportSize(original);
  console.log('  layout: piano then microphone, library below or alongside, mobile piano width, import separation and removed Mixed route passed');
}
