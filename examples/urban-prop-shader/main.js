import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  applyUrbanPropPalette,
  classifyUrbanPropSurface,
  createUrbanAnimePropMaterial,
  createUrbanPropShaderControls,
} from './urbanPropMaterial.js?v=material-response-v50';

const PASTEL_TARGET_STRENGTH = 0.10;
const SHADOW_PASTEL_TARGET_STRENGTH = 0.80;

const TEST_MODELS = Object.freeze({
  dumpster: {
    cameraScale: { single: 1, split: 1 },
    fitWidth: 2.9,
    label: 'dumpster',
    rotationY: -0.24,
    splitOffset: 1.85,
    targetY: 1.25,
    url: '/assets-local/props/buildings/dumpster_free_game_asset_agustin_honnun.glb',
  },
  streetcar: {
    cameraScale: { single: 0.8, split: 0.88 },
    fitWidth: 3.7,
    label: 'streetcar',
    rotationY: -0.24,
    splitOffset: 2.35,
    targetY: 0.72,
    url: '/assets-local/props/buildings/broken_old_streetcar.glb',
  },
  beach: {
    cameraScale: { single: 0.74, split: 0.86 },
    fitWidth: 4.25,
    label: 'beach props',
    rotationY: -0.24,
    splitOffset: 2.65,
    targetY: 0.7,
    url: '/assets-local/props/buildings/old_beach_props.glb',
  },
  'bus-station': {
    cameraScale: { single: 0.82, split: 0.9 },
    fitWidth: 3.8,
    label: 'bus station',
    rotationY: -0.24,
    splitOffset: 2.4,
    targetY: 1,
    url: '/assets-local/props/buildings/bus_station.glb',
  },
});

const LIGHTING_PRESETS = Object.freeze({
  dawn: Object.freeze({
    background: 0xb7b5d2,
    backdrop: 0xd0b9ca,
    curb: 0x655f70,
    exposure: 1.02,
    fill: Object.freeze({
      color: 0x7799e8,
      intensity: 0.32,
    }),
    fog: 0xb7b5d2,
    ground: 0x858487,
    hemisphere: Object.freeze({
      ground: 0x665760,
      intensity: 0.64,
      sky: 0xc8d2f2,
    }),
    response: 0xb4c5ea,
    rim: Object.freeze({
      color: 0xff8fbd,
      intensity: 0.2,
    }),
    sun: Object.freeze({
      color: 0xffad72,
      intensity: 1.38,
      position: Object.freeze([-6.5, 3.2, 5.5]),
    }),
  }),
  day: Object.freeze({
    background: 0x9bc9e8,
    backdrop: 0xa8d4ed,
    curb: 0x607983,
    exposure: 1.04,
    fill: Object.freeze({
      color: 0xb9dcff,
      intensity: 0.14,
    }),
    fog: 0x9bc9e8,
    ground: 0x88a6a3,
    hemisphere: Object.freeze({
      ground: 0x78866e,
      intensity: 0.74,
      sky: 0xe6f5ff,
    }),
    response: 0xaacbe0,
    rim: Object.freeze({
      color: 0xffffff,
      intensity: 0.12,
    }),
    sun: Object.freeze({
      color: 0xfff8ea,
      intensity: 2.05,
      position: Object.freeze([-5.5, 9.5, 6.5]),
    }),
  }),
  sunset: Object.freeze({
    background: 0xc37e78,
    backdrop: 0x9c6672,
    curb: 0x584b58,
    exposure: 1.02,
    fill: Object.freeze({
      color: 0x638dff,
      intensity: 0.34,
    }),
    fog: 0xc37e78,
    ground: 0x766966,
    hemisphere: Object.freeze({
      ground: 0x5b474a,
      intensity: 0.58,
      sky: 0xc8a3b8,
    }),
    response: 0x8da5dd,
    rim: Object.freeze({
      color: 0xff65a9,
      intensity: 0.28,
    }),
    sun: Object.freeze({
      color: 0xff783c,
      intensity: 1.72,
      position: Object.freeze([-7, 2.4, 5.2]),
    }),
  }),
  night: Object.freeze({
    background: 0x0b1632,
    backdrop: 0x111c3b,
    curb: 0x27324a,
    exposure: 1.08,
    fill: Object.freeze({
      color: 0xa35fff,
      intensity: 0.42,
    }),
    fog: 0x0b1632,
    ground: 0x35465c,
    hemisphere: Object.freeze({
      ground: 0x20283b,
      intensity: 0.5,
      sky: 0x688bc6,
    }),
    response: 0x5c84bf,
    rim: Object.freeze({
      color: 0x47ddff,
      intensity: 0.48,
    }),
    sun: Object.freeze({
      color: 0x9bc8ff,
      intensity: 0.84,
      position: Object.freeze([-4.5, 7.5, 4.5]),
    }),
  }),
});

function cloneForComparison(source) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

function fitModelToMeters(root, widthMeters = 2.9) {
  root.updateWorldMatrix(true, true);
  const initialBox = new THREE.Box3().setFromObject(root);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(initialSize.x, initialSize.z, 0.001);
  root.scale.multiplyScalar(widthMeters / horizontalSpan);
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(root);
}

function stylizeModel(root, controls) {
  const meshes = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    meshes.push(object);
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const styledMaterials = sourceMaterials.map((source) => (
      createUrbanAnimePropMaterial(source, {
        controls,
        surface: classifyUrbanPropSurface(object, source),
      })
    ));
    object.material = Array.isArray(object.material)
      ? styledMaterials
      : styledMaterials[0];
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x080b18,
    opacity: 0.5,
    transparent: true,
  });
  const silhouetteMaterial = new THREE.MeshBasicMaterial({
    color: 0x070a14,
    depthWrite: false,
    side: THREE.BackSide,
  });
  silhouetteMaterial.name = 'Locked urban · silhouette ink';
  silhouetteMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = position + normal * 0.014;',
    );
  };
  silhouetteMaterial.customProgramCacheKey = () => 'locked-urban-silhouette-v2';

  for (const mesh of meshes) {
    const silhouette = new THREE.Mesh(mesh.geometry, silhouetteMaterial);
    silhouette.name = `${mesh.name || 'mesh'} · silhouette ink`;
    silhouette.renderOrder = 1;
    silhouette.userData.urbanLookControl = 'silhouetteInkEnabled';
    silhouette.visible = controls.silhouetteInkEnabled.value > 0.5;
    mesh.add(silhouette);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 48),
      edgeMaterial,
    );
    edges.name = `${mesh.name || 'mesh'} · selective crease ink`;
    edges.renderOrder = 2;
    edges.userData.urbanLookControl = 'edgeInkEnabled';
    edges.visible = controls.edgeInkEnabled.value > 0.5;
    mesh.add(edges);
  }
}

function addBenchmarkStage(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 16),
    new THREE.MeshStandardMaterial({
      color: 0x697783,
      metalness: 0,
      roughness: 0.93,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 9),
    new THREE.MeshBasicMaterial({ color: 0x101425 }),
  );
  backdrop.position.set(0, 4.5, -4.1);
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.26, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x22283a, roughness: 0.9 }),
  );
  curb.position.set(0, 0.13, -2.5);
  curb.castShadow = true;
  curb.receiveShadow = true;
  scene.add(curb);

  return { backdrop, curb, ground };
}

async function main() {
  const params = new URLSearchParams(location.search);
  // This benchmark deliberately uses the classic renderer. The locked look is
  // a conventional toon shader now, so its output does not depend on WebGPU,
  // Three's node-material backend, or a browser-specific GPU implementation.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b17);
  scene.fog = new THREE.Fog(new THREE.Color(0x090b17), 18, 42);

  const camera = new THREE.PerspectiveCamera(
    34,
    window.innerWidth / window.innerHeight,
    0.05,
    100,
  );
  const cameraPositions = {
    single: new THREE.Vector3(5.05, 3.05, 6.05),
    split: new THREE.Vector3(6.7, 3.7, 7.8),
  };
  camera.position.copy(cameraPositions.split);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 1.25, 0);

  // Neutral key/fill preserve authored hue. The optional shader rim owns the
  // cyan/magenta accent, so source identity is never globally recolored.
  const hemisphere = new THREE.HemisphereLight(0xdce9f4, 0x353948, 1.05);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff4df, 3.25);
  sun.position.set(-5.5, 9.5, 6.5);
  sun.target.position.set(0, 0.8, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -3;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xdce8ff, 0.68);
  fill.position.set(6, 4, -5);
  const cyanRim = new THREE.DirectionalLight(0xffffff, 0.38);
  cyanRim.position.set(-6, 3.5, -4);
  scene.add(fill, cyanRim);
  const stage = addBenchmarkStage(scene);

  function applyLighting(requestedLighting) {
    const lighting = Object.hasOwn(LIGHTING_PRESETS, requestedLighting)
      ? requestedLighting
      : 'day';
    const preset = LIGHTING_PRESETS[lighting];

    scene.background.setHex(preset.background);
    scene.fog.color.setHex(preset.fog);
    renderer.toneMappingExposure = preset.exposure;
    stage.backdrop.material.color.setHex(preset.backdrop);
    stage.curb.material.color.setHex(preset.curb);
    stage.ground.material.color.setHex(preset.ground);

    hemisphere.color.setHex(preset.hemisphere.sky);
    hemisphere.groundColor.setHex(preset.hemisphere.ground);
    hemisphere.intensity = preset.hemisphere.intensity;

    sun.color.setHex(preset.sun.color);
    sun.intensity = preset.sun.intensity;
    sun.position.fromArray(preset.sun.position);
    fill.color.setHex(preset.fill.color);
    fill.intensity = preset.fill.intensity;
    cyanRim.color.setHex(preset.rim.color);
    cyanRim.intensity = preset.rim.intensity;
    shaderControls.materialResponseColor.value.setHex(preset.response);

    document.body.dataset.lighting = lighting;
    document.querySelectorAll('[data-lighting-button]').forEach((button) => {
      button.dataset.active = String(button.dataset.lightingButton === lighting);
    });
  }

  const shaderControls = createUrbanPropShaderControls('source');
  const loader = new GLTFLoader();
  const preparedModels = new Map();
  const styledRoots = new Set();
  const loading = document.getElementById('loading');
  let original = null;
  let styled = null;
  let currentModel = null;
  let currentMode = params.get('mode') ?? 'split';
  let modelRequest = 0;

  function frameCamera(mode) {
    const view = mode === 'split' ? 'split' : 'single';
    const spec = TEST_MODELS[currentModel] ?? TEST_MODELS.dumpster;
    camera.position
      .copy(cameraPositions[view])
      .multiplyScalar(spec.cameraScale[view]);
    controls.target.set(0, spec.targetY, 0);
    controls.update();
  }

  function setMode(mode) {
    const resolved = ['original', 'split', 'styled'].includes(mode) ? mode : 'split';
    currentMode = resolved;
    document.body.dataset.mode = resolved;
    if (original && styled) {
      const splitOffset = TEST_MODELS[currentModel]?.splitOffset ?? 1.85;
      const originalBaseX = original.userData.benchmarkBaseX ?? 0;
      const styledBaseX = styled.userData.benchmarkBaseX ?? 0;
      original.visible = resolved !== 'styled';
      styled.visible = resolved !== 'original';
      original.position.x = originalBaseX + (resolved === 'split' ? -splitOffset : 0);
      styled.position.x = styledBaseX + (resolved === 'split' ? splitOffset : 0);
    }
    frameCamera(resolved);
    document.querySelectorAll('[data-mode-button]').forEach((button) => {
      button.dataset.active = String(button.dataset.modeButton === resolved);
    });
  }

  async function prepareModel(modelId) {
    if (preparedModels.has(modelId)) return preparedModels.get(modelId);

    const spec = TEST_MODELS[modelId];
    const preparation = (async () => {
      const gltf = await loader.loadAsync(spec.url);
      const sourceModel = cloneForComparison(gltf.scene);
      const lockedModel = cloneForComparison(gltf.scene);
      fitModelToMeters(sourceModel, spec.fitWidth);
      fitModelToMeters(lockedModel, spec.fitWidth);
      sourceModel.userData.benchmarkBaseX = sourceModel.position.x;
      lockedModel.userData.benchmarkBaseX = lockedModel.position.x;
      sourceModel.rotation.y = lockedModel.rotation.y = spec.rotationY;
      stylizeModel(lockedModel, shaderControls);
      styledRoots.add(lockedModel);
      return { original: sourceModel, styled: lockedModel };
    })().catch((error) => {
      preparedModels.delete(modelId);
      throw error;
    });

    preparedModels.set(modelId, preparation);
    return preparation;
  }

  async function setModel(requestedModel) {
    const modelId = Object.hasOwn(TEST_MODELS, requestedModel)
      ? requestedModel
      : 'dumpster';
    if (currentModel === modelId) return;

    const request = ++modelRequest;
    const spec = TEST_MODELS[modelId];
    loading.hidden = false;
    loading.textContent = `Loading the ${spec.label} benchmark…`;
    document.body.dataset.modelLoading = modelId;

    try {
      const pair = await prepareModel(modelId);
      if (request !== modelRequest) return;

      if (original) scene.remove(original);
      if (styled) scene.remove(styled);
      original = pair.original;
      styled = pair.styled;
      currentModel = modelId;
      scene.add(original, styled);
      setMode(currentMode);

      document.body.dataset.model = modelId;
      delete document.body.dataset.modelLoading;
      document.querySelectorAll('[data-model-button]').forEach((button) => {
        button.dataset.active = String(button.dataset.modelButton === modelId);
      });
      loading.hidden = true;
    } catch (error) {
      if (request !== modelRequest) return;
      delete document.body.dataset.modelLoading;
      loading.hidden = true;
      if (!original || !styled) throw error;
      console.error(`Failed to load ${modelId}`, error);
    }
  }

  document.querySelectorAll('[data-model-button]').forEach((button) => {
    button.addEventListener('click', () => {
      setModel(button.dataset.modelButton).catch((error) => {
        console.error(error);
      });
    });
  });
  document.querySelectorAll('[data-mode-button]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.modeButton));
  });
  document.querySelectorAll('[data-palette-button]').forEach((button) => {
    button.addEventListener('click', () => {
      const palette = button.dataset.paletteButton;
      applyUrbanPropPalette(shaderControls, palette);
      document.querySelectorAll('[data-palette-button]').forEach((candidate) => {
        candidate.dataset.active = String(candidate === button);
      });
    });
  });
  document.querySelectorAll('[data-lighting-button]').forEach((button) => {
    button.addEventListener('click', () => applyLighting(button.dataset.lightingButton));
  });

  function setBlueTreatment(treatment) {
    const pastelStrength = treatment === 'pastel'
      ? PASTEL_TARGET_STRENGTH
      : 0;
    const shadowPastelStrength = treatment === 'pastel'
      ? SHADOW_PASTEL_TARGET_STRENGTH
      : 0;
    shaderControls.pastelPaletteEnabled.value = 1;
    shaderControls.pastelStrength.value = pastelStrength;
    shaderControls.shadowPastelStrength.value = shadowPastelStrength;
    document.querySelectorAll('[data-look-button]').forEach((button) => {
      button.dataset.active = String(button.dataset.lookButton === treatment);
    });
    const pastelLayerButton = document.querySelector(
      '[data-layer-button="pastelPaletteEnabled"]',
    );
    if (pastelLayerButton) {
      pastelLayerButton.dataset.active = 'true';
    }
    const pastelInput = document.querySelector('[data-control="pastelStrength"]');
    if (pastelInput) {
      pastelInput.value = String(pastelStrength);
      pastelInput.parentElement.querySelector('output').value =
        pastelStrength.toFixed(2);
    }
    const shadowPastelInput = document.querySelector(
      '[data-control="shadowPastelStrength"]',
    );
    if (shadowPastelInput) {
      shadowPastelInput.value = String(shadowPastelStrength);
      shadowPastelInput.parentElement.querySelector('output').value =
        shadowPastelStrength.toFixed(2);
    }
  }

  function syncBlueTreatmentCheckpoint() {
    const pastelStrength = shaderControls.pastelStrength.value;
    const shadowPastelStrength = shaderControls.shadowPastelStrength.value;
    document.querySelectorAll('[data-look-button]').forEach((button) => {
      const isRoyal = button.dataset.lookButton === 'royal'
        && Math.abs(pastelStrength) < 0.005
        && Math.abs(shadowPastelStrength) < 0.005;
      const isPastel = button.dataset.lookButton === 'pastel'
        && Math.abs(pastelStrength - PASTEL_TARGET_STRENGTH) < 0.005
        && Math.abs(
          shadowPastelStrength - SHADOW_PASTEL_TARGET_STRENGTH
        ) < 0.005;
      button.dataset.active = String(isRoyal || isPastel);
    });
  }

  document.querySelectorAll('[data-look-button]').forEach((button) => {
    button.addEventListener('click', () => {
      setBlueTreatment(button.dataset.lookButton);
    });
  });
  document.querySelectorAll('[data-layer-button]').forEach((button) => {
    button.addEventListener('click', () => {
      const control = shaderControls[button.dataset.layerButton];
      if (!control) {
        button.disabled = true;
        console.warn(
          `Shader layer control "${button.dataset.layerButton}" is unavailable.`,
        );
        return;
      }
      const enabled = control.value <= 0.5;
      control.value = enabled ? 1 : 0;
      button.dataset.active = String(enabled);
      if (button.dataset.layerButton === 'pastelPaletteEnabled') {
        document.querySelectorAll('[data-look-button]').forEach((candidate) => {
          candidate.dataset.active = 'false';
        });
      }
      styledRoots.forEach((root) => {
        root.traverse((object) => {
          if (object.userData.urbanLookControl === button.dataset.layerButton) {
            object.visible = enabled;
          }
        });
      });
    });
  });
  document.querySelectorAll('[data-control]').forEach((input) => {
    const output = input.parentElement.querySelector('output');
    const control = shaderControls[input.dataset.control];
    if (!control) {
      input.disabled = true;
      output.value = '—';
      console.warn(
        `Shader value control "${input.dataset.control}" is unavailable.`,
      );
      return;
    }
    const update = () => {
      const value = Number(input.value);
      control.value = value;
      output.value = value.toFixed(2);
      if (
        input.dataset.control === 'pastelStrength'
        || input.dataset.control === 'shadowPastelStrength'
      ) {
        syncBlueTreatmentCheckpoint();
      }
    };
    input.addEventListener('input', update);
    update();
  });

  setMode(currentMode);
  applyLighting(params.get('lighting') ?? 'day');
  setBlueTreatment('pastel');
  await setModel(params.get('model') ?? 'dumpster');
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'c') return;
    frameCamera(document.body.dataset.mode);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.body.dataset.stageReady = 'true';
  let renderFailed = false;
  renderer.setAnimationLoop(() => {
    if (renderFailed) return;
    try {
      controls.update();
      renderer.render(scene, camera);
    } catch (error) {
      renderFailed = true;
      renderer.setAnimationLoop(null);
      document.body.dataset.stageReady = 'error';
      console.error(error);
      const failure = document.createElement('div');
      failure.id = 'render-failure';
      failure.textContent =
        `The 3D renderer stopped: ${error.message}. Reload to retry with WebGL.`;
      document.body.appendChild(failure);
    }
  });
}

main().catch((error) => {
  console.error(error);
  document.body.dataset.stageReady = 'error';
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to load the benchmark: ${error.message}`;
});
