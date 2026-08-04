import '../shared/siteHeader.js';

const grid = document.getElementById('libraryGrid');
const empty = document.getElementById('libraryEmpty');
const search = document.getElementById('librarySearch');
const status = document.getElementById('libraryStatus');
const indexSection = document.getElementById('libraryIndex');
const detailSection = document.getElementById('libraryDetail');
const detailForm = document.getElementById('detailForm');
const detailStatus = document.getElementById('detailStatus');
let entries = [];
let activeEntry = null;

const MODEL_KINDS = new Set([
  'generated-model',
  'image_to_model',
  'model_segment',
  'multiview_to_model',
  'text_to_model',
]);

const TYPE_INFO = Object.freeze({
  'toon-preset': { icon: '🎨', label: 'Toon preset', href: '/shader-lab/' },
  'tree-recipe': { icon: '🌳', label: 'Tree recipe', href: '/tree-lab/' },
  'rock-project': { icon: '🪨', label: 'Rock project', href: '/rock-lab/' },
  'rockLab-project': { icon: '🪨', label: 'Rock project', href: '/rock-lab/' },
  'debris-project': { icon: '🪵', label: 'Debris project', href: '/debris-lab/' },
  'grass-preset': { icon: '🌿', label: 'Grass preset', href: '/grass-lab/' },
  'water-preset': { icon: '🌊', label: 'Water preset', href: '/water-lab/' },
  'sky-preset': { icon: '🌤️', label: 'Sky preset', href: '/sky-lab/' },
  'weather-preset': { icon: '🌦️', label: 'Weather preset', href: '/weather-lab/' },
  'world-preset': { icon: '🗺️', label: 'World preset', href: '/playground/' },
  'prop-asset': { icon: '📦', label: 'Prop asset', href: '/asset/' },
  'environment-preset': { icon: '🏯', label: 'Environment preset', href: '/environment-lab/' },
  'vegetation-shader-preset': { icon: '🌿', label: 'Vegetation shader', href: '/vegetation-shader-lab/' },
  'style-bundle': { icon: '🧩', label: 'Style bundle', href: '/styles/' },
  'toonlab/toon-preset': { icon: '🎨', label: 'Toon preset', href: '/shader-lab/' },
  'toonlab/rockgen-project': { icon: '🪨', label: 'Rock project', href: '/rock-lab/' },
  'toonlab/grass-preset': { icon: '🌿', label: 'Grass preset', href: '/grass-lab/' },
  'toonlab/water-preset': { icon: '🌊', label: 'Water preset', href: '/water-lab/' },
  'toonlab/sky-preset': { icon: '🌤️', label: 'Sky preset', href: '/sky-lab/' },
  'toonlab/weather-preset': { icon: '🌦️', label: 'Weather preset', href: '/weather-lab/' },
  'toonlab/environment-preset': { icon: '🏯', label: 'Environment preset', href: '/environment-lab/' },
  'toonlab/vegetation-shader-preset': { icon: '🌿', label: 'Vegetation shader', href: '/vegetation-shader-lab/' },
  'toonlab/tree-shader-preset': { icon: '🌳', label: 'Tree shader', href: '/tree-shader-lab/' },
  'toonlab/grass-shader-preset': { icon: '🌿', label: 'Grass shader', href: '/grass-shader-lab/' },
  'toonlab/flower-shader-preset': { icon: '🌸', label: 'Flower shader', href: '/flower-shader-lab/' },
  'toonlab/rock-shader-preset': { icon: '🪨', label: 'Rock shader', href: '/rock-shader-lab/' },
  'toonlab/ground-shader-preset': { icon: '⛰️', label: 'Ground shader', href: '/ground-shader-lab/' },
  'toonlab/cloud-shader-preset': { icon: '☁️', label: 'Cloud shader', href: '/cloud-shader-lab/' },
});

function rawDocument(entry) {
  return entry?.document && entry?._local?.source === 'lab-state'
    ? entry.document
    : entry;
}

function infoFor(entry) {
  const payload = rawDocument(entry);
  for (const candidate of [entry.type, payload?.schema, payload?.type]) {
    if (TYPE_INFO[candidate]) return TYPE_INFO[candidate];
  }
  if (payload?.schema === 'treeRecipe') {
    return payload.type === 'flower'
      ? { icon: '🌸', label: 'Flower recipe', href: '/flower-lab/' }
      : { icon: '🌳', label: 'Tree recipe', href: '/tree-lab/' };
  }
  if (MODEL_KINDS.has(entry.type) || MODEL_KINDS.has(entry.kind)) {
    return { icon: '📦', label: 'Generated model', href: null };
  }
  return {
    icon: '🎨',
    label: String(entry.type ?? entry.kind ?? 'Creation').replaceAll('-', ' '),
    href: null,
  };
}

function resultFile(entry) {
  return entry?.result?.file ?? entry?.file ?? null;
}

function resultPreview(entry) {
  return entry?.result?.previewFile?.url
    ?? (MODEL_KINDS.has(entry?.type) || MODEL_KINDS.has(entry?.kind)
      ? null
      : resultFile(entry)?.url);
}

function assetHref(entry) {
  const url = resultFile(entry)?.url;
  if (!url) return null;
  if (MODEL_KINDS.has(entry?.type) || MODEL_KINDS.has(entry?.kind)) {
    return `/asset/?url=${encodeURIComponent(url)}&kind=model&style=call_me_sensei&hud=0&backdrop=studio`;
  }
  return url;
}

function downloadDocument(entry) {
  const payload = rawDocument(entry);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${String(entry.label ?? entry.name ?? entry.id).replace(/[^a-z0-9._-]+/gi, '-')}.toonlab.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function card(entry) {
  const link = document.createElement('a');
  link.className = 'gal-card lib-card-link';
  link.href = `/library/?id=${encodeURIComponent(entry.id)}`;
  link.title = entry.label ?? entry.name ?? entry.id;
  const media = document.createElement('div');
  const preview = resultPreview(entry);
  media.className = `gal-card-media${preview ? '' : ' gal-card-media--empty'}`;
  if (preview) {
    media.style.backgroundImage = `url("${String(preview).replaceAll('"', '%22')}")`;
  } else {
    media.textContent = infoFor(entry).icon;
  }
  const overlay = document.createElement('div');
  overlay.className = 'gal-card-overlay';
  const title = document.createElement('div');
  title.className = 'gal-card-title';
  title.textContent = entry.label ?? entry.name ?? entry.id;
  const meta = document.createElement('div');
  meta.className = 'gal-card-meta';
  const badge = document.createElement('span');
  badge.className = 'gal-badge';
  badge.textContent = infoFor(entry).label;
  meta.append(badge);
  if (entry.aiGenerated) {
    const ai = document.createElement('span');
    ai.className = 'gal-badge gal-badge--ai';
    ai.textContent = 'AI';
    meta.append(ai);
  }
  overlay.append(title, meta);
  link.append(media, overlay);
  return link;
}

function renderIndex() {
  const query = search.value.trim().toLowerCase();
  const filtered = entries.filter((entry) =>
    JSON.stringify([entry.label, entry.name, entry.description, entry.type, entry.kind, entry.tags])
      .toLowerCase().includes(query));
  grid.replaceChildren(...filtered.map(card));
  status.textContent = `${filtered.length} local ${filtered.length === 1 ? 'creation' : 'creations'}`;
  empty.hidden = filtered.length > 0;
}

function actionLink(label, href, primary = false) {
  const link = document.createElement('a');
  link.className = `tl-btn${primary ? ' tl-btn--primary' : ''}`;
  link.href = href;
  link.textContent = label;
  return link;
}

function showDetail(entry) {
  activeEntry = entry;
  indexSection.hidden = true;
  detailSection.hidden = false;
  const info = infoFor(entry);
  const preview = resultPreview(entry);
  const previewElement = document.getElementById('detailPreview');
  previewElement.textContent = preview ? '' : info.icon;
  previewElement.style.backgroundImage = preview ? `url("${String(preview).replaceAll('"', '%22')}")` : '';
  document.getElementById('detailType').textContent = info.label;
  document.getElementById('detailTitle').textContent = entry.label ?? entry.name ?? entry.id;
  detailForm.elements.label.value = entry.label ?? entry.name ?? entry.id;
  detailForm.elements.description.value = entry.description ?? '';
  document.getElementById('detailJson').textContent = JSON.stringify(rawDocument(entry), null, 2);
  const actions = document.getElementById('detailActions');
  const openHref = entry.type === 'style-bundle'
    ? `/styles/?bundle=${encodeURIComponent(entry.id)}`
    : assetHref(entry) ?? info.href;
  const buttons = [];
  if (openHref) buttons.push(actionLink(entry.type === 'style-bundle' ? 'Edit bundle' : 'Open', openHref, true));
  const download = document.createElement('button');
  download.className = 'tl-btn';
  download.type = 'button';
  download.textContent = 'Download JSON';
  download.addEventListener('click', () => downloadDocument(entry));
  buttons.push(download);
  actions.replaceChildren(...buttons);
}

async function saveDetail(event) {
  event.preventDefault();
  if (!activeEntry) return;
  const next = {
    ...activeEntry,
    label: detailForm.elements.label.value.trim(),
    description: detailForm.elements.description.value.trim(),
  };
  detailStatus.textContent = 'Saving…';
  const response = await fetch(`/api/toonlab/library/${encodeURIComponent(next.id)}`, {
    body: JSON.stringify(next),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });
  if (!response.ok) {
    detailStatus.textContent = 'Save failed.';
    return;
  }
  const payload = await response.json();
  activeEntry = payload.entry ?? next;
  entries = entries.map((entry) => entry.id === next.id ? activeEntry : entry);
  document.getElementById('detailTitle').textContent = activeEntry.label;
  detailStatus.textContent = 'Saved';
}

async function deleteDetail() {
  if (!activeEntry || !confirm(`Delete “${activeEntry.label}” from the local Library?`)) return;
  const response = await fetch(`/api/toonlab/library/${encodeURIComponent(activeEntry.id)}`, { method: 'DELETE' });
  if (!response.ok) {
    detailStatus.textContent = 'Delete failed.';
    return;
  }
  window.location.assign('/library/');
}

async function load() {
  const response = await fetch('/api/toonlab/library');
  if (!response.ok) throw new Error(`Library unavailable: HTTP ${response.status}`);
  entries = (await response.json()).entries ?? [];
  const requestedId = new URLSearchParams(window.location.search).get('id');
  if (requestedId) {
    const entry = entries.find((candidate) => candidate.id === requestedId);
    if (!entry) throw new Error('That local creation no longer exists.');
    showDetail(entry);
    return;
  }
  renderIndex();
}

search.addEventListener('input', renderIndex);
detailForm.addEventListener('submit', saveDetail);
document.getElementById('deleteEntry').addEventListener('click', deleteDetail);
load().catch((error) => {
  status.textContent = error.message;
  empty.hidden = false;
  if (!indexSection.hidden) return;
  detailStatus.textContent = error.message;
});
