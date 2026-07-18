---
name: game-dev
description: The starting point for building a game or full scene with ToonLab — assembly order, the frame-loop contract across all systems, and a map of which feature skill to load when.
---

# Building a game with ToonLab

Use this skill when a developer is building a game, level, or full scene
with ToonLab — anything spanning more than one subsystem. It is a map and an
assembly guide: load the specific feature skill when you reach that
subsystem instead of guessing at its API from here.

Read first:
- `README.md` (What's inside)
- `docs/getting-started.md`

## Assembly order

Build in this order; each stage is playable before the next begins.

1. **Renderer + character** — app-owned `WebGPURenderer`, a character with
   the toon shader (skill: `toon-shading`; retargeting: `docs/characters.md`).
2. **World** — terrain/composed world via `createStylizedWorld`, or
   assembled scenes (skills: `outdoor-world`, `environment`).
3. **Surface systems** — water, vegetation, sky (skills: `water`,
   `vegetation-sky`).
4. **Lighting + weather** — a lighting style with day cycle and fixtures,
   then weather on top; weather modulates lighting through
   `setWeatherModulation`, never by editing lights directly (skills:
   `lighting`, `weather`).
5. **Post** — one pipeline, preset-driven (skill: `post-processing`).
6. **Camera + game feel** — follow rig, director, impact feedback (skills:
   `camera`, `game-feel`).
7. **Assets throughout** — generate with the package first (catalog,
   texgen); use the MCP only for external CC0 discovery/import and shared
   workspace reuse (skill: `asset-sourcing`).

## The frame-loop contract

Order matters. The recommended default:

```js
renderer.setAnimationLoop(() => {
  const realDelta = clock.getDelta();

  // 1. Time first: game feel converts real time into gameplay time.
  const { delta: scaledDelta } = feel.update(realDelta);

  // 2. Gameplay and world advance on SCALED time (hit-stop pauses them).
  controller.update(scaledDelta);
  world.update(scaledDelta);          // weather updates inside a composed world

  // 3. Presentation advances on REAL time (keeps moving during hit-stop).
  rig.update(realDelta);
  lighting.update(realDelta, camera);

  // 4. Post renders the frame last (replaces renderer.render).
  post.render(realDelta);
});
```

Rules that follow from it:
- Never feed `scaledDelta` back into `feel.update`, and never apply
  `timeScale` twice.
- When post is enabled, `post.render` owns the final draw — do not also call
  `renderer.render`.
- Camera punches route through the game-feel runtime (`cameraRig` adapter),
  not by shaking the camera from gameplay code.

## Cross-cutting rules (stated once, apply everywhere)

- **TSL/WebGPU-first.** Every ToonLab material is TSL/NodeMaterial with a
  WebGL2 fallback through the same path. Never introduce raw GLSL,
  `ShaderMaterial`, or WebGL-only forks for ToonLab features.
- **The app owns the shell**: renderer setup, resize, asset loading,
  routing, persistence, input. ToonLab systems accept objects; they never
  create the renderer.
- **Presets are the portability unit.** Every system accepts flat, versioned
  JSON preset documents; generate them deterministically (seeded recipes or
  the MCP style tools) and check them in. Don't hand-tune magic numbers
  inline.
- **Quality tiers** (`mobile` / `balanced` / `cinematic`) exist across
  systems and cap budgets; pick one per target device instead of tuning
  individual limits.
- ToonLab's labs, sample assets, and manifests are examples — never runtime
  dependencies of the app.

## Task → skill routing

- Character shading, outlines, fur, face shadows → `toon-shading`
- Scene/level materials, fog, reflections, time-of-day → `environment`
- Open world: terrain, forests, roads, villages → `outdoor-world`
- Water anything → `water`; grass/trees/sky → `vegetation-sky`
- Rocks/cliffs → `rockgen`
- Lights, day cycle, practicals → `lighting`; rain/snow/wind → `weather`
- Bloom/grade/outline → `post-processing`
- Follow camera, shake, rig blending → `camera`
- Hit-stop, squash, flashes, haptics → `game-feel`
- Finding/generating/importing any asset (package-first) → `asset-sourcing`

## Verify

- After each assembly stage, run the app and look at it before adding the
  next system.
- End-to-end: trigger a game-feel event during motion and confirm gameplay
  pauses while camera/flash keep moving; toggle post off and confirm the
  plain render path returns.
