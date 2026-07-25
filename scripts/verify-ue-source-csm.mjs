#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  DirectionalLight,
  Matrix4,
  Vector3,
} from 'three';

import {
  computeUeCascadeRange,
  computeUeShadowMapLayout,
  computeUeShadowSnapPeriod,
  computeUeStableCascadeSphere,
} from '../src/environment/ueSourceCsmShadowNode.js';
import { computeUeCascadeBreaks } from '../src/environment/ueSourceLighting.js';
import {
  UeManual5x5PcfShadowFilter,
  applyUeDirectionalShadowFilterContract,
  computeUeDirectionalCasterDepthBias,
  computeUeDirectionalShadowBiasContract,
  computeUeManual5x5Pcf,
  computeUeShadowVisibility,
} from '../src/environment/ueSourceShadowFilter.js';

const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};

// Symmetric 90-degree, aspect-one perspective sub-frustum. UE's ideal center
// clamps to the far plane for this wide fixture and the final radius is
// rounded up from sqrt(50) metres to the next whole centimetre.
const projection = new Matrix4().makePerspective(-1, 1, 1, -1, 1, 100);
const nearVertices = [
  new Vector3(1, 1, -1),
  new Vector3(1, -1, -1),
  new Vector3(-1, 1, -1),
  new Vector3(-1, -1, -1),
];
const farVertices = [
  new Vector3(5, 5, -5),
  new Vector3(5, -5, -5),
  new Vector3(-5, 5, -5),
  new Vector3(-5, -5, -5),
];
const sphere = computeUeStableCascadeSphere({
  farVertices,
  nearVertices,
  projectionMatrix: projection,
});
close(sphere.splitNear, 1);
close(sphere.splitFar, 5);
close(sphere.centerDepth, 5);
assert.deepEqual(sphere.center.toArray(), [0, 0, -5]);
close(sphere.radius, 7.08);

// Epic SnowPines source splits: exponent three, four cascades, 5 cm camera
// near plane and 300 m CSM distance.
const breaks = computeUeCascadeBreaks({
  cascadeCount: 4,
  exponent: 3,
  near: 0.05,
  far: 300,
});
const splitEnds = breaks.map((value) => value * 300);
const expectedSplitEnds = [7.54875, 30.045, 97.53375, 300];
splitEnds.forEach((value, index) => close(value, expectedSplitEnds[index], 1e-9));

// The fourth raster cascade overlaps the following 300-512 m distance-field
// cascade by ten percent of its own range.
const finalRange = computeUeCascadeRange({
  splitNear: expectedSplitEnds[2],
  splitFar: expectedSplitEnds[3],
  transitionFraction: 0.1,
  extendsToAnotherCascade: true,
});
close(finalRange.extension, 20.246625, 1e-9);
close(finalRange.extendedFar, 320.246625, 1e-9);

// Metal CSM uses a 2048 physical target with a four-texel border: projection,
// stabilization and bias use its 2040-texel interior resolution.
const shadowLayout = computeUeShadowMapLayout(2048, 4);
assert.deepEqual(shadowLayout, {
  border: 4,
  boundsScale: 2048 / 2040,
  interior: 2040,
  physical: 2048,
  projectionScale: 2040 / 2048,
});
close(computeUeShadowSnapPeriod(7.08, shadowLayout.interior, 4), 0.02776470588235294);

// FProjectedShadowInfo::UpdateShaderDepthBias() and ComputeTransitionSize()
// with the source directional-light defaults. The first cascade is clamped
// to a 100 m subject interval and fitted to the 7.08 m sphere above.
const bias = computeUeDirectionalShadowBiasContract({
  radius: 7.08,
  resolution: shadowLayout.interior,
  subjectDepthRange: 100,
  userShadowBias: 0.5,
  userShadowSlopeBias: 0.5,
});
close(bias.baseDepthBias, 0.1);
close(bias.worldSpaceTexelScale, 7.08 / 2040);
close(bias.depthBias, 0.00017352941176470588);
close(bias.transitionSize, bias.depthBias);
close(bias.transitionScale, 1 / bias.depthBias);
close(bias.slopeScaleDepthBias, 1.5);
close(bias.slopeDepthBias, 0.00026029411764705884);
close(bias.receiverTransitionFloor, 0.1);

// ComputeDepthBiasDirectionalSpot() clamps the grazing-angle slope to one.
const facingBias = computeUeDirectionalCasterDepthBias(1, bias);
close(facingBias.slope, 0);
close(facingBias.totalDepthBias, bias.depthBias);
const grazingBias = computeUeDirectionalCasterDepthBias(Math.SQRT1_2, bias);
close(grazingBias.slope, 1);
close(grazingBias.totalDepthBias, bias.depthBias + bias.slopeDepthBias);

// Opaque CalculateShadowVisibilityTransmittanceFactor() is a linear depth
// ramp, not a hardware binary comparison. The uniform caster bias is folded
// into the receiver comparison for Three's orthographic depth map.
close(computeUeShadowVisibility({
  constantDepthBias: bias.depthBias,
  sceneDepth: 0.5,
  shadowDepth: 0.5 - bias.depthBias,
  transitionScale: bias.transitionScale,
}), 1);
close(computeUeShadowVisibility({
  constantDepthBias: bias.depthBias,
  sceneDepth: 0.5,
  shadowDepth: 0.5 - 1.5 * bias.depthBias,
  transitionScale: bias.transitionScale,
}), 0.5);
close(computeUeShadowVisibility({
  constantDepthBias: bias.depthBias,
  sceneDepth: 0.5,
  shadowDepth: 0.5 - 2 * bias.depthBias,
  transitionScale: bias.transitionScale,
}), 0);

// Manual5x5PCF reconstructs a 5x5 tent from a 6x6 gather footprint. Its
// separable weights always sum to 25 before the literal 0.04 normalization.
const allVisible = Array.from({ length: 6 }, () => Array(6).fill(1));
close(computeUeManual5x5Pcf(allVisible, [0, 0]), 1);
close(computeUeManual5x5Pcf(allVisible, [0.37, 0.82]), 1);
const cornerOnly = Array.from({ length: 6 }, () => Array(6).fill(0));
cornerOnly[0][0] = 1;
close(computeUeManual5x5Pcf(cornerOnly, [0.25, 0.75]), 0.0075);
assert.throws(
  () => computeUeManual5x5Pcf([[1]], [0, 0]),
  /requires a 6x6 visibility sample grid/,
);

const testLight = new DirectionalLight();
applyUeDirectionalShadowFilterContract(testLight.shadow, bias);
assert.equal(testLight.shadow.filterNode, UeManual5x5PcfShadowFilter);
assert.equal(testLight.shadow.ueSourceFilter, 'Manual5x5PCF');
close(testLight.shadow.ueConstantDepthBias, bias.depthBias);
close(testLight.shadow.ueTransitionScale, bias.transitionScale);
assert.ok(testLight.shadow.ueLightDirectionToLight.isVector3);

assert.throws(
  () => computeUeStableCascadeSphere({}),
  /requires near\/far vertices and a projection matrix/,
);

console.log('UE source CSM verification passed');
