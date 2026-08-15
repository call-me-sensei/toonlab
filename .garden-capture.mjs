import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outDir = process.env.OUT || new URL('../launch-plan/review/captures/trees/', import.meta.url).pathname;
const baseUrl = process.env.URL || 'http://127.0.0.1:5199';
const width = Number(process.env.W || 1600);
const height = Number(process.env.H || 1000);
const shots = JSON.parse(process.env.SHOTS);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });

for (const shot of shots) {
  const query = new URLSearchParams({ hud: '0', ...shot.query }).toString();
  const url = `${baseUrl}/labs/tree-gate1/?${query}`;
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 45000 });
  } catch {
    console.error('TIMEOUT', shot.name, url);
    await page.screenshot({ path: `${outDir}/FAIL-${shot.name}.png` });
    continue;
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  console.log('captured', shot.name);
}
await browser.close();
