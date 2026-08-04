import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CLOUD_SHADER_DOCUMENT_TYPE,
  CLOUD_SHADER_FIELD_COUNT,
  CLOUD_SHADER_FIELD_SCHEMA,
  CLOUD_SHADER_SETTING_GROUPS,
  DEFAULT_CLOUD_SHADER_PRESET,
  applyCloudShaderSettings,
  createCloudShaderPresetDocument,
  createCloudShaderSettings,
  getCloudShaderPresetOptions,
  parseCloudShaderPresetDocument,
  serializeCloudShaderPreset,
} from '../src/cloud/index.js';
import { LOOK_DEVELOPMENT_LABS_SHOWCASE } from '../labs/home/labsShowcase.js';
import {
  STYLE_BUNDLE_SLOTS,
  createStyleBundleDocument,
  resolveStyleBundleSettings,
} from '../src/styles/styleBundle.js';

const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
));
const rendererSource = await readFile(
  new URL('../labs/shared/p18/referenceSky.js', import.meta.url),
  'utf8',
);
const cardRendererSource = await readFile(
  new URL('../src/cloud/cloudCard.js', import.meta.url),
  'utf8',
);
const volumeRendererSource = await readFile(
  new URL('../src/cloud/cloudVolume.js', import.meta.url),
  'utf8',
);
const appSource = await readFile(
  new URL('../labs/cloud-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const engineSource = await readFile(
  new URL('../labs/cloud-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const storeSource = await readFile(
  new URL('../labs/cloud-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
const mainSource = await readFile(
  new URL('../labs/cloud-shader-lab/ui/main.jsx', import.meta.url),
  'utf8',
);
const legacyMainSource = await readFile(
  new URL('../labs/atmospheric-condition-lab/ui/main.jsx', import.meta.url),
  'utf8',
);
const docs = await readFile(
  new URL('../docs/cloud-shader.md', import.meta.url),
  'utf8',
);

assert.equal(DEFAULT_CLOUD_SHADER_PRESET, 'call_me_sensei');
assert.equal(CLOUD_SHADER_DOCUMENT_TYPE, 'toonlab/cloud-shader-preset');
assert.equal(CLOUD_SHADER_FIELD_COUNT, 31);
assert.deepEqual(
  CLOUD_SHADER_SETTING_GROUPS.map((group) => group.id),
  ['composition', 'shape', 'lighting', 'motion'],
);
assert.equal(
  Object.values(CLOUD_SHADER_FIELD_SCHEMA)
    .flatMap((group) => Object.values(group))
    .length,
  CLOUD_SHADER_FIELD_COUNT,
);

const settings = createCloudShaderSettings();
assert.equal(settings.backgroundCloudStrength, 0.34);
assert.equal(settings.cloudShellStrength, 1.85);
assert.equal(settings.cloudShellVerticalOffset, -0.06);
assert.equal(settings.cloudShellVerticalStretch, 0.5);
assert.equal(Object.keys(settings).length, CLOUD_SHADER_FIELD_COUNT);
assert.equal(getCloudShaderPresetOptions()[1].id, 'call_me_sensei');
assert.deepEqual(
  createCloudShaderSettings({ litColor: [1.8, 1.4, 1.1] }).litColor,
  [1.8, 1.4, 1.1],
  'cloud colors need linear HDR headroom for tone mapping',
);
assert.match(cardRendererSource, /material\.fog = false/);
assert.match(volumeRendererSource, /material\.fog = false/);

for (const field of Object.values(CLOUD_SHADER_FIELD_SCHEMA)
  .flatMap((group) => Object.values(group))) {
  const generatedCardField = [
    'opacity', 'worldShadowStrength', 'worldShadowSoftness', 'edgeSoftness',
    'erosion', 'litColor', 'shadeColor', 'shadowStrength', 'normalStrength',
    'depthStrength', 'translucencyStrength', 'rimColor', 'rimStrength',
    'rimPower', 'windResponse',
  ].includes(field.key);
  if (generatedCardField) {
    assert.match(cardRendererSource, new RegExp(field.key));
  } else {
    assert.match(rendererSource, new RegExp(`const ${field.key} = uniform`));
    assert.match(
      rendererSource,
      field.type === 'color'
        ? new RegExp(`${field.key}\\.value\\.fromArray\\(settings\\.${field.key}\\)`)
        : new RegExp(`${field.key}\\.value = settings\\.${field.key}`),
    );
  }
  assert.equal(field.serializable, true);
}

const document = createCloudShaderPresetDocument('verification_cloud', {
  label: 'Verification Cloud',
  settings: {
    backgroundCloudStrength: 9,
    cloudShellCoverage: 0.46,
    cloudShellTint: [0.6, 0.8, 1],
  },
});
assert.equal(document.settings.backgroundCloudStrength, 1);
assert.equal(document.settings.cloudShellCoverage, 0.46);
assert.deepEqual(document.settings.cloudShellTint, [0.6, 0.8, 1]);
const parsed = parseCloudShaderPresetDocument(serializeCloudShaderPreset(document));
assert.equal(parsed.ok, true, parsed.errors.join(' '));
assert.deepEqual(parsed.value, document);
assert.equal(document.version, 2);

const unknown = parseCloudShaderPresetDocument({
  ...document,
  settings: { ...document.settings, currentWeather: 'heavyRain' },
});
assert.equal(unknown.ok, true);
assert.ok(unknown.warnings.some((warning) => warning.includes('currentWeather')));
assert.equal(unknown.value.settings.currentWeather, undefined);

let applied = null;
const target = {
  applyCloudShaderSettings(next) {
    applied = next;
  },
};
applyCloudShaderSettings(target, {
  cloudShellCoverage: 0.64,
  horizonColor: [1, 0, 0],
});
assert.equal(applied.cloudShellCoverage, 0.64);
assert.equal(applied.horizonColor, undefined);
assert.equal(Object.keys(applied).length, CLOUD_SHADER_FIELD_COUNT);

assert.equal(packageJson.exports['./cloud'], './src/cloud/index.js');
assert.equal(STYLE_BUNDLE_SLOTS.cloud.documentType, CLOUD_SHADER_DOCUMENT_TYPE);
const cloudBundle = createStyleBundleDocument('cloud-verification', {
  slots: { cloud: { document } },
});
assert.equal(
  resolveStyleBundleSettings(cloudBundle).cloud.cloudShellCoverage,
  0.46,
);
const card = LOOK_DEVELOPMENT_LABS_SHOWCASE
  .find((entry) => entry.id === 'cloud-shader');
assert.equal(card.href, '/cloud-shader-lab/');
assert.equal(card.labStatus, 'inProgress');
assert.equal(card.libraryStatus, 'migrationRequired');

assert.match(appSource, /BrandLockup labName="Cloud Shader Lab"/);
assert.match(appSource, /label="Style"/);
assert.match(appSource, /testId="cloud-style-select"/);
assert.match(appSource, /testId="cloud-preview-condition"/);
assert.match(appSource, /No condition · authored/);
assert.match(appSource, /LabTimeOfDayControl/);
assert.match(appSource, /testId="cloud-preview-particles"/);
assert.doesNotMatch(appSource, /cloud-preview-quality/);
assert.match(engineSource, /createP18PreviewReferenceSky/);
assert.match(engineSource, /loadP18ReferenceContract/);
assert.match(engineSource, /referenceEnvironment\.js/);
assert.doesNotMatch(engineSource, /referenceScene\.js/);
assert.match(engineSource, /applyCloudShaderSettings\(referenceSky/);
assert.doesNotMatch(engineSource, /createStylizedTerrain/);
assert.doesNotMatch(engineSource, /new StylizedSky/);
assert.match(engineSource, /new WeatherSystem/);
assert.match(rendererSource, /canonicalReferenceAssetUrl/);
assert.match(rendererSource, /\/assets-local\/reference-materials\//);
assert.match(rendererSource, /loadRequiredReferenceAsset/);
assert.match(rendererSource, /P18 sky-dome mesh/);
assert.match(rendererSource, /P18 background-cloud texture/);
assert.match(rendererSource, /P18 cloud-shell mesh/);
assert.match(rendererSource, /P18 cloud-shell texture/);
assert.match(storeSource, /weather: 'authored'/);
assert.match(storeSource, /particles: false/);
assert.match(storeSource, /hour: 13/);
assert.match(mainSource, /Cloud preview failed to load:/);
assert.match(mainSource, /Unknown startup failure/);
assert.match(legacyMainSource, /workspace'\) === 'cloud'/);
assert.match(legacyMainSource, /window\.location\.replace\('\/cloud-shader-lab\/'\)/);
assert.match(docs, /Cloud Shader Lab must never route into Atmospheric Condition Lab|never restores an atmospheric condition/);

console.log(
  `Cloud Shader verified: ${CLOUD_SHADER_FIELD_COUNT} live fields, `
  + 'P18 cloud source, dedicated lab route, Call Me Sensei default.',
);
