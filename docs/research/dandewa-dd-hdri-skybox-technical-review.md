# Dandewa DD HDRI Skybox technical review

Reviewed on: 2026-08-03

Source: <https://dendewa.vercel.app/assets/main>

Archive: `dendewaLAB - DD HDRI Skybox (PUBLIC).zip`

Archive SHA-256: `3ac3491378daa51ce9b5aa41b56c1e6be0d59df046ad52c325039471fb960477`

This is the small **DD HDRI Skybox** shader package, not the separate
deprecated **Painted Anime Sky** artwork pack. It was obtained through
Dandewa's normal public security-check and Google Drive download flow. No
security control was bypassed.

## License and provenance

The distributed `readme.md` states MIT License and credits Rui_CG,
给你柠檬椰果养乐多你会跟我玩吗, and dendewa / DENDEWA. Its SHA-256 is
`b5ab1055541c915e5677d2717341f37c50c5d67dc93587a0afad56cad825d684`.
The review copies are not checked into ToonLab; the implementation below is a
clean TSL reimplementation of general rendering techniques.

This license finding does **not** clear the Painted Anime Sky redistribution
gate. That is a different archive and must retain its own notices and evidence.

## What the shaders actually do

- `Skybox.hlsl` samples an HDR cubemap, rotates it, and applies HSV,
  temperature, brightness, and black-and-white balance before output.
- `SkyLighting.hlsl` uses the same environment rotation for second-order
  spherical-harmonic diffuse irradiance and prefiltered cubemap specular
  lighting. It includes paths for cloth, anisotropy, clear coat, skin,
  subsurface, glass, and alpha materials.
- `IBL.hlsl` supplies the split-sum BRDF lookup, roughness-to-mip selection,
  explicit cubemap bilinear/trilinear filtering, and spherical-harmonic
  evaluation.
- `SkyboxFog.hlsl` reconstructs world position from depth, evaluates analytic
  exponential height fog, and colors the fog from distance-dependent blurred
  mip levels of the same rotated cubemap.
- `VolumeRendering.hlsl` contains the analytic height-fog optical-depth
  integral and its scale-height conversion.

It does not generate clouds, shade painted cloud sprites, or implement an
anime atmosphere. Its contribution is the consistency of the full environment
pipeline.

## Techniques adopted for ToonLab

1. One orientation and one time state must drive the visible sky, environment
   fill, reflections, and aerial fog.
2. Horizon color is an environment-lighting input, not merely a background
   color. The Sky & Cloud Lab now derives fog and hemispheric fill from the
   active authored time keyframe.
3. Environment color controls should remain independent from atmosphere
   scattering so art direction can alter saturation, exposure, and color
   temperature without changing sun geometry.
4. The production runtime should use a low-frequency sky representation
   (PMREM or spherical harmonics) for diffuse/specular environment response,
   while clouds continue to use the shared explicit sun vector for form
   shading and silver lining.
5. Terrain aerial perspective should be height-aware and distance-aware. The
   current lab uses a lightweight preview approximation; the outdoor runtime's
   three-layer fog remains the production path.

## Techniques intentionally not copied

- Ray-MMD G-buffer packing and YCbCr checkerboard encoding are engine-specific.
- Manual cubemap trilinear filtering is unnecessary when Three.js/WebGPU
  provides suitable texture sampling and PMREM facilities.
- The Dandewa package's HDRI background is optional reference/import content;
  Call Me Sensei's default sky remains procedural and dynamic.
- Dandewa does not solve the hero-cloud target. Cloud structure maps and TSL
  form lighting remain a separate ToonLab system.

