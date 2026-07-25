# So Stylized author setup contract

This document is ToonLab's operational summary of the licensed pack author's
setup guide. It exists so parity work does not depend on memory, screenshots,
or whichever defaults a newer Unreal project happens to inherit.

Primary authority:

- [So Stylized Environment Documentation](https://docs.google.com/document/d/147wCDvZg6-9jZNyqSxX-I_HQkE2tGINZIhyjc2QHirY/edit?tab=t.0#heading=h.7gn6swvplfd4)
- Document title: `So Stylized Environment Documentation`
- Google document id: `147wCDvZg6-9jZNyqSxX-I_HQkE2tGINZIhyjc2QHirY`
- Relevant anchor: `Landscape Setup`
- Last project review: 2026-07-23

The original document remains authoritative. This summary converts its setup,
feature, troubleshooting, and performance guidance into testable requirements
for the Unreal Visual Target and ToonLab's modular port.

## Two different setup intents

The author documents both of these workflows. They must not be conflated.

1. **A new unrelated level** starts with `MI_Landscape` (or an instance of
   `M_Landscape`) and matching Landscape Layer assets. The author recommends
   disabling the Demonstration's hand-painted color map until a map-specific
   color map has been authored and aligned.
2. **The retained Demonstration Visual Target** keeps the Demonstration map's
   exact Landscape, painted layer weights, map-specific color map, RVTs,
   lighting actors, fog, post process, foliage placement, and material
   instances. Disabling its color map or replacing the Landscape with a plane
   changes the authored result and invalidates parity.

ToonLab's parity checkpoints use the second workflow. Advice for creating a
new level is useful for future engine exports, but it may not override retained
Demonstration state.

## Project renderer requirements

| Author requirement | Parity rule |
| --- | --- |
| Virtual Texture Support is required | Enable virtual textures before loading the pack. Landscape color, height, asset blending, and foliage features depend on them. |
| Do not automatically turn ordinary imported textures into VTs | Keep automatic VT conversion off; an accidentally converted texture may look blurry. |
| Generate Mesh Distance Fields is required for the water feature set | Keep distance fields enabled for shoreline waves, foam, and waterfall/geometry distance effects. |
| Custom Depth/Stencil is required for stylized underwater rendering | Use the documented stencil configuration before testing underwater post process. |
| Near clip may be reduced from 10 cm to about 5 cm | If used, the underwater material's clip value must match the project near clip and Unreal must be restarted. |
| The demonstrations use TAA | Treat TAA as the source anti-aliasing baseline. Other methods are separate diagnostics. |
| Regular Shadow Maps avoid terrain artifacts seen with Virtual Shadow Maps | The Visual Target uses regular shadow maps. VSM is not a parity substitute. |
| The demonstrations do not use Lumen | Do not silently add Lumen GI or reflections to the source baseline. |
| Reflections are set to Screen Space | Preserve screen-space reflections where that feature participates in the retained scene. |
| Extended auto-exposure luminance fixes some over-bright scenes | Preserve the source project's extended luminance setting and authored exposure limits. |

The concrete UE 5.8 values audited from the retained project are recorded in
[`so-stylized-reference-baseline.md`](./so-stylized-reference-baseline.md).

## Global environment contract

`MPC_GlobalEnvironment` is cross-material state, not a local material option.
The guide uses it for global wind and for day-cycle progress consumed by
environment materials. A parity scene must use one shared environment state so
grass, trees, foliage, rocks, sky, and later water do not drift independently.

Checkpoint rule: an individual shader-family checkpoint may read this state,
but may not redefine the shared wind, time, or lighting contract.

## Landscape setup

The author's Landscape Setup sequence is:

1. Start a level and bring in the intended lighting setup. For the Visual
   Target, retain the Demonstration's lighting actors instead of rebuilding
   approximate substitutes.
2. Assign `MI_Landscape`, or an instance derived from `M_Landscape`, to the
   actual Landscape actor.
3. In Landscape Paint mode, bind every exposed material layer to its matching
   Landscape Layer asset (`LL_Grass`, `LL_Dirt`, and the other supplied
   layers). On Unreal 5.5+, create layers from the assigned material and fill
   the intended base layer if the list is initially absent.
4. Keep AutoGrass enabled when the authored level uses it.
5. On the Landscape parent, add both Draw in Virtual Textures entries:
   `RVT_Landscape` and `RVT_LandscapeHeight`.
6. Create both RVT volumes. Each volume must reference the matching RVT and
   use the actual Landscape as its Bounds Align Actor.
7. Refresh/rebound an RVT volume if editor-only foliage colors become stale.

The two RVTs have different responsibilities:

- `RVT_Landscape` supplies landscape color/information to grass and intersecting
  assets.
- `RVT_LandscapeHeight` supplies landscape height to systems such as water
  shoreline damping and spatial foliage behavior.

The P14 ground adapter therefore requires all of the following source inputs:

- retained Landscape geometry/height;
- all painted Landscape layer weights;
- the exact `MI_Landscape_Snow` graph and its texture/parameter values;
- the Demonstration's map-specific color map and mapping transform;
- Landscape world transform and component section origins;
- both RVT contracts and Landscape-aligned bounds.

Replacing any of those with slope guesses, a flat plane, or visually estimated
colors is not an acceptable P14 implementation.

The browser implementation also preserves Unreal's texture transfer exactly:
exported color textures marked sRGB are uploaded as WebGPU sRGB texture
formats. WebGPU converts those texels to working-linear values during
`textureLoad`; the samplerless Landscape bridge must not apply another sRGB
decode. Data textures such as weight masks and normals remain `NoColorSpace`.
The removed double decode was the cause of the previously near-black green
grass substrate and muddy dirt.

## Landscape material features

### AutoCliff

The source graph uses slope thresholds to introduce cliff material. Start and
Fade define the transition range; noise breaks up a perfectly smooth contour.
These are material inputs and must be ported from the source instance rather
than inferred from a rendered image.

### AutoGrass

AutoGrass is enabled by default and its density/culling comes from the supplied
Landscape Grass asset, not painted FoliageType settings. Grass at material
transitions can instead use the supplied binary-color route when that is the
authored choice.

P14 freezes grass geometry and shading. It may reproduce the ground data that
P15 will later consume, but it may not retune grass to hide a ground mismatch.

### Grass and rock color maps

The Demonstration changes biome color through a hand-painted, world-aligned
color map. Its scale and offset must match the Landscape. A color map from a
different map can produce obviously wrong grass and rock colors.

Operational rule:

- retain the Demonstration's color map for the Visual Target;
- disable it for a new map that has no matching authored map;
- update both RVT and NoRVT grass routes when a map-specific color map changes;
- update the applicable rock master/material family, not one isolated mesh
  instance, when a rock color map changes.

## Foliage, trees, and asset/ground integration

- Supplied FoliageTypes define paintable assets and their placement/culling
  behavior. Large cliffs and waterfalls remain deliberately hand placed.
- RVT-colored grass reads Landscape color; the NoRVT grass variant is intended
  for shelves or rocks where sampling the surface below would give the wrong
  color.
- Landscape VT blending softens seams where rocks, bark, and other assets meet
  the ground. It is an explicit material feature, not ambient occlusion.
- Spatial culling depends on correctly configured Landscape RVTs. Missing RVT
  state can make foliage partially disappear.
- Foliage interaction writes the player position into the shared player-info
  collection.
- Camera occlusion and camera-blocking are separate authored material/gameplay
  behaviors and must not be mistaken for ordinary alpha clipping.
- Tree far LODs use a different `SingleMat` material. Color or hue changes to
  the near leaf/bark materials must also be reflected in that far-LOD material.
- Tree sway fades before the LOD that disables wind. Rocks and other solid
  surfaces must never inherit foliage wind.
- Moss may be world aligned or vertex masked. The source asset's selected route
  and painted vertex data are part of its appearance.
- Shared material functions are intentional: changing a family function can
  affect terrain, cliffs, and assets together. Checkpoint edits must remain
  scoped even when the Unreal source graph is shared.

## Sky, lighting, time, clouds, and weather

The quickest documented sky path is a supplied preset placed at the world
origin after removing conflicting sun, sky, skylight, and post-process actors.
For the Visual Target, the retained Demonstration sky Blueprint is the source.

The author models time as a loop through:

- day (`0` / `1`);
- sunset (`0.25`);
- night (`0.5`);
- sunrise (`0.75`).

Time can change instantly or smoothly. An external clock should disable the
sky's autonomous cycle and drive its time explicitly. Environment materials
use `DayCycleProgress` through shared material functions so their colors and
emission follow the same phase.

Sky parity includes:

- visible sun/moon treatment and the actual directional-light color;
- sun/moon intensity, skylight color, and skylight intensity;
- post process established before downstream color tuning;
- authored bloom, fixed/adaptive exposure choice, color grade, and film curve;
- no motion blur in the source look;
- atmospheric distance fog plus optional sun/moon glow and volumetric fog;
- all source curves for day, sunset, night, sunrise, and moon states;
- cloud material, layers, transforms, panning/flow, curves, and sky blending;
- weather data changing the shared sky/environment state, not an isolated
  cosmetic overlay.

Packed cloud textures use distinct channels for base gradient, sun/moon
highlighting, flow/development, and coverage mask. Copying only visible RGB is
not equivalent to the source cloud graph.

## Water, ocean, river, and underwater

- Stylized water requires Mesh Distance Fields and the documented Custom
  Depth/Stencil setup.
- The water surface is flat because the underwater transition depends on a
  consistent water height.
- Water resolution, tile size, and tile count jointly control surface extent,
  displacement fidelity, and LOD opportunities.
- Underwater post process is optional and has an explicit depth volume. Its
  displaced-water stencil material must inherit the exact water displacement
  settings and use the documented masked/unlit/one-sided overrides.
- Landscape height RVT is required by shoreline wave and shallow-damping
  behavior unless those features are explicitly disabled.
- Ocean extensions and follow-player relocation are separate behaviors; screen
  space reflections can trail a teleported surface.
- River uses a spline-generated system and is intentionally less feature
  complete than the main water Blueprint.
- Cloud rendering below SingleLayerWater has an engine limitation; a masked
  cloud material is the documented compatibility tradeoff.

These requirements become authoritative only when the checkpoint ladder reaches
water, waterfalls, underwater, and remaining atmosphere. They do not belong in
P14–P20.

## Troubleshooting rules that affect parity

- White, black, grey, or checkerboard shaders: first verify required project
  settings and restart Unreal before changing a material.
- Scene too bright: verify extended auto-exposure luminance, then inspect the
  authored exposure, color grade, and film settings.
- Missing Landscape layers in Unreal 5.5+: create layers from assigned
  materials, then fill the intended base layer.
- Wrong foliage color or partial foliage: verify/refresh RVT volumes and their
  Landscape bounds before changing palettes or opacity.
- Wrong water height/shoreline behavior: verify `RVT_LandscapeHeight` before
  changing water math.
- Blurry sky/cloud textures can be texture-memory/LOD bias, not shader logic.
  Source-quality comparison keeps the supplied full-resolution asset where
  available; optimization is a later checkpoint.

## Performance and LOD intent

The author recommends starting with engine scalability rather than removing
features from the art baseline. Relevant authored intent:

- custom LODs are part of the pack;
- tree LOD1 disables wind, with sway fading before the transition;
- foliage and AutoGrass have separate cull-distance controls;
- VT blending, moss, wind, caustics, sparkle, and refraction are optional
  material costs, but disabling them changes the graph;
- source textures may be up to 4096²; LOD bias 1 and 2 reduce them to half and
  quarter dimensions respectively;
- sky features and translucent clouds can be simplified later, but Masked
  clouds change flow quality;
- complex-as-simple collision is intentional for many low-poly rocks and
  custom low-poly tree collision meshes.

Optimization follows parity. A performance variant must be a named modular
profile and may not silently replace the source-quality profile.

## Checkpoint ownership map

| Checkpoint | Author-guide dependencies | Sole mutable family |
| --- | --- | --- |
| P13 | Sky preset/Blueprint, cloud graph, sun/moon/skylight, fog, post, fixed camera | Sky/cloud baseline already sealed |
| P14 | Landscape geometry, painted weights, `MI_Landscape_Snow`, map color map, both RVTs | Ground |
| P15 | AutoGrass, RVT/NoRVT grass color paths, grass curves/wind/culling | Grass |
| P16 | Near tree materials, `SingleMat` far LOD, sway fade, moss/vertex data | Tree |
| P17 | FoliageTypes, flower/foliage materials, RVT color, interaction and spatial culling | Flowers and remaining foliage |
| P18 | Shared stylized solid-surface material functions and VT blending | Source `M_StylizedBasic` fixtures plus a separately identified imported-prop compatibility adapter |
| P19 | AutoCliff plus rock/cliff shared functions, color map, VT blend | Mountain/cliff |
| P20 | Shared day-cycle/weather inputs and snow material behavior | Snow/weather |
| Later | Water graph, distance fields, stencil, height RVT, ocean/river/underwater/fog | One declared family at a time |

### P18 authority boundary for non-nature props

The author guide does not define `M_StylizedBasic` as a universal material for
arbitrary third-party props. Its documented integration strategy is to reuse
the supplied material functions inside an object-appropriate parent material.
The source inventory proves `M_StylizedBasic` directly for simple stylized
environment solids such as the supplied beach shells and cactus assets.

P18 therefore has two explicitly different tracks:

| Object | Material authority |
| --- | --- |
| Supplied beach shells and cactus | Exact source `M_StylizedBasic` graph and source instance parameters |
| Imported bench, sword, lamp housing, and MegaScan crate | Compatibility test: preserve the GLB's authored PBR inputs while exercising the shared stylized-solid response |
| Lamp glass | Separate translucent/glass family; never force through opaque `M_StylizedBasic` |
| Lamp emission | Imported emissive map/factor now; optional `MF_DayCycleEmission` behavior belongs to the shared time-of-day integration |

The imported-prop track is not evidence that those assets were authored for
`M_StylizedBasic`. The production target is a modular ToonLab prop-surface
family with `M_StylizedBasic` available as a compatibility preset. That family
must preserve base color, metallic, roughness, normal, occlusion, emissive,
alpha/sidedness, and any supported glTF material extensions before optional
stylized modules are applied. At present the P18 adapter preserves base color,
metallic, roughness, normal, emissive, and sidedness; the lamp and MegaScan
crate prove that material occlusion is still an open input, and lamp glass
remains deliberately isolated.

Optional modules must remain independently switchable: hue variance, VT
contact blending, cool skylight response, day-cycle emission, and later
weather/snow. Disabling one module may not replace or discard the imported
material inputs.

## Acceptance rule

A checkpoint is not complete because it looks plausible. It is complete only
when:

1. the source actors, materials, functions, parameters, textures, curves,
   transforms, and engine settings required by that family are inventoried;
2. the engine-specific intermediate data required by the graph is exported
   losslessly or the missing boundary is explicitly reported;
3. fixed front/back and time-of-day captures use the same camera, light, and
   content contract;
4. the changed family matches the retained Visual Target without regressing a
   previously sealed family;
5. the implementation, evidence, and known renderer-boundary differences are
   recorded in the checkpoint ledger.
