import * as THREE from 'three';
import {
  createToonRockMaterial,
  normalizeToonLabRockProfile,
} from './rockMaterial.js';
import { createRockShaderSettings } from './rockShaderSettings.js';
import { markFactoryStyleMaterial } from '../styles/styleMetadata.js';

const ORIGINAL_MATERIALS = new WeakMap();
const ORIGINAL_SHADOW_FLAGS = new WeakMap();
let defaultTextureSet = null;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function seededNoise(x, y, seed) {
  const value = Math.sin((x * 127.1) + (y * 311.7) + (seed * 74.7)) * 43758.5453;
  return value - Math.floor(value);
}

function makeProceduralTexture({
  seed,
  color,
  variation = 0.12,
  size = 256,
  colorSpace = THREE.SRGBColorSpace,
  channel = 'color',
}) {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = ((y * size) + x) * 4;
      const broad = seededNoise(Math.floor(x / 8), Math.floor(y / 8), seed);
      const fine = seededNoise(x, y, seed + 11);
      const noise = ((broad * 0.65) + (fine * 0.35) - 0.5) * variation;

      if (channel === 'normal') {
        const nx = (seededNoise(x + 1, y, seed) - seededNoise(x - 1, y, seed)) * 0.22;
        const ny = (seededNoise(x, y + 1, seed) - seededNoise(x, y - 1, seed)) * 0.22;
        data[index] = Math.round((nx * 0.5 + 0.5) * 255);
        data[index + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[index + 2] = 255;
      } else if (channel === 'mask') {
        const value = Math.round(clamp01(color[0] + noise) * 255);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      } else {
        data[index] = Math.round(clamp01(color[0] + noise) * 255);
        data[index + 1] = Math.round(clamp01(color[1] + noise) * 255);
        data[index + 2] = Math.round(clamp01(color[2] + noise) * 255);
      }
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `ToonLabRockFallback_${seed}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = colorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.toonLabGeneratedRockShaderTexture = true;
  return texture;
}

/**
 * Creates the neutral, deterministic fallback texture set used by the
 * Call Me Sensei rock shader. Applications can replace any map with authored
 * or licensed textures without changing the shader preset.
 */
export function createDefaultRockShaderTextureSet() {
  if (defaultTextureSet) return defaultTextureSet;

  defaultTextureSet = Object.freeze({
    rock: makeProceduralTexture({
      seed: 3,
      // Measured sRGB mean of the captured first-party T_RockClassic_BC input
      // (179.70, 179.92, 178.98). Keeping the deterministic fallback anchored
      // to that source lets the shader produce its reviewed grey sun face and
      // cool sky-probe back face even when an imported rock has no usable map.
      color: [0.705, 0.706, 0.702],
      // Preserve readable macro breakup while keeping the measured mean fixed;
      // flattening variation to 0.06 makes untextured rocks look bare.
      variation: 0.18,
    }),
    rockNormal: makeProceduralTexture({
      seed: 5,
      color: [0.5, 0.5, 1],
      variation: 0,
      colorSpace: THREE.NoColorSpace,
      channel: 'normal',
    }),
    smoothness: makeProceduralTexture({
      seed: 7,
      color: [0.33, 0.33, 0.33],
      variation: 0.12,
      colorSpace: THREE.NoColorSpace,
      channel: 'mask',
    }),
    stripe: makeProceduralTexture({
      seed: 13,
      color: [0.58, 0.55, 0.5],
      variation: 0.2,
    }),
    moss: makeProceduralTexture({
      seed: 17,
      color: [0.3, 0.42, 0.2],
      variation: 0.16,
    }),
    grass: makeProceduralTexture({
      seed: 19,
      color: [0.32, 0.48, 0.19],
      variation: 0.14,
    }),
    snow: makeProceduralTexture({
      seed: 23,
      color: [0.88, 0.91, 0.94],
      variation: 0.06,
    }),
    sand: makeProceduralTexture({
      seed: 29,
      color: [0.7, 0.58, 0.39],
      variation: 0.1,
    }),
    sandNormal: makeProceduralTexture({
      seed: 31,
      color: [0.5, 0.5, 1],
      variation: 0,
      colorSpace: THREE.NoColorSpace,
      channel: 'normal',
    }),
    topMask: makeProceduralTexture({
      seed: 37,
      color: [0.56, 0.56, 0.56],
      variation: 0.3,
      colorSpace: THREE.NoColorSpace,
      channel: 'mask',
    }),
  });

  return defaultTextureSet;
}

function tintArray(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.slice(0, 3).map((channel) => clamp01(channel));
}

/**
 * Converts the stable, editor-facing rock shader schema into the lower-level
 * material profile consumed by the TSL implementation.
 */
export function rockShaderSettingsToProfile(input = {}) {
  const settings = createRockShaderSettings(input);
  const {
    projection,
    material,
    lighting,
    shoreline,
    distanceTint,
    normals,
    striping,
    moss,
    layerMask,
    grassLayer,
    snowLayer,
    sandLayer,
  } = settings;

  return normalizeToonLabRockProfile({
    base: {
      scale: projection.scale,
      projectionContrast: projection.projectionContrast,
      sideOnly: projection.sideOnly,
      saturation: projection.saturation,
      contrast: projection.contrast,
      brightness: projection.brightness,
      nearDetailScale: projection.nearDetailScale,
      nearDetailStrength: projection.nearDetailStrength,
      nearDetailDistance: projection.nearDetailDistance,
      tint: tintArray(material.tint, [1, 1, 1]),
      metallic: material.metallic,
      smoothness: material.smoothness,
      useSmoothnessTexture: material.useSmoothnessTexture,
      smoothnessContrast: material.smoothnessContrast,
      emissiveStrength: material.emissiveStrength,
      closeTintDistance: distanceTint.closeDistance,
      farTintDistance: distanceTint.farDistance,
      distantTint: tintArray(distanceTint.color, [0.6, 0.67, 0.72]),
      distantTintMix: distanceTint.strength,
      striping: {
        enabled: striping.enabled,
        scale: striping.scale,
        contrast: striping.contrast,
        color: tintArray(striping.color, [0.7, 0.68, 0.64]),
      },
    },
    lighting: {
      exposure: lighting.exposure,
      ambientFloor: lighting.ambientFloor,
      skyFillStrength: lighting.skyFillStrength,
      skyFillTint: tintArray(lighting.skyFillTint, [1, 1, 1]),
    },
    shoreline: {
      wetBandWidth: shoreline.wetBandWidth,
      wetBandDarkening: shoreline.wetBandDarkening,
      wetRoughness: shoreline.wetRoughness,
    },
    normals: {
      distance: normals.distance,
      nearFlatten: normals.nearFlatten,
      farFlatten: normals.farFlatten,
      useSmoothed: normals.useSmoothed,
      normalGreenSign: normals.normalGreenSign,
    },
    moss: {
      enabled: moss.enabled,
      size: moss.size,
      sharpness: moss.sharpness,
      offset: moss.offset,
      multiply: moss.multiply,
      colorPower: moss.colorPower,
      lowColor: tintArray(moss.lowColor, [0.18, 0.28, 0.09]),
      highColor: tintArray(moss.highColor, [0.42, 0.55, 0.2]),
    },
    layers: {
      maskEnabled: layerMask.useAssetMask,
      sharpness: layerMask.sharpness,
      offset: layerMask.offset,
      grass: {
        enabled: grassLayer.enabled,
        useGroundShader: grassLayer.useGroundShader,
        scale: grassLayer.scale,
        tint: tintArray(grassLayer.tint, [0.48, 0.65, 0.3]),
        saturation: grassLayer.saturation,
        emission: grassLayer.emission,
      },
      snow: {
        enabled: snowLayer.enabled,
        scale: snowLayer.scale,
        tint: tintArray(snowLayer.tint, [0.9, 0.93, 0.96]),
        saturation: snowLayer.saturation,
        emission: snowLayer.emission,
      },
      sand: {
        enabled: sandLayer.enabled,
        useGroundShader: sandLayer.useGroundShader,
        scale: sandLayer.scale,
        tint: tintArray(sandLayer.tint, [0.72, 0.59, 0.4]),
        saturation: sandLayer.saturation,
        emission: sandLayer.emission,
        normalScale: sandLayer.normalScale,
        normalStrength: sandLayer.normalStrength,
        normalRotationDegrees: sandLayer.normalRotationDegrees,
      },
    },
  });
}

function ensureScalarAttribute(geometry, name, value) {
  if (!geometry?.attributes || geometry.getAttribute(name)) return;
  const count = geometry.getAttribute('position')?.count ?? 0;
  const values = new Float32Array(count);
  values.fill(value);
  geometry.setAttribute(name, new THREE.BufferAttribute(values, 1));
}

function ensureColorAttribute(geometry) {
  if (!geometry?.attributes || geometry.getAttribute('color')) return;
  const count = geometry.getAttribute('position')?.count ?? 0;
  const values = new Float32Array(count * 3);
  values.fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
}

function disposeOwnedMaterial(material) {
  const materials = Array.isArray(material) ? material : [material];
  for (const candidate of materials) {
    if (candidate?.userData?.toonLabRockShaderOwned) candidate.dispose();
  }
}

function createMaterialForSource({
  sourceMaterial,
  settings,
  profile,
  textures,
  name,
}) {
  const fallback = createDefaultRockShaderTextureSet();
  const textureSet = {
    ...fallback,
    ...textures,
  };

  const sourceAlbedoMode = settings.assetIntegration.sourceAlbedoMode;
  const sourceAlbedoStrength = sourceAlbedoMode === 'retain'
    ? 1
    : sourceAlbedoMode === 'blend'
      ? settings.assetIntegration.sourceAlbedoStrength
      : 0;
  if (sourceMaterial?.map && sourceAlbedoStrength > 0) {
    textureSet.sourceRock = sourceMaterial.map;
  }
  if (settings.assetIntegration.sourceNormalStrength > 0 && sourceMaterial?.normalMap) {
    textureSet.sourceNormal = sourceMaterial.normalMap;
  }
  if (sourceAlbedoStrength > 0 && sourceMaterial?.roughnessMap) {
    textureSet.sourceRoughness = sourceMaterial.roughnessMap;
  }
  if (settings.assetIntegration.sourceAoStrength > 0 && sourceMaterial?.aoMap) {
    textureSet.sourceAo = sourceMaterial.aoMap;
  }

  const rockMaterial = createToonRockMaterial({
    assetIntegration: {
      ...settings.assetIntegration,
      sourceAlbedoStrength,
    },
    profile,
    textures: textureSet,
    name,
  });
  rockMaterial.userData.toonLabRockShaderOwned = true;
  rockMaterial.userData.toonLabRockShaderPreset = settings.preset;
  rockMaterial.userData.toonLabRockTextureSource = textures?.rock
    ? 'provided'
    : 'first-party-generated';
  rockMaterial.userData.toonlabSourceTextureIds = [...new Set([
    textureSet.sourceRock,
    textureSet.sourceNormal,
    textureSet.sourceRoughness,
    textureSet.sourceAo,
  ].filter((texture) => texture?.isTexture && texture.uuid).map((texture) => texture.uuid))];
  rockMaterial.userData.toonLabRockTextureComposition = {
    base: textures?.rock ? 'provided' : 'first-party-generated',
    sourceAlbedoMode,
    sourceAlbedoStrength,
    sourceNormalStrength: settings.assetIntegration.sourceNormalStrength,
    sourceAoStrength: settings.assetIntegration.sourceAoStrength,
    sourceTextureCount: rockMaterial.userData.toonlabSourceTextureIds.length,
  };
  rockMaterial.userData.environmentShaderExclude = true;
  return markFactoryStyleMaterial(rockMaterial, 'RockSurface');
}

export function createRockShaderMaterial({
  settings: input = {},
  textures = {},
  sourceMaterial = null,
  name = 'Call Me Sensei Rock',
} = {}) {
  const settings = createRockShaderSettings(input);
  return createMaterialForSource({
    sourceMaterial,
    settings,
    profile: rockShaderSettingsToProfile(settings),
    textures,
    name,
  });
}

/**
 * Applies a rock shader preset to meshes without coupling the shader document
 * to procedural asset generation. Geometry can contribute optional `color`
 * and `envVertexAo` channels; missing channels receive neutral defaults.
 */
export function applyRockShader(root, input = {}, {
  textures = {},
  include = null,
  name = 'Call Me Sensei Rock',
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const settings = createRockShaderSettings(input);
  const profile = rockShaderSettingsToProfile(settings);
  const retainedSourceTextureIds = new Set();
  const report = {
    preset: settings.preset,
    matched: 0,
    applied: 0,
    skipped: 0,
    textureSource: textures?.rock ? 'provided' : 'first-party-generated',
    usedGeneratedTextures: !textures?.rock,
    shadowDefaultsApplied: 0,
    retainedSourceTextures: 0,
  };

  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    if (object.userData?.rockShaderExclude === true) {
      report.skipped += 1;
      return;
    }
    if (typeof include === 'function' && include(object) !== true) {
      report.skipped += 1;
      return;
    }

    report.matched += 1;
    if (!ORIGINAL_MATERIALS.has(object)) ORIGINAL_MATERIALS.set(object, object.material);
    if (!ORIGINAL_SHADOW_FLAGS.has(object)) {
      ORIGINAL_SHADOW_FLAGS.set(object, {
        castShadow: object.castShadow,
        receiveShadow: object.receiveShadow,
      });
    }
    const originalMaterial = ORIGINAL_MATERIALS.get(object);

    if (settings.assetIntegration.vertexColorStrength > 0) ensureColorAttribute(object.geometry);
    if (settings.assetIntegration.vertexAoStrength > 0) {
      ensureScalarAttribute(object.geometry, 'envVertexAo', 1);
    }

    disposeOwnedMaterial(object.material);
    const sourceMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
    const nextMaterials = sourceMaterials.map((sourceMaterial, index) => createMaterialForSource({
      sourceMaterial,
      settings,
      profile,
      textures,
      name: sourceMaterials.length > 1 ? `${name} ${index + 1}` : name,
    }));
    for (const material of nextMaterials) {
      for (const textureId of material.userData.toonlabSourceTextureIds ?? []) {
        retainedSourceTextureIds.add(textureId);
      }
    }
    object.material = Array.isArray(originalMaterial) ? nextMaterials : nextMaterials[0];
    object.castShadow = Boolean(castShadow);
    object.receiveShadow = Boolean(receiveShadow);
    report.shadowDefaultsApplied += 1;
    object.userData.rockShaderPreset = settings.preset;
    report.applied += 1;
  });

  report.retainedSourceTextures = retainedSourceTextureIds.size;

  return report;
}

export function restoreRockShader(root) {
  let restored = 0;
  root?.traverse?.((object) => {
    if (!object?.isMesh || !ORIGINAL_MATERIALS.has(object)) return;
    disposeOwnedMaterial(object.material);
    object.material = ORIGINAL_MATERIALS.get(object);
    const flags = ORIGINAL_SHADOW_FLAGS.get(object);
    if (flags) {
      object.castShadow = flags.castShadow;
      object.receiveShadow = flags.receiveShadow;
      ORIGINAL_SHADOW_FLAGS.delete(object);
    }
    ORIGINAL_MATERIALS.delete(object);
    delete object.userData.rockShaderPreset;
    restored += 1;
  });
  return restored;
}

/** Updates current scene inputs without changing the portable rock preset. */
export function setRockShaderSceneState(root, { waterLevel } = {}) {
  let updated = 0;
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const state = material?.userData?.toonLabRockSceneState;
      if (!state) continue;
      if (Number.isFinite(Number(waterLevel))) state.setWaterLevel(Number(waterLevel));
      updated += 1;
    }
  });
  return { updated, waterLevel: Number.isFinite(Number(waterLevel)) ? Number(waterLevel) : null };
}

export function disposeDefaultRockShaderTextures() {
  if (!defaultTextureSet) return;
  for (const texture of Object.values(defaultTextureSet)) texture.dispose();
  defaultTextureSet = null;
}
