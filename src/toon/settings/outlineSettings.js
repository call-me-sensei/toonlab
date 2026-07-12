import * as THREE from 'three';

export const DEFAULT_OUTLINE_SETTINGS = Object.freeze({
  defaultLightingMix: 0.28,
  defaultMaxBrightness: 0.38,
  defaultMinBrightness: 0.04,
  defaultTintColor: [0.34, 0.33, 0.4],
  defaultWidth: 0.002,
  depthOffset: 0,
  depthTest: true,
  depthWrite: false,
  enabled: true,
  eyeLightingMix: 0.28,
  eyeMaxBrightness: 0.38,
  eyeMinBrightness: 0.04,
  eyeTintColor: [0.34, 0.33, 0.4],
  eyeWidth: 0,
  faceLightingMix: 0.28,
  faceMaxBrightness: 0.48,
  faceMinBrightness: 0.04,
  faceTintColor: [0.62, 0.36, 0.34],
  faceWidth: 0,
  hairCutoutWidth: 0,
  hairLightingMix: 0.08,
  hairMaxBrightness: 0.68,
  hairMinBrightness: 0.085,
  hairTintColor: [0.72, 0.78, 0.9],
  hairWidth: 0.00055,
  maxWidth: 0.006,
  metalLightingMix: 0.28,
  metalMaxBrightness: 0.38,
  metalMinBrightness: 0.04,
  metalTintColor: [0.34, 0.33, 0.4],
  metalWidth: 0.002,
  polygonOffset: false,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
  // Screen-space width correction: scales the view-space expansion by camera
  // distance and FOV so the outline keeps a consistent on-screen width, then
  // stops growing past widthFadeDistance so far-away characters lose outline
  // weight instead of turning into black blobs. 0 restores the legacy
  // constant view-space offset. referenceDistance/referenceFov define the
  // framing at which configured widths mean what they meant before.
  referenceDistance: 4,
  referenceFov: 40,
  screenSpaceWidth: 1,
  // Average normals across position-duplicate vertices at conversion time so
  // hard-edged geometry (Rigify mannequin, arbitrary GLB) keeps a closed hull.
  smoothNormals: true,
  widthFadeDistance: 12,
  skinLightingMix: 0.28,
  skinMaxBrightness: 0.48,
  skinMinBrightness: 0.04,
  skinTintColor: [0.62, 0.36, 0.34],
  skinWidth: 0.001,
  transparentOverlayWidth: 0,
  widthScale: 1,
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

function normalizeOutlineOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function roleNumber(source, role, property, fallback, aliases = [], bounds = {}) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return numberOption(firstDefined(source, [rolePrefix, ...aliases]), fallback, bounds);
}

function roleColor(source, role, property, fallback, aliases = []) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return colorOption(firstDefined(source, [rolePrefix, ...aliases]), fallback);
}

function roleValue(settings, role, property, fallback) {
  return settings[`${role}${property[0].toUpperCase()}${property.slice(1)}`] ?? fallback;
}

export function createOutlineSettings(options = null) {
  const source = normalizeOutlineOptions(options);
  const enabled = enabledOption(source.enabled);

  return {
    defaultLightingMix: enabled
      ? roleNumber(source, 'default', 'lightingMix', DEFAULT_OUTLINE_SETTINGS.defaultLightingMix, ['lightingMix'], { min: 0, max: 1 })
      : DEFAULT_OUTLINE_SETTINGS.defaultLightingMix,
    defaultMaxBrightness: roleNumber(source, 'default', 'maxBrightness', DEFAULT_OUTLINE_SETTINGS.defaultMaxBrightness, ['maxBrightness'], { min: 0, max: 2 }),
    defaultMinBrightness: roleNumber(source, 'default', 'minBrightness', DEFAULT_OUTLINE_SETTINGS.defaultMinBrightness, ['minBrightness'], { min: 0, max: 2 }),
    defaultTintColor: roleColor(source, 'default', 'tintColor', DEFAULT_OUTLINE_SETTINGS.defaultTintColor, ['tintColor', 'color']),
    defaultWidth: enabled
      ? roleNumber(source, 'default', 'width', DEFAULT_OUTLINE_SETTINGS.defaultWidth, ['width', 'thickness'], { min: 0, max: 0.05 })
      : 0,
    depthOffset: enabled
      ? numberOption(firstDefined(source, ['depthOffset', 'zOffset', 'viewDepthOffset']), DEFAULT_OUTLINE_SETTINGS.depthOffset, { min: 0, max: 0.05 })
      : 0,
    depthTest: source.depthTest !== undefined ? enabledOption(source.depthTest) : DEFAULT_OUTLINE_SETTINGS.depthTest,
    depthWrite: source.depthWrite !== undefined ? enabledOption(source.depthWrite) : DEFAULT_OUTLINE_SETTINGS.depthWrite,
    enabled,
    eyeLightingMix: enabled ? roleNumber(source, 'eye', 'lightingMix', DEFAULT_OUTLINE_SETTINGS.eyeLightingMix, [], { min: 0, max: 1 }) : DEFAULT_OUTLINE_SETTINGS.eyeLightingMix,
    eyeMaxBrightness: roleNumber(source, 'eye', 'maxBrightness', DEFAULT_OUTLINE_SETTINGS.eyeMaxBrightness, [], { min: 0, max: 2 }),
    eyeMinBrightness: roleNumber(source, 'eye', 'minBrightness', DEFAULT_OUTLINE_SETTINGS.eyeMinBrightness, [], { min: 0, max: 2 }),
    eyeTintColor: roleColor(source, 'eye', 'tintColor', DEFAULT_OUTLINE_SETTINGS.eyeTintColor),
    eyeWidth: enabled ? roleNumber(source, 'eye', 'width', DEFAULT_OUTLINE_SETTINGS.eyeWidth, [], { min: 0, max: 0.05 }) : 0,
    faceLightingMix: enabled ? roleNumber(source, 'face', 'lightingMix', DEFAULT_OUTLINE_SETTINGS.faceLightingMix, [], { min: 0, max: 1 }) : DEFAULT_OUTLINE_SETTINGS.faceLightingMix,
    faceMaxBrightness: roleNumber(source, 'face', 'maxBrightness', DEFAULT_OUTLINE_SETTINGS.faceMaxBrightness, [], { min: 0, max: 2 }),
    faceMinBrightness: roleNumber(source, 'face', 'minBrightness', DEFAULT_OUTLINE_SETTINGS.faceMinBrightness, [], { min: 0, max: 2 }),
    faceTintColor: roleColor(source, 'face', 'tintColor', DEFAULT_OUTLINE_SETTINGS.faceTintColor),
    faceWidth: enabled ? roleNumber(source, 'face', 'width', DEFAULT_OUTLINE_SETTINGS.faceWidth, [], { min: 0, max: 0.05 }) : 0,
    hairCutoutWidth: enabled
      ? numberOption(firstDefined(source, ['hairCutoutWidth', 'hairCardWidth', 'hairAlphaWidth']), DEFAULT_OUTLINE_SETTINGS.hairCutoutWidth, { min: 0, max: 0.05 })
      : 0,
    hairLightingMix: enabled ? roleNumber(source, 'hair', 'lightingMix', DEFAULT_OUTLINE_SETTINGS.hairLightingMix, [], { min: 0, max: 1 }) : DEFAULT_OUTLINE_SETTINGS.hairLightingMix,
    hairMaxBrightness: roleNumber(source, 'hair', 'maxBrightness', DEFAULT_OUTLINE_SETTINGS.hairMaxBrightness, [], { min: 0, max: 2 }),
    hairMinBrightness: roleNumber(source, 'hair', 'minBrightness', DEFAULT_OUTLINE_SETTINGS.hairMinBrightness, [], { min: 0, max: 2 }),
    hairTintColor: roleColor(source, 'hair', 'tintColor', DEFAULT_OUTLINE_SETTINGS.hairTintColor),
    hairWidth: enabled ? roleNumber(source, 'hair', 'width', DEFAULT_OUTLINE_SETTINGS.hairWidth, [], { min: 0, max: 0.05 }) : 0,
    maxWidth: numberOption(firstDefined(source, ['maxWidth', 'maxThickness']), DEFAULT_OUTLINE_SETTINGS.maxWidth, { min: 0, max: 0.05 }),
    metalLightingMix: enabled ? roleNumber(source, 'metal', 'lightingMix', DEFAULT_OUTLINE_SETTINGS.metalLightingMix, [], { min: 0, max: 1 }) : DEFAULT_OUTLINE_SETTINGS.metalLightingMix,
    metalMaxBrightness: roleNumber(source, 'metal', 'maxBrightness', DEFAULT_OUTLINE_SETTINGS.metalMaxBrightness, [], { min: 0, max: 2 }),
    metalMinBrightness: roleNumber(source, 'metal', 'minBrightness', DEFAULT_OUTLINE_SETTINGS.metalMinBrightness, [], { min: 0, max: 2 }),
    metalTintColor: roleColor(source, 'metal', 'tintColor', DEFAULT_OUTLINE_SETTINGS.metalTintColor),
    metalWidth: enabled ? roleNumber(source, 'metal', 'width', DEFAULT_OUTLINE_SETTINGS.metalWidth, [], { min: 0, max: 0.05 }) : 0,
    polygonOffset: source.polygonOffset === true,
    polygonOffsetFactor: numberOption(firstDefined(source, ['polygonOffsetFactor']), DEFAULT_OUTLINE_SETTINGS.polygonOffsetFactor, { min: -64, max: 64 }),
    polygonOffsetUnits: numberOption(firstDefined(source, ['polygonOffsetUnits']), DEFAULT_OUTLINE_SETTINGS.polygonOffsetUnits, { min: -1024, max: 1024 }),
    referenceDistance: numberOption(
      firstDefined(source, ['referenceDistance', 'widthReferenceDistance']),
      DEFAULT_OUTLINE_SETTINGS.referenceDistance,
      { min: 0.1, max: 100 },
    ),
    referenceFov: numberOption(
      firstDefined(source, ['referenceFov', 'widthReferenceFov']),
      DEFAULT_OUTLINE_SETTINGS.referenceFov,
      { min: 5, max: 150 },
    ),
    screenSpaceWidth: numberOption(
      firstDefined(source, ['screenSpaceWidth', 'screenSpaceWidthFix', 'widthDistanceFix']),
      DEFAULT_OUTLINE_SETTINGS.screenSpaceWidth,
      { min: 0, max: 1 },
    ),
    smoothNormals: firstDefined(source, ['smoothNormals', 'smoothedNormals', 'bakeSmoothNormals']) !== false,
    widthFadeDistance: numberOption(
      firstDefined(source, ['widthFadeDistance', 'maxWidthDistance', 'fadeDistance']),
      DEFAULT_OUTLINE_SETTINGS.widthFadeDistance,
      { min: 0.5, max: 200 },
    ),
    skinLightingMix: enabled ? roleNumber(source, 'skin', 'lightingMix', DEFAULT_OUTLINE_SETTINGS.skinLightingMix, [], { min: 0, max: 1 }) : DEFAULT_OUTLINE_SETTINGS.skinLightingMix,
    skinMaxBrightness: roleNumber(source, 'skin', 'maxBrightness', DEFAULT_OUTLINE_SETTINGS.skinMaxBrightness, [], { min: 0, max: 2 }),
    skinMinBrightness: roleNumber(source, 'skin', 'minBrightness', DEFAULT_OUTLINE_SETTINGS.skinMinBrightness, [], { min: 0, max: 2 }),
    skinTintColor: roleColor(source, 'skin', 'tintColor', DEFAULT_OUTLINE_SETTINGS.skinTintColor),
    skinWidth: enabled ? roleNumber(source, 'skin', 'width', DEFAULT_OUTLINE_SETTINGS.skinWidth, [], { min: 0, max: 0.05 }) : 0,
    transparentOverlayWidth: enabled
      ? numberOption(firstDefined(source, ['transparentOverlayWidth', 'overlayWidth', 'decalWidth']), DEFAULT_OUTLINE_SETTINGS.transparentOverlayWidth, { min: 0, max: 0.05 })
      : 0,
    widthScale: enabled
      ? numberOption(firstDefined(source, ['widthScale', 'scale', 'thicknessScale']), DEFAULT_OUTLINE_SETTINGS.widthScale, { min: 0, max: 20 })
      : 0,
  };
}

export function resolveOutlineForMaterial(settings, {
  alphaTest = -1,
  isEye = false,
  isFace = false,
  isHair = false,
  isMetal = false,
  isSkin = false,
  isTransparentOverlay = false,
} = {}) {
  let role = 'default';
  if (isEye) role = 'eye';
  else if (isFace) role = 'face';
  else if (isSkin) role = 'skin';
  else if (isHair) role = 'hair';
  else if (isMetal) role = 'metal';

  let width = role === 'hair' && alphaTest >= 0
    ? settings.hairCutoutWidth
    : roleValue(settings, role, 'width', settings.defaultWidth);

  if (isTransparentOverlay) {
    width = settings.transparentOverlayWidth;
  }

  width = Math.min(settings.maxWidth, Math.max(0, width * settings.widthScale));

  return {
    depthOffset: settings.depthOffset,
    depthTest: settings.depthTest,
    depthWrite: settings.depthWrite,
    enabled: settings.enabled && width > 0,
    lightingMix: roleValue(settings, role, 'lightingMix', settings.defaultLightingMix),
    maxBrightness: roleValue(settings, role, 'maxBrightness', settings.defaultMaxBrightness),
    minBrightness: roleValue(settings, role, 'minBrightness', settings.defaultMinBrightness),
    polygonOffset: settings.polygonOffset,
    polygonOffsetFactor: settings.polygonOffsetFactor,
    polygonOffsetUnits: settings.polygonOffsetUnits,
    referenceDistance: settings.referenceDistance,
    referenceFov: settings.referenceFov,
    screenSpaceWidth: settings.screenSpaceWidth,
    smoothNormals: settings.smoothNormals,
    widthFadeDistance: settings.widthFadeDistance,
    skinTintColor: settings.skinTintColor,
    skinTintStrength: 1,
    tintColor: roleValue(settings, role, 'tintColor', settings.defaultTintColor),
    width,
  };
}
