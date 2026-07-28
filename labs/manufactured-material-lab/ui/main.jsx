import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import '../../grass-lab/ui/app.css';
import './app.css';

import { App } from './App.jsx';

if (!window.__manufacturedMaterialLabBooted) {
  window.__manufacturedMaterialLabBooted = true;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('renderer')) {
    params.set('renderer', 'webgl');
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  }

  createRoot(document.getElementById('app')).render(<App />);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await import('../../../examples/urban-prop-shader/main.js');

  const markReady = () => {
    document.body.dataset.uiReady = 'true';
  };
  if (window.__manufacturedMaterialLab) markReady();
  else window.addEventListener('toonlab:manufactured-material-ready', markReady, { once: true });
}

