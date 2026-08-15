// Captures the Gate 1 evidence for the Stillwater Garden trees and planting.
//
//   node scripts/capture-tree-gate1.mjs
//   TREE_GATE1_OUT=/tmp/g1 TREE_GATE1_URL=http://127.0.0.1:5199 \
//     node scripts/capture-tree-gate1.mjs
//
// Gate 1 wants, per asset: a hero read, the 85 mm close read the launch video
// actually uses, bark at 85 mm, and a ground-contact proof. It also wants the
// question "do these read as distinct trees" answered in one frame, and the
// two new bark generators and two new leaf organs reviewable flat rather than
// only wrapped around a trunk.
//
// Requires the Vite dev server. Waits on the lab's `modelReady` contract so a
// capture can never race the build.

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import {
  GARDEN_SHRUBS,
  GARDEN_TREES,
} from '../labs/shared/stillwaterGardenTrees.js';

const outDir = process.env.TREE_GATE1_OUT
  || new URL('../../launch-plan/review/captures/trees/', import.meta.url).pathname;
const baseUrl = process.env.TREE_GATE1_URL || 'http://127.0.0.1:5199';
const width = Number(process.env.TREE_GATE1_WIDTH || 1600);
const height = Number(process.env.TREE_GATE1_HEIGHT || 1000);

const shots = [
  // The two new bark tiles and the two new leaf organs, flat, beside the
  // shipped profiles they have to sit alongside.
  { name: 'swatches', query: { view: 'swatch' } },
  // Every variant in one frame: the distinctness question, and the §2 colour
  // structure question — one saturated accent against a deep-green field.
  { name: 'stand', query: { view: 'stand' } },
];

for (const family of ['GDN-MAPLE-HERO', 'GDN-PINE-MASS', 'GDN-SHRUB']) {
  shots.push({ name: `family-${family}`, query: { view: 'family', family } });
}

for (const entry of [...GARDEN_TREES, ...GARDEN_SHRUBS]) {
  shots.push({ name: `${entry.id}-hero`, query: { view: 'hero', asset: entry.id } });
  shots.push({ name: `${entry.id}-detail-85mm`, query: { view: 'detail', asset: entry.id } });
  shots.push({ name: `${entry.id}-contact`, query: { view: 'contact', asset: entry.id } });
  if (entry.engine !== 'stylized-bush') {
    shots.push({ name: `${entry.id}-trunk-85mm`, query: { view: 'trunk', asset: entry.id } });
  }
}

// The foreground-occluder read of §2 band 1: looking up through the hero maple.
shots.push({ name: 'GDN-MAPLE-HERO-V1-under', query: { view: 'under', asset: 'GDN-MAPLE-HERO-V1' } });

// A/B evidence for the two shader findings this pass landed.
shots.push({
  name: 'ab-styleColorStrength-1-shipped-preset',
  query: { view: 'hero', asset: 'GDN-MAPLE-HERO-V1', scs: '1' },
});
shots.push({
  name: 'ab-styleColorStrength-0.35-garden',
  query: { view: 'hero', asset: 'GDN-MAPLE-HERO-V1' },
});
shots.push({
  name: 'ab-neutral-shader',
  query: { view: 'hero', asset: 'GDN-MAPLE-HERO-V1', shader: 'neutral' },
});

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.error('PAGE ERROR', error.message));

const reports = [];
for (const shot of shots) {
  const query = new URLSearchParams({ hud: '0', ...shot.query }).toString();
  const url = `${baseUrl}/labs/tree-gate1/?${query}`;
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 60000 });
  } catch {
    console.error('TIMEOUT', shot.name, url);
    continue;
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  reports.push({
    name: shot.name,
    report: JSON.parse(await page.evaluate(() => document.body.dataset.treeReport)),
    url,
  });
  console.log('captured', shot.name);
}
await browser.close();
await writeFile(`${outDir}/capture-manifest.json`, `${JSON.stringify(reports, null, 2)}\n`);
console.log(`\n${reports.length} captures + manifest in ${outDir}`);
