// Public, portable configuration contract for the reusable rock shader.
// Rock geometry, geological asset identity, seed, LODs, collision, and current
// scene conditions remain outside this document.

export const ROCK_SHADER_DOCUMENT_TYPE = 'toonlab/rock-shader-preset';
export const ROCK_SHADER_SCHEMA_VERSION = 1;
export const DEFAULT_ROCK_SHADER_PRESET = 'call_me_sensei';

const ALL_FIELDS_SERIALIZABLE = true;

function field({
  defaultValue,
  description,
  label,
  options = null,
  range = null,
  type = 'number',
}) {
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? Object.freeze([...defaultValue]) : defaultValue,
    description,
    label,
    options: options ? Object.freeze([...options]) : null,
    range: range ? Object.freeze({ ...range }) : null,
    serializable: ALL_FIELDS_SERIALIZABLE,
    type,
  });
}

const GROUP_DEFINITIONS = Object.freeze({
  projection: Object.freeze({
    description: 'World-space base projection and graphic texture treatment.',
    label: 'Base Projection',
    fields: Object.freeze({
      scale: field({
        defaultValue: 1.6,
        description: 'World-space size of the projected rock texture in meters.',
        label: 'Texture Scale',
        range: { max: 256, min: 0.05, step: 0.05 },
      }),
      saturation: field({
        defaultValue: 0.78,
        description: 'Saturation retained from the projected base texture.',
        label: 'Saturation',
        range: { max: 2, min: 0, step: 0.01 },
      }),
      contrast: field({
        defaultValue: 1.12,
        description: 'Contrast around the rock projection midpoint.',
        label: 'Contrast',
        range: { max: 3, min: 0, step: 0.01 },
      }),
      brightness: field({
        defaultValue: 0.015,
        description: 'Linear brightness offset applied after saturation and contrast.',
        label: 'Brightness',
        range: { max: 1, min: -1, step: 0.005 },
      }),
      projectionContrast: field({
        defaultValue: 0.62,
        description: 'Sharpness of the triplanar blend between projection axes.',
        label: 'Projection Contrast',
        range: { max: 4, min: 0.05, step: 0.01 },
      }),
      sideOnly: field({
        defaultValue: false,
        description: 'Restricts the base projection to side-oriented axes.',
        label: 'Side Projection Only',
        type: 'boolean',
      }),
    }),
  }),
  material: Object.freeze({
    description: 'Shared stone tint and physically based response.',
    label: 'Material Response',
    fields: Object.freeze({
      tint: field({
        defaultValue: [0.92, 0.88, 0.8],
        description: 'IP-wide stone tint multiplied over asset color and projected detail.',
        label: 'Stone Tint',
        type: 'color',
      }),
      metallic: field({
        defaultValue: 0,
        description: 'Metallic response of ordinary rock surfaces.',
        label: 'Metallic',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      smoothness: field({
        defaultValue: 0.08,
        description: 'Base smoothness before top-layer masking and wetness.',
        label: 'Smoothness',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      useSmoothnessTexture: field({
        defaultValue: false,
        description: 'Reads the optional smoothness texture instead of a constant source.',
        label: 'Use Smoothness Texture',
        type: 'boolean',
      }),
      smoothnessContrast: field({
        defaultValue: 1,
        description: 'Contrast applied to the optional smoothness texture.',
        label: 'Smoothness Contrast',
        range: { max: 4, min: 0, step: 0.01 },
      }),
      emissiveStrength: field({
        defaultValue: 0,
        description: 'Base emission multiplier for deliberately luminous stone styles.',
        label: 'Emission',
        range: { max: 2, min: 0, step: 0.01 },
      }),
    }),
  }),
  distanceTint: Object.freeze({
    description: 'Distance color recession shared by rocks, cliffs, and mountains.',
    label: 'Distance Tint',
    fields: Object.freeze({
      closeDistance: field({
        defaultValue: 18,
        description: 'World distance where the far tint begins.',
        label: 'Start Distance',
        range: { max: 2000, min: 0, step: 1 },
      }),
      farDistance: field({
        defaultValue: 140,
        description: 'World distance where the far tint reaches full strength.',
        label: 'End Distance',
        range: { max: 50000, min: 0.1, step: 1 },
      }),
      color: field({
        defaultValue: [0.55, 0.62, 0.66],
        description: 'Atmospheric stone tint used at long distance.',
        label: 'Far Color',
        type: 'color',
      }),
      strength: field({
        defaultValue: 0.28,
        description: 'Maximum blend toward the far-distance tint.',
        label: 'Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
    }),
  }),
  normals: Object.freeze({
    description: 'Near and far normal-detail behavior.',
    label: 'Normal Detail',
    fields: Object.freeze({
      distance: field({
        defaultValue: 75,
        description: 'Distance over which projected normal detail fades.',
        label: 'Fade Distance',
        range: { max: 50000, min: 0.1, step: 1 },
      }),
      nearFlatten: field({
        defaultValue: 0.08,
        description: 'Amount of projected normal flattening near the camera.',
        label: 'Near Flatten',
        range: { max: 1.5, min: -0.5, step: 0.01 },
      }),
      farFlatten: field({
        defaultValue: 0.75,
        description: 'Amount of projected normal flattening at the fade distance.',
        label: 'Far Flatten',
        range: { max: 1.5, min: -0.5, step: 0.01 },
      }),
      useSmoothed: field({
        defaultValue: false,
        description: 'Uses an optional authored smoothed-normal texture as the base normal.',
        label: 'Use Smoothed Normal',
        type: 'boolean',
      }),
      normalGreenSign: field({
        defaultValue: 1,
        description: 'Normal-map green-channel convention: 1 retains Y, -1 flips it.',
        label: 'Normal Y Convention',
        options: [-1, 1],
        type: 'select',
      }),
    }),
  }),
  striping: Object.freeze({
    description: 'Optional graphic sediment or mineral striping over side faces.',
    label: 'Striping',
    fields: Object.freeze({
      enabled: field({
        defaultValue: false,
        description: 'Enables the optional side-projected stripe layer.',
        label: 'Enabled',
        type: 'boolean',
      }),
      scale: field({
        defaultValue: 3.5,
        description: 'World-space size of the stripe texture.',
        label: 'Scale',
        range: { max: 5000, min: 0.05, step: 0.05 },
      }),
      contrast: field({
        defaultValue: 0.8,
        description: 'Contrast of the stripe opacity mask.',
        label: 'Contrast',
        range: { max: 4, min: 0, step: 0.01 },
      }),
      color: field({
        defaultValue: [0.65, 0.48, 0.3],
        description: 'Graphic color overlaid through the stripe mask.',
        label: 'Color',
        type: 'color',
      }),
    }),
  }),
  moss: Object.freeze({
    description: 'Slope-aware moss treatment; current climate coverage remains scene-owned.',
    label: 'Moss Response',
    fields: Object.freeze({
      enabled: field({
        defaultValue: true,
        description: 'Enables the style capability for slope-aware moss.',
        label: 'Enabled',
        type: 'boolean',
      }),
      size: field({
        defaultValue: 2.4,
        description: 'World-space size of the projected moss pattern.',
        label: 'Pattern Size',
        range: { max: 50, min: 0.05, step: 0.05 },
      }),
      sharpness: field({
        defaultValue: 2.4,
        description: 'Sharpness of the upward-facing moss slope mask.',
        label: 'Slope Sharpness',
        range: { max: 8, min: 0, step: 0.01 },
      }),
      offset: field({
        defaultValue: 0.35,
        description: 'Upward-normal threshold where moss begins.',
        label: 'Slope Offset',
        range: { max: 1, min: -1, step: 0.01 },
      }),
      multiply: field({
        defaultValue: 1.6,
        description: 'Strength of the projected moss coverage pattern.',
        label: 'Coverage Gain',
        range: { max: 6, min: 0, step: 0.01 },
      }),
      colorPower: field({
        defaultValue: 1.25,
        description: 'Contrast curve applied to the moss texture color.',
        label: 'Color Power',
        range: { max: 6, min: 0.1, step: 0.01 },
      }),
      lowColor: field({
        defaultValue: [0.18, 0.28, 0.09],
        description: 'Dark end of the shared moss color range.',
        label: 'Low Color',
        type: 'color',
      }),
      highColor: field({
        defaultValue: [0.42, 0.55, 0.2],
        description: 'Light end of the shared moss color range.',
        label: 'High Color',
        type: 'color',
      }),
    }),
  }),
  layerMask: Object.freeze({
    description: 'Shared upward-facing mask for geological top layers.',
    label: 'Top-Layer Mask',
    fields: Object.freeze({
      useAssetMask: field({
        defaultValue: true,
        description: 'Multiplies the slope mask by an optional asset-authored top mask.',
        label: 'Use Asset Mask',
        type: 'boolean',
      }),
      sharpness: field({
        defaultValue: 2.3,
        description: 'Sharpness of the shared upward-facing layer transition.',
        label: 'Sharpness',
        range: { max: 8, min: 0, step: 0.01 },
      }),
      offset: field({
        defaultValue: 0.42,
        description: 'Upward-normal threshold where top layers begin.',
        label: 'Slope Offset',
        range: { max: 1, min: -1, step: 0.01 },
      }),
    }),
  }),
  grassLayer: Object.freeze({
    description: 'Optional authored grass-over-rock layer, separate from current weather.',
    label: 'Grass Layer',
    fields: Object.freeze({
      enabled: field({
        defaultValue: false,
        description: 'Enables grass texture projection on the shared top-layer mask.',
        label: 'Enabled',
        type: 'boolean',
      }),
      useGroundShader: field({
        defaultValue: false,
        description: 'Uses the environment ground field for the grass cap color and surface response.',
        label: 'Match Ground Shader',
        type: 'boolean',
      }),
      scale: field({
        defaultValue: 1.8,
        description: 'World-space size of the projected grass texture.',
        label: 'Scale',
        range: { max: 50, min: 0.05, step: 0.05 },
      }),
      tint: field({
        defaultValue: [0.65, 0.78, 0.42],
        description: 'Style tint multiplied over the grass layer.',
        label: 'Tint',
        type: 'color',
      }),
      saturation: field({
        defaultValue: 0.8,
        description: 'Saturation retained from the grass texture.',
        label: 'Saturation',
        range: { max: 2, min: 0, step: 0.01 },
      }),
      emission: field({
        defaultValue: 0,
        description: 'Emission multiplier for the grass layer.',
        label: 'Emission',
        range: { max: 2, min: 0, step: 0.01 },
      }),
    }),
  }),
  snowLayer: Object.freeze({
    description: 'Authored snow response; the current snow amount remains runtime state.',
    label: 'Snow Layer',
    fields: Object.freeze({
      enabled: field({
        defaultValue: false,
        description: 'Enables the material capability for a snow top layer.',
        label: 'Enabled',
        type: 'boolean',
      }),
      scale: field({
        defaultValue: 2,
        description: 'World-space size of the projected snow texture.',
        label: 'Scale',
        range: { max: 50, min: 0.05, step: 0.05 },
      }),
      tint: field({
        defaultValue: [0.9, 0.95, 1],
        description: 'Shared snow tint.',
        label: 'Tint',
        type: 'color',
      }),
      saturation: field({
        defaultValue: 0.3,
        description: 'Saturation retained from the snow texture.',
        label: 'Saturation',
        range: { max: 2, min: 0, step: 0.01 },
      }),
      emission: field({
        defaultValue: 0,
        description: 'Emission multiplier for the snow layer.',
        label: 'Emission',
        range: { max: 2, min: 0, step: 0.01 },
      }),
    }),
  }),
  sandLayer: Object.freeze({
    description: 'Optional authored sand-over-rock layer and its normal response.',
    label: 'Sand Layer',
    fields: Object.freeze({
      enabled: field({
        defaultValue: false,
        description: 'Enables sand projection on the shared top-layer mask.',
        label: 'Enabled',
        type: 'boolean',
      }),
      useGroundShader: field({
        defaultValue: false,
        description: 'Uses the environment ground field for the sand cap color and surface response.',
        label: 'Match Ground Shader',
        type: 'boolean',
      }),
      scale: field({
        defaultValue: 1.5,
        description: 'World-space size of the projected sand texture.',
        label: 'Scale',
        range: { max: 50, min: 0.05, step: 0.05 },
      }),
      tint: field({
        defaultValue: [0.82, 0.65, 0.4],
        description: 'Style tint multiplied over the sand layer.',
        label: 'Tint',
        type: 'color',
      }),
      saturation: field({
        defaultValue: 0.65,
        description: 'Saturation retained from the sand texture.',
        label: 'Saturation',
        range: { max: 2, min: 0, step: 0.01 },
      }),
      emission: field({
        defaultValue: 0,
        description: 'Emission multiplier for the sand layer.',
        label: 'Emission',
        range: { max: 2, min: 0, step: 0.01 },
      }),
      normalScale: field({
        defaultValue: 1.5,
        description: 'World-space size of the projected sand normal.',
        label: 'Normal Scale',
        range: { max: 50, min: 0.05, step: 0.05 },
      }),
      normalStrength: field({
        defaultValue: 0.35,
        description: 'Strength of the sand-layer normal.',
        label: 'Normal Strength',
        range: { max: 2, min: 0, step: 0.01 },
      }),
      normalRotationDegrees: field({
        defaultValue: 30,
        description: 'Rotation of the sand normal projection in degrees.',
        label: 'Normal Rotation',
        range: { max: 180, min: -180, step: 1 },
      }),
    }),
  }),
  assetIntegration: Object.freeze({
    description: 'How stable asset-authored channels participate in the shared shader.',
    label: 'Asset Integration',
    fields: Object.freeze({
      sourceAlbedoMode: field({
        defaultValue: 'replace',
        description: 'Replace gives the strongest cross-library consistency; Blend admits a controlled amount of the imported texture; Retain uses it as the projected base.',
        label: 'Source Albedo',
        options: ['replace', 'blend', 'retain'],
        type: 'select',
      }),
      sourceAlbedoStrength: field({
        defaultValue: 0.2,
        description: 'Imported-albedo influence when Source Albedo is Blend. Ignored by Replace and Retain.',
        label: 'Albedo Blend',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      vertexColorStrength: field({
        defaultValue: 0.8,
        description: 'Influence of asset-authored vertex color over projected rock detail.',
        label: 'Vertex Color Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      vertexAoStrength: field({
        defaultValue: 1,
        description: 'Influence of the asset-authored envVertexAo channel.',
        label: 'Vertex AO Strength',
        range: { max: 2, min: 0, step: 0.01 },
      }),
    }),
  }),
});

export const ROCK_SHADER_SETTING_GROUPS = Object.freeze(
  Object.entries(GROUP_DEFINITIONS).map(([id, group]) => Object.freeze({
    description: group.description,
    id,
    label: group.label,
  })),
);

export const ROCK_SHADER_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  Object.entries(GROUP_DEFINITIONS).map(([groupId, group]) => [
    groupId,
    Object.freeze(Object.fromEntries(
      Object.entries(group.fields).map(([key, metadata]) => [
        key,
        Object.freeze({
          ...metadata,
          group: groupId,
          id: `${groupId}.${key}`,
          key,
        }),
      ]),
    )),
  ]),
));

export const DEFAULT_ROCK_SHADER_SETTINGS = Object.freeze(Object.fromEntries(
  Object.entries(GROUP_DEFINITIONS).map(([groupId, group]) => [
    groupId,
    Object.freeze(Object.fromEntries(
      Object.entries(group.fields).map(([key, metadata]) => [
        key,
        Array.isArray(metadata.defaultValue)
          ? Object.freeze([...metadata.defaultValue])
          : metadata.defaultValue,
      ]),
    )),
  ]),
));

// Exact editable inputs of the accepted P18 spire material. The preview lab
// supplies the corresponding source texture set; this object keeps every
// graph parameter visible, serializable, and independent from the fixture.
export const CALL_ME_SENSEI_ROCK_SHADER_SETTINGS = Object.freeze({
  projection: Object.freeze({
    scale: 64,
    saturation: 0.5,
    contrast: 0.4,
    brightness: 0.06,
    projectionContrast: 2,
    sideOnly: false,
  }),
  material: Object.freeze({
    tint: Object.freeze([1, 1, 1]),
    metallic: 0.1,
    smoothness: 0.1,
    useSmoothnessTexture: false,
    smoothnessContrast: 1,
    emissiveStrength: 0.02,
  }),
  distanceTint: Object.freeze({
    closeDistance: 500,
    farDistance: 15000,
    color: Object.freeze([0.7882354, 0.7882354, 0.7882354]),
    strength: 0.5,
  }),
  normals: Object.freeze({
    distance: 30000,
    nearFlatten: 0,
    farFlatten: 1,
    useSmoothed: true,
    normalGreenSign: 1,
  }),
  striping: Object.freeze({
    enabled: false,
    scale: 2500,
    contrast: 0.25,
    color: Object.freeze([1, 0, 1]),
  }),
  moss: Object.freeze({
    enabled: false,
    size: 25,
    sharpness: 1.92,
    offset: -0.15,
    multiply: 1.94,
    colorPower: 1.3,
    lowColor: Object.freeze([0.3019608, 0.48235294, 0.11764706]),
    highColor: Object.freeze([0.47058824, 0.6509804, 0.2627451]),
  }),
  layerMask: Object.freeze({
    useAssetMask: true,
    sharpness: 1.77,
    offset: 0.48,
  }),
  grassLayer: Object.freeze({
    enabled: false,
    useGroundShader: false,
    scale: 10,
    tint: Object.freeze([0.89100975, 1, 0.8066038]),
    saturation: 1,
    emission: 0,
  }),
  snowLayer: Object.freeze({
    enabled: false,
    scale: 11.51,
    tint: Object.freeze([1, 1, 1]),
    saturation: 1,
    emission: 0.03,
  }),
  sandLayer: Object.freeze({
    enabled: false,
    useGroundShader: false,
    scale: 5,
    tint: Object.freeze([0.9150943, 0.9150943, 0.9150943]),
    saturation: 1,
    emission: 0.1,
    normalScale: 20,
    normalStrength: 0.5,
    normalRotationDegrees: 30,
  }),
  assetIntegration: Object.freeze({
    sourceAlbedoMode: 'replace',
    sourceAlbedoStrength: 0,
    vertexColorStrength: 0,
    vertexAoStrength: 0,
  }),
});

const PRESETS = new Map();

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneValue(child)]),
  );
  return value;
}

function clampNumber(value, fallback, range = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (!range) return parsed;
  return Math.min(Math.max(parsed, range.min), range.max);
}

function colorValue(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  if (!channels.every(Number.isFinite)) return [...fallback];
  return channels.map((channel) => Math.min(Math.max(channel, 0), 1));
}

function fieldValue(value, metadata) {
  if (metadata.type === 'boolean') {
    return typeof value === 'boolean' ? value : metadata.defaultValue;
  }
  if (metadata.type === 'color') return colorValue(value, metadata.defaultValue);
  if (metadata.type === 'select') {
    return metadata.options.includes(value) ? value : metadata.defaultValue;
  }
  return clampNumber(value, metadata.defaultValue, metadata.range);
}

function mergeSettings(base, overrides) {
  const result = cloneValue(base);
  for (const [groupId, fields] of Object.entries(GROUP_DEFINITIONS)) {
    const source = isPlainObject(overrides?.[groupId]) ? overrides[groupId] : {};
    for (const [key, metadata] of Object.entries(fields.fields)) {
      if (Object.hasOwn(source, key)) result[groupId][key] = fieldValue(source[key], metadata);
    }
  }
  return result;
}

export function registerRockShaderPreset(id, preset, { overwrite = false } = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Rock shader preset id is required.');
  if (!overwrite && PRESETS.has(key)) throw new Error(`Rock shader preset "${key}" is already registered.`);
  const source = isPlainObject(preset) ? preset : {};
  PRESETS.set(key, Object.freeze({
    description: String(source.description ?? ''),
    id: key,
    label: String(source.label ?? key),
    settings: mergeSettings(DEFAULT_ROCK_SHADER_SETTINGS, source.settings),
  }));
  return key;
}

export function getRockShaderPresetOptions() {
  return [...PRESETS.values()].map((preset) => ({
    description: preset.description,
    label: preset.label,
    value: preset.id,
  }));
}

export function normalizeRockShaderPresetName(value) {
  const key = String(value ?? DEFAULT_ROCK_SHADER_PRESET).trim();
  return PRESETS.has(key) ? key : DEFAULT_ROCK_SHADER_PRESET;
}

export function createRockShaderSettings(options = null) {
  const source = isPlainObject(options) ? options : {};
  const presetId = normalizeRockShaderPresetName(source.preset);
  const preset = PRESETS.get(presetId);
  return {
    preset: presetId,
    ...mergeSettings(preset.settings, source),
  };
}

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rock-shader';
}

export function createRockShaderPresetDocument(id, {
  description = '',
  label = id,
  settings = null,
} = {}) {
  return {
    description: String(description),
    id: String(id ?? '').trim() || slug(label),
    label: String(label ?? '').trim() || 'Rock shader',
    schema: ROCK_SHADER_DOCUMENT_TYPE,
    settings: createRockShaderSettings(settings),
    version: ROCK_SHADER_SCHEMA_VERSION,
  };
}

export function parseRockShaderPresetDocument(input) {
  let document = input;
  if (typeof input === 'string') {
    try {
      document = JSON.parse(input);
    } catch {
      return { errors: ['Rock shader preset is not valid JSON.'], ok: false };
    }
  }
  const errors = [];
  if (!isPlainObject(document)) return { errors: ['Rock shader preset must be an object.'], ok: false };
  if (document.schema !== ROCK_SHADER_DOCUMENT_TYPE) {
    errors.push(`Expected schema "${ROCK_SHADER_DOCUMENT_TYPE}".`);
  }
  if (document.version !== ROCK_SHADER_SCHEMA_VERSION) {
    errors.push(`Unsupported rock shader version ${document.version}.`);
  }
  if (!String(document.label ?? '').trim()) errors.push('Rock shader preset needs a label.');
  if (!isPlainObject(document.settings)) errors.push('Rock shader preset needs settings.');
  if (errors.length) return { errors, ok: false };
  return {
    ok: true,
    value: createRockShaderPresetDocument(document.id, {
      description: document.description,
      label: document.label,
      settings: document.settings,
    }),
  };
}

export function serializeRockShaderPreset(document, { pretty = true } = {}) {
  const result = parseRockShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}

registerRockShaderPreset('call_me_sensei', {
  description: 'First-party signature rock treatment using the accepted P18 spire graph parameters. Optional geological layers remain editable but disabled by default.',
  label: 'Call Me Sensei',
  settings: CALL_ME_SENSEI_ROCK_SHADER_SETTINGS,
});

registerRockShaderPreset('neutral', {
  description: 'Neutral validation profile that retains asset color with minimal stylistic treatment.',
  label: 'Neutral',
  settings: {
    assetIntegration: {
      sourceAlbedoMode: 'retain',
      sourceAlbedoStrength: 1,
      vertexColorStrength: 1,
      vertexAoStrength: 1,
    },
    distanceTint: { strength: 0 },
    material: { tint: [1, 1, 1], smoothness: 0.05 },
    moss: { enabled: false },
    projection: { brightness: 0, contrast: 1, saturation: 1 },
  },
});
