// Rock Lab sky + weather: Tree Lab's environment presentation
// (gradient dome, time-of-day sun, weather dimming, rain, grass cloud
// shadows) adapted to the rock scene's sun RIG — the rig owns shadow
// frustum fitting, so time-of-day drives it through setSunState() instead
// of poking a bare DirectionalLight. Session state only — never document
// data or exports.
//
// Deterministic captures (?hud=0 / ?captureView=) skip rain so baselines
// stay reproducible; the dome + noon-clear defaults are deterministic.

import * as THREE from 'three';
import { max, mix, normalize, positionLocal, pow, sRGBTransferEOTF, uniform, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { sampleEnvironmentTimeOfDay } from '../../../src/environment/environmentTimeOfDay.js';
import { WEATHER_PRESETS } from '../../tree-lab/engine/skyWeather.js';

export { WEATHER_PRESETS };

const RAIN_COUNT = 2600;
const RAIN_RADIUS = 26;
const RAIN_TOP = 22;

function desaturate(color, amount) {
  const gray = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  color.lerp(new THREE.Color(gray, gray, gray), amount);
  return color;
}

// The TSL gradient pre-decodes to preserve the original on-screen colors
// through the WebGPURenderer's output transform.
function createDomeMaterial() {
  const uniforms = {
    uGroundColor: uniform(new THREE.Color(0xa9d7ea)),
    uTopColor: uniform(new THREE.Color(0x5da4e8)),
  };
  const material = new MeshBasicNodeMaterial({
    depthWrite: false,
    side: THREE.BackSide,
  });
  material.name = 'RockLabSky';
  material.fog = false;
  material.lights = false;
  const t = pow(max(normalize(positionLocal).y, 0.0), 0.55);
  material.colorNode = vec4(
    sRGBTransferEOTF(mix(uniforms.uGroundColor, uniforms.uTopColor, t)),
    1.0,
  );
  material.uniforms = uniforms;
  return material;
}

export function createRockSky({ deterministic = false, engine, grass = null, store }) {
  const { ambient, controls, scene, setSunState } = engine;
  const baseFog = { far: scene.fog.far, near: scene.fog.near };
  const baseAmbient = ambient.intensity;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    createDomeMaterial(),
  );
  dome.renderOrder = -1;
  scene.add(dome);
  scene.background = null;

  // --- Rain streaks (skipped under deterministic captures) ------------------
  let rain = null;
  if (!deterministic) {
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(RAIN_COUNT * 3);
    const rainSpeeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      rainPositions[i * 3] = (Math.random() - 0.5) * RAIN_RADIUS * 2;
      rainPositions[i * 3 + 1] = Math.random() * RAIN_TOP;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_RADIUS * 2;
      rainSpeeds[i] = 14 + Math.random() * 8;
    }
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({
      color: 0xbdd4e8,
      depthWrite: false,
      opacity: 0.55,
      size: 0.09,
      transparent: true,
    }));
    rain.visible = false;
    rain.frustumCulled = false;
    scene.add(rain);

    engine.onFrame((delta) => {
      if (!rain.visible) return;
      const positions = rainGeometry.attributes.position.array;
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        positions[i * 3 + 1] -= rainSpeeds[i] * delta;
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3] = (Math.random() - 0.5) * RAIN_RADIUS * 2;
          positions[i * 3 + 1] = RAIN_TOP;
          positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_RADIUS * 2;
        }
      }
      rainGeometry.attributes.position.needsUpdate = true;
      // Rain sheet follows the view so it never runs out.
      rain.position.set(controls.target.x, 0, controls.target.z);
    });
  }

  function apply() {
    const { sky } = store.getState();
    const weather = WEATHER_PRESETS[sky.weather] ?? WEATHER_PRESETS.clear;
    const state = sampleEnvironmentTimeOfDay(sky.hour);

    // Sun through the rig: keyframed color/direction, dimmed by weather.
    setSunState({
      color: state.sunColor,
      intensity: 1.05 * state.sunIntensity * weather.sunScale,
      sourceRatios: {
        x: state.sunSourceRatios.x,
        y: Math.max(state.sunSourceRatios.y, 0.2),
        z: state.sunSourceRatios.z,
      },
    });
    ambient.intensity = baseAmbient * state.ambientScale * weather.ambientScale;

    // Sky dome + fog, grayed by weather. The sampler's sky values are TINTS
    // over a base sky, not absolute colors — multiply the lab's blues.
    const top = desaturate(
      new THREE.Color(0x5da4e8).multiply(state.skyTopTint), weather.skyGray);
    const groundTint = desaturate(
      new THREE.Color(0xa9d7ea).multiply(state.skyGroundTint), weather.skyGray);
    dome.material.uniforms.uTopColor.value.copy(top);
    dome.material.uniforms.uGroundColor.value.copy(groundTint);
    const fogColor = desaturate(state.fogColor.clone(), weather.skyGray * 0.6);
    scene.fog.color.copy(fogColor);
    scene.fog.near = baseFog.near / weather.fogScale;
    scene.fog.far = baseFog.far / weather.fogScale;

    if (rain) rain.visible = weather.rain;

    // Grass reacts: cloud shadows sweep in cloudy weather.
    grass?.applySettings({
      cloudShadowStrength: weather.cloudShadow,
      sunColor: `#${state.sunColor.getHexString()}`,
    });
  }

  let lastSky = null;
  store.subscribe(() => {
    const { sky } = store.getState();
    if (sky !== lastSky) {
      lastSky = sky;
      apply();
    }
  });
  apply();

  return { apply };
}
