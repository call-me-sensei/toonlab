// Matched P18 grass comparison. P18 remains the frozen scene/reference side.
// The ToonLab side imports the public package entry and resolves geometry,
// material behavior, and LODs exclusively from the package's independently
// authored procedural recipe.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS,
  createCallMeSenseiGrassField,
} from '@call-me-sensei/toonlab/grass';
import {
  createP18ReferenceRenderer,
  createP18ShaderPreviewScene,
} from '../../labs/shared/p18/referenceScene.js';
import { createP18PreviewSettings } from '../../labs/shared/p18/previewStyles.js';
import { whenRendererReady } from '../../labs/shared/rendererFactory.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const modeTitle = document.querySelector('#mode-title');
const modeDescription = document.querySelector('#mode-description');
const placementCount = document.querySelector('#placement-count');
const bladeCount = document.querySelector('#blade-count');
const triangleCount = document.querySelector('#triangle-count');
const groundColor = document.querySelector('#ground-color');
const grassClass = document.querySelector('#grass-class');
const lodCounts = document.querySelector('#lod-counts');
const assetPaths = document.querySelector('#asset-paths');

const renderer = await createP18ReferenceRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
stage.appendChild(renderer.domElement);
await whenRendererReady(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2_000_000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.03;

const reference = await createP18ShaderPreviewScene({
  authoredComponent: 'grass',
  camera,
  renderer,
  scene,
});
const previewSettings = createP18PreviewSettings();
reference.applyComponentStyles(previewSettings);
reference.applyComponentVisibility(previewSettings);

const sourceGrass = reference.environmentContent.grass;
if (!sourceGrass?.isInstancedMesh) {
  throw new Error('The accepted P18 clone did not expose its SM_Grass1 AutoGrass target.');
}

function extractSourcePlacements(instancedMesh) {
  instancedMesh.updateWorldMatrix(true, false);
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const placements = [];
  for (let index = 0; index < instancedMesh.count; index += 1) {
    instancedMesh.getMatrixAt(index, local);
    world.multiplyMatrices(instancedMesh.matrixWorld, local);
    world.decompose(position, rotation, scale);
    normal.set(0, 1, 0).applyQuaternion(rotation).normalize();
    forward.set(1, 0, 0).applyQuaternion(rotation).normalize();
    placements.push({
      forward: forward.toArray(),
      matrix: world.clone(),
      normal: normal.toArray(),
      scale: (scale.x + scale.y + scale.z) / 3,
      x: position.x,
      y: position.y,
      yaw: Math.atan2(forward.z, forward.x),
      z: position.z,
    });
  }
  return placements;
}

const placements = extractSourcePlacements(sourceGrass);
const packageVariant = CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS.primary;
const packageAssetPaths = [
  `generated:${packageVariant.id}:lod0`,
  `generated:${packageVariant.id}:lod1`,
  `generated:${packageVariant.id}:lod2`,
];
const clumpGrass = await createCallMeSenseiGrassField({
  placements,
  variant: packageVariant.id,
});
clumpGrass.name = 'P18 clone — packaged Call Me Sensei grass clumps';
clumpGrass.userData.grassParityEvidence = {
  assetPaths: packageAssetPaths,
  changedComponent: 'grass only',
  factory: 'createCallMeSenseiGrassField',
  grassClass: clumpGrass.constructor.name,
  placementAuthority: 'P18 SM_Grass1 AutoGrass instance matrices',
  publicEntry: '@call-me-sensei/toonlab/grass',
  variant: packageVariant.id,
};
scene.add(clumpGrass);

reference.applyTime(13);
// Freeze a warmed source-material frame so switching modes is a deterministic
// geometry/material comparison rather than two different wind samples.
for (let step = 0; step < 10; step += 1) reference.update(0.1);

const sourceTrianglesPerClump = Math.floor(
  (sourceGrass.geometry.index?.count ?? sourceGrass.geometry.getAttribute('position').count) / 3,
);
const compositionPosition = camera.position.clone();
const compositionTarget = reference.focus.clone();
const closeDirection = compositionPosition.clone().sub(compositionTarget).normalize();
const closePlacement = placements.reduce((best, placement) => {
  const point = new THREE.Vector3().setFromMatrixPosition(placement.matrix);
  const distance = point.distanceTo(compositionPosition);
  const score = Math.abs(distance - 8);
  return !best || score < best.score ? { point, score } : best;
}, null);
const closeTarget = closePlacement.point.clone().add(new THREE.Vector3(0, 0.3, 0));
const closePosition = closeTarget.clone().addScaledVector(closeDirection, 5.4);
closePosition.y = Math.max(closePosition.y, closeTarget.y + 1.35);

let activeMode = 'clump';
let activeView = 'composition';

function visibleClumpTriangles() {
  return clumpGrass.lodMeshes.reduce((total, mesh) => total
    + mesh.geometry.instanceCount * mesh.geometry.userData.grassClump.triangleCount, 0);
}

function syncStats() {
  const visibleLodCounts = clumpGrass.lodMeshes.map((mesh) => mesh.geometry.instanceCount);
  const visibleTriangles = visibleClumpTriangles();
  placementCount.textContent = placements.length.toLocaleString();
  grassClass.textContent = clumpGrass.constructor.name;
  lodCounts.textContent = visibleLodCounts.join(' / ');
  assetPaths.textContent = 'package · generated recipe v3 · LOD0–2';
  if (activeMode === 'source') {
    modeTitle.textContent = 'P18 SM_Grass1';
    modeDescription.textContent = 'Accepted source LOD0 mesh and retained MI_Grass material.';
    bladeCount.textContent = (placements.length * 22).toLocaleString();
    triangleCount.textContent = (placements.length * sourceTrianglesPerClump).toLocaleString();
    groundColor.textContent = 'MI_Grass · RVT mip 4';
  } else {
    modeTitle.textContent = 'ToonLab Clump';
    modeDescription.textContent = 'Package-generated Call Me Sensei curved-ribbon clump and shader; P18 supplies only the controlled scene and placement set.';
    bladeCount.textContent = clumpGrass.bladeCount.toLocaleString();
    triangleCount.textContent = visibleTriangles.toLocaleString();
    groundColor.textContent = 'CallMeSenseiGrassMaterial · shared ground field';
  }
  document.body.dataset.comparisonMode = activeMode;
  document.body.dataset.comparisonView = activeView;
  document.body.dataset.clumpLodCounts = clumpGrass.lodMeshes
    .map((mesh) => mesh.geometry.instanceCount).join(',');
  document.body.dataset.grassAssetPaths = packageAssetPaths.join(',');
  document.body.dataset.grassBladeCount = String(clumpGrass.bladeCount);
  document.body.dataset.grassClass = clumpGrass.constructor.name;
  document.body.dataset.grassFactory = 'createCallMeSenseiGrassField';
  document.body.dataset.grassPlacementCount = String(placements.length);
  document.body.dataset.grassTriangleCount = String(visibleTriangles);
  document.body.dataset.grassVisibleLodCounts = visibleLodCounts.join(',');
  document.body.dataset.grassPublicEntry = '@call-me-sensei/toonlab/grass';
}

function setMode(mode) {
  activeMode = mode === 'source' ? 'source' : 'clump';
  sourceGrass.visible = activeMode === 'source';
  clumpGrass.visible = activeMode === 'clump';
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === activeMode);
  });
  syncStats();
}

function setView(view) {
  activeView = view === 'close' ? 'close' : 'composition';
  if (activeView === 'composition') {
    camera.position.copy(compositionPosition);
    controls.target.copy(compositionTarget);
  } else {
    camera.position.copy(closePosition);
    controls.target.copy(closeTarget);
  }
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  controls.update();
  clumpGrass.updateLods(camera);
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === activeView);
  });
  syncStats();
}

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  controls.update();
  clumpGrass.update(delta, camera);
  renderer.render(scene, camera);
  syncStats();
});

setView('composition');
setMode('clump');
status.textContent = 'Ready · first-party grass generated through the public package entry';
document.body.dataset.modelReady = 'true';
document.body.dataset.referenceScene = 'accepted-p18-outdoor-spire-clone';
document.body.dataset.toonlabAssetAuthority = 'toonlab-first-party-procedural-recipe-v2';

window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  clumpGrass.dispose();
  reference.dispose();
  renderer.dispose();
}, { once: true });
