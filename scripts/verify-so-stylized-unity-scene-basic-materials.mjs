#!/usr/bin/env node

// Source-to-source gate for S_Snow, S_StylizedBasic, and the two map-free
// URP/Lit records in M_Demonstration_Mega. No rendered-image evidence is used.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { normalViewGeometry, positionLocal } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_SCENE_BASIC_SHADER,
  SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH,
  SO_STYLIZED_UNITY_SCENE_SNOW_SHADER,
  SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH,
  SO_STYLIZED_UNITY_SCENE_URP_LIT_SHADER,
  SO_STYLIZED_UNITY_SCENE_URP_LIT_SOURCE,
  buildSoStylizedUnitySceneBasicMaterial,
  evaluateSoStylizedUnityBasicHueNormalized,
  evaluateSoStylizedUnityBasicRandomRange,
  evaluateSoStylizedUnitySnowTriplanarWeights,
  resolveSoStylizedUnitySceneBasicInputs,
  resolveSoStylizedUnitySceneSnowInputs,
  resolveSoStylizedUnitySceneUrpLitInputs,
} from '../src/environment/soStylizedUnitySceneBasicMaterials.js';
import { createSoStylizedUnityPassCouplingReport } from '../src/environment/soStylizedUnityMaterialPassCoupling.js';
import { buildSoStylizedUnityMegaMaterial } from '../src/environment/soStylizedUnityMegaScene.js';
import {
  linearizeSoStylizedUnityColorProperty,
} from '../src/environment/soStylizedUnitySceneRecords.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const UNITY_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const MANIFEST_PATH = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene/scene-manifest.json',
);
const NATIVE_MANIFEST_PATH = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene-native-pc-current/scene-manifest.json',
);
const GENERATED_ROOT = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/generated-shaders',
);
const GENERATED_CONTRACT_PATH = resolve(
  PACKAGE_ROOT,
  'docs/source-shader-audits/unity-generated-shader-contracts.json',
);
const LEDGER_PATH = resolve(PACKAGE_ROOT, 'docs/unity-shader-port-ledger.json');
const MODULE_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/soStylizedUnitySceneBasicMaterials.js',
);
const DISPATCHER_PATH = resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnityMegaScene.js');
const URP_CANDIDATES = [
  process.env.SO_STYLIZED_UNITY_URP_PACKAGE,
  '/Applications/Unity/Hub/Editor/6000.5.4f1/Unity.app/Contents/Resources/PackageManager/BuiltInPackages/com.unity.render-pipelines.universal',
].filter(Boolean);
const URP_ROOT = URP_CANDIDATES.find(existsSync);

const shaderGraphPaths = Object.freeze({
  snow: resolve(UNITY_ROOT, SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.sourceGraph),
  snowSubgraph: resolve(UNITY_ROOT, SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.sourceSubgraph),
  stylizedBasic: resolve(
    UNITY_ROOT,
    SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH.sourceGraph,
  ),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function close(actual, expected, tolerance = 1e-12, label = 'value') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function vectorClose(actual, expected, tolerance = 1e-12, label = 'vector') {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => close(
    value,
    expected[index],
    tolerance,
    `${label}[${index}]`,
  ));
}

function parseShaderGraph(path) {
  const bytes = readFileSync(path);
  const documents = bytes.toString('utf8').trim().split(/\n\n(?=\{)/).map(JSON.parse);
  const byId = new Map(documents.map((value) => [value.m_ObjectId, value]));
  const root = documents.find((value) => value.m_Type === 'UnityEditor.ShaderGraph.GraphData');
  assert.ok(root, `${path} has no GraphData document`);
  const incoming = new Map();
  for (const edge of root.m_Edges ?? []) {
    incoming.set(
      `${edge.m_InputSlot.m_Node.m_Id}:${edge.m_InputSlot.m_SlotId}`,
      edge.m_OutputSlot,
    );
  }
  return { bytes, byId, documents, incoming, root };
}

function shortType(value) {
  return String(value?.m_Type ?? '').split('.').at(-1);
}

function slot(graph, node, displayName) {
  const result = (node?.m_Slots ?? [])
    .map((reference) => graph.byId.get(reference.m_Id))
    .find((candidate) => candidate?.m_DisplayName === displayName);
  assert.ok(result, `${shortType(node)} ${node?.m_Name}.${displayName} is absent`);
  return result;
}

function source(graph, node, displayName) {
  const input = slot(graph, node, displayName);
  const reference = graph.incoming.get(`${node.m_ObjectId}:${input.m_Id}`);
  assert.ok(reference, `${shortType(node)} ${node?.m_Name}.${displayName} is disconnected`);
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

function assertPropertySource(graph, node, slotName, expectedName) {
  const result = unwrapRedirect(graph, source(graph, node, slotName));
  assert.equal(propertyName(graph, result.node), expectedName, `${node.m_Name}.${slotName}`);
  return result.node;
}

function nodeByName(graph, name, type = null) {
  const result = graph.documents.find((value) => (
    value.m_Name === name && (!type || shortType(value) === type)
  ));
  assert.ok(result, `${name} ${type ?? ''} is absent`);
  return result;
}

function block(graph, descriptor) {
  const result = graph.documents.find((value) => value.m_SerializedDescriptor === descriptor);
  assert.ok(result, `${descriptor} block is absent`);
  return result;
}

function assertOpaqueTarget(graph, label) {
  const target = graph.documents.find((value) => shortType(value) === 'UniversalTarget');
  assert.ok(target, `${label} UniversalTarget missing`);
  assert.equal(target.m_SurfaceType, 0, `${label} surface type`);
  assert.equal(target.m_AlphaMode, 0, `${label} alpha mode`);
  assert.equal(target.m_RenderFace, 2, `${label} render face`);
  assert.equal(target.m_AlphaClip, false, `${label} alpha clip`);
  assert.equal(target.m_ZWriteControl, 0, `${label} auto opaque ZWrite`);
  const subTarget = graph.documents.find(
    (value) => shortType(value) === 'UniversalLitSubTarget',
  );
  assert.ok(subTarget, `${label} UniversalLitSubTarget missing`);
  assert.equal(subTarget.m_WorkflowMode, 1, `${label} metallic workflow`);
}

function assertDefaultColorProperty(graph, referenceName) {
  const property = graph.documents.find(
    (value) => value.m_DefaultReferenceName === referenceName,
  );
  assert.equal(
    property?.m_Type,
    'UnityEditor.ShaderGraph.Internal.ColorShaderProperty',
    `${referenceName} stopped being a Shader Graph Color property`,
  );
  assert.equal(property.m_ColorMode, 0, `${referenceName} stopped using ColorMode.Default`);
}

for (const path of Object.values(shaderGraphPaths)) {
  assert.ok(existsSync(path), `Missing supplied source ${path}`);
}
assert.equal(
  sha256(readFileSync(shaderGraphPaths.snow)),
  SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.sourceGraphSha256,
);
assert.equal(
  sha256(readFileSync(shaderGraphPaths.snowSubgraph)),
  SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.sourceSubgraphSha256,
);
assert.equal(
  sha256(readFileSync(shaderGraphPaths.stylizedBasic)),
  SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH.sourceGraphSha256,
);
assert.equal(
  sha256(readFileSync(resolve(UNITY_ROOT, SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.sourceMaterial))),
  SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.sourceMaterialSha256,
);
assert.equal(
  sha256(readFileSync(resolve(
    UNITY_ROOT,
    SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH.sourceMaterial,
  ))),
  SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH.sourceMaterialSha256,
);

const snow = parseShaderGraph(shaderGraphPaths.snow);
const snowSubgraph = parseShaderGraph(shaderGraphPaths.snowSubgraph);
const basic = parseShaderGraph(shaderGraphPaths.stylizedBasic);
assertOpaqueTarget(snow, 'S_Snow');
assertOpaqueTarget(basic, 'S_StylizedBasic');
assertDefaultColorProperty(snow, '_Snow_Tint');
assertDefaultColorProperty(basic, '_Base_Color');

// S_Snow master graph: the subgraph feeds only BaseColor, Emission, and
// Smoothness. Its Alpha output is deliberately absent from the surface.
const snowNode = nodeByName(snow, 'SG_Snow', 'SubGraphNode');
for (const [descriptor, outputSlot] of [
  ['SurfaceDescription.BaseColor', 1],
  ['SurfaceDescription.Smoothness', 2],
  ['SurfaceDescription.Emission', 3],
]) {
  const connected = source(snow, block(snow, descriptor), slot(
    snow,
    block(snow, descriptor),
    descriptor === 'SurfaceDescription.BaseColor'
      ? 'Base Color'
      : descriptor.split('.').at(-1),
  ).m_DisplayName);
  assert.equal(connected.node.m_ObjectId, snowNode.m_ObjectId, descriptor);
  assert.equal(connected.slotId, outputSlot, descriptor);
}
assert.equal(
  snow.documents.some((value) => value.m_SerializedDescriptor === 'SurfaceDescription.Alpha'),
  false,
  'S_Snow must remain opaque with no surface Alpha block',
);
for (const [slotName, property] of [
  ['Snow Texture', '_Snow_Texture'],
  ['Tint', '_Snow_Tint'],
  ['Snow Scale', '_Snow_Scale'],
  ['Snow Smoothness', '_Snow_Smoothness'],
  ['Snow Emission', '_Snow_Emission'],
]) {
  assertPropertySource(snow, snowNode, slotName, property);
}
assert.equal(slot(snow, snowNode, 'Snow?').m_Value, true);
assert.equal(slot(snow, snowNode, 'SnowWorldAligned?').m_Value, false);
close(slot(snow, snowNode, 'Snow Sharpness').m_Value, 0.800000011920929, 0);
close(slot(snow, snowNode, 'Snow Offset').m_Value, 0.30000001192092896, 0);

// SG_Snow itself pins the world-space triplanar projection and all four
// output formulas, including the Alpha output that S_Snow does not consume.
const snowOutput = nodeByName(snowSubgraph, 'Output', 'SubGraphOutputNode');
const snowBaseMultiply = source(snowSubgraph, snowOutput, 'Base_Color').node;
assert.equal(shortType(snowBaseMultiply), 'MultiplyNode');
const triplanar = source(snowSubgraph, snowBaseMultiply, 'A').node;
assert.equal(shortType(triplanar), 'TriplanarNode');
assert.equal(triplanar.m_InputSpace, 4, 'SG_Snow triplanar input must remain World space');
assertPropertySource(snowSubgraph, triplanar, 'Texture', '_Snow_Texture');
const tileDivide = source(snowSubgraph, triplanar, 'Tile').node;
assert.equal(shortType(tileDivide), 'DivideNode');
assertPropertySource(snowSubgraph, tileDivide, 'B', '_Snow_Scale');
assertPropertySource(snowSubgraph, snowBaseMultiply, 'B', '_Tint');
const snowEmission = source(snowSubgraph, snowOutput, 'Emission').node;
assert.equal(shortType(snowEmission), 'MultiplyNode');
assert.equal(source(snowSubgraph, snowEmission, 'A').node.m_ObjectId, snowBaseMultiply.m_ObjectId);
assertPropertySource(snowSubgraph, snowEmission, 'B', '_Snow_Emission');
assertPropertySource(snowSubgraph, snowOutput, 'Smoothness', '_Snow_Smoothness');
assert.equal(shortType(source(snowSubgraph, snowOutput, 'Alpha').node), 'OneMinusNode');

// S_StylizedBasic branch topology.
const basicHue = source(basic, block(basic, 'SurfaceDescription.BaseColor'), 'Base Color').node;
assert.equal(shortType(basicHue), 'HueNode');
const colorBranch = source(basic, basicHue, 'In').node;
assert.equal(shortType(colorBranch), 'BranchNode');
assertPropertySource(basic, colorBranch, 'Predicate', '_Use_Color_Texture');
assert.equal(shortType(source(basic, colorBranch, 'True').node), 'SampleTexture2DNode');
assertPropertySource(basic, colorBranch, 'False', '_Base_Color');
assertPropertySource(
  basic,
  source(basic, colorBranch, 'True').node,
  'Texture',
  '_Base_Color_Texture',
);
const normalBranch = source(
  basic,
  block(basic, 'SurfaceDescription.NormalTS'),
  'Normal (Tangent Space)',
).node;
assert.equal(shortType(normalBranch), 'BranchNode');
assertPropertySource(basic, normalBranch, 'Predicate', '_Normal_Map');
const normalStrength = source(basic, normalBranch, 'True').node;
assert.equal(shortType(normalStrength), 'NormalStrengthNode');
assertPropertySource(basic, normalStrength, 'Strength', '_Normal_Strength');
assertPropertySource(
  basic,
  source(basic, normalStrength, 'In').node,
  'Texture',
  '_Normal_Texture',
);
assert.deepEqual(slot(basic, normalBranch, 'False').m_Value, { x: 0, y: 0, z: 1, w: 0 });
const metallicBranch = source(
  basic,
  block(basic, 'SurfaceDescription.Metallic'),
  'Metallic',
).node;
assertPropertySource(basic, metallicBranch, 'Predicate', '_Metallic_Map');
assertPropertySource(basic, metallicBranch, 'False', '_Metallic');
assertPropertySource(
  basic,
  source(basic, metallicBranch, 'True').node,
  'Texture',
  '_Metallic_Texture',
);
const smoothnessOneMinus = source(
  basic,
  block(basic, 'SurfaceDescription.Smoothness'),
  'Smoothness',
).node;
assert.equal(shortType(smoothnessOneMinus), 'OneMinusNode');
const roughnessBranch = source(basic, smoothnessOneMinus, 'In').node;
assertPropertySource(basic, roughnessBranch, 'Predicate', '_Roughness_Map');
assertPropertySource(basic, roughnessBranch, 'False', '_Roughness');
assertPropertySource(
  basic,
  source(basic, roughnessBranch, 'True').node,
  'Texture',
  '_Roughness_Texture',
);
const emissionMultiply = source(
  basic,
  block(basic, 'SurfaceDescription.Emission'),
  'Emission',
).node;
assert.equal(source(basic, emissionMultiply, 'A').node.m_ObjectId, basicHue.m_ObjectId);
assertPropertySource(basic, emissionMultiply, 'B', '_Emissive');

// Pin ShaderUtil output for active forward/depth/shadow passes and generated
// formulas. The global generated-source gate independently verifies all 152.
const generatedContracts = JSON.parse(readFileSync(GENERATED_CONTRACT_PATH));
for (const [shaderName, graphContract] of [
  [SO_STYLIZED_UNITY_SCENE_SNOW_SHADER, SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH],
  [SO_STYLIZED_UNITY_SCENE_BASIC_SHADER, SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH],
]) {
  const generated = generatedContracts.shaders.find((value) => value.shaderName === shaderName);
  assert.ok(generated, `${shaderName} generated contract missing`);
  assert.equal(generated.graphSha256, graphContract.sourceGraphSha256);
  assert.equal(generated.authorityPass.fullSourceSha256, graphContract.generatedForwardFullSourceSha256);
  for (const pass of Object.values(graphContract.generatedPasses)) {
    assert.equal(
      sha256(readFileSync(resolve(GENERATED_ROOT, pass.file))),
      pass.exportedSha256,
      `${shaderName}/${pass.name}`,
    );
  }
  assert.deepEqual(
    generated.outputs.vertex,
    {
      Position: 'IN.ObjectSpacePosition',
      Normal: 'IN.ObjectSpaceNormal',
      Tangent: 'IN.ObjectSpaceTangent',
    },
  );
  assert.deepEqual(Object.keys(generated.outputs.surface), [
    'BaseColor', 'NormalTS', 'Emission', 'Metallic', 'Smoothness', 'Occlusion',
  ]);
}
const generatedSnow = readFileSync(
  resolve(GENERATED_ROOT, SO_STYLIZED_UNITY_SCENE_SNOW_GRAPH.generatedPasses.forward.file),
  'utf8',
);
assert.match(generatedSnow, /AbsoluteWorldSpacePosition \* _Divide_[^;]+/);
assert.match(generatedSnow, /SafePositivePow_float\(IN\.WorldSpaceNormal/);
assert.match(generatedSnow, /_UV\.zy\)/);
assert.match(generatedSnow, /_UV\.xz\)/);
assert.match(generatedSnow, /_UV\.xy\)/);
assert.match(generatedSnow, /SG_SGSnow_[^(]+\(1,[\s\S]+, 0, float\(0\.8\), float\(0\.3\),/);
assert.doesNotMatch(generatedSnow, /surface\.Alpha\s*=/);
const generatedBasic = readFileSync(
  resolve(
    GENERATED_ROOT,
    SO_STYLIZED_UNITY_SCENE_STYLIZED_BASIC_GRAPH.generatedPasses.forward.file,
  ),
  'utf8',
);
assert.match(generatedBasic, /SHADERGRAPH_OBJECT_POSITION\[0\]/);
assert.match(generatedBasic, /SHADERGRAPH_OBJECT_POSITION\[2\]/);
assert.match(generatedBasic, /float randomno =\s+frac\(sin\(dot\(Seed, float2\(12\.9898, 78\.233\)\)\)\*43758\.5453\)/);
assert.match(generatedBasic, /Unity_NormalStrength_float/);
assert.match(generatedBasic, /surface\.Smoothness = \(_OneMinus_/);

// Installed Unity 6000.5 / URP 17.5 Lit source and its active pass contract.
assert.ok(URP_ROOT, 'Unity 6000.5 URP 17.5 package source is required');
for (const [relativePath, expected] of [
  ['Shaders/Lit.shader', SO_STYLIZED_UNITY_SCENE_URP_LIT_SOURCE.shaderSha256],
  ['Shaders/LitInput.hlsl', SO_STYLIZED_UNITY_SCENE_URP_LIT_SOURCE.litInputSha256],
  ['Shaders/LitForwardPass.hlsl', SO_STYLIZED_UNITY_SCENE_URP_LIT_SOURCE.forwardIncludeSha256],
  ['Shaders/ShadowCasterPass.hlsl', SO_STYLIZED_UNITY_SCENE_URP_LIT_SOURCE.shadowIncludeSha256],
  ['Shaders/DepthOnlyPass.hlsl', SO_STYLIZED_UNITY_SCENE_URP_LIT_SOURCE.depthIncludeSha256],
]) {
  assert.equal(sha256(readFileSync(resolve(URP_ROOT, relativePath))), expected, relativePath);
}
const urpLitSource = readFileSync(resolve(URP_ROOT, 'Shaders/Lit.shader'), 'utf8');
assert.match(urpLitSource, /\[MainColor\]\s+_BaseColor\("Color", Color\)/);
assert.match(urpLitSource, /_SpecColor\("Specular", Color\)/);
assert.match(urpLitSource, /\[HDR\]\s+_EmissionColor\("Color", Color\)/);
for (const [name, lightMode] of [
  ['ForwardLit', 'UniversalForward'],
  ['ShadowCaster', 'ShadowCaster'],
  ['DepthOnly', 'DepthOnly'],
]) {
  assert.match(
    urpLitSource,
    new RegExp(`Name "${name}"[\\s\\S]{0,260}"LightMode" = "${lightMode}"`),
    `${name}/${lightMode}`,
  );
}
assert.match(urpLitSource, /#include "Packages\/com\.unity\.render-pipelines\.universal\/Shaders\/LitForwardPass\.hlsl"/);
assert.match(urpLitSource, /#include "Packages\/com\.unity\.render-pipelines\.universal\/Shaders\/ShadowCasterPass\.hlsl"/);
assert.match(urpLitSource, /#include "Packages\/com\.unity\.render-pipelines\.universal\/Shaders\/DepthOnlyPass\.hlsl"/);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH));
const familyRecords = manifest.materials.filter((record) => [
  SO_STYLIZED_UNITY_SCENE_SNOW_SHADER,
  SO_STYLIZED_UNITY_SCENE_BASIC_SHADER,
  SO_STYLIZED_UNITY_SCENE_URP_LIT_SHADER,
].includes(record.shaderName));
assert.deepEqual(familyRecords.map((record) => record.index), [65, 109, 121, 124]);
assert.deepEqual(familyRecords.map((record) => record.renderQueue), [2000, 2000, 2000, 2000]);
assert.deepEqual(familyRecords.map((record) => record.enableInstancing), [false, false, false, false]);
assert.deepEqual(familyRecords.map((record) => record.doubleSidedGI), [false, false, false, false]);

const snowInputs = resolveSoStylizedUnitySceneSnowInputs(manifest.materials[65]);
assert.deepEqual(snowInputs, {
  emission: 0.10000000149011612,
  materialIndex: 65,
  materialName: 'M_Snow',
  renderQueue: 2000,
  scale: 5,
  smoothness: 0.25999999046325684,
  textureIndex: 7,
  tint: [0.8599843382835388, 0.8738195300102234, 0.8784313797950745, 0],
});
assert.deepEqual(
  linearizeSoStylizedUnityColorProperty(snowInputs.tint),
  [0.710537300565256, 0.7365959209560167, 0.745404223427831, 0],
);
const basicInputs = resolveSoStylizedUnitySceneBasicInputs(manifest.materials[121]);
assert.equal(basicInputs.useColorTexture, true);
assert.equal(basicInputs.baseColorTextureIndex, 101);
assert.deepEqual(basicInputs.baseColor, [0, 0, 0, 0]);
assert.equal(basicInputs.hueVariation, 0);
assert.equal(basicInputs.hueShift, 0);
assert.equal(basicInputs.metallicMap, false);
assert.equal(basicInputs.metallicTextureIndex, -1);
assert.equal(basicInputs.metallic, 0);
assert.equal(basicInputs.roughnessMap, true);
assert.equal(basicInputs.roughnessTextureIndex, 102);
assert.equal(basicInputs.roughness, 1);
assert.equal(basicInputs.normalMap, false);
assert.equal(basicInputs.normalTextureIndex, -1);
assert.equal(basicInputs.normalStrength, 0);
assert.equal(basicInputs.emissive, 0.4000000059604645);
assert.deepEqual(manifest.materials[121].keywords, ['_EMISSION']);
for (const index of [109, 124]) {
  const values = resolveSoStylizedUnitySceneUrpLitInputs(manifest.materials[index]);
  assert.deepEqual(values.baseColor, [
    0.9063317179679871,
    0.9063317179679871,
    0.9063317179679871,
    1,
  ]);
  assert.equal(values.smoothness, 0.4909090995788574);
  assert.equal(values.metallic, 0);
  assert.equal(values.workflowMode, 1);
  assert.equal(values.alphaClip, 0);
  assert.equal(values.surface, 0);
  assert.equal(values.cull, 2);
  assert.equal(values.depthWrite, 1);
  assert.equal(values.receiveShadows, 1);
  assert.equal(values.baseMapIndex, -1);
  assert.equal(values.normalMapIndex, -1);
  assert.equal(values.occlusionMapIndex, -1);
  assert.equal(values.emissionMapIndex, -1);
  assert.deepEqual(
    linearizeSoStylizedUnityColorProperty(values.baseColor),
    [0.7999999293458716, 0.7999999293458716, 0.7999999293458716, 1],
  );
}

for (const [index, name, size] of [
  [7, 'T_Snow_BC', 1024],
  [101, 'T_BeachShells_BC', 512],
  [102, 'T_BeachShells_R', 512],
]) {
  const record = manifest.textures[index];
  assert.equal(record.name, name);
  assert.equal(record.width, size);
  assert.equal(record.height, size);
  assert.equal(record.format, 'DXT1');
  assert.equal(record.importer.textureType, 'Default');
  assert.equal(record.importer.sRGBTexture, true);
  assert.equal(record.importer.flipGreenChannel, false);
  assert.equal(record.importer.mipmapEnabled, true);
  assert.equal(record.importer.wrapMode, 'Repeat');
  assert.equal(record.importer.filterMode, 'Bilinear');
  assert.equal(record.importer.anisoLevel, 1);
}

// Count every structural renderer binding in scene nodes and prefab prototype
// nodes. These are source records, not pixels and not inferred screenshots.
const usageCounts = new Map([65, 109, 121, 124].map((index) => [index, 0]));
for (const node of [
  ...(manifest.nodes ?? []),
  ...(manifest.prefabPrototypes ?? []).flatMap((prototype) => prototype.nodes ?? []),
]) {
  for (const index of node.renderer?.materialIndices ?? []) {
    if (usageCounts.has(index)) usageCounts.set(index, usageCounts.get(index) + 1);
  }
}
assert.deepEqual([...usageCounts], [[65, 8], [109, 4], [121, 5], [124, 2]]);
assert.equal([...usageCounts.values()].reduce((sum, value) => sum + value, 0), 19);

const slotsForMaterial = (nodes, materialIndex) => nodes.reduce((count, node) => (
  count + (node.renderer?.materialIndices ?? [])
    .filter((index) => index === materialIndex).length
), 0);
assert.equal(slotsForMaterial(manifest.nodes, 65), 6);
assert.equal(slotsForMaterial(manifest.nodes, 109), 2);
assert.equal(slotsForMaterial(manifest.nodes, 121), 0);
assert.equal(slotsForMaterial(manifest.nodes, 124), 0);
const expandedTreeSlots = new Map([65, 109, 121, 124].map((index) => [index, 0]));
for (const instance of manifest.terrains[0].treeInstances) {
  const prototype = manifest.terrains[0].treePrototypes[instance.prototypeIndex];
  const nodes = manifest.prefabPrototypes[prototype.gltfPrefab].nodes;
  for (const materialIndex of expandedTreeSlots.keys()) {
    expandedTreeSlots.set(
      materialIndex,
      expandedTreeSlots.get(materialIndex) + slotsForMaterial(nodes, materialIndex),
    );
  }
}
assert.deepEqual([...expandedTreeSlots], [[65, 8], [109, 4], [121, 0], [124, 12]]);

assert.ok(existsSync(NATIVE_MANIFEST_PATH), 'Native-current detail manifest is missing');
const nativeManifest = JSON.parse(readFileSync(NATIVE_MANIFEST_PATH, 'utf8'));
let stylizedBasicDetailInstances = 0;
let stylizedBasicDetailRoutes = 0;
for (const prototype of nativeManifest.terrains[0].detailPrototypes) {
  const nodes = nativeManifest.prefabPrototypes[prototype.gltfPrefab].nodes;
  const slots = slotsForMaterial(nodes, 121);
  if (slots > 0) stylizedBasicDetailRoutes += 1;
  stylizedBasicDetailInstances += slots * prototype.nativeTransforms.transformCount;
}
assert.equal(stylizedBasicDetailRoutes, 5);
assert.equal(stylizedBasicDetailInstances, 324);

// Deterministic CPU probes of the transcribed generated helpers.
vectorClose(
  evaluateSoStylizedUnitySnowTriplanarWeights([-0.2, 0.8, -0.4]),
  [1 / 7, 4 / 7, 2 / 7],
  1e-15,
  'triplanar weights',
);
close(
  evaluateSoStylizedUnityBasicRandomRange([10, -20], -0.2, 0.2),
  -0.10136578386882321,
  1e-15,
  'RandomRange',
);
vectorClose(
  evaluateSoStylizedUnityBasicHueNormalized([0.2, 0.5, 0.8], 0.2),
  [0.6201083331018583, 0.2000999999999999, 0.8001],
  1e-15,
  'Hue.Normalized',
);

// Runtime builders: exact importer state, opaque render state, normal/URP
// contracts, and shared ForwardLit/DepthOnly/ShadowCaster graph identity.
const loadedTextures = new Map();
const textureLoader = {
  async loadAsync(url) {
    const result = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    loadedTextures.set(url, result);
    return result;
  },
};
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
], 3));
geometry.setIndex([0, 1, 2]);
const materials = [];
for (const record of familyRecords) {
  const material = await buildSoStylizedUnityMegaMaterial(record, manifest, {
    baseUrl: '/source-basic-verifier',
    geometry,
    textureLoader,
  });
  materials.push(material);
  assert.equal(material.userData.soStylizedUnityMaterial.exactInputs, true);
  assert.equal(material.userData.soStylizedUnityMaterial.graphExact, true);
  if (record.index === 65) {
    assert.deepEqual(material.userData.soStylizedUnityMaterial.linearColorProperties, {
      snowTint: linearizeSoStylizedUnityColorProperty(snowInputs.tint),
    });
  } else if (record.index === 121) {
    assert.deepEqual(material.userData.soStylizedUnityMaterial.linearColorProperties, {
      baseColor: linearizeSoStylizedUnityColorProperty(basicInputs.baseColor),
    });
  } else {
    const inputs = resolveSoStylizedUnitySceneUrpLitInputs(record);
    assert.deepEqual(material.userData.soStylizedUnityMaterial.linearColorProperties, {
      baseColor: linearizeSoStylizedUnityColorProperty(inputs.baseColor),
    });
  }
  assert.notEqual(material.userData.soStylizedUnityMaterial.reconstruction, 'partial-family-fallback');
  assert.equal(material.transparent, false);
  assert.equal(material.blending, THREE.NoBlending);
  assert.equal(material.side, THREE.FrontSide);
  assert.equal(material.shadowSide, THREE.FrontSide);
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, true);
  assert.equal(material.positionNode, positionLocal);
  assert.equal(material.normalNode, normalViewGeometry);
  assert.equal(material.userData.soStylizedUnityPassCoupling.exact, true);
  assert.equal(material.userData.soStylizedUnityPassCoupling.alphaClip, false);
  assert.deepEqual(
    material.userData.soStylizedUnityPassCoupling.generatedPasses,
    ['ForwardLit', 'DepthOnly', 'ShadowCaster'],
  );
  assert.equal(material.userData.soStylizedUnityUrpLighting.workflow, 'metallic');
  assert.equal(material.userData.soStylizedUnityUrpLighting.inputAdapter, 'unity-stage');
  assert.equal(material.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
  const depthMaterial = material.userData.createDepthColorVariant();
  assert.equal(depthMaterial.positionNode, material.positionNode);
  assert.equal(depthMaterial.side, THREE.FrontSide);
  assert.equal(depthMaterial.shadowSide, THREE.FrontSide);
  assert.equal(depthMaterial.userData.soStylizedUnityPassCoupling.depthVariant, true);
  depthMaterial.dispose();
}

assert.equal(loadedTextures.size, 3);
for (const textureValue of loadedTextures.values()) {
  assert.equal(textureValue.flipY, true);
  assert.equal(textureValue.colorSpace, THREE.SRGBColorSpace);
  assert.equal(textureValue.wrapS, THREE.RepeatWrapping);
  assert.equal(textureValue.wrapT, THREE.RepeatWrapping);
  assert.equal(textureValue.magFilter, THREE.LinearFilter);
  assert.equal(textureValue.minFilter, THREE.LinearMipmapNearestFilter);
  assert.equal(textureValue.generateMipmaps, true);
  assert.equal(textureValue.anisotropy, 1);
  assert.equal(textureValue.userData.soStylizedUnityTexture.flipGreenChannel, false);
}
assert.deepEqual(
  materials.map((material) => material.userData.soStylizedUnitySceneBasic.family),
  ['snow', 'urp-lit', 'stylized-basic', 'urp-lit'],
);

const reportRoot = new THREE.Group();
for (const material of materials) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  reportRoot.add(mesh);
}
const couplingReport = createSoStylizedUnityPassCouplingReport(reportRoot);
assert.equal(couplingReport.knownMaterialCount, 4);
assert.equal(couplingReport.coupledMaterialCount, 4);
assert.equal(couplingReport.opaqueMaterialCount, 4);
assert.equal(couplingReport.uncoupledMaterialCount, 0);
assert.equal(couplingReport.exact, true);
assert.equal(couplingReport.casterMeshCount, 4);
assert.equal(couplingReport.receiverMeshCount, 4);
assert.equal(couplingReport.depthVariantFactoryCount, 4);
assert.equal(couplingReport.depthVariantCreateCount, 4);

// The direct family dispatcher must precede the explicitly partial fallback.
const dispatcherSource = readFileSync(DISPATCHER_PATH, 'utf8');
assert.ok(
  dispatcherSource.indexOf('isSoStylizedUnitySceneBasicMaterialRecord(record)')
    < dispatcherSource.indexOf('return buildUnityPartialFallbackMaterial(record, manifest, options)'),
  'audited basic families must route before the partial fallback',
);
assert.doesNotMatch(dispatcherSource, /buildPlainUnityLitMaterial/);
assert.match(dispatcherSource, /createSoStylizedUnityPassCouplingReport\(root\)/);
const moduleSource = readFileSync(MODULE_PATH, 'utf8');
assert.match(moduleSource, /unitySourceWorldPosition\(\)\.div\(values\.scale\)/);
assert.match(moduleSource, /objectPosition\.z\.negate\(\)/);
assert.match(moduleSource, /texture\(maps\.roughness\)\.sample\(sourceUv\)\.r/);
assert.match(moduleSource, /installSoStylizedUnityUrpLighting\(material, \{/);

const ledger = JSON.parse(readFileSync(LEDGER_PATH));
for (const shader of [
  SO_STYLIZED_UNITY_SCENE_SNOW_SHADER,
  SO_STYLIZED_UNITY_SCENE_BASIC_SHADER,
  SO_STYLIZED_UNITY_SCENE_URP_LIT_SHADER,
]) {
  const entry = ledger.shaderFamilies.find((value) => value.shader === shader);
  assert.equal(entry?.runtimePort, 'complete', `${shader} ledger status`);
  assert.equal(entry?.runtimeModule, 'src/environment/soStylizedUnitySceneBasicMaterials.js');
  assert.equal(entry?.verification, 'scripts/verify-so-stylized-unity-scene-basic-materials.mjs');
}

for (const material of materials) material.dispose();
geometry.dispose();

console.log(
  'Unity opaque basic source verification passed: 3 families, 4 materials, '
  + '19 scene/prefab renderer bindings, 3 exact source textures, and '
  + '12 coupled ForwardLit/DepthOnly/ShadowCaster material-pass identities.',
);
console.log('Color transfer: S_Snow + S_StylizedBasic ColorMode.Default and URP/Lit _BaseColor decoded sRGB -> linear.');
console.log('Expanded population: 8 S_Snow tree slots, 16 URP/Lit tree slots, 324 S_StylizedBasic detail instances.');
