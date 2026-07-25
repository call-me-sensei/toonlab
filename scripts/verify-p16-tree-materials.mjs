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
const leavesGraph = readFileSync(resolve(
  ROOT_DIR,
  'assets-local/sostylized/graphs/M_Leaves.T3D',
), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local/sostylized/material-source/manifest.json',
), 'utf8'));
const contract = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local/sostylized/trees/p16-ue-pine-contract.json',
), 'utf8'));

assert.equal(contract.schema, 'toonlab.p16-ue-pine-contract');
assert.equal(contract.version, 3);
assert.match(contract.engine, /^5\.8\./);
assert.equal(contract.source, '/Game/SoStylized/Environment/Trees/Pine/SM_Pine01.SM_Pine01');
assert.equal(contract.visualTargetActor.label, 'Parity_Tree_SM_Pine01');
assert.equal(contract.visualTargetActor.class, '/Script/Engine.StaticMeshActor');
assert.equal(contract.visualTargetActor.perInstanceRandom, 0);
assert.deepEqual(
  contract.visualTargetActor.locationCm,
  [20001.090883374, -18529.57621749962, 2073.204517364502],
);
assert.equal(
  contract.visualTargetActor.hueVariance.signedCube,
  0.18592436681883504,
);
assert.deepEqual(
  contract.mesh.lodScreenSizes,
  [1, 0.15000000596046448, 0.05000000074505806],
);
assert.deepEqual(
  contract.visualTargetActor.componentLod,
  {
    forced_lod_model: 1,
    min_lod: 0,
  },
);
assert.equal(
  contract.visualTargetActor.componentLod.forced_lod_model,
  1,
  'UE ForcedLodModel 1 means the retained Visual Target is explicitly using LOD0',
);
assert.match(
  sourceContent,
  /function retainedActorPosition\([\s\S]*?attachUeTranslationToRetainedLandscape\([\s\S]*?locationCm,[\s\S]*?heightGrid/,
  'P16 must attach the retained actor to the active P14 Landscape',
);
assert.match(
  sourceContent,
  /function attachUeTranslationToRetainedLandscape\([\s\S]*?const localX = ueY - UE_VISUAL_TARGET_PATCH_XY_METERS\[1\][\s\S]*?const localZ = -\(ueX - UE_VISUAL_TARGET_PATCH_XY_METERS\[0\]\)[\s\S]*?sampleHeightField\(heightGrid, localX, localZ, normalTarget\)/,
  'P16 must share the exact P14 Three X/Z basis and bilinear height sampler',
);
assert.deepEqual(
  contract.mesh.materialSlots.slice(0, 2).map((slot) => slot.slotName),
  ['MI_PineBark', 'MI_PineLeaves'],
);

const barkMetadata = contract.materials.find((entry) => entry.path.endsWith(
  '/MI_PineBark.MI_PineBark',
));
const leavesMetadata = contract.materials.find((entry) => entry.path.endsWith(
  '/MI_PineLeaves.MI_PineLeaves',
));
assert.ok(barkMetadata);
assert.ok(leavesMetadata);
assert.equal(barkMetadata.parent, '/Game/SoStylized/Environment/Trees/Materials/M_Bark.M_Bark');
assert.equal(barkMetadata.scalar.TintMix, 0.15000000596046448);
assert.equal(barkMetadata.scalar.NormalFlatness, 0);
assert.equal(barkMetadata.scalar.RoughMult, 1);
assert.equal(barkMetadata.scalar.Specular, 0.03999999910593033);
assert.equal(barkMetadata.texture['Diffuse Texture'].split('.').at(-1), 'T_PineBark_BC');
assert.equal(barkMetadata.texture['Normal Texture'].split('.').at(-1), 'T_PineBark_N');
assert.equal(barkMetadata.texture['Rough Texture'].split('.').at(-1), 'T_PineBark_R');
assert.deepEqual(
  leavesMetadata.vector['Main Color'].slice(0, 3),
  [0.040915001183748245, 0.13563300669193268, 0.015208999626338482],
);
assert.deepEqual(
  leavesMetadata.vector['Gradient Color'].slice(0, 3),
  [0.07618500292301178, 0.1980690062046051, 0.01680699922144413],
);
assert.equal(leavesMetadata.scalar['SS Strength'], 0.800000011920929);
assert.equal(leavesMetadata.scalar['SS Opacity'], 0.30000001192092896);
assert.equal(leavesMetadata.scalar['Hue Variation'], 0.10000000149011612);
assert.equal(leavesMetadata.texture.LeafTexture.split('.').at(-1), 'T_Leaf_Pine');
assert.equal(
  leavesMetadata.texture['Subsurface Texture'].split('.').at(-1),
  'T_Leaf_Pine_SS',
);
assert.match(
  leavesGraph,
  /LinearInterpolate_0[\s\S]*?MaterialExpressionEditorX/,
  'the exported M_Leaves graph must retain its authored foliage gradient lerp',
);
assert.match(
  leavesGraph,
  /Begin Object Name="MaterialExpressionMultiply_0"[\s\S]*?A=\(Expression="[^"]*MaterialExpressionConstant3Vector_0[^"]*"[\s\S]*?B=\(Expression="[^"]*MaterialExpressionTwoSidedSign_0[^"]*"/,
  'the exported M_Leaves graph must retain +Z * TwoSidedSign',
);
assert.match(
  sourceMaterials,
  /colorNode = mix\(gradientColor, colorNode, gradient\);/,
  'P16 must preserve M_Leaves Lerp(A=Gradient Color, B=Main Color) pin order',
);
assert.match(
  sourceMaterials,
  /material\.normalNode = switchValue\(profile, 'TwoSidedNormals\?', true\)\s*\? normalViewGeometry\s*: normalViewGeometry\.mul\(faceDirection\);/,
  'P16 must preserve the net UE normal after graph and material-boundary TwoSidedSign cancel',
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

const library = new SoStylizedSourceLibrary(manifest, {
  baseUrl: '/p16-verification',
  textureLoader: new VerificationTextureLoader(),
});
const state = createSoStylizedSourceEnvironmentState(library);
const common = {
  hasUv2: true,
  hasVertexColors: true,
  library,
  sourceActorIdentity: contract.visualTargetActor,
  sourceAssetName: 'Demonstration_SnowPines',
  state,
};

const leaves = await createSoStylizedSourceMaterial('MI_PineLeaves', common);
assert.equal(leaves.type, 'MeshSSSNodeMaterial');
assert.equal(leaves.side, THREE.DoubleSide);
assert.equal(leaves.alphaToCoverage, false);
assert.ok(leaves.maskShadowNode);
assert.ok(leaves.normalNode);
assert.ok(leaves.positionNode);
assert.equal(leaves.userData.soStylizedSource.reconstruction, 'source-profile');
assert.equal(leaves.userData.soStylizedSource.contract.alpha, 'LeafTexture.r');
assert.equal(leaves.userData.soStylizedSource.contract.alphaClip, 1 / 3);
assert.equal(leaves.userData.soStylizedSource.contract.gradientUv, 2);
assert.equal(
  leaves.userData.soStylizedSource.contract.textureMipFilter,
  'TEXTUREGROUP_World MinMagFilter=aniso, MipFilter=point, TMGS_SimpleAverage',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.hueVariance,
  'retained-UE-StaticMeshActor-position-plus-zero-PerInstanceRandom',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.shadowMask,
  'source-alpha-without-camera-occlusion-or-perpendicular-trim',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.twoSidedNormal,
  'M_Leaves +Z * TwoSidedSign, then UE material-boundary TwoSidedSign; net authored geometric normal',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.ueMaterialBoundaryNormal,
  'MaterialTemplate.ush: Parameters.WorldNormal *= Parameters.TwoSidedSign',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.ueMaterialTemplateSha256,
  '2d237cc8c53a024341a6a3828a251a655fbc9a266c0a2d7ed7e244be90bf292d',
);
assert.ok(hasAttribute(materialGraph(leaves), 'uv2'));
assert.match(
  sourceMaterials,
  /leafMap\.minFilter = THREE\.LinearMipmapNearestFilter;/,
  'P16 pine opacity must use UE TEXTUREGROUP_World point mip selection',
);
assert.match(
  sourceMaterials,
  /const analyticallyResolvedFullVisibility = retainedPineLeafMask\s*&& opacityMultiply >= 1;/,
  'P16 must resolve the known full-visibility temporal fade instead of exposing one dither frame',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.temporalDither,
  'analytic warmed-TAA full-visibility result; PerInstanceFadeAmount=1 and Opacity Multiply=1',
);
assert.equal(
  leaves.userData.soStylizedSource.contract.transmissionShadow,
  'authored SS Opacity separates thin-card transmission from opaque surface visibility',
);
assert.match(
  subsurfaceLighting,
  /const transmissionVisibility = mix\(1, surfaceVisibility, opacity\);/,
  'P16 must not feed the binary opaque surface shadow directly into thin-card transmission',
);
assert.match(
  parityHarness,
  /contract\.profileId === 'p16-visual-target-tree'[\s\S]*?shadowResolution = usesRetainedPineShadowContract \? 2048 : 1024/,
  'P16 must use the source 2048 shadow resolution without mutating earlier checkpoints',
);
assert.match(
  parityHarness,
  /applyUeDirectionalShadowFilterContract\(light\.shadow, sourceShadowContract\);/,
  'P16 must use the existing UE quality-5 Manual5x5PCF receiver adapter',
);
assert.ok(
  leaves.setupLightingModel() instanceof UeSourceSubsurfaceLightingModel,
  'P16 leaves must retain UE MSM_SUBSURFACE lighting after template cloning',
);

const bark = await createSoStylizedSourceMaterial('MI_PineBark', common);
assert.equal(bark.isMeshPhysicalNodeMaterial, true);
assert.notEqual(bark.type, 'MeshSSSNodeMaterial');
assert.equal(bark.side, THREE.FrontSide);
assert.ok(bark.normalNode);
assert.ok(bark.positionNode);
assert.equal(bark.userData.soStylizedSource.reconstruction, 'source-profile');
assert.equal(
  bark.userData.soStylizedSource.contract.lighting,
  'UE 5.8 legacy Default Lit Lambert + punctual GGX + captured-SkyLight boundary',
);
assert.equal(
  bark.userData.soStylizedSource.contract.tint,
  'lerp(diffuse,TintColor,TintMix)',
);

console.log('P16 retained UE pine material verification passed');
