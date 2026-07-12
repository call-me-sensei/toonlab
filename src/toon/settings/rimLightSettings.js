import * as THREE from 'three';

export const RIM_LIGHT_MODES = Object.freeze({
  fresnel: 'fresnel',
  depthTexture: 'depthTexture',
});

export const RIM_LIGHT_MODE_VALUES = Object.freeze({
  [RIM_LIGHT_MODES.fresnel]: 0,
  [RIM_LIGHT_MODES.depthTexture]: 1,
});

export const DEFAULT_RIM_LIGHT_SETTINGS = Object.freeze({
  blockByShadow: 0.65,
  defaultIntensity: 0.13,
  defaultTintColor: [0.82, 0.9, 1.0],
  // Screen-space depth-sampled edge width, relative to the character.
  // Only used in depthTexture mode; falls back to fresnel when no depth
  // prepass is running, so the mode is safe as a default.
  depthCloseWidthReduce: 1,
  depthDottedLineFix: true,
  depthFadeEndDistance: 30,
  depthFadeRange: 1,
  depthFadeStartDistance: 20,
  depthMask3D: false,
  depthSafeDistance: 1,
  depthThresholdOffset: 0,
  depthWidth: 1,
  enabled: true,
  eyeIntensity: 0.04,
  faceIntensity: 0.13,
  hairIntensity: 0.23,
  midPoint: 0.48,
  mixWithBaseMapColor: 0.35,
  mode: RIM_LIGHT_MODES.depthTexture,
  skinIntensity: 0.13,
  softness: 0.1,
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

function normalizeRimLightOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function roleNumber(source, role, property, fallback, aliases = [], bounds = {}) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return numberOption(firstDefined(source, [rolePrefix, ...aliases]), fallback, bounds);
}

function rimModeOption(value, fallback) {
  const key = String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
  if (['depth', 'depthtexture', 'depthtex', 'screenspace', '2d'].includes(key)) {
    return RIM_LIGHT_MODES.depthTexture;
  }
  if (['fresnel', 'classic', 'nov', '3d', 'legacy'].includes(key)) {
    return RIM_LIGHT_MODES.fresnel;
  }
  return fallback;
}

export function createRimLightSettings(options = null) {
  const source = normalizeRimLightOptions(options);
  const enabled = enabledOption(source.enabled);
  const defaultIntensity = enabled
    ? roleNumber(
      source,
      'default',
      'intensity',
      DEFAULT_RIM_LIGHT_SETTINGS.defaultIntensity,
      ['intensity', 'rimIntensity'],
      { min: 0, max: 8 },
    )
    : 0;

  return {
    blockByShadow: enabled
      ? roleNumber(
        source,
        '',
        'blockByShadow',
        DEFAULT_RIM_LIGHT_SETTINGS.blockByShadow,
        ['rimBlockByShadow', 'shadowBlocking', 'shadowBlock'],
        { min: 0, max: 1 },
      )
      : 0,
    defaultIntensity,
    defaultTintColor: colorOption(
      firstDefined(source, ['tintColor', 'color', 'rimTintColor', 'defaultTintColor']),
      DEFAULT_RIM_LIGHT_SETTINGS.defaultTintColor,
    ),
    depthCloseWidthReduce: numberOption(
      firstDefined(source, ['depthCloseWidthReduce', 'closeWidthReduce']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthCloseWidthReduce,
      { min: 0, max: 1 },
    ),
    depthDottedLineFix: firstDefined(source, ['depthDottedLineFix', 'dottedLineFix']) !== false,
    depthFadeEndDistance: numberOption(
      firstDefined(source, ['depthFadeEndDistance']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthFadeEndDistance,
      { min: 0, max: 200 },
    ),
    depthFadeRange: numberOption(
      firstDefined(source, ['depthFadeRange', 'depthRimFadeRange']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthFadeRange,
      { min: 0.01, max: 20 },
    ),
    depthFadeStartDistance: numberOption(
      firstDefined(source, ['depthFadeStartDistance']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthFadeStartDistance,
      { min: 0, max: 200 },
    ),
    depthMask3D: firstDefined(source, ['depthMask3D', 'mask3D']) === true,
    depthSafeDistance: numberOption(
      firstDefined(source, ['depthSafeDistance', 'safeViewDistance']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthSafeDistance,
      { min: 0.05, max: 10 },
    ),
    depthThresholdOffset: numberOption(
      firstDefined(source, ['depthThresholdOffset', 'depthRimThresholdOffset']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthThresholdOffset,
      { min: -0.05, max: 1 },
    ),
    depthWidth: numberOption(
      firstDefined(source, ['depthWidth', 'depthRimWidth']),
      DEFAULT_RIM_LIGHT_SETTINGS.depthWidth,
      { min: 0, max: 8 },
    ),
    enabled,
    eyeIntensity: enabled
      ? roleNumber(source, 'eye', 'intensity', DEFAULT_RIM_LIGHT_SETTINGS.eyeIntensity, [], { min: 0, max: 8 })
      : 0,
    faceIntensity: enabled
      ? roleNumber(source, 'face', 'intensity', DEFAULT_RIM_LIGHT_SETTINGS.faceIntensity, [], { min: 0, max: 8 })
      : 0,
    hairIntensity: enabled
      ? roleNumber(source, 'hair', 'intensity', DEFAULT_RIM_LIGHT_SETTINGS.hairIntensity, [], { min: 0, max: 8 })
      : 0,
    midPoint: enabled
      ? roleNumber(
        source,
        '',
        'midPoint',
        DEFAULT_RIM_LIGHT_SETTINGS.midPoint,
        ['rimMidPoint', 'threshold', 'rimThreshold'],
        { min: 0, max: 1 },
      )
      : DEFAULT_RIM_LIGHT_SETTINGS.midPoint,
    mixWithBaseMapColor: enabled
      ? roleNumber(
        source,
        '',
        'mixWithBaseMapColor',
        DEFAULT_RIM_LIGHT_SETTINGS.mixWithBaseMapColor,
        ['rimMixWithBaseMapColor', 'albedoMix', 'baseColorMix'],
        { min: 0, max: 1 },
      )
      : 0,
    mode: rimModeOption(
      firstDefined(source, ['mode', 'rimMode', 'technique']),
      DEFAULT_RIM_LIGHT_SETTINGS.mode,
    ),
    skinIntensity: enabled
      ? roleNumber(source, 'skin', 'intensity', DEFAULT_RIM_LIGHT_SETTINGS.skinIntensity, [], { min: 0, max: 8 })
      : 0,
    softness: enabled
      ? roleNumber(
        source,
        '',
        'softness',
        DEFAULT_RIM_LIGHT_SETTINGS.softness,
        ['rimSoftness', 'feather', 'rimFeather'],
        { min: 0.001, max: 1 },
      )
      : DEFAULT_RIM_LIGHT_SETTINGS.softness,
  };
}

export function resolveRimLightForMaterial(settings, {
  isEye = false,
  isFace = false,
  isHair = false,
  isOutline = false,
  isSkin = false,
} = {}) {
  let intensity = settings.defaultIntensity;
  if (isEye) intensity = settings.eyeIntensity;
  else if (isFace) intensity = settings.faceIntensity;
  else if (isSkin) intensity = settings.skinIntensity;
  else if (isHair) intensity = settings.hairIntensity;

  return {
    blockByShadow: settings.blockByShadow,
    depthCloseWidthReduce: settings.depthCloseWidthReduce,
    depthDottedLineFix: settings.depthDottedLineFix,
    depthFadeEndDistance: settings.depthFadeEndDistance,
    depthFadeRange: settings.depthFadeRange,
    depthFadeStartDistance: settings.depthFadeStartDistance,
    depthMask3D: settings.depthMask3D,
    depthSafeDistance: settings.depthSafeDistance,
    depthThresholdOffset: settings.depthThresholdOffset,
    depthWidth: settings.depthWidth,
    enabled: settings.enabled && !isOutline && intensity > 0,
    intensity,
    midPoint: settings.midPoint,
    mixWithBaseMapColor: settings.mixWithBaseMapColor,
    modeValue: RIM_LIGHT_MODE_VALUES[settings.mode] ?? RIM_LIGHT_MODE_VALUES[RIM_LIGHT_MODES.depthTexture],
    softness: settings.softness,
    tintColor: settings.defaultTintColor,
  };
}
