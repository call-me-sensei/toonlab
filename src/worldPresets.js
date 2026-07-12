// Cross-cluster world presets. Import from '@call-me-sensei/toonlab'.
//
// A world preset is one named starting point that couples the per-cluster
// choices that must agree at a given camera scale — camera planes, sun/time
// rig, fog, rock meshing quality, vegetation scale and distribution, water
// and sky tone. Individual cluster defaults are authored at asset-lab scale
// (a single tree or rock filling the frame); at an open-world gameplay
// camera those values read wrong: default-size trees and ankle-height grass
// disappear, flat-normal rocks go near-black, and the sky dome sits inside
// the far plane. A world preset is the studio's answer for one scale,
// resolved as plain data the host spreads into each system.
//
// World units are meters throughout (see docs/world-scale.md).
//
//   import { resolveWorldPreset } from '@call-me-sensei/toonlab';
//
//   const world = resolveWorldPreset('outdoorGameplay');
//   const camera = new THREE.PerspectiveCamera(world.camera.fov, aspect, world.camera.near, world.camera.far);
//   const sky = new StylizedSky({ preset: world.sky.preset, ...world.sky.settings });
//   const water = new WaterSurface({ preset: world.water.preset, width: 400, depth: 400 });
//   const grass = new StylizedGrassField({
//     preset: world.grass.preset,
//     ...world.grass.settings,
//     placements: scatterGrassAround({ ...world.grass.scatter, center, heightAt, mask }),
//   });
//   for (const p of scatterForest({ ...world.trees.scatter, center, heightAt, mask })) {
//     const tree = new StylizedTree({ preset: world.trees.preset, seed: p.seed, ...world.trees.settings });
//     tree.position.set(p.x, p.y, p.z);
//   }
//   const rock = resolveRockgenPreset(world.rocks.preset);
//   rock.meshing = { ...rock.meshing, ...resolveRockgenQuality(world.rocks.quality) };
//   await applyEnvironmentShader(root, { ...resolveEnvironmentPreset(world.environment.preset), ...world.environment.overrides });

const WORLD_PRESET_DEFINITIONS = new Map([
  ['outdoorGameplay', Object.freeze({
    label: 'Outdoor Gameplay',
    description: 'Open-world outdoor scale for a 50–160 m third-person gameplay camera: far fog, gradient rock normals, meadow-height grass, 8–12 m trees, anime water tone.',
    // 1 unit = 1 meter. Third-person gameplay reads the world at 50–160 m.
    units: 'meters',
    camera: {
      // Generous far plane: fog owns the depth falloff, and a tight far
      // plane makes distant mountains pop in and out as the camera turns.
      far: 4000,
      fov: 45,
      near: 0.4,
    },
    environment: {
      preset: 'call_me_sensei',
      // Long sightlines: thinner height fog than the interior-scale default.
      overrides: {
        parameters: {
          heightFogDensity: 0.002,
          heightFogFalloff: 9,
        },
      },
    },
    sky: {
      preset: 'call_me_sensei',
      // Dome must clear the far plane and the fog band.
      settings: { radius: 400 },
    },
    water: {
      preset: 'call_me_sensei',
    },
    grass: {
      preset: 'call_me_sensei',
      // Asset-lab blades (0.16–0.42 m) vanish at 50 m+; meadow scale reads.
      settings: {
        bladeHeightRange: [0.35, 0.7],
        bladeWidthRange: [0.08, 0.13],
        pushRadius: 1.2,
      },
      scatter: { density: 6, radius: 45 },
    },
    trees: {
      preset: 'call_me_sensei',
      // size 1 ≈ 3 m; open-world silhouettes want ~10 m canopies.
      settings: { size: 3.2 },
      scatter: { jitter: 0.5, keepChance: 0.85, radius: 120, spacing: 9 },
    },
    rocks: {
      preset: 'call_me_sensei',
      // Gradient normals: flat facets read near-black at gameplay range.
      quality: 'gameplayHigh',
    },
  })],
]);

/**
 * Registers a named world preset (community presets sit alongside the
 * built-ins). `definition` follows the same shape as the built-ins: any of
 * `{ label, description, units, camera, environment, sky, water, grass,
 * trees, rocks }`.
 */
export function registerWorldPreset(name, definition = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('World preset name is required.');
  if (!overwrite && WORLD_PRESET_DEFINITIONS.has(id)) {
    throw new Error(`World preset "${id}" already exists.`);
  }
  const source = definition && typeof definition === 'object' ? definition : {};
  WORLD_PRESET_DEFINITIONS.set(id, Object.freeze({ ...source }));
  return { description: source.description ?? '', id, label: source.label ?? id };
}

/** Lists registered world presets as `{ id, label, description }` (for HUDs). */
export function getWorldPresetOptions() {
  return Array.from(WORLD_PRESET_DEFINITIONS.entries()).map(([id, preset]) => ({
    description: preset.description ?? '',
    id,
    label: preset.label ?? id,
  }));
}

/**
 * Returns a deep copy of a world preset, safe to mutate; unknown names
 * return null.
 */
export function resolveWorldPreset(name) {
  const preset = WORLD_PRESET_DEFINITIONS.get(String(name ?? '').trim());
  return preset ? structuredClone(preset) : null;
}
