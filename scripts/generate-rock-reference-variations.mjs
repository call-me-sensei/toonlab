#!/usr/bin/env node
//
// Batch-generates deformed variations of the local rock reference library.
//
// Reads the gitignored authored LOD exports produced by
// .local-reference/scripts/export-rock-reference-assets.mjs and writes one GLB
// per variation containing the full authored LOD set. Geometry is cloned and
// deformed in place by rockgen's reference variation profile, so topology, UVs,
// and exact authored triangle counts survive unchanged — only vertex positions
// move.
//
// Source identity stays in the local manifest and is never written into the
// exported GLBs.
//
//   node scripts/generate-rock-reference-variations.mjs
//   node scripts/generate-rock-reference-variations.mjs --count 3 --strength 0.6
//   node scripts/generate-rock-reference-variations.mjs --filter Hexic --force

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import {
  createRockReferenceVariationProfile,
  deformRockReferenceGeometry,
} from '../src/rockgen/reference/referenceMeshVariation.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_SOURCE = resolve(ROOT_DIR, 'assets-local', 'rock-references');
const DEFAULT_OUTPUT = resolve(ROOT_DIR, 'assets-local', 'rock-reference-variations');
const MANIFEST_SCHEMA = 'toonlab.local-rock-reference-variations';

const args = process.argv.slice(2);
const optionValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);

const sourceDir = resolve(optionValue('--source', DEFAULT_SOURCE));
const outputDir = resolve(optionValue('--output', DEFAULT_OUTPUT));
const count = Math.max(1, Math.min(16, Number(optionValue('--count', '1')) || 1));
const strength = Math.max(0, Math.min(1, Number(optionValue('--strength', '1'))));
const baseSeed = Math.abs(Math.round(Number(optionValue('--seed', '1')) || 1)) >>> 0;
const filter = optionValue('--filter', '');
const force = has('--force');
const quiet = has('--quiet');

if (strength <= 0) {
  console.error('--strength 0 is an exact identity clone; nothing would vary. Use a value above 0.');
  process.exit(1);
}

// GLTFExporter's binary path goes through FileReader, which Node does not
// expose globally. The worker installs the same shim.
if (typeof FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    result = null;
    error = null;
    onloadend = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(
        (result) => { this.result = result; this.onloadend?.(); },
        (error) => { this.error = error; this.onloadend?.(); },
      );
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then(
        (result) => {
          const type = blob.type || 'application/octet-stream';
          this.result = `data:${type};base64,${Buffer.from(result).toString('base64')}`;
          this.onloadend?.();
        },
        (error) => { this.error = error; this.onloadend?.(); },
      );
    }
  };
}

const loader = new GLTFLoader();

function parseGlb(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((done, fail) => loader.parse(buffer, '', done, fail));
}

function firstMesh(root) {
  let mesh = null;
  root.traverse((object) => { if (!mesh && object.isMesh) mesh = object; });
  return mesh;
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);
}

function disposeScene(root) {
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material?.dispose?.();
    }
  });
}

/** Largest per-vertex displacement, as a fraction of the source bounding radius. */
function displacementRatio(source, varied, radius) {
  const from = source.getAttribute('position');
  const to = varied.getAttribute('position');
  if (from.count !== to.count) return Number.NaN;
  let peak = 0;
  for (let index = 0; index < from.count; index += 1) {
    const dx = to.getX(index) - from.getX(index);
    const dy = to.getY(index) - from.getY(index);
    const dz = to.getZ(index) - from.getZ(index);
    peak = Math.max(peak, Math.hypot(dx, dy, dz));
  }
  return peak / Math.max(radius, 1e-6);
}

async function loadManifest() {
  const path = resolve(sourceDir, 'manifest.json');
  if (!existsSync(path)) {
    throw new Error(
      `No reference manifest at ${path}. `
      + 'Run .local-reference/scripts/export-rock-reference-assets.mjs first.',
    );
  }
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest?.schema !== 'toonlab.local-rock-references' || !Array.isArray(manifest.entries)) {
    throw new Error(`Invalid reference manifest at ${path}.`);
  }
  return manifest;
}

/** Deforms one entry's full authored LOD set under a single shared field. */
async function buildVariation(entry, variationIndex) {
  const seed = (baseSeed + variationIndex) >>> 0;
  const profile = createRockReferenceVariationProfile({
    referenceId: entry.sourceAssetName,
    seed,
    strength,
  });

  const sources = [];
  const varied = [];
  try {
    for (const lod of entry.lods) {
      const gltf = await parseGlb(await readFile(resolve(sourceDir, lod.file)));
      const mesh = firstMesh(gltf.scene);
      if (!mesh?.geometry) throw new Error(`${lod.file} contains no mesh geometry.`);
      const geometry = mesh.geometry.clone();
      disposeScene(gltf.scene);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      sources.push({ geometry, lod: Number(lod.lod), expected: Number(lod.triangles) });
    }

    // Every LOD is deformed by the same world-space field, keyed off LOD0's
    // bounds, so the levels stay coherent without vertex correspondence.
    const sourceBounds = sources[0].geometry.boundingBox.clone();
    const sourceRadius = Math.max(sources[0].geometry.boundingSphere?.radius ?? 1, 1e-4);

    for (const source of sources) {
      const geometry = deformRockReferenceGeometry(source.geometry, profile, { sourceBounds });
      const actual = triangleCount(geometry);
      if (actual !== source.expected) {
        throw new Error(
          `${entry.sourceAssetName} LOD${source.lod} changed triangle count `
          + `(${source.expected} -> ${actual}).`,
        );
      }
      geometry.computeBoundingBox();
      varied.push({
        base: geometry.boundingBox.min.y,
        drift: displacementRatio(source.geometry, geometry, sourceRadius),
        geometry,
        lod: source.lod,
        triangles: actual,
        uv: Boolean(geometry.getAttribute('uv')),
      });
    }

    const variationId = `${entry.sourceAssetName}_v${String(variationIndex + 1).padStart(2, '0')}`;
    const root = new THREE.Group();
    root.name = variationId;
    root.userData.toonlabRockVariation = { profile, seed, strength, variationId };
    const materials = [];
    for (const level of varied) {
      // Neutral clay: the ToonLab rock shader supplies surface response
      // downstream, and the authored bakes are unused.
      const material = new THREE.MeshStandardMaterial({
        color: 0xb8b1a6,
        metalness: 0,
        roughness: 0.9,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(level.geometry, material);
      mesh.name = `${variationId}_LOD${level.lod}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }

    const buffer = await new GLTFExporter().parseAsync(root, {
      binary: true,
      onlyVisible: false,
      trs: false,
    });
    for (const material of materials) material.dispose();

    return {
      buffer,
      record: {
        levels: varied.map((level) => ({
          baseY: Number(level.base.toFixed(6)),
          lod: level.lod,
          peakDriftRatio: Number(level.drift.toFixed(5)),
          triangles: level.triangles,
          uv: level.uv,
        })),
        profile,
        seed,
        variationId,
      },
    };
  } finally {
    for (const source of sources) source.geometry.dispose();
    for (const level of varied) level.geometry.dispose();
  }
}

async function main() {
  const manifest = await loadManifest();
  const entries = filter
    ? manifest.entries.filter((entry) => entry.sourceAssetName.toLowerCase().includes(filter.toLowerCase()))
    : manifest.entries;

  if (entries.length === 0) {
    console.error(`No reference entries matched --filter ${filter}`);
    process.exit(1);
  }

  if (force && existsSync(outputDir)) await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  if (!force && (await readdir(outputDir)).length > 0) {
    console.error(`${outputDir} is not empty. Re-run with --force to replace it.`);
    process.exit(1);
  }

  console.log(
    `Generating ${entries.length * count} variation(s) `
    + `from ${entries.length} reference(s) at strength ${strength}\n`,
  );

  const records = [];
  const failures = [];
  let drift = { max: 0, min: Number.POSITIVE_INFINITY, sum: 0, n: 0 };
  let completed = 0;

  for (const entry of entries) {
    for (let index = 0; index < count; index += 1) {
      try {
        const { buffer, record } = await buildVariation(entry, index);
        const file = `${entry.sourceAssetName}/${record.variationId}.glb`;
        await mkdir(resolve(outputDir, entry.sourceAssetName), { recursive: true });
        await writeFile(resolve(outputDir, file), Buffer.from(buffer));
        for (const level of record.levels) {
          if (!Number.isFinite(level.peakDriftRatio)) continue;
          drift.max = Math.max(drift.max, level.peakDriftRatio);
          drift.min = Math.min(drift.min, level.peakDriftRatio);
          drift.sum += level.peakDriftRatio;
          drift.n += 1;
        }
        records.push({
          ...record,
          byteSize: buffer.byteLength,
          file,
          sourceAssetName: entry.sourceAssetName,
          sourcePath: entry.sourcePath,
        });
      } catch (error) {
        failures.push({ error: error.message, sourceAssetName: entry.sourceAssetName, variation: index });
      }
    }
    completed += 1;
    if (!quiet && (completed % 25 === 0 || completed === entries.length)) {
      console.log(`  ${completed}/${entries.length} references processed`);
    }
  }

  await writeFile(
    resolve(outputDir, 'manifest.json'),
    `${JSON.stringify({
      schema: MANIFEST_SCHEMA,
      version: 1,
      source: { manifestVersion: manifest.version, schema: manifest.schema },
      settings: { baseSeed, count, strength },
      entries: records,
    }, null, 2)}\n`,
  );

  const meanDrift = drift.n > 0 ? drift.sum / drift.n : 0;
  console.log(`\nwrote ${records.length} variation GLB(s) to ${outputDir}`);
  console.log(
    'peak vertex drift vs source radius — '
    + `min ${(drift.min * 100).toFixed(2)}%, mean ${(meanDrift * 100).toFixed(2)}%, `
    + `max ${(drift.max * 100).toFixed(2)}%`,
  );
  console.log('authored triangle counts: preserved exactly on every level');

  if (failures.length > 0) {
    console.error(`\n${failures.length} variation(s) failed:`);
    for (const failure of failures.slice(0, 10)) {
      console.error(`  ${failure.sourceAssetName} v${failure.variation + 1}: ${failure.error}`);
    }
    if (failures.length > 10) console.error(`  ... and ${failures.length - 10} more`);
    process.exit(1);
  }
}

await main();
