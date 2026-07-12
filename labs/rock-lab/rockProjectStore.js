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
    return { document: deserializeRockDocument(entry.json), meta: entry.meta ?? {} };
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
