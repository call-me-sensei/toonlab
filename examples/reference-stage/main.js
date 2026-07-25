// Reference stage — the So Stylized assets alone on a neutral backdrop,
// arranged like the pack's own showcase render. This is the tight loop the
// world doesn't give us: make each asset look EXACTLY like the marketing
// shot here first; only then does it earn a place in the world.
//
// Two modes, HUD-switchable (or ?shader=1):
//   Studio PBR — plain three.js materials under soft showcase lighting.
//     This is "what the meshes/textures really are" with no ToonLab code.
//   Our Shader — the same assets converted by the environment pipeline.
//     Any difference between the two modes is OUR rendering gap, isolated
//     from terrain, grass, fog, and post.
//
// Assets come from the gitignored assets-local/sostylized export (dev-only).

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { loadModelAsset } from '@call-me-sensei/toonlab/loaders';
import {
  applyEnvironmentShader,
  createEnvironmentSunShadowPass,
  resolveEnvironmentPreset,
} from '@call-me-sensei/toonlab/environment';
import {
  assembleLodTemplate,
  autoUnitScale,
  buildTextureIndex,
  createTextureLoaderCache,
  fixupConvertedFoliage,
  MANIFEST_URL,
  prepareReferenceMaterials,
  toServedUrl,
} from '../verdant-world/referenceLayer.js';

const CATEGORY_ORDER = ['cliffs', 'rocks', 'trees', 'bushes', 'flowers', 'grass'];
const PER_CATEGORY = 8;

async function main() {
  const params = new URLSearchParams(location.search);
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL: params.get('renderer') === 'webgl' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  // The showcase backdrop: desaturated blue-gray, nothing to distract.
  scene.background = new THREE.Color(0x6f7890);
  scene.fog = new THREE.Fog(new THREE.Color(0x6f7890), 120, 420);

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.2, 800);

  // Soft showcase lighting: bright cool skylight + one gentle warm sun.
  // This is deliberately close to a UE asset-overview level, NOT our world
  // look — the point is seeing the assets as authored.
  const hemi = new THREE.HemisphereLight(0xe8eef8, 0x8f96a8, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
  sun.position.set(46, 70, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-40, 30, -30);
  scene.add(fill);

  // ?ground=1: nothing but THEIR ground texture on a flat plane under the
  // studio light — the "get the ground right before anything else" mode.
  const groundOnly = params.get('ground') === '1';
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x848b9e, roughness: 1 });
  if (groundOnly) {
    const grassTexture = new THREE.TextureLoader().load('/assets-local/sostylized/textures/T_Grass1_BC.png');
    grassTexture.colorSpace = THREE.SRGBColorSpace;
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(600 / 9, 600 / 9); // their tile reads ~9 m in UE
    grassTexture.anisotropy = 8;
    groundMaterial.map = grassTexture;
    groundMaterial.color.set(0xffffff); // texture speaks for itself
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Load the export manifest and stage a showcase grid ----
  let manifest = null;
  try {
    const response = await fetch(MANIFEST_URL);
    if (response.ok) manifest = await response.json();
  } catch { /* handled below */ }
  if (!manifest?.meshes?.length) {
    document.getElementById('loading').textContent =
      'No exported assets found — run the UE export into assets-local/sostylized first.';
    return;
  }
  const textureIndex = buildTextureIndex(manifest);
  const loadTexture = createTextureLoaderCache();

  const byCategory = new Map();
  if (groundOnly) manifest.meshes = [];
  for (const entry of manifest.meshes) {
    const category = entry.file.split('/sostylized/')[1]?.split('/')[0] ?? 'misc';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(entry);
  }

  const stageRoot = new THREE.Group();
  stageRoot.name = 'ReferenceStage';
  scene.add(stageRoot);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  let rowZ = -30;
  for (const category of CATEGORY_ORDER.filter((c) => byCategory.has(c))) {
    let cursorX = -46;
    let rowDepth = 6;
    for (const entry of byCategory.get(category).slice(0, PER_CATEGORY)) {
      try {
        const asset = await loadModelAsset(toServedUrl(entry.file));
        let object = asset.root;
        const unitScale = autoUnitScale(object);
        prepareReferenceMaterials(object, textureIndex, loadTexture);
        object = assembleLodTemplate(object);
        object.scale.setScalar(unitScale);
        box.setFromObject(object);
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 24) object.scale.multiplyScalar(24 / maxDim);
        box.setFromObject(object);
        box.getSize(size);
        const radius = Math.max(size.x, size.z) / 2;
        cursorX += radius + 1.6;
        object.position.set(cursorX, -box.min.y, rowZ);
        cursorX += radius + 1.6;
        rowDepth = Math.max(rowDepth, size.z + 4);
        stageRoot.add(object);
      } catch (error) {
        console.warn('[referenceStage] failed', entry.file, error.message);
      }
    }
    rowZ += rowDepth + 5;
  }

  // ---- Shader mode: same stage, converted by our environment pipeline ----
  let shadowPass = null;
  let shaderMode = false;
  const enableShaderMode = async () => {
    if (shaderMode) return;
    shaderMode = true;
    await applyEnvironmentShader(stageRoot, {
      ...resolveEnvironmentPreset('call_me_sensei', 'exteriorDay'),
      bakeVertexAo: false,
    });
    fixupConvertedFoliage(stageRoot);
    // TSL environment materials never read three's native shadow maps — the
    // dedicated sun-shadow pass must run or everything renders fully lit.
    shadowPass = createEnvironmentSunShadowPass({ renderer, scene });
    document.getElementById('mode-plain').dataset.active = 'false';
    document.getElementById('mode-shader').dataset.active = 'true';
  };
  document.getElementById('mode-shader').addEventListener('click', enableShaderMode);
  document.getElementById('mode-plain').addEventListener('click', () => {
    if (shaderMode) location.search = ''; // conversion is one-way; reload is honest
  });

  // ---- Camera: showcase overview orbit ----
  const orbit = {
    dist: Number(params.get('dist')) || 95,
    dragging: false,
    pitch: Number(params.get('pitch')) || 0.42,
    yaw: Number(params.get('yaw')) || Math.PI / 2,
  };
  const target = new THREE.Vector3(0, 6, 2);
  renderer.domElement.addEventListener('pointerdown', (event) => {
    renderer.domElement.setPointerCapture(event.pointerId);
    orbit.dragging = true;
  });
  window.addEventListener('pointerup', () => { orbit.dragging = false; });
  window.addEventListener('pointermove', (event) => {
    if (!orbit.dragging) return;
    orbit.yaw -= event.movementX * 0.005;
    orbit.pitch = Math.min(Math.max(orbit.pitch + event.movementY * 0.004, 0.05), 1.35);
  });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    orbit.dist = Math.min(Math.max(orbit.dist + event.deltaY * 0.06, 12), 240);
  }, { passive: false });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.getElementById('loading').remove();
  document.body.dataset.stageReady = 'true';
  let totalFrames = 0;

  if (params.get('shader') === '1') await enableShaderMode();

  renderer.setAnimationLoop(() => {
    totalFrames += 1;
    if (totalFrames % 30 === 0) document.body.dataset.frames = String(totalFrames);
    const horizontal = Math.cos(orbit.pitch) * orbit.dist;
    camera.position.set(
      target.x + Math.cos(orbit.yaw) * horizontal,
      target.y + Math.sin(orbit.pitch) * orbit.dist,
      target.z + Math.sin(orbit.yaw) * horizontal,
    );
    camera.lookAt(target);
    shadowPass?.update();
    renderer.render(scene, camera);
  });
}

main().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${error.message}`;
});
