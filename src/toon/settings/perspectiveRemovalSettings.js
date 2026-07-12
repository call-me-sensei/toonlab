// Perspective removal (portrait flattening).
//
// Re-divides the clip-space XY of vertices near the character's head by the
// head center's view depth instead of their own W, progressively removing
// perspective distortion in closeups — the anime-portrait "long lens" look
// without moving the camera. Masked by a sphere around the tracked head bone
// and a world-height fade so feet stay grounded in true perspective.
//
// Requires the runtime head tracker (characterRenderPasses); inert otherwise.
// Note: extreme amounts can confuse CPU frustum culling because the GPU moves
// vertices the CPU cannot see — character meshes in this project already
// disable frustum culling, so this is safe here.

export const DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS = Object.freeze({
  amount: 0,
  enabled: false,
  // Sphere radius (meters) around the head bone that receives the effect.
  radius: 1.4,
  // World-height fade: 0 at startHeight, full at endHeight.
  startHeight: 0,
  endHeight: 1,
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

function normalizePerspectiveRemovalOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'number') return { amount: options, enabled: options > 0 };
  return options || {};
}

export function createPerspectiveRemovalSettings(options = null) {
  const source = normalizePerspectiveRemovalOptions(options);
  const requestedAmount = numberOption(
    firstDefined(source, ['amount', 'strength', 'perspectiveRemovalAmount']),
    DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS.amount,
    { min: 0, max: 1 },
  );
  const enabled = source.enabled === true || (source.enabled !== false && requestedAmount > 0);

  return {
    amount: enabled ? requestedAmount : 0,
    enabled: enabled && requestedAmount > 0,
    endHeight: numberOption(firstDefined(source, ['endHeight']), DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS.endHeight, { min: -100, max: 1000 }),
    radius: numberOption(firstDefined(source, ['radius']), DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS.radius, { min: 0.05, max: 50 }),
    startHeight: numberOption(firstDefined(source, ['startHeight']), DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS.startHeight, { min: -100, max: 1000 }),
  };
}
