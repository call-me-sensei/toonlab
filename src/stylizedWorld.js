import * as THREE from 'three';

import {
  applyEnvironmentShader,
  advanceEnvironmentShaderTime,
  setEnvironmentCloudShadow,
} from './environment/environmentMaterialAdapter.js';
import { resolveEnvironmentPreset } from './environment/environmentPresets.js';
import { createEnvironmentSunRig } from './environment/environmentRigs.js';
import { createEnvironmentSunShadowPass } from './environment/environmentSunShadowPass.js';
import { WaterSurface } from './water/waterSurface.js';
import { StylizedSky } from './sky/stylizedSky.js';
import { StylizedGrassField } from './vegetation/stylizedGrass.js';
import { StylizedFlowerField } from './vegetation/stylizedFlowers.js';
import { StylizedForest } from './vegetation/stylizedForest.js';
import {
  combineMasks,
  createSlopeMask,
  createWaterMask,
  scatterForest,
  scatterGrassAround,
} from './vegetation/scatter.js';
import { resolveWorldPreset } from './worldPresets.js';
import { createWorldCollision } from './worldCollision.js';

// The composed golden path: one call assembles a complete stylized outdoor
// world — environment-shaded terrain, sun rig, sky dome, interactive water,
// scattered trees/grass/flowers, shared cloud shadows — from a world preset,
// and returns a single update(delta) for the render loop. Import from
// '@call-me-sensei/toonlab'.
//
// The look of this library does not live in any single system; it emerges
// from the assembly (the sky feeds the water's reflections, the sun rig and
// fog set the palette, cloud shadows tie ground/canopy/water together). This
// function IS that assembly, so a host — human or coding agent — cannot
// accidentally ship the geometry without the look.
//
//   const world = await createStylizedWorld({
//     renderer, scene, camera,
//     terrain: { root: terrainMesh, heightAt, size: { width: 2000, depth: 2000 } },
//     water: { level: 8 },
//     followTarget: characterRoot,   // ripples, wakes, grass push-away
//   });
//
//   // render loop:
//   world.update(delta);
//   renderer.render(scene, camera); // or post.render(delta)
//
// Character/toon shading stays host-owned (applyToonShader +
// createCharacterRenderPasses), as does post-processing — both compose with
// this world untouched.

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Assembles a stylized outdoor world from a world preset.
 *
 * @param {Object} options
 * @param {THREE.Renderer} options.renderer Host renderer (water passes need it).
 * @param {THREE.Scene} options.scene Host scene; systems are added to it.
 * @param {THREE.PerspectiveCamera} [options.camera] When given (and
 *   `applyCamera` isn't false), the preset's near/far/fov are applied.
 * @param {Object} options.terrain `{ root, heightAt, size }` — `root` is the
 *   Object3D converted by the environment shader (required); `heightAt(x, z)`
 *   drives water bed, scatter placement, and slope/water masks (strongly
 *   recommended); `size` is `{ width, depth }` in meters for water extent and
 *   scatter radius defaults.
 * @param {string} [options.preset] World preset name (default 'outdoorGameplay').
 * @param {Object|false} [options.water] `{ level, width, depth, settings }`,
 *   or `false` to skip water.
 * @param {Object|false} [options.trees] `{ scatter, settings, center }`
 *   overrides over the world preset, or `false` to skip.
 * @param {Object|false} [options.grass] Same shape as trees, or `false`.
 * @param {Object|false} [options.flowers] `{ scatter, settings }`; off unless given.
 * @param {Object3D} [options.followTarget] Character root: water ripple
 *   window + interactor splashes/wakes, grass push-away.
 * @param {Object|false} [options.cloudShadows] `{ strength, coverage, scale,
 *   velocity }` shared across terrain, water, grass, and trees.
 * @param {boolean} [options.sun] Build the environment sun rig (default true).
 * @param {boolean} [options.applyCamera] Apply preset camera planes (default true).
 * @param {Object} [options.environment] Extra `applyEnvironmentShader`
 *   options merged last (features/parameters/roleOverrides/...).
 * @returns {Promise<Object>} `{ update, dispose, sky, water, sunRig, grass,
 *   flowerField, trees, treeGroup, masks, worldPreset, classification }`
 */
export async function createStylizedWorld({
  renderer,
  scene,
  camera = null,
  terrain,
  preset = 'outdoorGameplay',
  water = {},
  sky: skyOptions = {},
  fog = {},
  shadows = {},
  trees = {},
  grass = {},
  flowers = false,
  followTarget = null,
  cloudShadows = { strength: 0.35 },
  sun = true,
  applyCamera = true,
  environment = {},
} = {}) {
  if (!renderer || !scene) throw new Error('createStylizedWorld needs { renderer, scene }.');
  const terrainRoot = terrain?.root ?? null;
  if (!terrainRoot) throw new Error('createStylizedWorld needs terrain.root (the Object3D to shade).');
  const heightAt = typeof terrain?.heightAt === 'function' ? terrain.heightAt : null;

  const worldPreset = resolveWorldPreset(preset);
  if (!worldPreset) throw new Error(`Unknown world preset "${preset}".`);

  // terrain.size accepts a number (square), { width, depth }, or { x, z }
  // (the shape createStylizedTerrain returns as meshExtent) — silently
  // defaulting on an unrecognized shape mis-sizes the water plane.
  const sizeOption = terrain?.size;
  const width = Number(sizeOption?.width ?? sizeOption?.x ?? sizeOption) || 2000;
  const depth = Number(sizeOption?.depth ?? sizeOption?.z ?? sizeOption) || 2000;
  const halfExtent = Math.min(width, depth) / 2;

  // Camera planes and fov are part of the scale contract.
  if (camera && applyCamera !== false && worldPreset.camera) {
    if (Number.isFinite(worldPreset.camera.fov)) camera.fov = worldPreset.camera.fov;
    if (Number.isFinite(worldPreset.camera.near)) camera.near = worldPreset.camera.near;
    if (Number.isFinite(worldPreset.camera.far)) camera.far = worldPreset.camera.far;
    camera.updateProjectionMatrix();
  }

  // Environment shading over the terrain (and anything parented under it).
  const environmentBox = new THREE.Box3().setFromObject(terrainRoot);
  const environmentPreset = resolveEnvironmentPreset(worldPreset.environment?.preset ?? 'default') ?? {};
  const environmentOverrides = cleanObject(worldPreset.environment?.overrides);
  const classification = await applyEnvironmentShader(terrainRoot, {
    ...environmentPreset,
    ...environmentOverrides,
    ...cleanObject(environment),
    environmentBox,
    hasSun: sun !== false,
    parameters: {
      ...cleanObject(environmentPreset.parameters),
      ...cleanObject(environmentOverrides.parameters),
      ...cleanObject(cleanObject(environment).parameters),
    },
  });

  // Keep the light rig aligned with the sky's visible sun — a sky sun in one
  // place and light from another reads flat and wrong, and near-vertical
  // light hides every cast shadow under its caster.
  const skySunDirection = cleanObject(cleanObject(skyOptions).settings).sunDirection
    ?? cleanObject(worldPreset.sky?.settings).sunDirection;
  // Unified atmosphere: scene.fog reaches every material class — converted
  // environment surfaces, unlit forest impostors, rock clones — so distant
  // geometry fades into haze silhouettes together. (The environment
  // shader's height fog layers altitude nuance on top; without scene.fog,
  // impostor trees float sharp and saturated at any distance.)
  let sceneFog = null;
  if (fog !== false) {
    const fogOptions = cleanObject(fog);
    const fogColor = fogOptions.color
      ?? cleanObject(environmentOverrides.parameters).heightFogColor
      ?? cleanObject(cleanObject(environment).parameters).heightFogColor
      ?? [0.72, 0.83, 0.94];
    const presetFar = Number(worldPreset.camera?.far) || 600;
    sceneFog = new THREE.Fog(
      new THREE.Color(...(Array.isArray(fogColor) ? fogColor : [fogColor])),
      Number(fogOptions.near) || presetFar * 0.3,
      Number(fogOptions.far) || presetFar * 1.4,
    );
    scene.fog = sceneFog;
  }

  // Resolved height-fog parameters (preset overrides, then host overrides).
  // Water and forest impostors mirror this layer — any surface that skips it
  // stays sharp against hazed terrain and reads as pasted-on.
  const heightFogParams = {
    ...cleanObject(environmentOverrides.parameters),
    ...cleanObject(cleanObject(environment).parameters),
  };

  const sunRig = sun !== false
    ? createEnvironmentSunRig({
      environmentBox,
      scene,
      ...(Array.isArray(skySunDirection) ? {
        sourceRatios: {
          x: skySunDirection[0],
          y: Math.max(skySunDirection[1], 0.2),
          z: skySunDirection[2],
        },
      } : {}),
    })
    : null;

  // Shadows are ON by default — a character that casts nothing on the grass
  // is the fastest way for a stylized world to read fake. The renderer's
  // shadow maps are enabled, everything under the terrain root casts and
  // receives, the follow target casts, and — critically — the sun's shadow
  // camera is shrunk to a window (default 140 m) that FOLLOWS the target:
  // one map stretched across a whole open world has no texel density left
  // for a character-sized shadow. Pass `shadows: false` to opt out, or
  // `shadows: { area }` to resize the window.
  const shadowOptions = cleanObject(shadows);
  const shadowArea = shadows === false ? 0 : Number(shadowOptions.area) || 140;
  let sunShadowOffset = null;
  if (shadowArea > 0) {
    if (renderer.shadowMap) renderer.shadowMap.enabled = true;
    terrainRoot.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    followTarget?.traverse?.((object) => {
      if (object.isMesh) object.castShadow = true;
    });
    if (sunRig?.light) {
      const light = sunRig.light;
      const shadowCamera = light.shadow.camera;
      shadowCamera.left = -shadowArea;
      shadowCamera.right = shadowArea;
      shadowCamera.top = shadowArea;
      shadowCamera.bottom = -shadowArea;
      shadowCamera.near = 0.5;
      shadowCamera.far = shadowArea * 6 + 400;
      shadowCamera.updateProjectionMatrix();
      // Tight window + high sun → self-shadow acne on flat ground without a
      // healthy normal bias.
      light.shadow.normalBias = Math.max(light.shadow.normalBias ?? 0, 0.5);
      // Derive the shadow sun's direction from the sky's actual sun vector.
      // (Deriving it from the rig light's box-relative position warps the
      // elevation by the terrain box's aspect ratio — a 2 km × 200 m box
      // squashes a 2 PM sun nearly horizontal, and shadows land tens of
      // meters away from their casters.)
      const direction = Array.isArray(skySunDirection)
        ? new THREE.Vector3(
          skySunDirection[0],
          Math.max(skySunDirection[1], 0.15),
          skySunDirection[2],
        )
        : light.position.clone().sub(environmentBox.getCenter(new THREE.Vector3()));
      sunShadowOffset = direction.normalize().multiplyScalar(shadowArea * 3 + 120);
      scene.add(light.target);
    }
  }
  // On the TSL/WebGPU backends three's shadow system is bypassed by design;
  // this pass renders the sun's shadow map each frame and publishes it to
  // the environment and character shaders. Without it there are NO shadows,
  // regardless of castShadow flags — which is why the composed world owns it.
  const sunShadowPass = shadowArea > 0 && sunRig?.light
    ? createEnvironmentSunShadowPass({ renderer, scene })
    : null;
  const shadowInterval = Math.max(Math.trunc(shadowOptions.interval ?? 2), 1);
  let shadowFrame = 0;

  const followSunShadow = () => {
    if (!sunShadowOffset || !sunRig?.light) return;
    const focus = followTarget?.position ?? camera?.position;
    if (!focus) return;
    sunRig.light.position.copy(focus).add(sunShadowOffset);
    sunRig.light.target.position.copy(focus);
    sunRig.light.target.updateMatrixWorld();
  };
  followSunShadow();

  // Sky dome — the water's reflection fallback, so it comes before water.
  const sky = new StylizedSky({
    preset: worldPreset.sky?.preset,
    ...cleanObject(worldPreset.sky?.settings),
    ...cleanObject(cleanObject(skyOptions).settings),
  });
  scene.add(sky);

  // Water with the terrain as its bed: waves shoal and break on real shores.
  const waterLevel = Number(cleanObject(water).level) || 0;
  let waterSurface = null;
  if (water !== false) {
    const waterOptions = cleanObject(water);
    waterSurface = new WaterSurface({
      preset: worldPreset.water?.preset,
      width: Number(waterOptions.width) || width,
      depth: Number(waterOptions.depth) || depth,
      ...(heightAt ? { bedHeight: heightAt } : {}),
      ...cleanObject(waterOptions.settings),
    });
    waterSurface.position.y = waterLevel;
    // Match the environment's height fog so far-shore water hazes exactly
    // like the terrain behind it (mismatch reads as water slicing into the
    // mountains).
    waterSurface.setDistanceFog?.({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      density: Number(heightFogParams.heightFogDensity) || 0.0016,
    });
    scene.add(waterSurface);
    if (followTarget) {
      waterSurface.addInteractor(followTarget, { radius: 0.35 });
      waterSurface.setFollowTarget(followTarget);
    }
  }

  // Placement masks: no vegetation on cliffs or under water.
  const masks = heightAt
    ? {
      slope: createSlopeMask({ heightAt, maxSlope: 0.55 }),
      water: createWaterMask({ heightAt, margin: 0.4, waterLevel }),
    }
    : null;
  const vegetationMask = masks ? combineMasks(masks.slope, masks.water) : null;
  const defaultCenter = followTarget?.position ?? { x: 0, z: 0 };
  // Per-system custom masks (e.g. a createNoisePatchMask forest-cluster
  // mask) AND with the built-in slope/water masks.
  const withWorldMask = (custom) => {
    if (typeof custom !== 'function') return vegetationMask;
    return vegetationMask ? combineMasks(vegetationMask, custom) : custom;
  };

  // Trees: LOD forest. Far placements render as baked instanced impostors
  // (a couple of draw calls per variant); a budgeted pool of live detailed
  // trees swaps in around the camera. See StylizedForest.
  let forest = null;
  if (trees !== false) {
    const treeOptions = cleanObject(trees);
    const placements = scatterForest({
      ...cleanObject(worldPreset.trees?.scatter),
      center: treeOptions.center ?? defaultCenter,
      radius: Math.min(cleanObject(treeOptions.scatter).radius
        ?? cleanObject(worldPreset.trees?.scatter).radius ?? halfExtent, halfExtent),
      ...cleanObject(treeOptions.scatter),
      heightAt,
      mask: withWorldMask(treeOptions.mask),
    });
    forest = new StylizedForest({
      canopyColors: treeOptions.canopyColors ?? worldPreset.trees?.canopyColors ?? null,
      placements,
      preset: worldPreset.trees?.preset,
      // Billboard far-LOD: without the renderer the forest falls back to
      // merged-geometry impostors (~12k verts/tree) that get redrawn by the
      // main, water, and shadow passes — the difference between 20 and 60 fps.
      renderer,
      settings: {
        ...cleanObject(worldPreset.trees?.settings),
        ...cleanObject(treeOptions.settings),
      },
      ...cleanObject(treeOptions.lod),
    });
    // Same height-fog layer the terrain and water get: without it, far
    // impostor canopies only receive the linear scene.fog and float on the
    // fogged mountains as saturated green dots.
    forest.setDistanceFog({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      density: Number(heightFogParams.heightFogDensity) || 0.0016,
      falloff: Number(heightFogParams.heightFogFalloff) || 400,
      floorY: environmentBox.min.y,
    });
    scene.add(forest);
  }

  // Grass: a density-based window that follows the target. Placements are
  // construction-only, so when the target strays past half the radius the
  // field is rebuilt at the new center and swapped; a distance fade hides
  // the window edge. Far grass simply doesn't exist — same as the anime
  // games this emulates.
  let grassField = null;
  const grassState = { center: null, options: cleanObject(grass), radius: 0 };
  const buildGrassAt = (center) => {
    const grassOptions = grassState.options;
    const scatterSpec = {
      ...cleanObject(worldPreset.grass?.scatter),
      ...cleanObject(grassOptions.scatter),
    };
    grassState.radius = Number(scatterSpec.radius) || 45;
    const placements = scatterGrassAround({
      ...scatterSpec,
      center,
      heightAt,
      mask: withWorldMask(grassOptions.mask),
    });
    if (placements.length === 0) return null;
    const field = new StylizedGrassField({
      preset: worldPreset.grass?.preset,
      ...cleanObject(worldPreset.grass?.settings),
      ...cleanObject(grassOptions.settings),
      placements,
    });
    field.setDistanceFade({ end: grassState.radius * 0.98, start: grassState.radius * 0.62 });
    // 300k blades re-rendered into the water reflection, refraction grab,
    // and depth passes is pure cost — grass sits above the waterline, so
    // its contribution to all three is invisible at gameplay angles.
    // (waterExclude hides from every water scene pass.)
    field.userData.waterExclude = true;
    scene.add(field);
    if (followTarget) field.setPushTarget(followTarget);
    grassState.center = { x: Number(center.x) || 0, z: Number(center.z) || 0 };
    return field;
  };
  if (grass !== false) {
    grassField = buildGrassAt(cleanObject(grass).center ?? defaultCenter);
  }
  const refreshGrassWindow = () => {
    if (grass === false || !followTarget || !grassState.center) return;
    const dx = followTarget.position.x - grassState.center.x;
    const dz = followTarget.position.z - grassState.center.z;
    if (dx * dx + dz * dz < (grassState.radius * 0.5) ** 2) return;
    const previous = grassField;
    grassField = buildGrassAt(followTarget.position) ?? previous;
    if (previous && grassField !== previous) {
      scene.remove(previous);
      previous.dispose();
    }
  };

  let flowerField = null;
  if (flowers) {
    const flowerOptions = cleanObject(flowers);
    const placements = scatterGrassAround({
      center: flowerOptions.center ?? defaultCenter,
      density: 0.4,
      radius: 30,
      seed: 11,
      ...cleanObject(flowerOptions.scatter),
      heightAt,
      mask: withWorldMask(flowerOptions.mask),
    });
    if (placements.length > 0) {
      flowerField = new StylizedFlowerField({
        ...cleanObject(flowerOptions.settings),
        placements,
      });
      scene.add(flowerField);
    }
  }

  // Walkability: circle blockers on a spatial hash, tree trunks
  // pre-registered, so characters can't walk through the world ToonLab just
  // built. Hosts add their own blockers (rocks, props) via
  // `world.collision.addCircles(...)` and call
  // `world.collision.resolve(character.position, radius)` per frame.
  const collision = createWorldCollision({ heightAt });
  if (forest) {
    const trunkScale = [
      cleanObject(cleanObject(trees).settings).size,
      cleanObject(worldPreset.trees?.settings).size,
      3.2,
    ].map(Number).find(Number.isFinite);
    const trunkRadius = Math.max(0.13 * trunkScale, 0.2);
    collision.addCircles(forest.placements.map((p) => ({ radius: trunkRadius, x: p.x, z: p.z })));
  }

  // One cloud-shadow field across terrain shader, water, grass, and canopies.
  const applyCloudShadow = (field) => {
    setEnvironmentCloudShadow(field);
    waterSurface?.setCloudShadow(field);
    grassField?.setCloudShadow(field);
    forest?.setCloudShadow(field);
  };
  if (cloudShadows !== false) applyCloudShadow(cleanObject(cloudShadows));

  let disposed = false;
  return {
    classification,
    collision,
    dispose() {
      if (disposed) return;
      disposed = true;
      sunShadowPass?.dispose();
      forest?.dispose();
      for (const object of [sky, waterSurface, forest, grassField, flowerField, sunRig?.group ?? sunRig]) {
        if (object?.parent) object.parent.remove(object);
      }
    },
    flowerField,
    fog: sceneFog,
    forest,
    get grass() { return grassField; },
    masks,
    setCloudShadow: applyCloudShadow,
    sky,
    sunRig,
    /** Call once per frame before rendering. */
    update(delta = 0.016) {
      if (disposed) return;
      advanceEnvironmentShaderTime(delta);
      followSunShadow();
      // Rendering the shadow map is a full scene pass; alternate frames are
      // imperceptible for a sun that barely moves (shadows.interval: 1 to
      // force every frame).
      shadowFrame += 1;
      if (sunShadowPass && shadowFrame % shadowInterval === 0) sunShadowPass.update();
      refreshGrassWindow();
      waterSurface?.update(renderer, scene, camera, delta);
      sky.update(delta, camera);
      grassField?.update(delta);
      flowerField?.update(delta);
      forest?.update(delta, camera);
    },
    water: waterSurface,
    worldPreset,
  };
}
