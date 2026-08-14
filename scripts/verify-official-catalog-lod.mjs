import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  collectCatalogLodBindings,
  createCatalogLodRuntime,
  normalizeCatalogLodDistances,
  selectCatalogLodLevel,
} from '../src/catalog/officialCatalogLod.js';

const root = new THREE.Group();
root.position.set(10, 0, 0);
root.scale.setScalar(2);
const lod0 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lod0.name = 'ridge_LOD0_mesh';
const lod2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lod2.userData.toonlabLodLevel = 2;
const unmanaged = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
unmanaged.name = 'collision-helper';
root.add(lod0, lod2, unmanaged);

const bindings = collectCatalogLodBindings(root);
assert.deepEqual(bindings.map(({ level }) => level), [0, 2]);
assert.deepEqual(normalizeCatalogLodDistances([0, 30, 90]), [0, 30, 90]);
assert.equal(selectCatalogLodLevel({
  availableLevels: [0, 2], distance: 50, distances: [0, 30, 90],
}), 0, 'missing LOD1 falls back to the nearest available lower level');
assert.equal(selectCatalogLodLevel({
  availableLevels: [0, 2], distance: 100, distances: [0, 30, 90],
}), 2);

const runtime = createCatalogLodRuntime(root, { distances: [0, 30, 90] });
assert.equal(runtime.level, 0);
assert.equal(lod0.visible, true);
assert.equal(lod2.visible, false);
assert.equal(unmanaged.visible, true);

runtime.update({ distance: 50 });
assert.equal(runtime.level, 0);
runtime.update({ distance: 100 });
assert.equal(runtime.level, 2);
assert.equal(lod0.visible, false);
assert.equal(lod2.visible, true);

const camera = new THREE.PerspectiveCamera();
camera.position.set(210, 0, 0);
runtime.update({ camera });
assert.equal(runtime.level, 2, 'world scale normalizes the camera distance');

runtime.dispose();
assert.equal(lod0.visible, true);
assert.equal(lod2.visible, true);
assert.equal(unmanaged.visible, true);

const capped = createCatalogLodRuntime(root, {
  distances: [0, 30, 90],
  maxLevel: 0,
});
capped.update({ distance: 1000 });
assert.equal(capped.level, 0);
capped.dispose();

console.log('Official catalog LOD verification passed.');
