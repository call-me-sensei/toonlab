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
import { UeSourceSubsurfaceLightingModel } from '../src/environment/ueSourceSubsurfaceLighting.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMaterials = readFileSync(resolve(
  ROOT_DIR,
  'src/environment/soStylizedSourceMaterials.js',
), 'utf8');
const sourceContent = readFileSync(resolve(
  ROOT_DIR,
  'src/environment/sourceEnvironmentTestContent.js',
), 'utf8');
const subsurfaceLighting = readFileSync(resolve(
  ROOT_DIR,
  'src/environment/ueSourceSubsurfaceLighting.js',
), 'utf8');
const parityHarness = readFileSync(resolve(
  ROOT_DIR,
  'examples/tri-engine-parity/main.js',
), 'utf8');
const profiles = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local/parity/single-rock/profiles.json',
), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local/sostylized/material-source/manifest.json',
), 'utf8'));
const contract = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local/sostylized/foliage/p17-ue-daisy-contract.json',
), 'utf8'));
const scenePath = resolve(
  ROOT_DIR,
  'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
);
const meshManifestPath = resolve(
  ROOT_DIR,
  'assets-local/sostylized/catalog-meshes/manifest.json',
);
const heightGridPath = resolve(
  ROOT_DIR,
  'assets-local/sostylized/landscape-heightfields/SnowPines/'
    + 'p14-camera-render1-patch.json',
);
const materialManifestPath = resolve(
  ROOT_DIR,
  'assets-local/sostylized/material-source/manifest.json',
);
const comparisonContractPath = resolve(
  ROOT_DIR,
  'assets-local/parity/minimal-environment/p13-author-hard/spire-05/contract.json',
);
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const meshManifest = JSON.parse(readFileSync(meshManifestPath, 'utf8'));
const heightGrid = JSON.parse(readFileSync(heightGridPath, 'utf8'));
const comparisonContract = JSON.parse(readFileSync(comparisonContractPath, 'utf8'));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function bilinearScalar(values, size, x, y) {
  const clampedX = Math.max(0, Math.min(size - 1, x));
  const clampedY = Math.max(0, Math.min(size - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const a = values[y0 * size + x0] * (1 - tx) + values[y0 * size + x1] * tx;
  const b = values[y1 * size + x0] * (1 - tx) + values[y1 * size + x1] * tx;
  return a * (1 - ty) + b * ty;
}

function parseGlbJson(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'P17 mesh must be a GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'P17 mesh must use glTF 2.0');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'first GLB chunk must be JSON');
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\u0000+$/u, ''),
  );
}

const sourceMeshPath =
  '/Game/SoStylized/Environment/Foliage/SM_Flower_Daisies1.SM_Flower_Daisies1';
const sourceMaterialPath =
  '/Game/SoStylized/Environment/Foliage/Materials/MI_Daisy.MI_Daisy';
const sourceActor = scene.actors.find((candidate) =>
  candidate.staticMeshes?.some((candidateComponent) =>
    candidateComponent.mesh === sourceMeshPath));
const sourceComponent = sourceActor?.staticMeshes?.find((candidate) =>
  candidate.mesh === sourceMeshPath);
const sourceMaterial = manifest.materials.find((candidate) =>
  candidate.path === sourceMaterialPath);
const sourceMesh = meshManifest.entries.find((candidate) =>
  candidate.sourcePath === sourceMeshPath.split('.')[0]);
assert.ok(sourceActor && sourceComponent && sourceMaterial && sourceMesh);

const anchorCm = heightGrid.anchorUeWorldCentimetersXY;
const halfExtentCm = Number(heightGrid.halfExtentMeters) * 100;
const xyPatchInstances = sourceComponent.instances
  .map((instance, sourceIndex) => ({ ...instance, sourceIndex }))
  .filter(({ translation }) =>
    Math.abs(Number(translation[0]) - Number(anchorCm[0])) <= halfExtentCm
    && Math.abs(Number(translation[1]) - Number(anchorCm[1])) <= halfExtentCm);
const expectedInstances = [];
const expectedUnsupportedInstances = [];
for (const instance of xyPatchInstances) {
  const localX = Number(instance.translation[1]) / 100 - Number(anchorCm[1]) / 100;
  const localZ = -(Number(instance.translation[0]) / 100 - Number(anchorCm[0]) / 100);
  const gridX = (localX + Number(heightGrid.halfExtentMeters))
    / Number(heightGrid.stepMeters);
  const gridZ = (localZ + Number(heightGrid.halfExtentMeters))
    / Number(heightGrid.stepMeters);
  const landscapeHeightMeters = bilinearScalar(
    heightGrid.heightsMeters,
    Number(heightGrid.sampleCount),
    gridX,
    gridZ,
  );
  const sourceHeightMeters = Number(instance.translation[2]) / 100
    - Number(heightGrid.anchorHeightCentimeters) / 100;
  const sourceHeightDeltaMeters = sourceHeightMeters - landscapeHeightMeters;
  const expected = {
    ...instance,
    sourceTranslation: [...instance.translation],
    translation: [
      Number(instance.translation[0]),
      Number(instance.translation[1]),
      Number(heightGrid.anchorHeightCentimeters) + landscapeHeightMeters * 100,
    ],
    landscapeHeightMeters,
    sourceHeightDeltaMeters,
  };
  if (Math.abs(sourceHeightDeltaMeters) <= 1) expectedInstances.push(expected);
  else expectedUnsupportedInstances.push(expected);
}

assert.equal(contract.schema, 'toonlab.p17-ue-daisy-contract');
assert.equal(contract.version, 2);
assert.match(contract.engine, /^5\.8\./);
assert.equal(contract.actor.class, 'InstancedFoliageActor');
assert.equal(contract.component.class, 'FoliageInstancedStaticMeshComponent');
assert.equal(contract.component.name, 'FoliageInstancedStaticMeshComponent_96');
assert.equal(
  contract.component.mesh,
  '/Game/SoStylized/Environment/Foliage/SM_Flower_Daisies1.SM_Flower_Daisies1',
);
assert.deepEqual(
  contract.component.materials,
  ['/Game/SoStylized/Environment/Foliage/Materials/MI_Daisy.MI_Daisy'],
);
assert.equal(contract.component.sourceInstanceCount, 1364);
assert.equal(contract.component.xyPatchInstanceCount, 93);
assert.equal(contract.component.retainedPatchInstanceCount, 68);
assert.equal(contract.component.unsupportedPatchInstanceCount, 25);
assert.equal(contract.instances.length, 68);
assert.deepEqual(contract.instances, expectedInstances);
assert.equal(contract.placementSupport.landscapeSupportToleranceMeters, 1);
assert.equal(contract.placementSupport.xyPatchInstanceCount, 93);
assert.equal(contract.placementSupport.retainedLandscapeInstanceCount, 68);
assert.equal(contract.placementSupport.excludedUnsupportedInstanceCount, 25);
assert.deepEqual(
  contract.placementSupport.excludedSourceIndices,
  expectedUnsupportedInstances.map(({ sourceIndex }) => sourceIndex),
);
assert.equal(
  contract.placementSupport.maximumExcludedHeightDeltaMeters,
  Math.max(...expectedUnsupportedInstances.map(({ sourceHeightDeltaMeters }) =>
    Math.abs(sourceHeightDeltaMeters))),
);
assert.match(contract.placementSupport.policy, /bilinear P14 reference height/);
assert.match(contract.placementSupport.policy, /runtime resolves final root height/);
assert.match(contract.placementSupport.reason, /source rocks\/cliffs/);
assert.equal(
  contract.provenance.comparisonContract.sha256,
  sha256(comparisonContractPath),
);
assert.deepEqual(
  contract.comparisonFixture.positionMeters,
  comparisonContract.capture.environment.placement.flowers.position,
);
assert.equal(
  contract.comparisonFixture.scale,
  comparisonContract.capture.environment.placement.flowers.scale,
);
assert.equal(contract.comparisonFixture.instanceCount, 1);
assert.equal(contract.comparisonFixture.sourceLod0ClumpCount, 1);
assert.equal(contract.comparisonFixture.castShadow, false);
assert.equal(contract.comparisonFixture.receiveShadow, true);
assert.match(contract.comparisonFixture.policy, /exactly one source LOD0 clump/);
assert.match(contract.comparisonFixture.policy, /68-clump source inventory/);
assert.match(contract.comparisonFixture.terrainAttachment, /active height field/);
assert.equal(contract.component.renderProperties.cast_shadow, true);
assert.equal(contract.component.renderProperties.cast_dynamic_shadow, true);
assert.equal(contract.component.renderProperties.cast_static_shadow, true);
assert.equal(contract.component.renderProperties.cast_contact_shadow, true);
assert.equal(contract.component.renderProperties.evaluate_world_position_offset, true);
assert.equal(contract.component.renderProperties.world_position_offset_disable_distance, 0);
assert.equal(contract.mesh.lods[0].triangles, 144);
assert.equal(contract.mesh.lods[1].triangles, 71);
assert.deepEqual(contract.mesh.lods, sourceMesh.lods);
assert.deepEqual(contract.mesh.materials, sourceMesh.materials);
assert.equal(contract.material.path.endsWith('/MI_Daisy.MI_Daisy'), true);
assert.equal(contract.material.parent.endsWith('/M_Foliage.M_Foliage'), true);
assert.deepEqual(contract.material.scalar, sourceMaterial.parameters.scalar);
assert.deepEqual(contract.material.vector, sourceMaterial.parameters.vector);
assert.deepEqual(contract.material.texture, sourceMaterial.parameters.texture);
assert.deepEqual(contract.material.staticSwitch, sourceMaterial.parameters.static_switch);
assert.equal(contract.material.scalar.Roughness, 0.5);
assert.equal(contract.material.scalar.Specular, 0.05000000074505806);
assert.equal(contract.material.scalar['SS Strength'], 0.30000001192092896);
assert.equal(contract.material.scalar['SS Opacity'], 0.07999999821186066);
assert.equal(contract.material.scalar['Hue Variation'], 0);
assert.equal(contract.material.scalar['Random Roughness'], 1);
assert.equal(contract.material.staticSwitch['UseTexture?'], true);
assert.equal(contract.material.staticSwitch['UseRVTColor?'], true);
assert.equal(contract.material.staticSwitch['UseWind?'], true);
assert.equal(contract.material.staticSwitch['UseWindColor?'], true);
assert.equal(contract.material.staticSwitch['TwoSidedNormals?'], true);
assert.equal(
  contract.material.texture['Foliage Texture'].split('.').at(-1),
  'T_FoliageSheet_BC',
);
for (const instance of contract.instances) {
  const [ueXcm, ueYcm] = instance.translation;
  assert.ok(
    Math.abs(ueXcm - contract.patch.anchorUeWorldCentimetersXY[0])
      <= contract.patch.halfExtentMeters * 100,
  );
  assert.ok(
    Math.abs(ueYcm - contract.patch.anchorUeWorldCentimetersXY[1])
      <= contract.patch.halfExtentMeters * 100,
  );
  assert.equal(instance.translation.length, 3);
  assert.equal(instance.rotation.length, 4);
  assert.equal(instance.scale.length, 3);
  assert.equal(instance.sourceTranslation.length, 3);
  assert.ok(Math.abs(instance.sourceHeightDeltaMeters) <= 1);
  assert.ok(Math.abs(
    instance.translation[2]
      - (contract.patch.anchorHeightCentimeters + instance.landscapeHeightMeters * 100),
  ) < 1e-9);
  const quaternionLength = Math.hypot(...instance.rotation);
  assert.ok(Math.abs(quaternionLength - 1) < 1e-9);
  assert.ok(Math.abs(instance.scale[0] - instance.scale[1]) < 1e-9);
  assert.ok(Math.abs(instance.scale[1] - instance.scale[2]) < 1e-9);
}
assert.equal(new Set(contract.instances.map(({ sourceIndex }) => sourceIndex)).size, 68);

assert.equal(contract.provenance.scene.sha256, sha256(scenePath));
assert.equal(contract.provenance.materialManifest.sha256, sha256(materialManifestPath));
assert.equal(contract.provenance.meshManifest.sha256, sha256(meshManifestPath));
assert.equal(contract.provenance.heightGrid.sha256, sha256(heightGridPath));
const lod0Path = resolve(
  ROOT_DIR,
  'assets-local/sostylized/catalog-meshes',
  sourceMesh.lods[0].file,
);
const gltf = parseGlbJson(lod0Path);
const primitives = gltf.meshes.flatMap((candidate) => candidate.primitives ?? []);
assert.equal(primitives.length, 1);
const primitive = primitives[0];
const positionAccessor = gltf.accessors[primitive.attributes.POSITION];
const indexAccessor = gltf.accessors[primitive.indices];
const gltfMaterial = gltf.materials[primitive.material];
assert.equal(contract.mesh.audit.sha256, sha256(lod0Path));
assert.equal(contract.mesh.audit.vertexCount, positionAccessor.count);
assert.equal(contract.mesh.audit.indexCount, indexAccessor.count);
assert.equal(contract.mesh.audit.triangleCount, indexAccessor.count / 3);
assert.deepEqual(
  contract.mesh.audit.attributes,
  Object.keys(primitive.attributes).sort(),
);
assert.deepEqual(contract.mesh.audit.material, {
  name: gltfMaterial.name,
  alphaMode: gltfMaterial.alphaMode,
  alphaCutoff: gltfMaterial.alphaCutoff,
  doubleSided: gltfMaterial.doubleSided,
});
const foliageTexturePath = contract.material.texture['Foliage Texture'];
const foliageTexture = manifest.textures[foliageTexturePath];
assert.equal(foliageTexture.width, 4096);
assert.equal(foliageTexture.height, 4096);
assert.equal(foliageTexture.srgb, true);
assert.match(foliageTexture.addressX, /TA_WRAP/);
assert.match(foliageTexture.addressY, /TA_WRAP/);

assert.match(
  sourceContent,
  /const P17_FLOWER_CHECKPOINT = 'flowers';/,
  'P17 must remain a distinct, flowers-only material checkpoint',
);
assert.match(
  sourceContent,
  /metadata\?\.version !== 2/,
  'P17 runtime must reject stale XY-only v1 placement contracts',
);
assert.match(
  sourceContent,
  /metadata\.instances\.length !== metadata\?\.placementSupport\?\.retainedLandscapeInstanceCount[\s\S]*?comparisonFixture\?\.instanceCount !== 1/,
  'P17 runtime must validate the Landscape-supported instance count',
);
assert.match(
  sourceContent,
  /function createP17RetainedDaisies\([\s\S]*?new THREE\.InstancedMesh\([\s\S]*?comparisonFixture\.instanceCount/,
  'P17 must instantiate the exact shared one-clump comparison population',
);
assert.match(
  sourceContent,
  /function attachLocalTranslationToRetainedLandscape\([\s\S]*?sampleHeightField\(heightGrid, localX, localZ, normalTarget\)[\s\S]*?positionTarget\.set\(localX, localY, localZ\)/,
  'P17 must resolve placement from the active retained Landscape height field',
);
assert.match(
  sourceContent,
  /attachLocalTranslationToRetainedLandscape\([\s\S]*?comparisonFixture\.positionMeters[\s\S]*?rotation\.setFromUnitVectors\(new THREE\.Vector3\(0, 1, 0\), terrainNormal\)/,
  'P17 must ground the shared fixture and align it to the active terrain',
);
assert.match(
  sourceContent,
  /function retainedActorPosition\([\s\S]*?attachUeTranslationToRetainedLandscape\(/,
  'retained trees and P17 flowers must share the same terrain attachment helper',
);
assert.match(
  sourceContent,
  /flowers\.castShadow = Boolean\(comparisonFixture\.castShadow\);[\s\S]*?flowers\.receiveShadow = Boolean\(comparisonFixture\.receiveShadow\);/,
  'P17 flower shadow flags must come from the shared compact fixture',
);
assert.match(
  sourceContent,
  /sourceSceneVariant: visualTargetFlowers[\s\S]*?'retained-instanced-daisies'/,
  'P17 must route MI_Daisy through the retained-scene material adapter only at P17',
);

class VerificationTextureLoader {
  async loadAsync(url) {
    const texture = new THREE.Texture();
    texture.name = String(url);
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
      try {
        child = value[key];
      } catch {
        continue;
      }
      if (Array.isArray(child)) pending.push(...child);
      else if (child && typeof child === 'object') pending.push(child);
    }
  }
  return result;
}

const library = new SoStylizedSourceLibrary(manifest, {
  baseUrl: '/p17-verification',
  textureLoader: new VerificationTextureLoader(),
});
const state = createSoStylizedSourceEnvironmentState(library);
state.userData = {
  worldOffsetUeMeters: [198.76090883374, -181.1957621749962],
};
const daisies = await createSoStylizedSourceMaterial('MI_Daisy', {
  hasUv2: true,
  hasVertexColors: true,
  library,
  sourceAssetName: 'Demonstration_SnowPines',
  sourceSceneVariant: 'retained-instanced-daisies',
  state,
});
const graph = collectGraphObjects([
  daisies.alphaTestNode,
  daisies.colorNode,
  daisies.emissiveNode,
  daisies.maskShadowNode,
  daisies.normalNode,
  daisies.opacityNode,
  daisies.positionNode,
  daisies.roughnessNode,
  daisies.specularIntensityNode,
  daisies.thicknessAttenuationNode,
  daisies.thicknessColorNode,
]);

assert.equal(daisies.type, 'MeshSSSNodeMaterial');
assert.equal(daisies.side, THREE.DoubleSide);
assert.equal(daisies.forceSinglePass, true);
assert.equal(daisies.vertexColors, false);
assert.equal(daisies.alphaToCoverage, false);
assert.ok(daisies.maskShadowNode);
assert.ok(daisies.normalNode);
assert.ok(daisies.positionNode);
assert.equal(daisies.userData.soStylizedSource.contract.alpha, 'FoliageTexture.a');
assert.equal(daisies.userData.soStylizedSource.contract.alphaClip, 1 / 3);
assert.equal(daisies.userData.soStylizedSource.contract.gradientUv, 2);
assert.equal(
  daisies.userData.soStylizedSource.contract.temporalDither,
  'analytic warmed-TAA full-visibility result; PerInstanceFadeAmount=1',
);
assert.equal(
  daisies.userData.soStylizedSource.contract.transmissionShadow,
  'authored SS Opacity separates thin-card transmission from masked surface visibility',
);
assert.ok(
  graph.some((node) => node?._attributeName === 'uv2'),
  'MI_Daisy must retain TEXCOORD_2 for RVT surface-field blending',
);
assert.equal(
  daisies.userData.soStylizedSource.contract.vertexColor,
  'rgb:wpo-mask',
);
assert.match(
  sourceMaterials,
  /wpo = wpo\.mul\(vec3\(vertexColor\(\)\.r, vertexColor\(\)\.b, vertexColor\(\)\.g\)\);/,
  'MI_Daisy must retain COLOR_0 as the component-wise WPO mask',
);
assert.ok(
  daisies.setupLightingModel() instanceof UeSourceSubsurfaceLightingModel,
  'MI_Daisy must retain UE MSM_SUBSURFACE lighting',
);
assert.match(
  sourceMaterials,
  /const retainedDaisyMask = context\.sourceAssetName === SNOWPINES_SOURCE_ASSET[\s\S]*?context\.sourceSceneVariant === 'retained-instanced-daisies'/,
  'P17-specific renderer adaptation must be source-scene gated',
);
assert.match(
  sourceMaterials,
  /const dither = retainedDaisyMask\s*\? float\(1\)\s*: sourceTemporalDither\(float\(1\), state\);/,
  'P17 must resolve known full instance visibility analytically',
);
assert.match(
  subsurfaceLighting,
  /const transmissionVisibility = mix\(1, surfaceVisibility, opacity\);/,
  'P17 must keep masked surface visibility separate from authored SS opacity',
);

const p17 = profiles.profiles.find((profile) =>
  profile.id === 'p17-visual-target-flowers');
assert.ok(p17);
assert.equal(p17.inherits, 'p16-visual-target-tree');
assert.equal(p17.materialCheckpoint, 'flowers');
assert.deepEqual(p17.changes, ['flowers']);
assert.ok(p17.acceptance.flowersOnlyIsolation.frozenModules.includes('tree'));
assert.match(
  parityHarness,
  /\['grass', 'tree', 'flowers'\]\.includes\(contract\.materialCheckpoint\)/,
  'P17 must inherit the accepted Landscape RVT field without changing it',
);
assert.match(
  parityHarness,
  /const environmentCaptureRoot = MINIMAL_ENVIRONMENT_CAPTURE_ROOT;/,
  'P17 must compare against the same immutable one-clump native fixture',
);
assert.match(
  parityHarness,
  /contract\.profileId === 'p16-visual-target-tree'\s*\|\| contract\.profileId === 'p17-visual-target-flowers'/,
  'P17 must inherit the accepted P16 UE shadow filter',
);

console.log('P17 retained UE daisy foliage verification passed');
