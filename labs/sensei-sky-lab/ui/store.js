// Sensei Sky Lab store. The lab is a review scene: the authored document is
// labs/sensei-sky-lab/params.js (committed source), so the store only owns
// preview state — scenario, time, comparison mode, and stage toggles.

import { createStore } from '../../shared/ui/createStore.js';

const DEFAULT_VIEW = Object.freeze({
  autoCycle: false,
  compare: 'sensei',
  drift: true,
  ground: true,
  hour: 13,
});

const COMPARE_MODES = ['sensei', 'split', 'reference'];

function normalizeHour(value, fallback = DEFAULT_VIEW.hour) {
  const number = Number(value);
  const base = Number.isFinite(number) ? number : fallback;
  return ((base % 24) + 24) % 24;
}

function normalizeView(input = {}) {
  return {
    ...DEFAULT_VIEW,
    ...(input && typeof input === 'object' ? input : {}),
    autoCycle: input?.autoCycle === true,
    compare: COMPARE_MODES.includes(input?.compare)
      ? input.compare
      : DEFAULT_VIEW.compare,
    drift: input?.drift !== false,
    ground: input?.ground !== false,
    hour: normalizeHour(input?.hour),
  };
}

export function createSenseiSkyLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const store = createStore({
    contractMeta: null,
    engineReady: false,
    referenceAvailable: null,
    scenarioId: urlParams.get('scenario') || 'clear_day',
    scenarios: [],
    status: '',
    view: normalizeView({
      compare: urlParams.get('compare') ?? undefined,
      // URLSearchParams returns null when absent, and Number(null) is 0 —
      // keep the absent case on the daytime default instead of midnight.
      hour: urlParams.get('hour') ?? undefined,
    }),
  });

  const state = () => store.getState();

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    setPreviewAutoCycle(autoCycle) {
      store.setState({ view: normalizeView({ ...state().view, autoCycle }) });
    },

    setPreviewHour(hour) {
      store.setState({ view: normalizeView({ ...state().view, hour }) });
    },

    setScenario(scenarioId) {
      const scenario = state().scenarios.find((entry) => entry.id === scenarioId);
      store.setState({
        scenarioId,
        // Follow the scenario's authored hour so its celestial state (sun /
        // moon / stars) matches the baked palette row by default.
        ...(scenario
          ? { view: normalizeView({ ...state().view, hour: scenario.hour }) }
          : {}),
      });
    },

    setView(patch) {
      store.setState({ view: normalizeView({ ...state().view, ...patch }) });
    },
  };

  return store;
}
