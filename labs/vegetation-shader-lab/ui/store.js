// Tree, Grass, and Flower own independent role settings over one editable
// vegetation treatment base. Preview state remains outside every document so
// current palette/weather/wind never leak into a shader profile.

import { createStore } from '../../shared/ui/index.js';
import {
  createVegetationSharedShaderSettings,
  createVegetationShaderPresetDocument,
  createVegetationShaderScopePresetDocument,
  createVegetationShaderSettings,
  getVegetationShaderPresetOptions,
  isVegetationSharedShaderGroup,
  mergeVegetationSharedShaderSettings,
  parseVegetationShaderPresetDocument,
  parseVegetationShaderScopePresetDocument,
  serializeVegetationShaderPreset,
  serializeVegetationShaderScopePreset,
  VEGETATION_SHADER_SCOPES,
} from '../../../src/vegetation/vegetationShaders.js';
import {
  deleteLocalVegetationShaderProfile,
  loadLocalVegetationShaderProfiles,
  upsertLocalVegetationShaderProfile,
} from '../vegetationShaderPresetStore.js';
import {
  createP18PreviewSettings,
  DEFAULT_P18_PREVIEW_SETTINGS,
} from '../../shared/p18/previewStyles.js';
import {
  normalizeFlowerShaderPreviewAsset,
  normalizeTreeShaderPreviewAsset,
  P18_FLOWER_SHADER_PREVIEW_ASSET,
  P18_TREE_SHADER_PREVIEW_ASSET,
} from '../previewAssets.js';

export const VEGETATION_SHADER_DRAFT_STORAGE_KEY = 'toonlab.vegetationShaderDraft.v1';
export const VEGETATION_SHADER_SHARED_BASE_STORAGE_KEY =
  'toonlab.vegetationShaderSharedBase.v1';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'vegetation-style').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'vegetation_style';
}

function draftStorageKey(scope) {
  return scope === 'vegetation'
    ? VEGETATION_SHADER_DRAFT_STORAGE_KEY
    : `toonlab.vegetationShaderDraft.${scope}.v1`;
}

function readDraft(scope) {
  try {
    const raw = window.localStorage?.getItem(draftStorageKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(scope, document) {
  try {
    window.localStorage?.setItem(draftStorageKey(scope), JSON.stringify(document));
  } catch {
    // Keep authoring when storage is unavailable.
  }
}

function clearDraft(scope) {
  try {
    window.localStorage?.removeItem(draftStorageKey(scope));
  } catch {
    // Ignore storage failures.
  }
}

function readSharedBase() {
  try {
    const raw = window.localStorage?.getItem(
      VEGETATION_SHADER_SHARED_BASE_STORAGE_KEY,
    );
    const saved = raw ? JSON.parse(raw) : {};
    return createVegetationSharedShaderSettings({
      preset: 'call_me_sensei',
      ...saved,
    });
  } catch {
    return createVegetationSharedShaderSettings({ preset: 'call_me_sensei' });
  }
}

function writeSharedBase(settings) {
  try {
    window.localStorage?.setItem(
      VEGETATION_SHADER_SHARED_BASE_STORAGE_KEY,
      JSON.stringify(createVegetationSharedShaderSettings(settings)),
    );
  } catch {
    // Keep authoring when storage is unavailable.
  }
}

function presetLabel(id) {
  return getVegetationShaderPresetOptions()
    .find((entry) => (entry.value ?? entry.id) === id)?.label ?? id;
}

function queryParameterForScope(scope) {
  return scope === 'vegetation' ? 'vegetationShader' : `${scope}Shader`;
}

function defaultPreviewAsset(scope) {
  if (scope === 'tree') return P18_TREE_SHADER_PREVIEW_ASSET;
  if (scope === 'flower') return P18_FLOWER_SHADER_PREVIEW_ASSET;
  return null;
}

function normalizePreviewAsset(scope, value) {
  if (scope === 'tree') return normalizeTreeShaderPreviewAsset(value);
  if (scope === 'flower') return normalizeFlowerShaderPreviewAsset(value);
  return null;
}

function bootDocument(urlParams, scope) {
  // Explicit profile links (including Pro's ?cloudDoc= hydration, which
  // resolves to ?vegetationShader= before this module boots) must win over
  // an unrelated autosaved draft. Ordinary visits still restore the draft.
  const linkedPresetId = urlParams.get(queryParameterForScope(scope));
  if (linkedPresetId) {
    return {
      bootSource: 'preset',
      name: presetLabel(linkedPresetId),
      presetId: linkedPresetId,
      settings: createVegetationShaderSettings({ preset: linkedPresetId }),
      view: {},
    };
  }
  const saved = readDraft(scope);
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
    name: scope === 'vegetation'
      ? presetLabel(presetId)
      : `${presetLabel(presetId)} · ${VEGETATION_SHADER_SCOPES[scope].label}`,
    presetId,
    settings: createVegetationShaderSettings({ preset: presetId }),
    view: {},
  };
}

export function createVegetationMaterialLabStore({
  scope = 'vegetation',
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const resolvedScope = scope === 'vegetation' || VEGETATION_SHADER_SCOPES[scope]
    ? scope
    : 'vegetation';
  const localPresets = loadLocalVegetationShaderProfiles(resolvedScope);
  const boot = bootDocument(urlParams, resolvedScope);
  const sharedBase = readSharedBase();
  const effectiveBootSettings = resolvedScope === 'vegetation'
    ? createVegetationShaderSettings({
      ...boot.settings,
      ...sharedBase,
    })
    : mergeVegetationSharedShaderSettings(
      resolvedScope,
      boot.settings,
      sharedBase,
    );
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    coverage: {
      applied: 0,
      fallback: 0,
      matched: 0,
      unsupported: 0,
      writes: 0,
    },
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    previewAutoCycle: false,
    previewHour: 13,
    runtimeAdapter: null,
    runtimeErrors: [],
    preview: createP18PreviewSettings({
      bundle: urlParams.get('previewBundle')
        ?? DEFAULT_P18_PREVIEW_SETTINGS.bundle,
      scenePreset: urlParams.get('previewScene')
        ?? DEFAULT_P18_PREVIEW_SETTINGS.scenePreset,
    }),
    scope: resolvedScope,
    settings: effectiveBootSettings,
    sharedBase,
    status: boot.bootSource === 'persisted' ? 'Restored your vegetation shader profile.' : '',
    view: {
      ...boot.view,
      interactionAmount: Number.isFinite(boot.view?.interactionAmount)
        ? boot.view.interactionAmount
        : 0,
      previewAsset: normalizePreviewAsset(
        resolvedScope,
        boot.view?.previewAsset,
      ),
      viewMode: ['composition', 'isolate', 'top'].includes(boot.view?.viewMode)
        ? boot.view.viewMode
        : 'composition',
      snowCover: Number.isFinite(boot.view?.snowCover) ? boot.view.snowCover : 0,
      wetness: Number.isFinite(boot.view?.wetness) ? boot.view.wetness : 0,
      windStrength: Number.isFinite(boot.view?.windStrength)
        ? boot.view.windStrength
        : 1.2,
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
    sharedBase: state().sharedBase,
  });

  function persist() {
    writeDraft(resolvedScope, {
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
      view: state().view,
    });
    writeSharedBase(state().sharedBase);
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
    const restoredShared = createVegetationSharedShaderSettings({
      preset: 'call_me_sensei',
      ...document.sharedBase,
    });
    commit({
      ...document,
      settings: resolvedScope === 'vegetation'
        ? createVegetationShaderSettings({
          ...document.settings,
          ...restoredShared,
        })
        : mergeVegetationSharedShaderSettings(
          resolvedScope,
          document.settings,
          restoredShared,
        ),
      sharedBase: restoredShared,
    }, 'History restored.');
  }

  function replace(settings, { name, presetId = null, status }) {
    pushHistory();
    const nextSharedBase = createVegetationSharedShaderSettings(settings);
    store.setState({ name, presetDirty: false, presetId });
    commit({
      settings: resolvedScope === 'vegetation'
        ? createVegetationShaderSettings({
          ...settings,
          ...nextSharedBase,
        })
        : mergeVegetationSharedShaderSettings(
          resolvedScope,
          settings,
          nextSharedBase,
        ),
      sharedBase: nextSharedBase,
    }, status);
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
      deleteLocalVegetationShaderProfile(id, resolvedScope);
      store.setState({
        localPresets: loadLocalVegetationShaderProfiles(resolvedScope),
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    exportDocument() {
      if (resolvedScope === 'vegetation') {
        return serializeVegetationShaderPreset(
          createVegetationShaderPresetDocument(slug(state().name), {
            label: state().name,
            settings: state().settings,
          }),
        );
      }
      return serializeVegetationShaderScopePreset(
        resolvedScope,
        createVegetationShaderScopePresetDocument(
          resolvedScope,
          slug(state().name),
          {
            label: state().name,
            settings: state().settings,
          },
        ),
      );
    },

    importDocument(text) {
      const result = resolvedScope === 'vegetation'
        ? parseVegetationShaderPresetDocument(text)
        : parseVegetationShaderScopePresetDocument(resolvedScope, text);
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
      clearDraft(resolvedScope);
      replace(createVegetationShaderSettings({ preset: 'call_me_sensei' }), {
        name: resolvedScope === 'vegetation'
          ? presetLabel('call_me_sensei')
          : `${presetLabel('call_me_sensei')} · ${VEGETATION_SHADER_SCOPES[resolvedScope].label}`,
        presetId: 'call_me_sensei',
        status: `${VEGETATION_SHADER_SCOPES[resolvedScope]?.label ?? 'Vegetation Shader Lab'} reset.`,
      });
      store.setState({
        preview: createP18PreviewSettings(DEFAULT_P18_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: {
          interactionAmount: 0,
          previewAsset: defaultPreviewAsset(resolvedScope),
          viewMode: 'composition',
          snowCover: 0,
          wetness: 0,
          windStrength: 1.2,
        },
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Profile name is required.'], ok: false };
      const documentId = `local_${resolvedScope}_${slug(cleanName)}_${Date.now().toString(36)}`;
      const document = resolvedScope === 'vegetation'
        ? createVegetationShaderPresetDocument(documentId, {
          label: cleanName,
          settings: state().settings,
        })
        : createVegetationShaderScopePresetDocument(resolvedScope, documentId, {
          label: cleanName,
          settings: state().settings,
        });
      try {
        upsertLocalVegetationShaderProfile(document, resolvedScope);
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalVegetationShaderProfiles(resolvedScope),
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
      if (isVegetationSharedShaderGroup(groupId)) {
        const nextSharedBase = createVegetationSharedShaderSettings({
          ...state().sharedBase,
          [groupId]: { ...state().sharedBase[groupId], [key]: value },
        });
        commit({
          presetDirty: true,
          settings: resolvedScope === 'vegetation'
            ? createVegetationShaderSettings({
              ...state().settings,
              ...nextSharedBase,
            })
            : mergeVegetationSharedShaderSettings(
              resolvedScope,
              state().settings,
              nextSharedBase,
            ),
          sharedBase: nextSharedBase,
        }, `Updated shared ${groupId}; Tree, Grass, and Flower now use this value.`);
        return;
      }
      commit({
        presetDirty: true,
        settings: resolvedScope === 'vegetation'
          ? createVegetationShaderSettings({
            ...state().settings,
            [groupId]: { ...state().settings[groupId], [key]: value },
          })
          : mergeVegetationSharedShaderSettings(
            resolvedScope,
            {
              ...state().settings,
              [groupId]: { ...state().settings[groupId], [key]: value },
            },
            state().sharedBase,
          ),
      });
    },

    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
    },

    setPreviewAsset(previewAsset) {
      if (resolvedScope !== 'tree' && resolvedScope !== 'flower') return;
      const resolved = normalizePreviewAsset(resolvedScope, previewAsset);
      store.setState({
        status: `Previewing ${resolved.label}. The shader profile was not changed.`,
        view: { ...state().view, previewAsset: resolved },
      });
      persist();
    },

    resetPreviewSettings() {
      store.setState({
        preview: createP18PreviewSettings(DEFAULT_P18_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: {
          ...state().view,
          previewAsset: defaultPreviewAsset(resolvedScope)
            ?? state().view.previewAsset,
          viewMode: 'composition',
        },
      });
      persist();
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

    setPreviewHour(previewHour) {
      const value = Number(previewHour);
      if (!Number.isFinite(value)) return;
      store.setState({ previewHour: ((value % 24) + 24) % 24 });
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
