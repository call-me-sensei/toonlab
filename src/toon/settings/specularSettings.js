import * as THREE from 'three';

export const SPECULAR_MASK_CHANNELS = Object.freeze({
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

export const SPECULAR_SOURCE_MASK_MODES = Object.freeze({
  off: 'off',
  source: 'source',
});

// 'light': classic Blinn-style highlight from the half vector (moves with the
//          light). 'view': uses the view angle instead, so the highlight stays
//          anchored to the surface as lights animate — a stable, matcap-like
//          response that suits eyes and metal trim.
export const SPECULAR_DIRECTION_MODES = Object.freeze({
  light: 'light',
  view: 'view',
});

export const SPECULAR_DIRECTION_MODE_VALUES = Object.freeze({
  [SPECULAR_DIRECTION_MODES.light]: 0,
  [SPECULAR_DIRECTION_MODES.view]: 1,
});

export const DEFAULT_SPECULAR_SETTINGS = Object.freeze({
  defaultColor: [1, 0.96, 0.9],
  defaultIntensity: 0.075,
  defaultMidPoint: 0.72,
  defaultPower: 56,
  defaultRange: 0.12,
  defaultShowInShadowArea: 0.25,
  directionMode: SPECULAR_DIRECTION_MODES.light,
  enabled: true,
  eyeIntensity: 0.62,
  eyeMidPoint: 0.35,
  eyePower: 18,
  eyeRange: 0.18,
  eyeShowInShadowArea: 1,
  faceIntensity: 0.025,
  hairIntensity: 0.18,
  hairPower: 40,
  maskChannel: SPECULAR_MASK_CHANNELS.r,
  maskMap: null,
  maskStrength: 1,
  metalIntensity: 0.075,
  skinIntensity: 0.025,
  sourceMaskMode: SPECULAR_SOURCE_MASK_MODES.off,
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

function colorOption(value, fallback) {
  if (value?.isColor) return value.clone();

  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Color(
      numberOption(value[0], fallback[0] ?? fallback.r ?? 1),
      numberOption(value[1], fallback[1] ?? fallback.g ?? 1),
      numberOption(value[2], fallback[2] ?? fallback.b ?? 1),
    );
  }

  if (typeof value === 'object' && value !== null) {
    return new THREE.Color(
      numberOption(value.r ?? value.x, fallback[0] ?? fallback.r ?? 1),
      numberOption(value.g ?? value.y, fallback[1] ?? fallback.g ?? 1),
      numberOption(value.b ?? value.z, fallback[2] ?? fallback.b ?? 1),
    );
  }

  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return new THREE.Color(value);
    } catch {
      // Fall through to fallback.
    }
  }

  return Array.isArray(fallback)
    ? new THREE.Color(fallback[0], fallback[1], fallback[2])
    : fallback.clone();
}

function enabledOption(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== 'off' && normalized !== 'none' && normalized !== 'false' && normalized !== '0';
  }
  return value !== false;
}

function normalizeSpecularOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function normalizeSourceMaskMode(value) {
  if (value === true) return SPECULAR_SOURCE_MASK_MODES.source;
  if (value === false) return SPECULAR_SOURCE_MASK_MODES.off;
  const normalized = String(value ?? SPECULAR_SOURCE_MASK_MODES.off).trim().toLowerCase();
  if (normalized === 'material' || normalized === 'map' || normalized === 'source') {
    return SPECULAR_SOURCE_MASK_MODES.source;
  }
  return SPECULAR_SOURCE_MASK_MODES.off;
}

function normalizeMaskChannel(value) {
  if (Number.isFinite(value)) return Math.min(3, Math.max(0, Math.round(value)));
  const normalized = String(value ?? '').trim().toLowerCase();
  return SPECULAR_MASK_CHANNELS[normalized] ?? DEFAULT_SPECULAR_SETTINGS.maskChannel;
}

function roleNumber(source, role, property, fallback, aliases = [], bounds = {}) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return numberOption(firstDefined(source, [rolePrefix, ...aliases]), fallback, bounds);
}

function normalizeDirectionMode(value) {
  const key = String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
  if (['view', 'nov', 'stable', 'matcaplike', 'lv', 'lequalsv'].includes(key)) {
    return SPECULAR_DIRECTION_MODES.view;
  }
  return SPECULAR_DIRECTION_MODES.light;
}

export function createSpecularSettings(options = null) {
  const source = normalizeSpecularOptions(options);
  const enabled = enabledOption(source.enabled);
  const defaultIntensity = enabled
    ? roleNumber(
      source,
      'default',
      'intensity',
      DEFAULT_SPECULAR_SETTINGS.defaultIntensity,
      ['intensity', 'specularIntensity'],
      { min: 0, max: 8 },
    )
    : 0;
  const defaultMidPoint = enabled
    ? roleNumber(
      source,
      'default',
      'midPoint',
      DEFAULT_SPECULAR_SETTINGS.defaultMidPoint,
      ['midPoint', 'specularMidPoint', 'specularAreaRemapMidPoint'],
      { min: 0, max: 1 },
    )
    : DEFAULT_SPECULAR_SETTINGS.defaultMidPoint;
  const defaultRange = enabled
    ? roleNumber(
      source,
      'default',
      'range',
      DEFAULT_SPECULAR_SETTINGS.defaultRange,
      ['range', 'specularRange', 'specularAreaRemapRange'],
      { min: 0.001, max: 1 },
    )
    : DEFAULT_SPECULAR_SETTINGS.defaultRange;
  const defaultPower = enabled
    ? roleNumber(
      source,
      'default',
      'power',
      DEFAULT_SPECULAR_SETTINGS.defaultPower,
      ['power', 'specularPower', 'shininess'],
      { min: 1, max: 512 },
    )
    : DEFAULT_SPECULAR_SETTINGS.defaultPower;
  const defaultShowInShadowArea = enabled
    ? roleNumber(
      source,
      'default',
      'showInShadowArea',
      DEFAULT_SPECULAR_SETTINGS.defaultShowInShadowArea,
      ['showInShadowArea', 'specularShowInShadowArea', 'shadowVisibility'],
      { min: 0, max: 1 },
    )
    : 0;

  return {
    defaultColor: colorOption(
      firstDefined(source, ['color', 'specularColor', 'defaultColor']),
      DEFAULT_SPECULAR_SETTINGS.defaultColor,
    ),
    defaultIntensity,
    defaultMidPoint,
    defaultPower,
    defaultRange,
    defaultShowInShadowArea,
    directionMode: normalizeDirectionMode(
      firstDefined(source, ['directionMode', 'specularMode', 'highlightMode']),
    ),
    enabled,
    eyeIntensity: enabled
      ? roleNumber(source, 'eye', 'intensity', DEFAULT_SPECULAR_SETTINGS.eyeIntensity, [], { min: 0, max: 8 })
      : 0,
    eyeMidPoint: enabled
      ? roleNumber(source, 'eye', 'midPoint', DEFAULT_SPECULAR_SETTINGS.eyeMidPoint, [], { min: 0, max: 1 })
      : DEFAULT_SPECULAR_SETTINGS.eyeMidPoint,
    eyePower: enabled
      ? roleNumber(source, 'eye', 'power', DEFAULT_SPECULAR_SETTINGS.eyePower, [], { min: 1, max: 512 })
      : DEFAULT_SPECULAR_SETTINGS.eyePower,
    eyeRange: enabled
      ? roleNumber(source, 'eye', 'range', DEFAULT_SPECULAR_SETTINGS.eyeRange, [], { min: 0.001, max: 1 })
      : DEFAULT_SPECULAR_SETTINGS.eyeRange,
    eyeShowInShadowArea: enabled
      ? roleNumber(source, 'eye', 'showInShadowArea', DEFAULT_SPECULAR_SETTINGS.eyeShowInShadowArea, [], { min: 0, max: 1 })
      : 0,
    faceIntensity: enabled
      ? roleNumber(source, 'face', 'intensity', DEFAULT_SPECULAR_SETTINGS.faceIntensity, [], { min: 0, max: 8 })
      : 0,
    hairIntensity: enabled
      ? roleNumber(source, 'hair', 'intensity', DEFAULT_SPECULAR_SETTINGS.hairIntensity, [], { min: 0, max: 8 })
      : 0,
    hairPower: enabled
      ? roleNumber(source, 'hair', 'power', DEFAULT_SPECULAR_SETTINGS.hairPower, [], { min: 1, max: 512 })
      : DEFAULT_SPECULAR_SETTINGS.hairPower,
    maskChannel: normalizeMaskChannel(firstDefined(source, ['maskChannel', 'specularMaskChannel'])),
    maskMap: firstDefined(source, ['maskMap', 'specularMaskMap']) ?? DEFAULT_SPECULAR_SETTINGS.maskMap,
    maskStrength: enabled
      ? numberOption(
        firstDefined(source, ['maskStrength', 'specularMaskStrength']),
        DEFAULT_SPECULAR_SETTINGS.maskStrength,
        { min: 0, max: 1 },
      )
      : 0,
    metalIntensity: enabled
      ? roleNumber(source, 'metal', 'intensity', DEFAULT_SPECULAR_SETTINGS.metalIntensity, [], { min: 0, max: 8 })
      : 0,
    skinIntensity: enabled
      ? roleNumber(source, 'skin', 'intensity', DEFAULT_SPECULAR_SETTINGS.skinIntensity, [], { min: 0, max: 8 })
      : 0,
    sourceMaskMode: normalizeSourceMaskMode(
      firstDefined(source, ['sourceMaskMode', 'sourceMask', 'useSourceMask', 'useSourceSpecularMap']),
    ),
  };
}

export function resolveSpecularForMaterial(settings, {
  isEye = false,
  isFace = false,
  isHair = false,
  isMetal = false,
  isOutline = false,
  isSkin = false,
  maskMap = null,
} = {}) {
  let intensity = settings.defaultIntensity;
  let midPoint = settings.defaultMidPoint;
  let power = settings.defaultPower;
  let range = settings.defaultRange;
  let showInShadowArea = settings.defaultShowInShadowArea;

  if (isEye) {
    intensity = settings.eyeIntensity;
    midPoint = settings.eyeMidPoint;
    power = settings.eyePower;
    range = settings.eyeRange;
    showInShadowArea = settings.eyeShowInShadowArea;
  } else if (isFace) {
    intensity = settings.faceIntensity;
  } else if (isSkin) {
    intensity = settings.skinIntensity;
  } else if (isHair) {
    intensity = settings.hairIntensity;
    power = settings.hairPower;
  } else if (isMetal) {
    intensity = settings.metalIntensity;
  }

  const resolvedMaskMap = settings.maskMap ?? maskMap;
  return {
    color: settings.defaultColor,
    directionModeValue: SPECULAR_DIRECTION_MODE_VALUES[settings.directionMode] ?? 0,
    enabled: settings.enabled && !isOutline && intensity > 0,
    intensity,
    maskChannel: settings.maskChannel,
    maskMap: resolvedMaskMap,
    maskStrength: settings.maskStrength,
    midPoint,
    power,
    range,
    showInShadowArea,
    useMask: Boolean(resolvedMaskMap) && settings.maskStrength > 0,
  };
}
