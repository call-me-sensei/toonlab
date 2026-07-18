// The four vegetation MASTER SHADERS as first-class, configurable preset
// documents: Foliage (tree/bush canopies), Grass (instanced blades), Flower
// (bloom heads), and Bark (trunks/limbs). One master per rendering problem;
// looks are preset INSTANCES of a master.
//
// Strict taxonomy (see docs): a shader carries TREATMENT ONLY — response
// strengths, band shaping, treatment tints. Albedo lives on the asset
// (palette/textures); light sources and weather live on the scene. Every
// field below is backed by a real material uniform — nothing decorative.
//
// Developer pipeline:
//   import {
//     createFoliageShaderSettings, applyFoliageShader,
//     createGrassShaderSettings,   applyGrassShader,
//     createFlowerShaderSettings,  applyFlowerShader,
//     createBarkShaderSettings,    applyBarkShader,
//   } from '@call-me-sensei/toonlab/vegetation';
//
//   const shading = createFoliageShaderSettings({ preset: 'my_ip' });
//   applyFoliageShader(tree, shading);       // per OBJECT TYPE treatment
//   // per-instance identity stays on the asset: new StylizedTree({ canopyColor, seed, size, ... })

import * as THREE from 'three';

const VEGETATION_SHADER_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function srgbTriplet(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : [...fallback];
}

/** Generic master registry: schema + presets + settings/document plumbing. */
function defineMaster({ documentType, fields, id, label, description }) {
  const presets = new Map();
  const defaults = Object.freeze(Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.defaultValue]),
  ));

  function createSettings(options = {}) {
    const source = isPlainObject(options) ? options : {};
    const presetName = typeof source.preset === 'string' ? source.preset : null;
    const base = presetName && presets.has(presetName)
      ? { ...defaults, ...presets.get(presetName).settings }
      : { ...defaults };
    const settings = {};
    for (const [key, field] of Object.entries(fields)) {
      const raw = source[key] !== undefined ? source[key] : base[key];
      settings[key] = field.type === 'color'
        ? srgbTriplet(raw, defaults[key])
        : clampNumber(raw, base[key], field.range ?? {});
    }
    return settings;
  }

  function registerPreset(name, { label: presetLabel, settings = {} } = {}, { overwrite = false } = {}) {
    const key = String(name ?? '').trim();
    if (!key) throw new Error(`${label} preset name is required.`);
    if (!overwrite && presets.has(key)) throw new Error(`${label} preset "${key}" already exists.`);
    presets.set(key, { label: String(presetLabel ?? key), settings: createSettings(settings) });
  }

  function getPresetOptions() {
    return [...presets.entries()].map(([value, entry]) => ({ label: entry.label, value }));
  }

  function validateDocument(input) {
    const source = typeof input === 'string'
      ? (() => { try { return JSON.parse(input); } catch { return null; } })()
      : input;
    if (!isPlainObject(source)) return { errors: [`${label} shader preset must be a JSON object.`], ok: false };
    if (source.type !== documentType) return { errors: [`Document type must be "${documentType}".`], ok: false };
    const docId = String(source.id ?? '').trim();
    const docLabel = String(source.label ?? '').trim();
    if (!docId || !docLabel) return { errors: [`${label} shader preset needs an id and a label.`], ok: false };
    return { ok: true, value: { id: docId, label: docLabel, settings: createSettings(source.settings ?? {}) } };
  }

  function createDocument(docId, { label: docLabel, settings = {} } = {}) {
    return {
      id: String(docId),
      label: String(docLabel ?? docId),
      schemaVersion: VEGETATION_SHADER_SCHEMA_VERSION,
      settings: createSettings(settings),
      type: documentType,
    };
  }

  // Field metadata in the shared settings-schema shape (SchemaGroup-ready).
  const fieldSchema = Object.freeze(Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, Object.freeze({
      defaultValue: field.defaultValue,
      description: field.description,
      group: id,
      id: `${id}.${key}`,
      key,
      label: field.label,
      range: field.range ?? null,
      type: field.type ?? 'number',
    })]),
  ));

  return Object.freeze({
    createDocument,
    createSettings,
    defaults,
    description,
    documentType,
    fieldSchema,
    getPresetOptions,
    id,
    label,
    registerPreset,
    validateDocument,
  });
}

// ---- Foliage — tree & bush canopies (stylizedTreeFoliage) -----------------

export const FOLIAGE_SHADER = defineMaster({
  description: 'Canopy treatment for trees and bushes: backlight, shadow response, cloud-shadow response, sprite cutout.',
  documentType: 'toonlab/foliage-shader',
  id: 'foliage',
  label: 'Foliage',
  fields: {
    backlitStrength: {
      defaultValue: 0.35,
      description: 'Translucent glow on leaves between the camera and the sun.',
      label: 'Backlit Strength',
      range: { max: 1.5, min: 0, step: 0.01 },
    },
    sceneShadowStrength: {
      defaultValue: 0.55,
      description: 'How strongly renderer shadow maps shift the crown toward its shadow tone.',
      label: 'Scene Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    cloudShadowStrength: {
      defaultValue: 0,
      description: 'How strongly the scene’s drifting cloud shadows darken the crown. Cloud shape/speed are scene weather.',
      label: 'Cloud Shadow Response',
      range: { max: 1, min: 0, step: 0.01 },
    },
    alphaCutoff: {
      defaultValue: 0.3,
      description: 'Leaf-sprite cutout threshold; low enough that mipmapped alpha does not erode distant crowns.',
      label: 'Alpha Cutoff',
      range: { max: 0.9, min: 0.05, step: 0.01 },
    },
  },
});

const FOLIAGE_UNIFORM_BY_FIELD = Object.freeze({
  alphaCutoff: 'uAlphaCutoff',
  backlitStrength: 'uBacklitStrength',
  cloudShadowStrength: 'uCloudShadowStrength',
  sceneShadowStrength: 'uSceneShadowStrength',
});

/** Applies foliage treatment to every canopy material under `root`. */
export function applyFoliageShader(root, settings) {
  const resolved = FOLIAGE_SHADER.createSettings(settings);
  let count = 0;
  root.traverse?.((obj) => {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      const uniforms = material?.uniforms;
      if (!uniforms?.uBacklitStrength || !uniforms?.uSceneShadowStrength) continue;
      for (const [field, uniformName] of Object.entries(FOLIAGE_UNIFORM_BY_FIELD)) {
        if (uniforms[uniformName]) uniforms[uniformName].value = resolved[field];
      }
      count += 1;
    }
  });
  return count;
}

// ---- Grass — instanced blade fields (stylizedGrass) ------------------------

export const GRASS_SHADER = defineMaster({
  description: 'Blade treatment: backlight, scene/cloud shadow response, shadow tint, character push response.',
  documentType: 'toonlab/grass-shader',
  id: 'grass',
  label: 'Grass',
  fields: {
    backlitStrength: {
      defaultValue: 0.4,
      description: 'Translucent glow on blades between the camera and the sun.',
      label: 'Backlit Strength',
      range: { max: 1.5, min: 0, step: 0.01 },
    },
    shadowStrength: {
      defaultValue: 0.7,
      description: 'How strongly scene shadows darken the blades.',
      label: 'Scene Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    shadowTint: {
      defaultValue: Object.freeze([0.36, 0.4, 0.58]),
      description: 'Treatment tint mixed into shadowed blades — hue shift, not just darkening.',
      label: 'Shadow Tint',
      type: 'color',
    },
    cloudShadowStrength: {
      defaultValue: 0.35,
      description: 'How strongly cloud shadows darken the field. Cloud shape/speed are scene weather.',
      label: 'Cloud Shadow Response',
      range: { max: 1, min: 0, step: 0.01 },
    },
    pushRadius: {
      defaultValue: 0.6,
      description: 'How far around the push target (a walking character) blades part.',
      label: 'Push Radius',
      range: { max: 2, min: 0, step: 0.02 },
    },
  },
});

/** Applies grass treatment to a StylizedGrassField (or anything with applySettings). */
export function applyGrassShader(field, settings) {
  const resolved = GRASS_SHADER.createSettings(settings);
  field?.applySettings?.(resolved);
  return resolved;
}

// ---- Flower — bloom heads (shaders-tsl/flower) -----------------------------

export const FLOWER_SHADER = defineMaster({
  description: 'Bloom treatment: the unlit-petal lift that keeps cup interiors reading as petal color instead of toon-band black.',
  documentType: 'toonlab/flower-shader',
  id: 'flower',
  label: 'Flower',
  fields: {
    unlitPetalLift: {
      defaultValue: 0.35,
      description: 'Emissive floor for unlit petal faces — cup interiors and shaded petals keep petal color instead of crushing to the dark band.',
      label: 'Unlit Petal Lift',
      range: { max: 1, min: 0, step: 0.01 },
    },
  },
});

/** Applies flower treatment to every bloom material under `root`. */
export function applyFlowerShader(root, settings) {
  const resolved = FLOWER_SHADER.createSettings(settings);
  let count = 0;
  root.traverse?.((obj) => {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (material?.uniforms?.uUnlitLift) {
        material.uniforms.uUnlitLift.value = resolved.unlitPetalLift;
        count += 1;
      }
    }
  });
  return count;
}

// ---- Bark — trunks & limbs (MeshToonMaterial banding) ----------------------

export const BARK_SHADER = defineMaster({
  description: 'Trunk treatment: cel band count, shadow floor, and band softness via the toon gradient ramp. (Roadmap: cavity ink, treatment tints — see environment-master route.)',
  documentType: 'toonlab/bark-shader',
  id: 'bark',
  label: 'Bark',
  fields: {
    bandCount: {
      defaultValue: 3,
      description: 'Cel bands across the trunk’s light-to-shadow ramp.',
      label: 'Band Count',
      range: { max: 6, min: 2, step: 1 },
    },
    shadowFloor: {
      defaultValue: 0.35,
      description: 'Brightness of the darkest band — the never-crush-to-black floor.',
      label: 'Shadow Floor',
      range: { max: 0.9, min: 0, step: 0.01 },
    },
    bandSoftness: {
      defaultValue: 0,
      description: '0 = hard cel steps; higher blends the ramp toward smooth shading.',
      label: 'Band Softness',
      range: { max: 1, min: 0, step: 0.05 },
    },
  },
});

/** Builds the toon gradient ramp a bark setting describes. */
export function createBarkGradientMap(settings) {
  const resolved = BARK_SHADER.createSettings(settings);
  const steps = Math.max(2, Math.round(resolved.bandCount));
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x += 1) {
    const t = x / (width - 1);
    const stepped = Math.floor(t * steps) / (steps - 1 || 1);
    const value = resolved.shadowFloor + (1 - resolved.shadowFloor) * Math.min(stepped, 1);
    const level = Math.round(value * 255);
    data.set([level, level, level, 255], x * 4);
  }
  const texture = new THREE.DataTexture(data, width, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = resolved.bandSoftness > 0 ? THREE.LinearFilter : THREE.NearestFilter;
  texture.magFilter = texture.minFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Applies bark treatment to every MeshToonMaterial trunk under `root`. */
export function applyBarkShader(root, settings) {
  const gradientMap = createBarkGradientMap(settings);
  let count = 0;
  root.traverse?.((obj) => {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material?.isMeshToonMaterial) continue;
      material.gradientMap?.dispose?.();
      material.gradientMap = gradientMap;
      material.needsUpdate = true;
      count += 1;
    }
  });
  return count;
}

// ---- Registry --------------------------------------------------------------

export const VEGETATION_SHADERS = Object.freeze([FOLIAGE_SHADER, GRASS_SHADER, FLOWER_SHADER, BARK_SHADER]);

for (const master of VEGETATION_SHADERS) {
  master.registerPreset('default', { label: 'Default' });
}
FOLIAGE_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { backlitStrength: 0.45, cloudShadowStrength: 0.4, sceneShadowStrength: 0.6 },
});
GRASS_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { backlitStrength: 0.5, cloudShadowStrength: 0.45, shadowTint: [0.34, 0.36, 0.6] },
});
FLOWER_SHADER.registerPreset('call_me_sensei', { label: 'Call Me Sensei', settings: { unlitPetalLift: 0.4 } });
BARK_SHADER.registerPreset('call_me_sensei', { label: 'Call Me Sensei', settings: { bandCount: 3, shadowFloor: 0.42 } });

export const createFoliageShaderSettings = FOLIAGE_SHADER.createSettings;
export const createGrassShaderSettings = GRASS_SHADER.createSettings;
export const createFlowerShaderSettings = FLOWER_SHADER.createSettings;
export const createBarkShaderSettings = BARK_SHADER.createSettings;
