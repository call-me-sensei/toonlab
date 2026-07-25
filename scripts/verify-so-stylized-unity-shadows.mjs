#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { positionLocal, vec3 } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_SHADOW_CONTRACT,
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE,
  SO_STYLIZED_UNITY_SHADOW_SOURCE,
  SoStylizedUnityCascadeAtlasShadowNode,
  SoStylizedUnityTent7x7ShadowFilter,
  applySoStylizedUnityDirectionalShadowBiasCpu,
  applySoStylizedUnityRasterDepthBias,
  applySoStylizedUnityShadowContract,
  classifySoStylizedUnityShadowCaster,
  computeSoStylizedUnityCascadeAtlasSlice,
  computeSoStylizedUnityCascadeProjectionBounds,
  computeSoStylizedUnityCascadeTileResolution,
  computeSoStylizedUnityConservativeCascadeSphere,
  computeSoStylizedUnityDirectionalShadowBias,
  computeSoStylizedUnityShadowFadeParameters,
  computeSoStylizedUnityTent7x7Fetches,
  configureSoStylizedUnityShadowRenderer,
  createSoStylizedUnityCsmShadowNode,
  evaluateSoStylizedUnityShadowDistanceFade,
  evaluateSoStylizedUnityTent7x7,
  installSoStylizedUnityShadowCasterBias,
  intersectsSoStylizedUnityCascadeCullingPlanes,
  resolveSoStylizedUnityWebGpuRasterDepthBias,
  selectSoStylizedUnityCascadeIndex,
  snapshotSoStylizedUnityShadowDiagnostics,
  transformSoStylizedUnityCascadeUvToAtlas,
} from '../src/environment/soStylizedUnityShadows.js';

const close = (actual, expected, tolerance = 1e-12, label = 'value') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
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
  graphicsSettings: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.graphicsSettings}`,
  pipelineAsset: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.pipelineAsset}`,
  pipelineAssetMeta: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.pipelineAsset}.meta`,
  qualitySettings: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.qualitySettings}`,
  scene: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.scene}`,
  mainLightShadowCasterPass: `${urpRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.mainLightShadowCasterPass}`,
  shadowCulling: `${urpRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowCulling}`,
  shadowSamplingTent: `${coreRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowSamplingTent}`,
  shadowUtils: `${urpRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowUtils}`,
  shadowsHlsl: `${urpRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowsHlsl}`,
  skyPrefab: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.skyPrefab}`,
  skyPrefabMeta: `${unityProject}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.skyPrefab}.meta`,
  universalRenderer: `${urpRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.universalRenderer}`,
  universalPipeline: `${urpRoot}/${SO_STYLIZED_UNITY_SHADOW_SOURCE.universalPipeline}`,
  unitySetGlobalDepthBiasDocs:
    '/Applications/Unity/Hub/Editor/6000.5.4f1/Documentation/en/ScriptReference/Rendering.CommandBuffer.SetGlobalDepthBias.html',
};

const oracleCapturePath = fileURLToPath(new URL(
  '../docs/source-shader-audits/unity-shadow-cascade-oracle.json',
  import.meta.url,
));
const oracleCapture = JSON.parse(await readFile(oracleCapturePath, 'utf8'));

const sourceEntries = Object.entries(sourcePaths);
const sourceContents = Object.fromEntries(await Promise.all(sourceEntries.map(
  async ([key, path]) => [key, await readFile(path, 'utf8')],
)));

// Pin the supplied project and installed URP/Core sources. This verifier is
// intentionally source-sensitive: changing the authoritative package or
// asset requires re-auditing the port rather than silently retaining results.
assert.equal(
  sha256(sourceContents.graphicsSettings),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.graphicsSettingsSha256,
  'GraphicsSettings source hash',
);
assert.equal(
  sha256(sourceContents.pipelineAsset),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.pipelineAssetSha256,
  'PC_RPAsset source hash',
);
assert.equal(
  sha256(sourceContents.qualitySettings),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.qualitySettingsSha256,
  'QualitySettings source hash',
);
assert.equal(
  sha256(sourceContents.scene),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.sceneSha256,
  'M_Demonstration_Mega source hash',
);
assert.equal(
  sha256(sourceContents.skyPrefab),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.skyPrefabSha256,
  'P_Sky source hash',
);
assert.equal(
  sha256(sourceContents.shadowSamplingTent),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowSamplingTentSha256,
  'Core ShadowSamplingTent source hash',
);
assert.equal(
  sha256(sourceContents.shadowCulling),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowCullingSha256,
  'URP ShadowCulling source hash',
);
assert.equal(
  sha256(sourceContents.shadowUtils),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowUtilsSha256,
  'URP ShadowUtils source hash',
);
assert.equal(
  sha256(sourceContents.shadowsHlsl),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.shadowsHlslSha256,
  'URP Shadows.hlsl source hash',
);
assert.equal(
  sha256(sourceContents.mainLightShadowCasterPass),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.mainLightShadowCasterPassSha256,
  'URP MainLightShadowCasterPass source hash',
);
assert.equal(
  sha256(sourceContents.universalRenderer),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.universalRendererSha256,
  'URP UniversalRenderer source hash',
);
assert.equal(
  sha256(sourceContents.universalPipeline),
  SO_STYLIZED_UNITY_SHADOW_SOURCE.universalPipelineSha256,
  'URP UniversalRenderPipeline source hash',
);

assert.match(
  sourceContents.pipelineAssetMeta,
  new RegExp(`guid: ${SO_STYLIZED_UNITY_SHADOW_SOURCE.pipelineAssetGuid}`),
);
assert.match(
  sourceContents.graphicsSettings,
  new RegExp(`m_CustomRenderPipeline:.*guid: ${SO_STYLIZED_UNITY_SHADOW_SOURCE.pipelineAssetGuid}`),
);
assert.match(sourceContents.qualitySettings, /m_CurrentQuality: 1/);
assert.match(
  sourceContents.qualitySettings,
  new RegExp(`name: PC[\\s\\S]*?customRenderPipeline:.*guid: ${SO_STYLIZED_UNITY_SHADOW_SOURCE.pipelineAssetGuid}`),
);
assert.match(
  sourceContents.skyPrefabMeta,
  new RegExp(`guid: ${SO_STYLIZED_UNITY_SHADOW_SOURCE.skyPrefabGuid}`),
);
assert.match(
  sourceContents.scene,
  new RegExp(`m_SourcePrefab:.*guid: ${SO_STYLIZED_UNITY_SHADOW_SOURCE.skyPrefabGuid}`),
);

// Serialized capture contract.
assert.match(sourceContents.pipelineAsset, /m_MainLightShadowmapResolution: 2048/);
assert.match(sourceContents.pipelineAsset, /m_ShadowDistance: 50/);
assert.match(sourceContents.pipelineAsset, /m_ShadowCascadeCount: 4/);
assert.match(
  sourceContents.pipelineAsset,
  /m_Cascade4Split: \{x: 0\.12299999, y: 0\.2926, z: 0\.53599995\}/,
);
assert.match(sourceContents.pipelineAsset, /m_CascadeBorder: 0\.107758604/);
assert.match(sourceContents.pipelineAsset, /m_ShadowDepthBias: 0\.1/);
assert.match(sourceContents.pipelineAsset, /m_ShadowNormalBias: 0\.5/);
assert.match(sourceContents.pipelineAsset, /m_SoftShadowQuality: 3/);
assert.match(sourceContents.skyPrefab, /m_Bias: 0\.92/);
assert.match(sourceContents.skyPrefab, /m_NormalBias: 0\.8/);
assert.match(sourceContents.skyPrefab, /m_UsePipelineSettings: 1/);
assert.match(sourceContents.skyPrefab, /m_SoftShadowQuality: 3/);

assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.atlasResolution, 2048);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeTileResolution, 1024);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeCount, 4);
assert.deepEqual(
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeSplits,
  [0.12299999, 0.2926, 0.53599995, 1],
);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.distance, 50);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.depthBufferBits, 16);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeBorder, 0.107758604);
assert.deepEqual(
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.effectiveBias,
  {
    depth: 0.1,
    normal: 0.5,
    reason: 'P_Sky UniversalAdditionalLightData.m_UsePipelineSettings == 1',
    source: 'PC_RPAsset.m_ShadowDepthBias / m_ShadowNormalBias',
  },
);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.depth, 0.92);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.normal, 0.8);
assert.equal(
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.bypassedAtRuntime,
  true,
);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter.quality, 3);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter.kernelRadius, 3.5);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter.comparisonSamples, 16);
assert.deepEqual(SO_STYLIZED_UNITY_SHADOW_CONTRACT.atlasGrid, [2, 2]);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeBlendCullingFactor, 1);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.conservativeEnclosingSphere, true);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.enclosingSphereIterations, 64);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.projectionGuardTexels, 10);
assert.deepEqual(
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.rasterDepthBias,
  {
    constant: 1,
    slopeScale: 2.5,
    source: 'ShadowUtils.RenderShadowSlice SetGlobalDepthBias(1.0f, 2.5f)',
  },
);

assert.equal(oracleCapture.schema, 'toonlab.unity-shadow-cascade-oracle-audit');
assert.equal(oracleCapture.unityVersion, SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.unityVersion);
assert.equal(oracleCapture.contract.enclosingSphereIterations, 64);
assert.deepEqual(
  oracleCapture.derivedCascadeViewDepths,
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.cascadeViewDepths,
);
assert.equal(
  oracleCapture.nativeCaptureRawSha256,
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.captureRawSha256,
);
assert.deepEqual(
  oracleCapture.cullingPlanesThree,
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.cascadeCullingPlanesThree,
);
assert.deepEqual(
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.cascadeCullingPlanesThree.map(
    (planes) => planes.length,
  ),
  [8, 8, 8, 8],
);

// Pin the URP branch that makes pipeline .1/.5 effective despite the values
// serialized on the Light component.
assert.match(
  sourceContents.universalPipeline,
  /if \(data && !data\.usePipelineSettings\)[\s\S]*?light\.shadowBias, light\.shadowNormalBias[\s\S]*?else[\s\S]*?urpAsset\.shadowDepthBias, urpAsset\.shadowNormalBias/,
);

// Pin directional bias scaling, High's 3.5-texel radius, and the exact vertex
// displacement performed by ApplyShadowBias().
assert.match(
  sourceContents.shadowUtils,
  /frustumSize = 2\.0f \/ lightProjectionMatrix\.m00/,
);
assert.match(sourceContents.shadowUtils, /float texelSize = frustumSize \/ shadowResolution/);
assert.match(
  sourceContents.shadowUtils,
  /float depthBias = -bias\[shadowLightIndex\]\.x \* texelSize/,
);
assert.match(
  sourceContents.shadowUtils,
  /float normalBias = -bias\[shadowLightIndex\]\.y \* texelSize/,
);
assert.match(
  sourceContents.shadowUtils,
  /case SoftShadowQuality\.High: kernelRadius = 3\.5f; break; \/\/ 7x7/,
);
assert.match(sourceContents.shadowUtils, /depthBias \*= kernelRadius/);
assert.match(sourceContents.shadowUtils, /normalBias \*= kernelRadius/);
assert.match(
  sourceContents.shadowsHlsl,
  /float invNdotL = 1\.0 - saturate\(dot\(lightDirection, normalWS\)\)/,
);
assert.match(
  sourceContents.shadowsHlsl,
  /positionWS = lightDirection \* _ShadowBias\.xxx \+ positionWS/,
);
assert.match(
  sourceContents.shadowsHlsl,
  /positionWS = normalWS \* scale\.xxx \+ positionWS/,
);

// Pin cascade selection, atlas placement, culling-volume handoff, and both
// fixed-function raster-bias values. These are renderer contracts rather than
// material-graph behavior.
assert.match(
  sourceContents.shadowsHlsl,
  /half4 weights = half4\(distances2 < _CascadeShadowSplitSphereRadii\)/,
);
assert.match(
  sourceContents.shadowsHlsl,
  /weights\.yzw = saturate\(weights\.yzw - weights\.xyz\)/,
);
assert.match(
  sourceContents.shadowUtils,
  /shadowSliceData\.offsetX = \(cascadeIndex % 2\) \* shadowResolution/,
);
assert.match(
  sourceContents.shadowUtils,
  /shadowSliceData\.offsetY = \(cascadeIndex \/ 2\) \* shadowResolution/,
);
assert.match(
  sourceContents.shadowUtils,
  /shadowSliceData\.splitData\.shadowCascadeBlendCullingFactor = 1\.0f/,
);
assert.match(sourceContents.shadowUtils, /SetGlobalDepthBias\(1\.0f, 2\.5f\)/);
assert.match(
  sourceContents.unitySetGlobalDepthBiasDocs,
  /negative value to draw geometry closer to the camera, or a positive value to draw geometry further away from the camera/,
  'Unity fixed raster-bias sign is camera-relative even when the platform uses reversed-Z',
);
assert.match(
  sourceContents.shadowUtils,
  /if \(SystemInfo\.usesReversedZBuffer\)[\s\S]*?proj\.m20 = -proj\.m20;[\s\S]*?proj\.m23 = -proj\.m23;/,
  'URP shadow receiver transform must retain Unity reversed-Z projection',
);
assert.match(
  sourceContents.shadowsHlsl,
  /#if UNITY_REVERSED_Z[\s\S]*?min\(positionCS\.z, positionCS\.w \* UNITY_NEAR_CLIP_VALUE\)/,
  'URP shadow caster near-plane clamp must retain its reversed-Z branch',
);
assert.match(
  sourceContents.universalRenderer,
  /cullingParameters\.conservativeEnclosingSphere = UniversalRenderPipeline\.asset\.conservativeEnclosingSphere/,
);
assert.match(
  sourceContents.universalRenderer,
  /cullingParameters\.numIterationsEnclosingSphere = UniversalRenderPipeline\.asset\.numIterationsEnclosingSphere/,
);
assert.match(
  sourceContents.shadowCulling,
  /splitBuffer\[splitBufferOffset \+ i\] = slice\.splitData/,
);
assert.match(sourceContents.mainLightShadowCasterPass, /k_ShadowmapBufferBits = 16/);

// Pin the High filter dispatch and all 16 comparison taps.
const highFilterStart = sourceContents.shadowsHlsl.indexOf(
  'real SampleShadowmapFilteredHighQuality',
);
const highFilterEnd = sourceContents.shadowsHlsl.indexOf(
  'real SampleShadowmapFiltered(',
  highFilterStart,
);
assert(highFilterStart >= 0 && highFilterEnd > highFilterStart);
const highFilterSource = sourceContents.shadowsHlsl.slice(highFilterStart, highFilterEnd);
assert.match(
  highFilterSource,
  /SampleShadow_ComputeSamples_Tent_Filter_7x7\(float, samplingData\.shadowmapSize/,
);
const highComparisonIndices = [...highFilterSource.matchAll(/fetchesUV\[(\d+)\]\.xy/g)]
  .map((match) => Number(match[1]));
assert.deepEqual(highComparisonIndices, Array.from({ length: 16 }, (_, index) => index));
assert.match(
  sourceContents.shadowSamplingTent,
  /0\.081632 \* \(computedArea_From3texelTriangle\.x\)/,
);
assert.match(
  sourceContents.shadowSamplingTent,
  /Tent base is 7x7 base thus covering from 49 to 64 texels, thus we need 16 bilinear PCF fetches/,
);
for (let index = 0; index < 16; index += 1) {
  assert.match(
    sourceContents.shadowSamplingTent,
    new RegExp(`\\(fetchesUV\\)\\[${index}\\]`),
    `Core tent fetch ${index}`,
  );
}

// Atlas layout mirrors ShadowUtils.GetMaxTileResolutionInAtlas().
assert.equal(computeSoStylizedUnityCascadeTileResolution(2048, 2048, 4), 1024);
assert.equal(computeSoStylizedUnityCascadeTileResolution(2048, 2048, 1), 2048);
assert.equal(computeSoStylizedUnityCascadeTileResolution(2048, 1024, 4), 512);

const atlasOffsets = [
  [0, 0],
  [1024, 0],
  [0, 1024],
  [1024, 1024],
];
for (let index = 0; index < 4; index += 1) {
  const slice = computeSoStylizedUnityCascadeAtlasSlice(index);
  assert.deepEqual([slice.offsetX, slice.offsetY], atlasOffsets[index]);
  close(slice.normalizedScale, 0.5, 0, `cascade ${index} atlas scale`);
  const localUv = [0.3125, 0.6875];
  const atlasUv = transformSoStylizedUnityCascadeUvToAtlas(index, localUv);
  close(
    atlasUv[0] * 2048 - slice.offsetX,
    localUv[0] * 1024,
    0,
    `cascade ${index} atlas U texel equivalence`,
  );
  close(
    atlasUv[1] * 2048 - slice.offsetY,
    localUv[1] * 1024,
    0,
    `cascade ${index} atlas V texel equivalence`,
  );
}

const firstProjectionBounds = computeSoStylizedUnityCascadeProjectionBounds(
  oracleCapture.algorithmCheckpoints.iterations64[0].radius,
);
close(
  firstProjectionBounds.halfExtent,
  oracleCapture.projection[0].halfExtent,
  4e-7,
  'native ten-texel projection guard',
);
close(
  1 / oracleCapture.projection[0].m00
    / oracleCapture.algorithmCheckpoints.iterations64[0].radius,
  1 + 10 / 1024,
  1e-7,
  'native projection guard ratio',
);

// Recreate native GetFrustumPoints order and prove the recovered float32
// conservative-sphere algorithm at three iteration counts. The tiny tolerance
// covers Unity's float projection inversion before the same native fitter.
const tanHalfFovY = Math.fround(Math.tan(Math.PI / 6));
const tanHalfFovX = Math.fround(
  tanHalfFovY * Math.fround(SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.camera.aspect),
);
const makeUnityFrustumPlane = (depth) => [
  [-tanHalfFovX * depth, -tanHalfFovY * depth, -depth],
  [tanHalfFovX * depth, -tanHalfFovY * depth, -depth],
  [tanHalfFovX * depth, tanHalfFovY * depth, -depth],
  [-tanHalfFovX * depth, tanHalfFovY * depth, -depth],
];
for (const iterations of [0, 8, 64]) {
  const checkpoint = oracleCapture.algorithmCheckpoints[`iterations${iterations}`];
  for (let index = 0; index < 4; index += 1) {
    const [near, far] = oracleCapture.derivedCascadeViewDepths[index];
    const fit = computeSoStylizedUnityConservativeCascadeSphere([
      ...makeUnityFrustumPlane(near),
      ...makeUnityFrustumPlane(far),
    ], iterations);
    for (let channel = 0; channel < 3; channel += 1) {
      close(
        fit.center.getComponent(channel),
        checkpoint[index].centerView[channel],
        4e-5,
        `cascade ${index} iterations ${iterations} center ${channel}`,
      );
    }
    close(
      fit.radius,
      checkpoint[index].radius,
      4e-5,
      `cascade ${index} iterations ${iterations} radius`,
    );
  }
}

const selectionSpheres = [
  { center: [0, 0, 0], radius: 2 },
  { center: [0, 0, 0], radius: 4 },
  { center: [0, 0, 0], radius: 8 },
  { center: [0, 0, 0], radius: 16 },
];
assert.equal(selectSoStylizedUnityCascadeIndex([1, 0, 0], selectionSpheres), 0);
assert.equal(selectSoStylizedUnityCascadeIndex([3, 0, 0], selectionSpheres), 1);
assert.equal(selectSoStylizedUnityCascadeIndex([5, 0, 0], selectionSpheres), 2);
assert.equal(selectSoStylizedUnityCascadeIndex([10, 0, 0], selectionSpheres), 3);
assert.equal(selectSoStylizedUnityCascadeIndex([20, 0, 0], selectionSpheres), 4);

for (let index = 0; index < 4; index += 1) {
  const centerUnity = oracleCapture.algorithmCheckpoints.iterations64[index]
    .centerUnity;
  const centerThree = [centerUnity[0], centerUnity[1], -centerUnity[2]];
  const planes = SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE
    .cascadeCullingPlanesThree[index];
  assert.equal(
    intersectsSoStylizedUnityCascadeCullingPlanes(
      centerThree,
      [0, 0, 0],
      planes,
    ),
    true,
    `cascade ${index} culling-sphere center is inside all native planes`,
  );
  const [nx, ny, nz, distance] = planes[0];
  assert.equal(
    intersectsSoStylizedUnityCascadeCullingPlanes(
      [
        -nx * (distance + 100),
        -ny * (distance + 100),
        -nz * (distance + 100),
      ],
      [1, 1, 1],
      planes,
    ),
    false,
    `cascade ${index} outside AABB is rejected by native planes`,
  );
}
assert.throws(
  () => intersectsSoStylizedUnityCascadeCullingPlanes([0, 0, 0], [1, 1, 1], []),
  /At least one four-channel culling plane/,
);

const effectiveBias = computeSoStylizedUnityDirectionalShadowBias({
  frustumSize: 20,
});
close(effectiveBias.texelSize, 20 / 1024, 0, 'bias texel size');
close(effectiveBias.depthBias, -0.0068359375, 0, 'effective depth bias');
close(effectiveBias.normalBias, -0.0341796875, 0, 'effective normal bias');
close(effectiveBias.kernelRadius, 3.5, 0, 'High kernel radius');

const serializedBias = computeSoStylizedUnityDirectionalShadowBias({
  depthBias: SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.depth,
  frustumSize: 20,
  normalBias: SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.normal,
});
close(serializedBias.depthBias, -0.062890625, 0, 'bypassed light depth bias');
close(serializedBias.normalBias, -0.0546875, 0, 'bypassed light normal bias');
assert.throws(
  () => computeSoStylizedUnityDirectionalShadowBias({ frustumSize: 0 }),
  /positive directional shadow frustumSize/,
);

const facingPosition = applySoStylizedUnityDirectionalShadowBiasCpu(
  [1, 2, 3],
  [0, 1, 0],
  [0, 1, 0],
  effectiveBias,
);
assert.deepEqual(facingPosition, [1, 2 + effectiveBias.depthBias, 3]);
const grazingPosition = applySoStylizedUnityDirectionalShadowBiasCpu(
  [1, 2, 3],
  [1, 0, 0],
  [0, 1, 0],
  effectiveBias,
);
assert.deepEqual(grazingPosition, [
  1 + effectiveBias.normalBias,
  2 + effectiveBias.depthBias,
  3,
]);

const fade = computeSoStylizedUnityShadowFadeParameters();
close(fade.distanceSquared, 2500, 0, 'shadow distance squared');
close(
  fade.fadeStartDistance,
  (1 - SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeBorder) * 50,
  1e-12,
  'shadow fade start',
);
close(evaluateSoStylizedUnityShadowDistanceFade(fade.fadeStartDistance, fade), 0, 1e-12);
close(evaluateSoStylizedUnityShadowDistanceFade(50, fade), 1, 1e-12);
const halfFadeDistance = Math.sqrt((0.5 - fade.bias) / fade.scale);
close(evaluateSoStylizedUnityShadowDistanceFade(halfFadeDistance, fade), 0.5, 1e-12);

// At an exact texel center the source's four separable bilinear fetch weights
// are symmetric. Its literal .081632 intentionally sums to .999992 per axis,
// rather than silently renormalizing to one.
const centerFetches = computeSoStylizedUnityTent7x7Fetches(
  [0.5, 0.5],
  [1024, 1024],
);
assert.equal(centerFetches.fetchesUv.length, 16);
assert.equal(centerFetches.fetchesWeights.length, 16);
assert.deepEqual(centerFetches.centerTexel, [512, 512]);
assert.deepEqual(centerFetches.offsetFromTentCenter, [0, 0]);
const axisWeights = [0.091836, 0.40815999999999997, 0.40815999999999997, 0.091836];
for (let y = 0; y < 4; y += 1) {
  for (let x = 0; x < 4; x += 1) {
    close(
      centerFetches.fetchesWeights[y * 4 + x],
      axisWeights[x] * axisWeights[y],
      1e-16,
      `tent weight ${x},${y}`,
    );
  }
}
close(
  evaluateSoStylizedUnityTent7x7(Array(16).fill(1), centerFetches),
  0.999984000064,
  2e-16,
  'source literal all-visible weight',
);
close(
  evaluateSoStylizedUnityTent7x7(
    [1, ...Array(15).fill(0)],
    centerFetches,
  ),
  axisWeights[0] ** 2,
  1e-16,
  'first comparison weight',
);
assert.throws(
  () => evaluateSoStylizedUnityTent7x7([1]),
  /requires 16 comparison samples/,
);

// Three bridge wiring: custom filter, neutral receiver bias, exact cascade
// tile size, and source caster displacement through castShadowPositionNode.
const light = new THREE.DirectionalLight();
applySoStylizedUnityShadowContract(light.shadow);
assert.deepEqual(light.shadow.mapSize.toArray(), [1024, 1024]);
assert.equal(light.shadow.bias, 0);
assert.equal(light.shadow.normalBias, 0);
assert.equal(light.shadow.filterNode, SoStylizedUnityTent7x7ShadowFilter);
assert.deepEqual(
  light.shadow._soStylizedUnitySamplingMapSize.toArray(),
  [1024, 1024],
);
assert.equal(light.shadow.soStylizedUnity.exactFilter, true);
const rasterMaterial = applySoStylizedUnityRasterDepthBias(light);
assert.equal(rasterMaterial.polygonOffset, true);
assert.equal(rasterMaterial.polygonOffsetUnits, -1);
assert.equal(rasterMaterial.polygonOffsetFactor, -2.5);
assert.equal(
  rasterMaterial.userData.soStylizedUnityRasterDepthBias.exactWebGpuMapping,
  true,
);
assert.equal(
  rasterMaterial.userData.soStylizedUnityRasterDepthBias.reversedDepthBuffer,
  true,
);
assert.deepEqual(
  resolveSoStylizedUnityWebGpuRasterDepthBias({ reversedDepthBuffer: true }),
  {
    constant: -1,
    reversedDepthBuffer: true,
    slopeScale: -2.5,
    sourceConstant: 1,
    sourceSlopeScale: 2.5,
    translation:
      'Unity camera-relative farther bias -> WebGPU encoded-depth additive bias',
  },
);
assert.deepEqual(
  resolveSoStylizedUnityWebGpuRasterDepthBias({ reversedDepthBuffer: false }),
  {
    constant: 1,
    reversedDepthBuffer: false,
    slopeScale: 2.5,
    sourceConstant: 1,
    sourceSlopeScale: 2.5,
    translation:
      'Unity camera-relative farther bias -> WebGPU encoded-depth additive bias',
  },
);

const rendererBridge = { shadowMap: { enabled: false, type: null } };
configureSoStylizedUnityShadowRenderer(rendererBridge);
assert.equal(rendererBridge.shadowMap.enabled, true);
assert.equal(rendererBridge.shadowMap.type, THREE.PCFSoftShadowMap);

const material = new MeshPhysicalNodeMaterial();
material.positionNode = positionLocal.add(vec3(0, 0.25, 0));
installSoStylizedUnityShadowCasterBias(material, {
  directionToLight: [0, 1, 0],
});
assert.equal(material.castShadowPositionNode?.isNode, true);
assert.equal(
  material.userData.soStylizedUnityShadowCaster.preservedPositionSource,
  'positionNode',
);
assert.deepEqual(
  material.userData.soStylizedUnityShadowCaster.appliedBias,
  { depth: 0.1, normal: 0.5 },
);
assert.equal(
  material.userData.soStylizedUnityShadowCaster.serializedLightBias.bypassedAtRuntime,
  true,
);
assert.throws(
  () => installSoStylizedUnityShadowCasterBias(new MeshPhysicalNodeMaterial()),
  /explicit Three-space directionToLight/,
);

// The CSM subclass applies the filter after Three lazily clones LightShadow;
// LightShadow.copy() does not copy the nonstandard filterNode field.
const csmScene = new THREE.Scene();
const csmLight = new THREE.DirectionalLight();
const sourceRay = new THREE.Vector3(
  ...SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.lightRayDirectionThree,
);
csmLight.position.copy(sourceRay).multiplyScalar(-250);
csmLight.target.position.set(0, 0, 0);
csmScene.add(csmLight, csmLight.target);
const csm = createSoStylizedUnityCsmShadowNode(csmLight);
assert.equal(csm.cascades, 4);
assert.equal(csm.maxFar, 50);
assert.equal(csm.mode, 'custom');
assert.equal(csm.fade, false);
const camera = new THREE.PerspectiveCamera(
  60,
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.camera.aspect,
  1,
  500000,
);
camera.position.fromArray(SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.camera.positionThree);
camera.quaternion.fromArray(
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE.camera.quaternionThree,
);
camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
camera._reversedDepth = true;
camera.updateProjectionMatrix();
csmScene.add(camera);
csmScene.updateMatrixWorld(true);
csm._init({
  camera,
  renderer: {
    coordinateSystem: THREE.WebGPUCoordinateSystem,
    reversedDepthBuffer: true,
  },
});
assert.equal(
  csm._unityNativeFrameExact,
  true,
  'CSM init must prime the shipped source pose before the first child shadow pass',
);
assert.deepEqual(csm.breaks, [0.12299999, 0.2926, 0.53599995, 1]);
assert.equal(csm.lights.length, 4);
assert.equal(csm._shadowNodes.length, 4);
assert.equal(
  csm.lights.every((cascadeLight) => (
    cascadeLight.shadow.camera.coordinateSystem === THREE.WebGPUCoordinateSystem
    && cascadeLight.shadow.camera.reversedDepth === true
  )),
  true,
  'cascade cameras must use renderer reversed-Z before the first shadow matrix update',
);
assert.equal(
  csm._shadowNodes.every(
    (node) => node instanceof SoStylizedUnityCascadeAtlasShadowNode,
  ),
  true,
);
const preAllocationDiagnostics = snapshotSoStylizedUnityShadowDiagnostics(csm);
assert.equal(preAllocationDiagnostics.sharedAtlas, true);
assert.equal(preAllocationDiagnostics.atlasAllocated, false);
assert.equal(preAllocationDiagnostics.depthBufferBits, 16);
csm.updateBefore({});
csmScene.updateMatrixWorld(true);
assert.equal(csm._unityProjectionSourceExact, true);
assert.equal(csm._unityNativeFrameExact, true);
camera.setViewOffset(1920, 1080, 0.25, -1 / 6, 1920, 1080);
csm.updateBefore({});
assert.equal(
  csm._unityNativeFrameExact,
  true,
  'full-frame Unity TAA jitter must retain the non-jittered native shadow oracle',
);
camera.clearViewOffset();
csm.updateBefore({});
assert.equal(
  csm._unityNativeFrameExact,
  true,
  'Three clearViewOffset leaves a disabled record that must remain source exact',
);
assert.equal(
  csm.userData.soStylizedUnity.currentFrame.exactSphereReceiverSelection,
  true,
);
const reversedDepthEvidence = [];
for (let index = 0; index < csm.lights.length; index += 1) {
  const cascadeLight = csm.lights[index];
  assert.deepEqual(cascadeLight.shadow.mapSize.toArray(), [1024, 1024]);
  assert.equal(cascadeLight.shadow.bias, 0);
  assert.equal(cascadeLight.shadow.normalBias, 0);
  assert.equal(cascadeLight.shadow.filterNode, SoStylizedUnityTent7x7ShadowFilter);
  assert.deepEqual(
    cascadeLight.shadow._soStylizedUnitySamplingMapSize.toArray(),
    [2048, 2048],
  );
  assert.equal(cascadeLight.shadow.soStylizedUnity.exactSharedAtlas, true);
  assert.equal(
    cascadeLight.shadow.soStylizedUnity.atlasSlice.index,
    index,
  );
  const nativeSphere = SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE
    .cascadeViewSpheres[index];
  close(csm._unityCascadeFits[index].radius, nativeSphere.radius, 0);
  assert.deepEqual(
    csm._unityCascadeFits[index].center.toArray(),
    nativeSphere.center,
  );
  close(
    cascadeLight.shadow.camera.right,
    oracleCapture.projection[index].halfExtent,
    0,
    `cascade ${index} native half extent`,
  );
  close(
    cascadeLight.shadow.camera.far,
    oracleCapture.projection[index].far - oracleCapture.projection[index].near,
    1e-12,
    `cascade ${index} native caster depth span`,
  );

  cascadeLight.shadow.camera.coordinateSystem = THREE.WebGPUCoordinateSystem;
  cascadeLight.shadow.camera.updateProjectionMatrix();
  cascadeLight.shadow.updateMatrices(cascadeLight);
  const centerWorld = new THREE.Vector3(...nativeSphere.center)
    .applyMatrix4(camera.matrixWorld);
  const centerView = centerWorld.clone()
    .applyMatrix4(cascadeLight.shadow.camera.matrixWorldInverse);
  close(
    centerView.x,
    oracleCapture.projection[index].sphereViewXY[0],
    5e-12,
    `cascade ${index} stabilized sphere X`,
  );
  close(
    centerView.y,
    oracleCapture.projection[index].sphereViewXY[1],
    5e-12,
    `cascade ${index} stabilized sphere Y`,
  );
  close(
    -centerView.z,
    oracleCapture.projection[index].depthFromNear,
    5e-12,
    `cascade ${index} sphere depth from near plane`,
  );
  const depthSpan = cascadeLight.shadow.camera.far
    - cascadeLight.shadow.camera.near;
  const projectedCenter = new THREE.Vector4(...centerWorld.toArray(), 1)
    .applyMatrix4(cascadeLight.shadow.matrix);
  const receiverReferenceDepth = projectedCenter.z / projectedCenter.w;
  const expectedReceiverDepth = 1
    - oracleCapture.projection[index].depthFromNear / depthSpan;
  close(
    receiverReferenceDepth,
    expectedReceiverDepth,
    2e-12,
    `cascade ${index} reversed receiver reference`,
  );

  // Use a normal facing the light so this checkpoint isolates the source
  // depth-bias term from the separate normal-bias term.
  const directionToLight = sourceRay.clone().negate().toArray();
  const vertexBias = computeSoStylizedUnityDirectionalShadowBias({
    frustumSize: oracleCapture.projection[index].halfExtent * 2,
  });
  const biasedCasterWorld = applySoStylizedUnityDirectionalShadowBiasCpu(
    centerWorld.toArray(),
    directionToLight,
    directionToLight,
    vertexBias,
  );
  const projectedBiasedCaster = new THREE.Vector4(...biasedCasterWorld, 1)
    .applyMatrix4(cascadeLight.shadow.matrix);
  const casterDepthAfterVertexBias = projectedBiasedCaster.z
    / projectedBiasedCaster.w;
  close(
    casterDepthAfterVertexBias,
    receiverReferenceDepth + vertexBias.depthBias / depthSpan,
    2e-12,
    `cascade ${index} reversed caster vertex-bias depth`,
  );
  assert(
    casterDepthAfterVertexBias < receiverReferenceDepth,
    `cascade ${index} Unity farther caster bias must reduce reversed depth`,
  );
  assert(
    receiverReferenceDepth >= casterDepthAfterVertexBias,
    `cascade ${index} GreaterEqual receiver comparison must remain lit`,
  );

  const cascadeRasterMaterial = applySoStylizedUnityRasterDepthBias(
    cascadeLight,
    { reversedDepthBuffer: true },
  );
  assert.equal(cascadeRasterMaterial.polygonOffsetUnits, -1);
  assert.equal(cascadeRasterMaterial.polygonOffsetFactor, -2.5);
  const oneDepth16Unit = 1 / 65535;
  const flatCasterDepthAfterRasterBias = casterDepthAfterVertexBias
    + cascadeRasterMaterial.polygonOffsetUnits * oneDepth16Unit;
  const wrongUntranslatedDepth = casterDepthAfterVertexBias + oneDepth16Unit;
  assert(
    flatCasterDepthAfterRasterBias < casterDepthAfterVertexBias
      && casterDepthAfterVertexBias < wrongUntranslatedDepth,
    `cascade ${index} reversed fixed bias must move stored depth farther, not closer`,
  );
  reversedDepthEvidence.push(Object.freeze({
    cascadeIndex: index,
    casterDepthAfterVertexBias,
    flatCasterDepthAfterRasterBias,
    receiverReferenceDepth,
    wrongUntranslatedDepth,
  }));
}

const atlasBuilder = {
  createRenderTarget: (width, height) => new THREE.RenderTarget(width, height),
  renderer: { reversedDepthBuffer: true },
};
const firstAtlasTarget = csm._shadowNodes[0].setupRenderTarget(
  csm.lights[0].shadow,
  atlasBuilder,
);
const fourthAtlasTarget = csm._shadowNodes[3].setupRenderTarget(
  csm.lights[3].shadow,
  atlasBuilder,
);
assert.equal(firstAtlasTarget.shadowMap, fourthAtlasTarget.shadowMap);
assert.equal(firstAtlasTarget.depthTexture, fourthAtlasTarget.depthTexture);
assert.equal(firstAtlasTarget.shadowMap.width, 2048);
assert.equal(firstAtlasTarget.shadowMap.height, 2048);
assert.equal(firstAtlasTarget.depthTexture.type, THREE.UnsignedShortType);
assert.equal(firstAtlasTarget.depthTexture.compareFunction, THREE.GreaterEqualCompare);
const allocatedDiagnostics = snapshotSoStylizedUnityShadowDiagnostics(csm);
assert.equal(allocatedDiagnostics.atlasAllocated, true);
assert.equal(
  allocatedDiagnostics.depthTextureType,
  'UnsignedShortType / depth16unorm',
);

const cascadeZeroCenterUnity = oracleCapture.algorithmCheckpoints.iterations64[0]
  .centerUnity;
const cascadeZeroCenterThree = [
  cascadeZeroCenterUnity[0],
  cascadeZeroCenterUnity[1],
  -cascadeZeroCenterUnity[2],
];
const cascadeZeroPlane = SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE
  .cascadeCullingPlanesThree[0][0];
const insideCaster = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial(),
);
insideCaster.name = 'InsideSourceRenderer';
insideCaster.castShadow = true;
insideCaster.userData.soStylizedUnityRenderer = {
  sourceBoundsCenter: cascadeZeroCenterThree,
  sourceBoundsSize: [1, 1, 1],
};
const outsideCaster = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial(),
);
outsideCaster.name = 'OutsideSourceRenderer';
outsideCaster.castShadow = true;
outsideCaster.userData.soStylizedUnityRenderer = {
  sourceBoundsCenter: [
    -cascadeZeroPlane[0] * (cascadeZeroPlane[3] + 100),
    -cascadeZeroPlane[1] * (cascadeZeroPlane[3] + 100),
    -cascadeZeroPlane[2] * (cascadeZeroPlane[3] + 100),
  ],
  sourceBoundsSize: [1, 1, 1],
};
csmScene.add(insideCaster, outsideCaster);
csmScene.updateMatrixWorld(true);
const renderedShadowObjects = [];
const shadowRenderStates = [];
const fakeShadowRenderer = {
  autoClear: false,
  autoClearDepth: false,
  currentRenderObjectFunction: (object) => renderedShadowObjects.push(object),
  getRenderObjectFunction() {
    return this.currentRenderObjectFunction;
  },
  getScissorTest() {
    return this.scissorTest === true;
  },
  render(renderScene) {
    shadowRenderStates.push({
      autoClear: this.autoClear,
      autoClearDepth: this.autoClearDepth,
      scissorTest: this.scissorTest,
    });
    renderScene.traverse((object) => {
      if (object.isMesh) this.currentRenderObjectFunction(object);
    });
  },
  scissorTest: false,
  setRenderObjectFunction(callback) {
    this.currentRenderObjectFunction = callback;
  },
  setScissorTest(value) {
    this.scissorTest = value;
  },
};
csm._shadowNodes[0].renderShadow({
  renderer: fakeShadowRenderer,
  scene: csmScene,
});
assert.deepEqual(shadowRenderStates, [{
  autoClear: true,
  autoClearDepth: true,
  scissorTest: true,
}]);
assert.deepEqual(renderedShadowObjects, [insideCaster]);
assert.equal(fakeShadowRenderer.autoClear, false);
assert.equal(fakeShadowRenderer.autoClearDepth, false);
assert.equal(fakeShadowRenderer.scissorTest, false);
assert.equal(insideCaster.frustumCulled, true);
assert.equal(outsideCaster.frustumCulled, true);
const renderedDiagnostics = snapshotSoStylizedUnityShadowDiagnostics(csm);
assert.equal(renderedDiagnostics.cascades[0].candidateCasterObjectCount, 2);
assert.equal(renderedDiagnostics.cascades[0].exactSourceBoundsCount, 2);
assert.equal(renderedDiagnostics.cascades[0].rejectedCasterObjectCount, 1);
assert.equal(renderedDiagnostics.cascades[0].renderedCasterObjectCount, 1);
assert.deepEqual(renderedDiagnostics.cascades[0].sourceCategories, [{
  candidateObjectCount: 2,
  category: 'scene-renderer',
  exactSourceBoundsCount: 2,
  fallbackBoundsCount: 0,
  rejectedObjectCount: 1,
  renderedInstanceCount: 1,
  renderedObjectCount: 1,
  renderedObjectNames: ['InsideSourceRenderer'],
}]);
const terrainTreeWrapper = new THREE.Group();
terrainTreeWrapper.userData.soStylizedUnityTerrainTree = { instanceIndex: 0 };
terrainTreeWrapper.add(new THREE.Mesh());
assert.equal(
  classifySoStylizedUnityShadowCaster(terrainTreeWrapper.children[0]),
  'terrain-tree',
  'Terrain tree caster source identity must resolve through its cloned prefab wrapper',
);
assert.equal(renderedDiagnostics.phase, 'rendering');
for (let index = 1; index < csm._shadowNodes.length; index += 1) {
  csm._shadowNodes[index].renderShadow({
    renderer: fakeShadowRenderer,
    scene: csmScene,
  });
}
const completedAtlasDiagnostics = snapshotSoStylizedUnityShadowDiagnostics(csm);
assert.equal(completedAtlasDiagnostics.phase, 'rendered');
assert.deepEqual(
  completedAtlasDiagnostics.cascades.map((cascade) => cascade.phase),
  ['rendered', 'rendered', 'rendered', 'rendered'],
);

for (let index = 0; index < csm._unityCascadeViewDepths.length; index += 1) {
  close(
    csm._unityCascadeViewDepths[index].x,
    oracleCapture.derivedCascadeViewDepths[index][0],
    3e-5,
    `cascade ${index} near split depth`,
  );
  close(
    csm._unityCascadeViewDepths[index].y,
    oracleCapture.derivedCascadeViewDepths[index][1],
    3e-5,
    `cascade ${index} far split depth`,
  );
}
assert.equal(
  csm.userData.soStylizedUnity.remainingRendererBridges.some(
    (entry) => entry.includes('selects depth-split frusta'),
  ),
  false,
);
assert.equal(
  csm.userData.soStylizedUnity.remainingRendererBridges.some(
    (entry) => entry.includes('standalone 1024px maps'),
  ),
  false,
);

const threeRendererSource = await readFile(
  new URL('../node_modules/three/src/renderers/common/Renderer.js', import.meta.url),
  'utf8',
);
assert.match(
  threeRendererSource,
  /material\.castShadowPositionNode && material\.castShadowPositionNode\.isNode/,
  'installed Three must expose castShadowPositionNode to its shadow pass',
);
assert.match(
  threeRendererSource,
  /return \( this\.reversedDepthBuffer === true \) \? 1 - this\._clearDepth : this\._clearDepth/,
  'reversed WebGPU depth clear must be zero rather than one',
);
assert.match(
  threeRendererSource,
  /if \( this\.reversedDepthBuffer === true && camera\.reversedDepth !== true \)[\s\S]*?camera\._reversedDepth = true;[\s\S]*?camera\.updateProjectionMatrix\(\)/,
  'renderer must reverse the camera projection before raster submission',
);
const threeShadowNodeSource = await readFile(
  new URL('../node_modules/three/src/nodes/lighting/ShadowNode.js', import.meta.url),
  'utf8',
);
assert.match(
  threeShadowNodeSource,
  /depthTexture\.compareFunction = builder\.renderer\.reversedDepthBuffer \? GreaterEqualCompare : LessEqualCompare/,
  'reversed receiver samples must use GreaterEqual comparison',
);
assert.match(
  threeShadowNodeSource,
  /renderer\.reversedDepthBuffer \? coordZ\.sub\( bias \) : coordZ\.add\( bias \)/,
  'Three receiver bias sign must follow its encoded depth convention',
);
assert.match(
  threeShadowNodeSource,
  /shadow\.updateMatrices\( light \);[\s\S]*?renderer\.render\( scene, shadow\.camera \);/,
  'receiver matrix is built before Renderer primes a shadow camera',
);
const threeWebGpuPipelineSource = await readFile(
  new URL(
    '../node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js',
    import.meta.url,
  ),
  'utf8',
);
assert.match(
  threeWebGpuPipelineSource,
  /depthStencil\.depthBias = material\.polygonOffsetUnits/,
  'WebGPU raster constant-bias mapping',
);
assert.match(
  threeWebGpuPipelineSource,
  /depthStencil\.depthBiasSlopeScale = material\.polygonOffsetFactor/,
  'WebGPU raster slope-bias mapping',
);
assert.doesNotMatch(
  threeWebGpuPipelineSource,
  /reversedDepthBuffer[^\n]*polygonOffset|polygonOffset[^\n]*reversedDepthBuffer/,
  'Three forwards polygon offset without the camera-relative reversed-Z sign translation Unity requires',
);

console.log('So Stylized Unity URP shadow source verification passed.');
console.log('Capture: 4 cascades / 50m / 2048 atlas / 1024 cascade tile.');
console.log('Bias: .92/.8 serialized on P_Sky, correctly bypassed for PC_RPAsset .1/.5.');
console.log('Filter: exact High 7x7 tent reduction with 16 bilinear comparison samples.');
console.log('Runtime: conservative 64-iteration spheres, sphere receiver selection, guarded projection and native source-frame depth placement wired.');
console.log('Raster: caster-space bias plus Unity +1/+2.5 translated to WebGPU reversed-Z -1/-2.5; exact High filter and squared-distance final fade wired.');
console.log(`Reversed depth: ${JSON.stringify(reversedDepthEvidence)}`);
console.log('Atlas: one shared 2048² depth16 target, four scissored 1024² tiles, and atlas-space High-filter sampling wired.');
console.log('Culling: all 32 native SplitData planes wired; exported Renderer.bounds exact, generated aggregate-mesh bounds conservative.');
console.log('Remaining bridge: arbitrary non-source camera/light poses and generated Terrain/detail aggregate primitive topology.');
