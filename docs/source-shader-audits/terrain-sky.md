# So Stylized terrain, snow, sky, and cloud shader audit

## Scope and authority

This document is the implementation specification for the terrain and sky surfaces used by the supplied `Demonstration_SnowPines` level. It covers:

- `M_Landscape` and the `MI_Landscape_Snow` instance used by the Landscape actor;
- the grass, dirt, sand, rock, snow, sparkle, rain-wetness, and layer-blend functions reached by that material;
- the standalone `M_Snow` / `MI_Snow` material used by snow-drift meshes and snow slots;
- `M_StylizedSky_Lite` and `M_StylizedClouds_Lite`;
- the scene-captured skylight and exponential-height-fog interactions that materially affect those surfaces.

The source of truth is the supplied Unreal content, not the current browser approximation. The relevant local evidence is:

- `assets-local/sostylized/graphs/M_Landscape.T3D`
- `assets-local/sostylized/graphs/MF_Grass.T3D`
- `assets-local/sostylized/material-source/manifest.json`
- `assets-local/sostylized/material-audit.json`
- `assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json`
- `assets-local/sostylized/demo-scenes/Demonstration_SnowPines-authored.glb`
- `assets-local/sostylized/demo-scenes/Demonstration_SnowPines.glb`
- exported graph probes for `MF_Snow`, `MF_Sparkle`, `MF_WindColor`, `MF_RainWetness`, `M_StylizedSky_Lite`, and `M_StylizedClouds_Lite`
- Unreal Engine 5.8's `MaterialExpressionLandscapeLayerBlend.cpp`, used to resolve the exact runtime layer-blend math rather than infer it from node labels.

The browser implementation audited here is `src/environment/soStylizedSourceMaterials.js`, with material-family and curve handling in `src/environment/soStylizedSourceLibrary.js`.

The central finding is that the direct-light transform is only one input to the
result. The authoritative painted Landscape weights are now exported and bound,
the elevation-snow invention has been removed, and the source snow/grass/rock/
sky/cloud paths have dedicated implementations. Renderer-level bridges remain
for UE's captured-scene skylight, shadow filtering, temporal dither, fog, and
post pipeline. Those stages can still change the apparent position and depth of
a shadow even when the directional-light vector and material graph are fixed.

> Implementation note (2026-07-21): the dedicated snow family, source sky and
> cloud contracts, AutoCliff remap/order, grass remaps, world-aligned AutoCliff
> normal, removal of inferred elevation snow, and all ten painted Landscape
> layer inputs have been applied in `soStylizedSourceMaterials.js`. Sections
> labeled “Current browser discrepancies” preserve pre-remediation evidence.
> The source sparkle intensity-variance volume texture remains an explicit
> data gap rather than a guessed input.

## Resolved source-data blocker: Landscape painted weights

The authored landscape primitives in `Demonstration_SnowPines-authored.glb` contain only:

```text
POSITION
NORMAL
TEXCOORD_0
```

They carry neither Landscape painted weights nor an equivalent vertex-color
payload. Every landscape primitive is assigned `MI_Landscape_Snow`, but the
material assignment alone does not say which layer is painted at a pixel.

Unreal's actual result is driven by ten named painted layers. Those inputs are
now exported independently of the glTF through UE 5.8
`ULandscapeInfo::ExportLayer` / `FLandscapeEditDataInterface::GetWeightDataFast`.
The authoritative manifest is
`assets-local/sostylized/landscape-weight-layers/SnowPines/manifest.json`.

The exported graph layers are:

```text
Grass
Dirt
Sand
Rock
SnowGrass
Snow
SnowGrassBlue
DesertSand
DesertGrass
DesertDirt
```

The content also contains `LL_Ice`, but `M_Landscape` has no `Ice` layer input, so it must not be added to this material unless another graph proves its use.

The Landscape is an 8-by-8 component grid with 63 quads per component. Its
logical vertex extent is therefore:

```text
8 * 63 + 1 = 505 by 505 samples
```

All ten masks are linear grayscale8 PNGs at 505 by 505 with no `gAMA` or `sRGB`
chunk. Seven are source-allocated/painted. `DesertSand`, `DesertGrass`, and
`DesertDirt` are retained as UE's exact all-zero results because they still
participate in the graph's declared height-blend order. The verifier proves
each PNG is byte-equal to the corresponding UE `.r8` export.

The Landscape actor transform is:

```text
location = (-25200, -25200, 100) cm
scale    = (100, 100, 100)
```

Thus the horizontal source range is `-25200..25200 cm`, or 504 metres, in both
X and Y. A texel-centred sample mapping is:

```text
landscapeVertex = (UEWorldXY - [-25200, -25200]) / 100
weightUV        = (landscapeVertex + 0.5) / [505, 505]
```

PNG row zero is Landscape `minY`; columns increase from `minX`. Runtime textures
therefore use `flipY=false`, clamp-to-edge, linear scalar sampling, no mipmaps,
and no color-space transfer.

### Lossless WebGPU binding

Ten independent weight textures, plus the authored layer textures, exceed the
portable WebGPU sampled-texture limit. The runtime packs the same bytes into
three RGBA8 PNGs without resampling:

| Runtime pack | R | G | B | A |
| --- | --- | --- | --- | --- |
| 1 | Grass | Dirt | Sand | Rock |
| 2 | SnowGrass | Snow | SnowGrassBlue | DesertSand |
| 3 | DesertGrass | DesertDirt | exact zero | exact zero |

`npm run verify:landscape-weights` deinterleaves every runtime channel and
compares it byte-for-byte with the original UE `.r8`. This changes only binding
count; the shader still evaluates ten distinct weights in the exact UE order.
The complete Landscape graph uses 35 sampled textures after renderer resources
are included, so the source showcase requests the adapter-supported
`maxSampledTexturesPerShaderStage=48`. Deleting graph nodes to fit the default
limit of 16 would invalidate the source-first comparison.

The same adapter has a hard `maxSamplersPerShaderStage=16`; unlike the sampled-
texture limit, that maximum cannot be requested higher. Three normally creates
one sampler binding for every filterable texture, which made the intact graph
fail pipeline creation at 35 samplers. Landscape source textures therefore use
an explicit samplerless filtering bridge: private texture views are fetched by
`textureLoad`, bilinear filtering is reconstructed at each mip, and adjacent
mips are blended using derivative-selected LOD. Clamp/repeat/mirrored-repeat
addressing and color-space conversion remain explicit. Anisotropic filtering
is the one declared filtering gap. This bridge changes no UE texture, channel,
coordinate, layer, or graph-order input.

## Machine-checkable node and order map

The full per-expression map is
`docs/source-shader-audits/terrain-sky-node-map.json`. It is generated from the
authoritative `material-audit.json`, follows the closure of four root materials
and their supplied material functions, and currently covers 15 graphs / 926 UE
expression nodes. Every entry records:

- exact UE graph and expression identity;
- input edges and selected output channels;
- parameter/default/node properties without normalization;
- traced coordinate roots;
- source formula or operation;
- TSL helper/expression target;
- implementation status;
- renderer/data bridge or explicit gap;
- direct evidence location.

The JSON also records the Landscape, sky, and cloud operation order contracts,
external Engine-function bridges, the packed-mask mapping, the 35/48 sampled-
texture requirement, and the 35-to-16 samplerless filtering bridge. Regenerate
and verify it with:

```text
npm run generate:terrain-sky-node-map
npm run verify:terrain-sky-node-map
```

The map is intentionally exhaustive, including dormant static-switch branches.
“Translated primitive” means the mathematical node has a direct TSL operation;
it does not claim that an inactive branch is connected in the fixed SnowPines
runtime. “Bridge” and “gap” entries make that distinction explicit.

## Coordinate and unit contract

Unreal world coordinates are centimetres with Z up. The imported glTF scene uses metres and the existing Three.js conversion:

```text
UE (X, Y, Z) -> Three (X, Z, -Y)
UE WorldXY    -> Three (world.x, -world.z)
UE scale cm   -> Three scale metres = scale / 100
```

Two coordinate systems are used by `M_Landscape`; they are not interchangeable.

### `LandscapeLayerCoords`

The graph's default `LandscapeLayerCoords` evaluates in Landscape-local quad units. For this actor:

```text
landscapeCoord = (UEWorldXY - [-25200, -25200]) / 100
```

This coordinate is used for:

- height-blend noise, divided by `Height Noise Scale = 30`;
- auto-cliff noise, divided by `Auto Cliff Noise Scale = 80`;
- dirt UVs, divided by `Dirt Scale = 13`;
- sand UVs, divided by `Sand Scale = 10`.

### Absolute world position

The reusable grass, rock, snow, sparkle, wetness, and color-map functions use absolute Unreal world position. Their scalar scale parameters are in centimetres. In the browser, convert the source scale to metres, then project Unreal XY as Three `(world.x, -world.z)`.

This distinction matters. Replacing `LandscapeLayerCoords / 13` with `WorldXY / 1300 cm`, for example, happens to preserve frequency only for a 100 cm landscape XY scale and still changes phase because it omits the Landscape origin.

## Surface contracts

| Material | Domain / blend | Shading | Sidedness | Depth behavior |
| --- | --- | --- | --- | --- |
| `M_Landscape` | Surface / Opaque | Default Lit, Material Attributes | one-sided | ordinary depth test/write |
| `M_Snow` | Surface / Opaque | Default Lit, Material Attributes | one-sided | ordinary depth test/write |
| `M_StylizedSky_Lite` | Surface / Opaque | Unlit | one-sided | ordinary depth test/write; `IsSky = false` |
| `M_StylizedClouds_Lite` | Surface / Masked | Unlit | one-sided | ordinary depth test/write; clip `1/3`; `IsSky = false` |

The sky and cloud domes are not Three.js-style background layers. They are regular, depth-tested surface meshes. The source does not disable fog on either material, and Unreal reports `IsSky = false`. This is important because the captured-scene skylight, exponential height fog, opaque sky dome, and masked cloud dome are coupled parts of the authored result.

## Exact `LandscapeLayerBlend` behavior

The graph contains seven height-blended layers and three ordinary weight-blended layers:

| Layer | Blend type | Material input |
| --- | --- | --- |
| `Grass` | Height | `MF_Grass` |
| `Dirt` | Height | dirt attributes |
| `Sand` | Weight | sand attributes |
| `Rock` | Height | `MF_Rock` |
| `SnowGrass` | Height | `MF_Snow` |
| `Snow` | Weight | `MF_Snow` |
| `SnowGrassBlue` | Weight | `MF_Snow`, with Base Color multiplied by `SnowGrassBlue Color` |
| `DesertSand` | Height | desert-sand function |
| `DesertGrass` | Height | desert-grass function |
| `DesertDirt` | Height | desert-dirt function |

There are no alpha-blended layers. An omitted Unreal `BlendType` defaults to `LB_WeightBlend`, not alpha blend.

All seven height layers share this height signal:

```text
height = T_NoiseStylized.R(landscapeCoord / 30) * 1.1
```

For each height layer with painted weight `w_i`, Unreal computes:

```text
modifiedWeight_i = clamp(lerp(-1, 1, w_i) + height, 0.0001, 1)
                 = clamp(2 * w_i - 1 + height, 0.0001, 1)
```

For ordinary weight layers:

```text
modifiedWeight_i = w_i
```

Because at least one height-blended layer exists, Unreal then renormalizes all non-alpha layer weights together:

```text
sum = modifiedWeight_Grass + ... + modifiedWeight_DesertDirt
finalWeight_i = modifiedWeight_i / max(sum, epsilon)
attributes = sum(finalWeight_i * attributes_i)
```

That shared normalization is essential. A sequence of pairwise `mix()` calls does not produce the same result, and neither does choosing a single layer by maximum weight.

Material Attributes must be blended field by field: Base Color, Metallic, Specular, Roughness, Emissive, Normal, and any other connected attribute. Do not blend only color and then apply one global rock PBR tuple.

## `M_Landscape` pipeline

At a high level, the source graph is:

```text
painted = LandscapeLayerBlend(all ten layer attribute sets)

normalZ = VertexNormalWS.B
slope   = remap(normalZ, 0.85 -> 0.8, 0 -> 1)
noise   = T_NoiseStylized.R(landscapeCoord / 80) * 2
cliff   = AutoCliff ? saturate(slope - noise) : 0

withCliff = BlendMaterialAttributes(painted, MF_Rock, cliff)
wet       = MF_RainWetness(withCliff, wetnessMap)
surface   = ApplyLandscapeVisibilityMask(wet)
```

The remap above is the ordinary unclamped linear remap; only the final subtraction is saturated. The exact expression can be written:

```text
slope = (normalZ - 0.85) / (0.8 - 0.85)
cliff = saturate(slope - noise)
```

`VertexNormalWS.B` is Unreal world Z, equivalent to Three world Y after coordinate conversion.

`AutoGrass?` does not modify this cliff material mask. It controls procedural grass spawning and the RVT grass-coverage semantic. The current browser implementation multiplies its cliff mask by an `AutoGrass` smoothstep, which changes the visible terrain material and is not present in the source graph.

### Runtime virtual texture outputs

The Landscape writes:

```text
BaseColor = final Base Color
Specular  = 0
Normal    = PixelNormalWS
WorldHeight = AbsoluteWorldPosition.Z
```

The RVT `Roughness` channel is deliberately repurposed as semantic grass coverage:

```text
grassCoverage = saturate(Grass + SnowGrass + SnowGrassBlue)
grassCoverage *= 1 - autoCliffMask * 0.5
RVT.Roughness = grassCoverage
```

It is not the visible terrain roughness. Foliage reads this semantic to control placement/color behavior. A browser replacement should store it in an explicitly named ground-data channel rather than accidentally feeding it into PBR roughness.

## Grass layer: `MF_Grass`

The active SnowPines grass path uses absolute world XY, not Landscape UVs.

### Texture-scale variance

```text
uv1 = UEWorldXY / 1600 cm
uv2 = UEWorldXY / (1600 * 1.75) cm
variance = saturate(
  T_NoiseRough.R(UEWorldXY / 8417.2 cm) * 2
)

grassRGB = lerp(
  T_Grass1_BC.rgb(uv1),
  T_Grass1_BC.rgb(uv2),
  variance
)

grassRoughness = lerp(
  T_Grass1_R.r(uv1),
  T_Grass1_R.r(uv2),
  variance
)
```

The same variance mask blends color and roughness. The current implementation gets this broad structure but omits several active operations below.

### SnowPines color-map path

`UseColorMap?` is true. Therefore `Grass Tint` is not the active color branch. The exact path is:

```text
colormapUV = (UEWorldXY + 0.5 * [50000, 50000]) / [50000, 50000]
colormap   = T_Grass_ColormapSnow.rgb(colormapUV)
base       = Overlay(Desaturation(grassRGB, 1), colormap)
```

The false branch would be `grassRGB * Grass Tint`. The active Overlay must use Unreal/MaterialX overlay semantics and linear sampled values at the graph point; it is not a generic luminance-weighted interpolation.

### Hue variance

The active hue change is a genuine hue rotation:

```text
hueNoise  = T_NoiseGreyed.rgb(UEWorldXY / 8000 cm)
hueAmount = (hueNoise + [-0.05, -0.05, -0.05]) * -0.1 + -0.01
base      = UE_HueShift(base, hueAmount)
```

Port UE's hue-shift operation component behavior; do not replace it with a brightness multiplier.

### Wind-color mask

`UseWindColor?` is true. `MF_WindColor` computes an animated scalar from two world-projected masks:

```text
rotatedUV = rotateAboutCenter(UEWorldXY / 8000 cm, GlobalWindAngle = 0.2)

noiseUV = rotatedUV + MaterialTime * (GlobalWindSpeed * 0.04, 0)
maskUV  = rotatedUV * (MaskSize, MaskSize * 0.6)
maskUV += MaterialTime * (GlobalWindSpeed * 0.06, GlobalWindSpeed * 0.02)

wind = T_NoiseWind.R(noiseUV)
     * T_NoiseSmooth.R(maskUV)
     * WindMaskMultiply
     * saturate(MaterialTime)
```

For this instance, `MaskSize = 1.5` and `WindMaskMultiply = 3`. Do not clamp the final `wind` value. Unreal's `lerp` may extrapolate when this alpha exceeds one.

The same scalar drives two five-point day-cycle targets:

```text
colorBoost = lerpFive([1.2, 1, 1, 1, 1.2], DayCycleProgress)
specTarget = lerpFive([1.0, 0.4, 0.2, 0.4, 1.0], DayCycleProgress)

finalBase = lerp(base, base * colorBoost, wind)
specular  = lerp(0.1, specTarget, wind)
```

Final grass attributes are:

```text
Base Color = finalBase
Metallic   = 0
Specular   = specular
Roughness  = grassRoughness
Emissive   = finalBase * 0.03
Normal     = (0, 0, 1) tangent-space
```

`MaterialExpressionTime` is runtime material time. It is not the Material Parameter Collection's `Current Time`. For an apple-to-apple still, freeze Unreal and the browser at the same explicit material time. At time zero, `saturate(MaterialTime)` intentionally fades the wind-color effect out.

## Dirt and sand layers

### Dirt

```text
uv = landscapeCoord / 13
Base Color = T_Dirt1_BC.rgb(uv) * [0.500646, 0.529309, 0.552083]
Metallic   = 0
Specular   = 0.1
Roughness  = T_Dirt1_R.r(uv)
Emissive   = 0
Normal     = FlattenNormal(T_Dirt1_N(uv), 0.5)
```

The dirt normal texture is a real tangent-space normal input. Omitting it changes the apparent terminator and shadow-edge contrast on shallow slopes.

### Sand

```text
uv = landscapeCoord / 10
base = T_Sand_BC.rgb(uv) * [0.830770, 0.810712, 0.623078]
waterline = saturate((AbsoluteWorldPosition.Z - 20 cm) / 75 cm)

Base Color = lerp(base * 0.7, base, waterline)
Metallic   = 0
Specular   = 0.15
Roughness  = T_Sand_R.r(uv)
Emissive   = 0
Normal     = FlattenNormal(T_Sand_N(uv), 0.3)
```

The shoreline darkening uses absolute source World Z and centimetre parameters. In Three metres the height and distance are `0.20 m` and `0.75 m` after the coordinate conversion.

## Rock layer and automatic cliffs

The painted `Rock` layer and `AutoCliff` replacement both call the same `MF_Rock` attributes. The active `MI_Landscape_Snow` rock parameters are:

| Parameter | Value |
| --- | ---: |
| Rock Scale | `2500 cm` |
| Rock Tint | `[0.893158, 0.921875, 0.829687]` |
| Metallic | `.1` |
| Specular | `.2` |
| Roughness | `CheapContrast(world-aligned T_RockClassic_BC.R, .3) * 1.2` (`RoughnessMap?` is false) |
| Projection Contrast | `.5` |
| Rock Normal Distance | `20000 cm` |
| Rock Normal Flatten | `0` near |
| Distant Rock Normal Flatten | `1` far |
| Close Tint Blend Distance | `500 cm` |
| Far Tint Blend Distance | `15000 cm` |
| Distant Tint Blend | `[.59375, .59375, .59375]` |
| Distant Tint Blend alpha mix | `.5` |

Active switches are:

```text
WorldAlignedSides?       = false
SideProjectOnly?         = false
RockColorMap?            = false
RockStriping?            = false
RoughnessMap?            = false
FlattenDistantCracks?    = true
FlatTopCrackNormals?     = false
```

Even with those optional branches off, `MF_Rock` is not merely `triplanar(baseColor) * tint`. It world-aligns color and tangent normals with projection contrast, applies the active near/far tint blend, and flattens the normal at distance. Its active core is:

```text
r = WorldAlignedTexture(T_RockClassic_BC, 2500 cm,
                        PixelNormalWS, ProjectionContrast=.5)
base0 = r.rgb * RockTint
d = saturate((PixelDepth - 500 cm) / (15000 cm - 500 cm))
base = lerp(base0, lerp(base0, DistantTint, .5), d)

roughness = CheapContrast(r.r, .3) * 1.2
normalFade = saturate(PixelDepth / 20000 cm)
flatness = lerp(0, 1, normalFade)
normal = FlattenNormal(
  WorldAlignedNormal(T_RockClassic_N, 2500 cm,
                     ProjectionContrast=.5),
  flatness
)
```

`PixelDepth` is view-axis depth, not Euclidean camera distance. `WorldAlignedNormal` decodes and reorients each projection-basis tangent normal before combining it; blending encoded RGB like a color texture is not equivalent. The browser currently omits the rock normal entirely and omits the distant tint/normal behavior. This directly changes how the directional light breaks across the large left-side rock and cliff faces.

Do not reuse the standalone rock-lab approximation blindly. The Landscape function's coordinate origin, active switches, and camera-distance terms must remain those of this instance.

## Snow layer and standalone snow material

`MF_Snow` returns Material Attributes plus a separate mask output. Its material attributes are valid regardless of the `Snow?` switch:

```text
uv = UEWorldXY / 5000 cm
base = T_Snow_BC.rgb(uv)

specNoise = T_ChromaNoise_Blurred.R(UEWorldXY / 75 cm)
specular  = lerp(0.1, 0.3, specNoise)

Base Color = base
Metallic   = 0
Specular   = specular
Roughness  = 0.5
Normal     = (0, 0, 1) tangent-space
```

The base texture is a planar absolute-world-XY sample, not triplanar mapping and not mesh UV0.

### Snow emission and day/weather factor

```text
dayFactor = lerpFive([1, 0.4, 0.1, 0.4, 1], DayCycleProgress)
weathered = lerp(dayFactor, 0, Overcast)
baseEmission = base * 0.05 * weathered
Emissive = baseEmission + sparkle
```

At the SnowPines baseline, `DayCycleProgress = 0` and `Overcast = 0`, so the base-emission multiplier is one before the `.05` strength.

### Separate snow mask output

When the reusable function's `Snow?` switch is true, its separate Alpha output is:

```text
alpha = saturate(dot(PixelNormalWS, SnowDirection) * 8 - 0.3)
```

When `SnowWorldAligned?` is false, the graph uses `VertexColor.G` instead. This Alpha output is for callers that blend snow over another material. It does not gate the function's own Material Attributes.

`MI_Snow` sets `Snow? = false`, but that only disables this separate Alpha output. The standalone snow-drift meshes must still render the full snow attribute set. Treating the switch as “make this material non-snow” is incorrect.

### Sparkle

Sparkle is enabled and dual-layered in both the landscape instance and `MI_Snow`:

| Parameter | Layer 1 | Layer 2 |
| --- | ---: | ---: |
| Scale | `1600 cm` | `1000 cm` |
| Brightness | `20` | `20` |
| Rotation | `0` | `.31` |

Shared values are:

```text
color                  = [0.627031, 0.663767, 1]
twinkle tolerance      = 0.95
twinkle speed          = 1
fade start/end         = 200 / 2500 cm
near shrink amount     = 0.3
near/far shrink        = 500 / 1500 cm
brightness contrast    = 3
SimpleSparkle?         = false
SparkleProject3D?      = false
SparkleIntensityVariance? = true
SparkleDayAndWeather?  = true
```

The active branch projects a rotated world-XY grid, compares the sampled chroma direction with the camera vector, applies the non-simple triangle-wave temporal twinkle, sphere mask, contrast, intensity variance, distance fade, and near-distance shrink, then multiplies by the day/weather factor. The result is emissive and therefore passes through exposure, tone mapping, and bloom.

`T_ChromaNoise2x_Nearest` is linear `TC_HDR`. `T_SphereMask` is authored sRGB. A 3D volume-noise texture exists for the dormant `SparkleProject3D?` branch, but the active SnowPines path does not require volume-texture support.

### Resolved material-family routing

The source-family rules now include `/M_Snow.` and route `MI_Snow` through the
dedicated `buildSnow()` path. This retains world projection, noisy specular,
base emission, and sparkle for the five snow-drift meshes and the log/stump snow
slots in SnowPines.

## Rain wetness

The final Landscape attributes pass through `MF_RainWetness`.

For `MI_Landscape_Snow`:

```text
RainWetness? = true
RainPuddles? = false
Wet Specular = 1
Wet Roughness = 0.3
Faked Wet Reflection = 5
Fake Reflection Tint = [0.569374, 0.769240, 1]
Reflection Contrast = 1.3
```

The shared Material Parameter Collection baseline has `Rain Wetness = 0`, `Rain Puddles = 0`, and `Rain Strength = 0`, so the fixed source comparison should be neutral. Preserve the graph contract and uniforms; do not bake the dormant branch's values into the dry material. A generic “darken and lower roughness” helper is insufficient when rain is later enabled because the source function also contains fake-reflection and puddle behavior.

## Sky dome: `M_StylizedSky_Lite`

The source material is a one-sided, opaque, unlit surface. It is depth-tested and depth-writing. It is not flagged as Unreal `IsSky`, and the graph does not opt out of height fog.

The active `MI_StylizedSky_Lite` parameters are:

```text
Day Curve                   = 0
Sky Brightness              = 1
Saturation                  = 1
BackgroundClouds?           = true
BG Clouds Strength          = 0.3
BG Clouds Vertical Offset   = 0
BG Clouds Vertical Stretch  = 1
BG Clouds Tint              = [0.529000, 0.747966, 1]
BG Cloud Texture            = T_BackroundClouds1A
```

### Exact graph

```text
v = LinearGradient(UV0).V
curveTime = 1 - v
baseSky = Curve_Sky_Classic_Day(curveTime) * SkyBrightness

bgUV = ScaleUVsByCenter(UV0, [1, 1]) + [0, 0]
bg = T_BackroundClouds1A.rgb(bgUV) * BGCloudsTint

screen = 1 - (1 - bg) * (1 - baseSky)
result = lerp(baseSky, screen, BGCloudsStrength)
emissive = Desaturation(result, 1 - Saturation)
```

There is no time panner in this lite sky material. A `BG Clouds Speed` parameter does not participate in the exported graph.

The curve's linear checkpoints are:

| Curve time | RGB |
| ---: | --- |
| `0` | `[2, 2, 2]` |
| `.25` | `[.178886, .468584, .956628]` |
| `.5` | `[.009560, .177077, .746443]` |
| `.75` | `[.021785, .124846, .619908]` |
| `1` | `[0, .114400, .572000]` |

The material samples at `1 - UV.y`. Sampling at `UV.y` vertically inverts the authored sky gradient.

`T_BackroundClouds1A` is 4096 by 2048, sRGB, Wrap X and Wrap Y. Numeric tint values are already linear. Preserve HDR values from the curve—the value `[2,2,2]` is intentional and feeds bloom/tone mapping.

### Current browser discrepancies

`buildSky()` currently:

- samples the curve at `UV.y`, not `1 - UV.y`;
- invents a time animation from `BG Clouds Speed`;
- uses an ad hoc vertical UV transform rather than the graph's centered scaling contract;
- derives a luminance mask and mixes toward a constant tint instead of Screen-blending the tinted texture over the curve;
- ignores `Saturation`;
- makes the dome double-sided;
- disables depth test, depth write, and fog.

These are graph-level differences, not renderer tolerance.

## Cloud dome: `M_StylizedClouds_Lite`

The source material is a one-sided, masked, unlit surface. It uses ordinary depth test/write and an opacity-mask clip value of `1/3`. It is not transparent alpha blending and is not flagged `IsSky`.

The active instance values are:

```text
CloudColor      = curve row 0
Rotation Speed  = -0.0005
Strength        = 2
Vertical Offset = -0.072
Vertical Stretch = 0.424
```

### Exact graph

```text
panned = UV0 + (MaterialTime * -0.0005, 0)
shifted = panned + (0, -0.072)
coords = (shifted - 0.5) / (1, 0.424) + 0.5

sample = T_CloudLayer03(coords)
emissive = Curve_Clouds_Classic_Day(sample.R) * 2
opacityMask = DitherTemporalAA(sample.A)
discard when opacityMask < 1/3
```

The `ScaleUVsByCenter` function produces a 0-to-1 mask output, but that output is not connected in this parent graph. Multiplying opacity by a manually reconstructed coordinate mask is therefore not source behavior.

The cloud curve's linear checkpoints are:

| Curve time | RGB |
| ---: | --- |
| `0` | `[.122450, .295100, .635417]` |
| `.25` | `[.308760, .474979, .708029]` |
| `.5` | `[.432700, .579713, .806951]` |
| `.75` | `[.556640, .684446, .905873]` |
| `1` | `[.674573, .784103, 1]` |

`T_CloudLayer03` is 4096 by 512, sRGB, Wrap X and Clamp Y. Its R channel drives the color curve; alpha drives the silhouette. RGB receives the texture's authored sRGB decode, while alpha is not gamma transformed.

The live Lite-cloud path now evaluates the exported UE 5.8
`DitherTemporalAA` graph with `Good64x64TilingNoiseHighFreq`, the exact
temporal sample index, and the source eight-sample Halton jitter. It clips at
`1/3`; it does not replace the mask with smooth alpha transparency. The active
Gen4 MainUpsampling/High resolve now follows that exact material/jitter stage.
Its remaining data/precision boundaries are responsive stencil, encoded
primitive-mobility ownership, exact half quantization/arithmetic, and changing
pre-exposure. A runtime binding for the separate full-cloud master also remains.

### Current browser discrepancies

`buildClouds()` now preserves the Lite graph's unconnected coordinate mask,
uses the exact masked temporal function and `1/3` clip, writes/tests depth,
keeps the front-sided source contract, participates in fog, and leaves
`Strength` uncapped. Remaining cloud work is the exact 256-wide curve-atlas
row, pixel validation through the explicit Gen4 boundary gaps, and a separate
runtime port of `M_StylizedClouds` (the full master).

## Curve-atlas precision

Both Unreal curve atlases are 256 pixels wide. The manifest currently stores 65 samples per gradient curve, and `createCurveTexture()` creates a 65-by-1 float texture. Linear interpolation makes broad gradients close, but it is not the source texture and can diverge around curved keys or quantized comparison pixels.

For exact comparison, export the actual 256-pixel atlas row or evaluate the Unreal curve to 256 linear-float samples using the same key interpolation. Keep the data texture in linear/no-color-space mode, Clamp X, and no mipmaps. Do not upload curve values as sRGB.

## Texture and color-space contract

The manifest's import metadata is authoritative. Several data-looking maps are deliberately authored as sRGB/default textures and Unreal samples their decoded R values.

| Texture | Authored handling | Active use |
| --- | --- | --- |
| `T_Grass1_BC` | sRGB / Default | grass RGB, dual world scales |
| `T_Grass1_R` | sRGB / Default | grass roughness R |
| `T_Grass_ColormapSnow` | sRGB / Default | world color map RGB |
| `T_Dirt1_BC` | sRGB / Default | dirt RGB |
| `T_Dirt1_R` | sRGB / Default | dirt roughness R |
| `T_Dirt1_N` | linear / NormalMap | dirt tangent normal |
| `T_Sand_BC` | sRGB / Default | sand RGB |
| `T_Sand_R` | sRGB / Default | sand roughness R |
| `T_Sand_N` | linear / NormalMap | sand tangent normal |
| `T_RockClassic_BC` | sRGB / Default | rock color and active roughness source |
| `T_RockClassic_N` | linear / NormalMap | world-aligned rock normal |
| `T_Snow_BC` | sRGB / Default | snow RGB |
| `T_NoiseStylized` | sRGB / Default | height and auto-cliff R |
| `T_NoiseRough` | sRGB / Default | grass variance R |
| `T_NoiseGreyed` | sRGB / Default | grass hue RGB |
| `T_NoiseWind` | sRGB / Default | wind-color noise R |
| `T_NoiseSmooth` | sRGB / Default | wind-color mask R |
| `T_ChromaNoise_Blurred` | sRGB / Default | snow specular R |
| `T_ChromaNoise2x_Nearest` | linear / HDR | sparkle direction/color |
| `T_SphereMask` | sRGB / Default | sparkle mask |
| `T_BackroundClouds1A` | sRGB / Default | sky background-cloud RGB |
| `T_CloudLayer03` | sRGB / Default | cloud curve-time R and alpha mask |

Do not normalize all R-channel textures to linear merely because their output is used as roughness or a mask. Match the source import flag first.

## Scene lighting and fog interaction

The relevant SnowPines scene settings are:

### Directional light

```text
direction UE = [0.4924038765, -0.4131759112, -0.7660444431]
intensity    = 8
color        = [255, 255, 255]
mobility     = Movable
cast shadows = true
dynamic shadow distance = 30000 cm
cascades = 4
cascade distribution exponent = 3
cascade transition fraction = 0.1
shadow bias / slope bias = 0.5 / 0.5
light source angle = 0
```

After the coordinate conversion, preserve whether the engine API expects the direction light travels or the direction toward the light. A sign inversion can put the cast shadow on the opposite side even when the three numeric components appear to match.

### Captured-scene skylight

```text
source type        = Captured Scene
real-time capture  = false
resolution         = 128
intensity          = 1.2
light color bytes  = [195, 223, 255]
lower hemisphere   = [0.028426, 0.040915, 0.057805] linear
sky threshold      = 150000 cm
cast shadows       = false
```

This is environment illumination captured from the source scene, not a uniform ambient term. Its directionality and color distribution affect the blue fill on the nominally shadowed side of rocks, trees, and terrain. If the browser uses a generic IBL, hemisphere light, or constant ambient color, it can have an identically positioned direct shadow but a very different-looking shadow interior.

For the closest port, capture a cubemap from the reconstructed source sky/cloud domes at the same state and convolve it into diffuse irradiance/specular radiance using the browser renderer's expected color pipeline. A numeric `iblScale` can match energy only after the environment map itself matches.

### Exponential height fog

```text
density                 = 0.05
height falloff          = 0.464768
start distance          = 1000 cm
fog color linear        = [0.287923, 0.527454, 0.953125]
max opacity             = 1
volumetric fog          = false
fog actor origin        = [0,0,0]
```

This is UE exponential-height fog, not one scalar linear depth fog. Apply the world-height term in Unreal units/orientation and the start-distance term from the camera. Because the two domes are ordinary surfaces with `IsSky = false`, do not categorically exclude them from fog.

### Post-processing dependency

The source unbound post-process fixes exposure min/max to `1`, bloom intensity to `5`, bloom threshold to `.5`, color saturation to `1.1`, film slope/shoulder/toe to `1 / 1 / .3`, and disables motion blur and lens flare. HDR unlit sky colors and snow sparkles are deliberately shaped by this pipeline. Material equality should be judged in linear pre-tonemap buffers first and in final display output only after exposure, tone curve, gamut, bloom, and AA are fixed on both sides.

## Why exact light coordinates can still look mismatched

The light's programmed transform determines the direct-light direction. It does not uniquely determine the final pixels. For the left-side rock highlighted in the comparison, the largest independent variables are:

1. `MF_Rock`'s missing world-aligned normal and distance flattening, which change `N dot L` on the same geometry under the same light.
2. The captured-scene skylight, which controls how blue/bright the direct-shadow side remains.
3. The missing painted Landscape weights and invented elevation snow split behind/around the rock.
4. Fog transmittance and inscattering between camera and rock.
5. Different shadow-map projection, cascade selection, bias, PCF/filtering, and camera near/far values.
6. Exposure, tone mapping, AO, bloom, and output color-space differences.

Therefore “same coordinates” is necessary but not sufficient. The correct diagnostic is to compare buffers in order:

```text
geometry/depth
-> world normal
-> albedo and material attributes
-> direct-light shadow mask
-> direct lighting
-> skylight/indirect
-> AO
-> fog
-> exposure/tone map/bloom/AA
```

If the binary/direct shadow mask matches but the shadowed pixels do not, stop moving the sun. The mismatch is in material normals, indirect light, fog, or post-processing.

## Discrepancy matrix against the current browser port

| Priority | Current behavior | Source behavior | Required correction |
| --- | --- | --- | --- |
| P0 | Landscape snow inferred from elevation (`buildLandscape`, currently lines 855-862) | ten painted Landscape weights | export and bind exact weights; delete elevation heuristic |
| P0 | Sequential grass/rock/snow mixes | normalized UE height/weight layer blend | implement all ten layers and exact normalization |
| P0 | standalone `MI_Snow` falls through to misc/fallback (`soStylizedSourceLibrary.js:38-59`, material builder default) | dedicated `M_Snow` Material Attributes | add `snow` family and exact builder |
| P0 | sky curve sampled upright and background clouds approximated (`buildSky`, currently lines 924-959) | `1-UV.y`, Screen blend, static centered UV, saturation | translate graph literally |
| P0 | Lite clouds now use exact masked `DitherTemporalAA`, clip `1/3`, front-side depth write/test, and fog; the full cloud master is not runtime-bound | same graph contract per authored master, with different full-cloud inputs | bind `M_StylizedClouds` separately and validate both through the remaining UE history-resolve bridge |
| P0 | sky/cloud fog disabled globally (`finalizeMaterial`, currently lines 385-396) | ordinary surfaces, `IsSky=false`, fogged | remove family exclusion and match UE fog |
| P1 | auto-cliff smoothstep and `AutoGrass` mutation (`buildLandscape`, currently lines 820-830) | remap-minus-noise; AutoGrass does not alter visible cliff mask | port exact formula |
| P1 | grass omits HueShift and wind-color graph | both active in SnowPines | port `MF_Grass`/`MF_WindColor` exactly |
| P1 | rock is base-color triplanar only (`buildLandscape`, currently lines 815-842) | world-aligned normal plus near/far tint and normal behavior | port active `MF_Rock` branch |
| P1 | dirt/sand absent as real layer attributes | painted layers with authored PBR/normal functions | add exact layer builders |
| P1 | snow uses triplanar color and no sparkle (`buildLandscape`, currently lines 843-869) | planar WorldXY, noisy specular, emission, dual sparkle | port `MF_Snow` |
| P1 | one global landscape metallic/specular (`buildLandscape`, currently lines 873-879) | per-layer Material Attributes | blend every attribute |
| P1 | generic ambient/IBL can be toggled numerically | source skylight is a captured scene | capture/reconstruct the source environment map |
| P2 | 65-sample runtime curve textures | 256-wide Unreal curve atlases | export or resample exact 256 rows |
| P2 | generic wet-surface helper | `MF_RainWetness` graph | retain exact dormant contract for later rain states |

## Implementation order

1. Export the ten Landscape weightmaps and add a weight debug mode. This removes the largest source-data ambiguity.
2. Freeze one Unreal capture and browser frame to the same camera, material time, direct-light vector, exposure, output size, and jitter state.
3. Fix sky and cloud graphs, depth contracts, fog participation, and the captured-scene skylight. Re-capture the browser environment only after the domes are correct.
4. Add the standalone snow family and exact `MF_Snow` attributes.
5. Implement exact Landscape layer blending, dirt, sand, grass, rock, and auto-cliff behavior.
6. Add snow sparkle and close the remaining UE Gen4 stencil/mobility/half-precision boundaries; reuse the exact material dither, eight-sample jitter, and MainUpsampling/High core already ported.
7. Preserve RVT grass-coverage semantics for foliage integration.
8. Only after source parity, expose ToonLab style controls as a separate layer. Do not fold source-reconstruction fixes into style parameters.

## Acceptance gates

Source parity is not complete until all of these pass:

- Landscape debug output shows each exported layer weight beside Unreal with the same orientation, phase, and borders.
- Per-pixel normalized blend weights match Unreal for synthetic combinations including height-plus-weight overlap.
- The elevation snow heuristic is absent.
- Auto-cliff debug output matches Unreal on a flat surface, threshold slope, steep cliff, and noise transition.
- Grass base color, roughness, hue, wind-color scalar, and specular are individually inspectable and match at fixed world positions/time.
- Rock world normal and distance-fade debug outputs match at near and far camera distances.
- A standalone `MI_Snow` drift renders with planar world projection, noisy specular, `.05` base emission, and dual sparkle.
- Sky curve endpoint orientation is verified: `UV.y = 1` samples curve time `0`, and `UV.y = 0` samples time `1`.
- Background clouds use Screen math and remain static when only material time changes.
- Cloud R-to-curve color and alpha-to-masked-silhouette match Unreal at the same UV/time; there is no alpha-blended halo.
- Sky and clouds write/test depth and respond to the source fog contract.
- A reconstructed captured-scene environment map is used for the skylight comparison.
- Direct shadow masks are compared separately from lit color. Moving the sun is forbidden once the mask aligns.
- Linear pre-tonemap comparisons pass before final ACES/tone-map/bloom comparisons are accepted.

## Translation feasibility

The active graph operations can be translated. Nothing in the active SnowPines terrain/sky path requires Blueprint execution at shading time. Unreal material nodes compile to shader operations, and the source Blueprint mainly creates/configures components and parameter values.

The limitations are renderer and data contracts, not a lack of node equivalents:

- painted Landscape weights must be exported because the GLB does not contain them;
- captured-scene skylight convolution must be reproduced or baked;
- UE's default-lit BRDF and remaining shadow/fog/exposure stages still need explicit compatibility implementations or validated approximations. The exact material `DitherTemporalAA` graph, jitter, and active Gen4 resolve core are bound for Lite clouds; responsive stencil, encoded mobility, precision, and pixel sign-off remain;
- material time, temporal sample index, and output resolution must remain synchronized for a pixel comparison.

Copying the graph logic is the correct baseline, but graph logic alone cannot reconstruct missing weights or guarantee identical pixels across different renderers. Once those inputs and pipeline stages are fixed, any remaining mismatch can be localized rather than compensated with arbitrary material or light tuning.
