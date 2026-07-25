# Unity URP 17.5 lighting and BRDF audit

## Result

The supplied Unity project is sufficient to reconstruct the active lighting
math without running an old editor or tuning from screenshots. The live source
scene uses URP 17.5 Universal Lit, a constant L0 ambient probe, one directional
light, no sky/reflection cubemap, and the URP SSAO Renderer Feature.

`src/environment/soStylizedUnityUrpLighting.js` now ports the relevant URP
direct and indirect BRDF instead of relying on Three's stock Lambert/GGX model.
The numerical reference is
`src/environment/soStylizedUnityLightingReference.js`; run
`node scripts/verify-so-stylized-unity-lighting-reference.mjs` to verify it.
The renderer-boundary gate is
`scripts/verify-so-stylized-unity-urp-light-inputs.mjs`; it locks the supplied
URP/Core package sources and proves direct-only and ambient-only results for
both the Unity stage and UE captured-scene SH adapters.

This is not a cel-shader geometry flatten. The soft rock response comes from
the authored `S_Rock` normal-strength/distance graph, URP's diffuse/specular
response, ambient probe, shadows, AO, and post stack together. Quantizing
`N.L` would add a look that the Unity source does not contain.

## Source authority

The package sources are under the supplied project at:

`/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Library/PackageCache/`

| Rule | Source |
| --- | --- |
| BRDF setup and optimized direct specular | `com.unity.render-pipelines.universal@e38be786c41e/ShaderLibrary/BRDF.hlsl:9-96,177-214` |
| direct Lambert/PBR and shadow attenuation | `.../ShaderLibrary/Lighting.hlsl:32-100,302-403` |
| ambient-probe convolution/evaluation | Core RP `ShaderLibrary/AmbientProbe.hlsl:6-56` and `SphericalHarmonics.hlsl:17-24` |
| C# `SphericalHarmonicsL2` to shader packing | Core RP `Runtime/Utilities/BatchRendererGroupGlobals.cs`, `SHCoefficients.GetSHA/GetSHB/GetSHC` |
| SSAO placement | `.../ShaderLibrary/AmbientOcclusion.hlsl:28-68`, `RealtimeLights.hlsl:130-141,269-278` |
| SSAO settings and effective radius | `.../Runtime/Passes/ScreenSpaceAmbientOcclusionPass.cs:84-103,435-447` |
| SSAO estimator and final visibility | `.../ShaderLibrary/SSAO.hlsl:29-47,385-447,528-535` |
| exact scene light transform and values | `assets-local/sostylized-unity/mega-scene/scene-manifest.json` |

## Deterministic scene inputs

The project is Linear color space. Unity converts the serialized light color
from sRGB before multiplying intensity:

```text
sun sRGB       = [1, .9443990588188171, .8443396091461182]
sun linear     = [1, .8781476501810763, .6817278369126704]
intensity      = 1.5
finalColor     = [1.5, 1.3172214752716145, 1.0225917553690056]
```

The light's precise Unity world ray direction is:

```text
Unity ray (light.forward) = [-.6295879006, -.7071067358, -.3218992694]
```

The Unity exporter reflects Z to produce glTF. A vector must receive the same
conversion as a position:

```text
Three ray              = [-.6295879006, -.7071067358, +.3218992694]
Three surface-to-light = [+.6295879006, +.7071067358, -.3218992694]
```

Three's directional light evaluates `lightPosition - target`, so placing the
light at `target - ray * distance` produces the required surface-to-light
direction. Distance itself has no radiometric meaning for a directional light.

The runtime ambient probe has only coefficient zero populated:

```text
SH0 = [.08701412, .2798782, .6684512]
SH1..SH8 = 0
```

These are `RenderSettings.ambientProbe[channel, coefficient]` values, not raw
radiance-SH coefficients awaiting a `0.282095` L0 basis multiply.
`SHCoefficients.GetSHA()` packs channel `i` as:

```text
unity_SHA = [SH3, SH1, SH2, SH0 - SH6]
```

With SH1..SH8 equal to zero, `SHEvalLinearL0L1(normal, unity_SHA)` takes the
dot product with `[normal, 1]` and returns SH0 exactly for every normal. The
probe is already convolved with the clamped cosine and its convolution
coefficients are pre-divided by PI. URP therefore multiplies this evaluated
probe directly by `BRDFData.diffuse`; it does not apply Lambert `1/PI` again.

## Renderer input adapters

`installSoStylizedUnityUrpLighting()` defaults to the `unity-stage` adapter and
records the selected adapter in
`material.userData.soStylizedUnityUrpLighting.inputAdapter`. Direct and
indirect inputs have separate normalization fields so one cannot silently
inherit the other's convention.

| Adapter | Direct input | Direct normalization | Indirect input | Indirect normalization |
| --- | --- | ---: | --- | ---: |
| `unity-stage` | Unity radiance multiplied by PI so stock Three Lambert materials can coexist | `1 / PI` | Unity bakedGI multiplied by PI before entering Three's irradiance accumulator | `1 / PI` |
| `ue-captured-scene-sh` | raw UE source-stage analytic-light radiance, whose Default Lit diffuse branch contains Lambert `1 / PI` | `1 / PI` | cosine-convolved irradiance produced by Three's `LightProbeNode` from the UE captured-scene SH | `1 / PI` |

Both indirect paths enter `builder.context.irradiance` in Three's physical
irradiance convention. Dividing by PI once converts that value to the
pre-divided baked-GI convention consumed by the literal URP diffuse branch.
For a constant unit-radiance sphere, Three's SH helper evaluates to PI; the UE
adapter therefore presents `1` to `BRDFData.diffuse`, as required.

The direct conversion is separate but numerically identical. Literal URP Lit
multiplies `radiance * BRDFData.diffuse` without Lambert's divisor; UE Default
Lit multiplies the same raw analytic radiance by `diffuseColor / PI`. A
Unity-derived material standing in for its UE counterpart must therefore
receive `UE radiance / PI`. Otherwise its direct diffuse and specular lobes are
PI times too bright at the same exported light intensity.

When a Unity material is intentionally evaluated under the UE captured-scene
lighting rig, reinstall its lighting model with the explicit boundary:

```js
installSoStylizedUnityUrpLighting(material, {
  inputAdapter: 'ue-captured-scene-sh',
  workflow: 'metallic', // or 'specular'
});
```

The two adapters deliberately keep distinct IDs even though their present
direct multipliers are both `1 / PI`: `unity-stage` removes a stage-side PI
pre-scale, while `ue-captured-scene-sh` converts UE's Lambert energy convention
to URP's no-PI convention. The selected adapter is preserved when a cloned
material is reinstalled. The current Unity stage already supplies the
`unity-stage` convention, so it requires no API or numeric change.

## Exact URP BRDF

### Metallic workflow (rocks, mountains and Terrain/Lit)

```text
oneMinusReflectivity = .96 * (1 - metallic)
diffuse               = albedo * oneMinusReflectivity
F0                    = lerp(.04, albedo, metallic)
```

The `.96` is required and source-exact. It is not an artistic exposure factor.
Stock Three uses `albedo * (1-metallic) / PI`, so a stock-Three diffuse-only
fallback needs input light scale `PI * .96 = 3.015928947446201`. The custom URP
model's default `unity-stage` adapter receives globally PI-scaled lights,
divides by PI exactly once, then applies Unity's `.96` itself.

### Specular workflow (grass, leaves and bark)

```text
reflectivity = max(specularF0.r, specularF0.g, specularF0.b)
diffuse      = albedo * (1 - reflectivity)
F0           = specularF0
```

Shader Graph's Specular port is already the final F0. Three's
`MeshPhysicalNodeMaterial.setupSpecular()` normally computes:

```text
F0 = ((ior - 1) / (ior + 1))^2 * materialSpecularColor * intensity
```

At the default IOR 1.5 this is `.04 * materialSpecularColor`. Feeding the
Unity grass Specular value through that setup made its F0 25 times too small
and also produced the wrong diffuse reflectivity. The URP adapter must consume
the original `material.specularColorNode` directly; the shared model now does.

### Smoothness and direct highlight

URP uses the literal Shader Graph smoothness:

```text
perceptualRoughness = 1 - smoothness
roughness           = max(perceptualRoughness^2, HALF_MIN_SQRT)
roughness2          = max(roughness^2, HALF_MIN)
normalization       = 4 * roughness + 2
d                   = NoH^2 * (roughness2 - 1) + 1.00001
specularScalar      = roughness2
                      / (d^2 * max(.1, LoH^2) * normalization)
direct              = lightColor * attenuation * saturate(N.L)
                      * (diffuse + F0 * specularScalar)
```

Three's global `roughness` is not the same input: `getRoughness()` clamps it to
at least `.0525` and adds geometry roughness. The adapter therefore retains the
original `material.roughnessNode` before Three performs that widening.

`lightColor` entering the lighting model already contains Three's shadow
factor. Multiplying direct diffuse and specular by it matches URP's
`distanceAttenuation * shadowAttenuation`; ambient remains unshadowed.

## SSAO placement and settings

The active `PC_Renderer` feature resolves to:

```text
method                    = BlueNoise
full resolution           = true
configured radius         = .3
BlueNoise radius multiply = 1.5
shader radius             = .45
sample preset/count       = Medium / 8
intensity                 = .4 (inside the obscurance estimator)
contrast exponent         = .6
falloff distance          = 100
directLightingStrength    = .25
blur                       = high-quality bilateral H/V/final
```

For normalized obscurance `O` at positive linear eye depth `z`, the source
transfer is:

```text
falloff       = max(1 - z / 100, 0)^2
AO visibility = 1 - pow(saturate(O * .4 * falloff), .6)
```

The visibility texture is then split by lighting term:

```text
indirect AO = min(AO visibility, material occlusion)
direct AO   = lerp(1, AO visibility, .25)
emission/unlit/sky are unchanged
```

Applying `.4` as `mix(1, AO, .4)` after the estimator is not equivalent. The
showcase's direct/indirect/emissive decomposition now uses the right placement.
The runtime now uses the literal Unity BlueNoise/Alchemy estimator rather than
Three GTAO. It preserves the 40-value source sample table, the eight rotating
`LDR_LLL1_0..7` textures with point-repeat sampling and two `Random.value`
offsets per frame, the world-locked hemisphere, and the material-normal source.
The obscurance and packed normal cross the same RGBA8 boundary before the exact
bilateral horizontal, bilateral vertical, and diagonal five-tap final blur;
the final visibility crosses an R8 boundary. The Mega stage retains
renderer-native device depth: Three's eye-depth helper chooses its
forward/reversed equation from the renderer and its position reconstruction
uses the camera projection matrix updated to that same convention. The SSAO
sky test explicitly selects `raw > 1e-5` for reversed Z and
`raw < 1 - 1e-5` for forward Z. Source hashes, CPU kernel values, texture
hashes, depth-convention wiring, and the runtime pass topology are gated by
`scripts/verify-so-stylized-unity-ssao.mjs`.

The two implementation-bound precision differences are explicit: Unity's HLSL
uses `half` ALU before the UNorm8 targets while WebGPU evaluates TSL as `f32`,
and Unity's two random offsets share its process-global random stream while the
ToonLab renderer owns its two draws. Neither changes a source parameter, sample
count, buffer format, or pass order.

The production R8 visibility readback passes the runtime locality gate after
matching the renderer-native reversed-depth convention: mean `0.8992`, median
`0.9922`, `70.36%` of pixels at or above `0.95`, and `6.33%` below `0.5`.
Unity 6000.5.4f1 was also probed directly on Metal: the inherited HDR camera
descriptor resolves the bilateral intermediate to `R8G8B8A8_UNorm` and the
final visibility target to `R8_UNorm`, both non-sRGB.

## Port status

| Stage | Status |
| --- | --- |
| linear sun color/intensity | exact values derived |
| Unity/glTF direction conversion | exact values derived |
| constant SH0 ambient | exact values derived |
| constant SH0 shader packing/evaluation | exact; exported coefficient returned for every normal |
| Unity-stage direct/indirect normalization | exact; independent `1/PI` boundaries |
| UE captured-scene SH adapter | exact diffuse convention; physical irradiance divided by PI once |
| metallic `.96` diffuse/F0 | ported |
| specular-workflow direct F0 | ported |
| literal smoothness roughness chain | ported |
| optimized URP direct specular | ported |
| shadow attenuation placement | equivalent placement |
| SSAO radius/sample/depth-falloff/transfer/split | ported |
| SSAO sample kernel and bilateral blur | ported; source/hash/CPU/runtime-gated |
| Unity shadow-map raster/filter parity | separate renderer bridge |
