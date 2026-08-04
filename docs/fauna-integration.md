# Fauna cluster — integration diffs

> **Historical repository integration record:** Fauna is already exported as
> `@call-me-sensei/toonlab/fauna` in 0.4.10. Do not reapply the package/index
> edits below. References to the repository world-composition helper are
> internal wiring notes, not a stable npm API.

The fauna cluster (`src/fauna/`) is self-contained; these are the EXACT
changes to shared files needed to publish it. Nothing else is required —
`examples/fauna-demo/` already runs today because it imports the cluster
relatively.

## 1. `package.json` — exports entry

Insert after the `"./pathgen"` line:

```json
    "./fauna": "./src/fauna/index.js",
```

## 2. `vite.config.js` — alias

Add `'fauna'` to the subpath array (order within the array is irrelevant;
subpaths must stay before the bare root entry, which the array already
guarantees):

```js
  ...['toon', 'environment', 'water', 'vegetation', 'sky', 'post', 'rockgen',
    'debrisgen', 'pathgen', 'texgen', 'character', 'loaders', 'debug', 'fauna'].map((subpath) => ({
```

Optionally add the demo to `build.rollupOptions.input`:

```js
        faunaDemo: resolve(__dirname, 'examples/fauna-demo/index.html'),
```

After the alias lands, switch the demo import in `examples/fauna-demo/main.js`
from the relative path to the public specifier:

```js
// before
import { createFauna } from '../../src/fauna/index.js';
// after
import { createFauna } from '@call-me-sensei/toonlab/fauna';
```

## 3. `src/index.js` — root export

Append:

```js
export * from './fauna/index.js';
```

(No name collisions: the cluster's exports are all `Fauna`/`fauna`-prefixed
except `createFauna`, `buildBird/Butterfly/Dragonfly/FishGeometry`,
`hashCombine` — none exist in the current root surface. `hashCombine` is
generic; if the root ever grows another, re-export the fauna one under an
alias instead.)

## 4. `src/stylizedWorld.js` — `createStylizedWorld({ fauna })` wiring sketch

Add `fauna = false` to the options object, then after the forest block
(where `heightFogParams` and `environmentBox` are in scope):

```js
import { createFauna } from './fauna/index.js';

// options: fauna = false,
let faunaSystem = null;
if (fauna) {
  const faunaOptions = cleanObject(fauna);
  faunaSystem = createFauna({
    bounds: { x: width / 2 - 10, z: depth / 2 - 10 },
    followTarget,
    heightAt,
    masks: { flowers: faunaOptions.flowerMask ?? masks?.vegetation ?? null },
    preset: faunaOptions.preset ?? worldPreset.fauna?.preset ?? null,
    seed: faunaOptions.seed ?? 1,
    settings: faunaOptions.settings ?? {},
    species: faunaOptions.species ?? {},
    waterLevel: earlyWaterLevel,
  });
  // Same height-fog layer terrain/water/forest get — birds that skip it
  // stay sharp saturated specks on hazed mountains.
  faunaSystem.setDistanceFog({
    color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
    density: Number(heightFogParams.heightFogDensity) || 0.0016,
    falloff: Number(heightFogParams.heightFogFalloff) || 400,
    floorY: environmentBox.min.y,
  });
  scene.add(faunaSystem.root);
}
```

In `applyCloudShadow`: add `faunaSystem?.setCloudShadow(field);`
In `update(delta)`: add `faunaSystem?.update(delta);`
In `dispose()`: add `faunaSystem?.dispose();`
In the returned object: add `fauna: faunaSystem,`.

## 5. `scripts/generate-settings-reference.mjs` — MODULES entry

```js
  {
    title: 'Fauna',
    subpath: 'toonlab/fauna',
    module: '/src/fauna/faunaSettings.js',
    groups: 'FAUNA_SETTING_GROUPS',
    schema: 'FAUNA_SETTING_FIELD_SCHEMA',
    note: 'Settings are nested per species group: `createFauna({ settings: { birds: { fleeRadius: 15 } } })`. Populations are passed separately: `createFauna({ species: { birds: 40, fish: 80 } })`.',
  },
```

## 6. `package.json` — scripts entry

```json
    "verify:fauna": "node scripts/verify-fauna.mjs",
```

## 7. `AGENTS.md`

In "Subpath imports", extend the list: add `` `/fauna` `` after
`` `/pathgen` ``, and append to the root-adds list: `createFauna`.

Add one budget line under "Quality rules" (or beside the grass/tree budget
bullet):

```
- Ambient fauna: `createFauna({ seed, heightAt, waterLevel, bounds, followTarget, species: { birds: 40, butterflies: 60, fish: 80 } })` —
  one InstancedMesh per species-variant, steering staggered to ≤ 1/4 of
  agents per frame, ≤ 1 ms CPU at defaults; birds cast NO shadows; fish get
  `waterReflectionExclude` (refraction is how they're seen — never
  `waterExclude`); airborne species get `waterGrabExclude`; everything joins
  height fog via `fauna.setDistanceFog(...)`. Register roosts with
  `fauna.addPerchPoints(points)`. URL-toggle populations per species when
  perf-triaging.
```

## 8. `examples/outdoor-world/main.js` — demo wiring with URL toggles

Import:

```js
import { createFauna } from '@call-me-sensei/toonlab/fauna';
```

After `createStylizedWorld(...)` resolves (so `world.masks` exists), before
the render loop:

```js
// ?birds=0&butterflies=0&fish=0 — per-species perf triage per AGENTS.md.
const faunaParams = new URLSearchParams(location.search);
const faunaCount = (key, fallback) => {
  const value = Number.parseInt(faunaParams.get(key) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};
const fauna = createFauna({
  bounds: WORLD.bounds,
  followTarget: characterRoot,
  heightAt,
  masks: { flowers: world.masks?.vegetation ?? null },
  seed: WORLD.seed,
  species: {
    birds: faunaCount('birds', 40),
    butterflies: faunaCount('butterflies', 60),
    dragonflies: faunaCount('dragonflies', 12),
    fish: faunaCount('fish', 80),
  },
  waterLevel: WORLD.waterLevel,
});
fauna.setDistanceFog({ color: [0.63, 0.8, 0.98], density: 0.0014, falloff: 400, floorY: -30 });
fauna.setCloudShadow({ strength: 0.3 });
scene.add(fauna.root);
```

In the frame loop: `fauna.update(delta);`
Once rocks are placed, register roosts: `fauna.addPerchPoints(rockTops)`
(any `[{ x, y, z }]`).
