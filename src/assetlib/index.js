// Third-party CC0 asset integration barrel.
// Import from '@call-me-sensei/toonlab/assetlib'.
//
// Pure clients (browser + Node): assetRef, sources (the registry of every
// source incl. manual/link-out ones), polyhaven, ambientcg, polypizza,
// kaykit, opensource3d, importedEntry.
// Three-dependent loading: loadImported (browser labs, worlds).
// CORS notes per client header: Poly Haven / KayKit / Open Source 3D run in
// the browser directly; ambientCG + Poly Pizza go through the backend/dev
// proxy routes.

export * from './assetRef.js';
export * from './sources.js';
export * from './polyhaven.js';
export * from './ambientcg.js';
export * from './polypizza.js';
export * from './kaykit.js';
export * from './kaykitStaticIndex.js';
export * from './opensource3d.js';
export * from './importedEntry.js';
export * from './loadImported.js';
export * from './zip.js';
