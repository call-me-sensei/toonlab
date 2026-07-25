#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  createSoStylizedSourceEnvironmentState,
  createSoStylizedSourceMaterial,
} from '../src/environment/soStylizedSourceMaterials.js';
import { SoStylizedSourceLibrary } from '../src/environment/soStylizedSourceLibrary.js';
import { UeSourceSubsurfaceLightingModel } from '../src/environment/ueSourceSubsurfaceLighting.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'material-source',
  'manifest.json',
);
const SOURCE_MATERIAL_PATH = resolve(
  ROOT_DIR,
  'src',
  'environment',
  'soStylizedSourceMaterials.js',
);

class VerificationTextureLoader {
  async loadAsync(url) {
    const result = new THREE.Texture();
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
    material.specularIntensityNode,
    material.thicknessAttenuationNode,
    material.thicknessColorNode,
  ]);
}

function hasAttribute(graph, name) {
  return graph.some((node) => node?._attributeName === name);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const sourceMaterialSource = readFileSync(SOURCE_MATERIAL_PATH, 'utf8');
assert.doesNotMatch(
  sourceMaterialSource,
  /\b(?:modelWorldMatrix|instanceIndex)\b/,
  'cached source material graphs must not retain unbound Object3D or instance-index nodes',
);
const library = new SoStylizedSourceLibrary(manifest, {
  baseUrl: '/verification',
  textureLoader: new VerificationTextureLoader(),
});
const state = createSoStylizedSourceEnvironmentState(library);
const common = {
  hasUv2: true,
  hasVertexColors: true,
  library,
  // This verifier covers the literal UE source-material reconstruction. The
  // default portable route intentionally selects matching Unity graphs for
  // several families, so pin the authored SnowPines source stage explicitly.
  sourceAssetName: 'Demonstration_SnowPines',
  state,
};

const leaves = await createSoStylizedSourceMaterial('MI_PineLeaves_Snow', common);
assert.equal(leaves.type, 'MeshSSSNodeMaterial', 'M_Leaves must use the SSS material family');
assert.equal(leaves.side, THREE.DoubleSide, 'M_Leaves must be two-sided');
assert.equal(leaves.alphaToCoverage, false, 'M_Leaves must use masked clip, not alpha-to-coverage');
assert.ok(leaves.maskShadowNode, 'M_Leaves must provide its source alpha to the shadow pass');
assert.equal(leaves.userData.soStylizedSource.contract.gradientUv, 2);
assert.equal(leaves.userData.soStylizedSource.contract.vertexColor, 'r:wpo-weight');
assert.ok(hasAttribute(materialGraph(leaves), 'uv2'), 'M_Leaves graph must consume TEXCOORD_2');
assert.ok(
  leaves.setupLightingModel() instanceof UeSourceSubsurfaceLightingModel,
  'cached-template clones must retain the UE MSM_SUBSURFACE lighting adapter',
);
assert.equal(leaves.userData.soStylizedSourceLightingClone.rehydrated, true);

const grass = await createSoStylizedSourceMaterial('MI_Grass_NoRVT', common);
assert.equal(grass.type, 'MeshSSSNodeMaterial', 'M_Foliage must use the SSS material family');
assert.equal(grass.alphaToCoverage, false, 'M_Foliage must use masked clip, not alpha-to-coverage');
assert.ok(grass.maskShadowNode, 'untextured grass must retain the authored shadow-mask path');
assert.equal(grass.userData.soStylizedSource.contract.colormap, 'worldXY*ColormapMultiply');
assert.equal(grass.userData.soStylizedSource.contract.vertexColor, 'rgb:wpo-mask');
assert.ok(hasAttribute(materialGraph(grass), 'uv2'), 'M_Foliage graph must consume TEXCOORD_2');
assert.ok(
  grass.setupLightingModel() instanceof UeSourceSubsurfaceLightingModel,
  'M_Foliage clones must retain the UE MSM_SUBSURFACE lighting adapter',
);

const flower = await createSoStylizedSourceMaterial('MI_FlowersIce', common);
assert.ok(flower.emissiveNode, 'ice flowers must retain their source emissive input');
assert.notEqual(
  flower.emissiveNode?.value?.x ?? null,
  0,
  'UseDayCycleEmission? false must not replace source emission with a zero vec3',
);

const bark = await createSoStylizedSourceMaterial('MI_PineBark_Snow', common);
assert.equal(bark.isMeshPhysicalNodeMaterial, true, 'M_Bark must use the Default Lit adapter');
assert.notEqual(bark.type, 'MeshSSSNodeMaterial', 'M_Bark must not use the foliage SSS family');
assert.equal(bark.side, THREE.FrontSide, 'M_Bark must remain one-sided');
assert.equal(bark.userData.soStylizedSource.contract.snowProjection, 'worldXY-planar');
assert.equal(bark.userData.soStylizedSource.contract.tint, 'lerp(diffuse,TintColor,TintMix)');

const treeLod = await createSoStylizedSourceMaterial('MI_PineTree_Snow_SingleMat', common);
assert.equal(treeLod.type, 'MeshSSSNodeMaterial', 'M_TreeSingleMat must use the SSS family');
assert.equal(treeLod.side, THREE.DoubleSide, 'M_TreeSingleMat must be two-sided');
assert.ok(treeLod.opacityNode, 'M_TreeSingleMat must use Filled Leaf Texture opacity');
assert.ok(treeLod.maskShadowNode, 'M_TreeSingleMat must carry the filled-leaf mask into shadows');
assert.equal(treeLod.userData.soStylizedSource.contract.leafSelector, 'color.r');
assert.equal(
  treeLod.userData.soStylizedSource.contract.alpha,
  'lerp(1,FilledLeafTexture.r,VertexColor.r)',
);
assert.ok(hasAttribute(materialGraph(treeLod), 'uv2'), 'M_TreeSingleMat must consume TEXCOORD_2');
assert.ok(
  treeLod.setupLightingModel() instanceof UeSourceSubsurfaceLightingModel,
  'M_TreeSingleMat clones must retain the UE MSM_SUBSURFACE lighting adapter',
);

const uvFallback = await createSoStylizedSourceMaterial('MI_PineLeaves_Snow', {
  ...common,
  hasUv2: false,
  sourceAssetName: 'Demonstration_SnowPines',
});
assert.equal(uvFallback.userData.soStylizedSource.contract.gradientUv, 0);
assert.equal(hasAttribute(materialGraph(uvFallback), 'uv2'), false,
  'meshes without TEXCOORD_2 must take the explicit UV0 compatibility fallback');

console.log('So Stylized foliage/tree source material verification passed');
