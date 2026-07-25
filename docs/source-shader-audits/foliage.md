# So Stylized foliage and tree shader audit

## Scope and authority

This is the implementation specification for the foliage and tree materials used by the supplied `Demonstration_SnowPines` level. It covers:

- broadleaf and conifer cards, including the snow variants (`M_Leaves`);
- grass, flowers, ferns, bushes, and other low foliage (`M_Foliage`);
- tree bark, moss, and bark snow (`M_Bark`);
- the combined bark/leaf far-tree material (`M_TreeSingleMat`);
- the shared hue, opacity, wind, interaction, day-cycle, moss, snow, and tree-sway functions those graphs call.

The source of truth is the supplied Unreal content, not the current browser approximation. The relevant local evidence is:

- `assets-local/sostylized/graphs/M_Leaves.T3D`
- `assets-local/sostylized/graphs/M_Foliage.T3D`
- `assets-local/sostylized/graphs/M_Bark.T3D`
- `assets-local/sostylized/graphs/MF_HueVariance.T3D`
- `assets-local/sostylized/graphs/MF_Occlusion.T3D`
- `assets-local/sostylized/graphs/MF_Grass.T3D`
- `assets-local/sostylized/material-source/manifest.json`
- `assets-local/sostylized/trees/p16-ue-pine-contract.json`
- `assets-local/sostylized/material-audit.json`
- `assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json`
- `assets-local/sostylized/demo-scenes/Demonstration_SnowPines.glb`

The browser implementation audited here is `src/environment/soStylizedSourceMaterials.js`.

The central finding is that the supplied foliage is not a generic toon shader with a different palette. It is a family of masked Unreal Subsurface materials with authored texture decoding, UV-set conventions, per-instance randomness, temporal dithering, custom shadow behavior, and several materially different WPO functions. `M_Bark` is a separate opaque Default Lit material. The current port merges or approximates many of those contracts, which is why matching lights and transforms alone cannot make the result equal.

## Scene coverage

The SnowPines export resolves to four material graph families:

| Family | UE material | Surface contract | Representative SnowPines instances |
| --- | --- | --- | --- |
| Leaf cards | `M_Leaves` | Masked, `MSM_SUBSURFACE`, two-sided | Pine, cold pine, snowy pine, leafy pine, oak, bush leaves |
| Ground and small foliage | `M_Foliage` | Masked, `MSM_SUBSURFACE`, two-sided, Material Attributes | Grass, snowy grass, daisies, daffodils, ferns, crocuses, foxtails |
| Bark/trunks | `M_Bark` | Opaque, `MSM_DEFAULT_LIT`, one-sided | Pine bark, snowy pine bark, oak bark, mossy bark |
| Combined far-tree LOD | `M_TreeSingleMat` | Masked, `MSM_SUBSURFACE`, two-sided | `*_SingleMat` pine and oak LODs |

The level inventory makes the grass and alpha-card paths especially important. Selected occurrence counts from the level export are:

| Material group | Level instances |
| --- | ---: |
| `MI_GrassSnow_NoRVT` plus LOD1/LOD2 | 2,701 |
| `MI_Grass_NoRVT` plus LOD1/LOD2 | 1,719 |
| `MI_Daisy` | 1,364 |
| `MI_Daffodils` | 257 |
| Bush leaf variants | 665 combined |
| Ferns | 137 |
| Crocuses | 93 |
| Ice flowers | 59 |
| Foxtails | 48 |
| Pine bark/leaf/single-material variants | hundreds of each family |

This means a small error in grass alpha, colormap multiplication, leaf shadow masking, or two-sided subsurface affects much more of the frame than a small light adjustment.

## Non-negotiable data and coordinate contract

### Coordinate conversion

Unreal world coordinates are centimeters with Z up. The imported glTF scene uses meters and the Three.js mapping:

```text
UE (X, Y, Z) -> Three (X, Z, -Y)
UE WorldXY    -> Three (world.x, -world.z)
UE scale cm   -> Three scale meters = scale / 100
```

All world-projected textures must use that conversion. Do not use Three `world.xy` as a substitute for UE WorldXY.

### Mesh attributes

The GLB contains the authored channels needed by the graphs; they must not be synthesized from UV0:

- `TEXCOORD_0`: ordinary card, bark, leaf-mask, and texture UVs;
- `TEXCOORD_2`: authored leaf/grass linear-gradient coordinate;
- `COLOR_0.r`: WPO weight for `M_Leaves`, component-wise WPO mask for `M_Foliage`, and leaf selector in `M_TreeSingleMat`;
- `COLOR_0.g`: optional vertex-painted moss/snow mask in `M_Bark` only;
- per-instance random: required by `MF_HueVariance`, random roughness, and tree sway;
- per-instance fade: required by the masked temporal-dither path.

`Demonstration_SnowPines.glb` includes `TEXCOORD_2` on 46 primitives. Falling back to `uv().y` changes gradients even if the material parameters are correct.

### Texture color space and channels

Honor the exported texture manifest exactly. In particular, several data-like masks were authored/imported as sRGB and Unreal samples their decoded values. “Correcting” them to linear changes thresholds and wind/height distributions.

| Texture role | Authored color space/compression | Shader channel |
| --- | --- | --- |
| `FoliageSheet_BC` | sRGB, Default, RGBA | RGB color, A opacity |
| `FoliageSheet_Emissive` | sRGB, Default | RGB emission |
| `T_Leaf_*` masks | usually sRGB, Default | R alpha mask |
| leaf subsurface textures | sRGB, Default | RGB color multiplier |
| leaf basic-color textures | sRGB, Default | RGB replacement color |
| bark diffuse textures | sRGB, Default | RGB |
| bark normal textures | linear, `TC_NORMALMAP` | RGB tangent-space normal |
| bark roughness textures | authored sRGB, Default | R |
| snow base-color texture | sRGB, Default | RGB |
| wind/height/grey/noise masks | authored sRGB, Default | R unless graph says otherwise |

All sampled textures use Wrap addressing in the supplied manifest. Instance vector parameters are already linear color values; do not apply an sRGB decode to the numeric vectors.

`soStylizedSourceLibrary.loadTexture()` already reads the manifest color-space and address metadata. The material builders must preserve that behavior.

## Shared material functions

### `MF_HueVariance`

This function performs a real hue rotation; it is not a luminance multiplier.

```text
seed = fmod(
  PerInstanceRandom
  + ActorPositionWS.x * 0.713145
  + ActorPositionWS.y * 0.713145,
  1.0
)

s = sin(2 * PI * seed)       // UE Sine period = 1
signedCube = s * abs(s) * abs(s)
hueAmount = signedCube * HueVariation + HueShift
result = UE_HueShift(inputRGB, hueAmount)
```

The actor-position inputs are Unreal X/Y; after conversion use Three `object/instance world x` and `-world z`, with a stable value per actor/instance. A path-name hash is not equivalent because it produces one value for every copy of a material.

### SnowPines material-parameter-collection defaults

The fixed scene baseline resolves the shared environment values below. These values must be uniforms shared across material instances; they are not per-material tuning knobs.

| MPC value | Baseline |
| --- | ---: |
| `Global Wind Intensity` | `1.2` |
| `Global Wind Angle` | `.2` |
| `Global Wind Speed` | `1` |
| `Global Sway Speed` | `.25` |
| `Global Sway Damping` | `.5` |
| `Global Sway Lean` | `3` |
| `Weather Wind Multiplier` | `1` |
| `Current Time` | `0` for the frozen comparison |
| `Day Cycle Progress` | `0` |
| `Overcast` | `0` |
| rain strength, wetness, and puddles | `0` |

The runtime also needs the source player/camera position inputs for interaction and camera occlusion. For a frozen comparison, disable those behaviors only through their resolved material switches or place the player/camera inputs so their masks evaluate to one; do not silently omit the graph terms.

### Five-point day-cycle interpolation

`MF_Lerp_Five_Float1` and `MF_Lerp_Five_Float3` implement a looping five-value interpolation. For normalized `t = fmod(DayCycleProgress, 1)`:

```text
x = t * 4
r = lerp(A, B, saturate(x))
r = lerp(r, C, saturate(x - 1))
r = lerp(r, D, saturate(x - 2))
r = lerp(r, E, saturate(x - 3))
```

For a looping day profile the five inputs are `[Day, Sunset, Night, Sunrise, Day]`.

`MF_DayCycleEmission` behavior is:

```text
cycle = lerpFive(
  DayEmissionMultiplier,
  SunsetEmissionMultiplier,
  NightEmissionMultiplier,
  SunriseEmissionMultiplier,
  DayEmissionMultiplier,
  DayCycleProgress
)
weatherMultiplier = lerp(cycle, OvercastEmissionMultiplier, Overcast)

UseDayCycleEmission ? InputColor * weatherMultiplier : InputColor
```

The false branch is pass-through, not black. The parent graph is responsible for multiplying its input by `Emissive Strength` and any emissive texture before this function.

### `MF_Occlusion`

The visible pass combines the camera/player screen-space sphere mask, scene-depth comparison, and camera-depth fade. Its shadow output is hard-wired through `ShadowReplace` to `1`, so the camera/player visibility feature never punches holes in cast shadows. `IsPlaying` also makes the occlusion behavior editor-aware.

Porting requirement:

- expose a visible-pass occlusion scalar;
- expose a shadow-pass scalar of exactly `1`;
- do not reuse one generic opacity expression for both passes;
- when runtime player/camera occlusion is intentionally disabled for a static comparison, use `1`, not a new stylized fade.

### Foliage temporal dither and spatial culling

Both masked families use `DitherTemporalAA`, not alpha-to-coverage, for per-instance fades. At the shader level:

```text
dither = DitherTemporalAA(PerInstanceFadeAmount * OpacityMultiply) // leaves
dither = DitherTemporalAA(PerInstanceFadeAmount)                   // foliage
```

When `SpatialCulling?` is enabled, the mask is also multiplied by:

```text
1 - RVT_LandscapeHeight.Specular(ObjectPositionWS)
```

The material clip threshold is Unreal’s default masked threshold, `1/3`.

The live source path now evaluates the exported UE 5.8 `DitherTemporalAA`
graph with its exact 64x64 engine noise texture, `View.TemporalSampleIndex`,
and `1/3` clip in both visible and shadow passes. It also uses the source
eight-sample Halton jitter. The remaining compatibility inputs are explicit:

- RVT height fallback = `0`, hence spatial multiplier = `1`;
- fully visible instance fade = `1`;
- the same base texture silhouette in visible and shadow passes, except for the documented `ShadowReplace` branches.

The active UE Gen4 `MainUpsampling / High` resolve now follows the exact
jitter/material stage: nine-tap polynomial/HDR current filtering, YCoCg
sample-distance clamping, five-fetch Catmull-Rom history, `.04` source weight,
and velocity reprojection are bound. Responsive-AA stencil classification,
encoded primitive-mobility ownership, exact half precision, and changing
pre-exposure remain renderer boundaries. Evaluated `PerInstanceFadeAmount`
values must also be exported before cull/LOD fades can be compared rather than
held at `1`.

Do not enable `alphaToCoverage` as an unrequested replacement. It changes card edges based on MSAA state and is not the authored UE masked path.

### `MF_FoliageWind`

The grass/foliage graph calls UE `SimpleGrassWind`. Its intensity is:

```text
depthFade = saturate(remap(PixelDepth, 3000, WindFadeoutDistance, 1, 0))
weatherWind = lerp(1, WeatherWindMultiplier, RainWindStrength)
intensity = WindIntensity * weatherWind * depthFade
WPO = SimpleGrassWind(intensity, WindWeight, WindSpeed, AdditionalWPO)
```

The static switch `UseWind?` selects that result or zero. The exact UE `SimpleGrassWind` phase/weight behavior must be ported as a named function; a pair of arbitrary sines is not interchangeable.

### `MF_WindColor`

Wind color is a spatial moving noise field used by `M_Foliage`; it is not just geometry sway.

```text
p = UE_WorldXY / WindSize
p = rotate(p, GlobalWindAngle)
uvA = p + Time * GlobalWindSpeed * (0.04, 0.04)
uvB = p + Time * GlobalWindSpeed * (0.06, 0.02)
noise = NoiseWind.r(uvA) * NoiseSmooth.r(uvB * (MaskSize, 0.6 * MaskSize))
windColor = noise * (WindMask * WindMaskMultiply) * saturate(Time)
```

The exact panner and scale connections in `material-source/manifest.json` should be retained in the implementation helper. `UseWindColor?` selects this field or zero.

### `MF_FoliageInteraction`

The interaction displacement uses the global player position and a randomized world-noise direction:

```text
toPixel = WorldPositionWS - PlayerPositionWS
distance = length(toPixel)
radialDirection = normalize(toPixel)
noiseDirection = normalize(sampledWorldNoiseDirection)
direction = normalize(lerp(radialDirection, noiseDirection, Randomness))
direction.z += ZFactor + ZOffset

falloff = pow(
  1 - min(distance, InteractionDistance) / InteractionDistance,
  InteractionFalloff
)
strength = remap(falloff, 0, 1, 0, InteractionStrength)
WPO = direction * strength
```

`UseFoliageInteraction?` switches the function. In Three coordinates the UE Z component maps to Three Y.

### `MF_TreeSway`

Tree sway is a pivot rotation, not a translation of all vertices by the same sine. The supplied function includes:

- Object Pivot Point / Actor Position world-space math;
- direction derived from `sin/cos(GlobalWindAngle + 0.5)`;
- global intensity scaling by `0.002`;
- per-instance random amplitude remapped to approximately `0.75..1.5`;
- camera-distance fade between `Sway Begin Distance` and `Sway End Distance`;
- `Weather Wind Multiplier`;
- the global damping cycle and global sway speed;
- player-proximity sway reduction;
- `RotateAboutAxis` around the object pivot;
- a final relative-world-position weight scaled by `/1000`.

This function needs a dedicated port that preserves actor/instance pivot data. The current generic `windOffset()` does not have the inputs required to reproduce it.

## `M_Leaves` exact graph

### Material settings

```text
Blend mode:      Masked
Shading model:   Subsurface
Two-sided:       true
Opacity clip:    1/3
```

### Color

1. Resolve `Main Color` and `Gradient Color`, or their selected `Curve_Leaves_Atlas` rows when `UseCurveColor?` is enabled.
2. Resolve the gradient mask from either the authored linear gradient or the world-gradient branch:

   ```text
   authoredGradient = CheapContrast(TEXCOORD_2.v + GradientOffset, GradientContrast)
   gradientColor = lerp(MainColor, GradientColor, gradientMask)
   ```

3. `UseGradient?` chooses the gradient result or `Main Color`.
4. `UseColorTexture?` replaces that result with `Basic Color Texture.rgb`; it does not multiply it.
5. Apply `MF_HueVariance`, which runs UE HueShift using the per-instance/actor seed described above.

Vertex color is not a color multiplier in this graph.

### Roughness, normal, and specular

```text
roughness = UseRoughnessMap?
  ? RoughnessMap.r * Roughness
  : Roughness

specular = Specular
normal = TwoSidedNormals?
  ? float3(0, 0, 1) * TwoSidedSign
  : float3(0, 0, 1)
```

This is the material-graph output, not the final UE world normal. UE 5.8
`MaterialTemplate.ush` transforms the tangent normal and then applies
`Parameters.WorldNormal *= Parameters.TwoSidedSign`. With the default
`TwoSidedNormals? = true`, the graph sign and material-boundary sign therefore
cancel. The final result is the authored geometric normal on both sides of a
leaf card. ToonLab must not apply only the graph sign; doing so turns visible
backfaces toward the camera/light and over-brightens the canopy. The audited UE
5.8 `MaterialTemplate.ush` SHA-256 is
`2d237cc8c53a024341a6a3828a251a655fbc9a266c0a2d7ed7e244be90bf292d`.

For the retained P16 `SM_Pine01` actor, `PerInstanceFadeAmount` and the
`MI_PineLeaves` `Opacity Multiply` parameter are both exactly `1`. The Unreal
Visual Target is captured after its temporal history has warmed, whereas the
P16 browser comparison intentionally has no temporal-AA resolve. Rendering one
literal `DitherTemporalAA(1)` frame in that viewport modulates gray texels in
the generated pine-mask mips and exposes a striped screen-door pattern on
oblique leaf cards. P16 therefore specializes this known, non-fading case to
the analytic full-visibility result `1`; profiles with a fade value below one
continue through the literal source dither function. This is a renderer-boundary
resolve, not an authored opacity or silhouette adjustment.

The close-range P16 audit exposed a second, independent screen pattern. The
comparison harness was still rendering its one-tap `BasicShadowMap`, while the
source demo declares `r.Shadow.FilterMethod=0`, `r.ShadowQuality=5`,
`r.Shadow.MaxCSMResolution=2048`, `r.Shadow.CSMDepthBias=10`,
`r.Shadow.CSMSlopeScaleDepthBias=3`, and `r.Shadow.CSMReceiverBias=0`. P16 now
uses the existing literal UE `Manual5x5PCF` receiver adapter at 2048 resolution
with the source DirectionalLight's `Shadow Bias=.5` and `Shadow Slope Bias=.5`.
This is a P16 harness correction; it does not change the leaf texture, color
graph, alpha clip, normal, or any P14/P15 material.

### Subsurface and emission

```text
ssBase = UseTexturedSS?
  ? BaseColor * SubsurfaceTexture.rgb
  : BaseColor

SubsurfaceColor = ssBase * SSStrength
  * lerpFive(1, 0.5, 0.4, 0.5, 1, DayCycleProgress)

Opacity = SSOpacity
  * lerpFive(1, 2, 3, 2, 1, DayCycleProgress)

emissiveInput = BaseColor * EmissiveStrength
if UseEmissiveMap?: emissiveInput *= EmissiveMap.rgb
EmissiveColor = MF_DayCycleEmission(emissiveInput)
```

Unreal Subsurface’s `SubsurfaceColor` plus masked-material `Opacity` is the intended lighting contract. The live source path no longer uses Three’s unrelated experimental half-vector thickness lobe. `ueSourceSubsurfaceLighting.js` consumes these exact graph outputs and evaluates the UE 5.8 legacy `MSM_SUBSURFACE` direct and indirect equations described in the renderer section below.

UE stores opaque surface visibility and subsurface transmission in separate
light-attenuation channels. WebGPU's stock Three light node exposes only the
opaque surface value to a material lighting model. Reusing that binary value
for both channels made overlapping pine cards read as dark green stripes. For
the retained zero-thickness P16 cards, the adapter now reconstructs a distinct
transmission visibility from unshadowed direct radiance using the authored
`SS Opacity=.3` as the coupling amount:

```text
TransmissionVisibility = lerp(1, SurfaceVisibility, SSOpacity)
```

This keeps cast-shadow influence and uses a source-owned parameter. It is
explicitly a thin-card renderer fallback, not a replacement for UE's
unavailable shadow-map thickness channel.

### Visible and shadow mask

```text
leafMask = LeafTexture.r * MF_Occlusion.visible

if CullPerpendicular?:
  geometricNormal = normalize(ddx(WorldPosition) x ddy(WorldPosition))
  perpendicular = dot(geometricNormal, CameraVectorWS) + PerpendicularTrim
  visibleBase = leafMask * perpendicular
  shadowBase = LeafTexture.r                 // ShadowReplace bypasses both trims
else:
  visibleBase = leafMask
  shadowBase = LeafTexture.r

visibleMask = visibleBase
  * DitherTemporalAA(PerInstanceFade * OpacityMultiply)
  * spatialCull

shadowMask = shadowBase
  * DitherTemporalAA(PerInstanceFade * OpacityMultiply)
  * spatialCull
```

The source deliberately keeps the alpha texture silhouette in shadow while bypassing camera occlusion and perpendicular camera trimming. A solid-quad shadow is incorrect; a shadow removed with the visible camera fade is also incorrect.

### WPO

```text
WPO = FoliageWind * VertexColor.r
    + FoliageInteraction
    + TreeSway
```

Each term has its own static switch. LOD instances do not all disable the same switches, so switches must come from the resolved instance profile rather than from a blanket LOD policy.

### Key SnowPines leaf profiles

The values below are resolved instance overrides; unspecified switches/values inherit from the parent.

| Instance | Main / gradient linear color | Important settings |
| --- | --- | --- |
| `MI_PineLeaves` | `[.041,.136,.015]` / `[.076,.198,.017]` | gradient on; `T_Leaf_Pine`; textured SS `T_Leaf_Pine_SS`; emissive `.25`; SS `.8`; SS opacity `.3`; hue variation `.1`; foliage wind and tree sway on |
| `MI_PineLeaves_Cold` | `[.112,.202,.020]` / `[.440,.533,.250]` | gradient on; hue variation `.08`; pine mask/SS family |
| `MI_PineLeaves_Snow` | `[.103,.205,.287]` / `[.722,.893,.964]` | gradient on; `T_Leaf_Pine`; textured SS off; emissive `.25`; SS `.8`; SS opacity `.3`; hue variation `.03` |
| `MI_PineLeafy` | authored color texture | `T_Leaf_PineLeafy`; `UseColorTexture?` on; gradient off; textured SS off; emissive `.5`; SS `.5`; SS opacity `.1` |
| `MI_OakLeaves_Snow` | `[.063,.133,.262]` / `[.552,.644,.730]` | gradient on; textured SS off; emissive `.1`; SS `.6`; SS opacity `.1` |
| `MI_BushLeaves` | `[.038,.188,.053]` | gradient off; `T_Leaf_Bush`; textured SS on; SS `.8`; opacity `.25`; hue `.04`; wind on; tree sway off; spatial culling on |
| `MI_BushLeavesLight` | `[.124,.276,.037]` | gradient off; SS `.8`; opacity `.25` |
| `MI_BushLeaves_Snow` | `[.241,.373,.594]` / `[.857,.865,.847]` | gradient on; SS `.8`; opacity `.25` |
| `MI_BushLeavesDry` | `[.297,.233,.113]` / `[.344,.262,.070]` | gradient on; SS `.5`; opacity `.1`; emissive `.07` |
| `MI_BushSnowDead` | authored `T_Leaf_BushSnowDead_BC` | basic color texture replaces color; `T_Leaf_BushSnowDead` mask; textured SS off; emissive `.15`; SS `.1`; opacity `.128`; spatial culling off |

The “snow” leaf materials above are recolored leaf-card instances. They do not run bark’s directional snow projection.

## `M_Foliage` exact graph

### Material settings

```text
Blend mode:      Masked
Shading model:   Subsurface
Two-sided:       true
Opacity clip:    1/3
```

### Color for texture foliage

```text
base = FoliageTexture.rgb * TextureTint
windBoosted = base * WindColorBoost
color = lerp(base, windBoosted, MF_WindColor)
```

The foliage texture’s alpha is the opacity mask.

### Color for untextured grass-like foliage

Root color resolves in this order:

```text
if UseRVTColor?:
  root = RVT.BaseColor
else if UseBinaryColor?:
  root = lerp(OffgrassColor, BaseColor, RVT.Roughness /* GrassMask */)
else if UseColorMap?:
  root = ColorMap.rgb * ColormapMultiply
else:
  root = BaseColor
```

`ColormapMultiply` is a scalar multiplication of the sampled map. It is not a blend weight between `BaseColor` and the map.

The tip branch is:

```text
if CurveColoredTips?:
  hueU = HueTexture.r(UE_WorldXY / HueVarianceScale)
  tip = sampleCurveAtlasRow(Curve_Grass_Atlas, GrassColorCurve, hueU)
else:
  tip = root + TipBrightness
  tip = Desaturation(tip, TipDesaturation)
  tip = UE_HueShift(tip, TipHueShift)

tip  = lerp(tip,  tip  * WindColorBoost, MF_WindColor)
root = lerp(root, root * WindColorBoost, MF_WindColor)

localColor = lerp(tip, root, TEXCOORD_2.v)
BaseColor = MF_HueVariance(localColor)
```

No vertex-color channel multiplies BaseColor.

### Other material fields

```text
Roughness = lerp(Roughness, Roughness * RandomRoughness, PerInstanceRandom)

localSpecular = lerp(Specular, Specular * 3, MF_WindColor)
Specular = UseRVTColor?
  ? lerp(localSpecular, RVT.Specular, TEXCOORD_2.v)
  : localSpecular

Metallic = Metallic
Normal = TwoSidedNormals? float3(0,0,1) * TwoSidedSign : float3(0,0,1)
SubsurfaceColor = BaseColor * SSStrength
Opacity = SSOpacity

emissiveInput = BaseColor * EmissiveStrength
if UseEmissiveMap?: emissiveInput *= EmissiveMap.rgb
EmissiveColor = MF_DayCycleEmission(emissiveInput)
```

Unlike `M_Leaves`, `M_Foliage` does not apply the extra `[1,.5,.4,.5,1]` subsurface-color or `[1,2,3,2,1]` opacity day-cycle curves.

### Opacity and shadow mask

```text
baseMask = UseTexture? ? FoliageTexture.a : 1

visibleMask = baseMask
  * MF_Occlusion.visible
  * DitherTemporalAA(PerInstanceFade)
  * spatialCull

shadowMask = baseMask
  * 1                                  // MF_Occlusion ShadowReplace
  * DitherTemporalAA(PerInstanceFade)
  * spatialCull
```

Untextured grass still participates in the masked/dither path even though `baseMask` is one. A component’s “Cast Shadow” flag is separate from this material shadow mask.

### WPO

```text
heightNoise = HeightTexture.r(UE_WorldXY / HeightTextureScale)
height = lerp(HeightMin, HeightMax, heightNoise) // centimeters
heightWPO = float3(0, 0, height)

windWPO = MF_FoliageWind()
windColorWPO = AdditionalWindColorWPO * MF_WindColor
interactionWPO = MF_FoliageInteraction()

wpo = heightWPO + windWPO + windColorWPO + AdditionalXYZ + interactionWPO

if ShrinkOffgrassFoliage?:
  wpo *= lerp(OffgrassHeight, 1, pow(GrassMask, 3))

wpo.z *= FinalZMultiply
wpo *= VertexColor.rgb                  // component-wise WPO mask
```

Convert the final UE XYZ displacement to Three XYZ after doing the graph math in UE coordinates. Using `uv.y` as wind weight is not equivalent to the component-wise vertex-color mask.

### Key SnowPines grass profiles

| Instance | Key values and switches |
| --- | --- |
| `MI_Grass` | Base `[.173,.318,.053]`; no foliage texture; RVT color on; colormap off; SS `0`; SS opacity `1`; specular `.04`; roughness `.5`; height `20..60 cm`; Additional XYZ `[-15,-5,10] cm`; shrink off-grass on, height `-.6`; random roughness `1.3`; wind intensity `1.5`; interaction distance `120`, strength `250` |
| `MI_Grass_NoRVT` | Base `[.148,.292,.037]`; RVT off; color map on; `ColormapVol1`; map size `50000 cm`; map multiply `.544`; same height/wind baseline; shrink off-grass off |
| `MI_GrassSnow_NoRVT` | Base `[.675,.684,.734]`; RVT off; color map off in the resolved asset instance; off-grass height `.5`; shrink on |

The SnowPines level contains slot overrides that can differ from the material named in a glTF static-mesh slot. `sourceSceneProfile()` currently substitutes `T_Grass_ColormapSnow` for a level-compatibility path. That substitution must be verified against the actor/component override in `Demonstration_SnowPines.json`; it is not an intrinsic `MI_GrassSnow_NoRVT` material setting.

LOD switches are authored per instance:

- LOD1 commonly disables foliage interaction; some snow LOD1 variants also disable camera occlusion.
- LOD2 commonly disables interaction and wind and sets wind-color WPO to zero.
- The pattern is not universal; resolve the inherited parent and instance switches exactly.

### Other relevant foliage instances

| Instance | Distinguishing values |
| --- | --- |
| `MI_Daffodils` | texture foliage; SS `.5`; wind `.8`; interaction distance `80`, strength `75` |
| `MI_Daisy` | texture foliage; SS `.3`; wind color on; wind `.8`; interaction `80/75` |
| `MI_ElephantEars` | roughness `.25`; SS `.2`; emissive `.1`; hue variation `.07`; wind `.5` |
| `MI_Ferns` | roughness `.5`; SS `.3`; hue variation `.06`; wind `1` |
| `MI_FlowerCrocus` | SS `.1`; SS opacity `1`; emissive `.1`; wind `.1` |
| `MI_FlowersIce` | emissive strength `6`; emissive map on; day-cycle-emission switch off, therefore emissive input passes through; camera occlusion off; SS `.1`; interaction strength `10` |
| `MI_Foxtails` | roughness `.75`; SS `.3`; wind `.4` |

### P17 retained SnowPines daisies

P17 records the exported `InstancedFoliageActor_0` metadata without expanding
it into the compact parity scene. `FoliageInstancedStaticMeshComponent_96`
owns `1,364` `SM_Flower_Daisies1` instances in the complete level. Exactly
`93` origins fall inside the retained 64 m CameraRender1 XY patch; `25` were
authored on omitted rocks/cliffs, leaving a full-scene reconstruction inventory
of `68` Landscape-supported instances.

The comparison population is intentionally separate and immutable. Unity,
Unreal, ToonLab, and Visual Target each render one source LOD0 daisy clump at
the position and scale stored in the shared P13 capture contract. The fixture
receives shadows but does not cast them, matching both native capture builders;
rock, tree, grass, and terrain hard shadows remain unchanged. Its root height
and surface normal are sampled from the active terrain at runtime. This avoids
both floating foliage and the previous invalid comparison of 68 shadow-casting
clumps against one native clump. The complete source inventory, exclusion
indices, height deltas, component flags, WPO evaluation, comparison fixture,
and LOD0 mesh audit remain recorded in
`assets-local/sostylized/foliage/p17-ue-daisy-contract.json`.

The resolved `MI_Daisy` graph is not an RVT-colored grass substitute:

- `UseTexture? = true` selects `T_FoliageSheet_BC.rgb` and its alpha mask.
- `UseRVTColor? = true` still blends the Landscape RVT surface/specular field
  by `TEXCOORD_2.v`; it does not replace the flower texture's base color.
- `COLOR_0.rgb` remains the component-wise WPO mask and is never multiplied
  into Base Color.
- Masked visibility and cast-shadow visibility use
  `T_FoliageSheet_BC.a > 1/3`.
- `SS Strength=.3` and `SS Opacity=.08` drive UE Subsurface transmission; the
  binary surface mask is not reused as optical thickness.
- The retained component has no cull distance and receives
  `PerInstanceFadeAmount=1`, so a deterministic checkpoint uses the analytic
  warmed-TAA full-visibility result rather than exposing one dither frame.

This is the only mutable family at P17. P14 ground, P15 grass, P16 pine,
lighting, sky/clouds, rock, camera, and post processing remain frozen.

## `M_Bark` exact graph

### Material settings

```text
Blend mode:      Opaque
Shading model:   Default Lit
Two-sided:       false
```

Bark must not use the foliage SSS lighting model.

### Base bark fields

```text
barkUV = TEXCOORD_0 * float2(XScale, YScale)
rawBase = lerp(DiffuseTexture.rgb, TintColor, TintMix)
base = HueVariance? ? UE_HueShift(rawBase, MF_HueVariance()) : rawBase
roughness = RoughTexture.r * RoughMult
normal = FlattenNormal(NormalTexture.rgb, NormalFlatness)
specular = Specular
metallic = 0
WPO = MF_TreeSway()
```

`TintMix` blends toward the tint color itself. It does not multiply the diffuse texture by the tint. When `HueVariance?` is enabled, bark uses the same per-instance/actor hue seed as the leaf and foliage graphs.

UE `FlattenNormal` scales the tangent-space normal’s XY contribution and reconstructs/normalizes Z. Mixing a view-space normal with a tangent-space sampled normal is not the same operation.

### Moss layer

Moss uses genuine UE WorldAlignedTexture/triplanar projection at `Moss Size` centimeters. The noise drives both a two-color moss surface and material fields:

```text
mossNoise = WorldAlignedTexture(MossTexture, MossSize).r
mossColor = lerp(MossColor2, MossColor1, pow/saturate(mossNoise))
mossRoughness = saturate(mossNoise * MossRoughness)
mossSpecular = MossSpecular

if MossWorldAligned?:
  directionMask = saturate(
    dot(PixelNormalWS, MossDirection) * MossSharpness - MossOffset
  )
else:
  directionMask = VertexColor.g

mossMask = Moss?
  * pow(saturate(mossNoise) * MossMultiply * directionMask, 2)
```

The exponent is the UE Power-node default (`2`) where no instance override is connected. `M_Bark` reads and blends the moss function's BaseColor, Roughness, Specular, and Emissive outputs. Bark normal remains the flattened bark normal. Moss is not only a green color overlay.

Moss emission starts from the moss base color times `Moss Emissive Strength`; optional world-aligned emissive texture and `Emissive Tint` then feed the shared day-cycle emission function.

### Snow layer

Bark snow uses planar UE WorldXY projection for the snow base texture, not triplanar projection:

```text
snowUV = UE_WorldXY / SnowScale
snowBase = SnowTexture.rgb(snowUV)

if SnowWorldAligned?:
  snowMask = saturate(
    dot(PixelNormalWS, SnowDirection) * SnowSharpness - SnowOffset
  )
else:
  snowMask = VertexColor.g
```

When `Snow?` is false, the mask is zero. The snow function constructs the following material attributes:

```text
BaseColor = snowBase
Normal = flat snow normal
Roughness = SnowRoughness
Specular = lerp(
  SnowSpecularMin,
  SnowSpecularMax,
  T_ChromaNoise_Blurred.r(UE_WorldXY / SnowSpecularScale)
)
Metallic = 0
Emissive = day/weather processed snow emission
```

Optional sparkle layers further modify the snow result. In this specific `M_Bark` parent, the graph extracts and blends snow BaseColor, Roughness, Specular, and Emissive separately. It does **not** extract the snow function's flat Normal output, so the final normal remains the flattened bark normal. This parent wiring, rather than the nominal set of fields emitted by `MF_Snow`, is the implementation contract.

### Rain wetness

After moss/snow composition, `MF_RainWetness` modifies base color, specular, roughness, emissive, and normal using the global `Rain Wetness` and `Rain Puddles` masks. It also includes fake reflection and splatter branches. Baseline SnowPines globals have rain at zero, so this path should be visually neutral in the fixed comparison, but it must not be replaced by a two-field darken/roughness approximation for the general shader port.

Leaves and `M_Foliage` do not call this bark wet-surface function. Applying rain wetness to every material because a switch lookup defaults to true is incorrect.

### Key SnowPines bark profiles

| Instance | Key values and switches |
| --- | --- |
| `MI_PineBark` | pine diffuse; tint `[.938,.375,0]`; tint mix `.15`; normal flatness `0`; specular `.04`; emissive `.15`; moss off; snow off |
| `MI_PineBark_Snow` | tint `[.12,.12,.12]`; tint mix `.5`; snow on; world-aligned mask on; snow offset `.2`; sharpness `10`; emissive `.2` |
| `MI_PineSnow` | snow on; vertex-painted snow mask (`SnowWorldAligned?` off); snow emission `.3`; overcast emission multiplier `.4`; rain wetness off |
| `MI_PineBarkMiscSnow` | misc pine diffuse; tint `[.255,.176,.124]`; tint mix `.15`; snow on; offset `-.085`; sharpness `8` |
| `MI_PineBarkMiscMossWorld` | moss on; world-aligned moss mask |
| `MI_PineBarkMossVertex` | moss on; `VertexColor.g` moss mask |
| `MI_OakBark` | tint `[.231,.168,.065]`; tint mix `.5`; normal flatness `.5` |
| `MI_OakBarkSnow` | tint `[.3,.3,.3]`; tint mix `.3`; snow offset `.5`; sharpness `8` |

Do not infer all LOD switches from the suffix. Some bark LODs disable tree sway, weather wetness, or sparkles independently; use the fully resolved material instance.

## `M_TreeSingleMat` exact graph

This is not the same graph as either bark or leaf cards. It is the combined far-tree LOD material.

### Material settings

```text
Blend mode:      Masked
Shading model:   Subsurface
Two-sided:       true
Opacity clip:    1/3
WPO:             none
```

### Graph

```text
leafSelector = VertexColor.r

leafGradient = CheapContrast(TEXCOORD_2.v + GradientOffset, GradientContrast)
leafColor = UseGradient?
  ? lerp(LeafColor, LeafGradientColor, leafGradient)
  : LeafColor
leafColor = MF_HueVariance(leafColor)
if UseTexture?: leafColor = LeafTexture.rgb

barkColor = BarkColor
if Snow?:
  barkSnow = saturate(VertexNormalWS.z * SnowSharpness)
  barkColor = lerp(BarkColor, SnowColor, barkSnow)

BaseColor = lerp(barkColor, leafColor, leafSelector)
OpacityMask = lerp(1, FilledLeafTexture.r, leafSelector)

SubsurfaceColor = BaseColor * SSStrength
if UseTexturedSS?: SubsurfaceColor *= SSTexture.rgb
Opacity = lerp(1, SSOpacity, leafSelector)

Normal = TwoSidedNormals? float3(0,0,1) * TwoSidedSign : float3(0,0,1)
EmissiveColor = MF_DayCycleEmission(BaseColor * EmissiveStrength)
```

The shadow mask uses the same bark-solid/leaf-texture interpolation and clip threshold. `Filled Leaf Texture` is required even when no RGB leaf texture is used.

### Key combined-tree profiles

| Profile | Bark / leaves | Important settings |
| --- | --- | --- |
| Regular pine | bark `[.234,.129,.080]`; leaf `[.041,.136,.015]`; gradient `[.076,.198,.017]` | filled pine mask; pine SS RGB; gradient on; emissive `.2`; SS `.8`; opacity `.3`; hue `.1` |
| Snow pine | bark `[.146,.089,.073]`; leaf `[.120,.212,.287]`; gradient `[.665,.823,.888]` | filled pine mask; Snow on; emissive `.03`; SS `1.431`; opacity `.3`; hue `.03` |
| Cold pine | bark `[.234,.142,.117]`; leaf `[.112,.202,.020]`; gradient `[.440,.533,.250]` | emissive `.2`; SS `.5`; opacity `.08`; hue `.08` |
| Leafy snow pine | bark `[.234,.206,.196]`; leaf `[.229,.140,.098]`; gradient `[.791,.865,.680]` | filled pine-leafy mask; gradient off; no bark snow switch; emissive `.03` |
| Snow oak | bark `[.146,.115,.105]`; leaf `[.063,.133,.262]`; gradient `[.552,.644,.730]` | filled deciduous mask; Snow on; emissive `.03` |

## Current ToonLab discrepancies

The line references below describe the audited revision of `src/environment/soStylizedSourceMaterials.js`.

| Current area | Concrete discrepancy | Required correction |
| --- | --- | --- |
| `sourceEmission()`, lines 169-175 | Uses only day/overcast and returns black when `UseDayCycleEmission?` is false. | Port five-point day/sunset/night/sunrise/day interpolation. False switch must pass input through. This is critical for `MI_FlowersIce`. |
| `configureSourceSubsurface()`, 177-198 | Treats emission day/overcast values as SSS modulation and maps every family to arbitrary Three thickness constants. | Give leaf, foliage, and combined-tree graphs separate SS input builders. Preserve leaf-only SS day curves and RGB SS texture. Treat backend SSS calibration as a renderer translation layer, not graph logic. |
| `windOffset()`, 201-240 | One generic two-sine translation; uses UV Y; omits SimpleGrassWind, TreeSway pivot rotation, wind color, weather, camera fade, player interaction, per-instance random, and vertex masks. | Implement named `foliageWind`, `windColor`, `foliageInteraction`, and `treeSway` helpers with the correct attributes and coordinate spaces. |
| `buildLeaves()`, 341-375 | Uses UV0 for gradient, fixed material-path random, brightness scaling instead of hue rotation, and VertexColor.r as a color multiplier. | Use `TEXCOORD_2.v`; implement exact `MF_HueVariance` per instance; remove vertex color from BaseColor. |
| `buildLeaves()` masked path | Exact UE `DitherTemporalAA`, the `1/3` clip, separate visible/shadow masks, and no alpha-to-coverage are now bound. `PerInstanceFadeAmount` is fixed at fully-visible `1`; RVT spatial culling and runtime camera/player occlusion inputs remain unavailable. | Export evaluated per-instance fade and RVT/occlusion inputs, then validate the exact mask phase against UE at the same output resolution and temporal sample. |
| `buildFoliage()`, 421-460 | Colormap is mixed rather than multiplied; tip/root order and gradient are changed; UV0/VertexColor.g replaces UV2; RVT root behavior is approximate; VertexColor.r changes color. | Rebuild the graph in the documented branch order and reserve VertexColor.rgb for WPO. Use an explicit RVT compatibility input. |
| `buildFoliage()`, 462-481 | Roughness map behavior does not match graph; no per-instance roughness; specular lacks wind/RVT logic; bark wetness is applied; no alpha/dither/spatial/shadow path for untextured foliage; generic wind. | Port the exact material fields and masked path regardless of `UseTexture?`; implement authored WPO. |
| `sourceProfileCastsShadow()`, 132-136 | Globally suppresses grass shadow based on material-path regex. | Keep component/FoliageType cast-shadow policy separate from the material’s shadow mask. Resolve the actual level/component setting when matching the scene. |
| `buildBark()`, 496-546 | Tint multiplies diffuse instead of replacing by lerp; bark hue variance is absent; moss/snow projection and masks differ; snow is triplanar instead of WorldXY planar; only color is layered; normal flattening differs; uses `MeshSSSNodeMaterial`. | Use opaque one-sided Default Lit/physical material; port the parent graph's bark/moss/snow/wetness fields and exact projection/masks. |
| `buildTreeLod()`, 554-593 | Loads no filled-leaf mask; uses VertexColor.g; uses UV0; has no alpha/shadow mask or bark snow; samples SS as R; constructs `MeshPhysicalNodeMaterial` and then assigns SSS-only properties that class does not implement. | Rebuild `M_TreeSingleMat` separately, using VertexColor.r, UV2, filled mask, complete masked shadow, snow, RGB SS, and a real SSS-capable backend. |
| masked materials generally | Leaves and foliage now disable alpha-to-coverage and use the exact engine clip/dither contract. Tree-LOD and unimplemented masked families still require individual graph audits and bindings. | Keep source-faithful masks on the shared UE temporal helper; do not reintroduce MSAA alpha-to-coverage as a substitute. |
| family defaults | `wetSurface()` defaults absent `RainWetness?` switches to true, so leaves/foliage receive a bark-only effect. | Only execute `MF_RainWetness` in graphs that actually call it. Missing graph switches must not invent features. |

### Renderer-model caveat

The source adapter is derived from UE 5.8 engine code, not from screenshot color tuning. The pinned sources and numerical oracle live in `scripts/verify-ue-source-foliage-lighting.mjs`.

Direct `MSM_SUBSURFACE` adds a transmission term to Default Lit:

```text
InScatter = pow(saturate(dot(L, -V)), 12) * lerp(3, 0.1, Opacity)
WrappedDiffuse = pow(saturate(dot(N,L) / 1.5 + 0.5 / 1.5), 1.5) * (2.5 / 1.5)
NormalContribution = lerp(1, WrappedDiffuse, Opacity)
BackScatter = GBufferAO * NormalContribution / (PI * 2)

extinction = -log(clamp(SubsurfaceColor, 1e-12, 1)) / 0.15
rawTransmitted = exp(-extinction * 1.0)
TransmittedColor = HSV(rawTransmitted.h, rawTransmitted.s, SubsurfaceColor.v)

Transmission = LightFalloff
  * lerp(BackScatter, 1, InScatter)
  * lerp(TransmittedColor, SubsurfaceColor, SubsurfaceTransmittance)
```

UE then accumulates that transmission through a separate `TransmissionShadow`; ordinary diffuse/specular use `SurfaceShadow`. Its directional-light attenuation buffer stores whole-scene surface shadow in X, whole-scene SSS shadow in Y, per-object surface/light-function shadow in Z, and per-object SSS shadow in W.

The indirect path is equally important for long cast shadows:

```text
DiffuseColorForIndirect = DiffuseColor + SubsurfaceColor
Indirect = (
    FrontIrradiance * DiffuseColorForIndirect
  + BackfaceIrradiance(-WorldNormal) * SubsurfaceColor
) * AOMultiBounce(BaseColor, DiffOcclusion)
```

The live adapter now implements the exact wrap/in-scatter expression, the default `0.15` Beer-Lambert/HSV transform, the extra front-facing subsurface energy, and captured-SkyLight SH evaluated at `-WorldNormal`. This is why foliage in a long cast shadow retains its authored green/seasonal hue while the illumination remains cool; no per-material shadow tint is introduced.

Three exposes only one surface-shadow visibility map to a material lighting model. Until the renderer supplies UE’s separate SSS depth/transmittance target, the adapter conservatively reuses surface visibility for direct transmission and uses the unshadowed receiver optical endpoint. A fully occluded caster therefore still removes all direct light—there is no artificial shadow floor or unshadowed transmission leak. Remaining genuine renderer gaps are:

- independent `TransmissionShadow` and `TransmittanceOrOpticalThickness` buffers derived from occluder distance and `SubsurfaceDensityFromOpacity`;
- UE’s colored `AOMultiBounce` response instead of Three’s scalar post-accumulation AO;
- UE Default Lit specular/area-light integration around the now-source-exact subsurface terms;
- buffer-precision and locked debug-buffer/pixel sign-off.

The supplied Unity graphs establish a different but consistent boundary. `S_Leaves` and `S_FoliageShader` are ordinary URP Universal Lit: direct lighting receives `distanceAttenuation * shadowAttenuation`, baked GI remains separate, material Occlusion is `1`, and leaf SSS is graph emission rather than a renderer shading model. The verifier pins those graph and generated-shader sources so Unity behavior cannot be used to invent an extra shadow tint in the UE path.

## Implementation order

1. Add an attribute adapter for UV2, vertex RGBA, per-instance random, per-instance fade, actor/object world origin, and object pivot. Fail loudly for a source material when a required authored attribute is absent.
2. Complete the remaining reusable UE-compatible functions: HueShift/HueVariance, five-point lerp/day-cycle emission, CheapContrast, `FlattenNormal`, and visible-versus-shadow mask selection. Reuse the now-exported exact temporal-dither helper.
3. Port `M_TreeSingleMat` first. It is the smallest complete test of UV2, vertex-red selection, masked shadows, subsurface, and snow color.
4. Port `M_Leaves`, including separate visible/shadow masks and exact RGB subsurface handling.
5. Port `M_Foliage` color/opacity first, then exact wind color, SimpleGrassWind, height, off-grass shrink, and player interaction.
6. Port `M_Bark` as Default Lit, then add moss/snow as full material layers, then add the rain/sparkle branches.
7. Resolve every SnowPines actor material override and LOD switch from the scene export. Do not infer behavior from names.
8. Only after graph parity, calibrate the single SSS renderer adapter against UE; do not retune the locked scene lighting to hide material errors.

## Acceptance checks

Use the same static camera, transforms, output resolution, exposure, sun, skylight/IBL, fog, and post-process settings in UE and the browser. Freeze wind and temporal jitter for the first comparisons.

Required material-isolation tests:

- a pine leaf card front-lit, back-lit, and viewed from the back side;
- the same card’s visible silhouette and cast-shadow silhouette;
- regular versus snow pine leaves using the same mesh and lighting;
- grass root/tip colors with a UV2 debug view;
- `MI_Grass_NoRVT` with the colormap result compared numerically at known world positions;
- `MI_FlowersIce` to verify false `UseDayCycleEmission?` is pass-through;
- regular and snowy bark on the same trunk with world-aligned and vertex-painted masks;
- a combined single-material tree with VertexColor.r and filled-leaf mask debug views;
- LOD transitions with wind disabled/enabled according to each resolved instance.

For each test capture BaseColor, roughness, specular, normal, emissive, opacity mask, subsurface color/opacity, WPO, and shadow mask as separate debug outputs before judging the final lit frame. If those buffers differ, changing the scene light is not a valid correction.

Source and runtime wiring gates:

```sh
node scripts/verify-ue-source-foliage-lighting.mjs
node scripts/verify-so-stylized-source-materials.mjs
npm run build
```
