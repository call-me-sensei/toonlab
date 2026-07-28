import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { App } from './App.jsx';
import { createCloudShaderLabEngine } from './engine.js';
import { createCloudShaderLabStore } from './store.js';

if (!window.__cloudShaderLabBooted) {
  window.__cloudShaderLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createCloudShaderLabStore({ urlParams });
  const engine = createCloudShaderLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__cloudShaderLab = { engine, store };

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
      && event.key.toLowerCase() === 'c') {
      engine.resetCamera();
    }
  });

  engine.start().catch((error) => {
    console.error('Cloud Shader Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
    document.body.dataset.cloudShaderLabReady = 'error';
    const message = error?.message
      ?? error?.type
      ?? (typeof error === 'string' ? error : null)
      ?? 'Unknown startup failure';
    store.actions.adoptEngineState({
      engineReady: false,
      status: `Cloud preview failed to load: ${message}`,
    });
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(
      <App engine={engine} store={store} />,
    );
    requestAnimationFrame(() => {
      document.body.dataset.uiReady = 'true';
    });
  }
}
