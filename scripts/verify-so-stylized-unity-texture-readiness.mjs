import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  assertSoStylizedUnityTextureUploadReady,
  inspectSoStylizedUnityTextureUploadReadiness,
} from '../src/environment/soStylizedUnityTextureReadiness.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environmentDirectory = path.join(root, 'src/environment');

const placeholder = new THREE.Texture();
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(placeholder).reason,
  'missing-image',
  'A TextureLoader-style placeholder must not be uploadable.',
);
assert.throws(
  () => assertSoStylizedUnityTextureUploadReady(placeholder, 'pending test texture'),
  (error) => error?.name === 'SoStylizedUnityTextureNotReadyError'
    && error.textureReadinessReport?.reason === 'missing-image',
);

const loadingImage = new THREE.Texture({
  complete: false,
  naturalHeight: 256,
  naturalWidth: 256,
});
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(loadingImage).reason,
  'image-load-incomplete',
);

const brokenImage = new THREE.Texture({
  complete: true,
  naturalHeight: 0,
  naturalWidth: 0,
});
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(brokenImage).reason,
  'image-has-no-pixels',
);

const decodedImage = new THREE.Texture({
  complete: true,
  naturalHeight: 256,
  naturalWidth: 256,
});
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(decodedImage).ready,
  true,
  'A decoded HTML-image texture must pass.',
);

const dataTexture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1);
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(dataTexture).ready,
  true,
  'A populated DataTexture must pass.',
);

const missingDataTexture = new THREE.DataTexture(null, 1, 1);
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(missingDataTexture).reason,
  'pixel-data-missing',
  'A DataTexture with declared bounds but no pixels must fail.',
);

const renderTarget = new THREE.RenderTarget(1, 1);
assert.equal(
  inspectSoStylizedUnityTextureUploadReadiness(renderTarget.texture).reason,
  'gpu-render-target-texture',
  'GPU-owned post targets must not require a CPU image.',
);

const unityFiles = (await readdir(environmentDirectory))
  .filter((name) => /^soStylizedUnity.*\.js$/.test(name));
const sources = new Map(await Promise.all(unityFiles.map(async (name) => [
  name,
  await readFile(path.join(environmentDirectory, name), 'utf8'),
])));

// SSAO intentionally retains a synchronous loader as a non-production helper;
// the Unity showcase itself must await its dedicated async preload. No other
// Unity module may introduce TextureLoader.load() or a custom-loader .load().
for (const [name, source] of sources) {
  if (name === 'soStylizedUnityAmbientOcclusion.js') continue;
  assert.doesNotMatch(
    source,
    /(?:TextureLoader\s*\([^)]*\)|textureLoader|loader)\.load\s*\(/,
    `${name} contains a synchronous image-loader path.`,
  );
}

for (const name of [
  'soStylizedUnityEnvironmentMaterials.js',
  'soStylizedUnityMegaTerrain.js',
  'soStylizedUnitySceneRecords.js',
  'soStylizedUnitySceneTreeMaterials.js',
  'soStylizedUnityTreeMaterials.js',
]) {
  assert.match(
    sources.get(name),
    /assertSoStylizedUnityTextureUploadReady\s*\(/,
    `${name} must fail closed at its decoded-texture boundary.`,
  );
}

const showcaseSource = await readFile(
  path.join(root, 'examples/unity-showcase/main.js'),
  'utf8',
);
const stageSource = sources.get('soStylizedUnityStage.js');
assert.match(showcaseSource, /loadUnityUrpBlueNoiseTexturesAsync\s*\(/);
assert.match(showcaseSource, /await\s+ssaoBlueNoiseTexturesPromise/);
assert.match(showcaseSource, /ssaoBlueNoiseTextures\s*,/);
assert.match(stageSource, /assertUnityUrpBlueNoiseTexturesReady\s*\(/);
assert.match(stageSource, /blueNoiseTextures:\s*resolvedSsaoBlueNoiseTextures/);

renderTarget.dispose();
for (const texture of [
  placeholder,
  loadingImage,
  brokenImage,
  decodedImage,
  dataTexture,
  missingDataTexture,
]) texture.dispose();

console.log('Unity WebGPU texture readiness verified.');
console.log(`  audited Unity modules: ${unityFiles.length}`);
console.log('  synchronous image-loader paths outside SSAO helper: 0');
console.log('  decoded loader boundaries guarded: 5');
console.log('  showcase SSAO preload: awaited before post construction');
