# Gameplay VFX (vfxgen) — integration notes

> **Repository-only status:** `src/vfxgen/` and its arena are not exported by
> the 0.4.10 npm package. The notes below describe pre-release internal wiring;
> consumers must keep gameplay VFX host-owned and must not invent a
> `@call-me-sensei/toonlab/vfxgen` import.

The normative product, schema, authoring, template, runtime, quality, and
Charged Energy Shot requirements live in
[VFX authoring architecture](../../docs/vfx-authoring.md). This file is the
code-oriented integration companion.

The `src/vfxgen/` cluster is self-contained and wired into the shared files:

- `src/index.js` — root re-export (`export * from './vfxgen/index.js'`)
- `package.json` — `"./vfxgen"` subpath export + `verify:vfxgen` script
  (also folded into `verify:all`)
- `vite.config.js` — `'vfxgen'` package alias + `vfxArena` build input
- `scripts/generate-settings-reference.mjs` — Gameplay VFX module entry
- `labs/shared/sceneHub.js` — `vfxLab` + `vfxArena` hub entries
- Demo/reference app: `examples/vfx-arena/` (headless gates on
  `document.body.dataset`: `vfxArenaReady`, `vfxLiveGlow`, `vfxLivePuff`,
  `vfxDrawCalls`, `vfxSpawns`)
- **Designer: shared VFX Lab at `/vfx-lab/`** (`labs/vfx-lab/`) —
  intent-first, one-effect-per-workspace authoring. The effect browser opens an
  isolated Design/Renderers/Shape/Motion/Sequence/Sources/Layers/Quality
  workspace. Renderer Profiles exposes the stable renderers referenced by the
  active effect plus its style and validated local presentation overrides. Shape
  provides independent front/rear taper controls plus a one-half drawing
  canvas whose contour is mirrored and revolved into the runtime volume.
  Motion provides six deterministic circulating-energy themes plus fully
  editable arc count, speed, direction, coverage, irregularity, branching,
  thickness, body-relative orbit clearance, axial wander, three-dimensional
  plane variation, and reformation controls. Circulation references the
  directional main body but can be expanded to the decorative shell without
  coupling those layers. Sequence owns release-ring depth, irregularity, and
  ripple controls; release is one compact seeded closed loop with
  firing-axis depth rather than a planar torus or blast volume. Sequence can
  preview charge, release, travel, impact, or expiration separately, or run
  the complete charge-to-collision flow. The Create surface exposes the full
  intent catalog, truthful template availability, structural questions,
  macro parameters, preview-only runtime charge, and the phase-filtered layer
  stack. Export emits a portable `toonlab.vfx.effect` document and paste-ready
  registration/spawn code. Share links carry the effect in `?vfxEffect=`;
  the old `?vfxRecipe=` system-settings format remains import-compatible.
  Headless gates: `vfxLabReady`, `uiReady`, `vfxLiveChargedShots`,
  `vfxMovePhase`, and the arena stats above.

This is the first production vertical slice of the intended generalized
authoring model, not a claim that every documented intent already has a
runtime template. `getVfxIntentOptions()` reports the entire catalog and marks
unimplemented entries `planned`; only Charged Energy Shot is currently
`available`.

## Layout (categorized)

```
src/vfxgen/
  vfxSettings.js        DEFAULT_VFX_SETTINGS + groups + field schema
  vfxPresets.js         'default' + 'call_me_sensei' + registerVfxStyle()
  vfxEffectDocuments.js versioned portable effect schema + validation
  vfxSourceAssets.js    procedural/file source documents + validation
  vfxSourceRuntime.js   procedural canvas and uploaded animated-media textures
  vfxShapeProfiles.js   normalized mirrored axial-profile utilities
  vfxEnergyMotion.js    themed + custom circulating-energy authoring contract
  vfxTemplates.js       intent taxonomy + registered template compiler
  vfxSystem.js          createVfxSystem — event-driven runtime, pools, clock
  core/                 rendering machinery (no gameplay knowledge)
    burstBackbone.js    ring-buffer one-shot GPU particles, 2 draw calls
                        (kinds: spark, ember, flash, ground ring, puff,
                        camera-facing shockwave)
    trailRibbon.js      swept-arc ribbon (slash trails, limb smears) —
                        reference-style SOLID two-band surface (body +
                        white leading edge), tail ERODES (hard dissolving
                        cutoff, inner edge first) instead of alpha-fading,
                        Catmull-Rom smoothed centerline (SUBDIV spline
                        points per raw frame sample), charged-edge flash
                        on the newest segments
    projectileCore.js   pooled flame-core billboard
    chargedShotCore.js  profile-generated directional volume, animated shells,
                        bounded circulating-energy ribbons, streaks,
                        source-anchored warped release ring, and local light
    spriteShapes.js     TSL SDF sprite masks (zero textures)
    vfxRandom.js        seeded PRNG trio (internal, not re-exported)
  effects/              PURE builders: (settings, rng, options) → records
    chargedShotEffects  deterministic travel, impact, and expiration records
    weaponEffects.js    emitImpact, emitSlashSparkle
    magicEffects.js     emitFireballEmbers, emitFireballExplosion
    movementEffects.js  emitFootstep, emitLanding
  weapons/
    stylizedWeapons.js  procedural weapons (sword, greatsword, spear,
                        dagger, hammer): mesh + trail anchors + weight profile
  moves/
    moveLibrary.js      PURE authored move data — phases + pose keys + VFX
                        event tracks (slash, overhead, thrust, spin, plunge)
    moveController.js   plays a move on a weapon, fires its events into vfx
```

## Weapons + moves (the batteries-included motion layer)

The VFX rides real motion: a move is authored phase data (`windup → strike
→ recover`; the plunge is the full Dragoon decomposition `crouch → leap →
apex → dive → landfall → recover`), each phase carrying its VFX beats
(trail on/off, impact, landing, dust). Weapon `weight` scales timing and
hit power — the same `overhead` reads as a dagger flick or a hammer commit.

```js
import {
  createMoveController, createStylizedWeapon, createVfxSystem,
} from '../src/vfxgen/index.js'; // repository checkout only

const weapon = createStylizedWeapon({ type: 'greatsword' });
characterHand.add(weapon.root);            // or an actor anchor group
const attack = createMoveController({ weapon, vfx, groundY: 0 });
attack.play('overhead');                    // on the attack input
attack.update(delta);                       // per frame, before vfx.update
```

Own animations stay first-class: skip the controller and drive
`vfx.spawn('slash', { follow: bone, base, tip })` from your clips — the
move library is default motion, not a requirement. External weapon meshes
slot in by providing the same `{ root, anchors, profile }` shape.

Built-ins: **weapon** (`slash`, `impact`) · **magic** (`fireball`,
`chargedShot`) ·
**movement** (`footstep`, `landing`). `VFX_CATEGORIES` in vfxSettings.js is
the canonical map; new effects should join a category (or add one) and keep
their emission logic as a pure builder in `effects/`.

Project-owned ids come from portable effect documents. Register documents at
construction or atomically while the system is live:

```js
import {
  createChargedShotDefaultSources,
  createVfxEffectFromTemplate,
  createVfxSourceRuntime,
  createVfxSystem,
} from '../src/vfxgen/index.js'; // repository checkout only

const chargedShot = createVfxEffectFromTemplate('charged-energy-shot', {
  id: 'player.arm-cannon.charged',
  style: 'call_me_sensei',
  parameters: { edgeColor: [0.2, 0.6, 1], particleRate: 180 },
});
const sourceDocuments = createChargedShotDefaultSources(chargedShot.id, 42);
const sourceRuntime = createVfxSourceRuntime({
  sourceAssets: Object.fromEntries(sourceDocuments.map((source) => [source.id, source])),
  // File-mode sources additionally receive id-keyed resolved browser URLs.
  runtimeUrls: {},
});
const vfx = createVfxSystem({
  effectDocuments: [chargedShot],
  sourceTextures: sourceRuntime.textures,
});

// Later authoring updates affect future spawns; live instances keep the
// settings with which they were armed.
vfx.registerEffectDocument(updatedChargedShot, { overwrite: true });
// Immediate gameplay release:
vfx.spawn(chargedShot.id, { from, velocity, charge, onHit });

// Or ask the runtime to hold the source-anchored charge phase first:
const sequence = vfx.spawn(chargedShot.id, {
  from,
  velocity,
  charge,
  chargeDuration: 0.75,
  onHit,
});
// sequence.phase reports charge → release → travel. Impact/expiration are
// one-shot pooled child records after the traveling body is retired.

// Per frame, update animated sources before the VFX runtime.
sourceRuntime.update(elapsedTime);
vfx.update(delta, camera);
```

## Host usage (standalone — works in any Three.js scene)

```js
import { createVfxSystem } from '../src/vfxgen/index.js'; // repository checkout only

const vfx = createVfxSystem({
  seed: 42,
  style: 'call_me_sensei',
  heightAt: world?.collision?.groundHeight ?? terrain?.heightAt, // fireball ground hits
});
scene.add(vfx.root);

// per frame, before render:
vfx.update(delta, camera);

// gameplay events:
const trail = vfx.spawn('slash', { follow: weaponBone, base: [0, 0.5, 0], tip: [0, 1.3, 0] });
trail.stop();                                             // when the swing anim ends
vfx.spawn('impact', { at, normal, power: 1 });
const bolt = vfx.spawn('fireball', { from, velocity, onHit });
vfx.spawn('footstep', { at, dir: velocityXZ });
vfx.spawn('landing', { at, power: fallSpeed / 6 });

// world look integration:
vfx.setDistanceFog({ color, density, falloff, floorY }); // same params as forest/water
vfx.setTimeScale(0);                                      // hit-stop
```

Budgets: all one-shot bursts render in **two draw calls** (glow + puff ring
buffers, `shared.maxParticles` instances total); each live slash ribbon and
fireball core adds one small draw, bounded by `shared.maxTrails` /
`shared.maxProjectiles`. Layered projectiles are separately bounded by
`shared.maxLayeredProjectiles`; their draw-call cost is reported in runtime
stats. Everything is `userData.waterExclude` — transient flashes are not
worth re-rendering the water passes.

## Deferred follow-ups (deliberate)

- **`createStylizedWorld({ vfx })` wiring** — mirror the ambientfx option:
  construct the system with the world's `heightAt` + follow target, call
  `vfx.setDistanceFog` from the world's height-fog params, tick it inside
  `world.update`. Waiting until a real consumer (mini-game / runtime spine)
  exists so the option surface is shaped by actual use.
- **Limb smears** — `createTrailRibbon` already supports any Object3D +
  anchor pair; a character-side helper that arms ribbons from bone names
  belongs in `src/character/` when procedural animation lands.
- **Visual catalog persistence beyond the browser Lab** — the Lab persists
  effect/source metadata locally and uploaded binaries in IndexedDB. A shared
  project service should own multi-user revisions, thumbnails, dependency
  resolution, and binary transport when collaboration lands.

## Verification

- `npm run verify:vfxgen` — node-only: determinism (same seed + same spawn
  script → bit-identical buffers), ring-buffer budgets, lifecycle (expiry,
  ribbon pooling, ground detonation + onHit), look overrides, hit-stop, and
  the pure builders' geometry contracts.
- Visual: drive `examples/vfx-arena/?hud=0` headlessly (Playwright,
  `--enable-unsafe-webgpu --enable-gpu`), wait for
  `dataset.vfxArenaReady === 'true'`, screenshot several beats, and LOOK at
  them (slash = crescent arc, impact = star + spark streaks, fireball =
  two-band flame + ember trail, detonation = ring + smoke column).
