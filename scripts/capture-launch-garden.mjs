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

import { mkdirSync } from 'node:fs';
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

  // A frame that is nearly uniform is either the overlay, a black canvas, or a
  // camera pointed at nothing. Cheap to check, and it has caught all three.
  const stats = await page.evaluate(() => {
    const canvas = document.querySelector('#stage canvas');
    if (!canvas) return null;
    const probe = document.createElement('canvas');
    probe.width = 64; probe.height = 36;
    const context = probe.getContext('2d');
    context.drawImage(canvas, 0, 0, 64, 36);
    const { data } = context.getImageData(0, 0, 64, 36);
    let sum = 0; let min = 255; let max = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      sum += luma; min = Math.min(min, luma); max = Math.max(max, luma);
    }
    return { max, mean: sum / (data.length / 4), min };
  });
  if (stats) {
    const flat = stats.max - stats.min < 24 || stats.mean < 8;
    console.log(`${shot}: luma ${stats.min.toFixed(0)}..${stats.max.toFixed(0)} mean ${stats.mean.toFixed(0)}${flat ? '  <-- SUSPECT, frame is nearly uniform' : ''}`);
  }
}

if (messages.length > 0) console.log(`--- console ---\n${messages.slice(0, 40).join('\n')}`);
await browser.close();
console.log(`captures in ${OUT}`);
