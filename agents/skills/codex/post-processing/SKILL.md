---
name: post-processing
description: Help developers use ToonLab post-processing, bloom, color grade, LUT, vignette, outlines, depth cue, or motion blur.
---

# Post Processing

Use this skill when a developer wants ToonLab's optional post-processing
pipeline, settings, preset documents, bloom, color grading, LUTs, vignette,
screen outlines, depth cue, motion blur, or character-aware bloom.

Public imports:
- `@call-me-sensei/toonlab/post`
- `@call-me-sensei/toonlab/post-processing`

Read first:
- `docs/post-processing.md`

Generating looks (no lab UI required):
- `createPostGeneratorRecipe(id, { seed, locks, configuration })` defines an
  editable domain; `createGeneratedPostPresetDocument(recipe, { quality })`
  resolves it into a flat, portable preset deterministically per seed.
- The MCP style tools (`create_style_recipe`, `generate_style_presets` with
  `lab: 'post'`) do the same thing server-side — use them only when you want
  validated batches persisted to the shared `.toonlab/` workspace; otherwise
  generate in code.
- Ship the resolved preset in the app; keep the recipe only if runtime
  re-rolling is a feature.

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
