# ToonLab — guide for AI coding agents

You are helping a developer use `@call-me-sensei/toonlab` (alias: `toonlab`),
a stylized anime game kit for Three.js (WebGPU-first TSL materials, WebGL2
fallback; 1 world unit = 1 meter). The look is NOT in any single API — it
emerges from the assembly: sky feeds water reflections, an aligned sun rig +
three-layer fog set the palette, cloud shadows tie ground/canopy/water
together. Skipping the assembly produces gray, flat, "programmer-art" scenes.

## Golden path — a full world in minutes

```js
import { createStylizedTerrain, createStylizedWorld } from '@call-me-sensei/toonlab';

// 1. Terrain: any seed is a valid world. waterCoverage is the "more water"
//    knob; height/depth set mountain amplitude and basin depth; size takes
//    a number or { x, z }; floatingIslands / sinkholes are one option each.
const terrain = createStylizedTerrain({
  seed: 42,
  size: 1000,
  archetype: 'terracedKarst', // 'lakeland' | 'alpine' | 'rollingPlains' | 'archipelago'
});
const terrainRoot = new THREE.Group();
terrainRoot.add(terrain.root);
scene.add(terrainRoot);

// 2. Everything else: environment shading, aligned sun + shadows, sky,
//    water, LOD forests, follow-window grass, cloud shadows, collision.
const world = await createStylizedWorld({
  renderer, scene, camera,
  terrain: { heightAt: terrain.heightAt, root: terrainRoot, size: terrain.meshExtent },
  water: { level: terrain.waterLevel },
  followTarget: characterRoot,               // splashes, wakes, grass push
});
characterRoot.position.copy(terrain.spawn);  // probed: walkable, near shore
// render loop, before rendering:
world.update(delta);
```

**Bring your own terrain** (no generator): the ONLY contract is a pure
`heightAt(x, z) → meters` plus a displaced mesh under `terrain.root` with
`frustumCulled = false`. Everything else (masks, scatter, collision,
minimap) derives from `heightAt` and `water.level`. Even
`heightAt = (x, z) => 12 * Math.sin(x / 90) * Math.cos(z / 90)` gives a
complete shaded, forested, swimmable world.

Character: `applyToonShader(root, { settings: createToonSettings({ preset:
'call_me_sensei' }) })` + `createCharacterRenderPasses` (call
`passes.update()` per frame). Post: `createPostProcessingPipeline` with
preset `call_me_sensei`; `post.render(delta)` replaces `renderer.render`.
Minimap: `createWorldMinimap({ heightAt, size, waterLevel, onPick })` —
call `minimap.setPlayer(x, z, heading)` per frame.
Every cluster has a `default` and a studio-managed `call_me_sensei` preset.

## Quality rules (validated against reference-class modern anime worlds)

- Align the visible sky sun and the light rig, and match the hour: 2 PM sun
  is HIGH (`sunDirection` y ≈ 0.8, warm-white); golden hour is LOW (y ≈ 0.4).
- Three-layer atmosphere: scene.fog (set by createStylizedWorld) +
  environment heightFog (`heightFogColor` luminous blue [0.63,0.8,0.98],
  density ≈ 0.0012–0.0016, falloff ≈ 400) + post depthCue (~0.3, blue).
  White or absent fog is the #1 giveaway of a bad scene. EVERY custom
  surface must join the height-fog layer or it reads as pasted on —
  `createStylizedWorld` wires water and forest impostors automatically
  (`setDistanceFog`); lower the density per aerial view or flyovers gray out.
- Cast shadows: terrain `castShadow = true`, near rocks both flags, forests
  `lod: { castShadow: true }` (only live near trees cast — correct).
- Vividness is palette + saturation, not brightness: environment
  `saturation ≈ 1.24`, `exposure ≈ 1.1`, `shadowTintColor [0.6,0.66,0.82]`,
  saturated cerulean zenith, two-tone cumulus with blue-shaded bottoms,
  green-dominant canopy list with ONE gold accent variant (muddy autumn
  mixes read as confetti), turquoise water ramp.
- Cluster forests with `createNoisePatchMask`; tree `size` 2.5–4.
- Cliffs: steep faces need material, not flat paint — set
  `material.userData.envTriplanarMap` (painted stone tile) +
  `triplanarDetail: 1`, `triplanarDetailScale ≈ 14`,
  `triplanarEdgeHighlight` for painted lip highlights; keep per-vertex
  paint LOW-frequency (bands finer than the mesh grid alias into zigzag
  triangles) and gate meadow/gold paint hard by slope.
- Never let ground hover within ±1.6 m of water level over large areas
  (broken water slivers); end the map in a hazy mountain rim;
  `frustumCulled = false` on world-scale meshes.
- Budgets: trees ≤ 3,000 via `StylizedForest` (16-vert billboard far LOD —
  pass `renderer` or you get the expensive legacy path), grass ≤ 320k
  blades in a follow window, startup < 10 s. Give every repeated mesh set
  (rocks, cliff decor) a hi/lo distance LOD using TRUE 3D distance so
  aerial cameras demote everything. Exclude above-water dressing from
  water passes: `userData.waterExclude` (all passes) or
  `waterGrabExclude` (refraction only, keeps the reflection).
- Perf triage: add URL toggles per system and read the FPS meter — the
  water scene passes (grab/depth/reflection) multiply every other cost, so
  measure with and without water first. Scale them via
  `water.settings.passes = { reflectionScale: 0.4, sceneColorScale: 0.6 }`.

## Subpath imports

`/toon` `/environment` `/lighting` `/weather` `/water` `/vegetation` (incl. scatter helpers +
`StylizedForest`) `/sky` `/post` `/character` `/loaders` `/rockgen`
`/debrisgen` `/pathgen` `/debug`; root adds `createStylizedTerrain`,
`createStylizedWorld`, `createWorldCollision`, `createWorldMinimap`,
`resolveWorldPreset`, `createStylizedPaths`.

Lighting (`/lighting`) owns portable, versioned recipes and looks rather than
a replacement renderer. Use `createLightingManager({ scene, camera, renderer,
recipe, quality })`, call `update()` as the focus/camera moves, and save JSON
with the recipe/look serializers. Luminaire, rig, look, and quality presets
come from `getLightingPresetOptions(kind)`. Disc/tube area lights, IES, tag
linking, and Unreal Engine 5.8 MegaLights/Lumen are explicit adapter intent;
the capability report and diagnostics state each runtime fallback. Author and
stress-test them in `/lighting-lab/`.

Paths/roads/bridges: `createStylizedWorld({ paths: { seed, auto: { count: 4,
styles: ['dirt', 'stone'] } } })` routes seeded trails around slopes, bridges
water crossings, parts grass/trees around the ribbon, and feeds the flattened
profile to `world.collision.groundHeight` — use that (not raw `heightAt`) for
character ground so bridges carry the walk. Minimap: pass `paths: world.paths`
to `createWorldMinimap` for the network overlay.

Catalog (`/catalog`): the whole library, browsable and spawnable —
`catalog.list({ tags, cluster, text })`, `catalog.get(id)`, and the headline
`catalog.spawn(id, { seed })` → a PropAsset for any prop / building / tree /
rock / debris entry (settings presets throw with their copy-paste snippet
instead). `catalog.register(entry)` adds user assets;
`catalog.addSource(url, { headers })` mounts remote registries (the pro
seam). Browser lab at `/catalog/`.

Villages (`/villagegen`): `createStylizedWorld({ pois: { seed, villages: 2,
shrines: 1, pierHamlets: 1, size } })` → named settlements (seeded syllable
names) with streets merged into the world path network, buildings facing
their street behind picket fences, wells/lanterns/clutter by archetype, POI
entries auto-connected by roads. `world.pois` feeds
`createWorldMinimap({ markers })` labels. Fully-shadowed building facades
need `parameters.sunShadowStrength ≈ 0.7` in worlds that run near-zero
ambient (full-strength cast shadows crush large vertical masses to black).

Fauna (`/fauna`) and ambient VFX (`/ambientfx`) are one option each:
`createStylizedWorld({ fauna: { species: { birds: 40, fish: 80 } },
ambientfx: { effects: { petals: true, fireflies: true } } })` — both join
the world's fog/wind/cloud-shadow automatically.

Weather (`/weather`) is a cross-system coordinator, not an environment
catch-all: `createStylizedWorld({ weather: { preset: 'snow' } })`, then
`world.setWeather('thunderstorm', { duration: 4 })`. Its 22 shared presets
drive sky/sun/fog/cloud shadows, wind across vegetation/fauna/ambient FX,
one-draw GPU rain/snow/sleet/hail/dust, water waves/ripples, lightning and
thunder events. Surface `{ wetness, snowCover, ice }` values are host-facing
outputs for custom terrain/prop/character materials. Labs should read
`getWeatherPresetOptions()` rather than maintaining a private condition list.

Gameplay VFX (`/vfxgen`): event-driven combat/movement effects, spawned at
gameplay moments (not a world option) — `createVfxSystem({ seed, preset,
heightAt })` then `vfx.spawn('slash' | 'impact' | 'fireball' | 'footstep' |
'landing', { at | follow, power, look })` and `vfx.update(delta, camera)`
per frame. All bursts share TWO draw calls; slash trails / fireball cores
are pooled meshes. `vfx.setDistanceFog(...)` joins the height-fog layer;
`vfx.setTimeScale(0)` is hit-stop. Weapons + moves are batteries-included:
`createStylizedWeapon({ type: 'sword' | 'greatsword' | 'spear' | 'dagger'
| 'hammer' })` + `createMoveController({ weapon, vfx })` →
`attack.play('slash' | 'overhead' | 'thrust' | 'spin' | 'plunge')` — authored
phase-based motions whose event tracks fire the VFX at the right beats
(plunge = the full crouch→leap→dive→landfall decomposition); weapon weight
scales timing and hit power. Design interactively in the VFX Lab
(`/vfx-lab/`): weapon picker + move triggers + schema panels, exports a
recipe (preset + seed + overrides) that drops straight into `createVfxSystem`.
The `call_me_sensei` preset targets the reference action-RPG hit language
(smooth gradient arcs, four-point star + shockwave circle per hit,
hard-saturated pyro fireball). Demo loop: `examples/vfx-arena/`.

Buildings (`/buildinggen`): seeded grammar exteriors —
`buildingAsset({ type: 'cottage' | 'shed' | 'farmhouse' | 'watchtower' |
'shrine', seed })` is a PropAsset (multi-circle footprint, buried foundation
skirt for slopes ≤ ~20°, hi/lo LOD, `door` anchor with outward normal for
street-facing placement). `createBuildingFromRecipe(recipe)` rebuilds
deterministically; ≤ 6 draw calls per building.

Props (`/propgen`): every placeable thing is a PropAsset —
`createPropAsset({ asset: { type: 'lantern', variant: 'stoneToro', seed } })`
or `propAssetFromObject(importedGlb)` (auto footprint + ground anchor).
Place with ONE call: `placeAlongSpline({ asset, spline: world.paths.splines[0],
spacing, offset, mask, heightAt: world.paths.heightAt, collision:
world.collision, parent })` (fences/walls build continuously; point props
instance with hi/lo LOD — call the returned `update(delta, camera)` per
frame), or `scatterProps`/`placeProps`. Props added after `createStylizedWorld`
need `applyEnvironmentShader(propsRoot, { parameters: { …fog } })` to join the
look; pass a dry-land `mask` so dressing never marches into water.

## Symptom table — check before debugging blind

| Looks like | Cause → fix |
|---|---|
| Terrain gray/flat | environment shader never applied → put meshes under `terrain.root` |
| Distant trees sharp saturated dots on hazed mountains | surface missing the height-fog layer → update ToonLab (impostors/water auto-wired via `setDistanceFog`); custom surfaces must join it |
| Distant water bright band "cutting into" mountains | same fog-layer mismatch → `waterSurface.setDistanceFog({ color, density })` |
| Giant white "iceberg" wedges at far shorelines | outdated ToonLab (swash film climbed steep banks) → update |
| Full-detail trees popping in aerial views | LOD by horizontal distance → update ToonLab (3D distance) |
| Gold/orange tree with green-shadow or pink-crown leaves | outdated ToonLab (palette derivation broke on warm hues) → update |
| Billboards upside down / trunk-up | render-target bakes are written top-down → update ToonLab |
| Trees like confetti from the air | uniform scatter → `createNoisePatchMask`; palette too mixed → green-dominant + one gold |
| White valley blotches | white height fog → sky-blue `heightFogColor` |
| Fog has no effect | `heightFogFalloff` too small → ≈ 400 |
| Everything pale/gray from the air | one fog density for all views → lower `heightFogDensity` for aerial cameras (terrain uniforms + `water/forest.setDistanceFog`) |
| Cliff walls flat, untextured up close | planar UVs stretch on walls → `envTriplanarMap` + `triplanarDetail` |
| Zigzag triangles on cliff walls | per-vertex paint finer than the grid, or hue bleeding through stone → low-frequency bands; luminance-only tint is built in |
| Flat light, no shadows | vertical/misaligned sun, nothing casts → align sun, enable castShadow |
| Mountains vanish when centered | frustum culling on displaced meshes → `frustumCulled = false` |
| Minute-long startup | unique tree per placement → `StylizedForest` |
| ~20 fps in a big world | full-res meshes in every water pass → billboard forests (pass `renderer`), hi/lo rock LOD, `waterExclude`/`waterGrabExclude`, pass scales, `?dpr=1` on retina |
| Character walks through rocks/trees | blockers unregistered → `world.collision.addCircles([{x,z,radius}])` + `world.collision.resolve(character.position, 0.35)` per frame (trunks are pre-registered) |
| Character floats over/sinks into water | float on `water.getHeightAt(x, z)` with chest at the waterline; calm swim default, fast stroke on Shift, `action.timeScale = clamp(speed/1.7, 0.75, 1.35)` |

Full runbook with budgets and verification workflow:
`agents/skills/*/outdoor-world/SKILL.md` in the repo; complete reference
app: `examples/outdoor-world/`. Verify by headless Playwright screenshot
(`--enable-unsafe-webgpu --enable-gpu`), not by assumption — and LOOK at
the images.
