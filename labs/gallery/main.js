// Gallery — the same UI as toonlab.io/gallery (toolbar, showcase grid,
// sticky pager), but backed exclusively by THIRD-PARTY public APIs queried
// live from the browser. That is the OSS/Pro split: Pro searches ToonLab's
// own index (community creations + curated open-data mirror, downloads behind an
// account); this page never talks to a ToonLab backend. Remote indexes come
// from source APIs, while processed PLATEAU landmark GLBs are bundled with
// their source feature IDs and attribution.
//
// A source qualifies only if it has a keyless public API and downloadable
// open assets. Smithsonian 3D allows browser requests directly; Poly Haven
// metadata uses a same-origin host route so requests can identify the app.
// ambientCG has an API but sends no CORS headers; Kenney, Quaternius,
// Mantissa and 3DTextures.me have no search API.

import '../shared/siteHeader.js';
import { downloadPolyhavenAsset } from '../shared/polyhavenDownload.js';
import {
  fetchSmithsonianIndex,
  isSmithsonianGalleryReady,
} from '../../src/assetlib/smithsonian.js';
import { fetchPlateauBuildingIndex } from '../../src/assetlib/plateau.js';
import { listPlateauLandmarks } from '../../src/assetlib/plateauLandmarks.js';
import { hydratePlateauThumbnail } from '../../src/assetlib/plateauViewer.js';

const PAGE_SIZE = 36;

const PH_ENDPOINT = Object.freeze({ texture: 'textures', model: 'models', hdri: 'hdris' });

const SOURCES = Object.freeze({
  polyhaven: {
    label: 'Poly Haven',
    kinds: Object.keys(PH_ENDPOINT),
    cache: new Map(),
    list(kind) {
      // One fetch per kind per session; the full per-kind index is small
      // (~1–2k entries) so search/sort/pagination happen client-side.
      if (!this.cache.has(kind)) {
        const load = (async () => {
          const res = await fetch(`/api/polyhaven/assets?type=${PH_ENDPOINT[kind]}`);
          if (!res.ok) throw new Error(`polyhaven/${kind} → HTTP ${res.status}`);
          const data = await res.json();
          return Object.entries(data).map(([id, a]) => ({
            id: `polyhaven:${id}`,
            sourceId: id,
            kind,
            label: a.name ?? id,
            badge: 'Poly Haven · CC0',
            href: `/asset/?id=${encodeURIComponent(id)}&kind=${kind}`,
            sourceHref: `https://polyhaven.com/a/${id}`,
            thumbUrl: `${(a.thumbnail_url ?? `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png`).split('?')[0]}?width=640&height=480`,
            popularity: a.download_count ?? 0,
            haystack: [a.name ?? '', id, ...(a.tags ?? []), ...(a.categories ?? [])].join(' ').toLowerCase(),
          }));
        })();
        // Failed loads must not poison the cache — allow a retry.
        load.catch(() => this.cache.delete(kind));
        this.cache.set(kind, load);
      }
      return this.cache.get(kind);
    },
  },
  smithsonian: {
    label: 'Smithsonian 3D Open Access',
    kinds: ['model'],
    cache: null,
    list() {
      if (!this.cache) {
        this.cache = fetchSmithsonianIndex().then((refs) => refs
          .filter(isSmithsonianGalleryReady)
          .map((ref) => ({
            id: `smithsonian:${ref.id}`,
            sourceId: ref.id,
            kind: ref.kind,
            label: ref.name,
            badge: 'Smithsonian · CC0',
            href: `/asset/?src=smithsonian&id=${encodeURIComponent(ref.id)}&kind=model`,
            sourceHref: ref.pageUrl,
            downloadHref: ref.download.url,
            downloadName: `${ref.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || ref.id}.glb`,
            thumbUrl: ref.thumbnailUrl,
            popularity: 0,
            haystack: [ref.name, ref.id, ...ref.tags, ...ref.categories].join(' ').toLowerCase(),
          })));
        this.cache.catch(() => { this.cache = null; });
      }
      return this.cache;
    },
  },
  plateau: {
    label: 'Project PLATEAU',
    kinds: ['model'],
    cache: null,
    list() {
      if (!this.cache) {
        this.cache = fetchPlateauBuildingIndex()
          .catch((error) => {
            console.warn('PLATEAU city catalog unavailable; bundled landmarks remain searchable.', error);
            return [];
          })
          .then((cityRefs) => [
            ...listPlateauLandmarks().map((ref) => ({
              actionLabel: 'Download GLB ↓',
              badge: `PLATEAU · ${ref.attribution.license}`,
              directOpen: false,
              downloadHref: ref.download.url,
              downloadName: `${ref.metadata.nameJa ? `${ref.metadata.nameJa}-` : ''}${ref.id}.glb`,
              haystack: [
                ref.name,
                ref.id,
                ref.metadata.address,
                ...ref.tags,
                ...ref.categories,
              ].join(' ').toLowerCase(),
              href: `/asset/?src=plateau&id=${encodeURIComponent(ref.id)}&kind=model`,
              id: `plateau:${ref.id}`,
              kind: ref.kind,
              label: ref.name,
              popularity: 1_000_000,
              source: 'plateau-landmark',
              sourceHref: ref.pageUrl,
              sourceId: ref.id,
              thumbUrl: ref.thumbnailUrl,
            })),
            ...cityRefs.map((ref) => ({
              actionLabel: 'Source tiles ↗',
              badge: `PLATEAU · ${ref.attribution.license}`,
              directOpen: true,
              downloadHref: ref.download.url,
              haystack: [ref.name, ref.id, ...ref.tags, ...ref.categories].join(' ').toLowerCase(),
              href: `/asset/?src=plateau&id=${encodeURIComponent(ref.id)}&kind=model`,
              id: `plateau:${ref.id}`,
              kind: ref.kind,
              label: ref.name,
              lod: ref.metadata.lod,
              popularity: 0,
              source: 'plateau',
              sourceHref: ref.pageUrl,
              sourceId: ref.id,
              textured: ref.metadata.textured,
              thumbUrl: null,
            })),
          ]);
        this.cache.catch(() => { this.cache = null; });
      }
      return this.cache;
    },
  },
});

const els = {
  grid: document.getElementById('galGrid'),
  empty: document.getElementById('galEmpty'),
  emptyTitle: document.getElementById('galEmptyTitle'),
  emptyHint: document.getElementById('galEmptyHint'),
  status: document.getElementById('galStatus'),
  pager: document.getElementById('galPager'),
  pagerStatus: document.getElementById('galPagerStatus'),
  prev: document.getElementById('galPrev'),
  next: document.getElementById('galNext'),
  form: document.getElementById('galFilters'),
  search: document.getElementById('galSearch'),
  source: document.getElementById('galSource'),
  type: document.getElementById('galType'),
};

const state = { q: '', src: '', type: '', page: 1 };

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  state.q = params.get('q') ?? '';
  state.src = params.get('src') in SOURCES ? params.get('src') : '';
  state.type = ['texture', 'model', 'hdri'].includes(params.get('type')) ? params.get('type') : '';
  state.page = Math.max(1, Number(params.get('page')) || 1);
}

function urlFor(overrides = {}) {
  const merged = { ...state, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.src) params.set('src', merged.src);
  if (merged.type) params.set('type', merged.type);
  if (merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

function syncControls() {
  els.search.value = state.q;
  els.source.value = state.src;
  els.type.value = state.type;
}

async function collect() {
  const loads = [];
  for (const [key, source] of Object.entries(SOURCES)) {
    if (state.src && state.src !== key) continue;
    for (const kind of source.kinds) {
      if (state.type && state.type !== kind) continue;
      loads.push(source.list(kind));
    }
  }
  const settled = await Promise.allSettled(loads);
  const failures = settled.filter((result) => result.status === 'rejected');
  const fulfilled = settled.filter((result) => result.status === 'fulfilled');
  if (fulfilled.length === 0 && failures.length > 0) throw failures[0].reason;
  for (const failure of failures) console.warn('Gallery source unavailable:', failure.reason);
  let items = fulfilled.flatMap((result) => result.value);
  const terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) items = items.filter((item) => terms.every((t) => item.haystack.includes(t)));
  // Same ordering as Pro's CC0 half of the feed: popularity, descending.
  items.sort((a, b) => b.popularity - a.popularity);
  return { items, unavailable: failures.length };
}

function card(item) {
  // Every supported source has an OSS detail page. The explicit source-file
  // affordance still resolves the upstream asset directly.
  const el = document.createElement('a');
  el.className = 'gal-card';
  el.href = item.href;
  el.title = item.label;
  if (item.external) {
    el.target = '_blank';
    el.rel = 'noreferrer';
  }

  const media = document.createElement('div');
  media.className = 'gal-card-media';
  if (item.thumbUrl) media.style.backgroundImage = `url("${item.thumbUrl.replace(/"/g, '%22')}")`;
  else {
    media.classList.add('gal-card-media--empty');
    if (item.source === 'plateau') {
      media.classList.add('gal-card-media--plateau');
      const brand = document.createElement('strong');
      brand.textContent = 'PLATEAU';
      const detail = document.createElement('span');
      detail.textContent = `3D TILES · LOD${item.lod}${item.textured ? ' · TEXTURED' : ''}`;
      media.append(brand, detail);
      hydratePlateauThumbnail(media, {
        id: item.sourceId,
        tilesetUrl: item.downloadHref,
      });
    } else {
      media.textContent = '🧱';
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'gal-card-overlay';
  const title = document.createElement('div');
  title.className = 'gal-card-title';
  title.textContent = item.label;
  const meta = document.createElement('div');
  meta.className = 'gal-card-meta';
  const badge = document.createElement('span');
  badge.className = 'gal-badge gal-badge--src';
  badge.textContent = item.badge;
  const download = document.createElement('span');
  download.className = 'author';
  download.style.textDecoration = 'underline';
  download.style.cursor = 'pointer';
  const actionLabel = item.actionLabel ?? 'Download ↓';
  download.textContent = actionLabel;
  download.setAttribute('role', 'link');
  download.tabIndex = 0;
  let busy = false;
  const startDownload = async (e) => {
    // Direct download in place — assembled off the source CDN, no account.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (item.directOpen && item.downloadHref) {
      window.open(item.downloadHref, '_blank', 'noopener');
      return;
    }
    if (item.downloadHref) {
      busy = true;
      download.textContent = 'Downloading…';
      try {
        const response = await fetch(item.downloadHref);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = item.downloadName;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        console.error('Direct download failed:', error);
        window.open(item.sourceHref, '_blank', 'noopener');
      }
      download.textContent = actionLabel;
      busy = false;
      return;
    }
    busy = true;
    try {
      await downloadPolyhavenAsset({
        id: item.sourceId,
        kind: item.kind,
        onProgress: (done, total, phase) => {
          download.textContent = phase === 'pack' ? 'Packing…' : `${done}/${total}…`;
        },
      });
    } catch (error) {
      console.error('Direct download failed:', error);
      window.open(item.sourceHref, '_blank', 'noopener'); // fallback: source page
    }
    download.textContent = actionLabel;
    busy = false;
  };
  download.addEventListener('click', startDownload);
  download.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') startDownload(e);
  });
  meta.append(badge, download);
  overlay.append(title, meta);
  el.append(media, overlay);
  return el;
}

function setSearching(on) {
  els.grid.classList.toggle('gal-grid--loading', on);
  if (!on) return;
  const wrap = document.createElement('span');
  wrap.className = 'gal-searching';
  const spinner = document.createElement('span');
  spinner.className = 'gal-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  wrap.append(spinner, ' Searching…');
  els.status.replaceChildren(wrap);
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  setSearching(true);

  let items;
  let sourceFailures = 0;
  try {
    ({ items, unavailable: sourceFailures } = await collect());
  } catch (error) {
    if (id !== renderId) return;
    console.error('Gallery fetch failed:', error);
    els.grid.replaceChildren();
    els.status.textContent = 'Could not reach asset sources.';
    els.emptyTitle.textContent = 'Asset sources unreachable';
    els.emptyHint.textContent = 'Check your connection and try again.';
    els.empty.hidden = false;
    els.pager.hidden = true;
    setSearching(false);
    return;
  }
  if (id !== renderId) return;

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > totalPages) {
    state.page = totalPages;
    history.replaceState(null, '', urlFor());
  }
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  els.grid.replaceChildren(...pageItems.map(card));
  els.status.textContent = `${total.toLocaleString()} assets${sourceFailures ? ` · ${sourceFailures} source unavailable` : ''}`;

  const q = state.q.trim();
  els.emptyTitle.textContent = q ? `Nothing matches “${q}”` : 'Nothing matches';
  els.emptyHint.textContent = 'Try different filters or a broader search.';
  els.empty.hidden = total > 0;

  els.pager.hidden = totalPages <= 1;
  els.pagerStatus.textContent = `Page ${state.page} / ${totalPages}`;
  els.prev.href = urlFor({ page: state.page - 1 });
  els.next.href = urlFor({ page: state.page + 1 });
  els.prev.style.visibility = state.page > 1 ? 'visible' : 'hidden';
  els.next.style.visibility = state.page < totalPages ? 'visible' : 'hidden';

  setSearching(false);
}

function apply({ resetPage = true } = {}) {
  state.q = els.search.value;
  state.src = els.source.value;
  state.type = els.type.value;
  if (resetPage) state.page = 1;
  history.pushState(null, '', urlFor());
  render();
}

// Filters apply themselves: selects on change, search debounced while typing
// (changing any filter resets to page 1) — same behavior as Pro.
let searchTimer = null;
els.search.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(apply, 350);
});
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (searchTimer) clearTimeout(searchTimer);
  apply();
});
els.source.addEventListener('change', () => apply());
els.type.addEventListener('change', () => apply());

for (const [el, delta] of [[els.prev, -1], [els.next, 1]]) {
  el.addEventListener('click', (e) => {
    // Plain click paginates in place; the real href stays for middle-click.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    state.page += delta;
    history.pushState(null, '', urlFor());
    window.scrollTo({ top: 0 });
    render();
  });
}

window.addEventListener('popstate', () => {
  readUrl();
  syncControls();
  render();
});

// Deep links still work: /gallery/?type=texture (Texture Lab button), ?q=, ?src=.
readUrl();
syncControls();
render();
