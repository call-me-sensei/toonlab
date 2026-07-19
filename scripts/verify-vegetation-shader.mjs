import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { getCurrentStack, setCurrentStack, stack } from 'three/tsl';
import { createGrassNodeMaterial } from '../src/shaders-tsl/grass.js';
import { createTreeLeafNodeMaterial } from '../src/shaders-tsl/tree-leaf.js';
import {
  createFlowerBloomNodeMaterial,
  createFlowerHeadBillboardNodeMaterial,
  createFlowerHeadNodeMaterial,
  createFlowerNodeMaterial,
  createFlowerStemNodeMaterial,
} from '../src/shaders-tsl/flower.js';
import { createWoodySurfaceNodeMaterial } from '../src/shaders-tsl/woody-surface.js';
import { createGrassSettings } from '../src/vegetation/stylizedGrass.js';
import { createFlowerSettings } from '../src/vegetation/stylizedFlowers.js';

import {
  BARK_SHADER,
  DEFAULT_VEGETATION_SHADER_SETTINGS,
  FOLIAGE_SHADER,
  GRASS_SHADER,
  VEGETATION_MATERIAL_ROLES,
  VEGETATION_SHADER_DOCUMENT_TYPE,
  VEGETATION_SHADER_FIELD_SCHEMA,
  VEGETATION_SHADER_UNIFORM_BY_FIELD,
  applyBarkShader,
  applyFlowerShader,
  applyFoliageShader,
  applyGrassShader,
  applyVegetationShader,
  createGrassShaderSettings,
  createVegetationShaderPresetDocument,
  createVegetationShaderSettings,
  getVegetationMaterialContract,
  getVegetationShaderPresetOptions,
  migrateLegacyVegetationShaderDocuments,
  parseVegetationShaderPresetDocument,
  resolveVegetationShaderRoleSettings,
  serializeVegetationShaderPreset,
  tagVegetationMaterial,
} from '../src/vegetation/vegetationShaders.js';

const defaults = createVegetationShaderSettings();
assert.deepEqual(defaults, DEFAULT_VEGETATION_SHADER_SETTINGS,
  'canonical settings must preserve the declared complete defaults');
assert.notEqual(defaults.lighting.shadowTint, DEFAULT_VEGETATION_SHADER_SETTINGS.lighting.shadowTint,
  'resolved color arrays must not mutate frozen defaults');

const clamped = createVegetationShaderSettings({
  bark: { bandCount: 99 },
  grass: { bandSoftness: -4 },
  lighting: { rimPower: 'not-a-number', shadowTint: [0.8, 0.1, 0.9] },
});
assert.equal(clamped.bark.bandCount, 6);
assert.equal(clamped.grass.bandSoftness, 0);
assert.equal(clamped.lighting.rimPower, defaults.lighting.rimPower);
assert.deepEqual(clamped.lighting.shadowTint, [0.8, 0.1, 0.9]);

for (const [groupId, fields] of Object.entries(VEGETATION_SHADER_FIELD_SCHEMA)) {
  for (const [key, field] of Object.entries(fields)) {
    assert.equal(field.uniform, VEGETATION_SHADER_UNIFORM_BY_FIELD[`${groupId}.${key}`]);
    assert.match(field.uniform, /^uStyle[A-Z]/,
      `${groupId}.${key} must publish a canonical style uniform`);
    assert.ok(field.roles.length > 0, `${groupId}.${key} must name its consuming roles`);
  }
}

const document = createVegetationShaderPresetDocument('purple-ip', {
  description: 'Purple vegetation uses material albedo with one shared treatment.',
  label: 'Purple IP',
  settings: { flower: { unlitPetalLift: 0.67 } },
});
const serialized = serializeVegetationShaderPreset(document);
const parsed = parseVegetationShaderPresetDocument(serialized);
assert.equal(parsed.ok, true, parsed.errors.join(' '));
assert.deepEqual(parsed.value, document);
assert.equal(parsed.value.type, VEGETATION_SHADER_DOCUMENT_TYPE);
assert.equal(parsed.value.settings.flower.unlitPetalLift, 0.67);

const warnings = parseVegetationShaderPresetDocument({
  ...document,
  settings: { ...document.settings, mystery: { x: 1 }, grass: { ...document.settings.grass, nope: 2 } },
});
assert.equal(warnings.ok, true);
assert.equal(warnings.warnings.length, 2);
const future = parseVegetationShaderPresetDocument({ ...document, version: 999 });
assert.equal(future.ok, false);
assert.match(future.errors.join(' '), /newer than supported/);

const presetIds = new Set(getVegetationShaderPresetOptions().map((entry) => entry.id));
assert.ok(presetIds.has('default'));
assert.ok(presetIds.has('call_me_sensei'));
assert.equal(createVegetationShaderSettings('call_me_sensei').flower.unlitPetalLift, 0.4);

const grassUniform = VEGETATION_SHADER_UNIFORM_BY_FIELD['grass.backlitStrength'];
const tintUniform = VEGETATION_SHADER_UNIFORM_BY_FIELD['lighting.shadowTint'];
const taggedGrass = tagVegetationMaterial(new THREE.MeshBasicMaterial(), {
  role: VEGETATION_MATERIAL_ROLES.grassBlade,
  variant: 'procedural',
});
taggedGrass.name = 'VerificationGrass';
taggedGrass.uniforms = {
  [grassUniform]: { value: 0 },
  [tintUniform]: { value: new THREE.Color() },
};
const untagged = new THREE.MeshBasicMaterial();
untagged.uniforms = { [grassUniform]: { value: 123 } };
const root = new THREE.Group();
root.add(
  new THREE.Mesh(new THREE.PlaneGeometry(1, 1), taggedGrass),
  new THREE.Mesh(new THREE.PlaneGeometry(1, 1), untagged),
);
const report = applyVegetationShader(root, {
  grass: { backlitStrength: 0.91 },
  lighting: { shadowTint: [0.7, 0.2, 0.9] },
});
assert.equal(report.visited, 2);
assert.equal(report.matched, 1);
assert.equal(report.applied, 1);
assert.equal(report.skipped, 1);
assert.equal(report.roles.grassBlade.matched, 1);
assert.deepEqual(report.roles.grassBlade.variants, ['procedural']);
assert.deepEqual(getVegetationMaterialContract(taggedGrass).roles, ['grassBlade']);
assert.equal(taggedGrass.uniforms[grassUniform].value, 0.91);
assert.deepEqual(taggedGrass.uniforms[tintUniform].value.toArray(),
  new THREE.Color().setRGB(0.7, 0.2, 0.9, THREE.SRGBColorSpace).toArray());
assert.equal(untagged.uniforms[grassUniform].value, 123);
assert.ok(report.unsupported.some((entry) => entry.field === 'grass.bandThreshold'));

const roleSlice = resolveVegetationShaderRoleSettings(VEGETATION_MATERIAL_ROLES.flowerCenter);
assert.ok(roleSlice.flower.centerLightResponse !== undefined);
assert.equal(roleSlice.flower.unlitPetalLift, undefined);
assert.equal(roleSlice.thinSurface, undefined);
const petalRoleSlice = resolveVegetationShaderRoleSettings(VEGETATION_MATERIAL_ROLES.flowerPetal);
assert.ok(petalRoleSlice.thinSurface.diffuseWrap !== undefined);
assert.equal(petalRoleSlice.flower.centerLightResponse, undefined);
assert.throws(() => tagVegetationMaterial(new THREE.MeshBasicMaterial(), { role: 'tree' }), /Unknown/);

const compositeContractMaterial = tagVegetationMaterial(new THREE.MeshBasicMaterial(), {
  role: VEGETATION_MATERIAL_ROLES.flowerPetal,
  roles: [VEGETATION_MATERIAL_ROLES.flowerCenter],
  variant: 'mesh',
});
assert.deepEqual(getVegetationMaterialContract(compositeContractMaterial), {
  role: VEGETATION_MATERIAL_ROLES.flowerPetal,
  roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter],
  variant: 'mesh',
  version: 1,
});

function nodeGraphContains(roots, target) {
  const stack = [...roots];
  const visited = new WeakSet();
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === target) return true;
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    for (const key of Object.keys(value)) {
      let child;
      try { child = value[key]; } catch { continue; }
      if (Array.isArray(child)) stack.push(...child);
      else if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function materialNodeRoots(material) {
  const roots = [
    material.alphaTestNode,
    material.castShadowPositionNode,
    material.colorNode,
    material.fragmentNode,
    material.maskNode,
    material.positionNode,
    material.vertexNode,
  ].filter(Boolean);
  return roots.flatMap((rootNode) => {
    const shaderCall = rootNode?.isShaderCallNodeInternal
      ? rootNode
      : (rootNode?.node?.isShaderCallNodeInternal ? rootNode.node : null);
    if (!shaderCall || shaderCall.rawInputs.length > 0) return [rootNode];
    const previousStack = getCurrentStack();
    const materializedStack = stack();
    let outputNode = null;
    try {
      setCurrentStack(materializedStack);
      outputNode = shaderCall.shaderNode.jsFunc();
    } finally {
      setCurrentStack(previousStack);
    }
    materializedStack.outputNode = outputNode;
    return [rootNode, materializedStack, outputNode].filter(Boolean);
  });
}

function requiredFieldsForMaterial(material) {
  const contract = getVegetationMaterialContract(material);
  return Object.values(VEGETATION_SHADER_FIELD_SCHEMA).flatMap((fields) =>
    Object.values(fields).filter((field) =>
      field.roles.some((role) => contract.roles.includes(role))));
}

// Every shipped material variant must consume every canonical field required
// by its semantic roles. Identity traversal proves the uniform is in the TSL
// graph, rather than merely present in material.uniforms as a decorative slot.
const verificationTexture = new THREE.Texture();
verificationTexture.userData.toonlabFlower = { centerRadius: 0.1 };
const flowerMaterials = [
  createFlowerNodeMaterial(createFlowerSettings(), defaults),
  createFlowerHeadNodeMaterial({ map: verificationTexture, vegetationShader: defaults }),
  createFlowerHeadBillboardNodeMaterial({ map: verificationTexture, vegetationShader: defaults }),
  createFlowerBloomNodeMaterial({ vegetationShader: defaults }),
];
const stemMaterial = createFlowerStemNodeMaterial({ vegetationShader: defaults });
const grassMaterial = createGrassNodeMaterial(createGrassSettings(), defaults);
const shippedMaterials = [
  grassMaterial,
  createTreeLeafNodeMaterial({ leafMap: verificationTexture }, defaults),
  ...flowerMaterials,
  stemMaterial,
  createWoodySurfaceNodeMaterial({ vegetationShader: defaults }),
];
for (const material of flowerMaterials) {
  assert.deepEqual(getVegetationMaterialContract(material).roles, [
    VEGETATION_MATERIAL_ROLES.flowerPetal,
    VEGETATION_MATERIAL_ROLES.flowerCenter,
  ], `${material.name} must declare both semantic flower-head roles`);
}
assert.equal(stemMaterial.uniforms.uStyleThinSurfaceDiffuseWrap, undefined,
  'herbaceous stems must not silently consume the thin-surface profile');
for (const material of shippedMaterials) {
  const roots = materialNodeRoots(material);
  for (const field of requiredFieldsForMaterial(material)) {
    const uniformNode = material.uniforms[field.uniform];
    assert.ok(uniformNode, `${material.name} is missing ${field.id}`);
    assert.ok(nodeGraphContains(roots, uniformNode),
      `${material.name} exposes ${field.id}, but its TSL graph never consumes it`);
  }
  if (material === grassMaterial) {
    assert.ok(nodeGraphContains(roots, material.uniforms.uShadowTint),
      'grass exposes material shadow tint, but its TSL graph never consumes it');
  }
}

for (const uniformName of ['uWetness', 'uSnowCover', 'uWindStrength', 'uSunDirection']) {
  assert.equal(Object.values(VEGETATION_SHADER_UNIFORM_BY_FIELD).includes(uniformName), false,
    `${uniformName} is world/instance state and must not enter the profile contract`);
}
const worldStateBeforeApply = shippedMaterials.map((material) => {
  if (material.uniforms.uWetness) material.uniforms.uWetness.value = 0.37;
  if (material.uniforms.uSnowCover) material.uniforms.uSnowCover.value = 0.61;
  return {
    snowCover: material.uniforms.uSnowCover?.value,
    wetness: material.uniforms.uWetness?.value,
  };
});
const shippedReport = applyVegetationShader(shippedMaterials, clamped);
assert.equal(shippedReport.matched, shippedMaterials.length);
assert.equal(shippedReport.roles.flowerCenter.matched, flowerMaterials.length);
assert.equal(shippedReport.roles.flowerPetal.matched, flowerMaterials.length);
assert.deepEqual(shippedReport.unsupported, [],
  `shipped material contract gaps: ${JSON.stringify(shippedReport.unsupported)}`);
shippedMaterials.forEach((material, index) => {
  assert.equal(material.uniforms.uWetness?.value, worldStateBeforeApply[index].wetness,
    `${material.name} profile application changed scene wetness`);
  assert.equal(material.uniforms.uSnowCover?.value, worldStateBeforeApply[index].snowCover,
    `${material.name} profile application changed scene snow`);
});

const flowerShaderSource = readFileSync(
  new URL('../src/shaders-tsl/flower.js', import.meta.url),
  'utf8',
);
const stemShaderSource = flowerShaderSource.slice(
  flowerShaderSource.indexOf('export function createFlowerStemNodeMaterial'),
);
assert.match(stemShaderSource,
  /mul\(intervals\)\.add\(1e-4\)\)\.div\(intervals\)/,
  'stem band quantization must use bandCount - 1 intervals and remain <= 1');
assert.doesNotMatch(stemShaderSource, /uStyleThinSurface/,
  'stem shader graph must stay independent from thin-surface settings');

const noMatch = applyVegetationShader(new THREE.MeshBasicMaterial(), defaults);
assert.equal(noMatch.matched, 0);
assert.match(noMatch.warnings.join(' '), /No tagged vegetation materials/);

const legacyFoliage = FOLIAGE_SHADER.createDocument('foliage-ip', {
  label: 'Foliage IP',
  settings: { alphaCutoff: 0.22, backlitStrength: 0.62 },
});
const legacyGrass = GRASS_SHADER.createDocument('grass-ip', {
  label: 'Grass IP',
  settings: { pushRadius: 1.4, shadowTint: [0.2, 0.3, 0.8] },
});
const legacyBark = BARK_SHADER.createDocument('bark-ip', {
  label: 'Bark IP',
  settings: { bandCount: 5, shadowFloor: 0.5 },
});
const migrated = migrateLegacyVegetationShaderDocuments({
  bark: legacyBark,
  foliage: legacyFoliage,
  grass: legacyGrass,
}, { id: 'unified-ip', label: 'Unified IP' });
assert.equal(migrated.ok, true, migrated.errors.join(' '));
assert.equal(migrated.value.id, 'unified-ip');
assert.equal(migrated.value.settings.foliage.backlitStrength, 0.62);
assert.equal(migrated.value.settings.bark.bandCount, 5);
assert.deepEqual(migrated.value.settings.lighting.shadowTint, [0.2, 0.3, 0.8]);
assert.ok(migrated.warnings.some((warning) => warning.includes('alphaCutoff')));
assert.ok(migrated.warnings.some((warning) => warning.includes('pushRadius')));
assert.equal('alphaCutoff' in migrated.value.settings.foliage, false);
assert.equal('pushRadius' in migrated.value.settings.grass, false);

// Legacy return values and direct writes remain stable.
assert.deepEqual(createGrassShaderSettings(), {
  backlitStrength: 0.4,
  shadowStrength: 0.7,
  shadowTint: [0.36, 0.4, 0.58],
  cloudShadowStrength: 0.35,
  pushRadius: 0.6,
});
let appliedGrass = null;
const legacyGrassReturn = applyGrassShader({ applySettings(value) { appliedGrass = value; } },
  { backlitStrength: 0.8 });
assert.deepEqual(appliedGrass, legacyGrassReturn);

const foliageMaterial = new THREE.MeshBasicMaterial();
foliageMaterial.uniforms = {
  uAlphaCutoff: { value: 0 },
  uBacklitStrength: { value: 0 },
  uCloudShadowStrength: { value: 0 },
  uSceneShadowStrength: { value: 0 },
};
const foliageRoot = new THREE.Group();
foliageRoot.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), foliageMaterial));
assert.equal(applyFoliageShader(foliageRoot, { alphaCutoff: 0.28 }), 1);
assert.equal(foliageMaterial.uniforms.uAlphaCutoff.value, 0.28);

const flowerMaterial = new THREE.MeshBasicMaterial();
flowerMaterial.uniforms = { uUnlitLift: { value: 0 } };
const flowerRoot = new THREE.Group();
flowerRoot.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flowerMaterial));
assert.equal(applyFlowerShader(flowerRoot, { unlitPetalLift: 0.52 }), 1);
assert.equal(flowerMaterial.uniforms.uUnlitLift.value, 0.52);

const barkMaterial = new THREE.MeshToonMaterial();
const barkRoot = new THREE.Group();
barkRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), barkMaterial));
assert.equal(applyBarkShader(barkRoot, { bandCount: 4 }), 1);
assert.ok(barkMaterial.gradientMap?.isDataTexture);
barkMaterial.gradientMap.dispose();

root.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
foliageRoot.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
flowerRoot.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
barkRoot.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
for (const material of shippedMaterials) material.dispose();
compositeContractMaterial.dispose();
verificationTexture.dispose();

console.log(`vegetation shader verifier passed (${Object.keys(VEGETATION_SHADER_UNIFORM_BY_FIELD).length} canonical fields)`);
