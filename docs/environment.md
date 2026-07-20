# Environment shading

A modern anime-style scene shader for rooms, props, and terrain. It targets three
input classes with no shader edits: convention-named texture packs
(Liyue-style `Diffuse/SMBE/LSAB/ESA/Normal` siblings), standard glTF scenes,
and untextured/flat-color scenes.

```js
import {
  applyEnvironmentShader,
  resolveEnvironmentPreset,
  createEnvironmentSunRig,
  createEnvironmentLampRig,
  captureEnvironmentAmbientProbe,
  createEnvironmentPlanarReflection,
  advanceEnvironmentShaderTime,
} from '@call-me-sensei/toonlab/environment';

const preset = resolveEnvironmentPreset('interiorDay');
await applyEnvironmentShader(root, { environmentBox, hasSun: true, ...preset });

const sun = createEnvironmentSunRig({ scene, environmentBox });
const lamps = createEnvironmentLampRig({ scene, environmentBox, root, spot: { castShadow: true } });
captureEnvironmentAmbientProbe({ renderer, scene, position: roomCenter });

// per frame:
advanceEnvironmentShaderTime(delta);
```

(Inside this repo the labs import from `../../src/environment/...`.)

## Adapter and settings

`applyEnvironmentShader(root, options)` walks the scene, resolves texture
sets, classifies material roles, and converts materials. Configuration is
`{ features, parameters }`, normalized by `createEnvironmentSettings()`:

```js
await applyEnvironmentShader(sceneRoot, {
  features: { packedMap: true, shadowMask: true, skyTint: true, spotLights: true },
  parameters: {
    exposure: 0.95,
    ambientLightInfluence: 0.22,
    shadowTintColor: [0.86, 0.82, 0.78],
    saturation: 1.08,
  },
});
```

All 72 fields are in the [settings reference](settings-reference.md)
(`ENVIRONMENT_SETTING_GROUPS` / `ENVIRONMENT_SETTING_FIELD_SCHEMA`); color
parameters accept `THREE.Color`, hex strings/numbers, `{ r, g, b }`, or
`[r, g, b]`. Runtime re-tuning goes through
`applyEnvironmentSettingsToMaterial(material, settings)`.

The shader consumes standard maps — `normalMap` (derivative-TBN, no tangents
required), `aoMap`/`lightMap` (uv1/uv2-aware, warm-tinted occlusion,
painterly lightmap remap), `emissiveMap` (scaled down by day, full at night)
— plus convention-pack siblings found by filename probing. Every sampler is
define-gated per material, so unused maps cost nothing. Author hooks:
`material.userData.envNormalMap/envAoMap/envLightMap/envEmissiveMap`.

## Classification and roles

Materials get environment roles — foliage, window cutout, emissive, shadow
mesh, AO overlay, glossFloor — resolved in priority order:

1. `userData.envRole` on the material or mesh,
2. conversion option `roleOverrides: [{ match, role }]`,
3. built-in keyword heuristics (`classifyEnvironmentMaterialRole`).

`applyEnvironmentShader` returns a `classification` report
(`{ object, material, role, source }` per material) so misfires are
diagnosable at a glance.

## Presets and preset documents

An environment preset is a **style** — an identity, never a baked moment —
and every style resolves in every canonical **scenario** (venue × time of
day: `interiorDay`, `interiorEvening`, `interiorNight`, `exteriorDay`; see
`ENVIRONMENT_SCENARIOS` / `getEnvironmentScenarioOptions()`).

`resolveEnvironmentPreset(name, scenario?)` returns
`{ features, parameters, rig }`. Styles: `default`, `interiorStudio` (tuned
for untextured scenes), `showcase`, and `call_me_sensei` — the
studio-managed signature look, curated and updated over releases, with every
scenario authored. Without a `scenario` the style's base look is returned;
styles that do not author a scenario inherit the canonical rendition (the
Default style's variant). The historical single-moment ids (`interiorDay`,
`interiorEvening`, `interiorNight`, `exteriorDay`) resolve through
`ENVIRONMENT_PRESET_ALIASES` as the Default style at that scenario,
byte-identical to the presets they replaced. The `rig` hints (`sun`,
`spotShadows`, `probe`, `planarReflection`, `dustMotes`, `bakeVertexAo`,
`lampIntensity`, `timeOfDayHour`) tell the host app which rigs to
construct — the labs consume them automatically via `?envStyle=` and
`?envScenario=`. The older `?envPreset=` identity key remains readable for
existing bookmarks.

Register your own, either in code or as a shareable JSON document
(`toonlab/environment-preset`, versioned and validated like toon presets):

```js
import {
  registerEnvironmentPreset,
  createEnvironmentPresetDocument,
  validateEnvironmentPresetDocument,
  registerEnvironmentPresetDocument,
} from '@call-me-sensei/toonlab/environment';

registerEnvironmentPreset('myRoom', { features: {...}, parameters: {...}, rig: {...} });

const document = createEnvironmentPresetDocument('myRoom', { label: 'My Room' });
// ...save/share JSON.stringify(document), then on another machine:
const result = validateEnvironmentPresetDocument(document);
if (result.ok) registerEnvironmentPresetDocument(result.value, { overwrite: true });
```

## Rigs

Stylized light rigs positioned relative to the environment bounds
(`environmentRelativePoint`):

- `createEnvironmentSunRig({ scene, environmentBox })` — key directional
  light plus visible sun disk, spill, beam, and shaft quads.
- `createEnvironmentLampRig({ scene, environmentBox, root, spot })` — lamp
  point/spot lights with optional shadowed downlight spots;
  `applyEnvironmentLampEmissive(root, multiplier)` couples fixture emissive
  textures to lamp intensity.
- `createEnvironmentBackdrop(...)` — timed window backdrop
  (morning/day/evening/night images, `environmentBackdropPeriodForHour`).
- `createEnvironmentDustMotes(...)` — deterministic drifting motes for sun
  shafts.

## Time of day

```js
import { sampleEnvironmentTimeOfDay, applyEnvironmentTimeOfDay } from '@call-me-sensei/toonlab/environment';

const state = sampleEnvironmentTimeOfDay(17.5); // hour 0..24
applyEnvironmentTimeOfDay(state, { sunRig, lampRig, backdrop, environmentRoot });
```

`sampleEnvironmentTimeOfDay(hour)` interpolates keyframed sun
color/intensity/position, ambient and lamp scales, sky tints, fog color, and
backdrop period (sunrise 06:00, sunset 18:00); `applyEnvironmentTimeOfDay`
pushes the sampled state everywhere in one call. In the labs: `?envTime=14`,
`?envFreezeTime=1` for deterministic captures.

## Ambient probe

`captureEnvironmentAmbientProbe({ renderer, scene, position })` renders a
six-direction probe at a point (typically the room center) so ambient light
follows the room's own palette instead of a flat constant. Blend with the
`ambientProbeBlend` parameter; colors land on every converted material via
`setEnvironmentAmbientProbeColors`.

## Planar reflection

`createEnvironmentPlanarReflection({ renderer, scene, camera, ... })` adds
one oblique-clipped mirror pass for glossy floors (`glossFloor` role),
fresnel-faded, including character reflections. Call `reflection.update()`
per frame. `detectEnvironmentFloorY(root)` finds the floor height.

## Vertex AO for untextured scenes

With `bakeVertexAo: 'auto'` (the default), untextured meshes get per-vertex
ambient occlusion baked at conversion — BVH-accelerated
(`three-mesh-bvh`), deterministic, budgeted with explicit skip warnings.
Direct API: `bakeEnvironmentVertexAo`. Untextured materials also get a
designed gradient (floor falloff + sky tint) so flat-color rooms read
art-directed; the `interiorStudio` preset tunes the whole look for this
class.

## Interior occlusion, fog, cloud shadows

- `setEnvironmentOpenings(openings)` + the `interiorOcclusionStrength`
  parameter darken interiors based on where the real openings (windows,
  doors) are.
- Converted materials participate in `scene.fog`, plus world-height fog via
  `heightFogDensity/Falloff/Color`.
- `setEnvironmentCloudShadow({ strength, coverage, scale, velocity })`
  drives the same procedural cloud-shadow field the grass, trees, and water
  use; advance the shared clock once per frame with
  `advanceEnvironmentShaderTime(delta)`.

## Debug views

`?envDebug=<mode>` in the labs or `setEnvironmentDebugOutput(root, mode)` in
code renders one term in isolation:

```text
albedo | lit | ambient | direct | shadowMask | pointLight | spotLight |
occlusion | bakedGi | normal | vertexAo | specular | emissive | windowMask |
roomOcclusion | alpha
```

Debug branches compile out entirely unless requested. Captures freeze the
shared environment clock automatically (`?envFreezeTime=1`).
