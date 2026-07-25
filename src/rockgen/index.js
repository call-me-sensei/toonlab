// Procedural rock/cliff/mountain generator barrel. Import from
// '@call-me-sensei/toonlab/rockgen'. Self-contained cluster: depends only on three — the
// lab composes generated geometry with the environment cluster's toon
// materials and AO baker (see labs/rock-lab/).
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
export * from './reference/index.js';
export * from './export/glbExport.js';
