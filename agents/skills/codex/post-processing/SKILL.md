---
name: post-processing
description: Help developers use ToonLab post-processing, bloom, color grade, LUT, vignette, outlines, depth cue, or motion blur.
---

# Post Processing

Use this skill when a developer wants ToonLab's optional post-processing
pipeline, settings, preset documents, bloom, color grading, LUTs, vignette,
screen outlines, depth cue, motion blur, or character-aware bloom.

Public imports:
- `toonlab/post`
- `toonlab/post-processing`

Read first:
- `docs/post-processing.md`

Developer guidance:
- Keep the post stack optional and controlled by the host app.
- Wire ToonLab outputs into the app's render loop deliberately; the app owns
  renderer lifecycle, resize handling, and scene/camera management.
- Use documented settings and preset documents for portable looks.
- Provide depth, masks, or character pass textures only when using features
  that need them.
- Do not assume ToonLab lab UI state or sample routing exists in the consumer
  app.

Verify:
- Run the consumer app's normal build and a before/after visual smoke check.
- Confirm disabling the post stack returns control to the app's normal render
  path.
