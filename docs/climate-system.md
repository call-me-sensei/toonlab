# Atmospheric condition system

The preferred package is
`@call-me-sensei/toonlab/atmospheric-condition`. The historical
`@call-me-sensei/toonlab/climate` entry remains a compatibility alias while
Climate, Seasons & Time keeps its separate responsibility for long-running
seasonal and timeline orchestration. The portable atmospheric-condition
documents and director do not import from or mutate the legacy weather
coordinator. The optional shared preview composes independent renderers for
the world effects that consume a condition frame.

The fifteen transferred profiles are the immutable-membership
`call_me_sensei` condition set. They are world-state recipes, not a shader
style and not a collection of generated cloud/fog assets.

The implementation is grounded in two checked sources:

- Direct asset and reflection metadata from the licensed reference project.
- The [external authored-system documentation](https://docs.google.com/document/d/147wCDvZg6-9jZNyqSxX-I_HQkE2tGINZIhyjc2QHirY/edit?tab=t.0).

The source audit found 15 condition assets with 48 non-name fields each, four
cyclic day-phase color anchors, a 14-entry dynamic sequence, and fixed
coordinator limits for emissions, surface accumulation, electrical pulses,
flow, audio, and update intervals. The local metadata verifier compares all
720 profile values before parity captures are accepted.

## Basic use

```js
import {
  createAtmosphericConditionDirector,
  getAtmosphericConditionOptions,
} from '@call-me-sensei/toonlab/atmospheric-condition';

const condition = createAtmosphericConditionDirector({
  profile: 'softDrizzle',
  dayPhase: 0.25,
  sink: (frame) => sceneAtmosphere.apply(frame),
});

condition.setProfile('steadyShower', { duration: 20 });
condition.update(deltaSeconds);
```

Use `mode: 'sequence'` to run the extracted 14-entry progression. A seed makes
all randomized hold durations repeatable. Large update steps consume every
crossed hold and blend so recorded, server-driven, and background-tab playback
remain deterministic.

## Repository-only lab preview

The checked-out ToonLab repository contains an authored comparison renderer
and native baseline matrix for the Atmospheric Condition Lab. That renderer,
the lab application, and every file under `public/climate` are development
and review infrastructure. They are not exported by or included in the npm
package.

The npm runtime surface is the portable condition document, profile resolver,
sequence, and director. Applications feed the director's generated frame into
their own Sky, Weather, Lighting, Water, audio, or project-specific adapters.
Installing the runtime never requires copying a ToonLab model, texture,
baseline image, or lab directory.

### Conditions drive ToonLab-owned weather renderers

Rain, flake, ember, mist, wind, and electrical amounts remain part of a
condition because they describe current world state. Particle geometry,
motion, materials, collision response, and runtime budgets do not. The shared
preview therefore passes one condition frame to independent ToonLab renderers;
it does not paint precipitation into the atmosphere material or serialize
renderer topology into a condition document.

The initial rain field uses a 12 m-radius, 1 m-high camera-local cylinder
positioned 10 m forward and 8 m above the camera. Drops are velocity-aligned,
camera-facing, additive unlit sprites with 3–4 cm width, 50–80 cm length, and
30–40 m/s downward velocity. Drop collisions feed a separate short-lived
splash draw.

The remaining initial fields follow the same ownership rule:

- Flakes occupy a 20 m-radius, 6 m-deep camera-local volume. They have
  four-second lives, 6–12 cm authored scale, gravity, turbulent wind, camera
  fade, depth testing, and separate snow/ash shape treatment.
- Embers rise through their own 20 m-radius, 8 m-deep field with independent
  lifetime, size, tint, and turbulence.
- Local mist uses low-opacity 1–2 m depth-tested cards in a 24 m-radius field;
  it is not a fullscreen gradient.
- Wind streaks are long-lived world-space ribbons aligned to the current flow
  vector, with the condition supplying speed, visibility, and opacity.
- Electrical weather separates distant branches from broad cloud
  illumination and uses short authored pulses instead of a persistent
  screen-space zigzag.

WebGPU and TSL WebGL2 use the same TSL particle graphs. All fields occupy world
space, participate in depth occlusion, and disappear through the shared
Particles preview toggle. The overlay canvas remains only for the sky-owned
shooting-star cue.

The standalone `WeatherSystem`, Weather Lab, Sky Lab weather preview, and the
Rock/Tree environment previews consume these same field implementations
through `WeatherFieldRenderer`. Its weather-state adapter maps the broader
rain, snow, sleet, hail, dust, fog, wind, and storm registry onto the shared
drop, flake/pellet/particulate, mist, flow, splash, and electrical topology.

### Authored baseline and variations

The renderer starts from a full authored comparison scene, including its exact
mesh hierarchy, transforms, projection camera, ground, sky dome, cloud shell,
sun, and moon.

The renderer has two deliberately different review modes:

- `authoredBaselines: true` shows the immutable native-renderer capture at
  exact Dawn/Day/Sunset/Night anchors. This is the only mode that makes a
  source-renderer image-parity claim.
- `authoredBaselines: false` runs the live diagnostic renderer. It includes
  neutral near/middle/far fixtures and preserves enough ceiling structure to
  keep fully overcast conditions authorable. It is an interactive ToonLab
  reconstruction, not a pixel-parity claim.

The supplied sky-overview scene contains no nearby subject. Conditions with
full overcast and volumetric-fog mixing, notably Steady Shower and Deep
Downpour, therefore reduce their native reference frames to nearly uniform
blue-gray fields. Atmospheric Condition Lab exposes those frames honestly
under **Native**, but defaults to **Live** because the diagnostic depth stage
is materially more useful for authoring.

The production baseline is a complete 15-profile × 4-time matrix. Every one
of the 60 cells is captured only after the reflected coordinator retains the
selected condition, resolves the requested day phase, matches its live
condition values to the extracted asset metadata, warms the authored render
state, and emits a fresh 1280 × 720 sRGB frame. The neutral published manifest
records the phase, runtime verification state, and SHA-256 hash for every
cell.

At an exact Day, Sunset, Night, or Sunrise anchor in native-reference mode, the
matching immutable frame is loaded on demand and sampled on the transferred
sky dome. The frame owns the full acceptance image at that anchor, so the
dynamic diagnostic stage, ground, cloud shell, sun, and moon are suppressed
until the frame changes. This makes the first-copy baseline independent of an
approximate material reconstruction while retaining the transferred scene and
camera as the rendering host.

Intermediate day phases and profile blends use the separate ToonLab climate
shader. That path keeps the ground, clouds, sun, moon, atmosphere, fog, mist,
rain, flakes, embers, wind streaks, and electrical events live. Variations
must not modify or replace the immutable 60-cell baseline matrix; they are
evaluated only after their two surrounding authored anchors have passed.

## Runtime frame

Each update publishes one renderer-neutral frame:

- `air`, `ceiling`, and `fog` describe atmosphere and visibility.
- `precipitation` contains normalized amounts and exact emission targets.
- `light` and the sampled day-phase tint drive scene lighting.
- `electric` and `triggerElectricalPulse()` expose storm events.
- `flow` drives wind-responsive systems.
- `surface` supplies wetness and puddle targets plus accumulation rates.
- `audio` supplies normalized rain, thunder, and wind gains.

The comparison harness consumes this same frame. Native reference captures are
kept outside the published package and are only marked comparable after their
source metadata and capture state have been verified.
