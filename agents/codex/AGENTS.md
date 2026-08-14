# ToonLab Agent Guide

Use this file when helping a developer build an anime-style game, character,
or environment with ToonLab's runtime library in their own Three.js app.

## Anime-Game Product Contract

- ToonLab is specifically an anime-game toolkit, not a generic stylization
  library. Read `agents/references/anime-art-direction.md` before making
  visual, shader, material, or asset decisions.
- Load the selected bundle's `artDirection` and treat it as authoritative.
  Call Me Sensei is the first-party coordinated reference.
- Never accept unintended photorealism, generic low-poly styling, undirected
  cartoon rendering, or untreated PBR materials as a finished ToonLab result.
- If supported shaders or approved assets are insufficient, document the
  customization and why your project needs it.

## Runtime Boundary

- `@call-me-sensei/toonlab` is primarily a runtime library for applying
  Three.js shaders, stylized materials, focused vegetation/water, settings,
  and preset documents to supplied scene content.
- Prefer public package imports such as `@call-me-sensei/toonlab/toon`,
  `@call-me-sensei/toonlab/environment`, `@call-me-sensei/toonlab/water`,
  `@call-me-sensei/toonlab/vegetation`, `@call-me-sensei/toonlab/post`,
  `@call-me-sensei/toonlab/styles`,
  `@call-me-sensei/toonlab/texgen`, and `@call-me-sensei/toonlab/rockgen`.
- Use `@call-me-sensei/toonlab/sky`, `/cloud`, `/weather`, `/climate`,
  `/ambientfx`, and `/fauna` only for a bounded qualification or an explicitly
  host-authored experiment.
- Use `@call-me-sensei/toonlab/vegetation-shaders` and
  `@call-me-sensei/toonlab/grass-palettes` when a consumer needs only those
  focused contracts. They are the same bindings exposed by the vegetation and
  root barrels.
- Keep root imports lightweight in examples. Import only the feature subpath a
  developer needs.
- Public export status and product maturity are different. Toon,
  Environment/Ground/Rock, Tree/Grass/Flower, Water on a host-authored
  footprint/shore/bed, Post, Gallery/MCP asset workflows, loaders, portable
  settings, and qualified focused generators are the recommended path. Current
  Sky/Cloud composition, whole terrain/biome/coast/cliff construction,
  automatic set dressing, and cross-system world assembly are experimental.
- ToonLab's labs, sample assets, local manifests, screenshots, captures, and
  app routes are examples. Do not treat them as part of the runtime API or copy
  their local asset assumptions into user apps.
- The host app owns scene layout and major geometry, asset placement, cameras,
  collision, asset loading, decoder hosting, storage, routing, persistence,
  collaboration, and final art direction. Renderer construction stays
  host-owned, while the public renderer helper and scene style runtime apply
  reversible Call Me Sensei renderer, lighting, probe, and shadow settings.
- VFX, camera, game-feel, and renderer selection are not style-bundle domains.
  Treat project-local implementations as custom adapters and record a gap when
  they affect the selected look. Lighting is a supported bundle domain.

## Usage Rules

- Use the README and docs pages first; feature skills in `agents/skills/codex/`
  are short usage guides for public runtime APIs.
- For existing-scene or multi-system integration, start with the `game-dev`
  skill (boundary, frame-loop contract, task→skill routing). When sourcing or generating
  assets, use the `asset-sourcing` skill. Feature-detect the connected ToonLab
  OSS local and/or ToonLab Pro remote MCP surface before calling tools; their
  overlapping tool names have different discovery roles and schemas.
  First-party rock search must shortlist from meter dimensions and taxonomy;
  do not load or render catalog GLBs merely to determine their size.
- Use `outdoor-world` and `karst-cliff-construction` only for an explicitly
  requested construction experiment, controlled package qualification, or
  failure analysis. They contain valuable review gates but are not evidence
  that ToonLab can build a polished outdoor scene from one prompt. Prefer
  bounded work on an existing terrain, asset family, vegetation field, or
  water body.
- For any style-aware construction, use `style-presets` to record the intended
  selector and distinguish neutral defaults from domains that already default
  to Call Me Sensei. For cliffs, gorges, sea stacks, or karst towers, use
  `karst-cliff-construction` plus
  `agents/references/geology-playbook.md`. Before visual approval or reporting
  a package gap, use `visual-verification` for readiness, isolation, multi-view,
  measurement, and outlier checks. These routes apply to every agent
  integration, not only Codex or Claude.
- ToonLab materials are TSL/NodeMaterial-first for Three.js WebGPU with WebGL2
  fallback through the same TSL path. Do not guide developers toward raw GLSL,
  `ShaderMaterial`, or classic WebGL-only forks for ToonLab features.
- Keep developer examples focused on documented settings, preset documents,
  public constructors/helpers, and app-owned Three.js objects.
- Keep artifact scope explicit: Shader Labs author IP profiles, Asset Labs
  author geometry/material data, and Water Lab authors a focused runtime
  system preset with embedded shader controls. Current Sky/Cloud labs are
  experimental qualification surfaces. Vegetation is one shared
  implementation family with separate Tree, Grass, and Flower shader profiles;
  their Generation Labs own geometry/material data. The stable public package
  trees are the 12 named pre-species legacy presets plus the generic
  `BranchTree`; repository species work is experimental and must not be
  presented as supported. Ground is a separate shader domain. Scene weather,
  lighting, camera, interactions, and complete Sky/Cloud composition stay
  host-owned or experimental.
- For style-bundle, multi-shader, or arbitrary-asset work, read
  `agents/references/style-bundles.md` first. A bundle selects coordinated treatments;
  explicit asset labels select rendering destinations; scene state selects
  current conditions. Inventory and label every renderable root and material.
  Every newly modeled, generated, or imported material slot requires a stable
  ID and valid semantic role in the versioned material contract. A root domain
  label is not sufficient for a multi-material asset; missing roles and mixed
  atlases without a split or ID mask block strict handoff.
  Character anatomy, clothing, held weapons, and worn hero accessories
  normally route to toon; manufactured props, vegetation, rocks/debris,
  water/sky, and VFX retain their owning runtimes. For an imported manufactured
  prop, call `proposeManufacturedStyleTargetLabel()` first, review every issue,
  provide explicit `materialOverrides` for unresolved slots, then call
  `applyManufacturedStyleTargetLabelProposal()`. Never collapse assisted
  results into the automatic success rate.
- Report unknown domains and material roles, mixed atlases without masks,
  unsupported transparency, and custom-renderer exemptions. Never silently
  infer a production-safe route from names, texture colors, or scene
  parenting. Preserve asset identity and runtime conditions when changing
  style.
- Local style bundle creation, validation, serialization, parsing, and
  resolution are OSS `/styles` APIs and require no database. Hosted storage
  and `fetchStyleBundle` are optional. Scene discovery remains explicit;
  manufactured assets have a conservative proposal/review/apply labeling path,
  and strict bundle application reconciles declared roles against live slots
  before the first mutation.
- New bundles use `treeShader`, `grassShader`, `flowerShader`, and
  `groundShader`. V1 `vegetationShader`, `tree`, `grass`, and `flowers`
  selections are migration inputs only and never serialize into v2. Do not
  serialize asset recipes, tree geometry, scatter, or live wind/weather
  into shader slots.
- Treat `call_me_sensei` as the first-party reference bundle. Optimize the
  canonical domain implementations for the best coordinated result and apply
  the completion gate in `agents/references/style-bundles.md`. Assigning the same
  style id to every slot is not completion, and compatibility flattening for
  incomplete assets must not define the signature look.
- For sourcing or generation, read
  `agents/references/mcp-asset-discovery.md` and
  `agents/references/asset-sourcing-policy.md`. Reuse an
  accepted asset first. If a procedural family has an approved stylized base
  set and passed the reliability gate, generate directly and skip gallery
  search. Otherwise use curated CC0, then properly attributed CC-BY; reserve
  image-to-3D for a named remaining gap. Preserve base-set version, recipe,
  seed, domain/material labels, license provenance, and the Call Me Sensei
  verification result. Pro may author/review base sets; OSS consumes portable
  artifacts without a database.
- For experimental Sky work and recommended focused Water work, `.settings` is the portable authored baseline and
  `.renderedSettings` is the current composition. Give Lighting, Weather, and
  other transient owners unique `setSceneOverrideLayer` ids and clear only the
  same id; never export composed scene state.
- In a composed-world test, use the public Lighting bundle slot and scene style
  runtime for the coordinated sun, sky probe, and shared shadow contract. Keep
  host-owned Weather and any custom local-light adapters coordinated with Sky,
  Water, and vegetation scene inputs.
- Experimental Sky documents contain exactly 46 portable art fields. Radius and compile-time
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
