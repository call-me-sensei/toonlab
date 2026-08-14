// Procedural rock/cliff/mountain generator barrel. Import from
// '@call-me-sensei/toonlab/rockgen'. The settings schema reuses Texture Lab's
// built-in material identities for source-GLB PBR selection; geometry remains
// independent from the rock-shader domain and environment AO baker.
export * from './rockDocument.js';
export * from './rockHelpers.js';
export * from './rockgenPresets.js';
export * from './rockgenSettings.js';
export * from './heightfield/heightfieldErosion.js';
export * from './heightfield/stylizedErosionSim.js';
export * from './sdf/fieldCompiler.js';
export * from './sdf/sculptEdits.js';
export * from './mesh/meshDocument.js';
export * from './lod/index.js';
export * from './export/glbExport.js';
