// Deterministic placement scatter helpers. Import from
// '@call-me-sensei/toonlab/vegetation'.
//
// Hosts stop authoring placement logic by hand: these produce plain
// `{ x, y, z }` placement arrays (plus a per-item `seed` for trees) ready for
// StylizedGrassField/StylizedFlowerField `placements` and StylizedTree
// construction. Everything is seeded and dependency-free — the same inputs
// always yield the same world, which keeps captures and multiplayer
// deterministic. Depends only on a host-supplied `heightAt(x, z)` terrain
// sampler; without one, placements land at y = 0.
//
// World units are meters (see docs/world-scale.md).

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placementY(heightAt, x, z) {
  if (typeof heightAt !== 'function') return 0;
  const y = Number(heightAt(x, z));
  return Number.isFinite(y) ? y : 0;
}

function passesMask(mask, x, z) {
  return typeof mask === 'function' ? Boolean(mask(x, z)) : true;
}

/**
 * Mask factory: rejects points where the terrain slope exceeds `maxSlope`
 * (rise over run, so 0.6 ≈ 31°). Slope is estimated from `heightAt` with
 * central differences at `sampleDistance`.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createSlopeMask({ heightAt, maxSlope = 0.6, sampleDistance = 0.5 } = {}) {
  if (typeof heightAt !== 'function') return () => true;
  const step = Math.max(Number(sampleDistance) || 0.5, 0.01);
  const limit = Math.max(Number(maxSlope) || 0, 0);
  return (x, z) => {
    const dx = (placementY(heightAt, x + step, z) - placementY(heightAt, x - step, z)) / (2 * step);
    const dz = (placementY(heightAt, x, z + step) - placementY(heightAt, x, z - step)) / (2 * step);
    return Math.hypot(dx, dz) <= limit;
  };
}

/**
 * Mask factory: keeps only terrain whose authored/procedural surface weight
 * reaches `threshold`. Use a grass/meadow weight sampler here so dirt paths,
 * painted rock, cliff masks, and other excluded materials do not receive
 * vegetation even when they share the same height field.
 *
 * The sampler should return a normalized 0..1 weight. Because it is evaluated
 * when scatter is rebuilt, terrain painting or procedural layer changes do
 * not require hand-removing individual grass instances.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createSurfaceWeightMask({
  weightAt,
  threshold = 0.4,
} = {}) {
  if (typeof weightAt !== 'function') return () => true;
  const minimum = Math.min(Math.max(Number(threshold) || 0, 0), 1);
  return (x, z) => {
    const weight = Number(weightAt(x, z));
    return Number.isFinite(weight) && weight > minimum;
  };
}

/**
 * Mask factory: rejects points at or below the water line (terrain height
 * under `waterLevel + margin`), so grass and trees stay out of lakes and
 * surf. Pair `waterLevel` with the WaterSurface's world y position.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createWaterMask({ heightAt, waterLevel = 0, margin = 0.15 } = {}) {
  if (typeof heightAt !== 'function') return () => true;
  const threshold = (Number(waterLevel) || 0) + (Number(margin) || 0);
  return (x, z) => placementY(heightAt, x, z) > threshold;
}

/** Combines mask functions; a point must pass every mask. */
export function combineMasks(...masks) {
  const active = masks.filter((mask) => typeof mask === 'function');
  return (x, z) => active.every((mask) => mask(x, z));
}

/**
 * Uniform scatter inside an axis-aligned rectangle. The generic primitive
 * behind scatterGrassAround/scatterForest — use it directly for custom
 * regions.
 *
 * @param {Object} options
 * @param {{x: number, z: number}} options.min Rectangle corner.
 * @param {{x: number, z: number}} options.max Opposite corner.
 * @param {number} [options.count] Number of placements to attempt.
 * @param {number} [options.seed] Deterministic seed.
 * @param {number} [options.minSpacing] Reject points closer than this (m).
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter.
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function scatterInRect({
  min = { x: -10, z: -10 },
  max = { x: 10, z: 10 },
  count = 100,
  seed = 1,
  minSpacing = 0,
  heightAt = null,
  mask = null,
} = {}) {
  const random = mulberry32(seed);
  const spacing = Math.max(Number(minSpacing) || 0, 0);
  const cell = spacing > 0 ? spacing : Infinity;
  const occupied = new Map();
  const placements = [];
  const attempts = Math.max(Math.trunc(count) || 0, 0) * (spacing > 0 ? 6 : 1);
  const spacingSq = spacing * spacing;

  const isFree = (x, z) => {
    if (spacing <= 0) return true;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
      for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
        const bucket = occupied.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const p of bucket) {
          const dx = p.x - x;
          const dz = p.z - z;
          if (dx * dx + dz * dz < spacingSq) return false;
        }
      }
    }
    return true;
  };

  for (let i = 0; i < attempts && placements.length < count; i += 1) {
    const x = min.x + (max.x - min.x) * random();
    const z = min.z + (max.z - min.z) * random();
    if (!passesMask(mask, x, z) || !isFree(x, z)) continue;
    const placement = { x, y: placementY(heightAt, x, z), z };
    placements.push(placement);
    if (spacing > 0) {
      const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
      const bucket = occupied.get(key);
      if (bucket) bucket.push(placement);
      else occupied.set(key, [placement]);
    }
  }
  return placements;
}

/**
 * Grass placements in a disc around a point (or an Object3D — the character,
 * a camp, a POI). Density-based, so the same call reads correctly at any
 * radius:
 *
 *   const grass = new StylizedGrassField({
 *     placements: scatterGrassAround({ center: spawn, radius: 30, density: 12, heightAt, mask }),
 *   });
 *
 * @param {Object} options
 * @param {{x: number, z: number}|{position: {x: number, z: number}}} [options.center]
 *   Point or Object3D-like (its `.position` is read once, at call time).
 * @param {number} [options.radius] Disc radius in meters.
 * @param {number} [options.density] Blades per square meter.
 * @param {number} [options.seed]
 * @param {number} [options.maxCount] Safety cap on placement count.
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter.
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function scatterGrassAround({
  center = { x: 0, z: 0 },
  radius = 12,
  density = 8,
  seed = 1,
  maxCount = 60000,
  heightAt = null,
  mask = null,
} = {}) {
  const origin = center?.position ?? center ?? { x: 0, z: 0 };
  const r = Math.max(Number(radius) || 0, 0);
  const random = mulberry32(seed);
  const target = Math.min(Math.round((Number(density) || 0) * Math.PI * r * r), Math.max(maxCount, 0));
  const placements = [];
  let attempts = target * 4;
  while (placements.length < target && attempts > 0) {
    attempts -= 1;
    // sqrt keeps the disc uniform instead of center-clumped
    const distance = r * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const x = (Number(origin.x) || 0) + Math.cos(angle) * distance;
    const z = (Number(origin.z) || 0) + Math.sin(angle) * distance;
    if (!passesMask(mask, x, z)) continue;
    placements.push({ x, y: placementY(heightAt, x, z), z });
  }
  return placements;
}

/**
 * Tree placements in a disc: a jittered grid at `spacing` meters, so trees
 * never clump unnaturally and density stays predictable (one candidate per
 * grid cell). Each placement carries a deterministic per-tree `seed` to pass
 * straight to StylizedTree for silhouette variation:
 *
 *   for (const p of scatterForest({ center, radius: 80, spacing: 9, heightAt, mask })) {
 *     const tree = new StylizedTree({ preset: 'call_me_sensei', seed: p.seed, size: 3.2 });
 *     tree.position.set(p.x, p.y, p.z);
 *     scene.add(tree);
 *   }
 *
 * @param {Object} options
 * @param {{x: number, z: number}|{position: {x: number, z: number}}} [options.center]
 * @param {number} [options.radius] Disc radius in meters.
 * @param {number} [options.spacing] Grid spacing in meters (≈ average tree distance).
 * @param {number} [options.jitter] 0..1 of spacing each tree may wander off-grid.
 * @param {number} [options.keepChance] 0..1 chance a cell spawns at all (thins the forest).
 * @param {number} [options.seed]
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter.
 * @returns {Array<{x: number, y: number, z: number, seed: number}>}
 */
export function scatterForest({
  center = { x: 0, z: 0 },
  radius = 60,
  spacing = 9,
  jitter = 0.45,
  keepChance = 1,
  seed = 1,
  heightAt = null,
  mask = null,
} = {}) {
  const origin = center?.position ?? center ?? { x: 0, z: 0 };
  const originX = Number(origin.x) || 0;
  const originZ = Number(origin.z) || 0;
  const r = Math.max(Number(radius) || 0, 0);
  const step = Math.max(Number(spacing) || 1, 0.1);
  const wander = Math.min(Math.max(Number(jitter) || 0, 0), 1) * step;
  const keep = Math.min(Math.max(Number(keepChance) ?? 1, 0), 1);
  const radiusSq = r * r;
  const placements = [];
  const cells = Math.ceil(r / step);
  for (let ix = -cells; ix <= cells; ix += 1) {
    for (let iz = -cells; iz <= cells; iz += 1) {
      // one RNG stream per cell keeps the forest stable when the radius grows
      const random = mulberry32(seed * 73856093 + ix * 19349663 + iz * 83492791);
      if (random() > keep) continue;
      const x = originX + ix * step + (random() - 0.5) * 2 * wander;
      const z = originZ + iz * step + (random() - 0.5) * 2 * wander;
      const dx = x - originX;
      const dz = z - originZ;
      if (dx * dx + dz * dz > radiusSq) continue;
      if (!passesMask(mask, x, z)) continue;
      placements.push({
        seed: Math.floor(random() * 0xffffffff),
        x,
        y: placementY(heightAt, x, z),
        z,
      });
    }
  }
  return placements;
}

/**
 * Mask factory: organic patches from seeded value noise — the standard way
 * to cluster forests, meadows, or rock fields instead of uniform sprinkling
 * (uniform scatter reads as confetti from any aerial camera). Threshold
 * controls coverage: 0.5 ≈ half the map in patches, 0.6 ≈ sparse islands.
 *
 *   const forestMask = createNoisePatchMask({ seed: 7, scale: 0.004, threshold: 0.52 });
 *   scatterForest({
 *     ...,
 *     mask: combineMasks(forestMask, surfaceWeightMask, slopeMask, waterMask),
 *   });
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createNoisePatchMask({ seed = 1, scale = 0.004, threshold = 0.55, octaves = 3 } = {}) {
  const cell = (ix, iz) => {
    let h = (ix * 374761393 + iz * 668265263 + Math.trunc(seed) * 971) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = cell(ix, iz);
    const b = cell(ix + 1, iz);
    const c = cell(ix, iz + 1);
    const d = cell(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
  const freq = Math.max(Number(scale) || 0.004, 1e-6);
  const steps = Math.max(Math.trunc(octaves) || 3, 1);
  const limit = Number(threshold) || 0.55;
  return (x, z) => {
    let amplitude = 0.5;
    let frequency = freq;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < steps; i += 1) {
      sum += amplitude * noise(x * frequency, z * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / norm > limit;
  };
}
