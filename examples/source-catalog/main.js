import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { advanceToonLabSourceEnvironmentState } from '@call-me-sensei/toonlab/environment';

import {
  createSourceCatalogContext,
  loadSourceCatalogAsset,
} from './sourceCatalogAssets.js';

const params = new URLSearchParams(location.search);
const requestedMode = params.get('mode');
const mode = requestedMode === 'neutral'
  ? 'neutral'
  : requestedMode === 'live' || requestedMode === 'source'
    ? 'source'
    : 'baked';
const requestedCategory = params.get('category') ?? 'all';
const limit = Math.max(0, Number(params.get('limit')) || 0);

const GROUPS = Object.freeze({
  Mountains: { cell: 21, columns: 4, target: 17 },
  Rocks: { cell: 4.8, columns: 24, target: 3.8 },
  Trees: { cell: 5.8, columns: 22, target: 5 },
  Foliage: { cell: 3.8, columns: 24, target: 3 },
  Water: { cell: 5.2, columns: 18, target: 4.2 },
  Misc: { cell: 5.2, columns: 18, target: 4.2 },
  Utility: { cell: 3.6, columns: 24, target: 2.8 },
});

function isUtility(entry) {
  return /(?:\/Collision\/|_Collision$|SM_Collision_)/i.test(entry.sourcePath)
    || entry.materials?.every((path) => String(path).includes('WorldGridMaterial'));
}

function groupName(entry) {
  if (isUtility(entry)) return 'Utility';
  if (entry.category === 'Rocks' && /\/Mountains\//.test(entry.sourcePath)) return 'Mountains';
  if (['Rocks', 'Trees', 'Foliage', 'Water'].includes(entry.category)) return entry.category;
  return 'Misc';
}

function setQuery(next) {
  const query = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(next)) {
    if (value == null || value === '') query.delete(key);
    else query.set(key, value);
  }
  location.search = query.toString();
}

function createLabel(text, width = 1024, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.font = '700 72px Inter, system-ui, sans-serif';
  context.fillStyle = '#f5f7fb';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(text, 20, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(18, 2.25, 1);
  return sprite;
}

function createSectionOutline(width, depth, centerZ) {
  const points = [
    new THREE.Vector3(-width / 2, 0.025, centerZ - depth / 2),
    new THREE.Vector3(width / 2, 0.025, centerZ - depth / 2),
    new THREE.Vector3(width / 2, 0.025, centerZ + depth / 2),
    new THREE.Vector3(-width / 2, 0.025, centerZ + depth / 2),
    new THREE.Vector3(-width / 2, 0.025, centerZ - depth / 2),
  ];
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xc9d3e7, opacity: 0.32, transparent: true }),
  );
}

function buildLayout(entries, scene) {
  const layouts = new Map();
  let startZ = -42;
  const order = ['Mountains', 'Rocks', 'Trees', 'Foliage', 'Water', 'Misc', 'Utility'];
  for (const name of order) {
    const groupEntries = entries.filter((entry) => groupName(entry) === name);
    if (groupEntries.length === 0) continue;
    const spec = GROUPS[name];
    const columns = Math.min(spec.columns, Math.max(1, groupEntries.length));
    const rows = Math.ceil(groupEntries.length / columns);
    const width = columns * spec.cell;
    const depth = rows * spec.cell;
    const centerZ = startZ + depth / 2;
    const label = createLabel(`${name} · ${groupEntries.length}`);
    label.position.set(-width / 2, 1.6, startZ - 2.2);
    scene.add(label);
    scene.add(createSectionOutline(width + 1.4, depth + 1.4, centerZ));
    groupEntries.forEach((entry, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      layouts.set(entry.sourcePath, {
        cell: spec.cell,
        target: spec.target,
        x: (column - (columns - 1) / 2) * spec.cell,
        z: startZ + (row + 0.5) * spec.cell,
      });
    });
    startZ += depth + Math.max(7, spec.cell * 1.4);
  }
  return { layouts, maxZ: startZ, minZ: -42 };
}

function normalizeToCell(root, layout) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1e-4);
  root.scale.multiplyScalar(layout.target / maxDimension);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.set(layout.x, -box.min.y, layout.z);
  root.updateMatrixWorld(true);
}

function frameVisibleCatalog(camera, controls, bounds) {
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = Math.max(18, sphere.radius / Math.sin(limitingFov / 2) * 1.16);
  const direction = new THREE.Vector3(0, 0.86, 1).normalize();

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.05, distance - sphere.radius * 2.4);
  camera.far = Math.max(900, distance + sphere.radius * 3.2);
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  controls.update();
}

async function runPool(items, worker, concurrency = 6) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  document.getElementById('mode-baked').dataset.active = String(mode === 'baked');
  document.getElementById('mode-source').dataset.active = String(mode === 'source');
  document.getElementById('mode-neutral').dataset.active = String(mode === 'neutral');
  document.getElementById('category').value = requestedCategory;
  document.getElementById('mode-baked').addEventListener('click', () => setQuery({ mode: 'baked' }));
  document.getElementById('mode-source').addEventListener('click', () => setQuery({ mode: 'source' }));
  document.getElementById('mode-neutral').addEventListener('click', () => setQuery({ mode: 'neutral' }));
  document.getElementById('category').addEventListener('change', (event) =>
    setQuery({ category: event.target.value === 'all' ? null : event.target.value }));
  const renderer = new WebGPURenderer({
    antialias: true,
    forceWebGL: params.get('renderer') === 'webgl',
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, Number(params.get('dpr')) || 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6e7b93);
  scene.fog = new THREE.Fog(0x6e7b93, 180, 520);
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.2, 900);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;

  scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x526177, 1.8));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.set(-80, 120, 65);
  scene.add(sun);

  const context = await createSourceCatalogContext();
  let entries = [...context.manifest.entries]
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  const totalInventory = entries.length;
  if (requestedCategory === 'all') entries = entries.filter((entry) => !isUtility(entry));
  else entries = entries.filter((entry) => groupName(entry) === requestedCategory);
  if (limit > 0) entries = entries.slice(0, limit);

  const stage = new THREE.Group();
  stage.name = 'ToonLabCompleteSourceCatalog';
  scene.add(stage);
  const layout = buildLayout(entries, stage);
  const floorDepth = Math.max(layout.maxZ - layout.minZ + 50, 120);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(260, floorDepth),
    new THREE.MeshStandardMaterial({ color: 0x66738a, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (layout.minZ + layout.maxZ) / 2;
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  stage.add(floor);

  const status = document.getElementById('status');
  const failures = [];
  const visibleBounds = new THREE.Box3();
  let loadedCount = 0;
  let nativeBakedCount = 0;
  let liveFallbackCount = 0;
  status.textContent = `0 / ${entries.length} · ${mode}`;
  await runPool(entries, async (entry) => {
    try {
      const asset = await loadSourceCatalogAsset(entry, {
        context,
        materialMode: mode,
      });
      const cell = layout.layouts.get(entry.sourcePath);
      normalizeToCell(asset.root, cell);
      stage.add(asset.root);
      visibleBounds.union(new THREE.Box3().setFromObject(asset.root));
      if (asset.root.userData.toonLabMaterialMode === 'baked') nativeBakedCount += 1;
      if (asset.root.userData.toonLabMaterialMode === 'live-fallback') liveFallbackCount += 1;
    } catch (error) {
      failures.push(`${entry.sourceAssetName}: ${error.message}`);
      console.warn('[sourceCatalog]', entry.sourceAssetName, error);
    }
    loadedCount += 1;
    const materialStatus = mode === 'baked'
      ? `${nativeBakedCount} native · ${liveFallbackCount} live fallback`
      : mode;
    status.textContent = `${loadedCount} / ${entries.length} · ${materialStatus} · ${failures.length} failed`;
  }, Number(params.get('workers')) || 6);

  frameVisibleCatalog(camera, controls, visibleBounds);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (event) => {
    pointer.x = (event.clientX / innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(stage.children, true)
      .find((candidate) => candidate.object.userData.toonLabSourceAsset
        || candidate.object.parent?.userData.toonLabCatalogEntry);
    if (!hit) return;
    let object = hit.object;
    while (object && !object.userData.toonLabCatalogEntry) object = object.parent;
    const entry = object?.userData.toonLabCatalogEntry;
    if (!entry) return;
    const sourceMesh = context.library.resolveMesh(entry.sourceAssetName);
    document.getElementById('info').textContent = [
      entry.sourceAssetName,
      entry.sourcePath,
      `${entry.lods.length} authored LOD${entry.lods.length === 1 ? '' : 's'}`,
      ...(sourceMesh?.materialSlots ?? []).map((slot) => slot.material),
    ].join(' · ');
  });

  document.getElementById('loading').remove();
  document.body.dataset.stageReady = 'true';
  document.body.dataset.assetCount = String(loadedCount - failures.length);
  document.body.dataset.inventoryCount = String(totalInventory);
  document.body.dataset.failureCount = String(failures.length);
  document.body.dataset.nativeBakedCount = String(nativeBakedCount);
  document.body.dataset.liveFallbackCount = String(liveFallbackCount);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    if (params.get('animate') === '1') {
      advanceToonLabSourceEnvironmentState(context.state, delta);
    }
    controls.update();
    renderer.render(scene, camera);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

main().catch((error) => {
  console.error(error);
  document.getElementById('loading').textContent = error.message;
  document.body.dataset.stageError = error.message;
});
