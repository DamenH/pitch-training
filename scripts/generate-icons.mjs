import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/icon.svg', root), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
});

async function render(name, size, maskable = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{box-sizing:border-box}html,body,svg{width:100%;height:100%;margin:0;display:block}</style>${source}`);
  if (maskable) await page.locator('#background').evaluate((element) => element.setAttribute('rx', '0'));
  const { center, expectedCenter } = await page.locator('g').evaluate((mark) => {
    const bounds = mark.getBBox();
    const svg = mark.ownerSVGElement;
    if (!svg) throw new Error('Icon mark is not inside an SVG');
    const actual = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).matrixTransform(mark.getScreenCTM());
    const expected = new DOMPoint(32, 32).matrixTransform(svg.getScreenCTM());
    return { center: { x: actual.x, y: actual.y }, expectedCenter: { x: expected.x, y: expected.y } };
  });
  const tolerance = size * 0.75 / 64;
  if (Math.abs(center.x - expectedCenter.x) > tolerance || Math.abs(center.y - expectedCenter.y) > tolerance) {
    throw new Error(`Icon mark is off-center at (${center.x.toFixed(2)}, ${center.y.toFixed(2)})`);
  }
  await page.locator('svg').screenshot({ path: new URL(`public/${name}`, root).pathname, omitBackground: true });
  await page.close();
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, true);
await render('apple-touch-icon.png', 180, true);
await browser.close();
