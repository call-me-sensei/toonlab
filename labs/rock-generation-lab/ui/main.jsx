import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { isLabEditorLocation, stampLabHomeDocument } from '../../shared/labViewRouting.js';
import { App } from './App.jsx';
import { createRockGenerationEngine } from './engine.js';
import { createRockGenerationStore } from './store.js';

if (!window.__rockGenerationLabBooted) {
  window.__rockGenerationLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const store = createRockGenerationStore({ urlParams });
  const editor = isLabEditorLocation({ directParams: ['rockPreset', 'rockSeed', 'rockRes'] });
  store.actions.setHomeOpen(!editor);
  stampLabHomeDocument(!editor);
  const engine = editor
    ? await createRockGenerationEngine({
      mount: document.getElementById('stage'),
      store,
    })
    : null;
  window.__rockGenerationLab = { engine, store };

  window.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
      event.preventDefault();
      if (event.shiftKey) store.actions.redo();
      else store.actions.undo();
    } else if (engine && !typing && event.key.toLowerCase() === 'c') {
      engine.resetCamera();
    }
  });

  engine?.start();
  if (urlParams.get('hud') === '0') {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
