# ToonLab 0.4.10 Runtime Boundary

ToonLab 0.4.10 is recommended for stylizing and populating supplied anime-game
scene content. Prefer focused imports from these production-oriented areas:

- `toon`, `toon-settings`, `character`
- `environment`, `ground-shader`, `rock-shader`
- `vegetation`, `vegetation-shaders`, `grass`, `grass-palettes`
- `water`, `water-settings`
- `post`, `post-processing`
- `rockgen`, `debrisgen`, `texgen`, `assetlib`
- `styles`, `asset-policy`, `loaders`, `debug`

Public `sky`, `cloud`, `weather`, `climate`, `ambientfx`, `fauna`, and root
terrain/world helpers are qualification surfaces. Their APIs may be exercised,
but their complete scene outcome—especially current Sky/Cloud composition and
whole terrain/biome/coast/cliff construction—is experimental. A public export
does not mean an agent can combine it into production-quality final art.
**Public export status and product maturity are different.**

The selected style bundle coordinates visual settings; it does not construct or
classify a scene. Lighting,
VFX, camera behavior, game-feel behavior, and renderer configuration are
explicitly unsupported bundle domains in 0.4.10. The host game owns them.
When a project-local implementation changes the selected anime treatment,
treat it as a custom adapter and record it in the custom-gap report.

The `grass` entry owns two deterministic first-party Call Me Sensei clump
recipes, three generated LODs per variant, the procedural material, and the
async-compatible `createCallMeSenseiGrassField()` default factory. It ships no
mesh or texture files. `RetainedGrassClumpField` remains the generic container
for caller-supplied, properly licensed geometry and materials.

The default factory resolves the `call_me_sensei_clump` meadow preset: 40
upright overlapping primary blades, full ground-field adoption, watercolor
lift and translucent stroke layering, and a final LOD without an implicit hard
cull. Sparse generic blades and repository comparison media are not equivalent
fallbacks.

The `environment` entry accepts the same explicit style/scenario routing used
by the preset registry:

```js
await applyEnvironmentShader(root, {
  preset: 'call_me_sensei',
  scenario: 'exteriorDay',
});
```

This is equivalent to spreading
`resolveEnvironmentPreset('call_me_sensei', 'exteriorDay')` into the adapter.
Named preset values establish the baseline; explicit `settings`, `features`,
`parameters`, and `materialLook` overrides take precedence. Select the preset
before authoring overrides instead of retyping its numeric fields.

The `vegetation` entry's scatter helpers place across the ground heightfield —
`scatterInRect`, `scatterGrassAround`, `scatterForest` — taking `(x, z)` and
sampling `y` from a host `heightAt`. That contract cannot express a surface
which is not single-valued in `y`, such as a cliff cap or a ledge with terrain
both above and below it.

For those, use `scatterOnSurface({ surfaces, density | count, minSpacing,
mask, weightAt, normalBlend })`. Each surface is a disc in world space —
`{ center, radius, normal?, seed? }`, the shape a rock or cliff module already
publishes for its caps and ledges. Spacing is measured in 3D, so stacked caps
do not reject each other's points. Each surface draws from its own
deterministic stream, so adding or removing one does not reshuffle the others.
Returned placements carry `normal`, `forward` and `yaw` alongside `x/y/z`, so
an aligned field no longer has to derive orientation per placement. The
existing `(x, z)` mask factories and `combineMasks` compose unchanged.

Pair it with `createCapEdgeWeight({ rimBias: 0.05, falloff, break })` for a
radial weight that thins coverage toward a broken rim. `falloff` and `break`
create the thinning; `rimBias` deliberately pushes coverage outward, so keep
it near zero for a soil cap. A cap that stays dense to its edge reads as a flat
disc stuck onto the rock rather than as soil.

For an explicitly requested Cloud experiment, the `cloud` entry separates
painted source shape, placement composition, and shader treatment. A source
preset configures generation but does not create a silhouette, so initialize
generated sources with strokes:

```js
const preset = 'puffy_cumulus';
const source = createCloudSourceDocument('hero-cloud', {
  preset,
  strokes: createDefaultCloudStrokes(preset),
});
const composition = createCloudCompositionDocument('hero-clouds', {
  layers: [{ id: 'hero', count: 7, sourceRefs: [source.id] }],
});
const clouds = createCloudField({
  sources: [source],
  composition,
  shader: createCloudShaderPresetDocument('hero-cloud-look'),
});
```

An empty source remains a valid editor document before painting. Attempting to
generate or render it fails with guidance rather than silently creating an
invisible field. This callable contract does not imply that the current Cloud
workflow has passed the polished-scene gate.

Use the package README and exported functions/settings as the runtime source
of truth. Labs, internal comparison fixtures, local asset paths, and repository
documentation outside `agents/references/` are not installed public APIs.
