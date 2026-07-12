// Sky + weather rig for Tree Lab: a gradient sky dome driven by the
// shared time-of-day sampler (src/environment/environmentTimeOfDay.js), plus
// a weather layer (clear / cloudy / overcast / rain) that scales sun,
// ambient, fog, grass cloud shadows, and spawns rain streaks. Environment
// presentation is session state — never part of the recipe or exports.

import * as THREE from 'three';
import { max, mix, normalize, positionLocal, pow, sRGBTransferEOTF, uniform, vec4 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { sampleEnvironmentTimeOfDay } from '../../../src/environment/environmentTimeOfDay.js';

export const WEATHER_PRESETS = {
  clear: {
    ambientScale: 1.0, cloudShadow: 0.15, fogScale: 1.0, label: 'Clear', rain: false, skyGray: 0, sunScale: 1.0,
  },
  cloudy: {
    ambientScale: 1.05, cloudShadow: 0.55, fogScale: 1.2, label: 'Cloudy', rain: false, skyGray: 0.3, sunScale: 0.7,
  },
  overcast: {
    ambientScale: 1.15, cloudShadow: 0, fogScale: 1.5, label: 'Overcast', rain: false, skyGray: 0.6, sunScale: 0.4,
  },
  rain: {
    ambientScale: 1.0, cloudShadow: 0, fogScale: 2.1, label: 'Rain', rain: true, skyGray: 0.7, sunScale: 0.28,
  },
};

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
  material.name = 'DesignerSky';
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

export function createSkyWeather({ engine, grass = null, store }) {
  const { ambient, controls, hemi, scene, sun } = engine;
  const baseFog = { far: scene.fog.far, near: scene.fog.near };

  // --- Gradient sky dome ----------------------------------------------------
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    createDomeMaterial(),
  );
  dome.renderOrder = -1;
  scene.add(dome);
  scene.background = null;

  // --- Rain streaks ----------------------------------------------------------
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
  const rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({
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

  // --- Apply hour + weather ---------------------------------------------------
  function apply() {
    const { sky } = store.getState();
    const weather = WEATHER_PRESETS[sky.weather] ?? WEATHER_PRESETS.clear;
    const state = sampleEnvironmentTimeOfDay(sky.hour);

    // Sun: keyframed color/intensity/direction, dimmed by weather. The base
    // designer sun is 1.6 at noon-ish, so scale against intensity 1.0 = 1.6.
    sun.color.copy(state.sunColor);
    sun.intensity = 1.6 * state.sunIntensity * weather.sunScale;
    const ratios = state.sunSourceRatios;
    sun.position.set(ratios.x * 40, ratios.y * 40, ratios.z * 40);
    ambient.intensity = 0.55 * state.ambientScale * weather.ambientScale;
    hemi.intensity = 0.5 * state.ambientScale * weather.ambientScale;

    // Sky dome + fog, grayed by weather. The sampler's sky values are TINTS
    // over a base sky, not absolute colors — multiply the designer's blues.
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

    rain.visible = weather.rain;

    // Grass reacts: cloud shadows sweep in cloudy weather.
    grass?.applySettings({
      cloudShadowStrength: weather.cloudShadow,
      sunColor: `#${state.sunColor.getHexString()}`,
    });

    // The toon canopy shader takes its own sun; keep it in step. Its sky
    // term drives the SHADOW side — soften the dome blue toward white or
    // shadowed leaves go navy.
    const canopySky = top.clone().lerp(new THREE.Color(1, 1, 1), 0.6);
    const direction = [ratios.x, ratios.y, ratios.z];
    // Dim foliage with the sun (floor keeps night readable, not black).
    const lightScale = Math.min(1, 0.3 + state.sunIntensity * weather.sunScale * 0.8);
    const sunColor = [
      state.sunColor.r * lightScale,
      state.sunColor.g * lightScale,
      state.sunColor.b * lightScale,
    ];
    canopySky.multiplyScalar(lightScale);
    engine.getPlant()?.setSun({
      direction,
      color: sunColor,
      sky: [canopySky.r, canopySky.g, canopySky.b],
    });
  }

  // Re-apply after every rebuild — rebuild() resets the plant's sun.
  engine.onRebuilt(() => apply());

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
