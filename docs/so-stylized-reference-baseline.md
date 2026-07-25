# So Stylized reference baseline

This is the native Unreal reference configuration for the licensed So
Stylized source pack. It is the visual oracle for ToonLab's source viewer and
environment port; it is intentionally separate from Call Me Sensei styling.

Primary sources:

- [So Stylized Environment documentation](https://docs.google.com/document/d/147wCDvZg6-9jZNyqSxX-I_HQkE2tGINZIhyjc2QHirY/edit?tab=t.0#heading=h.7gn6swvplfd4)
- [Getting Started video](https://www.youtube.com/watch?v=oshOSfevP4Q)
- Licensed source project: `StylizedExploration/Content/SoStylized`

Project operational summary:

- [`so-stylized-author-setup-contract.md`](./so-stylized-author-setup-contract.md)

The operational summary maps the author's full setup guide to the parity
checkpoint ladder. It must be reviewed before changing the source environment
baseline; this file records the concrete retained-project values after that
setup has been applied.

## Project renderer

`StylizedExploration/Config/DefaultEngine.ini` pins the settings instead of
inheriting the defaults of whichever Unreal template happens to create the
project:

| Requirement | Effective value |
| --- | --- |
| Virtual texture support | `r.VirtualTextures=1` |
| Automatically virtual-texture imported textures | `r.VT.EnableAutoImport=0` |
| Legacy light luminance conversion | `r.LegacyLuminanceFactors=1` |
| Mesh distance fields | `r.GenerateMeshDistanceFields=1` |
| Custom depth/stencil | `r.CustomDepth=3` |
| Anti-aliasing | TAA, `r.AntiAliasingMethod=2` |
| Shadow maps | Regular shadow maps, `r.Shadow.Virtual.Enable=0` |
| Dynamic GI | None, `r.DynamicGlobalIlluminationMethod=0` |
| Reflections | Screen space, `r.ReflectionMethod=2` |
| Extended auto-exposure luminance range | Enabled |
| Near clip plane | 5 cm |

Hardware ray tracing and Substrate are disabled. They are not part of the
pack's documented demonstration renderer and can change legacy material and
lighting behavior in a newly generated Unreal project.

## Authored SnowPines scene

The untouched source map is
`/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines`. ToonLab also keeps a
project-owned UE 5.8 compatibility copy at
`/Game/ToonLab/Reference/SoStylized/SnowPines/Demonstration_SnowPines_UE52Reference`.
The compatibility pass duplicates only the map and material instances that
need UE-version-safe parameter corrections; it never edits the licensed source
assets in place. It retains:

- the pack's `BP_StylizedSky_Lite` sun, captured-scene skylight, height fog,
  and unbound post process;
- the authored snow landscape material and map-specific color map;
- both landscape RVTs, `RVT_Landscape` and `RVT_LandscapeHeight`, plus their
  two RVT volumes;
- the authored static-mesh material slots, foliage placement, transforms,
  custom LODs, and sixteen CineCameras;
- Epic scalability for the high-quality visual reference.

Because editor scalability is normally a machine-wide user preference, the
native capture utility explicitly locks every scalability group to Epic and
resolution quality to 100%. A developer's local editor quality setting cannot
silently downgrade the comparison frame.

Do not apply a color map from another demonstration map. The pack
documentation explicitly identifies that as a cause of unexpected rock and
landscape colors.

## Post process and lighting

The scene actor supplies the reference values rather than a ToonLab preset:

- sun intensity 8;
- skylight intensity 1.2 with the authored pale-blue tint;
- exposure minimum and maximum both 1;
- bloom intensity 5 and threshold 0.5;
- saturation 1.1;
- Film Slope 1, Toe 0.3, Shoulder 1;
- motion blur and lens flare disabled;
- authored exponential fog. The pack also includes optional stylized-fog
  post-process materials, but the shipped SnowPines Lite sky actor does not
  assign one as a weighted blendable.

The native reference must be captured from Unreal's editor viewport. A raw
`SceneCapture2D` does not process the non-realtime captured-scene skylight in
the same way and produces falsely black cliff faces. The capture utility
pilots each authored CineCamera, warms the RVTs and temporal history, and then
uses Unreal's high-resolution viewport screenshot path. By default it preserves
the map's authored, non-realtime captured-scene skylight. `--recapture-skylight
1` is available only as a diagnostic A/B override; it is not the baseline.

The minimal environment parity map follows the same rule. It is duplicated
from the SnowPines demonstration and retains the authored Landscape, its
material/layer data, both RVT volumes, and `BP_StylizedSky_Lite`. It removes
unrelated scenery only after duplication and adds the controlled source rock,
pine, grass, daisies, and cameras on the original terrain. Replacing that
Landscape with a static plane is invalid: Landscape-layer expressions lose
their painted weights and the material falls back to a dark ground result.

Run:

```sh
npm run capture:environment-demo -- --camera 1 --width 1920 --height 1080
npm run capture:environment-demo -- --all --recapture-skylight 0
npm run verify:environment-demo
```

The verifier audits the effective renderer CVars after an Unreal restart,
scene lighting/post-process state, RVTs, material inventory, authored cameras,
and the native reference artifact.

## Source-first ToonLab port

The browser source showcase is not a screenshot or an Unreal stream. It loads
the exported SnowPines scene live in ToonLab's WebGPU renderer, preserving the
source meshes, transforms, sixteen authored cameras, material assignments,
lighting values, fog, depth of field, bloom, and source texture/curve data. Its
comparison layer places the matching 1920x1080 Unreal capture over that live
render so the wipe is an apples-to-apples camera comparison.

The source mode is the permanent fidelity oracle. Call Me Sensei materials,
procedural asset variation, and other ToonLab-owned customization are a later
layer and must not replace or silently modify this baseline. This order lets us
measure every custom shader or generated asset against the supplied pack before
promoting it for other developers.

### Coordinate and output-transform contract

The exporter records `DirectionalLightComponent.GetForwardVector()` directly.
For the SnowPines reference the UE vector is
`[0.4924038765, -0.4131759112, -0.7660444431]`; the UE X/Y/Z to glTF X/Z/-Y
conversion produces Three's
`[0.4924038765, -0.7660444431, 0.4131759112]`. The browser must not infer or
eyeball this direction from a screenshot.

Three's cascaded-shadow implementation derives its placeholder-light direction
from the light and target's *local* positions. The imported light and corrected
target therefore have to share the exported scene root. Parenting them to
different nodes can leave direct surface lighting correct while aiming all four
shadow cameras incorrectly; matching numeric world coordinates alone does not
prevent that failure.

The exposure multiplier is likewise derived rather than tuned. This project
enables UE's extended luminance range, whose default lens attenuation `0.78`
makes `LuminanceMax = 0.78 / 0.78 = 1`. The SnowPines post-process volume locks
both auto-exposure limits to EV100 `1`, so UE 5.8's fixed-exposure calculation
is `0.18 / (0.18 * 1 * 2^1) * 2^1 = 1`. The `+1` exposure compensation is
already part of that equation; applying a browser exposure of `2` would count
it twice.

The source showcase also registers a dedicated UE source tone mapper. It copies
the UE 5.8 AP1/AP0 glow, red modifier, film Slope/Toe/Shoulder curve, global
saturation, and blue-correction sequence from `TonemapCommon.ush` and
`PostProcessCombineLUTs.usf`. The authored post-process settings are compiled
into that renderer function for both the scene and output passes. Stock Three
ACES plus an RGB grade is a diagnostic fallback, not the source baseline.

Known platform boundary: Unreal landscape RVT/weightmap evaluation and its TAA
history are engine-specific. The base GLB contains positions, normals, and UV0,
but not SnowPines' ten painted landscape layer weights. Exact terrain parity
therefore requires the exporter to provide linear 505x505 weightmaps for Grass,
Dirt, Sand, Rock, SnowGrass, Snow, SnowGrassBlue, DesertSand, DesertGrass, and
DesertDirt (or an equivalent lossless packed representation). ToonLab does not
invent those weights from height or slope. The native capture remains
authoritative wherever an Unreal-only intermediate texture has not yet been
exported directly.
