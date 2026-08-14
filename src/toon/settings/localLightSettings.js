export const DEFAULT_LOCAL_LIGHT_SETTINGS = Object.freeze({
  defaultIntensity: 0.72,
  defaultMaxContribution: 0.34,
  defaultShadowLift: 0.58,
  enabled: true,
  eyeIntensity: 0.42,
  eyeMaxContribution: 0.18,
  eyeShadowLift: 0.9,
  faceIntensity: 0.56,
  faceMaxContribution: 0.24,
  faceShadowLift: 0.84,
  hairIntensity: 0.72,
  hairMaxContribution: 0.34,
  hairShadowLift: 0.58,
  skinIntensity: 0.64,
  skinMaxContribution: 0.3,
  skinShadowLift: 0.72,
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

function enabledOption(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== 'off' && normalized !== 'none' && normalized !== 'false' && normalized !== '0';
  }
  return value !== false;
}

function normalizeLocalLightOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function roleNumber(source, role, property, fallback, aliases = []) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return numberOption(
    firstDefined(source, [rolePrefix, ...aliases]),
    fallback,
    { min: 0, max: property === 'shadowLift' ? 1 : 8 },
  );
}

export function createLocalLightSettings(options = null) {
  const source = normalizeLocalLightOptions(options);
  const enabled = enabledOption(source.enabled);

  const defaultIntensity = enabled
    ? roleNumber(
      source,
      'default',
      'intensity',
      DEFAULT_LOCAL_LIGHT_SETTINGS.defaultIntensity,
      ['intensity', 'localLightIntensity'],
    )
    : 0;
  const defaultMaxContribution = enabled
    ? roleNumber(
      source,
      'default',
      'maxContribution',
      DEFAULT_LOCAL_LIGHT_SETTINGS.defaultMaxContribution,
      ['maxContribution', 'localLightMaxContribution'],
    )
    : 0;
  const defaultShadowLift = enabled
    ? roleNumber(
      source,
      'default',
      'shadowLift',
      DEFAULT_LOCAL_LIGHT_SETTINGS.defaultShadowLift,
      ['shadowLift', 'localLightShadowLift'],
    )
    : 0;

  return {
    defaultIntensity,
    defaultMaxContribution,
    defaultShadowLift,
    enabled,
    eyeIntensity: enabled
      ? roleNumber(source, 'eye', 'intensity', DEFAULT_LOCAL_LIGHT_SETTINGS.eyeIntensity)
      : 0,
    eyeMaxContribution: enabled
      ? roleNumber(source, 'eye', 'maxContribution', DEFAULT_LOCAL_LIGHT_SETTINGS.eyeMaxContribution)
      : 0,
    eyeShadowLift: enabled
      ? roleNumber(source, 'eye', 'shadowLift', DEFAULT_LOCAL_LIGHT_SETTINGS.eyeShadowLift)
      : 0,
    faceIntensity: enabled
      ? roleNumber(source, 'face', 'intensity', DEFAULT_LOCAL_LIGHT_SETTINGS.faceIntensity)
      : 0,
    faceMaxContribution: enabled
      ? roleNumber(source, 'face', 'maxContribution', DEFAULT_LOCAL_LIGHT_SETTINGS.faceMaxContribution)
      : 0,
    faceShadowLift: enabled
      ? roleNumber(source, 'face', 'shadowLift', DEFAULT_LOCAL_LIGHT_SETTINGS.faceShadowLift)
      : 0,
    hairIntensity: enabled
      ? roleNumber(source, 'hair', 'intensity', DEFAULT_LOCAL_LIGHT_SETTINGS.hairIntensity)
      : 0,
    hairMaxContribution: enabled
      ? roleNumber(source, 'hair', 'maxContribution', DEFAULT_LOCAL_LIGHT_SETTINGS.hairMaxContribution)
      : 0,
    hairShadowLift: enabled
      ? roleNumber(source, 'hair', 'shadowLift', DEFAULT_LOCAL_LIGHT_SETTINGS.hairShadowLift)
      : 0,
    skinIntensity: enabled
      ? roleNumber(source, 'skin', 'intensity', DEFAULT_LOCAL_LIGHT_SETTINGS.skinIntensity)
      : 0,
    skinMaxContribution: enabled
      ? roleNumber(source, 'skin', 'maxContribution', DEFAULT_LOCAL_LIGHT_SETTINGS.skinMaxContribution)
      : 0,
    skinShadowLift: enabled
      ? roleNumber(source, 'skin', 'shadowLift', DEFAULT_LOCAL_LIGHT_SETTINGS.skinShadowLift)
      : 0,
  };
}

export function resolveLocalLightForMaterial(settings, {
  isEye = false,
  isFace = false,
  isHair = false,
  isSkin = false,
} = {}) {
  if (isEye) {
    return {
      intensity: settings.eyeIntensity,
      maxContribution: settings.eyeMaxContribution,
      shadowLift: settings.eyeShadowLift,
    };
  }

  if (isFace) {
    return {
      intensity: settings.faceIntensity,
      maxContribution: settings.faceMaxContribution,
      shadowLift: settings.faceShadowLift,
    };
  }

  if (isSkin) {
    return {
      intensity: settings.skinIntensity,
      maxContribution: settings.skinMaxContribution,
      shadowLift: settings.skinShadowLift,
    };
  }

  if (isHair) {
    return {
      intensity: settings.hairIntensity,
      maxContribution: settings.hairMaxContribution,
      shadowLift: settings.hairShadowLift,
    };
  }

  return {
    intensity: settings.defaultIntensity,
    maxContribution: settings.defaultMaxContribution,
    shadowLift: settings.defaultShadowLift,
  };
}
