// Named environment presets: one string selects a coherent, reference-checked
// look — shader features/parameters plus rig hints (sun, lamps, reflection,
// probe, motes) that scene-level integrations consume. Registry mirrors the
// character preset helpers in toonSettings.js.
//
// 'default' stays an empty override layer so the shipped baseline (the
// approved Liyue room look) never shifts underneath integrators.

import { ENVIRONMENT_SETTING_FIELD_SCHEMA } from './environmentSettings.js';

/** Document type tag stamped on shareable environment preset JSON documents. */
export const ENVIRONMENT_PRESET_DOCUMENT_TYPE = 'toonlab/environment-preset';

/** Current schema version for environment preset documents. */
export const ENVIRONMENT_PRESET_SCHEMA_VERSION = 1;

// Rig keys consumed by the shipped scene integrations. Unknown rig keys are
// kept (integrations may carry custom hints) but flagged with a warning.
const KNOWN_ENVIRONMENT_RIG_KEYS = Object.freeze(new Set([
  'bakeVertexAo',
  'dustMotes',
  'lampIntensity',
  'planarReflection',
  'probe',
  'spotShadows',
  'sun',
  'timeOfDayHour',
]));

const ENVIRONMENT_PRESETS = new Map();

export function registerEnvironmentPreset(name, preset, { overwrite = false } = {}) {
  const key = String(name ?? '').trim();
  if (!key) throw new Error('Environment preset name is required.');
  if (!overwrite && ENVIRONMENT_PRESETS.has(key)) {
    throw new Error(`Environment preset "${key}" is already registered.`);
  }
  ENVIRONMENT_PRESETS.set(key, {
    features: {},
    label: key,
    parameters: {},
    rig: {},
    ...preset,
  });
  return key;
}

export function normalizeEnvironmentPresetName(name) {
  const key = String(name ?? 'default').trim();
  return ENVIRONMENT_PRESETS.has(key) ? key : 'default';
}

export function getEnvironmentPresetOptions() {
  return Array.from(ENVIRONMENT_PRESETS.entries())
    .map(([value, preset]) => ({ label: preset.label, value }));
}

// Returns { features, parameters, rig } ready to spread into
// applyEnvironmentShader options and the rig constructors.
export function resolveEnvironmentPreset(name) {
  const preset = ENVIRONMENT_PRESETS.get(normalizeEnvironmentPresetName(name));
  return {
    features: { ...preset.features },
    parameters: { ...preset.parameters },
    rig: { ...preset.rig },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function booleanFromValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  if (value === 0 || value === 1) return value === 1;
  return null;
}

function colorArrayFromValue(value) {
  const source = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? [value.r, value.g, value.b]
      : null;
  if (!source || source.length < 3) return null;
  const channels = source.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : null;
}

/**
 * Validates and coerces an environment preset definition against the
 * environment settings schema. Feature values are coerced to booleans and
 * must name known feature toggles; parameter values must be finite numbers
 * (or `[r, g, b]` arrays for color parameters, or `null` for auto) and must
 * name known shader parameters; rig hints must be JSON scalars (boolean,
 * finite number, or string) — unknown rig keys are kept but produce a warning.
 *
 * @param {object} preset Preset definition ({ label, description, features, parameters, rig }).
 * @returns {{ ok: boolean, errors: string[], warnings: string[], value: object | null }}
 *   `value` is the sanitized `{ label, description, features, parameters, rig }` when `ok`.
 */
export function sanitizeEnvironmentPreset(preset) {
  const errors = [];
  const warnings = [];
  const source = cleanObject(preset);

  const features = {};
  for (const [key, entry] of Object.entries(cleanObject(source.features))) {
    if (!ENVIRONMENT_SETTING_FIELD_SCHEMA.features[key]) {
      errors.push(`Unknown environment feature "${key}".`);
      continue;
    }
    const coerced = booleanFromValue(entry);
    if (coerced === null) {
      errors.push(`Environment feature "${key}" must be a boolean.`);
      continue;
    }
    features[key] = coerced;
  }

  const parameters = {};
  for (const [key, entry] of Object.entries(cleanObject(source.parameters))) {
    const field = ENVIRONMENT_SETTING_FIELD_SCHEMA.parameters[key];
    if (!field) {
      errors.push(`Unknown environment parameter "${key}".`);
      continue;
    }
    if (entry === null) {
      parameters[key] = null;
      continue;
    }
    if (field.type === 'color') {
      const color = colorArrayFromValue(entry);
      if (!color) {
        errors.push(`Environment parameter "${key}" must be an [r, g, b] color array.`);
        continue;
      }
      parameters[key] = color;
      continue;
    }
    const number = typeof entry === 'boolean' ? Number.NaN : Number(entry);
    if (!Number.isFinite(number)) {
      errors.push(`Environment parameter "${key}" must be a finite number.`);
      continue;
    }
    parameters[key] = number;
  }

  const rig = {};
  for (const [key, entry] of Object.entries(cleanObject(source.rig))) {
    const type = typeof entry;
    const isScalar = type === 'boolean'
      || type === 'string'
      || (type === 'number' && Number.isFinite(entry));
    if (!isScalar) {
      errors.push(`Environment rig value "${key}" must be a boolean, finite number, or string.`);
      continue;
    }
    if (!KNOWN_ENVIRONMENT_RIG_KEYS.has(key)) {
      warnings.push(`Unknown environment rig key "${key}" was kept as-is.`);
    }
    rig[key] = entry;
  }

  const ok = errors.length === 0;
  return {
    errors,
    ok,
    value: ok
      ? {
        description: String(source.description ?? ''),
        features,
        label: String(source.label ?? ''),
        parameters,
        rig,
      }
      : null,
    warnings,
  };
}

/**
 * Serializes a registered environment preset into a shareable JSON document
 * (`{ type, schemaVersion, id, label, description, preset }`). The registered
 * preset itself is untouched; `label`/`description` overrides only affect the
 * emitted document.
 *
 * @param {string} name Registered preset name (e.g. 'interiorNight').
 * @param {{ label?: string, description?: string }} [overrides] Optional label/description overrides.
 * @returns {object} Environment preset document ready for `JSON.stringify`.
 * @throws {Error} If the preset is not registered or fails sanitization.
 */
export function createEnvironmentPresetDocument(name, { description, label } = {}) {
  const key = String(name ?? '').trim();
  const preset = ENVIRONMENT_PRESETS.get(key);
  if (!preset) throw new Error(`Environment preset "${key}" is not registered.`);

  const sanitized = sanitizeEnvironmentPreset({
    ...preset,
    description: description ?? preset.description ?? '',
    label: label ?? preset.label ?? key,
  });
  if (!sanitized.ok) throw new Error(sanitized.errors.join(' '));

  return {
    description: sanitized.value.description,
    id: key,
    label: sanitized.value.label,
    preset: {
      features: sanitized.value.features,
      parameters: sanitized.value.parameters,
      rig: sanitized.value.rig,
    },
    schemaVersion: ENVIRONMENT_PRESET_SCHEMA_VERSION,
    type: ENVIRONMENT_PRESET_DOCUMENT_TYPE,
  };
}

/**
 * Validates an environment preset document (a parsed object or a JSON string)
 * without registering it. Mirrors `validateToonPresetDocument` in
 * toonSettings.js.
 *
 * @param {object | string} input Document object or JSON string.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], value: object | null }}
 *   On `ok`, `value` is `{ id, label, description, features, parameters, rig }`,
 *   ready to pass to `registerEnvironmentPreset(value.id, value)`.
 */
export function validateEnvironmentPresetDocument(input) {
  const errors = [];
  const warnings = [];

  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid environment preset JSON: ${error.message}`],
        ok: false,
        value: null,
        warnings,
      };
    }
  }

  if (!isPlainObject(source)) {
    return {
      errors: ['Environment preset document must be a JSON object.'],
      ok: false,
      value: null,
      warnings,
    };
  }

  if (source.type !== ENVIRONMENT_PRESET_DOCUMENT_TYPE) {
    errors.push(`Environment preset document type must be "${ENVIRONMENT_PRESET_DOCUMENT_TYPE}".`);
  }

  if (source.schemaVersion === undefined) {
    warnings.push(`Environment preset schemaVersion was missing and defaulted to ${ENVIRONMENT_PRESET_SCHEMA_VERSION}.`);
  } else if (!Number.isFinite(source.schemaVersion)) {
    errors.push('Environment preset schemaVersion must be a number.');
  } else if (source.schemaVersion > ENVIRONMENT_PRESET_SCHEMA_VERSION) {
    errors.push(`Environment preset schema version ${source.schemaVersion} is newer than supported version ${ENVIRONMENT_PRESET_SCHEMA_VERSION}.`);
  }

  const id = String(source.id ?? '').trim();
  if (!id) errors.push('Environment preset id is required.');

  const presetSource = cleanObject(source.preset);
  const sanitized = sanitizeEnvironmentPreset({
    ...presetSource,
    description: source.description ?? presetSource.description ?? '',
    label: source.label ?? presetSource.label ?? id,
  });
  errors.push(...sanitized.errors);
  warnings.push(...sanitized.warnings);

  const ok = errors.length === 0;
  return {
    errors,
    ok,
    value: ok
      ? {
        description: sanitized.value.description,
        features: sanitized.value.features,
        id,
        label: sanitized.value.label,
        parameters: sanitized.value.parameters,
        rig: sanitized.value.rig,
      }
      : null,
    warnings,
  };
}

/**
 * Validates an environment preset document and registers it in one call.
 *
 * @param {object | string} document Document object or JSON string.
 * @param {{ overwrite?: boolean }} [options] Pass `overwrite: true` to replace an existing preset.
 * @returns {string} The registered preset name.
 * @throws {Error} If the document fails validation or the name is taken and `overwrite` is false.
 */
export function registerEnvironmentPresetDocument(document, { overwrite = false } = {}) {
  const result = validateEnvironmentPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerEnvironmentPreset(result.value.id, result.value, { overwrite });
}

registerEnvironmentPreset('default', {
  label: 'Default (Baseline)',
});

registerEnvironmentPreset('interiorDay', {
  label: 'Interior Day',
  parameters: {
    ambientProbeBlend: 0.35,
    ambientStrength: 0.22,
    aoWarmth: 0.6,
    interiorOcclusionStrength: 0.5,
  },
  rig: {
    dustMotes: true,
    probe: true,
    sun: true,
    timeOfDayHour: 12,
  },
});

registerEnvironmentPreset('interiorEvening', {
  label: 'Interior Evening',
  parameters: {
    ambientProbeBlend: 0.4,
    ambientStrength: 0.42,
    directLightStrength: 0.85,
    interiorOcclusionStrength: 0.42,
    shadowLift: 0.3,
    spotLightStrength: 0.55,
  },
  rig: {
    dustMotes: true,
    lampIntensity: 0.8,
    probe: true,
    spotShadows: true,
    sun: true,
    timeOfDayHour: 18,
  },
});

registerEnvironmentPreset('interiorNight', {
  label: 'Interior Night (Lamp Lit)',
  parameters: {
    ambientProbeBlend: 0.4,
    emissiveStrength: 0.7,
    pointLightStrength: 0.36,
    shadowLift: 0.56,
    spotLightStrength: 0.85,
  },
  rig: {
    lampIntensity: 1.3,
    probe: true,
    spotShadows: true,
    sun: false,
    timeOfDayHour: 22,
  },
});

// Flat-color / untextured scenes: strong grounding, gentle gradient interest,
// no room-specific darkening.
registerEnvironmentPreset('interiorStudio', {
  label: 'Interior Studio (Untextured)',
  features: {
    leftSideShadow: false,
  },
  parameters: {
    ambientProbeBlend: 0.3,
    ambientStrength: 0.9,
    aoWarmth: 0.45,
    lightingInfluence: 0.6,
    shadowLift: 0.5,
    specularStrength: 0.1,
    untexturedGradientStrength: 0.5,
    vertexAoStrength: 1.0,
  },
  rig: {
    bakeVertexAo: true,
    probe: true,
    spotShadows: true,
    sun: true,
  },
});

registerEnvironmentPreset('exteriorDay', {
  label: 'Exterior Day',
  features: {
    leftSideShadow: false,
    windowCutout: false,
  },
  parameters: {
    cloudShadowStrength: 0.35,
    heightFogDensity: 0.012,
    heightFogFalloff: 9,
    skyTintStrength: 0.4,
  },
  rig: {
    sun: true,
    timeOfDayHour: 12,
  },
});

// Everything on with demo values: a feature tour, not a production look
// (pairs with the character 'showcase' preset).
registerEnvironmentPreset('showcase', {
  label: 'Showcase (All Features)',
  parameters: {
    ambientProbeBlend: 0.45,
    aoWarmth: 0.6,
    heightFogDensity: 0.006,
    interiorOcclusionStrength: 0.35,
    planarReflectionStrength: 0.32,
    specularStrength: 0.2,
    spotLightStrength: 0.6,
  },
  rig: {
    dustMotes: true,
    planarReflection: true,
    probe: true,
    spotShadows: true,
    sun: true,
    timeOfDayHour: 15,
  },
});

// Studio-managed signature look, curated by Call Me Sensei and updated over
// releases (unlike 'showcase', this is a production grade, not a feature
// tour). Community presets register alongside it via
// registerEnvironmentPreset / environment preset documents.
registerEnvironmentPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  parameters: {
    ambientProbeBlend: 0.35,
    aoWarmth: 0.5,
    heightFogDensity: 0.006,
    skyTintStrength: 0.35,
  },
  rig: {
    probe: true,
    sun: true,
    timeOfDayHour: 14,
  },
});
