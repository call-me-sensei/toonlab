---
name: game-dev
description: Starting point for integrating ToonLab 0.4.10 into an existing anime-style game or scene, including focused runtime routing, Gallery/MCP sourcing policy, and experimental/host-owned boundaries.
---

# Integrating ToonLab into an Anime-Style Game

Use this skill when an existing game, level, character, or scene spans more
than one ToonLab system. Do not use it to promise a complete polished world
from one prompt.

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/mcp-asset-discovery.md`
- `agents/references/asset-sourcing-policy.md`
- `agents/references/runtime-entry-points.md`

## Assembly order

1. Inventory the supplied scene, approved cameras, existing asset/library
   content, and the exact targets the developer wants ToonLab to change. Treat
   layout, terrain, coastline, biome, lighting, camera, gameplay, and collision
   as protected host work unless the developer requests an experiment.
2. Load the selected v2 bundle and its `artDirection`; use
   `CALL_ME_SENSEI_STYLE_BUNDLE` when no other approved bundle is selected.
3. Locate the asset-sourcing policy. Ask the developer when it is missing;
   continue library-first in advisory mode only while reporting that decision.
4. Feature-detect ToonLab OSS local and/or ToonLab Pro remote MCP. Reuse the
   project/library first, search the released Gallery for named gaps, validate
   finalists, then download only selected assets with provenance.
5. Let the host game retain its renderer, scene layout, cameras, controls,
   animation, physics, lights/shadows, collision, storage, and loading pipeline.
   Label only the requested character, manufactured, tree, grass, flower,
   ground, rock, water, and post targets.
6. Run `auditStyleBundleApplication()` and resolve every missing label, mixed
   material, unsupported renderer, missing slot, or custom adapter before the
   first mutation. Then call atomic `applyStyleBundle()`.
7. Add focused procedural grass, qualified trees/flowers, or Water only where
   the host supplies placements or a valid footprint/shore/closed bed. Do not
   silently redesign the level to make a subsystem fit.
8. Run the game and inspect the developer-supplied cameras plus relevant
   close/far and lit/shadowed views. Iterate one material or asset family at a
   time and report every remaining host or experimental gap.

## Runtime boundary

The host render loop advances gameplay and explicitly installed scene systems,
then renders once. Do not invent undocumented ToonLab imports. One-shot world
generation; terrain/biome/coast/cliff formation; automatic set dressing;
current Sky/Cloud composition; and full Lighting, Weather, Climate, VFX,
camera, game-feel, navigation, physics, and streaming composition are
experimental or host-owned.

Asset identity never belongs in a v2 style bundle. Strict tree and rock tests
accept only project/ToonLab libraries or the ToonLab gallery. A similar-looking
external or generated replacement is still denied under that policy.

## Definition of done

- Every requested supported treatment routes to an explicit labeled target;
  unused or experimental bundle slots are not a completion requirement.
- No raw PBR material escapes without the selected anime treatment.
- Every used asset has stable ID, source class, provenance, license, anime-fit
  review status, and a policy decision.
- Supplied verification cameras pass the requested material, asset, vegetation,
  water, shadow, and LOD checks without changing protected host composition.
- `.toonlab/reports/style-asset-gaps.json` and `TOONLAB_ASSET_GAPS.md` exist
  when custom work was required, and state what feedback is requested.
- The consumer build and a real gameplay smoke test pass.
