import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { float, vec4 } from 'three/tsl';

import {
  SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS,
  SO_STYLIZED_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS,
  UE_SOURCE_TEMPORAL_CONTRACT,
  UE_SOURCE_TAA_SAMPLE_OFFSETS,
  UeSourceTemporalAANode,
  computeUeSourceTaaBlendWeight,
  computeUeSourceTaaHistoryTaps,
  computeUeSourceTaaJitter,
  computeUeSourceTaaSpatialWeight,
  computeUeSourceTemporalDither,
  evaluateUeSourceTaaCurrentFilter,
  evaluateUeSourceTaaNeighborhoodBounds,
  loadUeSourceTemporalDitherNoiseTexture,
  ueSourceRgbToYCoCg,
  ueSourceYCoCgToRgb,
} from '../src/environment/ueSourceTemporal.js';
import {
  createSoStylizedSourceEnvironmentState,
} from '../src/environment/soStylizedSourceMaterials.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relativePath, encoding = 'utf8') =>
  readFile(new URL(relativePath, new URL('../', import.meta.url)), encoding);
const close = (actual, expected, epsilon = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} differs from ${expected} by more than ${epsilon}`,
  );
};

assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.antiAliasingMethod, 2);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.temporalUpsampling, true);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.screenPercentage, 100);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.sequenceLength, 8);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.filterSize, 1);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.currentFrameWeight, 0.04);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.quality, 2);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.qualityName, 'High');
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.catmullRom, false);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.passConfig, 'MainUpsampling');
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.historyFormat, 'PF_FloatRGBA');
assert.equal(
  UE_SOURCE_TEMPORAL_CONTRACT.historyR11G11B10EnabledForActivePermutation,
  false,
);
assert.match(UE_SOURCE_TEMPORAL_CONTRACT.inputFilter, /nine-tap/);
assert.match(UE_SOURCE_TEMPORAL_CONTRACT.historyFilter, /Catmull-Rom/);
assert.match(UE_SOURCE_TEMPORAL_CONTRACT.neighborhoodClamp, /YCoCg/);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.dither.alphaClip, 1 / 3);
assert.equal(UE_SOURCE_TEMPORAL_CONTRACT.dither.coefficient, 0.16665);

assert.deepEqual(UE_SOURCE_TAA_SAMPLE_OFFSETS, [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);
const testRgb = [0.2, 0.4, 0.8];
const testYCoCg = ueSourceRgbToYCoCg(testRgb);
close(testYCoCg[0], 1.8);
close(testYCoCg[1], -1.2);
close(testYCoCg[2], -0.2);
const roundTripRgb = ueSourceYCoCgToRgb(testYCoCg);
roundTripRgb.forEach((value, index) => close(value, testRgb[index]));

close(computeUeSourceTaaSpatialWeight(0, 0), 1);
close(
  computeUeSourceTaaSpatialWeight(0.25, -7 / 18),
  0.6352469522795687,
);
close(computeUeSourceTaaSpatialWeight(1, 0), 0.005);
close(computeUeSourceTaaSpatialWeight(0.5, 0.5), 0.27625);
close(computeUeSourceTaaSpatialWeight(2, 2), 0.005);

const currentSamples = [
  [0.2, 0.4, 0.8], [1, 0.5, 0.25], [2, 1, 0.5],
  [0.1, 0.2, 0.3], [0.6, 0.7, 0.8], [1.2, 0.4, 0.2],
  [0.05, 0.1, 0.15], [0.9, 1.1, 1.3], [4, 2, 1],
];
const filterFixture = evaluateUeSourceTaaCurrentFilter(
  currentSamples,
  [0.25, -7 / 18],
);
const expectedFilteredYCoCg = [
  2.567098208538359,
  0.49239404220775224,
  -0.14796501312576918,
];
const expectedFilteredRgb = [
  0.8018643159679701,
  0.6047832988531475,
  0.5556672948640939,
];
filterFixture.filteredYCoCg.forEach((value, index) => {
  close(value, expectedFilteredYCoCg[index]);
});
filterFixture.filteredRgb.forEach((value, index) => {
  close(value, expectedFilteredRgb[index]);
});
close(filterFixture.filteredTemporalWeight, 0.6352469522795687);
close(
  filterFixture.normalizedWeights.reduce((sum, weight) => sum + weight, 0),
  1,
);
close(filterFixture.normalizedWeights[4], 0.5461326623567745);

const neighborhoodFixture = evaluateUeSourceTaaNeighborhoodBounds(
  currentSamples,
  [0.25, -7 / 18],
);
assert.deepEqual(neighborhoodFixture.included, [4, 0, 1, 2, 3, 5, 7]);
neighborhoodFixture.minimum.forEach((value, index) => {
  close(value, [0.8, -1.2, -0.6][index]);
});
neighborhoodFixture.maximum.forEach((value, index) => {
  close(value, [4.5, 3, 0][index]);
});
close(neighborhoodFixture.threshold, 1.51);

const historyTaps = computeUeSourceTaaHistoryTaps(
  [0.37123, 0.62891],
  [1920, 1080],
);
assert.deepEqual(historyTaps.uvDirection, [
  [-1, 0], [1, 0], [0, 0], [0, -1], [0, 1],
]);
const expectedHistoryWeights = [
  -0.07846119120061883,
  -0.027797193415610186,
  1.216114129232446,
  -0.030452012407614644,
  -0.07940373220860239,
];
historyTaps.weights.forEach((value, index) => {
  close(value, expectedHistoryWeights[index]);
});
close(historyTaps.weights.reduce((sum, weight) => sum + weight, 0), 1);
close(historyTaps.uv[0][0], 0.37057291666666664);
close(historyTaps.uv[2][1], 0.6289513335589334);

const blendFixture = {
  filteredTemporalWeight: filterFixture.filteredTemporalWeight,
  lumaFiltered: 2,
  lumaHistory: 2.3,
};
close(computeUeSourceTaaBlendWeight(blendFixture), 0.07666666666666672);
close(
  computeUeSourceTaaBlendWeight({ ...blendFixture, velocityPixels: 20 }),
  0.11270493904559138,
);
close(
  computeUeSourceTaaBlendWeight({ ...blendFixture, velocityPixels: 80 }),
  0.2,
);
close(
  computeUeSourceTaaBlendWeight({ ...blendFixture, responsive: true }),
  0.25,
);
close(
  computeUeSourceTaaBlendWeight({ ...blendFixture, cameraCut: true }),
  1,
);

const expectedJitter = [
  [0, -1 / 6],
  [-1 / 4, 1 / 6],
  [1 / 4, -7 / 18],
  [-3 / 8, -1 / 18],
  [1 / 8, 5 / 18],
  [-1 / 8, -5 / 18],
  [3 / 8, 1 / 18],
  [-7 / 16, 7 / 18],
];
for (let sampleIndex = 0; sampleIndex < expectedJitter.length; sampleIndex += 1) {
  const actual = computeUeSourceTaaJitter(sampleIndex);
  close(actual[0], expectedJitter[sampleIndex][0]);
  close(actual[1], expectedJitter[sampleIndex][1]);
}
assert.deepEqual(computeUeSourceTaaJitter(8), computeUeSourceTaaJitter(0));
assert.deepEqual(computeUeSourceTaaJitter(-1), computeUeSourceTaaJitter(7));

// The 0.166650 coefficient is intentionally below 1/6: alpha zero must never
// survive the default 1/3 masked clip, even at the maximum regular+noise term.
const maximumZeroAlpha = computeUeSourceTemporalDither({
  alpha: 0,
  noise: 1,
  pixelX: 4,
  pixelY: 0,
});
close(maximumZeroAlpha, 0.33325);
assert.ok(maximumZeroAlpha < UE_SOURCE_TEMPORAL_CONTRACT.dither.alphaClip);
assert.ok(computeUeSourceTemporalDither({
  alpha: 1,
  noise: 0,
  pixelX: 0,
  pixelY: 0,
}) > UE_SOURCE_TEMPORAL_CONTRACT.dither.alphaClip);
close(computeUeSourceTemporalDither({
  alpha: 0.25,
  noise: 0.75,
  pixelX: 2,
  pixelY: 3,
  random: 0.3,
  sampleIndex: 4,
}), -0.21250375);

const config = await read('../StylizedExploration/Config/DefaultEngine.ini');
assert.match(config, /^r\.TemporalAA\.Upsampling=True$/m);
assert.match(config, /^r\.AntiAliasingMethod=2$/m);
assert.match(config, /^r\.ScreenPercentage\.Default=100\.000000$/m);

const engineRoot = process.env.TOONLAB_UE_ENGINE_ROOT
  ?? '/Users/Shared/Epic Games/UE_5.8/Engine';
const visibilitySourcePath = path.join(
  engineRoot,
  'Source/Runtime/Renderer/Private/SceneVisibility.cpp',
);
let verifiedEngineSource = false;
if (existsSync(visibilitySourcePath)) {
  const [
    visibilitySource,
    temporalSource,
    temporalShaderSource,
    textureSamplingSource,
    materialRegistrySource,
    postProcessingSource,
  ] = await Promise.all([
    readFile(visibilitySourcePath, 'utf8'),
    readFile(path.join(
      engineRoot,
      'Source/Runtime/Renderer/Private/PostProcess/TemporalAA.cpp',
    ), 'utf8'),
    readFile(path.join(
      engineRoot,
      'Shaders/Private/TemporalAA.usf',
    ), 'utf8'),
    readFile(path.join(
      engineRoot,
      'Shaders/Private/TextureSampling.ush',
    ), 'utf8'),
    readFile(path.join(
      engineRoot,
      'Source/Runtime/Engine/Private/Materials/MaterialExternalCodeRegistry.cpp',
    ), 'utf8'),
    readFile(path.join(
      engineRoot,
      'Source/Runtime/Renderer/Private/PostProcess/PostProcessing.cpp',
    ), 'utf8'),
  ]);
  assert.match(visibilitySource, /TEXT\("r\.TemporalAASamples"\),\s*8,/);
  assert.match(
    visibilitySource,
    /SampleX = Halton\(TemporalSampleIndex \+ 1, 2\) - 0\.5f;/,
  );
  assert.match(
    visibilitySource,
    /SampleY = Halton\(TemporalSampleIndex \+ 1, 3\) - 0\.5f;/,
  );
  assert.match(
    visibilitySource,
    /HackAddTemporalAAProjectionJitter\(FVector2D\(SampleX \* 2\.0f \/ View\.ViewRect\.Width\(\), SampleY \* -2\.0f \/ View\.ViewRect\.Height\(\)\)\)/,
  );
  assert.match(temporalSource, /TEXT\("r\.TemporalAAFilterSize"\),\s*1\.0f,/);
  assert.match(temporalSource, /TEXT\("r\.TemporalAACatmullRom"\),\s*0,/);
  assert.match(temporalSource, /TEXT\("r\.TemporalAACurrentFrameWeight"\),\s*\.04f,/);
  assert.match(temporalSource, /TEXT\("r\.TemporalAA\.Quality"\), 2,/);
  assert.match(temporalSource, /TEXT\("r\.TemporalAA\.R11G11B10History"\), 1,/);
  assert.match(
    temporalSource,
    /\(Inputs\.Quality != ETAAQuality::High\) && \(Inputs\.Quality != ETAAQuality::MediumHigh\)[\s\S]*?HistoryPixelFormat = PF_FloatR11G11B10/,
  );
  assert.equal(
    createHash('sha256').update(temporalSource).digest('hex'),
    '258d6c17b8a189a9835041a1d476be1be6f291fb4d89857f9d9e42bcc996d7bc',
  );
  assert.equal(
    createHash('sha256').update(temporalShaderSource).digest('hex'),
    '657723453180ff0e7aa2b992e29f53c6059e21ed740954833dd6175bf144ea84',
  );
  assert.equal(
    createHash('sha256').update(textureSamplingSource).digest('hex'),
    '245997df100de8c71b122be45cebcbfc50ca3b0c34ca0207207d4a1fb2b9af41',
  );
  assert.match(
    temporalShaderSource,
    /TAA_PASS_CONFIG == 1 \|\| TAA_PASS_CONFIG == 2[\s\S]*?TAA_QUALITY == TAA_QUALITY_HIGH[\s\S]*?#define AA_HISTORY_CLAMPING_BOX \(HISTORY_CLAMPING_BOX_SAMPLE_DISTANCE\)[\s\S]*?#define AA_DYNAMIC_ANTIGHOST 1[\s\S]*?#define AA_SAMPLES 9/,
  );
  assert.match(
    temporalShaderSource,
    /float x2 = saturate\(u2 \* dot\(PixelDelta, PixelDelta\)\);\s*float r = \(0\.905 \* x2 - 1\.9\) \* x2 \+ 1;/,
  );
  assert.match(
    temporalShaderSource,
    /float DistThreshold = lerp\(1\.51, 1\.3, DistthresholdLerp\);/,
  );
  assert.match(
    temporalShaderSource,
    /BlendFinal = IntermediaryResult\.FilteredTemporalWeight \* CurrentFrameWeight;[\s\S]*?lerp\(BlendFinal, 0\.2, saturate\(Velocity \/ 40\)\)[\s\S]*?0\.01 \* LumaHistory \/ abs\( LumaFiltered - LumaHistory \)/,
  );
  assert.match(
    temporalShaderSource,
    /float3 RGBToYCoCg[\s\S]*?dot\( RGB, float3\(\s*1, 2,\s*1 \) \)[\s\S]*?float3 YCoCgToRGB/,
  );
  assert.match(
    temporalShaderSource,
    /bool Dynamic1 = SampleVelocityTexture[\s\S]*?IgnoreHistory = IgnoreHistory \|\| \(!Dynamic && History\.Color\.a > 0\)/,
  );
  assert.match(
    textureSamplingSource,
    /GetBicubic2DCatmullRomSamples[\s\S]*?half2 uv = \(half\(1\.25\) - f2\) \* f \+ half\(0\.5\)[\s\S]*?Samples\.Weight\[2\]/,
  );
  assert.match(
    materialRegistrySource,
    /MEVP_TemporalSampleIndex, MCT_Float1, TEXTVIEW\("View\.TemporalAAParams\.x"\)/,
  );
  assert.equal(
    createHash('sha256').update(postProcessingSource).digest('hex'),
    '80e554928222ef746307d7b84bf72d339a3453d26dbf85453fd06c91e5177c28',
  );
  const dofPassIndex = postProcessingSource.indexOf('DiaphragmDOF::AddPasses(');
  const afterDofIndex = postProcessingSource.indexOf(
    'ApplyPostProcessMaterialsToSlice(BL_SceneColorAfterDOF',
  );
  const temporalPassIndex = postProcessingSource.indexOf(
    'AddGen4MainTemporalAAPasses(',
  );
  const bloomPassIndex = postProcessingSource.indexOf('AddBloomSetupPass(');
  const tonemapPassIndex = postProcessingSource.indexOf('AddTonemapPass(');
  assert.ok(dofPassIndex >= 0, 'UE DiaphragmDOF pass call is missing');
  assert.ok(afterDofIndex > dofPassIndex, 'UE AfterDOF chain must follow DOF');
  assert.ok(temporalPassIndex > afterDofIndex, 'UE Gen4 TAA must follow AfterDOF');
  assert.ok(bloomPassIndex > temporalPassIndex, 'UE bloom must follow Gen4 TAA');
  assert.ok(tonemapPassIndex > bloomPassIndex, 'UE tonemap must follow bloom');
  verifiedEngineSource = true;
}

const threeTraaSource = await read(
  'node_modules/three/examples/jsm/tsl/display/TRAANode.js',
);
assert.equal(
  createHash('sha256').update(threeTraaSource).digest('hex'),
  '0d4985dec99245f919df9a905bc469b0df37b2f264dea7eeeebce3a24741faba',
);

const ditherGraph = await read('assets-local/sostylized/ue-temporal-dither/DitherTemporalAA.T3D');
assert.match(ditherGraph, /StateId=DFD90C094380729770171F8D5940702C/);
assert.match(ditherGraph, /Property=MEVP_TemporalSampleIndex/);
assert.match(ditherGraph, /Code="Mod\( \(\(uint\)\(p\.x\) \+ 2 \* \(uint\)\(p\.y\)\) , 5 \)"/);
assert.match(ditherGraph, /ConstB=0\.166650/);
assert.match(ditherGraph, /ConstB=-0\.500000/);
assert.match(ditherGraph, /InputName="Random"[\s\S]*?PreviewValue=\(X=1\.000000/);
assert.match(ditherGraph, /R=64\.000000\s+G=64\.000000/);
assert.match(ditherGraph, /Good64x64TilingNoiseHighFreq\.Good64x64TilingNoiseHighFreq/);
assert.match(ditherGraph, /SamplerType=SAMPLERTYPE_LinearGrayscale/);

const screenUvGraph = await read(
  'assets-local/sostylized/ue-temporal-dither/ScreenAlignedPixelToPixelUVs.T3D',
);
assert.match(screenUvGraph, /InputName="TextureResolution"/);
assert.match(screenUvGraph, /MaterialExpressionScreenPosition_3'",OutputIndex=1/);
assert.match(screenUvGraph, /MaterialExpressionDivide/);

const noisePng = await read(
  'assets-local/sostylized/ue-temporal-dither/Good64x64TilingNoiseHighFreq.png',
  null,
);
assert.equal(noisePng.readUInt32BE(16), 64);
assert.equal(noisePng.readUInt32BE(20), 64);
assert.equal(
  createHash('sha256').update(noisePng).digest('hex'),
  '4a3d569ab5cd2f2aa8a975dd8f27abb27205fdcfdf6a6cdb9e7955f59518fd67',
);

const texture = await loadUeSourceTemporalDitherNoiseTexture({
  textureLoader: {
    async loadAsync() {
      return new THREE.Texture();
    },
  },
  url: `verify://Good64x64TilingNoiseHighFreq/${Date.now()}`,
});
assert.equal(texture.colorSpace, THREE.NoColorSpace);
assert.equal(texture.flipY, false);
assert.equal(texture.wrapS, THREE.RepeatWrapping);
assert.equal(texture.wrapT, THREE.RepeatWrapping);
assert.equal(texture.minFilter, THREE.LinearFilter);
assert.equal(texture.magFilter, THREE.LinearFilter);
assert.equal(texture.generateMipmaps, false);

const nodeMap = JSON.parse(await read('assets-local/sostylized/shader-node-map.json'));
const graphsUsingDither = [...nodeMap.materialGraphs, ...nodeMap.functionGraphs]
  .filter((graph) => JSON.stringify(graph).includes('DitherTemporalAA'))
  .map((graph) => graph.path)
  .sort();
assert.deepEqual(graphsUsingDither, [...SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS].sort());
assert.equal(SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS.length, 8);
assert.equal(SO_STYLIZED_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS.length, 4);
for (const graph of SO_STYLIZED_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS) {
  assert.ok(SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS.includes(graph));
}

const state = createSoStylizedSourceEnvironmentState({
  createGlobalParameterSnapshot() {
    return { scalars: {}, vectors: {} };
  },
}, {
  temporalDitherNoiseTexture: texture,
  temporalSampleIndex: 3,
});
assert.equal(state.temporal.ditherNoiseTexture, texture);
assert.equal(state.uniforms.temporalSampleIndex.value, 3);

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2000);
const temporalAA = new UeSourceTemporalAANode(
  vec4(0),
  float(1),
  null,
  camera,
  { initialSampleIndex: 3, state },
);
assert.equal(temporalAA.contract.sequenceLength, 8);
assert.equal(temporalAA.contract.sourceCurrentFrameWeight, 0.04);
assert.equal(temporalAA.contract.runtimeResolveCurrentFrameWeight, 0.04);
assert.equal(temporalAA.contract.activeHistoryFormat, 'PF_FloatRGBA');
assert.match(temporalAA.contract.activePermutation, /nine samples \/ YCoCg/);
assert.match(temporalAA.contract.historyResolve, /UE Gen4 MainUpsampling High/);
assert.ok(temporalAA.contract.remainingBridges.some((gap) => /stencil/.test(gap)));
assert.equal(temporalAA.useSubpixelCorrection, false);
temporalAA.setViewOffset(1920, 1080);
close(temporalAA.currentJitter.x, expectedJitter[3][0]);
close(temporalAA.currentJitter.y, expectedJitter[3][1]);
close(camera.view.offsetX, expectedJitter[3][0]);
close(camera.view.offsetY, expectedJitter[3][1]);
assert.equal(state.uniforms.temporalSampleIndex.value, 3);
temporalAA.clearViewOffset();
temporalAA.setViewOffset(1920, 1080);
assert.equal(state.uniforms.temporalSampleIndex.value, 4);
close(temporalAA.currentJitter.x, expectedJitter[4][0]);
close(temporalAA.currentJitter.y, expectedJitter[4][1]);
temporalAA.clearViewOffset();
temporalAA.dispose();

const materialSource = await read('src/environment/soStylizedSourceMaterials.js');
const rockSource = await read('src/rockgen/reference/referenceSourceMaterial.js');
const showcaseSource = await read('examples/source-showcase/main.js');
const barrelSource = await read('src/environment/index.js');
const runtimeTemporalSource = await read('src/environment/ueSourceTemporal.js');
assert.match(materialSource, /ueSourceDitherTemporalAA/);
assert.doesNotMatch(materialSource, /interleavedGradientNoise/);
assert.match(rockSource, /ueSourceDitherTemporalAA/);
assert.match(showcaseSource, /ueSourceTraa\(/);
assert.doesNotMatch(showcaseSource, /\btraa\(/);
assert.match(showcaseSource, /temporalSampleIndex/);
assert.match(showcaseSource, /temporalRemainingBridges/);
assert.match(runtimeTemporalSource, /sampleHistoryCatmullRom/);
assert.match(runtimeTemporalSource, /UE_SOURCE_TAA_SAMPLE_OFFSETS\.forEach/);
assert.match(runtimeTemporalSource, /sampleHdrWeight = float\(1\)\.div\(samples\[index\]\.x\.add\(4\)\)/);
assert.match(runtimeTemporalSource, /dot\(delta, delta\)\.lessThan\(1\.51 \*\* 2\)/);
assert.match(runtimeTemporalSource, /filteredTemporalWeight\.mul\(UE_SOURCE_TEMPORAL_CONTRACT\.currentFrameWeight\)/);
assert.match(runtimeTemporalSource, /historyBeforeClamp\.x\.mul\(0\.01\)\.div\(lumaDifference\)/);
assert.match(runtimeTemporalSource, /return vec4\(resolvedRgb, centerIsDynamic\.select\(1, 0\)\)/);
const showcasePipelineSource = showcaseSource.slice(
  showcaseSource.indexOf('function createSourcePostPipeline('),
  showcaseSource.indexOf('function createUnitySourcePostPipeline('),
);
const showcaseDofIndex = showcasePipelineSource.indexOf(
  'createUeSourceDepthOfFieldNode(',
);
const showcaseAfterDofIndex = showcasePipelineSource.indexOf(
  'createSoStylizedSourceFogPostNode({',
);
const showcaseTemporalIndex = showcasePipelineSource.indexOf(
  'ueSourceTraa(afterDepthOfField',
);
const showcaseBloomIndex = showcasePipelineSource.indexOf(
  'ueSourceStandardBloom(resolvedSceneColor',
);
assert.ok(showcaseDofIndex >= 0, 'showcase DOF stage is missing');
assert.ok(showcaseAfterDofIndex > showcaseDofIndex, 'showcase AfterDOF stage must follow DOF');
assert.ok(showcaseTemporalIndex > showcaseAfterDofIndex, 'showcase TAA must follow AfterDOF');
assert.ok(showcaseBloomIndex > showcaseTemporalIndex, 'showcase bloom must follow TAA');
assert.match(barrelSource, /export \* from '\.\/ueSourceTemporal\.js'/);

console.log('Verified UE source temporal contract:');
console.log(`- project: AAM_TemporalAA, ${UE_SOURCE_TEMPORAL_CONTRACT.sequenceLength}-sample Halton jitter`);
console.log('- exact source graph: DitherTemporalAA + exported 64x64 engine noise');
console.log(`- source call sites: ${SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS.length}`);
console.log(`- live exact bindings: ${SO_STYLIZED_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS.length}`);
console.log('- history resolve: UE MainUpsampling/High nine-tap + YCoCg/Catmull-Rom core active');
console.log('- explicit gaps: responsive stencil, encoded mobility ownership, exact half arithmetic');
console.log(`- UE 5.8 C++ defaults: ${verifiedEngineSource ? 'verified' : 'engine source unavailable'}`);
console.log(`- root: ${root}`);
