import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SO_STYLIZED_UNITY_LIGHTING_REFERENCE,
  evaluateThreePhysicalSpecularF0,
  evaluateUnitySsaoVisibilityFromObscurance,
  evaluateUnityUrpDirectLighting,
  evaluateUnityUrpDirectSpecularScalar,
  evaluateUnityUrpSsaoFactors,
  initializeUnityUrpBrdf,
} from '../src/environment/soStylizedUnityLightingReference.js';

function near(actual, expected, epsilon = 1e-10, label = 'value') {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

function vectorNear(actual, expected, epsilon = 1e-10, label = 'vector') {
  assert.equal(actual.length, expected.length, `${label}: channel count`);
  actual.forEach((value, index) => near(
    value,
    expected[index],
    epsilon,
    `${label}[${index}]`,
  ));
}

const reference = SO_STYLIZED_UNITY_LIGHTING_REFERENCE;

near(reference.brdf.dielectricSpecular, 0.04, 0, 'dielectric F0');
near(reference.brdf.oneMinusDielectricSpecular, 0.96, 0, 'dielectric diffuse');
near(
  reference.brdf.threeStockMetallicDiffuseInputScale,
  Math.PI * 0.96,
  0,
  'stock Three diffuse input conversion',
);
near(reference.brdf.threeCustomUrpInputScale, Math.PI, 0, 'custom URP input scale');

vectorNear(
  reference.sun.colorLinear,
  [1, 0.8781476501810763, 0.6817278369126704],
  1e-14,
  'linear sun color',
);
vectorNear(
  reference.sun.finalColorLinear,
  [1.5, 1.3172214752716145, 1.0225917553690056],
  1e-14,
  'VisibleLight.finalColor',
);
vectorNear(
  reference.sun.threeRayDirection,
  [-0.6295879005986494, -0.7071067357898932, 0.3218992693690794],
  0,
  'Unity-to-glTF ray direction',
);
vectorNear(
  reference.sun.threeSurfaceToLight,
  [0.6295879005986494, 0.7071067357898932, -0.3218992693690794],
  0,
  'Three surface-to-light direction',
);

const metallic = initializeUnityUrpBrdf({
  albedo: [0.25, 0.5, 0.75],
  metallic: 0,
  smoothness: 0,
  workflow: 'metallic',
});
vectorNear(metallic.diffuse, [0.24, 0.48, 0.72], 1e-14, 'metallic diffuse');
vectorNear(metallic.specular, [0.04, 0.04, 0.04], 0, 'metallic F0');
near(metallic.perceptualRoughness, 1, 0, 'perceptual roughness');
near(metallic.roughness, 1, 0, 'roughness');
near(metallic.roughness2, 1, 0, 'roughness squared');
near(metallic.normalizationTerm, 6, 0, 'normalization');

const specular = initializeUnityUrpBrdf({
  albedo: [0.25, 0.5, 0.75],
  specular: [0.2, 0.5, 0.1],
  smoothness: 0.5,
  workflow: 'specular',
});
near(specular.reflectivity, 0.5, 0, 'specular reflectivity');
vectorNear(specular.diffuse, [0.125, 0.25, 0.375], 0, 'specular diffuse');
vectorNear(specular.specular, [0.2, 0.5, 0.1], 0, 'direct source F0');
near(specular.perceptualRoughness, 0.5, 0, 'specular perceptual roughness');
near(specular.roughness, 0.25, 0, 'specular roughness');
near(specular.roughness2, 0.0625, 0, 'specular roughness squared');
near(specular.normalizationTerm, 3, 0, 'specular normalization');

const normalIncidenceScalar = evaluateUnityUrpDirectSpecularScalar({
  brdf: specular,
  normal: [0, 1, 0],
  lightDirection: [0, 1, 0],
  viewDirection: [0, 1, 0],
});
near(
  normalIncidenceScalar,
  specular.roughness2 / (
    (1 * 1 * specular.roughness2MinusOne + 1.00001) ** 2
    * 1
    * specular.normalizationTerm
  ),
  1e-12,
  'URP optimized direct specular',
);

const shadowed = evaluateUnityUrpDirectLighting({
  brdf: metallic,
  lightColor: [1.5, 1.25, 1],
  normal: [0, 1, 0],
  lightDirection: [0, 1, 0],
  viewDirection: [0, 1, 0],
  shadowAttenuation: 0.2,
  directAmbientOcclusion: 0.85,
});
vectorNear(shadowed.radiance, [0.255, 0.2125, 0.17], 1e-14, 'attenuated radiance');
vectorNear(shadowed.diffuse, [0.0612, 0.102, 0.1224], 1e-14, 'direct diffuse');

const ao = evaluateUnityUrpSsaoFactors(0.4, {
  directLightingStrength: 0.25,
  materialOcclusion: 0.7,
});
near(ao.direct, 0.85, 1e-14, 'direct SSAO');
near(ao.indirect, 0.4, 0, 'indirect SSAO');
near(
  evaluateUnitySsaoVisibilityFromObscurance(0.5, {
    intensity: 0.4,
    contrastExponent: 0.6,
    viewDepth: 0,
    falloffDistance: 100,
  }),
  1 - (0.5 * 0.4) ** 0.6,
  1e-14,
  'SSAO estimator transfer',
);
near(reference.ssao.shaderRadius, 0.3 * 1.5, 1e-15, 'BlueNoise shader radius');
assert.equal(reference.ssao.sampleCount, 8);

const grassSourceF0 = [0.17273237, 0.511, 0.057577446];
const threeProcessedGrassF0 = evaluateThreePhysicalSpecularF0(grassSourceF0);
vectorNear(
  threeProcessedGrassF0,
  grassSourceF0.map((channel) => channel * 0.04),
  1e-15,
  'Three-preprocessed grass F0',
);
grassSourceF0.forEach((channel, index) => near(
  channel / threeProcessedGrassF0[index],
  25,
  1e-12,
  `grass F0 loss[${index}]`,
));

const [adapterSource, rendererSource, ssaoRuntimeSource] = await Promise.all([
  readFile(new URL('../src/environment/soStylizedUnityUrpLighting.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/environment/soStylizedUnityRendering.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/environment/soStylizedUnityAmbientOcclusion.js', import.meta.url), 'utf8'),
]);
const ssaoFunctionSource = rendererSource.slice(
  rendererSource.indexOf('export function soStylizedUnityAmbientOcclusion'),
  rendererSource.indexOf('export function soStylizedUnityBloom'),
) + ssaoRuntimeSource;

assert.match(adapterSource, /UNITY_ONE_MINUS_DIELECTRIC_SPECULAR\s*=\s*0\.96/);
assert.match(adapterSource, /roughnessSquared\.div\(/);
assert.match(adapterSource, /lDotH\.mul\(lDotH\)/);
assert.match(
  adapterSource,
  /nDotL\.mul\(unityLightColor\)\.toVar\(['"]unityRadiance['"]\)/,
  'URP materializes one shadowed radiance value before evaluating its BRDF',
);

const remainingBridges = [];
if (!/specularF0Node|sourceSpecular(?:Color)?Node/.test(adapterSource)) {
  remainingBridges.push(
    'URP adapter must consume material.specularColorNode as direct Unity F0; '
    + 'Three setupSpecular otherwise multiplies it by 0.04 at IOR 1.5.',
  );
}
if (!/perceptualRoughnessNode|sourceRoughnessNode/.test(adapterSource)) {
  remainingBridges.push(
    'URP adapter must consume the original material.roughnessNode; Three global '
    + 'roughness clamps to .0525 and adds geometry roughness.',
  );
}
if (/node\.radius\.value\s*=\s*contract\.radius\s*;/.test(rendererSource)) {
  remainingBridges.push(
    'BlueNoise SSAO shader radius is configured radius × 1.5 (.45, not .3).',
  );
}
if (/node\.samples\.value\s*=\s*4\s*;/.test(rendererSource)) {
  remainingBridges.push('Unity SSAO Medium is 8 samples, not 4.');
}
if (/mix\(float\(1\),\s*raw,\s*contract\.intensity\)/s.test(rendererSource)) {
  remainingBridges.push(
    'Unity SSAO intensity .4 is inside its obscurance estimator before pow(.6); '
    + 'it is not a final lerp from 1 to AO.',
  );
}
if (!/(?:contract|settings)\.falloff/.test(ssaoFunctionSource)) {
  remainingBridges.push(
    'Unity SSAO multiplies obscurance by max(1-linearEyeDepth/100,0)^2 '
    + 'before pow(.6); the GTAO transfer must retain that depth falloff.',
  );
}

console.log('Unity URP lighting numerical oracle verified.');
console.log('Metallic workflow: exact 0.96 diffuse energy and direct F0 verified.');
console.log('Specular workflow: direct source F0 and max-channel reflectivity verified.');
console.log('Sun: exact linear finalColor and Unity→glTF direction verified.');
console.log('SSAO: .45 shader radius, 8 samples, estimator transfer and split placement verified.');
console.log(`Runtime bridge gaps detected: ${remainingBridges.length}`);
for (const bridge of remainingBridges) console.log(`- ${bridge}`);

if (process.argv.includes('--strict-runtime') && remainingBridges.length > 0) {
  throw new Error(`${remainingBridges.length} Unity lighting runtime bridges remain.`);
}
