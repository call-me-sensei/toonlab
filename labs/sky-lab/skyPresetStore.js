// Browser-local sky preset persistence. Portable documents are validated and
// registered through the public sky preset API so the lab exercises exactly
// the same contract as a consuming game or Pro host.

import {
  registerSerializedSkyPreset,
  validateSkyPresetDocument,
} from '../../src/sky/stylizedSky.js';

export const SKY_PRESET_STORAGE_KEY = 'toonlab.skyPresets.v1';

function readDocuments() {
  try {
    const raw = window.localStorage?.getItem(SKY_PRESET_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDocuments(documents) {
  try {
    window.localStorage?.setItem(SKY_PRESET_STORAGE_KEY, JSON.stringify(documents, null, 2));
  } catch {
    // Private browsing may reject storage; the editor remains usable.
  }
}

// Radius sizes one concrete dome instance. It is intentionally absent from
// portable reusable sky-system presets even though the runtime accepts it.
export function withoutSkyDomeRadius(settings = {}) {
  const { radius: _constructionOnly, ...authoredSettings } = settings;
  return authoredSettings;
}

function portableDocument(document) {
  return {
    ...document,
    settings: withoutSkyDomeRadius(document.settings),
  };
}

export function loadLocalSkyPresets() {
  const valid = [];
  for (const document of readDocuments()) {
    const result = validateSkyPresetDocument(document);
    if (!result.ok) continue;
    const portable = portableDocument(result.value);
    try {
      registerSerializedSkyPreset(JSON.stringify(portable), { overwrite: true });
    } catch {
      continue;
    }
    valid.push({ id: portable.id, label: portable.label });
  }
  return valid;
}

export function upsertLocalSkyPresetDocument(document) {
  const result = validateSkyPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const portable = portableDocument(result.value);
  registerSerializedSkyPreset(JSON.stringify(portable), { overwrite: true });
  const next = readDocuments().filter((entry) => entry?.id !== portable.id);
  next.push(portable);
  writeDocuments(next);
  return portable;
}

export function deleteLocalSkyPreset(id) {
  writeDocuments(readDocuments().filter((entry) => entry?.id !== id));
}
