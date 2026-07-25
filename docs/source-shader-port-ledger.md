# So Stylized UE 5.8 to ToonLab port ledger

This ledger deliberately separates four different claims:

1. **Inventoried** means the Unreal asset or instance is present in the source audit.
2. **Mapped** means every graph node, pin connection, parameter, and material-instance chain has an explicit translation contract.
3. **Runtime ported** means a family-specific TSL/Three implementation exists.
4. **Parity complete** means the declared UE debug buffers and final reference frame pass comparison without compensating light or color tuning.

The current source map contains 27 master-material graphs, 25 material-function graphs, 4,664 nodes, 95 expression classes, and 394 resolved material profiles. The hard gate is:

```sh
npm run map:environment-shaders
npm run verify:environment-shader-map
```

The live port counter is:

```sh
npm run status:environment-port
```

## Current shader-family count

| State | Families |
| --- | ---: |
| Source graphs mapped | 19 / 19 |
| Family-specific runtime implementation complete | 0 / 19 |
| Family-specific runtime implementation partial | 14 / 19 |
| Source family still on generic fallback | 5 / 19 |
| Pixel-parity verified | 0 / 19 |
| Families left to parity | 19 |

The machine-readable family list, profile counts, next gate for every family, and non-material renderer systems live in [source-shader-port-ledger.json](./source-shader-port-ledger.json). The generated node-by-node authority is `assets-local/sostylized/shader-node-map.json`.

## Non-material parity systems

| State | Systems |
| --- | ---: |
| Complete for the declared source-input scope | 4 / 17 |
| Runtime bridge partial | 11 / 17 |
| Not started | 2 / 17 |

Exact source inputs are already exported for camera, direct sun, both local lights, the captured SkyLight, and all 369 placed static-mesh components. Those inputs do not make stock Three.js shadows identical to UE. The cascade bridge now includes UE's stable projection, overlap, quality-5 raw-gather Manual5x5PCF, soft receiver comparison, and constant-bias contract. The three-profile cloud-shadow light-function family now has its exact graph, directional WorldToLight projection, authored scale/fade/defaults, and direct-light modulation ported; SnowPines correctly leaves it disabled because the level uses `BP_StylizedSky_Lite`. Remaining shadow work is cloud-atlas raster/resample precision, caster bounds/culling, caster-normal slope bias in the depth pass, distance-field continuation, and non-surface light-function consumers.

UE's exact `DitherTemporalAA` graph/noise and eight-sample temporal-upsample jitter are now ported for four of eight source-scene call sites. The active Gen4 `MainUpsampling / High` resolve now replaces Three's generic TRAA: it includes the nine-tap current filter, source HDR weights, YCoCg sample-distance clamp, five-fetch Catmull-Rom history, `.04` current-frame blend, velocity reprojection, and the available dynamic anti-ghost classification. Responsive-AA stencil data, UE's encoded primitive-mobility ownership, exact half arithmetic/quantization, changing pre-exposure, four unimplemented family bindings, and evaluated per-instance fades remain explicit. The active ambient-occlusion path is now correctly modeled as classic deferred SSAO rather than GTAO. Physical camera inputs and UE circle-of-confusion math drive the DOF bridge. Standard Bloom's threshold, six-level Gaussian chain, packed kernel, tints, normalization, and the default cosine-fourth vignette are source-ported. The full tracker also counts shading-model lighting, screen-space reflections, runtime virtual textures, the private SkyLight/reflection filter, exponential-height fog, post-processing precision, and evaluated LOD selection.

No family will move to `complete` merely because its beauty render looks close. It must first match its source material outputs—Base Color, normal, roughness, specular/metallic, emissive, opacity/shadow mask, WPO, and family-specific attributes—under the locked camera and lighting contract.
