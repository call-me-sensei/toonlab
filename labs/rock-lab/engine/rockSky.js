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
import { WeatherPrecipitation } from '../../../src/weather/index.js';

export { WEATHER_PRESETS };

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

  // --- Shared precipitation runtime (skipped in deterministic captures) -----
  let precipitation = null;
  if (!deterministic) {
    precipitation = new WeatherPrecipitation({ maxParticles: 8000, seed: 47 });
    const precipitationCenter = new THREE.Vector3();
    scene.add(precipitation);

    engine.onFrame((delta) => {
      precipitationCenter.set(controls.target.x, 0, controls.target.z);
      precipitation.update(delta, { center: precipitationCenter, renderer: engine.renderer });
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
    const fogColor = weather.fogColor
      ? new THREE.Color(...weather.fogColor)
      : desaturate(state.fogColor.clone(), weather.skyGray * 0.6);
    scene.fog.color.copy(fogColor);
    scene.fog.near = baseFog.near / weather.fogScale;
    scene.fog.far = baseFog.far / weather.fogScale;

    precipitation?.applySettings(weather.precipitation, weather.wind);

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
