// Source-evidenced renderer profiles from the supplied Unity 6000.5.4f1
// project. These records intentionally do not select a runtime default: the
// sample project is currently wired to PC_RPAsset, while the pack guide tells
// users to assign URP_Asset_SoStylized to every Quality tier. Keeping both
// immutable profiles prevents either native reference from being relabelled.

const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
};

export const SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA =
  'toonlab.so-stylized-unity-pipeline-profile';
export const SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA_VERSION = 1;

export const SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS = freeze({
  currentSample: 'current-sample-pc',
  documentedIntended: 'documented-intended-so-stylized',
});

const COMMON_SOURCE = {
  unityVersion: '6000.5.4f1',
  unityRevision: 'd550df8bd089',
  urpVersion: '17.5.0',
  qualitySettings: {
    path: 'ProjectSettings/QualitySettings.asset',
    sha256: '6814d6cc3eb850dd7d2a069a8b17ba9f7591deba8b1758a855978bd9c8627643',
  },
  guide: {
    url: 'https://docs.google.com/document/d/1DO2epMFrkPEauO7-2zf-KXt_M1oRlx9PGnAMT3Iy8Js/edit?tab=t.0#heading=h.p3v51fi53inf',
    headingId: 'h.p3v51fi53inf',
    recommendation:
      'Edit > Project Settings > Quality and for each quality setting use the URP_Asset_SoStylized.',
  },
};

const CURRENT_SAMPLE_PROFILE = {
  schema: SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA,
  schemaVersion: SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA_VERSION,
  id: SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.currentSample,
  label: 'Current sample project · PC_RPAsset / PC_Renderer',
  classification: 'active-in-supplied-project',
  source: {
    ...COMMON_SOURCE,
    selection: {
      graphicsSettingsGuid: '4b83569d67af61e458304325a23e5dfd',
      currentQualityIndex: 1,
      currentQualityName: 'PC',
      qualityPipelineGuid: '4b83569d67af61e458304325a23e5dfd',
    },
    pipelineAsset: {
      name: 'PC_RPAsset',
      path: 'Assets/SourceFiles/Settings/PC_RPAsset.asset',
      guid: '4b83569d67af61e458304325a23e5dfd',
      sha256: '4d93ab2502566226745655f20650650e878d5a6e9e004b2079c89f0314c5331a',
      metaSha256: 'bb469b9b6f318e9e9bed29c3b2e73e79371c04743c6f95dd6603941f1cd3e53e',
    },
    rendererAsset: {
      name: 'PC_Renderer',
      path: 'Assets/SourceFiles/Settings/PC_Renderer.asset',
      guid: 'f288ae1f4751b564a96ac7587541f7a2',
      sha256: '3d0b01d8ded3327263b6690be128a3de58d17c514943ae42fe743a3e084a9c79',
      metaSha256: 'b5df8ddb2708c6ed4c133a5ff9ee95a75cc20e4ee3ed6181366a61aedbaf31ec',
    },
  },
  pipeline: {
    requireDepthTexture: true,
    requireOpaqueTexture: true,
    opaqueDownsampling: { serialized: 1, name: '2xBilinear' },
    hdr: true,
    hdrColorBufferPrecision: { serialized: 0, name: '32Bits' },
    msaaSamples: 1,
    renderScale: 1,
    lodCrossFade: true,
    mainLightRendering: { serialized: 1, name: 'PerPixel' },
    additionalLightsRendering: { serialized: 1, name: 'PerPixel' },
    additionalLightsPerObject: 4,
    reflectionProbeBlending: true,
    reflectionProbeBoxProjection: true,
    reflectionProbeAtlas: true,
    lightLayers: true,
  },
  quality: {
    name: 'PC',
    index: 1,
    lodBias: 2,
    maximumLodLevel: 0,
    enableLodCrossFade: true,
    terrainQualityOverrides: false,
  },
  renderer: {
    renderingMode: { serialized: 2, name: 'ForwardPlus' },
    nativeRenderPass: true,
    depthPrimingMode: { serialized: 0, name: 'Disabled' },
    copyDepthMode: { serialized: 0, name: 'AfterOpaques' },
    accurateGbufferNormals: false,
    intermediateTextureMode: { serialized: 0, name: 'Auto' },
    transparentShadowReceive: true,
  },
  shadows: {
    mainLightSupported: true,
    mainLightAtlasResolution: 2048,
    additionalLightsSupported: true,
    additionalLightsAtlasResolution: 2048,
    additionalLightResolutionTiers: { low: 256, medium: 512, high: 1024 },
    maxDistance: 50,
    cascadeCount: 4,
    cascadeSplits: [0.12299999, 0.2926, 0.53599995, 1],
    cascadeBorder: 0.107758604,
    cascadeAtlasLayout: '2x2',
    cascadeTileResolution: 1024,
    depthBias: 0.1,
    normalBias: 0.5,
    conservativeEnclosingSphere: true,
    enclosingSphereIterations: 64,
    softShadowsSupported: true,
    softShadowQuality: { serialized: 3, name: 'High' },
  },
  colorGrading: {
    mode: { serialized: 0, name: 'LowDynamicRange' },
    lutSize: 32,
    fastSrgbLinearConversion: false,
  },
  ambientOcclusion: {
    featureName: 'ScreenSpaceAmbientOcclusion',
    active: true,
    method: { serialized: 0, name: 'BlueNoise' },
    downsample: false,
    fullResolution: true,
    afterOpaque: false,
    source: { serialized: 1, name: 'DepthNormals' },
    normalSamples: { serialized: 1, name: 'Medium' },
    intensity: 0.4,
    directLightingStrength: 0.25,
    radius: 0.3,
    radiusMultiplier: 1.5,
    effectiveShaderRadius: 0.45,
    samples: { serialized: 1, name: 'Medium', count: 8 },
    blurQuality: { serialized: 0, name: 'High' },
    falloff: 100,
  },
};

const DOCUMENTED_INTENDED_PROFILE = {
  schema: SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA,
  schemaVersion: SO_STYLIZED_UNITY_PIPELINE_PROFILE_SCHEMA_VERSION,
  id: SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.documentedIntended,
  label: 'Documented intended pack setup · URP_Asset_SoStylized / URP_Renderer_SoStylized',
  classification: 'recommended-by-supplied-pack-guide-not-currently-active',
  source: {
    ...COMMON_SOURCE,
    selection: {
      graphicsSettingsGuid: null,
      currentQualityIndex: null,
      currentQualityName: null,
      qualityPipelineGuid: null,
      guideRecommendsEveryQualityTier: true,
    },
    pipelineAsset: {
      name: 'URP_Asset_SoStylized',
      path: 'Assets/SoStylized-Unity/Settings/URP_Asset_SoStylized.asset',
      guid: '32ed111482433d2468898f2263d4b877',
      sha256: 'bf2d34150ad5628bd27f5d9c6c109872e0e7881b582220103f201ca074642f04',
      metaSha256: '16d79a8def4a2029efa680c728c746f703f2f63498edddcf9f96553297f7d6aa',
    },
    rendererAsset: {
      name: 'URP_Renderer_SoStylized',
      path: 'Assets/SoStylized-Unity/Settings/URP_Renderer_SoStylized.asset',
      guid: '896195525289cfa48a74914a9107b874',
      sha256: '3f1f06fafcfe16512662837cd1a33f0ec3ea0c6d452af64d250c0fa5ad787515',
      metaSha256: '6e0b5745d0cdabbf71ac9f983f06a65140e33c06287d3e1f61599a83a85d007f',
    },
  },
  pipeline: {
    requireDepthTexture: true,
    requireOpaqueTexture: true,
    opaqueDownsampling: { serialized: 1, name: '2xBilinear' },
    hdr: true,
    hdrColorBufferPrecision: { serialized: 0, name: '32Bits' },
    msaaSamples: 4,
    renderScale: 1,
    lodCrossFade: false,
    mainLightRendering: { serialized: 1, name: 'PerPixel' },
    additionalLightsRendering: { serialized: 1, name: 'PerPixel' },
    additionalLightsPerObject: 4,
    reflectionProbeBlending: false,
    reflectionProbeBoxProjection: false,
    reflectionProbeAtlas: true,
    lightLayers: false,
  },
  quality: null,
  renderer: {
    renderingMode: { serialized: 1, name: 'Deferred' },
    nativeRenderPass: false,
    depthPrimingMode: { serialized: 0, name: 'Disabled' },
    copyDepthMode: { serialized: 0, name: 'AfterOpaques' },
    accurateGbufferNormals: false,
    intermediateTextureMode: { serialized: 1, name: 'Always' },
    transparentShadowReceive: true,
  },
  shadows: {
    mainLightSupported: true,
    mainLightAtlasResolution: 4096,
    additionalLightsSupported: true,
    additionalLightsAtlasResolution: 2048,
    additionalLightResolutionTiers: { low: 256, medium: 512, high: 1024 },
    maxDistance: 500,
    cascadeCount: 4,
    cascadeSplits: [0.016, 0.08, 0.269, 1],
    cascadeBorder: 0.352,
    cascadeAtlasLayout: '2x2',
    cascadeTileResolution: 2048,
    depthBias: 0.3,
    normalBias: 0.13,
    conservativeEnclosingSphere: true,
    enclosingSphereIterations: 64,
    softShadowsSupported: true,
    softShadowQuality: { serialized: 3, name: 'High' },
  },
  colorGrading: {
    mode: { serialized: 1, name: 'HighDynamicRange' },
    lutSize: 32,
    fastSrgbLinearConversion: true,
  },
  ambientOcclusion: {
    featureName: 'ScreenSpaceAmbientOcclusion',
    active: true,
    method: { serialized: 1, name: 'InterleavedGradient' },
    downsample: false,
    fullResolution: true,
    afterOpaque: false,
    source: { serialized: 1, name: 'DepthNormals' },
    normalSamples: { serialized: 1, name: 'Medium' },
    intensity: 0.4,
    directLightingStrength: 0.5,
    radius: 2,
    radiusMultiplier: 1,
    effectiveShaderRadius: 2,
    samples: { serialized: 0, name: 'High', count: 12 },
    blurQuality: { serialized: 0, name: 'High' },
    falloff: 9999,
  },
};

export const SO_STYLIZED_UNITY_PIPELINE_PROFILES = freeze({
  [CURRENT_SAMPLE_PROFILE.id]: CURRENT_SAMPLE_PROFILE,
  [DOCUMENTED_INTENDED_PROFILE.id]: DOCUMENTED_INTENDED_PROFILE,
});

export const SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE =
  SO_STYLIZED_UNITY_PIPELINE_PROFILES[
    SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.currentSample
  ];

export const SO_STYLIZED_UNITY_DOCUMENTED_PIPELINE_PROFILE =
  SO_STYLIZED_UNITY_PIPELINE_PROFILES[
    SO_STYLIZED_UNITY_PIPELINE_PROFILE_IDS.documentedIntended
  ];

export function getSoStylizedUnityPipelineProfile(id) {
  const profile = SO_STYLIZED_UNITY_PIPELINE_PROFILES[id];
  if (!profile) {
    throw new RangeError(`Unknown Unity pipeline profile: ${id}`);
  }
  return profile;
}
