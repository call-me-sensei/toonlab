import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import {
  CLOUD_COMPOSITION_DOCUMENT_TYPE,
  CLOUD_SHADER_DOCUMENT_TYPE,
  CLOUD_SOURCE_DOCUMENT_TYPE,
  CloudField,
  createCloudCompositionDocument,
  createCloudShaderPresetDocument,
  createCloudSourceDocument,
  createCumulusVolumeGeometry,
  createDefaultCloudStrokes,
  generateCloudSourceMaps,
  parseCloudShaderPresetDocument,
  resolveCloudPlacements,
} from '../src/cloud/index.js';
import {
  SKY_SHADER_DOCUMENT_TYPE,
  AtmosphereSky,
  createSkyShaderPresetDocument,
  createSkyTimeKeyframes,
  parseSkyShaderPresetDocument,
  sampleSkyTimeKeyframes,
} from '../src/sky/index.js';
import {
  REVIEWED_CATALOG_LICENSES,
  assertCatalogLicenseRelease,
} from '../src/asset-policy/catalogLicenses.js';

const sky = createSkyShaderPresetDocument('verification-atmosphere', {
  label: 'Verification Atmosphere',
});
assert.equal(sky.type, SKY_SHADER_DOCUMENT_TYPE);
assert.equal(sky.version, 2);
assert.ok(sky.timeKeyframes.length >= 2);
assert.equal(sky.atmosphere.turbidity, 3.1, 'Call Me Sensei must be the default atmosphere.');
assert.ok(
  sky.timeKeyframes.some((keyframe) => keyframe.id === 'sensei-day'),
  'The Genshin-inspired Call Me Sensei daylight curve must be the product default.',
);
assert.equal(sky.hour, undefined, 'Current preview/runtime time must not serialize into the style.');

const cyclic = createSkyTimeKeyframes([
  {
    belowHorizonTint: [0, 0, 0], contrast: 1, exposure: 1, horizonGlow: 0,
    horizonGlowColor: [0, 0, 0], horizonTint: [0, 0, 0], hour: 23,
    id: 'late', label: 'Late', saturation: 1, zenithTint: [0, 0, 0],
  },
  {
    belowHorizonTint: [1, 1, 1], contrast: 2, exposure: 2, horizonGlow: 1,
    horizonGlowColor: [1, 1, 1], horizonTint: [1, 1, 1], hour: 1,
    id: 'early', label: 'Early', saturation: 2, zenithTint: [1, 1, 1],
  },
]);
const midnight = sampleSkyTimeKeyframes(cyclic, 0);
assert.equal(midnight.from.id, 'late');
assert.equal(midnight.to.id, 'early');
assert.ok(Math.abs(midnight.amount - 0.5) < 1e-9);
assert.ok(midnight.zenithTint.every((channel) => channel > 0 && channel < 1));
const duplicate = createSkyTimeKeyframes([...cyclic, { ...cyclic[0], hour: 1, id: 'replacement' }]);
assert.equal(duplicate.length, 2);
assert.equal(duplicate.find((entry) => entry.hour === 1).id, 'replacement');

const migratedSky = parseSkyShaderPresetDocument({
  id: 'old-sky', label: 'Old Sky', settings: {}, type: SKY_SHADER_DOCUMENT_TYPE, version: 1,
});
assert.equal(migratedSky.ok, true);
assert.ok(migratedSky.warnings.some((warning) => warning.includes('migrated')));
const migratedCloud = parseCloudShaderPresetDocument({
  id: 'old-cloud', label: 'Old Cloud', settings: {}, type: CLOUD_SHADER_DOCUMENT_TYPE, version: 1,
});
assert.equal(migratedCloud.ok, true);
assert.ok(migratedCloud.warnings.some((warning) => warning.includes('migrated')));

const source = createCloudSourceDocument('hero-cloud', {
  label: 'Hero Cloud',
  preset: 'puffy_cumulus',
  seed: 73,
  strokes: createDefaultCloudStrokes('puffy_cumulus'),
});
assert.equal(source.type, CLOUD_SOURCE_DOCUMENT_TYPE);
assert.equal(source.version, 1);
assert.equal(source.generation.detail, 0.62);
const mapsA = generateCloudSourceMaps(source, { resolution: 96 });
const mapsB = generateCloudSourceMaps(source, { resolution: 96 });
assert.deepEqual(mapsA.hashes, mapsB.hashes, 'Cloud generation must be deterministic.');
assert.deepEqual(mapsA.surface, mapsB.surface);
assert.deepEqual(mapsA.volume, mapsB.volume);
assert.ok(mapsA.paintedPixels > 96 * 96 * 0.02);
assert.ok(mapsA.surface.some((value, index) => index % 4 === 3 && value > 0));
assert.notDeepEqual(
  mapsA.hashes,
  generateCloudSourceMaps({ ...source, seed: 74 }, { resolution: 96 }).hashes,
  'A new seed must change generated detail.',
);
assert.throws(
  () => generateCloudSourceMaps(createCloudSourceDocument('empty', { strokes: [] }), { resolution: 64 }),
  /createDefaultCloudStrokes\(preset\).*non-empty strokes/,
);

const shader = createCloudShaderPresetDocument('verification-cloud-look', {
  label: 'Verification Cloud Look',
});
assert.equal(shader.type, CLOUD_SHADER_DOCUMENT_TYPE);
assert.equal(shader.version, 2);
const composition = createCloudCompositionDocument('verification-composition', {
  label: 'Verification Composition',
  layers: [{
    azimuth: [0, 360], count: 7, elevation: [6, 20], id: 'test-layer',
    opacity: 0.8, parallax: 1, radius: 1_000, scale: [100, 200], seed: 9,
    sourceRefs: [source.id], wind: [0.5, -0.1],
  }],
  seed: 15,
});
assert.equal(composition.type, CLOUD_COMPOSITION_DOCUMENT_TYPE);
const placementsA = resolveCloudPlacements(composition);
const placementsB = resolveCloudPlacements(composition);
assert.equal(placementsA.length, 7);
assert.deepEqual(placementsA, placementsB);

const field = new CloudField({
  composition,
  mapResolution: 64,
  shader,
  sources: [source],
});
assert.equal(field.children.length, 1);
assert.equal(field.getWorldShadowField().coverage > 0, true);
field.setSunDirection([0.2, 0.9, 0.3]);
field.update(0.016);
field.dispose();

const volumeGeometry = createCumulusVolumeGeometry({ resolution: 32, seed: 73 });
assert.ok(volumeGeometry.getAttribute('position').count > 1_000);
assert.ok(volumeGeometry.getAttribute('normal').count > 1_000);
assert.equal(
  volumeGeometry.getAttribute('cloudOcclusion').count,
  volumeGeometry.getAttribute('position').count,
);
assert.ok(volumeGeometry.index, 'The volume must weld the marching-cubes surface for smooth normals.');
assert.equal(volumeGeometry.userData.cloudVolume.lobeCount, 45);
assert.ok(volumeGeometry.userData.cloudVolume.triangleCount > 300);
const volumeSize = {
  x: volumeGeometry.boundingBox.max.x - volumeGeometry.boundingBox.min.x,
  y: volumeGeometry.boundingBox.max.y - volumeGeometry.boundingBox.min.y,
  z: volumeGeometry.boundingBox.max.z - volumeGeometry.boundingBox.min.z,
};
assert.ok(volumeSize.z > volumeSize.x * 0.35, 'The hero cloud must retain substantial real depth.');
assert.ok(volumeSize.y > volumeSize.x * 0.45, 'The hero cloud must retain a rising cumulus crown.');
const repeatedVolume = createCumulusVolumeGeometry({ resolution: 32, seed: 73 });
assert.deepEqual(
  Array.from(volumeGeometry.getAttribute('position').array.slice(0, 600)),
  Array.from(repeatedVolume.getAttribute('position').array.slice(0, 600)),
  'Cumulus volume generation must be deterministic.',
);
repeatedVolume.dispose();
volumeGeometry.dispose();

const atmosphere = new AtmosphereSky({ ...sky, hour: 18 });
assert.equal(atmosphere.skyMesh.cloudCoverage.value, 0);
assert.equal(atmosphere.skyMesh.cloudDensity.value, 0);
assert.equal(atmosphere.setTime(0).hour, 0);
atmosphere.dispose();

const app = await readFile(new URL('../labs/sky-cloud-lab/ui/App.jsx', import.meta.url), 'utf8');
const engine = await readFile(new URL('../labs/sky-cloud-lab/ui/engine.js', import.meta.url), 'utf8');
const cloudCardSource = await readFile(new URL('../src/cloud/cloudCard.js', import.meta.url), 'utf8');
const store = await readFile(new URL('../labs/sky-cloud-lab/ui/store.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../labs/sky-cloud-lab/worker/cloudGenerator.worker.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../labs/sky-cloud-lab/ui/main.jsx', import.meta.url), 'utf8');
const world = await readFile(new URL('../src/stylizedWorld.js', import.meta.url), 'utf8');
const skyRoute = await readFile(new URL('../sky-lab/index.html', import.meta.url), 'utf8');
const cloudRoute = await readFile(new URL('../cloud-shader-lab/index.html', import.meta.url), 'utf8');
for (const label of ['Preview', 'Atmosphere & Time', 'Cloud Painter', 'Cloud Look', 'Composition', 'Assets', 'Export']) {
  assert.match(app, new RegExp(label.replace('&', '&')));
}
assert.match(app, /Generate 512²/);
assert.match(app, /Generate 1024²/);
assert.match(app, /Generate 2048²/);
assert.match(app, /Thunderstorm/);
assert.match(app, /state\.view\.weather/);
assert.match(store, /SKY_CLOUD_LAB_STORAGE_KEY/);
assert.match(engine, /renderMode: 'volume'/);
assert.match(engine, /volumeResolution: 64/);
assert.match(engine, /cloud-side/);
assert.match(engine, /cloud-oblique/);
assert.match(engine, /setEnvironmentState/);
assert.match(engine, /resolveWeatherPreset/);
assert.match(cloudCardSource, /environmentStateUniformNodes\.sunVisibility/);
assert.match(cloudCardSource, /environmentStateUniformNodes\.weatherOvercast/);
assert.match(cloudCardSource, /environmentStateUniformNodes\.weatherPrecipitation/);
assert.match(app, /3D/);
assert.match(worker, /generateCloudSourceMaps/);
assert.doesNotMatch(main, /store\.actions\.generate\(512\)/, 'Doodle generation must not run on startup.');
assert.match(main, /params\.get\('hour'\)/);
assert.match(main, /params\.get\('weather'\)/);
assert.match(world, /runtimeDocuments\.cloudComposition/);
assert.match(world, /setTime\(hour\)/);
assert.match(skyRoute, /data-initial-tab="atmosphere"/);
assert.match(cloudRoute, /data-initial-tab="cloud-look"/);
assert.match(skyRoute, /labs\/sky-cloud-lab\/ui\/main\.jsx/);
assert.match(cloudRoute, /labs\/sky-cloud-lab\/ui\/main\.jsx/);

const dandewa = REVIEWED_CATALOG_LICENSES['LicenseRef-DENDEWA-ASSETS-2026-04-07'];
assert.equal(dandewa.approved, false);
assert.equal(dandewa.originalArchiveRedistribution, false);
assert.equal(dandewa.extractedFileRedistribution, false);
assert.throws(() => assertCatalogLicenseRelease({
  evidence: 'placeholder',
  id: dandewa.id,
  redistributionScope: 'archive-and-files',
}), /pending-evidence/);
const seedFiles = await readdir(new URL('../database/seeds/catalog/', import.meta.url));
for (const name of seedFiles) {
  const seed = await readFile(new URL(`../database/seeds/catalog/${name}`, import.meta.url), 'utf8');
  assert.doesNotMatch(seed, /dandewa/i, 'Dandewa must not be seeded while the gate is blocked.');
}

console.log('Unified Sky & Cloud Lab verified: documents, cyclic OKLab time, deterministic maps, composition, runtime, and Dandewa gate.');
