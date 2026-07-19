# ToonLab by Call Me Sensei

ToonLab by Call Me Sensei is a stylized anime-style game starter kit and
runtime library for [Three.js](https://threejs.org/). Its goal is to simplify
Three.js game development: you get a better-looking anime/stylized game
without having to develop shaders yourself, and procedurally generated assets
(trees, rocks, grass) plus integrated procedural world systems (water, sky)
reduce content complexity so you can focus on your core game logic instead.
Clone it and a toon-shaded character is
walking and swimming through a fully stylized world: cel-shaded characters,
painterly environments, interactive water, procedural vegetation and sky,
post-processing, and a schema-driven tuning panel. Use it as a starter kit,
or import the pieces you need as a library (`@call-me-sensei/toonlab` on npm,
subpath exports per cluster).

## Quickstart

**No install** — use the hosted labs at **[toonlab.io](https://toonlab.io)**:
define character, vegetation, and environment shaders; author stylized assets;
tune water and sky systems; and export portable presets from the browser.

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

**Building with an AI coding agent?** That is the fastest path through all of
this — see [Build with an AI coding agent](#build-with-an-ai-coding-agent)
for the recommended setup (skills + MCP) and ready-to-paste starting prompts.

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

Lab UIs are development tools and are not published in the npm package. The
Labs home (`/`) presents them by the artifact they author:

- **Shader Labs** — Character Shader Lab (`/shader-lab/`), Vegetation Shader
  Lab (`/vegetation-shader-lab/`), and Environment Shader Lab
  (`/environment-lab/`) each save one reusable IP-wide material treatment.
- **Asset Labs** — Rock, Tree, Flower, Grass, Debris, and Texture Labs author
  geometry, material data, recipes, and exports for individual asset classes.
  Grass color palettes coordinate base, tip, and shadow tint as one set.
- **World Systems** — Water Lab (`/water-lab/`) authors waves, surface
  shading, foam, reflections, interaction, and quality as one runtime preset;
  Sky Lab (`/sky-lab/`) authors the gradient, sun, clouds, stars, and cloud
  motion as one runtime preset. Their shader controls are embedded in the
  complete system labs rather than duplicated as separate shader labs.
- **Playgrounds & demos** — Playground, Water Playground, Outdoor World, VFX
  Arena, Fauna Demo, and Ambient VFX Demo validate the authored artifacts in
  interactive scenes.

Supporting editors remain available by direct URL: Weather Lab
(`/weather-lab/`) coordinates current atmosphere, wind, precipitation,
lightning, and surface state; Lighting Lab (`/lighting-lab/`) authors light
rigs and budgets; Gallery
(`/gallery/`) searches supported open-asset sources. The procedural Catalog
is exposed through `@call-me-sensei/toonlab/catalog`. See
[Lab responsibilities](docs/lab-architecture.md) for the scope rules and
[Getting started](docs/getting-started.md) for every direct route.

Sky and Water are integrated runtime systems, not extra Shader Labs. Their
`.settings` are authored preset data; current Lighting and Weather state is
composed through named transient layers and exposed as `.renderedSettings`
without changing exported presets. Create a `LightingSystem`, then call
`lighting.attachWorld(world)` to own the Lighting layers and connect the
world's Weather coordinator as modulation, so each system can detach only its
own layer. The shared `world.setSun({ direction, color, sky })` adapter keeps
the physical light/shadows, vegetation scene inputs, Sky, and Water aligned;
Weather captures and restores every transient baseline it drives. Sky presets contain exactly 46
portable art fields; dome radius and compile-time quality stay outside the
document. Sky provides low/medium/high cloud graphs plus custom 1–5-octave
quality and can rebuild its material with `setQuality()`. Water quality is a
construction-time graph choice; switching it requires replacing/rebuilding
the surface rather than calling `applySettings()`.

Every URL parameter has a HUD control. In local development, lab state is
mirrored into `.toonlab/` so the MCP server and browser share it; existing
`localStorage` and IndexedDB data migrate on first run. Static hosted builds
fall back to browser storage. **Reset Lab** clears the current lab state.
Point any model-aware lab at your own model with the Model URL input or
`?model=` — see
[Characters](docs/characters.md).

## What's inside

| Cluster | Import | What you get |
|---|---|---|
| Toon character shading | `@call-me-sensei/toonlab/toon` | Modern anime character shader: cel bands with art-directed face lighting, skin-tone shadow management, shadow-color HSV control, scene/self/contact shadows, average-shadow smoothing, rim light (fresnel or screen-space depth), stylized + anisotropic hair highlights, eye catchlights, role-aware specular, source map routing (normal/AO/emissive/MatCap/ramp/detail), inverted-hull outlines, glitter, stickers, perspective removal, shell fur, dither fades — 23 settings groups, all preset-serializable. [Docs](docs/toon-shading.md) |
| Environment shading | `@call-me-sensei/toonlab/environment` | Modern anime-style scene shader for texture packs, standard glTF, and untextured scenes: material-role classification, wrapped lighting, packed-map hints, window cutouts, sun/lamp rigs, time-of-day, six-direction ambient probe, planar floor reflections, BVH vertex-AO baking, height fog, cloud shadows. [Docs](docs/environment.md) |
| Lighting | `@call-me-sensei/toonlab/lighting` | Versioned lighting recipes and looks, physical/artistic intensity helpers, reusable luminaire/rig/look/quality presets, deterministic light and shadow budgets, capability diagnostics, runtime Three.js realization, and a data-only Unreal Engine 5.8 MegaLights/Lumen handoff. [Docs](docs/lighting.md) |
| Weather | `@call-me-sensei/toonlab/weather` | Shared cross-system weather coordinator with 22 presets, smooth transitions, one-draw GPU precipitation (rain, snow, sleet, hail, dust), lightning/thunder events, and normalized wetness/snow/ice outputs. It drives sky, sun, fog, cloud shadows, wind, vegetation, water, fauna, and ambient effects through their public adapters. [Docs](docs/weather.md) |
| Water | `@call-me-sensei/toonlab/water` | Fully procedural integrated water system: Gerstner wave stack with a calm→storm dial, wave sets, plunging breakers you can surf, three-stop absorption color, refraction/caustics/foam, GPU ripple sim, splashes, wakes, rain, kelp, underwater view, construction-time quality, and a CPU mirror of the whole spectrum for buoyancy. [Docs](docs/water.md) |
| Vegetation | `@call-me-sensei/toonlab/vegetation` | Instanced grass and flower fields, procedural trees/flowers with serializable recipes, coordinated grass palettes (base, tip, and shadow tint), and one semantic-role `VegetationShaderProfile` shared across grass, foliage, flowers, bark, and stems. Asset identity and current wind/weather remain separate. [Docs](docs/vegetation-sky.md) |
| Paths, roads & bridges | `@call-me-sensei/toonlab/pathgen` | Seeded path networks routed over any `heightAt`: cost-field router (slope/water aware), hand-drawn ribbon overlay in dirt/stone/planks, arched plank bridges with collision, stepped stone climbs, flattened `paths.heightAt` for walkability, scatter exclusion mask, minimap overlay. |
| Asset placement | `@call-me-sensei/toonlab/propgen` | The universal placement pipeline (the PropAsset contract: grounded, collided, instanced, hi/lo LOD by true 3D distance). `propAssetFromObject` drops any imported GLB — e.g. a CC0 model found through MCP — into the pipeline. |
| Fauna | `@call-me-sensei/toonlab/fauna` | Instanced GPU-animated ambient creatures: flocking birds that perch and flush, butterflies over flower masks, hovering dragonflies, schooling koi — staggered boids, hard population budgets, ≤ 1 ms CPU at defaults. |
| Ambient VFX | `@call-me-sensei/toonlab/ambientfx` | One GPU particle backbone, five effects: falling petals and leaves, dusk fireflies, backlit pollen, shoreline mist — follow-window emission, shared wind with grass, time-of-day gates, 3 draw calls total. |
| Asset catalog | `@call-me-sensei/toonlab/catalog` | Every recipe/preset as a searchable manifest with one headline call: `catalog.spawn(id, { seed })` → a placeable PropAsset for trees, rocks, and debris. `catalog.addSource(url)` mounts remote registries. |
| Sky | `@call-me-sensei/toonlab/sky` | Integrated gradient/sun/painterly-cloud/star system with exactly 46 portable art fields, named live scene layers, compile-time quality tiers/custom 1–5 cloud octaves, meaningful built-in looks, and water-reflection compatibility. [Docs](docs/sky.md) |
| Post-processing | `@call-me-sensei/toonlab/post` | Optional single-pipeline compositor: character-aware bloom, color grade, LUT, vignette, screen outline, depth cue — schema-driven, preset-serializable. [Docs](docs/post-processing.md) |
| Camera | `@call-me-sensei/toonlab/camera` | Extensible camera operator stack, generated recipe/preset documents, follow/framing/collision/damping/noise/impulse behavior, and a director for blending reusable rigs. [Style domain docs](docs/style-labs.md#camera) |
| Game feel | `@call-me-sensei/toonlab/game-feel` | Event-driven response scheduler for camera punches, hit-stop/time warp, squash, flashes, audio, and haptics through capability-safe adapters, extensible effect factories, and bounded concurrency. [Style domain docs](docs/style-labs.md#game-feel) |
| Procedural textures | `@call-me-sensei/toonlab/texgen` | Seamless CPU-baked PBR texture generator: 25 tileable pattern/noise generators, layered detail + colored overlays (moss, rust, grime), five-stop cel-capable color ramp, cavity/sheen hand-painted read, derived normal/AO/roughness/metalness/height/ORM/emissive maps, 60+ presets, and a natural-language recipe mapper (offline keywords or BYO-key Gemini/OpenAI). [Docs](docs/texture-lab.md) |
| Character pipeline | `@call-me-sensei/toonlab/character` | Bone-role adapters for VRM/MMD/Mixamo/Rigify rigs, native-clip conventions, Mixamo retarget helpers, and a procedural freestyle swim clip. [Docs](docs/characters.md) |
| Model loaders | `@call-me-sensei/toonlab/loaders` | Optional GLB/glTF, VRM 0+1, PMX/PMD, FBX, OBJ, and text-USDZ loading helpers. Kept off the root import so apps that do not load models avoid loader dependencies. [Docs](docs/characters.md) |
| Debug panel | `@call-me-sensei/toonlab/debug` | One-line schema-driven tuning GUI for any settings module — the same panel the labs use. [Docs](docs/debug-panel.md) |

The main `vegetation` barrel exposes the complete runtime. Smaller consumers
can import the same bindings from
`@call-me-sensei/toonlab/vegetation-shaders` or
`@call-me-sensei/toonlab/grass-palettes`; package verification asserts that
the focused subpaths and root export reference the identical implementations.

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

- **In-browser docs** — with the labs running (`npm run dev`), open
  `http://localhost:5175/docs/` for guided documentation: library usage,
  MCP setup, the prompt cookbook, and the full settings reference. Hosted
  features are marked "Pro"; the extended hosted docs live at
  [toonlab.io/docs](https://toonlab.io/docs).
- [Lab responsibilities](docs/lab-architecture.md) — the boundary between
  Shader Labs, Asset Labs, World Systems, and preview-only scene state.
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
- [Sky system](docs/sky.md)
- [Vegetation](docs/vegetation-sky.md)
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

## Build with an AI coding agent

ToonLab is designed to be driven by a coding agent (Claude Code, Codex,
Cursor, …). The recommended setup has three parts: give the agent the ToonLab
skills, connect an MCP server for asset discovery, then start from a goal
prompt and iterate. Everything the agent needs ships in this repo under
`agents/` (not in the npm package — the package stays runtime-only).

### 1. Install the ToonLab skills in your game project

The skills teach the agent the assembly order, the frame-loop contract, and
each subsystem's API so it wires ToonLab correctly on the first try. Start
with `game-dev`; the other twelve cover individual features (water, weather,
lighting, camera, game feel, …).

```bash
# Claude Code — feature skills + project guidance
mkdir -p .claude/skills
cp -R path/to/toonlab/agents/skills/claude/* .claude/skills/
cat path/to/toonlab/agents/codex/AGENTS.md >> CLAUDE.md

# Codex — shared guide + Codex-oriented skills
cat path/to/toonlab/agents/codex/AGENTS.md >> AGENTS.md
cp -R path/to/toonlab/agents/skills/codex path/to/your-game/docs/toonlab-skills

# Cursor — rule file
mkdir -p .cursor/rules
cp path/to/toonlab/agents/cursor/toonlab.mdc .cursor/rules/
```

See [`agents/README.md`](agents/README.md) for the full layout.

### 2. Connect MCP for asset discovery

Two servers, and they compose:

**Local (free, no account).** The stdio server included in this package
searches the built-in procedural catalog and public CC0 sources, reads your
saved presets and lab exports, generates seeded recipes, and imports assets
into a disk-backed `.toonlab/` workspace:

```json
{
  "mcpServers": {
    "toonlab-local": {
      "command": "npx",
      "args": ["-y", "@call-me-sensei/toonlab@latest", "--workspace", "/absolute/path/to/your-game/.toonlab"]
    }
  }
}
```

If you run the labs from a checkout (`npm run dev`), open
`http://localhost:5175/settings/` for a ready-made config instead. See
[Local MCP and workspace](docs/mcp.md).

**ToonLab Pro (remote, OAuth).** [toonlab.io](https://toonlab.io) hosts a
remote MCP server that adds an indexed CC0 asset search with ToonLab-styled
previews, AI generation (concept art, seamless textures, image→3D model
chaining) on credits, stored characters with reference-image consistency, and
your cloud library of presets and style bundles. Requires a Pro or Team plan.

```bash
# Claude Code
claude mcp add --transport http toonlab https://toonlab.io/mcp
```

Other clients: add `https://toonlab.io/mcp` as a remote MCP server and
authorize in the browser. Full client-by-client setup and a tool reference
live at [toonlab.io/docs/mcp](https://toonlab.io/docs/mcp).

### 3. The first prompt

Give the agent a goal, name the skill, and let it verify its own work:

```text
Using the ToonLab game-dev skill, set up a new Three.js + Vite project with
@call-me-sensei/toonlab. Build a 1 km seeded open world (archetype
"lakeland") with the bundled toon-shaded mannequin as the playable character,
water, sky, the "call_me_sensei" weather preset, post-processing, and a
follow camera with game feel. Follow the skill's assembly order and
frame-loop contract, then run the dev server and fix issues until I can walk
from spawn to the shoreline and swim.
```

### 4. Prompts for common jobs

```text
Use the ToonLab MCP server to find CC0 props for a small fishing village —
lanterns, crates, a pier, a torii gate — then place every import with
propAssetFromObject so they are grounded, collided, and LOD'd. Tell me what
came from where with licenses.
```

```text
Using the ToonLab water skill, make the ocean stormier as the player sails
away from shore, and let them surf the plunging breakers near the reef.
```

```text
Generate a seamless mossy stone texture with texgen and apply it to the
shrine path. I want a hand-painted look with a five-stop cel ramp.
```

```text
Using the ToonLab weather + lighting skills, add a day/night cycle with a
thunderstorm that rolls in at dusk: wind picks up in the grass, rain streaks
the water, lightning drives the sky and light rig.
```

```text
Search my ToonLab library for the "sunset-festival" style bundle and apply
it across toon shading, sky, water, and post so the whole game matches it.
```

```text
Give the sword swing anime game feel: hit-stop, a camera punch, a trail
ribbon and impact sparks from vfxgen, and a white flash on hit.
```

A more extensive prompt cookbook — including the Pro generation and
character-consistency workflows — is at
[toonlab.io/docs/prompts](https://toonlab.io/docs/prompts).

## License

Code is [MIT](LICENSE), copyright Hyperbond Studio PTE. LTD. Bundled assets are CC0 — see
[ATTRIBUTION.md](ATTRIBUTION.md) for credits and for the bring-your-own
conventions (Mixamo clips, your own models, licensed scan packs).
