import assert from 'node:assert/strict';

import * as assetPolicy from '@call-me-sensei/toonlab/asset-policy';
import * as groundShader from '@call-me-sensei/toonlab/ground-shader';
import * as styles from '@call-me-sensei/toonlab/styles';
import * as vegetation from '@call-me-sensei/toonlab/vegetation';

let checks = 0;
function awaitable(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

const pending = [];
function test(label, callback) {
  pending.push(awaitable(callback()).then(() => {
    checks += 1;
    console.log(`ok   ${label}`);
  }));
}

test('Call Me Sensei is a complete anime-game style bundle', () => {
  const bundle = styles.CALL_ME_SENSEI_STYLE_BUNDLE;
  assert.equal(bundle.version, 2);
  assert.equal(bundle.artDirection.family, 'anime-game');
  assert.equal(bundle.artDirection.rendering, 'cel-shaded');
  assert.deepEqual(
    Object.keys(bundle.slots).sort(),
    [...styles.CALL_ME_SENSEI_STYLE_SLOT_IDS].sort(),
  );
  assert.deepEqual(styles.getFirstPartyStyleBundle('call_me_sensei'), bundle);
  assert.equal(styles.getFirstPartyStyleBundle('call-me-sensei'), bundle);
  assert.deepEqual(bundle.coverage.unsupported, ['lighting', 'vfx', 'renderer']);
});

test('v1 bundles migrate visual slots and report asset identity', () => {
  const parsed = styles.parseStyleBundleDocument({
    description: 'Legacy test',
    id: 'legacy',
    label: 'Legacy',
    schema: styles.STYLE_BUNDLE_DOCUMENT_TYPE,
    slots: {
      grass: { style: 'call_me_sensei' },
      tree: { creation: 'tree-1' },
      vegetationShader: { style: 'call_me_sensei' },
      water: { style: 'call_me_sensei' },
    },
    version: 1,
  });
  assert.equal(parsed.ok, true, parsed.errors?.join(' '));
  assert.equal(parsed.value.version, 2);
  assert.deepEqual(parsed.value.slots.treeShader, { style: 'call_me_sensei' });
  assert.deepEqual(parsed.value.slots.grassShader, { style: 'call_me_sensei' });
  assert.deepEqual(parsed.value.slots.flowerShader, { style: 'call_me_sensei' });
  assert.equal(parsed.value.slots.tree, undefined);
  assert.deepEqual(parsed.legacyAssetSelections.tree, { creation: 'tree-1' });
  assert.deepEqual(parsed.legacyAssetSelections.grass, { style: 'call_me_sensei' });
  assert.ok(parsed.warnings.some((warning) => warning.includes('asset slot')));
  assert.equal(JSON.parse(styles.serializeStyleBundle(parsed.value)).version, 2);
});

test('strict style application preflights before mutation', async () => {
  let mutations = 0;
  const valid = {
    apply: () => { mutations += 1; },
    domain: 'character',
    id: 'hero',
    subject: {},
  };
  const invalid = { domain: 'unknown', id: 'mystery', subject: {} };
  await assert.rejects(
    styles.applyStyleBundle(styles.CALL_ME_SENSEI_STYLE_BUNDLE, {
      targets: [valid, invalid],
    }),
    styles.StyleBundleApplicationError,
  );
  assert.equal(mutations, 0);

  const targets = Object.keys(styles.STYLE_DOMAIN_SLOT_ROUTES).map((domain) => ({
    apply: (_subject, settings) => {
      assert.ok(settings);
      mutations += 1;
    },
    domain,
    id: domain,
    subject: {},
  }));
  const result = await styles.applyStyleBundle(
    styles.CALL_ME_SENSEI_STYLE_BUNDLE,
    { targets },
  );
  assert.equal(result.applied.length, targets.length);
  assert.equal(mutations, targets.length);
});

test('custom adapters create explicit feedback gaps', () => {
  const audit = styles.auditStyleBundleApplication(
    styles.CALL_ME_SENSEI_STYLE_BUNDLE,
    [{
      adapter: { apply() {}, custom: true, id: 'studio-renderer' },
      domain: 'prop',
      id: 'custom-prop',
      subject: {},
    }],
  );
  assert.equal(audit.ok, true);
  assert.equal(audit.gaps.length, 1);
  assert.equal(audit.gaps[0].kind, 'custom-shader-adapter');
});

test('asset policy supports ask/advisory, strict, and open decisions', () => {
  const missing = assetPolicy.evaluateAssetCandidate(null, {
    domain: 'natural.rock',
    sourceClass: 'external-cc0',
  });
  assert.equal(missing.allowed, true);
  assert.equal(missing.decision, 'warn');
  assert.equal(missing.needsDeveloperDecision, true);

  const strict = assetPolicy.CALL_ME_SENSEI_STRICT_ASSET_POLICY;
  assert.equal(assetPolicy.evaluateAssetCandidate(strict, {
    domain: 'natural.rock', sourceClass: 'toonlab-gallery',
  }).allowed, true);
  assert.equal(assetPolicy.evaluateAssetCandidate(strict, {
    domain: 'natural.rock', sourceClass: 'procedural',
  }).allowed, false);
  assert.equal(assetPolicy.evaluateAssetCandidate(strict, {
    domain: 'vegetation.tree', sourceClass: 'procedural',
  }).allowed, true, 'the supported package BranchTree satisfies strict tree sourcing');

  const open = assetPolicy.createAssetSourcingPolicy('open-test', { mode: 'open' });
  assert.equal(assetPolicy.evaluateAssetCandidate(open, {
    domain: 'vegetation.tree', sourceClass: 'custom',
  }).allowed, true);
});

test('gap reports are machine and human readable', () => {
  const gap = assetPolicy.createAssetGapRecord({
    domain: 'cloud',
    feedbackNeeded: 'Add a supported cloud adapter.',
    id: 'custom-cloud',
    kind: 'custom-shader',
    reason: 'No supported renderer matched.',
  });
  const markdown = assetPolicy.renderAssetGapReport([gap]);
  assert.equal(gap.schema, assetPolicy.ASSET_GAP_DOCUMENT_TYPE);
  assert.match(markdown, /custom-cloud/);
  assert.match(markdown, /Add a supported cloud adapter/);
});

test('public ground and vegetation barrels contain no internal-reference API names', () => {
  for (const module of [groundShader, vegetation]) {
    assert.deepEqual(
      Object.keys(module).filter((name) => /p18/i.test(name)),
      [],
    );
  }
  assert.equal(typeof groundShader.createGroundShaderMaterial, 'function');
  assert.equal(typeof groundShader.applyGroundShader, 'function');
});

await Promise.all(pending);
console.log(`\nStyle contract verified: ${checks} groups.`);
