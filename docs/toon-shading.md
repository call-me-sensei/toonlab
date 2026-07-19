# Toon character shading

Modern anime character shading for any Three.js character. One call
converts a loaded model's materials into the toon shader; everything else is
settings.

The implementation is TSL/NodeMaterial-only after the WebGPU cutover. It runs
on native WebGPU by default and on the TSL WebGL2 fallback with
`?renderer=webgl`; the old GLSL material path has been removed.

```js
import { applyToonShader, createToonSettings } from '@call-me-sensei/toonlab/toon';

applyToonShader(characterRoot, {
  settings: createToonSettings({
    preset: 'default',
    skinTone: { skinShadowBrightness: 0.94 },
    rimLight: { hairIntensity: 0.2 },
  }),
});
```

(Inside this repo the labs import from `../../src/toon/...`.)

`applyToonShader(root, options)` traverses the model, classifies material
roles, converts materials in place, and adds the inverted-hull outline pass.
Settings groups can also be passed directly as options
(`applyToonShader(root, { rimLight: {...} })`). To re-tune an already
converted model at runtime, use
`applyToonSettingsToMaterial(target, settings)` — it applies uniform-safe
edits without reconversion (this is what the debug panel calls).

## Settings groups

`createToonSettings(options)` merges your overrides over a preset over the
defaults, and returns the full nested settings object. There are 23 groups
(`TOON_SETTING_GROUPS`), each with its own module under `src/toon/settings/`:

| Group | What it controls |
|---|---|
| `baseTexture` | Preserves source texture, source material color, and saturation policy before toon lighting. |
| `materialRoles` | Classifies materials as skin, face, hair, eyes, costume, metal, transparent overlays, and outline. |
| `alpha` | Cutout, blend, opacity, eye overlay sorting, and transparent decoration behavior. |
| `skinTone` | Keeps skin and face shadows warm, readable, and separate from costume/hair shadows. |
| `faceLighting` | Overrides face-area cel response so noses, cheeks, and eyes do not receive harsh body shadows. |
| `celShade` | The primary directional cel band threshold, softness, and light-ignore amount. |
| `shadowColor` | Tints and reshapes lit-to-shadow transitions and fully shadowed regions. |
| `sceneShadow` | How renderer shadow maps darken character materials. |
| `selfShadow` | Character-local self shadow (dedicated shadow pass or scene-proxy source). |
| `averageShadow` | Averaged shadow visibility for softer role-specific shadow damping. |
| `indirectLight` | Mixes ambient, hemisphere, and environment light into toon shading. |
| `localLights` | Point and spot light response without overpowering cel bands. |
| `rimLight` | View-dependent edge light; classic fresnel or screen-space depth-texture mode. |
| `contactShadow` | Thin screen-space contact shadows (hair-on-face, arm-on-torso) from the depth prepass. |
| `specular` | Role-aware stylized highlights and optional source specular masks. |
| `hairHighlight` | Hair-specific highlight bands, optional anisotropic strand response, and source masks. |
| `eyeHighlight` | Role-aware eye/catchlight boosts and optional source masks. |
| `materialMaps` | Routes source normal, AO, emissive, MatCap, ramp, detail, roughness, metalness, and specular-color maps. |
| `outline` | The inverted-hull outline pass, including role-specific widths and colors. |
| `glitter` | Procedural view-dependent sparkles for costumes/accessories. Off by default. |
| `sticker` | Blends a decal/overlay texture into the albedo before lighting. Off by default. |
| `perspectiveRemoval` | Flattens perspective around the tracked head for anime-portrait closeups. Off by default. |
| `fur` | Opt-in shell fur for matched materials (collars, trims, animal parts). Off by default. |

Every field (298 of them) is listed with type, default, and range in the
generated [settings reference](settings-reference.md). The same schema
(`TOON_SETTING_FIELD_SCHEMA`) drives the [debug panel](debug-panel.md), so
each field is also a live slider in the Character Shader Lab.

## Material roles

Materials are classified into roles before conversion — `default`,
`costume`, `skin`, `face`, `hair`, `eye`, `iris`, `pupil`, `sclera`,
`eyeHighlight`, `catchlight`, `blush`, `transparentOverlay`, `metal`,
`outline`. Roles decide which settings apply where (skin shadow tint, hair
highlights, outline widths, alpha behavior).

The default classifier is heuristic (names, textures, PMX conventions).
Override it without touching shader code:

```js
applyToonShader(characterRoot, {
  materialRoles: {
    byName: { Face: 'face', Hair: 'hair' },
    byUuid: { [material.uuid]: 'skin' },
    patterns: [{ pattern: /eye.*highlight/i, role: 'eyeHighlight' }],
  },
});
```

A source material can also declare `material.userData.toonRole`. Inspect the
resolved roles with `?toonDebug=role`, or programmatically via
`document.body.dataset.materialRoleSummary` in the labs.

## Presets and preset documents

Presets are named partial settings registered in a registry. Built-ins:
`default`, `call_me_sensei`, `showcase` (`TOON_PRESET_IDS`,
`getToonPresetOptions()`).

```js
import {
  registerToonPreset,
  serializeToonPreset,
  parseToonPresetDocument,
} from '@call-me-sensei/toonlab/toon';

// Register in code:
registerToonPreset('zzz_soft', {
  label: 'ZZZ Soft',
  description: 'Flatter urban anime lighting.',
  settings: { hairHighlight: { mode: 'anisotropic' } },
});

// Share as a versioned JSON document (same shape the Character Shader Lab exports):
const json = serializeToonPreset('warm_skin_test', {
  label: 'Warm Skin Test',
  settings: { skinTone: { skinShadowBrightness: 0.94 } },
});

// Load one back, with validation:
const result = parseToonPresetDocument(json);
if (result.ok) registerToonPreset(result.value.id, result.value, { overwrite: true });
```

Documents carry `{ type: 'toonlab/toon-preset', version, id,
label, description, settings }` and are validated field-by-field against the
schema (`validateToonPresetDocument`). Scalars, booleans, enums, colors, and
vectors serialize; runtime texture objects (mask maps) are intentionally
ignored by JSON validation — wire those in code. Related APIs:
`createToonPresetDocument`, `registerSerializedToonPreset`,
`sanitizeToonPresetSettings`, `getToonPresetDefinition`.

## Render passes

`applyToonShader` alone produces a complete material.
`createCharacterRenderPasses` adds the per-frame passes that unlock the
screen-space and shadow-map features:

```js
import { createCharacterRenderPasses } from '@call-me-sensei/toonlab/toon';

const passes = createCharacterRenderPasses({ renderer, scene, camera });
passes.registerCharacterRoot(modelRoot); // after applyToonShader

// in the render loop, before rendering:
passes.update();
```

The passes:

1. **Scene depth prepass** — feeds the depth-texture rim light mode and
   contact shadows.
2. **Character-only orthographic shadow map** — real self shadow
   (`selfShadow` group; direction follows the main light or a
   camera-relative art-directed angle).
3. **Head bone tracking** — head-space face shading
   (`faceLighting.headSpaceMode: 'headBone'`).
4. **Average shadow measurement** — per-character uniform scene shadow.
5. **Character mask** — character-aware bloom in the
   [post pipeline](post-processing.md).

Every pass is auto-gated: it only renders when at least one registered
material actually consumes its output, so leaving the passes running with
the features disabled costs almost nothing.

## Debug views

`?toonDebug=<mode>` in the labs, or `setToonDebugOutput(root, mode)` in
code, renders one shader term in isolation:

```text
sourceAlbedo | albedo | band | shadow | selfShadow | directVisibility |
contactShadow | rim | depthRim | specular | hairHighlight | eyeHighlight |
normalMap | aoMap | emissiveMap | matcap | ramp | detailMap | roughnessMap |
metalnessMap | shadowColor | lit | role | alpha
```

Typical tuning loop: `?toonDebug=band` while adjusting `celShade`,
`?toonDebug=shadowColor` for `shadowColor`, `?toonDebug=rim` for `rimLight`,
`?toonDebug=role` when a model misclassifies. The full mode map is
`TOON_DEBUG_OUTPUT_MODES` (aliases included); debug branches compile out
when off.
