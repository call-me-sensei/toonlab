import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_LAB_PREVIEW_ENVIRONMENT,
  LAB_PREVIEW_ENVIRONMENT_TYPE,
  LAB_PREVIEW_ENVIRONMENT_VERSION,
  LAB_PREVIEW_REFERENCE_STATES,
  LAB_PREVIEW_TIME_PRESETS,
  createLabPreviewEnvironment,
  formatLabPreviewHour,
  labPreviewPresetForHour,
  referenceLabPreviewState,
  sampleLabPreviewReferenceState,
} from '../labs/shared/previewEnvironmentContract.js';
import {
  DEMOS_SHOWCASE,
  LABS_SHOWCASE,
} from '../labs/home/labsShowcase.js';
import { DEFAULT_SHADOW_COLOR_SETTINGS } from '../src/toon/settings/shadowColorSettings.js';

assert.equal(LAB_PREVIEW_ENVIRONMENT_TYPE, 'toonlab/lab-preview-environment');
assert.equal(LAB_PREVIEW_ENVIRONMENT_VERSION, 1);
assert.deepEqual(
  LAB_PREVIEW_TIME_PRESETS.map(({ hour, id }) => [id, hour]),
  [['dawn', 6], ['day', 13], ['sunset', 18], ['night', 22]],
);
assert.equal(DEFAULT_LAB_PREVIEW_ENVIRONMENT.hour, 13);
assert.equal(labPreviewPresetForHour(13), 'day');
assert.equal(labPreviewPresetForHour(18), 'sunset');
assert.equal(labPreviewPresetForHour(22), 'night');
assert.equal(createLabPreviewEnvironment({ hour: 25 }).hour, 1);
assert.equal(createLabPreviewEnvironment({ hour: -1 }).hour, 23);
assert.equal(referenceLabPreviewState(13).shadowTint, LAB_PREVIEW_REFERENCE_STATES.day.shadowTint);
assert.equal(sampleLabPreviewReferenceState(13).shadowTint, '#647fbd');
assert.equal(formatLabPreviewHour(13.25), '13:15');
assert.equal(formatLabPreviewHour(24), '00:00');

function rgbFromHex(value) {
  const hex = String(value).replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

const dayShadow = rgbFromHex(LAB_PREVIEW_REFERENCE_STATES.day.shadowTint);
assert.ok(dayShadow[2] > dayShadow[0], 'Reference daylight shadow must be visibly blue/cool.');
assert.ok(dayShadow[2] - dayShadow[0] >= 0.2, 'Reference daylight blue relationship must be material.');

for (const lab of [...LABS_SHOWCASE, ...DEMOS_SHOWCASE]) {
  assert.equal(
    lab.previewContract,
    'toonlab/lab-preview-environment@1',
    `${lab.id} must require the universal time-of-day preview.`,
  );
}

// Rock Shader Lab is the approved reference. Ground, Tree, Grass, and Flower
// must use the same accepted P18 scene adapter while they remain explicitly
// In progress.
const timeControl = await readFile(
  new URL('../labs/shared/ui/components/LabTimeOfDayControl.jsx', import.meta.url),
  'utf8',
);
const sharedReferenceScene = await readFile(
  new URL('../labs/shared/p18/referenceScene.js', import.meta.url),
  'utf8',
);
const sharedPreviewStyles = await readFile(
  new URL('../labs/shared/p18/previewStyles.js', import.meta.url),
  'utf8',
);
const sharedPreviewStylesModal = await readFile(
  new URL('../labs/shared/p18/PreviewStylesModal.jsx', import.meta.url),
  'utf8',
);
const rockApp = await readFile(
  new URL('../labs/rock-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const rockEngine = await readFile(
  new URL('../labs/rock-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const rockStore = await readFile(
  new URL('../labs/rock-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
const groundApp = await readFile(
  new URL('../labs/ground-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const groundEngine = await readFile(
  new URL('../labs/ground-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const groundStore = await readFile(
  new URL('../labs/ground-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
const vegetationApp = await readFile(
  new URL('../labs/vegetation-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const vegetationEngine = await readFile(
  new URL('../labs/vegetation-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const vegetationStore = await readFile(
  new URL('../labs/vegetation-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
assert.match(timeControl, /max=\{24\}/);
assert.match(timeControl, /min=\{0\}/);
assert.match(timeControl, /LAB_PREVIEW_TIME_PRESETS/);
assert.match(timeControl, /preview-time-autocycle/);

for (const [label, app, engine, store, authoredPattern] of [
  ['Rock', rockApp, rockEngine, rockStore, /authoredComponent: 'rock'/],
  ['Ground', groundApp, groundEngine, groundStore, /authoredComponent: 'ground'/],
  ['Vegetation', vegetationApp, vegetationEngine, vegetationStore, /authoredComponent: SCOPE_COMPONENT\[scope\]/],
]) {
  assert.match(app, /LabTimeOfDayControl/, `${label} must expose shared time controls.`);
  assert.match(app, /P18PreviewStylesModal/, `${label} must expose shared preview styles.`);
  assert.match(app, /testId="preview-styles"/, `${label} must expose one preview-settings button.`);
  assert.match(engine, /createP18ShaderPreviewScene/, `${label} must use the exact shared P18 scene.`);
  assert.match(engine, authoredPattern, `${label} must protect its authored P18 component.`);
  assert.match(engine, /referenceScene\.applyTime\(/, `${label} must apply time to the P18 scene.`);
  assert.match(engine, /previewAutoCycle/, `${label} must support preview time cycling.`);
  assert.match(store, /previewHour: 13/, `${label} must start from the accepted Day state.`);
  assert.match(store, /preview: createP18PreviewSettings/, `${label} must use shared P18 settings.`);
  assert.doesNotMatch(
    store.match(/function persist\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '',
    /previewHour|previewAutoCycle|preview:/,
    `${label} preview scene, styles, and time must not enter its shader draft.`,
  );
}

assert.match(sharedReferenceScene, /createSourceEnvironmentTestContent/);
assert.match(sharedReferenceScene, /createP18PreviewReferenceSky/);
assert.match(sharedReferenceScene, /materialCheckpoint === 'stylized-basic'/);
assert.match(sharedReferenceScene, /loadReferenceSpireMaterialInputs/);
assert.match(sharedReferenceScene, /loadToonRockMaterialInputs/);
assert.match(sharedReferenceScene, /setRockFixture\('spire-05'\)/);
assert.match(sharedReferenceScene, /environmentContent\.grass/);
assert.match(sharedReferenceScene, /environmentContent\.tree/);
assert.match(sharedReferenceScene, /environmentContent\.flowers/);
assert.match(sharedReferenceScene, /environmentContent\.stylizedBasic/);
assert.match(sharedReferenceScene, /fogTint: uniform/);
assert.match(sharedReferenceScene, /fogEnergy: uniform/);
assert.match(sharedReferenceScene, /uniforms\.fogTint\.value\.fromArray\(timeState\.skyTint\)/);
assert.match(sharedReferenceScene, /authoredComponents\.forEach/);
assert.match(rockEngine, /textures: referenceScene\.rockTextures/);
assert.match(groundEngine, /environmentContent\.ground/);
assert.match(vegetationEngine, /applyP18VegetationShader/);
assert.match(vegetationEngine, /view\.viewMode === 'isolate'/);
assert.match(vegetationEngine, /accepted-p18-outdoor-spire/);
assert.match(sharedPreviewStylesModal, /testId="preview-styles-modal"/);
assert.match(sharedPreviewStylesModal, /Style bundle/);
assert.match(sharedPreviewStylesModal, /From bundle/);
assert.match(sharedPreviewStyles, /bundle: 'call_me_sensei'/);
for (const componentId of [
  'rock',
  'ground',
  'grass',
  'tree',
  'flowers',
  'manufacturedProps',
  'sky',
  'clouds',
  'lighting',
]) {
  assert.match(
    sharedPreviewStyles,
    new RegExp(`(?:id: '${componentId}'|${componentId}: 'call_me_sensei')`),
    `P18 preview must expose a ${componentId} style assignment.`,
  );
}
assert.ok(
  DEFAULT_SHADOW_COLOR_SETTINGS.lowSaturationFallbackColor[2] >
  DEFAULT_SHADOW_COLOR_SETTINGS.lowSaturationFallbackColor[0],
  'Character Shader default fallback shadow must be cool/blue.',
);

const previewDocs = await readFile(new URL('../docs/lab-preview-environment.md', import.meta.url), 'utf8');
const roadmap = await readFile(new URL('../docs/lab-roadmap.md', import.meta.url), 'utf8');
assert.match(previewDocs, /Dawn \(06:00\), Day \(13:00\), Sunset \(18:00\), and Night \(22:00\)/);
assert.match(previewDocs, /#647fbd/);
assert.match(previewDocs, /cool\/blue shadow/);
assert.match(previewDocs, /Ground, Tree, Grass, and Flower Shader Labs/);
assert.match(previewDocs, /isolation mode/);
assert.match(roadmap, /Universal preview gate/);

console.log(
  `${LABS_SHOWCASE.length} canonical labs and ${DEMOS_SHOWCASE.length} validation scenes ` +
  'require the shared 24-hour preview; shared P18 shader-lab scene verified.',
);
