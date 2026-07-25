#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RGBFormat, UnsignedInt101111Type } from 'three';
import { vec4 } from 'three/tsl';

import {
  UE_SOURCE_STANDARD_BLOOM_STAGES,
  UeSourceStandardBloomNode,
  computeUeSourceBloomDcGain,
  computeUeSourceBloomStageResolutions,
  computeUeSourceGaussianKernel,
  evaluateUeSourceBloomThreshold,
  resolveUeSourceBloomSettings,
} from '../src/environment/ueSourceBloom.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const manifest = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'demo-scenes',
  'Demonstration_SnowPines.json',
), 'utf8'));

const post = (manifest.renderState?.components ?? []).find(
  (component) => component.componentClass === 'PostProcessComponent'
    && component.properties?.unbound === true,
)?.postProcessSettings;
assert.ok(post, 'SnowPines unbound post-process settings are missing');
assert.equal(post.bloom_method, '<BloomMethod.BM_SOG: 0>');
assert.equal(post.bloom_intensity, 5);
assert.equal(post.bloom_threshold, 0.5);
assert.equal(manifest.projectSettings?.scalability?.['sg.PostProcessQuality'], 3);

const close = (actual, expected, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};

const resolved = resolveUeSourceBloomSettings(post);
assert.equal(resolved.quality, 5);
assert.equal(resolved.stageCount, 6);
assert.equal(resolved.sizeScale, 4);
assert.equal(resolved.filterSizeScale, 1);
assert.deepEqual(resolved.legacyLuminanceFactors, [0.3, 0.59, 0.11]);
assert.deepEqual(resolved.stages, UE_SOURCE_STANDARD_BLOOM_STAGES.map((stage) => ({
  size: stage.size,
  tint: [...stage.tint],
})));
close(resolved.tintScale, 5 / 6);

// UE's desktop post chain explicitly uses PF_FloatR11G11B10 without alpha.
// Lock the corresponding WebGPU `rg11b10ufloat` target contract for every
// quantization boundary, including the distinct half-resolution scene copy.
const bloomNode = new UeSourceStandardBloomNode(vec4(0), post);
for (const target of [
  bloomNode._halfResolutionSceneTarget,
  ...bloomNode._sourceTargets,
  ...bloomNode._horizontalTargets,
  ...bloomNode._verticalTargets,
]) {
  assert.equal(target.texture.format, RGBFormat);
  assert.equal(target.texture.type, UnsignedInt101111Type);
}
bloomNode.dispose();

// PostProcessBloom.usf uses a linear saturating ramp, not smoothstep or a
// channel-wise threshold. With exposure fixed to one, luma 1 at threshold .5
// contributes exactly one quarter of the input.
const whiteThreshold = evaluateUeSourceBloomThreshold([1, 1, 1], resolved);
close(whiteThreshold.luminance, 1);
close(whiteThreshold.amount, 0.25);
whiteThreshold.color.forEach((channel) => close(channel, 0.25));
close(evaluateUeSourceBloomThreshold([0.5, 0.5, 0.5], resolved).amount, 0);
close(evaluateUeSourceBloomThreshold([3, 3, 3], resolved).amount, 1);

// The six default tints sum to .7951. UE scales every stage by intensity / 6,
// so intensity 5 yields a .6625833 maximum DC gain—not a five-times add.
const dcGain = computeUeSourceBloomDcGain(resolved);
dcGain.forEach((channel) => close(channel, 0.6625833333333334));
close(dcGain[0] * whiteThreshold.amount, 0.16564583333333336);

// Native references are 1920x1080. GetDownscaledExtent divides and rounds up
// at every level, which matters for the odd 135 -> 68 and 17-pixel stages.
assert.deepEqual(computeUeSourceBloomStageResolutions(1920, 1080), [
  { width: 960, height: 540 },
  { width: 480, height: 270 },
  { width: 240, height: 135 },
  { width: 120, height: 68 },
  { width: 60, height: 34 },
  { width: 30, height: 17 },
]);

// Bloom1 at 1920 is 960 * (.3 * 4)% / 2 = 5.76 pixels. These independent
// fixtures lock UE's -16.7 legacy Gaussian, bilinear tap packing, normalized
// weights, and the asymmetric packed offsets.
const kernel = computeUeSourceGaussianKernel(5.76);
assert.equal(kernel.integerRadius, 6);
assert.equal(kernel.samples.length, 7);
close(kernel.samples[0].offset, -5.00392338940536);
close(kernel.samples[0].weight, 0.0000013771995507529756);
close(kernel.samples[3].offset, 0.37675334039233954);
close(kernel.samples[3].weight, 0.6422451800679698);
close(kernel.samples[6].offset, 6);
close(kernel.samples[6].weight, 5.403290126491216e-9, 1e-18);
close(kernel.samples.reduce((sum, sample) => sum + sample.weight, 0), 1);

// Desktop's static shader loop admits 32 packed samples, hence broad Bloom5
// and Bloom6 clamp to a radius of 31 pixels at 1920x1080.
const broadKernel = computeUeSourceGaussianKernel(38.4);
close(broadKernel.clampedRadius, 31);
assert.equal(broadKernel.integerRadius, 31);
assert.equal(broadKernel.samples.length, 32);

const showcaseSource = readFileSync(resolve(
  ROOT_DIR,
  'examples',
  'source-showcase',
  'main.js',
), 'utf8');
// UE runs Standard Bloom after the main temporal upscaler. The post-order
// verifier separately pins the full DOF -> AfterDOF -> TAA -> Bloom sequence;
// this focused gate keeps Bloom attached to that resolved scene boundary.
assert.match(showcaseSource, /ueSourceStandardBloom\(resolvedSceneColor/);
assert.doesNotMatch(showcaseSource, /from 'three\/examples\/jsm\/tsl\/display\/BloomNode\.js'/);

console.log('UE source Standard Bloom verification passed');
