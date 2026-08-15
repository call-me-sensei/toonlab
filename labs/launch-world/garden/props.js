// Stillwater Garden — authored instance dressing: the stone set and the
// BranchTree maple/pine planting.
//
// Every object here comes from a first-party ToonLab system:
//   stone   the §6.3 official catalog artifacts, surfaced through
//           createCatalogRockSurface + applyRockShader (src/rock-shader),
//           reusing labs/shared/azureHeadlandRocks.js rather than forking it
//   trees   createBranchTree (src/vegetation/branchTree.js), surfaced by
//           setVegetationShader({ preset: 'call_me_sensei' })
//
// Nothing in this file is a stand-in. There is no placeholder for the
// manufactured items (teahouse, gate, wall, lanterns, tsukubai, bridge) — §2
// prefers an empty, prepared site to a blockout, and the terrain already
// carries their pads and their spine.
//
// Doc 20 §4 raises the stone scope: "Stone is the subject. Three assets is not
// enough". Three base shapes is what the accepted set contains, so variety is
// bought where it can honestly be bought — five distinct SCALE CLASSES, each
// with its own projection period so texel density stays constant, per-instance
// moss coverage, per-instance surface variation, and setting attitude (tilt +
// bury depth) authored per role the way a garden's stones actually are.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { createBranchTree } from '../../../src/vegetation/branchTree.js';
import { resolveCatalogRockProjectionScale } from '../../../src/catalog/officialCatalogRockSurfaces.js';
import { applyRockShader } from '../../../src/rock-shader/rockShaderRuntime.js';
import {
  AZURE_HEADLAND_ROCKS,
  MOSS_ALBEDO_URL,
  resolveRockSurface,
} from '../../shared/azureHeadlandRocks.js';

import {
  BOUNDARY,
  CASCADE,
  PATH,
  POND_MARGIN,
  UPPER_POOL_LEVEL,
  gardenHeight,
  plantableMask,
} from './terrain.js';

// Seeded LCG. Placement must be identical run to run — the filler register's
// equivalence test and every A/B capture depend on it.
function rng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

// ---------------------------------------------------------------------------
// Stone
// ---------------------------------------------------------------------------

/**
 * Scale classes.
 *
 * `bury` is the fraction of the instance's own height that sits below grade.
 * Japanese garden setting buries roughly a third of a set stone so it reads as
 * outcrop rather than as an object placed on the lawn; a stepping stone is
 * buried almost entirely and shows only its walking face.
 *
 * `projection` is derived per class from the asset's measured bounds times the
 * class scale, so a 0.14-scale stepping stone samples the detail map at the
 * same texel density as a 0.42-scale cascade rock. Without it every downscaled
 * instance reads lower-frequency and the small stone turns to soap (D19-031,
 * D19-063).
 */
export const STONE_CLASSES = Object.freeze({
  cascade: Object.freeze({ bury: 0.2, moss: 1.15, scale: 0.44, tilt: 0.12 }),
  island: Object.freeze({ bury: 0.42, moss: 0.4, scale: 0.26, tilt: 0.05 }),
  margin: Object.freeze({ bury: 0.46, moss: 1.05, scale: 0.21, tilt: 0.08 }),
  set: Object.freeze({ bury: 0.33, moss: 0.85, scale: 0.36, tilt: 0.16 }),
  stepping: Object.freeze({ bury: 0.78, moss: 0.25, scale: 0.15, tilt: 0.03 }),
});

/**
 * The hand-set stone. Every group is a composition, not a scatter:
 *
 * - `cascade`  the falls arrangement — a tall flanking pair and the lip stone
 *              the water breaks over.
 * - `sanzon`   the classical triad on the pond's north-east margin, read
 *              across the water from the near path.
 * - `island`   two stone groups standing in the raked gravel.
 * - `accent`   single stones marking the path bend and the terrace approach.
 *
 * `[x, z, asset, yaw, class, scaleJitter]`
 */
const SET_STONES = Object.freeze([
  // Cascade arrangement, flanking the drop axis.
  [-13.4, -10.0, 0, 24, 'cascade', 1.06],
  [-10.5, -11.6, 1, 208, 'cascade', 0.92],
  [-12.4, -11.4, 2, 132, 'cascade', 1.0],
  [-9.6, -8.6, 2, 301, 'margin', 1.04],

  // The sanzon triad on the far (north-east) margin — the mid-band subject.
  [1.2, -8.5, 0, 48, 'set', 1.05],
  [2.6, -9.4, 1, 176, 'set', 0.86],
  [-0.2, -9.5, 2, 292, 'set', 0.94],

  // Gravel-sea islands.
  [-13.0, 3.0, 1, 66, 'island', 1.02],
  [-12.1, 4.1, 2, 231, 'island', 0.78],
  [-9.2, 6.9, 0, 143, 'island', 0.9],
  [-10.1, 7.6, 2, 18, 'island', 0.7],

  // Path and terrace accents.
  [-8.9, 8.4, 0, 205, 'set', 0.82],
  [5.9, -1.2, 1, 97, 'margin', 1.0],
  [12.6, -6.2, 0, 260, 'set', 0.88],
  [-2.4, 12.4, 2, 34, 'margin', 0.92],
]);

/**
 * Pond-margin stones and the stepping-stone run, both authored in the pond
 * margin's own curve frame (`createCurveFrame`, D19-066 / FILL-013).
 *
 * A constant-width band around an irregular pond cannot be expressed as a
 * rectangle with a hole in it, and a hand-authored table in world XZ drifts off
 * the waterline exactly the way the coastal tree ridge did. `stepAlong`
 * distributes by ARC LENGTH, so the stones stay evenly spaced around the pond's
 * lobes instead of bunching where the bearing parameter bunches.
 *
 * Positive offset is inward (the curve's left normal on a closed loop), so the
 * stepping stones sit IN the shallow shelf and the margin stones sit just
 * outside the waterline on the bank.
 */
function curveStones() {
  const placements = [];

  const marginStones = POND_MARGIN.stepAlong({
    heightAt: gardenHeight,
    jitterAlong: 0.55,
    jitterOffset: 0.22,
    offset: -0.32,
    seed: 3_307,
    spacing: 3.15,
  });
  for (const [index, stone] of marginStones.entries()) {
    placements.push({
      asset: index % 3,
      className: 'margin',
      scaleJitter: 0.78 + ((index * 37) % 11) / 24,
      x: stone.x,
      yaw: (index * 137.5) % 360,
      z: stone.z,
    });
  }

  // The crossing: a run of stepping stones through the shallow south margin,
  // between bearings 0.62 and 2.32 rad. Depth on that arc is 0.10–0.30 m, so
  // the stones stand proud of the water and the caustics break around them.
  const crossing = POND_MARGIN.stepAlong({
    alongRange: [0.62, 2.32],
    heightAt: gardenHeight,
    jitterAlong: 0.11,
    jitterOffset: 0.19,
    offset: 1.05,
    seed: 5_101,
    spacing: 0.86,
  });
  for (const [index, stone] of crossing.entries()) {
    placements.push({
      asset: (index + 1) % 3,
      className: 'stepping',
      // A stepping-stone run alternates a wide stone with a narrow one so the
      // stride reads as designed rather than as a paved strip.
      scaleJitter: index % 2 === 0 ? 1.06 : 0.82,
      x: stone.x,
      yaw: (index * 63.7) % 360,
      z: stone.z,
    });
  }

  return placements;
}

function loadTexture(loader, url, { srgb }) {
  return new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      resolve(texture);
    }, undefined, reject);
  });
}

/**
 * Loads the catalog stone and instances it across every garden role.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer required for KTX2 support detection
 * @param {{ place: Function }} options.surface
 */
export async function createGardenStone({ renderer, surface }) {
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2);
  const textureLoader = new THREE.TextureLoader();

  const mossTexture = await loadTexture(textureLoader, MOSS_ALBEDO_URL, { srgb: true });
  const textureCache = new Map();
  const sources = new Map();

  for (const rock of AZURE_HEADLAND_ROCKS) {
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(rock.url, resolve, undefined, reject);
    });
    const root = gltf.scene;
    // The catalog packs all three LODs as sibling nodes; the launch frames are
    // hero stills, so LOD0 is pinned (the runtime LOD switch is a Gate 4 item).
    root.traverse((object) => {
      if (/_LOD\d$/.test(object.name)) object.visible = object.name.endsWith('_LOD0');
    });
    sources.set(rock.id, root);
  }

  // One prototype per (asset x scale class): 15 material compiles for however
  // many instances the garden needs, and each carries the projection period its
  // own finished size deserves.
  const prototypes = new Map();
  const classNames = Object.keys(STONE_CLASSES);
  for (const [assetIndex, rock] of AZURE_HEADLAND_ROCKS.entries()) {
    for (const [classIndex, className] of classNames.entries()) {
      const stoneClass = STONE_CLASSES[className];
      const projectionScale = resolveCatalogRockProjectionScale({
        size: rock.measured.map((extent) => extent * stoneClass.scale),
      });
      const surfaceSpec = resolveRockSurface(rock, {
        // Garden stone is mossy stone. Doc 20 §4 promotes moss on stone from a
        // "variation trick" to a hero material, and each ROLE carries its own
        // coverage: the cascade and margin stones are permanently damp, the
        // gravel-sea islands are deliberately dry.
        mossCoverage: Math.min(rock.mossCoverage * stoneClass.moss, 1),
        projectionScale,
        // Decorrelates the same asset across roles: three assets in five roles
        // would otherwise wear one surface fifteen times.
        variation: rock.variation + classIndex * 3,
      });
      const textures = { moss: mossTexture };
      for (const [slot, url] of Object.entries(surfaceSpec.textureUrls)) {
        if (!textureCache.has(url)) {
          textureCache.set(url, await loadTexture(textureLoader, url, { srgb: slot === 'rock' }));
        }
        textures[slot] = textureCache.get(url);
      }
      const root = sources.get(rock.id).clone(true);
      applyRockShader(root, {
        preset: 'call_me_sensei',
        ...surfaceSpec.settings,
        // D19-062 mitigation, carried over from the coastal pass. The preset
        // ships `ambientFloor: 0.01` / `skyFillStrength: 0.72`, tuned against a
        // turntable that has an ambient term. A `createSceneStyleRuntime` scene
        // has none — only the sun and an SH sky probe — so every face with
        // N.L <= 0 renders saturated navy. REMOVE once the lighting owner lands
        // the direct-light fix; grading against these numbers measures the bug.
        lighting: {
          ...(surfaceSpec.settings.lighting ?? {}),
          ambientFloor: 0.075,
          skyFillStrength: 0.95,
        },
      }, {
        name: `ToonLab · ${rock.label} · ${className}`,
        textures,
        variation: surfaceSpec.variation,
      });
      prototypes.set(`${assetIndex}:${className}`, root);
    }
  }

  const group = new THREE.Group();
  group.name = 'Stillwater Garden · Stone';
  const random = rng(8_819);
  const placements = [
    ...SET_STONES.map(([x, z, asset, yaw, className, scaleJitter]) => ({
      asset, className, scaleJitter, x, yaw, z,
    })),
    ...curveStones(),
  ];

  const census = {};
  for (const [index, placement] of placements.entries()) {
    const stoneClass = STONE_CLASSES[placement.className];
    const prototype = prototypes.get(`${placement.asset}:${placement.className}`);
    const instance = prototype.clone(true);
    instance.name = `${AZURE_HEADLAND_ROCKS[placement.asset].id}-${placement.className}-${index}`;
    const scale = stoneClass.scale * placement.scaleJitter;
    instance.scale.setScalar(scale);
    instance.rotation.y = THREE.MathUtils.degToRad(placement.yaw);
    // Setting attitude. A garden stone is never level; the tilt is what gives
    // a group its direction of travel and is authored per class.
    instance.rotation.x = (random() - 0.5) * 2 * stoneClass.tilt;
    instance.rotation.z = (random() - 0.5) * 2 * stoneClass.tilt;
    instance.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    // `anchor: 'bounds'` grounds by Box3.min.y, then the class bury depth
    // sinks it, so seams are buried by the authored terrain rather than hidden
    // by scaling.
    instance.updateWorldMatrix(true, true);
    const height = new THREE.Box3().setFromObject(instance).getSize(new THREE.Vector3()).y;
    surface.place(instance, {
      anchor: 'bounds',
      offset: -height * stoneClass.bury,
      x: placement.x,
      z: placement.z,
    });
    group.add(instance);
    census[placement.className] = (census[placement.className] ?? 0) + 1;
  }

  return { census, count: placements.length, group };
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------
//
// INTEGRATION. Doc 20 §3 re-targets the BranchTree recipes from beech/gingko
// to maple and pine, and that authoring is in flight in the trees workstream.
// Until the documents land at /assets-local/launch-world/trees/, the two
// families are authored here against the same runtime the documents will
// parse. These are NOT blockouts: they are real BranchTrees through the real
// public entry point, and the swap is `parseBranchTreeDocument(document)` in
// place of the constant below.
//
// Traps observed and avoided:
//   D19-030  `size` is a canopy-card budget as well as a scale; scaling a tree
//            DOWN through `size` silently destroys 60-78% of its leaf cards.
//            Instance scale lives on the transform, never on `size`.
//   D19-028  `branches.children` above 8 exhausts the branch budget and yields
//            a leafless skeleton. Both families stay at 5.

const MAPLE = Object.freeze({
  branches: Object.freeze({
    angle: 63, children: 5, gnarliness: 0.3, lengthRatio: 0.56, levels: 4,
    radialSegments: 12, radiusRatio: 0.66, start: 0.24,
  }),
  leaves: Object.freeze({
    // The autumn accent — §2's single saturated colour, and the only place in
    // the garden allowed to carry it.
    cluster: Object.freeze({
      architecture: 'layered-sprays', sprayLayers: 3, spraySpread: 1.25,
      sprayThickness: 0.42,
    }),
    color: Object.freeze([0.72, 0.22, 0.08]),
    density: 1.35,
    palette: Object.freeze({
      crown: Object.freeze([0.88, 0.44, 0.14]),
      lit: Object.freeze([0.86, 0.33, 0.1]),
      shadow: Object.freeze([0.36, 0.11, 0.09]),
    }),
    shape: 'palmate',
  }),
  roots: 'medium',
  size: 2.9,
  trunk: Object.freeze({
    bend: 0.34, color: Object.freeze([0.33, 0.26, 0.22]), gnarl: 0.36,
    height: 2.0, lean: 0.24, radialSegments: 14, radiusBottom: 0.2,
    radiusTop: 0.055, textureRef: 'call-me-sensei-bark-v1', twist: 0.14,
  }),
});

const PINE = Object.freeze({
  branches: Object.freeze({
    angle: 79, children: 5, gnarliness: 0.44, lengthRatio: 0.44, levels: 4,
    radialSegments: 10, radiusRatio: 0.6, start: 0.44,
  }),
  leaves: Object.freeze({
    // Cloud-pruned niwaki pine: needle whorls carried on strongly horizontal
    // branchlets, so the mass reads as stacked pads rather than as a hedge.
    cluster: Object.freeze({
      architecture: 'needle-whorls', whorlArms: 6, whorlRadius: 0.42,
    }),
    color: Object.freeze([0.13, 0.3, 0.19]),
    density: 1.15,
    palette: Object.freeze({
      crown: Object.freeze([0.26, 0.47, 0.3]),
      lit: Object.freeze([0.2, 0.42, 0.25]),
      shadow: Object.freeze([0.06, 0.16, 0.14]),
    }),
    shape: 'needle-fascicle',
  }),
  roots: 'large',
  size: 3.4,
  trunk: Object.freeze({
    bend: -0.26, color: Object.freeze([0.36, 0.25, 0.19]), gnarl: 0.46,
    height: 3.6, lean: 0.2, radialSegments: 12, radiusBottom: 0.26,
    radiusTop: 0.05, textureRef: 'call-me-sensei-bark-v1', twist: -0.1,
  }),
});

/**
 * Hand-set trees. `[x, z, family, seed, scale, yawDegrees]`.
 *
 * The hero maple is the §2 foreground occluder: it stands 4.6 m from the hero
 * eye on the near-left, so its branch mass closes the top-left of the frame
 * without hiding the pond.
 */
const SPECIMEN_TREES = Object.freeze([
  [-10.4, 10.9, 'maple', 4_107, 1.24, 148],
  [4.9, -8.9, 'maple', 5_821, 0.86, 32],
  [-14.4, -2.4, 'maple', 9_021, 0.7, 265],
  [13.2, -9.4, 'pine', 3_311, 0.82, 74],
  [7.4, -12.6, 'pine', 6_442, 0.94, 199],
  [-6.6, -12.9, 'pine', 7_708, 0.88, 311],
]);

/**
 * Builds and grounds every tree.
 *
 * The enclosing pine mass is placed with `BOUNDARY.stepAlong` — the boundary is
 * a spine, so the mass follows it at a constant set-back for its whole length
 * instead of drifting the way a constant-world-z line would (D19-066).
 */
export async function createGardenTrees({ surface, fog = null }) {
  const group = new THREE.Group();
  group.name = 'Stillwater Garden · Trees';
  const random = rng(61_403);
  const instances = [];

  const build = (family, { scale, seed, x, yawDegrees, z }) => {
    const recipe = family === 'pine' ? PINE : MAPLE;
    const tree = createBranchTree({
      ...recipe,
      foliage: {
        // A garden is sheltered: the wind read is a drift, not a gale, and it
        // matches the grass fields and the pond ripple direction.
        windDirection: [0.62, -0.78],
        windSpeed: 0.6,
        windStrength: family === 'pine' ? 0.055 : 0.085,
      },
      seed,
      styleTarget: { targetId: `garden/tree-${family}-${instances.length}` },
    });
    tree.setVegetationShader({ preset: 'call_me_sensei' });
    if (fog) tree.setSceneFog(fog);
    // Instance scale on the TRANSFORM. Never through `size` — D19-030.
    tree.scale.setScalar(scale);
    tree.rotation.y = THREE.MathUtils.degToRad(yawDegrees);
    // The root-flare bury goes through `place`'s own `offset`, not through a
    // post-hoc position edit: `surface.audit` records the grounding target at
    // placement time, so adjusting y afterwards reports every tree as
    // `object-off-surface` and buries the real signal.
    surface.place(tree, { anchor: 'origin', offset: -0.12 * scale, x, z });
    group.add(tree);
    instances.push({ family, scale, x, z });
    return tree;
  };

  for (const [x, z, family, seed, scale, yawDegrees] of SPECIMEN_TREES) {
    build(family, { scale, seed, x, yawDegrees, z });
  }

  // The enclosing pine mass. Set back 2.6 m inside the boundary line, with the
  // set-back and the spacing jittered so the row is a mass and not a colonnade.
  const screen = BOUNDARY.stepAlong({
    heightAt: gardenHeight,
    jitterAlong: 0.9,
    jitterOffset: 0.85,
    mask: (x, z) => plantableMask(x, z),
    offset: 2.6,
    seed: 2_204,
    spacing: 4.4,
  });
  for (const [index, stand] of screen.entries()) {
    build('pine', {
      scale: 0.88 + random() * 0.42,
      seed: 11_000 + index * 137,
      x: stand.x,
      yawDegrees: random() * 360,
      z: stand.z,
    });
  }

  return {
    group,
    instances,
    update: (delta) => { for (const child of group.children) child.update?.(delta); },
  };
}

export { CASCADE, PATH, UPPER_POOL_LEVEL };
