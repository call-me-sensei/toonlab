#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  SO_STYLIZED_UNITY_FOG_PARTICIPATION_MRT,
  SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH,
  SO_STYLIZED_UNITY_SCENE_CLOUDS_SHADER,
  SO_STYLIZED_UNITY_SCENE_SKY_GRAPH,
  SO_STYLIZED_UNITY_SCENE_SKY_SHADER,
  buildSoStylizedUnitySceneCloudMaterial,
  buildSoStylizedUnitySceneSkyFamilyMaterial,
  buildSoStylizedUnitySceneSkyMaterial,
  composeSoStylizedUnitySceneCloudSurface,
  resolveSoStylizedUnitySceneCloudInputs,
  resolveSoStylizedUnitySceneSkyInputs,
  sampleSoStylizedUnitySceneCloudGradient,
  sampleSoStylizedUnitySceneSkyGradient,
} from '../src/environment/soStylizedUnitySceneSkyMaterials.js';
import {
  linearizeSoStylizedUnityColorProperty,
} from '../src/environment/soStylizedUnitySceneRecords.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const DEFAULT_SUPPLIED_PROJECT = resolve(
  WORKSPACE_ROOT,
  '..',
  '..',
  'Setup Guide In-Editor Tutorial',
);
const suppliedProject = resolve(
  process.env.TOONLAB_UNITY_PROJECT_ROOT ?? DEFAULT_SUPPLIED_PROJECT,
);
const suppliedAssetRoot = resolve(suppliedProject, 'Assets', 'SoStylized-Unity');
// CI may not mount the original Unity project. The workspace mirror is only
// accepted because every consumed file is SHA-pinned below.
const sourceAssetRoot = existsSync(suppliedAssetRoot)
  ? suppliedAssetRoot
  : resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const skySourceRoot = resolve(sourceAssetRoot, 'Environment', 'Sky');

const packageCache = resolve(suppliedProject, 'Library', 'PackageCache');
const urpRoot = process.env.TOONLAB_URP_PACKAGE_ROOT
  ? resolve(process.env.TOONLAB_URP_PACKAGE_ROOT)
  : existsSync(packageCache)
    ? resolve(packageCache, readdirSync(packageCache).find(
      (name) => name.startsWith('com.unity.render-pipelines.universal@'),
    ) ?? '__missing_urp__')
    : null;
assert.ok(
  urpRoot && existsSync(resolve(urpRoot, 'package.json')),
  'URP 17.5 source is required. Set TOONLAB_URP_PACKAGE_ROOT when the supplied project is elsewhere.',
);

const generatedRoot = resolve(
  PACKAGE_ROOT,
  'assets-local',
  'sostylized-unity',
  'generated-shaders',
);
const sceneManifestFile = resolve(
  PACKAGE_ROOT,
  'assets-local',
  'sostylized-unity',
  'mega-scene',
  'scene-manifest.json',
);

const sourceFiles = Object.freeze({
  skyGraph: Object.freeze({
    file: resolve(skySourceRoot, 'Shaders', 'S_StylizedSky.shadergraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.sourceGraphSha256,
  }),
  cloudsGraph: Object.freeze({
    file: resolve(skySourceRoot, 'Shaders', 'S_StylizedClouds.shadergraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.sourceGraphSha256,
  }),
  cloudsSubgraph: Object.freeze({
    file: resolve(skySourceRoot, 'Shaders', 'SG_Clouds.shadersubgraph'),
    sha256: SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.sourceSubgraphSha256,
  }),
  skyMaterial: Object.freeze({
    file: resolve(skySourceRoot, 'Materials', 'M_StylizedSky.mat'),
    sha256: SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.sourceMaterialSha256,
  }),
  cloudsMaterial: Object.freeze({
    file: resolve(skySourceRoot, 'Materials', 'M_Clouds.mat'),
    sha256: SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.sourceMaterialSha256,
  }),
  generatedManifest: Object.freeze({
    file: resolve(generatedRoot, 'manifest.json'),
    sha256: '85aa10383cce4604af5cb232813031b9653111366815f4cb95787906ad2a9ca9',
  }),
  skyForwardPass: Object.freeze({
    file: resolve(generatedRoot, SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.generatedForwardPass),
    sha256: SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.generatedForwardPassSha256,
  }),
  cloudsForwardPass: Object.freeze({
    file: resolve(generatedRoot, SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.generatedForwardPass),
    sha256: SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.generatedForwardPassSha256,
  }),
  sceneManifest: Object.freeze({
    file: sceneManifestFile,
    sha256: '17c48bdc1809a02eaa157eec3146f86e1ab9614bc25d00952870125deece4ccd',
  }),
  urpPackage: Object.freeze({
    file: resolve(urpRoot, 'package.json'),
    sha256: 'cba551fe10d07d487ec66b4df208976fc6325a390cd9b4e87211bfeb5e983a6e',
  }),
  urpTarget: Object.freeze({
    file: resolve(urpRoot, 'Editor', 'ShaderGraph', 'Targets', 'UniversalTarget.cs'),
    sha256: '59da4b566154435e56bff75597fcef0cad5604b96f43f303ebe54de3ce252a58',
  }),
  urpUnlitPass: Object.freeze({
    file: resolve(urpRoot, 'Editor', 'ShaderGraph', 'Includes', 'UnlitPass.hlsl'),
    sha256: '4fc1f6bbc4dd959fbd2127c98e5806b35d53ffe57c1b12179519af679e8e6f4e',
  }),
  urpUnlitLibrary: Object.freeze({
    file: resolve(urpRoot, 'ShaderLibrary', 'Unlit.hlsl'),
    sha256: 'acc3485ba8bef1432f58a86b6292a6270f7bdb902ee378173eb5810dd8783035',
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

for (const [name, record] of Object.entries(sourceFiles)) {
  assert.equal(
    sha256(readFileSync(record.file)),
    record.sha256,
    `${name} changed; re-audit source graph/pass logic before updating its hash`,
  );
}

const urpPackage = JSON.parse(readFileSync(sourceFiles.urpPackage.file, 'utf8'));
assert.equal(urpPackage.name, 'com.unity.render-pipelines.universal');
assert.equal(urpPackage.version, '17.5.0');

function parseUnityGraph(file) {
  const documents = readFileSync(file, 'utf8')
    .trim()
    .split(/\n\n(?=\{)/)
    .map(JSON.parse);
  const root = documents.find(
    (document) => document.m_Type === 'UnityEditor.ShaderGraph.GraphData',
  );
  assert.ok(root, `${file} has no Shader Graph GraphData document`);
  return {
    byId: new Map(documents.map((document) => [document.m_ObjectId, document])),
    documents,
    root,
  };
}

function shortType(document) {
  return String(document?.m_Type ?? '').split('.').at(-1);
}

function connectedTopologySha256(graph) {
  const payload = {
    nodes: graph.root.m_Nodes.map(({ m_Id: id }) => (
      `${id}:${shortType(graph.byId.get(id))}`
    )).sort(),
    edges: graph.root.m_Edges.map((edge) => (
      `${edge.m_OutputSlot.m_Node.m_Id}:${edge.m_OutputSlot.m_SlotId}`
      + `->${edge.m_InputSlot.m_Node.m_Id}:${edge.m_InputSlot.m_SlotId}`
    )).sort(),
    fragment: graph.root.m_FragmentContext.m_Blocks.map(({ m_Id: id }) => id),
    vertex: graph.root.m_VertexContext.m_Blocks.map(({ m_Id: id }) => id),
  };
  return sha256(JSON.stringify(payload));
}

function assertEdge(graph, outputNode, outputSlot, inputNode, inputSlot) {
  const found = graph.root.m_Edges.some((edge) => (
    edge.m_OutputSlot.m_Node.m_Id === outputNode
    && edge.m_OutputSlot.m_SlotId === outputSlot
    && edge.m_InputSlot.m_Node.m_Id === inputNode
    && edge.m_InputSlot.m_SlotId === inputSlot
  ));
  assert.ok(
    found,
    `Missing graph edge ${outputNode}:${outputSlot}->${inputNode}:${inputSlot}`,
  );
}

function propertyByReferenceName(graph, referenceName) {
  for (const reference of graph.root.m_Properties) {
    const property = graph.byId.get(reference.m_Id);
    if (property?.m_DefaultReferenceName === referenceName) return property;
  }
  return null;
}

function propertyNodeCount(graph, property) {
  return graph.documents.filter(
    (document) => shortType(document) === 'PropertyNode'
      && document.m_Property?.m_Id === property?.m_ObjectId,
  ).length;
}

const skyGraph = parseUnityGraph(sourceFiles.skyGraph.file);
const cloudsGraph = parseUnityGraph(sourceFiles.cloudsGraph.file);
const cloudsSubgraph = parseUnityGraph(sourceFiles.cloudsSubgraph.file);
assert.equal(skyGraph.root.m_Nodes.length, 29);
assert.equal(skyGraph.root.m_Edges.length, 26);
assert.equal(cloudsGraph.root.m_Nodes.length, 38);
assert.equal(cloudsGraph.root.m_Edges.length, 48);
assert.equal(cloudsSubgraph.root.m_Nodes.length, 32);
assert.equal(cloudsSubgraph.root.m_Edges.length, 35);
assert.equal(
  connectedTopologySha256(skyGraph),
  SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.connectedTopologySha256,
);
assert.equal(
  connectedTopologySha256(cloudsGraph),
  SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.connectedTopologySha256,
);
assert.equal(
  connectedTopologySha256(cloudsSubgraph),
  SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.subgraphConnectedTopologySha256,
);

const cloudColorProperty = propertyByReferenceName(skyGraph, '_Cloud_Color');
assert.equal(shortType(cloudColorProperty), 'ColorShaderProperty');
assert.equal(
  cloudColorProperty.m_ColorMode,
  0,
  'S_StylizedSky _Cloud_Color is ColorMode.Default and enters graph math in linear space',
);
assert.ok(
  propertyNodeCount(skyGraph, cloudColorProperty) > 0,
  'S_StylizedSky _Cloud_Color must remain connected',
);

// S_StylizedSky: Gradient -> Screen(Base); texture.r * CloudColor ->
// Screen(Blend); CloudOpacity -> Screen(Opacity); result * Strength -> BaseColor.
for (const edge of [
  ['74f0ba1880114e779b789dea1d703258', 2, 'a75b49f2562647c2bb15b8daa12831fd', 0],
  ['9ee4c863a23a4af790d977ef83182e54', 4, 'ecfa579fcd7544a1bb47ef6e97865766', 0],
  ['00604205c0034b80b1307c1a65b46bfd', 0, 'ecfa579fcd7544a1bb47ef6e97865766', 1],
  ['ecfa579fcd7544a1bb47ef6e97865766', 2, 'a75b49f2562647c2bb15b8daa12831fd', 1],
  ['fb8c7a2754b94b6aa3c629ca353f9586', 0, 'a75b49f2562647c2bb15b8daa12831fd', 3],
  ['a75b49f2562647c2bb15b8daa12831fd', 2, '5b7308e3c66640caadfca2d29f81e216', 0],
  ['779f13fc22244cf3af3ab5e1809ddf89', 0, '5b7308e3c66640caadfca2d29f81e216', 1],
  ['5b7308e3c66640caadfca2d29f81e216', 2, 'b6ec5fac33534207b4d33aebfac1f1b4', 0],
]) assertEdge(skyGraph, ...edge);

// S_StylizedClouds: layer3 -> layer2 by alpha2 -> layer1 by alpha1;
// independent Maximum chain supplies Alpha.
for (const edge of [
  ['ca09e609687040139e43d7de86b4b432', 1, '9c6a6c389b9a4e4fb01ac1ba0ab4fa3c', 0],
  ['12c2988bd331419cb57c4182c16fcee7', 1, '28bdd810f067406caabdc3db311356c5', 0],
  ['479eafda1fff45929313e135b396d66b', 1, '6ee0a0c8882b4b5682d1fac8bd10eb81', 0],
  ['186a402c57c442af9dbe1ffb47db5f20', 0, '09e5471969cc480ebb7c81bc02098df1', 0],
  ['50f0a020b9174bd69aa860bbefe67703', 0, '09e5471969cc480ebb7c81bc02098df1', 1],
  ['28bdd810f067406caabdc3db311356c5', 4, '09e5471969cc480ebb7c81bc02098df1', 2],
  ['09e5471969cc480ebb7c81bc02098df1', 3, '04223a2ca96f4c7f98b209f711e71952', 0],
  ['ec8da660eed942c9af4e0fb64b31dde6', 0, '04223a2ca96f4c7f98b209f711e71952', 1],
  ['6ee0a0c8882b4b5682d1fac8bd10eb81', 4, '04223a2ca96f4c7f98b209f711e71952', 2],
  ['04223a2ca96f4c7f98b209f711e71952', 3, 'dd7089c5a8f34d348400431ee0895f75', 0],
  ['dd7089c5a8f34d348400431ee0895f75', 2, '1f76ed5341fe46fa870c556db835a423', 0],
  ['28bdd810f067406caabdc3db311356c5', 4, '4a46d5601aa64cc4a47013c9828362f3', 0],
  ['9c6a6c389b9a4e4fb01ac1ba0ab4fa3c', 4, '4a46d5601aa64cc4a47013c9828362f3', 1],
  ['4a46d5601aa64cc4a47013c9828362f3', 2, '275f97cde454417382144eae69602c06', 1],
  ['6ee0a0c8882b4b5682d1fac8bd10eb81', 4, '275f97cde454417382144eae69602c06', 0],
  ['275f97cde454417382144eae69602c06', 2, 'fe5c8c2a88a94f17b6f9fcf6aced692a', 0],
]) assertEdge(cloudsGraph, ...edge);

const tintProperty = propertyByReferenceName(cloudsGraph, '_Tint');
assert.ok(tintProperty, 'S_StylizedClouds must retain the serialized _Tint property');
assert.equal(shortType(tintProperty), 'ColorShaderProperty');
assert.equal(tintProperty.m_ColorMode, 0, 'S_StylizedClouds _Tint ColorMode.Default');
assert.equal(
  propertyNodeCount(cloudsGraph, tintProperty),
  0,
  '_Tint must remain disconnected',
);

// SG_Clouds: UV/time/offset/noise -> cloud sample; sample.r -> gradient RGB;
// sample.a bypasses the gradient and becomes output alpha.
for (const edge of [
  ['9542fea501904a55b25445e2e26048fd', 0, '613afcbefc1a447c98e3c987d57a025f', 0],
  ['613afcbefc1a447c98e3c987d57a025f', 1, 'c62dca834608481ab05f94304659a7d2', 1],
  ['613afcbefc1a447c98e3c987d57a025f', 2, 'c62dca834608481ab05f94304659a7d2', 2],
  ['c62dca834608481ab05f94304659a7d2', 0, '7453e430a0c540728fecb904fa8951f4', 0],
  ['7453e430a0c540728fecb904fa8951f4', 3, 'c165a0114997499bba5971dcf4e02aad', 0],
  ['2614000b65e24f6293e33a22289a2613', 4, 'c1b4ee13dc1d42fd9516e3fb76bb281e', 0],
  ['757863250bd044378f05f8f229b3dcac', 2, 'c1b4ee13dc1d42fd9516e3fb76bb281e', 1],
  ['c1b4ee13dc1d42fd9516e3fb76bb281e', 2, 'c165a0114997499bba5971dcf4e02aad', 1],
  ['c165a0114997499bba5971dcf4e02aad', 2, 'd75fdf400cc34b308e1b8fbd67c9d41b', 2],
  ['d75fdf400cc34b308e1b8fbd67c9d41b', 4, 'e895a0ffd5694a46a47fe60434369043', 1],
  ['e895a0ffd5694a46a47fe60434369043', 2, 'edb00f7307604e1e9b5b42b1fd28d9a5', 0],
  ['d75fdf400cc34b308e1b8fbd67c9d41b', 7, 'f5637033444044beadade7d3c9422a6c', 4],
  ['f5637033444044beadade7d3c9422a6c', 0, 'c8095c09eb7d42379aeb3dc5e6960903', 1],
]) assertEdge(cloudsSubgraph, ...edge);

function universalTarget(graph) {
  return graph.documents.find(
    (document) => shortType(document) === 'UniversalTarget',
  );
}

const skyTarget = universalTarget(skyGraph);
const cloudsTarget = universalTarget(cloudsGraph);
assert.deepEqual({
  alphaClip: skyTarget.m_AlphaClip,
  alphaMode: skyTarget.m_AlphaMode,
  castShadows: skyTarget.m_CastShadows,
  renderFace: skyTarget.m_RenderFace,
  surfaceType: skyTarget.m_SurfaceType,
  zTest: skyTarget.m_ZTestMode,
  zWriteControl: skyTarget.m_ZWriteControl,
}, {
  alphaClip: false,
  alphaMode: 0,
  castShadows: false,
  renderFace: 2,
  surfaceType: 0,
  zTest: 4,
  zWriteControl: 0,
});
assert.deepEqual({
  alphaClip: cloudsTarget.m_AlphaClip,
  alphaMode: cloudsTarget.m_AlphaMode,
  castShadows: cloudsTarget.m_CastShadows,
  renderFace: cloudsTarget.m_RenderFace,
  surfaceType: cloudsTarget.m_SurfaceType,
  zTest: cloudsTarget.m_ZTestMode,
  zWriteControl: cloudsTarget.m_ZWriteControl,
}, {
  alphaClip: false,
  alphaMode: 0,
  castShadows: false,
  renderFace: 2,
  surfaceType: 1,
  zTest: 4,
  // UniversalTarget.cs: Auto=0, ForceEnabled=1, ForceDisabled=2.
  zWriteControl: 1,
});
for (const graph of [skyGraph, cloudsGraph]) {
  const target = universalTarget(graph);
  const subtarget = graph.byId.get(target.m_ActiveSubTarget.m_Id);
  assert.equal(shortType(subtarget), 'UniversalUnlitSubTarget');
}

const skyPass = readFileSync(sourceFiles.skyForwardPass.file, 'utf8');
const cloudsPass = readFileSync(sourceFiles.cloudsForwardPass.file, 'utf8');
assert.match(skyPass, /#define SHADERPASS SHADERPASS_UNLIT/);
assert.match(skyPass, /struct SurfaceDescription\s*\{\s*float3 BaseColor;\s*\}/);
assert.match(
  skyPass,
  /Unity_SampleGradientV1_float\([^;]+\(_TilingAndOffset_6ba041aebc68462e9d0b5ddbdafc8bad_Out_3_Vector2\)\.x/,
);
assert.match(skyPass, /float2\(float\(0\), _Property_d61a2d406e5c4a2986c77459184014bb_Out_0_Float\)/);
assert.match(skyPass, /Unity_Blend_Screen_float4\(/);
assert.match(skyPass, /surface\.BaseColor = \(_Multiply_5b7308e3c66640caadfca2d29f81e216_Out_2_Vector4\.xyz\);/);
assert.doesNotMatch(skyPass, /surface\.Alpha\s*=/);

assert.match(cloudsPass, /#define SHADERPASS SHADERPASS_UNLIT/);
assert.match(cloudsPass, /#define _SURFACE_TYPE_TRANSPARENT 1/);
assert.match(
  cloudsPass,
  /Unity_Multiply_float_float\(_Property_acb17ffee3024bcdb931ae5e4a95362a_Out_0_Float, 0\.05,/,
);
assert.match(
  cloudsPass,
  /Unity_Multiply_float_float\(_Property_8e8bb7f3e537467797aa98d762d212cb_Out_0_Float, -0\.01,/,
);
assert.match(
  cloudsPass,
  /Unity_Multiply_float_float\(_Property_edd915199e6a4fd0889b37b7640f331c_Out_0_Float, 0\.2,/,
);
assert.match(
  cloudsPass,
  /Unity_Lerp_float3\(_Vector3_186a402c57c442af9dbe1ffb47db5f20_Out_0_Vector3, _Vector3_50f0a020b9174bd69aa860bbefe67703_Out_0_Vector3, \(_Split_28bdd810f067406caabdc3db311356c5_A_4_Float\.xxx\),/,
);
assert.match(
  cloudsPass,
  /Unity_Lerp_float3\(_Lerp_09e5471969cc480ebb7c81bc02098df1_Out_3_Vector3, _Vector3_ec8da660eed942c9af4e0fb64b31dde6_Out_0_Vector3, \(_Split_6ee0a0c8882b4b5682d1fac8bd10eb81_A_4_Float\.xxx\),/,
);
assert.match(cloudsPass, /surface\.BaseColor = _Multiply_dd7089c5a8f34d348400431ee0895f75_Out_2_Vector3;/);
assert.match(cloudsPass, /surface\.Alpha = _Maximum_275f97cde454417382144eae69602c06_Out_2_Float;/);
const cloudsSurfaceFunction = cloudsPass.slice(
  cloudsPass.indexOf('SurfaceDescription SurfaceDescriptionFunction'),
  cloudsPass.indexOf('// --------------------------------------------------\n// Build Graph Inputs'),
);
assert.doesNotMatch(cloudsSurfaceFunction, /\b_Tint\b/);

const urpTargetSource = readFileSync(sourceFiles.urpTarget.file, 'utf8');
assert.match(urpTargetSource, /enum SurfaceType\s*\{\s*Opaque,\s*Transparent,/);
assert.match(urpTargetSource, /Auto = 0,\s*ForceEnabled = 1,\s*ForceDisabled = 2/);
assert.match(urpTargetSource, /Front = 2[^]*Back = 1[^]*Both = 0/);
const urpUnlitPass = readFileSync(sourceFiles.urpUnlitPass.file, 'utf8');
const urpUnlitLibrary = readFileSync(sourceFiles.urpUnlitLibrary.file, 'utf8');
assert.match(urpUnlitPass, /UniversalFragmentUnlit\(inputData, surfaceDescription\.BaseColor, alpha\)/);
assert.match(urpUnlitPass, /finalColor\.a = OutputAlpha\(finalColor\.a, isTransparent\)/);
assert.doesNotMatch(urpUnlitPass, /MixFog|ComputeFogFactor|ComputeFogIntensity/);
assert.match(urpUnlitLibrary, /half4 finalColor = half4\(albedo \+ surfaceData\.emission, surfaceData\.alpha\)/);
assert.doesNotMatch(urpUnlitLibrary, /GetMainLight|LightingLambert|MainLightRealtimeShadow/);
assert.doesNotMatch(urpUnlitLibrary, /MixFog|ComputeFogFactor|ComputeFogIntensity/);

const generatedManifest = JSON.parse(readFileSync(sourceFiles.generatedManifest.file, 'utf8'));
assert.equal(generatedManifest.schema, 'toonlab.sostylized-unity.generated-shaders');
assert.equal(generatedManifest.unityVersion, '6000.5.4f1');
for (const [shaderName, graphContract] of [
  [SO_STYLIZED_UNITY_SCENE_SKY_SHADER, SO_STYLIZED_UNITY_SCENE_SKY_GRAPH],
  [SO_STYLIZED_UNITY_SCENE_CLOUDS_SHADER, SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH],
]) {
  const record = generatedManifest.shaders.find(
    (candidate) => candidate.shaderName === shaderName,
  );
  assert.ok(record, `${shaderName} missing from generated shader manifest`);
  assert.equal(record.graphSha256, graphContract.sourceGraphSha256);
  const pass = record.passes.find(
    (candidate) => candidate.file === graphContract.generatedForwardPass,
  );
  assert.equal(pass?.sha256, graphContract.generatedForwardPassSha256);
}

const sceneManifest = JSON.parse(readFileSync(sceneManifestFile, 'utf8'));
assert.equal(sceneManifest.schema, 'toonlab.sostylized-unity.scene-export');
const skyRecord = sceneManifest.materials.find(({ name }) => name === 'M_StylizedSky');
const cloudsRecord = sceneManifest.materials.find(({ name }) => name === 'M_Clouds');
assert.ok(skyRecord);
assert.ok(cloudsRecord);
assert.equal(skyRecord.index, 115);
assert.equal(skyRecord.renderQueue, 2000);
assert.equal(skyRecord.shaderName, SO_STYLIZED_UNITY_SCENE_SKY_SHADER);
assert.equal(skyRecord.asset.guid, '3cb0e508465add445ba0e9a0cb582ea1');
assert.equal(cloudsRecord.index, 116);
assert.equal(cloudsRecord.renderQueue, 3000);
assert.equal(cloudsRecord.shaderName, SO_STYLIZED_UNITY_SCENE_CLOUDS_SHADER);
assert.equal(cloudsRecord.asset.guid, '84a6249350373bc4da08b9c3833a599f');

const skyInputs = resolveSoStylizedUnitySceneSkyInputs(skyRecord);
assert.deepEqual(skyInputs, {
  backgroundCloudTextureIndex: 96,
  cloudColor: [1, 1, 1, 1],
  cloudOpacity: 0.4000000059604645,
  materialIndex: 115,
  materialName: 'M_StylizedSky',
  renderQueue: 2000,
  strength: 1,
  verticalOffset: 0.019999999552965164,
});
assert.deepEqual(
  linearizeSoStylizedUnityColorProperty(skyInputs.cloudColor),
  [1, 1, 1, 1],
  'M_StylizedSky Default color is decoded before graph multiplication (identity for authored white)',
);
const cloudsInputs = resolveSoStylizedUnitySceneCloudInputs(cloudsRecord);
assert.deepEqual(cloudsInputs, {
  layers: [
    {
      layer: 1,
      panningSpeed: 0.6000000238418579,
      textureIndex: 97,
      textureProperty: '_1_Cloud_Texture',
      verticalOffset: 0.8799999952316284,
      verticalSquash: 4.389999866485596,
    },
    {
      layer: 2,
      panningSpeed: 0.4000000059604645,
      textureIndex: 98,
      textureProperty: '_2_Cloud_Texture_1',
      verticalOffset: 0.49000000953674316,
      verticalSquash: 2.259999990463257,
    },
    {
      layer: 3,
      panningSpeed: 0.10000000149011612,
      textureIndex: 99,
      textureProperty: '_3_Cloud_Texture_2',
      verticalOffset: 0.6200000047683716,
      verticalSquash: 3.630000114440918,
    },
  ],
  materialIndex: 116,
  materialName: 'M_Clouds',
  noiseSpeed: 1,
  noiseStrength: 0.4000000059604645,
  noiseTextureIndex: 100,
  renderQueue: 3000,
  strength: 2,
  tint: [1, 1, 1, 0],
});

const expectedTextures = [
  [96, 'T_BackroundClouds1B', '31a8ea2781a559f4eba264fc4d4e98ac', 2048, 1024, 'DXT1'],
  [97, 'T_CloudLayer02', 'bfce570a686614d488b4032572aada1c', 8192, 512, 'BC7'],
  [98, 'T_CloudLayer03', '5c705836460458542aab57578fd962c4', 8192, 1024, 'BC7'],
  [99, 'T_CloudLayer11', 'd32adadabbfe36341b333fe1da49481b', 8192, 512, 'BC7'],
  [100, 'T_NoiseRough_MidContrast', '73e56601cf08e3c41af080d2cabf06d0', 2048, 2048, 'DXT1'],
];
const expectedImporter = {
  alphaIsTransparency: false,
  alphaSource: 'FromInput',
  anisoLevel: 1,
  filterMode: 'Bilinear',
  flipGreenChannel: false,
  mipmapEnabled: true,
  npotScale: 'ToNearest',
  present: true,
  sRGBTexture: true,
  textureShape: 'Texture2D',
  textureType: 'Default',
  wrapMode: 'Repeat',
};
for (const [index, name, guid, width, height, format] of expectedTextures) {
  const record = sceneManifest.textures[index];
  assert.deepEqual({
    format: record.format,
    guid: record.asset.guid,
    height: record.height,
    index: record.index,
    name: record.name,
    width: record.width,
  }, { format, guid, height, index, name, width });
  assert.equal(
    record.exactSourceCopy,
    `textures/source/${guid}_${name}.png`,
  );
  assert.deepEqual(record.importer, expectedImporter);
}

function closeArray(actual, expected, epsilon = 1e-12) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(
    Math.abs(value - expected[index]) <= epsilon,
    `${value} differs from ${expected[index]} at channel ${index}`,
  ));
}

for (const key of SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.gradient) {
  closeArray(sampleSoStylizedUnitySceneSkyGradient(key.position), key.color);
}
for (const key of SO_STYLIZED_UNITY_SCENE_CLOUDS_GRAPH.gradient) {
  closeArray(sampleSoStylizedUnitySceneCloudGradient(key.position), key.color);
}
const composedProbe = composeSoStylizedUnitySceneCloudSurface(
  { alpha: 0.25, rgb: [1, 0, 0] },
  { alpha: 0.5, rgb: [0, 1, 0] },
  { alpha: 0.2, rgb: [0, 0, 1] },
  2,
);
assert.deepEqual(composedProbe, { alpha: 0.5, baseColor: [0.5, 0.75, 0.75] });

class VerificationTextureLoader {
  urls = [];

  async loadAsync(url) {
    this.urls.push(String(url));
    const result = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    result.name = `raw:${url}`;
    return result;
  }
}

function collectGraphObjects(roots) {
  const pending = [...roots].filter(Boolean);
  const visited = new WeakSet();
  const result = [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    result.push(value);
    for (const key of Object.keys(value)) {
      let child;
      try { child = value[key]; } catch { continue; }
      if (Array.isArray(child)) pending.push(...child);
      else if (child && typeof child === 'object') pending.push(child);
    }
  }
  return result;
}

const skyTextureLoader = new VerificationTextureLoader();
const skyMaterial = await buildSoStylizedUnitySceneSkyMaterial(
  skyRecord,
  sceneManifest,
  {
    baseUrl: '/unity-sky-parity',
    textureLoader: skyTextureLoader,
  },
);
const cloudTextureLoader = new VerificationTextureLoader();
const cloudMaterial = await buildSoStylizedUnitySceneSkyFamilyMaterial(
  cloudsRecord,
  sceneManifest,
  {
    baseUrl: '/unity-cloud-parity',
    textureLoader: cloudTextureLoader,
  },
);

assert.equal(skyMaterial.type, 'MeshBasicNodeMaterial');
assert.equal(skyMaterial.isMeshBasicNodeMaterial, true);
assert.equal(skyMaterial.side, THREE.FrontSide);
assert.equal(skyMaterial.depthFunc, THREE.LessEqualDepth);
assert.equal(skyMaterial.depthTest, true);
assert.equal(skyMaterial.depthWrite, true);
assert.equal(skyMaterial.transparent, false);
assert.equal(skyMaterial.blending, THREE.NoBlending);
assert.equal(skyMaterial.fog, false);
assert.equal(skyMaterial.userData.soStylizedUnityMaterial.fogParticipation, false);
assert.ok(skyMaterial.mrtNode?.outputNodes?.[
  SO_STYLIZED_UNITY_FOG_PARTICIPATION_MRT
]);
assert.equal(skyMaterial.toneMapped, false);
assert.ok(skyMaterial.colorNode);
assert.equal(skyMaterial.opacityNode, null);
assert.equal(skyMaterial.userData.soStylizedUnityMaterial.graphExact, true);
assert.deepEqual(
  skyMaterial.userData.soStylizedUnityMaterial.linearColorProperties,
  { cloudColor: [1, 1, 1, 1] },
);
assert.equal(
  skyMaterial.userData.soStylizedUnityMaterial.exactGraph.shadingModel,
  'UniversalUnlitSubTarget',
);
assert.deepEqual(
  skyMaterial.userData.soStylizedUnityMaterial.tslRuntimeGraph.surfaceOutputs,
  ['colorNode:BaseColor'],
);
assert.equal(
  skyMaterial.userData.soStylizedUnityMaterial.tslRuntimeGraph.sourceTopologySha256,
  SO_STYLIZED_UNITY_SCENE_SKY_GRAPH.connectedTopologySha256,
);
assert.equal(skyTextureLoader.urls.length, 1);

assert.equal(cloudMaterial.type, 'MeshBasicNodeMaterial');
assert.equal(cloudMaterial.isMeshBasicNodeMaterial, true);
assert.equal(cloudMaterial.side, THREE.FrontSide);
assert.equal(cloudMaterial.depthFunc, THREE.LessEqualDepth);
assert.equal(cloudMaterial.depthTest, true);
assert.equal(cloudMaterial.depthWrite, true);
assert.equal(cloudMaterial.transparent, true);
assert.equal(cloudMaterial.blending, THREE.NormalBlending);
assert.equal(cloudMaterial.premultipliedAlpha, false);
assert.equal(cloudMaterial.fog, false);
assert.equal(cloudMaterial.userData.soStylizedUnityMaterial.fogParticipation, false);
assert.ok(cloudMaterial.mrtNode?.outputNodes?.[
  SO_STYLIZED_UNITY_FOG_PARTICIPATION_MRT
]);
assert.equal(cloudMaterial.toneMapped, false);
assert.ok(cloudMaterial.colorNode);
assert.ok(cloudMaterial.opacityNode);
assert.equal(cloudMaterial.userData.soStylizedUnityMaterial.graphExact, true);
assert.equal(
  cloudMaterial.userData.soStylizedUnityMaterial.switches.tintPropertyConnected,
  false,
);
assert.equal(
  cloudMaterial.userData.soStylizedUnityMaterial.switches
    .depthWriteForcedOnForTransparentSurface,
  true,
);
assert.equal(
  cloudMaterial.userData.soStylizedUnityMaterial.tslRuntimeGraph.textureSampleCount,
  6,
);
assert.deepEqual(
  cloudMaterial.userData.soStylizedUnityMaterial.tslRuntimeGraph.surfaceOutputs,
  ['colorNode:BaseColor', 'opacityNode:Alpha'],
);
assert.equal(cloudTextureLoader.urls.length, 4);

const skyRuntimeGraph = collectGraphObjects([skyMaterial.colorNode]);
const cloudRuntimeGraph = collectGraphObjects([
  cloudMaterial.colorNode,
  cloudMaterial.opacityNode,
]);
assert.equal(
  skyRuntimeGraph.filter((node) => node?.constructor?.name === 'TextureNode').length,
  2,
  'TSL sky graph must retain one connected texture sample',
);
assert.equal(
  cloudRuntimeGraph.filter((node) => node?.constructor?.name === 'TextureNode').length,
  12,
  'TSL cloud graph must retain six connected samples (sample node + sampler wrapper)',
);
const runtimeTextures = (graph) => [...new Set(
  graph.filter((node) => node?.isTexture === true),
)];
const skyTextures = runtimeTextures(skyRuntimeGraph);
const cloudTextures = runtimeTextures(cloudRuntimeGraph);
assert.deepEqual(skyTextures.map(({ name }) => name), [
  'SoStylizedUnity:T_BackroundClouds1B',
]);
assert.deepEqual(cloudTextures.map(({ name }) => name).sort(), [
  'SoStylizedUnity:T_CloudLayer02',
  'SoStylizedUnity:T_CloudLayer03',
  'SoStylizedUnity:T_CloudLayer11',
  'SoStylizedUnity:T_NoiseRough_MidContrast',
]);
for (const map of [...skyTextures, ...cloudTextures]) {
  assert.equal(map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(map.wrapS, THREE.RepeatWrapping);
  assert.equal(map.wrapT, THREE.RepeatWrapping);
  assert.equal(map.generateMipmaps, true);
  assert.equal(map.minFilter, THREE.LinearMipmapNearestFilter);
  assert.equal(map.magFilter, THREE.LinearFilter);
  assert.equal(map.anisotropy, 1);
  assert.equal(map.userData.soStylizedUnityTexture.importer.sRGBTexture, true);
  assert.equal(map.userData.soStylizedUnityTexture.importer.filterMode, 'Bilinear');
  assert.equal(map.userData.soStylizedUnityTexture.importer.wrapMode, 'Repeat');
}

await assert.rejects(
  buildSoStylizedUnitySceneCloudMaterial(skyRecord, sceneManifest),
  /Expected Shader Graphs\/S_StylizedClouds/,
);

console.log(
  'So Stylized Unity sky/cloud source parity verification passed '
  + '(Shader Graph topology, generated URP Unlit outputs, material/importer values, and TSL runtime graph).',
);
