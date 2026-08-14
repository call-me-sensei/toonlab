import * as THREE from 'three';

export const DEFAULT_SKIN_TONE_SETTINGS = Object.freeze({
  enabled: true,
  faceMaxDirectLight: 100,
  faceMinimumIndirectLight: 0.35,
  faceShadowBrightness: 1.0,
  faceShadowSaturation: 1.0,
  faceShadowTint: [1.0, 0.92, 0.9],
  faceShadowTintStrength: 1.0,
  skinMaxDirectLight: 100,
  skinMinimumIndirectLight: 0.35,
  skinShadowBrightness: 0.92,
  skinShadowSaturation: 1.0,
  skinShadowTint: [1.0, 0.76, 0.74],
  skinShadowTintStrength: 1.0,
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
  return THREE.MathUtils.clamp(nextValue, min, max);
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
    const r = numberOption(value.r, fallback[0] ?? fallback.r ?? 1);
    const g = numberOption(value.g, fallback[1] ?? fallback.g ?? 1);
    const b = numberOption(value.b, fallback[2] ?? fallback.b ?? 1);
    return new THREE.Color(r, g, b);
  }

  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return new THREE.Color(value);
    } catch {
      // Fall through to the normalized fallback below.
    }
  }

  return Array.isArray(fallback)
    ? new THREE.Color(fallback[0], fallback[1], fallback[2])
    : fallback.clone();
}

export function createSkinToneSettings(options = null) {
  const source = options || {};
  const enabled = source.enabled !== false;
  const skinShadowTintStrength = enabled
    ? numberOption(
      firstDefined(source, ['skinShadowTintStrength', 'skinShadowStrength', 'skinTintStrength']),
      DEFAULT_SKIN_TONE_SETTINGS.skinShadowTintStrength,
      { min: 0, max: 1 },
    )
    : 0;
  const faceShadowTintStrength = enabled
    ? numberOption(
      firstDefined(source, ['faceShadowTintStrength', 'faceShadowStrength', 'faceTintStrength']),
      DEFAULT_SKIN_TONE_SETTINGS.faceShadowTintStrength,
      { min: 0, max: 1 },
    )
    : 0;

  return {
    enabled,
    faceMaxDirectLight: enabled
      ? numberOption(
        firstDefined(source, ['faceMaxDirectLight', 'faceDirectLightMax', 'maxFaceDirectLight']),
        DEFAULT_SKIN_TONE_SETTINGS.faceMaxDirectLight,
        { min: 0.05, max: 100 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.faceMaxDirectLight,
    faceMinimumIndirectLight: enabled
      ? numberOption(
        firstDefined(source, ['faceMinimumIndirectLight', 'faceMinIndirectLight', 'faceIndirectLightMin']),
        DEFAULT_SKIN_TONE_SETTINGS.faceMinimumIndirectLight,
        { min: 0, max: 1 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.faceMinimumIndirectLight,
    faceShadowBrightness: enabled
      ? numberOption(
        firstDefined(source, ['faceShadowBrightness', 'faceShadowValue', 'faceShadowLightness']),
        DEFAULT_SKIN_TONE_SETTINGS.faceShadowBrightness,
        { min: 0, max: 4 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.faceShadowBrightness,
    faceShadowSaturation: enabled
      ? numberOption(
        firstDefined(source, ['faceShadowSaturation', 'faceShadowSat', 'shadowSaturation']),
        DEFAULT_SKIN_TONE_SETTINGS.faceShadowSaturation,
        { min: 0, max: 4 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.faceShadowSaturation,
    faceShadowTint: colorOption(
      firstDefined(source, ['faceShadowTint', 'faceShadowColor', 'faceTint']),
      DEFAULT_SKIN_TONE_SETTINGS.faceShadowTint,
    ),
    faceShadowTintStrength,
    skinMaxDirectLight: enabled
      ? numberOption(
        firstDefined(source, ['skinMaxDirectLight', 'skinDirectLightMax', 'maxSkinDirectLight']),
        DEFAULT_SKIN_TONE_SETTINGS.skinMaxDirectLight,
        { min: 0.05, max: 100 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.skinMaxDirectLight,
    skinMinimumIndirectLight: enabled
      ? numberOption(
        firstDefined(source, ['skinMinimumIndirectLight', 'skinMinIndirectLight', 'skinIndirectLightMin']),
        DEFAULT_SKIN_TONE_SETTINGS.skinMinimumIndirectLight,
        { min: 0, max: 1 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.skinMinimumIndirectLight,
    skinShadowBrightness: enabled
      ? numberOption(
        firstDefined(source, ['skinShadowBrightness', 'skinShadowValue', 'skinShadowLightness']),
        DEFAULT_SKIN_TONE_SETTINGS.skinShadowBrightness,
        { min: 0, max: 4 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.skinShadowBrightness,
    skinShadowSaturation: enabled
      ? numberOption(
        firstDefined(source, ['skinShadowSaturation', 'skinShadowSat', 'shadowSaturation']),
        DEFAULT_SKIN_TONE_SETTINGS.skinShadowSaturation,
        { min: 0, max: 4 },
      )
      : DEFAULT_SKIN_TONE_SETTINGS.skinShadowSaturation,
    skinShadowTint: colorOption(
      firstDefined(source, ['skinShadowTint', 'skinShadowColor', 'skinTint']),
      DEFAULT_SKIN_TONE_SETTINGS.skinShadowTint,
    ),
    skinShadowTintStrength,
  };
}
