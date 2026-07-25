# Unity Mega temporal anti-aliasing

Authority: Unity `6000.5.4f1`, Universal Render Pipeline `17.5.0`, and the
shipped `P_SpectatorCamera` used by `M_Demonstration_Mega`. This port is based
on source and serialized settings; it contains no image-matched tuning.

## Active serialized permutation

The spectator camera serializes:

- anti-aliasing `3` (`TemporalAntiAliasing`);
- quality `3` (`High`);
- current-frame influence `0.1`;
- jitter scale `1`;
- mip bias `0`;
- variance-clamp scale `0.9`;
- contrast-adaptive sharpening `0`.

URP dispatches High as `DoTemporalAA(input, 2, 2, 2, 0)`. The four arguments
select nine-tap YCoCg variance/min-max clamping, nine-tap motion dilation,
five-fetch bicubic history, and an unfiltered point-sampled current center.
The last detail matters: URP's Blackman-Harris-like nine-tap current filter is
enabled only for Very High, so using it for this camera would not be faithful.

## Exact resolve order

1. Jitter the projection with sample `(frame & 1023) + 1` from Halton bases 2
   and 3. Index zero is intentionally skipped by URP.
2. Point-sample the current center and eight neighbors. Transform linear RGB
   to Unity's biased YCoCg (`128 / 255` chroma bias).
3. Accumulate min/max and first/second moments across all nine samples. Build
   the `0.9 * standardDeviation` interval and intersect it with neighborhood
   min/max.
4. Point-sample depth in source order across the same 3x3 footprint, convert
   reversed device depth to forward depth, and retain the closest tap using
   strict `<` comparisons. Its motion vector drives reprojection.
5. Convert Three's current-minus-previous NDC velocity into Unity forward
   screen-UV velocity, then negate it as `GetVelocityWithOffset` does.
6. Reconstruct history with URP's exact five-fetch bicubic kernel and clamp it
   component-wise to the YCoCg variance/min-max box.
7. Set current-frame influence to `1` when history UV leaves the buffer;
   otherwise use the serialized `0.1`. Camera motion participates through the
   motion-vector texture rather than a separate depth-history heuristic. High
   does not allocate, sample, or copy a previous-depth history surface.
8. Compress history and current into perceptual YCoCg, lerp, invert the
   perceptual transform, convert back to linear RGB, clamp negative output,
   and write opaque alpha. Copy the resolved HDR result into next history.

Runtime implementation:
`src/environment/soStylizedUnityTemporal.js`.

Source/hash/CPU verifier:
`scripts/verify-so-stylized-unity-taa.mjs`.

Eight-frame isolated resolve plus full-post and direct `post=0`
`M_Demonstration_Mega` WebGPU graph gates (against a running Vite server):
`BASE_URL=http://127.0.0.1:5181 npm run probe:unity-taa`.
Set `UNITY_TAA_FULL=0` only when diagnosing the isolated resolve independently.

The runtime node overrides Three TRAA's setup and per-frame path as well as its
resolve: it copies only resolved HDR color history, removes Three's unused
previous-depth resources during construction, and never enters the inherited
disocclusion setup. This prevents the compatibility base from introducing a
depth-format copy or repeated-setup mutation that is absent from URP High.

## Remaining backend-only boundaries

- Unity declares most resolve intermediates as HLSL `half`; Three's current
  TSL/WGSL path emits float arithmetic. History and resolve targets are still
  RGBA16F, so the render-target quantization boundary is preserved, but every
  source half-ALU rounding point is not expressible today.
- Three's velocity MRT is translated numerically into Unity's screen-UV
  convention; it does not share Unity `MotionVectors.hlsl`'s storage path.
- Three/WebGPU render-target copy and frame callbacks replace Unity
  RenderGraph plus `TaaHistory` version ownership. The resolve algorithm and
  serialized settings are no longer compatibility approximations.
