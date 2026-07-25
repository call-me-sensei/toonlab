# Fog source-shader audit and runtime port

The authoritative source graph is
`/Game/SoStylized/Environment/Sky/Materials/M_StylizedFogPP.M_StylizedFogPP`.
It is a 272-node post-process material with graph signature
`b90be4332cb9d5af2f8c6b4cf4678f1f3f1ac94c03219742f968728632bbff67`,
derived from material-audit SHA-256
`46369127911617732b22b3d4fe1430ea63b647d8c23b25384310c62b9cd658dc`.

The pack supplies one master and eight instances: Alien, Apocalypse, Cinematic,
Classic, Desert, Dreamy, Tatooine, and Toxic. There is no
`M_StylizedFogPP_Lite` material asset in the supplied Content. The exact
SnowPines source scene uses `BP_StylizedSky_Lite`, and its unbound post-process
component has an empty weighted-blendable array. Consequently the source
showcase leaves this material off by default. It can be inspected explicitly
with, for example, `?material=live&post=1&fogPP=Classic`.

## Active output graph

The Emissive output has this pin-exact order:

1. Atmospheric color is composited over `PPI_POST_PROCESS_INPUT0`.
2. Authored 3D volume fog is added.
3. Sun glow is added.
4. Moon glow is added.

In compact form:

```text
lerp(PostProcessInput0, HueShift(AtmosphereColor), atmosphereAlpha)
+ volumeFog
+ sunGlow
+ moonGlow
```

The implementation preserves the resolved scalar, vector, and static-switch
parameters for all nine profiles; day/sunset/night/sunrise five-way blends;
weather blends; the engine HueShift rotation; UE `If` threshold behavior;
sunward, height, and distance masks; dual-layer volume coordinates; wind/time
motion; sun and moon curve timing, orientation, visibility, overcast response,
and final addition order.

`PPI_SCENE_DEPTH` and `SceneDepth` are treated as UE `CalcSceneDepth`: clip W,
or linear view-space Z, in centimeters. They are not raw hardware depth and
not Euclidean camera range. The browser bridge reconstructs view position from
the depth attachment, uses `-viewPosition.z * 100`, and reconstructs post-process
World Position from that same depth. UE world axes/centimeters are restored for
the volume lookup; the graph's B/Z component mask maps to Three's Y-up axis.

The material's authoritative blendable location is
`BL_SCENE_COLOR_AFTER_DOF`. In the source showcase it therefore runs after the
authored DOF node and before bloom and tone mapping. No light or camera value is
changed to compensate for the shader.

## Authored volume source

`scripts/export-so-stylized-fog-volume.mjs` exports the lossless
`T_3DNoise_Source` RGBA16F strip to
`assets-local/sostylized/fog-volume/T_3DNoise_Source.exr`. The accompanying
manifest records a 4096×64 horizontal strip of 64 slices, reconstructed at
runtime as a repeating, trilinear 64×64×64 `Data3DTexture`. The export also
records the Engine `MakeFloat4` defaults, including the exact zero default for
disconnected alpha inputs.

## Remaining renderer bridges

This family is runtime-partial until all three renderer boundaries are closed:

- UE's 256-wide curve-atlas bake versus the available 65-sample exported rows.
- UE volume-texture mip/compression selection versus the uncompressed base-level
  browser `Data3DTexture`.
- UE After-DOF translucency composition and exact post-pass resolution
  scheduling.

These are isolated renderer differences; they are not missing material nodes or
parameters. Pixel parity is not claimed until they are verified against UE
debug buffers and final frames.

## Verification

```sh
npm run export:source-fog-volume
npm run verify:source-fog
npm run verify:environment-shader-map
npm run status:environment-port
npm run build
```
