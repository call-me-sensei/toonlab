// window.__treeDesigner — the Playwright/test contract, now backed by the
// store + engine. Semantics preserved from the legacy designer:
// setRecipe rebuilds SYNCHRONOUSLY (tests call geometryHash immediately
// after), and every hook works with ?hud=0 (no React mounted).

import { BUILT_IN_TREE_PRESETS } from '../treePresetStore.js';

export function installTestHooks({ engine, store }) {
  window.__treeDesigner = {
    getBuiltInPresetIds: () => BUILT_IN_TREE_PRESETS.map((preset) => preset.id),
    getRecipe: () => store.actions.getRecipeDocument(),
    getSettings: () => JSON.parse(JSON.stringify(store.getState().settings)),
    setRecipe: (recipe) => store.actions.setRecipe(recipe),
    rebuild: engine.rebuild,
    geometryHash: engine.geometryHash,
    getPlant: engine.getPlant,
    // World point → CSS pixel coordinates (stroke tests aim at the real
    // on-screen trunk instead of guessing pixels).
    projectToScreen: engine.projectToScreen,
    // Store access for redesign-era tests (P2+ UI drives through this).
    getState: store.getState,
    actions: store.actions,
  };
}
