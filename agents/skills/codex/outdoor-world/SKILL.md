---
name: outdoor-world
description: Build, tune, or visually review a production-quality stylized anime outdoor world with ToonLab — terrain geology, luminous shadows, high-quality tree and grass LOD, living cloud light, water, atmosphere, checkpoint rings, speed trails, and regression checks. Use for Call Me Sensei style work or modern anime action-RPG quality comparisons.
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
  trees: { mask: forestPatches },
});
// per frame: world.update(delta) BEFORE renderer.render / post.render
```

It applies the environment shader to everything under `terrain.root`, builds
an aligned sun rig, sky dome, water with real shorelines, LOD forests,
a follow-the-player grass window, instanced understory/ground cover, soft
contact pools, shared cloud shadows, and unified scene fog. Returns
`{ update, forest, understory, contactShadows, water, sky, grass, fog,
sunRig, dispose }`.


## Terrain in one call (or bring your own)

Prefer the seeded generator — any seed yields a valid, playable world
(waterline solved from `waterCoverage`, spawn probed to be walkable and
near a shore, biome paint in relief-relative bands):

```js
import { createStylizedTerrain } from '@call-me-sensei/toonlab';
const terrain = createStylizedTerrain({
  seed: 42, size: 1000,           // size: number or { x, z }
  archetype: 'lushKarst',         // default: meadow + localized karst outcrops
  waterCoverage: 0.2,             // the "more water" knob
  // height: 250, depth: 60, floatingIslands: { count: 3 }, sinkholes: true,
});
// terrain.{root, heightAt, waterLevel, spawn, meshExtent, landmarks, islands, sinkholes}
```

Bring-your-own terrain needs ONLY a pure `heightAt(x, z)` in meters and a
displaced mesh under `terrain.root` with `frustumCulled = false`;
everything downstream (masks, scatter, collision, minimap) derives from
`heightAt` + `water.level`.

## Non-negotiable quality rules

1. **1 world unit = 1 meter, everywhere.** Camera `near 0.3 / far 600 / fov
   45` for third-person gameplay. Trees `size 2.5–4` (≈ 8–12 m). Grass
   blades 0.22–0.48 m tall; dense grass must not cover a human character.
2. **Sun alignment**: the sky's visible sun disc and the light rig MUST
   point the same way (`createStylizedWorld` aligns them from
   `sky.settings.sunDirection`). Match the fiction's time of day: 2 PM
   summer = `sunDirection y ≈ 0.8`, warm-white `sunColor [1.0, 0.97,
   0.88]`, crisp short shadows; golden hour = `y ≈ 0.4`. Fully vertical
   (`y ≈ 1`) reads flat and hides every cast shadow.
3. **Three-layer atmosphere** — the single biggest "looks like the reference"
   factor:
   - `scene.fog` (set by `createStylizedWorld`) so ALL materials — terrain,
     tree far proxies, rocks — fade together into haze silhouettes;
   - environment `heightFogDensity ≈ 0.00055, heightFogFalloff ≈ 400,
     heightFogColor [0.63, 0.8, 0.98]` (sky-blue; WHITE fog is the #1
     "looks wrong" mistake, and falloff < 100 silently kills fog above
     low ground);
   - restrained post `depthCue` (strength ≈ 0.1–0.2, blue) for the far wash.
4. **Cast shadows on**: terrain mesh `castShadow = true` (cliffs shadow
   their own valleys), rocks both flags, forests `lod: { castShadow: true }`.
   Without them the world has no depth anchoring.
5. **Never crush shade**: keep `ambientStrength >= 0.3`, `shadowLift >=
   0.35`, `sunShadowStrength <= 0.8`, and blue `shadowTintColor [0.68,
   0.74, 0.94]`. ToonLab enforces an albedo-relative shade floor before
   tinting; tint alone cannot lift a zero-valued black shadow.
6. **Grade it**: environment `saturation ≈ 1.2`, `exposure ≈ 1.06`, post
   preset `call_me_sensei`, restrained bloom. Vividness comes from material
   palettes and value separation, not exposure or a white veil.
7. **Vegetation has three height layers**: canopy, understory, ground cover.
   Keep the preset forest spacing <= 7 m, let `createStylizedWorld` derive its
   bounded instanced shrub/rosette layer, and keep dense follow-window grass.
   Cluster forests with `createNoisePatchMask({ scale: 0.004–0.006,
   threshold: 0.38–0.45 })`, but reject a seed/mask that leaves the hero view
   as one giant empty lawn. Canopies stay green-dominant with at most one
   gold accent.
8. **Default morphology is lush karst**: rolling green hills with localized
   rock outcrops in the playable area, ~20 m terracing mostly gated to the
   mountain field, and dramatic bare karst on the rim. Wall-to-wall rock is
   a failed landform balance. Paint only steep analytic slopes
   (`rise/run > 0.72`) and the upper mountain band warm ochre limestone;
   keep tops meadow
   `0x6ea24b` / golden `0xbfa845` patches, sand `0xdccf96` at the
   waterline. Bake atmospheric blue `0x9fbcd8` into far-rim vertex colors.
   Keep broad horizontal sediment strata and dark crevices in a dedicated
   triplanar cliff map at world scale (`triplanarDetailScale ≈ 28`). Do not
   project a highly tiled ground map underneath the cliff map.
9. **Terrain never hovers at the waterline**: push ground within ±1.6 m of
   water level to a clear bank or bed, or the mesh renders broken water
   slivers along every contour.
10. **Tune terrain numerically, not visually**: target ~14–20 % below water,
   peaks to ~175 m, before ever looking at a render. Iterate `heightAt` in
   node with a coverage-stats loop.
11. **Probe the spawn**: pick it programmatically — walkable height, water
    30–110 m away, no wall > 27 m within 150 m, open sightline toward the
    map interior (never toward a world-edge rim).
12. **End the world in a mountain rim** (heights rise beyond the playable
   area) so no camera ever sees a void edge; haze it with rule 8's baked
    blue.
13. **Keep living light active**: use Call Me Sensei Weather, keep broad
    moving cloud-shadow coverage/strength around 0.5, and call
    `world.update(delta)` every frame so terrain, trees, grass, and water
    share the moving pools.
14. **Use the safe gameplay primitives**: `createGlowRing()` for an open
    torus checkpoint with bounded line halo/local point glow;
    `createMotionTrails()` for short, speed-gated, translucent, two-ended
    tapered streaks. Pass the gameplay camera to `ring.update(delta, camera)`
    so the ring fades before it becomes a screen obstruction. Never use a
    filled disc behind a ring or long white boxes/cylinders for trails.
15. **Keep water deep and alive**: Call Me Sensei water uses a saturated deep
    blue body, reflection strength <= 0.5, visible detail normals, and low
    lake wave motion. Do not restore the old milky anime tone.
16. **Ground without crushing**: generated terrain must ship its
    `envVertexAo` attribute; rockgen ships SDF AO. Let the world add one
    instanced contact-shadow field for tree/rock bases with cool color and
    opacity <= 0.18. Never use opaque black blobs as AO.
17. **Give the horizon a human scale anchor**: the default lush terrain ships
    one deterministic castle silhouette. Bespoke worlds need an equivalent
    tower, city, ruin, or megastructure on the rim; noise-only peaks are not
    a landmark.
18. **Far LODs keep real volume**: use the default instanced low-poly crown +
    crown proxy (<= 160 triangles/tree); keep trunks in near LOD only so they
    cannot minify into aerial dirt. Never replace it with a painted
    billboard, ellipse texture, or horizontal aerial cap: those become dirty
    speckles from above and giant color blobs from gameplay cameras.
19. **Moss hero rocks**: keep Call Me Sensei rock moss coverage around
    0.25–0.4 on upward ledges. The terrain remains mostly meadow; moss helps
    the localized outcrops belong to it.
20. **Near-camera particles disappear**: keep the default 0.45–1.35 m cutout
    particle fade. A petal or leaf crossing the camera must collapse before
    it becomes a screen-sized pink/orange blob.

## Budgets (60 fps desktop, < 10 s startup)

| System | Budget | Mechanism |
|---|---|---|
| Trees | 1,500–3,000 placements | `StylizedForest` LOD: 10 instanced volumetric proxy variants (<= 160 tris/tree), near = 140 live clones within 165 m |
| Understory | ≤ 2,400 shrubs + 6,200 rosettes | two instanced draws derived from forest placements |
| Grass | ≤ 155k blades by default | one instanced draw; density 18/m² in a 55 m moving follow window, softly distance-faded |
| Rocks | ≤ 180 clones | 3–4 rockgen variants at `gameplayHigh`, shared geometry |
| Terrain | ≤ 265k vertices | one displaced plane, vertex colors + shipped `envVertexAo`; no boot-time ray bake |

## Symptom table — check here FIRST when it looks wrong

| Symptom | Cause | Fix |
|---|---|---|
| Terrain smooth, gray-green, unlit-looking | environment shader never applied | parent terrain under `terrain.root` passed to `createStylizedWorld` |
| Distant trees dark/near-black | shadow palette or far proxy colors too dark | use Call Me Sensei tree + vegetation shader and the default lifted volumetric LOD |
| Distant trees look dirty/noisy | near-leaf detail was baked into a billboard | restore the instanced volumetric crown proxy; never use card-by-card far bakes |
| Giant green/orange crown blobs | ellipse billboard or horizontal top cap leaked into gameplay | remove the billboard path; use the camera-independent volumetric proxy |
| Distant trees sharp saturated blobs, no fade | `scene.fog` missing | `createStylizedWorld` sets it; don't clear it. Tune `world.fog.near/far` per camera |
| Trees look like confetti from the air | uniform/sparse scatter or no middle layer | preset spacing <= 7 m + patch mask + default instanced understory |
| Aerial frame is one empty lawn | patch threshold/seed removed the whole hero region | lower the threshold toward 0.38 or choose a valid patch seed; preserve forest clearings, not map-sized voids |
| White/gray blotches pooling in valleys | white height fog | `heightFogColor` sky-blue (rule 3) |
| Fog invisible no matter the density | `heightFogFalloff` too small (fog dies above low ground) | falloff ≈ 400 for distance-led haze |
| Teal shards along cliff contours | water surface spanning steep banks (fixed in the water shader) | update ToonLab; keep terrain off the waterline (rule 9) |
| Flat lighting, no sun side | rig sun near-vertical or misaligned with sky | rule 2 |
| No shadows anywhere | nothing casts | rule 4 |
| Everything washes pale | fog density too high or translucent overlay covers the view | density ≈ 0.00055; inspect large alpha quads/discs before touching atmosphere |
| World edge visible | terrain ends at playable bounds | mountain rim (rule 11) |
| Camera staring into a hillside at spawn | unprobed spawn | rule 10 |
| Startup takes a minute | one unique StylizedTree per placement | use `StylizedForest`/`createStylizedWorld` (variant cloning) |
| Mountains/terrain vanish when looked at directly | frustum culling misjudging displaced geometry | `mesh.frustumCulled = false` on terrain and scaled rock clones |
| Distant water bright/sharp band "cutting into" fogged mountains | surface missing the environment height-fog layer | update ToonLab (auto-wired via `setDistanceFog`); custom surfaces must join the layer |
| Giant white "iceberg" wedges at far shorelines | swash film climbing steep banks (fixed: clamped +0.5 m) | update ToonLab |
| Full-detail trees popping out of the haze in aerial views | LOD picked by horizontal distance | update ToonLab (true 3D distance) |
| Gold/orange trees with green shadows or pink crowns | canopy palette derivation broke on warm hues (fixed) | update ToonLab |
| Billboard trees upside down | render-target bakes are written top-down (fixed) | update ToonLab |
| Cliff walls read as flat untextured paint up close | planar terrain UVs stretch to nothing on walls | use warm banded `envTriplanarMap` + `triplanarDetail: 1`, scale ≈ 28, and lip highlights |
| Zigzag triangle pattern on cliff walls | per-vertex paint bands finer than the mesh grid; meadow/gold hue bleeding into stone | keep vertex-paint frequencies above the grid spacing; gate gold/meadow hard by slope |
| Herringbone/moire on close cliffs | ground and cliff maps projected together, scale too small, or contrast too high | let one dedicated cliff map own steep faces; use broad mipmapped bands at ~28 m scale |
| Trees look like broccoli with black bases | sparse crowns plus dark canopy/bark floor | keep signature `leafDensity >= 1`, warm bark, vegetation shadow floors, and the lifted proxy palette |
| Grass hides the character or becomes neon line noise | blades are too tall/wide or density was increased blindly | restore 0.22–0.48 m blades, 18/m², 55 m moving window, and 155k cap |
| Ring becomes a giant teal veil | filled plane/circle or no near-camera screen fade | use `createGlowRing()` and call `ring.update(delta, camera)` |
| Pink/orange particle fills the screen | petal/leaf crossed the near plane at full size | restore the ambient cutout near fade; do not disable it for screenshots |
| Flight trails look like rigid white poles | constant-width, long, always-on bespoke geometry | replace with `createMotionTrails()` and keep its speed gate/short taper defaults |
| Water looks milky light blue | deep band too pale and soft reflection too strong | restore Call Me Sensei water tone; reflection <= 0.5 and detail normals/wave life enabled |
| Valley is uniformly lit | cloud-shadow field missing, weak, or not ticking | keep Call Me Sensei Weather and call `world.update(delta)` |
| Aerial views gray and lifeless | one height-fog density for every camera | lower `heightFogDensity` for flyover/top-down and sync `water.setDistanceFog` + `forest.setDistanceFog` |
| ~20 fps in a big world | full-res meshes redrawn by water grab/depth/reflection passes | instanced volumetric forest proxies (pass `renderer`), hi/lo rock LOD by 3D distance, `userData.waterExclude`/`waterGrabExclude`, `water.settings.passes = { reflectionScale: 0.4, sceneColorScale: 0.6 }`, `?dpr=1` on retina |
| Character floats above / sinks into water when swimming | hand-rolled float height | chest at waterline via `water.getHeightAt`; calm swim default, fast stroke on Shift, `timeScale = clamp(speed/1.7, 0.75, 1.35)` |
| Character walks through rocks/trees | world blockers not resolved | `world.collision` (tree trunks pre-registered); `addCircles` your rocks/props, `resolve(position, radius)` per frame |

## Verify like the labs do

Run the consumer app's tests/build, then render-test in a WebGPU-capable
browser after a cold reload. Wait for the app's ready flag and inspect fresh
screenshots from **all three** required views: Explore, Flyover, and Top-down.
Do not approve a vegetation/LOD change from only one view. Explicitly reject
screen-sized color shapes, flat crown walls, dirty speckles, black bases,
character-height grass, and visible LOD discontinuities; fix and repeat all
three views. Also inspect close cliff/tree/water, high-speed views, and every
new browser-console error. A passing build is not visual approval. Set
`document.body.dataset.worldReady = 'true'` when the first frame is live.
The complete reference implementation is `examples/outdoor-world/` in the
ToonLab repo — copy it, then swap in your own terrain and character.

For ToonLab itself, run `npm run verify:world-quality`,
`npm run verify:vegetation-shader`, `npm run verify:water`,
`npm run verify:vfxgen`, and `npm run build` before handoff.
