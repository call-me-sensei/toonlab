// Style bundles — ONE named document that mixes and matches an IP-wide style
// per visual system ("slot"), plus explicit asset documents such as a tree
// recipe. Asset/condition presets remain runtime state and are rendered
// through these styles rather than being mistaken for styles themselves.
// Labs and games reference a bundle
// (a local JSON or a published toonlab.io slug) and get every system's
// resolved settings in one call:
//
//   import { fetchStyleBundle } from '@call-me-sensei/toonlab/styles';
//   const { settings } = await fetchStyleBundle('sakura-dusk');
//   applyToonShader(character, { settings: settings.toon });
//   const water = new WaterSurface({ preset: 'river', ...settings.water });
//
// New style selections serialize as { style: '<built-in id>' }. Historical
// { preset: '<id>' } payloads remain accepted forever, including the
// short-lived scenario-as-style encodings. A slot may instead hold
// { document: {…} } (a full inline portable document) or { creation: '<id>' }.
// Publishing on toonlab.io resolves references into inline documents.

import {
  createToonSettings,
  parseToonPresetDocument,
  TOON_PRESET_DOCUMENT_TYPE,
} from '../toon/toonSettings.js';
import {
  createWaterSettings,
  parseWaterPresetDocument,
  resolveWaterStyleName,
  WATER_PRESET_DOCUMENT_TYPE,
} from '../water/waterSettings.js';
import { createWeatherSettings } from '../weather/weatherSettings.js';
import {
  parseWeatherPresetDocument,
  resolveWeatherPreset,
  resolveWeatherStyleName,
  WEATHER_PRESET_DOCUMENT_TYPE,
} from '../weather/weatherPresets.js';
import { createEnvironmentSettings } from '../environment/environmentMaterialAdapter.js';
import {
  ENVIRONMENT_PRESET_DOCUMENT_TYPE,
  ENVIRONMENT_PRESET_ALIASES,
  normalizeEnvironmentPresetName,
  resolveEnvironmentPreset,
  validateEnvironmentPresetDocument,
} from '../environment/environmentPresets.js';
import { createPostProcessingSettings } from '../post/postProcessing.js';
import {
  createSkySettings,
  parseSkyPresetDocument,
  resolveSkyStyleName,
  SKY_PRESET_ALIASES,
  SKY_PRESET_DOCUMENT_TYPE,
} from '../sky/stylizedSky.js';
import {
  CLOUD_SHADER_DOCUMENT_TYPE,
  createCloudShaderSettings,
  parseCloudShaderPresetDocument,
} from '../cloud/index.js';
import {
  createGrassSettings,
  GRASS_PRESET_DOCUMENT_TYPE,
  parseGrassPresetDocument,
} from '../vegetation/stylizedGrass.js';
import { createFlowerSettings } from '../vegetation/stylizedFlowers.js';
import {
  createFlowerShaderProfileSettings,
  createGrassShaderProfileSettings,
  createTreeShaderSettings,
  createVegetationShaderSettings,
  FLOWER_SHADER_PROFILE_DOCUMENT_TYPE,
  GRASS_SHADER_PROFILE_DOCUMENT_TYPE,
  parseVegetationShaderPresetDocument,
  parseFlowerShaderProfilePresetDocument,
  parseGrassShaderProfilePresetDocument,
  parseTreeShaderPresetDocument,
  TREE_SHADER_DOCUMENT_TYPE,
  VEGETATION_SHADER_DOCUMENT_TYPE,
} from '../vegetation/vegetationShaders.js';
import {
  TREE_RECIPE_SCHEMA,
  validateTreeRecipeDocument,
} from '../vegetation/treeRecipe.js';
import {
  createRockShaderSettings,
  parseRockShaderPresetDocument,
  ROCK_SHADER_DOCUMENT_TYPE,
} from '../rock-shader/index.js';
import {
  createGroundShaderSettings,
  GROUND_SHADER_DOCUMENT_TYPE,
  parseGroundShaderPresetDocument,
} from '../ground-shader/index.js';
import { resolveDebrisStyleName } from '../debrisgen/debrisPresets.js';

export const STYLE_BUNDLE_DOCUMENT_TYPE = 'toonlab/style-bundle';
export const STYLE_BUNDLE_SCHEMA_VERSION = 1;
export const DEFAULT_STYLE_BUNDLE_BASE_URL = 'https://toonlab.io';

/**
 * The bundle's slots: one per system, each resolving to that system's
 * settings or style-selection object. `selectionKind` distinguishes proper
 * style selections from document-only slots. `documentType` is the inline
 * portable document type the slot accepts (null = built-in style only).
 */
export const STYLE_BUNDLE_SLOTS = Object.freeze({
  toon: Object.freeze({
    documentType: TOON_PRESET_DOCUMENT_TYPE,
    label: 'Character toon shading',
    parseDocument: parseToonPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => {
      if (payload.document) return createToonSettings(payload.document.settings);
      const style = selectedStyleId(payload);
      return withStyleIdentity(createToonSettings({ preset: style }), style);
    },
  }),
  treeShader: Object.freeze({
    documentType: TREE_SHADER_DOCUMENT_TYPE,
    label: 'Tree shader',
    parseDocument: parseTreeShaderPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => (
      payload.document
        ? createTreeShaderSettings(payload.document.settings)
        : createTreeShaderSettings({ preset: selectedStyleId(payload) })
    ),
  }),
  grassShader: Object.freeze({
    documentType: GRASS_SHADER_PROFILE_DOCUMENT_TYPE,
    label: 'Grass shader',
    parseDocument: parseGrassShaderProfilePresetDocument,
    selectionKind: 'style',
    resolve: (payload) => (
      payload.document
        ? createGrassShaderProfileSettings(payload.document.settings)
        : createGrassShaderProfileSettings({ preset: selectedStyleId(payload) })
    ),
  }),
  flowerShader: Object.freeze({
    documentType: FLOWER_SHADER_PROFILE_DOCUMENT_TYPE,
    label: 'Flower shader',
    parseDocument: parseFlowerShaderProfilePresetDocument,
    selectionKind: 'style',
    resolve: (payload) => (
      payload.document
        ? createFlowerShaderProfileSettings(payload.document.settings)
        : createFlowerShaderProfileSettings({ preset: selectedStyleId(payload) })
    ),
  }),
  tree: Object.freeze({
    documentType: TREE_RECIPE_SCHEMA,
    label: 'Trees',
    // Tree recipes carry { type, options } (not .settings) and resolve to
    // the recipe document itself — hand it to createPlantFromRecipe(
    // settings.tree). No built-in preset ids: fill by document or creation.
    parseDocument: validateTreeRecipeDocument,
    selectionKind: 'document',
    resolve: (payload) => {
      if (payload.document) return payload.document;
      throw new Error(
        `Style bundle slot "tree" has no built-in preset "${payload.preset}" — inline a tree recipe document or reference a saved recipe.`,
      );
    },
  }),
  grass: Object.freeze({
    documentType: GRASS_PRESET_DOCUMENT_TYPE,
    label: 'Grass',
    parseDocument: parseGrassPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => {
      if (payload.document) return createGrassSettings(payload.document.settings);
      const style = selectedStyleId(payload);
      return withStyleIdentity(createGrassSettings({ preset: style }), style);
    },
  }),
  flowers: Object.freeze({
    documentType: null,
    label: 'Flowers',
    parseDocument: null,
    selectionKind: 'style',
    resolve: (payload) => {
      const style = selectedStyleId(payload);
      return withStyleIdentity(createFlowerSettings({ preset: style }), style);
    },
  }),
  vegetationShader: Object.freeze({
    documentType: VEGETATION_SHADER_DOCUMENT_TYPE,
    label: 'Vegetation shader compatibility aggregate',
    parseDocument: parseVegetationShaderPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => {
      if (payload.document) return createVegetationShaderSettings(payload.document.settings);
      const style = selectedStyleId(payload);
      return withStyleIdentity(createVegetationShaderSettings({ preset: style }), style);
    },
  }),
  rock: Object.freeze({
    documentType: ROCK_SHADER_DOCUMENT_TYPE,
    label: 'Rock shader',
    parseDocument: parseRockShaderPresetDocument,
    selectionKind: 'style',
    // Rock geometry and baked asset channels remain in a rockgen project.
    // Apply this resolved material document afterwards with applyRockShader().
    resolve: (payload) => (
      payload.document
        ? createRockShaderSettings(payload.document.settings)
        : createRockShaderSettings({ preset: selectedStyleId(payload) })
    ),
  }),
  debris: Object.freeze({
    documentType: null,
    label: 'Debris',
    parseDocument: null,
    selectionKind: 'style',
    // Pass settings.debris.style to applyDebrisStyle(assetSettings, style).
    resolve: (payload) => ({ style: resolveDebrisStyleName(selectedStyleId(payload)) }),
  }),
  water: Object.freeze({
    documentType: WATER_PRESET_DOCUMENT_TYPE,
    label: 'Water',
    parseDocument: parseWaterPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => {
      if (payload.document) return createWaterSettings(payload.document.settings);
      // Explicit style payloads use the orthogonal axis. Legacy `preset`
      // payloads retain the historical behavior (including river/ocean).
      return payload.style
        ? { style: resolveWaterStyleName(payload.style) }
        : createWaterSettings(payload);
    },
  }),
  sky: Object.freeze({
    documentType: SKY_PRESET_DOCUMENT_TYPE,
    label: 'Sky',
    parseDocument: parseSkyPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => {
      if (payload.document) return createSkySettings(payload.document.settings);
      if (payload.style) return { style: resolveSkyStyleName(payload.style) };
      const styleIdentity = SKY_PRESET_ALIASES[payload.preset]?.preset ?? payload.preset;
      return withStyleIdentity(createSkySettings({ preset: payload.preset }), styleIdentity);
    },
  }),
  cloud: Object.freeze({
    documentType: CLOUD_SHADER_DOCUMENT_TYPE,
    label: 'Cloud shader',
    parseDocument: parseCloudShaderPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => (
      payload.document
        ? createCloudShaderSettings(payload.document.settings)
        : createCloudShaderSettings({ preset: selectedStyleId(payload) })
    ),
  }),
  weather: Object.freeze({
    documentType: WEATHER_PRESET_DOCUMENT_TYPE,
    label: 'Weather',
    parseDocument: parseWeatherPresetDocument,
    selectionKind: 'style',
    // A weather bundle selection is a STYLE (default / call_me_sensei) —
    // conditions are runtime world-state driven through WeatherSystem.
    // Legacy condition ids keep resolving to that condition unchanged.
    resolve: (payload) => {
      if (payload.document) return createWeatherSettings(payload.document.settings ?? payload.document);
      if (payload.style) {
        return { style: resolveWeatherStyleName(payload.style) };
      }
      const resolved = resolveWeatherPreset(payload.preset);
      return withStyleIdentity(resolved.settings, resolved.style);
    },
  }),
  environment: Object.freeze({
    documentType: ENVIRONMENT_PRESET_DOCUMENT_TYPE,
    label: 'Environment',
    // Environment preset documents carry { features, materialLook,
    // parameters } at the validated top level (not .settings like
    // toon/water/weather).
    parseDocument: (input) => validateEnvironmentPresetDocument(input),
    selectionKind: 'style',
    resolve: (payload) => {
      if (payload.document) {
        const parsed = validateEnvironmentPresetDocument(payload.document);
        if (!parsed.ok) throw new Error(parsed.errors.join(' '));
        return {
          ...createEnvironmentSettings({
            features: parsed.value.features,
            parameters: parsed.value.parameters,
          }),
          materialLook: parsed.value.materialLook,
        };
      }
      if (payload.style) {
        const styleIdentity = ENVIRONMENT_PRESET_ALIASES[payload.style]?.preset
          ?? normalizeEnvironmentPresetName(payload.style);
        return { style: styleIdentity };
      }
      const preset = resolveEnvironmentPreset(payload.preset);
      const styleIdentity = ENVIRONMENT_PRESET_ALIASES[payload.preset]?.preset
        ?? normalizeEnvironmentPresetName(payload.preset);
      return withStyleIdentity(
        {
          ...createEnvironmentSettings({
            features: preset.features,
            parameters: preset.parameters,
          }),
          materialLook: preset.materialLook,
        },
        styleIdentity,
      );
    },
  }),
  post: Object.freeze({
    documentType: null,
    label: 'Post processing',
    parseDocument: null,
    selectionKind: 'style',
    resolve: (payload) => {
      const style = selectedStyleId(payload);
      return withStyleIdentity(createPostProcessingSettings({ preset: style }), style);
    },
  }),
  groundShader: Object.freeze({
    documentType: GROUND_SHADER_DOCUMENT_TYPE,
    label: 'Ground and terrain shader',
    parseDocument: parseGroundShaderPresetDocument,
    selectionKind: 'style',
    resolve: (payload) => (
      payload.document
        ? createGroundShaderSettings(payload.document.settings)
        : createGroundShaderSettings({ preset: selectedStyleId(payload) })
    ),
  }),
});

export const STYLE_BUNDLE_SLOT_IDS = Object.freeze(Object.keys(STYLE_BUNDLE_SLOTS));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function selectedStyleId(payload) {
  return typeof payload?.style === 'string' && payload.style.trim()
    ? payload.style.trim()
    : typeof payload?.preset === 'string' ? payload.preset.trim() : '';
}

function withStyleIdentity(settings, style) {
  return isPlainObject(settings) && style ? { ...settings, style } : settings;
}

/**
 * Validate a style-bundle document. Returns { ok: true, value } with a
 * normalized copy (unknown slots dropped, empty slots removed) or
 * { ok: false, errors }.
 */
export function validateStyleBundleDocument(input) {
  const errors = [];
  const document = typeof input === 'string' ? tryParseJson(input, errors) : input;
  if (!isPlainObject(document)) {
    return { errors: errors.length ? errors : ['Style bundle must be a JSON object.'], ok: false };
  }
  if (document.schema !== STYLE_BUNDLE_DOCUMENT_TYPE) {
    errors.push(`Expected schema "${STYLE_BUNDLE_DOCUMENT_TYPE}".`);
  }
  if (document.version !== STYLE_BUNDLE_SCHEMA_VERSION) {
    errors.push(`Unsupported style bundle version ${document.version}.`);
  }
  const label = typeof document.label === 'string' ? document.label.trim() : '';
  if (!label) errors.push('Style bundle needs a label.');

  const slots = {};
  const slotsInput = isPlainObject(document.slots) ? document.slots : {};
  for (const [slotId, payload] of Object.entries(slotsInput)) {
    const slot = STYLE_BUNDLE_SLOTS[slotId];
    if (!slot) continue; // forward compatibility: ignore unknown slots
    if (payload == null) continue;
    if (!isPlainObject(payload)) {
      errors.push(`Slot "${slotId}" must be an object.`);
      continue;
    }
    const hasStyle = typeof payload.style === 'string' && payload.style.trim() !== '';
    const hasPreset = typeof payload.preset === 'string' && payload.preset.trim() !== '';
    const hasDocument = isPlainObject(payload.document);
    const hasCreation = typeof payload.creation === 'string' && payload.creation.trim() !== '';
    if (!hasStyle && !hasPreset && !hasDocument && !hasCreation) {
      errors.push(`Slot "${slotId}" needs { style }, { preset }, { document } or { creation }.`);
      continue;
    }
    if (hasStyle && slot.selectionKind !== 'style') {
      errors.push(`Slot "${slotId}" does not accept { style } payloads.`);
      continue;
    }
    if (hasDocument && slot.parseDocument) {
      const parsed = slot.parseDocument(payload.document);
      if (!parsed.ok) {
        errors.push(`Slot "${slotId}" document: ${parsed.errors.join(' ')}`);
        continue;
      }
      // Keep the RAW document — validation stays idempotent and serialized
      // bundles round-trip byte-identical slot payloads.
      slots[slotId] = { document: payload.document };
      continue;
    }
    if (hasDocument && !slot.parseDocument) {
      errors.push(`Slot "${slotId}" only accepts a built-in { style } payload.`);
      continue;
    }
    slots[slotId] = hasStyle
      ? { style: payload.style.trim() }
      : hasPreset
        ? { preset: payload.preset.trim() }
        : { creation: payload.creation.trim() };
  }

  if (errors.length) return { errors, ok: false };
  return {
    ok: true,
    value: {
      description: typeof document.description === 'string' ? document.description : '',
      id: typeof document.id === 'string' && document.id ? document.id : slugify(label),
      label,
      schema: STYLE_BUNDLE_DOCUMENT_TYPE,
      slots,
      version: STYLE_BUNDLE_SCHEMA_VERSION,
    },
  };
}

function tryParseJson(text, errors) {
  try {
    return JSON.parse(text);
  } catch {
    errors.push('Style bundle is not valid JSON.');
    return null;
  }
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'style-bundle';
}

export function createStyleBundleDocument(id, { description = '', label, slots = {} } = {}) {
  const result = validateStyleBundleDocument({
    description,
    id,
    label: label ?? id,
    schema: STYLE_BUNDLE_DOCUMENT_TYPE,
    slots,
    version: STYLE_BUNDLE_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeStyleBundle(document, { pretty = true } = {}) {
  const result = validateStyleBundleDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}

export function parseStyleBundleDocument(input) {
  return validateStyleBundleDocument(input);
}

/**
 * Resolve a validated bundle into per-system settings/style descriptors:
 * { toon?, treeShader?, grassShader?, flowerShader?, groundShader?, rock?,
 * water?, sky?, cloud?, weather?, environment?, post?, debris? }
 * plus compatibility asset/aggregate slots — each ready to hand to the
 * matching apply/create call. Systems with an orthogonal runtime axis
 * expose a small descriptor (for example `settings.weather.style`) so the
 * host can apply the bundle style to
 * whichever preset, condition, or scenario it selected.
 * Rock is different by design: settings.rock is the complete resolved
 * rock-shader profile, independent from any rockgen asset preset.
 * (settings.tree is a recipe for createPlantFromRecipe). Unresolved
 * by-reference slots
 * ({ creation }) throw: fetch the bundle from toonlab.io (which inlines
 * references) or inline the documents first.
 */
export function resolveStyleBundleSettings(document) {
  const result = validateStyleBundleDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const settings = {};
  for (const [slotId, payload] of Object.entries(result.value.slots)) {
    const slot = STYLE_BUNDLE_SLOTS[slotId];
    if (payload.creation) {
      throw new Error(
        `Style bundle slot "${slotId}" references creation "${payload.creation}" — fetch the published bundle (references resolve server-side) or inline the document.`,
      );
    }
    settings[slotId] = slot.resolve(payload);
  }
  return settings;
}

/**
 * Load a bundle by published slug (toonlab.io) or URL and resolve it.
 *   const { document, settings } = await fetchStyleBundle('sakura-dusk');
 */
export async function fetchStyleBundle(ref, {
  baseUrl = DEFAULT_STYLE_BUNDLE_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const url = /^https?:\/\//.test(ref)
    ? ref
    : `${baseUrl.replace(/\/+$/, '')}/api/v1/bundles/${encodeURIComponent(ref)}`;
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Style bundle "${ref}" → HTTP ${response.status}`);
  const body = await response.json();
  const documentInput = body.bundle ?? body;
  const result = validateStyleBundleDocument(documentInput);
  if (!result.ok) throw new Error(`Style bundle "${ref}": ${result.errors.join(' ')}`);
  return { document: result.value, settings: resolveStyleBundleSettings(result.value) };
}
