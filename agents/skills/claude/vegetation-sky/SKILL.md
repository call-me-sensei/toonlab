---
name: vegetation-sky
description: Help developers use recommended ToonLab grass, flowers, legacy trees, BranchTree, Tree/Grass/Flower shader profiles, and coordinated palettes, while clearly treating current Sky/Cloud authoring and composition as experimental qualification work.
---

# Vegetation and experimental Sky/Cloud

Use the vegetation sections for focused work on an existing scene with
host-supplied placements and terrain. Sky/Cloud sections are qualification and
research guidance until their labs and controlled visual gates are cleaned up;
they must not be presented as a production-ready whole-scene workflow.

Public imports:
- `@call-me-sensei/toonlab/vegetation`
- `@call-me-sensei/toonlab/vegetation-shaders`
- `@call-me-sensei/toonlab/grass-palettes`
- `@call-me-sensei/toonlab/sky`
- `@call-me-sensei/toonlab/cloud`
- `@call-me-sensei/toonlab/grass`

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/runtime-entry-points.md`

Developer guidance:
- Add vegetation and sky objects to app-owned scenes, terrain, and render loops.
- Produce `placements` with the scatter helpers rather than by hand. Across the
  ground heightfield use `scatterInRect`, `scatterGrassAround` or
  `scatterForest`. For a surface that is **not single-valued in y** — a cliff
  cap, a ledge, a shelf, a rock platform, anything with terrain both above and
  below it — those cannot express the placement at all; use
  `scatterOnSurface({ surfaces, density | count, minSpacing, mask, weightAt,
  normalBlend })`. Surfaces are discs in world space,
  `{ center, radius, normal?, seed? }`, which is the shape a rock or cliff
  module already publishes for its caps. Spacing is measured in 3D so stacked
  caps do not starve each other, each surface has its own deterministic stream
  so adding one does not reshuffle the rest, and the returned placements carry
  `normal`, `forward` and `yaw` so an aligned field does not have to derive
  orientation itself. The `(x, z)` mask factories and `combineMasks` compose
  with it unchanged.
- Pair it with `createCapEdgeWeight({ rimBias: 0.05, falloff, break })`. A cap that
  stays dense all the way to its rim reads as a flat green disc stuck onto the
  rock; real soil caps thin toward a broken, slightly overhanging edge. Keep
  `rimBias` near zero for soil: high values push coverage into an outer annulus
  and work against the edge falloff. Use `falloff` and `break` for the ragged
  transition.
- Use async `createCallMeSenseiGrassField({ placements, variant })` for
  ToonLab's first-party procedural grass. `primary` is the accepted default;
  `secondary` is the denser alternate. Both generate deterministic LOD0/1/2
  geometry and the material directly from package code. They have no GLB,
  image, or package-owned URL dependency. The returned default is a
  `StylizedGrassClumpField`; use `RetainedGrassClumpField` only when the caller
  deliberately supplies custom geometry or material.
- Keep the factory's default `call_me_sensei_clump` preset unless the developer
  explicitly requests another style. It is the accepted meadow preset: 40
  upright overlapping blades per primary clump, full ground-field adoption,
  texture-free watercolor lift, translucent stroke layering, and three LODs
  without an implicit terminal hard cull. Do not replace it with a generic
  single-blade field, a repository asset, or example-local material settings.
  Reject dark or dirty roots, isolated patches, tangled silhouettes,
  bare-ground pinholes at normal density, and straight coverage boundaries.
  Compare both composition and grass-close views against the frozen controlled
  source mode.
- Preserve ground hue in the Call Me Sensei default. Its neutral
  `groundAdoptTint` may lift exposure uniformly, but `tipHueShift` and
  `tipDesaturation` remain zero: green ground produces only shades of green.
  Hue shifts remain public profile parameters for explicitly authored styles.
  LOD0/1/2 reduce 40/30/22 primary blades and widen retained strokes to keep
  integrated coverage within 2% of LOD0. Reject any camera-distance change
  that makes the terrain appear to change color.
- Ground-field sampling is a compile option; the source is the shared
  environment ground-field pass. Create the pass after all writer meshes
  exist, call its `update()` every frame before grass, require
  `writerCount > 0` and `ready`, and call `invalidate()` after repainting
  writer splats, vertex colors, or textures without a transform change.
- In 0.4.10, use `LEGACY_TREE_PRESETS` and `createLegacyTree()` for the 12
  supported pre-species silhouettes. Use `BranchTree` when the developer wants
  recursive branching, five broadleaf silhouettes, leaf color/texture plus a
  portable lit/shadow/crown palette, independent leaf `coverageScale`, bark
  color/texture, authored trunk bend/twist/taper, roots, portable documents,
  and the shared Tree Shader. `branches.children` counts lateral children;
  the generator also continues the leader so the trunk does not end in a stump.
  `BranchTree` is the focused portable wrapper around `StylizedTree` with
  `skeleton.generator: 'branching'`; choose the normal blob-crown tree when a
  solid anime foliage mass matters more than a visible recursive skeleton.
  Its current crown is tip-driven: `canopyWidth`, `canopyDepth`, and
  `leafPlacement` are fixed by the wrapper, while `coverageScale` remains the
  supported density control. Use `StylizedTree` directly when the crown
  geometry itself must be authored; do not pass ignored BranchTree options.
  Do not select, invent, or claim support for a botanical species. The large
  taxonomy/species roster visible in repository labs is experimental and is
  not a package API.
- Author and route the independent `TREE_SHADER_PROFILE`,
  `GRASS_SHADER_PROFILE`, and `FLOWER_SHADER_PROFILE` through the bundle's
  `treeShader`, `grassShader`, and `flowerShader` slots. They share a renderer
  family and semantic material contract, but serialize and apply independently.
  Keep asset albedo and legacy/BranchTree geometry/material inputs separate from all
  three shader treatments.
- Grass palettes update base, tip, and shadow tint together; they do not change
  shadow strength, wind, or current weather.
- Use the public versioned Grass, vegetation-shader, legacy/BranchTree/flower recipe, and Sky
  preset document APIs for portable data; do not copy lab-local validators.
- Treat Sky as one integrated World System, not a separate Shader Lab. Its
  shader, sun, clouds, stars, and procedural motion form one system preset with
  exactly 46 portable art fields; dome radius and quality are not in it.
- A Cloud source preset configures how painted strokes are generated; it does
  not invent a silhouette. For a generated cloud, pass non-empty strokes—start
  with `createDefaultCloudStrokes(preset)`—then build the composition and
  `createCloudField({ sources, composition, shader })`. An empty editable
  source document is valid before painting, but generation intentionally fails
  with guidance instead of silently producing an invisible cloud.
- `sky.settings` is the authored baseline and `sky.renderedSettings` is the
  current named-layer composition. Give Lighting, Weather, and other scene
  owners unique `setSceneOverrideLayer` ids and clear only their own id.
- For world integration, let the host game own the sun/light adapter. Lighting
  is not a stable 0.4.10 package or bundle domain; coordinate project-local
  lighting through explicit Sky, Weather, Water, and vegetation adapters.
- The composed-world sun adapter is `setSun({ direction, color, sky })`; it
  keeps the real light/shadows and Grass, Flower, Forest, Ambient FX, Sky, and
  Water scene inputs aligned without changing their portable presets.
- Sky quality is compile-time: low/medium/high compile 2/3/4 cloud octaves,
  custom `{ cloudOctaves: 1..5 }` is supported, and `sky.setQuality()` rebuilds
  the material while preserving authored settings and active layers.
- Keep current wind, wetness, snow, interaction targets, weather, lighting,
  camera, and export destinations owned by the host app.
- **Inspect the package preset first; when a ToonLab repository checkout is
  available, compare the domain lab before authoring overrides.**
  `labs/vegetation-shader-lab`, `grass-lab`, `tree-lab`, `sky-lab` and
  `sky-cloud-lab` are repository-only reference implementations of the Call Me Sensei look:
  they carry the authored settings that actually reach the target, including
  the shared-lighting block (shadow tint and strength, sun tint, sky fill, rim
  strength and power) that is otherwise easy to miss entirely. Do not import
  from lab code or depend on it at runtime — call the same public API with the
  values you read there. They are absent from the npm tarball, so a consumer
  without the repository must use the public preset registry/settings source.
  Water and Sky keep their shader controls inside the complete system preset
  rather than requiring separate shader documents.
- **Always name the preset.** `createVegetationShaderScopeSettings(scope, {...})`
  with no `preset` silently resolves an anonymous `default` — not the studio
  look — and does not warn. Pass `preset: 'call_me_sensei'` explicitly on the
  first call. See the `style-presets` skill; this single omission has taken a
  whole vegetation look onto the wrong base for several revisions.
- Grass presets differ in **shape**, not only colour: `call_me_sensei_clump` is
  the wide dense meadow clump, while `anime_clump` is the shorter narrow six-
  blade tuft with a far smaller clump radius. Choose deliberately when coverage
  and silhouette matter. `createCallMeSenseiGrassField()` defaults to the
  meadow and honors an explicit alternate `preset`; verify the resolved id in
  `field.userData.callMeSenseiGrass.preset`.
- Do not rely on repository sample meshes, textures, or generated manifests.
  A clean npm tarball contains no grass media files; test the generated
  topology, blade attributes, LOD counts, and material in a clean consumer.

Verify:
- Run the consumer app's normal build and inspect near/far vegetation plus sky
  under the target camera.
- For exported trees, reload the generated asset in the consumer app or asset
  pipeline.
