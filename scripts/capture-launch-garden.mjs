// Stillwater Garden review captures. Retargeted from capture-launch-coast.mjs.
//
//   SHOTS=hero,pond,cascade node scripts/capture-launch-garden.mjs
//   W=3840 H=2160 OUT=launch-plan/review/captures node scripts/capture-launch-garden.mjs
//
// Keeps the coast harness's two hard-won guards:
//   D19-067  strips <vite-error-overlay>, because several agents share one dev
//            server and a neighbour's syntax error otherwise gets recorded as
//            this scene while readiness still reports true;
//   plus a frame-darkness check, so a capture that IS the overlay (or a black
//   canvas) is reported rather than filed.

import { mkdirSync, statSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = process.env.OUT_DIR ?? process.env.OUT ?? '/tmp/garden-caps';
const SHOTS = (process.env.SHOTS ?? 'hero').split(',');
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 900);
const PREFIX = process.env.PREFIX ?? '';
mkdirSync(OUT, { recursive: true });

// WebGPU needs the full Chromium build, never chrome-headless-shell. Point at
// an installed Playwright browser explicitly when the pinned revision differs.
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { height: H, width: W } });
const messages = [];
page.on('console', (m) => {
  if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.stack ?? e.message}`));

for (const shot of SHOTS) {
  const t0 = Date.now();
  const url = `${BASE}/labs/launch-world/garden/?shot=${shot}${process.env.EXTRA ?? ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      () => document.body.dataset.gardenReady === 'true' || document.body.dataset.gardenError,
      null,
      { timeout: 420_000 },
    );
  } catch {
    console.log(`${shot}: TIMEOUT`, JSON.stringify(await page.evaluate(() => ({ ...document.body.dataset }))));
    await page.screenshot({ path: `${OUT}/${PREFIX}${shot}-timeout.png` });
    continue;
  }
  await page.waitForFunction(
    () => Number(document.body.dataset.gardenFrames ?? 0) > 260,
    null,
    { timeout: 420_000 },
  );
  await page.waitForTimeout(1_200);

  // D19-067. A shared dev server pops a full-screen overlay on every page it
  // serves when ANY lab fails to compile; strip it before the shutter.
  const hadOverlay = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('vite-error-overlay')];
    for (const node of nodes) node.remove();
    return nodes.length > 0;
  });
  if (hadOverlay) console.log(`${shot}: WARNING — a vite error overlay was stripped before capture.`);

  const info = await page.evaluate(() => ({ ...document.body.dataset }));
  console.log(`${shot} (${((Date.now() - t0) / 1000).toFixed(1)}s):`, JSON.stringify(info));
  const path = `${OUT}/${PREFIX}${shot}.png`;
  await page.screenshot({ path });

  // A frame that is nearly uniform compresses to almost nothing. Reading the
  // WebGPU canvas back through a 2D context does NOT work (there is no
  // preserved drawing buffer, so it reports pure black on a perfectly good
  // frame and cries wolf on every capture); the PNG's own size is the honest
  // signal, and it catches the overlay, a black canvas and a camera pointed at
  // nothing alike.
  const bytes = statSync(path).size;
  console.log(`${shot}: ${(bytes / 1024).toFixed(0)} KB${bytes < 40_000 ? '  <-- SUSPECT, frame is nearly uniform' : ''}`);
}

if (messages.length > 0) console.log(`--- console ---\n${messages.slice(0, 40).join('\n')}`);
await browser.close();
console.log(`captures in ${OUT}`);
