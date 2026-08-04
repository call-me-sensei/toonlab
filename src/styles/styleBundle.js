// Style bundles — one named document that coordinates the anime-game art
// direction and one material treatment per public visual system. Asset
// identity, geometry, source policy, and current scene conditions remain
// outside the bundle.
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
  createFlowerShaderProfileSettings,
  createGrassShaderProfileSettings,
  createTreeShaderSettings,
  FLOWER_SHADER_PROFILE_DOCUMENT_TYPE,
  GRASS_SHADER_PROFILE_DOCUMENT_TYPE,
  parseFlowerShaderProfilePresetDocument,
  parseGrassShaderProfilePresetDocument,
  parseTreeShaderPresetDocument,
  TREE_SHADER_DOCUMENT_TYPE,
} from '../vegetation/vegetationShaders.js';
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
import {
  cloneAnimeGameProfile,
  DEFAULT_UNSUPPORTED_STYLE_DOMAINS,
  TOONLAB_ANIME_GAME_PROFILE,
  TOONLAB_ANIME_GAME_PROFILE_FAMILY,
  TOONLAB_ANIME_GAME_RENDERING,
} from './animeGameProfile.js';

export const STYLE_BUNDLE_DOCUMENT_TYPE = 'toonlab/style-bundle';
export const STYLE_BUNDLE_SCHEMA_VERSION = 2;
export const LEGACY_STYLE_BUNDLE_SCHEMA_VERSION = 1;
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

const LEGACY_ASSET_SLOT_IDS = Object.freeze(['tree', 'grass', 'flowers']);

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function normalizeArtDirection(input, errors) {
  if (!isPlainObject(input)) {
    errors.push('Style bundle v2 needs artDirection metadata.');
    return cloneAnimeGameProfile();
  }
  const family = String(input.family ?? '').trim();
  const rendering = String(input.rendering ?? '').trim();
  const subjects = stringList(input.subjects);
  const traits = stringList(input.traits);
  const antiGoals = stringList(input.antiGoals);
  if (family !== TOONLAB_ANIME_GAME_PROFILE_FAMILY) {
    errors.push(`Style bundle artDirection.family must be "${TOONLAB_ANIME_GAME_PROFILE_FAMILY}".`);
  }
  if (rendering !== TOONLAB_ANIME_GAME_RENDERING) {
    errors.push(`Style bundle artDirection.rendering must be "${TOONLAB_ANIME_GAME_RENDERING}".`);
  }
  for (const requiredSubject of ['character', 'environment']) {
    if (!subjects.includes(requiredSubject)) {
      errors.push(`Style bundle artDirection.subjects must include "${requiredSubject}".`);
    }
  }
  if (traits.length === 0) errors.push('Style bundle artDirection.traits cannot be empty.');
  if (antiGoals.length === 0) errors.push('Style bundle artDirection.antiGoals cannot be empty.');
  return { antiGoals, family, rendering, subjects, traits };
}

function normalizeCoverage(input) {
  const unsupported = stringList(input?.unsupported);
  return {
    unsupported: unsupported.length
      ? unsupported
      : [...DEFAULT_UNSUPPORTED_STYLE_DOMAINS],
  };
}

/**
 * Convert v1 documents to the visual-only v2 contract. Legacy asset slots are
 * returned to the caller for an explicit scene/policy migration and are never
 * silently serialized back into a style bundle.
 */
export function migrateStyleBundleDocument(input) {
  const errors = [];
  const document = typeof input === 'string' ? tryParseJson(input, errors) : input;
  if (!isPlainObject(document)) {
    return { errors: errors.length ? errors : ['Style bundle must be a JSON object.'], ok: false };
  }
  if (document.schema !== STYLE_BUNDLE_DOCUMENT_TYPE) {
    return { errors: [`Expected schema "${STYLE_BUNDLE_DOCUMENT_TYPE}".`], ok: false };
  }
  if (document.version === STYLE_BUNDLE_SCHEMA_VERSION) {
    return { legacyAssetSelections: {}, ok: true, value: document, warnings: [] };
  }
  if (document.version !== LEGACY_STYLE_BUNDLE_SCHEMA_VERSION) {
    return { errors: [`Unsupported style bundle version ${document.version}.`], ok: false };
  }

  const warnings = [
    'Style bundle v1 was migrated to v2 with the ToonLab anime-game art direction.',
  ];
  const legacyAssetSelections = {};
  const slots = isPlainObject(document.slots) ? { ...document.slots } : {};
  for (const slotId of LEGACY_ASSET_SLOT_IDS) {
    if (!Object.hasOwn(slots, slotId)) continue;
    legacyAssetSelections[slotId] = slots[slotId];
    delete slots[slotId];
    warnings.push(`Legacy asset slot "${slotId}" must move to scene or asset-sourcing configuration.`);
  }
  if (slots.vegetationShader) {
    const legacySelection = slots.vegetationShader;
    const style = selectedStyleId(legacySelection);
    if (style) {
      for (const slotId of ['treeShader', 'grassShader', 'flowerShader']) {
        if (!slots[slotId]) slots[slotId] = { style };
      }
      warnings.push('Legacy vegetationShader style was expanded into treeShader, grassShader, and flowerShader.');
    } else {
      legacyAssetSelections.vegetationShader = legacySelection;
      warnings.push('Legacy inline vegetationShader document needs an explicit three-profile migration.');
    }
    delete slots.vegetationShader;
  }

  return {
    legacyAssetSelections,
    ok: true,
    value: {
      ...document,
      artDirection: cloneAnimeGameProfile(),
      coverage: normalizeCoverage(document.coverage),
      slots,
      version: STYLE_BUNDLE_SCHEMA_VERSION,
    },
    warnings,
  };
}

/**
 * Validate a style-bundle document. Returns { ok: true, value } with a
 * normalized v2 copy (unknown slots warned, empty slots removed) or
 * { ok: false, errors }.
 */
export function validateStyleBundleDocument(input) {
  const migrated = migrateStyleBundleDocument(input);
  if (!migrated.ok) return migrated;
  const errors = [];
  const warnings = [...(migrated.warnings ?? [])];
  const document = migrated.value;
  const label = typeof document.label === 'string' ? document.label.trim() : '';
  if (!label) errors.push('Style bundle needs a label.');
  const artDirection = normalizeArtDirection(document.artDirection, errors);

  const slots = {};
  const slotsInput = isPlainObject(document.slots) ? document.slots : {};
  for (const [slotId, payload] of Object.entries(slotsInput)) {
    const slot = STYLE_BUNDLE_SLOTS[slotId];
    if (!slot) {
      warnings.push(`Unknown style bundle slot "${slotId}" was ignored.`);
      continue;
    }
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
    legacyAssetSelections: migrated.legacyAssetSelections ?? {},
    ok: true,
    value: {
      artDirection,
      coverage: normalizeCoverage(document.coverage),
      description: typeof document.description === 'string' ? document.description : '',
      id: typeof document.id === 'string' && document.id ? document.id : slugify(label),
      label,
      schema: STYLE_BUNDLE_DOCUMENT_TYPE,
      slots,
      version: STYLE_BUNDLE_SCHEMA_VERSION,
    },
    warnings,
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

export function createStyleBundleDocument(id, {
  artDirection = TOONLAB_ANIME_GAME_PROFILE,
  coverage = { unsupported: DEFAULT_UNSUPPORTED_STYLE_DOMAINS },
  description = '',
  label,
  slots = {},
} = {}) {
  const result = validateStyleBundleDocument({
    artDirection,
    coverage,
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const CALL_ME_SENSEI_STYLE_SLOT_IDS = Object.freeze([
  'toon',
  'environment',
  'treeShader',
  'grassShader',
  'flowerShader',
  'groundShader',
  'rock',
  'debris',
  'water',
  'sky',
  'cloud',
  'weather',
  'post',
]);

export const CALL_ME_SENSEI_STYLE_BUNDLE = deepFreeze(
  createStyleBundleDocument('call-me-sensei', {
    artDirection: TOONLAB_ANIME_GAME_PROFILE,
    coverage: { unsupported: DEFAULT_UNSUPPORTED_STYLE_DOMAINS },
    description: 'First-party anime-game treatment coordinated across every stable ToonLab shader and presentation system.',
    label: 'Call Me Sensei',
    slots: Object.fromEntries(
      CALL_ME_SENSEI_STYLE_SLOT_IDS.map((slotId) => [
        slotId,
        { style: 'call_me_sensei' },
      ]),
    ),
  }),
);

export const FIRST_PARTY_STYLE_BUNDLES = Object.freeze({
  'call-me-sensei': CALL_ME_SENSEI_STYLE_BUNDLE,
});

export function getFirstPartyStyleBundle(id) {
  const normalized = String(id ?? '').trim().toLowerCase().replace(/_/g, '-');
  return FIRST_PARTY_STYLE_BUNDLES[normalized] ?? null;
}

export function listFirstPartyStyleBundles() {
  return Object.values(FIRST_PARTY_STYLE_BUNDLES);
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
  const firstParty = getFirstPartyStyleBundle(ref);
  if (firstParty) {
    return { document: firstParty, settings: resolveStyleBundleSettings(firstParty) };
  }
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
