// Sky Shader Lab owns one reusable sky appearance profile. Current time,
// celestial direction, cloud context, weather, particles, camera, and source
// assets are preview-only and never enter the exported document.

import { createStore } from '../../shared/ui/createStore.js';
import {
  DEFAULT_SKY_SHADER_PRESET,
  createSkyShaderPresetDocument,
  createSkyShaderSettings,
  getSkyShaderPresetOptions,
  parseSkyShaderPresetDocument,
  registerSkyShaderPreset,
  serializeSkyShaderPreset,
} from '../../../src/sky/skyShaderSettings.js';

export const SKY_LAB_DOCUMENT_STORAGE_KEY =
  'toonlab.skyShaderLab.document.v2';
export const SKY_LAB_PRESETS_STORAGE_KEY =
  'toonlab.skyShaderLab.presets.v2';
export const SKY_LAB_PRESET_QUERY_PARAM = 'skyShader';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;
const DEFAULT_PREVIEW = Object.freeze({
  autoCycle: false,
  cloudStyle: 'call_me_sensei',
  hour: 13,
  particles: false,
  viewMode: 'sky',
  weather: 'authored',
});

function slug(value) {
  return String(value || 'sky-shader').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sky_shader';
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
  const documents = readJson(SKY_LAB_PRESETS_STORAGE_KEY, []);
  if (!Array.isArray(documents)) return [];
  const valid = [];
  for (const document of documents) {
    const result = parseSkyShaderPresetDocument(document);
    if (!result.ok) continue;
    registerSkyShaderPreset(result.value.id, result.value, { overwrite: true });
    valid.push(result.value);
  }
  return valid;
}

function saveLocalPresets(documents) {
  writeJson(SKY_LAB_PRESETS_STORAGE_KEY, documents);
}

function presetLabel(id) {
  return getSkyShaderPresetOptions()
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
    cloudStyle: ['call_me_sensei', 'neutral_review', 'hidden']
      .includes(input?.cloudStyle)
      ? input.cloudStyle
      : DEFAULT_PREVIEW.cloudStyle,
    hour: normalizeHour(input?.hour),
    particles: input?.particles === true,
    viewMode: ['sky', 'celestial', 'horizon'].includes(input?.viewMode)
      ? input.viewMode
      : DEFAULT_PREVIEW.viewMode,
    weather: String(input?.weather || DEFAULT_PREVIEW.weather),
  };
}

function linkedPreview(urlParams, fallback = {}) {
  const linkedHour = urlParams.get('envTime');
  const linkedView = urlParams.get('skyView');
  return normalizeView({
    ...fallback,
    ...(linkedHour === null ? {} : { hour: Number(linkedHour) }),
    ...(linkedView === null ? {} : { viewMode: linkedView }),
  });
}

function bootDocument(urlParams) {
  const linkedPreset = urlParams.get(SKY_LAB_PRESET_QUERY_PARAM);
  if (linkedPreset) {
    return {
      bootSource: 'preset',
      name: presetLabel(linkedPreset),
      presetId: linkedPreset,
      settings: createSkyShaderSettings({ preset: linkedPreset }),
      view: linkedPreview(urlParams),
    };
  }
  const saved = readJson(SKY_LAB_DOCUMENT_STORAGE_KEY);
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      name: saved.name || 'Untitled Sky Shader',
      presetId: saved.presetId ?? null,
      settings: createSkyShaderSettings(saved.settings),
      view: linkedPreview(urlParams, saved.view),
    };
  }
  return {
    bootSource: 'fresh',
    name: presetLabel(DEFAULT_SKY_SHADER_PRESET),
    presetId: DEFAULT_SKY_SHADER_PRESET,
    settings: createSkyShaderSettings({ preset: DEFAULT_SKY_SHADER_PRESET }),
    view: linkedPreview(urlParams),
  };
}

export function createSkyLabStore({
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
      ? 'Restored your last sky shader.'
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
    writeJson(SKY_LAB_DOCUMENT_STORAGE_KEY, {
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
      settings: createSkyShaderSettings(settings),
    }, status);
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const restored = JSON.parse(entry);
    commit({
      ...restored,
      settings: createSkyShaderSettings(restored.settings),
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
      return serializeSkyShaderPreset(
        createSkyShaderPresetDocument(slug(state().name), {
          label: state().name,
          settings: state().settings,
        }),
      );
    },

    importDocument(text) {
      const result = parseSkyShaderPresetDocument(text);
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
      removeItem(SKY_LAB_DOCUMENT_STORAGE_KEY);
      store.setState({ view: normalizeView() });
      replace({ preset: DEFAULT_SKY_SHADER_PRESET }, {
        name: presetLabel(DEFAULT_SKY_SHADER_PRESET),
        presetId: DEFAULT_SKY_SHADER_PRESET,
        status: 'Sky Shader Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) {
        return { errors: ['Enter a name for the sky shader.'], ok: false };
      }
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      const document = createSkyShaderPresetDocument(id, {
        label: cleanName,
        settings: state().settings,
      });
      const next = [...state().localPresets, document];
      registerSkyShaderPreset(id, document, { overwrite: true });
      saveLocalPresets(next);
      store.setState({
        localPresets: next,
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your sky shaders.`,
      });
      persist();
      return { ok: true };
    },

    setSetting(key, value) {
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: createSkyShaderSettings({
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
