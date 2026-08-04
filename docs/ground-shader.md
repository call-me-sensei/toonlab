# Ground shader

The 0.4.10 Ground Shader is a first-party terrain material for splat-weighted
grass, dirt, rock, and sand. It provides slope rock takeover, triplanar cliff
detail, shoreline sand and wetness, weather response, HDR sun/shade treatment,
distance recession, and a flat-albedo variant for grass ground adoption.

## Safe construction

```js
import {
  createGroundShaderMesh,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';

const ground = createGroundShaderMesh({
  geometry,
  field, // { splat: Uint8Array RGBA, splatW, splatD }
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

`createGroundShaderMesh()` defaults to casting and receiving shadows, writing
the shared environment ground field, and disabling frustum culling that would
be unsafe with displaced/custom bounds. Use `createGroundShaderMaterial()` only
when the host deliberately owns those mesh policies.

The Call Me Sensei preset exposes `lighting.sunIntensity` (`1.18`) so sunlit
terrain retains HDR headroom before tone mapping. It also keeps a strong
away-facing cliff shadow, cool shadow tint, and procedural triplanar rock
detail when optional authored maps are absent.

## Ground-field adoption

Create the environment ground-field pass only after ground writers exist.
After its first update, require `pass.writerCount > 0` and `pass.ready`. Call
`pass.invalidate()` when splat data, vertex colors, or textures repaint without a
transform change.

The ground-field color target contains the same splat/detail/weather albedo as
the visible ground but deliberately excludes view-dependent sun, sky, rim, and
specular response. Grass and rock-cap consumers light that color themselves;
publishing the already-lit ground color would double-light them.

## Release checks

Inspect gameplay, grazing, cliff-face, shoreline, and flyover cameras. Reject
missing cast shadows, self-shadow acne, flat untextured cliff gaps, a grass-to-
ground color jump, or a visible water/ground seam. Optional maps improve hero
terrain, but the package fallback must remain visibly detailed and never be a
flat color.
