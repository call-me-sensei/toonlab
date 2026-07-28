// Cloud Shader Lab preview.
//
// The authored profile drives the accepted P18 background-cloud and
// cloud-shell graph. Sky, time, weather, camera, and source assets remain
// preview/runtime inputs and never enter the exported cloud style.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { applyCloudShaderSettings } from '../../../src/cloud/index.js';
import { WeatherSystem } from '../../../src/weather/weatherSystem.js';
import {
  createLabRenderer,
  whenRendererReady,
} from '../../shared/rendererFactory.js';
import {
  loadP18ReferenceContract,
  sampleP18ReferenceTime,
} from '../../shared/p18/referenceEnvironment.js';
import { createP18PreviewReferenceSky } from '../../shared/p18/referenceSky.js';

function stagePoint([x, y, z]) {
  return new THREE.Vector3(x, y, -z);
}

function cameraView(contract, mode) {
  const position = stagePoint(contract.camera.position);
  const target = stagePoint(contract.camera.lookAt);
  if (mode === 'cloud') {
    // Keep the accepted azimuth and position while tilting the camera upward
    // so the cloud shell—not terrain—is the review subject.
    target.y += 8;
  }
  return { position, target };
}

function setLinearColor(target, channels) {
  target.setRGB(channels[0], channels[1], channels[2]);
}

export function createCloudShaderLabEngine({ mount, store }) {
  const renderer = createLabRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2_000_000,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxDistance = 120;
  controls.minDistance = 1;
  controls.maxPolarAngle = Math.PI - 0.02;
  controls.minPolarAngle = 0.02;

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(sun);
  const sunRig = {
    light: sun,
    setState({ color, intensity } = {}) {
      if (color?.isColor) sun.color.copy(color);
      else if (Array.isArray(color)) setLinearColor(sun.color, color);
      if (Number.isFinite(intensity)) sun.intensity = intensity;
    },
  };

  let contract = null;
  let referenceSky = null;
  let referenceClearColor = new THREE.Color(0, 0, 0);
  let weather = null;
  let disposed = false;
  let rendererReady = false;
  let started = false;
  let previousFrameTime = performance.now();
  let cycleAccumulator = 0;

  function resetCamera(mode = store.getState().view.viewMode) {
    if (!contract) return;
    const view = cameraView(contract, mode);
    camera.position.copy(view.position);
    camera.up.fromArray(stagePoint(contract.camera.up).toArray());
    controls.target.copy(view.target);
    camera.lookAt(view.target);
    controls.update();
    document.body.dataset.cloudPreviewView = mode;
  }

  function applyAuthoredCloud() {
    if (!referenceSky) return;
    const state = store.getState();
    applyCloudShaderSettings(referenceSky, state.settings);
    document.body.dataset.cloudShaderProfile = state.presetId ?? 'custom';
    document.body.dataset.cloudShaderTarget = 'p18-authored-cloud-shell';
  }

  function applyPreviewTime() {
    if (!referenceSky) return;
    const { hour } = store.getState().view;
    const time = sampleP18ReferenceTime(hour);
    referenceSky.setTime({
      energy: time.skyEnergy,
      tint: time.skyTint,
    });
    scene.background.copy(referenceClearColor)
      .multiply(new THREE.Color(...time.skyTint))
      .multiplyScalar(time.skyEnergy);
    document.body.dataset.previewTimeOfDay =
      `${String(Math.floor(hour)).padStart(2, '0')}:${
        String(Math.round((hour % 1) * 60)).padStart(2, '0')
      }`;
  }

  function stopWeather() {
    weather?.dispose();
    weather = null;
    scene.fog = null;
  }

  function startWeather() {
    const state = store.getState();
    if (!rendererReady || state.view.weather === 'authored') return;
    weather = new WeatherSystem({
      camera,
      precipitationFloorY: 0,
      preset: state.view.weather,
      renderer,
      scene,
      seed: 73,
      sky: null,
      style: 'call_me_sensei',
      sunRig,
    });
    weather.root.visible = state.view.particles;
  }

  function restartWeather() {
    stopWeather();
    applyPreviewTime();
    startWeather();
  }

  let appliedDocumentRevision = -1;
  let appliedHour = null;
  let appliedParticles = null;
  let appliedViewMode = null;
  let appliedWeather = null;

  const unsubscribe = store.subscribe(() => {
    if (!referenceSky) return;
    const state = store.getState();
    const weatherChanged = state.view.weather !== appliedWeather;
    if (state.docRevision !== appliedDocumentRevision) applyAuthoredCloud();
    if (weatherChanged) restartWeather();
    else if (state.view.hour !== appliedHour) {
      applyPreviewTime();
      weather?.refresh();
    }
    if (state.view.particles !== appliedParticles && weather) {
      weather.root.visible = state.view.particles;
    }
    if (state.view.viewMode !== appliedViewMode) {
      resetCamera(state.view.viewMode);
    }
    appliedDocumentRevision = state.docRevision;
    appliedHour = state.view.hour;
    appliedParticles = state.view.particles;
    appliedViewMode = state.view.viewMode;
    appliedWeather = state.view.weather;
  });

  function renderFrame(frameTime = performance.now()) {
    if (disposed) return;
    const delta = Math.min(Math.max((frameTime - previousFrameTime) / 1000, 0), 0.1);
    previousFrameTime = frameTime;
    const state = store.getState();
    if (state.view.autoCycle) {
      cycleAccumulator += delta;
      if (cycleAccumulator >= 0.1) {
        store.actions.setPreviewHour(state.view.hour + cycleAccumulator * 0.5);
        cycleAccumulator = 0;
      }
    } else {
      cycleAccumulator = 0;
    }
    controls.update();
    referenceSky?.update(delta);
    weather?.update(delta);
    renderer.render(scene, camera);
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  return {
    camera,
    controls,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      renderer.setAnimationLoop(null);
      stopWeather();
      referenceSky?.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    renderer,
    resetCamera,
    scene,
    async start() {
      if (started) return;
      started = true;
      await whenRendererReady(renderer);
      if (disposed) return;
      rendererReady = true;

      contract = await loadP18ReferenceContract();
      if (disposed) return;
      referenceSky = await createP18PreviewReferenceSky(contract);
      if (disposed) {
        referenceSky?.dispose();
        return;
      }
      if (!referenceSky?.cloudRoot) {
        throw new Error('The accepted P18 cloud-shell source is unavailable.');
      }

      camera.fov = contract.camera.verticalFieldOfViewDegrees;
      camera.near = contract.camera.near;
      camera.far = contract.sky.toonlabCameraFarMeters ?? contract.camera.far;
      camera.updateProjectionMatrix();
      referenceClearColor = new THREE.Color(...contract.render.clearColor.slice(0, 3));
      scene.background = referenceClearColor.clone();
      scene.add(referenceSky.root);
      referenceSky.setComponentStyles({
        clouds: 'call_me_sensei',
        sky: 'call_me_sensei',
      });
      referenceSky.setVisibility({ clouds: true, sky: true });

      const state = store.getState();
      appliedDocumentRevision = state.docRevision;
      appliedHour = state.view.hour;
      appliedParticles = state.view.particles;
      appliedViewMode = state.view.viewMode;
      appliedWeather = state.view.weather;
      applyAuthoredCloud();
      applyPreviewTime();
      resetCamera();
      startWeather();

      previousFrameTime = performance.now();
      renderer.setAnimationLoop(renderFrame);
      document.body.dataset.modelReady = 'true';
      document.body.dataset.cloudShaderLabReady = 'true';
      document.body.dataset.cloudPreviewSource = 'p18';
      store.actions.adoptEngineState({
        engineReady: true,
        status: 'P18 sky and authored cloud shell ready.',
      });
    },
  };
}
