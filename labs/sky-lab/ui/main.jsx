import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { createSkyLabEngine } from './engine.js';
import { createSkyLabStore } from './store.js';
import { App } from './App.jsx';

if (!window.__skyLabBooted) {
  window.__skyLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createSkyLabStore({ urlParams });
  const engine = createSkyLabEngine({ mount: document.getElementById('stage'), store });
  window.__skyLab = { engine, store };

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
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey
      && event.key.toLowerCase() === 'c') engine.resetCamera();
  });

  engine.start().catch((error) => {
    console.error('Sky Shader Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
    document.body.dataset.skyLabReady = 'error';
    const message = error?.message
      ?? error?.type
      ?? (typeof error === 'string' ? error : null)
      ?? 'Unknown startup failure';
    store.actions.adoptEngineState({
      engineReady: false,
      status: `Sky preview failed to load: ${message}`,
    });
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
