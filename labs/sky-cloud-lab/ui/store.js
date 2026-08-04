import { createStore } from '../../shared/ui/createStore.js';
import {
  createCloudCompositionDocument,
  createCloudShaderPresetDocument,
  createCloudShaderSettings,
  createCloudSourceDocument,
  createDefaultCloudStrokes,
} from '../../../src/cloud/index.js';
import {
  createSkyShaderPresetDocument,
  createSkyTimeKeyframes,
  sampleSkyTimeKeyframes,
} from '../../../src/sky/index.js';

export const SKY_CLOUD_LAB_STORAGE_KEY = 'toonlab.skyCloudLab.workspace.v8';
const HISTORY_LIMIT = 60;

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(SKY_CLOUD_LAB_STORAGE_KEY));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value, fallback = 'document') {
  return String(value || fallback).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function defaultDocuments() {
  const source = createCloudSourceDocument('hero-cloud', {
    label: 'Hero Cloud',
    preset: 'puffy_cumulus',
    seed: 20260803,
    strokes: createDefaultCloudStrokes('puffy_cumulus'),
  });
  return {
    cloudComposition: createCloudCompositionDocument('sky-cloud-composition', {
      label: 'Sky & Cloud Composition',
      layers: [
        {
          azimuth: [180, 180], count: 1, elevation: [15, 15], id: 'hero-cumulus',
          opacity: 1, parallax: 1, radius: 1_050, scale: [620, 620], seed: 71,
          sourceRefs: [source.id], wind: [0.18, 0.04],
          placements: [{
            azimuth: 205,
            elevation: 12,
            id: 'hero-cloud-review',
            opacity: 1,
            parallax: 1,
            radius: 1_050,
            rotation: -2,
            scale: 520,
            sourceRef: source.id,
            wind: [0.18, 0.04],
          }],
        },
      ],
    }),
    cloudShader: createCloudShaderPresetDocument('sky-cloud-look', {
      label: 'Sky & Cloud Look',
      settings: createCloudShaderSettings({ preset: 'call_me_sensei' }),
    }),
    cloudSource: source,
    sky: createSkyShaderPresetDocument('sky-cloud-atmosphere', {
      label: 'Sky & Cloud Atmosphere',
      preset: 'call_me_sensei',
    }),
  };
}

function normalizeDocuments(input) {
  const fallback = defaultDocuments();
  try {
    return {
      cloudComposition: createCloudCompositionDocument(
        input?.cloudComposition ?? fallback.cloudComposition,
      ),
      cloudShader: createCloudShaderPresetDocument(
        input?.cloudShader?.id ?? fallback.cloudShader.id,
        input?.cloudShader ?? fallback.cloudShader,
      ),
      cloudSource: createCloudSourceDocument(input?.cloudSource ?? fallback.cloudSource),
      sky: createSkyShaderPresetDocument(
        input?.sky?.id ?? fallback.sky.id,
        input?.sky ?? fallback.sky,
      ),
    };
  } catch {
    return fallback;
  }
}

export function createSkyCloudLabStore({ initialTab = 'preview' } = {}) {
  const saved = readSaved();
  const initialDocuments = normalizeDocuments(saved?.documents);
  const undoStack = [];
  const redoStack = [];
  const store = createStore({
    activeTab: initialTab,
    brush: { mode: 'paint', radius: 0.065 },
    canRedo: false,
    canUndo: false,
    documents: initialDocuments,
    engineReady: false,
    generation: { error: null, maps: null, resolution: 0, status: 'idle' },
    revision: 0,
    selectedKeyframeId: initialDocuments.sky.timeKeyframes[0]?.id,
    status: saved ? 'Restored the last workspace.' : 'Authored hero cloud ready.',
    view: {
      autoCycle: false,
      hour: Number(saved?.view?.hour ?? 13),
      weather: String(saved?.view?.weather ?? 'clear'),
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify(state().documents);

  function persist() {
    try {
      localStorage.setItem(SKY_CLOUD_LAB_STORAGE_KEY, JSON.stringify({
        documents: state().documents,
        view: { hour: state().view.hour, weather: state().view.weather },
      }));
    } catch {
      // Editing remains functional without persistence.
    }
  }

  function flags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function commit(documents, status = '') {
    store.setState((previous) => ({
      documents: normalizeDocuments(documents),
      revision: previous.revision + 1,
      status,
    }));
    persist();
    flags();
  }

  function updateDocument(key, value, status) {
    pushHistory();
    commit({ ...state().documents, [key]: value }, status);
  }

  function restore(stack, destination) {
    const entry = stack.pop();
    if (!entry) return;
    destination.push(snapshot());
    commit(JSON.parse(entry), 'History restored.');
    flags();
  }

  store.actions = {
    addKeyframe() {
      const current = state();
      const sampled = sampleSkyTimeKeyframes(
        current.documents.sky.timeKeyframes,
        current.view.hour,
      );
      const id = `time-${String(current.view.hour).replace('.', '-')}`;
      const keyframe = {
        belowHorizonTint: sampled.belowHorizonTint,
        contrast: sampled.contrast,
        exposure: sampled.exposure,
        horizonGlow: sampled.horizonGlow,
        horizonGlowColor: sampled.horizonGlowColor,
        horizonTint: sampled.horizonTint,
        hour: current.view.hour,
        id,
        label: `Time ${current.view.hour.toFixed(1)}`,
        saturation: sampled.saturation,
        zenithTint: sampled.zenithTint,
      };
      const next = createSkyTimeKeyframes([...current.documents.sky.timeKeyframes, keyframe]);
      updateDocument('sky', createSkyShaderPresetDocument(current.documents.sky.id, {
        ...current.documents.sky,
        timeKeyframes: next,
      }), 'Time keyframe added.');
      store.setState({ selectedKeyframeId: id });
    },

    addStroke(stroke) {
      const source = state().documents.cloudSource;
      updateDocument('cloudSource', createCloudSourceDocument({
        ...source,
        outputs: null,
        strokes: [...source.strokes, stroke],
      }), 'Stroke added. Generate to update the cloud.');
    },

    adoptEngineState(patch) {
      store.setState(patch);
    },

    clearStrokes() {
      const source = state().documents.cloudSource;
      updateDocument('cloudSource', createCloudSourceDocument({
        ...source, outputs: null, strokes: [],
      }), 'Canvas cleared.');
    },

    deleteKeyframe(id) {
      const sky = state().documents.sky;
      if (sky.timeKeyframes.length <= 2) {
        store.setState({ status: 'A sky curve requires at least two keyframes.' });
        return;
      }
      const next = sky.timeKeyframes.filter((entry) => entry.id !== id);
      updateDocument('sky', createSkyShaderPresetDocument(sky.id, {
        ...sky, timeKeyframes: next,
      }), 'Time keyframe deleted.');
      store.setState({ selectedKeyframeId: next[0]?.id });
    },

    markGenerating() {
      store.setState({ generation: { ...state().generation, error: null, status: 'working' } });
    },

    receiveGeneration(maps) {
      store.setState({
        generation: { error: null, maps, resolution: maps.width, status: 'ready' },
        status: `Generated ${maps.width}² structural maps.`,
      });
    },

    rejectGeneration(error) {
      store.setState({
        generation: { ...state().generation, error: String(error), status: 'error' },
        status: String(error),
      });
    },

    redo() {
      restore(redoStack, undoStack);
    },

    regenerate() {
      const source = state().documents.cloudSource;
      updateDocument('cloudSource', createCloudSourceDocument({
        ...source, outputs: null, seed: (source.seed + 1) >>> 0,
      }), `Regeneration seed ${((source.seed + 1) >>> 0)} selected.`);
    },

    reset() {
      pushHistory();
      commit(defaultDocuments(), 'Workspace reset.');
      store.setState({ generation: { error: null, maps: null, resolution: 0, status: 'idle' } });
    },

    selectKeyframe(id) {
      store.setState({ selectedKeyframeId: id });
    },

    setActiveTab(activeTab) {
      store.setState({ activeTab });
    },

    setAtmosphere(key, value) {
      const sky = state().documents.sky;
      updateDocument('sky', createSkyShaderPresetDocument(sky.id, {
        ...sky, atmosphere: { ...sky.atmosphere, [key]: Number(value) },
      }), `${key} updated.`);
    },

    setBrush(patch) {
      store.setState({ brush: { ...state().brush, ...patch } });
    },

    setCloudSetting(key, value) {
      const document = state().documents.cloudShader;
      updateDocument('cloudShader', createCloudShaderPresetDocument(document.id, {
        ...document,
        settings: createCloudShaderSettings({
          ...document.settings,
          [key]: value,
        }),
      }), `${key} updated.`);
    },

    setGenerationSetting(key, value) {
      const source = state().documents.cloudSource;
      updateDocument('cloudSource', createCloudSourceDocument({
        ...source,
        ...(key === 'seed' ? { seed: Number(value) } : {}),
        generation: key === 'seed'
          ? source.generation
          : { ...source.generation, [key]: Number(value) },
        outputs: null,
      }), `${key} updated. Generate to preview.`);
    },

    setKeyframe(id, patch) {
      const sky = state().documents.sky;
      const previous = sky.timeKeyframes.find((entry) => entry.id === id);
      if (!previous) return;
      const nextEntry = { ...previous, ...patch };
      const without = sky.timeKeyframes.filter((entry) => entry.id !== id);
      const next = createSkyTimeKeyframes([...without, nextEntry]);
      updateDocument('sky', createSkyShaderPresetDocument(sky.id, {
        ...sky, timeKeyframes: next,
      }), 'Time curve updated.');
      store.setState({ selectedKeyframeId: nextEntry.id });
    },

    setLayer(index, patch) {
      const document = state().documents.cloudComposition;
      const layers = document.layers.map((layer, layerIndex) =>
        layerIndex === index ? { ...layer, ...patch } : layer);
      updateDocument('cloudComposition', createCloudCompositionDocument({
        ...document, layers,
      }), 'Composition updated.');
    },

    setPreset(preset) {
      const source = state().documents.cloudSource;
      updateDocument('cloudSource', createCloudSourceDocument({
        ...source,
        generation: {},
        outputs: null,
        preset,
      }), `${preset.replaceAll('_', ' ')} preset applied.`);
    },

    setSourceName(label) {
      const source = state().documents.cloudSource;
      const nextSource = createCloudSourceDocument({
        ...source, id: slug(label, source.id), label,
      });
      const composition = createCloudCompositionDocument({
        ...state().documents.cloudComposition,
        layers: state().documents.cloudComposition.layers.map((layer) => ({
          ...layer,
          sourceRefs: layer.sourceRefs.map((id) => id === source.id ? nextSource.id : id),
        })),
      });
      pushHistory();
      commit({ ...state().documents, cloudComposition: composition, cloudSource: nextSource }, 'Cloud source renamed.');
    },

    setView(patch) {
      const next = { ...state().view, ...patch };
      next.hour = ((Number(next.hour) % 24) + 24) % 24;
      store.setState({ view: next });
      persist();
    },

    undo() {
      restore(undoStack, redoStack);
    },
  };

  return store;
}
