# ToonLab — guide for AI coding agents

You are helping a developer use `@call-me-sensei/toonlab` 0.4.10, a
WebGPU-first Three.js toolkit for anime-style characters and environments.
Treat one world unit as one meter.

## Source of truth

Before proposing an import or a scene-construction plan, read:

- `docs/capability-status.md` for the current recommended-versus-experimental
  product boundary;
- `agents/references/runtime-entry-points.md` for the stable 0.4.10 package
  boundary;
- `agents/skills/codex/game-dev/SKILL.md` for existing-scene integration;
- `agents/skills/codex/outdoor-world/SKILL.md` only for explicitly requested
  outdoor experiments and QA;
- `agents/skills/codex/asset-sourcing/SKILL.md` for OSS/Pro MCP routing;
- `docs/styles-and-bundles.md` for treatment routing.

The recommended workflow starts from a host-constructed scene. The host creates
the renderer, layout, geometry, cameras, controls, animation, physics, lights,
shadows, storage, loading pipeline, collision, placements, and frame loop.
ToonLab styles labeled targets, supplies focused vegetation/water/assets, and
helps discover missing assets. It does not reliably turn a one-shot prompt into
a polished world.

Do not advertise repository-only modules as npm APIs. In 0.4.10, lighting,
camera behavior, game-feel behavior, gameplay VFX, path/village/prop/building
assembly, and full-world coordination remain host-owned or pre-release
experiments even when source or a lab exists in this checkout.

## Public package areas and maturity

Use only the exports in `package.json`. The recommended production areas are:

- `./toon`, `./toon-settings`, `./character`
- `./environment`, `./ground-shader`, `./rock-shader`
- `./vegetation`, `./vegetation-shaders`, `./grass`, `./grass-palettes`
- `./water`, `./water-settings` for a host-authored footprint, shore, and bed
- `./post`, `./post-processing`
- `./rockgen`, `./debrisgen`, `./texgen`, `./assetlib`
- `./styles`, `./asset-policy`, `./loaders`, `./debug`

Public `sky`, `cloud`, `weather`, `climate`, terrain/world helpers, ambient
effects, and fauna remain useful qualification surfaces, but their complete
scene outcome is experimental. API availability is not evidence that an agent
can compose them into approved final art.

The package verifier is authoritative. If documentation and exports disagree,
fix the documentation or deliberately add and qualify an export; never work
around the mismatch with a deep `src/` import in consumer code.

## Recommended existing-scene foundation

```js
import {
  applyEnvironmentShader,
} from '@call-me-sensei/toonlab/environment';
import { createCallMeSenseiGrassField } from '@call-me-sensei/toonlab/grass';

await applyEnvironmentShader(manufacturedRoot, {
  preset: 'call_me_sensei',
  scenario: 'exteriorDay',
});

const grass = await createCallMeSenseiGrassField({ placements });
scene.add(grass);

renderer.setAnimationLoop(() => {
  groundFieldPass.update();
  grass.update(clock.getDelta(), camera);
  renderer.render(scene, camera);
});
```

Apply Ground, Rock, Tree/Flower, Water, Toon, and Post through their matching
focused runtimes. Do not change level layout or invent missing host systems
unless the developer explicitly authorizes an experiment.

## Rendering and scene responsibilities

- Align the visible sky sun direction with the host directional light.
- Enable `castShadow` and `receiveShadow` deliberately. Terrain and cliff
  masses must cast onto beaches, water receivers where supported, vegetation,
  characters, and each other.
- Keep indirect light high enough that cel shadows retain material identity.
- Configure host scene fog and pass matching distance-fog settings to systems
  that expose adapters.
- Use named transient layers for current weather/time state. Do not persist
  composed runtime state as authored style data.
- Apply style bundles only after labeling roots by rendering domain. Bundles
  select treatments; labels select destinations; scene state supplies current
  conditions.
- Preserve imported PBR maps and semantic material roles. Never infer a
  production-safe material class from RGB alone.

## Experimental outdoor formation gate

The following is a research and evaluation order, not a supported one-shot
construction recipe. Use it only when the developer explicitly requests a
world-building experiment. Record every manual composition step and product
gap; never market a partially successful result as package behavior.

Build in this order:

1. macro terrain silhouette and water body;
2. parent geology and continuous material coverage;
3. connected primary and secondary rock structure;
4. biome relationships and tapered vegetation fields;
5. beach, shoreline, and underwater continuation;
6. lighting, atmosphere, and restrained post;
7. tertiary story dressing.

A cliff is a continuous terrain mass reinforced by overlapping modular rocks,
not a row of props. Rotate, tilt, non-uniformly scale, bury, crop, and overlap
reused rocks so visible copies do not expose the same silhouette, interval,
crop, or seam. Use one parent geology unless the level explicitly authors a
fault/contact. Hide every module back, base, terrain gap, and water-plane edge.

Grass and vegetation are ecological fields, not rectangles. Taper density at
paths, lips, rock fields, wetlands, and backshore. A lone tree must read as an
intentional landmark; otherwise form a canopy/sapling/understory relationship.

Continue the coast below water with a closed seabed, the same parent geology,
submerged rocks, moving aquatic vegetation, depth color/attenuation, and an
underwater camera treatment. Reject a hollow water plane or visible terrain
underside.

Inspect gameplay, shore, below-cliff, underwater, flyover, and top-down views.
Record every manual override as a package-default, skill, asset-policy, or
test-harness deficiency.

## Assets and MCP

Feature-detect the connected ToonLab MCP surface.

- OSS: inspect workspace/library, search the official local catalog, then use
  `search_cc0_assets` and `import_cc0_asset` when policy allows.
- Pro: inspect project/ToonLab libraries, use `search_public_gallery`, then
  retrieve an approved asset with `get_toonlab_asset`.

Do not prescribe an OSS-only tool to Pro or a Pro-only tool to OSS. Official
downloads must be immutable `https://assets.toonlab.io/official/...` URLs;
reject private CDN, signed, `creation-files`, or expiring URLs. Store stable
ID, source class, provenance, license, review status, checksum, and policy
decision for every used asset.

The npm package contains no third-party media packs. Optional assets such as
the CC0 mannequin are downloaded from immutable R2 or supplied by the host;
they do not increase the package tarball.

## Repository-only work

Files under `src/` can exist before their public contract is approved. For a
repository-only prototype:

- label its documentation “repository-only” or “planned” at the top;
- use relative internal imports in its examples, not package specifiers;
- do not add it to `agents/references/runtime-entry-points.md`;
- do not direct consumers to it from shipped skills;
- add export, package-boundary, clean-consumer, and visual qualification before
  describing it as stable.

## Verification

For package documentation and skills:

```bash
npm run verify:skills
npm run verify:docs
npm run verify:package
```

For a release candidate:

```bash
npm run verify:release
npm pack --dry-run
```

Install the resulting tarball in a clean consumer and test only its public
imports. A successful build is not visual approval. Capture fresh screenshots,
inspect console output, and compare near/far, lit/shadowed, gameplay/aerial,
shore/underwater, and relevant LOD states.

Database migrations and official catalog seed batches are append-only after
release. New official catalog metadata must use the next numbered seed and
immutable public R2 URLs. Never edit an applied migration or seed.
