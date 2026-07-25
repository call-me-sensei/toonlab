#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  ClampToEdgeWrapping,
  LinearFilter,
  RGBFormat,
  UnsignedInt101111Type,
} from 'three';
import { vec4 } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_BLOOM_CONTRACT,
  SO_STYLIZED_UNITY_BLOOM_HORIZONTAL,
  SO_STYLIZED_UNITY_BLOOM_SOURCE,
  SO_STYLIZED_UNITY_BLOOM_VERTICAL,
  SoStylizedUnityGaussianBloomNode,
  computeSoStylizedUnityBloomBaseResolution,
  computeSoStylizedUnityBloomMipCount,
  computeSoStylizedUnityBloomMipResolutions,
  evaluateSoStylizedUnityBloomComposite,
  evaluateSoStylizedUnityBloomPrefilter,
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
  ?? fileURLToPath(new URL(
    '../../../../Setup Guide In-Editor Tutorial/',
    import.meta.url,
  ));
const urpRoot = `${unityProject}/Library/PackageCache/com.unity.render-pipelines.universal@e38be786c41e`;
const coreRoot = `${unityProject}/Library/PackageCache/com.unity.render-pipelines.core@539ef1c759fb`;
const sourcePaths = {
  projectVersion: `${unityProject}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.projectVersionPath}`,
  projectSettings: `${unityProject}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.projectSettingsPath}`,
  volumeProfile: `${unityProject}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.volumeProfilePath}`,
  pipelineAsset: `${unityProject}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.pipelineAssetPath}`,
  bloomOverride: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.bloomOverridePath}`,
  bloomPass: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.bloomPassPath}`,
  bloomShader: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.bloomShaderPath}`,
  uberPass: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.uberPassPath}`,
  uberShader: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.uberShaderPath}`,
  pipelineCore: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.pipelineCorePath}`,
  package: `${urpRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.packagePath}`,
  coreClamp: `${coreRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.coreClampPath}`,
  corePackage: `${coreRoot}/${SO_STYLIZED_UNITY_BLOOM_SOURCE.corePackagePath}`,
};
const sourceContents = Object.fromEntries(await Promise.all(
  Object.entries(sourcePaths).map(async ([key, path]) => [
    key,
    await readFile(path, 'utf8'),
  ]),
));

for (const key of Object.keys(sourcePaths)) {
  assert.equal(
    sha256(sourceContents[key]),
    SO_STYLIZED_UNITY_BLOOM_SOURCE[`${key}Sha256`],
    `${key} source hash`,
  );
}

assert.match(sourceContents.projectVersion, /m_EditorVersion: 6000\.5\.4f1/);
assert.match(sourceContents.projectSettings, /m_ActiveColorSpace: 1/);
assert.match(sourceContents.package, /"version": "17\.5\.0"/);
assert.match(sourceContents.package, /"unity": "6000\.5"/);
assert.match(sourceContents.corePackage, /"version": "17\.5\.0"/);
assert.match(sourceContents.corePackage, /"unity": "6000\.5"/);

// Exact active volume and renderer inputs.
assert.match(
  sourceContents.volumeProfile,
  /m_Name: Bloom[\s\S]*?threshold:[\s\S]*?m_Value: 1\.1/,
);
assert.match(
  sourceContents.volumeProfile,
  /m_Name: Bloom[\s\S]*?intensity:[\s\S]*?m_Value: 6/,
);
assert.match(
  sourceContents.volumeProfile,
  /m_Name: Bloom[\s\S]*?scatter:[\s\S]*?m_Value: 0\.741/,
);
assert.match(
  sourceContents.volumeProfile,
  /m_Name: Bloom[\s\S]*?clamp:[\s\S]*?m_Value: 1/,
);
assert.match(
  sourceContents.volumeProfile,
  /m_Name: Bloom[\s\S]*?tint:[\s\S]*?m_Value: \{r: 0\.73014116, g: 0\.760351, b: 0\.8509804, a: 1\}/,
);
assert.match(
  sourceContents.volumeProfile,
  /highQualityFiltering:[\s\S]*?m_OverrideState: 0[\s\S]*?m_Value: 0/,
);
assert.match(
  sourceContents.volumeProfile,
  /downscale:[\s\S]*?m_OverrideState: 0[\s\S]*?m_Value: 0/,
);
assert.match(
  sourceContents.volumeProfile,
  /maxIterations:[\s\S]*?m_OverrideState: 0[\s\S]*?m_Value: 6/,
);
assert.match(sourceContents.pipelineAsset, /m_SupportsHDR: 1/);
assert.match(sourceContents.pipelineAsset, /m_HDRColorBufferPrecision: 0/);
assert.match(sourceContents.pipelineAsset, /m_RenderScale: 1/);
assert.match(sourceContents.pipelineAsset, /m_AllowPostProcessAlphaOutput: 0/);
assert.match(
  sourceContents.pipelineCore,
  /!needsAlpha[\s\S]*?GraphicsFormat\.B10G11R11_UFloatPack32[\s\S]*?return GraphicsFormat\.B10G11R11_UFloatPack32/,
);

// Pin the exact URP branches, rather than merely checking copied constants.
assert.match(
  sourceContents.bloomPass,
  /float threshold = Mathf\.GammaToLinearSpace\(bloom\.threshold\.value\);/,
);
assert.match(
  sourceContents.bloomPass,
  /float thresholdKnee = threshold \* 0\.5f;/,
);
assert.match(
  sourceContents.bloomPass,
  /Mathf\.Lerp\(0\.05f, 0\.95f, bloom\.scatter\.value\)/,
);
assert.match(
  sourceContents.bloomPass,
  /int tw = Mathf\.Max\(1, bloomSourceDesc\.width >> downres\);/,
);
assert.match(
  sourceContents.bloomPass,
  /Mathf\.FloorToInt\(Mathf\.Log\(maxSize, 2f\) - 1\)/,
);
assert.match(
  sourceContents.bloomPass,
  /Mathf\.Clamp\(iterations, 1, bloom\.maxIterations\.value\)/,
);
assert.match(
  sourceContents.bloomPass,
  /ShaderPass\.k_BlurHorizontal[\s\S]*?ShaderPass\.k_BlurVertical/,
);
assert.match(
  sourceContents.bloomPass,
  /for \(int i = mipCount - 2; i >= 0; i--\)[\s\S]*?ShaderPass\.k_Upsample/,
);
assert.match(sourceContents.bloomOverride, /BloomFilterMode\.Gaussian/);
assert.match(sourceContents.bloomOverride, /new DownscaleParameter\(BloomDownscaleMode\.Half\)/);
assert.match(sourceContents.bloomOverride, /new ClampedIntParameter\(6, 2, 8\)/);

assert.match(sourceContents.bloomShader, /float2 texelSize = _BlitTexture_TexelSize\.xy \* 2\.0;/);
assert.match(
  sourceContents.bloomShader,
  /float2 texelSize = _BlitTexture_TexelSize\.xy \* 2\.0;[\s\S]*?ClampUVForBilinear\([^;]+, texelSize\)/,
);
assert.match(
  sourceContents.coreClamp,
  /float2 ClampUVForBilinear\(float2 UV, float2 texelSize\)[\s\S]*?ClampUV\(UV, texelSize, 0\.5f\)/,
);
assert.match(sourceContents.bloomShader, /c0 \* 0\.01621622[\s\S]*?c8 \* 0\.01621622/);
assert.match(sourceContents.bloomShader, /3\.23076923/);
assert.match(sourceContents.bloomShader, /1\.38461538/);
assert.match(sourceContents.bloomShader, /c0 \* 0\.07027027[\s\S]*?c4 \* 0\.07027027/);
assert.match(sourceContents.bloomShader, /return lerp\(highMip, lowMip, Scatter\);/);
assert.match(
  sourceContents.uberPass,
  /tint = luma > 0f \? tint \* \(1f \/ luma\) : Color\.white;/,
);
assert.match(sourceContents.uberShader, /bloom \*= BloomIntensity;/);
assert.match(sourceContents.uberShader, /color \+= bloom \* BloomTint;/);

const contract = SO_STYLIZED_UNITY_BLOOM_CONTRACT;
assert.equal(contract.filter, 'Gaussian');
assert.equal(contract.downscale, 'Half');
assert.equal(contract.maxIterations, 6);
assert.equal(contract.highQualityFiltering, false);
assert.equal(contract.alphaOutput, false);
assert.equal(contract.lensDirt, false);
assert.equal(contract.targetFormat, 'B10G11R11_UFloatPack32');
close(contract.thresholdGamma, 1.1, 0, 'threshold gamma');
close(contract.thresholdLinear, 1.2332863807678223, 0, 'threshold linear');
close(contract.thresholdKnee, 0.6166431903839111, 0, 'threshold knee');
close(contract.scatterResolved, 0.7168999910354614, 0, 'scatter resolved');
close(contract.intensity, 6, 0, 'intensity');
vectorClose(
  contract.tintLinear,
  [0.49211737513542175, 0.5387921333312988, 0.6938719153404236],
  0,
  'linear tint',
);
close(contract.tintLuminanceLinear, 0.5400586128234863, 0, 'tint luminance');
vectorClose(
  contract.tintNormalizedLinear,
  [0.9112295508384705, 0.997654914855957, 1.2848085165023804],
  0,
  'normalized tint',
);

close(
  SO_STYLIZED_UNITY_BLOOM_HORIZONTAL.weights.reduce((sum, weight) => sum + weight, 0),
  1,
  1e-7,
  'horizontal DC gain',
);
close(
  SO_STYLIZED_UNITY_BLOOM_VERTICAL.weights.reduce((sum, weight) => sum + weight, 0),
  1,
  1e-7,
  'vertical DC gain',
);
assert.deepEqual(
  SO_STYLIZED_UNITY_BLOOM_HORIZONTAL.offsets,
  [-4, -3, -2, -1, 0, 1, 2, 3, 4],
);
assert.deepEqual(
  SO_STYLIZED_UNITY_BLOOM_VERTICAL.offsets,
  [-3.23076923, -1.38461538, 0, 1.38461538, 3.23076923],
);

assert.deepEqual(
  computeSoStylizedUnityBloomBaseResolution(1920, 1080),
  { width: 960, height: 540 },
);
assert.equal(computeSoStylizedUnityBloomMipCount(1920, 1080), 6);
assert.deepEqual(computeSoStylizedUnityBloomMipResolutions(1920, 1080), [
  { width: 960, height: 540 },
  { width: 480, height: 270 },
  { width: 240, height: 135 },
  { width: 120, height: 67 },
  { width: 60, height: 33 },
  { width: 30, height: 16 },
]);
assert.equal(computeSoStylizedUnityBloomMipCount(4, 4), 1);
assert.deepEqual(
  computeSoStylizedUnityBloomMipResolutions(5, 3),
  [{ width: 2, height: 1 }],
);

vectorClose(
  evaluateSoStylizedUnityBloomPrefilter([0, 0, 0]).color,
  [0, 0, 0],
  0,
  'black prefilter',
);
const white = evaluateSoStylizedUnityBloomPrefilter([1, 1, 1]);
close(white.brightness, 1, 0, 'white brightness');
close(white.multiplier, 0.05957922176411178, 1e-15, 'white soft-knee multiplier');
vectorClose(
  white.color,
  [0.05957922176411178, 0.05957922176411178, 0.05957922176411178],
  1e-15,
  'white prefilter',
);
vectorClose(
  evaluateSoStylizedUnityBloomPrefilter([10, 0.5, -1]).color,
  [
    0.05957922176411178,
    0.02978961088205589,
    0,
  ],
  1e-15,
  'clamp then threshold then positive clamp',
);
vectorClose(
  evaluateSoStylizedUnityBloomComposite([1, 1, 1]),
  [
    0.3257420849245032,
    0.35663702049755475,
    0.4592873491746887,
  ],
  1e-14,
  'white Uber bloom contribution',
);

const node = new SoStylizedUnityGaussianBloomNode(vec4(1));
node.setSize(1920, 1080);
assert.equal(node.mipCount, 6);
assert.deepEqual(node.mipResolutions, computeSoStylizedUnityBloomMipResolutions(1920, 1080));
for (const target of [...node._downTargets, ...node._upTargets]) {
  assert.equal(target.texture.format, RGBFormat);
  assert.equal(target.texture.type, UnsignedInt101111Type);
  assert.equal(target.texture.magFilter, LinearFilter);
  assert.equal(target.texture.minFilter, LinearFilter);
  assert.equal(target.texture.wrapS, ClampToEdgeWrapping);
  assert.equal(target.texture.wrapT, ClampToEdgeWrapping);
  assert.equal(target.texture.generateMipmaps, false);
}
assert.equal(node.contract.remainingBridges.length, 1);
assert.match(node.contract.remainingBridges[0], /half arithmetic/);
node.dispose();

const [bloomRuntimeSource, renderingSource, stageSource] = await Promise.all([
  readFile(new URL('../src/environment/soStylizedUnityBloom.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/environment/soStylizedUnityRendering.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/environment/soStylizedUnityStage.js', import.meta.url), 'utf8'),
]);
assert.doesNotMatch(renderingSource, /three\/examples\/jsm\/tsl\/display\/BloomNode/);
assert.match(bloomRuntimeSource, /class SoStylizedUnityGaussianBloomNode extends TempNode/);
assert.doesNotMatch(bloomRuntimeSource, /texture\(null\)/);
assert.match(bloomRuntimeSource, /for \(let index = 1; index < this\._mipCount; index \+= 1\)/);
assert.match(bloomRuntimeSource, /for \(let index = this\._mipCount - 2; index >= 0; index -= 1\)/);
const horizontalBindIndex = bloomRuntimeSource.indexOf(
  'this._horizontalMaterial.colorTexture.value = this._downTargets[index - 1].texture;',
);
const horizontalRenderIndex = bloomRuntimeSource.indexOf(
  '_quadMesh.name = `Unity URP Bloom [ Gaussian H ${index} ]`;',
);
const verticalBindIndex = bloomRuntimeSource.indexOf(
  'this._verticalMaterial.colorTexture.value = this._upTargets[index].texture;',
);
const verticalRenderIndex = bloomRuntimeSource.indexOf(
  '_quadMesh.name = `Unity URP Bloom [ Gaussian V ${index} ]`;',
);
const upsampleHighBindIndex = bloomRuntimeSource.indexOf(
  'this._upsampleMaterial.highTexture.value = this._downTargets[index].texture;',
);
const upsampleLowBindIndex = bloomRuntimeSource.indexOf(
  'this._upsampleMaterial.lowTexture.value = lowTarget.texture;',
);
const upsampleRenderIndex = bloomRuntimeSource.indexOf(
  '_quadMesh.name = `Unity URP Bloom [ Upsample ${index} ]`;',
);
for (const [label, bindIndex, renderIndex] of [
  ['horizontal sampler', horizontalBindIndex, horizontalRenderIndex],
  ['vertical sampler', verticalBindIndex, verticalRenderIndex],
  ['upsample high sampler', upsampleHighBindIndex, upsampleRenderIndex],
  ['upsample low sampler', upsampleLowBindIndex, upsampleRenderIndex],
]) {
  assert.ok(bindIndex >= 0, `${label} binding is missing`);
  assert.ok(renderIndex > bindIndex, `${label} must bind a live target before its first quad render`);
}
const horizontalRuntimeStart = bloomRuntimeSource.indexOf('const horizontal = Fn(() => {');
const verticalRuntimeStart = bloomRuntimeSource.indexOf('const vertical = Fn(() => {');
assert.ok(horizontalRuntimeStart >= 0 && verticalRuntimeStart > horizontalRuntimeStart);
const horizontalRuntimeSource = bloomRuntimeSource.slice(
  horizontalRuntimeStart,
  verticalRuntimeStart,
);
assert.match(
  horizontalRuntimeSource,
  /const texel = horizontalInvSizeNode\.mul\([\s\S]*?sourceTexelStride/,
);
assert.equal(
  [...horizontalRuntimeSource.matchAll(/\n\s+texel,\n\s+\)\.mul/g)].length,
  2,
  'horizontal taps must use doubled texel size for both offset and bilinear edge clamp',
);
const taaIndex = stageSource.indexOf('const temporallyResolved = temporal ?? fogged;');
const bloomIndex = stageSource.indexOf('soStylizedUnityBloom(temporallyResolved)');
const bloomAddIndex = stageSource.indexOf('temporallyResolved.add(vec4(bloomTinted.rgb, 0))');
const vignetteIndex = stageSource.indexOf('applySoStylizedUnityVignette(bloomed)');
const gradeIndex = stageSource.indexOf('applySoStylizedUnityLdrGradeLut(vignetted)');
assert.ok(taaIndex < bloomIndex, 'URP bloom must consume the temporally resolved scene');
assert.ok(bloomIndex < bloomAddIndex, 'Uber intensity/tint must precede the additive composite');
assert.ok(bloomAddIndex < vignetteIndex, 'Bloom must be composed before vignette');
assert.ok(vignetteIndex < gradeIndex, 'Bloom and vignette must precede LDR grading');

console.log('Unity URP 17.5 Gaussian bloom source hashes verified.');
console.log('Bloom: half-resolution / 6 mips / 9x5 Gaussian / .7169 LQ reconstruction.');
console.log('Prefilter: gamma threshold -> linear, hardcoded .5 knee, clamp 1.');
console.log('Uber: intensity 6 and luminance-normalized cool tint verified.');
console.log('Targets: B10G11R11, linear clamp, no mip generation verified.');
console.log('Remaining renderer bridges: 1 (HLSL half ALU versus WebGPU f32 ALU).');
