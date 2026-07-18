// Weather verification — registry coverage, settings/document round trips,
// deterministic precipitation, transitions, and cross-system adapter writes.
// Run with: node scripts/verify-weather.mjs

import process from 'node:process';
import * as THREE from 'three';

import {
  WeatherPrecipitation,
  createWeatherPresetDocument,
  createWeatherSettings,
  createWeatherSystem,
  getWeatherPresetOptions,
  parseWeatherPresetDocument,
  resolveWeatherPreset,
} from '../src/weather/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const ids = new Set(getWeatherPresetOptions().map((entry) => entry.id));
for (const id of ['clear', 'fog', 'rain', 'thunderstorm', 'snow', 'blizzard', 'sleet', 'freezingRain', 'hail', 'dustStorm', 'sandstorm', 'call_me_sensei']) {
  check(`registry includes ${id}`, ids.has(id));
}
check('registry has broad condition coverage', ids.size >= 20, `count=${ids.size}`);
check('snow uses snow precipitation', resolveWeatherPreset('snow').settings.precipitation.type === 'snow');
check('hail uses hail precipitation', resolveWeatherPreset('hail').settings.precipitation.type === 'hail');
check('thunderstorm enables lightning', resolveWeatherPreset('thunderstorm').settings.lightning.enabled === true);
check('dust storm uses airborne dust', resolveWeatherPreset('dustStorm').settings.precipitation.type === 'dust');

const normalized = createWeatherSettings({
  atmosphere: { cloudCoverage: 9 },
  precipitation: { intensity: -2, type: 'unknown' },
  surface: { snowCover: 3 },
});
check('settings clamp cloud coverage', normalized.atmosphere.cloudCoverage === 1);
check('settings clamp precipitation intensity', normalized.precipitation.intensity === 0);
check('settings reject unknown precipitation type', normalized.precipitation.type === 'none');
check('settings clamp surface outputs', normalized.surface.snowCover === 1);

const document = createWeatherPresetDocument('custom-storm', {
  label: 'Custom Storm',
  settings: resolveWeatherPreset('thunderstorm').settings,
});
const parsed = parseWeatherPresetDocument(JSON.stringify(document));
check('preset document round-trips', parsed.ok && parsed.value.id === 'custom-storm');
check('document preserves lightning', parsed.value.settings.lightning.enabled === true);

function seedHash(layer) {
  const values = layer.geometry.attributes.aWeatherSeed.array;
  let hash = 0x811c9dc5;
  for (let index = 0; index < Math.min(values.length, 1024); index += 1) {
    hash ^= Math.round(values[index] * 65535);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const snowA = new WeatherPrecipitation({ maxParticles: 1200, seed: 42, settings: resolveWeatherPreset('snow').settings.precipitation });
const snowB = new WeatherPrecipitation({ maxParticles: 1200, seed: 42, settings: resolveWeatherPreset('snow').settings.precipitation });
const snowC = new WeatherPrecipitation({ maxParticles: 1200, seed: 43, settings: resolveWeatherPreset('snow').settings.precipitation });
check('precipitation seeds are deterministic', seedHash(snowA) === seedHash(snowB));
check('different precipitation seed changes the field', seedHash(snowA) !== seedHash(snowC));
check('precipitation stays one draw call', snowA.isMesh && snowA.geometry.instanceCount > 0);
check('precipitation respects capacity', snowA.geometry.instanceCount <= snowA.capacity);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9c9e8, 100, 700);
const camera = new THREE.PerspectiveCamera();
camera.position.set(2, 6, 3);
camera.updateMatrixWorld();
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const calls = { cloud: null, grass: null, surface: null, water: null };
const grass = {
  setCloudShadow(value) { calls.cloud = value; },
  setWind(value) { calls.grass = value; },
};
const water = new THREE.Object3D();
water.settings = { waveIntensity: 0.2 };
water.applySettings = (value) => { calls.water = value; water.settings = { ...water.settings, ...value }; };
water.setCloudShadow = (value) => { calls.cloud = value; };
water.addRipple = () => {};
const system = createWeatherSystem({
  camera,
  grass,
  onSurfaceChange: (value) => { calls.surface = value; },
  preset: 'clear',
  scene,
  seed: 99,
  water,
});
system.setPreset('thunderstorm');
check('weather writes shared wind', calls.grass.strength === resolveWeatherPreset('thunderstorm').settings.wind.strength);
check('weather writes shared cloud shadow', calls.cloud.strength === 0);
check('weather writes water response', calls.water.waveIntensity > 0.2);
check('weather publishes surface response', calls.surface.wetness === 1);
check('weather scales scene fog', scene.fog.far < 700);
check('weather scales ambient lights', ambient.intensity < 0.5);

let lightningEvents = 0;
system.addEventListener('lightning', () => { lightningEvents += 1; });
system.triggerLightning();
check('manual lightning emits an event', lightningEvents === 1);
check('lightning creates a visible flash', system.lightningLight.visible === true);

system.setPreset('clear');
system.transitionTo('snow', { duration: 1 });
for (let index = 0; index < 12; index += 1) system.update(0.1);
check('weather transition reaches its target', system.transition === null && system.settings.precipitation.type === 'snow');
check('transition updates precipitation renderer', system.precipitation.geometry.instanceCount > 0);

system.dispose();
snowA.dispose();
snowB.dispose();
snowC.dispose();
check('dispose restores original scene fog object', scene.fog !== null && scene.fog.far === 700);

if (failures > 0) {
  console.error(`\n${failures} weather verification failure${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`\nWeather verification passed (${ids.size} presets).`);

