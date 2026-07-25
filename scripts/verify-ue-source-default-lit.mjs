#!/usr/bin/env node

// Source-sensitive numerical gate for SnowPines ordinary opaque lighting.
// This verifies the active UE 5.8 legacy Default Lit branch from source and
// project settings, then locks ToonLab's material/renderer boundary without
// claiming equality for private reflection, SSR, or AO buffers.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { float } from 'three/tsl';

import {
  UE_SOURCE_DEFAULT_LIT_CONTRACT,
  UE_SOURCE_DEFAULT_LIT_SOURCE,
  UeSourceDefaultLitLightingModel,
  evaluateUeSourceDefaultLitDirect,
  evaluateUeSourceDefaultLitEnvBrdf,
  evaluateUeSourceDefaultLitIndirectDiffuse,
  evaluateUeSourceDefaultLitMaterialInputs,
  evaluateUeSourceDefaultLitSpecularOcclusion,
  installUeSourceDefaultLitLighting,
} from '../src/environment/ueSourceDefaultLit.js';

const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const close = (actual, expected, tolerance = 1e-12, label = 'value') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
};
const vectorClose = (actual, expected, tolerance = 1e-12, label = 'vector') => {
  assert.equal(actual.length, expected.length, `${label}: channel count`);
  actual.forEach((value, index) => close(
    value,
    expected[index],
    tolerance,
    `${label}[${index}]`,
  ));
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const ueEngine = process.env.UE_ENGINE_ROOT
  ?? '/Users/Shared/Epic Games/UE_5.8/Engine';
const sourceProject = process.env.SO_STYLIZED_UE_PROJECT
  ?? resolve(projectRoot, '../StylizedExploration');

const paths = {
  adapter: resolve(projectRoot, 'src/environment/ueSourceDefaultLit.js'),
  brdf: resolve(ueEngine, 'Shaders/Private/BRDF.ush'),
  capture: resolve(
    projectRoot,
    'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
  ),
  deferredLighting: resolve(
    ueEngine,
    'Shaders/Private/DeferredLightingCommon.ush',
  ),
  ledger: resolve(projectRoot, 'docs/source-shader-port-ledger.json'),
  projectConfig: resolve(sourceProject, 'Config/DefaultEngine.ini'),
  reflectionComposite: resolve(
    ueEngine,
    'Shaders/Private/ReflectionEnvironmentComposite.ush',
  ),
  reflectionPixel: resolve(
    ueEngine,
    'Shaders/Private/ReflectionEnvironmentPixelShader.usf',
  ),
  shadingCommon: resolve(ueEngine, 'Shaders/Private/ShadingCommon.ush'),
  shadingModels: resolve(ueEngine, 'Shaders/Private/ShadingModels.ush'),
  skyDiffuse: resolve(
    ueEngine,
    'Shaders/Private/SkyLightingDiffuseShared.ush',
  ),
  sourceMaterials: resolve(
    projectRoot,
    'src/environment/soStylizedSourceMaterials.js',
  ),
};

const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(
  async ([key, sourcePath]) => [key, await readFile(sourcePath, 'utf8')],
)));

for (const [key, hashKey] of [
  ['brdf', 'brdfSha256'],
  ['capture', 'captureSha256'],
  ['deferredLighting', 'deferredLightingSha256'],
  ['projectConfig', 'projectConfigSha256'],
  ['reflectionComposite', 'reflectionCompositeSha256'],
  ['reflectionPixel', 'reflectionPixelSha256'],
  ['shadingCommon', 'shadingCommonSha256'],
  ['shadingModels', 'shadingModelsSha256'],
  ['skyDiffuse', 'skyDiffuseSha256'],
]) {
  assert.equal(
    sha256(source[key]),
    UE_SOURCE_DEFAULT_LIT_SOURCE[hashKey],
    `${key} source hash`,
  );
}

// Lock the project switches which select the legacy single-scatter branch.
assert.match(source.projectConfig, /^r\.Substrate=False$/m);
assert.match(source.projectConfig, /^r\.Material\.RoughDiffuse=False$/m);
assert.match(source.projectConfig, /^r\.Material\.EnergyConservation=False$/m);
assert.match(source.projectConfig, /^r\.DynamicGlobalIlluminationMethod=0$/m);
assert.match(source.projectConfig, /^r\.ReflectionMethod=2$/m);

// Lock exact UE equations rather than generic PBR names.
assert.match(
  source.shadingCommon,
  /half DielectricSpecularToF0\(half Specular\)[\s\S]*return half\(0\.08f \* Specular\)/,
);
assert.match(
  source.shadingCommon,
  /return lerp\(DielectricSpecularToF0\(Specular\)\.xxx, BaseColor, Metallic\.xxx\)/,
);
assert.match(
  source.brdf,
  /half3 Diffuse_Lambert[\s\S]*return DiffuseColor \* \(1 \/ PI\)/,
);
assert.match(
  source.brdf,
  /return a2 \/ \( PI\*d\*d \)/,
);
assert.match(
  source.brdf,
  /return 0\.5 \* rcp\( Vis_SmithV \+ Vis_SmithL \)/,
);
assert.match(
  source.brdf,
  /return saturate\( 50\.0 \* SpecularColor\.g \) \* Fc \+ \(1 - Fc\) \* SpecularColor/,
);
assert.match(
  source.shadingModels,
  /Lighting\.Diffuse = Diffuse_Lambert\(GBuffer\.DiffuseColor\)/,
);
assert.match(
  source.shadingModels,
  /float a2 = Pow4\( Roughness \)/,
);
assert.match(
  source.shadingModels,
  /Vis_SmithJointApprox\( a2, Context\.NoV, AreaLight\.NoL \)/,
);
assert.match(
  source.deferredLighting,
  /MaskedLightColor \* Shadow\.SurfaceShadow/,
);
assert.match(
  source.skyDiffuse,
  /DiffuseLookup = GetSkySHDiffuse\(SkyVisData\.SkyDiffuseLookUpNormal\) \* View\.SkyLightColor\.rgb/,
);
assert.match(
  source.skyDiffuse,
  /\* DiffuseColor \* DiffuseWeight/,
);
assert.match(
  source.reflectionPixel,
  /Color\.rgb \*= EnvBRDF\( SpecularColor, GBuffer\.Roughness, NoV \)/,
);
assert.match(
  source.reflectionPixel,
  /GetSpecularOcclusion\(NoV, RoughnessSq, AO\)/,
);
assert.match(
  source.reflectionComposite,
  /IndirectSpecularOcclusion \* SkylightReflectionScale/,
);

const capture = JSON.parse(source.capture);
const components = capture.renderState?.components ?? [];
const sun = components.find(
  (entry) => entry.componentClass === 'DirectionalLightComponent',
);
const points = components.filter(
  (entry) => entry.componentClass === 'PointLightComponent',
);
assert.ok(sun, 'SnowPines DirectionalLightComponent is missing');
assert.equal(sun.properties?.light_source_angle, 0);
assert.equal(points.length, 2);
assert.ok(points.every((entry) => entry.properties?.source_radius === 0));
assert.ok(points.every((entry) => entry.properties?.cast_shadows === false));

// GBuffer conversion: UE Specular is not Three's physical specular intensity.
const materialInputs = evaluateUeSourceDefaultLitMaterialInputs({
  baseColor: [0.42, 0.31, 0.18],
  metallic: 0.25,
  roughness: 0.64,
  specular: 0.2,
});
close(materialInputs.dielectricF0, 0.016, 0, 'dielectric F0');
vectorClose(
  materialInputs.diffuseAlbedo,
  [0.315, 0.23249999999999998, 0.135],
  0,
  'diffuse albedo',
);
vectorClose(
  materialInputs.f0,
  [0.11699999999999999, 0.0895, 0.056999999999999995],
  0,
  'metallic F0 mix',
);
assert.equal(materialInputs.f90, 1);

// Head-on analytic check: roughness .5 gives D=16/PI and Vis=.25.
const headOn = evaluateUeSourceDefaultLitDirect({
  baseColor: [0.5, 0.25, 0.125],
  lightColor: [1, 1, 1],
  lightDirection: [0, 0, 1],
  normal: [0, 0, 1],
  roughness: 0.5,
  specular: 0.5,
  viewDirection: [0, 0, 1],
});
vectorClose(
  headOn.brdfDiffuse,
  [0.5 / Math.PI, 0.25 / Math.PI, 0.125 / Math.PI],
  1e-15,
  'head-on Lambert',
);
vectorClose(
  headOn.brdfSpecular,
  Array(3).fill(0.16 / Math.PI),
  1e-15,
  'head-on GGX',
);

const direct = evaluateUeSourceDefaultLitDirect({
  baseColor: [0.42, 0.31, 0.18],
  lightColor: [3.2, 2.4, 1.6],
  lightDirection: [0.3, -0.2, 0.9327379053088815],
  metallic: 0.25,
  normal: [0, 0, 1],
  roughness: 0.64,
  specular: 0.2,
  viewDirection: [0.2, 0.1, 0.9746794344808963],
});
vectorClose(
  direct.diffuse,
  [0.2992748940500028, 0.16567003063482297, 0.06413033443928633],
  1e-15,
  'oblique direct diffuse',
);
vectorClose(
  direct.specular,
  [0.10084317292774025, 0.057855538366555624, 0.024564362712234392],
  1e-15,
  'oblique direct specular',
);

vectorClose(
  evaluateUeSourceDefaultLitIndirectDiffuse({
    baseColor: [0.42, 0.31, 0.18],
    irradiance: [0.6, 1.1, 2.3],
    metallic: 0.25,
    roughness: 0.64,
    specular: 0.2,
  }),
  [0.06016056848873644, 0.08140775339150448, 0.098835219660067],
  1e-15,
  'captured-SkyLight diffuse',
);

const environment = evaluateUeSourceDefaultLitEnvBrdf({
  f0: materialInputs.f0,
  preintegratedAb: [0.63, 0.17],
  radiance: [0.8, 1.2, 2.1],
});
vectorClose(
  environment.brdf,
  [0.24371000000000004, 0.226385, 0.20591],
  1e-15,
  'UE EnvBRDF F0/F90 boundary',
);
vectorClose(
  environment.reflected,
  [0.19496800000000003, 0.271662, 0.43241100000000005],
  1e-15,
  'split-sum reflected radiance',
);
close(
  evaluateUeSourceDefaultLitSpecularOcclusion({
    ambientOcclusion: 0.45,
    nDotV: 0.62,
    roughness: 0.64,
  }),
  0.47810055913062915,
  1e-15,
  'deferred specular-occlusion oracle',
);

const material = new MeshPhysicalNodeMaterial();
material.roughnessNode = float(0.64);
material.metalnessNode = float(0.25);
material.specularIntensityNode = float(0.2);
installUeSourceDefaultLitLighting(material);
assert.ok(material.setupLightingModel() instanceof UeSourceDefaultLitLightingModel);
assert.equal(material.userData.ueSourceDefaultLitLighting.stage, 'partial-renderer-parity');
assert.equal(UE_SOURCE_DEFAULT_LIT_CONTRACT.remainingBridges.length, 5);
assert.match(source.adapter, /DFGLUT/);
assert.match(source.adapter, /ambientOcclusion\(\) \{\}/);
assert.match(source.adapter, /irradiance\.mul\(inputs\.diffuseAlbedo\)\.mul\(1 \/ Math\.PI\)/);

// Only literal UE ordinary-opaque builders get this adapter. Unity S_Rock and
// S_Mountain retain their source-valid URP adapter and 1/PI boundary.
const defaultLitInstallCount = (
  source.sourceMaterials.match(/installUeSourceDefaultLitLighting\(material\)/g)
  ?? []
).length;
assert.equal(defaultLitInstallCount, 4, 'rehydration + bark + snow + landscape');
const unityRockSection = source.sourceMaterials.slice(
  source.sourceMaterials.indexOf('async function buildUnityRock'),
  source.sourceMaterials.indexOf('async function buildUnityPineLeaves'),
);
assert.doesNotMatch(unityRockSection, /installUeSourceDefaultLitLighting/);

const ledger = JSON.parse(source.ledger);
for (const family of ['bark', 'landscape', 'snow']) {
  const entry = ledger.shaderFamilies.find((candidate) => candidate.family === family);
  assert.equal(entry?.runtimePort, 'partial');
  assert.match(entry?.nextGate ?? '', /Default Lit/);
}
const rendererEntry = ledger.rendererSystems.find(
  (entry) => entry.system === 'shading-model-lighting',
);
assert.equal(rendererEntry?.status, 'partial');
assert.match(rendererEntry?.remaining ?? '', /punctual Lambert\/GGX/);
assert.match(rendererEntry?.remaining ?? '', /PreIntegratedGF/);
assert.match(rendererEntry?.remaining ?? '', /SSR/);

material.dispose();

console.log('UE source Default Lit verification passed.');
console.log('Exact: SnowPines zero-size punctual Lambert/GGX, UE F0/F90, captured-SkyLight diffuse boundary.');
console.log('Partial: split-sum specular topology; UE PreIntegratedGF, PMREM/capture filtering, SSR, AO composition, and finite-area paths remain open.');
