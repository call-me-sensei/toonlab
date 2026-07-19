// One document, one profile, nested semantic-role settings. Preview state is
// deliberately outside the document so palette/weather/wind never leak into
// the IP-wide shader definition.

import { createStore } from '../../shared/ui/index.js';
import {
  createVegetationShaderPresetDocument,
  createVegetationShaderSettings,
  getVegetationShaderPresetOptions,
  parseVegetationShaderPresetDocument,
  serializeVegetationShaderPreset,
} from '../../../src/vegetation/vegetationShaders.js';
import {
  deleteLocalVegetationShaderProfile,
  loadLocalVegetationShaderProfiles,
  upsertLocalVegetationShaderProfile,
} from '../vegetationShaderPresetStore.js';

export const VEGETATION_SHADER_DRAFT_STORAGE_KEY = 'toonlab.vegetationShaderDraft.v1';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'vegetation-style').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'vegetation_style';
}

function readDraft() {
  try {
    const raw = window.localStorage?.getItem(VEGETATION_SHADER_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(document) {
  try {
    window.localStorage?.setItem(VEGETATION_SHADER_DRAFT_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // Keep authoring when storage is unavailable.
  }
}

function clearDraft() {
  try {
    window.localStorage?.removeItem(VEGETATION_SHADER_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function presetLabel(id) {
  return getVegetationShaderPresetOptions()
    .find((entry) => (entry.value ?? entry.id) === id)?.label ?? id;
}

function bootDocument(urlParams) {
  // Explicit profile links (including Pro's ?cloudDoc= hydration, which
  // resolves to ?vegetationShader= before this module boots) must win over
  // an unrelated autosaved draft. Ordinary visits still restore the draft.
  const linkedPresetId = urlParams.get('vegetationShader');
  if (linkedPresetId) {
    return {
      bootSource: 'preset',
      name: presetLabel(linkedPresetId),
      presetId: linkedPresetId,
      settings: createVegetationShaderSettings({ preset: linkedPresetId }),
      view: {},
    };
  }
  const saved = readDraft();
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      name: saved.name || 'Untitled vegetation shader',
      presetId: saved.presetId ?? null,
      settings: createVegetationShaderSettings(saved.settings),
      view: saved.view ?? {},
    };
  }
  const presetId = 'call_me_sensei';
  return {
    bootSource: 'fresh',
    name: presetLabel(presetId),
    presetId,
    settings: createVegetationShaderSettings({ preset: presetId }),
    view: {},
  };
}

export function createVegetationShaderLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const localPresets = loadLocalVegetationShaderProfiles();
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    coverage: { applied: 0, matched: 0, unsupported: 0, writes: 0 },
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your vegetation shader profile.' : '',
    view: {
      palette: 'natural',
      snowCover: 0,
      viewMode: 'mixed',
      wetness: 0,
      windStrength: 0.12,
      ...boot.view,
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
  });

  function persist() {
    writeDraft({
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
      view: state().view,
    });
  }

  function updateHistoryFlags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
  }

  function pushHistory(key = null) {
    const now = Date.now();
    if (key && lastHistoryKey === key && now - lastHistoryTime < HISTORY_COALESCE_MS) {
      lastHistoryTime = now;
      return;
    }
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    lastHistoryKey = key;
    lastHistoryTime = now;
  }

  function commit(patch, status = null) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
      ...(status === null ? {} : { status }),
    }));
    persist();
    updateHistoryFlags();
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const document = JSON.parse(entry);
    commit({ ...document, settings: createVegetationShaderSettings(document.settings) }, 'History restored.');
  }

  function replace(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({ name, presetDirty: false, presetId });
    commit({ settings: createVegetationShaderSettings(settings) }, status);
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replace(createVegetationShaderSettings({ preset: id }), {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
    },

    deletePreset(id) {
      deleteLocalVegetationShaderProfile(id);
      store.setState({
        localPresets: loadLocalVegetationShaderProfiles(),
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    exportDocument() {
      return serializeVegetationShaderPreset(
        createVegetationShaderPresetDocument(slug(state().name), {
          label: state().name,
          settings: state().settings,
        }),
      );
    },

    importDocument(text) {
      const result = parseVegetationShaderPresetDocument(text);
      if (!result.ok) return result;
      replace(result.value.settings, {
        name: result.value.label,
        status: `Imported ${result.value.label}.`,
      });
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDraft();
      replace(createVegetationShaderSettings({ preset: 'call_me_sensei' }), {
        name: presetLabel('call_me_sensei'),
        presetId: 'call_me_sensei',
        status: 'Vegetation Shader Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Profile name is required.'], ok: false };
      const document = createVegetationShaderPresetDocument(
        `local_${slug(cleanName)}_${Date.now().toString(36)}`,
        { label: cleanName, settings: state().settings },
      );
      try {
        upsertLocalVegetationShaderProfile(document);
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalVegetationShaderProfiles(),
        name: cleanName,
        presetDirty: false,
        presetId: document.id,
        status: `Saved “${cleanName}” to your profiles.`,
      });
      persist();
      return { ok: true };
    },

    setSetting(groupId, key, value) {
      pushHistory(`setting:${groupId}.${key}`);
      commit({
        presetDirty: true,
        settings: createVegetationShaderSettings({
          ...state().settings,
          [groupId]: { ...state().settings[groupId], [key]: value },
        }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
      persist();
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
