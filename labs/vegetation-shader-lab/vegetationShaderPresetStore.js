// Browser persistence for the single IP-wide VegetationShaderProfile.
// Family-specific legacy shader documents are accepted only as migration
// input; every saved entry is canonical after load.

import {
  migrateLegacyVegetationShaderDocuments,
  parseVegetationShaderPresetDocument,
  registerVegetationShaderPreset,
} from '../../src/vegetation/vegetationShaders.js';

export const VEGETATION_SHADER_PROFILE_STORAGE_KEY = 'toonlab.vegetationShaderProfiles.v1';
export const LEGACY_VEGETATION_SHADER_STORAGE_KEY = 'toonlab.vegetationShaders.v1';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeDocuments(documents) {
  try {
    window.localStorage?.setItem(
      VEGETATION_SHADER_PROFILE_STORAGE_KEY,
      JSON.stringify(documents, null, 2),
    );
  } catch {
    // Private browsing may reject persistence; authoring still works in memory.
  }
}

function canonicalDocument(input, index = 0) {
  const parsed = parseVegetationShaderPresetDocument(input);
  if (parsed.ok) return parsed.value;
  const migrated = migrateLegacyVegetationShaderDocuments(input, {
    id: input?.id ? `migrated_${input.id}` : `migrated_vegetation_${index + 1}`,
    label: input?.label ? `${input.label} · migrated` : `Migrated vegetation ${index + 1}`,
  });
  return migrated.ok ? migrated.value : null;
}

function readDocuments() {
  const saved = readJson(VEGETATION_SHADER_PROFILE_STORAGE_KEY, []);
  if (Array.isArray(saved)) return saved;
  if (Array.isArray(saved?.documents)) return saved.documents;
  return [];
}

function migrateLegacyCollection() {
  const legacy = readJson(LEGACY_VEGETATION_SHADER_STORAGE_KEY, null);
  if (!legacy) return [];
  const inputs = Array.isArray(legacy)
    ? legacy
    : (Array.isArray(legacy.documents) ? legacy.documents : [legacy]);
  return inputs.map(canonicalDocument).filter(Boolean);
}

export function loadLocalVegetationShaderProfiles() {
  const existing = readDocuments();
  const documents = existing.length > 0 ? existing : migrateLegacyCollection();
  const valid = [];
  const canonical = [];
  documents.forEach((document, index) => {
    const parsed = canonicalDocument(document, index);
    if (!parsed) return;
    registerVegetationShaderPreset(parsed.id, parsed, { overwrite: true });
    canonical.push(parsed);
    valid.push({ description: parsed.description, id: parsed.id, label: parsed.label });
  });
  if (existing.length === 0 && canonical.length > 0) writeDocuments(canonical);
  return valid;
}

export function upsertLocalVegetationShaderProfile(document) {
  const result = parseVegetationShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const next = readDocuments().filter((entry) => entry?.id !== result.value.id);
  next.push(result.value);
  writeDocuments(next);
  registerVegetationShaderPreset(result.value.id, result.value, { overwrite: true });
  return result.value;
}

export function deleteLocalVegetationShaderProfile(id) {
  writeDocuments(readDocuments().filter((entry) => entry?.id !== id));
}
