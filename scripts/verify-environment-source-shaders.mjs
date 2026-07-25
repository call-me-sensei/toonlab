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
import {
  SO_STYLIZED_LANDSCAPE_LAYERS,
  SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT,
  SoStylizedSourceLibrary,
  classifySoStylizedMaterialProfile,
  inspectSoStylizedLandscapeWeightmapSet,
} from '../src/environment/soStylizedSourceLibrary.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'material-source',
  'manifest.json',
);
const WEIGHT_BASE_URL = '/assets-local/sostylized/landscape-weight-layers/SnowPines';
const WEIGHT_MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'landscape-weight-layers',
  'SnowPines',
  'manifest.json',
);
const P15_CONTRACT_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'grass',
  'p15-ue-grass-contract.json',
);
const SOURCE_ENVIRONMENT_CONTENT_PATH = resolve(
  ROOT_DIR,
  'src',
  'environment',
  'sourceEnvironmentTestContent.js',
);

class FixtureTextureLoader {
  async loadAsync() {
    const texture = new THREE.DataTexture(
      new Uint8Array([192, 208, 224, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    texture.needsUpdate = true;
    return texture;
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
    material.metalnessNode,
    material.normalNode,
    material.opacityNode,
    material.roughnessNode,
    material.specularIntensityNode,
  ]);
}

function textureNames(material) {
  return new Set(materialGraph(material)
    .filter((node) => node?.value?.isTexture)
    .map((node) => node.value.name));
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const weightManifest = JSON.parse(readFileSync(WEIGHT_MANIFEST_PATH, 'utf8'));
const p15Contract = JSON.parse(readFileSync(P15_CONTRACT_PATH, 'utf8'));
const sourceEnvironmentContent = readFileSync(SOURCE_ENVIRONMENT_CONTENT_PATH, 'utf8');
const library = new SoStylizedSourceLibrary(manifest, {
  landscapeWeightmapSets: {
    Demonstration_SnowPines: {
      baseUrl: WEIGHT_BASE_URL,
      manifest: weightManifest,
    },
  },
  textureLoader: new FixtureTextureLoader(),
});
const state = createSoStylizedSourceEnvironmentState(library);

const snowProfile = library.resolveMaterial('MI_Snow');
assert.ok(snowProfile, 'MI_Snow profile must exist');
assert.equal(classifySoStylizedMaterialProfile(snowProfile), 'snow');

const readyWeightmapSet = { manifest: weightManifest };
assert.equal(inspectSoStylizedLandscapeWeightmapSet(readyWeightmapSet).status, 'ready');
assert.equal(inspectSoStylizedLandscapeWeightmapSet(null).status, 'missing');
assert.equal(inspectSoStylizedLandscapeWeightmapSet({
  manifest: {
    ...weightManifest,
    extent: { ...weightManifest.extent, width: 504 },
  },
}).status, 'invalid');

const sky = await createSoStylizedSourceMaterial('MI_StylizedSky_Lite', {
  library,
  sourceAssetName: 'Demonstration_SnowPines',
  state,
});
assert.equal(sky.side, THREE.FrontSide);
assert.equal(sky.depthTest, true);
assert.equal(sky.depthWrite, true);
assert.equal(sky.fog, true);
assert.equal(sky.transparent, false);
assert.equal(sky.userData.soStylizedSource.contract.curveTime, '1-uv0.y');
assert.equal(
  sky.userData.soStylizedSource.contract.backgroundClouds,
  'static-tinted-texture-screen-blend',
);
assert.ok(
  textureNames(sky).has('T_BackroundClouds1A'),
  'source sky graph must retain the authored background-cloud texture',
);

const clouds = await createSoStylizedSourceMaterial('MI_StylizedClouds_Lite', {
  library,
  sourceAssetName: 'Demonstration_SnowPines',
  state,
});
assert.equal(clouds.side, THREE.FrontSide);
assert.equal(clouds.depthTest, true);
assert.equal(clouds.depthWrite, true);
assert.equal(clouds.fog, true);
assert.equal(clouds.transparent, false);
assert.ok(clouds.opacityNode, 'cloud opacity mask node must be connected');
assert.ok(clouds.alphaTestNode, 'cloud alpha-test node must be connected');
assert.equal(clouds.alphaToCoverage, false);
assert.equal(clouds.userData.soStylizedSource.contract.alphaClip, 1 / 3);
assert.equal(clouds.userData.soStylizedSource.contract.coordinateMaskConnected, false);
assert.ok(
  textureNames(clouds).has('T_CloudLayer03'),
  'source cloud graph must retain the embedded lite-cloud texture',
);

const snow = await createSoStylizedSourceMaterial(snowProfile, {
  library,
  sourceAssetName: 'Demonstration_SnowPines',
  state,
});
assert.equal(snow.userData.soStylizedSource.family, 'snow');
assert.equal(snow.side, THREE.FrontSide);
assert.equal(snow.depthTest, true);
assert.equal(snow.depthWrite, true);
assert.equal(snow.userData.soStylizedSource.contract.colorProjection, 'absolute-ue-world-xy');
assert.equal(snow.userData.soStylizedSource.contract.normal, 'flat-tangent-space');
assert.ok(textureNames(snow).has('T_Snow_BC'), 'MI_Snow must sample its authored snow texture');
assert.ok(
  textureNames(snow).has('T_ChromaNoise_Blurred'),
  'MI_Snow must retain its authored specular noise',
);

const landscape = await createSoStylizedSourceMaterial('MI_Landscape_Snow', {
  library,
  sourceAssetName: 'Demonstration_SnowPines',
  state,
});
const landscapeContract = landscape.userData.soStylizedSource.contract;
assert.equal(landscapeContract.inferredSnow, false);
assert.equal(landscapeContract.autoGrassAffectsSurface, false);
assert.equal(landscapeContract.weightmaps.status, 'ready');
assert.equal(landscapeContract.weightmaps.requiredLayers.length, 10);
assert.equal(
  landscapeContract.weightmaps.binding,
  'authoritative-ten-mask-three-rgba-packs',
);
assert.equal(landscapeContract.weightmaps.fallback, null);
assert.equal(landscapeContract.weightmaps.weightsConnected, true);
assert.equal(landscapeContract.weightmaps.heightBlendLayers.length, 7);
assert.equal(landscapeContract.weightmaps.weightBlendLayers.length, 3);
assert.match(landscapeContract.weightmaps.blend, /normalize-all-ten-together/);
assert.ok(
  landscapeContract.weightmaps.samplerlessTextureCount > 16,
  'the intact Landscape graph must retain more textures than the hardware sampler limit',
);
assert.match(
  landscapeContract.weightmaps.samplerlessFiltering,
  /manual-bilinear-trilinear-textureLoad/,
);
assert.match(
  landscapeContract.weightmaps.samplerlessFiltering,
  /P14 dirt base\/normal\/roughness authored 8x anisotropy/,
  'P14 must preserve the source world-group anisotropy on every dirt map',
);
assert.equal(
  landscapeContract.weightmaps.samplerlessColorTransfer,
  'WebGPU sRGB texture formats decode on textureLoad; no second shader decode',
  'Landscape sRGB textures must not be decoded twice by the samplerless bridge',
);
assert.ok(
  textureNames(landscape).has('T_NoiseStylized'),
  'Landscape AutoCliff must retain its authored noise texture',
);
assert.ok(
  textureNames(landscape).has('T_RockClassic_N'),
  'Landscape AutoCliff must retain the world-aligned source rock normal',
);
assert.ok(landscape.normalNode, 'Landscape must blend the AutoCliff normal attributes');
assert.equal(
  landscapeContract.rockNormal,
  'world-aligned-projection-with-pixel-depth-flattening',
);
assert.equal(
  textureNames(landscape).has('T_Snow_BC'),
  true,
  'SnowPines painted Snow layers must retain the authored snow texture',
);
assert.equal(landscapeContract.weightmaps.textureNames.length, 3);
for (const textureName of landscapeContract.weightmaps.textureNames) {
  assert.ok(
    textureNames(landscape).has(textureName),
    `Landscape must bind runtime weight pack ${textureName}`,
  );
}
assert.equal(
  [...textureNames(landscape)].filter((name) => name.startsWith('LandscapeWeights_')).length,
  3,
  'all ten authored masks must use exactly three sampled RGBA textures',
);
assert.deepEqual(
  p15Contract.landscapeGrassOutput.layers,
  ['Grass', 'SnowGrass', 'SnowGrassBlue'],
  'P15 must sum every source grass-bearing Landscape layer',
);
assert.equal(p15Contract.landscapeGrassOutput.threshold, 0.4000000059604645);
assert.equal(p15Contract.landscapeGrassOutput.autoCliff.enabled, true);
assert.equal(p15Contract.landscapeGrassOutput.autoCliff.start, 0.8500000238418579);
assert.equal(p15Contract.landscapeGrassOutput.autoCliff.fade, 0.800000011920929);
assert.match(
  p15Contract.landscapeGrassOutput.expression,
  /1 - AutoCliffMask/,
  'P15 placement must subtract authored cliff/rock coverage before thresholding',
);
assert.match(
  sourceEnvironmentContent,
  /sampleP15GrassOutputMask[\s\S]*?maskedWeight > outputContract\.threshold/,
  'the parity stage must evaluate the source LandscapeGrassOutput threshold',
);
assert.match(
  sourceEnvironmentContent,
  /authoredWeightMasks:[\s\S]*?autoCliff:/,
  'P15 runtime metadata must expose its complete surface exclusion contract',
);
const landscapeTextures = materialGraph(landscape)
  .filter((node) => node?.value?.isTexture)
  .map((node) => node.value);
assert.ok(
  landscapeTextures.every((map) =>
    map.minFilter === THREE.NearestFilter && map.magFilter === THREE.NearestFilter),
  'Landscape TextureNode bindings must be samplerless; source filtering is reconstructed in WGSL',
);

for (const material of [sky, clouds, snow, landscape]) material.dispose();

if (process.env.TOONLAB_DEBUG_LANDSCAPE_TEXTURES === '1') {
  console.log([...textureNames(landscape)].sort());
}
console.log('environment source shader verification passed');
