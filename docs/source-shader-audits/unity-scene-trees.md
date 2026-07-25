# Unity Mega scene tree material port

## Scope and authority

`src/environment/soStylizedUnitySceneTreeMaterials.js` is the manifest-driven
source reconstruction for every tree material used by exported
`M_Demonstration_Mega`:

- 58 `Shader Graphs/S_Leaves` material records
- 28 `Shader Graphs/S_Bark` material records

This audit is source-to-source. No screenshot, color picking, or visual tuning
was used. The authorities are, in order:

1. the connected node/edge topology in the supplied Unity Shader Graph files;
2. the 145 exported material records and 105 TextureImporter records in
   `assets-local/sostylized-unity/mega-scene/scene-manifest.json`;
3. the Shader Graph package's generated HLSL templates; and
4. URP 17.5's Universal Lit specular-workflow BRDF, installed by
   `installSoStylizedUnityUrpLighting`.

Pinned sources:

| Source | GUID | SHA-256 |
| --- | --- | --- |
| `S_Leaves.shadergraph` | `a65bec4bef9f96c4c9dde8ad2a20a99a` | `94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62` |
| `SG_SingleMaterialTree.shadersubgraph` | `cab5ae69164c8a04d9406ba069305408` | `925238411f958e3a0b308335f076d541d6bc5bc5ffeb8400f989a7cfe6010af0` |
| `SG_CameraDithering.shadersubgraph` | `0a5473d7af329294c8f319a1acc7f8cb` | `95586ca209f762a059f221bbccab74df9685c4cddc997121596d4578bf1f45dd` |
| `S_Bark.shadergraph` | `016550df8fe3d84418b52fbdc767f495` | `0ab87ac5464f9b3d4e4090b2299cc4df55c0155ff79458e62b91a84829ff2689` |
| `SG_Snow.shadersubgraph` | `6a05f3a127ccc3a48b05e65c3bbe517f` | `b90c7b780063bdc8008d58ed865d7ad36eea13a5b3e896cc2ac268f6d421be91` |

## `S_Leaves` connected topology

The material-record switches exercise all of the following connected paths:

| Switch | Enabled records |
| --- | ---: |
| `_LOD` | 26 |
| `_SingleMaterialLOD` | 14 |
| `_UseColorTexture` | 6 |
| `_UseGradient` | 45 |
| `_UseWorldGradient` | 6 |
| `_UseTwoSidedSign` | 5 |
| `_UseWind` | 57 |

### Color, gradient, and single-material path

The Base Color block is connected to `SG_SingleMaterialTree.Out_Vector4`.
That subgraph receives the normalized-HSV leaf result and performs the final
wood/leaf selection:

```text
uvGradient = TEXCOORD_2

uvGradientAmount = 1 - saturate(
  (uvGradient.y + GradientOffset) * GradientStretch
)

worldGradientAmount = saturate(
  Contrast(
    T_NoiseStylized(AbsoluteWorldPosition.xz / WorldGradientSize).rgb,
    WorldGradientContrast
  )
)

gradientAmount = UseWorldGradient
  ? worldGradientAmount
  : uvGradientAmount

unshiftedLeaf = UseColorTexture
  ? BasicColorTexture(UV0).rgb
  : UseGradient
    ? lerp(MainColor.rgb, GradientColor.rgb, gradientAmount)
    : MainColor.rgb

seed = ObjectPositionWS.xz * 10
random = frac(sin(dot(seed, [12.9898, 78.233])) * 43758.5453)
hueOffset = lerp(-HueVariation, HueVariation, random) + HueShift
leaf = ShaderGraphHueNormalized(unshiftedLeaf, hueOffset)

baseColor = SingleMaterialLOD
  ? lerp(SingleMaterialWoodTexture(UV0).rgb, leaf, VertexColor.r)
  : leaf
```

Shader Graph's generated Contrast function uses a linear-space midpoint, not
`0.5`:

```hlsl
half midpoint = pow(0.5, 2.2); // 0.217637640824031
Out = (In - midpoint) * Contrast + midpoint;
```

The world-gradient texture is the graph node's serialized
`T_NoiseStylized` input, exported in each record as
`_SampleTexture2D_db2fa32299ac42f38d0435a90020f5ea_Texture_1_Texture2D`.
It is not selected by material-name heuristics.

### Alpha, camera dither, and single-material coverage

The Alpha block's outer branch is `_SingleMaterialLOD`. Its true input is a
Lerp whose selector is `VertexColor.r`; its false input is the same leaf mask:

```text
fadePosition = ObjectDistanceForFade ? ObjectPositionWS : FragmentPositionWS
distance01 = saturate(
  (distance(CameraPositionWS, fadePosition) - MinDistanceFade)
  / (MaxDistanceFade - MinDistanceFade)
)

cameraDither = Dither(distance01 * 2, ScreenPosition)
leafAlpha = LeafTexture(UV0).r * cameraDither

alpha = SingleMaterialLOD
  ? lerp(1, leafAlpha, VertexColor.r)
  : leafAlpha

AlphaClipThreshold = AlphaClip
```

`DitherNode.cs` generates this exact threshold table and indexing rule:

```hlsl
static const half DITHER_THRESHOLDS[16] = {
  1.0/17.0,  9.0/17.0,  3.0/17.0, 11.0/17.0,
 13.0/17.0,  5.0/17.0, 15.0/17.0,  7.0/17.0,
  4.0/17.0, 12.0/17.0,  2.0/17.0, 10.0/17.0,
 16.0/17.0,  8.0/17.0, 14.0/17.0,  6.0/17.0
};
uint index = (uint(pixel.x) % 4) * 4 + uint(pixel.y) % 4;
Out = In - DITHER_THRESHOLDS[index];
```

The leaf mask comes from the red channel, not texture alpha.

### SSS/emission and physical inputs

`SG_SSS` is an Emission contribution. It does not select a different surface
shading model:

```text
V = normalize(CameraPositionWS - PositionWS)
L = shadergraph_URPMainLightDirection()
  = -GetMainLight().direction
back = remap(dot(L, -GeometryNormalWS), [-1, 1], [-1 + SSSOffset, 1])
sss = saturate(saturate(dot(V, L)) * back)

Emission = baseColor * EmissiveStrength
         + SSSColor * SSSBrightness * sss
Smoothness = Smoothness
Specular = SpecularColor
Metallic = 0
```

`_UseSmoothnessMap`, `_Smoothness_Texture`, and scalar `_Specular` are exposed
and serialized, and two Mega records even set `_UseSmoothnessMap=1`, but the
supplied graph contains no `PropertyNode` for any of those three fields.
`SurfaceDescription.Smoothness` is connected directly to `_Smoothness`, and
`SurfaceDescription.Specular` directly to `_Specular_Color`. The runtime keeps
the disconnected values in audit metadata and deliberately does not invent a
map/scalar branch.

The NormalTS output is:

```text
UseTwoSidedSign
  ? (IsFrontFace ? TangentNormal : -TangentNormal)
  : TangentNormal
```

### Vertex position

The outer vertex branch is `_UseWind`; its true input contains the `_LOD`
branch. Wind therefore runs only when `UseWind && !LOD`:

```text
windUv = AbsoluteWorldPosition.xz
       + normalize(WindDirection) * WindSpeed * Time
noise = SimpleNoise_Tchou(windUv, 1 / WindScale)
offset = remap(noise, [0,1], [-0.5,0.5])
       * WindIntensity * VertexColor.r
displacedWorldPosition = AbsoluteWorldPosition + offset.xxx
PositionOS = TransformWorldToObject(displacedWorldPosition)
```

The generated Simple Noise path uses three value-noise octaves with weights
`0.125`, `0.25`, and `0.5`, and Shader Graph's deterministic Tchou integer
hash (`1103515245`, `668265261`).

## `S_Bark` connected topology

The 28 records include two moss-enabled profiles and six snow-enabled
profiles. All switches and texture bindings are read from the manifest.

### Bark surface and importer-correct normal

The graph wires X/Y scale only into the diffuse Tiling And Offset node. Normal
and smoothness samples use unscaled UV0 (plus their texture property's `_ST`,
which is `[1,1,0,0]` in the exported records):

```text
diffuseUv = UV0 * [XScale, YScale]
bark = lerp(DiffuseTexture(diffuseUv).rgb, TintColor.rgb, TintMix)

normalTS = NormalStrength(UnpackNormal(NormalTexture(UV0)), NormalStrength)
smoothness = SmoothnessTexture(UV0).r * SmoothnessMultiplier
specular = SpecularColor
```

Every bark normal importer is `NormalMap`, linear, Repeat/Bilinear, mipmapped,
anisotropy 1, with `flipGreenChannel=true`. Because the runtime loads the exact
source PNG rather than Unity's imported DXT5 normal texture, it applies the
green flip, reconstructs positive Z from imported X/Y, then ports generated
`NormalStrengthNode` HLSL exactly:

```hlsl
Out = half3(In.rg * Strength, lerp(1, In.b, saturate(Strength)));
```

This is not Three's usual “scale XY and leave Z unchanged” normal-map helper.

### Moss

`S_Bark` connects Shader Graph's AbsoluteWorld triplanar node with
`MossSize` directly in its `Tile` input:

```text
p = AbsoluteWorldPosition * MossSize
w = abs(GeometryNormalWS) / sum(abs(GeometryNormalWS))
mossNoise = Triplanar(MossTexture, p, w).r

mossColor = lerp(MossColor2, MossColor, pow(mossNoise, 2))
direction = MossWorldAligned
  ? saturate(GeometryNormalWS.y * MossSharpness - MossOffset)
  : VertexColor.g
mossMask = saturate(pow(direction * MossMultiply * mossNoise, 2))

barkMoss = Moss ? lerp(bark, mossColor, mossMask) : bark
```

The direct `MossSize` tile connection is unusual but literal; replacing it
with `1 / MossSize` would not match the graph.

### Snow and sequential composition

`SG_Snow` uses `1 / SnowScale` for its AbsoluteWorld triplanar Tile and emits
an inverted coverage value:

```text
snowColor = Triplanar(SnowTexture, AbsoluteWorldPosition / SnowScale)
          * SnowTint
snowMask = Snow
  ? SnowWorldAligned
    ? saturate(GeometryNormalWS.y * SnowSharpness - SnowOffset)
    : VertexColor.g
  : 0
SG_Snow.Alpha = 1 - snowMask

BaseColor = lerp(snowColor, barkMoss, SG_Snow.Alpha)
Emission = BaseColor * EmissiveStrength
```

The subgraph also declares `Smoothness` and `Emission` outputs, and the
material records serialize `_Snow_Smoothness` and `_Snow_Emission`, but
`S_Bark` connects neither output to a master block. Likewise
`_Moss_Smoothness`, `_Moss_Specular`, and scalar `_Specular` do not control a
connected master output. The connected material smoothness remains the bark
smoothness texture and the connected specular remains `_Specular_Color` even
under moss/snow.

## Coordinate and geometry contracts

The scene exporter mirrors Unity Z into Three/glTF Z. The builder defaults to
`coordinateZSign: -1` and converts world-projected coordinates, object hue
seeds, and wind displacement into Unity coordinates before evaluating graph
math. UV-based maps are unchanged. The sun direction supplied through scene
state is expected in the converted Three scene coordinates.

Material creation can be specialized per primitive using:

```js
geometryCapabilities: {
  hasUv2: Boolean(geometry.getAttribute('uv2')),
  hasVertexColors: Boolean(geometry.getAttribute('color')),
  hasTangents: Boolean(geometry.getAttribute('tangent')),
}
```

`TEXCOORD_2` drives the leaf gradient, `COLOR.r` drives leaf wind and the
single-material leaf selector, `COLOR.g` drives vertex-projected bark moss or
snow, and tangents are required for the exact bark normal-map path. If the
caller explicitly reports a missing tangent attribute, the builder keeps the
geometry normal and records that bridge in material metadata.

## Texture importer contract

The builder resolves texture indices, source copies, and sampler state from
the manifest. It does not infer texture files from material names. It applies:

- sRGB versus linear from `TextureImporter.sRGBTexture`;
- Repeat/Clamp/Mirror wrap mode;
- Point/Bilinear/Trilinear and mipmap state;
- anisotropy; and
- the normal-map green-channel import transform described above.

Leaf masks are not universally non-mipmapped: the importer records keep
mipmaps off for the common pine/maple/deciduous cards, but on for palm,
banana, bamboo, and bush-snow cards. Each source record is retained exactly.

## Integration API

```js
import {
  buildSoStylizedUnitySceneTreeMaterial,
} from './src/environment/soStylizedUnitySceneTreeMaterials.js';

const material = await buildSoStylizedUnitySceneTreeMaterial(materialRecord, {
  textureRecords: sceneManifest.textures,
  baseUrl: '/assets-local/sostylized-unity/mega-scene',
  state: unityEnvironmentState,
  coordinateZSign: -1,
  geometryCapabilities: {
    hasUv2: Boolean(geometry.getAttribute('uv2')),
    hasVertexColors: Boolean(geometry.getAttribute('color')),
    hasTangents: Boolean(geometry.getAttribute('tangent')),
  },
});
```

The dispatcher returns a `MeshPhysicalNodeMaterial` and installs the exact
URP Universal Lit specular-workflow lighting adapter. Family-specific entry
points are also exported:

- `buildSoStylizedUnitySceneLeavesMaterial(record, options)`
- `buildSoStylizedUnitySceneBarkMaterial(record, options)`
- `readSoStylizedUnitySceneTreeMaterialParameters(record)`
- `isSoStylizedUnitySceneTreeMaterialRecord(record)`

## Verification

```sh
node scripts/verify-so-stylized-unity-scene-tree-materials.mjs
npm run build
```

The verifier hashes all five graph/subgraph sources, parses their concatenated
Shader Graph JSON documents, follows exact edges into every relevant master
block, proves the disconnected-property cases, checks all 86 material records
and importer contracts, constructs every profile with a verification texture
loader, and asserts the URP specular workflow and runtime topology metadata.
