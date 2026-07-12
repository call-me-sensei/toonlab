import * as THREE from 'three';

// Seeded stylized-terrain generator. Import from '@call-me-sensei/toonlab'.
//
// The randomization contract: ANY seed yields a valid, playable world.
// Nothing in here is tuned to one seed — the pieces that were hand-picked
// in early demos are all derived at generation time:
//
//  - The waterline is solved from the height histogram: `waterCoverage:
//    0.35` puts 35% of the playable area under water for any seed, instead
//    of tuning noise amplitudes against a fixed water level.
//  - Paint bands (rock-by-height, snow line, golden fields) are fractions
//    of the observed relief, not absolute meters.
//  - The spawn is found by probing (walkable slope, near a shore, open
//    sightlines), deterministically per seed, then the meadow around it is
//    flattened.
//  - Degenerate seeds (no acceptable spawn) re-roll a derived sub-seed;
//    the same input seed always resolves to the same world.
//
// Dimension knobs:
//  - `size` — playable extent in meters: a number (square) or `{ x, z }`
//    (rectangular). The mesh extends to 2× into a mountain rim.
//  - `height` (H) — mountain-range amplitude override in meters.
//  - `depth` (D) — how far basins dip below the ground datum, in meters
//    (deep lakes / room under the waterline). True underground structure
//    (caves, overhangs) is beyond a heightfield — that needs volumetric
//    terrain and is tracked separately.
//  - `floatingIslands` — `true` or `{ count, minAltitude, maxAltitude,
//    minRadius, maxRadius }`: seeded sky islands (meadow tops, tapered
//    rock undersides), returned in `islands`; each carries
//    `topAt(worldX, worldZ)` so hosts can stand trees or characters on it.
//  - `sinkholes` — `true` or `{ count, minRadius, maxRadius, depth }`:
//    seeded karst dolines, sheer-walled pits carved into the land; one cut
//    below the waterline floods into a cenote pool. Returned in
//    `sinkholes`. The spawn probe never lands in one.
//
//   const terrain = createStylizedTerrain({
//     seed: 42,
//     size: { x: 1200, z: 800 },
//     archetype: 'terracedKarst', // 'lakeland' | 'alpine' | 'rollingPlains' | 'archipelago'
//     waterCoverage: 0.35,        // ← "more water" is one knob
//     height: 220,                // ← taller mountain range
//     depth: 60,                  // ← deeper basins
//     floatingIslands: { count: 4 },
//   });
//   const world = await createStylizedWorld({
//     terrain: { heightAt: terrain.heightAt, root: terrain.root, size: terrain.meshExtent },
//     water: { level: terrain.waterLevel },
//   });
//   character.position.copy(terrain.spawn);

// Morphology + paint bundles. Amplitudes are meters; band values are
// fractions of the archetype's observed land relief above the waterline.
const TERRAIN_ARCHETYPES = new Map([
  ['terracedKarst', {
    continent: { amp: 160, bias: -0.535, freq: 0.0011 },
    label: 'Terraced Karst',
    mountains: { amp: 170, freq: 0.00076, mask: [0.47, 0.6], ridgeExp: 1.8, ridgeFreq: 0.007 },
    rim: { base: 55, ridged: 120 },
    rolling: { amp: 18, freq: 0.0036 },
    terraces: { blendOff: [0.8, 1.0], sharpness: 5, step: 20 },
    waterCoverage: 0.14,
  }],
  ['lakeland', {
    continent: { amp: 70, bias: -0.5, freq: 0.0013 },
    label: 'Lakeland',
    mountains: { amp: 60, freq: 0.0009, mask: [0.55, 0.7], ridgeExp: 1.6, ridgeFreq: 0.008 },
    rim: { base: 40, ridged: 70 },
    rolling: { amp: 14, freq: 0.004 },
    terraces: { blendOff: [0.75, 0.95], sharpness: 4, step: 12 },
    waterCoverage: 0.4,
  }],
  ['alpine', {
    continent: { amp: 130, bias: -0.5, freq: 0.001 },
    label: 'Alpine',
    mountains: { amp: 260, freq: 0.0007, mask: [0.4, 0.56], ridgeExp: 1.6, ridgeFreq: 0.006 },
    rim: { base: 80, ridged: 160 },
    rolling: { amp: 24, freq: 0.0034 },
    terraces: { blendOff: [0.55, 0.75], sharpness: 4, step: 30 },
    waterCoverage: 0.08,
  }],
  ['rollingPlains', {
    continent: { amp: 46, bias: -0.46, freq: 0.0012 },
    label: 'Rolling Plains',
    mountains: { amp: 34, freq: 0.0009, mask: [0.6, 0.75], ridgeExp: 1.5, ridgeFreq: 0.008 },
    rim: { base: 36, ridged: 60 },
    rolling: { amp: 20, freq: 0.0038 },
    terraces: null,
    waterCoverage: 0.12,
  }],
  ['archipelago', {
    continent: { amp: 110, bias: -0.62, freq: 0.0014 },
    label: 'Archipelago',
    mountains: { amp: 90, freq: 0.001, mask: [0.5, 0.66], ridgeExp: 1.7, ridgeFreq: 0.008 },
    rim: { base: 40, ridged: 90 },
    rolling: { amp: 16, freq: 0.004 },
    terraces: { blendOff: [0.7, 0.92], sharpness: 4, step: 14 },
    waterCoverage: 0.55,
  }],
]);

/** Lists terrain archetypes as `{ id, label }` (for HUDs / docs). */
export function getTerrainArchetypeOptions() {
  return Array.from(TERRAIN_ARCHETYPES.entries()).map(([id, a]) => ({ id, label: a.label }));
}

const DEFAULT_PALETTE = {
  golden: 0xd2b24c,
  haze: 0xa9c6e8,
  meadow: 0x64ad48,
  rock: 0xa7b7c6,
  sand: 0xe2d49a,
  snow: 0xe2eaf2,
};

function smoothstep(edge0, edge1, value) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Terracing is the signature of the karst look: quantize height into steps
// with steep eased walls, so hills become flat-topped mesas.
function terrace(y, step, sharpness) {
  const t = y / step;
  const base = Math.floor(t);
  const f = t - base;
  const eased = f ** sharpness / (f ** sharpness + (1 - f) ** sharpness);
  return (base + eased) * step;
}

// Seeded value-noise kit; every stream hangs off the resolved seed so the
// same seed is the same world, bit for bit.
function createNoiseKit(seed) {
  const hashCell = (ix, iz) => {
    let h = (ix * 374761393 + iz * 668265263 + seed * 971) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const valueNoise = (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = hashCell(ix, iz);
    const b = hashCell(ix + 1, iz);
    const c = hashCell(ix, iz + 1);
    const d = hashCell(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
  const fbm = (x, z, octaves = 4) => {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += amplitude * valueNoise(x * frequency, z * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / norm;
  };
  return { fbm, hashCell, valueNoise };
}

// Tiling value-noise mottling multiplied under the vertex-color biomes so
// grass and sand read as ground instead of flat paint.
function createGroundDetailTexture(kit, repeatX, repeatZ) {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const n1 = kit.valueNoise((px % size) * 0.09, (py % size) * 0.09);
      const n2 = kit.valueNoise((px % size) * 0.23 + 37, (py % size) * 0.23 + 59);
      const shade = 215 + (n1 * 0.65 + n2 * 0.35) * 40;
      const i = (py * size + px) * 4;
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatZ);
  return texture;
}

/**
 * Generates a seeded stylized heightfield world: morphology from a named
 * archetype, waterline solved from `waterCoverage`, spawn found by probing,
 * biome paint in relief-relative bands, optional floating islands. Returns
 * `{ archetype, dispose, heightAt, islands, mesh, meshExtent, resolvedSeed,
 * root, size, spawn, stats, waterLevel }`.
 */
export function createStylizedTerrain({
  seed = 1,
  size = 1000,
  archetype = 'terracedKarst',
  waterCoverage = null,           // 0..0.6; default from the archetype
  height = null,                  // H: mountain amplitude override (m)
  depth = null,                   // D: basin depth below the ground datum (m)
  floatingIslands = false,
  sinkholes = false,              // true | { count, minRadius, maxRadius, depth }
  palette = {},
  segments = 384,
  detailTexture = true,
  maxAttempts = 4,
} = {}) {
  const base = TERRAIN_ARCHETYPES.get(archetype);
  if (!base) {
    throw new Error(`Unknown terrain archetype "${archetype}" (have: ${[...TERRAIN_ARCHETYPES.keys()].join(', ')}).`);
  }
  const spec = Number.isFinite(height)
    ? { ...base, mountains: { ...base.mountains, amp: Math.max(height, 1) } }
    : base;
  const coverage = Math.min(Math.max(
    Number.isFinite(waterCoverage) ? waterCoverage : spec.waterCoverage, 0), 0.6);
  const sizeX = Number.isFinite(size?.x) ? size.x : Number(size) || 1000;
  const sizeZ = Number.isFinite(size?.z) ? size.z : sizeX;
  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;
  const meshExtent = { x: sizeX * 2, z: sizeZ * 2 };
  // Normalized elliptical distance: 1 at the playable edge, rim beyond.
  const edgeDistance = (x, z) => Math.hypot(x / halfX, z / halfZ);
  // D: scale the below-datum range. The archetype's nominal basin depth is
  // continent.amp × |bias|; `depth` remaps it.
  const nominalDepth = spec.continent.amp * Math.abs(spec.continent.bias);
  const depthScale = Number.isFinite(depth) ? Math.max(depth, 1) / nominalDepth : 1;

  // ---- attempt loop: raw morphology → waterline → spawn; re-roll a
  //      derived sub-seed if no acceptable spawn exists. ----
  let attempt = 0;
  let resolvedSeed = (Number(seed) >>> 0) || 1;
  let kit;
  let rawHeight;
  let waterLevel;
  let spawn = null;
  let landPeak = 1;
  let holes = [];

  while (attempt < maxAttempts) {
    kit = createNoiseKit(resolvedSeed);
    const { fbm } = kit;
    const { continent, mountains, rolling, rim, terraces } = spec;

    // Sinkholes (karst dolines): seeded pits with sheer carved walls — the
    // heightfield's version of underground structure. One that cuts below
    // the waterline floods into a cenote pool. The slope paint and cliff
    // decorators pick their walls up automatically. True caves/overhangs
    // need volumetric terrain and are tracked separately.
    holes = [];
    if (sinkholes) {
      const ho = typeof sinkholes === 'object' ? sinkholes : {};
      const count = Math.max(1, Math.round(ho.count ?? 3));
      const minR = ho.minRadius ?? 26;
      const maxR = ho.maxRadius ?? 52;
      for (let i = 0; i < count; i += 1) {
        holes.push({
          depth: ho.depth ?? 34 + kit.hashCell(i * 19 + 3, i * 7 + 29) * 26,
          radius: minR + (maxR - minR) * kit.hashCell(i * 11 + 1, i * 5 + 17),
          x: (kit.hashCell(i * 13 + 7, i * 3 + 2) - 0.5) * sizeX * 0.72,
          z: (kit.hashCell(i * 29 + 5, i * 23 + 11) - 0.5) * sizeZ * 0.72,
        });
      }
    }

    rawHeight = (x, z) => {
      const cont = (fbm(x * continent.freq, z * continent.freq, 4) + continent.bias) * continent.amp;
      const roll = fbm(x * rolling.freq, z * rolling.freq, 4) * rolling.amp;
      const mask = smoothstep(mountains.mask[0], mountains.mask[1],
        fbm(x * mountains.freq + 11, z * mountains.freq + 7, 3));
      const ridged = (1 - Math.abs(2 * fbm(x * mountains.ridgeFreq + 31, z * mountains.ridgeFreq + 17, 4) - 1))
        ** mountains.ridgeExp;
      let y = cont + roll + mask * ridged * mountains.amp;
      if (y < 0) y *= depthScale; // D: basins scale independently of peaks
      if (terraces && y > 2) {
        const blend = 1 - smoothstep(
          mountains.amp * terraces.blendOff[0],
          mountains.amp * terraces.blendOff[1],
          y,
        );
        y = y * (1 - blend) + terrace(y, terraces.step, terraces.sharpness) * blend;
      }
      const rimBlend = smoothstep(1.3, 1.9, edgeDistance(x, z));
      y += rimBlend * (rim.base + ridged * rim.ridged);
      for (const hole of holes) {
        const d = Math.hypot(x - hole.x, z - hole.z);
        if (d < hole.radius * 1.05) {
          y -= hole.depth * smoothstep(hole.radius, hole.radius * 0.45, d);
        }
      }
      return y;
    };

    // Waterline: the requested coverage percentile of the playable-area
    // height histogram. Works for any seed by construction.
    const samples = [];
    for (let gx = 0; gx <= 80; gx += 1) {
      for (let gz = 0; gz <= 80; gz += 1) {
        samples.push(rawHeight(-halfX + (gx / 80) * sizeX, -halfZ + (gz / 80) * sizeZ));
      }
    }
    samples.sort((a, b) => a - b);
    waterLevel = samples[Math.min(Math.floor(samples.length * coverage), samples.length - 1)];
    landPeak = Math.max(samples[Math.floor(samples.length * 0.995)] - waterLevel, 1);

    spawn = probeSpawn(rawHeight, waterLevel, halfX, halfZ, { holes });
    if (spawn) break;
    attempt += 1;
    resolvedSeed = (Math.imul(resolvedSeed, 2654435761) + 101) >>> 0;
  }
  if (!spawn) {
    // Every candidate failed even after re-rolls — take the least-bad site
    // rather than throwing: a mediocre spawn beats no world.
    spawn = probeSpawn(rawHeight, waterLevel, halfX, halfZ, { holes, relaxed: true })
      ?? { openness: 0, x: 0, y: rawHeight(0, 0), z: 0 };
  }

  // Final height function: raw + a flattened spawn meadow.
  const spawnHeight = Math.max(rawHeight(spawn.x, spawn.z), waterLevel + 3);
  const flattenFar = Math.min(sizeX, sizeZ) * 0.12;
  const flattenNear = flattenFar / 3;
  const heightAt = (x, z) => {
    const y = rawHeight(x, z);
    const flatten = smoothstep(flattenFar, flattenNear, Math.hypot(x - spawn.x, z - spawn.z));
    return y * (1 - flatten) + spawnHeight * flatten;
  };
  spawn.y = heightAt(spawn.x, spawn.z);

  // ---- mesh + paint (bands are fractions of the observed relief) ----
  const colors = {
    golden: new THREE.Color(palette.golden ?? DEFAULT_PALETTE.golden),
    haze: new THREE.Color(palette.haze ?? DEFAULT_PALETTE.haze),
    meadow: new THREE.Color(palette.meadow ?? DEFAULT_PALETTE.meadow),
    rock: new THREE.Color(palette.rock ?? DEFAULT_PALETTE.rock),
    sand: new THREE.Color(palette.sand ?? DEFAULT_PALETTE.sand),
    snow: new THREE.Color(palette.snow ?? DEFAULT_PALETTE.snow),
  };
  const rockBand = [waterLevel + landPeak * 0.5, waterLevel + landPeak * 0.66];
  const snowBand = [waterLevel + landPeak * 0.95, waterLevel + landPeak * 1.15];
  const goldTop = waterLevel + landPeak * 0.42;
  const { fbm } = kit;
  const goldenField = (x, z) => smoothstep(0.54, 0.68, fbm(x * 0.003 + 91, z * 0.003 + 43, 3));

  const paintVertex = (color, x, y, z, grade) => {
    const rockiness = Math.max(smoothstep(0.5, 0.9, grade), smoothstep(rockBand[0], rockBand[1], y));
    color.copy(colors.meadow)
      // Golden fields on flat lowlands only: loose gates leak gold up cliff
      // triangles as sawtooth wedges.
      .lerp(colors.golden, goldenField(x, z) * 0.85
        * (1 - smoothstep(goldTop * 0.72, goldTop, y)) * (1 - smoothstep(0.16, 0.32, grade)))
      .lerp(colors.rock, rockiness)
      .lerp(colors.snow, smoothstep(snowBand[0], snowBand[1], y));
    // Low-frequency strata + drift: frequencies stay above the vertex
    // spacing (finer bands alias into zigzag triangles on walls); fine
    // rock detail belongs to the triplanar stone texture.
    if (rockiness > 0.02) {
      const strata = 0.95 + 0.1 * fbm(y * 0.1 + 17, (x + z) * 0.004, 2);
      const drift = 0.95 + 0.1 * fbm(x * 0.008 + 5, z * 0.008 + 9, 2);
      color.lerp(color.clone().multiplyScalar(strata * drift), rockiness);
    }
    color
      .lerp(colors.sand, smoothstep(waterLevel + 2.5, waterLevel + 0.3, y))
      // Baked atmospheric perspective: the rim reads as hazy blue peaks.
      .lerp(colors.haze, smoothstep(1.4, 2.1, edgeDistance(x, z)) * 0.45);
    return color;
  };

  const geometry = new THREE.PlaneGeometry(meshExtent.x, meshExtent.z, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();

  const colorAttr = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Analytic slope: sharper than smoothed normals, so terrace walls
    // reliably classify as cliff.
    const e = 4;
    const grade = Math.hypot(
      heightAt(x + e, z) - heightAt(x - e, z),
      heightAt(x, z + e) - heightAt(x, z - e),
    ) / (2 * e);
    paintVertex(color, x, positions.getY(i), z, grade);
    colorAttr.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));

  const material = new THREE.MeshStandardMaterial({
    map: detailTexture
      ? createGroundDetailTexture(kit, Math.round(meshExtent.x / 11), Math.round(meshExtent.z / 11))
      : null,
    vertexColors: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; // cliff walls shadow their own valleys
  mesh.receiveShadow = true;
  // Displaced world-scale geometry misjudges its bounding volume — never cull.
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  const root = new THREE.Group();
  root.name = 'StylizedTerrain';
  root.add(mesh);

  // ---- floating islands (optional): meadow-topped sky rocks with tapered
  //      undersides. Decorative by default — returned so hosts can scatter
  //      trees on them, hang waterfalls, or add collision. ----
  const islands = [];
  const islandDisposables = [];
  if (floatingIslands) {
    const opts = typeof floatingIslands === 'object' ? floatingIslands : {};
    const count = Math.max(1, Math.round(opts.count ?? 3));
    const minAlt = opts.minAltitude ?? waterLevel + landPeak * 1.1;
    const maxAlt = opts.maxAltitude ?? waterLevel + landPeak * 1.7;
    const minR = opts.minRadius ?? 26;
    const maxR = opts.maxRadius ?? 70;
    for (let i = 0; i < count; i += 1) {
      const r1 = kit.hashCell(i * 53 + 5, i * 31 + 9);
      const r2 = kit.hashCell(i * 97 + 3, i * 17 + 21);
      const r3 = kit.hashCell(i * 13 + 41, i * 71 + 2);
      const radius = minR + (maxR - minR) * r3;
      const island = {
        radius,
        x: (r1 - 0.5) * sizeX * 0.9,
        y: minAlt + (maxAlt - minAlt) * kit.hashCell(i * 7 + 1, i * 3 + 8),
        z: (r2 - 0.5) * sizeZ * 0.9,
      };
      const built = buildFloatingIsland(kit, island, i, colors, paintVertex, waterLevel, landPeak);
      root.add(built.mesh);
      islandDisposables.push(built);
      islands.push(island);
    }
  }

  return {
    archetype,
    heightAt,
    islands,
    mesh,
    meshExtent,
    resolvedSeed,
    root,
    sinkholes: holes,
    size: { x: sizeX, z: sizeZ },
    spawn,
    stats: { attempts: attempt + 1, landPeak, waterLevel },
    waterLevel,
    dispose() {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      for (const built of islandDisposables) built.dispose();
      root.parent?.remove(root);
    },
  };
}

// One floating island: a displaced top disc (meadow) and a deeper tapered
// bottom disc (rock) sharing their rim ring, so the silhouette closes.
function buildFloatingIsland(kit, island, index, colors, paintVertex, waterLevel, landPeak) {
  const segments = 40;
  const rings = 12;
  const { radius } = island;
  const topAmp = radius * 0.18;
  const bottomDepth = radius * (0.7 + kit.hashCell(index * 3 + 2, index * 11 + 6) * 0.5);
  const positions = [];
  const colorList = [];
  const indexList = [];
  const color = new THREE.Color();

  // Local top-surface height; also exposed as island.topAt(worldX, worldZ)
  // so hosts can stand trees, props, or a character on the island.
  const topOffset = (x, z) => {
    const t = Math.min(Math.hypot(x, z) / radius, 1);
    const rimFalloff = 1 - t * t;
    return (kit.fbm(x * 0.05 + index * 7, z * 0.05 + index * 13, 3) - 0.3) * topAmp * 2 * rimFalloff
      + topAmp * 0.4 * rimFalloff;
  };
  island.topAt = (worldX, worldZ) => island.y + topOffset(worldX - island.x, worldZ - island.z);

  const ringVertex = (side, ring, seg) => {
    const t = ring / rings; // 0 center → 1 rim
    const angle = (seg / segments) * Math.PI * 2;
    const r = t * radius;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    let y;
    if (side === 'top') {
      y = topOffset(x, z);
    } else {
      const taper = (1 - t) ** 0.75;
      y = -bottomDepth * taper * (0.65 + kit.fbm(x * 0.06 + 51, z * 0.06 + 77, 3) * 0.7);
    }
    positions.push(island.x + x, island.y + y, island.z + z);
    if (side === 'top') {
      // Reuse the terrain paint at a meadow-friendly virtual altitude so
      // island tops match the ground biome exactly.
      paintVertex(color, x + island.x, waterLevel + landPeak * 0.15, z + island.z, t * 0.35);
    } else {
      color.copy(colors.rock).multiplyScalar(0.82 + kit.fbm(x * 0.1, z * 0.1, 2) * 0.25);
    }
    colorList.push(color.r, color.g, color.b);
  };

  const sideOffsets = {};
  for (const side of ['top', 'bottom']) {
    sideOffsets[side] = positions.length / 3;
    for (let ring = 0; ring <= rings; ring += 1) {
      for (let seg = 0; seg < segments; seg += 1) ringVertex(side, ring, seg);
    }
    const start = sideOffsets[side];
    for (let ring = 0; ring < rings; ring += 1) {
      for (let seg = 0; seg < segments; seg += 1) {
        const a = start + ring * segments + seg;
        const b = start + ring * segments + ((seg + 1) % segments);
        const c = start + (ring + 1) * segments + seg;
        const d = start + (ring + 1) * segments + ((seg + 1) % segments);
        if (side === 'top') indexList.push(a, c, b, b, c, d);
        else indexList.push(a, b, c, b, d, c);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorList), 3));
  geometry.setIndex(indexList);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // large displaced silhouette, same rule as terrain
  mesh.name = `FloatingIsland${index}`;
  return { dispose: () => { geometry.dispose(); material.dispose(); }, mesh };
}

// Deterministic spawn search: walkable slope, above the waterline, near a
// shore, and open sightlines (no tall wall close by in any direction).
function probeSpawn(rawHeight, waterLevel, halfX, halfZ, { holes = [], relaxed = false } = {}) {
  const maxRX = halfX * 0.85;
  const maxRZ = halfZ * 0.85;
  const wallLimit = relaxed ? 45 : 27;
  let best = null;
  for (let x = -maxRX; x <= maxRX; x += 20) {
    for (let z = -maxRZ; z <= maxRZ; z += 20) {
      // Never spawn inside (or on the lip of) a sinkhole.
      if (holes.some((h) => Math.hypot(x - h.x, z - h.z) < h.radius * 1.4)) continue;
      const y = rawHeight(x, z);
      if (y < waterLevel + 1.2 || y > waterLevel + 22) continue;
      const e = 4;
      const grade = Math.hypot(
        rawHeight(x + e, z) - rawHeight(x - e, z),
        rawHeight(x, z + e) - rawHeight(x, z - e),
      ) / (2 * e);
      if (grade > (relaxed ? 0.4 : 0.22)) continue;
      // Shore distance: probe rings outward until a sample dips underwater.
      let shore = Infinity;
      outer: for (let r = 15; r <= 90; r += 15) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          if (rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) < waterLevel) {
            shore = r;
            break outer;
          }
        }
      }
      if (!relaxed && shore > 90) continue;
      // Openness: penalize tall walls within 150 m along 8 rays.
      let openness = 0;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        let rayClear = 1;
        for (let r = 40; r <= 150; r += 25) {
          if (rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) - y > wallLimit) {
            rayClear = 0;
            break;
          }
        }
        openness += rayClear;
      }
      if (!relaxed && openness < 6) continue;
      const score = openness * 10 - Math.abs(shore - 35) * 0.1 - grade * 20;
      if (!best || score > best.score) best = { openness, score, x, y, z };
    }
  }
  return best;
}
