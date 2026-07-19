import assert from 'node:assert/strict';

import {
  DEFAULT_GRASS_SETTINGS,
  GRASS_COLOR_PALETTES,
  applyGrassColorPalette,
  createGrassSettings,
  getGrassPresetOptions,
  matchGrassColorPalette,
  parseGrassPresetDocument,
  registerGrassPreset,
  resolveGrassColorPalette,
} from '../src/vegetation/stylizedGrass.js';

assert.ok(GRASS_COLOR_PALETTES.length >= 8, 'grass must ship a useful palette range');
assert.equal(new Set(GRASS_COLOR_PALETTES.map((entry) => entry.id)).size,
  GRASS_COLOR_PALETTES.length, 'grass palette ids must be unique');

for (const palette of GRASS_COLOR_PALETTES) {
  assert.ok(palette.id && palette.label && palette.description,
    'every grass palette needs stable identity and user-facing copy');
  for (const key of ['baseColor', 'tipColor', 'shadowTint']) {
    assert.equal(palette[key].length, 3, `${palette.id}.${key} must be an RGB triplet`);
    assert.ok(palette[key].every((channel) => Number.isFinite(channel)
      && channel >= 0 && channel <= 1), `${palette.id}.${key} must contain sRGB channels`);
  }
}

const defaults = createGrassSettings();
assert.equal(matchGrassColorPalette(defaults)?.id, 'sensei_meadow',
  'the studio-default grass colors should identify the matching palette');

const original = createGrassSettings({
  cloudShadowStrength: 0.73,
  shadowStrength: 0.41,
  windResponse: 1.6,
  windStrength: 0.27,
});
const palette = resolveGrassColorPalette('wisteria');
assert.ok(palette, 'the fantasy purple palette must resolve');
const painted = createGrassSettings(applyGrassColorPalette(original, palette));
assert.equal(matchGrassColorPalette(painted)?.id, palette.id);
assert.deepEqual(painted.baseColor, [...palette.baseColor]);
assert.deepEqual(painted.tipColor, [...palette.tipColor]);
assert.deepEqual(painted.shadowTint, [...palette.shadowTint]);
assert.equal(painted.shadowStrength, original.shadowStrength,
  'a color palette must not change scene-shadow response');
assert.equal(painted.cloudShadowStrength, original.cloudShadowStrength,
  'a color palette must not change world cloud-shadow state');
assert.equal(painted.windResponse, original.windResponse,
  'a color palette must not change asset motion response');
assert.equal(painted.windStrength, original.windStrength,
  'a color palette helper must not change current world wind');
assert.notEqual(painted.baseColor, palette.baseColor, 'applied colors must be copied');

const customShadow = { ...painted, shadowTint: [...DEFAULT_GRASS_SETTINGS.shadowTint] };
assert.equal(matchGrassColorPalette(customShadow), null,
  'editing the shadow tone must clear a palette whose full trio no longer matches');
assert.throws(() => applyGrassColorPalette(original, 'missing-palette'), /Unknown grass color palette/);

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  },
  location: { search: '' },
};

const { createGrassLabStore } = await import('../labs/grass-lab/ui/store.js');
const sceneKeys = [
  'cloudShadowCoverage',
  'cloudShadowScale',
  'cloudShadowStrength',
  'cloudShadowVelocity',
  'gustFrequency',
  'gustSpeed',
  'pushRadius',
  'skyColor',
  'sunColor',
  'sunDirection',
  'windDirection',
  'windSpeed',
  'windStrength',
];

const lab = createGrassLabStore({ urlParams: new URLSearchParams() });
for (const key of sceneKeys) {
  assert.equal(key in lab.getState().settings, false,
    `Grass Lab document state must exclude current-scene ${key}`);
}

const revisionBeforeView = lab.getState().docRevision;
lab.actions.setView({
  cloudShadowStrength: 0.67,
  pushRadius: 1.8,
  windStrength: 0.41,
});
assert.equal(lab.getState().docRevision, revisionBeforeView,
  'preview weather/interaction must not create a document revision');
assert.equal(lab.getState().canUndo, false,
  'preview weather/interaction must not enter undo history');
assert.equal(storage.has('toonlab.grassLab.document.v1'), false,
  'preview weather/interaction must not create a saved draft');

lab.actions.setSetting('windResponse', 1.9);
const savedDraft = JSON.parse(storage.get('toonlab.grassLab.document.v1'));
assert.equal(savedDraft.settings.windResponse, 1.9);
assert.equal('view' in savedDraft, false);
for (const key of sceneKeys) assert.equal(key in savedDraft.settings, false);

const exported = parseGrassPresetDocument(lab.actions.exportDocument());
assert.equal(exported.ok, true, exported.errors.join(' '));
for (const key of sceneKeys) assert.equal(key in exported.value.settings, false);

lab.actions.undo();
assert.equal(lab.getState().settings.windResponse, DEFAULT_GRASS_SETTINGS.windResponse);
assert.equal(lab.getState().view.windStrength, 0.41,
  'undoing authored settings must not reset current scene wind');
assert.equal(lab.getState().view.cloudShadowStrength, 0.67,
  'undoing authored settings must not reset current cloud state');
assert.equal(lab.getState().view.pushRadius, 1.8,
  'undoing authored settings must not reset interaction state');

registerGrassPreset('deep_link_grass', {
  label: 'Deep Link Grass',
  settings: { windResponse: 2.4 },
});
const deepLinkedLab = createGrassLabStore({
  urlParams: new URLSearchParams('grassPreset=deep_link_grass'),
});
assert.equal(deepLinkedLab.getState().presetId, 'deep_link_grass');
assert.equal(deepLinkedLab.getState().settings.windResponse, 2.4,
  'an explicit grassPreset deep link must win over a saved draft');

const saved = deepLinkedLab.actions.savePresetAs('Local Alpine');
assert.equal(saved.ok, true);
const localId = deepLinkedLab.getState().presetId;
assert.equal(deepLinkedLab.getState().localPresets.filter((entry) => entry.id === localId).length, 1);
assert.equal(getGrassPresetOptions().filter((entry) => entry.id === localId).length, 1,
  'saved local presets must have one registry/picker identity');
deepLinkedLab.actions.deletePreset(localId);
assert.equal(deepLinkedLab.getState().localPresets.some((entry) => entry.id === localId), false);
assert.equal(getGrassPresetOptions().some((entry) => entry.id === localId), false,
  'deleting a local preset must unregister it from the picker');

console.log(`grass palette verifier passed (${GRASS_COLOR_PALETTES.length} coordinated palettes)`);
