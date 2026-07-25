#!/usr/bin/env node

// Source-sensitive numerical gate for the foliage lighting boundary. This
// compares the supplied Unity graph/URP behavior with UE 5.8 MSM_SUBSURFACE,
// then verifies the ToonLab adapter from equations rather than screenshots.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { MeshSSSNodeMaterial } from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

import {
  UE_SOURCE_SUBSURFACE_LIGHTING_CONTRACT,
  UE_SOURCE_SUBSURFACE_LIGHTING_SOURCE,
  UeSourceSubsurfaceLightingModel,
  evaluateUeSourceSubsurfaceDiffuse,
  evaluateUeSourceSubsurfaceTransmittedColor,
  installUeSourceSubsurfaceLighting,
} from '../src/environment/ueSourceSubsurfaceLighting.js';

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

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const unityProject = process.env.SO_STYLIZED_UNITY_PROJECT
  ?? fileURLToPath(new URL(
    '../../../../Setup Guide In-Editor Tutorial/',
    import.meta.url,
  ));
const ueEngine = process.env.UE_ENGINE_ROOT
  ?? '/Users/Shared/Epic Games/UE_5.8/Engine';
const urpRoot = `${unityProject}/Library/PackageCache/com.unity.render-pipelines.universal@e38be786c41e`;
const unityAssetRoot = `${unityProject}/Assets/SoStylized-Unity/Environment`;

const paths = {
  adapter: `${projectRoot}src/environment/ueSourceSubsurfaceLighting.js`,
  basePass: `${ueEngine}/Shaders/Private/BasePassPixelShader.usf`,
  deferredLighting: `${ueEngine}/Shaders/Private/DeferredLightingCommon.ush`,
  deferredShading: `${ueEngine}/Shaders/Private/DeferredShadingCommon.ush`,
  sceneRendering: `${ueEngine}/Source/Runtime/Renderer/Private/SceneRendering.cpp`,
  shadingModels: `${ueEngine}/Shaders/Private/ShadingModels.ush`,
  unityBarkGraph: `${unityAssetRoot}/Trees/Shaders/S_Bark.shadergraph`,
  unityFoliageGraph: `${unityAssetRoot}/Foliage/Shaders/S_FoliageShader.shadergraph`,
  unityFoliagePass:
    `${projectRoot}assets-local/sostylized-unity/generated-shaders/passes/`
    + 'S_FoliageShader/sub-00-pass-00-ForwardLit.shader',
  unityGlobalIllumination: `${urpRoot}/ShaderLibrary/GlobalIllumination.hlsl`,
  unityLeavesGraph: `${unityAssetRoot}/Trees/Shaders/S_Leaves.shadergraph`,
  unityLeavesPass:
    `${projectRoot}assets-local/sostylized-unity/generated-shaders/passes/`
    + 'S_Leaves/sub-00-pass-00-ForwardLit.shader',
  unityLighting: `${urpRoot}/ShaderLibrary/Lighting.hlsl`,
};

const source = Object.fromEntries(await Promise.all(Object.entries(paths).map(
  async ([key, sourcePath]) => [key, await readFile(sourcePath, 'utf8')],
)));

// Pin the exact engine source whose equations are ported.
for (const [key, hashKey] of [
  ['basePass', 'basePassSha256'],
  ['deferredLighting', 'deferredLightingSha256'],
  ['deferredShading', 'deferredShadingSha256'],
  ['sceneRendering', 'sceneRenderingSha256'],
  ['shadingModels', 'shadingModelsSha256'],
]) {
  assert.equal(
    sha256(source[key]),
    UE_SOURCE_SUBSURFACE_LIGHTING_SOURCE[hashKey],
    `${key} source hash`,
  );
}

// Pin the supplied Unity authority as well: it uses ordinary URP Lit with
// graph emission, one shadow attenuation term, baked GI, and material AO=1.
assert.equal(
  sha256(source.unityLeavesGraph),
  '94840ad60699adc079acb523e3b6b0ce82ef2e791f39043c71dd23195577ba62',
);
assert.equal(
  sha256(source.unityBarkGraph),
  '0ab87ac5464f9b3d4e4090b2299cc4df55c0155ff79458e62b91a84829ff2689',
);
assert.equal(
  sha256(source.unityFoliageGraph),
  '1426bd360f44c10510f77a70450c86feca99f132819af6fe78130daabf369dd7',
);
assert.equal(
  sha256(source.unityLeavesPass),
  '8cfe5265761bf9f443577571632ebebdc3517d00fc0ff29cf1ba2e7e6b1cee19',
);
assert.equal(
  sha256(source.unityFoliagePass),
  'b570a3850c5ccf9c6bd3ee499c59cf76f16dfcdc81f8402c907debc92e2da8f9',
);
assert.match(source.unityLeavesPass, /surface\.Occlusion\s*=\s*float\(1\)/);
assert.match(source.unityLeavesPass, /surface\.Emission\s*=\s*\(_Add_/);
assert.match(source.unityLeavesPass, /IN\.FaceSign\.x/);
assert.match(source.unityFoliagePass, /surface\.Occlusion\s*=\s*float\(1\)/);
assert.match(source.unityFoliagePass, /surface\.Emission\s*=\s*_Multiply_/);
assert.match(
  source.unityLighting,
  /light\.distanceAttenuation\s*\*\s*light\.shadowAttenuation/,
);
assert.match(source.unityGlobalIllumination, /half3 indirectDiffuse = bakedGI/);

// Lock each relevant UE branch, including the independent transmission
// shadow channel which is not available from a stock Three shadow map.
assert.match(
  source.shadingModels,
  /half InScatter = pow\(saturate\(dot\(AreaLight\.DiffuseL, -V\)\), 12\) \* lerp\(3, \.1f, Opacity\)/,
);
assert.match(source.shadingModels, /const half WrappedDiffuse = pow\(/);
assert.match(source.shadingModels, /const half BackScatter = GBuffer\.GBufferAO/);
assert.match(source.shadingModels, /TransmittanceToExtinction\(SubsurfaceColor/);
assert.match(source.shadingModels, /HSV_2_LinearRGB/);
assert.match(
  source.basePass,
  /DiffuseColorForIndirect \+= SubsurfaceColor/,
);
assert.match(
  source.basePass,
  /SubsurfaceIndirectLighting \* SubsurfaceColor/,
);
assert.match(
  source.basePass,
  /GetEffectiveSkySHDiffuse\(-WorldNormal\)/,
);
assert.match(source.deferredLighting, /X - Whole scene directional light shadows/);
assert.match(source.deferredLighting, /Y - Whole scene directional light SSS shadows/);
assert.match(
  source.deferredLighting,
  /MaskedLightColor \* Shadow\.TransmissionShadow/,
);
assert.match(
  source.deferredLighting,
  /OutShadow\.TransmittanceOrOpticalThickness = min\(LightAttenuation\.y, LightAttenuation\.w\)/,
);
assert.match(
  source.deferredShading,
  /return \(-0\.05f \* log\(1\.0f - min\(Opacity, 0\.99f\)\)\)/,
);
assert.match(
  source.sceneRendering,
  /r\.SSS\.SubSurfaceColorAsTansmittanceAtDistance/,
);
assert.match(source.sceneRendering, /0\.15f; \/\/ Default 0\.15 normalized unit/);

// Exact Beer-Lambert hue path. Green remains the value-bearing channel; this
// is the engine transform, not an artist-authored blue/green shadow tint.
vectorClose(
  evaluateUeSourceSubsurfaceTransmittedColor([0.04, 0.24, 0.03]),
  [0.0000018830745110687274, 0.24, 5.540704224493709e-7],
  1e-15,
  'UE transmitted color',
);

const inputs = {
  baseColor: [0.08, 0.32, 0.04],
  backIrradiance: [0.08, 0.16, 0.5],
  frontIrradiance: [0.1, 0.2, 0.6],
  lightColor: [1, 0.9, 0.7],
  lightDotNegativeView: 0.7,
  normalDotLight: 0.35,
  opacity: 0.3,
  subsurfaceColor: [0.04, 0.24, 0.03],
};
const deepShadow = evaluateUeSourceSubsurfaceDiffuse({
  ...inputs,
  opticalTransmittance: 0,
  surfaceShadow: 0,
  transmissionShadow: 0,
});
vectorClose(deepShadow.directSurface, [0, 0, 0], 0, 'deep-shadow surface');
vectorClose(deepShadow.directTransmission, [0, 0, 0], 0, 'deep-shadow transmission');
vectorClose(
  deepShadow.indirect,
  [0.004838310269993619, 0.047873806882042125, 0.01814366351247607],
  1e-15,
  'front + back SkyLight SSS indirect',
);
assert.ok(
  deepShadow.indirect[1] > deepShadow.indirect[2]
    && deepShadow.indirect[2] > deepShadow.indirect[0],
  'authored green hue must survive while blue SkyLight structure remains visible',
);
const oldFrontOnly = inputs.baseColor.map(
  (channel, index) => channel * inputs.frontIrradiance[index] / Math.PI,
);
assert.ok(
  deepShadow.indirect[1] > oldFrontOnly[1] * 2,
  'UE front/back subsurface energy must not collapse to ordinary blue-lit albedo',
);

const penumbra = evaluateUeSourceSubsurfaceDiffuse({
  ...inputs,
  opticalTransmittance: 0.2,
  surfaceShadow: 0.4,
  transmissionShadow: 0.65,
});
vectorClose(
  penumbra.directTransmission,
  [0.0008870298180147404, 0.023945296008740583, 0.00046563737485955824],
  1e-15,
  'independent transmission-shadow oracle',
);
close(penumbra.inScatter, 0.02948194173812997, 1e-15, 'in-scatter');
close(penumbra.wrappedDiffuse, 0.7109519497807987, 1e-15, 'wrapped diffuse');

// Runtime wiring must replace MeshSSSNodeMaterial's unrelated experimental
// thickness model while preserving its graph-visible source input nodes.
const material = new MeshSSSNodeMaterial();
material.thicknessColorNode = vec3(0.04, 0.24, 0.03);
material.thicknessAttenuationNode = float(0.3);
installUeSourceSubsurfaceLighting(material);
const lightingModel = material.setupLightingModel();
assert.ok(lightingModel instanceof UeSourceSubsurfaceLightingModel);
assert.equal(
  material.userData.ueSourceSubsurfaceLighting.transmissionShadow,
  UE_SOURCE_SUBSURFACE_LIGHTING_CONTRACT.transmissionShadowFallback,
);
assert.match(source.adapter, /capturedSkyBackfaceIrradiance/);
assert.match(source.adapter, /getShIrradianceAt\(normalWorld\.negate\(\)/);
assert.match(source.adapter, /frontSubsurface\.add\(backSubsurface\)/);
assert.match(source.adapter, /super\.direct\(input, builder\)/);

assert.equal(UE_SOURCE_SUBSURFACE_LIGHTING_CONTRACT.remainingBridges.length, 3);
assert.match(
  UE_SOURCE_SUBSURFACE_LIGHTING_CONTRACT.remainingBridges[0],
  /TransmissionShadow/,
);

console.log('UE source foliage lighting verification passed.');
console.log('Exact: MSM_SUBSURFACE wrap/in-scatter, Beer-Lambert hue, front/back SkyLight indirect.');
console.log('Exact Unity comparison: ordinary URP shadow attenuation, baked GI, graph emission, AO=1.');
console.log('Remaining renderer bridges: 3 (independent SSS shadow buffer, colored AO multibounce, UE DefaultLit specular).');
