import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { float, positionLocal, vec3 } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_MATERIAL_PASS_CONTRACTS,
  createSoStylizedUnityPassCouplingReport,
  evaluateSoStylizedUnityAlphaClip,
  installSoStylizedUnityMaterialPassCoupling,
  resolveSoStylizedUnityMaterialPassContract,
} from '../src/environment/soStylizedUnityMaterialPassCoupling.js';
import {
  resolveSoStylizedUnityRendererCastEligibility,
  resolveSoStylizedUnityShadowCasterPass,
} from '../src/environment/soStylizedUnityShadows.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOONLAB_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(TOONLAB_ROOT, '..');
const UNITY_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity');
const GENERATED_ROOT = resolve(
  TOONLAB_ROOT,
  'assets-local/sostylized-unity/generated-shaders',
);
const SCENE_MANIFEST_PATH = resolve(
  TOONLAB_ROOT,
  'assets-local/sostylized-unity/mega-scene/scene-manifest.json',
);

const TARGETS = Object.freeze([
  Object.freeze({
    directory: 'S_FoliageShader',
    graph: 'Environment/Foliage/Shaders/S_FoliageShader.shadergraph',
    alphaClip: true,
    renderFace: 0,
    shaderName: 'Shader Graphs/S_FoliageShader',
    vertexToken: '_Additional_Z_Offset',
  }),
  Object.freeze({
    directory: 'S_Leaves',
    graph: 'Environment/Trees/Shaders/S_Leaves.shadergraph',
    alphaClip: true,
    renderFace: 0,
    shaderName: 'Shader Graphs/S_Leaves',
    vertexToken: 'Unity_SimpleNoise_Deterministic_float',
  }),
  Object.freeze({
    directory: 'S_Bark',
    graph: 'Environment/Trees/Shaders/S_Bark.shadergraph',
    alphaClip: false,
    renderFace: 2,
    shaderName: 'Shader Graphs/S_Bark',
    vertexToken: 'description.Position = IN.ObjectSpacePosition;',
  }),
  Object.freeze({
    directory: 'S_Snow',
    graph: 'Environment/Misc/Shaders/S_Snow.shadergraph',
    alphaClip: false,
    renderFace: 2,
    shaderName: 'Shader Graphs/S_Snow',
    vertexToken: 'description.Position = IN.ObjectSpacePosition;',
  }),
  Object.freeze({
    directory: 'S_StylizedBasic',
    graph: 'Materials/Shaders/S_StylizedBasic.shadergraph',
    alphaClip: false,
    renderFace: 2,
    shaderName: 'Shader Graphs/S_StylizedBasic',
    vertexToken: 'description.Position = IN.ObjectSpacePosition;',
  }),
]);

const PASS_FILES = Object.freeze({
  DepthOnly: 'sub-00-pass-04-DepthOnly.shader',
  ForwardLit: 'sub-00-pass-00-ForwardLit.shader',
  ShadowCaster: 'sub-00-pass-02-ShadowCaster.shader',
});

for (const modulePath of [
  'src/environment/soStylizedUnityEnvironmentMaterials.js',
  'src/environment/soStylizedUnitySceneBasicMaterials.js',
  'src/environment/soStylizedUnitySceneFoliageMaterials.js',
  'src/environment/soStylizedUnitySceneTreeMaterials.js',
  'src/environment/soStylizedUnityTreeMaterials.js',
]) {
  const source = readFileSync(resolve(TOONLAB_ROOT, modulePath), 'utf8');
  assert.match(source, /installSoStylizedUnityMaterialPassCoupling\(/,
    `${modulePath} is not wired to the shared pass coupling.`);
  assert.doesNotMatch(source, /alphaTestNode\s*=/,
    `${modulePath} reintroduced Three's non-Unity alpha equality boundary.`);
}

assert.equal(evaluateSoStylizedUnityAlphaClip(0.399999, 0.4), false);
assert.equal(evaluateSoStylizedUnityAlphaClip(0.4, 0.4), true);
assert.equal(evaluateSoStylizedUnityAlphaClip(0.400001, 0.4), true);

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function parseUnitySerializedObjects(source) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(JSON.parse(source.slice(start, index + 1)));
        start = -1;
      }
    }
  }
  assert.equal(depth, 0, 'Shader Graph JSON object stream is unbalanced.');
  return objects;
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing generated function ${signature}.`);
  const opening = source.indexOf('{', start);
  assert.notEqual(opening, -1, `Missing body for generated function ${signature}.`);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).replace(/\s+/g, ' ');
    }
  }
  throw new Error(`Unbalanced generated function ${signature}.`);
}

const generatedManifest = JSON.parse(readFileSync(
  resolve(GENERATED_ROOT, 'manifest.json'),
  'utf8',
));
const generatedByShader = new Map(generatedManifest.shaders.map((entry) => [
  entry.shaderName,
  entry,
]));

for (const target of TARGETS) {
  const graphSource = readFileSync(resolve(UNITY_ROOT, target.graph), 'utf8');
  const graphObjects = parseUnitySerializedObjects(graphSource);
  const universalTarget = graphObjects.find((entry) => (
    entry.m_Type === 'UnityEditor.Rendering.Universal.ShaderGraph.UniversalTarget'
  ));
  assert.ok(universalTarget, `${target.shaderName} UniversalTarget is missing.`);
  assert.equal(universalTarget.m_RenderFace, target.renderFace, `${target.shaderName} cull drifted.`);
  assert.equal(universalTarget.m_AlphaClip, target.alphaClip, `${target.shaderName} alpha-clip drifted.`);

  const runtimeContract = resolveSoStylizedUnityMaterialPassContract(target.shaderName);
  assert.ok(runtimeContract, `${target.shaderName} runtime pass contract is missing.`);
  assert.equal(runtimeContract.renderFace, target.renderFace);
  assert.equal(runtimeContract.alphaClip, target.alphaClip);
  assert.equal(resolveSoStylizedUnityShadowCasterPass(target.shaderName), true);

  const generatedRecord = generatedByShader.get(target.shaderName);
  assert.ok(generatedRecord, `${target.shaderName} generated shader record is missing.`);
  const passSources = {};
  for (const [passName, fileName] of Object.entries(PASS_FILES)) {
    const passRecord = generatedRecord.passes.find((entry) => (
      entry.subshader === 0 && entry.name === passName
    ));
    assert.ok(passRecord, `${target.shaderName}.${passName} generated pass is missing.`);
    assert.equal(passRecord.file, `passes/${target.directory}/${fileName}`);
    const source = readFileSync(resolve(GENERATED_ROOT, passRecord.file), 'utf8');
    assert.equal(sha256(source), passRecord.sha256, `${target.shaderName}.${passName} hash drifted.`);
    assert.ok(source.includes(target.vertexToken), `${target.shaderName}.${passName} lost vertex topology.`);
    assert.equal(
      source.includes('#define _ALPHATEST_ON 1'),
      target.alphaClip,
      `${target.shaderName}.${passName} alpha-test define drifted.`,
    );
    passSources[passName] = source;
  }

  const vertexFunctions = Object.fromEntries(Object.entries(passSources).map(
    ([name, source]) => [name, extractFunction(
      source,
      'VertexDescription VertexDescriptionFunction',
    )],
  ));
  assert.equal(vertexFunctions.ForwardLit, vertexFunctions.DepthOnly,
    `${target.shaderName} ForwardLit/DepthOnly positions diverged.`);
  assert.equal(vertexFunctions.ForwardLit, vertexFunctions.ShadowCaster,
    `${target.shaderName} ForwardLit/ShadowCaster positions diverged.`);

  const depthSurface = extractFunction(
    passSources.DepthOnly,
    'SurfaceDescription SurfaceDescriptionFunction',
  );
  const shadowSurface = extractFunction(
    passSources.ShadowCaster,
    'SurfaceDescription SurfaceDescriptionFunction',
  );
  assert.equal(depthSurface, shadowSurface,
    `${target.shaderName} DepthOnly/ShadowCaster alpha topology diverged.`);
  assert.equal(depthSurface.includes('surface.Alpha ='), target.alphaClip);
  assert.equal(depthSurface.includes('surface.AlphaClipThreshold ='), target.alphaClip);
}

// Exercise the reusable node coupling without depending on renderer output.
// Object identity is the invariant: the same mask/position node must feed the
// visible material, its depth-color replacement, and native shadow fallback.
const root = new THREE.Group();
for (const [index, target] of TARGETS.entries()) {
  const material = new MeshPhysicalNodeMaterial();
  material.name = `Verifier:${target.directory}`;
  const positionNode = target.directory === 'S_FoliageShader'
    || target.directory === 'S_Leaves'
    ? positionLocal.add(vec3(0.01, 0.02, 0.03))
    : positionLocal;
  installSoStylizedUnityMaterialPassCoupling(material, {
    ...(target.alphaClip ? {
      alphaChannel: target.directory === 'S_Leaves' ? 'texture.r' : 'texture.a',
      alphaNode: float(0.4),
      alphaThreshold: 0.4,
    } : {}),
    positionMode: positionNode === positionLocal ? 'authored' : 'deformed',
    positionNode,
    shaderName: target.shaderName,
  });
  const coupling = material.userData.soStylizedUnityPassCoupling;
  assert.equal(coupling.exact, true);
  assert.equal(coupling.alphaComparison, target.alphaClip ? '>=' : null);
  assert.equal(material.side, SO_STYLIZED_UNITY_MATERIAL_PASS_CONTRACTS[target.shaderName].side);
  assert.equal(material.shadowSide, material.side);
  assert.equal(material.positionNode, positionNode);
  if (target.alphaClip) {
    assert.equal(material.maskNode, material.maskShadowNode);
    assert.equal(material.alphaTest, 0);
    assert.equal(material.alphaTestNode, null);
  }
  const depthMaterial = material.userData.createDepthColorVariant();
  assert.equal(depthMaterial.positionNode, positionNode);
  assert.equal(depthMaterial.side, material.side);
  assert.equal(depthMaterial.shadowSide, material.side);
  assert.equal(depthMaterial.maskNode, material.maskNode);
  assert.equal(depthMaterial.maskShadowNode, material.maskShadowNode);
  assert.equal(coupling.runtime.depthVariantCreateCount, 1);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.castShadow = index % 2 === 0;
  mesh.receiveShadow = true;
  root.add(mesh);
}
const runtimeReport = createSoStylizedUnityPassCouplingReport(root);
assert.equal(runtimeReport.knownMaterialCount, TARGETS.length);
assert.equal(runtimeReport.coupledMaterialCount, TARGETS.length);
assert.equal(runtimeReport.alphaClipMaterialCount, 2);
assert.equal(runtimeReport.opaqueMaterialCount, 3);
assert.equal(runtimeReport.twoSidedMaterialCount, 2);
assert.equal(runtimeReport.wpoMaterialCount, 2);
assert.equal(runtimeReport.depthVariantFactoryCount, TARGETS.length);
assert.equal(runtimeReport.depthVariantCreateCount, TARGETS.length);
assert.equal(runtimeReport.uncoupledMaterialCount, 0);
assert.equal(runtimeReport.exact, true);

// Terrain detail source eligibility is independent from shader capability:
// every target shader has a ShadowCaster pass, but most grass/flower prefab
// renderers explicitly opt out. Ice flowers and the opaque beach details opt in.
const sceneManifest = JSON.parse(readFileSync(SCENE_MANIFEST_PATH, 'utf8'));
const terrain = sceneManifest.terrains[0];
assert.equal(terrain.detailPrototypes.length, 17);
const expectedOff = new Set([0, 1, 2, 3, 4, 5, 14, 15, 16]);
const expectedFoliage = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16]);
const detailInventory = [];
for (const detail of terrain.detailPrototypes) {
  const prefab = sceneManifest.prefabPrototypes[detail.gltfPrefab];
  const rendererNodes = prefab.nodes.filter((node) => String(node.renderer?.type ?? '').trim());
  assert.equal(rendererNodes.length, 1, `${detail.prototype.name} renderer topology changed.`);
  const renderer = rendererNodes[0].renderer;
  const eligibility = resolveSoStylizedUnityRendererCastEligibility(renderer, sceneManifest);
  assert.equal(eligibility.exact, true, `${detail.prototype.name} shader pass is unaudited.`);
  assert.equal(
    eligibility.castsShadow,
    !expectedOff.has(detail.index),
    `${detail.prototype.name} effective cast eligibility drifted.`,
  );
  const shaderNames = [...new Set(eligibility.materials.map((entry) => entry.shaderName))];
  assert.deepEqual(shaderNames, [
    expectedFoliage.has(detail.index)
      ? 'Shader Graphs/S_FoliageShader'
      : 'Shader Graphs/S_StylizedBasic',
  ]);
  detailInventory.push({
    castsShadow: eligibility.castsShadow,
    index: detail.index,
    name: detail.prototype.name,
    shaderName: shaderNames[0],
  });
}
assert.equal(detailInventory.filter((entry) => entry.shaderName.endsWith('S_FoliageShader')).length, 12);
assert.equal(detailInventory.filter((entry) => entry.shaderName.endsWith('S_FoliageShader') && entry.castsShadow).length, 3);
assert.equal(detailInventory.filter((entry) => entry.shaderName.endsWith('S_StylizedBasic')).length, 5);
assert.equal(detailInventory.filter((entry) => entry.shaderName.endsWith('S_StylizedBasic') && entry.castsShadow).length, 5);

const targetedUnsupported = TARGETS
  .map((target) => target.shaderName)
  .filter((shaderName) => !resolveSoStylizedUnityMaterialPassContract(shaderName));
assert.deepEqual(targetedUnsupported, []);
const remainingSceneCasterFamilies = [...new Set(sceneManifest.materials
  .map((record) => record.shaderName)
  .filter((shaderName) => resolveSoStylizedUnityShadowCasterPass(shaderName) === true)
  .filter((shaderName) => !resolveSoStylizedUnityMaterialPassContract(shaderName)))]
  .sort();
assert.deepEqual(remainingSceneCasterFamilies, [
  'Shader Graphs/S_Mountain',
  'Shader Graphs/S_Rock',
  'Universal Render Pipeline/Terrain/Lit',
]);

console.log('So Stylized Unity alpha/WPO/shadow pass coupling verified.');
console.log('Generated passes: 5/5 families share byte-identical VertexDescription across ForwardLit, DepthOnly, and ShadowCaster.');
console.log('Cutout: S_FoliageShader + S_Leaves share one >= alpha mask; equality survives in visible/depth/shadow evaluation.');
console.log('Cull: foliage/leaves Cull Off; bark/snow/stylized-basic Cull Back in all three passes.');
console.log('Terrain details: 12 S_Foliage prototypes (3 cast On, 9 Off); 5 S_StylizedBasic prototypes (5 cast On).');
console.log(`Runtime counters: ${JSON.stringify(runtimeReport)}`);
console.log('Targeted unsupported pass-coupling families: none.');
console.log(`Remaining scene caster families outside this coupling scope: ${remainingSceneCasterFamilies.join(', ')}.`);
