# UE 5.8 legacy Default Lit adapter

## Result and scope

`src/environment/ueSourceDefaultLit.js` is the renderer-side lighting adapter
for SnowPines ordinary opaque materials whose authored graph authority is UE.
It is installed on the literal UE bark, snow, and landscape reconstructions.
It is deliberately **not** installed on rock or mountain: those production
bindings execute the supplied Unity `S_Rock` / `S_Mountain` graphs and retain
their URP lighting adapter plus the explicit UE-stage `1/PI` input conversion.

The implemented exact scope is:

- legacy `MSM_DEFAULT_LIT` (`r.Substrate=0`);
- Lambert direct diffuse;
- isotropic, single-scatter GGX direct specular for SnowPines' zero-size
  directional and point lights;
- UE `Specular -> F0` and green-channel micro-occlusion `F90`;
- captured-SkyLight diffuse at the cosine-convolved irradiance boundary; and
- the UE split-sum environment-specular F0/F90 multiplication boundary.

This is not complete renderer parity. UE's `PreIntegratedGF` texels, reflection
capture filtering/encoding, screen-space reflections, bent-normal/distance-
field occlusion, and deferred AO/reflection composition remain unavailable or
unported buffers. The runtime uses Three's `DFGLUT` and PMREM only as explicit
fallbacks behind the same split-sum boundary.

Run:

```sh
npm run verify:ue-source-default-lit
npm run verify:source-lighting-clones
```

## Active project branch

The supplied project fixes the shader permutation in
`StylizedExploration/Config/DefaultEngine.ini`:

```ini
r.Substrate=False
r.Material.RoughDiffuse=False
r.Material.EnergyConservation=False
r.DynamicGlobalIlluminationMethod=0
r.ReflectionMethod=2
```

Therefore `DefaultLitBxDF()` takes `Diffuse_Lambert`, not rough diffuse, and
its energy-preservation/conservation helpers compile to identity. SnowPines'
captured directional component has `LightSourceAngle=0`; both local point
lights have `SourceRadius=0`. `SphereMaxNoH()` and `EnergyNormalization()` are
therefore identity for the active lights. Rect lights, finite source shapes,
and anisotropy are outside this adapter's declared exact scope.

## Source equations

### Material inputs

`ShadingCommon.ush` and `DeferredShadingCommon.ush` build the legacy GBuffer
inputs as:

```text
DiffuseColor  = BaseColor * (1 - Metallic)
dielectricF0  = 0.08 * saturate(Specular)
SpecularColor = lerp(dielectricF0, BaseColor, saturate(Metallic))
Roughness     = saturate(authored Roughness)
```

This matters because Three's `specularIntensityNode` normally scales an
IOR-derived F0. Passing UE's authored `Specular=.2` through that path would
produce `.04*.2=.008`; UE requires `.08*.2=.016`. The adapter consumes the
literal source node and bypasses Three's IOR/specular remap.

### Direct diffuse and specular

For the active zero-size lights, `ShadingModels.ush::DefaultLitBxDF()` is:

```text
NoL = saturate(N.L)
NoV = saturate(abs(N.V) + 1e-5)
H   = normalize(V + L)
NoH = saturate(N.H)
VoH = saturate(V.H)

a2  = Roughness^4
d   = (NoH*a2 - NoH)*NoH + 1
D   = a2 / (PI*d*d)
a   = sqrt(a2)
Vis = .5 / (NoL*(NoV*(1-a)+a) + NoV*(NoL*(1-a)+a))
Fc  = (1-VoH)^5
F90 = saturate(50*SpecularColor.g)
F   = F90*Fc + (1-Fc)*SpecularColor

directDiffuse  = shadowedLightColor * NoL * DiffuseColor / PI
directSpecular = shadowedLightColor * NoL * D * Vis * F
```

Three's light node already includes source tint, analytic attenuation, cloud
shadow, and cast-shadow visibility in `lightColor`. The adapter materializes
that mutable expression once, then feeds the exact same value to both lobes.
It does not multiply shadow visibility a second time.

### Sky diffuse

`SkyLightingDiffuseShared.ush` evaluates the captured scene's three-band SH,
clamps negative channels, applies the SkyLight color/intensity, and multiplies
the result by `DiffuseColor`. Three's `getShIrradianceAt()` is in physical
cosine-convolved irradiance units (a constant unit-radiance sphere evaluates
to `PI`). The matching boundary is therefore:

```text
indirectDiffuse = ThreeIrradiance * DiffuseColor / PI
```

The adapter does this once. The existing `UeSourceCapturedSkyLightNode` owns
the scene capture, SH projection, nonnegative clamp, and intensity/tint.

### Environment specular

UE's active reflection path gathers filtered radiance and applies:

```text
AB      = PreIntegratedGF(NoV, Roughness)
F90     = saturate(50*SpecularColor.g)
EnvBRDF = SpecularColor*AB.x + F90*AB.y
output  = gatheredRadiance * EnvBRDF
```

The adapter ports this F0/F90 topology and does not add Three's multiple-
scattering compensation (disabled in the source project). The current `AB`
comes from Three's 16x16 `DFGLUT`, and gathered radiance comes from Three
PMREM. Those are fallbacks, not claims that the private UE buffers match.

## AO and reflection ownership

The adapter's material-level `ambientOcclusion()` hook is intentionally empty.
UE applies material AO, classic SSAO, `GetSpecularOcclusion`, distance-field
bent-normal occlusion, SkyLight diffuse, and reflection environment terms in
deferred composition. Folding Three's different specular-occlusion formula
into the material would double-apply or misplace that work. The source AO
post bridge remains partial and is tracked separately in the strict ledger.

`r.ReflectionMethod=2` selects screen-space reflections. A captured-SkyLight
PMREM cannot replace UE SSR ray marching, hit validation, edge fade, temporal
denoising, and reflection fallback; those remain explicit renderer gates.

## Pinned sources

| Source | SHA-256 |
| --- | --- |
| `Engine/Shaders/Private/BRDF.ush` | `0de81cc25c9b035a77aeb0e2f1be3e730c0f117f9250fe365104f30119b5e906` |
| `Engine/Shaders/Private/ShadingModels.ush` | `27d661854c627ad0aa52673f553946a9c61add15674b32715b4a6297d02ed98f` |
| `Engine/Shaders/Private/ShadingCommon.ush` | `7583ea665c6098f0957e63413971ad341dcb1588c634c7106bf955ce212c4189` |
| `Engine/Shaders/Private/DeferredLightingCommon.ush` | `d3bcd5cf9c36cab57c281f6cad447816891836e3c05a67c8808cbb9ad83e2c46` |
| `Engine/Shaders/Private/SkyLightingDiffuseShared.ush` | `9a725c7f015c310ed250207889f31bc9d63af8a9296e5ffa7a12b0d733d1de7c` |
| `Engine/Shaders/Private/ReflectionEnvironmentPixelShader.usf` | `5f22072c6d98c9701ebb472b4617fdc58e2adee4cf4f79ccb1d221643e4e4a1f` |
| `Engine/Shaders/Private/ReflectionEnvironmentComposite.ush` | `cb07271acf5f83593c2481346393f78cb18ab2b9079fb10ace366a0ec04920a1` |
| `StylizedExploration/Config/DefaultEngine.ini` | `db8663d1d4a41aa5a9632b68dc88ddf7dcecbe8eebd7051ad23f10a9483ceee9` |
| `Demonstration_SnowPines.json` | `63479d0a49a2e134d722fc1634879dec87eb3304035b0aea9337a60a95c65bf2` |

## Status

| Stage | Status |
| --- | --- |
| UE material `Specular/Metallic -> F0` | exact and numerically gated |
| zero-size direct Lambert | exact and numerically gated |
| zero-size isotropic single-scatter GGX | exact and numerically gated |
| direct surface-shadow placement | exact boundary; shadow-map generation tracked separately |
| captured-SkyLight diffuse BRDF boundary | exact and numerically gated |
| split-sum environment F0/F90 multiplication | exact and numerically gated |
| UE `PreIntegratedGF` bytes | unresolved renderer buffer |
| UE reflection capture filtering/encoding | unresolved renderer buffer |
| UE SSR | not ported |
| deferred material AO/specular occlusion/bent-normal composition | partial renderer bridge |
| rect/finite-area/anisotropic lights | outside active SnowPines scope |
