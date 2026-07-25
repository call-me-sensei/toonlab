import * as THREE from 'three';
import { MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  SO_STYLIZED_UNITY_MEGA_CURRENT_COMPARISON_EVIDENCE,
  createSoStylizedUnityMegaComparisonIdentityReport,
} from '../../src/environment/soStylizedUnityMegaComparisonIdentity.js';
import {
  verifySoStylizedUnityFrameOccupancy,
} from '../../src/environment/soStylizedUnityFrameOccupancy.js';
import {
  attachSoStylizedUnityMegaCameraToRenderScene,
  createSoStylizedUnityMegaFrameParityReport,
} from '../../src/environment/soStylizedUnityMegaFrameParity.js';
import {
  applySoStylizedUnityMegaMaterials,
  loadSoStylizedUnityMegaScene,
  updateSoStylizedUnityMegaLods,
} from '../../src/environment/soStylizedUnityMegaScene.js';
import {
  createSoStylizedUnityMegaTerrain,
} from '../../src/environment/soStylizedUnityMegaTerrain.js';
import {
  SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE,
} from '../../src/environment/soStylizedUnityPipelineProfiles.js';
import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
  loadUnityUrpBlueNoiseTexturesAsync,
} from '../../src/environment/soStylizedUnityRendering.js';
import {
  configureSoStylizedUnityStageCameraClear,
  configureSoStylizedUnityStageRenderer,
  createSoStylizedUnityStageLights,
  createSoStylizedUnityStagePostPipeline,
} from '../../src/environment/soStylizedUnityStage.js';
import {
  measureSoStylizedUnityShadowAtlasDepthOccupancy,
  probeSoStylizedUnityShadowReceiver,
  sampleSoStylizedUnityShadowAtlasDepth,
  snapshotSoStylizedUnityShadowDiagnostics,
} from '../../src/environment/soStylizedUnityShadows.js';

const params = new URLSearchParams(location.search);
const stageElement = document.querySelector('#stage');
const loadingElement = document.querySelector('#loading');
const badgeElement = document.querySelector('#badge');
const diagnosticElement = document.querySelector('#diagnostic');
const statusElement = document.querySelector('#status');
const statusSummaryElement = document.querySelector('#status-summary');
const statusBodyElement = document.querySelector('#status-body');
const viewElement = document.querySelector('#view');
const wipeElement = document.querySelector('#wipe');
const wipeValueElement = document.querySelector('#wipe-value');
const freeCameraElement = document.querySelector('#free-camera');
const resetElement = document.querySelector('#reset');
const unityReferenceElement = document.querySelector('#unity-reference');

// This A/B stays bound to one immutable native source profile. The separate
// documented-profile export is evidence, not a drop-in reference for a
// runtime still configured from the current PC profile.
const BASE_URL = SO_STYLIZED_UNITY_MEGA_CURRENT_COMPARISON_EVIDENCE.baseUrl;
const NATIVE_CAPTURE_REPORT_URL = `${BASE_URL}/unity-reference.txt`;
const NATIVE_REFERENCE_URL = `${BASE_URL}/unity-reference.png`;
const LEDGER_URL = '/docs/unity-shader-port-ledger.json';
const PIPELINE_PROFILE = SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE;
const SOURCE_LOD_BIAS = PIPELINE_PROFILE.quality.lodBias;
const PARITY_WIDTH = 1920;
const PARITY_HEIGHT = 1080;
const diagnosticMode = params.get('debug') === '1';
const clock = new THREE.Clock();

if (unityReferenceElement?.dataset.referenceSrc !== NATIVE_REFERENCE_URL) {
  throw new Error('The declared Unity native oracle left the pinned comparison bundle.');
}
unityReferenceElement.src = NATIVE_REFERENCE_URL;

if (!diagnosticMode) {
  for (const key of [
    'animate', 'ao', 'bloom', 'dpr', 'fog', 'grade', 'post', 'shadows',
    'taa', 'taaSample', 'time', 'vignette',
  ]) params.delete(key);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function numberParam(name, fallback) {
  if (!params.has(name)) return fallback;
  const value = Number(params.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function boolParam(name, fallback = true) {
  if (!params.has(name)) return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(params.get(name)).toLowerCase());
}

function parityFeature(name, fallback = true) {
  return diagnosticMode ? boolParam(name, fallback) : fallback;
}

function applyView(value) {
  const next = ['reference', 'compare', 'live'].includes(value) ? value : 'compare';
  document.body.dataset.view = next;
  viewElement.value = next;
  params.set('view', next);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function applyWipe(value) {
  const next = THREE.MathUtils.clamp(Number(value) || 0, 0, 100);
  document.documentElement.style.setProperty('--wipe', `${next}%`);
  wipeElement.value = String(next);
  wipeValueElement.textContent = `${Math.round(next)}% Unity shipped demo`;
  params.set('wipe', String(next));
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function statusClass(status) {
  return status === 'complete' ? 'complete'
    : status === 'partial' ? 'partial'
      : 'not-started';
}

async function loadLedger() {
  const response = await fetch(LEDGER_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Unity ledger unavailable (${response.status}).`);
  const ledger = await response.json();
  const familyCounts = ledger.shaderFamilies.reduce((counts, entry) => {
    counts[entry.runtimePort] = (counts[entry.runtimePort] ?? 0) + 1;
    return counts;
  }, {});
  const rendererCounts = ledger.rendererSystems.reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
  const integrationCounts = (ledger.integrationSystems ?? []).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
  statusSummaryElement.textContent = [
    'UNITY PORTS',
    `${familyCounts.complete ?? 0}/${ledger.shaderFamilies.length} shader families complete`,
    `${rendererCounts.complete ?? 0}/${ledger.rendererSystems.length} renderer systems complete`,
    `${integrationCounts.complete ?? 0}/${ledger.integrationSystems?.length ?? 0} integration gates complete`,
  ].join(' · ');
  const familyRows = ledger.shaderFamilies.map((entry) => (
    `<div class="row"><span>${entry.family}</span>`
    + `<span class="${statusClass(entry.runtimePort)}">${entry.runtimePort}</span></div>`
  )).join('');
  const rendererRows = ledger.rendererSystems.map((entry) => (
    `<div class="row"><span>${entry.system}</span>`
    + `<span class="${statusClass(entry.status)}">${entry.status}</span></div>`
  )).join('');
  const integrationRows = (ledger.integrationSystems ?? []).map((entry) => (
    `<div class="row"><span>${entry.system}</span>`
    + `<span class="${statusClass(entry.status)}">${entry.status}</span></div>`
  )).join('');
  statusBodyElement.innerHTML = [
    '<div class="heading">Shader families</div>',
    familyRows,
    '<div class="heading">Renderer systems</div>',
    rendererRows,
    '<div class="heading">Integration gates</div>',
    integrationRows,
  ].join('');
  return { familyCounts, integrationCounts, ledger, rendererCounts };
}

async function loadNativeCaptureReport() {
  const response = await fetch(NATIVE_CAPTURE_REPORT_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Unity native capture report unavailable (${response.status}).`);
  }
  return response.text();
}

async function decodeNativeReference() {
  if (!unityReferenceElement) throw new Error('The Unity native oracle image is missing.');
  if (typeof unityReferenceElement.decode === 'function') {
    await unityReferenceElement.decode();
  } else if (!unityReferenceElement.complete) {
    await new Promise((resolve, reject) => {
      unityReferenceElement.addEventListener('load', resolve, { once: true });
      unityReferenceElement.addEventListener('error', reject, { once: true });
    });
  }
  if (!(unityReferenceElement.naturalWidth > 0 && unityReferenceElement.naturalHeight > 0)) {
    throw new Error('The Unity native oracle image did not decode.');
  }
  return unityReferenceElement;
}

function uniqueNodeMaterials(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material?.isNodeMaterial) materials.add(material);
  });
  return materials;
}

function captureCameraState(camera, controls) {
  return {
    far: camera.far,
    fov: camera.fov,
    near: camera.near,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls.target.clone(),
  };
}

function restoreCameraState(camera, controls, state) {
  camera.position.copy(state.position);
  camera.quaternion.copy(state.quaternion);
  camera.near = state.near;
  camera.far = state.far;
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
  controls.target.copy(state.target);
  controls.update();
}

async function main() {
  const ledgerPromise = loadLedger();
  const nativeCaptureReportPromise = loadNativeCaptureReport();
  const nativeReferencePromise = decodeNativeReference();
  const renderer = new WebGPURenderer({
    antialias: false,
    reversedDepthBuffer: true,
    requiredLimits: { maxSampledTexturesPerShaderStage: 48 },
  });
  renderer.setPixelRatio(diagnosticMode
    ? Math.min(devicePixelRatio, numberParam('dpr', 1))
    : 1);
  // Keep the render surface and projection at the source capture's exact
  // 16:9 frame in diagnostic mode too. The diagnostic `dpr` switch scales the
  // drawing buffer (for example .5 => 960x540) without allowing rounded CSS
  // client dimensions such as 1423x800 to silently change camera framing.
  // CSS still fits the canvas to the visible stage.
  const initialSize = { width: PARITY_WIDTH, height: PARITY_HEIGHT };
  renderer.setSize(initialSize.width, initialSize.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stageElement.prepend(renderer.domElement);
  await renderer.init();
  const postEnabled = parityFeature('post', true);
  const ambientOcclusionEnabled = parityFeature('ao', true);
  // Begin decoding the exact eight URP package textures while the large scene
  // and terrain load. The post graph is not allowed to exist until all eight
  // 256x256 images are ready, so frame zero cannot bind fallback/null noise.
  const ssaoBlueNoiseTexturesPromise = postEnabled && ambientOcclusionEnabled
    ? loadUnityUrpBlueNoiseTexturesAsync()
    : Promise.resolve(null);

  const scene = new THREE.Scene();
  scene.background = null;
  configureSoStylizedUnityStageRenderer(renderer, scene);

  const timeNode = uniform(numberParam('time', 0));
  const unityState = {
    uniforms: {
      sunDirection: SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.rayDirection,
      time: timeNode,
    },
  };

  diagnosticElement.textContent = 'Loading the exact Unity GLB, material records, and terrain sidecars…';
  const mega = await loadSoStylizedUnityMegaScene({ baseUrl: BASE_URL });
  const camera = mega.camera;
  if (!camera?.isPerspectiveCamera) throw new Error('The exported Unity perspective camera is missing.');
  scene.add(mega.root);

  const cameraRecord = mega.manifest.cameras[0];
  const cameraNode = mega.manifest.nodes[cameraRecord.node];
  const cameraClearReport = configureSoStylizedUnityStageCameraClear(
    scene,
    cameraRecord,
  );
  const cameraAttachmentReport = attachSoStylizedUnityMegaCameraToRenderScene(
    camera,
    scene,
    { cameraNode },
  );
  camera.fov = cameraRecord.fieldOfView;
  camera.near = cameraRecord.nearClipPlane;
  camera.far = cameraRecord.farClipPlane;
  camera.aspect = initialSize.width / initialSize.height;
  camera.updateProjectionMatrix();

  // OrbitControls performs an update in its constructor with a default target
  // at world origin. Restore the source pose immediately, then give controls a
  // target on the exact source forward ray before its next update.
  const sourceCameraPosition = camera.position.clone();
  const sourceCameraQuaternion = camera.quaternion.clone();
  const controls = new OrbitControls(camera, renderer.domElement);
  camera.position.copy(sourceCameraPosition);
  camera.quaternion.copy(sourceCameraQuaternion);
  camera.updateMatrixWorld(true);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enabled = false;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  controls.target.copy(camera.getWorldPosition(new THREE.Vector3())).addScaledVector(forward, 100);
  controls.update();
  const exactCameraState = captureCameraState(camera, controls);

  diagnosticElement.textContent = 'Reconstructing all routed Unity Shader Graph materials…';
  const [sceneMaterialReport, prototypeMaterialReport] = await Promise.all([
    applySoStylizedUnityMegaMaterials(mega.root, mega.manifest, {
      baseUrl: BASE_URL,
      state: unityState,
    }),
    applySoStylizedUnityMegaMaterials(mega.prototypeLibrary, mega.manifest, {
      baseUrl: BASE_URL,
      state: unityState,
    }),
  ]);

  diagnosticElement.textContent = 'Building the exact 513² terrain, five float splat layers, and 1,695 trees…';
  const terrain = await createSoStylizedUnityMegaTerrain({
    baseUrl: BASE_URL,
    manifest: mega.manifest,
    prefabLibrary: mega.prototypeLibrary,
    splatPrecision: 'float32',
  });
  scene.add(terrain.root);
  const detailMaterialReport = terrain.details
    ? await applySoStylizedUnityMegaMaterials(terrain.details.group, mega.manifest, {
      baseUrl: BASE_URL,
      state: unityState,
    })
    : { sourceMaterialCount: 0, unresolved: [] };
  terrain.root.updateWorldMatrix(true, true);
  let detailReport = terrain.details?.update(camera, { force: true }) ?? {
    activeInstanceCount: 0,
    activePatchCount: 0,
  };
  let terrainTreeLodReport = terrain.trees?.update(
    camera,
    { lodBias: SOURCE_LOD_BIAS },
  ) ?? {
    casterEntries: 0,
    culledEntries: 0,
    lodBias: SOURCE_LOD_BIAS,
    selectedEntries: 0,
    selectedRendererObjects: 0,
  };
  let lodReport = updateSoStylizedUnityMegaLods(
    mega.root,
    mega.manifest,
    camera,
    { lodBias: SOURCE_LOD_BIAS },
  );
  const frameParityReport = createSoStylizedUnityMegaFrameParityReport({
    camera,
    height: PARITY_HEIGHT,
    manifest: mega.manifest,
    renderScene: scene,
    sceneRoot: mega.root,
    terrainRuntime: terrain,
    width: PARITY_WIDTH,
  });
  if (!frameParityReport.exact) {
    throw new Error(
      'The live scene failed the numerical source camera/terrain frame gate: '
      + JSON.stringify(frameParityReport),
    );
  }
  const [nativeCaptureReport, nativeReference] = await Promise.all([
    nativeCaptureReportPromise,
    nativeReferencePromise,
  ]);
  const comparisonIdentityReport = createSoStylizedUnityMegaComparisonIdentityReport({
    baseUrl: BASE_URL,
    frameParityReport,
    manifest: mega.manifest,
    terrainNativeAuthority: mega.terrainNativeAuthority,
    nativeCaptureReport,
    nativeImageHeight: nativeReference.naturalHeight,
    nativeImageWidth: nativeReference.naturalWidth,
    nativeReferenceUrl: nativeReference.currentSrc || nativeReference.src,
    viewportHeight: PARITY_HEIGHT,
    viewportWidth: PARITY_WIDTH,
  });
  if (!comparisonIdentityReport.exact) {
    throw new Error(
      'The Unity native oracle and ToonLab reconstruction failed the scene/camera identity gate: '
      + JSON.stringify(comparisonIdentityReport),
    );
  }

  const stageLights = createSoStylizedUnityStageLights(scene, {
    castShadow: parityFeature('shadows', true),
  });
  let terrainShadowProbeMaterial = null;
  const requestedShadowProbe = diagnosticMode ? params.get('shadowProbe') : null;
  if (requestedShadowProbe === 'terrain'
      || /^cascade[0-3]$/.test(requestedShadowProbe ?? '')) {
    const csm = stageLights.cascadedShadows[0];
    let shadowProbeNode = csm;
    if (requestedShadowProbe !== 'terrain') {
      if (csm.camera === null) csm._init({ camera, renderer });
      shadowProbeNode = csm._shadowNodes[Number(requestedShadowProbe.slice(-1))];
    }
    terrainShadowProbeMaterial = new MeshBasicNodeMaterial();
    terrainShadowProbeMaterial.name = 'Unity CSM receiver attenuation probe';
    terrainShadowProbeMaterial.colorNode = vec3(shadowProbeNode);
    terrainShadowProbeMaterial.fog = false;
    terrainShadowProbeMaterial.toneMapped = false;
    terrain.mesh.material = terrainShadowProbeMaterial;
    terrain.additiveMesh.visible = false;
    document.body.dataset.shadowProbe = requestedShadowProbe === 'terrain'
      ? 'terrain-csm-attenuation'
      : `terrain-${requestedShadowProbe}-attenuation`;
  }
  const casterReport = stageLights.casterReport ?? {
    casterMaterialCount: 0,
    casterMeshCount: 0,
    receiverMeshCount: 0,
    selfShadowEligibleMeshCount: 0,
    unsupportedCasterMaterialCount: 0,
  };

  const requestedPostProbe = diagnosticMode ? params.get('postProbe') : null;
  const postProbe = ['ao', 'beauty', 'temporal'].includes(requestedPostProbe)
    ? requestedPostProbe
    : 'final';
  const ssaoBlueNoiseTextures = await ssaoBlueNoiseTexturesPromise;
  const post = postEnabled ? createSoStylizedUnityStagePostPipeline({
    ambientOcclusion: ambientOcclusionEnabled,
    bloom: parityFeature('bloom', true),
    camera,
    fog: parityFeature('fog', true),
    grade: parityFeature('grade', true),
    renderer,
    scene,
    ssaoBlueNoiseTextures,
    taa: parityFeature('taa', true),
    taaSampleIndex: diagnosticMode
      ? Math.max(0, Math.round(numberParam('taaSample', 0)))
      : 0,
    vignette: parityFeature('vignette', true),
  }) : null;

  document.body.dataset.renderFrameGate = 'running';
  diagnosticElement.textContent = `Validating ${post ? postProbe : 'direct'} final-frame pixels…`;
  const frameOccupancyReport = await verifySoStylizedUnityFrameOccupancy({
    renderer,
    render: post
      ? () => post.render(postProbe)
      : () => renderer.render(scene, camera),
  });
  const aoVisibilityStats = post?.ambientOcclusion
    ? await post.diagnostics.getAoVisibilityStats()
    : null;
  post?.update();
  const postRenderPhaseState = post?.diagnostics.getRenderPhaseState() ?? null;
  const shadowAtlasDepthOccupancy = stageLights.cascadedShadows[0]
    ? await measureSoStylizedUnityShadowAtlasDepthOccupancy(
      stageLights.cascadedShadows[0],
      renderer,
    )
    : null;
  const atlasSampleU = diagnosticMode ? numberParam('atlasU', Number.NaN) : Number.NaN;
  const atlasSampleV = diagnosticMode ? numberParam('atlasV', Number.NaN) : Number.NaN;
  const shadowAtlasPointSample = stageLights.cascadedShadows[0]
    && Number.isFinite(atlasSampleU)
    && Number.isFinite(atlasSampleV)
    ? await sampleSoStylizedUnityShadowAtlasDepth(
        stageLights.cascadedShadows[0],
        renderer,
        { u: atlasSampleU, v: atlasSampleV },
      )
    : null;
  const terrainSurfaceProbe = mega.terrainNativeAuthority?.terrains?.[0]
    ?.surfaceProbes
    ?.map((probe) => ({
      probe,
      worldPosition: new THREE.Vector3(
        probe.rendererWorldPosition[0],
        probe.rendererWorldPosition[1],
        -probe.rendererWorldPosition[2],
      ),
    }))
    .sort((left, right) => (
      left.worldPosition.distanceToSquared(camera.position)
      - right.worldPosition.distanceToSquared(camera.position)
    ))[0] ?? null;
  const shadowAtlasTerrainReceiverProbe = stageLights.cascadedShadows[0]
    && terrainSurfaceProbe
    ? Object.freeze({
        ...(await probeSoStylizedUnityShadowReceiver(
          stageLights.cascadedShadows[0],
          renderer,
          { worldPosition: terrainSurfaceProbe.worldPosition },
        )),
        sourceProbe: Object.freeze({
          heightmapX: terrainSurfaceProbe.probe.heightmapX,
          heightmapZ: terrainSurfaceProbe.probe.heightmapZ,
          rendererWorldPosition: Object.freeze([
            ...terrainSurfaceProbe.probe.rendererWorldPosition,
          ]),
        }),
      })
    : null;
  const shadowDiagnostics = stageLights.cascadedShadows[0]
    ? snapshotSoStylizedUnityShadowDiagnostics(stageLights.cascadedShadows[0])
    : null;
  const terrainShadowReceivers = [];
  terrain.root.traverse((object) => {
    const source = object.userData?.soStylizedUnityMegaTerrain;
    if (!object.isMesh || !source || !object.material) return;
    terrainShadowReceivers.push({
      addPass: source.addPass === true,
      material: object.material.name,
      receivesShadow: object.receiveShadow === true,
      sourceShader: object.material.userData?.soStylizedUnityMegaTerrain?.sourceShader,
      urpLighting:
        object.material.userData?.soStylizedUnityUrpLighting?.inputAdapter === 'unity-stage'
        && typeof object.material.setupLightingModel === 'function',
    });
  });
  const terrainShadowReceiverReport = Object.freeze({
    csmAttachedToMainLight:
      stageLights.light.shadow.shadowNode === stageLights.cascadedShadows[0],
    exact: terrainShadowReceivers.length === 2
      && terrainShadowReceivers.every((receiver) => (
        receiver.receivesShadow
        && receiver.urpLighting
        && receiver.sourceShader === 'Universal Render Pipeline/Terrain/Lit'
      ))
      && stageLights.light.shadow.shadowNode === stageLights.cascadedShadows[0],
    lightAttenuationPath:
      'DirectionalLight.shadow.shadowNode -> shadowed lightColor -> SoStylizedUnityUrpLightingModel.direct radiance',
    receivers: Object.freeze(terrainShadowReceivers.map(Object.freeze)),
  });
  Object.assign(document.body.dataset, {
    aoVisibilityAtLeast95Fraction: String(
      aoVisibilityStats?.atLeastNinetyFivePercentFraction ?? 'disabled',
    ),
    aoVisibilityBelow50Fraction: String(
      aoVisibilityStats?.belowHalfFraction ?? 'disabled',
    ),
    aoVisibilityBelow75Fraction: String(
      aoVisibilityStats?.belowThreeQuartersFraction ?? 'disabled',
    ),
    aoVisibilityMaximum: String(aoVisibilityStats?.maximum ?? 'disabled'),
    aoVisibilityMean: String(aoVisibilityStats?.mean ?? 'disabled'),
    aoVisibilityMinimum: String(aoVisibilityStats?.minimum ?? 'disabled'),
    aoVisibilityP01: String(aoVisibilityStats?.p01 ?? 'disabled'),
    aoVisibilityP05: String(aoVisibilityStats?.p05 ?? 'disabled'),
    aoVisibilityP50: String(aoVisibilityStats?.p50 ?? 'disabled'),
    aoVisibilityP95: String(aoVisibilityStats?.p95 ?? 'disabled'),
    aoVisibilityP99: String(aoVisibilityStats?.p99 ?? 'disabled'),
    postFrameNonClear: String(Boolean(post) && frameOccupancyReport.exact),
    postRenderPhaseCompleted: postRenderPhaseState?.completed ?? 'direct-render',
    postRenderPhaseFailed: postRenderPhaseState?.failed ?? 'none',
    renderFrameDominantFraction: String(frameOccupancyReport.dominantFraction),
    renderFrameGate: 'passed',
    renderFrameLumaRange: String(frameOccupancyReport.lumaRange),
    renderFrameLumaStandardDeviation: String(
      frameOccupancyReport.lumaStandardDeviation,
    ),
    renderFrameNonClear: String(frameOccupancyReport.exact),
    renderFrameRgbRange: String(frameOccupancyReport.rgbRange),
    shadowAtlasAllocated: String(shadowDiagnostics?.atlasAllocated ?? false),
    shadowAtlasCascadeDiagnostics: JSON.stringify(
      shadowDiagnostics?.cascades ?? [],
    ),
    shadowAtlasNativeFrameExact: String(
      shadowDiagnostics?.nativeFrameExact ?? false,
    ),
    shadowAtlasDepthOccupancy: JSON.stringify(shadowAtlasDepthOccupancy),
    shadowAtlasDepthOccupancyExact: String(shadowAtlasDepthOccupancy?.exact ?? false),
    shadowAtlasPhase: shadowDiagnostics?.phase ?? 'disabled',
    shadowAtlasShared: String(shadowDiagnostics?.sharedAtlas ?? false),
    shadowAtlasPointSample: JSON.stringify(shadowAtlasPointSample),
    shadowAtlasTerrainReceiverProbe: JSON.stringify(
      shadowAtlasTerrainReceiverProbe,
    ),
    terrainShadowReceiverReport: JSON.stringify(terrainShadowReceiverReport),
    terrainShadowReceiverWired: String(terrainShadowReceiverReport.exact),
  });

  const ledger = await ledgerPromise;
  const shaderFamilies = new Map();
  for (const material of uniqueNodeMaterials(scene)) {
    const source = material.userData?.soStylizedUnityMaterial;
    if (!source?.sourceShader) continue;
    if (!shaderFamilies.has(source.sourceShader)) shaderFamilies.set(source.sourceShader, new Set());
    shaderFamilies.get(source.sourceShader).add(source.sourceMaterial);
  }

  const setInteractiveIdentityState = (exact) => {
    badgeElement.textContent = exact
      ? (diagnosticMode
        ? 'DIAGNOSTIC OVERRIDES · SOURCE MEGA'
        : 'IDENTITY EXACT · UNITY SHIPPED DEMO ↔ TOONLAB · 1920×1080')
      : 'FREE CAMERA · NATIVE ORACLE COMPARISON DISABLED';
    Object.assign(document.body.dataset, {
      cameraAuthority: exact
        ? 'Unity scene-manifest camera 0'
        : 'free camera; native oracle comparison disabled',
      comparisonCameraIdentityMatch: String(exact && comparisonIdentityReport.gates.camera),
      comparisonFrameIdentityMatch: String(
        exact && comparisonIdentityReport.gates.reconstructionFrame,
      ),
      comparisonIdentityExact: String(exact && comparisonIdentityReport.exact),
      frameParityExact: String(exact && frameParityReport.exact),
    });
  };
  const setExactCamera = () => {
    controls.enabled = false;
    restoreCameraState(camera, controls, exactCameraState);
    freeCameraElement.textContent = 'Exact Camera';
    freeCameraElement.dataset.active = 'false';
    setInteractiveIdentityState(true);
  };
  const setFreeCamera = () => {
    controls.enabled = true;
    freeCameraElement.textContent = 'Free Camera';
    freeCameraElement.dataset.active = 'true';
    applyView('live');
    setInteractiveIdentityState(false);
  };
  setExactCamera();

  viewElement.addEventListener('change', () => {
    if (viewElement.value !== 'live') setExactCamera();
    applyView(viewElement.value);
  });
  wipeElement.addEventListener('input', () => applyWipe(wipeElement.value));
  freeCameraElement.addEventListener('click', () => {
    if (controls.enabled) setExactCamera();
    else setFreeCamera();
  });
  resetElement.addEventListener('click', setExactCamera);

  applyView(params.get('view') ?? 'compare');
  applyWipe(numberParam('wipe', 50));
  loadingElement.hidden = true;
  diagnosticElement.textContent = [
    'same shipped Unity M_Demonstration_Mega export + Camera 0',
    `${mega.manifest.summary.nodeCount.toLocaleString()} nodes`,
    `${sceneMaterialReport.sourceMaterialCount} scene materials`,
    `${terrain.trees?.instanceCount ?? 0} terrain trees`,
    `${terrain.details?.instanceCount.toLocaleString() ?? 0} authored details`,
    `${detailReport.activeInstanceCount.toLocaleString()} active details`,
    `${lodReport.evaluatedGroups}/${mega.manifest.lodGroups.length} LOD groups evaluated`,
    `${shaderFamilies.size}/${ledger.ledger.shaderFamilies.length} shader families routed`,
  ].join(' · ');

  Object.assign(document.body.dataset, {
    cameraAuthority: 'Unity scene-manifest camera 0',
    comparisonBundleIdentityMatch: String(comparisonIdentityReport.gates.immutableBundle),
    comparisonCameraPositionError: String(comparisonIdentityReport.errors.cameraPosition),
    comparisonCameraProjectionError: String(comparisonIdentityReport.errors.cameraProjection),
    comparisonCameraRotationErrorRadians: String(
      comparisonIdentityReport.errors.cameraRotationRadians,
    ),
    comparisonCameraIdentityMatch: String(comparisonIdentityReport.gates.camera),
    comparisonCaptureLabel: comparisonIdentityReport.source.captureLabel,
    comparisonCaptureReportSha256: comparisonIdentityReport.evidenceHashes.captureReport,
    comparisonFrameIdentityMatch: String(comparisonIdentityReport.gates.reconstructionFrame),
    comparisonIdentityExact: String(comparisonIdentityReport.exact),
    comparisonIdentityKey: comparisonIdentityReport.identityKey,
    comparisonManifestSha256: comparisonIdentityReport.evidenceHashes.manifest,
    comparisonNativeReferenceSha256: comparisonIdentityReport.evidenceHashes.nativeReference,
    comparisonTerrainAuthorityIdentityMatch: String(
      comparisonIdentityReport.gates.terrainAuthority,
    ),
    comparisonTerrainAuthoritySha256:
      comparisonIdentityReport.evidenceHashes.terrainNativeAuthority,
    comparisonOracleCameraId: comparisonIdentityReport.nativeOracle.cameraId,
    comparisonOracleRole: comparisonIdentityReport.nativeOracle.role,
    comparisonOracleResolution: [
      comparisonIdentityReport.nativeOracle.resolution.width,
      comparisonIdentityReport.nativeOracle.resolution.height,
    ].join('x'),
    comparisonOracleSceneId: comparisonIdentityReport.nativeOracle.sceneId,
    comparisonOracleUrl: comparisonIdentityReport.nativeOracle.referenceUrl,
    comparisonProfileIdentityMatch: String(comparisonIdentityReport.gates.profile),
    comparisonReconstructionCameraId: comparisonIdentityReport.reconstruction.cameraId,
    comparisonReconstructionRole: comparisonIdentityReport.reconstruction.role,
    comparisonReconstructionResolution: [
      comparisonIdentityReport.reconstruction.resolution.width,
      comparisonIdentityReport.reconstruction.resolution.height,
    ].join('x'),
    comparisonReconstructionSceneId: comparisonIdentityReport.reconstruction.sceneId,
    comparisonReconstructionSha256: comparisonIdentityReport.evidenceHashes.reconstructionScene,
    comparisonReconstructionUrl: comparisonIdentityReport.reconstruction.sceneUrl,
    comparisonResolution: `${PARITY_WIDTH}x${PARITY_HEIGHT}`,
    comparisonSceneIdentityMatch: String(comparisonIdentityReport.gates.scene),
    comparisonViewportIdentityMatch: String(comparisonIdentityReport.gates.viewport),
    casterMaterialCount: String(casterReport.casterMaterialCount),
    casterMeshCount: String(casterReport.casterMeshCount),
    receiverMeshCount: String(casterReport.receiverMeshCount),
    selfShadowEligibleMeshCount: String(casterReport.selfShadowEligibleMeshCount),
    unsupportedCasterMaterialCount: String(casterReport.unsupportedCasterMaterialCount),
    detailActiveInstanceCount: String(detailReport.activeInstanceCount),
    detailActivePatchCount: String(detailReport.activePatchCount),
    detailInstanceCount: String(terrain.details?.instanceCount ?? 0),
    detailMaterialCount: String(detailMaterialReport.sourceMaterialCount),
    detailPrototypeCount: String(terrain.population.detailPrototypes.length),
    detailRuntimeStatus: String(
      terrain.root.userData.soStylizedUnityMegaTerrain.population.detailRuntimeStatus,
    ),
    lodCulledGroupCount: String(lodReport.culledGroups),
    lodSelectedGroupCount: String(lodReport.selectedGroups),
    lodSelectionHash: String(lodReport.selectionHash),
    lodBias: String(lodReport.lodBias),
    lodGroupCount: String(mega.manifest.lodGroups.length),
    materialFamilyCount: String(shaderFamilies.size),
    frameParityExact: String(frameParityReport.exact),
    frameProjectionLandmarkCount: String(frameParityReport.projection.projectedLandmarkCount),
    frameProjectionMaximumError: String(frameParityReport.projection.maximumError),
    terrainNativeProbeCount: String(frameParityReport.terrainFrame.nativeSurfaceProbeCount),
    terrainNativeProbeHeightError: String(
      frameParityReport.terrainFrame.maximumNativeProbeHeightError,
    ),
    terrainNativeProbeSplatError: String(
      frameParityReport.terrainFrame.maximumNativeProbeSplatError,
    ),
    terrainNativeProbeWorldError: String(
      frameParityReport.terrainFrame.maximumNativeProbeWorldPositionError,
    ),
    terrainTransformAuthority: frameParityReport.terrainFrame.transformAuthority,
    parityExact: 'false',
    parityMode: diagnosticMode ? 'diagnostic' : 'locked-1920x1080',
    parityRemainingGap: 'comparison identity and source frame exact; material, lighting, atmosphere, and post remain',
    pipelineProfileId: PIPELINE_PROFILE.id,
    pipelineAssetGuid: PIPELINE_PROFILE.source.pipelineAsset.guid,
    pipelineAssetSha256: PIPELINE_PROFILE.source.pipelineAsset.sha256,
    rendererAssetGuid: PIPELINE_PROFILE.source.rendererAsset.guid,
    rendererAssetSha256: PIPELINE_PROFILE.source.rendererAsset.sha256,
    postOrder: post?.metadata.order.join('>') ?? 'off',
    postProbe,
    prototypeMaterialCount: String(prototypeMaterialReport.sourceMaterialCount),
    rendererSystemComplete: String(ledger.rendererCounts.complete ?? 0),
    integrationGateComplete: String(ledger.integrationCounts.complete ?? 0),
    sceneMaterialCount: String(sceneMaterialReport.sourceMaterialCount),
    shadowBridgeCount: String(stageLights.remainingBridges.length),
    shaderFamilyComplete: String(ledger.familyCounts.complete ?? 0),
    terrainTreeCount: String(terrain.trees?.instanceCount ?? 0),
    terrainTreeCasterEntryCount: String(terrainTreeLodReport.casterEntries),
    terrainTreeCulledEntryCount: String(terrainTreeLodReport.culledEntries),
    terrainTreeSelectedEntryCount: String(terrainTreeLodReport.selectedEntries),
    unityReady: 'true',
    worldReady: 'true',
  });

  // Source-parity diagnostics occasionally need to identify the exact
  // renderer/material beneath a discrepant reference pixel. Keep that proof
  // path opt-in so the production comparison does not pay the cost of
  // raycasting the native Terrain detail population. pickU/pickV are
  // normalized coordinates in the source 1920x1080 frame.
  let sourcePixelPickReport = null;
  const pickU = diagnosticMode ? numberParam('pickU', Number.NaN) : Number.NaN;
  const pickV = diagnosticMode ? numberParam('pickV', Number.NaN) : Number.NaN;
  if (Number.isFinite(pickU) && Number.isFinite(pickV)) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(
      THREE.MathUtils.clamp(pickU, 0, 1) * 2 - 1,
      1 - THREE.MathUtils.clamp(pickV, 0, 1) * 2,
    ), camera);
    const hierarchyVisible = (object) => {
      for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
      }
      return true;
    };
    const intersections = raycaster.intersectObjects(
      [mega.root, terrain.root],
      true,
    ).filter(({ object }) => hierarchyVisible(object));
    const pickedPoint = intersections[0]?.point ?? null;
    const csm = stageLights.cascadedShadows[0];
    const shadowCoordinates = pickedPoint && csm?.lights?.length
      ? csm.lights.map((cascadeLight, cascadeIndex) => {
          cascadeLight.shadow.updateMatrices(cascadeLight);
          const homogeneous = new THREE.Vector4(
            pickedPoint.x,
            pickedPoint.y,
            pickedPoint.z,
            1,
          ).applyMatrix4(cascadeLight.shadow.matrix);
          const inverseW = homogeneous.w !== 0 ? 1 / homogeneous.w : 0;
          const local = new THREE.Vector3(
            homogeneous.x * inverseW,
            1 - homogeneous.y * inverseW,
            homogeneous.z * inverseW,
          );
          const slice = csm._shadowNodes[cascadeIndex]?.slice;
          const sphere = csm._unityCascadeSpheres[cascadeIndex];
          return Object.freeze({
            atlas: slice ? [
              local.x * slice.normalizedScale + slice.normalizedOffset[0],
              local.y * slice.normalizedScale + slice.normalizedOffset[1],
              local.z,
            ] : null,
            cascadeIndex,
            insideSphere: sphere
              ? pickedPoint.distanceToSquared(new THREE.Vector3(sphere.x, sphere.y, sphere.z))
                < sphere.w
              : null,
            local: local.toArray(),
          });
        })
      : [];
    sourcePixelPickReport = Object.freeze({
      frame: [PARITY_WIDTH, PARITY_HEIGHT],
      normalized: [pickU, pickV],
      shadowCoordinates: Object.freeze(shadowCoordinates),
      hits: Object.freeze(intersections.slice(0, 12).map((hit) => {
        const material = Array.isArray(hit.object.material)
          ? hit.object.material[hit.face?.materialIndex ?? 0]
          : hit.object.material;
        let terrainDetail = null;
        let terrainTree = null;
        for (let current = hit.object; current; current = current.parent) {
          terrainDetail ??= current.userData?.soStylizedUnityTerrainDetail ?? null;
          terrainTree ??= current.userData?.soStylizedUnityTerrainTree ?? null;
        }
        return Object.freeze({
          distance: hit.distance,
          instanceId: Number.isInteger(hit.instanceId) ? hit.instanceId : null,
          material: material?.name ?? null,
          object: hit.object.name,
          point: hit.point.toArray(),
          receivesShadow: hit.object.receiveShadow === true,
          sourceMaterial: material?.userData?.soStylizedUnityMaterial?.sourceMaterial ?? null,
          sourceShader: material?.userData?.soStylizedUnityMaterial?.sourceShader ?? null,
          terrainDetail: terrainDetail ? {
            prototypeIndex: terrainDetail.prototypeIndex ?? null,
            sourcePrefab: terrainDetail.sourcePrefab ?? null,
          } : null,
          terrainTree: terrainTree ? {
            instanceIndex: terrainTree.instanceIndex ?? null,
            prototypeIndex: terrainTree.prototypeIndex ?? null,
            sourcePrefab: terrainTree.sourcePrefab ?? null,
          } : null,
        });
      })),
    });
    document.body.dataset.sourcePixelPickReport = JSON.stringify(sourcePixelPickReport);
  }

  globalThis.__TOONLAB_UNITY_SHOWCASE__ = {
    aoVisibilityStats,
    camera,
    cameraAttachmentReport,
    cameraClearReport,
    comparisonIdentityReport,
    controls,
    frameParityReport,
    frameOccupancyReport,
    ledger: ledger.ledger,
    manifest: mega.manifest,
    materialReports: {
      details: detailMaterialReport,
      prototype: prototypeMaterialReport,
      scene: sceneMaterialReport,
    },
    mega,
    post,
    postProbe,
    renderer,
    scene,
    shadowDiagnostics,
    shadowAtlasDepthOccupancy,
    shadowAtlasPointSample,
    shadowAtlasTerrainReceiverProbe,
    sourcePixelPickReport,
    stageLights,
    terrain,
    terrainShadowProbeMaterial,
    terrainShadowReceiverReport,
  };

  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    if (diagnosticMode && boolParam('animate', false)) timeNode.value += delta;
    if (controls.enabled) controls.update();
    lodReport = updateSoStylizedUnityMegaLods(
      mega.root,
      mega.manifest,
      camera,
      { lodBias: SOURCE_LOD_BIAS },
    );
    terrainTreeLodReport = terrain.trees?.update(
      camera,
      { lodBias: SOURCE_LOD_BIAS },
    ) ?? terrainTreeLodReport;
    const nextDetailReport = terrain.details?.update(camera);
    if (nextDetailReport?.changed) {
      detailReport = nextDetailReport;
      document.body.dataset.detailActiveInstanceCount = String(detailReport.activeInstanceCount);
      document.body.dataset.detailActivePatchCount = String(detailReport.activePatchCount);
    }
    if (post) {
      post.render(postProbe);
      if (diagnosticMode) {
        const shadowState = post.diagnostics.getShadowState();
        document.body.dataset.postShadowActiveOwnerCount = String(
          shadowState.activeOwnerCount,
        );
        document.body.dataset.postShadowCascadeCount = String(shadowState.cascadeCount);
        document.body.dataset.postShadowMapAllocatedCount = String(
          shadowState.cascades.filter((cascade) => cascade.mapAllocated).length,
        );
        document.body.dataset.postShadowNativeFrameExact = String(
          shadowState.nativeFrameExact,
        );
        globalThis.__TOONLAB_UNITY_SHOWCASE__.postShadowState = shadowState;
      }
    }
    else renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.unityReady = 'error';
  document.body.dataset.worldReady = 'error';
  if (error.soStylizedUnityRenderPhase) {
    document.body.dataset.postRenderPhaseFailed = error.soStylizedUnityRenderPhase;
  }
  if (error.frameOccupancyReport) {
    document.body.dataset.renderFrameGate = 'failed';
    document.body.dataset.renderFrameNonClear = 'false';
  }
  loadingElement.hidden = false;
  loadingElement.textContent = `Unity comparison failed: ${error.message}`;
  badgeElement.textContent = 'UNITY MEGA · ERROR';
  diagnosticElement.textContent = error.stack ?? error.message;
  statusElement.open = true;
});
