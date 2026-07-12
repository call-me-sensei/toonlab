---
name: outdoor-world
description: Build a complete reference-class stylized anime outdoor world with ToonLab — terrain, forests, water, atmosphere, character — including the exact settings, budgets, and failure symptoms.
---

# Building a stylized outdoor world

Use this skill when a developer wants an open-world outdoor scene (terrain +
water + vegetation + sky + character) that looks like a modern anime game.
Every rule here was validated by render-testing against reference-class
modern anime open-world shots; follow them exactly before improvising.

## The one call that gets the look

The look of ToonLab does not live in any single system — it emerges from the
assembly (sky feeds water reflections, sun rig + fog set the palette, cloud
shadows tie everything together). `createStylizedWorld` IS that assembly.
Always start from it; never hand-assemble unless you outgrow it:

```js
import { createStylizedWorld } from '@call-me-sensei/toonlab';

const world = await createStylizedWorld({
  renderer, scene, camera,
  terrain: { root: terrainRoot, heightAt, size: { width: 1600, depth: 1600 } },
  water: { level: WATER_LEVEL },
  followTarget: characterRoot,
  trees: { mask: forestPatches, scatter: { spacing: 11, keepChance: 0.9 } },
  grass: { scatter: { density: 45, maxCount: 320000, radius: 55 } },
});
// per frame: world.update(delta) BEFORE renderer.render / post.render
```

It applies the environment shader to everything under `terrain.root`, builds
an aligned sun rig, sky dome, water with real shorelines, LOD forests,
a follow-the-player grass window, shared cloud shadows, and unified scene
fog. Returns `{ update, forest, water, sky, grass, fog, sunRig, dispose }`.


## Terrain in one call (or bring your own)

Prefer the seeded generator — any seed yields a valid, playable world
(waterline solved from `waterCoverage`, spawn probed to be walkable and
near a shore, biome paint in relief-relative bands):

```js
import { createStylizedTerrain } from '@call-me-sensei/toonlab';
const terrain = createStylizedTerrain({
  seed: 42, size: 1000,           // size: number or { x, z }
  archetype: 'terracedKarst',     // 'lakeland'|'alpine'|'rollingPlains'|'archipelago'
  waterCoverage: 0.2,             // the "more water" knob
  // height: 250, depth: 60, floatingIslands: { count: 3 }, sinkholes: true,
});
// terrain.{root, heightAt, waterLevel, spawn, meshExtent, islands, sinkholes}
```

Bring-your-own terrain needs ONLY a pure `heightAt(x, z)` in meters and a
displaced mesh under `terrain.root` with `frustumCulled = false`;
everything downstream (masks, scatter, collision, minimap) derives from
`heightAt` + `water.level`.

## Non-negotiable quality rules

1. **1 world unit = 1 meter, everywhere.** Camera `near 0.3 / far 600 / fov
   45` for third-person gameplay. Trees `size 2.5–4` (≈ 8–12 m). Grass
   blades 0.35–0.7 m tall.
2. **Sun alignment**: the sky's visible sun disc and the light rig MUST
   point the same way (`createStylizedWorld` aligns them from
   `sky.settings.sunDirection`). Match the fiction's time of day: 2 PM
   summer = `sunDirection y ≈ 0.8`, warm-white `sunColor [1.0, 0.97,
   0.88]`, crisp short shadows; golden hour = `y ≈ 0.4`. Fully vertical
   (`y ≈ 1`) reads flat and hides every cast shadow.
3. **Three-layer atmosphere** — the single biggest "looks like the reference"
   factor:
   - `scene.fog` (set by `createStylizedWorld`) so ALL materials — terrain,
     tree impostors, rocks — fade together into haze silhouettes;
   - environment `heightFogDensity ≈ 0.0016, heightFogFalloff ≈ 400,
     heightFogColor [0.66, 0.8, 0.94]` (sky-blue; WHITE fog is the #1
     "looks wrong" mistake, and falloff < 100 silently kills fog above
     low ground);
   - post `depthCue` (strength ≈ 0.35–0.4, blue) for the far wash.
4. **Cast shadows on**: terrain mesh `castShadow = true` (cliffs shadow
   their own valleys), rocks both flags, forests `lod: { castShadow: true }`.
   Without them the world has no depth anchoring.
5. **Grade it**: environment `saturation 1.15`, `shadowTintColor
   [0.6, 0.66, 0.82]` (cool blue shadows), post preset `call_me_sensei`
   plus bloom ~0.18. Raw ungraded output reads washed.
6. **Cluster the forests**: `createNoisePatchMask({ scale: 0.006,
   threshold: 0.5 })` as `trees.mask`. Uniform scatter reads as confetti
   from any aerial camera. Canopies green-weighted autumn mix:
   `[0x74a94e, 0x7fb457, 0x86b954, 0xe4c44a, 0x5f9c46, 0xe0a344, 0x6fae4e, 0x9cb84a]`.
7. **Terrain morphology is terraced karst**, not smooth hills: quantize
   height into ~20 m steps with eased walls (sharpness ~5), paint steep
   analytic slopes (`rise/run > 0.5`) pale rock `0x8fa0ac`, tops meadow
   `0x6ea24b` / golden `0xbfa845` patches, sand `0xdccf96` at the
   waterline. Bake atmospheric blue `0x9fbcd8` into far-rim vertex colors.
8. **Terrain never hovers at the waterline**: push ground within ±1.6 m of
   water level to a clear bank or bed, or the mesh renders broken water
   slivers along every contour.
9. **Tune terrain numerically, not visually**: target ~14–20 % below water,
   peaks to ~175 m, before ever looking at a render. Iterate `heightAt` in
   node with a coverage-stats loop.
10. **Probe the spawn**: pick it programmatically — walkable height, water
    30–110 m away, no wall > 27 m within 150 m, open sightline toward the
    map interior (never toward a world-edge rim).
11. **End the world in a mountain rim** (heights rise beyond the playable
    area) so no camera ever sees a void edge; haze it with rule 7's baked
    blue.

## Budgets (60 fps desktop, < 10 s startup)

| System | Budget | Mechanism |
|---|---|---|
| Trees | 1,500–3,000 placements | `StylizedForest` LOD: ~8 variants, far = instanced baked impostors (≈ 2 draws/variant), near = ≤ 90 live clones within 130 m |
| Grass | ≤ 320k blades | one instanced draw; density 45/m² in a 55 m follow window, distance-faded |
| Rocks | ≤ 180 clones | 3–4 rockgen variants at `gameplayHigh`, shared geometry |
| Terrain | ≤ 150k vertices | one displaced plane, vertex colors, `bakeVertexAo: false` |

## Symptom table — check here FIRST when it looks wrong

| Symptom | Cause | Fix |
|---|---|---|
| Terrain smooth, gray-green, unlit-looking | environment shader never applied | parent terrain under `terrain.root` passed to `createStylizedWorld` |
| Distant trees dark/near-black | impostors lit by scene lights they don't have | already fixed in `StylizedForest` (unlit impostors); don't rebuild impostors with Standard materials |
| Distant trees sharp saturated blobs, no fade | `scene.fog` missing | `createStylizedWorld` sets it; don't clear it. Tune `world.fog.near/far` per camera |
| Trees look like confetti from the air | uniform scatter, no clusters | `createNoisePatchMask` as `trees.mask` |
| White/gray blotches pooling in valleys | white height fog | `heightFogColor` sky-blue (rule 3) |
| Fog invisible no matter the density | `heightFogFalloff` too small (fog dies above low ground) | falloff ≈ 400 for distance-led haze |
| Teal shards along cliff contours | water surface spanning steep banks (fixed in the water shader) | update ToonLab; keep terrain off the waterline (rule 8) |
| Flat lighting, no sun side | rig sun near-vertical or misaligned with sky | rule 2 |
| No shadows anywhere | nothing casts | rule 4 |
| Everything washes pale | fog density too high (exp curve: 0.008 ≈ 80 % fog at 200 m) | density ≈ 0.0016; put drama in depthCue instead |
| World edge visible | terrain ends at playable bounds | mountain rim (rule 11) |
| Camera staring into a hillside at spawn | unprobed spawn | rule 10 |
| Startup takes a minute | one unique StylizedTree per placement | use `StylizedForest`/`createStylizedWorld` (variant cloning) |
| Mountains/terrain vanish when looked at directly | frustum culling misjudging displaced geometry | `mesh.frustumCulled = false` on terrain and scaled rock clones |
| Distant water bright/sharp band "cutting into" fogged mountains | surface missing the environment height-fog layer | update ToonLab (auto-wired via `setDistanceFog`); custom surfaces must join the layer |
| Giant white "iceberg" wedges at far shorelines | swash film climbing steep banks (fixed: clamped +0.5 m) | update ToonLab |
| Full-detail trees popping out of the haze in aerial views | LOD picked by horizontal distance | update ToonLab (true 3D distance) |
| Gold/orange trees with green shadows or pink crowns | canopy palette derivation broke on warm hues (fixed) | update ToonLab |
| Billboard trees upside down | render-target bakes are written top-down (fixed) | update ToonLab |
| Cliff walls read as flat untextured paint up close | planar terrain UVs stretch to nothing on walls | `material.userData.envTriplanarMap` (painted stone tile) + `triplanarDetail: 1`, scale ≈ 14, `triplanarEdgeHighlight` for lip highlights |
| Zigzag triangle pattern on cliff walls | per-vertex paint bands finer than the mesh grid; meadow/gold hue bleeding into stone | keep vertex-paint frequencies above the grid spacing; gate gold/meadow hard by slope |
| Aerial views gray and lifeless | one height-fog density for every camera | lower `heightFogDensity` for flyover/top-down and sync `water.setDistanceFog` + `forest.setDistanceFog` |
| ~20 fps in a big world | full-res meshes redrawn by water grab/depth/reflection passes | billboard forests (pass `renderer` to `StylizedForest`/`createStylizedWorld`), hi/lo rock LOD by 3D distance, `userData.waterExclude`/`waterGrabExclude`, `water.settings.passes = { reflectionScale: 0.4, sceneColorScale: 0.6 }`, `?dpr=1` on retina |
| Character floats above / sinks into water when swimming | hand-rolled float height | chest at waterline via `water.getHeightAt`; calm swim default, fast stroke on Shift, `timeScale = clamp(speed/1.7, 0.75, 1.35)` |
| Character walks through rocks/trees | world blockers not resolved | `world.collision` (tree trunks pre-registered); `addCircles` your rocks/props, `resolve(position, radius)` per frame |

## Verify like the labs do

Render-test headlessly, don't eyeball locally: Playwright + Chromium with
`--enable-unsafe-webgpu --enable-gpu`, wait for your app's ready flag, then
screenshot each camera mode and LOOK at the images. Set
`document.body.dataset.worldReady = 'true'` when the first frame is live.
The complete reference implementation is `examples/outdoor-world/` in the
ToonLab repo — copy it, then swap in your own terrain and character.
