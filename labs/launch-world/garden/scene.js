// Stillwater Garden — scene assembly (launch video, doc 20).
//
// Every visible system here is a first-party ToonLab system:
//   terrain surface   createSceneSurfaceRuntime   (src/runtime/sceneSurfaceRuntime.js)
//   ground            createGroundShaderMesh      (src/ground-shader)
//   ground surfaces   evaluateTextureMaps         (src/texgen)   -> materials.js
//   water             surface.createWaterSurface  -> WaterSurface (src/water)
//   stone             official catalog + applyRockShader (src/rock-shader)
//   trees             createBranchTree            (src/vegetation)
//   grass / moss      surface.createGrassField    -> createCallMeSenseiGrassField
//   sky + cloud       createSkySystem             (src/sky)
//   lighting / post   createSceneStyleRuntime + CALL_ME_SENSEI_STYLE_BUNDLE
//   placement frames  createCurveFrame            (src/vegetation/scatter.js)
//
// Assembly order follows launch-plan/contracts/launch-world-runtime-contracts.md
// §10: surface -> ground -> water (registers its footprint) -> objects -> grass
// -> sky/style.
//
// NOT in this pass, by instruction — integration points are marked INTEGRATION:
//   ARCH-GDN-01 teahouse, ARCH-GDN-02 gate + wall, PROP-GDN-01 stone furniture,
//   PROP-GDN-02 garden detail, Yua, the shader wipe. No blockout stands in for
//   any of them (§2); the terrain carries their pads and their spines instead.

import * as THREE from 'three/webgpu';

import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createSceneSurfaceRuntime,
  createSkySystem,
} from '@call-me-sensei/toonlab';
import {
  createGroundShaderMesh,
  createGroundShaderSettings,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';
import { resolveLightingStylePreset } from '@call-me-sensei/toonlab/lighting';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { PRESETS as SKY_PRESETS } from '@call-me-sensei/toonlab/sky';
import { clearEnvironmentCloudShadowPass } from '../../../src/sky/cloudShadow.js';

import { buildGardenGroundLayers, groundProjectionScales } from './materials.js';
import { createGardenStone, createGardenTrees } from './props.js';
import {
  BOUNDS,
  CASCADE,
  PATH,
  POND_MARGIN,
  UPPER_POOL_LEVEL,
  WATER_LEVEL,
  YUA_MARK,
  buildGroundField,
  buildTerrainGeometry,
  clumpMask,
  gardenHeight,
  mossMask,
  plantableMask,
  pondEdgeMask,
} from './terrain.js';

// ---------------------------------------------------------------------------
// Authored constants — every one traceable to doc 20 or the contracts file
// ---------------------------------------------------------------------------

// DECISION (contracts §11 item 2), inherited from the coastal pass and
// re-affirmed here. D19-064: hour 8.5 lands §6.5's 42° exactly and drags the
// whole rig 36% of the way toward the style's hour-6 keyframe, so the palette
// interpolates into DAWN — orange sun, dim cold probe. That is the mechanism
// that renders a warm ground cold. Hour 10 with `sunPath.heightScale = 0.4219`
// gives atan((0.4 + 0.4219 x 0.866) / 0.85) = 42.0° on a late-morning palette.
// Only the height term moves.
export const TIME_OF_DAY = 10;
const GARDEN_SUN_HEIGHT_SCALE = 0.4219;

// Sun azimuth (D19-064). The shipped `call-me-sensei` sun path has
// `azimuthOffset: 0`, which at hour 10 puts the sun at −24° — the north-north-
// west, i.e. behind everything a south-facing camera can see. The undocumented
// formula, measured: az = azimuthOffset + (hour/24 − 0.5) x azimuthArc, with
// azimuthArc = π·1.6.
//
// Every hero camera in this garden stands at the south gate looking north, so
// the sun is authored to the SOUTH-EAST (az ≈ 128°): over the camera's right
// shoulder, raking across the composition left-to-right. The pond then carries
// a lit sky reflection instead of the sun disc, the cascade face is front-lit,
// and shadows fall away to the north-west, into the picture.
//   2.653 + (10/24 − 0.5) x π·1.6 = 2.653 − 0.419 = 2.234 rad = 128°.
const GARDEN_SUN_AZIMUTH_OFFSET = 2.653;

// Aerial perspective. A 40 m garden is BELOW the distance where haze does
// anything (city stand-down §4.6: "haze does essentially nothing under ~110 m"),
// so this is deliberately small — its whole job is to separate the enclosing
// pine mass from the mid-band planting by a few percent of value, not to build
// depth. Depth here is bought with occlusion and value, as it must be.
const HORIZON = Object.freeze({
  color: 0xcfd6d4,
  fogFar: 128,
  fogNear: 16,
});

const HORIZON_LINEAR = new THREE.Color(HORIZON.color).convertSRGBToLinear().toArray();

// The pond tile. Sized to the pond's own bounding box plus a margin: ToonLab
// Water discards fragments whose bed stands above the surface, so a rectangular
// tile renders the authored irregular outline exactly.
const POND = Object.freeze({
  depth: 14.5,
  maxSegments: 256,
  segmentsPerMeter: 7,
  width: 19.5,
  x: -5.3,
  z: -5.2,
});

const UPPER_POOL = Object.freeze({
  depth: 5.0,
  maxSegments: 96,
  segmentsPerMeter: 10,
  width: 5.8,
  x: CASCADE.pool.x,
  z: CASCADE.pool.z,
});

// The plunge. ToonLab Water owns splash, ripple and foam; what it does not own
// is a falling sheet between two bodies (recorded as D19-069). The cascade
// therefore reads through the systems that DO exist: the authored 32° stone
// face, the shore-state wetness on it, and a continuous plunge impulse driven
// into the pond here — ring waves, a downward impulse, and the splash system's
// droplets and sheets, all at the point the water lands.
const PLUNGE_INTERVAL = 0.085;
const PLUNGE_SPREAD = 0.62;

export const SHOTS = Object.freeze({
  // §2 hero. The eye stands ON the stone path just inside the gate and looks
  // north up the garden's long axis. Five depth bands in one frame:
  //   1 maple branch mass, near right    2 stone path / gravel sea / moss
  //   3 pond, stepping stones, cascade   4 teahouse terrace (right)
  //   5 pine mass and the planted rise closing the sightline
  hero: Object.freeze({
    fov: 40,
    position: [-1.5, 2.35, 14.0],
    target: [0.0, 1.0, -8.0],
  }),
  // Down onto the water: stepping stones, caustics, reflection, margin stone.
  pond: Object.freeze({
    fov: 36,
    position: [1.9, 1.85, 3.4],
    target: [-8.6, 0.1, -7.6],
  }),
  // The cascade, close, with the upper basin above it.
  cascade: Object.freeze({
    fov: 38,
    position: [-6.2, 1.95, -4.6],
    target: [-13.8, 1.15, -11.8],
  }),
  // Along the path where Yua walks — the near play space and the maple.
  path: Object.freeze({
    fov: 42,
    position: [3.6, 1.7, 8.6],
    target: [-8.4, 0.7, -1.2],
  }),
  // The terrace approach, looking back south-west across the pond.
  terrace: Object.freeze({
    fov: 40,
    position: [11.2, 3.0, -1.6],
    target: [-9.4, 0.6, -8.6],
  }),
  // The whole garden, for composition review only.
  wide: Object.freeze({
    fov: 44,
    position: [16, 15.5, 26],
    target: [-3, 0.5, -6],
  }),
});

// ---------------------------------------------------------------------------

/**
 * Builds the Stillwater Garden.
 *
 * @param {object} options
 * @param {THREE.WebGPURenderer} options.renderer
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {(stage: string) => void} [options.onProgress]
 * @param {number} [options.grassCount] moss-field placement cap
 * @param {'balanced'|'performance'} [options.quality]
 * @param {boolean} [options.shadows] engage the sun's cast shadows (D19-041)
 * @param {number} [options.textureSize] ground-layer bake resolution
 */
export async function createStillwaterGarden({
  camera,
  cloudShadow = true,
  grassCount = 15_000,
  onProgress = () => {},
  quality = 'balanced',
  renderer,
  shadows = false,
  textureSize = 1024,
}) {
  const scene = new THREE.Scene();
  scene.background = null;
  const fog = new THREE.Fog(HORIZON.color, HORIZON.fogNear, HORIZON.fogFar);
  scene.fog = fog;

  // --- 1. Terrain surface ---------------------------------------------------
  onProgress('Grading the garden');
  const surface = createSceneSurfaceRuntime({
    bounds: BOUNDS,
    heightAt: gardenHeight,
    waterLevel: WATER_LEVEL,
  });

  // --- 2. Ground ------------------------------------------------------------
  onProgress('Baking the ground surfaces');
  const groundLayers = await buildGardenGroundLayers({
    onProgress: (role) => onProgress(`Baking the ${role} surface`),
    size: textureSize,
  });

  onProgress('Painting the ground');
  const ground = createGroundShaderMesh({
    field: buildGroundField({ depth: 512, width: 512 }),
    geometry: buildTerrainGeometry({ segmentsX: 448, segmentsZ: 448 }),
    layers: groundLayers.map(({ texture }) => ({ texture })),
    name: 'Stillwater Garden · Ground',
    settings: createGroundShaderSettings({
      preset: 'call_me_sensei',
      // The preset's distance defaults are 500 m / 15 km — mountain scale, and
      // therefore simply "off" in a 40 m world. Rescaled so the enclosing band
      // recedes by a few percent and pointed at the same colour as the fog, so
      // the two agree.
      distance: {
        color: HORIZON_LINEAR,
        detailFade: 0.45,
        end: 96,
        start: 20,
        strength: 0.3,
      },
      layers: {
        // The tints are the graphic identity underneath the authored maps. The
        // preset ships meadow green / warm earth / cool stone / beach sand;
        // three of the four garden surfaces are not those things.
        contrast: 1.04,
        dirtTint: [0.34, 0.28, 0.21],
        grassTint: [0.19, 0.34, 0.15],
        rockTint: [0.55, 0.54, 0.51],
        sandTint: [0.76, 0.74, 0.69],
        saturation: 1.02,
        textureStrength: 1,
      },
      // Every camera here is inside 30 m. The preset's landscape periods
      // (grass 16 m, dirt 13 m, rock 25 m, sand 10 m) read as a boulder field
      // at this range — the city stand-down measured the same failure. The
      // periods come from the SAME table the recipes were authored against
      // (materials.js `worldTile`), so paint scale and bake scale cannot drift.
      projection: {
        ...groundProjectionScales(groundLayers),
        triplanarSharpness: 3.2,
        triplanarStrength: 1,
      },
      macro: {
        // Macro variation is the only thing breaking the tile repeat at these
        // periods, so it does more work here than in a landscape.
        amount: 0.2,
        scale: 0.11,
        secondaryAmount: 0.11,
        secondaryScale: 0.036,
        tint: [0.62, 0.72, 0.5],
        tintStrength: 0.1,
      },
      slope: {
        // Garden banks are shallow; the cascade face is the one steep surface
        // and it must take the stone treatment cleanly.
        edgeHighlight: 0.2,
        fade: 0.13,
        noiseScale: 0.14,
        noiseStrength: 0.06,
        start: 0.2,
      },
      shoreline: {
        // A pond margin, not a beach: a narrow damp band and no automatic sand.
        autoSandStrength: 0.1,
        bandWidth: 0.7,
        softness: 0.35,
        wetBandDarkening: 0.26,
        wetBandWidth: 0.28,
      },
    }),
    styleTarget: { targetId: 'garden/ground' },
  });
  scene.add(ground);

  // --- 3. Water -------------------------------------------------------------
  // Registered BEFORE the grass so the scatter excludes the footprints.
  // `surface.createWaterSurface` wires `bedHeight: sampleHeight` for us, which
  // is what gates shoaling and the shore-state field. §6.4 forbids a flat
  // plane and the architecture enforces it.
  onProgress('Filling the pond');

  // D19-004: an unknown preset silently becomes `lake`, with no warning.
  // `pond` is a real registered ALIAS of `calm` — verified by resolving both
  // and comparing, not assumed. `calm` is the still-water body: 0.12 wave
  // intensity, no whitecaps, 0.7 reflection strength before the tone.
  const pondWater = surface.createWaterSurface({
    breakerEnabled: false,
    // Caustics are the shallow-water read, and the bed was authored to give
    // them somewhere to live: half the pond floor sits under 0.40 m of water.
    // The `anime` tone's own 0.3 is tuned for a swimmer's-eye lake.
    causticsScale: 1.4,
    causticsSpeed: 0.32,
    causticsStrength: 0.74,
    colorTone: 'anime',
    // Clarity distances, sized to a 1.3 m pond. These are the keys D19-005
    // freed: the `anime` tone force-applied its own 1.8 m / 4.2 m — LAKE
    // numbers — over any caller value, which put every depth transition
    // outside a garden pond entirely and rendered it one flat blue.
    deepFadeDistance: 1.15,
    depth: POND.depth,
    depthFadeDistance: 0.42,
    // Fine ripple cells. A 1.15 detail scale is a lake cell; on a 15 m pond
    // seen from 20 m it is wider than the pond.
    detailNormalStrength: 0.24,
    detailScale: 2.8,
    foamAmount: 0.5,
    foamNoiseScale: 2.2,
    maxSegments: POND.maxSegments,
    nearshorePhase: { incidentAxis: 'z', referenceX: POND.x, referenceZ: POND.z },
    // Still water is a mirror with a body, not a body with a highlight.
    // Reflection is doc 20's "dominant read", so it is authored explicitly —
    // the tone would otherwise force 0.46 over the calm preset's 0.7.
    opacity: 0.87,
    position: { x: POND.x, z: POND.z },
    preset: 'pond',
    quality: quality === 'performance' ? 'medium' : 'high',
    reflectionDistortion: 0.022,
    reflectionSoftness: 0.26,
    reflectionStrength: 0.8,
    refractionStrength: 0.46,
    rippleFoamStrength: 1.35,
    runupDistance: 0,
    sceneQuality: quality,
    segmentsPerMeter: POND.segmentsPerMeter,
    shorelineRunup: 0.12,
    shoreState: {
      region: { centerX: POND.x, centerZ: POND.z, depth: POND.depth, width: POND.width },
      resolution: { x: 512, y: 384 },
    },
    simulation: { resolution: 256, worldSize: 22 },
    sparkleStrength: 0.3,
    style: 'call_me_sensei',
    styleTarget: { targetId: 'garden/pond' },
    // Barely any swell. The disturbance a pond actually shows is the plunge,
    // the character's footfall and the wind cat's-paw — all of which arrive
    // through the ripple simulation, not through the Gerstner set.
    waveAmplitude: 0.05,
    waveDirection: [0.62, -0.78],
    waveDirectionSpread: 0.2,
    waveIntensity: 0.05,
    waveLength: 3.2,
    waveSteepness: 0.32,
    whitecapAmount: 0,
    width: POND.width,
    // A pond is 1.3 m deep; the shipped 6 m skirt would hang below the world.
    volumeDepth: 2.4,
    volumeOpacity: 0.62,
  });
  scene.add(pondWater);

  const upperPool = surface.createWaterSurface({
    breakerEnabled: false,
    causticsScale: 2.4,
    causticsSpeed: 0.4,
    causticsStrength: 0.85,
    colorTone: 'anime',
    deepFadeDistance: 0.62,
    depth: UPPER_POOL.depth,
    depthFadeDistance: 0.22,
    detailNormalStrength: 0.3,
    detailScale: 3.6,
    foamAmount: 0.8,
    maxSegments: UPPER_POOL.maxSegments,
    nearshorePhase: { incidentAxis: 'z', referenceX: UPPER_POOL.x, referenceZ: UPPER_POOL.z },
    opacity: 0.84,
    position: { offset: UPPER_POOL_LEVEL, x: UPPER_POOL.x, z: UPPER_POOL.z },
    preset: 'pond',
    quality: quality === 'performance' ? 'low' : 'medium',
    reflectionStrength: 0.68,
    rippleFoamStrength: 1.6,
    sceneQuality: quality,
    segmentsPerMeter: UPPER_POOL.segmentsPerMeter,
    shoreState: {
      region: {
        centerX: UPPER_POOL.x, centerZ: UPPER_POOL.z,
        depth: UPPER_POOL.depth, width: UPPER_POOL.width,
      },
      resolution: { x: 192, y: 160 },
    },
    simulation: { resolution: 128, worldSize: 6 },
    style: 'call_me_sensei',
    styleTarget: { targetId: 'garden/upper-pool' },
    waveAmplitude: 0.03,
    waveIntensity: 0.08,
    waveLength: 1.6,
    whitecapAmount: 0,
    width: UPPER_POOL.width,
    volumeDepth: 0.9,
    volumeOpacity: 0.6,
  });
  scene.add(upperPool);

  // --- 4. Stone -------------------------------------------------------------
  //
  // Doc 20 §1: "Japanese gardens are ABOUT stone. Set stones, stepping stones,
  // cascade rocks, gravel-sea islands — rock is the compositional subject."
  // Three catalog base shapes across five scale classes, each with its own
  // projection period and moss coverage — see props.js.
  //
  // D19-062 IS ACTIVE. Every material built through `installToonLabSurfaceLighting`
  // currently receives zero direct sun in a `createSceneStyleRuntime` scene, so
  // stone renders flat navy until the lighting owner lands the fix. Do not
  // grade this scene, and do not judge its composition, before then — grading
  // against navy stone measures the bug.
  onProgress('Setting the stone');
  const stone = await createGardenStone({ renderer, surface });
  scene.add(stone.group);

  // --- 5. Trees -------------------------------------------------------------
  // Added BEFORE the style bundle so scene-label discovery finds every canopy
  // and trunk material in one pass.
  onProgress('Planting the maples and pines');
  const trees = await createGardenTrees({ fog, surface });
  scene.add(trees.group);

  // INTEGRATION: ARCH-GDN-01 teahouse on the graded pad at (9.4, -4.6);
  // ARCH-GDN-02 gate at the path head (PATH.pointAt(0)) and wall along
  // BOUNDARY; PROP-GDN-01/02 lanterns, tsukubai, bridge, screens.

  // --- 6. Grass, moss and pond planting -------------------------------------
  //
  // Three roles, three silhouettes. The coastal pass proved that fields
  // differing only in blade count read as one plant across a whole scene; each
  // role here carries its own height band, colour, lean and distribution, and
  // its art direction is applied AFTER the bundle lands (D19-032 — the bundle's
  // grass slot calls applySettings and silently reverts per-field authoring).
  onProgress('Laying the moss');
  //
  // D19-087. `bladeHeightRange`, `bladeWidthRange`, `clumpRadius` and
  // `bladesPerClump` are GEOMETRY-time settings — they are baked into the clump
  // mesh at construction (`grassClump.js:704-732`). `field.applySettings()`
  // accepts all four and then only writes material uniforms, so authoring them
  // after the style bundle lands does exactly nothing and nothing warns. They
  // are therefore split here: `geometry` goes into the constructor, `settings`
  // is re-applied after the bundle (D19-032). Getting this wrong is what turned
  // a moss carpet into a waist-high wheat field in pass 1.
  const GRASS_ROLES = Object.freeze([
    Object.freeze({
      count: grassCount,
      // A moss carpet, not a lawn: 7–17 cm blades, narrow, packed into a tight
      // rosette so the colony reads as one velvet surface rather than as
      // countable blades.
      geometry: Object.freeze({
        bladeHeightRange: [0.07, 0.17],
        bladeWidthRange: [0.014, 0.03],
        bladesPerClump: 44,
        clumpRadius: 0.3,
      }),
      id: 'moss',
      mask: mossMask,
      minSpacing: 0.2,
      seed: 4_211,
      settings: Object.freeze({
        backlitStrength: 0.28,
        baseColor: [0.07, 0.17, 0.07],
        leanStrength: 0.09,
        tipColor: [0.24, 0.43, 0.14],
        washLift: 0.76,
        washOpacity: 0.9,
      }),
      variant: 'primary',
      wind: 0.025,
    }),
    Object.freeze({
      count: 1_100,
      // Ornamental clumps — hakonechloa scale, arching.
      geometry: Object.freeze({
        bladeHeightRange: [0.44, 0.92],
        bladeWidthRange: [0.05, 0.085],
        bladesPerClump: 26,
        clumpRadius: 0.42,
      }),
      id: 'clump',
      mask: clumpMask,
      minSpacing: 0.62,
      seed: 7_331,
      // Warmer and paler than the moss, so the pockets read as planting
      // rather than as long moss.
      settings: Object.freeze({
        backlitStrength: 0.62,
        baseColor: [0.16, 0.29, 0.08],
        leanStrength: 0.72,
        tipColor: [0.54, 0.68, 0.24],
        washOpacity: 0.7,
      }),
      variant: 'secondary',
      wind: 0.1,
    }),
  ]);

  const grassFields = [];
  const grassArea = { max: { x: 19, z: 19 }, min: { x: -19, z: -19 } };
  for (const role of GRASS_ROLES) {
    const field = await surface.createGrassField({
      ...role.geometry,
      count: role.count,
      groundAdoptStrength: 1,
      mask: role.mask,
      max: grassArea.max,
      min: grassArea.min,
      minSpacing: role.minSpacing,
      preset: 'call_me_sensei_clump',
      pushRadius: 1.0,
      quality, // 'high' would THROW — profiles are balanced|performance
      seed: role.seed,
      styleTarget: { targetId: `garden/grass-${role.id}` },
      variant: role.variant,
      waterMargin: 0.04,
    });
    field.setWind({
      direction: [0.62, -0.78],
      gustFrequency: 0.14,
      gustSpeed: 0.7,
      speed: 0.65,
      strength: role.wind,
    });
    scene.add(field);
    grassFields.push({ field, role });
  }

  // Pond-edge planting, distributed ALONG the pond margin's own curve frame.
  // This is the case `scatterInRect` cannot express (D19-066 / FILL-013): a
  // constant-width band around an irregular pond is not a rectangle with a hole
  // in it, and a boolean mask can only reject, never distribute. `scatterAlong`
  // spreads by arc length, so the fringe stays even around every lobe.
  onProgress('Planting the pond margin');
  const pondEdgePlacements = POND_MARGIN.scatterAlong({
    count: 1_500,
    heightAt: gardenHeight,
    mask: pondEdgeMask,
    minSpacing: 0.24,
    offsetRange: [-1.9, 0.15],
    seed: 5_309,
  });
  const pondEdgeField = await surface.createGrassField({
    // Geometry-time (D19-087): iris and sedge are tall, narrow and upright —
    // a genuinely different plant from both the moss and the clumps.
    bladeHeightRange: [0.66, 1.28],
    bladeWidthRange: [0.028, 0.05],
    bladesPerClump: 22,
    clumpRadius: 0.36,
    groundAdoptStrength: 0.7,
    placements: pondEdgePlacements,
    preset: 'call_me_sensei_clump',
    pushRadius: 0.9,
    quality,
    seed: 5_309,
    styleTarget: { targetId: 'garden/grass-pond-edge' },
    variant: 'secondary',
    waterMargin: 0.03,
  });
  pondEdgeField.setWind({
    direction: [0.62, -0.78], gustFrequency: 0.2, gustSpeed: 0.8, speed: 0.8, strength: 0.14,
  });
  scene.add(pondEdgeField);
  grassFields.push({
    field: pondEdgeField,
    role: {
      id: 'pond-edge',
      settings: Object.freeze({
        backlitStrength: 0.7,
        baseColor: [0.1, 0.26, 0.16],
        leanStrength: 0.16,
        tipColor: [0.42, 0.66, 0.34],
        washOpacity: 0.68,
      }),
    },
  });

  // INTEGRATION: grassFields.forEach(({field}) => field.setPushTarget(yua.carrier)).

  // --- 7. Sky ---------------------------------------------------------------
  onProgress('Building the sky');
  const sky = await createSkySystem({
    camera,
    godRays: true,
    quality: quality === 'performance' ? 'medium' : 'high',
    renderer,
    scene,
    // Kyoto latitude, so the sun path shape belongs to the place.
    timeOfDay: { autoAdvanceSecondsPerDay: 0, latitude: 35, time: TIME_OF_DAY / 24 },
  });

  // --- 8. Post + style runtime ---------------------------------------------
  onProgress('Lighting the garden');
  const post = createPostProcessingPipeline({
    camera,
    renderer,
    scene,
    settings: { preset: 'call_me_sensei' },
  });

  const runtime = createSceneStyleRuntime({
    collisionHeightAt: gardenHeight,
    fog,
    post,
    quality, // 'high' THROWS here
    renderer,
    // §6.5 asks for filmic tone mapping; that is a RENDERER setting, not a post
    // setting (D19-023).
    rendererConfiguration: {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.04,
    },
    scene,
    sky,
    timeOfDay: TIME_OF_DAY,
    water: pondWater,
  });

  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels',
    mode: 'strict',
    watch: true,
  });

  // partlyCloudy is the SkySystem physical preset (not a "scenario"), and is
  // the bundle's own physical default. Going through the runtime keeps the
  // style snapshot and the coordinated lighting frame intact.
  await runtime.setSkyPreset(SKY_PRESETS.partlyCloudy, { timeOfDay: TIME_OF_DAY });

  // DIAGNOSTIC (?cloudshadow=0)
  if (cloudShadow === false) clearEnvironmentCloudShadowPass();

  // D19-041. Unlike the 240 x 180 m coast, this world FITS the shipped Call Me
  // Sensei cascade (±34 m near / 140 m far), so the sizing is left alone and
  // only the map resolution and biases are authored for a 40 m scene. The pass
  // still renders nothing (`shadowPass.renderCount` stays 0), so the marker is
  // cleared when shadows are off — `sharedSunVisibility` then falls back to
  // float(1), the correct fail-OPEN behaviour for a pass that produced nothing.
  // Without that, every receiver samples cleared depth, tests as occluded, and
  // the direct sun term goes to exactly zero.
  let sun = null;
  scene.traverse((object) => { if (object.isDirectionalLight && object.shadow) sun = object; });
  if (sun) {
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.toonLabFarExtent = 46;
    sun.shadow.toonLabFarCameraFar = 140;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.normalBias = 0.03;
    sun.shadow.bias = -0.0004;
    sun.castShadow = shadows;
    if (!shadows) delete sun.shadow.toonLabLightingContract;
  }

  // §6.5 "directional layered clouds". The bundle's `cloud` slot resolves to
  // schema defaults (D19-006 / FILL-004), so the garden's sky is authored
  // explicitly: a high, slow, well-separated deck. A garden's sky is a quiet
  // ceiling — anything busier competes with the composition below it, and the
  // pond mirrors whatever is up there straight back into frame.
  sky.clouds.applyParams({
    shape: {
      altitude: 2_050,
      baseScale: 12_800,
      baseStrength: 0.92,
      coverage: 0.34,
      density: 0.041,
      thickness: 2_100,
      weatherScale: 46_000,
    },
    wind: { evolutionSpeed: 1.3, heading: 118, skew: 620, speed: 5.2 },
  });
  // "Restrained god rays": on, but well below the schema default of 2.
  sky.godRays.applyParams({ enabled: true, strength: 0.7 });

  // Per-field grass art direction, AFTER the bundle (D19-032).
  for (const { field, role } of grassFields) {
    field.applySettings({ preset: 'call_me_sensei', ...role.settings });
  }

  // §6.5 restrained bloom. The `call_me_sensei` post preset ships bloom off
  // (D19-025), so it is re-enabled explicitly, after the bundle lands. Kept
  // very small: the only things in this garden bright enough to bloom are the
  // pond's specular and the gravel, and both should stay readable.
  post.setSettings({
    features: { bloom: true },
    parameters: { bloomRadius: 0.09, bloomStrength: 0.11, bloomThreshold: 0.92 },
    preset: 'call_me_sensei',
  });

  // --- 9. Garden lighting authoring -----------------------------------------
  //
  // §2's shadow family: "warm, luminous, and COLOURED — never neutral grey …
  // violet-leaning in the shade masses, keeping them luminous rather than
  // crushed." The parity analysis measured benchmark shadow hues at 214–330°.
  //
  // The mechanism matters. `shadowTint` alone is a toon-response term; what
  // actually lights every N.L <= 0 surface in this rig is the SH sky probe,
  // because `ambientLight` is disabled by design. So the probe colour and
  // energy are authored too, plus `skyGroundTint` — the probe's lower
  // hemisphere, which here is physically the bounce off a pale raked-gravel
  // floor and is what keeps the moss shade warm instead of navy. `skyTopTint`
  // stays cool; that contrast is what makes the bounce read as bounce.
  //
  // D19-047: `shadowHue` currently measures the SUN's hue, not the shadows',
  // because there are no cast shadows to sample (D19-041). These values are
  // authored on art-direction grounds and must be RE-MEASURED once shadows
  // land. Do not tune them against the metric before then.
  const gardenLightingStyle = resolveLightingStylePreset('call-me-sensei');
  const GARDEN_KEYFRAME = Object.freeze({
    accentScale: 1.1,
    ambientScale: 1,
    exposureScale: 1.04,
    fixtureScale: 0,
    fogColor: [0.85, 0.86, 0.88],
    hour: TIME_OF_DAY,
    sky: { horizon: [0.8, 0.9, 1.04], stars: 0, zenith: [0.19, 0.48, 1.0] },
    // Warm bounce off the gravel sea and the pale paving, ~40°.
    skyGroundTint: [1.22, 1.06, 0.94],
    // ~278°: violet-leaning, and BRIGHT. "Luminous never-crushed shadows" is
    // the style's own stated intent, which the dawn interpolation defeats.
    skyProbeColor: [0.88, 0.83, 1.0],
    skyProbeEnergy: 1.22,
    skyTopTint: [0.88, 0.95, 1.14],
    sunColor: [1, 0.96, 0.88],
    sunIntensity: 7.4,
  });
  runtime.lighting?.setStyle({
    ...gardenLightingStyle,
    // Inserted, not replaced: hours 0/6/13/18/22 stay exactly as shipped, so
    // `setTimeOfDay` still sweeps smoothly through the garden keyframe.
    dayCycle: [...(gardenLightingStyle.dayCycle ?? []), GARDEN_KEYFRAME]
      .sort((a, b) => a.hour - b.hour),
    sunPath: {
      ...(gardenLightingStyle.sunPath ?? {}),
      azimuthOffset: GARDEN_SUN_AZIMUTH_OFFSET,
      heightScale: GARDEN_SUN_HEIGHT_SCALE,
    },
    toonResponse: {
      ...(gardenLightingStyle.toonResponse ?? {}),
      // ~272°. The shipped [0.42, 0.5, 0.85] is ~250° and reads blue rather
      // than violet against this much green.
      shadowTint: [0.7, 0.56, 0.92],
    },
  });
  runtime.setTimeOfDay(TIME_OF_DAY);

  // D19-043: the lighting system rewrites `renderer.toneMappingExposure` every
  // frame from its own day curve, so `rendererConfiguration.toneMappingExposure`
  // is accepted and then overwritten. Re-applied after `runtime.update` in the
  // frame loop below — the documented workaround, not a preference.
  const EXPOSURE = 1.04;

  // Ground scene state: waterLevel drives the Ground Shader's own damp band at
  // the pond margin, which is what marries the moss to the waterline.
  const lightingFrame = runtime.lighting?.frame ?? null;
  setGroundShaderSceneState(ground, {
    waterLevel: WATER_LEVEL,
    ...(lightingFrame?.sunDirection ? { sunDirection: lightingFrame.sunDirection } : {}),
  });

  // --- 10. The cascade ------------------------------------------------------
  let plungeClock = 0;
  let plungeIndex = 0;
  const plungePoint = { x: 0, y: 0, z: 0 };

  function driveCascade(delta) {
    plungeClock += delta;
    while (plungeClock >= PLUNGE_INTERVAL) {
      plungeClock -= PLUNGE_INTERVAL;
      plungeIndex += 1;
      // Golden-ratio sequence: evenly distributed across the lip, never
      // repeating, and identical run to run — so a capture is reproducible.
      const phase = (plungeIndex * 0.618_033_988_75) % 1;
      const offset = (phase - 0.5) * 2 * PLUNGE_SPREAD;
      plungePoint.x = CASCADE.plunge.x - CASCADE.axis.z * offset;
      plungePoint.z = CASCADE.plunge.z + CASCADE.axis.x * offset;
      pondWater.splash(plungePoint, { radius: 0.34, strength: 0.55 });
      // A second, wider ring every fourth impulse gives the plunge a slower
      // beat under the fast one, which is what stops it reading as a buzz.
      if (plungeIndex % 4 === 0) {
        pondWater.addRipple(plungePoint, { radius: 0.9, strength: 0.5 });
      }
      // The upper basin drains over its lip, so it is disturbed too.
      upperPool.addRipple(
        { x: UPPER_POOL.x + CASCADE.axis.x * 1.5, y: 0, z: UPPER_POOL.z + CASCADE.axis.z * 1.5 },
        { radius: 0.4, strength: 0.32 },
      );
    }
  }

  return {
    camera,
    fog,
    grassFields,
    ground,
    groundLayers,
    post,
    runtime,
    scene,
    sky,
    stone,
    surface,
    trees,
    upperPool,
    water: pondWater,
    yua: { mark: YUA_MARK, path: PATH, plantableMask },

    // Instance census for the density gate (parity analysis §3).
    census: Object.freeze({
      grassClumps: grassFields.reduce((total, { field }) => total + field.placements.length, 0),
      stone: stone.count,
      stoneByClass: stone.census,
      trees: trees.instances.length,
    }),

    applyShot(shotId) {
      const shot = SHOTS[shotId] ?? SHOTS.hero;
      camera.fov = shot.fov;
      camera.position.set(...shot.position);
      camera.updateProjectionMatrix();
      return new THREE.Vector3(...shot.target);
    },

    update(delta) {
      driveCascade(delta);
      for (const { field } of grassFields) field.update(delta, camera);
      trees.update(delta);
      sky.update(delta);
      pondWater.update(renderer, scene, camera, delta);
      upperPool.update(renderer, scene, camera, delta);
      runtime.update(delta, camera);
      // D19-043 — after the lighting frame, never before.
      renderer.toneMappingExposure = EXPOSURE;
    },

    resize(width, height, pixelRatio) {
      sky.resize?.(width, height);
      post.setSize(width, height, pixelRatio);
    },
  };
}
