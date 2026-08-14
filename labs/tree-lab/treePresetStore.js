// Local tree/bush recipe-preset persistence (browser localStorage), plus the
// built-in presets derived from STYLIZED_TREE_EXAMPLES. Same document flow as
// labs/shader-lab/toonPresetStore.js, validated by validateTreeRecipeDocument.

import {
  BUILT_IN_TREE_PRESETS,
  validateTreeRecipeDocument,
} from '../../src/vegetation/experimental.js';

export { BUILT_IN_TREE_PRESETS };

const LOCAL_TREE_PRESETS_STORAGE_KEY = 'toonlab.treePresets.v1';

// Built-in roster now ships in the package (src/vegetation/treeRecipePresets.js)
// so consumer games get the same signature plants the labs show.

function readLocalTreePresetDocuments() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_TREE_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read local tree presets:', error);
    return [];
  }
}

function writeLocalTreePresetDocuments(documents) {
  try {
    window.localStorage?.setItem(
      LOCAL_TREE_PRESETS_STORAGE_KEY,
      JSON.stringify(documents, null, 2),
    );
  } catch (error) {
    console.warn('Failed to write local tree presets:', error);
  }
}

export function loadLocalTreePresets() {
  const raw = readLocalTreePresetDocuments();
  const validDocuments = [];
  for (const entry of raw) {
    const result = validateTreeRecipeDocument(entry, { requireIdentity: true });
    if (!result.ok) {
      console.warn('Ignoring invalid local tree preset:', result.errors.join(' '));
      continue;
    }
    validDocuments.push(result.value);
  }
  if (validDocuments.length !== raw.length) {
    writeLocalTreePresetDocuments(validDocuments);
  }
  document.body.dataset.localTreePresetCount = String(validDocuments.length);
  return validDocuments;
}

export function upsertLocalTreePreset(presetDocument) {
  const result = validateTreeRecipeDocument(presetDocument, { requireIdentity: true });
  if (!result.ok) throw new Error(result.errors.join(' '));

  const nextDocuments = readLocalTreePresetDocuments()
    .map((entry) => validateTreeRecipeDocument(entry, { requireIdentity: true }))
    .filter((entry) => entry.ok)
    .map((entry) => entry.value)
    .filter((entry) => entry.id !== result.value.id);
  nextDocuments.push(result.value);
  nextDocuments.sort((a, b) => a.label.localeCompare(b.label));
  writeLocalTreePresetDocuments(nextDocuments);
  document.body.dataset.localTreePresetCount = String(nextDocuments.length);
  return result.value;
}

export function deleteLocalTreePreset(id) {
  const nextDocuments = readLocalTreePresetDocuments().filter((entry) => entry?.id !== id);
  writeLocalTreePresetDocuments(nextDocuments);
  document.body.dataset.localTreePresetCount = String(nextDocuments.length);
}

export function findTreePreset(id, localPresets = loadLocalTreePresets()) {
  return BUILT_IN_TREE_PRESETS.find((preset) => preset.id === id) ??
    localPresets.find((preset) => preset.id === id) ?? null;
}
