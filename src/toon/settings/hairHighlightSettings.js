export const DEFAULT_HAIR_HIGHLIGHT_SETTINGS = Object.freeze({
  direction: [0, 1, 0.15],
  enabled: true,
  intensity: 0.14,
  maskChannel: 0,
  maskMap: null,
  maskStrength: 1,
  mode: 'legacy',
  shadowFloor: 0.35,
  sideBandPower: 2,
  sourceMaskMode: 'off',
  strandPower: 7,
  uvBandAxis: 0,
  uvBandCenter: 0.5,
  uvBandHalfWidth: 0.5,
  uvPreset: 'center',
});

export const HAIR_HIGHLIGHT_MASK_CHANNELS = Object.freeze({
  r: 0,
  red: 0,
  x: 0,
  g: 1,
  green: 1,
  y: 1,
  b: 2,
  blue: 2,
  z: 2,
  a: 3,
  alpha: 3,
  w: 3,
});

export const HAIR_HIGHLIGHT_MODES = Object.freeze({
  anisotropic: 'anisotropic',
  legacy: 'legacy',
});

export const HAIR_HIGHLIGHT_MODE_VALUES = Object.freeze({
  [HAIR_HIGHLIGHT_MODES.legacy]: 0,
  [HAIR_HIGHLIGHT_MODES.anisotropic]: 1,
});

export const HAIR_HIGHLIGHT_SOURCE_MASK_MODES = Object.freeze({
  off: 'off',
  source: 'source',
});

const UV_PRESETS = Object.freeze({
  center: Object.freeze({ uvBandAxis: 0, uvBandCenter: 0.5, uvBandHalfWidth: 0.5 }),
  full: Object.freeze({ uvBandAxis: 0, uvBandCenter: 0.5, uvBandHalfWidth: 2.0 }),
  left: Object.freeze({ uvBandAxis: 0, uvBandCenter: 0.25, uvBandHalfWidth: 0.35 }),
  right: Object.freeze({ uvBandAxis: 0, uvBandCenter: 0.75, uvBandHalfWidth: 0.35 }),
  vertical: Object.freeze({ uvBandAxis: 1, uvBandCenter: 0.5, uvBandHalfWidth: 0.5 }),
  wide: Object.freeze({ uvBandAxis: 0, uvBandCenter: 0.5, uvBandHalfWidth: 0.75 }),
});

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key];
  }
  return undefined;
}

function numberOption(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.min(max, Math.max(min, nextValue));
}

function vectorOption(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      numberOption(value[0], fallback[0]),
      numberOption(value[1], fallback[1]),
      numberOption(value[2], fallback[2]),
    ];
  }

  if (typeof value === 'object' && value !== null) {
    return [
      numberOption(value.x ?? value.r, fallback[0]),
      numberOption(value.y ?? value.g, fallback[1]),
      numberOption(value.z ?? value.b, fallback[2]),
    ];
  }

  return [...fallback];
}

function enabledOption(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== 'off' && normalized !== 'none' && normalized !== 'false' && normalized !== '0';
  }
  return value !== false;
}

function normalizeHairHighlightOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function normalizeMaskChannel(value, fallback = DEFAULT_HAIR_HIGHLIGHT_SETTINGS.maskChannel) {
  if (Number.isFinite(value)) return Math.min(3, Math.max(0, Math.round(value)));
  const normalized = String(value ?? '').trim().toLowerCase();
  return HAIR_HIGHLIGHT_MASK_CHANNELS[normalized] ?? fallback;
}

function normalizeMode(value, fallback = DEFAULT_HAIR_HIGHLIGHT_SETTINGS.mode) {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (
    normalized === 'aniso' ||
    normalized === 'anisotropic' ||
    normalized === 'kajiyakay' ||
    normalized === 'kajiya-kay' ||
    normalized === 'strand' ||
    normalized === 'strand-highlight' ||
    normalized === 'strand_highlight'
  ) {
    return HAIR_HIGHLIGHT_MODES.anisotropic;
  }
  return HAIR_HIGHLIGHT_MODES.legacy;
}

function normalizeSourceMaskMode(value, fallback = DEFAULT_HAIR_HIGHLIGHT_SETTINGS.sourceMaskMode) {
  if (value === true) return HAIR_HIGHLIGHT_SOURCE_MASK_MODES.source;
  if (value === false) return HAIR_HIGHLIGHT_SOURCE_MASK_MODES.off;
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === 'material' || normalized === 'map' || normalized === 'source') {
    return HAIR_HIGHLIGHT_SOURCE_MASK_MODES.source;
  }
  return HAIR_HIGHLIGHT_SOURCE_MASK_MODES.off;
}

function normalizeUvAxis(value, fallback = DEFAULT_HAIR_HIGHLIGHT_SETTINGS.uvBandAxis) {
  if (Number.isFinite(value)) return Math.min(1, Math.max(0, Math.round(value)));
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'v' || normalized === 'y' || normalized === 'vertical') return 1;
  if (normalized === 'u' || normalized === 'x' || normalized === 'horizontal') return 0;
  return fallback;
}

function normalizeUvPreset(value, fallback = DEFAULT_HAIR_HIGHLIGHT_SETTINGS.uvPreset) {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return UV_PRESETS[normalized] ? normalized : fallback;
}

function normalizeMaterialPresets(value) {
  const source = value || {};
  return {
    byName: source.byName || {},
    byUuid: source.byUuid || {},
    patterns: Array.isArray(source.patterns) ? source.patterns : [],
  };
}

function normalizeCoreSettings(source, fallback = DEFAULT_HAIR_HIGHLIGHT_SETTINGS) {
  const enabled = source.enabled === undefined ? fallback.enabled : enabledOption(source.enabled);
  const uvPreset = normalizeUvPreset(firstDefined(source, ['uvPreset', 'preset']), fallback.uvPreset);
  const presetValues = UV_PRESETS[uvPreset] || UV_PRESETS.center;

  return {
    direction: vectorOption(
      firstDefined(source, ['direction', 'highlightDirection', 'strandDirection']),
      fallback.direction,
    ),
    enabled,
    maskChannel: normalizeMaskChannel(
      firstDefined(source, ['maskChannel', 'hairHighlightMaskChannel']),
      fallback.maskChannel,
    ),
    maskMap: firstDefined(source, ['maskMap', 'hairHighlightMaskMap']) ?? fallback.maskMap,
    maskStrength: enabled
      ? numberOption(
        firstDefined(source, ['maskStrength', 'hairHighlightMaskStrength']),
        fallback.maskStrength,
        { min: 0, max: 1 },
      )
      : 0,
    mode: normalizeMode(firstDefined(source, ['mode', 'highlightMode', 'strandMode']), fallback.mode),
    intensity: enabled
      ? numberOption(
        firstDefined(source, ['intensity', 'hairIntensity', 'hairHighlightIntensity']),
        fallback.intensity,
        { min: 0, max: 8 },
      )
      : 0,
    shadowFloor: enabled
      ? numberOption(
        firstDefined(source, ['shadowFloor', 'shadowLift', 'minimumShadowLight']),
        fallback.shadowFloor,
        { min: 0, max: 1 },
      )
      : fallback.shadowFloor,
    sideBandPower: enabled
      ? numberOption(
        firstDefined(source, ['sideBandPower', 'uvBandPower', 'bandPower']),
        fallback.sideBandPower,
        { min: 0.001, max: 128 },
      )
      : fallback.sideBandPower,
    sourceMaskMode: normalizeSourceMaskMode(
      firstDefined(source, ['sourceMaskMode', 'sourceMask', 'useSourceMask', 'useSourceHairHighlightMask']),
      fallback.sourceMaskMode,
    ),
    strandPower: enabled
      ? numberOption(
        firstDefined(source, ['strandPower', 'power', 'highlightPower']),
        fallback.strandPower,
        { min: 0.001, max: 512 },
      )
      : fallback.strandPower,
    uvBandAxis: normalizeUvAxis(
      firstDefined(source, ['uvBandAxis', 'uvAxis', 'bandAxis']),
      presetValues.uvBandAxis ?? fallback.uvBandAxis,
    ),
    uvBandCenter: enabled
      ? numberOption(
        firstDefined(source, ['uvBandCenter', 'bandCenter']),
        presetValues.uvBandCenter ?? fallback.uvBandCenter,
        { min: -2, max: 3 },
      )
      : presetValues.uvBandCenter ?? fallback.uvBandCenter,
    uvBandHalfWidth: enabled
      ? numberOption(
        firstDefined(source, ['uvBandHalfWidth', 'uvBandWidth', 'bandHalfWidth', 'bandWidth']),
        presetValues.uvBandHalfWidth ?? fallback.uvBandHalfWidth,
        { min: 0.001, max: 4 },
      )
      : presetValues.uvBandHalfWidth ?? fallback.uvBandHalfWidth,
    uvPreset,
  };
}

function optionForMaterial(settings, material) {
  if (!material) return null;
  const materialName = material.name ?? material.sourceMaterialName ?? '';
  const materialUuid = material.uuid ?? material.sourceMaterialUuid ?? '';
  const text = [
    materialName,
    materialUuid,
    material.userData?.sourceMaterialName,
    material.userData?.materialRole,
    material.userData?.materialRoleLabel,
  ].filter(Boolean).join(' ');
  const presets = settings.materialPresets;
  let option = null;

  for (const entry of presets.patterns) {
    const pattern = entry?.pattern;
    if (!pattern) continue;
    if (
      (pattern instanceof RegExp && pattern.test(text)) ||
      (typeof pattern === 'string' && text.toLowerCase().includes(pattern.toLowerCase()))
    ) {
      option = { ...option, ...entry };
    }
  }

  if (materialName && presets.byName[materialName]) option = { ...option, ...presets.byName[materialName] };
  if (materialUuid && presets.byUuid[materialUuid]) option = { ...option, ...presets.byUuid[materialUuid] };

  const userDataOption = material.userData?.toonHairHighlight ??
    material.userData?.hairHighlight ??
    material.userData?.hairHighlightSettings;
  if (userDataOption) option = { ...option, ...userDataOption };

  return option;
}

function sourceMaskMapForMaterial(material) {
  return material?.userData?.toonHairHighlightMaskMap ??
    material?.userData?.hairHighlightMaskMap ??
    material?.userData?.highlightMaskMap ??
    null;
}

export function createHairHighlightSettings(options = null) {
  const source = normalizeHairHighlightOptions(options);
  return {
    ...normalizeCoreSettings(source),
    materialPresets: normalizeMaterialPresets(
      firstDefined(source, ['materialPresets', 'perMaterial', 'overrides']),
    ),
  };
}

export function resolveHairHighlightForMaterial(settings, {
  isHair = false,
  isOutline = false,
  maskMap = null,
  material = null,
} = {}) {
  const materialOption = optionForMaterial(settings, material);
  const resolvedSettings = materialOption
    ? normalizeCoreSettings(materialOption, settings)
    : settings;
  const materialSourceMask = resolvedSettings.sourceMaskMode === HAIR_HIGHLIGHT_SOURCE_MASK_MODES.source
    ? sourceMaskMapForMaterial(material)
    : null;
  const resolvedMaskMap = resolvedSettings.maskMap ?? maskMap ?? materialSourceMask;

  return {
    direction: resolvedSettings.direction,
    enabled: resolvedSettings.enabled && isHair && !isOutline && resolvedSettings.intensity > 0,
    intensity: resolvedSettings.intensity,
    maskChannel: resolvedSettings.maskChannel,
    maskMap: resolvedMaskMap,
    maskStrength: resolvedSettings.maskStrength,
    mode: resolvedSettings.mode,
    modeValue: HAIR_HIGHLIGHT_MODE_VALUES[resolvedSettings.mode] ?? HAIR_HIGHLIGHT_MODE_VALUES.legacy,
    shadowFloor: resolvedSettings.shadowFloor,
    sideBandPower: resolvedSettings.sideBandPower,
    sourceMaskMode: resolvedSettings.sourceMaskMode,
    strandPower: resolvedSettings.strandPower,
    useMask: Boolean(resolvedMaskMap) && resolvedSettings.maskStrength > 0,
    uvBandAxis: resolvedSettings.uvBandAxis,
    uvBandCenter: resolvedSettings.uvBandCenter,
    uvBandHalfWidth: resolvedSettings.uvBandHalfWidth,
    uvPreset: resolvedSettings.uvPreset,
  };
}
