export const DEFAULT_SCENE_SHADOW_SETTINGS = Object.freeze({
  defaultMinLight: 0.24,
  defaultStrength: 0.76,
  enabled: true,
  eyeMinLight: 0.42,
  eyeStrength: 0.05,
  faceMinLight: 0.42,
  faceStrength: 0.46,
  shadowAreaStrength: 0.65,
  skinMinLight: 0.34,
  skinStrength: 0.62,
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

export function createSceneShadowSettings(options = null) {
  const source = options || {};
  const enabled = source.enabled !== false;

  const defaultStrength = enabled
    ? numberOption(
      firstDefined(source, [
        'defaultStrength',
        'strength',
        'receiveStrength',
        'receivedShadowStrength',
      ]),
      DEFAULT_SCENE_SHADOW_SETTINGS.defaultStrength,
      { min: 0, max: 1 },
    )
    : 0;
  const defaultMinLight = enabled
    ? numberOption(
      firstDefined(source, [
        'defaultMinLight',
        'minLight',
        'receiveMinLight',
        'receivedShadowMinLight',
      ]),
      DEFAULT_SCENE_SHADOW_SETTINGS.defaultMinLight,
      { min: 0, max: 1 },
    )
    : 1;

  return {
    defaultMinLight,
    defaultStrength,
    enabled,
    eyeMinLight: enabled
      ? numberOption(
        firstDefined(source, ['eyeMinLight', 'eyeReceivedShadowMinLight']),
        DEFAULT_SCENE_SHADOW_SETTINGS.eyeMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    eyeStrength: enabled
      ? numberOption(
        firstDefined(source, ['eyeStrength', 'eyeReceiveStrength', 'eyeReceivedShadowStrength']),
        DEFAULT_SCENE_SHADOW_SETTINGS.eyeStrength,
        { min: 0, max: 1 },
      )
      : 0,
    faceMinLight: enabled
      ? numberOption(
        firstDefined(source, ['faceMinLight', 'faceReceivedShadowMinLight']),
        DEFAULT_SCENE_SHADOW_SETTINGS.faceMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    faceStrength: enabled
      ? numberOption(
        firstDefined(source, ['faceStrength', 'faceReceiveStrength', 'faceReceivedShadowStrength']),
        DEFAULT_SCENE_SHADOW_SETTINGS.faceStrength,
        { min: 0, max: 1 },
      )
      : 0,
    shadowAreaStrength: enabled
      ? numberOption(
        firstDefined(source, [
          'shadowAreaStrength',
          'directVisibilityStrength',
          'sceneShadowBlend',
          'shadowBlend',
        ]),
        DEFAULT_SCENE_SHADOW_SETTINGS.shadowAreaStrength,
        { min: 0, max: 1 },
      )
      : 0,
    skinMinLight: enabled
      ? numberOption(
        firstDefined(source, ['skinMinLight', 'skinReceivedShadowMinLight']),
        DEFAULT_SCENE_SHADOW_SETTINGS.skinMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    skinStrength: enabled
      ? numberOption(
        firstDefined(source, ['skinStrength', 'skinReceiveStrength', 'skinReceivedShadowStrength']),
        DEFAULT_SCENE_SHADOW_SETTINGS.skinStrength,
        { min: 0, max: 1 },
      )
      : 0,
  };
}

export function resolveSceneShadowForMaterial(settings, {
  isEye = false,
  isFace = false,
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

  return {
    minLight: settings.defaultMinLight,
    strength: settings.defaultStrength,
  };
}
