#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  buildSoStylizedUnitySceneLeavesMaterial,
  linearizeSoStylizedUnitySceneTreeColorProperty,
} from '../src/environment/soStylizedUnitySceneTreeMaterials.js';
import {
  instantiateSoStylizedUnityMegaTerrainTrees,
} from '../src/environment/soStylizedUnityMegaTerrain.js';
import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
} from '../src/environment/soStylizedUnityRendering.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const UNITY_ASSET_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const BUNDLE_ROOT = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene-native-pc-current',
);
const MANIFEST_PATH = resolve(BUNDLE_ROOT, 'scene-manifest.json');
const CAPTURE_REPORT_PATH = resolve(BUNDLE_ROOT, 'unity-reference.txt');
const LEAVES_GRAPH_PATH = resolve(
  UNITY_ASSET_ROOT,
  'Environment/Trees/Shaders/S_Leaves.shadergraph',
);
const BUSH_MATERIAL_PATH = resolve(
  UNITY_ASSET_ROOT,
  'Environment/Foliage/Materials/M_BushLeaves_Light.mat',
);
const BUSH_PREFAB_PATH = resolve(
  UNITY_ASSET_ROOT,
  'Environment/Foliage/Prefabs/P_Bush2_Light.prefab',
);

const SOURCE_HASHES = Object.freeze({
  captureReport: '9d3c4e758e256013cb1f4fd6517d754b61e86f7ebda7e63f55683651b8b32f98',
  leavesGraph: '94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62',
  manifest: '762ac1e90938e2d793618163dc150990f8c03ccdb02fedde70646c7244170179',
  material: '521f872052f84a73d9f0e4130ffe697f4416708332bc3fafac4e021f5c5e95f9',
  prefab: '9748e8acdc852706550234ee532fcfb6766fed1403cdcc0bc5dbce76602ee586',
});

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

for (const [label, path, expected] of [
  ['capture report', CAPTURE_REPORT_PATH, SOURCE_HASHES.captureReport],
  ['S_Leaves graph', LEAVES_GRAPH_PATH, SOURCE_HASHES.leavesGraph],
  ['native-current manifest', MANIFEST_PATH, SOURCE_HASHES.manifest],
  ['M_BushLeaves_Light', BUSH_MATERIAL_PATH, SOURCE_HASHES.material],
  ['P_Bush2_Light', BUSH_PREFAB_PATH, SOURCE_HASHES.prefab],
]) {
  assert.equal(sha256(path), expected, `${label} changed; re-audit the bright-bush diagnosis`);
}

const captureReport = readFileSync(CAPTURE_REPORT_PATH, 'utf8');
assert.match(captureReport, /^colorSpace=Linear$/m);
assert.match(captureReport, /^scene=Assets\/SoStylized-Unity\/Demo\/M_Demonstration_Mega\.unity$/m);

const graphDocuments = readFileSync(LEAVES_GRAPH_PATH, 'utf8')
  .trim()
  .split(/\n\n(?=\{)/)
  .map(JSON.parse);
for (const referenceName of [
  '_Main_Color',
  '_Gradient_Color',
  '_Specular_Color',
  '_SSS_Color',
]) {
  const property = graphDocuments.find(
    (record) => record.m_DefaultReferenceName === referenceName,
  );
  assert.equal(
    property?.m_Type,
    'UnityEditor.ShaderGraph.Internal.ColorShaderProperty',
    `${referenceName} stopped being a Shader Graph Color property`,
  );
  assert.equal(property.m_ColorMode, 0, `${referenceName} is no longer ColorMode.Default`);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const terrain = manifest.terrains[0];
const instanceIndex = 554;
const instance = terrain.treeInstances[instanceIndex];
assert.deepEqual(instance, {
  position: [
    0.739319920539856,
    0.17733299732208252,
    0.4649674594402313,
  ],
  widthScale: 1.0140198469161987,
  heightScale: 1.0140198469161987,
  rotation: 0.5268228054046631,
  color: [
    0.8549019694328308,
    0.8549019694328308,
    0.8549019694328308,
    1,
  ],
  lightmapColor: [1, 1, 1, 1],
  prototypeIndex: 57,
});

const prototype = terrain.treePrototypes[instance.prototypeIndex];
assert.equal(prototype.prefab.name, 'P_Bush2_Light');
assert.equal(prototype.gltfPrefab, 74);
const prefab = manifest.prefabPrototypes[prototype.gltfPrefab];
assert.equal(prefab.prefab.name, 'P_Bush2_Light');
assert.equal(prefab.nodes.length, 1);
const renderer = prefab.nodes[0].renderer;
assert.equal(renderer.shadowCastingMode, 'On');
assert.equal(renderer.receiveShadows, true);
assert.deepEqual(renderer.materialIndices, [50, 129]);
assert.deepEqual(renderer.materialNames, ['M_OakBark', 'M_BushLeaves_Light']);

const leavesRecord = manifest.materials[129];
assert.equal(leavesRecord.name, 'M_BushLeaves_Light');
assert.equal(leavesRecord.shaderName, 'Shader Graphs/S_Leaves');
const property = (name) => leavesRecord.properties.find((entry) => entry.name === name);
const mainColorSrgb = property('_Main_Color').value.slice(0, 3);
const sssColorSrgb = property('_SSS_Color').value.slice(0, 3);
assert.deepEqual(mainColorSrgb, [
  0.4996262788772583,
  0.7529411911964417,
  0.05098035931587219,
]);
assert.equal(property('_Emissive_Strength').value[0], 0.20000000298023224);
assert.deepEqual(sssColorSrgb, [
  0.40470588207244873,
  0.6000000238418579,
  0.2141176462173462,
]);
assert.equal(property('_SSS_Brightness').value[0], 1);
assert.equal(property('_SSS_Offset').value[0], 0);
assert.equal(property('_UseTwoSidedSign').value[0], 0);

const mainColorLinear = linearizeSoStylizedUnitySceneTreeColorProperty(mainColorSrgb);
const sssColorLinear = linearizeSoStylizedUnitySceneTreeColorProperty(sssColorSrgb);
const close = (actual, expected, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};
[
  0.2136953934818604,
  0.5271151487635913,
  0.004024714025286058,
].forEach((expected, index) => close(mainColorLinear[index], expected));
[
  0.13619032071025391,
  0.3185468059531732,
  0.037675178487582436,
].forEach((expected, index) => close(sssColorLinear[index], expected));
assert.ok(mainColorSrgb[0] / mainColorLinear[0] > 2.33);
assert.ok(mainColorSrgb[1] / mainColorLinear[1] > 1.42);
assert.ok(mainColorSrgb[2] / mainColorLinear[2] > 12.66);

// The graph gates SSS with saturate(dot(WorldSpaceViewDirection,
// MainLightDirection)). Every corner of this prefab's exported Renderer.bounds
// has a negative dot for Camera 0 and the source sun ray, so the suspicious
// patch cannot be SSS. Its only source emission floor is linear BaseColor*.2.
const terrainWorld = manifest.nodes[terrain.node].worldPosition;
const instanceWorld = [
  terrainWorld[0] + instance.position[0] * terrain.size[0],
  terrainWorld[1] + instance.position[1] * terrain.size[1],
  terrainWorld[2] + instance.position[2] * terrain.size[2],
];
const cameraWorld = manifest.nodes[manifest.cameras[0].node].worldPosition;
const mainLightRay = SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.rayDirectionUnity;
const viewLightDots = [];
for (const xSign of [-1, 1]) {
  for (const ySign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const local = [
        renderer.boundsCenter[0] + xSign * renderer.boundsSize[0] * 0.5,
        renderer.boundsCenter[1] + ySign * renderer.boundsSize[1] * 0.5,
        renderer.boundsCenter[2] + zSign * renderer.boundsSize[2] * 0.5,
      ];
      const cosine = Math.cos(instance.rotation);
      const sine = Math.sin(instance.rotation);
      const point = [
        instanceWorld[0]
          + (local[0] * cosine + local[2] * sine) * instance.widthScale,
        instanceWorld[1] + local[1] * instance.heightScale,
        instanceWorld[2]
          + (-local[0] * sine + local[2] * cosine) * instance.widthScale,
      ];
      const view = cameraWorld.map((channel, index) => channel - point[index]);
      const viewLength = Math.hypot(...view);
      viewLightDots.push(view.reduce(
        (sum, channel, index) => sum + channel / viewLength * mainLightRay[index],
        0,
      ));
    }
  }
}
assert.ok(Math.max(...viewLightDots) < -0.71);

class VerificationTextureLoader {
  async loadAsync() {
    return new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
  }
}

const leafMaterial = await buildSoStylizedUnitySceneLeavesMaterial(leavesRecord, {
  coordinateZSign: -1,
  geometryCapabilities: {
    hasTangents: true,
    hasUv2: true,
    hasVertexColors: true,
  },
  textureLoader: new VerificationTextureLoader(),
  textureRecords: manifest.textures,
});
assert.equal(leafMaterial.userData.soStylizedUnityUrpLighting.inputAdapter, 'unity-stage');
assert.equal(leafMaterial.userData.soStylizedUnityUrpLighting.workflow, 'specular');

// Exercise the actual Terrain-tree clone path with just prefab 74 populated.
// This proves the source receive/cast records survive onto the discrete bush;
// the bright shape is not a terrain additive pass or an unlit replacement.
const sourceRoot = new THREE.Group();
const sourceMesh = new THREE.Mesh(new THREE.BufferGeometry(), leafMaterial);
sourceMesh.userData.unityPrefabNode = 0;
sourceRoot.add(sourceMesh);
const prefabRoots = [];
prefabRoots[74] = sourceRoot;
let targetTree = null;
const runtime = instantiateSoStylizedUnityMegaTerrainTrees({
  manifest,
  prefabLibrary: prefabRoots,
  onTreeInstance: (entry) => {
    if (entry.instanceIndex === instanceIndex) targetTree = entry;
  },
});
assert.ok(targetTree, 'TreeInstance[554] was not instantiated');
const runtimeMesh = targetTree.clone.children.find((object) => object.isMesh);
assert.ok(runtimeMesh);
assert.equal(runtimeMesh.castShadow, true);
assert.equal(runtimeMesh.receiveShadow, true);
assert.equal(runtimeMesh.material, leafMaterial);
assert.equal(
  runtimeMesh.material.userData.soStylizedUnityUrpLighting.inputAdapter,
  'unity-stage',
);
runtime.dispose();
sourceMesh.geometry.dispose();
leafMaterial.dispose();

console.log(JSON.stringify({
  cause: 'TreeInstance[554] P_Bush2_Light used serialized sRGB Color properties as linear TSL constants',
  emission: {
    sourceStrength: property('_Emissive_Strength').value[0],
    sssActiveForCamera0Bounds: false,
  },
  instance: {
    index: instanceIndex,
    material: leavesRecord.name,
    prefab: prefab.prefab.name,
    prototypeIndex: instance.prototypeIndex,
  },
  mainColor: {
    correctedLinear: mainColorLinear,
    serializedSrgb: mainColorSrgb,
  },
  routing: {
    castShadow: true,
    receiveShadow: true,
    shader: leavesRecord.shaderName,
    urpLighting: true,
  },
}, null, 2));
