---
name: toon-shading
description: Help developers use ToonLab character toon shading, toon settings, presets, material roles, outlines, shadows, highlights, fur, or stickers.
---

# Toon Shading

Use this skill when a developer wants ToonLab character toon materials, toon
settings, preset documents, material-role handling, outlines, hair highlights,
rim light, shadows, stickers, glitter, fur, or debug views in their app.

Public imports:
- `@call-me-sensei/toonlab/toon`
- `@call-me-sensei/toonlab/toon-settings`

Read first:
- `docs/toon-shading.md`
- `docs/settings-reference.md`

Developer guidance:
- Apply toon shading to app-owned Three.js character roots and meshes.
- The host app owns character loading, animation, input, camera, persistence,
  and asset URLs.
- Use settings and preset documents for portable looks instead of lab HUD
  state.
- Use ToonLab's TSL/NodeMaterial path; do not advise raw GLSL or
  `ShaderMaterial` forks for ToonLab toon features.
- Do not rely on `assets-local/` or lab-only model discovery.

Verify:
- Run the consumer app's normal build and inspect the character under at least
  one lit and one shadowed view.
- Toggle the relevant setting or preset to confirm the app is not hard-coded to
  lab defaults.
