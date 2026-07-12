# Water

A modern anime-style stylized, interactive water system. Fully procedural — no
texture assets — with the whole wave spectrum mirrored on the CPU so physics
and rendering always agree.

Water materials and simulation passes are TSL-only. They run on native WebGPU
by default and on the TSL WebGL2 fallback with `?renderer=webgl`.

## Quickstart

```js
import { WaterSurface } from '@call-me-sensei/toonlab/water';
import { StylizedSky } from '@call-me-sensei/toonlab/sky';

const water = new WaterSurface({
  width: 200, depth: 200, preset: 'lake',
  // Optional terrain sampler enabling surf mechanics: waves shoal, break,
  // and wash a swash film up the beach. breakerAmount > 0 adds plunging
  // breaker shells that ride each set wave to the break line.
  bedHeight: (x, z) => terrainHeightAt(x, z),
});
water.position.y = 0.4;
scene.add(water);

const sky = new StylizedSky(); // shows up in the water's reflections
scene.add(sky);

water.addInteractor(characterObject3D, { radius: 0.35 });
water.setFollowTarget(characterObject3D); // ripple window follows across big water

// per frame, before renderer.render(scene, camera):
water.update(renderer, scene, camera, delta);
sky.update(delta, camera);

// interactions & physics
water.splash({ x, y, z }, { strength: 1.2 });
water.addRipple({ x, z }, { radius: 0.3, strength: 0.5 });
const surfaceY = water.getHeightAt(x, z);   // buoyancy — includes swell + breakers
const flow = water.getFlowAt(x, z);         // surge velocity (breaker whitewater)
```

(Inside this repo the labs import from `../../src/water/...`.)

Constraints: the surface must stay axis-aligned (translation only), and
depth-based effects assume a perspective camera. `WaterScenePasses` renders
a color+depth grab pass and a planar reflection pass per frame; exclude
objects with `userData.waterExclude` (both passes) or
`userData.waterReflectionExclude` (reflection only).

## Settings, presets, tones

Water settings are flat (`createWaterSettings({ preset: 'ocean',
waveIntensity: 0.6 })`); all 72 fields across 7 groups (waves, surface,
foam, lighting, ripples, splashes, quality) are in the
[settings reference](settings-reference.md). Highlights:

- **`waveIntensity`** — one dial scales the whole Gerstner spectrum from
  glassy mirror to storm swell. Components are slope-limited, so big dials
  stretch to long wavelengths instead of spiking.
- **Wave sets** — `waveSetPeriod`/`waveSetStrength` make big waves arrive in
  groups with lulls between, marching at group velocity.
- **Body color** — three-stop absorption (`shallowColor → midColor →
  deepColor`), separate from wave motion. `colorTone` picks a named palette
  from `WATER_COLOR_TONES`: `classic`, `anime`, `teal`, `caribbean`,
  `lagoon`, `deepOcean`.
- **Shore** — `shoalingDepth`, `shorelineWaves`, `shorelineRunup` tune surf;
  `breakerEnabled/breakerAmount/breakerCurl/breakerScale/breakerPeel`
  control the plunging-breaker shells.

Built-in presets (`WATER_PRESET_NAMES`): `mirror`, `calm`, `lake`, `river`,
`coast`, `ocean`, `storm` — plus `call_me_sensei`, the studio-managed
signature preset (curated and updated over releases). Apply at construction
(`preset:`) or live with `water.setPreset(name, overrides)` /
`water.applySettings(options)`.

### Registering and sharing presets

```js
import {
  registerWaterPreset,
  serializeWaterPreset,
  parseWaterPresetDocument,
  registerSerializedWaterPreset,
} from '@call-me-sensei/toonlab/water';

registerWaterPreset('harbor', { waveIntensity: 0.25, colorTone: 'teal' });

// Versioned JSON document ('toonlab/water-preset'), same pattern as toon presets:
const json = serializeWaterPreset('harbor', { label: 'Harbor' });
const result = parseWaterPresetDocument(json);
if (result.ok) registerWaterPreset(result.value.id, result.value, { overwrite: true });
// or in one step: registerSerializedWaterPreset(json, { overwrite: true });
```

`getWaterPresetOptions()` lists built-ins plus registrations (for HUDs);
`validateWaterPresetDocument` / `createWaterPresetDocument` /
`sanitizeWaterPresetSettings` round out the document API.

## Quality tiers

`quality: 'low' | 'medium' | 'high'` gates the most expensive fragment
features (`WATER_QUALITY_TIERS`):

| Tier | Caustics/sparkles | Detail octaves | Foam octaves |
|---|---|---|---|
| `low` | off | 2 | 2 |
| `medium` | caustics + sparkles | 3 | 3 |
| `high` | + chromatic caustics | 4 | 3 |

Custom tiers are a plain object:

```js
new WaterSurface({ quality: { qualityLevel: 'high', detailOctaves: 5, foamOctaves: 4 } });
```

`resolveWaterQualityDefines(quality)` is the resolver if you build materials
directly (`createWaterMaterial`).

## The systems

`WaterSurface` orchestrates these modules (all exported from
`@call-me-sensei/toonlab/water` for standalone use):

- **`WaterRippleSimulation`** — GPU ping-pong heightfield with velocity,
  foam energy, absorbing borders, and a texel-exact moving window that
  follows a target across large surfaces.
- **`WaterSplashSystem`** — GPU-ballistic droplet points, procedural spray
  crown, expanding foam rings; all in-shader, no sprite atlas.
- **`WaterBreakerSystem`** — dedicated curl-shell geometry swept along the
  break line: shells swell out of the ambient sea, pitch a plunging lip,
  peel alongshore, and decay into a whitewater bore. Physical: mirrored on
  the CPU (`sampleAt`) so `getHeightAt` rides objects over the passing face
  and `getFlowAt` surges them shoreward. `breakerEnabled: false` removes the
  whole system for perf A/B.
- **`WaterInteractionManager`** (via `water.addInteractor`) — objects
  entering fast splash automatically, submerged movement leaves wakes with
  bow spray, exits splash lighter. Interactors take a radius plus a height
  (optionally a function for pose-dependent bodies).
- **`WaterRain`** — GPU-looping rain streaks to pair with ripple dimples.
- **`WaterKelpField`** — instanced kelp blades swaying with the flow.
- **Underwater view** — the surface renders a stylized Snell-window
  underside when the camera dips below the waterline.

Scene shadowing and cloud shadows: the surface darkens under cast shadows
(`sceneShadowStrength`) and shares the global cloud-shadow field
(`water.setCloudShadow({ strength, coverage, scale, velocity })`) with
grass, trees, and the environment shader.

## CPU/GPU spectrum mirror

`buildGerstnerWaves(settings)` builds the 8-component Gerstner spectrum that
both the vertex shader and the CPU sampler consume;
`sampleGerstnerHeight(waves, x, z, time)` (wrapped by
`water.getHeightAt(x, z)`) evaluates the exact same math for buoyancy,
swimming, and interaction tests. The spectrum constants (wavelength falloff,
slope limit, gravity) are deliberately not settings because the two sides
must stay in lockstep — see
[shader-constants.md](shader-constants.md#water) for the full list and
where each lives.

## Debug views

`?waterDebug=<mode>` in the labs or `water.setDebugMode(mode)`:

```text
depth | foam | normal | ripple | reflection | caustics | specular | fresnel | crest
```
