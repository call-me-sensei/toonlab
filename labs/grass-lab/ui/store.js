// Grass Lab store: flat grass settings (createGrassSettings), preset
// identity, undo history, persistence, and view state (preview mode /
// walk). Same store->engine contract as the other redesigned labs.

import { createStore } from '../../shared/ui/index.js';
import { createGrassSettings, getGrassPresetOptions } from '../../../src/vegetation/stylizedGrass.js';
import {
  deleteLocalGrassPreset,
  GRASS_PRESET_DOCUMENT_TYPE,
  GRASS_PRESET_SCHEMA_VERSION,
  loadLocalGrassPresets,
  upsertLocalGrassPresetDocument,
  validateGrassPresetDocument,
} from '../grassPresetStore.js';

const DOCUMENT_STORAGE_KEY = 'toonlab.grassLab.document.v1';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'grass').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function loadDocument() {
  try {
    const raw = window.localStorage?.getItem(DOCUMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDocumentLocal(document) {
  try {
    window.localStorage?.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // ignore
  }
}

function clearDocumentLocal() {
  try {
    window.localStorage?.removeItem(DOCUMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function presetLabel(id) {
  return [...getGrassPresetOptions()].find((entry) => (entry.value ?? entry.id) === id)?.label ?? id;
}

function bootDocument(urlParams) {
  const saved = loadDocument();
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      mode: saved.mode ?? 'patch',
      name: saved.name || 'Untitled grass',
      presetId: saved.presetId ?? null,
      settings: createGrassSettings(saved.settings),
    };
  }
  const preset = urlParams.get('grassPreset') || 'call_me_sensei';
  return {
    bootSource: 'fresh',
    mode: 'patch',
    name: presetLabel(preset),
    presetId: preset,
    settings: createGrassSettings({ preset }),
  };
}

export function createGrassLabStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const localPresets = loadLocalGrassPresets();
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bladeCount: 0,
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your last grass.' : '',
    view: {
      ambientIntensity: 0.5,
      mode: boot.mode,
      sunIntensity: 1.2,
      walkPreview: false,
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
    saveDocumentLocal({
      mode: state().view.mode,
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
    });
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

  function updateHistoryFlags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
  }

  function commit(patch, { status = null } = {}) {
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
    commit({ ...document, settings: createGrassSettings(document.settings) }, { status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({ name, presetDirty: false, presetId });
    commit({ settings }, { status });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replaceForStart(createGrassSettings({ preset: id }), {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
      return true;
    },

    deletePreset(id) {
      deleteLocalGrassPreset(id);
      store.setState({
        localPresets: loadLocalGrassPresets(),
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    exportDocument() {
      return JSON.stringify({
        id: slug(state().name),
        label: state().name,
        schemaVersion: GRASS_PRESET_SCHEMA_VERSION,
        settings: state().settings,
        type: GRASS_PRESET_DOCUMENT_TYPE,
      }, null, 2);
    },

    importDocument(text) {
      const result = validateGrassPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(result.value.settings, {
        name: result.value.label || 'Imported grass',
        status: `Imported ${result.value.label || 'grass preset'}.`,
      });
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDocumentLocal();
      replaceForStart(createGrassSettings({ preset: 'call_me_sensei' }), {
        name: presetLabel('call_me_sensei'),
        presetId: 'call_me_sensei',
        status: 'Grass Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      try {
        upsertLocalGrassPresetDocument({
          id,
          label: cleanName,
          schemaVersion: GRASS_PRESET_SCHEMA_VERSION,
          settings: state().settings,
          type: GRASS_PRESET_DOCUMENT_TYPE,
        });
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalGrassPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your presets.`,
      });
      persist();
      return { ok: true };
    },

    /** Single schema-field edit (grass settings are flat). */
    setSetting(key, value) {
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: createGrassSettings({ ...state().settings, [key]: value }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
      if (patch.mode) persist();
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
