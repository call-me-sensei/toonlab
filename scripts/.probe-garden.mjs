import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu','--enable-gpu'], headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/labs/launch-world/garden/?tex=512&grass=4000&ui=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.gardenReady === 'true' || document.body.dataset.gardenError, null, { timeout: 300000 });
const out = await page.evaluate(() => {
  const w = globalThis.stillwaterGarden;
  const grass = w.grassFields.map(({ field, role }) => ({
    id: role.id,
    n: field.placements.length,
    h: field.settings.bladeHeightRange,
    wdt: field.settings.bladeWidthRange,
    blades: field.settings.bladesPerClump,
    r: field.settings.clumpRadius,
    base: field.settings.baseColor, tip: field.settings.tipColor,
    scale: field.scale.toArray(),
    geoR: +(field.lodMeshes[0].geometry.boundingSphere?.radius ?? -1).toFixed(3), bladeCount: field.lodMeshes[0].geometry.userData?.grassClump?.bladeCount,
    adopt: field.settings.groundAdoptStrength, washLift: field.settings.washLift, washOpacity: field.settings.washOpacity,
  }));
  const trees = w.trees.group.children.slice(0, 40).map((t) => ({

    shape: t.branchTreeSettings?.leaves?.shape, cluster: t.branchTreeSettings?.leaves?.cluster?.architecture, lvl: t.branchTreeSettings?.branches?.levels, sz: t.branchTreeSettings?.size, leafCards: (()=>{let n=0;t.traverse(o=>{if(o.isMesh&&o!==t.trunkMesh)n+=(o.geometry?.index?.count??0)/3;});return n;})(),
    y: +t.position.y.toFixed(2),
    s: +t.scale.x.toFixed(2),
  }));
  const shapes = {};
  for (const t of trees) shapes[`${t.shape}/${t.cluster}/L${t.lvl}`] = (shapes[`${t.shape}/${t.cluster}/L${t.lvl}`] ?? 0) + 1;
  const groundMat = w.ground.material;
  return {
    grass,
    treeShapes: shapes,
    treeSample: trees.slice(0, 3),
    groundLayers: w.groundLayers.map(l => ({ role: l.role, tile: l.worldTile, tex: !!l.texture, img: l.texture?.image?.width })),
    groundProjection: w.ground.userData?.groundShaderSettings?.projection ?? Object.keys(groundMat.userData ?? {}),
    cloud: (() => { const c = w.sky?.clouds; if (!c) return 'no clouds obj'; return { keys: Object.keys(c).slice(0,25), enabled: c.enabled, shape: c.shape, wind: c.wind }; })(),
    skyKeys: Object.keys(w.sky).slice(0,40),
    fogNear: w.fog.near, fogFar: w.fog.far,
    sunDir: (() => { let l=null; w.scene.traverse(o=>{if(o.isDirectionalLight) l=o;}); return l ? l.position.toArray().map(v=>+v.toFixed(2)) : null; })(),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
