// Local grass-preset persistence (browser localStorage), mirroring the other
// labs' preset stores. Documents are { type, schemaVersion, id, label,
// settings } with settings sanitized through createGrassSettings; loaded
// documents register into the runtime preset registry.

import { createGrassSettings, registerGrassPreset } from '../../src/vegetation/stylizedGrass.js';

export const GRASS_PRESET_DOCUMENT_TYPE = 'toonlab/grass-preset';
export const GRASS_PRESET_SCHEMA_VERSION = 1;
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

export function validateGrassPresetDocument(input) {
  const source = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
  if (!source || typeof source !== 'object') return { errors: ['Grass preset must be a JSON object.'], ok: false };
  if (source.type !== GRASS_PRESET_DOCUMENT_TYPE) return { errors: [`Document type must be "${GRASS_PRESET_DOCUMENT_TYPE}".`], ok: false };
  const id = String(source.id ?? '').trim();
  const label = String(source.label ?? '').trim();
  if (!id || !label) return { errors: ['Grass preset needs an id and a label.'], ok: false };
  return { ok: true, value: { id, label, settings: createGrassSettings(source.settings ?? {}) } };
}

export function loadLocalGrassPresets() {
  const valid = [];
  for (const document of readDocuments()) {
    const result = validateGrassPresetDocument(document);
    if (!result.ok) continue;
    registerGrassPreset(result.value.id, { label: result.value.label, settings: result.value.settings }, { overwrite: true });
    valid.push({ id: result.value.id, label: result.value.label });
  }
  return valid;
}

export function upsertLocalGrassPresetDocument(document) {
  const result = validateGrassPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const next = readDocuments().filter((entry) => entry?.id !== result.value.id);
  next.push(document);
  writeDocuments(next);
  registerGrassPreset(result.value.id, { label: result.value.label, settings: result.value.settings }, { overwrite: true });
  return result.value;
}

export function deleteLocalGrassPreset(id) {
  writeDocuments(readDocuments().filter((entry) => entry?.id !== id));
}
