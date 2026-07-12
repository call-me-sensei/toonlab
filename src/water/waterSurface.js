import * as THREE from 'three';

import {
  applyWaterSettingsToMaterial,
  createWaterMaterial,
  setWaterDebugMode,
  updateWaterMaterialCamera,
} from './waterMaterial.js';
import { WaterBreakerSystem } from './waterBreakerSystem.js';
import { WaterInteractionManager } from './waterInteraction.js';
import { WaterRippleSimulation } from './waterRippleSimulation.js';
import { WaterScenePasses } from './waterScenePasses.js';
import { WaterSplashSystem } from './waterSplashSystem.js';
import {
  createWaterSettings,
  sampleGerstnerHeight,
} from './waterSettings.js';

const worldPositionScratch = new THREE.Vector3();
const localScratch = new THREE.Vector3();
const breakerSampleScratch = { weight: 0, crestY: 0, flowX: 0, flowZ: 0 };
const followScratch = new THREE.Vector3();

// All-in-one stylized water body: surface mesh + material, GPU ripple
// simulation, splash particles, interaction tracking, and the scene passes
// that feed refraction/reflection. One update() call per frame drives
// everything:
//
//   const water = new WaterSurface({ width: 18, depth: 22, preset: 'lake' });
//   water.position.y = 0.36;
//   scene.add(water);
//   ...
//   water.update(renderer, scene, camera, delta);  // before renderer.render
//
// The surface must stay axis-aligned (translation only); rotating the water
// plane is not supported by the interaction/reflection math.
export class WaterSurface extends THREE.Mesh {
  constructor({
    width = 20,
    depth = 20,
    segmentsPerMeter = 5,
    maxSegments = 380,
    simulation = {},
    splashes = {},
    passes = {},
    interaction = {},
    follow = null,
    bedHeight = null,
    ...settingsOptions
  } = {}) {
    const settings = createWaterSettings(settingsOptions);
    const segmentsX = Math.min(maxSegments, Math.max(16, Math.round(width * segmentsPerMeter)));
    const segmentsZ = Math.min(maxSegments, Math.max(16, Math.round(depth * segmentsPerMeter)));
    const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
    geometry.rotateX(-Math.PI / 2);

    // `shoaling` is the WATER_SHOALING signal for the TSL factory branch
    // (graph shape must be known at creation); createWaterSettings drops the
    // key, so the classic ShaderMaterial path is untouched by it.
    super(geometry, createWaterMaterial(
      typeof bedHeight === 'function' ? { ...settings, shoaling: true } : settings,
    ));
    this.name = 'WaterSurface';
    this.width = width;
    this.depth = depth;
    this.settings = this.material.userData.waterSettings;
    this.time = 0;
    this.followTarget = follow;
    // Displaced waves escape the flat-plane bounds; skip culling entirely.
    this.frustumCulled = false;
    // Scene shadows from rocks, trees, and the character darken the surface.
    this.receiveShadow = true;

    // Optional terrain sampler (x, z) => world-space bed height. Enables
    // shoaling: waves flatten in shallow water instead of clipping through
    // shores/islands. Vertex bed heights bake in update() and re-bake
    // whenever the surface's world XZ moves (>5cm) from where it was baked —
    // immune to first-frame ordering races where the mesh isn't positioned
    // yet. The terrain itself is assumed static.
    this.bedHeightSampler = typeof bedHeight === 'function' ? bedHeight : null;
    this.shoalingBakedX = NaN;
    this.shoalingBakedZ = NaN;
    // Dedicated plunging-breaker shells along the break line; created lazily
    // in update() when settings.breakerAmount > 0 and a bed sampler exists.
    this.breakers = null;
    this.breakerBuilt = { x: NaN, y: NaN, z: NaN, energy: NaN };
    if (this.bedHeightSampler) {
      this.material.defines = { ...this.material.defines, WATER_SHOALING: 1 };
    }

    this.simulationEnabled = simulation !== false;
    this.ripples = this.simulationEnabled
      ? new WaterRippleSimulation({
        resolution: simulation.resolution ?? 256,
        worldWidth: Math.min(simulation.worldSize ?? width, width),
        worldDepth: Math.min(simulation.worldSize ?? depth, depth),
      })
      : null;

    this.splashesEnabled = splashes !== false;
    this.splashSystem = this.splashesEnabled
      ? new WaterSplashSystem({ ...(splashes || {}), settings: this.settings })
      : null;
    if (this.splashSystem) {
      this.add(this.splashSystem);
      // Foam rings evaluate the same Gerstner stack to drape over the swell.
      this.splashSystem.attachWaveUniforms(this.material);
    }

    this.passesEnabled = passes !== false;
    this.passes = this.passesEnabled ? new WaterScenePasses(passes || {}) : null;

    this.interactions = new WaterInteractionManager(this, interaction || {});

    this.syncSimulationParameters();
  }

  get gerstnerWaves() {
    return this.material.userData.gerstnerWaves ?? [];
  }

  syncSimulationParameters() {
    this.ripples?.setParameters({
      rippleDamping: this.settings.rippleDamping,
      ripplePropagation: this.settings.ripplePropagation,
      rippleFoamDecay: this.settings.rippleFoamDecay,
      rippleFoamGain: this.settings.rippleFoamGain,
    });
  }

  // Merges option overrides into the current settings (pass { preset } to
  // switch presets while keeping explicit overrides you re-supply).
  applySettings(options = {}) {
    applyWaterSettingsToMaterial(this.material, { ...this.settings, ...options });
    this.settings = this.material.userData.waterSettings;
    this.splashSystem?.applySettings(this.settings);
    this.syncSimulationParameters();
    return this.settings;
  }

  // Loads a preset from scratch (unlike applySettings, prior overrides drop).
  setPreset(name, overrides = {}) {
    applyWaterSettingsToMaterial(this.material, { preset: name, ...overrides });
    this.settings = this.material.userData.waterSettings;
    this.splashSystem?.applySettings(this.settings);
    this.syncSimulationParameters();
    return this.settings;
  }

  setDebugMode(mode) {
    setWaterDebugMode(this.material, mode);
    return this;
  }

  // Drifting procedural cloud shadows over the surface — same field as the
  // grass/tree/terrain helpers so a passing cloud dims the scene together.
  // strength 0 (the default) disables. velocity is uv-space drift per second.
  /**
   * Exponential distance fog matching the environment shader's height fog —
   * without it, far-shore water stays bright against fogged terrain.
   * `createStylizedWorld` wires this automatically from the environment's
   * heightFog parameters. `density: 0` disables.
   */
  setDistanceFog({ color, density } = {}) {
    const uniforms = this.material.uniforms;
    if (uniforms.uDistanceFogDensity === undefined) return this;
    if (density !== undefined) uniforms.uDistanceFogDensity.value = Math.max(Number(density) || 0, 0);
    if (color !== undefined) {
      const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
      uniforms.uDistanceFogColor.value.copy(next);
    }
    return this;
  }

  setCloudShadow({ strength, coverage, scale, velocity } = {}) {
    const uniforms = this.material.uniforms;
    if (Number.isFinite(strength)) uniforms.uCloudShadowStrength.value = strength;
    if (Number.isFinite(coverage)) uniforms.uCloudShadowCoverage.value = coverage;
    if (Number.isFinite(scale)) uniforms.uCloudShadowScale.value = scale;
    if (velocity) {
      uniforms.uCloudShadowVelocity.value.set(
        velocity[0] ?? velocity.x ?? 0, velocity[1] ?? velocity.y ?? 0);
    }
    return this;
  }

  setFollowTarget(target) {
    this.followTarget = target;
    return this;
  }

  get waveEnergy() {
    return this.material.userData.waterWaveEnergy ?? 0.3;
  }

  // World-space wave height of the rendered Gerstner surface at (x, z).
  // Interactive ripples live on the GPU and are not included; for buoyancy
  // the analytic swell is the part that matters.
  getHeightAt(x, z) {
    this.getWorldPosition(worldPositionScratch);
    const surfaceY = worldPositionScratch.y;
    return surfaceY + this.relativeSurfaceHeightAt(x, z, surfaceY);
  }

  // Surface height relative to the rest level — the exact CPU mirror of the
  // vertex shader's shoaling/breaking/swash displacement, so buoyancy, swim
  // floats, and splash anchors sit on the rendered surface everywhere,
  // including the surf zone and the run-up film on the beach.
  relativeSurfaceHeightAt(x, z, surfaceY) {
    if (!this.bedHeightSampler) {
      return sampleGerstnerHeight(this.gerstnerWaves, x, z, this.time);
    }
    const settings = this.settings;
    const bed = this.bedHeightSampler(x, z);
    const restDepth = surfaceY - bed;
    const energy = Math.max(this.waveEnergy, 1e-3);
    const range = Math.max(settings.shoalingDepth ?? 1.4, energy * 2.2, 1e-3);
    // Mirror of the vertex shader's shallow-water chop filter.
    const chopWeight = THREE.MathUtils.lerp(
      0.15, 1, THREE.MathUtils.smoothstep(restDepth, range * 0.3, range * 1.4));
    const raw = sampleGerstnerHeight(this.gerstnerWaves, x, z, this.time, chopWeight);
    const deepFactor = THREE.MathUtils.smoothstep(restDepth, 0, range);
    const rearUp = (1 - THREE.MathUtils.smoothstep(restDepth, range * 0.45, range * 1.5)) *
      THREE.MathUtils.smoothstep(restDepth, 0.05, 0.35);
    const shoal = THREE.MathUtils.lerp(settings.shorelineWaves ?? 0.35, 1, deepFactor) *
      (1 + 0.3 * rearUp);
    const targetY = raw * shoal;
    const capY = 0.72 * Math.max(restDepth, 0);
    const brokenY = Math.max(
      Math.min(targetY, capY) + Math.max(targetY - capY, 0) * 0.1,
      -Math.max(restDepth, 0) + 0.04);
    const wavePhase = THREE.MathUtils.clamp(raw / energy, -1, 1);
    const runup = (settings.shorelineRunup ?? 0.6) * energy * Math.max(wavePhase, 0);
    const film = THREE.MathUtils.clamp(restDepth + runup, -0.2, 0.05);
    const filmY = (bed - surfaceY) + film;
    const beach = 1 - THREE.MathUtils.smoothstep(restDepth, -0.02, 0.06);
    const base = THREE.MathUtils.lerp(brokenY, filmY, beach);

    // Breakers are physical: blend the traveling shell face over the base
    // surface so buoyant objects (and the swimmer) ride up the wave as it
    // passes and drop behind it. The blend keeps the base where the shell
    // envelope fades out, so there is never a height discontinuity.
    if (this.breakers) {
      const shell = this.breakers.sampleAt(x, z, breakerSampleScratch);
      if (shell.weight > 0.001 && shell.crestY > base) {
        return base + (shell.crestY - base) * shell.weight;
      }
    }
    return base;
  }

  // Horizontal water push velocity (m/s, world space) at (x, z) — currently
  // the shoreward surge of a passing breaker: strongest in the whitewater
  // just after the wave breaks, modest on the unbroken face. Zero elsewhere.
  // Feed it to floating bodies and swimmers so surf actually carries them.
  getFlowAt(x, z, out = new THREE.Vector2()) {
    out.set(0, 0);
    if (this.breakers) {
      const shell = this.breakers.sampleAt(x, z, breakerSampleScratch);
      out.set(shell.flowX, shell.flowZ);
    }
    return out;
  }

  // 0..1 local wave motion scale — how much of the open-water swell survives
  // at (x, z). Splash sheets use it to damp their wave-conforming drape in
  // the shallows and on the beach film.
  waveScaleAt(x, z, surfaceY) {
    if (!this.bedHeightSampler) return 1;
    const restDepth = surfaceY - this.bedHeightSampler(x, z);
    const range = Math.max(
      this.settings.shoalingDepth ?? 1.4, Math.max(this.waveEnergy, 1e-3) * 2.2, 1e-3);
    const deepFactor = THREE.MathUtils.smoothstep(restDepth, 0, range);
    const beach = 1 - THREE.MathUtils.smoothstep(restDepth, -0.02, 0.06);
    return THREE.MathUtils.lerp(this.settings.shorelineWaves ?? 0.35, 1, deepFactor) *
      (1 - beach);
  }

  // Samples the terrain under every vertex and stores it as the aBedHeight
  // attribute the vertex shader reads. update() re-runs this automatically
  // when the surface's world XZ has moved since the last bake.
  bakeShoalingDepths() {
    if (!this.bedHeightSampler) return this;
    this.updateWorldMatrix(true, false);
    const positionAttr = this.geometry.attributes.position;
    const existing = this.geometry.attributes.aBedHeight;
    const bedHeights = existing?.count === positionAttr.count
      ? existing.array
      : new Float32Array(positionAttr.count);
    for (let i = 0; i < positionAttr.count; i += 1) {
      localScratch.fromBufferAttribute(positionAttr, i).applyMatrix4(this.matrixWorld);
      bedHeights[i] = this.bedHeightSampler(localScratch.x, localScratch.z);
    }
    if (existing?.array === bedHeights) {
      existing.needsUpdate = true;
    } else {
      this.geometry.setAttribute('aBedHeight', new THREE.BufferAttribute(bedHeights, 1));
    }
    this.getWorldPosition(worldPositionScratch);
    this.shoalingBakedX = worldPositionScratch.x;
    this.shoalingBakedZ = worldPositionScratch.z;
    return this;
  }

  // Lifecycle for the breaker shells: creates/disposes with the
  // breakerAmount setting and rebuilds the break line whenever the surface
  // moves or the swell energy shifts enough to relocate the collapse depth.
  updateBreakers() {
    const enabled = this.settings.breakerEnabled !== false &&
      this.bedHeightSampler && (this.settings.breakerAmount ?? 0) > 0.001;
    if (!enabled) {
      if (this.breakers) {
        this.remove(this.breakers);
        this.breakers.dispose();
        this.breakers = null;
        this.breakerBuilt.x = NaN;
      }
      return;
    }
    if (!this.breakers) {
      this.breakers = new WaterBreakerSystem();
      this.breakers.attachWaveUniforms(this.material);
      this.add(this.breakers);
    }
    this.getWorldPosition(worldPositionScratch);
    const energy = this.waveEnergy;
    const built = this.breakerBuilt;
    const unchanged =
      Math.abs(worldPositionScratch.x - built.x) <= 0.05 &&
      Math.abs(worldPositionScratch.y - built.y) <= 0.02 &&
      Math.abs(worldPositionScratch.z - built.z) <= 0.05 &&
      Math.abs(energy - built.energy) <= 0.03;
    if (!unchanged) {
      this.breakers.rebuild({
        bedSampler: this.bedHeightSampler,
        originX: worldPositionScratch.x,
        originZ: worldPositionScratch.z,
        surfaceY: worldPositionScratch.y,
        width: this.width,
        depth: this.depth,
        settings: this.settings,
        waveEnergy: energy,
        waves: this.gerstnerWaves,
      });
      built.x = worldPositionScratch.x;
      built.y = worldPositionScratch.y;
      built.z = worldPositionScratch.z;
      built.energy = energy;
    }
    this.breakers.configure(this.settings, energy, this.gerstnerWaves);
    this.breakers.update(this.time);
  }

  containsPoint(x, z, margin = 0) {
    this.getWorldPosition(worldPositionScratch);
    return Math.abs(x - worldPositionScratch.x) <= this.width * 0.5 - margin &&
      Math.abs(z - worldPositionScratch.z) <= this.depth * 0.5 - margin;
  }

  worldToLocalPoint(worldPoint, out = localScratch) {
    this.getWorldPosition(worldPositionScratch);
    return out.set(
      (worldPoint.x ?? 0) - worldPositionScratch.x,
      (worldPoint.y ?? worldPositionScratch.y) - worldPositionScratch.y,
      (worldPoint.z ?? 0) - worldPositionScratch.z,
    );
  }

  // Composite splash at a world position: particles + a downward impulse and
  // an outward ring wave in the ripple simulation.
  splash(worldPoint, { strength = 1, radius = 0.5 } = {}) {
    const local = this.worldToLocalPoint(worldPoint);
    local.y = this.relativeSurfaceHeightAt(
      worldPoint.x ?? 0, worldPoint.z ?? 0, worldPositionScratch.y);
    this.splashSystem?.emitSplash(local, { strength });
    if (this.ripples) {
      const impulse = strength * this.settings.rippleStrength;
      this.ripples.addImpulse(worldPoint.x, worldPoint.z, {
        radius: radius,
        strength: -1.1 * impulse,
      });
      this.ripples.addRingImpulse(worldPoint.x, worldPoint.z, {
        radius: radius * 1.1,
        strength: 0.55 * impulse,
      });
    }
    return this;
  }

  // Plain ripple impulse (no particles) — wakes, rain, gentle touches.
  addRipple(worldPoint, { radius = 0.4, strength = 0.4 } = {}) {
    this.ripples?.addImpulse(worldPoint.x, worldPoint.z, {
      radius,
      strength: strength * this.settings.rippleStrength,
    });
    return this;
  }

  // Small droplet burst without rings/crown — bow spray on fast movers.
  sprayAt(worldPoint, { count = 4, strength = 0.4 } = {}) {
    if (!this.splashSystem) return this;
    const local = this.worldToLocalPoint(worldPoint);
    local.y = Math.max(local.y, 0);
    this.splashSystem.emitDroplets(local, { count, strength });
    return this;
  }

  // source: Object3D | (outVector3) => position | { getPosition }.
  addInteractor(source, options = {}) {
    return this.interactions.add(source, options);
  }

  removeInteractor(id) {
    this.interactions.remove(id);
  }

  // Call once per frame before rendering the scene.
  update(renderer, scene, camera, delta) {
    const clampedDelta = Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    this.time += clampedDelta;

    if (this.bedHeightSampler) {
      this.getWorldPosition(worldPositionScratch);
      const movedX = Math.abs(worldPositionScratch.x - this.shoalingBakedX);
      const movedZ = Math.abs(worldPositionScratch.z - this.shoalingBakedZ);
      if (!(movedX <= 0.05 && movedZ <= 0.05)) this.bakeShoalingDepths();
    }
    this.updateBreakers();

    if (this.ripples) {
      this.getWorldPosition(worldPositionScratch);
      if (this.followTarget) {
        const target = typeof this.followTarget === 'function'
          ? this.followTarget(followScratch)
          : this.followTarget.getWorldPosition?.(followScratch) ?? this.followTarget;
        if (target && Number.isFinite(target.x)) this.ripples.setCenter(target.x, target.z);
      } else {
        this.ripples.setCenter(worldPositionScratch.x, worldPositionScratch.z);
      }
      this.ripples.update(renderer, clampedDelta);
    }

    this.interactions.update(clampedDelta);
    if (this.splashSystem) {
      // Crowns and foam rings hug the animated surface: rewrite their anchor
      // heights from the same displacement math the mesh uses, so they never
      // hover above a trough or drown under a crest. The wave-scale sampler
      // lets the sheet shader drape ring geometry over the local swell.
      this.getWorldPosition(worldPositionScratch);
      const surfaceX = worldPositionScratch.x;
      const surfaceY = worldPositionScratch.y;
      const surfaceZ = worldPositionScratch.z;
      this.splashSystem.updateSurfaceHeights(
        (localX, localZ) =>
          this.relativeSurfaceHeightAt(localX + surfaceX, localZ + surfaceZ, surfaceY),
        (localX, localZ) =>
          this.waveScaleAt(localX + surfaceX, localZ + surfaceZ, surfaceY),
      );
      this.splashSystem.update(this.time, renderer);
    }

    const uniforms = this.material.uniforms;
    uniforms.uTime.value = this.time;
    // Mirror scene.fog so distant water hazes with the rest of the world
    // (the material handles fog manually — see uSceneFog* in the shader;
    // setDistanceFog adds the environment-matching exponential layer).
    if (scene?.fog?.isFog) {
      uniforms.uSceneFogColor.value.copy(scene.fog.color);
      uniforms.uSceneFogNear.value = scene.fog.near;
      uniforms.uSceneFogFar.value = scene.fog.far;
    } else {
      uniforms.uSceneFogFar.value = 0;
    }
    updateWaterMaterialCamera(this.material, renderer, camera);
    this.getWorldPosition(worldPositionScratch);
    uniforms.uCameraBelow.value =
      camera.getWorldPosition(followScratch).y < worldPositionScratch.y ? 1 : 0;
    if (this.ripples) {
      uniforms.uRippleMap.value = this.ripples.texture;
      uniforms.uUseRippleMap.value = 1;
      this.ripples.getRegion(uniforms.uRippleRegion.value);
      uniforms.uRippleTexel.value.copy(this.ripples.texelSize);
    } else {
      uniforms.uUseRippleMap.value = 0;
    }

    if (this.passes) {
      this.passes.render(renderer, scene, camera, this);
      this.passes.bindToMaterial(this.material);
    }
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.ripples?.dispose();
    this.splashSystem?.dispose();
    this.breakers?.dispose();
    this.passes?.dispose();
  }
}
