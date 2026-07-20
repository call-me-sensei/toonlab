# ToonLab Agent Guide

Use this file when helping a developer use ToonLab's runtime library in their
own Three.js app.

## Runtime Boundary

- `@call-me-sensei/toonlab` is a runtime library for Three.js shaders,
  stylized materials, procedural tools, settings, and preset documents.
- Prefer public package imports such as `@call-me-sensei/toonlab/toon`,
  `@call-me-sensei/toonlab/environment`, `@call-me-sensei/toonlab/water`,
  `@call-me-sensei/toonlab/vegetation`, `@call-me-sensei/toonlab/sky`,
  `@call-me-sensei/toonlab/lighting`, `@call-me-sensei/toonlab/weather`,
  `@call-me-sensei/toonlab/post`, `@call-me-sensei/toonlab/camera`,
  `@call-me-sensei/toonlab/game-feel`, `@call-me-sensei/toonlab/texgen`, and
  `@call-me-sensei/toonlab/rockgen`.
- Use `@call-me-sensei/toonlab/vegetation-shaders` and
  `@call-me-sensei/toonlab/grass-palettes` when a consumer needs only those
  focused contracts. They are the same bindings exposed by the vegetation and
  root barrels.
- Keep root imports lightweight in examples. Import only the feature subpath a
  developer needs.
- ToonLab's labs, sample assets, local manifests, screenshots, captures, and
  app routes are examples. Do not treat them as part of the runtime API or copy
  their local asset assumptions into user apps.
- The host app owns renderer setup, asset loading, decoder hosting, storage,
  routing, persistence, collaboration, and any AI/generated-asset workflow.

## Usage Rules

- Use the README and docs pages first; feature skills in `agents/skills/codex/`
  are short usage guides for public runtime APIs.
- For whole-game or multi-system work, start with the `game-dev` skill (assembly
  order, frame-loop contract, task→skill routing). When sourcing or generating
  assets, use the `asset-sourcing` skill (package-first; MCP for external
  CC0 discovery and workspace reuse).
- For outdoor construction, Call Me Sensei tuning, screenshot review, or
  modern anime action-RPG quality comparisons, use the `outdoor-world` skill.
  Its environment, lush-karst balance, layered vegetation, volumetric far-tree LOD,
  baked/contact grounding, horizon landmark, water, cloud-light, ring, trail,
  and visual-QA rules are a coupled production contract; do not replace them
  with copied legacy overrides.
- ToonLab materials are TSL/NodeMaterial-first for Three.js WebGPU with WebGL2
  fallback through the same TSL path. Do not guide developers toward raw GLSL,
  `ShaderMaterial`, or classic WebGL-only forks for ToonLab features.
- Keep developer examples focused on documented settings, preset documents,
  public constructors/helpers, and app-owned Three.js objects.
- Keep artifact scope explicit: Shader Labs author IP profiles, Asset Labs
  author geometry/material data, and Water/Sky Labs author complete runtime
  system presets with embedded shader controls. Sky and Water are integrated
  systems, not separate shader-document domains. Scene weather, lighting,
  camera, and interactions stay host-owned.
- For Sky and Water, `.settings` is the portable authored baseline and
  `.renderedSettings` is the current composition. Give Lighting, Weather, and
  other transient owners unique `setSceneOverrideLayer` ids and clear only the
  same id; never export composed scene state.
- For composed worlds, create a `LightingSystem` and call
  `lighting.attachWorld(world)`. It owns the world sun adapter and private
  Lighting layers, and automatically installs Lighting as Weather's
  sun/ambient/fog bridge. Weather remains a modulation owner with its own
  higher-priority Sky/Water layers.
  The world adapter is `setSun({ direction, color, sky })`, which keeps the
  physical light/shadows and every vegetation scene-light input aligned.
- Sky documents contain exactly 46 portable art fields. Radius and compile-time
  quality are not portable: named tiers use 2/3/4 cloud octaves, custom quality
  accepts `{ cloudOctaves: 1..5 }`, and `sky.setQuality()` rebuilds the material.
  Water quality is chosen when constructing/replacing `WaterSurface`, not via
  `applySettings()`.
- Do not depend on ToonLab sample assets, generated manifests, or lab-only
  model/environment discovery.
- Keep these downloadable resources focused on runtime usage.

## Developer Verification

- For consumer apps, run that app's normal typecheck, test, build, and visual
  smoke checks.
- For generated rock assets, use a fixed seed and compare the output your app
  expects.
