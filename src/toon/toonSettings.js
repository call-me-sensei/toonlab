import { createAlphaSettings, DEFAULT_ALPHA_SETTINGS } from './settings/alphaSettings.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';
import { createAverageShadowSettings, DEFAULT_AVERAGE_SHADOW_SETTINGS } from './settings/averageShadowSettings.js';
import {
  BASE_TEXTURE_MATERIAL_COLOR_MODES,
  BASE_TEXTURE_SATURATION_MODES,
  createBaseTextureSettings,
  DEFAULT_BASE_TEXTURE_SETTINGS,
} from './settings/baseTextureSettings.js';
import { createCelShadeSettings, DEFAULT_CEL_SHADE_SETTINGS } from './settings/celShadeSettings.js';
import { createContactShadowSettings, DEFAULT_CONTACT_SHADOW_SETTINGS } from './settings/contactShadowSettings.js';
import { createFurSettings, DEFAULT_FUR_SETTINGS } from './settings/furSettings.js';
import { createGlitterSettings, DEFAULT_GLITTER_SETTINGS } from './settings/glitterSettings.js';
import {
  createPerspectiveRemovalSettings,
  DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS,
} from './settings/perspectiveRemovalSettings.js';
import {
  createStickerSettings,
  DEFAULT_STICKER_SETTINGS,
  STICKER_BLEND_MODES,
} from './settings/stickerSettings.js';
import {
  createEyeHighlightSettings,
  DEFAULT_EYE_HIGHLIGHT_SETTINGS,
  EYE_HIGHLIGHT_SOURCE_MASK_MODES,
} from './settings/eyeHighlightSettings.js';
import {
  createFaceLightingSettings,
  DEFAULT_FACE_LIGHTING_SETTINGS,
  FACE_HEAD_SPACE_MODES,
} from './settings/faceLightingSettings.js';
import {
  createHairHighlightSettings,
  DEFAULT_HAIR_HIGHLIGHT_SETTINGS,
  HAIR_HIGHLIGHT_MODES,
  HAIR_HIGHLIGHT_SOURCE_MASK_MODES,
} from './settings/hairHighlightSettings.js';
import { createIndirectLightSettings, DEFAULT_INDIRECT_LIGHT_SETTINGS } from './settings/indirectLightSettings.js';
import { createLocalLightSettings, DEFAULT_LOCAL_LIGHT_SETTINGS } from './settings/localLightSettings.js';
import {
  createMaterialMapSettings,
  DEFAULT_MATERIAL_MAP_SETTINGS,
  MATERIAL_MAP_SOURCE_MODES,
} from './settings/materialMapSettings.js';
import { createOutlineSettings, DEFAULT_OUTLINE_SETTINGS } from './settings/outlineSettings.js';
import { createRimLightSettings, DEFAULT_RIM_LIGHT_SETTINGS, RIM_LIGHT_MODES } from './settings/rimLightSettings.js';
import { createSceneShadowSettings, DEFAULT_SCENE_SHADOW_SETTINGS } from './settings/sceneShadowSettings.js';
import {
  createSelfShadowSettings,
  DEFAULT_SELF_SHADOW_SETTINGS,
  SELF_SHADOW_SOURCE_MODES,
} from './settings/selfShadowSettings.js';
import { createShadowColorSettings, DEFAULT_SHADOW_COLOR_SETTINGS } from './settings/shadowColorSettings.js';
import { createSkinToneSettings, DEFAULT_SKIN_TONE_SETTINGS } from './settings/skinToneSettings.js';
import {
  createSpecularSettings,
  DEFAULT_SPECULAR_SETTINGS,
  SPECULAR_DIRECTION_MODES,
  SPECULAR_SOURCE_MASK_MODES,
} from './settings/specularSettings.js';
import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';

export const TOON_PRESET_DOCUMENT_TYPE = 'toonlab/toon-preset';
export const TOON_PRESET_SCHEMA_VERSION = 1;

export const TOON_PRESET_IDS = Object.freeze({
  callMeSensei: 'call_me_sensei',
  default: 'default',
  showcase: 'showcase',
});

const DEFAULT_TOON_PRESET_SETTINGS = Object.freeze({});

export const TOON_SETTING_DEFAULTS = Object.freeze({
  alpha: DEFAULT_ALPHA_SETTINGS,
  averageShadow: DEFAULT_AVERAGE_SHADOW_SETTINGS,
  baseTexture: DEFAULT_BASE_TEXTURE_SETTINGS,
  celShade: DEFAULT_CEL_SHADE_SETTINGS,
  contactShadow: DEFAULT_CONTACT_SHADOW_SETTINGS,
  eyeHighlight: DEFAULT_EYE_HIGHLIGHT_SETTINGS,
  faceLighting: DEFAULT_FACE_LIGHTING_SETTINGS,
  fur: DEFAULT_FUR_SETTINGS,
  glitter: DEFAULT_GLITTER_SETTINGS,
  hairHighlight: DEFAULT_HAIR_HIGHLIGHT_SETTINGS,
  perspectiveRemoval: DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS,
  sticker: DEFAULT_STICKER_SETTINGS,
  indirectLight: DEFAULT_INDIRECT_LIGHT_SETTINGS,
  localLights: DEFAULT_LOCAL_LIGHT_SETTINGS,
  materialMaps: DEFAULT_MATERIAL_MAP_SETTINGS,
  outline: DEFAULT_OUTLINE_SETTINGS,
  rimLight: DEFAULT_RIM_LIGHT_SETTINGS,
  sceneShadow: DEFAULT_SCENE_SHADOW_SETTINGS,
  selfShadow: DEFAULT_SELF_SHADOW_SETTINGS,
  shadowColor: DEFAULT_SHADOW_COLOR_SETTINGS,
  skinTone: DEFAULT_SKIN_TONE_SETTINGS,
  specular: DEFAULT_SPECULAR_SETTINGS,
});

export const TOON_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Preserves source texture, source material color, and saturation policy before toon lighting.',
    id: 'baseTexture',
    label: 'Base Texture',
  }),
  Object.freeze({
    description: 'Classifies materials as skin, face, hair, eyes, costume, metal, transparent overlays, and outline.',
    id: 'materialRoles',
    label: 'Material Roles',
  }),
  Object.freeze({
    description: 'Controls cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior.',
    id: 'alpha',
    label: 'Alpha',
  }),
  Object.freeze({
    description: 'Keeps skin and face shadows warm, readable, and separate from costume/hair shadows.',
    id: 'skinTone',
    label: 'Skin Tone',
  }),
  Object.freeze({
    description: 'Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows.',
    id: 'faceLighting',
    label: 'Face Lighting',
  }),
  Object.freeze({
    description: 'Sets the primary directional cel band threshold, softness, and light-ignore amount.',
    id: 'celShade',
    label: 'Cel Shade',
  }),
  Object.freeze({
    description: 'Tints and reshapes lit-to-shadow transitions and fully shadowed regions.',
    id: 'shadowColor',
    label: 'Shadow Color',
  }),
  Object.freeze({
    description: 'Controls how renderer shadow maps darken character materials.',
    id: 'sceneShadow',
    label: 'Scene Shadows',
  }),
  Object.freeze({
    description: 'Controls character-local self-shadow proxy contribution until a dedicated self-shadow pass exists.',
    id: 'selfShadow',
    label: 'Self Shadow',
  }),
  Object.freeze({
    description: 'Adds averaged shadow visibility used for softer role-specific shadow damping.',
    id: 'averageShadow',
    label: 'Average Shadow',
  }),
  Object.freeze({
    description: 'Mixes ambient, hemisphere, and environment light into toon shading.',
    id: 'indirectLight',
    label: 'Indirect Light',
  }),
  Object.freeze({
    description: 'Controls point and spot light response for characters without overpowering cel bands.',
    id: 'localLights',
    label: 'Local Lights',
  }),
  Object.freeze({
    description: 'Adds view-dependent edge light that can be blocked or softened by shadow.',
    id: 'rimLight',
    label: 'Rim Light',
  }),
  Object.freeze({
    description: 'Adds thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass.',
    id: 'contactShadow',
    label: 'Contact Shadow',
  }),
  Object.freeze({
    description: 'Adds role-aware stylized highlights and optional source specular masks.',
    id: 'specular',
    label: 'Specular',
  }),
  Object.freeze({
    description: 'Adds hair-specific highlight bands, optional anisotropic strand response, and source masks.',
    id: 'hairHighlight',
    label: 'Hair Highlight',
  }),
  Object.freeze({
    description: 'Adds role-aware eye/catchlight boosts and optional source masks.',
    id: 'eyeHighlight',
    label: 'Eye Highlight',
  }),
  Object.freeze({
    description: 'Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular maps.',
    id: 'materialMaps',
    label: 'Material Maps',
  }),
  Object.freeze({
    description: 'Controls the inverted-hull outline pass, including role-specific widths and colors.',
    id: 'outline',
    label: 'Outlines',
  }),
  Object.freeze({
    description: 'Adds procedural view-dependent sparkles for sparkly costumes and accessories. Off by default.',
    id: 'glitter',
    label: 'Glitter',
  }),
  Object.freeze({
    description: 'Blends a decal/overlay texture into the albedo before lighting (ice, tattoos, damage). Off by default.',
    id: 'sticker',
    label: 'Sticker',
  }),
  Object.freeze({
    description: 'Flattens perspective around the tracked head for anime-portrait closeups. Off by default.',
    id: 'perspectiveRemoval',
    label: 'Perspective Removal',
  }),
  Object.freeze({
    description: 'Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default.',
    id: 'fur',
    label: 'Fur',
  }),
]);

export const TOON_SETTING_GROUP_METADATA = Object.freeze(
  Object.fromEntries(TOON_SETTING_GROUPS.map((group) => [group.id, group])),
);

const SELECT_FIELD_OPTIONS = Object.freeze({
  'baseTexture.materialColorMode': Object.values(BASE_TEXTURE_MATERIAL_COLOR_MODES),
  'baseTexture.saturationMode': Object.values(BASE_TEXTURE_SATURATION_MODES),
  'eyeHighlight.maskChannel': [0, 1, 2, 3],
  'eyeHighlight.sourceMaskMode': Object.values(EYE_HIGHLIGHT_SOURCE_MASK_MODES),
  'faceLighting.headSpaceMode': Object.values(FACE_HEAD_SPACE_MODES),
  'hairHighlight.maskChannel': [0, 1, 2, 3],
  'hairHighlight.mode': [HAIR_HIGHLIGHT_MODES.legacy, HAIR_HIGHLIGHT_MODES.anisotropic],
  'hairHighlight.sourceMaskMode': Object.values(HAIR_HIGHLIGHT_SOURCE_MASK_MODES),
  'hairHighlight.uvBandAxis': [0, 1],
  'hairHighlight.uvPreset': ['center', 'full', 'left', 'right', 'vertical', 'wide'],
  'materialMaps.sourceMode': Object.values(MATERIAL_MAP_SOURCE_MODES),
  'rimLight.mode': Object.values(RIM_LIGHT_MODES),
  'selfShadow.sourceMode': Object.values(SELF_SHADOW_SOURCE_MODES),
  'sticker.blendMode': Object.values(STICKER_BLEND_MODES),
  'sticker.uvChannel': [0, 1],
  'glitter.uvChannel': [0, 1],
  'specular.directionMode': Object.values(SPECULAR_DIRECTION_MODES),
  'specular.maskChannel': [0, 1, 2, 3],
  'specular.sourceMaskMode': Object.values(SPECULAR_SOURCE_MASK_MODES),
});

const SELECT_FIELD_OPTION_LABELS = Object.freeze({
  'baseTexture.materialColorMode': Object.freeze({
    legacy: 'Compatibility',
    source: 'Source Material Color',
    texture: 'Texture Only',
    white: 'White',
  }),
  'baseTexture.saturationMode': Object.freeze({
    custom: 'Custom',
    legacy: 'Compatibility',
    source: 'Source Saturation',
  }),
  'eyeHighlight.maskChannel': Object.freeze({
    0: 'Red',
    1: 'Green',
    2: 'Blue',
    3: 'Alpha',
  }),
  'eyeHighlight.sourceMaskMode': Object.freeze({
    off: 'Off',
    source: 'Source Material',
  }),
  'hairHighlight.maskChannel': Object.freeze({
    0: 'Red',
    1: 'Green',
    2: 'Blue',
    3: 'Alpha',
  }),
  'hairHighlight.mode': Object.freeze({
    anisotropic: 'Strand Highlight',
    legacy: 'Soft Highlight',
  }),
  'hairHighlight.sourceMaskMode': Object.freeze({
    off: 'Off',
    source: 'Source Material',
  }),
  'hairHighlight.uvBandAxis': Object.freeze({
    0: 'U / Horizontal',
    1: 'V / Vertical',
  }),
  'materialMaps.sourceMode': Object.freeze({
    off: 'Off',
    source: 'Source Maps',
  }),
  'faceLighting.headSpaceMode': Object.freeze({
    headBone: 'Head Bone (Tracked)',
    static: 'Static Proxy Normal',
  }),
  'rimLight.mode': Object.freeze({
    depthTexture: 'Depth Texture (Screen Space)',
    fresnel: 'Fresnel (Classic)',
  }),
  'selfShadow.sourceMode': Object.freeze({
    0: 'Off',
    1: 'Scene Shadow Proxy',
    2: 'Character Shadow Pass',
  }),
  'specular.directionMode': Object.freeze({
    light: 'Light Direction',
    view: 'View Direction (Stable)',
  }),
  'sticker.blendMode': Object.freeze({
    add: 'Additive',
    multiply: 'Multiply',
    normal: 'Alpha Blend',
  }),
  'sticker.uvChannel': Object.freeze({
    0: 'UV',
    1: 'UV2',
  }),
  'glitter.uvChannel': Object.freeze({
    0: 'UV',
    1: 'UV2',
  }),
  'specular.maskChannel': Object.freeze({
    0: 'Red',
    1: 'Green',
    2: 'Blue',
    3: 'Alpha',
  }),
  'specular.sourceMaskMode': Object.freeze({
    off: 'Off',
    source: 'Source Material',
  }),
});

const FIELD_TYPE_OVERRIDES = Object.freeze({
  'faceLighting.faceProxyNormal': 'vector3',
  'hairHighlight.direction': 'vector3',
  'materialMaps.detailRepeat': 'vector2',
  'materialMaps.normalScale': 'vector2',
  'shadowColor.lowSaturationFallbackColor': 'vector4',
});

const NON_SERIALIZABLE_FIELDS = Object.freeze(new Set([
  'eyeHighlight.maskMap',
  'hairHighlight.maskMap',
  'specular.maskMap',
]));

const FIELD_LABEL_OVERRIDES = Object.freeze({
  aoStrength: 'AO Strength',
  uvBandAxis: 'UV Band Axis',
  uvBandCenter: 'UV Band Center',
  uvBandHalfWidth: 'UV Band Width',
  uvPreset: 'UV Preset',
});

function labelFromFieldName(key) {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function descriptionForField(group, key) {
  const label = labelFromFieldName(key).toLowerCase();
  if (key === 'enabled') return `Turns ${group.label.toLowerCase()} on or off.`;
  if (key.includes('Intensity')) return `Controls how strongly ${label} contributes.`;
  if (key.includes('Strength')) return `Controls the blend strength for ${label}.`;
  if (key.includes('MinLight') || key.includes('MinimumIndirectLight')) return `Sets the minimum light floor for ${label}.`;
  if (key.includes('Softness') || key.includes('Range')) return `Controls transition softness for ${label}.`;
  if (key.includes('MidPoint')) return `Moves the center point for ${label}.`;
  if (key.includes('Tint') || key.includes('Color')) return `Sets the color used by ${label}.`;
  if (key.includes('Power')) return `Controls the sharpness of ${label}.`;
  if (key.includes('Mode') || key.endsWith('Preset')) return `Selects the policy used by ${label}.`;
  if (key.includes('Width')) return `Controls the width used by ${label}.`;
  if (key.includes('Order')) return `Controls transparent draw order for ${label}.`;
  return `Configures ${label} for ${group.label.toLowerCase()}.`;
}

// Explicit ranges for fields whose names don't fit the inference patterns in
// rangeForNumberField. Keyed by field id ('group.key'). Add an entry here
// whenever a new numeric setting would otherwise get a nonsense slider —
// name-pattern inference is a fallback, not a contract.
const FIELD_RANGE_OVERRIDES = Object.freeze({
  'outline.referenceDistance': { max: 20, min: 0.5, step: 0.1 },
  'outline.referenceFov': { max: 120, min: 10, step: 1 },
  'outline.widthFadeDistance': { max: 100, min: 1, step: 0.5 },
  'rimLight.depthFadeStartDistance': { max: 100, min: 1, step: 0.5 },
});

function rangeForNumberField(key, value, id = '') {
  if (FIELD_RANGE_OVERRIDES[id]) return FIELD_RANGE_OVERRIDES[id];
  if (key.includes('Order')) return { max: 30, min: -30, step: 1 };
  if (key.includes('Power')) return { max: 128, min: 1, step: 1 };
  if (key.includes('Offset') && !key.includes('Depth')) return { max: 1, min: -1, step: 0.005 };
  if (key.includes('HueOffset')) return { max: 0.25, min: -0.25, step: 0.001 };
  if (key.includes('MaxDirectLight')) return { max: 8, min: 0, step: 0.05 };
  if (key.includes('Width') || key.includes('Thickness')) return { max: 0.08, min: 0, step: 0.0005 };
  if (key.includes('Brightness') || key.includes('ValueMul')) return { max: 2, min: 0, step: 0.01 };
  if (key.includes('Saturation')) return { max: 2, min: 0, step: 0.01 };
  if (key.includes('Intensity') || key.includes('Strength')) return { max: 8, min: 0, step: 0.01 };
  if (key.includes('Softness') || key.includes('Range')) return { max: 1, min: 0, step: 0.001 };
  if (key.includes('MidPoint')) return { max: 1, min: -1, step: 0.005 };
  if (key.includes('MinLight') || key.includes('MinimumIndirectLight') || key.includes('Floor')) return { max: 1, min: 0, step: 0.01 };
  if (key.includes('Cutoff') || key.includes('Threshold') || key.includes('Opacity')) return { max: 1, min: 0, step: 0.01 };
  if (key.includes('Scale') || key.includes('Repeat')) return { max: 4, min: 0, step: 0.01 };
  if (value >= 0 && value <= 1) return { max: 1, min: 0, step: 0.01 };
  return { max: Math.max(2, value * 2), min: Math.min(0, value * 0.5), step: 0.01 };
}

function isColorField(key, value) {
  if (!Array.isArray(value) || value.length !== 3) return false;
  return /(color|tint|ambient|emissive)/i.test(key);
}

function fieldTypeFor(groupId, key, value) {
  const fieldId = `${groupId}.${key}`;
  if (FIELD_TYPE_OVERRIDES[fieldId]) return FIELD_TYPE_OVERRIDES[fieldId];
  if (SELECT_FIELD_OPTIONS[fieldId]) return 'select';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (isColorField(key, value)) return 'color';
  if (Array.isArray(value) && value.length === 2) return 'vector2';
  if (Array.isArray(value) && value.length === 3) return 'vector3';
  if (Array.isArray(value) && value.length === 4) return 'vector4';
  if (typeof value === 'string') return 'text';
  if (value === null && /map|texture/i.test(key)) return 'texture';
  return 'object';
}

function createFieldMetadata(group, key, value) {
  const id = `${group.id}.${key}`;
  const type = fieldTypeFor(group.id, key, value);
  const options = SELECT_FIELD_OPTIONS[id] ?? null;
  const optionLabels = SELECT_FIELD_OPTION_LABELS[id] ?? null;
  const serializable = !NON_SERIALIZABLE_FIELDS.has(id) && type !== 'texture' && type !== 'object';
  return Object.freeze({
    defaultValue: cloneSerializableValue(value),
    description: descriptionForField(group, key),
    group: group.id,
    id,
    key,
    label: labelFromFieldName(key),
    optionLabels,
    options,
    range: type === 'number' ? rangeForNumberField(key, value, id) : null,
    serializable,
    type,
  });
}

export const TOON_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    TOON_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(TOON_SETTING_DEFAULTS[group.id] ?? {})
            .map(([key, value]) => [key, createFieldMetadata(group, key, value)]),
        ),
      ),
    ]),
  ),
);

const BUILT_IN_TOON_PRESETS = Object.freeze({
  [TOON_PRESET_IDS.default]: Object.freeze({
    description: 'Current stable library baseline. This intentionally mirrors the demo shader behavior today.',
    label: 'Default',
    settings: DEFAULT_TOON_PRESET_SETTINGS,
  }),
  [TOON_PRESET_IDS.callMeSensei]: Object.freeze({
    description: 'Team-maintained house style preset. It starts identical to Default and can evolve separately.',
    label: 'Call Me Sensei',
    settings: { ...DEFAULT_TOON_PRESET_SETTINGS },
  }),
  [TOON_PRESET_IDS.showcase]: Object.freeze({
    description: 'Every optional feature turned on with demo values — a one-click way to see the full feature set. Not a production look.',
    label: 'Showcase (All Features)',
    settings: Object.freeze({
      // Default-on features stay at their defaults (depth rim, contact shadow,
      // self shadow, head-space face, edge AA, measured average shadow);
      // this preset flips on everything that is opt-in.
      // Fur must read as strands, not per-pixel speckle: at full-body framing
      // that means longer shells and coarser tufts. It still covers the whole
      // 'costume' role (dress AND tights) because role-level opt-in is the
      // only model-agnostic hook — production use should target specific
      // materials via fur.materials patterns or userData.toonFur instead.
      fur: {
        density: 1.2,
        enabled: true,
        length: 0.03,
        roles: ['costume'],
        rootOffset: -0.35,
        shellCount: 12,
      },
      glitter: {
        density: 0.5,
        enabled: true,
        intensity: 0.7,
        size: 1.4,
      },
      perspectiveRemoval: {
        amount: 0.5,
        enabled: true,
      },
      specular: {
        directionMode: 'view',
      },
    }),
  }),
});

const TOON_PRESET_ALIASES = Object.freeze({
  '': TOON_PRESET_IDS.default,
  baseline: TOON_PRESET_IDS.default,
  current: TOON_PRESET_IDS.default,
  default: TOON_PRESET_IDS.default,
  demo: TOON_PRESET_IDS.default,
  reference: TOON_PRESET_IDS.default,
  callmesensei: TOON_PRESET_IDS.callMeSensei,
  call_me_sensei: TOON_PRESET_IDS.callMeSensei,
  cms: TOON_PRESET_IDS.callMeSensei,
  sensei: TOON_PRESET_IDS.callMeSensei,
  all: TOON_PRESET_IDS.showcase,
  allfeatures: TOON_PRESET_IDS.showcase,
  everything: TOON_PRESET_IDS.showcase,
  showcase: TOON_PRESET_IDS.showcase,
});

const toonPresetRegistry = new Map(Object.entries(BUILT_IN_TOON_PRESETS));

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneSerializableValue(value) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (value?.isVector2) return [value.x, value.y];
  if (value?.isVector3) return [value.x, value.y, value.z];
  if (value?.isVector4) return [value.x, value.y, value.z, value.w];
  if (Array.isArray(value)) return value.map((entry) => cloneSerializableValue(entry));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => typeof entry !== 'function')
        .map(([key, entry]) => [key, cloneSerializableValue(entry)]),
    );
  }
  return value;
}

function normalizePresetKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function normalizeAliasKey(value) {
  return normalizePresetKey(value).replace(/_/g, '');
}

export function normalizeToonPresetName(value) {
  const normalized = normalizePresetKey(value);
  const alias = TOON_PRESET_ALIASES[normalized] ?? TOON_PRESET_ALIASES[normalizeAliasKey(value)];
  if (alias && toonPresetRegistry.has(alias)) return alias;
  if (toonPresetRegistry.has(normalized)) return normalized;
  return TOON_PRESET_IDS.default;
}

export function getToonPresetIds() {
  return Array.from(toonPresetRegistry.keys());
}

export function getToonPresetMetadata(id = TOON_PRESET_IDS.default) {
  const presetId = normalizeToonPresetName(id);
  const preset = toonPresetRegistry.get(presetId) ?? BUILT_IN_TOON_PRESETS[TOON_PRESET_IDS.default];
  return {
    description: preset.description ?? '',
    id: presetId,
    label: preset.label ?? presetId,
  };
}

export function getToonPresetOptions() {
  return getToonPresetIds().map((id) => getToonPresetMetadata(id));
}

export function getToonSettingGroupMetadata(id) {
  return id ? TOON_SETTING_GROUP_METADATA[id] ?? null : TOON_SETTING_GROUPS;
}

export function getToonSettingFieldSchema(groupId = null) {
  return groupId ? TOON_SETTING_FIELD_SCHEMA[groupId] ?? {} : TOON_SETTING_FIELD_SCHEMA;
}

function mergeGroupSettings(presetSettings, source) {
  const merged = {};
  for (const group of TOON_SETTING_GROUPS) {
    const presetValue = presetSettings[group.id];
    const sourceValue = source[group.id];
    if (presetValue === undefined && sourceValue === undefined) continue;
    merged[group.id] = sourceValue === undefined ? presetValue : sourceValue;
  }
  return merged;
}

function sourceGroupKeys(source) {
  return Object.keys(cleanObject(source)).filter((key) => key in TOON_SETTING_GROUP_METADATA);
}

function numberFromValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanFromValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  if (Number.isFinite(value)) return value !== 0;
  return fallback;
}

function colorFromValue(value, fallback) {
  const source = cloneSerializableValue(value);
  if (typeof source === 'string') {
    const hex = source.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
      ];
    }
  }
  if (Array.isArray(source) && source.length >= 3) {
    return [
      numberFromValue(source[0], fallback[0] ?? 1),
      numberFromValue(source[1], fallback[1] ?? 1),
      numberFromValue(source[2], fallback[2] ?? 1),
    ];
  }
  if (isPlainObject(source)) {
    return [
      numberFromValue(source.r ?? source.x, fallback[0] ?? 1),
      numberFromValue(source.g ?? source.y, fallback[1] ?? 1),
      numberFromValue(source.b ?? source.z, fallback[2] ?? 1),
    ];
  }
  return cloneSerializableValue(fallback);
}

function vectorFromValue(value, fallback, size) {
  const source = cloneSerializableValue(value);
  const keys = ['x', 'y', 'z', 'w'];
  return Array.from({ length: size }, (_, index) => {
    if (Array.isArray(source)) return numberFromValue(source[index], fallback[index] ?? 0);
    if (isPlainObject(source)) return numberFromValue(source[keys[index]], fallback[index] ?? 0);
    return fallback[index] ?? 0;
  });
}

function selectFromValue(value, fallback, options) {
  if (!options?.length) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  const match = options.find((option) => String(option).toLowerCase() === normalized);
  if (match !== undefined) return match;
  return fallback;
}

function coerceFieldValue(value, field) {
  const fallback = field.defaultValue;
  switch (field.type) {
    case 'boolean':
      return booleanFromValue(value, fallback);
    case 'number':
      return numberFromValue(value, fallback);
    case 'select':
      return selectFromValue(value, fallback, field.options);
    case 'color':
      return colorFromValue(value, fallback);
    case 'vector2':
      return vectorFromValue(value, fallback, 2);
    case 'vector3':
      return vectorFromValue(value, fallback, 3);
    case 'vector4':
      return vectorFromValue(value, fallback, 4);
    case 'text':
      return String(value ?? fallback);
    default:
      return cloneSerializableValue(value);
  }
}

export function sanitizeToonPresetSettings(settings = {}) {
  const source = cleanObject(settings);
  const sanitized = {};

  for (const group of TOON_SETTING_GROUPS) {
    const groupSource = cleanObject(source[group.id]);
    if (Object.keys(groupSource).length === 0) continue;

    const fields = TOON_SETTING_FIELD_SCHEMA[group.id] ?? {};
    const groupSettings = {};
    for (const [key, value] of Object.entries(groupSource)) {
      const field = fields[key];
      if (!field?.serializable) continue;
      groupSettings[key] = coerceFieldValue(value, field);
    }

    if (Object.keys(groupSettings).length > 0) sanitized[group.id] = groupSettings;
  }

  return sanitized;
}

function collectUnknownSettingKeys(settings = {}) {
  const source = cleanObject(settings);
  const warnings = [];
  for (const [groupId, groupValue] of Object.entries(source)) {
    if (!(groupId in TOON_SETTING_GROUP_METADATA)) {
      warnings.push(`Unknown settings group "${groupId}" was ignored.`);
      continue;
    }
    const fields = TOON_SETTING_FIELD_SCHEMA[groupId] ?? {};
    for (const key of Object.keys(cleanObject(groupValue))) {
      if (!fields[key]) warnings.push(`Unknown setting "${groupId}.${key}" was ignored.`);
      else if (!fields[key].serializable) warnings.push(`Setting "${groupId}.${key}" is runtime-only and was ignored.`);
    }
  }
  return warnings;
}

function migrateToonPresetDocument(input) {
  const source = cleanObject(input);
  const version = Number.isFinite(source.version) ? Math.round(source.version) : 0;
  const groupKeys = sourceGroupKeys(source);
  const settings = cleanObject(source.settings);

  if (version <= 1) {
    return {
      description: source.description ?? '',
      id: source.id ?? source.name ?? source.preset ?? '',
      label: source.label ?? source.title ?? source.name ?? source.id ?? '',
      settings: Object.keys(settings).length > 0
        ? settings
        : Object.fromEntries(groupKeys.map((key) => [key, source[key]])),
      type: source.type ?? TOON_PRESET_DOCUMENT_TYPE,
      version: TOON_PRESET_SCHEMA_VERSION,
    };
  }

  return source;
}

export function validateToonPresetDocument(input) {
  return validateSettingsPresetDocument(input, {
    collectWarnings: collectUnknownSettingKeys,
    documentType: TOON_PRESET_DOCUMENT_TYPE,
    migrateDocument: migrateToonPresetDocument,
    normalizeId: normalizePresetKey,
    sanitizeSettings: sanitizeToonPresetSettings,
    schemaVersion: TOON_PRESET_SCHEMA_VERSION,
  });
}

export function parseToonPresetDocument(input) {
  return parsePresetDocument(input, validateToonPresetDocument);
}

export function createToonPresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => source.settings
      ?? Object.fromEntries(sourceGroupKeys(source).map((key) => [key, source[key]])),
    documentType: TOON_PRESET_DOCUMENT_TYPE,
    schemaVersion: TOON_PRESET_SCHEMA_VERSION,
    validateDocument: validateToonPresetDocument,
  });
}

export function serializeToonPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createToonPresetDocument,
    pretty,
  });
}

export function getToonPresetDefinition(id = TOON_PRESET_IDS.default) {
  const presetId = normalizeToonPresetName(id);
  const preset = toonPresetRegistry.get(presetId) ?? BUILT_IN_TOON_PRESETS[TOON_PRESET_IDS.default];
  return createToonPresetDocument(presetId, preset);
}

export function registerToonPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createToonPresetDocument(id, definition);
  const presetId = document.id;
  if (!presetId) throw new Error('A toon preset id is required.');
  if (overwrite && isProtectedSystemStyleId(presetId) && toonPresetRegistry.has(presetId)) {
    throw new Error(`System style "${presetId}" is read-only.`);
  }
  if (!overwrite && toonPresetRegistry.has(presetId)) {
    throw new Error(`Toon preset "${presetId}" already exists.`);
  }

  toonPresetRegistry.set(presetId, {
    description: document.description,
    label: document.label,
    settings: mergeGroupSettings(document.settings, {}),
    version: document.version,
  });
  return getToonPresetMetadata(presetId);
}

export function registerSerializedToonPreset(input, options = {}) {
  const result = parseToonPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerToonPreset(result.value.id, result.value, { overwrite: options.overwrite ?? true });
}

export function createToonSettings(options = {}) {
  const source = typeof options === 'string' ? { preset: options } : cleanObject(options);
  const presetId = normalizeToonPresetName(source.preset ?? source.profile ?? source.style);
  const preset = toonPresetRegistry.get(presetId) ?? BUILT_IN_TOON_PRESETS[TOON_PRESET_IDS.default];
  const groupInput = mergeGroupSettings(cleanObject(preset.settings), source);

  return {
    alpha: createAlphaSettings(groupInput.alpha),
    averageShadow: createAverageShadowSettings(groupInput.averageShadow),
    baseTexture: createBaseTextureSettings(groupInput.baseTexture),
    celShade: createCelShadeSettings(groupInput.celShade),
    contactShadow: createContactShadowSettings(groupInput.contactShadow),
    eyeHighlight: createEyeHighlightSettings(groupInput.eyeHighlight),
    faceLighting: createFaceLightingSettings(groupInput.faceLighting),
    fur: createFurSettings(groupInput.fur),
    glitter: createGlitterSettings(groupInput.glitter),
    hairHighlight: createHairHighlightSettings(groupInput.hairHighlight),
    perspectiveRemoval: createPerspectiveRemovalSettings(groupInput.perspectiveRemoval),
    sticker: createStickerSettings(groupInput.sticker),
    indirectLight: createIndirectLightSettings(groupInput.indirectLight),
    localLights: createLocalLightSettings(groupInput.localLights),
    materialMaps: createMaterialMapSettings(groupInput.materialMaps),
    materialRoles: groupInput.materialRoles ?? null,
    outline: createOutlineSettings(groupInput.outline),
    preset: presetId,
    presetDescription: preset.description ?? '',
    presetLabel: preset.label ?? presetId,
    rimLight: createRimLightSettings(groupInput.rimLight),
    sceneShadow: createSceneShadowSettings(groupInput.sceneShadow),
    selfShadow: createSelfShadowSettings(groupInput.selfShadow),
    shadowColor: createShadowColorSettings(groupInput.shadowColor),
    skinTone: createSkinToneSettings(groupInput.skinTone),
    specular: createSpecularSettings(groupInput.specular),
  };
}
