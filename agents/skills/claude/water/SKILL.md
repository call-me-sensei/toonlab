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
- `toonlab/water`
- `toonlab/water-settings`

Read first:
- `docs/water.md`

Developer guidance:
- Add water surfaces and update hooks to the host app's scene and render loop.
- Keep interaction targets, camera mode, resize handling, and physics/buoyancy
  integration owned by the app.
- Use documented settings and presets for portable water looks.
- When using buoyancy, sample or mirror the same wave configuration the visible
  water uses.
- Treat ToonLab playground scenes as examples, not runtime dependencies.

Verify:
- Run the consumer app's normal build and inspect calm, moving, and interaction
  states relevant to the game.
- If buoyancy is used, check that objects match the visible water height closely
  enough for the app's camera distance.
