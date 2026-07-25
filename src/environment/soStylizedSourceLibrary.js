// Runtime index for the licensed So Stylized environment material export.
//
// This module deliberately does not translate profiles into ToonLab's
// generic environment shader. It preserves the source material-instance
// hierarchy, mesh-slot assignments, curve-atlas rows, texture metadata, and
// MPC defaults so family-specific source reconstructions can consume the
// authored data without heuristics.

import * as THREE from 'three';

export const SO_STYLIZED_SOURCE_SCHEMA =
  'toonlab.sostylized-environment-material-source';

export const DEFAULT_SO_STYLIZED_SOURCE_BASE_URL =
  '/assets-local/sostylized/material-source';

export const DEFAULT_SO_STYLIZED_SNOWPINES_WEIGHT_LAYER_BASE_URL =
  '/assets-local/sostylized/landscape-weight-layers/SnowPines';

export const SO_STYLIZED_MATERIAL_FAMILIES = Object.freeze([
  'landscape',
  'snow',
  'rock',
  'mountain',
  'foliage',
  'leaves',
  'bark',
  'treeLod',
  'sky',
  'clouds',
  'fog',
  'celestial',
  'cloudShadow',
  'water',
  'waterLegacy',
  'waterfall',
  'underwater',
  'waterWaves',
  'misc',
]);

const FAMILY_RULES = Object.freeze([
  ['/M_TreeSingleMat.', 'treeLod'],
  ['/M_Leaves.', 'leaves'],
  ['/M_Bark.', 'bark'],
  ['/M_Foliage.', 'foliage'],
  ['/M_Landscape.', 'landscape'],
  ['/M_Snow.', 'snow'],
  ['/M_Mountain.', 'mountain'],
  ['/M_Rock.', 'rock'],
  ['/M_StylizedClouds_Lite.', 'clouds'],
  ['/M_StylizedClouds.', 'clouds'],
  ['/M_StylizedFogPP_Lite.', 'fog'],
  ['/M_StylizedFogPP.', 'fog'],
  ['/M_StylizedSky_Lite.', 'sky'],
  ['/M_StylizedSky.', 'sky'],
  ['/M_CelestialBody.', 'celestial'],
  ['/M_SunCloudShadows_', 'cloudShadow'],
  ['/M_StylizedWater.', 'water'],
  ['/M_Waterfall.', 'waterfall'],
  ['/M_UnderwaterPP', 'underwater'],
  ['/M_WaterWaves.', 'waterWaves'],
  ['/M_Water.', 'waterLegacy'],
]);

export const SO_STYLIZED_LANDSCAPE_WEIGHTMAP_SCHEMA =
  'toonlab.sostylized-landscape-weight-layers';

export const SO_STYLIZED_LANDSCAPE_LAYERS = Object.freeze([
  'Grass',
  'Dirt',
  'Sand',
  'Rock',
  'SnowGrass',
  'Snow',
  'SnowGrassBlue',
  'DesertSand',
  'DesertGrass',
  'DesertDirt',
]);

export const SO_STYLIZED_SNOWPINES_WEIGHT_PACK_LAYOUT = Object.freeze([
  Object.freeze({ r: 'Grass', g: 'Dirt', b: 'Sand', a: 'Rock' }),
  Object.freeze({ r: 'SnowGrass', g: 'Snow', b: 'SnowGrassBlue', a: 'DesertSand' }),
  Object.freeze({ r: 'DesertGrass', g: 'DesertDirt', b: null, a: null }),
]);

export const SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT = Object.freeze({
  channel: 'r',
  colorSpace: 'linear',
  height: 505,
  heightBlendLayers: Object.freeze([
    'Grass',
    'Dirt',
    'Rock',
    'SnowGrass',
    'DesertSand',
    'DesertGrass',
    'DesertDirt',
  ]),
  layers: SO_STYLIZED_LANDSCAPE_LAYERS,
  originCm: Object.freeze([-25200, -25200]),
  quadScaleCm: Object.freeze([100, 100]),
  schema: SO_STYLIZED_LANDSCAPE_WEIGHTMAP_SCHEMA,
  sourceAssetName: 'Demonstration_SnowPines',
  sourceMap: '/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines',
  version: 1,
  weightBlendLayers: Object.freeze(['Sand', 'Snow', 'SnowGrassBlue']),
  width: 505,
  runtimePackLayout: SO_STYLIZED_SNOWPINES_WEIGHT_PACK_LAYOUT,
  zeroLayers: Object.freeze(['DesertSand', 'DesertGrass', 'DesertDirt']),
});

export function inspectSoStylizedLandscapeWeightmapSet(
  record,
  contract = SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT,
) {
  if (!record) {
    return Object.freeze({
      errors: Object.freeze(['weightmap set is absent from the source manifest']),
      record: null,
      status: 'missing',
    });
  }
  const errors = [];
  const manifest = record?.manifest ?? record;
  if (manifest.schema !== contract.schema) {
    errors.push(`schema must be ${contract.schema}`);
  }
  if (manifest.version !== contract.version) {
    errors.push(`version must be ${contract.version}`);
  }
  if (manifest.sourceMap !== contract.sourceMap) {
    errors.push(`sourceMap must be ${contract.sourceMap}`);
  }
  if (manifest.extent?.width !== contract.width || manifest.extent?.height !== contract.height) {
    errors.push(`dimensions must be ${contract.width}x${contract.height}`);
  }
  if (manifest.extent?.minX !== 0 || manifest.extent?.minY !== 0
    || manifest.extent?.maxX !== contract.width - 1
    || manifest.extent?.maxY !== contract.height - 1) {
    errors.push('extent must cover Landscape coordinates [0, 0] through [504, 504]');
  }
  if (manifest.encoding?.bitDepth !== 8
    || manifest.encoding?.colorType !== 'grayscale'
    || !String(manifest.encoding?.colorSpace).startsWith('linear scalar data')) {
    errors.push('encoding must be linear 8-bit grayscale scalar data');
  }
  if (manifest.encoding?.rowOrder
    !== 'row 0 is Landscape minY; columns increase from minX') {
    errors.push('row order must begin at Landscape minY and increase with minX');
  }
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  if (layers.map((layer) => layer.name).join('|') !== contract.layers.join('|')) {
    errors.push(`layer order must be ${contract.layers.join(', ')}`);
  }
  const layersByName = Object.fromEntries(layers.map((layer) => [layer.name, layer]));
  for (const layerName of contract.layers) {
    const layer = layersByName[layerName];
    if (!layer?.file) {
      errors.push(`${layerName} must provide a file`);
      continue;
    }
    if (contract.zeroLayers.includes(layerName)
      && (layer.sourceAllocated !== false
        || layer.statistics?.min !== 0
        || layer.statistics?.max !== 0
        || layer.statistics?.nonZeroSamples !== 0)) {
      errors.push(`${layerName} must remain Unreal's exact unallocated zero mask`);
    }
  }
  const runtimePacks = Array.isArray(manifest.runtimePacks) ? manifest.runtimePacks : [];
  if (runtimePacks.length !== contract.runtimePackLayout.length) {
    errors.push(`runtimePacks must contain ${contract.runtimePackLayout.length} RGBA textures`);
  }
  if (manifest.runtimePacking?.bitDepth !== 8
    || manifest.runtimePacking?.colorType !== 'RGBA'
    || !String(manifest.runtimePacking?.colorSpace).startsWith('linear scalar data')) {
    errors.push('runtime packing must be linear 8-bit RGBA scalar data');
  }
  for (let packIndex = 0; packIndex < contract.runtimePackLayout.length; packIndex += 1) {
    const pack = runtimePacks[packIndex];
    const expectedChannels = contract.runtimePackLayout[packIndex];
    if (!pack?.file) errors.push(`runtime pack ${packIndex + 1} must provide a file`);
    for (const channel of ['r', 'g', 'b', 'a']) {
      if ((pack?.channels?.[channel] ?? null) !== expectedChannels[channel]) {
        errors.push(
          `runtime pack ${packIndex + 1}.${channel} must be ${expectedChannels[channel] ?? 'zero'}`,
        );
      }
    }
  }
  return Object.freeze({
    errors: Object.freeze(errors),
    layers: Object.freeze(layersByName),
    manifest,
    record,
    runtimePacks: Object.freeze(runtimePacks),
    status: errors.length === 0 ? 'ready' : 'invalid',
  });
}

const manifestPromises = new Map();
const landscapeWeightManifestPromises = new Map();

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

function sourceName(path) {
  const value = String(path ?? '');
  const objectName = value.includes('.') ? value.slice(value.lastIndexOf('.') + 1) : value;
  return objectName.slice(objectName.lastIndexOf('/') + 1);
}

function normalizeSlotName(value) {
  return sourceName(value)
    .toLowerCase()
    .replace(/^mi?_/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function finite(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function addressMode(value) {
  if (/CLAMP/i.test(String(value))) return THREE.ClampToEdgeWrapping;
  if (/MIRROR/i.test(String(value))) return THREE.MirroredRepeatWrapping;
  return THREE.RepeatWrapping;
}

function assertManifest(manifest) {
  if (manifest?.schema !== SO_STYLIZED_SOURCE_SCHEMA) {
    throw new Error(
      `Invalid So Stylized source manifest (expected ${SO_STYLIZED_SOURCE_SCHEMA}).`,
    );
  }
  for (const field of [
    'meshes', 'materials', 'materialFunctions', 'parameterCollections', 'curves',
  ]) {
    if (!Array.isArray(manifest[field])) {
      throw new Error(`Invalid So Stylized source manifest: ${field} must be an array.`);
    }
  }
  if (!manifest.textures || Array.isArray(manifest.textures)) {
    throw new Error('Invalid So Stylized source manifest: textures must be a path map.');
  }
  return manifest;
}

async function fetchManifest(baseUrl, fetchImpl) {
  const key = String(baseUrl).replace(/\/$/, '');
  if (!manifestPromises.has(key)) {
    manifestPromises.set(key, fetchImpl(joinUrl(key, 'manifest.json'), { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`So Stylized source manifest is unavailable (${response.status}).`);
        }
        return assertManifest(await response.json());
      })
      .catch((error) => {
        manifestPromises.delete(key);
        throw error;
      }));
  }
  return manifestPromises.get(key);
}

async function fetchLandscapeWeightManifest(baseUrl, fetchImpl) {
  const key = String(baseUrl).replace(/\/$/, '');
  if (!landscapeWeightManifestPromises.has(key)) {
    landscapeWeightManifestPromises.set(
      key,
      fetchImpl(joinUrl(key, 'manifest.json'), { cache: 'no-cache' })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `So Stylized Landscape weight manifest is unavailable (${response.status}).`,
            );
          }
          const manifest = await response.json();
          const inspection = inspectSoStylizedLandscapeWeightmapSet(manifest);
          if (inspection.status !== 'ready') {
            throw new Error(
              `Invalid So Stylized Landscape weights: ${inspection.errors.join('; ')}`,
            );
          }
          return manifest;
        })
        .catch((error) => {
          landscapeWeightManifestPromises.delete(key);
          throw error;
        }),
    );
  }
  return landscapeWeightManifestPromises.get(key);
}

export function classifySoStylizedMaterialProfile(profile) {
  const chain = Array.isArray(profile?.chain) ? profile.chain : [profile?.path];
  for (const path of chain) {
    const match = FAMILY_RULES.find(([needle]) => String(path).includes(needle));
    if (match) return match[1];
  }
  return 'misc';
}

export function soStylizedScalar(profile, name, fallback = 0) {
  const value = profile?.parameters?.scalar?.[name];
  // Master-profile exports use explicit nulls for parameters whose defaults
  // live in the graph. Number(null) is zero, which must not replace the graph
  // fallback supplied by a family runtime.
  return value === null || value === undefined || value === ''
    ? fallback
    : finite(value, fallback);
}

export function soStylizedVector(profile, name, fallback = [0, 0, 0, 1]) {
  const value = profile?.parameters?.vector?.[name];
  return Array.isArray(value) && value.length >= 3 ? value : fallback;
}

export function soStylizedSwitch(profile, name, fallback = false) {
  const value = profile?.parameters?.static_switch?.[name];
  return typeof value === 'boolean' ? value : fallback;
}

export function soStylizedTexturePath(profile, name, fallback = null) {
  return profile?.parameters?.texture?.[name] || fallback;
}

export class SoStylizedSourceLibrary {
  constructor(manifest, {
    baseUrl = DEFAULT_SO_STYLIZED_SOURCE_BASE_URL,
    landscapeWeightmapSets = manifest.landscapeWeightmaps ?? {},
    textureLoader = new THREE.TextureLoader(),
  } = {}) {
    this.manifest = assertManifest(manifest);
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.textureLoader = textureLoader;
    this.texturePromises = new Map();
    this.curveTextures = new Map();

    this.materialsByPath = new Map();
    this.materialsByName = new Map();
    this.materialsByFamily = new Map(
      SO_STYLIZED_MATERIAL_FAMILIES.map((family) => [family, []]),
    );
    for (const profile of manifest.materials) {
      profile.family = classifySoStylizedMaterialProfile(profile);
      this.materialsByPath.set(profile.path, profile);
      const name = sourceName(profile.path);
      if (!this.materialsByName.has(name)) this.materialsByName.set(name, []);
      this.materialsByName.get(name).push(profile);
      this.materialsByFamily.get(profile.family)?.push(profile);
    }

    this.meshesByName = new Map(manifest.meshes.map((mesh) => [mesh.sourceAssetName, mesh]));
    this.curvesByPath = new Map(manifest.curves.map((curve) => [curve.path, curve]));
    this.curvesByName = new Map(manifest.curves.map((curve) => [sourceName(curve.path), curve]));
    this.collectionsByPath = new Map(
      manifest.parameterCollections.map((collection) => [collection.path, collection]),
    );
    this.landscapeWeightmapSets = landscapeWeightmapSets;
  }

  resolveMaterial(reference) {
    if (!reference) return null;
    if (typeof reference === 'object' && reference.path) return reference;
    if (this.materialsByPath.has(reference)) return this.materialsByPath.get(reference);
    const candidates = this.materialsByName.get(sourceName(reference));
    return candidates?.length === 1 ? candidates[0] : candidates?.[0] ?? null;
  }

  resolveAuthoredBakeMaterial(reference) {
    const exact = this.resolveMaterial(reference);
    if (exact) return exact;
    const bakedName = sourceName(reference);
    let bestName = '';
    let bestProfile = null;
    for (const [name, profiles] of this.materialsByName) {
      if (name.length <= bestName.length || !bakedName.startsWith(`${name}_`)) continue;
      bestName = name;
      bestProfile = profiles?.[0] ?? null;
    }
    return bestProfile;
  }

  resolveMesh(sourceAssetName) {
    return this.meshesByName.get(sourceAssetName) ?? null;
  }

  resolveMeshSlot(sourceAssetName, materialName, materialIndex = 0) {
    const mesh = this.resolveMesh(sourceAssetName);
    if (!mesh) return null;
    const slots = mesh.materialSlots ?? [];
    const exact = String(materialName ?? '').toLowerCase();
    const normalized = normalizeSlotName(materialName);
    let slotIndex = slots.findIndex((slot) => [
      slot.name,
      slot.importedName,
      sourceName(slot.material),
    ].some((alias) => String(alias ?? '').toLowerCase() === exact));
    if (slotIndex < 0 && normalized) {
      slotIndex = slots.findIndex((slot) => [
        slot.name,
        slot.importedName,
        sourceName(slot.material),
      ].some((alias) => normalizeSlotName(alias) === normalized));
    }
    if (slotIndex < 0 && slots[materialIndex]) slotIndex = materialIndex;
    if (slotIndex < 0) return null;
    const slot = slots[slotIndex];
    return {
      materialIndex: slotIndex,
      mesh,
      profile: this.resolveMaterial(slot.material),
      slot,
    };
  }

  resolveCurve(reference) {
    if (!reference) return null;
    if (typeof reference === 'object' && reference.path) return reference;
    return this.curvesByPath.get(reference) ?? this.curvesByName.get(sourceName(reference)) ?? null;
  }

  resolveLandscapeWeightmapSet(sourceAssetName) {
    return this.landscapeWeightmapSets?.[sourceAssetName] ?? null;
  }

  inspectLandscapeWeightmapSet(
    sourceAssetName,
    contract = SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT,
  ) {
    return inspectSoStylizedLandscapeWeightmapSet(
      this.resolveLandscapeWeightmapSet(sourceAssetName),
      contract,
    );
  }

  async loadLandscapeWeightmapTextures(
    sourceAssetName,
    contract = SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT,
  ) {
    const record = this.resolveLandscapeWeightmapSet(sourceAssetName);
    const inspection = inspectSoStylizedLandscapeWeightmapSet(record, contract);
    if (inspection.status !== 'ready') {
      throw new Error(
        `Landscape weights for ${sourceAssetName} are ${inspection.status}: `
        + inspection.errors.join('; '),
      );
    }
    const baseUrl = String(
      record?.baseUrl ?? DEFAULT_SO_STYLIZED_SNOWPINES_WEIGHT_LAYER_BASE_URL,
    ).replace(/\/$/, '');
    const packEntries = await Promise.all(inspection.runtimePacks.map(async (pack, packIndex) => {
      const url = joinUrl(baseUrl, pack.file);
      const key = `landscape-weight|${url}`;
      if (!this.texturePromises.has(key)) {
        this.texturePromises.set(key, this.textureLoader.loadAsync(url)
          .then((result) => {
            const channelLabel = Object.values(pack.channels)
              .filter(Boolean)
              .join('_');
            result.name = `LandscapeWeights_${packIndex + 1}_${channelLabel}`;
            result.colorSpace = THREE.NoColorSpace;
            result.flipY = false;
            result.wrapS = THREE.ClampToEdgeWrapping;
            result.wrapT = THREE.ClampToEdgeWrapping;
            result.minFilter = THREE.LinearFilter;
            result.magFilter = THREE.LinearFilter;
            result.generateMipmaps = false;
            result.anisotropy = 1;
            result.needsUpdate = true;
            return result;
          })
          .catch((error) => {
            this.texturePromises.delete(key);
            throw error;
          }));
      }
      return await this.texturePromises.get(key);
    }));
    const bindings = {};
    for (let packIndex = 0; packIndex < inspection.runtimePacks.length; packIndex += 1) {
      const pack = inspection.runtimePacks[packIndex];
      for (const channel of ['r', 'g', 'b', 'a']) {
        const layerName = pack.channels[channel];
        if (!layerName) continue;
        bindings[layerName] = Object.freeze({
          channel,
          packIndex,
          texture: packEntries[packIndex],
        });
      }
    }
    return Object.freeze({
      bindings: Object.freeze(bindings),
      inspection,
      textures: Object.freeze(packEntries),
    });
  }

  resolveCurveAtlasRow(atlasReference, row = 0) {
    const atlas = this.resolveCurve(atlasReference);
    if (atlas?.class !== 'CurveLinearColorAtlas' || !atlas.gradient_curves?.length) return null;
    const index = THREE.MathUtils.clamp(Math.round(finite(row, 0)), 0, atlas.gradient_curves.length - 1);
    return this.resolveCurve(atlas.gradient_curves[index]);
  }

  sampleCurve(curveReference, time = 0) {
    const curve = this.resolveCurve(curveReference);
    const samples = curve?.samples;
    if (!Array.isArray(samples) || samples.length === 0) return [0, 0, 0, 1];
    const t = THREE.MathUtils.clamp(finite(time, 0), 0, 1);
    if (t <= samples[0][0]) return [...samples[0][1]];
    if (t >= samples.at(-1)[0]) return [...samples.at(-1)[1]];
    let upper = 1;
    while (upper < samples.length && samples[upper][0] < t) upper += 1;
    const [t0, a] = samples[upper - 1];
    const [t1, b] = samples[upper];
    const alpha = (t - t0) / Math.max(t1 - t0, 1e-6);
    return [0, 1, 2, 3].map((channel) => THREE.MathUtils.lerp(
      finite(a[channel], channel === 3 ? 1 : 0),
      finite(b[channel], channel === 3 ? 1 : 0),
      alpha,
    ));
  }

  createCurveTexture(curveReference) {
    const curve = this.resolveCurve(curveReference);
    if (!curve?.samples?.length) return null;
    if (this.curveTextures.has(curve.path)) return this.curveTextures.get(curve.path);
    const data = new Float32Array(curve.samples.length * 4);
    curve.samples.forEach((sample, index) => {
      const color = sample[1] ?? [];
      data[index * 4] = finite(color[0], 0);
      data[index * 4 + 1] = finite(color[1], 0);
      data[index * 4 + 2] = finite(color[2], 0);
      data[index * 4 + 3] = finite(color[3], 1);
    });
    const texture = new THREE.DataTexture(
      data,
      curve.samples.length,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.name = sourceName(curve.path);
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.curveTextures.set(curve.path, texture);
    return texture;
  }

  createCurveAtlasRowTexture(atlasReference, row = 0) {
    return this.createCurveTexture(this.resolveCurveAtlasRow(atlasReference, row));
  }

  async loadTexture(unrealPath, {
    anisotropy = 8,
    flipY = true,
  } = {}) {
    if (!unrealPath) return null;
    const record = this.manifest.textures[unrealPath];
    if (!record?.file) {
      throw new Error(`Source texture is absent from the export: ${unrealPath}`);
    }
    const key = `${unrealPath}|${flipY ? 1 : 0}|${anisotropy}`;
    if (!this.texturePromises.has(key)) {
      this.texturePromises.set(key, this.textureLoader.loadAsync(joinUrl(this.baseUrl, record.file))
        .then((result) => {
          result.name = sourceName(unrealPath);
          result.colorSpace = record.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          result.flipY = Boolean(flipY);
          result.wrapS = addressMode(record.addressX);
          result.wrapT = addressMode(record.addressY);
          result.minFilter = THREE.LinearMipmapLinearFilter;
          result.magFilter = THREE.LinearFilter;
          result.anisotropy = Math.max(1, finite(anisotropy, 8));
          result.needsUpdate = true;
          return result;
        })
        .catch((error) => {
          this.texturePromises.delete(key);
          throw error;
        }));
    }
    return this.texturePromises.get(key);
  }

  getGlobalParameterCollection() {
    return this.manifest.parameterCollections.find((collection) =>
      sourceName(collection.path) === 'MPC_GlobalEnvironment')
      ?? this.manifest.parameterCollections[0]
      ?? null;
  }

  createGlobalParameterSnapshot(overrides = {}) {
    const collection = this.getGlobalParameterCollection();
    const scalars = Object.fromEntries((collection?.scalar ?? []).map((parameter) => [
      parameter.parameter_name,
      finite(parameter.default_value, 0),
    ]));
    const vectors = Object.fromEntries((collection?.vector ?? []).map((parameter) => [
      parameter.parameter_name,
      [...(parameter.default_value ?? [0, 0, 0, 1])],
    ]));
    return {
      scalars: { ...scalars, ...(overrides.scalars ?? {}) },
      vectors: { ...vectors, ...(overrides.vectors ?? {}) },
    };
  }

  inventory() {
    const categoryCounts = {};
    for (const mesh of this.manifest.meshes) {
      categoryCounts[mesh.category] = (categoryCounts[mesh.category] ?? 0) + 1;
    }
    return {
      categories: categoryCounts,
      curves: this.manifest.curves.length,
      families: Object.fromEntries([...this.materialsByFamily].map(([family, profiles]) => [
        family,
        profiles.length,
      ])),
      functions: this.manifest.materialFunctions.length,
      materials: this.manifest.materials.length,
      meshes: this.manifest.meshes.length,
      parameterCollections: this.manifest.parameterCollections.length,
      textures: Object.keys(this.manifest.textures).length,
      unsupportedTextures: this.manifest.unsupportedTextures?.length ?? 0,
    };
  }
}

export async function loadSoStylizedSourceLibrary({
  baseUrl = DEFAULT_SO_STYLIZED_SOURCE_BASE_URL,
  fetchImpl = globalThis.fetch,
  landscapeWeightBaseUrl = DEFAULT_SO_STYLIZED_SNOWPINES_WEIGHT_LAYER_BASE_URL,
  textureLoader,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('loadSoStylizedSourceLibrary requires a fetch implementation.');
  }
  const [manifest, snowPinesWeightManifest] = await Promise.all([
    fetchManifest(baseUrl, fetchImpl),
    fetchLandscapeWeightManifest(landscapeWeightBaseUrl, fetchImpl),
  ]);
  return new SoStylizedSourceLibrary(manifest, {
    baseUrl,
    landscapeWeightmapSets: {
      [SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT.sourceAssetName]: {
        baseUrl: landscapeWeightBaseUrl,
        manifest: snowPinesWeightManifest,
      },
    },
    textureLoader,
  });
}
