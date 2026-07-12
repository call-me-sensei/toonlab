---
name: environment
description: Help developers use ToonLab environment shading, lighting rigs, ambient probes, reflections, fog, cloud shadows, or vertex AO in an app.
---

# Environment

Use this skill when a developer wants stylized scene materials, material-role
classification, sun/lamp rigs, time-of-day, ambient probes, planar reflections,
BVH vertex AO, fog, cloud shadows, or environment presets.

Public imports:
- `toonlab/environment`

Read first:
- `docs/environment.md`

Developer guidance:
- Apply environment materials to app-owned meshes and scenes.
- Keep asset loading, texture hosting, renderer setup, and scene routing in the
  host app.
- Use documented settings and presets for material roles, lighting, fog, cloud
  shadows, probes, and reflections.
- Treat BVH vertex AO as optional; apps that do not use it should not need
  `three-mesh-bvh`.
- Do not rely on ToonLab sample app URLs, sample asset paths, or generated local
  manifests.

Verify:
- Run the consumer app's normal build and visual smoke check.
