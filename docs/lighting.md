# Lighting

`@call-me-sensei/toonlab/lighting` is ToonLab's portable lighting-authoring
layer. It gives games one vocabulary for lights, reusable styles and fixtures,
quality budgets, runtime selection, diagnostics, and engine export. The module
coordinates Three.js lights and preserves metadata for ToonLab's stylized
material response; it does not replace an engine renderer,
global-illumination solver, or ray tracer.

## The three artifacts

Lighting identity is authored once and referenced everywhere, instead of
configuring lights per scene:

| Artifact | Document | Cardinality | What it captures |
|---|---|---|---|
| **Lighting style** | `toonlab/lighting-style` | one per game (a few variants) | The full day as one curve: sun color/intensity per hour, sun path, ambient policy, sky/fog palette, exposure philosophy, shadow policy, fixture response |
| **Light fixture** | `toonlab/light-fixture` | a small vocabulary | One *kind* of light ("street lamp", "lantern"): base descriptor + seeded variation domains + flicker + day/night schedule |
| **Scene overlay** | runtime object | tiny, per scene/zone | Fixture placements plus small adjustments (exposure nudge, ambient warmth) blended in and out |

The mental model: *the sun at noon looks a certain way, at 18:00 a certain
way, a street lamp looks a certain way — scenes reference those, they never
restate them.* Same recipe + seed resolves identically in the Lighting Lab,
through MCP, and in a shipped game.

## Quick start: the lighting system

```js
import { createLightingSystem } from '@call-me-sensei/toonlab/lighting';

const lighting = createLightingSystem({
  camera,
  renderer,
  scene,
  style: 'call-me-sensei',       // or 'storybook', a saved document, or settings
});
lighting.attach({ fog: scene.fog, driveSunPosition: true });

lighting.setTimeOfDay(18.5);     // the whole look follows the style's day cycle
lighting.place('street-lamp', [4, 0, 2]);      // seeded variation per placement
lighting.place('cms-lantern', [1.2, 0, 0.5]);  // vivid Call Me Sensei fixture

// per frame
lighting.update(delta, camera);  // flicker, overlay blends, light budgets
```

Built-in styles: `call-me-sensei` (vivid Genshin/ZZZ-direction daylight,
luminous shadows, fixture-lit blue nights), `storybook`, `golden-summer`,
`overcast-pastel`, `neon-night`. Built-in fixtures include `street-lamp`,
`paper-lantern`, `window-glow`, `neon-sign`, `campfire`, `shrine-candle`, and
the Call Me Sensei set (`cms-street-lamp`, `cms-lantern`, `cms-city-neon`).
Both registries are open: `registerLightingStylePreset` /
`registerLightFixture` (or their document variants) add your own without
touching built-ins.

### Working with worlds

`lighting.attachWorld(world)` binds a `createStylizedWorld` result. The style
drives its world-owned sun-direction adapter (so the visible disc, directional
light, cast shadows, Grass/Flower/Tree shader inputs, and Water highlight
agree), sun color/intensity/accents, environment-material sky/fog tints, scene
fog, exposure, and private
priority-100 Sky and Water layers.

If `world.weather` exists, `attachWorld` also calls
`weather.setLightingSystem(lighting)`. Lighting remains the sole writer for
sun, ambient, and fog color; Weather supplies normalized modulation and owns
higher-priority Sky/Water layers. `detach()` restores the prior world sun
direction and removes only Lighting's layers, leaving standalone Weather
active. The world bridge is `getSun`/`setSun({ direction, color, sky })` (with
`getSunDirection`/`setSunDirection` retained for direction-only compatibility).
In custom integrations, the equivalent Weather bridge is
`lighting.setWeatherModulation({ sunIntensityScale, sunColorTint,
ambientScale, fogColorOverride, ... })`.

Sun translation remains world-owned because the shadow-follow window moves the
light and target around the player. Standalone scenes without a world adapter
may pass `driveSunPosition: true` instead.

### Generating styles and fixtures

Both artifact types have generator recipes on the shared grammar
(`core/generation.js`): domains, locks, seeds, deterministic resolution.

```js
import {
  createLightingStyleGeneratorRecipe,
  resolveLightingStyleGeneratorRecipe,
} from '@call-me-sensei/toonlab/lighting';

const recipe = createLightingStyleGeneratorRecipe('my-style', {
  family: 'call-me-sensei',   // anime-day | call-me-sensei | golden | noir-neon | pastel-overcast
  locks: ['sun.dayKelvin'],   // subtree locks respected across reseeds
  seed: 4207,
});
const settings = resolveLightingStyleGeneratorRecipe(recipe); // deterministic
```

Fixture generation (`createLightFixtureGeneratorRecipe`, families
`warm-practical` / `cms-practical` / `flame` / `neon`) samples the fixture
*and* the spread of its per-placement variation, so one seed yields a fixture
that itself yields endless placement variety.

### Lifecycle and safety

- `setTimeOfDay` / `advanceTime` / `setStyle` are hot updates; placements
  survive a style swap.
- `place()` returns a handle: `{ id, light, set(overrides), remove() }`.
  Same-type edits patch the realized light in place — no rig rebuild.
- Area-light fixtures (`window-glow`, neon tubes) wait for the LTC lookup
  textures to load (`area-ltc-pending` in diagnostics) instead of crashing the
  node backends; `ensureAreaLightSupport()` preloads them.
- `stats()` / `toJSON()` / `reset()` / `dispose()` follow the standard runtime
  contract; `dispose()` restores fog, exposure, the complete world/physical sun
  state, and every environment tint it captured, unbinds Weather, and clears
  only its own Sky/Water layers. Dispose order is safe: if Weather is removed
  first, Lighting restores Weather's pre-condition sun baseline when it later
  detaches.

### Known integration limits (v1)

- On the node backends, ToonLab's toon/terrain materials read at most the
  first directional light, 8 point lights, 4 spot lights, and 2 hemisphere
  lights through the shared toon light mirror; area lights affect standard
  materials only. Fixture budgets should respect those caps in toon worlds.
- Inside `createStylizedWorld`, the sun's shadow pass and position remain
  world-owned; the style contributes color/intensity/accents.

---

The sections below cover the lower-level engine the system is built on —
light descriptors, rigs, quality budgets, runtime selection, and engine
export. Reach for them when you need one-off lights or a custom realization
layer; most games should stay on styles + fixtures above.

The engine-export boundary is especially clear for ToonLab:

> **Many Lights is an engine-native ToonLab direct-lighting feature.**
> ToonLab does not reimplement Many Lights in JavaScript or WebGPU. ToonLab
> records lighting intent and exports a versioned manifest that an ToonLab
> adapter can realize with Many Lights. Dynamic GI remains a separate ToonLab-native
> choice for global illumination and reflections.

This separation keeps a lighting recipe useful in a browser, a Three.js game,
an editor tool, and an ToonLab import pipeline without pretending those targets
have identical renderers.

## Low-level quick start

```js
import {
  createLightDescriptor,
  createLightingManager,
  createLightingRecipe,
  resolveLightingQualityPreset,
} from '@call-me-sensei/toonlab/lighting';

const recipe = createLightingRecipe({
  id: 'harbor-night',
  name: 'Harbor Night',
  lights: [
    createLightDescriptor('directional', {
      id: 'moon',
      name: 'Moon',
      position: [-18, 32, -24],
      target: [0, 0, 0],
      color: '#b9ceff',
      intensity: { value: 0.8, unit: 'lux' },
      tags: ['exterior', 'key'],
      castShadow: true,
      shadow: { enabled: true, mapSize: 2048, priority: 100 },
    }),
    createLightDescriptor('point', {
      id: 'pier-lantern',
      name: 'Pier Lantern',
      position: [8, 2.4, -3],
      color: { temperatureKelvin: 2200 },
      intensity: { value: 420, unit: 'lumens' },
      distance: 12,
      maxDistance: 24,
      tags: ['exterior', 'practical'],
      castShadow: true,
      shadow: { enabled: true, mapSize: 512, priority: 40 },
    }),
  ],
  shadowPolicy: {
    mode: 'budgeted',
    allowedTypes: ['directional', 'point', 'spot'],
    maxShadowedLights: 4,
    maxShadowMapPixels: 4 * 2048 * 2048,
    updateMode: 'auto',
  },
});

const lighting = createLightingManager({
  renderer,
  scene,
  camera,
  recipe,
  quality: resolveLightingQualityPreset('high'),
  textureResolver: async ({ uri }) => assetLoader.loadAsync(uri),
});

lighting.addToScene(scene); // optional when `scene` was supplied above

// Before rendering each frame. `focus` makes local-light distance selection
// follow the player rather than a cinematic camera cut.
lighting.update({ camera, focus: player.position });

// Runtime edits retain the stable id.
lighting.updateLight('pier-lantern', {
  intensity: { value: 560, unit: 'lumens' },
});
lighting.setLightEnabled('pier-lantern', powerIsOn);

// On teardown:
lighting.dispose();
```

`createLightingRig(options)` is an alias for `createLightingManager(options)`
for codebases that call every scene-light collection a rig. The manager owns
only the objects it creates. The host continues to own the renderer, scene,
camera, environment materials, and render loop.

## Public API at a glance

The lighting subpath centralizes the portable contract:

| Concern | Public API |
|---|---|
| Runtime | `createLightingManager`, `createLightingRig`, `realizeLightingRecipe` |
| Descriptors | `LIGHT_TYPES`, `createLightDescriptor`, the eight type-specific creators, and the cookie/IES/linking/shadow/artistic helpers |
| Color and intensity | `createLightColor`, `createLightIntensity`, `colorTemperatureToRgb`, unit conversion helpers |
| Recipe documents | `createLightingRecipe`, `validateLightingRecipe`, `assertLightingRecipe`, `serializeLightingRecipe`, `deserializeLightingRecipe` |
| Look documents | `createLightingLook`, `validateLightingLook`, `assertLightingLook`, `serializeLightingLook`, `deserializeLightingLook` |
| Presets | Frozen `LIGHTING_*_PRESETS` registries, `getLightingPresetOptions`, `resolveLightingPreset`, and the four type-specific resolvers |
| Quality profiles | `createLightingQualityProfile`, `resolveLightingQualityPreset` |
| Capability planning | `createLightingCapabilityReport`, `getLightingTypeCapability`, `snapshotLightingCapabilities` |
| ToonLab handoff | `exportLightingRecipeToToonLab`, `serializeToonLabLightingManifest` |

Validation functions return `{ ok, valid, errors, warnings }` and do not
coerce their input. `assert...` returns the supplied valid document or throws.
`deserialize...` accepts JSON text or an already-parsed object, validates it,
returns a fresh normalized document, and never adds anything to a scene.

## Light descriptors

A descriptor is JSON-safe authoring intent, not a `THREE.Light`. Stable `id`
values are mandatory inside a recipe because selection, patching, animation,
diagnostics, and engine import all refer to them.

```js
const sign = createLightDescriptor('rectArea', {
  id: 'ramen-sign',
  name: 'Ramen sign bounce',
  position: [2.5, 3.1, -1.2],
  target: [0, 1.8, -1.2],
  width: 1.8,
  height: 0.5,
  color: [1, 0.12, 0.05],
  intensity: { value: 900, unit: 'lumens' },
  linking: {
    includeTags: ['street', 'characters'],
    excludeTags: ['sky'],
  },
  tags: ['night', 'practical', 'neon'],
  artistic: { role: 'practical', bandSoftness: 0.16 },
  userData: { fixtureId: 'shop-17/sign' },
});
```

Every descriptor can carry these common fields:

| Field | Meaning |
|---|---|
| `id`, `name` | Stable machine id and optional display name. |
| `type` | One of `LIGHT_TYPES`. |
| `enabled` | Authored state; budget culling is reported separately. |
| `position`, `target` | World-space source and target points in meters. Directional, spot, and area lights derive orientation from these points. |
| `color` | RGB/hex input or `{ temperatureKelvin, tint }`; normalized documents store `{ rgb, temperatureKelvin, tint }`. |
| `intensity` | A scalar or `{ value, unit, artisticMultiplier, referenceDistance }`. Units are `unitless`, `lux`, `candela`, `lumens`, and `nits`. |
| `distance`, `maxDistance`, `decay` | Three.js attenuation distance, runtime selection distance, and attenuation exponent. |
| `width`, `height`, `angle`, `penumbra` | Area and spot shape parameters used when the selected backend can represent them. |
| `priority` | Runtime selection priority before distance tie-breaking. |
| `castShadow`, `shadow` | Request plus `{ enabled, priority, mapSize, bias, normalBias, radius, near, far, extent }`. |
| `cookie` | `{ uri, key, channel, intensity }` projected texture reference; core realization supports spot lights. |
| `ies` | `{ uri, key, intensity }` photometric-profile reference for point and spot lights. |
| `linking` | `{ includeTags, excludeTags }` receiver intent. |
| `layers` | Three.js layer indices applied directly to the realized light. |
| `artistic` | Toon metadata: role, band softness, shadow tint, rim influence, and diffuse/specular multipliers. |
| `tags`, `userData` | Selection, grouping, provenance, and host-specific JSON data. |

Colors in serialized documents are normalized to an object containing RGB or
temperature intent plus tint. Resource fields contain references, never live
textures or engine objects. A
`textureResolver` supplied to the manager decides whether and how a URI is
loaded, so importing untrusted JSON does not implicitly fetch network assets.

### Light types

`LIGHT_TYPES` includes:

| Type | Intended use |
|---|---|
| `ambient` | Uniform, inexpensive scene fill. |
| `directional` | Sun, moon, or another effectively infinite source. |
| `point` | Bulb, flame, orb, or omnidirectional practical. |
| `spot` | Flashlight, stage spot, downlight, or projector. |
| `hemisphere` | Cheap sky/ground ambient split. |
| `rectArea` | Window, panel, sign, or rectangular softbox. |
| `discArea` | Round softbox, portal, or broad circular emitter. |
| `tubeArea` | Fluorescent tube, neon stroke, or long strip source. |

Disc and tube descriptors are first-class portable intent even where Three.js
does not expose matching native light classes. The core Three.js realization
uses a rectangular-area approximation and records that fallback in
diagnostics. An engine adapter may realize the original disc or tube intent
more accurately.

IES profiles and light linking follow the same rule: the core preserves and
validates the authoring intent. A host adapter consumes them when supported;
otherwise the manager uses an unprofiled light or broad receiver set and
emits a structured fallback rather than silently discarding the field.

## Recipes and the four preset levels

The hierarchy deliberately separates reusable art from platform budgets:

```text
luminaire -> rig -> look
                    + quality
                         |
                         v
                 resolved recipe
```

| Level | Contains | Examples |
|---|---|---|
| **Luminaire** | One fixture descriptor plus default resource references and metadata. | paper lantern, torch, neon tube, streetlight, window panel |
| **Rig** | Multiple luminaires/lights with transforms and named artistic roles. | three-point character rig, outdoor sun, warm interior, night market |
| **Look** | A recipe or rig selection plus environment, time-of-day, material-response, exposure, and post intent. | overcast noon, warm interior evening, moonlit harbor |
| **Quality** | Portable active-light, distance, feature, and shadow budgets only. | `mobile`, `balanced`, `high`, `cinematic` |

Do not put performance policy into a luminaire or rig. The same night-market
rig should resolve under a mobile budget and a high-end budget without
forking the artistic preset.

`getLightingPresetOptions(kind)` returns lab-ready
`{ id, label, description, kind }` records. `kind` is `luminaire`, `rig`,
`look`, or `quality`; omit it to list every registry. The four resolvers return
fresh normalized values so callers can safely apply overrides.

The built-in registries are frozen. V1 intentionally avoids a process-global
custom-preset registry: treat a custom luminaire as a descriptor, a custom rig
as a recipe, a custom quality preset as a quality-profile object, and a custom
look as a look document. Store those values in a project catalog or the
Lighting Lab's local library and serialize recipes/looks for reuse. The
`createLightingLookPreset`/`validateLightingLookPreset`/serialization aliases
make that saved-preset intent explicit without inventing a second look schema.

### Recipe document

The canonical portable recipe shape is:

```js
{
  type: 'toonlab/lighting-recipe',
  schemaVersion: 1,
  id: 'shrine-evening',
  name: 'Shrine Evening',
  lights: [ /* normalized descriptors */ ],
  shadowPolicy: { /* global budget and defaults */ },
  metadata: {
    author: 'Example Studio',
    sourcePreset: 'rig/shrine-courtyard',
  },
}
```

A recipe is the resolved, deterministic scene-light snapshot. Preset ids may
be retained in `metadata` for provenance, but a shipped recipe should contain
all resolved descriptors required to reproduce the setup. This avoids a
registry update changing a released game unexpectedly.

### Look document

A look packages lighting with the adjacent systems needed to reproduce the
shot. A look is a scene/shot shortcut — a baked scenario — never an
identity: style bundles serialize lighting **styles** (the dayCycle-bearing
documents above), and the legacy scenario looks (`daylight`, `golden_hour`,
`moonlit`, `character_studio`, `warm_interior`) resolve only for saved
bundles:

```js
const look = createLightingLook({
  id: 'shrine-rain-1800',
  name: 'Shrine Rain at 18:00',
  recipe,
  quality: 'high',
  environment: {
    preset: 'exteriorDay',
    timeOfDay: 18,
    weatherPreset: 'rain',
    fog: { density: 0.0015 },
  },
  post: {
    preset: 'call_me_sensei',
    exposure: 1.05,
  },
  metadata: { shot: 'courtyard-wide' },
});
```

The lighting manager realizes `look.recipe`. Environment, weather, water,
sky, and post-processing remain owned by their existing ToonLab modules. A
world or lab coordinator reads the other look sections and applies them to
those systems; unknown integration data is retained for engine adapters.

## Serialization and preset reuse

Recipes and looks use versioned JSON documents:

```js
import {
  deserializeLightingRecipe,
  serializeLightingRecipe,
  validateLightingRecipe,
} from '@call-me-sensei/toonlab/lighting';

const json = serializeLightingRecipe(recipe, { pretty: true });
localStorage.setItem('my-game/lighting/shrine', json);

try {
  const imported = deserializeLightingRecipe(
    localStorage.getItem('my-game/lighting/shrine'),
  );
  lighting.setRecipe(imported);
} catch (error) {
  console.error(error.message);
}

// For a non-throwing check of an already-parsed object:
const validation = validateLightingRecipe(JSON.parse(json));
console.warn(...validation.warnings);
```

The serializer emits version-stamped JSON and the schemas do not embed
textures, `Object3D`s, callbacks, or renderer state. Validation:

- checks document tags, schema versions, descriptor structure, and ids;
- rejects duplicate light ids and invalid descriptor shapes;
- warns about cookies, IES, physical-unit, or shadow combinations that the
  portable descriptor contract cannot realize directly;
- preserves JSON-safe `metadata` for round trips;
- rejects documents newer than the supported schema instead of guessing;
- leaves normalization to `createLightingRecipe`/`deserializeLightingRecipe`.

Store source-controlled presets as ordinary JSON beside game content. For
runtime user presets, store the serialized recipe/look and treat resource URIs
as untrusted input. Applications decide which URI schemes and asset roots a
`textureResolver` permits.

## Runtime manager

`createLightingManager(options)` turns a normalized recipe into Three.js scene
objects and continuously enforces the active quality budget.

```js
const lighting = createLightingManager({
  scene,
  camera,
  recipe,
  quality: 'high',
  capabilities: createLightingCapabilityReport({ renderer }),
  textureResolver,
});
```

Manager surface:

| Member | Contract |
|---|---|
| `group` | Root `THREE.Group` containing manager-owned lights/helpers. |
| `recipe`, `quality` | Current normalized snapshots. Treat them as read-only. |
| `setRecipe(recipeOrPresetId)` | Normalize the recipe, rebuild manager-owned lights, and re-plan budgets. |
| `setQuality(idOrQuality)` | Change only runtime policy; authored light descriptors remain unchanged. |
| `updateLight(id, patch)` | Normalize and replace one descriptor while retaining its stable id. |
| `setLightEnabled(id, enabled)` | Toggle authored state without losing settings. |
| `getLight(id)` | Return the realized Three.js light, or `null` for an unknown id. |
| `addToScene(scene)`, `removeFromScene()` | Explicit scene attachment for hosts that did not pass `scene`. |
| `applyLook(lookOrPresetId)` | Apply its recipe/quality and return `{ environment, post }` for the host coordinator. |
| `update({ camera, focus })` | Re-evaluate distance/priority culling, shadow allocation, and diagnostics. |
| `requestShadowUpdate(id?)` | Mark one or all existing shadow maps for refresh. |
| `subscribe(listener)` | Observe `selection`, `recipe`, `quality`, `light`, and `cookie` diagnostics events. |
| `getDiagnostics()` | Return a serializable backend, budget, selection, shadow, and fallback report. |
| `dispose()` | Detach and release manager-owned objects. Resolved cookie textures remain host-owned unless `disposeCookieTextures: true` was requested. |

Selection is deterministic for one recipe order and focus point. Global lights
receive a fixed preference; local lights are ranked by descriptor `priority`
then distance to `focus`. The manager applies each type cap and then the total
cap, using recipe order as the final tie-breaker. The current v1 selector does
not estimate projected screen influence or add hysteresis, so set meaningful
priorities and avoid placing many equal-priority lights exactly at a budget
boundary.

## Capabilities and deterministic fallbacks

`createLightingCapabilityReport({ renderer })` describes
what the current target can realize. Passing the report into a manager makes
planning deterministic and testable; omitting it lets the manager inspect the
renderer.

The report exposes `backend`, `supportedLightTypes`, renderer limits, and
feature-specific values for area-light realization, cookies, IES, linking,
shadows, many-light rendering, Many Lights, and Dynamic GI. The manager keeps a
recipe valid when a feature degrades and exposes the chosen approximation in
diagnostics.

### Supported/fallback matrix

This table describes the portable ToonLab/Three.js baseline. An engine adapter
can report stronger support without changing the recipe.

| Feature | WebGPU/TSL | WebGL2 fallback | ToonLab export intent | Portable fallback |
|---|---|---|---|---|
| Directional light | Native; the custom ToonLab shadow bridge consumes one primary directional shadow | Native; same primary-shadow constraint on custom materials | `DirectionalLight` intent | Author one primary shadowed directional when using the custom bridge |
| Point light | Native, subject to material/quality light limits | Native, subject to tighter quality limits | `PointLight` intent; may opt into engine Many Lights | Priority/distance-cull over budget |
| Spot light | Native, subject to material/quality light limits | Native, subject to tighter quality limits | `SpotLight` intent; may opt into engine Many Lights | Priority/distance-cull over budget |
| Hemisphere light | Native ambient approximation | Native ambient approximation | Sky/ambient intent for adapter mapping | Fold into ambient/sky contribution |
| Ambient light | Native uniform fill | Native uniform fill | Approximate `SkyLight` intent | Keep as non-directional fill |
| Rect area light | Native `THREE.RectAreaLight` object; material support remains renderer-dependent | Same material caveat | `RectLight` intent | Cull when `allowAreaLights` is false |
| Disc/tube area light | `THREE.RectAreaLight` approximation | Same approximation | Preserve original source-shape intent on a `RectLight` mapping | Approximate and report shape loss |
| Local-light shadows | Three scene objects can request them; custom ToonLab TSL material consumption is backend/material dependent | Backend/material dependent and budget-limited | Preserve cast-shadow request | Disable lowest-priority shadows first; retain direct light |
| Cascaded sun shadows | Not provided; `directionalCascades` is recipe intent only | Not provided | Preserve cascade-count intent in source policy | One directional shadow camera per realized light |
| Shadow atlas | Budget/selection policy only; no general portable atlas renderer | Budget/selection policy only | Adapter may map to engine virtual shadow resources | Independent engine shadow maps within texel budget |
| Cookies/gobos | Spot `light.map` when `textureResolver` returns a `THREE.Texture` | Same, subject to quality | Preserve light-function texture reference | Untextured light plus cookie status diagnostic |
| IES profiles | Validated metadata in core | Validated metadata in core | Preserve IES asset reference and multiplier | Unprofiled point/spot plus diagnostic |
| Light linking | Three layers applied directly; tag linking is metadata/host hook | Same | Preserve channels and include/exclude intent | Broad receiver set plus warning |
| Many-light selection | CPU priority/distance selection and quality caps | Same with a measured profile | Export all authored lights and Many Lights intent | Cull deterministically before upload |
| Clustered/Forward+ lighting | Not promised by the baseline contract | Not promised | Engine-owned | Fixed/budgeted active set |
| Stochastic ray-traced direct lighting | Not implemented | Not available | Many Lights preference only | Raster direct lights and shadow maps |
| Dynamic GI/reflections | Separate lightmap, ambient-probe, planar-reflection, sky, and post hooks | Same separate hooks | Dynamic GI preference is exported separately | No GI or reflection solve in the lighting manager |

ToonLab's current custom character/environment shaders have bounded local
light arrays. A quality profile must never assume that creating more Three.js
lights means every custom material consumes them. Manager diagnostics describe
realized Three.js objects and quality selection, not per-material shader-array
consumption; combine them with the selected material/backend limits.

## Quality and shadow budgets

A quality preset is an explicit budget. Built-ins are `mobile`, `balanced`,
`high`, and `cinematic`; a custom profile can constrain:

```js
const handheld = {
  id: 'handheld',
  label: 'Handheld',
  maxLights: 10,
  maxLightsByType: {
    ambient: 1,
    hemisphere: 1,
    directional: 1,
    point: 6,
    spot: 2,
    rectArea: 0,
    discArea: 0,
    tubeArea: 0,
  },
  maxDistance: 55,
  maxShadowedLights: 1,
  maxShadowMapPixels: 2048 * 2048,
  shadowMapSizeScale: 0.5,
  allowAreaLights: false,
  allowCookies: false,
};

lighting.setQuality(handheld);
```

Recipe `shadowPolicy` and quality shadow fields both constrain resources; the
stricter count and pixel limit wins. Allocation order is:

1. Cull disabled lights, quality-disabled area lights, and local lights beyond
   the effective `maxDistance`.
2. Apply `maxLightsByType`, then the quality `maxLights` total.
3. Keep active lights whose `castShadow` and `shadow.enabled` are both true and
   whose type is in `shadowPolicy.allowedTypes`.
4. Rank shadow candidates by light priority plus shadow priority, then distance
   and recipe order.
5. Allocate until either `maxShadowedLights` or `maxShadowMapPixels` is spent.
   A point-light shadow counts all six cube faces. Denied shadows keep their
   direct light.

`shadowPolicy.updateMode` is `everyFrame`, `auto`, or `manual`. Manual hosts
call `requestShadowUpdate(id?)` when a light or caster changes. Each light's
effective map allocation appears as `shadowPixels` in diagnostics.

## Diagnostics and debug views

`getDiagnostics()` is intentionally serializable so labs, automated tests,
telemetry, and bug reports can all inspect the same facts:

```js
const report = lighting.getDiagnostics();

console.table(report.entries);
console.log('active', report.selectedIds);
console.log('shadowed', report.shadowedIds);
console.warn(...report.warnings);
```

The report includes:

- backend, recipe id, quality id, and total/active/shadowed counts;
- `countsByType`, `selectedIds`, and `shadowedIds`;
- one `entries` row per descriptor with active/shadowed state, cull reason,
  distance, score, allocated shadow pixels, cookie/IES status, and fallback;
- capability, approximation, missing-resource, budget, IES, and linking
  warnings.

The Lighting Lab visualizes `final`, `unlit`, `influence`, `complexity`, and
`shadows`. Production games can build lighter
overlays from the same report without importing lab code.

## Lighting Lab

Run the dedicated editor at `/lighting-lab/`. It is the authoring and
diagnostics surface for this module. Character Shader Lab remains focused on
how character materials respond to light, while Sky Lab authors the visible
sky baseline rather than the scene's actual light and shadow policy. See
[Lab responsibilities](lab-architecture.md).

The Lighting Lab provides:

- a light outliner with add, duplicate, delete, solo, mute, and stable id
  display/preservation;
- transform gizmos plus numeric position/target, shape, photometry, linking,
  resource, and shadow controls;
- Character Studio, Material Spheres, Interior Room, Outdoor Vista, and
  Many-Lights Stress stages;
- time-of-day preview that moves a tagged sun and adjusts stage sky/exposure;
- backend and quality selection with explicit capability/fallback reporting;
- live total/active/culled/shadowed counts and budget warnings;
- final, unlit, influence, complexity, and shadow-camera debug modes;
- built-in luminaire/rig/look/quality presets plus locally saved recipes;
- JSON import, copy, download, local save, and deterministic re-open;
- ToonLab manifest copy/download with Many Lights and Dynamic GI intent shown
  separately.

The Many-Lights Stress stage is a workload and fallback test, not evidence of
a hidden Many Lights renderer. It should make culling, quality limits, shadow
allocation, and backend differences obvious.

## ToonLab export contract

`exportLightingRecipeToToonLab(recipe, options)` produces a JSON-safe
interchange manifest. It does **not** write native project files, launch a
host editor, change project settings, compile shaders, or enable plugins.

```js
import {
  exportLightingRecipeToToonLab,
  serializeToonLabLightingManifest,
} from '@call-me-sensei/toonlab/lighting';

const manifest = exportLightingRecipeToToonLab(look.recipe, {
  manyLights: 'prefer', // 'disabled' | 'prefer' | 'require'
  globalIllumination: 'prefer',      // covers ToonLab GI and reflection intent
  worldScale: 100,      // Three meters -> ToonLab centimeters
});

const json = serializeToonLabLightingManifest(manifest, { pretty: true });
```

The manifest is an adapter contract with:

```js
{
  type: 'toonlab/lighting-manifest',
  schemaVersion: 1,
  platform: { name: 'ToonLab' },
  coordinateSystem: {
    sourceUnits: 'meters',
    worldScale: 100,
    mapping: 'ToonLabXYZcm = [-ThreeZ, ThreeX, ThreeY] * worldScale',
  },
  rendererIntent: {
    manyLights: {
      implementation: 'toonlab-native',
      intent: 'prefer',
      scope: 'eligible local direct lights',
    },
    globalIllumination: {
      intent: 'prefer',
      scope: 'global illumination and reflections',
    },
  },
  source: {
    recipeId: 'shrine-evening',
    recipeSchemaVersion: 1,
    shadowPolicy: { /* copied portable policy */ },
  },
  lights: [ /* class, transform, photometry, shape, shadow, resources */ ],
  warnings: [],
}
```

Expected semantic mappings are:

| ToonLab intent | ToonLab adapter target |
|---|---|
| `directional` | Directional Light actor/component |
| `point` | Point Light actor/component |
| `spot` | Spot Light actor/component |
| `rectArea` | Rect Light actor/component |
| `discArea`, `tubeArea` | Best available source-shape mapping or an explicit approximation warning |
| `hemisphere` | Sky/ambient environment intent, not a forced local-light actor |
| `cookie` | Project light-function/material reference |
| `ies` | Project IES texture/profile reference |
| `linking` | Lighting Channels, tags, or project-defined receiver mapping |
| `shadow` | Cast-shadow, map-size, bias, and priority intent |

The ToonLab-side importer owns exact class/property names, coordinate
conversion, asset lookup, project settings, platform checks, and actor
creation. It must return unresolved resource keys and unsupported mappings to
the user instead of guessing.

Many Lights applies to eligible local direct lighting and shadows. Dynamic GI applies
to indirect lighting and reflections. Requesting both in a manifest is valid
because they fill different roles. An intent of `prefer` lets an importer
select a safe project fallback; `require` asks it to fail when the project,
renderer, platform, material path, or light type cannot honor the request.

## Migrating environment presets

Existing `toonlab/environment-preset` documents remain supported. Migration
is additive: keep their shader features/parameters and move only scene-light
and orchestration intent into a lighting look.

| Environment preset field | Lighting destination |
|---|---|
| `features`, `parameters` | `look.environment.environmentShader`; continue applying through `applyEnvironmentShader` |
| `rig.sun` | A directional descriptor, or keep the existing `createEnvironmentSunRig` during gradual migration |
| `rig.lampIntensity` | Multiplier on migrated practical/luminaire descriptors |
| `rig.spotShadows` | Local-light `castShadow` plus `shadow.enabled` |
| `rig.timeOfDayHour` | `look.environment.timeOfDayHour` |
| `rig.probe` | Ambient-probe integration request |
| `rig.planarReflection` | Reflection integration request, not a light descriptor |
| `rig.dustMotes` | Environment/VFX integration request, not a light descriptor |
| `rig.bakeVertexAo` | Environment baking request, not runtime direct lighting |

Example migration without destroying the original preset:

```js
import {
  resolveEnvironmentPreset,
} from '@call-me-sensei/toonlab/environment';
import {
  createLightDescriptor,
  createLightingLook,
  createLightingRecipe,
} from '@call-me-sensei/toonlab/lighting';

const legacy = resolveEnvironmentPreset('interiorEvening');

const migrated = createLightingLook({
  id: 'interior-evening-v1',
  name: 'Interior Evening',
  recipe: createLightingRecipe({
    id: 'interior-evening-lights',
    lights: legacy.rig.sun ? [
      createLightDescriptor('directional', {
        id: 'sun',
        position: [24, 32, 42],
        target: [0, 0, 0],
        intensity: { value: 1, unit: 'lux' },
        castShadow: true,
        shadow: { enabled: true, mapSize: 2048, priority: 100 },
      }),
    ] : [],
    metadata: { migratedFrom: 'environment:interiorEvening' },
  }),
  environment: {
    environmentShader: {
      features: legacy.features,
      parameters: legacy.parameters,
    },
    timeOfDayHour: legacy.rig.timeOfDayHour,
    ambientProbe: Boolean(legacy.rig.probe),
    planarReflection: Boolean(legacy.rig.planarReflection),
    dustMotes: Boolean(legacy.rig.dustMotes),
    bakeVertexAo: legacy.rig.bakeVertexAo,
  },
});
```

An old environment preset does not contain lamp positions, fixture identities,
physical units, or complete shadow budgets. A migration tool must therefore
report those as authoring tasks; it must not invent a room layout. Existing
`createEnvironmentSunRig`/`createEnvironmentLampRig` integrations can remain
in place while a project gradually replaces their scalar rig hints with
descriptors.

## Integration assumptions

- One world unit is one meter; Three.js uses a right-handed, Y-up world.
- Directional, spot, and area orientation is authored with world-space
  `position` and `target`; adapters derive and convert their own direction.
- The host owns `renderer`, `scene`, `camera`, render order, and tone mapping.
  Call `lighting.update(...)` before the scene or post pipeline renders.
- Physical units are meaningful only when the host keeps a coherent exposure,
  color-management, distance, and renderer-lighting setup. Artistic scalar
  intensity remains available for stylized workflows.
- The portable manager creates ordinary Three.js lights and applies documented
  approximations. It does not patch engine internals or promise that every
  material consumes every Three.js light.
- ToonLab environment, character, water, vegetation, sky, weather, and post
  modules remain independent consumers. A look coordinator binds their shared
  sun direction, color, exposure, fog, reflections, and weather state.
- Asset references are resolved by the host. Core validation and ToonLab export
  perform no network access.
- ToonLab export is intentionally semantic and one-way. Reimport/merge policy,
  actor ownership, transactions, source control, and project mutation belong
  to an ToonLab Editor plugin or project tool.

These assumptions are part of the portability contract. When a target cannot
honor one, it should produce a capability or export diagnostic rather than a
visually different silent default.
