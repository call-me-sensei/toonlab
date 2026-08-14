import { clone as cloneSkinnedObject } from 'three/examples/jsm/utils/SkeletonUtils.js';

import {
  createModelAssetTranscoders,
  loadModelAsset,
} from '../character/modelLoader.js';
import {
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '../toon/toonMaterialAdapter.js';
import { OFFICIAL_CATALOG_ASSET_VERSION } from './officialCatalogProvider.js';

const rendererPools = new WeakMap();
const headlessPools = new Map();

function materialArray(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

function collectModelResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    materialArray(object.material).forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  return { geometries, materials, textures };
}

function disposeResources(resources) {
  resources.textures.forEach((texture) => texture.dispose?.());
  resources.materials.forEach((material) => material.dispose?.());
  resources.geometries.forEach((geometry) => geometry.dispose?.());
}

function poolMap(renderer, transcodersFactory) {
  const factoryMaps = renderer
    ? rendererPools.get(renderer) ?? new Map()
    : headlessPools;
  if (renderer && !rendererPools.has(renderer)) rendererPools.set(renderer, factoryMaps);
  let map = factoryMaps.get(transcodersFactory);
  if (!map) {
    map = new Map();
    factoryMaps.set(transcodersFactory, map);
  }
  return { factoryMaps, map };
}

function acquireTranscoderPool({ decoderBasePath, renderer, transcodersFactory }) {
  const { factoryMaps, map } = poolMap(renderer, transcodersFactory);
  let entry = map.get(decoderBasePath);
  if (!entry) {
    entry = {
      refs: 0,
      value: transcodersFactory({ decoderBasePath, renderer }),
    };
    map.set(decoderBasePath, entry);
  }
  entry.refs += 1;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      entry.value.dispose?.();
      map.delete(decoderBasePath);
      if (map.size === 0) factoryMaps.delete(transcodersFactory);
      if (renderer && factoryMaps.size === 0) rendererPools.delete(renderer);
    },
    value: entry.value,
  };
}

function cloneModelRoot(sourceRoot) {
  const root = cloneSkinnedObject(sourceRoot);
  const materialClones = new Map();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const cloneMaterial = (material) => {
      if (!materialClones.has(material)) materialClones.set(material, material.clone());
      return materialClones.get(material);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  return root;
}

function releaseInstanceRoot(root, sourceResources) {
  root.removeFromParent?.();
  const disposedMaterials = new Set();
  const disposedGeometries = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry && !sourceResources.geometries.has(object.geometry)
      && !disposedGeometries.has(object.geometry)) {
      disposedGeometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    materialArray(object.material).forEach((material) => {
      if (sourceResources.materials.has(material) || disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      material.dispose?.();
    });
  });
}

async function defaultPrepareTextures(root) {
  await waitForObjectTextures(root);
  setObjectTextureColorSpaces(root);
}

/**
 * Package-owned loader/cache lifecycle for official catalog assets.
 *
 * Source geometry and textures remain cache-owned for the runtime lifetime.
 * Every acquired handle receives an independent object graph and materials,
 * while immutable geometry/texture resources stay shared between placements.
 */
export function createOfficialCatalogAssetRuntime({
  decoderBasePath = '/',
  loadModel = loadModelAsset,
  prepareTextures = defaultPrepareTextures,
  provider,
  renderer = null,
  transcodersFactory = createModelAssetTranscoders,
} = {}) {
  if (!provider || typeof provider.getAsset !== 'function') {
    throw new TypeError('Official catalog asset runtime requires a provider with getAsset().');
  }
  if (typeof loadModel !== 'function') throw new TypeError('loadModel must be a function.');
  if (typeof prepareTextures !== 'function') throw new TypeError('prepareTextures must be a function.');

  const assetPromises = new Map();
  const sourcePromises = new Map();
  const sourceEntries = new Map();
  const handles = new Set();
  let transcoderLease = null;
  let disposed = false;

  function assertActive() {
    if (disposed) throw new Error('Official catalog asset runtime is disposed.');
  }

  function getTranscoders() {
    if (!transcoderLease) {
      transcoderLease = acquireTranscoderPool({
        decoderBasePath,
        renderer,
        transcodersFactory,
      });
    }
    return transcoderLease.value;
  }

  function resolveAsset(assetOrId) {
    if (assetOrId?.schemaVersion === OFFICIAL_CATALOG_ASSET_VERSION && assetOrId.modelUrl) {
      return Promise.resolve(assetOrId);
    }
    const id = String(assetOrId ?? '').trim();
    if (!id) return Promise.reject(new TypeError('Official catalog asset id is required.'));
    if (!assetPromises.has(id)) {
      const promise = Promise.resolve(provider.getAsset(id)).catch((error) => {
        if (assetPromises.get(id) === promise) assetPromises.delete(id);
        throw error;
      });
      assetPromises.set(id, promise);
    }
    return assetPromises.get(id);
  }

  async function sourceFor(asset) {
    const key = asset.identity;
    if (!sourcePromises.has(key)) {
      const promise = (async () => {
        const model = await loadModel(asset.modelUrl, {
          decoderBasePath,
          renderer,
          transcoders: getTranscoders(),
        });
        if (!model?.root?.isObject3D) {
          throw new TypeError(`${asset.id} loader did not return an Object3D root.`);
        }
        await prepareTextures(model.root, asset);
        const entry = {
          asset,
          model,
          refs: 0,
          resources: collectModelResources(model.root),
        };
        if (disposed) {
          disposeResources(entry.resources);
          throw new Error('Official catalog asset runtime was disposed while loading.');
        }
        sourceEntries.set(key, entry);
        return entry;
      })().catch((error) => {
        if (sourcePromises.get(key) === promise) sourcePromises.delete(key);
        sourceEntries.delete(key);
        throw error;
      });
      sourcePromises.set(key, promise);
    }
    return sourcePromises.get(key);
  }

  async function acquireAsset(assetOrId) {
    assertActive();
    const asset = await resolveAsset(assetOrId);
    assertActive();
    const entry = await sourceFor(asset);
    assertActive();
    const root = cloneModelRoot(entry.model.root);
    entry.refs += 1;
    let released = false;
    const cleanup = new Set();
    const handle = {
      addCleanup(callback) {
        if (released) throw new Error(`${asset.id} handle is released.`);
        if (typeof callback !== 'function') throw new TypeError('Cleanup callback must be a function.');
        cleanup.add(callback);
        return () => cleanup.delete(callback);
      },
      asset,
      clips: entry.model.clips ?? [],
      format: entry.model.format,
      get released() { return released; },
      release() {
        if (released) return false;
        released = true;
        for (const callback of [...cleanup].reverse()) callback();
        cleanup.clear();
        releaseInstanceRoot(root, entry.resources);
        entry.refs = Math.max(0, entry.refs - 1);
        handles.delete(handle);
        return true;
      },
      resourcePath: entry.model.resourcePath,
      root,
      url: entry.model.url,
    };
    handles.add(handle);
    return handle;
  }

  function findEntry(assetOrId) {
    const value = String(assetOrId?.identity ?? assetOrId ?? '');
    return sourceEntries.get(value)
      ?? [...sourceEntries.values()].find((entry) => entry.asset.id === value)
      ?? null;
  }

  function evict(assetOrId, { force = false } = {}) {
    const entry = findEntry(assetOrId);
    if (!entry) return false;
    if (entry.refs > 0 && !force) return false;
    if (force) {
      for (const handle of [...handles]) {
        if (handle.asset.identity === entry.asset.identity) handle.release();
      }
    }
    disposeResources(entry.resources);
    sourceEntries.delete(entry.asset.identity);
    sourcePromises.delete(entry.asset.identity);
    assetPromises.delete(entry.asset.id);
    return true;
  }

  function stats() {
    return Object.freeze({
      activeHandles: handles.size,
      cachedAssets: sourceEntries.size,
      entries: Object.freeze([...sourceEntries.values()].map((entry) => Object.freeze({
        id: entry.asset.id,
        identity: entry.asset.identity,
        refs: entry.refs,
      }))),
      pendingAssets: sourcePromises.size - sourceEntries.size,
    });
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    for (const handle of [...handles]) handle.release();
    await Promise.allSettled(sourcePromises.values());
    for (const entry of sourceEntries.values()) disposeResources(entry.resources);
    sourceEntries.clear();
    sourcePromises.clear();
    assetPromises.clear();
    transcoderLease?.release();
    transcoderLease = null;
  }

  return Object.freeze({
    acquireAsset,
    dispose,
    evict,
    get disposed() { return disposed; },
    provider,
    stats,
  });
}
