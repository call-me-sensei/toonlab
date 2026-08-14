export const SELF_SHADOW_SOURCE_MODES = Object.freeze({
  off: 0,
  sceneProxy: 1,
  // Dedicated character-only orthographic shadow map rendered by
  // characterRenderPasses.js. Materials fall back to "no self shadow" when the
  // runtime pass is not active, so this is safe as a default source.
  characterPass: 2,
});

export const DEFAULT_SELF_SHADOW_SETTINGS = Object.freeze({
  defaultMinLight: 0.62,
  defaultStrength: 0.22,
  enabled: true,
  eyeMinLight: 1,
  eyeStrength: 0,
  faceMinLight: 1,
  faceStrength: 0,
  hairMinLight: 0.58,
  hairStrength: 0.26,
  shadowAreaStrength: 0.5,
  skinMinLight: 0.72,
  skinStrength: 0.16,
  sourceMode: SELF_SHADOW_SOURCE_MODES.characterPass,
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

function normalizeSourceMode(value, enabled) {
  if (value === SELF_SHADOW_SOURCE_MODES.sceneProxy) return SELF_SHADOW_SOURCE_MODES.sceneProxy;
  if (value === SELF_SHADOW_SOURCE_MODES.characterPass) return SELF_SHADOW_SOURCE_MODES.characterPass;

  const key = String(value ?? (enabled ? 'characterPass' : 'off'))
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();

  if (
    key === 'scene' ||
    key === 'sceneshadow' ||
    key === 'sceneproxy' ||
    key === 'shadowmask'
  ) {
    return SELF_SHADOW_SOURCE_MODES.sceneProxy;
  }

  if (
    key === 'characterpass' ||
    key === 'character' ||
    key === 'charpass' ||
    key === 'pass' ||
    key === 'shadowmap' ||
    key === 'selfshadowmap'
  ) {
    return SELF_SHADOW_SOURCE_MODES.characterPass;
  }

  return SELF_SHADOW_SOURCE_MODES.off;
}

function normalizeSelfShadowOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') {
    const key = options.trim().toLowerCase();
    return {
      enabled: key !== 'off' && key !== 'none' && key !== 'false' && key !== '0',
      sourceMode: options,
    };
  }
  return options || {};
}

export function createSelfShadowSettings(options = null) {
  const source = normalizeSelfShadowOptions(options);
  const requestedSourceMode = firstDefined(source, ['sourceMode', 'source', 'mode', 'maskSource']);
  const enabled = source.enabled === true ||
    (source.enabled !== false &&
      (requestedSourceMode !== undefined || DEFAULT_SELF_SHADOW_SETTINGS.enabled));
  const sourceMode = enabled
    ? normalizeSourceMode(requestedSourceMode, enabled)
    : SELF_SHADOW_SOURCE_MODES.off;
  const active = enabled && sourceMode !== SELF_SHADOW_SOURCE_MODES.off;

  return {
    defaultMinLight: active
      ? numberOption(
        firstDefined(source, ['defaultMinLight', 'minLight', 'selfShadowMinLight']),
        DEFAULT_SELF_SHADOW_SETTINGS.defaultMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    defaultStrength: active
      ? numberOption(
        firstDefined(source, ['defaultStrength', 'strength', 'selfShadowStrength']),
        DEFAULT_SELF_SHADOW_SETTINGS.defaultStrength,
        { min: 0, max: 1 },
      )
      : 0,
    enabled: active,
    eyeMinLight: active
      ? numberOption(
        firstDefined(source, ['eyeMinLight', 'eyeSelfShadowMinLight']),
        DEFAULT_SELF_SHADOW_SETTINGS.eyeMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    eyeStrength: active
      ? numberOption(
        firstDefined(source, ['eyeStrength', 'eyeSelfShadowStrength']),
        DEFAULT_SELF_SHADOW_SETTINGS.eyeStrength,
        { min: 0, max: 1 },
      )
      : 0,
    faceMinLight: active
      ? numberOption(
        firstDefined(source, ['faceMinLight', 'faceSelfShadowMinLight']),
        DEFAULT_SELF_SHADOW_SETTINGS.faceMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    faceStrength: active
      ? numberOption(
        firstDefined(source, ['faceStrength', 'faceSelfShadowStrength']),
        DEFAULT_SELF_SHADOW_SETTINGS.faceStrength,
        { min: 0, max: 1 },
      )
      : 0,
    hairMinLight: active
      ? numberOption(
        firstDefined(source, ['hairMinLight', 'hairSelfShadowMinLight']),
        DEFAULT_SELF_SHADOW_SETTINGS.hairMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    hairStrength: active
      ? numberOption(
        firstDefined(source, ['hairStrength', 'hairSelfShadowStrength']),
        DEFAULT_SELF_SHADOW_SETTINGS.hairStrength,
        { min: 0, max: 1 },
      )
      : 0,
    shadowAreaStrength: active
      ? numberOption(
        firstDefined(source, [
          'shadowAreaStrength',
          'selfShadowAreaStrength',
          'areaStrength',
          'blend',
        ]),
        DEFAULT_SELF_SHADOW_SETTINGS.shadowAreaStrength,
        { min: 0, max: 1 },
      )
      : 0,
    skinMinLight: active
      ? numberOption(
        firstDefined(source, ['skinMinLight', 'skinSelfShadowMinLight']),
        DEFAULT_SELF_SHADOW_SETTINGS.skinMinLight,
        { min: 0, max: 1 },
      )
      : 1,
    skinStrength: active
      ? numberOption(
        firstDefined(source, ['skinStrength', 'skinSelfShadowStrength']),
        DEFAULT_SELF_SHADOW_SETTINGS.skinStrength,
        { min: 0, max: 1 },
      )
      : 0,
    sourceMode,
  };
}

export function resolveSelfShadowForMaterial(settings, {
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
