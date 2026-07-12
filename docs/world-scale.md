# World scale and world presets

ToonLab uses **1 world unit = 1 meter** everywhere: rocks, trees, grass,
water, characters, fog distances, and camera planes. Every generator's
defaults are authored at *asset-lab scale* — one tree or rock filling the
frame at a 3–15 m camera. An open-world gameplay camera reads the world at
50–160 m, and at that range asset-lab values read wrong: default-size trees
and ankle-height grass disappear, flat-normal rocks go near-black, and the
default sky dome (100 m) sits inside a far plane at 600 m.

The pieces that must agree at a given scale:

| System | Asset-lab default | Outdoor gameplay scale |
|---|---|---|
| Camera | any | `near 0.3`, `far 600`, `fov 45` |
| Trees (`size`, 1 ≈ 3 m) | 1.7–2.0 (≈ 5–6 m) | 2.5–4 (≈ 8–12 m) |
| Grass blades | 0.16–0.42 m | 0.35–0.7 m, wider blades |
| Rock meshing | `hero`-ish, shape-preset normals | `gameplayHigh` (gradient normals — flat facets read near-black at range) |
| Height fog | interior-scale density (0.006+) | 0.002, falloff 9 |
| Sky dome `radius` | 100 | ≥ far plane × 0.6 (e.g. 400) |

## World presets

`resolveWorldPreset(name)` (root import) returns one named starting point
that couples all of the above as plain data the host spreads into each
system. Built-in: `outdoorGameplay`. Register your own with
`registerWorldPreset`; list them with `getWorldPresetOptions`.

```js
import { resolveWorldPreset } from '@call-me-sensei/toonlab';

const world = resolveWorldPreset('outdoorGameplay');

const camera = new THREE.PerspectiveCamera(
  world.camera.fov, aspect, world.camera.near, world.camera.far);

const sky = new StylizedSky({ preset: world.sky.preset, ...world.sky.settings });
const water = new WaterSurface({ preset: world.water.preset, width: 400, depth: 400 });

const rock = resolveRockgenPreset(world.rocks.preset);
rock.meshing = { ...rock.meshing, ...resolveRockgenQuality(world.rocks.quality) };

await applyEnvironmentShader(root, {
  ...resolveEnvironmentPreset(world.environment.preset),
  ...world.environment.overrides,
});
```

Every cluster reference in a world preset points at a named cluster preset
(`call_me_sensei` by default), so re-tuning the studio look in one cluster
flows through automatically.

## Rock quality tiers

`resolveRockgenQuality(name)` couples meshing resolution and normal mode per
viewing context (`ROCKGEN_QUALITY_PRESETS` / `ROCKGEN_QUALITY_LEVELS`):

| Tier | Preview / export res | Normals | For |
|---|---|---|---|
| `hero` | 128 / 288 | `flat` (faceted) | Close-up set pieces (< 20 m) |
| `gameplayHigh` | 96 / 224 | `gradient` | 50–160 m gameplay cameras |
| `mobile` | 56 / 128, LODs off | `gradient` | Low-end targets |

```js
const preset = resolveRockgenPreset('call_me_sensei');
preset.meshing = { ...preset.meshing, ...resolveRockgenQuality('gameplayHigh') };
```

## Distribution helpers

`@call-me-sensei/toonlab/vegetation` exports deterministic, dependency-free
scatter helpers so hosts stop authoring placement logic by hand. All of them
take a `heightAt(x, z)` terrain sampler (placements land at y = 0 without
one) and an optional `mask`:

```js
import {
  scatterForest,
  scatterGrassAround,
  scatterInRect,
  createSlopeMask,
  createWaterMask,
  combineMasks,
} from '@call-me-sensei/toonlab/vegetation';

const mask = combineMasks(
  createSlopeMask({ heightAt, maxSlope: 0.6 }),   // rise/run; 0.6 ≈ 31°
  createWaterMask({ heightAt, waterLevel: waterY, margin: 0.2 }),
);

// Trees: jittered grid — predictable density, no unnatural clumps, and a
// deterministic per-tree seed for silhouette variation.
for (const p of scatterForest({ center, radius: 120, spacing: 9, keepChance: 0.85, seed: 1, heightAt, mask })) {
  const tree = new StylizedTree({ preset: 'call_me_sensei', seed: p.seed, size: 3.2 });
  tree.position.set(p.x, p.y, p.z);
  scene.add(tree);
}

// Grass: density-based disc (blades per m²), so the same call reads
// correctly at any radius.
const grass = new StylizedGrassField({
  placements: scatterGrassAround({ center, radius: 45, density: 6, seed: 1, heightAt, mask }),
});

// Generic rectangle scatter with minimum spacing (rocks, debris, props):
const rockSpots = scatterInRect({ min, max, count: 24, minSpacing: 6, seed: 2, heightAt, mask });
```

Same seed, same inputs → same world, so captures and multiplayer stay
deterministic. The world presets carry recommended scatter parameters per
scale (`world.trees.scatter`, `world.grass.scatter`).
