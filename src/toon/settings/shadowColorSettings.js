import * as THREE from 'three';

export const DEFAULT_SHADOW_COLOR_SETTINGS = Object.freeze({
  enabled: true,
  lowSaturationFallbackColor: [0.3764706, 0.4141177, 0.5019608, 0],
  selfShadowAlbedoMulStrength: 0,
  selfShadowAreaHSVStrength: 1,
  selfShadowAreaHueOffset: 0,
  selfShadowAreaSaturationBoost: 0.2,
  selfShadowAreaValueMul: 0.68,
  selfShadowTintColor: [1, 1, 1],
  transitionAreaHueOffset: 0.01,
  transitionAreaIntensity: 1,
  transitionAreaSaturationBoost: 0.36,
  transitionAreaTintColor: [1, 1, 1],
  transitionAreaValueMul: 1,
});

export const REFERENCE_SHADOW_COLOR_SETTINGS = Object.freeze({
  ...DEFAULT_SHADOW_COLOR_SETTINGS,
  selfShadowAreaValueMul: 0.7,
  transitionAreaSaturationBoost: 0.5,
});

export const SHADOW_COLOR_PRESETS = Object.freeze({
  baseline: DEFAULT_SHADOW_COLOR_SETTINGS,
  reference: REFERENCE_SHADOW_COLOR_SETTINGS,
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
    return new THREE.Color(
      numberOption(value.r, fallback[0] ?? fallback.r ?? 1),
      numberOption(value.g, fallback[1] ?? fallback.g ?? 1),
      numberOption(value.b, fallback[2] ?? fallback.b ?? 1),
    );
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

function vector4Option(value, fallback) {
  if (value?.isVector4) return value.clone();

  if (Array.isArray(value) && value.length >= 4) {
    return new THREE.Vector4(
      numberOption(value[0], fallback[0] ?? fallback.x ?? 0),
      numberOption(value[1], fallback[1] ?? fallback.y ?? 0),
      numberOption(value[2], fallback[2] ?? fallback.z ?? 0),
      numberOption(value[3], fallback[3] ?? fallback.w ?? 0),
    );
  }

  if (typeof value === 'object' && value !== null) {
    return new THREE.Vector4(
      numberOption(value.x ?? value.r, fallback[0] ?? fallback.x ?? 0),
      numberOption(value.y ?? value.g, fallback[1] ?? fallback.y ?? 0),
      numberOption(value.z ?? value.b, fallback[2] ?? fallback.z ?? 0),
      numberOption(value.w ?? value.a, fallback[3] ?? fallback.w ?? 0),
    );
  }

  return Array.isArray(fallback)
    ? new THREE.Vector4(fallback[0], fallback[1], fallback[2], fallback[3])
    : fallback.clone();
}

function resolvePresetDefaults(source) {
  const presetName = String(firstDefined(source, ['preset', 'profile']) || 'baseline').toLowerCase();
  return SHADOW_COLOR_PRESETS[presetName] || DEFAULT_SHADOW_COLOR_SETTINGS;
}

export function createShadowColorSettings(options = null) {
  const source = typeof options === 'string' ? { preset: options } : options || {};
  const presetDefaults = resolvePresetDefaults(source);
  const enabled = source.enabled !== false;

  return {
    enabled,
    lowSaturationFallbackColor: vector4Option(
      firstDefined(source, [
        'lowSaturationFallbackColor',
        'lowSaturationFallback',
        'fallbackColor',
      ]),
      presetDefaults.lowSaturationFallbackColor,
    ),
    selfShadowAlbedoMulStrength: enabled
      ? numberOption(
        firstDefined(source, [
          'selfShadowAlbedoMulStrength',
          'shadowAlbedoMulStrength',
          'albedoMulStrength',
        ]),
        presetDefaults.selfShadowAlbedoMulStrength,
        { min: 0, max: 1 },
      )
      : presetDefaults.selfShadowAlbedoMulStrength,
    selfShadowAreaHSVStrength: enabled
      ? numberOption(
        firstDefined(source, [
          'selfShadowAreaHSVStrength',
          'shadowHSVStrength',
          'hsvStrength',
        ]),
        presetDefaults.selfShadowAreaHSVStrength,
        { min: 0, max: 1 },
      )
      : 0,
    selfShadowAreaHueOffset: enabled
      ? numberOption(
        firstDefined(source, [
          'selfShadowAreaHueOffset',
          'shadowHueOffset',
          'hueOffset',
        ]),
        presetDefaults.selfShadowAreaHueOffset,
        { min: -1, max: 1 },
      )
      : presetDefaults.selfShadowAreaHueOffset,
    selfShadowAreaSaturationBoost: enabled
      ? numberOption(
        firstDefined(source, [
          'selfShadowAreaSaturationBoost',
          'shadowSaturationBoost',
          'saturationBoost',
        ]),
        presetDefaults.selfShadowAreaSaturationBoost,
        { min: 0, max: 1 },
      )
      : 0,
    selfShadowAreaValueMul: enabled
      ? numberOption(
        firstDefined(source, [
          'selfShadowAreaValueMul',
          'shadowValueMul',
          'valueMul',
        ]),
        presetDefaults.selfShadowAreaValueMul,
        { min: 0, max: 1 },
      )
      : 1,
    selfShadowTintColor: colorOption(
      firstDefined(source, [
        'selfShadowTintColor',
        'shadowTintColor',
        'shadowTint',
      ]),
      presetDefaults.selfShadowTintColor,
    ),
    transitionAreaHueOffset: enabled
      ? numberOption(
        firstDefined(source, [
          'transitionAreaHueOffset',
          'litToShadowTransitionAreaHueOffset',
          'transitionHueOffset',
        ]),
        presetDefaults.transitionAreaHueOffset,
        { min: -1, max: 1 },
      )
      : presetDefaults.transitionAreaHueOffset,
    transitionAreaIntensity: enabled
      ? numberOption(
        firstDefined(source, [
          'transitionAreaIntensity',
          'litToShadowTransitionAreaIntensity',
          'transitionIntensity',
        ]),
        presetDefaults.transitionAreaIntensity,
        { min: 0, max: 32 },
      )
      : 0,
    transitionAreaSaturationBoost: enabled
      ? numberOption(
        firstDefined(source, [
          'transitionAreaSaturationBoost',
          'litToShadowTransitionAreaSaturationBoost',
          'transitionSaturationBoost',
        ]),
        presetDefaults.transitionAreaSaturationBoost,
        { min: 0, max: 1 },
      )
      : 0,
    transitionAreaTintColor: colorOption(
      firstDefined(source, [
        'transitionAreaTintColor',
        'litToShadowTransitionAreaTintColor',
        'transitionTintColor',
        'transitionTint',
      ]),
      presetDefaults.transitionAreaTintColor,
    ),
    transitionAreaValueMul: enabled
      ? numberOption(
        firstDefined(source, [
          'transitionAreaValueMul',
          'litToShadowTransitionAreaValueMul',
          'transitionValueMul',
        ]),
        presetDefaults.transitionAreaValueMul,
        { min: 0, max: 1 },
      )
      : 1,
  };
}
