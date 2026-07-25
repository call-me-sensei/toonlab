#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const CATALOG_DIR = resolve(
  process.env.TOONLAB_REFERENCE_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'catalog-meshes'),
);
const SOURCE_DIR = resolve(
  process.env.TOONLAB_ENVIRONMENT_MATERIAL_SOURCE_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-source'),
);

const EXPECTED_MESHES = 773;
const EXPECTED_LODS = 1635;
const EXPECTED_CATEGORIES = Object.freeze({
  Foliage: 117,
  Misc: 19,
  Rocks: 324,
  Sky: 5,
  Trees: 268,
  Water: 40,
});

function fail(message) {
  console.error(`environment asset verification failed: ${message}`);
  process.exitCode = 1;
}

function objectName(path) {
  return String(path ?? '').split('.').at(-1)?.split('/').at(-1) ?? '';
}

function glbJson(file) {
  const buffer = readFileSync(file);
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('invalid GLB header');
  }
  if (buffer.readUInt32LE(4) !== 2) throw new Error('GLB version is not 2');
  const jsonLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString('ascii', 16, 20);
  if (chunkType !== 'JSON') throw new Error('first GLB chunk is not JSON');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

const catalogPath = resolve(CATALOG_DIR, 'manifest.json');
const sourcePath = resolve(SOURCE_DIR, 'manifest.json');
if (!existsSync(catalogPath)) fail(`missing ${catalogPath}; run npm run export:environment-assets`);
if (!existsSync(sourcePath)) fail(`missing ${sourcePath}; run npm run export:environment-source`);

if (!process.exitCode) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  if (catalog.schema !== 'toonlab.local-environment-references') {
    fail(`catalog schema is ${catalog.schema}`);
  }
  if (source.schema !== 'toonlab.sostylized-environment-material-source') {
    fail(`source schema is ${source.schema}`);
  }

  const entries = catalog.entries ?? [];
  const lodCount = entries.reduce((sum, entry) => sum + (entry.lods?.length ?? 0), 0);
  if (entries.length !== EXPECTED_MESHES) {
    fail(`mesh count is ${entries.length}, expected ${EXPECTED_MESHES}`);
  }
  if (lodCount !== EXPECTED_LODS) {
    fail(`LOD count is ${lodCount}, expected ${EXPECTED_LODS}`);
  }

  const categories = {};
  const keys = new Set();
  const paths = new Set();
  const sourceProfiles = new Set((source.materials ?? []).map((profile) => objectName(profile.path)));
  let parsedLods = 0;
  let parsedTriangles = 0;

  for (const entry of entries) {
    categories[entry.category] = (categories[entry.category] ?? 0) + 1;
    if (keys.has(entry.assetKey)) fail(`duplicate asset key ${entry.assetKey}`);
    if (paths.has(entry.sourcePath)) fail(`duplicate source path ${entry.sourcePath}`);
    keys.add(entry.assetKey);
    paths.add(entry.sourcePath);
    if (!entry.lods?.length) fail(`${entry.sourceAssetName} has no exported LODs`);

    const allowedMaterials = new Set(
      (entry.materials ?? []).filter(Boolean).map(objectName),
    );
    entry.lods?.forEach((lod, index) => {
      if (lod.lod !== index) {
        fail(`${entry.sourceAssetName} has non-sequential LOD index ${lod.lod}`);
      }
      const file = resolve(CATALOG_DIR, lod.file);
      if (!existsSync(file)) {
        fail(`missing ${lod.file}`);
        return;
      }
      if (statSync(file).size === 0) {
        fail(`empty ${lod.file}`);
        return;
      }
      try {
        const json = glbJson(file);
        const names = (json.materials ?? []).map((material) => material.name ?? '');
        if (names.some((name) => !name)) {
          fail(`${entry.sourceAssetName} LOD${lod.lod} has an unnamed material`);
        }
        for (const name of names) {
          if (name !== 'WorldGridMaterial' && !sourceProfiles.has(name)) {
            fail(`${entry.sourceAssetName} LOD${lod.lod} references unknown ${name}`);
          }
          if (name !== 'WorldGridMaterial' && !allowedMaterials.has(name)) {
            fail(`${entry.sourceAssetName} LOD${lod.lod} uses undeclared slot ${name}`);
          }
        }
        const triangles = (json.meshes ?? []).reduce((meshSum, mesh) =>
          meshSum + (mesh.primitives ?? []).reduce((primitiveSum, primitive) => {
            const count = json.accessors?.[primitive.indices]?.count;
            return primitiveSum + (Number.isFinite(count) ? count / 3 : 0);
          }, 0), 0);
        if (triangles !== lod.triangles) {
          fail(`${entry.sourceAssetName} LOD${lod.lod} has ${triangles} triangles, manifest says ${lod.triangles}`);
        }
        parsedLods += 1;
        parsedTriangles += triangles;
      } catch (error) {
        fail(`${lod.file}: ${error.message}`);
      }
    });
  }

  for (const [category, expected] of Object.entries(EXPECTED_CATEGORIES)) {
    if (categories[category] !== expected) {
      fail(`${category}: ${categories[category] ?? 0}, expected ${expected}`);
    }
  }

  if (!process.exitCode) {
    console.log('environment asset verification passed');
    console.log(JSON.stringify({
      categories,
      lods: parsedLods,
      meshes: entries.length,
      triangles: parsedTriangles,
    }, null, 2));
  }
}
