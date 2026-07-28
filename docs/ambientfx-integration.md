# Ambient VFX — integration snippets

The `src/ambientfx/` cluster is self-contained; these are the EXACT edits to
shared files that wire it into the library. Apply verbatim.

## 1. `src/index.js` — root export

Add after the `stylizedTerrain.js` line:

```js
export * from './ambientfx/index.js';
```

## 2. `package.json` — subpath export

Add to `"exports"` after `"./pathgen"`:

```json
"./ambientfx": "./src/ambientfx/index.js",
```

## 3. `vite.config.js` — package alias

Add `'ambientfx'` to the subpath array (order inside the array doesn't
matter; subpath entries must stay before the bare root entry, which the array
already guarantees):

```js
  ...['toon', 'environment', 'water', 'vegetation', 'sky', 'post', 'rockgen',
    'debrisgen', 'pathgen', 'texgen', 'character', 'loaders', 'debug', 'ambientfx'].map((subpath) => ({
    find: `@call-me-sensei/toonlab/${subpath}`,
    replacement: resolve(__dirname, `src/${subpath}/index.js`),
  })),
```

Once aliased, `examples/ambientfx-demo/main.js` line
`import { createAmbientFx } from '../../src/ambientfx/index.js';` can become
`import { createAmbientFx } from '@call-me-sensei/toonlab/ambientfx';`.

## 4. `src/stylizedWorld.js` — `createStylizedWorld({ ambientfx })` wiring

Import at the top:

```js
import { createAmbientFx } from './ambientfx/index.js';
```

Add an `ambientfx = false` option to the destructured signature. After the
grass/flowers blocks (so `heightFogParams`, `environmentBox`, `waterSurface`,
and `followTarget` are in scope), create the system — the important part is
that it RECEIVES the world's wind, height-fog, sun, and time-of-day instead
of inventing its own:

```js
  // Ambient atmosphere: petals/leaves/fireflies/pollen/mist over one GPU
  // particle backbone, in a follow window like the grass.
  let ambientFx = null;
  if (ambientfx) {
    const fxOptions = cleanObject(ambientfx);
    ambientFx = createAmbientFx({
      followTarget,
      heightAt,
      seed: Number(fxOptions.seed) || 1,
      waterLevel: waterSurface ? waterLevel : null,
      ...fxOptions,
    });
    // One wind for the whole world: reuse the exact grass wind settings.
    const grassWind = grassField?.settings ?? {};
    ambientFx.setWind({
      windDirection: grassWind.windDirection,
      windSpeed: grassWind.windSpeed,
      windStrength: grassWind.windStrength,
    });
    // Same height-fog layer terrain/water/forest already share.
    ambientFx.setDistanceFog({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      density: Number(heightFogParams.heightFogDensity) || 0.0016,
      falloff: Number(heightFogParams.heightFogFalloff) || 400,
      floorY: environmentBox.min.y,
    });
    if (sunDirection) ambientFx.setSun({ direction: sunDirection });
    scene.add(ambientFx.root);
  }
```

In the returned object add `ambientFx,` and in `world.update(delta)` add:

```js
    ambientFx?.update(delta, camera);
```

In `dispose()` add `ambientFx?.dispose();` and include `ambientFx?.root` in
the parent-removal list.

Time of day: hosts that drive `applyEnvironmentTimeOfDay(state, ...)` should
also call `world.ambientFx?.setTimeOfDay(state.hour)` in the same place (or
pass `ambientfx: { timeOfDay: () => clock.hour }` and never think about it) —
fireflies/pollen/mist gates follow that one canonical hour.

Bloom sources (petals from flowering canopies, leaves from autumn ones) are
host-registered because only the host knows which recipes flower:

```js
world.ambientFx?.addBloomSources(
  floweringTreePlacements.map((p) => ({
    color: [1.0, 0.66, 0.8],        // the recipe's bloom color
    effect: 'petals',                // or 'leaves' for autumn canopies
    radius: treeSize * 0.85,
    x: p.x, y: p.y + treeSize * 1.6, z: p.z,
  })),
);
```

Water note: the mist mesh carries `userData.waterExclude` itself; fireflies
and petals deliberately stay in the water passes so they reflect. Verify the
firefly reflection reads once wired into a world with water (the standalone
demo has no water surface).

## 5. `scripts/generate-settings-reference.mjs` — MODULES entry

Add to the `MODULES` array (after the Paths entry):

```js
  {
    title: 'Ambient VFX',
    subpath: 'toonlab/ambientfx',
    module: '/src/ambientfx/ambientFxSettings.js',
    groups: 'AMBIENTFX_SETTING_GROUPS',
    schema: 'AMBIENTFX_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per group: `createAmbientFx({ settings: { fireflies: { blinkSpeed: 0.8 } } })`. Effect entries in `effects` override their group; `density` there is a multiplier.',
  },
```

## 6. `AGENTS.md` — subpath list line

In the "Subpath imports" paragraph, add `/ambientfx` to the list, e.g.:

```
`/toon` `/environment` `/water` `/vegetation` (incl. scatter helpers +
`StylizedForest`) `/sky` `/post` `/character` `/loaders` `/rockgen`
`/debrisgen` `/pathgen` `/ambientfx` (petals/leaves/fireflies/pollen/mist —
one particle backbone, 3 draw calls, follow-window like grass) `/debug`; ...
```

## 7. `examples/outdoor-world/main.js` — `?nofx` perf toggle sketch

With the world wiring from §4 the example only needs the toggle plus the
per-effect URL knobs (matching the existing `?nograss`/`?notrees` idiom):

```js
    // Ambient atmosphere (?nofx=1 disables; ?fireflies=2 &petals=0 etc.
    // scale/kill individual effects for perf triage).
    ambientfx: params.has('nofx') ? false : {
      effects: Object.fromEntries(['petals', 'leaves', 'fireflies', 'pollen', 'mist']
        .map((id) => [id, params.has(id)
          ? (Number(params.get(id)) > 0 ? { density: Number(params.get(id)) } : false)
          : true])),
      seed: WORLD.seed,
      timeOfDay: () => 14, // swap for the game clock when one exists
    },
```

…passed inside the existing `createStylizedWorld({ ... })` options object.
Update the `#hint` copy to mention `?nofx`.
