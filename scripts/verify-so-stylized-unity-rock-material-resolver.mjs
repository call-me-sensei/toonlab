#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_SO_STYLIZED_UNITY_ROCK_MATERIAL_LIBRARY_URL,
  SO_STYLIZED_UE_ROCK_MATERIAL_CROSSWALK,
  SO_STYLIZED_UE_ROCK_MATERIAL_FALLBACKS,
  SO_STYLIZED_UNITY_ROCK_MATERIAL_LIBRARY_SCHEMA,
  SO_STYLIZED_UNITY_ROCK_MATERIAL_LIBRARY_SCHEMA_VERSION,
  SO_STYLIZED_UNITY_ROCK_PROFILES,
  createSoStylizedUnityRockMaterialIndex,
  loadSoStylizedUnityRockMaterialLibrary,
  normalizeSoStylizedRockMaterialReference,
  resolveSoStylizedUnityRockMaterial,
  resolveSoStylizedUnityRockProfile,
} from '../src/environment/soStylizedUnityRockMaterialResolver.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(packageRoot, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, relativePath), 'utf8'));
}

assert.equal(SO_STYLIZED_UNITY_ROCK_PROFILES.length, 42);
assert.equal(new Set(SO_STYLIZED_UNITY_ROCK_PROFILES.map(({ id }) => id)).size, 42);
assert.equal(
  new Set(SO_STYLIZED_UNITY_ROCK_PROFILES.map(({ sourceName }) => sourceName)).size,
  42,
);
assert.equal(Object.keys(SO_STYLIZED_UE_ROCK_MATERIAL_CROSSWALK).length, 42);
assert.equal(Object.keys(SO_STYLIZED_UE_ROCK_MATERIAL_FALLBACKS).length, 28);

for (const descriptor of SO_STYLIZED_UNITY_ROCK_PROFILES) {
  const sourceFile = path.join(
    workspaceRoot,
    'SoStylized-Unity',
    descriptor.assetPath,
  );
  assert.ok(fs.existsSync(sourceFile), `Missing Unity material ${sourceFile}`);
  assert.equal(resolveSoStylizedUnityRockProfile(descriptor.id)?.sourceName, descriptor.sourceName);
  assert.equal(
    resolveSoStylizedUnityRockProfile(descriptor.sourceName)?.id,
    descriptor.id,
  );
}

// Exercise the checked-in extractor output as the primary contract. The
// synthetic fixture below remains useful for deterministic loader/error tests,
// but it must not be able to hide a drift between the extractor and resolver.
const extractedManifest = readJson('assets-local/sostylized-unity/rock-material-library.json');
const actualExtractedIndex = createSoStylizedUnityRockMaterialIndex(extractedManifest);
assert.equal(actualExtractedIndex.materials.length, 42);
for (const descriptor of SO_STYLIZED_UNITY_ROCK_PROFILES) {
  const resolution = resolveSoStylizedUnityRockMaterial(descriptor.id, {
    index: actualExtractedIndex,
  });
  assert.equal(resolution.materialRecord.name, descriptor.unityMaterialName);
  assert.equal(resolution.materialRecord.assetPath, descriptor.assetPath);
}

assert.equal(
  normalizeSoStylizedRockMaterialReference(
    "MaterialInstanceConstant'/Game/SoStylized/Environment/Rocks/Materials/Classic/"
      + "MI_RockClassic_Cliff.MI_RockClassic_Cliff'",
  ),
  'MI_RockClassic_Cliff',
);
assert.equal(
  resolveSoStylizedUnityRockProfile('M_RockClassic_BoulderClumps')?.id,
  'classic-boulder-clumps',
);
assert.equal(
  resolveSoStylizedUnityRockProfile('MI_RockDesert_001')?.id,
  'desert',
);
assert.equal(
  resolveSoStylizedUnityRockProfile('MV_RockClassic_Shelves NoGrass.mat')?.id,
  'classic-shelves-no-grass',
);

const sourceManifest = readJson('assets-local/sostylized/material-source/manifest.json');
const sourceRockMaterials = sourceManifest.materials.filter(({ path: materialPath }) =>
  materialPath.includes('/Environment/Rocks/Materials/'));
let directSourceProfiles = 0;
let fallbackSourceProfiles = 0;
for (const material of sourceRockMaterials) {
  const direct = resolveSoStylizedUnityRockProfile(material);
  if (direct) {
    assert.equal(direct.isExact, true);
    directSourceProfiles += 1;
    continue;
  }
  const fallback = resolveSoStylizedUnityRockProfile(material, { allowFallback: true });
  assert.ok(fallback, `Unmapped source material ${material.path}`);
  assert.equal(fallback.isExact, false);
  fallbackSourceProfiles += 1;
}
assert.equal(sourceRockMaterials.length, 70);
assert.equal(directSourceProfiles, 42);
assert.equal(fallbackSourceProfiles, 28);

const referenceManifest = readJson('assets-local/rock-references/material-source/manifest.json');
const resolvedReferenceProfiles = new Set();
for (const mesh of referenceManifest.meshes) {
  const materialPath = mesh.materials.find(Boolean);
  const resolution = resolveSoStylizedUnityRockProfile(materialPath, {
    sourceAssetName: mesh.sourceAssetName,
  });
  assert.ok(resolution, `Unmapped reference mesh ${mesh.sourceAssetName}: ${materialPath}`);
  assert.equal(resolution.isExact, true);
  resolvedReferenceProfiles.add(resolution.id);
}
assert.equal(referenceManifest.meshes.length, 324);
// The source inventory has 23 assigned material paths. Unity splits Desert
// shelves and platforms into two profiles, producing 24 resolved profile IDs.
assert.equal(resolvedReferenceProfiles.size, 24);

assert.equal(
  resolveSoStylizedUnityRockProfile('MI_RockDesert_Shelves', {
    sourceAssetName: 'SM_RockDesert_Platform01',
  })?.id,
  'desert-shelves',
);
assert.equal(
  resolveSoStylizedUnityRockProfile('MI_RockDesert_Shelves', {
    sourceAssetName: 'SM_RockDesert_Shelf01',
  })?.id,
  'desert-shelf',
);
assert.equal(
  resolveSoStylizedUnityRockProfile('MI_RockDesert_Cliff', {
    sourceAssetName: 'SM_RockDesert_CliffHalf05',
  })?.id,
  'desert',
);
assert.equal(resolveSoStylizedUnityRockProfile('MI_RockClassic_Cliff_Demo'), null);
assert.equal(
  resolveSoStylizedUnityRockProfile('MI_RockClassic_Cliff_Demo', {
    allowFallback: true,
  })?.id,
  'classic-cliff',
);

const extractedManifestFixture = {
  schema: SO_STYLIZED_UNITY_ROCK_MATERIAL_LIBRARY_SCHEMA,
  schemaVersion: SO_STYLIZED_UNITY_ROCK_MATERIAL_LIBRARY_SCHEMA_VERSION,
  materials: SO_STYLIZED_UNITY_ROCK_PROFILES.map((descriptor, index) => ({
    assetPath: descriptor.assetPath,
    guid: `fixture-guid-${index}`,
    inheritanceChain: [],
    isVariant: descriptor.sourceName.startsWith('MV_'),
    name: descriptor.sourceName,
    parent: null,
    resolved: { colors: {}, floats: {}, ints: {}, textures: {} },
  })),
};
const extractedIndex = createSoStylizedUnityRockMaterialIndex(extractedManifestFixture);
assert.equal(extractedIndex.materials.length, 42);
const cliffResolution = resolveSoStylizedUnityRockMaterial(
  '/Game/SoStylized/Environment/Rocks/Materials/Classic/'
    + 'MI_RockClassic_Cliff.MI_RockClassic_Cliff',
  { index: extractedIndex },
);
assert.equal(cliffResolution.profileId, 'classic-cliff');
assert.equal(cliffResolution.id, 'classic-cliff');
assert.equal(cliffResolution.materialRecord.name, 'MV_RockClassic_Cliff');

assert.throws(
  () => createSoStylizedUnityRockMaterialIndex({
    ...extractedManifestFixture,
    schemaVersion: 2,
  }),
  /schema version/i,
);
assert.throws(
  () => resolveSoStylizedUnityRockMaterial('classic-cliff', {
    manifest: { ...extractedManifestFixture, materials: [] },
  }),
  /missing MV_RockClassic_Cliff/,
);

let fetchCalls = 0;
const fixtureUrl = `${DEFAULT_SO_STYLIZED_UNITY_ROCK_MATERIAL_LIBRARY_URL}?fixture=1`;
const fetchImpl = async (url, options) => {
  fetchCalls += 1;
  assert.equal(url, fixtureUrl);
  assert.deepEqual(options, { cache: 'no-cache' });
  return {
    json: async () => extractedManifestFixture,
    ok: true,
    status: 200,
  };
};
const [loadedA, loadedB] = await Promise.all([
  loadSoStylizedUnityRockMaterialLibrary({ fetchImpl, url: fixtureUrl }),
  loadSoStylizedUnityRockMaterialLibrary({ fetchImpl, url: fixtureUrl }),
]);
assert.equal(fetchCalls, 1);
assert.equal(loadedA, loadedB);

console.log(JSON.stringify({
  exactSourceProfiles: directSourceProfiles,
  fallbackSourceProfiles,
  referenceMeshes: referenceManifest.meshes.length,
  resolvedReferenceProfileIds: resolvedReferenceProfiles.size,
  unityProfiles: SO_STYLIZED_UNITY_ROCK_PROFILES.length,
}, null, 2));
