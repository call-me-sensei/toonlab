// Cloud Shader Lab owns one reusable cloud appearance profile. Time, weather,
// particles, sky context, quality, camera, and review framing are preview only.

import { createStore } from '../../shared/ui/createStore.js';
import {
  DEFAULT_CLOUD_SHADER_PRESET,
  createCloudShaderPresetDocument,
  createCloudShaderSettings,
  getCloudShaderPresetOptions,
  parseCloudShaderPresetDocument,
  registerCloudShaderPreset,
  serializeCloudShaderPreset,
} from '../../../src/cloud/index.js';

export const CLOUD_SHADER_LAB_DOCUMENT_STORAGE_KEY =
  'toonlab.cloudShaderLab.document.v1';
export const CLOUD_SHADER_LAB_PRESETS_STORAGE_KEY =
  'toonlab.cloudShaderLab.presets.v1';
export const CLOUD_SHADER_LAB_PRESET_QUERY_PARAM = 'cloudShader';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;
const DEFAULT_PREVIEW = Object.freeze({
  autoCycle: false,
  hour: 13,
  particles: false,
  viewMode: 'cloud',
  weather: 'authored',
});

function slug(value) {
  return String(value || 'cloud-shader').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cloud_shader';
}

function readJson(key, fallback = null) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Authoring remains available without browser persistence.
  }
}

function removeItem(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}

function loadLocalPresets() {
  const documents = readJson(CLOUD_SHADER_LAB_PRESETS_STORAGE_KEY, []);
  if (!Array.isArray(documents)) return [];
  const valid = [];
  for (const document of documents) {
    const result = parseCloudShaderPresetDocument(document);
    if (!result.ok) continue;
    registerCloudShaderPreset(result.value.id, result.value, { overwrite: true });
    valid.push(result.value);
  }
  return valid;
}

function saveLocalPresets(documents) {
  writeJson(CLOUD_SHADER_LAB_PRESETS_STORAGE_KEY, documents);
}

function presetLabel(id) {
  return getCloudShaderPresetOptions()
    .find((entry) => entry.value === id)?.label ?? id;
}

function normalizeHour(value) {
  const number = Number(value);
  const base = Number.isFinite(number) ? number : DEFAULT_PREVIEW.hour;
  return ((base % 24) + 24) % 24;
}

function normalizeView(input = {}) {
  return {
    ...DEFAULT_PREVIEW,
    ...(input && typeof input === 'object' ? input : {}),
    autoCycle: input?.autoCycle === true,
    hour: normalizeHour(input?.hour),
    particles: input?.particles === true,
    viewMode: ['cloud', 'horizon'].includes(input?.viewMode)
      ? input.viewMode
      : DEFAULT_PREVIEW.viewMode,
    weather: String(input?.weather || DEFAULT_PREVIEW.weather),
  };
}

function bootDocument(urlParams) {
  const linkedPreset = urlParams.get(CLOUD_SHADER_LAB_PRESET_QUERY_PARAM);
  if (linkedPreset) {
    return {
      bootSource: 'preset',
      name: presetLabel(linkedPreset),
      presetId: linkedPreset,
      settings: createCloudShaderSettings({ preset: linkedPreset }),
      view: normalizeView(),
    };
  }
  const saved = readJson(CLOUD_SHADER_LAB_DOCUMENT_STORAGE_KEY);
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      name: saved.name || 'Untitled Cloud Shader',
      presetId: saved.presetId ?? null,
      settings: createCloudShaderSettings(saved.settings),
      view: normalizeView(saved.view),
    };
  }
  return {
    bootSource: 'fresh',
    name: presetLabel(DEFAULT_CLOUD_SHADER_PRESET),
    presetId: DEFAULT_CLOUD_SHADER_PRESET,
    settings: createCloudShaderSettings({ preset: DEFAULT_CLOUD_SHADER_PRESET }),
    view: normalizeView(),
  };
}

export function createCloudShaderLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const localPresets = loadLocalPresets();
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
    engineReady: false,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted'
      ? 'Restored your last cloud shader.'
      : '',
    view: boot.view,
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
  });

  function persist() {
    writeJson(CLOUD_SHADER_LAB_DOCUMENT_STORAGE_KEY, {
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
      view: state().view,
    });
  }

  function updateHistoryFlags() {
    store.setState({
      canRedo: redoStack.length > 0,
      canUndo: undoStack.length > 0,
    });
  }

  function pushHistory(key = null) {
    const now = Date.now();
    if (key && key === lastHistoryKey && now - lastHistoryTime < HISTORY_COALESCE_MS) {
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

  function replace(settings, {
    name,
    presetId = null,
    status,
  }) {
    pushHistory();
    commit({
      name,
      presetDirty: false,
      presetId,
      settings: createCloudShaderSettings(settings),
    }, status);
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const restored = JSON.parse(entry);
    commit({
      ...restored,
      settings: createCloudShaderSettings(restored.settings),
    }, 'History restored.');
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replace({ preset: id }, {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
    },

    deletePreset(id) {
      const next = state().localPresets.filter((document) => document.id !== id);
      saveLocalPresets(next);
      store.setState({
        localPresets: next,
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    exportDocument() {
      return serializeCloudShaderPreset(
        createCloudShaderPresetDocument(slug(state().name), {
          label: state().name,
          settings: state().settings,
        }),
      );
    },

    importDocument(text) {
      const result = parseCloudShaderPresetDocument(text);
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
      removeItem(CLOUD_SHADER_LAB_DOCUMENT_STORAGE_KEY);
      store.setState({ view: normalizeView() });
      replace({ preset: DEFAULT_CLOUD_SHADER_PRESET }, {
        name: presetLabel(DEFAULT_CLOUD_SHADER_PRESET),
        presetId: DEFAULT_CLOUD_SHADER_PRESET,
        status: 'Cloud Shader Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) {
        return { errors: ['Enter a name for the cloud shader.'], ok: false };
      }
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      const document = createCloudShaderPresetDocument(id, {
        label: cleanName,
        settings: state().settings,
      });
      const next = [...state().localPresets, document];
      registerCloudShaderPreset(id, document, { overwrite: true });
      saveLocalPresets(next);
      store.setState({
        localPresets: next,
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your cloud shaders.`,
      });
      persist();
      return { ok: true };
    },

    setSetting(key, value) {
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: createCloudShaderSettings({
          ...state().settings,
          [key]: value,
        }),
      });
    },

    setPreviewAutoCycle(autoCycle) {
      store.setState({
        view: normalizeView({ ...state().view, autoCycle }),
      });
    },

    setPreviewHour(hour) {
      store.setState({
        view: normalizeView({ ...state().view, hour }),
      });
    },

    setView(patch) {
      store.setState({ view: normalizeView({ ...state().view, ...patch }) });
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
