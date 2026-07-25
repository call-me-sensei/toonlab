# SnowPines UE 5.8 post-process translation contract

This document freezes the source-grounded post-process order used by the
SnowPines comparison. It is an implementation map, not a visual calibration
guide. No per-channel grade inferred from screenshots is part of the contract.

## Authoritative inputs

The source values come from the unbound `BP_StylizedSky_Lite`
`PostProcessComponent` in
`assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json`, the project
renderer settings in `StylizedExploration/Config/DefaultEngine.ini`, and the
SDR capture contract in
`scripts/unreal/capture-environment-demo-reference.py`.

| Setting | Effective source value | Why |
| --- | ---: | --- |
| Working color space | linear sRGB / Rec.709, D65 | `WorkingColorSpaceChoice=sRGB` |
| Auto-exposure range | EV100 1 to 1 | both volume overrides are enabled |
| Exposure compensation | +1 EV | volume does not override it; project default is `1` |
| White balance | 6500 K, tint 0 | UE identity point |
| Global saturation FVector4 | `[1.1, 1.1, 1.1, 1.1]` | volume override |
| Effective saturation RGB | `[1.21, 1.21, 1.21]` | UE uses `xyz * w` |
| Contrast / gamma / gain | `[1,1,1,1]` | identity |
| Offset | `[0,0,0,0]` | identity |
| Expand Gamut | 1 | UE default, not overridden |
| Blue Correction | 0.6 | UE default, not overridden |
| Tone Curve Amount | 1 | UE default, not overridden |
| Film slope / toe / shoulder | `1 / 0.3 / 1` | volume overrides |
| Film black / white clip | `0 / 0` | volume overrides |
| Tonemapping method | Filmic | `FPostProcessSettings` default; this is not Standard ACES/ACES 2 |
| Output request | SDR, gamut 0, device 0, `r.TonemapperGamma=0` | capture script |

The filmic method is UE's legacy ACES-derived path: it contains the ACES glow
and red-modifier stages, but it does not call the newer Standard ACES output
transform.

## Full desktop post-stage order

UE 5.8's `PostProcessing.cpp` fixes the relevant top-level order for the
SnowPines desktop path:

```text
linear scene / BeforeDOF materials
-> DiaphragmDOF
-> AfterDOF materials (the optional stylized fog family belongs here)
-> Gen4 main TAA
-> motion blur (authored amount 0, therefore inert here)
-> Standard Bloom setup / reconstruction
-> tonemap, combined color-grading LUT, vignette, and output transfer
```

The showcase now uses the same DOF -> AfterDOF -> TAA -> Bloom boundary.
`verify-ue-source-temporal.mjs` hashes the supplied UE 5.8
`PostProcessing.cpp` and asserts both the engine order and the ToonLab wiring.
The remaining TAA gap is its history-resolve algorithm, not where it is
scheduled.

## Exact tone/output order

```text
scene-linear working RGB
-> scene color tint (identity here)
-> global fixed exposure
-> local exposure (identity here)
-> vignette
-> add exposed bloom
-> white balance (identity here)
-> working linear sRGB to AP1
-> ExpandGamut in AP1
-> ColorCorrectAll in AP1
-> blue correction in AP1
-> AP1 to AP0
-> ACES glow and red modifier
-> AP0 to AP1
-> pre-desaturation 0.96
-> FilmToneMap slope/toe/shoulder curve
-> post-desaturation 0.93
-> ToneCurveAmount blend
-> inverse blue correction
-> AP1 to linear working sRGB
-> display-gamma adjustment inside Filmic (identity here)
-> hardware color-remap polynomial (identity here)
-> output transfer function
```

UE realizes most color operations into a 32x32x32 combined LUT, then samples
that LUT from the tonemap pass. ToonLab evaluates the same active math
analytically in TSL. That preserves the operation domains and order, but it
does not reproduce UE's 32-cube quantization and trilinear interpolation.

## Node-by-node map

| Order | UE source and function | Exact source domain / formula | ToonLab TSL equivalent | Status / evidence |
| ---: | --- | --- | --- | --- |
| 1 | `PostProcessEyeAdaptation.cpp`: `LuminanceMaxFromLensAttenuation`, `GetEyeAdaptationScalarParameters`, `GetEyeAdaptationFixedExposure`; `RenderUtils.h`: `EV100ToLuminance` | `Lmax = 0.78 / LensAttenuation`; `White = Lmax * 2^EV100`; `Average = .18 * White`; `Exposure = .18 / Average * 2^Bias`. With lens `.78`, EV `1`, bias `1`: `.18/(.18*2)*2 = 1`. | `configureSourceRenderState`: `2 ** (bias - EV100)`; stored in `renderer.toneMappingExposure`. | Exact for the locked source state. The focused verifier asserts multiplier `1`. |
| 2 | `PostProcessHistogramCommon.ush`: `CalculateLogLocalExposure`; `PostProcessTonemap.usf` local-exposure branch | `Detail = LogLum-Base`; `BaseCentered=Base-LogMiddleGrey`; `LogLocalLum=LogMiddleGrey+ThresholdOffset+BaseCentered*Contrast+Detail*DetailStrength`; return `exp2(LogLocalLum-LogLum)`. | No separate node. | Exact identity for this source: highlight contrast, shadow contrast, and detail strength are all `1`, so the algebra reduces to `exp2(0)=1`, including threshold cancellation. |
| 3 | `PostProcessTonemap.usf`: `FinalLinearColor` | `Scene * SceneColorTint * (OneOverPreExposure * GlobalExposure * Vignette * LocalExposure)`, then `+ Bloom * (OneOverPreExposure * GlobalExposure * Vignette)`. | Render pipeline supplies linear scene plus bloom; the custom tone function multiplies its input by exposure. | Scene tint and exposure are exact identities here. UE vignette and bloom kernels remain separate renderer bridges; see below. |
| 4 | `PostProcessCombineLUTs.usf`: `CombineLUTsCommon`, `WhiteBalance` from `TonemapCommon.ush` | Run only when temperature differs from 6500 or tint differs from 0. | No node for this frozen source state. | Exact no-op because both identity values are authored. |
| 5 | `CombineLUTsCommon`: `WorkingColorSpace.ToAP1` | `ColorAP1 = sRGB_2_AP1 * BalancedColor`, with `sRGB_2_AP1 = XYZ_2_AP1 * D65_2_D60_CAT * sRGB_2_XYZ`. | `LINEAR_SRGB_TO_AP1.mul(inputColor * exposure)`. | Exact UE coefficients. `verify:ue-source-tonemap` locks matrix convention. |
| 6 | `CombineLUTsCommon`: Expand Gamut | `L=dot(C,AP1_RGB2Y)`; `D2=dot(C/L-1,C/L-1)`; `a=(1-exp2(-4*D2))*(1-exp2(-4*ExpandGamut*L*L))`; `C=lerp(C, ExpandMat*C, a)`, where `ExpandMat=(XYZ_2_AP1*Wide_2_XYZ)*AP1_2_sRGB`. | `EXPAND_GAMUT_AP1`, `exp2`, and `mix` before color correction. Zero luminance explicitly selects the analytic limit `a=0`. | Implemented exactly for finite positive scene color. CPU fixture locks `[.05,.5,.8]` through this stage. |
| 7 | `PostProcessCombineLUTs.usf`: `ColorCorrect`, `ColorCorrectAll` | `L=dot(C,AP1_RGB2Y)`; `C=max(0,lerp(L,C,S.xyz*S.w))`; `C=pow(C/.18, Contrast.xyz*Contrast.w)*.18`; `C=pow(C,1/(Gamma.xyz*Gamma.w))`; `C=C*(Gain.xyz*Gain.w)+(Offset.xyz+Offset.w)`. Shadow/midtone/highlight results are weighted by luma. | Same AP1 formulas. The three tonal ranges collapse to one global call because every range-local control is its neutral default; their weights sum to one. | Implemented. Verifier catches the source-specific effective saturation `1.21`; treating it as `1.1` is incorrect. |
| 8 | `PostProcessCombineLUTs.usf`: `ComputeFilmColorNoGamma` | `C = lerp(C, BlueCorrectAP1*C, .6)`. | `BLUE_CORRECT_AP1` plus `mix`. | Exact combined matrix and order. |
| 9 | `TonemapCommon.ush`: `FilmToneMap`; `ACESCommon.ush` helpers | Convert AP1 to AP0; apply `rgb_2_saturation`, `rgb_2_yc`, sigmoid glow (`gain=.05`, `mid=.08`), and red modifier (`scale=.82`, `pivot=.03`, `hue=0`, `width=135`). | AP1-to-AP0 matrix, saturation/YC, piecewise glow, hue weight, red modification. | Implemented with the UE constants. |
| 10 | `FilmToneMap` | AP0 to AP1; clamp positive; `lerp(luma,C,.96)` before the curve. | `AP0_TO_AP1`, `max(0)`, AP1 luma mix `.96`. | Implemented. |
| 11 | `FilmToneMap` | `ToeScale=1+BlackClip-Toe`; `ShoulderScale=1+WhiteClip-Shoulder`; derive `ToeMatch`, `StraightMatch`, `ShoulderMatch`; evaluate straight, logistic toe, and logistic shoulder in `log10(C)`; smooth cubic blend. | Constants resolved once in `resolveUeSourceFilmSettings`; TSL evaluates the same three branches and cubic blend. | Implemented. Source controls are `1/.3/1/0/0`. |
| 12 | `FilmToneMap`, then `ComputeFilmColorNoGamma` | Post-desaturate with `.93`; blend original corrected AP1 and film result by `ToneCurveAmount`; apply `BlueCorrectInvAP1` by `.6`. | AP1 luma mix `.93`, `ToneCurveAmount` mix, inverse-blue matrix mix. | Implemented. |
| 13 | `ComputeFilmColorNoGamma` | `FilmColor=max(0, WorkingColorSpace.FromAP1 * C)`. For Filmic, then `pow(FilmColor, InverseGamma.y)` and identity `ColorCorrection`. | `AP1_TO_LINEAR_SRGB`, positive clamp. | Matrix and clamp implemented. `InverseGamma.y=2.2/DisplayGamma=1` for this capture; `r.Color.Min/Mid/Max=0/.5/1` yields polynomial `[0,1,0]`, so both omitted operations are exact identities. |
| 14 | `PostProcessCombineLUTs.usf`: output-device branch; `PostProcessTonemap.cpp`: `GetTonemapperOutputDeviceParameters` | On Apple, `r.TonemapperGamma=0` becomes `Gamma=2.2`. Requested SDR sRGB is therefore changed to `SDR_ExplicitGammaMapping`, and output is `pow(linear,1/2.2)`. | The custom tone function applies the same power transfer after the film/grade path. The source showcase selects `LinearSRGBColorSpace` for final output so Three's `RenderOutputNode` does not append an sRGB OETF. | Implemented and source-hash gated. The capture PNG is sRGB-tagged after UE writes its gamma-2.2 codes; the browser canvas now preserves the same codes. At linear `.01`, this yields `.12328467`, not Three sRGB's `.09985282`. |

## Matrix convention bridge

UE's HLSL matrices are written row-major. TSL's scalar `mat3(a...i)` overload
also accepts row-major values through `THREE.Matrix3`; the WGSL backend then
reorders them into column-major constructor order.

For example, this row-major TSL input:

```js
mat3(
  1, 2, 3,
  4, 5, 6,
  7, 8, 9,
)
```

generates:

```wgsl
mat3x3<f32>(1, 4, 7, 2, 5, 8, 3, 6, 9)
```

Therefore UE coefficients must be copied in their displayed row order. A
manual transpose before `mat3()` transposes them twice. That bug previously
affected every sRGB/AP1/AP0 and blue-correction matrix and was amplified when
ExpandGamut was enabled. The focused verifier builds this probe with Three's
actual `WGSLNodeBuilder` so the convention cannot silently regress.

## Standard Bloom (`BM_SOG`)

SnowPines runs desktop Gaussian/Standard Bloom at post-process quality 3,
which selects `r.BloomQuality=5`, `r.Filter.SizeScale=1`, and the six-stage
path in `PostProcessBloomSetup.cpp`. `r.Bloom.ScreenPercentage=50` belongs to
FFT bloom and does not replace this path's half-resolution setup.

The implemented bloom order is:

```text
post-DOF, post-TAA linear scene
-> 1/2-resolution bilinear downsample
-> BloomSetup threshold
-> six-level high-quality downsample chain (1/2 through 1/64)
-> blur Bloom6 and reconstruct additively through Bloom1
-> bilinear upscale in the tonemap pass
-> add to exposed scene before the film/LUT curve
```

`PostProcessBloom.usf` extracts brightness with the project's legacy
luminance factors and a linear ramp:

```text
L = dot(SceneLinear, [0.3, 0.59, 0.11]) * ExposureScale
BloomAmount = saturate((L - 0.5) * 0.5)
BloomSetupRGB = SceneLinear * BloomAmount
```

Exposure and local exposure are identities for this frozen volume. The six
unchanged `FPostProcessSettings` stages are:

| Stage | Input scale | Size | Effective size percent (`Size * 4`) | Tint |
| --- | ---: | ---: | ---: | ---: |
| Bloom1 | 1/2 | .3 | 1.2% | .3465 |
| Bloom2 | 1/4 | 1 | 4% | .1380 |
| Bloom3 | 1/8 | 2 | 8% | .1176 |
| Bloom4 | 1/16 | 10 | 40% | .0660 |
| Bloom5 | 1/32 | 30 | 120% | .0660 |
| Bloom6 | 1/64 | 64 | 256% | .0610 |

Each stage uses UE's separable Gaussian implementation, including
`exp(-16.7 * (x / radius)^2)`, bilinear packing of adjacent taps, normalized
one-dimensional weights, transparent border sampling, and the desktop
32-sample radius clamp. The renderer builds the broadest Bloom6 result first;
each narrower vertical pass adds the previous result while upsampling it.

Crucially, UE multiplies every tint by
`BloomIntensity * BloomGaussianIntensity / EBloomQuality::MAX`. Here that is
`5 * 1 / 6`, so the six default tints have a maximum constant-field gain of
`.7951 * 5 / 6 = .6625833333`. An input with luminance 1 contributes only
`.25 * .6625833333 = .1656458333` before tone mapping. Passing `5` to Three's
stock bloom strength is therefore not equivalent.

## Diaphragm depth of field

The authored cine-camera projection and physical circle of confusion are
source-bound independently of the blur backend. For CameraRender1:

- horizontal FOV `65.097290°` becomes vertical FOV `39.498690°` at `16:9`;
- glTF stores the matching `yfov=.68938219` radians and `znear=.05` metres;
- manual focus is `107.03086914` metres, sensor width is `23.76` mm, and the
  reconstructed vertical focal length is `18.612973` mm;
- the infinity background CoC is `.00050999256` horizontal-screen radius, or
  only `.65279047` pixels at 1280 pixels wide;
- the `32` pixel value reported by the runtime is the `2.5%` safety clamp. It
  applies to sufficiently near foreground content, not the far landscape.

Consequently, broad landscape softness cannot come from the source Camera 1
CoC equation. The physical CoC, sign, focus, projection, and screen-radius
clamp are exact, while Three's 64+16-tap Vogel gather remains a renderer
bridge. It does not implement UE's tile flatten/dilate, layer classification,
energy-conserving seven-blade gather/scatter, foreground hole filling, or
DiaphragmDOF temporal scheduling.

## Renderer bridges and frozen gaps

These are not color-grade knobs. They are explicit engine-stage differences
that must be implemented or intentionally accepted:

1. **Combined-LUT sampling:** UE evaluates a 32-cube LUT using its log input
   shaper and trilinear filtering. The current analytic TSL path omits LUT
   quantization. A byte-exact bridge would export/sample UE's cube or implement
   the same bake and lookup.
2. **DiaphragmDOF kernel:** the physical CoC is exact, but the gather/scatter,
   dilation, blade shape, foreground hole fill, translucency scheduling, and
   temporal integration are not UE's implementation.
3. **Bloom precision boundary:** the Standard Bloom graph and its
   `PF_FloatR11G11B10` intermediate quantization are now ported, but UE's
   native half arithmetic and border-sampler rounding can still differ from
   WebGPU. Pre-exposure is exact only for this frozen fixed-exposure source
   state. The `r.FastBlurThreshold=100` optimization is inert at the native
   1920x1080 reference resolution and remains outside this module's scope.
4. **Temporal resolve:** the stage is scheduled at UE's exact
   DOF/AfterDOF -> Gen4 TAA -> bloom boundary, and Three's generic TRAA
   resolve has been replaced. The active source permutation is
   `MainUpsampling / High`: nine current taps with the polynomial/HDR filter,
   YCoCg sample-distance min/max, five-fetch Catmull-Rom history, `.04`
   current-frame weight, velocity reprojection, and the available dynamic
   anti-ghost classification are implemented and numerically gated. Quality
   High uses `PF_FloatRGBA`; the configured `r.TemporalAA.R11G11B10History=1`
   branch is excluded by UE's own quality condition. Remaining renderer data
   boundaries are the responsive-AA stencil bit, encoded primitive-mobility
   ownership (Three supplies decoded motion only), stochastic RGBA16F
   quantization/exact half arithmetic, and non-identity pre-exposure changes.
   The frozen SnowPines pre-exposure ratio is exactly one.

White balance, local exposure, scene tint, global contrast/gamma/gain/offset,
external color-grading LUTs, and the final color-remap polynomial require no
bridge for this frozen scene because they resolve to identity or are absent.

## Implementation locations

- `src/environment/ueSourceTonemapping.js`
  - `resolveUeSourceFilmSettings`: source FVector4 semantics and film constants.
  - `createUeSourceToneMapping`: analytic AP1/film graph plus the selected
    output-device transfer.
- `src/environment/ueSourceDepthOfField.js`
  - source camera/projection resolution and exact physical CoC;
  - explicit Three gather bridge and remaining-kernel metadata.
- `src/environment/ueSourceBloom.js`
  - `resolveUeSourceBloomSettings`: exported values plus UE 5.8 defaults.
  - `computeUeSourceGaussianKernel`: exact desktop packed-kernel generator.
  - `UeSourceStandardBloomNode`: threshold, six downsample levels, separable
    blurs, tint normalization, and broad-to-narrow reconstruction.
- `src/environment/ueSourceTemporal.js`
  - exact eight-sample camera jitter and material temporal dither;
  - active Gen4 MainUpsampling/High nine-tap, YCoCg, Catmull-Rom, history
    clamp, reprojection, and weighted-resolve core;
  - explicit metadata for unavailable stencil/mobility/precision inputs.
- `examples/source-showcase/main.js`
  - `configureSourceRenderState`: locked EV100 exposure resolution.
  - `createSourcePostPipeline`: scene/bloom boundary and neutral authored grade.
  - `renderer.library.addToneMapping`: registers the source function as the
    renderer's output transform.
- `scripts/verify-ue-source-tonemapping.mjs`
  - validates SnowPines settings, effective saturation, exposure, output
    capture contract, explicit gamma boundary, ExpandGamut fixture, and actual
    WGSL matrix ordering.
- `scripts/verify-ue-source-depth-of-field.mjs`
  - validates every exported camera projection against glTF, hashes UE/Three
    source, and numerically separates actual far CoC from the safety clamp.
- `scripts/verify-ue-source-temporal.mjs`
  - validates the authored TAA settings and exact jitter/dither graph; hashes
    `TemporalAA.cpp`, `TemporalAA.usf`, `TextureSampling.ush`, Three's inherited
    render-target lifecycle, and the UE top-level post chain; numerically locks
    YCoCg transforms, all nine filter taps, the sample-distance box, Catmull-Rom
    footprint, source blend weight, and DOF/AfterDOF -> TAA -> bloom scheduling.
- `scripts/verify-ue-source-bloom.mjs`
  - validates the exported BM_SOG state, threshold fixtures, 1/6 intensity
    normalization, round-up resolutions, packed taps, and radius clamp.

## Verification evidence

```text
npm run verify:ue-source-tonemap
UE source tone-mapping verification passed

npm run verify:ue-source-bloom
UE source Standard Bloom verification passed

node scripts/verify-ue-source-depth-of-field.mjs
UE source DiaphragmDOF physical CoC verification passed

npm run build
vite build completed successfully
```

No screenshot-derived channel multiplier is present on the UE path. The old
`gradeRed/gradeGreen/gradeBlue` compatibility controls remain neutral when the
UE tone mapper is selected.
