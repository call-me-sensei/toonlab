#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARITY = path.join(ROOT, 'assets-local/parity/single-rock');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

const registry = await json(path.join(PARITY, 'profiles.json'));
const profiles = new Map(registry.profiles.map((profile) => [profile.id, profile]));
const contractFor = async (id) => json(path.join(PARITY, profiles.get(id).path, 'contract.json'));
const p01 = await contractFor('p01-author-light');
const p02 = await contractFor('p02-visual-target-sun');
const p03 = await contractFor('p03-visual-target-skylight');
const p04 = await contractFor('p04-visual-target-bare-sky');
const p05 = await contractFor('p05-visual-target-fixed-exposure');
const p06 = await contractFor('p06-visual-target-radiometric-bridge');
const p07 = await contractFor('p07-visual-target-default-lit-bridge');
const p08 = await contractFor('p08-visual-target-native-rock-graph');
const p09 = await contractFor('p09-visual-target-native-rock-attributes');
const p10 = await contractFor('p10-visual-target-normal-response-bridge');
const p11 = await contractFor('p11-visual-target-ue-authority');
const p12 = await contractFor('p12-ue-authored-rock-bake');
const p13 = await contractFor('p13-ue-authored-background-clouds');
const target = await json(path.join(PARITY, 'source-references/ue-documented/level-report.json'));
const shFile = path.join(
  ROOT,
  'assets-local/sostylized/demo-scenes/native-reference/sky-light-irradiance.json',
);
const sh = await json(shFile);
const [
  parityMain,
  parityHtml,
  parityCss,
  surfaceMaterialModes,
  unityRockMaterial,
  sourceEnvironmentMaterials,
] = await Promise.all([
  readFile(path.join(ROOT, 'examples/tri-engine-parity/main.js'), 'utf8'),
  readFile(path.join(ROOT, 'examples/tri-engine-parity/index.html'), 'utf8'),
  readFile(path.join(ROOT, 'examples/tri-engine-parity/style.css'), 'utf8'),
  readFile(path.join(ROOT, 'src/environment/surfaceMaterialModes.js'), 'utf8'),
  readFile(path.join(ROOT, 'src/rockgen/reference/unityRockMaterial.js'), 'utf8'),
  readFile(path.join(ROOT, 'src/environment/soStylizedSourceMaterials.js'), 'utf8'),
]);

assert.equal(profiles.get('p02-visual-target-sun')?.inherits, 'p01-author-light');
assert.deepEqual(profiles.get('p02-visual-target-sun')?.changes, ['directSunEnergy']);
assert.equal(profiles.get('p03-visual-target-skylight')?.inherits, 'p02-visual-target-sun');
assert.deepEqual(profiles.get('p03-visual-target-skylight')?.changes, ['skylight']);
assert.equal(profiles.get('p04-visual-target-bare-sky')?.inherits, 'p03-visual-target-skylight');
assert.deepEqual(profiles.get('p04-visual-target-bare-sky')?.changes, ['skyBackground']);
assert.equal(
  profiles.get('p05-visual-target-fixed-exposure')?.inherits,
  'p04-visual-target-bare-sky',
);
assert.deepEqual(
  profiles.get('p05-visual-target-fixed-exposure')?.changes,
  ['displayTransfer'],
);
assert.equal(
  profiles.get('p06-visual-target-radiometric-bridge')?.inherits,
  'p05-visual-target-fixed-exposure',
);
assert.deepEqual(
  profiles.get('p06-visual-target-radiometric-bridge')?.changes,
  ['engineRadiometricBoundary'],
);
assert.equal(
  profiles.get('p07-visual-target-default-lit-bridge')?.inherits,
  'p06-visual-target-radiometric-bridge',
);
assert.deepEqual(
  profiles.get('p07-visual-target-default-lit-bridge')?.changes,
  ['surfaceLightingModel'],
);
assert.equal(
  profiles.get('p08-visual-target-native-rock-graph')?.inherits,
  'p07-visual-target-default-lit-bridge',
);
assert.deepEqual(
  profiles.get('p08-visual-target-native-rock-graph')?.changes,
  ['authoredRockMaterialGraph'],
);
assert.equal(
  profiles.get('p09-visual-target-native-rock-attributes')?.inherits,
  'p08-visual-target-native-rock-graph',
);
assert.deepEqual(
  profiles.get('p09-visual-target-native-rock-attributes')?.changes,
  ['rockVertexAttributes'],
);
assert.equal(
  profiles.get('p10-visual-target-normal-response-bridge')?.inherits,
  'p09-visual-target-native-rock-attributes',
);
assert.deepEqual(
  profiles.get('p10-visual-target-normal-response-bridge')?.changes,
  ['normalResponseBridge'],
);
assert.equal(
  profiles.get('p11-visual-target-ue-authority')?.inherits,
  'p06-visual-target-radiometric-bridge',
);
assert.deepEqual(
  profiles.get('p11-visual-target-ue-authority')?.changes,
  ['unrealComparisonAuthority'],
);
assert.equal(
  profiles.get('p12-ue-authored-rock-bake')?.inherits,
  'p11-visual-target-ue-authority',
);
assert.deepEqual(
  profiles.get('p12-ue-authored-rock-bake')?.changes,
  ['authoredCliffNormal4096', 'rockVertexAttributes', 'stylizedAtlasRendererResponse'],
);
assert.equal(
  profiles.get('p13-ue-authored-background-clouds')?.inherits,
  'p12-ue-authored-rock-bake',
);
assert.deepEqual(
  profiles.get('p13-ue-authored-background-clouds')?.changes,
  ['backgroundClouds', 'cloudShell'],
);

function stripSunEnergyDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.sun.color;
  delete value.sun.intensity;
  delete value.sun.intensityAuthority;
  delete value.sun.engineIntensityAdapterRequired;
  delete value.sun.toonlabInputAdapter;
  return value;
}

assert.deepEqual(
  stripSunEnergyDelta(p02),
  stripSunEnergyDelta(p01),
  'P02 changed a field outside the declared direct-sun-energy module.',
);

const targetSun = target.sourceEnvironment.directionalLight;
assert.deepEqual(targetSun.lightColorSrgb8, [255, 255, 255, 255]);
assert.equal(targetSun.intensity, 8);
assert.deepEqual(p02.sun.color, [1, 1, 1, 1]);
assert.equal(p02.sun.intensity, targetSun.intensity);
assert.deepEqual(p02.sun.worldRotationQuaternion, p01.sun.worldRotationQuaternion);
assert.equal(p02.sun.toonlabInputAdapter, 'ue-captured-scene-sh');

function stripSkyLightDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.skyLight;
  delete value.render.ambientModel;
  delete value.render.ambientColor;
  delete value.render.ambientIntensity;
  delete value.render.ambientSource;
  return value;
}

assert.deepEqual(
  stripSkyLightDelta(p03),
  stripSkyLightDelta(p02),
  'P03 changed a field outside the declared captured-skylight module.',
);

assert.equal(sh.schema, 'toonlab.ue-skylight-irradiance');
assert.equal(await sha256(shFile), p03.skyLight.sourceArtifactSha256);
assert.deepEqual(p03.skyLight.threeCoefficients, sh.threeCoefficients);
assert.deepEqual(p03.skyLight.unrealCoefficients, sh.unrealCoefficients);
assert.equal(p03.skyLight.sourceComponent, sh.component);
assert.equal(p03.skyLight.sourceApi, sh.source);

const targetSkyLight = target.sourceEnvironment.skyLight;
assert.deepEqual(p03.skyLight.colorSrgb8, targetSkyLight.lightColorSrgb8);
assert.equal(p03.skyLight.intensity, targetSkyLight.intensity);
assert.equal(p03.skyLight.lowerHemisphereIsBlack, targetSkyLight.lowerHemisphereIsBlack);
assert.deepEqual(
  p03.skyLight.lowerHemisphereColorLinear,
  targetSkyLight.lowerHemisphereColorLinear,
);
assert.equal(p03.render.fog, false);
assert.equal(p03.render.postProcessing, false);
assert.equal(p03.render.bloom, false);
assert.equal(p03.render.colorGrading, false);

function stripSkyBackgroundDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.sky;
  delete value.acceptance.requiredNumericProbes;
  return value;
}

assert.deepEqual(
  stripSkyBackgroundDelta(p04),
  stripSkyBackgroundDelta(p03),
  'P04 changed a field outside the declared visible-sky module.',
);
const atlasReportFile = path.join(
  PARITY,
  'source-references/ue-documented/sky-atlas/report.json',
);
const atlasReport = await json(atlasReportFile);
const atlasFile = path.join(path.dirname(atlasReportFile), 'Atlas_Sky.exr');
assert.equal(atlasReport.schema, 'toonlab.ue-visual-target-sky-atlas');
assert.equal(atlasReport.source.textureWidth, 256);
assert.equal(atlasReport.source.textureHeight, 40);
assert.equal(atlasReport.source.curveRow, 0);
assert.equal(atlasReport.source.srgb, false);
assert.equal(await sha256(atlasFile), p04.sky.atlasSha256);
assert.equal(p04.sky.atlasWidth, atlasReport.source.textureWidth);
assert.equal(p04.sky.atlasHeight, atlasReport.source.textureHeight);
assert.equal(p04.sky.curveRow, atlasReport.source.curveRow);
assert.equal(
  p04.sky.toonlabExrStorageRow,
  p04.sky.atlasHeight - 1 - p04.sky.curveRow,
  'The top-down OpenEXR scanline adapter must preserve the source curve row.',
);
assert.equal(p04.sky.toonlabExrSampleV, '1 - ((curveRow + 0.5) / height)');
assert.equal(p04.sky.unityRawStorageRow, p04.sky.curveRow);
assert.equal(p04.sky.unityExrSampleV, '(curveRow + 0.5) / height');
assert.equal(p04.sky.backgroundClouds, false);
assert.equal(p04.sky.cloudShell, false);
assert.deepEqual(p04.sky.skySourceComponentScale, [100, 100, 100]);
assert.equal(p04.sky.skySourceUnitsToMeters, 0.01);
assert.equal(p04.sky.toonlabCameraFarMeters, 2_000_000);
assert.ok(p04.acceptance.requiredNumericProbes.includes('sky-background'));
assert.equal(p04.render.fog, false);
assert.equal(p04.render.postProcessing, false);

function stripDisplayTransferDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.post;
  delete value.render.postProcessing;
  delete value.render.colorGrading;
  return value;
}

assert.deepEqual(
  stripDisplayTransferDelta(p05),
  stripDisplayTransferDelta(p04),
  'P05 changed a field outside the declared display-transfer module.',
);
assert.equal(p05.render.postProcessing, true);
assert.equal(p05.render.colorGrading, true);
assert.equal(p05.render.bloom, false);
assert.equal(p05.render.vignette, false);
assert.equal(p05.render.fog, false);
assert.equal(p05.render.temporalAA, false);
assert.equal(p05.render.ambientOcclusion, false);
assert.equal(p05.post.fixedExposure.minimumEv100, 1);
assert.equal(p05.post.fixedExposure.maximumEv100, 1);
assert.equal(p05.post.fixedExposure.biasEv, 1);
assert.equal(p05.post.fixedExposure.multiplier, 1);
assert.deepEqual(p05.post.effectiveGlobalSaturationRgb, [1.21, 1.21, 1.21]);
assert.equal(p05.post.postProcessSettings.film_slope, 1);
assert.equal(p05.post.postProcessSettings.film_toe, 0.30000001192092896);
assert.equal(p05.post.postProcessSettings.film_shoulder, 1);
assert.equal(p05.post.outputTransfer.mode, 'SDR_ExplicitGammaMapping');
assert.equal(p05.post.outputTransfer.displayGamma, 2.2);
assert.equal(p05.post.outputTransfer.tonemapperGamma, 0);
assert.match(parityMain, /createUeSourceToneMapping/);
assert.match(parityMain, /UE_SOURCE_TONE_MAPPING/);
assert.match(parityMain, /THREE\.LinearSRGBColorSpace/);

function stripRadiometricBoundaryDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.engineAdapters;
  return value;
}

assert.deepEqual(
  stripRadiometricBoundaryDelta(p06),
  stripRadiometricBoundaryDelta(p05),
  'P06 changed a field outside the declared engine-radiometric-boundary module.',
);
const inversePi = 1 / Math.PI;
assert.equal(p06.engineAdapters.unity.mode, 'ue-default-lit-to-urp-no-pi');
assert.ok(
  Math.abs(p06.engineAdapters.unity.directRadianceMultiplier - inversePi) < 1e-15,
);
assert.ok(
  Math.abs(p06.engineAdapters.unity.diffuseSkyIrradianceMultiplier - inversePi) < 1e-15,
);
assert.equal(p06.engineAdapters.unreal.directRadianceMultiplier, 1);
assert.equal(p06.engineAdapters.toonlab.directRadianceMultiplier, 1);

function stripSurfaceLightingDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.engineAdapters.toonlab;
  return value;
}

assert.deepEqual(
  stripSurfaceLightingDelta(p07),
  stripSurfaceLightingDelta(p06),
  'P07 changed a field outside the declared surface-lighting-model module.',
);
assert.equal(
  p07.engineAdapters.toonlab.surfaceLightingModel,
  'ue-5.8-legacy-default-lit',
);
assert.equal(p07.engineAdapters.toonlab.specularInput, 0.5);

function stripAuthoredRockGraphDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.engineAdapters.toonlab.surfaceMaterialGraph;
  delete value.engineAdapters.toonlab.sourceMaterial;
  delete value.engineAdapters.toonlab.normalResponseBridge;
  delete value.engineAdapters.toonlab.implementation;
  return value;
}

assert.deepEqual(
  stripAuthoredRockGraphDelta(p08),
  stripAuthoredRockGraphDelta(p07),
  'P08 changed a field outside the declared authored-rock-material module.',
);
assert.equal(p08.engineAdapters.toonlab.surfaceMaterialGraph, 'ue-m-rock');
assert.equal(p08.engineAdapters.toonlab.normalResponseBridge, 0);
assert.equal(
  p08.engineAdapters.toonlab.sourceMaterial,
  p08.rock.unreal.material,
);
assert.match(parityMain, /loadRockReferenceSourceMaterialProfile/);
assert.match(parityMain, /material\.ueSourceSpecularNode/);

function stripRockAttributeDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.engineAdapters.toonlab.rockAttributeSource;
  delete value.engineAdapters.toonlab.rockAttributeBasisAdapter;
  return value;
}

assert.deepEqual(
  stripRockAttributeDelta(p09),
  stripRockAttributeDelta(p08),
  'P09 changed a field outside the declared rock-vertex-attribute module.',
);
assert.equal(p09.engineAdapters.toonlab.rockAttributeSource, 'ue-static-mesh-gltf');
assert.match(parityMain, /sourceGeometry\.applyMatrix4/);

function stripNormalResponseDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.engineAdapters.toonlab.normalResponseBridge;
  return value;
}

assert.deepEqual(
  stripNormalResponseDelta(p10),
  stripNormalResponseDelta(p09),
  'P10 changed a field outside the declared normal-response module.',
);
assert.equal(p09.engineAdapters.toonlab.normalResponseBridge, 0);
assert.equal(p10.engineAdapters.toonlab.normalResponseBridge, 0.75);

function stripUnrealComparisonAuthorityDelta(source) {
  const value = structuredClone(source);
  delete value.profileId;
  delete value.description;
  delete value.engineAdapters.unreal;
  return value;
}

assert.deepEqual(
  stripUnrealComparisonAuthorityDelta(p11),
  stripUnrealComparisonAuthorityDelta(p06),
  'P11 changed a field outside the declared Unreal comparison-authority module.',
);
assert.equal(p11.engineAdapters.unreal.mode, 'retained-visual-target-authority');
for (const mode of ['off', 'hard']) {
  const retainedTarget = path.join(
    PARITY,
    `source-references/ue-documented/unreal-author-light-shadow-${mode}.png`,
  );
  const p11Unreal = path.join(
    PARITY,
    `profiles/p11-visual-target-ue-authority/unreal/unreal-shadow-${mode}.png`,
  );
  assert.equal(
    await sha256(p11Unreal),
    await sha256(retainedTarget),
    `P11 Unreal ${mode} capture must be byte-identical to the Visual Target.`,
  );
}
assert.match(parityMain, /retained-visual-target-authority/);

assert.equal(p12.rock.toonlab.sourceStylizedNormal.endsWith('T_RockClassicCliffs_N.png'), true);
assert.equal(p12.engineAdapters.toonlab.stylizedNormalStrength, 1);
assert.equal(p12.engineAdapters.toonlab.stylizedNormalResponseBridge, 0.35);
assert.equal(p12.engineAdapters.toonlab.projectedCrackNormalStrength, 1);
assert.equal(p11.sky.toonlabCameraFarMeters, 2_000_000);
assert.equal(p12.sky.toonlabCameraFarMeters, 2_000_000);
assert.equal(p13.sky.toonlabCameraFarMeters, 2_000_000);
assert.equal(p13.sky.unityCameraFarMeters, 2_000_000);
assert.equal(p13.sky.toonlabUeGltfBasisYawDegrees, 90);
assert.equal(p13.sky.unityUeGltfBasisYawDegrees, -90);
assert.match(parityMain, /debugStylizedBridge/);
assert.match(parityMain, /author-scale sky dome radius/);
assert.match(parityMain, /radiusToFarRatio/);
assert.equal(p13.sky.backgroundClouds, true);
assert.equal(p13.sky.cloudShell, true);
assert.equal(p13.sky.backgroundCloudTextureDimensions.join('x'), '8192x4096');
assert.equal(p13.sky.cloudShellTextureDimensions.join('x'), '8192x1024');
assert.equal(p13.sky.cloudShellAtlasWidth, 256);
assert.equal(p13.sky.cloudShellAtlasHeight, 26);
assert.equal(p13.sky.cloudShellCurveRow, 0);
assert.equal(p13.sky.cloudShellStrength, 2);
assert.equal(p13.sky.cloudShellAlphaClip, 1 / 3);
const assetFile = (url) => path.join(ROOT, url.replace(/^\//, ''));
for (const [url, expected] of [
  [p13.sky.backgroundCloudTexture, p13.sky.backgroundCloudTextureSha256],
  [p13.sky.cloudShellMesh, p13.sky.cloudShellMeshSha256],
  [p13.sky.cloudShellTexture, p13.sky.cloudShellTextureSha256],
  [p13.sky.cloudShellAtlas, p13.sky.cloudShellAtlasSha256],
  [p13.sky.cloudShellDitherNoiseTexture, p13.sky.cloudShellDitherNoiseTextureSha256],
]) {
  assert.equal(await sha256(assetFile(url)), expected, `P13 source hash changed: ${url}`);
}
const p13UnityValidation = await json(path.join(
  PARITY,
  'profiles/p13-ue-authored-background-clouds/unity/visible-sky-validation.json',
));
assert.equal(p13UnityValidation.captureAllowed, true);
assert.equal(p13UnityValidation.backgroundClouds, true);
assert.equal(p13UnityValidation.cloudShell, true);
assert.equal(p13UnityValidation.ueGltfBasisYawDegrees, -90);
assert.match(parityMain, /ueSourceDitherTemporalAA\(cloudSample\.a/);
assert.match(parityMain, /cloudSample\.r/);

assert.match(parityMain, /new OrbitControls\(camera, renderer\.domElement\)/);
assert.match(parityMain, /controls\.enableRotate = true/);
assert.match(parityMain, /controls\.enablePan = true/);
assert.match(parityMain, /controls\.enableZoom = true/);
assert.match(parityMain, /view === 'live'/);
assert.match(parityMain, /createShaderSwipeMaterialSet\(shaderTarget\)/);
assert.match(parityMain, /return \[sourceEnvironmentContent\.group, roots\.rockRoot\]/);
assert.match(parityMain, /resolveSurfaceMaterialMode\(source, mode\)/);
assert.match(parityMain, /material\.positionNode = null/);
assert.match(parityMain, /shaderSwipe\.position = percentage \/ 100/);
assert.match(parityMain, /renderer\.setScissor\(0, 0, beforeWidth, renderSize\.y\)/);
assert.match(parityMain, /applyRawPlacementOnlyState/);
assert.match(parityMain, /renderer\.shadowMap\.enabled = false/);
assert.match(parityMain, /visibleSky\.root\.visible = false/);
assert.match(parityMain, /raw 8\.0; exposure\/tone transfer disabled/);
assert.match(parityHtml, /id="reset-live-camera"/);
assert.match(parityHtml, /id="toggle-shader-swipe"/);
assert.match(parityHtml, /id="toggle-raw-swipe"/);
assert.match(parityHtml, /id="shader-swipe-range"[\s\S]*value="20"/);
assert.match(parityCss, /touch-action: none/);
assert.match(parityCss, /--shader-swipe-position: 20%/);
assert.match(surfaceMaterialModes, /neutralLit: 'neutral-lit'/);
assert.match(surfaceMaterialModes, /rawTexture: 'raw-texture'/);
assert.match(surfaceMaterialModes, /copySurfaceMaterialModes/);
assert.match(
  unityRockMaterial,
  /registerSurfaceMaterialMode\(material, SURFACE_MATERIAL_MODE\.rawTexture,[\s\S]*colorNode: rockProjection/,
);
assert.match(sourceEnvironmentMaterials, /sourceWeights\[layerName\] = rawWeight/);
assert.match(
  sourceEnvironmentMaterials,
  /sourceRawColors\[layerName\]\.mul\(sourcePlacementWeights\[layerName\]\)/,
);

console.log(
  'Verified P01–P11 lighting/material authority, P12 exact 4096 authored rock response, and P13 exact UE background/cloud-shell assets in Unity and ToonLab.',
);
