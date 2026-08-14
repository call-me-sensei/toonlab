// Procedural glitter sparkles.
//
// Splits UV space into cells, gives each cell one particle with a random
// orientation, and lights it with a tight reflection lobe — sparkles wink in
// and out as the view or light moves. Entirely ALU (no textures), but the 3x3
// neighbor loop is not free, so the whole path compiles out unless enabled.

export const DEFAULT_GLITTER_SETTINGS = Object.freeze({
  enabled: false,
  intensity: 1,
  // Cells per UV unit (scaled x1000 internally like typical glitter shaders).
  density: 1,
  size: 1,
  // 0 = particles aligned to the surface, 1 = fully random orientation.
  randomNormalStrength: 0.5,
  // How much glitter survives inside the cel shadow band.
  showInShadowArea: 0.15,
  // UV channel: 0 = uv, 1 = uv2 (unique/non-overlapping UVs sparkle best).
  uvChannel: 1,
  // Role gates: sparkly costumes are the normal use; organic parts stay clean.
  defaultIntensity: 1,
  eyeIntensity: 0,
  faceIntensity: 0,
  hairIntensity: 0,
  skinIntensity: 0,
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

function normalizeGlitterOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') {
    const key = options.trim().toLowerCase();
    return { enabled: key !== 'off' && key !== 'none' && key !== 'false' && key !== '0' };
  }
  return options || {};
}

export function createGlitterSettings(options = null) {
  const source = normalizeGlitterOptions(options);
  const enabled = source.enabled === true;

  return {
    enabled,
    intensity: numberOption(firstDefined(source, ['intensity', 'brightness']), DEFAULT_GLITTER_SETTINGS.intensity, { min: 0, max: 8 }),
    density: numberOption(firstDefined(source, ['density']), DEFAULT_GLITTER_SETTINGS.density, { min: 0.01, max: 8 }),
    size: numberOption(firstDefined(source, ['size', 'particleSize']), DEFAULT_GLITTER_SETTINGS.size, { min: 0.05, max: 4 }),
    randomNormalStrength: numberOption(
      firstDefined(source, ['randomNormalStrength', 'randomness']),
      DEFAULT_GLITTER_SETTINGS.randomNormalStrength,
      { min: 0, max: 1 },
    ),
    showInShadowArea: numberOption(
      firstDefined(source, ['showInShadowArea', 'shadowVisibility']),
      DEFAULT_GLITTER_SETTINGS.showInShadowArea,
      { min: 0, max: 1 },
    ),
    uvChannel: numberOption(firstDefined(source, ['uvChannel']), DEFAULT_GLITTER_SETTINGS.uvChannel, { min: 0, max: 1 }) >= 0.5 ? 1 : 0,
    defaultIntensity: numberOption(firstDefined(source, ['defaultIntensity']), DEFAULT_GLITTER_SETTINGS.defaultIntensity, { min: 0, max: 8 }),
    eyeIntensity: numberOption(firstDefined(source, ['eyeIntensity']), DEFAULT_GLITTER_SETTINGS.eyeIntensity, { min: 0, max: 8 }),
    faceIntensity: numberOption(firstDefined(source, ['faceIntensity']), DEFAULT_GLITTER_SETTINGS.faceIntensity, { min: 0, max: 8 }),
    hairIntensity: numberOption(firstDefined(source, ['hairIntensity']), DEFAULT_GLITTER_SETTINGS.hairIntensity, { min: 0, max: 8 }),
    skinIntensity: numberOption(firstDefined(source, ['skinIntensity']), DEFAULT_GLITTER_SETTINGS.skinIntensity, { min: 0, max: 8 }),
  };
}

export function resolveGlitterForMaterial(settings, {
  isEye = false,
  isFace = false,
  isHair = false,
  isOutline = false,
  isSkin = false,
} = {}) {
  let roleIntensity = settings.defaultIntensity;
  if (isEye) roleIntensity = settings.eyeIntensity;
  else if (isFace) roleIntensity = settings.faceIntensity;
  else if (isSkin) roleIntensity = settings.skinIntensity;
  else if (isHair) roleIntensity = settings.hairIntensity;

  const intensity = settings.intensity * roleIntensity;
  return {
    density: settings.density,
    enabled: settings.enabled && !isOutline && intensity > 0,
    intensity,
    randomNormalStrength: settings.randomNormalStrength,
    showInShadowArea: settings.showInShadowArea,
    size: settings.size,
    uvChannel: settings.uvChannel,
  };
}
