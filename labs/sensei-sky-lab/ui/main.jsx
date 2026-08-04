import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { createSenseiSkyLabEngine } from './engine.js';
import { createSenseiSkyLabStore } from './store.js';
import { App } from './App.jsx';

if (!window.__senseiSkyLabBooted) {
  window.__senseiSkyLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createSenseiSkyLabStore({ urlParams });
  const engine = createSenseiSkyLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__senseiSkyLab = { engine, store };

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey
      && event.key.toLowerCase() === 'c') engine.resetCamera();
  });

  engine.start().catch((error) => {
    console.error('Sensei Sky Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
    document.body.dataset.senseiSkyLabReady = 'error';
    const message = error?.message
      ?? error?.type
      ?? (typeof error === 'string' ? error : null)
      ?? 'Unknown startup failure';
    store.actions.adoptEngineState({
      engineReady: false,
      status: `Sensei sky preview failed to load: ${message}`,
    });
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
