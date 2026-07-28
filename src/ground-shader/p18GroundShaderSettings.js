// Full portable style contract for the accepted P18 landscape graph.
//
// Stored values use meters, turns, normalized colors, and unitless
// coefficients. `sourceScale` records the exact conversion back to the
// retained source graph where several world distances are authored in cm.
// Painted weights, terrain geometry, layer textures, current time, and current
// weather are deliberately external inputs.

export const GROUND_SHADER_DOCUMENT_TYPE = 'toonlab/ground-shader-preset';
export const GROUND_SHADER_SCHEMA_VERSION = 3;
export const DEFAULT_GROUND_SHADER_PRESET = 'call_me_sensei';

const RANGE = Object.freeze({
  color: null,
  distance: Object.freeze({ min: 0, max: 1000, step: 0.05 }),
  distanceLong: Object.freeze({ min: 0, max: 5000, step: 1 }),
  factor: Object.freeze({ min: 0, max: 1, step: 0.01 }),
  signed: Object.freeze({ min: -2, max: 2, step: 0.005 }),
  positive: Object.freeze({ min: 0, max: 20, step: 0.01 }),
  turns: Object.freeze({ min: -1, max: 1, step: 0.005 }),
});

function field({
  advanced = false,
  defaultValue,
  description,
  label,
  range = null,
  sourceKind = 'scalar',
  sourceName,
  sourceScale = 1,
  type = 'number',
  unit = null,
}) {
  return Object.freeze({
    advanced,
    defaultValue: Array.isArray(defaultValue)
      ? Object.freeze(defaultValue.slice(0, 3))
      : defaultValue,
    description,
    label,
    range,
    serializable: true,
    sourceKind,
    sourceName,
    sourceScale,
    type,
    unit,
  });
}

const n = (sourceName, defaultValue, {
  advanced = false,
  description = `Connected P18 “${sourceName}” graph input.`,
  label = sourceName,
  range = RANGE.positive,
  sourceScale = 1,
  unit = null,
} = {}) => field({
  advanced,
  defaultValue,
  description,
  label,
  range,
  sourceKind: 'scalar',
  sourceName,
  sourceScale,
  unit,
});
const meters = (sourceName, sourceValue, options = {}) => n(
  sourceName,
  sourceValue / 100,
  {
    ...options,
    range: options.range ?? RANGE.distance,
    sourceScale: 100,
    unit: 'm',
  },
);
const b = (sourceName, defaultValue, options = {}) => field({
  advanced: options.advanced ?? false,
  defaultValue,
  description: options.description ?? `Connected P18 “${sourceName}” graph branch.`,
  label: options.label ?? sourceName.replace(/\?$/, ''),
  sourceKind: 'static_switch',
  sourceName,
  type: 'boolean',
});
const c = (sourceName, defaultValue, options = {}) => field({
  advanced: options.advanced ?? false,
  defaultValue,
  description: options.description ?? `Connected P18 “${sourceName}” color input.`,
  label: options.label ?? sourceName,
  sourceKind: 'vector',
  sourceName,
  type: 'color',
});

const GROUP_DEFINITIONS = Object.freeze({
  grass: Object.freeze({
    description: 'Painted vegetated terrain beneath grass blades: base color, colormap, hue, variance, and surface response. Grass geometry and blade shading remain Vegetation-owned.',
    label: 'Vegetated Ground',
    fields: Object.freeze({
      useColorMap: b('UseColorMap?', true),
      useWindColor: b('UseWindColor?', true),
      scale: meters('Global Scale', 1600, { label: 'Texture Scale', range: { min: 0.05, max: 128, step: 0.05 } }),
      tint: c('Grass Tint', [0.4200000167, 0.6000000238, 0.4333846271]),
      emissive: n('Grass Emissive', 0.03, { range: { min: 0, max: 2, step: 0.005 } }),
      varianceScale: meters('Grass Variance Scale', 8417.200195, { advanced: true, range: RANGE.distanceLong }),
      varianceMultiply: n('Grass Variance Multiply', 2, { advanced: true }),
      hueVarianceScale: meters('Hue Variance Scale', 8000, { advanced: true, range: RANGE.distanceLong }),
      huePreOffset: n('Hue Pre-Offset', -0.05, { advanced: true, range: RANGE.signed }),
      hueVarianceStrength: n('Hue Variance Strength', -0.1, { advanced: true, range: RANGE.signed }),
      huePostOffset: n('Hue Post Offset', -0.01, { advanced: true, range: RANGE.signed }),
      colormapScaleX: meters('Grass Colormap ScaleX', 50000, { advanced: true, range: RANGE.distanceLong }),
      colormapScaleY: meters('Grass Colormap ScaleY', 50000, { advanced: true, range: RANGE.distanceLong }),
      colormapOffsetX: n('Grass Colormap OffsetX', 0, { advanced: true, range: RANGE.signed }),
      colormapOffsetY: n('Grass Colormap OffsetY', 0, { advanced: true, range: RANGE.signed }),
      windSize: meters('Wind Size', 8000, { advanced: true, range: RANGE.distanceLong }),
      windMaskSize: n('Mask Size', 1.5, { advanced: true }),
      windMaskMultiply: n('Wind Mask Multiply', 3, { advanced: true }),
      windColorBoost: n('Wind Color Boost', 1.2, { advanced: true }),
    }),
  }),
  dirt: Object.freeze({
    description: 'P18 painted Dirt layer color, projection, normal, and specular response.',
    label: 'Dirt Surface',
    fields: Object.freeze({
      tint: c('Dirt Tint', [0.5006459951, 0.5293089747, 0.5520830154]),
      scale: n('Dirt Scale', 13, { label: 'Texture Scale', range: { min: 0.05, max: 128, step: 0.05 }, unit: 'm' }),
      normalFlatness: n('Dirt Flatten', 0.5, { range: RANGE.factor }),
      specular: n('Dirt Specular', 0.1, { range: RANGE.factor }),
    }),
  }),
  rock: Object.freeze({
    description: 'P18 painted Rock and AutoCliff surface, projection, normal-distance, far-tint, and material response.',
    label: 'Terrain Rock & Cliffs',
    fields: Object.freeze({
      tint: c('Rock Tint', [0.8931580186, 0.921875, 0.8296869993]),
      scale: meters('Rock Scale', 2500, { label: 'Texture Scale', range: { min: 0.05, max: 256, step: 0.05 } }),
      projectionContrast: n('Projection Contrast', 0.5, { range: { min: 0.01, max: 16, step: 0.01 } }),
      sideProjectionOnly: b('SideProjectOnly?', false, { advanced: true }),
      flatTopNormals: b('FlatTopCrackNormals?', false, { advanced: true }),
      normalFlatness: n('Rock Normal Flatten', 0, { range: RANGE.factor }),
      flattenDistantNormals: b('FlattenDistantCracks?', true),
      distantNormalFlatness: n('Distant Rock Normal Flatten', 1, { range: RANGE.factor }),
      normalFadeDistance: meters('Rock Normal Distance', 20000, { range: RANGE.distanceLong }),
      roughness: n('Roughness', 1.2, { range: { min: 0, max: 2, step: 0.01 } }),
      useRoughnessMap: b('RoughnessMap?', false, { advanced: true }),
      metallic: n('Metallic', 0.1, { range: RANGE.factor }),
      specular: n('Specular', 0.2, { range: RANGE.factor }),
      emissive: n('Emissive Strength', 0, { range: { min: 0, max: 2, step: 0.005 } }),
      closeTintDistance: meters('Close Tint Blend Distance', 500, { label: 'Far Tint Start', range: RANGE.distanceLong }),
      farTintDistance: meters('Far Tint Blend Distance', 15000, { label: 'Far Tint End', range: RANGE.distanceLong }),
      farTint: c('Distant Tint Blend', [0.59375, 0.59375, 0.59375]),
      farTintStrength: n('Distant Tint Blend Lerp Alpha Mix', 0.5, { range: RANGE.factor }),
    }),
  }),
  sand: Object.freeze({
    description: 'P18 painted Sand color, normal, specular, and source waterline response.',
    label: 'Sand & Shoreline',
    fields: Object.freeze({
      tint: c('Sand Tint', [0.8307700157, 0.8107119799, 0.6230779886]),
      scale: n('Sand Scale', 10, { label: 'Texture Scale', range: { min: 0.05, max: 128, step: 0.05 }, unit: 'm' }),
      normalFlatness: n('Sand Flatten', 0.3, { range: RANGE.factor }),
      specular: n('Sand Specular', 0.15, { range: RANGE.factor }),
      waterDarken: n('Water Darken', 0.7, { range: { min: 0, max: 2, step: 0.01 } }),
      waterlineHeight: meters('Waterline Height', 20, { range: { min: -20, max: 20, step: 0.01 } }),
      waterlineDistance: meters('Waterline Distance', 75, { range: { min: 0.01, max: 20, step: 0.01 } }),
    }),
  }),
  snow: Object.freeze({
    description: 'P18 Snow, SnowGrass, and SnowGrassBlue surface, sparkle, time, and distance response.',
    label: 'Snow Layers',
    fields: Object.freeze({
      blueTint: c('SnowGrassBlue Color', [0.3732640147, 0.4697799981, 0.8958330154]),
      scale: meters('Snow Scale', 5000, { label: 'Texture Scale', range: RANGE.distanceLong }),
      roughness: n('Snow Rough', 0.5, { range: RANGE.factor }),
      emissive: n('Snow Emission', 0.05, { range: { min: 0, max: 2, step: 0.005 } }),
      specularScale: meters('Snow Specular Scale', 75, { range: { min: 0.01, max: 50, step: 0.01 } }),
      specularMin: n('Snow Spec Min', 0.1, { range: RANGE.factor }),
      specularMax: n('Snow Spec Max', 0.3, { range: RANGE.factor }),
      sparkle: b('SnowSparkle?', true),
      dualSparkle: b('SnowSparkleDualLayer?', true),
      simpleSparkle: b('SimpleSparkle?', false, { advanced: true }),
      worldRotation: b('NeedWorldRotation?', true, { advanced: true }),
      shrinkNear: b('SparklShrinkNear?', true, { advanced: true }),
      project3d: b('SparkleProject3D?', false, { advanced: true }),
      sparkleDayWeather: b('SparkleDayAndWeather?', true, { advanced: true }),
      snowDayWeather: b('SnowDayAndWeather?', true),
      sparkleColor: c('Snow Sparkle Color', [0.6270310283, 0.6637669802, 1]),
      sparkleBrightness: n('Snow Sparkle Brightness', 20, { range: { min: 0, max: 200, step: 0.1 } }),
      sparkleRotation: n('Snow Sparkle Rotation', 0, { range: RANGE.turns, unit: 'turns' }),
      sparkleScale: meters('Snow Sparkle Scale', 1600, { range: RANGE.distance }),
      sparkle2Brightness: n('Snow Sparkle 2 Brightness', 20, { advanced: true, range: { min: 0, max: 200, step: 0.1 } }),
      sparkle2Rotation: n('Snow Sparkle 2 Rotation', 0.31, { advanced: true, range: RANGE.turns, unit: 'turns' }),
      sparkle2Scale: meters('Snow Sparkle 2 Scale', 1000, { advanced: true, range: RANGE.distance }),
      twinkleSpeed: n('Snow Twinkle Speed', 1, { advanced: true, range: { min: 0.01, max: 20, step: 0.01 } }),
      twinkleTolerance: n('Snow Twinkle Tolerance', 0.95, { advanced: true, range: RANGE.factor }),
      shrinkAmount: n('Snow Sparkle Shrink Amount', 0.3, { advanced: true, range: RANGE.factor }),
      shrinkNearDistance: meters('Snow Sparkle Shrink Near Distance', 500, { advanced: true, range: RANGE.distanceLong }),
      shrinkFarDistance: meters('Snow Shrink Far Distance', 1500, { advanced: true, range: RANGE.distanceLong }),
      fadeStart: meters('Snow Sparkle Fade Start', 200, { advanced: true, range: RANGE.distanceLong }),
      fadeEnd: meters('Snow Sparkle Fade End', 2500, { advanced: true, range: RANGE.distanceLong }),
    }),
  }),
  desertGrass: Object.freeze({
    description: 'P18 DesertGrass layer surface response. The P18 comparison weight for this layer is exactly zero.',
    label: 'Desert Grass',
    fields: Object.freeze({
      tint: c('Desert Grass Tint', [0.6041666865, 0.2142068744, 0.0989275351]),
      scale: meters('Desert Grass Scale', 1024, { range: RANGE.distance }),
      roughness: n('Desert Grass Roughness', 0.4, { range: RANGE.factor }),
      specular: n('Desert Grass Specular', 0.5, { range: RANGE.factor }),
      emissive: n('Desert Grass Emission', 0.2, { range: { min: 0, max: 2, step: 0.005 } }),
    }),
  }),
  desertDirt: Object.freeze({
    description: 'P18 DesertDirt layer surface response. The P18 comparison weight for this layer is exactly zero.',
    label: 'Desert Dirt',
    fields: Object.freeze({
      tint: c('Desert Dirt Tint', [0.6041666865, 0.2142068744, 0.0989275351]),
      scale: meters('Desert Dirt Scale', 1024, { range: RANGE.distance }),
      normalFlatness: n('Desert Dirt Normal Flatness', 0.5, { range: RANGE.factor }),
      roughnessMultiplier: n('Desert Dirt Roughness Multiplier', 1, { range: { min: 0, max: 4, step: 0.01 } }),
      specular: n('Desert Dirt Specular', 0.2, { range: RANGE.factor }),
      emissive: n('Desert Dirt Emissive', 0.1, { range: { min: 0, max: 2, step: 0.005 } }),
    }),
  }),
  desertSand: Object.freeze({
    description: 'P18 DesertSand dual-tint, variance, fresnel, normal-distance, and material response. Its comparison weight is exactly zero.',
    label: 'Desert Sand',
    fields: Object.freeze({
      tintA: c('Desert Sand Tint', [0.597202003, 0.2917709947, 0.1559260041]),
      tintB: c('Desert Sand Tint 2', [0.597202003, 0.2462009937, 0.1144350022]),
      scale: meters('Desert Sand Scale', 1024, { range: RANGE.distance }),
      varianceScale: meters('Desert Sand Color Variance Scale', 50000, { advanced: true, range: RANGE.distanceLong }),
      fresnelFalloff: n('Desert Sand Fresnel Falloff', 4, { range: { min: 0.01, max: 16, step: 0.01 } }),
      fresnelMultiply: n('Desert Sand Fresnel Multiply', 2),
      normalScale: meters('Desert Sand Normal Texture Scale', 2400, { range: RANGE.distance }),
      normalNearFlatness: n('Desert Sand Normal Near Flatness', 0, { range: RANGE.factor }),
      normalFarFlatness: n('Desert Sand Normal Far Flatness', 1, { range: RANGE.factor }),
      normalFadeDistance: meters('Desert Sand Normal Far Distance', 3000, { range: RANGE.distanceLong }),
      roughnessMin: n('Desert Sand Roughness Min', 0.5, { range: RANGE.factor }),
      roughnessMax: n('Desert Sand Roughness Max', 0.7, { range: RANGE.factor }),
      specular: n('Desert Sand Specular', 0.2, { range: RANGE.factor }),
      emissive: n('Desert Sand Emissive', 0.1, { range: { min: 0, max: 2, step: 0.005 } }),
    }),
  }),
  blending: Object.freeze({
    description: 'P18 ten-layer height blend and automatic cliff replacement.',
    label: 'Layer Blend & Cliffs',
    fields: Object.freeze({
      autoCliff: b('AutoCliff?', true),
      cliffStart: n('Auto Cliff Start', 0.85, { range: { min: -1, max: 1, step: 0.005 } }),
      cliffEnd: n('Auto Cliff Fade', 0.8, { description: 'P18 world-normal value at the other edge of the AutoCliff remap.', label: 'Auto Cliff End', range: { min: -1, max: 1, step: 0.005 } }),
      cliffNoiseScale: n('Auto Cliff Noise Scale', 80, { range: { min: 0.01, max: 500, step: 0.1 }, unit: 'm' }),
      cliffNoiseStrength: n('Auto Cliff Noise Strength', 2),
      heightNoiseScale: n('Height Noise Scale', 30, { advanced: true, range: { min: 0.01, max: 500, step: 0.1 }, unit: 'm' }),
      heightNoiseStrength: n('Height Noise Strength', 1.1, { advanced: true }),
    }),
  }),
  wetness: Object.freeze({
    description: 'How ground responds to host-owned wetness. Current wetness, rain, puddle placement, and the wet-surface style remain preview/runtime inputs.',
    label: 'Coverage Response',
    fields: Object.freeze({
      useWeather: b('UseWeather?', true),
      rainWetness: b('RainWetness?', true),
      darkening: n('Puddle Darkening', 0.75, { range: RANGE.factor }),
      desaturation: n('Puddle Desaturation', 0.75, { range: RANGE.factor }),
      roughness: n('Wet Roughness', 0.3, { range: RANGE.factor }),
      specular: n('Wet Specular', 1, { range: { min: 0, max: 2, step: 0.01 } }),
    }),
  }),
  emissionCycle: Object.freeze({
    description: 'P18 five-point day-cycle and overcast modulation for ground emission. Current time and weather remain scene state.',
    label: 'Emission Cycle',
    fields: Object.freeze({
      enabled: b('UseDayCycleEmission?', true),
      day: n('Day Emission Multiplier', 1, { range: { min: 0, max: 4, step: 0.01 } }),
      sunrise: n('Sunrise Emission Multiplier', 0.1, { range: { min: 0, max: 4, step: 0.01 } }),
      sunset: n('Sunset Emission Multiplier', 0.1, { range: { min: 0, max: 4, step: 0.01 } }),
      night: n('Night Emission Multiplier', 0, { range: { min: 0, max: 4, step: 0.01 } }),
      overcast: n('Overcast Emission Multiplier', 0.25, { range: { min: 0, max: 4, step: 0.01 } }),
    }),
  }),
});

const GROUND_OWNED_FIELDS = Object.freeze({
  grass: null,
  dirt: null,
  rock: null,
  sand: null,
  blending: null,
  wetness: Object.freeze([
    'darkening',
    'desaturation',
    'roughness',
    'specular',
  ]),
});

export const GROUND_SHADER_EXTERNAL_SOURCE_GROUPS = Object.freeze({
  desertDirt: Object.freeze({
    owner: 'landscape-material-preset',
    reason: 'Desert dirt is terrain asset/material identity, not an IP-wide Ground Shader setting.',
  }),
  desertGrass: Object.freeze({
    owner: 'landscape-material-preset',
    reason: 'Desert vegetated substrate is terrain asset/material identity; grass blades remain Grass Shader-owned.',
  }),
  desertSand: Object.freeze({
    owner: 'landscape-material-preset',
    reason: 'Desert sand is terrain asset/material identity, not an IP-wide Ground Shader setting.',
  }),
  emissionCycle: Object.freeze({
    owner: 'environment-time-response',
    reason: 'The current time and its global emission schedule belong to the environment timeline.',
  }),
  snow: Object.freeze({
    owner: 'snow-surface-shader',
    reason: 'Snow appearance is a cross-domain Snow Surface profile supplied by Weather Rendering & Surface.',
  }),
});

const sourceDefaults = {};
const sourceSchema = {};
const sourceByField = {};
for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
  sourceDefaults[groupId] = {};
  sourceSchema[groupId] = {};
  for (const [key, definition] of Object.entries(group.fields)) {
    sourceDefaults[groupId][key] = Array.isArray(definition.defaultValue)
      ? [...definition.defaultValue]
      : definition.defaultValue;
    const metadata = Object.freeze({
      ...definition,
      defaultValue: Array.isArray(definition.defaultValue)
        ? [...definition.defaultValue]
        : definition.defaultValue,
      group: groupId,
      id: `${groupId}.${key}`,
      key,
    });
    sourceSchema[groupId][key] = metadata;
    sourceByField[`${groupId}.${key}`] = Object.freeze({
      kind: definition.sourceKind,
      name: definition.sourceName,
      scale: definition.sourceScale,
    });
  }
  sourceDefaults[groupId] = Object.freeze(sourceDefaults[groupId]);
  sourceSchema[groupId] = Object.freeze(sourceSchema[groupId]);
}

const defaults = {};
const schema = {};
for (const [groupId, keys] of Object.entries(GROUND_OWNED_FIELDS)) {
  const selectedKeys = keys ?? Object.keys(sourceSchema[groupId]);
  defaults[groupId] = Object.freeze(Object.fromEntries(
    selectedKeys.map((key) => [
      key,
      Array.isArray(sourceDefaults[groupId][key])
        ? [...sourceDefaults[groupId][key]]
        : sourceDefaults[groupId][key],
    ]),
  ));
  schema[groupId] = Object.freeze(Object.fromEntries(
    selectedKeys.map((key) => [key, sourceSchema[groupId][key]]),
  ));
}

export const P18_GROUND_SOURCE_DEFAULTS = Object.freeze(sourceDefaults);
export const P18_GROUND_SOURCE_FIELD_SCHEMA = Object.freeze(sourceSchema);
export const DEFAULT_GROUND_SHADER_SETTINGS = Object.freeze(defaults);
export const CALL_ME_SENSEI_GROUND_SHADER_SETTINGS = DEFAULT_GROUND_SHADER_SETTINGS;
export const GROUND_SHADER_FIELD_SCHEMA = Object.freeze(schema);
export const GROUND_SHADER_SOURCE_BY_FIELD = Object.freeze(Object.fromEntries(
  Object.values(schema)
    .flatMap((fields) => Object.values(fields))
    .map((metadata) => [
      metadata.id,
      sourceByField[metadata.id],
    ]),
));
export const GROUND_SHADER_SETTING_GROUPS = Object.freeze(
  Object.keys(GROUND_OWNED_FIELDS).map((id) => Object.freeze({
    description: GROUP_DEFINITIONS[id].description,
    id,
    label: GROUP_DEFINITIONS[id].label,
  })),
);

const presets = new Map();

function clone(value) {
  return Array.isArray(value) ? [...value] : value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitize(value, definition, fallback) {
  if (definition.type === 'color') {
    if (!Array.isArray(value) || value.length < 3) return [...fallback];
    const result = value.slice(0, 3).map(Number);
    return result.every(Number.isFinite)
      ? result.map((channel) => Math.min(Math.max(channel, 0), 1))
      : [...fallback];
  }
  if (definition.type === 'boolean') {
    return typeof value === 'boolean' ? value : fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createGroundShaderSettings(options = {}) {
  const source = typeof options === 'string'
    ? { preset: options }
    : (isObject(options) ? options : {});
  const presetId = String(source.preset ?? DEFAULT_GROUND_SHADER_PRESET);
  const preset = presets.get(presetId) ?? presets.get(DEFAULT_GROUND_SHADER_PRESET);
  const input = isObject(source.settings) ? source.settings : source;
  const result = {};
  for (const [groupId, fields] of Object.entries(GROUND_SHADER_FIELD_SCHEMA)) {
    const groupInput = isObject(input[groupId]) ? input[groupId] : {};
    result[groupId] = {};
    for (const [key, definition] of Object.entries(fields)) {
      const fallback = preset?.settings?.[groupId]?.[key]
        ?? DEFAULT_GROUND_SHADER_SETTINGS[groupId][key];
      result[groupId][key] = sanitize(
        groupInput[key] === undefined ? fallback : groupInput[key],
        definition,
        fallback,
      );
    }
  }
  return result;
}

export function createGroundShaderSourceProfile(baseProfile, settings = {}) {
  if (!baseProfile?.parameters) {
    throw new TypeError('Ground Shader source-profile conversion needs a landscape material profile.');
  }
  const resolved = createGroundShaderSettings(settings);
  const profile = structuredClone(baseProfile);
  profile.parameters ??= {};
  profile.parameters.scalar ??= {};
  profile.parameters.vector ??= {};
  profile.parameters.static_switch ??= {};
  for (const [groupId, fields] of Object.entries(GROUND_SHADER_FIELD_SCHEMA)) {
    for (const [key, metadata] of Object.entries(fields)) {
      const value = resolved[groupId][key];
      if (metadata.sourceKind === 'vector') {
        const alpha = baseProfile.parameters.vector?.[metadata.sourceName]?.[3] ?? 1;
        profile.parameters.vector[metadata.sourceName] = [...value, alpha];
      } else if (metadata.sourceKind === 'static_switch') {
        profile.parameters.static_switch[metadata.sourceName] = Boolean(value);
      } else {
        profile.parameters.scalar[metadata.sourceName] = Number(value) * metadata.sourceScale;
      }
    }
  }
  return profile;
}

function canonicalDocument(id, definition = {}) {
  return {
    description: String(definition.description ?? ''),
    id: String(id ?? definition.id ?? '').trim(),
    label: String(definition.label ?? id ?? definition.id ?? '').trim(),
    settings: createGroundShaderSettings(definition.settings ?? definition),
    type: GROUND_SHADER_DOCUMENT_TYPE,
    version: GROUND_SHADER_SCHEMA_VERSION,
  };
}

export function validateGroundShaderPresetDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid Ground Shader JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isObject(source)) {
    return { errors: ['Ground Shader preset must be a JSON object.'], ok: false, value: null, warnings: [] };
  }
  const errors = [];
  const warnings = [];
  if (source.type !== GROUND_SHADER_DOCUMENT_TYPE) {
    errors.push(`Ground Shader preset type must be "${GROUND_SHADER_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? source.schemaVersion);
  if (!Number.isFinite(version)) errors.push('Ground Shader version must be a number.');
  else if (version === 2) {
    warnings.push(
      'Ground Shader v2 was migrated to v3. Snow, desert material identity, weather switches, and environment emission-cycle fields were removed from the Ground profile.',
    );
  } else if (version !== GROUND_SHADER_SCHEMA_VERSION) {
    errors.push(`Ground Shader version ${version} requires an explicit migration to ${GROUND_SHADER_SCHEMA_VERSION}.`);
  }
  const id = String(source.id ?? '').trim();
  if (!id) errors.push('Ground Shader preset id is required.');
  for (const [groupId, group] of Object.entries(isObject(source.settings) ? source.settings : {})) {
    if (!GROUND_SHADER_FIELD_SCHEMA[groupId]) {
      const external = GROUND_SHADER_EXTERNAL_SOURCE_GROUPS[groupId];
      if (external) {
        warnings.push(
          `Ground Shader group "${groupId}" is now owned by ${external.owner} and was not imported. ${external.reason}`,
        );
        continue;
      }
      warnings.push(`Unknown Ground Shader group "${groupId}" was ignored.`);
      continue;
    }
    for (const key of Object.keys(isObject(group) ? group : {})) {
      if (!GROUND_SHADER_FIELD_SCHEMA[groupId][key]) {
        warnings.push(`Unknown Ground Shader field "${groupId}.${key}" was ignored.`);
      }
    }
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? canonicalDocument(id, source) : null,
    warnings,
  };
}

export const parseGroundShaderPresetDocument = validateGroundShaderPresetDocument;

export function createGroundShaderPresetDocument(id, definition = {}) {
  const document = canonicalDocument(id, definition);
  const result = validateGroundShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeGroundShaderPreset(idOrDocument, definition = {}, {
  pretty = true,
} = {}) {
  const document = isObject(idOrDocument)
    && idOrDocument.type === GROUND_SHADER_DOCUMENT_TYPE
    ? createGroundShaderPresetDocument(idOrDocument.id, idOrDocument)
    : createGroundShaderPresetDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export function registerGroundShaderPreset(id, definition = {}, {
  overwrite = false,
} = {}) {
  const document = createGroundShaderPresetDocument(id, definition);
  if (!overwrite && presets.has(document.id)) {
    throw new Error(`Ground Shader preset "${document.id}" already exists.`);
  }
  presets.set(document.id, document);
  return {
    description: document.description,
    id: document.id,
    label: document.label,
    value: document.id,
  };
}

export function registerSerializedGroundShaderPreset(input, options = {}) {
  const result = parseGroundShaderPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerGroundShaderPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

export function getGroundShaderPresetOptions() {
  return [...presets.values()].map(({ description, id, label }) => ({
    description,
    id,
    label,
    value: id,
  }));
}

export function resolveGroundShaderPreset(
  id = DEFAULT_GROUND_SHADER_PRESET,
  overrides = {},
) {
  return createGroundShaderSettings({ ...overrides, preset: id });
}

registerGroundShaderPreset('call_me_sensei', {
  description: 'Ground-owned connected style inputs from the accepted P18 landscape graph.',
  label: 'Call Me Sensei',
});

export const GROUND_SHADER = Object.freeze({
  createDocument: createGroundShaderPresetDocument,
  createSettings: createGroundShaderSettings,
  defaults: DEFAULT_GROUND_SHADER_SETTINGS,
  description: 'P18-derived terrain and ground material treatment. Cross-domain snow, current weather, vegetation, biome material identity, and the environment timeline remain external.',
  documentType: GROUND_SHADER_DOCUMENT_TYPE,
  fieldSchema: GROUND_SHADER_FIELD_SCHEMA,
  getPresetOptions: getGroundShaderPresetOptions,
  groups: GROUND_SHADER_SETTING_GROUPS,
  id: 'ground',
  label: 'Ground Shader',
  registerPreset: registerGroundShaderPreset,
  validateDocument: validateGroundShaderPresetDocument,
});
