#!/usr/bin/env node

// Deterministic source-integration gate for Unity normal maps and the two
// geometry bridges used by the So Stylized scene. This intentionally compares
// exported source data and decoded texture bytes; it does not inspect pixels
// from a ToonLab render.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { decodePng } from './landscape-weight-export-core.mjs';
import {
  SO_STYLIZED_UNITY_NORMAL_INTEGRATION_CONTRACT,
  decodeSoStylizedUnityNormalSample,
  reflectSoStylizedUnityVector,
  soStylizedUnityTangentNormalToWorld,
} from '../src/environment/soStylizedUnityNormalIntegration.js';
import { buildSoStylizedUnityMegaTerrainMaterial } from '../src/environment/soStylizedUnityMegaTerrain.js';
import { buildSoStylizedUnitySceneFoliageMaterial } from '../src/environment/soStylizedUnitySceneFoliageMaterials.js';
import { buildSoStylizedUnitySceneTreeMaterial } from '../src/environment/soStylizedUnitySceneTreeMaterials.js';
import { SoStylizedSourceLibrary } from '../src/environment/soStylizedSourceLibrary.js';
import {
  buildSoStylizedUnityPineBarkMaterial,
  buildSoStylizedUnityPineLeavesMaterial,
} from '../src/environment/soStylizedUnityTreeMaterials.js';
import {
  loadUnityMountainMaterial,
  loadUnityRockMaterial,
} from '../src/rockgen/reference/unityRockMaterial.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '..');
const MEGA_ROOT = path.join(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene',
);
const MANIFEST_PATH = path.join(MEGA_ROOT, 'scene-manifest.json');
const SCENE_GLB_PATH = path.join(MEGA_ROOT, 'scene.glb');
const SNOWPINES_ROCK_PATH = path.join(
  PACKAGE_ROOT,
  'assets-local/rock-references/SM_RockClassic7/lod0.glb',
);
const ROCK_LIBRARY_PATH = path.join(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/rock-material-library.json',
);
const SNOWPINES_MATERIAL_MANIFEST_PATH = path.join(
  PACKAGE_ROOT,
  'assets-local/sostylized/material-source/manifest.json',
);

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const rockLibrary = JSON.parse(fs.readFileSync(ROCK_LIBRARY_PATH, 'utf8'));
const snowPinesMaterialManifest = JSON.parse(
  fs.readFileSync(SNOWPINES_MATERIAL_MANIFEST_PATH, 'utf8'),
);

function near(actual, expected, epsilon = 1e-7, label = 'value') {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function vectorNear(actual, expected, epsilon = 1e-7, label = 'vector') {
  assert.equal(actual.length, expected.length, `${label} channel count`);
  actual.forEach((value, index) => near(
    value,
    expected[index],
    epsilon,
    `${label}[${index}]`,
  ));
}

function attributeAt(mesh, name, index) {
  const attribute = mesh.geometry.getAttribute(name);
  assert.ok(attribute, `${mesh.name} has ${name}`);
  return Array.from(
    attribute.array.slice(index * attribute.itemSize, (index + 1) * attribute.itemSize),
  );
}

function squaredDistance(left, right) {
  return left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0,
  );
}

if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}

async function parseGlb(file) {
  const bytes = fs.readFileSync(file);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
}

function findMesh(gltf, predicate, label) {
  let result = null;
  for (const scene of gltf.scenes) {
    scene.traverse((object) => {
      if (!result && object.isMesh && predicate(object)) result = object;
    });
  }
  assert.ok(result, `missing ${label}`);
  return result;
}

// Pin the authored coordinate/UV contract itself.
assert.equal(SO_STYLIZED_UNITY_NORMAL_INTEGRATION_CONTRACT.unityMegaScene.zSign, -1);
assert.equal(SO_STYLIZED_UNITY_NORMAL_INTEGRATION_CONTRACT.unityMegaScene.textureFlipY, true);
assert.equal(SO_STYLIZED_UNITY_NORMAL_INTEGRATION_CONTRACT.snowPinesUeGltf.textureFlipY, false);
assert.equal(SO_STYLIZED_UNITY_NORMAL_INTEGRATION_CONTRACT.decode.channels, 'RG');
assert.equal(manifest.coordinateSystem.manifest, 'Unity left-handed Y-up, +Z forward, metres');
assert.match(manifest.coordinateSystem.glb, /Unity Z is reflected/);

const exporterSource = fs.readFileSync(
  path.join(PACKAGE_ROOT, 'scripts/unity/UnitySceneExport.cs'),
  'utf8',
);
assert.match(exporterSource, /values\[i \* 3 \+ 2\] = -source\[i\]\.z;/);
assert.match(exporterSource, /values\[i \* 4 \+ 2\] = -source\[i\]\.z;/);
assert.match(exporterSource, /values\[i \* 4 \+ 3\] = -source\[i\]\.w;/);
assert.match(exporterSource, /values\[i \* componentCount \+ 1\] = source\[i\]\.y;/);
assert.match(exporterSource, /sourceIndices\[i \+ 1\] = sourceIndices\[i \+ 2\];/);

// Unity's installed URP implementation is the decode authority: reconstruct Z
// first, then apply normal scale to XY. The source PNG blue channel is not the
// runtime normal's Z channel.
const unityPackageRoot =
  '/Applications/Unity/Hub/Editor/6000.5.4f1/Unity.app/Contents/Resources/PackageManager/BuiltInPackages';
const packingPath = path.join(
  unityPackageRoot,
  'com.unity.render-pipelines.core/ShaderLibrary/Packing.hlsl',
);
const terrainInputPath = path.join(
  unityPackageRoot,
  'com.unity.render-pipelines.universal/Shaders/Terrain/TerrainLitInput.hlsl',
);
assert.ok(fs.existsSync(packingPath), 'Unity Packing.hlsl is unavailable');
assert.ok(fs.existsSync(terrainInputPath), 'Unity TerrainLitInput.hlsl is unavailable');
const packingSource = fs.readFileSync(packingPath, 'utf8');
const terrainInputSource = fs.readFileSync(terrainInputPath, 'utf8');
assert.match(
  packingSource,
  /normal\.z = max\(1\.0e-16, sqrt\(1\.0 - saturate\(dot\(normal\.xy, normal\.xy\)\)\)\);/,
);
assert.match(packingSource, /normal\.xy \*= scale;/);
assert.match(packingSource, /real3 UnpackNormalMapRGorAG/);
assert.match(terrainInputSource, /#define SampleLayerNormal\(i\) UnpackNormalScale/);

const megaGltf = await parseGlb(SCENE_GLB_PATH);
const treeBarkMesh = findMesh(
  megaGltf,
  (mesh) => mesh.name === 'SM_Pine02_LOD0_11' && mesh.material?.name === 'M_PineBark',
  'Unity Mega SM_Pine02_LOD0 bark mesh',
);
assert.equal(treeBarkMesh.geometry.getAttribute('position').count, 2950);
assert.equal(treeBarkMesh.geometry.index.count, 5808);

// This known exported vertex plus one known source normal-map texel produces a
// fully deterministic tangent -> reflected world -> view normal chain.
const treeNormal = attributeAt(treeBarkMesh, 'normal', 1);
const treeTangent = attributeAt(treeBarkMesh, 'tangent', 1);
const treeUv = attributeAt(treeBarkMesh, 'uv', 1);
vectorNear(
  treeNormal,
  [0.026977336034178734, 0.8957000374794006, -0.4438396692276001],
  1e-8,
  'known Unity tree normal',
);
vectorNear(
  treeTangent,
  [-0.9988247752189636, 0.042037609964609146, 0.024124378338456154, 1],
  1e-8,
  'known Unity tree tangent',
);
vectorNear(
  treeUv,
  [0.24760742485523224, 1.4636402130126953],
  1e-8,
  'known unchanged Unity UV',
);

const pineNormalRecord = manifest.textures.find((record) => record.name === 'T_PineBark_N');
assert.ok(pineNormalRecord?.exactSourceCopy, 'T_PineBark_N exact source copy');
assert.equal(pineNormalRecord.importer.textureType, 'NormalMap');
assert.equal(pineNormalRecord.importer.sRGBTexture, false);
assert.equal(pineNormalRecord.importer.flipGreenChannel, true);
const pineNormalPng = decodePng(fs.readFileSync(
  path.join(MEGA_ROOT, pineNormalRecord.exactSourceCopy),
));
assert.equal(pineNormalPng.width, 4096);
assert.equal(pineNormalPng.height, 4096);
assert.equal(pineNormalPng.channels, 4);
const knownTexelOffset = (3360 * pineNormalPng.width) * pineNormalPng.channels;
const knownTexel = Array.from(
  pineNormalPng.pixels.slice(knownTexelOffset, knownTexelOffset + 4),
);
assert.deepEqual(knownTexel, [201, 149, 203, 255]);
const tangentNormal = decodeSoStylizedUnityNormalSample(
  knownTexel.slice(0, 3).map((channel) => channel / 255),
  {
    flipGreenChannel: pineNormalRecord.importer.flipGreenChannel,
    strength: 1,
    strengthMode: 'shader-graph',
  },
);
vectorNear(
  tangentNormal,
  [0.5764705882352941, -0.16862745098039222, 0.7995288885809627],
  1e-12,
  'decoded Unity tangent normal',
);
assert.ok(
  Math.abs(tangentNormal[2] - (knownTexel[2] / 255 * 2 - 1)) > 0.2,
  'gate distinguishes reconstructed Z from the source PNG blue channel',
);
const treeWorldNormal = soStylizedUnityTangentNormalToWorld({
  normal: treeNormal,
  tangent: treeTangent,
  tangentNormal,
});
vectorNear(
  treeWorldNormal,
  [-0.5610138781290402, 0.6657256273181824, -0.49200896097370717],
  1e-12,
  'Three reflected world normal',
);
const sourceUnityWorldNormal = reflectSoStylizedUnityVector(treeWorldNormal);
vectorNear(
  sourceUnityWorldNormal,
  [-0.5610138781290402, 0.6657256273181824, 0.49200896097370717],
  1e-12,
  'source Unity world normal',
);
const fixedViewMatrix = new THREE.Matrix4().makeRotationFromEuler(
  new THREE.Euler(-0.37, 0.61, 0.19, 'YXZ'),
);
const treeViewNormal = new THREE.Vector3(...treeWorldNormal)
  .transformDirection(fixedViewMatrix)
  .toArray();
vectorNear(
  treeViewNormal,
  [-0.9308732405913303, 0.3328042901596341, -0.15071932325464293],
  1e-12,
  'known Unity tree view normal',
);
const wrongGreenWorld = soStylizedUnityTangentNormalToWorld({
  normal: treeNormal,
  tangent: treeTangent,
  tangentNormal: decodeSoStylizedUnityNormalSample(
    knownTexel.slice(0, 2).map((channel) => channel / 255),
    { flipGreenChannel: false },
  ),
});
assert.ok(
  new THREE.Vector3(...treeWorldNormal).distanceTo(
    new THREE.Vector3(...wrongGreenWorld),
  ) > 0.3,
  'known tree sample is sensitive to TextureImporter.flipGreenChannel',
);

// The SnowPines UE glTF is the other source bridge. Select the matching seam
// vertex by position plus normal/UV score and prove the source-space mapping.
const snowPinesGltf = await parseGlb(SNOWPINES_ROCK_PATH);
const snowPinesRock = findMesh(
  snowPinesGltf,
  (mesh) => mesh.name === 'SM_RockClassic7',
  'SnowPines SM_RockClassic7',
);
const megaRock = findMesh(
  megaGltf,
  (mesh) => mesh.name === 'P_RockClassic7'
    && mesh.material?.name === 'MV_RockClassic_Rocks',
  'Unity Mega P_RockClassic7',
);
assert.equal(snowPinesRock.geometry.getAttribute('position').count, 139);
assert.equal(megaRock.geometry.getAttribute('position').count, 139);
const localPosition = attributeAt(snowPinesRock, 'position', 0);
const localNormal = attributeAt(snowPinesRock, 'normal', 0);
const localTangent = attributeAt(snowPinesRock, 'tangent', 0);
const localUv = attributeAt(snowPinesRock, 'uv', 0);
const expectedMegaPosition = [-localPosition[0], localPosition[1], -localPosition[2]];
const expectedMegaNormal = [-localNormal[0], localNormal[1], -localNormal[2]];
const expectedMegaTangent = [
  -localTangent[0],
  localTangent[1],
  -localTangent[2],
  localTangent[3],
];
const expectedMegaUv = [localUv[0], 1 - localUv[1]];
const megaPositionAttribute = megaRock.geometry.getAttribute('position');
const positionMatches = [];
for (let index = 0; index < megaPositionAttribute.count; index += 1) {
  const candidate = attributeAt(megaRock, 'position', index);
  if (squaredDistance(candidate, expectedMegaPosition) <= 5e-6 ** 2) {
    positionMatches.push(index);
  }
}
assert.ok(positionMatches.length > 0, 'SnowPines rock vertex maps into Unity Mega geometry');
const matchingMegaIndex = positionMatches.reduce((best, index) => {
  const score = squaredDistance(attributeAt(megaRock, 'normal', index), expectedMegaNormal)
    + squaredDistance(attributeAt(megaRock, 'uv', index), expectedMegaUv);
  return !best || score < best.score ? { index, score } : best;
}, null).index;
const megaPosition = attributeAt(megaRock, 'position', matchingMegaIndex);
const megaNormal = attributeAt(megaRock, 'normal', matchingMegaIndex);
const megaTangent = attributeAt(megaRock, 'tangent', matchingMegaIndex);
const megaUv = attributeAt(megaRock, 'uv', matchingMegaIndex);
vectorNear(megaPosition, expectedMegaPosition, 5e-6, 'UE -> Unity Mega position');
vectorNear(megaNormal, expectedMegaNormal, 0.006, 'UE -> Unity Mega normal');
vectorNear(megaTangent, expectedMegaTangent, 0.006, 'UE -> Unity Mega tangent');
vectorNear(megaUv, expectedMegaUv, 0.001, 'UE -> Unity Mega UV');
const bridgeTangentNormal = decodeSoStylizedUnityNormalSample([0.63, 0.42]);
const snowPinesWorldNormal = soStylizedUnityTangentNormalToWorld({
  normal: localNormal,
  tangent: localTangent,
  tangentNormal: bridgeTangentNormal,
});
const megaRockWorldNormal = soStylizedUnityTangentNormalToWorld({
  normal: megaNormal,
  tangent: megaTangent,
  tangentNormal: bridgeTangentNormal,
});
vectorNear(
  megaRockWorldNormal,
  [-snowPinesWorldNormal[0], snowPinesWorldNormal[1], -snowPinesWorldNormal[2]],
  0.007,
  'same normal texel across UE/Unity export bases',
);

// Runtime material metadata must expose the source convention instead of
// leaving callers to infer it from shader-node internals.
const makeTextureLoader = () => {
  const textures = [];
  return {
    textures,
    loadAsync: async (url) => {
      const texture = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
        THREE.RGBAFormat,
      );
      texture.name = url;
      textures.push(texture);
      return texture;
    },
  };
};
const barkRecord = manifest.materials.find((record) => record.name === 'M_PineBark');
const leavesRecord = manifest.materials.find((record) => record.name === 'M_PineLeaves');
const foliageRecord = manifest.materials.find(
  (record) => record.shaderName === 'Shader Graphs/S_FoliageShader',
);
assert.ok(barkRecord && leavesRecord && foliageRecord, 'normal integration material records');

const treeLoader = makeTextureLoader();
const barkMaterial = await buildSoStylizedUnitySceneTreeMaterial(barkRecord, {
  coordinateZSign: -1,
  geometryCapabilities: { hasTangents: true, hasUv2: true, hasVertexColors: true },
  textureLoader: treeLoader,
  textureRecords: manifest.textures,
});
assert.ok(treeLoader.textures.length > 0);
assert.ok(treeLoader.textures.every((map) => map.flipY === true));
assert.equal(barkMaterial.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
assert.equal(barkMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, true);
assert.equal(barkMaterial.userData.soStylizedUnityNormalIntegration.flipGreenChannel, true);
assert.match(barkMaterial.userData.soStylizedUnityNormalIntegration.decode, /reconstructed positive Z/);

const leavesMaterial = await buildSoStylizedUnitySceneTreeMaterial(leavesRecord, {
  coordinateZSign: -1,
  geometryCapabilities: { hasTangents: true, hasUv2: true, hasVertexColors: true },
  textureLoader: treeLoader,
  textureRecords: manifest.textures,
});
assert.equal(leavesMaterial.userData.soStylizedUnityNormalIntegration.decode, 'geometry-only');
assert.equal(leavesMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, true);

const snowPinesTreeLoader = makeTextureLoader();
const snowPinesLibrary = new SoStylizedSourceLibrary(snowPinesMaterialManifest, {
  baseUrl: '/normal-gate/snowpines-trees',
  textureLoader: snowPinesTreeLoader,
});
const snowPinesBarkResult = await buildSoStylizedUnityPineBarkMaterial(
  snowPinesLibrary.resolveMaterial('MI_PineBark'),
  { library: snowPinesLibrary },
);
const snowPinesLeavesResult = await buildSoStylizedUnityPineLeavesMaterial(
  snowPinesLibrary.resolveMaterial('MI_PineLeaves'),
  {
    hasUv2: true,
    hasVertexColors: true,
    library: snowPinesLibrary,
  },
);
assert.ok(snowPinesTreeLoader.textures.length > 0);
assert.ok(snowPinesTreeLoader.textures.every((map) => map.flipY === false));
assert.equal(
  snowPinesBarkResult.material.userData.soStylizedUnityNormalIntegration.coordinateZSign,
  1,
);
assert.equal(
  snowPinesBarkResult.material.userData.soStylizedUnityNormalIntegration.textureFlipY,
  false,
);
assert.equal(
  snowPinesBarkResult.material.userData.soStylizedUnityNormalIntegration.flipGreenChannel,
  true,
);
assert.match(
  snowPinesBarkResult.material.userData.soStylizedUnityNormalIntegration.decode,
  /reconstructed positive Z/,
);
assert.equal(
  snowPinesLeavesResult.material.userData.soStylizedUnityNormalIntegration.decode,
  'geometry-only',
);

const foliageLoader = makeTextureLoader();
const foliageMaterial = await buildSoStylizedUnitySceneFoliageMaterial(
  foliageRecord,
  manifest,
  { textureLoader: foliageLoader },
);
assert.ok(foliageLoader.textures.length > 0);
assert.ok(foliageLoader.textures.every((map) => map.flipY === true));
assert.equal(foliageMaterial.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
assert.equal(foliageMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, true);
assert.match(foliageMaterial.userData.soStylizedUnityNormalIntegration.decode, /geometry-only/);

const control0 = new THREE.DataTexture(
  new Float32Array([1, 0, 0, 0]),
  1,
  1,
  THREE.RGBAFormat,
  THREE.FloatType,
);
const control1 = new THREE.DataTexture(
  new Float32Array([0]),
  1,
  1,
  THREE.RedFormat,
  THREE.FloatType,
);
const terrainTextures = [];
const terrainLayers = manifest.terrains[0].layers.map((layer) => {
  const diffuseMap = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  const normalMap = layer.normalMapTexture >= 0
    ? new THREE.DataTexture(
      new Uint8Array([128, 128, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    )
    : null;
  terrainTextures.push(diffuseMap, ...(normalMap ? [normalMap] : []));
  return {
    ...layer,
    diffuseMap,
    normalMap,
    diffuseTextureRecord: manifest.textures[layer.diffuseTexture],
    normalTextureRecord: layer.normalMapTexture >= 0
      ? manifest.textures[layer.normalMapTexture]
      : null,
  };
});
const terrainMaterial = buildSoStylizedUnityMegaTerrainMaterial({
  terrain: manifest.terrains[0],
  controlTextures: [control0, control1],
  layers: terrainLayers,
});
assert.equal(terrainMaterial.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
assert.equal(terrainMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, true);
assert.match(terrainMaterial.userData.soStylizedUnityNormalIntegration.decode, /UnpackNormalScale/);
assert.ok(
  terrainMaterial.userData.soStylizedUnityMegaTerrain.layers
    .filter((layer) => layer.normalTexture)
    .every((layer) => layer.normalFlipGreenChannel === false),
  'terrain normal layers expose importer green-channel state',
);

const megaRockLoader = makeTextureLoader();
const megaRockMaterial = await loadUnityRockMaterial({
  manifest: rockLibrary,
  material: 'MV_RockClassic_Rocks',
  baseUrl: '/normal-gate/unity-mega',
  coordinates: { zSign: -1, distanceScale: 1 },
  textureFlipY: true,
  textureLoader: megaRockLoader,
});
assert.ok(megaRockLoader.textures.length > 0);
assert.ok(megaRockLoader.textures.every((map) => map.flipY === true));
assert.equal(megaRockMaterial.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
assert.equal(megaRockMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, true);

const snowPinesRockLoader = makeTextureLoader();
const snowPinesRockMaterial = await loadUnityRockMaterial({
  manifest: rockLibrary,
  material: 'MV_RockClassic_Rocks',
  baseUrl: '/normal-gate/snowpines',
  coordinates: { zSign: 1, distanceScale: 1 },
  textureFlipY: false,
  textureLoader: snowPinesRockLoader,
});
assert.ok(snowPinesRockLoader.textures.length > 0);
assert.ok(snowPinesRockLoader.textures.every((map) => map.flipY === false));
assert.equal(snowPinesRockMaterial.userData.soStylizedUnityNormalIntegration.coordinateZSign, 1);
assert.equal(snowPinesRockMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, false);

const mountainLoader = makeTextureLoader();
const mountainMaterial = await loadUnityMountainMaterial({
  manifest: rockLibrary,
  material: 'M_Mountain',
  baseUrl: '/normal-gate/unity-mountain',
  coordinates: { zSign: -1, flipProceduralUvY: false },
  textureFlipY: true,
  textureLoader: mountainLoader,
});
assert.ok(mountainLoader.textures.length > 0);
assert.ok(mountainLoader.textures.every((map) => map.flipY === true));
assert.equal(mountainMaterial.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
assert.equal(mountainMaterial.userData.soStylizedUnityNormalIntegration.textureFlipY, true);
assert.match(mountainMaterial.userData.soStylizedUnityNormalIntegration.decode, /geometry-only/);

const implementationSources = Object.fromEntries([
  'megaScene',
  'megaTerrain',
  'sceneRecords',
  'sceneTrees',
  'snowPinesTrees',
  'rock',
].map((name) => {
  const paths = {
    megaScene: 'src/environment/soStylizedUnityMegaScene.js',
    megaTerrain: 'src/environment/soStylizedUnityMegaTerrain.js',
    sceneRecords: 'src/environment/soStylizedUnitySceneRecords.js',
    sceneTrees: 'src/environment/soStylizedUnitySceneTreeMaterials.js',
    snowPinesTrees: 'src/environment/soStylizedUnityTreeMaterials.js',
    rock: 'src/rockgen/reference/unityRockMaterial.js',
  };
  return [name, fs.readFileSync(path.join(PACKAGE_ROOT, paths[name]), 'utf8')];
}));
assert.match(implementationSources.sceneRecords, /result\.flipY = true;/);
assert.equal((implementationSources.megaScene.match(/textureFlipY: true/g) ?? []).length, 2);
assert.match(implementationSources.megaTerrain, /decodeSoStylizedUnityNormalNode/);
assert.doesNotMatch(
  implementationSources.megaTerrain,
  /const unpacked = normalSample\.mul\(2\)\.sub\(1\)/,
);
assert.match(implementationSources.sceneTrees, /decodeSoStylizedUnityNormalNode/);
assert.match(implementationSources.snowPinesTrees, /textureFlipY: false/);
assert.doesNotMatch(implementationSources.snowPinesTrees, /normalMap as normalMapNode/);
assert.match(implementationSources.rock, /cacheKey = `\$\{url\}\|flipY=/);

for (const material of [
  barkMaterial,
  leavesMaterial,
  snowPinesBarkResult.material,
  snowPinesLeavesResult.material,
  foliageMaterial,
  terrainMaterial,
  megaRockMaterial,
  snowPinesRockMaterial,
  mountainMaterial,
]) material.dispose();
for (const map of [
  ...treeLoader.textures,
  ...snowPinesTreeLoader.textures,
  ...foliageLoader.textures,
  ...terrainTextures,
  ...megaRockLoader.textures,
  ...snowPinesRockLoader.textures,
  ...mountainLoader.textures,
  control0,
  control1,
]) map.dispose();

console.log('So Stylized Unity normal integration verified source-to-source');
console.log('  Unity Mega: reflected Z/tangent.w, unchanged UV.y, Texture.flipY=true');
console.log('  SnowPines UE glTF: (-x,y,-z), inverse UV.y, Texture.flipY=false');
console.log('  normals: RG + importer green transform + reconstructed positive Z');
console.log('  known pine sample: tangent, Unity world, Three world, and view normals pinned');
console.log('  runtime metadata: terrain, rocks, mountain, trees, and foliage pinned');
