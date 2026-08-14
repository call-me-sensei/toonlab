import { Vector3 } from 'three';

const DEFAULT_LOD_NAME_PATTERN = /(?:^|[_\s.-])LOD[_\s.-]?(\d+)(?:$|[_\s.-])/iu;

function finiteLevel(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function authoredLevel(object, namePattern) {
  const metadataLevel = finiteLevel(object?.userData?.toonlabLodLevel);
  if (metadataLevel !== null) return metadataLevel;
  const match = String(object?.name ?? '').match(namePattern);
  return finiteLevel(match?.[1]);
}

/** Find meshes participating in an authored catalog LOD group. */
export function collectCatalogLodBindings(root, {
  namePattern = DEFAULT_LOD_NAME_PATTERN,
} = {}) {
  if (!root?.traverse) throw new TypeError('Catalog LOD root must be an Object3D.');
  const bindings = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const level = authoredLevel(object, namePattern);
    if (level === null) return;
    bindings.push(Object.freeze({
      level,
      mesh: object,
      originalVisible: object.visible,
    }));
  });
  return Object.freeze(bindings);
}

export function normalizeCatalogLodDistances(distances, levelCount = null) {
  const source = Array.isArray(distances) ? distances : [];
  const normalized = [];
  for (let index = 0; index < source.length; index += 1) {
    const value = Number(source[index]);
    if (!Number.isFinite(value) || value < 0) continue;
    normalized.push(index === 0 ? 0 : Math.max(value, normalized.at(-1) ?? 0));
  }
  if (normalized.length === 0) normalized.push(0);
  const wanted = Math.max(Number(levelCount) || normalized.length, 1);
  while (normalized.length < wanted) {
    const last = normalized.at(-1) ?? 0;
    const previous = normalized.at(-2) ?? 0;
    normalized.push(last + Math.max(last - previous, 40));
  }
  return Object.freeze(normalized);
}

/** Resolve the authored level with deterministic fallback for missing meshes. */
export function selectCatalogLodLevel({
  availableLevels,
  distance,
  distances,
  maxLevel = Number.POSITIVE_INFINITY,
} = {}) {
  const available = [...new Set((availableLevels ?? []).map(finiteLevel).filter((v) => v !== null))]
    .sort((left, right) => left - right);
  if (available.length === 0) return null;
  const thresholds = normalizeCatalogLodDistances(distances, available.at(-1) + 1);
  const finiteDistance = Math.max(Number(distance) || 0, 0);
  let requested = 0;
  for (let level = 1; level < thresholds.length; level += 1) {
    if (finiteDistance >= thresholds[level]) requested = level;
  }
  requested = Math.min(requested, Math.max(Number(maxLevel) || 0, 0));
  const lower = available.filter((level) => level <= requested).at(-1);
  return lower ?? available[0];
}

/**
 * Authored, renderer-independent LOD controller. The host calls update() with
 * either a direct distance or a camera. World scale is removed from camera
 * distance so a uniformly enlarged landmark changes LOD at proportional range.
 */
export function createCatalogLodRuntime(root, {
  distances = [0, 45, 120],
  maxLevel = Number.POSITIVE_INFINITY,
  namePattern = DEFAULT_LOD_NAME_PATTERN,
} = {}) {
  const bindings = collectCatalogLodBindings(root, { namePattern });
  const availableLevels = Object.freeze(
    [...new Set(bindings.map((binding) => binding.level))].sort((a, b) => a - b),
  );
  const thresholds = normalizeCatalogLodDistances(distances, availableLevels.at(-1) + 1);
  const worldPosition = new Vector3();
  const worldScale = new Vector3();
  let currentLevel = null;
  let disposed = false;

  function setLevel(level) {
    if (disposed || level === null || !availableLevels.includes(level)) return false;
    if (currentLevel === level) return false;
    bindings.forEach((binding) => {
      binding.mesh.visible = binding.level === level;
    });
    currentLevel = level;
    return true;
  }

  function resolveDistance({ camera = null, distance = null } = {}) {
    if (Number.isFinite(distance)) return Math.max(distance, 0);
    if (!camera?.getWorldPosition && !camera?.position) {
      throw new TypeError('Catalog LOD update requires distance or camera.');
    }
    root.updateWorldMatrix?.(true, false);
    root.getWorldPosition(worldPosition);
    root.getWorldScale(worldScale);
    const cameraPosition = camera.getWorldPosition
      ? camera.getWorldPosition(new Vector3())
      : camera.position;
    const scale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z), 0.001);
    return worldPosition.distanceTo(cameraPosition) / scale;
  }

  function update(options = {}) {
    if (disposed || availableLevels.length === 0) return null;
    const distance = resolveDistance(options);
    const level = selectCatalogLodLevel({
      availableLevels,
      distance,
      distances: thresholds,
      maxLevel,
    });
    const changed = setLevel(level);
    return Object.freeze({ changed, distance, level });
  }

  if (availableLevels.length > 0) setLevel(availableLevels[0]);

  return Object.freeze({
    availableLevels,
    bindings,
    dispose() {
      if (disposed) return;
      disposed = true;
      bindings.forEach((binding) => { binding.mesh.visible = binding.originalVisible; });
      currentLevel = null;
    },
    get disposed() { return disposed; },
    get level() { return currentLevel; },
    setLevel,
    thresholds,
    update,
  });
}
