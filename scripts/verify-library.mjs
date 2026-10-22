import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import midiPackage from '@tonejs/midi';
import { readFile } from 'node:fs/promises';
const { Midi } = midiPackage;

export async function verifyLibrary(context, page, url) {
  await context.setOffline(false);
  await page.goto(`${url}#/reference`);
  await page.evaluate(() => {
    globalThis.pianoTestVoices = [];
    const originalStart = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) {
      this.pianoTestVoice = { starts: args, stops: [] };
      globalThis.pianoTestVoices.push(this.pianoTestVoice);
      return originalStart.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      this.pianoTestVoice?.stops.push(args);
      return originalStop.apply(this, args);
    };
    localStorage.setItem('unrelated-app:sentinel', 'keep me');
  });
  // Interrupting a reference sequence must not lose the held key's highlight.
  await page.locator('.piano button').first().click();
  await page.getByRole('button', { name: 'Add to sequence', exact: true }).click();
  await page.getByRole('button', { name: 'Play sequence', exact: true }).click();
  await page.keyboard.down('a');
  await expect(page.locator('.piano .playing')).toHaveCount(1);
  await page.keyboard.up('a');
  await expect(page.locator('.piano .playing')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.evaluate(() => { globalThis.pianoTestVoices = []; });
  // Computer-key chords: releasing keys must leave both reference tones ringing.
  await page.keyboard.down('a');
  await page.keyboard.down('d');
  await expect(page.locator('.piano .playing')).toHaveCount(2);
  await page.waitForFunction(() => globalThis.pianoTestVoices.length >= 2);
  assert.deepEqual(await page.evaluate(() => globalThis.pianoTestVoices.slice(-2).map((v) => v.stops.length)), [1, 1]);
  await page.keyboard.up('a');
  await expect(page.locator('.piano .playing')).toHaveCount(1);
  assert.deepEqual(await page.evaluate(() => globalThis.pianoTestVoices.slice(-2).map((v) => v.stops.length)), [1, 1]);
  await page.keyboard.up('d');
  await expect(page.locator('.piano .playing')).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => globalThis.pianoTestVoices.slice(-2).map((v) => v.stops.length)), [1, 1]);

  // Real multi-touch pointer events, including independent releases.
  await page.evaluate(() => { globalThis.pianoTestVoices = []; });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.locator('.piano').scrollIntoViewIfNeeded();
  const c = await page.locator('.piano button').nth(0).boundingBox();
  const e = await page.locator('.piano button').nth(4).boundingBox();
  const fingers = [c, e].map((box, i) => ({ x: box.x + box.width / 2, y: box.y + box.height * 0.8, id: i + 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers });
  await expect(page.locator('.piano .playing')).toHaveCount(2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: fingers.slice(1) });
  await expect(page.locator('.piano .playing')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.piano .playing')).toHaveCount(0);
  await page.waitForFunction(() => globalThis.pianoTestVoices.length >= 2);
  assert.deepEqual(await page.evaluate(() => globalThis.pianoTestVoices.slice(-2).map((v) => v.stops.length)), [1, 1]);

  const score = { version: 1, title: 'Saved chord 🎹', notes: [60, 64, 67].map((midi) => ({ midi, time: 0, duration: 2, velocity: 0.7 })) };
  await page.getByText('Paste a text score (JSON)', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Score JSON' }).fill(JSON.stringify(score));
  await page.getByRole('button', { name: 'Load text score', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue(score.title);
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: score.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play piece', exact: true }).click();
  await expect(page.locator('.piano .playing')).toHaveCount(3);
  await page.getByRole('button', { name: 'Stop piece', exact: true }).click();
  await expect(page.locator('.piano .playing')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export score', exact: true }).click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith('.json'));

  await page.getByRole('button', { name: 'Copy piece link', exact: true }).click();
  const shared = await page.getByRole('textbox', { name: 'Piece link', exact: true }).inputValue();
  assert(new URLSearchParams(new URL(shared).hash.split('?')[1]).has('p'));
  assert(shared.length < url.length + 120);
  await page.goto(shared);
  await expect(page.getByText('Loaded from link.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play piece', exact: true })).toBeVisible();
  await expect(page.locator('.piano .playing')).toHaveCount(0);
  // Existing self-contained JSON links remain readable.
  await page.goto(`${url}#/reference?score=${Buffer.from(JSON.stringify(score)).toString('base64url')}`);
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue(score.title);

  const midi = new Midi();
  midi.header.name = 'Imported MIDI chord';
  const track = midi.addTrack();
  for (const note of [60, 64, 67]) track.addNote({ midi: note, time: 0, duration: 1 });
  const bytes = Buffer.from(midi.toArray());
  const fileInput = page.getByLabel('Choose or drop a MIDI / JSON file');
  await fileInput.setInputFiles({ name: 'chord.mid', mimeType: 'audio/midi', buffer: bytes });
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue('Imported MIDI chord');
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Imported MIDI chord', exact: true })).toBeVisible();
  await page.goto(`${url}#/reference?midi=${bytes.toString('base64url')}`);
  await expect(page.getByText('Loaded from link.', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue('Imported MIDI chord');

  await page.evaluate((score) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(score)], 'dropped.json', { type: 'application/json' }));
    document.querySelector('.drop-zone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { ...score, title: 'Dropped JSON' });
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue('Dropped JSON');
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dropped JSON', exact: true })).toBeVisible();
  await page.goto(`${url}#/reference?score=INVALID!`);
  await expect(page.getByRole('alert')).toContainText('Invalid');

  await context.setOffline(true);
  await page.goto(`${url}#/reference`);
  await page.reload();
  await page.getByRole('button', { name: 'Imported MIDI chord', exact: true }).click();
  await page.getByRole('button', { name: 'Play piece', exact: true }).click();
  await expect(page.locator('.piano .playing')).toHaveCount(3);
  await page.getByRole('button', { name: 'Stop piece', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-app:sentinel')), 'keep me');

  // Two URL directories on the same origin have distinct libraries and settings.
  await context.setOffline(false);
  const sibling = await context.newPage();
  const otherUrl = url.replace(/\/(standard|portable)\/$/, url.includes('/standard/') ? '/portable/' : '/standard/');
  await sibling.goto(`${otherUrl}#/reference`);
  await expect(sibling.getByText('No saved pieces yet.', { exact: false })).toBeVisible();
  await sibling.goto(`${otherUrl}#/settings`);
  await expect(sibling.getByLabel('Lowest octave')).toHaveValue('3');
  await sibling.close();
  await page.getByRole('button', { name: 'Delete Dropped JSON', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dropped JSON', exact: true })).toHaveCount(0);
  await verifyExamples(context, page, url);
  await verifyReferenceVoice(page, url);
  console.log('  music: keyboard and touch chords, text/MIDI/drop imports, links, IndexedDB, offline saves and same-origin path isolation passed');
}

async function verifyReferenceVoice(page, url) {
  await page.goto(`${url}#/reference`);
  await page.reload();
  // Feed a real audio stream through the production detector without needing hardware.
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const destination = audio.createMediaStreamDestination();
    oscillator.frequency.value = 440;
    oscillator.connect(destination);
    oscillator.start();
    navigator.mediaDevices.getUserMedia = async () => {
      await audio.resume();
      return destination.stream;
    };
    globalThis.referenceMicTest = { audio, oscillator, stream: destination.stream, original };
  });
  const voice = page.getByRole('region', { name: 'Match with your voice', exact: true });
  await expect(page.getByRole('button', { name: 'Next note', exact: false })).toHaveCount(0);
  await expect(page.getByRole('group', { name: /^Target note:/ })).toHaveCount(0);
  await voice.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(voice.getByText('Microphone on', { exact: true })).toBeVisible();
  await expect(voice.locator('.detected .note')).toHaveText('A4');
  await expect(voice.getByText('Select a piano key to match', { exact: true })).toBeVisible();
  await page.locator('.piano button').nth(9).click();
  await expect(voice.locator('.hint')).toContainText('On target');
  await page.locator('.piano button').first().click();
  await expect(voice.locator('.hint')).toContainText('Sing higher');
  await page.evaluate(() => { globalThis.referenceMicTest.oscillator.frequency.value = 261.6256; });
  await expect(voice.locator('.hint')).toContainText('On target');
  await voice.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(voice.getByRole('button', { name: 'Start microphone', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => globalThis.referenceMicTest.stream.getAudioTracks()[0].readyState), 'ended');
  // Leaving Reference must also release the microphone, even while it is running.
  await page.evaluate(() => {
    const test = globalThis.referenceMicTest;
    const destination = test.audio.createMediaStreamDestination();
    test.oscillator.connect(destination);
    test.stream = destination.stream;
    navigator.mediaDevices.getUserMedia = async () => test.stream;
  });
  await voice.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(voice.getByText('Microphone on', { exact: true })).toBeVisible();
  await page.goto(`${url}#/settings`);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.referenceMicTest.stream.getAudioTracks()[0].readyState)).toBe('ended');
  await page.evaluate(async () => {
    const test = globalThis.referenceMicTest;
    navigator.mediaDevices.getUserMedia = test.original;
    await test.audio.close();
    delete globalThis.referenceMicTest;
  });
  console.log('  reference voice: live detection, selected-note matching, stop and navigation cleanup passed');
}

async function verifyExamples(context, page, url) {
  // Built-ins are bundled, not fetched from an external MIDI host.
  await context.setOffline(true);
  await page.goto(`${url}#/reference`);
  await page.reload();
  const examples = [
    'C major scale', 'A natural minor scale', 'C major pentatonic scale', 'A minor pentatonic scale',
    'Chromatic scale', 'Octave leaps',
    'Ode to Joy — opening theme', 'Twinkle, Twinkle, Little Star', 'Frère Jacques — two-voice round',
  ];
  for (const title of examples) {
    const browse = page.getByText('Browse examples', { exact: true });
    if (!await page.getByRole('button', { name: `Load ${title}`, exact: true }).isVisible()) await browse.click();
    await page.getByRole('button', { name: `Load ${title}`, exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue(title);
    await page.getByRole('button', { name: 'Play piece', exact: true }).click();
    await expect.poll(() => page.locator('.piano .playing').count()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop piece', exact: true }).click();
  }
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download MIDI', exact: true }).click();
  const download = await downloaded;
  assert(download.suggestedFilename().endsWith('.mid'));
  const bytes = await readFile(await download.path());
  const midi = new Midi(bytes);
  assert.equal(midi.tracks.reduce((sum, track) => sum + track.notes.length, 0), 64);
  await page.getByLabel('Choose or drop a MIDI / JSON file').setInputFiles({ name: 'round.mid', mimeType: 'audio/midi', buffer: bytes });
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue('Frère Jacques — two-voice round');
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Frère Jacques — two-voice round', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Frère Jacques — two-voice round', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Frère Jacques — two-voice round', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load Frère Jacques — two-voice round', exact: true })).toBeVisible();
  await page.goto(`${url}#/reference?example=chromatic-scale`);
  await expect(page.getByRole('textbox', { name: 'Piece title', exact: true })).toHaveValue('Chromatic scale');
  await page.getByRole('button', { name: 'Copy piece link', exact: true }).click();
  const exampleLink = await page.getByRole('textbox', { name: 'Piece link', exact: true }).inputValue();
  assert.equal(new URL(exampleLink).hash, '#/reference?example=chromatic-scale');
  await page.getByRole('textbox', { name: 'Piece title', exact: true }).fill('My chromatic exercise');
  await page.getByRole('button', { name: 'Copy piece link', exact: true }).click();
  const customLink = await page.getByRole('textbox', { name: 'Piece link', exact: true }).inputValue();
  assert(new URL(customLink).hash.startsWith('#/reference?p='));
  await expect(page.getByRole('button', { name: 'Play piece', exact: true })).toBeVisible();
  await page.goto(`${url}#/reference?example=missing`);
  await expect(page.getByRole('alert')).toContainText('Unknown built-in MIDI example');
  await context.setOffline(false);
  console.log(`  examples: all ${examples.length} play offline, MIDI download/re-import, save/delete copies and stable example links passed`);
}

export async function verifyStorageFallback(browser, origin) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined });
    if (!localStorage.getItem('fallback-seeded')) {
      localStorage.setItem('pitch-training:settings/v1', JSON.stringify({ playbackOctaveMin: 2, playbackOctaveMax: 2 }));
      localStorage.setItem('unrelated-app:sentinel', 'keep me');
      localStorage.setItem('fallback-seeded', 'yes');
    }
  });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/standard/#/settings`);
    await expect(page.getByLabel('Lowest octave')).toHaveValue('2');
    await page.getByLabel('Lowest octave').selectOption('5');
    await page.reload();
    await expect(page.getByLabel('Lowest octave')).toHaveValue('5');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pitch-training:settings/v1')).playbackOctaveMin), 2);
    await page.goto(`${origin}/standard/#/reference`);
    await page.getByText('Paste a text score (JSON)', { exact: true }).click();
    await page.getByRole('button', { name: 'Load text score', exact: true }).click();
    await page.getByRole('button', { name: 'Save to library', exact: true }).click();
    await expect(page.getByRole('button', { name: 'C major chord', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'C major chord', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-app:sentinel')), 'keep me');
    console.log('localStorage fallback: save/reload and one-time legacy settings migration passed');
  } finally { await context.close(); }
}
