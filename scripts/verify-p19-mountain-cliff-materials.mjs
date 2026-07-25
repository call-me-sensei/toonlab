#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = resolve(
  ROOT_DIR,
  'assets-local/parity/environment/p19-mountain-cliff.json',
);
const PROFILES_PATH = resolve(
  ROOT_DIR,
  'assets-local/parity/single-rock/profiles.json',
);
const MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/material-source/manifest.json',
);
const SOURCE_CONTENT_PATH = resolve(
  ROOT_DIR,
  'src/environment/sourceEnvironmentTestContent.js',
);
const PARITY_HARNESS_PATH = resolve(
  ROOT_DIR,
  'examples/tri-engine-parity/main.js',
);

const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
const profiles = JSON.parse(readFileSync(PROFILES_PATH, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const sourceContent = readFileSync(SOURCE_CONTENT_PATH, 'utf8');
const parityHarness = readFileSync(PARITY_HARNESS_PATH, 'utf8');

assert.equal(contract.schema, 'toonlab.p19-mountain-cliff-contract');
assert.equal(contract.version, 2);
assert.equal(contract.checkpoint, 'P19');
assert.equal(contract.policy.mutableFamily, 'mountain-cliff');
assert.deepEqual(contract.policy.inheritsAcceptedNature, [
  'ground',
  'grass',
  'tree',
  'flowers',
]);
assert.ok(contract.policy.excludedFamilies.includes('stylized-basic'));
assert.ok(contract.policy.excludedFamilies.includes('imported-props'));
assert.equal(contract.policy.geometry, 'exact source LOD0');
assert.equal(contract.fixtures.length, 2);

const expectedFixtures = new Map([
  [
    'SM_Mountain01',
    {
      material:
        '/Game/SoStylized/Environment/Rocks/Materials/Mountain/MI_Mountain.MI_Mountain',
      parent:
        '/Game/SoStylized/Environment/Rocks/Materials/M_Mountain.M_Mountain',
      url:
        '/assets-local/sostylized/catalog-meshes/Rocks/Mountains/SM_Mountain01/lod0.glb',
      unrealMesh:
        '/Game/SoStylized/Environment/Rocks/Mountains/SM_Mountain01.SM_Mountain01',
    },
  ],
  [
    'SM_CliffClassic5',
    {
      material:
        '/Game/SoStylized/Environment/Rocks/Materials/Classic/MI_RockClassic_Cliff.MI_RockClassic_Cliff',
      parent:
        '/Game/SoStylized/Environment/Rocks/Materials/M_Rock.M_Rock',
      url:
        '/assets-local/sostylized/catalog-meshes/Rocks/Classic/SM_CliffClassic5/lod0.glb',
      unrealMesh:
        '/Game/SoStylized/Environment/Rocks/Classic/SM_CliffClassic5.SM_CliffClassic5',
    },
  ],
]);

for (const fixture of contract.fixtures) {
  const expected = expectedFixtures.get(fixture.sourceAssetName);
  assert.ok(expected, `${fixture.sourceAssetName} is not an approved P19 fixture`);
  assert.equal(fixture.sourceGlb, expected.url);
  assert.equal(fixture.unrealMesh, expected.unrealMesh);
  assert.equal(fixture.sourceMaterial, expected.material);
  assert.match(fixture.grounding, /world-bounds-min/u);
  assert.equal(fixture.castShadow, true);
  assert.equal(fixture.receiveShadow, true);
  assert.equal(
    fixture.toonlabSourceScaleMultiplier,
    100,
    `${fixture.sourceAssetName} must preserve native UE world-space material units`,
  );
  assert.ok(
    Math.abs(
      fixture.scale * fixture.toonlabSourceScaleMultiplier
        - fixture.nativeUnrealScale,
    ) < 1e-9,
    `${fixture.sourceAssetName} ToonLab and Unreal resolved actor scales differ`,
  );
  assert.equal(fixture.grassExclusion.shape, 'oriented-box');
  assert.equal(fixture.positionMeters.length, 3);
  assert.ok(Number.isFinite(fixture.scale) && fixture.scale > 0);
  if (fixture.sourceAssetName === 'SM_Mountain01') {
    assert.equal(
      fixture.grounding,
      'explicit-retained-terrain-edge-probe-plus-world-bounds-min',
    );
    assert.deepEqual(fixture.groundingProbeMeters, [-3, -30]);
  } else {
    assert.ok(
      fixture.burialDepthMeters > 0,
      'The hero cliff must declare an authored terrain burial depth',
    );
  }

  const localGlb = resolve(ROOT_DIR, `.${fixture.sourceGlb}`);
  assert.ok(existsSync(localGlb), `${fixture.sourceAssetName} LOD0 GLB is missing`);

  const mesh = manifest.meshes.find(
    (candidate) => candidate.sourceAssetName === fixture.sourceAssetName,
  );
  assert.ok(mesh, `${fixture.sourceAssetName} is missing from the source manifest`);
  assert.deepEqual(mesh.materials, [expected.material]);

  const material = manifest.materials.find(
    (candidate) => candidate.path === expected.material,
  );
  assert.ok(material, `${expected.material} is missing from the source manifest`);
  assert.equal(material.chain.at(-1), expected.parent);
}

const profile = profiles.profiles.find(
  (candidate) => candidate.id === 'p19-visual-target-mountain-cliff',
);
assert.ok(profile, 'P19 profile is missing');
assert.equal(profile.materialCheckpoint, 'mountain-cliff');
assert.equal(
  profile.inherits,
  'p17-visual-target-flowers',
  'P19 nature work must bypass the isolated P18 imported-prop experiment',
);
assert.deepEqual(profile.changes, ['mountainCliff']);
assert.deepEqual(
  profile.acceptance.mountainCliffOnlyIsolation.changedModules,
  ['mountainCliff'],
);
assert.ok(
  profile.acceptance.mountainCliffOnlyIsolation.excludedModules
    .includes('stylizedBasic'),
);
assert.ok(
  profile.acceptance.mountainCliffOnlyIsolation.excludedModules
    .includes('importedProps'),
);
assert.match(profile.modules.mountainMaterial, /M_Mountain/u);
assert.match(profile.modules.cliffMaterial, /M_Rock/u);
assert.match(profile.modules.stylizedBasic, /excluded/u);

assert.match(
  sourceContent,
  /materialCheckpoint === P19_MOUNTAIN_CLIFF_CHECKPOINT/u,
);
assert.match(
  sourceContent,
  /loadRockReferenceSourceMaterialProfile\(\s*fixture\.sourceMaterial/u,
);
assert.match(sourceContent, /createP19MountainCliffFixtures/u);
assert.match(sourceContent, /createContractGrassExclusionZones/u);
assert.match(
  sourceContent,
  /object\.position\.y \+= terrainY - bounds\.min\.y - burialDepthMeters/u,
);
assert.match(
  sourceContent,
  /fixture\.toonlabSourceScaleMultiplier/u,
  'P19 must apply the explicit source-unit adapter before material evaluation',
);
assert.match(sourceContent, /burialDepthMeters/u);
assert.match(sourceContent, /fixture\.groundingProbeMeters/u);
assert.match(sourceContent, /groundedWorldBoundsMeters/u);
assert.match(
  sourceContent,
  /P18 props are intentionally absent/u,
);
assert.match(
  sourceContent,
  /const visualTargetStylizedBasic =\s*materialCheckpoint === P18_STYLIZED_BASIC_CHECKPOINT/u,
  'P19 must not activate P18 props through checkpoint inheritance',
);

assert.match(
  parityHarness,
  /'mountain-cliff',\s*\]\.includes\(contract\.materialCheckpoint\)/u,
);
assert.match(parityHarness, /P19 · MOUNTAIN\/CLIFF ONLY/u);
assert.match(parityHarness, /P18 props excluded/u);
assert.match(parityHarness, /p19-source-\$\{rockView\}-bounds-fit/u);
assert.match(parityHarness, /classic-cliff-control/u);
assert.match(
  parityHarness,
  /const projectedBoundsDistance = corners\.reduce/u,
  'P19 complete-asset views must fit the projected source bounds',
);
assert.match(
  parityHarness,
  /function isolateP19NatureReview/u,
  'P19 must provide a family-isolated material review mode',
);
assert.match(
  parityHarness,
  /Camera-only material inspection\. The integrated front\/back views retain all accepted nature families\./u,
  'P19 review isolation must remain explicitly camera-only',
);
assert.match(
  parityHarness,
  /const usesP19NatureProfile = contentMode === 'environment'/u,
  'P19 must own an explicit native-capture availability gate',
);
assert.match(
  parityHarness,
  /&& !usesP19NatureProfile/u,
  'P19 must not recycle the legacy P13 environment captures',
);
assert.match(
  parityHarness,
  /const usesP19NativeUnrealCapture = usesP19NatureProfile/u,
  'P19 must own an explicit native Unreal capture gate',
);
assert.match(
  parityHarness,
  /P19_UNREAL_CAPTURE_ROOT/u,
  'P19 must use its own native Unreal frame set',
);
assert.match(
  parityHarness,
  /'mountain-surface': 4/u,
  'P19 native views must include the dedicated mountain surface crop',
);
assert.match(
  parityHarness,
  /native P19 · UE comparison authority/u,
  'P19 must identify the actual native UE comparison authority',
);
assert.match(
  parityHarness,
  /function allowedRockViews\(profileId/u,
  'The parity harness must declare profile-scoped camera views',
);
assert.match(
  parityHarness,
  /return \['front', 'back', 'mountain', 'mountain-surface', 'cliff'\]/u,
  'P19 must exclude the P18-only bench camera',
);
assert.match(
  parityHarness,
  /const normalizedRockView = normalizeRockView\(/u,
  'P19 must normalize stale camera URLs before scene construction',
);
assert.match(
  parityHarness,
  /mode: 'unsupported-view-front-fallback'/u,
  'The camera helper must fail safe when an unsupported view bypasses normalization',
);

console.log(
  'P19 mountain/cliff verification passed: exact source LOD0 fixtures, '
  + 'M_Mountain/M_Rock ancestry, terrain grounding, shadow flags, '
  + 'grass exclusion, and P18 prop isolation are sealed.',
);
