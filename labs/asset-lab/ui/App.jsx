// Asset Browser HUD: search + filter the CC0 corpus on the left, results
// grid in the middle (the source's own thumbnails — instant), live styled
// preview fullscreen behind. Selecting a card downloads the asset once and
// re-shades it through the active style set; "Save to library" writes an
// imported-glb catalog entry so it browses/reloads beside procedural assets.
//
// Attribution is a feature, not a footnote: every card carries the source
// badge, and the source line links to Poly Haven — their API ToS asks for
// credit next to the content, and the badge doubles as a license filter
// (everything surfaced here is CC0 by construction).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getEnvironmentPresetOptions } from '@call-me-sensei/toonlab/environment';
import { catalog } from '@call-me-sensei/toonlab/catalog';
import {
  AMBIENTCG_PROXY_API,
  POLYPIZZA_PROXY_API,
  collectAssetCategories,
  fetchPolyhavenIndex,
  filterAssetRefs,
  importedAssetCatalogEntry,
  searchAmbientcg,
  searchPolyPizza,
} from '@call-me-sensei/toonlab/assetlib';
import {
  readZipEntries,
  rewriteAmbientcgDownloadUrl,
} from '@call-me-sensei/toonlab/assetlib';
import { Badge, Button, Select, toast } from '../../shared/ui/index.js';
import { saveLibraryEntry } from '../../catalog/userLibrary.js';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { fileToTextureImage } from '../../texture-lab/ui/imageUpload.js';

const SOURCE_OPTIONS = [
  { label: 'Poly Haven', value: 'polyhaven' },
  { label: 'ambientCG', value: 'ambientcg' },
  { label: 'Poly Pizza (low-poly)', value: 'polypizza' },
];

const KIND_OPTIONS = [
  { label: 'Models', value: 'models' },
  { label: 'Textures', value: 'textures' },
];

const SOURCE_LINKS = {
  ambientcg: 'https://ambientcg.com',
  polyhaven: 'https://polyhaven.com',
  polypizza: 'https://poly.pizza',
};

const RESOLUTION_OPTIONS = ['1k', '2k', '4k'].map((value) => ({ label: value.toUpperCase(), value }));

const BACKDROP_OPTIONS = [
  { label: 'Studio (neutral)', value: 'studio' },
  { label: 'Outdoor', value: 'outdoor' },
  { label: 'Dark', value: 'dark' },
];

// BYO-key storage follows texture-lab's convention (toonlab.texture-lab.ai.v1).
// The key is sent as x-auth-token through the proxy; a server-side
// TOONLAB_POLYPIZZA_KEY (when set) overrides it at the proxy.
export const POLYPIZZA_KEY_STORAGE = 'toonlab.asset-lab.polypizza-key.v1';

function readStoredKey() {
  try {
    return localStorage.getItem(POLYPIZZA_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function App({ engine, boot = {} }) {
  const [source, setSource] = useState(
    SOURCE_OPTIONS.some((option) => option.value === boot.source) ? boot.source : 'polyhaven',
  );
  const [kind, setKind] = useState(boot.kind === 'texture' ? 'textures' : 'models');
  const [query, setQuery] = useState(boot.query ?? '');
  const [category, setCategory] = useState('all');
  const [refs, setRefs] = useState([]);
  const [indexError, setIndexError] = useState(null);
  const [selectedId, setSelectedId] = useState(boot.asset ?? null);
  const [resolution, setResolution] = useState(boot.res ?? '1k');
  const [style, setStyle] = useState(boot.style ?? 'default');
  const [loading, setLoading] = useState(false);
  const [compareOn, setCompareOn] = useState(Boolean(boot.compare));
  const [split, setSplit] = useState(boot.split ?? 0.5);
  const [lightsOn, setLightsOn] = useState({ fill: false, sky: true, sun: true });
  const [backdrop, setBackdrop] = useState(boot.backdrop ?? 'studio');
  const [ppKey, setPpKey] = useState(readStoredKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const lastShow = useRef(null);

  const savePpKey = () => {
    const value = keyDraft.trim();
    try {
      if (value) localStorage.setItem(POLYPIZZA_KEY_STORAGE, value);
      else localStorage.removeItem(POLYPIZZA_KEY_STORAGE);
    } catch { /* private mode — key lives for this session only */ }
    setPpKey(value);
    setKeyDraft('');
    setEditingKey(false);
  };

  const styleOptions = useMemo(() => getEnvironmentPresetOptions(), []);

  useEffect(() => { engine.setBackdrop(backdrop); }, [backdrop]);
  useEffect(() => { engine.setCompare(compareOn); }, [compareOn]);
  useEffect(() => { engine.setSplit(split); }, [split]);
  useEffect(() => {
    for (const [name, on] of Object.entries(lightsOn)) engine.setLight(name, on);
  }, [lightsOn]);

  const dragSplit = (event) => {
    // preventDefault + user-select lock: without them the drag runs a text
    // selection across the HUD panels while wiping
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = 'none';
    const move = (pointerEvent) => setSplit(pointerEvent.clientX / window.innerWidth);
    const stop = () => {
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  // Poly Haven: whole index once, filter locally. ambientCG (materials) and
  // Poly Pizza (low-poly models, BYO key injected by the proxy): remote
  // search through the backend/dev proxy, debounced.
  useEffect(() => {
    let cancelled = false;
    setIndexError(null);
    if (source === 'polyhaven') {
      fetchPolyhavenIndex({ type: kind })
        .then((loaded) => { if (!cancelled) setRefs(loaded); })
        .catch((error) => { if (!cancelled) setIndexError(error.message); });
      return () => { cancelled = true; };
    }
    const timer = setTimeout(() => {
      const search = source === 'polypizza'
        ? searchPolyPizza({ apiKey: ppKey || null, apiUrl: POLYPIZZA_PROXY_API, limit: 48, query })
        : searchAmbientcg({ apiUrl: AMBIENTCG_PROXY_API, limit: 80, query });
      search
        .then((loaded) => { if (!cancelled) setRefs(loaded); })
        .catch((error) => {
          if (cancelled) return;
          setIndexError(source === 'polypizza'
            ? error.message
            : 'ambientCG needs a backend route — run the dev server (npm run dev).');
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, kind, source === 'polyhaven' ? null : query, source === 'polypizza' ? ppKey : null]);

  const categories = useMemo(() => collectAssetCategories(refs).slice(0, 16), [refs]);
  const results = useMemo(() => filterAssetRefs(refs, {
    category: category === 'all' ? null : category,
    text: source === 'polyhaven' ? (query || null) : null,
  }), [refs, query, category, source]);

  const selected = useMemo(
    () => refs.find((ref) => ref.id === selectedId) ?? null,
    [refs, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    engine.show(selected, { resolution, stylePreset: style }).then((result) => {
      if (result.stale) return;
      setLoading(false);
      if (!result.ok) toast(`Load failed: ${result.error}`);
      else lastShow.current = { ref: selected, ...result };
    });
  }, [selected, resolution, style]);

  const [savedId, setSavedId] = useState(null);

  const saveToLibrary = async () => {
    const shown = lastShow.current;
    if (!shown || shown.ref.id !== selected?.id) { toast('Load an asset first.'); return; }
    try {
      const entry = importedAssetCatalogEntry(shown.ref, {
        download: shown.download ?? null,
        textureSet: shown.textureSet ?? null,
      });
      await saveLibraryEntry(entry);
      try { catalog.register(entry, { source: 'library' }); } catch { /* already mounted */ }
      setSavedId(entry.id);
      toast(`Saved to library as ${entry.id}`);
    } catch (error) {
      toast(`Save failed: ${error.message}`);
    }
  };

  // Cross-pollination: hand the diffuse to Texture Lab as its image base
  // layer, where the toonify pipeline (seamless-ize, cel bands, palette,
  // wear) takes over. Uses the exact converter uploads go through.
  const sendToTextureLab = async () => {
    const shown = lastShow.current;
    if (!shown || shown.ref.id !== selected?.id || selected.kind !== 'texture') {
      toast('Load a texture asset first.');
      return;
    }
    try {
      let blob = null;
      if (shown.textureSet?.maps?.diffuse?.url) {
        blob = await (await fetch(shown.textureSet.maps.diffuse.url)).blob();
      } else if (shown.download?.url) {
        const response = await fetch(rewriteAmbientcgDownloadUrl(shown.download.url));
        const entries = await readZipEntries(await response.arrayBuffer());
        const color = entries.find((entry) => /_Color\.(jpg|png)$/i.test(entry.name));
        if (color) {
          blob = new Blob([color.data], {
            type: color.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          });
        }
      }
      if (!blob) { toast('No diffuse map found on this asset.'); return; }
      const layer = await fileToTextureImage(new File([blob], `${selected.name}.jpg`, { type: blob.type }));
      if (!setLabHandoff('texture-image', layer)) { toast('Could not stage the handoff (storage blocked).'); return; }
      window.location.href = '/texture-lab/?importImage=1';
    } catch (error) {
      toast(`Handoff failed: ${error.message}`);
    }
  };

  return (
    <div className="asset-shell">
      <aside className="asset-side">
        <h1>Asset Browser</h1>
        <p className="asset-sub">
          CC0 assets, previewed in your style set — from{' '}
          <a href={SOURCE_LINKS[source]} rel="noreferrer" target="_blank">
            {SOURCE_OPTIONS.find((option) => option.value === source)?.label}
          </a>
        </p>
        <Select
          onChange={(next) => {
            setSource(next);
            setCategory('all');
            setSelectedId(null);
            if (next === 'ambientcg') setKind('textures'); // materials only
            if (next === 'polypizza') setKind('models'); // models only
          }}
          options={SOURCE_OPTIONS}
          value={source}
        />
        <Select
          onChange={setKind}
          options={KIND_OPTIONS.filter((option) => {
            if (source === 'ambientcg') return option.value === 'textures';
            if (source === 'polypizza') return option.value === 'models';
            return true;
          })}
          value={kind}
        />
        <input
          className="tk-text-field"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search crate, brick, rock…"
          type="search"
          value={query}
        />
        <div className="asset-tags">
          <button
            className={category === 'all' ? 'tag on' : 'tag'}
            onClick={() => setCategory('all')}
            type="button"
          >all</button>
          {categories.map((name) => (
            <button
              className={category === name ? 'tag on' : 'tag'}
              key={name}
              onClick={() => setCategory(category === name ? 'all' : name)}
              type="button"
            >{name}</button>
          ))}
        </div>
        <div className="asset-style">
          <label>Style set</label>
          <Select onChange={setStyle} options={styleOptions} value={style} />
          <label>Resolution</label>
          <Select onChange={setResolution} options={RESOLUTION_OPTIONS} value={resolution} />
          <label>Backdrop</label>
          <Select onChange={setBackdrop} options={BACKDROP_OPTIONS} value={backdrop} />
          <label>Lighting</label>
          <div className="asset-checks">
            {[['sun', 'Key sun'], ['sky', 'Sky fill'], ['fill', 'Front fill']].map(([name, label]) => (
              <label className="asset-check" key={name}>
                <input
                  checked={lightsOn[name]}
                  onChange={(event) => setLightsOn({ ...lightsOn, [name]: event.target.checked })}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          <label className="asset-check asset-compare-toggle">
            <input
              checked={compareOn}
              onChange={(event) => setCompareOn(event.target.checked)}
              type="checkbox"
            />
            Compare original (wipe)
          </label>
        </div>
        {source === 'polypizza' ? (
          <div className="asset-key">
            {ppKey && !editingKey ? (
              <p className="asset-key-status">
                API key saved ·{' '}
                <button className="asset-key-link" onClick={() => setEditingKey(true)} type="button">change</button>
              </p>
            ) : (
              <>
                <label>Poly Pizza API key</label>
                <input
                  className="tk-text-field"
                  onChange={(event) => setKeyDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') savePpKey(); }}
                  placeholder="paste key…"
                  type="password"
                  value={keyDraft}
                />
                <div className="asset-key-row">
                  <Button onClick={savePpKey}>Save key</Button>
                  <a
                    className="asset-key-link"
                    href="https://poly.pizza/settings/api"
                    rel="noreferrer"
                    target="_blank"
                  >Get a free key ↗</a>
                </div>
              </>
            )}
          </div>
        ) : null}
        {indexError ? <p className="asset-error">{indexError}</p> : null}
        <p className="asset-count">{results.length} of {refs.length} assets · all CC0</p>
      </aside>

      <main className="asset-grid" data-count={results.length}>
        {results.map((ref) => (
          <button
            className={`card${selectedId === ref.id ? ' selected' : ''}`}
            key={ref.id}
            onClick={() => setSelectedId(ref.id)}
            type="button"
          >
            <img alt="" loading="lazy" src={ref.thumbnailUrl} />
            <div className="card-label">{ref.name}</div>
            <div className="card-meta">
              <Badge>{ref.attribution.sourceLabel}</Badge>
              <Badge>{ref.attribution.license ?? 'CC0'}</Badge>
              {ref.polycount ? <span className="card-tris">{(ref.polycount / 1000).toFixed(1)}k tris</span> : null}
            </div>
          </button>
        ))}
        {results.length === 0 && !indexError ? <div className="empty">Nothing matches.</div> : null}
      </main>

      {compareOn && selected ? (
        <div
          className="asset-divider"
          onPointerDown={dragSplit}
          style={{ left: `${split * 100}%` }}
        >
          <span className="asset-divider-label left">original</span>
          <span className="asset-divider-handle" />
          <span className="asset-divider-label right">{style}</span>
        </div>
      ) : null}

      {selected ? (
        <section className="asset-detail">
          <h2>{selected.name}{loading ? ' · loading…' : ''}</h2>
          <p className="asset-attrib">
            <a href={selected.pageUrl} rel="noreferrer" target="_blank">
              {selected.attribution.sourceLabel}
            </a>
            {` · ${selected.attribution.license ?? 'CC0'}`}
            {selected.authors.length ? ` · by ${selected.authors.join(', ')}` : ''}
          </p>
          {selected.attribution.text ? (
            <p className="asset-attrib">{selected.attribution.text}</p>
          ) : null}
          <div className="asset-actions">
            <Button onClick={saveToLibrary}>Save to library</Button>
            {selected.kind === 'texture' ? (
              <Button onClick={sendToTextureLab}>Toonify in Texture Lab</Button>
            ) : null}
            {savedId ? <a className="lab-link" href="/catalog/">Open Catalog ↗</a> : null}
            <a className="lab-link" href={selected.pageUrl} rel="noreferrer" target="_blank">
              View on {selected.attribution.sourceLabel} ↗
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
