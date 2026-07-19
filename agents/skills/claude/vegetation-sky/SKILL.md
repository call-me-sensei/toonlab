---
name: vegetation-sky
description: Help developers use ToonLab vegetation assets, the IP-wide vegetation shader profile, coordinated grass palettes, portable vegetation recipes, or the stylized sky system.
---

# Vegetation And Sky

Use this skill when a developer wants procedural grass, flowers, stylized
trees, foliage cards, tree recipes, GLB export, wind, cloud shadows, sky
gradients, sun, clouds, or stars.

Public imports:
- `@call-me-sensei/toonlab/vegetation`
- `@call-me-sensei/toonlab/vegetation-shaders`
- `@call-me-sensei/toonlab/grass-palettes`
- `@call-me-sensei/toonlab/sky`
- `@call-me-sensei/toonlab/grass`

Read first:
- `docs/vegetation-sky.md`
- `docs/sky.md`
- `docs/lab-architecture.md`

Developer guidance:
- Add vegetation and sky objects to app-owned scenes, terrain, and render loops.
- Use one `VegetationShaderProfile` across grass, foliage, flowers, bark, and
  stems. Keep asset albedo/species separate from the shared shader treatment.
- Grass palettes update base, tip, and shadow tint together; they do not change
  shadow strength, wind, or current weather.
- Use the public versioned Grass, vegetation-shader, tree/flower recipe, and Sky
  preset document APIs for portable data; do not copy lab-local validators.
- Treat Sky as one integrated World System, not a separate Shader Lab. Its
  shader, sun, clouds, stars, and procedural motion form one system preset with
  exactly 46 portable art fields; dome radius and quality are not in it.
- `sky.settings` is the authored baseline and `sky.renderedSettings` is the
  current named-layer composition. Give Lighting, Weather, and other scene
  owners unique `setSceneOverrideLayer` ids and clear only their own id.
- For world integration, create a `LightingSystem` and call
  `lighting.attachWorld(world)`. Lighting owns the sun adapter and its Sky
  layer, then bridges Weather modulation; Weather keeps its own higher-priority
  Sky layer rather than mutating the authored preset.
- The composed-world sun adapter is `setSun({ direction, color, sky })`; it
  keeps the real light/shadows and Grass, Flower, Forest, Ambient FX, Sky, and
  Water scene inputs aligned without changing their portable presets.
- Sky quality is compile-time: low/medium/high compile 2/3/4 cloud octaves,
  custom `{ cloudOctaves: 1..5 }` is supported, and `sky.setQuality()` rebuilds
  the material while preserving authored settings and active layers.
- Keep current wind, wetness, snow, interaction targets, weather, lighting,
  camera, and export destinations owned by the host app.
- Treat Shader, Asset, and World System Labs as authoring examples, not runtime
  dependencies. Water and Sky keep their shader controls inside the complete
  system preset rather than requiring separate shader documents.
- Do not rely on ToonLab sample textures or generated manifests.

Verify:
- Run the consumer app's normal build and inspect near/far vegetation plus sky
  under the target camera.
- For exported trees, reload the generated asset in the consumer app or asset
  pipeline.
