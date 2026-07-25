#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  createSoStylizedSourceEnvironmentState,
  createSoStylizedSourceMaterial,
} from '../src/environment/soStylizedSourceMaterials.js';
import { SoStylizedSourceLibrary } from '../src/environment/soStylizedSourceLibrary.js';
import {
  SO_STYLIZED_UNITY_PINE_BARK,
  SO_STYLIZED_UNITY_PINE_LEAVES,
} from '../src/environment/soStylizedUnityTreeMaterials.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const UNITY_TREE_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity', 'Environment', 'Trees');
const UNITY_SHADER_ROOT = resolve(WORKSPACE_ROOT, 'SoStylized-Unity', 'Materials', 'Shaders');

const sourceFiles = Object.freeze({
  barkGraph: Object.freeze({
    file: resolve(UNITY_TREE_ROOT, 'Shaders', 'S_Bark.shadergraph'),
    sha256: '0ab87ac5464f9b3d4e4090b2299cc4df55c0155ff79458e62b91a84829ff2689',
  }),
  barkMaterial: Object.freeze({
    file: resolve(UNITY_TREE_ROOT, 'Materials', 'M_PineBark.mat'),
    sha256: 'c41c1ef3daa5b95862d8a30e21c76d20489793a4764da79caa2614a23f57858f',
  }),
  cameraDitherGraph: Object.freeze({
    file: resolve(UNITY_SHADER_ROOT, 'SG_CameraDithering.shadersubgraph'),
    sha256: '95586ca209f762a059f221bbccab74df9685c4cddc997121596d4578bf1f45dd',
  }),
  leavesGraph: Object.freeze({
    file: resolve(UNITY_TREE_ROOT, 'Shaders', 'S_Leaves.shadergraph'),
    sha256: '94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62',
  }),
  leavesMaterial: Object.freeze({
    file: resolve(UNITY_TREE_ROOT, 'Materials', 'M_PineLeaves.mat'),
    sha256: '16919f740fa0e284e6b2a542a922e709145381734c2703801ad74e05f8dd3aae',
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

for (const [name, record] of Object.entries(sourceFiles)) {
  assert.equal(
    sha256(readFileSync(record.file)),
    record.sha256,
    `${name} changed; re-audit the connected Unity graph before updating this hash`,
  );
}

const leavesGraph = readFileSync(sourceFiles.leavesGraph.file, 'utf8');
const leavesMaterial = readFileSync(sourceFiles.leavesMaterial.file, 'utf8');
const barkMaterial = readFileSync(sourceFiles.barkMaterial.file, 'utf8');
assert.match(leavesGraph, /"m_HueMode": 1/);
assert.match(leavesGraph, /"m_HashType": 0/);
assert.match(leavesGraph, /"m_RenderFace": 0/);
assert.match(leavesGraph, /"m_AlphaClip": true/);
assert.match(leavesMaterial, /- _Alpha_Clip: 0\.4/);
assert.match(leavesMaterial, /- _Max_Distance_Fade: 3/);
assert.match(leavesMaterial, /- _Min_Distance_Fade: 2/);
assert.match(leavesMaterial, /- _ObjectDistanceForFade: 0/);
assert.match(leavesMaterial, /- _Smoothness: 0/);
assert.match(leavesMaterial, /- _UseGradient: 1/);
assert.match(leavesMaterial, /- _UseWorldGradient: 0/);
assert.match(leavesMaterial, /- _Main_Color: \{r: 0\.40523082, g: 0\.7264151, b: 0\.065103225/);
assert.match(leavesMaterial, /- _Gradient_Color: \{r: 0\.039248843, g: 0\.3962264, b: 0\.08440987/);
assert.match(barkMaterial, /- _Emissive_Strength: 0\.1/);
assert.match(barkMaterial, /- _Normal_Strength: 1/);
assert.match(barkMaterial, /- _Smoothness_Multiplier: 0\.05/);
assert.match(barkMaterial, /- _Tint_Mix: 0/);

class VerificationTextureLoader {
  async loadAsync(url) {
    const result = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    result.name = String(url);
    return result;
  }
}

function collectGraphObjects(roots) {
  const pending = [...roots].filter(Boolean);
  const visited = new WeakSet();
  const result = [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    result.push(value);
    for (const key of Object.keys(value)) {
      let child;
      try { child = value[key]; } catch { continue; }
      if (Array.isArray(child)) pending.push(...child);
      else if (child && typeof child === 'object') pending.push(child);
    }
  }
  return result;
}

function materialGraph(material) {
  return collectGraphObjects([
    material.alphaTestNode,
    material.colorNode,
    material.emissiveNode,
    material.maskShadowNode,
    material.normalNode,
    material.opacityNode,
    material.positionNode,
    material.roughnessNode,
    material.specularColorNode,
    material.specularIntensityNode,
  ]);
}

function hasAttribute(graph, name) {
  return graph.some((node) => node?._attributeName === name);
}

function graphTextures(graph) {
  return [...new Set(graph.flatMap((node) => node?.isTexture ? [node] : []))];
}

const manifest = JSON.parse(readFileSync(resolve(
  PACKAGE_ROOT,
  'assets-local',
  'sostylized',
  'material-source',
  'manifest.json',
), 'utf8'));
const library = new SoStylizedSourceLibrary(manifest, {
  baseUrl: '/tree-verification',
  textureLoader: new VerificationTextureLoader(),
});
const state = createSoStylizedSourceEnvironmentState(library);
const common = {
  hasUv2: true,
  hasVertexColors: true,
  library,
  // Keep this verifier on the portable Unity adapter. P16 intentionally uses
  // Demonstration_SnowPines to select the retained UE M_Bark/M_Leaves path.
  sourceAssetName: 'Unity Mega Source Camera 01',
  state,
};

const leaves = await createSoStylizedSourceMaterial('MI_PineLeaves', common);
const leafGraph = materialGraph(leaves);
const leafTextures = graphTextures(leafGraph);
assert.equal(leaves.type, 'MeshPhysicalNodeMaterial');
assert.notEqual(leaves.type, 'MeshSSSNodeMaterial');
assert.equal(leaves.side, THREE.DoubleSide);
assert.equal(leaves.alphaToCoverage, false);
assert.ok(leaves.maskShadowNode);
assert.ok(leaves.normalNode, 'M_PineLeaves must preserve UseTwoSidedSign=0');
assert.equal(leaves.thicknessColorNode, undefined);
assert.equal(leaves.userData.soStylizedSource.reconstruction, 'unity-s-leaves');
assert.equal(leaves.userData.soStylizedSource.unityExactProfile, true);
assert.equal(
  leaves.userData.soStylizedSource.contract.alpha,
  'T_Leaf_Pine.r * SG_CameraDithering',
);
assert.equal(leaves.userData.soStylizedSource.contract.alphaClip, 0.4);
assert.match(
  leaves.userData.soStylizedSource.contract.cameraDither,
  /Dither\(saturate\(remap\(distance\(CameraWS,PositionWS\),2,3\)\)\*2\)/,
);
assert.equal(leaves.userData.soStylizedSource.contract.gradientUv, 2);
assert.equal(leaves.userData.soStylizedSource.contract.smoothness, 0);
assert.equal(leaves.userData.soStylizedSource.contract.sourceEngine, 'Unity 6000.5 / URP 17.5');
assert.equal(leaves.userData.soStylizedSource.contract.sourceGraph, SO_STYLIZED_UNITY_PINE_LEAVES.sourceGraph);
assert.match(leaves.userData.soStylizedSource.contract.hue, /HueMode\.Normalized HSV/);
assert.match(leaves.userData.soStylizedSource.contract.wind, /deterministic Simple Noise/);
assert.match(leaves.userData.soStylizedSource.contract.twoSidedNormal, /UseTwoSidedSign=0/);
assert.ok(hasAttribute(leafGraph, 'uv2'), 'M_PineLeaves must consume TEXCOORD_2');
const leafTexture = leafTextures.find((map) => map.name === 'SoStylizedUnity:T_Leaf_Pine');
assert.ok(leafTexture, 'M_PineLeaves must bind the exact T_Leaf_Pine texture');
assert.equal(leafTexture.generateMipmaps, false);
assert.equal(leafTexture.minFilter, THREE.LinearFilter);
assert.equal(leafTexture.magFilter, THREE.LinearFilter);
assert.equal(leafTexture.anisotropy, 1);

const bark = await createSoStylizedSourceMaterial('MI_PineBark', common);
const barkGraph = materialGraph(bark);
const barkTextures = graphTextures(barkGraph);
assert.equal(bark.type, 'MeshPhysicalNodeMaterial');
assert.equal(bark.side, THREE.FrontSide);
assert.ok(bark.normalNode, 'M_PineBark must retain its connected tangent normal');
assert.ok(hasAttribute(barkGraph, 'position'), 'M_PineBark must keep authored geometry stationary');
assert.equal(bark.userData.soStylizedSource.reconstruction, 'unity-s-bark');
assert.equal(bark.userData.soStylizedSource.unityExactProfile, true);
assert.equal(bark.userData.soStylizedSource.contract.sourceEngine, 'Unity 6000.5 / URP 17.5');
assert.equal(bark.userData.soStylizedSource.contract.sourceGraph, SO_STYLIZED_UNITY_PINE_BARK.sourceGraph);
assert.equal(bark.userData.soStylizedSource.contract.smoothness, 'sRGB(T_PineBark_R.r)*0.05');
assert.equal(bark.userData.soStylizedSource.contract.tint, 'TintMix=0');
assert.equal(bark.userData.soStylizedSource.contract.wind, 'none (S_Bark has no connected Vertex Position block)');
for (const name of ['T_PineBark_BC', 'T_PineBark_N', 'T_PineBark_R']) {
  const map = barkTextures.find((textureValue) => textureValue.name === `SoStylizedUnity:${name}`);
  assert.ok(map, `M_PineBark must bind ${name}`);
  assert.equal(map.generateMipmaps, true);
  assert.equal(map.minFilter, THREE.LinearMipmapNearestFilter);
  assert.equal(map.magFilter, THREE.LinearFilter);
  assert.equal(map.anisotropy, 1);
}

const uvFallback = await createSoStylizedSourceMaterial('MI_PineLeaves', {
  ...common,
  hasUv2: false,
  sourceAssetName: 'tree-verification-no-uv2',
});
assert.equal(uvFallback.userData.soStylizedSource.contract.gradientUv, 0);
assert.equal(hasAttribute(materialGraph(uvFallback), 'uv2'), false);

console.log('So Stylized Unity pine tree parity verification passed');
