// Local browser persistence for the public grass-preset document contract.
// Validation, migration, serialization, and runtime registration live in the
// npm vegetation module; this file owns localStorage only.

import {
  parseGrassPresetDocument,
  registerSerializedGrassPreset,
  unregisterGrassPreset,
} from '../../src/vegetation/stylizedGrass.js';

export {
  GRASS_PRESET_DOCUMENT_TYPE,
  GRASS_PRESET_SCHEMA_VERSION,
  createGrassPresetDocument,
  parseGrassPresetDocument,
  registerSerializedGrassPreset,
  sanitizeGrassPresetSettings,
  serializeGrassPreset,
  validateGrassPresetDocument,
} from '../../src/vegetation/stylizedGrass.js';

const STORAGE_KEY = 'toonlab.grassPresets.v1';

function readDocuments() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDocuments(documents) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(documents, null, 2));
  } catch {
    // Private modes may reject storage — the lab keeps working unsaved.
  }
}

export function loadLocalGrassPresets() {
  const valid = [];
  for (const document of readDocuments()) {
    const result = parseGrassPresetDocument(document);
    if (!result.ok) continue;
    registerSerializedGrassPreset(result.value, { overwrite: true });
    valid.push({ id: result.value.id, label: result.value.label });
  }
  return valid;
}

export function upsertLocalGrassPresetDocument(document) {
  const result = parseGrassPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const next = readDocuments().filter((entry) => entry?.id !== result.value.id);
  next.push(result.value);
  writeDocuments(next);
  registerSerializedGrassPreset(result.value, { overwrite: true });
  return result.value;
}

export function deleteLocalGrassPreset(id) {
  writeDocuments(readDocuments().filter((entry) => entry?.id !== id));
  unregisterGrassPreset(id);
}
