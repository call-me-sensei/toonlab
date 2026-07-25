# Unity-first So Stylized rock and mountain audit

Status: **connected Unity graph logic ported; renderer-level pixel parity still
requires image verification**.

This document supersedes the UE graph as the production shader authority for
the rock and mountain families in `examples/source-showcase`. The literal UE
material reconstruction remains useful as a forensic Rock Lab comparison, but
it is no longer the material bound by the live source showcase.

## Authorities

The two supplied Unity copies are byte-identical:

| Graph | SHA-256 | Runtime |
| --- | --- | --- |
| `Environment/Rocks/Shaders/S_Rock.shadergraph` | `a3bb01037314605728ba852d407df95e3bd9374f87e42c28cc28da49172e5f5b` | `src/rockgen/reference/unityRockMaterial.js` |
| `Environment/Rocks/Shaders/S_Mountain.shadergraph` | `dcee9bf8279066e76e98871f7c61852f445be600571382d70dbca83f4fddc485` | `src/rockgen/reference/unityRockMaterial.js` |

The checked sources are:

- `../SoStylized-Unity`
- `/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity`
- the generated URP HLSL in the Setup Guide project's `Library/Artifacts`
- `assets-local/sostylized-unity/rock-material-library.json`

Both graphs target opaque Universal Lit, metallic workflow, cast shadows on,
and receive shadows on. Neither graph changes vertex position, normal, or
tangent.

## Camera 01 acceptance subjects

| Visible subject | UE-exported slot | Unity authority |
| --- | --- | --- |
| Foreground-left rocks | `SM_RockClassic3`, `SM_RockClassic10` / `MI_RockClassic_Rocks` | `MV_RockClassic_Rocks` |
| Bottom-right moss rock | `SM_RockClumpClassic10` / `MI_RockClassic_Rocks_MossWorld` | `MV_RockClassic_Rocks_Mossy` |
| Visible Classic cliffs | `MI_RockClassic_Cliff` | `MV_RockClassic_Cliff` |
| Mountain backdrops | `MI_Mountain_Snowy` | Unity's only child profile, `MV_Mountain` |

The Classic identities are exact cross-pack assignments, confirmed against the
Unity FBX importer material remaps. Unity does not ship a separately named
`MV_Mountain_Snowy`; its single `MV_Mountain` graph already contains both grass
and snow height layers. The mapping is therefore recorded as a parent fallback,
not misreported as a name-exact material.

## Corrections made by the Unity audit

1. The live source showcase previously sent the `rock` family through the UE
   reconstruction. It now resolves each imported `MI_*` slot to its supplied
   Unity `MV_*` material and executes `S_Rock`.
2. Distance thresholds were multiplied by `0.01`. That was incorrect: the glTF
   exporter already converts UE centimetres to Three metres, while Unity
   material distances and Unity-imported FBX geometry are also metres. Unity's
   authored `500 / 15000 / 20000` values now remain unchanged.
3. Shader Graph `ColorMode.Default` values were treated as already-linear.
   Unity serializes their inspector/sRGB numbers and converts them to linear
   before CBUFFER upload. ToonLab now performs the same conversion for rock,
   distant, stripe, moss, grass, snow, and sand colors. This is especially
   important for the green moss on `SM_RockClumpClassic10`.
4. NormalMap imports were read as raw RGB. The supplied Standalone imports use
   Unity's RG/AG normal unpack path: X/Y are decoded from the imported pair and
   positive Z is reconstructed after texture filtering. ToonLab now mirrors
   that path and honors each texture's `flipGreenChannel` flag.
5. `mountain` remained on a different UE graph. The connected `S_Mountain`
   graph is now ported separately and bound to the live showcase.

## Connected `S_Rock` order

The runtime preserves this generated-HLSL order:

```text
project rock color
-> saturation
-> contrast around pow(.5, 2.2)
-> brightness
-> linearized Rock Tint
-> radial distance tint
-> optional striping
-> optional moss
-> Grass SG_SubLayer
-> Snow SG_SubLayer
-> Sand SG_SubLayer
```

The normal chain is:

```text
UV0 stylized normal or flat tangent normal
-> Shader Graph triplanar crack normal
-> radial distance Normal Strength flatten
-> Shader Graph NormalBlend(Default)
-> optional top normal selected by the shared top alpha
```

The Classic Rocks child deliberately has `Rock Normal Flatten = -0.1`, so its
near crack Normal Strength is `1.1`; the port does not clamp that authored
value. The distance fade starts from radial camera-to-fragment distance, not
view-axis depth.

Top alpha is exactly:

```text
alpha = saturate(
  remap(WorldGeometryNormal.y, [TopOffset, 1], [0, 1])
  * TopSharpness
)
alpha *= TopLayerMask(UV0).r  // only when mask toggle and map are present
```

Final smoothness is multiplied by `1 - alpha` even when all color sublayer
toggles are off. The source graph exposes several values which are disconnected
from its master outputs; the port does not invent uses for them.

## Moss contract

For `MV_RockClassic_Rocks_Mossy`:

```text
pattern   = triplanar(T_NoiseStylized, size=25)
mossColor = lerp(
  linear(sRGB(.3019608, .48235294, .11764706)),
  linear(sRGB(.47058824, .6509804, .2627451)),
  pow(pattern, 1.3)
)
slope     = saturate(WorldGeometryNormal.y * 1.92 - (-.15))
mask      = saturate(pow(pattern * 1.94 * slope, 2))
color     = lerp(rock, mossColor, mask)
```

This graph modifies base color only. The serialized `Moss Specular` property is
not connected in Unity `S_Rock` and is intentionally not applied.

## `S_Mountain` contract

`MV_Mountain` resolves to:

- texture scale `134.7`
- noise size `1260`
- grass slope max `.231`
- grass top fade `.868`
- grass noise strength `.176`
- snow noise strength `.5`
- snow top amount `.3`
- smoothness `.066`

The graph samples rock and snow at `worldXZ / textureScale`, grass at twice that
coordinate, and shared noise at `worldXZ / noiseSize`. Grass uses geometry
slope plus centered noise and a `0.04` linear transition. Snow uses the reversed
UV0 height gradient plus noise and a `0.05` reversed transition. There is no
normal map, metallic, emission, or occlusion texture branch.

The supplied Unity mountain FBXs have UV V increasing with mesh height. The
UE-exported showcase glTF has V decreasing with height (`SM_Mountain01` has
correlation about `-0.92`). Texture-image conventions already compensate when
sampling maps, but a procedural use of the scalar UV value does not. Only the
mountain graph's procedural `UV0.y` is therefore flipped for this showcase
bridge; ordinary texture UVs are not double-flipped.

## Import contract

- Base, layer, moss, and noise textures: Default/sRGB, repeat, mipmaps on,
  bilinear filtering.
- Normal textures: NormalMap/linear, repeat, mipmaps on, bilinear filtering.
- Texture scale/offset is not applied: every connected Shader Graph texture
  property is generated with `useTilingAndOffset=false` and fixed
  `(1, 1, 0, 0)`.
- All acceptance meshes contain normals, tangents, UV0, and UV1. Unity imports
  their source normals and calculates tangents; the UE glTF carries a tangent
  attribute, so the port does not need a derivative-frame fallback.

## Known source-pack asymmetries

The SnowPines scene requests two names not separately present as Unity material
assets:

- `MI_Mountain_Snowy` -> `MV_Mountain`
- `MI_RockSpire_Rocks_Snow` -> `MV_RockSpire_Rocks`

Both are surfaced as non-exact fallbacks in runtime metadata and verification.
The second loses an UE-only named snowy Spire-rock variant; it must not be used
as evidence of exact Unity profile parity.

## Remaining renderer boundaries

The graph inputs and connected math can match while pixels still differ because
Three's physical renderer is not URP 17.5. Remaining image-level checks include
the URP Lit BRDF and reflection probes, shadow filtering/bias, SSAO, fog,
exposure/tone mapping, bloom, and temporal antialiasing. Those should be tuned
at the renderer level after the exact graph path is visible; they should not be
hidden by editing source material values.

### Native UE SkyLight boundary correction

The SnowPines stage now imports the nine coefficients returned by
`USkyLightComponent::GetIrradianceEnvironmentMap`. One renderer-boundary bug
previously made that exact data ineffective: `SphericalHarmonics3` stores each
coefficient as `Vector3`, but the code passed a `THREE.Color` directly to
`Vector3.multiply()`. Three's vector multiply reads `x/y/z`; Color exposes
`r/g/b`, so every tinted coefficient became `NaN`. The raw-SH inspection data
therefore looked correct while rock shade fell back to its authored warm
emission and direct light.

`tintUeSourceSkySh()` now applies the component's linear `195/223/255` tint by
explicit `r/g/b` channel and rejects non-finite input. The deterministic
`verify:source-rock-skylight` oracle locks the full fully-shadowed path:
native SH -> linear SkyLight tint -> 1.2 intensity -> UE/URP `1/PI` boundary ->
the serialized Classic-rock metallic/emission values. A neutral Classic-rock
sample must resolve to `[.043357129, .067372293, .140787103]`; this is over 3x
more blue than red even with the source `.12` emission floor.

Run the deterministic audit with:

```sh
node scripts/verify-so-stylized-unity-rock-parity.mjs
npm run build
```
