# Sky Shader

`@call-me-sensei/toonlab/sky` owns the portable appearance contract for the
visible background sky: the authored gradient/color-curve treatment, visible
horizon presentation, sun and moon disc/halo treatment, and stars.

Sky Shader does not own cloud composition, fog, current time, celestial
direction, directional-light energy or shadows, weather, exposure, the camera,
or source meshes/textures/atlases. The independently authored sky-dome cloud
stack belongs to `@call-me-sensei/toonlab/cloud`; current time and atmospheric
condition remain runtime axes. See
[Cloud shader](cloud-shader.md) and
[Lab responsibilities](lab-architecture.md).

The current package also retains `StylizedSky` as a compatibility renderer.
That older self-contained class includes procedural-cloud fields. Those fields
remain supported for existing consumers but are not part of the new Sky Shader
Lab document and must not be presented as Cloud Shader controls.

## P18 Sky Shader contract

The dedicated portable document uses:

```text
type: toonlab/sky-shader-preset
version: 1
```

`SKY_SHADER_SETTING_GROUPS` and `SKY_SHADER_FIELD_SCHEMA` expose 40 authored
fields in four groups:

| Group | Owns |
| --- | --- |
| Gradient | P18 atlas brightness, saturation, contrast, sampling offset/scale, master/region tints, horizon position/blend, and optional sunward horizon glow |
| Sun | Disc color/size/edge/intensity and broad/core halo appearance |
| Moon | Disc color/size/edge/intensity and halo appearance |
| Stars | Color, maximum night strength, deterministic pattern seed, density, scale, size, twinkle, and horizon fade |

The `call_me_sensei` preset is initialized from the accepted P18 sky graph.
Neutral gradient controls preserve the source atlas exactly. The clock
modulates sky tint/energy, selects the visible sun or moon, drives celestial
direction, and gates stars; the selected hour is never serialized.

```js
import {
  applySkyShaderSettings,
  createSkyShaderPresetDocument,
  createSkyShaderSettings,
  serializeSkyShaderPreset,
} from '@call-me-sensei/toonlab/sky';

const settings = createSkyShaderSettings({ preset: 'call_me_sensei' });
applySkyShaderSettings(authoredSkyTarget, settings);

const document = createSkyShaderPresetDocument('project_sky', {
  label: 'Project Sky',
  settings,
});
const json = serializeSkyShaderPreset(document);
```

An authored target exposes `applySkyShaderSettings(settings)`. Asset loading
and current world state remain host responsibilities.

## Legacy `StylizedSky` quickstart

```js
import { StylizedSky } from '@call-me-sensei/toonlab/sky';

const sky = new StylizedSky({
  style: 'call_me_sensei',
  quality: 'high', // deployment policy; not saved in the art preset
});
scene.add(sky);

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  sky.update(delta, camera); // animates clouds/stars and follows the camera
  renderer.render(scene, camera);
});

// Live runtime retuning does not rebuild the material.
sky.applySettings({ cloudCoverage: 0.55, starsStrength: 0.2 });

// A preset is a STYLE; a scenario is a moment. Every style resolves in
// every canonical scenario (clear_day, golden_hour, overcast, moonlit).
sky.setStyle('call_me_sensei', { scenario: 'golden_hour' });
sky.setScenario('moonlit'); // Call Me Sensei night; style identity is retained
```

`StylizedSky` centers its dome on the camera and pins it to the far plane, so it
does not intersect scene geometry. Add the same sky to scenes containing a
`WaterSurface`; water reflection passes then capture the active composed sky rather
than relying on a separate color approximation.

## Legacy settings and scope

`createSkySettings(options)` normalizes flat settings. The public
`SKY_SETTING_GROUPS` and `SKY_SETTING_FIELD_SCHEMA` describe the compatibility
`StylizedSky` renderer. The schema contains 46 portable legacy art fields; the
constructor-only dome radius is the single non-portable field. New editors use
the separate `SKY_SHADER_*` schema above.

| Group | Owns |
|---|---|
| Gradient | Zenith, horizon, and below-horizon colors; zenith/ground curve shape; horizon-band width, sun focus, and scattering strength. |
| Sun | Baseline disc direction and color; size, edge softness, intensity; broad/core glow shape; dense-cloud occlusion. |
| Clouds (legacy compatibility fields) | Self-contained procedural-noise clouds for `StylizedSky` consumers. These are not the P18 cloud-shell profile and are not used by Cloud Shader Lab. New authored cloud-dome work uses `@call-me-sensei/toonlab/cloud`. |
| Stars | Strength, color, deterministic seed, density, pattern scale, glint size, twinkle depth/speed, and horizon fade. |

The runtime constructor still accepts `radius` for compatibility. Because the
dome is centered on the camera and pinned to the far plane, changing that
geometry radius does not change the rendered look. Sky Lab therefore does not
surface it, and portable Sky preset documents do not serialize it.

Sky settings do not own the current clock, directional-light intensity or
shadow policy, precipitation, weather transition, fog volume, exposure, or
camera. Lighting and Weather systems remain authoritative and may modulate the
active sky at runtime. Independent owners use ordered layers rather than
writing the same settings object:

```js
import { SKY_SCENE_OVERRIDE_PRIORITIES } from '@call-me-sensei/toonlab/sky';

const lightingLayer = Symbol('lighting');
const weatherLayer = Symbol('weather');

sky.setSceneOverrideLayer(lightingLayer, {
  sunDirection: lightingState.sunDirection,
  zenithColor: lightingState.zenithColor,
}, { priority: SKY_SCENE_OVERRIDE_PRIORITIES.lighting });

// A resolver receives the result of lower-priority layers. Rain therefore
// darkens the current time-of-day instead of replacing it with a stale color.
sky.setSceneOverrideLayer(weatherLayer, (base) => ({
  cloudCoverage: weatherState.atmosphere.cloudCoverage,
  zenithColor: base.zenithColor.map((channel) => channel * weatherSkyScale),
}), { priority: SKY_SCENE_OVERRIDE_PRIORITIES.weather });

sky.clearSceneOverrideLayer(weatherLayer); // Lighting remains active
```

Layers compose in ascending priority: Lighting (100), Weather (200), then the
manual scene layer (300). `applySettings()` edits the authored baseline and
recomposes every active resolver; `setPreset(name, overrides)` replaces that
baseline. `sky.settings` is always authored data, while
`sky.renderedSettings`, `sky.sceneOverrides`, and `sky.sceneOverrideLayers`
expose the effective runtime state.

`setStyle(name, overrides)` is the preferred identity-axis API,
`setScenario(name, overrides)` changes only the moment, and
`setPreset(name, overrides)` remains the style compatibility alias.

`setSceneOverrides()` is the convenience manual layer and
`clearSceneOverrides()` removes only that layer. Named owners must call
`clearSceneOverrideLayer(id)` so they cannot erase each other;
`clearAllSceneOverrideLayers()` is reserved for a host that explicitly owns
the complete teardown. `LightingSystem.attachWorld(world)` and
`WeatherSystem` use private layers and release only their own state.

The visible dome clouds and the world-projected cloud-shadow field are related
weather signals, not the same procedural texture: the dome is angular and the
shadow field is spatial over terrain, water, and vegetation. Weather coordinates
coverage, wind, and intensity policy; games that require exact cloud-to-shadow
registration should supply a shared host cloud-field adapter.

## Deployment quality

Sky quality is runtime policy, not art direction. `quality: 'low' | 'medium' |
'high'` compiles two, three, or four FBM octaves respectively for each cloud
sample. The graph is compile-time-unrolled, so `sky.setQuality(tier)` rebuilds
only the Sky material while preserving authored settings, active scene layers,
and animation time. Custom policies may pass `{ cloudOctaves: 1..5 }`.

`SKY_QUALITY_TIERS`, `SKY_QUALITY_OPTIONS`, and `resolveSkyQuality()` are public.
Quality is a preview control in Sky Lab and is deliberately absent from
portable Sky preset documents.

## Styles, scenarios, and portable documents

A sky preset is a **style** — an identity (palette bias, cloud character,
glow personality) — never a single moment. The world-state axis is the
**scenario**: `SKY_SCENARIOS` defines the canonical set (`clear_day`,
`golden_hour`, `overcast`, `moonlit`; `getSkyScenarioOptions()` lists them)
and every style resolves in every scenario, the same way a lighting style's
`dayCycle` covers every hour:

```js
createSkySettings({ style: 'call_me_sensei', scenario: 'moonlit' });
```

Built-in styles are `default` and `call_me_sensei`; `getSkyPresetOptions()`
lists them plus any project registrations, with per-scenario coverage
(`'authored'` vs `'inherited'`). A style authors variants under `scenarios`;
scenarios it does not author inherit the canonical rendition (the Default
style's variant) layered over the style base, so single-look registrations
stay valid. The historical flat preset ids (`clear_day`, `golden_hour`,
`overcast`, `moonlit`) resolve through `SKY_PRESET_ALIASES` as the Default
style at that scenario, byte-identical to the presets they replaced.

```js
import {
  createSkyPresetDocument,
  createSkySettings,
  parseSkyPresetDocument,
  registerSkyPreset,
  registerSerializedSkyPreset,
  serializeSkyPreset,
} from '@call-me-sensei/toonlab/sky';

registerSkyPreset('violet_twilight', {
  label: 'Violet Twilight',
  // Style base: the identity every scenario shares.
  settings: {
    zenithColor: [0.12, 0.08, 0.32],
    horizonColor: [0.88, 0.38, 0.5],
    starsStrength: 0.35,
  },
  // Optional per-scenario variants layered over the base; unauthored
  // scenarios inherit the canonical rendition automatically.
  scenarios: {
    moonlit: { starsStrength: 1.2, zenithColor: [0.05, 0.03, 0.18] },
  },
});

const document = createSkyPresetDocument('violet_twilight', {
  label: 'Violet Twilight',
  settings: createSkySettings('violet_twilight'),
});
const json = serializeSkyPreset(document);
const result = parseSkyPresetDocument(json);
if (result.ok) registerSerializedSkyPreset(json, { overwrite: true });
```

Documents use `{ type: 'toonlab/sky-preset', version, id, label,
description, settings, scenarios? }` (schema v2; v1 single-look documents
stay valid and inherit unauthored scenarios). Use `validateSkyPresetDocument`
when a parsed object is already available. `settings` contains complete
normalized appearance values and each `scenarios` entry a normalized partial,
so documents remain portable if a named base preset changes later.

## Low-level material API

Applications that own their dome mesh can use the same production material:

```js
import {
  applySkySettingsToMaterial,
  createSkyMaterial,
} from '@call-me-sensei/toonlab/sky';

const material = createSkyMaterial({ style: 'call_me_sensei', scenario: 'moonlit' });
applySkySettingsToMaterial(material, { starsStrength: 1.2 });
applySkySettingsToMaterial(material, { scenario: 'clear_day' }); // full reset
```

`createSkyMaterial` returns the TSL node material used by `StylizedSky`.
`applySkySettingsToMaterial` updates the shared uniform contract without
replacing the material.

## Sky Lab

Run `/sky-lab/` in the repository or `/labs/sky` on ToonLab Pro. The lab uses
the accepted P18 sky dome, atlas, and comparison clouds. It supports Sky Shader
style selection, undo/redo, local saves, JSON import/export, WebGPU/WebGL
comparison, Sky Focus, Celestial Focus, original P18 framing, selectable cloud
context, the universal time-of-day control, and optional atmospheric-condition
stress tests.

All 40 Sky Shader controls are live. Exported documents contain only the four
Sky-owned groups. Cloud context, current condition, particles, current hour,
celestial direction, camera, source asset references, and preview framing are
excluded. `envTime=<hour>` and `skyView=sky|celestial|horizon` provide
deterministic review links.
