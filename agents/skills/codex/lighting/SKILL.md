---
name: lighting
description: Help developers use ToonLab lighting — styles with a day cycle, placeable light fixtures, light/shadow budgets, physical intensity units, lighting documents, and ToonLab export.
---

# Lighting

Use this skill when a developer wants scene lighting identity: a lighting
style that moves with time of day, reusable practical fixtures (lamps,
lanterns, neon) with seeded per-placement variation, light and shadow-map
budgets, physical intensity units (lumens/candela/lux/kelvin), portable
lighting recipe/look documents, or ToonLab handoff.

Public imports:
- `@call-me-sensei/toonlab/lighting`

Read first:
- `docs/lighting.md`

Quickstart:

```js
import { createLightingSystem } from '@call-me-sensei/toonlab/lighting';

const lighting = createLightingSystem({
  camera,
  renderer,
  scene,
  style: 'call-me-sensei',   // or 'anime-day', a saved document, or settings
});
lighting.attach({ fog: scene.fog, driveSunPosition: true });

lighting.setTimeOfDay(18.5);                  // whole look follows the day cycle
lighting.place('street-lamp', [4, 0, 2]);     // seeded variation per placement

// per frame
lighting.update(delta, camera);
```

Developer guidance:
- Prefer `createLightingSystem` (style + fixtures + budgets) for game scenes;
  use the lower-level `createLightingManager`/`realizeLightingRecipe` when the
  app authors explicit light descriptors instead of a style.
- Budgets are the feature: lights and shadow maps are selected by distance,
  priority, per-type caps, and a total shadow-pixel budget — add as many
  fixtures as the level needs and let the manager cull, rather than manually
  limiting lights.
- Area lights gate on LTC texture loading (`ensureAreaLightSupport`) instead
  of crashing WebGPU/node backends; check capability reports before debugging
  "missing" lights.
- Use physical helpers (`createLightIntensity`, `colorTemperatureToRgb`) so
  intensities stay meaningful across renderer exposure changes.
- Deterministic generation in code: `createLightingStyleGeneratorRecipe` /
  `createLightFixtureGeneratorRecipe`; the MCP `generate_style_presets` tool
  is only for persisting validated batches to the shared workspace. Subtree
  locks like `sun` or `exposure` survive reseeds.
- `exportLightingRecipeToToonLab` produces a data-only manifest — it does not
  run ToonLab or guarantee visual parity.
- Weather/environment systems modulate lighting through
  `setWeatherModulation`; keep that the single hook rather than editing lights
  from weather code.

Verify:
- Run the consumer app and scrub `setTimeOfDay` across dawn/noon/dusk/night;
  confirm fixtures schedule on at night.
- Stress-place more fixtures than the budget and confirm distant ones cull
  without popping artifacts near the camera.
