// Rock Lab entry. Boot order matters:
//   store -> engine -> tools -> dressing/sky -> React.
// ?hud=0 skips React entirely (deterministic scene captures); the engine
// and store still boot so every body-dataset capture gate works.
//
// URL params: ?rockProject= ?rockPreset= ?rockStyle= ?rockSeed= ?rockRes=
// ?rockType= ?rockGeometry=original|variation ?rockMaterial=source|toonlab|authored|neutral|legacy
// ?rockVariation=0..1 ?envDebug= ?rockMerge=0. `rockProject` is the
// local/Pro-hydrated portable document id; preset and style remain separate.
//             ?hud=0
//             ?captureView=hero|front|side|top
//             ?grass=<blades> is a legacy/capture override; UI defaults off.

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/ui/tokens.css';
import '../shared/ui/kit.css';
import './ui/app.css';

import { createRockStore } from './store/rockStore.js';
import { createRockEngine } from './engine/rockEngine.js';
import { installRockTools } from './engine/rockTools.js';
import { createRockDressing } from './engine/rockDressing.js';
import { createRockSky } from './engine/rockSky.js';
import { App } from './ui/App.jsx';
import { isWalkPreviewInputCode } from '../shared/walkPreview.js';

// Engine + store are singletons: HMR must never double-boot the scene.
if (!window.__rockLabBooted) {
  window.__rockLabBooted = true;

  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  if (hudHidden) document.body.dataset.hideHud = 'true';

  const store = createRockStore({ urlParams });
  const engine = createRockEngine({
    mount: document.getElementById('app'),
    store,
    urlParams,
  });
  installRockTools({ engine, store });
  const dressing = createRockDressing({ engine, store });
  createRockSky({
    deterministic: engine.deterministic, engine, grass: dressing.grass, store,
  });

  // Keyboard map (single-key shortcuts suppressed while typing).
  const TOOL_KEYS = {
    a: 'adjacentTile', b: 'sculptAdd', d: 'doodle', e: 'sculptSubtract', v: 'orbit',
  };
  const STAGE_KEYS = {
    1: 'shape', 2: 'detail', 3: 'pieces', 4: 'look', 5: 'export',
  };
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (typing) return;
      event.preventDefault();
      if (event.shiftKey) store.actions.redo();
      else store.actions.undo();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    // Walk preview owns movement keys; single-key tool/stage shortcuts pause.
    if (store.getState().walkPreview && isWalkPreviewInputCode(event.code)) return;
    const key = event.key.toLowerCase();
    if (TOOL_KEYS[key]) store.actions.setTool(TOOL_KEYS[key]);
    else if (STAGE_KEYS[key]) {
      const stage = STAGE_KEYS[key];
      store.actions.setStage(stage);
      store.actions.setView({ drawer: false });
      if (stage === 'pieces') store.actions.setTool('adjacentTile');
    } else if (key === '`') store.actions.setView({ drawer: !store.getState().view.drawer });
    else if (key === 'escape') store.actions.setTool('orbit');
    else if (key === 'r') store.actions.randomizeSeed();
    else if (key === '[') {
      const { radius } = store.getState().brush;
      store.actions.setBrush({ radius: Math.max(0.05, radius - 0.02) });
    } else if (key === ']') {
      const { radius } = store.getState().brush;
      store.actions.setBrush({ radius: Math.min(0.8, radius + 0.02) });
    }
  });

  // Hold Space: temporary Move — orbit mid-tool, release to get it back.
  let spaceHeldTool = null;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || store.getState().walkPreview) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLButtonElement) return;
    const { tool } = store.getState();
    if (tool !== 'orbit') {
      spaceHeldTool = tool;
      store.actions.setTool('orbit');
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || !spaceHeldTool) return;
    store.actions.setTool(spaceHeldTool);
    spaceHeldTool = null;
  });

  engine.start().catch((error) => {
    console.error('Rock Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (!hudHidden) {
    const uiRoot = document.createElement('div');
    uiRoot.id = 'rock-ui';
    document.body.appendChild(uiRoot);
    createRoot(uiRoot).render(createElement(App, { engine, store }));
    requestAnimationFrame(() => {
      document.body.dataset.uiReady = 'true';
    });
  }
}
