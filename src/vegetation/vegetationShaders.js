// Vegetation shader authoring has two public layers:
//
// 1. VEGETATION_SHADER is the canonical, IP-wide treatment profile consumed by
//    every vegetation material role. It deliberately excludes albedo/textures,
//    current light/weather/wind values, construction settings, and interaction
//    field geometry.
// 2. FOLIAGE_SHADER / GRASS_SHADER / FLOWER_SHADER / BARK_SHADER are the
//    original family APIs. They remain as compatibility adapters for existing
//    applications and saved documents, but new authoring should use one
//    VegetationShaderProfile instead of four unrelated presets.

import * as THREE from 'three';

export const VEGETATION_SHADER_DOCUMENT_TYPE = 'toonlab/vegetation-shader-preset';
export const VEGETATION_SHADER_SCHEMA_VERSION = 1;
export const VEGETATION_MATERIAL_CONTRACT_VERSION = 1;

export const VEGETATION_MATERIAL_ROLES = Object.freeze({
  foliageCard: 'foliageCard',
  flowerCenter: 'flowerCenter',
  flowerPetal: 'flowerPetal',
  grassBlade: 'grassBlade',
  herbaceousStem: 'herbaceousStem',
  woodySurface: 'woodySurface',
});

export const VEGETATION_MATERIAL_VARIANTS = Object.freeze({
  billboard: 'billboard',
  cutout: 'cutout',
  mesh: 'mesh',
  procedural: 'procedural',
});

const ALL_ROLES = Object.freeze(Object.values(VEGETATION_MATERIAL_ROLES));
const THIN_SURFACE_ROLES = Object.freeze([
  VEGETATION_MATERIAL_ROLES.grassBlade,
  VEGETATION_MATERIAL_ROLES.foliageCard,
  VEGETATION_MATERIAL_ROLES.flowerPetal,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function clampNumber(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function srgbTriplet(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : [...fallback];
}

function cloneSetting(value) {
  return Array.isArray(value) ? [...value] : value;
}

function pascalCase(value) {
  return String(value).replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g,
    (_match, _separator, char) => char.toUpperCase());
}

function field({
  defaultValue,
  description,
  label,
  range = null,
  roles = null,
  type = 'number',
  integer = false,
}) {
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? Object.freeze([...defaultValue]) : defaultValue,
    description,
    integer,
    label,
    range: range ? Object.freeze({ ...range }) : null,
    roles: Object.freeze([...(roles ?? ALL_ROLES)]),
    type,
  });
}

// Every exposed field has a uniform contract, even before every material
// variant implements it. applyVegetationShader reports missing uniforms so a
// lab can never imply that a control changed a material when it did not.
const GROUP_DEFINITIONS = Object.freeze({
  lighting: Object.freeze({
    description: 'IP-wide light and shadow treatment shared by every vegetation surface.',
    label: 'Shared Lighting',
    fields: Object.freeze({
      shadowTint: field({
        defaultValue: [0.36, 0.4, 0.58],
        description: 'Cool treatment tint mixed into shadowed vegetation without replacing its albedo.',
        label: 'Shadow Tint',
        type: 'color',
      }),
      shadowTintStrength: field({
        defaultValue: 1,
        description: 'Strength of the shared shadow tint treatment.',
        label: 'Shadow Tint Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      sunTintStrength: field({
        defaultValue: 0.25,
        description: 'How strongly the active sun color tints lit vegetation.',
        label: 'Sun Tint Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      skyFillStrength: field({
        defaultValue: 0.08,
        description: 'Shared sky-color fill in unlit vegetation regions.',
        label: 'Sky Fill Strength',
        range: { max: 0.5, min: 0, step: 0.005 },
      }),
      rimStrength: field({
        defaultValue: 0.12,
        description: 'View-dependent silhouette fill shared by vegetation surfaces.',
        label: 'Rim Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      rimPower: field({
        defaultValue: 3,
        description: 'Falloff exponent of the shared vegetation rim.',
        label: 'Rim Power',
        range: { max: 12, min: 0.5, step: 0.1 },
      }),
    }),
  }),
  thinSurface: Object.freeze({
    description: 'Lighting shared by thin blades, leaf cards, and petals.',
    label: 'Thin Surfaces',
    fields: Object.freeze({
      diffuseWrap: field({
        defaultValue: 0.5,
        description: 'Wraps direct light around thin surfaces so back faces remain readable.',
        label: 'Diffuse Wrap',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      transmissionStrength: field({
        defaultValue: 0.35,
        description: 'Shared sunlight transmission through blades, leaves, and petals.',
        label: 'Transmission Strength',
        range: { max: 2, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      transmissionPower: field({
        defaultValue: 3.5,
        description: 'Angular concentration of thin-surface transmission.',
        label: 'Transmission Power',
        range: { max: 12, min: 0.5, step: 0.1 },
        roles: THIN_SURFACE_ROLES,
      }),
      transmissionShadowFloor: field({
        defaultValue: 0.35,
        description: 'Minimum transmission that remains inside cast or cloud shadow.',
        label: 'Transmission Shadow Floor',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      normalUpBias: field({
        defaultValue: 0,
        description: 'Biases thin-surface shading normals toward world up.',
        label: 'Normal Up Bias',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
      twoSidedLighting: field({
        defaultValue: 1,
        description: 'Blends back-face normals into the shared thin-surface lighting model.',
        label: 'Two-Sided Lighting',
        range: { max: 1, min: 0, step: 0.01 },
        roles: THIN_SURFACE_ROLES,
      }),
    }),
  }),
  weatherResponse: Object.freeze({
    description: 'How the IP shades wetness and snow; current weather amounts remain scene-owned.',
    label: 'Weather Response',
    fields: Object.freeze({
      wetDarkening: field({
        defaultValue: 0.15,
        description: 'Maximum albedo darkening applied by wetness.',
        label: 'Wet Darkening',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      wetDesaturation: field({
        defaultValue: 0.05,
        description: 'Maximum desaturation applied by wetness.',
        label: 'Wet Desaturation',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      wetHighlightStrength: field({
        defaultValue: 0.2,
        description: 'Stylized highlight added to wet vegetation.',
        label: 'Wet Highlight Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      snowTint: field({
        defaultValue: [0.92, 0.96, 1],
        description: 'IP snow tint blended over retained snow coverage.',
        label: 'Snow Tint',
        type: 'color',
      }),
      snowShadowStrength: field({
        defaultValue: 0.65,
        description: 'Shadow response retained by snow-covered vegetation.',
        label: 'Snow Shadow Strength',
        range: { max: 1, min: 0, step: 0.01 },
      }),
      snowEdgeSoftness: field({
        defaultValue: 0.2,
        description: 'Softness of snow coverage transitions.',
        label: 'Snow Edge Softness',
        range: { max: 1, min: 0, step: 0.01 },
      }),
    }),
  }),
  grass: Object.freeze({
    description: 'Grass-only lighting, gradient, dense-field, gust, and bend treatment.',
    label: 'Grass',
    fields: Object.freeze({
      backlitStrength: field({ defaultValue: 0.4, description: 'Grass transmission multiplier.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      sceneShadowResponse: field({ defaultValue: 0.7, description: 'Grass response to renderer shadow visibility.', label: 'Scene Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      cloudShadowResponse: field({ defaultValue: 0.35, description: 'Grass response to the scene cloud-shadow field.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      bandThreshold: field({ defaultValue: 0.49, description: 'Center of the grass direct-light toon transition.', label: 'Band Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      bandSoftness: field({ defaultValue: 0.1, description: 'Width of the grass direct-light toon transition.', label: 'Band Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      shadowFloor: field({ defaultValue: 0.35, description: 'Minimum grass brightness in full shadow.', label: 'Shadow Floor', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      rootOcclusionStrength: field({ defaultValue: 0.36, description: 'Dense-field darkening at blade roots.', label: 'Root Occlusion Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      rootOcclusionHeight: field({ defaultValue: 0.62, description: 'Blade height over which root occlusion fades.', label: 'Root Occlusion Height', range: { max: 1, min: 0.01, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipGradientStart: field({ defaultValue: 0.1, description: 'Blade fraction where the root-to-tip material gradient begins.', label: 'Tip Gradient Start', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      tipGradientEnd: field({ defaultValue: 0.95, description: 'Blade fraction where the root-to-tip material gradient completes.', label: 'Tip Gradient End', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      colorVariationStrength: field({ defaultValue: 0.2, description: 'Seeded blade luminance variation.', label: 'Color Variation Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      gustSheenThreshold: field({ defaultValue: 0.78, description: 'Gust value where the blade-tip sheen begins.', label: 'Gust Sheen Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      gustSheenStrength: field({ defaultValue: 0.22, description: 'Strength of the moving gust sheen.', label: 'Gust Sheen Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      bendExponent: field({ defaultValue: 2, description: 'Root-to-tip curve used by wind and interaction deformation.', label: 'Bend Exponent', range: { max: 6, min: 0.5, step: 0.05 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
      interactionResponse: field({ defaultValue: 1, description: 'Grass deformation response to a scene-owned interaction field.', label: 'Interaction Response', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.grassBlade] }),
    }),
  }),
  foliage: Object.freeze({
    description: 'Leaf-card and canopy-volume treatment.',
    label: 'Foliage',
    fields: Object.freeze({
      backlitStrength: field({ defaultValue: 0.35, description: 'Foliage transmission multiplier.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      sceneShadowResponse: field({ defaultValue: 0.55, description: 'Foliage response to renderer shadow visibility.', label: 'Scene Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      cloudShadowResponse: field({ defaultValue: 0, description: 'Foliage response to the scene cloud-shadow field.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      bandThreshold: field({ defaultValue: 0.47, description: 'Center of the foliage direct-light toon transition.', label: 'Band Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      bandSoftness: field({ defaultValue: 0.18, description: 'Width of the foliage direct-light toon transition.', label: 'Band Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      crestThreshold: field({ defaultValue: 0.72, description: 'Center of the high crown-color crest band.', label: 'Crest Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      crestSoftness: field({ defaultValue: 0.12, description: 'Width of the high crown-color crest band.', label: 'Crest Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      crownOcclusionStrength: field({ defaultValue: 0.2, description: 'Additional darkening inside renderer-shadowed crowns.', label: 'Crown Occlusion Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      spriteLuminanceStrength: field({ defaultValue: 0.36, description: 'Influence of painted leaf-sprite luminance.', label: 'Sprite Luminance Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      cardVariationStrength: field({ defaultValue: 0.16, description: 'Seeded per-card luminance variation.', label: 'Card Variation Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
      transmissionPowerMultiplier: field({ defaultValue: 1, description: 'Foliage multiplier over the shared thin-surface transmission concentration.', label: 'Transmission Power Multiplier', range: { max: 3, min: 0.25, step: 0.05 }, roles: [VEGETATION_MATERIAL_ROLES.foliageCard] }),
    }),
  }),
  flower: Object.freeze({
    description: 'Shared petal/center treatment across mesh, cutout, procedural, and billboard flowers.',
    label: 'Flower',
    fields: Object.freeze({
      backlitStrength: field({ defaultValue: 0.35, description: 'Petal transmission multiplier.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      sceneShadowResponse: field({ defaultValue: 0.85, description: 'Flower response to renderer shadow visibility.', label: 'Scene Shadow Response', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      bandThreshold: field({ defaultValue: 0.5, description: 'Center of the flower direct-light toon transition.', label: 'Band Threshold', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      bandSoftness: field({ defaultValue: 0.1, description: 'Width of the flower direct-light toon transition.', label: 'Band Softness', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      unlitPetalLift: field({ defaultValue: 0.35, description: 'Petal-tinted floor for unlit petal faces.', label: 'Unlit Petal Lift', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      cupDarkeningStrength: field({ defaultValue: 0.1, description: 'Stylized darkening toward curved petal edges.', label: 'Cup Darkening Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      petalTransmissionMultiplier: field({ defaultValue: 1, description: 'Flower-family multiplier over shared thin-surface transmission.', label: 'Petal Transmission Multiplier', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerPetal] }),
      centerLightResponse: field({ defaultValue: 0.8, description: 'Direct-light response of flower centers relative to petals.', label: 'Center Light Response', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerCenter] }),
      centerShadowResponse: field({ defaultValue: 1, description: 'Shadow response of flower centers relative to petals.', label: 'Center Shadow Response', range: { max: 2, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.flowerCenter] }),
    }),
  }),
  bark: Object.freeze({
    description: 'Opaque woody treatment for trunks, branches, and roots.',
    label: 'Bark / Woody Surface',
    fields: Object.freeze({
      bandCount: field({ defaultValue: 3, description: 'Cel bands across the woody light-to-shadow ramp.', integer: true, label: 'Band Count', range: { max: 6, min: 2, step: 1 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      bandSoftness: field({ defaultValue: 0, description: 'Continuous softness of woody toon-band transitions.', label: 'Band Softness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      shadowFloor: field({ defaultValue: 0.35, description: 'Minimum brightness of a fully shadowed woody surface.', label: 'Shadow Floor', range: { max: 0.9, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      sunTintStrength: field({ defaultValue: 0.15, description: 'Sun-color tint applied to lit bark.', label: 'Sun Tint Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      skyFillStrength: field({ defaultValue: 0.04, description: 'Sky-color fill applied to shaded bark.', label: 'Sky Fill Strength', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      rimStrength: field({ defaultValue: 0, description: 'View-dependent woody silhouette fill.', label: 'Rim Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      specularStrength: field({ defaultValue: 0, description: 'Stylized bark highlight strength.', label: 'Specular Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
      verticalShadeStrength: field({ defaultValue: 0, description: 'World-up gradient used to ground trunks without changing their albedo.', label: 'Vertical Shade Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.woodySurface] }),
    }),
  }),
  stem: Object.freeze({
    description: 'Smooth herbaceous stem treatment, intentionally separate from woody bark.',
    label: 'Herbaceous Stem',
    fields: Object.freeze({
      bandCount: field({ defaultValue: 3, description: 'Cel bands across herbaceous stems.', integer: true, label: 'Band Count', range: { max: 6, min: 2, step: 1 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      bandSoftness: field({ defaultValue: 0.08, description: 'Softness of herbaceous stem toon bands.', label: 'Band Softness', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      shadowFloor: field({ defaultValue: 0.42, description: 'Minimum brightness of a fully shadowed stem.', label: 'Shadow Floor', range: { max: 0.9, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      transmissionStrength: field({ defaultValue: 0.08, description: 'Subtle light transmission through green stems.', label: 'Transmission Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      skyFillStrength: field({ defaultValue: 0.06, description: 'Additional stem sky-color fill over the shared vegetation fill.', label: 'Additional Sky Fill', range: { max: 0.5, min: 0, step: 0.005 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
      rimStrength: field({ defaultValue: 0.02, description: 'View-dependent stem silhouette fill.', label: 'Rim Strength', range: { max: 1, min: 0, step: 0.01 }, roles: [VEGETATION_MATERIAL_ROLES.herbaceousStem] }),
    }),
  }),
});

export const VEGETATION_SHADER_SETTING_GROUPS = Object.freeze(
  Object.entries(GROUP_DEFINITIONS).map(([id, group]) => Object.freeze({
    description: group.description,
    id,
    label: group.label,
  })),
);

const fieldSchema = {};
const defaultSettings = {};
const uniformByField = {};
for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
  const fields = {};
  const defaults = {};
  for (const [key, definition] of Object.entries(group.fields)) {
    const path = `${groupId}.${key}`;
    const uniform = `uStyle${pascalCase(groupId)}${pascalCase(key)}`;
    defaults[key] = cloneSetting(definition.defaultValue);
    uniformByField[path] = uniform;
    fields[key] = Object.freeze({
      defaultValue: cloneSetting(definition.defaultValue),
      description: definition.description,
      group: groupId,
      id: path,
      key,
      label: definition.label,
      range: definition.range,
      roles: definition.roles,
      serializable: true,
      type: definition.type,
      uniform,
    });
  }
  fieldSchema[groupId] = Object.freeze(fields);
  defaultSettings[groupId] = Object.freeze(defaults);
}

export const VEGETATION_SHADER_FIELD_SCHEMA = Object.freeze(fieldSchema);
export const DEFAULT_VEGETATION_SHADER_SETTINGS = Object.freeze(defaultSettings);
export const VEGETATION_SHADER_UNIFORM_BY_FIELD = Object.freeze(uniformByField);

const vegetationShaderPresets = new Map();

function sanitizeVegetationField(value, definition, fallback) {
  if (definition.type === 'color') return srgbTriplet(value, fallback);
  const number = clampNumber(value, fallback, definition.range ?? {});
  return definition.integer ? Math.round(number) : number;
}

function normalizePresetId(value) {
  const id = String(value ?? '').trim();
  return id || 'default';
}

/** Resolves one complete, plain IP-wide vegetation shader settings object. */
export function createVegetationShaderSettings(options = {}) {
  const source = typeof options === 'string' ? { preset: options } : cleanObject(options);
  const presetId = normalizePresetId(source.preset);
  const preset = vegetationShaderPresets.get(presetId) ?? vegetationShaderPresets.get('default');
  const base = preset?.settings ?? DEFAULT_VEGETATION_SHADER_SETTINGS;
  const input = isPlainObject(source.settings) ? source.settings : source;
  const settings = {};
  for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
    const groupInput = cleanObject(input[groupId]);
    const resolvedGroup = {};
    for (const [key, definition] of Object.entries(group.fields)) {
      const fallback = base[groupId]?.[key] ?? definition.defaultValue;
      resolvedGroup[key] = sanitizeVegetationField(
        groupInput[key] !== undefined ? groupInput[key] : fallback,
        definition,
        fallback,
      );
    }
    settings[groupId] = resolvedGroup;
  }
  return settings;
}

function collectUnknownVegetationFields(settings) {
  const warnings = [];
  for (const [groupId, value] of Object.entries(cleanObject(settings))) {
    if (!GROUP_DEFINITIONS[groupId]) {
      warnings.push(`Unknown vegetation shader group "${groupId}" was ignored.`);
      continue;
    }
    for (const key of Object.keys(cleanObject(value))) {
      if (!GROUP_DEFINITIONS[groupId].fields[key]) {
        warnings.push(`Unknown vegetation shader field "${groupId}.${key}" was ignored.`);
      }
    }
  }
  return warnings;
}

/** Validates a canonical VegetationShaderProfile document. */
export function validateVegetationShaderPresetDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid vegetation shader preset JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isPlainObject(source)) {
    return { errors: ['Vegetation shader preset must be a JSON object.'], ok: false, value: null, warnings: [] };
  }

  const errors = [];
  const warnings = [];
  if (source.type !== VEGETATION_SHADER_DOCUMENT_TYPE) {
    errors.push(`Vegetation shader preset type must be "${VEGETATION_SHADER_DOCUMENT_TYPE}".`);
  }
  const rawVersion = source.version ?? source.schemaVersion;
  const version = rawVersion === undefined ? VEGETATION_SHADER_SCHEMA_VERSION : Math.round(Number(rawVersion));
  if (rawVersion === undefined) warnings.push(`Vegetation shader preset version was missing and defaulted to ${VEGETATION_SHADER_SCHEMA_VERSION}.`);
  if (!Number.isFinite(version)) errors.push('Vegetation shader preset version must be a number.');
  else if (version > VEGETATION_SHADER_SCHEMA_VERSION) {
    errors.push(`Vegetation shader preset version ${version} is newer than supported version ${VEGETATION_SHADER_SCHEMA_VERSION}.`);
  }

  const id = String(source.id ?? '').trim();
  if (!id) errors.push('Vegetation shader preset id is required.');
  const settingsInput = cleanObject(source.settings);
  warnings.push(...collectUnknownVegetationFields(settingsInput));
  const value = errors.length === 0 ? {
    description: String(source.description ?? ''),
    id,
    label: String(source.label || id),
    settings: createVegetationShaderSettings(settingsInput),
    type: VEGETATION_SHADER_DOCUMENT_TYPE,
    version: VEGETATION_SHADER_SCHEMA_VERSION,
  } : null;
  return { errors, ok: errors.length === 0, value, warnings };
}

export function parseVegetationShaderPresetDocument(input) {
  return validateVegetationShaderPresetDocument(input);
}

export function createVegetationShaderPresetDocument(id, definition = {}) {
  const source = cleanObject(definition);
  const document = {
    description: source.description ?? '',
    id: id ?? source.id,
    label: source.label ?? id ?? source.id,
    settings: createVegetationShaderSettings(source.settings ?? source),
    type: VEGETATION_SHADER_DOCUMENT_TYPE,
    version: VEGETATION_SHADER_SCHEMA_VERSION,
  };
  const result = validateVegetationShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeVegetationShaderPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = isPlainObject(idOrDocument) && idOrDocument.type === VEGETATION_SHADER_DOCUMENT_TYPE
    ? createVegetationShaderPresetDocument(idOrDocument.id, idOrDocument)
    : createVegetationShaderPresetDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export function registerVegetationShaderPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createVegetationShaderPresetDocument(id, definition);
  if (!overwrite && vegetationShaderPresets.has(document.id)) {
    throw new Error(`Vegetation shader preset "${document.id}" already exists.`);
  }
  vegetationShaderPresets.set(document.id, {
    description: document.description,
    label: document.label,
    settings: document.settings,
  });
  return { description: document.description, id: document.id, label: document.label, value: document.id };
}

export function registerSerializedVegetationShaderPreset(input, options = {}) {
  const result = parseVegetationShaderPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerVegetationShaderPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

export function getVegetationShaderPresetOptions() {
  return [...vegetationShaderPresets.entries()].map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
    value: id,
  }));
}

export function resolveVegetationShaderPreset(id = 'default', overrides = {}) {
  return createVegetationShaderSettings({ ...cleanObject(overrides), preset: normalizePresetId(id) });
}

// Register the baseline before resolving any other preset.
registerVegetationShaderPreset('default', {
  description: 'Complete baseline vegetation shader treatment.',
  label: 'Default',
});
registerVegetationShaderPreset('call_me_sensei', {
  description: 'Studio-managed signature vegetation treatment.',
  label: 'Call Me Sensei',
  settings: {
    bark: { bandCount: 3, shadowFloor: 0.58, skyFillStrength: 0.12 },
    flower: { unlitPetalLift: 0.4 },
    foliage: {
      backlitStrength: 0.5,
      cloudShadowResponse: 0.68,
      crownOcclusionStrength: 0.1,
      sceneShadowResponse: 0.48,
    },
    grass: {
      backlitStrength: 0.52,
      cloudShadowResponse: 0.62,
      rootOcclusionStrength: 0.27,
      sceneShadowResponse: 0.56,
      shadowFloor: 0.52,
    },
    lighting: {
      rimStrength: 0.16,
      shadowTint: [0.72, 0.8, 1.0],
      shadowTintStrength: 0.42,
      skyFillStrength: 0.16,
    },
    stem: { shadowFloor: 0.56, skyFillStrength: 0.1 },
    thinSurface: { transmissionShadowFloor: 0.55 },
  },
});

export const VEGETATION_SHADER = Object.freeze({
  createDocument: createVegetationShaderPresetDocument,
  createSettings: createVegetationShaderSettings,
  defaults: DEFAULT_VEGETATION_SHADER_SETTINGS,
  description: 'One IP-wide vegetation treatment composed by semantic material role.',
  documentType: VEGETATION_SHADER_DOCUMENT_TYPE,
  fieldSchema: VEGETATION_SHADER_FIELD_SCHEMA,
  getPresetOptions: getVegetationShaderPresetOptions,
  id: 'vegetation',
  label: 'Vegetation Shader',
  registerPreset: registerVegetationShaderPreset,
  validateDocument: validateVegetationShaderPresetDocument,
});

/**
 * Marks a material as a semantic vegetation consumer. Technical variants are
 * metadata only; creative treatment is selected by role.
 */
export function tagVegetationMaterial(material, {
  role,
  roles = null,
  variant = VEGETATION_MATERIAL_VARIANTS.mesh,
} = {}) {
  if (!material || typeof material !== 'object') throw new Error('tagVegetationMaterial needs a material.');
  const resolvedRoles = [...new Set([
    ...(role === undefined || role === null ? [] : [role]),
    ...(Array.isArray(roles) ? roles : (roles === undefined || roles === null ? [] : [roles])),
  ].map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  if (resolvedRoles.length === 0) throw new Error('Vegetation material role is required.');
  const unknownRole = resolvedRoles.find((entry) => !ALL_ROLES.includes(entry));
  if (unknownRole) throw new Error(`Unknown vegetation material role "${unknownRole}".`);
  const resolvedVariant = String(variant ?? '').trim();
  if (!resolvedVariant) throw new Error('Vegetation material variant is required.');
  material.userData = material.userData ?? {};
  material.userData.toonlabVegetation = {
    // `role` remains the primary-role compatibility surface. `roles` is the
    // canonical capability list for composite materials such as a flower head
    // whose one draw call shades both petals and its center.
    role: resolvedRoles[0],
    roles: resolvedRoles,
    variant: resolvedVariant,
    version: VEGETATION_MATERIAL_CONTRACT_VERSION,
  };
  return material;
}

export function getVegetationMaterialContract(material) {
  const contract = material?.userData?.toonlabVegetation;
  if (!isPlainObject(contract)) return null;
  const roles = [...new Set([
    ...(contract.role === undefined || contract.role === null ? [] : [contract.role]),
    ...(Array.isArray(contract.roles) ? contract.roles : []),
  ].map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  return {
    role: roles[0] ?? '',
    roles,
    variant: String(contract.variant ?? ''),
    version: Number(contract.version),
  };
}

function collectMaterials(target, output, seenObjects = new Set()) {
  if (!target) return;
  if (Array.isArray(target)) {
    for (const entry of target) collectMaterials(entry, output, seenObjects);
    return;
  }
  if (target.isMaterial || (target.uniforms && target.userData)) {
    output.add(target);
    return;
  }
  if (seenObjects.has(target)) return;
  seenObjects.add(target);
  const materials = Array.isArray(target.material) ? target.material : [target.material];
  for (const material of materials) if (material) output.add(material);
  if (typeof target.traverse === 'function') {
    target.traverse((object) => {
      if (object === target) return;
      const nested = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of nested) if (material) output.add(material);
    });
  }
}

function writeStyleUniform(uniformNode, value) {
  if (!uniformNode || !('value' in uniformNode)) return false;
  if (Array.isArray(value)) {
    if (uniformNode.value?.isColor) {
      uniformNode.value.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace);
    } else if (typeof uniformNode.value?.fromArray === 'function') {
      uniformNode.value.fromArray(value);
    } else {
      uniformNode.value = [...value];
    }
  } else {
    uniformNode.value = value;
  }
  return true;
}

function fieldsForRole(role) {
  const fields = [];
  for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
    for (const [key, definition] of Object.entries(group.fields)) {
      if (!definition.roles.includes(role)) continue;
      fields.push({
        groupId,
        key,
        path: `${groupId}.${key}`,
        uniform: VEGETATION_SHADER_UNIFORM_BY_FIELD[`${groupId}.${key}`],
      });
    }
  }
  return fields;
}

function fieldsForRoles(roles) {
  const fields = new Map();
  for (const role of roles) {
    for (const descriptor of fieldsForRole(role)) {
      const existing = fields.get(descriptor.path);
      if (existing) existing.roles.push(role);
      else fields.set(descriptor.path, { ...descriptor, roles: [role] });
    }
  }
  return [...fields.values()];
}

/** Returns the profile slice a semantic material role is required to consume. */
export function resolveVegetationShaderRoleSettings(role, profile = {}) {
  if (!ALL_ROLES.includes(role)) throw new Error(`Unknown vegetation material role "${role}".`);
  const resolved = createVegetationShaderSettings(profile);
  const result = {};
  for (const descriptor of fieldsForRole(role)) {
    result[descriptor.groupId] = result[descriptor.groupId] ?? {};
    result[descriptor.groupId][descriptor.key] = cloneSetting(
      resolved[descriptor.groupId][descriptor.key],
    );
  }
  return result;
}

/**
 * Applies one unified shader profile to tagged materials under Object3Ds or in
 * material arrays. Unsupported fields are reported rather than silently
 * pretending that a material consumed them.
 */
export function applyVegetationShader(rootOrArray, profile = {}) {
  const resolved = createVegetationShaderSettings(profile);
  const materials = new Set();
  collectMaterials(rootOrArray, materials);
  const report = {
    applied: 0,
    matched: 0,
    roles: {},
    skipped: 0,
    unsupported: [],
    visited: materials.size,
    warnings: [],
    writes: 0,
  };

  for (const material of materials) {
    const contract = getVegetationMaterialContract(material);
    if (!contract) {
      report.skipped += 1;
      continue;
    }
    if (
      contract.version !== VEGETATION_MATERIAL_CONTRACT_VERSION
      || contract.roles.length === 0
      || contract.roles.some((role) => !ALL_ROLES.includes(role))
    ) {
      report.skipped += 1;
      report.warnings.push(`Material "${material.name || material.uuid || 'unnamed'}" has an invalid vegetation role contract.`);
      continue;
    }

    report.matched += 1;
    for (const role of contract.roles) {
      const roleReport = report.roles[role] ?? {
        applied: 0,
        matched: 0,
        variants: [],
        writes: 0,
      };
      roleReport.matched += 1;
      if (!roleReport.variants.includes(contract.variant)) roleReport.variants.push(contract.variant);
      report.roles[role] = roleReport;
    }

    let materialWrites = 0;
    const roleWrites = Object.fromEntries(contract.roles.map((role) => [role, 0]));
    for (const descriptor of fieldsForRoles(contract.roles)) {
      const uniformNode = material.uniforms?.[descriptor.uniform];
      if (!writeStyleUniform(uniformNode, resolved[descriptor.groupId][descriptor.key])) {
        report.unsupported.push({
          field: descriptor.path,
          material: material.name || material.uuid || 'unnamed',
          role: descriptor.roles[0],
          roles: descriptor.roles,
          uniform: descriptor.uniform,
          variant: contract.variant,
        });
        continue;
      }
      materialWrites += 1;
      for (const role of descriptor.roles) {
        roleWrites[role] += 1;
        report.roles[role].writes += 1;
      }
      report.writes += 1;
    }
    if (materialWrites > 0) {
      report.applied += 1;
      for (const role of contract.roles) {
        if (roleWrites[role] > 0) report.roles[role].applied += 1;
      }
    }
  }

  if (report.matched === 0) report.warnings.push('No tagged vegetation materials matched this profile.');
  else if (report.applied === 0) report.warnings.push('Tagged vegetation materials matched, but none implement the canonical style uniforms.');
  return report;
}

// ---------------------------------------------------------------------------
// Legacy family APIs. Kept stable for existing applications and documents.

/** Generic legacy master registry: schema + presets + settings/doc plumbing. */
function defineLegacyMaster({ documentType, fields, id, label, description }) {
  const presets = new Map();
  const defaults = Object.freeze(Object.fromEntries(
    Object.entries(fields).map(([key, definition]) => [key, definition.defaultValue]),
  ));

  function createSettings(options = {}) {
    const source = isPlainObject(options) ? options : {};
    const presetName = typeof source.preset === 'string' ? source.preset : null;
    const base = presetName && presets.has(presetName)
      ? { ...defaults, ...presets.get(presetName).settings }
      : { ...defaults };
    const settings = {};
    for (const [key, definition] of Object.entries(fields)) {
      const raw = source[key] !== undefined ? source[key] : base[key];
      settings[key] = definition.type === 'color'
        ? srgbTriplet(raw, defaults[key])
        : clampNumber(raw, base[key], definition.range ?? {});
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

  const legacyFieldSchema = Object.freeze(Object.fromEntries(
    Object.entries(fields).map(([key, definition]) => [key, Object.freeze({
      defaultValue: definition.defaultValue,
      description: definition.description,
      group: id,
      id: `${id}.${key}`,
      key,
      label: definition.label,
      range: definition.range ?? null,
      type: definition.type ?? 'number',
    })]),
  ));

  return Object.freeze({
    createDocument,
    createSettings,
    defaults,
    description,
    documentType,
    fieldSchema: legacyFieldSchema,
    getPresetOptions,
    id,
    label,
    registerPreset,
    validateDocument,
  });
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const FOLIAGE_SHADER = defineLegacyMaster({
  description: 'Compatibility foliage treatment adapter.',
  documentType: 'toonlab/foliage-shader',
  id: 'foliage',
  label: 'Foliage',
  fields: {
    backlitStrength: { defaultValue: 0.35, description: 'Translucent leaf glow.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 } },
    sceneShadowStrength: { defaultValue: 0.55, description: 'Renderer shadow response.', label: 'Scene Shadow Strength', range: { max: 1, min: 0, step: 0.01 } },
    cloudShadowStrength: { defaultValue: 0, description: 'Cloud-shadow response.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 } },
    alphaCutoff: { defaultValue: 0.3, description: 'Leaf sprite cutout threshold.', label: 'Alpha Cutoff', range: { max: 0.9, min: 0.05, step: 0.01 } },
  },
});

const FOLIAGE_UNIFORM_BY_FIELD = Object.freeze({
  alphaCutoff: 'uAlphaCutoff',
  backlitStrength: 'uBacklitStrength',
  cloudShadowStrength: 'uCloudShadowStrength',
  sceneShadowStrength: 'uSceneShadowStrength',
});

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyFoliageShader(root, settings) {
  const resolved = FOLIAGE_SHADER.createSettings(settings);
  let count = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const uniforms = material?.uniforms;
      if (!uniforms?.uBacklitStrength || !uniforms?.uSceneShadowStrength) continue;
      for (const [fieldName, uniformName] of Object.entries(FOLIAGE_UNIFORM_BY_FIELD)) {
        if (uniforms[uniformName]) uniforms[uniformName].value = resolved[fieldName];
      }
      count += 1;
    }
  });
  return count;
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const GRASS_SHADER = defineLegacyMaster({
  description: 'Compatibility grass treatment adapter.',
  documentType: 'toonlab/grass-shader',
  id: 'grass',
  label: 'Grass',
  fields: {
    backlitStrength: { defaultValue: 0.4, description: 'Translucent blade glow.', label: 'Backlit Strength', range: { max: 1.5, min: 0, step: 0.01 } },
    shadowStrength: { defaultValue: 0.7, description: 'Renderer shadow response.', label: 'Scene Shadow Strength', range: { max: 1, min: 0, step: 0.01 } },
    shadowTint: { defaultValue: Object.freeze([0.36, 0.4, 0.58]), description: 'Treatment shadow tint.', label: 'Shadow Tint', type: 'color' },
    cloudShadowStrength: { defaultValue: 0.35, description: 'Cloud-shadow response.', label: 'Cloud Shadow Response', range: { max: 1, min: 0, step: 0.01 } },
    pushRadius: { defaultValue: 0.6, description: 'Compatibility interaction radius.', label: 'Push Radius', range: { max: 2, min: 0, step: 0.02 } },
  },
});

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyGrassShader(fieldObject, settings) {
  const resolved = GRASS_SHADER.createSettings(settings);
  fieldObject?.applySettings?.(resolved);
  return resolved;
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const FLOWER_SHADER = defineLegacyMaster({
  description: 'Compatibility 3D bloom treatment adapter.',
  documentType: 'toonlab/flower-shader',
  id: 'flower',
  label: 'Flower',
  fields: {
    unlitPetalLift: { defaultValue: 0.35, description: 'Petal-tinted unlit floor.', label: 'Unlit Petal Lift', range: { max: 1, min: 0, step: 0.01 } },
  },
});

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyFlowerShader(root, settings) {
  const resolved = FLOWER_SHADER.createSettings(settings);
  let count = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.uniforms?.uUnlitLift) {
        material.uniforms.uUnlitLift.value = resolved.unlitPetalLift;
        count += 1;
      }
    }
  });
  return count;
}

/** @deprecated Use VEGETATION_SHADER and one VegetationShaderProfile. */
export const BARK_SHADER = defineLegacyMaster({
  description: 'Compatibility MeshToonMaterial bark treatment adapter.',
  documentType: 'toonlab/bark-shader',
  id: 'bark',
  label: 'Bark',
  fields: {
    bandCount: { defaultValue: 3, description: 'Cel band count.', label: 'Band Count', range: { max: 6, min: 2, step: 1 } },
    shadowFloor: { defaultValue: 0.35, description: 'Brightness of the darkest band.', label: 'Shadow Floor', range: { max: 0.9, min: 0, step: 0.01 } },
    bandSoftness: { defaultValue: 0, description: 'Compatibility toon-ramp filtering.', label: 'Band Softness', range: { max: 1, min: 0, step: 0.05 } },
  },
});

/** Builds the legacy MeshToonMaterial gradient ramp. */
export function createBarkGradientMap(settings) {
  const resolved = BARK_SHADER.createSettings(settings);
  const steps = Math.max(2, Math.round(resolved.bandCount));
  const width = 64;
  const data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x += 1) {
    const t = x / (width - 1);
    const stepped = Math.floor(t * (steps - 1) + 1e-6) / (steps - 1 || 1);
    const ramp = THREE.MathUtils.lerp(stepped, t, resolved.bandSoftness);
    const value = resolved.shadowFloor + (1 - resolved.shadowFloor) * ramp;
    const level = Math.round(value * 255);
    data.set([level, level, level, 255], x * 4);
  }
  const texture = new THREE.DataTexture(data, width, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** @deprecated Compatibility adapter; use applyVegetationShader. */
export function applyBarkShader(root, settings) {
  const gradientMap = createBarkGradientMap(settings);
  let count = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
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

/** @deprecated The canonical registry is VEGETATION_SHADER. */
export const VEGETATION_SHADERS = Object.freeze([
  FOLIAGE_SHADER,
  GRASS_SHADER,
  FLOWER_SHADER,
  BARK_SHADER,
]);

for (const master of VEGETATION_SHADERS) master.registerPreset('default', { label: 'Default' });
FOLIAGE_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { backlitStrength: 0.5, cloudShadowStrength: 0.68, sceneShadowStrength: 0.48 },
});
GRASS_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { backlitStrength: 0.52, cloudShadowStrength: 0.62, shadowTint: [0.72, 0.8, 1] },
});
FLOWER_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { unlitPetalLift: 0.4 },
});
BARK_SHADER.registerPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  settings: { bandCount: 3, shadowFloor: 0.58 },
});

export const createFoliageShaderSettings = FOLIAGE_SHADER.createSettings;
export const createGrassShaderSettings = GRASS_SHADER.createSettings;
export const createFlowerShaderSettings = FLOWER_SHADER.createSettings;
export const createBarkShaderSettings = BARK_SHADER.createSettings;

const LEGACY_MASTER_BY_KEY = Object.freeze({
  bark: BARK_SHADER,
  flower: FLOWER_SHADER,
  foliage: FOLIAGE_SHADER,
  grass: GRASS_SHADER,
});

function parseLegacyDocument(value, key, errors) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      errors.push(`Invalid legacy ${key} shader JSON: ${error.message}`);
      return null;
    }
  }
  if (!isPlainObject(source)) {
    errors.push(`Legacy ${key} shader must be an object or JSON string.`);
    return null;
  }
  const master = LEGACY_MASTER_BY_KEY[key];
  if (source.type && source.type !== master.documentType) {
    errors.push(`Legacy ${key} shader type must be "${master.documentType}".`);
    return null;
  }
  return {
    id: String(source.id ?? ''),
    label: String(source.label ?? ''),
    settings: master.createSettings(source.settings ?? source),
  };
}

/**
 * Combines one or all four legacy family documents into one canonical preset.
 * Material alpha cutoff and interaction radius intentionally remain outside
 * the canonical shader profile and produce migration warnings.
 */
export function migrateLegacyVegetationShaderDocuments(input, options = {}) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid legacy vegetation shader JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isPlainObject(source)) {
    return { errors: ['Legacy vegetation shader input must be an object.'], ok: false, value: null, warnings: [] };
  }
  if (source.type === VEGETATION_SHADER_DOCUMENT_TYPE) return validateVegetationShaderPresetDocument(source);

  const legacyKey = Object.entries(LEGACY_MASTER_BY_KEY)
    .find(([, master]) => source.type === master.documentType)?.[0];
  const documents = legacyKey ? { [legacyKey]: source } : source;
  const errors = [];
  const warnings = [];
  const settings = {};
  let firstDocument = null;

  for (const key of Object.keys(LEGACY_MASTER_BY_KEY)) {
    if (documents[key] === undefined) continue;
    const document = parseLegacyDocument(documents[key], key, errors);
    if (!document) continue;
    firstDocument = firstDocument ?? document;
    const legacy = document.settings;
    if (key === 'foliage') {
      settings.foliage = {
        backlitStrength: legacy.backlitStrength,
        cloudShadowResponse: legacy.cloudShadowStrength,
        sceneShadowResponse: legacy.sceneShadowStrength,
      };
      warnings.push('Legacy foliage alphaCutoff remains a material/texture setting and was not migrated into the shader profile.');
    } else if (key === 'grass') {
      settings.grass = {
        backlitStrength: legacy.backlitStrength,
        cloudShadowResponse: legacy.cloudShadowStrength,
        sceneShadowResponse: legacy.shadowStrength,
      };
      settings.lighting = { shadowTint: legacy.shadowTint };
      warnings.push('Legacy grass pushRadius remains an interaction-field setting and was not migrated into the shader profile.');
    } else if (key === 'flower') {
      settings.flower = { unlitPetalLift: legacy.unlitPetalLift };
    } else if (key === 'bark') {
      settings.bark = {
        bandCount: legacy.bandCount,
        bandSoftness: legacy.bandSoftness,
        shadowFloor: legacy.shadowFloor,
      };
    }
  }

  if (!firstDocument && errors.length === 0) {
    errors.push('No legacy foliage, grass, flower, or bark shader document was provided.');
  }
  if (errors.length > 0) return { errors, ok: false, value: null, warnings };

  const id = String(options.id ?? firstDocument.id ?? 'migrated-vegetation').trim();
  const label = String(options.label ?? firstDocument.label ?? id).trim();
  const value = createVegetationShaderPresetDocument(id, {
    description: options.description ?? 'Migrated from legacy vegetation family shader presets.',
    label,
    settings,
  });
  return { errors: [], ok: true, value, warnings };
}
