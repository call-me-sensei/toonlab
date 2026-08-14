import * as THREE from 'three';

export const TREE_SURFACE_TEXTURE_VERSION = 1;

export const TREE_SURFACE_PROFILES = Object.freeze({
  'call-me-sensei-bark-v1': Object.freeze({
    id: 'call-me-sensei-bark-v1',
    label: 'Call Me Sensei fissured bark',
    shader: Object.freeze({
      bandSoftness: 0.08,
      shadowFloor: 0.48,
      skyFillStrength: 0.06,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.5, 1]),
  }),
  'oak-fissured-v1': Object.freeze({
    id: 'oak-fissured-v1',
    label: 'Stylized fissured oak',
    shader: Object.freeze({
      bandSoftness: 0.08,
      shadowFloor: 0.48,
      skyFillStrength: 0.06,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.5, 1]),
  }),
  'bamboo-waxy-v1': Object.freeze({
    id: 'bamboo-waxy-v1',
    label: 'Stylized waxy bamboo culm',
    shader: Object.freeze({
      bandSoftness: 0.1,
      shadowFloor: 0.52,
      skyFillStrength: 0.075,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1, 1]),
  }),
  'yucca-fibrous-v1': Object.freeze({
    id: 'yucca-fibrous-v1',
    label: 'Stylized fibrous Joshua tree',
    shader: Object.freeze({
      bandSoftness: 0.075,
      shadowFloor: 0.46,
      skyFillStrength: 0.055,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.8, 0.85]),
  }),
  'saguaro-waxy-v1': Object.freeze({
    id: 'saguaro-waxy-v1',
    label: 'Stylized waxy saguaro epidermis',
    shader: Object.freeze({
      bandSoftness: 0.085,
      shadowFloor: 0.62,
      skyFillStrength: 0.085,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1, 0.7]),
  }),
});

export const TREE_SURFACE_PROFILE_DEFAULTS = Object.freeze({
  call_me_sensei: 'call-me-sensei-bark-v1',
});

export function getTreeSurfaceProfileOptions() {
  return Object.values(TREE_SURFACE_PROFILES).map(({ id, label }) => ({
    id,
    label,
    value: id,
  }));
}

const SURFACE_PROFILE_BY_SPECIES = Object.freeze({
  // Start with one reference species. Additional species only move onto a
  // generated surface after this restrained treatment passes live and export
  // review; sharing a genus is not sufficient evidence by itself.
  'quercus-robur': 'oak-fissured-v1',
  'phyllostachys-edulis': 'bamboo-waxy-v1',
  'yucca-brevifolia': 'yucca-fibrous-v1',
  'carnegiea-gigantea': 'saguaro-waxy-v1',
});

const textureCache = new Map();

function hash2d(x, y, seed) {
  let value = (Math.imul(x + 1, 374761393)
    ^ Math.imul(y + 1, 668265263)
    ^ Math.imul(seed + 1, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function periodicValueNoise(x, y, periodX, periodY, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const sample = (px, py) => hash2d(
    ((px % periodX) + periodX) % periodX,
    ((py % periodY) + periodY) % periodY,
    seed,
  );
  const a = sample(x0, y0);
  const b = sample(x0 + 1, y0);
  const c = sample(x0, y0 + 1);
  const d = sample(x0 + 1, y0 + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, tx),
    THREE.MathUtils.lerp(c, d, tx),
    ty,
  );
}

function quantize(value, steps) {
  return Math.round(THREE.MathUtils.clamp(value, 0, 1) * (steps - 1))
    / Math.max(steps - 1, 1);
}

function oakFissuredPixel(u, v, seed) {
  // Large vertical plates and a small number of cross-breaks carry the
  // silhouette-scale bark read. Fine photographic pores are intentionally
  // omitted so the result stays compatible with ToonLab's broad color bands.
  const broadNoise = periodicValueNoise(u * 5, v * 5, 5, 5, seed);
  const warp = (broadNoise - 0.5) * 0.36 + Math.sin(v * Math.PI * 4) * 0.035;
  const ridgeCoordinate = u * 11 + warp;
  const ridgePhase = Math.abs((ridgeCoordinate - Math.floor(ridgeCoordinate)) - 0.5) * 2;
  const fissure = 1 - THREE.MathUtils.smoothstep(ridgePhase, 0.08, 0.2);

  const breakNoise = periodicValueNoise(u * 7, v * 7, 7, 7, seed + 17);
  const horizontalCoordinate = v * 3 + (breakNoise - 0.5) * 0.62;
  const horizontalPhase = Math.abs(
    (horizontalCoordinate - Math.floor(horizontalCoordinate)) - 0.5,
  ) * 2;
  const crossBreak = (1 - THREE.MathUtils.smoothstep(horizontalPhase, 0.035, 0.11))
    * THREE.MathUtils.smoothstep(broadNoise, 0.44, 0.72);

  const plateNoise = periodicValueNoise(u * 11, v * 11, 11, 11, seed + 31);
  const plateTone = quantize(0.38 + broadNoise * 0.34 + plateNoise * 0.18, 5);
  const shade = THREE.MathUtils.clamp(
    0.78 + plateTone * 0.35 - fissure * 0.18 - crossBreak * 0.05,
    0.58,
    1.03,
  );
  const warmLift = quantize(periodicValueNoise(u * 3, v * 3, 3, 3, seed + 53), 4);
  return [
    (0.7 + warmLift * 0.065) * shade,
    (0.54 + warmLift * 0.035) * shade,
    (0.39 + warmLift * 0.02) * shade,
  ];
}

function bambooWaxyPixel(u, v, seed) {
  // Moso culms read as smooth gray-green cylinders with restrained vertical
  // striation and irregular wax bloom. Nodes remain semantic ring geometry;
  // they are deliberately not painted into this tile so internode length can
  // vary without duplicated fake joints.
  const broad = periodicValueNoise(u * 5, v * 3, 5, 3, seed + 71);
  const streakWarp = (broad - 0.5) * 0.18;
  const streakPhase = (
    Math.sin((u * 9 + streakWarp) * Math.PI * 2) * 0.5 + 0.5
  );
  const wax = quantize(
    periodicValueNoise(u * 7, v * 7, 7, 7, seed + 89),
    5,
  );
  const ageMottle = quantize(
    periodicValueNoise(u * 3, v * 4, 3, 4, seed + 107),
    4,
  );
  const shade = THREE.MathUtils.clamp(
    0.82 + broad * 0.12 + streakPhase * 0.035 + wax * 0.045,
    0.78,
    1.03,
  );
  return [
    (0.43 + ageMottle * 0.055) * shade,
    (0.57 + wax * 0.055) * shade,
    (0.43 + wax * 0.035) * shade,
  ];
}

function yuccaFibrousPixel(u, v, seed) {
  // Joshua bark is built from coarse, persistent leaf-base fibers. Use a
  // restrained vertical weave plus sparse horizontal scars; no vendor or
  // photographic texture pixels are sampled. Quantized values keep the
  // pattern compatible with ToonLab's broad stylized light bands.
  const broad = periodicValueNoise(u * 5, v * 6, 5, 6, seed + 131);
  const warp = (broad - 0.5) * 0.34
    + Math.sin(v * Math.PI * 5) * 0.025;
  const strand = Math.sin((u * 19 + warp) * Math.PI * 2) * 0.5 + 0.5;
  const secondary = Math.sin((u * 31 - warp * 0.6) * Math.PI * 2) * 0.5 + 0.5;
  const scarNoise = periodicValueNoise(u * 7, v * 7, 7, 7, seed + 149);
  const scarPhase = Math.abs(
    ((v * 8 + (scarNoise - 0.5) * 0.42) % 1 + 1) % 1 - 0.5,
  ) * 2;
  const leafScar = 1 - THREE.MathUtils.smoothstep(scarPhase, 0.05, 0.14);
  const tone = quantize(
    0.42 + broad * 0.24 + strand * 0.2 + secondary * 0.07 - leafScar * 0.09,
    6,
  );
  const shade = THREE.MathUtils.clamp(0.68 + tone * 0.46, 0.62, 1.04);
  return [
    (0.53 + broad * 0.055) * shade,
    (0.44 + broad * 0.04) * shade,
    (0.31 + broad * 0.025) * shade,
  ];
}

function saguaroWaxyPixel(u, v, seed) {
  // The ribs are real geometry; this tile supplies only the restrained wax
  // bloom, age mottling, and faint vertical water streaks visible between
  // them. It is generated from noise and bands, never sampled from the NPS,
  // botanical-reference or third-party reference pixels.
  const broad = periodicValueNoise(u * 4, v * 5, 4, 5, seed + 173);
  const bloom = quantize(
    periodicValueNoise(u * 7, v * 7, 7, 7, seed + 191),
    5,
  );
  const streakWarp = (broad - 0.5) * 0.15;
  const streak = Math.sin((u * 13 + streakWarp) * Math.PI * 2) * 0.5 + 0.5;
  const ageBand = quantize(
    periodicValueNoise(u * 3, v * 4, 3, 4, seed + 211),
    4,
  );
  const shade = THREE.MathUtils.clamp(
    0.82 + broad * 0.12 + bloom * 0.055 - streak * 0.025,
    0.78,
    1.02,
  );
  return [
    (0.34 + ageBand * 0.045) * shade,
    (0.6 + bloom * 0.06) * shade,
    (0.4 + bloom * 0.04) * shade,
  ];
}

function surfacePixel(profileId, u, v, seed) {
  if (profileId === 'call-me-sensei-bark-v1' || profileId === 'oak-fissured-v1') {
    return oakFissuredPixel(u, v, seed);
  }
  if (profileId === 'bamboo-waxy-v1') return bambooWaxyPixel(u, v, seed);
  if (profileId === 'yucca-fibrous-v1') return yuccaFibrousPixel(u, v, seed);
  if (profileId === 'saguaro-waxy-v1') return saguaroWaxyPixel(u, v, seed);
  throw new Error(`No surface generator registered for "${profileId}".`);
}

export function treeSurfaceProfileId(speciesProfileOrId) {
  const id = typeof speciesProfileOrId === 'string'
    ? speciesProfileOrId
    : speciesProfileOrId?.id;
  return SURFACE_PROFILE_BY_SPECIES[id] ?? null;
}

export function treeSurfaceProfile(speciesProfileOrId) {
  const profileId = treeSurfaceProfileId(speciesProfileOrId);
  return profileId ? TREE_SURFACE_PROFILES[profileId] : null;
}

export function createTreeSurfaceTextureData({
  profileId,
  resolution = 128,
  seed = 1,
} = {}) {
  if (!TREE_SURFACE_PROFILES[profileId]) {
    throw new Error(`Unknown tree surface profile "${profileId}".`);
  }
  const width = Math.max(16, Math.round(resolution));
  const height = width * 2;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const color = surfacePixel(profileId, u, v, seed);
      const offset = (y * width + x) * 4;
      data[offset] = Math.round(THREE.MathUtils.clamp(color[0], 0, 1) * 255);
      data[offset + 1] = Math.round(THREE.MathUtils.clamp(color[1], 0, 1) * 255);
      data[offset + 2] = Math.round(THREE.MathUtils.clamp(color[2], 0, 1) * 255);
      data[offset + 3] = 255;
    }
  }
  return Object.freeze({
    data,
    height,
    profileId,
    seed,
    version: TREE_SURFACE_TEXTURE_VERSION,
    width,
  });
}

export function createTreeSurfaceTexture({
  profileId,
  resolution = 128,
  seed = 1,
} = {}) {
  const cacheKey = `${profileId}:${resolution}:${seed}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const generated = createTreeSurfaceTextureData({ profileId, resolution, seed });
  const texture = new THREE.DataTexture(
    generated.data,
    generated.width,
    generated.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `ToonLabTreeSurface.${profileId}.${seed}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const uvRepeat = TREE_SURFACE_PROFILES[profileId].uvRepeat ?? [1, 1];
  texture.repeat.set(uvRepeat[0], uvRepeat[1]);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.userData = {
    generatedBy: 'toonlab/tree-surface-texture',
    profileId,
    seed,
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
  };
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

export function treeSurfaceTextureForSpecies(speciesProfileOrId, options = {}) {
  const profileId = treeSurfaceProfileId(speciesProfileOrId);
  return profileId ? createTreeSurfaceTexture({ ...options, profileId }) : null;
}
