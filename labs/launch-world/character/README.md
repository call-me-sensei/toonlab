# Yua — launch character module

Owner: character materials / rigging / animation / grounding (§5).
Evidence: `launch-plan/review/captures/yua/` (frames + `evidence.json`).
Review rig: `/labs/launch-world/character/`.

**Scene owners import `yuaCharacter.js`. Do not construct the character yourself** — the
placement, the material-role bindings and the grounding correction all live here, and the
§11 wipe depends on there being exactly one load.

## Integration (garden scene)

```js
import { createYuaCharacter } from '../character/yuaCharacter.js';

const yua = await createYuaCharacter({
  heightAt: gardenHeight,   // your height field — she is grounded against it, per foot
  parent: scene,
  renderPasses,             // createCharacterRenderPasses result, if you run one
  renderer,
});
yua.placeAt({ bearing: 190, x: 0, z: 0 });   // compass bearing, NOT radians
yua.setLocomotion({ walk: 1 });

// per frame
yua.update(delta);
```

`bearing` is a compass bearing in degrees. Both launch scenes author with **north = −Z**, while
the plan text says "+Z is north"; `bearingToYaw` is the single place that conversion happens, so
pass the bearing from the plan and do not hand-roll a yaw.

## The §11 wipe — for the wipe owner

`createYuaCharacter` loads **once** and builds both material sets over the same meshes. Swap
between two `renderer.render` calls in the same frame:

```js
yua.setMaterialMode('toon');     renderPasses.update(); post.render();
yua.setMaterialMode('neutral');  renderer.setScissorTest(true); /* … */ post.render();
yua.setMaterialMode('toon');
```

One skeleton, one `AnimationMixer`, one set of geometry buffers, one camera, one light rig, one
exposure — §11's requirement holds by construction, because nothing between the two draws touches
any of them. The swap rebinds `mesh.material`, restores the matching `onBeforeRender`, toggles the
outline/fur children and refreshes the depth prepass binding.

This is backed by `materialModes: true` on `createCharacterRuntime`, added to `src/` for this
(D19-001, now FIXED). **`labs/launch-world/wipe/main.js` should move onto it**: its current
`toon: false` + `applyToonShader`-in-place approach is one-way and cannot swap back per frame.

## Two things that will bite you

- **`watch: false` on your bundle apply.** `createCharacterRuntime` labels its carrier
  `toonlab/character`, so a bundle applied with `watch: true` converts the already-converted
  character a *second* time: doubled outline hulls and the outerwear's alpha cutoff silently
  dropped from 0.5 to 0.35. See **D19-087**. If you need the watcher for the environment, tell the
  character owner — the workaround does not generalise.
- **Ground her through `placeAt`, never by setting `carrier.position`.** `fitModelForController`
  centres the carrier on the whole-body bounding box, which for Yua sits **96 mm behind her feet**
  (her ponytail is longer than her toes). `placeAt` measures the shoes, rotates that offset with
  her yaw, and re-grounds against the surface under *each* foot. See **D19-083**, **D19-084**.

## What it reports

`yua.groundReport()` returns per-foot `{ x, z, soleY, support, clearance }` — clearance positive
is floating, negative is penetrating, and both are §13 defects. Use it in your scene audit; on the
garden's stepping stones a body-origin check cannot detect either.
