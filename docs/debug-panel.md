# Debug panel

`@call-me-sensei/toonlab/debug` is an optional, DOM-dependent tuning GUI: it turns any
settings module's group/field schema into live controls. One call gives you
the same panel the labs use — ship it behind a debug flag, or not at all
(nothing else imports it).

The labs now expose one TSL renderer stack: native WebGPU by default and
`?renderer=webgl` for the WebGL2 fallback. The panel writes the same settings
surface on both backends.

## createSettingsPanel

```js
import { createSettingsPanel } from '@call-me-sensei/toonlab/debug';
import { readFieldValueFromSettings } from '@call-me-sensei/toonlab/debug';
import {
  TOON_SETTING_GROUPS,
  TOON_SETTING_FIELD_SCHEMA,
  applyToonSettingsToMaterial,
} from '@call-me-sensei/toonlab/toon';

const panel = createSettingsPanel({
  container: document.getElementById('toonSettingGroups'),
  groups: TOON_SETTING_GROUPS,
  fieldSchema: TOON_SETTING_FIELD_SCHEMA,
  getValue: (field) => readFieldValueFromSettings(settings, field),
  onChange: (field, value) => {
    settings[field.group][field.key] = value;
    applyToonSettingsToMaterial(characterRoot, settings);
  },
});

panel.refresh(); // re-pull every control value via getValue (e.g. after a preset switch)
```

(Inside this repo the labs import from `../../src/debug/...`.)

The panel renders one collapsible `<details>` group per schema group, with a
typed control per field — checkbox for `boolean`, `<select>` for `select`
(using the schema's `options`/`optionLabels`), color input for `color`,
range slider for `number` (using the schema's `range`), text input
otherwise — each with a label, tooltip description, and live `<output>`
readout.

The host owns the settings state: the panel only reads through `getValue`
and reports edits through `onChange`. It never mutates settings itself,
which is what makes it schema-generic.

### Options

Beyond the required five, `createSettingsPanel` accepts:

- `fieldFilter(field)` — hide fields (e.g. non-serializable texture slots).
- `isDisabled(field)` — gray controls out (re-evaluated on `refresh()`).
- `formatValue(value, field)` — custom `<output>` formatting.
- `isGroupOpen(group)` — which groups start expanded.
- `prepend` — DOM nodes to insert before the groups (preset pickers, etc.).
- `dataAttribute`, `idPrefix`, `rowClassName`, `groupClassName`,
  `fieldsClassName` — styling/data hooks.

### It works with every schema

Any module following the groups + field-schema convention plugs in — this is
the full list (see the generated
[settings reference](settings-reference.md) for their contents):

| Module | groups / fieldSchema |
|---|---|
| `@call-me-sensei/toonlab/toon` | `TOON_SETTING_GROUPS` / `TOON_SETTING_FIELD_SCHEMA` |
| `@call-me-sensei/toonlab/environment` | `ENVIRONMENT_SETTING_GROUPS` / `ENVIRONMENT_SETTING_FIELD_SCHEMA` |
| `@call-me-sensei/toonlab/water` | `WATER_SETTING_GROUPS` / `WATER_SETTING_FIELD_SCHEMA_BY_GROUP` |
| `@call-me-sensei/toonlab/post` | `POST_PROCESSING_SETTING_GROUPS` / `POST_PROCESSING_SETTING_FIELD_SCHEMA` |
| `@call-me-sensei/toonlab/vegetation` (grass) | `GRASS_SETTING_GROUPS` / `GRASS_SETTING_FIELD_SCHEMA` |
| `@call-me-sensei/toonlab/vegetation` (flowers) | `FLOWER_SETTING_GROUPS` / `FLOWER_SETTING_FIELD_SCHEMA` |
| `@call-me-sensei/toonlab/vegetation` (trees) | `STYLIZED_TREE_SETTING_GROUPS` / `STYLIZED_TREE_SETTING_FIELD_SCHEMA` |
| `@call-me-sensei/toonlab/sky` | `SKY_SETTING_GROUPS` / `SKY_SETTING_FIELD_SCHEMA` |

Note the value-read difference: toon/environment/post/tree settings are
nested (`settings[field.group][field.key]`), water/grass/flower/sky settings
are flat (`settings[field.key]`). `readFieldValueFromSettings` handles the
nested case; for flat settings pass
`getValue: (field) => settings[field.key]`.

## createSelectRow

A plain labeled `<select>` row for the controls that live alongside the
schema-generated groups (preset pickers, debug-view selectors):

```js
import { createSelectRow } from '@call-me-sensei/toonlab/debug';

const row = createSelectRow({
  id: 'toonPreset',
  label: 'Preset',
  options: getToonPresetOptions().map((p) => ({ value: p.id, label: p.label })),
  value: currentPreset,
  onChange: (value) => setLabParams({ toonPreset: value }),
});
panelHeader.append(row);
```

## Field value helpers (`fieldValues.js`)

The coercion layer between schema-typed values and DOM control values, used
by the panel and exported for custom UIs:

- `readFieldValueFromSettings(settings, field)` — nested group/key read.
- `readFieldValueFromControl(control, field)` — checkbox/range/color/select
  → typed value (colors become `[r, g, b]` arrays, numbers parse, etc.).
- `writeFieldControlValue(control, output, field, value)` — push a value
  into a control and its `<output>`.
- `formatFieldValue(value, field)` — display formatting.
- `colorToHex(value)` / `hexToColorArray(value)` — `[r, g, b]` ↔ `#rrggbb`.
- `vectorToArray(value)` — vector-ish → plain array.

## How the labs use it

Character Shader Lab and Environment Shader Lab consume their respective
schemas independently. Each lab's panel is a thin consumer that wires
`getValue`/`onChange` to its preset store and to
`applyToonSettingsToMaterial` or `applyEnvironmentSettingsToMaterial` for
live uniform-safe edits. Preset switching refreshes the controls from the
normalized package settings. The same schema-consumer pattern drives Water,
Sky, Grass, Tree, and Flower Labs; no lab keeps a private copy of its runtime
parameter contract.
