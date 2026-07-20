// Tree Lab engine: the vanilla three.js half — scene, plant lifecycle,
// rebuild loop, live material applies, camera framing, GLB export, and the
// body-dataset flags the Playwright harness gates on. It consumes the
// designer store (subscribe + revision diffing) and never touches the DOM
// beyond its own canvas and body.dataset.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createPlantFromRecipe,
  deriveCanopyPalette,
  disposeExportGroup,
  prepareTreeForExport,
  recipeFromSettings,
  resolveVegetationShaderPreset,
  resolveCanopyColor,
  windOptionsFromSettings,
} from '../../../src/vegetation/index.js';
import { downloadGLB } from '../exporters.js';
import { mergeSketchIntoRecipe } from '../store/docUtils.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { createBarkMaterial } from './barkTextures.js';

const REBUILD_DEBOUNCE_MS = 80;

export function createTreeEngine({ mount = document.body, store, urlParams }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true; // no skinned MMD casters here — native shadows are safe on all backends
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5da4e8);
  scene.fog = new THREE.Fog(0xa9d7ea, 90, 240);

  // Node backends: TSL grass/foliage sample the shared sun-shadow pass for
  // scene-shadow reception (built-in materials keep native shadows).
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  const camera = new THREE.PerspectiveCamera(
    45, window.innerWidth / window.innerHeight, 0.1, 400);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sunDirection = [0.45, 0.75, 0.5];
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.position.set(sunDirection[0] * 40, sunDirection[1] * 40, sunDirection[2] * 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xe8f5ff, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xeaf6ff, 0xd4b678, 0.5);
  scene.add(hemi);

  // Double-sided so the world never vanishes if the camera grazes grade;
  // orbit is also clamped (below) to keep the eye above the ground.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 48).rotateX(-Math.PI / 2),
    new THREE.MeshToonMaterial({ color: 0x74c04b, side: THREE.DoubleSide }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // Never orbit below grade — under-ground views make roots/trees "float".
  controls.maxPolarAngle = Math.PI / 2 - 0.03;

  // Move sub-modes: what LEFT-drag does (middle = zoom, right = pan stay
  // constant, so every camera action is always reachable).
  const MOVE_MODE_BUTTONS = {
    pan: THREE.MOUSE.PAN,
    rotate: THREE.MOUSE.ROTATE,
    zoom: THREE.MOUSE.DOLLY,
  };
  // Idle default (tool 'orbit'): left-drag rotates, no chrome. Explicitly
  // selected Move (tool 'move'): left-drag follows the Pan/Rotate/Zoom
  // sub-mode from the options bar.
  let lastLeftMapping = null;
  store.subscribe(() => {
    const { moveMode, tool } = store.getState();
    const mapping = tool === 'move'
      ? (MOVE_MODE_BUTTONS[moveMode] ?? THREE.MOUSE.ROTATE)
      : THREE.MOUSE.ROTATE;
    if (mapping !== lastLeftMapping) {
      lastLeftMapping = mapping;
      controls.mouseButtons.LEFT = mapping;
    }
  });

  // ?bakedPreview=1 renders the GLB-export group beside the live plant — a
  // one-screenshot A/B of what leaves the tool vs what runs in-engine.
  const bakedPreviewEnabled = urlParams.get('bakedPreview') === '1';
  let bakedPreview = null;

  let plant = null;
  let rebuildCount = 0;
  let rebuildTimer = 0;
  const rebuildListeners = new Set();

  function applyLiveColor() {
    if (!plant) return;
    const { settings } = store.getState();
    const color = settings.color;
    const overrides = {};
    if (color.pinLit) overrides.lit = [...color.lit];
    if (color.pinShadow) overrides.shadow = [...color.shadow];
    if (color.pinCrown) overrides.crown = [...color.crown];
    const canopySpec = Array.isArray(color.canopy) ? [...color.canopy] : color.canopy;
    const palette = deriveCanopyPalette(
      resolveCanopyColor(canopySpec, settings.plant.seed), overrides);
    const uniforms = plant.canopyMesh.material.uniforms;
    uniforms.uLitColor.value.copy(palette.lit);
    uniforms.uShadowColor.value.copy(palette.shadow);
    uniforms.uCrownColor.value.copy(palette.crown);
  }

  function applyLiveWind() {
    if (!plant) return;
    const wind = windOptionsFromSettings(store.getState().settings);
    plant.setWind({
      direction: wind.windDirection,
      speed: wind.windSpeed,
      strength: wind.windStrength,
    });
  }

  function applyLiveStyle() {
    const { styleId } = store.getState();
    plant?.setVegetationShader(resolveVegetationShaderPreset(styleId));
    document.body.dataset.vegetationStyle = styleId;
  }

  function rebuild() {
    window.clearTimeout(rebuildTimer);
    const {
      animation, flowers, glbMode, leafShape, leafStyle, roots, settings, sketch, trunkProfile,
      woodDetails,
    } = store.getState();
    if (plant) {
      scene.remove(plant);
      plant.dispose();
    }
    const recipe = mergeSketchIntoRecipe(
      recipeFromSettings(settings), sketch,
      { animation, flowers, leafShape, leafStyle, roots, trunkProfile, woodDetails });
    plant = createPlantFromRecipe(recipe, {
      trunkMaterial: createBarkMaterial(store.getState().barkTexture, {
        height: settings.trunk.height,
      }),
    });
    plant.setSun({ direction: sunDirection, color: [1.0, 0.96, 0.86], sky: [0.72, 0.87, 1.0] });
    applyLiveStyle();
    applyLiveWind();
    scene.add(plant);
    if (bakedPreviewEnabled) {
      if (bakedPreview) {
        scene.remove(bakedPreview);
        disposeExportGroup(bakedPreview);
      }
      bakedPreview = prepareTreeForExport(plant, { foliageMode: glbMode });
      bakedPreview.position.x = -settings.plant.size * 4;
      scene.add(bakedPreview);
    }
    rebuildCount += 1;
    document.body.dataset.treeRebuildCount = String(rebuildCount);
    document.body.dataset.treeSeed = String(settings.plant.seed);
    document.body.dataset.treeCardCount =
      String((plant.canopyMesh.geometry.index?.count ?? 0) / 6);
    if (settings.skeleton.generator === 'drawn' && !sketch.branchSpines.length
      && settings.plant.type === 'tree') {
      store.actions.setStatus('Hand-drawn mode: use ✏️ Branch to draw the trunk up from the ground.');
    }
    for (const listener of [...rebuildListeners]) listener(plant);
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
  }

  // Initial camera framing; user orbiting is preserved across rebuilds.
  function frameCamera() {
    const { settings } = store.getState();
    const size = settings.plant.size;
    const eye = (settings.plant.type === 'bush' ? 0.9 : 1.75) * size;
    controls.target.set(0, eye, 0);
    camera.position.set(size * 1.2, eye + size * 0.4, 5.5 * size);
    controls.update();
  }

  // FNV-1a over both meshes' positions: cheap determinism fingerprint.
  function geometryHash() {
    let hash = 0x811c9dc5;
    const mix = (attribute) => {
      if (!attribute) return;
      const view = new Uint8Array(
        attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
      for (let i = 0; i < view.length; i += 1) {
        hash ^= view[i];
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    };
    mix(plant?.trunkMesh?.geometry.attributes.position);
    mix(plant?.canopyMesh?.geometry.attributes.position);
    return hash >>> 0;
  }

  async function exportGlb({ filename, mode }) {
    const bytes = await downloadGLB(plant, { filename, mode });
    document.body.dataset.treeExportBytes = String(bytes);
    return bytes;
  }

  // ---- store subscription: revisions drive rebuilds ------------------------
  let lastDoc = store.getState().docRevision;
  let lastLive = store.getState().liveRevision;
  let lastStyle = store.getState().styleId;
  store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== lastDoc) {
      lastDoc = state.docRevision;
      if (state.lastChange.immediate) rebuild();
      else scheduleRebuild();
      if (state.lastChange.reframe) frameCamera();
    }
    if (state.liveRevision !== lastLive) {
      lastLive = state.liveRevision;
      applyLiveColor();
      applyLiveWind();
    }
    if (state.styleId !== lastStyle) {
      lastStyle = state.styleId;
      applyLiveStyle();
    }
  });

  const frameListeners = new Set();

  async function start() {
    rebuild();
    frameCamera();
    // WebGPU backends boot asynchronously; the loop waits for init.
    await whenRendererReady(renderer);
    let firstFrame = true;
    const timer = new THREE.Timer();
    timer.connect(document);
    renderer.setAnimationLoop((timestamp) => {
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.05);
      plant?.update(delta);
      for (const listener of frameListeners) listener(delta);
      controls.update();
      sunShadowPass.update({ dynamic: true });
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        // Gates scripts/lab-probe.mjs and visual-check.mjs share with the labs.
        document.body.dataset.modelReady = 'true';
        document.body.dataset.treeDesignerReady = 'true';
      }
    });
  }

  return {
    ambient,
    camera,
    controls,
    exportGlb,
    frameCamera,
    hemi,
    sun,
    geometryHash,
    getPlant: () => plant,
    ground,
    onFrame: (listener) => {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    onRebuilt: (listener) => {
      rebuildListeners.add(listener);
      return () => rebuildListeners.delete(listener);
    },
    projectToScreen: (point) => {
      const projected = new THREE.Vector3(...point).project(camera);
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((1 - projected.y) / 2) * window.innerHeight,
      };
    },
    rebuild,
    renderer,
    scene,
    start,
  };
}
