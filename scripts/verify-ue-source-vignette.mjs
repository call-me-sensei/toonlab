#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  UE_SOURCE_VIGNETTE_DEFAULTS,
  evaluateUeSourceVignetteMask,
  resolveUeSourceVignetteSettings,
} from '../src/environment/ueSourceVignette.js';

function nearlyEqual(actual, expected, epsilon = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

const source = resolveUeSourceVignetteSettings({
  vignette_intensity: 0.4000000059604645,
});
assert.deepEqual(source.color, [0, 0, 0]);
assert.deepEqual(source.center, [0.5, 0.5]);
assert.equal(source.type, 'CosineFourthLaw');
nearlyEqual(source.aspectRatio, 9 / 16);
nearlyEqual(source.intensity, 0.4000000059604645);

assert.deepEqual(evaluateUeSourceVignetteMask([0.5, 0.5], source), [1, 1, 1]);
const cornerWeight = (1 / (1 + 2 * source.intensity ** 2)) ** 2;
for (const uv of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
  const mask = evaluateUeSourceVignetteMask(uv, source);
  for (const channel of mask) nearlyEqual(channel, cornerWeight);
}

assert.deepEqual(
  evaluateUeSourceVignetteMask([0, 0], {
    ...UE_SOURCE_VIGNETTE_DEFAULTS,
    intensity: 0,
  }),
  [1, 1, 1],
);

console.log('UE source vignette verification passed');
