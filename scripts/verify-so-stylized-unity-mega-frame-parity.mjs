#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  buildSoStylizedUnityMegaNativeDetailPlacements,
  buildSoStylizedUnityMegaTerrainGeometry,
  decodeSoStylizedUnityFloat32,
  applySoStylizedUnityMegaTerrainPosition,
  instantiateSoStylizedUnityMegaTerrainTrees,
} from '../src/environment/soStylizedUnityMegaTerrain.js';
import {
  applySoStylizedUnityTerrainNativeAuthority,
  SO_STYLIZED_UNITY_TERRAIN_NATIVE_AUTHORITY_FILE,
} from '../src/environment/soStylizedUnityTerrainNativeAuthority.js';
import {
  applySoStylizedUnityMegaCameraRecord,
  applySoStylizedUnityMegaRendererState,
} from '../src/environment/soStylizedUnityMegaScene.js';
import {
  SO_STYLIZED_UNITY_MEGA_PARITY_VIEWPORT,
  attachSoStylizedUnityMegaCameraToRenderScene,
  createSoStylizedUnityMegaFrameParityReport,
} from '../src/environment/soStylizedUnityMegaFrameParity.js';

const ROOT = process.cwd();
const SCENE_ROOT = path.resolve(
  ROOT,
  process.env.SO_STYLIZED_UNITY_MEGA_SCENE_ROOT
    ?? 'assets-local/sostylized-unity/mega-scene-native-pc-current',
);
const fail = (message) => {
  throw new Error(`Unity Mega frame-parity verification failed: ${message}`);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const read = (relativePath) => fs.readFileSync(path.join(SCENE_ROOT, relativePath));
const toArrayBuffer = (bytes) => bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);

const rawManifest = JSON.parse(read('scene-manifest.json'));
const terrainNativeAuthority = JSON.parse(read(
  SO_STYLIZED_UNITY_TERRAIN_NATIVE_AUTHORITY_FILE,
));
const manifest = applySoStylizedUnityTerrainNativeAuthority(
  rawManifest,
  terrainNativeAuthority,
);
const terrain = manifest.terrains?.[0];
const terrainNode = terrain && manifest.nodes?.[terrain.node];
const cameraRecord = manifest.cameras?.[0];
const cameraNode = cameraRecord && manifest.nodes?.[cameraRecord.node];
assert(terrain && terrainNode, 'terrain source records are missing');
assert(cameraRecord && cameraNode, 'camera source records are missing');

if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(toArrayBuffer(read(manifest.glb)), '', resolve, reject);
});
applySoStylizedUnityMegaRendererState(gltf.scene, manifest);
const camera = gltf.cameras[0];
applySoStylizedUnityMegaCameraRecord(camera, cameraRecord, {
  aspect: SO_STYLIZED_UNITY_MEGA_PARITY_VIEWPORT.aspect,
});

// Reproduce the exact regression: OrbitControls updates once in its
// constructor with target=(0,0,0). While the glTF camera is still nested under
// C_SpectatorCamera, it interprets local position as world position and
// corrupts the source quaternion before the first frame.
const documentStub = { addEventListener() {}, removeEventListener() {} };
const elementStub = {
  addEventListener() {},
  getBoundingClientRect() {
    return {
      bottom: SO_STYLIZED_UNITY_MEGA_PARITY_VIEWPORT.height,
      height: SO_STYLIZED_UNITY_MEGA_PARITY_VIEWPORT.height,
      left: 0,
      right: SO_STYLIZED_UNITY_MEGA_PARITY_VIEWPORT.width,
      top: 0,
      width: SO_STYLIZED_UNITY_MEGA_PARITY_VIEWPORT.width,
    };
  },
  getRootNode() { return documentStub; },
  ownerDocument: documentStub,
  releasePointerCapture() {},
  removeEventListener() {},
  setPointerCapture() {},
  style: {},
};
gltf.scene.updateMatrixWorld(true);
const sourceQuaternionBeforeControls = camera.getWorldQuaternion(new THREE.Quaternion());
const regressedControls = new OrbitControls(camera, elementStub);
gltf.scene.updateMatrixWorld(true);
camera.updateWorldMatrix(true, false);
const regressedQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
const regressedAngularError = 2 * Math.acos(THREE.MathUtils.clamp(
  Math.abs(sourceQuaternionBeforeControls.dot(regressedQuaternion)),
  -1,
  1,
));
assert(
  regressedAngularError > 0.05,
  `nested OrbitControls regression fixture stopped reproducing (${regressedAngularError} rad)`,
);
regressedControls.dispose();

// Restore the exported local pose after the deliberate regression, then use
// the production attachment path.
const parentNode = manifest.nodes[cameraNode.parent];
camera.position.fromArray(parentNode ? cameraNode.localPosition : cameraNode.worldPosition);
camera.quaternion.set(
  -cameraNode.localRotation[0],
  -cameraNode.localRotation[1],
  cameraNode.localRotation[2],
  cameraNode.localRotation[3],
).normalize();
camera.scale.fromArray(cameraNode.localScale);
gltf.scene.updateMatrixWorld(true);

const renderScene = new THREE.Scene();
renderScene.add(gltf.scene);
const attachment = attachSoStylizedUnityMegaCameraToRenderScene(
  camera,
  renderScene,
  { cameraNode },
);
assert(attachment.worldPosePreserved, 'camera attachment did not preserve world pose');
assert(camera.parent === renderScene, 'camera is still nested under its exported rig');

// OrbitControls still performs its default-target constructor update after
// detachment. The showcase therefore restores this captured source pose and
// sets a target on its exact forward ray before accepting the controls state.
const exactPosition = camera.position.clone();
const exactQuaternion = camera.quaternion.clone();
const controls = new OrbitControls(camera, elementStub);
camera.position.copy(exactPosition);
camera.quaternion.copy(exactQuaternion);
camera.updateMatrixWorld(true);
const forward = camera.getWorldDirection(new THREE.Vector3());
controls.target.copy(camera.position).addScaledVector(forward, 100);
controls.update();
camera.updateMatrixWorld(true);

const heights = decodeSoStylizedUnityFloat32(toArrayBuffer(read(terrain.heights)));
const alphamaps = decodeSoStylizedUnityFloat32(toArrayBuffer(read(terrain.alphamaps)));
const holes = new Uint8Array(toArrayBuffer(read(terrain.holes)));
const geometry = buildSoStylizedUnityMegaTerrainGeometry(terrain, heights, holes);
const terrainRoot = new THREE.Group();
terrainRoot.name = terrain.name;
applySoStylizedUnityMegaTerrainPosition(terrainRoot, terrain, terrainNode);

const trees = instantiateSoStylizedUnityMegaTerrainTrees({
  manifest,
  prefabLibrary: gltf.scenes[1],
});
terrainRoot.add(trees.group);
renderScene.add(terrainRoot);
renderScene.updateMatrixWorld(true);

const detailPrototypeEntries = terrain.detailPrototypes.map((prototype) => {
  const bytes = read(prototype.nativeTransforms.data);
  return {
    placements: buildSoStylizedUnityMegaNativeDetailPlacements({
      prototype,
      terrain,
      transformSet: {
        record: prototype.nativeTransforms,
        transforms: decodeSoStylizedUnityFloat32(toArrayBuffer(bytes)),
      },
    }),
    prototypeIndex: prototype.index,
  };
});
const terrainRuntime = {
  details: { prototypeEntries: detailPrototypeEntries },
  geometry,
  heights,
  root: terrainRoot,
  sampleSplatLocal: (x, sourceZ) => {
    const offset = (sourceZ * terrain.alphamapWidth + x) * terrain.alphamapLayers;
    return Array.from(alphamaps.subarray(offset, offset + terrain.alphamapLayers));
  },
  terrainIndex: 0,
  trees,
};
const report = createSoStylizedUnityMegaFrameParityReport({
  camera,
  manifest,
  renderScene,
  sceneRoot: gltf.scene,
  terrainRuntime,
});
assert(report.exact, `frame report is not exact: ${JSON.stringify(report)}`);
assert(report.camera.parentIsRenderScene, 'camera parent gate failed');
assert(report.camera.positionError <= 1e-4, 'camera position differs from reflected source');
assert(report.camera.quaternionErrorRadians <= 1e-5, 'camera rotation differs from reflected source');
assert(report.camera.aspectError <= 1e-5, '1920x1080 projection aspect drifted');
assert(report.projection.projectedLandmarkCount > 500, 'projection gate lost landmark coverage');
assert(report.projection.frustumLandmarkCount > 100, 'projection gate lost in-frame landmarks');
assert(report.projection.maximumError <= 1e-5, 'Unity/Three landmark projection diverged');
assert(report.nodeFrame.compared === manifest.nodes.length, 'static GLB node coverage drifted');
assert(report.nodeFrame.missing === 0, 'static GLB node map lost source nodes');
assert(report.terrainFrame.rootMatrixError <= 1e-4, 'Terrain root frame drifted');
assert(report.terrainFrame.geometryCornerError === 0, 'Terrain axes/corners drifted');
assert(report.terrainFrame.geometrySampleError <= 1e-4, `sampled Terrain heights drifted: ${report.terrainFrame.geometrySampleError}`);
assert(report.terrainFrame.maximumSurfacePositionError <= 1e-4, 'sampled Terrain world surface drifted');
assert(report.terrainFrame.surfaceProbeCount === 81, 'Terrain surface projection probe coverage drifted');
assert(report.terrainFrame.nativeSurfaceProbeCount === 81, 'native TerrainData probe coverage drifted');
assert(report.terrainFrame.maximumNativeProbeHeightError <= 1e-4, 'native TerrainData height probes drifted');
assert(report.terrainFrame.maximumNativeProbeSplatError <= 1e-5, 'native TerrainData splat probes drifted');
assert(report.terrainFrame.maximumNativeProbeWorldPositionError <= 1e-4, 'native TerrainData world probes drifted');
assert(report.terrainFrame.nativeRendererVsSerializedTransformMaximumDelta > 50, 'native probe no longer demonstrates ignored Transform rotation/scale');
assert(report.terrainFrame.maximumTreePositionError <= 1e-4, 'Terrain tree frame drifted');
assert(report.terrainFrame.maximumDetailPositionError <= 1e-4, 'native detail frame drifted');
assert(report.terrainFrame.treeSurfaceHeightSampleCount === terrain.treeInstances.length, 'tree/heightfield row-authority coverage drifted');
assert(report.terrainFrame.maximumTreeSurfaceHeightError <= 0.35, 'tree/heightfield row authority drifted');
assert(report.terrainFrame.meanTreeSurfaceHeightError <= 0.05, 'tree/heightfield mean row authority drifted');

const showcaseSource = fs.readFileSync(
  path.join(ROOT, 'examples/unity-showcase/main.js'),
  'utf8',
);
const attachIndex = showcaseSource.indexOf('attachSoStylizedUnityMegaCameraToRenderScene(');
const controlsIndex = showcaseSource.indexOf('new OrbitControls(camera, renderer.domElement)');
assert(attachIndex >= 0 && attachIndex < controlsIndex, 'showcase creates controls before camera attachment');
assert(
  showcaseSource.includes('camera.quaternion.copy(sourceCameraQuaternion);'),
  'showcase no longer restores the source quaternion after OrbitControls construction',
);
assert(
  showcaseSource.includes('createSoStylizedUnityMegaFrameParityReport({'),
  'showcase no longer enforces the numerical frame gate',
);
const captureSource = fs.readFileSync(
  path.join(ROOT, 'scripts/unity/UnityParityCapture.cs'),
  'utf8',
);
assert(
  captureSource.includes('s_Camera.aspect = (float)s_Width / s_Height;'),
  'native capture projection is no longer locked to its output aspect',
);
assert(
  captureSource.includes('camera.worldToCameraMatrix={MatrixToString(camera.worldToCameraMatrix)}'),
  'native capture report lost its world-to-camera matrix',
);
assert(
  captureSource.includes('camera.projectionMatrix={MatrixToString(camera.projectionMatrix)}'),
  'native capture report lost its projection matrix',
);

controls.dispose();
trees.dispose();
geometry.dispose();

console.log('So Stylized Unity Mega camera/terrain frame verified numerically');
console.log(`  root cause fixture: nested OrbitControls changed rotation by ${regressedAngularError.toFixed(6)} rad`);
console.log(`  camera pose: ${report.camera.positionError} m / ${report.camera.quaternionErrorRadians} rad`);
console.log(`  projections: ${report.projection.projectedLandmarkCount} landmarks / max error ${report.projection.maximumError}`);
console.log(`  static nodes: ${report.nodeFrame.compared}/${manifest.nodes.length}`);
console.log(`  Terrain frame: root ${report.terrainFrame.rootMatrixError} / trees ${report.terrainFrame.maximumTreePositionError} / details ${report.terrainFrame.maximumDetailPositionError}`);
console.log(`  Terrain surface: ${report.terrainFrame.surfaceProbeCount} probes / max ${report.terrainFrame.maximumSurfacePositionError} m`);
console.log(`  native TerrainData: ${report.terrainFrame.nativeSurfaceProbeCount} probes / height ${report.terrainFrame.maximumNativeProbeHeightError} m / splat ${report.terrainFrame.maximumNativeProbeSplatError} / world ${report.terrainFrame.maximumNativeProbeWorldPositionError} m`);
console.log(`  height row authority: ${report.terrainFrame.treeSurfaceHeightSampleCount} trees / mean ${report.terrainFrame.meanTreeSurfaceHeightError} m / max ${report.terrainFrame.maximumTreeSurfaceHeightError} m`);
