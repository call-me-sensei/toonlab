# Getting started

ToonLab's recommended workflow is to stylize and populate an existing scene,
find assets through the Gallery or MCP, and author focused portable settings or
assets. It is not currently a reliable one-prompt world builder. See
[What ToonLab is ready for today](capability-status.md) before choosing a lab or
writing an agent brief.

## Clone and run

```bash
git clone https://github.com/call-me-sensei/toonlab.git && cd toonlab
npm install
npm run dev
```

Vite opens `http://localhost:5175` on the curated Labs home. Pick **Character
Shader Lab** (`/shader-lab/`) to see the repository's CC0 mannequin fixture
already toon-shaded. Everything else you see out of the box — water, sky,
grass, trees, flowers, splashes — is procedural. The mannequin is lab preview
content and is not bundled in the npm package.

Rendering uses Three's `WebGPURenderer` by default. Use `?renderer=webgl` for
the TSL WebGL2 fallback, or `?renderer=webgpu` to make the default explicit.

`npm run build` produces a production build in `dist/`.

## The labs

The lab UIs live in `labs/` and are not part of the npm package. The definitive
catalog separates Look Development, Asset Creation & Assembly, Motion &
Performance, Effects & Audio, World Building & Simulation, Pipeline &
Shipping, and validation demos. Every canonical card shows independent Lab
and npm-library status. Every preview also uses the shared 24-hour
Dawn/Day/Sunset/Night harness; Day must expose the cool/blue Call Me Sensei
shadow response. See
[Lab responsibilities](lab-architecture.md) for the ownership rules.

| Lab | URL | What it shows |
|---|---|---|
| Labs home | `/` | The definitive product inventory, grouped by artifact ownership with separate Lab and npm-library status plus the intended package target on every canonical card. |
| Character Shader Lab | `/shader-lab/` | A focused editor for the shared character treatment: every toon setting (23 groups), preset selection/export/import, debug views, and animation playback. Exercises `@call-me-sensei/toonlab/toon` and `@call-me-sensei/toonlab/debug`; the mannequin is preview content, not part of the preset. |
| Environment Shader Lab | `/environment-lab/` | A focused editor for the shared environment-material treatment: feature paths, light response, interior occlusion, surface styling, preset selection/export/import, and debug views. Exercises `@call-me-sensei/toonlab/environment`; the room, lights, camera, and walk controls are preview-only. |
| Playground: Controller Test | `/playground/` | Third-person character controller (WASD + mouse, Space to jump, Shift to sprint) on a vegetated stage. Exercises `@call-me-sensei/toonlab/character` retargeting + the vegetation systems. |
| Environment Playground (Indoor) | `/playground/?scene=indoor` | Walkable indoor environment scene with a live Environment Settings panel (every environment shader feature and parameter from the field schema). Loads the first environment from your gitignored `assets-local/environments/` drop-in (bring your own scene — a load banner appears without one). Exercises `@call-me-sensei/toonlab/environment` + `@call-me-sensei/toonlab/debug`. |
| Lighting Lab | `/lighting-lab/` | Repository-only lighting authoring and diagnostics prototype. Its source and documents are not a public npm export in 0.4.10; consumers keep lighting host-owned. |
| Weather Lab | `/weather-lab/` | Experimental cross-system qualification editor: 21 condition presets, transitions, atmosphere/wind/precipitation/lightning/surface controls, and portable preset import/save/export. Its public API does not make complete world composition a recommended workflow. |
| Atmospheric Condition Lab | `/atmospheric-condition-lab/` | Experimental composition editor for the 48-field condition document and fifteen Call Me Sensei profiles. Sky, Cloud, atmosphere shader profiles, generated source assets, and final host integration remain separate. |
| Water Lab | `/water-lab/` | The standalone water editor: a separate IP-wide Style selector composed over seven water presets, every authored field for waves, surface color, foam, lighting/reflections, ripples, and splashes, plus construction-time quality selection, preset save/load/export, debug views, and interactor toys (splashes, buoyant balls, rain). Three stage grounds follow the preset — a gentle beach where the swash runs up and down the sand, a beach-to-deep basin with depth-test rocks/fish/kelp, and open water with a small island and a floating CC0 ship (PolyHaven `dutch_ship_medium` from `assets-local/`, toon boat fallback). **Preview in scene** carries your authored settings into the walkable Water Playground. Exercises the full `@call-me-sensei/toonlab/water` system. |
| Sky Lab | `/sky-lab/` | Experimental qualification editor migrating to the Sky Shader boundary and shared Sky · Cloud · Atmosphere stage. Sky authoring and final composition are not recommended until this lab is cleaned up and re-approved. |
| Cloud Shader Lab | `/cloud-shader-lab/` | Experimental 31-field cloud-dome treatment editor against the P18 reference stack. Source assets, silhouette composition, world state, and final host integration remain separate and must pass the cleaned-lab gate. |
| Rock Shader Lab | `/rock-shader-lab/` | The reusable rock-material editor: complete public-schema controls for projection, distance tint, normals, striping, moss, top layers, source-albedo policy, and asset color/AO participation. Call Me Sensei is the default. Exercises `@call-me-sensei/toonlab/rock-shader`; preview fixture geometry is never saved. |
| Water Playground | `/playground/?scene=water` | The walkable beach diorama — wadeable lake (ripples, wakes, buoyancy), flowing river with current, and ocean beach with shoaling swell, plunging breakers, and swash. Walk in past chest depth and the character swims; C/Ctrl dives, Space swims up. **Edit in Water Lab** round-trips the live settings back to the editor. |
| Rock Lab | `/rock-lab/` | Procedural rocks, cliffs, heightfields, sculpt edits, baked asset color/AO, LOD, collision, and GLB export from `@call-me-sensei/toonlab/rockgen`. Its historical Surface base selector changes baked generator data; the reusable shader is previewed here but authored separately in Rock Shader Lab. |
| Tree Generation Lab | `/tree-lab/` | Procedural stylized trees and bushes, sketch authoring, attached canopy blossoms, recipes, and GLB export from `@call-me-sensei/toonlab/vegetation`. |
| Flower Generation Lab | `/flower-lab/` | Standalone procedural flowers with stem, leaf, bloom, recipe, and GLB controls from `@call-me-sensei/toonlab/vegetation`. |
| Grass Generation Lab | `/grass-lab/` | Procedural blade dimensions, planting data, motion data, palettes, portable asset presets, and gameplay-scale previews from `@call-me-sensei/toonlab/vegetation`. |
| Tree Shader Lab | `/tree-shader-lab/` | Reusable canopy-foliage and bark/wood profile over the shared Vegetation renderer family. Tree geometry, species, LOD, scatter, and current conditions are excluded. |
| Grass Shader Lab | `/grass-shader-lab/` | Reusable blade/groundcover material profile over the shared Vegetation renderer family. Blade geometry, planting density, placement, and current wind are excluded. |
| Flower Shader Lab | `/flower-shader-lab/` | Reusable petal, center, leaf, and herbaceous-stem profile over the shared Vegetation renderer family. Species, geometry, placement, and current wind are excluded. |
| Vegetation compatibility lab | `/vegetation-shader-lab/` | Legacy aggregate profile editor retained for existing documents; new work uses the three dedicated shader labs. |
| Debris Lab | `/debris-lab/` | Procedural debris and scatter pieces with an IP-wide Style selector composed over every asset preset, preset thumbnails, and GLB export from `@call-me-sensei/toonlab/debrisgen`. |
| Texture Lab | `/texture-lab/` | Seamless procedural PBR textures for anything — 60+ material presets, layered pattern/color/overlay controls, an AI prompt box (offline mapper built in; add your own Gemini/OpenAI key for smarter mapping), and PNG/ZIP export from `@call-me-sensei/toonlab/texgen`. |
| Outdoor World | `/examples/outdoor-world/` | Experimental integration scene for studying terrain, paths, bridges, villages, lighting, water, and vegetation at world scale. It is not a supported one-shot construction template. |
| VFX Arena | `/examples/vfx-arena/` | Repository-only combat-effects integration scene. `vfxgen` is not a public npm export in 0.4.10; consumers keep gameplay VFX host-owned. |
| Fauna Demo | `/examples/fauna-demo/` | Gameplay-scale preview for birds, butterflies, dragonflies, and koi from `@call-me-sensei/toonlab/fauna`. |
| Ambient VFX Demo | `/examples/ambientfx-demo/` | Gameplay-scale preview for petals, leaves, fireflies, pollen, and mist from `@call-me-sensei/toonlab/ambientfx`. |
| Legacy Prop experiment | `/prop-lab/` | Existing procedural experiment retained for compatibility and evaluation. It is not a canonical lab or roadmap milestone; manufactured props move to high-quality base-set assembly. |
| Legacy Building experiment | `/building-lab/` | Existing procedural experiment retained for compatibility and evaluation. It is not a canonical lab or roadmap milestone; architecture moves to modular-kit assembly and layout. |
| Gallery | `/gallery/` | Search and import open third-party textures, models, and HDRIs from supported public sources. |

These categories describe ownership, not just navigation. Water, Sky,
Atmosphere, Weather Rendering, and VFX are explicit shader-facing look owners.
Their current conditions, effect timing, layouts, source assets, and simulation
remain separate artifacts. Asset nouns do not automatically receive procedural
generators: sourcing, base-set assembly, reconstruction, and external authoring
are preferred whenever they produce better results. The complete matrix is in
[Definitive lab inventory and npm roadmap](lab-roadmap.md).

### World-system composition and quality

This section documents public qualification surfaces and repository
experiments. It does not mean that ToonLab currently supplies a production
full-world coordinator. Sky/Cloud composition and cross-system world assembly
remain experimental until their labs and controlled qualification scenes are
cleaned up and re-approved.

For both `StylizedSky` and `WaterSurface`, `.settings` is the authored baseline
used by portable documents. Lighting, Weather, or another live scene owner
should use a unique id with `setSceneOverrideLayer(id, valuesOrResolver)` and
remove only that id with `clearSceneOverrideLayer(id)`. The composed result is
available through `.renderedSettings`; it must not be written back into a
preset. `setSceneOverrides()` is only the convenience manual layer, and
`clearAllSceneOverrideLayers()` is reserved for an explicit full teardown.

Create a `LightingSystem`, then call `lighting.attachWorld(world)` to drive the
world-owned sun adapter and private Lighting layers for Sky and Water. When the
world has Weather, it also installs Lighting as Weather's sun/ambient/fog
bridge: Lighting remains the sole writer for those outputs, while Weather
supplies modulation and its own higher-priority Sky/Water layers. Detaching
Lighting restores its world state and clears only Lighting-owned layers.

A Sky style contains exactly 46 portable art fields; dome radius and quality
are runtime policy. Named Sky quality tiers compile 2, 3, or 4 cloud octaves,
and `{ cloudOctaves: 1..5 }` defines a custom tier. `sky.setQuality()` rebuilds
the Sky material while preserving authored settings and live layers. Water
quality is also compile-time, but is selected when constructing
`WaterSurface`; changing it requires replacing/rebuilding the surface. The
Water Lab performs that rebuild, while `water.applySettings()` remains a live
art/simulation update rather than a quality switch.

The water scenes expose an **Env** lighting select (Noon / Sunset / Moonlit /
Overcast / Storm), water **Mode** and **Tone** selects, quality tiers, debug
views (`?waterDebug=foam`, `depth`, `ripple`, ...), and Drop Ball / Drop
Sinker buttons for buoyancy testing.

## URL params, persistence, and Reset Lab

Every URL parameter has a HUD control — the HUD writes the parameter back
into the URL, so any lab state is shareable as a deep link. Key params:

```text
?model=<path or URL>       character model (see below)
?toonPreset=default        toon preset
?toonDebug=band            toon debug view (docs/toon-shading.md)
?envPreset=interiorDay     character preview environment (legacy shared HUD)
?envDebug=albedo           environment debug view (docs/environment.md)
?envStyle=call_me_sensei&envScenario=interiorDay
                           environment Style × Scenario
?waterPreset=ocean&waterStyle=call_me_sensei
                           water Preset × Style; ?waterDebug= controls preview
?skyStyle=call_me_sensei&skyScenario=golden_hour
                           sky Style × Scenario (`skyPreset` remains a legacy alias)
?weatherPreset=rain&weatherStyle=call_me_sensei
                           weather Condition × Style
?rockPreset=boulder&rockStyle=call_me_sensei
                           rock Preset × Style
?post=1&postPreset=softAnime  post-processing (docs/post-processing.md)
```

Lab state (selected model, presets, debug views) is saved per lab in
`localStorage` and restored when you return with a bare URL. An explicit URL
parameter always wins over a stored value. The **Reset Lab** button clears
the stored state for the current lab and reloads it clean.

## Loading your own models

Three ways, no code changes required (details in
[characters.md](characters.md)):

1. **Model URL input** — paste any local path or hosted URL into the HUD's
   Model URL field (or use `?model=`). The npm character helper exposes an
   immutable public-R2 CC0 mannequin URL when a consumer needs the standard
   qualification fixture. Supported formats: GLB/glTF, VRM 0
   and 1, PMX/PMD, FBX, OBJ (+ `&mtl=`), and text-based USDZ. Hosted URLs
   must be served with CORS headers (`Access-Control-Allow-Origin`);
   failures show an error banner in the HUD instead of a blank scene.
2. **`assets-local/` drop-in folder** — a gitignored folder for private test
   assets. Drop a character in `assets-local/models/` and run
   `npm run assets:local`; it appears in every model-aware lab's Model select alongside
   the repository mannequin fixture. A model is picked up when its path matches one of
   these shapes (sibling textures/materials load automatically):

   ```
   assets-local/models/hero.glb                 # loose file
   assets-local/models/hero/hero.pmx            # folder named after the character
   assets-local/models/hero/model.vrm           # or a "model.*" main file
   assets-local/models/hero/source/hero.fbx     # packaged marketplace download
   assets-local/models/tests/<FORMAT>/<name>/…  # format test grid
   ```

   Nothing in `assets-local/` is ever committed or published. The discovery
   rules live in `labs/shared/localModelCatalog.js`.
3. **Repository lab default** — the CC0 Quaternius mannequin
   (`public/characters/mannequin.glb`) with 46 embedded clips, so a source
   checkout's character/model previews work without a network download. This
   file is excluded from the npm tarball.

### Mixamo animation clips

Models without embedded locomotion clips are animated by retargeting Mixamo
FBX clips. Adobe's terms do not allow redistributing the clips, so download
them with your own Adobe account from [mixamo.com](https://www.mixamo.com)
and drop the FBX files into `assets-local/animations/` (e.g. `Idle.fbx`,
`Walking.fbx`, `Swimming.fbx`). Without them, models fall back to their own
embedded clips. See [ATTRIBUTION.md](../ATTRIBUTION.md) for the full
asset-licensing picture.

## Regenerating the settings reference

[settings-reference.md](settings-reference.md) is generated from the settings
schemas — never edit it by hand:

```bash
node scripts/generate-settings-reference.mjs
```

The script starts its own dev server on port 5192, extracts every settings
schema through a headless browser, and writes the markdown. Set
`TOONLAB_DOCS_BASE_URL=http://localhost:5175` to reuse a dev server that is
already running.

## Next steps

- [Current capability status](capability-status.md)
- [Styles, style bundles, and asset routing](styles-and-bundles.md)
- [Snow Surface Shader architecture](snow-surface-shader.md)
- [Open asset library and scene coverage](open-asset-library.md)
- [Toon character shading](toon-shading.md)
- [Environment shading](environment.md)
- [Lighting](lighting.md)
- [Generative style labs](style-labs.md)
- [Water](water.md)
- [Sky](sky.md)
- [Cloud Shader](cloud-shader.md)
- [Vegetation](vegetation-sky.md)
- [Post-processing](post-processing.md)
- [Characters and animation](characters.md)
- [Debug panel](debug-panel.md)
