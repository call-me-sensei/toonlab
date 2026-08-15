import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:5199/labs/tree-gate1/?view=hero&asset=GDN-PINE-MASS-V1', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 45000 });
console.log(JSON.stringify(await page.evaluate(() => window.__treeDebug()), null, 1));
await browser.close();
