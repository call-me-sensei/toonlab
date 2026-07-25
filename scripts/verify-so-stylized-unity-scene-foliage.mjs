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
  SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH,
  SO_STYLIZED_UNITY_SCENE_FOLIAGE_NOISE_PROPERTY,
  SO_STYLIZED_UNITY_SCENE_FOLIAGE_SHADER,
  buildSoStylizedUnitySceneFoliageMaterial,
  evaluateSoStylizedUnitySceneFoliageSourceWorldXZ,
  reflectSoStylizedUnitySceneFoliageObjectVector,
  resolveSoStylizedUnitySceneFoliageInputs,
  sampleSoStylizedUnitySceneFoliageGradient,
} from '../src/environment/soStylizedUnitySceneFoliageMaterials.js';
import {
  linearizeSoStylizedUnityColorProperty,
} from '../src/environment/soStylizedUnitySceneRecords.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const UNITY_ASSET_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const UNITY_PROJECT = process.env.TOONLAB_SOSTYLIZED_UNITY_PROJECT
  ?? '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial';
const MANIFEST_PATH = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene/scene-manifest.json',
);
const RUNTIME_MODULE_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/soStylizedUnitySceneFoliageMaterials.js',
);
const sourceFiles = Object.freeze({
  foliage: Object.freeze({
    file: resolve(
      UNITY_ASSET_ROOT,
      SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.sourceGraph,
    ),
    sha256: SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.sourceGraphSha256,
  }),
  cameraDither: Object.freeze({
    file: resolve(
      UNITY_ASSET_ROOT,
      SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.cameraDitherGraph,
    ),
    sha256: SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.cameraDitherGraphSha256,
  }),
  distanceFade: Object.freeze({
    file: resolve(
      UNITY_ASSET_ROOT,
      SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.distanceFadeGraph,
    ),
    sha256: SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.distanceFadeGraphSha256,
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function close(actual, expected, epsilon = 1e-8) {
  return Math.abs(Number(actual) - Number(expected)) <= epsilon;
}

function parseShaderGraph(text) {
  const objects = [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
    } else if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) objects.push(JSON.parse(text.slice(start, index + 1)));
    }
  }
  assert.equal(depth, 0, 'Shader Graph JSON objects are unbalanced.');
  const byId = new Map(objects.map((object) => [object.m_ObjectId, object]));
  const graph = objects.find((object) => object.m_Type === 'UnityEditor.ShaderGraph.GraphData');
  assert.ok(graph, 'GraphData record is missing.');
  const incoming = new Map();
  for (const edge of graph.m_Edges) {
    const nodeId = edge.m_InputSlot.m_Node.m_Id;
    if (!incoming.has(nodeId)) incoming.set(nodeId, new Map());
    incoming.get(nodeId).set(edge.m_InputSlot.m_SlotId, edge.m_OutputSlot);
  }
  const propertyByReference = new Map(objects
    .filter((object) => object.m_DefaultReferenceName)
    .map((object) => [object.m_DefaultReferenceName, object]));

  function slot(node, slotIdOrName) {
    for (const reference of node.m_Slots ?? []) {
      const candidate = byId.get(reference.m_Id);
      if (candidate?.m_Id === slotIdOrName
        || candidate?.m_DisplayName === slotIdOrName) return candidate;
    }
    return null;
  }

  function upstream(node, slotIdOrName) {
    const input = slot(node, slotIdOrName);
    assert.ok(input, `${node.m_Name ?? node.m_Type} has no ${slotIdOrName} slot.`);
    const output = incoming.get(node.m_ObjectId)?.get(input.m_Id);
    assert.ok(output, `${node.m_Name ?? node.m_Type}.${input.m_DisplayName} is unconnected.`);
    const source = byId.get(output.m_Node.m_Id);
    assert.ok(source, 'Upstream node record is missing.');
    return { node: source, outputSlot: slot(source, output.m_SlotId) };
  }

  function propertyNodeReference(node) {
    if (node.m_Type !== 'UnityEditor.ShaderGraph.PropertyNode') return null;
    return byId.get(node.m_Property?.m_Id)?.m_DefaultReferenceName ?? null;
  }

  function assertPropertyInput(node, input, referenceName) {
    const source = upstream(node, input).node;
    assert.equal(source.m_Type, 'UnityEditor.ShaderGraph.PropertyNode');
    assert.equal(propertyNodeReference(source), referenceName);
    return source;
  }

  function nodeByType(type, predicate = () => true) {
    const result = objects.filter((object) => (
      object.m_Type === `UnityEditor.ShaderGraph.${type}`
      && predicate(object)
    ));
    assert.equal(result.length, 1, `Expected one ${type}; found ${result.length}.`);
    return result[0];
  }

  function block(name) {
    return nodeByType('BlockNode', (node) => node.m_Name === name);
  }

  function subgraphGuid(node) {
    return JSON.parse(node.m_SerializedSubGraph).subGraph.guid;
  }

  return {
    assertPropertyInput,
    block,
    byId,
    graph,
    incoming,
    nodeByType,
    objects,
    propertyByReference,
    propertyNodeReference,
    slot,
    subgraphGuid,
    upstream,
  };
}

for (const [name, source] of Object.entries(sourceFiles)) {
  assert.ok(existsSync(source.file), `${name} Unity source is missing: ${source.file}`);
  assert.equal(
    sha256(readFileSync(source.file)),
    source.sha256,
    `${name} changed; re-audit connected nodes before updating its hash.`,
  );
}

const foliageView = parseShaderGraph(readFileSync(sourceFiles.foliage.file, 'utf8'));
const cameraView = parseShaderGraph(readFileSync(sourceFiles.cameraDither.file, 'utf8'));
const distanceView = parseShaderGraph(readFileSync(sourceFiles.distanceFade.file, 'utf8'));

// Target state: opaque, Cull Off, alpha clip, specular-workflow Universal Lit.
const universalTarget = foliageView.objects.find((object) => (
  object.m_Type.endsWith('.UniversalTarget')
));
const litTarget = foliageView.objects.find((object) => (
  object.m_Type.endsWith('.UniversalLitSubTarget')
));
assert.equal(universalTarget.m_SurfaceType, 0);
assert.equal(universalTarget.m_RenderFace, 0);
assert.equal(universalTarget.m_AlphaClip, true);
assert.equal(universalTarget.m_CastShadows, true);
assert.equal(universalTarget.m_ReceiveShadows, true);
assert.equal(litTarget.m_WorkflowMode, 0, 'S_FoliageShader must use direct-F0 specular workflow.');

for (const referenceName of [
  '_Bottom_Color',
  '_Tip_Color',
  '_Texture_Tint',
  '_Specular_Color',
]) {
  const property = foliageView.propertyByReference.get(referenceName);
  assert.equal(
    property?.m_Type,
    'UnityEditor.ShaderGraph.Internal.ColorShaderProperty',
    `${referenceName} stopped being a Shader Graph Color property.`,
  );
  assert.equal(
    property.m_ColorMode,
    0,
    `${referenceName} stopped using ColorMode.Default.`,
  );
}

const hueNode = foliageView.nodeByType('HueNode');
const gradientNoiseNode = foliageView.nodeByType('GradientNoiseNode');
assert.equal(hueNode.m_HueMode, 1, 'Hue must stay in normalized HSV mode.');
assert.equal(gradientNoiseNode.m_HashType, 0, 'Wind must retain the Tchou gradient-noise hash.');

// _Height_Blend is exposed but is dead source data. Verify UV0.g, not that
// tempting scalar, owns the actual bottom/tip Lerp.
assert.ok(foliageView.propertyByReference.has('_Height_Blend'));
assert.equal(
  foliageView.objects.filter((node) => (
    foliageView.propertyNodeReference(node) === '_Height_Blend'
  )).length,
  0,
  '_Height_Blend unexpectedly became connected.',
);
assert.equal(SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.heightBlendPropertyConnected, false);
assert.equal(SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.heightBlendSource, 'UV0.g');

// Base color topology: Hue(UseTexture ? RGBA*Tint :
// lerp(Bottom, resolvedTip, UV0.g), per-object RandomRange + HueShift).
const baseRedirect = foliageView.upstream(
  foliageView.block('SurfaceDescription.BaseColor'),
  'Base Color',
).node;
const baseHue = foliageView.upstream(baseRedirect, 0).node;
assert.equal(baseHue.m_Type, 'UnityEditor.ShaderGraph.HueNode');
const colorBranch = foliageView.upstream(baseHue, 'In').node;
assert.equal(colorBranch.m_Type, 'UnityEditor.ShaderGraph.BranchNode');
foliageView.assertPropertyInput(colorBranch, 'Predicate', '_Use_Texture');
const textureMultiply = foliageView.upstream(colorBranch, 'True').node;
assert.equal(textureMultiply.m_Type, 'UnityEditor.ShaderGraph.MultiplyNode');
const foliageSampleEdge = foliageView.upstream(textureMultiply, 'A');
assert.equal(foliageSampleEdge.node.m_Type, 'UnityEditor.ShaderGraph.SampleTexture2DNode');
assert.equal(foliageSampleEdge.outputSlot.m_DisplayName, 'RGBA');
foliageView.assertPropertyInput(textureMultiply, 'B', '_Texture_Tint');
foliageView.assertPropertyInput(foliageSampleEdge.node, 'Texture', '_Foliage_Texture');
const bottomTipLerp = foliageView.upstream(colorBranch, 'False').node;
assert.equal(bottomTipLerp.m_Type, 'UnityEditor.ShaderGraph.LerpNode');
foliageView.assertPropertyInput(bottomTipLerp, 'A', '_Bottom_Color');
const heightEdge = foliageView.upstream(bottomTipLerp, 'T');
assert.equal(heightEdge.node.m_Type, 'UnityEditor.ShaderGraph.SplitNode');
assert.equal(heightEdge.outputSlot.m_DisplayName, 'G');
const heightUv = foliageView.upstream(heightEdge.node, 'In').node;
assert.equal(heightUv.m_Type, 'UnityEditor.ShaderGraph.UVNode');
assert.equal(heightUv.m_OutputChannel, 0);
const tipBranch = foliageView.upstream(bottomTipLerp, 'B').node;
foliageView.assertPropertyInput(tipBranch, 'Predicate', '_UseSolidTipColor');
foliageView.assertPropertyInput(tipBranch, 'True', '_Tip_Color');
const distanceTipLerp = foliageView.upstream(tipBranch, 'False').node;
foliageView.assertPropertyInput(distanceTipLerp, 'B', '_Tip_Color');
const tipDistanceSaturate = foliageView.upstream(distanceTipLerp, 'T').node;
const tipDistanceRemap = foliageView.upstream(tipDistanceSaturate, 'In').node;
const tipDistanceRange = foliageView.slot(tipDistanceRemap, 'In Min Max').m_Value;
assert.deepEqual(
  [tipDistanceRange.x, tipDistanceRange.y],
  [...SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.tipDistanceRange],
);
const gradientSample = foliageView.upstream(distanceTipLerp, 'A').node;
assert.equal(gradientSample.m_Type, 'UnityEditor.ShaderGraph.SampleGradient');
assert.equal(gradientSample.m_SGVersion, 1);

// Exact four-key linear gradient and UInt16 positions.
const gradientSlot = foliageView.objects.find((object) => (
  object.m_Type === 'UnityEditor.ShaderGraph.GradientInputMaterialSlot'
));
assert.equal(gradientSlot.m_Value.m_Mode, 0);
assert.equal(gradientSlot.m_Value.m_NumColorKeys, 4);
for (let index = 0; index < 4; index += 1) {
  const sourceKey = gradientSlot.m_Value[`key${index}`];
  const runtimeKey = SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.gradient[index];
  assert.deepEqual(runtimeKey.color, [sourceKey.r, sourceKey.g, sourceKey.b]);
  assert.ok(close(runtimeKey.position, gradientSlot.m_Value[`ctime${index}`] / 65535));
  assert.deepEqual(
    sampleSoStylizedUnitySceneFoliageGradient(runtimeKey.position),
    [...runtimeKey.color],
  );
}

// Per-object normalized hue offset topology and exact RandomRange constants.
const hueOffsetAdd = foliageView.upstream(baseHue, 'Offset').node;
foliageView.assertPropertyInput(hueOffsetAdd, 'B', '_Hue_Shift');
const randomRange = foliageView.upstream(hueOffsetAdd, 'A').node;
assert.equal(randomRange.m_Type, 'UnityEditor.ShaderGraph.RandomRangeNode');
const randomMin = foliageView.upstream(randomRange, 'Min').node;
assert.equal(randomMin.m_Type, 'UnityEditor.ShaderGraph.NegateNode');
foliageView.assertPropertyInput(randomMin, 'In', '_Hue_Variation');
foliageView.assertPropertyInput(
  foliageView.upstream(randomRange, 'Max').node,
  0,
  '_Hue_Variation',
);
const seedMultiply = foliageView.upstream(randomRange, 'Seed').node;
const seedScaleNode = foliageView.upstream(seedMultiply, 'B').node;
assert.equal(seedScaleNode.m_Type, 'UnityEditor.ShaderGraph.Vector1Node');
assert.equal(
  foliageView.slot(seedScaleNode, 'X').m_Value,
  SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.hueObjectPositionScale,
);
assert.deepEqual(
  evaluateSoStylizedUnitySceneFoliageSourceWorldXZ([4, 5, -6]),
  [4, 6],
  'The reflected Three Z coordinate must be restored before Unity world-XZ seeds.',
);
const runtimeModuleSource = readFileSync(RUNTIME_MODULE_PATH, 'utf8');
assert.match(
  runtimeModuleSource,
  /float\(fragmentWorldPosition\.z\)\.negate\(\)/,
  'World-position tip noise no longer evaluates in the supplied Unity XZ basis.',
);
assert.match(
  runtimeModuleSource,
  /float\(objectWorldPosition\.z\)\.negate\(\)/,
  'Per-object hue randomness no longer evaluates in the supplied Unity XZ basis.',
);

// Alpha topology: texture A (or scalar one) * camera dither * distance fade.
const alphaOuterMultiply = foliageView.upstream(
  foliageView.block('SurfaceDescription.Alpha'),
  'Alpha',
).node;
const alphaInnerMultiply = foliageView.upstream(alphaOuterMultiply, 'A').node;
const alphaTextureBranch = foliageView.upstream(alphaInnerMultiply, 'A').node;
foliageView.assertPropertyInput(alphaTextureBranch, 'Predicate', '_Use_Texture');
const alphaSample = foliageView.upstream(alphaTextureBranch, 'True');
assert.equal(alphaSample.node.m_Type, 'UnityEditor.ShaderGraph.SampleTexture2DNode');
assert.equal(alphaSample.outputSlot.m_DisplayName, 'A');
assert.equal(foliageView.slot(alphaTextureBranch, 'False').m_Value.x, 1);
const cameraSubgraph = foliageView.upstream(alphaInnerMultiply, 'B').node;
const distanceSubgraph = foliageView.upstream(alphaOuterMultiply, 'B').node;
assert.equal(foliageView.subgraphGuid(cameraSubgraph), '0a5473d7af329294c8f319a1acc7f8cb');
assert.equal(foliageView.subgraphGuid(distanceSubgraph), '8f4b0a13d44fb4548b3906495d959134');
foliageView.assertPropertyInput(cameraSubgraph, 'UseObjectPostition?', '_ObjectDistanceForFade');
foliageView.assertPropertyInput(cameraSubgraph, 'Min Distance', '_Min_Distance_Fade');
foliageView.assertPropertyInput(cameraSubgraph, 'Max Distance', '_Max_Distance_Fade');
foliageView.assertPropertyInput(distanceSubgraph, 'Min Distance', '_Start_Fade_Distance');
foliageView.assertPropertyInput(distanceSubgraph, 'Max Distance', '_End_Fade_Distance');

// Specular, smoothness, emission and alpha-cut block connections.
foliageView.assertPropertyInput(
  foliageView.block('SurfaceDescription.Specular'),
  'Specular Color',
  '_Specular_Color',
);
foliageView.assertPropertyInput(
  foliageView.block('SurfaceDescription.Smoothness'),
  'Smoothness',
  '_Smoothness',
);
foliageView.assertPropertyInput(
  foliageView.block('SurfaceDescription.AlphaClipThreshold'),
  'Alpha Clip Threshold',
  '_Alpha_Clip_Threshold',
);
const emissionMultiply = foliageView.upstream(
  foliageView.block('SurfaceDescription.Emission'),
  'Emission',
).node;
foliageView.assertPropertyInput(emissionMultiply, 'B', '_Emissive_Strength');

// Vertex graph: distance-fade WPO gate, _LOD wind bypass, optional wind, then
// world-space vertical lift weighted by COLOR.rgb.
const vertexBranch = foliageView.upstream(
  foliageView.block('VertexDescription.Position'),
  'Position',
).node;
assert.equal(vertexBranch.m_Type, 'UnityEditor.ShaderGraph.BranchNode');
const vertexFade = foliageView.upstream(vertexBranch, 'Predicate');
assert.equal(vertexFade.outputSlot.m_DisplayName, 'Is_Faded_Out');
assert.equal(foliageView.subgraphGuid(vertexFade.node), '8f4b0a13d44fb4548b3906495d959134');
const worldToObject = foliageView.upstream(vertexBranch, 'False').node;
assert.deepEqual(worldToObject.m_Conversion, { from: 2, to: 0 });
const liftedAdd = foliageView.upstream(worldToObject, 'In').node;
const objectToWorld = foliageView.upstream(liftedAdd, 'A').node;
assert.deepEqual(objectToWorld.m_Conversion, { from: 0, to: 2 });
const lodBranch = foliageView.upstream(objectToWorld, 'In').node;
foliageView.assertPropertyInput(lodBranch, 'Predicate', '_LOD');
const windBranch = foliageView.upstream(lodBranch, 'False').node;
foliageView.assertPropertyInput(windBranch, 'Predicate', '_UseWind');
const windClosure = new Set();
const pending = [foliageView.upstream(windBranch, 'True').node];
while (pending.length) {
  const node = pending.pop();
  if (windClosure.has(node.m_ObjectId)) continue;
  windClosure.add(node.m_ObjectId);
  for (const reference of node.m_Slots ?? []) {
    const input = foliageView.byId.get(reference.m_Id);
    const output = foliageView.incoming.get(node.m_ObjectId)?.get(input?.m_Id);
    if (output) pending.push(foliageView.byId.get(output.m_Node.m_Id));
  }
}
const windProperties = new Set([...windClosure]
  .map((id) => foliageView.propertyNodeReference(foliageView.byId.get(id)))
  .filter(Boolean));
for (const name of ['_WindSpeed', '_WindIntensity', '_WindWeight']) {
  assert.ok(windProperties.has(name), `${name} left the connected wind topology.`);
}
const windVector = [...windClosure]
  .map((id) => foliageView.byId.get(id))
  .find((node) => node.m_Type === 'UnityEditor.ShaderGraph.Vector3Node');
assert.deepEqual([
  foliageView.slot(windVector, 'X').m_Value,
  foliageView.slot(windVector, 'Y').m_Value,
  foliageView.slot(windVector, 'Z').m_Value,
], [...SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.windDirection]);
assert.deepEqual(
  reflectSoStylizedUnitySceneFoliageObjectVector(
    SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.windDirection,
  ),
  SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.runtimeWindDirection,
  'The source +Z wind component must follow the exported object-space Z reflection.',
);
assert.match(
  runtimeModuleSource,
  /runtimeWindDirection[\s\S]*vec3\([\s\S]*\.\.\.SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH\.runtimeWindDirection/,
  'Runtime foliage WPO no longer consumes the reflected source wind vector.',
);
const liftMultiply = foliageView.upstream(liftedAdd, 'B').node;
const liftVector = foliageView.upstream(liftMultiply, 'A').node;
foliageView.assertPropertyInput(liftVector, 'Y', '_Additional_Z_Offset');
assert.equal(foliageView.slot(liftVector, 'X').m_Value, 0);
assert.equal(foliageView.slot(liftVector, 'Z').m_Value, 0);

function verifyDitherChain(view, outputName, outRange) {
  const output = view.nodeByType('SubGraphOutputNode');
  const dither = view.upstream(output, outputName).node;
  assert.equal(dither.m_Type, 'UnityEditor.ShaderGraph.DitherNode');
  const multiply = view.upstream(dither, 'In').node;
  assert.equal(view.slot(multiply, 'B').m_Value.e00, 2);
  const saturate = view.upstream(multiply, 'A').node;
  const remap = view.upstream(saturate, 'In').node;
  const range = view.slot(remap, 'Out Min Max').m_Value;
  assert.deepEqual([range.x, range.y], outRange);
  return { output, remap, saturate };
}

const distanceChain = verifyDitherChain(distanceView, 'Out_Vector4', [1, 0]);
const fadedComparison = distanceView.upstream(
  distanceChain.output,
  'Is_Faded_Out',
).node;
assert.equal(fadedComparison.m_ComparisonType, 2, 'Fade gate must compare visibility < threshold.');
assert.ok(close(
  distanceView.slot(fadedComparison, 'B').m_Value,
  SO_STYLIZED_UNITY_SCENE_FOLIAGE_GRAPH.distanceFadeOutThreshold,
));
const cameraChain = verifyDitherChain(cameraView, 'Out_Vector4', [0, 1]);
const cameraDistance = cameraView.upstream(cameraChain.remap, 'In').node;
const cameraTargetBranch = cameraView.upstream(cameraDistance, 'B').node;
cameraView.assertPropertyInput(cameraTargetBranch, 'Predicate', '_UseObjectPostition');
assert.equal(cameraView.upstream(cameraTargetBranch, 'True').node.m_Type, 'UnityEditor.ShaderGraph.ObjectNode');
const fragmentPosition = cameraView.upstream(cameraTargetBranch, 'False').node;
assert.equal(fragmentPosition.m_Type, 'UnityEditor.ShaderGraph.PositionNode');
assert.equal(fragmentPosition.m_Space, 2);

// Verify the exact generated built-in node functions when the supplied Unity
// project's PackageCache is present. These are the HLSL authorities used by
// Unity to compile the graph, not hand-written interpretations.
const packageCache = resolve(UNITY_PROJECT, 'Library', 'PackageCache');
if (existsSync(packageCache)) {
  const shaderGraphPackageName = readdirSync(packageCache)
    .find((name) => name.startsWith('com.unity.shadergraph@'));
  assert.ok(shaderGraphPackageName, 'Unity Shader Graph PackageCache is missing.');
  const shaderGraphPackage = resolve(packageCache, shaderGraphPackageName);
  const builtins = {
    dither: resolve(shaderGraphPackage, 'Editor/Data/Nodes/Artistic/Filter/DitherNode.cs'),
    hue: resolve(shaderGraphPackage, 'Editor/Data/Nodes/Artistic/Adjustment/HueNode.cs'),
    random: resolve(shaderGraphPackage, 'Editor/Data/Nodes/Math/Range/RandomRangeNode.cs'),
    noise: resolve(shaderGraphPackage, 'Editor/Data/Nodes/Procedural/Noise/GradientNoiseNode.cs'),
  };
  const ditherCode = readFileSync(builtins.dither, 'utf8');
  const hueCode = readFileSync(builtins.hue, 'utf8');
  const randomCode = readFileSync(builtins.random, 'utf8');
  const noiseCode = readFileSync(builtins.noise, 'utf8');
  assert.match(ditherCode, /Out = In - DITHER_THRESHOLDS\[index\]/);
  assert.match(ditherCode, /1\.0 \/ 17\.0[\s\S]*16\.0 \/ 17\.0/);
  assert.match(hueCode, /Unity_Hue_Normalized/);
  assert.match(hueCode, /RGB to HSV[\s\S]*HSV to RGB/);
  assert.match(randomCode, /12\.9898, 78\.233/);
  assert.match(randomCode, /43758\.5453/);
  assert.match(noiseCode, /fp = fp \* fp \* fp \* \(fp \* \(fp \* 6 - 15\) \+ 10\)/);
  assert.match(noiseCode, /\+ 0\.5/);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const foliageRecords = manifest.materials.filter((record) => (
  record.shaderName === SO_STYLIZED_UNITY_SCENE_FOLIAGE_SHADER
));
const expectedNames = [
  'MV_LilyPads',
  'MV_FlowerBushFlowers',
  'MV_Grass',
  'MV_Grass_LOD',
  'MV_IvyCoastal',
  'MV_IvyCoastalVines',
  'MV_BushChina',
  'MV_Daisy',
  'MV_Daffodils',
  'MV_GrassSnow',
  'MV_FlowersIce',
  'MV_Weed',
  'MV_BushLeafyLeaves',
  'MV_BushLeafyLeaves_Desert',
  'MV_BushTropical',
  'MV_ElephantEars',
  'MV_Ferns',
  'MV_FernsYellow',
  'MV_Foxtails',
  'MV_RedFerns',
  'MV_Rice',
  'MV_Sunflower',
  'MV_FlowerCrocus',
];
assert.equal(foliageRecords.length, 23);
assert.deepEqual(foliageRecords.map((record) => record.name), expectedNames);
const foliageMaterialIndices = new Set(foliageRecords.map((record) => record.index));
const foliageRendererNodes = manifest.nodes.filter((node) => (
  node.renderer?.type
    && node.renderer.materialIndices.some((index) => foliageMaterialIndices.has(index))
));
const foliageRendererBindings = foliageRendererNodes.reduce((count, node) => (
  count + node.renderer.materialIndices.filter((index) => foliageMaterialIndices.has(index)).length
), 0);
assert.equal(foliageRendererBindings, 181);
assert.equal(foliageRendererNodes.length, 181);
assert.equal(
  foliageRendererNodes.filter((node) => node.renderer.shadowCastingMode !== 'Off').length,
  30,
);
assert.equal(
  foliageRendererNodes.filter((node) => node.renderer.shadowCastingMode === 'Off').length,
  151,
);
assert.equal(
  foliageRendererNodes.filter((node) => node.renderer.receiveShadows).length,
  181,
);
for (const node of foliageRendererNodes) {
  assert.ok(
    manifest.meshes[node.mesh]?.attributes?.includes('TANGENT'),
    `${node.hierarchyPath} has no exported tangent basis`,
  );
}
const foliageSlotsIn = (nodes) => nodes.reduce((count, node) => (
  count + (node.renderer?.materialIndices ?? [])
    .filter((index) => foliageMaterialIndices.has(index)).length
), 0);
let foliageTreeSlots = 0;
let foliageTreeInstances = 0;
for (const instance of manifest.terrains[0].treeInstances) {
  const treePrototype = manifest.terrains[0].treePrototypes[instance.prototypeIndex];
  const slots = foliageSlotsIn(manifest.prefabPrototypes[treePrototype.gltfPrefab].nodes);
  if (slots > 0) foliageTreeInstances += 1;
  foliageTreeSlots += slots;
}
assert.equal(foliageTreeSlots, 696);
assert.equal(foliageTreeInstances, 616);
assert.equal(
  manifest.terrains[0].detailPrototypes.filter((prototype) => (
    foliageSlotsIn(manifest.prefabPrototypes[prototype.gltfPrefab].nodes) > 0
  )).length,
  12,
);
const resolved = foliageRecords.map(resolveSoStylizedUnitySceneFoliageInputs);
assert.equal(resolved.filter((record) => record.useTexture).length, 20);
assert.deepEqual(
  resolved.filter((record) => !record.useTexture).map((record) => record.materialName),
  ['MV_Grass', 'MV_Grass_LOD', 'MV_GrassSnow'],
);
assert.deepEqual(
  resolved.filter((record) => record.lod).map((record) => record.materialName),
  ['MV_Grass_LOD'],
);
assert.ok(resolved.every((record) => record.foliageTextureIndex === 54));
assert.ok(resolved.every((record) => record.noiseTextureIndex === 55));
assert.ok(resolved.every((record) => record.objectDistanceForFade === false));
assert.ok(resolved.every((record) => record.useWind === true));
assert.ok(foliageRecords.every((record) => record.properties.some((property) => (
  property.name === SO_STYLIZED_UNITY_SCENE_FOLIAGE_NOISE_PROPERTY
))));
const grassInputs = resolved.find((record) => record.materialName === 'MV_Grass');
assert.deepEqual(
  linearizeSoStylizedUnityColorProperty(grassInputs.bottomColor),
  [0.10344665138224914, 0.35593595218931445, 0.05419439858456547, 0],
);
assert.deepEqual(
  linearizeSoStylizedUnityColorProperty(grassInputs.tipColor),
  [0.2370675865936442, 0.591114152448392, 0.09471969957728374, 0],
);
assert.deepEqual(
  linearizeSoStylizedUnityColorProperty(grassInputs.specularColor),
  [0.02523558179652848, 0.22436410673967846, 0.004652401232979437, 1],
);

const foliageTextureRecord = manifest.textures[54];
const noiseTextureRecord = manifest.textures[55];
assert.equal(foliageTextureRecord.name, 'T_FoliageSheet_BC');
assert.equal(foliageTextureRecord.importer.textureType, 'GUI');
assert.equal(foliageTextureRecord.importer.sRGBTexture, true);
assert.equal(foliageTextureRecord.importer.mipmapEnabled, false);
assert.equal(foliageTextureRecord.importer.wrapMode, 'Clamp');
assert.equal(foliageTextureRecord.importer.filterMode, 'Bilinear');
assert.equal(foliageTextureRecord.importer.anisoLevel, 1);
assert.equal(foliageTextureRecord.importer.alphaSource, 'FromInput');
assert.equal(foliageTextureRecord.importer.alphaIsTransparency, true);
assert.equal(noiseTextureRecord.name, 'T_NoiseRough_SplatterMap');
assert.equal(noiseTextureRecord.importer.textureType, 'Default');
assert.equal(noiseTextureRecord.importer.sRGBTexture, true);
assert.equal(noiseTextureRecord.importer.mipmapEnabled, true);
assert.equal(noiseTextureRecord.importer.wrapMode, 'Repeat');
assert.equal(noiseTextureRecord.importer.filterMode, 'Bilinear');
assert.equal(noiseTextureRecord.importer.anisoLevel, 1);

class VerificationTextureLoader {
  constructor() {
    this.urls = [];
    this.textures = [];
  }

  async loadAsync(url) {
    this.urls.push(url);
    const result = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    result.name = String(url);
    this.textures.push(result);
    return result;
  }
}

const textureLoader = new VerificationTextureLoader();
const runtimeMaterials = await Promise.all(foliageRecords.map((record, index) => (
  buildSoStylizedUnitySceneFoliageMaterial(record, manifest, {
    baseUrl: '/unity-foliage-verification',
    geometryHints: { hasVertexColors: index % 2 === 0 },
    textureLoader,
  })
)));
assert.equal(textureLoader.urls.length, 2, 'The shared atlas/noise textures must each load once.');
for (const material of runtimeMaterials) {
  const source = material.userData.soStylizedUnityMaterial;
  const sourceInputs = resolved.find((entry) => entry.materialIndex === source.materialIndex);
  assert.equal(material.type, 'MeshPhysicalNodeMaterial');
  assert.equal(material.side, THREE.DoubleSide);
  assert.equal(material.shadowSide, THREE.DoubleSide);
  assert.equal(material.forceSinglePass, true);
  assert.equal(material.depthWrite, true);
  assert.ok(material.maskNode);
  assert.ok(material.maskShadowNode);
  assert.equal(material.maskNode, material.maskShadowNode);
  assert.equal(material.alphaTestNode, null, 'Exact clip equality requires a boolean mask.');
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
  assert.ok(material.normalNode, 'Cull Off foliage must retain its unflipped geometry normal.');
  assert.equal(source.reconstruction, 'unity-s-foliage-record');
  assert.equal(source.graphExact, true);
  assert.deepEqual(source.linearColorProperties, {
    bottom: linearizeSoStylizedUnityColorProperty(sourceInputs.bottomColor),
    specular: linearizeSoStylizedUnityColorProperty(sourceInputs.specularColor),
    textureTint: linearizeSoStylizedUnityColorProperty(sourceInputs.textureTint),
    tip: linearizeSoStylizedUnityColorProperty(sourceInputs.tipColor),
  });
  assert.equal(source.contract.heightBlend, '_Height_Blend disconnected; UV0.g is the final Lerp T');
  assert.equal(material.userData.soStylizedUnityUrpLighting.workflow, 'specular');
}
const runtimeByName = new Map(runtimeMaterials.map((material) => [
  material.userData.soStylizedUnityMaterial.sourceMaterial,
  material,
]));
assert.equal(
  runtimeByName.get('MV_Grass_LOD')
    .userData.soStylizedUnityMaterial.switches.lodWindBypass,
  true,
);
assert.equal(
  runtimeByName.get('MV_GrassSnow')
    .userData.soStylizedUnityMaterial.textures.noise,
  null,
);
assert.equal(
  runtimeByName.get('MV_LilyPads')
    .userData.soStylizedUnityMaterial.textures.foliage.importer.mipmapEnabled,
  false,
);

const atlas = textureLoader.textures.find((entry) => entry.name.includes('T_FoliageSheet_BC'));
const noise = textureLoader.textures.find((entry) => entry.name.includes('T_NoiseRough_SplatterMap'));
assert.ok(atlas && noise);
assert.equal(atlas.colorSpace, THREE.SRGBColorSpace);
assert.equal(atlas.wrapS, THREE.ClampToEdgeWrapping);
assert.equal(atlas.wrapT, THREE.ClampToEdgeWrapping);
assert.equal(atlas.magFilter, THREE.LinearFilter);
assert.equal(atlas.minFilter, THREE.LinearFilter);
assert.equal(atlas.generateMipmaps, false);
assert.equal(atlas.anisotropy, 1);
assert.equal(noise.colorSpace, THREE.SRGBColorSpace);
assert.equal(noise.wrapS, THREE.RepeatWrapping);
assert.equal(noise.wrapT, THREE.RepeatWrapping);
assert.equal(noise.magFilter, THREE.LinearFilter);
assert.equal(noise.minFilter, THREE.LinearMipmapNearestFilter);
assert.equal(noise.generateMipmaps, true);
assert.equal(noise.anisotropy, 1);

// Exercise the object-distance branch even though all 23 Mega records choose
// fragment distance; this guards the generic builder contract used by future
// manifests without inventing a material-name heuristic.
const objectDistanceRecord = structuredClone(foliageRecords.find((record) => (
  record.name === 'MV_Weed'
)));
objectDistanceRecord.name = 'MV_Weed_ObjectDistanceVerifier';
objectDistanceRecord.properties.find((property) => (
  property.name === '_ObjectDistanceForFade'
)).value[0] = 1;
const objectDistanceMaterial = await buildSoStylizedUnitySceneFoliageMaterial(
  objectDistanceRecord,
  manifest,
  {
    baseUrl: '/unity-foliage-verification',
    geometryHints: { objectPositionNode: vec3Verifier() },
    textureLoader,
  },
);
assert.equal(
  objectDistanceMaterial.userData.soStylizedUnityMaterial.switches.cameraDistanceSource,
  'object',
);

function vec3Verifier() {
  // A regular Vector3 is node-converted by the builder's vec2/vec3 calls and
  // keeps this verifier independent from TSL internals.
  return new THREE.Vector3(4, 5, 6);
}

console.log('So Stylized Unity scene foliage verified.');
console.log('S_FoliageShader: 23/23 Mega material records, 20 texture + 3 gradient.');
console.log('Scene bindings/nodes/cast/receive/tangent: 181/181/30/181/181 (151 cast Off).');
console.log('Population: 696 expanded tree slots / 616 tree instances / 12 terrain-detail routes.');
console.log('Colors: 4/4 connected ColorMode.Default properties decoded sRGB -> linear.');
console.log('Topology: normalized HSV, exact gradient, both dither graphs, LOD/wind/lift, direct-F0 URP specular.');
console.log('TextureImporter: exact atlas/noise color space, wrap, filtering, mipmap, alpha, and anisotropy state.');
