import * as THREE from 'three';

export const DEFAULT_EYE_HIGHLIGHT_SETTINGS = Object.freeze({
  color: [1, 1, 1],
  enabled: true,
  intensity: 0.58,
  maskChannel: 0,
  maskMap: null,
  maskStrength: 1,
  power: 22,
  showInShadowArea: 0.4,
  sourceMaskMode: 'off',
});

export const EYE_HIGHLIGHT_MASK_CHANNELS = Object.freeze({
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

export const EYE_HIGHLIGHT_SOURCE_MASK_MODES = Object.freeze({
  off: 'off',
  source: 'source',
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

function colorOption(value, fallback = DEFAULT_EYE_HIGHLIGHT_SETTINGS.color) {
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

function normalizeEyeHighlightOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function normalizeMaskChannel(value, fallback = DEFAULT_EYE_HIGHLIGHT_SETTINGS.maskChannel) {
  if (Number.isFinite(value)) return Math.min(3, Math.max(0, Math.round(value)));
  const normalized = String(value ?? '').trim().toLowerCase();
  return EYE_HIGHLIGHT_MASK_CHANNELS[normalized] ?? fallback;
}

function normalizeSourceMaskMode(value, fallback = DEFAULT_EYE_HIGHLIGHT_SETTINGS.sourceMaskMode) {
  if (value === true) return EYE_HIGHLIGHT_SOURCE_MASK_MODES.source;
  if (value === false) return EYE_HIGHLIGHT_SOURCE_MASK_MODES.off;
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === 'material' || normalized === 'map' || normalized === 'source') {
    return EYE_HIGHLIGHT_SOURCE_MASK_MODES.source;
  }
  return EYE_HIGHLIGHT_SOURCE_MASK_MODES.off;
}

export function createEyeHighlightSettings(options = null) {
  const source = normalizeEyeHighlightOptions(options);
  const enabled = enabledOption(source.enabled);

  return {
    color: colorOption(
      firstDefined(source, ['color', 'eyeHighlightColor', 'highlightColor', 'glossColor']),
      DEFAULT_EYE_HIGHLIGHT_SETTINGS.color,
    ),
    enabled,
    intensity: enabled
      ? numberOption(
        firstDefined(source, ['intensity', 'eyeHighlightIntensity', 'highlightIntensity', 'glossIntensity']),
        DEFAULT_EYE_HIGHLIGHT_SETTINGS.intensity,
        { min: 0, max: 8 },
      )
      : 0,
    maskChannel: normalizeMaskChannel(firstDefined(source, ['maskChannel', 'eyeHighlightMaskChannel'])),
    maskMap: firstDefined(source, ['maskMap', 'eyeHighlightMaskMap', 'catchlightMaskMap']) ??
      DEFAULT_EYE_HIGHLIGHT_SETTINGS.maskMap,
    maskStrength: enabled
      ? numberOption(
        firstDefined(source, ['maskStrength', 'eyeHighlightMaskStrength', 'catchlightMaskStrength']),
        DEFAULT_EYE_HIGHLIGHT_SETTINGS.maskStrength,
        { min: 0, max: 1 },
      )
      : 0,
    power: enabled
      ? numberOption(
        firstDefined(source, ['power', 'eyeHighlightPower', 'highlightPower', 'glossPower', 'shininess']),
        DEFAULT_EYE_HIGHLIGHT_SETTINGS.power,
        { min: 1, max: 512 },
      )
      : DEFAULT_EYE_HIGHLIGHT_SETTINGS.power,
    showInShadowArea: enabled
      ? numberOption(
        firstDefined(source, [
          'showInShadowArea',
          'eyeHighlightShowInShadowArea',
          'shadowBlend',
          'shadowLift',
          'shadowIndependence',
        ]),
        DEFAULT_EYE_HIGHLIGHT_SETTINGS.showInShadowArea,
        { min: 0, max: 1 },
      )
      : 0,
    sourceMaskMode: normalizeSourceMaskMode(
      firstDefined(source, [
        'sourceMaskMode',
        'sourceMask',
        'useSourceMask',
        'useSourceEyeHighlightMask',
        'useSourceCatchlightMask',
      ]),
    ),
  };
}

export function resolveEyeHighlightForMaterial(settings, {
  isEye = false,
  isOutline = false,
  maskMap = null,
} = {}) {
  const resolvedMaskMap = settings.maskMap ?? maskMap;
  return {
    color: settings.color,
    enabled: settings.enabled && isEye && !isOutline && settings.intensity > 0,
    intensity: settings.intensity,
    maskChannel: settings.maskChannel,
    maskMap: resolvedMaskMap,
    maskStrength: settings.maskStrength,
    power: settings.power,
    showInShadowArea: settings.showInShadowArea,
    useMask: Boolean(resolvedMaskMap) && settings.maskStrength > 0,
  };
}
