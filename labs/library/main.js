import '../shared/siteHeader.js';
import { normalizeCreationTags } from '../../database/creation-tags.mjs';

const grid = document.getElementById('libraryGrid');
const empty = document.getElementById('libraryEmpty');
const emptyTitle = document.getElementById('libraryEmptyTitle');
const emptyHint = document.getElementById('libraryEmptyHint');
const search = document.getElementById('librarySearch');
const typeFilter = document.getElementById('libraryType');
const tagFilter = document.getElementById('libraryTag');
const clearFilters = document.getElementById('clearFilters');
const status = document.getElementById('libraryStatus');
const pager = document.getElementById('libraryPager');
const pagerStatus = document.getElementById('libraryPagerStatus');
const previousPage = document.getElementById('libraryPrev');
const nextPage = document.getElementById('libraryNext');
const indexSection = document.getElementById('libraryIndex');
const detailSection = document.getElementById('libraryDetail');
const detailForm = document.getElementById('detailForm');
const detailStatus = document.getElementById('detailStatus');
const editDetails = document.getElementById('editDetails');
const editModal = document.getElementById('editModal');
const closeEdit = document.getElementById('closeEdit');
const revisionList = document.getElementById('revisionList');
const revisionStatus = document.getElementById('revisionStatus');
const revisionModal = document.getElementById('revisionModal');
const revisionForm = document.getElementById('revisionForm');
const closeRevision = document.getElementById('closeRevision');
let entries = [];
let activeEntry = null;
let revisions = [];
let revisionTotal = 0;
let currentPage = 1;

const PAGE_SIZE = 36;
const REVISION_PAGE_SIZE = 25;

const MODEL_KINDS = new Set([
  'generated-model',
  'image_to_model',
  'model_segment',
  'multiview_to_model',
  'text_to_model',
]);

const TYPE_INFO = Object.freeze({
  'toon-preset': { icon: '🎨', label: 'Toon preset', href: '/shader-lab/', actionLabel: 'Open in Shader Lab' },
  'tree-recipe': { icon: '🌳', label: 'Tree', href: '/tree-lab/', actionLabel: 'Open in Tree Lab' },
  'rock-project': { icon: '🪨', label: 'Rock', href: '/rock-lab/', actionLabel: 'Open in Rock Lab' },
  'rockLab-project': { icon: '🪨', label: 'Rock', href: '/rock-lab/', actionLabel: 'Open in Rock Lab' },
  'debris-project': { icon: '🪵', label: 'Debris', href: '/debris-lab/', actionLabel: 'Open in Debris Lab' },
  'grass-preset': { icon: '🌿', label: 'Grass', href: '/grass-lab/', actionLabel: 'Open in Grass Lab' },
  'water-preset': { icon: '🌊', label: 'Water', href: '/water-lab/', actionLabel: 'Open in Water Lab' },
  'sky-preset': { icon: '🌤️', label: 'Sky', href: '/sky-lab/', actionLabel: 'Open in Sky Lab' },
  'weather-preset': { icon: '🌦️', label: 'Weather', href: '/weather-lab/', actionLabel: 'Open in Weather Lab' },
  'world-preset': { icon: '🗺️', label: 'World', href: '/playground/', actionLabel: 'Open Playground' },
  'prop-asset': { icon: '📦', label: 'Prop', href: null, actionLabel: null },
  'environment-preset': { icon: '🏯', label: 'Environment', href: '/environment-lab/', actionLabel: 'Open in Environment Lab' },
  'manufactured-surface-profile': { icon: '🎨', label: 'Manufactured surface', href: '/manufactured-material-lab/', actionLabel: 'Open in Manufactured Surface Lab' },
  'vegetation-shader-preset': { icon: '🌿', label: 'Vegetation shader', href: '/vegetation-shader-lab/', actionLabel: 'Open in Vegetation Shader Lab' },
  'rock-shader-preset': { icon: '🪨', label: 'Rock shader', href: '/rock-shader-lab/', actionLabel: 'Open in Rock Shader Lab' },
  'ground-shader-preset': { icon: '⛰️', label: 'Ground shader', href: '/ground-shader-lab/', actionLabel: 'Open in Ground Shader Lab' },
  'sky-params': { icon: '🌦️', label: 'Sky & cloud', href: '/sky-cloud-lab/', actionLabel: 'Open in Sky & Cloud Lab' },
  'texture-recipe': { icon: '🧱', label: 'Texture', href: '/texture-lab/', actionLabel: 'Open in Texture Lab' },
  'style-bundle': { icon: '🧩', label: 'Style bundle', href: '/styles/', actionLabel: 'Open style bundle' },
  'generated-image': { icon: '🖼️', label: 'Generated image', href: null, actionLabel: null },
  'toonlab/toon-preset': { icon: '🎨', label: 'Toon preset', href: '/shader-lab/', actionLabel: 'Open in Shader Lab' },
  'toonlab/rockgen-project': { icon: '🪨', label: 'Rock', href: '/rock-lab/', actionLabel: 'Open in Rock Lab' },
  'toonlab/grass-preset': { icon: '🌿', label: 'Grass', href: '/grass-lab/', actionLabel: 'Open in Grass Lab' },
  'toonlab/water-preset': { icon: '🌊', label: 'Water', href: '/water-lab/', actionLabel: 'Open in Water Lab' },
  'toonlab/sky-preset': { icon: '🌤️', label: 'Sky', href: '/sky-lab/', actionLabel: 'Open in Sky Lab' },
  'toonlab/weather-preset': { icon: '🌦️', label: 'Weather', href: '/weather-lab/', actionLabel: 'Open in Weather Lab' },
  'toonlab/environment-preset': { icon: '🏯', label: 'Environment', href: '/environment-lab/', actionLabel: 'Open in Environment Lab' },
  'toonlab/manufactured-surface-profile': { icon: '🎨', label: 'Manufactured surface', href: '/manufactured-material-lab/', actionLabel: 'Open in Manufactured Surface Lab' },
  'toonlab/vegetation-shader-preset': { icon: '🌿', label: 'Vegetation shader', href: '/vegetation-shader-lab/', actionLabel: 'Open in Vegetation Shader Lab' },
  'toonlab/tree-shader-preset': { icon: '🌳', label: 'Tree shader', href: '/tree-shader-lab/', actionLabel: 'Open in Tree Shader Lab' },
  'toonlab/grass-shader-preset': { icon: '🌿', label: 'Grass shader', href: '/grass-shader-lab/', actionLabel: 'Open in Grass Shader Lab' },
  'toonlab/flower-shader-preset': { icon: '🌸', label: 'Flower shader', href: '/flower-shader-lab/', actionLabel: 'Open in Flower Shader Lab' },
  'toonlab/rock-shader-preset': { icon: '🪨', label: 'Rock shader', href: '/rock-shader-lab/', actionLabel: 'Open in Rock Shader Lab' },
  'toonlab/ground-shader-preset': { icon: '⛰️', label: 'Ground shader', href: '/ground-shader-lab/', actionLabel: 'Open in Ground Shader Lab' },
  'toonlab/sky-params': { icon: '🌦️', label: 'Sky & cloud', href: '/sky-cloud-lab/', actionLabel: 'Open in Sky & Cloud Lab' },
  'toonlab/cloud-shader-preset': { icon: '☁️', label: 'Cloud shader', href: '/cloud-shader-lab/', actionLabel: 'Open in Cloud Shader Lab' },
  'toonlab/texture-recipe': { icon: '🧱', label: 'Texture', href: '/texture-lab/', actionLabel: 'Open in Texture Lab' },
  'toonlab/style-bundle': { icon: '🧩', label: 'Style bundle', href: '/styles/', actionLabel: 'Open style bundle' },
});

const CLUSTER_INFO = Object.freeze({
  assetlib: { icon: '📦', label: 'Imported asset', href: null, actionLabel: null },
  buildinggen: { icon: '🏯', label: 'Building', href: '/building-lab/', actionLabel: 'Open in Building Lab' },
  debrisgen: TYPE_INFO['debris-project'],
  lighting: { icon: '💡', label: 'Lighting', href: '/lighting-lab/', actionLabel: 'Open in Lighting Lab' },
  propgen: { icon: '📦', label: 'Prop', href: '/prop-lab/', actionLabel: 'Open in Prop Lab' },
  rockgen: TYPE_INFO['rock-project'],
  sky: TYPE_INFO['sky-preset'],
  toon: TYPE_INFO['toon-preset'],
  vegetation: TYPE_INFO['tree-recipe'],
  water: TYPE_INFO['water-preset'],
});

function rawDocument(entry) {
  if (entry?.document && typeof entry.document === 'object') return entry.document;
  const { _local, ...document } = entry ?? {};
  return document;
}

function infoFor(entry) {
  const payload = rawDocument(entry);
  if (entry?.type === 'tree-recipe' || payload?.schema === 'treeRecipe') {
    if (payload?.type === 'flower') {
      return { icon: '🌸', label: 'Flower', href: '/flower-lab/', actionLabel: 'Open in Flower Lab' };
    }
  }
  for (const candidate of [payload?.schema, payload?.type, entry?.type, entry?.kind]) {
    if (TYPE_INFO[candidate]) return TYPE_INFO[candidate];
  }
  if (CLUSTER_INFO[entry?.cluster]) return CLUSTER_INFO[entry.cluster];
  if (payload?.schema === 'treeRecipe') {
    return payload.type === 'flower'
      ? { icon: '🌸', label: 'Flower', href: '/flower-lab/', actionLabel: 'Open in Flower Lab' }
      : TYPE_INFO['tree-recipe'];
  }
  if (MODEL_KINDS.has(entry.type) || MODEL_KINDS.has(entry.kind)) {
    return { icon: '📦', label: 'Generated model', href: null, actionLabel: null };
  }
  return {
    icon: '🎨',
    label: String(entry.type ?? entry.kind ?? 'Creation').replaceAll('-', ' '),
    href: null,
    actionLabel: null,
  };
}

function resultFile(entry) {
  return entry?.result?.file
    ?? entry?.file
    ?? entry?.recipe?.download
    ?? entry?.download
    ?? null;
}

function isModelEntry(entry) {
  const file = resultFile(entry);
  const contentType = String(file?.contentType ?? file?.content_type ?? file?.mimeType ?? '');
  const url = String(file?.url ?? '');
  return MODEL_KINDS.has(entry?.type)
    || MODEL_KINDS.has(entry?.kind)
    || entry?.kind === 'imported-glb'
    || entry?.recipe?.kind === 'model'
    || contentType === 'model/gltf-binary'
    || contentType === 'model/gltf+json'
    || /\.(?:glb|gltf)(?:\?|$)/i.test(url);
}

function imageFileUrl(file) {
  const url = String(file?.url ?? '');
  const contentType = String(file?.contentType ?? file?.content_type ?? '');
  return contentType.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i.test(url)
    ? url
    : null;
}

function resultPreview(entry) {
  const candidate = entry?.result?.previewFile?.url
    || entry?.thumbnail_url
    || entry?.thumbnailUrl
    || entry?.thumbUrl
    || entry?.thumbnail
    || imageFileUrl(resultFile(entry));
  if (!candidate) return null;
  const url = String(candidate);
  if (/^(?:[a-z]+:|\/)/i.test(url)) return url;
  return `/labs/catalog/${url.replace(/^\.\//, '')}`;
}

function modelPreviewHref(entry) {
  const url = resultFile(entry)?.url;
  if (!url || !isModelEntry(entry)) return null;
  return `/asset-lab/?url=${encodeURIComponent(url)}&kind=model&style=call_me_sensei&hud=0&backdrop=studio`;
}

function assetHref(entry) {
  const url = resultFile(entry)?.url;
  if (!url) return null;
  if (isModelEntry(entry)) return modelPreviewHref(entry);
  return url;
}

function formatFor(entry) {
  if (isModelEntry(entry)) return '3D model';
  if (entry?.type === 'generated-image') return 'Image';
  if (entry?.type === 'style-bundle' || rawDocument(entry)?.schema === 'toonlab/style-bundle') {
    return 'Style bundle';
  }
  if (entry?.type === 'prop-asset') return 'Asset document';
  return 'ToonLab recipe';
}

function downloadDocument(entry) {
  const payload = rawDocument(entry);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${String(entry.label ?? entry.name ?? entry.id).replace(/[^a-z0-9._-]+/gi, '-')}.toonlab.json`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function formatUpdatedAt(entry) {
  const value = entry?._local?.updatedAt ?? entry?.updatedAt;
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function setTags(entry) {
  const tags = document.getElementById('detailTags');
  const values = Array.isArray(entry.tags) ? entry.tags : [];
  tags.hidden = values.length === 0;
  tags.replaceChildren(...values.map((tag) => {
    const badge = document.createElement('span');
    badge.className = 'gal-badge';
    badge.textContent = `#${tag}`;
    return badge;
  }));
}

function setEditModal(open) {
  editModal.hidden = !open;
  document.body.classList.toggle('lib-modal-open', open || !revisionModal.hidden);
  if (open) detailForm.elements.label.focus();
}

function setRevisionModal(revision = null) {
  revisionModal.hidden = !revision;
  document.body.classList.toggle('lib-modal-open', Boolean(revision) || !editModal.hidden);
  if (!revision) return;
  revisionForm.elements.revisionId.value = revision.id;
  revisionForm.elements.name.value = revision.name ?? '';
  revisionForm.elements.tags.value = (revision.versionTags ?? []).join(', ');
  revisionForm.elements.note.value = revision.note ?? '';
  revisionForm.elements.pinned.checked = revision.pinned === true;
  document.getElementById('revisionModalTitle').textContent = `Version ${revision.number}`;
  revisionForm.elements.name.focus();
}

async function downloadRevision(revision) {
  revisionStatus.textContent = `Preparing version ${revision.number}…`;
  const response = await fetch(
    `/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions/${encodeURIComponent(revision.id)}`,
  );
  if (!response.ok) {
    revisionStatus.textContent = 'Version download failed.';
    return;
  }
  const snapshot = (await response.json()).revision;
  const blob = new Blob([`${JSON.stringify(snapshot.document, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${String(activeEntry?.label ?? 'creation').replace(/[^a-z0-9._-]+/gi, '-')}-v${revision.number}.toonlab.json`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
  revisionStatus.textContent = `${revisionTotal} ${revisionTotal === 1 ? 'version' : 'versions'}`;
}

function renderRevisions() {
  revisionList.replaceChildren(...revisions.map((revision) => {
    const item = document.createElement('article');
    item.className = `lib-revision${revision.isCurrent ? ' lib-revision--current' : ''}`;
    const copy = document.createElement('div');
    copy.className = 'lib-revision-copy';
    const heading = document.createElement('div');
    heading.className = 'lib-revision-title';
    const title = document.createElement('strong');
    title.textContent = revision.name || `Version ${revision.number}`;
    const badges = document.createElement('span');
    badges.className = 'lib-revision-badges';
    badges.textContent = [
      `v${revision.number}`,
      revision.isCurrent ? 'Current' : null,
      revision.pinned ? 'Pinned' : null,
      revision.restoredFromRevisionId ? 'Restored' : null,
    ].filter(Boolean).join(' · ');
    heading.append(title, badges);
    const meta = document.createElement('p');
    const created = new Date(revision.createdAt);
    meta.textContent = `${Number.isNaN(created.getTime()) ? 'Unknown date' : created.toLocaleString()} · ${revision.saveSource}`;
    const tagRow = document.createElement('div');
    tagRow.className = 'lib-revision-tags';
    for (const tag of revision.versionTags ?? []) {
      const badge = document.createElement('span');
      badge.className = 'gal-badge';
      badge.textContent = `#${tag}`;
      tagRow.append(badge);
    }
    if (revision.note) {
      const note = document.createElement('p');
      note.className = 'lib-revision-note';
      note.textContent = revision.note;
      copy.append(heading, meta, tagRow, note);
    } else {
      copy.append(heading, meta, tagRow);
    }
    const actions = document.createElement('div');
    actions.className = 'lib-revision-actions';
    const edit = document.createElement('button');
    edit.className = 'tl-btn';
    edit.type = 'button';
    edit.textContent = 'Name & tag';
    edit.addEventListener('click', () => setRevisionModal(revision));
    const download = document.createElement('button');
    download.className = 'tl-btn';
    download.type = 'button';
    download.textContent = 'Download';
    download.addEventListener('click', () => downloadRevision(revision).catch((error) => {
      revisionStatus.textContent = error.message;
    }));
    actions.append(edit, download);
    if (!revision.isCurrent) {
      const restore = document.createElement('button');
      restore.className = 'tl-btn';
      restore.type = 'button';
      restore.textContent = 'Restore';
      restore.addEventListener('click', () => restoreRevision(revision));
      actions.append(restore);
    }
    item.append(copy, actions);
    return item;
  }));
  if (revisions.length < revisionTotal) {
    const more = document.createElement('button');
    more.className = 'tl-btn';
    more.type = 'button';
    more.textContent = `Load more versions (${revisionTotal - revisions.length} remaining)`;
    more.addEventListener('click', () => loadRevisions({ reset: false }).catch((error) => {
      revisionStatus.textContent = error.message;
    }));
    revisionList.append(more);
  }
}

async function loadRevisions({ reset = true } = {}) {
  if (!activeEntry?._local?.creationId) return;
  revisionStatus.textContent = 'Loading history…';
  const offset = reset ? 0 : revisions.length;
  const response = await fetch(
    `/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions?limit=${REVISION_PAGE_SIZE}&offset=${offset}`,
  );
  if (!response.ok) {
    revisionStatus.textContent = 'Version history unavailable.';
    return;
  }
  const payload = await response.json();
  const page = payload.revisions ?? [];
  revisions = reset ? page : [...revisions, ...page];
  revisionTotal = Number(payload.total ?? revisions.length);
  renderRevisions();
  revisionStatus.textContent = `Showing ${revisions.length} of ${revisionTotal} ${revisionTotal === 1 ? 'version' : 'versions'}`;
}

async function restoreRevision(revision) {
  if (!confirm(`Restore version ${revision.number}? Your current version will remain in history.`)) return;
  revisionStatus.textContent = 'Restoring…';
  const response = await fetch(
    `/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions/${encodeURIComponent(revision.id)}/restore`,
    { method: 'POST' },
  );
  if (!response.ok) {
    revisionStatus.textContent = (await response.json()).error ?? 'Restore failed.';
    return;
  }
  activeEntry = (await response.json()).entry;
  entries = entries.map((entry) => entry.id === activeEntry.id ? activeEntry : entry);
  renderDetail(activeEntry);
  await loadRevisions();
  revisionStatus.textContent = `Restored version ${revision.number} as a new version.`;
}

async function saveRevisionDetails(event) {
  event.preventDefault();
  const revisionId = revisionForm.elements.revisionId.value;
  revisionStatus.textContent = 'Saving version details…';
  const response = await fetch(
    `/api/toonlab/library/${encodeURIComponent(activeEntry._local.creationId)}/revisions/${encodeURIComponent(revisionId)}`,
    {
      body: JSON.stringify({
        name: revisionForm.elements.name.value,
        note: revisionForm.elements.note.value,
        pinned: revisionForm.elements.pinned.checked,
        tags: normalizeCreationTags(revisionForm.elements.tags.value.split(',')),
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    },
  );
  if (!response.ok) {
    revisionStatus.textContent = (await response.json()).error ?? 'Save failed.';
    return;
  }
  setRevisionModal(null);
  await loadRevisions();
  revisionStatus.textContent = 'Version details saved.';
}

function renderDetail(entry) {
  const info = infoFor(entry);
  const preview = resultPreview(entry);
  const livePreview = preview ? null : modelPreviewHref(entry);
  const previewElement = document.getElementById('detailPreview');
  previewElement.classList.toggle('lib-preview--empty', !preview && !livePreview);
  previewElement.classList.toggle('lib-preview--live', Boolean(livePreview));
  previewElement.setAttribute('role', livePreview ? 'group' : 'img');
  previewElement.style.backgroundImage = preview ? `url("${String(preview).replaceAll('"', '%22')}")` : '';
  previewElement.setAttribute('aria-label', `${entry.label ?? entry.name ?? entry.id} preview`);
  const mediaChildren = [];
  if (livePreview) {
    const frame = document.createElement('iframe');
    frame.className = 'lib-preview-frame';
    frame.src = livePreview;
    frame.title = `${entry.label ?? entry.name ?? entry.id} interactive 3D preview`;
    mediaChildren.push(frame);
  } else if (!preview) {
    const glyph = document.createElement('span');
    glyph.className = 'lib-preview-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = info.icon;
    mediaChildren.push(glyph);
  }
  const mediaLabel = document.createElement('span');
  mediaLabel.className = 'lib-preview-label';
  mediaLabel.textContent = livePreview ? 'Interactive 3D preview' : 'ToonLab library';
  mediaChildren.push(mediaLabel);
  previewElement.replaceChildren(...mediaChildren);
  document.getElementById('detailType').textContent = info.label;
  document.getElementById('detailTitle').textContent = entry.label ?? entry.name ?? entry.id;
  document.getElementById('detailDescription').textContent = entry.description || 'A ToonLab creation saved in this local workspace.';
  document.getElementById('detailUpdated').textContent = formatUpdatedAt(entry);
  document.getElementById('detailFormat').textContent = formatFor(entry);
  setTags(entry);
  detailForm.elements.label.value = entry.label ?? entry.name ?? entry.id;
  detailForm.elements.description.value = entry.description ?? '';
  detailForm.elements.tags.value = Array.isArray(entry.tags) ? entry.tags.join(', ') : '';
  document.getElementById('detailJson').textContent = JSON.stringify(rawDocument(entry), null, 2);
  const actions = document.getElementById('detailActions');
  const styleBundle = entry.type === 'style-bundle'
    || rawDocument(entry)?.schema === 'toonlab/style-bundle';
  const authoringHref = styleBundle
    ? `/styles/?bundle=${encodeURIComponent(entry.id)}`
    : info.href;
  const viewHref = assetHref(entry);
  const buttons = [];
  if (authoringHref) {
    buttons.push(actionLink(styleBundle ? 'Open style bundle' : info.actionLabel ?? 'Open in lab', authoringHref, true));
  } else if (viewHref) {
    buttons.push(actionLink('View asset', viewHref, true));
  }
  if (authoringHref && viewHref && viewHref !== authoringHref) {
    buttons.push(actionLink(isModelEntry(entry) ? 'Open 3D viewer' : 'View asset', viewHref));
  }
  const download = document.createElement('button');
  download.className = 'tl-btn';
  download.type = 'button';
  download.textContent = 'Download JSON';
  download.addEventListener('click', () => downloadDocument(entry));
  buttons.push(download);
  actions.replaceChildren(...buttons);
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
  for (const tag of (Array.isArray(entry.tags) ? entry.tags : []).slice(0, 2)) {
    const tagBadge = document.createElement('span');
    tagBadge.className = 'gal-badge';
    tagBadge.textContent = `#${tag}`;
    meta.append(tagBadge);
  }
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

function filterOption(value, label = value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function populateFilters() {
  const typeLabels = [...new Set(entries.map((entry) => infoFor(entry).label))]
    .sort((a, b) => a.localeCompare(b));
  const tags = [...new Set(entries.flatMap((entry) => Array.isArray(entry.tags) ? entry.tags : []))]
    .sort((a, b) => a.localeCompare(b));
  typeFilter.replaceChildren(filterOption('', 'All types'), ...typeLabels.map((label) => filterOption(label)));
  tagFilter.replaceChildren(filterOption('', 'All tags'), ...tags.map((tag) => filterOption(tag, `#${tag}`)));
}

function applyInitialFilters() {
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') ?? '';
  const requestedType = params.get('type') ?? '';
  const requestedTag = params.get('tag') ?? '';
  typeFilter.value = [...typeFilter.options].some((option) => option.value === requestedType) ? requestedType : '';
  tagFilter.value = [...tagFilter.options].some((option) => option.value === requestedTag) ? requestedTag : '';
  currentPage = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
}

function syncIndexUrl() {
  const params = new URLSearchParams();
  const query = search.value.trim();
  if (query) params.set('q', query);
  if (typeFilter.value) params.set('type', typeFilter.value);
  if (tagFilter.value) params.set('tag', tagFilter.value);
  if (currentPage > 1) params.set('page', String(currentPage));
  const queryString = params.toString();
  history.replaceState(null, '', `/library/${queryString ? `?${queryString}` : ''}`);
}

function renderIndex() {
  const query = search.value.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const matchesQuery = JSON.stringify([
      entry.label,
      entry.name,
      entry.description,
      entry.type,
      entry.kind,
      entry.tags,
      infoFor(entry).label,
    ]).toLowerCase().includes(query);
    const matchesType = !typeFilter.value || infoFor(entry).label === typeFilter.value;
    const matchesTag = !tagFilter.value || (Array.isArray(entry.tags) && entry.tags.includes(tagFilter.value));
    return matchesQuery && matchesType && matchesTag;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  grid.replaceChildren(...visible.map(card));
  status.textContent = `${filtered.length} local ${filtered.length === 1 ? 'creation' : 'creations'}`;
  empty.hidden = filtered.length > 0;
  emptyTitle.textContent = entries.length === 0 ? 'Nothing saved yet' : 'No matching creations';
  emptyHint.textContent = entries.length === 0
    ? 'Make something in a lab, then save it with a name.'
    : 'Try another search, type, or tag.';
  const hasFilters = Boolean(query || typeFilter.value || tagFilter.value);
  clearFilters.hidden = !hasFilters;
  pager.hidden = filtered.length <= PAGE_SIZE;
  previousPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;
  pagerStatus.textContent = filtered.length === 0
    ? '0 creations'
    : `${start + 1}–${start + visible.length} of ${filtered.length}`;
  syncIndexUrl();
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
  renderDetail(entry);
  loadRevisions().catch((error) => {
    revisionStatus.textContent = error.message;
  });
}

async function saveDetail(event) {
  event.preventDefault();
  if (!activeEntry) return;
  const next = {
    ...activeEntry,
    label: detailForm.elements.label.value.trim(),
    description: detailForm.elements.description.value.trim(),
    tags: normalizeCreationTags(detailForm.elements.tags.value.split(',')),
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
  renderDetail(activeEntry);
  await loadRevisions();
  setEditModal(false);
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
  populateFilters();
  applyInitialFilters();
  renderIndex();
}

search.addEventListener('input', () => {
  currentPage = 1;
  renderIndex();
});
typeFilter.addEventListener('change', () => {
  currentPage = 1;
  renderIndex();
});
tagFilter.addEventListener('change', () => {
  currentPage = 1;
  renderIndex();
});
clearFilters.addEventListener('click', () => {
  search.value = '';
  typeFilter.value = '';
  tagFilter.value = '';
  currentPage = 1;
  renderIndex();
  search.focus();
});
previousPage.addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderIndex();
});
nextPage.addEventListener('click', () => {
  currentPage += 1;
  renderIndex();
});
detailForm.addEventListener('submit', saveDetail);
revisionForm.addEventListener('submit', saveRevisionDetails);
document.getElementById('deleteEntry').addEventListener('click', deleteDetail);
document.getElementById('nameCurrentVersion').addEventListener('click', () => {
  const current = revisions.find((revision) => revision.isCurrent);
  if (current) setRevisionModal(current);
});
editDetails.addEventListener('click', () => setEditModal(true));
closeEdit.addEventListener('click', () => setEditModal(false));
closeRevision.addEventListener('click', () => setRevisionModal(null));
editModal.addEventListener('mousedown', (event) => {
  if (event.target === editModal) setEditModal(false);
});
revisionModal.addEventListener('mousedown', (event) => {
  if (event.target === revisionModal) setRevisionModal(null);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !editModal.hidden) setEditModal(false);
  if (event.key === 'Escape' && !revisionModal.hidden) setRevisionModal(null);
});
load().catch((error) => {
  status.textContent = error.message;
  empty.hidden = false;
  if (!indexSection.hidden) return;
  detailStatus.textContent = error.message;
});
