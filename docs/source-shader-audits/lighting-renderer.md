# UE 5.8 to ToonLab lighting-renderer contract

## Scope and conclusion

This is the source-level contract for the lighting, shadow, SkyLight, and
height-fog path used by
`/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines`. The authoritative
scene values are in
`assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json`; the browser
implementation is `examples/source-showcase/main.js` and its renderer-boundary
helpers include `src/environment/ueSourceLighting.js`,
`src/environment/ueSourceCsmShadowNode.js`, and
`src/environment/ueSourceShadowFilter.js`.

The directional-light transform is deterministic and can be matched exactly.
That does **not** make the rendered shadow deterministic across UE and Three.
The transform fixes only the incoming ray. UE subsequently constructs four
camera-relative shadow projections, fits a stable sphere for each one, applies
cascade-specific raster depth bias, filters each map, blends cascade overlap,
continues with a distance-field cascade, evaluates material shadow masks and
WPO, adds a captured and convolved SkyLight, and finally applies height fog.
Three has different implementations for several of those stages.

The most important operational distinction is:

```text
same light direction != same shadow camera != same shadow map != same final pixel
```

Also, `sunFlip=1` is an explicit diagnostic that reverses the exported source
direction. It must be absent (or zero) in the source baseline. Likewise,
`ibl=0`, `fogScale=0`, `post=0`, `ao=0`, and `taa=0` deliberately remove source
rendering stages; they are isolation probes, not an apples-to-apples URL.

## Effective SnowPines renderer state

The exported project and level state fixes the following inputs:

| Input | Effective source value |
| --- | --- |
| renderer shadow path | regular shadow maps, `r.Shadow.Virtual.Enable=0` |
| shadow scalability | Epic, `sg.ShadowQuality=3` |
| camera near clip | `5 cm` / `0.05 m` |
| sun | movable, white, intensity `8` |
| sun emission direction in UE | `[0.4924038765, -0.4131759112, -0.7660444431]` |
| CSM | 4 cascades, exponent `3`, range `30000 cm` |
| cascade transition | `0.1` of each cascade range |
| distance-field shadow | enabled to `51200 cm` |
| shadow-map resolution | `2048` physical per cascade; `2040` interior plus a 4-texel border on Metal |
| user shadow bias / slope bias | `0.5` / `0.5` |
| SkyLight | movable captured scene, intensity `1.2`, resolution `128` |
| SkyLight tint | sRGB bytes `[195, 223, 255]` |
| SkyLight lower color | linear `[0.028426, 0.040915, 0.057805]` |
| SkyLight lower replacement | enabled (`bLowerHemisphereIsBlack=true`) |
| SkyLight distance threshold | `150000 cm` |
| SkyLight real-time capture / cast shadows | false / false |
| fog | analytic exponential height fog; volumetric fog off |
| ambient occlusion | classic deferred SSAO, pixel path, 2 levels, quality 50 |
| AO response | intensity `0.5`, power `2`, view-locked radius `160 cm` |
| point lights | 2 stationary, unitless intensity `4`, non-inverse-square, exponent `6`, radius `2500 cm`, no shadows |

The project also sets `r.GenerateMeshDistanceFields=1`, TAA, no dynamic GI,
and no virtual shadow maps. Those settings determine which UE branches below
are active.

## 1. Directional radiometry

### UE source path

The relevant UE 5.8 sources are:

- `Engine/Source/Runtime/Engine/Private/Components/LightComponent.cpp`
  - `ULightComponent::ComputeLightBrightness()`
  - `ULightComponent::GetColoredLightBrightness()`
  - `BuildSceneProxyDesc()`
  - `FLightRenderParameters::MakeShaderParameters()`
- `Engine/Source/Runtime/Engine/Private/Components/DirectionalLightComponent.cpp`
  - `FDirectionalLightSceneProxy::GetLightShaderParameters()`
- `Engine/Shaders/Private/BRDF.ush`
  - `Diffuse_Lambert()`

For this component, temperature and IES are inactive, so the active path is:

```text
brightness       = Intensity = 8
proxyColor       = SRGBToLinear(LightColor) * brightness = (8, 8, 8)
shaderColor      = proxyColor * GetLightExposureScale(Exposure)
InverseExposureBlend = 0, therefore GetLightExposureScale = 1
directDiffuse    = max(dot(N, incomingDirection), 0)
                   * shaderColor * diffuseColor / PI
```

The level contains no `SkyAtmosphereComponent`; there is therefore no
non-white atmosphere transmittance to apply to the directional light.

### Browser path

Three's matching path is:

- `node_modules/three/src/nodes/lighting/AnalyticLightNode.js`
  - `color = light.color * light.intensity`
- `node_modules/three/src/nodes/functions/PhysicalLightingModel.js`
  - `irradiance = dotNL * lightColor`
- `node_modules/three/src/nodes/functions/BSDF/BRDF_Lambert.js`
  - `diffuseColor / PI`

Both renderers have the same Lambert `1 / PI` normalization at this boundary.
The exact source mapping is therefore:

```text
Three DirectionalLight intensity = UE DirectionalLight intensity = 8
```

`UE_SOURCE_RADIOMETRIC_SCALE` is consequently `1`. The old browser multiplier
`0.2` was a visual calibration, not a UE-to-Three unit conversion.

This proves the light input, not complete material equality. UE Default Lit,
Subsurface, reflection, and Three physical specular lobes still have separate
material-level contracts.

## 2. Direction and sign

`ULightComponent::GetDirection()` returns the component transform's unit X
axis. The exporter records that forward vector directly. UE then sends
`-GetDirection()` to the light shader as the surface-to-light incoming vector.

The coordinate conversion is:

```text
UE (X, Y, Z) -> Three (X, Z, -Y)

UE emission  = [ 0.4924038765, -0.4131759112, -0.7660444431]
Three emission
             = [ 0.4924038765, -0.7660444431,  0.4131759112]
```

Three's `lightTargetDirection()` in
`node_modules/three/src/nodes/accessors/Lights.js` evaluates
`normalize(lightPosition - lightTargetPosition)`, which is its incoming light
vector. The showcase places the light at:

```text
lightPosition = target - 500 * ThreeEmission

Three incoming = normalize(lightPosition - target)
               = -ThreeEmission
```

That exactly matches UE's `-GetDirection()`. The numeric distance `500` has no
radiometric or geometric meaning for a directional light; only the normalized
difference matters.

There was one real hierarchy hazard. `CSMShadowNode.updateBefore()` subtracts
the original light and target's **local** positions. If the imported light and
the repaired target have different parents, direct lighting can remain correct
while every cascade camera points elsewhere. The showcase now reparents both
objects to the same exported scene root before assigning their positions.

## 3. Cascaded shadow maps

### Split distances: exact

The relevant UE functions in
`Engine/Source/Runtime/Engine/Private/Components/DirectionalLightComponent.cpp`
are `ComputeAccumulatedScale()`, `GetEffectiveCascadeDistributionExponent()`,
and `GetSplitDistance()`. The movable light is treated as having valid
precomputed state because `FLightSceneInfo::IsPrecomputedLightingValid()` in
`Engine/Source/Runtime/Renderer/Private/LightSceneInfo.cpp` returns true when
the proxy has no static shadowing. UE therefore uses the authored exponent
`3`, not the unbuilt-preview exponent `4`.

For four cascades the geometric weights are:

```text
weights            = [1, 3, 9, 27]
cumulative / total = [1/40, 4/40, 13/40, 40/40]
split(i)            = near + cumulative(i) * (far - near)
```

With the source near plane `0.05 m` and CSM far distance `300 m`, the exact
split ends are:

```text
[7.54875, 30.045, 97.53375, 300] metres
```

`computeUeCascadeBreaks()` ports this formula, including the nonzero near
plane, into the normalized values required by Three's custom split callback.
The showcase now preserves the glTF camera's exported `0.05 m` near plane;
the former `0.08 m` clamp changed every cascade.

### Projection fit: source bridge implemented

UE's `GetShadowSplitBoundsDepthRange()` reconstructs the eight world-space
frustum corners, finds an ideal center along the view direction, then fits a
stable bounding sphere:

```text
frustumLength = splitFar - splitNear
optimalOffset = (nearDiagonalSq - farDiagonalSq) / (2 * frustumLength)
                + frustumLength / 2
centerZ        = clamp(splitFar - optimalOffset, splitNear, splitFar)
radius         = max(distance(center, each of 8 corners))
```

`UeSourceCsmShadowNode` now replaces Three's diagonal box fit with this stable
sphere, rounds the radius up to a whole source centimetre, clamps the subject
interval to at least `-50..+50 m`, and snaps the light-space center to UE's
four-texel period. Its orthographic near/far interval is exactly
`0..2 * depthExtent` after placing the light at `-depthExtent` from the snapped
center. It also ports classic CSM allocation's four-texel border: the physical
target remains `2048`, while projection, snapping, and bias use the `2040`
interior resolution and XY projection scale `2040 / 2048`.

The remaining projection-side gap is UE's caster culling volume and the exact
`MinSubjectZ`/`MaxSubjectZ` expansion when real casters extend beyond the
minimum interval. The browser currently uses the stable cascade sphere and
minimum clamp as its subject bounds; it does not reproduce UE's renderer
primitive gather.

### Transition and range ported; distance-field continuation remains

UE extends each non-final split by:

```text
fadeExtension = (splitFar - splitNear)
                * CascadeTransitionFraction
                * r.Shadow.CSM.TransitionScale
```

For this scene the two multipliers are `0.1` and `1.0`. Three's built-in CSM
fade uses a different depth-squared `0.25 * edge^2` margin.
`UeSourceCsmShadowNode` therefore performs the source ten-percent extension
and blends adjacent raster-cascade results over the extended interval itself.

UE also creates one distance-field shadow cascade from `300 m` to `512 m`.
Because that is a fifth cascade for transition purposes, the fourth raster CSM
slice is extended by ten percent of its own range:

```text
fourth CSM range = 300 - 97.53375 = 202.46625 m
CSM/DF overlap   = 0.1 * 202.46625 = 20.246625 m
extended CSM end = 320.246625 m
```

The distance-field cascade is the final cascade, so its fade plane is moved
back by ten percent of `512 - 300 = 212 m`: it fades from `490.8 m` to
`512 m`. The separate component `ShadowDistanceFadeoutFraction=0.2` is used by
`GetDirectionalLightDistanceFadeParameters()`; that function also takes the
maximum with the exported `FarShadowDistance=3000 m`, so its literal global
distance-fade interval is `2400..3000 m` even though this component has zero
far-shadow-map cascades.

The fourth raster slice is extended to `320.246625 m`, so its side of the
CSM/DF overlap is represented. Three still has no mesh-distance-field
continuation. The final `490.8..512 m` fade and the complete `300..512 m`
distance-field shadow mask are explicit gaps.

### Resolution and filtering: source kernel ported

Epic shadow scalability resolves to:

```text
r.ShadowQuality=5
r.Shadow.MaxCSMResolution=2048
r.Shadow.DistanceScale=1
r.Shadow.CSM.TransitionScale=1
r.DistanceFieldShadowing=1
```

UE's default `r.Shadow.FilterMethod=0` selects uniform PCF. At quality `5`,
`ManualPCF()` in `Engine/Shaders/Private/ShadowFilteringCommon.ush` selects
`Manual5x5PCF()`.

The browser allocates `2048 x 2048` physical maps with UE's `2040 x 2040`
interior projection and now overrides Three's stock
weighted 3x3 filter with `UeManual5x5PcfShadowFilter`. It is a literal TSL
translation of `Manual5x5PCF()` and `HorizontalPCF5x2()`: nine raw depth
`gather4` reads reconstruct a 6x6 footprint with separable weights
`[1-f, 1, 1, 1, 1, f]` and the source `0.04` normalization. It also ports the
opaque soft comparison
`saturate((ShadowmapDepth - SceneDepth) * TransitionScale + 1)` instead of
using hardware binary compare PCF. Subsurface shadow transmittance is outside
this opaque/default-lit cascade path and remains material-family work.

### Bias: constant/receiver bridge implemented; caster slope remains

UE computes bias per cascade in
`FProjectedShadowInfo::UpdateShaderDepthBias()` in
`Engine/Source/Runtime/Renderer/Private/ShadowRendering.cpp`:

```text
baseDepthBias  = r.Shadow.CSMDepthBias / (MaxSubjectZ - MinSubjectZ)
texelScale     = ShadowBounds.radius / ResolutionX
depthBias      = lerp(baseDepthBias,
                      baseDepthBias * texelScale,
                      CascadeBiasDistribution)
depthBias     *= UserShadowBias

slopeScale     = r.Shadow.CSMSlopeScaleDepthBias * UserShadowSlopeBias
slopeDepthBias = depthBias * slopeScale
```

The effective defaults are `CSMDepthBias=10`,
`CSMSlopeScaleDepthBias=3`, `CascadeBiasDistribution=1`, and the level's user
values are `0.5` and `0.5`.

`computeUeDirectionalShadowBiasContract()` evaluates those expressions for
every fitted cascade. It separately ports `ComputeTransitionSize()` and UE's
default `CSMReceiverBias=0.9`: the filter multiplies transition scale by
`lerp(0.1, 1, NoL)` using the receiving world normal and incoming light
direction.

For an orthographic linear shadow projection, adding a uniform constant to
every stored caster depth is algebraically identical to adding that constant
inside every receiver comparison. The TSL filter uses that equivalence for
the per-cascade constant term. This is not an eye-balled Three bias; the value
is derived from the fitted radius, subject interval, `2048` resolution, and
the authored user bias. Stock `shadow.bias` and `shadow.normalBias` remain
zero in the source baseline; optional URL values remain diagnostics only.

The slope term cannot be moved to the receiver without changing the
algorithm. UE computes it in `ShadowDepthVertexShader.usf` from each
**caster's** vertex normal, clamps the slope to `1`, and changes the depth
written into the map. The browser exports and verifies each cascade's
`slopeDepthBias`/`maxSlopeDepthBias` contract, but does not yet inject that
caster-normal term into Three's shadow-depth pass. That is the remaining bias
gap; `normalBias` is intentionally not used as a substitute.

## 4. Captured-scene SkyLight

### UE source path

The relevant source functions are:

- `FSkyLightSceneProxy::FSkyLightSceneProxy()` and
  `GetEffectiveLightColor()` in
  `Engine/Source/Runtime/Engine/Private/Components/SkyLightComponent.cpp`;
- `CaptureSceneIntoScratchCubemap()` in
  `Engine/Source/Runtime/Renderer/Private/ReflectionEnvironmentCapture.cpp`;
- `ComputeDiffuseIrradiance()` in
  `Engine/Source/Runtime/Renderer/Private/ReflectionEnvironmentDiffuseIrradiance.cpp`;
- `GetSkySHDiffuse()` in
  `Engine/Shaders/Private/ReflectionEnvironmentShared.ush`.

The effective SkyLight color is:

```text
linearTint = SRGBToLinear([195, 223, 255] / 255)
           = approximately [0.545724, 0.737910, 1]
SkyLightColor = linearTint * Intensity * globalMultiplier
              = linearTint * 1.2 * 1
```

Epic GI scalability keeps the global SkyLight multiplier at `1`. UE captures
six 128-pixel cube faces with the `ESFIM_Game` show flags. Post processing,
motion blur, particles, light shafts, editor primitives, and SkyLighting
feedback are disabled. Ordinary lighting and fog remain active because this
component does not request emissive-only capture. The view forces roughness to
one and uses `SkyDistanceThreshold=1500 m` as its near plane.

`CopySceneColorToCubeFaceColorPS()` then replaces every lower-hemisphere sample
with `LowerHemisphereColor` when `bLowerHemisphereIsBlack=true`; that historic
field name is what UE still serializes even though the editor label now says
“Lower Hemisphere Is Solid Color.” It also prepares premultiplied alpha before
filtering. UE generates the cube mip chain, selects the mip whose face size is
`32 x 32`, projects those samples into three-band RGB SH with solid-angle
weight `4 / (sqrt(lengthSquared) * lengthSquared)`, and normalizes by `4 * PI`.
A separate filter produces the reflection cubemap.

At shading time UE evaluates the convolved SH in the surface-normal direction
and multiplies it by `SkyLightColor`. The component has `CastShadows=false`, so
its SkyLight path does not request DFAO or bent-normal shadowing.

### Browser source implementation

`createUeSourceCapturedSkyLight()` now renders the complete reconstructed
scene into six FP16 128-pixel faces. It temporarily restores the original
source sky/cloud transforms hidden by the visible-camera normalization,
clips everything nearer than exactly `1500 m`, leaves the installed analytic
height-fog node active, disables tone mapping and existing ambient/SkyLight
feedback, and temporarily forces material roughness to one. The browser needs
a finite far plane, so it derives one from the restored scene bounds.

The exported `lower_hemisphere_is_black=true` flag controls a capture-only,
depth-independent lower hemisphere. Its linear radiance is not pre-tinted;
the source tint remains a lighting-time multiplier just as it is in UE.

Three's public render-target readback cannot select a mip. The port therefore
samples cube mip `2` (`128 -> 64 -> 32`) into a temporary 32-pixel cube, then
performs the same nine-basis, solid-angle-weighted, `4 * PI` normalized SH
projection on its FP16 values. `UeSourceCapturedSkyLightNode` evaluates that SH
in the world normal direction and adds UE's explicit `max(0, ...)` clamp,
which stock `LightProbeNode` omits. Tint is multiplied into the SH coefficients
and the source intensity remains `1.2`; linearity makes this equivalent to UE
applying `SkyLightColor` after SH evaluation.

Diffuse lighting no longer comes from a roughness-one PMREM sample. A PMREM
generated from the same raw cubemap is retained only for the specular-radiance
input of Three's physical materials, and is multiplied by the same tint and
intensity in the custom light node.

### Exact native diffuse export and remaining SkyLight gaps

`USkyLightComponent` does not reflect its filtered renderer state to Python,
but UE 5.8 exposes both resources through public C++ getters:
`GetProcessedSkyTexture()` and `GetIrradianceEnvironmentMap()`. The
project-local editor-only `ToonLabSourceExport` plugin now reads the latter
after the same warmed captured-scene render used by the viewport reference.
It writes all nine FP16-derived RGB coefficients and an analytically verified
UE-to-Three basis transform. `source-showcase` requires that artifact and uses
it for diffuse/front/back SkyLight evaluation. The browser recapture is kept
as a diagnostic and as the input to the still-partial specular path; it no
longer determines the blue diffuse fill on rocks, terrain, or foliage.

- UE's processed specular cubemap is public to C++ as an `FTexture`, but its
  filtered mip bytes/layout are not yet exported into a browser texture.
- Three's PMREM uses GGX VNDF filtering. It is now isolated to specular, but it
  still does not reproduce UE's reflection-capture filter, layout, or encoding.
- UE's capture renderer, infinite/reversed depth behavior, LOD choice, cube
  rasterization, mip filtering, and half-float readback quantization are not
  byte-identical to the browser's finite-far WebGPU capture.

These remaining gaps affect reflection/specular structure, not the imported
diffuse blue fill. A shaded rock can still differ at glossy highlights or SSR
boundaries, but its ambient hue now comes from UE's exact stored SH.

## 5. Exponential height fog

The source path is defined by:

- `FExponentialHeightFogSceneInfo` in
  `Engine/Source/Runtime/Renderer/Private/SceneCore.cpp`;
- `FSceneRenderer::InitFogConstants()` in
  `Engine/Source/Runtime/Renderer/Private/FogRendering.cpp`;
- `CalculateLineIntegralShared()` and `GetExponentialHeightFog()` in
  `Engine/Shaders/Private/HeightFogCommon.ush`.

UE divides artist-facing density and falloff by `1000`:

```text
densityPerCm = 0.05 / 1000 = 0.00005
falloffPerCm = 0.464768 / 1000 = 0.000464768
start        = 1000 cm
fogHeight    = component Z = 0 cm
```

After moving the ray origin to the start distance, the active first fog term
is:

```text
originDensity = densityPerCm
                * exp2(-falloffPerCm * (rayOriginZ - fogHeight))
falloff       = max(-127, falloffPerCm * rayDeltaZ)
lineFactor    = (1 - exp2(-falloff)) / falloff
                // Taylor expansion around zero
integral      = originDensity * lineFactor * rayLengthCm
transmission  = max(saturate(exp2(-integral)), 1 - FogMaxOpacity)
output        = scene * transmission
                + FogColor * (1 - transmission)
```

`configureSourceRenderState()` ports this analytic first term and explicitly
converts Three metres back to UE centimetres. The source directional
inscattering color is zero, volumetric fog is disabled, cutoff distance is
zero, and all reference cameras are far below UE's observer-height safety
clamp, so those omitted branches are inert for this level.

Remaining proof gaps are the unexported second-fog term and end distance. UE's
component defaults make both inactive, but the exporter should record them.
The active analytic fog term now participates in the SkyLight cube capture as
it does in UE.

## 6. Screen-space ambient occlusion

SnowPines does **not** select UE GTAO. The project enables
`r.DefaultFeature.AmbientOcclusion`, the captured editor state is
`sg.PostProcessQuality=3`, and neither the project nor level overrides
`r.AmbientOcclusion.Method`. UE 5.8 therefore takes method `0`: classic
deferred SSAO through the pixel-shader path (`r.AmbientOcclusion.Compute=0`).
Using Three's stock GTAO defaults is not an equivalent interpretation of the
three post-process controls.

The effective unbound-volume and engine-default state is:

| Input | Effective value |
| --- | --- |
| intensity | `0.5` (engine default; volume override flag is false) |
| power | `2` (engine default; volume override flag is false) |
| authored radius | `160 cm` (volume override flag is true) |
| radius mode | view locked (`AmbientOcclusionRadiusInWS=false`) |
| radius scalability | `1.0` at PostProcessQuality 3 |
| bias | `3`, sent to the shader as `0.003` |
| quality / shader quality | `50` / permutation `2` |
| levels | automatic `2` (full resolution plus one half-resolution level) |
| mip scale / blend / threshold | `1.7` / `0.6` / `0.01` |
| HZB mip-level factor | `0.4` |
| fade | starts at `3000 cm`, reaches white at `8000 cm` |
| static fraction | `1`, though this project disables baked static lighting |

`GetSSAOShaderParameters()` does not convert the radius to a fixed `1.6 m`
world radius. Because the radius is view locked, it first divides by `400`,
then every level applies its mip scaling and the engine's `/4` adjustment:

```text
full-res radiusInShader = (160 / 400) * 1.7^0 / 4 = 0.1
half-res radiusInShader = (160 / 400) * 1.7^1 / 4 = 0.17
actual radius           = radiusInShader * per-pixel scene depth
```

At quality permutation `2`, the full-resolution pass evaluates the three
source spiral offsets, two steps, and both mirrored directions: `12` depth
lookups. The coarse setup pass forces the six-offset set, producing `24`
lookups before UE's normal/depth-aware four-tap upsample and `0.6` mip blend.
The input rotation is UE's exact 64x64 `PF_R8G8` system texture containing a
4x4 repeating ordered basis. With TAA active, its UV is offset by:

```text
(TemporalSampleIndex % 8) * float2(2.48, 7.52) / 64
```

After the 30-80m fade, the final source response is:

```text
AO = 1 - (1 - abs(rawAO)^2) * 0.5
```

This curve matters: the former browser path incorrectly assigned `Power=2`
to GTAO's sample-distance exponent and then linearly mixed its raw output.
`ueSourceAmbientOcclusion.js` now ports the screen-radius behavior, exact
ordered noise texture/addressing, source lookup budget, fade, and response as
a reusable WebGPU node. Its horizon sampler is explicitly a compatibility
bridge, not a parity claim: it still uses Three's GTAO integral instead of
UE's `WedgeWithNormal`/HZB sampler, and it lacks the second resolution level.

There is also an application boundary still to close. UE writes SSAO into the
screen-space AO target and consumes it while composing material AO,
SkyLight/indirect diffuse, and the reflection environment in
`DiffuseIndirectComposite.usf`. It does not multiply direct sun, emissive,
bloom, fog, and the completed scene color uniformly. The current browser
pipeline still uses that whole-scene multiplication as an explicit bridge
until its deferred indirect-light buffers are separated.

Authoritative source paths are:

- `Engine/Source/Runtime/Renderer/Private/CompositionLighting/PostProcessAmbientOcclusion.cpp`;
- `Engine/Shaders/Private/PostProcessAmbientOcclusion.usf`;
- `Engine/Shaders/Private/PostProcessAmbientOcclusionCommon.ush`;
- `Engine/Source/Runtime/Renderer/Private/SystemTextures.cpp`;
- `Engine/Config/BaseScalability.ini`.

## 7. Material shadow masks and caster geometry

UE's shadow-depth path calls `GetMaterialClippingShadowDepth()` in
`Engine/Shaders/Private/MaterialTemplate.ush`. A masked material therefore
clips the shadow pass with the material's `OpacityMask` minus its clip value.
The So Stylized masked families use the default clip `1 / 3`.

The supplied graphs add important pass-specific behavior:

- `M_Leaves.T3D` uses `ShadowReplace`: camera-facing perpendicular trim is a
  visible-pass operation, while the shadow pass retains the source leaf
  texture silhouette;
- `MF_Occlusion.T3D` returns `1` in the shadow branch, so camera/player
  occlusion does not punch holes in cast shadows;
- leaf, foliage, tree-LOD, and cloud materials retain their authored masked
  texture channels in the shadow pass; families with WPO also retain their
  caster displacement.

The browser maps these through `material.maskShadowNode` with the `1 / 3`
threshold. `Renderer._getShadowNodes()` in Three's common renderer uses that
node to discard shadow fragments and reuses `material.positionNode` for the
shadow pass, so the reconstructed WPO also moves the caster.

The scene export now records `renderProperties` for all `369 / 369` authored
StaticMeshComponents. That closes the source-data gap for `cast_shadow`,
dynamic/static/contact/far/hidden/inset shadow participation, distance-field
participation, WPO evaluation, LOD/draw distance, bounds scale, and lighting
channels. In this export, `350` components have `cast_shadow=true`, `19` have
it disabled, all `369` evaluate WPO, and none cast far shadows.

The temporal mask itself is no longer inferred. The engine-owned
`DitherTemporalAA` and `ScreenAlignedPixelToPixelUVs` assets were exported
directly from UE 5.8, together with
`Good64x64TilingNoiseHighFreq` (64x64, linear grayscale, Wrap/Wrap, no mips).
The exact material expression is:

```text
p = PixelPosition + float2(View.TemporalSampleIndex)
regular = Mod((uint)p.x + 2 * (uint)p.y, 5)
noise = Good64x64TilingNoiseHighFreq(PixelPosition / 64).r * Random
result = AlphaThreshold + (regular + noise) * 0.166650 - 0.5
```

The source project selects TAA with temporal upsampling at 100%, so the live
path also uses UE's eight `Halton(index+1, 2/3) - 0.5` pixel offsets. That
sample index drives both the camera jitter and the visible/shadow material
mask. The exact graph is currently bound for the implemented `M_Leaves`,
`M_Foliage`, `M_Rock`, and `M_StylizedClouds_Lite` paths. All eight source
call sites remain inventoried; full clouds, sandfall, waterfall, and
`MF_DesertSand` still await their family runtime ports.

The remaining shadow-mask and temporal application gaps are:

- Three's generic TRAA resolve is no longer active. The source path now uses
  UE Gen4's active `MainUpsampling / High` core: `.04` source weight, nine-tap
  polynomial/HDR current filtering, YCoCg sample-distance clamping,
  five-fetch Catmull-Rom history, velocity reprojection, and the available
  dynamic classification. Quality High uses `PF_FloatRGBA`, not the
  configured-but-inactive R11G11B10 branch. Still unavailable are UE's
  responsive-AA stencil bit, encoded primitive-mobility ownership, exact
  half arithmetic/stochastic RGBA16F quantization, and non-identity
  pre-exposure changes (the frozen scene ratio is one);
- per-instance fade values are not exported independently, so fully visible
  leaves, foliage, and rocks currently feed `1` into the exact graph;
- the glTF runtime still needs a stable actor/component identity bridge before
  applying each exported component's flags. The live material applicator
  currently enables a mesh whenever any slot has a shadow mask; the manifest
  now proves when that material-level result must be suppressed by
  `cast_shadow=false`;
- a difference in WPO or source card geometry moves the caster before the
  light transform is ever consulted.

For the foreground tree and nearby rock, component participation, tree WPO,
the leaf shadow mask, the first CSM projection, and per-cascade bias are all
part of the shadow result. Matching only the sun vector does not constrain any
of those additional variables.

## 8. Two non-directional lights

The fresh level export proves the complete active contract for both stationary
PointLights:

```text
IntensityUnits             = Unitless
Intensity                  = 4
bUseInverseSquaredFalloff  = false
LightFalloffExponent       = 6
AttenuationRadius          = 2500 cm = 25 m
CastShadows                = false
```

`UPointLightComponent::ComputeLightBrightness()` in
`Engine/Source/Runtime/Engine/Private/Components/PointLightComponent.cpp`
only multiplies a unitless intensity by the legacy factor `16` inside the
inverse-square branch. That branch is explicitly disabled here, so each
proxy's brightness remains exactly `4`.

`FPointLightSceneProxy::GetLightShaderParameters()` passes exponent `6`, and
`GetLocalLightAttenuation()` in
`Engine/Shaders/Private/DeferredLightingCommon.ush` selects
`RadialAttenuation()` from `DynamicLightingCommon.ush`. For surface-to-light
distance `d` and radius `R=25 m`, the active mask is:

```text
normalizedDistanceSquared = saturate(d * d / (R * R))
attenuation                = pow(1 - normalizedDistanceSquared, 6)
lightColor                 = SRGBToLinear(LightColor) * 4 * attenuation
```

This is not Three's stock `PointLight` attenuation. Three evaluates an inverse
`distance^decay` term multiplied by a quartic cutoff window, so setting
`decay=6` would be incorrect. The source showcase now installs
`UeSourcePointLightNode`, which evaluates UE's normalized-radius exponent mask
for lights tagged with the resolved manifest contract. Other Three point
lights continue through the stock node. `resolveUePointLightContract()` also
keeps the inactive legacy `x16` rule explicit and testable.

The point-light intensity, color, position, radius, falloff, and shadow
participation inputs are therefore exact for this scene. Remaining per-pixel
differences belong to the receiving material/BRDF and final post-processing,
not an unknown point-light unit conversion.

## Parity status and required implementation order

| Stage | Status | Required action |
| --- | --- | --- |
| source camera transform/FOV | source exported | preserve the glTF camera and 5 cm near plane |
| sun intensity and tint | exact input mapping | keep scale `1`; remove display calibration |
| sun direction and sign | exact input mapping | no `sunFlip`; keep light and target under one parent |
| CSM split depths | exact formula | retain exponent-3 custom splits |
| CSM projection/depth range | source bridge | stable sphere, cm rounding, four-texel snap, and minimum subject range ported; close UE primitive caster bounds/culling |
| CSM transition/final fade | partial source bridge | 10% raster overlap ported; add 490.8-512 m final DF fade with the DF mask |
| distance-field shadow | missing | export/implement an equivalent 300-512 m mask or retain UE as oracle |
| shadow filter | source bridge | quality-5 raw-gather `Manual5x5PCF`, soft comparison, and NoL receiver scale ported; complete WebGPU pixel sign-off |
| shadow bias | partial source bridge | per-cascade formula and constant receiver-equivalent ported; inject caster-normal slope bias into shadow-depth writes |
| mesh component render/shadow flags | source export complete, runtime application partial | bridge stable glTF actor/component identity and apply all `369` records |
| masked shadow silhouette/WPO | partial source port | port UE temporal/per-instance inputs |
| SkyLight tint/intensity/lower color | source implementation | keep exported enable flag and linear/sRGB boundaries verified |
| SkyLight capture/SH diffuse | exact native renderer coefficients | retain the C++ getter export and basis-transform numerical gate |
| SkyLight reflection convolution | bridge | replace Three GGX PMREM with UE reflection filter/encoding |
| analytic screen fog | active first term ported | export second term/end distance; capture participation is now shared |
| ambient occlusion | partial source bridge | exact classic-SSAO contract/radius/noise/response mapped; port WedgeWithNormal/HZB/coarse upsample and apply only in deferred indirect/reflection composite |
| point lights | exact active input + attenuation mapping | retain manifest contract and `UeSourcePointLightNode` |

Until the rows marked bridge or missing are implemented, the correct claim is
that the source scene, sun vector, light values, camera, and several analytic
formulas are matched—not that a live Three frame is pixel-identical to UE.
The Unreal viewport capture remains the visual oracle for those renderer-only
intermediates.
