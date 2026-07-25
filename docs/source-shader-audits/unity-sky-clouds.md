# Unity Mega sky/cloud source port

This audit is source-to-source. No screenshot, sampled pixel, color picker, or
visual tuning value was used. The authority is the supplied Unity project at
`Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity`, its Unity-generated
pass HLSL, the exported Mega `scene-manifest.json`, and the installed URP
17.5.0 package source.

The central source fact is unambiguous: both `S_StylizedSky` and
`S_StylizedClouds` select `UniversalUnlitSubTarget`. Neither graph consumes a
main light, ambient probe, received shadow, or BRDF. The runtime port therefore
uses `MeshBasicNodeMaterial` and deliberately does not install ToonLab's URP
lighting bridge. Adding directional or ambient lighting to these two materials
would be a departure from the Unity source.

## Pinned authority

| Source | SHA-256 |
|---|---|
| `Environment/Sky/Shaders/S_StylizedSky.shadergraph` | `df157d748c40ba9f059be99e76b44217eccf802c7c30e3a767659f989ec068c2` |
| `Environment/Sky/Shaders/S_StylizedClouds.shadergraph` | `36f9fffbfd075f8c34c979e2995e1fac6966009ebb814c32de07c494a2593655` |
| `Environment/Sky/Shaders/SG_Clouds.shadersubgraph` | `ed05bb3c27cf4d792f260e6ddbe6fc65220d5ec819b6b575a15caab5760eea81` |
| `Environment/Sky/Materials/M_StylizedSky.mat` | `2194bb7058ba6d13e8d9cb1bda09d595c07fbaa56514284976b3d775013489cd` |
| `Environment/Sky/Materials/M_Clouds.mat` | `e0c568732b2b3f55e1b95f04eccbd58388b8c043441b897d170b8db4db317782` |
| generated `S_StylizedSky` URP Unlit pass | `ef218577b105e923daca377fb06dc7a5c4f37a9be1404a80293226e51b8e2abd` |
| generated `S_StylizedClouds` URP Unlit pass | `cecb1cde74dd02557cc0a82b17e5fc220d88d8ea78aa4a8a0d31d3ee4c38c51a` |
| URP 17.5.0 `UniversalTarget.cs` | `59da4b566154435e56bff75597fcef0cad5604b96f43f303ebe54de3ce252a58` |
| URP 17.5.0 `UnlitPass.hlsl` | `4fc1f6bbc4dd959fbd2127c98e5806b35d53ffe57c1b12179519af679e8e6f4e` |
| URP 17.5.0 `Unlit.hlsl` | `acc3485ba8bef1432f58a86b6292a6270f7bdb902ee378173eb5810dd8783035` |

The verifier additionally pins the complete connected node/edge topology:

| Graph | Nodes | Edges | Topology SHA-256 |
|---|---:|---:|---|
| `S_StylizedSky` | 29 | 26 | `4f53e4c4536773de2c0444daeabd3f439af53d8284a8d68bc8d51e07c5bc1e56` |
| `S_StylizedClouds` | 38 | 48 | `07841df50af3733cbdc5db095b0ed0057e9b0f58eed427404f8f0334dcdcc8df` |
| `SG_Clouds` | 32 | 35 | `a6ccaf29c3f1a7bba8238cf48d723d3491d4edeb217096208b33d6da4f272d5f` |

## Exact `M_StylizedSky` graph

The generated surface has one output, `BaseColor`:

```text
gradientTime = ((UV0.g).xx * (1,1) + (0, VerticalOffset)).x
             = UV0.g

skyGradient = SampleGradient(SkyGradient, gradientTime)
cloudUv     = UV0.xy + (0, VerticalOffset)
cloudBlend  = T_BackroundClouds1B(cloudUv).r * CloudColor
screen      = 1 - (1 - cloudBlend) * (1 - skyGradient)
BaseColor   = lerp(skyGradient, screen, CloudOpacity).rgb * Strength
```

The duplicated float2 wiring matters: `VerticalOffset` is connected to Y but
the gradient reads X. It moves the background-cloud texture and does not move
the sky gradient. The port preserves that behavior rather than interpreting
the property name.

The manifest values for scene material index 115 are:

| Property | Exact exported value |
|---|---|
| `_Vertical_Offset` | `0.019999999552965164` |
| `_Strength` | `1` |
| `_Cloud_Opacity` | `0.4000000059604645` |
| `_Cloud_Color` | `[1, 1, 1, 1]` |
| embedded background texture | texture index 96, `T_BackroundClouds1B` |

The URP target is opaque alpha mode, `LessEqual`, front faces, automatic
opaque depth write (on), and `CastShadows=false`. Its generated
`SurfaceDescription` has no Alpha block.

## Exact `M_Clouds` graph

`S_StylizedClouds` invokes `SG_Clouds` three times. For each layer:

```text
effectiveNoiseSpeed    = CloudNoiseSpeed * -0.01
effectiveNoiseStrength = CloudNoiseStrength * 0.05
noiseUv = UV0.xy * (6,4) + (Time * effectiveNoiseSpeed).xx
noise   = T_NoiseRough_MidContrast(noiseUv).r
          * effectiveNoiseStrength * 0.2
layerUv = UV0.xy * (1, VerticalSquash)
          + (Time * PanningSpeed * -0.001, -VerticalOffset)
          + noise.xx
sample  = CloudTexture(layerUv)
layer   = float4(SampleGradient(SG_CloudsGradient, sample.r).rgb, sample.a)
```

The parent graph composites back to front and emits two generated surface
outputs:

```text
BaseColor = lerp(lerp(layer3.rgb, layer2.rgb, layer2.a),
                 layer1.rgb, layer1.a) * Strength
Alpha     = max(layer1.a, max(layer2.a, layer3.a))
```

`_Tint` is serialized as `[1, 1, 1, 0]`, but no connected `PropertyNode`
consumes it. Applying it would be invented logic. Material texture scale and
offset values are likewise not consumed: generated HLSL constructs no-scale
texture structs and all coordinate transforms come from the graph.

The manifest values for scene material index 116 are:

| Layer | Texture | Vertical offset | Vertical squash | Pan speed |
|---:|---|---:|---:|---:|
| 1 | index 97, `T_CloudLayer02` | `0.8799999952316284` | `4.389999866485596` | `0.6000000238418579` |
| 2 | index 98, `T_CloudLayer03` | `0.49000000953674316` | `2.259999990463257` | `0.4000000059604645` |
| 3 | index 99, `T_CloudLayer11` | `0.6200000047683716` | `3.630000114440918` | `0.10000000149011612` |

`_Strength=2`, `_Cloud_Noise_Strength=0.4000000059604645`,
`_Cloud_Noise_Speed=1`, and noise texture index 100 is
`T_NoiseRough_MidContrast`.

The target is transparent alpha blending, `LessEqual`, front faces, and
`CastShadows=false`. A non-obvious authored setting is
`UniversalTarget.m_ZWriteControl=1`. URP 17.5 defines 1 as `ForceEnabled`, so
the transparent cloud dome writes depth. The TSL material keeps
`transparent=true`, normal alpha blending, and `depthWrite=true`.

## Exact texture/importer state

All five textures are exact copied PNG source assets. Every importer record is
`Default`, `Texture2D`, sRGB on, mipmaps on, Repeat, Bilinear, anisotropy 1,
`alphaSource=FromInput`, `alphaIsTransparency=false`, and
`flipGreenChannel=false`. The shared manifest loader maps Bilinear+mipmaps to
Three `LinearMipmapNearestFilter`, not trilinear filtering.

| Index | Texture | GUID | Dimensions | Unity runtime format |
|---:|---|---|---:|---|
| 96 | `T_BackroundClouds1B` | `31a8ea2781a559f4eba264fc4d4e98ac` | 2048x1024 | DXT1 |
| 97 | `T_CloudLayer02` | `bfce570a686614d488b4032572aada1c` | 8192x512 | BC7 |
| 98 | `T_CloudLayer03` | `5c705836460458542aab57578fd962c4` | 8192x1024 | BC7 |
| 99 | `T_CloudLayer11` | `d32adadabbfe36341b333fe1da49481b` | 8192x512 | BC7 |
| 100 | `T_NoiseRough_MidContrast` | `73e56601cf08e3c41af080d2cabf06d0` | 2048x2048 | DXT1 |

## Runtime implementation and renderer bridges

The isolated implementation is
`src/environment/soStylizedUnitySceneSkyMaterials.js`. Its material metadata
separates `exactGraph` and `tslRuntimeGraph` from `rendererBridge`:

- Exact: connected formulas, serialized gradients, material values, texture
  selection/importer state, generated surface outputs, and target render
  state.
- Bridge: `MeshBasicNodeMaterial` compilation, Three alpha blend/depth enums,
  draw-queue ordering, mesh renderer shadow flags, and the camera post stack.

The source material graph ends before renderer features. URP's unlit function
returns albedo plus emission without light or shadow evaluation. Opaque unlit
objects may still be multiplied by URP's screen-space AO branch, and camera
fog/TAA/bloom/color grading occur elsewhere in the renderer. Those are stage
bridges and must not be baked into the sky/cloud color graph.

The TSL metadata pins one sky texture sample and three distinct `SG_Clouds`
invocations (six source texture samples: one noise plus one layer sample per
invocation). A supplied `geometryHints.timeNode` has priority, followed by
`state.uniforms.time`; without either, cloud animation is deterministically
frozen at Unity time zero.

## Verification

Run:

```sh
node scripts/verify-so-stylized-unity-sky-cloud-parity.mjs
```

The verifier checks source and generated-pass hashes, full node/edge topology,
critical edge identities, URP target/subtarget state, generated HLSL formulas
and surface outputs, material values, texture GUIDs and importer state, CPU
gradient/composite probes, and the constructed TSL graph/material metadata.

## Runtime integration status

Both shader names are now routed through the exact family builder in
`src/environment/soStylizedUnityMegaScene.js` before the partial fallback,
with `{ baseUrl, state }` forwarded from the scene dispatcher. The Unity Mega
A/B runtime exercises that route and the source verifier passes. The scene
manifest still controls nodes 1548 and 1550: both cast shadows off, while the
exported dome transforms and opaque-sky-before-transparent-cloud ordering are
preserved.

The module remains internal rather than a public package export. It will be
renamed behind the source-neutral ToonLab environment API after parity signoff.
