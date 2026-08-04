---
name: camera
description: Keep project-owned camera behavior compatible with ToonLab presentation while respecting the 0.4.10 unsupported-domain boundary.
---

# Camera Boundary

Camera behavior is not a stable ToonLab 0.4.10 package entry point or
style-bundle slot. Do not import `@call-me-sensei/toonlab/camera`.

Read `agents/references/runtime-entry-points.md` and
`agents/references/custom-gap-report.md` first. The host game owns camera rigs,
collision, framing, damping, shake, lenses, and cutscene blending. Use the
stable `post` bundle slot only for supported camera-presentation processing.
If a project-local camera adapter is necessary for the intended anime look,
record it as a custom gap rather than presenting it as bundle coverage.

Verify gameplay silhouettes, foreground separation, distant readability, and
post effects under each representative camera mode.
