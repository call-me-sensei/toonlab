// Quick smoke: the Pro-mounted Landscape Lab at /labs/landscape boots,
// sculpts, and reports no page errors.
import { chromium } from 'playwright';

const SHOT_DIR = process.argv[2] ?? '.';
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text().split('\n')[0];
  // Signed-out probe: the /api/my-prop-assets capability check 401s by
  // design (the lab hides the library UI and continues with built-ins).
  if (text.includes('401')) return;
  errors.push(text);
});
await page.goto('http://localhost:5180/labs/landscape', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => document.body.dataset.modelReady === 'true' || document.body.dataset.modelReady === 'error',
  { timeout: 120000 },
).catch(() => {});
await page.waitForTimeout(2500);
const dataset = await page.evaluate(() => ({ ...document.body.dataset }));
console.log('modelReady:', dataset.modelReady, '| uiReady:', dataset.uiReady, '| backend:', dataset.rendererBackend);
const sculpt = await page.evaluate(async () => {
  const { engine, store } = window.__landscapeLab;
  const before = store.getDocument().field.heightAt(0, 0);
  await engine.runBrushStrokeForTest(
    Array.from({ length: 10 }, (_, i) => ({ x: i - 5, z: 0 })), 'raise',
  );
  return { before, after: store.getDocument().field.heightAt(0, 0) };
});
console.log('sculpt:', JSON.stringify(sculpt));
console.log('page errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
await page.screenshot({ path: `${SHOT_DIR}/landscape-lab-pro.png` }).catch(() => {});
await browser.close();
const ok = dataset.modelReady === 'true' && dataset.uiReady === 'true' && sculpt.after > sculpt.before && errors.length === 0;
console.log(ok ? 'PRO PROBE OK' : 'PRO PROBE FAILED');
process.exit(ok ? 0 : 1);
