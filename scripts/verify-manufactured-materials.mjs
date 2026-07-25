import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  analyzeManufacturedAsset,
  applyEnvironmentShader,
  applyManufacturedMaterialManifest,
  classifyManufacturedMaterial,
  collectManufacturedMirrorMeshes,
  createEnvironmentPresetDocument,
  createManufacturedMaterialClassification,
  resolveEnvironmentPreset,
  resolveManufacturedMaterialLook,
  validateEnvironmentPresetDocument,
} from '../src/environment/index.js';

function createTestAsset() {
  const root = new THREE.Group();
  root.name = 'ClocktowerBuilding';
  const metal = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.8,
    name: 'M_PaintedSteel',
    roughness: 0.42,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: 'M_WindowGlass',
    roughness: 0.12,
    transmission: 0.85,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(), metal);
  body.name = 'PrimaryFrame';
  const window = new THREE.Mesh(new THREE.PlaneGeometry(), glass);
  window.name = 'Window';
  root.add(body, window);
  return { body, glass, metal, root, window };
}

const inferred = createTestAsset();
assert.equal(classifyManufacturedMaterial(inferred.body, inferred.metal).baseMaterial, 'metal');
assert.equal(classifyManufacturedMaterial(inferred.window, inferred.glass).renderMode, 'transmissive');

const rustyMetal = new THREE.MeshStandardMaterial({
  metalness: 0.9,
  name: 'Bicycle_Rusty',
  roughness: 0.82,
});
const rustyMesh = new THREE.Mesh(new THREE.BoxGeometry(), rustyMetal);
assert.equal(
  classifyManufacturedMaterial(rustyMesh, rustyMetal).finish,
  'raw',
  'Oxidized metal without an explicit coating must not become red paint.',
);
const rustyPaintedMetal = new THREE.MeshStandardMaterial({
  metalness: 0.9,
  name: 'PaintedSteel_Rusted',
  roughness: 0.82,
});
const rustyPaintedMesh = new THREE.Mesh(
  new THREE.BoxGeometry(),
  rustyPaintedMetal,
);
assert.equal(
  classifyManufacturedMaterial(rustyPaintedMesh, rustyPaintedMetal).finish,
  'painted',
  'An explicit painted/coated identity remains authoritative over condition.',
);

const audit = analyzeManufacturedAsset(inferred.root);
assert.equal(audit.objectClass, 'buildingExterior');
assert.equal(audit.summary.materialUseCount, 2);
assert.equal(audit.summary.fallbackCount, 0);

const reflectionAsset = createTestAsset();
reflectionAsset.glass.userData.urbanMaterial =
  createManufacturedMaterialClassification({
    baseMaterial: 'glass',
    finish: 'mirror',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  });
assert.deepEqual(
  collectManufacturedMirrorMeshes(reflectionAsset.root),
  [reflectionAsset.window],
);

const manifest = {
  type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  version: 1,
  assetId: 'clocktower-a',
  objectClass: 'buildingExterior',
  assignments: [
    {
      selector: { materialName: 'M_PaintedSteel' },
      classification: {
        version: 1,
        baseMaterial: 'metal',
        finish: 'painted',
        renderMode: 'opaque',
        structuralRole: 'primaryMass',
        contentFlags: [],
      },
    },
  ],
};
const manifestResult = applyManufacturedMaterialManifest(inferred.root, manifest);
assert.equal(manifestResult.appliedAssignmentCount, 1);
assert.equal(inferred.metal.userData.urbanMaterial.baseMaterial, 'metal');
assert.equal(inferred.root.userData.toonlabAssetId, 'clocktower-a');
assert.equal(classifyManufacturedMaterial(inferred.body, inferred.metal).classificationSource, 'manifest');

const classification = createManufacturedMaterialClassification({
  baseMaterial: 'metal',
  contentFlags: ['graphic'],
  finish: 'painted',
  renderMode: 'opaque',
  structuralRole: 'primaryMass',
});
const look = {
  version: 1,
  default: { parameters: { specularStrength: 0.1 } },
  baseMaterials: { metal: { parameters: { specularStrength: 0.2 } } },
  finishes: { painted: { parameters: { specularStrength: 0.3 } } },
  contentFlags: { graphic: { parameters: { specularStrength: 0.4 } } },
  objectClasses: { buildingExterior: { parameters: { specularStrength: 0.5 } } },
  assets: { 'clocktower-a': { parameters: { specularStrength: 0.6 } } },
};
const resolved = resolveManufacturedMaterialLook(look, {
  assetId: 'clocktower-a',
  classification,
  objectClass: 'buildingExterior',
});
assert.equal(resolved.parameters.specularStrength, 0.6);
assert.deepEqual(resolved.appliedProfiles, [
  'default',
  'baseMaterials.metal',
  'finishes.painted',
  'contentFlags.graphic',
  'objectClasses.buildingExterior',
  'assets.clocktower-a',
]);

const converted = createTestAsset();
converted.metal.userData.urbanMaterial = classification;
const conversion = await applyEnvironmentShader(converted.root, {
  assetId: 'clocktower-a',
  bakeVertexAo: false,
  materialLook: look,
  objectClass: 'buildingExterior',
});
assert.equal(conversion.manufacturedAssetId, 'clocktower-a');
assert.equal(converted.body.material.userData.urbanMaterial.baseMaterial, 'metal');
assert.ok(converted.body.material.userData.manufacturedAppliedProfiles.includes('assets.clocktower-a'));
assert.equal(converted.body.material.uniforms.specularStrength.value, 0.6);

const preset = resolveEnvironmentPreset('call_me_sensei');
assert.ok(preset.materialLook.baseMaterials.metal);
const document = createEnvironmentPresetDocument('call_me_sensei');
assert.equal(document.schemaVersion, 3);
assert.ok(document.preset.materialLook.objectClasses.buildingExterior);
const validated = validateEnvironmentPresetDocument(document);
assert.equal(validated.ok, true, validated.errors.join(' '));
assert.ok(validated.value.materialLook.contentFlags.graphic);

console.log('Manufactured material contract verified.');
