#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  createSoStylizedSourceEnvironmentState,
  createSoStylizedSourceMaterial,
  createSoStylizedBasicMaterialFromPbr,
} from '../src/environment/soStylizedSourceMaterials.js';
import { SoStylizedSourceLibrary } from '../src/environment/soStylizedSourceLibrary.js';
import { UeSourceDefaultLitLightingModel } from '../src/environment/ueSourceDefaultLit.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMaterials = readFileSync(resolve(
  ROOT_DIR,
  'src/environment/soStylizedSourceMaterials.js',
), 'utf8');
const sourceContent = readFileSync(resolve(
  ROOT_DIR,
  'src/environment/sourceEnvironmentTestContent.js',
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

const MATERIAL_PARENT =
  '/Game/SoStylized/Materials/M_StylizedBasic.M_StylizedBasic';
const BEACH_MATERIAL =
  '/Game/SoStylized/Environment/Misc/Materials/MI_BeachShells.MI_BeachShells';
const FIXTURES = Object.freeze([
  ['SM_Beach_BandedTulip', false],
  ['SM_Beach_Conch', true],
  ['SM_Beach_SandDollar', false],
  ['SM_Beach_Scallop', false],
  ['SM_Beach_Starfish', true],
]);
const BENCH_PATH = resolve(
  ROOT_DIR,
  'assets-local/props/furnitures/outdoor-bench.glb',
);
const LAMP_PATH = resolve(
  ROOT_DIR,
  'assets-local/props/buildings/lamp_post_light.glb',
);
const SWORD_PATH = resolve(
  ROOT_DIR,
  'assets-local/props/weapons/painted_sword.glb',
);
const CRATE_PATH = resolve(
  ROOT_DIR,
  'assets-local/props/furnitures/military_trenches_storage_crate_wood_worn_01_zjkocdjtq_mid.glb',
);
const PROP_CONTRACT_PATH = resolve(
  ROOT_DIR,
  'assets-local/parity/environment/p18-stylized-basic-props.json',
);

function parseGlbJson(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path} must be a GLB`);
  assert.equal(bytes.readUInt32LE(4), 2, `${path} must use glTF 2.0`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'first GLB chunk must be JSON');
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\u0000+$/u, ''),
  );
}

const beach = manifest.materials.find((entry) => entry.path === BEACH_MATERIAL);
assert.ok(beach);
assert.deepEqual(beach.chain, [BEACH_MATERIAL, MATERIAL_PARENT]);
assert.equal(beach.parameters.static_switch['UseColorTexture?'], true);
assert.equal(beach.parameters.static_switch['RoughnessMap?'], true);
assert.equal(beach.parameters.static_switch['NormalMap?'], false);
assert.equal(beach.parameters.static_switch['BlendWithLandscape?'], false);
assert.equal(beach.parameters.static_switch['UseDayCycleEmission?'], true);
assert.equal(beach.parameters.static_switch['UseWeather?'], true);
assert.equal(beach.parameters.scalar['Emissive Strength'], 0.10000000149011612);
assert.equal(beach.parameters.scalar['Hue Variation'], 0.029999999329447746);
assert.equal(
  beach.parameters.texture['Base Color Texture'],
  '/Game/SoStylized/Environment/Misc/Textures/T_BeachShells_BC.T_BeachShells_BC',
);
assert.equal(
  beach.parameters.texture['Roughness Texture'],
  '/Game/SoStylized/Environment/Misc/Textures/T_BeachShells_R.T_BeachShells_R',
);

for (const [name, castShadow] of FIXTURES) {
  const sourcePath = `/Game/SoStylized/Environment/Misc/${name}`;
  const mesh = manifest.meshes.find((entry) =>
    entry.sourceAssetName === name);
  assert.ok(mesh, `${name} must exist in the material source manifest`);
  assert.equal(mesh.sourcePath, sourcePath);
  assert.deepEqual(mesh.materials, [BEACH_MATERIAL]);
  assert.deepEqual(mesh.materialSlots, [{
    name: 'MI_BeachShells',
    importedName: 'MI_BeachShells',
    material: BEACH_MATERIAL,
  }]);

  const glbPath = resolve(
    ROOT_DIR,
    `assets-local/sostylized/catalog-meshes/Misc/${name}/lod0.glb`,
  );
  const gltf = parseGlbJson(glbPath);
  const primitiveMaterials = gltf.meshes.flatMap((candidate) =>
    candidate.primitives ?? []).map((primitive) =>
      gltf.materials?.[primitive.material]?.name);
  assert.ok(primitiveMaterials.length > 0);
  assert.ok(
    primitiveMaterials.every((materialName) => materialName === 'MI_BeachShells'),
    `${name} LOD0 must retain the authored MI_BeachShells slot`,
  );
  assert.match(
    sourceContent,
    new RegExp(
      `name: '${name}'[\\s\\S]*?castShadow: ${castShadow}`,
    ),
    `${name} must retain its authored Unreal cast-shadow flag`,
  );
}

const benchGltf = parseGlbJson(BENCH_PATH);
assert.equal(benchGltf.asset.generator, 'fab-model-conversion');
assert.deepEqual(
  benchGltf.materials.map(({ name }) => name).sort(),
  ['m_benchA', 'm_benchB'],
);
assert.ok(benchGltf.materials.every((material) =>
  material.pbrMetallicRoughness?.metallicFactor === 0
  && material.pbrMetallicRoughness?.roughnessFactor === 0.600000024));
assert.equal(benchGltf.textures, undefined);
assert.equal(benchGltf.images, undefined);
assert.ok(benchGltf.nodes.some(({ name }) => name === 'BenchA'));

const lampGltf = parseGlbJson(LAMP_PATH);
assert.equal(lampGltf.asset.generator, 'fab-model-conversion');
assert.equal(lampGltf.materials.length, 2);
assert.equal(lampGltf.textures.length, 7);
assert.equal(lampGltf.images.length, 7);
assert.equal(
  lampGltf.materials.find(({ name }) => name === 'T_lamp_post_2_1001')
    .extensions.KHR_materials_emissive_strength.emissiveStrength,
  10,
);
assert.equal(
  lampGltf.materials.find(({ name }) => name === 'T_light_glass_1001').alphaMode,
  'BLEND',
);

const swordGltf = parseGlbJson(SWORD_PATH);
assert.equal(swordGltf.asset.generator, 'fab-model-conversion');
assert.equal(swordGltf.materials.length, 1);
assert.equal(swordGltf.textures.length, 2);
assert.equal(swordGltf.images.length, 2);
assert.equal(
  swordGltf.materials[0].pbrMetallicRoughness.metallicFactor,
  0.4386630504963457,
);

const crateGltf = parseGlbJson(CRATE_PATH);
assert.equal(crateGltf.asset.generator, 'fab-model-conversion');
assert.equal(crateGltf.meshes.length, 2);
assert.equal(crateGltf.materials.length, 1);
assert.equal(crateGltf.textures.length, 3);
assert.equal(crateGltf.images.length, 3);
assert.equal(
  crateGltf.materials[0].name,
  'Military_Trenches_Storage_Crate_Wood_Worn_01_zjkocdjtq_Mid',
);

const propContract = JSON.parse(readFileSync(PROP_CONTRACT_PATH, 'utf8'));
assert.equal(propContract.schema, 'toonlab.p18-stylized-basic-prop-contract');
assert.deepEqual(
  propContract.props.map(({ id }) => id),
  [
    'outdoor-bench',
    'lamp-post',
    'painted-sword',
    'megascans-storage-crate',
  ],
);
const benchFixture = propContract.props.find(({ id }) => id === 'outdoor-bench');
const lampFixture = propContract.props.find(({ id }) => id === 'lamp-post');
const swordFixture = propContract.props.find(({ id }) => id === 'painted-sword');
const crateFixture = propContract.props.find(
  ({ id }) => id === 'megascans-storage-crate',
);
assert.equal(benchFixture.sourceNode, 'BenchA');
assert.deepEqual(benchFixture.canonicalPositionMeters, [-8.1725, 0, -0.45]);
assert.deepEqual(benchFixture.canonicalRotationEulerDegrees, [0, -90, 0]);
assert.deepEqual(benchFixture.toonlabRotationEulerDegrees, [0, 270, 0]);
assert.deepEqual(benchFixture.unrealRotationEulerDegrees, [0, -180, 0]);
assert.match(
  benchFixture.unrealRotationAdapter,
  /additional 90 degree counter-clockwise yaw/,
);
assert.equal(benchFixture.grassExclusion.shape, 'oriented-box');
assert.equal(benchFixture.alignToTerrainNormal, false);
assert.equal(benchFixture.groundingMode, 'lowest-support-envelope');
assert.equal(propContract.composition.benchAuthoredWidthMeters, 0.9225);
assert.equal(
  propContract.composition.benchForwardMoveMeters,
  propContract.composition.benchAuthoredWidthMeters,
);
assert.equal(
  propContract.composition.benchForwardMoveBasis,
  'bench-local forward after -90 degree yaw = canonical -X',
);
assert.ok(benchFixture.materialOverrides.m_benchA.baseColorSrgb);
assert.deepEqual(lampFixture.canonicalScale, [0.0014, 0.0014, 0.0014]);
assert.equal(lampFixture.alignToTerrainNormal, false);
assert.equal(lampFixture.groundingMode, 'lowest-support-envelope');
assert.ok(
  Math.abs(
    Math.hypot(
      lampFixture.canonicalPositionMeters[0]
        - benchFixture.canonicalPositionMeters[0],
      lampFixture.canonicalPositionMeters[2]
        - benchFixture.canonicalPositionMeters[2],
    ) - propContract.composition.benchToLampDistanceMeters,
  ) < 0.001,
);
assert.equal(swordFixture.canonicalRotationEulerDegrees[0], 188);
assert.deepEqual(swordFixture.canonicalScale, [0.0045, 0.0045, 0.0045]);
assert.equal(swordFixture.grassExclusion.shape, 'circle');
assert.deepEqual(crateFixture.canonicalScale, [2.8, 2.8, 2.8]);
assert.equal(crateFixture.alignToTerrainNormal, true);
assert.equal(crateFixture.groundingMode, 'lowest-support-envelope');
assert.equal(crateFixture.grassExclusion.shape, 'oriented-box');
assert.equal(crateFixture.sourceBoundsMeters.width, 0.9256434);
assert.ok(
  Math.abs(
    Math.hypot(
      swordFixture.canonicalPositionMeters[0]
        - benchFixture.canonicalPositionMeters[0],
      swordFixture.canonicalPositionMeters[2]
        - benchFixture.canonicalPositionMeters[2],
    ) - propContract.composition.benchToSwordDistanceMeters,
  ) < 0.001,
);

class VerificationTextureLoader {
  async loadAsync(url) {
    const texture = new THREE.Texture();
    texture.name = String(url);
    return texture;
  }
}

const library = new SoStylizedSourceLibrary(manifest, {
  baseUrl: '/p18-verification',
  textureLoader: new VerificationTextureLoader(),
});
const state = createSoStylizedSourceEnvironmentState(library);
const shellMaterial = await createSoStylizedSourceMaterial('MI_BeachShells', {
  library,
  sourceAssetName: 'SM_Beach_Conch',
  state,
});
assert.equal(shellMaterial.type, 'MeshPhysicalNodeMaterial');
assert.equal(shellMaterial.side, THREE.FrontSide);
assert.ok(shellMaterial.colorNode);
assert.ok(shellMaterial.emissiveNode);
assert.ok(shellMaterial.normalNode);
assert.ok(shellMaterial.roughnessNode);
assert.ok(shellMaterial.specularIntensityNode);
assert.equal(shellMaterial.userData.soStylizedSource.family, 'stylizedBasic');
assert.equal(
  shellMaterial.userData.soStylizedSource.materialPath,
  BEACH_MATERIAL,
);
assert.equal(
  shellMaterial.userData.soStylizedSource.contract.sourceGraph,
  '/Game/SoStylized/Materials/M_StylizedBasic',
);
assert.equal(
  shellMaterial.userData.soStylizedSource.contract.roughness,
  'RoughnessMap? texture.r : Roughness; direct UE roughness',
);
assert.equal(
  shellMaterial.userData.soStylizedSource.contract.landscapeBlend,
  'inactive',
);
assert.equal(shellMaterial.userData.shaderSwipeBaseline.vertexDeformation, false);
assert.ok(
  shellMaterial.setupLightingModel() instanceof UeSourceDefaultLitLightingModel,
  'M_StylizedBasic must use the UE 5.8 Default Lit bridge',
);

const pricklyPear = await createSoStylizedSourceMaterial(
  'MI_CactusPricklyPear',
  {
    library,
    sourceAssetName: 'SM_CactusPricklyPear01',
    state,
  },
);
assert.equal(pricklyPear.userData.soStylizedSource.family, 'stylizedBasic');
assert.equal(
  pricklyPear.userData.soStylizedSource.contract.landscapeBlend,
  'MF_VTBlend world-height color and specular branches',
);
assert.equal(pricklyPear.userData.soStylizedSource.contract.vtBlend.normalBlend, false);

const benchMaterial = await createSoStylizedBasicMaterialFromPbr(
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    name: 'm_benchA',
    roughness: 0.600000024,
    side: THREE.DoubleSide,
  }),
  {
    library,
    sourceAssetName: 'outdoor-bench',
    state,
  },
);
assert.equal(benchMaterial.userData.soStylizedSource.family, 'stylizedBasic');
assert.equal(benchMaterial.side, THREE.DoubleSide);
assert.equal(
  benchMaterial.userData.soStylizedSource.reconstruction,
  'imported-pbr-input-through-M_StylizedBasic',
);
assert.equal(
  benchMaterial.userData.soStylizedSource.contract.inputAuthority.baseColor,
  'GLB pbrMetallicRoughness.baseColorFactor',
);
assert.equal(
  benchMaterial.userData.soStylizedSource.contract.inputAuthority.texture,
  'none authored in supplied GLB',
);

const sourceMap = new THREE.Texture();
const sourceMetallicRoughness = new THREE.Texture();
const sourceNormal = new THREE.Texture();
const sourceEmission = new THREE.Texture();
const texturedMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffcc66,
  emissiveIntensity: 10,
  map: sourceMap,
  metalness: 0.5,
  metalnessMap: sourceMetallicRoughness,
  name: 'T_lamp_post_2_1001',
  normalMap: sourceNormal,
  roughness: 0.75,
  roughnessMap: sourceMetallicRoughness,
  side: THREE.DoubleSide,
});
texturedMaterial.emissiveMap = sourceEmission;
const texturedP18 = await createSoStylizedBasicMaterialFromPbr(
  texturedMaterial,
  {
    library,
    sourceAssetName: 'lamp-post',
    state,
  },
);
assert.equal(texturedP18.side, THREE.DoubleSide);
assert.equal(
  texturedP18.userData.soStylizedSource.contract.inputAuthority.texture,
  'embedded GLB PBR maps decoded by GLTFLoader with authored color spaces',
);
assert.match(
  texturedP18.userData.soStylizedSource.contract.inputAuthority.metallic,
  /\.b \* metallicFactor/,
);
assert.match(
  texturedP18.userData.soStylizedSource.contract.inputAuthority.roughness,
  /\.g \* roughnessFactor/,
);

assert.match(
  sourceMaterials,
  /function isStylizedBasicProfile\([\s\S]*?M_StylizedBasic\.M_StylizedBasic/,
  'the exact family route must be parent-chain driven',
);
assert.match(
  sourceMaterials,
  /material\.roughnessNode = clamp\(roughnessNode, 0, 1\);/,
  'P18 must preserve direct Unreal roughness, including authored zero',
);
assert.match(
  sourceMaterials,
  /heightDeltaCm[\s\S]*?distanceCm \/ 6[\s\S]*?groundSurface\.g/,
  'P18 must retain MF_VTBlend height/specular behavior',
);
assert.match(
  sourceContent,
  /const P18_STYLIZED_BASIC_CHECKPOINT = 'stylized-basic';/,
);
assert.match(
  sourceContent,
  /function createP18StylizedBasicFixtures\([\s\S]*?applySoStylizedSourceMaterials[\s\S]*?attachLocalTranslationToRetainedLandscape[\s\S]*?worldVertexHeightQuantile[\s\S]*?supportVertexQuantile/,
  'P18 must use exact source material routing and procedural terrain attachment',
);
assert.match(
  sourceContent,
  /P18_PROP_CONTRACT_URL[\s\S]*?propContract\.props[\s\S]*?createSoStylizedBasicMaterialFromPbr/,
  'P18 must run every shared prop-contract fixture through the modular solid-surface path',
);
assert.match(
  sourceContent,
  /selectedTree[\s\S]*?materialOverrides/,
  'P18 must select one bench design and apply portable fallback color only when declared',
);
assert.match(
  sourceContent,
  /p18ExcludedFamily: 'translucent-glass'/,
  'P18 must freeze lamp glass for its later declared material family',
);
assert.match(
  sourceContent,
  /settleLowestSupportEnvelope[\s\S]*?supportPointCount/,
  'P18 bench and lamp must settle from their visible support geometry',
);
assert.match(
  parityHarness,
  /contract\.profileId !== 'p18-visual-target-stylized-basic'/,
  'P18 must not masquerade sealed P13-P17 native captures as shell parity',
);
assert.match(
  parityHarness,
  /const material = new MeshBasicNodeMaterial\(\);[\s\S]*?material\.depthTest = true;[\s\S]*?material\.depthWrite = false;/,
  'the sky must depth-test behind foreground fixtures without writing dome depth',
);
assert.match(
  parityHarness,
  /cloudMaterial\.depthTest = true;[\s\S]*?cloudMaterial\.depthWrite = false;/,
  'background clouds must not write depth over the P18 lamp or other fixtures',
);

const p18 = profiles.profiles.find((profile) =>
  profile.id === 'p18-visual-target-stylized-basic');
assert.ok(p18);
assert.equal(p18.inherits, 'p17-visual-target-flowers');
assert.equal(p18.materialCheckpoint, 'stylized-basic');
assert.deepEqual(p18.changes, ['stylizedBasic']);
assert.deepEqual(
  p18.acceptance.stylizedBasicOnlyIsolation.changedModules,
  ['stylizedBasic'],
);
for (const frozen of [
  'ground',
  'grass',
  'tree',
  'flowers',
  'rock',
  'lighting',
  'sky',
  'clouds',
  'camera',
  'post',
]) {
  assert.ok(
    p18.acceptance.stylizedBasicOnlyIsolation.frozenModules.includes(frozen),
  );
}

console.log('P18 Unreal M_StylizedBasic source-family verification passed');
