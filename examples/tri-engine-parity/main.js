import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, WebGPURenderer } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  exp2,
  float,
  fog,
  max,
  mix,
  normalMap,
  normalViewGeometry,
  positionWorld,
  sign,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  PARITY_ENVIRONMENT_INPUT_ADAPTERS,
  bindParityEnvironmentToMaterial,
  bindParityEnvironmentToObject,
  resolveParityEnvironmentInputAdapter,
} from '../../src/environment/parityEnvironmentSurfaceBinding.js';
import {
  createUeSourceSkyShFromCoefficients,
  installUeSourceSkyLightNode,
  tintUeSourceSkySh,
} from '../../src/environment/ueSourceSkyLight.js';
import { loadUnityRockMaterial } from '../../src/rockgen/reference/unityRockMaterial.js';
import { loadRockReferenceSourceMaterialProfile } from '../../src/rockgen/reference/referenceSourceMaterial.js';
import {
  loadSoStylizedUnityRockMaterialIndex,
  resolveSoStylizedUnityRockMaterial,
} from '../../src/environment/soStylizedUnityRockMaterialResolver.js';
import {
  SURFACE_MATERIAL_MODE,
  resolveSurfaceMaterialFamily,
  resolveSurfaceMaterialMode,
} from '../../src/environment/surfaceMaterialModes.js';
import { createEnvironmentGroundFieldPass } from '../../src/environment/environmentGroundFieldPass.js';
import { createSourceEnvironmentTestContent } from '../../src/environment/sourceEnvironmentTestContent.js';
import { environmentGroundField } from '../../src/shaders-tsl/chunks/environment-ground-field.js';
import {
  UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT,
  UE_SOURCE_TONE_MAPPING,
  createUeSourceToneMapping,
} from '../../src/environment/ueSourceTonemapping.js';
import {
  applyUeDirectionalShadowFilterContract,
  computeUeDirectionalShadowBiasContract,
} from '../../src/environment/ueSourceShadowFilter.js';
import {
  loadUeSourceTemporalDitherNoiseTexture,
  ueSourceDitherTemporalAA,
} from '../../src/environment/ueSourceTemporal.js';
import { resolveSharedLightSelection } from './profileSelection.js';

const PROFILE_REGISTRY_URL = '/assets-local/parity/single-rock/profiles.json';
const SCENE_URL = '/assets-local/parity/single-rock/unity-scene.glb';
const IMAGE_ROOT = '/assets-local/parity/single-rock';
const UE_VISUAL_TARGET_ROOT = `${IMAGE_ROOT}/source-references/ue-documented`;
const UE_VISUAL_TARGET_CONFIGURATION_URL = `${IMAGE_ROOT}/source-configurations/ue-so-stylized-documented.json`;
const MINIMAL_ENVIRONMENT_CAPTURE_ROOT =
  '/assets-local/parity/minimal-environment/p13-author-hard/spire-05';
const P19_UNREAL_CAPTURE_ROOT =
  '/assets-local/parity/minimal-environment/p19-author-hard/spire-05';
const ROCK_LIBRARY_ROOT = '/assets-local/sostylized-unity';
const UNITY_STAGE_INPUT_ADAPTER = PARITY_ENVIRONMENT_INPUT_ADAPTERS.unityStage;
const UE_CAPTURED_SCENE_INPUT_ADAPTER = PARITY_ENVIRONMENT_INPUT_ADAPTERS.ueCapturedScene;
const UE_NATIVE_DIFFUSE_SKY_MODE = 'ue-native-captured-scene-diffuse-sh';
const UE_CLASSIC_DAY_SKY_MODE = 'ue-visual-target-classic-day-atlas';
const TEST_ROCKS = Object.freeze([
  Object.freeze({ id: 'contract', label: 'Parity control · SM_CliffClassic2', assetName: 'SM_CliffClassic2' }),
  Object.freeze({ id: 'classic-cliff-01', label: 'Classic cliff 01 · SM_CliffClassic1', assetName: 'SM_CliffClassic1', sourceMaterial: 'MV_RockClassic_Cliff' }),
  Object.freeze({ id: 'classic-cliff-03', label: 'Classic cliff 03 · SM_CliffClassic3', assetName: 'SM_CliffClassic3', sourceMaterial: 'MV_RockClassic_Cliff' }),
  Object.freeze({ id: 'classic-cliff-04', label: 'Classic cliff 04 · SM_CliffClassic4', assetName: 'SM_CliffClassic4', sourceMaterial: 'MV_RockClassic_Cliff' }),
  Object.freeze({ id: 'classic-cliff-05', label: 'Classic cliff 05 · SM_CliffClassic5', assetName: 'SM_CliffClassic5', sourceMaterial: 'MV_RockClassic_Cliff' }),
  Object.freeze({ id: 'classic-cliff-06', label: 'Classic cliff 06 · SM_CliffClassic6', assetName: 'SM_CliffClassic6', sourceMaterial: 'MV_RockClassic_Cliff' }),
  Object.freeze({ id: 'spire-01', label: 'Spire 01 · SM_RockSpire_Spire01', assetName: 'SM_RockSpire_Spire01', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
  Object.freeze({ id: 'spire-02', label: 'Spire 02 · SM_RockSpire_Spire02', assetName: 'SM_RockSpire_Spire02', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
  Object.freeze({ id: 'spire-03', label: 'Spire 03 · SM_RockSpire_Spire03', assetName: 'SM_RockSpire_Spire03', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
  Object.freeze({ id: 'spire-04', label: 'Spire 04 · SM_RockSpire_Spire04', assetName: 'SM_RockSpire_Spire04', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
  Object.freeze({ id: 'spire-05', label: 'Pointed spire focus · SM_RockSpire_Spire05', assetName: 'SM_RockSpire_Spire05', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.22 }),
  Object.freeze({ id: 'spire-06', label: 'Spire 06 · SM_RockSpire_Spire06', assetName: 'SM_RockSpire_Spire06', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
  Object.freeze({ id: 'spire-07', label: 'Spire 07 · SM_RockSpire_Spire07', assetName: 'SM_RockSpire_Spire07', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
  Object.freeze({ id: 'spire-08', label: 'Spire 08 · SM_RockSpire_Spire08', assetName: 'SM_RockSpire_Spire08', sourceMaterial: 'MV_RockSpire_Spires', groundInsetFraction: 0.08 }),
]);

// One modular environment state drives every piece of comparison content.
// P13/day remains the sealed checkpoint. The other states are explicit
// capture candidates and never borrow the daytime native images.
const TIME_OF_DAY_PRESETS = Object.freeze({
  sunrise: Object.freeze({
    label: 'Sunrise',
    dayCycleProgress: 0.75,
    currentTime: 950,
    elevationDegrees: 10,
    reverseAzimuth: true,
    directColor: [1.0, 0.55, 0.31],
    directEnergy: 0.58,
    ambientColor: [0.20, 0.28, 0.48],
    ambientEnergy: 0.72,
    skyTint: [0.72, 0.66, 0.82],
    skyEnergy: 0.82,
  }),
  day: Object.freeze({
    label: 'Day · sealed P13',
    dayCycleProgress: 0,
    currentTime: 250,
    elevationDegrees: null,
    reverseAzimuth: false,
    directColor: [1, 1, 1],
    directEnergy: 1,
    ambientColor: [1, 1, 1],
    ambientEnergy: 1,
    skyTint: [1, 1, 1],
    skyEnergy: 1,
  }),
  sunset: Object.freeze({
    label: 'Sunset',
    dayCycleProgress: 0.25,
    currentTime: 575,
    elevationDegrees: 8,
    reverseAzimuth: false,
    directColor: [1.0, 0.38, 0.16],
    directEnergy: 0.48,
    ambientColor: [0.18, 0.20, 0.45],
    ambientEnergy: 0.68,
    skyTint: [0.68, 0.48, 0.72],
    skyEnergy: 0.66,
  }),
  night: Object.freeze({
    label: 'Night',
    dayCycleProgress: 0.5,
    currentTime: 740,
    elevationDegrees: 38,
    reverseAzimuth: true,
    directColor: [0.24, 0.38, 0.74],
    directEnergy: 0.16,
    ambientColor: [0.08, 0.15, 0.36],
    ambientEnergy: 0.42,
    skyTint: [0.10, 0.18, 0.42],
    skyEnergy: 0.34,
  }),
});

const query = new URLSearchParams(location.search);
const requestedProfileId = query.get('profile');
const requestedLightMode = query.get('light') ?? query.get('visualLight');
const requestedTimeOfDay = query.get('timeOfDay') ?? query.get('tod') ?? 'day';
const debugGroundMode = query.get('debugGround');
const timeOfDay = Object.hasOwn(TIME_OF_DAY_PRESETS, requestedTimeOfDay)
  ? requestedTimeOfDay
  : 'day';
const timeOfDayPreset = TIME_OF_DAY_PRESETS[timeOfDay];
const shadowMode = query.get('shadow') === 'off' ? 'off' : 'hard';
const view = query.get('view') === 'live' ? 'live' : 'compare';
const contentMode = query.get('content') === 'environment' ? 'environment' : 'rock';
const requestedRockView = query.get('rockView');
let rockView = [
  'front',
  'back',
  'bench',
  'mountain',
  'mountain-surface',
  'cliff',
].includes(requestedRockView)
  ? requestedRockView
  : 'front';
const requestedTestRockId = query.get('testRock') ?? 'contract';
const selectedTestRock = TEST_ROCKS.find((entry) => entry.id === requestedTestRockId)
  ?? TEST_ROCKS[0];
const hud = query.get('hud') === '0' ? 'off' : 'on';
document.body.dataset.view = view;
document.body.dataset.hud = hud;
document.body.dataset.shadowMode = shadowMode;

const element = (id) => document.getElementById(id);

function allowedRockViews(profileId, requestedContentMode = contentMode) {
  if (requestedContentMode !== 'environment') return ['front', 'back'];
  if (profileId === 'p18-visual-target-stylized-basic') {
    return ['front', 'back', 'bench'];
  }
  if (profileId === 'p19-visual-target-mountain-cliff') {
    return ['front', 'back', 'mountain', 'mountain-surface', 'cliff'];
  }
  return ['front', 'back'];
}

function normalizeRockView(profileId, requestedContentMode, candidate = rockView) {
  return allowedRockViews(profileId, requestedContentMode).includes(candidate)
    ? candidate
    : 'front';
}

function writeRockViewToUrl(target, nextRockView) {
  if (nextRockView === 'front') target.searchParams.delete('rockView');
  else target.searchParams.set('rockView', nextRockView);
}

function installPanelMaximization() {
  const comparison = element('comparison');
  const panels = [...comparison.querySelectorAll('.engine-panel')];
  let maximizedPanel = null;

  const requestRendererResize = () => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  };

  const restorePanels = () => {
    if (!maximizedPanel) return;
    const button = maximizedPanel.querySelector('[data-panel-maximize]');
    maximizedPanel.classList.remove('is-maximized');
    comparison.classList.remove('is-panel-maximized');
    document.body.classList.remove('is-panel-maximized');
    button.textContent = 'Maximize';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute(
      'aria-label',
      button.dataset.maximizeLabel,
    );
    maximizedPanel = null;
    requestRendererResize();
  };

  for (const panel of panels) {
    const button = panel.querySelector('[data-panel-maximize]');
    if (!button) continue;
    button.dataset.maximizeLabel = button.getAttribute('aria-label');
    button.addEventListener('click', () => {
      if (maximizedPanel === panel) {
        restorePanels();
        return;
      }
      restorePanels();
      maximizedPanel = panel;
      panel.classList.add('is-maximized');
      comparison.classList.add('is-panel-maximized');
      document.body.classList.add('is-panel-maximized');
      button.textContent = 'Restore';
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', 'Restore four-panel comparison');
      requestRendererResize();
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') restorePanels();
  });
}

const maximum = (values) => values.reduce((result, value) => Math.max(result, value), 0);
const absoluteDifference = (left, right) => Math.abs(Number(left) - Number(right));
const vectorMaximumError = (left, right) => maximum(left.map(
  (value, index) => absoluteDifference(value, right[index]),
));
const convertUnityPosition = ([x, y, z]) => [x, y, -z];
const convertUnityQuaternion = ([x, y, z, w]) => [-x, -y, z, w];

function updateLinks(profileId, lightMode) {
  for (const link of document.querySelectorAll('[data-shadow-link]')) {
    const target = new URL(location.href);
    target.searchParams.set('shadow', link.dataset.shadowLink);
    target.searchParams.set('view', view);
    target.searchParams.set('profile', profileId);
    if (lightMode) target.searchParams.set('light', lightMode);
    else target.searchParams.delete('light');
    target.searchParams.delete('visualLight');
    link.href = target;
    link.setAttribute('aria-current', String(link.dataset.shadowLink === shadowMode));
  }
  for (const link of document.querySelectorAll('[data-view-link]')) {
    const target = new URL(location.href);
    target.searchParams.set('shadow', shadowMode);
    target.searchParams.set('view', link.dataset.viewLink);
    target.searchParams.set('profile', profileId);
    if (lightMode) target.searchParams.set('light', lightMode);
    else target.searchParams.delete('light');
    target.searchParams.delete('visualLight');
    link.href = target;
    link.setAttribute('aria-current', String(link.dataset.viewLink === view));
  }
}

function installSharedLightPicker(registry, lightMode) {
  const select = element('shared-light-select');
  select.replaceChildren(...registry.sharedLightVariants.map((variant) => {
    const option = document.createElement('option');
    option.value = variant.id;
    option.textContent = variant.label;
    option.selected = variant.id === lightMode;
    return option;
  }));
  select.addEventListener('change', () => {
    const variant = registry.sharedLightVariants.find((candidate) => candidate.id === select.value);
    if (!variant) return;
    const target = new URL(location.href);
    target.searchParams.set('light', variant.id);
    target.searchParams.set('profile', variant.profileId);
    target.searchParams.delete('visualLight');
    location.href = target;
  });
}

function installProfilePicker(registry, profileId) {
  const select = element('profile-select');
  select.replaceChildren(...registry.profiles.map((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = `${profile.label} · ${profile.status}`;
    option.selected = profile.id === profileId;
    return option;
  }));
  select.addEventListener('change', () => {
    const target = new URL(location.href);
    target.searchParams.set('profile', select.value);
    const variant = registry.sharedLightVariants.find(
      (candidate) => candidate.profileId === select.value,
    );
    if (variant) target.searchParams.set('light', variant.id);
    else target.searchParams.delete('light');
    writeRockViewToUrl(
      target,
      normalizeRockView(select.value, contentMode),
    );
    target.searchParams.delete('visualLight');
    location.href = target;
  });
}

function installTimeOfDayPicker() {
  for (const select of document.querySelectorAll('[data-time-of-day-select]')) {
    select.value = timeOfDay;
    select.addEventListener('change', () => {
      const target = new URL(location.href);
      if (select.value === 'day') target.searchParams.delete('timeOfDay');
      else target.searchParams.set('timeOfDay', select.value);
      target.searchParams.delete('tod');
      location.href = target;
    });
  }
}

function installRockViewPicker(profileId) {
  const select = element('rock-view-select');
  const allowed = new Set(allowedRockViews(profileId));
  for (const option of select.options) {
    option.hidden = !allowed.has(option.value);
    option.disabled = !allowed.has(option.value);
  }
  select.value = rockView;
  select.addEventListener('change', () => {
    const target = new URL(location.href);
    writeRockViewToUrl(target, select.value);
    location.href = target;
  });
}

function installContentPicker(profileId) {
  const select = element('content-select');
  select.value = contentMode;
  select.addEventListener('change', () => {
    const target = new URL(location.href);
    if (select.value === 'rock') target.searchParams.delete('content');
    else target.searchParams.set('content', select.value);
    writeRockViewToUrl(
      target,
      normalizeRockView(profileId, select.value),
    );
    location.href = target;
  });
}

function installTestRockPicker() {
  const select = element('test-rock-select');
  select.replaceChildren(...TEST_ROCKS.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    option.selected = entry.id === selectedTestRock.id;
    return option;
  }));
  select.addEventListener('change', () => {
    const target = new URL(location.href);
    if (select.value === 'contract') target.searchParams.delete('testRock');
    else target.searchParams.set('testRock', select.value);
    location.href = target;
  });
}

function captureViewSuffix() {
  return rockView === 'front' ? '' : `-${rockView}`;
}

function setPendingCapture(frameId, placeholderId, stateId, label) {
  const frame = element(frameId);
  frame.hidden = true;
  frame.removeAttribute('src');
  element(placeholderId).hidden = false;
  element(stateId).textContent = label;
}

function setGate(id, { label, state }) {
  const target = element(id);
  target.textContent = label;
  target.classList.remove('pass', 'fail', 'pending');
  if (state) target.classList.add(state);
}

function linearLightColor(source) {
  return new THREE.Color().setRGB(
    source[0],
    source[1],
    source[2],
    THREE.SRGBColorSpace,
  );
}

function linearSrgb8Color(source) {
  return linearLightColor(source.slice(0, 3).map((channel) => channel / 255));
}

function lightingInputAdapter(contract) {
  return resolveParityEnvironmentInputAdapter(contract);
}

function usesUeNativeDiffuseSky(contract) {
  return contract.skyLight?.mode === UE_NATIVE_DIFFUSE_SKY_MODE;
}

function lightRayDirection(contract) {
  const rotation = new THREE.Quaternion(...contract.sun.worldRotationQuaternion);
  const unityRay = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
  return new THREE.Vector3(unityRay.x, unityRay.y, -unityRay.z).normalize();
}

function timeOfDayLightRay(baseRay) {
  if (timeOfDayPreset.elevationDegrees == null) return baseRay.clone();
  const horizontal = new THREE.Vector3(baseRay.x, 0, baseRay.z);
  if (horizontal.lengthSq() < 1e-8) horizontal.set(1, 0, 0);
  horizontal.normalize();
  if (timeOfDayPreset.reverseAzimuth) horizontal.negate();
  const elevation = THREE.MathUtils.degToRad(timeOfDayPreset.elevationDegrees);
  return horizontal.multiplyScalar(Math.cos(elevation))
    .add(new THREE.Vector3(0, -Math.sin(elevation), 0))
    .normalize();
}

function createSharedSourceEnvironmentState(ray) {
  return {
    uniforms: {
      currentTime: uniform(timeOfDayPreset.currentTime),
      dayCycleProgress: uniform(timeOfDayPreset.dayCycleProgress),
      time: uniform(0),
      sunDirection: uniform(ray.clone()),
    },
    userData: {
      timeOfDay,
      preset: { ...timeOfDayPreset },
    },
  };
}

function applyExactCamera(camera, contract, explicitCaptureView = null) {
  const captureView = explicitCaptureView
    ?? contract.capture?.views?.[rockView]
    ?? contract.camera;
  camera.fov = captureView.verticalFieldOfViewDegrees
    ?? contract.camera.verticalFieldOfViewDegrees;
  camera.aspect = contract.camera.aspect;
  camera.near = contract.camera.near;
  camera.far = contract.sky?.toonlabCameraFarMeters ?? contract.camera.far;
  const target = new THREE.Vector3(...convertUnityPosition(captureView.lookAt));
  const position = new THREE.Vector3(...convertUnityPosition(captureView.position));
  if (rockView === 'back' && !contract.capture?.views?.back) {
    const offset = position.clone().sub(target);
    offset.x *= -1;
    offset.z *= -1;
    position.copy(target).add(offset);
  }
  camera.position.copy(position);
  camera.up.fromArray(convertUnityPosition(captureView.up ?? contract.camera.up));
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function focusExactCameraOnObject(
  camera,
  contract,
  object,
  explicitCaptureView = null,
) {
  if (rockView === 'bench') {
    if (!explicitCaptureView) {
      applyExactCamera(camera, contract);
      camera.userData.parityFocus = {
        mode: 'unsupported-view-front-fallback',
        requestedView: rockView,
      };
      return;
    }
    applyExactCamera(camera, contract, explicitCaptureView);
    camera.userData.parityFocus = {
      mode: 'shared-p18-bench-camera',
      position: convertUnityPosition(explicitCaptureView.lookAt),
    };
    return;
  }
  if (
    rockView === 'mountain'
    || rockView === 'mountain-surface'
    || rockView === 'cliff'
  ) {
    const bounds = new THREE.Box3().setFromObject(object, true);
    if (bounds.isEmpty()) {
      throw new Error('The shared P19 mountain/cliff camera has no source geometry.');
    }
    const focus = bounds.getCenter(new THREE.Vector3());
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const canonicalTarget = new THREE.Vector3(
      ...convertUnityPosition(contract.camera.lookAt),
    );
    const canonicalPosition = new THREE.Vector3(
      ...convertUnityPosition(contract.camera.position),
    );
    const viewDirection = canonicalPosition.sub(canonicalTarget).normalize();
    const verticalFovRadians = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFovRadians = 2 * Math.atan(
      Math.tan(verticalFovRadians / 2) * camera.aspect,
    );
    const forward = viewDirection.clone().negate();
    const canonicalUp = new THREE.Vector3(
      ...convertUnityPosition(contract.camera.up),
    ).normalize();
    const viewRight = new THREE.Vector3()
      .crossVectors(forward, canonicalUp)
      .normalize();
    const viewUp = new THREE.Vector3()
      .crossVectors(viewRight, forward)
      .normalize();
    const halfVerticalTangent = Math.tan(verticalFovRadians / 2);
    const halfHorizontalTangent = Math.tan(horizontalFovRadians / 2);
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    const projectedBoundsDistance = corners.reduce((required, corner) => {
      const offset = corner.sub(focus);
      const towardCamera = offset.dot(viewDirection);
      const horizontalDistance =
        Math.abs(offset.dot(viewRight)) / halfHorizontalTangent;
      const verticalDistance =
        Math.abs(offset.dot(viewUp)) / halfVerticalTangent;
      return Math.max(
        required,
        towardCamera + horizontalDistance,
        towardCamera + verticalDistance,
      );
    }, 0) * 1.08;
    const distance = rockView === 'mountain-surface'
      ? sphere.radius * 1.08
      : projectedBoundsDistance;
    camera.position.copy(focus).addScaledVector(viewDirection, distance);
    camera.far = Math.max(
      camera.far,
      distance + sphere.radius * 3,
    );
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    camera.userData.parityFocus = {
      boundsMax: bounds.max.toArray(),
      boundsMin: bounds.min.toArray(),
      mode: `p19-source-${rockView}-bounds-fit`,
      position: focus.toArray(),
      radiusMeters: sphere.radius,
      reviewPolicy: rockView === 'mountain-surface'
        ? 'intentional interior crop; overview view retains complete bounds'
        : 'complete source bounds',
    };
    return;
  }
  const canonicalTarget = new THREE.Vector3(
    ...convertUnityPosition(contract.camera.lookAt),
  );
  const canonicalPosition = new THREE.Vector3(
    ...convertUnityPosition(contract.camera.position),
  );
  const offset = canonicalPosition.sub(canonicalTarget);
  if (rockView === 'back') {
    offset.x *= -1;
    offset.z *= -1;
  }
  const focus = new THREE.Box3()
    .setFromObject(object, true)
    .getCenter(new THREE.Vector3());
  camera.position.copy(focus).add(offset);
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.userData.parityFocus = {
    mode: 'rendered-rock-bounds-center',
    position: focus.toArray(),
  };
}

function isolateP19NatureReview({
  focusFixtureId,
  roots,
  sourceEnvironmentContent,
}) {
  if (!focusFixtureId || !sourceEnvironmentContent?.mountainCliff) return null;
  [
    sourceEnvironmentContent.groundRoot,
    sourceEnvironmentContent.grass,
    sourceEnvironmentContent.tree,
    sourceEnvironmentContent.flowers,
    roots.rockRoot,
  ].filter(Boolean).forEach((object) => {
    object.visible = false;
  });
  const fixtureVisibility = [];
  sourceEnvironmentContent.mountainCliff.children.forEach((object) => {
    const fixtureId = object.userData.p19MountainCliffFixture?.id;
    const visible = fixtureId === focusFixtureId;
    object.visible = visible;
    fixtureVisibility.push({ fixtureId, visible });
  });
  sourceEnvironmentContent.mountainCliff.userData.p19ReviewIsolation = {
    focusFixtureId,
    fixtureVisibility,
    hiddenAcceptedFamilies: [
      'P14 ground',
      'P15 grass',
      'P16 tree',
      'P17 flowers',
      'single-rock parity fixture',
    ],
    policy:
      'Camera-only material inspection. The integrated front/back views retain all accepted nature families.',
  };
  return sourceEnvironmentContent.mountainCliff.userData.p19ReviewIsolation;
}

function usesRawUntonedVisualTargetRadiometry(contract) {
  return lightingInputAdapter(contract) === UE_CAPTURED_SCENE_INPUT_ADAPTER
    && contract.sun.intensity === 8
    && contract.render.postProcessing === false
    && contract.render.colorGrading === false;
}

function usesUeSourceDisplayTransfer(contract) {
  return contract.post?.mode === 'ue-5.8-source-fixed-exposure-filmic-sdr';
}

function loadParityRockMaterial(contract) {
  const graph = contract.engineAdapters?.toonlab?.surfaceMaterialGraph;
  if (graph === 'ue-m-rock') {
    const requestedCrackStrength = query.has('debugCrack')
      ? Number(query.get('debugCrack'))
      : Number.NaN;
    const requestedStylizedStrength = query.has('debugStylized')
      ? Number(query.get('debugStylized'))
      : Number.NaN;
    const requestedStylizedBridge = query.has('debugStylizedBridge')
      ? Number(query.get('debugStylizedBridge'))
      : Number.NaN;
    const requestedStylizedUv = query.has('debugStylizedUv')
      ? Number(query.get('debugStylizedUv'))
      : Number.NaN;
    const requestedStylizedGreen = query.get('debugStylizedGreen');
    const requestedStylizedFlipV = query.has('debugStylizedFlipV')
      ? query.get('debugStylizedFlipV') === '1'
      : null;
    return loadRockReferenceSourceMaterialProfile(contract.rock.unreal.material, {
      normalResponseBridge:
        contract.engineAdapters?.toonlab?.normalResponseBridge ?? 0,
      projectedCrackNormalStrength:
        Number.isFinite(requestedCrackStrength)
          ? requestedCrackStrength
          : contract.engineAdapters?.toonlab?.projectedCrackNormalStrength ?? 1,
      sourceAssetName: contract.rock.id,
      stylizedNormalFlipV:
        requestedStylizedFlipV ?? contract.engineAdapters?.toonlab?.stylizedNormalFlipV ?? false,
      stylizedNormalGreenConvention:
        ['directx', 'opengl'].includes(requestedStylizedGreen)
          ? requestedStylizedGreen
          : contract.engineAdapters?.toonlab?.stylizedNormalGreenConvention ?? 'directx',
      stylizedNormalResponseBridge:
        Number.isFinite(requestedStylizedBridge)
          ? requestedStylizedBridge
          : contract.engineAdapters?.toonlab?.stylizedNormalResponseBridge ?? 0,
      stylizedNormalStrength:
        Number.isFinite(requestedStylizedStrength)
          ? requestedStylizedStrength
          : contract.engineAdapters?.toonlab?.stylizedNormalStrength ?? 1,
      stylizedNormalUvChannel:
        Number.isFinite(requestedStylizedUv)
          ? requestedStylizedUv
          : contract.engineAdapters?.toonlab?.stylizedNormalUvChannel ?? 0,
    });
  }
  return loadUnityRockMaterial({
    baseUrl: ROCK_LIBRARY_ROOT,
    coordinates: { distanceScale: 1, zSign: -1 },
    material: contract.rock.toonlab.materialRecord,
    name: `Parity ${contract.rock.toonlab.materialRecord}`,
    textureFlipY: true,
  });
}

async function loadUeSourceStylizedNormal(contract) {
  const result = await new THREE.TextureLoader().loadAsync(
    contract.rock.toonlab.sourceStylizedNormal,
  );
  result.name = 'T_RockClassicCliffs_N — UE source 4096';
  result.colorSpace = THREE.NoColorSpace;
  result.flipY = false;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.magFilter = THREE.LinearFilter;
  result.anisotropy = 8;
  result.needsUpdate = true;
  return result;
}

function applyUeSourceStylizedNormal(material, sourceNormal, contract) {
  if (!sourceNormal) throw new Error('The UE source stylized normal is missing.');
  material.name = `${contract.rock.id} — source material + UE 4096 stylized normal`;
  const sampled = texture(sourceNormal).sample(uv()).rgb;
  const directXCorrected = vec3(
    sampled.r,
    float(1).sub(sampled.g),
    sampled.b,
  );
  const strength = contract.engineAdapters?.toonlab?.authoredNormalStrength ?? 1;
  material.normalNode = normalMap(directXCorrected, vec2(strength, strength));
  material.normalMap = null;
  material.userData.authoredRockBake = {
    source: contract.rock.toonlab.sourceStylizedNormal,
    resolution: 4096,
    textureCoordinate: 0,
    payload: ['T_RockClassicCliffs_N'],
    excludedLayer: 'T_RockClassic_N world-aligned crack layer',
    exclusionReason: 'P08/P09 proved the projected crack layer is the over-response source',
  };
  material.needsUpdate = true;
  return material;
}

function authoredGltfMaterialToNodeMaterial(sourceMaterial, contract) {
  const source = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  if (!source) throw new Error('The UE-authored glTF has no material payload.');
  const material = new MeshPhysicalNodeMaterial();
  material.name = `${contract.rock.id} — UE 4096 authored glTF material inputs`;
  const sourceColor = source.color ?? new THREE.Color(1, 1, 1);
  const sourceEmissive = source.emissive ?? new THREE.Color(0, 0, 0);
  const textureScale = contract.rock.unity.authoredMaterial.textureScale;
  const textureOffset = contract.rock.unity.authoredMaterial.textureOffset;
  const authoredUv = uv(1)
    .mul(vec2(textureScale[0], textureScale[1]))
    .add(vec2(textureOffset[0], textureOffset[1]));

  // Do not rely on MaterialNode's implicit UV lookup here. GLTFLoader stores
  // the authored texture transform on each Texture, but transferring those
  // maps to a fresh node material made WebGPU fall back to UV0. Sampling the
  // exact secondary UV and transform explicitly removes the black atlas
  // padding while preserving the UE bake byte-for-byte.
  const baseColorSample = texture(source.map, authoredUv);
  const ormSample = texture(source.metalnessMap, authoredUv);
  const normalSample = texture(source.normalMap, authoredUv);
  const emissiveSample = texture(source.emissiveMap, authoredUv);
  material.colorNode = baseColorSample.rgb.mul(vec3(
    sourceColor.r,
    sourceColor.g,
    sourceColor.b,
  ));
  material.metalnessNode = ormSample.b.mul(source.metalness ?? 1);
  material.roughnessNode = ormSample.g.mul(source.roughness ?? 1);
  material.normalNode = normalMap(
    normalSample.rgb,
    vec2(source.normalScale?.x ?? 1, source.normalScale?.y ?? 1),
  );
  material.emissiveNode = emissiveSample.rgb.mul(vec3(
    sourceEmissive.r,
    sourceEmissive.g,
    sourceEmissive.b,
  )).mul(source.emissiveIntensity ?? 1);
  material.ueSourceSpecularNode = source.specularIntensityMap
    ? texture(source.specularIntensityMap, authoredUv).a
      .mul(source.specularIntensity ?? 1)
    : float(source.specularIntensity ?? 0.2);
  material.transparent = false;
  material.alphaTest = 0;
  material.side = THREE.FrontSide;
  material.fog = true;
  material.userData.environmentShaderExclude = true;
  material.userData.authoredRockBake = {
    source: contract.rock.toonlab.authored,
    payload: [
      'baseColor 4096',
      'metallicRoughness 4096',
      'normal 4096',
      'emissive 4096',
      'specular 4096',
      'TEXCOORD_1 + KHR_texture_transform',
    ],
    policy: 'Consume the actual UE glTF material payload; no replacement Unity material and no single-normal shortcut.',
  };
  material.needsUpdate = true;
  return material;
}

async function loadSourceTestRockMaterial(testRock) {
  if (!testRock.sourceMaterial) {
    throw new Error(`${testRock.assetName} has no source material assignment.`);
  }
  const index = await loadSoStylizedUnityRockMaterialIndex();
  const resolution = resolveSoStylizedUnityRockMaterial(testRock.sourceMaterial, {
    allowFallback: false,
    index,
    sourceAssetName: testRock.assetName,
  });
  if (!resolution?.materialRecord || !resolution.isExact) {
    throw new Error(
      `${testRock.assetName} could not resolve exact source material ${testRock.sourceMaterial}.`,
    );
  }
  const material = await loadUnityRockMaterial({
    manifest: index.manifest,
    material: resolution.materialRecord,
    coordinates: {
      distanceScale: 1,
      zSign: 1,
    },
  });
  material.name = `${testRock.assetName} — source ${resolution.unityMaterialName}`;
  material.userData.environmentShaderExclude = true;
  material.userData.sourceRockTest = {
    assetName: testRock.assetName,
    geometry: `/assets-local/rock-references/${testRock.assetName}/lod0.glb`,
    geometryNormalization: 'uniform height fit to the locked SM_CliffClassic2 parity stage',
    material: resolution.unityMaterialName,
    materialGraph: 'Unity S_Rock Shader Graph source reconstruction',
    materialMatchKind: resolution.matchKind,
  };
  material.needsUpdate = true;
  return material;
}

function normalizeTestRockGeometry(geometry, contract, testRock) {
  if (testRock.id === 'contract') return { scale: 1, sourceBounds: null };
  geometry.computeBoundingBox();
  const sourceBounds = geometry.boundingBox.clone();
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const targetSize = new THREE.Vector3(...contract.rock.sourceMeshBounds.size);
  const targetCenter = new THREE.Vector3(...contract.rock.sourceMeshBounds.center);
  const scale = targetSize.y / sourceSize.y;
  const sourceAnchor = new THREE.Vector3(sourceCenter.x, sourceBounds.min.y, sourceCenter.z);
  const targetAnchor = new THREE.Vector3(
    targetCenter.x,
    targetCenter.y - targetSize.y * 0.5
      - targetSize.y * (testRock.groundInsetFraction ?? 0),
    targetCenter.z,
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
    -sourceAnchor.x,
    -sourceAnchor.y,
    -sourceAnchor.z,
  ));
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale));
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
    targetAnchor.x,
    targetAnchor.y,
    targetAnchor.z,
  ));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    groundInsetFraction: testRock.groundInsetFraction ?? 0,
    scale,
    sourceBounds: {
      min: sourceBounds.min.toArray(),
      max: sourceBounds.max.toArray(),
    },
  };
}

function createShaderBypassMaterial(
  source,
  mode = SURFACE_MATERIAL_MODE.neutralLit,
) {
  const sourceBaseline = resolveSurfaceMaterialMode(source, mode)
    ?? resolveSurfaceMaterialMode(source, SURFACE_MATERIAL_MODE.neutralLit);
  const rawTextureOnly = mode === SURFACE_MATERIAL_MODE.rawTexture;
  const material = rawTextureOnly
    ? new MeshBasicNodeMaterial()
    : new MeshPhysicalNodeMaterial();
  material.name = `${source?.name || 'Surface'} — ${mode}`;
  if (source?.color?.isColor) material.color.copy(source.color);
  material.map = source?.map ?? null;
  material.alphaMap = source?.alphaMap ?? null;
  material.colorNode = sourceBaseline?.colorNode
    ?? null;
  material.opacityNode = sourceBaseline?.opacityNode
    ?? source?.opacityNode
    ?? null;
  material.alphaTestNode = sourceBaseline?.alphaTestNode
    ?? source?.alphaTestNode
    ?? null;
  if (!rawTextureOnly) {
    // Neutral-lit keeps the shared scene-light evaluation while bypassing the
    // authored surface graph.
    material.normalNode = null;
    material.roughness = 0.8;
    material.metalness = 0;
    material.specularIntensity = 0.5;
    material.emissive.set(0x000000);
  }
  // A shader-off comparison must not retain wind, height displacement, or
  // any other vertex graph. The authored mesh and placement remain intact.
  material.positionNode = null;
  material.opacity = source?.opacity ?? 1;
  material.alphaTest = source?.alphaTest ?? 0;
  material.transparent = source?.transparent ?? false;
  material.side = source?.side ?? THREE.FrontSide;
  material.depthTest = source?.depthTest ?? true;
  material.depthWrite = source?.depthWrite ?? true;
  material.colorWrite = source?.colorWrite ?? true;
  material.fog = rawTextureOnly ? false : (source?.fog ?? true);
  material.toneMapped = rawTextureOnly ? false : (source?.toneMapped ?? true);
  material.vertexColors = source?.vertexColors ?? false;
  material.userData.shaderSwipe = {
    family: resolveSurfaceMaterialFamily(source),
    mode,
    sourceMaterial: source?.name ?? null,
  };
  material.needsUpdate = true;
  return material;
}

function createShaderSwipeMaterialSet(root) {
  const records = [];
  const baselines = new Map([
    [SURFACE_MATERIAL_MODE.neutralLit, new Map()],
    [SURFACE_MATERIAL_MODE.rawTexture, new Map()],
  ]);
  const familyCounts = new Map();
  const seenObjects = new Set();
  const roots = Array.isArray(root) ? root : [root];
  const visit = (object) => {
    if (seenObjects.has(object)) return;
    seenObjects.add(object);
    if (!object.isMesh || !object.material) return;
    const after = object.material;
    const sourceMaterials = Array.isArray(after) ? after : [after];
    const family = resolveSurfaceMaterialFamily(sourceMaterials[0]);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    const variants = {};
    for (const mode of [
      SURFACE_MATERIAL_MODE.neutralLit,
      SURFACE_MATERIAL_MODE.rawTexture,
    ]) {
      const modeBaselines = baselines.get(mode);
      const modeMaterials = sourceMaterials.map((source) => {
        if (!modeBaselines.has(source)) {
          modeBaselines.set(source, createShaderBypassMaterial(source, mode));
        }
        return modeBaselines.get(source);
      });
      variants[mode] = Array.isArray(after) ? modeMaterials : modeMaterials[0];
    }
    records.push({
      object,
      after,
      family,
      variants,
    });
  };
  for (const candidate of roots) candidate?.traverse(visit);
  return {
    applyMode(mode, { families = null } = {}) {
      const selectedFamilies = families ? new Set(families) : null;
      for (const record of records) {
        record.object.material = !selectedFamilies
          || selectedFamilies.has(record.family)
          ? (record.variants[mode] ?? record.after)
          : record.after;
      }
    },
    applyAfter() {
      for (const record of records) record.object.material = record.after;
    },
    applyBefore(mode = SURFACE_MATERIAL_MODE.neutralLit, options) {
      this.applyMode(mode, options);
    },
    dispose() {
      for (const modeBaselines of baselines.values()) {
        for (const material of modeBaselines.values()) material.dispose();
      }
    },
    families: Object.fromEntries(familyCounts),
    materialCount: [...baselines.values()]
      .reduce((count, modeBaselines) => count + modeBaselines.size, 0),
    meshCount: records.length,
  };
}

function resolveShaderSwipeTarget(contract, roots, sourceEnvironmentContent) {
  if (!sourceEnvironmentContent) return roots.rockRoot;
  // Live Preview is a whole-frame shader diagnostic. Its "before" side keeps
  // every authored mesh and texture, but bypasses every surface shader at
  // once so small families (especially the P17 daisies) remain judgeable in
  // the context of the ground, grass, tree, and rock.
  return [sourceEnvironmentContent.group, roots.rockRoot];
}

function installLiveCameraControls({
  camera,
  contract,
  indirectLight,
  light,
  renderer,
  scene,
  shaderTarget,
  visibleSky,
}) {
  const exactPosition = camera.position.clone();
  const exactQuaternion = camera.quaternion.clone();
  const exactTarget = camera.userData.parityFocus?.position
    ? new THREE.Vector3(...camera.userData.parityFocus.position)
    : new THREE.Vector3(...convertUnityPosition(contract.camera.lookAt));
  const controls = new OrbitControls(camera, renderer.domElement);
  const shaderSwipeMaterials = createShaderSwipeMaterialSet(shaderTarget);
  const shaderSwipe = {
    enabled: false,
    mode: SURFACE_MATERIAL_MODE.neutralLit,
    position: 0.2,
  };
  const rawBackground = new THREE.Color(0x777777);

  // OrbitControls initializes against the origin. Restore the frozen parity
  // pose before installing the actual contract target so entering Live never
  // shifts the comparison camera by one frame.
  camera.position.copy(exactPosition);
  camera.quaternion.copy(exactQuaternion);
  camera.updateMatrixWorld(true);
  controls.target.copy(exactTarget);
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  const initialDistance = exactPosition.distanceTo(exactTarget);
  controls.minDistance = Math.max(camera.near * 2, initialDistance * 0.08);
  controls.maxDistance = Math.min(camera.far * 0.75, initialDistance * 10);
  controls.update();
  controls.saveState();

  const applyRawPlacementOnlyState = () => {
    const lights = [];
    scene.traverse((object) => {
      if (!object.isLight) return;
      lights.push([object, object.visible]);
      object.visible = false;
    });
    const previous = {
      background: scene.background,
      fog: scene.fog,
      fogNode: scene.fogNode,
      shadowMapEnabled: renderer.shadowMap.enabled,
      skyVisible: visibleSky?.root.visible ?? null,
    };
    if (visibleSky) visibleSky.root.visible = false;
    if (light) light.visible = false;
    if (indirectLight) indirectLight.visible = false;
    scene.background = rawBackground;
    scene.fog = null;
    scene.fogNode = null;
    renderer.shadowMap.enabled = false;
    return () => {
      for (const [object, visible] of lights) object.visible = visible;
      if (visibleSky && previous.skyVisible !== null) {
        visibleSky.root.visible = previous.skyVisible;
      }
      scene.background = previous.background;
      scene.fog = previous.fog;
      scene.fogNode = previous.fogNode;
      renderer.shadowMap.enabled = previous.shadowMapEnabled;
    };
  };

  const renderLiveView = () => {
    // Match the authored UE actor: both domes stay at the world origin while
    // the inspection camera moves through the scene.
    visibleSky?.root.updateMatrixWorld(true);
    shaderSwipeMaterials.applyAfter();
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    if (shaderSwipe.enabled) {
      const renderSize = renderer.getSize(new THREE.Vector2());
      const beforeWidth = Math.max(
        1,
        Math.round(renderSize.x * shaderSwipe.position),
      );
      const restoreEnvironment =
        shaderSwipe.mode === SURFACE_MATERIAL_MODE.rawTexture
          ? applyRawPlacementOnlyState()
          : null;
      shaderSwipeMaterials.applyBefore(shaderSwipe.mode);
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, beforeWidth, renderSize.y);
      renderer.render(scene, camera);
      shaderSwipeMaterials.applyAfter();
      renderer.setScissorTest(false);
      restoreEnvironment?.();
    }
  };
  const resizeLiveView = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderLiveView();
  };
  const resetButton = element('reset-live-camera');
  const swipeButton = element('toggle-shader-swipe');
  const rawSwipeButton = element('toggle-raw-swipe');
  const swipeOverlay = element('shader-swipe');
  const swipeRange = element('shader-swipe-range');
  const beforeLabel = swipeOverlay?.querySelector('.shader-swipe-label-before');
  const afterLabel = swipeOverlay?.querySelector('.shader-swipe-label-after');
  const updateSwipePosition = (value) => {
    const percentage = THREE.MathUtils.clamp(Number(value) || 0, 0, 100);
    shaderSwipe.position = percentage / 100;
    swipeRange.value = String(percentage);
    swipeRange.setAttribute(
      'aria-valuetext',
      `${percentage}% before shader`,
    );
    swipeOverlay.style.setProperty('--shader-swipe-position', `${percentage}%`);
  };
  updateSwipePosition(20);
  const updateSwipeUi = () => {
    swipeOverlay.hidden = !shaderSwipe.enabled;
    const shaderModeActive = shaderSwipe.enabled
      && shaderSwipe.mode === SURFACE_MATERIAL_MODE.neutralLit;
    const rawModeActive = shaderSwipe.enabled
      && shaderSwipe.mode === SURFACE_MATERIAL_MODE.rawTexture;
    swipeButton?.setAttribute('aria-pressed', String(shaderModeActive));
    rawSwipeButton?.setAttribute('aria-pressed', String(rawModeActive));
    if (swipeButton) {
      swipeButton.textContent = shaderModeActive
        ? 'Hide shader swipe'
        : 'Shader swipe';
    }
    if (rawSwipeButton) {
      rawSwipeButton.textContent = rawModeActive
        ? 'Hide raw swipe'
        : 'Models + textures swipe';
    }
    if (beforeLabel) {
      beforeLabel.textContent = rawModeActive
        ? 'Models + textures only'
        : 'Neutral lit';
    }
    if (afterLabel) afterLabel.textContent = 'ToonLab shaders';
    document.body.dataset.shaderSwipe = shaderSwipe.enabled ? 'on' : 'off';
    document.body.dataset.shaderSwipeMode = shaderSwipe.enabled
      ? shaderSwipe.mode
      : 'off';
  };
  const toggleSwipeMode = (mode) => {
    const sameActiveMode = shaderSwipe.enabled && shaderSwipe.mode === mode;
    shaderSwipe.enabled = !sameActiveMode;
    shaderSwipe.mode = mode;
    if (shaderSwipe.enabled) updateSwipePosition(20);
    updateSwipeUi();
    renderLiveView();
  };
  swipeButton?.addEventListener('click', () => {
    toggleSwipeMode(SURFACE_MATERIAL_MODE.neutralLit);
  });
  rawSwipeButton?.addEventListener('click', () => {
    toggleSwipeMode(SURFACE_MATERIAL_MODE.rawTexture);
  });
  swipeRange?.addEventListener('input', () => {
    updateSwipePosition(swipeRange.value);
    renderLiveView();
  });
  resetButton?.addEventListener('click', () => {
    controls.reset();
    renderLiveView();
  });
  controls.addEventListener('change', renderLiveView);
  window.addEventListener('resize', resizeLiveView);
  resizeLiveView();
  document.body.dataset.liveControls = 'orbit-pan-zoom';
  document.body.dataset.shaderSwipe = 'off';
  document.body.dataset.shaderSwipeMode = 'off';
  updateSwipeUi();
  controls.shaderSwipe = shaderSwipe;
  controls.shaderSwipeMaterials = shaderSwipeMaterials;
  return controls;
}

function replaceMaterials(root, rockMaterial, groundMaterial) {
  const replaced = [];
  const rockMeshes = [];
  const groundMeshes = [];
  // GLTFLoader sanitizes spaces and punctuation in node names for animation
  // paths, so identity is matched by the immutable asset token instead of a
  // loader-specific spelling of the display name.
  let rockRoot = null;
  let groundRoot = null;
  root.traverse((object) => {
    if (!rockRoot && object.name.includes('SM_CliffClassic2')) rockRoot = object;
    if (!groundRoot && /^Parity[_ ]Ground$/.test(object.name)) groundRoot = object;
  });
  if (!rockRoot) throw new Error('Unity-exported source rock node is missing.');
  if (!groundRoot) throw new Error('Unity-exported parity ground node is missing.');

  rockRoot.traverse((object) => {
    if (!object.isMesh) return;
    if (object.material?.dispose) object.material.dispose();
    object.material = rockMaterial;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    replaced.push(object);
    rockMeshes.push(object);
  });
  groundRoot.traverse((object) => {
    if (!object.isMesh) return;
    if (object.material?.dispose) object.material.dispose();
    object.material = groundMaterial;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = false;
    replaced.push(object);
    groundMeshes.push(object);
  });
  return { groundMeshes, groundRoot, replaced, rockMeshes, rockRoot };
}

function createHardShadowLight(contract, ray, target) {
  const usesRetainedPineShadowContract =
    contract.profileId === 'p16-visual-target-tree'
    || contract.profileId === 'p17-visual-target-flowers'
    || contract.profileId === 'p18-visual-target-stylized-basic'
    || contract.profileId === 'p19-visual-target-mountain-cliff';
  const light = new THREE.DirectionalLight();
  light.name = 'Contract directional light';
  light.color.copy(linearLightColor(contract.sun.color));
  light.color.multiply(new THREE.Color(...timeOfDayPreset.directColor));
  const inputAdapter = lightingInputAdapter(contract);
  // Unity-stage profiles enter Three through a deliberate PI pre-scale which
  // the URP lighting model removes. The Visual Target profiles instead carry
  // raw UE radiometry; their explicit ue-captured-scene-sh adapter performs
  // the UE Lambert -> URP no-PI conversion inside the lighting model.
  light.intensity = inputAdapter === UE_CAPTURED_SCENE_INPUT_ADAPTER
    ? contract.sun.intensity
    : contract.sun.intensity * Math.PI;
  light.intensity *= timeOfDayPreset.directEnergy;
  light.castShadow = shadowMode === 'hard';
  light.position.copy(target).addScaledVector(ray, -35);
  light.target.position.copy(target);
  const shadowResolution = usesRetainedPineShadowContract ? 2048 : 1024;
  light.shadow.mapSize.set(shadowResolution, shadowResolution);
  light.shadow.camera.left = -10;
  light.shadow.camera.right = 10;
  light.shadow.camera.top = 10;
  light.shadow.camera.bottom = -10;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 70;
  light.shadow.bias = 0;
  light.shadow.normalBias = 0;
  light.shadow.radius = 0;
  if (usesRetainedPineShadowContract) {
    // Demonstration_SnowPines uses r.Shadow.FilterMethod=0,
    // r.ShadowQuality=5, 2048 CSM maps, CSMDepthBias=10,
    // CSMSlopeScaleDepthBias=3, CSMReceiverBias=0, and the source
    // DirectionalLight's .5 bias/.5 slope bias. Use the existing literal UE
    // Manual5x5PCF receiver adapter instead of the one-tap Three diagnostic
    // that produced the stippled leaf-card self-shadow pattern.
    const sourceShadowContract = computeUeDirectionalShadowBiasContract({
      cascadeBiasDistribution: 1,
      csmDepthBias: 10,
      csmSlopeScaleDepthBias: 3,
      maxSlopeDepthBias: 1,
      radius: 10,
      receiverBias: 0,
      resolution: shadowResolution - 8,
      subjectDepthRange: 100,
      userShadowBias: 0.5,
      userShadowSlopeBias: 0.5,
    });
    applyUeDirectionalShadowFilterContract(light.shadow, sourceShadowContract);
    light.shadow.ueLightDirectionToLight.copy(ray).negate();
  }
  return light;
}

function createShadowFill(contract) {
  const ambient = new THREE.AmbientLight();
  ambient.name = 'Contract constant cool shadow fill';
  ambient.color.copy(linearLightColor(contract.render.ambientColor));
  ambient.color.multiply(new THREE.Color(...timeOfDayPreset.ambientColor));
  // Three supplies AmbientLight as irradiance. The Unity-URP lighting adapter
  // divides indirect input by PI, so pre-scale once to recover Unity's bakedGI
  // convention exactly at the renderer boundary.
  ambient.intensity = contract.render.ambientIntensity * Math.PI;
  ambient.intensity *= timeOfDayPreset.ambientEnergy;
  return ambient;
}

function createNativeDiffuseSkyLight(contract) {
  const source = contract.skyLight;
  if (!source || source.mode !== UE_NATIVE_DIFFUSE_SKY_MODE) {
    throw new Error('The native diffuse SkyLight contract is missing or unsupported.');
  }
  if (source.nonnegativeDiffuseClamp !== true) {
    throw new Error('The native diffuse SkyLight requires UE nonnegative SH clamping.');
  }

  const rawSh = createUeSourceSkyShFromCoefficients(source.threeCoefficients);
  const tintLinear = linearSrgb8Color(source.colorSrgb8);
  const tintedSh = tintUeSourceSkySh(rawSh, tintLinear);
  const probe = new THREE.LightProbe(tintedSh, source.intensity);
  probe.name = 'Visual Target native diffuse SkyLight SH9';
  probe.userData.ueSourceSkyLight = {
    // The source component affects reflections, but P03 intentionally ports
    // only its exact native diffuse SH. No browser recapture or PMREM is
    // permitted in this checkpoint.
    contract: {
      ...source,
      affectReflection: false,
    },
    nativeIrradiance: true,
    rawSh,
    sourceAffectReflection: source.affectReflection === true,
    specularTexture: null,
  };
  probe.userData.paritySkyLight = {
    clamp: 'max(0, GetSkySHDiffuse(normal))',
    sourceArtifact: source.sourceArtifact,
    sourceArtifactSha256: source.sourceArtifactSha256,
    sourceColorSrgb8: [...source.colorSrgb8],
    sourceIntensity: source.intensity,
    tintLinear: tintLinear.toArray(),
  };
  return probe;
}

function createIndirectLight(contract) {
  return usesUeNativeDiffuseSky(contract)
    ? createNativeDiffuseSkyLight(contract)
    : createShadowFill(contract);
}

function installVisualTargetHeightFog(scene, contract) {
  const source = contract.sky?.heightFog;
  if (!source?.enabled) return null;
  if (source.volumetricFog !== false) {
    throw new Error('The P13 Visual Target requires non-volumetric exponential height fog.');
  }

  // Literal HeightFogCommon.ush line integral. UE serializes density and
  // height falloff scaled by 1000 and evaluates the ray in centimeters.
  // ToonLab's parity scene is in meters, so the unit boundary is explicit.
  const fogDensityPerCm = Math.max(0, Number(source.density) / 1000);
  const heightFalloffPerCm = Math.max(0, Number(source.heightFalloff) / 1000);
  const startDistanceMeters = Math.max(0, Number(source.startDistance) / 100);
  const fogHeightCm = Number(source.heightCentimeters) || 0;
  const cameraToReceiver = positionWorld.sub(cameraPosition);
  const cameraToReceiverMeters = max(cameraToReceiver.length(), 0.000001);
  const exclusionAlpha = clamp(
    float(startDistanceMeters).div(cameraToReceiverMeters),
    0,
    1,
  );
  const rayLengthCm = max(cameraToReceiverMeters.sub(startDistanceMeters), 0).mul(100);
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
  const falloff = max(float(heightFalloffPerCm).mul(rayDirectionHeightCm), -127);
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
  const maxOpacity = Math.min(Math.max(Number(source.maxOpacity) || 0, 0), 1);
  scene.fog = null;
  scene.fogNode = fog(
    vec3(...source.inscatteringColorLinear.slice(0, 3)),
    clamp(fogFactor, 0, maxOpacity),
  );
  return {
    algorithm: 'UE 5.8 HeightFogCommon.ush analytic line integral',
    density: Number(source.density),
    densityPerCentimeter: fogDensityPerCm,
    heightFalloff: Number(source.heightFalloff),
    heightFalloffPerCentimeter: heightFalloffPerCm,
    inscatteringColorLinear: [...source.inscatteringColorLinear],
    maxOpacity,
    startDistanceMeters,
  };
}

async function createVisibleSky(contract) {
  const source = contract.sky;
  if (!source?.visible) return null;
  const backgroundCloudsEnabled = query.has('debugBackgroundClouds')
    ? query.get('debugBackgroundClouds') !== '0'
    : source.backgroundClouds;
  const cloudShellEnabled = query.has('debugCloudShell')
    ? query.get('debugCloudShell') !== '0'
    : source.cloudShell;
  if (source.mode !== UE_CLASSIC_DAY_SKY_MODE) {
    throw new RangeError(`Unsupported parity sky mode: ${source.mode}`);
  }
  if (source.atlasFormat !== 'RGBA16F linear OpenEXR exported by UE 5.8 TextureExporterEXR') {
    throw new Error('The bare sky requires the native Unreal RGBA16F atlas export.');
  }
  if (source.curveRow !== 0 || source.atlasWidth !== 256 || source.atlasHeight !== 40) {
    throw new Error('The Visual Target Classic Day atlas layout changed.');
  }

  const [
    gltf,
    atlas,
    backgroundCloudMap,
    cloudShellGltf,
    cloudShellMap,
    cloudShellAtlas,
    cloudDitherNoise,
  ] = await Promise.all([
    new GLTFLoader().loadAsync(source.mesh),
    new EXRLoader().loadAsync(source.atlas),
    backgroundCloudsEnabled
      ? new THREE.TextureLoader().loadAsync(source.backgroundCloudTexture)
      : Promise.resolve(null),
    cloudShellEnabled
      ? new GLTFLoader().loadAsync(source.cloudShellMesh)
      : Promise.resolve(null),
    cloudShellEnabled
      ? new THREE.TextureLoader().loadAsync(source.cloudShellTexture)
      : Promise.resolve(null),
    cloudShellEnabled
      ? new EXRLoader().loadAsync(source.cloudShellAtlas)
      : Promise.resolve(null),
    cloudShellEnabled
      ? loadUeSourceTemporalDitherNoiseTexture()
      : Promise.resolve(null),
  ]);
  atlas.name = 'UE Visual Target Atlas_Sky RGBA16F';
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.flipY = false;
  atlas.wrapS = THREE.ClampToEdgeWrapping;
  atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
  if (backgroundCloudMap) {
    if (
      source.backgroundCloudStrength !== 0.30000001192092896
      || source.backgroundCloudVerticalOffset !== 0
      || source.backgroundCloudVerticalStretch !== 1
    ) {
      throw new Error('The authored MI_StylizedSky_Lite cloud parameters changed.');
    }
    backgroundCloudMap.name = 'UE T_BackroundClouds1A 8192x4096';
    backgroundCloudMap.colorSpace = THREE.SRGBColorSpace;
    backgroundCloudMap.flipY = query.has('debugBackgroundTextureFlipY')
      ? query.get('debugBackgroundTextureFlipY') !== '0'
      : false;
    backgroundCloudMap.wrapS = THREE.RepeatWrapping;
    backgroundCloudMap.wrapT = THREE.RepeatWrapping;
    backgroundCloudMap.minFilter = THREE.LinearMipmapLinearFilter;
    backgroundCloudMap.magFilter = THREE.LinearFilter;
    backgroundCloudMap.anisotropy = 8;
    backgroundCloudMap.needsUpdate = true;
  }
  if (cloudShellEnabled) {
    if (
      source.cloudShellAtlasFormat !== 'RGBA16F linear CurveLinearColorAtlas source'
      || source.cloudShellAtlasWidth !== 256
      || source.cloudShellAtlasHeight !== 26
      || source.cloudShellCurveRow !== 0
      || source.cloudShellStrength !== 2
      || source.cloudShellRotationSpeed !== -0.0005000000237487257
      || source.cloudShellDeterministicTime !== 0
      || source.cloudShellVerticalOffset !== -0.07199999690055847
      || source.cloudShellVerticalStretch !== 0.42399999499320984
      || source.cloudShellAlphaClip !== 1 / 3
    ) {
      throw new Error('The authored MI_StylizedClouds_Lite contract changed.');
    }
    cloudShellMap.name = 'UE T_CloudLayer03 8192x1024';
    cloudShellMap.colorSpace = THREE.SRGBColorSpace;
    cloudShellMap.flipY = query.has('debugCloudTextureFlipY')
      ? query.get('debugCloudTextureFlipY') !== '0'
      : false;
    cloudShellMap.wrapS = THREE.RepeatWrapping;
    cloudShellMap.wrapT = THREE.ClampToEdgeWrapping;
    cloudShellMap.minFilter = THREE.LinearMipmapLinearFilter;
    cloudShellMap.magFilter = THREE.LinearFilter;
    cloudShellMap.anisotropy = 8;
    cloudShellMap.needsUpdate = true;
    cloudShellAtlas.name = 'UE Atlas_Clouds RGBA16F';
    cloudShellAtlas.colorSpace = THREE.NoColorSpace;
    cloudShellAtlas.flipY = false;
    cloudShellAtlas.wrapS = THREE.ClampToEdgeWrapping;
    cloudShellAtlas.wrapT = THREE.ClampToEdgeWrapping;
    cloudShellAtlas.minFilter = THREE.LinearFilter;
    cloudShellAtlas.magFilter = THREE.LinearFilter;
    cloudShellAtlas.generateMipmaps = false;
    cloudShellAtlas.needsUpdate = true;
  }

  const curveTime = clamp(float(1).sub(uv().y), 0, 1);
  const sampleU = curveTime
    .mul(source.atlasWidth - 1)
    .add(0.5)
    .div(source.atlasWidth);
  const sourceSampleV = (source.curveRow + 0.5) / source.atlasHeight;
  const exrStorageRow = source.atlasHeight - 1 - source.curveRow;
  if (
    source.toonlabExrStorageRow !== exrStorageRow
    || source.toonlabExrSampleV !== '1 - ((curveRow + 0.5) / height)'
  ) {
    throw new Error('The Visual Target EXR row-origin adapter changed.');
  }
  // UE samples CurveLinearColorAtlas row zero at V=0. TextureExporterEXR
  // writes scanlines top-down, while Three's unflipped data texture preserves
  // that storage order. Reflect only the atlas-row coordinate; the curve's U
  // coordinate remains the authored `1 - uv0.y` mapping.
  const sampleV = float(1 - sourceSampleV);
  const material = new MeshBasicNodeMaterial();
  material.name = backgroundCloudsEnabled
    ? 'Visual Target MI_StylizedSky_Lite — Classic Day + exact background clouds'
    : 'Visual Target MI_StylizedSky_Lite — Classic Day, no clouds';
  material.side = THREE.FrontSide;
  // Sky and its authored cloud texture are an infinitely distant background.
  // Keep depth testing so an opaque sky draw can never cover previously
  // rendered world geometry, but never write dome depth into the world buffer.
  material.depthTest = true;
  material.depthWrite = false;
  material.fog = true;
  const skyGradient = texture(atlas)
    .sample(vec2(sampleU, sampleV))
    .rgb
    .mul(source.brightness * timeOfDayPreset.skyEnergy)
    .mul(vec3(...timeOfDayPreset.skyTint));
  if (backgroundCloudMap) {
    const cloudUv = uv()
      .sub(vec2(0.5, 0.5))
      .div(vec2(1, source.backgroundCloudVerticalStretch))
      .add(vec2(0.5, 0.5))
      .add(vec2(0, source.backgroundCloudVerticalOffset));
    // T_BackroundClouds1A is an authored single-channel texture. Unreal's
    // texture sample promotes R across RGB for this graph; WebGPU R8 sampling
    // does not provide that graph-level promotion for us, so do it explicitly.
    const cloudMask = texture(backgroundCloudMap)
      .sample(cloudUv)
      .r;
    const cloud = vec3(cloudMask)
      .mul(vec3(...source.backgroundCloudTint.slice(0, 3)))
      .mul(vec3(...timeOfDayPreset.skyTint))
      .mul(timeOfDayPreset.skyEnergy);
    const screened = vec3(1).sub(
      vec3(1).sub(cloud).mul(vec3(1).sub(skyGradient)),
    );
    material.colorNode = mix(
      skyGradient,
      screened,
      source.backgroundCloudStrength,
    );
  } else {
    material.colorNode = skyGradient;
  }
  material.userData.parityVisibleSky = {
    atlas: source.atlas,
    atlasSha256: source.atlasSha256,
    backgroundClouds: backgroundCloudsEnabled,
    backgroundCloudTexture: source.backgroundCloudTexture ?? null,
    backgroundCloudTextureSha256: source.backgroundCloudTextureSha256 ?? null,
    backgroundCloudStrength: source.backgroundCloudStrength ?? 0,
    brightness: source.brightness,
    cloudShell: false,
    curve: source.curve,
    curveRow: source.curveRow,
    exrRowOriginAdapter: source.toonlabExrRowOriginAdapter,
    exrSampleV: source.toonlabExrSampleV,
    exrStorageRow,
    saturation: source.saturation,
    sourceMaterial: source.material,
  };

  const skyRoot = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(skyRoot);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  if (!(sphere.radius > 0)) throw new Error('The Visual Target source sky dome has no bounds.');
  const skySourceScale = source.skySourceComponentScale?.[0]
    ?? source.sourceScale?.[0]
    ?? 100;
  const skyUnitsToMeters = source.skySourceUnitsToMeters ?? 0.01;
  const scale = skySourceScale * skyUnitsToMeters;
  const targetRadius = sphere.radius * scale;
  const cameraFar = source.toonlabCameraFarMeters ?? contract.camera.far;
  if (!(targetRadius < cameraFar)) {
    throw new Error(
      `The author-scale sky dome radius (${targetRadius}) is clipped by the `
      + `ToonLab finite far plane (${cameraFar}).`,
    );
  }
  skyRoot.scale.multiplyScalar(scale);
  skyRoot.name = 'Visual Target Classic Day sky';
  skyRoot.userData.parityVisibleSky = {
    adapter: 'authored UE component scale with centimeters converted to meters',
    sourceRadius: sphere.radius,
    targetRadius,
    uniformScale: scale,
    cameraFar,
    radiusToFarRatio: targetRadius / cameraFar,
  };
  skyRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.material?.dispose?.();
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    object.renderOrder = -1000;
  });
  const root = new THREE.Group();
  root.name = cloudShellEnabled
    ? 'Visual Target Classic Day sky + exact cloud shell'
    : 'Visual Target Classic Day sky';
  root.position.set(0, 0, 0);
  root.rotation.y = THREE.MathUtils.degToRad(
    source.toonlabUeGltfBasisYawDegrees ?? 0,
  );
  root.userData.parityVisibleSky = {
    adapter: source.toonlabUeGltfBasisAdapter ?? 'identity basis',
    yawDegrees: source.toonlabUeGltfBasisYawDegrees ?? 0,
  };
  root.add(skyRoot);

  let cloudMaterial = null;
  if (cloudShellEnabled) {
    const debugCloudUOffset = Number(query.get('debugCloudUOffset') ?? 0) || 0;
    const debugCloudVerticalOffset = query.has('debugCloudVerticalOffset')
      ? Number(query.get('debugCloudVerticalOffset'))
      : source.cloudShellVerticalOffset;
    const debugCloudVerticalStretch = query.has('debugCloudVerticalStretch')
      ? Number(query.get('debugCloudVerticalStretch'))
      : source.cloudShellVerticalStretch;
    const centeredUv = uv()
      .add(vec2(
        source.cloudShellRotationSpeed * source.cloudShellDeterministicTime
          + debugCloudUOffset,
        debugCloudVerticalOffset,
      ))
      .sub(vec2(0.5, 0.5))
      .div(vec2(1, debugCloudVerticalStretch))
      .add(vec2(0.5, 0.5));
    const cloudSample = texture(cloudShellMap).sample(centeredUv);
    const cloudCurveU = cloudSample.r
      .mul(source.cloudShellAtlasWidth - 1)
      .add(0.5)
      .div(source.cloudShellAtlasWidth);
    const cloudCurveSourceV = (source.cloudShellCurveRow + 0.5)
      / source.cloudShellAtlasHeight;
    const cloudCurveV = float(1 - cloudCurveSourceV);
    const cloudColor = texture(cloudShellAtlas)
      .sample(vec2(cloudCurveU, cloudCurveV))
      .rgb
      .mul(source.cloudShellStrength * timeOfDayPreset.skyEnergy)
      .mul(vec3(...timeOfDayPreset.skyTint));
    cloudMaterial = new MeshBasicNodeMaterial();
    cloudMaterial.name = 'Visual Target MI_StylizedClouds_Lite — Classic Day';
    cloudMaterial.colorNode = cloudColor;
    const literalSingleFrameDither = query.get('debugCloudCoverage') === 'dither';
    if (literalSingleFrameDither) {
      const temporalState = {
        uniforms: { temporalSampleIndex: float(source.cloudShellDeterministicTime) },
        temporal: { ditherNoiseTexture: cloudDitherNoise },
      };
      cloudMaterial.opacityNode = ueSourceDitherTemporalAA(cloudSample.a, temporalState);
      cloudMaterial.alphaTestNode = float(source.cloudShellAlphaClip);
    } else {
      // The retained UE viewport is captured after 180 TAA warm-up frames.
      // Its temporally resolved expected coverage is the source alpha itself;
      // displaying one thresholded dither frame falsely shrinks and hardens the
      // cloud silhouette in a static browser comparison.
      cloudMaterial.opacityNode = cloudSample.a;
      cloudMaterial.alphaTestNode = float(0);
    }
    cloudMaterial.transparent = !literalSingleFrameDither;
    cloudMaterial.alphaToCoverage = false;
    cloudMaterial.depthTest = true;
    cloudMaterial.depthWrite = false;
    cloudMaterial.side = THREE.FrontSide;
    cloudMaterial.fog = true;
    cloudMaterial.userData.parityCloudShell = {
      atlas: source.cloudShellAtlas,
      atlasSha256: source.cloudShellAtlasSha256,
      curve: source.cloudShellCurve,
      curveRow: source.cloudShellCurveRow,
      deterministicTime: source.cloudShellDeterministicTime,
      ditherNoise: source.cloudShellDitherNoiseTexture,
      ditherNoiseSha256: source.cloudShellDitherNoiseTextureSha256,
      material: source.cloudShellMaterial,
      opacityAdapter: source.cloudShellOpacity,
      resolvedCoverageAdapter: literalSingleFrameDither
        ? 'literal deterministic source dither frame'
        : 'analytic 180-frame TAA expected coverage',
      sourceMesh: source.cloudShellSourceMesh,
      strength: source.cloudShellStrength,
      texture: source.cloudShellTexture,
      textureSha256: source.cloudShellTextureSha256,
      verticalOffset: source.cloudShellVerticalOffset,
      verticalStretch: source.cloudShellVerticalStretch,
      debugUvAdapter: {
        uOffset: debugCloudUOffset,
        verticalOffset: debugCloudVerticalOffset,
        verticalStretch: debugCloudVerticalStretch,
      },
    };

    const cloudRoot = cloudShellGltf.scene;
    const cloudBounds = new THREE.Box3().setFromObject(cloudRoot);
    const cloudSphere = cloudBounds.getBoundingSphere(new THREE.Sphere());
    if (!(cloudSphere.radius > 0)) throw new Error('The Visual Target cloud shell has no bounds.');
    const cloudSourceScale = source.cloudShellSourceComponentScale?.[0] ?? 1;
    const cloudUnitsToMeters = source.cloudShellGltfUnitsToMeters ?? 1;
    const cloudScale = cloudSourceScale * cloudUnitsToMeters;
    const cloudTargetRadius = cloudSphere.radius * cloudScale;
    if (!(cloudTargetRadius < cameraFar)) {
      throw new Error(
        `The author-scale cloud-shell radius (${cloudTargetRadius}) is clipped by `
        + `the ToonLab finite far plane (${cameraFar}).`,
      );
    }
    cloudRoot.scale.multiplyScalar(cloudScale);
    if (query.get('debugCloudMirrorX') === '1') {
      cloudRoot.scale.x *= -1;
    }
    if (query.has('debugCloudYawDegrees')) {
      cloudRoot.rotation.y += THREE.MathUtils.degToRad(
        Number(query.get('debugCloudYawDegrees')) || 0,
      );
    }
    cloudRoot.name = 'Visual Target SM_StylizedSkyDome_Clouds';
    cloudRoot.userData.parityCloudShell = {
      adapter: source.cloudShellGltfUnitAdapter
        ?? 'UE glTF export is already in meters',
      sourceRadius: cloudSphere.radius,
      targetRadius: cloudTargetRadius,
      uniformScale: cloudScale,
      cameraFar,
      radiusToFarRatio: cloudTargetRadius / cameraFar,
    };
    cloudRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.material?.dispose?.();
      object.material = cloudMaterial;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;
      object.renderOrder = -999;
    });
    root.add(cloudRoot);
  }
  material.userData.parityVisibleSky.cloudShell = cloudShellEnabled;
  root.updateMatrixWorld(true);
  return { atlas, cloudMaterial, material, root };
}

function projectUnityProbes(camera, unityReport) {
  if (!unityReport?.cameraProjectionProbes) return [];
  return unityReport.cameraProjectionProbes.map((source) => {
    const projected = new THREE.Vector3(
      ...convertUnityPosition(source.worldPosition),
    ).project(camera);
    const actual = [projected.x, projected.y];
    return {
      actual,
      error: vectorMaximumError(actual, source.ndc),
      expected: [...source.ndc],
      name: source.name,
    };
  });
}

function buildReport({
  camera,
  contract,
  indirectLight,
  light,
  ray,
  rockRoot,
  unityReport,
  visibleSky,
  visualTargetHeightFog,
}) {
  const expectedRockPosition = convertUnityPosition(contract.rock.transform.position);
  const expectedRockQuaternion = convertUnityQuaternion(
    contract.rock.transform.rotationQuaternion,
  );
  const transformErrors = {
    position: vectorMaximumError(rockRoot.position.toArray(), expectedRockPosition),
    quaternion: vectorMaximumError(rockRoot.quaternion.toArray(), expectedRockQuaternion),
    scale: vectorMaximumError(rockRoot.scale.toArray(), contract.rock.transform.scale),
  };
  const projectionProbes = projectUnityProbes(camera, unityReport);
  const cameraProjectionMaximumNdcError = projectionProbes.length > 0
    ? maximum(projectionProbes.map((probe) => probe.error))
    : null;
  const actualRay = light.target.position.clone().sub(light.position).normalize();
  const setup = {
    cameraProjectionMaximumNdcError,
    lightRayMaximumError: vectorMaximumError(actualRay.toArray(), ray.toArray()),
    rockTransformMaximumWorldError: maximum(Object.values(transformErrors)),
  };
  const tolerance = contract.acceptance;
  const cameraProjectionRequired = rockView === 'front'
    && selectedTestRock.id === 'contract';
  const cameraProjectionPass = !cameraProjectionRequired
    || (Number.isFinite(setup.cameraProjectionMaximumNdcError)
      && setup.cameraProjectionMaximumNdcError
        <= tolerance.cameraProjectionMaximumNdcError);
  const setupPass = cameraProjectionPass
    && setup.rockTransformMaximumWorldError
      <= tolerance.transformMaximumWorldErrorMeters
    && setup.lightRayMaximumError <= 1e-12;
  const inputAdapter = lightingInputAdapter(contract);
  const hasConstantAmbient = indirectLight.isAmbientLight === true
    && indirectLight.intensity > 0;
  const hasNativeDiffuseSky = indirectLight.isLightProbe === true
    && usesUeNativeDiffuseSky(contract);
  const ambientFill = indirectLight.isAmbientLight === true
    ? {
        contractColorSrgb: [...contract.render.ambientColor],
        contractIntensity: contract.render.ambientIntensity,
        rendererColorLinear: indirectLight.color.toArray(),
        rendererIrradianceScale: indirectLight.intensity,
      }
    : null;
  const skyLightDiffuse = hasNativeDiffuseSky
    ? {
        enabled: true,
        mode: contract.skyLight.mode,
        sourceArtifact: contract.skyLight.sourceArtifact,
        sourceArtifactSha256: contract.skyLight.sourceArtifactSha256,
        sourceApi: contract.skyLight.sourceApi,
        coefficientCount: contract.skyLight.threeCoefficients.length,
        rawThreeCoefficients: contract.skyLight.threeCoefficients.map(
          (coefficient) => [...coefficient],
        ),
        rendererTintedCoefficients: indirectLight.sh.coefficients.map(
          (coefficient) => coefficient.toArray(),
        ),
        tintColorSrgb8: [...contract.skyLight.colorSrgb8],
        rendererTintLinear: [...indirectLight.userData.paritySkyLight.tintLinear],
        intensity: indirectLight.intensity,
        nonnegativeDiffuseClamp: true,
        lowerHemisphereIsBlack: contract.skyLight.lowerHemisphereIsBlack,
        sourceAffectGlobalIllumination: contract.skyLight.affectGlobalIllumination,
        sourceAffectReflection: contract.skyLight.affectReflection,
        runtimeDiffuseEnabled: true,
        runtimeSpecularEnabled: false,
        browserRecapture: false,
        pmrem: false,
      }
    : null;
  const skyBackground = visibleSky
    ? {
        enabled: true,
        mode: contract.sky.mode,
        sourceMesh: contract.sky.sourceMesh,
        sourceMaterial: contract.sky.material,
        atlas: contract.sky.atlas,
        atlasSha256: contract.sky.atlasSha256,
        atlasDimensions: [contract.sky.atlasWidth, contract.sky.atlasHeight],
        curve: contract.sky.curve,
        curveRow: contract.sky.curveRow,
        curveTime: contract.sky.curveTime,
        exrRowOriginAdapter: contract.sky.toonlabExrRowOriginAdapter,
        exrSampleV: contract.sky.toonlabExrSampleV,
        exrStorageRow: contract.sky.toonlabExrStorageRow,
        brightness: contract.sky.brightness,
        saturation: contract.sky.saturation,
        backgroundClouds: Boolean(
          visibleSky.material.userData.parityVisibleSky.backgroundClouds,
        ),
        cloudShell: Boolean(
          visibleSky.material.userData.parityVisibleSky.cloudShell,
        ),
        illuminationRecaptured: false,
        finiteFarAdapter: { ...visibleSky.root.userData.parityVisibleSky },
      }
    : null;

  return {
    schema: 'toonlab.tri-engine-parity-runtime-report',
    version: 1,
    checkpoint: contract.checkpoint,
    profileId: contract.profileId,
    engine: {
      name: 'ToonLab',
      renderer: 'Three.js WebGPURenderer',
    },
    mode: shadowMode,
    rockView,
    sourceScene: SCENE_URL,
    sourceMaterialRecord: contract.rock.toonlab.materialRecord,
    sourceMaterialGraph:
      contract.engineAdapters?.toonlab?.surfaceMaterialGraph ?? 'unity-s-rock',
    rockAttributeSource:
      rockRoot.userData.parityRockAttributeSource
      ?? { geometry: SCENE_URL, mode: 'unity-scene-gltf' },
    directSun: {
      contractIntensity: contract.sun.intensity,
      rendererIntensity: light.intensity,
      inputAdapter,
      rendererBoundary: inputAdapter === UE_CAPTURED_SCENE_INPUT_ADAPTER
        ? 'raw UE source radiometry'
        : 'Unity-stage radiance multiplied by PI',
    },
    displayTransfer: usesUeSourceDisplayTransfer(contract)
      ? {
          enabled: true,
          mode: contract.post.mode,
          fixedExposure: { ...contract.post.fixedExposure },
          outputTransfer: { ...contract.post.outputTransfer },
          sourceSettings: { ...contract.post.postProcessSettings },
          adapter: 'src/environment/ueSourceTonemapping.js',
        }
      : { enabled: false },
    ambientFill,
    skyLightDiffuse,
    skyBackground,
    heightFog: visualTargetHeightFog,
    disabledSystems: {
      ambient: !hasConstantAmbient,
      ambientOcclusion: true,
      bloom: true,
      colorGrading: !usesUeSourceDisplayTransfer(contract),
      environmentReflections: true,
      fog: !visualTargetHeightFog?.enabled,
      globalIllumination: !(
        hasNativeDiffuseSky && contract.skyLight.affectGlobalIllumination === true
      ),
      localBounce: true,
      pmrem: true,
      postProcessing: !usesUeSourceDisplayTransfer(contract),
      skyLight: !(hasConstantAmbient || hasNativeDiffuseSky),
      skyLightSpecular: true,
      sky: !visibleSky,
      temporalAA: true,
      vignette: true,
      wind: true,
    },
    setup,
    setupPass,
    cameraProjectionRequired,
    transformErrors,
    projectionProbes,
    shadowParity: shadowMode === 'off'
      ? { pass: null, state: 'requires image probe' }
      : {
          pass: null,
          state: 'provisional Three hard-map bridge; Unity matrix-driven CSM is the next renderer gate',
        },
  };
}

async function imageExists(url) {
  const response = await fetch(url, { cache: 'no-store' });
  return response.ok && /^image\//.test(response.headers.get('content-type') || '');
}

async function optionalJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) return null;
  return response.json();
}

async function start() {
  const registry = await fetch(PROFILE_REGISTRY_URL, { cache: 'no-store' })
    .then((response) => response.json());
  const { activeLightVariant, lightMode, profile } = resolveSharedLightSelection(registry, {
    requestedLightMode,
    requestedProfileId,
  });
  if (!profile) throw new Error('The parity profile registry has no default profile.');
  const profileRoot = `${IMAGE_ROOT}/${profile.path}`;
  const contractRoot = `${IMAGE_ROOT}/${profile.contractPath ?? profile.path}`;
  const [
    inheritedContract,
    unityReport,
    measurement,
    minimalEnvironmentContract,
    ueVisualTargetConfiguration,
    ueVisualTargetReport,
  ] = await Promise.all([
    fetch(`${contractRoot}/contract.json`, { cache: 'no-store' })
      .then((response) => response.json()),
    optionalJson(`${contractRoot}/unity-report.json`),
    optionalJson(`${contractRoot}/measurement.json`),
    optionalJson(`${MINIMAL_ENVIRONMENT_CAPTURE_ROOT}/contract.json`),
    optionalJson(UE_VISUAL_TARGET_CONFIGURATION_URL),
    optionalJson(`${UE_VISUAL_TARGET_ROOT}/report.json`),
  ]);
  if (profile.contractSourceProfileId
    && inheritedContract.profileId !== profile.contractSourceProfileId) {
    throw new Error(
      `Inherited profile contract mismatch: ${profile.contractSourceProfileId} vs ${
        inheritedContract.profileId
      }`,
    );
  }
  if (!profile.contractSourceProfileId && inheritedContract.profileId !== profile.id) {
    throw new Error(
      `Profile registry/contract mismatch: ${profile.id} vs ${inheritedContract.profileId}`,
    );
  }
  const contract = profile.contractSourceProfileId
    ? {
        ...inheritedContract,
        checkpoint: profile.checkpoint ?? inheritedContract.checkpoint,
        inheritedProfileId: inheritedContract.profileId,
        materialCheckpoint: profile.materialCheckpoint ?? null,
        profileId: profile.id,
      }
    : inheritedContract;
  const normalizedRockView = normalizeRockView(
    contract.profileId,
    contentMode,
    rockView,
  );
  if (normalizedRockView !== rockView) {
    rockView = normalizedRockView;
    const normalizedUrl = new URL(location.href);
    writeRockViewToUrl(normalizedUrl, rockView);
    history.replaceState(null, '', normalizedUrl);
  }
  const p18BenchCaptureView = contentMode === 'environment'
    && contract.profileId === 'p18-visual-target-stylized-basic'
    ? minimalEnvironmentContract?.capture?.views?.bench ?? null
    : null;
  updateLinks(profile.id, activeLightVariant?.id);
  installProfilePicker(registry, profile.id);
  installSharedLightPicker(registry, lightMode);
  installTimeOfDayPicker();
  installContentPicker(contract.profileId);
  installRockViewPicker(contract.profileId);
  installTestRockPicker();
  if (contract.schema !== 'toonlab.tri-engine-parity-contract') {
    throw new Error(`Unexpected contract schema: ${contract.schema}`);
  }
  if (unityReport && unityReport.checkpoint !== inheritedContract.checkpoint) {
    throw new Error('Unity report and inherited shared contract checkpoints do not match.');
  }

  element('profile-id').textContent = profile.id;
  element('page-title').textContent = contentMode === 'environment'
    ? 'Minimal environment parity + Visual Target'
    : 'Single-rock parity + Visual Target';
  element('checkpoint').textContent = contract.checkpoint;
  element('shadow-mode').textContent = shadowMode === 'hard'
    ? `CAST + SELF SHADOW · ${rockView}`
    : `UNSHADOWED DIAGNOSTIC · ${rockView}`;
  element('time-of-day').textContent = timeOfDayPreset.label;
  element('test-rock-id').textContent = selectedTestRock.assetName;
  element('shadow-state-note').textContent = shadowMode === 'hard'
    ? 'Cast + self-shadow raster active'
    : 'Diagnostic: all cast shadows disabled';
  const assetRevision = query.get('rev') || profile.id;
  const viewSuffix = captureViewSuffix();
  const usesContractRock = selectedTestRock.id === 'contract' && contentMode === 'rock';
  const hasNativeTimeCapture = timeOfDay === 'day';
  const usesP13EnvironmentAuthority = contract.profileId === 'p13-ue-authored-background-clouds'
    || contract.inheritedProfileId === 'p13-ue-authored-background-clouds';
  const usesP18NativeUnrealCapture = contentMode === 'environment'
    && selectedTestRock.id === 'spire-05'
    && contract.profileId === 'p18-visual-target-stylized-basic'
    && lightMode === 'author'
    && shadowMode === 'hard'
    && timeOfDay === 'day';
  const usesP19NatureProfile = contentMode === 'environment'
    && contract.profileId === 'p19-visual-target-mountain-cliff';
  const usesP19NativeUnrealCapture = usesP19NatureProfile
    && selectedTestRock.id === 'spire-05'
    && lightMode === 'author'
    && shadowMode === 'hard'
    && timeOfDay === 'day';
  const usesLegacyMinimalEnvironmentCapture = contentMode === 'environment'
    && selectedTestRock.id === 'spire-05'
    && usesP13EnvironmentAuthority
    && contract.profileId !== 'p18-visual-target-stylized-basic'
    && !usesP19NatureProfile
    && lightMode === 'author'
    && shadowMode === 'hard'
    && timeOfDay === 'day';
  const usesMinimalEnvironmentCapture = usesLegacyMinimalEnvironmentCapture
    || usesP18NativeUnrealCapture
    || usesP19NativeUnrealCapture;
  // P17 changes only the flower material adapter. Population remains the
  // immutable one-clump fixture already captured by native Unity and Unreal.
  // P18 has its own native Unreal Front/Back/Bench capture set because its
  // M_StylizedBasic prop family is new scene content. Unity remains
  // intentionally non-blocking until equivalent native frames exist.
  const environmentCaptureRoot = MINIMAL_ENVIRONMENT_CAPTURE_ROOT;
  // Native environment captures are promoted in place. Keep their browser
  // cache identity separate from the user-supplied experiment revision so a
  // corrected native frame cannot be hidden behind an older cached PNG.
  const captureRevision = usesP18NativeUnrealCapture
    ? 'p18-native-unreal-generic-materials-1'
    : usesP19NativeUnrealCapture
    ? 'p19-native-unreal-mountain-cliff-2'
    : usesLegacyMinimalEnvironmentCapture
    ? 'demo-derived-environment-5-ue-camera-orbit-corrected'
    : assetRevision;
  const environmentView = rockView;
  const p18CameraRenderIndex = environmentView === 'back'
    ? 2
    : environmentView === 'bench'
      ? 3
      : 1;
  const p19CameraRenderIndex = {
    front: 1,
    back: 2,
    mountain: 3,
    'mountain-surface': 4,
    cliff: 5,
  }[environmentView] ?? 1;
  const unityUrl = usesLegacyMinimalEnvironmentCapture
    ? `${environmentCaptureRoot}/unity-${environmentView}.png?rev=${encodeURIComponent(captureRevision)}`
    : `${profileRoot}/unity-shadow-${shadowMode}${viewSuffix}.png?rev=${encodeURIComponent(captureRevision)}`;
  if (hasNativeTimeCapture
    && (usesContractRock || usesLegacyMinimalEnvironmentCapture)
    && await imageExists(unityUrl)) {
    element('unity-frame').src = unityUrl;
    element('unity-placeholder').hidden = true;
    element('unity-state').textContent = usesLegacyMinimalEnvironmentCapture
      ? `native source content · ${environmentView}`
      : usesRawUntonedVisualTargetRadiometry(contract)
      ? 'native capture · raw 8.0, tone transfer disabled'
      : 'native capture';
  } else {
    const unityPendingLabel = usesP19NatureProfile
      ? `P19 native Unity ${rockView} capture pending`
      : timeOfDay !== 'day'
      ? `${timeOfDayPreset.label} · native ${rockView} capture pending`
      : usesContractRock
        ? `${timeOfDayPreset.label} · native ${rockView} capture pending`
        : `native ${selectedTestRock.assetName} capture pending`;
    setPendingCapture(
      'unity-frame',
      'unity-placeholder',
      'unity-state',
      unityPendingLabel,
    );
  }
  const unrealUrl = usesP19NativeUnrealCapture
    ? `${P19_UNREAL_CAPTURE_ROOT}/CameraRender${p19CameraRenderIndex}.png?rev=${encodeURIComponent(captureRevision)}`
    : usesP18NativeUnrealCapture
    ? `${environmentCaptureRoot}/CameraRender${p18CameraRenderIndex}.png?rev=${encodeURIComponent(captureRevision)}`
    : usesLegacyMinimalEnvironmentCapture
    ? `${environmentCaptureRoot}/unreal-${environmentView}.png?rev=${encodeURIComponent(captureRevision)}`
    : `${profileRoot}/unreal/unreal-shadow-${shadowMode}${viewSuffix}.png?rev=${encodeURIComponent(captureRevision)}`;
  if (hasNativeTimeCapture
    && (usesContractRock || usesMinimalEnvironmentCapture)
    && await imageExists(unrealUrl)) {
    element('unreal-frame').src = unrealUrl;
    element('unreal-placeholder').hidden = true;
    element('unreal-state').textContent = usesP19NativeUnrealCapture
      ? `native P19 · UE comparison authority · ${environmentView}`
      : usesP18NativeUnrealCapture
      ? `native P18 · exact M_StylizedBasic props · ${environmentView}`
      : usesLegacyMinimalEnvironmentCapture
      ? `native retained-authority track · ${environmentView}`
      : usesP13EnvironmentAuthority
      ? 'native capture · geometry/material reference'
      : contract.engineAdapters?.unreal?.mode
      === 'retained-visual-target-authority'
      ? 'native Visual Target authority'
      : 'native capture';
  } else {
    const unrealPendingLabel = usesP19NatureProfile
      ? `P19 native Unreal ${rockView} capture pending`
      : timeOfDay !== 'day'
      ? `${timeOfDayPreset.label} · native ${rockView} capture pending`
      : usesContractRock
        ? `${timeOfDayPreset.label} · native ${rockView} capture pending`
        : `native ${selectedTestRock.assetName} capture pending`;
    setPendingCapture(
      'unreal-frame',
      'unreal-placeholder',
      'unreal-state',
      unrealPendingLabel,
    );
  }
  const visualTargetUrl = usesP19NativeUnrealCapture
    ? `${P19_UNREAL_CAPTURE_ROOT}/CameraRender${p19CameraRenderIndex}.png?rev=${encodeURIComponent(captureRevision)}`
    : usesP18NativeUnrealCapture
    ? `${environmentCaptureRoot}/CameraRender${p18CameraRenderIndex}.png?rev=${encodeURIComponent(captureRevision)}`
    : usesLegacyMinimalEnvironmentCapture
    ? `${environmentCaptureRoot}/visual-target-${environmentView}.png?rev=${encodeURIComponent(captureRevision)}`
    : `${UE_VISUAL_TARGET_ROOT}/unreal-${lightMode}-light-shadow-${shadowMode}${viewSuffix}.png?rev=${encodeURIComponent(captureRevision)}`;
  if (hasNativeTimeCapture
    && (usesContractRock || usesMinimalEnvironmentCapture)
    && await imageExists(visualTargetUrl)) {
    element('visual-target-frame').src = visualTargetUrl;
    element('visual-target-placeholder').hidden = true;
    element('visual-target-state').textContent = usesP19NativeUnrealCapture
      ? `Visual Target · same native P19 UE frame · ${environmentView}`
      : usesP18NativeUnrealCapture
      ? `Visual Target · same native P18 UE authority · ${environmentView}`
      : usesLegacyMinimalEnvironmentCapture
      ? `Visual Target · same retained UE authority · ${environmentView}`
      : usesP13EnvironmentAuthority
      ? 'Visual Target · spatial reference; color under audit'
      : lightMode === 'contract'
      ? 'Visual Target · contract light'
      : 'Visual Target · author demo light';
  } else {
    const visualTargetPendingLabel = usesP19NatureProfile
      ? `P19 Visual Target ${rockView} capture pending`
      : timeOfDay !== 'day'
      ? `Visual Target ${timeOfDayPreset.label} ${rockView} capture pending`
      : usesContractRock
        ? `Visual Target ${timeOfDayPreset.label} ${rockView} capture pending`
        : `Visual Target ${selectedTestRock.assetName} capture pending`;
    setPendingCapture(
      'visual-target-frame',
      'visual-target-placeholder',
      'visual-target-state',
      visualTargetPendingLabel,
    );
  }
  const documentedSettingsPass = ueVisualTargetConfiguration
    ?.documentedProjectSettings?.every((setting) => setting.match) === true;
  const visualTargetCapturePass = hasNativeTimeCapture
    && (usesMinimalEnvironmentCapture || (usesContractRock
    && ueVisualTargetReport?.status === 'complete'
    && ueVisualTargetReport?.captures?.some((capture) => (
      capture.shadowMode === shadowMode && capture.lightMode === lightMode
      && (
        rockView === 'front'
          ? !capture.rockView || capture.rockView === 'front'
          : capture.rockView === rockView
      )
    ))));
  setGate('visual-target-config', {
    label: visualTargetCapturePass
      ? `PASS · ${lightMode} light captured`
      : documentedSettingsPass
        ? 'PASS · configured; capture pending'
        : 'FAIL · configuration mismatch',
    state: documentedSettingsPass ? (visualTargetCapturePass ? 'pass' : 'pending') : 'fail',
  });

  // Request the source-ground capacity explicitly. Passing requiredLimits
  // through WebGPURenderer is not reliable in every Chromium/WebGPU build:
  // some builds still create a compatibility device at the default limit of
  // 16 sampled textures. The retained P14 landscape graph needs 31.
  let parityGpuDevice;
  let paritySampledTextureLimit = 16;
  if (navigator.gpu) {
    const parityGpuAdapter = await navigator.gpu.requestAdapter({
      featureLevel: 'compatibility',
    });
    const adapterSampledTextureLimit = Number(
      parityGpuAdapter?.limits?.maxSampledTexturesPerShaderStage ?? 16,
    );
    paritySampledTextureLimit = Math.min(32, adapterSampledTextureLimit);
    if (parityGpuAdapter && paritySampledTextureLimit >= 31) {
      parityGpuDevice = await parityGpuAdapter.requestDevice({
        requiredFeatures: Array.from(parityGpuAdapter.features),
        requiredLimits: {
          maxSampledTexturesPerShaderStage: paritySampledTextureLimit,
        },
      });
    }
  }

  document.body.dataset.sampledTextureLimit = String(paritySampledTextureLimit);
  document.body.dataset.sourceGroundCapacity = paritySampledTextureLimit >= 31
    ? 'pass'
    : 'fail';

  const renderer = new WebGPURenderer({
    antialias: false,
    device: parityGpuDevice,
    preserveDrawingBuffer: true,
    // The retained SnowPines M_Landscape graph binds 31 sampled textures
    // (painted layers, source normals/roughness, and authored utility maps).
    // WebGPU exposes 16 by default even when the adapter supports more. Keep
    // the source graph intact for parity instead of silently deleting layers.
    requiredLimits: {
      maxSampledTexturesPerShaderStage: paritySampledTextureLimit,
    },
    reversedDepthBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(contract.render.width, contract.render.height, false);
  const useUeDisplayTransfer = usesUeSourceDisplayTransfer(contract);
  renderer.outputColorSpace = useUeDisplayTransfer
    ? THREE.LinearSRGBColorSpace
    : THREE.SRGBColorSpace;
  renderer.toneMapping = useUeDisplayTransfer
    ? UE_SOURCE_TONE_MAPPING
    : THREE.NoToneMapping;
  renderer.toneMappingExposure = useUeDisplayTransfer
    ? contract.post.fixedExposure.multiplier
    : 1;
  renderer.shadowMap.enabled = shadowMode === 'hard';
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.autoClear = true;
  await renderer.init();
  if (useUeDisplayTransfer) {
    renderer.library.addToneMapping(
      createUeSourceToneMapping(contract.post.postProcessSettings, {
        outputTransfer: UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT,
      }),
      UE_SOURCE_TONE_MAPPING,
    );
  }
  if (usesUeNativeDiffuseSky(contract)) {
    // P03 uses the exact native SH payload and UE's nonnegative diffuse
    // evaluation. This only replaces the LightProbe node for this renderer;
    // it does not capture the browser scene or create a specular PMREM.
    installUeSourceSkyLightNode(renderer);
  }
  element('toonlab-frame').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(...contract.render.clearColor.slice(0, 3));
  scene.environment = null;
  scene.environmentIntensity = 0;
  scene.fog = null;
  const visualTargetHeightFog = installVisualTargetHeightFog(scene, contract);

  const camera = new THREE.PerspectiveCamera();
  camera.name = 'Contract camera';
  applyExactCamera(camera, contract, p18BenchCaptureView);

  const authoredRockBake = contract.engineAdapters?.toonlab?.surfaceMaterialGraph
    === 'ue-authored-glb-bake-4096';
  const usesSourceTestRock = selectedTestRock.id !== 'contract';
  const selectedAuthoredRockUrl = selectedTestRock.id === 'contract'
    ? contract.rock.toonlab.authored
    : null;
  const selectedLod0RockUrl = selectedTestRock.id === 'contract'
    ? contract.rock.toonlab.lod0
    : `/assets-local/rock-references/${selectedTestRock.assetName}/lod0.glb`;
  const ray = timeOfDayLightRay(lightRayDirection(contract));
  const sharedSourceEnvironmentState = createSharedSourceEnvironmentState(ray);
  const [
    sourceGltf,
    sourceRockGltf,
    fallbackRockMaterial,
    sourceTestRockMaterial,
    sourceStylizedNormal,
    visibleSky,
    sourceEnvironmentContent,
  ] = await Promise.all([
    new GLTFLoader().loadAsync(SCENE_URL),
    usesSourceTestRock || ['ue-static-mesh-gltf', 'ue-authored-glb-bake-4096'].includes(
      contract.engineAdapters?.toonlab?.rockAttributeSource,
    )
      ? new GLTFLoader().loadAsync(
          authoredRockBake && !usesSourceTestRock
            ? selectedAuthoredRockUrl
            : selectedLod0RockUrl,
        )
      : Promise.resolve(null),
    loadParityRockMaterial(contract),
    usesSourceTestRock
      ? loadSourceTestRockMaterial(selectedTestRock)
      : Promise.resolve(null),
    Promise.resolve(null),
    createVisibleSky(contract),
    contentMode === 'environment'
      ? createSourceEnvironmentTestContent({
          groundSize: contract.ground.size,
          materialCheckpoint: contract.materialCheckpoint,
          p19DebugRotationYDegrees: query.has('debugP19Yaw')
            ? Number(query.get('debugP19Yaw'))
            : null,
          state: sharedSourceEnvironmentState,
        })
      : Promise.resolve(null),
  ]);
  let sourceRockMesh = null;
  if (sourceRockGltf) {
    sourceRockGltf.scene.traverse((object) => {
      if (!sourceRockMesh && object.isMesh) sourceRockMesh = object;
    });
    if (!sourceRockMesh) throw new Error('The Unreal source rock glTF has no mesh.');
  }
  const rockMaterial = usesSourceTestRock
    ? sourceTestRockMaterial
    : authoredRockBake
    ? authoredGltfMaterialToNodeMaterial(sourceRockMesh.material, contract)
    : fallbackRockMaterial;
  const sourceGroundMaterial = sourceEnvironmentContent?.groundMaterial;
  let groundMaterial = sourceGroundMaterial;
  if (sourceGroundMaterial && debugGroundMode === 'albedo') {
    groundMaterial = Object.assign(new MeshBasicNodeMaterial(), {
      colorNode: sourceGroundMaterial.colorNode,
      name: `${sourceGroundMaterial.name} — albedo diagnostic`,
    });
  } else if (sourceGroundMaterial && debugGroundMode === 'flat-normal') {
    // P14-only query diagnostic: preserve every authored surface output and
    // replace only the resolved material normal. This separates a landscape
    // normal-transport fault from base-color or renderer-lighting faults.
    sourceGroundMaterial.normalNode = normalViewGeometry;
    sourceGroundMaterial.name = `${sourceGroundMaterial.name} — flat-normal diagnostic`;
  } else if (sourceGroundMaterial && debugGroundMode === 'white-lit') {
    // P14-only query diagnostic: keep the exact Default Lit and environment
    // boundary while replacing the authored ground surface with a neutral
    // diffuse receiver. No checkpoint accepts this material as output.
    groundMaterial = new MeshPhysicalNodeMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 1,
    });
    groundMaterial.name = 'P14 neutral white Default Lit diagnostic';
  }
  groundMaterial ??= new MeshPhysicalNodeMaterial({
    color: 0xffffff,
    metalness: contract.ground.metallic,
    roughness: 1 - contract.ground.smoothness,
  });
  if (sourceEnvironmentContent?.groundRoot && groundMaterial !== sourceGroundMaterial) {
    sourceEnvironmentContent.groundRoot.traverse((object) => {
      if (object.isMesh) object.material = groundMaterial;
    });
  }
  if (!sourceEnvironmentContent) groundMaterial.name = 'Parity Ground White — URP Lit bridge';
  const sharedEnvironmentMaterials = new Set();
  sharedEnvironmentMaterials.add(bindParityEnvironmentToMaterial(rockMaterial, contract, {
    installUnityStage: usesSourceTestRock,
  }));
  sharedEnvironmentMaterials.add(bindParityEnvironmentToMaterial(groundMaterial, contract));
  if (sourceEnvironmentContent) {
    bindParityEnvironmentToObject(sourceEnvironmentContent.group, contract)
      .forEach((material) => sharedEnvironmentMaterials.add(material));
  }

  const roots = replaceMaterials(sourceGltf.scene, rockMaterial, groundMaterial);
  const retainedLandscapeGround = sourceEnvironmentContent?.groundRoot ?? null;
  if (retainedLandscapeGround) {
    // P14's Visual Target retains the authored Landscape. The compact parity
    // plane is a P13 compatibility receiver and must not render underneath
    // the exact source patch.
    roots.groundRoot.visible = false;
  }
  let testRockGeometryNormalization = null;
  if (sourceRockGltf) {
    const sourceGeometry = sourceRockMesh.geometry.clone();
    testRockGeometryNormalization = normalizeTestRockGeometry(
      sourceGeometry,
      contract,
      selectedTestRock,
    );
    sourceGeometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
    roots.rockMeshes.forEach((mesh) => {
      mesh.geometry = sourceGeometry;
    });
    roots.rockRoot.userData.parityRockAttributeSource = {
      basisAdapter: 'rotate local attributes 180 degrees around +Y',
      geometry: authoredRockBake && !usesSourceTestRock
        ? selectedAuthoredRockUrl
        : selectedLod0RockUrl,
      material: authoredRockBake && !usesSourceTestRock
        ? selectedAuthoredRockUrl
        : usesSourceTestRock
          ? selectedTestRock.sourceMaterial
          : null,
      mode: authoredRockBake && !usesSourceTestRock
        ? 'ue-authored-glb-bake-4096'
        : usesSourceTestRock
          ? 'source-lod0-plus-source-s-rock-graph'
          : 'ue-static-mesh-gltf',
      selectedTestRock,
      testRockGeometryNormalization,
    };
  }
  scene.add(sourceGltf.scene);
  if (sourceEnvironmentContent) scene.add(sourceEnvironmentContent.group);
  if (visibleSky) scene.add(visibleSky.root);
  scene.updateMatrixWorld(true);
  if (contentMode === 'environment') {
    const p19FixtureId = rockView === 'mountain'
      ? 'mountain-control'
      : rockView === 'mountain-surface'
        ? 'mountain-control'
      : rockView === 'cliff'
        ? 'classic-cliff-control'
        : null;
    const focusObject = p19FixtureId
      ? sourceEnvironmentContent?.mountainCliff?.children.find(
          (object) => object.userData.p19MountainCliffFixture?.id === p19FixtureId,
        )
      : roots.rockRoot;
    if (!focusObject) {
      throw new Error('The requested deterministic nature camera has no focus object.');
    }
    isolateP19NatureReview({
      focusFixtureId: p19FixtureId,
      roots,
      sourceEnvironmentContent,
    });
    focusExactCameraOnObject(
      camera,
      contract,
      focusObject,
      p18BenchCaptureView,
    );
  }

  const lightTarget = new THREE.Vector3(...convertUnityPosition(contract.camera.lookAt));
  const light = createHardShadowLight(contract, ray, lightTarget);
  const indirectLight = createIndirectLight(contract);
  scene.add(light, light.target, indirectLight);
  light.target.updateMatrixWorld(true);
  if (shadowMode === 'hard') {
    // ShadowNode updates its raster camera before Renderer updates the camera
    // convention. Prime WebGPU's [0,1] reversed-Z projection explicitly so
    // the first captured frame cannot compare a conventional receiver depth
    // against a reversed shadow atlas.
    light.shadow.camera.coordinateSystem = renderer.coordinateSystem;
    light.shadow.camera._reversedDepth = renderer.reversedDepthBuffer === true;
    light.shadow.camera.updateProjectionMatrix();
  }

  const groundFieldPass = [
    'grass',
    'tree',
    'flowers',
    'stylized-basic',
    'mountain-cliff',
  ].includes(contract.materialCheckpoint)
    ? createEnvironmentGroundFieldPass({
        renderer,
        scene,
        resolution: 2048,
      })
    : null;
  if (groundFieldPass) {
    // MI_Grass resolves RVT Mip Level = 4 in the UE 5.8 material metadata.
    // The pass supplies a deterministic 128² prefiltered target for this
    // 2048² field instead of relying on WebGPU render-target mip generation.
    environmentGroundField.colorMipLevel.value = 4;
    groundFieldPass.update();
  }

  renderer.render(scene, camera);
  await renderer.backend?.waitForGPU?.();
  element('toonlab-capture').src = renderer.domElement.toDataURL('image/png');

  const geometryIdMaterial = new MeshBasicNodeMaterial({ color: 0xffffff });
  geometryIdMaterial.name = 'Parity Geometry ID White';
  const rockMaterials = roots.rockMeshes.map((mesh) => mesh.material);
  const rockCastModes = roots.rockMeshes.map((mesh) => mesh.castShadow);
  const rockReceiveModes = roots.rockMeshes.map((mesh) => mesh.receiveShadow);
  const parityGroundWasVisible = roots.groundRoot.visible;
  const retainedGroundWasVisible = retainedLandscapeGround?.visible ?? false;
  roots.groundRoot.visible = false;
  if (retainedLandscapeGround) retainedLandscapeGround.visible = false;
  if (visibleSky) visibleSky.root.visible = false;
  light.visible = false;
  indirectLight.visible = false;
  roots.rockMeshes.forEach((mesh) => {
    mesh.material = geometryIdMaterial;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  const beautyToneMapping = renderer.toneMapping;
  const beautyOutputColorSpace = renderer.outputColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.render(scene, camera);
  await renderer.backend?.waitForGPU?.();
  element('toonlab-mask-capture').src = renderer.domElement.toDataURL('image/png');
  roots.rockMeshes.forEach((mesh, index) => {
    mesh.material = rockMaterials[index];
    mesh.castShadow = rockCastModes[index];
    mesh.receiveShadow = rockReceiveModes[index];
  });
  roots.groundRoot.visible = parityGroundWasVisible;
  if (retainedLandscapeGround) {
    retainedLandscapeGround.visible = retainedGroundWasVisible;
  }
  if (visibleSky) visibleSky.root.visible = true;
  light.visible = true;
  indirectLight.visible = true;
  renderer.toneMapping = beautyToneMapping;
  renderer.outputColorSpace = beautyOutputColorSpace;
  renderer.render(scene, camera);
  await renderer.backend?.waitForGPU?.();
  geometryIdMaterial.dispose();

  const report = buildReport({
    camera,
    contract,
    indirectLight,
    light,
    ray,
    rockRoot: roots.rockRoot,
    unityReport,
    visibleSky,
    visualTargetHeightFog,
  });
  report.content = {
    mode: contentMode,
    timeOfDay: {
      id: timeOfDay,
      ...timeOfDayPreset,
      captureKey: `${timeOfDay}-${rockView}`,
      standardMatrix: '4 time states × front/back/bench = 12 captures per engine',
    },
    sharedEnvironment: {
      inputAdapter: lightingInputAdapter(contract),
      materialCount: sharedEnvironmentMaterials.size,
      materials: [...sharedEnvironmentMaterials].map((material) => ({
        name: material.name,
        ...material.userData.sharedParityEnvironment,
      })),
      policy: 'One profile contract and one surface-binding module drive every content material.',
      profileId: contract.profileId,
    },
    sourceEnvironmentTestContent:
      sourceEnvironmentContent?.group.userData.sourceEnvironmentTestContent ?? null,
  };
  setGate('setup-gate', {
    label: report.setupPass ? 'PASS' : 'FAIL',
    state: report.setupPass ? 'pass' : 'fail',
  });
  element('projection-error').textContent = rockView === 'back'
    ? '180° deterministic orbit'
    : rockView === 'bench'
      ? 'shared P18 bench camera'
    : rockView === 'mountain'
      ? 'P19 mountain bounds fit'
    : rockView === 'mountain-surface'
      ? 'P19 mountain interior crop'
    : rockView === 'cliff'
      ? 'P19 cliff bounds fit'
    : !report.cameraProjectionRequired
      ? 'native test-rock capture'
    : Number.isFinite(report.setup.cameraProjectionMaximumNdcError)
      ? report.setup.cameraProjectionMaximumNdcError.toExponential(3)
      : 'native capture pending';
  element('transform-error').textContent = report.setup.rockTransformMaximumWorldError
    .toExponential(3);
  if (
    usesContractRock
    &&
    rockView === 'front'
    &&
    measurement?.checkpoint === contract.checkpoint
    && measurement?.profileId === profile.id
  ) {
    const toonlab = measurement.comparisons.toonlab;
    const unreal = measurement.comparisons.unreal;
    const geometryPass = toonlab.rockSilhouette.passesContract
      && unreal.rockSilhouette.passesContract;
    const maximumSilhouetteError = Math.max(
      toonlab.rockSilhouette.chebyshevPixelError,
      unreal.rockSilhouette.chebyshevPixelError,
    );
    setGate('geometry-gate', {
      label: `${geometryPass ? 'PASS' : 'FAIL'} · ${maximumSilhouetteError}px max`,
      state: geometryPass ? 'pass' : 'fail',
    });
    const blueHueGate = measurement.blueShadowHueGate;
    if (blueHueGate?.enabled) {
      if (blueHueGate.allEnginesPass) {
        setGate('blue-shadow-gate', { label: 'PASS · 3/3 engines', state: 'pass' });
      } else if (blueHueGate.allEnginesChromaticityPass) {
        const pending = blueHueGate.coveragePendingEngines.join(', ');
        setGate('blue-shadow-gate', {
          label: `HUE PASS · ${pending} sample coverage open`,
          state: 'pending',
        });
      } else {
        setGate('blue-shadow-gate', { label: 'FAIL · hue mismatch', state: 'fail' });
      }
    } else {
      setGate('blue-shadow-gate', { label: 'not required', state: 'pending' });
    }
    element('toonlab-rock-mae').textContent = toonlab.offRockColor.meanAbsoluteError
      .toFixed(3);
    element('toonlab-shadow-iou').textContent = toonlab.castShadow.intersectionOverUnion
      .toFixed(4);
    element('unreal-rock-mae').textContent = unreal.offRockColor.meanAbsoluteError
      .toFixed(3);
    const displayTransfer = measurement.displayTransfer;
    if (displayTransfer?.referenceEngine === 'unreal') {
      const displayToonLab = displayTransfer.comparisons?.toonlab;
      const displayUnity = displayTransfer.comparisons?.unity;
      element('toonlab-rock-mae-label').textContent = 'ToonLab ↔ Unreal rock MAE';
      element('unreal-rock-mae-label').textContent = 'Unity ↔ Unreal rock MAE';
      if (displayToonLab) {
        element('toonlab-rock-mae').textContent = displayToonLab.offRockColor
          .meanAbsoluteError.toFixed(3);
        element('toonlab-shadow-iou').textContent = displayToonLab.castShadow
          .intersectionOverUnion.toFixed(4);
      }
      if (displayUnity) {
        element('unreal-rock-mae').textContent = displayUnity.offRockColor
          .meanAbsoluteError.toFixed(3);
      }
    }
  } else {
    const pendingLabel = rockView === 'back'
      ? 'back-view measurement pending'
      : rockView === 'bench'
        ? 'bench-view measurement pending'
        : rockView === 'mountain'
          ? 'mountain-view measurement pending'
        : rockView === 'mountain-surface'
          ? 'mountain-surface measurement pending'
        : rockView === 'cliff'
          ? 'cliff-view measurement pending'
        : 'measurement unavailable';
    setGate('geometry-gate', { label: pendingLabel, state: 'pending' });
    setGate('blue-shadow-gate', { label: pendingLabel, state: 'pending' });
  }
  setGate('render-gate', {
    label: contract.profileId === 'p19-visual-target-mountain-cliff'
      ? 'P19 · MOUNTAIN/CLIFF ONLY · source LOD0 fixtures + M_Mountain/M_Rock parity candidate · P18 props excluded'
      : contract.profileId === 'p18-visual-target-stylized-basic'
      ? 'P18 · STYLIZED SOLID ONLY · exact source beach-shell LOD0 fixtures + MI_BeachShells/M_StylizedBasic active'
      : contract.profileId === 'p17-visual-target-flowers'
      ? 'P17 · FLOWERS/FOLIAGE ONLY · shared one-clump SM_Flower_Daisies1 fixture + exact MI_Daisy/M_Foliage active'
      : contract.profileId === 'p16-visual-target-tree'
      ? 'P16 · TREE ONLY · source SM_Pine01 + exact M_Bark/M_Leaves contracts active'
      : contract.profileId === 'p15-visual-target-grass'
      ? 'P15 · GRASS ONLY · UE AutoGrass density, mask, mesh, placement, RVT color, and WPO active'
      : contract.profileId === 'p14-visual-target-ground'
      ? 'P14 · GROUND ONLY · exact SnowPines landscape graph active; grass, flowers, and tree frozen'
      : contract.profileId === 'p13-ue-authored-background-clouds'
      ? 'P13 · SKY/CLOUD ALIGNED · ToonLab day color retained; P12 rock output gate remains open'
      : contract.profileId === 'p12-ue-authored-rock-bake'
      ? 'P12 · OUTPUT GATE OPEN · full M_Rock + UE attributes active; visual target match required'
      : contract.engineAdapters?.toonlab?.rockAttributeSource === 'ue-authored-glb-bake-4096'
      ? 'REJECTED · UE glTF bake samples black atlas padding'
      : contract.engineAdapters?.unreal?.mode === 'retained-visual-target-authority'
      ? 'P11 · Unreal equals retained Visual Target; Unity/ToonLab gap is now authoritative'
      : contract.engineAdapters?.toonlab?.normalResponseBridge > 0
      ? `P10 · normal-response bridge ${contract.engineAdapters.toonlab.normalResponseBridge} active; image gate open`
      : contract.engineAdapters?.toonlab?.rockAttributeSource === 'ue-static-mesh-gltf'
      ? 'P09 · Unreal tangent/UV attributes active; image gate open'
      : contract.engineAdapters?.toonlab?.surfaceMaterialGraph === 'ue-m-rock'
      ? 'P08 · literal M_Rock graph + UE Default Lit active; image gate open'
      : contract.engineAdapters?.toonlab?.surfaceLightingModel
      === 'ue-5.8-legacy-default-lit'
      ? 'P07 · UE Default Lit Lambert/GGX active; material graph parity open'
      : contract.engineAdapters
      ? 'P06 · exact 1/π radiometric bridge active; material response open'
      : useUeDisplayTransfer
      ? 'P05 · exact fixed exposure + UE film/output transfer active'
      : usesRawUntonedVisualTargetRadiometry(contract)
      ? 'OPEN · raw 8.0; exposure/tone transfer disabled'
      : 'OPEN · engine response differs',
    state: 'pending',
  });
  element('toonlab-state').textContent = report.setupPass
    ? contentMode === 'environment'
      ? contract.profileId === 'p19-visual-target-mountain-cliff'
        ? 'P19 · source mountain/cliff LOD0 + M_Mountain/M_Rock parity candidate · nature only'
        : contract.profileId === 'p18-visual-target-stylized-basic'
        ? 'P18 · exact M_StylizedBasic beach-shell fixture family active'
        : contract.profileId === 'p17-visual-target-flowers'
        ? 'P17 · shared one-clump SM_Flower_Daisies1 fixture + exact MI_Daisy active'
        : contract.profileId === 'p16-visual-target-tree'
        ? 'P16 · exact SM_Pine01 + MI_PineBark/MI_PineLeaves active'
        : contract.profileId === 'p15-visual-target-grass'
        ? 'P15 · exact SM_Grass1 AutoGrass + MI_Grass RVT path active'
        : contract.profileId === 'p14-visual-target-ground'
        ? 'P14 · ground graph active · grass/tree/flowers frozen'
        : 'shared P13 · source ground + grass + pine + daisies'
      : selectedTestRock.id === 'contract'
        ? 'contract setup pass'
        : `${selectedTestRock.assetName} · source LOD0 + ${selectedTestRock.sourceMaterial}`
    : 'contract setup mismatch';

  const controls = view === 'live'
      ? installLiveCameraControls({
        camera,
        contract,
        indirectLight,
        light,
        renderer,
        scene,
        shaderTarget: resolveShaderSwipeTarget(
          contract,
          roots,
          sourceEnvironmentContent,
        ),
        visibleSky,
      })
    : null;

  window.__triEngineParity = {
    // Keep the legacy ambient handle available for P00/P01 tooling while
    // exposing the generalized P03 indirect-light stage explicitly.
    ambient: indirectLight.isAmbientLight ? indirectLight : null,
    camera,
    contract,
    controls,
    groundFieldPass,
    indirectLight,
    light,
    renderer,
    report,
    scene,
    skyLight: indirectLight.isLightProbe ? indirectLight : null,
    visibleSky,
    visualTargetHeightFog,
    sourceGltf,
    ueVisualTargetConfiguration,
    ueVisualTargetReport,
    lightMode,
    rockView,
    selectedTestRock,
    sourceEnvironmentContent,
    testRockGeometryNormalization,
  };
  document.body.dataset.runtimeReport = JSON.stringify(report);
  document.body.dataset.profileId = profile.id;
  document.body.dataset.lightMode = lightMode;
  document.body.dataset.rockView = rockView;
  document.body.dataset.testRock = selectedTestRock.id;
  document.body.dataset.contentMode = contentMode;
  document.body.dataset.setupPass = String(report.setupPass);
  document.body.dataset.worldReady = 'true';
}

installPanelMaximization();

start().catch((error) => {
  console.error(error);
  const fatal = element('fatal');
  fatal.hidden = false;
  fatal.textContent = error.stack || error.message || String(error);
  document.body.dataset.worldReady = 'error';
});
