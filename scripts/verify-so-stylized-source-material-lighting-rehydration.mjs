#!/usr/bin/env node

// Regression gate for NodeMaterial template cloning. Three deliberately does
// not copy arbitrary instance-installed setupLightingModel functions, so every
// source-material clone must rehydrate its renderer adapter explicitly.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  MeshPhysicalNodeMaterial,
  MeshSSSNodeMaterial,
} from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

import {
  rehydrateSoStylizedSourceMaterialLighting,
} from '../src/environment/soStylizedSourceMaterials.js';
import {
  SoStylizedUnityUrpLightingModel,
  installSoStylizedUnityUrpLighting,
} from '../src/environment/soStylizedUnityUrpLighting.js';
import {
  UeSourceDefaultLitLightingModel,
  installUeSourceDefaultLitLighting,
} from '../src/environment/ueSourceDefaultLit.js';
import {
  UeSourceSubsurfaceLightingModel,
  installUeSourceSubsurfaceLighting,
} from '../src/environment/ueSourceSubsurfaceLighting.js';

const unityTemplate = new MeshPhysicalNodeMaterial();
installSoStylizedUnityUrpLighting(unityTemplate, { workflow: 'metallic' });
assert.equal(Object.hasOwn(unityTemplate, 'setupLightingModel'), true);

const unityClone = unityTemplate.clone();
assert.equal(
  Object.hasOwn(unityClone, 'setupLightingModel'),
  false,
  'Three clone must demonstrate the source regression before rehydration',
);
rehydrateSoStylizedSourceMaterialLighting(unityClone);
assert.equal(Object.hasOwn(unityClone, 'setupLightingModel'), true);
const unityModel = unityClone.setupLightingModel();
assert.ok(unityModel instanceof SoStylizedUnityUrpLightingModel);
assert.equal(unityModel.inputAdapter.id, 'ue-captured-scene-sh');
assert.equal(unityModel.workflow, 'metallic');
assert.equal(
  unityClone.userData.soStylizedSourceLightingClone.sourceStageInputAdapter,
  'ue-captured-scene-sh',
);

const defaultLitTemplate = new MeshPhysicalNodeMaterial();
defaultLitTemplate.roughnessNode = float(0.73);
defaultLitTemplate.metalnessNode = float(0.15);
defaultLitTemplate.specularIntensityNode = float(0.2);
installUeSourceDefaultLitLighting(defaultLitTemplate);
assert.equal(Object.hasOwn(defaultLitTemplate, 'setupLightingModel'), true);

const defaultLitClone = defaultLitTemplate.clone();
assert.equal(Object.hasOwn(defaultLitClone, 'setupLightingModel'), false);
rehydrateSoStylizedSourceMaterialLighting(defaultLitClone);
assert.equal(Object.hasOwn(defaultLitClone, 'setupLightingModel'), true);
assert.ok(
  defaultLitClone.setupLightingModel() instanceof UeSourceDefaultLitLightingModel,
);
assert.equal(
  defaultLitClone.userData.soStylizedSourceLightingClone.lightingModel,
  'ue-legacy-default-lit',
);
assert.equal(
  defaultLitClone.userData.soStylizedSourceLightingClone.sourceStageInputAdapter,
  null,
);

const foliageTemplate = new MeshSSSNodeMaterial();
foliageTemplate.thicknessColorNode = vec3(0.2, 0.7, 0.1);
foliageTemplate.thicknessAttenuationNode = float(0.08);
installUeSourceSubsurfaceLighting(foliageTemplate);
const foliageClone = foliageTemplate.clone();
assert.equal(Object.hasOwn(foliageClone, 'setupLightingModel'), false);
rehydrateSoStylizedSourceMaterialLighting(foliageClone);
assert.equal(Object.hasOwn(foliageClone, 'setupLightingModel'), true);
assert.ok(foliageClone.setupLightingModel() instanceof UeSourceSubsurfaceLightingModel);
assert.equal(foliageClone.userData.soStylizedSourceLightingClone.rehydrated, true);

const sourcePath = fileURLToPath(new URL(
  '../src/environment/soStylizedSourceMaterials.js',
  import.meta.url,
));
const source = await readFile(sourcePath, 'utf8');
assert.match(
  source,
  /return rehydrateSoStylizedSourceMaterialLighting\(material\);/,
  'cached template clones must pass through the adapter rehydration gate',
);

for (const material of [
  unityTemplate,
  unityClone,
  defaultLitTemplate,
  defaultLitClone,
  foliageTemplate,
  foliageClone,
]) {
  material.dispose();
}

console.log('Source-material lighting clone rehydration verified.');
console.log('UE opaque Default Lit, Unity-derived URP, and UE subsurface adapters all survive cached-template cloning.');
