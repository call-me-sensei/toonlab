# Weather system

Weather is a separate, reusable world system rather than an environment
shader preset. The environment cluster still owns how a surface is shaded;
weather coordinates the temporary state that many systems must share:
clouds, fog, sun and ambient light, wind, precipitation, lightning, water
agitation, wetness, snow cover, and ice.

Open the standalone editor at `/weather-lab/`. It exposes the complete
schema, smooth preset transitions, a lightning test, local saves, and
portable JSON import/export.

## Composed-world usage

`createStylizedWorld` creates the weather coordinator by default with the
Call Me Sensei preset:

```js
const world = await createStylizedWorld({
  renderer,
  scene,
  camera,
  terrain: { root: terrainRoot, heightAt, size: 1000 },
  water: { level: 0 },
  followTarget: character,
  weather: { preset: 'partlyCloudy', seed: 42 },
});

// Smoothly change the whole world, not just the particle effect.
world.setWeather('thunderstorm', { duration: 5 });

// Keep calling the normal composed-world update.
world.update(delta);
```

The coordinator automatically adapts the world sky, sun rig, scene fog,
ambient lights, cloud shadows, grass, flowers, trees, fauna, ambient VFX,
and water when those systems are present. `followTarget` centers the GPU
precipitation window; otherwise it follows the camera.

Pass `weather: false` for an indoor or fully host-managed scene. Indoor and
outdoor are not separate weather implementations: a building, cave, or
vehicle can instead decide how much outside weather reaches its visible
surfaces and audio. Weather remains one source of truth across transitions
between spaces.

## Built-in conditions

There are 22 presets:

- Signature and fair: `call_me_sensei`, `clear`, `partlyCloudy`, `cloudy`,
  `overcast`, `windy`
- Visibility: `haze`, `mist`, `fog`
- Rain and storms: `drizzle`, `rain`, `heavyRain`, `thunderstorm`,
  `tropicalStorm`
- Winter: `snow`, `heavySnow`, `blizzard`, `sleet`, `freezingRain`, `hail`
- Arid: `dustStorm`, `sandstorm`

Precipitation is a single instanced draw with static seeded attributes and
GPU-looped motion. The renderer supports `rain`, `snow`, `sleet`, `hail`,
and `dust`; preset intensity changes the instance count without per-particle
CPU updates.

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

Weather multiplies the captured sky and sun baseline, so time of day remains
independent. For example, `rain` at noon and `rain` at sunset share the same
condition while retaining their different underlying sun colors and angles.

## Lightning, thunder, and surface events

Lightning timing is seeded. The visual flash stays inside the renderer;
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

