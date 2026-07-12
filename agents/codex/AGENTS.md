# ToonLab Agent Guide

Use this file when helping a developer use ToonLab's runtime library in their
own Three.js app.

## Runtime Boundary

- `toonlab` is a runtime library for Three.js shaders, stylized materials,
  procedural tools, settings, and preset documents.
- Prefer public package imports such as `toonlab/toon`, `toonlab/environment`,
  `toonlab/water`, `toonlab/vegetation`, `toonlab/sky`, `toonlab/post`, and
  `toonlab/rockgen`.
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
