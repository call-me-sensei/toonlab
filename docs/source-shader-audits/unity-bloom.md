# Unity Mega bloom source audit

This audit covers the bloom path used by the supplied Unity 6000.5.4f1
`M_Demonstration_Mega` project. It is deliberately independent of the Unreal
post stack and of ToonLab's general-purpose post-processing API.

## Authority

The source-sensitive gate is:

```sh
npm run verify:unity-bloom
```

It pins the supplied project's `ProjectVersion.txt`, `PC_RPAsset`, global
volume profile, linear-color-space project setting, URP/Core 17.5 package
manifests, `Bloom.cs`,
`BloomPostProcessPass.cs`, `Bloom.shader`, `UberPostProcessPass.cs`,
`UberPost.shader`, and `UniversalRenderPipelineCore.cs` by SHA-256. A Unity
package or project change therefore fails the gate instead of silently
retaining an obsolete translation.

## Active settings

| Input | Source value | Runtime value |
| --- | ---: | ---: |
| Filter | Gaussian default | Gaussian |
| Starting size | Half default | `width >> 1`, `height >> 1` |
| Maximum iterations | 6 default | 6 |
| High-quality filtering | false | false |
| Threshold | 1.1 gamma | 1.2332863807678223 linear |
| Soft knee | hard-coded 0.5 × threshold | 0.6166431903839111 |
| Bloom clamp | 1 | 1 |
| Scatter | 0.741 | `lerp(.05, .95, .741) = .7168999910354614` |
| Intensity | 6 | 6 in the Uber composite |
| Tint | `(0.73014116, 0.760351, 0.8509804)` sRGB | `(0.9112295508, 0.9976549149, 1.2848085165)` linear after Rec.709-luminance normalization |
| Alpha output | false | false |
| Lens dirt | none | none |

`skipIterations` remains serialized from the older package schema but is not
an active URP 17.5 `Bloom` field. The active iteration limit comes from
`maxIterations`, whose un-overridden default is six.

## Pass topology

The runtime module is
`src/environment/soStylizedUnityBloom.js`. It implements the actual URP
Gaussian graph instead of delegating to Three's five-level
UnrealBloom-derived display node:

```text
post-TAA linear scene
  -> half-resolution LQ prefilter
  -> mipDown0
  -> 9-fetch horizontal Gaussian + 2x downsample
  -> 5-fetch bilinear vertical Gaussian
  -> repeat through at most six levels
  -> broad-to-narrow bilinear reconstruction, lerp(high, low, .7169)
  -> Uber: scene + bloom * 6 * normalized cool tint
  -> vignette
  -> 32³ LDR grade
```

URP calculates the mip count as
`floor(log2(max(halfWidth, halfHeight)) - 1)`, clamped to `[1, 6]`. At
1920×1080 the exact sizes are 960×540, 480×270, 240×135, 120×67, 60×33,
and 30×16. Integer halving is floor/bit-shift behavior; the odd 135 and 67
dimensions are not rounded up.

The horizontal pass uses nine source taps with weights
`[.01621622, .05405405, .12162162, .19459459, .22702703, .19459459,
.12162162, .05405405, .01621622]` and a two-source-texel stride. That doubled
texel size is also passed into URP's bilinear edge clamp, so the horizontal
upper bound is one original source texel from the edge. The vertical
pass uses five bilinear fetches at offsets `±3.23076923`, `±1.38461538`, and
zero with weights `.07027027`, `.31621622`, `.22702703`, `.31621622`, and
`.07027027`. Both filters preserve constant-field energy; the upsample lerp
also has unit DC gain.

## Threshold and composition boundaries

The LQ prefilter samples the source once at the half-resolution target, clamps
each channel to 1, uses max RGB as brightness, applies URP's quadratic soft
knee, and clamps the result positive. It does not use a smoothstep luminance
threshold. With this source profile a linear white pixel contributes
0.0595792218 to the untinted bloom texture before reconstruction.

The above conversion values are not extrapolated with a browser sRGB helper.
They were probed through the installed Unity 6000.5.4f1 runtime itself:
`Mathf.GammaToLinearSpace(1.1f)` returned `1.23328638f`; the same native
probe returned the float-exact knee, scatter, linear tint, Rec.709 luminance,
and normalized tint recorded by the runtime contract.

The pyramid result is intentionally left untinted and unscaled. URP applies
bloom intensity and luminance-normalized tint in `UberPost`, at the additive
scene composite. ToonLab retains that same boundary through
`applySoStylizedUnityBloomTint` and then applies vignette and the LDR LUT.

## Format and sampling

`PC_RPAsset` enables HDR, requests 32-bit HDR precision, and disables alpha
output. On the supplied Metal-class reference path, URP selects
`B10G11R11_UFloatPack32`; every bloom target inherits that source descriptor.
ToonLab uses `RGBFormat / UnsignedInt101111Type`, which maps to WebGPU's
packed 11/11/10 unsigned-float target. All down/up targets are bilinear,
clamp-to-edge, and have mip generation disabled.

The supplied project is explicitly in linear color space
(`m_ActiveColorSpace: 1`), so Bloom.shader's gamma-space encode/decode branch
is inactive. ToonLab therefore keeps every pyramid target and intermediate
sample in linear HDR space.

## Remaining precision boundary

The pass topology, source inputs, kernels, target quantization, filtering, and
composition are ported. One renderer-level precision distinction remains
explicit: Unity's HLSL uses `half` intermediates, while Three TSL currently
emits f32 WebGPU ALU before both paths quantize into the same packed HDR
target. This is not a visual tuning parameter and must not be compensated by
changing threshold, intensity, tint, lighting, or grading.
