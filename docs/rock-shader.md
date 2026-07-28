# Rock shader

The rock shader is a reusable material system for rocks, boulders, cliffs, and
mountain surfaces. It is intentionally separate from procedural rock asset
generation.

The default profile is `call_me_sensei`. Its starting values are the connected
inputs of the accepted P18 spire material—not a generic approximation. Rock
Shader Lab evaluates that live material on the original, non-baked Spire 05
LOD0 geometry in the copied P18 outdoor scene.

## Architecture decision

Two public domains own two different artifacts:

| Domain | Import | Owns |
| --- | --- | --- |
| Rock asset generation | `@call-me-sensei/toonlab/rockgen` | Shape, pieces, seed, cuts, strata, erosion, sculpt edits, surface zones, topology, LOD, collision, and baked asset channels |
| Rock material treatment | `@call-me-sensei/toonlab/rock-shader` | Projection, color response, distance tint, normals, striping, moss, top layers, and use of imported asset channels |

The dependency direction is one way:

```text
generated or imported rock
  -> geometry + stable asset channels
  -> applyRockShader(...)
  -> current lighting, weather, and post-processing
```

`rockgen` does not import or require the rock shader. The Rock Shader Lab does
not author procedural geometry. It uses fixed preview fixtures to test one
material profile across different rock silhouettes and source-data quality.

The Rock Lab may preview the project-default shader, but its exported rock
project must remain usable without that shader. The shader profile is selected
independently, usually through a style bundle.

## Why rock has a separate shader editor

A separate shader editor is appropriate when a material treatment:

- Is reused across many assets.
- Has a stable semantic input contract.
- Needs independent art-direction tuning.
- Produces a versioned portable profile.
- Can be applied after asset creation or import.

Rock meets those conditions. This does not mean every asset category should
receive a shader lab. A debris collection can contain stone, painted metal,
wood, glass, paper, and vegetation. Those materials should normally route to
their existing shader owners. Create a new shader domain only when the
category has a distinct reusable material contract, not simply because it has
its own asset generator.

## Call Me Sensei reference baseline

The default is an editable reference checkpoint. It is not a screenshot, a
baked material, or a special-case material hidden inside the lab. The public
settings schema contains every connected scalar, Boolean, color, and option
used by the live rock graph. Rock Shader Lab renders that same schema and
starts with these values:

| Group | Accepted starting values |
| --- | --- |
| Base Projection | Scale `64`; saturation `0.5`; contrast `0.4`; brightness `0.06`; projection contrast `2`; side-only off |
| Material Response | Tint `[1, 1, 1]`; metallic `0.1`; smoothness `0.1`; smoothness texture off; smoothness contrast `1`; emission `0.02` |
| Distance Tint | Start `500`; end `15000`; color `[0.7882354, 0.7882354, 0.7882354]`; strength `0.5` |
| Normal Detail | Fade distance `30000`; near flatten `0`; far flatten `1`; smoothed normal on; normal-Y sign `1` |
| Striping | Off; dormant scale `2500`; contrast `0.25`; color `[1, 0, 1]` |
| Moss Response | Off; dormant size `25`; sharpness `1.92`; offset `-0.15`; gain `1.94`; color power `1.3`; low `[0.3019608, 0.48235294, 0.11764706]`; high `[0.47058824, 0.6509804, 0.2627451]` |
| Top-Layer Mask | Asset-mask behavior on; sharpness `1.77`; offset `0.48`; the accepted source has no mask texture, so the graph uses white |
| Grass Layer | Off; dormant scale `10`; tint `[0.89100975, 1, 0.8066038]`; saturation `1`; emission `0` |
| Snow Layer | Off; dormant scale `11.51`; tint `[1, 1, 1]`; saturation `1`; emission `0.03` |
| Sand Layer | Off; dormant scale `5`; tint `[0.9150943, 0.9150943, 0.9150943]`; saturation `1`; emission `0.1`; normal scale `20`; strength `0.5`; rotation `30°` |
| Asset Integration | Source albedo Replace; source blend `0`; vertex color `0`; vertex AO `0` |

The three active authored texture inputs are the projected rock color,
projected crack normal, and UV smoothed normal. The lab also preloads authored
moss, grass, snow, sand, and sand-normal inputs so enabling those dormant
layers remains an editable live-graph operation. Where the accepted material
has no authored texture slot, the UI may use an explicitly identified
fallback only after the developer enables that optional feature.

Changing any field makes a derived profile; Reset returns to this exact
baseline. A coding agent must not replace the baseline with visually similar
numbers, generic procedural textures, retained imported albedo, or automatic
vertex-color/AO influence.

### Reference scene contract

The initial validation scene is the accepted P18 composition: retained ground,
grass, pine, flowers, manufactured props, sky, clouds, camera, lighting, and
Spire 05 placement. The subject is the original LOD0 spire geometry with the
live shader. It is never the baked spire.

Preview settings may independently override ground, grass, tree, flowers,
manufactured props, sky, clouds, and lighting, with `call_me_sensei` as the
default bundle. Those assignments, the selected spire, time, camera, and
future validation-scene selection are preview state and never enter a rock
shader document. A rock-in-water review remains a separate future validation
scene; it must not silently alter the initial P18 checkpoint.

The preview bar exposes this through one **Preview styles** button. Its modal
first selects a complete bundle, then lists every registered context
domain—including Objects—for optional individual overrides. “From bundle”
removes an override and follows the selected bundle again. The modal remains
registry-driven so a future context such as water can be added without
inventing another control surface.

The copied P18 scene currently requires WebGPU because its retained landscape
graph exceeds the WebGL per-shader texture budget and uses a samplerless
WebGPU path. Rock Shader Lab therefore disables its WebGL toggle instead of
showing a black or materially different “equivalent” scene. Portable
rock-shader WebGL support is a separate npm-library release gate and must be
tested with a renderer-appropriate fixture; passing WebGPU lab review does not
mark that library status Ready.

## Stable asset input contract

The runtime accepts any `THREE.Mesh` under the supplied root. For the best
result, rock geometry should provide:

| Input | Required | Meaning |
| --- | --- | --- |
| `position` | Yes | Surface geometry |
| `normal` | Yes | Geometric normal used by lighting and slope masks |
| `color` | Optional | Asset-authored large-form color and geological zoning |
| `envVertexAo` | Optional | Asset-authored ambient visibility; `1` is fully open |
| Base-color map | Optional | Imported albedo considered according to Source Albedo mode |
| Normal map | Optional | Imported fine normal detail |
| Top mask | Optional | Authored mask limiting grass, snow, or sand layers |

When a profile gives `color` or `envVertexAo` nonzero influence and the
attribute is absent, `applyRockShader()` installs a neutral attribute so the
material contract remains stable. The accepted Call Me Sensei baseline gives
both zero influence because the source spire graph does not consume them.
Neutral fallbacks make another profile renderable; they do not recreate
missing geological zones or crevice information.

Procedural rock generation should bake large-form identity into geometry,
vertex color, and AO. It should not bake the style profile's distant tint,
moss color, striping, or lighting response into the asset.

## Imported textures and consistency

Photoreal texture packs often differ in capture lighting, frequency content,
color grading, and scale. Applying the same light function does not remove
those differences. The rock shader therefore exposes an explicit Source
Albedo policy:

| Mode | Behavior | Use |
| --- | --- | --- |
| Replace | Uses the style profile's neutral projected rock texture and keeps asset color/AO as controlled inputs | Default for strongest cross-library consistency |
| Blend | Mixes a bounded amount of imported albedo into the style projection | Clean textures with useful geological information |
| Retain | Uses the imported albedo at full influence | Validation, faithful imports, or assets already authored for the project |

`call_me_sensei` defaults to **Replace** with zero imported-albedo influence.
`neutral` defaults to **Retain**.
This makes flattening/simplification a deliberate, reversible setting rather
than an invisible import heuristic.

Replace cannot manufacture semantic detail that the asset lacks. A scanned
rock with baked shadows, extreme noise, weak geometry, or missing material
boundaries may still need cleanup, rebaking, a better normal map, or a
different source asset. Report that limitation in an import audit rather than
hiding it behind a universal-success claim.

## Public settings schema

The Rock Shader Lab renders its inspector directly from
`ROCK_SHADER_SETTING_GROUPS` and `ROCK_SHADER_FIELD_SCHEMA`. Defaults, labels,
descriptions, ranges, options, and serialization behavior live in the public
module; the lab does not keep a private configuration list.

| Group | Portable responsibility |
| --- | --- |
| Base Projection | Triplanar scale, saturation, color contrast, brightness, axis blend, and side-only projection |
| Material Response | Stone tint, metallic, smoothness, smoothness texture behavior, and emission |
| Distance Tint | Start/end distance, far color, and blend strength |
| Normal Detail | Fade distance, near/far flattening, smoothed-normal use, and normal-Y convention |
| Striping | Optional side-projected geological/mineral stripe treatment |
| Moss Response | Enablement, scale, slope threshold, mask gain, color curve, and low/high colors |
| Top-Layer Mask | Asset-mask participation plus slope sharpness and offset |
| Grass Layer | Optional projected grass texture, tint, saturation, and emission |
| Snow Layer | Optional projected snow texture, tint, saturation, and emission |
| Sand Layer | Optional projected sand color and normal behavior |
| Asset Integration | Source-albedo policy, bounded blend, vertex-color strength, and vertex-AO strength |

Every current field is portable and serializable. Current scene weather is not
part of this profile. If live snow accumulation, wetness, dust, or moss growth
is added, the scene owns the current amount while this profile owns how the
rock responds to that amount.

Rock generators must emit a `rock` root assignment, semantic modeled parts,
and explicit surface-zone encodings for any generated moss, lichen, snow,
wetness, sand, dirt, mineral, or grass-like coverage. Those potential zones
are asset data; this shader owns their appearance and the scene owns their
current condition amount.

Actual grass blades, flowers, or shrubs growing from a rock are not rock
surface zones. They are separately labeled Vegetation child roots and route to
Grass, Flower, or Tree Shader. See
[Generated asset labeling and shader routing](generated-asset-labeling.md).

## Runtime use

```js
import {
  applyRockShader,
  createRockShaderSettings,
  restoreRockShader,
} from '@call-me-sensei/toonlab/rock-shader';

const rockSettings = createRockShaderSettings({
  preset: 'call_me_sensei',
});

const report = applyRockShader(rockRoot, rockSettings);
console.log(report); // { preset, matched, applied, skipped }

// Restore the exact material objects that were present before assignment.
restoreRockShader(rockRoot);
```

`applyRockShader()` traverses only the supplied root. Set
`mesh.userData.rockShaderExclude = true` for an explicit exception, or pass an
`include(mesh)` predicate. The runtime marks assigned materials with
`environmentShaderExclude` so a later generic environment traversal does not
silently replace the domain-specific rock material.

## Supplying authored texture maps

The OSS runtime includes a deterministic neutral fallback texture set so the
public graph remains runnable without private or licensed files. The accepted
lab appearance, however, depends on the reference texture inputs described
above. The npm library cannot be marked visually Ready until equivalent
owned, CC0, CC-BY-compatible, or otherwise distributable resources are
packaged and their provenance is recorded. A host can replace individual maps:

```js
applyRockShader(rockRoot, settings, {
  textures: {
    rock: rockColorTexture,
    rockNormal: rockNormalTexture,
    stylizedNormal: smoothedNormalTexture,
    smoothness: smoothnessTexture,
    stripe: stripeTexture,
    moss: mossTexture,
    grass: grassTexture,
    snow: snowTexture,
    sand: sandTexture,
    sandNormal: sandNormalTexture,
    topMask: topMaskTexture,
  },
});
```

Texture maps are style resources, not procedural-rock parameters. Keep their
license and provenance with the style resource pack. Do not embed licensed
source files into portable JSON; store stable resource identifiers and resolve
them in the host.

## Portable preset documents

Rock shader presets use:

- Schema: `toonlab/rock-shader-preset`
- Version: `1`
- Default preset: `call_me_sensei`

```js
import {
  createRockShaderPresetDocument,
  parseRockShaderPresetDocument,
  serializeRockShaderPreset,
} from '@call-me-sensei/toonlab/rock-shader';

const document = createRockShaderPresetDocument('studio-rock', {
  label: 'Studio Rock',
  description: 'Project-wide rock material treatment.',
  settings: {
    distanceTint: { strength: 0.34 },
    moss: { enabled: true, multiply: 1.8 },
  },
});

const json = serializeRockShaderPreset(document);
const parsed = parseRockShaderPresetDocument(json);
if (!parsed.ok) throw new Error(parsed.errors.join(' '));
```

The JSON can be committed to source control, kept in a `.toonlab` workspace,
or saved in any host-owned storage. OSS creation, validation, serialization,
parsing, resolution, and runtime use do not require a database.

## Style bundle use

The `rock` style-bundle slot accepts an inline rock-shader document or a
built-in shader style:

```js
import { applyRockShader } from '@call-me-sensei/toonlab/rock-shader';
import {
  createStyleBundleDocument,
  resolveStyleBundleSettings,
} from '@call-me-sensei/toonlab/styles';

const bundle = createStyleBundleDocument('project-style', {
  slots: {
    rock: { style: 'call_me_sensei' },
  },
});

const settings = resolveStyleBundleSettings(bundle);
applyRockShader(labeledRockRoot, settings.rock);
```

The bundle slot resolves detailed shader settings. It does not select
`boulder`, `cliff`, `river-rock`, an erosion recipe, a seed, or an LOD policy.
Those remain asset identity.

## Routing rules

Use the rock shader when the primary material behavior is geological stone:

- Boulders and loose rocks.
- Cliffs and exposed mountain faces.
- Stone rubble when it should share geological projection and moss response.
- Imported rock scans that have been accepted into the rock domain.

Do not route by filename alone:

- A painted concrete barrier normally belongs to manufactured environment.
- A metal ore pickup presented as character equipment may belong to the
  character/equipment domain.
- Moss cards, grass tufts, and roots remain vegetation even when attached to a
  rock.
- Snow particles and dust puffs remain VFX.
- A mixed ruin may contain rock-domain stone plus manufactured wood, metal,
  glass, and decals as explicit material exceptions.

Asset labels select the destination. The style bundle selects the treatment.
Scene state selects current conditions.

## Authoring and review workflow

1. Generate or import a rock without shader-specific settings.
2. Verify normals, scale, topology, and collision.
3. Verify `color` and `envVertexAo`, or accept the neutral fallback
   deliberately.
4. Label the root for the rock domain and record material exceptions.
5. Apply `call_me_sensei`.
6. Start imported assets in Replace mode; compare Blend only when the source
   texture contains useful clean geological information.
7. Tune the shared profile in Rock Shader Lab, not Rock Lab.
8. Export the rock asset and rock shader profile independently.
9. Resolve the selected profile through the project style bundle.
10. Review generated and imported rocks together under the reference lighting,
    distance, weather, and post-processing matrix.

The release target is not that every arbitrary model becomes
production-consistent automatically. The target is deterministic results for
contract-ready assets, a useful visible first pass for clean imports, and
actionable failure for unsuitable sources.
