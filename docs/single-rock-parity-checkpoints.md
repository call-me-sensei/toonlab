# Single-rock parity checkpoints

This ledger records the isolated changes used to match the retained Visual Target. A later checkpoint may not replace an earlier one unless it improves the stated target without regressing a previously sealed gate.

| Checkpoint | Isolated change | Result | Baseline decision |
| --- | --- | --- | --- |
| P06 | Analytic `1 / PI` radiometric boundary between Unity/URP and UE/ToonLab | ToonLab-to-Unreal unshadowed rock MAE `19.655`; Unity-to-Unreal `20.110`; geometry within one pixel; blue cast/self-shadow hue passes | Current best visual checkpoint |
| P07 | Replace the P06 surface-lighting boundary with UE 5.8 Default Lit | ToonLab-to-Unreal rock MAE regressed to `22.147` | Diagnostic only; P06 retained |
| P08 | Replace the Unity rock graph with the literal supplied UE `M_Rock` / cliff instance graph | Large normal-response mismatch appeared | Diagnostic only |
| P09 | Preserve P08 and swap in the UE-exported static-mesh normals, tangents, and UVs | Tangent/UV parity alone did not remove the normal-response mismatch | Diagnostic only |
| P10 | Flatten the complete final tangent normal 75% toward `(0, 0, 1)` | Rejected: this suppresses the authored stylized-normal atlas, exposes the mesh's smooth vertex normals, and makes the rock read round | Never use as a visual baseline |
| P11 | Replace the independently reconstructed UE comparison frame with the retained pack-author UE Visual Target capture | UE comparison and Visual Target are byte-identical for both author-light shadow modes; all three engines still pass the blue cast/self-shadow hue gate | Current comparison authority; remaining Unity/ToonLab differences are measured directly against the Visual Target |
| P12 | Load the exact 4096×4096 `T_RockClassicCliffs_N` atlas on the UE static-mesh UV0 path, restore the high-quality projected-crack basis, soften only the broad atlas response by 0.35 at the ToonLab renderer boundary, and keep the authored bare-sky dome inside an explicit 2,000,000 m finite far plane | The source recess detail returns only with unflipped V and OpenGL green after the glTF tangent-basis conversion; the high-quality projection removes horizontal tearing. Full atlas response makes specific planes substantially darker than UE, while final-normal flattening destroys the form. The original 100 m camera far plane clips the author-scale sky dome completely | Candidate: retain the slightly clearer crack definition intentionally; evaluate the atlas-only bridge against the retained UE dark-plane softness |
| P13 | Add the authored sky and cloud-shell inputs without changing the P12 rock | Native UE background-only and shell-only captures exposed two renderer-boundary defects: the glTF export was already in meters (the extra `0.01` scale was removed), and the standalone sky basis requires `+90°` in ToonLab / `-90°` after Unity's Z reflection. ToonLab and Unity now use the authored world-scale dome, 2,000,000 m far plane, source height-fog integral, and analytic 180-frame cloud coverage. Unity's already-linear fog color is gamma-encoded once at its ShaderLab Color boundary. | Sky/cloud candidate sealed. UE remains the graph/spatial authority; the accepted ToonLab saturated blue/cyan daytime gradient is the Call Me Sensei creative color authority. The washed-out stripped UE single-rock capture is diagnostic for color until its capture/exposure stack is re-audited; the P12 rock output gate remains open. |
| P14 | Replace only the compact-stage ground with the complete retained `MI_Landscape_Snow` graph, ten exported SnowPines paint weights, and an exact native Landscape height patch traced at 0.5 m spacing around CameraRender1 | Three adapter defects were found. First, canonical/Three `X,-Z` had been used directly as UE `X,Y`, rotating the dirt field 90 degrees; the retained basis requires UE landscape `X,Y = -Three Z, Three X`. Second, the samplerless WebGPU bridge manually decoded exported sRGB textures even though WebGPU's sRGB texture format already decodes `textureLoad`, crushing the grass colormap and dirt into near-black green/brown. Third, the samplerless bridge discarded the source world-group sampler's 8x anisotropy, making the baked `T_Dirt1_BC` pebble flecks and its normal/roughness detail unnaturally sharp and dirty at grazing view angles. The corrected graph uses the exact native height/normals, corrected world basis, source weights and map colormap, one—and only one—sRGB transfer, and an 8-tap derivative-major anisotropic reconstruction for all three dirt maps. The flecks are texture content, not separately scattered pebble meshes. | Ground checkpoint accepted. Camera, rock, tree, grass geometry/shading, flowers, sky, lighting, and post remain frozen; their visible differences belong to P15–P17. |
| P15 | Replace only grass with the authored `LG_Grass` → `SM_Grass1` AutoGrass placement and complete `MI_Grass`/`M_Foliage` RVT route | UE metadata fixes density at `175/100 m²`, grid placement, `0.99` jitter, uniform `0.75..1.25` scale, random yaw, surface alignment, `50..80 m` culling, and no dynamic grass shadow. A later P17 close inspection invalidated the former `5,778` count: that implementation sampled only raw `Grass` and omitted the source `LandscapeGrassOutput`. The corrected output sums `Grass + SnowGrass + SnowGrassBlue`, subtracts the authored noisy `AutoCliffMask`, applies `Auto Grass Threshold=.4`, and then performs deterministic density rejection. This prevents grass from leaking onto rock/cliff and low-weight dirt transitions. The source-graph audit also exposed two omitted RVT fields: `MI_Grass` requests RVT mip `4`, and `M_Foliage` blends `RVT.Specular` into the blade by `TEXCOORD_2.v`. A deterministic prefiltered ground-color target supplies mip `4`, while the shared surface target carries landscape roughness/specular/metalness. | Source-corrected placement contract. P14 ground, tree, flowers, sky, lighting, camera, rock, and post remain unchanged; no compensating grass tint or hand-deleted instances are permitted. |
| P16 | Replace only the `SM_Pine01` LOD0 bark/leaves slots with the retained UE `MI_PineBark` → `M_Bark` and `MI_PineLeaves` → `M_Leaves` graphs | A direct UE 5.8 export in `assets-local/sostylized/trees/p16-ue-pine-contract.json` seals the three authored LODs (`2,324`, `1,588`, `934` triangles), exact slot order, and every resolved scalar/vector/texture parameter. Bark uses opaque one-sided Default Lit with `T_PineBark_BC/N/R`, `TintMix=.15`, `NormalFlatness=0`, `RoughMult=1`, and `Specular=.04`. Leaves use masked two-sided Subsurface with `T_Leaf_Pine.r`, `1/3` clip, `TEXCOORD_2.v` gradient, `T_Leaf_Pine_SS`, source WPO, and a shadow mask that intentionally excludes camera/perpendicular trimming. The source graph applies `TwoSidedSign` to tangent `+Z`, and UE 5.8 `MaterialTemplate.ush` applies it again after tangent-to-world conversion; the signs cancel, preserving the authored geometric normal rather than turning every visible backface toward the light. Close-range inspection also found two renderer-boundary errors rather than authored tree detail: a one-tap 1024 shadow diagnostic was still active instead of the demo's 2048 quality-5 `Manual5x5PCF` path, and opaque surface visibility had been reused as the subsurface-transmission channel. P16 now uses the existing literal UE receiver filter and lets authored `SS Opacity=.3` separate thin-card transmission from the opaque mask. | Source-corrected candidate: tree-only contract, source graph routing, and the P16 leaf-shadow receiver path are verifier-locked. P14 ground, P15 grass, flowers, rock, sky, camera, and post remain frozen; no leaf tint or texture compensation was introduced. |
| P17 | Replace only flowers/remaining foliage with the shared comparison daisies and complete `MI_Daisy` → `M_Foliage` graph | The UE-derived contract in `assets-local/sostylized/foliage/p17-ue-daisy-contract.json` identifies `FoliageInstancedStaticMeshComponent_96`, all `1,364` source instances, and the `93` whose XY origins fall inside the retained 64 m P14 patch. Twenty-five were authored on omitted rocks/cliffs, leaving a reconstruction inventory of `68` Landscape-supported instances. The compact parity scene does not expand that full inventory: Unity, Unreal, ToonLab, and Visual Target all render the same one-clump `SM_Flower_Daisies1` LOD0 fixture from the immutable P13 capture contract. Its root height and normal are resolved from the active terrain, so later terrain edits cannot leave it floating. The fixture inherits the native comparison shadow flags (`castShadow=false`, `receiveShadow=true`), preventing 68 overlapping masked shadow populations from being compared against one native clump while rock/tree/terrain hard shadows remain unchanged. `MI_Daisy` remains texture-driven by `T_FoliageSheet_BC`, masked at `1/3`, two-sided Subsurface, roughness `.5`, specular `.05`, `SS Strength=.3`, `SS Opacity=.08`, source wind/height/WPO, UV2 RVT surface blending, and COLOR_0 WPO masking. | Candidate: the comparison population, transform, terrain attachment, and shadow flags are verifier-locked to the shared native fixture. The complete `68`-instance source inventory remains recorded for future full-scene reconstruction. P14 ground, P15 grass, P16 tree, rock, lighting, sky, cloud, camera, and post remain frozen. |

## Demo-derived minimal environment authority

The P13 environment comparison is rebuilt from
`/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines`; it is not a flat
stage with a grass texture assigned to an Engine plane. The controlled patch
retains the demo's `Landscape`, `MI_Landscape_Snow`, both Landscape runtime
virtual-texture volumes, `BP_StylizedSky_Lite`, captured-scene SkyLight, fog,
post process, and project renderer configuration. Unrelated demo actors are
removed, then the exact source spire, pine, grass, daisies, and deterministic
front/back cameras are placed on the authored grassy foreground sampled from
the Landscape collision surface.

This distinction is required: `MI_Landscape_Snow` depends on Landscape layer
weights and RVT semantics. Evaluating it on a StaticMesh plane discards those
inputs and produces the false navy ground previously shown in the UE panes.
The native front/back frames now preserve the demo's grass/dirt/flower blend,
pack-authored foliage materials, cool skylight, blue rock self-shadow, and
cast shadows. UE and Visual Target intentionally share the same native capture
because the retained demo-derived UE scene is the current visual authority.

## Source-backed normal facts

- `MI_RockClassic_Cliff` enables `UseStylizedNormalMap?` and selects `T_RockClassicCliffs_N`.
- The source material documents that atlas as an overall normal texture intended to make the low-poly mesh have smoother edges and flatter stylized surfaces.
- The source crack-normal branch separately uses `Rock Normal Flatten = 0.2`, `Distant Rock Normal Flatten = 1.0`, and `Rock Normal Distance = 20000 cm` before angle-corrected blending.
- Therefore a renderer bridge must never flatten the complete combined tangent normal. Large authored planes and small projected crack detail must be measured separately.
- The accepted ToonLab atlas decode is UV0, unflipped V, OpenGL green, strength `1.0`. This is not a lower-resolution substitute: the runtime source is the exact 4096×4096 texture with SHA-256 `3cf0f49047b8b8042733ce65888f3f769c8f4891c020fc906ff33b19bcde0400`.
- The atlas stays authored at strength `1.0`; ToonLab's separate `stylizedNormalResponseBridge = 0.35` is a renderer adapter applied only to that atlas before angle-corrected blending. The accepted projected crack layer remains full strength.
- ToonLab's restored high-quality world-aligned crack result is intentionally allowed to read slightly clearer than the retained UE frame. It may be reduced later as a separate artistic option, but must not be conflated with the broad dark-plane correction.

## Next sealed diagnostic

Capture the same source-normal stages as engine-independent diagnostic buffers:

1. geometric/vertex world normal;
2. authored stylized-atlas tangent normal;
3. projected crack world normal after the source distance flatten;
4. final angle-corrected combined world normal.

The next beauty-render change is allowed only after those buffers identify the first divergent stage. This keeps lighting, sky, exposure, mesh, and material parameters frozen while the normal-path mismatch is isolated.

## Surface-detail retention gate

The recessed crease and the smaller planar breaks visible on the retained UE Visual Target are a required part of the rock look, not disposable noise. A candidate may not replace P11 unless it preserves all of the following simultaneously:

- the authored mesh silhouette and geometric/vertex-normal planes;
- the UV `T_RockClassicCliffs_N` stylized-normal contribution;
- the world-aligned `T_RockClassic_N` crack-normal contribution;
- the source `BlendAngleCorrectedNormals` ordering and the instance's `Rock Normal Flatten = 0.2` distance behavior;
- the broad non-rounded form established by the Visual Target.

Any renderer bridge must operate on the additional texture-normal contribution before it is combined with the geometric normal. Flattening or smoothing the complete final normal is a hard failure even if whole-frame MAE improves.

## Authored-stone shadow regression matrix

The parity page now separates two renderer states explicitly:

- **Unshadowed diagnostic** sets `shadow=off`. The directional light remains active, but the shadow raster is deliberately disabled, so there is no rock-to-platform cast shadow. This is not a lighting failure and must never be used to judge cast-shadow parity.
- **Cast + self shadow** sets `shadow=hard`. The authored rock casts and receives shadows, the white platform receives the cast footprint, and the deterministic front/back cameras inspect both sides of the same mesh.

The Back camera is a 180-degree horizontal orbit around the shared look-at
target: both the X and Z components of the front-camera offset are negated
while height is preserved. Negating only X is not a valid Back capture because
it exposes a different side of an asymmetric source mesh.

The `testRock` adapter swaps only the source LOD0 stone while leaving the P13 camera, sun, SkyLight, platform, sky, clouds, exposure, and post stack locked. Alternate stones use their exact Unity `S_Rock` source graph/material record (`MV_RockClassic_Cliff` or `MV_RockSpire_Spires`); the baked `authored.glb` material payload is forbidden for this matrix. Non-control stones are uniformly height-fitted to the `SM_CliffClassic2` stage so different proportions remain visible without changing the camera. Geometry, tangents, UVs, maps, and relative proportions are not regenerated or smoothed. Spire assets retain a small authored burial inset; `SM_RockSpire_Spire05` uses 22% because its non-display root is designed to sit below terrain rather than remain visible above a flat test platform.

The focused regression asset is `SM_RockSpire_Spire05`, the closest authored pointed-spire silhouette to the SnowPines sticking-point shot. All eight `SM_RockSpire_Spire01`–`08` variants remain selectable so a multi-column spire cannot be mistaken for the pointed monolith. The Classic cliff family is also retained as a cross-family control.

Alternate native Unity and Unreal captures must be generated from the same source mesh/material assignment before a matrix is accepted. Missing images remain visibly pending and can never be substituted with the `SM_CliffClassic2` control.

The supplied Unity FBX importer and the ToonLab GLB loader use different
handedness conventions. ToonLab converts the contract camera into Three's
right-handed world and then rotates the source GLB 180 degrees around +Y.
Expressing that complete authored path back in Unity's left-handed world gives
the exact, non-reflective adapter: `sourceAxisScale = [1, 1, 1]` and
`sourceYawDegrees = 180`. A Z reflection is explicitly forbidden because it
reverses the spire's individual columns even when the outer silhouette appears
close. The deterministic front and back captures are the regression gate for
this adapter.

## Environment shader-family ladder

After the P13 camera, sky, cloud, rock, lighting, and post baseline is resealed,
environment shader work advances in this fixed order:

| Checkpoint | Sole mutable shader family | Frozen families |
| --- | --- | --- |
| P14 | Ground | Grass, tree, flowers/foliage, `M_StylizedBasic`, mountain/cliff, snow/weather, water, waterfalls, underwater, atmosphere |
| P15 | Grass | Ground and every later family |
| P16 | Tree | Ground, grass, and every later family |
| P17 | Flowers and remaining foliage | Ground, grass, tree, and every later family |
| P18 | General stylized solid surface (`M_StylizedBasic`) | All accepted earlier families and every later family |
| P19 | Mountain/cliff | All accepted earlier families and every later family |
| P20 | Snow/weather | All accepted earlier families and every later family |
| Subsequent | Water, then waterfalls, then underwater, then remaining atmosphere | Every previously accepted family |

Each checkpoint inherits the last accepted checkpoint. It may change only the
declared shader family and its renderer-boundary adapter. Geometry, camera,
lighting, sky, clouds, rock, post processing, and all other shader families
remain byte/configuration frozen unless the checkpoint explicitly owns them.
The retained UE mountain-range scene is not copied into the compact P14–P18
test because its Landscape/RVT/weightmap stack would introduce unrelated
geometry and material variables; mountain/cliff integration begins at P19.

### P19 nature-only mountain/cliff contract

P19 deliberately inherits P17 rather than P18. The P18 bench, lamp, sword,
crate, beach-shell fixtures, and generic imported-object treatment remain an
isolated prop experiment and are absent from this checkpoint. P19 changes
only two source-controlled nature fixtures:

- `SM_Mountain01` LOD0 with `MI_Mountain` → `M_Mountain`;
- `SM_CliffClassic5` LOD0 with `MI_RockClassic_Cliff` → `M_Rock`.

Both fixtures are grounded from their post-transform world bounds against the
frozen P14 height field, cast and receive shadows, disable frustum culling,
and contribute oriented grass-exclusion footprints before the unchanged P15
AutoGrass population is generated. Their final world bounds are recorded in
the runtime report. The hero cliff also carries an explicit authored burial
depth so its irregular underside seats into the terrain rather than balancing
on the single lowest bounds point. The wide mountain is placed behind the retained hero
patch and grounded from an explicit retained-edge probe, so its surface does
not overlap the compact Landscape and create a second terrain ceiling. The
deterministic `Mountain overview` and `Cliff detail`
cameras fit each fixture's actual bounds independently. `Mountain surface`
provides a deliberately cropped material-review view while the overview
preserves the whole-asset evidence. None alters the sealed front/back spire
cameras. Those three P19 material-review cameras isolate only their declared
source fixture: they hide the accepted P14–P17 hero patch and the single-rock
test fixture for the review frame only. The integrated `Front` and `Back
shadow` views retain every accepted nature family. Native
Unity/Unreal P19 captures remain pending, so the browser must not present P13
or P18 images as P19 evidence.
