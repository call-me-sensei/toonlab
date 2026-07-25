#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NearestFilter, PerspectiveCamera, RepeatWrapping } from 'three';
import { float, vec3 } from 'three/tsl';

import {
  UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT,
  UeSourceAmbientOcclusionNode,
  computeUeSourceSsaoRandomizationData,
  evaluateUeSourceAmbientOcclusionResponse,
  resolveUeSourceAmbientOcclusionSettings,
} from '../src/environment/ueSourceAmbientOcclusion.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const manifest = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'demo-scenes',
  'Demonstration_SnowPines.json',
), 'utf8'));
const defaultEngine = readFileSync(resolve(
  ROOT_DIR,
  '..',
  'StylizedExploration',
  'Config',
  'DefaultEngine.ini',
), 'utf8');

const post = (manifest.renderState?.components ?? []).find(
  (component) => component.componentClass === 'PostProcessComponent'
    && component.properties?.unbound === true,
)?.postProcessSettings;
assert.ok(post, 'SnowPines unbound post-process settings are missing');
assert.match(defaultEngine, /^r\.DefaultFeature\.AmbientOcclusion=True$/m);
assert.match(defaultEngine, /^r\.DefaultFeature\.AmbientOcclusionStaticFraction=True$/m);
assert.equal(manifest.projectSettings?.scalability?.['sg.PostProcessQuality'], 3);
assert.equal(post.ambient_occlusion_intensity, 0.5);
assert.equal(post.ambient_occlusion_power, 2);
assert.equal(post.ambient_occlusion_radius, 160);
assert.equal(post.override_ambient_occlusion_intensity, false);
assert.equal(post.override_ambient_occlusion_power, false);
assert.equal(post.override_ambient_occlusion_radius, true);

const close = (actual, expected, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};

const settings = resolveUeSourceAmbientOcclusionSettings(post, {
  cvars: manifest.projectSettings?.cvars,
  postProcessQuality:
    manifest.projectSettings?.scalability?.['sg.PostProcessQuality'],
  projectEnabled: true,
  projectStaticFraction: true,
});

// No project override changes UE's default method 0 or pixel path. At Epic
// post-process scalability, quality 50 resolves to permutation 2 and two AO
// resolution levels.
assert.equal(settings.enabled, true);
assert.equal(settings.method, 'SSAO');
assert.equal(settings.methodCvar, 0);
assert.equal(settings.compute, false);
assert.equal(settings.pixelShader, true);
assert.equal(settings.quality, 50);
assert.equal(settings.shaderQuality, 2);
assert.equal(settings.sampleSteps, 2);
assert.equal(settings.levels, 2);
assert.equal(settings.radiusScale, 1);
assert.equal(settings.authoredRadiusCm, 160);
assert.equal(settings.radiusCm, 160);
assert.equal(settings.radiusInWorldSpace, false);
assert.equal(settings.hzbMipLevelFactor, 0.4);
assert.equal(settings.mipBlend, 0.6);
assert.equal(settings.mipScale, 1.7);
assert.equal(settings.staticFraction, 1);

// GetSSAOShaderParameters: view-locked radius /400, per-level mip scale, /4.
close(settings.fullResolution.radiusInShader, 0.1);
close(settings.halfResolution.radiusInShader, 0.17);
assert.equal(settings.fullResolution.scaleRadiusInWorldSpace, 0);
assert.equal(settings.fullResolution.sampleSetSize, 3);
assert.equal(settings.fullResolution.sampleLookups, 12);
assert.equal(settings.halfResolution.sampleSetSize, 6);
assert.equal(settings.halfResolution.sampleLookups, 24);
close(settings.fullResolution.inverseMipThreshold, 0.01);
close(settings.halfResolution.inverseMipThreshold, 0.005);

// The source output response is power first, intensity second, after the
// 30-80m fade. It is not a linear mix with raw AO.
close(evaluateUeSourceAmbientOcclusionResponse(0, settings, 0), 0.5);
close(evaluateUeSourceAmbientOcclusionResponse(0.5, settings, 0), 0.625);
close(evaluateUeSourceAmbientOcclusionResponse(1, settings, 0), 1);
close(evaluateUeSourceAmbientOcclusionResponse(0.5, settings, 3000), 0.625);
close(evaluateUeSourceAmbientOcclusionResponse(0.5, settings, 5500), 0.78125);
close(evaluateUeSourceAmbientOcclusionResponse(0.5, settings, 8000), 1);

// SystemTextures.cpp's ordered 4x4 basis is copied exactly into a 64px
// repeating nearest texture. These values independently lock signed-byte
// quantization and the non-sequential source reorder table.
const randomization = computeUeSourceSsaoRandomizationData();
assert.equal(randomization.extent, 64);
assert.deepEqual(
  randomization.bases.map((basis) => basis.reordered),
  [0, 11, 7, 3, 10, 4, 15, 12, 6, 8, 1, 14, 13, 2, 9, 5],
);
assert.deepEqual(
  randomization.bases.slice(0, 4).map(({ r, g }) => [r, g]),
  [[240, 128], [67, 219], [147, 224], [225, 193]],
);
assert.deepEqual(
  [...randomization.data.slice(0, 16)].filter((_, index) => index % 4 < 2),
  [240, 128, 67, 219, 147, 224, 225, 193],
);
// Pixel 4 repeats pixel 0, and row 4 repeats row 0.
assert.deepEqual(
  [...randomization.data.slice(0, 4)],
  [...randomization.data.slice(16, 20)],
);
assert.deepEqual(
  [...randomization.data.slice(0, 4)],
  [...randomization.data.slice(64 * 4 * 4, 64 * 4 * 4 + 4)],
);

const node = new UeSourceAmbientOcclusionNode(
  float(1),
  vec3(0, 0, 1),
  new PerspectiveCamera(60, 16 / 9, 0.05, 2000),
  settings,
);
assert.equal(node.contract, UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT);
close(node.radius.value, 0.1);
assert.equal(node.distanceExponent.value, 1);
assert.equal(node.distanceFallOff.value, 0);
assert.equal(node.scale.value, 1);
assert.equal(node.samples.value, 4);
assert.equal(node.resolutionScale, 1);
assert.equal(node._sourceNoiseTexture.image.width, 64);
assert.equal(node._sourceNoiseTexture.image.height, 64);
assert.equal(node._sourceNoiseTexture.wrapS, RepeatWrapping);
assert.equal(node._sourceNoiseTexture.wrapT, RepeatWrapping);
assert.equal(node._sourceNoiseTexture.minFilter, NearestFilter);
assert.equal(node._sourceNoiseTexture.magFilter, NearestFilter);
node.dispose();

assert.equal(UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT.methodCvar, 0);
assert.match(
  UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT.remainingBridges.join('\n'),
  /WedgeWithNormal/,
);
assert.match(
  UE_SOURCE_AMBIENT_OCCLUSION_CONTRACT.remainingBridges.join('\n'),
  /deferred application/,
);

const showcaseSource = readFileSync(resolve(
  ROOT_DIR,
  'examples',
  'source-showcase',
  'main.js',
), 'utf8');
assert.match(showcaseSource, /ueSourceAmbientOcclusion\(/);
assert.doesNotMatch(
  showcaseSource,
  /from 'three\/examples\/jsm\/tsl\/display\/GTAONode\.js'/,
);
assert.match(showcaseSource, /ambientOcclusionRuntimeBridge/);

console.log('UE source ambient occlusion verification passed');
