// Character-tab HUD wiring for the playground: toon preset / debug / hair
// selects plus the schema-generated Toon Settings panel, applied live to the
// controller character — the same controls (same ids, same markup, same
// library APIs) as the Shader Lab's Character tab.
import {
  applyToonSettingsToMaterial,
  createToonSettings,
  getToonPresetOptions,
  normalizeToonPresetName,
  setToonDebugOutput,
  TOON_SETTING_FIELD_SCHEMA,
  TOON_SETTING_GROUPS,
} from '../../src/toon/toonMaterialAdapter.js';
import { createSettingsPanel, readFieldValueFromSettings } from '../../src/debug/index.js';
import { setLabParams } from '../shared/labParams.js';
import { URL_PARAMS } from './params.js';

const HAIR_HIGHLIGHT_MODE_LABELS = Object.freeze({
  anisotropic: 'Strand Highlight',
  legacy: 'Soft Highlight',
});

function normalizeHairHighlightMode(value) {
  return value === 'anisotropic' ? 'anisotropic' : 'legacy';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function setHudSelect(id, value, label) {
  const select = document.getElementById(id);
  if (select) select.value = value;
  const output = document.getElementById(`${id}Value`);
  if (output) {
    output.value = label ?? value;
    output.textContent = label ?? value;
  }
}

// Mounts the Character tab against a freshly toon-converted model root.
// `initialSettings` is the settings object applyToonShader returned, so the
// panel starts from exactly what is on screen. Returns an unmount function.
export function mountCharacterToonHud({ modelRoot, initialSettings = null }) {
  const container = document.getElementById('toonSettingGroups');
  if (!modelRoot || !container || container.childElementCount > 0) return () => {};

  let draftSource = cloneJson(initialSettings ?? { preset: URL_PARAMS.get('toonPreset') || undefined });
  let toonSettings = createToonSettings(draftSource);
  let panelSettings = toonSettings;
  let settingsPanel = null;

  const applyDraft = () => {
    toonSettings = createToonSettings(draftSource);
    panelSettings = toonSettings;
    applyToonSettingsToMaterial(modelRoot, toonSettings);
    document.body.dataset.toonPreset = toonSettings.preset;
    document.body.dataset.toonPresetLabel = toonSettings.presetLabel;
  };

  const setDraftField = (groupId, key, value) => {
    draftSource = cloneJson(draftSource);
    draftSource[groupId] = { ...(draftSource[groupId] ?? {}), [key]: value };
    applyDraft();
  };

  // Preset select — same behavior as the Shader Lab: presets apply at
  // conversion, so selecting one reloads the scene with ?toonPreset=.
  const presetSelect = document.getElementById('toonPreset');
  if (presetSelect) {
    presetSelect.replaceChildren();
    for (const option of getToonPresetOptions()) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option.label;
      element.title = option.description;
      presetSelect.append(element);
    }
    setHudSelect('toonPreset', toonSettings.preset, toonSettings.presetLabel);
    presetSelect.addEventListener('change', () => {
      const next = normalizeToonPresetName(presetSelect.value);
      if (next !== toonSettings.preset) setLabParams({ toonPreset: next === 'default' ? null : next });
    });
  }

  // Debug view — live, no reload.
  const debugSelect = document.getElementById('toonDebug');
  const applyDebugMode = (mode) => {
    const debugMode = setToonDebugOutput(modelRoot, mode);
    document.body.dataset.toonDebugMode = debugMode.name;
    document.body.dataset.toonDebugValue = String(debugMode.value);
    setHudSelect('toonDebug', debugMode.name, debugMode.label);
    return debugMode;
  };
  const initialDebug = URL_PARAMS.get('toonDebug') || 'off';
  // Always write the resolved mode, including `off`. Character materials can
  // survive a lab-parameter update/HMR cycle, so only writing non-off modes
  // lets a previous shadow diagnostic leak into the walkable showcase after
  // the `toonDebug` query parameter has been removed.
  applyDebugMode(initialDebug);
  debugSelect?.addEventListener('change', () => {
    const debugMode = applyDebugMode(debugSelect.value);
    setLabParams({ toonDebug: debugMode.name === 'off' ? null : debugMode.name }, { navigate: false });
  });

  // Hair highlight mode — live via the hairHighlight settings group.
  const hairSelect = document.getElementById('hairHighlightMode');
  const initialHair = normalizeHairHighlightMode(toonSettings.hairHighlight?.mode);
  setHudSelect('hairHighlightMode', initialHair, HAIR_HIGHLIGHT_MODE_LABELS[initialHair]);
  document.body.dataset.hairHighlightMode = initialHair;
  hairSelect?.addEventListener('change', () => {
    const mode = normalizeHairHighlightMode(hairSelect.value);
    setDraftField('hairHighlight', 'mode', mode);
    settingsPanel?.refresh();
    setHudSelect('hairHighlightMode', mode, HAIR_HIGHLIGHT_MODE_LABELS[mode]);
    document.body.dataset.hairHighlightMode = mode;
  });

  settingsPanel = createSettingsPanel({
    container,
    dataAttribute: 'toonField',
    fieldFilter: (field) => field.serializable,
    fieldSchema: TOON_SETTING_FIELD_SCHEMA,
    getValue: (field) => readFieldValueFromSettings(panelSettings, field),
    groups: TOON_SETTING_GROUPS,
    idPrefix: 'toonSetting',
    onChange: (field, value) => {
      setDraftField(field.group, field.key, value);
      if (field.group === 'hairHighlight' && field.key === 'mode') {
        const mode = normalizeHairHighlightMode(value);
        setHudSelect('hairHighlightMode', mode, HAIR_HIGHLIGHT_MODE_LABELS[mode]);
        document.body.dataset.hairHighlightMode = mode;
      }
    },
    rowClassName: 'hud-control toon-field-control',
  });

  return () => {
    // The character root may be reused by the next scene mount. Leave it in
    // production rendering mode rather than carrying a diagnostic uniform
    // across scenes or screenshot runs.
    setToonDebugOutput(modelRoot, 'off');
    container.replaceChildren();
    settingsPanel = null;
  };
}
