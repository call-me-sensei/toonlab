// Headless smoke for the standalone Water Lab: boots the lab on WebGPU and
// the WebGL fallback, asserts the probe dataset contract, then drives the
// "Preview in scene" handoff into the playground and asserts the settings
// (preset + color tone) actually flowed.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5177';
const SHOT_DIR = process.argv[3] ?? '.';

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'],
});

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function bootPage(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.modelReady === 'true' || document.body.dataset.modelReady === 'error',
    { timeout: 90000 },
  ).catch(() => {});
  // HMR/settle guard: give the page a beat, then re-read the dataset fresh.
  await page.waitForTimeout(2500);
  const dataset = await page.evaluate(() => ({ ...document.body.dataset }));
  return { dataset, errors, page };
}

// --- 1. WebGPU boot ---------------------------------------------------------
{
  const { dataset, errors, page } = await bootPage(`${BASE}/water-lab/`);
  check('webgpu: modelReady', dataset.modelReady === 'true', JSON.stringify(dataset));
  check('webgpu: scene dataset', dataset.scene === 'water-lab');
  check('webgpu: water dataset mirrored', dataset.waterMode === 'lake' && dataset.waterTone === 'classic' && Boolean(dataset.waterLevel));
  check('webgpu: stage dataset mirrored', dataset.waterStage === 'shore', dataset.waterStage);
  check('webgpu: backend reported', ['webgpu', 'webgl2-fallback'].includes(dataset.rendererBackend), dataset.rendererBackend);
  console.log(`     backend: ${dataset.rendererBackend}`);
  check('webgpu: UI ready', dataset.uiReady === 'true');
  check('webgpu: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  const groups = await page.evaluate(() => document.querySelectorAll('[data-testid^="group-"]').length);
  check('webgpu: 7 schema groups + stage section render', groups === 8, String(groups));
  const fields = await page.evaluate(() => document.querySelectorAll('.tk-field').length);
  check('webgpu: full schema surfaced (≥ 70 field rows)', fields >= 70, String(fields));
  await page.screenshot({ path: `${SHOT_DIR}/water-lab-webgpu.png`, timeout: 10000 }).catch(() => {});
  await page.close();
}

// --- 2. WebGL fallback boot ---------------------------------------------------
{
  const { dataset, errors, page } = await bootPage(`${BASE}/water-lab/?renderer=webgl`);
  check('webgl: modelReady', dataset.modelReady === 'true', JSON.stringify(dataset));
  check('webgl: forced fallback backend', dataset.rendererBackend === 'webgl2-fallback', dataset.rendererBackend);
  check('webgl: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.screenshot({ path: `${SHOT_DIR}/water-lab-webgl.png`, timeout: 10000 }).catch(() => {});
  await page.close();
}

// --- 3. Preview-in-scene handoff (call_me_sensei: anime tone flows through) -----
{
  const { dataset, page } = await bootPage(`${BASE}/water-lab/?waterPreset=call_me_sensei`);
  check('handoff: lab boots the call_me_sensei preset', dataset.waterTone === 'anime', dataset.waterTone);
  await page.click('[data-testid="preview-scene"]');
  await page.waitForURL('**/playground/**', { timeout: 30000 });
  await page.waitForFunction(
    () => document.body.dataset.waterReady === 'true' || document.body.dataset.modelReady === 'error',
    { timeout: 120000 },
  ).catch(() => {});
  await page.waitForTimeout(2500);
  const play = await page.evaluate(() => ({ ...document.body.dataset }));
  check('handoff: playground water ready', play.waterReady === 'true', JSON.stringify(play).slice(0, 300));
  check('handoff: color tone flowed into the preview', play.waterTone === 'anime', play.waterTone);
  check('handoff: preset flowed into the preview', play.waterMode === 'call_me_sensei', play.waterMode);
  await page.screenshot({ path: `${SHOT_DIR}/water-preview-scene.png`, timeout: 10000 }).catch(() => {});
  await page.close();
}

await browser.close();
if (failures > 0) {
  console.error(`\nprobe-water-lab: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nprobe-water-lab: all checks passed');
