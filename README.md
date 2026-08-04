# ToonLab by Call Me Sensei

ToonLab by Call Me Sensei is an anime rendering and content-integration toolkit
for [Three.js](https://threejs.org/). It is purpose-built for cel-shaded anime
games rather than generic stylization. Today it is strongest when a developer
already has a scene, level layout, or asset and wants to apply coordinated
character, environment, ground, rock, vegetation, water, and post treatments
without building those shaders from scratch. It also provides focused asset
generators, a searchable Gallery, portable presets, and OSS/Pro MCP workflows.

ToonLab does **not** currently make a coding agent reliable at constructing a
complete polished world from one prompt. Terrain composition, natural cliffs,
coastlines, beaches, underwater habitat, biome layout, lighting, cameras, and
final scene art direction remain host-authored or experimental work. Sky and
Cloud APIs are available for qualification, but their end-to-end authoring and
composition workflow remains experimental until the labs are cleaned up and
re-approved.

Use ToonLab as a focused runtime library (`@call-me-sensei/toonlab` on npm), as
an asset/preset authoring workspace, or as an asset-discovery service—not as a
one-shot world generator.

## Recommended scope today

The recommended production workflow is:

1. **Style an existing scene** with Toon, Environment, Ground, Rock,
   Tree/Grass/Flower, Water, and Post runtimes. Water still needs a host-authored
   footprint, shore, and closed seabed.
2. **Find and reuse assets** from the project/library, released ToonLab Gallery,
   or policy-permitted open sources. Select by dimensions, taxonomy,
   provenance, license, review status, and immutable public URLs before
   downloading.
3. **Connect through ToonLab MCP**—ToonLab OSS local MCP, ToonLab Pro remote
   MCP, or both—for discovery, metadata, provenance, saved presets/files, and
   policy-aware imports.
4. **Author bounded outputs** such as portable settings, style bundles,
   procedural grass/trees/rocks/debris/textures, model-loading integrations,
   and clean-package regressions.

Whole-world generation, terrain/biome/coast/cliff formation, automatic set
dressing, Lighting/Weather/Climate composition, gameplay systems, and current
Sky/Cloud composition belong under experimentation. See
[What ToonLab is ready for today](https://github.com/call-me-sensei/toonlab/blob/main/docs/capability-status.md)
for the exact boundary and a recommended agent brief.

## Quickstart

**No install** — use the hosted labs at **[toonlab.io](https://toonlab.io)**:
define character, vegetation, and environment shaders; author stylized assets;
tune Water; experimentally qualify Sky/Cloud; and export portable presets from
the browser.

**As a library** in your own Three.js app:

```bash
npm install @call-me-sensei/toonlab
```

**Run the labs locally** (this repo):

```bash
git clone https://github.com/call-me-sensei/toonlab.git && cd toonlab
npm install
npm run setup
npm run dev
```

Setup starts local Postgres with Docker Compose, applies schema migrations and
official catalog seeds, and reports configured BYO-key providers. Set an
external `DATABASE_URL` to use an existing Postgres service instead. Vite
serves the labs at `http://127.0.0.1:5175`. See
[Getting started](https://github.com/call-me-sensei/toonlab/blob/main/docs/getting-started.md) for a tour.

### Complete local setup

Prerequisites:

- Git and Node.js 18 or newer.
- Docker Desktop on macOS/Windows, or Docker Engine with the Compose plugin on
  Linux. Use Docker's official installation guides for
  [macOS](https://docs.docker.com/desktop/setup/install/mac-install/),
  [Windows](https://docs.docker.com/desktop/setup/install/windows-install/),
  or [Linux](https://docs.docker.com/engine/install/).
- On macOS or Windows, open Docker Desktop once, finish its first-run setup,
  and wait until it reports that the Docker engine is running.
- At least one provider API key only if you want local AI generation. Browsing,
  editing, the Library, styles, and official catalog assets do not require one.

Install and configure:

```bash
git clone https://github.com/call-me-sensei/toonlab.git
cd toonlab
npm install
cp .env.example .env
```

Edit `.env` if needed:

```dotenv
# The bundled local database; leave this unchanged for the simplest setup.
DATABASE_URL=postgresql://toonlab:toonlab@127.0.0.1:55432/toonlab

# Optional server-side provider keys. Add only providers you use.
TRIPO_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
ARK_API_KEY=
POLYPIZZA_API_KEY=
```

Then initialize and start ToonLab:

```bash
npm run setup
npm run dev
```

Open `http://127.0.0.1:5175`. `npm run setup` starts Postgres, waits for it to
be healthy, applies every missing schema migration, applies every missing
official catalog dataset, and reports which providers are configured. It is
safe to run again.

If setup reports that Docker Desktop is installed but not running, start it
and retry:

```bash
open -a Docker # macOS
npm run setup
```

ToonLab supports the normal `docker compose` plugin, Docker Desktop's bundled
Compose binary on macOS, and the legacy `docker-compose` command.

To use an existing Postgres server instead of Docker, set `DATABASE_URL` to
that server before running setup. ToonLab skips Docker and applies the same
migrations and catalog batches to the external database.

### Local Generate and Library

Open `/generate/` to use the same asset-generation workflow as ToonLab Pro
without accounts, credits, billing, or Character Setup. The local workspace
supports:

- Tripo text-to-3D, image-to-3D, multi-view-to-3D, status polling, downloads,
  and model segmentation.
- Gemini image, texture, and concept generation, including model,
  aspect-ratio, resolution, image-count, reference-image, reference-URL,
  previous-generation, prompt-enhancement, and automatic image-to-3D controls.
- Searchable generation history, full previews, bulk image-to-3D conversion,
  multi-view composition, prompt reuse, cancellation, and explicit saving to
  the Library.

Provider keys remain in `.env` and are read only by the local Node server.
Uploaded references, generated files, and provider downloads are stored as
opaque objects under `.toonlab/objects`; Postgres stores their metadata and
generation history. Saved generated assets appear in `/library/` with preview,
Open, asset-download, JSON-export, and delete actions.

### Updating an existing installation

Use the same update sequence for every ToonLab release, whether it contains
application changes, database changes, new official assets, or all three:

```bash
git pull --ff-only
npm install
npm run update
```

Restart `npm run dev` afterward. `npm run update` is idempotent: it applies
only files that this database has not recorded yet. It does not recreate the
database, reset the Library, or delete local creations, drafts, files, styles,
bundles, or generation history.

Users do not need to inspect a release and choose a migration manually:

| Release content | Repository location | Applied automatically by |
|---|---|---|
| Database structure or behavior | `database/migrations/NNNN_name.sql` | `npm run setup` and `npm run update` |
| Official catalog metadata and immutable `https://assets.toonlab.io` R2 URLs | `database/seeds/catalog/NNNN_release.sql` | `npm run setup` and `npm run update` |
| Personal Library content | Local Postgres and `.toonlab/objects` | Never replaced by an official update |

Fresh installations receive the complete catalog by applying all versioned
seed batches in order. Existing installations apply only newer batches.
Catalog data therefore does **not** use a separate downloadable “current
seed,” and new datasets are **not** schema migrations. Keeping every released
batch in the repository gives fresh and upgraded installations the same final
catalog while preserving a simple, auditable upgrade path.

Applied filenames and SHA-256 digests are recorded in `schema_migrations` and
`catalog_seed_batches`. Never edit, rename, or replace a released migration or
seed file; add the next numbered file instead. The updater intentionally stops
if an already-applied file has changed.

Advanced troubleshooting commands are available, but are not required for a
normal installation:

```bash
npm run db:migrate # apply schema files only
npm run db:seed    # apply catalog dataset files only
```

### Publishing a new official dataset

This is the maintainer workflow; end users still run only `npm run update`.

1. In ToonLab Pro, sign in as the confirmed `jack@hyperbond.studio` account
   and open `/internal/oss-releases`.
2. Create a release snapshot with first-party rocks/trees, eligible mirrored
   open assets, or a combination. ToonLab freezes published first-party
   revisions and only mirrored open assets whose licenses and distributable
   files pass the OSS release gate; there is currently no premium catalog
   tier.
3. Start promotion. The page copies only distributable outputs to immutable
   `official/<release>/<asset-id>/` R2 keys and verifies checksums, sizes,
   content types, `https://assets.toonlab.io` delivery, and CORS. Leave the page open while its
   resumable batches run; retry any reported failures.
4. Download the verified `toonlab.oss-catalog-release.v2` JSON manifest after
   the batch reaches `published`.
   Character Setup, private references, prompts, QA reports, and internal
   review data are never included.
5. In the OSS checkout, choose the next unused four-digit seed number and
   generate the batch:

   ```bash
   npm run catalog:seed:generate -- \
     --manifest release.json \
     --out database/seeds/catalog/0002_release_name.sql
   ```

6. Test `npm run setup` against a clean database and `npm run update` against a
   database containing the previous release.
7. Commit the new immutable seed batch with the application release.

If an existing asset changes, the new batch may upsert its stable asset ID to
the new immutable R2 release URL. Assets omitted from a new batch remain in
the catalog. Schema migrations must never contain catalog rows.

**Building with an AI coding agent?** That is the fastest path through all of
this — see [Build with an AI coding agent](#build-with-an-ai-coding-agent)
for the recommended setup (skills + MCP) and ready-to-paste starting prompts.

### Local MCP server

Running the labs locally also creates a Postgres-backed `.toonlab/` workspace
shared by the browser tools and the included MCP server. Structured records
live in Postgres; `.toonlab/objects` contains opaque local binaries. Open
`http://localhost:5175/settings/` for a checkout-specific configuration you
can paste into an MCP-compatible coding tool.

```bash
npm run dev
# In an MCP client, use the command/config shown at /settings/.
```

The local server can search the built-in procedural catalog and public CC0
sources, read your saved presets and exported files, generate seeded recipes,
and import assets into the project. It uses stdio, requires no account or
OAuth, and keeps work local. See [Local MCP and workspace](https://github.com/call-me-sensei/toonlab/blob/main/docs/mcp.md) and
[Local database and public asset releases](https://github.com/call-me-sensei/toonlab/blob/main/docs/local-database-and-public-assets.md).

## The labs

Lab UIs are development tools and are not published in the npm package. The
Labs home (`/`) presents them by the artifact they author:

Every canonical card shows two separate statuses: the editor/lab status and
the portable npm-library status. Character & Creature Shader and Rock &
Geology Shader are the explicitly approved Ready/Ready items; Manufactured
Surface remains In progress as a lab while its runtime library is Ready. See the
[definitive lab inventory and npm roadmap](https://github.com/call-me-sensei/toonlab/blob/main/docs/lab-roadmap.md) for the 69-lab
matrix and acceptance gates.

Capability tests show a clear split: focused ToonLab shaders, water,
vegetation, assets, and metadata materially improve supplied scene content,
while one-shot outdoor construction has not reached the target quality bar.
The repository keeps that release-audit evidence precisely so a partially
working scene is not marketed as a production capability. Audit artifacts are
excluded from the public runtime package.

Every lab also uses one shared 24-hour preview harness with Dawn, Day, Sunset,
and Night captures. The Day reference must visibly show Call Me Sensei's
cool/blue shadow response. See the
[universal preview contract](https://github.com/call-me-sensei/toonlab/blob/main/docs/lab-preview-environment.md).

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
visible as non-clickable roadmap cards. The repository catalog supports lab
development but is not a public 0.4.10 package subpath. See
[Lab responsibilities](https://github.com/call-me-sensei/toonlab/blob/main/docs/lab-architecture.md) for scope rules and
[Getting started](https://github.com/call-me-sensei/toonlab/blob/main/docs/getting-started.md) for current direct routes.

Sky, Atmosphere, and Weather Rendering remain experimental look-development
and composition surfaces; Water is recommended when the host supplies a valid
footprint, shore, and closed bed. Their current runtime state remains
separate: current Lighting and Weather state is composed through named
transient layers and exposed as `.renderedSettings` without changing exported
presets. In an explicit qualification experiment, create a `LightingSystem`, then call
`lighting.attachWorld(world)` to own the Lighting layers and connect the
world's Weather coordinator as modulation, so each system can detach only its
own layer. The shared `world.setSun({ direction, color, sky })` adapter keeps
the physical light/shadows, vegetation scene inputs, Sky, and Water aligned;
Weather captures and restores every transient baseline it drives. Sky presets contain exactly 46
portable art fields; dome radius and compile-time quality stay outside the
document. Sky provides low/medium/high cloud graphs plus custom 1–5-octave
quality and can rebuild its material with `setQuality()`. These callable Sky
features do not yet qualify the complete Sky/Cloud workflow. Water quality is a
construction-time graph choice; switching it requires replacing/rebuilding
the surface rather than calling `applySettings()`.

Every URL parameter has a HUD control. In local development, lab state is
stored in Postgres so the MCP server and browser share it; existing
`localStorage` and IndexedDB data migrate on first run and browser copies are
retired after the verified commit. Static hosted builds
fall back to browser storage. **Reset Lab** clears the current lab state.
Point any model-aware lab at your own model with the Model URL input or
`?model=` — see
[Characters](https://github.com/call-me-sensei/toonlab/blob/main/docs/characters.md).

## What's inside

Version 0.4.10 exposes the public runtime clusters below. Public API status and
end-to-end capability maturity are different: the recommended workflow is to
apply focused runtimes to supplied scene content. Whole-world composition and
the current Sky/Cloud authoring workflow remain experimental even where a
public qualification API already exists. Lighting, VFX, renderer ownership,
camera behavior, and game feel remain host-owned or pre-beta.

| Cluster | Import | What you get |
|---|---|---|
| Styles and bundles | `@call-me-sensei/toonlab/styles` | Local, versioned style-bundle documents that coordinate domain profiles without storing asset identity or current scene state. Create, validate, serialize, parse, and resolve JSON with no account or database; hosts currently route explicitly labeled assets through each owning runtime. [Contract](https://github.com/call-me-sensei/toonlab/blob/main/docs/styles-and-bundles.md) |
| Toon character shading | `@call-me-sensei/toonlab/toon` | Modern anime character shader: cel bands with art-directed face lighting, skin-tone shadow management, shadow-color HSV control, scene/self/contact shadows, average-shadow smoothing, rim light (fresnel or screen-space depth), stylized + anisotropic hair highlights, eye catchlights, role-aware specular, source map routing (normal/AO/emissive/MatCap/ramp/detail), inverted-hull outlines, glitter, stickers, perspective removal, shell fur, dither fades — 23 settings groups, all preset-serializable. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/toon-shading.md) |
| Environment shading | `@call-me-sensei/toonlab/environment` | Modern anime-style scene shader for texture packs, standard glTF, and untextured scenes: material-role classification, wrapped lighting, packed-map hints, window cutouts, sun/lamp rigs, time-of-day, six-direction ambient probe, planar floor reflections, BVH vertex-AO baking, height fog, cloud shadows. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/environment.md) |
| Atmospheric conditions — experimental composition | `@call-me-sensei/toonlab/atmospheric-condition` | Public qualification API for portable air, cloud-ceiling, fog, precipitation, light, electrical, and flow state plus deterministic transitions. Its complete world integration remains host-owned and experimental. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/climate-system.md) |
| Weather — experimental composition | `@call-me-sensei/toonlab/weather` | Public qualification API for 21 conditions, transitions, GPU precipitation, lightning/thunder, and normalized surface-state outputs. Cross-system assembly with Sky, Lighting, Water, vegetation, fauna, ambient effects, and gameplay remains host-owned and experimental. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/weather.md) |
| Water | `@call-me-sensei/toonlab/water` | Focused water treatment for a host-authored water footprint, continuous shore, and closed seabed: Gerstner waves, absorption color, refraction/caustics/foam, ripples, splashes, wakes, kelp, underwater treatment, and CPU buoyancy sampling. It does not design the coast or underwater habitat. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/water.md) |
| Vegetation | `@call-me-sensei/toonlab/vegetation` | Instanced grass and flower fields; the 12 named pre-species legacy trees; and a focused procedural broadleaf `BranchTree` with deterministic branching, five leaf silhouettes, caller-supplied leaf/bark textures, and a portable recipe. The 165-species research roster remains repository-only experimental work. Independent Tree, Grass, and Flower shader profiles share one semantic-role renderer family. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/vegetation-sky.md) |
| Rock shader | `@call-me-sensei/toonlab/rock-shader` | Detailed, versioned rock-material profiles with projected detail, distance tint, normal fading, striping, moss and optional top layers, plus explicit source-albedo and vertex-color/AO integration. Call Me Sensei is the default. Geometry generation remains separate in `rockgen`. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/rock-shader.md) |
| Ground shader | `@call-me-sensei/toonlab/ground-shader` | Splat-weighted anime terrain with slope/cliff detail, shoreline and weather response, HDR sun/shade controls, safe shadow defaults, and flat-albedo ground-field output for vegetation adoption. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/ground-shader.md) |
| Fauna — experimental composition | `@call-me-sensei/toonlab/fauna` | Public qualification API for instanced GPU-animated ambient creatures. Ecological placement and final scene composition remain experimental. |
| Ambient VFX — experimental composition | `@call-me-sensei/toonlab/ambientfx` | Public qualification API for ambient particle effects. Scene-scale placement, timing, and world-system composition remain experimental. |
| Sky — experimental outcome | `@call-me-sensei/toonlab/sky` | Public qualification API for gradient/sun/painterly-cloud/star settings. Do not present current Sky composition as an approved polished-scene workflow until its lab and controlled captures are cleaned up and re-approved. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/sky.md) |
| Cloud — experimental outcome | `@call-me-sensei/toonlab/cloud` | Public qualification API for cloud source, composition, and appearance documents. Source painting, silhouette composition, and final scene integration remain experimental until the Cloud labs pass the same gate. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/cloud-shader.md) |
| Post-processing | `@call-me-sensei/toonlab/post` | Optional single-pipeline compositor: character-aware bloom, color grade, LUT, vignette, screen outline, depth cue — schema-driven, preset-serializable. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/post-processing.md) |
| Procedural textures | `@call-me-sensei/toonlab/texgen` | Seamless CPU-baked PBR texture generator: 25 tileable pattern/noise generators, layered detail + colored overlays (moss, rust, grime), five-stop cel-capable color ramp, cavity/sheen hand-painted read, derived normal/AO/roughness/metalness/height/ORM/emissive maps, 60+ presets, and a natural-language recipe mapper (offline keywords or BYO-key Gemini/OpenAI). [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/texture-lab.md) |
| Character pipeline | `@call-me-sensei/toonlab/character` | Bone-role adapters for VRM/MMD/Mixamo/Rigify rigs, native-clip conventions, Mixamo retarget helpers, and a procedural freestyle swim clip. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/characters.md) |
| Model loaders | `@call-me-sensei/toonlab/loaders` | Optional GLB/glTF, VRM 0+1, PMX/PMD, FBX, OBJ, and text-USDZ loading helpers. Kept off the root import so apps that do not load models avoid loader dependencies. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/characters.md) |
| Debug panel | `@call-me-sensei/toonlab/debug` | One-line schema-driven tuning GUI for any settings module — the same panel the labs use. [Docs](https://github.com/call-me-sensei/toonlab/blob/main/docs/debug-panel.md) |

The main `vegetation` barrel exposes the complete runtime. Smaller consumers
can import the same bindings from
`@call-me-sensei/toonlab/vegetation-shaders` or
`@call-me-sensei/toonlab/grass-palettes`; package verification asserts that
the focused subpaths and root export reference the identical implementations.

### Default Call Me Sensei grass

ToonLab's default grass is its own deterministic procedural implementation.
The package generates the `primary` or denser `secondary` clump, LOD0/1/2,
blade attributes, and material entirely from code. The public factory uses the
primary `call_me_sensei_clump` meadow by default and has no GLB or image
dependency. Its accepted look is continuous upright coverage, full ground
color adoption, and a bright texture-free watercolor wash—not isolated dark
tufts or generic procedural blades:

```js
import { createCallMeSenseiGrassField } from '@call-me-sensei/toonlab/grass';

const grass = await createCallMeSenseiGrassField({
  placements: [
    { x: 0, y: 0, z: 0, normal: [0, 1, 0], scale: 1, yaw: 0 },
  ],
  // variant: 'secondary',
});
scene.add(grass);

// Update the environment ground-field pass first so blade roots adopt the
// terrain color, then update grass LOD and wind before rendering.
groundFieldPass.update();
grass.update(delta, camera);
```

`CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS` exposes the stable procedural recipes;
`CALL_ME_SENSEI_GRASS_MATERIAL_TEXTURE_URLS` is an empty compatibility binding
because the material has no image dependencies. The default factory returns a
`StylizedGrassClumpField`. `RetainedGrassClumpField` remains the generic
caller-supplied geometry/material container and does not load assets by itself.
The Call Me Sensei default preserves sampled ground hue: green ground produces
only lighter/darker green blades. Optional hue shift/desaturation remain public
profile parameters for other authored styles. Its recipe-v3 LOD0/1/2 topology
uses 40/30/22 primary blades and compensates retained stroke width so zooming
does not make the underlying terrain appear to change color.

The supported 0.4.10 tree set is intentionally the proven pre-species surface.
Use a named legacy silhouette directly:

```js
import {
  LEGACY_TREE_IDS,
  createLegacyTree,
} from '@call-me-sensei/toonlab/vegetation';

console.log(LEGACY_TREE_IDS); // straight, leaning, see-through, ...
const legacyTree = createLegacyTree('golden-gingko', {
  trunkMap: barkTexture,
  vegetationShader: { preset: 'call_me_sensei' },
});
scene.add(legacyTree);
```

For a configurable recursive branch-type broadleaf, use the focused wrapper:

```js
import { BranchTree } from '@call-me-sensei/toonlab/vegetation';

const tree = new BranchTree({
  seed: 18,
  branches: { levels: 3, children: 5, angle: 52 },
  leaves: { shape: 'oak', color: [0.18, 0.48, 0.22], map: leafTexture },
  trunk: { color: [0.48, 0.29, 0.16], map: barkTexture },
});
scene.add(tree);
```

`teardrop`, `round`, `oak`, `maple`, and `gingko` are the supported leaf
shapes. Botanical species generation is not a 0.4.10 package claim.

Water, sky, flowers, trees, grass, and splashes keep procedural defaults, while
legacy trees and BranchTree may use caller-owned leaf and bark textures. The
optional CC0 Quaternius mannequin is also not bundled in npm: its immutable R2
URL, byte count, hash, source, and license are exposed as metadata. A host may
download that test fixture or use its own mannequin:

```js
import { TOONLAB_MANNEQUIN_ASSET } from '@call-me-sensei/toonlab/character';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const { scene: mannequin, animations } = await new GLTFLoader().loadAsync(
  TOONLAB_MANNEQUIN_ASSET.url,
);
```

## Library usage

Start by loading one style bundle, explicitly labeling the scene targets, and
preflighting the complete routing plan. Strict mode is atomic: if any target
is unlabeled, unsupported, or missing an adapter, nothing is mutated.

```js
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  applyStyleBundle,
} from '@call-me-sensei/toonlab/styles';

const targets = [
  {
    id: 'hero',
    domain: 'character',
    subject: characterRoot,
    apply: (root, settings) => applyCharacterProfile(root, settings),
  },
  {
    id: 'terrain',
    domain: 'terrain.ground',
    subject: terrainRoot,
    apply: (root, settings) => applyGroundProfile(root, settings),
  },
  {
    id: 'forest',
    domain: 'vegetation.tree',
    subject: treeRoot,
    apply: (root, settings) => applyTreeProfile(root, settings),
  },
];

await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, { targets });
```

Use the domain-specific runtimes below to implement each `apply` callback.
Asset identity stays in project/library sourcing configuration; it is never
embedded in the style bundle. Custom adapters and custom assets must be
recorded in `.toonlab/reports/style-asset-gaps.json` and
`TOONLAB_ASSET_GAPS.md`.

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

// The host supplies a continuous shore and closed bed sampler.
const water = new WaterSurface({
  width: 200,
  depth: 200,
  preset: 'lake',
  bedHeight,
});
scene.add(water);

// per frame, before renderer.render(scene, camera):
water.update(renderer, scene, camera, delta);
```

Sky and Cloud remain public qualification surfaces, but are intentionally not
part of this recommended starting snippet until their labs and controlled
visual gates are cleaned up.

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
- [Lab responsibilities](https://github.com/call-me-sensei/toonlab/blob/main/docs/lab-architecture.md) — the finalized artifact,
  production-method, editor/library, and preview-state boundaries.
- [Definitive lab inventory and npm roadmap](https://github.com/call-me-sensei/toonlab/blob/main/docs/lab-roadmap.md) — all 69
  canonical labs, dual statuses, npm owners, coverage matrix, and gates.
- [Universal lab preview environment](https://github.com/call-me-sensei/toonlab/blob/main/docs/lab-preview-environment.md) —
  shared 24-hour controls, four-state regression matrix, and required cool/blue
  daylight-shadow verification.
- [Rock shader](https://github.com/call-me-sensei/toonlab/blob/main/docs/rock-shader.md) — the separate generator/material
  architecture, 58-field public configuration, import policy, and bundle use.
- [Styles, style bundles, and asset routing](https://github.com/call-me-sensei/toonlab/blob/main/docs/styles-and-bundles.md) —
  rendering domains, required asset labels, fallback policy, bundle ownership,
  OSS application boundaries, and the shader/lab migration contract.
- [Open asset library and scene coverage](https://github.com/call-me-sensei/toonlab/blob/main/docs/open-asset-library.md) —
  measurable scene-kit coverage, curated stylized generator base sets,
  CC0/CC-BY provenance, gallery routing, and generation fallback policy.
- [Getting started](https://github.com/call-me-sensei/toonlab/blob/main/docs/getting-started.md) — clone, run, tour the labs,
  load your own models.
- [Current capability status](https://github.com/call-me-sensei/toonlab/blob/main/docs/capability-status.md) — recommended
  existing-scene, Gallery, MCP, and focused-authoring workflows versus
  experimental scene-construction claims.
- [Toon character shading](https://github.com/call-me-sensei/toonlab/blob/main/docs/toon-shading.md)
- [Manufactured environment materials](https://github.com/call-me-sensei/toonlab/blob/main/docs/urban-prop-surface-roles.md) —
  the layered classify-once contract for props, vehicles, buildings,
  interiors, and reusable material-aware shaders.
- [Environment shading](https://github.com/call-me-sensei/toonlab/blob/main/docs/environment.md)
- [Lighting prototype](https://github.com/call-me-sensei/toonlab/blob/main/docs/lighting.md) — repository-only in 0.4.10; host-owned for package consumers.
- [Weather system](https://github.com/call-me-sensei/toonlab/blob/main/docs/weather.md)
- [Generative style labs](https://github.com/call-me-sensei/toonlab/blob/main/docs/style-labs.md) — the current 0.4.10 shipped-versus-
  repository-only status for Post & Color, Camera, Motion, Lighting, Biome,
  Soundscape, and Game Feel. The remediation checklist preserves the historical
  0.4.7 audit.
- [Water](https://github.com/call-me-sensei/toonlab/blob/main/docs/water.md)
- [Sky system](https://github.com/call-me-sensei/toonlab/blob/main/docs/sky.md)
- [Cloud shader](https://github.com/call-me-sensei/toonlab/blob/main/docs/cloud-shader.md)
- [Vegetation](https://github.com/call-me-sensei/toonlab/blob/main/docs/vegetation-sky.md)
- [Post-processing](https://github.com/call-me-sensei/toonlab/blob/main/docs/post-processing.md)
- [Texture Lab and texgen](https://github.com/call-me-sensei/toonlab/blob/main/docs/texture-lab.md)
- [Characters and animation](https://github.com/call-me-sensei/toonlab/blob/main/docs/characters.md)
- [Debug panel](https://github.com/call-me-sensei/toonlab/blob/main/docs/debug-panel.md)
- [World scale and world presets](https://github.com/call-me-sensei/toonlab/blob/main/docs/world-scale.md) — the meters
  convention plus experimental world-scale presets, rock quality tiers, and
  vegetation scatter qualification helpers.
- [Settings reference](https://github.com/call-me-sensei/toonlab/blob/main/docs/settings-reference.md) — every tunable field,
  generated from the schemas (`node scripts/generate-settings-reference.mjs`).
- [Shader constants](https://github.com/call-me-sensei/toonlab/blob/main/docs/shader-constants.md) — the deliberately unexposed
  constants and where they live.

## Build with an AI coding agent

ToonLab is designed to be driven by a coding agent (Claude Code, Codex,
Cursor, …). The recommended setup has three parts: give the agent the ToonLab
skills, connect whichever ToonLab OSS local or ToonLab Pro remote MCP surface
the developer has, then start from a goal prompt and iterate. The npm package
ships runtime source and the small text-only `agents/` guidance bundle. It
ships no models, textures, labs, examples, review fixtures, or other binary or
visual assets.

### 1. Install the ToonLab skills in your game project

The skills teach the agent the runtime boundary, asset-discovery order,
frame-loop contract, and each focused subsystem API. Start with `game-dev` for
integration into an existing scene and `asset-sourcing` for Gallery/MCP work.
`outdoor-world`, `karst-cliff-construction`, and current Sky/Cloud guidance are
experimental research aids: use them to qualify a bounded experiment or record
a gap, not as a promise that an agent can build a polished world in one pass.

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
[Local MCP and workspace](https://github.com/call-me-sensei/toonlab/blob/main/docs/mcp.md).

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

Give the agent a bounded goal over supplied scene content, name the skill, and
let it verify its own work:

```text
Using the ToonLab game-dev skill, integrate @call-me-sensei/toonlab into this
existing Three.js scene. Inventory and label the character, manufactured,
ground, rock, tree, grass, flower, water, and post targets. Confirm my asset
sourcing policy and use whichever ToonLab OSS or Pro MCP surface is connected
to fill only named asset gaps. Apply the matching public runtimes, preserve
provenance, run the scene, and verify the supplied cameras. Do not redesign the
terrain, coastline, biome, lighting, camera, or gameplay unless I explicitly
request an experiment.
```

### 4. Prompts for common jobs

```text
Use the ToonLab MCP server to find CC0 props for a small fishing village —
lanterns, crates, a pier, a torii gate. Evaluate geometry, material separation,
texture frequency, silhouette, provenance, and license for the Call Me Sensei
anime treatment. Use the host game's placement/collision/LOD system and tell
me what came from where.
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
As an experiment, use ToonLab Weather plus the host game's lighting system to
prototype a day/night cycle with a thunderstorm at dusk. Keep lighting outside
the 0.4.10 style bundle, list every host adapter, and do not describe the result
as a supported full-world workflow.
```

```text
Search my ToonLab library for the "sunset-festival" style bundle and apply
it across toon shading, sky, water, and post so the whole game matches it.
```

```text
Design a sword-swing VFX treatment that matches the selected anime bundle.
VFX is unsupported by the 0.4.10 bundle, so use the host runtime, record the
custom VFX gap first, and include the provenance and feedback requested from
the ToonLab maintainers.
```

A more extensive prompt cookbook — including the Pro generation and
character-consistency workflows — is at
[toonlab.io/docs/prompts](https://toonlab.io/docs/prompts).

## License

Code is [MIT](LICENSE), copyright Hyperbond Studio PTE. LTD. Bundled assets are CC0 — see
[ATTRIBUTION.md](ATTRIBUTION.md) for credits and for the bring-your-own
conventions (Mixamo clips, your own models, licensed scan packs).
