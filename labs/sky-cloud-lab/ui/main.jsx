import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { App } from './App.jsx';
import { createSkyCloudLabEngine } from './engine.js';
import { createSkyCloudLabStore } from './store.js';

if (!window.__skyCloudLabBooted) {
  window.__skyCloudLabBooted = true;
  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab') || document.body.dataset.initialTab || 'preview';
  const store = createSkyCloudLabStore({ initialTab });
  const previewHour = Number(params.get('hour'));
  const previewWeather = params.get('weather');
  if (Number.isFinite(previewHour) || previewWeather) {
    store.actions.setView({
      ...(Number.isFinite(previewHour) ? { hour: previewHour } : {}),
      ...(previewWeather ? { weather: previewWeather } : {}),
    });
  }
  const worker = new Worker(
    new URL('../worker/cloudGenerator.worker.js', import.meta.url),
    { type: 'module' },
  );
  let requestId = 0;
  let activeRequest = 0;
  store.actions.generate = (resolution = 512) => {
    activeRequest = ++requestId;
    store.actions.markGenerating();
    worker.postMessage({
      id: activeRequest,
      resolution,
      source: store.getState().documents.cloudSource,
    });
  };
  worker.addEventListener('message', (event) => {
    if (event.data?.id !== activeRequest) return;
    if (event.data.error) store.actions.rejectGeneration(event.data.error);
    else store.actions.receiveGeneration(event.data.maps);
  });
  worker.addEventListener('error', (event) => {
    store.actions.rejectGeneration(event.message || 'Cloud generation worker failed.');
  });

  const engine = createSkyCloudLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__skyCloudLab = { engine, store, worker };
  // Preserve the automation/debug handles of both historical routes.
  window.__skyLab = window.__skyCloudLab;
  window.__cloudShaderLab = window.__skyCloudLab;

  addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement;
    if (typing || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if (event.shiftKey) store.actions.redo();
    else store.actions.undo();
  });
  addEventListener('beforeunload', () => {
    worker.terminate();
    engine.dispose();
  }, { once: true });

  createRoot(document.getElementById('app')).render(<App store={store} />);
  requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  engine.start().then(() => {
    if (initialTab === 'atmosphere') document.body.dataset.skyLabReady = 'true';
    if (initialTab === 'cloud-look') document.body.dataset.cloudShaderLabReady = 'true';
  }).catch((error) => {
    console.error('Sky & Cloud Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
    document.body.dataset.skyCloudLabReady = 'error';
    store.actions.adoptEngineState({ status: `Preview failed: ${error?.message ?? error}` });
  });
}
