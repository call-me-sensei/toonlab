# What ToonLab is ready for today

ToonLab is strongest as a focused anime rendering and content-integration
toolkit for a scene whose layout and major geometry already exist. It can make
that scene substantially more coherent and attractive with Toon, Environment,
Ground, Rock, Tree, Grass, Flower, Water, and Post treatments. It can also help
a developer find, validate, download, and reuse assets.

ToonLab does **not** currently make a coding agent reliable at constructing a
complete polished world from one prompt. Terrain composition, cliff formation,
coastlines, beaches, underwater habitat, biome layout, lighting, camera,
gameplay, and final art direction remain difficult scene-design tasks. A public
runtime export or a repository lab is not evidence that an agent can combine
those tasks into a production-quality result.

This is a product-maturity boundary, not a statement about semantic-versioning:
some experimental systems already have public APIs so they can be tested. The
API may work while the end-to-end authored outcome is not yet a recommended
workflow.

## Recommended uses

### 1. Style an existing scene

Use ToonLab on already identified objects and surfaces:

- toon/cel shading for characters, clothing, equipment, and suitable hero
  props;
- Environment treatment for manufactured scene assets and ordinary glTF
  materials;
- Ground and Rock shaders for existing terrain and rock geometry;
- Tree, Grass, and Flower shaders plus the qualified legacy/BranchTree and
  first-party procedural grass surfaces;
- Water on a host-authored footprint with a continuous shore and closed seabed;
- restrained Post treatment after materials, lighting, and composition work.

The host still owns target classification, transforms, lighting, shadows,
cameras, controls, collision, render-loop order, and final visual approval.

### 2. Find and reuse assets

Use the ToonLab Gallery, the local official catalog, a project library, or
policy-permitted open sources. Select with metadata before downloading:
dimensions, family/profile, taxonomy, license, provenance, review status, and
stable immutable file URLs. Preview finalists in the real scene because tags
and thumbnails cannot prove scale, silhouette, material separation, or anime
fit.

### 3. Use ToonLab through MCP

Both supported MCP surfaces are useful:

- ToonLab OSS local MCP searches the project/workspace/library, the released
  official catalog, and supported open sources; it also reads and saves
  portable presets and files.
- ToonLab Pro remote MCP searches the project/cloud library, the ToonLab public
  Gallery, and its supported external indexes, and may provide managed
  generation when policy permits it.

Feature-detect the connected surface. Do not prescribe Pro tools to an OSS-only
user or OSS-only tools to a Pro user. Use MCP for discovery, metadata,
provenance, files, and shared state; use package APIs for runtime shading and
focused deterministic construction.

### 4. Author and reuse focused assets and settings

The current practical authoring workflow also includes:

- portable shader, system, and style-bundle documents;
- the schema-driven tuning/debug panel;
- focused procedural grass, tree, flower, rock, debris, and texture outputs
  after their individual lab/quality gate has passed;
- model loading, character rig adapters, animation helpers, and the public-R2
  mannequin qualification fixture;
- deterministic regression tests and clean-package verification.

Use each feature independently against a known input. Do not treat the list as
an automatic scene-composition system.

## Experimental uses

The following are research, qualification, or host-owned work for now:

- generating or assembling a complete game scene from one prompt;
- procedural terrain as final art direction rather than a test foundation;
- natural cliff, gorge, sea-stack, cave, beach, coastline, village, path, or
  biome construction;
- automatic rock selection, transformation, burial, overlap, and formation
  planning across a whole level;
- automatic ecological placement and transition design;
- automatic underwater habitat and coastline continuation;
- full-world Lighting, Weather, Climate, camera, VFX, game-feel, navigation,
  physics, and streaming composition;
- Sky and Cloud authoring/composition until their labs and qualification scenes
  are cleaned up and re-approved;
- any workflow whose success claim is based only on a build, scene-graph count,
  or one screenshot.

The `outdoor-world`, `karst-cliff-construction`, and visual research guidance
remain valuable for experiments and for documenting missing capabilities. They
must not be presented as evidence that ToonLab can reliably build a polished
outdoor world today.

## Recommended agent brief

Give an agent a bounded integration task over a supplied scene, for example:

> Use ToonLab 0.4.10 to stylize this existing Three.js scene. Inventory and
> label the character, manufactured, ground, rock, tree, grass, flower, water,
> and post targets. Reuse project assets first, then use whichever ToonLab OSS
> or Pro MCP surface is connected to fill named asset gaps. Apply only the
> matching public runtimes, preserve provenance, run the app, and verify the
> result from the supplied cameras. Do not redesign the terrain, coastline,
> biome, lighting, camera, or gameplay unless I request an experiment.

Prefer multiple small tasks—one material family, asset role, vegetation field,
or water body at a time—over a single instruction to build an entire world.

## Re-evaluation

This boundary should be reviewed after the labs are cleaned up and each system
has a controlled package-only qualification scene. Move a capability out of
experimentation only when its public workflow, skill, clean-package test,
multi-view visual evidence, performance budget, and failure reporting all pass.
