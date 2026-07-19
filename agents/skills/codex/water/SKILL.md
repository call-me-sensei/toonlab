---
name: water
description: Help developers use ToonLab water materials, waves, ripple simulation, breakers, splashes, rain, kelp, or water settings.
---

# Water

Use this skill when a developer wants WaterSurface, water material settings,
Gerstner waves, CPU buoyancy mirrors, ripple simulation, refraction, foam,
breakers, wakes, splashes, rain, kelp, underwater view, or water preset
documents.

Public imports:
- `@call-me-sensei/toonlab/water`
- `@call-me-sensei/toonlab/water-settings`

Read first:
- `docs/water.md`

Developer guidance:
- Add water surfaces and update hooks to the host app's scene and render loop.
- Treat Water as one integrated World System. Surface shading, waves, foam,
  reflections, interaction, and quality belong to the complete Water preset;
  do not invent a separate Water Shader document or runtime dependency.
- Keep interaction targets, camera mode, resize handling, and physics/buoyancy
  integration owned by the app.
- Use `water.settings` for the portable authored baseline and
  `water.renderedSettings` when inspecting the current Lighting/Weather
  composition. Live scene owners use unique `setSceneOverrideLayer` ids and
  clear only their own id; they must not write composed values back to a preset.
- In a composed world, create a `LightingSystem` and call
  `lighting.attachWorld(world)`: Lighting owns its Water light layer and
  becomes Weather's sun/ambient/fog bridge, while Weather adds wave energy
  through its own higher-priority Water layer.
- Choose Water's compile-time quality when constructing `WaterSurface`.
  Changing low/medium/high or custom quality requires replacing/rebuilding the
  surface; `applySettings()` edits authored art/simulation values, not quality.
- Use documented settings and presets for portable water looks.
- When using buoyancy, sample or mirror the same wave configuration the visible
  water uses.
- Treat ToonLab playground scenes as examples, not runtime dependencies.

Verify:
- Run the consumer app's normal build and inspect calm, moving, and interaction
  states relevant to the game.
- If buoyancy is used, check that objects match the visible water height closely
  enough for the app's camera distance.
