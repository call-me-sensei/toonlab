// Style bundles — ONE named document that mixes and matches a preset per
// system ("slot"): the toon look from one author, trees, grass, flowers and
// water from others, sky, weather, environment, lighting and post on top.
// Labs and games reference a bundle
// (a local JSON or a published toonlab.io slug) and get every system's
// resolved settings in one call:
//
//   import { fetchStyleBundle } from '@call-me-sensei/toonlab/styles';
//   const { settings } = await fetchStyleBundle('sakura-dusk');
//   applyToonShader(character, { settings: settings.toon });
//   createWaterSurface({ settings: settings.water, ... });
//
// Each slot holds either { preset: '<built-in id>' } or { document: {…} } (a
// full inline preset document of that system, self-contained). Publishing on
// toonlab.io resolves any by-reference slots into inline documents, so a
// fetched bundle always "has all the right ones" with zero further lookups.

import {
  createToonSettings,
  parseToonPresetDocument,
  TOON_PRESET_DOCUMENT_TYPE,
} from '../toon/toonSettings.js';
import {
  createWaterSettings,
  parseWaterPresetDocument,
  WATER_PRESET_DOCUMENT_TYPE,
} from '../water/waterSettings.js';
import { createWeatherSettings } from '../weather/weatherSettings.js';
import {
  parseWeatherPresetDocument,
  WEATHER_PRESET_DOCUMENT_TYPE,
} from '../weather/weatherPresets.js';
import { createEnvironmentSettings } from '../environment/environmentMaterialAdapter.js';
import {
  ENVIRONMENT_PRESET_DOCUMENT_TYPE,
  resolveEnvironmentPreset,
  validateEnvironmentPresetDocument,
} from '../environment/environmentPresets.js';
import { createPostProcessingSettings } from '../post/postProcessing.js';
import { createSkySettings } from '../sky/stylizedSky.js';
import { createGrassSettings } from '../vegetation/stylizedGrass.js';
import { createFlowerSettings } from '../vegetation/stylizedFlowers.js';
import {
  TREE_RECIPE_SCHEMA,
  validateTreeRecipeDocument,
} from '../vegetation/treeRecipe.js';
import { resolveLightingLookPreset } from '../lighting/lightingPresets.js';

export const STYLE_BUNDLE_DOCUMENT_TYPE = 'toonlab/style-bundle';
export const STYLE_BUNDLE_SCHEMA_VERSION = 1;
export const DEFAULT_STYLE_BUNDLE_BASE_URL = 'https://toonlab.io';

/**
 * The bundle's slots: one per system, each resolving to that system's
 * settings object. `documentType` is the inline preset document type the
 * slot accepts (null = preset-id only), `resolve` turns the slot payload
 * into ready settings.
 */
export const STYLE_BUNDLE_SLOTS = Object.freeze({
  toon: Object.freeze({
    documentType: TOON_PRESET_DOCUMENT_TYPE,
    label: 'Character toon shading',
    parseDocument: parseToonPresetDocument,
    resolve: (payload) => createToonSettings(payload),
  }),
  tree: Object.freeze({
    documentType: TREE_RECIPE_SCHEMA,
    label: 'Trees',
    // Tree recipes carry { type, options } (not .settings) and resolve to
    // the recipe document itself — hand it to createPlantFromRecipe(
    // settings.tree). No built-in preset ids: fill by document or creation.
    parseDocument: validateTreeRecipeDocument,
    resolve: (payload) => {
      if (payload.document) return payload.document;
      throw new Error(
        `Style bundle slot "tree" has no built-in preset "${payload.preset}" — inline a tree recipe document or reference a saved recipe.`,
      );
    },
  }),
  grass: Object.freeze({
    documentType: null,
    label: 'Grass',
    parseDocument: null,
    resolve: (payload) => createGrassSettings(payload),
  }),
  flowers: Object.freeze({
    documentType: null,
    label: 'Flowers',
    parseDocument: null,
    resolve: (payload) => createFlowerSettings(payload),
  }),
  water: Object.freeze({
    documentType: WATER_PRESET_DOCUMENT_TYPE,
    label: 'Water',
    parseDocument: parseWaterPresetDocument,
    resolve: (payload) => createWaterSettings(payload),
  }),
  sky: Object.freeze({
    documentType: null,
    label: 'Sky',
    parseDocument: null,
    resolve: (payload) => createSkySettings(payload),
  }),
  weather: Object.freeze({
    documentType: WEATHER_PRESET_DOCUMENT_TYPE,
    label: 'Weather',
    parseDocument: parseWeatherPresetDocument,
    resolve: (payload) => createWeatherSettings(payload),
  }),
  environment: Object.freeze({
    documentType: ENVIRONMENT_PRESET_DOCUMENT_TYPE,
    label: 'Environment',
    // Environment preset documents carry { features, parameters } at the
    // validated top level (not .settings like toon/water/weather).
    parseDocument: (input) => validateEnvironmentPresetDocument(input),
    resolve: (payload) => {
      if (payload.document) {
        const parsed = validateEnvironmentPresetDocument(payload.document);
        if (!parsed.ok) throw new Error(parsed.errors.join(' '));
        return createEnvironmentSettings({
          features: parsed.value.features,
          parameters: parsed.value.parameters,
        });
      }
      const preset = resolveEnvironmentPreset(payload.preset);
      return createEnvironmentSettings({ features: preset.features, parameters: preset.parameters });
    },
  }),
  lighting: Object.freeze({
    documentType: null,
    label: 'Lighting',
    parseDocument: null,
    // Resolves to a lighting-look document (rig recipe + quality +
    // environment/post hints) — apply through the lighting runtime.
    resolve: (payload) => resolveLightingLookPreset(payload.preset),
  }),
  post: Object.freeze({
    documentType: null,
    label: 'Post processing',
    parseDocument: null,
    resolve: (payload) => createPostProcessingSettings(payload),
  }),
});

export const STYLE_BUNDLE_SLOT_IDS = Object.freeze(Object.keys(STYLE_BUNDLE_SLOTS));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    const hasPreset = typeof payload.preset === 'string' && payload.preset.trim() !== '';
    const hasDocument = isPlainObject(payload.document);
    const hasCreation = typeof payload.creation === 'string' && payload.creation.trim() !== '';
    if (!hasPreset && !hasDocument && !hasCreation) {
      errors.push(`Slot "${slotId}" needs { preset }, { document } or { creation }.`);
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
      errors.push(`Slot "${slotId}" only accepts { preset } payloads.`);
      continue;
    }
    slots[slotId] = hasPreset
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
 * Resolve a validated bundle into per-system settings objects:
 * { toon?, tree?, grass?, flowers?, water?, sky?, weather?, environment?,
 * lighting?, post? } — each ready to hand to the matching apply/create call
 * (settings.tree is a recipe for createPlantFromRecipe, settings.lighting a
 * lighting-look document). Unresolved by-reference slots
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
