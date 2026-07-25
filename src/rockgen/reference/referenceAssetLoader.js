// Browser loader for licensed, gitignored reference exports prepared by
// scripts/export-rock-reference-assets.mjs.

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { getRockReferenceEntry } from './referenceCatalog.js';

export const DEFAULT_ROCK_REFERENCE_ASSET_BASE_URL = '/assets-local/rock-references';

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

function firstMesh(root) {
  let mesh = null;
  root.traverse((object) => {
    if (!mesh && object.isMesh) mesh = object;
  });
  return mesh;
}

function triangles(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3);
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}

function disposeScene(root, { keepMaterial = null } = {}) {
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material && material !== keepMaterial) disposeMaterial(material);
    }
  });
}

async function loadGltf(loader, url) {
  try {
    return await loader.loadAsync(url);
  } catch (error) {
    const next = new Error(`Unable to load local rock reference asset ${url}: ${error.message}`);
    next.cause = error;
    throw next;
  }
}

export async function loadRockReferenceAssetManifest({
  baseUrl = DEFAULT_ROCK_REFERENCE_ASSET_BASE_URL,
} = {}) {
  const url = joinUrl(baseUrl, 'manifest.json');
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(
      `Local reference manifest is unavailable (${response.status}). `
      + 'Run node scripts/export-rock-reference-assets.mjs first.',
    );
  }
  const manifest = await response.json();
  if (manifest?.schema !== 'toonlab.local-rock-references' || !Array.isArray(manifest.entries)) {
    throw new Error(`Invalid local rock reference manifest at ${url}.`);
  }
  return manifest;
}

/** Loads exact source LOD geometry and, when present, the authored LOD0 bake. */
export async function loadRockReferenceAsset(idOrEntry, {
  baseUrl = DEFAULT_ROCK_REFERENCE_ASSET_BASE_URL,
  loadAuthoredMaterial = true,
  manifest = null,
} = {}) {
  const entry = typeof idOrEntry === 'object' && idOrEntry
    ? getRockReferenceEntry(idOrEntry.id)
    : getRockReferenceEntry(idOrEntry);
  if (!entry) throw new Error(`Unknown rock reference "${String(idOrEntry?.id ?? idOrEntry)}".`);
  const resolvedManifest = manifest ?? await loadRockReferenceAssetManifest({ baseUrl });
  const localEntry = resolvedManifest.entries.find(
    (candidate) => candidate.sourceAssetName === entry.sourceAssetName,
  );
  if (!localEntry) {
    throw new Error(`${entry.sourceAssetName} is missing from the local reference manifest.`);
  }
  if (localEntry.lods.length !== entry.target.lodTriangles.length) {
    throw new Error(
      `${entry.sourceAssetName} has ${localEntry.lods.length} local LODs; `
      + `expected ${entry.target.lodTriangles.length}.`,
    );
  }

  const loader = new GLTFLoader();
  const lods = [];
  let authoredMaterial = null;
  try {
    for (let index = 0; index < localEntry.lods.length; index += 1) {
      const localLod = localEntry.lods[index];
      if (Number(localLod.lod) !== index) {
        throw new Error(`${entry.sourceAssetName} has a non-sequential local LOD index.`);
      }
      const gltf = await loadGltf(loader, joinUrl(baseUrl, localLod.file)); // eslint-disable-line no-await-in-loop
      const mesh = firstMesh(gltf.scene);
      if (!mesh?.geometry) throw new Error(`${localLod.file} contains no mesh geometry.`);
      const geometry = mesh.geometry.clone();
      disposeScene(gltf.scene);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const actualTriangles = triangles(geometry);
      const targetTriangles = entry.target.lodTriangles[index];
      if (actualTriangles !== targetTriangles || actualTriangles !== Number(localLod.triangles)) {
        geometry.dispose();
        throw new Error(
          `${entry.sourceAssetName} LOD${index} has ${actualTriangles} triangles; expected ${targetTriangles}.`,
        );
      }
      lods.push({
        geometry,
        lod: index,
        triangles: actualTriangles,
        url: joinUrl(baseUrl, localLod.file),
      });
    }

    if (loadAuthoredMaterial && localEntry.authoredFile) {
      const gltf = await loadGltf(loader, joinUrl(baseUrl, localEntry.authoredFile));
      const mesh = firstMesh(gltf.scene);
      authoredMaterial = Array.isArray(mesh?.material)
        ? mesh.material[0] ?? null
        : mesh?.material ?? null;
      disposeScene(gltf.scene, { keepMaterial: authoredMaterial });
    }
  } catch (error) {
    for (const lod of lods) lod.geometry.dispose();
    disposeMaterial(authoredMaterial);
    throw error;
  }

  const result = {
    authoredMaterial,
    dispose() {
      for (const lod of lods) lod.geometry.dispose();
      disposeMaterial(authoredMaterial);
      result.sourceMaterial?.dispose?.();
      result.unityMaterial?.dispose?.();
    },
    entry,
    localEntry,
    lods,
    manifest: resolvedManifest,
    sourceMaterial: null,
    unityMaterial: null,
  };
  return result;
}
