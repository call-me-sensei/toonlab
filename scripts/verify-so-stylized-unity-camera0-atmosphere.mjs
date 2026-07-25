#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
  createSoStylizedUnityLdrLut,
  evaluateSoStylizedUnityFog,
} from '../src/environment/soStylizedUnityRendering.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '..');
const DEFAULT_PROJECT = resolve(
  WORKSPACE_ROOT,
  '..',
  '..',
  'Setup Guide In-Editor Tutorial',
);
const suppliedProject = resolve(
  process.env.TOONLAB_UNITY_PROJECT_ROOT ?? DEFAULT_PROJECT,
);
const packageCache = resolve(suppliedProject, 'Library', 'PackageCache');
const urpDirectory = existsSync(packageCache)
  ? readdirSync(packageCache).find(
    (name) => name.startsWith('com.unity.render-pipelines.universal@'),
  )
  : null;
assert.ok(urpDirectory, 'The supplied Unity URP package cache is required.');
const urpRoot = resolve(packageCache, urpDirectory);

const files = Object.freeze({
  native: Object.freeze({
    path: resolve(
      PACKAGE_ROOT,
      'docs/source-shader-audits/unity-camera0-atmosphere.json',
    ),
    sha256: '5b8253f987115e4bc36289e4554ae0c9936d19ead4b7bfa80f335230a26f3780',
  }),
  volume: Object.freeze({
    path: resolve(
      suppliedProject,
      'Assets/SoStylized-Unity/Materials/Global Volume Profile.asset',
    ),
    sha256: '9dd78bd2cbf07d1ad5d5fbd8d7201879cd30c72e7c227742b3ffb97e2cf26724',
  }),
  fogFunctions: Object.freeze({
    path: resolve(urpRoot, 'ShaderLibrary/ShaderVariablesFunctions.hlsl'),
    sha256: '7e94d1ecc249a2da93ffdad4033071b1bf8f52484d390cb18c3b1d921e52e206',
  }),
  unlitPass: Object.freeze({
    path: resolve(urpRoot, 'Editor/ShaderGraph/Includes/UnlitPass.hlsl'),
    sha256: '4fc1f6bbc4dd959fbd2127c98e5806b35d53ffe57c1b12179519af679e8e6f4e',
  }),
  unlitLibrary: Object.freeze({
    path: resolve(urpRoot, 'ShaderLibrary/Unlit.hlsl'),
    sha256: 'acc3485ba8bef1432f58a86b6292a6270f7bdb902ee378173eb5810dd8783035',
  }),
  postCommon: Object.freeze({
    path: resolve(urpRoot, 'Shaders/PostProcessing/Common.hlsl'),
    sha256: 'd06d0abe2547f8d40de8b6e747cfab0b588e872a83e980108cad2e0fd9503fa3',
  }),
  uberPost: Object.freeze({
    path: resolve(urpRoot, 'Shaders/PostProcessing/UberPost.shader'),
    sha256: '45844e94306f54d05090a75a7c12faa262dc552fbe02dff89cf4e747c33f3685',
  }),
  lutBuilder: Object.freeze({
    path: resolve(urpRoot, 'Shaders/PostProcessing/LutBuilderLdr.shader'),
    sha256: 'e858546a45890d9b45f3d83f289ced7ab28a594c6bbfaa76e484f2b954e34f4a',
  }),
  unityPipeline: Object.freeze({
    path: resolve(urpRoot, 'Runtime/UniversalRenderPipeline.cs'),
    sha256: 'a8fba27596291c7f26044c681fd643b698c6963ab5f638133061e88b9b2d108d',
  }),
  threeNodeMaterial: Object.freeze({
    path: resolve(PACKAGE_ROOT, 'node_modules/three/src/materials/nodes/NodeMaterial.js'),
    sha256: 'dbef1e6d16b4291afd41e98d06e865f912ea317de3b3298ff0fc057aa3ce24c6',
  }),
  threeRenderPipeline: Object.freeze({
    path: resolve(PACKAGE_ROOT, 'node_modules/three/src/renderers/common/RenderPipeline.js'),
    sha256: '9dcf203793aec85ab2faf21a1acfc3e61869a5b073e6e119c4ea8c1cfb386c17',
  }),
  threeRenderOutput: Object.freeze({
    path: resolve(PACKAGE_ROOT, 'node_modules/three/src/nodes/display/RenderOutputNode.js'),
    sha256: '50d95ac17beb0d1aa022465d848aa2458d770dc3077f97065fbbae2c35deb899',
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const source = {};
for (const [name, record] of Object.entries(files)) {
  const contents = readFileSync(record.path);
  assert.equal(
    sha256(contents),
    record.sha256,
    `${name} changed; re-run the Camera 0 atmosphere audit before accepting it`,
  );
  source[name] = contents.toString('utf8');
}

const native = JSON.parse(source.native);
assert.equal(native.scene, 'Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity');
assert.equal(native.unityVersion, '6000.5.4f1');
assert.equal(native.colorSpace, 'Linear');
assert.equal(native.pipeline, 'PC_RPAsset');
assert.equal(native.renderer, 'UniversalRenderer');
assert.equal(native.camera, 'C_SpectatorCamera/Camera');
assert.deepEqual(native.cameraPosition, [
  268.2099914550781,
  10.350000381469727,
  -14.960000038146973,
]);
assert.deepEqual(native.cameraRotation, [
  0,
  0.6636017560958862,
  0,
  -0.7480860352516174,
]);
assert.equal(native.fieldOfView, 60);
assert.equal(native.nearClipPlane, 1);
assert.equal(native.farClipPlane, 500000);
assert.equal(native.clearFlags, 'Skybox');
assert.deepEqual(native.backgroundColor, [
  0.1921568661928177,
  0.3019607961177826,
  0.4745098054409027,
  0,
]);
assert.equal(native.renderSettingsSkybox, '');
assert.equal(native.renderPostProcessing, true);
assert.equal(native.antialiasing, 'TemporalAntiAliasing');

assert.equal(native.fogEnabled, true);
assert.equal(native.fogMode, 'Exponential');
assert.equal(native.fogDensity, 0.0012000000569969416);
assert.deepEqual(native.unityFogParams, [
  0.0014413469471037388,
  0.001731234136968851,
  0,
  0,
]);
assert.deepEqual(native.unityFogColor, [
  0.22807127237319947,
  0.48505982756614687,
  0.8752002716064453,
  1,
]);
assert.deepEqual(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.fog.unityFogParams,
  native.unityFogParams,
);
assert.deepEqual(
  SO_STYLIZED_UNITY_RENDER_CONTRACT.fog.colorLinear,
  native.unityFogColor.slice(0, 3),
);
assert.equal(
  evaluateSoStylizedUnityFog(100),
  1 - 2 ** (-99 * native.unityFogParams[0]),
);

assert.equal(native.volumeProfile, 'Assets/SoStylized-Unity/Materials/Global Volume Profile.asset');
assert.equal(native.volumeIsGlobal, true);
assert.equal(native.volumeWeight, 1);
assert.equal(native.volumePriority, 0);
assert.deepEqual(native.colorAdjustments, {
  present: true,
  active: true,
  postExposure: { overrideState: true, value: 0 },
  contrast: { overrideState: true, value: 20 },
  colorFilter: {
    overrideState: true,
    value: [0.8867924213409424, 0.8867924213409424, 0.8867924213409424, 1],
  },
  hueShift: { overrideState: true, value: 0 },
  saturation: { overrideState: true, value: -3.299999952316284 },
});
assert.equal(native.bloom.active, true);
assert.equal(native.bloom.threshold.value, 1.100000023841858);
assert.equal(native.bloom.intensity.value, 6);
assert.equal(native.bloom.scatter.value, 0.7409999966621399);
assert.equal(native.vignette.active, true);
assert.equal(native.vignette.intensity.value, 0.4000000059604645);
assert.equal(native.depthOfField.active, false);
assert.equal(native.tonemappingPresent, false);
assert.equal(native.tonemappingActive, false);

assert.deepEqual(native.skyRenderers.map((record) => ({
  path: record.hierarchyPath,
  material: record.material,
  shader: record.shader,
  queue: record.renderQueue,
  scale: record.worldScale,
  shadows: record.shadowCastingMode,
  inside: record.cameraInsideBounds,
})), [
  {
    path: 'P_Sky/SM_StylizedSkyDome_Clouds',
    material: 'M_Clouds',
    shader: 'Shader Graphs/S_StylizedClouds',
    queue: 3000,
    scale: [30.0000057220459, 30.000003814697267, 30.0000057220459],
    shadows: 'Off',
    inside: true,
  },
  {
    path: 'P_Sky/SM_StylizedSkyDome_Sky',
    material: 'M_StylizedSky',
    shader: 'Shader Graphs/S_StylizedSky',
    queue: 2000,
    scale: [2.000000238418579, 2, 2.000000238418579],
    shadows: 'Off',
    inside: true,
  },
]);

assert.match(source.unityPipeline, /backgroundColorSRGB = camera\.backgroundColor/);
assert.match(
  source.unityPipeline,
  /cameraData\.backgroundColor = CoreUtils\.ConvertSRGBToActiveColorSpace\(backgroundColorSRGB\)/,
);
assert.match(
  source.fogFunctions,
  /if \(FOG_EXP\)[\s\S]*?return real\(unity_FogParams\.x \* z\)/,
);
assert.match(
  source.fogFunctions,
  /if \(FOG_EXP\)[\s\S]*?return saturate\(exp2\(-fogFactor\)\)/,
);
assert.match(
  source.fogFunctions,
  /nearToFarZ = max\(viewZ - _ProjectionParams\.y, 0\)/,
);

assert.match(source.unlitPass, /UniversalFragmentUnlit\(inputData, surfaceDescription\.BaseColor, alpha\)/);
assert.doesNotMatch(source.unlitPass, /MixFog|ComputeFogFactor|ComputeFogIntensity/);
assert.doesNotMatch(source.unlitLibrary, /MixFog|ComputeFogFactor|ComputeFogIntensity/);

assert.match(source.lutBuilder, /colorLog = LinearToLogC\(colorLinear\)/);
assert.match(source.lutBuilder, /colorLinear \*= _ColorFilter\.xyz/);
assert.match(
  source.lutBuilder,
  /colorLinear = luma\.xxx \+ \(_HueSatCon\.yyy \* satMult\) \* \(colorLinear - luma\.xxx\)/,
);
assert.match(source.postCommon, /input = ApplyTonemap\(input\)/);
assert.match(
  source.postCommon,
  /input = ApplyLut2D\(TEXTURE2D_ARGS\(lutTex, lutSampler\), input, lutParams\)/,
);
const bloomIndex = source.uberPost.indexOf('color += bloom * BloomTint;');
const vignetteIndex = source.uberPost.indexOf('color = ApplyVignette(');
const gradeIndex = source.uberPost.indexOf('color = ApplyColorGrading(');
const encodeIndex = source.uberPost.indexOf('color = GetLinearToSRGB(color);');
assert.ok(bloomIndex >= 0 && bloomIndex < vignetteIndex);
assert.ok(vignetteIndex < gradeIndex && gradeIndex < encodeIndex);

// `toneMapped=false` is not a hidden material-space color conversion in the
// WebGPU node path. NodeMaterial writes its linear result; RenderPipeline owns
// the single final working-space -> output-space transform.
assert.doesNotMatch(source.threeNodeMaterial, /\btoneMapped\b/);
assert.match(
  source.threeNodeMaterial,
  /const materialMRT = this\.mrtNode;[\s\S]*?resultNode = mrt\.merge\( materialMRT \);/,
);
assert.match(
  source.threeRenderPipeline,
  /outputNode = renderOutput\( outputNode, toneMapping, outputColorSpace \)/,
);
assert.match(
  source.threeRenderPipeline,
  /renderer\.outputColorSpace = ColorManagement\.workingColorSpace/,
);
assert.match(
  source.threeRenderOutput,
  /outputNode = outputNode\.workingToColorSpace\( outputColorSpace \)/,
);

const lut = createSoStylizedUnityLdrLut();
assert.equal(lut.image.width, 1024);
assert.equal(lut.image.height, 32);
assert.equal(lut.type, 1009); // THREE.UnsignedByteType
assert.equal(lut.colorSpace, ''); // THREE.NoColorSpace

const stageSource = readFileSync(
  resolve(PACKAGE_ROOT, 'src/environment/soStylizedUnityStage.js'),
  'utf8',
);
assert.match(stageSource, /applySoStylizedUnityLdrGradeLut\(vignetted\)/);
assert.match(stageSource, /sceneFogParticipation/);
assert.match(stageSource, /configureSoStylizedUnityStageCameraClear/);

console.log('Unity Camera 0 atmosphere oracle verified (native Metal source state).');
console.log('Sky/cloud: UniversalUnlit output, no URP fog participation.');
console.log('Post: bloom -> vignette -> 32^3 R8 LDR LUT -> one linear-to-sRGB encode.');
console.log('Fog: near-relative dynamic FOG_EXP using native unity_FogParams.x.');
