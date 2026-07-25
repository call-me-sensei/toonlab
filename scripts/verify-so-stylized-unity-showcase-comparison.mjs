#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  SO_STYLIZED_UNITY_MEGA_CURRENT_COMPARISON_EVIDENCE,
  createSoStylizedUnityMegaComparisonIdentityReport,
} from '../src/environment/soStylizedUnityMegaComparisonIdentity.js';
import {
  applySoStylizedUnityTerrainNativeAuthority,
} from '../src/environment/soStylizedUnityTerrainNativeAuthority.js';
import {
  analyzeSoStylizedUnityFrameOccupancy,
} from '../src/environment/soStylizedUnityFrameOccupancy.js';

const ROOT = process.cwd();
const SHOWCASE_ROOT = path.join(ROOT, 'examples/unity-showcase');
const evidence = SO_STYLIZED_UNITY_MEGA_CURRENT_COMPARISON_EVIDENCE;
const bundleRoot = path.join(ROOT, evidence.baseUrl.replace(/^\//, ''));
const read = (file) => fs.readFileSync(path.join(bundleRoot, file));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const frameParityReport = Object.freeze({
  exact: true,
  projection: Object.freeze({ maximumError: 0 }),
});

const solidFrame = new Uint8Array(4 * 4 * 4);
for (let offset = 0; offset < solidFrame.length; offset += 4) {
  solidFrame.set([22, 134, 207, 255], offset);
}
assert.equal(
  analyzeSoStylizedUnityFrameOccupancy(solidFrame, 4, 4).exact,
  false,
  'a clear-color frame passed final-frame occupancy',
);
const variedFrame = new Uint8Array(4 * 4 * 4);
for (let index = 0; index < 16; index += 1) {
  variedFrame.set([
    index * 15,
    (15 - index) * 11,
    (index % 4) * 70,
    255,
  ], index * 4);
}
assert.equal(
  analyzeSoStylizedUnityFrameOccupancy(variedFrame, 4, 4).exact,
  true,
  'a varied rendered frame failed final-frame occupancy',
);

function pngDimensions(bytes) {
  const signature = '89504e470d0a1a0a';
  assert.equal(bytes.subarray(0, 8).toString('hex'), signature, 'native oracle is not a PNG');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', 'PNG lost its IHDR');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

for (const [key, record] of Object.entries(evidence.files)) {
  const bytes = read(record.name);
  assert.equal(sha256(bytes), record.sha256, `${key} evidence hash drifted`);
}

const rawManifest = JSON.parse(read(evidence.files.manifest.name));
const terrainNativeAuthority = JSON.parse(read(evidence.files.terrainNativeAuthority.name));
const rawTerrain = rawManifest.terrains?.[0];
assert.ok(rawTerrain, 'pinned manifest lost terrain[0]');
for (const field of ['position', 'renderTransformAuthority', 'surfaceProbes']) {
  assert.equal(
    Object.hasOwn(rawTerrain, field),
    false,
    `capture-pinned manifest was rewritten with later ${field} evidence`,
  );
}
assert.deepEqual(
  Object.keys(terrainNativeAuthority.terrains?.[0] ?? {}).sort(),
  ['index', 'node', 'position', 'renderTransformAuthority', 'surfaceProbes', 'terrainData'],
  'native Terrain sidecar exclusion set changed',
);
const manifest = applySoStylizedUnityTerrainNativeAuthority(
  rawManifest,
  terrainNativeAuthority,
);
const hydratedTerrain = { ...manifest.terrains[0] };
for (const field of ['position', 'renderTransformAuthority', 'surfaceProbes']) {
  delete hydratedTerrain[field];
}
assert.deepEqual(
  hydratedTerrain,
  rawTerrain,
  'native Terrain hydration changed a capture-manifest field outside the explicit sidecar set',
);
const nativeCaptureReport = read(evidence.files.captureReport.name).toString('utf8');
const nativeReference = read(evidence.files.nativeReference.name);
const dimensions = pngDimensions(nativeReference);
assert.deepEqual(dimensions, evidence.viewport, 'native oracle is no longer 1920x1080');

const report = createSoStylizedUnityMegaComparisonIdentityReport({
  baseUrl: evidence.baseUrl,
  frameParityReport,
  manifest,
  terrainNativeAuthority,
  nativeCaptureReport,
  nativeImageHeight: dimensions.height,
  nativeImageWidth: dimensions.width,
  nativeReferenceUrl: `${evidence.baseUrl}/${evidence.files.nativeReference.name}`,
  viewportHeight: evidence.viewport.height,
  viewportWidth: evidence.viewport.width,
});
assert.equal(report.exact, true, JSON.stringify(report));
assert.equal(report.gates.scene, true, 'native/reconstruction scene identity failed');
assert.equal(report.gates.camera, true, 'native/reconstruction camera identity failed');
assert.equal(report.gates.viewport, true, 'native/reconstruction viewport identity failed');
assert.equal(report.gates.profile, true, 'native/reconstruction render profile identity failed');
assert.equal(report.gates.immutableBundle, true, 'comparison resources left the pinned bundle');
assert.equal(report.gates.reconstructionFrame, true, 'live source-frame gate is not exact');
assert.equal(report.nativeOracle.sceneId, report.reconstruction.sceneId);
assert.equal(report.nativeOracle.cameraId, report.reconstruction.cameraId);
assert.deepEqual(report.nativeOracle.resolution, report.reconstruction.resolution);

const wrongFrame = createSoStylizedUnityMegaComparisonIdentityReport({
  baseUrl: evidence.baseUrl,
  frameParityReport: { exact: false, projection: { maximumError: 1 } },
  manifest,
  terrainNativeAuthority,
  nativeCaptureReport,
  nativeImageHeight: dimensions.height,
  nativeImageWidth: dimensions.width,
  nativeReferenceUrl: `${evidence.baseUrl}/${evidence.files.nativeReference.name}`,
});
assert.equal(wrongFrame.exact, false, 'a non-source live frame passed identity');
assert.equal(wrongFrame.gates.reconstructionFrame, false);

const wrongSceneCapture = nativeCaptureReport.replace(
  /^scene=.*$/m,
  'scene=Assets/Not-The-Mega-Demo.unity',
);
const wrongScene = createSoStylizedUnityMegaComparisonIdentityReport({
  baseUrl: evidence.baseUrl,
  frameParityReport,
  manifest,
  terrainNativeAuthority,
  nativeCaptureReport: wrongSceneCapture,
  nativeImageHeight: dimensions.height,
  nativeImageWidth: dimensions.width,
  nativeReferenceUrl: `${evidence.baseUrl}/${evidence.files.nativeReference.name}`,
});
assert.equal(wrongScene.gates.scene, false, 'a different native scene passed identity');
assert.equal(wrongScene.exact, false);

const wrongCameraCapture = nativeCaptureReport.replace(
  /^camera.position=.*$/m,
  'camera.position=(0.00, 0.00, 0.00)',
);
const wrongCamera = createSoStylizedUnityMegaComparisonIdentityReport({
  baseUrl: evidence.baseUrl,
  frameParityReport,
  manifest,
  terrainNativeAuthority,
  nativeCaptureReport: wrongCameraCapture,
  nativeImageHeight: dimensions.height,
  nativeImageWidth: dimensions.width,
  nativeReferenceUrl: `${evidence.baseUrl}/${evidence.files.nativeReference.name}`,
});
assert.equal(wrongCamera.gates.camera, false, 'a different native camera passed identity');
assert.equal(wrongCamera.exact, false);

const wrongBundle = createSoStylizedUnityMegaComparisonIdentityReport({
  baseUrl: '/assets-local/not-the-pinned-unity-export',
  frameParityReport,
  manifest,
  terrainNativeAuthority,
  nativeCaptureReport,
  nativeImageHeight: dimensions.height,
  nativeImageWidth: dimensions.width,
  nativeReferenceUrl: '/assets-local/not-the-pinned-unity-export/unity-reference.png',
});
assert.equal(wrongBundle.gates.immutableBundle, false, 'an unpinned export passed identity');
assert.equal(wrongBundle.exact, false);

const wrongTerrainNativeAuthority = structuredClone(terrainNativeAuthority);
wrongTerrainNativeAuthority.terrains[0].position[0] += 1;
const wrongTerrainAuthority = createSoStylizedUnityMegaComparisonIdentityReport({
  baseUrl: evidence.baseUrl,
  frameParityReport,
  manifest,
  terrainNativeAuthority: wrongTerrainNativeAuthority,
  nativeCaptureReport,
  nativeImageHeight: dimensions.height,
  nativeImageWidth: dimensions.width,
  nativeReferenceUrl: `${evidence.baseUrl}/${evidence.files.nativeReference.name}`,
});
assert.equal(
  wrongTerrainAuthority.gates.terrainAuthority,
  false,
  'a different native Terrain renderer frame passed identity',
);
assert.equal(wrongTerrainAuthority.exact, false);

const html = fs.readFileSync(path.join(SHOWCASE_ROOT, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(SHOWCASE_ROOT, 'main.js'), 'utf8');
const frameOccupancySource = fs.readFileSync(
  path.join(ROOT, 'src/environment/soStylizedUnityFrameOccupancy.js'),
  'utf8',
);
const pageSource = `${html}\n${main}`;
for (const forbidden of ['source-showcase', 'SnowPines', 'Unreal', 'old-page']) {
  assert.equal(
    pageSource.includes(forbidden),
    false,
    `Unity-only comparison path still references ${forbidden}`,
  );
}
assert.match(html, /UNITY NATIVE ORACLE · MEGA · CAMERA 0/);
assert.match(html, /TOONLAB RECONSTRUCTION · SAME EXPORT · CAMERA 0/);
assert.match(
  html,
  new RegExp(`${evidence.baseUrl}/${evidence.files.nativeReference.name}`),
  'left oracle is not the pinned native capture',
);
assert.doesNotMatch(
  main,
  /src\/environment\/index\.js/,
  'Unity comparison must not evaluate the mixed environment barrel',
);
assert.match(main, /SO_STYLIZED_UNITY_MEGA_CURRENT_COMPARISON_EVIDENCE\.baseUrl/);
assert.match(main, /unityReferenceElement\.src = NATIVE_REFERENCE_URL/);
assert.match(main, /createSoStylizedUnityMegaComparisonIdentityReport\(\{/);
assert.match(main, /if \(!comparisonIdentityReport\.exact\)/);
assert.match(main, /await verifySoStylizedUnityFrameOccupancy\(\{/);
const presentationTargetIndex = frameOccupancySource.indexOf(
  'renderer.setRenderTarget(null);',
);
const warmupRenderIndex = frameOccupancySource.indexOf(
  '      render();',
  presentationTargetIndex,
);
const probeInitializationIndex = frameOccupancySource.indexOf(
  'renderer.initRenderTarget(probe);',
);
const probeTargetIndex = frameOccupancySource.indexOf(
  'renderer.setRenderTarget(probe);',
);
const probeRenderIndex = frameOccupancySource.indexOf(
  '      render();',
  probeTargetIndex,
);
const readbackIndex = frameOccupancySource.indexOf(
  'renderer.readRenderTargetPixelsAsync(',
);
assert.ok(
  presentationTargetIndex >= 0
    && warmupRenderIndex > presentationTargetIndex
    && probeInitializationIndex > warmupRenderIndex
    && probeTargetIndex > probeInitializationIndex
    && probeRenderIndex > probeTargetIndex
    && readbackIndex > probeRenderIndex,
  'occupancy ordering must be production warm-up -> probe init -> probe render -> readback',
);
assert.match(
  main,
  /const frameOccupancyReport = await verifySoStylizedUnityFrameOccupancy\([\s\S]*?const ledger = await ledgerPromise;/,
  'final-frame occupancy must pass before the page can publish worldReady',
);
for (const dataset of [
  'comparisonBundleIdentityMatch',
  'comparisonCameraPositionError',
  'comparisonCameraProjectionError',
  'comparisonCameraRotationErrorRadians',
  'comparisonCameraIdentityMatch',
  'comparisonFrameIdentityMatch',
  'comparisonIdentityExact',
  'comparisonIdentityKey',
  'comparisonOracleCameraId',
  'comparisonOracleResolution',
  'comparisonOracleRole',
  'comparisonOracleSceneId',
  'comparisonReconstructionCameraId',
  'comparisonReconstructionResolution',
  'comparisonReconstructionRole',
  'comparisonReconstructionSceneId',
  'comparisonSceneIdentityMatch',
  'comparisonTerrainAuthorityIdentityMatch',
  'comparisonTerrainAuthoritySha256',
  'comparisonViewportIdentityMatch',
  'postFrameNonClear',
  'postRenderPhaseCompleted',
  'postRenderPhaseFailed',
  'renderFrameDominantFraction',
  'renderFrameGate',
  'renderFrameLumaRange',
  'renderFrameLumaStandardDeviation',
  'renderFrameNonClear',
  'renderFrameRgbRange',
  'terrainNativeProbeCount',
  'terrainNativeProbeHeightError',
  'terrainNativeProbeSplatError',
  'terrainNativeProbeWorldError',
  'terrainTransformAuthority',
]) {
  assert.match(main, new RegExp(`${dataset}:`), `runtime dataset ${dataset} is missing`);
}
assert.match(
  main,
  /const setFreeCamera = \(\) => \{[\s\S]*?applyView\('live'\);[\s\S]*?setInteractiveIdentityState\(false\);/,
  'free camera must leave compare mode and invalidate live frame identity',
);
assert.match(
  main,
  /if \(viewElement\.value !== 'live'\) setExactCamera\(\);/,
  'native oracle views must restore the exact source camera',
);
assert.match(main, /parityExact: 'false'/, 'render parity must stay truthful while incomplete');
assert.match(
  main,
  /comparison identity and source frame exact; material, lighting, atmosphere, and post remain/,
  'remaining pixel-parity gap is no longer explicit',
);

console.log('Unity showcase comparison identity verified');
console.log(`  bundle: ${evidence.captureLabel}`);
console.log(`  scene: ${report.nativeOracle.sceneId}`);
console.log(`  camera: ${report.nativeOracle.cameraId}`);
console.log(`  frame: ${dimensions.width}x${dimensions.height}`);
console.log('  roles: Unity native oracle ↔ ToonLab reconstruction');
