// Third-party CC0 asset integration barrel.
// Import from '@call-me-sensei/toonlab/assetlib'.
//
// Pure clients (browser + Node): assetRef, polyhaven, ambientcg, importedEntry.
// Three-dependent loading: loadImported (browser labs, worlds).
// The lab UI ships Poly Haven (CORS-enabled); ambientCG is Node/MCP-only —
// see ambientcg.js header.

export * from './assetRef.js';
export * from './polyhaven.js';
export * from './ambientcg.js';
export * from './polypizza.js';
export * from './importedEntry.js';
export * from './loadImported.js';
export * from './zip.js';
