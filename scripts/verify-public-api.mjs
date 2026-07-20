import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as root from '@call-me-sensei/toonlab';
import * as grass from '@call-me-sensei/toonlab/grass';
import * as grassPalettes from '@call-me-sensei/toonlab/grass-palettes';
import * as sky from '@call-me-sensei/toonlab/sky';
import * as styles from '@call-me-sensei/toonlab/styles';
import * as vegetation from '@call-me-sensei/toonlab/vegetation';
import * as vegetationShaders from '@call-me-sensei/toonlab/vegetation-shaders';
import * as water from '@call-me-sensei/toonlab/water';

import * as grassLabStore from '../labs/grass-lab/grassPresetStore.js';

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
));
const grassShaderSource = await readFile(
  new URL('../src/shaders-tsl/grass.js', import.meta.url),
  'utf8',
);

check('package export map publishes the stable system entry points', () => {
  assert.equal(packageJson.exports['./vegetation'], './src/vegetation/index.js');
  assert.equal(packageJson.exports['./vegetation-shaders'], './src/vegetation/vegetationShaders.js');
  assert.equal(packageJson.exports['./grass-palettes'], './src/vegetation/grassPalettes.js');
  assert.equal(packageJson.exports['./grass'], './src/vegetation/stylizedGrass.js');
  assert.equal(packageJson.exports['./water'], './src/water/index.js');
  assert.equal(packageJson.exports['./sky'], './src/sky/index.js');
});

check('root mirrors the complete vegetation, water, and sky barrels', () => {
  for (const module of [vegetation, water, sky]) {
    for (const [name, value] of Object.entries(module)) {
      assert.equal(root[name], value, `root export ${name} must match its system barrel`);
    }
  }
});

check('sky and water publish their runtime composition and quality contracts', () => {
  assert.equal(sky.SKY_QUALITY_TIERS.low.cloudOctaves, 2);
  assert.equal(sky.SKY_QUALITY_TIERS.medium.cloudOctaves, 3);
  assert.equal(sky.SKY_QUALITY_TIERS.high.cloudOctaves, 4);
  assert.equal(sky.resolveSkyQuality({ cloudOctaves: 5 }).cloudOctaves, 5);
  assert.equal(sky.SKY_SCENE_OVERRIDE_PRIORITIES.lighting, 100);
  assert.equal(sky.SKY_SCENE_OVERRIDE_PRIORITIES.weather, 200);
  assert.equal(water.WATER_SCENE_OVERRIDE_PRIORITIES.lighting, 100);
  assert.equal(water.WATER_SCENE_OVERRIDE_PRIORITIES.weather, 200);
});

check('focused vegetation subpaths share identities with the main barrel', () => {
  for (const module of [grass, vegetationShaders, grassPalettes]) {
    for (const [name, value] of Object.entries(module)) {
      assert.equal(vegetation[name], value, `vegetation export ${name} must be the same binding`);
    }
  }
});

check('vegetation exposes semantic contracts and every shipped material factory', () => {
  for (const name of [
    'createGrassNodeMaterial',
    'createTreeLeafNodeMaterial',
    'createFlowerNodeMaterial',
    'createFlowerHeadNodeMaterial',
    'createFlowerHeadBillboardNodeMaterial',
    'createFlowerBloomNodeMaterial',
    'createFlowerStemNodeMaterial',
    'createWoodySurfaceNodeMaterial',
    'setWoodySurfaceSun',
  ]) {
    assert.equal(typeof vegetation[name], 'function', `missing vegetation material API ${name}`);
  }
  assert.deepEqual(
    Object.values(vegetation.VEGETATION_MATERIAL_ROLES).sort(),
    ['flowerCenter', 'flowerPetal', 'foliageCard', 'grassBlade', 'herbaceousStem', 'woodySurface'].sort(),
  );
  assert.equal(vegetation.VEGETATION_MATERIAL_CONTRACT_VERSION, 1);
});

check('vegetation shader profiles round-trip through the public package', () => {
  const document = vegetation.createVegetationShaderPresetDocument('public-api-profile', {
    label: 'Public API Profile',
    settings: {
      flower: { unlitPetalLift: 0.63 },
      lighting: { shadowTint: [0.38, 0.22, 0.58] },
    },
  });
  const parsed = vegetation.parseVegetationShaderPresetDocument(
    vegetation.serializeVegetationShaderPreset(document),
  );
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);
  assert.equal(document.type, vegetation.VEGETATION_SHADER_DOCUMENT_TYPE);
});

check('grass palettes repaint the coordinated base, tip, and shadow set only', () => {
  assert.ok(grassPalettes.GRASS_COLOR_PALETTES.length >= 8);
  const palette = grassPalettes.resolveGrassColorPalette('wisteria');
  assert.ok(palette);
  const painted = grassPalettes.applyGrassColorPalette({
    shadowStrength: 0.37,
    windResponse: 1.8,
    windStrength: 0.24,
  }, palette);
  assert.deepEqual(painted.baseColor, [...palette.baseColor]);
  assert.deepEqual(painted.tipColor, [...palette.tipColor]);
  assert.deepEqual(painted.shadowTint, [...palette.shadowTint]);
  assert.equal(painted.shadowStrength, 0.37);
  assert.equal(painted.windResponse, 1.8);
  assert.equal(painted.windStrength, 0.24);
  assert.equal(grassPalettes.matchGrassColorPalette(painted)?.id, 'wisteria');
});

check('grass preset v2 stores asset response and excludes every current-scene input', () => {
  for (const [group, keys] of Object.entries({
    interaction: ['pushRadius'],
    sceneCloudShadow: ['cloudShadowCoverage', 'cloudShadowScale', 'cloudShadowStrength', 'cloudShadowVelocity'],
    sceneLight: ['skyColor', 'sunColor', 'sunDirection'],
    sceneWind: ['gustFrequency', 'gustSpeed', 'windDirection', 'windSpeed', 'windStrength'],
  })) {
    for (const key of keys) {
      assert.equal(grass.GRASS_SETTING_FIELD_SCHEMA[group][key].serializable, false,
        `${group}.${key} must be current-scene state`);
    }
  }
  assert.equal(grass.GRASS_SETTING_FIELD_SCHEMA.wind.windResponse.serializable, true);
  assert.equal(grass.GRASS_SETTING_FIELD_SCHEMA.wind.gustResponse.serializable, true);

  const document = grass.createGrassPresetDocument('portable-wisteria', {
    description: 'Portable purple grass.',
    label: 'Portable Wisteria',
    settings: {
      baseColor: [0.35, 0.2, 0.62],
      cloudShadowStrength: 0.8,
      gustFrequency: 0.9,
      gustResponse: 0.65,
      pushRadius: 1.4,
      skyColor: [1, 0, 0],
      sunColor: [0, 0, 0],
      sunDirection: [0, -1, 0],
      tipColor: [0.72, 0.58, 0.94],
      windDirection: [-1, 0.2],
      windResponse: 1.75,
      windSpeed: 2.2,
      windStrength: 0.28,
    },
  });
  assert.equal(document.type, grass.GRASS_PRESET_DOCUMENT_TYPE);
  assert.equal(document.version, grass.GRASS_PRESET_SCHEMA_VERSION);
  assert.equal(document.settings.windResponse, 1.75);
  assert.equal(document.settings.gustResponse, 0.65);
  for (const key of [
    'cloudShadowStrength', 'gustFrequency', 'pushRadius', 'skyColor', 'sunColor',
    'sunDirection', 'windDirection', 'windSpeed', 'windStrength',
  ]) {
    assert.equal(key in document.settings, false, `${key} must remain scene-owned`);
  }

  const parsed = grass.parseGrassPresetDocument(grass.serializeGrassPreset(document));
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);

  const legacyV1 = grass.parseGrassPresetDocument({
    description: 'Old authored wind amplitude.',
    id: 'legacy-wind',
    label: 'Legacy Wind',
    settings: {
      baseColor: [0.2, 0.4, 0.1],
      cloudShadowStrength: 0.72,
      gustFrequency: 0.8,
      pushRadius: 1.2,
      windDirection: [-1, 0],
      windStrength: 0.32,
    },
    type: grass.GRASS_PRESET_DOCUMENT_TYPE,
    version: 1,
  });
  assert.equal(legacyV1.ok, true, legacyV1.errors.join(' '));
  assert.equal(legacyV1.value.version, 2);
  assert.equal(legacyV1.value.settings.windResponse, 2,
    'v1 windStrength migrates relative to its historical 0.16 world-wind default');
  for (const key of ['cloudShadowStrength', 'gustFrequency', 'pushRadius', 'windDirection', 'windStrength']) {
    assert.equal(key in legacyV1.value.settings, false, `${key} must be removed during v1 migration`);
  }
  assert.ok(legacyV1.warnings.some((warning) => warning.includes('windStrength')
    && warning.includes('scene-owned')));
  const legacyRoundTrip = grass.parseGrassPresetDocument(
    grass.serializeGrassPreset(legacyV1.value),
  );
  assert.equal(legacyRoundTrip.ok, true, legacyRoundTrip.errors.join(' '));
  assert.deepEqual(legacyRoundTrip.value, legacyV1.value);

  const v2WithSceneWind = grass.parseGrassPresetDocument({
    ...document,
    settings: { ...document.settings, windResponse: undefined, windStrength: 0.32 },
  });
  assert.equal(v2WithSceneWind.ok, true, v2WithSceneWind.errors.join(' '));
  assert.equal(v2WithSceneWind.value.settings.windResponse, grass.DEFAULT_GRASS_SETTINGS.windResponse,
    'v2 scene wind must not be reinterpreted as an asset response');

  const normalized = grass.validateGrassPresetDocument({
    ...document,
    settings: { ...document.settings, mystery: 1, sunColor: [0, 0, 0] },
  });
  assert.equal(normalized.ok, true);
  assert.ok(normalized.warnings.some((warning) => warning.includes('scene-owned')));
  assert.ok(normalized.warnings.some((warning) => warning.includes('mystery')));

  const future = grass.parseGrassPresetDocument({ ...document, version: 999 });
  assert.equal(future.ok, false);
  assert.match(future.errors.join(' '), /newer than supported/);

  const wrongType = grass.parseGrassPresetDocument({
    ...document,
    type: sky.SKY_PRESET_DOCUMENT_TYPE,
  });
  assert.equal(wrongType.ok, false);
  assert.match(wrongType.errors.join(' '), /Grass preset type/);
});

check('serialized grass presets register asset response while scene inputs stay local', () => {
  const serialized = grass.serializeGrassPreset('public-api-grass', {
    label: 'Public API Grass',
    settings: {
      baseColor: [0.24, 0.12, 0.48],
      shadowTint: [0.18, 0.15, 0.31],
      sunColor: [0, 0, 0],
      tipColor: [0.68, 0.48, 0.86],
      gustResponse: 0.4,
      windResponse: 1.9375,
      windStrength: 0.31,
    },
  });
  grass.registerSerializedGrassPreset(serialized);
  const resolved = grass.createGrassSettings('public-api-grass');
  assert.deepEqual(resolved.baseColor, [0.24, 0.12, 0.48]);
  assert.deepEqual(resolved.tipColor, [0.68, 0.48, 0.86]);
  assert.deepEqual(resolved.shadowTint, [0.18, 0.15, 0.31]);
  assert.equal(resolved.windResponse, 1.9375);
  assert.equal(resolved.gustResponse, 0.4);
  assert.equal(resolved.windStrength, grass.DEFAULT_GRASS_SETTINGS.windStrength);
  assert.deepEqual(resolved.sunColor, [...grass.DEFAULT_GRASS_SETTINGS.sunColor]);
});

check('grass runtime composes scene wind with live asset response uniforms', () => {
  const field = new grass.StylizedGrassField({
    gustResponse: 0.45,
    placements: [{ x: 0, y: 0, z: 0 }],
    windResponse: 2.25,
  });
  assert.equal(field.material.uniforms.uWindResponse.value, 2.25);
  assert.equal(field.material.uniforms.uGustResponse.value, 0.45);
  field.setWind({ strength: 0.3 });
  assert.equal(field.material.uniforms.uWindStrength.value, 0.3);
  assert.equal(field.material.uniforms.uWindResponse.value, 2.25,
    'setting current wind must not overwrite the grass response');
  field.applySettings({ gustResponse: 0.7, windResponse: 1.5 });
  assert.equal(field.material.uniforms.uWindResponse.value, 1.5);
  assert.equal(field.material.uniforms.uGustResponse.value, 0.7);
  field.setPushRadius(1.7);
  assert.equal(field.material.uniforms.uPushRadius.value, 1.7);
  field.dispose();

  assert.match(grassShaderSource, /u\.uWindStrength\.mul\(u\.uWindResponse\)/,
    'vertex displacement must multiply current wind by asset response');
  assert.match(grassShaderSource, /vGust\.mul\(1\.1\)\.mul\(u\.uGustResponse\)/,
    'gust contribution must use the asset gust response');
});

check('Grass Lab persistence re-exports the npm grass document contract', () => {
  for (const name of [
    'GRASS_PRESET_DOCUMENT_TYPE',
    'GRASS_PRESET_SCHEMA_VERSION',
    'sanitizeGrassPresetSettings',
    'validateGrassPresetDocument',
    'parseGrassPresetDocument',
    'createGrassPresetDocument',
    'serializeGrassPreset',
    'registerSerializedGrassPreset',
  ]) {
    assert.equal(grassLabStore[name], grass[name], `Grass Lab must reuse ${name}`);
  }
});

check('style bundles accept and resolve typed inline grass documents', () => {
  const grassDocument = grass.createGrassPresetDocument('bundle-grass', {
    settings: {
      baseColor: [0.16, 0.3, 0.52],
      shadowTint: [0.12, 0.18, 0.34],
      tipColor: [0.38, 0.7, 0.82],
    },
  });
  assert.equal(styles.STYLE_BUNDLE_SLOTS.grass.documentType, grass.GRASS_PRESET_DOCUMENT_TYPE);
  assert.equal(styles.STYLE_BUNDLE_SLOTS.grass.parseDocument, grass.parseGrassPresetDocument);
  const bundle = styles.createStyleBundleDocument('grass-bundle', {
    slots: { grass: { document: grassDocument } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.deepEqual(resolved.grass.baseColor, [0.16, 0.3, 0.52]);
  assert.deepEqual(resolved.grass.tipColor, [0.38, 0.7, 0.82]);
  assert.deepEqual(resolved.grass.shadowTint, [0.12, 0.18, 0.34]);
});

check('style bundles keep IP-wide styles separate from asset presets', () => {
  for (const slotId of [
    'toon', 'grass', 'flowers', 'vegetationShader', 'rock', 'debris',
    'water', 'sky', 'weather', 'environment', 'lighting', 'vfx', 'post',
  ]) {
    assert.equal(styles.STYLE_BUNDLE_SLOTS[slotId].selectionKind, 'style');
  }
  assert.equal(styles.STYLE_BUNDLE_SLOTS.tree.selectionKind, 'document');

  const bundle = styles.createStyleBundleDocument('identity-bundle', {
    slots: {
      debris: { style: 'call_me_sensei' },
      environment: { style: 'call_me_sensei' },
      rock: { style: 'call_me_sensei' },
      sky: { style: 'call_me_sensei' },
      vfx: { style: 'call_me_sensei' },
      water: { style: 'call_me_sensei' },
      weather: { style: 'call_me_sensei' },
    },
  });
  assert.deepEqual(bundle.slots.water, { style: 'call_me_sensei' });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.deepEqual(resolved.rock, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.debris, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.vfx, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.water, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.sky, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.weather, { style: 'call_me_sensei' });
  assert.deepEqual(resolved.environment, { style: 'call_me_sensei' });

  const debrisBase = root.createDebrisSettings({
    asset: { seed: 404 },
    shape: { length: 2.75 },
    surface: { primaryColor: [0.12, 0.22, 0.32] },
  });
  const styledDebris = root.applyDebrisStyle(debrisBase, 'call_me_sensei');
  const editedDebris = root.createDebrisSettings({
    ...styledDebris,
    shape: { ...styledDebris.shape, length: 3.25 },
  });
  const defaultDebris = root.rebaseDebrisSettingsStyle(editedDebris, {
    baseSettings: debrisBase,
    fromStyle: 'call_me_sensei',
    toStyle: 'default',
  });
  assert.equal(defaultDebris.shape.length, 3.25,
    'Debris style changes retain authored asset edits');
  assert.equal(defaultDebris.surface.roughness, debrisBase.surface.roughness,
    'Debris style changes can remove the prior rendition cleanly');
  assert.deepEqual(defaultDebris.surface.primaryColor, debrisBase.surface.primaryColor);

  // A bundle style must compose over every runtime axis; returning one fully
  // resolved default look here would silently pin Lake / Clear Day / Clear.
  for (const preset of water.WATER_PRESET_NAMES) {
    assert.deepEqual(
      water.createWaterSettings({ preset, ...resolved.water }),
      water.createWaterSettings({ preset, style: 'call_me_sensei' }),
      `Water bundle style must cover ${preset}`,
    );
  }
  for (const { id } of root.getWeatherPresetOptions()) {
    assert.deepEqual(
      root.resolveWeatherSettings(id, {}, resolved.weather),
      root.resolveWeatherSettings(id, {}, { style: 'call_me_sensei' }),
      `Weather bundle style must cover ${id}`,
    );
  }
  for (const { id } of sky.getSkyScenarioOptions()) {
    assert.deepEqual(
      sky.createSkySettings({ ...resolved.sky, scenario: id }),
      sky.createSkySettings({ preset: 'call_me_sensei', scenario: id }),
      `Sky bundle style must cover ${id}`,
    );
  }
  for (const { id } of root.ENVIRONMENT_SCENARIOS) {
    assert.deepEqual(
      root.resolveEnvironmentPreset(resolved.environment.style, id),
      root.resolveEnvironmentPreset('call_me_sensei', id),
      `Environment bundle style must cover ${id}`,
    );
  }

  // Old bundles remain compatible: a Water preset still means the asset /
  // scenario axis and does not get reinterpreted as a new style payload.
  const legacy = styles.createStyleBundleDocument('legacy-water-bundle', {
    slots: { water: { preset: 'river' } },
  });
  assert.deepEqual(
    styles.resolveStyleBundleSettings(legacy).water,
    water.createWaterSettings({ preset: 'river' }),
  );
  const legacyScenarios = styles.createStyleBundleDocument('legacy-scenario-bundle', {
    slots: {
      environment: { preset: 'interiorNight' },
      sky: { preset: 'moonlit' },
      weather: { preset: 'rain' },
    },
  });
  const legacyResolved = styles.resolveStyleBundleSettings(legacyScenarios);
  assert.deepEqual(
    legacyResolved.sky,
    { ...sky.createSkySettings({ preset: 'moonlit' }), style: 'default' },
  );
  assert.deepEqual(
    legacyResolved.weather,
    { ...root.resolveWeatherSettings('rain'), style: 'default' },
  );
  const legacyEnvironment = root.resolveEnvironmentPreset('interiorNight');
  assert.deepEqual(
    legacyResolved.environment,
    {
      ...root.createEnvironmentSettings({
        features: legacyEnvironment.features,
        parameters: legacyEnvironment.parameters,
      }),
      style: 'default',
    },
  );
});

check('water exports the complete portable runtime surface', () => {
  for (const name of [
    'WaterSurface',
    'WaterCurrentField',
    'WaterRippleSimulation',
    'WaterSplashSystem',
    'WaterBreakerSystem',
    'WaterScenePasses',
    'WaterInteractionManager',
    'WaterShoreStateField',
    'WaterRain',
    'WaterKelpField',
    'createWaterMaterial',
    'createWaterPresetDocument',
    'parseWaterPresetDocument',
    'serializeWaterPreset',
  ]) {
    assert.ok(name in water, `missing water API ${name}`);
  }
  const document = water.createWaterPresetDocument('public-api-water', {
    settings: { waveIntensity: 0.17 },
  });
  const parsed = water.parseWaterPresetDocument(water.serializeWaterPreset(document));
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);
});

check('style bundles resolve typed inline vegetation, Water, and Weather documents', () => {
  const vegetationDocument = vegetation.createVegetationShaderPresetDocument('bundle-vegetation', {
    settings: { lighting: { shadowTintStrength: 0.33 } },
  });
  const waterDocument = water.createWaterPresetDocument('bundle-water', {
    settings: { waveIntensity: 0.91 },
  });
  const weatherDocument = root.createWeatherPresetDocument('bundle-weather', {
    settings: { atmosphere: { cloudCoverage: 0.77 } },
  });
  const bundle = styles.createStyleBundleDocument('system-bundle', {
    slots: {
      vegetationShader: { document: vegetationDocument },
      water: { document: waterDocument },
      weather: { document: weatherDocument },
    },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.equal(resolved.vegetationShader.lighting.shadowTintStrength, 0.33);
  assert.equal(resolved.water.waveIntensity, 0.91);
  assert.equal(resolved.weather.atmosphere.cloudCoverage, 0.77);
});

check('sky presets are styles that resolve in every canonical scenario', () => {
  const options = sky.getSkyPresetOptions();
  const ids = new Set(options.map((option) => option.id));
  for (const id of ['default', 'call_me_sensei']) {
    assert.ok(ids.has(id), `missing sky style ${id}`);
  }
  const scenarioIds = sky.getSkyScenarioOptions().map((option) => option.id);
  assert.deepEqual(scenarioIds, ['clear_day', 'golden_hour', 'overcast', 'moonlit']);
  // The core preset contract: a style is an identity, not a moment — every
  // style must produce a distinct look for every canonical scenario.
  for (const option of options) {
    assert.deepEqual(Object.keys(option.scenarios), scenarioIds);
    const looks = new Set(scenarioIds.map((scenario) => JSON.stringify(
      sky.sanitizeSkyPresetSettings(sky.createSkySettings({ preset: option.id, scenario })),
    )));
    assert.equal(looks.size, scenarioIds.length,
      `sky style ${option.id} must render distinctly in every scenario`);
  }
  // Legacy flat ids stay stable: each resolves as Default at that scenario.
  for (const [legacyId, alias] of Object.entries(sky.SKY_PRESET_ALIASES)) {
    assert.deepEqual(
      sky.createSkySettings({ preset: legacyId }),
      sky.createSkySettings({ preset: alias.preset, scenario: alias.scenario }),
      `legacy sky preset ${legacyId} must alias ${alias.preset}/${alias.scenario}`,
    );
  }
  assert.ok(sky.createSkySettings('moonlit').starsStrength > 0);
  assert.ok(sky.createSkySettings('golden_hour').sunDirection[1] < 0.3);
  const senseiNight = sky.createSkySettings({ preset: 'call_me_sensei', scenario: 'moonlit' });
  assert.ok(senseiNight.starsStrength > 1 && senseiNight.zenithColor[2] < 0.3,
    'the signature style must ship a real night, not a tinted day');
});

check('sky preset documents round-trip without construction-owned radius', () => {
  const document = sky.createSkyPresetDocument('portable-moonlight', {
    description: 'Portable night look.',
    settings: {
      radius: 720,
      starsStrength: 1.35,
      zenithColor: [0.02, 0.04, 0.13],
    },
  });
  assert.equal(document.type, sky.SKY_PRESET_DOCUMENT_TYPE);
  assert.equal(document.version, sky.SKY_PRESET_SCHEMA_VERSION);
  assert.equal('radius' in document.settings, false);

  const parsed = sky.parseSkyPresetDocument(sky.serializeSkyPreset(document));
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.value, document);

  const normalized = sky.validateSkyPresetDocument({
    ...document,
    settings: { ...document.settings, mystery: 1, radius: 900 },
  });
  assert.equal(normalized.ok, true);
  assert.equal('radius' in normalized.value.settings, false);
  assert.ok(normalized.warnings.some((warning) => warning.includes('construction-only')));
  assert.ok(normalized.warnings.some((warning) => warning.includes('mystery')));

  const future = sky.parseSkyPresetDocument({ ...document, version: 999 });
  assert.equal(future.ok, false);
  assert.match(future.errors.join(' '), /newer than supported/);
});

check('serialized sky presets register and resolve with scene scale left local', () => {
  const serialized = sky.serializeSkyPreset('public-api-sky', {
    label: 'Public API Sky',
    settings: {
      cloudCoverage: 0.19,
      radius: 480,
      zenithColor: [0.11, 0.24, 0.52],
    },
  });
  sky.registerSerializedSkyPreset(serialized);
  const resolved = sky.createSkySettings({ preset: 'public-api-sky' });
  assert.deepEqual(resolved.zenithColor, [0.11, 0.24, 0.52]);
  assert.equal(resolved.cloudCoverage, 0.19);
  assert.equal(resolved.radius, sky.DEFAULT_SKY_SETTINGS.radius);
});

check('style bundles accept and resolve typed inline sky documents', () => {
  const skyDocument = sky.createSkyPresetDocument('bundle-sky', {
    settings: { starsStrength: 0.72, zenithColor: [0.04, 0.08, 0.2] },
  });
  assert.equal(styles.STYLE_BUNDLE_SLOTS.sky.documentType, sky.SKY_PRESET_DOCUMENT_TYPE);
  assert.equal(styles.STYLE_BUNDLE_SLOTS.sky.parseDocument, sky.parseSkyPresetDocument);
  const bundle = styles.createStyleBundleDocument('sky-bundle', {
    slots: { sky: { document: skyDocument } },
  });
  const resolved = styles.resolveStyleBundleSettings(bundle);
  assert.deepEqual(resolved.sky.zenithColor, [0.04, 0.08, 0.2]);
  assert.equal(resolved.sky.starsStrength, 0.72);
  assert.equal(resolved.sky.radius, sky.DEFAULT_SKY_SETTINGS.radius);
});

// Lab deep-link precedence is part of the Pro/Open-in-Lab contract. Keep a
// saved Default draft in the input and prove an explicit signature-style
// link wins instead of silently reopening that draft.
const { resolveCharacterShaderBoot } = await import(
  '../labs/shader-lab/ui/characterShaderBoot.js'
);
check('Character Shader explicit style links beat the autosaved draft', () => {
  const boot = resolveCharacterShaderBoot({
    savedDocument: {
      name: 'Saved Default draft',
      presetId: 'default',
      settings: root.createToonSettings({ preset: 'default' }),
    },
    urlParams: new URLSearchParams('toonPreset=call_me_sensei'),
  });
  assert.equal(boot.bootSource, 'url');
  assert.equal(boot.presetId, 'call_me_sensei');
});

console.log(`public API verifier passed (${checks} contract groups)`);
