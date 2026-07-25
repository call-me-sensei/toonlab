#!/usr/bin/env node

// Source-only gate for Unity material color upload semantics. This deliberately
// avoids screenshot matching: Shader Graph declarations, material records,
// exact runtime builders, terrain-layer field types, and post contracts are the
// authority.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SO_STYLIZED_UNITY_BLOOM_CONTRACT } from '../src/environment/soStylizedUnityBloom.js';
import { SO_STYLIZED_UNITY_RENDER_CONTRACT } from '../src/environment/soStylizedUnityRendering.js';
import { linearizeSoStylizedUnityColorProperty } from '../src/environment/soStylizedUnitySceneRecords.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const UNITY_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const MANIFEST_ROOT = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene',
);
const MANIFEST_PATH = resolve(MANIFEST_ROOT, 'scene-manifest.json');
const NATIVE_MANIFEST_PATH = resolve(
  PACKAGE_ROOT,
  'assets-local/sostylized-unity/mega-scene-native-pc-current/scene-manifest.json',
);

const GRAPH_CONTRACTS = Object.freeze([
  Object.freeze({
    path: 'Environment/Foliage/Shaders/S_FoliageShader.shadergraph',
    shader: 'Shader Graphs/S_FoliageShader',
    activeDefaultColors: Object.freeze([
      '_Bottom_Color',
      '_Specular_Color',
      '_Texture_Tint',
      '_Tip_Color',
    ]),
  }),
  Object.freeze({
    path: 'Environment/Misc/Shaders/S_Snow.shadergraph',
    shader: 'Shader Graphs/S_Snow',
    activeDefaultColors: Object.freeze(['_Snow_Tint']),
  }),
  Object.freeze({
    path: 'Materials/Shaders/S_StylizedBasic.shadergraph',
    shader: 'Shader Graphs/S_StylizedBasic',
    activeDefaultColors: Object.freeze(['_Base_Color']),
  }),
  Object.freeze({
    path: 'Environment/Rocks/Shaders/S_Rock.shadergraph',
    shader: 'Shader Graphs/S_Rock',
    activeDefaultColors: Object.freeze([
      '_Distant_Tint_Blend',
      '_Grass_Tint',
      '_Moss_Color',
      '_Moss_Color_2',
      '_Rock_Striping_Overlay_Color',
      '_Rock_Tint',
      '_Sand_Tint',
      '_Snow_Tint',
    ]),
  }),
  Object.freeze({
    path: 'Environment/Rocks/Shaders/S_Mountain.shadergraph',
    shader: 'Shader Graphs/S_Mountain',
    activeDefaultColors: Object.freeze([]),
  }),
  Object.freeze({
    path: 'Environment/Sky/Shaders/S_StylizedSky.shadergraph',
    shader: 'Shader Graphs/S_StylizedSky',
    activeDefaultColors: Object.freeze(['_Cloud_Color']),
  }),
  Object.freeze({
    path: 'Environment/Sky/Shaders/S_StylizedClouds.shadergraph',
    shader: 'Shader Graphs/S_StylizedClouds',
    activeDefaultColors: Object.freeze([]),
    disconnectedDefaultColors: Object.freeze(['_Tint']),
  }),
  Object.freeze({
    path: 'Environment/Water/Shaders/S_StylizedWater.shadergraph',
    shader: 'Shader Graphs/S_StylizedWater',
    activeDefaultColors: Object.freeze([
      '_Shoreline_Foam_Color',
      '_Specular_Color',
      '_Specular_Color_Far',
    ]),
  }),
  Object.freeze({
    path: 'Environment/Water/Shaders/S_WaterWaves.shadergraph',
    shader: 'Shader Graphs/S_WaterWaves',
    activeDefaultColors: Object.freeze(['_Foam_Color']),
  }),
  Object.freeze({
    path: 'Environment/Water/Shaders/S_Waterfall.shadergraph',
    shader: 'Shader Graphs/S_Waterfall',
    activeDefaultColors: Object.freeze([
      '_Bottom_Color',
      '_Foam_Color',
      '_Top_Color',
    ]),
  }),
]);

const REMAINING_SHADER_NAMES = new Set([
  'Shader Graphs/S_FoliageShader',
  'Shader Graphs/S_Snow',
  'Shader Graphs/S_StylizedBasic',
  'Shader Graphs/S_StylizedSky',
  'Shader Graphs/S_StylizedWater',
  'Shader Graphs/S_WaterWaves',
  'Shader Graphs/S_Waterfall',
  'Universal Render Pipeline/Lit',
]);
const ALL_AUDITED_SHADER_NAMES = new Set([
  ...REMAINING_SHADER_NAMES,
  'Shader Graphs/S_Rock',
]);

function shortType(document) {
  return String(document?.m_Type ?? '').split('.').at(-1);
}

function parseGraph(relativePath) {
  return readFileSync(resolve(UNITY_ROOT, relativePath), 'utf8')
    .trim()
    .split(/\n\n(?=\{)/)
    .map(JSON.parse);
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function closeArray(actual, expected, tolerance = 1e-7, label = 'array') {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => assert.ok(
    Math.abs(value - expected[index]) <= tolerance,
    `${label}[${index}]: expected ${expected[index]}, received ${value}`,
  ));
}

let shaderGraphColorDeclarations = 0;
for (const contract of GRAPH_CONTRACTS) {
  const documents = parseGraph(contract.path);
  const colorProperties = documents.filter(
    (document) => shortType(document) === 'ColorShaderProperty',
  );
  const active = [];
  const disconnected = [];
  for (const property of colorProperties) {
    assert.equal(
      property.m_ColorMode,
      0,
      `${contract.shader} ${property.m_DefaultReferenceName} must remain ColorMode.Default`,
    );
    const propertyNodeCount = documents.filter((document) => (
      shortType(document) === 'PropertyNode'
      && document.m_Property?.m_Id === property.m_ObjectId
    )).length;
    (propertyNodeCount > 0 ? active : disconnected).push(
      property.m_DefaultReferenceName,
    );
  }
  assert.deepEqual(
    sorted(active),
    sorted(contract.activeDefaultColors),
    `${contract.shader} connected default-color properties`,
  );
  assert.deepEqual(
    sorted(disconnected),
    sorted(contract.disconnectedDefaultColors ?? []),
    `${contract.shader} disconnected default-color properties`,
  );
  shaderGraphColorDeclarations += active.length;
}
assert.equal(shaderGraphColorDeclarations, 22);

// Exact Unity sRGB transfer and alpha preservation. The exported URP/Lit
// 0.9063317 material value is the canonical round-trip to 0.8 linear.
closeArray(
  linearizeSoStylizedUnityColorProperty([0.9063317179679871, 0.04045, 0, 0.37]),
  [0.7999999293458716, 0.0031308049535603713, 0, 0.37],
  1e-12,
  'Unity Color upload',
);

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const remainingMaterialRecords = manifest.materials.filter(
  (record) => REMAINING_SHADER_NAMES.has(record.shaderName),
);
const allAuditedMaterialRecords = manifest.materials.filter(
  (record) => ALL_AUDITED_SHADER_NAMES.has(record.shaderName),
);
assert.equal(remainingMaterialRecords.length, 31);
assert.equal(allAuditedMaterialRecords.length, 56);

function rendererMaterialSlotCount(shaderNames) {
  let count = 0;
  for (const node of manifest.nodes) {
    for (const materialIndex of node.renderer?.materialIndices ?? []) {
      if (shaderNames.has(manifest.materials[materialIndex]?.shaderName)) count += 1;
    }
  }
  return count;
}

const remainingRendererMaterialSlots = rendererMaterialSlotCount(REMAINING_SHADER_NAMES);
const allAuditedRendererMaterialSlots = rendererMaterialSlotCount(ALL_AUDITED_SHADER_NAMES);
assert.equal(remainingRendererMaterialSlots, 194);
assert.equal(allAuditedRendererMaterialSlots, 707);

// Count native runtime expansion, not the legacy density-field fallback.
// Terrain trees clone prefab slots per instance and Terrain details consume
// Unity's exact ComputeDetailInstanceTransforms streams.
const terrain = manifest.terrains[0];
function expandedTreeMaterialSlots(shaderNames) {
  let count = 0;
  const byShader = {};
  for (const instance of terrain.treeInstances) {
    const prototype = terrain.treePrototypes[instance.prototypeIndex];
    const prefab = manifest.prefabPrototypes[prototype.gltfPrefab];
    for (const node of prefab.nodes) {
      for (const materialIndex of node.renderer?.materialIndices ?? []) {
        const shader = manifest.materials[materialIndex]?.shaderName;
        if (!shaderNames.has(shader)) continue;
        count += 1;
        byShader[shader] = (byShader[shader] ?? 0) + 1;
      }
    }
  }
  return { byShader, count };
}
const remainingTreeSlots = expandedTreeMaterialSlots(REMAINING_SHADER_NAMES);
const allAuditedTreeSlots = expandedTreeMaterialSlots(ALL_AUDITED_SHADER_NAMES);
assert.equal(remainingTreeSlots.count, 720);
assert.deepEqual(remainingTreeSlots.byShader, {
  'Shader Graphs/S_FoliageShader': 696,
  'Shader Graphs/S_Snow': 8,
  'Universal Render Pipeline/Lit': 16,
});
assert.equal(allAuditedTreeSlots.count, 861);
assert.equal(allAuditedTreeSlots.byShader['Shader Graphs/S_Rock'], 141);

const nativeManifest = JSON.parse(readFileSync(NATIVE_MANIFEST_PATH, 'utf8'));
const nativeDetailAssignmentsByShader = {};
for (const prototype of nativeManifest.terrains[0].detailPrototypes) {
  const prefab = nativeManifest.prefabPrototypes[prototype.gltfPrefab];
  const materialIndices = prefab?.nodes?.flatMap(
    (node) => node.renderer?.materialIndices ?? [],
  ) ?? [];
  for (const materialIndex of materialIndices) {
    const shader = nativeManifest.materials[materialIndex]?.shaderName;
    if (!ALL_AUDITED_SHADER_NAMES.has(shader)) continue;
    assert.equal(
      prototype.nativeTransforms?.api,
      'UnityEngine.TerrainData.ComputeDetailInstanceTransforms',
      `detail ${prototype.index} native authority`,
    );
    nativeDetailAssignmentsByShader[shader] = (
      nativeDetailAssignmentsByShader[shader] ?? 0
    ) + prototype.nativeTransforms.transformCount;
  }
}
assert.deepEqual(nativeDetailAssignmentsByShader, {
  'Shader Graphs/S_FoliageShader': 270547,
  'Shader Graphs/S_StylizedBasic': 324,
});
const nativeDetailAssignmentCount = Object.values(nativeDetailAssignmentsByShader)
  .reduce((sum, count) => sum + count, 0);
assert.equal(nativeDetailAssignmentCount, 270871);
assert.equal(
  remainingRendererMaterialSlots + remainingTreeSlots.count + nativeDetailAssignmentCount,
  271785,
);
assert.equal(
  allAuditedRendererMaterialSlots + allAuditedTreeSlots.count
    + nativeDetailAssignmentCount,
  272439,
);

const recordsSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnitySceneRecords.js'),
  'utf8',
);
const foliageSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnitySceneFoliageMaterials.js'),
  'utf8',
);
const basicSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnitySceneBasicMaterials.js'),
  'utf8',
);
const skySource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnitySceneSkyMaterials.js'),
  'utf8',
);
const waterSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnitySceneWaterMaterials.js'),
  'utf8',
);
const rockSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/rockgen/reference/unityRockMaterial.js'),
  'utf8',
);
assert.match(recordsSource, /channel <= 0\.04045[\s\S]*?channel \/ 12\.92/);
assert.match(recordsSource, /\(\(channel \+ 0\.055\) \/ 1\.055\) \*\* 2\.4/);
for (const property of ['bottomColor', 'specularColor', 'textureTint', 'tipColor']) {
  assert.match(
    foliageSource,
    new RegExp(`linearizeSoStylizedUnityColorProperty\\(values\\.${property}\\)`),
    `foliage ${property} linear upload`,
  );
}
assert.match(basicSource, /linearizeSoStylizedUnityColorProperty\(values\.tint\)/);
assert.match(basicSource, /linearizeSoStylizedUnityColorProperty\(values\.baseColor\)/);
assert.match(skySource, /linearizeSoStylizedUnityColorProperty\(values\.cloudColor\)/);
for (const property of [
  'shorelineFoamColor',
  'specularColor',
  'specularColorFar',
  'foamColor',
  'bottomColor',
  'topColor',
]) {
  assert.match(
    waterSource,
    new RegExp(`linearizeSoStylizedUnityColorProperty\\(values\\.${property}\\)`),
    `water ${property} linear upload`,
  );
}
assert.match(rockSource, /function unityColorProperty\(value\)/);
assert.match(rockSource, /\.map\(unitySrgbChannelToLinear\)/);
assert.match(rockSource, /unityColorProperty\(resolvedProfile\.base\.tint\)/);
assert.match(rockSource, /unityColorProperty\(resolvedProfile\.base\.distantTint\)/);
assert.match(rockSource, /unityColorProperty\(resolvedProfile\.base\.striping\.color\)/);
assert.match(rockSource, /unityColorProperty\(layer\.tint\)/);

// Terrain diffuseRemapMax is a serialized Vector4 remap field (x/y/z/w), not
// a Shader Graph/ShaderLab Color property. Its textures already request sRGB
// sampling, so converting the remap again would be a double transform.
for (const layer of terrain.layers) {
  assert.deepEqual(layer.diffuseRemapMax, [1, 1, 1, 1]);
  assert.equal(manifest.textures[layer.diffuseTexture].importer.sRGBTexture, true);
  const layerYaml = readFileSync(resolve(
    UNITY_ROOT,
    layer.asset.path.replace(/^Assets\/SoStylized-Unity\//, ''),
  ), 'utf8');
  assert.match(layerYaml, /m_DiffuseRemapMax: \{x:/);
}
const terrainSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnityMegaTerrain.js'),
  'utf8',
);
assert.match(
  terrainSource,
  /diffuseSample\.rgb\.mul\(vec3\(\.\.\.diffuseTint\)\)\.mul\(weight\)/,
);

// Renderer globals and post inputs are already represented in the domain in
// which URP consumes them. Verify those explicit contracts to prevent this
// material fix from double-decoding fog, bloom, or the LDR LUT filter.
closeArray(
  SO_STYLIZED_UNITY_BLOOM_CONTRACT.tintLinear,
  linearizeSoStylizedUnityColorProperty([
    ...SO_STYLIZED_UNITY_BLOOM_CONTRACT.tintSrgb,
    1,
  ]).slice(0, 3),
  5e-7,
  'bloom tint',
);
closeArray(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.colorGrade.colorFilterLinear,
  linearizeSoStylizedUnityColorProperty([
    ...SO_STYLIZED_UNITY_RENDER_CONTRACT.colorGrade.colorFilterSrgb,
    1,
  ]).slice(0, 3),
  5e-7,
  'LDR filter',
);
assert.equal(SO_STYLIZED_UNITY_RENDER_CONTRACT.fog.colorLinear.length, 3);
assert.notDeepEqual(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.fog.colorLinear,
  SO_STYLIZED_UNITY_RENDER_CONTRACT.fog.colorSrgb,
);

console.log(JSON.stringify({
  ok: true,
  declarations: {
    activeShaderGraphDefaultColors: shaderGraphColorDeclarations,
    activeUrpLitShaderLabColors: 1,
    disconnectedExcluded: ['Shader Graphs/S_StylizedClouds::_Tint'],
    mountainExposedColors: 0,
  },
  affected: {
    allMaterialRecordsIncludingRock: allAuditedMaterialRecords.length,
    allRendererMaterialSlotsIncludingRock: allAuditedRendererMaterialSlots,
    allExpandedTreeSlotsIncludingRock: allAuditedTreeSlots.count,
    allNativeDetailAssignmentsIncludingRock: nativeDetailAssignmentCount,
    allRuntimeApplicationsIncludingRock:
      allAuditedRendererMaterialSlots + allAuditedTreeSlots.count
      + nativeDetailAssignmentCount,
    foliageNativeDetailAssignments:
      nativeDetailAssignmentsByShader['Shader Graphs/S_FoliageShader'],
    remainingMaterialRecords: remainingMaterialRecords.length,
    remainingRendererMaterialSlots,
    remainingExpandedTreeSlots: remainingTreeSlots.count,
    remainingNativeDetailAssignments: nativeDetailAssignmentCount,
    remainingRuntimeApplications:
      remainingRendererMaterialSlots + remainingTreeSlots.count
      + nativeDetailAssignmentCount,
    stylizedBasicNativeDetailAssignments:
      nativeDetailAssignmentsByShader['Shader Graphs/S_StylizedBasic'],
  },
  exclusions: {
    cloudTint: 'disconnected graph property',
    mountain: 'no exposed ColorShaderProperty',
    post: 'already-linear/native renderer contracts',
    terrainDiffuseRemap: 'Vector4 remap; diffuse texture performs sRGB decode',
  },
}, null, 2));
