#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  SO_STYLIZED_UNITY_MEGA_TERRAIN_CONTRACT,
  applySoStylizedUnityMegaTerrainPosition,
  buildSoStylizedUnityMegaTerrainGeometry,
  buildSoStylizedUnityMegaTerrainMaterial,
  buildSoStylizedUnityMegaTerrainMaterials,
  buildSoStylizedUnityMegaNativeDetailPlacements,
  decodeSoStylizedUnityFloat32,
  decodeSoStylizedUnityInt32,
  getSoStylizedUnityMegaTerrainPopulation,
  instantiateSoStylizedUnityMegaTerrainDetails,
  instantiateSoStylizedUnityMegaTerrainTrees,
  loadSoStylizedUnityMegaNativeDetailTransformSets,
  splitSoStylizedUnityMegaSplatWeights,
} from '../src/environment/soStylizedUnityMegaTerrain.js';
import {
  applySoStylizedUnityTerrainNativeAuthority,
  SO_STYLIZED_UNITY_TERRAIN_NATIVE_AUTHORITY_FILE,
} from '../src/environment/soStylizedUnityTerrainNativeAuthority.js';
import {
  applySoStylizedUnityMegaCameraRecord,
  applySoStylizedUnityMegaRendererState,
  calculateSoStylizedUnityMegaLodSelection,
  reflectSoStylizedUnityMegaPosition,
  reflectSoStylizedUnityMegaQuaternion,
  updateSoStylizedUnityMegaLods,
} from '../src/environment/soStylizedUnityMegaScene.js';
import {
  SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE,
  intersectsSoStylizedUnityCascadeCullingPlanes,
} from '../src/environment/soStylizedUnityShadows.js';
import {
  SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE,
} from '../src/environment/soStylizedUnityPipelineProfiles.js';

const ROOT = process.cwd();
const SCENE_ROOT = path.resolve(
  ROOT,
  process.env.SO_STYLIZED_UNITY_MEGA_SCENE_ROOT
    ?? 'assets-local/sostylized-unity/mega-scene-native-package-recommended',
);
const MANIFEST_PATH = path.join(SCENE_ROOT, 'scene-manifest.json');
const SOURCE_LOD_BIAS = SO_STYLIZED_UNITY_CURRENT_SAMPLE_PIPELINE_PROFILE.quality.lodBias;
const assert = (condition, message) => {
  if (!condition) throw new Error(`Unity Mega terrain verification failed: ${message}`);
};
const close = (actual, expected, epsilon = 1e-6) => (
  Math.abs(Number(actual) - Number(expected)) <= epsilon
);
const readExact = (relativePath) => {
  const absolutePath = path.join(SCENE_ROOT, relativePath);
  assert(fs.existsSync(absolutePath), `missing ${relativePath}`);
  return fs.readFileSync(absolutePath);
};
const findUrpTerrainSource = () => {
  const builtIn = path.join(
    '/Applications/Unity/Hub/Editor/6000.5.4f1/Unity.app/Contents/Resources/PackageManager',
    'BuiltInPackages/com.unity.render-pipelines.universal/Shaders/Terrain',
  );
  if (fs.existsSync(path.join(builtIn, 'TerrainLitPasses.hlsl'))) return builtIn;
  const packageCache = '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Library/PackageCache';
  if (!fs.existsSync(packageCache)) return null;
  const packageFolder = fs.readdirSync(packageCache)
    .find((name) => name.startsWith('com.unity.render-pipelines.universal@'));
  if (!packageFolder) return null;
  const result = path.join(packageCache, packageFolder, 'Shaders/Terrain');
  return fs.existsSync(path.join(result, 'TerrainLitPasses.hlsl')) ? result : null;
};

assert(fs.existsSync(MANIFEST_PATH), 'scene-manifest.json is missing');
const rawManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const terrainNativeAuthority = JSON.parse(fs.readFileSync(
  path.join(SCENE_ROOT, SO_STYLIZED_UNITY_TERRAIN_NATIVE_AUTHORITY_FILE),
  'utf8',
));
const manifest = applySoStylizedUnityTerrainNativeAuthority(
  rawManifest,
  terrainNativeAuthority,
);
assert(manifest.schema === SO_STYLIZED_UNITY_MEGA_TERRAIN_CONTRACT.schema, 'manifest schema drifted');
assert(manifest.schemaVersion === SO_STYLIZED_UNITY_MEGA_TERRAIN_CONTRACT.schemaVersion, 'schema version drifted');
assert(manifest.sourceScene === SO_STYLIZED_UNITY_MEGA_TERRAIN_CONTRACT.sourceScene, 'source scene drifted');
const terrain = manifest.terrains?.[0];
assert(terrain, 'terrain[0] is missing');
assert(terrain.heightmapResolution === 513, 'heightmap must remain 513x513');
assert(terrain.holesResolution === 512, 'holes must remain 512x512');
assert(terrain.alphamapWidth === 2048 && terrain.alphamapHeight === 2048, 'splat field must remain 2048x2048');
assert(terrain.alphamapLayers === 5 && terrain.layers.length === 5, 'Terrain/Lit must retain five layers');
assert(terrain.detailPatchCount === 16, 'native detail patch grid must remain 16x16');
assert(
  close(terrain.position?.[0], -500)
    && close(terrain.position?.[1], -100)
    && close(terrain.position?.[2], -500),
  'Terrain.GetPosition authority drifted',
);
assert(
  terrain.renderTransformAuthority
    === 'UnityEngine.Terrain.GetPosition(): translation only; rotation and scale ignored',
  'native Terrain renderer transform authority drifted',
);
assert(terrain.surfaceProbes?.length === 81, 'native TerrainData probe grid must remain 9x9');
assert(manifest.renderSettings.unityVersion === '6000.5.4f1', 'native export editor version drifted');
if (manifest.renderSettings.captureLabel === 'package-recommended-urp-settings') {
  const pipeline = manifest.renderSettings.pipelineSettings;
  assert(manifest.renderSettings.pipelineOverrideApplied === true, 'recommended pipeline override was not active');
  assert(
    pipeline.asset?.guid === '32ed111482433d2468898f2263d4b877',
    'recommended URP asset GUID drifted',
  );
  assert(
    pipeline.renderer?.guid === '896195525289cfa48a74914a9107b874',
    'recommended URP renderer GUID drifted',
  );
  assert(pipeline.msaa === 4, 'recommended MSAA drifted');
  assert(pipeline.supportsHdr === true, 'recommended HDR support drifted');
  assert(pipeline.requiresDepthTexture === true, 'recommended depth texture drifted');
  assert(pipeline.requiresOpaqueTexture === true, 'recommended opaque texture drifted');
  assert(pipeline.colorGradingMode === 1 && pipeline.colorGradingLutSize === 32, 'recommended color grade drifted');
  assert(pipeline.mainLightShadowmapResolution === 4096, 'recommended shadow resolution drifted');
  assert(close(pipeline.shadowDistance, 500), 'recommended shadow distance drifted');
  assert(pipeline.shadowCascadeCount === 4, 'recommended cascade count drifted');
  assert(close(pipeline.shadowDepthBias, 0.3), 'recommended shadow depth bias drifted');
  assert(close(pipeline.shadowNormalBias, 0.13), 'recommended shadow normal bias drifted');
  const ssao = pipeline.rendererFeatures.find((feature) => feature.name === 'ScreenSpaceAmbientOcclusion');
  assert(ssao?.aoMethod === 1, 'recommended SSAO method drifted');
  assert(ssao?.aoMethodName === 'InterleavedGradient', 'recommended SSAO method label drifted');
  assert(close(ssao?.radius, 2), 'recommended SSAO radius drifted');
  assert(close(ssao?.effectiveRadius, 2), 'recommended SSAO effective radius drifted');
  assert(ssao?.sampleQuality === 'High' && ssao?.sampleCount === 12, 'recommended SSAO samples drifted');
  assert(close(ssao?.directLightingStrength, 0.5), 'recommended SSAO direct-light strength drifted');
}

const heightBytes = readExact(terrain.heights);
assert(heightBytes.byteLength === 513 * 513 * 4, 'height sidecar byte length drifted');
const heights = decodeSoStylizedUnityFloat32(heightBytes.buffer.slice(
  heightBytes.byteOffset,
  heightBytes.byteOffset + heightBytes.byteLength,
));
const holeBytes = readExact(terrain.holes);
assert(holeBytes.byteLength === 512 * 512, 'hole sidecar byte length drifted');
const holes = new Uint8Array(holeBytes.buffer, holeBytes.byteOffset, holeBytes.byteLength);
assert(holes.every((value) => value === 1), 'supplied Mega terrain should contain no deleted cells');

const geometry = buildSoStylizedUnityMegaTerrainGeometry(terrain, heights, holes);
assert(geometry.getAttribute('position').count === 513 * 513, 'heightfield vertex count is not exact');
assert(geometry.getAttribute('normal').count === 513 * 513, 'heightfield normals are incomplete');
assert(geometry.getAttribute('tangent').count === 513 * 513, 'Terrain/Lit tangent basis is incomplete');
assert(geometry.getAttribute('uv').count === 513 * 513, 'heightfield UVs are incomplete');
assert(geometry.index.count === 512 * 512 * 6, 'heightfield cell topology is not exact');
const positions = geometry.getAttribute('position');
const last = positions.count - 1;
assert(close(positions.getX(0), 0) && close(positions.getZ(0), 0), 'first vertex origin drifted');
assert(close(positions.getX(last), 1000) && close(positions.getZ(last), -1000), 'Unity Z reflection drifted');
assert(close(positions.getY(0), heights[0] * terrain.size[1]), 'first height scale drifted');
assert(close(positions.getY(last), heights[last] * terrain.size[1]), 'last height scale drifted');

const alphaBytes = readExact(terrain.alphamaps);
assert(alphaBytes.byteLength === 2048 * 2048 * 5 * 4, 'float splat byte length drifted');
const alphamaps = decodeSoStylizedUnityFloat32(alphaBytes.buffer.slice(
  alphaBytes.byteOffset,
  alphaBytes.byteOffset + alphaBytes.byteLength,
));
let maximumNativeProbeHeightError = 0;
let maximumNativeProbeSplatError = 0;
let maximumIgnoredTransformDelta = 0;
for (const probe of terrain.surfaceProbes) {
  const heightOffset = probe.heightmapZ * terrain.heightmapResolution + probe.heightmapX;
  maximumNativeProbeHeightError = Math.max(
    maximumNativeProbeHeightError,
    Math.abs(heights[heightOffset] * terrain.size[1] - probe.nativeHeight),
    Math.abs(probe.nativeHeight - probe.interpolatedHeight),
  );
  const alphaOffset = (
    probe.alphamapZ * terrain.alphamapWidth + probe.alphamapX
  ) * terrain.alphamapLayers;
  for (let layer = 0; layer < terrain.alphamapLayers; layer += 1) {
    maximumNativeProbeSplatError = Math.max(
      maximumNativeProbeSplatError,
      Math.abs(alphamaps[alphaOffset + layer] - probe.splatWeights[layer]),
    );
  }
  maximumIgnoredTransformDelta = Math.max(
    maximumIgnoredTransformDelta,
    new THREE.Vector3().fromArray(probe.rendererWorldPosition).distanceTo(
      new THREE.Vector3().fromArray(probe.serializedTransformWorldPosition),
    ),
  );
}
assert(maximumNativeProbeHeightError <= 1e-4, 'native TerrainData height probes disagree with the sidecar');
assert(maximumNativeProbeSplatError === 0, 'native TerrainData splat probes disagree with the sidecar');
assert(maximumIgnoredTransformDelta > 50, 'probe fixture no longer proves native Terrain ignores serialized rotation/scale');
for (let pixel = 0; pixel < 2048 * 2048; pixel += 4093) {
  let sum = 0;
  for (let layer = 0; layer < 5; layer += 1) {
    const value = alphamaps[pixel * 5 + layer];
    assert(value >= 0 && value <= 1, `splat weight ${pixel}:${layer} is outside [0,1]`);
    sum += value;
  }
  // GetAlphamaps exposes Unity's stored quantized weights. Most pixels sum to
  // one exactly; edge pixels can retain the source's quantization residual.
  assert(sum >= 0.9 && sum <= 1.05, `five splat weights at pixel ${pixel} sum to ${sum}`);
}
// Asymmetric corner fixtures prove row zero remains Unity terrain +Z=0. The
// reflected geometry keeps UV.v=sourceZ, so flipping this DataTexture would
// exchange these distinct north/south weights and move every painted biome.
const controlFixtures = [
  [0, 0, 0.40392160415649414, 0.5960784554481506],
  [0, 2047, 0.7137255072593689, 0.2862745225429535],
  [2047, 0, 0.062745101749897, 0.9372549653053284],
  [2047, 2047, 0.458823561668396, 0.5411764979362488],
];
for (const [x, sourceZ, grass, sand] of controlFixtures) {
  const offset = (sourceZ * terrain.alphamapWidth + x) * terrain.alphamapLayers;
  assert(close(alphamaps[offset], grass), `control row fixture ${x},${sourceZ} grass flipped`);
  assert(close(alphamaps[offset + 2], sand), `control row fixture ${x},${sourceZ} sand flipped`);
}
const syntheticWeights = new Float32Array([
  0.1, 0.2, 0.3, 0.15, 0.25,
  0.6, 0.1, 0.1, 0.1, 0.1,
]);
const split = splitSoStylizedUnityMegaSplatWeights(syntheticWeights, 2, 1, 5);
assert(split.firstFour.length === 8 && split.fifth.length === 2, 'float splat split shape drifted');
assert(close(split.firstFour[6], 0.1) && close(split.fifth[0], 0.25), 'float splat split reordered values');

const expectedLayers = [
  ['TL_Grass', 12, 0.099, 0.25, false],
  ['TL_Dirt', 16, 0, 0, true],
  ['TL_Sand', 12, 0.614, 0.228, true],
  ['TL_Rock', 32, 0, 0, true],
  ['TL_Snow', 32, 0.791, 0, false],
];
for (const [index, layer] of terrain.layers.entries()) {
  const [name, tileSize, metallic, smoothness, hasNormal] = expectedLayers[index];
  assert(layer.index === index && layer.name === name, `layer ${index} identity drifted`);
  assert(close(layer.tileSize[0], tileSize) && close(layer.tileSize[1], tileSize), `${name} tile size drifted`);
  assert(close(layer.metallic, metallic), `${name} metallic drifted`);
  assert(close(layer.smoothness, smoothness), `${name} smoothness drifted`);
  assert(
    layer.diffuseRemapMin.join(',') === '0,0,0,0'
      && layer.diffuseRemapMax.join(',') === '1,1,1,1',
    `${name} diffuse remap stopped being the identity Vector4`,
  );
  assert((layer.normalMapTexture >= 0) === hasNormal, `${name} normal binding drifted`);
  for (const textureIndex of [layer.diffuseTexture, layer.normalMapTexture].filter((value) => value >= 0)) {
    const record = manifest.textures[textureIndex];
    assert(record?.exactSourceCopy, `${name} texture ${textureIndex} lost exactSourceCopy`);
    readExact(record.exactSourceCopy);
    assert(record.importer?.wrapMode === 'Repeat', `${record.name} wrap mode drifted`);
    assert(record.importer?.filterMode === 'Bilinear', `${record.name} filter mode drifted`);
    assert(record.importer?.mipmapEnabled === true, `${record.name} mipmap state drifted`);
    assert(record.importer?.anisoLevel === 1, `${record.name} anisotropy drifted`);
    if (record.importer.textureType === 'NormalMap') {
      assert(record.importer.sRGBTexture === false, `${record.name} normal map became sRGB`);
      assert(record.importer.flipGreenChannel === false, `${record.name} green channel flipped`);
    } else {
      assert(record.importer.sRGBTexture === true, `${record.name} diffuse map lost sRGB import`);
    }
  }
}

const rgbaControl = new THREE.DataTexture(new Float32Array([1, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
const redControl = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
const loadedLayers = terrain.layers.map((layer) => ({
  ...layer,
  diffuseMap: white,
  normalMap: layer.normalMapTexture >= 0 ? flatNormal : null,
  maskMap: null,
  diffuseTextureRecord: manifest.textures[layer.diffuseTexture],
  normalTextureRecord: layer.normalMapTexture >= 0 ? manifest.textures[layer.normalMapTexture] : null,
}));
const material = buildSoStylizedUnityMegaTerrainMaterial({
  terrain,
  controlTextures: [rgbaControl, redControl],
  layers: loadedLayers,
});
assert(material.isMeshPhysicalNodeMaterial, 'terrain material is not MeshPhysicalNodeMaterial');
assert(material.userData.soStylizedUnityMegaTerrain.layers.length === 5, 'material lost a terrain layer');
assert(material.userData.soStylizedUnityMegaTerrain.splatPrecision === 'float32', 'float32 is not default');
assert(material.userData.soStylizedUnityUrpLighting?.workflow === 'metallic', 'URP metallic lighting is not installed');

const terrainMaterials = buildSoStylizedUnityMegaTerrainMaterials({
  terrain,
  controlTextures: [rgbaControl, redControl],
  layers: loadedLayers,
});
assert(terrainMaterials.materials.length === 2, 'five layers did not produce two URP passes');
assert(
  terrainMaterials.base.userData.soStylizedUnityMegaTerrain.layerIndices.join(',') === '0,1,2,3',
  'opaque Terrain/Lit base pass layer routing drifted',
);
assert(
  terrainMaterials.additive.userData.soStylizedUnityMegaTerrain.layerIndices.join(',') === '4',
  'Terrain/Lit add-pass layer routing drifted',
);
assert(terrainMaterials.base.passWeightNode?.isNode, 'base pass lost post-BRDF source weighting');
assert(terrainMaterials.additive.passWeightNode?.isNode, 'add pass lost post-BRDF source weighting');
for (const passMaterial of terrainMaterials.materials) {
  assert(
    passMaterial.userData.soStylizedUnityUrpLighting?.inputAdapter === 'unity-stage'
      && typeof passMaterial.setupLightingModel === 'function',
    `${passMaterial.name} no longer consumes the shadowed main-light color through URP direct radiance`,
  );
}
assert(terrainMaterials.additive.transparent === true, 'add pass no longer enables blending');
assert(terrainMaterials.additive.depthWrite === false, 'add pass must retain ZWrite Off');
assert(terrainMaterials.additive.depthFunc === THREE.LessEqualDepth, 'add pass depth function drifted');
assert(terrainMaterials.additive.blending === THREE.CustomBlending, 'add pass custom blend drifted');
assert(
  terrainMaterials.additive.blendSrc === THREE.OneFactor
    && terrainMaterials.additive.blendDst === THREE.OneFactor,
  'add pass must retain Blend One One',
);
assert(terrainMaterials.additive.alphaTestNode?.isNode, 'add pass lost source weight clip');
assert(
  terrainMaterials.base.userData.soStylizedUnityMegaTerrain.splatNormalization.includes('HALF_MIN'),
  'base pass no longer uses URP HALF_MIN normalization',
);

const population = getSoStylizedUnityMegaTerrainPopulation(manifest);
assert(population.treePrototypes.length === 141, 'tree prototype inventory drifted');
assert(population.treeInstances.length === 1695, 'tree instance inventory drifted');
assert(population.detailPrototypes.length === 17, 'detail prototype inventory drifted');
const expectedDetailRoutes = [
  ['P_Grass1_Paintable', 68, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_Daisies', 117, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_DaffodilsOrange', 118, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_DaffodilsPink', 118, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_DaffodilsYellow', 118, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_GrasSnow_Paintable', 119, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_FlowersIce01', 120, 'On', 'Shader Graphs/S_FoliageShader'],
  ['P_FlowersIce02', 120, 'On', 'Shader Graphs/S_FoliageShader'],
  ['P_FlowersIce03', 120, 'On', 'Shader Graphs/S_FoliageShader'],
  ['P_Beach_BandedTulip', 121, 'On', 'Shader Graphs/S_StylizedBasic'],
  ['P_Beach_Conch', 121, 'On', 'Shader Graphs/S_StylizedBasic'],
  ['P_Beach_SandDollar', 121, 'On', 'Shader Graphs/S_StylizedBasic'],
  ['P_Beach_Scallop', 121, 'On', 'Shader Graphs/S_StylizedBasic'],
  ['P_Beach_Starfish', 121, 'On', 'Shader Graphs/S_StylizedBasic'],
  ['P_Weed01', 122, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_Weed02', 122, 'Off', 'Shader Graphs/S_FoliageShader'],
  ['P_Weed03', 122, 'Off', 'Shader Graphs/S_FoliageShader'],
];
for (const [index, prototype] of population.detailPrototypes.entries()) {
  const [name, materialIndex, shadowMode, shaderName] = expectedDetailRoutes[index];
  assert(prototype.prototype?.name === name, `detail ${index} prototype identity drifted`);
  assert(prototype.usePrototypeMesh === true, `detail ${index} stopped using its prefab mesh`);
  assert(prototype.useInstancing === true, `detail ${index} source instancing flag drifted`);
  assert(prototype.renderMode === 'VertexLit', `detail ${index} render mode drifted`);
  const prefab = population.prefabPrototypes[prototype.gltfPrefab];
  const renderers = prefab?.nodes?.filter((node) => node.renderer) ?? [];
  assert(renderers.length === 1, `detail ${index} prefab renderer inventory drifted`);
  assert(
    renderers[0].renderer.materialIndices.join(',') === String(materialIndex),
    `detail ${index} source material route drifted`,
  );
  assert(
    manifest.materials[materialIndex]?.shaderName === shaderName,
    `detail ${index} shader route drifted`,
  );
  assert(
    renderers[0].renderer.shadowCastingMode === shadowMode
      && renderers[0].renderer.receiveShadows === true,
    `detail ${index} source cast/receive state drifted`,
  );
}
for (const tree of population.treeInstances) {
  const prototype = population.treePrototypes[tree.prototypeIndex];
  assert(prototype, `tree references missing prototype ${tree.prototypeIndex}`);
  assert(population.prefabPrototypes[prototype.gltfPrefab], `tree prototype ${prototype.index} lost GLB prefab`);
}
assert(
  new Set(population.treeInstances.map((tree) => tree.color.join(','))).size === 103,
  'tree instance color metadata inventory drifted',
);
assert(
  new Set(population.treeInstances.map((tree) => tree.lightmapColor.join(','))).size === 1,
  'tree lightmap-color metadata inventory drifted',
);
const detailDensityFields = population.detailPrototypes.map((prototype) => {
  const bytes = readExact(prototype.data);
  assert(
    bytes.byteLength === terrain.detailResolution * terrain.detailResolution * 4,
    `detail ${prototype.index} byte length drifted`,
  );
  return decodeSoStylizedUnityInt32(bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ));
});
const expectedCoverageTotals = [
  24368549, 3884184, 367899, 1029892, 432945, 2888791, 89561,
  89583, 93707, 40912, 29711, 49139, 47855, 27109, 377812, 377784,
  377784,
];
for (let index = 0; index < detailDensityFields.length; index += 1) {
  const field = detailDensityFields[index];
  let coverageTotal = 0;
  let maxCoverage = 0;
  for (const value of field) {
    coverageTotal += value;
    if (value > maxCoverage) maxCoverage = value;
  }
  assert(coverageTotal === expectedCoverageTotals[index], `detail ${index} coverage field drifted`);
  assert(maxCoverage <= 255, `detail ${index} is not uint8 CoverageMode data`);
}

const expectedNativeDetailCounts = [
  248516, 2871, 201, 620, 229, 17556, 27, 13, 28,
  68, 9, 119, 84, 44, 199, 185, 102,
];
assert(
  expectedNativeDetailCounts
    .filter((_, index) => index <= 8 || index >= 14)
    .reduce((sum, count) => sum + count, 0) === 270547,
  'S_FoliageShader native detail population drifted',
);
assert(
  expectedNativeDetailCounts.slice(9, 14).reduce((sum, count) => sum + count, 0)
    === 324,
  'S_StylizedBasic native detail population drifted',
);
const expectedNativeDetailSha256 = [
  '96b1336067491ee80c884620950e644b788c3b79b51fad81e04bdbe7bfcf5d31',
  '349ff582f0ee38968ad8f770c12198d1bac13edfa413de5ad794c56e4ac1bfe5',
  'cda51572eb297f517981c02f91b0c15f7e385003d8536287f844fc0e7589548d',
  '126e0b386dc13b8a9f06b27d581eb89290e122abc625df6a55e8d721c9ebfe80',
  'b54186a6a2906bbc30b160725d8c674cc22a762f9faaa91ba7f7e1958ee98555',
  '6142a195c6402c9f66986d6abfca856d5b95bb7065070d13a5349aedabbf7eff',
  'f063eaf01da7d550c98beaa938f330152b239869aac08f2ad5baca8db4dca56a',
  '019828a7a092f04dde40d52b2b4628bcd4dd41852ff6eecfd2ab8269f6474b1a',
  '87e0d54c373ce46f2b91e9900055d0df526b831a0b7b9d798e3c5876a6bb94a7',
  'e0357826a2558ebb754b8d303a09da0f78f8a0588dbe91a6ee13815b4a1859b6',
  'e3d3441ec2a8c73c9bfe4da12a5e62cc08514f72db2a9f6d628312428601748d',
  '52d49babdff988c50492c37e70e19777236ecf047fe39ac3999c1f69eae844c0',
  'bd7cd2d4d6d3db298104441352df54e6c65fae7d5ca3ca8cfd884b07f2186028',
  'c3e8da6ce82f0578a64388f8941703024947cc8d6999f8edef4a9383afd664fd',
  '2edbad1830418845e6e0b8eeabb9387e5249d145085e863d811e20da3e7e7581',
  '0c9e4b9497dc8eb1ab34813d1dfc0e0921c1acd3be1802f6a154802c3b98791d',
  '5fdc699d632fcc1481fdcae56992f5b46a9258402aca2449db3a9500fd09998d',
];
const detailNativeTransformSets = population.detailPrototypes.map((prototype, index) => {
  const record = prototype.nativeTransforms;
  assert(record?.api === 'UnityEngine.TerrainData.ComputeDetailInstanceTransforms', `detail ${index} lost native API authority`);
  assert(record.unityVersion === '6000.5.4f1', `detail ${index} native editor version drifted`);
  assert(record.density === terrain.detailObjectDensity, `detail ${index} native density drifted`);
  assert(record.strideFloats === 6, `detail ${index} native transform stride drifted`);
  assert(record.patchCount === 256 && record.patches.length === 256, `detail ${index} native patch inventory drifted`);
  assert(record.transformCount === expectedNativeDetailCounts[index], `detail ${index} native count drifted`);
  const bytes = readExact(record.data);
  assert(bytes.byteLength === record.byteLength, `detail ${index} native byte length drifted`);
  const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  assert(actualSha256 === record.sha256, `detail ${index} native manifest SHA-256 drifted`);
  assert(actualSha256 === expectedNativeDetailSha256[index], `detail ${index} native fixture SHA-256 drifted`);
  const transforms = decodeSoStylizedUnityFloat32(bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ));
  return Object.freeze({ actualSha256, record, transforms });
});
const runtimeLoadedNativeTransformSets = await loadSoStylizedUnityMegaNativeDetailTransformSets(
  terrain,
  {
    baseUrl: SCENE_ROOT,
    fetchFn: async (absolutePath) => {
      const bytes = fs.readFileSync(absolutePath);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      };
    },
  },
);
assert(runtimeLoadedNativeTransformSets.length === 17, 'runtime native transform loader lost a prototype');
for (let index = 0; index < runtimeLoadedNativeTransformSets.length; index += 1) {
  assert(
    runtimeLoadedNativeTransformSets[index].actualSha256 === expectedNativeDetailSha256[index],
    `runtime native detail ${index} hash gate drifted`,
  );
}
const pcCaptureManifestPath = path.resolve(
  ROOT,
  'assets-local/sostylized-unity/mega-scene-native-pc-current/scene-manifest.json',
);
if (fs.existsSync(pcCaptureManifestPath)) {
  const pcManifest = JSON.parse(fs.readFileSync(pcCaptureManifestPath, 'utf8'));
  const pcPipeline = pcManifest.renderSettings.pipelineSettings;
  assert(pcManifest.renderSettings.captureLabel === 'pc-current-project-settings', 'PC export label drifted');
  assert(pcPipeline.asset?.guid === '4b83569d67af61e458304325a23e5dfd', 'PC pipeline GUID drifted');
  assert(pcPipeline.renderer?.guid === 'f288ae1f4751b564a96ac7587541f7a2', 'PC renderer GUID drifted');
  assert(pcPipeline.msaa === 1 && pcPipeline.mainLightShadowmapResolution === 2048, 'PC render settings drifted');
  assert(close(pcPipeline.shadowDistance, 50), 'PC shadow distance drifted');
  assert(pcPipeline.supportsHdr && pcPipeline.requiresDepthTexture && pcPipeline.requiresOpaqueTexture, 'PC HDR/depth/opaque settings drifted');
  assert(pcPipeline.colorGradingMode === 0 && pcPipeline.colorGradingLutSize === 32, 'PC color grade drifted');
  const pcSsao = pcPipeline.rendererFeatures.find((feature) => feature.name === 'ScreenSpaceAmbientOcclusion');
  assert(pcSsao?.aoMethod === 0 && pcSsao?.aoMethodName === 'BlueNoise', 'PC SSAO method drifted');
  assert(close(pcSsao?.radius, 0.3) && close(pcSsao?.effectiveRadius, 0.45), 'PC SSAO radius drifted');
  assert(pcSsao?.sampleQuality === 'Medium' && pcSsao?.sampleCount === 8, 'PC SSAO samples drifted');
  assert(close(pcSsao?.directLightingStrength, 0.25), 'PC SSAO direct-light strength drifted');
  for (let index = 0; index < population.detailPrototypes.length; index += 1) {
    const pcNative = pcManifest.terrains[0].detailPrototypes[index].nativeTransforms;
    assert(pcNative.transformCount === expectedNativeDetailCounts[index], `PC detail ${index} native count differs`);
    assert(pcNative.sha256 === expectedNativeDetailSha256[index], `pipeline changed detail ${index} native transforms`);
  }
}
assert(
  detailNativeTransformSets.reduce((sum, set) => sum + set.record.transformCount, 0) === 270871,
  '17-field native Unity detail population count drifted',
);
const firstDetailPlacements = buildSoStylizedUnityMegaNativeDetailPlacements({
  prototype: population.detailPrototypes[0],
  terrain,
  transformSet: detailNativeTransformSets[0],
});
assert(firstDetailPlacements.instanceCount === 248516, 'native grass placement count drifted');
const firstDetailTransform = firstDetailPlacements.transforms.subarray(0, 6);
assert(close(firstDetailTransform[0], 28.265172958374023), 'first native detail X drifted');
assert(close(firstDetailTransform[1], 3.2115819454193115), 'first native detail Y drifted');
assert(close(firstDetailTransform[2], -25.331462860107422), 'first native detail reflected Z drifted');
assert(close(firstDetailTransform[3], 0.4367375373840332), 'first native detail rotation drifted');
assert(close(firstDetailTransform[4], 1.0431936979293823), 'first native detail XZ scale drifted');
assert(close(firstDetailTransform[5], 1.0431936979293823), 'first native detail Y scale drifted');
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };
}
const glbBytes = readExact(manifest.glb);
const glbBuffer = glbBytes.buffer.slice(
  glbBytes.byteOffset,
  glbBytes.byteOffset + glbBytes.byteLength,
);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(glbBuffer, '', resolve, reject);
});
const trees = instantiateSoStylizedUnityMegaTerrainTrees({
  manifest,
  prefabLibrary: gltf.scenes[1],
});
assert(trees.instanceCount === 1695, 'tree runtime did not instantiate all 1,695 trees');
assert(trees.missingPrototypeCount === 0, 'tree runtime has missing prototype roots');
assert(trees.missingLodBindingCount === 0, 'tree runtime lost prefab LOD renderer bindings');
assert(trees.lodEntries.length === 1695, 'tree runtime did not bind every exported LODGroup');
const firstTree = population.treeInstances[0];
assert(close(trees.instances[0].position.x, firstTree.position[0] * terrain.size[0]), 'tree X conversion drifted');
assert(close(trees.instances[0].position.y, firstTree.position[1] * terrain.size[1]), 'tree height conversion drifted');
assert(close(trees.instances[0].position.z, -firstTree.position[2] * terrain.size[2]), 'tree Z reflection drifted');
assert(close(trees.instances[0].rotation.y, -firstTree.rotation), 'tree Y rotation reflection drifted');

let nativeFallbackRefused = false;
try {
  instantiateSoStylizedUnityMegaTerrainDetails({
    densityFields: detailDensityFields,
    manifest,
    placementMode: 'native-exact',
    prefabLibrary: gltf.scenes[1],
  });
} catch (error) {
  nativeFallbackRefused = String(error.message).includes('No generated-placement fallback is allowed');
}
assert(nativeFallbackRefused, 'native parity mode silently fell back to generated placements');

const details = instantiateSoStylizedUnityMegaTerrainDetails({
  densityFields: detailDensityFields,
  manifest,
  placementMode: 'native-exact',
  prefabLibrary: gltf.scenes[1],
  transformSets: detailNativeTransformSets,
});
assert(details.instanceCount === 270871, 'detail runtime native count drifted');
assert(details.expectedInstanceCount === 270871, 'detail runtime native expected count drifted');
assert(details.placementMode === 'native-exact', 'detail runtime left native parity mode');
assert(
  details.metadata.placementAuthority.endsWith(':native-exact'),
  'detail runtime lost native placement authority',
);
assert(details.meshCount === 17, 'detail runtime did not retain one source mesh per prototype');
assert(details.missingPrototypeCount === 0, 'detail runtime has missing prototype roots');
assert(details.prototypeEntries.length === 17, 'detail runtime lost a prototype entry');
assert(
  details.meshes.filter((mesh) => mesh.castShadow).length === 8,
  'detail renderer/shader shadow eligibility inventory drifted',
);
for (const entry of details.prototypeEntries) {
  assert(entry.sourceMeshes.length === 1, `detail ${entry.prototypeIndex} source mesh topology drifted`);
  const sourceMeshEntry = entry.sourceMeshes[0];
  assert(
    sourceMeshEntry.mesh.material === sourceMeshEntry.sourceMesh.material,
    `detail ${entry.prototypeIndex} stopped reusing its source material`,
  );
  assert(
    sourceMeshEntry.mesh.geometry.getAttribute('iUnityObjectPosition')?.isInstancedBufferAttribute,
    `detail ${entry.prototypeIndex} lost its per-instance object origin`,
  );
  assert(
    sourceMeshEntry.mesh.userData.soStylizedUnityRendererCastEligibility?.exact === true,
    `detail ${entry.prototypeIndex} lost cast-eligibility provenance`,
  );
}

const terrainNode = manifest.nodes[terrain.node];
const terrainRoot = new THREE.Group();
applySoStylizedUnityMegaTerrainPosition(terrainRoot, terrain, terrainNode);
terrainRoot.add(details.group, trees.group);
terrainRoot.updateMatrixWorld(true);
gltf.scene.updateMatrixWorld(true);

const firstTreeWorld = trees.instances[0].getWorldPosition(new THREE.Vector3());
assert(close(firstTreeWorld.x, 210.3446125984192, 1e-5), 'first tree world X/Terrain.GetPosition drifted');
assert(close(firstTreeWorld.y, 65.30391573905945, 1e-5), 'first tree world Y/Terrain.GetPosition drifted');
assert(close(firstTreeWorld.z, 125.37387013435364, 1e-5), 'first tree world reflected Z/Terrain.GetPosition drifted');
const firstDetailWorld = new THREE.Vector3(
  firstDetailTransform[0],
  firstDetailTransform[1],
  firstDetailTransform[2],
).applyMatrix4(terrainRoot.matrixWorld);
assert(close(firstDetailWorld.x, -471.734827041626, 1e-5), 'first detail world X/Terrain.GetPosition drifted');
assert(close(firstDetailWorld.y, -96.78841805458069, 1e-5), 'first detail world Y/Terrain.GetPosition drifted');
assert(close(firstDetailWorld.z, 474.6685371398926, 1e-5), 'first detail world reflected Z/Terrain.GetPosition drifted');
assert(terrainRoot.quaternion.equals(new THREE.Quaternion()), 'Terrain renderer incorrectly inherited Transform rotation');
assert(terrainRoot.scale.equals(new THREE.Vector3(1, 1, 1)), 'Terrain renderer incorrectly inherited Transform scale');

const rendererState = applySoStylizedUnityMegaRendererState(gltf.scene, manifest);
assert(rendererState.objectCount === manifest.nodes.length, 'scene node binding inventory drifted');
const cameraRecord = manifest.cameras[0];
const cameraNode = manifest.nodes[cameraRecord.node];
const camera = gltf.cameras[0];
applySoStylizedUnityMegaCameraRecord(camera, cameraRecord);
gltf.scene.updateMatrixWorld(true);
assert(close(cameraNode.worldPosition[0], 268.2099914550781), 'Unity camera source X drifted');
assert(close(cameraNode.worldPosition[1], 10.350000381469727), 'Unity camera source Y drifted');
assert(close(cameraNode.worldPosition[2], -14.960000038146973), 'Unity camera source Z drifted');
const nativeYaw = THREE.MathUtils.euclideanModulo(
  THREE.MathUtils.radToDeg(2 * Math.atan2(cameraNode.worldRotation[1], cameraNode.worldRotation[3])),
  360,
);
assert(close(nativeYaw, 276.8497100560585), 'Unity camera native yaw drifted');
const cameraWorld = camera.getWorldPosition(new THREE.Vector3());
const expectedCameraWorld = reflectSoStylizedUnityMegaPosition(cameraNode.worldPosition);
assert(cameraWorld.distanceTo(expectedCameraWorld) <= 1e-5, 'GLB camera world-position reflection drifted');
const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
const expectedCameraQuaternion = reflectSoStylizedUnityMegaQuaternion(cameraNode.worldRotation);
assert(
  close(Math.abs(cameraQuaternion.dot(expectedCameraQuaternion)), 1, 1e-6),
  'GLB camera world-quaternion reflection drifted',
);
assert(close(camera.fov, 60) && close(camera.near, 1), 'exported camera projection near/FOV drifted');
assert(close(camera.far, 500000) && close(camera.aspect, 1.3333333730697632), 'exported camera far/aspect drifted');

const detailUpdate = details.update(camera);
assert(
  detailUpdate.activePatchCount === 13,
  `exact camera detail patch window drifted: ${JSON.stringify(detailUpdate)}`,
);
assert(detailUpdate.activePrototypePatchCount === 45, 'exact camera prototype-patch count drifted');
assert(detailUpdate.activeInstanceCount === 79086, `exact camera active detail count drifted: ${JSON.stringify(detailUpdate)}`);
assert(detailUpdate.activeSelectionHash === 'f5e76234', 'exact camera detail selection hash drifted');
assert(details.metadata.activeInstanceCount === 79086, 'detail runtime metadata active count drifted');
const expectedActiveDetailCounts = [
  78035, 721, 0, 185, 70, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 40, 8,
];
for (const [index, entry] of details.prototypeEntries.entries()) {
  assert(
    entry.activeInstanceCount === expectedActiveDetailCounts[index],
    `exact camera active detail ${index} count drifted: ${JSON.stringify(details.prototypeEntries.map((candidate) => candidate.activeInstanceCount))}`,
  );
}
assert(
  expectedActiveDetailCounts.slice(1, 5).reduce((sum, count) => sum + count, 0) === 976,
  'exact camera flower population fixture drifted',
);

const firstTreeLod = trees.lodEntries[0];
const terrainTreeShadowBiasOne = trees.update(camera, { lodBias: 1 });
const terrainTreeLevelsBiasOne = trees.lodEntries.map(({ currentLevel }) => currentLevel);
const terrainTreeShadowSourceBias = trees.update(camera, { lodBias: SOURCE_LOD_BIAS });
assert(
  terrainTreeShadowBiasOne.casterEntries === 470
    && terrainTreeShadowBiasOne.culledEntries === 1005
    && terrainTreeShadowBiasOne.lodBias === 1
    && terrainTreeShadowBiasOne.selectedEntries === 690
    && terrainTreeShadowBiasOne.selectedRendererObjects === 690,
  `bias-1 Terrain tree shadow inventory drifted: ${JSON.stringify(terrainTreeShadowBiasOne)}`,
);
assert(
  terrainTreeShadowSourceBias.casterEntries === 554
    && terrainTreeShadowSourceBias.culledEntries === 761
    && terrainTreeShadowSourceBias.lodBias === 2
    && terrainTreeShadowSourceBias.selectedEntries === 934
    && terrainTreeShadowSourceBias.selectedRendererObjects === 934,
  `source-bias Terrain tree shadow inventory drifted: ${JSON.stringify(terrainTreeShadowSourceBias)}`,
);
const authoredTreePrototypeIndices = new Set(
  terrain.treePrototypes.filter((treePrototype) => {
    const prefab = manifest.prefabPrototypes[treePrototype.gltfPrefab];
    return (prefab.nodes ?? []).some((node) => (
      (node.renderer?.materialIndices ?? []).some((materialIndex) => (
        ['Shader Graphs/S_Leaves', 'Shader Graphs/S_Bark']
          .includes(manifest.materials[materialIndex]?.shaderName)
      ))
    ));
  }).map(({ index }) => index),
);
const terrainTreeCasterTransitions = trees.lodEntries.map((entry, index) => {
  const objects = entry.currentLevel >= 0
    ? (entry.levels[entry.currentLevel]?.objects ?? [])
    : [];
  return {
    biasOneLevel: terrainTreeLevelsBiasOne[index],
    distance: entry.wrapper.getWorldPosition(new THREE.Vector3()).distanceTo(cameraWorld),
    prefab: entry.wrapper.userData.soStylizedUnityTerrainTree.prefab?.name,
    prototypeIndex: entry.wrapper.userData.soStylizedUnityTerrainTree.prototypeIndex,
    sourceBiasCasts: objects.some((object) => object.castShadow),
    sourceBiasLevel: entry.currentLevel,
  };
}).filter((entry) => entry.sourceBiasCasts)
  .sort((left, right) => left.distance - right.distance);
const authoredCanopyCasterTransitions = terrainTreeCasterTransitions.filter(
  ({ prefab, prototypeIndex }) => (
    authoredTreePrototypeIndices.has(prototypeIndex)
    && /(?:Tree|Pine|Maple|Birch|Fir)/.test(prefab)
  ),
);
assert(authoredCanopyCasterTransitions.length === 230, 'authored canopy caster inventory drifted');
assert(
  authoredCanopyCasterTransitions.filter(({ biasOneLevel }) => biasOneLevel >= 0).length === 230,
  'PC lodBias must not unregister an authored canopy caster visible at bias 1',
);
assert(
  authoredCanopyCasterTransitions
    .filter(({ biasOneLevel, sourceBiasLevel }) => biasOneLevel !== sourceBiasLevel).length === 13,
  'PC lodBias canopy LOD transition inventory drifted',
);
const nearestAuthoredCanopy = authoredCanopyCasterTransitions[0];
assert(nearestAuthoredCanopy.prefab === 'P_OakTree1', 'nearest canopy prefab drifted');
assert(nearestAuthoredCanopy.biasOneLevel === 2, 'nearest canopy bias-1 LOD drifted');
assert(nearestAuthoredCanopy.sourceBiasLevel === 2, 'nearest canopy source-bias LOD drifted');
assert(close(nearestAuthoredCanopy.distance, 196.67697701266636, 1e-6));
const terrainTreeCasterMeshes = [];
trees.group.updateWorldMatrix(true, true);
trees.group.traverse((object) => {
  if (!object.isMesh || object.castShadow !== true) return;
  let current = object;
  while (current && current !== trees.group) {
    if (current.visible === false) return;
    current = current.parent;
  }
  terrainTreeCasterMeshes.push(object);
});
const terrainTreeCsmRenderedCounts = SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE
  .cascadeCullingPlanesThree.map((planes) => terrainTreeCasterMeshes.filter((object) => {
    if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();
    const sphere = object.geometry.boundingSphere.clone().applyMatrix4(object.matrixWorld);
    return planes.every((plane) => (
      plane[0] * sphere.center.x
        + plane[1] * sphere.center.y
        + plane[2] * sphere.center.z
        + plane[3]
        + sphere.radius >= 0
    ));
  }).length);
assert(terrainTreeCasterMeshes.length === 990, 'visible Terrain-tree caster mesh inventory drifted');
assert(
  JSON.stringify(terrainTreeCsmRenderedCounts) === JSON.stringify([4, 7, 10, 10]),
  `Terrain-tree native CSM membership drifted: ${JSON.stringify(terrainTreeCsmRenderedCounts)}`,
);
const firstTreeReference = new THREE.Vector3(
  firstTreeLod.localReferencePoint[0],
  firstTreeLod.localReferencePoint[1],
  -firstTreeLod.localReferencePoint[2],
);
firstTreeLod.wrapper.localToWorld(firstTreeReference);
const firstTreeScale = firstTreeLod.wrapper.getWorldScale(new THREE.Vector3());
const firstTreeRelativeHeight = (
  firstTreeLod.size
  * Math.max(Math.abs(firstTreeScale.x), Math.abs(firstTreeScale.y), Math.abs(firstTreeScale.z))
) / (
  cameraWorld.distanceTo(firstTreeReference)
  * 2
  * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
  / SOURCE_LOD_BIAS
);
let expectedTreeLevel = -1;
for (let index = 0; index < firstTreeLod.levels.length; index += 1) {
  if (firstTreeRelativeHeight >= firstTreeLod.levels[index].threshold) {
    expectedTreeLevel = index;
    break;
  }
}
trees.update(camera, { lodBias: SOURCE_LOD_BIAS });
assert(firstTreeLod.currentLevel === expectedTreeLevel, 'tree LOD reflected reference selection drifted');
assert(
  trees.group.userData.soStylizedUnityTerrainTrees.lastLodBias === SOURCE_LOD_BIAS,
  'tree LOD runtime did not retain the active PC QualitySettings.lodBias',
);

const sceneObjects = gltf.scene.userData.soStylizedUnityNodeObjects;
let independentlyEvaluatedLods = 0;
for (const lodGroup of manifest.lodGroups) {
  const groupObject = sceneObjects.get(lodGroup.node);
  assert(groupObject, `LODGroup ${lodGroup.index} lost its scene object`);
  const selection = calculateSoStylizedUnityMegaLodSelection(
    groupObject,
    lodGroup,
    camera,
    { lodBias: SOURCE_LOD_BIAS },
  );
  const manualReference = new THREE.Vector3(
    lodGroup.localReferencePoint[0],
    lodGroup.localReferencePoint[1],
    -lodGroup.localReferencePoint[2],
  );
  groupObject.localToWorld(manualReference);
  assert(
    manualReference.distanceTo(new THREE.Vector3().fromArray(selection.referenceWorld)) <= 1e-6,
    `LODGroup ${lodGroup.index} local-reference reflection drifted`,
  );
  const manualScale = groupObject.getWorldScale(new THREE.Vector3());
  const manualSize = lodGroup.size * Math.max(
    Math.abs(manualScale.x),
    Math.abs(manualScale.y),
    Math.abs(manualScale.z),
  );
  const manualRelativeHeight = manualSize / (
    Math.max(manualReference.distanceTo(cameraWorld), 1e-6)
    * 2
    * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
    / SOURCE_LOD_BIAS
  );
  assert(close(selection.worldSize, manualSize), `LODGroup ${lodGroup.index} world size drifted`);
  assert(close(selection.relativeHeight, manualRelativeHeight), `LODGroup ${lodGroup.index} equation drifted`);
  let manualLevel = -1;
  for (let level = 0; level < lodGroup.lods.length; level += 1) {
    if (manualRelativeHeight >= lodGroup.lods[level].screenRelativeTransitionHeight) {
      manualLevel = level;
      break;
    }
  }
  assert(selection.selectedLevel === manualLevel, `LODGroup ${lodGroup.index} selection drifted`);
  independentlyEvaluatedLods += 1;
}
assert(independentlyEvaluatedLods === 802, 'not all 802 scene LOD equations were evaluated');
const firstSceneLod = calculateSoStylizedUnityMegaLodSelection(
  sceneObjects.get(manifest.lodGroups[0].node),
  manifest.lodGroups[0],
  camera,
  { lodBias: SOURCE_LOD_BIAS },
);
assert(close(firstSceneLod.localReferencePoint[2], -0.2700314521789551), 'first LOD reference Z was not reflected');
assert(close(firstSceneLod.referenceWorld[2], -85.56853093698832, 1e-5), 'first LOD world reference fixture drifted');
assert(firstSceneLod.selectedLevel === 2, 'first LOD selected-level fixture drifted');
const lodReport = updateSoStylizedUnityMegaLods(
  gltf.scene,
  manifest,
  camera,
  { lodBias: SOURCE_LOD_BIAS },
);
assert(lodReport.lodBias === 2, 'scene LOD runtime left the active PC QualitySettings.lodBias');
assert(lodReport.groups === 802 && lodReport.evaluatedGroups === 802, 'scene LOD runtime coverage drifted');
assert(lodReport.missingGroupObjects === 0, 'scene LOD runtime lost group objects');
assert(lodReport.missingRendererBindings === 0, 'scene LOD runtime lost renderer bindings');
assert(
  lodReport.selectedGroups === 265 && lodReport.culledGroups === 537,
  `scene LOD camera selection inventory drifted (${JSON.stringify(lodReport)})`,
);
assert(lodReport.visibleRenderers === 265, 'scene LOD visible renderer inventory drifted');
assert(lodReport.selectionHash === '71fa1d2b', 'scene LOD deterministic selection hash drifted');
const visibleSceneCasterMeshes = [];
gltf.scene.traverse((object) => {
  if (!object.isMesh || object.castShadow !== true) return;
  let current = object;
  while (current && current !== gltf.scene) {
    if (current.visible === false) return;
    current = current.parent;
  }
  const renderer = object.userData.soStylizedUnityRenderer;
  if (!Array.isArray(renderer?.sourceBoundsCenter)
      || !Array.isArray(renderer?.sourceBoundsSize)) return;
  visibleSceneCasterMeshes.push(object);
});
const sceneRendererCsmMembers = SO_STYLIZED_UNITY_SHADOW_NATIVE_ORACLE
  .cascadeCullingPlanesThree.map((planes) => visibleSceneCasterMeshes.filter((object) => {
    const renderer = object.userData.soStylizedUnityRenderer;
    return intersectsSoStylizedUnityCascadeCullingPlanes(
      renderer.sourceBoundsCenter,
      renderer.sourceBoundsSize,
      planes,
    );
  }));
assert(visibleSceneCasterMeshes.length === 741, 'visible exact scene-caster inventory drifted');
assert(
  JSON.stringify(sceneRendererCsmMembers.map((members) => members.length))
    === JSON.stringify([13, 18, 23, 23]),
  'scene-renderer native CSM membership drifted',
);
const sceneOakCasterNodeSets = sceneRendererCsmMembers.map((members) => [...new Set(
  members.filter((object) => /^SM_OakTree/.test(object.name))
    .map((object) => object.userData.soStylizedUnityRenderer.node),
)].sort((left, right) => left - right));
assert(
  JSON.stringify(sceneOakCasterNodeSets)
    === JSON.stringify([[1224], [1099, 1224], [1064, 1099, 1224], [1064, 1099, 1224]]),
  `near scene Oak CSM membership drifted: ${JSON.stringify(sceneOakCasterNodeSets)}`,
);

details.dispose();
trees.dispose();

const exporterSource = fs.readFileSync(path.join(ROOT, 'scripts/unity/UnitySceneExport.cs'), 'utf8');
assert(exporterSource.includes('data.GetHeights(0, 0, data.heightmapResolution, data.heightmapResolution)'), 'exporter no longer reads Unity heights');
assert(exporterSource.includes('data.GetAlphamaps(0, 0, data.alphamapWidth, data.alphamapHeight)'), 'exporter no longer reads Unity splats');
assert(exporterSource.includes('position = ToArray(terrain.GetPosition())'), 'exporter lost Terrain.GetPosition authority');
assert(exporterSource.includes('rendererWorldPosition = terrain.GetPosition() + localPosition'), 'exporter lost translation-only surface probes');
assert(exporterSource.includes('serializedTransformWorldPosition = ToArray('), 'exporter lost the ignored-Transform counterprobe');
assert(exporterSource.includes('data.GetHoles(0, 0, data.holesResolution, data.holesResolution)'), 'exporter no longer reads Unity holes');
assert(exporterSource.includes('data.ComputeDetailInstanceTransforms('), 'exporter no longer reads native Unity detail transforms');
assert(exporterSource.includes('writer.Write(transform.posX);'), 'native detail posX serialization drifted');
assert(exporterSource.includes('writer.Write(transform.posY);'), 'native detail posY serialization drifted');
assert(exporterSource.includes('writer.Write(transform.posZ);'), 'native detail posZ serialization drifted');
assert(exporterSource.includes('writer.Write(transform.rotationY);'), 'native detail rotation serialization drifted');
assert(exporterSource.includes('writer.Write(transform.scaleXZ);'), 'native detail XZ-scale serialization drifted');
assert(exporterSource.includes('writer.Write(transform.scaleY);'), 'native detail Y-scale serialization drifted');
assert(exporterSource.includes('for (var layer = 0; layer < values.GetLength(2); layer += 1)'), 'float volume order drifted');

// Terrain TreeInstance.color is exported as provenance, but these custom
// Shader Graphs do not consume Unity's built-in TerrainEngine tree uniforms.
// Applying the 103 source metadata colors in ToonLab would therefore invent a
// tint that is absent from the compiled S_Leaves/S_Bark programs.
const generatedForwardShaders = [
  'assets-local/sostylized-unity/generated-shaders/passes/S_Leaves/sub-00-pass-00-ForwardLit.shader',
  'assets-local/sostylized-unity/generated-shaders/passes/S_Bark/sub-00-pass-00-ForwardLit.shader',
  'assets-local/sostylized-unity/generated-shaders/passes/S_FoliageShader/sub-00-pass-00-ForwardLit.shader',
].map((relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
for (const [index, source] of generatedForwardShaders.entries()) {
  assert(!source.includes('_TreeInstanceColor'), `generated shader ${index} unexpectedly consumes TreeInstance.color`);
  assert(!source.includes('_TreeInstanceScale'), `generated shader ${index} unexpectedly consumes TreeInstance scale uniforms`);
  assert(!source.includes('TerrainEngine.cginc'), `generated shader ${index} unexpectedly uses built-in TerrainEngine shading`);
}

const urpSourceRoot = findUrpTerrainSource();
assert(urpSourceRoot, 'Unity URP Terrain/Lit package source was not found');
const terrainPasses = fs.readFileSync(path.join(urpSourceRoot, 'TerrainLitPasses.hlsl'), 'utf8');
const terrainInput = fs.readFileSync(path.join(urpSourceRoot, 'TerrainLitInput.hlsl'), 'utf8');
assert(terrainPasses.includes('float2 splatUV = (IN.uvMainAndLM.xy * (_Control_TexelSize.zw - 1.0f) + 0.5f) * _Control_TexelSize.xy;'), 'URP control sampling changed');
assert(terrainPasses.includes('splatControl /= (weight + HALF_MIN);'), 'URP splat normalization changed');
assert(terrainPasses.includes('nrm += splatControl.r * UnpackNormalScale'), 'URP normal blend changed');
assert(terrainPasses.includes('half smoothness = dot(splatControl, defaultSmoothness);'), 'URP smoothness blend changed');
assert(terrainPasses.includes('half metallic = dot(splatControl, defaultMetallic);'), 'URP metallic blend changed');
assert(terrainPasses.includes('color.rgb *= color.a;'), 'URP post-BRDF pass weighting changed');
assert(terrainPasses.includes('#ifdef TERRAIN_SPLAT_ADDPASS'), 'URP add-pass topology changed');
const terrainAdd = fs.readFileSync(path.join(urpSourceRoot, 'TerrainLitAdd.shader'), 'utf8');
assert(terrainAdd.includes('Blend One One'), 'URP Terrain/Lit add-pass blending changed');
assert(terrainAdd.includes('ZWrite Off'), 'URP Terrain/Lit add-pass depth-write state changed');
assert(terrainInput.includes('clip(hole < epsilon ? -1 : 1);'), 'URP hole polarity changed');
assert(
  terrainInput.includes('half4 _DiffuseRemapScale0, _DiffuseRemapScale1, _DiffuseRemapScale2, _DiffuseRemapScale3;'),
  'URP Terrain/Lit diffuse remap Vector4 contract changed',
);
assert(
  terrainInput.includes('half4(_DiffuseRemapScale##i.rgb, 1.0h)'),
  'URP Terrain/Lit diffuse texture/remap multiplication changed',
);

geometry.dispose();
material.dispose();
terrainMaterials.materials.forEach((entry) => entry.dispose());
rgbaControl.dispose();
redControl.dispose();
white.dispose();
flatNormal.dispose();

console.log('So Stylized Unity Mega terrain verified source-to-source');
console.log('  geometry: 513x513 reflected-Z vertices; 512x512 hole-aware cells');
console.log('  splats: 2048x2048x5 float32 default; uint8 fast path explicit');
console.log(`  native probes: 81 TerrainData points / height ${maximumNativeProbeHeightError} m / splat ${maximumNativeProbeSplatError}`);
console.log('  Terrain/Lit: 5/5 layers, importer state, PBR values and URP metallic BRDF connected');
console.log('  Terrain/Lit passes: layers 0-3 opaque + layer 4 Blend One One after independent BRDF');
console.log('  Terrain colors: 5/5 sRGB diffuse textures; identity Vector4 remaps; no material Color property');
console.log('  population: 1,695 exact trees / 270,871 native Unity details / 17 prototypes');
console.log('  detail shader split: 270,547 S_FoliageShader / 324 S_StylizedBasic instances');
console.log('  details: 3,989 authored flower instances / 976 in the exact Camera 0 culling window');
console.log('  tree tint: 103 exported instance colors retained as metadata; 0 custom-graph consumers');
console.log('  tree shadows: PC bias 2 = 554 LOD casters; CSM raster membership scene 13/18/23/23 + Terrain-tree 4/7/10/10 + terrain surface 1');
console.log('  camera window: 13 patches / 45 prototype-patches / 79,086 active / hash f5e76234');
console.log('  camera + LOD: reflected source pose / PC lodBias 2 / 802 of 802 equations / selection hash 71fa1d2b');
