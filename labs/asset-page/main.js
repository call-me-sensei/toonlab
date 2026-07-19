// /asset/?id=…&kind=… — mirror of toonlab.io/asset/:id (game character-screen
// showcase: full-bleed live stage, wipe, floating stats panel), with the OSS
// twist: every fact and file comes live from the source's public API (Poly
// Haven or Smithsonian 3D), never from a ToonLab backend, and downloads need
// no account.
//
// Textures/models render live through the same unlisted /asset-lab/ embed the
// Pro page iframes (engine contract: __assetLabEngine, body.dataset.modelReady,
// __assetLabHandoffToTextureLab, __assetLabRetexture). HDRIs aren't supported
// by that engine, so they show the source's tonemapped render instead.

import { downloadPolyhavenAsset } from '../shared/polyhavenDownload.js';
import {
  fetchSmithsonianAsset,
  isSmithsonianGalleryReady,
} from '../../src/assetlib/smithsonian.js';

const params = new URLSearchParams(window.location.search);
const assetId = (params.get('id') ?? '').replace(/[^a-z0-9_-]/gi, '');
const assetSource = params.get('src') === 'smithsonian' ? 'smithsonian' : 'polyhaven';
let sourceLabel = assetSource === 'smithsonian' ? 'Smithsonian 3D Open Access' : 'Poly Haven';
let sourcePage = assetSource === 'smithsonian' ? 'https://3d.si.edu' : `https://polyhaven.com/a/${assetId}`;
const KIND_BY_TYPE = { 0: 'hdri', 1: 'texture', 2: 'model' };

const els = {
  stage: document.getElementById('assetStage'),
  wipe: document.getElementById('assetWipe'),
  controls: document.getElementById('assetControls'),
  stageLabel: document.getElementById('stageLabel'),
  crumbSource: document.getElementById('crumbSource'),
  name: document.getElementById('assetName'),
  stats: document.getElementById('assetStats'),
  actions: document.getElementById('assetActions'),
  desc: document.getElementById('assetDesc'),
  tags: document.getElementById('assetTags'),
  download: document.getElementById('assetDownload'),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function stat(key, value) {
  const row = el('div', 'asset-stat');
  const k = el('span', 'k');
  const ico = el('span', 'ico', '◆');
  ico.setAttribute('aria-hidden', 'true');
  k.append(ico, key);
  const v = el('span', 'v');
  if (value instanceof Node) v.appendChild(value);
  else v.textContent = value;
  row.append(k, v);
  return row;
}

function fail(title, hint) {
  els.name.textContent = title;
  els.desc.textContent = hint;
  els.crumbSource.textContent = sourceLabel;
}

if (!assetId) {
  fail('Asset not found', 'This page needs an ?id= from the gallery.');
} else {
  boot().catch((error) => {
    console.error('Asset page failed:', error);
    fail('Asset source unreachable', `Could not reach the ${sourceLabel} API — check your connection and reload.`);
  });
}

async function boot() {
  if (assetSource === 'smithsonian') {
    await bootSmithsonian();
    return;
  }
  const res = await fetch(`/api/polyhaven/info/${assetId}`);
  if (!res.ok) {
    fail('Asset not found', `Poly Haven has no asset “${assetId}”.`);
    return;
  }
  const info = await res.json();
  const kind = ['texture', 'model', 'hdri'].includes(params.get('kind'))
    ? params.get('kind')
    : (KIND_BY_TYPE[info.type] ?? 'texture');
  const authors = Object.keys(info.authors ?? {});

  document.title = `${info.name} — ToonLab`;
  els.crumbSource.textContent = sourceLabel;
  els.name.textContent = info.name;

  // ----- stats (same rows as Pro, minus account-bound ratings) -----
  const sourceLink = el('a', null, `${sourceLabel} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  els.stats.append(stat('Source', sourceLink), stat('License', 'CC0 — free for any use'), stat('Type', kind));
  if (authors.length) els.stats.append(stat('Created by', authors.join(', ')));
  const resPx = info.max_resolution ?? info.dimensions;
  if (Array.isArray(resPx) && kind !== 'model') {
    els.stats.append(stat('Max resolution', resPx.map((n) => Number(n).toLocaleString()).join(' × ')));
  }
  els.stats.append(stat('Source downloads', Number(info.download_count ?? 0).toLocaleString()));

  els.desc.textContent = `${info.name} by ${authors.join(', ') || sourceLabel} on ${sourceLabel}. Attribution isn't required by CC0 — the makers earn it anyway.`;

  for (const tag of [...(info.tags ?? []), ...(info.categories ?? [])].slice(0, 10)) {
    const a = el('a', null, tag);
    a.href = `/gallery/?q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(a);
  }

  setupDownload(kind);

  if (kind === 'hdri') {
    // No live engine for HDRIs — show the source's tonemapped render.
    els.stage.style.backgroundImage = `url("https://cdn.polyhaven.com/asset_img/primary/${assetId}.png?width=1600")`;
    return;
  }
  setupStage(kind);
}

async function bootSmithsonian() {
  const ref = await fetchSmithsonianAsset(assetId);
  if (!ref || !isSmithsonianGalleryReady(ref)) {
    fail('Asset not found', `Smithsonian 3D has no gallery-ready asset “${assetId}”.`);
    return;
  }
  sourcePage = ref.pageUrl;
  document.title = `${ref.name} — ToonLab`;
  els.crumbSource.textContent = sourceLabel;
  els.name.textContent = ref.name;

  const sourceLink = el('a', null, `${sourceLabel} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  els.stats.append(
    stat('Source', sourceLink),
    stat('License', 'CC0 — free for any use'),
    stat('Type', 'model'),
    stat('Format', 'GLB · browser-ready'),
  );
  els.desc.textContent = `${ref.name} from Smithsonian 3D Open Access, previewed live in ToonLab. Attribution isn't required by CC0; the source link preserves the museum record and context.`;
  for (const tag of [...ref.tags, ...ref.categories].slice(0, 10)) {
    const a = el('a', null, tag);
    a.href = `/gallery/?src=smithsonian&q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(a);
  }
  setupDownload('model', ref.download);
  setupStage('model', ref);
}

// ----- live stage (texture/model): same embed contract as the Pro page -----

function setupStage(kind, directRef = null) {
  const labUrl = directRef
    ? `/asset-lab/?url=${encodeURIComponent(directRef.download.url)}&asset=${encodeURIComponent(assetId)}&kind=model&style=call_me_sensei`
    : `/asset-lab/?source=polyhaven&asset=${encodeURIComponent(assetId)}&kind=${kind}&style=call_me_sensei`;
  const stageThumb = directRef?.thumbnailUrl
    ?? `https://cdn.polyhaven.com/asset_img/thumbs/${assetId}.png?width=1280&height=960`;
  els.stage.style.backgroundImage = `url("${stageThumb.replace(/"/g, '%22')}")`;

  const frame = document.createElement('iframe');
  frame.src = `${labUrl}&hud=0&embed=1&compare=1&split=0.2`;
  frame.title = `${assetId} — source vs Call Me Sensei style, live`;
  frame.allow = 'fullscreen';
  els.stage.appendChild(frame);

  const engine = () => frame.contentWindow?.__assetLabEngine;
  const frameWin = () => frame.contentWindow;

  // Loading overlay tracks EVERY in-flight show via the automation contract.
  const loading = el('div', 'asset-loading');
  const spinner = el('span', 'gal-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  loading.append(spinner, el('span', null, `Loading ${kind} — downloading & applying Call Me Sensei style…`));
  els.stage.appendChild(loading);

  const errorBox = el('div', 'asset-loading asset-loading--error');
  const errorText = el('span');
  const sourceOut = el('a', null, `view it on ${sourceLabel} ↗`);
  sourceOut.href = sourcePage;
  sourceOut.target = '_blank';
  sourceOut.rel = 'noreferrer';
  const retry = el('button', null, 'Retry preview');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    errorBox.remove();
    els.stage.appendChild(loading);
    frame.contentWindow?.location.reload();
  });
  errorBox.append(errorText, sourceOut, retry);

  setInterval(() => {
    let ready;
    let message = '';
    try {
      const dataset = frame.contentDocument?.body?.dataset;
      ready = dataset?.modelReady;
      message = (dataset?.modelError ?? '').slice(0, 160);
    } catch {
      return; // iframe not ready yet
    }
    if (ready === 'true') {
      loading.remove();
      errorBox.remove();
    } else if (ready === 'error') {
      loading.remove();
      errorText.textContent = `Live preview couldn't load this asset${message ? ` (${message})` : ''} — `;
      if (!errorBox.isConnected) els.stage.appendChild(errorBox);
    } else if (!errorBox.isConnected && !loading.isConnected) {
      els.stage.appendChild(loading); // style/res switch kicked off a new load
    }
  }, 300);

  // Wipe: styled view dominates; the handle drives the engine live.
  let split = 0.2;
  els.wipe.hidden = false;
  els.wipe.style.left = `${split * 100}%`;
  const dragSplit = (clientX) => {
    const rect = els.stage.getBoundingClientRect();
    if (rect.width === 0) return;
    split = Math.min(0.95, Math.max(0.02, (clientX - rect.left) / rect.width));
    els.wipe.style.left = `${split * 100}%`;
    els.wipe.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    engine()?.setSplit(split);
  };
  els.wipe.addEventListener('pointerdown', (e) => {
    els.wipe.setPointerCapture(e.pointerId);
    dragSplit(e.clientX);
  });
  els.wipe.addEventListener('pointermove', (e) => {
    if (e.buttons > 0) dragSplit(e.clientX);
  });
  els.wipe.addEventListener('keydown', (e) => {
    const rect = els.stage.getBoundingClientRect();
    if (e.key === 'ArrowLeft') dragSplit(rect.left + (split - 0.05) * rect.width);
    if (e.key === 'ArrowRight') dragSplit(rect.left + (split + 0.05) * rect.width);
  });

  els.stageLabel.hidden = false;

  if (kind === 'texture') {
    setupTextureControls(engine);
    setupTextureLabHandoff(frameWin, labUrl);
  } else {
    setupRetexture(frameWin);
  }
}

// Bottom controls — textures only (models are pure orbit): 3D shapes, or the
// 2D raw-map inspector.
function setupTextureControls(engine) {
  els.controls.hidden = false;
  els.controls.classList.add('tl-control-row');
  const modeButtons = new Map();
  const shapeButtons = new Map();
  let shapesWrap;
  let channelSelect;

  const setMode = (mode) => {
    for (const [m, b] of modeButtons) b.classList.toggle('on', m === mode);
    engine()?.setViewMode(mode);
    if (mode === '2d') {
      engine()?.setTextureShape('plane');
      channelSelect.value = 'lit';
    }
    shapesWrap.style.display = mode === '3d' ? '' : 'none';
    channelSelect.style.display = mode === '2d' ? '' : 'none';
    if (mode === '2d') engine()?.setMapChannel('lit');
  };

  for (const mode of ['3d', '2d']) {
    const b = el('button', mode === '3d' ? 'on' : '', mode.toUpperCase());
    b.type = 'button';
    b.addEventListener('click', () => setMode(mode));
    modeButtons.set(mode, b);
    els.controls.appendChild(b);
  }
  const div = el('span', 'div');
  div.setAttribute('aria-hidden', 'true');
  els.controls.appendChild(div);

  shapesWrap = el('span');
  shapesWrap.style.display = 'contents';
  for (const [id, label] of [
    ['duo', '◐ Both'], ['sphere', '● Sphere'], ['cube', '■ Cube'], ['cylinder', '▮ Cylinder'],
    ['torus', '◯ Torus'], ['knot', '✾ Knot'], ['plane', '▬ Flat'],
  ]) {
    const b = el('button', id === 'duo' ? 'on' : '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      for (const [s, btn] of shapeButtons) btn.classList.toggle('on', s === id);
      engine()?.setTextureShape(id);
    });
    shapeButtons.set(id, b);
    shapesWrap.appendChild(b);
  }
  els.controls.appendChild(shapesWrap);

  channelSelect = document.createElement('select');
  channelSelect.className = 'channel';
  channelSelect.setAttribute('aria-label', 'Texture map channel');
  for (const [value, label] of [
    ['lit', 'Lit material'], ['albedo', 'Albedo'], ['height', 'Height'], ['normal', 'Normal'],
    ['roughness', 'Roughness'], ['metalness', 'Metalness'], ['occlusion', 'Occlusion'], ['emissive', 'Emissive'],
  ]) {
    channelSelect.appendChild(new Option(label, value));
  }
  channelSelect.style.display = 'none';
  channelSelect.addEventListener('change', () => engine()?.setMapChannel(channelSelect.value));
  els.controls.appendChild(channelSelect);
}

function setupTextureLabHandoff(frameWin, labUrl) {
  const pill = el('button', 'pill', 'Edit in Texture Lab');
  pill.type = 'button';
  pill.addEventListener('click', async () => {
    // Stage the diffuse via the embedded lab, then jump to the Texture Lab
    // with it imported (same-origin sessionStorage handoff).
    pill.disabled = true;
    pill.textContent = 'Preparing texture…';
    const ok = await frameWin()?.__assetLabHandoffToTextureLab?.().catch(() => false);
    pill.disabled = false;
    pill.textContent = 'Edit in Texture Lab';
    if (ok) window.location.href = '/texture-lab/?importImage=1';
    else window.location.href = labUrl; // fallback: the full browser, HUD on
  });
  els.actions.appendChild(pill);
}

// Retexture — models only, free and client-side: rebind any Poly Haven
// texture onto the model (or one part), re-shaded through the style set.
// Search runs against the same public index the gallery uses.
function setupRetexture(frameWin) {
  const wrap = el('div', 'retex');
  const head = el('div', 'retex-head', 'Retexture');
  const partSelect = document.createElement('select');
  partSelect.className = 'retex-part';
  partSelect.appendChild(new Option('All parts', 'all'));
  let partsLoaded = false;
  partSelect.addEventListener('focus', () => {
    if (partsLoaded) return;
    const parts = frameWin()?.__assetLabListParts?.() ?? [];
    if (parts.length === 0) return;
    partsLoaded = true;
    parts.forEach((name, i) => partSelect.appendChild(new Option(name, String(i))));
  });
  head.appendChild(partSelect);

  const search = document.createElement('input');
  search.className = 'retex-search';
  search.placeholder = 'Search textures — wood, brick, moss…';
  const results = el('div', 'retex-results');
  const errorLine = el('div', 'retex-error');
  errorLine.hidden = true;

  let index = null;
  async function textureIndex() {
    if (!index) {
      const res = await fetch('/api/polyhaven/assets?type=textures');
      if (!res.ok) throw new Error(`polyhaven textures → HTTP ${res.status}`);
      index = Object.entries(await res.json())
        .map(([id, a]) => ({
          id,
          name: a.name ?? id,
          popularity: a.download_count ?? 0,
          haystack: [a.name ?? '', id, ...(a.tags ?? []), ...(a.categories ?? [])].join(' ').toLowerCase(),
        }))
        .sort((a, b) => b.popularity - a.popularity);
    }
    return index;
  }

  let busyId = null;
  async function renderResults(query) {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (await textureIndex())
      .filter((t) => terms.every((term) => t.haystack.includes(term)))
      .slice(0, 8);
    results.replaceChildren(...matches.map((t) => {
      const b = el('button');
      b.type = 'button';
      b.title = t.name;
      b.style.backgroundImage = `url("https://cdn.polyhaven.com/asset_img/thumbs/${t.id}.png?width=256&height=256")`;
      b.appendChild(el('span', null, t.name));
      b.addEventListener('click', async () => {
        if (busyId) return;
        busyId = t.id;
        b.classList.add('busy');
        errorLine.hidden = true;
        const partIndex = partSelect.value === 'all' ? null : Number(partSelect.value);
        const result = await frameWin()
          ?.__assetLabRetexture?.({ source: 'polyhaven', id: t.id, partIndex })
          .catch((e) => ({ ok: false, error: e.message }));
        busyId = null;
        b.classList.remove('busy');
        if (!result?.ok) {
          errorLine.textContent = result?.error ?? 'Retexture failed — is the model loaded yet?';
          errorLine.hidden = false;
        }
      });
      return b;
    }));
  }

  let timer = null;
  search.addEventListener('focus', () => {
    if (results.childElementCount === 0) renderResults(search.value).catch(() => {});
  });
  search.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => renderResults(search.value).catch(() => {}), 250);
  });

  wrap.append(head, search, results, errorLine);
  els.actions.appendChild(wrap);
}

// ----- download CTA — no account, fetched straight off the source CDN and
// saved directly (multi-file sets are zipped in the browser) -----

function setupDownload(kind, directDownload = null) {
  const idle = `Download ${kind} ↓`;
  els.download.textContent = idle;
  // Real href kept for middle-click/copy-link; plain clicks download in place.
  els.download.href = directDownload?.url ?? sourcePage;
  els.download.target = '_blank';
  els.download.rel = 'noreferrer';
  els.download.hidden = false;
  let busy = false;
  els.download.addEventListener('click', async (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      if (directDownload?.url) {
        els.download.textContent = 'Downloading…';
        const response = await fetch(directDownload.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `${els.name.textContent.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || assetId}.glb`;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        await downloadPolyhavenAsset({
          id: assetId,
          kind,
          onProgress: (done, total, phase) => {
            els.download.textContent = phase === 'pack' ? 'Packing zip…' : `Downloading ${done}/${total}…`;
          },
        });
      }
    } catch (error) {
      console.error('Direct download failed:', error);
      window.open(sourcePage, '_blank', 'noopener'); // fallback: source's picker
    }
    els.download.textContent = idle;
    busy = false;
  });
}
