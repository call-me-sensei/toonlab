import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { installRendererSwitcher } from '../../shared/rendererSwitcher.js';
import { createVfxLabEngine } from '../engine/vfxLabEngine.js';
import { createVfxLabStore } from '../store/vfxStore.js';
import { App } from './App.jsx';

if (!window.__vfxLabBooted) {
  window.__vfxLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createVfxLabStore({ urlParams });
  const engine = createVfxLabEngine({ mount: document.getElementById('stage'), store });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    const triggers = {
      1: 'slash', 2: 'overhead', 3: 'thrust', 4: 'spin', 5: 'plunge',
      6: 'fireball', 7: 'footstep', 8: 'landing',
    };
    if (triggers[event.key]) engine.trigger(triggers[event.key]);
    else if (event.key.toLowerCase() === 'l') store.actions.setLoop(!store.getState().loop);
    else if (event.key.toLowerCase() === 'r') store.actions.randomizeSeed();
  });

  engine.start().catch((error) => {
    console.error('VFX Lab failed to start:', error);
    document.body.dataset.vfxLabReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    installRendererSwitcher();
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
