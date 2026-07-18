# ToonLab by Call Me Sensei

ToonLab by Call Me Sensei is a stylized anime-style game starter kit and
runtime library for [Three.js](https://threejs.org/). Its goal is to simplify
Three.js game development: you get a better-looking anime/stylized game
without having to develop shaders yourself, and procedurally generated assets
(trees, rocks, grass, water, sky) reduce content complexity so you can focus
on your core game logic instead. Clone it and a toon-shaded character is
walking and swimming through a fully stylized world: cel-shaded characters,
painterly environments, interactive water, procedural vegetation and sky,
post-processing, and a schema-driven tuning panel. Use it as a starter kit,
or import the pieces you need as a library (`@call-me-sensei/toonlab` on npm,
subpath exports per cluster).

## Quickstart

**No install** — use the hosted labs at **[toonlab.io](https://toonlab.io)**:
tune character and environment shaders, design trees and rocks, and export
presets straight from the browser.

**As a library** in your own Three.js app:

```bash
npm install @call-me-sensei/toonlab
```

**Run the labs locally** (this repo):

```bash
git clone https://github.com/call-me-sensei/toonlab.git && cd toonlab
npm install
npm run dev
```

Vite serves the labs at `http://localhost:5175`. See
[Getting started](docs/getting-started.md) for a tour.

### Local MCP server

Running the labs locally also creates a disk-backed `.toonlab/` workspace
shared by the browser tools and the included MCP server. Open
`http://localhost:5175/settings/` for a checkout-specific configuration you
can paste into an MCP-compatible coding tool.

```bash
npm run dev
# In an MCP client, use the command/config shown at /settings/.
```

The local server can search the built-in procedural catalog and public CC0
sources, read your saved presets and exported files, generate seeded recipes,
and import assets into the project. It uses stdio, requires no account or
OAuth, and keeps work on disk. See [Local MCP and workspace](docs/mcp.md).

## The labs

Runnable demos in `labs/` (not published to npm). The Labs home (`/`) links
every lab as a card; the HUD Scene select switches between them in-lab:

- **Shader Lab** (`/shader-lab/`) — character + environment shader tuning: every toon
  and environment setting as a live control, preset export/import, debug
  views.
- **Playground** (`/playground/`) — third-person character controller
  in gameplay scenes: calm lake, river crossing, ocean beach with breaking
  waves, and an indoor room. Walk, jump, swim, splash.
- **Weather Lab** (`/weather-lab/`) — 22 shared weather presets plus live
  controls for atmosphere, wind, precipitation, lightning, and surface
  response. Tune, transition, import, save, and export developer presets.
- **Lighting Lab** (`/lighting-lab/`) — build reusable luminaire, rig, look,
  and quality presets; edit and stress-test light budgets, shadows, cookies,
  IES/linking metadata, and export Unreal Engine 5.8 MegaLights/Lumen intent.
- **Rock Lab** (`/rock-lab/`) — procedural stylized rocks, cliffs,
  heightfields, sculpt edits, and GLB export.
- **Tree Lab** (`/tree-lab/`) — procedural stylized trees,
  flowers, sketches, recipes, and GLB export.
- **Texture Lab** (`/texture-lab/`) — seamless procedural PBR textures for
  anything: 60+ material presets across stone, wood, metal, fabric,
  creature, and sci-fi, a layered generator you can tune down to every
  parameter, and a prompt box that maps plain words ("old leather jacket")
  to parameters — offline out of the box, smarter with your own Gemini or
  OpenAI key. Exports albedo/normal/roughness/metalness/AO/height/ORM/
  emissive as PNGs or one ZIP.
- **Prop Lab** (`/prop-lab/`) — 12 parametric prop generators (fences,
  lanterns, torii, wells, piers…): seed/palette controls, LOD preview,
  scatter preview, GLB + recipe export, thumbnails.
- **Building Lab** (`/building-lab/`) — grammar-generated stylized
  buildings (cottage, shed, farmhouse, watchtower, shrine): footprint →
  massing → roof → facade → palette, slope test, GLB + recipe export.
- **Catalog** (`/catalog/`) — the whole library as one browsable grid:
  thumbnails, tag/cluster/text filters, live spawn preview, copy-paste
  spawn snippets, GLB export, local user library.
- **Outdoor World** (`/examples/outdoor-world/`) — the flagship example: a
  seeded 1×1 km open world built entirely from the public library API —
  generated terrain, forests, lakes, cliffs, roads with bridges, named
  villages and shrines, birds/fish/butterflies, petals and fireflies, a
  swimmable character, and a click-to-travel minimap with place labels.
  Re-roll it from the URL:
  `?seed=42&archetype=lakeland&water=0.4&villages=2&shrines=1&paths=4`.

Every URL parameter has a HUD control. In local development, lab state is
mirrored into `.toonlab/` so the MCP server and browser share it; existing
`localStorage` and IndexedDB data migrate on first run. Static hosted builds
fall back to browser storage. **Reset Lab** clears the current lab state.
Point any lab at your own model with the Model URL input or `?model=` — see
[Characters](docs/characters.md).

## What's inside

| Cluster | Import | What you get |
|---|---|---|
| Toon character shading | `@call-me-sensei/toonlab/toon` | Modern anime character shader: cel bands with art-directed face lighting, skin-tone shadow management, shadow-color HSV control, scene/self/contact shadows, average-shadow smoothing, rim light (fresnel or screen-space depth), stylized + anisotropic hair highlights, eye catchlights, role-aware specular, source map routing (normal/AO/emissive/MatCap/ramp/detail), inverted-hull outlines, glitter, stickers, perspective removal, shell fur, dither fades — 23 settings groups, all preset-serializable. [Docs](docs/toon-shading.md) |
| Environment shading | `@call-me-sensei/toonlab/environment` | Modern anime-style scene shader for texture packs, standard glTF, and untextured scenes: material-role classification, wrapped lighting, packed-map hints, window cutouts, sun/lamp rigs, time-of-day, six-direction ambient probe, planar floor reflections, BVH vertex-AO baking, height fog, cloud shadows. [Docs](docs/environment.md) |
| Lighting | `@call-me-sensei/toonlab/lighting` | Versioned lighting recipes and looks, physical/artistic intensity helpers, reusable luminaire/rig/look/quality presets, deterministic light and shadow budgets, capability diagnostics, runtime Three.js realization, and a data-only Unreal Engine 5.8 MegaLights/Lumen handoff. [Docs](docs/lighting.md) |
| Weather | `@call-me-sensei/toonlab/weather` | Shared cross-system weather coordinator with 22 presets, smooth transitions, one-draw GPU precipitation (rain, snow, sleet, hail, dust), lightning/thunder events, and normalized wetness/snow/ice outputs. It drives sky, sun, fog, cloud shadows, wind, vegetation, water, fauna, and ambient effects through their public adapters. [Docs](docs/weather.md) |
| Water | `@call-me-sensei/toonlab/water` | Fully procedural interactive water: Gerstner wave stack with a calm→storm dial, wave sets, plunging breakers you can surf, three-stop absorption color, refraction/caustics/foam, GPU ripple sim, splashes, wakes, rain, kelp, underwater view — with a CPU mirror of the whole spectrum for buoyancy. [Docs](docs/water.md) |
| Vegetation | `@call-me-sensei/toonlab/vegetation` | Instanced grass and flower fields (wind, push-away, scene + cloud shadows, backlit translucency) and procedural stylized trees with a serializable recipe system. [Docs](docs/vegetation-sky.md) |
| Paths, roads & bridges | `@call-me-sensei/toonlab/pathgen` | Seeded path networks routed over any `heightAt`: cost-field router (slope/water aware), hand-drawn ribbon overlay in dirt/stone/planks, arched plank bridges with collision, stepped stone climbs, flattened `paths.heightAt` for walkability, scatter exclusion mask, minimap overlay. |
| Props & placement | `@call-me-sensei/toonlab/propgen` | The universal placement pipeline (the PropAsset contract: grounded, collided, instanced, hi/lo LOD by true 3D distance) + 12 seeded prop generators across fences, lanterns, signposts, stairs, milestones, wells, crates, firewood, torii, piers, stone walls, benches. `propAssetFromObject` drops any imported GLB into the same pipeline. |
| Buildings | `@call-me-sensei/toonlab/buildinggen` | Shape-grammar stylized exteriors (cottage/shed/farmhouse/watchtower/shrine): seeded recipes, timber facades with windows that never intersect beams, always-overhanging roofs (gable/hip/shed/pagoda-ish), buried foundation skirts for slopes, ≤ 6 draw calls per building, grammar invariants asserted across 1000 seeds. |
| Villages & POIs | `@call-me-sensei/toonlab/villagegen` | Seeded settlements composed from paths + props + buildings: site scoring, main-street layout with parcels facing the street, archetypes as data (village, fishing hamlet, shrine, campsite, ruin), seeded place names, world `pois` option that roads everything together. |
| Fauna | `@call-me-sensei/toonlab/fauna` | Instanced GPU-animated ambient creatures: flocking birds that perch and flush, butterflies over flower masks, hovering dragonflies, schooling koi — staggered boids, hard population budgets, ≤ 1 ms CPU at defaults. |
| Ambient VFX | `@call-me-sensei/toonlab/ambientfx` | One GPU particle backbone, five effects: falling petals and leaves, dusk fireflies, backlit pollen, shoreline mist — follow-window emission, shared wind with grass, time-of-day gates, 3 draw calls total. |
| Asset catalog | `@call-me-sensei/toonlab/catalog` | Every recipe/preset as a searchable manifest with one headline call: `catalog.spawn(id, { seed })` → a placeable PropAsset for props, buildings, trees, rocks, and debris. `catalog.addSource(url)` mounts remote registries. |
| Sky | `@call-me-sensei/toonlab/sky` | Procedural gradient/sun/painterly-cloud/star dome that also shows up in water reflections. [Docs](docs/vegetation-sky.md) |
| Post-processing | `@call-me-sensei/toonlab/post` | Optional single-pipeline compositor: character-aware bloom, color grade, LUT, vignette, screen outline, depth cue — schema-driven, preset-serializable. [Docs](docs/post-processing.md) |
| Camera | `@call-me-sensei/toonlab/camera` | Extensible camera operator stack, generated recipe/preset documents, follow/framing/collision/damping/noise/impulse behavior, and a director for blending reusable rigs. [Style domain docs](docs/style-labs.md#camera) |
| Game feel | `@call-me-sensei/toonlab/game-feel` | Event-driven response scheduler for camera punches, hit-stop/time warp, squash, flashes, audio, and haptics through capability-safe adapters, extensible effect factories, and bounded concurrency. [Style domain docs](docs/style-labs.md#game-feel) |
| Procedural textures | `@call-me-sensei/toonlab/texgen` | Seamless CPU-baked PBR texture generator: 25 tileable pattern/noise generators, layered detail + colored overlays (moss, rust, grime), five-stop cel-capable color ramp, cavity/sheen hand-painted read, derived normal/AO/roughness/metalness/height/ORM/emissive maps, 60+ presets, and a natural-language recipe mapper (offline keywords or BYO-key Gemini/OpenAI). [Docs](docs/texture-lab.md) |
| Character pipeline | `@call-me-sensei/toonlab/character` | Bone-role adapters for VRM/MMD/Mixamo/Rigify rigs, native-clip conventions, Mixamo retarget helpers, and a procedural freestyle swim clip. [Docs](docs/characters.md) |
| Model loaders | `@call-me-sensei/toonlab/loaders` | Optional GLB/glTF, VRM 0+1, PMX/PMD, FBX, OBJ, and text-USDZ loading helpers. Kept off the root import so apps that do not load models avoid loader dependencies. [Docs](docs/characters.md) |
| Debug panel | `@call-me-sensei/toonlab/debug` | One-line schema-driven tuning GUI for any settings module — the same panel the labs use. [Docs](docs/debug-panel.md) |

Zero texture assets in the library: water, sky, grass, flowers, trees, and
splashes are all procedural. The one bundled model is a CC0 mannequin with 45
embedded animation clips.

## Library usage

### A complete open world in one screen of code

```js
import { createStylizedTerrain, createStylizedWorld, createWorldMinimap } from '@call-me-sensei/toonlab';

// Seeded terrain generator — ANY seed is a valid, playable world. One knob
// per big idea: waterCoverage (how much water), height (mountain range),
// depth (basins), size (number or { x, z }), floatingIslands, sinkholes.
const terrain = createStylizedTerrain({ seed: 42, size: 1000, archetype: 'terracedKarst' });
const terrainRoot = new THREE.Group();
terrainRoot.add(terrain.root);
scene.add(terrainRoot);

// Environment shading, aligned sun + real shadows, sky, anime water, LOD
// forests (billboard far trees), follow-window grass, cloud shadows,
// unified three-layer fog, and collision — all on by default.
const world = await createStylizedWorld({
  renderer, scene, camera,
  terrain: { heightAt: terrain.heightAt, root: terrainRoot, size: terrain.meshExtent },
  water: { level: terrain.waterLevel },
  weather: { preset: 'call_me_sensei' }, // 'snow' | 'hail' | 'thunderstorm' | ...
  followTarget: character, // your character root (optional): splashes, wakes, grass push
});
character.position.copy(terrain.spawn); // probed: walkable, near a shore

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  world.update(clock.getDelta());
  renderer.render(scene, camera);
});
```

**Bring your own terrain instead** — the generator is optional. The whole
contract is a pure `heightAt(x, z)` in meters plus your displaced mesh under
`terrain.root`; masks, scatter, collision, and the minimap all derive from
it:

```js
const heightAt = (x, z) => 12 * Math.sin(x / 90) * Math.cos(z / 90); // yours
const world = await createStylizedWorld({
  renderer, scene, camera,
  terrain: { heightAt, root: myTerrainRoot, size: 1200 },
  water: { level: 0 },
});
```

Add a clickable minimap with `createWorldMinimap({ heightAt, size,
waterLevel, onPick })`, and solid rocks/trees with the built-in
`world.collision` (`addCircles` for your own props, `resolve(position,
radius)` per frame). Archetypes: `terracedKarst`, `lakeland`, `alpine`,
`rollingPlains`, `archipelago`.

### Individual clusters

```js
import { applyToonShader, createToonSettings } from '@call-me-sensei/toonlab/toon';

const settings = createToonSettings({
  preset: 'default',
  skinTone: {
    skinShadowBrightness: 0.94,
  },
});

applyToonShader(characterRoot, { settings });
```

```js
import { WaterSurface } from '@call-me-sensei/toonlab/water';
import { StylizedSky } from '@call-me-sensei/toonlab/sky';

const water = new WaterSurface({ width: 200, depth: 200, preset: 'lake' });
scene.add(water);
const sky = new StylizedSky();
scene.add(sky);

// per frame, before renderer.render(scene, camera):
water.update(renderer, scene, camera, delta);
sky.update(delta, camera);
```

Inside this repo the labs import from `../../src/...`; the `@call-me-sensei/toonlab/...`
specifiers are what you use once the package is installed from npm. The
shader clusters are TSL/NodeMaterial modules for Three's WebGPU renderer
stack, with WebGL2 fallback through the same TSL path.

## Documentation

- [Getting started](docs/getting-started.md) — clone, run, tour the labs,
  load your own models.
- [Toon character shading](docs/toon-shading.md)
- [Environment shading](docs/environment.md)
- [Lighting](docs/lighting.md)
- [Weather system](docs/weather.md)
- [Generative style labs](docs/style-labs.md) — Post & Color, Camera, Motion,
  UI Theme, Biome, Soundscape, and Game Feel; shared recipes, MCP authoring,
  package runtimes, quality budgets, and engine design references.
- [Water](docs/water.md)
- [Vegetation and sky](docs/vegetation-sky.md)
- [Post-processing](docs/post-processing.md)
- [Texture Lab and texgen](docs/texture-lab.md)
- [Characters and animation](docs/characters.md)
- [Debug panel](docs/debug-panel.md)
- [World scale and world presets](docs/world-scale.md) — the meters
  convention, open-world scale presets, rock quality tiers, and vegetation
  scatter helpers.
- [Settings reference](docs/settings-reference.md) — every tunable field,
  generated from the schemas (`node scripts/generate-settings-reference.mjs`).
- [Shader constants](docs/shader-constants.md) — the deliberately unexposed
  constants and where they live.

## AI coding agents

The GitHub repo includes downloadable runtime-usage guidance for Codex, Claude
Code, Cursor, and other coding agents under `agents/`. These files help
developers use ToonLab in their own apps and are not part of the npm package.

## License

Code is [MIT](LICENSE), copyright Hyperbond Studio PTE. LTD. Bundled assets are CC0 — see
[ATTRIBUTION.md](ATTRIBUTION.md) for credits and for the bring-your-own
conventions (Mixamo clips, your own models, licensed scan packs).
