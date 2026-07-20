---
name: weather
description: Help developers use ToonLab weather — 21 shared conditions rendered through an independent IP-wide style, smooth transitions, GPU-instanced rain/snow/sleet/hail/dust, lightning and thunder events, wind, and surface wetness/snow outputs.
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
  `weather: { preset, style, seed }` to `createStylizedWorld` and call
  `world.setWeather('thunderstorm', { duration: 5 })`; the coordinator drives
  sky, sun, fog, vegetation, and water through their public adapters.
- Standalone, `createWeatherSystem({ renderer, scene, camera, followTarget,
  groundHeightAt, preset, style })` owns only precipitation and lightning;
  `preset` selects the condition and `style` selects its IP-wide rendition;
  every
  other target (`sky`, `sunRig`, `water`, `grass`, `forest`) is optional and
  only adapted if provided. Do not pass non-ToonLab objects as targets unless
  they implement the same public methods (e.g. `applySettings`, `setWind`).
- Precipitation is one GPU-instanced draw with trajectories computed in the
  shader; control density through the condition/intensity, never by spawning
  extra systems.
- Use `weather.addEventListener('lightning', …)` / `onThunder` for gameplay
  reactions; the thunder delay already models distance.
- Surface response: consume the normalized wetness/snow/ice outputs
  (`onSurfaceChange`) instead of inferring state from the preset name.
- Conditions are extensible via `registerWeatherPreset`; styles are extensible
  via `registerWeatherStylePreset`. Interpolate custom conditions with
  `interpolateWeatherSettings` rather than lerping raw fields in app code.

Verify:
- Run the consumer app, transition between clear and storm conditions, and
  confirm the selected style persists while precipitation follows the camera
  without visible respawn seams.
- Trigger or wait for lightning and confirm the thunder delay scales with
  distance.
