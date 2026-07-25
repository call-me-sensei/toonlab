#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Vector3 } from 'three';

import {
  SO_STYLIZED_CLOUD_SHADOW_DESERT,
  SO_STYLIZED_CLOUD_SHADOW_MASTER,
  SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT,
  SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS,
  SO_STYLIZED_CLOUD_SHADOW_STANDARD,
  computeUeDirectionalLightFunctionProjection,
  evaluateSoStylizedSourceCloudShadowCpu,
  resolveSoStylizedSourceCloudShadowParameters,
} from '../src/environment/soStylizedSourceCloudShadow.js';
import { SoStylizedSourceLibrary } from '../src/environment/soStylizedSourceLibrary.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const NODE_MAP_PATH = resolve(ROOT_DIR, 'assets-local/sostylized/shader-node-map.json');
const SOURCE_MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/material-source/manifest.json',
);
const GRAPH_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/graphs-all/'
    + 'Game__SoStylized__Environment__Sky__Materials__M_SunCloudShadows_LF.T3D',
);
const SCENE_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
);
const EXPORTER_PATH = resolve(
  ROOT_DIR,
  'scripts/unreal/export-environment-demo-scene.py',
);

const [nodeMap, sourceManifest, rawGraph, scene, exporter] = await Promise.all([
  readFile(NODE_MAP_PATH, 'utf8').then(JSON.parse),
  readFile(SOURCE_MANIFEST_PATH, 'utf8').then(JSON.parse),
  readFile(GRAPH_PATH, 'utf8'),
  readFile(SCENE_PATH, 'utf8').then(JSON.parse),
  readFile(EXPORTER_PATH, 'utf8'),
]);

function nearlyEqual(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function nearlyArray(actual, expected, epsilon = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => nearlyEqual(value, expected[index], epsilon));
}

const cloudProfiles = nodeMap.profiles.filter(({ family }) => family === 'cloudShadow');
assert.equal(cloudProfiles.length, SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.profileCount);
assert.deepEqual(
  cloudProfiles.map(({ path }) => path).sort(),
  [
    SO_STYLIZED_CLOUD_SHADOW_DESERT,
    SO_STYLIZED_CLOUD_SHADOW_MASTER,
    SO_STYLIZED_CLOUD_SHADOW_STANDARD,
  ].sort(),
);
assert.ok(cloudProfiles.every(({ masterGraph }) => masterGraph === SO_STYLIZED_CLOUD_SHADOW_MASTER));

const graph = nodeMap.materialGraphs.find(({ path }) => path === SO_STYLIZED_CLOUD_SHADOW_MASTER);
assert.ok(graph, 'M_SunCloudShadows_LF must exist in the pin-exact node map');
assert.equal(graph.signature, SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.graphSignature);
assert.equal(graph.nodes.length, SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.nodeCount);
assert.match(graph.surface.domain, /MD_LIGHT_FUNCTION/);
assert.equal(
  graph.surface.propertyInputs.MP_EMISSIVE_COLOR.sourceNode,
  'MaterialExpressionLinearInterpolate_0',
);
assert.match(rawGraph, /MaterialDomain=MD_LightFunction/);
assert.match(rawGraph, /ParameterName="Cloud Max Opacity"/);
assert.match(rawGraph, /ParameterName="Distortion Scale"/);

const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
const input = (nodeId, name) => nodesById.get(nodeId)?.inputs.find((pin) => pin.name === name);
assert.equal(input('MaterialExpressionLinearInterpolate_0', 'A').sourceNode, 'MaterialExpressionOneMinus_3');
assert.equal(input('MaterialExpressionLinearInterpolate_0', 'B').sourceNode, null);
assert.equal(nodesById.get('MaterialExpressionLinearInterpolate_0').properties.const_b, 1);
assert.equal(input('MaterialExpressionLinearInterpolate_0', 'Alpha').sourceNode, 'MaterialExpressionIf_0');
assert.equal(input('MaterialExpressionOneMinus_3', 'None').sourceNode, 'MaterialExpressionRemap_0');
assert.equal(input('MaterialExpressionRemap_0', 'None').sourceNode, 'MaterialExpressionSaturate_0');
assert.equal(input('MaterialExpressionRemap_0', 'TargetHigh').sourceNode, 'MaterialExpressionScalarParameter_13');
assert.equal(input('MaterialExpressionPanner_0', 'Coordinate').sourceNode, 'MaterialExpressionDivide_0');
assert.equal(input('MaterialExpressionPanner_0', 'Speed').sourceNode, 'MaterialExpressionMultiply_2');
assert.equal(input('MaterialExpressionPanner_1', 'Coordinate').sourceNode, 'MaterialExpressionDivide_1');
assert.equal(input('MaterialExpressionPanner_1', 'Speed').sourceNode, 'MaterialExpressionMultiply_5');
assert.equal(nodesById.get('MaterialExpressionMultiply_2').properties.const_b, -0.003000000026077032);
assert.equal(nodesById.get('MaterialExpressionMultiply_5').properties.const_b, -0.0020000000949949026);

const ifNode = nodesById.get('MaterialExpressionIf_0');
assert.equal(input(ifNode.id, 'A').sourceNode, 'MaterialExpressionCollectionParameter_2');
assert.equal(input(ifNode.id, 'B').sourceNode, 'MaterialExpressionCollectionParameter_3');
assert.equal(input(ifNode.id, 'A > B').sourceNode, 'MaterialExpressionSaturate_2');
assert.equal(input(ifNode.id, 'A == B').sourceNode, null);
assert.equal(input(ifNode.id, 'A < B').sourceNode, 'MaterialExpressionSaturate_1');

const library = new SoStylizedSourceLibrary(sourceManifest);
const standard = resolveSoStylizedSourceCloudShadowParameters(
  library.resolveMaterial(SO_STYLIZED_CLOUD_SHADOW_STANDARD),
);
const desert = resolveSoStylizedSourceCloudShadowParameters(
  library.resolveMaterial(SO_STYLIZED_CLOUD_SHADOW_DESERT),
);
const master = resolveSoStylizedSourceCloudShadowParameters(
  library.resolveMaterial(SO_STYLIZED_CLOUD_SHADOW_MASTER),
);
assert.deepEqual(master, {
  cloudMaxOpacity: 1,
  cloudMultiply: 1,
  cloudSpeedX: 1,
  cloudSpeedY: 1,
  cloudSubtract: 0.2,
  cloudTexturePath: '/Game/SoStylized/Textures/Noise/T_NoiseRough.T_NoiseRough',
  cloudsScale: 50,
  distortion: 1,
  distortionScale: 15,
  distortionTexturePath: '/Game/SoStylized/Textures/Noise/T_NoiseRough.T_NoiseRough',
  windSpeed: 1,
});
assert.deepEqual(standard, {
  cloudMaxOpacity: 0.6000000238418579,
  cloudMultiply: 2,
  cloudSpeedX: 1,
  cloudSpeedY: 1,
  cloudSubtract: 0.05000000074505806,
  cloudTexturePath: '/Game/SoStylized/Textures/Noise/T_NoiseRough02.T_NoiseRough02',
  cloudsScale: 32,
  distortion: 1,
  distortionScale: 25,
  distortionTexturePath: '/Game/SoStylized/Textures/Noise/T_NoiseRough.T_NoiseRough',
  windSpeed: 1,
});
assert.deepEqual(desert, {
  cloudMaxOpacity: 0.75,
  cloudMultiply: 2.200000047683716,
  cloudSpeedX: 0.800000011920929,
  cloudSpeedY: 0.699999988079071,
  cloudSubtract: 0,
  cloudTexturePath: '/Game/SoStylized/Textures/Noise/T_NoiseRough02.T_NoiseRough02',
  cloudsScale: 75,
  distortion: 1,
  distortionScale: 21.82875633239746,
  distortionTexturePath: '/Game/SoStylized/Textures/Noise/T_NoiseRough.T_NoiseRough',
  windSpeed: 2,
});

for (const texturePath of [standard.cloudTexturePath, standard.distortionTexturePath]) {
  const source = sourceManifest.textures[texturePath];
  assert.equal(source.width, 2048);
  assert.equal(source.height, 2048);
  assert.equal(source.srgb, true);
  assert.match(source.addressX, /TA_WRAP/);
  assert.match(source.addressY, /TA_WRAP/);
}

assert.deepEqual(SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.lightFunctionScaleCm, [1024, 1024, 1024]);
assert.equal(SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.fadeDistanceMeters, 1000);
assert.equal(SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.disabledBrightness, 0.5);
assert.deepEqual(SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.atlas, {
  enabled: true,
  format: 'PF_R8',
  slotResolution: 128,
});

const identityProjection = computeUeDirectionalLightFunctionProjection();
const fixture = new Vector3(10, 20, 30);
nearlyEqual(fixture.dot(identityProjection.uAxis) + identityProjection.offset.x, 1.953125);
nearlyEqual(fixture.dot(identityProjection.vAxis) + identityProjection.offset.y, -2.9296875);
nearlyArray(identityProjection.uAxis.toArray(), [0, 0.09765625, 0]);
nearlyArray(identityProjection.vAxis.toArray(), [0, 0, -0.09765625]);

const sample = (currentTime, cameraDistanceMeters = 0) => (
  evaluateSoStylizedSourceCloudShadowCpu({
    cameraDistanceMeters,
    currentTime,
    distortionSample: 0.2,
    materialTime: 10,
    parameters: standard,
    projectedUv: [1.25, -0.25],
    sampleCloud: () => 0.4,
  })
);
const midday = sample(250);
nearlyEqual(midday.cloud, 0.42000001579523083);
nearlyEqual(midday.graphVisibility, 0.5799999842047692);
nearlyEqual(midday.visibility, 0.5799999842047692);
nearlyArray(midday.baseUv, [0.25, 0.75]);
nearlyArray(midday.distortionUv, [-0.01, 0.01]);
nearlyArray(midday.mainUv, [-0.0159375, -0.0003125]);
nearlyEqual(sample(0).visibility, 1);
nearlyEqual(sample(500).visibility, 1);
nearlyEqual(sample(750).visibility, 0.5799999842047692);
nearlyEqual(sample(250, 900).visibility, 0.5399999921023846);

const directional = scene.renderState.components.find(
  ({ componentClass }) => componentClass === 'DirectionalLightComponent',
);
assert.equal(directional.actorClass, 'BP_StylizedSky_Lite_C');
assert.equal(directional.properties.light_function_material ?? null, null);
assert.deepEqual(directional.properties.light_function_scale, [1024, 1024, 1024]);
assert.equal(directional.properties.light_function_fade_distance, 100000);
assert.equal(directional.properties.disabled_brightness, 0.5);
for (const field of [
  'disabled_brightness',
  'light_function_fade_distance',
  'light_function_material',
  'light_function_scale',
]) {
  assert.match(exporter, new RegExp(`"${field}"`));
}

assert.equal(SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.stage, 'partial');
assert.equal(SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.remainingBridges.length, 3);
console.log('So Stylized source cloud-shadow verification passed');
