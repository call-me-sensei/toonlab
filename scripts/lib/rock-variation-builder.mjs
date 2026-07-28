// Shared build path for rock reference variations.
//
// Both the batch generator and the review server go through buildVariation() so
// a rerolled entry is produced exactly the same way as a batch-generated one.
//
// Geometry is cloned and deformed in place by rockgen's reference variation
// profile: topology, UVs, and exact authored triangle counts survive, only
// vertex positions move. An optional mirror is applied first — a reflection is
// the one cheap transform that cannot be undone by rotating the asset at
// placement time, so it reads as a genuinely different rock at zero quality
// cost.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import {
  createRockReferenceVariationProfile,
  deformRockReferenceGeometry,
} from '../../src/rockgen/reference/referenceMeshVariation.js';

export const VARIATION_MANIFEST_SCHEMA = 'toonlab.local-rock-reference-variations';

// GLTFExporter's binary path goes through FileReader, which Node does not
// expose globally. The rock worker installs the same shim.
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

export function triangleCount(geometry) {
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

/** Deterministic 32-bit hash, matching the mixing rockgen uses for seeds. */
export function hashSeed(seed, salt) {
  let value = (Number(seed) >>> 0) ^ Math.imul(salt.length + 1, 0x9e3779b1);
  for (let index = 0; index < salt.length; index += 1) {
    value = Math.imul(value ^ salt.charCodeAt(index), 0x01000193) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

/**
 * Mirrors across X in place, restoring triangle winding so faces keep pointing
 * outward. Normals are recomputed by the deform pass that follows.
 */
function mirrorGeometryX(geometry) {
  geometry.scale(-1, 1, 1);
  if (geometry.index) {
    const index = geometry.index;
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const first = index.getX(triangle);
      index.setX(triangle, index.getX(triangle + 2));
      index.setX(triangle + 2, first);
    }
    index.needsUpdate = true;
  } else {
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.getAttribute(name);
      const stride = attribute.itemSize;
      const array = attribute.array;
      for (let triangle = 0; triangle < attribute.count; triangle += 3) {
        const a = triangle * stride;
        const c = (triangle + 2) * stride;
        for (let component = 0; component < stride; component += 1) {
          const swap = array[a + component];
          array[a + component] = array[c + component];
          array[c + component] = swap;
        }
      }
      attribute.needsUpdate = true;
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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

export async function loadSourceManifest(sourceDir) {
  const manifest = JSON.parse(await readFile(resolve(sourceDir, 'manifest.json'), 'utf8'));
  if (manifest?.schema !== 'toonlab.local-rock-references' || !Array.isArray(manifest.entries)) {
    throw new Error(`Invalid reference manifest at ${sourceDir}/manifest.json`);
  }
  return manifest;
}

/**
 * Builds one variation of one source entry.
 *
 * `seed` fully determines the result — the deformation profile and whether the
 * mesh is mirrored. Rerolling is therefore just picking a new seed, and the
 * same seed always reproduces the same bytes.
 */
export async function buildVariation(entry, {
  allowMirror = true,
  sourceDir,
  seed,
  strength = 1,
  variationId,
}) {
  const resolvedSeed = Number(seed) >>> 0;
  const profile = createRockReferenceVariationProfile({
    referenceId: entry.sourceAssetName,
    seed: resolvedSeed,
    strength,
  });
  const mirrored = allowMirror && (hashSeed(resolvedSeed, `${entry.sourceAssetName}:mirror`) & 1) === 1;

  const sources = [];
  const varied = [];
  const materials = [];
  try {
    for (const lod of entry.lods) {
      const gltf = await parseGlb(await readFile(resolve(sourceDir, lod.file)));
      const mesh = firstMesh(gltf.scene);
      if (!mesh?.geometry) throw new Error(`${lod.file} contains no mesh geometry.`);
      const geometry = mesh.geometry.clone();
      disposeScene(gltf.scene);
      if (mirrored) mirrorGeometryX(geometry);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      sources.push({ expected: Number(lod.triangles), geometry, lod: Number(lod.lod) });
    }

    // One world-space field, keyed off LOD0's bounds, keeps the levels coherent
    // without requiring vertex correspondence between them.
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
        baseY: geometry.boundingBox.min.y,
        drift: displacementRatio(source.geometry, geometry, sourceRadius),
        geometry,
        lod: source.lod,
        triangles: actual,
        uv: Boolean(geometry.getAttribute('uv')),
      });
    }

    const root = new THREE.Group();
    root.name = variationId;
    root.userData.toonlabRockVariation = { mirrored, profile, seed: resolvedSeed, strength, variationId };
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

    return {
      buffer,
      record: {
        byteSize: buffer.byteLength,
        levels: varied.map((level) => ({
          baseY: Number(level.baseY.toFixed(6)),
          lod: level.lod,
          peakDriftRatio: Number(level.drift.toFixed(5)),
          triangles: level.triangles,
          uv: level.uv,
        })),
        mirrored,
        profile,
        seed: resolvedSeed,
        sourceAssetName: entry.sourceAssetName,
        sourcePath: entry.sourcePath,
        strength,
        variationId,
      },
    };
  } finally {
    for (const source of sources) source.geometry.dispose();
    for (const level of varied) level.geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
