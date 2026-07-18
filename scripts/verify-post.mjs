import assert from 'node:assert/strict';

import {
  createGeneratedPostPresetDocument,
  createPostGeneratorRecipe,
  parsePostGeneratorRecipe,
  registerPostGeneratorFamily,
  resolvePostGeneratorRecipe,
  serializePostGeneratorRecipe,
} from '../src/post/index.js';

const recipe = createPostGeneratorRecipe('verification', {
  seed: 42,
  locks: ['parameters.exposure'],
  configuration: { parameters: { exposure: 1.07 } },
});
const a = resolvePostGeneratorRecipe(recipe);
const b = resolvePostGeneratorRecipe(recipe);
assert.deepEqual(a.features, b.features);
assert.equal(a.parameters.exposure, 1.07);

const serialized = serializePostGeneratorRecipe(recipe);
const parsed = parsePostGeneratorRecipe(serialized);
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.value, recipe);

const signatures = new Set();
for (let seed = 1; seed <= 10_000; seed += 1) {
  const generated = resolvePostGeneratorRecipe({ ...recipe, seed });
  assert.equal(Number.isFinite(generated.parameters.exposure), true);
  assert.ok(generated.parameters.bloomLevels <= 5);
  signatures.add(JSON.stringify({
    features: generated.features,
    parameters: {
      bloomRadius: generated.parameters.bloomRadius,
      contrast: generated.parameters.contrast,
      saturation: generated.parameters.saturation,
      warmth: generated.parameters.warmth,
    },
  }));
}
assert.ok(signatures.size > 9_500, `expected diverse results, got ${signatures.size}`);

registerPostGeneratorFamily('verification-custom', {
  basePreset: 'off',
  domains: {
    features: { enabled: { $type: 'constant', value: true } },
    parameters: { exposure: { $type: 'range', min: 0.9, max: 0.9 } },
  },
});
const custom = resolvePostGeneratorRecipe(createPostGeneratorRecipe('custom', {
  family: 'verification-custom', seed: 1,
}));
assert.equal(custom.features.enabled, true);
assert.equal(custom.parameters.exposure, 0.9);

const mobile = resolvePostGeneratorRecipe(recipe, { quality: 'mobile' });
assert.equal(mobile.features.motionBlur, false);
assert.equal(mobile.features.screenOutline, false);
assert.equal(mobile.parameters.bloomMode, 'single');

const preset = createGeneratedPostPresetDocument(recipe);
assert.equal(preset.type, 'toonlab/post-processing-preset');
assert.equal('lutMap' in (preset.settings.parameters ?? {}), false);

console.log(`post generator verifier passed (${signatures.size} unique results / 10,000 seeds)`);
