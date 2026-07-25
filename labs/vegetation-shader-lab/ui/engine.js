// Mixed-role validation stage for one VegetationShaderProfile. Geometry,
// albedo, wind, wetness, and snow are preview fixtures; only the style
// profile is applied through the semantic material contract.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  applyVegetationShader,
  StylizedFlower,
  StylizedFlowerField,
  StylizedGrassField,
  StylizedTree,
} from '../../../src/vegetation/index.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

export const VEGETATION_PREVIEW_MODES = Object.freeze([
  Object.freeze({ id: 'mixed', label: 'Mixed' }),
  Object.freeze({ id: 'grass', label: 'Grass' }),
  Object.freeze({ id: 'flower', label: 'Flower' }),
  Object.freeze({ id: 'tree', label: 'Tree' }),
]);

export const VEGETATION_PREVIEW_PALETTES = Object.freeze([
  Object.freeze({ id: 'natural', label: 'Natural' }),
  Object.freeze({ id: 'purple', label: 'Purple' }),
  Object.freeze({ id: 'autumn', label: 'Autumn' }),
  Object.freeze({ id: 'spectrum', label: '10 colors' }),
]);

const PALETTES = Object.freeze({
  natural: Object.freeze({
    flowerCenter: [0.98, 0.76, 0.2],
    flowerPetal: [1, 0.91, 0.94],
    grassBase: [0.22, 0.52, 0.2],
    grassTip: [0.62, 0.84, 0.3],
    ground: 0x283622,
    tree: [0.2, 0.56, 0.3],
  }),
  purple: Object.freeze({
    flowerCenter: [0.42, 0.9, 0.96],
    flowerPetal: [0.96, 0.66, 1],
    grassBase: [0.28, 0.12, 0.48],
    grassTip: [0.76, 0.38, 0.96],
    ground: 0x241f35,
    tree: [0.42, 0.2, 0.65],
  }),
  autumn: Object.freeze({
    flowerCenter: [0.38, 0.16, 0.07],
    flowerPetal: [1, 0.48, 0.2],
    grassBase: [0.4, 0.24, 0.08],
    grassTip: [0.88, 0.62, 0.16],
    ground: 0x3a2d20,
    tree: [0.82, 0.3, 0.08],
  }),
});

const SPECTRUM = Object.freeze([
  0xe34d59, 0xee8434, 0xe8ca3a, 0x6fbf48, 0x2abf8c,
  0x36a9d6, 0x426fe3, 0x7949d8, 0xb544cf, 0xe24f9a,
]);

function srgbFromHex(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function discPlacements(count, radius, center = [0, 0]) {
  const random = mulberry32(4109 + Math.round(center[0] * 17 + center[1] * 31));
  return Array.from({ length: count }, () => {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius;
    return {
      x: center[0] + Math.cos(angle) * distance,
      y: 0,
      z: center[1] + Math.sin(angle) * distance,
    };
  });
}

function flowerPlacements() {
  return discPlacements(28, 1.2, [2.2, 0.4]).map((placement, index) => ({
    ...placement,
    headHeight: 0.28 + (index % 4) * 0.035,
    size: 0.075 + (index % 3) * 0.012,
  }));
}

export function createVegetationMaterialLabEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x11151c);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5da4e8);
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 180);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  const sunDirection = new THREE.Vector3(0.45, 0.75, 0.5).normalize();
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
  sun.position.copy(sunDirection).multiplyScalar(24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcce4ff, 0x6a563f, 0.65));
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

  const groundMaterial = new THREE.MeshToonMaterial({ color: PALETTES.natural.ground });
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2),
    groundMaterial,
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const timer = new THREE.Timer();
  timer.connect(document);
  const frameCallbacks = new Set();
  const retired = [];
  let vegetationRoot = null;
  let grassGroup = null;
  let flowerGroup = null;
  let treeGroup = null;
  let vegetationObjects = [];
  let appliedRevision = -1;
  let appliedPalette = null;
  let appliedViewMode = null;
  let disposed = false;

  function frameMode(mode = store.getState().view.viewMode) {
    const views = {
      flower: { position: [5.5, 3, 6.5], target: [1.7, 0.9, 0] },
      grass: { position: [6.2, 3.4, 7.2], target: [0, 0.35, 0] },
      mixed: { position: [8.5, 5.4, 10.5], target: [0, 1.25, 0] },
      tree: { position: [5.8, 3.8, 7.8], target: [-1.6, 1.7, 0] },
    };
    const view = views[mode] ?? views.mixed;
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
  }

  function paletteFor(id) {
    return PALETTES[id] ?? PALETTES.natural;
  }

  function addGrassFields(group, paletteId, profile) {
    if (paletteId === 'spectrum') {
      SPECTRUM.forEach((hex, index) => {
        const base = srgbFromHex(hex).map((channel) => channel * 0.55);
        const tip = srgbFromHex(hex);
        const angle = (index / SPECTRUM.length) * Math.PI * 2;
        const center = [Math.cos(angle) * 3.2, Math.sin(angle) * 3.2];
        const field = new StylizedGrassField({
          baseColor: base,
          placements: discPlacements(220, 0.75, center),
          tipColor: tip,
          vegetationShader: profile,
          windStrength: 0.12,
        });
        group.add(field);
        vegetationObjects.push(field);
      });
      return;
    }
    const palette = paletteFor(paletteId);
    const field = new StylizedGrassField({
      baseColor: palette.grassBase,
      bladeHeightRange: [0.22, 0.55],
      placements: discPlacements(3200, 5.6),
      tipColor: palette.grassTip,
      vegetationShader: profile,
      windStrength: 0.12,
    });
    group.add(field);
    vegetationObjects.push(field);
  }

  function buildVegetation() {
    const state = store.getState();
    const palette = paletteFor(state.view.palette);
    const previousObjects = vegetationObjects;
    const nextRoot = new THREE.Group();
    nextRoot.name = 'VegetationShaderValidationStage';
    vegetationObjects = [];

    grassGroup = new THREE.Group();
    grassGroup.name = 'GrassRoleStage';
    addGrassFields(grassGroup, state.view.palette, state.settings);

    treeGroup = new THREE.Group();
    treeGroup.name = 'TreeRoleStage';
    const tree = new StylizedTree({
      canopyColor: palette.tree,
      seed: 7,
      size: 1.35,
      vegetationShader: state.settings,
    });
    tree.position.set(-2, 0, 0);
    treeGroup.add(tree);
    vegetationObjects.push(tree);

    flowerGroup = new THREE.Group();
    flowerGroup.name = 'FlowerRoleStage';
    const plant = new StylizedFlower({
      headColor: palette.flowerPetal,
      seed: 13,
      size: 1.25,
      species: state.view.palette === 'autumn' ? 'sunflower' : 'daisy',
      vegetationShader: state.settings,
    });
    plant.position.set(2.2, 0, -0.6);
    const field = new StylizedFlowerField({
      centerColor: palette.flowerCenter,
      petalColor: palette.flowerPetal,
      placements: flowerPlacements(),
      vegetationShader: state.settings,
      windStrength: 0.12,
    });
    flowerGroup.add(plant, field);
    vegetationObjects.push(plant, field);

    nextRoot.add(grassGroup, treeGroup, flowerGroup);
    scene.add(nextRoot);
    if (vegetationRoot) {
      scene.remove(vegetationRoot);
      retired.push({ frames: 0, root: vegetationRoot, objects: previousObjects });
    }
    vegetationRoot = nextRoot;
    groundMaterial.color.setHex(palette.ground);
    applyViewVisibility();
    applyWorldState();
    applyProfile();
    document.body.dataset.modelReady = 'true';
  }

  function applyViewVisibility() {
    const mode = store.getState().view.viewMode;
    if (!grassGroup || !flowerGroup || !treeGroup) return;
    grassGroup.visible = mode === 'mixed' || mode === 'grass';
    flowerGroup.visible = mode === 'mixed' || mode === 'flower';
    treeGroup.visible = mode === 'mixed' || mode === 'tree';
  }

  function applyWorldState() {
    const { snowCover, wetness, windStrength } = store.getState().view;
    const sunOptions = {
      color: [1, 0.94, 0.82],
      direction: [sunDirection.x, sunDirection.y, sunDirection.z],
      sky: [0.62, 0.78, 0.95],
    };
    for (const object of vegetationObjects) {
      object.setWind?.({ direction: [1, 0.35], speed: 1.1, strength: windStrength });
      object.setSun?.(sunOptions);
      object.setSurfaceWeather?.({ snowCover, wetness });
    }
  }

  function applyProfile() {
    if (!vegetationRoot) return;
    const report = applyVegetationShader(vegetationRoot, store.getState().settings);
    const coverage = {
      applied: report.applied,
      matched: report.matched,
      unsupported: report.unsupported.length,
      writes: report.writes,
    };
    store.actions.adoptEngineState({ coverage });
    document.body.dataset.shaderMatched = String(report.matched);
    document.body.dataset.shaderUnsupported = String(report.unsupported.length);
  }

  function disposeObject(object) {
    object?.dispose?.();
  }

  store.subscribe(() => {
    const state = store.getState();
    if (state.view.palette !== appliedPalette) {
      appliedPalette = state.view.palette;
      buildVegetation();
    }
    if (state.view.viewMode !== appliedViewMode) {
      appliedViewMode = state.view.viewMode;
      applyViewVisibility();
    }
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      applyProfile();
    }
    applyWorldState();
  });

  function animate(timestamp) {
    if (disposed) return;
    requestAnimationFrame(animate);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    for (const object of vegetationObjects) object.update?.(delta);
    for (const callback of frameCallbacks) callback(delta);
    controls.update();
    sunShadowPass.update();
    renderer.render(scene, camera);
    for (let index = retired.length - 1; index >= 0; index -= 1) {
      const entry = retired[index];
      entry.frames += 1;
      if (entry.frames > 3) {
        for (const object of entry.objects) disposeObject(object);
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
    camera,
    controls,
    dispose() {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      sunShadowPass.dispose();
      for (const object of vegetationObjects) disposeObject(object);
      timer.dispose();
      renderer.dispose?.();
    },
    onFrame(callback) {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    renderer,
    resetCamera() {
      frameMode();
    },
    scene,
    async start() {
      await whenRendererReady(renderer);
      appliedPalette = store.getState().view.palette;
      appliedViewMode = store.getState().view.viewMode;
      appliedRevision = store.getState().docRevision;
      buildVegetation();
      frameMode();
      animate();
    },
  };
}
