// Three.js half of Water Lab: a focused water stage with three grounds —
// a gentle BEACH where swash runs visibly up and down the sand, the default
// SHORE basin stepping from beach to deep (see-through/depth-fade reference),
// and OPEN water with a small island and a floating CC0 ship (PolyHaven
// dutch_ship_medium from assets-local/, procedural toon boat fallback).
// Settings apply live from the store. Only a quality change rebuilds the
// surface (TSL quality defines bake at creation); ground changes re-bake the
// terrain attributes on the existing surface so animation and GPU pipelines
// survive the switch.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  createWaterShoreMaterial,
  updateWaterShoreMaterial,
  WaterKelpField,
  WaterRain,
  WaterSurface,
} from '../../../src/water/index.js';
import { createFauna } from '../../../src/fauna/index.js';
import { createRockDocument, meshDocument } from '../../../src/rockgen/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

// Keep every animated edge well beyond the normal orbit camera and the start
// of the horizon fog. Geometry density is capped independently below, so this
// fixes the visible 72 m tile boundary without tripling tessellation density.
const WATER_SIZE = 180;
const BALL_LIMIT = 10;
const SHIP_URL = '/assets-local/props/dutch_ship_medium/dutch_ship_medium_1k.gltf';
const FERN_URL = '/water-lab/cc0/quaternius/fern-1.glb';
const SAND_TEXTURE_URLS = Object.freeze({
  albedo: '/water-lab/cc0/polyhaven/coast-sand-01-diff-1k.jpg',
  arm: '/water-lab/cc0/polyhaven/coast-sand-01-arm-1k.jpg',
  normal: '/water-lab/cc0/polyhaven/coast-sand-01-nor-gl-1k.jpg',
});
// The ground plane spans 220 m; 64 repeats makes each scan tile about 3.4 m.
const SAND_TEXTURE_REPEAT = 64;
const CAMERA_MOUSE_BUTTONS = Object.freeze({
  pan: THREE.MOUSE.PAN,
  rotate: THREE.MOUSE.ROTATE,
  zoom: THREE.MOUSE.DOLLY,
});

// Deterministic hash noise (FallbackRockCluster pattern) — stage placements
// are identical on every load, so captures stay comparable.
function hash01(seed) {
  const n = Math.sin(seed * 91.7 + 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

// --- stage grounds -----------------------------------------------------------

// The swash showcase: rest waterline at z=0 (default level 0.36) on a planar
// 1:20 calibration profile. A nominal 10 m run-up produces irregular 8–10 m
// event peaks; each backwash hands its own endpoint into the next uprush.
export function beachBedHeight(x, z) {
  const slopePart = 0.36 + z * 0.05;
  // Keep the complete z=-10..10 measurement beach on one 1:20 plane. The
  // previous deep-water blend started at z=-3, so the nominal 10 m drain ran
  // into a 1:4 shelf and could never represent a symmetric 20 m excursion.
  // Only steepen after the measured beach has ended.
  const deepPart = -0.24 + (z + 12) * 0.18;
  const base = THREE.MathUtils.lerp(
    deepPart,
    slopePart,
    THREE.MathUtils.smoothstep(z, -14, -11),
  );
  // This is a calibration beach, so its cross-shore profile must stay
  // monotonic. The old 14 cm relief was four times deeper than the rendered
  // swash film and punched dry islands through it. Sand detail remains in the
  // material/lighting while the geometry gives an exact distance reference.
  return base;
}

// Beach on +Z rising ~2.2 m above the default waterline, ~5.6 m deep on -Z.
export function basinBedHeight(x, z) {
  const t = THREE.MathUtils.smoothstep(z, -16, 12);
  const base = THREE.MathUtils.lerp(-5.6, 2.2, t);
  const swell = 0.4 * Math.sin(x * 0.32 + 1.7) * Math.cos(z * 0.21) * (1 - t * 0.55);
  return base + swell;
}

// Open water: deep everywhere plus one small island — the only land, so
// ocean/storm swell reads as a real body of water (and still has one shore
// to break against).
export function openBedHeight(x, z) {
  const dx = x + 11;
  const dz = z + 13;
  const island = 10.5 * Math.exp(-(dx * dx + dz * dz) / (2 * 6 * 6));
  return -7.5 + 0.4 * Math.sin(x * 0.18) * Math.cos(z * 0.2) + island;
}

export const WATER_LAB_STAGES = Object.freeze([
  Object.freeze({ id: 'beach', label: 'Beach (swash)' }),
  Object.freeze({ id: 'shore', label: 'Shore basin' }),
  Object.freeze({ id: 'open', label: 'Open water (ship)' }),
]);

// Which ground a preset wants: shallow/river presets demo depth against the
// basin, coast lives on the swash beach, ocean/storm are open water.
export const STAGE_BY_PRESET = Object.freeze({
  calm: 'shore',
  coast: 'beach',
  lake: 'shore',
  mirror: 'shore',
  ocean: 'open',
  river: 'shore',
  storm: 'open',
});

const STAGE_DEFINITIONS = {
  beach: {
    bed: beachBedHeight,
    boat: false,
    camera: { position: [4, 6.5, 21], target: [0, 0.2, 3] },
    // Keep vegetation behind the breaker so it cannot visually split the
    // surf transition into a second system.
    kelpBand: [-26, -13],
    fernPatches: [
      { count: 5, radius: 3.2, scale: 0.9, seed: 181, x: -7.5, z: -18 },
      { count: 5, radius: 3.6, scale: 1.0, seed: 182, x: 6.5, z: -21 },
    ],
    rockSpots: [
      { scale: 1.15, seed: 81, x: -4.5, z: 6.5 },
      { scale: 0.9, seed: 82, x: 6.2, z: 3.2 },
      { scale: 1.5, seed: 83, x: 1.5, z: -4.5 },
    ],
  },
  shore: {
    bed: basinBedHeight,
    boat: false,
    camera: { position: [12, 6.5, 19], target: [-1, 0.3, -5] },
    kelpBand: [-14, -2],
    fernPatches: [
      { count: 5, radius: 2.8, scale: 0.9, seed: 171, x: -7.5, z: -5.5 },
      { count: 6, radius: 3.5, scale: 1.05, seed: 172, x: 5.5, z: -9.5 },
      { count: 4, radius: 2.6, scale: 0.8, seed: 173, x: -2.5, z: -14 },
    ],
    rockSpots: [
      { scale: 1.6, seed: 71, x: 5.5, z: 4.8 },
      { scale: 1.3, seed: 72, x: -3.2, z: -0.8 },
      { scale: 1.8, seed: 73, x: 4.2, z: -7.2 },
      { scale: 2.2, seed: 74, x: -7.0, z: -12.5 },
    ],
  },
  open: {
    bed: openBedHeight,
    boat: true,
    // Zoomed out: the swell should read as a body of water, not a pond.
    camera: { position: [20, 11, 30], target: [0, 0.5, -4] },
    kelpBand: null,
    fernPatches: [
      { count: 5, radius: 2.8, scale: 1.0, seed: 191, x: -3.5, z: -13 },
      { count: 5, radius: 2.8, scale: 0.9, seed: 192, x: -18.5, z: -12.5 },
      { count: 4, radius: 3.2, scale: 1.1, seed: 193, x: 4.5, z: -4 },
    ],
    // Dress the islet's shore so it reads as land, not a sand blob.
    rockSpots: [
      { scale: 1.5, seed: 91, x: -8.2, z: -10.8 },
      { scale: 1.1, seed: 92, x: -13.6, z: -15.6 },
      { scale: 0.85, seed: 93, x: -9.4, z: -15.2 },
    ],
  },
};

function buildBedMesh(waterLevel, bed, material) {
  // Well past the water tile: with the horizon fog, ground beyond the water
  // edge fades into the sky instead of reading as a bald cut-off wedge.
  const size = WATER_SIZE + 40;
  const geometry = new THREE.PlaneGeometry(size, size, 120, 120);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const sand = new THREE.Color(0.87, 0.78, 0.57);
  const shallows = new THREE.Color(0.62, 0.6, 0.45);
  const rock = new THREE.Color(0.17, 0.24, 0.27);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = bed(x, z);
    positions.setY(i, height);
    const depth = waterLevel - height;
    if (depth <= 0.25) {
      // Author a dry base only. The shared persistent shoreline field owns
      // inundation, moisture, sheen, and stranded foam at runtime, so the
      // exposed beach no longer snaps between a static dark stripe and water.
      color.copy(sand);
    } else if (depth < 2.2) {
      color.copy(shallows).lerp(sand, 1 - (depth - 0.25) / 1.95);
    } else {
      color.copy(rock).lerp(shallows, Math.max(0, 1 - (depth - 2.2) / 3));
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

// See-through test rocks (rockgen river boulders) stepping down the ground so
// refraction, depth fade, and caustics can be judged at known depths. They are
// lab gauges rather than authored hero props: mesh one deterministic boulder
// once, then vary its proportions and rotation. Regenerating 3–4 complete
// rockgen documents on every Ground selection was the remaining input stall.
let sharedDepthRockGeometry = null;
function getSharedDepthRockGeometry() {
  if (sharedDepthRockGeometry) return sharedDepthRockGeometry;
  const document = createRockDocument({ preset: 'river-boulder', seed: 37 });
  sharedDepthRockGeometry = meshDocument(document);
  sharedDepthRockGeometry.computeBoundingBox();
  return sharedDepthRockGeometry;
}

function buildRocks(spots, bed) {
  const group = new THREE.Group();
  group.name = 'WaterLabRocks';
  const geometry = getSharedDepthRockGeometry();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
  for (const spot of spots) {
    const mesh = new THREE.Mesh(geometry, material);
    const scaleX = spot.scale * THREE.MathUtils.lerp(0.82, 1.18, hash01(spot.seed + 0.41));
    const scaleY = spot.scale * THREE.MathUtils.lerp(0.82, 1.12, hash01(spot.seed + 1.73));
    const scaleZ = spot.scale * THREE.MathUtils.lerp(0.84, 1.2, hash01(spot.seed + 2.97));
    mesh.scale.set(scaleX, scaleY, scaleZ);
    mesh.rotation.y = hash01(spot.seed) * Math.PI * 2;
    // Settle the boulder into the bed instead of perching it on top.
    mesh.position.set(
      spot.x,
      bed(spot.x, spot.z) - geometry.boundingBox.min.y * scaleY - 0.25 * spot.scale,
      spot.z,
    );
    group.add(mesh);
  }
  return group;
}

// Flow-reactive kelp bed — the visible readout for flowDirection/flowSpeed.
function buildKelp(count, band, bed, waterLevel, fernPatches = []) {
  if (count <= 0 || !band) return null;
  const placements = [];
  for (let i = 0; i < count; i += 1) {
    const x = (hash01(i * 3 + 1) - 0.5) * 30;
    const z = THREE.MathUtils.lerp(band[0], band[1], hash01(i * 3 + 2));
    const overlapsHeroPatch = fernPatches.some((patch) => (
      Math.hypot(x - patch.x, z - patch.z) < patch.radius * 1.15
    ));
    if (overlapsHeroPatch) continue;
    const bedY = bed(x, z);
    const depth = waterLevel - bedY;
    if (depth < 0.35) continue; // no blades on dry sand
    placements.push({
      // Blades stay submerged: cap the height by the local water column.
      height: Math.min(0.55 + hash01(i * 3 + 3) * 0.85, depth * 0.85),
      width: 0.06 + hash01(i * 3 + 4) * 0.07,
      x,
      y: bedY,
      z,
    });
  }
  if (placements.length === 0) return null;
  return new WaterKelpField({
    kelpColor: [0.24, 0.58, 0.38],
    kelpShadeColor: [0.07, 0.24, 0.22],
    placements,
    swayAmplitude: 0.18,
  });
}

// The ToonLab catalog's Quaternius Fern 1 is deliberately treated as a
// stylized sea fern, not a botanical claim. Sparse hero clusters add readable
// silhouette/scale while the procedural kelp remains the dense flow readout.
function buildSeaFerns(template, patches, plantCount, bed, waterLevel) {
  if (!template || plantCount <= 0 || !patches?.length) return null;
  const group = new THREE.Group();
  group.name = 'WaterLabSeaFerns';
  const density = THREE.MathUtils.clamp(plantCount / 60, 0, 2);
  const sourceMinY = template.userData.sourceMinY ?? 0;
  const sourceHeight = Math.max(template.userData.sourceHeight ?? 0.84, 1e-3);

  patches.forEach((patch) => {
    const count = Math.max(0, Math.round(patch.count * density));
    for (let i = 0; i < count; i += 1) {
      const seed = patch.seed + i * 19.37;
      const angle = hash01(seed + 0.17) * Math.PI * 2;
      const radius = Math.sqrt(hash01(seed + 1.31)) * patch.radius;
      const x = patch.x + Math.cos(angle) * radius;
      const z = patch.z + Math.sin(angle) * radius;
      const bedY = bed(x, z);
      const depth = waterLevel - bedY;
      if (depth < 0.48) continue;

      const desiredScale = patch.scale * THREE.MathUtils.lerp(
        0.72,
        1.28,
        hash01(seed + 2.63),
      );
      const scale = Math.min(desiredScale, depth * 0.78 / sourceHeight);
      if (scale < 0.22) continue;

      const pivot = new THREE.Group();
      const fern = template.clone(true);
      fern.scale.setScalar(scale);
      fern.position.y = -sourceMinY * scale - 0.025;
      pivot.position.set(x, bedY, z);
      pivot.rotation.y = hash01(seed + 4.11) * Math.PI * 2;
      pivot.userData.baseYaw = pivot.rotation.y;
      pivot.userData.phase = hash01(seed + 5.37) * Math.PI * 2;
      pivot.userData.swayScale = THREE.MathUtils.lerp(0.7, 1.2, hash01(seed + 7.03));
      pivot.add(fern);
      group.add(pivot);
    }
  });

  return group.children.length ? group : null;
}

function updateSeaFerns(group, time, settings) {
  if (!group) return;
  const flow = settings.flowDirection ?? [1, 0];
  const length = Math.hypot(flow[0] ?? 0, flow[1] ?? 0) || 1;
  const flowX = (flow[0] ?? 0) / length;
  const flowZ = (flow[1] ?? 0) / length;
  const speed = 0.48 + Math.min(settings.flowSpeed ?? 0, 4) * 0.34;
  const amplitude = 0.035 + Math.min(settings.flowSpeed ?? 0, 4) * 0.018;
  group.children.forEach((pivot) => {
    const sway = Math.sin(time * speed + pivot.userData.phase)
      * amplitude * pivot.userData.swayScale;
    pivot.rotation.set(
      sway * flowZ,
      pivot.userData.baseYaw,
      -sway * flowX,
    );
  });
}

// Low-poly toon boat stand-in for fresh clones without assets-local/ (the
// MegascanProps/FallbackRockCluster pattern).
function buildFallbackBoat() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6d4a30, roughness: 0.8 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), wood);
  hull.scale.set(4.6, 1.1, 1.7);
  hull.position.y = 0.15;
  const cut = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.6, 3.6), new THREE.MeshStandardMaterial({ color: 0x4e3520, roughness: 0.85 }));
  cut.position.y = 1.05;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 8), wood);
  mast.position.y = 3.2;
  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.9, side: THREE.DoubleSide }),
  );
  sail.position.set(0.2, 3.6, 0);
  sail.rotation.y = Math.PI / 2;
  group.add(hull, mast, sail);
  const clip = new THREE.Group();
  clip.add(group);
  // Fake keel line so buoyancy math has a draft to work with.
  clip.userData.draft = 0.55;
  clip.userData.halfLength = 4.2;
  clip.userData.halfBeam = 1.5;
  return clip;
}

function buildSkyGradient() {
  const height = 128;
  const data = new Uint8Array(height * 4);
  const texture = new THREE.DataTexture(data, 1, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function paintSkyGradient(texture, zenith, horizon) {
  const data = texture.image.data;
  const height = texture.image.height;
  for (let y = 0; y < height; y += 1) {
    // Row 0 is the bottom of the background — horizon below, zenith on top.
    const t = Math.pow(y / (height - 1), 0.7);
    const o = y * 4;
    data[o] = Math.round(THREE.MathUtils.lerp(horizon[0], zenith[0], t) * 255);
    data[o + 1] = Math.round(THREE.MathUtils.lerp(horizon[1], zenith[1], t) * 255);
    data[o + 2] = Math.round(THREE.MathUtils.lerp(horizon[2], zenith[2], t) * 255);
    data[o + 3] = 255;
  }
  texture.needsUpdate = true;
}

export function createWaterLabEngine({ mount, store }) {
  document.body.dataset.scene = 'water-lab';
  document.body.dataset.modelReady = 'false';
  document.body.dataset.waterReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = buildSkyGradient();
  scene.background = sky;
  // Fog exists for the underwater swap; above water it sits beyond the stage
  // so it reads as none. WaterSurface mirrors scene.fog into the material.
  scene.fog = new THREE.Fog(0xffffff, 220, 520);
  const underwaterColor = new THREE.Color();

  let stageId = store.getState().view.stage;
  const stage = () => STAGE_DEFINITIONS[stageId] ?? STAGE_DEFINITIONS.shore;
  const bedAt = (x, z) => stage().bed(x, z);

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Match the other designer labs explicitly: changing the left-drag mode
  // must never disable the two camera actions that stay on wheel/right-drag.
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.minDistance = 2;
  // Keep the designer camera inside the fully animated 180 m tile. The far
  // skirt is a horizon safety net, not a second inspectable water system;
  // unbounded pan/zoom could previously put the camera beyond the detailed
  // mesh and expose its lower, flat edge as an obvious rectangular cutoff.
  controls.maxDistance = 65;
  controls.maxTargetRadius = 34;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  let cameraInspectionMode = 'stage';
  function setCameraMode(mode) {
    const next = CAMERA_MOUSE_BUTTONS[mode] === undefined ? 'rotate' : mode;
    controls.mouseButtons.LEFT = CAMERA_MOUSE_BUTTONS[next];
    return next;
  }
  setCameraMode('rotate');
  function resetCamera() {
    cameraInspectionMode = 'stage';
    const framing = stage().camera;
    camera.position.set(...framing.position);
    controls.target.set(...framing.target);
    // OrbitControls clamps pan around cursor. Recenter that sphere for each
    // stage so Beach, basin, and open-water inspection all retain a useful
    // 68 m pan diameter without ever reaching the simulation boundary.
    controls.cursor.copy(controls.target);
    controls.update();
  }
  function setCameraView(view) {
    if (view !== 'underwater-up' && view !== 'underwater-floor') {
      resetCamera();
      return 'stage';
    }
    const waterY = store.getState().settings.waterLevel;
    cameraInspectionMode = view;
    if (view === 'underwater-up') {
      // Look decisively upward: the whole viewport intersects the nearby
      // surface, exposing the Snell window without grazing rays running all
      // the way to the finite lab tile's far edge. Anchor offshore so the
      // signed shoreline clipping cannot masquerade as a missing water tile.
      const patch = stage().fernPatches?.[stageId === 'open' ? 2 : 1]
        ?? stage().fernPatches?.[0]
        ?? { x: 0, z: -10 };
      camera.position.set(patch.x + 2.5, waterY - 1.2, patch.z + 3.5);
      controls.target.set(patch.x, waterY + 1.4, patch.z);
    } else {
      // Frame a planted patch across the bottom instead of pointing almost
      // straight down at one flat square metre. This makes albedo, normals,
      // caustics, rocks, and plant scale readable in the same inspection view.
      const patch = stage().fernPatches?.[stageId === 'open' ? 2 : 1]
        ?? stage().fernPatches?.[0]
        ?? { x: 0, z: -8 };
      const cameraX = patch.x + 4.2;
      let cameraZ = patch.z + 6;
      // Grounds have different profiles. Walk offshore until there is enough
      // room for an eye-height camera without placing it inside the terrain.
      for (let z = patch.z + 6; z >= patch.z - 6; z -= 0.5) {
        if (waterY - stage().bed(cameraX, z) >= 1.8) {
          cameraZ = z;
          break;
        }
      }
      const targetX = patch.x - 1.2;
      const targetZ = patch.z;
      const cameraFloorY = stage().bed(cameraX, cameraZ);
      const floorY = stage().bed(targetX, targetZ);
      camera.position.set(
        cameraX,
        Math.min(waterY - 0.24, cameraFloorY + 1.35),
        cameraZ,
      );
      controls.target.set(targetX, Math.min(waterY - 0.8, floorY + 0.45), targetZ);
    }
    controls.cursor.copy(controls.target);
    controls.update();
    return view;
  }
  resetCamera();

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b6353, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  scene.add(sun);
  scene.add(sun.target);

  // --- stage-owned objects (rebuilt on stage change) -------------------------
  let bedMesh = null;
  let rocks = null;
  let kelp = null;
  let seaFerns = null;
  let fernTemplate = null;
  let water = null;
  document.body.dataset.sandReady = 'loading';
  document.body.dataset.fernReady = 'loading';
  const sandLoadingManager = new THREE.LoadingManager();
  sandLoadingManager.onLoad = () => { document.body.dataset.sandReady = 'true'; };
  sandLoadingManager.onError = () => { document.body.dataset.sandReady = 'false'; };
  const sandTextureLoader = new THREE.TextureLoader(sandLoadingManager);
  function loadSandTexture(url, { colorSpace = THREE.NoColorSpace, name } = {}) {
    const map = sandTextureLoader.load(url);
    map.name = name ?? url;
    map.colorSpace = colorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    return map;
  }
  const sandMaps = {
    albedo: loadSandTexture(SAND_TEXTURE_URLS.albedo, {
      colorSpace: THREE.SRGBColorSpace,
      name: 'CoastSand01Albedo',
    }),
    arm: loadSandTexture(SAND_TEXTURE_URLS.arm, { name: 'CoastSand01ARM' }),
    normal: loadSandTexture(SAND_TEXTURE_URLS.normal, { name: 'CoastSand01NormalGL' }),
  };
  // One material survives every Ground switch. Reusing its compiled graph is
  // essential on WebGPU, and its texture node simply follows the shore-state
  // ping-pong target each update.
  const shoreMaterial = createWaterShoreMaterial({
    albedoMap: sandMaps.albedo,
    armMap: sandMaps.arm,
    normalMap: sandMaps.normal,
    textureRepeat: SAND_TEXTURE_REPEAT,
  });

  // WebGPU encodes and submits work at the end of the render frame. Ground
  // controls can fire between the scene update and that submit, so disposing
  // a just-removed material immediately can invalidate a bind buffer that the
  // current command encoder still owns. Remove objects synchronously, then
  // release their GPU resources after two complete render boundaries.
  function disposeAfterRenderBoundary(dispose) {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.setTimeout(dispose, 34);
      return;
    }
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(dispose);
    });
  }

  // An above-water-only horizon safety net. It sits below the deepest trough
  // so surface views read as continuing past the animated tile. Never show it
  // to a submerged camera: this full plane has no physical place inside the
  // water volume and otherwise appears as a flat blue ceiling over the bed.
  const skirtMaterial = new THREE.MeshBasicMaterial({ color: 0x2a5f80 });
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), skirtMaterial);
  skirt.rotation.x = -Math.PI / 2;
  skirt.visible = false;
  skirt.userData.waterExclude = true;
  scene.add(skirt);

  function buildWater(settings) {
    const surface = new WaterSurface({
      width: WATER_SIZE,
      depth: WATER_SIZE,
      // About 67 cm between vertices: enough samples for a 10 m swash edge,
      // while the 180 m coverage remains practical on the WebGL fallback.
      segmentsPerMeter: 1.5,
      maxSegments: 270,
      simulation: { resolution: 288, worldSize: 26 },
      // The visible tile is biased offshore below, but the local interactive
      // ripple window belongs around the camera's inspection target. Without
      // an explicit follow point the simulation would follow the mesh origin
      // to z=-40 and beach splashes would fall outside its 26 m window.
      follow: (out) => out.set(controls.target.x, 0, controls.target.z),
      bedHeight: stage().bed,
      // The calibration beach has one known offshore axis (+Z propagation).
      // Other grounds include shelves/islands where this one-way mild-slope
      // field is not a valid diffraction model, so they retain plane phase.
      nearshorePhase: stageId === 'beach'
        ? { incidentAxis: 'z', referenceX: 0, referenceZ: 0 }
        : false,
      // Fixed world-space band around every lab shoreline. The anisotropic
      // 768x192 atlas gives ~23 cm cells in both axes: fine enough for torn
      // foam rather than blocky rafts, while remaining a small 30 Hz pass.
      shoreState: {
        region: { centerX: 0, centerZ: -2, width: WATER_SIZE, depth: 44 },
        resolution: { x: 768, y: 192 },
      },
      ...settings,
    });
    surface.position.y = settings.waterLevel;
    // Bias the single animated tile offshore: the measured z=-10..10 swash
    // remains well inside it, while the far z edge moves from ~111 m to
    // ~151 m from the beach camera—behind the scene's fully opaque fog.
    surface.position.z = -40;
    surface.setDebugMode(store.getState().view.debug);
    surface.attachShoreStateMaterial(shoreMaterial);
    scene.add(surface);
    return surface;
  }

  function syncEnvironment(settings) {
    const direction = new THREE.Vector3(...settings.sunDirection);
    if (direction.lengthSq() < 1e-6) direction.set(0.35, 0.8, 0.45);
    direction.normalize();
    sun.position.copy(direction.multiplyScalar(60));
    sun.target.position.set(0, 0, 0);
    sun.color.setRGB(...settings.sunColor);
    paintSkyGradient(sky, settings.skyZenithColor, settings.skyHorizonColor);
    skirt.visible = true;
    // Below the deepest wave trough, or it pokes through as flat pale patches.
    skirt.position.y = settings.waterLevel -
      Math.max(1.4, settings.waveAmplitude * Math.pow(settings.waveIntensity, 1.35) * 2.2 + 0.6);
    skirtMaterial.color.setRGB(
      settings.deepColor[0] * 0.85,
      settings.deepColor[1] * 0.85,
      settings.deepColor[2] * 0.9,
    );
  }

  function mirrorDataset(settings) {
    document.body.dataset.waterMode = settings.mode;
    document.body.dataset.waterStyle = settings.style;
    document.body.dataset.waterTone = settings.colorTone;
    document.body.dataset.waterLevel = settings.waterLevel.toFixed(3);
    document.body.dataset.waterStage = stageId;
  }

  function applySettings(settings) {
    if (water && settings.quality !== water.settings.quality) {
      // TSL quality defines bake at material creation — rebuild the surface.
      scene.remove(water);
      water.dispose();
      water = null;
    }
    if (!water) {
      water = buildWater(settings);
    } else {
      water.applySettings(settings);
      water.position.y = settings.waterLevel;
    }
    updateWaterShoreMaterial(shoreMaterial, {
      stateField: water.shoreState,
      foamColor: settings.foamColor,
      // The shared ground-side fringe is the dry half of swash foam, not an
      // independent effect. Its presentation follows the same dedicated
      // Swash Foam control as the water-side half.
      foamAmount: settings.swashFoamAmount,
      wetDarkening: settings.wetSandDarkening,
      // Wet sand is darker and smoother, but it is not a mirror. Mapping the
      // authored sheen directly to full clearcoat produced broad white cloud
      // patches from the bright sky instead of a restrained grazing glint.
      wetRoughness: THREE.MathUtils.lerp(0.52, 0.28, settings.wetSandSheen),
      wetClearcoat: settings.wetSandSheen * 0.48,
    });
    syncEnvironment(settings);
    mirrorDataset(settings);
  }

  // --- floating ship (open-water stage) ----------------------------------------
  let boat = null;
  let boatVisual = null;
  const boatPose = { pitch: 0, roll: 0, y: null };

  function mountBoatModel(model) {
    boatVisual = model;
    boatVisual.rotation.y = 0.55;
    boatVisual.position.set(3, 0, -3);
    boatVisual.visible = stage().boat;
    scene.add(boatVisual);
  }

  function syncSeaFerns(state = store.getState()) {
    if (seaFerns) scene.remove(seaFerns);
    seaFerns = buildSeaFerns(
      fernTemplate,
      stage().fernPatches,
      state.view.kelp,
      stage().bed,
      state.settings.waterLevel,
    );
    if (seaFerns) scene.add(seaFerns);
  }

  new GLTFLoader().loadAsync(SHIP_URL).then((gltf) => {
    const ship = gltf.scene;
    const box = new THREE.Box3().setFromObject(ship);
    const size = box.getSize(new THREE.Vector3());
    const length = Math.max(size.x, size.z);
    const scale = 13 / Math.max(length, 1e-3); // ~13 m hull on the 40 m stage
    ship.scale.setScalar(scale);
    const wrapper = new THREE.Group();
    // Keel at wrapper -draft: the group origin rides the sampled wave height.
    const draft = 0.8;
    ship.position.y = -box.min.y * scale - draft;
    wrapper.add(ship);
    wrapper.userData.draft = draft;
    wrapper.userData.halfLength = (Math.max(size.x, size.z) * scale) / 2 * 0.7;
    wrapper.userData.halfBeam = (Math.min(size.x, size.z) * scale) / 2 * 0.7;
    wrapper.name = 'DutchShipMedium';
    mountBoatModel(wrapper);
    boat = wrapper;
  }).catch(() => {
    // Fresh clone without assets-local/: procedural toon boat stand-in.
    const fallback = buildFallbackBoat();
    fallback.name = 'FallbackBoat';
    mountBoatModel(fallback);
    boat = fallback;
  });

  new GLTFLoader().loadAsync(FERN_URL).then((gltf) => {
    fernTemplate = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(fernTemplate);
    fernTemplate.userData.sourceMinY = bounds.min.y;
    fernTemplate.userData.sourceHeight = bounds.max.y - bounds.min.y;
    const materials = new Map();
    fernTemplate.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const tunedMaterials = sourceMaterials.map((source) => {
        if (!materials.has(source)) {
          const material = source.clone();
          material.name = `${source.name || 'FernLeaves'}_Underwater`;
          material.side = THREE.DoubleSide;
          material.roughness = 0.9;
          material.metalness = 0;
          material.emissive.set(0x173b29);
          material.emissiveMap = material.map;
          material.emissiveIntensity = 0.32;
          materials.set(source, material);
        }
        return materials.get(source);
      });
      object.material = Array.isArray(object.material) ? tunedMaterials : tunedMaterials[0];
    });
    document.body.dataset.fernReady = 'true';
    syncSeaFerns();
  }).catch(() => {
    // Procedural kelp still keeps the stage useful if an asset is removed.
    document.body.dataset.fernReady = 'false';
  });

  function updateBoat() {
    if (!boat || !water || !boat.visible) return;
    const x = boat.position.x;
    const z = boat.position.z;
    const halfLength = boat.userData.halfLength;
    const halfBeam = boat.userData.halfBeam;
    const yaw = boat.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const bow = water.getHeightAt(x + cos * halfLength, z - sin * halfLength);
    const stern = water.getHeightAt(x - cos * halfLength, z + sin * halfLength);
    const port = water.getHeightAt(x + sin * halfBeam, z + cos * halfBeam);
    const starboard = water.getHeightAt(x - sin * halfBeam, z - cos * halfBeam);
    const targetY = (bow + stern + port + starboard) / 4;
    const targetPitch = Math.atan2(stern - bow, halfLength * 2) * 0.7;
    const targetRoll = Math.atan2(port - starboard, halfBeam * 2) * 0.6;
    // A hull this size responds slowly — heavy smoothing sells the mass.
    boatPose.y = boatPose.y === null ? targetY : THREE.MathUtils.lerp(boatPose.y, targetY, 0.04);
    boatPose.pitch = THREE.MathUtils.lerp(boatPose.pitch, targetPitch, 0.04);
    boatPose.roll = THREE.MathUtils.lerp(boatPose.roll, targetRoll, 0.04);
    boat.position.y = boatPose.y;
    boat.rotation.x = boatPose.roll;
    boat.rotation.z = boatPose.pitch;
  }

  // --- rain ---------------------------------------------------------------------
  const rain = new WaterRain({ areaSize: 34, count: 2000 });
  rain.visible = false;
  scene.add(rain);

  // --- fish ---------------------------------------------------------------------
  let fauna = null;
  let faunaBuilt = { count: -1, stage: null, waterLevel: NaN };
  function syncFauna(count, waterLevel) {
    const unchanged = count === faunaBuilt.count &&
      faunaBuilt.stage === stageId &&
      Math.abs(waterLevel - faunaBuilt.waterLevel) <= 0.05;
    if (unchanged) return;
    if (fauna) {
      const staleFauna = fauna;
      scene.remove(staleFauna.root);
      disposeAfterRenderBoundary(() => staleFauna.dispose());
      fauna = null;
    }
    if (count > 0) {
      fauna = createFauna({
        bounds: { x: 15, z: 15 },
        heightAt: bedAt,
        seed: 7,
        species: { birds: 0, butterflies: 0, dragonflies: 0, fish: count },
        waterLevel,
      });
      scene.add(fauna.root);
    }
    faunaBuilt = { count, stage: stageId, waterLevel };
  }

  function rebuildStage() {
    const state = store.getState();
    if (bedMesh) {
      const staleBed = bedMesh;
      scene.remove(staleBed);
      disposeAfterRenderBoundary(() => {
        staleBed.geometry.dispose();
      });
    }
    bedMesh = buildBedMesh(state.settings.waterLevel, stage().bed, shoreMaterial);
    scene.add(bedMesh);

    if (rocks) {
      const staleRocks = rocks;
      scene.remove(staleRocks);
      disposeAfterRenderBoundary(() => {
        const materials = new Set();
        staleRocks.traverse((object) => {
          if (object.material) materials.add(object.material);
        });
        materials.forEach((material) => material.dispose());
      });
    }
    rocks = buildRocks(stage().rockSpots, stage().bed);
    rocks.visible = state.view.rocks;
    scene.add(rocks);

    if (kelp) {
      const staleKelp = kelp;
      scene.remove(staleKelp);
      disposeAfterRenderBoundary(() => staleKelp.dispose());
    }
    kelp = buildKelp(
      state.view.kelp,
      stage().kelpBand,
      stage().bed,
      state.settings.waterLevel,
      stage().fernPatches,
    );
    if (kelp) {
      kelp.setFlow(state.settings.flowDirection, state.settings.flowSpeed);
      scene.add(kelp);
    }
    syncSeaFerns(state);

    // Preserve the material, render passes, ripple state, and animation clock.
    // Recreating them here made the new scene appear and then block input
    // while WebGPU compiled the complete water pipeline (and restarted every
    // foam cycle from the same frame). The graph already has shoaling enabled,
    // so only its per-vertex terrain samples need to change.
    if (water && state.settings.quality === water.settings.quality) {
      water.setNearshorePhase(
        stageId === 'beach'
          ? { incidentAxis: 'z', referenceX: 0, referenceZ: 0 }
          : false,
        { bake: false },
      );
      // Defer the O(vertex-count) bed/phase bake to the normal update after
      // applySettings has moved the rest water level, avoiding two synchronous
      // bakes (old Y, then new Y) during the ground-selector event.
      water.setBedHeightSampler(stage().bed, { bake: false });
    }
    applySettings(state.settings);

    if (boatVisual) boatVisual.visible = stage().boat;
    boatPose.y = null;

    faunaBuilt.stage = null; // force fish onto the new ground
    syncFauna(state.view.fish, state.settings.waterLevel);
    resetCamera();
  }
  rebuildStage();
  document.body.dataset.waterReady = 'true';

  // --- toys: buoyant balls / sinkers -----------------------------------------------
  const ballGeometry = new THREE.SphereGeometry(0.32, 32, 24);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xf2734a, roughness: 0.5 });
  const sinkerMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4754, metalness: 0.6, roughness: 0.35 });
  const balls = [];

  function removeBall(ball) {
    scene.remove(ball.mesh);
    const index = balls.indexOf(ball);
    if (index >= 0) balls.splice(index, 1);
  }

  function dropBall({ sinker = false } = {}) {
    if (balls.length >= BALL_LIMIT) removeBall(balls[0]);
    const mesh = new THREE.Mesh(ballGeometry, sinker ? sinkerMaterial : ballMaterial);
    mesh.position.set(
      THREE.MathUtils.randFloatSpread(12),
      7 + Math.random() * 2,
      THREE.MathUtils.randFloatSpread(10) - 4,
    );
    scene.add(mesh);
    balls.push({ mesh, restTime: 0, sinker, splashed: false, vy: 0 });
  }

  function updateBalls(delta) {
    for (const ball of [...balls]) {
      const position = ball.mesh.position;
      const surfaceY = water.getHeightAt(position.x, position.z);
      const bedY = bedAt(position.x, position.z) + 0.32;
      const submerged = position.y < surfaceY;

      ball.vy -= 9.8 * delta;
      if (submerged) {
        if (!ball.splashed) {
          ball.splashed = true;
          water.splash({ x: position.x, y: surfaceY, z: position.z }, { strength: ball.sinker ? 1.3 : 0.9 });
        }
        if (ball.sinker) {
          ball.vy = Math.max(ball.vy, -2.2); // drag caps sink speed
        } else {
          const depth = Math.min(surfaceY - position.y, 0.64);
          ball.vy += (22 * depth - 3.2 * ball.vy) * delta; // buoyancy spring + damping
          water.addRipple(position, { radius: 0.4, strength: Math.min(Math.abs(ball.vy) * 0.2, 0.4) });
        }
      }
      position.y += ball.vy * delta;

      if (ball.sinker && position.y <= bedY) {
        position.y = bedY;
        ball.vy = 0;
        ball.restTime += delta;
        if (ball.restTime > 5) removeBall(ball);
      }
      if (position.y < -12) removeBall(ball);
    }
  }

  // --- pointer splashes ----------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let stirring = false;
  let lastStir = 0;

  function pointerToWater(event) {
    pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    waterPlane.constant = -water.position.y;
    if (!raycaster.ray.intersectPlane(waterPlane, hit)) return null;
    return water.containsPoint(hit.x, hit.z, 0.5) ? hit : null;
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.shiftKey) return;
    const point = pointerToWater(event);
    if (!point) return;
    stirring = true;
    controls.enabled = false;
    water.splash({ x: point.x, y: point.y, z: point.z }, { strength: 1 });
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!stirring) return;
    const now = performance.now();
    if (now - lastStir < 30) return;
    lastStir = now;
    const point = pointerToWater(event);
    if (point) water.addRipple(point, { radius: 0.35, strength: 0.35 });
  });
  window.addEventListener('pointerup', () => {
    stirring = false;
    controls.enabled = true;
  });

  // --- store subscription -----------------------------------------------------------
  let lastRevision = store.getState().docRevision;
  let lastDebug = store.getState().view.debug;
  let lastKelpCount = store.getState().view.kelp;
  let lastPlantWaterLevel = store.getState().settings.waterLevel;
  store.subscribe(() => {
    const state = store.getState();
    if (state.view.stage !== stageId) {
      stageId = state.view.stage;
      lastRevision = state.docRevision;
      lastPlantWaterLevel = state.settings.waterLevel;
      rebuildStage();
      return;
    }
    if (state.docRevision !== lastRevision) {
      lastRevision = state.docRevision;
      applySettings(state.settings);
      kelp?.setFlow(state.settings.flowDirection, state.settings.flowSpeed);
      if (Math.abs(state.settings.waterLevel - lastPlantWaterLevel) > 0.05) {
        lastPlantWaterLevel = state.settings.waterLevel;
        syncSeaFerns(state);
      }
    }
    if (state.view.debug !== lastDebug) {
      lastDebug = state.view.debug;
      water.setDebugMode(state.view.debug);
    }
    if (state.view.rain !== rain.visible) rain.visible = state.view.rain;
    if (rocks) rocks.visible = state.view.rocks;
    if (state.view.kelp !== lastKelpCount) {
      lastKelpCount = state.view.kelp;
      if (kelp) {
        scene.remove(kelp);
        kelp.dispose();
      }
      kelp = buildKelp(
        state.view.kelp,
        stage().kelpBand,
        stage().bed,
        state.settings.waterLevel,
        stage().fernPatches,
      );
      if (kelp) {
        kelp.setFlow(state.settings.flowDirection, state.settings.flowSpeed);
        scene.add(kelp);
      }
      syncSeaFerns(state);
    }
    syncFauna(state.view.fish, state.settings.waterLevel);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Diving the camera under the surface is a first-class inspection view:
  // swap the sky for a dense body-color atmosphere (same treatment as the
  // playground's UnderwaterAtmosphere) so depth fade/caustics read in situ.
  function syncUnderwaterAtmosphere() {
    const settings = store.getState().settings;
    const submerged = camera.position.y < water.position.y;
    skirt.visible = !submerged;
    if (submerged) {
      underwaterColor.setRGB(
        settings.midColor[0] * 0.8,
        settings.midColor[1] * 0.85,
        settings.midColor[2] * 0.9,
      );
      scene.fog.color.copy(underwaterColor);
      scene.fog.near = 0.5;
      scene.fog.far = 32;
      scene.background = underwaterColor;
    } else {
      // Horizon haze: the far water edge and the bed beyond it dissolve into
      // the sky, so the finite tile reads as a body of water, not a slab.
      scene.fog.color.setRGB(...settings.skyHorizonColor);
      scene.fog.near = 55;
      scene.fog.far = 150;
      scene.background = sky;
    }
  }

  const clock = new THREE.Clock();
  let firstFrame = true;

  async function start() {
    await whenRendererReady(renderer);
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      controls.update();
      syncUnderwaterAtmosphere();
      updateBalls(delta);
      updateBoat();
      fauna?.update(delta);
      kelp?.update(delta);
      if (kelp) kelp.visible = cameraInspectionMode !== 'underwater-floor';
      updateSeaFerns(seaFerns, clock.elapsedTime, store.getState().settings);
      if (rain.visible) {
        rain.update(delta, camera, renderer, water.position.y);
        // Rain-pocked water: a few dimples per frame around the view center.
        for (let i = 0; i < 3; i += 1) {
          water.addRipple({
            x: controls.target.x + THREE.MathUtils.randFloatSpread(22),
            z: controls.target.z + THREE.MathUtils.randFloatSpread(22),
          }, { radius: 0.22, strength: 0.12 });
        }
      }
      water.update(renderer, scene, camera, delta);
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset.modelReady = 'true';
      }
    });
  }

  return {
    camera,
    controls,
    dropBall,
    renderer,
    resetCamera,
    scene,
    setCameraMode,
    setCameraView,
    start,
  };
}
