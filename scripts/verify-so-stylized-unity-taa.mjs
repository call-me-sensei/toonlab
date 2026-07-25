#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { rtt, texture, vec4 } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
  SO_STYLIZED_UNITY_TAA_CONTRACT,
  SO_STYLIZED_UNITY_TAA_SAMPLE_OFFSETS,
  SO_STYLIZED_UNITY_TAA_SOURCE,
  SoStylizedUnityTemporalAANode,
  computeSoStylizedUnityTaaJitter,
  computeUnityUrpTaaHistoryTaps,
  evaluateUnityUrpTaaNeighborhood,
  evaluateUnityUrpTaaPerceptualBlend,
  unityUrpRgbToYCoCg,
  unityUrpYCoCgToRgb,
} from '../src/environment/soStylizedUnityRendering.js';

const close = (actual, expected, tolerance = 1e-12, label = 'value') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
};

const vectorClose = (actual, expected, tolerance = 1e-12, label = 'vector') => {
  assert.equal(actual.length, expected.length, `${label}: channel count`);
  actual.forEach((value, index) => close(
    value,
    expected[index],
    tolerance,
    `${label}[${index}]`,
  ));
};

const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const unityProject = process.env.SO_STYLIZED_UNITY_PROJECT
  ?? fileURLToPath(new URL('../../../../Setup Guide In-Editor Tutorial/', import.meta.url));
const packageCache = `${unityProject}/Library/PackageCache`;
const sourcePaths = {
  cameraPrefab: `${unityProject}/Assets/${SO_STYLIZED_UNITY_TAA_SOURCE.cameraPrefab.path}`,
  colorLibrary: `${packageCache}/${SO_STYLIZED_UNITY_TAA_SOURCE.colorLibrary.path}`,
  runtime: `${packageCache}/${SO_STYLIZED_UNITY_TAA_SOURCE.runtime.path}`,
  shader: `${packageCache}/${SO_STYLIZED_UNITY_TAA_SOURCE.shader.path}`,
  shaderLibrary: `${packageCache}/${SO_STYLIZED_UNITY_TAA_SOURCE.shaderLibrary.path}`,
};
const sources = Object.fromEntries(await Promise.all(
  Object.entries(sourcePaths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));
for (const [key, source] of Object.entries(sources)) {
  assert.equal(sha256(source), SO_STYLIZED_UNITY_TAA_SOURCE[key].sha256, `${key} hash`);
}

// Shipped spectator-camera authority: no inferred/default settings.
assert.match(sources.cameraPrefab, /m_Antialiasing: 3/);
assert.match(sources.cameraPrefab, /m_RenderPostProcessing: 1/);
assert.match(
  sources.cameraPrefab,
  /m_TaaSettings:[\s\S]*?m_Quality: 3[\s\S]*?m_FrameInfluence: 0\.1[\s\S]*?m_JitterScale: 1[\s\S]*?m_MipBias: 0[\s\S]*?m_VarianceClampScale: 0\.9[\s\S]*?m_ContrastAdaptiveSharpening: 0/,
);

// Pin the exact URP 17.5 High permutation and renderer scheduling.
assert.match(
  sources.shader,
  /Name "TemporalAA - Accumulate - Quality High"[\s\S]*?DoTemporalAA\(input, 2, 2, 2, 0\)/,
);
assert.match(sources.runtime, /\(frameIndex & 1023\) \+ 1, 2/);
assert.match(sources.runtime, /\(frameIndex & 1023\) \+ 1, 3/);
assert.match(sources.runtime, /taa\.resetHistoryFrames == 0 \? taa\.m_FrameInfluence : 1\.0f/);
assert.match(sources.runtime, /activeMotionVectors = isNewFrame \? srcMotionVectors/);
assert.match(sources.runtime, /taa\.quality == TemporalAAQuality\.VeryHigh[\s\S]*?CalculateFilterWeights/);
assert.match(sources.runtime, /srcColorTex = dstColor[\s\S]*?Resolved color is the new history/);

assert.match(sources.shaderLibrary, /AdjustBestDepthOffset\([\s\S]*?depth < bestDepth/);
assert.match(sources.shaderLibrary, /return -offsetUv;/);
assert.match(sources.shaderLibrary, /SampleBicubic5TapHalf/);
assert.match(sources.shaderLibrary, /half perSample = 1 \/ half\(9\)/);
assert.match(sources.shaderLibrary, /half devScale = _TaaVarianceClampScale/);
assert.match(sources.shaderLibrary, /boxMin = max\(boxMin, devMin\)/);
assert.match(sources.shaderLibrary, /boxMax = min\(boxMax, devMax\)/);
assert.match(sources.shaderLibrary, /clamp\(accumulation, boxMin, boxMax\)/);
assert.match(sources.shaderLibrary, /any\(abs\(uv - 0\.5 \+ velocity\) > 0\.5\)\) \? 1/);
assert.match(sources.shaderLibrary, /ApplyHistoryColorLerp\(clampedAccumulation, colorCenter, frameInfluence\)/);
assert.match(sources.shaderLibrary, /PerceptualWeight/);
assert.match(sources.colorLibrary, /#define YCOCG_CHROMA_BIAS \(128\.0 \/ 255\.0\)/);
assert.match(sources.colorLibrary, /YCoCg\.x = dot\(rgb, real3\(0\.25, 0\.5, 0\.25\)\)/);

const contract = SO_STYLIZED_UNITY_TAA_CONTRACT;
assert.equal(contract.quality, 3);
assert.equal(contract.qualityName, 'High');
assert.equal(contract.clampQuality, 2);
assert.equal(contract.motionQuality, 2);
assert.equal(contract.historyQuality, 2);
assert.equal(contract.centralFiltering, 0);
assert.equal(contract.depthHistory, false);
assert.equal(contract.frameInfluence, 0.1);
assert.equal(contract.varianceClampScale, 0.9);
assert.equal(contract.sequenceLength, 1024);
assert.equal(SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.taa.frameInfluence, 0.1);
assert.equal(SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.taa.varianceClampScale, 0.9);
assert.equal(SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.taa.sequenceLength, 1024);
assert.deepEqual(SO_STYLIZED_UNITY_TAA_SAMPLE_OFFSETS, [
  [0, 0], [0, 1], [1, 0], [-1, 0], [0, -1],
  [-1, 1], [1, -1], [1, 1], [-1, -1],
]);

vectorClose(computeSoStylizedUnityTaaJitter(0), [0, -1 / 6], 1e-12, 'jitter 0');
vectorClose(computeSoStylizedUnityTaaJitter(1), [-0.25, 1 / 6], 1e-12, 'jitter 1');
assert.deepEqual(
  computeSoStylizedUnityTaaJitter(1024),
  computeSoStylizedUnityTaaJitter(0),
);

const rgb = [0.2, 0.4, 0.8];
vectorClose(
  unityUrpRgbToYCoCg(rgb),
  [0.45, 0.20196078431372544, 0.4519607843137255],
  1e-15,
  'biased YCoCg',
);
vectorClose(unityUrpYCoCgToRgb(unityUrpRgbToYCoCg(rgb)), rgb, 1e-15, 'YCoCg inverse');

const samples = [
  [0.2, 0.3, 0.4], [0.3, 0.2, 0.5], [0.4, 0.6, 0.2],
  [0.8, 0.1, 0.2], [0.5, 0.4, 0.3], [0.1, 0.9, 0.2],
  [0.9, 0.3, 0.7], [0.2, 0.7, 0.8], [0.6, 0.5, 0.1],
];
const neighborhood = evaluateUnityUrpTaaNeighborhood(samples);
vectorClose(
  neighborhood.minimum,
  [0.33088866590239735, 0.3751379438665894, 0.35742106152885694],
  1e-15,
  'variance minimum',
);
vectorClose(
  neighborhood.maximum,
  [0.5246668896531582, 0.6954502914275285, 0.6798338404319273],
  1e-15,
  'variance maximum',
);

const historyTaps = computeUnityUrpTaaHistoryTaps([0.413, 0.627], [1920, 1080]);
vectorClose(
  historyTaps.weights,
  [
    -0.04288598160000583,
    -0.07459302960000914,
    1.2503352400000023,
    -0.06354221039998802,
    -0.08324925839999954,
  ],
  1e-15,
  'bicubic weights',
);
close(historyTaps.weightSum, 0.9860647599999997, 1e-15, 'bicubic weight sum');
vectorClose(
  evaluateUnityUrpTaaPerceptualBlend([0.2, 0.4, 0.8], [0.9, 0.6, 0.1]),
  [0.26590909090909093, 0.418831168831169, 0.7340909090909091],
  1e-15,
  'perceptual .1 blend',
);

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 1, 500000);
const beauty = rtt(vec4(0, 0, 0, 1));
beauty.autoUpdate = false;
beauty.textureNeedsUpdate = false;
const temporal = new SoStylizedUnityTemporalAANode(
  beauty,
  texture(new THREE.DepthTexture(1, 1)),
  texture(new THREE.Texture()),
  camera,
  { initialSampleIndex: 17 },
);
assert.equal(temporal.beautyRenderTarget, beauty.renderTarget);
assert.equal(temporal.contract.centralFiltering, 0);
assert.equal(temporal.usesDepthHistory, false);
assert.match(temporal.contract.historyResolve, /DoTemporalAA\(2,2,2,0\)/);
assert.equal(temporal.contract.remainingBridges.length, 3);
assert.ok(temporal.contract.remainingBridges.every((gap) => (
  /Three|WebGPU|WGSL/.test(gap)
)), 'remaining TAA gaps must be backend-only');
assert.equal(temporal._historyRenderTarget.depthTexture, null);
assert.equal(temporal._previousDepthNode, null);
const setupDrawingSize = new THREE.Vector2(1920, 1080);
const setupPipelineContext = {};
const setupBuilder = {
  context: { renderPipeline: { context: setupPipelineContext } },
  renderer: {
    getDrawingBufferSize: (target) => target.copy(setupDrawingSize),
    logarithmicDepthBuffer: false,
    reversedDepthBuffer: true,
  },
};
assert.equal(temporal.setup(setupBuilder), temporal.getTextureNode());
assert.equal(temporal.setup(setupBuilder), temporal.getTextureNode());
assert.equal(temporal._historyRenderTarget.depthTexture, null);
assert.equal(temporal._previousDepthNode, null);
assert.equal(typeof setupPipelineContext.onBeforeRenderPipeline, 'function');
assert.equal(typeof setupPipelineContext.onAfterRenderPipeline, 'function');
temporal.setViewOffset(1920, 1080);
vectorClose(temporal.currentJitter.toArray(), computeSoStylizedUnityTaaJitter(17));
temporal.clearViewOffset();
temporal.reset(1025);
temporal.setViewOffset(1920, 1080);
vectorClose(temporal.currentJitter.toArray(), computeSoStylizedUnityTaaJitter(1));
temporal.clearViewOffset();
temporal.dispose();
beauty.renderTarget.dispose();

const runtimeSource = await readFile(
  fileURLToPath(new URL('../src/environment/soStylizedUnityTemporal.js', import.meta.url)),
  'utf8',
);
assert.doesNotMatch(runtimeSource, /adaptive \.05 minimum|Three WebGPU TRAA compatibility resolve/);
assert.match(runtimeSource, /centralFiltering: 0/);
assert.match(runtimeSource, /const colorCenter = sampleWorking\(\[0, 0\]\)/);
assert.match(runtimeSource, /standardDeviation = moment2\.div\(9\)/);
assert.match(runtimeSource, /sampleHistoryBicubic5Tap/);
assert.match(runtimeSource, /unityForwardVelocityUv/);
assert.match(runtimeSource, /historyUv\.sub\(0\.5\)\.abs\(\)\.greaterThan\(0\.5\)\.any\(\)/);
assert.match(runtimeSource, /workingToPerceptual/);
assert.match(runtimeSource, /sourceTaaQuadMesh\.render\(renderer\)/);
assert.doesNotMatch(runtimeSource, /super\.updateBefore\(frame\)/);
assert.doesNotMatch(runtimeSource, /super\.setup\(builder\)/);
assert.doesNotMatch(runtimeSource, /copyTextureToTexture\(\s*this\.depthNode/);
assert.match(runtimeSource, /this\._historyRenderTarget\.depthTexture = null/);

console.log('Unity URP 17.5 TAA: High DoTemporalAA(2,2,2,0) source hashes verified.');
console.log('Resolve: 9-tap YCoCg variance/min-max + 9-tap motion dilation + bicubic history.');
console.log('Blend: exact perceptual current-frame influence .1 and out-of-buffer rejection.');
console.log('Remaining: WGSL half arithmetic, velocity packing, and RenderGraph scheduling only.');
