---
name: vegetation-sky
description: Help developers use ToonLab grass, flowers, trees, foliage, tree recipes, tree export, or stylized sky.
---

# Vegetation And Sky

Use this skill when a developer wants procedural grass, flowers, stylized
trees, foliage cards, tree recipes, GLB export, wind, cloud shadows, sky
gradients, sun, clouds, or stars.

Public imports:
- `toonlab/vegetation`
- `toonlab/sky`
- `toonlab/grass`

Read first:
- `docs/vegetation-sky.md`

Developer guidance:
- Add vegetation and sky objects to app-owned scenes, terrain, and render loops.
- Use documented recipes/settings for portable trees, grass, flowers, and sky
  looks.
- Keep wind, interaction targets, cloud shadows, and export destinations owned
  by the host app.
- Treat Tree Lab and sample galleries as authoring examples, not runtime
  dependencies.
- Do not rely on ToonLab sample textures or generated manifests.

Verify:
- Run the consumer app's normal build and inspect near/far vegetation plus sky
  under the target camera.
- For exported trees, reload the generated asset in the consumer app or asset
  pipeline.
