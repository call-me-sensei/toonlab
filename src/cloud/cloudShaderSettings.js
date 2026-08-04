// Portable settings for the authored sky-dome cloud treatment.
//
// This profile owns cloud rendering only. The sky gradient, sun/moon, time,
// weather, fog, precipitation, cloud source meshes, source textures, and color
// atlases are host inputs. Defaults provide a neutral authored cloud graph.

export const CLOUD_SHADER_DOCUMENT_TYPE = 'toonlab/cloud-shader-preset';
export const CLOUD_SHADER_SCHEMA_VERSION = 2;
export const DEFAULT_CLOUD_SHADER_PRESET = 'call_me_sensei';

const DEFINITIONS = Object.freeze({
  backgroundCloudStrength: Object.freeze({
    description: 'Screen-blend contribution of the distant cloud texture over the sky gradient.',
    group: 'composition',
    label: 'Background Strength',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.28,
  }),
  backgroundCloudOpacity: Object.freeze({
    description: 'Opacity of the distant cloud texture before it is screen-blended into the sky.',
    group: 'composition',
    label: 'Background Opacity',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  cloudShellStrength: Object.freeze({
    description: 'Brightness multiplier applied after the cloud color-curve lookup.',
    group: 'composition',
    label: 'Cloud Strength',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 2,
  }),
  cloudShellOpacity: Object.freeze({
    description: 'Master opacity of the foreground cloud shell.',
    group: 'composition',
    label: 'Cloud Opacity',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  cloudShellCoverage: Object.freeze({
    description: 'Bias added to the authored alpha mask. Positive values expand cloud coverage; negative values expose more sky.',
    group: 'composition',
    label: 'Coverage Bias',
    range: Object.freeze({ max: 1, min: -1, step: 0.01 }),
    type: 'number',
    value: 0,
  }),
  backgroundCloudVerticalOffset: Object.freeze({
    description: 'Vertical UV offset of the distant background-cloud texture.',
    group: 'shape',
    label: 'Background Offset',
    range: Object.freeze({ max: 1, min: -1, step: 0.001 }),
    type: 'number',
    value: 0,
  }),
  backgroundCloudVerticalStretch: Object.freeze({
    description: 'Vertical texture scale of the distant cloud layer. Values below 1 compress the source texture.',
    group: 'shape',
    label: 'Background Stretch',
    range: Object.freeze({ max: 4, min: 0.1, step: 0.001 }),
    type: 'number',
    value: 1,
  }),
  cloudShellHorizontalOffset: Object.freeze({
    description: 'Static horizontal UV offset of the cloud shell, independent of animated drift.',
    group: 'shape',
    label: 'Cloud Horizontal Offset',
    range: Object.freeze({ max: 1, min: -1, step: 0.001 }),
    type: 'number',
    value: 0,
  }),
  cloudShellHorizontalScale: Object.freeze({
    description: 'Horizontal texture scale around the cloud-dome UV center.',
    group: 'shape',
    label: 'Cloud Horizontal Scale',
    range: Object.freeze({ max: 4, min: 0.1, step: 0.001 }),
    type: 'number',
    value: 1,
  }),
  cloudShellVerticalOffset: Object.freeze({
    description: 'Vertical UV offset of the foreground cloud-shell texture.',
    group: 'shape',
    label: 'Cloud Vertical Offset',
    range: Object.freeze({ max: 1, min: -1, step: 0.001 }),
    type: 'number',
    value: -0.06,
  }),
  cloudShellVerticalStretch: Object.freeze({
    description: 'Vertical texture scale around the foreground cloud-shell UV center.',
    group: 'shape',
    label: 'Cloud Vertical Stretch',
    range: Object.freeze({ max: 4, min: 0.1, step: 0.001 }),
    type: 'number',
    value: 0.46,
  }),
  cloudShellEdgeContrast: Object.freeze({
    description: 'Power applied to the authored alpha mask. 1 preserves the accepted source edge; higher values tighten it.',
    group: 'shape',
    label: 'Edge Contrast',
    range: Object.freeze({ max: 4, min: 0.1, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  backgroundCloudTint: Object.freeze({
    description: 'Tint multiplied into the distant background-cloud texture before screen blending.',
    group: 'lighting',
    label: 'Background Tint',
    type: 'color',
    value: Object.freeze([0.54, 0.74, 1]),
  }),
  cloudShellTint: Object.freeze({
    description: 'Tint multiplied into the foreground cloud color-curve result.',
    group: 'lighting',
    label: 'Cloud Tint',
    type: 'color',
    value: Object.freeze([1, 1, 1]),
  }),
  cloudShellRotationSpeed: Object.freeze({
    description: 'Horizontal UV drift per second. The accepted source value is intentionally very slow.',
    group: 'motion',
    label: 'Rotation Speed',
    range: Object.freeze({ max: 0.02, min: -0.02, step: 0.0001 }),
    type: 'number',
    value: -0.0006,
  }),
  cloudShellMotionScale: Object.freeze({
    description: 'Preview/runtime multiplier for authored cloud drift. 0 freezes the cloud composition.',
    group: 'motion',
    label: 'Motion Scale',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  opacity: Object.freeze({
    description: 'Master opacity of reusable 2.5D cloud cards.',
    group: 'composition',
    label: 'Card Opacity',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  worldShadowStrength: Object.freeze({
    description: 'Strength of the separate world-space cloud shadow projection.',
    group: 'composition',
    label: 'World Shadow',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.42,
  }),
  worldShadowSoftness: Object.freeze({
    description: 'Softness of the world-space cloud shadow field.',
    group: 'composition',
    label: 'World Shadow Softness',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.62,
  }),
  edgeSoftness: Object.freeze({
    description: 'Additional feathering applied to generated cloud coverage.',
    group: 'shape',
    label: 'Card Edge Softness',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.12,
  }),
  erosion: Object.freeze({
    description: 'Live breakup driven by the source erosion/detail channel.',
    group: 'shape',
    label: 'Live Erosion',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.08,
  }),
  litColor: Object.freeze({
    description: 'Sun-facing color of generated 2.5D cloud cards.',
    group: 'lighting',
    label: 'Lit Color',
    type: 'color',
    value: Object.freeze([1, 0.99, 0.96]),
  }),
  shadeColor: Object.freeze({
    description: 'Cool albedo-relative color used for cloud form shadow.',
    group: 'lighting',
    label: 'Shade Color',
    type: 'color',
    value: Object.freeze([0.56, 0.7, 0.92]),
  }),
  shadowStrength: Object.freeze({
    description: 'Strength of normal, thickness, and ambient-occlusion form shadow.',
    group: 'lighting',
    label: 'Form Shadow',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.72,
  }),
  normalStrength: Object.freeze({
    description: 'Contribution of the generated normal map to sun-facing lighting.',
    group: 'lighting',
    label: 'Normal Strength',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 1.35,
  }),
  depthStrength: Object.freeze({
    description: 'Contribution of generated thickness to lower-mass cloud shading.',
    group: 'lighting',
    label: 'Depth Strength',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.72,
  }),
  translucencyStrength: Object.freeze({
    description: 'Forward-scattered light through thin cloud regions toward the sun.',
    group: 'lighting',
    label: 'Translucency',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.38,
  }),
  rimColor: Object.freeze({
    description: 'Color of the generated edge/silver-lining response.',
    group: 'lighting',
    label: 'Rim Color',
    type: 'color',
    value: Object.freeze([1, 0.94, 0.78]),
  }),
  rimStrength: Object.freeze({
    description: 'Strength of the generated edge mask under sunward lighting.',
    group: 'lighting',
    label: 'Rim Strength',
    range: Object.freeze({ max: 3, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.46,
  }),
  rimPower: Object.freeze({
    description: 'Focus of the sunward silver lining.',
    group: 'lighting',
    label: 'Rim Focus',
    range: Object.freeze({ max: 16, min: 1, step: 0.1 }),
    type: 'number',
    value: 5,
  }),
  windResponse: Object.freeze({
    description: 'Multiplier applied to composition-layer wind and parallax.',
    group: 'motion',
    label: 'Wind Response',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
});

const GROUP_KEYS = Object.freeze({
  composition: Object.freeze([
    'backgroundCloudStrength',
    'backgroundCloudOpacity',
    'cloudShellStrength',
    'cloudShellOpacity',
    'cloudShellCoverage',
    'opacity',
    'worldShadowStrength',
    'worldShadowSoftness',
  ]),
  shape: Object.freeze([
    'backgroundCloudVerticalOffset',
    'backgroundCloudVerticalStretch',
    'cloudShellHorizontalOffset',
    'cloudShellHorizontalScale',
    'cloudShellVerticalOffset',
    'cloudShellVerticalStretch',
    'cloudShellEdgeContrast',
    'edgeSoftness',
    'erosion',
  ]),
  lighting: Object.freeze([
    'backgroundCloudTint',
    'cloudShellTint',
    'litColor',
    'shadeColor',
    'shadowStrength',
    'normalStrength',
    'depthStrength',
    'translucencyStrength',
    'rimColor',
    'rimStrength',
    'rimPower',
  ]),
  motion: Object.freeze([
    'cloudShellRotationSpeed',
    'cloudShellMotionScale',
    'windResponse',
  ]),
});

export const CLOUD_SHADER_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Opacity, foreground/background balance, brightness, and coverage.',
    id: 'composition',
    label: 'Composition',
  }),
  Object.freeze({
    description: 'Authored dome projection, texture placement, silhouette coverage, and edge response.',
    id: 'shape',
    label: 'Shape',
  }),
  Object.freeze({
    description: 'Color treatment applied to the source background texture and cloud color curve.',
    id: 'lighting',
    label: 'Lighting',
  }),
  Object.freeze({
    description: 'Authored cloud-shell drift. World wind remains a scene-owned input.',
    id: 'motion',
    label: 'Motion',
  }),
]);

export const CLOUD_SHADER_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  CLOUD_SHADER_SETTING_GROUPS.map((group) => [
    group.id,
    Object.freeze(Object.fromEntries(GROUP_KEYS[group.id].map((key) => {
      const definition = DEFINITIONS[key];
      return [key, Object.freeze({
        defaultValue: definition.value,
        description: definition.description,
        group: group.id,
        id: `${group.id}.${key}`,
        key,
        label: definition.label,
        ...(definition.range ? { range: definition.range } : {}),
        serializable: true,
        type: definition.type,
      })];
    }))),
  ]),
));

export const CLOUD_SHADER_FIELD_COUNT = Object.keys(DEFINITIONS).length;

const CLOUD_KEYS = Object.freeze(Object.values(GROUP_KEYS).flat());
const CLOUD_KEY_SET = new Set(CLOUD_KEYS);
const presetRegistry = new Map();

function clone(value) {
  return Array.isArray(value) ? [...value] : value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function normalizeField(key, value, fallback) {
  const definition = DEFINITIONS[key];
  if (definition.type === 'color') {
    if (!Array.isArray(value)
      || value.length < 3
      || !value.slice(0, 3).every((channel) => Number.isFinite(Number(channel)))) {
      return clone(fallback);
    }
    // Cloud lighting is authored in linear HDR space. Values above one are
    // intentional headroom for ACES/tone-mapped sunlit tops.
    return value.slice(0, 3).map((channel) =>
      Math.min(Math.max(Number(channel), 0), 4));
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return clone(fallback);
  return Math.min(Math.max(number, definition.range.min), definition.range.max);
}

function pickCloudSettings(input = {}) {
  const source = isObject(input) ? input : {};
  return Object.fromEntries(
    CLOUD_KEYS
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, clone(source[key])]),
  );
}

export const DEFAULT_CLOUD_SHADER_SETTINGS = Object.freeze(Object.fromEntries(
  CLOUD_KEYS.map((key) => [
    key,
    Array.isArray(DEFINITIONS[key].value)
      ? Object.freeze([...DEFINITIONS[key].value])
      : DEFINITIONS[key].value,
  ]),
));

export const CALL_ME_SENSEI_CLOUD_SHADER_SETTINGS = Object.freeze({
  ...DEFAULT_CLOUD_SHADER_SETTINGS,
  backgroundCloudStrength: 0.34,
  backgroundCloudTint: Object.freeze([0.5, 0.72, 1]),
  cloudShellEdgeContrast: 1.18,
  cloudShellStrength: 1.85,
  cloudShellTint: Object.freeze([1, 0.98, 0.94]),
  cloudShellVerticalStretch: 0.5,
  depthStrength: 0.52,
  edgeSoftness: 0.08,
  erosion: 0.035,
  litColor: Object.freeze([1, 1, 1]),
  normalStrength: 1.75,
  opacity: 0.98,
  rimColor: Object.freeze([1, 0.96, 0.82]),
  rimPower: 3.8,
  rimStrength: 0.38,
  shadeColor: Object.freeze([0.12, 0.3, 0.62]),
  shadowStrength: 0.72,
  translucencyStrength: 0.46,
});

export function createCloudShaderSettings(options = {}) {
  const source = typeof options === 'string'
    ? { preset: options }
    : (isObject(options) ? options : {});
  const presetId = normalizeId(source.preset) || DEFAULT_CLOUD_SHADER_PRESET;
  const preset = presetRegistry.get(presetId)
    ?? presetRegistry.get(DEFAULT_CLOUD_SHADER_PRESET);
  const input = isObject(source.settings) ? source.settings : source;
  return Object.fromEntries(CLOUD_KEYS.map((key) => {
    const fallback = preset?.settings?.[key] ?? DEFAULT_CLOUD_SHADER_SETTINGS[key];
    return [key, normalizeField(key, input[key], fallback)];
  }));
}

function canonicalDocument(id, definition = {}) {
  const source = isObject(definition) ? definition : {};
  return {
    description: String(source.description ?? ''),
    id: normalizeId(id ?? source.id),
    label: String(source.label ?? source.title ?? id ?? source.id ?? '').trim(),
    settings: createCloudShaderSettings({
      preset: source.preset ?? DEFAULT_CLOUD_SHADER_PRESET,
      settings: source.settings ?? pickCloudSettings(source),
    }),
    type: CLOUD_SHADER_DOCUMENT_TYPE,
    version: CLOUD_SHADER_SCHEMA_VERSION,
  };
}

export function validateCloudShaderPresetDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid Cloud Shader JSON: ${error.message}`],
        ok: false,
        value: null,
        warnings: [],
      };
    }
  }
  if (!isObject(source)) {
    return {
      errors: ['Cloud Shader preset must be a JSON object.'],
      ok: false,
      value: null,
      warnings: [],
    };
  }
  const errors = [];
  const warnings = [];
  if (source.type !== CLOUD_SHADER_DOCUMENT_TYPE) {
    errors.push(`Cloud Shader preset type must be "${CLOUD_SHADER_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? source.schemaVersion ?? CLOUD_SHADER_SCHEMA_VERSION);
  if (!Number.isFinite(version)) errors.push('Cloud Shader version must be a number.');
  else if (version > CLOUD_SHADER_SCHEMA_VERSION) {
    errors.push(
      `Cloud Shader version ${version} is newer than supported version ${CLOUD_SHADER_SCHEMA_VERSION}.`,
    );
  }
  if (version < CLOUD_SHADER_SCHEMA_VERSION) {
    warnings.push(
      `Cloud Shader version ${version} was migrated to version ${CLOUD_SHADER_SCHEMA_VERSION} with generated-card lighting defaults.`,
    );
  }
  if (!normalizeId(source.id)) errors.push('Cloud Shader preset id is required.');
  for (const key of Object.keys(isObject(source.settings) ? source.settings : {})) {
    if (!CLOUD_KEY_SET.has(key)) {
      warnings.push(`Unknown Cloud Shader setting "${key}" was ignored.`);
    }
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? canonicalDocument(source.id, source) : null,
    warnings,
  };
}

export const parseCloudShaderPresetDocument = validateCloudShaderPresetDocument;

export function createCloudShaderPresetDocument(id, definition = {}) {
  const document = canonicalDocument(id, definition);
  const result = validateCloudShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeCloudShaderPreset(
  idOrDocument,
  definition = {},
  { pretty = true } = {},
) {
  const document = isObject(idOrDocument) && idOrDocument.type === CLOUD_SHADER_DOCUMENT_TYPE
    ? createCloudShaderPresetDocument(idOrDocument.id, idOrDocument)
    : createCloudShaderPresetDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export function registerCloudShaderPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createCloudShaderPresetDocument(id, definition);
  if (!overwrite && presetRegistry.has(document.id)) {
    throw new Error(`Cloud Shader preset "${document.id}" already exists.`);
  }
  presetRegistry.set(document.id, document);
  return {
    description: document.description,
    id: document.id,
    label: document.label,
    value: document.id,
  };
}

export function registerSerializedCloudShaderPreset(input, options = {}) {
  const result = parseCloudShaderPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerCloudShaderPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

export function getCloudShaderPresetOptions() {
  return Array.from(presetRegistry.values()).map((document) => ({
    description: document.description,
    id: document.id,
    label: document.label,
    value: document.id,
  }));
}

/**
 * Applies cloud-owned settings to an authored cloud-dome renderer.
 */
export function applyCloudShaderSettings(target, options = {}) {
  const settings = createCloudShaderSettings(options);
  if (typeof target?.applyCloudShaderSettings !== 'function') {
    throw new Error(
      'Cloud Shader target must expose applyCloudShaderSettings(settings).',
    );
  }
  target.applyCloudShaderSettings(settings);
  return settings;
}

registerCloudShaderPreset('default', {
  description: 'Neutral authored sky-dome cloud treatment.',
  label: 'Default',
  settings: DEFAULT_CLOUD_SHADER_SETTINGS,
});

registerCloudShaderPreset('call_me_sensei', {
  description: 'Call Me Sensei two-layer anime cloud treatment with cool depth and warm lit tops.',
  label: 'Call Me Sensei',
  settings: CALL_ME_SENSEI_CLOUD_SHADER_SETTINGS,
});
