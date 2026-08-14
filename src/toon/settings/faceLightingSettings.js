export const FACE_HEAD_SPACE_MODES = Object.freeze({
  static: 'static',
  headBone: 'headBone',
});

export const FACE_HEAD_SPACE_MODE_VALUES = Object.freeze({
  [FACE_HEAD_SPACE_MODES.static]: 0,
  [FACE_HEAD_SPACE_MODES.headBone]: 1,
});

export const DEFAULT_FACE_LIGHTING_SETTINGS = Object.freeze({
  enabled: true,
  faceCelMidPoint: -0.48,
  faceCelSoftness: 0.22,
  faceLocalLightLift: 0.22,
  faceMainLightIgnoreCelShade: 0.45,
  // How strongly the face lighting normal is replaced by the corrected face
  // normal. In headBone mode this only activates when the runtime head tracker
  // provides live head-bone data, so it is inert for plain applyToonShader use.
  faceNormalProxyBlend: 0.75,
  faceProxyNormal: [0, 0, 1],
  faceSceneShadowStrength: 0.5,
  // Blend between the flattened head-forward normal (0) and a proxy sphere
  // around the head bone (1). The mix keeps the lit-to-shadow terminator
  // sweeping smoothly across the face while preserving some roundness.
  faceSphereBlend: 0.75,
  headSpaceMode: FACE_HEAD_SPACE_MODES.headBone,
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

function headSpaceModeOption(value, fallback) {
  const key = String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
  if (['headbone', 'head', 'dynamic', 'tracked'].includes(key)) return FACE_HEAD_SPACE_MODES.headBone;
  if (['static', 'fixed', 'object', 'legacy'].includes(key)) return FACE_HEAD_SPACE_MODES.static;
  return fallback;
}

export function createFaceLightingSettings(options = null) {
  const source = options || {};
  const enabled = source.enabled !== false;

  return {
    enabled,
    faceCelMidPoint: enabled
      ? numberOption(
        firstDefined(source, ['faceCelMidPoint', 'faceCelThreshold', 'celMidPoint']),
        DEFAULT_FACE_LIGHTING_SETTINGS.faceCelMidPoint,
        { min: -1, max: 1 },
      )
      : DEFAULT_FACE_LIGHTING_SETTINGS.faceCelMidPoint,
    faceCelSoftness: enabled
      ? numberOption(
        firstDefined(source, ['faceCelSoftness', 'faceCelFeather', 'celSoftness']),
        DEFAULT_FACE_LIGHTING_SETTINGS.faceCelSoftness,
        { min: 0.001, max: 1 },
      )
      : DEFAULT_FACE_LIGHTING_SETTINGS.faceCelSoftness,
    faceLocalLightLift: enabled
      ? numberOption(
        firstDefined(source, ['faceLocalLightLift', 'faceLocalLightWrap', 'localLightLift']),
        DEFAULT_FACE_LIGHTING_SETTINGS.faceLocalLightLift,
        { min: 0, max: 1 },
      )
      : DEFAULT_FACE_LIGHTING_SETTINGS.faceLocalLightLift,
    faceMainLightIgnoreCelShade: enabled
      ? numberOption(
        firstDefined(source, ['faceMainLightIgnoreCelShade', 'faceLightIgnoreCelShade', 'mainLightIgnoreCelShade']),
        DEFAULT_FACE_LIGHTING_SETTINGS.faceMainLightIgnoreCelShade,
        { min: 0, max: 1 },
      )
      : DEFAULT_FACE_LIGHTING_SETTINGS.faceMainLightIgnoreCelShade,
    faceNormalProxyBlend: enabled
      ? numberOption(
        firstDefined(source, ['faceNormalProxyBlend', 'faceProxyBlend', 'proxyNormalBlend']),
        DEFAULT_FACE_LIGHTING_SETTINGS.faceNormalProxyBlend,
        { min: 0, max: 1 },
      )
      : 0,
    faceProxyNormal: vectorOption(
      firstDefined(source, ['faceProxyNormal', 'faceNormalProxy', 'proxyNormal']),
      DEFAULT_FACE_LIGHTING_SETTINGS.faceProxyNormal,
    ),
    faceSceneShadowStrength: enabled
      ? numberOption(
        firstDefined(source, ['faceSceneShadowStrength', 'faceReceivedShadowStrength', 'sceneShadowStrength']),
        DEFAULT_FACE_LIGHTING_SETTINGS.faceSceneShadowStrength,
        { min: 0, max: 1 },
      )
      : DEFAULT_FACE_LIGHTING_SETTINGS.faceSceneShadowStrength,
    faceSphereBlend: numberOption(
      firstDefined(source, ['faceSphereBlend', 'sphereBlend', 'proxySphereBlend']),
      DEFAULT_FACE_LIGHTING_SETTINGS.faceSphereBlend,
      { min: 0, max: 1 },
    ),
    headSpaceMode: headSpaceModeOption(
      firstDefined(source, ['headSpaceMode', 'faceShadingMode']),
      DEFAULT_FACE_LIGHTING_SETTINGS.headSpaceMode,
    ),
  };
}
