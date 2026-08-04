import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createCloudField } from '../../../src/cloud/index.js';
import { setEnvironmentState } from '../../../src/environment/environmentState.js';
import { AtmosphereSky, celestialDirectionForHour } from '../../../src/sky/index.js';
import { resolveWeatherPreset } from '../../../src/weather/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

function createReferenceVista() {
  const root = new THREE.Group();
  root.name = 'GenshinInspiredReferenceVista';

  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x49cbd2,
    emissive: 0x0c5963,
    emissiveIntensity: 0.18,
    metalness: 0.02,
    roughness: 0.76,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(5_000, 96), waterMaterial);
  water.name = 'ReferenceWater';
  water.rotation.x = -Math.PI / 2;
  water.position.y = -12;
  root.add(water);

  const terrainMaterials = new Map();
  const terrainMaterial = (color) => {
    if (!terrainMaterials.has(color)) {
      terrainMaterials.set(color, new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.94,
      }));
    }
    return terrainMaterials.get(color);
  };
  const addIsland = ({ color = 0x65b85b, rotation = 0, x, y = 0, z, sx, sz }) => {
    const island = new THREE.Mesh(
      new THREE.CircleGeometry(1, 18),
      terrainMaterial(color),
    );
    island.rotation.x = -Math.PI / 2;
    island.rotation.z = rotation;
    island.position.set(x, y, z);
    island.scale.set(sx, sz, 1);
    root.add(island);
    return island;
  };

  // Broad, deliberately simple shapes make the preview read as an aerial
  // anime-world vista without turning this shader lab into a terrain demo.
  addIsland({ color: 0x58ac54, rotation: -0.08, sx: 450, sz: 295, x: -85, z: -350 });
  addIsland({ color: 0x78c965, rotation: 0.21, sx: 275, sz: 135, x: -300, y: 1, z: -170 });
  addIsland({ color: 0x7bcc5e, rotation: -0.18, sx: 225, sz: 120, x: 260, y: 1.5, z: -290 });
  addIsland({ color: 0x65ba50, rotation: 0.12, sx: 155, sz: 84, x: 310, z: -520 });
  addIsland({ color: 0x72c865, rotation: -0.3, sx: 120, sz: 58, x: -430, z: -560 });
  addIsland({ color: 0x88ce69, rotation: 0.26, sx: 68, sz: 34, x: 80, y: 2, z: -35 });

  // Shallow lagoons break up the central land mass with the turquoise-water
  // rhythm visible in the Call Me Sensei reference target.
  addIsland({ color: 0x5cd4cf, rotation: -0.1, sx: 180, sz: 112, x: 55, y: 3, z: -235 });
  addIsland({ color: 0x75ded1, rotation: 0.22, sx: 78, sz: 50, x: -90, y: 3.5, z: -130 });

  const mountain = new THREE.Group();
  mountain.name = 'ReferenceMountain';
  mountain.position.set(0, 0, -465);
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x71819a,
    flatShading: true,
    roughness: 0.9,
  });
  const shadowRockMaterial = new THREE.MeshStandardMaterial({
    color: 0x4e687d,
    flatShading: true,
    roughness: 0.94,
  });
  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xeef8ff,
    emissive: 0xbddfff,
    emissiveIntensity: 0.08,
    flatShading: true,
    roughness: 0.82,
  });
  const peak = (x, z, radius, height, material = rockMaterial) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7, 3), material);
    mesh.position.set(x, height * 0.5, z);
    mesh.rotation.y = (x + z) * 0.017;
    mountain.add(mesh);
    return mesh;
  };
  peak(0, 0, 78, 255);
  peak(-62, 18, 62, 176, shadowRockMaterial);
  peak(62, 28, 52, 157);
  peak(-105, 58, 42, 118, shadowRockMaterial);
  peak(105, 55, 38, 105);
  peak(0, -2, 31, 92, snowMaterial).position.y = 209;
  peak(-59, 18, 20, 52, snowMaterial).position.y = 143;
  root.add(mountain);

  // Cool distant silhouettes provide aerial depth for judging horizon fog.
  const distantMaterial = new THREE.MeshBasicMaterial({ color: 0x78acc4, fog: true });
  [[-620, -930, 125, 175], [560, -1_020, 110, 150], [310, -1_180, 55, 90]].forEach(
    ([x, z, radius, height]) => {
      const distant = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), distantMaterial);
      distant.position.set(x, height * 0.5 - 8, z);
      root.add(distant);
    },
  );

  root.userData.dispose = () => {
    const geometries = new Set();
    const materials = new Set();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.filter(Boolean).forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };
  return root;
}

function weatheredColor(input, atmosphere, darkeningScale = 1) {
  const color = input.clone().multiply(new THREE.Color(...atmosphere.skyTint));
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color.lerp(new THREE.Color(luminance, luminance, luminance), atmosphere.skyDesaturation);
  return color.multiplyScalar(1 - atmosphere.skyDarkening * darkeningScale);
}

export function createSkyCloudLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb8e9f6, 0.00012);
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 80_000);
  camera.position.set(0, 285, 590);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 74, -390);
  controls.minDistance = 30;
  controls.maxDistance = 1_400;
  controls.maxPolarAngle = Math.PI * 0.49;
  const previewView = new URLSearchParams(location.search).get('view');
  if (previewView === 'cloud-side') {
    camera.position.set(350, 285, -930);
    controls.target.set(-435, 235, -930);
  } else if (previewView === 'cloud-oblique') {
    camera.position.set(250, 390, -300);
    controls.target.set(-435, 235, -930);
  }
  controls.update();

  const hemisphere = new THREE.HemisphereLight(0xdcecff, 0x688167, 1.5);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff3db, 3.2);
  sun.position.set(400, 800, 260);
  scene.add(sun);

  const referenceVista = createReferenceVista();
  scene.add(referenceVista);
  document.body.dataset.skyStyle = 'call_me_sensei';
  document.body.dataset.visualReference = 'genshin-inspired-open-world';
  document.body.dataset.cloudSourceMode = 'physical-cumulus-volume';

  const initial = store.getState();
  const sky = new AtmosphereSky({
    ...initial.documents.sky,
    hour: initial.view.hour,
    radius: 30_000,
  });
  scene.add(sky);
  let cloudField = null;
  let cloudSignature = '';
  let appliedSky = '';
  let appliedShader = '';
  let disposed = false;
  let previousTime = performance.now();
  let started = false;

  function retireCloudField(field) {
    if (!field) return;
    field.removeFromParent();
    const queue = renderer.backend?.device?.queue;
    if (!queue?.onSubmittedWorkDone) {
      field.dispose();
      return;
    }
    // The first boundary drains work already submitted. The second also
    // covers a command buffer that was encoded in the current frame but had
    // not reached Queue.submit when this replacement was requested.
    queue.onSubmittedWorkDone()
      .then(() => queue.onSubmittedWorkDone())
      .then(() => field.dispose())
      .catch(() => field.dispose());
  }

  function rebuildClouds(force = false) {
    const state = store.getState();
    const signature = JSON.stringify({
      composition: state.documents.cloudComposition,
      generation: state.generation.maps?.hashes ?? 'initial',
      renderMode: 'volume',
      seed: state.documents.cloudSource.seed,
    });
    if (!force && signature === cloudSignature) return;
    cloudSignature = signature;
    retireCloudField(cloudField);
    cloudField = createCloudField({
      composition: state.documents.cloudComposition,
      mapResolution: state.generation.status === 'ready' ? 192 : 128,
      renderMode: 'volume',
      shader: state.documents.cloudShader,
      sources: [state.documents.cloudSource],
      sunDirection: celestialDirectionForHour(state.view.hour),
      volumeResolution: 64,
    });
    scene.add(cloudField);
    document.body.dataset.cloudInstances = String(
      state.documents.cloudComposition.layers.reduce(
        (sum, layer) => sum + (layer.placements.length || layer.count),
        0,
      ),
    );
  }

  function applyState() {
    const state = store.getState();
    const skySignature = JSON.stringify(state.documents.sky);
    if (skySignature !== appliedSky) {
      sky.applySkyShaderProfile(state.documents.sky);
      appliedSky = skySignature;
    }
    const shaderSignature = JSON.stringify(state.documents.cloudShader.settings);
    if (shaderSignature !== appliedShader) {
      cloudField?.applyCloudShaderSettings(state.documents.cloudShader);
      appliedShader = shaderSignature;
    }
    rebuildClouds();
    const timeState = sky.setTime(state.view.hour);
    const direction = new THREE.Vector3(...timeState.sunDirection).normalize();
    const moonDirection = new THREE.Vector3(
      ...celestialDirectionForHour(state.view.hour, { moon: true }),
    ).normalize();
    const daylight = THREE.MathUtils.smoothstep(direction.y, -0.08, 0.12);
    const activeLightDirection = daylight >= 0.5 ? direction : moonDirection;
    const weather = resolveWeatherPreset(state.view.weather, { style: 'call_me_sensei' }).settings;
    const horizonColor = weatheredColor(
      new THREE.Color(...timeState.grade.horizonTint), weather.atmosphere, 0.7,
    );
    const zenithColor = weatheredColor(
      new THREE.Color(...timeState.grade.zenithTint), weather.atmosphere,
    );
    const groundFill = weatheredColor(
      new THREE.Color(...timeState.grade.belowHorizonTint), weather.atmosphere,
    );
    const lowSun = 1 - THREE.MathUtils.smoothstep(Math.abs(direction.y), 0.08, 0.58);
    const sunColor = new THREE.Color(1, 0.98, 0.92)
      .lerp(new THREE.Color(...timeState.grade.horizonGlowColor), lowSun)
      .multiply(new THREE.Color(...weather.atmosphere.sunTint));
    const moonColor = new THREE.Color(0.5, 0.65, 1)
      .multiply(new THREE.Color(...weather.atmosphere.skyTint));
    const overcast = THREE.MathUtils.clamp(
      (weather.atmosphere.cloudCoverage - 0.08) / 0.92, 0, 1,
    );
    setEnvironmentState({
      atmosphereFogColor: weather.atmosphere.fogColor ?? horizonColor,
      hour: state.view.hour,
      moonColor,
      moonDirection,
      moonIntensity: (1 - daylight) * 0.72,
      moonVisibility: 1 - daylight,
      sunColor,
      sunDirection: direction,
      sunIntensity: daylight * weather.atmosphere.sunIntensity,
      sunVisibility: daylight,
      weatherCloudFade: weather.atmosphere.skyDarkening,
      weatherOvercast: overcast,
      weatherPrecipitation: weather.precipitation.intensity,
      weatherThunder: weather.lightning.enabled ? 1 : 0,
      weatherWindMultiplier: weather.wind.speed,
    });
    if (scene.fog) scene.fog.color.copy(horizonColor);
    hemisphere.color.copy(zenithColor);
    hemisphere.groundColor.copy(groundFill);
    hemisphere.intensity = 1.5 * weather.atmosphere.ambientIntensity;
    sun.color.copy(daylight >= 0.5 ? sunColor : moonColor);
    sun.position.copy(activeLightDirection).multiplyScalar(1_000);
    sun.intensity = daylight * 3.2 * weather.atmosphere.sunIntensity
      + (1 - daylight) * 0.24 * weather.atmosphere.ambientIntensity;
    cloudField?.setSunDirection(activeLightDirection);
    document.body.dataset.previewTimeOfDay = state.view.hour.toFixed(2);
    document.body.dataset.previewWeather = state.view.weather;
  }

  const unsubscribe = store.subscribe(applyState);

  function frame(now = performance.now()) {
    if (disposed) return;
    const delta = Math.min(Math.max((now - previousTime) / 1_000, 0), 0.1);
    previousTime = now;
    const state = store.getState();
    if (state.view.autoCycle) store.actions.setView({ hour: state.view.hour + delta * 0.45 });
    controls.update();
    sky.update(delta, camera);
    cloudField?.update(delta);
    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);

  return {
    camera,
    controls,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);
      cloudField?.dispose();
      sky.dispose();
      referenceVista.userData.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    rebuildClouds: () => rebuildClouds(true),
    renderer,
    scene,
    async start() {
      if (started) return;
      started = true;
      await whenRendererReady(renderer);
      if (disposed) return;
      rebuildClouds(true);
      applyState();
      previousTime = performance.now();
      renderer.setAnimationLoop(frame);
      document.body.dataset.modelReady = 'true';
      document.body.dataset.skyCloudLabReady = 'true';
      store.actions.adoptEngineState({
        engineReady: true,
        status: 'Atmosphere and physical 3D cumulus hero cloud ready.',
      });
    },
  };
}
