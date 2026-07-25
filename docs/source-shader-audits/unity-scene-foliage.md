# Unity Mega `S_FoliageShader` source port

This port is source-to-source. No screenshot, color picker, or visual tuning
value is part of the implementation.

Runtime module:
`src/environment/soStylizedUnitySceneFoliageMaterials.js`

Verifier:
`scripts/verify-so-stylized-unity-scene-foliage.mjs`

## Authorities

The canonical art inputs are the 23 material records and two texture records
in `assets-local/sostylized-unity/mega-scene/scene-manifest.json`. The graph
and generated-node authorities in the supplied Unity 6000.5 / URP 17.5
project are:

- `Assets/SoStylized-Unity/Environment/Foliage/Shaders/S_FoliageShader.shadergraph`
  (`1426bd360f44c10510f77a70450c86feca99f132819af6fe78130daabf369dd7`)
- `Assets/SoStylized-Unity/Materials/Shaders/SG_CameraDithering.shadersubgraph`
  (`95586ca209f762a059f221bbccab74df9685c4cddc997121596d4578bf1f45dd`)
- `Assets/SoStylized-Unity/Materials/Shaders/SG_DistanceFade.shadersubgraph`
  (`4e33f7f9a63fdabb33d32725b7a9d9264f32b8b3f7aa19819256b8e054539623`)
- `Library/PackageCache/com.unity.shadergraph@*/Editor/Data/Nodes/Artistic/Filter/DitherNode.cs`
- `Library/PackageCache/com.unity.shadergraph@*/Editor/Data/Nodes/Artistic/Adjustment/HueNode.cs`
- `Library/PackageCache/com.unity.shadergraph@*/Editor/Data/Nodes/Math/Range/RandomRangeNode.cs`
- `Library/PackageCache/com.unity.shadergraph@*/Editor/Data/Nodes/Procedural/Noise/GradientNoiseNode.cs`
- `Library/PackageCache/com.unity.render-pipelines.universal@*/Editor/ShaderGraph/Includes/PBRForwardPass.hlsl`
- `Library/PackageCache/com.unity.render-pipelines.universal@*/ShaderLibrary/BRDF.hlsl`

The verifier parses the concatenated Shader Graph JSON records, follows their
edges from the Vertex/Fragment blocks, checks the three source hashes, checks
the generated built-in HLSL formulas when the Unity PackageCache is present,
checks all 23 manifest records, constructs all 23 runtime materials, and
checks the imported texture state.

## Exact connected graph

`UniversalTarget` is opaque, Cull Off, alpha-clipped, casts and receives
shadows. `UniversalLitSubTarget.m_WorkflowMode=0`, so the connected Specular
port is the final F0 color. In generated `PBRForwardPass.hlsl`, the
`_SPECULAR_SETUP` branch assigns `surfaceDescription.Specular` directly to
`SurfaceData.specular`. ToonLab therefore installs
`installSoStylizedUnityUrpLighting(material, { workflow: 'specular' })`; it
does not reinterpret the color as a multiplier on Three's dielectric F0.

The fragment outputs are:

```text
textureColor = sample(FoliageTexture, UV0).rgba * TextureTint

tipNoise = sample(
  T_NoiseRough_SplatterMap,
  PositionWS.xz / HueVariationScale
).r

distanceTip = saturate(remap(
  distance(CameraWS, PositionWS),
  30, 80,
  0, 1
))

gradientTip = SampleGradientV1(exactGradient, tipNoise)
resolvedTip = UseSolidTipColor
  ? TipColor
  : lerp(gradientTip, TipColor, distanceTip)

gradientColor = lerp(BottomColor, resolvedTip, UV0.g)
preHue = UseTexture ? textureColor.rgb : gradientColor

seed = ObjectPositionWS.xz * 10
random = frac(sin(dot(seed, float2(12.9898, 78.233))) * 43758.5453)
hueOffset = lerp(-HueVariation, HueVariation, random) + HueShift
BaseColor = HueNormalized(preHue, hueOffset)
Emission = BaseColor * EmissiveStrength
Specular = SpecularColor
Smoothness = Smoothness
```

`HueNormalized` is the generated Shader Graph RGB-to-HSV, add a normalized
turn, wrap once into `[0,1]`, HSV-to-RGB function. It is not a degrees hue or
an axis-angle color rotation.

The exact linear-blend gradient is:

| Key | Linear RGB | Position |
| ---: | --- | ---: |
| 0 | `0.4357688427, 0.8939999938, 0.0314472169` | `0` |
| 1 | `0.2430000156, 0.7019999623, 0.0438749976` | `17926 / 65535` |
| 2 | `0.1446691453, 0.5660377741, 0.0133499457` | `42983 / 65535` |
| 3 | `0.7573568821, 0.8790000081, 0.0589273460` | `62258 / 65535` |

One misleading serialized property is intentionally a no-op:
`_Height_Blend` has no `PropertyNode` anywhere in the graph. `UV0.g` is wired
directly to the final bottom/tip Lerp. Using `_Height_Blend` would be a new
shader, not a port of the supplied one.

Alpha is:

```text
cameraTarget = ObjectDistanceForFade ? ObjectPositionWS : PositionWS
cameraVisibility = saturate(remap(
  distance(CameraWS, cameraTarget),
  MinDistanceFade, MaxDistanceFade,
  0, 1
))
cameraDither = Dither(cameraVisibility * 2)

distanceVisibility = saturate(remap(
  distance(PositionWS, CameraWS),
  StartFadeDistance, EndFadeDistance,
  1, 0
))
distanceDither = Dither(distanceVisibility * 2)

textureAlpha = UseTexture ? sample(FoliageTexture, UV0).a : 1
Alpha = textureAlpha * cameraDither * distanceDither
clip(Alpha - AlphaClipThreshold)
```

`Dither` subtracts Shader Graph's exact 4x4 `1/17 ... 16/17` Bayer threshold
selected from integer pixel coordinates. ToonLab uses a boolean
`greaterThanEqual` mask instead of `alphaTestNode`, because Unity's `clip`
keeps equality while Three's stock alpha-test path discards it. The same mask
is connected to the visible and shadow passes.

The connected vertex output is:

```text
windUV = UV0 + Time * float2(WindSpeed, 0)
windNoise = GradientNoise_Tchou(windUV, WindIntensity)
windOffsetOS = windNoise * float3(1, 0, 1) * WindWeight * COLOR.rgb

windPositionOS = LOD
  ? PositionOS
  : (UseWind ? PositionOS + windOffsetOS : PositionOS)

windPositionWS = TransformObjectToWorld(windPositionOS)
liftedPositionWS = windPositionWS
  + float3(0, AdditionalZOffset, 0) * COLOR.rgb
displacedPositionOS = TransformWorldToObject(liftedPositionWS)

VertexPosition = distanceVisibility < 0.05
  ? PositionOS
  : displacedPositionOS
```

The property is named `Additional Z Offset`, but its edge is connected to the
Y input of a Vector3 and added in world space. `_LOD=1` bypasses the wind
branch only; it does not remove this lift. That distinction is active for
`MV_Grass_LOD`.

The graph leaves Normal TS unconnected. URP therefore uses the unchanged
interpolated world normal on Cull Off back faces. The runtime assigns
`normalViewGeometry` explicitly so Three's default DoubleSide back-face
normal negate does not introduce an extra operation.

## Mega material coverage

The builder consumes every value from its canonical material record rather
than choosing a preset from the name:

- 23 total records
- 20 `_Use_Texture=1` records using the shared foliage sheet
- 3 gradient records: `MV_Grass`, `MV_Grass_LOD`, `MV_GrassSnow`
- 1 `_LOD=1` record: `MV_Grass_LOD`
- all 23 currently select fragment distance for camera dithering and enable
  wind; the generic object-distance and wind-off branches remain implemented
  from graph topology

The 23 names are `MV_LilyPads`, `MV_FlowerBushFlowers`, `MV_Grass`,
`MV_Grass_LOD`, `MV_IvyCoastal`, `MV_IvyCoastalVines`, `MV_BushChina`,
`MV_Daisy`, `MV_Daffodils`, `MV_GrassSnow`, `MV_FlowersIce`, `MV_Weed`,
`MV_BushLeafyLeaves`, `MV_BushLeafyLeaves_Desert`, `MV_BushTropical`,
`MV_ElephantEars`, `MV_Ferns`, `MV_FernsYellow`, `MV_Foxtails`,
`MV_RedFerns`, `MV_Rice`, `MV_Sunflower`, and `MV_FlowerCrocus`.

## TextureImporter parity

`T_FoliageSheet_BC` (manifest texture 54):

- exact source copy, sRGB
- GUI texture, alpha from input, alpha-is-transparency enabled
- Clamp U/V
- Bilinear magnification/minification
- mipmaps disabled
- anisotropy 1

`T_NoiseRough_SplatterMap` (manifest texture 55):

- exact source copy, sRGB (the R value is sampled after sRGB decode)
- Default texture
- Repeat U/V
- Bilinear with mipmaps (`LinearMipmapNearestFilter` is the Three equivalent
  of Unity's Bilinear rather than Trilinear minification)
- anisotropy 1

`Foliage Texture.useTilingAndOffset=false` in the graph. The serialized
material texture scale/offset therefore remains intentionally unused.

## Runtime API and geometry contract

```js
const material = await buildSoStylizedUnitySceneFoliageMaterial(
  materialRecord,
  sceneManifest,
  {
    baseUrl: '/assets-local/sostylized-unity/mega-scene',
    state,
    geometryHints: {
      hasVertexColors: geometry.hasAttribute('color'),
      // Required for exact Unity per-object hue/object-distance behavior when
      // multiple source objects are packed into one Three InstancedMesh:
      objectPositionNode: perInstanceUnityWorldOrigin,
    },
  },
);
```

Ordinary meshes use `modelPosition` exactly. A Three `InstancedMesh` has only
one parent `modelPosition`, unlike Unity's per-instance object matrix, so its
binder must provide a per-instance world-origin node. Geometry without
`COLOR_0` passes `hasVertexColors:false`; Shader Graph's missing-color default
is reproduced as white and therefore gives full wind/lift weight.

Run the source gate with:

```sh
node scripts/verify-so-stylized-unity-scene-foliage.mjs
```

