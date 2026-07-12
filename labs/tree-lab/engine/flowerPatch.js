// Tree blossoms + ground flowers: drawn or preset petal heads. Blossoms
// attach to the canopy's real leaf cards (a flowering tree — the point);
// ground modes grow tulip-style stems. Was: ground-only — reworked per
// user: "flowers are part of the tree, not ground decoration".
// Original header: tulip-style stems with drawn or
// preset petal heads (the user can draw a single flower silhouette and grow
// a whole patch of them). Engine-side layer like the leaf particles —
// placements are deterministic per tree seed, heads are canvas textures
// built from the same traceLeafShapePath silhouettes as leaves.

import * as THREE from 'three';
import { createFlowerHeadTexture, FLOWER_SPECIES } from '../../../src/vegetation/index.js';
import {
  createFlowerHeadNodeMaterial,
  createFlowerStemNodeMaterial,
} from '../../../src/shaders-tsl/flower.js';

// ON-TREE placements are the point of this feature (a flowering tree —
// sakura, magnolia): blossoms attach to the canopy's real leaf cards.
// Ground placements cover the tulip-from-the-ground case.
export const FLOWER_PLACEMENTS = Object.freeze([
  { fraction: 0.12, id: 'sparse', label: 'Blossoms · Sparse', onTree: true },
  { fraction: 0.32, id: 'dense', label: 'Blossoms · Dense', onTree: true },
  { count: 7, id: 'cluster', label: 'Ground · Cluster', spread: [1.0, 2.0] },
  { count: 34, id: 'meadow', label: 'Ground · Meadow', spread: [1.4, 4.5] },
]);

// Species catalog + head sprites are shared with the StylizedFlower plant —
// see src/vegetation/flowerSpecies.js. Re-exported for the Flowers panel.
export { FLOWER_SPECIES };
// Back-compat alias: the catalog superseded the original three-entry list.
export const PETAL_PRESETS = FLOWER_SPECIES;

// Deterministic placement rng (mulberry32-alike, tiny).
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFlowerPatch({ engine, store }) {
  const { scene } = engine;
  let group = null;
  let lastKey = '';

  function dispose() {
    if (!group) return;
    scene.remove(group);
    group.traverse((child) => {
      child.geometry?.dispose();
      const map = child.material?.map ?? child.material?.uniforms?.uMap?.value;
      map?.dispose?.();
      child.material?.dispose?.();
    });
    group = null;
  }

  // Real canopy card centers (every 4th position vertex — billboards share
  // their center across 4 corners), world-transformed: the blossom anchors.
  function canopyCardCenters() {
    const plant = engine.getPlant();
    const positionAttr = plant?.canopyMesh?.geometry.getAttribute('position');
    if (!positionAttr) return [];
    plant.canopyMesh.updateWorldMatrix(true, false);
    const centers = [];
    const point = new THREE.Vector3();
    for (let v = 0; v < positionAttr.count; v += 4) {
      point.fromBufferAttribute(positionAttr, v);
      plant.canopyMesh.localToWorld(point);
      centers.push(point.clone());
    }
    return centers;
  }

  function rebuild() {
    dispose();
    const { flowers, settings } = store.getState();
    if (!flowers || flowers.preset === 'none') return;
    const placement = FLOWER_PLACEMENTS.find((entry) => entry.id === flowers.preset);
    if (!placement) return;

    const size = settings.plant.size;

    if (placement.onTree) {
      // Blossoms ON the canopy.
      const centers = canopyCardCenters();
      if (!centers.length) return;
      const random = rng((settings.plant.seed + 91) >>> 0);
      const picked = centers.filter(() => random() < placement.fraction);
      if (!picked.length) return;
      group = new THREE.Group();
      group.name = 'Tree blossoms';
      const blossomSize = size * 0.16 * (flowers.scale ?? 1);
      const headGeometry = new THREE.PlaneGeometry(blossomSize, blossomSize);
      const headMaterial = createFlowerHeadNodeMaterial({
        map: createFlowerHeadTexture(flowers),
        windSpeed: 1.1,
        windStrength: blossomSize * 0.1,
      });
      const heads = new THREE.InstancedMesh(headGeometry, headMaterial, picked.length);
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      picked.forEach((center, index) => {
        quaternion.setFromEuler(new THREE.Euler(
          (random() - 0.5) * 1.2, random() * Math.PI * 2, (random() - 0.5) * 1.2));
        matrix.compose(center, quaternion, one);
        heads.setMatrixAt(index, matrix);
      });
      group.add(heads);
      scene.add(group);
      return;
    }
    const height = (flowers.height ?? 0.35) * size * 0.5;
    const random = rng((settings.plant.seed + 77) >>> 0);
    group = new THREE.Group();
    group.name = 'Flower patch';

    // Head and stem share windSpeed/windStrength (and instance index order),
    // so the stem tip's full-bend sway equals the head's — they stay glued.
    const sway = { windSpeed: 1.1, windStrength: height * 0.08 };
    const stemGeometry = new THREE.CylinderGeometry(0.012 * size, 0.016 * size, height, 5);
    stemGeometry.translate(0, height / 2, 0);
    const stemMaterial = createFlowerStemNodeMaterial({ color: 0x4d8a3f, height, ...sway });
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, placement.count);

    const headSize = height * 0.62;
    const headGeometry = new THREE.PlaneGeometry(headSize, headSize);
    const headMaterial = createFlowerHeadNodeMaterial({
      map: createFlowerHeadTexture(flowers),
      ...sway,
    });
    const heads = new THREE.InstancedMesh(headGeometry, headMaterial, placement.count);

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < placement.count; i += 1) {
      const angle = placement.id === 'ring'
        ? (i / placement.count) * Math.PI * 2 + random() * 0.3
        : random() * Math.PI * 2;
      const radius = size * THREE.MathUtils.lerp(
        placement.spread[0], placement.spread[1],
        placement.id === 'ring' ? random() * 0.25 : random());
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const lean = (random() - 0.5) * 0.18;
      quaternion.setFromEuler(new THREE.Euler(lean, random() * Math.PI * 2, lean));
      matrix.compose(new THREE.Vector3(x, 0, z), quaternion, one);
      stems.setMatrixAt(i, matrix);
      matrix.compose(new THREE.Vector3(x, height, z), quaternion, one);
      heads.setMatrixAt(i, matrix);
    }
    stems.castShadow = true;
    group.add(stems, heads);
    scene.add(group);
  }

  // Blossoms anchor to canopy cards: re-place after every plant rebuild.
  engine.onRebuilt(() => rebuild());

  store.subscribe(() => {
    const { flowers, settings } = store.getState();
    const key = JSON.stringify([flowers, settings.plant.seed, settings.plant.size]);
    if (key !== lastKey) {
      lastKey = key;
      rebuild();
    }
  });

  return { rebuild };
}
