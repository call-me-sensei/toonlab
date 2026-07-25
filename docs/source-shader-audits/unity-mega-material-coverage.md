# Unity Mega material coverage

> Historical first-pass inventory. Use `docs/unity-shader-port-ledger.json` and
> the family verifiers for current completion status; the counts and port-order
> sections below record the gaps that drove the original implementation.

This audit treats the supplied Unity 6000.5 / URP 17.5 project as the only
source of truth. Unreal material names, graphs, and rendering are deliberately
excluded.

Authority:

- scene: `Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity`
- exported inventory: `assets-local/sostylized-unity/mega-scene/scene-manifest.json`
- source project: `/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial`
- runtime implementations inspected:
  - `src/rockgen/reference/unityRockMaterial.js`
  - `src/environment/soStylizedUnityEnvironmentMaterials.js`
  - `src/environment/soStylizedUnityTreeMaterials.js`
  - `src/environment/soStylizedUnityUrpLighting.js`

## Result

The exported scene contains **14 distinct Unity shader families** and **145
resolved material assets**. Current Unity-specific ToonLab coverage is:

- **2 complete families**: `S_Rock`, `S_Mountain`
- **5 partial families**: `S_FoliageShader`, `S_Leaves`, `S_Bark`, URP
  `Terrain/Lit`, and URP `Lit`
- **7 missing families**: `S_Snow`, `S_StylizedBasic`, `S_StylizedClouds`,
  `S_StylizedSky`, `S_StylizedWater`, `S_WaterWaves`, and `S_Waterfall`
- **12 family gates remain open**
- **30 of 145 material profiles** have their connected graph/value path
  represented exactly in a Unity-specific builder: 25 rocks, one mountain,
  `MV_Grass`, `MV_GrassSnow`, `M_PineLeaves`, and `M_PineBark`

"Exact" here means the connected Unity Shader Graph and serialized material
inputs are implemented. It does not claim final pixel parity across the URP
and WebGPU renderers. "Partial" means a subset of material variants or only
input/BRDF infrastructure exists. Generic ToonLab shaders and the legacy
source-material builders do not count as Unity ports.

There is also not yet one Mega-scene material dispatcher which consumes
`manifest.materials[N]` and invokes these builders. Consequently, loading the
neutral transport GLB alone reconstructs **zero** custom Unity materials
automatically even though 30 profiles have usable graph implementations.

## Usage-count definitions

- **Scene slots**: material slots on active, enabled `MeshRenderer`s in the
  Unity scene hierarchy. This is whole-scene usage, not camera-frustum usage.
- **Tree slots**: material-slot uses after expanding the 1,695 serialized
  `Terrain.treeInstances` through their prefab prototypes.
- **Detail density**: exact sum of the 17 serialized 1024x1024 signed integer
  terrain detail-density fields for prototypes using the family. It is a
  source population, not a promise that Unity draws every sample at once;
  distance, density scaling, and culling still apply.
- The terrain material is bound through `Terrain.materialTemplate`, not a
  `MeshRenderer`, so it is called out separately.

Across the manifest there are 1,502 active scene slots, 4,031 expanded tree
slots, and 34,573,217 detail-density samples.

## Family coverage matrix

| Unity shader | Materials | Scene slots | Tree slots | Detail density | Coverage | Exact profiles | Required work |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| `Shader Graphs/S_Rock` | 25 | 513 | 141 | 0 | exact | 25/25 | Wire the existing manifest/name resolver into the Mega scene dispatcher; renderer/image sign-off remains. |
| `Shader Graphs/S_Mountain` | 1 | 10 | 0 | 0 | exact | 1/1 | Bind `MV_Mountain` through the same dispatcher; no new graph port. |
| `Shader Graphs/S_FoliageShader` | 23 | 181 | 696 | 34,378,491 | partial | 2/23 | Generalize the hard-coded grass path to manifest-driven values/textures; add the 20 textured variants and `MV_Grass_LOD` branch. |
| `Shader Graphs/S_Leaves` | 58 | 462 | 1,899 | 0 | partial | 1/58 | Generalize the hard-coded plain-pine implementation to all textures, colors, gradients, LOD/single-material branches, wind, SSS, normals, and smoothness variants. |
| `Shader Graphs/S_Bark` | 28 | 322 | 1,271 | 0 | partial | 1/28 | Generalize plain pine; port tint, per-species maps, moss, snow, world/vertex projection switches, and material values. |
| `Universal Render Pipeline/Terrain/Lit` | 1 | 0 | 0 | 0 | source-complete | 1/1 | Exact height/hole/splat/layer/importer inputs and the nonlinear 4+1 URP pass topology are connected. Native adaptive patch LOD and imported DXT block identity remain renderer/API bridges. |
| `Universal Render Pipeline/Lit` | 2 | 2 | 16 | 0 | partial | 0/2 | The URP BRDF bridge exists; add a plain URP Lit input/material builder and bind the two pine-snow LOD materials. |
| `Shader Graphs/S_Snow` | 1 | 6 | 8 | 0 | missing | 0/1 | Port `SG_Snow`, including triplanar-versus-vertex projection, tint, smoothness, and emission. |
| `Shader Graphs/S_StylizedBasic` | 1 | 0 | 0 | 194,726 | missing | 0/1 | Port texture/scalar switches, randomized normalized-HSV hue, normal strength, roughness-to-smoothness inversion, and emission. |
| `Shader Graphs/S_StylizedClouds` | 1 | 1 | 0 | 0 | missing | 0/1 | Port three animated `SG_Clouds` layers, shared noise modulation, max/lerp composition, tint, strength, and transparent unlit state. |
| `Shader Graphs/S_StylizedSky` | 1 | 1 | 0 | 0 | missing | 0/1 | Port the serialized sky gradient plus fixed background-cloud texture UV transforms/blend in an opaque unlit material. |
| `Shader Graphs/S_StylizedWater` | 1 | 2 | 0 | 0 | missing | 0/1 | Port scene-depth color/opacity, normal/detail blend, flipbook caustics, shoreline foam, Fresnel/distance specular, fake cubemap reflection, and transparent render state. |
| `Shader Graphs/S_WaterWaves` | 1 | 1 | 0 | 0 | missing | 0/1 | Port animated noise/mask composition, `SG_StylizedThreshold`, foam/emission, alpha clip, and transparent specular-lit state. |
| `Shader Graphs/S_Waterfall` | 1 | 1 | 0 | 0 | missing | 0/1 | Port top/bottom gradient, two animated threshold-noise layers, distortion, edge/waterline masks, vertex influence, opacity, emission, and transparent specular-lit state. |

## Material names by family

Every name below is referenced by the exported scene hierarchy, a terrain
detail/tree prototype, or the terrain material template.

### `S_Rock` — 25/25 exact

`MV_RockClassic_Cliff`, `MV_RockSpire_Shelves`,
`MV_RockClassic_Cliff_NoGrass`, `MV_RockClassic_Shelves`,
`MV_RockClassic_Cliff_Snow`, `MV_RockSpire_Spires`,
`MV_RockClassic_ClumpClassic`, `MV_RockSpire_Spires_Snow`,
`MV_RockSpire_Shelves_Snow`, `MV_RockClassic_Shelves_Snow`,
`MV_RockClassic_Boulders`, `MV_RockSpire_Rocks`, `MV_RockHexic_Rocks`,
`MV_RockHexic_RockSlanted`, `MV_RockHexic_Pieces`,
`MV_RockHexic_Spire`, `MV_RockHexic_Spire_Mossy`,
`MV_RockHexic_Platforms`, `MV_RockClassic_Rocks`,
`MV_RockClassic_Shelves NoGrass`, `MV_RockSpire_Rocks_Mossy`,
`MV_RockHexic_Rocks_Mossy`, `MV_RockClassic_Rocks_Mossy`,
`MV_RockClassic_Rocks_Snowy`, `MV_RockClassic_Boulders_Snowy`.

All 25 names exist in
`assets-local/sostylized-unity/rock-material-library.json`; no material-name
fallback is needed for the Mega scene.

### `S_Mountain` — 1/1 exact

`MV_Mountain`.

### `S_FoliageShader` — 2/23 exact profiles

Implemented values: `MV_Grass`, `MV_GrassSnow`.

Not exact: `MV_Grass_LOD`, `MV_LilyPads`, `MV_FlowerBushFlowers`,
`MV_IvyCoastal`, `MV_IvyCoastalVines`, `MV_BushChina`, `MV_Daisy`,
`MV_Daffodils`, `MV_FlowersIce`, `MV_Weed`, `MV_BushLeafyLeaves`,
`MV_BushLeafyLeaves_Desert`, `MV_BushTropical`, `MV_ElephantEars`,
`MV_Ferns`, `MV_FernsYellow`, `MV_Foxtails`, `MV_RedFerns`, `MV_Rice`,
`MV_Sunflower`, `MV_FlowerCrocus`.

Twenty of the 23 Mega materials enable `_Use_Texture`; the current builder
implements only the non-textured grass branch. `MV_Grass_LOD` is the sole
Mega foliage material with `_LOD=1`; its name also does not match the current
`_LOD[12]` route, so the no-WPO LOD branch is not reproduced.

The dominant terrain populations are:

| Material | Scene slots | Tree slots | Detail density |
| --- | ---: | ---: | ---: |
| `MV_Grass` | 77 | 0 | 24,368,549 |
| `MV_Daisy` | 0 | 0 | 3,884,184 |
| `MV_GrassSnow` | 0 | 0 | 2,888,791 |
| `MV_Daffodils` | 0 | 0 | 1,830,736 |
| `MV_Weed` | 0 | 0 | 1,133,380 |
| `MV_FlowersIce` | 0 | 0 | 272,851 |
| `MV_Foxtails` | 0 | 235 | 0 |
| `MV_BushTropical` | 0 | 160 | 0 |

### `S_Leaves` — 1/58 exact profile

Implemented: `M_PineLeaves`.

Not exact: `M_RedMaple Gold`, `MV_RedMaple Gold_LOD1`,
`MV_RedMaple Gold_SingleMat`, `MV_PineLeaves_LOD1`,
`MV_PineLeaves_SingleMat`, `MV_KnotwoodLeaves_Gold`,
`MV_KnotwoodLeaves_Gold_LOD1`, `MV_KnotwoodLeaves_Gold_SingleMat`,
`M_BirchLeaves`, `MV_BirchLeaves_SingleMat`, `MV_BirchSaplingLeaves`,
`M_FlowerBushLeaves`, `MV_FirLeaves_Dry`, `MV_OakLeaves_Snowy`,
`MV_OakLeaves_Snowy_LOD1`, `MV_OakLeaves_Snowy_SingleMat`,
`M_PalmLeaves`, `M_BananaLeaves`, `MV_FirLeaves_Sapling`, `M_FirLeaves`,
`MV_FirLeaves_SingleMat`, `M_ChinaPineLeaves`,
`MV_ChinaPineLeaves_LOD1`, `MV_ChinaPineLeaves_SingleMat`,
`M_KnotwoodLeaves`, `MV_KnotwoodLeaves_LOD1`,
`MV_KnotwoodLeaves_SingleMat`, `MV_BambooLeaves_Sapling`,
`MV_BambooLeaves_Sapling_LOD1`, `MV_BambooLeaves_Sapling_SingleMat`,
`MV_OakLeaves Red`, `MV_OakLeaves Red_LOD1`,
`MV_OakLeaves Red_SingleMat`, `M_OakLeaves`, `MV_OakLeaves_LOD1`,
`MV_OakTree_SingleMat`, `M_BushLeaves`, `MV_OakLeaves_Sapling`,
`M_BambooLeaves`, `MV_BambooLeaves_LOD1`, `MV_BambooLeaves_SingleMat`,
`M_BambooBushLeaves`, `MV_PineLeaves_SnowCover`,
`MV_PineLeaves_Snow_LOD1`, `MV_PineLeaves_Snow_SingleMat`,
`M_PineLeafyLeaves`, `MV_PineLeafyLeaves_LOD1`,
`MV_PineLeafyLeaves_SingleMat`, `MV_PineLeaves_Snow`,
`M_RedMapleLeaves`, `MV_RedMapleLeaves_LOD1`,
`MV_RedMapleLeaves_SingleMat`, `M_BushLeaves_Light`, `MV_BushLeavesDry`,
`M_BushLeaves_Snow`, `MV_BushSnowDead`, `MV_RedMapleLeaves_Sapling`.

Branches exercised by these 58 materials but absent from the hard-coded pine
builder include 26 `_LOD=1` variants, 14 `_SingleMaterialLOD=1` variants, six
color-texture variants, two smoothness-map variants, six world-gradient
variants, five two-sided-sign variants, and one wind-disabled variant. The
per-species leaf texture, gradient/color, SSS, smoothness, alpha, hue, and wind
values also need to come from the manifest rather than pine constants.

### `S_Bark` — 1/28 exact profile

Implemented: `M_PineBark`.

Not exact: `M_RedMapleBark`, `MV_PineBark_LOD1`, `M_KnotwoodBark`,
`MV_KnotwoodBark_LOD1`, `M_BirchBark`, `MV_BirchBarkMISC`,
`MV_FirBarkMISC`, `M_OakBark`, `MV_OakBarkMisc_MossVertex`,
`MV_OakBarkMisc`, `MV_OakBark_Snow`, `MV_OakBark_Snow_LOD1`,
`M_PalmBark`, `M_BananaBark`, `MV_PineBarkMISC_Snow`,
`MV_OakBarkMisc_Snow`, `MV_OakBarkMisc_MossWorld`, `M_FirBark`,
`M_ChinaPineBark`, `MV_ChinaPineBark_LOD1`, `M_BambooBark`,
`MV_BambooBark_LOD1`, `MV_OakBark_LOD1`, `MV_BambooBarkMISC`,
`MV_PineBark_Snow`, `MV_PineBark_Snow_LOD1`, `MV_RedMapleBark_LOD1`.

The family contains two moss-enabled profiles (one world-triplanar and one
vertex-aligned), six snow-enabled profiles, five tint-mix values, and multiple
species-specific diffuse/normal/smoothness map sets. The current plain-pine
builder has tint, moss, and snow all disabled.

### Remaining one-off families

| Shader | Material names |
| --- | --- |
| URP `Terrain/Lit` | `M_Universal Render Pipeline_Terrain_Lit` |
| URP `Lit` | `MI_PineSnow_LOD.001`, `MI_PineSnow_LOD` |
| `S_Snow` | `M_Snow` |
| `S_StylizedBasic` | `MV_BeachShells` |
| `S_StylizedClouds` | `M_Clouds` |
| `S_StylizedSky` | `M_StylizedSky` |
| `S_StylizedWater` | `M_StylizedWater` |
| `S_WaterWaves` | `M_WaterWaves` |
| `S_Waterfall` | `M_Waterfall` |

## Exact missing graph contracts

### Terrain/Lit

The Mega terrain is not a generic green plane. It is one 513x513 heightfield
with five 2048x2048 splat layers in this order:

1. `TL_Grass`: 12 m tile, metallic `.099`, smoothness `.25`
2. `TL_Dirt`: 16 m tile, normal map, metallic/smoothness `0/0`
3. `TL_Sand`: 12 m tile, normal map, metallic `.614`, smoothness `.228`
4. `TL_Rock`: 32 m tile, normal map, metallic/smoothness `0/0`
5. `TL_Snow`: 32 m tile, metallic `.791`, smoothness `0`

The source material enables `_TERRAIN_INSTANCED_PERPIXEL_NORMAL`, disables
height blending, and uses two control maps (RGBA for layers 0-3, R for layer
4). `soStylizedUnityMegaTerrain.js` now consumes the exact 513x513 height and
hole data, defaults to all five 2048x2048 float splats, applies the URP
half-texel control UV, layer UV/importer/PBR values, tangent-normal blend, and
metallic URP lighting. The fifth layer now runs as its independently lit
`Blend One One` add pass with source post-BRDF weight and `.005` clip. Native
adaptive Terrain patches and imported platform DXT blocks remain renderer/API
bridges documented in `unity-mega-terrain-runtime.md`.

### Foliage, leaves, and bark

The currently implemented grass/pine math is useful but is not a generic
family port. A shared manifest-driven builder must retain all graph switches
rather than infer behavior from names:

- `S_FoliageShader`: texture-versus-gradient color, texture alpha/tint,
  height/tip blend, normalized HSV variation, `SG_CameraDithering`,
  `SG_DistanceFade`, object/fragment distance choice, LOD WPO bypass, wind,
  lift offset, specular workflow, smoothness, and emission.
- `S_Leaves`: leaf alpha, gradient/color-texture/world-gradient branches,
  smoothness-map branch, two-sided normal sign, normalized HSV variation,
  `SG_SSS` emission, camera dither, single-material wood/leaf selection,
  LOD/wind WPO branches, and all per-material values.
- `S_Bark`: scaled UV diffuse/normal/smoothness, tint mix, emission/specular,
  triplanar or vertex moss, `SG_Snow` with world/vertex projection, and the
  exact sequential layer composition.

### Missing one-off graph families

- `S_Snow` is an opaque, front-face metallic-workflow Universal Lit graph. Its
  entire surface is the `SG_Snow` subgraph: triplanar/vertex projection,
  normal-based slope mask, tint, smoothness, and emission.
- `S_StylizedBasic` is opaque, front-face metallic-workflow Universal Lit. It
  has texture/scalar switches for base color, metallic, roughness, and normal;
  object-position randomized normalized-HSV hue; roughness inversion; normal
  strength; and emission. `MV_BeachShells` uses base and roughness textures,
  no metallic or normal map, and emissive `.4`.
- `S_StylizedSky` is opaque, front-face unlit. It samples the serialized five-
  key sky gradient and blends a fixed background-cloud texture using vertical
  offset, strength, opacity, and cloud color.
- `S_StylizedClouds` is transparent, front-face, Z-write forced off, unlit, and
  shadow-free. Three independently offset/squashed/panned `SG_Clouds` layers
  share an animated noise modulation before max/lerp composition.
- `S_StylizedWater` is transparent, front-face, specular-workflow Universal
  Lit with both cast and receive shadows off. It uses scene depth for water
  color/opacity and shoreline masks; base/detail animated normals; caustic
  flipbook sampling (`24 fps`, 256-cell resolution, 4x oversampling);
  shoreline foam; distance/Fresnel specular; and a normal-distorted fake
  reflection from `T_Clouds_HDR`.
- `S_WaterWaves` is transparent, two-sided, specular-workflow Universal Lit,
  alpha clipped, cast-shadows off. It combines animated smooth/rough noise and
  `T_WaterWavesMask`, runs `SG_StylizedThreshold`, and outputs foam color,
  `.08` emission, `.9` smoothness, and `.4` opacity.
- `S_Waterfall` is transparent, two-sided, specular-workflow Universal Lit,
  cast-shadows off. It combines a top/bottom color and opacity gradient with
  two animated/distorted noise layers, two `SG_StylizedThreshold` calls,
  edge/waterline textures, vertex influence, `.13` emission, and `.9`
  smoothness.
- The two plain URP Lit pine-snow LOD materials are identical in the manifest:
  opaque/front-face, specular workflow, base color `.9063317`, smoothness
  `.4909091`, specular color `.2`, no alpha clip, no mapped inputs. The custom
  URP BRDF model exists; a material-input builder and dispatcher route do not.

## Port order for the active Unity Mega comparison

1. Add one manifest material dispatcher and exact texture-import-state loader.
   This unlocks every subsequent family and lets the 30 implemented profiles
   bind without name heuristics.
2. Implement the real five-layer Terrain/Lit heightfield material. It owns
   most pixels in the active Unity camera.
3. Generalize `S_FoliageShader`, starting with `MV_Grass`,
   `MV_Grass_LOD`, `MV_Daisy`, `MV_GrassSnow`, `MV_Daffodils`, and `MV_Weed`.
4. Generalize `S_Leaves`, then `S_Bark`, prioritizing oak/bush/pine/birch
   profiles by expanded tree usage.
5. Bind the already-complete `S_Rock` and `S_Mountain` implementations and
   validate their geometry normals/tangents and shadow flags in the Unity
   scene.
6. Port `S_StylizedSky` and `S_StylizedClouds`; these are small graphs with
   large screen coverage.
7. Port the water set together (`S_StylizedWater`, `S_WaterWaves`,
   `S_Waterfall`) because depth, transparency ordering, and shared noise/foam
   assets must be validated as one stack.
8. Port `S_Snow`, plain URP Lit, and `S_StylizedBasic` for remaining snow and
   beach-detail coverage.

This order targets visual impact in the captured Mega camera, not alphabetical
completeness.

## Source hashes

| Graph | SHA-256 |
| --- | --- |
| `S_FoliageShader.shadergraph` | `1426bd360f44c10510f77a70450c86feca99f132819af6fe78130daabf369dd7` |
| `S_Leaves.shadergraph` | `94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62` |
| `S_Bark.shadergraph` | `0ab87ac5464f9b3d4e4090b2299cc4df55c0155ff79458e62b91a84829ff2689` |
| `S_Rock.shadergraph` | `a3bb01037314605728ba852d407df95e3bd9374f87e42c28cc28da49172e5f5b` |
| `S_Mountain.shadergraph` | `dcee9bf8279066e76e98871f7c61852f445be600571382d70dbca83f4fddc485` |
| `S_Snow.shadergraph` | `cdba7750b8caa9ceda09cd9dacad8dfda7dd21989a486078b051a434eb0ffb93` |
| `S_StylizedBasic.shadergraph` | `ff4e7d975365971441090ea6623a51d4bee0f8fb8d4a16c8f107bd32e92b330b` |
| `S_StylizedClouds.shadergraph` | `36f9fffbfd075f8c34c979e2995e1fac6966009ebb814c32de07c494a2593655` |
| `S_StylizedSky.shadergraph` | `df157d748c40ba9f059be99e76b44217eccf802c7c30e3a767659f989ec068c2` |
| `S_StylizedWater.shadergraph` | `630cb7d547eec84900a1f817eb6e7b7db6d6a89b2c336e615653067babdac204` |
| `S_WaterWaves.shadergraph` | `cc6d4231ac0b1247b6daf1012594df0d0eec4fa13888420d141f9bfe021e56cc` |
| `S_Waterfall.shadergraph` | `bf9c719bd9f8d42d8d6a75230da32e938d939e074a26a733f53f1d686164a685` |
