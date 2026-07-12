// Screen-space depth-sampled contact shadow.
//
// Samples the scene depth prepass a short screen-space step toward the light;
// when a closer surface sits just in front of the current pixel along that
// direction, the pixel is treated as being in that surface's contact shadow.
// The visible result is the thin anime "hair shadow" line where hair meets the
// forehead, and grounding shadows where an arm crosses the torso.
//
// This only activates while a scene depth prepass is running (see
// characterRenderPasses.js) and is automatically suppressed during dither
// fadeout, because a fading character no longer writes reliable depth.

export const DEFAULT_CONTACT_SHADOW_SETTINGS = Object.freeze({
  enabled: true,
  // How strongly the contact shadow darkens the cel band. 0 disables.
  strength: 0.5,
  // Face uses the head-up direction blend so hair shadows drape downward even
  // when the light comes from the side. 0 = always use the light direction.
  faceHeadUpBlend: 0,
  // Face receives a separate (usually lower) strength; hair-on-forehead is the
  // main use case, so it defaults on but softer than the body.
  faceStrength: 0.4,
  fadeRange: 1,
  thresholdOffset: 0,
  // Screen-space sample distance, relative to the shared depth-effect width.
  width: 1,
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

function normalizeContactShadowOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') {
    const key = options.trim().toLowerCase();
    return { enabled: key !== 'off' && key !== 'none' && key !== 'false' && key !== '0' };
  }
  return options || {};
}

export function createContactShadowSettings(options = null) {
  const source = normalizeContactShadowOptions(options);
  const enabled = source.enabled !== false;

  return {
    enabled,
    faceHeadUpBlend: numberOption(
      firstDefined(source, ['faceHeadUpBlend', 'faceFixedDirection']),
      DEFAULT_CONTACT_SHADOW_SETTINGS.faceHeadUpBlend,
      { min: 0, max: 1 },
    ),
    faceStrength: enabled
      ? numberOption(
        firstDefined(source, ['faceStrength', 'faceContactShadowStrength']),
        DEFAULT_CONTACT_SHADOW_SETTINGS.faceStrength,
        { min: 0, max: 1 },
      )
      : 0,
    fadeRange: numberOption(
      firstDefined(source, ['fadeRange', 'softness']),
      DEFAULT_CONTACT_SHADOW_SETTINGS.fadeRange,
      { min: 0.01, max: 20 },
    ),
    strength: enabled
      ? numberOption(
        firstDefined(source, ['strength', 'intensity', 'usage']),
        DEFAULT_CONTACT_SHADOW_SETTINGS.strength,
        { min: 0, max: 1 },
      )
      : 0,
    thresholdOffset: numberOption(
      firstDefined(source, ['thresholdOffset', 'depthThresholdOffset']),
      DEFAULT_CONTACT_SHADOW_SETTINGS.thresholdOffset,
      { min: -0.05, max: 1 },
    ),
    width: numberOption(
      firstDefined(source, ['width', 'contactShadowWidth']),
      DEFAULT_CONTACT_SHADOW_SETTINGS.width,
      { min: 0, max: 8 },
    ),
  };
}

export function resolveContactShadowForMaterial(settings, {
  isEye = false,
  isFace = false,
  isOutline = false,
} = {}) {
  // Eyes are drawn slightly proud of the face surface, so contact shadow
  // reads as dirt on them; keep them clean like the eye scene-shadow default.
  let strength = settings.strength;
  if (isFace) strength = settings.faceStrength;
  if (isEye || isOutline) strength = 0;

  return {
    enabled: settings.enabled && strength > 0,
    faceHeadUpBlend: settings.faceHeadUpBlend,
    fadeRange: settings.fadeRange,
    strength,
    thresholdOffset: settings.thresholdOffset,
    width: settings.width,
  };
}
