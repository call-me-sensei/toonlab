#!/usr/bin/env node

// Source-sensitive gate for the renderer boundary around the literal URP BRDF.
// It keeps direct radiance and indirect irradiance independent so neither can
// gain or lose a PI when Unity materials move between the Unity and UE stages.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { MeshPhysicalNodeMaterial } from 'three/webgpu';

import {
  SO_STYLIZED_UNITY_URP_INPUT_ADAPTERS,
  SO_STYLIZED_UNITY_URP_LIGHTING_CONTRACT,
  SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE,
  SoStylizedUnityUrpLightingModel,
  evaluateSoStylizedUnityUrpDiffuseDecomposition,
  installSoStylizedUnityUrpLighting,
  resolveSoStylizedUnityUrpInputAdapter,
} from '../src/environment/soStylizedUnityUrpLighting.js';
import {
  SO_STYLIZED_UNITY_LIGHTING_REFERENCE,
  initializeUnityUrpBrdf,
} from '../src/environment/soStylizedUnityLightingReference.js';
import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
} from '../src/environment/soStylizedUnityRendering.js';
import { UE_SOURCE_RADIOMETRIC_SCALE } from '../src/environment/ueSourceLighting.js';
import { evaluateUeSourceSkySh } from '../src/environment/ueSourceSkyLight.js';

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

const scale = (value, scalar) => value.map((channel) => channel * scalar);
const sha256 = (source) => createHash('sha256').update(source).digest('hex');

const unityProject = process.env.SO_STYLIZED_UNITY_PROJECT
  ?? fileURLToPath(new URL(
    '../../../../Setup Guide In-Editor Tutorial/',
    import.meta.url,
  ));
const urpRoot = `${unityProject}/Library/PackageCache/com.unity.render-pipelines.universal@e38be786c41e`;
const coreRoot = `${unityProject}/Library/PackageCache/com.unity.render-pipelines.core@539ef1c759fb`;
const paths = {
  adapter: fileURLToPath(new URL(
    '../src/environment/soStylizedUnityUrpLighting.js',
    import.meta.url,
  )),
  ambientProbe: `${coreRoot}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.ambientProbe}`,
  brdf: `${urpRoot}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.brdf}`,
  capture: fileURLToPath(new URL(
    '../assets-local/sostylized-unity/mega-scene/unity-reference.txt',
    import.meta.url,
  )),
  globalIllumination:
    `${urpRoot}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.globalIllumination}`,
  lighting: `${urpRoot}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.lighting}`,
  sphericalHarmonics:
    `${coreRoot}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.sphericalHarmonics}`,
  sphericalHarmonicsUpload:
    `${coreRoot}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.sphericalHarmonicsUpload}`,
  threeAmbient: fileURLToPath(new URL(
    '../node_modules/three/src/nodes/lighting/AmbientLightNode.js',
    import.meta.url,
  )),
  threeLambert: fileURLToPath(new URL(
    '../node_modules/three/src/nodes/functions/BSDF/BRDF_Lambert.js',
    import.meta.url,
  )),
  threeLightProbe: fileURLToPath(new URL(
    '../node_modules/three/src/nodes/lighting/LightProbeNode.js',
    import.meta.url,
  )),
  ueSkyLight: fileURLToPath(new URL(
    '../src/environment/ueSourceSkyLight.js',
    import.meta.url,
  )),
};

const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(
  async ([key, sourcePath]) => [key, await readFile(sourcePath, 'utf8')],
)));

// Lock the exact URP/Core 17.5 source that establishes these conventions.
for (const [key, hashKey] of [
  ['ambientProbe', 'ambientProbeSha256'],
  ['brdf', 'brdfSha256'],
  ['globalIllumination', 'globalIlluminationSha256'],
  ['lighting', 'lightingSha256'],
  ['sphericalHarmonics', 'sphericalHarmonicsSha256'],
  ['sphericalHarmonicsUpload', 'sphericalHarmonicsUploadSha256'],
]) {
  assert.equal(sha256(source[key]), SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE[hashKey]);
}

assert.match(source.brdf, /outBRDFData\.diffuse\s*=\s*diffuse/);
assert.match(source.brdf, /half3 brdfDiffuse = albedo \* oneMinusReflectivity/);
assert.match(
  source.lighting,
  /half3 radiance = lightColor \* \(lightAttenuation \* NdotL\)/,
);
assert.match(source.lighting, /return brdf \* radiance/);
assert.match(source.globalIllumination, /half3 indirectDiffuse = bakedGI/);
assert.match(
  source.brdf,
  /half3 c = indirectDiffuse \* brdfData\.diffuse/,
);
assert.match(
  source.ambientProbe,
  /Ambient Probe is preconvolved with clamped cosinus/,
);
assert.match(
  source.sphericalHarmonics,
  /Clamped cosine convolution coefs \(pre-divided by PI\)/,
);
assert.match(
  source.sphericalHarmonicsUpload,
  /return new Vector4\(sh\[i, 3\], sh\[i, 1\], sh\[i, 2\], sh\[i, 0\] - sh\[i, 6\]\)/,
);

// Three's accumulator holds irradiance. Stock Lambert consumes 1/PI; the
// custom URP model instead converts that accumulator to Unity bakedGI once.
assert.match(source.threeAmbient, /context\.irradiance\.addAssign\( this\.colorNode \)/);
assert.match(source.threeLightProbe, /getShIrradianceAt\( normalWorld, this\.lightProbe \)/);
assert.match(source.threeLambert, /diffuseColor\.mul\( 1 \/ Math\.PI \)/);
assert.match(
  source.ueSkyLight,
  /getShIrradianceAt\(normalWorld, this\.lightProbe\)/,
);
assert.match(
  source.adapter,
  /lightColor\)\s*\.mul\(this\.inputAdapter\.directNormalization\)/,
);
assert.match(
  source.adapter,
  /irradiance\s*\.mul\(this\.inputAdapter\.indirectNormalization\)/,
);

// Unity captures RenderSettings.ambientProbe as nine RGB SphericalHarmonicsL2
// coefficients. Mirror SHCoefficients.GetSHA/GetSHB/GetSHC plus the shader's
// polynomial evaluation to prove that an L0-only probe evaluates to coeff[0],
// without another basis, cosine-convolution, or PI factor.
const captureLine = source.capture.match(/^ambient\.probe=(.+)$/m)?.[1];
assert.ok(captureLine, 'Unity ambient probe capture is missing');
const capturedSh = captureLine.split(';').map(
  (coefficient) => coefficient.split(',').map(Number),
);
assert.equal(capturedSh.length, 9);
assert.deepEqual(
  capturedSh[0],
  SO_STYLIZED_UNITY_LIGHTING_REFERENCE.ambientProbe.coefficient0Linear,
);
assert.deepEqual(
  capturedSh[0],
  SO_STYLIZED_UNITY_RENDER_CONTRACT.ambientProbe.coefficient0Linear,
);
assert.equal(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.ambientProbe.threeLambertInputScale,
  Math.PI,
);
assert.equal(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.threeLambertInputScale,
  Math.PI,
);
assert(capturedSh.slice(1).every(
  (coefficient) => coefficient.every((channel) => channel === 0),
));

function evaluateUnityPackedSh(coefficients, normal) {
  const [x, y, z] = normal;
  return [0, 1, 2].map((channel) => {
    const shA = [
      coefficients[3][channel],
      coefficients[1][channel],
      coefficients[2][channel],
      coefficients[0][channel] - coefficients[6][channel],
    ];
    const shB = [
      coefficients[4][channel],
      coefficients[5][channel],
      coefficients[6][channel] * 3,
      coefficients[7][channel],
    ];
    const shC = coefficients[8][channel];
    const l0L1 = shA[0] * x + shA[1] * y + shA[2] * z + shA[3];
    const l2 = shB[0] * x * y
      + shB[1] * y * z
      + shB[2] * z * z
      + shB[3] * z * x
      + shC * (x * x - y * y);
    return l0L1 + l2;
  });
}

for (const normal of [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0.2672612419, 0.5345224838, 0.8017837257],
]) {
  vectorClose(
    evaluateUnityPackedSh(capturedSh, normal),
    capturedSh[0],
    0,
    `constant SH0 at ${normal.join(',')}`,
  );
}

const brdf = initializeUnityUrpBrdf({
  albedo: [0.25, 0.5, 0.75],
  metallic: 0,
  smoothness: 0,
});
const zero = [0, 0, 0];
const reference = SO_STYLIZED_UNITY_LIGHTING_REFERENCE;

// Direct-only Unity Stage: PI enters at the stock-Three compatibility
// boundary, 1/PI leaves exactly once inside the Unity BRDF.
const nDotL = 0.625;
const unityStageDirectInput = scale(
  reference.sun.finalColorLinear,
  SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.threeLambertInputScale,
);
const directOnly = evaluateSoStylizedUnityUrpDiffuseDecomposition({
  brdfDiffuse: brdf.diffuse,
  directInput: unityStageDirectInput,
  indirectInput: zero,
  inputAdapter: 'unity-stage',
  nDotL,
});
vectorClose(
  directOnly.directRadiance,
  [0.9375, 0.823263422044759, 0.6391198471056285],
  5e-16,
  'Unity Stage normalized direct radiance',
);
vectorClose(
  directOnly.directDiffuse,
  [0.22499999999999998, 0.3951664425814843, 0.4601662899160525],
  5e-16,
  'direct-only diffuse',
);
assert.deepEqual(directOnly.indirectDiffuse, zero);

// Ambient-only Unity Stage: AmbientLight receives bakedGI*PI; the model's
// one 1/PI conversion restores the exact exported SH0 evaluation.
const unityStageAmbientInput = scale(
  capturedSh[0],
  SO_STYLIZED_UNITY_RENDER_CONTRACT.ambientProbe.threeLambertInputScale,
);
const ambientOnly = evaluateSoStylizedUnityUrpDiffuseDecomposition({
  brdfDiffuse: brdf.diffuse,
  directInput: zero,
  indirectInput: unityStageAmbientInput,
  inputAdapter: 'unity-stage',
});
vectorClose(
  ambientOnly.indirectBakedGi,
  capturedSh[0],
  6e-17,
  'Unity Stage normalized bakedGI',
);
vectorClose(
  ambientOnly.indirectDiffuse,
  [0.0208833888, 0.134341536, 0.481284864],
  6e-17,
  'ambient-only diffuse',
);
assert.deepEqual(ambientOnly.directDiffuse, zero);

// UE captured-scene SH: Three's SH helper returns cosine-weighted physical
// irradiance (PI for a unit-radiance sphere). The UE adapter divides indirect
// irradiance by PI once. It also converts raw UE direct radiance through UE's
// Lambert 1/PI because the literal URP direct branch has no Lambert divisor.
const constantRadianceSh = Array.from({ length: 9 }, () => [0, 0, 0]);
constantRadianceSh[0] = Array(3).fill(Math.sqrt(4 * Math.PI));
const uePhysicalIrradiance = evaluateUeSourceSkySh(
  constantRadianceSh,
  [0, 1, 0],
).toArray();
vectorClose(uePhysicalIrradiance, [Math.PI, Math.PI, Math.PI], 5e-6);
assert.equal(UE_SOURCE_RADIOMETRIC_SCALE, 1);
const ueDecomposition = evaluateSoStylizedUnityUrpDiffuseDecomposition({
  brdfDiffuse: brdf.diffuse,
  directInput: [8, 6, 4],
  indirectInput: uePhysicalIrradiance,
  inputAdapter: 'ue-captured-scene-sh',
  nDotL: 0.25,
});
vectorClose(
  ueDecomposition.directRadiance,
  [2 / Math.PI, 1.5 / Math.PI, 1 / Math.PI],
  1e-15,
  'UE-to-URP direct radiance',
);
vectorClose(ueDecomposition.indirectBakedGi, [1, 1, 1], 2e-6, 'UE SH bakedGI');
vectorClose(ueDecomposition.indirectDiffuse, brdf.diffuse, 2e-6, 'UE SH diffuse');

assert.equal(
  SO_STYLIZED_UNITY_URP_LIGHTING_CONTRACT.defaultInputAdapter,
  SO_STYLIZED_UNITY_URP_INPUT_ADAPTERS.unityStage.id,
);
close(
  SO_STYLIZED_UNITY_URP_INPUT_ADAPTERS.unityStage.directNormalization,
  1 / Math.PI,
  0,
);
close(
  SO_STYLIZED_UNITY_URP_INPUT_ADAPTERS.ueCapturedSceneSh.indirectNormalization,
  1 / Math.PI,
  0,
);
close(
  SO_STYLIZED_UNITY_URP_INPUT_ADAPTERS.ueCapturedSceneSh.directNormalization,
  1 / Math.PI,
  0,
);
assert.throws(
  () => resolveSoStylizedUnityUrpInputAdapter('unknown-stage'),
  /Unknown Unity URP lighting input adapter/,
);
assert.throws(
  () => evaluateSoStylizedUnityUrpDiffuseDecomposition({ nDotL: Infinity }),
  /nDotL must be finite/,
);

// Installation records the boundary on the material and clone reinstallation
// preserves it instead of silently reverting a UE-lit material to Unity Stage.
const material = new MeshPhysicalNodeMaterial();
installSoStylizedUnityUrpLighting(material);
assert.equal(material.userData.soStylizedUnityUrpLighting.inputAdapter, 'unity-stage');
assert.ok(material.setupLightingModel() instanceof SoStylizedUnityUrpLightingModel);
assert.equal(material.setupLightingModel().inputAdapter.id, 'unity-stage');

installSoStylizedUnityUrpLighting(material, {
  inputAdapter: 'ue-captured-scene-sh',
  workflow: 'specular',
});
assert.equal(
  material.userData.soStylizedUnityUrpLighting.inputAdapter,
  'ue-captured-scene-sh',
);
close(
  material.setupLightingModel().inputAdapter.directNormalization,
  1 / Math.PI,
  0,
);
const clone = material.clone();
installSoStylizedUnityUrpLighting(clone, { workflow: 'specular' });
assert.equal(
  clone.userData.soStylizedUnityUrpLighting.inputAdapter,
  'ue-captured-scene-sh',
);

material.dispose();
clone.dispose();

console.log('Unity URP direct/ambient input integration verified.');
console.log('Unity SH0 evaluates to the exported coefficient for every normal.');
console.log('Unity Stage: direct PI and ambient PI are each removed exactly once.');
console.log('UE stage: direct Lambert energy and captured-scene SH irradiance are each divided by PI once.');
