# So Stylized cloud-shadow light-function audit

Status: **runtime partial / pixel parity not started**. All three supplied profiles have a family-specific WebGPU/TSL implementation. This is not a claim that UE 5.8 and ToonLab pixels are identical yet.

## Source authority

- Master: `/Game/SoStylized/Environment/Sky/Materials/M_SunCloudShadows_LF.M_SunCloudShadows_LF`
- Standard instance: `/Game/SoStylized/Environment/Sky/Materials/MI_SunCloudShadows_LF.MI_SunCloudShadows_LF`
- Desert instance: `/Game/SoStylized/Environment/Sky/Materials/MI_SunCloudShadows_Desert_LF.MI_SunCloudShadows_Desert_LF`
- Exported graph: `assets-local/sostylized/graphs-all/Game__SoStylized__Environment__Sky__Materials__M_SunCloudShadows_LF.T3D`
- Pin-exact signature: `13d12d9b68a4873c491a847e1e21e8fcd6fb4289ff016071ab8adcb644d05364` (51 nodes)
- Runtime: `src/environment/soStylizedSourceCloudShadow.js`

The material domain is `MD_LIGHT_FUNCTION`. It is not a surface shadow material and it does not replace CSM. Its scalar output multiplies the owning directional light's direct contribution after the ordinary shadow term.

## Exact mapped graph

Let `p` be UE's directional-light-function texture coordinate and `t` be the material Time node:

```text
distortionUv = p / DistortionScale
             + t * (-0.002 * float2(CloudSpeedX, CloudSpeedY))

distortion = T_NoiseRough(distortionUv).r * Distortion

cloudUv = (p + distortion) / CloudsScale
        + t * (-0.003 * WindSpeed * float2(CloudSpeedY, CloudSpeedX))

cloud = saturate((CloudTexture(cloudUv).r - CloudSubtract) * CloudMultiply)
      * CloudMaxOpacity

shadowVisibility = 1 - cloud
```

The final `Lerp` has its B pin disconnected and `ConstB=1`. Its alpha comes from the source day/night triangle:

```text
dayAlpha   = saturate(abs(CurrentTime / DayLength - 0.5) * 2)
nightAlpha = saturate(abs((CurrentTime - DayLength) / NightLength - 0.5) * 2)
cycleAlpha = CurrentTime >= DayLength ? nightAlpha : dayAlpha
result     = mix(shadowVisibility, 1, cycleAlpha)
```

The `If` node's A==B input is disconnected. UE therefore uses the greater branch at exact equality; `CurrentTime == DayLength` selects `nightAlpha`. This detail is preserved.

## Authored profiles

| Parameter | Master | Standard | Desert |
| --- | ---: | ---: | ---: |
| Cloud Max Opacity | 1 | 0.6000000238 | 0.75 |
| Cloud Multiply | 1 | 2 | 2.2000000477 |
| Cloud Speed X / Y | 1 / 1 | 1 / 1 | 0.8000000119 / 0.6999999881 |
| Cloud Subtract | 0.2 | 0.0500000007 | 0 |
| Clouds Scale | 50 | 32 | 75 |
| Distortion | 1 | 1 | 1 |
| Distortion Scale | 15 | 25 | 21.8287563324 |
| Wind Speed | 1 | 1 | 2 |
| Cloud Texture | `T_NoiseRough` | `T_NoiseRough02` | `T_NoiseRough02` |

The distortion texture is always `T_NoiseRough`. Both source textures are 2048x2048, sRGB, wrap/wrap, and are sampled with the exported trilinear mip chain.

## UE directional projection and light defaults

The runtime does not reuse ToonLab's old world-space FBM. It reconstructs UE 5.8's directional `LightFunctionCommon.ush` coordinate path:

1. convert Three world metres and axes to UE world centimetres;
2. apply the exported component's inverse WorldToLight rotation/translation;
3. apply UE's inverse light-function-scale swizzle;
4. consume the directional `.zyx` result's `.xy`, which reduces to `local.z / Scale.X, local.y / Scale.Y`;
5. use `frac(projectedUv)` to match the default Light Function Atlas repeat coordinate.

The full `BP_StylizedSky` assigns the standard instance with scale `(1024,1024,1024)` cm, fade distance `100000` cm, and disabled brightness `0.5`. The supplied SnowPines map instead uses `BP_StylizedSky_Lite`; its directional component has **no light-function material**, so apples-to-apples SnowPines rendering correctly leaves cloud shadows off.

The exact UE distance fade is also mapped:

```text
fade = saturate((FadeDistance - cameraDistance) / (FadeDistance * 0.2))
result = mix(DisabledBrightness, graphResult, fade)
```

## Showcase controls and probes

- Default `cloudShadow=source`: reads the exported directional component assignment. SnowPines reports `off-source-scene`.
- `cloudShadow=standard`: binds `MI_SunCloudShadows_LF` for an isolated full-sky probe.
- `cloudShadow=desert`: binds the desert instance.
- `currentTime`: overrides the MPC Current Time gate.
- `materialTime`: freezes or selects the two Panner Time inputs.

The page publishes mode, profile, projection axes/offset, source scale, fade, disabled brightness, and remaining bridges in `document.body.dataset`. The full runtime contract is also available through `globalThis.__TOONLAB_SOURCE_SHOWCASE__.sourceCloudShadow`.

## Remaining renderer differences

1. UE 5.8 defaults to a 128x128 `PF_R8` Light Function Atlas slot. ToonLab repeats the same projected coordinate and evaluates the exact source graph directly, but it does not yet rasterize, gamma-pack, UNORM-quantize, border, and resample that intermediate. Source-mip derivatives can therefore differ too.
2. The direct opaque-surface light contribution is bound. UE's separate volumetric-fog, translucent-injection, Lumen, and MegaLights light-function consumers are not independently ported.
3. SnowPines cannot validate an active light function because its Lite Blueprint deliberately has none. A locked UE capture using the full `BP_StylizedSky` is still required before parity can move beyond `not-started`.

Deterministic graph/profile/projection fixtures run with:

```sh
npm run verify:source-cloud-shadow
```
