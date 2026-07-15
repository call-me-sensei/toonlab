// Full-screen start/browse screen: built-in preset gallery with live-baked
// thumbnails, category filter, the user's saved library, and import.

import { useMemo, useState } from 'react';

import { Button, Icon, TextField, toast } from '../../shared/ui/index.js';
import {
  BUILT_IN_TEXTURE_PRESETS,
  TEXTURE_PRESET_CATEGORIES,
} from '../../../src/texgen/index.js';
import { deleteLocalTexturePreset, loadLocalTexturePresets } from '../textureProjectStore.js';
import { pickTextureImage } from './imageUpload.js';
import { TextureThumbnail } from './TextureThumbnail.jsx';

function ImportDialog({ actions, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="tx-import">
      <textarea
        className="tx-json"
        placeholder='Paste a texture recipe JSON ({"kind":"toonlab.textureRecipe", ...})'
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error && <div className="tx-import-error">{error}</div>}
      <div className="tx-import-actions">
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => {
            const result = actions.importRecipe(text);
            if (!result.ok) setError(result.errors.join(' '));
          }}
        >
          Import recipe
        </Button>
      </div>
    </div>
  );
}

export function GalleryScreen({ actions, state }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [libraryTick, setLibraryTick] = useState(0);
  const local = useMemo(() => loadLocalTexturePresets(), [libraryTick]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (preset) => tokens.every((token) => (
      preset.label.toLowerCase().includes(token)
      || preset.tags.some((tag) => tag.includes(token))
    ));
    const pool = category === 'local'
      ? local
      : BUILT_IN_TEXTURE_PRESETS.filter((preset) => category === 'all' || preset.category === category);
    return tokens.length ? pool.filter(matches) : pool;
  }, [category, query, local]);

  return (
    <div className="tx-gallery" data-testid="texture-gallery">
      <header className="tx-gallery-head">
        <div>
          <h1><Icon name="logo-toonlab" /> Texture Lab</h1>
          <p>
            Seamless procedural PBR textures for anything — stone, wood, metal, fabric, creature,
            sci-fi. Pick a material, tune every layer, or describe one in plain words.
          </p>
        </div>
        <div className="tx-gallery-start">
          <Button
            icon="sketch"
            kind="primary"
            onClick={() => { actions.startFromScratch(); actions.setStage('ai'); }}
          >
            Describe it (AI)
          </Button>
          <Button icon="plus" kind="secondary" onClick={() => actions.startFromScratch()}>Start from scratch</Button>
          <Button
            icon="download"
            kind="secondary"
            title="Turn a photo of ONE surface (wall, bark, fabric, a concept-art crop) into a seamless material. No AI — whole scenes just become wallpaper, so crop first."
            onClick={async () => {
              const layer = await pickTextureImage().catch((error) => {
                toast(error.message, { tone: 'danger' });
                return null;
              });
              if (!layer) return;
              actions.startFromScratch();
              actions.setImage(layer);
            }}
          >
            From an image
          </Button>
          <Button
            icon="download"
            kind="secondary"
            title="Browse CC0 texture sets (Poly Haven, ambientCG) in the Asset Browser — its “Toonify in Texture Lab” sends the diffuse here as an image base."
            onClick={() => { window.location.href = '/asset-lab/?kind=texture'; }}
          >
            Browse CC0 assets
          </Button>
          <Button icon="download" kind="ghost" onClick={() => setImporting(true)}>Import JSON</Button>
          {state.bootSource !== 'fresh' && (
            <Button kind="ghost" onClick={() => actions.setView({ gallery: false })}>Back to editor</Button>
          )}
        </div>
      </header>

      {importing && <ImportDialog actions={actions} onClose={() => setImporting(false)} />}

      <div className="tx-gallery-filter">
        <button type="button" className="tx-chip" data-active={category === 'all'} onClick={() => setCategory('all')}>All</button>
        {TEXTURE_PRESET_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="tx-chip"
            data-active={category === entry.id}
            onClick={() => setCategory(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <button type="button" className="tx-chip" data-active={category === 'local'} onClick={() => setCategory('local')}>
          Your library ({local.length})
        </button>
        <span className="tx-gallery-search">
          <TextField onCommit={setQuery} placeholder="Search presets…" value={query} />
        </span>
      </div>

      <div className="tx-gallery-grid">
        {filtered.map((preset) => (
          <div key={preset.id} className="tx-card-wrap">
            <button
              type="button"
              className="tx-card"
              data-testid={`preset-${preset.id}`}
              onClick={() => actions.applyPreset(preset.id)}
            >
              <TextureThumbnail preset={preset} />
              <strong>{preset.label}</strong>
              <small>{preset.tags.slice(0, 3).join(' · ')}</small>
            </button>
            {preset.category === 'local' && (
              <button
                type="button"
                className="tx-card-delete"
                title="Delete from your library"
                onClick={() => { deleteLocalTexturePreset(preset.id); setLibraryTick((t) => t + 1); }}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="tx-gallery-empty">
            {category === 'local'
              ? 'Nothing saved yet — tune a texture and use “Save to library”.'
              : 'No preset matches. Try the AI prompt instead — it can build anything.'}
          </p>
        )}
      </div>
    </div>
  );
}
