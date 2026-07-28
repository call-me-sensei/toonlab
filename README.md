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

Every canonical card shows two separate statuses: the editor/lab status and
the portable npm-library status. Character & Creature Shader and Rock &
Geology Shader are the explicitly approved Ready/Ready items; Manufactured
Surface remains In progress as a lab while its runtime library is Ready. See the
[definitive lab inventory and npm roadmap](docs/lab-roadmap.md) for the 69-lab
matrix and acceptance gates.

Every lab also uses one shared 24-hour preview harness with Dawn, Day, Sunset,
and Night captures. The Day reference must visibly show Call Me Sensei's
cool/blue shadow response. See the
[universal preview contract](docs/lab-preview-environment.md).

- **Look Development** — fourteen shader-facing profiles, including separate
  Tree, Grass, and Flower profiles over the shared Vegetation family, plus
  Ground, Water, Sky, Atmosphere, Weather, and VFX; Lighting, Post, Linework,
  and UI complete the family.
- **Asset Creation & Assembly** — high-quality modular assembly plus proven
  procedural workflows for rocks, vegetation, paths, textures, graphics, VFX
  sources, and audio sources. Raw Prop/Building generators are not canonical.
- **Motion & Performance** — rigging, retargeting, animation clips, runtime
  motion, facial performance, secondary motion, cameras, and cinematics.
- **Effects & Audio** — VFX effects, ambient VFX, game feel, SFX cues, spatial
  mix, soundscapes, adaptive music, and voice/dialogue.
- **World Building & Simulation** — landscape, hydrology, biome, settlement,
  interior layout, scene composition, climate/time, weather state, populations,
  physics, navigation, and streaming.
- **Pipeline & Shipping** — Style Bundle, Gallery/licensing, import/labeling,
  routing/audit, reconstruction, procedural base sets, coverage, performance,
  export, regression, and npm release.
- **Playgrounds & demos** — Playground, Water Playground, Outdoor World, VFX
  Arena, Fauna Demo, and Ambient VFX Demo validate the authored artifacts in
  interactive scenes.

Existing editors link to their standalone pages; missing editors remain
visible as non-clickable roadmap cards. The procedural
Catalog is exposed through `@call-me-sensei/toonlab/catalog`. See
[Lab responsibilities](docs/lab-architecture.md) for scope rules and
[Getting started](docs/getting-started.md) for current direct routes.

Sky, Water, Atmosphere, and Weather Rendering are explicit look-development
shader profiles. Their current runtime state remains separate: current
Lighting and Weather state is composed through named transient layers and
exposed as `.renderedSettings` without changing exported presets. Create a
`LightingSystem`, then call
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
| Styles and bundles | `@call-me-sensei/toonlab/styles` | Local, versioned style-bundle documents that coordinate domain profiles without storing asset identity or current scene state. Create, validate, serialize, parse, and resolve JSON with no account or database; hosts currently route explicitly labeled assets through each owning runtime. [Contract](docs/styles-and-bundles.md) |
| Toon character shading | `@call-me-sensei/toonlab/toon` | Modern anime character shader: cel bands with art-directed face lighting, skin-tone shadow management, shadow-color HSV control, scene/self/contact shadows, average-shadow smoothing, rim light (fresnel or screen-space depth), stylized + anisotropic hair highlights, eye catchlights, role-aware specular, source map routing (normal/AO/emissive/MatCap/ramp/detail), inverted-hull outlines, glitter, stickers, perspective removal, shell fur, dither fades — 23 settings groups, all preset-serializable. [Docs](docs/toon-shading.md) |
| Environment shading | `@call-me-sensei/toonlab/environment` | Modern anime-style scene shader for texture packs, standard glTF, and untextured scenes: material-role classification, wrapped lighting, packed-map hints, window cutouts, sun/lamp rigs, time-of-day, six-direction ambient probe, planar floor reflections, BVH vertex-AO baking, height fog, cloud shadows. [Docs](docs/environment.md) |
| Lighting | `@call-me-sensei/toonlab/lighting` | Versioned lighting recipes and looks, physical/artistic intensity helpers, reusable luminaire/rig/look/quality presets, deterministic light and shadow budgets, capability diagnostics, runtime Three.js realization, and a data-only ToonLab Many Lights/Dynamic GI handoff. [Docs](docs/lighting.md) |
| Atmospheric conditions | `@call-me-sensei/toonlab/atmospheric-condition` | Portable air, cloud-ceiling, fog, precipitation, light, electrical, and flow state plus deterministic transitions and sequence playback. The shipped fifteen-profile collection is explicitly the Call Me Sensei set; shader styles and generated source assets remain independent. [Docs](docs/climate-system.md) |
| Weather | `@call-me-sensei/toonlab/weather` | Shared cross-system weather coordinator with 21 conditions rendered through an independent IP-wide style, smooth transitions, one-draw GPU precipitation (rain, snow, sleet, hail, dust), lightning/thunder events, and normalized wetness/snow/ice outputs. It drives sky, sun, fog, cloud shadows, wind, vegetation, water, fauna, and ambient effects through their public adapters. [Docs](docs/weather.md) |
| Water | `@call-me-sensei/toonlab/water` | Fully procedural integrated water system: Gerstner wave stack with a calm→storm dial, wave sets, plunging breakers you can surf, three-stop absorption color, refraction/caustics/foam, GPU ripple sim, splashes, wakes, rain, kelp, underwater view, construction-time quality, and a CPU mirror of the whole spectrum for buoyancy. [Docs](docs/water.md) |
| Vegetation | `@call-me-sensei/toonlab/vegetation` | Instanced grass and flower fields, procedural trees/flowers with serializable recipes, coordinated grass palettes (base, tip, and shadow tint), and one semantic-role `VegetationShaderProfile` shared across grass, foliage, flowers, bark, and stems. Asset identity and current wind/weather remain separate. [Docs](docs/vegetation-sky.md) |
| Rock shader | `@call-me-sensei/toonlab/rock-shader` | Detailed, versioned rock-material profiles with projected detail, distance tint, normal fading, striping, moss and optional top layers, plus explicit source-albedo and vertex-color/AO integration. Call Me Sensei is the default. Geometry generation remains separate in `rockgen`. [Docs](docs/rock-shader.md) |
| Paths, roads & bridges | `@call-me-sensei/toonlab/pathgen` | Seeded path networks routed over any `heightAt`: cost-field router (slope/water aware), hand-drawn ribbon overlay in dirt/stone/planks, arched plank bridges with collision, stepped stone climbs, flattened `paths.heightAt` for walkability, scatter exclusion mask, minimap overlay. |
| Asset placement | `@call-me-sensei/toonlab/propgen` | The universal placement pipeline (the PropAsset contract: grounded, collided, instanced, hi/lo LOD by true 3D distance). `propAssetFromObject` drops any imported GLB — e.g. a CC0 model found through MCP — into the pipeline. |
| Fauna | `@call-me-sensei/toonlab/fauna` | Instanced GPU-animated ambient creatures: flocking birds that perch and flush, butterflies over flower masks, hovering dragonflies, schooling koi — staggered boids, hard population budgets, ≤ 1 ms CPU at defaults. |
| Ambient VFX | `@call-me-sensei/toonlab/ambientfx` | One GPU particle backbone, five effects: falling petals and leaves, dusk fireflies, backlit pollen, shoreline mist — follow-window emission, shared wind with grass, time-of-day gates, 3 draw calls total. |
| Asset catalog | `@call-me-sensei/toonlab/catalog` | Every recipe/preset as a searchable manifest with one headline call: `catalog.spawn(id, { seed })` → a placeable PropAsset for trees, rocks, and debris. `catalog.addSource(url)` mounts remote registries. |
| Sky | `@call-me-sensei/toonlab/sky` | Integrated gradient/sun/painterly-cloud/star system with exactly 46 portable art fields, named live scene layers, compile-time quality tiers/custom 1–5 cloud octaves, meaningful built-in looks, and water-reflection compatibility. [Docs](docs/sky.md) |
| Cloud shader | `@call-me-sensei/toonlab/cloud` | Independent 18-field cloud appearance profile for composition, procedural shape, two-tone lighting, and drift response. Call Me Sensei is the default; current sky, time, condition, particles, and quality remain outside the document. [Docs](docs/cloud-shader.md) |
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
const terrain = createStylizedTerrain({ seed: 42, size: 1000, archetype: 'lushKarst' });
const terrainRoot = new THREE.Group();
terrainRoot.add(terrain.root);
scene.add(terrainRoot);

// Environment shading, aligned sun + real shadows, sky, anime water, LOD
// volumetric far-tree LOD, instanced understory, follow-window grass,
// soft contact grounding, cloud shadows,
// banded limestone cliffs, luminous blue shadow fill, unified three-layer
// fog, and collision — all on by default.
const world = await createStylizedWorld({
  renderer, scene, camera,
  terrain: { heightAt: terrain.heightAt, root: terrainRoot, size: terrain.meshExtent },
  water: { level: terrain.waterLevel },
  weather: { preset: 'partlyCloudy', style: 'call_me_sensei' }, // condition × IP style
  followTarget: character, // your character root (optional): splashes, wakes, grass push
});
character.position.copy(terrain.spawn); // probed: walkable, near a shore
// terrain.landmarks contains the default horizon castle (landmark:false opts out).

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  world.update(clock.getDelta());
  renderer.render(scene, camera);
});
```

For fast gliders, vehicles, dashes, or fauna, use the matching motion-streak
primitive instead of hand-building white boxes:

```js
import { createMotionTrails } from '@call-me-sensei/toonlab/vfxgen';

const trails = createMotionTrails({
  target: glider,
  anchors: [[-1.2, 0, 0.4], [1.2, 0, 0.4]],
});
scene.add(trails.root);
// each frame: trails.update(delta, camera)
```

Its defaults are speed-gated, 0.2-second, narrow, translucent ribbons that
taper at both ends; slow movement produces no trail.

Large objective/checkpoint rings should use the open-hoop primitive rather
than a filled transparent quad:

```js
import { createGlowRing } from '@call-me-sensei/toonlab/vfxgen';

const checkpoint = createGlowRing({ radius: 4, position: [0, 6, -30] });
scene.add(checkpoint.root);
// each frame: checkpoint.update(delta)
```

It contains only a crisp torus core, a restrained torus line halo, and a
local shadow-free point glow, so the center can never become a screen-sized
colored veil.

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
radius)` per frame). Archetypes: `lushKarst` (default), `terracedKarst`, `lakeland`, `alpine`,
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
- [Lab responsibilities](docs/lab-architecture.md) — the finalized artifact,
  production-method, editor/library, and preview-state boundaries.
- [Definitive lab inventory and npm roadmap](docs/lab-roadmap.md) — all 69
  canonical labs, dual statuses, npm owners, coverage matrix, and gates.
- [Universal lab preview environment](docs/lab-preview-environment.md) —
  shared 24-hour controls, four-state regression matrix, and required cool/blue
  daylight-shadow verification.
- [Rock shader](docs/rock-shader.md) — the separate generator/material
  architecture, 58-field public configuration, import policy, and bundle use.
- [Styles, style bundles, and asset routing](docs/styles-and-bundles.md) —
  rendering domains, required asset labels, fallback policy, bundle ownership,
  OSS application boundaries, and the shader/lab migration contract.
- [Open asset library and scene coverage](docs/open-asset-library.md) —
  measurable scene-kit coverage, curated stylized generator base sets,
  CC0/CC-BY provenance, gallery routing, and generation fallback policy.
- [Getting started](docs/getting-started.md) — clone, run, tour the labs,
  load your own models.
- [Toon character shading](docs/toon-shading.md)
- [Manufactured environment materials](docs/urban-prop-surface-roles.md) —
  the layered classify-once contract for props, vehicles, buildings,
  interiors, and reusable material-aware shaders.
- [Environment shading](docs/environment.md)
- [Lighting](docs/lighting.md)
- [Weather system](docs/weather.md)
- [Generative style labs](docs/style-labs.md) — Post & Color, Camera, Motion,
  UI Theme, Biome, Soundscape, and Game Feel; shared recipes, MCP authoring,
  package runtimes, quality budgets, and engine design references.
- [Water](docs/water.md)
- [Sky system](docs/sky.md)
- [Cloud shader](docs/cloud-shader.md)
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
prompt and iterate. The npm package ships runtime source plus the small
text-only `agents/` guidance bundle. It does not ship labs, examples, review
fixtures, model files, textures, or other visual assets.

### 1. Install the ToonLab skills in your game project

The skills teach the agent the assembly order, the frame-loop contract, and
each subsystem's API so it wires ToonLab correctly on the first try. Start
with `game-dev`; use `outdoor-world` whenever visual quality is the goal. It
now carries enforceable defaults and screenshot checks for geology, luminous
shadows, high-quality tree/grass LOD, living cloud light, deeper water, open
checkpoint hoops, and tapered speed trails.

```bash
# Claude Code — feature skills + project guidance
mkdir -p .claude/skills
cp -R node_modules/@call-me-sensei/toonlab/agents/skills/claude/* .claude/skills/
cat node_modules/@call-me-sensei/toonlab/agents/claude/CLAUDE.md >> CLAUDE.md

# Codex — shared guide + Codex-oriented skills
cat node_modules/@call-me-sensei/toonlab/agents/codex/AGENTS.md >> AGENTS.md
mkdir -p docs/toonlab-skills
cp -R node_modules/@call-me-sensei/toonlab/agents/skills/codex/* docs/toonlab-skills/

# Cursor — rule file
mkdir -p .cursor/rules
cp node_modules/@call-me-sensei/toonlab/agents/cursor/toonlab.mdc .cursor/rules/
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
water, sky, the "call_me_sensei" weather style, post-processing, and a
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
