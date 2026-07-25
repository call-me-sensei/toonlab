#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  evaluateUeSourceCocRadius,
  inverseSmoothstep,
  resolveUeSourceDepthOfFieldContract,
} from '../src/environment/ueSourceDepthOfField.js';

function nearlyEqual(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const ueEngine = process.env.UE_ENGINE_ROOT
  ?? '/Users/Shared/Epic Games/UE_5.8/Engine';

const manifest = JSON.parse(await readFile(
  new URL('../assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json', import.meta.url),
  'utf8',
));
const camera = manifest.renderState.components.find(
  (component) => component.componentClass === 'CineCameraComponent',
);
const contract = resolveUeSourceDepthOfFieldContract(camera, {
  horizontalResolution: 1280,
});

assert.equal(contract.engine, 'Unreal Engine 5.8 DiaphragmDOF');
assert.equal(contract.bladeCount, 7);
nearlyEqual(contract.focusDistanceMeters, 107.03086914);
nearlyEqual(contract.sensorWidthMm, 23.76);
nearlyEqual(contract.sensorHeightMm, 13.365);
nearlyEqual(contract.verticalFocalLengthMm, 18.61297035217285, 1e-5);
nearlyEqual(contract.infinityBackgroundCocRadius, 0.0005099925561270042, 1e-12);
nearlyEqual(contract.maxKernelRadiusPixels, 32);
// This is the actual camera-1 far-field blur limit. The 32 px value above is
// only UE's safety clamp, reached by very near foreground geometry here.
nearlyEqual(contract.infinityBackgroundCocRadiusPixels, 0.6527904718425653, 1e-10);

nearlyEqual(evaluateUeSourceCocRadius(contract.focusDistanceMeters, contract), 0);
nearlyEqual(
  evaluateUeSourceCocRadius(Number.MAX_SAFE_INTEGER, contract),
  contract.infinityBackgroundCocRadius,
  1e-10,
);
assert.equal(evaluateUeSourceCocRadius(1, contract), -0.025);
nearlyEqual(evaluateUeSourceCocRadius(500, contract) * 1280, 0.5130530087073244, 1e-10);

for (const value of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
  const x = inverseSmoothstep(value);
  const reconstructed = x * x * (3 - 2 * x);
  nearlyEqual(reconstructed, value, 1e-12);
}

// Verify that the glTF camera projection matches UE's authored horizontal FOV
// conversion rather than treating horizontal FOV as Three's vertical FOV.
const glb = await readFile(new URL(
  '../assets-local/sostylized/demo-scenes/Demonstration_SnowPines.glb',
  import.meta.url,
));
assert.equal(glb.toString('ascii', 0, 4), 'glTF');
const jsonLength = glb.readUInt32LE(12);
assert.equal(glb.toString('ascii', 16, 20), 'JSON');
const gltf = JSON.parse(
  glb.toString('utf8', 20, 20 + jsonLength).replace(/\0+$/u, '').trimEnd(),
);
const sourceCameras = manifest.renderState.components
  .filter((component) => component.componentClass === 'CineCameraComponent')
  .sort((left, right) => String(left.actor).localeCompare(
    String(right.actor),
    undefined,
    { numeric: true, sensitivity: 'base' },
  ));
assert.equal(gltf.cameras.length, sourceCameras.length);
sourceCameras.forEach((sourceCamera, index) => {
  const sourceContract = resolveUeSourceDepthOfFieldContract(sourceCamera, {
    horizontalResolution: 1280,
  });
  const expectedVerticalFov = 2 * Math.atan(
    Math.tan(sourceContract.fieldOfViewDegrees * Math.PI / 360)
      / sourceContract.renderingAspectRatio,
  );
  nearlyEqual(gltf.cameras[index].perspective.yfov, expectedVerticalFov, 1e-6);
  nearlyEqual(gltf.cameras[index].perspective.znear, 0.05, 1e-7);
  nearlyEqual(
    sourceContract.verticalFocalLengthMm,
    Number(sourceCamera.properties.current_focal_length),
    1e-4,
  );
  nearlyEqual(
    evaluateUeSourceCocRadius(sourceContract.focusDistanceMeters, sourceContract),
    0,
  );
});

// Pin both UE's physical model and the interim Three gather backend. The
// former is exact; the latter remains an explicit quality bridge and must not
// be mistaken for UE's tile flatten/dilate, gather/scatter, or 7-blade path.
const sourcePaths = {
  cineCamera: `${ueEngine}/Source/Runtime/CinematicCamera/Private/CineCameraComponent.cpp`,
  dofCommon: `${ueEngine}/Shaders/Private/DiaphragmDOF/DOFCommon.ush`,
  dofUtils: `${ueEngine}/Source/Runtime/Renderer/Private/PostProcess/DiaphragmDOFUtils.cpp`,
  threeDof: new URL(
    '../node_modules/three/examples/jsm/tsl/display/DepthOfFieldNode.js',
    import.meta.url,
  ),
};
const [cineCamera, dofCommon, dofUtils, threeDof] = await Promise.all([
  readFile(sourcePaths.cineCamera, 'utf8'),
  readFile(sourcePaths.dofCommon, 'utf8'),
  readFile(sourcePaths.dofUtils, 'utf8'),
  readFile(sourcePaths.threeDof, 'utf8'),
]);
assert.equal(
  sha256(cineCamera),
  '62b5254e867e903368a9369bcdcc8fd540780facd4339dab84e17b81e5786d6d',
);
assert.equal(
  sha256(dofCommon),
  'aa686d7cd862c61532b1c5244e01c794705f900e583d33ff3048639bafe4bcab',
);
assert.equal(
  sha256(dofUtils),
  'ac47acad83b45c07b1593198793cd705518b54a9d1b6b0c3f28a3665c7d0865b',
);
assert.equal(
  sha256(threeDof),
  '28c0f3ed5385e9881570ad954838456197ae1429e7ed5d186691724d285c3f62',
);
assert.match(
  cineCamera,
  /DepthOfFieldFocalDistance = CurrentFocusDistance;/,
);
assert.match(
  cineCamera,
  /DepthOfFieldSensorWidth = Filmback\.SensorWidth \* OverscanScalar;/,
);
assert.match(
  dofCommon,
  /\(\(SceneDepth - Focus\) \/ SceneDepth\) \* CocInfinityRadius/,
);
assert.match(
  dofUtils,
  /InfinityBackgroundCocRadius = VerticalInfinityBackgroundCocRadius \/ RenderingAspectRatio;/,
);
assert.match(threeDof, /Loop\( 64/);
assert.match(threeDof, /Loop\( 16/);
assert.match(threeDof, /max\( tap\.rgb, maxVal \)/);

console.log('UE source DiaphragmDOF physical CoC verification passed');
console.log('- camera 1 far-field limit: 0.652790 px at 1280 px');
console.log('- gather backend: partial (Three 64+16 tap bridge; UE gather/scatter remains)');
