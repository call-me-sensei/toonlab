# Vegetation

Procedural stylized vegetation from
`@call-me-sensei/toonlab/vegetation`. Geometry and shading are generated;
animation runs in the vertex shaders. The runtime sky now has its own
[Sky system](sky.md) guide.

Vegetation materials use the shared TSL renderer stack: native
WebGPU by default, with `?renderer=webgl` for the WebGL2 fallback.

Geometry systems follow the same settings pattern as the rest of the library:
a `DEFAULT_*` settings object, a `create*Settings(options)` normalizer,
`*_SETTING_GROUPS` + `*_SETTING_FIELD_SCHEMA` for UIs, and a runtime
`applySettings(options)` method on the class. The IP-wide shading treatment
is a separate `VegetationShaderProfile`; it must not absorb asset identity or
the scene's current state.

Each system also has a preset registry (`register*Preset` /
`get*PresetOptions`, resolved via `preset:` in `create*Settings` and the
constructors): `default` is the baseline and `call_me_sensei` is the
studio-managed signature look, curated and updated over releases —
community presets register alongside them. For placing vegetation across
terrain (forests, meadows, slope/water masks), see the scatter helpers in
[world-scale.md](world-scale.md#distribution-helpers).

## One vegetation shader profile

Use one versioned `VegetationShaderProfile` for an IP, not unrelated grass,
tree, and flower shader copies. The profile is dispatched by semantic material
role (`grassBlade`, `foliageCard`, `flowerPetal`, `flowerCenter`,
`woodySurface`, `herbaceousStem`), while mesh/cutout/billboard/procedural are
only technical variants. This gives specialized controls without losing one
coherent art direction.

| Scope | Owns | Does not own |
|---|---|---|
| Vegetation shader profile | shared light treatment, thin-surface response, weather response curves, and role-specific grass/foliage/flower/bark/stem shading | albedo, textures, species, geometry, current weather |
| Asset/material | purple/green/autumn albedo, texture maps, alpha cutoff, species palette | the IP's shared lighting rules |
| Scene/world | current sun/sky, cloud field, wind, wetness, snow coverage | persistent shader response coefficients |
| Instance/interaction | placement, seed, scale, bend target, local retention/response multipliers | the reusable shader definition |

The same profile therefore works unchanged for purple grass or ten differently
colored grass assets. Color remains material data; the shader defines how that
color responds to the world.

```js
import {
  StylizedGrassField,
  createVegetationShaderSettings,
} from '@call-me-sensei/toonlab/vegetation';

const vegetationShader = createVegetationShaderSettings({
  preset: 'call_me_sensei',
  grass: { bandSoftness: 0.08 },
  bark: { bandCount: 3 },
});

const purpleGrass = new StylizedGrassField({
  baseColor: [0.28, 0.12, 0.48],
  tipColor: [0.76, 0.38, 0.96],
  placements,
  vegetationShader,
});

// Host-owned current state; neither value changes the saved profile.
purpleGrass.setWind({ strength: currentWind });
purpleGrass.setSurfaceWeather({ wetness: currentWetness, snowCover: currentSnow });
```

Vegetation Shader Lab exports the same versioned profile document consumed by
the npm runtime:

```js
import {
  createVegetationShaderPresetDocument,
  parseVegetationShaderPresetDocument,
  registerSerializedVegetationShaderPreset,
  serializeVegetationShaderPreset,
} from '@call-me-sensei/toonlab/vegetation-shaders';

const document = createVegetationShaderPresetDocument('violet_world', {
  label: 'Violet World',
  settings: vegetationShader,
});
const json = serializeVegetationShaderPreset(document);
const parsed = parseVegetationShaderPresetDocument(json);
if (parsed.ok) registerSerializedVegetationShaderPreset(json, { overwrite: true });
```

Portable documents use `toonlab/vegetation-shader-preset`.
`getVegetationShaderPresetOptions()` lists built-in and project-registered
profiles; `validateVegetationShaderPresetDocument()` validates an already
parsed object. The focused `vegetation-shaders` subpath and the main
`vegetation` barrel expose the same bindings.

`applyVegetationShader(root, profile)` updates only materials tagged with the
semantic contract and returns coverage/unsupported-uniform diagnostics.
`createStylizedWorld({ vegetationShader })` passes the profile into trees,
grass, and flowers. `world.setVegetationShader(profile)` updates live near
materials; a texture-baked far forest reports that its impostors require a
rebuild.

The labs intentionally split by responsibility:

- Grass Lab authors grass geometry, palette, planting, and grass material data.
- Tree Lab authors trees/bushes and blossoms attached to their canopies.
- Flower Lab authors standalone flower plants and fields.
- Vegetation Shader Lab authors the one cross-asset IP shader profile,
  including bark/trunk and herbaceous stems.

## Construction-time vs. runtime settings

Each class takes asset/construction settings and an optional
`vegetationShader` in the constructor. `applySettings()` remains the
compatibility path for system-specific material and construction settings;
`setVegetationShader()` applies the IP treatment, while `setWind()`,
`setSun()`, `setCloudShadow()`, and `setSurfaceWeather()` carry current world
state. Geometry-shaping settings remain construction-only.

In a composed world, `world.setSun({ direction, color, sky })` is the single
scene-light adapter. It forwards the same transient values to Grass, Flowers,
near Forest variants, Ambient FX direction, the physical directional light,
and shadow-follow logic without mutating any portable vegetation preset.
`lighting.attachWorld(world)` drives that adapter; standalone Weather uses the
same adapter and restores its captured baseline on disposal.

| Class | Live after construction | Construction-only |
|---|---|---|
| `StylizedGrassField` | asset palette through `applySettings`; current wind/sun/scene/cloud/weather through setters; IP look through `setVegetationShader` | `placements`, `bladeHeightRange`, `bladeWidthRange` (baked into instance attributes) |
| `StylizedFlowerField` | asset colors through `applySettings`; current wind/sun/cloud/weather through setters; IP look through `setVegetationShader` | placements, flower geometry |
| `StylizedTree` | current wind/sun/cloud/weather through setters; IP look through `setVegetationShader`; canopy palette re-derivation through `applySettings` | `size`, `seed`, `canopyWidth/Depth/Scale/Layout`, `leafDensity`, `leafPlacement`, trunk/skeleton topology |

## Grass

```js
import { StylizedGrassField } from '@call-me-sensei/toonlab/vegetation';

const grass = new StylizedGrassField({
  placements: points.map((p) => ({ x: p.x, y: terrainHeight(p), z: p.z })),
  windResponse: 1.35, // species flexibility relative to the current world wind
  gustResponse: 0.8,
});
scene.add(grass);
grass.setPushTarget(characterObject3D); // blades bend away from the character
grass.setPushRadius(0.9);               // current scene/instance interaction field
grass.setWind({ direction: [1, 0.3], speed: 1, strength: 0.25 });
grass.setCloudShadow({ strength: 0.5, coverage: 0.45 });

// per frame:
grass.update(delta);

// live asset re-tune (flat settings, see DEFAULT_GRASS_SETTINGS):
grass.applySettings({ windResponse: 1.6, gustResponse: 0.65 });
```

One draw call for the whole field. Convenience setters mirror common groups:
`setWind`, `setSun`, `setSceneShadow({ strength, tint })` (blades darken
under tree/character shadow maps), `setCloudShadow`, `setDistanceFade({
start, end })` (collapse blades the fog has swallowed), `setPushTarget`, and
`setPushRadius`.
Backlit translucency (`backlitStrength`) gives tips a warm glow against the
sun.

Portable grass presets separate asset response from current world state.
`windResponse` and `gustResponse` belong to the species/asset; wind direction,
speed, strength, gust field, cloud-shadow field, sun/sky, push target, and push
radius belong to the active scene or instance. Constructor options and
`applySettings()` still accept those legacy runtime keys for compatibility,
but portable preset schema v2 does not serialize them. When a v1 preset is
loaded, its authored `windStrength` becomes `windResponse` relative to the
historical `0.16` default.

Grass Lab includes coordinated color palettes. A palette is asset/material
data, not a new shader: it updates `baseColor`, `tipColor`, and `shadowTint`
as one set so purple, autumn, dry, and fantasy grass retain an authored shadow
color. It does not change `shadowStrength`, asset motion response, current
weather, or the IP-wide `VegetationShaderProfile`.

```js
import {
  applyGrassColorPalette,
  createGrassSettings,
  serializeGrassPreset,
} from '@call-me-sensei/toonlab/vegetation';

const settings = createGrassSettings(
  applyGrassColorPalette(currentSettings, 'wisteria'),
);
const json = serializeGrassPreset('violet_meadow', {
  label: 'Violet Meadow',
  settings,
});
```

`GRASS_COLOR_PALETTES`, `resolveGrassColorPalette`, and
`matchGrassColorPalette` support custom UIs. Portable Grass Lab documents use
`toonlab/grass-preset`; the public API mirrors the other systems with
`createGrassPresetDocument`, `validateGrassPresetDocument`,
`parseGrassPresetDocument`, and `registerSerializedGrassPreset`. These
documents currently use schema version 2.

## Flowers

```js
import { StylizedFlowerField } from '@call-me-sensei/toonlab/vegetation';

const flowers = new StylizedFlowerField({ placements });
scene.add(flowers);
flowers.update(delta);
flowers.applySettings({ windStrength: 0.2 });
```

Instanced flowers that receive scene shadows like the grass. Settings:
`DEFAULT_FLOWER_SETTINGS` / `createFlowerSettings` /
`FLOWER_SETTING_GROUPS` / `FLOWER_SETTING_FIELD_SCHEMA`.

## Trees

```js
import { StylizedTree, layoutTreeRow, TREE_TRUNK_STYLES } from '@call-me-sensei/toonlab/vegetation';

const tree = new StylizedTree({
  size: 2,                      // 1 ≈ 3 m tree
  seed: 7,                      // deterministic per-seed variation
  canopyColor: { from: 0x4f8f3a, to: 0x77b34e }, // color spec: one color, list, blend, or HSL ranges
  leafDensity: 0.95,
  leafPlacement: 'canopy',      // or 'tips' for bare-limbed silhouettes
});
scene.add(tree);
tree.update(delta);

tree.applySettings({ foliage: { windStrength: 0.4 } }); // grouped settings
tree.setCloudShadow({ strength: 0.45 });
```

Curved trunk (`createTreeTrunkGeometry`, `TREE_TRUNK_STYLES`) + leaf-card
canopy (`stylizedTreeFoliage.js`) in one `THREE.Group`. Settings are grouped
(`DEFAULT_STYLIZED_TREE_SETTINGS`, `STYLIZED_TREE_SETTING_GROUPS`, 58
fields). `STYLIZED_TREE_EXAMPLES` + `layoutTreeRow` power the Tree Lab
(`/tree-lab/`), whose authoring scope is trees, bushes, and optional blossoms
attached to a tree canopy.

Trees are serializable: `treeRecipe.js` defines a versioned recipe document
(`recipeFromSettings` / `settingsFromRecipe` /
`validateTreeRecipeDocument` / `createPlantFromRecipe`), and
`treeExport.js` bakes a tree into plain exportable meshes
(`prepareTreeForExport`, crossed-card or baked foliage) for use outside the
library shaders. `StylizedBush` reuses the foliage system as a standalone
bush. `StylizedFlower` uses the same versioned plant recipe contract while
the Flower Lab (`/flower-lab/`) gives standalone flowers their own document
storage, preset gallery, and bloom-focused workflow.

## Sky

Sky settings, portable preset documents, runtime ownership, and Sky Lab are
documented in [Sky system](sky.md). Sky and vegetation share current sun,
cloud-shadow, and weather inputs, but neither saved artifact owns that scene
state.

## Shared atmosphere hooks

The outdoor systems share one procedural cloud-shadow field and the
renderer's shadow maps, so a cloud or a character shades terrain, grass,
flowers, canopies, and water together:

```js
grass.setCloudShadow({ strength: 0.5, coverage: 0.45, scale: 0.012 });
tree.setCloudShadow({ strength: 0.5 });
water.setCloudShadow({ strength: 0.5 });
setEnvironmentCloudShadow({ strength: 0.5 }); // toonlab/environment
```

All of these are also plain settings fields (`cloudShadowStrength`,
`cloudShadowCoverage`, `cloudShadowScale`, `cloudShadowVelocity`) on each
system.
