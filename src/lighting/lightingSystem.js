// Developer-facing lighting runtime: one style + a fixture vocabulary +
// tiny scene overlays, instead of per-scene light configuration.
//
//   const lighting = createLightingSystem({ scene, renderer, style: 'storybook' });
//   lighting.attachWorld(world);            // binds sun rig, fog (once per world)
//   lighting.setTimeOfDay(18.5);            // whole look follows the style's day cycle
//   lighting.place('street-lamp', [4, 0, 2]);  // semantic fixture, seeded variation
//   lighting.applyOverlay(tavernOverlay);   // small per-scene adjustments
//   lighting.update(dt, camera);            // flicker, blends, light budgets
//
// Ownership contract (one writer per property): while attached, the system
// owns sun color/intensity + accents, fog color, tone-mapping exposure, its
// own ambient light, and every placed fixture. The world keeps owning sun
// *position* (its shadow-follow logic translates the sun each frame); pass
// { driveSunPosition: true } in standalone scenes to let the style's sun path
// move the light. Weather should modulate through setWeatherModulation()
// rather than writing to the same targets.

import * as THREE from 'three';

import { deriveSeed } from '../core/generation.js';
import { createLightingManager } from './lightingRuntime.js';
import { resolveFixturePlacement, resolveLightFixture } from './lightingFixtures.js';
import { resolveLightingStylePreset, sampleLightingStyle } from './lightingStyle.js';
import { clamp, cloneJson, finite, isPlainObject, slug } from './utils.js';

const DEFAULT_MODULATION = Object.freeze({
  ambientScale: 1,
  exposureScale: 1,
  fixtureScale: 1,
  fogColorTint: null,
  sunColorTint: null,
  sunIntensityScale: 1,
});

function normalizeModulation(source = {}) {
  const input = isPlainObject(source) ? source : {};
  return {
    ambientScale: Math.max(finite(input.ambientScale, 1), 0),
    exposureScale: Math.max(finite(input.exposureScale, 1), 0),
    fixtureScale: Math.max(finite(input.fixtureScale, 1), 0),
    fogColorTint: Array.isArray(input.fogColorTint) ? input.fogColorTint.slice(0, 3).map((v) => Math.max(finite(v, 1), 0)) : null,
    sunColorTint: Array.isArray(input.sunColorTint) ? input.sunColorTint.slice(0, 3).map((v) => Math.max(finite(v, 1), 0)) : null,
    sunIntensityScale: Math.max(finite(input.sunIntensityScale, 1), 0),
  };
}

function normalizeOverlay(source = {}) {
  const input = isPlainObject(source) ? source : {};
  const adjustments = isPlainObject(input.adjustments) ? input.adjustments : input;
  return {
    adjustments: {
      ambientScale: Math.max(finite(adjustments.ambientScale, 1), 0),
      exposureScale: Math.max(finite(adjustments.exposureScale, 1), 0),
      fixtureScale: Math.max(finite(adjustments.fixtureScale, 1), 0),
      fogColor: Array.isArray(adjustments.fogColor) ? adjustments.fogColor.slice(0, 3).map((v) => clamp(finite(v, 0), 0, 1)) : null,
      sunIntensityScale: Math.max(finite(adjustments.sunIntensityScale, 1), 0),
    },
    fixtures: Array.isArray(input.fixtures)
      ? input.fixtures.filter(isPlainObject).map((entry) => ({
        fixture: entry.fixture ?? entry.id,
        overrides: isPlainObject(entry.overrides) ? entry.overrides : null,
        position: Array.isArray(entry.position) ? entry.position.slice(0, 3) : null,
        seed: entry.seed,
        target: Array.isArray(entry.target) ? entry.target.slice(0, 3) : null,
      }))
      : [],
    id: slug(input.id ?? input.name, 'overlay'),
  };
}

function scheduleScale(schedule, frame) {
  if (schedule.mode === 'always') return 1;
  if (schedule.mode === 'day') {
    // fixtureScale is high at night; day fixtures invert it.
    return Math.max(clamp(1 - frame.fixtureScale, 0, 1), schedule.minimum);
  }
  return Math.max(frame.fixtureScale, schedule.minimum);
}

export function createLightingSystem({
  camera = null,
  capabilities = null,
  quality = null,
  renderer = null,
  scene = null,
  seed = 1,
  style = 'storybook',
  textureResolver = null,
  timeOfDay = 12,
} = {}) {
  let styleSettings = resolveLightingStylePreset(style);
  let hour = clamp(finite(timeOfDay, 12), 0, 24);
  let frame = sampleLightingStyle(styleSettings, hour);
  let modulation = { ...DEFAULT_MODULATION };
  let clock = 0;
  let placementCounter = 0;
  let disposed = false;

  const manager = createLightingManager({
    camera,
    capabilities,
    quality: quality ?? styleSettings.quality,
    recipe: { id: 'lighting-system', lights: [], name: 'Lighting System', shadowPolicy: styleSettings.shadowPolicy },
    renderer,
    scene,
    textureResolver,
  });

  // The system owns exactly one ambient light so scene ambience has a single
  // writer; it lives in the manager group so scene attachment follows along.
  const ambientLight = new THREE.AmbientLight(0xffffff, 0);
  ambientLight.name = 'Lighting System Ambient';
  manager.group.add(ambientLight);

  const placements = new Map();
  const overlays = new Map();

  // Attach targets + the state to restore on detach/dispose.
  const attachment = {
    driveSunPosition: false,
    environmentRoot: null,
    fog: null,
    lampRig: null,
    ownSun: null,
    restore: null,
    sky: null,
    sunDistance: 60,
    sunRig: null,
  };

  const SKY_DRIVEN_KEYS = ['horizonColor', 'starsStrength', 'sunColor', 'sunDirection', 'zenithColor'];

  function captureRestoreState() {
    const sunLight = attachment.sunRig?.light ?? null;
    const skySettings = attachment.sky?.settings ?? null;
    attachment.restore = {
      exposure: renderer ? renderer.toneMappingExposure : null,
      fogColor: attachment.fog?.color?.clone?.() ?? null,
      sky: skySettings
        ? Object.fromEntries(SKY_DRIVEN_KEYS.map((key) => [key, cloneJson(skySettings[key])]))
        : null,
      sunColor: sunLight?.color?.clone?.() ?? null,
      sunIntensity: sunLight?.intensity ?? null,
      sunPosition: sunLight?.position?.clone?.() ?? null,
    };
  }

  function restoreAttachedState() {
    const restore = attachment.restore;
    if (!restore) return;
    if (renderer && restore.exposure !== null) renderer.toneMappingExposure = restore.exposure;
    if (attachment.fog && restore.fogColor) attachment.fog.color.copy(restore.fogColor);
    if (attachment.sky && restore.sky) attachment.sky.applySettings(restore.sky);
    const sunLight = attachment.sunRig?.light ?? null;
    if (sunLight) {
      if (restore.sunColor) sunLight.color.copy(restore.sunColor);
      if (restore.sunIntensity !== null) sunLight.intensity = restore.sunIntensity;
      if (restore.sunPosition && attachment.driveSunPosition) sunLight.position.copy(restore.sunPosition);
    }
    attachment.restore = null;
  }

  function overlayFactor(key) {
    let factor = 1;
    for (const overlay of overlays.values()) {
      const value = overlay.adjustments[key];
      factor *= 1 + (value - 1) * overlay.weight;
    }
    return factor;
  }

  function overlayFogColor() {
    let color = null;
    let weight = 0;
    for (const overlay of overlays.values()) {
      if (overlay.adjustments.fogColor && overlay.weight > weight) {
        color = overlay.adjustments.fogColor;
        weight = overlay.weight;
      }
    }
    return color ? { color, weight } : null;
  }

  const workColor = new THREE.Color();

  function applyFrame() {
    const sunScale = modulation.sunIntensityScale * overlayFactor('sunIntensityScale');
    const sunColor = [...frame.sunColor];
    if (modulation.sunColorTint) {
      for (let i = 0; i < 3; i += 1) sunColor[i] = clamp(sunColor[i] * modulation.sunColorTint[i], 0, 4);
    }

    if (attachment.sunRig?.setState) {
      attachment.sunRig.setState({
        beamOpacity: 0.28 * frame.accentScale,
        color: workColor.setRGB(sunColor[0], sunColor[1], sunColor[2]),
        diskOpacity: 0.62 * frame.accentScale,
        intensity: frame.sunIntensity * sunScale,
        shaftOpacity: 0.1 * frame.accentScale,
        spillOpacity: 0.3 * frame.accentScale,
        ...(attachment.driveSunPosition ? { sourceRatios: frame.sunSourceRatios } : {}),
      });
    } else if (attachment.ownSun) {
      attachment.ownSun.color.setRGB(sunColor[0], sunColor[1], sunColor[2]);
      attachment.ownSun.intensity = frame.sunIntensity * sunScale;
      attachment.ownSun.position.set(
        frame.sunSourceRatios.x,
        frame.sunSourceRatios.y,
        frame.sunSourceRatios.z,
      ).multiplyScalar(attachment.sunDistance);
      attachment.ownSun.target.position.set(0, 0, 0);
      attachment.ownSun.target.updateMatrixWorld();
    }

    const style = styleSettings;
    ambientLight.visible = style.ambientLight.enabled;
    ambientLight.color.setRGB(...style.ambientLight.color);
    ambientLight.intensity = style.ambientLight.intensity
      * frame.ambientScale
      * modulation.ambientScale
      * overlayFactor('ambientScale');

    if (attachment.fog?.color) {
      const fogColor = [...frame.fogColor];
      if (modulation.fogColorTint) {
        for (let i = 0; i < 3; i += 1) fogColor[i] = clamp(fogColor[i] * modulation.fogColorTint[i], 0, 1);
      }
      const overlayFog = overlayFogColor();
      if (overlayFog) {
        for (let i = 0; i < 3; i += 1) {
          fogColor[i] += (overlayFog.color[i] - fogColor[i]) * overlayFog.weight;
        }
      }
      attachment.fog.color.setRGB(fogColor[0], fogColor[1], fogColor[2]);
    }

    if (renderer && style.exposure.enabled) {
      renderer.toneMappingExposure = frame.exposure
        * modulation.exposureScale
        * overlayFactor('exposureScale');
    }

    attachment.lampRig?.setIntensity?.(frame.fixtureScale);

    // The house sky dome follows the style's day cycle: zenith/horizon
    // colors, star strength, and the sun disk color/direction all move with
    // the hour, so nights are actually dark and starry.
    if (attachment.sky?.applySettings) {
      attachment.sky.applySettings({
        horizonColor: frame.skyHorizonColor,
        starsStrength: frame.starsStrength,
        sunColor: sunColor,
        sunDirection: [frame.sunSourceRatios.x, frame.sunSourceRatios.y, frame.sunSourceRatios.z],
        zenithColor: frame.skyZenithColor,
      });
    }

    if (attachment.environmentRoot?.traverse) {
      attachment.environmentRoot.traverse((object) => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material?.userData?.environmentMaterial || !material.uniforms) continue;
          material.uniforms.skyGroundTint?.value?.setRGB?.(...frame.skyGroundTint);
          material.uniforms.skyTopTint?.value?.setRGB?.(...frame.skyTopTint);
          material.uniforms.heightFogColor?.value?.setRGB?.(...frame.fogColor);
        }
      });
    }
  }

  function applyPlacementIntensities() {
    if (placements.size === 0) return;
    const styleScale = styleSettings.fixtures.intensityScale
      * modulation.fixtureScale
      * overlayFactor('fixtureScale');
    for (const placement of placements.values()) {
      const light = manager.getLight(placement.lightId);
      if (!light) continue;
      let intensity = placement.baseIntensity * styleScale * scheduleScale(placement.schedule, frame);
      if (placement.flicker.amount > 0) {
        const t = clock * placement.flicker.speed * Math.PI * 2 + placement.flickerPhase;
        // Two detuned sines make organic, deterministic flicker without a
        // noise table; amplitude stays within ±amount.
        const wave = Math.sin(t) * 0.6 + Math.sin(t * 1.7 + placement.flickerPhase) * 0.4;
        intensity *= 1 + placement.flicker.amount * wave;
      }
      light.intensity = Math.max(intensity, 0);
    }
  }

  function refreshFrame() {
    frame = sampleLightingStyle(styleSettings, hour);
    applyFrame();
    applyPlacementIntensities();
  }

  const api = {
    /** Binds scene handles. Call with a stylized world or explicit targets. */
    attach({
      driveSunPosition = false,
      environmentRoot = null,
      fog = null,
      lampRig = null,
      sky = null,
      sunDistance = 60,
      sunRig = null,
    } = {}) {
      if (disposed) throw new Error('Cannot attach a disposed lighting system.');
      restoreAttachedState();
      attachment.driveSunPosition = Boolean(driveSunPosition);
      attachment.environmentRoot = environmentRoot;
      attachment.fog = fog ?? null;
      attachment.lampRig = lampRig ?? null;
      attachment.sky = sky?.applySettings ? sky : null;
      attachment.sunDistance = Math.max(finite(sunDistance, 60), 1);
      attachment.sunRig = sunRig?.light ? sunRig : null;
      if (!attachment.sunRig && scene && !attachment.ownSun) {
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.name = 'Lighting System Sun';
        sun.castShadow = true;
        manager.group.add(sun);
        manager.group.add(sun.target);
        attachment.ownSun = sun;
      }
      captureRestoreState();
      refreshFrame();
      return api;
    },

    /** Convenience: binds the handles a createStylizedWorld result exposes. */
    attachWorld(world, options = {}) {
      return api.attach({
        fog: world?.fog ?? null,
        sunRig: world?.sunRig ?? null,
        // Worlds translate the sun every frame for shadow-follow; the style
        // drives color/intensity only unless the caller opts in. The world
        // SKY is deliberately not bound by default — the weather system
        // writes it; pass { sky: world.sky } explicitly in weatherless
        // scenes to let the style own the dome.
        driveSunPosition: false,
        ...options,
      });
    },

    detach() {
      restoreAttachedState();
      attachment.driveSunPosition = false;
      attachment.environmentRoot = null;
      attachment.fog = null;
      attachment.lampRig = null;
      attachment.sky = null;
      attachment.sunRig = null;
      return api;
    },

    /** Swaps the whole lighting identity. Placements survive. */
    setStyle(nextStyle) {
      if (disposed) throw new Error('Cannot update a disposed lighting system.');
      styleSettings = resolveLightingStylePreset(nextStyle);
      if (!quality) manager.setQuality(styleSettings.quality);
      refreshFrame();
      return api;
    },

    setQuality(nextQuality) {
      quality = nextQuality;
      manager.setQuality(nextQuality);
      return api;
    },

    /** Sets the hour (0-24). The entire look follows the style's day cycle. */
    setTimeOfDay(nextHour) {
      hour = ((finite(nextHour, 12) % 24) + 24) % 24;
      refreshFrame();
      return frame;
    },

    /** Advances the day cycle; use from update loops for live cycles. */
    advanceTime(hoursDelta) {
      return api.setTimeOfDay(hour + finite(hoursDelta, 0));
    },

    /**
     * Weather integration point: one multiplicative layer instead of a second
     * writer on the same lights/fog/exposure.
     */
    setWeatherModulation(nextModulation) {
      modulation = normalizeModulation(nextModulation);
      refreshFrame();
      return api;
    },

    /** Places a fixture. Returns a handle: { id, descriptor, light, remove, set }. */
    place(fixture, position = null, { id = null, overrides = null, seed: placementSeed = null, target = null } = {}) {
      if (disposed) throw new Error('Cannot update a disposed lighting system.');
      const fixtureId = typeof fixture === 'string' ? fixture : slug(fixture?.id ?? 'fixture', 'fixture');
      const fixtureSettings = resolveLightFixture(fixture);
      placementCounter += 1;
      const resolvedSeed = placementSeed ?? deriveSeed(seed, `${fixtureId}:${placementCounter}`);
      const placement = resolveFixturePlacement(fixtureSettings, {
        id: id ?? `${fixtureId}-${placementCounter}`,
        overrides,
        position,
        seed: resolvedSeed,
        target,
      });
      const lightId = manager.addLight(placement.descriptor);
      const light = manager.getLight(lightId);
      const record = {
        baseIntensity: light?.intensity ?? 1,
        fixtureId,
        flicker: placement.flicker,
        flickerPhase: placement.flickerPhase,
        input: { fixture: fixtureId, id, overrides: cloneJson(overrides), position, seed: resolvedSeed, target },
        lightId,
        overlayId: null,
        schedule: placement.schedule,
      };
      placements.set(lightId, record);
      applyPlacementIntensities();
      return {
        descriptor: placement.descriptor,
        id: lightId,
        light,
        remove: () => api.removePlacement(lightId),
        set: (nextOverrides) => {
          const next = manager.updateLight(lightId, nextOverrides);
          if (next) record.baseIntensity = manager.getLight(lightId)?.intensity ?? record.baseIntensity;
          applyPlacementIntensities();
          return next;
        },
      };
    },

    removePlacement(idOrHandle) {
      const lightId = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle?.id;
      if (!placements.has(lightId)) return false;
      placements.delete(lightId);
      return manager.removeLight(lightId);
    },

    /** Applies a scene overlay; adjustments blend in over blendSeconds. */
    applyOverlay(overlay, { blendSeconds = 0.4 } = {}) {
      if (disposed) throw new Error('Cannot update a disposed lighting system.');
      const normalized = normalizeOverlay(overlay);
      api.removeOverlay(normalized.id, { blendSeconds: 0 });
      const placementIds = [];
      for (const entry of normalized.fixtures) {
        if (!entry.fixture) continue;
        const handle = api.place(entry.fixture, entry.position, {
          overrides: entry.overrides,
          seed: entry.seed,
          target: entry.target,
        });
        placements.get(handle.id).overlayId = normalized.id;
        placementIds.push(handle.id);
      }
      overlays.set(normalized.id, {
        adjustments: normalized.adjustments,
        blendSeconds: Math.max(finite(blendSeconds, 0.4), 0),
        id: normalized.id,
        placementIds,
        target: 1,
        weight: blendSeconds > 0 ? 0 : 1,
      });
      refreshFrame();
      return normalized.id;
    },

    removeOverlay(id, { blendSeconds = 0.4 } = {}) {
      const overlay = overlays.get(id);
      if (!overlay) return false;
      overlay.target = 0;
      overlay.blendSeconds = Math.max(finite(blendSeconds, 0.4), 0);
      if (overlay.blendSeconds === 0) {
        for (const placementId of overlay.placementIds) api.removePlacement(placementId);
        overlays.delete(id);
        refreshFrame();
      }
      return true;
    },

    /** Per-frame: overlay blends, fixture flicker, light budget selection. */
    update(delta = 0.016, nextCamera = null) {
      if (disposed) return;
      const dt = clamp(finite(delta, 0.016), 0, 0.1);
      clock += dt;
      let overlaysChanged = false;
      for (const overlay of [...overlays.values()]) {
        if (overlay.weight !== overlay.target) {
          const step = overlay.blendSeconds > 0 ? dt / overlay.blendSeconds : 1;
          overlay.weight = overlay.target > overlay.weight
            ? Math.min(overlay.weight + step, overlay.target)
            : Math.max(overlay.weight - step, overlay.target);
          overlaysChanged = true;
          if (overlay.weight === 0 && overlay.target === 0) {
            for (const placementId of overlay.placementIds) api.removePlacement(placementId);
            overlays.delete(overlay.id);
          }
        }
      }
      if (overlaysChanged) applyFrame();
      applyPlacementIntensities();
      manager.update(nextCamera ? { camera: nextCamera } : {});
    },

    stats() {
      const diagnostics = manager.getDiagnostics();
      const byCategory = {};
      for (const placement of placements.values()) {
        byCategory[placement.fixtureId] = (byCategory[placement.fixtureId] ?? 0) + 1;
      }
      return {
        activeLightCount: diagnostics.activeLightCount,
        backend: diagnostics.backend,
        hour,
        overlayCount: overlays.size,
        placementCount: placements.size,
        placementsByFixture: byCategory,
        shadowedLightCount: diagnostics.shadowedLightCount,
        totalLightCount: diagnostics.totalLightCount,
        warnings: diagnostics.warnings,
      };
    },

    toJSON() {
      return {
        placements: [...placements.values()]
          .filter((placement) => placement.overlayId === null)
          .map((placement) => cloneJson(placement.input)),
        style: cloneJson(styleSettings),
        timeOfDay: hour,
      };
    },

    /** Removes placements/overlays/modulation and re-applies the style. */
    reset() {
      for (const id of [...placements.keys()]) api.removePlacement(id);
      overlays.clear();
      modulation = { ...DEFAULT_MODULATION };
      placementCounter = 0;
      refreshFrame();
      return api;
    },

    dispose() {
      if (disposed) return;
      api.reset();
      restoreAttachedState();
      attachment.ownSun?.shadow?.map?.dispose?.();
      manager.dispose();
      disposed = true;
    },

    get frame() { return frame; },
    get manager() { return manager; },
    get style() { return styleSettings; },
    get timeOfDay() { return hour; },
    getDiagnostics: () => manager.getDiagnostics(),
    /** Toon-response metadata for material adapters (band softness, tint). */
    getToonResponse: () => cloneJson(styleSettings.toonResponse),
  };

  refreshFrame();
  return api;
}
