// Pixel-identity proof for the §11 shader wipe, plus the Gate 3 captures.
//
//   node scripts/verify-style-comparison.mjs
//   WIPE_URL=http://localhost:5199 WIPE_OUT=/tmp/wipe node scripts/verify-style-comparison.mjs
//
// What it proves, per shot:
//
//   1. split=0 is bit-identical to a full-frame render of the ToonLab variant.
//   2. split=1 is bit-identical to a full-frame render of the neutral variant.
//   3. At 0.25 / 0.5 / 0.75 the scissored region is bit-identical to the SAME
//      region of the neutral full frame, and the region outside it is
//      bit-identical to the same region of the ToonLab full frame. A pixel at
//      (x, y) in the wipe equals that pixel in a full-frame render of its own
//      variant — only possible if both halves share one camera and one framing.
//   4. Camera matrices, light transforms, exposure, tone mapping, shadow state
//      and every animation clock are unchanged by the composite render.
//   5. Every pixel that differs between the halves lies inside the region the
//      tracked subject affects, measured by rendering with the subject hidden.
//      Nothing outside the intended material treatment moved.
//   6. Both variants hold the same geometry buffer, skeleton and morph
//      influences on every tracked node.
//
// The assertions live in `src/renderer/styleComparison.js`
// (`verifyStyleComparisonIdentity`) so the filler register's equivalence test
// can call them directly instead of re-deriving them from a screenshot.
//
// Requires the Vite dev server (`npm run dev`, port 5199).

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.WIPE_URL || 'http://localhost:5199';
const outDir = process.env.WIPE_OUT
  || new URL('../../launch-plan/review/captures/wipe/', import.meta.url).pathname;
const width = Number(process.env.WIPE_WIDTH || 1920);
const height = Number(process.env.WIPE_HEIGHT || 1080);
const proofWidth = Number(process.env.WIPE_PROOF_WIDTH || 480);
const proofHeight = Number(process.env.WIPE_PROOF_HEIGHT || 270);

const shots = ['S02', 'S07'];
const splits = [0, 25, 50, 75, 100];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal'],
  headless: true,
});
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });

const consoleIssues = [];
page.on('pageerror', (error) => consoleIssues.push(`pageerror: ${String(error).slice(0, 300)}`));
page.on('console', (message) => {
  if (message.type() === 'error') consoleIssues.push(`console.error: ${message.text().slice(0, 300)}`);
});

const manifest = { captures: [], consoleIssues, proofs: [] };
let failed = false;

for (const shot of shots) {
  // --- Gate 3 captures -----------------------------------------------------
  for (const split of splits) {
    const url = `${baseUrl}/labs/launch-world/wipe/?shot=${shot}&split=${split}&hud=0`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.wipeReady === 'true', { timeout: 180000 });
    await page.waitForTimeout(600);
    const name = `${shot}-split-${String(split).padStart(3, '0')}`;
    await page.screenshot({ path: `${outDir}/${name}.png` });
    manifest.captures.push({
      backend: await page.evaluate(() => document.body.dataset.rendererBackend),
      file: `${name}.png`,
      shot: JSON.parse(await page.evaluate(() => document.body.dataset.shotReport)),
      split,
      url,
      wipe: JSON.parse(await page.evaluate(() => document.body.dataset.wipeReport)),
    });
    console.log(`captured ${name}`);
  }

  // --- pixel-identity proof ------------------------------------------------
  await page.goto(`${baseUrl}/labs/launch-world/wipe/?shot=${shot}&hud=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.wipeReady === 'true', { timeout: 180000 });
  await page.waitForTimeout(800);
  await page.evaluate(([w, h]) => {
    globalThis.__PROOF = null;
    globalThis.__TOONLAB_LAUNCH_WIPE
      .verify({ height: h, width: w })
      .then((result) => { globalThis.__PROOF = result; },
        (error) => { globalThis.__PROOF = { error: String(error?.stack ?? error).slice(0, 2000), ok: false }; });
  }, [proofWidth, proofHeight]);
  const proof = await page.waitForFunction(() => globalThis.__PROOF, null, { timeout: 300000 })
    .then((handle) => handle.jsonValue());

  manifest.proofs.push({ ...proof, shot });
  const failures = (proof.checks ?? []).filter((check) => !check.ok);
  if (!proof.ok) failed = true;
  console.log(`\n${shot} pixel-identity proof: ${proof.ok ? 'PASS' : 'FAIL'}`);
  for (const check of proof.checks ?? []) {
    const detail = check.differingPixels === undefined
      ? (check.differences ?? []).join('; ')
      : `${check.differingPixels} differing px (max channel delta ${check.maxChannelDelta ?? 0})`;
    console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.id.padEnd(34)} ${detail}`);
  }
  if (proof.error) console.log(`  error: ${proof.error}`);
  if (failures.length) console.log(`  ${failures.length} failing check(s)`);
}

await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();

console.log(`\n${manifest.captures.length} captures + manifest.json in ${outDir}`);
if (consoleIssues.length) {
  console.log(`\nConsole issues (${consoleIssues.length}):`);
  for (const issue of consoleIssues.slice(0, 20)) console.log(`  ${issue}`);
  failed = true;
}
if (failed) {
  console.error('\nStyle-comparison verification FAILED.');
  process.exitCode = 1;
} else {
  console.log('\nStyle-comparison verification passed.');
}
