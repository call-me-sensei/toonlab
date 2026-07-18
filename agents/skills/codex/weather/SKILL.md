---
name: weather
description: Help developers use ToonLab weather — 22 shared presets, smooth transitions, GPU-instanced rain/snow/sleet/hail/dust, lightning and thunder events, wind, and surface wetness/snow outputs.
---

# Weather

Use this skill when a developer wants weather: rain, snow, sleet, hail, or
dust precipitation, smooth condition transitions, lightning flashes with
distance-delayed thunder, wind that drives vegetation, fog/sky adaptation, or
normalized wetness/snow/ice values for surface response.

Public imports:
- `@call-me-sensei/toonlab/weather`

Read first:
- `docs/weather.md`

Developer guidance:
- Inside a ToonLab composed world, do not construct weather directly — pass
  `weather: { preset, seed }` to `createStylizedWorld` and call
  `world.setWeather('thunderstorm', { duration: 5 })`; the coordinator drives
  sky, sun, fog, vegetation, and water through their public adapters.
- Standalone, `createWeatherSystem({ renderer, scene, camera, followTarget,
  groundHeightAt, preset })` owns only precipitation and lightning; every
  other target (`sky`, `sunRig`, `water`, `grass`, `forest`) is optional and
  only adapted if provided. Do not pass non-ToonLab objects as targets unless
  they implement the same public methods (e.g. `applySettings`, `setWind`).
- Precipitation is one GPU-instanced draw with trajectories computed in the
  shader; control density through the preset/intensity, never by spawning
  extra systems.
- Use `weather.addEventListener('lightning', …)` / `onThunder` for gameplay
  reactions; the thunder delay already models distance.
- Surface response: consume the normalized wetness/snow/ice outputs
  (`onSurfaceChange`) instead of inferring state from the preset name.
- Presets are extensible via `registerWeatherPreset`; interpolate custom
  conditions with `interpolateWeatherSettings` rather than lerping raw fields
  in app code.

Verify:
- Run the consumer app, transition between a clear and a storm preset, and
  confirm precipitation follows the camera without visible respawn seams.
- Trigger or wait for lightning and confirm the thunder delay scales with
  distance.
