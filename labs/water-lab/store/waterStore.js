// Water Lab store: document state (settings/name/preset), undo history,
// persistence, and the store->engine contract (docRevision + lastChange,
// same as texture/rock/debris labs). Settings are the flat createWaterSettings
// object; preset identity lives on presetId, never inside settings.

import { createStore } from '../../shared/ui/index.js';
import { takeLabHandoff } from '../../shared/labHandoff.js';
import {
  createWaterPresetDocument,
  createWaterSettings,
  getWaterPresetOptions,
  parseWaterPresetDocument,
  sanitizeWaterPresetSettings,
  serializeWaterPreset,
} from '../../../src/water/index.js';
import {
  clearWaterDocument,
  deleteLocalWaterPreset,
  loadLocalWaterPresets,
  loadWaterDocument,
  saveWaterDocument,
  upsertLocalWaterPreset,
} from '../waterProjectStore.js';
import { STAGE_BY_PRESET } from '../engine/waterLabEngine.js';
import { waterStageOverrides } from './waterStageSettings.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'water').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function stageOrientation(presetId) {
  const stage = STAGE_BY_PRESET[presetId];
  return waterStageOverrides(stage);
}

function builtinPreset(id) {
  return getWaterPresetOptions().find((entry) => entry.id === id) ?? null;
}

function localPreset(id) {
  return loadLocalWaterPresets().find((entry) => entry.id === id) ?? null;
}

function bootDocument(urlParams) {
  // Shared/bookmarked document: ?waterDoc=<preset document JSON>.
  const encoded = urlParams.get('waterDoc');
  if (encoded) {
    const result = parseWaterPresetDocument(encoded);
    if (result.ok) {
      return {
        bootSource: 'url',
        name: result.value.label || 'Shared water',
        presetId: null,
        settings: createWaterSettings(result.value.settings),
      };
    }
  }
  // "Edit in Water Lab" from the playground preview scene.
  const handoff = takeLabHandoff('water-lab-import');
  if (handoff?.settings) {
    return {
      bootSource: 'handoff',
      name: 'Playground water',
      presetId: handoff.preset ?? null,
      settings: createWaterSettings({ preset: handoff.preset ?? undefined, ...handoff.settings }),
    };
  }
  const saved = loadWaterDocument();
  if (saved) return { ...saved, bootSource: 'persisted' };
  const preset = urlParams.get('waterPreset') || urlParams.get('waterMode') || 'lake';
  const known = builtinPreset(preset);
  const presetId = known ? known.id : 'lake';
  return {
    bootSource: 'fresh',
    name: known ? known.label : 'Untitled water',
    presetId: known ? known.id : null,
    settings: createWaterSettings({ preset: presetId, ...stageOrientation(presetId) }),
  };
}

export function createWaterStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const boot = bootDocument(urlParams);
  const bootStage = STAGE_BY_PRESET[boot.presetId] ?? 'shore';
  const bootBase = builtinPreset(boot.presetId)
    ? createWaterSettings({ preset: boot.presetId })
    : boot.settings;
  // Persisted documents predate the Ground contract and can contain an
  // offshore wave direction while reopening directly on Beach. Normalize
  // before the first engine build so a reload cannot silently reintroduce
  // the cross-shore phase bug.
  boot.settings = createWaterSettings({
    ...boot.settings,
    ...waterStageOverrides(bootStage, bootBase),
  });
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    lastChange: { immediate: false },
    localPresets: loadLocalWaterPresets(),
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'fresh' ? '' : boot.bootSource === 'handoff' ? 'Imported the playground water.' : 'Restored your last water.',
    view: {
      debug: 'off',
      fish: 30,
      kelp: 60,
      rain: false,
      rocks: true,
      // The ground under the water follows the preset (ocean should never
      // show a beach) but stays user-overridable in the Stage section.
      stage: bootStage,
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
    saveWaterDocument({ name: state().name, presetId: state().presetId, settings: state().settings });
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

  function commit(patch, { immediate = false, status = null } = {}) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
      lastChange: { immediate },
      ...(status === null ? {} : { status }),
    }));
    persist();
    updateHistoryFlags();
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const document = JSON.parse(entry);
    commit({
      ...document,
      settings: createWaterSettings(document.settings),
    }, { immediate: true, status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({ bootSource: 'started', name, presetDirty: false, presetId });
    commit({ settings }, { immediate: true, status });
  }

  store.actions = {
    /** Applies a built-in or local preset by id. */
    applyPreset(id) {
      const builtin = builtinPreset(id);
      if (builtin) {
        replaceForStart(createWaterSettings({ preset: id, ...stageOrientation(id) }), {
          name: builtin.label,
          presetId: id,
          status: `Opened ${builtin.label}.`,
        });
        const stage = STAGE_BY_PRESET[id];
        if (stage) store.setState({ view: { ...state().view, stage } });
        return true;
      }
      const local = localPreset(id);
      if (local) {
        replaceForStart(createWaterSettings(local.settings), {
          name: local.label,
          presetId: id,
          status: `Opened ${local.label}.`,
        });
        return true;
      }
      return false;
    },

    deletePreset(id) {
      deleteLocalWaterPreset(id);
      store.setState({
        localPresets: loadLocalWaterPresets(),
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    /** Serialized water-preset document JSON of the current settings. */
    exportDocument() {
      return serializeWaterPreset(slug(state().name), {
        label: state().name,
        settings: sanitizeWaterPresetSettings(state().settings),
      });
    },

    /** Sanitized snapshot for the playground preview handoff. */
    getHandoffPayload() {
      return {
        preset: state().presetId,
        settings: sanitizeWaterPresetSettings(state().settings),
      };
    },

    importDocument(text) {
      const result = parseWaterPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(createWaterSettings(result.value.settings), {
        name: result.value.label || 'Imported water',
        status: `Imported ${result.value.label || 'water preset'}.`,
      });
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearWaterDocument();
      replaceForStart(createWaterSettings({ preset: 'lake' }), {
        name: 'Untitled water',
        status: 'Water Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      let document;
      try {
        document = createWaterPresetDocument(id, {
          label: cleanName,
          settings: sanitizeWaterPresetSettings(state().settings),
        });
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      const saved = upsertLocalWaterPreset(document);
      if (!saved) return { ok: false };
      store.setState({
        localPresets: loadLocalWaterPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: saved.id,
        status: `Saved “${cleanName}” to your presets.`,
      });
      persist();
      return { ok: true, preset: saved };
    },

    setName(name) {
      const next = String(name || '').trim();
      if (!next) return;
      store.setState({ name: next, presetDirty: true });
      persist();
    },

    /** Single schema-field edit; value is already the field's plain shape. */
    setSetting(key, value) {
      const current = state().settings;
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: createWaterSettings({ ...current, [key]: value }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      const current = state();
      const nextStage = patch.stage;
      if (nextStage && nextStage !== current.view.stage) {
        const builtin = builtinPreset(current.presetId);
        const baseSettings = builtin
          ? createWaterSettings({ preset: builtin.id })
          : current.settings;
        const stageSettings = waterStageOverrides(nextStage, baseSettings);
        pushHistory('view:stage');
        commit({
          presetDirty: true,
          settings: createWaterSettings({ ...current.settings, ...stageSettings }),
          view: { ...current.view, ...patch },
        }, {
          immediate: true,
          status: nextStage === 'beach'
            ? 'Beach ground: shoreward swell with irregular 8–10 m run-up and varied backwash.'
            : 'Ground changed.',
        });
        return;
      }
      store.setState({ view: { ...current.view, ...patch } });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
