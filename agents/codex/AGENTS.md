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
- ToonLab materials are TSL/NodeMaterial-first for Three.js WebGPU with WebGL2
  fallback through the same TSL path. Do not guide developers toward raw GLSL,
  `ShaderMaterial`, or classic WebGL-only forks for ToonLab features.
- Keep developer examples focused on documented settings, preset documents,
  public constructors/helpers, and app-owned Three.js objects.
- Do not depend on ToonLab sample assets, generated manifests, or lab-only
  model/environment discovery.
- Keep these downloadable resources focused on runtime usage.

## Developer Verification

- For consumer apps, run that app's normal typecheck, test, build, and visual
  smoke checks.
- For generated rock assets, use a fixed seed and compare the output your app
  expects.
