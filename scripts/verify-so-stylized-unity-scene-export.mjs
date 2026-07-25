import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = process.cwd();
const inputIndex = process.argv.indexOf('--input');
const input = path.resolve(
  root,
  inputIndex >= 0 && process.argv[inputIndex + 1]
    ? process.argv[inputIndex + 1]
    : 'assets-local/sostylized-unity/mega-scene',
);

const fail = (message) => {
  throw new Error(`Unity scene export verification failed: ${message}`);
};
const exists = (relative) => {
  const absolute = path.join(input, relative);
  if (!fs.existsSync(absolute)) fail(`missing ${relative}`);
  return absolute;
};
const exactSize = (relative, expected) => {
  const actual = fs.statSync(exists(relative)).size;
  if (actual !== expected) fail(`${relative} is ${actual} bytes; expected ${expected}`);
};

const manifest = JSON.parse(fs.readFileSync(exists('scene-manifest.json'), 'utf8'));
if (manifest.schema !== 'toonlab.sostylized-unity.scene-export') fail('wrong schema');
if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) {
  fail(`unsupported schema version ${manifest.schemaVersion}`);
}
if (manifest.glb !== 'scene.glb') fail('manifest.glb must be scene.glb');

const glb = fs.readFileSync(exists(manifest.glb));
if (glb.readUInt32LE(0) !== 0x46546c67) fail('scene.glb has no glTF magic');
if (glb.readUInt32LE(4) !== 2) fail('scene.glb is not glTF 2.0');
if (glb.readUInt32LE(8) !== glb.length) fail('scene.glb header length mismatch');
const jsonLength = glb.readUInt32LE(12);
if (glb.readUInt32LE(16) !== 0x4e4f534a) fail('first GLB chunk is not JSON');
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8').trim());

if (gltf.scene !== 0 || gltf.scenes?.length !== 2) {
  fail('GLB must default to scene 0 and expose scene 1 as the prototype library');
}
if (gltf.scenes[0].nodes.length !== manifest.rootNodes.length) fail('scene root count mismatch');
if (gltf.scenes[1].nodes.length !== manifest.prefabPrototypes.length) {
  fail('prototype root count mismatch');
}
const prefabNodeCount = manifest.prefabPrototypes.reduce((sum, item) => sum + item.nodes.length, 0);
if (gltf.nodes.length !== manifest.nodes.length + prefabNodeCount) fail('GLB node count mismatch');
if (gltf.materials.length !== manifest.materials.length) fail('material index spaces differ');
if (gltf.cameras.length !== manifest.cameras.length) fail('camera count mismatch');

for (const [index, material] of manifest.materials.entries()) {
  if (material.index !== index) fail(`material ${index} has a non-canonical index`);
  if (gltf.materials[index]?.extras?.unityMaterial !== index) {
    fail(`GLB material ${index} does not map back to manifest material ${index}`);
  }
  if (gltf.materials[index]?.name !== material.name) fail(`material ${index} name mismatch`);
}

const verifyRenderableNode = (record, label) => {
  if (record.gltfMesh < 0) return;
  const mesh = gltf.meshes[record.gltfMesh];
  if (!mesh) fail(`${label} references missing GLB mesh ${record.gltfMesh}`);
  const sourceMesh = manifest.meshes[record.mesh];
  if (!sourceMesh) fail(`${label} references missing source mesh ${record.mesh}`);
  if (mesh.primitives.length !== sourceMesh.subMeshCount) fail(`${label} submesh count mismatch`);
  if (!record.renderer) return;
  for (let index = 0; index < mesh.primitives.length; index += 1) {
    const expected = record.renderer.materialIndices[index] ?? -1;
    const actual = mesh.primitives[index].material ?? -1;
    if (expected !== actual) fail(`${label} primitive ${index} material ${actual}; expected ${expected}`);
  }
};

for (const [index, node] of manifest.nodes.entries()) {
  if (node.index !== index || node.gltfNode !== index) fail(`scene node ${index} index mismatch`);
  if (gltf.nodes[index]?.extras?.unityNode !== index) fail(`scene node ${index} GLB mapping mismatch`);
  verifyRenderableNode(node, `scene node ${index}`);
}

for (const prefab of manifest.prefabPrototypes) {
  if (gltf.scenes[1].nodes[prefab.index] !== prefab.gltfRoot) {
    fail(`prefab ${prefab.index} root mapping mismatch`);
  }
  for (const node of prefab.nodes) {
    const gltfNode = gltf.nodes[node.gltfNode];
    if (gltfNode?.extras?.unityPrefab !== prefab.index ||
        gltfNode?.extras?.unityPrefabNode !== node.index) {
      fail(`prefab ${prefab.index} node ${node.index} mapping mismatch`);
    }
    verifyRenderableNode(node, `prefab ${prefab.index} node ${node.index}`);
  }
}

for (const terrain of manifest.terrains) {
  exactSize(terrain.heights, terrain.heightmapResolution ** 2 * 4);
  exactSize(
    terrain.alphamaps,
    terrain.alphamapWidth * terrain.alphamapHeight * terrain.alphamapLayers * 4,
  );
  exactSize(terrain.holes, terrain.holesResolution ** 2);
  for (const control of terrain.controlMaps) {
    exactSize(control.raw, terrain.alphamapWidth * terrain.alphamapHeight * 4);
    exists(control.png);
  }
  for (const detail of terrain.detailPrototypes) {
    exactSize(detail.data, terrain.detailResolution ** 2 * 4);
    if (manifest.schemaVersion >= 2) {
      const native = detail.nativeTransforms;
      if (native?.api !== 'UnityEngine.TerrainData.ComputeDetailInstanceTransforms') {
        fail(`terrain ${terrain.index} detail ${detail.index} lost native transform authority`);
      }
      if (native.strideFloats !== 6 || native.transformCount < 0) {
        fail(`terrain ${terrain.index} detail ${detail.index} native shape drifted`);
      }
      exactSize(native.data, native.transformCount * native.strideFloats * 4);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(exists(native.data))).digest('hex');
      if (digest !== native.sha256) {
        fail(`terrain ${terrain.index} detail ${detail.index} native SHA-256 drifted`);
      }
      if (native.patches.length !== terrain.detailPatchCount ** 2) {
        fail(`terrain ${terrain.index} detail ${detail.index} native patch inventory drifted`);
      }
      let transformOffset = 0;
      for (const [patchIndex, patch] of native.patches.entries()) {
        if (patch.index !== patchIndex || patch.transformOffset !== transformOffset) {
          fail(`terrain ${terrain.index} detail ${detail.index} patch ${patchIndex} offset drifted`);
        }
        transformOffset += patch.count;
      }
      if (transformOffset !== native.transformCount) {
        fail(`terrain ${terrain.index} detail ${detail.index} native patch counts drifted`);
      }
    }
    if (detail.prototype && !manifest.prefabPrototypes[detail.gltfPrefab]) {
      fail(`terrain ${terrain.index} detail ${detail.index} has no prefab prototype`);
    }
  }
  for (const tree of terrain.treePrototypes) {
    if (tree.prefab && !manifest.prefabPrototypes[tree.gltfPrefab]) {
      fail(`terrain ${terrain.index} tree ${tree.index} has no prefab prototype`);
    }
  }
}

for (const texture of manifest.textures) {
  if (texture.exactSourceCopy) exists(texture.exactSourceCopy);
}

if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}
const glbArrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
const parsed = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(glbArrayBuffer, '', resolve, reject);
});
if (parsed.scenes.length !== 2 || parsed.scene !== parsed.scenes[0]) {
  fail('Three.js GLTFLoader did not preserve the two-scene/default-scene contract');
}
if (parsed.scene.children.length !== manifest.rootNodes.length) {
  fail('Three.js scene root count mismatch');
}
if (parsed.scenes[1].children.length !== manifest.prefabPrototypes.length) {
  fail('Three.js prefab-library root count mismatch');
}
for (const [index, rootNode] of parsed.scenes[1].children.entries()) {
  if (rootNode.userData.unityPrefab !== index) {
    fail(`Three.js prefab-library root ${index} lost its unityPrefab mapping`);
  }
}

const summary = manifest.summary;
const expectedSummary = {
  nodeCount: manifest.nodes.length,
  meshGeometryCount: manifest.meshes.length,
  gltfMeshVariantCount: gltf.meshes.length,
  materialCount: manifest.materials.length,
  textureCount: manifest.textures.length,
  cameraCount: manifest.cameras.length,
  lightCount: manifest.lights.length,
  terrainCount: manifest.terrains.length,
  lodGroupCount: manifest.lodGroups.length,
  prefabPrototypeCount: manifest.prefabPrototypes.length,
  prefabPrototypeNodeCount: prefabNodeCount,
};
for (const [key, value] of Object.entries(expectedSummary)) {
  if (summary[key] !== value) fail(`summary.${key} is ${summary[key]}; expected ${value}`);
}

console.log('So Stylized Unity scene export verified');
console.log(`  scene nodes: ${summary.nodeCount}`);
console.log(`  mesh geometries / GLB variants: ${summary.meshGeometryCount} / ${summary.gltfMeshVariantCount}`);
console.log(`  materials / exact texture copies: ${summary.materialCount} / ${summary.textureCount}`);
console.log(`  terrain: ${manifest.terrains.length} (${manifest.terrains[0]?.alphamapLayers ?? 0} splat layers)`);
console.log(`  terrain prefab prototypes / instances: ${summary.prefabPrototypeCount} / ${manifest.terrains.reduce((sum, terrain) => sum + terrain.treeInstances.length, 0)}`);
if (manifest.schemaVersion >= 2) {
  console.log(`  native detail transforms: ${manifest.terrains.reduce((sum, terrain) => (
    sum + terrain.detailPrototypes.reduce((detailSum, detail) => (
      detailSum + detail.nativeTransforms.transformCount
    ), 0)
  ), 0)} / ${manifest.terrains.reduce((sum, terrain) => sum + terrain.detailPrototypes.length, 0)} prototypes`);
}
