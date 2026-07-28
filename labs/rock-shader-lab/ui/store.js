// Rock shader authoring state. Preview fixture selection stays outside the
// portable shader document, just as procedural geometry stays outside it.

import { createStore } from '../../shared/ui/index.js';
import {
  createRockShaderPresetDocument,
  createRockShaderSettings,
  getRockShaderPresetOptions,
  parseRockShaderPresetDocument,
  serializeRockShaderPreset,
} from '../../../src/rock-shader/index.js';
import {
  createP18PreviewSettings,
  DEFAULT_P18_PREVIEW_SETTINGS,
} from '../../shared/p18/previewStyles.js';

export const ROCK_SHADER_DRAFT_STORAGE_KEY = 'toonlab.rockShaderDraft.v2';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'rock-shader').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'rock_shader';
}

function presetLabel(id) {
  return getRockShaderPresetOptions()
    .find((entry) => entry.value === id)?.label ?? id;
}

function readDraft() {
  try {
    const value = window.localStorage?.getItem(ROCK_SHADER_DRAFT_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeDraft(value) {
  try {
    window.localStorage?.setItem(ROCK_SHADER_DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Authoring remains available when browser persistence is unavailable.
  }
}

function clearDraft() {
  try {
    window.localStorage?.removeItem(ROCK_SHADER_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore browser storage failures.
  }
}

function bootDocument(urlParams) {
  const linkedPreset = urlParams.get('rockShader');
  if (linkedPreset) {
    return {
      name: presetLabel(linkedPreset),
      presetId: linkedPreset,
      settings: createRockShaderSettings({ preset: linkedPreset }),
    };
  }
  const saved = readDraft();
  if (saved?.settings) {
    return {
      name: saved.name || 'Untitled rock shader',
      presetId: saved.presetId ?? null,
      settings: createRockShaderSettings(saved.settings),
      view: saved.view,
    };
  }
  return {
    name: presetLabel('call_me_sensei'),
    presetId: 'call_me_sensei',
    settings: createRockShaderSettings({ preset: 'call_me_sensei' }),
  };
}

export function createRockShaderLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const boot = bootDocument(urlParams);
  const requestedFixture = String(boot.view?.fixture ?? '');
  const fixture = /^spire-0[1-8]$/.test(requestedFixture)
    ? requestedFixture
    : 'spire-05';
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    canRedo: false,
    canUndo: false,
    coverage: { applied: 0, matched: 0, skipped: 0 },
    docRevision: 0,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    previewAutoCycle: false,
    previewHour: 13,
    preview: createP18PreviewSettings({
      bundle: urlParams.get('previewBundle')
        ?? DEFAULT_P18_PREVIEW_SETTINGS.bundle,
      scenePreset: urlParams.get('previewScene')
        ?? DEFAULT_P18_PREVIEW_SETTINGS.scenePreset,
    }),
    settings: boot.settings,
    status: '',
    view: {
      fixture,
      ...boot.view,
      fixture,
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

  function replace(settings, { name, presetId = null, status }) {
    pushHistory();
    commit({
      name,
      presetDirty: false,
      presetId,
      settings: createRockShaderSettings(settings),
    }, status);
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const restored = JSON.parse(entry);
    commit({
      ...restored,
      settings: createRockShaderSettings(restored.settings),
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

    exportDocument() {
      return serializeRockShaderPreset(
        createRockShaderPresetDocument(slug(state().name), {
          label: state().name,
          settings: state().settings,
        }),
      );
    },

    importDocument(text) {
      const result = parseRockShaderPresetDocument(text);
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
      replace({ preset: 'call_me_sensei' }, {
        name: presetLabel('call_me_sensei'),
        presetId: 'call_me_sensei',
        status: 'Rock Shader Lab reset.',
      });
      store.setState({
        preview: createP18PreviewSettings(DEFAULT_P18_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: { ...state().view, fixture: 'spire-05' },
      });
    },

    resetPreviewSettings() {
      store.setState({
        preview: createP18PreviewSettings(DEFAULT_P18_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: { ...state().view, fixture: 'spire-05' },
      });
    },

    setName(name) {
      const clean = String(name || '').trim();
      if (!clean) return;
      store.setState({ name: clean });
      persist();
    },

    setSetting(groupId, key, value) {
      pushHistory(`setting:${groupId}.${key}`);
      commit({
        presetDirty: true,
        settings: createRockShaderSettings({
          ...state().settings,
          [groupId]: { ...state().settings[groupId], [key]: value },
        }),
      });
    },

    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
    },

    setPreviewHour(previewHour) {
      const value = Number(previewHour);
      if (!Number.isFinite(value)) return;
      store.setState({ previewHour: ((value % 24) + 24) % 24 });
    },

    setPreviewBundle(bundle) {
      store.setState({
        preview: createP18PreviewSettings({ ...state().preview, bundle }),
      });
    },

    setPreviewComponentStyle(componentId, style) {
      store.setState({
        preview: createP18PreviewSettings({
          ...state().preview,
          componentStyles: {
            ...state().preview.componentStyles,
            [componentId]: style,
          },
        }),
      });
    },

    setPreviewComponentVisible(componentId, visible) {
      store.setState({
        preview: createP18PreviewSettings({
          ...state().preview,
          componentVisibility: {
            ...state().preview.componentVisibility,
            [componentId]: Boolean(visible),
          },
        }),
      });
    },

    setPreviewScenePreset(scenePreset) {
      store.setState({
        preview: createP18PreviewSettings({
          ...state().preview,
          scenePreset,
        }),
      });
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
