#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  applySoStylizedUnityMegaMaterials,
} from '../src/environment/soStylizedUnityMegaScene.js';
import {
  applySoStylizedUnityRendererCastEligibility,
} from '../src/environment/soStylizedUnityShadows.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(
  ROOT,
  'assets-local/sostylized-unity/mega-scene/scene-manifest.json',
);
const ORACLE_PATH = resolve(
  ROOT,
  'docs/source-shader-audits/unity-terrain-detail-material-binding-oracle.json',
);
const INVENTORY_PATH = resolve(
  ROOT,
  'docs/source-shader-audits/unity-terrain-detail-material-inventory.json',
);
const CULLING_AUDIT_PATH = resolve(
  ROOT,
  'docs/source-shader-audits/unity-terrain-detail-native-culling-audit.json',
);
const ORACLE_SCRIPT_PATH = resolve(
  ROOT,
  'scripts/unity/UnityTerrainDetailShaderBindingOracle.cs',
);
const ORACLE_PROBE_SHADER_PATH = resolve(
  ROOT,
  'scripts/unity/ToonLabTerrainDetailBindingProbe.shader',
);
const LEDGER_PATH = resolve(ROOT, 'docs/unity-shader-port-ledger.json');
const TERRAIN_RUNTIME_PATH = resolve(
  ROOT,
  'src/environment/soStylizedUnityMegaTerrain.js',
);
const DISPATCH_RUNTIME_PATH = resolve(
  ROOT,
  'src/environment/soStylizedUnityMegaScene.js',
);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const assertHash = (file, expected) => {
  assert.equal(sha256(readFileSync(file)), expected, `${file} SHA-256 drifted`);
};

assertHash(
  ORACLE_PATH,
  '1884a29d8b22f1ecbd14a64365c6849e1a0588e6e4702d0c8b19269aaf0c0bdf',
);
assertHash(
  INVENTORY_PATH,
  'cafe2ec5deecd88ba132d2761b101e8bc941d51f05167b9058e12ba366650cbd',
);
assertHash(
  CULLING_AUDIT_PATH,
  'b0a0970b32c86068db1d8ef69a28859d8c8f48cbd3407d3130eae640f2d6bc70',
);
assertHash(
  ORACLE_SCRIPT_PATH,
  'b9583c978e0528c3b87b0633c17e0a4311971d815b34d10a692c3c64a81f5b29',
);
assertHash(
  ORACLE_PROBE_SHADER_PATH,
  '6339069b8a933bc57718d5b52f6220df572bb3128e663b6b1b4617184457f475',
);

const oracle = readJson(ORACLE_PATH);
assert.equal(oracle.scene, 'Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity');
assert.equal(oracle.unityVersion, '6000.5.4f1');
assert.equal(
  oracle.originalTerrainDetailShader,
  'Hidden/TerrainEngine/Details/UniversalPipeline/Vertexlit',
);
assert.equal(oracle.replacementShaderSupported, true);
assert.equal(oracle.replacementShaderPassCount, 1);
assert.equal(oracle.resourceMutationAccepted, true);
assert.equal(oracle.detailDrawVisibleInControl, true);
assert.equal(oracle.replacementDetailDrawVisible, true);
assert.ok(oracle.detailsDisabledChangedPixelCount > 100_000);
assert.ok(oracle.replacementVsDetailsDisabledChangedPixelCount > 100_000);
assert.equal(oracle.magentaBaselinePixels, 0);
assert.equal(oracle.magentaReplacementPixels, 0);
assert.equal(oracle.hiddenTerrainDetailShaderDispatched, false);
assert.equal(oracle.prefabMaterialShaderDispatched, true);

const findUrpTerrainRoot = () => {
  const builtIn = resolve(
    '/Applications/Unity/Hub/Editor/6000.5.4f1/Unity.app/Contents/Resources/PackageManager',
    'BuiltInPackages/com.unity.render-pipelines.universal/Shaders/Terrain',
  );
  if (existsSync(resolve(builtIn, 'TerrainDetailLit.shader'))) return builtIn;
  const cache = '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Library/PackageCache';
  if (!existsSync(cache)) return null;
  const packageName = readdirSync(cache).find((name) => (
    name.startsWith('com.unity.render-pipelines.universal@')
  ));
  if (!packageName) return null;
  return resolve(cache, packageName, 'Shaders/Terrain');
};
const urpTerrainRoot = findUrpTerrainRoot();
assert.ok(urpTerrainRoot, 'Installed URP Terrain source is unavailable.');
const hiddenSourcePins = Object.freeze({
  'TerrainDetailLit.shader': '98ebda6601233e87ca9406d95e858c288131b6df80e2bd3ed6681ab09be31eb4',
  'TerrainDetailLitInput.hlsl': '1f7cd3ff2d7cbfee1fb2898714f85bbe0748fddced34c27bc4d89a829f5f46d7',
  'TerrainDetailLitPasses.hlsl': 'a8a2aa9d9fb1e3104dcce8bdbb65553a2d178df237a3e1fcf45665b2e757aa68',
});
for (const [name, hash] of Object.entries(hiddenSourcePins)) {
  assertHash(resolve(urpTerrainRoot, name), hash);
}
const hiddenShaderSource = readFileSync(
  resolve(urpTerrainRoot, 'TerrainDetailLit.shader'),
  'utf8',
);
assert.match(hiddenShaderSource, /_MainTex \("Main Texture", 2D\) = "white"/);
assert.match(hiddenShaderSource, /Name "TerrainDetailVertex"/);

const manifest = readJson(MANIFEST_PATH);
const terrain = manifest.terrains[0];
const inventory = readJson(INVENTORY_PATH);
const cullingAudit = readJson(CULLING_AUDIT_PATH);
assert.equal(inventory.scene, oracle.scene);
assert.equal(inventory.unityVersion, oracle.unityVersion);
assert.equal(inventory.prototypes.length, 17);
assert.equal(terrain.detailPrototypes.length, 17);
assert.equal(terrain.detailObjectDensity, 1);
assert.equal(terrain.detailObjectDistance, 150);
assert.equal(terrain.detailResolution, 1024);
assert.equal(terrain.detailResolutionPerPatch, 64);
assert.equal(cullingAudit.unityVersion, oracle.unityVersion);
assert.equal(cullingAudit.sourceScene, oracle.scene);
assert.equal(cullingAudit.sourceTerrain.detailObjectDensity, terrain.detailObjectDensity);
assert.equal(cullingAudit.sourceTerrain.detailObjectDistance, terrain.detailObjectDistance);
assert.equal(cullingAudit.sourceTerrain.detailResolution, terrain.detailResolution);
assert.equal(
  cullingAudit.sourceTerrain.detailResolutionPerPatch,
  terrain.detailResolutionPerPatch,
);
assert.match(cullingAudit.caller.detailRendererCall, /DetailRenderer::Render/);
assert.match(cullingAudit.detailRenderer.distanceSquare, /fmul s8, s8, s8/);
assert.match(
  cullingAudit.detailRenderer.instancedPrefabPath.distanceCall,
  /CalculateSqrDistance/,
);
assert.match(
  cullingAudit.detailRenderer.instancedPrefabPath.frustumCall,
  /IntersectAABBFrustumFull/,
);
assert.equal(cullingAudit.runtimeRequirement.distance, '3D nearest-point squared distance to AABB <= 150^2');
assert.equal(cullingAudit.runtimeRequirement.frustum, 'full AABB/frustum intersection after the distance test');
assert.match(
  cullingAudit.toonLabCamera0PredicateFixture.provenance,
  /not a Unity Frame Debugger draw-event count/,
);

const disassembleUnity = (startAddress, stopAddress) => execFileSync(
  'xcrun',
  [
    'llvm-objdump',
    '--arch=arm64',
    '--disassemble',
    `--start-address=${startAddress}`,
    `--stop-address=${stopAddress}`,
    '--symbolize-operands',
    '--demangle',
    cullingAudit.unityExecutable,
  ],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
const callerDisassembly = disassembleUnity('0x1017d5a84', '0x1017d5b04');
assert.match(callerDisassembly, /1017d5ad4:.*Terrain::GetDetailObjectDistance\(\) const/);
assert.match(callerDisassembly, /1017d5ae0:.*Terrain::GetDetailObjectDensity\(\) const/);
assert.match(callerDisassembly, /1017d5af4:.*fmov\s+s0, s8/);
assert.match(callerDisassembly, /1017d5afc:.*DetailRenderer::Render\(ScriptableCullingParameters const&, float, int, float, bool\)/);
const detailRendererDisassembly = disassembleUnity('0x1017e8fb8', '0x1017e9a68');
const nativeInstructionOrder = [
  '1017e8fc8:',
  '1017e9a08:',
  '1017e9a0c:',
  '1017e9a58:',
].map((instruction) => detailRendererDisassembly.indexOf(instruction));
assert.ok(nativeInstructionOrder.every((offset) => offset >= 0));
assert.deepEqual(
  [...nativeInstructionOrder].sort((left, right) => left - right),
  nativeInstructionOrder,
  'Unity native detail culling instruction order drifted.',
);
assert.match(detailRendererDisassembly, /1017e8fc8:.*fmul\s+s8, s8, s8/);
assert.match(detailRendererDisassembly, /1017e9a08:.*CalculateSqrDistance\(Vector3f const&, AABB const&\)/);
assert.match(detailRendererDisassembly, /1017e9a0c:.*fcmp\s+s0, s8/);
assert.match(detailRendererDisassembly, /1017e9a58:.*IntersectAABBFrustumFull\(AABB const&, Plane const\*\)/);

const FOLIAGE = 'Shader Graphs/S_FoliageShader';
const BASIC = 'Shader Graphs/S_StylizedBasic';
const expected = Object.freeze([
  ['P_Grass1_Paintable', 'MV_Grass', 68, FOLIAGE, 'Off'],
  ['P_Daisies', 'MV_Daisy', 117, FOLIAGE, 'Off'],
  ['P_DaffodilsOrange', 'MV_Daffodils', 118, FOLIAGE, 'Off'],
  ['P_DaffodilsPink', 'MV_Daffodils', 118, FOLIAGE, 'Off'],
  ['P_DaffodilsYellow', 'MV_Daffodils', 118, FOLIAGE, 'Off'],
  ['P_GrasSnow_Paintable', 'MV_GrassSnow', 119, FOLIAGE, 'Off'],
  ['P_FlowersIce01', 'MV_FlowersIce', 120, FOLIAGE, 'On'],
  ['P_FlowersIce02', 'MV_FlowersIce', 120, FOLIAGE, 'On'],
  ['P_FlowersIce03', 'MV_FlowersIce', 120, FOLIAGE, 'On'],
  ['P_Beach_BandedTulip', 'MV_BeachShells', 121, BASIC, 'On'],
  ['P_Beach_Conch', 'MV_BeachShells', 121, BASIC, 'On'],
  ['P_Beach_SandDollar', 'MV_BeachShells', 121, BASIC, 'On'],
  ['P_Beach_Scallop', 'MV_BeachShells', 121, BASIC, 'On'],
  ['P_Beach_Starfish', 'MV_BeachShells', 121, BASIC, 'On'],
  ['P_Weed01', 'MV_Weed', 122, FOLIAGE, 'Off'],
  ['P_Weed02', 'MV_Weed', 122, FOLIAGE, 'Off'],
  ['P_Weed03', 'MV_Weed', 122, FOLIAGE, 'Off'],
]);

const rendererRecords = [];
for (let index = 0; index < expected.length; index += 1) {
  const [name, materialName, materialIndex, shaderName, shadowCastingMode] = expected[index];
  const source = inventory.prototypes[index];
  const detail = terrain.detailPrototypes[index];
  assert.equal(source.index, index);
  assert.equal(source.prototypeName, name);
  assert.equal(source.renderMode, 'VertexLit');
  assert.equal(source.usePrototypeMesh, true);
  assert.equal(source.useInstancing, true);
  assert.equal(source.rendererType, 'UnityEngine.MeshRenderer');
  assert.equal(source.materials.length, 1);
  assert.equal(source.materials[0].materialName, materialName);
  assert.equal(source.materials[0].shaderName, shaderName);
  // A literal TerrainDetailLit route would sample its default white texture:
  // none of the 17 actual prefab materials exposes Unity's _MainTex contract.
  assert.equal(source.materials[0].hasMainTex, false);
  assert.equal(source.materials[0].mainTexPropertyIndex, -1);
  assert.equal(source.materials[0].mainTextureName, '');
  assert.deepEqual(source.materials[0].flaggedMainTextures, []);

  assert.equal(detail.index, index);
  assert.equal(detail.prototype.name, name);
  assert.equal(detail.prototypeTexture, -1);
  assert.equal(detail.renderMode, 'VertexLit');
  assert.equal(detail.usePrototypeMesh, true);
  assert.equal(detail.useInstancing, true);
  assert.equal(detail.useDensityScaling, true);
  const prefab = manifest.prefabPrototypes[detail.gltfPrefab];
  const rendererNodes = prefab.nodes.filter((node) => String(node.renderer?.type ?? '').trim());
  assert.equal(rendererNodes.length, 1);
  const renderer = rendererNodes[0].renderer;
  assert.deepEqual(renderer.materialIndices, [materialIndex]);
  assert.equal(manifest.materials[materialIndex].name, materialName);
  assert.equal(manifest.materials[materialIndex].shaderName, shaderName);
  assert.equal(renderer.shadowCastingMode, shadowCastingMode);
  assert.equal(renderer.receiveShadows, true);
  rendererRecords.push(renderer);
}
assert.equal(expected.filter((entry) => entry[3] === FOLIAGE).length, 12);
assert.equal(expected.filter((entry) => entry[3] === BASIC).length, 5);
assert.equal(expected.filter((entry) => entry[4] === 'On').length, 8);

// Exercise the production carrier dispatcher as 17 InstancedMeshes. This
// proves material binding, per-instance Object Position, mesh channels,
// lighting model, normals, WPO/alpha pass coupling, and cast/receive state in
// the same runtime classes used by the shipped Mega scene.
class VerificationTextureLoader {
  async loadAsync(url) {
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    texture.name = String(url);
    return texture;
  }
}
const root = new THREE.Group();
const runtimeMeshes = [];
for (let index = 0; index < expected.length; index += 1) {
  const [, , materialIndex, shaderName] = expected[index];
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array([
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
  ]), 4));
  if (shaderName === FOLIAGE) {
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
    ]), 4));
  }
  geometry.setAttribute(
    'iUnityObjectPosition',
    new THREE.InstancedBufferAttribute(new Float32Array([index, 0, -index]), 3),
  );
  const carrier = new THREE.MeshBasicMaterial();
  carrier.userData.unityMaterial = materialIndex;
  const mesh = new THREE.InstancedMesh(geometry, carrier, 1);
  mesh.name = `TerrainDetailVerifier:${index}`;
  applySoStylizedUnityRendererCastEligibility(mesh, rendererRecords[index], manifest);
  root.add(mesh);
  runtimeMeshes.push(mesh);
}
const dispatch = await applySoStylizedUnityMegaMaterials(root, manifest, {
  baseUrl: '/unity-terrain-detail-routing-verification',
  textureLoader: new VerificationTextureLoader(),
});
assert.equal(dispatch.sourceMaterialCount, 7);
assert.deepEqual(dispatch.unresolved, []);
assert.equal(runtimeMeshes.filter((mesh) => mesh.castShadow).length, 8);
assert.equal(runtimeMeshes.filter((mesh) => mesh.receiveShadow).length, 17);

for (let index = 0; index < runtimeMeshes.length; index += 1) {
  const mesh = runtimeMeshes[index];
  const material = mesh.material;
  const shaderName = expected[index][3];
  assert.equal(material.userData.soStylizedUnityMaterial.sourceShader, shaderName);
  assert.equal(material.userData.soStylizedUnityMaterial.exactInputs, true);
  assert.equal(material.userData.soStylizedUnityMaterial.graphExact, true);
  assert.notEqual(material.userData.soStylizedUnityMaterial.reconstruction, 'partial-family-fallback');
  assert.equal(material.userData.soStylizedUnityPassCoupling.exact, true);
  assert.equal(typeof material.userData.createDepthColorVariant, 'function');
  assert.equal(material.userData.soStylizedUnityNormalIntegration.coordinateZSign, -1);
  assert.ok(material.normalNode?.isNode);
  assert.equal(mesh.geometry.getAttribute('iUnityObjectPosition')?.isInstancedBufferAttribute, true);
  if (shaderName === FOLIAGE) {
    assert.equal(material.userData.soStylizedUnityUrpLighting.workflow, 'specular');
    assert.equal(material.userData.soStylizedUnityMaterial.switches.hasVertexColors, true);
    assert.equal(material.userData.soStylizedUnityPassCoupling.positionMode, 'deformed');
    assert.equal(material.userData.soStylizedUnityPassCoupling.alphaClip, true);
    assert.equal(material.maskNode, material.maskShadowNode);
    assert.equal(material.side, THREE.DoubleSide);
  } else {
    assert.equal(material.userData.soStylizedUnityUrpLighting.workflow, 'metallic');
    assert.equal(material.userData.soStylizedUnitySceneBasic.geometryCapabilities.hasTangents, true);
    assert.equal(material.userData.soStylizedUnityPassCoupling.positionMode, 'authored');
    assert.equal(material.userData.soStylizedUnityPassCoupling.alphaClip, false);
    assert.equal(material.side, THREE.FrontSide);
  }
}

const terrainRuntime = readFileSync(TERRAIN_RUNTIME_PATH, 'utf8');
assert.match(terrainRuntime, /ComputeDetailInstanceTransforms/);
assert.match(terrainRuntime, /record\.density !== terrain\.detailObjectDensity/);
assert.match(terrainRuntime, /patch\.boundsCenter/);
assert.match(terrainRuntime, /resolvedDetailDistance \* resolvedDetailDistance/);
assert.match(terrainRuntime, /detailFrustum\.setFromProjectionMatrix/);
assert.match(terrainRuntime, /detailFrustum\.intersectsBox\(patchBounds\)/);
assert.ok(
  terrainRuntime.indexOf('dx * dx + dy * dy + dz * dz > maxDistanceSquared')
    < terrainRuntime.indexOf('detailFrustum.intersectsBox(patchBounds)'),
  'Unity native patch distance test must precede the full patch-frustum test.',
);
assert.match(terrainRuntime, /sourcePrototypeMeshMaterials: true/);
assert.doesNotMatch(terrainRuntime, /\.healthyColor|\.dryColor/);
const dispatchRuntime = readFileSync(DISPATCH_RUNTIME_PATH, 'utf8');
assert.match(dispatchRuntime, /attribute\('iUnityObjectPosition', 'vec3'\)/);
assert.doesNotMatch(dispatchRuntime, /TerrainDetailLit|terrainDetailLit/);

const ledger = readJson(LEDGER_PATH);
assert.equal(ledger.shaderFamilies.length, 14);
assert.equal(
  ledger.shaderFamilies.some((entry) => /TerrainDetail/i.test(entry.family ?? '')),
  false,
  'The proven prefab-material route must not be counted as a false 15th family.',
);
for (const shaderName of [FOLIAGE, BASIC]) {
  assert.equal(
    ledger.shaderFamilies.find((entry) => entry.shader === shaderName)?.runtimePort,
    'complete',
  );
}

for (const mesh of runtimeMeshes) {
  mesh.geometry.dispose();
  mesh.material.dispose();
}

console.log('Unity Terrain detail material routing verified.');
console.log('Native Metal oracle: detail draws remain visible, TerrainDetailLit probe never dispatches.');
console.log('Runtime: 17 instanced prefab meshes -> 12 S_FoliageShader + 5 S_StylizedBasic; 8 cast / 17 receive.');
console.log('Passes: foliage WPO+dither shared by Forward/Depth/Shadow; shells remain opaque authored-position metallic URP Lit.');
console.log('Population: source density 1, 150 m native patch-AABB distance then full-frustum authority retained.');
