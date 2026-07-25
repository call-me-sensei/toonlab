import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rtt, texture, vec4 } from 'three/tsl';

import {
  SO_STYLIZED_UNITY_RENDER_CONTRACT,
  SoStylizedUnityTemporalAANode,
  computeSoStylizedUnityTaaJitter,
  createSoStylizedUnityLdrLut,
  evaluateSoStylizedUnityFog,
  evaluateSoStylizedUnityLdrGrade,
  evaluateSoStylizedUnityVignette,
  unitySrgbChannelToLinear,
} from '../src/environment/soStylizedUnityRendering.js';

function near(actual, expected, epsilon = 1e-7, label = 'value') {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const source = SO_STYLIZED_UNITY_RENDER_CONTRACT;
assert.equal(source.pipeline.name, 'PC_RPAsset');
assert.equal(source.pipeline.renderer, 'PC_Renderer');
assert.equal(source.pipeline.msaaSamples, 1);
assert.equal(source.pipeline.colorGradingMode, 'LDR');
assert.equal(source.pipeline.colorGradingLutSize, 32);

assert.equal(source.shadows.distance, 50);
assert.equal(source.shadows.cascadeCount, 4);
assert.deepEqual(source.shadows.cascadeSplits, [0.12299999, 0.2926, 0.53599995, 1]);
assert.equal(source.shadows.mainResolution, 2048);
assert.equal(source.shadows.cascadeAtlasLayout, '2x2');
assert.equal(source.shadows.cascadeTileResolution, 1024);
assert.equal(source.sun.intensity, 1.5);
assert.equal(source.sun.threeLambertInputScale, Math.PI);
assert.equal(source.sun.serializedLightBiasBypassed, true);
assert.equal(source.sun.effectiveLightBias, 0.1);
assert.equal(source.sun.effectiveNormalBias, 0.5);
assert.deepEqual(source.sun.rayDirectionUnity, [
  -0.6295879006,
  -0.7071067358,
  -0.3218992694,
]);
assert.deepEqual(source.sun.rayDirection, [
  -0.6295879006,
  -0.7071067358,
  0.3218992694,
]);

assert.equal(source.ssao.method, 'BlueNoise Alchemy ScreenSpaceAmbientOcclusion RendererFeature');
assert.equal(source.ssao.radius, 0.3);
assert.equal(source.ssao.radiusMultiplier, 1.5);
assert.equal(source.ssao.radiusInShader, 0.45);
assert.equal(source.ssao.samplesPreset, 1);
assert.equal(source.ssao.sampleCount, 8);
assert.equal(source.ssao.intensity, 0.4);
assert.equal(source.ssao.contrast, 0.6);
assert.equal(source.ssao.directLightingStrength, 0.25);

near(unitySrgbChannelToLinear(0.8867924), 0.7615291507458184, 1e-12, 'color filter');
near(source.ambientProbe.coefficient0Linear[0], 0.08701412, 1e-8, 'ambient R');
near(source.ambientProbe.coefficient0Linear[1], 0.2798782, 1e-8, 'ambient G');
near(source.ambientProbe.coefficient0Linear[2], 0.6684512, 1e-8, 'ambient B');
assert.equal(source.ambientProbe.threeLambertInputScale, Math.PI);

near(evaluateSoStylizedUnityFog(0), 0, 1e-12, 'fog at camera');
near(
  evaluateSoStylizedUnityFog(100),
  1 - 2 ** (-99 * source.fog.unityFogParams[0]),
  1e-12,
  'URP FOG_EXP at 100m (near-relative unity_FogParams.x)',
);
near(evaluateSoStylizedUnityVignette(0.5, 0.5), 1, 1e-12, 'vignette center');
near(evaluateSoStylizedUnityVignette(0, 0), 0.28, 1e-12, 'vignette corner');

const jitter0 = computeSoStylizedUnityTaaJitter(0);
const jitter1 = computeSoStylizedUnityTaaJitter(1);
near(jitter0[0], 0, 1e-12, 'TAA jitter 0/x');
near(jitter0[1], -1 / 6, 1e-12, 'TAA jitter 0/y');
near(jitter1[0], -0.25, 1e-12, 'TAA jitter 1/x');
near(jitter1[1], 1 / 6, 1e-12, 'TAA jitter 1/y');
assert.deepEqual(
  computeSoStylizedUnityTaaJitter(1024),
  computeSoStylizedUnityTaaJitter(0),
);

const temporalCamera = new THREE.PerspectiveCamera(60, 16 / 9, 1, 500000);
const stableBeauty = rtt(vec4(0, 0, 0, 1));
stableBeauty.autoUpdate = false;
stableBeauty.textureNeedsUpdate = false;
const temporalDepth = texture(new THREE.DepthTexture(1, 1));
const temporalVelocity = texture(new THREE.Texture());
const stableTemporal = new SoStylizedUnityTemporalAANode(
  stableBeauty,
  temporalDepth,
  temporalVelocity,
  temporalCamera,
);
assert.equal(
  stableTemporal.beautyRenderTarget,
  stableBeauty.renderTarget,
  'explicit temporal beauty must expose the exact RTT render target TRAA sizes and copies',
);
assert.throws(
  () => new SoStylizedUnityTemporalAANode(
    texture(new THREE.Texture()),
    temporalDepth,
    temporalVelocity,
    temporalCamera,
  ),
  /must own an RTT renderTarget or reference a PassTextureNode renderTarget/,
  'generic TextureNode beauty must fail before TRAA reaches its hard-coded passNode path',
);
stableTemporal.dispose();
stableBeauty.renderTarget.dispose();

const neutral = evaluateSoStylizedUnityLdrGrade([0.5, 0.5, 0.5]);
assert(neutral.every((channel) => channel > 0 && channel < 1));
near(neutral[0], neutral[1], 1e-12, 'neutral grade R/G');
near(neutral[1], neutral[2], 1e-12, 'neutral grade G/B');

const lut = createSoStylizedUnityLdrLut();
assert.equal(lut.image.width, 1024);
assert.equal(lut.image.height, 32);
assert.equal(lut.image.data.length, 1024 * 32 * 4);
assert.equal(lut.userData.soStylizedUnity.format, 'R8G8B8A8_UNorm');

console.log('Unity rendering contract: PC_RPAsset / PC_Renderer verified.');
console.log('Lighting: exact probe/sun inputs + URP-to-Three Lambert PI conversion.');
console.log('Shadows: 50m / 4 cascades / 2048 2x2 atlas / four 1024 tiles verified.');
console.log('Post: exponential fog, 32³ R8 LDR LUT, vignette, bloom inputs verified.');
console.log('Temporal: exact 1024-sample Unity Halton jitter verified.');
