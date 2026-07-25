# Unity-authoritative pine shader audit

## Scope

This audit covers the plain pine materials visible on the foreground-left trees
in `Demonstration_SnowPines` Source Camera 01:

- Unity `M_PineLeaves` / `S_Leaves.shadergraph`
- Unity `M_PineBark` / `S_Bark.shadergraph`
- Unreal-exported showcase slots `MI_PineLeaves` and `MI_PineBark`

The supplied Unity 6000.5 project is the logic and configuration authority. The
Unreal-exported glTF supplies the scene geometry and material-slot identities.
The relevant texture files are byte-identical between the two supplied packs,
so the port reuses the licensed local texture export and applies Unity's import
and shader contracts.

## Source identities

| Role | Source | GUID | SHA-256 |
| --- | --- | --- | --- |
| Leaf graph | `Environment/Trees/Shaders/S_Leaves.shadergraph` | `a65bec4bef9f96c4c9dde8ad2a20a99a` | `94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62` |
| Leaf material | `Environment/Trees/Materials/M_PineLeaves.mat` | `225b2c09fcd5feb469c9cbbc3855f533` | `16919f740fa0e284e6b2a542a922e709145381734c2703801ad74e05f8dd3aae` |
| Camera-dither subgraph | `Materials/Shaders/SG_CameraDithering.shadersubgraph` | `0a5473d7af329294c8f319a1acc7f8cb` | `95586ca209f762a059f221bbccab74df9685c4cddc997121596d4578bf1f45dd` |
| Bark graph | `Environment/Trees/Shaders/S_Bark.shadergraph` | `016550df8fe3d84418b52fbdc767f495` | `0ab87ac5464f9b3d4e4090b2299cc4df55c0155ff79458e62b91a84829ff2689` |
| Bark material | `Environment/Trees/Materials/M_PineBark.mat` | `145e6546446a91447b4358f45984a797` | `c41c1ef3daa5b95862d8a30e21c76d20489793a4764da79caa2614a23f57858f` |

Runtime implementation: `src/environment/soStylizedUnityTreeMaterials.js`.

## `M_PineLeaves` connected graph

The leaf material is an opaque, alpha-clipped, two-sided URP Universal Lit
material using the specular workflow. Its stylized transmission is not a
subsurface surface model. `SG_SSS` is added to the Emission output.

```text
g = 1 - saturate((UV2.g + GradientOffset) * GradientStretch)
base = lerp(MainColor, GradientColor, g)

seed = ObjectPositionWS.xz * 10
hue = RandomRange(seed, -HueVariation, HueVariation) + HueShift
base = ShaderGraphHueNormalized(base, hue)

V = normalize(CameraPositionWS - PositionWS)
L = MainLightDirectionWS   // URP: -GetMainLight().direction, light-ray direction
back = remap(dot(L, -NormalWS), -1, 1, -1 + SSSOffset, 1)
sss = saturate(saturate(dot(V, L)) * back)
emission = base * EmissiveStrength + SSSColor * SSSBrightness * sss

cameraFade = saturate(remap(distance(CameraPositionWS, PositionWS), 2, 3, 0, 1))
cameraDither = cameraFade * 2 - ShaderGraphBayer4x4(ScreenPosition)
alpha = T_Leaf_Pine.r * cameraDither
clip(alpha - AlphaClip)
```

Resolved `M_PineLeaves` values:

| Input | Value |
| --- | --- |
| Main Color | `[0.40523082, 0.7264151, 0.065103225]` |
| Gradient Color | `[0.039248843, 0.3962264, 0.08440987]` |
| Gradient Offset / Stretch | `0 / 1` |
| Hue Variation / Shift | `0.1 / 0` |
| Emissive Strength | `0.2` |
| SSS Color | `[0.14117648, 0.48235297, 0.18431373]` |
| SSS Brightness / Offset | `1 / 0` |
| Smoothness | `0` |
| Specular Color | `[0, 0, 0]` |
| Alpha Clip | `0.4` |

`UseTwoSidedSign=0` selects the unmodified tangent normal. The port therefore
uses the raw geometry normal and suppresses Three's usual automatic back-face
normal negate; otherwise half of the leaf cards receive a lighting branch that
the material instance disabled in Unity.

`HueNode.m_HueMode=1` means **Normalized HSV** in the Shader Graph package
installed by the supplied project. It is not a radians setting and is not the
axis-angle HueShift function from the Unreal material. This difference alone
can visibly change the foreground pine palette.

The connected vertex branch uses Shader Graph's deterministic (`m_HashType=0`)
three-octave Simple Noise:

```text
windUV = AbsoluteWorldPosition.xz
       + normalize(WindDirection) * WindSpeed * Time
noise = SimpleNoise(windUV, 1 / WindScale)
offset = (noise - 0.5) * WindIntensity * VertexColor.r
PositionWS += offset.xxx
```

The runtime ports Unity's Tchou integer hash and the exact octave weights
`0.125`, `0.25`, and `0.5`. It does not substitute ToonLab's generic sine wind.

Unity imports `T_Leaf_Pine` as sRGB, Repeat, Bilinear, anisotropy 1, with
mipmaps disabled. The runtime makes a private texture view with that sampler
contract. `SG_CameraDithering` remains active beyond the 3 m fade distance:
the saturated fade becomes one, but Shader Graph first multiplies it by two
and then subtracts the 4x4 Bayer threshold. The far-field multiplier is
therefore `2 - threshold`, not a constant one. Keeping this connected branch
materially changes the alpha-clip coverage and apparent density of the pine
cards.

## `M_PineBark` connected graph

The plain pine bark path is intentionally short:

```text
base = T_PineBark_BC(UV * [XScale,YScale])       // TintMix = 0
normalTS = UnpackNormal(T_PineBark_N, strength=1)
smoothness = sRGB(T_PineBark_R.r) * 0.05
specularColor = [0,0,0]
emission = base * 0.1
```

Moss and snow are disabled. `S_Bark` has no connected Vertex Position block,
so bark must not inherit the generic tree-sway deformation. The normal importer
has `flipGreenChannel=1`; the runtime applies the corresponding negative Y
normal scale. All three bark textures are Repeat, Bilinear with mipmaps, and
anisotropy 1.

## Renderer boundary

The graph outputs and serialized material values above are literal. URP's
Universal Lit BRDF, shadow filtering, reflection probes, fog, exposure, and
post-processing still require renderer-level parity with Three/WebGPU. The
runtime uses `MeshPhysicalNodeMaterial` only as the URP Lit integration bridge;
that bridge is not a claim of pixel identity. Final parity must be judged from
locked-camera captures after the scene light, ambient/sky contribution, fog,
and post stack are held constant.

## Verification

```sh
npm run verify:unity-tree-materials
npm run build
```

The verifier pins the five source hashes, checks the active serialized values,
constructs the two runtime materials, verifies Unity routing instead of the UE
fallback, and checks UV2, alpha, normal, sampler, smoothness, emission, and wind
contracts.
