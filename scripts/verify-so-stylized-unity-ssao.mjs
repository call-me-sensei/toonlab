import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
  UNITY_URP_BLUE_NOISE_SHA256,
  UNITY_URP_SSAO_BILATERAL_KERNEL,
  UNITY_URP_SSAO_RANDOM_UV,
  UNITY_URP_SSAO_SOURCE,
  assertUnityUrpBlueNoiseTexturesReady,
  evaluateUnityUrpAlchemySample,
  evaluateUnityUrpAlchemyVisibility,
  evaluateUnityUrpSsaoBilateral,
  evaluateUnityUrpSsaoFinalVisibility,
  pickUnityUrpBlueNoiseSamplePoint,
} from '../src/environment/soStylizedUnityRendering.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const near = (actual, expected, epsilon = 1e-12, label = 'value') => assert(
  Math.abs(actual - expected) <= epsilon,
  `${label}: expected ${expected}, received ${actual}`,
);

const unityProject = process.env.TOONLAB_UNITY_PROJECT
  ?? fileURLToPath(new URL('../../../../Setup Guide In-Editor Tutorial/', import.meta.url));
const urpRoot = `${unityProject}/Library/PackageCache/com.unity.render-pipelines.universal@e38be786c41e`;
const sourceFiles = {
  pass: `${urpRoot}/Runtime/Passes/ScreenSpaceAmbientOcclusionPass.cs`,
  shader: `${urpRoot}/Shaders/Utils/ScreenSpaceAmbientOcclusion.shader`,
  ssao: `${urpRoot}/ShaderLibrary/SSAO.hlsl`,
  renderer: `${unityProject}/Assets/SourceFiles/Settings/PC_Renderer.asset`,
};
for (const [key, path] of Object.entries(sourceFiles)) {
  assert(existsSync(path), `missing Unity SSAO source ${key}: ${path}`);
}
const source = Object.fromEntries(
  Object.entries(sourceFiles).map(([key, path]) => [key, readFileSync(path)]),
);
assert.equal(sha256(source.pass), UNITY_URP_SSAO_SOURCE.screenSpaceAmbientOcclusionPassSha256);
assert.equal(sha256(source.shader), UNITY_URP_SSAO_SOURCE.screenSpaceAmbientOcclusionShaderSha256);
assert.equal(sha256(source.ssao), UNITY_URP_SSAO_SOURCE.ssaoHlslSha256);
assert.equal(sha256(source.renderer), UNITY_URP_SSAO_SOURCE.pcRendererSha256);

const ssaoText = source.ssao.toString('utf8');
const passText = source.pass.toString('utf8');
const shaderText = source.shader.toString('utf8');
const rendererText = source.renderer.toString('utf8');
assert.match(rendererText, /AOMethod:\s*0/);
assert.match(rendererText, /Downsample:\s*0/);
assert.match(rendererText, /AfterOpaque:\s*0/);
assert.match(rendererText, /Source:\s*1/);
assert.match(rendererText, /Intensity:\s*0\.4/);
assert.match(rendererText, /DirectLightingStrength:\s*0\.25/);
assert.match(rendererText, /Radius:\s*0\.3/);
assert.match(rendererText, /Samples:\s*1/);
assert.match(rendererText, /BlurQuality:\s*0/);
assert.match(rendererText, /Falloff:\s*100/);
assert.match(passText, /radiusMultiplier\s*=.*\?\s*1\.5f\s*:\s*1/);
assert.match(passText, /m_BlueNoiseTextureIndex\s*=\s*\(m_BlueNoiseTextureIndex\s*\+\s*1\)/);
assert.match(passText, /Random\.value/);
assert.match(passText, /BilateralBlurHorizontal/);
assert.match(passText, /BilateralBlurVertical/);
assert.match(passText, /BilateralBlurFinal/);
assert.match(ssaoText, /static const int SAMPLE_COUNT = 8/);
assert.match(ssaoText, /kContrast\s*=\s*half\(0\.6\)/);
assert.match(ssaoText, /kGeometryCoeff\s*=\s*half\(0\.8\)/);
assert.match(ssaoText, /kBeta\s*=\s*half\(0\.004\)/);
assert.match(ssaoText, /kEpsilon\s*=\s*half\(0\.0001\)/);
assert.match(ssaoText, /v \*= lerp\(0\.1, 1\.0, lerpVal \* lerpVal\)/);
assert.match(ssaoText, /ao \*= RADIUS/);
assert.match(ssaoText, /PositivePow\(saturate\(ao \* INTENSITY \* falloff \* rcpSampleCount\), kContrast\)/);
assert.match(shaderText, /Name "SSAO_Bilateral_HorizontalBlur"/);
assert.match(shaderText, /Name "SSAO_Bilateral_VerticalBlur"/);
assert.match(shaderText, /Name "SSAO_Bilateral_FinalBlur"/);

assert.equal(UNITY_URP_SSAO_RANDOM_UV.length, 40);
assert.equal(UNITY_URP_SSAO_BILATERAL_KERNEL.length, 5);
near(
  UNITY_URP_SSAO_BILATERAL_KERNEL.reduce((sum, tap) => sum + tap.weight, 0),
  1,
  1e-10,
  'bilateral DC weight',
);
const picked = pickUnityUrpBlueNoiseSamplePoint({
  noise: 0.25,
  normal: [0, 1, 0],
  sampleIndex: 3,
});
near(picked.lerpValue, 0.375, 0, 'sample lerp');
near(picked.radialScale, 0.2265625, 1e-15, 'sample radial scale');
near(picked.u, 0.6328125, 0, 'sample u');
near(picked.vector[0], 0.07293365700920426, 1e-14, 'sample vector x');
near(picked.vector[1], 0.0302101098866808, 1e-14, 'sample vector y');
near(picked.vector[2], -0.06451721191406251, 1e-14, 'sample vector z');

near(evaluateUnityUrpAlchemySample({
  centerLinearDepth: 12,
  delta: [0.2, 0.1, -0.05],
  normal: [0, 1, 0],
  sampleLinearDepth: 12.1,
  samplePointLinearDepth: 12.2,
}), 0.9885931558935359, 1e-14, 'Alchemy contribution');
const response = evaluateUnityUrpAlchemyVisibility(4.25, { centerLinearDepth: 12 });
near(response.falloff, 0.7744, 1e-15, 'Alchemy falloff');
near(response.normalized, 0.074052, 1e-15, 'Alchemy normalization');
near(response.obscurance, 0.20975971075240746, 1e-14, 'Alchemy contrast');
near(response.visibility, 0.7902402892475926, 1e-14, 'Alchemy visibility');

const blurSamples = [
  { ao: 0.1, normal: [0, 1, 0] },
  { ao: 0.7, normal: [0, 0.9, 0.435889894] },
  { ao: 0.3, normal: [0, 1, 0] },
  { ao: 0.9, normal: [1, 0, 0] },
  { ao: 0.5, normal: [0, 0.95, 0.3122499] },
];
near(evaluateUnityUrpSsaoBilateral(blurSamples), 0.3390406395844039, 1e-14, 'bilateral result');
near(evaluateUnityUrpSsaoFinalVisibility(blurSamples), 0.6495327102803738, 1e-14, 'final result');

const decodedNoiseTextures = Array.from({ length: 8 }, () => ({
  image: {
    complete: true,
    naturalHeight: 256,
    naturalWidth: 256,
  },
}));
assert.equal(assertUnityUrpBlueNoiseTexturesReady(decodedNoiseTextures), decodedNoiseTextures);
assert.throws(
  () => assertUnityUrpBlueNoiseTexturesReady([
    ...decodedNoiseTextures.slice(0, 7),
    { image: null },
  ]),
  /texture 7 is not decoded/,
);

const localNoiseRoot = fileURLToPath(new URL(
  '../assets-local/sostylized-unity/renderer/blue-noise/',
  import.meta.url,
));
for (let index = 0; index < UNITY_URP_BLUE_NOISE_SHA256.length; index += 1) {
  const sourcePath = `${urpRoot}/Textures/BlueNoise256/LDR_LLL1_${index}.png`;
  const localPath = `${localNoiseRoot}/LDR_LLL1_${index}.png`;
  assert(existsSync(localPath), `missing local URP blue-noise texture ${index}`);
  assert.equal(sha256(readFileSync(sourcePath)), UNITY_URP_BLUE_NOISE_SHA256[index]);
  assert.equal(sha256(readFileSync(localPath)), UNITY_URP_BLUE_NOISE_SHA256[index]);
}

const runtimePath = fileURLToPath(new URL(
  '../src/environment/soStylizedUnityAmbientOcclusion.js',
  import.meta.url,
));
const runtime = readFileSync(runtimePath, 'utf8');
const stagePath = fileURLToPath(new URL(
  '../src/environment/soStylizedUnityStage.js',
  import.meta.url,
));
const stageRuntime = readFileSync(stagePath, 'utf8');
assert.doesNotMatch(runtime, /from\s+['"].*GTAONode/);
assert.match(runtime, /RGBAFormat/);
assert.match(runtime, /RedFormat/);
assert.match(runtime, /UnsignedByteType/);
assert.match(runtime, /normalNode\.load/);
assert.match(runtime, /perspectiveDepthToViewZ/);
assert.match(runtime, /builder\.renderer\.reversedDepthBuffer === true/);
assert.match(runtime, /rawDepth\.greaterThan\(SKY_DEPTH_EPSILON\)/);
assert.match(runtime, /rawDepth\.lessThan\(1 - SKY_DEPTH_EPSILON\)/);
assert.match(runtime, /readVisibilityStats/);
assert.match(runtime, /loadUnityUrpBlueNoiseTexturesAsync/);
assert.match(runtime, /requires awaited loadUnityUrpBlueNoiseTexturesAsync\(\) input/);
assert.doesNotMatch(runtime, /textureLoader\.load\(`/);
assert.match(runtime, /assertUnityUrpBlueNoiseTexturesReady\(this\.blueNoiseTextures\)/);
assert.match(runtime, /if \(isDecodedBlueNoiseImage\(map\.image\)\) map\.needsUpdate = true/);
assert.doesNotMatch(
  runtime,
  /map\.flipY = false;\s*map\.needsUpdate = true/,
  'TextureLoader image must exist before the WebGPU upload version is bumped',
);
assert.match(runtime, /_cameraWorldMatrix/);
assert.match(runtime, /_cameraViewMatrix/);
assert.match(runtime, /Bilateral Horizontal/);
assert.match(runtime, /Bilateral Vertical/);
assert.match(runtime, /Final Blur \/ Visibility/);
assert.match(
  stageRuntime,
  /soStylizedUnityAmbientOcclusion\(sceneDepth, sceneNormal, camera,\s*\{/,
  'SSAO must consume renderer-native scene depth',
);
assert.doesNotMatch(
  stageRuntime,
  /soStylizedUnityAmbientOcclusion\(conventionalDepth/,
  'pre-inverted depth is incompatible with Three reversed-depth reconstruction',
);
assert.match(stageRuntime, /applySoStylizedUnityFog\(occluded, sceneDepth, camera\)/);
assert.match(stageRuntime, /assertUnityUrpBlueNoiseTexturesReady\(ssaoBlueNoiseTextures\)/);
assert.match(stageRuntime, /blueNoiseTextures: resolvedSsaoBlueNoiseTextures/);
assert.match(stageRuntime, /stages: aoNode \? \['ao', 'beauty', 'temporal', 'final'\]/);

const showcasePath = fileURLToPath(new URL(
  '../examples/unity-showcase/main.js',
  import.meta.url,
));
const showcaseRuntime = readFileSync(showcasePath, 'utf8');
assert.match(showcaseRuntime, /loadUnityUrpBlueNoiseTexturesAsync\(\)/);
assert.match(showcaseRuntime, /const ssaoBlueNoiseTextures = await ssaoBlueNoiseTexturesPromise/);
assert.match(showcaseRuntime, /ssaoBlueNoiseTextures,/);
const preloadStartIndex = showcaseRuntime.indexOf(
  'loadUnityUrpBlueNoiseTexturesAsync()',
);
const preloadAwaitIndex = showcaseRuntime.indexOf(
  'const ssaoBlueNoiseTextures = await ssaoBlueNoiseTexturesPromise;',
);
const stageConstructionIndex = showcaseRuntime.indexOf(
  'createSoStylizedUnityStagePostPipeline({',
);
const occupancyWarmupIndex = showcaseRuntime.indexOf(
  'await verifySoStylizedUnityFrameOccupancy({',
);
assert.ok(
  preloadStartIndex >= 0
    && preloadAwaitIndex > preloadStartIndex
    && stageConstructionIndex > preloadAwaitIndex
    && occupancyWarmupIndex > stageConstructionIndex,
  'eight decoded SSAO textures must be awaited before post construction and occupancy warm-up',
);

const contract = SO_STYLIZED_UNITY_RENDER_CONTRACT.ssao;
assert.equal(contract.method, 'BlueNoise Alchemy ScreenSpaceAmbientOcclusion RendererFeature');
assert.equal(contract.fullResolution, true);
assert.equal(contract.source, 1);
assert.equal(contract.radiusInShader, 0.45);
assert.equal(contract.sampleCount, 8);
assert.equal(contract.blurQuality, 0);
assert.equal(contract.directLightingStrength, 0.25);

console.log('Unity URP BlueNoise Alchemy SSAO verification passed.');
console.log('Source hashes: pass, shader, HLSL, PC renderer and 8/8 noise textures exact.');
console.log('Runtime: 8 samples -> RGBA8 bilateral X/Y -> R8 final visibility.');
console.log('Depth: renderer-native forward/reversed device depth and matching camera projection.');
console.log('Placement: material normal source; indirect 1.0 / direct 0.25 / emission 0.0.');
