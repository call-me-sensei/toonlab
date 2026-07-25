#!/usr/bin/env node

// Source-only acceptance oracle for one deliberately small, exact rock.
//
// The immutable assertions below prove the Unity scene/export identity, the
// matching local source mesh, S_Rock material resolution, URP lighting model,
// cast/receive flags, and the captured Unity renderer contract. The final
// section reports whether Rock Lab actually wires those pieces together.
// Pass --strict-runtime to turn any reported Rock Lab gap into a non-zero exit.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  createSoStylizedUnityRockMaterialIndex,
  resolveSoStylizedUnityRockMaterial,
} from '../src/environment/soStylizedUnityRockMaterialResolver.js';
import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
} from '../src/environment/soStylizedUnityRendering.js';
import {
  SO_STYLIZED_UNITY_SHADOW_CONTRACT,
  SoStylizedUnityTent7x7ShadowFilter,
  installSoStylizedUnityShadowCasterBias,
} from '../src/environment/soStylizedUnityShadows.js';
import {
  configureSoStylizedUnityStageRenderer,
  createSoStylizedUnityStageLights,
} from '../src/environment/soStylizedUnityStage.js';
import { ROCK_REFERENCE_CATALOG } from '../src/rockgen/reference/referenceCatalog.js';
import { createRockReferenceLodObject } from '../src/rockgen/reference/referenceMeshVariation.js';
import {
  UNITY_ROCK_SHADER_GUID,
  createUnityRockMaterial,
  unityRockProfileFromResolvedMaterial,
} from '../src/rockgen/reference/unityRockMaterial.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(packageRoot, '..');
const unityExportRoot = path.join(
  packageRoot,
  'assets-local/sostylized-unity/mega-scene',
);
const unitySceneManifestPath = path.join(unityExportRoot, 'scene-manifest.json');
const unitySceneGlbPath = path.join(unityExportRoot, 'scene.glb');
const unityRuntimeCapturePath = path.join(unityExportRoot, 'unity-reference.txt');
const unityMaterialLibraryPath = path.join(
  packageRoot,
  'assets-local/sostylized-unity/rock-material-library.json',
);
const localRockReferenceRoot = path.join(packageRoot, 'assets-local/rock-references');
const localRockReferenceManifestPath = path.join(localRockReferenceRoot, 'manifest.json');
const localRockGlbPath = path.join(
  localRockReferenceRoot,
  'SM_RockClassic7/lod0.glb',
);

const SOURCE_NODE_INDEX = 637;
const SOURCE_MESH_INDEX = 185;
const SOURCE_MATERIAL_INDEX = 27;
const SOURCE_GLTF_MESH_INDEX = 208;
const SOURCE_ASSET_NAME = 'SM_RockClassic7';
const SOURCE_REFERENCE_ID = 'so-stylized/classic/rock/07';
const SOURCE_UNITY_MATERIAL = 'MV_RockClassic_Rocks';
const SOURCE_UNREAL_MATERIAL = 'MI_RockClassic_Rocks';
const S_ROCK_SHA256 = 'a3bb01037314605728ba852d407df95e3bd9374f87e42c28cc28da49172e5f5b';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function near(actual, expected, epsilon = 1e-7, label = 'value') {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function vectorNear(actual, expected, epsilon = 1e-7, label = 'vector') {
  assert.equal(actual.length, expected.length, `${label}: channel count`);
  actual.forEach((value, index) => near(
    value,
    expected[index],
    epsilon,
    `${label}[${index}]`,
  ));
}

function parseGlb(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${file}: GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${file}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${file}: GLB byte length`);
  let json = null;
  let binary = null;
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  assert(json, `${file}: JSON chunk`);
  assert(binary, `${file}: BIN chunk`);
  return { binary, file, json };
}

const ACCESSOR_COMPONENTS = Object.freeze({
  5120: Object.freeze({ bytes: 1, read: 'readInt8' }),
  5121: Object.freeze({ bytes: 1, read: 'readUInt8' }),
  5122: Object.freeze({ bytes: 2, read: 'readInt16LE' }),
  5123: Object.freeze({ bytes: 2, read: 'readUInt16LE' }),
  5125: Object.freeze({ bytes: 4, read: 'readUInt32LE' }),
  5126: Object.freeze({ bytes: 4, read: 'readFloatLE' }),
});

const ACCESSOR_WIDTHS = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
});

function readAccessor(glb, accessorIndex) {
  const accessor = glb.json.accessors?.[accessorIndex];
  assert(accessor, `${glb.file}: accessor ${accessorIndex}`);
  assert.equal(accessor.sparse, undefined, `${glb.file}: sparse accessor unsupported by gate`);
  const view = glb.json.bufferViews?.[accessor.bufferView];
  assert(view, `${glb.file}: bufferView ${accessor.bufferView}`);
  const component = ACCESSOR_COMPONENTS[accessor.componentType];
  const width = ACCESSOR_WIDTHS[accessor.type];
  assert(component && width, `${glb.file}: supported accessor encoding`);
  const stride = view.byteStride ?? width * component.bytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, index) => (
    Array.from({ length: width }, (__, channel) => glb.binary[component.read](
      start + index * stride + channel * component.bytes,
    ))
  ));
}

function squaredDistance(left, right) {
  return left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0,
  );
}

function permutations(values) {
  if (values.length < 2) return [[...values]];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((tail) => [value, ...tail]));
}

/**
 * Compares the Unity and local-reference FBX exports without relying on
 * exporter vertex order. Unreal's glTF basis and Unity's glTF basis differ by
 * (-x, y, -z); UV images differ by the normal glTF V-axis convention.
 */
function compareSourceMeshExports({ local, unity }) {
  const positionTolerance = 5e-6;
  const localPositions = readAccessor(local.glb, local.primitive.attributes.POSITION);
  const unityPositions = readAccessor(unity.glb, unity.primitive.attributes.POSITION);
  const localNormals = readAccessor(local.glb, local.primitive.attributes.NORMAL);
  const unityNormals = readAccessor(unity.glb, unity.primitive.attributes.NORMAL);
  const localTangents = readAccessor(local.glb, local.primitive.attributes.TANGENT);
  const unityTangents = readAccessor(unity.glb, unity.primitive.attributes.TANGENT);
  const localUvs = readAccessor(local.glb, local.primitive.attributes.TEXCOORD_0);
  const unityUvs = readAccessor(unity.glb, unity.primitive.attributes.TEXCOORD_0);
  const localIndices = readAccessor(local.glb, local.primitive.indices).flat();
  const unityIndices = readAccessor(unity.glb, unity.primitive.indices).flat();
  const unityColors = readAccessor(unity.glb, unity.primitive.attributes.COLOR_0);

  assert.equal(localPositions.length, 139, 'local source vertex count');
  assert.equal(unityPositions.length, 139, 'Unity source vertex count');
  assert.equal(localIndices.length, 498, 'local source index count');
  assert.equal(unityIndices.length, 498, 'Unity source index count');
  assert(unityColors.every((color) => color.every((channel) => channel === 1)),
    'Unity COLOR_0 is the identity value omitted by the local reference export');

  // Cluster position-identical seam vertices. This preserves surface topology
  // while allowing the exporters to order UV/tangent seam duplicates freely.
  const clusters = [];
  for (let index = 0; index < unityPositions.length; index += 1) {
    const position = unityPositions[index];
    let cluster = clusters.find((candidate) => (
      squaredDistance(candidate.position, position) <= positionTolerance ** 2
    ));
    if (!cluster) {
      cluster = { local: [], position, unity: [] };
      clusters.push(cluster);
    }
    cluster.unity.push(index);
  }

  let maxPositionError = 0;
  const localClusterIndex = [];
  for (let index = 0; index < localPositions.length; index += 1) {
    const localPosition = localPositions[index];
    const transformed = [-localPosition[0], localPosition[1], -localPosition[2]];
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    for (let candidateIndex = 0; candidateIndex < clusters.length; candidateIndex += 1) {
      const distance = squaredDistance(transformed, clusters[candidateIndex].position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = candidateIndex;
      }
    }
    const error = Math.sqrt(nearestDistance);
    maxPositionError = Math.max(maxPositionError, error);
    assert(error <= positionTolerance, `local vertex ${index} matches a Unity source vertex`);
    localClusterIndex[index] = nearestIndex;
    clusters[nearestIndex].local.push(index);
  }
  for (const cluster of clusters) {
    assert.equal(
      cluster.local.length,
      cluster.unity.length,
      'position cluster preserves UV/tangent seam multiplicity',
    );
  }

  const unityClusterIndex = Array(unityPositions.length);
  clusters.forEach((cluster, clusterIndex) => {
    for (const vertexIndex of cluster.unity) unityClusterIndex[vertexIndex] = clusterIndex;
  });
  const canonicalFaces = (indices, mapping) => Array.from(
    { length: indices.length / 3 },
    (_, faceIndex) => indices
      .slice(faceIndex * 3, faceIndex * 3 + 3)
      .map((vertexIndex) => mapping[vertexIndex])
      .sort((left, right) => left - right)
      .join(','),
  ).sort();
  assert.deepEqual(
    canonicalFaces(localIndices, localClusterIndex),
    canonicalFaces(unityIndices, unityClusterIndex),
    'source surface triangle topology after handedness conversion',
  );

  let maxNormalError = 0;
  let maxTangentError = 0;
  let maxUvError = 0;
  for (const cluster of clusters) {
    let best = null;
    for (const assignment of permutations(cluster.unity)) {
      let score = 0;
      for (let index = 0; index < assignment.length; index += 1) {
        const localIndex = cluster.local[index];
        const unityIndex = assignment[index];
        const normal = [
          -localNormals[localIndex][0],
          localNormals[localIndex][1],
          -localNormals[localIndex][2],
        ];
        const uv = [localUvs[localIndex][0], 1 - localUvs[localIndex][1]];
        score += squaredDistance(normal, unityNormals[unityIndex]);
        score += squaredDistance(uv, unityUvs[unityIndex]);
      }
      if (!best || score < best.score) best = { assignment, score };
    }
    assert(best, 'seam-vertex assignment');
    for (let index = 0; index < best.assignment.length; index += 1) {
      const localIndex = cluster.local[index];
      const unityIndex = best.assignment[index];
      const normal = [
        -localNormals[localIndex][0],
        localNormals[localIndex][1],
        -localNormals[localIndex][2],
      ];
      const tangent = [
        -localTangents[localIndex][0],
        localTangents[localIndex][1],
        -localTangents[localIndex][2],
        localTangents[localIndex][3],
      ];
      const uv = [localUvs[localIndex][0], 1 - localUvs[localIndex][1]];
      maxNormalError = Math.max(
        maxNormalError,
        ...normal.map((value, channel) => Math.abs(value - unityNormals[unityIndex][channel])),
      );
      maxTangentError = Math.max(
        maxTangentError,
        ...tangent.map((value, channel) => Math.abs(value - unityTangents[unityIndex][channel])),
      );
      maxUvError = Math.max(
        maxUvError,
        ...uv.map((value, channel) => Math.abs(value - unityUvs[unityIndex][channel])),
      );
    }
  }
  assert(maxNormalError < 0.006, 'source normals agree across FBX importers');
  assert(maxTangentError < 0.006, 'source tangents agree across FBX importers');
  assert(maxUvError < 0.001, 'source UV0 agrees after V-axis conversion');

  return {
    localIndices,
    localNormals,
    localPositions,
    localTangents,
    localUvs,
    maxNormalError,
    maxPositionError,
    maxTangentError,
    maxUvError,
    triangleCount: localIndices.length / 3,
    uniquePositionCount: clusters.length,
    vertexCount: localPositions.length,
  };
}

function rotateUnityForward(quaternion) {
  const [x, y, z, w] = quaternion;
  const ix = y;
  const iy = -x;
  const iz = w;
  const iw = -z;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function verifyOptionalSourceFiles() {
  const sourceFiles = {
    cameraPrefab:
      '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity/'
      + 'Demo/Prefabs/P_SpectatorCamera.prefab',
    renderer:
      '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/'
      + 'SourceFiles/Settings/PC_Renderer.asset',
    renderPipeline:
      '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/'
      + 'SourceFiles/Settings/PC_RPAsset.asset',
    scene: path.join(workspaceRoot, 'SoStylized-Unity/Demo/M_Demonstration_Mega.unity'),
    shaderGraph: path.join(
      workspaceRoot,
      'SoStylized-Unity/Environment/Rocks/Shaders/S_Rock.shadergraph',
    ),
    volumeProfile:
      '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity/'
      + 'Materials/Global Volume Profile.asset',
  };
  const verified = [];
  if (fs.existsSync(sourceFiles.shaderGraph)) {
    const source = fs.readFileSync(sourceFiles.shaderGraph);
    assert.equal(sha256(source), S_ROCK_SHA256, 'S_Rock Shader Graph source hash');
    const text = source.toString('utf8');
    assert.match(text, /"m_WorkflowMode": 1/);
    assert.match(text, /"m_SurfaceType": 0/);
    assert.match(text, /"m_CastShadows": true/);
    assert.match(text, /"m_ReceiveShadows": true/);
    verified.push(sourceFiles.shaderGraph);
  }
  if (fs.existsSync(sourceFiles.scene)) {
    const text = fs.readFileSync(sourceFiles.scene, 'utf8');
    assert.match(text, /m_Fog:\s*1/);
    assert.match(text, /m_FogMode:\s*2/);
    assert.match(text, /m_FogDensity:\s*0\.0012/);
    assert.match(text, /m_AmbientIntensity:\s*1/);
    assert.match(text, /guid:\s*a106f21ac43242f4981fcaf37cd18911/);
    assert.match(text, /value:\s*P_RockClassic7/);
    verified.push(sourceFiles.scene);
  }
  if (fs.existsSync(sourceFiles.renderPipeline)) {
    const text = fs.readFileSync(sourceFiles.renderPipeline, 'utf8');
    assert.match(text, /m_MainLightShadowmapResolution:\s*2048/);
    assert.match(text, /m_ShadowDistance:\s*50/);
    assert.match(text, /m_ShadowCascadeCount:\s*4/);
    assert.match(text, /m_Cascade4Split:\s*\{x:\s*0\.12299999,\s*y:\s*0\.2926,\s*z:\s*0\.53599995\}/);
    assert.match(text, /m_CascadeBorder:\s*0\.107758604/);
    assert.match(text, /m_ShadowDepthBias:\s*0\.1/);
    assert.match(text, /m_ShadowNormalBias:\s*0\.5/);
    assert.match(text, /m_SoftShadowQuality:\s*3/);
    verified.push(sourceFiles.renderPipeline);
  }
  if (fs.existsSync(sourceFiles.renderer)) {
    const text = fs.readFileSync(sourceFiles.renderer, 'utf8');
    assert.match(text, /m_Name:\s*ScreenSpaceAmbientOcclusion/);
    assert.match(text, /Intensity:\s*0\.4/);
    assert.match(text, /DirectLightingStrength:\s*0\.25/);
    assert.match(text, /Radius:\s*0\.3/);
    verified.push(sourceFiles.renderer);
  }
  if (fs.existsSync(sourceFiles.cameraPrefab)) {
    const text = fs.readFileSync(sourceFiles.cameraPrefab, 'utf8');
    assert.match(text, /m_RenderPostProcessing:\s*1/);
    assert.match(text, /m_Antialiasing:\s*3/);
    assert.match(text, /m_Quality:\s*3/);
    assert.match(text, /m_FrameInfluence:\s*0\.1/);
    assert.match(text, /m_JitterScale:\s*1/);
    assert.match(text, /m_VarianceClampScale:\s*0\.9/);
    verified.push(sourceFiles.cameraPrefab);
  }
  if (fs.existsSync(sourceFiles.volumeProfile)) {
    const text = fs.readFileSync(sourceFiles.volumeProfile, 'utf8');
    assert.match(text, /m_Name:\s*Bloom[\s\S]*?threshold:[\s\S]*?m_Value:\s*1\.1/);
    assert.match(text, /m_Name:\s*Bloom[\s\S]*?intensity:[\s\S]*?m_Value:\s*6/);
    assert.match(text, /m_Name:\s*Vignette[\s\S]*?intensity:[\s\S]*?m_Value:\s*0\.4/);
    assert.match(text, /m_Name:\s*ColorAdjustments[\s\S]*?contrast:[\s\S]*?m_Value:\s*20/);
    assert.match(text, /m_Name:\s*ColorAdjustments[\s\S]*?saturation:[\s\S]*?m_Value:\s*-3\.3/);
    assert.match(text, /m_Name:\s*DepthOfField[\s\S]*?active:\s*0/);
    verified.push(sourceFiles.volumeProfile);
  }
  return verified;
}

function runtimeSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(resolved);
    return /\.(?:js|jsx)$/.test(entry.name) ? [resolved] : [];
  });
}

function runtimeCheck(id, pass, expectation) {
  return { expectation, id, pass: Boolean(pass) };
}

const sceneManifest = readJson(unitySceneManifestPath);
const sourceNode = sceneManifest.nodes[SOURCE_NODE_INDEX];
const sourceMesh = sceneManifest.meshes[SOURCE_MESH_INDEX];
const sourceMaterial = sceneManifest.materials[SOURCE_MATERIAL_INDEX];
const sourceCamera = sceneManifest.cameras[0];
const sourceCameraNode = sceneManifest.nodes[sourceCamera.node];
const sourceLight = sceneManifest.lights[0];
const sourceLightNode = sceneManifest.nodes[sourceLight.node];
const renderContract = SO_STYLIZED_UNITY_RENDER_CONTRACT;

assert.equal(sceneManifest.schema, 'toonlab.sostylized-unity.scene-export');
assert.equal(sceneManifest.sourceScene, renderContract.scene);
assert.equal(sceneManifest.renderSettings.colorSpace, renderContract.pipeline.colorSpace);
assert.equal(sourceNode.name, 'P_RockClassic7');
assert.equal(sourceNode.parent, -1);
assert.equal(sourceNode.prefab.guid, 'a106f21ac43242f4981fcaf37cd18911');
assert.equal(sourceNode.mesh, SOURCE_MESH_INDEX);
assert.equal(sourceNode.gltfMesh, SOURCE_GLTF_MESH_INDEX);
assert.equal(sourceNode.renderer.enabled, true);
assert.equal(sourceNode.renderer.shadowCastingMode, 'On');
assert.equal(sourceNode.renderer.receiveShadows, true);
assert.deepEqual(sourceNode.renderer.materialIndices, [SOURCE_MATERIAL_INDEX]);
assert.equal(sourceMesh.name, 'RockClassic7');
assert.equal(
  sourceMesh.asset.path,
  'Assets/SoStylized-Unity/Environment/Rocks/Classic/Meshes/SM_RockClassic7.fbx',
);
assert.equal(sourceMesh.asset.guid, '8ca19ef0600fbb648b16441a49a4e589');
assert.equal(sourceMesh.vertexCount, 139);
assert.deepEqual(sourceMesh.attributes, [
  'POSITION',
  'NORMAL',
  'TANGENT',
  'COLOR_0',
  'TEXCOORD_0',
]);
assert.equal(sourceMesh.subMeshCount, 1);
assert.equal(sourceMesh.submeshes[0].indexCount, 498);
assert.equal(sourceMesh.submeshes[0].topology, 'Triangles');
assert.equal(sourceMaterial.name, SOURCE_UNITY_MATERIAL);
assert.equal(sourceMaterial.shaderName, 'Shader Graphs/S_Rock');
assert.equal(sourceMaterial.shader.guid, UNITY_ROCK_SHADER_GUID);
assert.equal(sourceMaterial.renderQueue, 2000);

const propertyMap = new Map(sourceMaterial.properties.map((property) => [property.name, property]));
assert.equal(propertyMap.get('_Rock_Scale').value[0], 10);
assert.equal(propertyMap.get('_Rock_Normal_Flatten').value[0], -0.10000000149011612);
assert.equal(propertyMap.get('_UseSmoothedNormalMap').value[0], 1);
assert.equal(propertyMap.get('_RockMetallic').value[0], 0.20000000298023225);
assert.equal(propertyMap.get('_Smoothness').value[0], 0.10000000149011612);
assert.equal(propertyMap.get('_TopGrass').value[0], 0);
assert.equal(sceneManifest.textures[propertyMap.get('_Rock_Texture').texture].name,
  'T_RockClassic_Rocks_BC');
assert.equal(sceneManifest.textures[propertyMap.get('_Stylized_Normal_Map').texture].name,
  'T_RocksClassic_Rocks_N');

assert.equal(sceneManifest.renderSettings.fog, true);
assert.equal(sceneManifest.renderSettings.fogMode, renderContract.fog.mode);
near(sceneManifest.renderSettings.fogDensity, renderContract.fog.density, 1e-9, 'fog density');
vectorNear(
  sceneManifest.renderSettings.fogColor.slice(0, 3),
  renderContract.fog.colorSrgb,
  3e-7,
  'fog color',
);
assert.equal(sceneManifest.renderSettings.ambientMode, renderContract.ambientProbe.mode);
near(sceneManifest.renderSettings.ambientIntensity, renderContract.ambientProbe.intensity, 0,
  'ambient intensity');
vectorNear(
  sceneManifest.renderSettings.ambientSkyColor.slice(0, 3),
  renderContract.ambientProbe.skyColorSrgb,
  3e-7,
  'ambient sky',
);
assert.equal(sceneManifest.renderSettings.skybox, -1);
assert.equal(sceneManifest.renderSettings.customReflection, -1);

assert.equal(sourceLight.type, renderContract.sun.type);
near(sourceLight.intensity, renderContract.sun.intensity, 0, 'sun intensity');
vectorNear(sourceLight.color.slice(0, 3), renderContract.sun.colorSrgb, 1e-8, 'sun color');
assert.equal(sourceLight.shadows, renderContract.sun.shadows);
near(sourceLight.shadowStrength, renderContract.sun.shadowStrength, 0, 'shadow strength');
near(sourceLight.shadowBias, renderContract.sun.lightBias, 3e-8, 'light shadow bias');
near(sourceLight.shadowNormalBias, renderContract.sun.normalBias, 2e-8, 'light normal bias');
near(sourceLight.shadowNearPlane, renderContract.sun.nearPlane, 2e-8, 'shadow near plane');
vectorNear(
  rotateUnityForward(sourceLightNode.worldRotation),
  renderContract.sun.rayDirectionUnity,
  6e-8,
  'sun ray direction from exported quaternion',
);

assert.equal(sourceCamera.fieldOfView, renderContract.camera.fieldOfView);
assert.equal(sourceCamera.nearClipPlane, renderContract.camera.near);
assert.equal(sourceCamera.farClipPlane, renderContract.camera.far);
assert.equal(sourceCamera.allowHDR, true);
assert.equal(sourceCamera.orthographic, false);
vectorNear(sourceCameraNode.worldPosition, [268.2099914550781, 10.350000381469727, -14.960000038146973], 0,
  'captured camera position');

const unityRuntimeCapture = fs.readFileSync(unityRuntimeCapturePath, 'utf8');
assert.match(unityRuntimeCapture, /camera\.fieldOfView=60/);
assert.match(unityRuntimeCapture, /camera\.near=1/);
assert.match(unityRuntimeCapture, /camera\.far=500000/);
assert.match(unityRuntimeCapture, /camera\.post=True/);
assert.match(unityRuntimeCapture, /camera\.antialiasing=TemporalAntiAliasing/);
assert.match(
  unityRuntimeCapture,
  /ambient\.probe=0\.08701412,0\.2798782,0\.6684512;(?:0,0,0;){7}0,0,0/,
);
assert.match(unityRuntimeCapture, /shadowDistance=50,shadowCascades=4,mainShadowResolution=2048/);

assert.equal(renderContract.shadows.distance, 50);
assert.equal(renderContract.shadows.cascadeCount, 4);
assert.deepEqual(renderContract.shadows.cascadeSplits, [0.12299999, 0.2926, 0.53599995, 1]);
assert.equal(renderContract.shadows.mainResolution, 2048);
assert.equal(renderContract.shadows.pipelineDepthBias, 0.1);
assert.equal(renderContract.shadows.pipelineNormalBias, 0.5);
assert.equal(renderContract.shadows.softShadowQuality, 3);
assert.deepEqual(renderContract.ambientProbe.coefficient0Linear, [0.08701412, 0.2798782, 0.6684512]);
assert.equal(renderContract.ambientProbe.coefficients1Through8, 'zero');
assert.equal(renderContract.camera.antiAliasing, 'TemporalAntiAliasing');
assert.equal(renderContract.camera.taa.frameInfluence, 0.1);
assert.equal(renderContract.ssao.intensity, 0.4);
assert.equal(renderContract.bloom.intensity, 6);
assert.equal(renderContract.vignette.intensity, 0.4);
assert.equal(renderContract.colorGrade.contrast, 20);
assert.equal(renderContract.colorGrade.saturation, -3.3);
assert.equal(renderContract.depthOfField.active, false);

const unityGlb = parseGlb(unitySceneGlbPath);
const unityGltfNode = unityGlb.json.nodes[SOURCE_NODE_INDEX];
assert.equal(unityGltfNode.extras.unityNode, SOURCE_NODE_INDEX);
assert.equal(unityGltfNode.mesh, SOURCE_GLTF_MESH_INDEX);
const unityGltfMesh = unityGlb.json.meshes[SOURCE_GLTF_MESH_INDEX];
assert.equal(unityGltfMesh.extras.unityMesh, SOURCE_MESH_INDEX);
assert.equal(unityGltfMesh.primitives.length, 1);
assert.equal(unityGltfMesh.primitives[0].material, SOURCE_MATERIAL_INDEX);
assert.equal(unityGlb.json.materials[SOURCE_MATERIAL_INDEX].name, SOURCE_UNITY_MATERIAL);

assert(fs.existsSync(localRockReferenceManifestPath),
  'local source reference manifest; run export-rock-reference-assets.mjs');
assert(fs.existsSync(localRockGlbPath),
  'local SM_RockClassic7 source GLB; run export-rock-reference-assets.mjs');
const localReferenceManifest = readJson(localRockReferenceManifestPath);
const localReference = localReferenceManifest.entries.find(
  (entry) => entry.sourceAssetName === SOURCE_ASSET_NAME,
);
assert(localReference, 'SM_RockClassic7 local reference record');
assert.equal(localReference.sourcePath,
  '/Game/SoStylized/Environment/Rocks/Classic/SM_RockClassic7');
assert.deepEqual(localReference.lods.map((lod) => lod.triangles), [166, 82]);
assert.deepEqual(localReference.materials, [
  '/Game/SoStylized/Environment/Rocks/Materials/Classic/'
  + 'MI_RockClassic_Rocks.MI_RockClassic_Rocks',
]);

const catalogEntry = ROCK_REFERENCE_CATALOG.find(
  (entry) => entry.sourceAssetName === SOURCE_ASSET_NAME,
);
assert(catalogEntry, 'SM_RockClassic7 audited catalog entry');
assert.equal(catalogEntry.id, SOURCE_REFERENCE_ID);
assert.deepEqual(catalogEntry.target.lodTriangles, [166, 82]);

const localGlb = parseGlb(localRockGlbPath);
assert.equal(localGlb.json.meshes.length, 1);
assert.equal(localGlb.json.meshes[0].name, SOURCE_ASSET_NAME);
const localPrimitive = localGlb.json.meshes[0].primitives[0];
assert.equal(localGlb.json.materials[localPrimitive.material].name, SOURCE_UNREAL_MATERIAL);
const meshComparison = compareSourceMeshExports({
  local: { glb: localGlb, primitive: localPrimitive },
  unity: { glb: unityGlb, primitive: unityGltfMesh.primitives[0] },
});

const materialLibrary = readJson(unityMaterialLibraryPath);
const materialIndex = createSoStylizedUnityRockMaterialIndex(materialLibrary);
const materialResolution = resolveSoStylizedUnityRockMaterial(
  localReference.materials[0],
  { index: materialIndex, sourceAssetName: SOURCE_ASSET_NAME },
);
assert(materialResolution, 'Unity material resolution for SM_RockClassic7');
assert.equal(materialResolution.isExact, true);
assert.equal(materialResolution.unityMaterialName, SOURCE_UNITY_MATERIAL);
assert.equal(materialResolution.materialRecord.guid, '8f0029f077d0f4c4fa259d719bc3590c');
assert.equal(
  materialResolution.materialRecord.sourceSha256,
  'c7fc7a9a45bc257089562f8c04ce002fda46598e2d388460734dd24974bd81df',
);
assert.equal(materialResolution.materialRecord.shader.guid, UNITY_ROCK_SHADER_GUID);

const materialProfile = unityRockProfileFromResolvedMaterial(
  materialResolution.materialRecord,
);
assert.equal(materialProfile.sourceName, SOURCE_UNITY_MATERIAL);
assert.equal(materialProfile.coordinates.distanceScale, 1);
assert.equal(materialProfile.base.scale, 10);
assert.equal(materialProfile.base.metallic, 0.2);
assert.equal(materialProfile.base.smoothness, 0.1);
assert.equal(materialProfile.normals.nearFlatten, -0.1);
assert.equal(materialProfile.normals.useSmoothed, true);
assert.equal(materialProfile.layers.grass.enabled, false);

const placeholderTexture = new THREE.DataTexture(
  new Uint8Array([128, 128, 255, 255]),
  1,
  1,
);
placeholderTexture.needsUpdate = true;
const unityRockMaterial = createUnityRockMaterial({
  profile: materialProfile,
  textures: {
    rock: placeholderTexture,
    rockNormal: placeholderTexture,
    smoothness: placeholderTexture,
    stylizedNormal: placeholderTexture,
  },
});
assert.equal(unityRockMaterial.isNodeMaterial, true);
assert.equal(unityRockMaterial.transparent, false);
assert.equal(unityRockMaterial.depthWrite, true);
assert.equal(unityRockMaterial.userData.unitySourceShader.guid, UNITY_ROCK_SHADER_GUID);
assert.equal(unityRockMaterial.userData.soStylizedUnityUrpLighting.workflow, 'metallic');
assert.equal(unityRockMaterial.setupLightingModel().constructor.name,
  'SoStylizedUnityUrpLightingModel');
installSoStylizedUnityShadowCasterBias(unityRockMaterial, {
  directionToLight: renderContract.sun.rayDirection.map((value) => -value),
});
assert.equal(unityRockMaterial.castShadowPositionNode?.isNode, true);
assert.deepEqual(
  unityRockMaterial.userData.soStylizedUnityShadowCaster.appliedBias,
  {
    depth: SO_STYLIZED_UNITY_SHADOW_CONTRACT.effectiveBias.depth,
    normal: SO_STYLIZED_UNITY_SHADOW_CONTRACT.effectiveBias.normal,
  },
);
assert.equal(
  unityRockMaterial.userData.soStylizedUnityShadowCaster.serializedLightBias
    .bypassedAtRuntime,
  true,
);

const sourceGeometry = new THREE.BufferGeometry();
sourceGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(meshComparison.localPositions.flat(), 3),
);
sourceGeometry.setAttribute(
  'normal',
  new THREE.Float32BufferAttribute(meshComparison.localNormals.flat(), 3),
);
sourceGeometry.setAttribute(
  'tangent',
  new THREE.Float32BufferAttribute(meshComparison.localTangents.flat(), 4),
);
sourceGeometry.setAttribute(
  'uv',
  new THREE.Float32BufferAttribute(meshComparison.localUvs.flat(), 2),
);
sourceGeometry.setIndex(meshComparison.localIndices);
sourceGeometry.computeBoundingBox();
sourceGeometry.computeBoundingSphere();
const referenceBuild = createRockReferenceLodObject({
  entry: catalogEntry,
  lods: [{ geometry: sourceGeometry, lod: 0, triangles: 166 }],
  unityMaterial: unityRockMaterial,
}, {
  geometryMode: 'original',
  materialMode: 'unity',
  seed: 0,
  strength: 1,
});
assert.equal(referenceBuild.lod.userData.toonlabRockReference.geometryMode, 'original');
assert.equal(referenceBuild.lod.userData.toonlabRockReference.materialMode, 'unity');
assert.equal(referenceBuild.profile.strength, 0);
assert.deepEqual(
  Array.from(referenceBuild.levels[0].geometry.getAttribute('position').array),
  Array.from(sourceGeometry.getAttribute('position').array),
  'original mode is an identity geometry clone',
);
assert.equal(referenceBuild.levels[0].mesh.castShadow, true);
assert.equal(referenceBuild.levels[0].mesh.receiveShadow, true);
assert.equal(
  referenceBuild.levels[0].material.userData.unitySourceShader.guid,
  UNITY_ROCK_SHADER_GUID,
);
assert.equal(
  referenceBuild.levels[0].material.setupLightingModel().constructor.name,
  'SoStylizedUnityUrpLightingModel',
  'the cloned reference material retains the custom URP lighting model',
);
assert.equal(
  referenceBuild.levels[0].material.castShadowPositionNode?.isNode,
  true,
  'the cloned reference material retains Unity caster-space shadow bias',
);
assert.equal(
  referenceBuild.levels[0].material.userData.soStylizedUnityShadowCaster
    .exactApplyShadowBias,
  true,
);

const stageScene = new THREE.Scene();
stageScene.add(new THREE.DirectionalLight(), new THREE.AmbientLight());
const stageLights = createSoStylizedUnityStageLights(stageScene);
assert.equal(stageLights.importedLightCountRemoved, 2);
assert.equal(stageLights.ambient.name, 'Unity RenderSettings constant SH0 ambient probe');
vectorNear(
  stageLights.ambient.color.toArray(),
  renderContract.ambientProbe.coefficient0Linear,
  1e-12,
  'runtime ambient SH0',
);
near(
  stageLights.ambient.intensity,
  renderContract.ambientProbe.intensity * renderContract.ambientProbe.threeLambertInputScale,
  1e-12,
  'runtime ambient convention conversion',
);
assert.equal(stageLights.light.name, 'Unity Main Directional Light');
vectorNear(stageLights.light.color.toArray(), renderContract.sun.colorLinear, 1e-12,
  'runtime sun color');
near(
  stageLights.light.intensity,
  renderContract.sun.intensity * renderContract.sun.threeLambertInputScale,
  1e-12,
  'runtime sun convention conversion',
);
assert.equal(stageLights.light.castShadow, true);
assert.equal(
  renderContract.shadows.mainResolution,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.atlasResolution,
  'Unity source records a 2048px main-light atlas',
);
assert.deepEqual(stageLights.light.shadow.mapSize.toArray(), [
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeTileResolution,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeTileResolution,
]);
assert.equal(stageLights.light.shadow.bias, 0);
assert.equal(stageLights.light.shadow.normalBias, 0);
assert.equal(stageLights.light.shadow.filterNode, SoStylizedUnityTent7x7ShadowFilter);
assert.equal(stageLights.light.shadow.soStylizedUnity.exactFilter, true);
assert.equal(
  stageLights.light.shadow.soStylizedUnity.comparisonSamples,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter.comparisonSamples,
);
assert.equal(stageLights.cascadedShadows.length, 1);
const csm = stageLights.cascadedShadows[0];
assert.equal(stageLights.light.shadow.shadowNode, csm);
assert.equal(csm.cascades, SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeCount);
assert.equal(csm.maxFar, SO_STYLIZED_UNITY_SHADOW_CONTRACT.distance);
assert.equal(csm.fade, false);
assert.equal(
  csm.updateBeforeType,
  'render',
  'CSM light/camera placement refreshes through the render-update lifecycle',
);
const resolvedSplits = [];
csm.customSplitsCallback(4, renderContract.camera.near, renderContract.camera.far, resolvedSplits);
assert.deepEqual(resolvedSplits, renderContract.shadows.cascadeSplits);
assert.deepEqual(
  csm.userData.soStylizedUnity.exact.cascadeSplits,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeSplits,
);
assert.equal(
  csm.userData.soStylizedUnity.exact.tileResolution,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeTileResolution,
);
assert.equal(
  csm.userData.soStylizedUnity.exact.shadowFilter,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter.name,
);
assert.equal(
  csm.userData.soStylizedUnity.exact.comparisonSamples,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter.comparisonSamples,
);
assert.deepEqual(
  csm.userData.soStylizedUnity.exact.effectiveBias,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.effectiveBias,
);
assert.equal(csm.userData.soStylizedUnity.exactDistanceFade, true);
assert.equal(csm.userData.soStylizedUnity.exactTentFilter, true);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.depth, 0.92);
assert.equal(SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.normal, 0.8);
assert.equal(
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.serializedLightBias.bypassedAtRuntime,
  true,
);
assert.equal(stageLights.remainingBridges.length, 2);
assert(stageLights.remainingBridges.some((bridge) => /culling spheres/i.test(bridge)));
assert(stageLights.remainingBridges.some((bridge) => /standalone 1024px maps/i.test(bridge)));

const rendererStub = {
  domElement: { style: { filter: 'unexpected' } },
  outputColorSpace: null,
  shadowMap: { enabled: false, type: null },
  toneMapping: null,
  toneMappingExposure: 0,
};
const rendererScene = new THREE.Scene();
rendererScene.fog = new THREE.Fog();
rendererScene.fogNode = {};
const rendererMetadata = configureSoStylizedUnityStageRenderer(rendererStub, rendererScene);
assert.equal(rendererScene.fog, null, 'native Three fog is disabled for Unity post fog');
assert.equal(rendererScene.fogNode, null, 'native Three fog node is disabled for Unity post fog');
assert.equal(rendererStub.shadowMap.enabled, true);
assert.equal(rendererStub.shadowMap.type, THREE.PCFSoftShadowMap);
assert.equal(rendererStub.toneMapping, THREE.NoToneMapping);
assert.equal(rendererStub.toneMappingExposure, 1);
assert.equal(rendererStub.outputColorSpace, THREE.SRGBColorSpace);
assert.equal(rendererStub.domElement.style.filter, 'none');
assert.equal(rendererMetadata.fogPlacement, 'post-opaque before TAA/bloom/vignette/LDR grade');

const optionalSourceFilesVerified = verifyOptionalSourceFiles();

const rockLabRoot = path.join(packageRoot, 'labs/rock-lab');
const rockLabFiles = runtimeSourceFiles(rockLabRoot);
const rockLabSources = new Map(rockLabFiles.map((file) => [
  file,
  fs.readFileSync(file, 'utf8'),
]));
const rockLabSource = [...rockLabSources.values()].join('\n');
const rockSceneSource = rockLabSources.get(path.join(rockLabRoot, 'rockScene.js')) ?? '';
const rockEngineSource = rockLabSources.get(path.join(rockLabRoot, 'engine/rockEngine.js')) ?? '';
const unityShadowRuntimeSource = fs.readFileSync(
  path.join(packageRoot, 'src/environment/soStylizedUnityShadows.js'),
  'utf8',
);
const unityUrpRuntimeSource = fs.readFileSync(
  path.join(packageRoot, 'src/environment/soStylizedUnityUrpLighting.js'),
  'utf8',
);
const sourceShowcaseSource = fs.readFileSync(
  path.join(packageRoot, 'examples/source-showcase/main.js'),
  'utf8',
);
const unityMaterialCallStart = rockEngineSource.indexOf(
  'const unityMaterial = await loadUnityRockMaterial',
);
const unityMaterialCall = unityMaterialCallStart >= 0
  ? rockEngineSource.slice(unityMaterialCallStart, unityMaterialCallStart + 1200)
  : '';

const runtimeChecks = [
  runtimeCheck(
    'exact-reference-route',
    /urlParams\.get\(['"]rockType['"]\)/.test(rockLabSource)
      && /referenceGeometryMode/.test(rockLabSource)
      && /geometryMode:\s*state\.referenceGeometryMode/.test(rockEngineSource),
    `Rock Lab routes ${SOURCE_REFERENCE_ID} through referenceGeometryMode=original`,
  ),
  runtimeCheck(
    'toonlab-source-material-route',
    /state\.referenceMaterialMode\s*===\s*['"]toonlab['"]/.test(rockEngineSource)
      && /resolveSoStylizedUnityRockMaterial\s*\(/.test(rockEngineSource)
      && /loadUnityRockMaterial\s*\(/.test(rockEngineSource),
    `ToonLab resolves ${SOURCE_UNREAL_MATERIAL} through the exact S_Rock source-derived material builder`,
  ),
  runtimeCheck(
    'toonlab-product-default',
    /normalizeReferenceMaterialMode\(value,\s*fallback\s*=\s*['"]toonlab['"]\)/.test(rockLabSource)
      && /value\s*===\s*['"]unity['"]\s*\?\s*['"]toonlab['"]/.test(rockLabSource)
      && /label:\s*['"]ToonLab['"][\s\S]*?value:\s*['"]toonlab['"]/.test(rockLabSource)
      && !/label:\s*['"]Unity['"][\s\S]*?value:\s*['"]unity['"]/.test(rockLabSource),
    'Rock Lab exposes the verified shader as ToonLab, defaults to it, and migrates old Unity-labelled URLs',
  ),
  runtimeCheck(
    'unity-metre-distance-contract',
    /distanceScale:\s*1(?:\s*[,}])/.test(unityMaterialCall)
      && !/distanceScale:\s*0\.01(?:\s*[,}])/.test(unityMaterialCall),
    'Unity S_Rock world-distance thresholds remain in metres (distanceScale=1)',
  ),
  runtimeCheck(
    'unity-stage-lights',
    /createSoStylizedUnityStageLights\s*\(/.test(rockLabSource),
    'Rock Lab calls the exact SH0 ambient + direct-sun + four-cascade stage factory',
  ),
  runtimeCheck(
    'unity-stage-renderer',
    /configureSoStylizedUnityStageRenderer\s*\(/.test(rockLabSource),
    'Rock Lab configures linear HDR, PCFSoft shadow comparison, no native fog, and no tone map',
  ),
  runtimeCheck(
    'unity-camera-contract',
    /SO_STYLIZED_UNITY_RENDER_CONTRACT/.test(rockLabSource)
      && /camera\.fieldOfView/.test(rockLabSource)
      && /camera\.near/.test(rockLabSource)
      && /camera\.far/.test(rockLabSource),
    'Rock Lab takes 60-degree FOV, 1 m near, and 500000 m far from the Unity camera contract',
  ),
  runtimeCheck(
    'unity-csm-render-updates',
    /createSoStylizedUnityStageLights\s*\(/.test(rockLabSource)
      && csm.updateBeforeType === 'render'
      && /updateBefore\s*\(frame\)[\s\S]*?this\.updateFrustums\s*\(\)[\s\S]*?super\.updateBefore\s*\(frame\)/
        .test(unityShadowRuntimeSource),
    'Rock Lab refits Unity cascades from the current TAA camera projection before every shadow render',
  ),
  runtimeCheck(
    'unity-shadow-radiance-materialized',
    /nDotL\.mul\(unityLightColor\)\.toVar\(['"]unityRadiance['"]\)/
      .test(unityUrpRuntimeSource),
    'URP direct lighting materializes one shadowed half3 radiance before diffuse/specular evaluation',
  ),
  runtimeCheck(
    'view-camera-lod-shadow-contract',
    /referenceBuild\.lod\.autoUpdate\s*=\s*false/.test(rockEngineSource)
      && /referenceBuild\?\.lod\.update\(camera\)/.test(rockEngineSource),
    'The view camera selects the authored rock LOD once; cascade cameras cannot mutate it',
  ),
  runtimeCheck(
    'unity-shadow-caster-bias',
    /installSoStylizedUnityShadowCasterBias\s*\(\s*unityMaterial/.test(rockEngineSource)
      && /directionToLight:\s*UNITY_DIRECTION_TO_LIGHT/.test(rockEngineSource),
    'Rock Lab installs the effective URP .1/.5 caster-space bias on its exact Unity material',
  ),
  runtimeCheck(
    'unity-post-stack',
    /createSoStylizedUnityStagePostPipeline\s*\(/.test(rockLabSource)
      && /\.pipeline\.render\s*\(/.test(rockLabSource),
    'Rock Lab renders through SSAO -> exponential fog -> TAA -> bloom -> vignette -> LDR grade',
  ),
  runtimeCheck(
    'receiver-ground',
    /ground\.receiveShadow\s*=\s*true/.test(rockSceneSource)
      && /createUnityShadowReceiverMaterial\s*\(/.test(rockSceneSource)
      && /installSoStylizedUnityUrpLighting\s*\(material/.test(rockSceneSource)
      && /soStylizedUnityShadowReceiver\s*=\s*true/.test(rockSceneSource)
      && /ground\.material\s*=\s*source\s*\?\s*groundMaterials\.unity/.test(rockSceneSource)
      && /sceneContext\.ground\.castShadow\s*=\s*false/.test(rockEngineSource),
    'Unity acceptance mode swaps in a URP-lit native receiveShadow ground instead of the lights=false ToonLab material',
  ),
  runtimeCheck(
    'unity-presentation-isolation',
    /unityLightRoot\.visible\s*=\s*source/.test(rockSceneSource)
      && /ambient\.visible\s*=\s*!source/.test(rockSceneSource)
      && /sunRig\?\.group[\s\S]*?visible\s*=\s*!source/.test(rockSceneSource)
      && /if\s*\(sourceAuthority\)\s*return/.test(rockLabSource),
    'ToonLab source mode excludes the legacy Rock Lab ambient, sun rig, fog, sky, and weather overrides',
  ),
  runtimeCheck(
    'source-showcase-shared-rock-stage',
    /createSoStylizedUnityStageLights\s*\(/.test(sourceShowcaseSource)
      && /installSoStylizedUnityShadowCasterBias\s*\(/.test(sourceShowcaseSource)
      && /createSoStylizedUnityStagePostPipeline\s*\(/.test(sourceShowcaseSource)
      && /csmMode:\s*['"]toonlab-source-urp['"]/.test(sourceShowcaseSource),
    'The Unreal comparison scene uses the same ToonLab light, caster-bias, CSM, and post implementation as Rock Lab',
  ),
];
const runtimeGaps = runtimeChecks.filter((check) => !check.pass);

const report = {
  acceptanceSubject: {
    catalogId: SOURCE_REFERENCE_ID,
    localSourceAsset: SOURCE_ASSET_NAME,
    sourceMaterial: SOURCE_UNITY_MATERIAL,
    unityScene: sceneManifest.sourceScene,
    unitySceneIndices: {
      gltfMesh: SOURCE_GLTF_MESH_INDEX,
      material: SOURCE_MATERIAL_INDEX,
      mesh: SOURCE_MESH_INDEX,
      node: SOURCE_NODE_INDEX,
    },
  },
  cameraAndPost: {
    antiAliasing: renderContract.camera.antiAliasing,
    far: renderContract.camera.far,
    fieldOfView: renderContract.camera.fieldOfView,
    near: renderContract.camera.near,
    order: ['opaque', 'ssao', 'fog', 'taa', 'bloom', 'vignette', 'ldr-grade'],
  },
  meshIdentity: {
    basis: 'local UE glTF -> Unity glTF: (-x, y, -z); UV0 V-flip',
    ...meshComparison,
    localIndices: undefined,
    localNormals: undefined,
    localPositions: undefined,
    localTangents: undefined,
    localUvs: undefined,
  },
  rendererBridges: stageLights.remainingBridges,
  rockLabRuntime: {
    checks: runtimeChecks,
    gapCount: runtimeGaps.length,
  },
  sourceFilesVerified: optionalSourceFilesVerified,
  sourceLighting: {
    ambientProbeCoefficient0Linear: renderContract.ambientProbe.coefficient0Linear,
    cascadeTileResolution: SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeTileResolution,
    cascadeSplits: renderContract.shadows.cascadeSplits,
    effectiveShadowBias: SO_STYLIZED_UNITY_SHADOW_CONTRACT.effectiveBias,
    shadowFilter: SO_STYLIZED_UNITY_SHADOW_CONTRACT.filter,
    shadowDistance: renderContract.shadows.distance,
    shadowMapAtlasResolution: renderContract.shadows.mainResolution,
    sunRayDirectionUnity: renderContract.sun.rayDirectionUnity,
  },
};

console.log(JSON.stringify(report, null, 2));

referenceBuild.dispose();
sourceGeometry.dispose();
unityRockMaterial.dispose();
placeholderTexture.dispose();

if (process.argv.includes('--strict-runtime') && runtimeGaps.length > 0) {
  throw new Error(
    `${runtimeGaps.length} Rock Lab Unity runtime acceptance gap(s): `
    + runtimeGaps.map((gap) => gap.id).join(', '),
  );
}
