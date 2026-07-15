// VFX Lab state: a preset + nested overrides over DEFAULT_VFX_SETTINGS, the
// seed, and the demo-loop toggle. The DESIGN OUTPUT of this lab is a recipe
// document — `{ schema, version, preset, seed, settings }` — that drops
// straight into `createVfxSystem(...)` in game code (no GLB; effects are
// runtime events, so the artifact is the tuned configuration itself).

import { createStore } from '../../shared/ui/createStore.js';
import {
  createVfxSettings,
  DEFAULT_VFX_SETTINGS,
  resolveVfxPreset,
} from '../../../src/vfxgen/index.js';

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeGroupOverrides(...layers) {
  const merged = {};
  for (const layer of layers) {
    for (const [group, values] of Object.entries(cleanObject(layer))) {
      merged[group] = { ...merged[group], ...cleanObject(values) };
    }
  }
  return merged;
}

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

// Seed stays within the seed scrubber's 1–99999 range.
const INITIAL = Object.freeze({
  loop: true,
  overrides: {},
  presetId: 'call_me_sensei',
  seed: 20267,
  status: '',
});

export function createVfxLabStore({ urlParams } = {}) {
  const initial = { ...INITIAL };
  // NOTE: get() returns null when absent and Number(null) === 0 — guard on
  // presence first or every unparameterized load pins the seed to 1.
  const rawSeed = urlParams?.get('seed');
  if (rawSeed !== null && rawSeed !== undefined && Number.isFinite(Number(rawSeed))) {
    initial.seed = Math.max(1, Math.round(Number(rawSeed)));
  }
  const presetParam = urlParams?.get('preset');
  if (presetParam) initial.presetId = presetParam;
  const recipeParam = urlParams?.get('vfxRecipe');
  if (recipeParam) {
    try {
      const doc = JSON.parse(recipeParam);
      if (doc && typeof doc === 'object') {
        if (typeof doc.preset === 'string') initial.presetId = doc.preset;
        if (Number.isFinite(Number(doc.seed))) initial.seed = Number(doc.seed);
        initial.overrides = cleanObject(doc.settings);
      }
    } catch {
      /* malformed share links fall back to defaults */
    }
  }
  if (urlParams?.get('loop') === '0') initial.loop = false;

  const store = createStore(initial);

  /** Preset + overrides resolved to full settings (what the panel shows). */
  function effectiveSettings(state = store.getState()) {
    return createVfxSettings(
      mergeGroupOverrides(resolveVfxPreset(state.presetId), state.overrides));
  }

  const actions = {
    /** Panel edits: store the override; prune it when it lands back on the resolved preset value. */
    setField(groupId, key, value) {
      store.setState((state) => {
        const presetValue = resolveVfxPreset(state.presetId)?.[groupId]?.[key]
          ?? DEFAULT_VFX_SETTINGS[groupId]?.[key];
        const group = { ...cleanObject(state.overrides[groupId]) };
        if (sameValue(value, presetValue)) delete group[key];
        else group[key] = value;
        const overrides = { ...state.overrides };
        if (Object.keys(group).length === 0) delete overrides[groupId];
        else overrides[groupId] = group;
        return { overrides, status: '' };
      });
    },
    applyPreset(presetId) {
      store.setState({ overrides: {}, presetId, status: `Preset "${presetId}" applied.` });
    },
    setSeed(seed) {
      store.setState({ seed: Math.max(1, Math.round(Number(seed) || 1)) });
    },
    randomizeSeed() {
      store.setState({ seed: 1 + Math.floor(Math.random() * 99999) });
    },
    setLoop(loop) {
      store.setState({ loop: Boolean(loop) });
    },
    setStatus(status) {
      store.setState({ status });
    },
    resetLab() {
      store.setState({ ...INITIAL, status: 'Lab reset.' });
    },
    /** The lab's artifact: paste-ready recipe for createVfxSystem. */
    getRecipeDocument() {
      const state = store.getState();
      return {
        schema: 'toonlab.vfxgen',
        version: 1,
        preset: state.presetId,
        seed: state.seed,
        settings: state.overrides,
      };
    },
    getCodeSnippet() {
      const state = store.getState();
      const settings = Object.keys(state.overrides).length > 0
        ? `\n  settings: ${JSON.stringify(state.overrides, null, 2).replace(/\n/g, '\n  ')},`
        : '';
      return `import { createVfxSystem } from '@call-me-sensei/toonlab/vfxgen';

const vfx = createVfxSystem({
  seed: ${state.seed},
  preset: '${state.presetId}',${settings}
  heightAt: world?.collision?.groundHeight, // optional: fireball ground hits
});
scene.add(vfx.root);
// per frame: vfx.update(delta, camera);
// events:    vfx.spawn('slash' | 'impact' | 'fireball' | 'footstep' | 'landing', { … });`;
    },
  };

  return {
    actions,
    effectiveSettings,
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe,
  };
}
