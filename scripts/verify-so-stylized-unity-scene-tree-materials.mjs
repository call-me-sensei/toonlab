#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  SO_STYLIZED_UNITY_SCENE_TREE_SHADERS,
  SO_STYLIZED_UNITY_SCENE_TREE_SOURCE,
  buildSoStylizedUnitySceneTreeMaterial,
  readSoStylizedUnitySceneTreeMaterialParameters,
} from '../src/environment/soStylizedUnitySceneTreeMaterials.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const UNITY_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const MANIFEST_PATH = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene/scene-manifest.json',
);
const MODULE_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/soStylizedUnitySceneTreeMaterials.js',
);
const NORMAL_MODULE_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/soStylizedUnityNormalIntegration.js',
);

const sourceFiles = Object.freeze({
  bark: Object.freeze({
    path: resolve(UNITY_ROOT, 'Environment/Trees/Shaders/S_Bark.shadergraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_TREE_SOURCE.bark.graphSha256,
  }),
  cameraDither: Object.freeze({
    path: resolve(UNITY_ROOT, 'Materials/Shaders/SG_CameraDithering.shadersubgraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_TREE_SOURCE.cameraDither.graphSha256,
  }),
  leaves: Object.freeze({
    path: resolve(UNITY_ROOT, 'Environment/Trees/Shaders/S_Leaves.shadergraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_TREE_SOURCE.leaves.graphSha256,
  }),
  singleMaterial: Object.freeze({
    path: resolve(UNITY_ROOT, 'Environment/Trees/Shaders/SG_SingleMaterialTree.shadersubgraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_TREE_SOURCE.leaves.singleMaterialSubgraphSha256,
  }),
  snow: Object.freeze({
    path: resolve(UNITY_ROOT, 'Environment/Misc/Shaders/SG_Snow.shadersubgraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_TREE_SOURCE.bark.snowSubgraphSha256,
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseShaderGraph(path) {
  const bytes = readFileSync(path);
  const documents = bytes.toString('utf8').trim().split(/\n\n(?=\{)/).map(JSON.parse);
  const byId = new Map(documents.map((value) => [value.m_ObjectId, value]));
  const root = documents.find((value) => value.m_Type === 'UnityEditor.ShaderGraph.GraphData');
  assert.ok(root, `${path} has no GraphData document`);
  const slotOwner = new Map();
  for (const node of documents) {
    for (const slot of node.m_Slots ?? []) slotOwner.set(slot.m_Id, node);
  }
  const incoming = new Map();
  for (const edge of root.m_Edges ?? []) {
    incoming.set(
      `${edge.m_InputSlot.m_Node.m_Id}:${edge.m_InputSlot.m_SlotId}`,
      edge.m_OutputSlot,
    );
  }
  return { bytes, byId, documents, incoming, root, slotOwner };
}

function shortType(node) {
  return String(node?.m_Type ?? '').split('.').at(-1);
}

function slot(graph, node, displayName) {
  const result = (node?.m_Slots ?? [])
    .map((reference) => graph.byId.get(reference.m_Id))
    .find((value) => value?.m_DisplayName === displayName);
  assert.ok(result, `${shortType(node)} ${node?.m_Name} has no ${displayName} slot`);
  return result;
}

function source(graph, node, displayName) {
  const input = slot(graph, node, displayName);
  const reference = graph.incoming.get(`${node.m_ObjectId}:${input.m_Id}`);
  assert.ok(reference, `${shortType(node)} ${node?.m_Name}.${displayName} is not connected`);
  return {
    node: graph.byId.get(reference.m_Node.m_Id),
    slotId: reference.m_SlotId,
  };
}

function unwrapRedirect(graph, value) {
  let result = value;
  while (shortType(result.node) === 'RedirectNodeData') {
    const input = (result.node.m_Slots ?? [])
      .map((reference) => graph.byId.get(reference.m_Id))
      .find((candidate) => candidate?.m_SlotType === 0);
    assert.ok(input, 'redirect has no input');
    const reference = graph.incoming.get(`${result.node.m_ObjectId}:${input.m_Id}`);
    assert.ok(reference, 'redirect input is disconnected');
    result = { node: graph.byId.get(reference.m_Node.m_Id), slotId: reference.m_SlotId };
  }
  return result;
}

function propertyName(graph, node) {
  assert.equal(shortType(node), 'PropertyNode');
  return graph.byId.get(node.m_Property.m_Id)?.m_DefaultReferenceName;
}

function assertPropertySource(graph, node, slotName, expected) {
  const result = unwrapRedirect(graph, source(graph, node, slotName));
  assert.equal(propertyName(graph, result.node), expected, `${node.m_Name}.${slotName}`);
  return result.node;
}

function nodeByName(graph, name, type = null) {
  const result = graph.documents.find((value) => value.m_Name === name
    && (!type || shortType(value) === type));
  assert.ok(result, `${name} ${type ?? ''} is absent`);
  return result;
}

function block(graph, descriptor) {
  const result = graph.documents.find((value) => value.m_SerializedDescriptor === descriptor);
  assert.ok(result, `${descriptor} block is absent`);
  return result;
}

for (const [name, record] of Object.entries(sourceFiles)) {
  const actual = sha256(readFileSync(record.path));
  assert.equal(actual, record.sha256, `${name} changed; re-audit the Unity edge topology`);
}

const leaves = parseShaderGraph(sourceFiles.leaves.path);
const bark = parseShaderGraph(sourceFiles.bark.path);
const singleMaterial = parseShaderGraph(sourceFiles.singleMaterial.path);
const snow = parseShaderGraph(sourceFiles.snow.path);
const cameraDither = parseShaderGraph(sourceFiles.cameraDither.path);

// S_Leaves connected master outputs.
const leafBaseSource = source(leaves, block(leaves, 'SurfaceDescription.BaseColor'), 'Base Color');
assert.equal(shortType(leafBaseSource.node), 'SubGraphNode');
assert.equal(leafBaseSource.node.m_Name, 'SG_SingleMaterialTree');
assertPropertySource(leaves, leafBaseSource.node, 'SingleMaterialLOD?', '_SingleMaterialLOD');
assertPropertySource(leaves, leafBaseSource.node, 'Wood Texture', '_SingleMaterialWoodTexture');
assert.equal(shortType(source(leaves, leafBaseSource.node, 'Input Leaves').node), 'HueNode');

const leafSmoothSource = source(leaves, block(leaves, 'SurfaceDescription.Smoothness'), 'Smoothness');
assert.equal(propertyName(leaves, leafSmoothSource.node), '_Smoothness');
assertPropertySource(
  leaves,
  block(leaves, 'SurfaceDescription.Specular'),
  'Specular Color',
  '_Specular_Color',
);
const leafAlpha = unwrapRedirect(
  leaves,
  source(leaves, block(leaves, 'SurfaceDescription.Alpha'), 'Alpha'),
);
assert.equal(shortType(leafAlpha.node), 'BranchNode');
assertPropertySource(leaves, leafAlpha.node, 'Predicate', '_SingleMaterialLOD');
assert.equal(shortType(source(leaves, leafAlpha.node, 'True').node), 'LerpNode');
assert.equal(shortType(source(leaves, leafAlpha.node, 'False').node), 'MultiplyNode');
const leafPosition = source(leaves, block(leaves, 'VertexDescription.Position'), 'Position').node;
assert.equal(shortType(leafPosition), 'BranchNode');
assertPropertySource(leaves, leafPosition, 'Predicate', '_UseWind');
const leafLodPosition = source(leaves, leafPosition, 'True').node;
assert.equal(shortType(leafLodPosition), 'BranchNode');
assertPropertySource(leaves, leafLodPosition, 'Predicate', '_LOD');
const leafNormal = source(
  leaves,
  block(leaves, 'SurfaceDescription.NormalTS'),
  'Normal (Tangent Space)',
).node;
assert.equal(shortType(leafNormal), 'BranchNode');
assertPropertySource(leaves, leafNormal, 'Predicate', '_UseTwoSidedSign');
const leafEmission = source(leaves, block(leaves, 'SurfaceDescription.Emission'), 'Emission').node;
assert.equal(shortType(leafEmission), 'AddNode');
assert.equal(shortType(source(leaves, leafEmission, 'A').node), 'MultiplyNode');
assert.equal(shortType(source(leaves, leafEmission, 'B').node), 'MultiplyNode');

// The exposed leaf smoothness-map and scalar-Specular fields are blackboard
// fields only. No PropertyNode for them exists in the connected graph.
for (const name of ['_UseSmoothnessMap', '_Smoothness_Texture', '_Specular']) {
  const propertyDocument = leaves.documents.find(
    (value) => value.m_DefaultReferenceName === name,
  );
  assert.ok(propertyDocument, `${name} must remain serialized in S_Leaves`);
  assert.equal(
    leaves.documents.some(
      (value) => shortType(value) === 'PropertyNode'
        && value.m_Property?.m_Id === propertyDocument.m_ObjectId,
    ),
    false,
    `${name} unexpectedly became connected; re-audit S_Leaves`,
  );
}

// SG_SingleMaterialTree: branch(SingleMaterialLOD, lerp(wood, leaves, COLOR.r), leaves).
const singleOutput = nodeByName(singleMaterial, 'Output', 'SubGraphOutputNode');
const singleBranch = source(singleMaterial, singleOutput, 'Out_Vector4').node;
assert.equal(shortType(singleBranch), 'BranchNode');
assertPropertySource(singleMaterial, singleBranch, 'Predicate', '_SingleMaterialLOD');
const singleLerp = source(singleMaterial, singleBranch, 'True').node;
assert.equal(shortType(singleLerp), 'LerpNode');
assert.equal(shortType(source(singleMaterial, singleLerp, 'A').node), 'SampleTexture2DNode');
assertPropertySource(singleMaterial, singleLerp, 'B', '_Input_Leaves');
assert.equal(shortType(source(singleMaterial, singleLerp, 'T').node), 'SplitNode');
assertPropertySource(singleMaterial, singleBranch, 'False', '_Input_Leaves');

// S_Bark connected master outputs and exact sequential snow/bark-moss blend.
const barkBase = source(bark, block(bark, 'SurfaceDescription.BaseColor'), 'Base Color').node;
assert.equal(shortType(barkBase), 'LerpNode');
assert.equal(source(bark, barkBase, 'A').node.m_Name, 'SG_Snow');
assert.equal(shortType(source(bark, barkBase, 'B').node), 'BranchNode');
assert.equal(source(bark, barkBase, 'T').node.m_Name, 'SG_Snow');
const mossBranch = source(bark, barkBase, 'B').node;
assertPropertySource(bark, mossBranch, 'Predicate', '_Moss');
const barkSmoothness = source(
  bark,
  block(bark, 'SurfaceDescription.Smoothness'),
  'Smoothness',
).node;
assert.equal(shortType(barkSmoothness), 'MultiplyNode');
assert.equal(shortType(source(bark, barkSmoothness, 'A').node), 'SampleTexture2DNode');
assertPropertySource(bark, barkSmoothness, 'B', '_Smoothness_Multiplier');
const barkNormal = source(
  bark,
  block(bark, 'SurfaceDescription.NormalTS'),
  'Normal (Tangent Space)',
).node;
assert.equal(shortType(barkNormal), 'NormalStrengthNode');
assert.equal(shortType(source(bark, barkNormal, 'In').node), 'SampleTexture2DNode');
assertPropertySource(bark, barkNormal, 'Strength', '_Normal_Strength');
const barkEmission = source(bark, block(bark, 'SurfaceDescription.Emission'), 'Emission').node;
assert.equal(shortType(barkEmission), 'MultiplyNode');
assert.equal(source(bark, barkEmission, 'A').node.m_ObjectId, barkBase.m_ObjectId);
assertPropertySource(bark, barkEmission, 'B', '_Emissive_Strength');
assertPropertySource(
  bark,
  block(bark, 'SurfaceDescription.Specular'),
  'Specular Color',
  '_Specular_Color',
);

// SG_Snow has additional outputs, but S_Bark consumes only Base_Color and
// Alpha. Pin the subgraph itself so that this distinction cannot be lost.
const snowOutput = nodeByName(snow, 'Output', 'SubGraphOutputNode');
assert.equal(shortType(source(snow, snowOutput, 'Base_Color').node), 'MultiplyNode');
assertPropertySource(snow, snowOutput, 'Smoothness', '_Snow_Smoothness');
assert.equal(shortType(source(snow, snowOutput, 'Emission').node), 'MultiplyNode');
const snowAlpha = source(snow, snowOutput, 'Alpha').node;
assert.equal(shortType(snowAlpha), 'OneMinusNode');
const snowEnabled = source(snow, snowAlpha, 'In').node;
assert.equal(shortType(snowEnabled), 'BranchNode');
assertPropertySource(snow, snowEnabled, 'Predicate', '_Snow');
const snowProjection = source(snow, snowEnabled, 'True').node;
assert.equal(shortType(snowProjection), 'BranchNode');
assertPropertySource(snow, snowProjection, 'Predicate', '_SnowWorldAligned');

// SG_CameraDithering generated path: Dither(saturate(remap(distance))*2).
const ditherOutput = nodeByName(cameraDither, 'Output', 'SubGraphOutputNode');
const ditherNode = source(cameraDither, ditherOutput, 'Out_Vector4').node;
assert.equal(shortType(ditherNode), 'DitherNode');
const ditherMultiply = source(cameraDither, ditherNode, 'In').node;
assert.equal(shortType(ditherMultiply), 'MultiplyNode');
assert.equal(shortType(source(cameraDither, ditherMultiply, 'A').node), 'SaturateNode');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const leafRecords = manifest.materials.filter(
  (record) => record.shaderName === SO_STYLIZED_UNITY_SCENE_TREE_SHADERS.leaves,
);
const barkRecords = manifest.materials.filter(
  (record) => record.shaderName === SO_STYLIZED_UNITY_SCENE_TREE_SHADERS.bark,
);
assert.equal(leafRecords.length, 58);
assert.equal(barkRecords.length, 28);

const rendererInventoryFor = (records) => {
  const materialIndices = new Set(records.map((record) => record.index));
  const nodes = manifest.nodes.filter((node) => (
    node.renderer?.type
      && node.renderer.materialIndices.some((index) => materialIndices.has(index))
  ));
  return {
    bindings: nodes.reduce((count, node) => (
      count + node.renderer.materialIndices.filter((index) => materialIndices.has(index)).length
    ), 0),
    casts: nodes.filter((node) => node.renderer.shadowCastingMode !== 'Off').length,
    nodes,
    receives: nodes.filter((node) => node.renderer.receiveShadows).length,
  };
};

const leafRendererInventory = rendererInventoryFor(leafRecords);
assert.equal(leafRendererInventory.bindings, 462);
assert.equal(leafRendererInventory.nodes.length, 461);
assert.equal(leafRendererInventory.casts, 461);
assert.equal(leafRendererInventory.receives, 461);
const barkRendererInventory = rendererInventoryFor(barkRecords);
assert.equal(barkRendererInventory.bindings, 322);
assert.equal(barkRendererInventory.nodes.length, 322);
assert.equal(barkRendererInventory.casts, 322);
assert.equal(barkRendererInventory.receives, 322);
for (const node of [...leafRendererInventory.nodes, ...barkRendererInventory.nodes]) {
  assert.ok(
    manifest.meshes[node.mesh]?.attributes?.includes('TANGENT'),
    `${node.hierarchyPath} has no exported tangent basis`,
  );
}
const countFlag = (records, name) => records.filter(
  (record) => Number(record.properties.find((value) => value.name === name)?.value?.[0]) > 0.5,
).length;
assert.equal(countFlag(leafRecords, '_LOD'), 26);
assert.equal(countFlag(leafRecords, '_SingleMaterialLOD'), 14);
assert.equal(countFlag(leafRecords, '_UseColorTexture'), 6);
assert.equal(countFlag(leafRecords, '_UseWorldGradient'), 6);
assert.equal(countFlag(leafRecords, '_UseTwoSidedSign'), 5);
assert.equal(countFlag(leafRecords, '_UseWind'), 57);
assert.equal(countFlag(leafRecords, '_UseSmoothnessMap'), 2);
assert.equal(countFlag(barkRecords, '_Moss'), 2);
assert.equal(countFlag(barkRecords, '_Snow'), 6);

const textureFor = (record, name) => {
  const index = record.properties.find((value) => value.name === name)?.texture ?? -1;
  return index >= 0 ? manifest.textures[index] : null;
};
for (const record of leafRecords) {
  const leafTexture = textureFor(record, '_Leaf_Texture');
  assert.ok(leafTexture?.exactSourceCopy, `${record.name} has no exact leaf texture`);
  assert.equal(leafTexture.importer.sRGBTexture, true);
  assert.equal(leafTexture.importer.wrapMode, 'Repeat');
  assert.equal(leafTexture.importer.filterMode, 'Bilinear');
  assert.equal(leafTexture.importer.anisoLevel, 1);
}
for (const record of barkRecords) {
  for (const name of ['_Diffuse_Texture', '_Normal_Texture', '_Smoothness_Texture']) {
    assert.ok(textureFor(record, name)?.exactSourceCopy, `${record.name} has no ${name}`);
  }
  const normalTexture = textureFor(record, '_Normal_Texture');
  assert.equal(normalTexture.importer.textureType, 'NormalMap');
  assert.equal(normalTexture.importer.sRGBTexture, false);
  assert.equal(normalTexture.importer.flipGreenChannel, true);
  assert.equal(normalTexture.importer.mipmapEnabled, true);
}

class VerificationTextureLoader {
  maps = [];

  async loadAsync(url) {
    // Match TextureLoader.loadAsync's contract: the Promise resolves only
    // after decoded pixels exist. A bare THREE.Texture is the synchronous
    // placeholder state that the production WebGPU readiness guard rejects.
    const map = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    map.name = String(url);
    this.maps.push(map);
    return map;
  }
}

const loader = new VerificationTextureLoader();
for (const record of [...leafRecords, ...barkRecords]) {
  const parameters = readSoStylizedUnitySceneTreeMaterialParameters(record);
  const material = await buildSoStylizedUnitySceneTreeMaterial(record, {
    coordinateZSign: -1,
    geometryCapabilities: {
      hasTangents: true,
      hasUv2: true,
      hasVertexColors: true,
    },
    textureLoader: loader,
    textureRecords: manifest.textures,
  });
  assert.equal(material.type, 'MeshPhysicalNodeMaterial');
  assert.equal(material.userData.soStylizedUnitySceneTree.materialIndex, record.index);
  assert.equal(material.userData.soStylizedUnitySceneTree.materialName, record.name);
  assert.equal(material.userData.soStylizedUnitySceneTree.family, parameters.family);
  assert.equal(material.userData.soStylizedUnitySceneTree.coordinateZSign, -1);
  assert.equal(material.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
  assert.equal(material.userData.soStylizedUnityNormalIntegration.textureFlipY, true);
  assert.equal(material.userData.soStylizedUnityUrpLighting.workflow, 'specular');
  assert.ok(material.colorNode);
  assert.ok(material.emissiveNode);
  assert.ok(material.roughnessNode);
  assert.ok(material.specularColorNode);
  assert.ok(material.normalNode);
  if (parameters.family === 'leaves') {
    assert.equal(material.side, THREE.DoubleSide);
    assert.equal(material.shadowSide, THREE.DoubleSide);
    assert.ok(material.opacityNode);
    assert.ok(material.maskNode);
    assert.ok(material.maskShadowNode);
    assert.equal(material.maskNode, material.maskShadowNode);
    assert.equal(material.alphaTestNode, null);
  } else {
    assert.equal(material.side, THREE.FrontSide);
    assert.equal(material.shadowSide, THREE.FrontSide);
    assert.ok(material.positionNode);
  }
  assert.equal(typeof material.userData.createDepthColorVariant, 'function');
  const depthMaterial = material.userData.createDepthColorVariant();
  assert.equal(depthMaterial.side, material.side);
  assert.equal(depthMaterial.shadowSide, material.shadowSide);
  assert.equal(depthMaterial.positionNode, material.positionNode);
  assert.equal(depthMaterial.maskNode, material.maskNode);
  assert.equal(depthMaterial.maskShadowNode, material.maskShadowNode);
  assert.equal(
    material.userData.soStylizedUnityPassCoupling.runtime.depthVariantCreateCount,
    1,
  );
  depthMaterial.dispose();
}
assert.ok(loader.maps.every((map) => map.flipY === true));

// Pin constants copied from Shader Graph's generated node HLSL/C# templates.
const moduleSource = readFileSync(MODULE_PATH, 'utf8');
const normalModuleSource = readFileSync(NORMAL_MODULE_PATH, 'utf8');
assert.match(moduleSource, /UNITY_CONTRAST_MIDPOINT = 0\.217637640824031/);
assert.match(moduleSource, /1103515245u/);
assert.match(moduleSource, /668265261u/);
assert.match(moduleSource, /0\.125;[\s\S]*0\.25;[\s\S]*0\.5;/);
assert.match(moduleSource, /1\.0 \/ 17\.0,[\s\S]*16\.0 \/ 17\.0/);
assert.match(moduleSource, /decodeSoStylizedUnityNormalNode/);
assert.match(moduleSource, /applySoStylizedUnityNormalStrengthNode/);
assert.match(normalModuleSource, /sampleNode\.g\.mul\(2\)\.sub\(1\)\.mul\(signNode\)/);
assert.match(normalModuleSource, /mix\(float\(1\), input\.z, clamp\(strengthNode, 0, 1\)\)/);

console.log('So Stylized Unity scene tree material verification passed');
console.log(`  S_Leaves records: ${leafRecords.length}`);
console.log('  S_Leaves scene bindings/nodes/cast/receive/tangent: 462/461/461/461/461');
console.log(`  S_Bark records: ${barkRecords.length}`);
console.log('  S_Bark scene bindings/nodes/cast/receive/tangent: 322/322/322/322/322');
console.log('  source hashes/topology/importers/runtime builders: exact');
