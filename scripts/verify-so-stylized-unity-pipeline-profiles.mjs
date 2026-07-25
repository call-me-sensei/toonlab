#!/usr/bin/env node

// Deterministic, source-only gate for the two Unity renderer profiles. The
// checked evidence always gates the public module. When the supplied Unity
// project is available, every serialized field, GUID and source-file hash is
// independently re-read from that project as well.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE,
  SO_STYLIZED_UNITY_DOCUMENTED_PIPELINE_PROFILE,
  SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS,
  SO_STYLIZED_UNITY_PIPELINE_PROFILES,
  SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA,
  SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA_VERSION,
  getSoStylizedUnityPipelineProfile,
} from '../src/environment/soStylizedUnityPipelineProfiles.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const EVIDENCE_PATH = path.join(
  PACKAGE_ROOT,
  'docs/source-shader-audits/unity-pipeline-profile-evidence.json',
);
const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));

const enumName = (table, value, label) => {
  assert.ok(Object.hasOwn(table, value), `${label} has unknown serialized value ${value}`);
  return table[value];
};

const AO_METHODS = { 0: 'BlueNoise', 1: 'InterleavedGradient' };
const AO_SAMPLES = {
  0: { name: 'High', count: 12 },
  1: { name: 'Medium', count: 8 },
  2: { name: 'Low', count: 4 },
};
const NORMAL_SAMPLES = { 0: 'Low', 1: 'Medium', 2: 'High' };
const BLUR_QUALITY = { 0: 'High', 1: 'Medium', 2: 'Low' };
const DEPTH_SOURCE = { 0: 'Depth', 1: 'DepthNormals' };
const COLOR_GRADING = { 0: 'LowDynamicRange', 1: 'HighDynamicRange' };
const RENDERING_MODE = { 0: 'Forward', 1: 'Deferred', 2: 'ForwardPlus', 3: 'DeferredPlus' };
const SOFT_SHADOW_QUALITY = { 0: 'UsePipelineSettings', 1: 'Low', 2: 'Medium', 3: 'High' };

function deriveProfile(record) {
  const pipeline = record.pipelineAsset.serialized;
  const renderer = record.rendererAsset.serialized;
  const ao = record.rendererAsset.ambientOcclusion;
  const samples = AO_SAMPLES[ao.Samples];
  assert.ok(samples, `Unknown AO Samples value ${ao.Samples}`);
  const isCurrent = record.id === SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.currentSample;
  const projectSelection = evidence.project.currentSelection;
  const aoMethod = enumName(AO_METHODS, ao.AOMethod, 'AOMethod');
  const radiusMultiplier = aoMethod === 'BlueNoise' ? 1.5 : 1;

  return {
    schema: SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA,
    schemaVersion: SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA_VERSION,
    id: record.id,
    label: record.label,
    classification: record.classification,
    source: {
      unityVersion: evidence.project.unityVersion,
      unityRevision: evidence.project.unityRevision,
      urpVersion: evidence.project.urpVersion,
      qualitySettings: {
        path: evidence.project.artifacts.qualitySettings.path,
        sha256: evidence.project.artifacts.qualitySettings.sha256,
      },
      guide: {
        url: evidence.guide.url,
        headingId: evidence.guide.headingId,
        recommendation: evidence.guide.recommendation,
      },
      selection: isCurrent
        ? {
          graphicsSettingsGuid: projectSelection.graphicsSettingsPipelineGuid,
          currentQualityIndex: projectSelection.qualityIndex,
          currentQualityName: projectSelection.qualityName,
          qualityPipelineGuid: projectSelection.qualityPipelineGuid,
        }
        : {
          graphicsSettingsGuid: null,
          currentQualityIndex: null,
          currentQualityName: null,
          qualityPipelineGuid: null,
          guideRecommendsEveryQualityTier: true,
        },
      pipelineAsset: {
        name: record.pipelineAsset.name,
        path: record.pipelineAsset.path,
        guid: record.pipelineAsset.guid,
        sha256: record.pipelineAsset.sha256,
        metaSha256: record.pipelineAsset.metaSha256,
      },
      rendererAsset: {
        name: record.rendererAsset.name,
        path: record.rendererAsset.path,
        guid: record.rendererAsset.guid,
        sha256: record.rendererAsset.sha256,
        metaSha256: record.rendererAsset.metaSha256,
      },
    },
    pipeline: {
      requireDepthTexture: Boolean(pipeline.m_RequireDepthTexture),
      requireOpaqueTexture: Boolean(pipeline.m_RequireOpaqueTexture),
      opaqueDownsampling: { serialized: pipeline.m_OpaqueDownsampling, name: '2xBilinear' },
      hdr: Boolean(pipeline.m_SupportsHDR),
      hdrColorBufferPrecision: {
        serialized: pipeline.m_HDRColorBufferPrecision,
        name: pipeline.m_HDRColorBufferPrecision === 0 ? '32Bits' : '64Bits',
      },
      msaaSamples: pipeline.m_MSAA,
      renderScale: pipeline.m_RenderScale,
      lodCrossFade: Boolean(pipeline.m_EnableLODCrossFade),
      mainLightRendering: { serialized: pipeline.m_MainLightRenderingMode, name: 'PerPixel' },
      additionalLightsRendering: {
        serialized: pipeline.m_AdditionalLightsRenderingMode,
        name: 'PerPixel',
      },
      additionalLightsPerObject: pipeline.m_AdditionalLightsPerObjectLimit,
      reflectionProbeBlending: Boolean(pipeline.m_ReflectionProbeBlending),
      reflectionProbeBoxProjection: Boolean(pipeline.m_ReflectionProbeBoxProjection),
      reflectionProbeAtlas: Boolean(pipeline.m_ReflectionProbeAtlas),
      lightLayers: Boolean(pipeline.m_SupportsLightLayers),
    },
    quality: isCurrent
      ? {
        name: projectSelection.qualityName,
        index: projectSelection.qualityIndex,
        lodBias: projectSelection.lodBias,
        maximumLodLevel: projectSelection.maximumLODLevel,
        enableLodCrossFade: Boolean(projectSelection.enableLODCrossFade),
        terrainQualityOverrides: Boolean(projectSelection.terrainQualityOverrides),
      }
      : null,
    renderer: {
      renderingMode: {
        serialized: renderer.m_RenderingMode,
        name: enumName(RENDERING_MODE, renderer.m_RenderingMode, 'm_RenderingMode'),
      },
      nativeRenderPass: Boolean(renderer.m_UseNativeRenderPass),
      depthPrimingMode: { serialized: renderer.m_DepthPrimingMode, name: 'Disabled' },
      copyDepthMode: { serialized: renderer.m_CopyDepthMode, name: 'AfterOpaques' },
      accurateGbufferNormals: Boolean(renderer.m_AccurateGbufferNormals),
      intermediateTextureMode: {
        serialized: renderer.m_IntermediateTextureMode,
        name: renderer.m_IntermediateTextureMode === 0 ? 'Auto' : 'Always',
      },
      transparentShadowReceive: Boolean(renderer.m_ShadowTransparentReceive),
    },
    shadows: {
      mainLightSupported: Boolean(pipeline.m_MainLightShadowsSupported),
      mainLightAtlasResolution: pipeline.m_MainLightShadowmapResolution,
      additionalLightsSupported: Boolean(pipeline.m_AdditionalLightShadowsSupported),
      additionalLightsAtlasResolution: pipeline.m_AdditionalLightsShadowmapResolution,
      additionalLightResolutionTiers: {
        low: pipeline.m_AdditionalLightsShadowResolutionTierLow,
        medium: pipeline.m_AdditionalLightsShadowResolutionTierMedium,
        high: pipeline.m_AdditionalLightsShadowResolutionTierHigh,
      },
      maxDistance: pipeline.m_ShadowDistance,
      cascadeCount: pipeline.m_ShadowCascadeCount,
      cascadeSplits: [...pipeline.m_Cascade4Split, 1],
      cascadeBorder: pipeline.m_CascadeBorder,
      cascadeAtlasLayout: '2x2',
      cascadeTileResolution: pipeline.m_MainLightShadowmapResolution / 2,
      depthBias: pipeline.m_ShadowDepthBias,
      normalBias: pipeline.m_ShadowNormalBias,
      conservativeEnclosingSphere: Boolean(pipeline.m_ConservativeEnclosingSphere),
      enclosingSphereIterations: pipeline.m_NumIterationsEnclosingSphere,
      softShadowsSupported: Boolean(pipeline.m_SoftShadowsSupported),
      softShadowQuality: {
        serialized: pipeline.m_SoftShadowQuality,
        name: enumName(
          SOFT_SHADOW_QUALITY,
          pipeline.m_SoftShadowQuality,
          'm_SoftShadowQuality',
        ),
      },
    },
    colorGrading: {
      mode: {
        serialized: pipeline.m_ColorGradingMode,
        name: enumName(COLOR_GRADING, pipeline.m_ColorGradingMode, 'm_ColorGradingMode'),
      },
      lutSize: pipeline.m_ColorGradingLutSize,
      fastSrgbLinearConversion: Boolean(pipeline.m_UseFastSRGBLinearConversion),
    },
    ambientOcclusion: {
      featureName: 'ScreenSpaceAmbientOcclusion',
      active: Boolean(ao.m_Active),
      method: { serialized: ao.AOMethod, name: aoMethod },
      downsample: Boolean(ao.Downsample),
      fullResolution: !Boolean(ao.Downsample),
      afterOpaque: Boolean(ao.AfterOpaque),
      source: {
        serialized: ao.Source,
        name: enumName(DEPTH_SOURCE, ao.Source, 'AO Source'),
      },
      normalSamples: {
        serialized: ao.NormalSamples,
        name: enumName(NORMAL_SAMPLES, ao.NormalSamples, 'AO NormalSamples'),
      },
      intensity: ao.Intensity,
      directLightingStrength: ao.DirectLightingStrength,
      radius: ao.Radius,
      radiusMultiplier,
      effectiveShaderRadius: Number((ao.Radius * radiusMultiplier).toPrecision(15)),
      samples: { serialized: ao.Samples, ...samples },
      blurQuality: {
        serialized: ao.BlurQuality,
        name: enumName(BLUR_QUALITY, ao.BlurQuality, 'AO BlurQuality'),
      },
      falloff: ao.Falloff,
    },
  };
}

assert.equal(evidence.schema, 'toonlab.unity-pipeline-profile-evidence');
assert.equal(evidence.schemaVersion, 1);
assert.equal(evidence.profiles.length, 2);
assert.deepEqual(
  evidence.profiles.map(({ id }) => id),
  Object.values(SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS),
);

for (const record of evidence.profiles) {
  const derived = deriveProfile(record);
  assert.deepEqual(
    getSoStylizedUnityPipelineProfile(record.id),
    derived,
    `${record.id} module profile differs from checked source evidence`,
  );
  assert.ok(Object.isFrozen(SO_STYLIZED_UNITY_PIPELINE_PROFILES[record.id]));
  assert.ok(Object.isFrozen(SO_STYLIZED_UNITY_PIPELINE_PROFILES[record.id].shadows));
  assert.ok(Object.isFrozen(SO_STYLIZED_UNITY_PIPELINE_PROFILES[record.id].shadows.cascadeSplits));
}

assert.equal(
  SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE.id,
  SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.currentSample,
);
assert.equal(
  SO_STYLIZED_UNITY_DOCUMENTED_PIPELINE_PROFILE.id,
  SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.documentedIntended,
);
assert.notEqual(
  SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE.source.pipelineAsset.guid,
  SO_STYLIZED_UNITY_DOCUMENTED_PIPELINE_PROFILE.source.pipelineAsset.guid,
  'current and documented profiles must remain distinct',
);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function extractScalar(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*([^\\r\\n]+)`, 'm'));
  assert.ok(match, `missing ${key}`);
  const raw = match[1].trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return Number(raw);
  return raw;
}

function extractVector3(source, key) {
  const match = source.match(new RegExp(
    `^\\s*${key}:\\s*\\{x:\\s*([^,]+),\\s*y:\\s*([^,]+),\\s*z:\\s*([^}]+)\\}`,
    'm',
  ));
  assert.ok(match, `missing ${key}`);
  return match.slice(1, 4).map(Number);
}

function assertSerializedFields(source, fields, label) {
  for (const [key, expected] of Object.entries(fields)) {
    const actual = Array.isArray(expected)
      ? extractVector3(source, key)
      : extractScalar(source, key);
    assert.deepEqual(actual, expected, `${label} ${key}`);
  }
}

function readMetaGuid(file) {
  return String(extractScalar(fs.readFileSync(`${file}.meta`, 'utf8'), 'guid'));
}

function resolveExternalProject() {
  const explicit = process.argv.find((argument) => argument.startsWith('--unity-project='));
  const candidates = [
    explicit?.slice('--unity-project='.length),
    process.env.TOONLAB_UNITY_PROJECT,
    path.join(os.homedir(), 'Setup Guide In-Editor Tutorial'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(
    path.join(candidate, 'ProjectSettings/ProjectVersion.txt'),
  )) ?? null;
}

function verifyExternalProject(projectRoot) {
  for (const artifact of Object.values(evidence.project.artifacts)) {
    const file = path.join(projectRoot, artifact.path);
    assert.ok(fs.existsSync(file), `missing external project artifact ${artifact.path}`);
    assert.equal(sha256(file), artifact.sha256, `${artifact.path} hash`);
  }

  const projectVersion = fs.readFileSync(
    path.join(projectRoot, evidence.project.artifacts.projectVersion.path),
    'utf8',
  );
  assert.match(projectVersion, new RegExp(`m_EditorVersion: ${evidence.project.unityVersion}`));
  assert.match(projectVersion, new RegExp(`\\(${evidence.project.unityRevision}\\)`));

  const packageManifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, evidence.project.artifacts.packageManifest.path),
    'utf8',
  ));
  assert.equal(
    packageManifest.dependencies['com.unity.render-pipelines.universal'],
    evidence.project.urpVersion,
  );

  const qualitySettings = fs.readFileSync(
    path.join(projectRoot, evidence.project.artifacts.qualitySettings.path),
    'utf8',
  );
  assert.equal(
    extractScalar(qualitySettings, 'm_CurrentQuality'),
    evidence.project.currentSelection.qualityIndex,
  );
  const pcQuality = qualitySettings.match(
    /(?:^|\n)\s*- serializedVersion: 4\s*\n\s*name: PC\b[\s\S]*?(?=\n\s*- serializedVersion: 4|\n\s*m_TextureMipmapLimitGroupNames:)/,
  )?.[0];
  assert.ok(pcQuality, 'missing PC quality tier');
  const qualityGuid = pcQuality.match(/customRenderPipeline:[^\n]*guid:\s*([a-f0-9]{32})/)?.[1];
  assert.equal(qualityGuid, evidence.project.currentSelection.qualityPipelineGuid);
  assert.equal(
    extractScalar(pcQuality, 'lodBias'),
    evidence.project.currentSelection.lodBias,
  );
  assert.equal(
    extractScalar(pcQuality, 'maximumLODLevel'),
    evidence.project.currentSelection.maximumLODLevel,
  );
  assert.equal(
    extractScalar(pcQuality, 'enableLODCrossFade'),
    evidence.project.currentSelection.enableLODCrossFade,
  );
  assert.equal(
    extractScalar(pcQuality, 'terrainQualityOverrides'),
    evidence.project.currentSelection.terrainQualityOverrides,
  );

  const graphicsSettings = fs.readFileSync(
    path.join(projectRoot, evidence.project.artifacts.graphicsSettings.path),
    'utf8',
  );
  const graphicsGuid = graphicsSettings.match(
    /m_CustomRenderPipeline:[^\n]*guid:\s*([a-f0-9]{32})/,
  )?.[1];
  assert.equal(graphicsGuid, evidence.project.currentSelection.graphicsSettingsPipelineGuid);

  for (const record of evidence.profiles) {
    const pipelineFile = path.join(projectRoot, record.pipelineAsset.path);
    const rendererFile = path.join(projectRoot, record.rendererAsset.path);
    assert.ok(fs.existsSync(pipelineFile), `missing ${record.pipelineAsset.path}`);
    assert.ok(fs.existsSync(rendererFile), `missing ${record.rendererAsset.path}`);
    assert.equal(sha256(pipelineFile), record.pipelineAsset.sha256, `${record.id} pipeline hash`);
    assert.equal(sha256(`${pipelineFile}.meta`), record.pipelineAsset.metaSha256, `${record.id} pipeline meta hash`);
    assert.equal(sha256(rendererFile), record.rendererAsset.sha256, `${record.id} renderer hash`);
    assert.equal(sha256(`${rendererFile}.meta`), record.rendererAsset.metaSha256, `${record.id} renderer meta hash`);
    assert.equal(readMetaGuid(pipelineFile), record.pipelineAsset.guid, `${record.id} pipeline GUID`);
    assert.equal(readMetaGuid(rendererFile), record.rendererAsset.guid, `${record.id} renderer GUID`);

    const pipelineSource = fs.readFileSync(pipelineFile, 'utf8');
    assert.equal(extractScalar(pipelineSource, 'm_Name'), record.pipelineAsset.name);
    assert.match(
      pipelineSource,
      new RegExp(`m_RendererDataList:[\\s\\S]*?guid:\\s*${record.pipelineAsset.rendererGuid}`),
    );
    assertSerializedFields(
      pipelineSource,
      record.pipelineAsset.serialized,
      `${record.id} pipeline`,
    );

    const rendererSource = fs.readFileSync(rendererFile, 'utf8');
    assert.equal(extractScalar(rendererSource, 'm_Name'), record.rendererAsset.name);
    assert.match(
      rendererSource,
      new RegExp(`m_RendererFeatures:[\\s\\S]*?fileID:\\s*${record.rendererAsset.featureFileId}`),
    );
    assertSerializedFields(
      rendererSource,
      record.rendererAsset.serialized,
      `${record.id} renderer`,
    );
    const featureMarker = `--- !u!114 &${record.rendererAsset.featureFileId}`;
    const featureOffset = rendererSource.indexOf(featureMarker);
    assert.notEqual(featureOffset, -1, `${record.id} AO feature block`);
    const aoSource = rendererSource.slice(featureOffset);
    assert.equal(extractScalar(aoSource, 'm_Name'), 'ScreenSpaceAmbientOcclusion');
    assertSerializedFields(
      aoSource,
      record.rendererAsset.ambientOcclusion,
      `${record.id} ambient occlusion`,
    );
  }

  const urpRoot = path.join(projectRoot, evidence.enumAuthority.urpPackageRoot);
  if (fs.existsSync(urpRoot)) {
    const aoEnumSource = fs.readFileSync(
      path.join(urpRoot, evidence.enumAuthority.ambientOcclusion),
      'utf8',
    );
    assert.match(aoEnumSource, /enum AOMethodOptions\s*\{\s*BlueNoise,\s*InterleavedGradient,/s);
    assert.match(aoEnumSource, /enum AOSampleOption\s*\{\s*High,\s*\/\/ 12 Samples\s*Medium,\s*\/\/ 8 Samples\s*Low,/s);
    const aoPassSource = fs.readFileSync(
      path.join(urpRoot, evidence.enumAuthority.ambientOcclusionPass),
      'utf8',
    );
    assert.match(aoPassSource, /radiusMultiplier = settings\.AOMethod == [^?]+\? 1\.5f : 1;/);

    const pipelineEnumSource = fs.readFileSync(
      path.join(urpRoot, evidence.enumAuthority.pipelineAsset),
      'utf8',
    );
    assert.match(pipelineEnumSource, /enum ColorGradingMode\s*\{[\s\S]*?LowDynamicRange,[\s\S]*?HighDynamicRange/s);
    assert.match(pipelineEnumSource, /enum SoftShadowQuality\s*\{[\s\S]*?UsePipelineSettings,[\s\S]*?Low,[\s\S]*?Medium,[\s\S]*?High,/s);

    const rendererEnumSource = fs.readFileSync(
      path.join(urpRoot, evidence.enumAuthority.renderer),
      'utf8',
    );
    assert.match(rendererEnumSource, /Forward = 0,[\s\S]*?ForwardPlus = 2,[\s\S]*?Deferred = 1,/s);
  }
}

const externalProject = resolveExternalProject();
if (externalProject) verifyExternalProject(externalProject);

console.log('Unity pipeline profile verification passed.');
console.log(`  profiles: ${evidence.profiles.length}`);
console.log(`  current: ${SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE.label}`);
console.log(`  current LOD bias: ${SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE.quality.lodBias}`);
console.log(`  documented: ${SO_STYLIZED_UNITY_DOCUMENTED_PIPELINE_PROFILE.label}`);
console.log(`  external project: ${externalProject ? 'verified' : 'not available (checked evidence only)'}`);
