# Weather system

> **Experimental composed-world workflow.** The Weather API is available for
> focused qualification, but coordinating it with Sky, Cloud, Lighting,
> Water, vegetation, terrain, and gameplay is not currently a recommended
> one-shot scene workflow. The host must integrate and art-direct every
> adapter explicitly. See [What ToonLab is ready for today](capability-status.md).

Weather is a separate, reusable world system rather than an environment
shader preset. The environment cluster still owns how a surface is shaded;
weather coordinates the temporary state that many systems must share:
clouds, fog, sun and ambient light, wind, precipitation, lightning, water
agitation, wetness, snow cover, and ice.

Sky Lab owns the reusable baseline sky appearance; Weather owns the current
condition and only modulates that baseline. Lighting remains authoritative for
the real directional light and shadow policy. See
[Lab responsibilities](lab-architecture.md).

Open the standalone editor at `/weather-lab/`. It exposes the complete
schema, smooth preset transitions, a lightning test, local saves, and
portable JSON import/export.

## Package usage in 0.4.10

ToonLab 0.4.10 does not export a full-world coordinator. Construct Weather
directly and provide only the stable adapters your host scene uses:

```js
import { createWeatherSystem } from '@call-me-sensei/toonlab/weather';

const weather = createWeatherSystem({
  renderer,
  scene,
  camera,
  followTarget: character,
  groundHeightAt: terrain.heightAt,
  preset: 'partlyCloudy',
  seed: 42,
  style: 'call_me_sensei',
  sky,
  sunRig,
  water,
  grass,
  forest,
});

weather.transitionTo('thunderstorm', { duration: 5 });

// Before the host renders:
weather.update(delta);
```

Weather adapts only the consumers passed to it. The visible fields follow the
render camera; `followTarget` supplies the local ground/impact center. Host
lighting remains authoritative, so connect `getSun`/`setSun` and surface
callbacks explicitly when the scene needs those responses.

For an indoor or fully host-managed scene, do not construct Weather. Indoor
and outdoor are not separate implementations: a building, cave, or vehicle
can decide how much outside weather reaches visible surfaces and audio.

## Styles and built-in conditions

Weather has two axes. **Conditions** are the world-state axis
(`getWeatherPresetOptions()`, 21 entries):

- Fair: `clear`, `partlyCloudy`, `cloudy`, `overcast`, `windy`
- Visibility: `haze`, `mist`, `fog`
- Rain and storms: `drizzle`, `rain`, `heavyRain`, `thunderstorm`,
  `tropicalStorm`
- Winter: `snow`, `heavySnow`, `blizzard`, `sleet`, `freezingRain`, `hail`
- Arid: `dustStorm`, `sandstorm`

**Styles** are the identity axis (`getWeatherStyleOptions()`): `default` and
`call_me_sensei`, the studio-managed signature style. A style is rendition
character (house wind, cloud personality, sky vividness) applied UNDER every
condition — the condition always keeps the meteorological keys it authors:

```js
resolveWeatherPreset('thunderstorm', { style: 'call_me_sensei' });
createWeatherSystem({ preset: 'rain', style: 'call_me_sensei', ... });
weather.setStyle('call_me_sensei'); // re-renders the current condition
```

The historical `call_me_sensei` "condition" id keeps resolving byte-stable —
it now names the style's ambient base — and remains the default when no
preset is given.

`WeatherSystem` renders through `WeatherFieldRenderer`, the same field stack
used by Atmospheric Condition Lab:

- rain is a velocity-aligned camera-local drop field with a separate
  collision-splash draw;
- snow uses the turbulent flake volume;
- sleet combines rain streaks with ice pellets;
- hail uses the fast pellet topology;
- dust uses normal-blended airborne particulate so dark particles remain
  visible;
- fog conditions can add depth-tested local mist, high wind adds world-space
  flow streaks, and storms use separate lightning branches and cloud flashes.

The fields use static seeded attributes and GPU-looped TSL motion, with
WebGPU and TSL WebGL2 sharing the same material graphs. The old
`WeatherPrecipitation` single-mesh emitter remains only as a compatibility
low-level export; no first-party system or lab constructs it.

## Standalone coordinator and lab adapters

Other labs can surface the same weather registry without constructing a
complete world:

```js
import {
  createWeatherSystem,
  getWeatherPresetOptions,
} from '@call-me-sensei/toonlab/weather';

const weather = createWeatherSystem({
  renderer,
  scene,
  camera,
  followTarget: player,
  groundHeightAt: terrain.heightAt,
  preset: 'snow',
  sky,
  sunRig,
  water,
  grass,
  flowers,
  forest,
  fauna,
  ambientFx,
  // Optional whole-world scene-light adapter supplied by your host. This
  // keeps custom vegetation inputs aligned when Lighting is absent.
  getSun: readSceneSun,
  setSun: applySceneSun,
  // Needed only when an opaque host adapter cannot be inspected. These are
  // the exact values restored by dispose().
  cloudShadowBaseline: currentCloudShadow,
  surfaceBaseline: currentSurfaceState,
  onSurfaceChange: ({ wetness, snowCover, ice }) => {
    terrainMaterial.uniforms.wetness.value = wetness;
    terrainMaterial.uniforms.snowCover.value = snowCover;
    terrainMaterial.uniforms.ice.value = ice;
  },
});

for (const option of getWeatherPresetOptions()) {
  addPresetToLab(option.id, option.label, option.description);
}

weather.transitionTo('hail', { duration: 3 });
weather.update(delta);
```

Consumers are optional. A Tree Lab can provide only `forest` and `sky`; a
Water Lab can provide only `water`; an indoor material lab can consume only
the normalized surface outputs. This keeps each lab focused while using the
same preset document and transition semantics.

`getSun` / `setSun` form the preferred standalone world-light bridge. The
state is `{ direction, color, sky }`; Weather captures the getter once, applies
temporary tint/darkening through the setter, and restores that baseline on
teardown. `setCloudShadow` and `onSurfaceChange` are write-only adapters, so
pass `cloudShadowBaseline` / `surfaceBaseline` when their current values are
not otherwise inspectable. In 0.4.10 the host wires these responsibilities.

## Settings groups

`WEATHER_SETTING_FIELD_SCHEMA` is the canonical UI schema. Settings are
grouped into:

- `atmosphere`: cloud coverage/speed/shadows, sky and sun multipliers,
  ambient light, fog color and range
- `wind`: direction, strength, speed, and vegetation gust controls
- `precipitation`: type, intensity, appearance, follow volume, speed, and
  particle budget
- `lightning`: enabled state, strike rate, color, intensity, and duration
- `surface`: water wave/ripple response plus host-facing wetness, snow, and
  ice targets

Weather multiplies the current lower-priority Lighting result, so time of day
remains independent. For example, `rain` at noon and `rain` at sunset share the
same condition while retaining their different underlying sun colors and
angles. On `StylizedSky`, Weather owns a private priority-200 resolver layer;
on `WaterSurface`, it owns a private layer that adds `waterWaveBoost` over the
authored wave baseline. `sky.settings` and `water.settings` therefore remain
portable, while their `renderedSettings` expose the current composition.

`weather.dispose()` clears only Weather-owned Sky and Water layers, resets
Lighting modulation, and restores the captured sun, cloud-shadow, vegetation
wind, wetness/snow, Ambient FX wind, and host surface baselines. Disposed
coordinators ignore later refresh/update calls, so teardown cannot resurrect
stale world state. The visible dome-cloud pattern
and projected cloud-shadow field are intentionally separate angular/spatial
procedures; Weather coordinates their condition and motion policy but does not
claim texel-identical registration.

## Lightning, thunder, and surface events

Lightning timing is seeded. Branch geometry and the short cloud-flash pulse
stay inside the renderer;
thunder is emitted as a delayed host event based on strike distance so a
game can choose and spatialize its own audio:

```js
weather.addEventListener('lightning', ({ position, distance, thunderDelay }) => {
  spawnBolt(position);
});

weather.addEventListener('thunder', ({ distance }) => {
  audio.playThunder({ distance });
});
```

`weather.root.userData.weatherSurface` always contains the current
`{ wetness, snowCover, ice, waterWaveBoost, waterRippleRate }` state.
`onSurfaceChange` is the preferred adapter for custom terrain, prop,
character, or post-processing materials.

## Custom presets

Use `createWeatherPresetDocument`, `parseWeatherPresetDocument`, and
`serializeWeatherPresetDocument` for portable documents. Register an
imported document with `registerWeatherPresetDocument(document)`; all labs
that read `getWeatherPresetOptions()` can then expose it without maintaining
a second preset list.
