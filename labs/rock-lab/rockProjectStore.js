// localStorage persistence for Rock Lab documents (toonPresetStore.js
// pattern): a working-copy autosave slot plus named project documents.
// Everything is validated through deserializeRockDocument on the way out,
// so corrupt/stale storage degrades to "no saved project".

import { deserializeRockDocument, serializeRockDocument } from '../../src/rockgen/index.js';

const STORAGE_KEY = 'toonlab.rockLab.projects.v1';
const AUTOSAVE_ID = '__current__';

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota/private-mode failures just lose persistence, never the session.
  }
}

/**
 * Saves a document under an id. Autosaves also record the preset/seed pair
 * they were derived from so boot can tell whether the autosave still
 * matches the URL params.
 */
export function saveRockProject(document, { id = AUTOSAVE_ID, meta = {} } = {}) {
  const store = readStore();
  store[id] = { json: serializeRockDocument(document), meta };
  writeStore(store);
}

/** Loads and validates a stored document; returns `{ document, meta }` or null. */
export function loadRockProject(id = AUTOSAVE_ID) {
  const entry = readStore()[id];
  if (!entry?.json) return null;
  try {
    const meta = entry.meta ?? {};
    const parsed = typeof entry.json === 'string' ? JSON.parse(entry.json) : entry.json;
    // v1 kept preset/style only beside the JSON. Fold that legacy metadata
    // into the document before migration so local and Pro-hydrated projects
    // retain their identity when opened or exported again.
    const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? {
        ...parsed,
        ...(parsed.preset === undefined && meta.preset !== undefined
          ? { preset: meta.preset }
          : {}),
        ...(parsed.style === undefined && meta.style !== undefined
          ? { style: meta.style }
          : {}),
      }
      : parsed;
    return { document: deserializeRockDocument(source), meta };
  } catch {
    return null;
  }
}

export function removeRockProject(id = AUTOSAVE_ID) {
  const store = readStore();
  if (!(id in store)) return;
  delete store[id];
  writeStore(store);
}

export { AUTOSAVE_ID };
