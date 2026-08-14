import {
  bumpDocumentRevision,
  createRockDocument,
  deserializeRockDocument,
  exportDocumentToGLB,
  getRockgenPresetOptions,
  normalizeRockgenPresetName,
  normalizeRockgenStyleName,
  rebaseRockDocumentStyle,
  ROCK_SURFACE_TEXTURE_PRESETS,
  serializeRockDocument,
} from '../../../src/rockgen/index.js';
import { downloadBlob } from '../../shared/download.js';
import { createStore } from '../../shared/ui/createStore.js';
import {
  createCatalogVariationDocument,
  getRockVariationCatalogEntry,
} from './catalog.js';
import {
  DEFAULT_ROCK_GRASS_PREVIEW,
  sanitizeRockGrassPreview,
} from './rockGrassPreview.js';

const DRAFT_STORAGE_KEY = 'toonlab.rockGeneration.draft.v1';
const LIBRARY_STORAGE_KEY = 'toonlab.rockGeneration.library.v1';
const HISTORY_LIMIT = 50;
const RESOLUTIONS = new Set([32, 40, 48, 64, 80, 96, 128]);

function slug(value, fallback = 'toonlab-rock') {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function presetLabel(id) {
  return getRockgenPresetOptions().find((entry) => entry.value === id)?.label ?? id;
}

function cloneDocument(document) {
  const clone = deserializeRockDocument(serializeRockDocument(document));
  // Serialization deliberately omits the runtime revision. Preserve it when
  // cloning for an edit so every subsequent bump remains strictly monotonic
  // and the engine never misses the second (or later) change.
  clone.revision = Math.max(0, Math.round(Number(document?.revision) || 0));
  return clone;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readLibrary() {
  const source = readJsonStorage(LIBRARY_STORAGE_KEY, []);
  if (!Array.isArray(source)) return [];
  return source
    .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.document === 'string')
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function bootDocument(urlParams) {
  const requestedPreset = urlParams.get('rockPreset');
  const hasRequestedSeed = urlParams.has('rockSeed');
  const requestedSeed = hasRequestedSeed ? Number(urlParams.get('rockSeed')) : Number.NaN;
  const hasRequestedResolution = urlParams.has('rockRes');
  const requestedResolution = hasRequestedResolution ? Number(urlParams.get('rockRes')) : Number.NaN;
  if (requestedPreset || (hasRequestedSeed && Number.isFinite(requestedSeed))
    || (hasRequestedResolution && RESOLUTIONS.has(requestedResolution))) {
    const preset = normalizeRockgenPresetName(requestedPreset ?? 'boulder');
    const document = createRockDocument({
      preset,
      seed: Number.isFinite(requestedSeed) ? Math.max(Math.round(requestedSeed), 0) : 0,
      style: 'default',
    });
    if (RESOLUTIONS.has(requestedResolution)) {
      document.meshing.previewResolution = requestedResolution;
      bumpDocumentRevision(document);
    }
    return document;
  }
  const saved = readJsonStorage(DRAFT_STORAGE_KEY, null);
  if (saved?.document) {
    try {
      return deserializeRockDocument(saved.document);
    } catch {
      // A damaged draft must never prevent a clean procedural boot.
    }
  }
  return createRockDocument({ preset: 'boulder', seed: 0, style: 'default' });
}

function catalogEntryForDocument(document) {
  if (document?.reference?.sourceMode !== 'mesh-template') return null;
  return getRockVariationCatalogEntry(document.reference.id);
}

function restoreCallMeSenseiCatalogBase(document) {
  if (catalogEntryForDocument(document)
    && document.style === 'call_me_sensei'
    && document.reference.surfaceMode === 'generated'
    && document.reference.topFinish === 'custom') {
    // Older builds treated the Call Me Sensei style like a procedural color
    // preset and baked its generic brown palette over the selected catalog
    // asset. For catalog rocks, Call Me Sensei means the actual released GLB.
    document.reference.surfaceMode = 'source';
    document.reference.topFinish = 'source';
  }
  return document;
}

function upgradeLegacyCatalogDocument(document, sourceId, variation = 0) {
  if (catalogEntryForDocument(document)) return restoreCallMeSenseiCatalogBase(document);
  const entry = getRockVariationCatalogEntry(sourceId);
  if (!entry) return document;
  const upgraded = createCatalogVariationDocument(entry, {
    style: document?.style,
    variation: Math.max(0, Math.round(Number(variation) || 0)),
  });
  upgraded.name = document?.name || upgraded.name;
  upgraded.revision = Number.isFinite(document?.revision) ? document.revision : upgraded.revision;
  return restoreCallMeSenseiCatalogBase(upgraded);
}

function isEditableDocument(document) {
  return document?.reference?.sourceMode !== 'mesh-template'
    || Boolean(catalogEntryForDocument(document));
}

function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export const ROCK_GENERATION_PREVIEW_RESOLUTIONS = Object.freeze(
  [...RESOLUTIONS].map((value) => ({ label: `${value} cells`, value })),
);

export const CATALOG_TOP_FINISH_OPTIONS = Object.freeze([
  Object.freeze({ label: 'None / bare', value: 'bare' }),
  Object.freeze({ label: 'Grass cap', value: 'grass' }),
  Object.freeze({ label: 'Sand cap', value: 'sand' }),
  Object.freeze({ label: 'Snow cap', value: 'snow' }),
]);

const CATALOG_TOP_SURFACE_KEYS = new Set([
  'topCoatStrength',
  'topColor',
  'topHeightStart',
  'topSlopeStart',
]);

export const CATALOG_SURFACE_PRESET_OPTIONS = Object.freeze([
  Object.freeze({
    description: 'The selected released asset with its authored GLB materials and textures.',
    label: 'Call Me Sensei',
    value: 'call_me_sensei',
  }),
  ...Object.entries(ROCK_SURFACE_TEXTURE_PRESETS).map(([value, preset]) => Object.freeze({
    description: preset.description,
    label: preset.label,
    value,
  })),
]);

export function catalogSurfacePresetValue(document) {
  if (document?.reference?.sourceMode === 'mesh-template'
    && document.surface?.pbrTexturePreset === 'none'
    && (document.style === 'call_me_sensei' || document.reference.surfaceMode === 'source')) {
    return 'call_me_sensei';
  }
  const surface = document?.surface;
  if (!surface) return 'custom';
  for (const [value, preset] of Object.entries(ROCK_SURFACE_TEXTURE_PRESETS)) {
    if (Object.entries(preset.surface).every(([key, expected]) => (
      CATALOG_TOP_SURFACE_KEYS.has(key) || sameValue(surface[key], expected)
    ))) {
      return value;
    }
  }
  return 'custom';
}

const CATALOG_TOP_FINISHES = Object.freeze({
  bare: Object.freeze({
    topCoatStrength: 0,
  }),
  grass: Object.freeze({
    topCoatStrength: 1,
    topColor: Object.freeze([0.34, 0.52, 0.2]),
    topHeightStart: 0.22,
    topSlopeStart: 0.42,
  }),
  sand: Object.freeze({
    topCoatStrength: 1,
    topColor: Object.freeze([0.78, 0.64, 0.42]),
    topHeightStart: 0.24,
    topSlopeStart: 0.46,
  }),
  snow: Object.freeze({
    topCoatStrength: 1,
    topColor: Object.freeze([0.9, 0.94, 0.98]),
    topHeightStart: 0.28,
    topSlopeStart: 0.48,
  }),
});

export function createRockGenerationStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const savedDraft = readJsonStorage(DRAFT_STORAGE_KEY, null);
  const document = upgradeLegacyCatalogDocument(
    bootDocument(urlParams),
    savedDraft?.catalogSourceId,
    savedDraft?.catalogVariation,
  );
  const opensEditorDirectly = urlParams.has('rockPreset')
    || urlParams.has('rockSeed')
    || urlParams.has('rockRes')
    || urlParams.get('editor') === '1'
    || urlParams.get('hud') === '0';
  const undoStack = [];
  const redoStack = [];
  let gestureOpen = false;
  let catalogRuntime = null;
  const bootCatalogEntry = catalogEntryForDocument(document);
  const store = createStore({
    canRedo: false,
    canUndo: false,
    dirty: false,
    docRevision: document.revision,
    document,
    exporting: false,
    grassPreview: { ...DEFAULT_ROCK_GRASS_PREVIEW },
    grassPreviewStats: { blades: 0, clumps: 0 },
    catalogSourceId: bootCatalogEntry?.id ?? savedDraft?.catalogSourceId ?? null,
    catalogVariation: Math.max(0, Math.round(Number(savedDraft?.catalogVariation) || 0)),
    library: readLibrary(),
    meshStats: {
      bounds: '—',
      milliseconds: 0,
      triangles: 0,
      vertices: 0,
    },
    selectedLocalId: null,
    status: 'First-party procedural document ready.',
    view: { home: !opensEditorDirectly },
    viewRevision: 0,
  });
  const state = () => store.getState();

  function persistDraft(nextDocument = state().document) {
    writeJsonStorage(DRAFT_STORAGE_KEY, {
      catalogSourceId: state().catalogSourceId,
      catalogVariation: state().catalogVariation,
      document: serializeRockDocument(nextDocument),
      updatedAt: new Date().toISOString(),
    });
  }

  function updateHistoryFlags() {
    store.setState({
      canRedo: redoStack.length > 0,
      canUndo: undoStack.length > 0,
    });
  }

  function pushHistory() {
    undoStack.push(serializeRockDocument(state().document));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateHistoryFlags();
  }

  function commit(nextDocument, {
    dirty = true,
    persist = true,
    reframe = false,
    selectedLocalId = state().selectedLocalId,
    catalogSourceId = state().catalogSourceId,
    catalogVariation = state().catalogVariation,
    status = null,
  } = {}) {
    store.setState((previous) => ({
      dirty,
      docRevision: nextDocument.revision,
      document: nextDocument,
      catalogSourceId,
      catalogVariation,
      selectedLocalId,
      ...(status === null ? {} : { status }),
      viewRevision: previous.viewRevision + (reframe ? 1 : 0),
    }));
    if (persist) persistDraft(nextDocument);
    updateHistoryFlags();
  }

  function replaceDocument(nextDocument, options = {}) {
    if (!isEditableDocument(nextDocument)) {
      throw new Error('This editor cannot resolve the source GLB for that rock document.');
    }
    pushHistory();
    commit(nextDocument, { reframe: true, ...options });
  }

  function restoreFromHistory(source, destination) {
    const snapshot = source.pop();
    if (!snapshot) return;
    destination.push(serializeRockDocument(state().document));
    const restored = deserializeRockDocument(snapshot);
    restored.revision = state().document.revision + 1;
    const restoredCatalogEntry = catalogEntryForDocument(restored);
    commit(restored, {
      catalogSourceId: restoredCatalogEntry?.id ?? null,
      catalogVariation: restoredCatalogEntry ? state().catalogVariation : 0,
      dirty: true,
      reframe: true,
      status: 'History restored.',
    });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(value) {
      const preset = normalizeRockgenPresetName(value);
      const current = state().document;
      const next = createRockDocument({
        name: presetLabel(preset),
        preset,
        seed: current.seed,
        style: current.style,
      });
      replaceDocument(next, {
        selectedLocalId: null,
        status: `Started ${presetLabel(preset)}.`,
        catalogSourceId: null,
        catalogVariation: 0,
      });
    },

    applyStyle(value) {
      pushHistory();
      const next = rebaseRockDocumentStyle(
        state().document,
        normalizeRockgenStyleName(value),
      );
      if (next.reference?.sourceMode === 'mesh-template') {
        const usesReleasedAssetBase = next.style === 'call_me_sensei';
        next.reference.surfaceMode = usesReleasedAssetBase ? 'source' : 'generated';
        next.reference.topFinish = usesReleasedAssetBase ? 'source' : 'custom';
      }
      commit(next, {
        status: next.reference?.sourceMode === 'mesh-template'
          && next.style === 'call_me_sensei'
          ? 'Restored the selected Call Me Sensei GLB and its original material.'
          : `Applied ${next.style} generation style.`,
      });
    },

    deleteLocal() {
      const id = state().selectedLocalId;
      if (!id) return false;
      const nextLibrary = state().library.filter((entry) => entry.id !== id);
      if (!writeJsonStorage(LIBRARY_STORAGE_KEY, nextLibrary)) {
        store.setState({ status: 'Could not update local saves.' });
        return false;
      }
      store.setState({
        dirty: true,
        library: nextLibrary,
        selectedLocalId: null,
        status: 'Local save deleted; the open document remains available.',
      });
      return true;
    },

    async exportGlb() {
      if (state().exporting) return;
      const snapshot = cloneDocument(state().document);
      const filename = `${slug(snapshot.name)}.glb`;
      store.setState({ exporting: true, status: 'Building GLB…' });
      try {
        const buffer = snapshot.reference?.sourceMode === 'mesh-template'
          ? await catalogRuntime?.exportGlb?.()
          : await exportDocumentToGLB(snapshot, {
            lods: snapshot.meshing.exportLods,
            name: slug(snapshot.name),
            resolution: snapshot.meshing.exportResolution,
            uv: 'box',
          });
        if (!(buffer instanceof ArrayBuffer)) {
          throw new Error('The selected catalog source is still loading.');
        }
        downloadBlob(buffer, filename, 'model/gltf-binary');
        store.setState({ status: `Exported ${filename}.` });
      } catch (error) {
        console.error('Rock GLB export failed:', error);
        store.setState({ status: `GLB export failed: ${error.message}` });
      } finally {
        store.setState({ exporting: false });
      }
    },

    exportJson() {
      const current = state().document;
      downloadBlob(
        serializeRockDocument(current, { pretty: true }),
        `${slug(current.name)}.rockgen.json`,
        'application/json',
      );
      store.setState({ status: 'Rock document JSON exported.' });
    },

    importDocument(text) {
      try {
        const next = upgradeLegacyCatalogDocument(deserializeRockDocument(text));
        if (!isEditableDocument(next)) {
          throw new Error('This editor cannot resolve the source GLB for that rock document.');
        }
        const catalogEntry = catalogEntryForDocument(next);
        next.revision = state().document.revision + 1;
        replaceDocument(next, {
          catalogSourceId: catalogEntry?.id ?? null,
          catalogVariation: 0,
          selectedLocalId: null,
          status: `Imported ${next.name}.`,
        });
        return { ok: true };
      } catch (error) {
        store.setState({ status: `Import failed: ${error.message}` });
        return { error: error.message, ok: false };
      }
    },

    loadLocal(id) {
      const entry = state().library.find((candidate) => candidate.id === id);
      if (!entry) return false;
      try {
        const next = upgradeLegacyCatalogDocument(
          deserializeRockDocument(entry.document),
          entry.catalogSourceId,
          entry.catalogVariation,
        );
        if (!isEditableDocument(next)) throw new Error('The saved catalog source is unavailable.');
        const catalogEntry = catalogEntryForDocument(next);
        next.revision = state().document.revision + 1;
        replaceDocument(next, {
          dirty: false,
          catalogSourceId: catalogEntry?.id ?? entry.catalogSourceId ?? null,
          catalogVariation: Math.max(0, Math.round(Number(entry.catalogVariation) || 0)),
          selectedLocalId: entry.id,
          status: `Opened local save “${entry.name}”.`,
        });
        return true;
      } catch (error) {
        store.setState({ status: `Could not open local save: ${error.message}` });
        return false;
      }
    },

    randomizeSeed() {
      this.setSeed(Math.floor(Math.random() * 0xffffffff));
    },

    redo() {
      restoreFromHistory(redoStack, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      const next = createRockDocument({ preset: 'boulder', seed: 0, style: 'default' });
      replaceDocument(next, {
        selectedLocalId: null,
        catalogSourceId: null,
        catalogVariation: 0,
        status: 'Rock & Cliff Generation reset.',
      });
    },

    saveLocal() {
      const current = state().document;
      const now = new Date().toISOString();
      const id = state().selectedLocalId
        ?? `${slug(current.name, 'rock')}-${Date.now().toString(36)}`;
      const entry = {
        catalogSourceId: state().catalogSourceId,
        catalogVariation: state().catalogVariation,
        document: serializeRockDocument(current),
        id,
        name: current.name,
        updatedAt: now,
      };
      const nextLibrary = [
        entry,
        ...state().library.filter((candidate) => candidate.id !== id),
      ];
      if (!writeJsonStorage(LIBRARY_STORAGE_KEY, nextLibrary)) {
        store.setState({ status: 'Could not write this local save.' });
        return false;
      }
      store.setState({
        dirty: false,
        library: nextLibrary,
        selectedLocalId: id,
        status: `Saved “${current.name}” locally.`,
      });
      persistDraft(current);
      return true;
    },

    saveLocalAs(value = state().document.name) {
      const name = String(value ?? '').trim();
      if (!name) return false;
      const current = cloneDocument(state().document);
      current.name = name;
      bumpDocumentRevision(current);
      commit(current, {
        dirty: true,
        selectedLocalId: null,
        status: `Prepared “${name}” as a new local save.`,
      });
      return this.saveLocal();
    },

    setHomeOpen(home) {
      store.setState({ view: { ...state().view, home: Boolean(home) } });
    },

    startCatalogVariation(id, variation = 0) {
      const entry = getRockVariationCatalogEntry(id);
      if (!entry) return false;
      const variationIndex = Math.max(0, Math.round(Number(variation) || 0));
      const strength = state().catalogSourceId === entry.id
        ? state().document.reference?.variation ?? 0.3
        : 0.3;
      const next = createCatalogVariationDocument(entry, {
        strength,
        style: state().document.style,
        variation: variationIndex,
      });
      replaceDocument(next, {
        catalogSourceId: entry.id,
        catalogVariation: variationIndex,
        selectedLocalId: null,
        status: `Loading ${entry.label} source GLB for variation ${variationIndex + 1}…`,
      });
      store.setState({ view: { ...state().view, home: false } });
      return true;
    },

    regenerateCatalogVariation() {
      const id = state().catalogSourceId;
      if (!id) return false;
      return this.startCatalogVariation(id, state().catalogVariation + 1);
    },

    registerCatalogRuntime(runtime) {
      catalogRuntime = runtime;
    },

    setCatalogGrassPreview(patch = {}) {
      const grassPreview = sanitizeRockGrassPreview({ ...state().grassPreview, ...patch });
      store.setState({
        grassPreview,
        status: grassPreview.enabled
          ? 'Updating surface-following meadow grass preview…'
          : 'Meadow grass preview hidden.',
      });
      void catalogRuntime?.setGrassPreview?.(grassPreview);
    },

    setCatalogVariationStrength(value) {
      const current = state().document;
      if (current.reference?.sourceMode !== 'mesh-template') return;
      const strength = Math.min(Math.max(Number(value) || 0, 0), 1);
      if (strength === current.reference.variation) return;
      pushHistory();
      const next = cloneDocument(current);
      next.reference.variation = strength;
      bumpDocumentRevision(next);
      commit(next, {
        status: strength === 0
          ? 'Showing the exact released source GLB.'
          : `Applied ${Math.round(strength * 100)}% source-mesh variation.`,
      });
    },

    applyCatalogTopFinish(value) {
      const finish = String(value ?? 'source');
      const current = state().document;
      if (current.reference?.sourceMode !== 'mesh-template') return false;
      if (finish !== 'source' && !CATALOG_TOP_FINISHES[finish]) return false;
      pushHistory();
      const next = cloneDocument(current);
      if (current.reference.surfaceMode === 'source' && finish !== 'source') {
        next.style = 'call_me_sensei';
      }
      next.reference.surfaceMode = finish === 'source' ? 'source' : 'generated';
      next.reference.topFinish = finish;
      if (finish !== 'source') {
        Object.assign(next.surface, structuredClone(CATALOG_TOP_FINISHES[finish]));
      }
      bumpDocumentRevision(next);
      commit(next, {
        status: finish === 'bare'
          ? 'Removed the top finish without changing the rock surface.'
          : `Applied ${finish} top finish to the source GLB.`,
      });
      return true;
    },

    applyCatalogSurfacePreset(value) {
      const presetId = String(value ?? 'call_me_sensei');
      const current = state().document;
      if (current.reference?.sourceMode !== 'mesh-template') return false;
      if (presetId !== 'call_me_sensei' && !ROCK_SURFACE_TEXTURE_PRESETS[presetId]) return false;
      pushHistory();
      const next = cloneDocument(current);
      if (presetId === 'call_me_sensei') {
        next.style = 'call_me_sensei';
        next.reference.surfaceMode = 'source';
        next.reference.topFinish = 'source';
        Object.assign(next.surface, {
          lichenCoverage: 0,
          mossCoverage: 0,
          pbrTexturePreset: 'none',
          stainStrength: 0,
          topCoatStrength: 0,
          veinStrength: 0,
        });
      } else {
        const retainedFinish = CATALOG_TOP_FINISHES[current.reference.topFinish]
          ? current.reference.topFinish
          : 'bare';
        next.style = 'default';
        next.reference.surfaceMode = 'generated';
        next.reference.topFinish = retainedFinish;
        Object.assign(next.surface, structuredClone(ROCK_SURFACE_TEXTURE_PRESETS[presetId].surface));
        next.surface.pbrTexturePreset = 'none';
        Object.assign(next.surface, structuredClone(CATALOG_TOP_FINISHES[retainedFinish]));
      }
      bumpDocumentRevision(next);
      commit(next, {
        status: presetId === 'call_me_sensei'
          ? 'Restored the selected Call Me Sensei GLB and its original material.'
          : `Applied ${ROCK_SURFACE_TEXTURE_PRESETS[presetId].label} surface preset.`,
      });
      return true;
    },

    clearCatalogMeshEdits() {
      const current = state().document;
      if (current.reference?.sourceMode !== 'mesh-template'
        || (current.reference.meshEdits?.length ?? 0) === 0) return false;
      pushHistory();
      const next = cloneDocument(current);
      next.reference.meshEdits = [];
      bumpDocumentRevision(next);
      commit(next, { status: 'Reset the editable mesh to its generated variation.' });
      return true;
    },

    commitCatalogMeshEdit(edit) {
      const current = state().document;
      if (current.reference?.sourceMode !== 'mesh-template'
        || !Array.isArray(edit?.deltas)
        || edit.deltas.length === 0) return false;
      pushHistory();
      const next = cloneDocument(current);
      next.reference.meshEdits.push({
        deltas: edit.deltas,
        meshIndex: Math.max(0, Math.round(Number(edit.meshIndex) || 0)),
      });
      bumpDocumentRevision(next);
      commit(next, {
        status: `Sculpted ${edit.deltas.length.toLocaleString()} vertices.`,
      });
      return true;
    },

    setField(field, value, interaction = null) {
      const current = state().document;
      const target = field.group === 'surface' || field.group === 'meshing'
        ? current
        : current.pieces[0];
      const existing = target?.[field.group]?.[field.key];
      if (sameValue(existing, value)) {
        if (interaction?.gestureEnd) {
          gestureOpen = false;
          persistDraft(current);
        }
        return;
      }
      if (interaction?.gestureStart && !gestureOpen) {
        pushHistory();
        gestureOpen = true;
      } else if (!interaction?.transient && !interaction?.gestureEnd && !gestureOpen) {
        pushHistory();
      }
      const next = cloneDocument(current);
      const nextTarget = field.group === 'surface' || field.group === 'meshing'
        ? next
        : next.pieces[0];
      nextTarget[field.group][field.key] = Array.isArray(value) ? [...value] : value;
      if (field.group === 'surface' && next.reference?.sourceMode === 'mesh-template') {
        if (current.reference.surfaceMode === 'source') next.style = 'call_me_sensei';
        next.reference.surfaceMode = 'generated';
        if (CATALOG_TOP_SURFACE_KEYS.has(field.key)) next.reference.topFinish = 'custom';
      }
      bumpDocumentRevision(next);
      commit(next, {
        persist: !interaction?.transient,
        status: `Updated ${field.label}.`,
      });
      if (interaction?.gestureEnd) gestureOpen = false;
    },

    setName(value) {
      const name = String(value ?? '').trim();
      if (!name || name === state().document.name) return;
      pushHistory();
      const next = cloneDocument(state().document);
      next.name = name;
      bumpDocumentRevision(next);
      commit(next, { status: `Renamed to ${name}.` });
    },

    setResolution(value) {
      const resolution = Number(value);
      if (!RESOLUTIONS.has(resolution)) return;
      const field = {
        group: 'meshing',
        key: 'previewResolution',
        label: 'Preview Resolution',
      };
      this.setField(field, resolution);
    },

    setSeed(value) {
      const seed = Math.max(Math.round(Number(value)) || 0, 0) >>> 0;
      if (seed === state().document.seed) return;
      pushHistory();
      const next = cloneDocument(state().document);
      next.seed = seed;
      bumpDocumentRevision(next);
      commit(next, { status: `Seed ${seed} generated.` });
    },

    setStatus(status) {
      store.setState({ status });
    },

    undo() {
      restoreFromHistory(undoStack, redoStack);
      updateHistoryFlags();
    },
  };

  persistDraft(document);
  return store;
}
