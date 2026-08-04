---
name: rock-ground-shaders
description: Apply, configure, and verify ToonLab rock and ground shaders in outdoor scenes, including textures, close detail, HDR sun response, cast/receive shadows, ground-field adoption, shoreline wet bands, and Call Me Sensei defaults.
---

# Rock and ground shaders

Use this skill when terrain, cliffs, catalog rocks, beaches, or grass-ground
blending are being built or reviewed. These two systems are separate public
APIs and must share scene state deliberately.

## Rock assets and material application

Find rock geometry through ToonLab asset discovery. Feature-detect the surface:
ToonLab OSS provides local catalog tools such as `search_assets({ source:
'official' })`; ToonLab Pro provides the public gallery equivalent. Inspect
`dimensionsMeters`, taxonomy, geology, structural role, and delivery metadata
before download. Never render an asset merely to discover its size.

Apply the package shader to compatible rock meshes:

```js
import {
  applyRockShader,
  setRockShaderSceneState,
} from '@call-me-sensei/toonlab/rock-shader';

const report = applyRockShader(rockRoot, { preset: 'call_me_sensei' }, {
  textures: authoredRockMaps, // omit deliberately to use first-party generated maps
});
if (report.applied === 0) throw new Error('No rock mesh received the shader');
if (report.usedGeneratedTextures) {
  console.info('Using ToonLab first-party generated rock maps');
}
setRockShaderSceneState(rockRoot, { waterLevel });
```

`applyRockShader` sets `castShadow` and `receiveShadow` true by default.
Override them only for an explicit rendering reason. It reports whether
provided textures or first-party generated maps were used; never call the
fallback an authored catalog texture.

The Call Me Sensei preset includes a macro projection plus a metre-scale near
detail octave, HDR exposure, an indirect floor for down-facing overhangs, and
a water-level wet band. Tune `projection.nearDetailScale`,
`projection.nearDetailStrength`, `lighting.exposure`,
`lighting.ambientFloor`, and `shoreline.*` through the portable preset
instead of adding example-local material overrides. Camera-visible rock must
retain readable detail at close range, a lit/shade split, non-black overhangs,
and wet response where it meets water.

## Ground creation and shared scene state

Prefer the safety wrapper:

```js
import {
  createGroundShaderMesh,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';

const ground = createGroundShaderMesh({
  geometry,
  field,
  layers,
  settings: { preset: 'call_me_sensei' },
});
scene.add(ground);
setGroundShaderSceneState(ground, {
  sunColor,
  sunDirection,
  skyColor,
  waterLevel,
  wetness,
  snowCover,
});
```

The wrapper defaults `castShadow`, `receiveShadow`, and
`userData.groundFieldWrite` to true and disables unsafe frustum culling for
custom/displaced bounds. The Call Me Sensei ground preset exposes
`lighting.sunIntensity` for HDR sun-facing headroom and retains triplanar
rock detail when optional maps are absent. Optional authored albedo, normal,
and packed surface maps are still preferred for hero terrain and beaches.

When grass adopts ground color, create and update the environment ground-field
pass after writers exist. Assert `pass.writerCount > 0` and `pass.ready`
after the first update. Call `pass.invalidate()` whenever a writer repaints
without changing transform. The field publishes unlit surface albedo; grass,
rock caps, and other consumers apply their own lighting. Do not publish the
camera-lit ground color into the field.

## Lighting and shadow verification

A material flag is not visual proof. Enable the renderer shadow path, use a
directional light that casts shadows, fit its camera to the visible world, and
run the ToonLab environment sun-shadow pass on the node backend. Inspect:

- sun-facing and away-facing ground and rock;
- cast shadows from trees, rocks, characters, and the cliff mass;
- self-shadow acne and detached/peter-panning shadows;
- close rock detail and distant macro continuity;
- ground-field color adoption without double lighting;
- wet rock, beach, and shoreline continuity at the current water level.

Reject flat untextured walls, black overhangs, missing trunk/cliff shadows,
silent generated-map use, or a grass/ground color jump. Record the package
version, preset, texture source, scene-state wiring, shadow backend, and
inspection cameras in release evidence.

