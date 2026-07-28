// Rock Catalog Preview — shows one internal catalog variation standing in the
// accepted P18 outdoor environment.
//
// This exists so a catalog rock can be judged under the same sun, sky and
// ground as the rock shader lab, rather than under an approximation of them in
// the review grid.
//
// It deliberately does NOT touch the P18 reference scene. That module is the
// source-parity harness: it asserts referenceCheckpoint and
// referenceMaterialMatch on the document, and its whole job is proving the
// shader reproduces the licensed source material. Injecting catalog rocks into
// that path would leave those acceptance flags set over a scene that is no
// longer a parity run. Instead this page consumes the scene's public API —
// createP18ShaderPreviewScene returns rockRoot — swaps the geometry, and
// re-applies the shader with the catalog's own textures. The harness is used,
// never modified, and the parity flags are cleared below.
//
//   /rock-catalog-preview/?id=cliff_corner_0005

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import catalogPreviewConfig from './material-config.generated.js';
import {
  applyRockShader,
  createDefaultRockShaderTextureSet,
} from '../../src/rock-shader/index.js';
import { whenRendererReady } from '../shared/rendererFactory.js';
import {
  createP18ReferenceRenderer,
  createP18ShaderPreviewScene,
} from '../shared/p18/referenceScene.js';

const VARIATION_ROOT = '/assets-local/rock-reference-variations';

const status = document.getElementById('status');
const setStatus = (text) => { if (status) status.textContent = text; };

function fail(message) {
  setStatus(message);
  throw new Error(message);
}

const params = new URLSearchParams(window.location.search);
const requestedId = params.get('id') ?? '';
const requestedCandidate = params.get('candidate') ?? '';
const preset = params.get('preset') ?? 'call_me_sensei';
const viewMode = params.get('view') === 'inspect' ? 'inspect' : 'environment';
// Catalog exports and the P18 stage both use ToonLab world metres. Preserve
// authored size by default so a hand-sized fragment cannot masquerade as a
// landmark cliff. `scale=fit` remains available as an explicit material
// close-up that fills the reference rock's footprint. A numeric value (for
// example `scale=0.1`) is an explicit semantic-size diagnostic; it never
// changes the exported catalog mesh.
const requestedScale = params.get('scale');
const numericScale = Number(requestedScale);
const scaleMode = requestedScale === 'fit'
  ? 'fit'
  : requestedScale !== null && Number.isFinite(numericScale) && numericScale > 0
    ? 'multiplier'
    : 'authored';

// Diagnostic isolation. The page changes two independent things about the
// reference stage — the geometry and the material — so when something looks
// wrong there is no way to tell which is responsible without being able to
// apply them one at a time.
//
//   both       catalog geometry + catalog material (default)
//   geometry   catalog geometry, reference material untouched
//   material   reference spire geometry, catalog material
//   reference  neither; the untouched stage, as a control
const mode = ['both', 'geometry', 'material', 'reference'].includes(params.get('mode'))
  ? params.get('mode')
  : 'both';
const swapGeometry = mode === 'both' || mode === 'geometry';
const applyMaterial = mode === 'both' || mode === 'material';

setStatus('loading catalog data…');
const config = catalogPreviewConfig;
const entry = config.entries.find((item) => item.variationId === requestedId)
  ?? config.entries[0];
if (!entry) fail('Catalog preview data contains no entries.');
const availableTextureCandidates = entry.textureCandidates
  ?? (config.textureCandidates ?? []).filter((candidate) => (
    entry.textureCandidateIds?.includes(candidate.id)
  ));
// A specifically selected review candidate may be the entry's normal preview
// material. Do not automatically promote every ready-for-review candidate:
// texture work is intentionally tested on one rock before its recipe is
// propagated. Keep the old base available as an explicit diagnostic control.
const useCatalogBaseTexture = requestedCandidate === 'catalog-base';
const activeCandidateId = useCatalogBaseTexture
  ? ''
  : requestedCandidate || entry.defaultTextureCandidateId || '';
const textureCandidate = activeCandidateId
  ? availableTextureCandidates.find((candidate) => candidate.id === activeCandidateId)
  : null;
if (activeCandidateId && !textureCandidate) {
  fail(`Texture candidate "${activeCandidateId}" is not available for ${entry.variationId}.`);
}
const activeTextures = textureCandidate
  ? { ...entry.textures, ...textureCandidate.textures }
  : entry.textures;

const renderer = await createP18ReferenceRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);
await whenRendererReady(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2_000_000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.03;

setStatus('building reference environment…');
const reference = await createP18ShaderPreviewScene({
  authoredComponent: 'rock',
  camera,
  renderer,
  scene,
});
controls.target.copy(reference.focus);
controls.update();

// This page is not a parity run. Clear the harness's acceptance markers so a
// catalog preview can never be mistaken for — or scraped as — source parity.
delete document.body.dataset.referenceCheckpoint;
delete document.body.dataset.referenceMaterialMatch;
document.body.dataset.rockCatalogPreview = entry.variationId;
if (textureCandidate) document.body.dataset.rockTextureCandidate = textureCandidate.id;

/**
 * Local-space bounds of the reference rock, measured through each mesh's own
 * transform.
 *
 * Unioning raw geometry boxes is wrong here: the stage's meshes carry their own
 * matrices, so the raw boxes are in a different space than the geometry that
 * replaces them. Getting this wrong rescales the rock, and because the shader
 * projects its textures in world units at a scale of 64, an undersized rock
 * samples a sliver of one tile and the surface smears into soft blotches.
 */
function stageBounds(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    object.geometry.computeBoundingBox();
    box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return box;
}

/** World-space size, for reporting what the stage expects versus what it got. */
function worldSize(root) {
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
}

setStatus(`loading ${entry.label}…`);
const gltf = await new GLTFLoader().loadAsync(`${VARIATION_ROOT}/${entry.file}`);
let source = null;
gltf.scene.traverse((object) => {
  if (object.isMesh && (!source || /_LOD0$/.test(object.name))) {
    source = source && !/_LOD0$/.test(object.name) ? source : object;
  }
});
if (!source) fail(`${entry.label} has no renderable geometry.`);

// Place the catalog rock at the reference footprint's centre and ground plane.
// Authored scale is the semantic review: fragments stay fragments and cliffs
// stay cliffs. The optional fit mode is a deliberate texture close-up.
//
// Placement is done in world space and then pushed back through the target
// mesh's inverse world matrix, because the geometry is assigned to a mesh that
// still carries its own transform. Assigning world coordinates directly would
// apply that transform a second time.
const stageBefore = worldSize(reference.rockRoot);
const target = stageBounds(reference.rockRoot);

let host = null;
reference.rockRoot.traverse((object) => { if (!host && object.isMesh) host = object; });
if (!host) fail('Reference stage exposed no rock mesh to replace.');

source.updateMatrixWorld(true);
const geometry = source.geometry.clone();
geometry.applyMatrix4(source.matrixWorld);
geometry.computeBoundingBox();
const from = geometry.boundingBox;
const fromSize = from.getSize(new THREE.Vector3());
const targetSize = target.getSize(new THREE.Vector3());
// The reference fixture is deliberately inset by 22% of its height. Its
// bounding-box minimum is therefore below the terrain and cannot be reused as
// the ground plane for a differently sized catalog asset.
const groundY = target.min.y + targetSize.y * 0.22;
const scale = scaleMode === 'fit'
  ? targetSize.y / Math.max(fromSize.y, 1e-6)
  : scaleMode === 'multiplier'
    ? numericScale
    : 1;
const fromCentre = from.getCenter(new THREE.Vector3());
const targetCentre = target.getCenter(new THREE.Vector3());
geometry.translate(-fromCentre.x, -from.min.y, -fromCentre.z);
geometry.scale(scale, scale, scale);
geometry.translate(targetCentre.x, groundY, targetCentre.z);
geometry.applyMatrix4(new THREE.Matrix4().copy(host.matrixWorld).invert());
geometry.computeBoundingBox();
geometry.computeBoundingSphere();

let swapped = 0;
if (swapGeometry) {
  reference.rockRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry = swapped === 0 ? geometry : geometry.clone();
    object.visible = swapped === 0;
    swapped += 1;
  });
  if (swapped === 0) fail('Reference stage exposed no rock mesh to replace.');
}

setStatus('loading catalog textures…');
const loader = new THREE.TextureLoader();
const loadTexture = (file, srgb) => new Promise((done) => {
  loader.load(`${config.textureRoot}/${file}`, (texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (file.includes('topmask')) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.flipY = false;
    }
    done(texture);
  }, undefined, () => done(null));
});

const loaded = await Promise.all(
  Object.entries(activeTextures).map(async ([slot, spec]) => [slot, await loadTexture(spec.file, spec.srgb)]),
);
const resolved = Object.fromEntries(loaded.filter(([, value]) => value));
const textures = {
  ...createDefaultRockShaderTextureSet(),
  ...resolved,
  // The shared portable defaults include procedural normal maps. Catalog
  // textures deliberately omit them: reintroducing those defaults here would
  // recreate the circular dents and invalid-TBN black faces this review is
  // meant to catch.
  rockNormal: resolved.rockNormal ?? null,
  stylizedNormal: resolved.stylizedNormal ?? null,
  sandNormal: resolved.sandNormal ?? null,
  // The default set's top mask is procedural noise — a portable stand-in for a
  // texture most rocks do not have. Left in place it is sampled as if it were
  // real: it modulates the top-layer blend and, through
  // finalSmoothness = rockSmoothness * (1 - topMask), paints soft dark blotches
  // across bare rock that read as broken shadowing. A null slot is the white
  // default the shader wants, and is what the reference scene passes too.
  topMask: resolved.topMask ?? null,
};

// The catalog's own settings, resolved once in toonlab-pro and shipped as data.
// Nothing about the catalog's material rules is reimplemented here.
if (applyMaterial) {
  applyRockShader(reference.rockRoot, { preset, ...entry.settings }, {
    name: 'Rock catalog preview',
    textures,
  });
}

if (swapGeometry && viewMode === 'inspect') {
  reference.applyComponentVisibility({
    componentVisibility: {
      flowers: false,
      grass: false,
      manufacturedProps: false,
      tree: false,
    },
  });
  // Texture QA must not turn a deep overhang into a false "bad texture"
  // result. Keep the fixed sun direction, but remove rock self-shadowing and
  // add a modest diffuse fill only in this explicit close-up view. The normal
  // environment view remains untouched for final lighting/placement review.
  reference.rockRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  const inspectionFill = new THREE.AmbientLight(0xffffff, 1.1);
  inspectionFill.name = 'Rock catalog texture-inspection fill';
  scene.add(inspectionFill);
  const placedBounds = geometry.boundingBox.clone().applyMatrix4(host.matrixWorld);
  const placedSize = placedBounds.getSize(new THREE.Vector3());
  const placedCentre = placedBounds.getCenter(new THREE.Vector3());
  const distance = Math.max(placedSize.length() * 1.65, 1.4);
  const direction = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(placedCentre);
  camera.position.copy(placedCentre).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.updateProjectionMatrix();
  controls.update();
}

setStatus([
  entry.label,
  entry.variationId,
  entry.geology,
  entry.maskFile ? 'masked' : null,
  textureCandidate ? `candidate=${textureCandidate.id}` : null,
  useCatalogBaseTexture ? 'candidate=catalog-base' : null,
  scaleMode === 'fit'
    ? 'scale=fit'
    : scaleMode === 'multiplier'
      ? `scale=${numericScale}`
      : 'authored-scale',
  viewMode === 'inspect' ? 'view=inspect' : null,
  mode === 'both' ? null : `mode=${mode}`,
].filter(Boolean).join(' · '));

// Dev handle for inspecting how the catalog rock sits on the reference stage.
// stageBefore/stageAfter should agree: the catalog rock is meant to occupy the
// same volume the environment was built around, and the shader's world-space
// projection makes any mismatch show up as smeared or overly fine detail.
window.__rockPreview = {
  camera,
  config,
  entry,
  reference,
  scene,
  stageAfter: worldSize(reference.rockRoot).toArray(),
  stageBefore: stageBefore.toArray(),
  sourceSize: fromSize.toArray(),
  scaleApplied: scale,
  scaleMode,
  viewMode,
  textureCandidate,
  textures,
};

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  reference.update(delta);
  controls.update();
  renderer.render(scene, camera);
});

// The catalog audit advances through hundreds of entries in one browser tab.
// Explicitly release the renderer on navigation; otherwise each page leaves a
// WebGPU context behind until garbage collection, eventually stalling the next
// preview at "loading catalog data…".
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  controls.dispose();
  renderer.dispose();
}, { once: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
