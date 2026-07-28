import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import {
  ASSET_CREATION_LABS_SHOWCASE,
  DEMOS_SHOWCASE,
  EFFECTS_AUDIO_LABS_SHOWCASE,
  LAB_EDITOR_STATUS,
  LABS_SHOWCASE,
  LIBRARY_STATUS,
  LOOK_DEVELOPMENT_LABS_SHOWCASE,
  MOTION_PERFORMANCE_LABS_SHOWCASE,
  PIPELINE_LABS_SHOWCASE,
  SHADER_LABS_SHOWCASE,
  WORLD_BUILDING_LABS_SHOWCASE,
} from '../labs/home/labsShowcase.js';

const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
));
const roadmap = await readFile(new URL('../docs/lab-roadmap.md', import.meta.url), 'utf8');
const architecture = await readFile(new URL('../docs/lab-architecture.md', import.meta.url), 'utf8');
const homeSource = await readFile(new URL('../labs/home/main.js', import.meta.url), 'utf8');
const homeHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const categories = {
  assetCreation: ASSET_CREATION_LABS_SHOWCASE,
  effectsAudio: EFFECTS_AUDIO_LABS_SHOWCASE,
  lookDevelopment: LOOK_DEVELOPMENT_LABS_SHOWCASE,
  motionPerformance: MOTION_PERFORMANCE_LABS_SHOWCASE,
  pipelineShipping: PIPELINE_LABS_SHOWCASE,
  worldBuilding: WORLD_BUILDING_LABS_SHOWCASE,
};
const entries = Object.values(categories).flat();
const allCards = [...entries, ...DEMOS_SHOWCASE];

assert.equal(entries.length, 71, 'The definitive inventory has 71 canonical labs.');
assert.equal(LABS_SHOWCASE.length, entries.length);
assert.equal(LOOK_DEVELOPMENT_LABS_SHOWCASE.length, 19);
assert.equal(SHADER_LABS_SHOWCASE.length, 15);
assert.equal(ASSET_CREATION_LABS_SHOWCASE.length, 13);
assert.equal(MOTION_PERFORMANCE_LABS_SHOWCASE.length, 8);
assert.equal(EFFECTS_AUDIO_LABS_SHOWCASE.length, 8);
assert.equal(WORLD_BUILDING_LABS_SHOWCASE.length, 12);
assert.equal(PIPELINE_LABS_SHOWCASE.length, 11);

assert.equal(new Set(allCards.map((entry) => entry.id)).size, allCards.length, 'Card ids must be unique.');
assert.equal(new Set(allCards.map((entry) => entry.i)).size, allCards.length, 'Card indices must be unique.');

for (const entry of allCards) {
  for (const field of ['artifact', 'desc', 'group', 'i', 'id', 'jp', 'npm', 'title']) {
    assert.ok(entry[field], `${entry.id} needs ${field}.`);
  }
  assert.ok(LAB_EDITOR_STATUS[entry.labStatus], `${entry.id} needs a known Lab status.`);
  assert.ok(LIBRARY_STATUS[entry.libraryStatus], `${entry.id} needs a known npm-library status.`);

  if (entry.labStatus === 'notStarted') {
    assert.equal(entry.href, undefined, `${entry.id} is Not started and must not link to an editor.`);
  }
  if (entry.labStatus === 'migrationRequired' || entry.labStatus === 'inProgress') {
    assert.ok(entry.href, `${entry.id} claims an editor exists and therefore needs a link.`);
  }
  if (entry.labStatus === 'beta') {
    assert.ok(entry.href, `${entry.id} is Beta and needs an editor.`);
  }
  if (entry.labStatus === 'validation') {
    assert.equal(entry.libraryStatus, 'notApplicable');
  }

  if (entry.libraryStatus === 'beta') {
    const prefix = '@call-me-sensei/toonlab';
    assert.ok(entry.npm.startsWith(prefix));
    const suffix = entry.npm.slice(prefix.length);
    const exportKey = suffix ? `.${suffix}` : '.';
    assert.ok(packageJson.exports[exportKey], `${entry.id} Beta library needs package export ${exportKey}.`);
  }

  if (entry.href) {
    const pathname = new URL(entry.href, 'https://toonlab.invalid').pathname;
    const fileUrl = new URL(`..${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`, import.meta.url);
    await access(fileUrl);
  }
}

const editorBeta = entries.filter((entry) => entry.labStatus === 'beta').map((entry) => entry.id);
const libraryBeta = entries.filter((entry) => entry.libraryStatus === 'beta').map((entry) => entry.id);
const editorInProgress = entries
  .filter((entry) => entry.labStatus === 'inProgress')
  .map((entry) => entry.id);
const libraryInProgress = entries
  .filter((entry) => entry.libraryStatus === 'inProgress')
  .map((entry) => entry.id);
assert.deepEqual(
  editorBeta,
  [
    'shader',
    'tree-shader',
    'grass-shader',
    'flower-shader',
    'rock-shader',
    'terrain-shader',
    'manufactured-material',
  ],
  'The seven technically complete shader/material labs are approved as Beta.',
);
assert.deepEqual(
  libraryBeta,
  [
    'shader',
    'tree-shader',
    'grass-shader',
    'flower-shader',
    'rock-shader',
    'terrain-shader',
    'manufactured-material',
  ],
  'The seven technically complete shader/material runtime contracts are approved as Beta.',
);
assert.deepEqual(
  editorInProgress,
  [
    'vfx',
    'vfx-shader',
    'sky',
    'cloud-shader',
    'atmosphere',
    'weather',
    'atmospheric-condition',
  ],
  'VFX, the remaining environment rendering stack, and Atmospheric Condition are In progress.',
);
assert.deepEqual(
  libraryInProgress,
  ['weather', 'atmospheric-condition'],
  'Weather Rendering and Atmospheric Condition libraries are In progress.',
);

for (const requiredId of [
  // Look
  'shader', 'tree-shader', 'grass-shader', 'flower-shader',
  'rock-shader', 'terrain-shader',
  'manufactured-material', 'transparent-shader', 'decal-shader', 'vfx-shader',
  'water', 'sky', 'cloud-shader', 'atmosphere', 'weather', 'lighting', 'post', 'linework', 'ui-style',
  // Asset
  'character-assembly', 'manufactured-assembly', 'architecture-kit', 'rock',
  'tree', 'flower', 'grass', 'path', 'texture', 'sky-atmosphere-source', 'graphic-generation',
  'vfx-source-generation', 'audio-source',
  // Motion
  'rigging', 'retargeting', 'animation-clips', 'motion', 'facial-performance',
  'secondary-motion', 'camera', 'sequencer',
  // Effects and audio
  'vfx', 'ambient-system', 'game-feel', 'sfx', 'audio-mix', 'soundscape',
  'music', 'dialogue',
  // World
  'landscape', 'hydrology', 'biome', 'village', 'level-layout',
  'scene-composition', 'climate', 'atmospheric-condition', 'fauna-system',
  'physics-destruction', 'navigation', 'world-streaming',
  // Pipeline
  'style-bundle', 'gallery', 'asset-lab', 'routing-audit', 'reconstruction',
  'base-set', 'scene-kit-coverage', 'quality-performance', 'bake-export',
  'regression', 'release',
]) {
  assert.ok(entries.some((entry) => entry.id === requiredId), `Missing canonical lab ${requiredId}.`);
}

for (const rejectedId of ['prop', 'building', 'debris']) {
  assert.ok(!entries.some((entry) => entry.id === rejectedId), `${rejectedId} must not be a canonical lab.`);
}
assert.ok(!entries.some((entry) => /Prop Generation Lab|Building Generation Lab/.test(entry.title)));

assert.match(homeSource, /LAB_EDITOR_STATUS\[lab\.labStatus\]\.label/);
assert.match(homeSource, /LIBRARY_STATUS\[lab\.libraryStatus\]\.label/);
assert.match(homeSource, /lab-card-artifact/);
assert.match(homeSource, /EFFECTS_AUDIO_LABS_SHOWCASE/);
assert.match(homeSource, /MOTION_PERFORMANCE_LABS_SHOWCASE/);
assert.match(homeHtml, /separate lab and npm/);
assert.match(homeHtml, /Effects &amp; audio/);

assert.match(roadmap, /71/);
assert.match(roadmap, /Tree Shader Lab \| Material profile \| Beta \| Beta/);
assert.match(roadmap, /Grass Shader Lab \| Material profile \| Beta \| Beta/);
assert.match(roadmap, /Flower Shader Lab \| Material profile \| Beta \| Beta/);
assert.match(roadmap, /Terrain & Ground Shader Lab \| Material profile \| Beta \| Beta \| `@call-me-sensei\/toonlab\/ground-shader`/);
assert.match(roadmap, /Character & Creature Shader Lab \| Material profile \| Beta \| Beta/);
assert.match(roadmap, /Rock & Geology Shader Lab \| Material profile \| Beta \| Beta/);
assert.match(roadmap, /VFX Shader Lab \| Renderer profile \| In progress \| Migration required/);
assert.match(roadmap, /VFX Effect Lab \| Effect graph \| In progress \| Migration required/);
assert.match(roadmap, /Lighting & Shadow Lab \| Rendering style profile \| Not started \| Migration required/);
assert.match(roadmap, /Atmospheric Condition Lab \| Atmospheric-condition recipe \| In progress \| In progress/);
assert.match(roadmap, /Manufactured Surface Shader Lab \| Material profile \| Beta \| Beta/);
assert.match(roadmap, /Sky Shader Lab \| Shader\/style profile \| In progress \| Migration required/);
assert.match(roadmap, /Cloud Shader Lab \| Shader\/style profile \| In progress \| Migration required/);
assert.match(roadmap, /Atmosphere, Fog & Volumetrics Lab \| Shader\/style profile \| In progress \| Migration required/);
assert.match(roadmap, /SFX Cue & Sound Design Lab/);
assert.match(roadmap, /Raw procedural \*\*Prop Generation\*\* and \*\*Building Generation\*\* are not/);
assert.match(roadmap, /Neither status may be promoted automatically/);
assert.match(
  architecture,
  /currently approved Beta\/Beta items are Character[\s\S]*Manufactured Surface/,
);

console.log(
  `${entries.length} canonical labs verified across ${Object.keys(categories).length} product families; ` +
  'Lab and npm-library status are independent; seven shader/material surfaces are Beta/Beta.',
);
