import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  applyToonLabSourceMaterials,
  createToonLabSourceEnvironmentState,
  loadToonLabSourceLibrary,
} from '@call-me-sensei/toonlab/environment';

export const SOURCE_CATALOG_BASE_URL =
  '/assets-local/reference-materials/catalog-meshes';
export const SOURCE_MATERIAL_BASE_URL =
  '/assets-local/reference-materials/material-source';
export const SOURCE_LANDSCAPE_WEIGHT_BASE_URL =
  '/assets-local/reference-materials/landscape-weight-layers/ToonLabShowcase';
export const SOURCE_ENVIRONMENT_TEXTURE_BASE_URL =
  '/assets-local/reference-environment/environment-baseline';

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

export async function loadSourceCatalogManifest({
  assetBaseUrl = SOURCE_CATALOG_BASE_URL,
} = {}) {
  const response = await fetch(joinUrl(assetBaseUrl, 'manifest.json'), { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(
      `Complete source catalog is unavailable (${response.status}). `
      + 'Run npm run export:environment-assets.',
    );
  }
  const manifest = await response.json();
  if (manifest?.schema !== 'toonlab.local-environment-references'
    || !Array.isArray(manifest.entries)) {
    throw new Error('Invalid complete source catalog manifest.');
  }
  return manifest;
}

export async function createSourceCatalogContext(options = {}) {
  const [manifest, library] = await Promise.all([
    loadSourceCatalogManifest(options),
    loadToonLabSourceLibrary({
      baseUrl: options.materialBaseUrl ?? SOURCE_MATERIAL_BASE_URL,
      environmentBaseUrl:
        options.environmentBaseUrl ?? SOURCE_ENVIRONMENT_TEXTURE_BASE_URL,
      landscapeWeightBaseUrl:
        options.landscapeWeightBaseUrl ?? SOURCE_LANDSCAPE_WEIGHT_BASE_URL,
    }),
  ]);
  return {
    baseUrl: options.assetBaseUrl ?? SOURCE_CATALOG_BASE_URL,
    library,
    loader: new GLTFLoader(),
    manifest,
    state: options.state ?? createToonLabSourceEnvironmentState(library),
  };
}

export function sourceCatalogEntry(context, sourceAssetName) {
  return context.manifest.entries.find((entry) => entry.sourceAssetName === sourceAssetName) ?? null;
}

function materialArray(material) {
  return Array.isArray(material) ? material : [material];
}

function disposeImportedMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of materialArray(object.material)) material?.dispose?.();
  });
}

function applyNeutralMaterials(root) {
  const cache = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const originals = materialArray(object.material);
    const replacements = originals.map((original) => {
      const key = original?.name ?? 'neutral';
      if (!cache.has(key)) {
        const foliage = /leaf|leaves|grass|flower|bush|frond/i.test(key);
        cache.set(key, new THREE.MeshStandardMaterial({
          alphaTest: foliage ? 0.33 : 0,
          color: foliage ? 0x77936a : 0xc6c0b6,
          roughness: 0.9,
          side: foliage ? THREE.DoubleSide : THREE.FrontSide,
        }));
      }
      return cache.get(key);
    });
    object.material = Array.isArray(object.material) ? replacements : replacements[0];
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function prepareBakedMaterials(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    for (const material of materialArray(object.material)) {
      materials.add(material);
      material.alphaToCoverage = material.alphaTest > 0;
    }
  });
  return materials.size;
}

export async function loadSourceCatalogAsset(entryOrName, {
  context,
  lod = 0,
  materialMode = 'source',
} = {}) {
  if (!context) throw new Error('loadSourceCatalogAsset requires a catalog context.');
  const entry = typeof entryOrName === 'string'
    ? sourceCatalogEntry(context, entryOrName)
    : entryOrName;
  if (!entry) throw new Error(`Unknown source catalog asset ${String(entryOrName)}.`);
  const lodRecord = entry.lods?.find((record) => Number(record.lod) === Number(lod))
    ?? entry.lods?.[0];
  if (!lodRecord) throw new Error(`${entry.sourceAssetName} has no exported LOD geometry.`);
  const useBaked = materialMode === 'baked' && Boolean(entry.authoredFile);
  const sourceFile = useBaked ? entry.authoredFile : lodRecord.file;
  const gltf = await context.loader.loadAsync(joinUrl(context.baseUrl, sourceFile));
  const root = gltf.scene;
  root.name = entry.sourceAssetName;
  if (useBaked) {
    root.userData.toonLabBakedMaterialCount = prepareBakedMaterials(root);
    root.userData.toonLabMaterialMode = 'baked';
  } else if (materialMode === 'source' || materialMode === 'baked') {
    const importedMaterials = new Set();
    root.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of materialArray(object.material)) importedMaterials.add(material);
    });
    const report = await applyToonLabSourceMaterials(root, {
      library: context.library,
      sourceAssetName: entry.sourceAssetName,
      state: context.state,
    });
    for (const material of importedMaterials) material?.dispose?.();
    root.userData.toonLabSourceReport = report;
    root.userData.toonLabMaterialMode = materialMode === 'baked'
      ? 'live-fallback'
      : 'live';
  } else {
    applyNeutralMaterials(root);
    root.userData.toonLabMaterialMode = 'neutral';
  }
  root.userData.toonLabCatalogEntry = entry;
  return { entry, lod: lodRecord.lod, root };
}

export async function loadSourceCatalogLodObject(entryOrName, {
  context,
  materialMode = 'source',
} = {}) {
  const entry = typeof entryOrName === 'string'
    ? sourceCatalogEntry(context, entryOrName)
    : entryOrName;
  if (!entry) throw new Error(`Unknown source catalog asset ${String(entryOrName)}.`);
  if (materialMode === 'baked' && entry.authoredFile) {
    const loaded = await loadSourceCatalogAsset(entry, {
      context,
      lod: 0,
      materialMode,
    });
    return loaded.root;
  }
  const levels = [];
  for (const lodRecord of entry.lods ?? []) {
    const loaded = await loadSourceCatalogAsset(entry, {
      context,
      lod: lodRecord.lod,
      materialMode,
    }); // eslint-disable-line no-await-in-loop
    levels.push(loaded);
  }
  if (levels.length <= 1) return levels[0]?.root ?? new THREE.Group();
  const bounds = new THREE.Box3().setFromObject(levels[0].root);
  const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.5);
  const lodObject = new THREE.LOD();
  lodObject.name = `${entry.sourceAssetName}_AuthoredLODs`;
  levels.forEach((level, index) => {
    lodObject.addLevel(level.root, index === 0 ? 0 : radius * (index === 1 ? 8 : 18));
  });
  lodObject.userData.toonLabCatalogEntry = entry;
  return lodObject;
}

export function disposeSourceCatalogAsset(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    for (const material of materialArray(object.material)) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root?.removeFromParent?.();
}
