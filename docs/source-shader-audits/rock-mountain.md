# So Stylized rock and mountain shader audit

This is the browser-port specification for the exact rock/mountain materials used by
`/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines`. It is based on the supplied
Unreal assets, raw graph exports of `M_Rock`, `MF_Rock`, `MF_Grass`, `MF_Snow`,
`MF_Moss`, `MF_RainWetness`, and `M_Mountain`, plus:

- `toonlab/assets-local/sostylized/material-audit.json`
- `toonlab/assets-local/sostylized/material-source/manifest.json`
- `toonlab/assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json`

The map contains 276 rock components / 1,016 rock instances, using 52 rock or mountain
meshes and 17 distinct material instances. Five mountain actors all use
`MI_Mountain_Snowy`.

## Port conventions

Use these helpers consistently. Unreal values below are in centimeters; divide spatial
parameters by 100 when evaluating against ToonLab world positions in meters.

```text
sat(x)                 = clamp(x, 0, 1)
linearRamp(x, a, b)    = sat((x - a) / (b - a))
remap10(x, a, b)       = 1 - linearRamp(x, a, b)
cheapContrast(x, c)    = sat((x - 0.5) * (c + 1) + 0.5)
Fresnel(N,V,p)         = pow(1 - sat(dot(N,V)), p)
```

Do not replace the graph's `MaterialXRemap + Saturate` ramps with `smoothstep`; the
source transitions are linear. `PixelDepth` is view-axis depth, not Euclidean
camera-to-fragment distance.

The glTF conversion maps Unreal `(X,Y,Z-up)` to Three `(X,Z,-Y-up)`. Reconstruct Unreal
world axes before all world-aligned samples. World projections are anchored to absolute
world position and therefore do not follow object translation, rotation, or scale.

All source materials are Surface / Default Lit / one-sided. `M_Rock` is Masked and uses
Material Attributes; `M_Mountain` is Opaque and uses Material Attributes. Neither uses a
custom toon shading model.

## `M_Rock` compiled pipeline

### 1. Rock base (`MF_Rock`)

The color and roughness source is Unreal's `WorldAlignedTexture`. Its implementation
must use the engine function's axis samples and projection weights parameterized by
`Projection Contrast`; a useful equivalent is normalized
`pow(abs(Nws), ProjectionContrast)` weights. `SideProjectOnly?` selects the side-only
`XY Texture` output instead of `XYZ Texture`. All SnowPines targets have
`SideProjectOnly? = false`.

```text
r             = WorldAlignedTexture(RockTexture, RockScale,
                                    PixelNormalWS, ProjectionContrast)
base0         = r.rgb * RockTint
d             = linearRamp(PixelDepth, CloseTintDistance, FarTintDistance)
base          = lerp(base0,
                     lerp(base0, DistantTint, DistantTintAlpha),
                     d)

if RockColorMap:
  cmUV         = (AbsoluteWorldPosition.xy + RockColormapSize/2) / RockColormapSize
  base        *= RockColorMap(cmUV).rgb

if RockStriping:
  stripeSize   = (StripeScale, StripeScale, StripeScale * StripeSquish)
  stripe       = CheapContrast(WorldAlignedTexture(Stripe, stripeSize).r,
                               StripeContrast)
  base         = lerp(base, Blend_Overlay(base, StripeOverlayColor), stripe)

roughSource    = RoughnessMap
                 ? WorldAlignedTexture(RoughnessMap, RockScale).r
                 : cheapContrast(r.r, 0.3)
roughness      = roughSource * Roughness
specular       = Specular
metallic       = Metallic
emissive       = MF_DayCycleEmission(base * EmissiveStrength [* optional map])
```

For every SnowPines target, `RockColorMap?`, `RockStriping?`, `RoughnessMap?`, and
`EmissiveMap?` are false and `Emissive Strength` is zero. The effective source path is
therefore the short path above.

Crack normals use `WorldAlignedNormal`, not a triplanar blend of encoded RGB values.
Each projected tangent normal is decoded, reoriented/sign-corrected into its projection
basis, blended in world space, then transformed back to the material normal space.

```text
normalFade     = sat(PixelDepth / RockNormalDistance)
flatness       = FlattenDistantCracks
                 ? lerp(RockNormalFlatten, DistantRockNormalFlatten, normalFade)
                 : RockNormalFlatten
crackN         = WorldAlignedNormal(RockNormalTexture, RockScale,
                                    ProjectionContrast,
                                    SideProjectOnly,
                                    FlatTopCrackNormals)
crackN         = FlattenNormal(crackN, flatness)
stylizedN      = UseStylizedNormalMap ? StylizedNormalMap(UV0) : (0,0,1)
combinedN      = BlendAngleCorrectedNormals(stylizedN, crackN)
```

The exported engine function defines `BlendAngleCorrectedNormals` exactly as the
following tangent-space reoriented-normal blend (RNM):

```text
t              = (stylizedN.xy, stylizedN.z + 1)
u              = (-crackN.xy, crackN.z)
combinedN      = normalize(t * dot(t, u) - u * t.z)
```

The port performs the world-aligned crack-normal projection in world space, converts
that result back to the mesh tangent basis, evaluates this exact RNM expression, and
only then converts the result to view space for Three's material normal input.

The literal source graph remains the default in Rock Lab. The SnowPines acceptance
showcase enables a documented `normalResponseBridge=0.75` after RNM: it consistently
attenuates the remaining authored tangent normal toward `(0,0,1)`. The source distance
fade has already been applied to the crack normal before RNM and is not applied a
second time to this bridge. This is a renderer-boundary compensation for the stronger
normal-map contrast in Three's physical-lighting response; it does not change the
source mesh, the UE material-instance parameters, or the literal graph available for
A/B inspection.

`FlatTopCrackNormals?` selects `WorldAlignedNormal.XYZFlatTop` for the Spire family;
it is not an arbitrary geometric-normal fade. Normal textures are DirectX/Unreal normal
maps imported linear with `TC_NORMALMAP`.

### 2. Moss is part of the base, before the top layer

`MF_Moss` is evaluated and its alpha independently lerps base color, roughness,
specular, metallic, and emissive from rock to moss. The top grass/snow layer is applied
afterward and therefore covers moss.

```text
m             = WorldAlignedTexture(T_NoiseStylized, MossSize).rgb
mossColor     = lerp(MossColor2, MossColor, pow(m, 2))
mossRoughness = sat(m.r * MossRoughness)
slope         = sat(dot(PixelNormalWS, MossDirection) * MossSharpness - MossOffset)
mossAlpha     = sat(pow(sat(m.r) * MossMultiply * slope, 2))

baseAttrs     = lerp(rockAttrs, mossAttrs, Moss? ? mossAlpha : 0)
```

Defaults used here are `MossSize=1200`, `MossMultiply=5`, `MossOffset=.3`,
`MossSharpness=1`, `MossRoughness=1.3`, `MossSpecular=.5`, and moss metallic zero.

### 3. Explicit-normal top projection

`WorldAlignedBlend` receives the already combined authored normal, not the untouched
geometric normal. For the default up vector, the clamped engine blend is functionally:

```text
topSlope      = sat(dot(combinedNormalWS, (0,0,1)) * TopLayerSharpness
                    + TopLayerOffset)
topMask       = MaskTopLayer ? topSlope * TopLayerMask(UV0).r : topSlope
```

The static branch priority is exactly:

```text
TopGrass ? blend(baseAttrs, MF_Grass, topMask)
 : TopSnow ? blend(baseAttrs, MF_Snow.Attributes, topMask)
 : TopSand ? blend(baseAttrs, MF_DesertSand.Attributes, topMask)
 : baseAttrs
```

`MF_Snow.Alpha` is not connected in this path. Consequently `Snow Offset`,
`Snow Sharpness`, `SnowWorldAligned?`, and the separate `Snow?` switch do not control
top-snow coverage. `Snow Scale` still controls the snow color projection.

### 4. Grass attributes (`MF_Grass`)

For the active Classic top-grass variants (`WorldAlignedSides? = false`):

```text
q             = AbsoluteWorldPosition.xy / GlobalScale
variance      = sat(T_NoiseRough(WorldXY / GrassVarianceScale).r
                    * GrassVarianceMultiply)
g             = lerp(T_Grass1_BC(q).rgb,
                     T_Grass1_BC(q / 1.75).rgb,
                     variance)
grassRough    = lerp(T_Grass1_R(q).r,
                     T_Grass1_R(q / 1.75).r,
                     variance)

plainColor    = g * GrassTint
colormapUV    = (WorldXY + (ColormapScaleX,ColormapScaleY)/2)
                / (ColormapScaleX,ColormapScaleY) + ColormapOffset
mappedColor   = Blend_Overlay(desaturate(g, 1), ColorMap(colormapUV).rgb)
color0        = UseColorMap ? mappedColor : plainColor
hueAmount     = ((HueTexture(WorldXY/HueVarianceScale).rgb + HuePreOffset)
                 * HueVarianceStrength) + HuePostOffset
color1        = HueShift(color0, hueAmount)
```

The shipped graph then applies `MF_WindColor` and the day-cycle MPC: base color is
wind-masked toward `color1 * dayBoost`, specular is wind-masked from `0.1` toward the
five-point day curve `(1,.4,.2,.4,1)`, roughness is `grassRough`, metallic is zero,
normal is flat `(0,0,1)`, and emissive is final base color times `Grass Emissive=.03`.
`GlobalScale=1600`, variance scale `8417.2`, variance multiply `2`.

### 5. Snow attributes (`MF_Snow`)

Snow color is a top-down world-XY projection, not triplanar:

```text
snowColor     = T_Snow_BC(WorldXY / SnowScale).rgb
snowSpec      = lerp(SnowSpecMin, SnowSpecMax,
                     T_ChromaNoise_Blurred(WorldXY / SnowSpecularScale).r)
roughness     = SnowRough
metallic      = 0
normal        = (0,0,1)
emissive      = snowColor * SnowEmission * day/weather factor + sparkle
```

Defaults are scale `5000`, specular scale `75`, specular `.1-.3`, roughness `.5`, and
emission `.05`. `SnowSparkle?` and `SnowSparkleDualLayer?` are true: two view-dependent
emissive sparkle layers use scales `1600/1000`, brightness `20/20`, rotations `0/.31`,
contrast `3`, tolerance `.95`, speed `1`, fade `200-2500`, shrink `.3` over
`500-1500`, projection contrast `20`, and color `(0.627031,0.663767,1)`.

### 6. Runtime virtual-texture seam blend

Every one of the 17 SnowPines rock materials has `UseVTBlend? = true`. After the top
layer, `MF_VTBlend` samples the landscape RVT at explicit mip 4:

```text
heightDelta    = AbsoluteWorldPosition.z - RVTWorldHeight
colorAlpha     = pow(1 - sat((heightDelta + Offset) / Distance), Falloff)
normalSpecA    = 1 - sat(heightDelta / (Distance / 6))

BaseColor      = lerp(object.BaseColor, RVT.BaseColor, colorAlpha)
Specular       = lerp(object.Specular, RVT.Specular, normalSpecA)
Normal         = BlendNormals
                 ? lerp(object.Normal, WorldToTangent(RVT.Normal), normalSpecA)
                 : object.Normal
```

Defaults are offset `0`, distance `100`, falloff `2`, and `BlendNormals? = true`.
Roughness is deliberately not copied from the RVT.

### 7. Rain wetness and opacity

`MF_RainWetness` is last. SnowPines targets use `RainWetness?=true`,
`RainPuddles?=false`, `DropRipples?=true`; puddle/ripple branches compile away.

```text
roughness = lerp(roughness, WetRoughness=.3, MPC.RainWetness)
specular  = lerp(specular, sat(specular * WetSpecular=1), MPC.RainWetness)
emissive += fakeEnvironmentReflection * MPC.RainWetness * wetnessMap
baseColor and normal are unchanged when RainPuddles? is false

wetnessMap = (TopGrass? || TopSnow?) ? 1 - topMask : 1
```

The fake reflection is a tinted, contrast-shaped reflection-vector texture using
`Faked Wet Reflection=5`, `Reflection Contrast=1.3`, and tint
`(.569374,.769240,1)`. It is the only wet term suppressed on the top layer by
`wetnessMap`; the roughness lerp is global.

`M_Rock`'s opacity mask is only
`DitherTemporalAA(PerInstanceFadeAmount)`. There is no texture-alpha transparency.
With fade `1` it is fully opaque; during foliage/ISM culling it temporally dithers out.

## `M_Mountain` / `MI_Mountain_Snowy`

The mountain material writes only Base Color, Specular, and Roughness. It has no normal,
metallic, emissive, opacity, moss, weather, or RVT branch. Vertex/geometric normals drive
lighting and the grass slope test.

For `MI_Mountain_Snowy`:

```text
tc             = AbsoluteWorldPosition.xy / 32000
rock           = T_RockClassic_BC(tc).rgb
grassTex       = desaturate(T_Grass1_BC(tc * 2).rgb, 0)
snow           = T_Snow_BC(tc).rgb

n              = cheapContrast(T_NoiseStylized(WorldXY / 320000).r, .3) - .5
flatness       = VertexNormalWS.z
v              = UV0.y                         // LinearGradient.V

grassSlope     = linearRamp(flatness + n*.133068994,
                            1-.126000002, 1-.126000002+.05)
grassHeight    = remap10(1-v, .032000002, .032000002+.2)
grassMask      = sat(grassSlope * grassHeight)

grassA         = grassTex * (1,1,1)
grassB         = grassTex * (.890625,.810540974,.595349014)
grassColor     = lerp(grassA, grassB, n)        // n is intentionally unclamped
grassColor     = lerp(grassColor, grassColor*3, Fresnel(N,V,5))

snowMask       = remap10(v + n*.952030003, .660000026, .710000026)
nearColor      = lerp(lerp(rock, grassColor, grassMask), snow, snowMask)

distanceAlpha  = linearRamp(PixelDepth, 50000, 400000) * .4
distant        = lerp((.017090,.132921,.364583),
                      (.017090,.132921,.364583)*1.2,
                      Fresnel(N,V,2))
BaseColor      = lerp(nearColor, distant, distanceAlpha)
Specular       = .7
Roughness      = .7
```

## Material-instance families used in SnowPines

Common Classic values are `ProjectionContrast=.5`, roughness `1.2`, specular `.2`,
metallic `.1`, rock-normal distance `20000`, distant normal flatness `1`,
top offset/sharpness `-2/12`, and all weather/RVT switches above enabled.

| Family in map | Material-defining overrides |
| --- | --- |
| Boulder clumps | Stylized normal `T_BoulderClumpClassic_N`; snow child enables `TopSnow` |
| Boulders | Rock scale `2000`; stylized normal `T_RockClassic_Boulders_N`; moss/snow children enable the corresponding layer |
| Cliffs | Rock scale `3500`, normal flatten `.2`, stylized normal `T_RockClassicCliffs_N`, UV top mask, top grass; no-grass child disables it; snow child enables top snow |
| Rocks | Rock scale `1400`, color `T_RockClassic_Rocks_BC`, stylized normal `T_RocksClassic_Rocks_N`; snow child sets snow scale `2000` (its offset/sharpness overrides do not drive the top mask) |
| Shelves | Stylized normal `T_RockClassic_Shelves_N`, UV top mask, top offset/sharpness `-8.9942245/30.586060`, top grass; snow child changes grass to snow |
| Spire rocks | `T_RockSpire_BC/T_RockSpire_N`, scale `2000`, normal distance `42422.957`, flatten `.2`, `FlatTopCrackNormals=true`, projection contrast `3`, roughness `1.6`, top snow |
| Spire shelves | Scale `3811.5005`, distance `100000`, flatten `.2`, `WorldAlignedSides=true`, projection contrast `3`, roughness `1.6`, top snow; inherited top mask is disabled |
| Spire spires | Scale `5400`, distance `59101.477`, projection contrast `3`, roughness `1.6`, top offset/sharpness `-.272000/8`, top snow |
| Mountain | Five actors use the exact `MI_Mountain_Snowy` values in the previous section |

## Active texture interpretation

All listed textures wrap on U and V. Preserve the supplied import color space even when
the semantic name suggests a data map: Unreal samples several masks/roughness maps as
sRGB color.

| Texture group | Active channels | Source import |
| --- | --- | --- |
| `T_RockClassic_BC`, `T_RockClassic_Rocks_BC`, `T_RockSpire_BC` | RGB base color; R reused for fallback roughness | sRGB, default compression, 4096² |
| All `*_N` rock/stylized normals | RGB normal | linear, `TC_NORMALMAP`, 2048² or 4096² |
| Classic cliff/shelf `*_GrassMap` | R top-layer mask | **sRGB**, default compression, 2048²/1024² |
| Spire shelf `*_GrassMap` | R top-layer mask (inactive in its SnowPines snow child) | linear, `TC_MASKS`, 4096² |
| `T_Grass1_BC` | RGB grass | sRGB, 4096² |
| `T_Grass1_R` | R grass roughness | **sRGB**, 4096² |
| `T_Grass_ColormapVol1` / conditional browser Snow colormap | RGB overlay color | sRGB, 1024² |
| `T_NoiseRough` | R grass variance | sRGB, 2048² |
| `T_Snow_BC` | RGB snow | sRGB, 1024² |
| `T_ChromaNoise_Blurred` | R snow specular variation | sRGB, 256² |
| `T_NoiseStylized` | R/RGB mountain noise and moss pattern | sRGB, 4096² |

The two ToonLab loaders correctly apply manifest `srgb`, wrap mode, and `flipY=false`
for this path. Do not “correct” `T_Grass1_R` or the Classic masks to linear unless the
source assets are reimported and re-authored too.

## Concrete browser discrepancies

`soStylizedSourceMaterials.js` does not implement rocks directly: lines 855-860 delegate
both `rock` and `mountain` to
`src/rockgen/reference/referenceSourceMaterial.js`. Therefore its generic
`wetSurface()` (lines 152-166) never affects these materials.

Priority order for bringing the port to source parity:

1. **Top projection is materially wrong.** `referenceSourceMaterial.js:399-407` uses a
   fixed `smoothstep(.56,.82, geometricNormal.y)`. It ignores `Top Layer Offset`,
   `Top Layer Sharpness`, the authored combined normal, and the linear/clamped engine
   blend. It also loads `Top Layer Mask` only for grass/sand at lines 566-567, so snowy
   Classic cliffs and shelves lose their required UV mask.
2. **World-aligned sampling is only an approximation.** Lines 149-162 hard-code
   `pow(abs(N),4)` and ignore `Projection Contrast` (`.5` Classic, `3` Spire).
   World-aligned normal RGB is blended before tangent decode instead of reorienting each
   projection as `WorldAlignedNormal` does. `FlatTopCrackNormals` is approximated by a
   second hard-coded slope fade at lines 509-510.
3. **RVT seam blending is absent.** All map rocks request it. The current material never
   samples ToonLab's ground field for source base color/specular/normal near the mesh
   base.
4. **Snow attributes are wrong/incomplete.** Lines 412-427 use triplanar color, constant
   midpoint specular, and no sparkle. Source snow is world-XY planar, has the blurred
   noise specular map, flat normal, day/weather emission, and two sparkle layers.
5. **Rain wetness is absent for delegated rocks.** The correct no-puddles branch changes
   roughness and adds a masked fake reflection; it does not darken base color. The generic
   helper, even if applied, darkens color and omits the reflection.
6. **Mountain masks use the wrong math.** Lines 298-341 omit the active `.3`
   `CheapContrast`, use cubic `smoothstep` instead of linear remaps, and use Euclidean
   distance instead of `PixelDepth`. These errors alter all grass/snow boundaries and the
   distant-color fade.
7. **Moss is a different shader.** Lines 432-448 use an additive noise/slope smoothstep,
   reverse the authored color ordering, modify only base color, and apply moss after the
   top layer. Source squares the pattern/mask, changes roughness/specular/metallic, and
   applies moss before grass/snow.
8. **UE specular semantics are not Three specular-intensity semantics.** Unreal Default
   Lit dielectric `F0 = .08 * Specular`; Three's default IOR 1.5 gives about
   `.04 * specularIntensity`. Passing `.2` or `.7` directly at lines 483/353 yields about
   half the intended dielectric F0. Match F0 explicitly (or use roughly 2x intensity
   where the renderer permits it).
9. **The material dither is exact; evaluated instance fade remains.** The browser now
   evaluates the exported UE 5.8 `DitherTemporalAA` graph/noise at the source temporal
   sample in visible and shadow passes, with `PerInstanceFadeAmount=1` for fully visible
   reference rocks. The source scene's evaluated foliage/ISM cull and LOD fade values are
   not exported yet. The active UE Gen4 MainUpsampling/High core now follows the exact
   eight-sample jitter; responsive stencil, encoded primitive-mobility ownership, exact
   half arithmetic/quantization, non-identity pre-exposure, and pixel sign-off remain.
10. **Grass subgraph omissions remain.** The close/broad texture blend is present, but
    hue variation, wind-color/day modulation, source specular behavior, and its input
    textures are not. The hard-coded `.35` specular at line 232 is not the source graph.
11. **The browser conditionally rewrites source parameters.** Lines 53-66 replace the
    Classic instance's `T_Grass_ColormapVol1` and `100000` scale with Snow colormap and
    `50000` when `sourceAssetName == Demonstration_SnowPines`. That is a deliberate look
    adjustment, not an override present in the supplied material instance; keep it behind
    an explicit non-reference mode if exact parity is required.
12. **Small base-path differences remain.** Rock fallback contrast uses multiplier
    `1.35` at line 456 instead of `CheapContrast(...,.3)` (`1.3`), and distance tint/
    normal fades use Euclidean distance/smoothstep instead of `PixelDepth`/linear ramps.

The most valuable first implementation slice is: shared UE-linear remap and depth,
parameterized `WorldAlignedTexture`/`WorldAlignedNormal`, exact explicit-normal top mask
including snow UV masks, then the planar snow/specular path. Those changes address the
dominant SnowPines cliff and shelf mismatches before adding RVT, weather, and sparkle.

## Relevant renderer behavior

The supplied project enables runtime virtual textures and mesh distance fields; disables
static lighting, virtual shadow maps, ray tracing, and Substrate; sets dynamic GI method
to `0` and reflection method to `2`; and uses `r.AntiAliasingMethod=2` (TAA). TAA is
required for `DitherTemporalAA` to look like a fade. Source roughness values above one
(`1.2` and `1.6`) are accepted in the graph but saturate in the generated material path.
Lighting, fog, exposure, skylight/reflection capture, and tone mapping remain part of the
final appearance; these shaders alone are not a self-contained toon renderer.
