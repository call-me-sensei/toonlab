# Vegetation and sky

Procedural stylized vegetation (`@call-me-sensei/toonlab/vegetation`) and sky
(`@call-me-sensei/toonlab/sky`). No texture assets — geometry and shading are generated;
animation runs in the vertex shaders.

Vegetation and sky materials now use the shared TSL renderer stack: native
WebGPU by default, with `?renderer=webgl` for the WebGL2 fallback.

All four systems follow the same settings pattern as the rest of the
library: a `DEFAULT_*` settings object, a `create*Settings(options)`
normalizer, `*_SETTING_GROUPS` + `*_SETTING_FIELD_SCHEMA` for UIs, and a
runtime `applySettings(options)` method on the class. Every field is listed
in the [settings reference](settings-reference.md), and the schemas plug
straight into the [debug panel](debug-panel.md).

Each system also has a preset registry (`register*Preset` /
`get*PresetOptions`, resolved via `preset:` in `create*Settings` and the
constructors): `default` is the baseline and `call_me_sensei` is the
studio-managed signature look, curated and updated over releases —
community presets register alongside them. For placing vegetation across
terrain (forests, meadows, slope/water masks), see the scatter helpers in
[world-scale.md](world-scale.md#distribution-helpers).

## Construction-time vs. runtime settings

Each class takes its full settings object in the constructor. After
construction, `applySettings()` re-tunes everything that lives in uniforms
(wind, colors, shadows, cloud shadows...) live — but **geometry-shaping
settings are construction-only**: they are stored on `instance.settings` but
do not rebuild existing meshes. Build a new instance to change them.

| Class | Runtime via `applySettings` | Construction-only |
|---|---|---|
| `StylizedGrassField` | wind, palette, sun, scene/cloud shadows, backlit, push radius | `placements`, `bladeHeightRange`, `bladeWidthRange` (baked into instance attributes) |
| `StylizedFlowerField` | wind, colors | placements, flower geometry |
| `StylizedTree` | `foliage.*` uniforms (wind, sun, alpha cutoff, scene/cloud shadow, backlit), canopy palette re-derivation | `size`, `seed`, `canopyWidth/Depth/Scale/Layout`, `leafDensity`, `leafPlacement`, trunk/skeleton topology |
| `StylizedSky` | everything (colors, sun, clouds, stars, horizon scattering) | dome geometry |

## Grass

```js
import { StylizedGrassField } from '@call-me-sensei/toonlab/vegetation';

const grass = new StylizedGrassField({
  placements: points.map((p) => ({ x: p.x, y: terrainHeight(p), z: p.z })),
  windStrength: 0.25,
});
scene.add(grass);
grass.setPushTarget(characterObject3D); // blades bend away from the character

// per frame:
grass.update(delta);

// live re-tune (flat settings, see DEFAULT_GRASS_SETTINGS):
grass.applySettings({ windStrength: 0.3, cloudShadowStrength: 0.5 });
```

One draw call for the whole field. Convenience setters mirror common groups:
`setWind`, `setSun`, `setSceneShadow({ strength, tint })` (blades darken
under tree/character shadow maps), `setCloudShadow`, `setDistanceFade({
start, end })` (collapse blades the fog has swallowed), `setPushTarget`.
Backlit translucency (`backlitStrength`) gives tips a warm glow against the
sun.

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
(`/tree-lab/`).

Trees are serializable: `treeRecipe.js` defines a versioned recipe document
(`recipeFromSettings` / `settingsFromRecipe` /
`validateTreeRecipeDocument` / `createPlantFromRecipe`), and
`treeExport.js` bakes a tree into plain exportable meshes
(`prepareTreeForExport`, crossed-card or baked foliage) for use outside the
library shaders. `StylizedBush` reuses the foliage system as a standalone
bush.

## Sky

```js
import { StylizedSky } from '@call-me-sensei/toonlab/sky';

const sky = new StylizedSky();
scene.add(sky);

// per frame:
sky.update(delta, camera);

sky.applySettings({ horizonScattering: 0.7, cloudCoverage: 0.5 });
```

Procedural dome: vertical gradient, sun disk with glow, painterly clouds,
stars at night, and a warm sun-side horizon-scattering wedge
(`horizonScattering`, `0` restores a plain gradient). The dome is what the
water's reflections fall back to, so water and sky stay consistent.
Low-level API: `createSkyMaterial(options)` +
`applySkySettingsToMaterial(material, options)`.

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
