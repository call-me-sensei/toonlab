export const DEFAULT_AVERAGE_SHADOW_SETTINGS = Object.freeze({
  defaultMinLight: 0.28,
  defaultStrength: 0.28,
  enabled: false,
  // Blends the per-pixel scene shadow toward a single measured per-character
  // average (sampled around the character's bounding sphere by the runtime
  // pass). Stops shadow boundaries from slicing a character in half when they
  // stand at a shadow edge. Requires characterRenderPasses; inert otherwise.
  measuredBlend: 0.65,
  eyeMinLight: 1,
  eyeStrength: 0,
  faceMinLight: 1,
  faceStrength: 0,
  hairMinLight: 0.3,
  hairStrength: 0.22,
  skinMinLight: 0.4,
  skinStrength: 0.18,
  softness: 0.35,
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

function normalizeAverageShadowOptions(options) {
  if (options === true) return { enabled: true };
  if (typeof options === 'string') {
    const key = options.trim().toLowerCase();
    return {
      enabled: key !== 'off' && key !== 'none' && key !== 'false' && key !== '0',
    };
  }
  return options || {};
}

function hasExplicitSettings(source) {
  return Object.keys(source).some((key) => key !== 'enabled');
}

export function createAverageShadowSettings(options = null) {
  const source = normalizeAverageShadowOptions(options);
  const enabled = source.enabled === true ||
    (source.enabled !== false && hasExplicitSettings(source));

  return {
    defaultMinLight: enabled
      ? numberOption(
        firstDefined(source, ['defaultMinLight', 'minLight', 'averageShadowMinLight']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.defaultMinLight,
        { min: 0, max: 1 },
      )
      : 0,
    defaultStrength: enabled
      ? numberOption(
        firstDefined(source, ['defaultStrength', 'strength', 'averageShadowStrength']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.defaultStrength,
        { min: 0, max: 1 },
      )
      : 0,
    enabled,
    // measuredBlend is intentionally independent of `enabled`: the smoothing
    // layer and the measured replacement solve different problems.
    measuredBlend: numberOption(
      firstDefined(source, ['measuredBlend', 'measuredShadowBlend', 'averageMeasuredBlend']),
      DEFAULT_AVERAGE_SHADOW_SETTINGS.measuredBlend,
      { min: 0, max: 1 },
    ),
    eyeMinLight: enabled
      ? numberOption(
        firstDefined(source, ['eyeMinLight', 'eyeAverageShadowMinLight']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.eyeMinLight,
        { min: 0, max: 1 },
      )
      : 0,
    eyeStrength: enabled
      ? numberOption(
        firstDefined(source, ['eyeStrength', 'eyeAverageShadowStrength']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.eyeStrength,
        { min: 0, max: 1 },
      )
      : 0,
    faceMinLight: enabled
      ? numberOption(
        firstDefined(source, ['faceMinLight', 'faceAverageShadowMinLight']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.faceMinLight,
        { min: 0, max: 1 },
      )
      : 0,
    faceStrength: enabled
      ? numberOption(
        firstDefined(source, ['faceStrength', 'faceAverageShadowStrength']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.faceStrength,
        { min: 0, max: 1 },
      )
      : 0,
    hairMinLight: enabled
      ? numberOption(
        firstDefined(source, ['hairMinLight', 'hairAverageShadowMinLight']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.hairMinLight,
        { min: 0, max: 1 },
      )
      : 0,
    hairStrength: enabled
      ? numberOption(
        firstDefined(source, ['hairStrength', 'hairAverageShadowStrength']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.hairStrength,
        { min: 0, max: 1 },
      )
      : 0,
    skinMinLight: enabled
      ? numberOption(
        firstDefined(source, ['skinMinLight', 'skinAverageShadowMinLight']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.skinMinLight,
        { min: 0, max: 1 },
      )
      : 0,
    skinStrength: enabled
      ? numberOption(
        firstDefined(source, ['skinStrength', 'skinAverageShadowStrength']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.skinStrength,
        { min: 0, max: 1 },
      )
      : 0,
    softness: enabled
      ? numberOption(
        firstDefined(source, ['softness', 'averageShadowSoftness', 'visibilitySoftness']),
        DEFAULT_AVERAGE_SHADOW_SETTINGS.softness,
        { min: 0, max: 1 },
      )
      : 0,
  };
}

export function resolveAverageShadowForMaterial(settings, {
  isEye = false,
  isFace = false,
  isHair = false,
  isSkin = false,
} = {}) {
  if (isEye) {
    return {
      minLight: settings.eyeMinLight,
      strength: settings.eyeStrength,
    };
  }

  if (isFace) {
    return {
      minLight: settings.faceMinLight,
      strength: settings.faceStrength,
    };
  }

  if (isSkin) {
    return {
      minLight: settings.skinMinLight,
      strength: settings.skinStrength,
    };
  }

  if (isHair) {
    return {
      minLight: settings.hairMinLight,
      strength: settings.hairStrength,
    };
  }

  return {
    minLight: settings.defaultMinLight,
    strength: settings.defaultStrength,
  };
}
