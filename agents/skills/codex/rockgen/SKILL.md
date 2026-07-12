---
name: rockgen
description: Help developers use ToonLab procedural rock, cliff, heightfield, erosion, SDF, mesh, preset, sculpt, or GLB export tools.
---

# Rockgen

Use this skill when a developer wants procedural rock, cliff, or heightfield
generation; stylized erosion; SDF composition; surface-nets meshing; rock
presets; sculpt edits; or GLB export.

Public imports:
- `toonlab/rockgen`

Read first:
- `README.md` feature table for the exported rockgen surface.

Developer guidance:
- Use fixed seeds when an app needs repeatable generated assets.
- Store app-specific presets or generated outputs in the host app's asset
  pipeline, not in ToonLab sample folders.
- Treat Rock Lab as an optional local authoring example, not a runtime
  dependency.
- Heightfield erosion is provided by ToonLab's first-party stylized erosion
  path; do not advise developers to depend on the old terrain-editor fork or
  third-party simulator.

Verify:
- In consumer apps, regenerate with the same preset/seed and compare the asset
  shape or exported file the app expects.
