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
  DEFAULT_SKY_SHADER_PRESET,
  SKY_SHADER_DOCUMENT_TYPE,
  SKY_SHADER_FIELD_COUNT,
  SKY_SHADER_FIELD_SCHEMA,
  SKY_SHADER_SETTING_GROUPS,
  applySkyShaderSettings,
  createSkyShaderPresetDocument,
  createSkyShaderSettings,
  parseSkyShaderPresetDocument,
  serializeSkyShaderPreset,
} from '../src/sky/skyShaderSettings.js';
import {
  DEMOS_SHOWCASE,
  LOOK_DEVELOPMENT_LABS_SHOWCASE,
} from '../labs/home/labsShowcase.js';
import { SKY_PRESET_STORAGE_KEY } from '../labs/sky-lab/skyPresetStore.js';
import {
  createSkyLabStore,
  SKY_LAB_DOCUMENT_STORAGE_KEY,
  SKY_LAB_PRESET_QUERY_PARAM,
  SKY_LAB_STYLE_QUERY_PARAM,
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
assert.equal(SKY_LAB_DOCUMENT_STORAGE_KEY, 'toonlab.skyShaderLab.document.v2');
assert.equal(SKY_LAB_PRESET_QUERY_PARAM, 'skyShader');
assert.equal(SKY_LAB_STYLE_QUERY_PARAM, 'skyStyle');
assert.equal(DEFAULT_SKY_SHADER_PRESET, 'call_me_sensei');
assert.equal(SKY_SHADER_DOCUMENT_TYPE, 'toonlab/sky-shader-preset');
assert.equal(SKY_SHADER_FIELD_COUNT, 40);
assert.deepEqual(
  SKY_SHADER_SETTING_GROUPS.map((group) => group.id),
  ['gradient', 'sun', 'moon', 'stars'],
);
assert.equal(
  Object.values(SKY_SHADER_FIELD_SCHEMA)
    .flatMap((fields) => Object.values(fields)).length,
  SKY_SHADER_FIELD_COUNT,
);

const store = createSkyLabStore({ urlParams: new URLSearchParams() });
assert.equal(store.getState().settings.radius, undefined);
assert.equal(store.getState().settings.cloudCoverage, undefined);
assert.equal(store.getState().settings.sunDirection, undefined);
const initialRevision = store.getState().docRevision;
assert.equal(store.getState().view.hour, 13);
assert.equal(store.getState().view.cloudStyle, 'call_me_sensei');
store.actions.setView({ cloudStyle: 'hidden', hour: 22, weather: 'rain' });
assert.equal(store.getState().docRevision, initialRevision);
assert.equal(store.getState().presetDirty, false);

store.actions.setSetting('atlasBrightness', 1.4);
const draft = JSON.parse(localValues.get(SKY_LAB_DOCUMENT_STORAGE_KEY));
const exported = JSON.parse(store.actions.exportDocument());
assert.equal(draft.settings.radius, undefined);
assert.equal(exported.type, SKY_SHADER_DOCUMENT_TYPE);
assert.equal(exported.settings.radius, undefined);
assert.equal(exported.settings.cloudCoverage, undefined);
assert.equal(exported.settings.sunDirection, undefined);
assert.equal(exported.settings.atlasBrightness, 1.4);
assert.equal(exported.hour, undefined);
assert.equal(exported.cloudStyle, undefined);
assert.equal(exported.weather, undefined);

// Explicit launch links must win over a prior draft (the Pro hydration path).
const linkedStore = createSkyLabStore({
  urlParams: new URLSearchParams('skyShader=default'),
});
assert.equal(linkedStore.getState().presetId, 'default');

const compatibleStyleStore = createSkyLabStore({
  urlParams: new URLSearchParams('skyStyle=default'),
});
assert.equal(compatibleStyleStore.getState().presetId, 'default');

const preferredShaderStore = createSkyLabStore({
  urlParams: new URLSearchParams('skyShader=default&skyStyle=call_me_sensei'),
});
assert.equal(preferredShaderStore.getState().presetId, 'default');

const skyShaderDocument = createSkyShaderPresetDocument('verification_sky', {
  label: 'Verification Sky',
  settings: {
    atlasBrightness: 9,
    starsDensity: 0.46,
    sunColor: [0.6, 0.8, 1],
  },
});
assert.equal(skyShaderDocument.settings.atlasBrightness, 4);
assert.equal(skyShaderDocument.version, 2);
assert.ok(skyShaderDocument.timeKeyframes.length >= 2);
assert.equal(skyShaderDocument.settings.starsDensity, 0.46);
assert.deepEqual(skyShaderDocument.settings.sunColor, [0.6, 0.8, 1]);
const parsedSkyShader = parseSkyShaderPresetDocument(
  serializeSkyShaderPreset(skyShaderDocument),
);
assert.equal(parsedSkyShader.ok, true, parsedSkyShader.errors.join(' '));
assert.deepEqual(parsedSkyShader.value, skyShaderDocument);
assert.equal(
  Object.keys(createSkyShaderSettings()).length,
  SKY_SHADER_FIELD_COUNT,
);
let appliedSkyShader = null;
applySkyShaderSettings({
  applySkyShaderSettings(settings) {
    appliedSkyShader = settings;
  },
}, {
  atlasBrightness: 1.7,
  cloudCoverage: 0.9,
  sunDirection: [1, 0, 0],
});
assert.equal(appliedSkyShader.atlasBrightness, 1.7);
assert.equal(appliedSkyShader.cloudCoverage, undefined);
assert.equal(appliedSkyShader.sunDirection, undefined);
assert.equal(Object.keys(appliedSkyShader).length, SKY_SHADER_FIELD_COUNT);

const referenceSkySource = readRepositoryFile('labs/shared/p18/referenceSky.js');
for (const field of Object.values(SKY_SHADER_FIELD_SCHEMA)
  .flatMap((fields) => Object.values(fields))) {
  assert.match(
    referenceSkySource,
    new RegExp(`const ${field.key} = uniform`),
    `${field.key} must have a live P18 renderer uniform.`,
  );
}
assert.match(referenceSkySource, /applySkyShaderSettings\(settings = \{\}\)/);
assert.match(referenceSkySource, /celestialDirection/);
assert.match(referenceSkySource, /starsVisibility/);

// Catalog and standalone-route wiring.
const skyIndex = LOOK_DEVELOPMENT_LABS_SHOWCASE.findIndex((entry) => entry.id === 'sky');
const waterIndex = LOOK_DEVELOPMENT_LABS_SHOWCASE.findIndex((entry) => entry.id === 'water');
assert.ok(
  waterIndex >= 0 && skyIndex > waterIndex,
  'Water and Sky must be independent, ordered look-development owners.',
);
assert.equal(LOOK_DEVELOPMENT_LABS_SHOWCASE[skyIndex].href, '/sky-lab/');
assert.equal(LOOK_DEVELOPMENT_LABS_SHOWCASE[skyIndex].i, 'L10a');
assert.equal(LOOK_DEVELOPMENT_LABS_SHOWCASE[waterIndex].i, 'L09');
assert.equal(DEMOS_SHOWCASE[0].i, 'V01');

assert.match(readRepositoryFile('sky-lab/index.html'), /labs\/sky-cloud-lab\/ui\/main\.jsx/);
assert.match(readRepositoryFile('vite.config.js'), /skyLab:\s*resolve\(__dirname, 'sky-lab\/index\.html'\)/);
assert.match(readRepositoryFile('labs/shared/sceneHub.js'), /id:\s*'skyLab'[\s\S]*path:\s*'\/sky-lab\/'/);
assert.match(
  readRepositoryFile('index.html'),
  /visible roadmap of look development, asset creation, motion, VFX/,
);
assert.match(
  readRepositoryFile('labs/sky-lab/ui/App.jsx'),
  /Sky shader only\./,
);
assert.match(readRepositoryFile('labs/sky-lab/ui/App.jsx'), /sky-preview-cloud-style/);
assert.match(readRepositoryFile('labs/sky-lab/ui/App.jsx'), /LabTimeOfDayControl/);
assert.doesNotMatch(readRepositoryFile('labs/sky-lab/ui/App.jsx'), /scenario-select/);
assert.doesNotMatch(readRepositoryFile('labs/sky-lab/ui/App.jsx'), /cloudCoverage/);
const skyLabEngineSource = readRepositoryFile('labs/sky-lab/ui/engine.js');
assert.match(skyLabEngineSource, /createP18PreviewReferenceSky/);
assert.match(skyLabEngineSource, /loadP18ReferenceContract/);
assert.match(skyLabEngineSource, /applySkyShaderSettings\(referenceSky/);
assert.doesNotMatch(skyLabEngineSource, /createStylizedTerrain/);
assert.doesNotMatch(skyLabEngineSource, /new StylizedSky/);

console.log(
  `Sky verified: legacy runtime compatibility plus ${SKY_SHADER_FIELD_COUNT} `
  + 'P18 Sky Shader fields and a dedicated P18 Lab preview.',
);
