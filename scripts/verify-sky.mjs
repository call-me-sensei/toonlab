import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  DEFAULT_SKY_SCENARIO,
  DEFAULT_SKY_SETTINGS,
  SKY_PRESET_ALIASES,
  SKY_PRESET_DOCUMENT_TYPE,
  SKY_QUALITY_TIERS,
  SKY_SCENE_OVERRIDE_PRIORITIES,
  SKY_SETTING_FIELD_SCHEMA,
  StylizedSky,
  applySkySettingsToMaterial,
  createSkyMaterial,
  createSkyPresetDocument,
  createSkySettings,
  getSkyPresetOptions,
  getSkyScenarioOptions,
  parseSkyPresetDocument,
  resolveSkyQuality,
  serializeSkyPreset,
  validateSkyPresetDocument,
} from '../src/sky/stylizedSky.js';
import {
  DEMOS_SHOWCASE,
  WORLD_SYSTEMS_SHOWCASE,
} from '../labs/home/labsShowcase.js';
import { SKY_PRESET_STORAGE_KEY } from '../labs/sky-lab/skyPresetStore.js';
import {
  createSkyLabStore,
  SKY_LAB_DOCUMENT_STORAGE_KEY,
  SKY_LAB_PRESET_QUERY_PARAM,
} from '../labs/sky-lab/ui/store.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const readRepositoryFile = (path) => readFileSync(new URL(path, `file://${repositoryRoot}`), 'utf8');

assert.deepEqual(
  createSkySettings(),
  DEFAULT_SKY_SETTINGS,
  'The public default normalizer must remain identical to the documented defaults.',
);

const portableSkyFields = Object.values(SKY_SETTING_FIELD_SCHEMA)
  .flatMap((fields) => Object.values(fields))
  .filter((field) => field.serializable);
assert.equal(portableSkyFields.length, 46, 'Sky portable-field contract changed unexpectedly.');

function uniformNameForKey(key) {
  return `u${key[0].toUpperCase()}${key.slice(1)}`;
}

function alternateValue(field) {
  if (field.type === 'color') return [0.17, 0.31, 0.47];
  if (field.type === 'vector2') return [-0.6, 0.8];
  if (field.type === 'vector3') return [0.2, 0.8, -0.4];
  const { max, min } = field.range ?? { max: 1, min: 0 };
  const midpoint = (Number(min) + Number(max)) / 2;
  return Math.abs(midpoint - Number(field.defaultValue)) > 1e-6 ? midpoint : Number(max);
}

function assertApproxArray(actual, expected, message) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, index) => assert.ok(
    Math.abs(value - expected[index]) < 1e-6,
    `${message}: channel ${index} expected ${expected[index]}, got ${value}`,
  ));
}

const skyShaderSource = readRepositoryFile('src/shaders-tsl/sky.js');
const contractMaterial = createSkyMaterial();
for (const field of portableSkyFields) {
  const uniformName = uniformNameForKey(field.key);
  assert.ok(contractMaterial.uniforms[uniformName], `Missing Sky uniform ${uniformName}.`);
  assert.ok(
    skyShaderSource.includes(`${uniformName}: uniform`)
      && skyShaderSource.includes(`uniforms.${uniformName}`),
    `${uniformName} must be declared and consumed by the TSL graph.`,
  );
  const input = alternateValue(field);
  const expected = createSkySettings({ [field.key]: input })[field.key];
  applySkySettingsToMaterial(contractMaterial, { [field.key]: input });
  const actual = contractMaterial.uniforms[uniformName].value;
  if (field.type === 'color') {
    const color = new THREE.Color().setRGB(...expected, THREE.SRGBColorSpace);
    assertApproxArray(actual.toArray(), color.toArray(), uniformName);
  } else if (field.type === 'vector2') {
    assertApproxArray(actual.toArray(), expected, uniformName);
  } else if (field.type === 'vector3') {
    const vector = new THREE.Vector3(...expected).normalize();
    assertApproxArray(actual.toArray(), vector.toArray(), uniformName);
  } else {
    assert.ok(Math.abs(actual - expected) < 1e-6, `${uniformName} did not receive its setting.`);
  }
}
contractMaterial.dispose();

const switchMaterial = createSkyMaterial({ preset: 'clear_day' });
applySkySettingsToMaterial(switchMaterial, { preset: 'moonlit' });
assert.equal(switchMaterial.userData.skySettings.starsStrength, createSkySettings('moonlit').starsStrength,
  'An explicit material preset must replace the previous complete look.');
switchMaterial.dispose();

const partialMaterial = createSkyMaterial({ preset: 'moonlit' });
const moonlitZenith = [...partialMaterial.userData.skySettings.zenithColor];
applySkySettingsToMaterial(partialMaterial, { starsStrength: 1.2 });
assert.deepEqual(
  partialMaterial.userData.skySettings.zenithColor,
  moonlitZenith,
  'Low-level partial material updates must preserve the active look.',
);
assert.equal(partialMaterial.userData.skySettings.starsStrength, 1.2);
partialMaterial.dispose();

// Portable schema: canonical round trip and construction-only radius removal.
const canonical = createSkyPresetDocument('verify_sky', {
  label: 'Verify Sky',
  settings: { cloudCoverage: 0.63, radius: 777 },
});
assert.equal(canonical.type, SKY_PRESET_DOCUMENT_TYPE);
assert.equal(canonical.settings.cloudCoverage, 0.63);
assert.equal(canonical.settings.radius, undefined, 'Dome radius must not enter a portable preset.');

const radiusValidation = validateSkyPresetDocument({
  id: 'radius_check',
  label: 'Radius Check',
  settings: { radius: 222 },
  type: SKY_PRESET_DOCUMENT_TYPE,
  version: 1,
});
assert.equal(radiusValidation.ok, true);
assert.equal(radiusValidation.value.settings.radius, undefined);
assert.ok(
  radiusValidation.warnings.some((warning) => warning.includes('construction-only')),
  'Importing radius should explain why it was omitted.',
);

const serialized = serializeSkyPreset(canonical);
const parsed = parseSkyPresetDocument(serialized);
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.value, canonical);

const wrongType = parseSkyPresetDocument({
  ...canonical,
  type: 'toonlab/grass-preset',
});
assert.equal(wrongType.ok, false, 'An explicitly different document type must not be retagged as Sky.');
assert.match(wrongType.errors.join(' '), /Sky preset type/);

assert.deepEqual(
  {
    cloudCoverage: createSkySettings({ cloudCoverage: 7 }).cloudCoverage,
    cloudSeed: createSkySettings({ cloudSeed: 4.7 }).cloudSeed,
    cloudScale: createSkySettings({ cloudScale: -1 }).cloudScale,
    cloudSpeed: createSkySettings({ cloudSpeed: -4 }).cloudSpeed,
    horizonScattering: createSkySettings({ horizonScattering: 9 }).horizonScattering,
    starsStrength: createSkySettings({ starsStrength: -3 }).starsStrength,
    starsSeed: createSkySettings({ starsSeed: 9.2 }).starsSeed,
    sunGlowStrength: createSkySettings({ sunGlowStrength: 99 }).sunGlowStrength,
    sunSize: createSkySettings({ sunSize: -5 }).sunSize,
  },
  {
    cloudCoverage: 1,
    cloudSeed: 5,
    cloudScale: 0.1,
    cloudSpeed: 0,
    horizonScattering: 1,
    starsStrength: 0,
    starsSeed: 9,
    sunGlowStrength: 4,
    sunSize: 0,
  },
  'Runtime normalization must enforce the public schema ranges.',
);

const layeredSky = new StylizedSky({ preset: 'golden_hour' });
const authoredCloudCoverage = layeredSky.settings.cloudCoverage;
const authoredZenith = [...layeredSky.settings.zenithColor];
const lightingLayer = Symbol('lighting-test');
const weatherLayer = Symbol('weather-test');
layeredSky.setSceneOverrideLayer(lightingLayer, { zenithColor: [0.2, 0.4, 0.8] }, {
  priority: SKY_SCENE_OVERRIDE_PRIORITIES.lighting,
});
layeredSky.setSceneOverrideLayer(weatherLayer, (base) => ({
  cloudCoverage: 0.91,
  cloudSpeed: 2.4,
  zenithColor: base.zenithColor.map((channel) => channel * 0.5),
}), { priority: SKY_SCENE_OVERRIDE_PRIORITIES.weather });
assert.equal(layeredSky.settings.cloudCoverage, authoredCloudCoverage);
assert.equal(layeredSky.renderedSettings.cloudCoverage, 0.91);
assert.equal(layeredSky.sceneOverrides.cloudSpeed, 2.4);
assert.deepEqual(layeredSky.renderedSettings.zenithColor, [0.1, 0.2, 0.4],
  'Weather must derive from the lower-priority Lighting result.');
layeredSky.setSceneOverrideLayer(lightingLayer, { zenithColor: [0.6, 0.4, 0.2] }, {
  priority: SKY_SCENE_OVERRIDE_PRIORITIES.lighting,
});
assert.deepEqual(layeredSky.renderedSettings.zenithColor, [0.3, 0.2, 0.1],
  'Updating Lighting must automatically recompose the active Weather resolver.');
layeredSky.setSceneOverrides({ cloudCoverage: 0.12 });
assert.equal(layeredSky.renderedSettings.cloudCoverage, 0.12);
layeredSky.clearSceneOverrides();
assert.equal(layeredSky.renderedSettings.cloudCoverage, 0.91,
  'Clearing manual scene input must leave Weather and Lighting owners active.');
layeredSky.clearSceneOverrideLayer(weatherLayer);
assert.deepEqual(layeredSky.renderedSettings.zenithColor, [0.6, 0.4, 0.2]);
assert.deepEqual(layeredSky.settings.zenithColor, authoredZenith,
  'Removing runtime owners must never rewrite the authored baseline.');
layeredSky.applySettings({ horizonColor: [0.22, 0.33, 0.44] });
assert.deepEqual(layeredSky.settings.horizonColor, [0.22, 0.33, 0.44]);
assert.deepEqual(layeredSky.renderedSettings.zenithColor, [0.6, 0.4, 0.2],
  'Authored edits must recompose beneath active runtime layers.');
layeredSky.setSceneOverrideLayer('radius-test', { radius: 999 }, { priority: 250 });
assert.equal(layeredSky.renderedSettings.radius, layeredSky.settings.radius,
  'Runtime layers cannot replace construction-owned dome radius.');
layeredSky.setPreset('moonlit', { starsStrength: 0.73 });
assert.equal(layeredSky.settings.starsStrength, 0.73);
assert.deepEqual(layeredSky.settings.zenithColor, createSkySettings('moonlit').zenithColor,
  'setPreset must replace the authored baseline instead of merging over the previous look.');
layeredSky.clearAllSceneOverrideLayers();
assert.equal(layeredSky.renderedSettings.cloudCoverage, layeredSky.settings.cloudCoverage);
assert.deepEqual(layeredSky.sceneOverrides, {});

assert.equal(SKY_QUALITY_TIERS.low.cloudOctaves, 2);
assert.equal(SKY_QUALITY_TIERS.medium.cloudOctaves, 3);
assert.equal(SKY_QUALITY_TIERS.high.cloudOctaves, 4);
assert.equal(resolveSkyQuality({ cloudOctaves: 99 }).cloudOctaves, 5);
const elapsedBeforeQualityChange = 3.25;
const authoredZenithBeforeQualityChange = [...layeredSky.settings.zenithColor];
layeredSky.material.uniforms.uTime.value = elapsedBeforeQualityChange;
layeredSky.setQuality('low');
assert.equal(layeredSky.quality.id, 'low');
assert.equal(layeredSky.material.userData.skyQuality.cloudOctaves, 2);
assert.equal(layeredSky.material.uniforms.uTime.value, elapsedBeforeQualityChange);
assert.deepEqual(layeredSky.settings.zenithColor, authoredZenithBeforeQualityChange,
  'Deployment quality changes must not enter the authored preset.');
layeredSky.dispose();

// Preset = style, scenario = moment. Every built-in style must resolve
// distinctly in every canonical scenario — a style with only a daytime sky
// is the exact conflation this contract exists to prevent.
const styleOptions = getSkyPresetOptions();
const builtInIds = new Set(styleOptions.map((entry) => entry.id));
for (const id of ['default', 'call_me_sensei']) {
  assert.ok(builtInIds.has(id), `Missing built-in sky style: ${id}`);
}
const scenarioIds = getSkyScenarioOptions().map((entry) => entry.id);
assert.equal(DEFAULT_SKY_SCENARIO, 'clear_day');
assert.deepEqual(scenarioIds, ['clear_day', 'golden_hour', 'overcast', 'moonlit']);
for (const style of styleOptions) {
  assert.deepEqual(
    Object.keys(style.scenarios),
    scenarioIds,
    `Sky style ${style.id} must report coverage for every scenario.`,
  );
  const looks = new Set(scenarioIds.map((scenario) => {
    const { radius: _radius, ...settings } = createSkySettings({ preset: style.id, scenario });
    return JSON.stringify(settings);
  }));
  assert.equal(looks.size, scenarioIds.length,
    `Sky style ${style.id} must render distinctly in every scenario.`);
}
assert.deepEqual(
  Object.keys(styleOptions.find((entry) => entry.id === 'call_me_sensei').scenarios)
    .filter((id) => styleOptions.find((entry) => entry.id === 'call_me_sensei').scenarios[id] === 'authored'),
  scenarioIds,
  'The signature style must author every scenario itself, not inherit any.',
);

// Legacy flat ids resolve as the Default style at that scenario, and stay
// byte-identical to the historical single-look presets.
for (const [legacyId, alias] of Object.entries(SKY_PRESET_ALIASES)) {
  assert.deepEqual(
    createSkySettings({ preset: legacyId }),
    createSkySettings({ preset: alias.preset, scenario: alias.scenario }),
    `Legacy sky preset ${legacyId} must alias ${alias.preset}/${alias.scenario}.`,
  );
}
const distinctLooks = new Set(['clear_day', 'golden_hour', 'overcast', 'moonlit'].map((id) => {
  const { radius: _radius, ...settings } = createSkySettings({ preset: id });
  return JSON.stringify(settings);
}));
assert.equal(distinctLooks.size, 4, 'Canonical scenario renditions must remain visually distinct.');

// Scenario selection composes with the layer system exactly like presets.
const scenarioSky = new StylizedSky({ style: 'call_me_sensei', scenario: 'moonlit' });
assert.ok(scenarioSky.settings.starsStrength > 1, 'Signature night must actually be night.');
assert.equal(scenarioSky.style, 'call_me_sensei');
assert.equal(scenarioSky.scenario, 'moonlit');
scenarioSky.applySettings({ scenario: 'golden_hour' });
assert.ok(scenarioSky.settings.sunDirection[1] < 0.3,
  'Switching scenario alone must re-resolve the current style rendition.');
assert.equal(scenarioSky.style, 'call_me_sensei',
  'Switching scenarios must retain the IP-wide style identity.');
assert.equal(scenarioSky.scenario, 'golden_hour');
assert.deepEqual(
  scenarioSky.settings,
  createSkySettings({ style: 'call_me_sensei', scenario: 'golden_hour' }),
  'Scenario changes must resolve within the active style, never fall back to Default.',
);
scenarioSky.setStyle('default');
assert.equal(scenarioSky.scenario, 'golden_hour',
  'Switching styles must retain the active runtime scenario.');
scenarioSky.dispose();

// Lab scope: preview fixtures do not mutate, autosave, or export the preset.
const localValues = new Map();
globalThis.window = {
  location: { search: '' },
  localStorage: {
    getItem: (key) => localValues.get(key) ?? null,
    removeItem: (key) => localValues.delete(key),
    setItem: (key, value) => localValues.set(key, String(value)),
  },
};
assert.equal(SKY_PRESET_STORAGE_KEY, 'toonlab.skyPresets.v1');
assert.equal(SKY_LAB_DOCUMENT_STORAGE_KEY, 'toonlab.skyLab.document.v1');
assert.equal(SKY_LAB_PRESET_QUERY_PARAM, 'skyPreset');

const store = createSkyLabStore({ urlParams: new URLSearchParams() });
assert.equal(store.getState().settings.radius, undefined);
const initialRevision = store.getState().docRevision;
assert.equal(store.getState().view.quality, 'high');
store.actions.setView({ sunIntensity: 1.8, weather: 'rain' });
assert.equal(store.getState().docRevision, initialRevision);
assert.equal(store.getState().presetDirty, false);
assert.equal(localValues.has(SKY_LAB_DOCUMENT_STORAGE_KEY), false);
store.actions.setView({ quality: 'low' });
assert.equal(store.getState().docRevision, initialRevision);

store.actions.setSetting('cloudCoverage', 0.71);
const draft = JSON.parse(localValues.get(SKY_LAB_DOCUMENT_STORAGE_KEY));
const exported = JSON.parse(store.actions.exportDocument());
assert.equal(draft.settings.radius, undefined);
assert.equal(exported.type, SKY_PRESET_DOCUMENT_TYPE);
assert.equal(exported.settings.radius, undefined);
assert.equal(exported.settings.cloudCoverage, 0.71);

// Explicit launch links must win over a prior draft (the Pro hydration path).
const linkedStore = createSkyLabStore({
  urlParams: new URLSearchParams('skyPreset=moonlit'),
});
assert.equal(linkedStore.getState().presetId, 'moonlit');
assert.equal(linkedStore.getState().scenarioId, 'moonlit',
  'Legacy single-look links must land on their aliased scenario.');
assert.equal(linkedStore.getState().settings.starsStrength, 1.1);

// Style × scenario are independent axes in the lab.
const scenarioStore = createSkyLabStore({
  urlParams: new URLSearchParams('skyPreset=call_me_sensei&skyScenario=moonlit'),
});
assert.equal(scenarioStore.getState().presetId, 'call_me_sensei');
assert.equal(scenarioStore.getState().scenarioId, 'moonlit');
assert.ok(scenarioStore.getState().settings.starsStrength > 1);
scenarioStore.actions.setScenario('golden_hour');
assert.equal(scenarioStore.getState().presetId, 'call_me_sensei',
  'Changing scenario must keep the current style.');
assert.equal(scenarioStore.getState().scenarioId, 'golden_hour');
assert.ok(scenarioStore.getState().settings.sunDirection[1] < 0.3);

// Catalog and standalone-route wiring.
const skyIndex = WORLD_SYSTEMS_SHOWCASE.findIndex((entry) => entry.id === 'sky');
const waterIndex = WORLD_SYSTEMS_SHOWCASE.findIndex((entry) => entry.id === 'water');
assert.ok(skyIndex >= 0 && skyIndex < waterIndex, 'Sky Lab should precede Water Lab under World Systems.');
assert.equal(WORLD_SYSTEMS_SHOWCASE[skyIndex].href, '/sky-lab/');
assert.equal(WORLD_SYSTEMS_SHOWCASE[skyIndex].i, '10');
assert.equal(WORLD_SYSTEMS_SHOWCASE[waterIndex].i, '11');
assert.equal(DEMOS_SHOWCASE[0].i, '12');

assert.match(readRepositoryFile('sky-lab/index.html'), /labs\/sky-lab\/ui\/main\.jsx/);
assert.match(readRepositoryFile('vite.config.js'), /skyLab:\s*resolve\(__dirname, 'sky-lab\/index\.html'\)/);
assert.match(readRepositoryFile('labs/shared/sceneHub.js'), /id:\s*'skyLab'[\s\S]*path:\s*'\/sky-lab\/'/);
assert.match(readRepositoryFile('index.html'), /Eleven authoring labs and six playable demos/);
assert.match(
  readRepositoryFile('labs/sky-lab/ui/App.jsx'),
  /complete reusable sky-system preset/,
);

console.log('Sky preset and Sky Lab verification passed.');
