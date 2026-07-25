// Deterministic source-mesh reference-catalog contract checks. This verifier
// intentionally never asks the legacy SDF generator to create reference
// geometry; source GLBs and their deformation contract are checked by
// verify-rock-reference-generation.mjs.
//
//   node scripts/verify-rock-reference-catalog.mjs

// The expected source-name inventory below is deliberately independent from
// referenceSeries.js. This makes omissions, duplicate expansions, and naming
// drift visible instead of verifying the catalog with its own source table.

import assert from 'node:assert/strict';

import {
  AUDITED_ROCK_LOD_TRIANGLE_TARGETS,
  ROCK_REFERENCE_ARCHETYPES,
  ROCK_REFERENCE_CATALOG,
  ROCK_REFERENCE_CATALOG_VERSION,
  ROCK_REFERENCE_FAMILIES,
  ROCK_REFERENCE_RECIPE_SCHEMA,
  ROCK_REFERENCE_ROLES,
  ROCK_REFERENCE_SERIES,
  createRockDocumentFromReference,
  createRockReferenceCatalog,
  getRockReferenceEntry,
  getRockReferenceLodPlan,
  listRockReferenceEntries,
  normalizeRockReferenceId,
  rockReferenceSeedForId,
} from '../src/rockgen/reference/index.js';
import {
  ROCKGEN_PROJECT_SCHEMA_VERSION,
  deserializeRockDocument,
  getRockgenPresetOptions,
  rebaseRockDocumentStyle,
  serializeRockDocument,
} from '../src/rockgen/index.js';

const FAMILY_COUNTS = Object.freeze({
  classic: 50,
  cubic: 61,
  desert: 104,
  hexic: 48,
  mountains: 4,
  spire: 57,
});
const ROLE_COUNTS = Object.freeze({
  'core-form': 312,
  'metric-utility': 8,
  'mountain-backdrop': 4,
});
const SOURCE_STYLE_LABELS = Object.freeze({
  classic: 'So Stylized / Classic',
  cubic: 'So Stylized / Cubic',
  desert: 'So Stylized / Desert',
  hexic: 'So Stylized / Hexic',
  mountains: 'So Stylized / Mountains',
  spire: 'So Stylized / Spire',
});
function numbered(prefix, count, pad = 2) {
  return Array.from({ length: count }, (_, offset) => {
    const index = String(offset + 1);
    return `${prefix}${pad > 0 ? index.padStart(pad, '0') : index}`;
  });
}

const EXPECTED_SOURCE_NAMES = Object.freeze([
  ...numbered('SM_RockClassic', 16, 0),
  ...numbered('SM_RockClumpClassic', 10, 0),
  ...numbered('SM_BoulderClassic', 5, 0),
  ...numbered('SM_BoulderClumpClassic', 2, 0),
  ...numbered('SM_ShelfClassic', 7, 0),
  ...numbered('SM_PlatformClassic', 4, 0),
  ...numbered('SM_CliffClassic', 6, 0),
  ...numbered('SM_RockCubic', 13),
  ...numbered('SM_BoulderCubic', 5),
  ...numbered('SM_CubicCliff', 16),
  ...numbered('SM_CubicCliffPieces', 19),
  'SM_RockCubic_Metric_1x1',
  'SM_RockCubic_Metric_1x1x2',
  'SM_RockCubic_Metric_2x2',
  'SM_RockCubic_Metric_2x2x1',
  'SM_RockCubic_Metric_2x2x4',
  'SM_RockCubic_Metric_4x4x2',
  'SM_RockCubic_Metric_8x8x2',
  'SM_RockCubic_Metric_8x8x3',
  ...numbered('SM_RockDesert_Rock', 16),
  ...numbered('SM_RockDesert_Clump', 10),
  ...numbered('SM_RockDesert_Shelf', 10),
  ...numbered('SM_RockDesert_Platform', 4),
  ...numbered('SM_RockDesert_Layered', 8),
  ...numbered('SM_RockDesert_Hoodoo', 15),
  ...numbered('SM_RockDesert_HoodooCliff', 9),
  ...numbered('SM_RockDesert_CliffA', 8),
  ...numbered('SM_RockDesert_CliffB', 8),
  ...numbered('SM_RockDesert_CliffC', 8),
  ...numbered('SM_RockDesert_CliffHalf', 8),
  ...numbered('SM_RockHexic_Piece', 18),
  ...numbered('SM_RockHexic_Platform', 4),
  ...numbered('SM_RockHexic_Rocks', 10),
  ...numbered('SM_RockHexic_RockSlanted', 10),
  ...numbered('SM_RockHexic_Spire', 6),
  ...numbered('SM_Mountain', 4),
  ...numbered('SM_RockSpire_Rock', 20),
  ...numbered('SM_RockSpire_RockClump', 5),
  ...numbered('SM_RockSpire_RockClumpB', 12),
  ...numbered('SM_RockSpire_RockClumpC', 4),
  ...numbered('SM_RockSpire_Shelf', 8),
  ...numbered('SM_RockSpire_Spire', 8),
]);

function countBy(entries, key) {
  const counts = {};
  for (const entry of entries) counts[entry[key]] = (counts[entry[key]] ?? 0) + 1;
  return counts;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertFiniteNumbers(value, path = 'value') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} must be finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteNumbers(child, `${path}.${key}`);
  }
}

function assertDeepFrozen(value, path = 'value') {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`);
  }
}

function assertRecipeIsDescriptorOnly(recipe, entryId) {
  const allowedRecipeKeys = ['parameters', 'presetId', 'schema', 'seed', 'styleId', 'version'];
  const allowedParameterKeys = [
    'columns', 'cuts', 'falloff', 'meshing', 'noise', 'scale', 'strata', 'surface',
  ];
  assert.deepEqual(Object.keys(recipe).sort(), allowedRecipeKeys, `${entryId}: recipe keys`);
  assert.deepEqual(
    Object.keys(recipe.parameters).sort(),
    Object.keys(recipe.parameters).filter((key) => allowedParameterKeys.includes(key)).sort(),
    `${entryId}: unsupported compatibility parameter group`,
  );
  const serialized = JSON.stringify(recipe).toLowerCase();
  for (const token of [
    'vertices', 'indices', 'indexbuffer', 'sourceasset', 'sourcemesh', 'texture',
    'geometry', '.fbx', '.uasset', '/game/', 'assets-local', 'stylizedexploration/content',
  ]) {
    assert.ok(!serialized.includes(token), `${entryId}: recipe contains forbidden source token "${token}"`);
  }
}

assert.equal(ROCK_REFERENCE_CATALOG.length, 324, 'catalog entry count');
assert.equal(EXPECTED_SOURCE_NAMES.length, 324, 'independent audited source-name count');
assert.deepEqual(countBy(ROCK_REFERENCE_CATALOG, 'family'), FAMILY_COUNTS, 'family totals');
assert.deepEqual(countBy(ROCK_REFERENCE_CATALOG, 'role'), ROLE_COUNTS, 'role totals');
assert.deepEqual(sorted(ROCK_REFERENCE_FAMILIES), sorted(Object.keys(FAMILY_COUNTS)));
assert.deepEqual(sorted(ROCK_REFERENCE_ROLES), sorted(Object.keys(ROLE_COUNTS)));
assert.deepEqual(
  sorted(ROCK_REFERENCE_CATALOG.map((entry) => entry.sourceAssetName)),
  sorted(EXPECTED_SOURCE_NAMES),
  'audited source-name inventory',
);
assert.equal(new Set(ROCK_REFERENCE_CATALOG.map((entry) => entry.id)).size, 324, 'unique ids');
assert.equal(new Set(ROCK_REFERENCE_CATALOG.map((entry) => entry.sourceAssetName)).size, 324, 'unique source names');
assert.equal(
  ROCK_REFERENCE_SERIES.reduce((sum, series) => sum + series.count, 0),
  324,
  'series totals',
);
assert.deepEqual(
  countBy(ROCK_REFERENCE_CATALOG.map((entry) => ({
    lodCount: entry.target.lodTriangles.length,
  })), 'lodCount'),
  { 1: 4, 2: 202, 3: 118 },
  'audited LOD-count distribution',
);

const firstBuild = createRockReferenceCatalog();
const secondBuild = createRockReferenceCatalog();
assert.deepEqual(firstBuild, secondBuild, 'catalog builds must be deterministic');
assert.deepEqual(firstBuild, ROCK_REFERENCE_CATALOG, 'exported catalog must match a fresh build');
assertDeepFrozen(ROCK_REFERENCE_CATALOG, 'catalog');

const supportedPresets = new Set(getRockgenPresetOptions().map((option) => option.value));
const supportedArchetypes = new Set(ROCK_REFERENCE_ARCHETYPES);
for (const entry of ROCK_REFERENCE_CATALOG) {
  assert.match(
    entry.id,
    /^so-stylized\/(classic|cubic|desert|hexic|mountains|spire)\/[a-z0-9-]+\/\d{2}$/,
    `${entry.id}: stable id`,
  );
  assert.equal(entry.seed, rockReferenceSeedForId(entry.id), `${entry.id}: stable seed`);
  assert.equal(entry.generatorRecipe.seed, entry.seed, `${entry.id}: recipe seed`);
  assert.equal(entry.generatorRecipe.schema, ROCK_REFERENCE_RECIPE_SCHEMA, `${entry.id}: recipe schema`);
  assert.equal(entry.generatorRecipe.version, ROCK_REFERENCE_CATALOG_VERSION, `${entry.id}: recipe version`);
  assert.ok(supportedPresets.has(entry.generatorRecipe.presetId), `${entry.id}: supported preset`);
  assert.ok(supportedArchetypes.has(entry.archetype), `${entry.id}: supported archetype`);
  assert.equal(entry.sourceStyleLabel, SOURCE_STYLE_LABELS[entry.family], `${entry.id}: style label`);
  assertRecipeIsDescriptorOnly(entry.generatorRecipe, entry.id);
  assertFiniteNumbers(entry.generatorRecipe, `${entry.id}.generatorRecipe`);

  const budget = entry.target.lod0Triangles;
  assert.ok(Number.isInteger(budget.min) && budget.min > 0, `${entry.id}: positive min budget`);
  assert.ok(Number.isInteger(budget.target) && budget.target > 0, `${entry.id}: positive target budget`);
  assert.ok(Number.isInteger(budget.max) && budget.max > 0, `${entry.id}: positive max budget`);
  assert.ok(budget.min <= budget.target && budget.target <= budget.max, `${entry.id}: ordered budget`);
  const auditedLods = AUDITED_ROCK_LOD_TRIANGLE_TARGETS[entry.sourceAssetName];
  assert.deepEqual(entry.target.lodTriangles, auditedLods, `${entry.id}: exact LOD triangles`);
  assert.ok(entry.target.lodRatios.every((ratio, lod) => (
    Math.abs(ratio - auditedLods[lod] / auditedLods[0]) <= 1e-9
  )), `${entry.id}: exact LOD ratios`);

  assert.equal(getRockReferenceEntry(entry.id), entry, `${entry.id}: lookup by id`);
  assert.equal(getRockReferenceEntry(entry.sourceAssetName), entry, `${entry.id}: lookup by source name`);
  assert.equal(normalizeRockReferenceId(entry.sourceAssetName), entry.id, `${entry.id}: normalize source name`);

  const lodPlan = getRockReferenceLodPlan(entry);
  assert.equal(lodPlan.length, entry.target.lodRatios.length, `${entry.id}: LOD plan length`);
  assert.equal(lodPlan[0].targetTriangles, budget.target, `${entry.id}: LOD0 target`);
  for (const lod of lodPlan) {
    assert.ok(lod.minTriangles <= lod.targetTriangles, `${entry.id}: LOD${lod.lod} min`);
    assert.ok(lod.targetTriangles <= lod.maxTriangles, `${entry.id}: LOD${lod.lod} max`);
  }

  const document = createRockDocumentFromReference(entry);
  assert.equal(document.preset, entry.generatorRecipe.presetId, `${entry.id}: document preset`);
  assert.equal(document.seed, entry.seed, `${entry.id}: document seed`);
  assert.equal(document.style, entry.generatorRecipe.styleId, `${entry.id}: document style`);
  assert.equal(document.name, `${entry.sourceAssetName} mesh reference`, `${entry.id}: document name`);
  assert.deepEqual(document.reference, {
    archetype: entry.archetype,
    catalogVersion: ROCK_REFERENCE_CATALOG_VERSION,
    family: entry.family,
    id: entry.id,
    lodRatios: entry.target.lodRatios,
    lodTriangles: entry.target.lodTriangles,
    role: entry.role,
    series: entry.series,
    sourceMode: 'mesh-template',
    targetTriangles: budget.target,
    variation: 1,
    variationSeed: entry.seed,
  }, `${entry.id}: portable reference identity`);
  assertFiniteNumbers(document, `${entry.id}.document`);
}

assert.equal(listRockReferenceEntries({ family: 'desert' }).length, 104, 'family filter');
assert.equal(listRockReferenceEntries({ role: 'metric-utility' }).length, 8, 'role filter');
assert.equal(listRockReferenceEntries({ archetype: 'mountain-backdrop' }).length, 4, 'archetype filter');
assert.equal(listRockReferenceEntries({ text: 'hoodoo' }).length, 24, 'text filter');
assert.equal(
  normalizeRockReferenceId('classic/boulder/1'),
  'so-stylized/classic/boulder/01',
  'short id normalization',
);
assert.equal(getRockReferenceEntry('not-a-reference'), null, 'unknown lookup');

const referenceEntry = getRockReferenceEntry('SM_RockDesert_Hoodoo01');
const referenceDocument = createRockDocumentFromReference(referenceEntry, {
  seed: 77,
  style: 'call_me_sensei',
  variation: 0.65,
});
const restoredDocument = deserializeRockDocument(serializeRockDocument(referenceDocument));
assert.equal(restoredDocument.schemaVersion, ROCKGEN_PROJECT_SCHEMA_VERSION, 'round-trip schema');
assert.equal(restoredDocument.seed, 77, 'round-trip generation seed');
assert.equal(restoredDocument.style, 'call_me_sensei', 'round-trip portable style');
assert.deepEqual(restoredDocument.reference, referenceDocument.reference, 'round-trip reference identity');
const rebasedDocument = rebaseRockDocumentStyle(referenceDocument, 'default');
assert.deepEqual(rebasedDocument.reference, referenceDocument.reference, 'style rebase keeps reference identity');

const variationEntry = getRockReferenceEntry('SM_BoulderClassic1');
const baselineA = createRockDocumentFromReference(variationEntry, { seed: 100, variation: 0 });
const baselineB = createRockDocumentFromReference(variationEntry, { seed: 101, variation: 0 });
const variedA = createRockDocumentFromReference(variationEntry, { seed: 100, variation: 1 });
const variedARepeat = createRockDocumentFromReference(variationEntry, { seed: 100, variation: 1 });
const variedB = createRockDocumentFromReference(variationEntry, { seed: 101, variation: 1 });
assert.deepEqual(baselineA.pieces, baselineB.pieces, 'reference seed does not rebuild placeholder pieces');
assert.deepEqual(baselineA.pieces, variedA.pieces, 'reference strength does not rebuild placeholder pieces');
assert.deepEqual(variedA.pieces, variedARepeat.pieces, 'same reference request repeats placeholder data');
assert.deepEqual(variedA.pieces, variedB.pieces, 'source variation lives outside placeholder data');
assert.equal(baselineA.reference.variation, 0, 'zero variation is stored in reference identity');
assert.equal(variedA.reference.variation, 1, 'full variation is stored in reference identity');
assert.equal(variedA.reference.variationSeed, 100, 'variation seed is stored in reference identity');
assert.equal(variedB.reference.variationSeed, 101, 'a new seed changes only source deformation identity');

assert.throws(
  () => createRockDocumentFromReference(variationEntry, { seed: Number.NaN }),
  /seed must be finite/i,
  'invalid seed rejection',
);
assert.equal(
  createRockDocumentFromReference(variationEntry, { variation: 10 }).reference.variation,
  1,
  'variation upper clamp',
);
assert.equal(
  createRockDocumentFromReference(variationEntry, { variation: -10 }).reference.variation,
  0,
  'variation lower clamp',
);

console.log(
  `Rock reference catalog verified: ${ROCK_REFERENCE_CATALOG.length} entries, `
  + `${ROCK_REFERENCE_SERIES.length} series, ${ROCK_REFERENCE_ARCHETYPES.length} archetypes.`,
);
