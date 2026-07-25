// Verdant-world visual capture — the parity harness for the outdoor quality
// bar. Each shot pins the camera (?cam=) so captures line up run-to-run and
// against the ToonLab reference screenshots. LOOK at the images; that is the
// point.
//
// Usage:
//   BASE_URL=http://localhost:5199 OUT_DIR=/tmp/verdant-caps node scripts/capture-verdant-world.mjs

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = process.env.OUT_DIR ?? '/tmp/verdant-caps';
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // Third-person spawn framing — the everyday gameplay view.
  { name: 'spawn-explore', query: '' },
  // Meadow vista from a low aerial: ground/grass blending reads or fails here.
  { name: 'meadow-vista', query: 'camrel=-90,45,120,0,5,0' },
  // Close ground contact: path edges, rock bases, grass roots.
  { name: 'ground-contact', query: 'camrel=10,5,14,0,1,0' },
  // Ground-field color target billboarded near spawn (pass sanity).
  { name: 'ground-debug', query: 'groundDebug=1&camrel=0,18,32,0,16,-20' },
];

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});
const page = await browser.newPage({ viewport: { height: 800, width: 1280 } });
const messages = [];
page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.message}`));

for (const shot of SHOTS) {
  await page.goto(`${BASE}/examples/verdant-world/?dpr=1&${shot.query}`, { waitUntil: 'domcontentloaded' });
  // waitForFunction(fn, ARG, options) — the options object must be the THIRD
  // argument or Playwright treats it as the page-function arg and applies
  // the 30s default timeout.
  await page.waitForFunction(
    () => document.body.dataset.worldReady === 'true',
    null,
    { timeout: 240000 },
  );
  // Cold WebGPU pipeline compilation stalls the first seconds of the loop —
  // wait for real rendered frames, not wall time.
  await page.waitForFunction(
    () => Number(document.body.dataset.frames ?? 0) > 120,
    null,
    { timeout: 240000 },
  );
  await page.waitForTimeout(600); // let the grass follow-window finish filling
  const info = await page.evaluate(() => ({
    backend: document.body.dataset.rendererBackend,
    groundField: document.body.dataset.groundFieldReady,
    ready: document.body.dataset.worldReady,
  }));
  console.log(`${shot.name}:`, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
}

if (messages.length > 0) console.log(messages.slice(0, 20).join('\n'));
await browser.close();
console.log(`captures in ${OUT}`);
