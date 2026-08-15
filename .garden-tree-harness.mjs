// Headless BranchTree measurement harness — Stillwater Garden trees.
// Stubs the 2D canvas the leaf sprite painter needs (the sprite is an alpha
// texture and never participates in geometry), builds a tree, and measures.

const noopCtx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'canvas') return { width: 1, height: 1 };
    if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth'
      || prop === 'globalCompositeOperation' || prop === 'lineCap'
      || prop === 'globalAlpha' || prop === 'filter' || prop === 'font') return '';
    return () => {};
  },
  set() { return true; },
});

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 1,
        height: 1,
        getContext: () => noopCtx,
        toDataURL: () => 'data:image/png;base64,',
        addEventListener() {},
        removeEventListener() {},
      };
    },
    createElementNS(_ns, tag) { return globalThis.document.createElement(tag); },
  };
}
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
}

import * as THREE from 'three';
import { createHash } from 'node:crypto';

import {
  createBranchTree,
  createBranchTreeRecipe,
  createBranchTreeSettings,
  createBranchTreeDocument,
  parseBranchTreeDocument,
} from './src/vegetation/branchTree.js';
import { compileTreeLodLevels } from './src/vegetation/treeLodCompiler.js';

export { THREE, createBranchTree, createBranchTreeRecipe, createBranchTreeSettings, createBranchTreeDocument, parseBranchTreeDocument, compileTreeLodLevels };

function triangleCount(geometry) {
  if (!geometry) return 0;
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

export function geometryDigest(tree) {
  const hash = createHash('sha256');
  for (const mesh of [tree.trunkMesh, tree.canopyMesh]) {
    const geometry = mesh?.geometry;
    if (!geometry) continue;
    hash.update(Buffer.from(geometry.attributes.position.array.buffer.slice(0)));
    if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer.slice(0)));
  }
  return hash.digest('hex');
}

export function measure(settingsInput, { instanceScale = 1 } = {}) {
  const settings = createBranchTreeSettings(settingsInput);
  const tree = createBranchTree(settings);
  tree.updateMatrixWorld(true);

  const trunkGeo = tree.trunkMesh?.geometry ?? null;
  const canopyGeo = tree.canopyMesh?.geometry ?? null;
  const woodTriangles = triangleCount(trunkGeo);
  const leafTriangles = triangleCount(canopyGeo);
  // Leaf cards are quads: 4 vertices / 2 triangles each.
  const leafCards = canopyGeo ? canopyGeo.attributes.position.count / 4 : 0;

  const box = new THREE.Box3().setFromObject(tree);
  const recipeHeight = box.max.y;              // above origin
  const buryDepth = Math.max(0, -box.min.y);   // below origin (roots)
  const crownWidth = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);

  // Mean leaf card world size lives in aInfo.x, in canopy-local units — the
  // group is then scaled by `size`, so world size is aInfo.x × size × scale.
  let cardEdge = 0;
  const info = canopyGeo?.attributes?.aInfo;
  if (info) {
    let sum = 0;
    for (let i = 0; i < info.count; i += 4) sum += info.getX(i);
    cardEdge = (sum / (info.count / 4)) * settings.size;
  }

  // Crown extent = the leaf-card centre cloud in world space.
  const crownBox = new THREE.Box3();
  if (canopyGeo) {
    canopyGeo.computeBoundingBox();
    crownBox.copy(canopyGeo.boundingBox).applyMatrix4(tree.canopyMesh.matrixWorld);
  }
  const crownSpan = crownBox.isEmpty()
    ? 0
    : Math.max(crownBox.max.x - crownBox.min.x, crownBox.max.z - crownBox.min.z);

  // Crown centroid lean, measured off the leaf cards IN WORLD SPACE. The
  // canopy geometry is re-centred on its own anchor at build time, so the
  // displacement lives in the canopy mesh's transform, not in the vertices.
  let cx = 0; let cz = 0; let cy = 0; let n = 0;
  if (canopyGeo) {
    const pos = canopyGeo.attributes.position;
    const world = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 4) {
      world.fromBufferAttribute(pos, i).applyMatrix4(tree.canopyMesh.matrixWorld);
      cx += world.x; cy += world.y; cz += world.z; n += 1;
    }
    cx /= n; cy /= n; cz /= n;
  }
  const leanMagnitude = Math.hypot(cx, cz);
  const leanAzimuth = (THREE.MathUtils.radToDeg(Math.atan2(cx, cz)) + 360) % 360;

  // Branch attachments (foliage pads) — read off the aAttachment channel.
  let attachments = 0;
  const attr = canopyGeo?.attributes?.aAttachment;
  if (attr) {
    const seen = new Set();
    for (let i = 0; i < attr.count; i += 4) seen.add(attr.getX(i));
    seen.delete(-1);
    attachments = seen.size;
  }

  const placedHeight = recipeHeight * instanceScale;

  return {
    settings,
    tree,
    digest: geometryDigest(tree),
    recipeHeight,
    placedHeight,
    instanceScale,
    crownWidth: crownSpan * instanceScale,
    crownWidthRecipe: crownSpan,
    boundsWidth: crownWidth * instanceScale,
    buryDepth: buryDepth * instanceScale,
    woodTriangles,
    leafTriangles,
    leafCards,
    totalTriangles: woodTriangles + leafTriangles,
    cardsPerMetre: placedHeight > 0 ? leafCards / placedHeight : 0,
    cardEdge: cardEdge * instanceScale,
    crownCentroid: { x: cx * instanceScale, y: cy * instanceScale, z: cz * instanceScale },
    leanMagnitude: leanMagnitude * instanceScale,
    leanAzimuth,
    leanPercentOfHeight: placedHeight > 0 ? (leanMagnitude * instanceScale) / placedHeight * 100 : 0,
    attachments,
    castShadow: Boolean(tree.trunkMesh?.castShadow && tree.canopyMesh?.castShadow),
    hasBark: Boolean(tree.trunkMesh?.material?.map),
    barkName: tree.trunkMesh?.material?.map?.name ?? null,
  };
}

export function measureLod(settingsInput, { id = null, label = null } = {}) {
  const recipe = createBranchTreeRecipe(settingsInput, { id, label });
  const compiled = compileTreeLodLevels(recipe);
  return compiled;
}

export function clampCheck(authored) {
  const resolved = createBranchTreeSettings(authored);
  const diffs = [];
  const walk = (a, r, path = '') => {
    for (const key of Object.keys(a ?? {})) {
      const av = a[key];
      const rv = r?.[key];
      const p = path ? `${path}.${key}` : key;
      if (av && typeof av === 'object' && !Array.isArray(av)) { walk(av, rv, p); continue; }
      if (Array.isArray(av)) {
        continue; // colors go through sRGB conversion; compared separately
      }
      if (av !== rv) diffs.push({ path: p, authored: av, resolved: rv });
    }
  };
  walk(authored, resolved);
  return diffs;
}

export function roundTrip(settingsInput) {
  const doc = createBranchTreeDocument(settingsInput);
  const parsed = parseBranchTreeDocument(JSON.stringify(doc));
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const a = createBranchTree(createBranchTreeSettings(settingsInput));
  const b = createBranchTree(parsed.value.settings);
  return { ok: geometryDigest(a) === geometryDigest(b), digestA: geometryDigest(a), digestB: geometryDigest(b) };
}
