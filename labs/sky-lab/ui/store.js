// Sky Lab state owns one portable, reusable sky-system preset. Camera, scene lights,
// current weather are preview fixtures and never enter the
// document snapshot, undo history, autosave, or exported JSON.

import { createStore } from '../../shared/ui/createStore.js';
import {
  createSkyPresetDocument,
  createSkySettings,
  getSkyPresetOptions,
  parseSkyPresetDocument,
  serializeSkyPreset,
} from '../../../src/sky/stylizedSky.js';
import {
  deleteLocalSkyPreset,
  loadLocalSkyPresets,
  upsertLocalSkyPresetDocument,
  withoutSkyDomeRadius,
} from '../skyPresetStore.js';

export const SKY_LAB_DOCUMENT_STORAGE_KEY = 'toonlab.skyLab.document.v1';
export const SKY_LAB_PRESET_QUERY_PARAM = 'skyPreset';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;
const DEFAULT_PREVIEW = Object.freeze({
  ambientIntensity: 0.62,
  quality: 'high',
  sunIntensity: 1.35,
  weather: 'authored',
});

function slug(value) {
  return String(value || 'sky').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function authoredSettings(input = {}) {
  return withoutSkyDomeRadius(createSkySettings(input));
}

function readDraft() {
  try {
    const raw = window.localStorage?.getItem(SKY_LAB_DOCUMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(document) {
  try {
    window.localStorage?.setItem(SKY_LAB_DOCUMENT_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // Storage is a convenience, not a runtime requirement.
  }
}

function clearDraft() {
  try {
    window.localStorage?.removeItem(SKY_LAB_DOCUMENT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function presetLabel(id) {
  return getSkyPresetOptions().find((entry) => (entry.value ?? entry.id) === id)?.label ?? id;
}

function bootDocument(urlParams) {
  // Explicit links win over an unrelated local draft. Pro can hydrate a
  // cloud document, register it, then launch this route with ?skyPreset=id.
  const linkedPresetId = urlParams.get(SKY_LAB_PRESET_QUERY_PARAM);
  if (linkedPresetId) {
    return {
      bootSource: 'preset',
      name: presetLabel(linkedPresetId),
      presetId: linkedPresetId,
      settings: authoredSettings({ preset: linkedPresetId }),
    };
  }
  const saved = readDraft();
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      name: saved.name || 'Untitled sky',
      presetId: saved.presetId ?? null,
      settings: authoredSettings(saved.settings),
    };
  }
  const presetId = 'call_me_sensei';
  return {
    bootSource: 'fresh',
    name: presetLabel(presetId),
    presetId,
    settings: authoredSettings({ preset: presetId }),
  };
}

function serializePortablePreset(id, definition) {
  const document = JSON.parse(serializeSkyPreset(id, definition, { pretty: true }));
  document.settings = withoutSkyDomeRadius(document.settings);
  return JSON.stringify(document, null, 2);
}

export function createSkyLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  // Loading local presets registers them before URL/draft resolution.
  const localPresets = loadLocalSkyPresets();
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your last sky.' : '',
    view: { ...DEFAULT_PREVIEW },
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
      settings: withoutSkyDomeRadius(state().settings),
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
    commit({ ...document, settings: authoredSettings(document.settings) }, { status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({ name, presetDirty: false, presetId });
    commit({ settings: authoredSettings(settings) }, { status });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replaceForStart({ preset: id }, {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
      return true;
    },

    deletePreset(id) {
      deleteLocalSkyPreset(id);
      store.setState({
        localPresets: loadLocalSkyPresets(),
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    exportDocument() {
      return serializePortablePreset(slug(state().name), {
        label: state().name,
        settings: state().settings,
      });
    },

    importDocument(text) {
      const result = parseSkyPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(result.value.settings, {
        name: result.value.label || 'Imported sky',
        status: `Imported ${result.value.label || 'sky preset'}.`,
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
      store.setState({ view: { ...DEFAULT_PREVIEW } });
      replaceForStart({ preset: 'call_me_sensei' }, {
        name: presetLabel('call_me_sensei'),
        presetId: 'call_me_sensei',
        status: 'Sky Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Enter a name for the sky preset.'], ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      try {
        upsertLocalSkyPresetDocument(createSkyPresetDocument(id, {
          label: cleanName,
          settings: state().settings,
        }));
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalSkyPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your presets.`,
      });
      persist();
      return { ok: true };
    },

    setSetting(key, value) {
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: authoredSettings({ ...state().settings, [key]: value }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
