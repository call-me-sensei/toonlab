// Grass Lab engine: a ground patch of StylizedGrassField instances. The
// preview mode chooses the planting — a single blade, a tuft, a patch, or a
// meadow — so blade shape reads at every scale. Blade-geometry settings
// rebuild the field (per-instance heights bake at construction); everything
// else is an authored asset value. The preview rig supplies current light,
// wind, cloud shadow, and interaction independently. The walk mannequin
// doubles as the grass push target, so blades part around it.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { StylizedGrassField } from '../../../src/vegetation/stylizedGrass.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  createWalkPreviewActions,
  installWalkPreviewController,
} from '../../shared/walkPreview.js';

export const GRASS_PREVIEW_MODES = Object.freeze([
  Object.freeze({ count: 1, id: 'blade', label: 'Blade', radius: 0 }),
  Object.freeze({ count: 14, id: 'tuft', label: 'Tuft', radius: 0.18 }),
  Object.freeze({ count: 900, id: 'patch', label: 'Patch', radius: 2.4 }),
  Object.freeze({ count: 6500, id: 'meadow', label: 'Meadow', radius: 8 }),
]);

const CAMERA_BY_MODE = Object.freeze({
  blade: { position: [0.5, 0.5, 0.9], target: [0, 0.35, 0] },
  meadow: { position: [7, 5, 9], target: [0, 0.4, 0] },
  patch: { position: [2.6, 1.8, 3.4], target: [0, 0.4, 0] },
  tuft: { position: [0.9, 0.8, 1.5], target: [0, 0.3, 0] },
});

// Deterministic placements per mode — the field must not reshuffle on every
// settings rebuild.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placementsForMode(mode) {
  const spec = GRASS_PREVIEW_MODES.find((entry) => entry.id === mode) ?? GRASS_PREVIEW_MODES[2];
  if (spec.id === 'blade') return [{ phase: 0.5, x: 0, y: 0, z: 0 }];
  const random = mulberry32(1337);
  const placements = [];
  for (let index = 0; index < spec.count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * spec.radius;
    placements.push({ x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius });
  }
  return placements;
}

export function createGrassLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x11151c);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const sun = new THREE.DirectionalLight(0xfff2dc, 1.2);
  sun.position.set(10, 16, 8);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xbcc8e0, 0.5);
  scene.add(ambient);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2c3a26, roughness: 0.95 }),
  );
  scene.add(ground);

  const timer = new THREE.Timer();
  timer.connect(document);
  const frameCallbacks = new Set();
  let grass = null;
  let disposed = false;
  // Retired fields dispose a couple frames later — destroying buffers the
  // renderer already submitted this frame trips WebGPU validation.
  const retired = [];

  // Walkable mannequin — also the grass push target so blades part.
  let mannequin = null;
  let mannequinLoading = false;
  let mixer = null;
  let walkActions = null;

  function onFrame(callback) {
    frameCallbacks.add(callback);
    return () => frameCallbacks.delete(callback);
  }

  function loadMannequin() {
    if (mannequin || mannequinLoading) return;
    mannequinLoading = true;
    new GLTFLoader().load('/characters/mannequin.glb', (gltf) => {
      mannequin = gltf.scene;
      mannequin.name = 'Walk mannequin';
      mannequin.position.set(1.2, 0, 1.2);
      mannequin.visible = store.getState().view.walkPreview;
      scene.add(mannequin);
      mixer = new THREE.AnimationMixer(mannequin);
      walkActions = createWalkPreviewActions({ clips: gltf.animations, mixer });
      grass?.setPushTarget?.(mannequin);
      mannequinLoading = false;
    }, undefined, () => {
      mannequinLoading = false;
      store.actions.setStatus('Mannequin model not available in this checkout.');
    });
  }

  function frameMode(mode) {
    const view = CAMERA_BY_MODE[mode] ?? CAMERA_BY_MODE.patch;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
  }

  // The scene rig pushes its light into the grass — sun direction from the
  // actual light, warm sun / cool sky tints scaled by the preview sliders.
  function applySceneLightToGrass() {
    if (!grass) return;
    const direction = sun.position.clone().normalize();
    const sunScale = Math.min(store.getState().view.sunIntensity ?? 1.2, 2.5) / 1.2;
    const ambientScale = Math.min(store.getState().view.ambientIntensity ?? 0.5, 1.2) / 0.5;
    grass.setSun({
      sky: [0.62 * ambientScale, 0.78 * ambientScale, 0.95 * ambientScale].map((v) => Math.min(v, 1)),
      color: [1.0 * sunScale, 0.96 * sunScale, 0.84 * sunScale].map((v) => Math.min(v, 1.4)),
      direction: [direction.x, direction.y, direction.z],
    });
  }

  function applySceneStateToGrass() {
    if (!grass) return;
    const { view } = store.getState();
    grass.setWind({
      direction: view.windDirection,
      gustFrequency: view.gustFrequency,
      gustSpeed: view.gustSpeed,
      speed: view.windSpeed,
      strength: view.windStrength,
    });
    grass.setCloudShadow({
      coverage: view.cloudShadowCoverage,
      scale: view.cloudShadowScale,
      strength: view.cloudShadowStrength,
      velocity: view.cloudShadowVelocity,
    });
    grass.setPushRadius(view.pushRadius);
  }

  function rebuildGrass() {
    const state = store.getState();
    if (grass) {
      scene.remove(grass);
      retired.push({ frames: 0, geometry: grass.geometry, material: grass.material });
    }
    const placements = placementsForMode(state.view.mode);
    grass = new StylizedGrassField({ ...state.settings, placements });
    if (mannequin) grass.setPushTarget?.(mannequin);
    scene.add(grass);
    applySceneLightToGrass();
    applySceneStateToGrass();
    store.actions.adoptEngineState({ bladeCount: grass.geometry.instanceCount });
    document.body.dataset.modelReady = 'true';
  }

  function resetCamera() {
    frameMode(store.getState().view.mode);
  }

  const engineHandle = { camera, controls, onFrame, renderer, scene };

  installWalkPreviewController({
    camera,
    controls,
    engine: engineHandle,
    getActions: () => walkActions,
    getEnabled: () => store.getState().view.walkPreview,
    getWalker: () => mannequin,
    groundY: 0,
  });

  let appliedRevision = store.getState().docRevision;
  let appliedMode = store.getState().view.mode;
  store.subscribe(() => {
    const state = store.getState();
    sun.intensity = state.view.sunIntensity ?? sun.intensity;
    ambient.intensity = state.view.ambientIntensity ?? ambient.intensity;
    applySceneLightToGrass();
    applySceneStateToGrass();
    if (state.view.mode !== appliedMode) {
      appliedMode = state.view.mode;
      rebuildGrass();
      frameMode(appliedMode);
    }
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      // Blade geometry bakes per instance — rebuild; everything else would
      // re-tune live, and a rebuild covers both simply and fast enough here.
      rebuildGrass();
    }
    if (state.view.walkPreview && !mannequin) loadMannequin();
    if (mannequin) mannequin.visible = state.view.walkPreview;
  });

  function animate(timestamp) {
    if (disposed) return;
    requestAnimationFrame(animate);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    if (store.getState().view.walkPreview) mixer?.update(delta);
    grass?.update?.(delta);
    for (const callback of frameCallbacks) callback(delta);
    controls.update();
    renderer.render(scene, camera);
    for (let index = retired.length - 1; index >= 0; index -= 1) {
      const entry = retired[index];
      entry.frames += 1;
      if (entry.frames > 3) {
        entry.geometry?.dispose?.();
        entry.material?.dispose?.();
        retired.splice(index, 1);
      }
    }
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  return {
    ...engineHandle,
    dispose() {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      timer.dispose();
      renderer.dispose?.();
    },
    resetCamera,
    async start() {
      await whenRendererReady(renderer);
      rebuildGrass();
      frameMode(store.getState().view.mode);
      requestAnimationFrame(animate);
    },
  };
}
