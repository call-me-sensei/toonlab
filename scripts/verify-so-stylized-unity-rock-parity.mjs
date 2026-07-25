#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { float } from 'three/tsl';

import {
  createSoStylizedUnityRockMaterialIndex,
  resolveSoStylizedUnityRockMaterial,
} from '../src/environment/soStylizedUnityRockMaterialResolver.js';
import {
  SoStylizedUnityUrpLightingModel,
} from '../src/environment/soStylizedUnityUrpLighting.js';
import {
  createUnityMountainMaterial,
  createUnityRockMaterial,
  UNITY_MOUNTAIN_SHADER_GUID,
  UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT,
  UNITY_ROCK_SHADER_GUID,
  unityMountainProfileFromResolvedMaterial,
  unityRockProfileFromResolvedMaterial,
} from '../src/rockgen/reference/unityRockMaterial.js';
import {
  createRockReferenceLodObject,
} from '../src/rockgen/reference/referenceMeshVariation.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(packageRoot, '..');
const manifestPath = path.join(
  packageRoot,
  'assets-local/sostylized-unity/rock-material-library.json',
);
const shaderGraphPath = path.join(
  workspaceRoot,
  'SoStylized-Unity/Environment/Rocks/Shaders/S_Rock.shadergraph',
);
const mountainShaderGraphPath = path.join(
  workspaceRoot,
  'SoStylized-Unity/Environment/Rocks/Shaders/S_Mountain.shadergraph',
);
const setupGuideShaderGraphPath =
  '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity/'
  + 'Environment/Rocks/Shaders/S_Rock.shadergraph';
const setupGuideMountainShaderGraphPath =
  '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity/'
  + 'Environment/Rocks/Shaders/S_Mountain.shadergraph';
const setupGuideProjectSettingsPath =
  '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/ProjectSettings/ProjectSettings.asset';
const showcaseGlbPath = path.join(
  packageRoot,
  'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.glb',
);
const megaManifestPath = path.join(
  packageRoot,
  'assets-local/sostylized-unity/mega-scene-native-pc-current/scene-manifest.json',
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function parseShaderGraph(buffer, label) {
  const documents = buffer.toString('utf8').trim().split(/\n\n(?=\{)/).map(JSON.parse);
  const byId = new Map(documents.map((value) => [value.m_ObjectId, value]));
  const root = documents.find((value) => value.m_Type === 'UnityEditor.ShaderGraph.GraphData');
  assert.ok(root, `${label} has no GraphData document`);
  return { byId, documents, root };
}

function verifyAuthoredStaticVertexGraph(buffer, label) {
  const graph = parseShaderGraph(buffer, label);
  const vertexBlocks = graph.root.m_VertexContext.m_Blocks
    .map(({ m_Id: id }) => graph.byId.get(id));
  assert.deepEqual(
    vertexBlocks.map(({ m_SerializedDescriptor: descriptor }) => descriptor),
    ['VertexDescription.Position', 'VertexDescription.Normal', 'VertexDescription.Tangent'],
    `${label} vertex block inventory changed`,
  );
  for (const block of vertexBlocks) {
    assert.equal(
      graph.root.m_Edges.some((edge) => edge.m_InputSlot.m_Node.m_Id === block.m_ObjectId),
      false,
      `${label} ${block.m_SerializedDescriptor} unexpectedly gained WPO/vertex input`,
    );
  }
  assert.deepEqual(
    graph.documents.filter((value) => (
      /TimeNode$/i.test(value.m_Type ?? '') || /^Time$/i.test(value.m_Name ?? '')
    )),
    [],
    `${label} unexpectedly gained a Time node`,
  );
  return vertexBlocks.length;
}

function readGlbJson(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString());
    }
    offset += 8 + length;
  }
  throw new Error(`JSON chunk is missing from ${file}`);
}

const manifest = readJson(manifestPath);
const index = createSoStylizedUnityRockMaterialIndex(manifest);
const sourceMaterialCode = fs.readFileSync(
  path.join(packageRoot, 'src/environment/soStylizedSourceMaterials.js'),
  'utf8',
);
const rockEngineCode = fs.readFileSync(
  path.join(packageRoot, 'labs/rock-lab/engine/rockEngine.js'),
  'utf8',
);
const unityRockCode = fs.readFileSync(
  path.join(packageRoot, 'src/rockgen/reference/unityRockMaterial.js'),
  'utf8',
);
const unityNormalIntegrationCode = fs.readFileSync(
  path.join(packageRoot, 'src/environment/soStylizedUnityNormalIntegration.js'),
  'utf8',
);
const shaderGraph = fs.readFileSync(shaderGraphPath);
const shaderGraphText = shaderGraph.toString();
const mountainShaderGraph = fs.readFileSync(mountainShaderGraphPath);
const mountainShaderGraphText = mountainShaderGraph.toString();

// Both supplied Unity projects must contain the same S_Rock authority.
assert.equal(
  sha256(shaderGraph),
  'a3bb01037314605728ba852d407df95e3bd9374f87e42c28cc28da49172e5f5b',
  'S_Rock.shadergraph changed; re-audit generated graph logic before updating this hash',
);
if (fs.existsSync(setupGuideShaderGraphPath)) {
  assert.equal(
    sha256(fs.readFileSync(setupGuideShaderGraphPath)),
    sha256(shaderGraph),
    'Setup Guide and SoStylized-Unity shader graphs must be byte-identical',
  );
}
assert.match(shaderGraphText, /"m_WorkflowMode": 1/);
assert.match(shaderGraphText, /"m_SurfaceType": 0/);
assert.match(shaderGraphText, /"m_CastShadows": true/);
assert.match(shaderGraphText, /"m_ReceiveShadows": true/);
const rockGraph = parseShaderGraph(shaderGraph, 'S_Rock');
const rockColorProperties = rockGraph.documents.filter(
  (value) => value.m_Type === 'UnityEditor.ShaderGraph.Internal.ColorShaderProperty',
);
assert.deepEqual(
  new Set(rockColorProperties.map((value) => value.m_DefaultReferenceName)),
  new Set([
    '_Rock_Striping_Overlay_Color',
    '_Rock_Tint',
    '_Moss_Color_2',
    '_Distant_Tint_Blend',
    '_Sand_Tint',
    '_Moss_Color',
    '_Snow_Tint',
    '_Grass_Tint',
  ]),
);
assert.ok(
  rockColorProperties.every((value) => value.m_ColorMode === 0),
  'Every connected/exposed S_Rock Color property must remain ColorMode.Default',
);
assert.equal(
  sha256(mountainShaderGraph),
  'dcee9bf8279066e76e98871f7c61852f445be600571382d70dbca83f4fddc485',
  'S_Mountain.shadergraph changed; re-audit generated graph logic before updating this hash',
);
if (fs.existsSync(setupGuideMountainShaderGraphPath)) {
  assert.equal(
    sha256(fs.readFileSync(setupGuideMountainShaderGraphPath)),
    sha256(mountainShaderGraph),
    'Setup Guide and SoStylized-Unity mountain shader graphs must be byte-identical',
  );
}
if (fs.existsSync(setupGuideProjectSettingsPath)) {
  assert.match(
    fs.readFileSync(setupGuideProjectSettingsPath, 'utf8'),
    /^\s*m_ActiveColorSpace:\s*1\s*$/m,
    'Unity reference project must remain in Linear color space',
  );
}
assert.match(mountainShaderGraphText, /"m_WorkflowMode": 1/);
assert.match(mountainShaderGraphText, /"m_SurfaceType": 0/);
assert.match(mountainShaderGraphText, /"m_CastShadows": true/);
assert.match(mountainShaderGraphText, /"m_ReceiveShadows": true/);
assert.equal(
  parseShaderGraph(mountainShaderGraph, 'S_Mountain').documents.filter(
    (value) => value.m_Type === 'UnityEditor.ShaderGraph.Internal.ColorShaderProperty',
  ).length,
  0,
  'S_Mountain unexpectedly gained a material Color property',
);
const rockStaticVertexBlockCount = verifyAuthoredStaticVertexGraph(shaderGraph, 'S_Rock');
const mountainStaticVertexBlockCount = verifyAuthoredStaticVertexGraph(
  mountainShaderGraph,
  'S_Mountain',
);
for (const shaderGuid of [UNITY_ROCK_SHADER_GUID, UNITY_MOUNTAIN_SHADER_GUID]) {
  assert.deepEqual(
    UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[shaderGuid],
    {
      mode: 'authored-static',
      sourceShader: shaderGuid === UNITY_ROCK_SHADER_GUID
        ? 'Shader Graphs/S_Rock'
        : 'Shader Graphs/S_Mountain',
      sourceVertexPositionConnected: false,
      timeDependent: false,
    },
  );
}

function resolution(name, sourceAssetName = null) {
  const result = resolveSoStylizedUnityRockMaterial(name, {
    index,
    sourceAssetName,
  });
  assert.ok(result, `Missing Unity rock profile for ${name}`);
  assert.equal(result.isExact, true, `${name} must not use a fallback Unity profile`);
  return result;
}

function profile(name, sourceAssetName = null) {
  return unityRockProfileFromResolvedMaterial(
    resolution(name, sourceAssetName).materialRecord,
  );
}

const cliff = profile('MI_RockClassic_Cliff', 'SM_CliffClassic23');
assert.equal(cliff.sourceName, 'MV_RockClassic_Cliff');
assert.equal(cliff.base.scale, 50);
assert.deepEqual(cliff.base.tint, [0.95686275, 0.99215686, 1]);
assert.equal(cliff.base.contrast, 0.75);
assert.equal(cliff.base.brightness, 0.05);
assert.equal(cliff.base.projectionContrast, 1);
assert.equal(cliff.base.closeTintDistance, 500);
assert.equal(cliff.base.farTintDistance, 15000);
assert.equal(cliff.base.metallic, 0.2);
assert.equal(cliff.base.smoothness, 0.1);
assert.equal(cliff.base.emissiveStrength, 0.12);
assert.equal(cliff.normals.useSmoothed, true);
assert.equal(cliff.normals.nearFlatten, 0.1);
assert.equal(cliff.normals.farFlatten, 1);
assert.equal(cliff.normals.distance, 20000);
assert.equal(cliff.layers.grass.enabled, true);
assert.equal(cliff.layers.offset, 0.47);
assert.equal(cliff.layers.sharpness, 6.82);

const leftRock = profile('MI_RockClassic_Rocks', 'SM_RockClassic3');
assert.equal(leftRock.sourceName, 'MV_RockClassic_Rocks');
assert.equal(leftRock.base.scale, 10);
assert.equal(leftRock.normals.useSmoothed, true);
assert.equal(leftRock.normals.nearFlatten, -0.1);
assert.equal(leftRock.normals.distance, 20000);
assert.equal(leftRock.layers.grass.enabled, false);

// Rock Lab clones the resolved Unity material once per authored LOD. Three's
// default NodeMaterial clone drops instance-owned setupLightingModel methods,
// so exercise the real reference builder and prove the clone retains URP plus
// the exact S_Rock profile and shadow contract.
const runtimeTextures = Object.fromEntries([
  'grass',
  'moss',
  'noise',
  'rock',
  'rockNormal',
  'sand',
  'sandNormal',
  'smoothness',
  'snow',
  'stripe',
  'stylizedNormal',
  'topMask',
].map((key) => [key, new THREE.Texture()]));
const runtimeUnityMaterial = createUnityRockMaterial({
  name: 'Verifier_Unity_S_Rock',
  profile: leftRock,
  textures: runtimeTextures,
});
assert.equal(runtimeUnityMaterial.positionNode, null);
assert.equal(runtimeUnityMaterial.castShadowPositionNode, null);
assert.deepEqual(
  runtimeUnityMaterial.userData.soStylizedUnityVertexMotion,
  UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[UNITY_ROCK_SHADER_GUID],
);
const runtimeMountainMaterial = createUnityMountainMaterial({
  name: 'Verifier_Unity_S_Mountain',
  textures: {
    grass: runtimeTextures.grass,
    noise: runtimeTextures.noise,
    rock: runtimeTextures.rock,
    snow: runtimeTextures.snow,
  },
});
assert.equal(runtimeMountainMaterial.positionNode, null);
assert.equal(runtimeMountainMaterial.castShadowPositionNode, null);
assert.deepEqual(
  runtimeMountainMaterial.userData.soStylizedUnityVertexMotion,
  UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[UNITY_MOUNTAIN_SHADER_GUID],
);
const runtimeSourceGeometry = new THREE.BoxGeometry(1, 1, 1);
const runtimeReference = createRockReferenceLodObject({
  entry: {
    id: 'verify-unity-s-rock',
    sourceAssetName: 'SM_RockClassic3',
    target: { lodTriangles: [12] },
  },
  lods: [{ geometry: runtimeSourceGeometry }],
  unityMaterial: runtimeUnityMaterial,
}, {
  geometryMode: 'original',
  materialMode: 'unity',
});
const runtimeLevel = runtimeReference.levels[0];
const runtimeClone = runtimeLevel.material;
assert.notEqual(runtimeClone, runtimeUnityMaterial);
assert.equal(Object.hasOwn(runtimeUnityMaterial, 'setupLightingModel'), true);
assert.equal(Object.hasOwn(runtimeClone, 'setupLightingModel'), true);
assert.notEqual(runtimeClone.setupLightingModel, runtimeUnityMaterial.setupLightingModel);
const authoredRoughnessNode = runtimeClone.roughnessNode;
const clonedRoughnessSentinel = float(0.37);
runtimeClone.roughnessNode = clonedRoughnessSentinel;
const runtimeLightingModel = runtimeClone.setupLightingModel();
assert.ok(runtimeLightingModel instanceof SoStylizedUnityUrpLightingModel);
assert.equal(runtimeLightingModel.workflow, 'metallic');
assert.equal(runtimeLightingModel.perceptualRoughnessNode, clonedRoughnessSentinel);
runtimeClone.roughnessNode = authoredRoughnessNode;
assert.equal(runtimeClone.userData.soStylizedUnityUrpLighting.workflow, 'metallic');
assert.deepEqual(runtimeClone.userData.unityRockProfile, leftRock);
assert.deepEqual(runtimeClone.userData.unitySourceShader, {
  assetPath: 'Environment/Rocks/Shaders/S_Rock.shadergraph',
  guid: UNITY_ROCK_SHADER_GUID,
});
assert.equal(runtimeClone.transparent, false);
assert.equal(runtimeClone.depthWrite, true);
assert.equal(runtimeLevel.mesh.castShadow, true);
assert.equal(runtimeLevel.mesh.receiveShadow, true);
assert.equal(runtimeReference.lod.userData.toonlabRockReference.materialMode, 'unity');
runtimeReference.dispose();
runtimeSourceGeometry.dispose();
runtimeUnityMaterial.dispose();
runtimeMountainMaterial.dispose();
for (const texture of Object.values(runtimeTextures)) texture.dispose();

const mossRock = profile(
  'MI_RockClassic_Rocks_MossWorld',
  'SM_RockClumpClassic10',
);
assert.equal(mossRock.sourceName, 'MV_RockClassic_Rocks_Mossy');
assert.equal(mossRock.moss.enabled, true);
assert.equal(mossRock.moss.size, 25);
assert.equal(mossRock.moss.sharpness, 1.92);
assert.equal(mossRock.moss.offset, -0.15);
assert.equal(mossRock.moss.multiply, 1.94);
assert.equal(mossRock.moss.colorPower, 1.3);
assert.deepEqual(mossRock.moss.lowColor, [0.3019608, 0.48235294, 0.11764706]);
assert.deepEqual(mossRock.moss.highColor, [0.47058824, 0.6509804, 0.2627451]);

const mountainResolution = resolution('MV_Mountain', 'SM_Mountain01');
const mountain = unityMountainProfileFromResolvedMaterial(
  mountainResolution.materialRecord,
);
assert.equal(mountain.sourceName, 'MV_Mountain');
assert.equal(mountain.textureScale, 134.7);
assert.equal(mountain.noiseSize, 1260);
assert.equal(mountain.grassSlopeMax, 0.231);
assert.equal(mountain.grassTopFadeout, 0.868);
assert.equal(mountain.grassNoiseStrength, 0.176);
assert.equal(mountain.snowNoiseStrength, 0.5);
assert.equal(mountain.snowTopAmount, 0.3);
assert.equal(mountain.smoothness, 0.066);

// The source demo intentionally places 141 rock-clump instances through
// Terrain's tree-prototype population system. Their asset classification must
// remain S_Rock + zero bend, not be inferred as S_Leaves/S_Bark wind simply
// because TerrainData stores them beside actual trees.
const megaManifest = readJson(megaManifestPath);
const megaTerrain = megaManifest.terrains[0];
const sceneShaderSlotCount = (shaderName) => megaManifest.nodes.reduce((count, node) => (
  count + (node.renderer?.materialIndices ?? []).filter(
    (materialIndex) => megaManifest.materials[materialIndex]?.shaderName === shaderName,
  ).length
), 0);
assert.equal(sceneShaderSlotCount('Shader Graphs/S_Rock'), 513);
assert.equal(sceneShaderSlotCount('Shader Graphs/S_Mountain'), 10);
const terrainRockPrototypeIndices = new Set();
for (const treePrototype of megaTerrain.treePrototypes) {
  const prefab = megaManifest.prefabPrototypes[treePrototype.gltfPrefab];
  const shaderNames = new Set((prefab.nodes ?? []).flatMap((node) => (
    (node.renderer?.materialIndices ?? []).map(
      (materialIndex) => megaManifest.materials[materialIndex]?.shaderName,
    )
  )));
  if (!shaderNames.has('Shader Graphs/S_Rock')) continue;
  assert.deepEqual([...shaderNames], ['Shader Graphs/S_Rock']);
  assert.equal(treePrototype.bendFactor, 0);
  terrainRockPrototypeIndices.add(treePrototype.index);
}
assert.equal(terrainRockPrototypeIndices.size, 15);
const terrainRockInstanceCount = megaTerrain.treeInstances.filter(
  ({ prototypeIndex }) => terrainRockPrototypeIndices.has(prototypeIndex),
).length;
assert.equal(terrainRockInstanceCount, 141);

function textureRecord(textureRef) {
  assert.ok(textureRef?.guid, 'Expected a resolved Unity texture reference');
  const record = manifest.texturesByGuid[textureRef.guid];
  assert.ok(record, `Missing TextureImporter record for ${textureRef.guid}`);
  return record;
}

for (const current of [cliff, leftRock, mossRock]) {
  const base = textureRecord(current.textureRefs.rock);
  const crackNormal = textureRecord(current.textureRefs.rockNormal);
  const stylizedNormal = textureRecord(current.textureRefs.stylizedNormal);
  assert.equal(base.importSettings.sRGBTexture, true);
  assert.equal(base.importSettings.textureTypeName, 'Default');
  for (const normal of [crackNormal, stylizedNormal]) {
    assert.equal(normal.importSettings.sRGBTexture, false);
    assert.equal(normal.importSettings.colorSpace, 'linear');
    assert.equal(normal.importSettings.textureTypeName, 'NormalMap');
    assert.equal(normal.importSettings.mipmapEnabled, true);
    assert.equal(normal.importSettings.filterModeName, 'Bilinear');
  }
}
assert.equal(
  textureRecord(mossRock.textureRefs.moss).importSettings.sRGBTexture,
  true,
);
for (const textureRef of Object.values(mountain.textureRefs)) {
  const record = textureRecord(textureRef);
  assert.equal(record.importSettings.sRGBTexture, true);
  assert.equal(record.importSettings.textureTypeName, 'Default');
  assert.equal(record.importSettings.mipmapEnabled, true);
  assert.equal(record.importSettings.filterModeName, 'Bilinear');
  assert.equal(record.importSettings.wrapUName, 'Repeat');
  assert.equal(record.importSettings.wrapVName, 'Repeat');
}

// Confirm the three acceptance subjects and all visible rock-family slots in
// Camera 01 use exact cross-engine identities rather than name-nearest fallbacks.
const gltf = readGlbJson(showcaseGlbPath);
const nodesByName = new Map(gltf.nodes.map((node) => [node.name, node]));
function nodeMaterials(nodeName) {
  const node = nodesByName.get(nodeName);
  assert.ok(node, `Missing Camera 01 object ${nodeName}`);
  const mesh = gltf.meshes[node.mesh];
  assert.ok(mesh, `Missing mesh for ${nodeName}`);
  return [...new Set(mesh.primitives.map(
    (primitive) => gltf.materials[primitive.material]?.name,
  ))];
}
assert.deepEqual(nodeMaterials('SM_RockClassic3'), ['MI_RockClassic_Rocks']);
assert.deepEqual(nodeMaterials('SM_RockClassic10'), ['MI_RockClassic_Rocks']);
assert.deepEqual(
  nodeMaterials('SM_RockClumpClassic10'),
  ['MI_RockClassic_Rocks_MossWorld'],
);
for (const node of gltf.nodes) {
  if (!node.mesh || !/(?:Rock|Cliff|Mountain)/i.test(node.name ?? '')) continue;
  for (const materialName of nodeMaterials(node.name)) {
    if (!/^MI_(?:Rock|Mountain)/.test(materialName ?? '')) continue;
    const sceneMaterial = resolveSoStylizedUnityRockMaterial(materialName, {
      allowFallback: true,
      index,
      sourceAssetName: node.name,
    });
    assert.ok(sceneMaterial, `Missing Unity scene profile for ${node.name}/${materialName}`);
  }
}
const nonExactSceneMaterials = [...new Set(gltf.nodes.flatMap((node) => {
  if (!node.mesh || !/(?:Rock|Cliff|Mountain)/i.test(node.name ?? '')) return [];
  return nodeMaterials(node.name).flatMap((materialName) => {
    if (!/^MI_(?:Rock|Mountain)/.test(materialName ?? '')) return [];
    const sceneMaterial = resolveSoStylizedUnityRockMaterial(materialName, {
      allowFallback: true,
      index,
      sourceAssetName: node.name,
    });
    return sceneMaterial?.isExact ? [] : [materialName];
  });
}))].sort();
assert.deepEqual(
  nonExactSceneMaterials,
  ['MI_Mountain_Snowy', 'MI_RockSpire_Rocks_Snow'],
  'Only Unity-absent named variants may use documented parent fallbacks',
);

// Production source-showcase routing must preserve Unity metres and execute
// the S_Rock port. The UE graph remains an explicit Rock Lab diagnostic only.
assert.match(
  sourceMaterialCode,
  /case 'rock':[\s\S]*?return buildUnityRock\(profile, context\);/,
);
assert.match(sourceMaterialCode, /distanceScale:\s*1,/);
assert.match(
  rockEngineCode,
  /loadUnityRockMaterial\(\{[\s\S]*?coordinates:\s*\{[\s\S]*?distanceScale:\s*1,/,
  'Rock Lab must preserve Unity-authored distance thresholds in metres',
);
assert.doesNotMatch(
  rockEngineCode,
  /loadUnityRockMaterial\(\{[\s\S]*?coordinates:\s*\{[\s\S]*?distanceScale:\s*0\.01,/,
);
assert.match(
  sourceMaterialCode,
  /case 'mountain':[\s\S]*?return buildUnityMountain\(profile, context\);/,
);
assert.match(sourceMaterialCode, /flipProceduralUvY:\s*true,/);
assert.doesNotMatch(
  sourceMaterialCode,
  /case 'rock':[\s\S]*?normalResponseBridge:\s*0\.75/,
);
assert.match(unityRockCode, /UnpackNormalMapRGorAG-compatible/);
assert.match(unityRockCode, /perTextureFlipGreenChannel:\s*true/);
assert.match(unityRockCode, /decodeSoStylizedUnityNormalNode as decodeUnityNormal/);
assert.match(
  unityNormalIntegrationCode,
  /float\(1\)\.sub\(clamp\(dot\(xy, xy\), 0, 1\)\)/,
);
assert.match(unityRockCode, /function unitySrgbChannelToLinear/);
assert.match(unityRockCode, /unityColorProperty\(resolvedProfile\.moss\.lowColor\)/);
assert.match(unityRockCode, /export function createUnityMountainMaterial/);

console.log(JSON.stringify({
  acceptanceObjects: {
    bottomRightMossRock: 'SM_RockClumpClassic10 -> MV_RockClassic_Rocks_Mossy',
    foregroundLeftRocks: [
      'SM_RockClassic3 -> MV_RockClassic_Rocks',
      'SM_RockClassic10 -> MV_RockClassic_Rocks',
    ],
    visibleCliffProfile: 'MI_RockClassic_Cliff -> MV_RockClassic_Cliff',
  },
  distanceScale: 1,
  runtimeRockClone: {
    castShadow: true,
    lightingModel: runtimeLightingModel.constructor.name,
    material: runtimeClone.userData.unityRockProfile.sourceName,
    receiveShadow: true,
    workflow: runtimeLightingModel.workflow,
  },
  staticVertexMotion: {
    mountainVertexBlocks: mountainStaticVertexBlockCount,
    mode: 'authored-static',
    rockVertexBlocks: rockStaticVertexBlockCount,
    terrainRockInstances: terrainRockInstanceCount,
    terrainRockPrototypes: terrainRockPrototypeIndices.size,
    timeDependent: false,
  },
  nonExactSceneMaterials,
  normalDecode: 'RG + reconstructed positive Z; per-texture importer green flip',
  colorProperties: 'Unity ColorMode.Default sRGB -> linear before graph math',
  mountain: {
    material: mountain.sourceName,
    shaderGraphSha256: sha256(mountainShaderGraph),
    proceduralUvYFlip: true,
  },
  shaderGraphSha256: sha256(shaderGraph),
}, null, 2));
