# Gameplay VFX (vfxgen) — integration notes

The `src/vfxgen/` cluster is self-contained and ALREADY wired into the shared
files (unlike the ambientfx handoff doc, nothing here is pending):

- `src/index.js` — root re-export (`export * from './vfxgen/index.js'`)
- `package.json` — `"./vfxgen"` subpath export + `verify:vfxgen` script
  (also folded into `verify:all`)
- `vite.config.js` — `'vfxgen'` package alias + `vfxArena` build input
- `scripts/generate-settings-reference.mjs` — Gameplay VFX module entry
- `labs/shared/sceneHub.js` — `vfxLab` + `vfxArena` hub entries
- Demo/reference app: `examples/vfx-arena/` (headless gates on
  `document.body.dataset`: `vfxArenaReady`, `vfxLiveGlow`, `vfxLivePuff`,
  `vfxDrawCalls`, `vfxSpawns`)
- **Designer: VFX Lab at `/vfx-lab/`** (`labs/vfx-lab/`) — the interactive
  authoring surface: category rail (weapon / magic / movement / shared),
  schema-driven panels generated from `VFX_SETTING_FIELD_SCHEMA`, preset
  picker, gameplay trigger bar (hotkeys 1–5, click-to-aim fireballs, `L`
  loop, `R` reseed), and Export → recipe JSON / paste-ready
  `createVfxSystem` code. Share links carry the recipe in `?vfxRecipe=`.
  Headless gates: `vfxLabReady`, `uiReady`, plus the arena stats above.

## Layout (categorized)

```
src/vfxgen/
  vfxSettings.js        DEFAULT_VFX_SETTINGS + groups + field schema
  vfxPresets.js         'default' + 'call_me_sensei' + registerVfxPreset()
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
    spriteShapes.js     TSL SDF sprite masks (zero textures)
    vfxRandom.js        seeded PRNG trio (internal, not re-exported)
  effects/              PURE builders: (settings, rng, options) → records
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
} from '@call-me-sensei/toonlab/vfxgen';

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

Categories: **weapon** (`slash`, `impact`) · **magic** (`fireball`) ·
**movement** (`footstep`, `landing`). `VFX_CATEGORIES` in vfxSettings.js is
the canonical map; new effects should join a category (or add one) and keep
their emission logic as a pure builder in `effects/`.

## Host usage (standalone — works in any Three.js scene)

```js
import { createVfxSystem } from '@call-me-sensei/toonlab/vfxgen';

const vfx = createVfxSystem({
  seed: 42,
  preset: 'call_me_sensei',
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
`shared.maxProjectiles`. Everything is `userData.waterExclude` — transient
flashes are not worth re-rendering the water passes.

## Deferred follow-ups (deliberate)

- **`createStylizedWorld({ vfx })` wiring** — mirror the ambientfx option:
  construct the system with the world's `heightAt` + follow target, call
  `vfx.setDistanceFog` from the world's height-fog params, tick it inside
  `world.update`. Waiting until a real consumer (mini-game / runtime spine)
  exists so the option surface is shaped by actual use.
- **Limb smears** — `createTrailRibbon` already supports any Object3D +
  anchor pair; a character-side helper that arms ribbons from bone names
  belongs in `src/character/` when procedural animation lands.
- **Catalog entries** — effects are runtime events, not spawnable assets;
  if the catalog ever grows an "effects" shelf, register preset spawns, not
  meshes.

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
