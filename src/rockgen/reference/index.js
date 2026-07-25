export {
  ROCK_REFERENCE_ARCHETYPES,
  ROCK_REFERENCE_CATALOG,
  ROCK_REFERENCE_CATALOG_SCHEMA,
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
} from './referenceCatalog.js';
export {
  AUDITED_LOD0_TRIANGLE_TARGETS,
  AUDITED_ROCK_LOD_TRIANGLE_TARGETS,
} from './referenceTriangleTargets.js';
export * from './referenceAssetLoader.js';
export * from './referenceSourceMaterial.js';
export * from './unityRockMaterial.js';
export * from './referenceMeshVariation.js';
