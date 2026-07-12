import { buildLocalCharacterModelOptions } from './localModelCatalog.js';

export const SCENE_HUB_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'character',
    label: 'Character Lab',
    search: '',
  }),
  // Walkable indoor environment scene with the schema-driven environment
  // settings HUD. Renders the first environment discovered in the gitignored
  // assets-local/environments/ drop-in (bring your own scene — see
  // docs/environment.md); without one it surfaces a load banner. (The Shader
  // Lab's static environment view is still reachable directly via /?env=1.)
  Object.freeze({
    id: 'environmentLab',
    label: 'Environment Lab (Indoor)',
    path: '/playground/',
    search: '?scene=indoor',
  }),
  Object.freeze({
    id: 'controller',
    label: 'Controller Test',
    path: '/playground/',
    search: '',
  }),
  // One hub entry for every water scene — the Water Lab HUD's Mode select
  // switches calm/river/ocean (and the rest) in place.
  Object.freeze({
    id: 'waterLab',
    label: 'Water Lab',
    path: '/playground/',
    search: '?scene=water',
  }),
  Object.freeze({
    id: 'rockLab',
    label: 'Rock Lab',
    path: '/rock-lab/',
    search: '',
  }),
  // Standalone pages (own vite entries), not hub-routed scenes: `path` sends
  // the hub select there, and resolveSceneHubId recognizes them by pathname.
  Object.freeze({
    id: 'treeLab',
    label: 'Tree Lab',
    path: '/tree-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'debrisLab',
    label: 'Debris Lab',
    path: '/debris-lab/',
    search: '',
  }),
]);

const SCENE_HUB_OPTION_BY_ID = new Map(SCENE_HUB_OPTIONS.map((option) => [option.id, option]));
const SCENE_HUB_ALIASES = new Map([
  ['treeDesigner', 'treeLab'],
  // Former per-preset water entries, collapsed into the single Water Lab.
  ['calmLake', 'waterLab'],
  ['riverCrossing', 'waterLab'],
  ['oceanBeach', 'waterLab'],
  // Former indoor entry ids.
  ['liyue', 'environmentLab'],
  ['liyueWalk', 'environmentLab'],
  ['environmentWalk', 'environmentLab'],
]);

function normalizeSceneHubId(id) {
  return SCENE_HUB_ALIASES.get(id) || id;
}

// Characters offered by the HUD "Model" select: the bundled CC0 mannequin
// plus every model discovered in the gitignored assets-local/models/ drop-in
// folder (npm run assets:local — see labs/shared/localModelCatalog.js). Any
// other ?model= URL still works and shows up as a "Custom" entry.
export const CHARACTER_MODEL_OPTIONS = Object.freeze([
  // swimVisualLift: extra visual height while swimming, applied to the model
  // group only — physics floats identically for every model (the swim
  // backend is tuned as a package around one capsule depth; giving a model a
  // different PHYSICS float re-exposed snap bugs that tuning had fixed). The
  // compact mannequin needs the lift to read as surface freestyle; taller
  // models generally do not.
  Object.freeze({ label: 'Mannequin', model: '/characters/mannequin.glb', swimVisualLift: 0.18 }),
  ...buildLocalCharacterModelOptions().map((option) => Object.freeze({
    label: option.label,
    model: `/${option.modelUrl}`,
  })),
]);

export function resolveSceneHubId(params = new URLSearchParams(window.location.search)) {
  const pathname = window.location.pathname.toLowerCase();
  if (pathname.startsWith('/tree-lab') || pathname.startsWith('/tree-designer')) return 'treeLab';
  if (pathname.startsWith('/debris-lab')) return 'debrisLab';
  const onPlaygroundPath = pathname.startsWith('/playground');
  const onRockLabPath = pathname.startsWith('/rock-lab');
  const controller = (params.get('controller') || '').toLowerCase();
  const scene = (params.get('scene') || '').toLowerCase();

  if (onRockLabPath || scene === 'rock') return 'rockLab';
  if ((onPlaygroundPath || controller === 'ecctrl') && scene === 'water') return 'waterLab';
  if ((onPlaygroundPath || controller === 'ecctrl') && (scene === 'liyue' || scene === 'indoor')) return 'environmentLab';
  if (onPlaygroundPath || controller === 'ecctrl') return 'controller';
  if (params.has('env') || params.has('environment')) return 'environmentLab';
  return 'character';
}

export function sceneHubUrl(id, locationValue = window.location) {
  const option = SCENE_HUB_OPTION_BY_ID.get(normalizeSceneHubId(id)) || SCENE_HUB_OPTION_BY_ID.get('character');
  // Hub scenes live on the root page; `path` entries are standalone pages.
  // Never reuse locationValue.pathname — a select on a standalone page must
  // still send hub scenes back to the root page.
  return `${locationValue.origin}${option.path ?? '/'}${option.search}`;
}

export function navigateSceneHub(id) {
  window.location.href = sceneHubUrl(id);
}

export function normalizeModelPath(url) {
  return String(url || '').replace(/^\/+/, '').split(/[?#]/)[0].toLowerCase();
}

export function navigateToCharacterModel(model) {
  const params = new URLSearchParams(window.location.search);
  params.delete('model');
  params.delete('mtl');
  params.set('model', model);
  window.location.search = params.toString();
}

export function bindCharacterModelControl({
  onSelect = () => {},
  output = document.getElementById('characterModelValue'),
  select = document.getElementById('characterModel'),
} = {}) {
  if (!select) return;

  const params = new URLSearchParams(window.location.search);
  // Every scene defaults to the bundled CC0 mannequin; persisted lab state
  // restores whatever model was last picked.
  const defaultModel = '/characters/mannequin.glb';
  const currentModel = params.getAll('model').find((url) => url && url.toLowerCase() !== 'none')
    || defaultModel;

  select.innerHTML = '';
  let matched = false;
  for (const option of CHARACTER_MODEL_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.model;
    el.textContent = option.label;
    if (normalizeModelPath(option.model) === normalizeModelPath(currentModel)) {
      el.selected = true;
      matched = true;
    }
    select.appendChild(el);
  }
  if (!matched) {
    const el = document.createElement('option');
    el.value = currentModel;
    el.textContent = `Custom: ${currentModel.slice(currentModel.lastIndexOf('/') + 1)}`;
    el.selected = true;
    select.appendChild(el);
  }
  if (output) output.textContent = select.selectedOptions[0]?.textContent || '';

  select.addEventListener('change', () => {
    onSelect(select.value);
    navigateToCharacterModel(select.value);
  });
}

export function bindSceneHubControl({
  onSelect = () => {},
  output = document.getElementById('sceneHubValue'),
  select = document.getElementById('sceneHub'),
} = {}) {
  if (!select) return;

  // Build the options from SCENE_HUB_OPTIONS — static markup drifts.
  select.innerHTML = '';
  for (const option of SCENE_HUB_OPTIONS) {
    const optionEl = document.createElement('option');
    optionEl.value = option.id;
    optionEl.textContent = option.label;
    select.appendChild(optionEl);
  }

  const currentId = resolveSceneHubId();
  select.value = currentId;
  if (output) {
    output.textContent = SCENE_HUB_OPTION_BY_ID.get(currentId)?.label || 'Character Lab';
  }

  select.addEventListener('change', () => {
    onSelect(select.value);
    navigateSceneHub(select.value);
  });
}
