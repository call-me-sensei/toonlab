// Sky Lab preview: the production StylizedSky over a compact existing
// stylized-terrain stage. Weather and lights are scene fixtures. The editor
// document only drives the sky subsystem's authored appearance settings.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  SKY_PRESET_DOCUMENT_TYPE,
  StylizedSky,
} from '../../../src/sky/stylizedSky.js';
import { createStylizedTerrain } from '../../../src/stylizedTerrain.js';
import { WeatherSystem } from '../../../src/weather/weatherSystem.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

const CAMERA_VIEW = Object.freeze({
  position: Object.freeze([48, 28, 62]),
  target: Object.freeze([0, 5, 0]),
});
const WEATHER_RESTART_DELAY_MS = 140;

function setSrgbColor(color, channels) {
  color.setRGB(channels[0], channels[1], channels[2], THREE.SRGBColorSpace);
}

export function createSkyLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 1200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxDistance = 220;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;

  // Existing deterministic terrain keeps the horizon and atmospheric color
  // relationships readable without making vegetation or water part of this
  // editor's ownership surface.
  const terrain = createStylizedTerrain({
    archetype: 'rollingPlains',
    depth: 10,
    detailTexture: false,
    height: 28,
    seed: 73,
    segments: 96,
    size: 180,
    waterCoverage: 0.18,
  });
  terrain.root.position.set(-terrain.spawn.x, -terrain.spawn.y, -terrain.spawn.z);
  scene.add(terrain.root);

  const initialState = store.getState();
  const sky = new StylizedSky({ ...initialState.settings, quality: initialState.view.quality });
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffffff, initialState.view.sunIntensity);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x6b7280, initialState.view.ambientIntensity);
  scene.add(ambient);

  const baselineFog = new THREE.Fog(0xb5d6ee, 90, 390);
  scene.fog = baselineFog;

  const sunRig = {
    light: sun,
    setState({ color, intensity } = {}) {
      if (color?.isColor) sun.color.copy(color);
      else if (Array.isArray(color)) setSrgbColor(sun.color, color);
      if (Number.isFinite(intensity)) sun.intensity = intensity;
    },
  };

  let weather = null;
  let weatherRestartTimer = null;
  let disposed = false;
  let rendererReady = false;
  let started = false;
  let previousFrameTime = performance.now();

  function resetCamera() {
    camera.position.fromArray(CAMERA_VIEW.position);
    controls.target.fromArray(CAMERA_VIEW.target);
    camera.lookAt(controls.target);
    controls.update();
  }

  function applyAuthoredScene() {
    const state = store.getState();
    const settings = state.settings;
    sky.setQuality(state.view.quality);
    sky.applySettings(settings);

    const sunDirection = new THREE.Vector3(...settings.sunDirection);
    if (sunDirection.lengthSq() < 1e-8) sunDirection.set(0.35, 0.8, 0.45);
    sun.position.copy(sunDirection.normalize().multiplyScalar(120));
    setSrgbColor(sun.color, settings.sunColor);
    sun.intensity = state.view.sunIntensity;

    setSrgbColor(ambient.color, settings.zenithColor);
    setSrgbColor(ambient.groundColor, settings.groundColor);
    ambient.intensity = state.view.ambientIntensity;

    scene.fog = baselineFog;
    setSrgbColor(baselineFog.color, settings.horizonColor);
    baselineFog.near = 90;
    baselineFog.far = 390;
  }

  function stopWeather() {
    if (!weather) return;
    weather.dispose();
    weather = null;
  }

  function startWeather(preset) {
    if (disposed || !rendererReady || preset === 'authored') return;
    weather = new WeatherSystem({
      camera,
      precipitationFloorY: 0,
      preset,
      renderer,
      scene,
      seed: 73,
      sky,
      sunRig,
    });
  }

  function restartWeather({ delay = 0 } = {}) {
    if (weatherRestartTimer !== null) {
      window.clearTimeout(weatherRestartTimer);
      weatherRestartTimer = null;
    }
    stopWeather();
    applyAuthoredScene();
    const preset = store.getState().view.weather;
    if (preset === 'authored') return;
    if (delay <= 0) {
      startWeather(preset);
      return;
    }
    weatherRestartTimer = window.setTimeout(() => {
      weatherRestartTimer = null;
      if (disposed) return;
      // Use the latest authored values after a slider editing burst.
      applyAuthoredScene();
      startWeather(store.getState().view.weather);
    }, delay);
  }

  let appliedDocRevision = initialState.docRevision;
  let appliedWeather = initialState.view.weather;
  let appliedSunIntensity = initialState.view.sunIntensity;
  let appliedAmbientIntensity = initialState.view.ambientIntensity;
  let appliedQuality = initialState.view.quality;

  store.subscribe(() => {
    const state = store.getState();
    const weatherChanged = state.view.weather !== appliedWeather;
    const lightingChanged = state.view.sunIntensity !== appliedSunIntensity
      || state.view.ambientIntensity !== appliedAmbientIntensity
      || state.view.quality !== appliedQuality;
    const documentChanged = state.docRevision !== appliedDocRevision;

    if (weatherChanged) restartWeather();
    else if (documentChanged || lightingChanged) {
      restartWeather({
        delay: state.view.weather === 'authored' ? 0 : WEATHER_RESTART_DELAY_MS,
      });
    }

    appliedDocRevision = state.docRevision;
    appliedWeather = state.view.weather;
    appliedSunIntensity = state.view.sunIntensity;
    appliedAmbientIntensity = state.view.ambientIntensity;
    appliedQuality = state.view.quality;
  });

  function renderFrame(frameTime = performance.now()) {
    if (disposed) return;
    const delta = Math.min(Math.max((frameTime - previousFrameTime) / 1000, 0), 0.1);
    previousFrameTime = frameTime;
    controls.update();
    weather?.update(delta);
    sky.update(delta, camera);
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
      if (weatherRestartTimer !== null) window.clearTimeout(weatherRestartTimer);
      window.removeEventListener('resize', handleResize);
      renderer.setAnimationLoop(null);
      stopWeather();
      terrain.dispose();
      sky.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    renderer,
    resetCamera,
    scene,
    sky,
    async start() {
      if (started) return;
      started = true;
      await whenRendererReady(renderer);
      if (disposed) return;
      rendererReady = true;
      resetCamera();
      restartWeather();
      previousFrameTime = performance.now();
      renderer.setAnimationLoop(renderFrame);
      document.body.dataset.modelReady = 'true';
      document.body.dataset.skyLabReady = 'true';
      document.body.dataset.skyPresetType = SKY_PRESET_DOCUMENT_TYPE;
    },
  };
}
