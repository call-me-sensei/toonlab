import {
  bindCharacterModelControl,
  bindSceneHubControl,
} from './sceneHub.js';
import {
  bindModelErrorBanner,
  bindModelUrlControl,
  bindResetLabControl,
  persistLabParam,
  persistLabScene,
  restorePersistedParams,
} from './labParams.js';
import { initializeHudTabs } from './hudTabs.js';
import { resolveRendererKind } from './rendererKind.js';
import { installRendererSwitcher } from './rendererSwitcher.js';

// Merge persisted lab state into the URL (explicit params win) BEFORE any lab
// module reads location.search.
restorePersistedParams();

const params = new URLSearchParams(window.location.search);
const controllerMode = (params.get('controller') || '').toLowerCase();
const pathname = window.location.pathname.toLowerCase();
const isPlaygroundPath = pathname.startsWith('/playground');
const isRockLabPath = pathname.startsWith('/rock-lab');

// `?renderer=` flag (TSL migration): stamp the requested kind before any lab
// module loads. labs/shared/rendererFactory.js creates the matching renderer
// and reports the actual backend as dataset.rendererBackend after init.
document.body.dataset.rendererKind = resolveRendererKind();
installRendererSwitcher();

bindSceneHubControl({ onSelect: persistLabScene });
bindCharacterModelControl({ onSelect: (model) => persistLabParam('model', model) });
bindModelUrlControl();
bindModelErrorBanner();
bindResetLabControl();

// Loader parse failures (bad magic, corrupt file, HTML served for a missing
// path) can throw inside three.js loader callbacks, escaping the labs'
// promise chains. While the model is still loading, treat any uncaught error
// as a failed load so the HUD banner surfaces it instead of a silent scene.
function markModelLoadFailed() {
  if (document.body.dataset.modelReady === 'false') {
    document.body.dataset.modelReady = 'error';
  }
}
window.addEventListener('error', markModelLoadFailed);
window.addEventListener('unhandledrejection', markModelLoadFailed);

if (isRockLabPath || (params.get('scene') || '').toLowerCase() === 'rock') {
  import('../rock-lab/main.js');
} else if (isPlaygroundPath || controllerMode === 'ecctrl') {
  // The Shader Lab initializes its own tabs in main.js; the playground's
  // identical tab strip is wired here.
  initializeHudTabs(params.get('hudTab') || 'character');
  import('../playground/ecctrlMain.jsx');
} else {
  // /shader-lab/ (the Shader Lab page; the root path is the Labs home and
  // does not load this bootstrap).
  import('../shader-lab/main.js');
}
