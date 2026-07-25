#!/usr/bin/env node

// Deterministic source-to-runtime gate for S_StylizedWater, S_WaterWaves,
// and S_Waterfall. This verifier uses only supplied source, generated shader
// text, manifests, CPU oracles, and runtime material topology—never pixels.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { normalViewGeometry } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_GRAPH,
  SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_SHADER,
  SO_STYLIZED_UNITY_SCENE_WATERFALL_GRAPH,
  SO_STYLIZED_UNITY_SCENE_WATERFALL_SHADER,
  SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES,
  SO_STYLIZED_UNITY_SCENE_WATER_WAVES_GRAPH,
  SO_STYLIZED_UNITY_SCENE_WATER_WAVES_SHADER,
  SO_STYLIZED_UNITY_STYLIZED_THRESHOLD_SOURCE,
  createSoStylizedUnitySceneWaterPassReport,
  evaluateSoStylizedUnityThreshold,
  evaluateSoStylizedUnityWaterDepthCpu,
  evaluateSoStylizedUnityWaterfallCpu,
  evaluateSoStylizedUnityWaterFlipbookCpu,
  evaluateSoStylizedUnityWaterWavesCpu,
  resolveSoStylizedUnitySceneStylizedWaterInputs,
  resolveSoStylizedUnitySceneWaterfallInputs,
  resolveSoStylizedUnitySceneWaterWavesInputs,
} from '../src/environment/soStylizedUnitySceneWaterMaterials.js';
import { buildSoStylizedUnityMegaMaterial } from '../src/environment/SoStylizedUnityMegaScene.js';
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
const GENERATED_ROOT = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/generated-shaders',
);
const GENERATED_MANIFEST_PATH = resolve(GENERATED_ROOT, 'manifest.json');
const GENERATED_CONTRACT_PATH = resolve(
  PACKAGE_ROOT,
  'docs/source-shader-audits/unity-generated-shader-contracts.json',
);
const MODULE_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/soStylizedUnitySceneWaterMaterials.js',
);
const DISPATCHER_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/SoStylizedUnityMegaScene.js',
);
const URP_BRIDGE_PATH = resolve(
  PACKAGE_ROOT,
  'src/environment/soStylizedUnityUrpLighting.js',
);
const LEDGER_PATH = resolve(PACKAGE_ROOT, 'docs/unity-shader-port-ledger.json');

const SOURCES = Object.freeze([
  Object.freeze({
    graph: SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_GRAPH,
    graphPath: resolve(UNITY_ROOT, 'Environment/Water/Shaders/S_StylizedWater.shadergraph'),
    materialIndex: 1,
    materialPath: resolve(UNITY_ROOT, 'Environment/Water/Materials/M_StylizedWater.mat'),
    renderFace: 2,
    alphaClip: false,
    receiveShadows: false,
  }),
  Object.freeze({
    graph: SO_STYLIZED_UNITY_SCENE_WATER_WAVES_GRAPH,
    graphPath: resolve(UNITY_ROOT, 'Environment/Water/Shaders/S_WaterWaves.shadergraph'),
    materialIndex: 13,
    materialPath: resolve(UNITY_ROOT, 'Environment/Water/Materials/M_WaterWaves.mat'),
    renderFace: 0,
    alphaClip: true,
    receiveShadows: true,
  }),
  Object.freeze({
    graph: SO_STYLIZED_UNITY_SCENE_WATERFALL_GRAPH,
    graphPath: resolve(UNITY_ROOT, 'Environment/Water/Shaders/S_Waterfall.shadergraph'),
    materialIndex: 12,
    materialPath: resolve(UNITY_ROOT, 'Environment/Water/Materials/M_Waterfall.mat'),
    renderFace: 0,
    alphaClip: false,
    receiveShadows: true,
  }),
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const shortType = (value) => String(value?.m_Type ?? '').split('.').at(-1);
const close = (actual, expected, tolerance = 1e-12, label = 'value') => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${label}: expected ${expected}, received ${actual}`,
);
const closeArray = (actual, expected, tolerance = 1e-12, label = 'value') => {
  assert.equal(actual.length, expected.length, `${label} channel count`);
  actual.forEach((channel, index) => close(
    channel,
    expected[index],
    tolerance,
    `${label}[${index}]`,
  ));
};

const DEFAULT_COLOR_PROPERTIES = Object.freeze({
  [SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_SHADER]: Object.freeze([
    '_Shoreline_Foam_Color',
    '_Specular_Color',
    '_Specular_Color_Far',
  ]),
  [SO_STYLIZED_UNITY_SCENE_WATER_WAVES_SHADER]: Object.freeze([
    '_Foam_Color',
  ]),
  [SO_STYLIZED_UNITY_SCENE_WATERFALL_SHADER]: Object.freeze([
    '_Bottom_Color',
    '_Foam_Color',
    '_Top_Color',
  ]),
});

function parseGraph(path) {
  const bytes = readFileSync(path);
  return {
    bytes,
    documents: bytes.toString('utf8').trim().split(/\n\n(?=\{)/).map(JSON.parse),
  };
}

function assertConnectedDefaultColors(parsed, shaderName) {
  const graph = parsed.documents.find((entry) => shortType(entry) === 'GraphData');
  assert.ok(graph, `${shaderName} GraphData`);
  const properties = parsed.documents.filter(
    (entry) => shortType(entry) === 'ColorShaderProperty',
  );
  assert.deepEqual(
    properties.map(({ m_DefaultReferenceName: name }) => name).sort(),
    [...DEFAULT_COLOR_PROPERTIES[shaderName]].sort(),
    `${shaderName} ColorShaderProperty inventory`,
  );
  for (const property of properties) {
    assert.equal(
      property.m_ColorMode,
      0,
      `${shaderName} ${property.m_DefaultReferenceName} ColorMode.Default`,
    );
    const propertyNodes = parsed.documents.filter((entry) => (
      shortType(entry) === 'PropertyNode'
      && entry.m_Property?.m_Id === property.m_ObjectId
    ));
    assert.ok(propertyNodes.length > 0, `${shaderName} ${property.m_DefaultReferenceName} node`);
    assert.ok(
      propertyNodes.some((node) => graph.m_Edges.some(
        (edge) => edge.m_OutputSlot.m_Node.m_Id === node.m_ObjectId,
      )),
      `${shaderName} ${property.m_DefaultReferenceName} must remain connected`,
    );
  }
}

const sceneManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const generatedManifest = JSON.parse(readFileSync(GENERATED_MANIFEST_PATH, 'utf8'));
const generatedContracts = JSON.parse(readFileSync(GENERATED_CONTRACT_PATH, 'utf8'));

for (const source of SOURCES) {
  assert.ok(existsSync(source.graphPath), `missing graph ${source.graphPath}`);
  assert.ok(existsSync(source.materialPath), `missing material ${source.materialPath}`);
  assert.equal(sha256(readFileSync(source.graphPath)), source.graph.sourceGraphSha256);
  assert.equal(sha256(readFileSync(source.materialPath)), source.graph.sourceMaterialSha256);

  const parsed = parseGraph(source.graphPath);
  assertConnectedDefaultColors(parsed, source.graph.shader);
  const target = parsed.documents.find((entry) => shortType(entry) === 'UniversalTarget');
  const lit = parsed.documents.find((entry) => shortType(entry) === 'UniversalLitSubTarget');
  assert.ok(target, `${source.graph.shader} UniversalTarget`);
  assert.ok(lit, `${source.graph.shader} UniversalLitSubTarget`);
  assert.equal(target.m_SurfaceType, 1, 'transparent surface');
  assert.equal(target.m_AlphaMode, 0, 'alpha blend mode');
  assert.equal(target.m_ZTestMode, 4, 'LessEqual ZTest');
  assert.equal(target.m_ZWriteControl, 0, 'Auto ZWrite => Off for transparent');
  assert.equal(target.m_RenderFace, source.renderFace, 'render face');
  assert.equal(target.m_AlphaClip, source.alphaClip, 'alpha clip');
  assert.equal(target.m_CastShadows, false, 'cast shadows');
  assert.equal(target.m_ReceiveShadows, source.receiveShadows, 'receive shadows');
  assert.equal(lit.m_WorkflowMode, 0, 'specular workflow');
  assert.equal(lit.m_BlendModePreserveSpecular, true, 'preserve specular');
  assert.equal(
    parsed.documents.some((entry) => shortType(entry) === 'SceneColorNode'),
    false,
    `${source.graph.shader} must not gain Scene Color/refraction`,
  );
  assert.equal(
    parsed.documents.filter((entry) => shortType(entry) === 'SceneDepthNode').length,
    source.graph.shader === SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_SHADER ? 1 : 0,
    `${source.graph.shader} scene-depth node count`,
  );

  const generated = generatedManifest.shaders.find(
    (entry) => entry.shaderName === source.graph.shader,
  );
  assert.ok(generated, `${source.graph.shader} generated manifest record`);
  assert.equal(generated.assetGuid, source.graph.sourceGraphGuid);
  assert.equal(generated.graphSha256, source.graph.sourceGraphSha256);
  assert.deepEqual(
    generated.passes.map((entry) => entry.name),
    [...source.graph.activePasses],
  );
  assert.equal(generated.passes.some(
    (entry) => entry.name === 'DepthOnly' || entry.name === 'ShadowCaster'
  ), false, `${source.graph.shader} forbidden depth/shadow pass`);
  const forward = generated.passes[0];
  assert.equal(forward.file, source.graph.generatedForwardPass);
  assert.equal(forward.sha256, source.graph.generatedForwardPassSha256);
  const forwardBytes = readFileSync(resolve(GENERATED_ROOT, forward.file));
  assert.equal(sha256(forwardBytes), source.graph.generatedForwardPassSha256);
  const forwardSource = forwardBytes.toString('utf8');
  assert.match(forwardSource, /#define _ALPHAPREMULTIPLY_ON 1/);
  assert.match(forwardSource, /#define VARYINGS_NEED_FOG_AND_VERTEX_LIGHT/);
  assert.match(forwardSource, /description\.Position = IN\.ObjectSpacePosition/);
  assert.match(forwardSource, /description\.Normal = IN\.ObjectSpaceNormal/);
  assert.match(forwardSource, /description\.Tangent = IN\.ObjectSpaceTangent/);
  if (source.alphaClip) {
    assert.match(forwardSource, /surface\.AlphaClipThreshold = float\(0\.01\)/);
    assert.match(forwardSource, /#define _ALPHATEST_ON 1/);
  } else {
    assert.doesNotMatch(forwardSource, /surface\.AlphaClipThreshold/);
  }
  if (source.renderFace === 0) {
    assert.doesNotMatch(
      forwardSource,
      /^#define VARYINGS_NEED_CULLFACE$/m,
      `${source.graph.shader} must keep generated back-face normals unflipped`,
    );
  }
  if (source.graph.shader === SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_SHADER) {
    assert.match(forwardSource, /#define REQUIRE_DEPTH_TEXTURE/);
    assert.match(forwardSource, /#define _RECEIVE_SHADOWS_OFF 1/);
    assert.match(forwardSource, /Unity_SceneDepth_Linear01_float/);
    assert.doesNotMatch(forwardSource, /SceneColor|OpaqueTexture/);
  }

  const audit = generatedContracts.shaders.find(
    (entry) => entry.shaderName === source.graph.shader,
  );
  assert.ok(audit, `${source.graph.shader} generated contract record`);
  assert.equal(
    audit.authorityPass.fullSourceSha256,
    source.graph.generatedForwardFullSourceSha256,
  );
  assert.equal(
    audit.authorityPass.graphRegionSha256,
    source.graph.generatedGraphRegionSha256,
  );
  assert.equal(
    audit.authorityPass.graphFunctionsSha256,
    source.graph.generatedFunctionsSha256,
  );
  assert.deepEqual(audit.outputs.vertex, {
    Position: 'IN.ObjectSpacePosition',
    Normal: 'IN.ObjectSpaceNormal',
    Tangent: 'IN.ObjectSpaceTangent',
  });
}

const thresholdPath = resolve(
  UNITY_ROOT,
  'Materials/Shaders/SG_StylizedThreshold.shadersubgraph',
);
assert.equal(
  sha256(readFileSync(thresholdPath)),
  SO_STYLIZED_UNITY_STYLIZED_THRESHOLD_SOURCE.graphSha256,
);
close(evaluateSoStylizedUnityThreshold(0.2, {
  enabled: true,
  gradientMin: 0.82,
  threshold: 0.43,
}), 0, 0, 'threshold below');
close(evaluateSoStylizedUnityThreshold(0.43, {
  enabled: true,
  gradientMin: 0.82,
  threshold: 0.43,
}), 0.82, 1e-15, 'threshold edge');
close(evaluateSoStylizedUnityThreshold(0.715, {
  enabled: true,
  gradientMin: 0.82,
  threshold: 0.43,
}), 0.91, 1e-12, 'threshold remap');
close(evaluateSoStylizedUnityThreshold(1.3, { enabled: false }), 1.3, 0);

const stylizedValues = resolveSoStylizedUnitySceneStylizedWaterInputs(sceneManifest.materials[1]);
const waterfallValues = resolveSoStylizedUnitySceneWaterfallInputs(sceneManifest.materials[12]);
const wavesValues = resolveSoStylizedUnitySceneWaterWavesInputs(sceneManifest.materials[13]);
assert.equal(stylizedValues.materialName, 'M_StylizedWater');
assert.equal(stylizedValues.renderQueue, 3000);
assert.equal(stylizedValues.normalTextureIndex, 8);
assert.equal(stylizedValues.shorelineNoiseTextureIndex, 9);
assert.equal(stylizedValues.causticATextureIndex, 10);
assert.equal(stylizedValues.reflectionTextureIndex, 11);
assert.equal(stylizedValues.causticDistortionTextureIndex, -1);
close(stylizedValues.waterColorFresnelMultiplier, 1.7899999618530273, 0);
close(stylizedValues.shorelineFadeDepth, 2.7100000381469727, 0);
assert.equal(waterfallValues.materialName, 'M_Waterfall');
assert.equal(waterfallValues.renderQueue, 3002);
assert.equal(waterfallValues.distortionTextureIndex, 9);
assert.equal(waterfallValues.waterlinesTextureIndex, 25);
assert.equal(waterfallValues.roughATextureIndex, 26);
assert.equal(waterfallValues.edgeBaseTextureIndex, 27);
assert.equal(wavesValues.materialName, 'M_WaterWaves');
assert.equal(wavesValues.renderQueue, 3001);
assert.equal(wavesValues.maskTextureIndex, 28);
close(wavesValues.opacity, 0.4000000059604645, 0);

const expectedLinearColors = Object.freeze({
  stylized: Object.freeze({
    shorelineFoamColor: Object.freeze([
      0.7068447044433219,
      0.7068447044433219,
      0.7068447044433219,
      1,
    ]),
    specularColor: Object.freeze([
      0.0014603645439856562,
      0.0014603645439856562,
      0.0014603645439856562,
      1,
    ]),
    specularColorFar: Object.freeze([0, 0, 0, 0]),
  }),
  waterfall: Object.freeze({
    bottomColor: Object.freeze([
      0.08865557541801715,
      0.6270380186347243,
      0.6444797004895428,
      0,
    ]),
    foamColor: Object.freeze([
      0.43316721311490364,
      0.8387990208591566,
      0.7606730484858865,
      0,
    ]),
    topColor: Object.freeze([
      0,
      0.038325164687929986,
      0.48144335416771145,
      0,
    ]),
  }),
  waves: Object.freeze({
    foamColor: Object.freeze([
      0.4919050695416529,
      0.8786038684959073,
      1,
      1,
    ]),
  }),
});
for (const [property, expected] of Object.entries(expectedLinearColors.stylized)) {
  closeArray(
    linearizeSoStylizedUnityColorProperty(stylizedValues[property]),
    expected,
    1e-12,
    `M_StylizedWater ${property}`,
  );
}
closeArray(
  linearizeSoStylizedUnityColorProperty(wavesValues.foamColor),
  expectedLinearColors.waves.foamColor,
  1e-12,
  'M_WaterWaves foamColor',
);
for (const [property, expected] of Object.entries(expectedLinearColors.waterfall)) {
  closeArray(
    linearizeSoStylizedUnityColorProperty(waterfallValues[property]),
    expected,
    1e-12,
    `M_Waterfall ${property}`,
  );
}

for (const textureIndex of [8, 9, 10, 11, 25, 26, 27, 28]) {
  const record = sceneManifest.textures[textureIndex];
  assert.ok(record.exactSourceCopy, `texture ${textureIndex} exact copy`);
  assert.ok(existsSync(resolve(
    PACKAGE_ROOT,
    'assets-local/sostylized-unity/mega-scene',
    record.exactSourceCopy,
  )), `texture ${textureIndex} source bytes`);
  assert.equal(record.importer.present, true, `texture ${textureIndex} importer`);
  assert.equal(record.importer.wrapMode, 'Repeat');
  assert.equal(record.importer.filterMode, 'Bilinear');
  assert.equal(record.importer.mipmapEnabled, true);
}
assert.equal(sceneManifest.textures[8].importer.textureType, 'NormalMap');
assert.equal(sceneManifest.textures[8].importer.sRGBTexture, false);
assert.equal(sceneManifest.textures[11].dimension, 'Cube');
assert.equal(sceneManifest.textures[11].importer.textureShape, 'TextureCube');
assert.match(sceneManifest.textures[11].exactSourceCopy, /\.exr$/i);

const waterfallRenderer = sceneManifest.nodes[126].renderer;
assert.deepEqual(waterfallRenderer.materialIndices, [12, 13]);
assert.deepEqual(waterfallRenderer.boundsSize, [
  12.045492172241211,
  39.56746292114258,
  12.412697792053223,
]);
const waterfallMesh = sceneManifest.meshes[28];
for (const attribute of ['POSITION', 'NORMAL', 'TANGENT', 'COLOR_0', 'TEXCOORD_0']) {
  assert.ok(waterfallMesh.attributes.includes(attribute), `waterfall mesh ${attribute}`);
}

const wavesCpu = evaluateSoStylizedUnityWaterWavesCpu({
  mask: 0.8,
  roughA: 0.3,
  roughB: 0.4,
}, wavesValues);
const wavesThreshold = wavesValues.styleThresholdGradientMin
  + ((0.56 - wavesValues.styleThreshold)
    * (1 - wavesValues.styleThresholdGradientMin))
    / (1 - wavesValues.styleThreshold);
close(wavesCpu.threshold, wavesThreshold, 1e-12, 'waves threshold');
close(wavesCpu.alpha, wavesThreshold * wavesValues.opacity, 1e-12, 'waves alpha');
close(
  wavesCpu.smoothness,
  wavesValues.smoothness * wavesThreshold * wavesValues.opacity,
  1e-12,
  'waves smoothness',
);

const waterfallCpu = evaluateSoStylizedUnityWaterfallCpu({
  detailRough: 0.5,
  edgeBase: 0.5,
  edgeEmission: 0.25,
  mainRoughA: 0.5,
  mainRoughB: 0.4,
  uvY: 0.25,
  vertexRed: 0.8,
  waterline: 0.2,
}, waterfallValues);
assert.ok(waterfallCpu.foamMask > 0.6 && waterfallCpu.foamMask < 0.7);
close(
  waterfallCpu.alpha,
  ((waterfallValues.opacityTop
    + (waterfallValues.opacityBottom - waterfallValues.opacityTop) * 0.75)
    + (1 - (waterfallValues.opacityTop
      + (waterfallValues.opacityBottom - waterfallValues.opacityTop) * 0.75))
      * waterfallCpu.foamMask) * 0.8,
  1e-12,
  'waterfall alpha/vertex red',
);

const waterDepth = evaluateSoStylizedUnityWaterDepthCpu({
  distanceToCamera: 200,
  fresnel: 0,
  sceneEyeDepth: 15,
  surfaceEyeDepth: 5,
}, stylizedValues);
close(waterDepth.depthDifference, 10, 0);
close(waterDepth.depth01, 1, 0);
close(waterDepth.gradientTime, 0, 0);
close(waterDepth.shorelineFade, 1, 0);
const flipbook = evaluateSoStylizedUnityWaterFlipbookCpu([0.25, 0.5], 1, stylizedValues);
assert.deepEqual(flipbook.gradientUv, [0.0625, 0.125]);
close(flipbook.sampleUv[0], 0.500946044921875, 1e-15, 'flipbook u');
close(flipbook.sampleUv[1], 0.938446044921875, 1e-15, 'flipbook v');

const fakeTextureLoader = {
  async loadAsync() {
    return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  },
};
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0], 3));
geometry.setAttribute('tangent', new THREE.Float32BufferAttribute([1, 0, 0, 1], 4));
geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0], 2));
geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1], 4));

const runtime = new Map();
for (const materialIndex of [1, 12, 13]) {
  runtime.set(materialIndex, await buildSoStylizedUnityMegaMaterial(
    sceneManifest.materials[materialIndex],
    sceneManifest,
    {
      geometry,
      geometryHints: { rendererBoundsSize: waterfallRenderer.boundsSize },
      textureLoader: fakeTextureLoader,
    },
  ));
}
for (const [materialIndex, material] of runtime) {
  assert.equal(material.name, `Unity:${sceneManifest.materials[materialIndex].name}`);
  assert.equal(material.transparent, true);
  assert.equal(material.depthTest, true);
  assert.equal(material.depthFunc, THREE.LessEqualDepth);
  assert.equal(material.depthWrite, false);
  assert.equal(material.premultipliedAlpha, false);
  assert.equal(material.blending, THREE.CustomBlending);
  assert.equal(material.blendSrc, THREE.OneFactor);
  assert.equal(material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.blendSrcAlpha, THREE.OneFactor);
  assert.equal(material.blendDstAlpha, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.positionNode, null, 'identity vertex graph');
  assert.equal(material.userData.soStylizedUnityMaterial.graphExact, true);
  assert.equal(
    material.userData.soStylizedUnityMaterial.rendererBoundaries,
    SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES,
  );
  assert.deepEqual(material.userData.soStylizedUnityMaterial.passCoupling, {
    depthOnly: false,
    shadowCaster: false,
  });
  assert.equal(
    material.userData.soStylizedUnityUrpLighting.preserveSpecularAlpha,
    true,
  );
  assert.equal(material.userData.soStylizedUnityUrpLighting.workflow, 'specular');
}
assert.deepEqual(
  runtime.get(1).userData.soStylizedUnityMaterial.linearColorProperties,
  expectedLinearColors.stylized,
);
assert.deepEqual(
  runtime.get(13).userData.soStylizedUnityMaterial.linearColorProperties,
  expectedLinearColors.waves,
);
assert.deepEqual(
  runtime.get(12).userData.soStylizedUnityMaterial.linearColorProperties,
  expectedLinearColors.waterfall,
);
assert.equal(runtime.get(1).side, THREE.FrontSide);
assert.ok(runtime.get(1).receivedShadowNode, 'StylizedWater receive-shadows override');
assert.equal(runtime.get(1).maskNode, null);
assert.equal(runtime.get(12).side, THREE.DoubleSide);
assert.equal(runtime.get(12).forceSinglePass, true);
assert.equal(runtime.get(12).normalNode, normalViewGeometry);
assert.equal(runtime.get(12).maskNode, null);
assert.equal(runtime.get(12).userData.soStylizedUnityMaterial.rendererBoundsSize[1], 39.56746292114258);
assert.equal(runtime.get(13).side, THREE.DoubleSide);
assert.equal(runtime.get(13).forceSinglePass, true);
assert.equal(runtime.get(13).normalNode, normalViewGeometry);
assert.ok(runtime.get(13).maskNode, 'WaterWaves exact 0.01 alpha mask');
assert.equal(runtime.get(13).maskShadowNode, null, 'no invented shadow mask pass');

const passReport = createSoStylizedUnitySceneWaterPassReport(sceneManifest);
assert.deepEqual(passReport.map((entry) => entry.materialIndex), [1, 13, 12]);
assert.deepEqual(passReport.map((entry) => entry.renderQueue), [3000, 3001, 3002]);
assert.deepEqual(passReport.map((entry) => entry.sceneDepth), [true, false, false]);
assert.ok(passReport.every((entry) => (
  entry.depthOnly === false
  && entry.shadowCaster === false
  && entry.vertexDeformation === false
  && entry.sceneColor === false
)));

const moduleSource = readFileSync(MODULE_PATH, 'utf8');
const dispatcherSource = readFileSync(DISPATCHER_PATH, 'utf8');
const urpBridgeSource = readFileSync(URP_BRIDGE_PATH, 'utf8');
assert.doesNotMatch(
  moduleSource,
  /from ['"]three\/src\/nodes\//,
  'water nodes must use the renderer-owned public Three exports so TSL stack state is singular',
);
assert.match(moduleSource, /CubeMapNode,[\s\S]*?ViewportDepthTextureNode,[\s\S]*?from 'three\/webgpu'/);
assert.match(moduleSource, /new CubeMapNode\(texture\(maps\.reflection\)\)\.context\(/);
assert.match(
  moduleSource,
  /class SoStylizedUnityViewportDepthTextureNode extends ViewportDepthTextureNode/,
);
assert.match(
  moduleSource,
  /const sourceType = sourceDepth\?\.type \?\? THREE\.UnsignedIntType/,
);
assert.match(
  moduleSource,
  /const sourceFormat = sourceDepth\?\.format \?\? THREE\.DepthFormat/,
);
assert.match(
  moduleSource,
  /if \(frame\.renderer\._currentRenderContext == null\) return/,
);
assert.match(
  moduleSource,
  /if \(renderTarget !== null && renderTarget\.depthTexture == null\) return/,
);
assert.match(
  moduleSource,
  /linearDepth\(soStylizedUnityViewportDepthTexture\(screenUV\)\)/,
);
assert.doesNotMatch(moduleSource, /viewportTexture|viewportOpaqueMipTexture/);
assert.doesNotMatch(moduleSource, /installSoStylizedUnityMaterialPassCoupling/);
assert.match(moduleSource, /blendSrc = THREE\.OneFactor/);
assert.match(moduleSource, /blendDst = THREE\.OneMinusSrcAlphaFactor/);
assert.match(urpBridgeSource, /\.mul\(diffuseAlphaNode\)/);
assert.match(urpBridgeSource, /preserveSpecularAlpha/);
assert.ok(
  dispatcherSource.indexOf('isSoStylizedUnitySceneWaterFamilyRecord(record)')
    < dispatcherSource.indexOf('return buildUnityPartialFallbackMaterial'),
  'water dispatch must precede partial fallback',
);

const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
for (const shader of [
  SO_STYLIZED_UNITY_SCENE_STYLIZED_WATER_SHADER,
  SO_STYLIZED_UNITY_SCENE_WATER_WAVES_SHADER,
  SO_STYLIZED_UNITY_SCENE_WATERFALL_SHADER,
]) {
  const entry = ledger.shaderFamilies.find((candidate) => candidate.shader === shader);
  const source = SOURCES.find((candidate) => candidate.graph.shader === shader);
  assert.equal(entry?.runtimePort, 'complete', `${shader} ledger status`);
  assert.equal(entry?.runtimeModule, 'src/environment/soStylizedUnitySceneWaterMaterials.js');
  assert.equal(entry?.verification, 'scripts/verify-so-stylized-unity-scene-water-materials.mjs');
  assert.deepEqual(entry?.evidence?.activePasses, [...source.graph.activePasses]);
}

console.log(JSON.stringify({
  ok: true,
  cpuOracles: ['threshold', 'waves', 'waterfall', 'water-depth', 'flipbook'],
  materialIndices: [1, 12, 13],
  rendererGaps: [
    SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES.depthCopy,
    SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES.fog,
    SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES.sorting,
    SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES.nonForwardPasses,
  ],
  opaqueTexture: SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES.opaqueTexture,
  refraction: SO_STYLIZED_UNITY_SCENE_WATER_RENDERER_BOUNDARIES.refraction,
  sceneColorOrRefraction: false,
  sceneDepthBridge: 'S_StylizedWater only',
  shaders: passReport.map((entry) => entry.shader),
}, null, 2));
