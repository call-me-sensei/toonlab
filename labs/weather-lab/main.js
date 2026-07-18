import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import './weatherLab.css';

import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import { createStylizedTerrain } from '../../src/stylizedTerrain.js';
import { createStylizedWorld } from '../../src/stylizedWorld.js';
import {
  WEATHER_SETTING_FIELD_SCHEMA,
  WEATHER_SETTING_GROUPS,
  getWeatherPresetOptions,
  mergeWeatherSettings,
  parseWeatherPresetDocument,
  registerWeatherPresetDocument,
  resolveWeatherPreset,
  serializeWeatherPresetDocument,
} from '../../src/weather/index.js';

const CATEGORY_ORDER = [
  ['Signature & fair', ['call_me_sensei', 'clear', 'partlyCloudy', 'cloudy', 'overcast', 'windy']],
  ['Visibility', ['haze', 'mist', 'fog']],
  ['Rain & storms', ['drizzle', 'rain', 'heavyRain', 'thunderstorm', 'tropicalStorm']],
  ['Winter', ['snow', 'heavySnow', 'blizzard', 'sleet', 'freezingRain', 'hail']],
  ['Arid', ['dustStorm', 'sandstorm']],
];

const ICONS = Object.freeze({
  blizzard: '🌨️', call_me_sensei: '🌤️', clear: '☀️', cloudy: '☁️', drizzle: '🌦️',
  dustStorm: '🌫️', fog: '🌁', freezingRain: '🧊', hail: '🧊', haze: '🌤️', heavyRain: '🌧️',
  heavySnow: '❄️', mist: '〰️', overcast: '☁️', partlyCloudy: '⛅', rain: '🌧️',
  sandstorm: '🏜️', sleet: '🌨️', snow: '❄️', thunderstorm: '⛈️', tropicalStorm: '🌀', windy: '💨',
});

const elements = Object.fromEntries([
  'conditionCount', 'exportWeather', 'importWeather', 'lightningTrigger', 'particleStatus',
  'rendererStatus', 'saveWeather', 'surfaceStatus', 'transitionDuration', 'transitionValue',
  'weatherConditions', 'weatherFields', 'weatherFile', 'weatherGroups', 'weatherName', 'weatherStatus',
].map((id) => [id, document.getElementById(id)]));

let activePreset = 'call_me_sensei';
let activeGroup = 'atmosphere';
let draft = resolveWeatherPreset(activePreset).settings;
let world = null;

function colorToHex(rgb) {
  return `#${new THREE.Color().setRGB(...rgb).getHexString()}`;
}

function hexToColor(value) {
  const color = new THREE.Color(value);
  return [color.r, color.g, color.b];
}

function formatNumber(value, step = 0.01) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return Number(value).toFixed(decimals);
}

function downloadJson(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return String(value || 'custom-weather').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-weather';
}

function updateStatus() {
  if (!world?.weather) return;
  const state = world.weather.state;
  const precipitation = state.settings.precipitation;
  const surface = state.settings.surface;
  const drawn = world.weather.precipitation.geometry.instanceCount;
  elements.weatherStatus.textContent = `${state.preset ?? 'Custom'} · ${precipitation.type === 'none' ? 'no precipitation' : `${Math.round(precipitation.intensity * 100)}% ${precipitation.type}`}${state.transitioning ? ` · transitioning ${Math.round(state.transitionProgress * 100)}%` : ''}`;
  elements.surfaceStatus.textContent = `Wet ${Math.round(surface.wetness * 100)}% · Snow ${Math.round(surface.snowCover * 100)}% · Ice ${Math.round(surface.ice * 100)}%`;
  elements.particleStatus.textContent = `${drawn.toLocaleString()} particles`;
}

function applyDraft({ transition = false } = {}) {
  if (!world?.weather) return;
  if (transition) {
    world.weather.transitionTo(draft, { duration: Number(elements.transitionDuration.value) || 0 });
  } else {
    world.weather.applySettings(draft);
  }
  activePreset = null;
  renderConditions();
  updateStatus();
}

function renderConditions() {
  const options = new Map(getWeatherPresetOptions().map((entry) => [entry.id, entry]));
  elements.conditionCount.textContent = `${options.size} presets`;
  elements.weatherConditions.innerHTML = '';
  for (const [category, ids] of CATEGORY_ORDER) {
    const title = document.createElement('div');
    title.className = 'wl-category';
    title.textContent = category;
    elements.weatherConditions.appendChild(title);
    for (const id of ids) {
      const option = options.get(id);
      if (!option) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `wl-condition${activePreset === id ? ' active' : ''}`;
      button.innerHTML = `<span class="wl-condition-icon">${ICONS[id] ?? '☁️'}</span><span class="wl-condition-copy"><strong>${option.label}</strong><small>${option.description}</small></span>${id === 'call_me_sensei' ? '<span class="wl-condition-tag">Studio</span>' : ''}`;
      button.addEventListener('click', () => {
        activePreset = id;
        draft = resolveWeatherPreset(id).settings;
        elements.weatherName.value = option.label;
        world?.weather?.transitionTo(id, { duration: Number(elements.transitionDuration.value) || 0 });
        renderConditions();
        renderFields();
      });
      elements.weatherConditions.appendChild(button);
    }
  }
}

function commitField(groupId, key, value) {
  draft = mergeWeatherSettings(draft, { [groupId]: { [key]: value } });
  applyDraft();
}

function createFieldControl(field, value) {
  if (field.type === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.addEventListener('change', () => commitField(field.group, field.key, input.checked));
    return input;
  }
  if (field.type === 'select') {
    const select = document.createElement('select');
    for (const option of field.options) {
      const element = document.createElement('option');
      element.value = option;
      element.textContent = option.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
      select.appendChild(element);
    }
    select.value = value;
    select.addEventListener('change', () => commitField(field.group, field.key, select.value));
    return select;
  }
  if (field.type === 'color') {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorToHex(value);
    input.addEventListener('input', () => commitField(field.group, field.key, hexToColor(input.value)));
    return input;
  }
  if (field.type === 'nullableColor') {
    const wrap = document.createElement('div');
    wrap.className = 'wl-null-color';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorToHex(value ?? [0.72, 0.83, 0.94]);
    input.disabled = value === null;
    input.addEventListener('input', () => commitField(field.group, field.key, hexToColor(input.value)));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = value === null ? 'Scene' : 'Custom';
    toggle.addEventListener('click', () => {
      commitField(field.group, field.key, value === null ? hexToColor(input.value) : null);
      renderFields();
    });
    wrap.append(input, toggle);
    return wrap;
  }
  if (field.type === 'vector2' || field.type === 'vector3') {
    const wrap = document.createElement('div');
    wrap.className = 'wl-vector';
    const size = field.type === 'vector2' ? 2 : 3;
    for (let index = 0; index < size; index += 1) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.value = formatNumber(value[index], 0.01);
      input.addEventListener('change', () => {
        const next = [...value];
        next[index] = Number(input.value) || 0;
        commitField(field.group, field.key, next);
      });
      wrap.appendChild(input);
    }
    return wrap;
  }
  const wrap = document.createElement('div');
  wrap.className = 'wl-value-wrap';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = field.range.min;
  input.max = field.range.max;
  input.step = field.range.step;
  input.value = value;
  const output = document.createElement('span');
  output.className = 'wl-value';
  output.textContent = formatNumber(value, field.range.step);
  input.addEventListener('input', () => {
    output.textContent = formatNumber(input.value, field.range.step);
    commitField(field.group, field.key, Number(input.value));
  });
  wrap.append(input, output);
  return wrap;
}

function renderGroups() {
  elements.weatherGroups.innerHTML = '';
  for (const group of WEATHER_SETTING_GROUPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = activeGroup === group.id ? 'active' : '';
    button.textContent = group.label.split(' ')[0];
    button.title = group.label;
    button.addEventListener('click', () => {
      activeGroup = group.id;
      renderGroups();
      renderFields();
    });
    elements.weatherGroups.appendChild(button);
  }
}

function renderFields() {
  const group = WEATHER_SETTING_GROUPS.find((entry) => entry.id === activeGroup);
  elements.weatherFields.innerHTML = `<p class="wl-group-intro">${group.description}</p>`;
  for (const field of Object.values(WEATHER_SETTING_FIELD_SCHEMA[activeGroup])) {
    const row = document.createElement('label');
    row.className = 'wl-field';
    const title = document.createElement('span');
    title.className = 'wl-field-label';
    title.textContent = field.label;
    const description = document.createElement('span');
    description.className = 'wl-field-description';
    description.textContent = field.description;
    row.append(title, createFieldControl(field, draft[activeGroup][field.key]), description);
    elements.weatherFields.appendChild(row);
  }
}

async function buildStage() {
  const mount = document.getElementById('stage');
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 2000);
  camera.position.set(55, 34, 68);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  const terrain = createStylizedTerrain({
    archetype: 'rollingPlains',
    depth: 10,
    height: 28,
    seed: 73,
    segments: 112,
    size: 180,
    waterCoverage: 0.24,
  });
  const terrainRoot = new THREE.Group();
  terrainRoot.add(terrain.root);
  scene.add(terrainRoot);
  const focus = new THREE.Object3D();
  focus.position.copy(terrain.spawn);
  scene.add(focus);
  controls.target.copy(terrain.spawn).add(new THREE.Vector3(0, 4, 0));

  world = await createStylizedWorld({
    ambientfx: { effects: { fireflies: true, mist: true, pollen: true } },
    camera,
    flowers: { scatter: { density: 0.24, radius: 32, seed: 9 } },
    followTarget: focus,
    grass: { scatter: { density: 3.5, radius: 42, seed: 5 } },
    renderer,
    scene,
    // Weather Lab prioritizes rapid condition transitions. Cloud shadows are
    // still driven by weather, while the separate sun-depth pass stays off so
    // preset edits never revalidate a whole scene of shadow render objects.
    shadows: false,
    terrain: { heightAt: terrain.heightAt, root: terrainRoot, size: terrain.meshExtent },
    trees: { scatter: { keepChance: 0.72, radius: 72, seed: 12, spacing: 12 }, settings: { size: 2.2 } },
    water: {
      level: terrain.waterLevel,
      passes: false,
      simulation: false,
      splashes: false,
    },
    weather: { preset: activePreset, seed: 73 },
  });

  world.weather.addEventListener('lightning', () => {
    elements.weatherStatus.textContent = 'Lightning strike — thunder event scheduled by distance';
  });
  world.weather.addEventListener('thunder', (event) => {
    elements.weatherStatus.textContent = `Thunder event · ${Math.round(event.distance)}m strike distance`;
  });

  let previousFrameTime = performance.now();
  renderer.setAnimationLoop((frameTime = performance.now()) => {
    const delta = Math.min(Math.max((frameTime - previousFrameTime) / 1000, 0), 0.1);
    previousFrameTime = frameTime;
    controls.update();
    world.update(delta);
    renderer.render(scene, camera);
    updateStatus();
    document.body.dataset.modelReady = 'true';
    document.body.dataset.weatherLabReady = 'true';
  });

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
  elements.rendererStatus.textContent = document.body.dataset.rendererBackend ?? 'WebGPU';
}

elements.transitionDuration.addEventListener('input', () => {
  elements.transitionValue.textContent = `${Number(elements.transitionDuration.value).toFixed(1)}s`;
});
elements.lightningTrigger.addEventListener('click', () => world?.weather?.triggerLightning());
elements.exportWeather.addEventListener('click', () => {
  const id = slug(elements.weatherName.value);
  downloadJson(serializeWeatherPresetDocument(id, { label: elements.weatherName.value, settings: draft }), `${id}.weather-preset.json`);
});
elements.importWeather.addEventListener('click', () => elements.weatherFile.click());
elements.weatherFile.addEventListener('change', async () => {
  const file = elements.weatherFile.files?.[0];
  if (!file) return;
  const result = parseWeatherPresetDocument(await file.text());
  if (!result.ok) {
    elements.weatherStatus.textContent = result.errors.join(' ');
    return;
  }
  registerWeatherPresetDocument(result.value, { overwrite: true });
  activePreset = result.value.id;
  draft = result.value.settings;
  elements.weatherName.value = result.value.label;
  world?.weather?.transitionTo(draft, { duration: Number(elements.transitionDuration.value) || 0 });
  renderConditions();
  renderFields();
  elements.weatherStatus.textContent = `Imported ${result.value.label}`;
});
elements.saveWeather.addEventListener('click', () => {
  const id = slug(elements.weatherName.value);
  const document = JSON.parse(serializeWeatherPresetDocument(id, { label: elements.weatherName.value, settings: draft }));
  const saved = JSON.parse(localStorage.getItem('toonlab.weatherPresets.v1') || '[]').filter((entry) => entry.id !== id);
  saved.push(document);
  localStorage.setItem('toonlab.weatherPresets.v1', JSON.stringify(saved));
  registerWeatherPresetDocument(document, { overwrite: true });
  activePreset = id;
  renderConditions();
  elements.weatherStatus.textContent = `Saved ${document.label} locally`;
});

for (const document of JSON.parse(localStorage.getItem('toonlab.weatherPresets.v1') || '[]')) {
  registerWeatherPresetDocument(document, { overwrite: true });
}
renderConditions();
renderGroups();
renderFields();
buildStage().catch((error) => {
  console.error('Weather Lab failed to start:', error);
  elements.weatherStatus.textContent = `Weather Lab failed: ${error.message}`;
  document.body.dataset.modelReady = 'error';
});
