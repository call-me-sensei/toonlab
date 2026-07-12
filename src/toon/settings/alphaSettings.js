import {
  hasAnyToken,
  materialText,
  roleIsFace,
  roleIsHair,
  roleIsSkin,
  roleIsTransparentOverlay,
} from '../../core/materialRoles.js';

export const DEFAULT_ALPHA_SETTINGS = Object.freeze({
  blendCutoff: 0.02,
  costumeCutout: true,
  cutoutCutoff: 0.35,
  // Bayer-matrix screen-door fade (1 = fully visible). Unlike alpha blending
  // it needs no sorting, keeps depth writes, and works with outlines — the
  // standard way to fade a whole character in/out. Runtime helper:
  // setToonDitherOpacity(root, value).
  ditherOpacity: 1,
  enabled: true,
  expressionTokenCutout: true,
  eyeHighlightOrder: 12,
  eyeOrder: 11,
  faceCutout: true,
  hairCutout: true,
  mapTransparentCutout: true,
  overlayDepthWrite: false,
  overlayOrder: 20,
  preserveSourceAlphaTest: true,
  scleraOrder: 10,
  skinCutout: true,
  sortOverlays: true,
  sourceAlphaMapCutout: true,
  sourceTransparentCutout: true,
  transparentOverlayBlend: true,
  transparentOpacityThreshold: 0.999,
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

function normalizeAlphaOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

export function createAlphaSettings(options = null) {
  const source = normalizeAlphaOptions(options);
  const enabled = enabledOption(source.enabled);

  return {
    blendCutoff: enabled
      ? numberOption(firstDefined(source, ['blendCutoff', 'blendAlphaTest', 'blendThreshold']), DEFAULT_ALPHA_SETTINGS.blendCutoff, { min: 0, max: 1 })
      : -1,
    costumeCutout: source.costumeCutout !== undefined ? enabledOption(source.costumeCutout) : DEFAULT_ALPHA_SETTINGS.costumeCutout,
    cutoutCutoff: enabled
      ? numberOption(firstDefined(source, ['cutoutCutoff', 'alphaCutoff', 'alphaTest', 'cutoutThreshold']), DEFAULT_ALPHA_SETTINGS.cutoutCutoff, { min: 0, max: 1 })
      : -1,
    ditherOpacity: numberOption(
      firstDefined(source, ['ditherOpacity', 'ditherFadeout', 'fadeOpacity']),
      DEFAULT_ALPHA_SETTINGS.ditherOpacity,
      { min: 0, max: 1 },
    ),
    enabled,
    expressionTokenCutout: source.expressionTokenCutout !== undefined ? enabledOption(source.expressionTokenCutout) : DEFAULT_ALPHA_SETTINGS.expressionTokenCutout,
    eyeHighlightOrder: numberOption(firstDefined(source, ['eyeHighlightOrder', 'catchlightOrder']), DEFAULT_ALPHA_SETTINGS.eyeHighlightOrder, { min: -100, max: 100 }),
    eyeOrder: numberOption(firstDefined(source, ['eyeOrder', 'irisOrder', 'pupilOrder']), DEFAULT_ALPHA_SETTINGS.eyeOrder, { min: -100, max: 100 }),
    faceCutout: source.faceCutout !== undefined ? enabledOption(source.faceCutout) : DEFAULT_ALPHA_SETTINGS.faceCutout,
    hairCutout: source.hairCutout !== undefined ? enabledOption(source.hairCutout) : DEFAULT_ALPHA_SETTINGS.hairCutout,
    mapTransparentCutout: source.mapTransparentCutout !== undefined ? enabledOption(source.mapTransparentCutout) : DEFAULT_ALPHA_SETTINGS.mapTransparentCutout,
    overlayDepthWrite: source.overlayDepthWrite !== undefined ? enabledOption(source.overlayDepthWrite) : DEFAULT_ALPHA_SETTINGS.overlayDepthWrite,
    overlayOrder: numberOption(firstDefined(source, ['overlayOrder', 'transparentOverlayOrder']), DEFAULT_ALPHA_SETTINGS.overlayOrder, { min: -100, max: 100 }),
    preserveSourceAlphaTest: source.preserveSourceAlphaTest !== undefined ? enabledOption(source.preserveSourceAlphaTest) : DEFAULT_ALPHA_SETTINGS.preserveSourceAlphaTest,
    scleraOrder: numberOption(firstDefined(source, ['scleraOrder', 'eyeWhiteOrder']), DEFAULT_ALPHA_SETTINGS.scleraOrder, { min: -100, max: 100 }),
    skinCutout: source.skinCutout !== undefined ? enabledOption(source.skinCutout) : DEFAULT_ALPHA_SETTINGS.skinCutout,
    sortOverlays: source.sortOverlays !== undefined ? enabledOption(source.sortOverlays) : DEFAULT_ALPHA_SETTINGS.sortOverlays,
    sourceAlphaMapCutout: source.sourceAlphaMapCutout !== undefined ? enabledOption(source.sourceAlphaMapCutout) : DEFAULT_ALPHA_SETTINGS.sourceAlphaMapCutout,
    sourceTransparentCutout: source.sourceTransparentCutout !== undefined ? enabledOption(source.sourceTransparentCutout) : DEFAULT_ALPHA_SETTINGS.sourceTransparentCutout,
    transparentOverlayBlend: source.transparentOverlayBlend !== undefined ? enabledOption(source.transparentOverlayBlend) : DEFAULT_ALPHA_SETTINGS.transparentOverlayBlend,
    transparentOpacityThreshold: numberOption(
      firstDefined(source, ['transparentOpacityThreshold', 'opaqueOpacityThreshold', 'opacityThreshold']),
      DEFAULT_ALPHA_SETTINGS.transparentOpacityThreshold,
      { min: 0, max: 1 },
    ),
  };
}

export function sourceOpacity(mat) {
  return Number.isFinite(mat?.opacity) ? mat.opacity : 1;
}

export function usesAlphaCutout(mat, roleInfo, settings = createAlphaSettings()) {
  if (!settings.enabled || !mat || roleIsTransparentOverlay(roleInfo)) return false;

  const text = materialText(mat);
  const tokenCutout = settings.expressionTokenCutout &&
    hasAnyToken(text, ['skin', 'costume', 'cloth', 'clothes', 'hair', 'expression']);

  return (
    (settings.preserveSourceAlphaTest && Number.isFinite(mat.alphaTest) && mat.alphaTest > 0) ||
    (settings.sourceAlphaMapCutout && Boolean(mat.alphaMap)) ||
    (settings.mapTransparentCutout && mat.map?.transparent === true) ||
    (settings.sourceTransparentCutout && mat.transparent === true && sourceOpacity(mat) >= settings.transparentOpacityThreshold) ||
    (settings.skinCutout && roleIsSkin(roleInfo)) ||
    (settings.faceCutout && roleIsFace(roleInfo)) ||
    (settings.hairCutout && roleIsHair(roleInfo)) ||
    (settings.costumeCutout && roleInfo?.role === 'costume') ||
    tokenCutout
  );
}

export function usesAlphaBlend(mat, roleInfo, settings = createAlphaSettings()) {
  if (!settings.enabled || !mat) return false;
  if (roleIsTransparentOverlay(roleInfo)) return settings.transparentOverlayBlend;
  return mat.transparent === true && sourceOpacity(mat) < settings.transparentOpacityThreshold;
}

export function alphaTestForMaterial(mat, roleInfo, settings = createAlphaSettings()) {
  if (usesAlphaBlend(mat, roleInfo, settings)) {
    return Math.max(mat?.alphaTest ?? settings.blendCutoff, settings.blendCutoff);
  }
  if (usesAlphaCutout(mat, roleInfo, settings)) {
    return Math.max(mat?.alphaTest ?? settings.cutoutCutoff, settings.cutoutCutoff);
  }
  return -1.0;
}

export function resolveAlphaForMaterial(settings, mat, roleInfo) {
  const alphaBlend = usesAlphaBlend(mat, roleInfo, settings);
  const alphaCutout = usesAlphaCutout(mat, roleInfo, settings);

  return {
    alphaBlend,
    alphaCutout,
    alphaTest: alphaTestForMaterial(mat, roleInfo, settings),
    depthWrite: roleIsTransparentOverlay(roleInfo) ? settings.overlayDepthWrite : !alphaBlend,
    opacity: sourceOpacity(mat),
    transparent: mat?.transparent === true && !alphaCutout,
  };
}

export function materialAlphaDrawOrder(settings, mat, roleInfo) {
  if (!settings.sortOverlays) return 0;

  const text = materialText(mat);
  if (text.includes('白目') || roleInfo?.role === 'sclera') return settings.scleraOrder;
  if (roleInfo?.role === 'eye' || roleInfo?.role === 'iris' || roleInfo?.role === 'pupil') return settings.eyeOrder;
  if (roleInfo?.role === 'eyeHighlight' || roleInfo?.role === 'catchlight') return settings.eyeHighlightOrder;
  if (roleIsTransparentOverlay(roleInfo)) return settings.overlayOrder;
  return 0;
}
