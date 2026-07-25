#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { float, vec4 } from 'three/tsl';

import {
  SO_STYLIZED_FOG_AUDIT_SHA256,
  SO_STYLIZED_FOG_MASTER_PATH,
  SO_STYLIZED_FOG_PORT_CONTRACT,
  SO_STYLIZED_FOG_SCALAR_DEFAULTS,
  SO_STYLIZED_FOG_VECTOR_DEFAULTS,
  createSoStylizedSourceFogPostNode,
  resolveSoStylizedSourceFogProfile,
  soStylizedFogLerpFive,
} from '../src/environment/soStylizedSourceFog.js';
import { SoStylizedSourceLibrary } from '../src/environment/soStylizedSourceLibrary.js';
import {
  createSoStylizedSourceEnvironmentState,
} from '../src/environment/soStylizedSourceMaterials.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const AUDIT_PATH = resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-audit.json');
const NODE_MAP_PATH = resolve(ROOT_DIR, 'assets-local', 'sostylized', 'shader-node-map.json');
const SOURCE_MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'material-source',
  'manifest.json',
);
const VOLUME_ROOT = resolve(ROOT_DIR, 'assets-local', 'sostylized', 'fog-volume');
const VOLUME_MANIFEST_PATH = resolve(VOLUME_ROOT, 'manifest.json');

const [audit, nodeMap, sourceManifest, volumeManifest] = await Promise.all([
  readFile(AUDIT_PATH, 'utf8').then(JSON.parse),
  readFile(NODE_MAP_PATH, 'utf8').then(JSON.parse),
  readFile(SOURCE_MANIFEST_PATH, 'utf8').then(JSON.parse),
  readFile(VOLUME_MANIFEST_PATH, 'utf8').then(JSON.parse),
]);

assert.equal(nodeMap.authority.auditSha256, SO_STYLIZED_FOG_AUDIT_SHA256);
assert.equal(SO_STYLIZED_FOG_PORT_CONTRACT.auditSha256, SO_STYLIZED_FOG_AUDIT_SHA256);

const graph = nodeMap.materialGraphs.find(({ path }) => path === SO_STYLIZED_FOG_MASTER_PATH);
assert.ok(graph, 'M_StylizedFogPP must exist in the pin-exact node map');
assert.equal(graph.signature, SO_STYLIZED_FOG_PORT_CONTRACT.graphSignature);
assert.equal(graph.nodes.length, SO_STYLIZED_FOG_PORT_CONTRACT.nodeCount);
assert.match(graph.surface.domain, /MD_POST_PROCESS/);
assert.equal(
  graph.surface.propertyInputs.MP_EMISSIVE_COLOR.sourceNode,
  'MaterialExpressionAdd_1',
);

const sourceMaterial = audit.materials.find(({ path }) => path === SO_STYLIZED_FOG_MASTER_PATH);
assert.ok(sourceMaterial, 'M_StylizedFogPP must exist in the source audit');
assert.match(sourceMaterial.blendable_location, /BL_SCENE_COLOR_AFTER_DOF/);
assert.equal(SO_STYLIZED_FOG_PORT_CONTRACT.blendableLocation, 'BL_SCENE_COLOR_AFTER_DOF');

const sourceScalarDefaults = new Map();
for (const node of graph.nodes.filter(({ ueClass }) =>
  ueClass === 'MaterialExpressionScalarParameter'
  || ueClass === 'MaterialExpressionCurveAtlasRowParameter')) {
  const { default_value: value, parameter_name: name } = node.properties;
  if (sourceScalarDefaults.has(name)) {
    assert.equal(sourceScalarDefaults.get(name), value, `${name} has inconsistent source defaults`);
  }
  sourceScalarDefaults.set(name, value);
}
assert.deepEqual(
  [...sourceScalarDefaults.keys()].sort(),
  Object.keys(SO_STYLIZED_FOG_SCALAR_DEFAULTS).sort(),
);
for (const [name, value] of sourceScalarDefaults) {
  assert.ok(
    Math.abs(SO_STYLIZED_FOG_SCALAR_DEFAULTS[name] - value) < 1e-6,
    `${name} runtime default drifted from the UE node`,
  );
}
const sourceVectorDefaults = Object.fromEntries(graph.nodes
  .filter(({ ueClass }) => ueClass === 'MaterialExpressionVectorParameter')
  .map(({ properties }) => [properties.parameter_name, properties.default_value]));
assert.deepEqual(
  Object.keys(sourceVectorDefaults).sort(),
  Object.keys(SO_STYLIZED_FOG_VECTOR_DEFAULTS).sort(),
);
for (const [name, value] of Object.entries(sourceVectorDefaults)) {
  assert.ok(value.every((channel, index) =>
    Math.abs(SO_STYLIZED_FOG_VECTOR_DEFAULTS[name][index] - channel) < 1e-6));
}

const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
const sourceFor = (nodeId, pinName) => nodesById.get(nodeId)?.inputs
  ?.find(({ name }) => name === pinName)?.sourceNode;
assert.equal(sourceFor('MaterialExpressionAdd_1', 'A'), 'MaterialExpressionAdd_0');
assert.equal(sourceFor('MaterialExpressionAdd_1', 'B'), 'MaterialExpressionNamedRerouteUsage_1');
assert.equal(sourceFor('MaterialExpressionAdd_0', 'A'), 'MaterialExpressionAdd_3');
assert.equal(sourceFor('MaterialExpressionAdd_0', 'B'), 'MaterialExpressionNamedRerouteUsage_0');
assert.equal(sourceFor('MaterialExpressionAdd_3', 'A'), 'MaterialExpressionLinearInterpolate_0');
assert.equal(sourceFor('MaterialExpressionAdd_3', 'B'), 'MaterialExpressionNamedRerouteUsage_2');

const sceneTextures = graph.nodes.filter(({ ueClass }) => ueClass === 'MaterialExpressionSceneTexture');
assert.ok(sceneTextures.some(({ properties }) =>
  String(properties.scene_texture_id).includes('PPI_POST_PROCESS_INPUT0')));
assert.ok(sceneTextures.filter(({ properties }) =>
  String(properties.scene_texture_id).includes('PPI_SCENE_DEPTH')).length >= 3);
assert.ok(graph.nodes.some(({ ueClass }) => ueClass === 'MaterialExpressionSceneDepth'));
assert.deepEqual(nodesById.get('MaterialExpressionComponentMask_2').properties, {
  a: false,
  b: true,
  g: false,
  r: false,
});

const makeFloat4Path = '/Engine/Functions/Engine_MaterialFunctions02/Utility/MakeFloat4.MakeFloat4';
const disconnectedAlphaCalls = graph.nodes.filter((node) =>
  node.properties?.material_function === makeFloat4Path
  && node.inputs.find(({ name }) => name === 'A')?.sourceNode === null);
assert.equal(disconnectedAlphaCalls.length, 2);
for (const call of disconnectedAlphaCalls) {
  const rgb = ['X', 'Y', 'Z'].map((pin) =>
    call.inputs.find(({ name }) => name === pin));
  assert.deepEqual(rgb.map(({ sourceOutput }) => sourceOutput), ['R', 'G', 'B']);
  assert.deepEqual(rgb.map(({ sourceOutputIndex }) => sourceOutputIndex), [0, 1, 2]);
}

const fogProfiles = nodeMap.profiles.filter(({ family }) => family === 'fog');
assert.equal(fogProfiles.length, SO_STYLIZED_FOG_PORT_CONTRACT.profileCount);
assert.equal(
  fogProfiles.filter(({ masterGraph }) => masterGraph === SO_STYLIZED_FOG_MASTER_PATH).length,
  SO_STYLIZED_FOG_PORT_CONTRACT.profileCount,
);
const sourceFogProfiles = sourceManifest.materials.filter(({ chain = [] }) =>
  chain.includes(SO_STYLIZED_FOG_MASTER_PATH));
assert.equal(sourceFogProfiles.length, SO_STYLIZED_FOG_PORT_CONTRACT.profileCount);
assert.ok(
  sourceFogProfiles.every(({ path, chain }) =>
    ![path, ...chain].some((value) => /M_StylizedFogPP_Lite/i.test(value))),
  'the supplied source pack contains no M_StylizedFogPP_Lite asset',
);

assert.equal(volumeManifest.schema, 'toonlab.sostylized-fog-volume-source');
assert.equal(volumeManifest.version, 1);
assert.deepEqual(volumeManifest.layout, {
  axis: 'x',
  columns: 64,
  rows: 1,
  sliceWidth: 64,
  sliceHeight: 64,
  depth: 64,
  sourceWidth: 4096,
  sourceHeight: 64,
});
assert.match(volumeManifest.source.compression, /TC_HDR/);
assert.equal(volumeManifest.source.srgb, false);
assert.equal(volumeManifest.volume.source2DTileSizeX, 64);
assert.equal(volumeManifest.volume.source2DTileSizeY, 64);
const makeFloat4 = volumeManifest.engineFunctionContracts.MakeFloat4;
assert.equal(makeFloat4.path, makeFloat4Path);
assert.deepEqual(
  makeFloat4.inputs.map(({ name, previewValue }) => [name, previewValue]),
  [
    ['X', [0, 0, 0, 0]],
    ['Y', [0, 0, 0, 0]],
    ['Z', [0, 0, 0, 0]],
    ['A', [0, 0, 0, 0]],
  ],
);
const exr = await readFile(resolve(VOLUME_ROOT, volumeManifest.sourceFile));
assert.equal(createHash('sha256').update(exr).digest('hex'), volumeManifest.sourceSha256);

const lerpValues = [0, 10, 20, 30, 40];
for (const [alpha, expected] of [
  [0, 0],
  [0.125, 5],
  [0.25, 10],
  [0.5, 20],
  [0.75, 30],
  [1, 0],
]) {
  assert.equal(soStylizedFogLerpFive(lerpValues, alpha), expected);
}

const library = new SoStylizedSourceLibrary(sourceManifest);
const profile = resolveSoStylizedSourceFogProfile(library, 'Classic');
assert.match(profile.path, /MI_StylizedFogPP_Classic/);
const state = createSoStylizedSourceEnvironmentState(library);
for (const uniformName of [
  'currentTime',
  'dayCycleProgress',
  'dayLength',
  'moonDirection',
  'nightLength',
  'overcast',
  'sunDirection',
  'time',
  'weatherAtmosphereMix',
  'windAngle',
]) {
  assert.ok(state.uniforms[uniformName], `source environment state needs ${uniformName}`);
}
const volumeTexture = new THREE.Data3DTexture(new Float32Array(2 * 2 * 2 * 4), 2, 2, 2);
volumeTexture.format = THREE.RGBAFormat;
volumeTexture.type = THREE.FloatType;
volumeTexture.needsUpdate = true;
const runtime = createSoStylizedSourceFogPostNode({
  library,
  profile,
  sceneColor: vec4(0.1, 0.2, 0.3, 1),
  sceneDepth: float(0.5),
  state,
  volumeTexture,
});
assert.equal(runtime.volumeStatus, 'authored-volume-bound');
assert.equal(runtime.outputNode.isNode, true);
assert.deepEqual(runtime.bridges, SO_STYLIZED_FOG_PORT_CONTRACT.remainingBridges);

console.log('So Stylized source fog verified');
console.log(JSON.stringify({
  auditSha256: SO_STYLIZED_FOG_AUDIT_SHA256,
  blendableLocation: SO_STYLIZED_FOG_PORT_CONTRACT.blendableLocation,
  graphSignature: graph.signature,
  nodeCount: graph.nodes.length,
  profileCount: fogProfiles.length,
  sourceSceneActivation: SO_STYLIZED_FOG_PORT_CONTRACT.sourceSceneActivation,
  volume: `${volumeManifest.layout.sliceWidth}x${volumeManifest.layout.sliceHeight}x${volumeManifest.layout.depth}`,
  remainingBridges: runtime.bridges,
}, null, 2));
