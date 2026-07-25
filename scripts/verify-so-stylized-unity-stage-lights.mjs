#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';

import { applySoStylizedUnityMegaRendererState } from '../src/environment/soStylizedUnityMegaScene.js';
import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
  unitySrgbToLinear,
} from '../src/environment/soStylizedUnityRendering.js';
import {
  SO_STYLIZED_UNITY_SHADOW_CASTER_PASS_CONTRACT,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT,
  SoStylizedUnityTent7x7ShadowFilter,
  installSoStylizedUnitySceneShadowCasters,
  resolveSoStylizedUnityShadowCasterPass,
} from '../src/environment/soStylizedUnityShadows.js';
import {
  SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE,
  createSoStylizedUnityStageLights,
  decomposeSoStylizedUnityStageDirectLight,
} from '../src/environment/soStylizedUnityStage.js';

const close = (actual, expected, tolerance = 1e-10, label = 'value') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
};

const vectorClose = (actual, expected, tolerance = 1e-10, label = 'vector') => {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => close(
    value,
    expected[index],
    tolerance,
    `${label}[${index}]`,
  ));
};

const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const manifestSource = await readFile(
  new URL('../assets-local/sostylized-unity/mega-scene/scene-manifest.json', import.meta.url),
);
const manifest = JSON.parse(manifestSource);
const generatedShaderManifestSource = await readFile(
  new URL('../assets-local/sostylized-unity/generated-shaders/manifest.json', import.meta.url),
);
const generatedShaderManifest = JSON.parse(generatedShaderManifestSource);
const unityProject = process.env.SO_STYLIZED_UNITY_PROJECT
  ?? fileURLToPath(new URL('../../../../Setup Guide In-Editor Tutorial/', import.meta.url));
const urpCoreSource = await readFile(
  `${unityProject}/Library/PackageCache/com.unity.render-pipelines.universal@e38be786c41e/Runtime/UniversalRenderPipelineCore.cs`,
  'utf8',
);
const threeLightsSource = await readFile(
  new URL('../node_modules/three/src/nodes/accessors/Lights.js', import.meta.url),
  'utf8',
);
const urpAdapterSource = await readFile(
  new URL('../src/environment/soStylizedUnityUrpLighting.js', import.meta.url),
  'utf8',
);

// Pin the exact source artifacts behind the sign and PI conversions.
assert.equal(sha256(manifestSource), SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.manifestSha256);
assert.equal(sha256(urpCoreSource), SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.urpCoreSha256);
assert.equal(sha256(threeLightsSource), SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.threeLightsSha256);
assert.equal(
  sha256(generatedShaderManifestSource),
  SO_STYLIZED_UNITY_SHADOW_CASTER_PASS_CONTRACT.generatedShaderManifestSha256,
);
assert.match(
  urpCoreSource,
  /Vector4 dir = -lightLocalToWorld\.GetColumn\(2\);[\s\S]*?lightPos = new Vector4\(dir\.x, dir\.y, dir\.z, 0\.0f\);/,
  'URP directional light constant is surface-to-light = -Transform.forward',
);
for (const shader of generatedShaderManifest.shaders) {
  assert.equal(
    resolveSoStylizedUnityShadowCasterPass(shader.shaderName),
    shader.passes.some((pass) => (
      pass.subshader === SO_STYLIZED_UNITY_SHADOW_CASTER_PASS_CONTRACT.activeSubshader
      && pass.name === 'ShadowCaster'
    )),
    `${shader.shaderName} active URP ShadowCaster pass`,
  );
}
assert.match(
  threeLightsSource,
  /lightPosition\( light \)\.sub\( lightTargetPosition\( light \) \)/,
  'Three directional light input is position - target (surface-to-light)',
);
assert.match(urpAdapterSource, /THREE_LAMBERT_INPUT_SCALE_INVERSE\s*=\s*1\s*\/\s*Math\.PI/);
assert.match(
  urpAdapterSource,
  /directNormalization:\s*THREE_LAMBERT_INPUT_SCALE_INVERSE/,
  'Unity-stage URP adapter removes the Stage PI input conversion exactly once',
);

// The manifest light and transform are the direct-light authority.
const sourceLight = manifest.lights[SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.lightIndex];
const lightNode = manifest.nodes[SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.lightNode];
assert.equal(sourceLight.node, SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.lightNode);
assert.equal(lightNode.hierarchyPath, SO_STYLIZED_UNITY_STAGE_LIGHT_SOURCE.hierarchyPath);
assert.equal(sourceLight.type, 'Directional');
assert.equal(sourceLight.enabled, true);
assert.equal(sourceLight.intensity, 1.5);
assert.deepEqual(sourceLight.color, [1, 0.9443990588188171, 0.8443396091461182, 1]);
assert.equal(sourceLight.shadows, 'Soft');
assert.equal(sourceLight.shadowStrength, 1);
assert.equal(sourceLight.shadowResolution, 'High');
close(sourceLight.shadowNearPlane, 0.10000000149011612, 0, 'manifest shadow near');

const unityRayFromQuaternion = new THREE.Vector3(0, 0, 1).applyQuaternion(
  new THREE.Quaternion(...lightNode.worldRotation).normalize(),
);
vectorClose(
  unityRayFromQuaternion.toArray(),
  SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.rayDirectionUnity,
  5e-8,
  'Unity Transform.forward',
);
const threeRayFromUnity = unityRayFromQuaternion.clone();
threeRayFromUnity.z *= -1;
vectorClose(
  threeRayFromUnity.toArray(),
  SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.rayDirection,
  5e-8,
  'Unity-to-glTF reflected ray',
);

vectorClose(
  unitySrgbToLinear(sourceLight.color.slice(0, 3)),
  SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.colorLinear,
  1e-14,
  'linear sun color',
);
const direct = decomposeSoStylizedUnityStageDirectLight();
vectorClose(
  direct.surfaceToLightDirection,
  direct.rayDirection.map((channel) => -channel),
  0,
  'surface-to-light sign',
);
vectorClose(
  direct.unityFinalColorLinear,
  SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.colorLinear.map((channel) => channel * 1.5),
  1e-14,
  'Unity VisibleLight.finalColor',
);
close(direct.threeInputIntensity, 1.5 * Math.PI, 0, 'Three light PI input');
vectorClose(
  direct.threeInputRadianceLinear,
  direct.unityFinalColorLinear.map((channel) => channel * Math.PI),
  1e-14,
  'PI-scaled analytic-light input',
);
vectorClose(
  direct.urpAdapterRadianceLinear,
  direct.unityFinalColorLinear,
  1e-14,
  'URP adapter recovered radiance',
);
assert.throws(
  () => decomposeSoStylizedUnityStageDirectLight({ rayDirection: [0, 0, 0] }),
  /rayDirection must be non-zero/,
);

// Runtime integration: direct-light sign, PI/color inputs, CSM contract, and
// independent cast/receive/self-shadow eligibility.
const stageRoot = new THREE.Group();
stageRoot.add(new THREE.DirectionalLight(), new THREE.AmbientLight());
const selfMaterial = new MeshPhysicalNodeMaterial();
const receiverMaterial = new MeshPhysicalNodeMaterial();
const casterMaterial = new MeshPhysicalNodeMaterial();
const unsupportedMaterial = new THREE.MeshStandardMaterial();
const addMesh = (name, material, castShadow, receiveShadow) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  stageRoot.add(mesh);
  return mesh;
};
addMesh('self', selfMaterial, true, true);
addMesh('receiver-only', receiverMaterial, false, true);
addMesh('caster-only', casterMaterial, true, false);
addMesh('unsupported-self', unsupportedMaterial, true, true);

const stage = createSoStylizedUnityStageLights(stageRoot, { target: [3, 4, 5] });
assert.equal(stage.importedLightCountRemoved, 2);
vectorClose(stage.light.color.toArray(), direct.threeInputColorLinear, 1e-14, 'runtime sun color');
close(stage.light.intensity, direct.threeInputIntensity, 0, 'runtime sun intensity');
const runtimeSurfaceToLight = stage.light.position.clone()
  .sub(stage.light.target.position)
  .normalize();
const runtimeRay = stage.light.target.position.clone()
  .sub(stage.light.position)
  .normalize();
vectorClose(runtimeSurfaceToLight.toArray(), direct.surfaceToLightDirection, 1e-14,
  'Three runtime surface-to-light');
vectorClose(runtimeRay.toArray(), direct.rayDirection, 1e-14, 'Three runtime ray');
assert.equal(stage.light.castShadow, true);
assert.equal(stage.light.shadow.camera.near, SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.nearPlane);
assert.equal(stage.light.shadow.camera.far, SO_STYLIZED_UNITY_SHADOW_CONTRACT.distance * 2);
assert.equal(stage.light.shadow.bias, 0);
assert.equal(stage.light.shadow.normalBias, 0);
assert.equal(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.shadows.mainResolution,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.atlasResolution,
);
assert.equal(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.shadows.cascadeTileResolution,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.cascadeTileResolution,
);
assert.deepEqual(stage.light.shadow.mapSize.toArray(), [1024, 1024]);
assert.equal(stage.light.shadow.filterNode, SoStylizedUnityTent7x7ShadowFilter);
assert.equal(stage.cascadedShadows[0].cascades, 4);
assert.equal(stage.cascadedShadows[0].maxFar, 50);
assert.equal(stage.cascadedShadows[0].mode, 'custom');
assert.deepEqual(stage.cascadedShadows[0].userData.soStylizedUnity.cascadeSplits,
  [0.12299999, 0.2926, 0.53599995, 1]);
assert.deepEqual(stage.cascadedShadows[0].userData.soStylizedUnity.exact.effectiveBias,
  SO_STYLIZED_UNITY_SHADOW_CONTRACT.effectiveBias);
assert.equal(stage.casterReport.meshCount, 4);
assert.equal(stage.casterReport.casterMeshCount, 3);
assert.equal(stage.casterReport.receiverMeshCount, 3);
assert.equal(stage.casterReport.selfShadowEligibleMeshCount, 2);
assert.equal(stage.casterReport.casterMaterialCount, 3);
assert.equal(stage.casterReport.installedMaterialCount, 2);
assert.equal(stage.casterReport.unsupportedCasterMaterialCount, 1);
assert.equal(selfMaterial.castShadowPositionNode?.isNode, true);
assert.equal(casterMaterial.castShadowPositionNode?.isNode, true);
assert.equal(receiverMaterial.castShadowPositionNode, null);
assert.equal(stageRoot.userData.soStylizedUnityStageLights.shadowEnabled, true);
assert.deepEqual(
  stage.light.userData.soStylizedUnity.directLight.unityFinalColorLinear,
  direct.unityFinalColorLinear,
);

const selfCasterNode = selfMaterial.castShadowPositionNode;
const repeatedBinding = installSoStylizedUnitySceneShadowCasters(stageRoot, {
  directionToLight: stage.directionToLight,
});
assert.equal(repeatedBinding.reusedMaterialCount, 2);
assert.equal(repeatedBinding.installedMaterialCount, 0);
assert.equal(selfMaterial.castShadowPositionNode, selfCasterNode,
  'repeated gate application must not stack caster bias');
assert.throws(
  () => installSoStylizedUnitySceneShadowCasters(stageRoot, {
    directionToLight: [0, 1, 0],
  }),
  /already bound to a different directionToLight/,
);

// Exact renderer-state fixture counts. Empty placeholder RendererRecords must
// not hide parents or overwrite descendant cast/receive state.
const syntheticRoot = new THREE.Group();
const sharedGeometry = new THREE.BufferGeometry();
const sharedMaterial = new THREE.MeshBasicMaterial();
const objects = manifest.nodes.map((record) => {
  const object = record.gltfMesh >= 0
    ? new THREE.Mesh(sharedGeometry, sharedMaterial)
    : new THREE.Group();
  object.name = record.name;
  object.userData.unityNode = record.index;
  return object;
});
for (const record of manifest.nodes) {
  const object = objects[record.index];
  if (record.parent >= 0) objects[record.parent].add(object);
  else syntheticRoot.add(object);
}
const rendererReport = applySoStylizedUnityMegaRendererState(syntheticRoot, manifest);
assert.equal(rendererReport.objectCount, manifest.nodes.length);
assert.equal(rendererReport.rendererCount, 1195);
assert.equal(rendererReport.skippedEmptyRendererRecordCount, 360);
assert.equal(rendererReport.shadowCastingModeRendererCount, 1042);
assert.equal(rendererReport.rendererWithoutShadowCasterPassCount, 3);
assert.equal(rendererReport.casterRendererCount, 1039);
assert.equal(rendererReport.receiverRendererCount, 1195);
assert.equal(rendererReport.selfShadowRendererCount, 1039);
assert.equal(rendererReport.rendererMeshCount, 1195);
assert.deepEqual(syntheticRoot.userData.soStylizedUnityRendererState, rendererReport);

const onRecord = manifest.nodes.find((record) => (
  record.gltfMesh >= 0 && record.renderer?.shadowCastingMode === 'On'
  && record.renderer.materialIndices.some((materialIndex) => (
    resolveSoStylizedUnityShadowCasterPass(
      manifest.materials[materialIndex]?.shaderName,
    ) === true
  ))
));
const onWithoutPassRecord = manifest.nodes.find((record) => (
  record.gltfMesh >= 0 && record.renderer?.shadowCastingMode === 'On'
  && record.renderer.materialIndices.every((materialIndex) => (
    resolveSoStylizedUnityShadowCasterPass(
      manifest.materials[materialIndex]?.shaderName,
    ) === false
  ))
));
const offRecord = manifest.nodes.find((record) => (
  record.gltfMesh >= 0 && record.renderer?.shadowCastingMode === 'Off'
));
assert(onRecord && onWithoutPassRecord && offRecord,
  'fixture must contain effective, no-pass, and Off renderers');
assert.equal(objects[onRecord.index].castShadow, true);
assert.equal(objects[onRecord.index].receiveShadow, true);
assert.equal(objects[onRecord.index].userData.soStylizedUnityRenderer.selfShadowEligible, true);
assert.equal(objects[offRecord.index].castShadow, false);
assert.equal(objects[offRecord.index].receiveShadow, true);
assert.equal(objects[offRecord.index].userData.soStylizedUnityRenderer.selfShadowEligible, false);
assert.equal(objects[onWithoutPassRecord.index].castShadow, false);
assert.equal(objects[onWithoutPassRecord.index].receiveShadow, true);
assert.equal(
  objects[onWithoutPassRecord.index].userData.soStylizedUnityRenderer
    .shadowCasterPass.hasPass,
  false,
);
const emptyActiveParent = manifest.nodes.find((record) => (
  record.activeInHierarchy !== false
  && !String(record.renderer?.type ?? '').trim()
  && (record.children ?? []).length > 0
));
assert(emptyActiveParent, 'fixture must contain an active non-renderer parent');
assert.equal(objects[emptyActiveParent.index].visible, true,
  'empty renderer placeholder must not disable a hierarchy');

// A later parent record must not overwrite a nested Unity renderer. Only
// primitive meshes owned by the parent GLTF node inherit its renderer state.
const boundaryRoot = new THREE.Group();
const parentNode = new THREE.Group();
parentNode.userData.unityNode = 0;
const ownedPrimitive = new THREE.Mesh(sharedGeometry, sharedMaterial);
parentNode.add(ownedPrimitive);
const nestedRenderer = new THREE.Mesh(sharedGeometry, sharedMaterial);
nestedRenderer.userData.unityNode = 1;
parentNode.add(nestedRenderer);
boundaryRoot.add(parentNode);
applySoStylizedUnityMegaRendererState(boundaryRoot, {
  materials: [{ shaderName: 'Universal Render Pipeline/Lit' }],
  nodes: [
    {
      activeInHierarchy: true,
      index: 1,
      renderer: {
        enabled: true,
        forceRenderingOff: false,
        materialIndices: [0],
        receiveShadows: true,
        shadowCastingMode: 'Off',
        type: 'UnityEngine.MeshRenderer',
      },
    },
    {
      activeInHierarchy: true,
      index: 0,
      renderer: {
        enabled: true,
        forceRenderingOff: false,
        materialIndices: [0],
        receiveShadows: true,
        shadowCastingMode: 'On',
        type: 'UnityEngine.MeshRenderer',
      },
    },
  ],
});
assert.equal(ownedPrimitive.castShadow, true);
assert.equal(nestedRenderer.castShadow, false,
  'parent renderer state must stop at a nested exported Unity node');

console.log('So Stylized Unity direct-light and shadow integration gate verified.');
console.log('Direct: Transform.forward ray -> reflected Three ray -> negated surface-to-light.');
console.log('Energy: exact linear Light.color * 1.5, PI input, one adapter PI removal.');
console.log('Shadows: effective .1/.5 caster bias, 4x1024 CSM, 50m range, High 7x7 filter.');
console.log('Renderers: 1195 actual; 1042 casting modes, 1039 active ShadowCaster passes.');
console.log('Receivers: all 1195; 1039 self-shadow, 153 mode-Off + 3 no-pass receive-only.');
