import * as THREE from 'three';
import { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  exp2,
  float,
  fog,
  max,
  mix,
  mrt,
  normalView,
  normalViewGeometry,
  output,
  positionWorld,
  sign,
  step,
  pass,
  uniform,
  velocity,
  vec3,
  vec4,
} from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';

import sourcePortLedger from '../../docs/source-shader-port-ledger.json';
import unityPortLedger from '../../docs/unity-shader-port-ledger.json';

import {
  UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT,
  UE_SOURCE_TONE_MAPPING,
  createUeSourceToneMapping,
} from '../../src/environment/ueSourceTonemapping.js';
import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
} from '../../src/environment/soStylizedUnityRendering.js';
import {
  configureSoStylizedUnityStageRenderer,
  createSoStylizedUnityStageLights,
  createSoStylizedUnityStagePostPipeline,
} from '../../src/environment/soStylizedUnityStage.js';
import {
  installSoStylizedUnityShadowCasterBias,
} from '../../src/environment/soStylizedUnityShadows.js';
import {
  computeUeCascadeBreaks,
  resolveUeDirectionalIntensity,
  resolveUePointLightContract,
  UE_SOURCE_STAGE_INPUT_SCALES,
} from '../../src/environment/ueSourceLighting.js';
import {
  installUeSourcePointLightNode,
} from '../../src/environment/ueSourcePointLightNode.js';
import {
  UeSourceCsmShadowNode,
} from '../../src/environment/ueSourceCsmShadowNode.js';
import {
  ueSourceStandardBloom,
} from '../../src/environment/ueSourceBloom.js';
import {
  createUeSourceVignetteMask,
  resolveUeSourceVignetteSettings,
} from '../../src/environment/ueSourceVignette.js';
import {
  createUeSourceDepthOfFieldNode,
  resolveUeSourceDepthOfFieldContract,
} from '../../src/environment/ueSourceDepthOfField.js';
import {
  UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT,
  resolveUeSourceAmbientOcclusionSettings,
  ueSourceAmbientOcclusion,
} from '../../src/environment/ueSourceAmbientOcclusion.js';

import {
  advanceSoStylizedSourceEnvironmentState,
  applySoStylizedNamedSourceMaterials,
  bindSoStylizedSourceCloudShadow,
  createUeSourceCapturedSkyLight,
  createSoStylizedSourceFogPostNode,
  createSoStylizedSourceEnvironmentState,
  installSoStylizedSourceCloudShadowLightNode,
  loadUeSourceTemporalDitherNoiseTexture,
  loadSoStylizedFogVolumeTexture,
  loadSoStylizedSourceLibrary,
  repairSoStylizedAuthoredBakeMaterials,
  SO_STYLIZED_CLOUD_SHADOW_DESERT,
  SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT,
  SO_STYLIZED_CLOUD_SHADOW_STANDARD,
  SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS,
  SO_STYLIZED_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS,
  UE_SOURCE_TEMPORAL_CONTRACT,
  ueSourceTraa,
  installUeSourceSkyLightNode,
  updateSoStylizedSourceEnvironmentState,
} from '@call-me-sensei/toonlab/environment';

const params = new URLSearchParams(location.search);
const DEMO_ROOT = '/assets-local/sostylized/demo-scenes';
const DEMO_GLTF = `${DEMO_ROOT}/Demonstration_SnowPines.glb`;
const DEMO_AUTHORED_GLTF = `${DEMO_ROOT}/Demonstration_SnowPines-authored.glb`;
const DEMO_MANIFEST = `${DEMO_ROOT}/Demonstration_SnowPines.json`;
const DEMO_NATIVE_SKYLIGHT =
  `${DEMO_ROOT}/native-reference/sky-light-irradiance.json`;
const validMaterialModes = new Set(['native', 'compare', 'baked', 'live']);
const requestedMaterialMode = validMaterialModes.has(params.get('material'))
  ? params.get('material')
  : 'native';
// ToonLab executes the source graphs, but the active *scene* owns its camera,
// sun, skylight, fog, post and terrain/foliage bindings. Applying the Unity
// Mega demonstration's world-space stage to Unreal SnowPines moved shadows
// and substituted unrelated terrain/culling data. Keep that exact Unity demo
// stage as an explicit diagnostic only; Rock Lab uses it as its baseline.
const requestedAuthority = 'toonlab';
const useUnityAuthority = params.get('stage') === 'unity-demo';
if (params.get('authority') && params.get('authority') !== 'toonlab') {
  params.set('authority', 'toonlab');
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
}
const activePortLedger = useUnityAuthority ? unityPortLedger : sourcePortLedger;
// The presentation baseline favors the stable Three/ACES output path. The
// UE curve remains available with `tone=ue` for renderer-forensics, but its
// current shadow/post bridge is not the best-looking production result.
const requestedToneMapper = useUnityAuthority
  ? 'unity-ldr-lut'
  : params.get('tone') ?? 'three';
const useUeToneMapper = !useUnityAuthority && requestedToneMapper.startsWith('ue');
const requestedCloudShadow = params.get('cloudShadow')?.trim() || 'source';
const requestedFogProfile = (() => {
  const value = params.get('fogPP')?.trim();
  return value && !/^(?:0|off|none)$/i.test(value) ? value : null;
})();

function countStatuses(entries, field) {
  return entries.reduce((counts, entry) => {
    const status = entry[field];
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function renderSourcePortStatus() {
  const shaderRuntime = countStatuses(activePortLedger.shaderFamilies, 'runtimePort');
  const hasSeparateParity = activePortLedger.shaderFamilies.some((entry) => entry.parity);
  const shaderParity = hasSeparateParity
    ? countStatuses(activePortLedger.shaderFamilies, 'parity')
    : shaderRuntime;
  const renderer = countStatuses(activePortLedger.rendererSystems, 'status');
  const parityLeft = activePortLedger.shaderFamilies.length - (shaderParity.complete ?? 0);
  const summary = document.querySelector('#port-status-summary');
  const body = document.querySelector('#port-status-body');

  summary.textContent = `PORTS · ${shaderRuntime.partial ?? 0} partial · ${shaderRuntime['not-started'] ?? 0} pending · ${parityLeft} parity left`;
  body.replaceChildren();

  const addHeading = (label) => {
    const heading = document.createElement('div');
    heading.className = 'port-status-heading';
    heading.textContent = label;
    body.append(heading);
  };
  const addRow = (label, value, status) => {
    const row = document.createElement('div');
    row.className = 'port-status-row';
    const name = document.createElement('span');
    const state = document.createElement('span');
    state.className = 'port-status-value';
    state.dataset.status = status;
    name.textContent = label;
    state.textContent = value;
    row.append(name, state);
    body.append(row);
  };

  addHeading(`Shader families (${parityLeft}/${activePortLedger.shaderFamilies.length} gates left)`);
  for (const entry of activePortLedger.shaderFamilies) {
    addRow(
      entry.family,
      hasSeparateParity ? `${entry.runtimePort} / ${entry.parity}` : entry.runtimePort,
      entry.runtimePort,
    );
  }
  addHeading(`Renderer systems (${renderer.complete ?? 0}/${activePortLedger.rendererSystems.length} complete)`);
  for (const entry of activePortLedger.rendererSystems) {
    addRow(entry.system, entry.status, entry.status);
  }

  document.body.dataset.shaderRuntimeComplete = String(shaderRuntime.complete ?? 0);
  document.body.dataset.shaderRuntimePartial = String(shaderRuntime.partial ?? 0);
  document.body.dataset.shaderRuntimeNotStarted = String(shaderRuntime['not-started'] ?? 0);
  document.body.dataset.shaderParityLeft = String(parityLeft);
  document.body.dataset.rendererComplete = String(renderer.complete ?? 0);
  document.body.dataset.rendererPartial = String(renderer.partial ?? 0);
  document.body.dataset.rendererNotStarted = String(renderer['not-started'] ?? 0);
}

renderSourcePortStatus();

function numberParam(name, fallback) {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function stageSize(aspect = 16 / 9) {
  const windowAspect = innerWidth / innerHeight;
  return windowAspect > aspect
    ? { height: innerHeight, width: Math.round(innerHeight * aspect) }
    : { height: Math.round(innerWidth / aspect), width: innerWidth };
}

function positionStageCanvas(canvas, width, height) {
  canvas.style.position = 'fixed';
  canvas.style.left = `${Math.round((innerWidth - width) / 2)}px`;
  canvas.style.top = `${Math.round((innerHeight - height) / 2)}px`;
}

function nativeReferenceUrl(index) {
  return `${DEMO_ROOT}/native-reference/CameraRender${index + 1}.png`;
}

function setQueryCamera(index) {
  const query = new URLSearchParams(location.search);
  query.set('camera', String(index + 1));
  history.replaceState(null, '', `${location.pathname}?${query}`);
}

async function loadManifest() {
  const response = await fetch(DEMO_MANIFEST, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(
      `Authored SnowPines scene data is unavailable (${response.status}). `
      + 'Run npm run export:environment-demo.',
    );
  }
  const manifest = await response.json();
  if (manifest?.schema !== 'toonlab.sostylized-demo-scene') {
    throw new Error('Invalid authored SnowPines scene manifest.');
  }
  return manifest;
}

function componentOf(manifest, componentClass, predicate = () => true) {
  return manifest.renderState?.components?.find(
    (component) => component.componentClass === componentClass && predicate(component),
  ) ?? null;
}

function unrealColor(value, fallback, linear = false) {
  if (!Array.isArray(value) || value.length < 3) return new THREE.Color(fallback);
  const color = new THREE.Color();
  if (linear || value.every((channel, index) => index > 2 || channel <= 1)) {
    color.setRGB(Number(value[0]), Number(value[1]), Number(value[2]));
  } else {
    color.setRGB(
      Number(value[0]) / 255,
      Number(value[1]) / 255,
      Number(value[2]) / 255,
      THREE.SRGBColorSpace,
    );
  }
  return color;
}

function unrealDirectionToThree(rotation, { direction: authoredDirection, flip = false } = {}) {
  if (Array.isArray(authoredDirection) && authoredDirection.length >= 3) {
    const direction = new THREE.Vector3(
      Number(authoredDirection[0]),
      Number(authoredDirection[2]),
      -Number(authoredDirection[1]),
    ).normalize();
    return flip ? direction.negate() : direction;
  }
  if (!Array.isArray(rotation) || rotation.length < 4) {
    return new THREE.Vector3(0.42, -0.78, 0.46).normalize();
  }
  // Unreal directional lights emit along their local +X axis. Unreal's
  // X/Y/Z world is exported to glTF/Three as X/Z/-Y.
  const unrealForward = new THREE.Vector3(1, 0, 0).applyQuaternion(
    new THREE.Quaternion(
      Number(rotation[0]),
      Number(rotation[1]),
      Number(rotation[2]),
      Number(rotation[3]),
    ),
  );
  const direction = new THREE.Vector3(
    unrealForward.x,
    unrealForward.z,
    -unrealForward.y,
  ).normalize();
  return flip ? direction.negate() : direction;
}

function configureSourceLights(root, manifest) {
  // The source path is radiometric: UE and Three both apply Lambert's 1/PI at
  // this boundary, so the authored directional intensity crosses unchanged.
  // sunScale is retained strictly as an explicit diagnostic override.
  const sunIntensityScale = numberParam(
    'sunScale',
    UE_SOURCE_STAGE_INPUT_SCALES.directionalLight,
  );
  const shadowsEnabled = params.get('shadows') !== '0';
  const renderCvars = manifest.projectSettings?.cvars ?? {};
  const renderCvar = (name, fallback) => {
    const value = Number(renderCvars[name]);
    return Number.isFinite(value) ? value : fallback;
  };
  const directionalState = componentOf(manifest, 'DirectionalLightComponent');
  const directionalProperties = directionalState?.properties ?? {};
  const pointStates = manifest.renderState?.components?.filter(
    (component) => component.componentClass === 'PointLightComponent',
  ) ?? [];
  let pointIndex = 0;
  const directionalLights = [];
  const cascadedShadows = [];
  const shadowDistance = Math.max(
    150,
    (Number(directionalProperties.dynamic_shadow_distance_movable_light) || 30000) * 0.01,
  );
  const cascadeCount = Math.max(
    1,
    Math.round(Number(directionalProperties.dynamic_shadow_cascades) || 4),
  );
  // The exported light is movable. FLightSceneInfo consequently reports its
  // precomputed state as valid (`!HasStaticShadowing()`), even though the
  // project disables static lighting, so UE uses the authored exponent 3.
  const cascadeExponent = Math.max(
    0.1,
    Number(directionalProperties.cascade_distribution_exponent) || 3,
  );
  const cascadeBreaks = computeUeCascadeBreaks({
    cascadeCount,
    exponent: cascadeExponent,
  });
  const configureDirectionalLight = (object) => {
    object.color.copy(unrealColor(directionalProperties.light_color, 0xffffff));
    object.intensity = resolveUeDirectionalIntensity(
      directionalProperties,
      sunIntensityScale,
    );
    object.castShadow = directionalProperties.cast_shadows !== false && shadowsEnabled;
    // Native reference captures use Epic shadow scalability: 2048 texels per
    // cascade, four view-relative CSM projections, and a 300 m shadow range.
    object.shadow.mapSize.set(2048, 2048);
    object.shadow.camera.left = -shadowDistance;
    object.shadow.camera.right = shadowDistance;
    object.shadow.camera.top = shadowDistance;
    object.shadow.camera.bottom = -shadowDistance;
    object.shadow.camera.near = 0.5;
    object.shadow.camera.far = shadowDistance * 2;
    // The UE source CSM installs its own per-cascade bias/filter contract.
    // These stock Three values remain neutral; query overrides are renderer
    // diagnostics and do not replace UE's constant or slope-scale formulas.
    object.shadow.bias = numberParam('shadowBias', 0);
    object.shadow.normalBias = numberParam('shadowNormalBias', 0);
    const distanceFieldShadowDistance = (
      Number(directionalProperties.distance_field_shadow_distance) || 0
    ) * 0.01;
    // Three's production CSM is stable on WebGPU. Keep the still-incomplete
    // UE raster-bias/filter reconstruction behind an explicit diagnostic.
    const useUeCsm = params.get('csm') === 'ue';
    const CsmNode = useUeCsm ? UeSourceCsmShadowNode : CSMShadowNode;
    const csm = new CsmNode(object, {
      cascades: cascadeCount,
      hasDistanceFieldContinuation: (
        directionalProperties.use_ray_traced_distance_field_shadows === true
        && distanceFieldShadowDistance > shadowDistance
      ),
      maxFar: shadowDistance,
      mode: 'custom',
      lightMargin: shadowDistance,
      maxDownsampleFactor: 4,
      minimumDepthExtent: numberParam('csmDepthExtent', 50),
      shadowBorderTexels: 4,
      cascadeBiasDistribution: Number.isFinite(
        Number(directionalProperties.shadow_cascade_bias_distribution),
      )
        ? Number(directionalProperties.shadow_cascade_bias_distribution)
        : 1,
      csmDepthBias: renderCvar('r.Shadow.CSMDepthBias', 10),
      csmSlopeScaleDepthBias: renderCvar('r.Shadow.CSMSlopeScaleDepthBias', 3),
      maxSlopeDepthBias: renderCvar('r.Shadow.ShadowMaxSlopeScaleDepthBias', 1),
      receiverBias: renderCvar('r.Shadow.CSMReceiverBias', 0.9),
      userShadowBias: Number.isFinite(Number(directionalProperties.shadow_bias))
        ? Number(directionalProperties.shadow_bias)
        : 0.5,
      userShadowSlopeBias: Number.isFinite(Number(directionalProperties.shadow_slope_bias))
        ? Number(directionalProperties.shadow_slope_bias)
        : 0.5,
      useUeReceiverFilter: params.get('shadowFilter') !== 'three',
      transitionFraction: Math.max(
        0,
        (Number(directionalProperties.cascade_transition_fraction) || 0.1)
          * renderCvar('r.Shadow.CSM.TransitionScale', 1),
      ),
      customSplitsCallback: (_amount, near, far, target) => {
        target.push(...computeUeCascadeBreaks({
          cascadeCount,
          exponent: cascadeExponent,
          near,
          far,
        }));
      },
    });
    csm.fade = true;
    object.shadow.shadowNode = csm;
    cascadedShadows.push(csm);
  };
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isLight) return;
    if (object.isDirectionalLight) {
      directionalLights.push(object);
      configureDirectionalLight(object);
    } else if (object.isPointLight) {
      const properties = pointStates[pointIndex]?.properties ?? {};
      pointIndex += 1;
      const contract = resolveUePointLightContract(properties);
      object.color.copy(unrealColor(properties.light_color, object.color));
      object.intensity = contract.intensity;
      object.distance = contract.attenuationRadiusMeters;
      // Stock Three uses inverse-distance decay plus a quartic cutoff window.
      // UE's non-inverse-square branch has no inverse-distance term; the
      // installed source node evaluates its normalized-radius exponent mask.
      object.decay = contract.useInverseSquaredFalloff
        ? object.decay
        : 0;
      object.castShadow = properties.cast_shadows === true;
      object.userData.ueSourcePointLight = contract;
    }
  });
  if (directionalLights.length === 0) {
    const sourceSun = new THREE.DirectionalLight();
    sourceSun.name = 'Authored SkyDirectionalLight';
    configureDirectionalLight(sourceSun);
    root.add(sourceSun);
    directionalLights.push(sourceSun);
  }

  const sunDirection = unrealDirectionToThree(directionalState?.transform?.rotation, {
    direction: directionalState?.direction,
    flip: params.get('sunFlip') === '1',
  });
  const targetWorld = new THREE.Vector3(0, -35, 0);
  for (const light of directionalLights) {
    const sourceWorld = targetWorld.clone().addScaledVector(sunDirection, -500);
    // CSMShadowNode derives its placeholder-light direction by subtracting the
    // original light and target *local* positions. Keep both under one parent;
    // the imported KHR light otherwise remains inside the actor hierarchy while
    // its corrected target lives at the scene root, which leaves direct light
    // correct but points every cascade camera in the wrong direction.
    if (light.parent !== root) {
      light.removeFromParent();
      root.add(light);
    }
    light.position.copy(root.worldToLocal(sourceWorld));
    // GLTFLoader parents KHR_lights_punctual directional targets to the light
    // itself. Three's DirectionalLight expects the target in world/scene space;
    // leaving it parented makes position and target move together, erasing the
    // authored direction entirely.
    if (light.target.parent !== root) {
      light.target.removeFromParent();
      root.add(light.target);
    }
    light.target.position.copy(root.worldToLocal(targetWorld.clone()));
    light.target.updateWorldMatrix(true, false);
  }
  return {
    cascadeBreaks,
    cascadeCount,
    cascadeExponent,
    cascadedShadows,
    count: directionalLights.length,
    direction: sunDirection,
    lights: directionalLights,
    csmMode: params.get('csm') === 'ue' ? 'ue-diagnostic' : 'three-production',
    shadowsEnabled,
    shadowDistance,
  };
}

function configureUnitySourceLights(root, manifest) {
  const contract = SO_STYLIZED_UNITY_RENDER_CONTRACT;
  const directionalState = componentOf(manifest, 'DirectionalLightComponent');
  // The material/BRDF equations come from Unity URP, but an apple-to-apple
  // scene comparison must illuminate the imported SnowPines geometry from
  // SnowPines' authored direction. The Unity Mega demo is rotated relative to
  // this level; reusing its world vector moves every cast and self shadow.
  const sceneRayDirection = unrealDirectionToThree(
    directionalState?.transform?.rotation,
    { direction: directionalState?.direction },
  );
  const stage = createSoStylizedUnityStageLights(root, {
    castShadow: params.get('shadows') !== '0',
    rayDirection: sceneRayDirection.toArray(),
    target: [0, -35, 0],
  });
  stage.light.intensity *= numberParam('sunScale', 1);

  return {
    ambient: stage.ambient,
    cascadeBreaks: [...contract.shadows.cascadeSplits],
    cascadeCount: contract.shadows.cascadeCount,
    cascadeExponent: 0,
    cascadedShadows: stage.cascadedShadows,
    count: 1,
    direction: stage.direction,
    directionAuthority: 'SnowPines authored directional-light vector',
    directionToLight: stage.directionToLight,
    lights: [stage.light],
    csmMode: 'toonlab-source-urp',
    importedLightCountRemoved: stage.importedLightCountRemoved,
    remainingBridges: stage.remainingBridges,
    shadowsEnabled: stage.light.castShadow,
    shadowDistance: contract.shadows.distance,
  };
}

function configureUnitySourceRenderState({ renderer, scene }) {
  const contract = SO_STYLIZED_UNITY_RENDER_CONTRACT;
  const rendererMetadata = configureSoStylizedUnityStageRenderer(renderer, scene);
  return {
    exposureBias: contract.colorGrade.postExposure,
    exposureEv100: 0,
    exposureMultiplier: 1,
    fogDensity: contract.fog.density,
    fogDensityScale: 1,
    post: contract,
    rendererMetadata,
    skyLightIntensity: contract.ambientProbe.intensity
      * contract.ambientProbe.threeLambertInputScale,
    skyLightMode: 'unity-constant-sh0',
    sunIntensityScale: 1,
  };
}

function installToonLabSourceShadowCasters(root, directionToLight) {
  const materials = new Set();
  const rockMaterials = new Set();
  const rockBindings = [];
  let casterMeshCount = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.castShadow || !object.material) return;
    casterMeshCount += 1;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (!material?.isNodeMaterial || materials.has(material)) continue;
      materials.add(material);
      if (!material.userData?.soStylizedUnityShadowCaster) {
        installSoStylizedUnityShadowCasterBias(material, { directionToLight });
      }
      if (material.userData?.soStylizedSource?.family === 'rock') {
        rockMaterials.add(material);
        const source = material.userData.soStylizedSource;
        rockBindings.push({
          exact: Boolean(source.unityExactProfile),
          matchKind: source.unityMatchKind ?? null,
          path: source.materialPath ?? null,
          profileId: source.unityProfileId ?? null,
          unityMaterial: source.unityMaterial ?? null,
        });
      }
    }
  });
  return {
    casterMaterialCount: materials.size,
    casterMeshCount,
    rockBindings,
    rockMaterialCount: rockMaterials.size,
  };
}

function unitySkyLightDiagnostics(sourceSun) {
  const contract = SO_STYLIZED_UNITY_RENDER_CONTRACT;
  const color = new THREE.Color().setRGB(
    ...contract.ambientProbe.coefficient0Linear,
    THREE.LinearSRGBColorSpace,
  );
  return {
    ambient: sourceSun.ambient,
    bridges: [],
    captureFar: 0,
    captureMeshCount: 0,
    captureTint: color,
    contract: {
      captureResolution: 0,
      diffuseCubemapSize: 0,
      diffuseMipLevel: 0,
      skyDistanceThresholdMeters: 0,
    },
    diffuseSh: [contract.ambientProbe.coefficient0Linear, ...Array.from(
      { length: 8 },
      () => [0, 0, 0],
    )],
    fogParticipation: true,
    intensity: contract.ambientProbe.intensity,
    lowerHemisphereColor: color.clone(),
    mode: 'unity-constant-sh0',
    sourceSkyMeshCount: 0,
  };
}

function unityCloudShadowDiagnostics() {
  return {
    authoredProfile: null,
    bindings: [],
    bridges: [],
    enabled: false,
    mode: 'off-unity-source-scene',
    profile: null,
  };
}

async function configureSourceCloudShadow({ library, manifest, sourceSun, state }) {
  const component = componentOf(manifest, 'DirectionalLightComponent');
  const authoredProfile = component?.properties?.light_function_material ?? null;
  const requested = requestedCloudShadow.toLowerCase();
  let profile = null;
  let mode = requested;

  if (['0', 'off', 'none'].includes(requested)) {
    mode = 'off-query';
  } else if (requested === 'source') {
    profile = authoredProfile;
    mode = profile ? 'source-scene' : 'off-source-scene';
  } else if (['1', 'on', 'standard'].includes(requested)) {
    profile = SO_STYLIZED_CLOUD_SHADOW_STANDARD;
    mode = 'standard-query';
  } else if (requested === 'desert') {
    profile = SO_STYLIZED_CLOUD_SHADOW_DESERT;
    mode = 'desert-query';
  } else {
    // An exact Unreal object path is also accepted as an audit/probe input.
    profile = requestedCloudShadow;
    mode = 'profile-query';
  }

  if (!profile) {
    return {
      authoredProfile,
      bindings: [],
      bridges: [...SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.remainingBridges],
      enabled: false,
      mode,
      profile: null,
    };
  }

  const bindings = await Promise.all(sourceSun.lights.map((light) => (
    bindSoStylizedSourceCloudShadow(light, {
      component,
      library,
      profile,
      state,
    })
  )));
  return {
    authoredProfile,
    bindings,
    bridges: bindings[0]?.bridges
      ?? [...SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.remainingBridges],
    enabled: bindings.length > 0,
    mode,
    profile: bindings[0]?.profile ?? library.resolveMaterial(profile),
  };
}

async function configureSourceSkyLight({ manifest, renderer, root, scene }) {
  const skyLightState = componentOf(manifest, 'SkyLightComponent');
  const intensityScale = numberParam(
    'iblScale',
    UE_SOURCE_STAGE_INPUT_SCALES.skyLight,
  );
  const response = await fetch(DEMO_NATIVE_SKYLIGHT);
  if (!response.ok) {
    throw new Error(
      `Exact native SkyLight SH is required (${response.status} ${DEMO_NATIVE_SKYLIGHT})`,
    );
  }
  const irradiance = await response.json();
  if (
    irradiance?.schema !== 'toonlab.ue-skylight-irradiance'
    || !Array.isArray(irradiance.threeCoefficients)
    || irradiance.threeCoefficients.length !== 9
  ) {
    throw new Error(`Invalid native SkyLight SH artifact: ${DEMO_NATIVE_SKYLIGHT}`);
  }
  return createUeSourceCapturedSkyLight({
    component: skyLightState,
    diffuseCoefficients: irradiance.threeCoefficients,
    enabled: params.get('ibl') !== '0',
    intensityScale,
    renderer,
    root,
    scene,
  });
}

function configureSourceRenderState({ manifest, renderer, scene, skyLight }) {
  const sunIntensityScale = numberParam(
    'sunScale',
    UE_SOURCE_STAGE_INPUT_SCALES.directionalLight,
  );
  const fogDensityScale = numberParam(
    'fogScale',
    UE_SOURCE_STAGE_INPUT_SCALES.fogDensity,
  );

  const fogState = componentOf(manifest, 'ExponentialHeightFogComponent');
  const fogProperties = fogState?.properties ?? {};
  const fogColor = unrealColor(
    fogProperties.fog_inscattering_luminance ?? fogProperties.volumetric_fog_emissive,
    0x789bc4,
    true,
  );
  // Port HeightFogCommon.ush rather than approximating UE height fog with
  // Three's radial FogExp2. UE stores density/falloff scaled by 1000 and
  // evaluates its analytic line integral in centimeters after a start
  // distance. glTF converted source centimeters to Three meters, so rebuild
  // those units explicitly here.
  const fogDensityPerCm = Math.max(
    0,
    ((Number(fogProperties.fog_density) || 0) / 1000) * fogDensityScale,
  );
  const fogDensity = fogDensityPerCm * 100;
  if (fogDensityPerCm > 0) {
    const fogState = componentOf(manifest, 'ExponentialHeightFogComponent');
    const fogHeightCm = Number(fogState?.transform?.translation?.[2]) || 0;
    const heightFalloffPerCm = Math.max(
      0,
      (Number(fogProperties.fog_height_falloff) || 0) / 1000,
    );
    const startDistanceMeters = Math.max(
      0,
      (Number(fogProperties.start_distance) || 0) / 100,
    );
    const cameraToReceiver = positionWorld.sub(cameraPosition);
    const cameraToReceiverMeters = max(cameraToReceiver.length(), 0.000001);
    const exclusionAlpha = clamp(
      float(startDistanceMeters).div(cameraToReceiverMeters),
      0,
      1,
    );
    const rayLengthCm = max(
      cameraToReceiverMeters.sub(startDistanceMeters),
      0,
    ).mul(100);
    const rayDirectionHeightCm = cameraToReceiver.y
      .mul(float(1).sub(exclusionAlpha))
      .mul(100);
    const exclusionHeightCm = cameraPosition.y
      .add(cameraToReceiver.y.mul(exclusionAlpha))
      .mul(100);
    const exponent = max(
      float(heightFalloffPerCm).mul(exclusionHeightCm.sub(fogHeightCm)),
      -127,
    );
    const rayOriginTerms = exp2(exponent.negate()).mul(fogDensityPerCm);
    const falloff = max(
      float(heightFalloffPerCm).mul(rayDirectionHeightCm),
      -127,
    );
    const absoluteFalloff = abs(falloff);
    const safeSign = mix(float(1), sign(falloff), step(0.000001, absoluteFalloff));
    const safeFalloff = safeSign.mul(max(absoluteFalloff, 0.000001));
    const lineIntegral = float(1).sub(exp2(falloff.negate())).div(safeFalloff);
    const lineIntegralTaylor = float(Math.LN2)
      .sub(falloff.mul(0.5 * Math.LN2 * Math.LN2));
    const sharedLineIntegral = rayOriginTerms.mul(mix(
      lineIntegralTaylor,
      lineIntegral,
      step(0.000001, absoluteFalloff),
    ));
    const fogFactor = exp2(sharedLineIntegral.mul(rayLengthCm).negate()).oneMinus();
    scene.fog = null;
    scene.fogNode = fog(
      vec3(fogColor.r, fogColor.g, fogColor.b),
      clamp(fogFactor, 0, Number(fogProperties.fog_max_opacity) || 1),
    );
  }

  const postState = componentOf(
    manifest,
    'PostProcessComponent',
    (component) => component.properties?.unbound === true,
  );
  const post = postState?.postProcessSettings ?? {};
  const authoredExposureBias = Number(post.auto_exposure_bias) || 0;
  const minEv100 = Number(post.auto_exposure_min_brightness);
  const maxEv100 = Number(post.auto_exposure_max_brightness);
  const hasLockedEv100 = Number.isFinite(minEv100)
    && Number.isFinite(maxEv100)
    && Math.abs(minEv100 - maxEv100) <= Number.EPSILON;
  // UE 5.8 PostProcessEyeAdaptation.cpp computes a fixed exposure as:
  //   0.18 / (0.18 * LuminanceMax * 2^EV100) * 2^Bias
  // Extended luminance is enabled in the source project and UE's default
  // lens attenuation is 0.78, so LuminanceMax = 0.78 / 0.78 = 1. The
  // SnowPines volume locks both bounds to EV100 1 with bias 1, producing an
  // exact multiplier of 1. Keep the query override for controlled probes.
  const sourceExposure = hasLockedEv100
    ? 2 ** (authoredExposureBias - minEv100)
    : 1;
  renderer.toneMappingExposure = numberParam('exposure', sourceExposure);
  // The UE tone-mapping implementation applies the authored global
  // saturation in AP1, just as CombineLUT does. CSS saturation remains only
  // on the stock-Three diagnostic path to avoid applying it twice.
  renderer.domElement.style.filter = useUeToneMapper
    ? 'none'
    : `saturate(${Number(post.color_saturation?.[0]) || 1})`;

  return {
    exposureBias: authoredExposureBias,
    exposureEv100: hasLockedEv100 ? minEv100 : null,
    exposureMultiplier: renderer.toneMappingExposure,
    fogDensity,
    fogDensityScale,
    post,
    skyLightIntensity: skyLight.intensity,
    skyLightMode: skyLight.mode,
    sunIntensityScale,
  };
}

function cameraLabel(index) {
  return `Source Camera ${String(index + 1).padStart(2, '0')}`;
}

function sourceCameraStates(manifest) {
  return (manifest.renderState?.components ?? [])
    .filter((component) => component.componentClass === 'CineCameraComponent')
    .sort((a, b) => String(a.actor).localeCompare(
      String(b.actor),
      undefined,
      { numeric: true, sensitivity: 'base' },
    ));
}

function createSourcePostPipeline({
  camera,
  cameraState,
  fogVolumeTexture,
  library,
  postSettings,
  projectSettings,
  renderer,
  scene,
  state,
}) {
  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({
    normal: normalView,
    output,
    velocity,
  }));
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneNormal = scenePass.getTextureNode('normal');
  const sceneVelocity = scenePass.getTextureNode('velocity');
  const sceneViewZ = scenePass.getViewZNode();
  // UE 5.8 PostProcessing.cpp executes DiaphragmDOF, the AfterDOF material
  // chain, and only then the selected main temporal upscaler. Preserve that
  // ordering here; resolving history before DOF makes the final image softer
  // in a way the supplied SnowPines capture never is.
  const postStageOrder = ['scene', 'ao', 'dof', 'fog', 'temporal', 'bloom', 'full'];
  const requestedPostStage = params.get('postStage') ?? 'full';
  const postStage = postStageOrder.includes(requestedPostStage)
    ? requestedPostStage
    : 'full';
  const postStageIndex = postStageOrder.indexOf(postStage);
  const includesPostStage = (name) => postStageIndex >= postStageOrder.indexOf(name);
  const aoPostSettings = {
    ...postSettings,
    ambient_occlusion_intensity: params.get('ao') === '0'
      ? 0
      : params.has('aoIntensity')
        ? numberParam('aoIntensity', 0.5)
        : postSettings?.ambient_occlusion_intensity,
    // Preserve the old diagnostic URL's metre unit while restoring UE's
    // source-centimetre setting and view-locked radius semantics internally.
    ambient_occlusion_radius: params.has('aoRadius')
      ? numberParam('aoRadius', 1.6) * 100
      : Number(postSettings?.ambient_occlusion_radius) || 160,
    ambient_occlusion_power: numberParam(
      'aoPower',
      Number(postSettings?.ambient_occlusion_power) || 2,
    ),
  };
  const ambientOcclusionOptions = {
    cvars: projectSettings?.cvars ?? {},
    postProcessQuality:
      projectSettings?.scalability?.['sg.PostProcessQuality'] ?? 3,
    projectEnabled: true,
    projectStaticFraction: true,
    resolutionScale: numberParam('aoResolution', 1),
    samples: params.has('aoSamples')
      ? numberParam('aoSamples', 4)
      : undefined,
    temporalSampleIndex: state?.uniforms?.temporalSampleIndex,
  };
  const ambientOcclusionEnabled = includesPostStage('ao');
  const ambientOcclusion = ambientOcclusionEnabled
    ? ueSourceAmbientOcclusion(
      sceneDepth,
      sceneNormal,
      sceneViewZ,
      camera,
      aoPostSettings,
      ambientOcclusionOptions,
    )
    : {
      contract: UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT,
      outputNode: float(1),
      settings: resolveUeSourceAmbientOcclusionSettings(
        aoPostSettings,
        ambientOcclusionOptions,
      ),
    };
  const aoIntensity = ambientOcclusionEnabled
    ? ambientOcclusion.settings.intensity
    : 0;
  const aoFactor = ambientOcclusion.outputNode;
  const occludedSceneColor = sceneColor.mul(vec4(vec3(aoFactor), 1));
  const initialDofWidth = renderer.getDrawingBufferSize(new THREE.Vector2()).x;
  let dofContract = resolveUeSourceDepthOfFieldContract(cameraState, {
    horizontalResolution: initialDofWidth,
  });
  const depthOfFieldEnabled = params.get('dof') !== '0' && includesPostStage('dof');
  const depthOfField = !depthOfFieldEnabled
    ? occludedSceneColor
    : createUeSourceDepthOfFieldNode(
      occludedSceneColor,
      sceneViewZ,
      dofContract,
    );
  if (depthOfField.ueUniforms && params.has('dofScale')) {
    depthOfField.ueUniforms.kernelRadiusPixels.value = numberParam(
      'dofScale',
      dofContract.maxKernelRadiusPixels,
    );
  }
  // M_StylizedFogPP is authored at BL_SCENE_COLOR_AFTER_DOF. The supplied
  // SnowPines source scene uses BP_StylizedSky_Lite, whose unbound post volume
  // has no weighted blendable, so this family stays off unless `fogPP` is set.
  const sourceFog = requestedFogProfile && includesPostStage('fog')
    ? createSoStylizedSourceFogPostNode({
      library,
      profile: requestedFogProfile,
      sceneColor: depthOfField,
      sceneDepth,
      state,
      volumeTexture: fogVolumeTexture,
    })
    : null;
  const afterDepthOfField = sourceFog?.outputNode ?? depthOfField;
  const temporalAA = params.get('taa') === '0' || !includesPostStage('temporal')
    ? null
    : ueSourceTraa(afterDepthOfField, sceneDepth, sceneVelocity, camera, {
      initialSampleIndex: numberParam('taaSample', 0),
      state,
    });
  const resolvedSceneColor = temporalAA ?? afterDepthOfField;
  const bloomPass = includesPostStage('bloom')
    ? ueSourceStandardBloom(resolvedSceneColor, {
    ...postSettings,
    // Query overrides remain diagnostic probes. With no override the live
    // path consumes the exported SnowPines BM_SOG intensity 5 / threshold .5
    // and UE's unchanged six Gaussian defaults.
    bloom_intensity: numberParam(
      'bloom',
      Number(postSettings?.bloom_intensity) || 0,
    ),
    bloom_threshold: numberParam(
      'bloomThreshold',
      Number(postSettings?.bloom_threshold),
    ),
    })
    : null;
  const vignetteSettings = resolveUeSourceVignetteSettings({
    ...postSettings,
    aspectRatio: 9 / 16,
    vignette_intensity: numberParam(
      'vignette',
      Number(postSettings?.vignette_intensity),
    ),
  });
  const vignetteEnabled = includesPostStage('full');
  const vignetteMask = vignetteEnabled
    ? createUeSourceVignetteMask(vignetteSettings)
    : vec3(1);
  const pipeline = new RenderPipeline(renderer);
  // The RGB grade predates the UE curve and compensates for Three's ACES fit.
  // It must be neutral on the authored path or the comparison is no longer an
  // apples-to-apples render of the source post-process volume.
  pipeline.outputNode = (bloomPass ? resolvedSceneColor.add(bloomPass) : resolvedSceneColor)
    .mul(vec4(vignetteMask, 1))
    .mul(vec4(
      numberParam('gradeRed', useUeToneMapper ? 1 : 0.97),
      numberParam('gradeGreen', useUeToneMapper ? 1 : 1.05),
      numberParam('gradeBlue', useUeToneMapper ? 1 : 1.4),
      1,
    ));
  return {
    ambientOcclusion,
    ambientOcclusionEnabled,
    aoIntensity,
    temporalAA,
    pipeline,
    bloomPass,
    depthOfField,
    depthOfFieldEnabled,
    get dofContract() {
      return dofContract;
    },
    vignetteSettings,
    vignetteEnabled,
    postStage,
    sourceFog,
    temporalContract: temporalAA?.contract ?? null,
    update(cameraState) {
      const width = renderer.getDrawingBufferSize(new THREE.Vector2()).x;
      dofContract = resolveUeSourceDepthOfFieldContract(cameraState, {
        horizontalResolution: width,
      });
      if (depthOfField.ueUniforms) {
        depthOfField.ueContract = dofContract;
        depthOfField.ueUniforms.focusDistance.value = dofContract.focusDistanceMeters;
        depthOfField.ueUniforms.infinityRadius.value = dofContract.infinityBackgroundCocRadius;
        depthOfField.ueUniforms.kernelRadiusPixels.value = params.has('dofScale')
          ? numberParam('dofScale', dofContract.maxKernelRadiusPixels)
          : dofContract.maxKernelRadiusPixels;
      }
      temporalAA?.reset(numberParam('taaSample', 0));
    },
    resize(width) {
      dofContract = {
        ...dofContract,
        horizontalResolution: width,
        infinityBackgroundCocRadiusPixels:
          width * Math.min(dofContract.infinityBackgroundCocRadius, 0.025),
        maxKernelRadiusPixels: width * 0.025,
      };
      if (depthOfField.ueUniforms && !params.has('dofScale')) {
        depthOfField.ueContract = dofContract;
        depthOfField.ueUniforms.kernelRadiusPixels.value = dofContract.maxKernelRadiusPixels;
      }
    },
  };
}

function createUnitySourcePostPipeline({ camera, renderer, scene }) {
  const contract = SO_STYLIZED_UNITY_RENDER_CONTRACT;
  const ambientOcclusionEnabled = params.get('ao') !== '0';
  const bloomEnabled = params.get('bloom') !== '0';
  const fogEnabled = params.get('fog') !== '0';
  const gradeEnabled = params.get('grade') !== '0';
  const taaEnabled = params.get('taa') !== '0';
  const vignetteEnabled = params.get('vignette') !== '0';
  const stage = createSoStylizedUnityStagePostPipeline({
    ambientOcclusion: ambientOcclusionEnabled,
    bloom: bloomEnabled,
    camera,
    fog: fogEnabled,
    grade: gradeEnabled,
    renderer,
    scene,
    taa: taaEnabled,
    taaSampleIndex: numberParam('taaSample', 0),
    vignette: vignetteEnabled,
  });
  const ambientOcclusion = stage.ambientOcclusion;
  if (ambientOcclusion) {
    ambientOcclusion.settings = {
      fullResolution: {
        radiusInShader: contract.ssao.radiusInShader,
        sampleLookups: contract.ssao.sampleCount,
      },
      halfResolution: null,
      intensity: contract.ssao.intensity,
      levels: 1,
      method: contract.ssao.method,
      quality: contract.ssao.samplesPreset,
      radiusCm: contract.ssao.radius * 100,
      radiusInWorldSpace: true,
      shaderQuality: contract.ssao.samplesPreset,
    };
  }
  const temporalAA = stage.temporalAA;
  const bloomPass = stage.bloom;
  return {
    ambientOcclusion,
    ambientOcclusionEnabled,
    aoApplication: stage.metadata.aoApplication,
    aoIntensity: ambientOcclusionEnabled ? contract.ssao.intensity : 0,
    bloomPass,
    depthOfField: temporalAA,
    depthOfFieldEnabled: false,
    dofContract: null,
    fogEnabled,
    gradeEnabled,
    pipeline: stage.pipeline,
    postStage: 'toonlab-source-full',
    sourceFog: null,
    temporalAA,
    temporalContract: temporalAA?.contract ?? null,
    vignetteEnabled,
    vignetteSettings: {
      aspectRatio: 1,
      intensity: contract.vignette.intensity,
      type: 'Unity URP radial squared-distance',
    },
    update() {
      stage.update();
    },
    resize() {},
  };
}

function prepareBakedSourceMaterials(root, renderer) {
  const materials = new Set();
  const maxAnisotropy = renderer.capabilities?.getMaxAnisotropy?.() ?? 8;
  let meshCount = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    meshCount += 1;
    object.castShadow = true;
    object.receiveShadow = true;
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      material.alphaToCoverage = material.alphaTest > 0;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'specularIntensityMap']) {
        if (material[key]) material[key].anisotropy = Math.min(8, maxAnisotropy);
      }
    });
  });
  return { materialCount: materials.size, meshCount, unresolved: [] };
}

function auditSourceMaterialLightingAdapters(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) if (material) materials.add(material);
  });

  const adapterCounts = {
    none: 0,
    ueDefaultLit: 0,
    ueSubsurface: 0,
    unityUrp: 0,
  };
  const familyCounts = {};
  const mismatches = [];
  let rockMountainExactCount = 0;
  for (const material of materials) {
    const source = material.userData?.soStylizedSource ?? {};
    const family = source.family ?? 'unclassified';
    familyCounts[family] = (familyCounts[family] ?? 0) + 1;
    const unity = material.userData?.soStylizedUnityUrpLighting;
    const defaultLit = material.userData?.ueSourceDefaultLitLighting;
    const subsurface = material.userData?.ueSourceSubsurfaceLighting;
    if (unity) adapterCounts.unityUrp += 1;
    else if (defaultLit) adapterCounts.ueDefaultLit += 1;
    else if (subsurface) adapterCounts.ueSubsurface += 1;
    else adapterCounts.none += 1;

    if (family === 'rock' || family === 'mountain') {
      if (unity?.inputAdapter === 'ue-captured-scene-sh') {
        rockMountainExactCount += 1;
      } else {
        mismatches.push({
          adapter: unity?.inputAdapter ?? null,
          family,
          material: material.name,
        });
      }
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Rock/mountain materials lost the UE captured-SkyLight boundary: ${JSON.stringify(mismatches)}`,
    );
  }
  return {
    adapterCounts,
    familyCounts,
    mismatches,
    rockMountainExactCount,
    uniqueMaterialCount: materials.size,
  };
}

/**
 * Apply the exported UPrimitiveComponent render flags to the matching glTF
 * actor/component hierarchy. Material reconstruction cannot infer these:
 * CastShadow is authored on the component in Unreal, not on its material.
 */
function applyAuthoredMeshRenderMetadata(root, manifest) {
  const actorNodes = new Map(root.children.map((object) => [object.name, object]));
  const missing = [];
  let componentCount = 0;
  let matchedComponentCount = 0;
  let meshCount = 0;
  let shadowDisabledComponentCount = 0;
  let shadowDisabledMeshCount = 0;
  let visibilityDisabledMeshCount = 0;

  for (const actor of manifest.actors ?? []) {
    const actorNode = actorNodes.get(actor.label) ?? actorNodes.get(actor.name);
    if (!actorNode) {
      missing.push({ actor: actor.label, component: null });
      continue;
    }

    for (const component of actor.staticMeshes ?? []) {
      componentCount += 1;
      // Instanced foliage, water, and sky export a named component group.
      // A conventional one-component StaticMeshActor exports the mesh on the
      // actor node itself, so use that exact single-component fallback.
      const componentNode = actorNode.getObjectByName(component.name)
        ?? (actor.staticMeshes.length === 1 ? actorNode : null);
      if (!componentNode) {
        missing.push({ actor: actor.label, component: component.name });
        continue;
      }

      matchedComponentCount += 1;
      const properties = component.renderProperties ?? {};
      const visible = component.visible !== false && component.hiddenInGame !== true;
      const castsDynamicShadow = properties.cast_shadow !== false
        && properties.cast_dynamic_shadow !== false;
      if (!castsDynamicShadow) shadowDisabledComponentCount += 1;
      componentNode.visible = visible;
      componentNode.traverse((object) => {
        if (!object.isMesh) return;
        meshCount += 1;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        const materialAllowsShadow = materials.some(
          (material) => material?.userData?.soStylizedSource?.contract?.castShadow !== false,
        );
        const effectiveCastShadow = castsDynamicShadow && materialAllowsShadow;
        object.castShadow = effectiveCastShadow;
        object.userData.ueSourceRenderMetadata = {
          affectDistanceFieldLighting: properties.affect_distance_field_lighting !== false,
          boundsScale: Number(properties.bounds_scale) || 1,
          castDynamicShadow: effectiveCastShadow,
          componentCastDynamicShadow: castsDynamicShadow,
          materialAllowsShadow,
          evaluateWorldPositionOffset: properties.evaluate_world_position_offset !== false,
          forcedLodModel: Number(properties.forced_lod_model) || 0,
          minLod: Number(properties.min_lod) || 0,
          visible,
        };
        if (!effectiveCastShadow) shadowDisabledMeshCount += 1;
        if (!visible) visibilityDisabledMeshCount += 1;
      });
    }
  }

  return {
    componentCount,
    matchedComponentCount,
    meshCount,
    missing,
    shadowDisabledComponentCount,
    shadowDisabledMeshCount,
    visibilityDisabledMeshCount,
  };
}

function normalizeSourceSkyDomes(root) {
  root.updateWorldMatrix(true, true);
  let normalized = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const families = materials.map((material) => material?.userData?.soStylizedSource?.family);
    const isSky = families.includes('sky');
    const isClouds = families.includes('clouds');
    if (!isSky && !isClouds) return;
    object.geometry.computeBoundingSphere();
    const radius = object.geometry.boundingSphere?.radius ?? 0;
    if (!(radius > 0)) return;
    const worldScale = object.getWorldScale(new THREE.Vector3());
    const currentRadius = radius * Math.max(worldScale.x, worldScale.y, worldScale.z);
    const targetRadius = isClouds ? 850 : 900;
    // Keep the authored transform for the SkyLight capture. The visible
    // browser camera needs a finite 2 km far plane, but UE captures this dome
    // at its original distance behind the exact 1.5 km near threshold.
    object.userData.ueSourceSkyCapture = {
      localScale: object.scale.toArray(),
      originalWorldRadius: currentRadius,
    };
    object.scale.multiplyScalar(targetRadius / currentRadius);
    object.frustumCulled = false;
    object.renderOrder = isClouds ? -999 : -1000;
    // Preserve the source material's depth state. The pack's sky is opaque
    // and its masked cloud shell writes depth after the 1/3 clip. Forcing
    // either dome into a conventional transparent-sky state breaks cloud
    // occlusion, height fog, and the captured-scene skylight.
    normalized += 1;
  });
  root.updateWorldMatrix(true, true);
  return normalized;
}

async function main() {
  const renderer = new WebGPURenderer({
    // The source project uses temporal AA. TRAA owns sub-pixel jitter and its
    // history buffer, so hardware MSAA must be disabled on the matching path.
    antialias: useUnityAuthority
      ? false
      : params.get('taa') === '0',
    forceWebGL: params.get('renderer') === 'webgl',
    // Unity uses a reversed-Z projection, which is essential for the active
    // camera's 1m..500km range. WebGPU supports the same depth convention.
    reversedDepthBuffer: useUnityAuthority,
    // The exact SnowPines Landscape graph uses 35 sampled textures after
    // lighting/shadow resources are included. The active adapter exposes 48;
    // request that capability instead of deleting authored graph nodes to fit
    // WebGPU's conservative default limit of 16.
    requiredLimits: { maxSampledTexturesPerShaderStage: 48 },
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, numberParam('dpr', 1.5)));
  const initialStage = stageSize();
  renderer.setSize(initialStage.width, initialStage.height);
  renderer.toneMapping = useUnityAuthority
    ? THREE.NoToneMapping
    : useUeToneMapper
      ? UE_SOURCE_TONE_MAPPING
      : THREE.ACESFilmicToneMapping;
  // The source macOS capture's Filmic LUT already writes explicit gamma-2.2
  // display codes. Keep Three's final output in its linear transfer mode so
  // RenderOutputNode does not append an sRGB OETF to those encoded values.
  renderer.outputColorSpace = useUeToneMapper
    ? THREE.LinearSRGBColorSpace
    : THREE.SRGBColorSpace;
  renderer.toneMappingExposure = numberParam('exposure', 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  positionStageCanvas(renderer.domElement, initialStage.width, initialStage.height);
  await renderer.init();
  if (!useUnityAuthority) {
    installUeSourcePointLightNode(renderer);
    installUeSourceSkyLightNode(renderer);
    installSoStylizedSourceCloudShadowLightNode(renderer);
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1686cf);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 500;

  const loader = new GLTFLoader();
  const [manifest, gltf] = await Promise.all([
    loadManifest(),
    loader.loadAsync(
      requestedMaterialMode === 'live' || requestedMaterialMode === 'compare'
        ? DEMO_GLTF
        : DEMO_AUTHORED_GLTF,
    ),
  ]);
  if (!useUnityAuthority && useUeToneMapper) {
    const postState = componentOf(
      manifest,
      'PostProcessComponent',
      (component) => component.properties?.unbound === true,
    );
    const authoredPost = postState?.postProcessSettings ?? {};
    const toneMappingFunction = createUeSourceToneMapping(authoredPost, {
      outputTransfer: UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT,
    });
    renderer.library.addToneMapping(toneMappingFunction, UE_SOURCE_TONE_MAPPING);
  }
  const [library, temporalDitherNoiseTexture] = await Promise.all([
    loadSoStylizedSourceLibrary(),
    requestedMaterialMode === 'native' || useUnityAuthority
      ? null
      : loadUeSourceTemporalDitherNoiseTexture(),
  ]);
  let state = createSoStylizedSourceEnvironmentState(library, {
    temporalDitherNoiseTexture,
    temporalSampleIndex: numberParam('taaSample', 0),
  });
  updateSoStylizedSourceEnvironmentState(state, {
    currentTime: numberParam('currentTime', state.uniforms.currentTime.value),
    dayCycleProgress: numberParam('day', 0),
    sunDirection: useUnityAuthority
      ? SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.rayDirection
      : [0.42, 0.78, 0.46],
    time: numberParam('materialTime', state.uniforms.time.value),
    windIntensity: params.get('wind') === '0' ? 0 : 1.2,
  });
  let report = null;
  let fallbackReport = null;

  gltf.scene.name = 'SoStylizedAuthoredSnowPinesDemo';
  if (requestedMaterialMode === 'native') {
    report = prepareBakedSourceMaterials(gltf.scene, renderer);
  } else if (requestedMaterialMode === 'baked') {
    fallbackReport = await repairSoStylizedAuthoredBakeMaterials(gltf.scene, {
      library,
      sourceAssetName: 'Demonstration_SnowPines',
      state,
    });
    report = prepareBakedSourceMaterials(gltf.scene, renderer);
    report.unresolved = fallbackReport.unresolved;
  } else {
    report = await applySoStylizedNamedSourceMaterials(gltf.scene, {
      library,
      sourceAssetName: 'Demonstration_SnowPines',
      state,
    });
  }
  const materialLightingAudit = auditSourceMaterialLightingAdapters(gltf.scene);
  if (params.get('rockNormal') === 'geometry') {
    const replaced = new Set();
    gltf.scene.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const sourceRock = material?.userData?.soStylizedSource?.family === 'rock'
          || Boolean(material?.userData?.toonlabRockSourceMaterial);
        if (!sourceRock || replaced.has(material)) {
          continue;
        }
        material.normalNode = normalViewGeometry;
        material.needsUpdate = true;
        replaced.add(material);
      }
    });
    document.body.dataset.rockNormalDebug = `geometry:${replaced.size}`;
  }
  const renderMetadataReport = applyAuthoredMeshRenderMetadata(gltf.scene, manifest);
  const leafShadowMode = params.get('leafShadow') ?? 'source';
  if (leafShadowMode !== 'source') {
    gltf.scene.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const leafMaterials = materials.filter(
        (material) => material?.userData?.soStylizedSource?.family === 'leaves',
      );
      if (leafMaterials.length === 0) return;
      if (leafShadowMode === 'off') {
        object.castShadow = false;
        return;
      }
      if (leafShadowMode === 'opaque') {
        for (const material of leafMaterials) {
          material.opacityNode = null;
          material.alphaTestNode = null;
          material.alphaToCoverage = false;
          material.needsUpdate = true;
        }
      }
    });
  }
  const normalizedSkyDomeCount = normalizeSourceSkyDomes(gltf.scene);
  const sourceSun = useUnityAuthority
    ? configureUnitySourceLights(gltf.scene, manifest)
    : configureSourceLights(gltf.scene, manifest);
  const sourceSunDirection = sourceSun.direction;
  updateSoStylizedSourceEnvironmentState(state, {
    sunDirection: sourceSunDirection,
  });
  const sourceShadowCasters = useUnityAuthority
    ? installToonLabSourceShadowCasters(gltf.scene, sourceSun.directionToLight)
    : {
      casterMaterialCount: 0,
      casterMeshCount: 0,
      rockBindings: [],
      rockMaterialCount: 0,
    };
  const sourceCloudShadow = useUnityAuthority
    ? unityCloudShadowDiagnostics()
    : await configureSourceCloudShadow({
      library,
      manifest,
      sourceSun,
      state,
    });
  scene.add(gltf.scene);
  const sourceRenderState = useUnityAuthority
    ? configureUnitySourceRenderState({ renderer, scene })
    : configureSourceRenderState({
      manifest,
      renderer,
      scene,
      skyLight: { intensity: 0, mode: 'capture-pending' },
    });
  // Unity's live RenderSettings probe is a single constant SH coefficient;
  // there is no runtime cubemap capture on the active demo path.
  const sourceSkyLight = useUnityAuthority
    ? unitySkyLightDiagnostics(sourceSun)
    : await configureSourceSkyLight({
      manifest,
      renderer,
      root: gltf.scene,
      scene,
    });
  // The SkyLight cube capture is intentionally the first render. Three's CSM
  // node consequently initializes against that temporary 1500 m capture
  // camera unless ownership is restored here. Keep the initialized shadow
  // resources, but bind their frustum calculations back to the authored view;
  // setCamera() below then rebuilds all four source cascades from CameraRender.
  for (const csm of sourceSun.cascadedShadows) {
    if (csm.camera && csm.camera !== camera) csm.camera = camera;
  }
  sourceRenderState.skyLightIntensity = sourceSkyLight.intensity;
  sourceRenderState.skyLightMode = sourceSkyLight.mode;
  globalThis.__TOONLAB_SOURCE_SHOWCASE__ = {
    authority: requestedAuthority,
    camera,
    manifest,
    renderer,
    root: gltf.scene,
    scene,
    sourceRenderState,
    sourceCloudShadow,
    sourceSkyLight,
    sourceShadowCasters,
    sourceSun,
    sourceSunDirection,
  };

  // Opt-in source-scene probe used while matching a native UE capture. Keeping
  // this behind a query flag makes it inert in the showcase while still
  // allowing a pixel in a comparison capture to identify the exact exported
  // mesh and resolved source material that produced it.
  if (params.get('inspect') === '1') {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    renderer.domElement.addEventListener('pointerdown', (event) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(gltf.scene, true)[0];
      if (!hit) {
        document.body.dataset.inspectedObject = '';
        document.body.dataset.inspectedMaterial = '';
        document.body.dataset.inspectedFamily = '';
        document.body.dataset.inspectedReconstruction = '';
        document.body.dataset.inspectedUnityMaterial = '';
        document.body.dataset.inspectedUnityProfileExact = '';
        return;
      }
      const objectMaterials = Array.isArray(hit.object.material)
        ? hit.object.material
        : [hit.object.material];
      const materialIndex = hit.face?.materialIndex ?? 0;
      const material = objectMaterials[materialIndex] ?? objectMaterials[0];
      const source = material?.userData?.soStylizedSource ?? {};
      document.body.dataset.inspectedObject = hit.object.name ?? '';
      document.body.dataset.inspectedMaterial = source.path ?? material?.name ?? '';
      document.body.dataset.inspectedFamily = source.family ?? '';
      document.body.dataset.inspectedReconstruction = source.reconstruction ?? '';
      document.body.dataset.inspectedUnityMaterial = source.unityMaterial ?? '';
      document.body.dataset.inspectedUnityProfileExact = String(
        source.unityExactProfile ?? '',
      );
      document.body.dataset.inspectedPoint = hit.point.toArray().join(',');
      document.body.dataset.inspectedCameraDistance = String(hit.distance);
      document.body.dataset.inspectedCastShadow = String(hit.object.castShadow === true);
      document.body.dataset.inspectedReceiveShadow = String(hit.object.receiveShadow === true);
      document.body.dataset.inspectedTriangles = String(
        hit.object.geometry?.index?.count
          ? hit.object.geometry.index.count / 3
          : (hit.object.geometry?.attributes?.position?.count ?? 0) / 3,
      );
    });
  }

  const sourceCameras = [];
  gltf.scene.traverse((object) => {
    if (object.isCamera) sourceCameras.push(object);
  });
  const sourceCameraName = (sourceCamera) => {
    let cursor = sourceCamera;
    while (cursor) {
      if (/CameraRender\d+/i.test(cursor.name ?? '')) return cursor.name;
      cursor = cursor.parent;
    }
    return sourceCamera.name ?? '';
  };
  sourceCameras.sort((a, b) => sourceCameraName(a).localeCompare(
    sourceCameraName(b),
    undefined,
    { numeric: true, sensitivity: 'base' },
  ));
  if (sourceCameras.length === 0) throw new Error('The authored demo contains no cameras.');
  const cameraStates = sourceCameraStates(manifest);
  const fogVolumeTexture = requestedFogProfile
    && !useUnityAuthority
    && requestedMaterialMode !== 'native'
    && params.get('post') !== '0'
    ? await loadSoStylizedFogVolumeTexture()
    : null;
  const sourcePost = requestedMaterialMode !== 'native' && params.get('post') !== '0'
    ? (() => {
      if (useUnityAuthority) {
        return createUnitySourcePostPipeline({
          camera,
          renderer,
          scene,
        });
      }
      globalThis.__TOONLAB_UE_BLOOM_DEBUG__ = params.get('bloomDebug') === '1';
      return createSourcePostPipeline({
      camera,
      cameraState: cameraStates[0],
      fogVolumeTexture,
      library,
      postSettings: sourceRenderState.post,
      projectSettings: manifest.projectSettings,
      renderer,
      scene,
      state,
      });
    })()
    : null;
  globalThis.__TOONLAB_SOURCE_SHOWCASE__.sourcePost = sourcePost;

  const cameraSelect = document.getElementById('camera-select');
  const materialSelect = document.getElementById('material-select');
  const authoritySelect = document.getElementById('authority-select');
  const nativeReference = document.getElementById('native-reference');
  const hint = document.getElementById('hint');
  const comparison = document.getElementById('comparison');
  const comparisonSlider = document.getElementById('comparison-slider');
  const comparisonValue = document.getElementById('comparison-value');
  nativeReference.addEventListener('load', () => {
    document.body.dataset.nativeReferenceReady = 'true';
    delete document.body.dataset.nativeReferenceError;
  });
  nativeReference.addEventListener('error', () => {
    document.body.dataset.nativeReferenceReady = 'false';
    document.body.dataset.nativeReferenceError = nativeReference.src;
  });
  materialSelect.value = requestedMaterialMode;
  materialSelect.addEventListener('change', (event) => {
    const query = new URLSearchParams(location.search);
    query.set('material', event.target.value);
    location.search = query;
  });
  authoritySelect.value = requestedAuthority;
  authoritySelect.addEventListener('change', (event) => {
    const query = new URLSearchParams(location.search);
    query.set('authority', event.target.value);
    location.search = query;
  });
  document.getElementById('toonlab-comparison-label').textContent = useUnityAuthority
    ? 'TOONLAB · UNITY DEMO STAGE'
    : 'TOONLAB · SOURCE SCENE';
  const setComparison = (value) => {
    const parsed = Number(value);
    const amount = THREE.MathUtils.clamp(Number.isFinite(parsed) ? parsed : 50, 0, 100);
    document.documentElement.style.setProperty('--comparison', `${amount}%`);
    comparisonSlider.value = String(amount);
    comparisonValue.textContent = `${Math.round(amount)}% Unreal`;
    document.body.dataset.comparison = String(amount);
  };
  comparisonSlider.addEventListener('input', (event) => setComparison(event.target.value));
  setComparison(params.has('wipe') ? Number(params.get('wipe')) : 50);
  sourceCameras.forEach((_, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = cameraLabel(index);
    cameraSelect.appendChild(option);
  });

  let cameraIndex = THREE.MathUtils.clamp(
    numberParam('camera', 1) - 1,
    0,
    sourceCameras.length - 1,
  );
  const setCamera = (index) => {
    cameraIndex = (index + sourceCameras.length) % sourceCameras.length;
    const authored = sourceCameras[cameraIndex];
    authored.updateWorldMatrix(true, false);
    authored.getWorldPosition(camera.position);
    authored.getWorldQuaternion(camera.quaternion);
    camera.fov = authored.fov;
    camera.aspect = authored.aspect || (16 / 9);
    const exportedNear = Number(authored.near);
    const projectNear = Number(manifest.projectSettings?.nearClipPlane) * 0.01;
    camera.near = useUnityAuthority
      ? SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.near
      : exportedNear > 0
        ? exportedNear
        : projectNear > 0
          ? projectNear
          : 0.1;
    camera.far = useUnityAuthority
      ? SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.far
      : 2000;
    camera.updateProjectionMatrix();
    for (const csm of sourceSun.cascadedShadows) {
      if (csm.camera) csm.updateFrustums();
    }
    sourcePost?.update(cameraStates[cameraIndex]);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, 60);
    controls.update();
    cameraSelect.value = String(cameraIndex);
    nativeReference.src = nativeReferenceUrl(cameraIndex);
    nativeReference.alt = `${cameraLabel(cameraIndex)} rendered by Unreal Engine`;
    setQueryCamera(cameraIndex);
    document.body.dataset.cameraIndex = String(cameraIndex + 1);
    document.getElementById('camera-name').textContent =
      `${cameraLabel(cameraIndex)} / ${sourceCameras.length}`;
  };

  document.getElementById('camera-prev').addEventListener('click', () => setCamera(cameraIndex - 1));
  document.getElementById('camera-next').addEventListener('click', () => setCamera(cameraIndex + 1));
  cameraSelect.addEventListener('change', (event) => setCamera(Number(event.target.value)));
  document.getElementById('open-catalog').addEventListener('click', () => {
    location.href = '/examples/source-catalog/';
  });
  document.getElementById('open-source-mega').addEventListener('click', () => {
    location.href = '/examples/unity-showcase/?view=compare&wipe=50&dpr=1';
  });
  addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') setCamera(cameraIndex - 1);
    if (event.key === 'ArrowRight') setCamera(cameraIndex + 1);
    if (event.key.toLowerCase() === 'r') setCamera(cameraIndex);
  });
  setCamera(cameraIndex);
  if (params.get('inspect') === '1') {
    gltf.scene.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    const worldPosition = new THREE.Vector3();
    const worldScale = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const rockProfiles = [];
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const source = materials.find(Boolean)?.userData?.soStylizedSource ?? {};
      if (source.family !== 'rock' && !/(?:Cliff|Rock)/i.test(object.name ?? '')) return;
      object.getWorldPosition(worldPosition);
      object.getWorldScale(worldScale);
      projected.copy(worldPosition).project(camera);
      const unityProfile = materials.find(Boolean)?.userData?.unityRockProfile;
      rockProfiles.push({
        cameraDistance: worldPosition.distanceTo(camera.position),
        distanceScale: unityProfile?.coordinates?.distanceScale ?? null,
        farFlatten: unityProfile?.normals?.farFlatten ?? null,
        material: source.path ?? materials.find(Boolean)?.name ?? '',
        name: object.name ?? '',
        ndc: projected.toArray(),
        nearFlatten: unityProfile?.normals?.nearFlatten ?? null,
        normalDistance: unityProfile?.normals?.distance ?? null,
        reconstruction: source.reconstruction ?? '',
        scale: worldScale.toArray(),
        unityMaterial: source.unityMaterial ?? '',
        worldPosition: worldPosition.toArray(),
      });
    });
    document.body.dataset.inspectRockProfiles = JSON.stringify(
      rockProfiles
        .filter((entry) => Math.abs(entry.ndc[0]) <= 1.1 && Math.abs(entry.ndc[1]) <= 1.1)
        .sort((a, b) => a.cameraDistance - b.cameraDistance)
        .slice(0, 200),
    );
  }
  controls.enabled = requestedMaterialMode === 'live' || requestedMaterialMode === 'baked';
  comparison.hidden = requestedMaterialMode !== 'compare';

  document.getElementById('loading').remove();
  document.getElementById('badge').textContent = [
    requestedMaterialMode === 'native'
      ? 'UNREAL NATIVE REFERENCE'
      : requestedMaterialMode === 'compare'
        ? 'PIXEL A/B · UNREAL LEFT / TOONLAB SOURCE-SCENE PORT RIGHT'
      : requestedMaterialMode === 'baked'
        ? 'SOURCE-AUTHORED HYBRID'
        : 'LIVE SOURCE PORT',
    `${manifest.counts.actors} actors`,
    `${manifest.counts.instances.toLocaleString()} authored instances`,
    `${report.materialCount} source materials`,
    fallbackReport ? `${fallbackReport.fallbackSlotCount} repaired bake slots` : null,
  ].filter(Boolean).join(' · ');
  document.body.dataset.stageReady = 'true';
  document.body.dataset.actorCount = String(manifest.counts.actors);
  document.body.dataset.instanceCount = String(manifest.counts.instances);
  document.body.dataset.materialCount = String(report.materialCount);
  document.body.dataset.materialLightingAdapterAudit = JSON.stringify(
    materialLightingAudit,
  );
  document.body.dataset.meshCount = String(report.meshCount);
  document.body.dataset.unresolvedCount = String(report.unresolved.length);
  document.body.dataset.renderMetadataComponentCount = String(
    renderMetadataReport.componentCount,
  );
  document.body.dataset.renderMetadataMatchedComponentCount = String(
    renderMetadataReport.matchedComponentCount,
  );
  document.body.dataset.renderMetadataMissingCount = String(
    renderMetadataReport.missing.length,
  );
  document.body.dataset.shadowDisabledComponentCount = String(
    renderMetadataReport.shadowDisabledComponentCount,
  );
  document.body.dataset.shadowDisabledMeshCount = String(
    renderMetadataReport.shadowDisabledMeshCount,
  );
  document.body.dataset.visibilityDisabledMeshCount = String(
    renderMetadataReport.visibilityDisabledMeshCount,
  );
  document.body.dataset.toonlabSourceCasterMeshCount = String(
    sourceShadowCasters.casterMeshCount,
  );
  document.body.dataset.toonlabSourceCasterMaterialCount = String(
    sourceShadowCasters.casterMaterialCount,
  );
  document.body.dataset.toonlabSourceRockMaterialCount = String(
    sourceShadowCasters.rockMaterialCount,
  );
  document.body.dataset.toonlabSourceRockBindings = JSON.stringify(
    sourceShadowCasters.rockBindings,
  );
  document.body.dataset.materialMode = requestedMaterialMode;
  document.body.dataset.renderAuthority = requestedAuthority;
  document.body.dataset.unityPipeline = useUnityAuthority
    ? SO_STYLIZED_UNITY_RENDER_CONTRACT.pipeline.name
    : 'off';
  document.body.dataset.unityRenderer = useUnityAuthority
    ? SO_STYLIZED_UNITY_RENDER_CONTRACT.pipeline.renderer
    : 'off';
  document.body.dataset.unityColorGradingMode = useUnityAuthority
    ? SO_STYLIZED_UNITY_RENDER_CONTRACT.pipeline.colorGradingMode
    : 'off';
  document.body.dataset.fogDensity = String(sourceRenderState.fogDensity);
  document.body.dataset.fogDensityScale = String(sourceRenderState.fogDensityScale);
  document.body.dataset.skyLightIntensity = String(sourceRenderState.skyLightIntensity);
  document.body.dataset.skyLightMode = sourceRenderState.skyLightMode;
  document.body.dataset.skyLightCaptureMeshCount = String(sourceSkyLight.captureMeshCount);
  document.body.dataset.skyLightSourceSkyMeshCount = String(sourceSkyLight.sourceSkyMeshCount);
  document.body.dataset.skyLightCaptureTint = sourceSkyLight.captureTint.toArray().join(',');
  document.body.dataset.skyLightLowerHemisphere = sourceSkyLight.lowerHemisphereColor
    .toArray()
    .join(',');
  document.body.dataset.skyLightCaptureResolution = String(
    sourceSkyLight.contract.captureResolution,
  );
  document.body.dataset.skyLightCaptureNear = String(
    sourceSkyLight.contract.skyDistanceThresholdMeters,
  );
  document.body.dataset.skyLightCaptureFar = String(sourceSkyLight.captureFar);
  document.body.dataset.skyLightDiffuseMip = String(
    sourceSkyLight.contract.diffuseMipLevel,
  );
  document.body.dataset.skyLightDiffuseSize = String(
    sourceSkyLight.contract.diffuseCubemapSize,
  );
  document.body.dataset.skyLightDiffuseSh = JSON.stringify(sourceSkyLight.diffuseSh);
  document.body.dataset.skyLightTintedDiffuseSh = JSON.stringify(
    sourceSkyLight.tintedDiffuseSh ?? [],
  );
  document.body.dataset.skyLightTintedFinite = String(
    (sourceSkyLight.tintedDiffuseSh ?? []).length === 9
      && sourceSkyLight.tintedDiffuseSh.flat().every(Number.isFinite),
  );
  document.body.dataset.skyLightBrowserDiffuseSh = JSON.stringify(
    sourceSkyLight.browserDiffuseSh,
  );
  document.body.dataset.skyLightShMaximumDelta = String(
    sourceSkyLight.diffuseSh.reduce((maximum, coefficient, coefficientIndex) => (
      coefficient.reduce((channelMaximum, channel, channelIndex) => Math.max(
        channelMaximum,
        Math.abs(
          channel
          - (sourceSkyLight.browserDiffuseSh[coefficientIndex]?.[channelIndex] ?? channel),
        ),
      ), maximum)
    ), 0),
  );
  document.body.dataset.skyLightNativeIrradiance = String(
    sourceSkyLight.mode === 'native-irradiance-sh',
  );
  document.body.dataset.skyLightFogParticipation = String(sourceSkyLight.fogParticipation);
  document.body.dataset.skyLightCaptureVisibility = useUnityAuthority
    ? 'constant SH coefficient 0; no capture'
    : 'complete-scene-near-plane';
  document.body.dataset.skyLightRemainingBridges = sourceSkyLight.bridges.join(' | ');
  document.body.dataset.sunIntensityScale = String(sourceRenderState.sunIntensityScale);
  document.body.dataset.sunDirection = sourceSunDirection.toArray().join(',');
  document.body.dataset.sunDirectionAuthority = sourceSun.directionAuthority
    ?? 'active renderer source';
  document.body.dataset.directionalLightCount = String(sourceSun.count);
  document.body.dataset.shadowCascadeCount = String(sourceSun.cascadeCount);
  document.body.dataset.shadowCascadeExponent = String(sourceSun.cascadeExponent);
  document.body.dataset.shadowCascadeBreaks = sourceSun.cascadeBreaks.join(',');
  document.body.dataset.shadowDistance = String(sourceSun.shadowDistance);
  document.body.dataset.csmMode = sourceSun.csmMode;
  document.body.dataset.shadowsEnabled = String(sourceSun.shadowsEnabled);
  const sourceCloudShadowBinding = sourceCloudShadow.bindings[0] ?? null;
  document.body.dataset.cloudShadowMode = sourceCloudShadow.mode;
  document.body.dataset.cloudShadowEnabled = String(sourceCloudShadow.enabled);
  document.body.dataset.cloudShadowProfile = sourceCloudShadow.profile?.path ?? '';
  document.body.dataset.cloudShadowCurrentTime = String(state.uniforms.currentTime.value);
  document.body.dataset.cloudShadowMaterialTime = String(state.uniforms.time.value);
  document.body.dataset.cloudShadowScaleCm = sourceCloudShadowBinding
    ?.projection.lightFunctionScaleCm.join(',') ?? '';
  document.body.dataset.cloudShadowProjectionU = sourceCloudShadowBinding
    ?.projection.uAxis.toArray().join(',') ?? '';
  document.body.dataset.cloudShadowProjectionV = sourceCloudShadowBinding
    ?.projection.vAxis.toArray().join(',') ?? '';
  document.body.dataset.cloudShadowProjectionOffset = sourceCloudShadowBinding
    ?.projection.offset.toArray().join(',') ?? '';
  document.body.dataset.cloudShadowFadeDistance = sourceCloudShadowBinding
    ? String(sourceCloudShadowBinding.fadeDistanceMeters)
    : '';
  document.body.dataset.cloudShadowDisabledBrightness = sourceCloudShadowBinding
    ? String(sourceCloudShadowBinding.disabledBrightness)
    : '';
  document.body.dataset.cloudShadowAtlas = sourceCloudShadowBinding
    ? 'UE5.8-repeat-direct-evaluation-bridge'
    : 'off';
  document.body.dataset.cloudShadowRemainingBridges = sourceCloudShadow.bridges.join(' | ');
  const sourceShadowContract = sourceSun.cascadedShadows[0]?._ueShadowContracts?.[0];
  const sourceUsesUeShadowFilter = sourceSun.cascadedShadows[0]
    ?.useUeReceiverFilter !== false;
  document.body.dataset.shadowFilter = sourceShadowContract && sourceUsesUeShadowFilter
    ? 'UE Manual5x5PCF raw gather'
    : sourceShadowContract
      ? 'Three diagnostic receiver filter on UE cascade fit'
    : sourceSun.csmMode === 'toonlab-source-urp'
      ? 'Unity High 7x7 tent / 16 comparison samples'
      : sourceSun.csmMode === 'three-production'
        ? 'Three WebGPU production CSM'
      : 'pending-initialization';
  document.body.dataset.shadowConstantBiasBridge = sourceShadowContract
    && sourceUsesUeShadowFilter
    ? 'orthographic receiver-equivalent'
    : sourceSun.csmMode === 'toonlab-source-urp'
      ? 'Unity caster-space depth 0.1 / normal 0.5'
      : 'off';
  document.body.dataset.shadowSlopeRasterBias = sourceShadowContract
    ? 'contract-exported-runtime-gap'
    : sourceSun.csmMode === 'toonlab-source-urp'
      ? 'Unity SetGlobalDepthBias 1.0 / 2.5 via WebGPU depth bias'
      : 'off';
  document.body.dataset.normalizedSkyDomeCount = String(normalizedSkyDomeCount);
  document.body.dataset.exposureBias = String(sourceRenderState.exposureBias);
  document.body.dataset.exposureEv100 = sourceRenderState.exposureEv100 === null
    ? 'adaptive'
    : String(sourceRenderState.exposureEv100);
  document.body.dataset.exposureMultiplier = String(sourceRenderState.exposureMultiplier);
  document.body.dataset.toneMapper = useUnityAuthority
    ? 'Unity LDR 32^3 R8 LUT / no tonemapper'
    : useUeToneMapper
      ? requestedToneMapper
      : 'three-aces';
  document.body.dataset.outputTransfer = useUnityAuthority
    ? 'Unity LDR LUT'
    : useUeToneMapper
      ? 'UE Apple SDR explicit gamma 2.2; no Three sRGB OETF'
      : 'Three sRGB OETF';
  document.body.dataset.fallbackSlotCount = String(fallbackReport?.fallbackSlotCount ?? 0);
  document.body.dataset.fallbackMaterialCount = String(fallbackReport?.fallbackMaterialCount ?? 0);
  document.body.dataset.postProcessing = sourcePost
    ? useUnityAuthority
      ? 'Unity Global Volume'
      : 'authored-camera'
    : 'off';
  document.body.dataset.postStage = sourcePost?.postStage ?? 'off';
  document.body.dataset.fogPostProcess = useUnityAuthority
    ? 'Unity exponential material fog'
    : sourcePost?.sourceFog?.profile?.path
      ?? (requestedFogProfile ? 'requested-but-post-disabled' : 'off-source-scene');
  document.body.dataset.fogPostBlendableLocation = sourcePost?.sourceFog?.contract
    ?.blendableLocation ?? 'off';
  document.body.dataset.fogPostRemainingBridges = sourcePost?.sourceFog?.bridges
    ?.join(' | ') ?? '';
  document.body.dataset.fogVolumeStatus = sourcePost?.sourceFog?.volumeStatus ?? 'off';
  document.body.dataset.dofMode = sourcePost?.depthOfFieldEnabled
    ? 'UE physical CoC + WebGPU gather bridge'
    : 'off';
  document.body.dataset.dofFocusDistance = sourcePost?.depthOfFieldEnabled
    ? String(sourcePost.dofContract.focusDistanceMeters)
    : '0';
  document.body.dataset.dofInfinityCocRadius = sourcePost?.depthOfFieldEnabled
    ? String(sourcePost.dofContract.infinityBackgroundCocRadius)
    : '0';
  document.body.dataset.dofInfinityCocRadiusPixels = sourcePost?.depthOfFieldEnabled
    ? String(sourcePost.dofContract.infinityBackgroundCocRadiusPixels)
    : '0';
  document.body.dataset.dofMaxKernelRadiusPixels = sourcePost?.depthOfFieldEnabled
    ? String(sourcePost.dofContract.maxKernelRadiusPixels)
    : '0';
  document.body.dataset.dofBladeCount = sourcePost?.depthOfFieldEnabled
    ? String(sourcePost.dofContract.bladeCount)
    : '0';
  document.body.dataset.dofRemainingBridges = sourcePost?.depthOfField
    ?.ueRemainingBridges?.join(' | ') ?? '';
  document.body.dataset.ambientOcclusion = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.aoIntensity)
    : '0';
  document.body.dataset.ambientOcclusionRadius = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.ambientOcclusion.settings.radiusCm)
    : '0';
  document.body.dataset.ambientOcclusionRadiusUnit = 'source-centimetres';
  document.body.dataset.ambientOcclusionRadiusMode = sourcePost?.ambientOcclusionEnabled
    ? sourcePost.ambientOcclusion.settings.radiusInWorldSpace
      ? 'world-space'
      : 'view-space-400'
    : 'off';
  document.body.dataset.ambientOcclusionFullResRadius = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.ambientOcclusion.settings.fullResolution.radiusInShader)
    : '0';
  document.body.dataset.ambientOcclusionHalfResRadius = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.ambientOcclusion.settings.halfResolution?.radiusInShader ?? 0)
    : '0';
  document.body.dataset.ambientOcclusionMethod = sourcePost?.ambientOcclusionEnabled
    ? sourcePost.ambientOcclusion.settings.method
    : 'off';
  document.body.dataset.ambientOcclusionQuality = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.ambientOcclusion.settings.quality)
    : '0';
  document.body.dataset.ambientOcclusionShaderQuality = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.ambientOcclusion.settings.shaderQuality)
    : '0';
  document.body.dataset.ambientOcclusionLevels = sourcePost?.ambientOcclusionEnabled
    ? String(sourcePost.ambientOcclusion.settings.levels)
    : '0';
  document.body.dataset.ambientOcclusionSampleLookups = sourcePost?.ambientOcclusionEnabled
    ? [
      sourcePost.ambientOcclusion.settings.fullResolution.sampleLookups,
      sourcePost.ambientOcclusion.settings.halfResolution?.sampleLookups ?? 0,
    ].join(',')
    : '0,0';
  document.body.dataset.ambientOcclusionRuntimeBridge = sourcePost?.ambientOcclusionEnabled
    ? sourcePost.ambientOcclusion.contract.runtimeBridge
    : 'off';
  document.body.dataset.ambientOcclusionApplication = sourcePost?.ambientOcclusionEnabled
    ? 'whole-scene-color multiply compatibility bridge'
    : 'off';
  document.body.dataset.ambientOcclusionRemainingBridges = sourcePost?.ambientOcclusionEnabled
    ? sourcePost.ambientOcclusion.contract.remainingBridges.join(' | ')
    : '';
  document.body.dataset.temporalAntiAliasing = sourcePost?.temporalAA ? 'true' : 'false';
  document.body.dataset.temporalAntiAliasingMode = sourcePost?.temporalContract?.method ?? 'off';
  document.body.dataset.temporalDither = useUnityAuthority
    ? 'Unity ordered 4x4 grass dither in S_Foliage; no UE noise'
    : temporalDitherNoiseTexture
    ? 'UE DitherTemporalAA exact graph and Good64x64TilingNoiseHighFreq'
    : requestedMaterialMode === 'native'
      ? 'native-reference-image'
      : 'noise-resource-unavailable';
  document.body.dataset.temporalDitherGraphCount = String(
    SO_STYLIZED_DITHER_TEMPORAL_AA_GRAPHS.length,
  );
  document.body.dataset.temporalDitherRuntimeBindingCount = String(
    SO_STYLIZED_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS.length,
  );
  document.body.dataset.temporalJitter = sourcePost?.temporalContract?.jitter ?? 'off';
  document.body.dataset.temporalSequenceLength = String(
    sourcePost?.temporalContract?.sequenceLength ?? 0,
  );
  document.body.dataset.temporalSourceCurrentFrameWeight = String(
    useUnityAuthority
      ? SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.taa.frameInfluence
      : UE_SOURCE_TEMPORAL_CONTRACT.currentFrameWeight,
  );
  document.body.dataset.temporalRuntimeResolveCurrentFrameWeight = String(
    sourcePost?.temporalContract?.runtimeResolveCurrentFrameWeight ?? 0,
  );
  document.body.dataset.temporalHistoryResolve = sourcePost?.temporalContract
    ?.historyResolve ?? 'off';
  document.body.dataset.temporalRemainingBridges = sourcePost?.temporalContract
    ?.remainingBridges?.join(' | ') ?? '';
  document.body.dataset.bloomMethod = sourcePost?.bloomPass?.contract?.method ?? 'off';
  document.body.dataset.bloomIntensity = sourcePost?.bloomPass
    ? String(sourcePost.bloomPass.settings.intensity)
    : '0';
  document.body.dataset.bloomThreshold = sourcePost?.bloomPass
    ? String(
      sourcePost.bloomPass.settings.threshold
        ?? sourcePost.bloomPass.settings.thresholdLinear,
    )
    : '0';
  document.body.dataset.bloomDcGain = sourcePost?.bloomPass
    ? useUnityAuthority
      ? String(
        sourcePost.bloomPass.settings.intensity
          * sourcePost.bloomPass.settings.tintNormalizedLinear[0],
      )
      : sourcePost.bloomPass.settings.stages.reduce(
        (sum, stage) => sum + stage.tint[0] * sourcePost.bloomPass.settings.tintScale,
        0,
      ).toString()
    : '0';
  document.body.dataset.bloomRemainingBridges = sourcePost?.bloomPass?.contract
    ?.remainingBridges?.join(' | ') ?? '';
  document.body.dataset.vignetteType = sourcePost?.vignetteEnabled
    ? sourcePost.vignetteSettings.type
    : 'off';
  document.body.dataset.vignetteIntensity = sourcePost?.vignetteEnabled
    ? String(sourcePost.vignetteSettings.intensity)
    : '0';
  document.body.dataset.vignetteAspectRatio = sourcePost?.vignetteEnabled
    ? String(sourcePost.vignetteSettings.aspectRatio)
    : '0';
  document.body.dataset.leafShadowMode = leafShadowMode;
  hint.textContent = requestedMaterialMode === 'native'
    ? 'Literal Unreal viewport output · use the arrows to inspect all 16 authored cameras'
    : requestedMaterialMode === 'compare'
      ? `Exact scene/camera wipe · ToonLab executes ${useUnityAuthority ? 'the Unity demo stage diagnostic' : 'SnowPines source-scene'} logic on the right`
      : `${useUnityAuthority ? 'Unity demo stage diagnostic' : 'ToonLab source-scene port'} · drag to inspect · R resets the source camera`;

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp);
    const delta = timer.getDelta();
    if (state && params.get('animate') !== '0') {
      advanceSoStylizedSourceEnvironmentState(state, delta);
    }
    controls.update();
    renderer.setClearColor(0x08111f, 1);
    renderer.clear();
    if (sourcePost) sourcePost.pipeline.render();
    else renderer.render(scene, camera);
    document.body.dataset.temporalSampleIndex = String(
      state?.uniforms?.temporalSampleIndex?.value ?? 0,
    );
    document.body.dataset.temporalJitterPixels = sourcePost?.temporalAA
      ? sourcePost.temporalAA.currentJitter.toArray().join(',')
      : '0,0';
    const debugCsm = sourceSun.cascadedShadows[0];
    if (debugCsm?.lights?.length) {
      const firstShadowContract = debugCsm._ueShadowContracts?.[0];
      const debugUsesUeShadowFilter = debugCsm.useUeReceiverFilter !== false;
      if (firstShadowContract && debugUsesUeShadowFilter) {
        document.body.dataset.shadowFilter = 'UE Manual5x5PCF raw gather';
        document.body.dataset.shadowConstantBiasBridge = 'orthographic receiver-equivalent';
        document.body.dataset.shadowSlopeRasterBias = 'contract-exported-runtime-gap';
      } else if (firstShadowContract) {
        document.body.dataset.shadowFilter = 'Three diagnostic receiver filter on UE cascade fit';
        document.body.dataset.shadowConstantBiasBridge = 'off';
        document.body.dataset.shadowSlopeRasterBias = 'contract-exported-runtime-gap';
      } else if (debugCsm.userData?.soStylizedUnity) {
        document.body.dataset.shadowFilter = 'Unity High 7x7 tent / 16 comparison samples';
        document.body.dataset.shadowConstantBiasBridge = 'Unity caster-space depth 0.1 / normal 0.5';
        document.body.dataset.shadowSlopeRasterBias = 'Unity SetGlobalDepthBias 1.0 / 2.5 via WebGPU depth bias';
      }
      const unityCsm = debugCsm.userData?.soStylizedUnity;
      document.body.dataset.csmDebug = JSON.stringify({
        boundToAuthoredCamera: debugCsm.camera === camera,
        breaks: [...debugCsm.breaks],
        camera: {
          far: debugCsm.camera?.far,
          near: debugCsm.camera?.near,
        },
        fits: (debugCsm._ueCascadeFits ?? debugCsm._unityCascadeFits ?? []).map((fit) => fit ? {
          center: fit.center.toArray(),
          halfExtent: fit.projection?.halfExtent,
          iterations: fit.iterations,
          radius: fit.radius,
          splitFar: fit.splitFar,
          splitNear: fit.splitNear,
          sourceOracle: fit.sourceOracle,
        } : null),
        lights: debugCsm.lights.map((light) => ({
          camera: {
            bottom: light.shadow.camera.bottom,
            far: light.shadow.camera.far,
            left: light.shadow.camera.left,
            near: light.shadow.camera.near,
            right: light.shadow.camera.right,
            top: light.shadow.camera.top,
          },
          position: light.position.toArray(),
          receiverFilter: light.shadow.ueSourceFilter ?? 'Three stock',
          target: light.target.position.toArray(),
        })),
        unityCurrentFrame: unityCsm?.currentFrame ?? null,
        unityRemainingRendererBridges: unityCsm?.remainingRendererBridges ?? [],
        useUeReceiverFilter: debugUsesUeShadowFilter,
        ranges: (debugCsm._ueCascadeRanges ?? []).map((range) => range.toArray()),
        shadowLayouts: (debugCsm._ueShadowLayouts ?? []).map((layout) => layout),
        shadowContracts: (debugCsm._ueShadowContracts ?? []).map((contract) => ({
          depthBias: contract.depthBias,
          maxSlopeDepthBias: contract.maxSlopeDepthBias,
          receiverTransitionFloor: contract.receiverTransitionFloor,
          slopeDepthBias: contract.slopeDepthBias,
          slopeScaleDepthBias: contract.slopeScaleDepthBias,
          subjectDepthRange: contract.subjectDepthRange,
          transitionScale: contract.transitionScale,
          transitionSize: contract.transitionSize,
          worldSpaceTexelScale: contract.worldSpaceTexelScale,
        })),
      });
    }
    document.body.dataset.worldReady = 'true';
  });

  addEventListener('resize', () => {
    const stage = stageSize(camera.aspect || (16 / 9));
    renderer.setSize(stage.width, stage.height);
    sourcePost?.resize(stage.width * renderer.getPixelRatio());
    positionStageCanvas(renderer.domElement, stage.width, stage.height);
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById('loading').textContent = error.message;
  document.body.dataset.stageError = error.message;
});
