// Start gallery: the tool's front door. Continue card (when work exists),
// blank/procedural entry cards, built-in preset grid with real rendered
// thumbnails, local library with manage menu, and recipe import.

import { useEffect, useMemo, useState } from 'react';
import {
  BrandLockup, Button, Icon, Modal, toast,
} from '../../../shared/ui/index.js';
import {
  BUILT_IN_TREE_PRESETS, deleteLocalTreePreset, loadLocalTreePresets,
} from '../../treePresetStore.js';
import { getPresetThumbnails } from '../thumbnails.js';

function ImportDialog({ actions, onClose }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal onClose={onClose} title="Import recipe">
      <textarea
        className="td-json"
        autoFocus
        placeholder="Paste a treeRecipe JSON document…"
        spellCheck={false}
        style={{ minHeight: 220 }}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error && <div className="td-json-error">{error}</div>}
      <div className="td-export-actions">
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => {
            const result = actions.importRecipe(draft);
            if (!result.ok) {
              setError(result.errors.join(' '));
              return;
            }
            actions.setView({ gallery: false });
            onClose();
          }}
        >
          Open
        </Button>
      </div>
    </Modal>
  );
}

export function GalleryScreen({ actions, state }) {
  const [importOpen, setImportOpen] = useState(false);
  const [localVersion, setLocalVersion] = useState(0);
  const localPresets = useMemo(() => loadLocalTreePresets(), [localVersion]);
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    // Thumbnails render synchronously but after first paint, so the gallery
    // shell appears instantly even on a cold cache. On node backends,
    // cache-miss thumbnails render asynchronously (RT readback) and arrive
    // later via onUpdate — guarded so a late arrival after unmount (e.g. the
    // user opens a preset before rendering finishes) is a no-op.
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setThumbs(getPresetThumbnails([...BUILT_IN_TREE_PRESETS, ...localPresets], {
        onUpdate: (rendered) => {
          if (!cancelled) setThumbs((previous) => ({ ...previous, ...rendered }));
        },
      }));
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [localPresets]);

  const hasWork = state.bootSource === 'persisted'
    || state.sketch.branchSpines.length > 0 || state.presetId;

  function openPreset(presetId) {
    actions.applyPreset(presetId);
    actions.setView({ gallery: false });
  }

  return (
    <div className="td-gallery" data-testid="gallery">
      <header className="td-gallery-header">
        <BrandLockup labName="Vegetation Lab" />
        <Button icon="download" kind="ghost" onClick={() => setImportOpen(true)} testId="gallery-import">
          Import recipe…
        </Button>
      </header>
      <h1 className="td-gallery-title">Grow something</h1>
      <p className="td-gallery-sub">Start from a preset, a blank canvas, or a random seed.</p>

      {hasWork && (
        <button
          type="button"
          className="td-continue"
          data-testid="gallery-continue"
          onClick={() => actions.setView({ gallery: false })}
        >
          <div>
            <div style={{ font: 'var(--type-label)' }}>Continue where you left off</div>
            <div style={{ color: 'var(--text-tertiary)', font: 'var(--type-caption)' }}>
              seed {state.settings.plant.seed}
              {state.presetId ? ` · from “${state.presetId}”` : ''}
              {state.sketch.branchSpines.length ? ` · ${state.sketch.branchSpines.length} drawn strokes` : ''}
            </div>
          </div>
          <span className="tk-button" data-kind="primary">Resume →</span>
        </button>
      )}

      <div className="td-gallery-section">Start fresh</div>
      <div className="td-gallery-grid">
        <button
          type="button"
          className="td-card td-card-special"
          data-testid="gallery-blank"
          onClick={() => {
            actions.newTree({ drawn: true });
            actions.setSketchMode(true);
            actions.setView({ gallery: false });
          }}
        >
          <Icon name="tool-trunk" />
          <div>Blank Canvas</div>
          <span>Doodle it — wood + leaves, then Convert</span>
        </button>
        <button
          type="button"
          className="td-card td-card-special"
          data-testid="gallery-procedural"
          onClick={() => {
            actions.newTree({ drawn: false });
            actions.setView({ gallery: false });
          }}
        >
          <Icon name="dice" />
          <div>Procedural Seed</div>
          <span>Surprise me</span>
        </button>
      </div>

      <div className="td-gallery-section">Presets ({BUILT_IN_TREE_PRESETS.length})</div>
      <div className="td-gallery-grid">
        {BUILT_IN_TREE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="td-card"
            data-testid={`gallery-preset-${preset.id}`}
            onClick={() => openPreset(preset.id)}
          >
            {thumbs[preset.id]
              ? <img alt="" src={thumbs[preset.id]} />
              : <span className="td-card-thumb-empty" />}
            <div>{preset.label}</div>
            <span>{preset.type} · seed {preset.options?.seed ?? '—'}</span>
          </button>
        ))}
      </div>

      {localPresets.length > 0 && (
        <>
          <div className="td-gallery-section">Your library ({localPresets.length})</div>
          <div className="td-gallery-grid">
            {localPresets.map((preset) => (
              <div key={preset.id} className="td-card td-card-local">
                <button type="button" className="td-card-open" onClick={() => openPreset(preset.id)}>
                  {thumbs[preset.id]
                    ? <img alt="" src={thumbs[preset.id]} />
                    : <span className="td-card-thumb-empty" />}
                  <div>{preset.label}</div>
                  <span>local</span>
                </button>
                <button
                  type="button"
                  className="tk-icon-button td-card-delete"
                  aria-label={`Delete ${preset.label}`}
                  title="Delete preset"
                  onClick={() => {
                    deleteLocalTreePreset(preset.id);
                    toast(`Deleted “${preset.label}”`);
                    setLocalVersion((version) => version + 1);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {importOpen && <ImportDialog actions={actions} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
