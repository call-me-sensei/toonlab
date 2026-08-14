import { useEffect, useMemo, useState } from 'react';

import {
  getRockgenPresetOptions,
  getRockgenStyleOptions,
  isRockHelperPiece,
  ROCKGEN_SETTING_FIELD_SCHEMA,
  ROCKGEN_SETTING_GROUPS,
} from '../../../src/rockgen/index.js';
import { pickFile } from '../../shared/download.js';
import { isLabEditorLocation, syncLabHomeRoute } from '../../shared/labViewRouting.js';
import '../../shared/siteHeader.js';
import {
  BrandLockup,
  Button,
  Icon,
  IconButton,
  LabEditorHeader,
  PresetRowShell,
  PreviewBar,
  RendererToggle,
  SchemaGroup,
  SearchSelect,
  SegmentedControl,
  Select,
  TextField,
  ToastStack,
  Toggle,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import {
  ROCK_VARIATION_CATALOG,
  ROCK_VARIATION_FAMILIES,
  getRockVariationCatalogEntry,
  loadRockVariationCatalog,
  searchRockVariationCatalog,
} from './catalog.js';
import { ROCK_PRESET_THUMBNAILS } from '../../rock-lab/ui/thumbnailAssets.js';
import {
  catalogSurfacePresetValue,
  CATALOG_SURFACE_PRESET_OPTIONS,
  CATALOG_TOP_FINISH_OPTIONS,
  ROCK_GENERATION_PREVIEW_RESOLUTIONS,
} from './store.js';

const GROUPS = Object.fromEntries(ROCKGEN_SETTING_GROUPS.map((entry) => [entry.id, entry]));
const CATALOG_TOP_FIELD_KEYS = new Set([
  'topColor',
  'topCoatStrength',
  'topHeightStart',
  'topSlopeStart',
]);
const CATALOG_PBR_FIELD_KEYS = new Set([
  'pbrNormalStrength',
  'pbrRoughness',
  'pbrTexturePreset',
  'pbrTextureScale',
]);
const CATALOG_WEATHERING_FIELD_KEYS = new Set([
  'lichenColor',
  'lichenCoverage',
  'mossColor',
  'mossCoverage',
  'stainColor',
  'stainStrength',
  'textureScale',
  'veinColor',
  'veinStrength',
]);
const SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Primitive proportions, landform profile, and overall silhouette.',
    groups: ['shape', 'heightfield', 'falloff'],
    icon: 'stage-shape',
    id: 'form',
    label: 'Form',
  }),
  Object.freeze({
    description: 'Noise, planar cuts, fractures, strata, and column structure.',
    groups: ['noise', 'warp', 'cuts', 'facet', 'cracks', 'strata', 'columns'],
    icon: 'stage-detail',
    id: 'detail',
    label: 'Detail',
  }),
  Object.freeze({
    description: 'Baked first-party color zones and ambient occlusion.',
    groups: ['surface'],
    icon: 'stage-surface',
    id: 'surface',
    label: 'Surface',
  }),
  Object.freeze({
    description: 'Preview and export mesh quality, normals, and LOD output.',
    groups: ['meshing'],
    icon: 'stage-export',
    id: 'output',
    label: 'Output',
  }),
]);
const SOURCE_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Bounded deformation of the selected official catalog GLB.',
    icon: 'stage-shape',
    id: 'form',
    label: 'Variation',
  }),
  Object.freeze({
    description: 'Directly reshape the decoded GLB vertices with a falloff brush.',
    icon: 'stage-detail',
    id: 'sculpt',
    label: 'Sculpt',
  }),
  Object.freeze({
    description: 'The same editable surface stack used by procedural rocks.',
    icon: 'stage-surface',
    id: 'surface',
    label: 'Surface',
  }),
]);
const CATALOG_SCULPT_TOOLS = Object.freeze([
  Object.freeze({ label: 'Grab / move', value: 'grab' }),
  Object.freeze({ label: 'Inflate', value: 'inflate' }),
  Object.freeze({ label: 'Deflate', value: 'deflate' }),
  Object.freeze({ label: 'Smooth', value: 'smooth' }),
  Object.freeze({ label: 'Flatten', value: 'flatten' }),
]);

function editablePiece(document) {
  return document.pieces.find((piece) => !isRockHelperPiece(piece)) ?? document.pieces[0];
}

function fieldTarget(document, field) {
  return field.group === 'surface' || field.group === 'meshing'
    ? document
    : editablePiece(document);
}

function fieldValue(document, field) {
  return fieldTarget(document, field)?.[field.group]?.[field.key];
}

function disabledReason(document, field) {
  const group = fieldTarget(document, field)?.[field.group];
  if (!group) return 'This setting is unavailable for the current piece.';
  if (field.key !== 'enabled' && typeof group.enabled === 'boolean' && !group.enabled) {
    return 'Turn this generator stage on first.';
  }
  if (field.group === 'heightfield' && editablePiece(document).shape.type !== 'heightfield') {
    return 'Choose Heightfield as the base shape to use these settings.';
  }
  if (field.group === 'shape') {
    if (field.key === 'capsuleLength' && group.type !== 'capsule') return 'Capsule shapes only.';
    if (field.key === 'cornerRadius' && !['box', 'sketch'].includes(group.type)) {
      return 'Box and sketch shapes only.';
    }
  }
  return false;
}

function TopBar({ actions, engine, navigationMode, onNavigationMode, state }) {
  function promptName(prompt, initial = state.document.name) {
    return window.prompt(prompt, initial)?.trim() ?? '';
  }

  function saveAs() {
    const name = promptName('Save this rock as…');
    if (name && actions.saveLocalAs(name)) toast(`Saved “${name}”.`, { tone: 'success' });
  }

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) toast('Rock document imported.', { tone: 'success' });
    else toast(result.error, { tone: 'danger' });
  }

  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
        { icon: 'home', label: 'New / Open…', onSelect: () => actions.setHomeOpen(true) },
        {
          label: 'Rename…',
          onSelect: () => {
            const name = promptName('Rename this rock…');
            if (name) actions.setName(name);
          },
        },
        { separator: true },
        {
          id: state.selectedLocalId ? 'update-local' : 'save-local',
          icon: 'save',
          label: 'Save',
          onSelect: state.selectedLocalId ? actions.saveLocal : saveAs,
        },
        { id: 'save-local-as', label: 'Save As…', onSelect: saveAs },
        {
          id: 'delete-local',
          danger: true,
          disabled: !state.selectedLocalId,
          icon: 'trash',
          label: 'Delete Saved Version…',
          onSelect: () => {
            if (window.confirm('Delete this local save? The open document will remain available.')) {
              actions.deleteLocal();
            }
          },
        },
        { separator: true },
        { label: 'Import Document JSON…', onSelect: () => { void importJson(); } },
        { icon: 'download', label: 'Export Document JSON', onSelect: actions.exportJson },
        {
          id: 'export-glb',
          disabled: state.exporting,
          icon: 'download',
          label: state.exporting ? 'Building GLB…' : 'Export GLB…',
          onSelect: actions.exportGlb,
        },
        { separator: true },
        {
          danger: true,
          icon: 'reset',
          label: 'Reset Editor…',
          onSelect: () => {
            if (window.confirm('Reset this editor to a new default rock? Unsaved changes will be lost.')) {
              actions.resetLab();
            }
          },
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { disabled: !state.canUndo, icon: 'undo', label: 'Undo', onSelect: actions.undo, shortcut: '⌘Z' },
        { disabled: !state.canRedo, icon: 'redo', label: 'Redo', onSelect: actions.redo, shortcut: '⇧⌘Z' },
        { separator: true },
        {
          disabled: (state.document.reference?.meshEdits?.length ?? 0) === 0,
          icon: 'reset',
          label: 'Clear Sculpt Edits',
          onSelect: actions.clearCatalogMeshEdits,
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        ...['rotate', 'pan', 'zoom'].map((mode) => ({
          checked: navigationMode === mode,
          label: `${mode[0].toUpperCase()}${mode.slice(1)} navigation`,
          onSelect: () => onNavigationMode(mode),
        })),
        { separator: true },
        { icon: 'reset', label: 'Reset Camera', onSelect: engine.resetCamera, shortcut: 'C' },
      ],
    },
  ];

  return (
    <LabEditorHeader className="rg-topbar" menus={menus}>
        <BrandLockup
          labName="Rock & Cliff Generation"
          onLabNameClick={() => actions.setHomeOpen(true)}
        />
        <span
          className="rg-title"
          data-testid="document-title"
          title={state.document.name}
        >
          {state.document.name}{state.dirty && <span className="rg-dirty">●</span>}
        </span>
        <span className="rg-topbar-spacer" />
        <RendererToggle supportedKinds={['webgpu', 'webgl']} />
    </LabEditorHeader>
  );
}

function RockHome({ actions, state }) {
  const [catalogQuery, setCatalogQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [limit, setLimit] = useState(72);
  const [savedId, setSavedId] = useState(state.selectedLocalId ?? '');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalogError, setCatalogError] = useState('');
  const matches = useMemo(
    () => searchRockVariationCatalog({ family, text: catalogQuery }),
    [catalogQuery, family, catalogRevision],
  );
  useEffect(() => {
    let active = true;
    loadRockVariationCatalog().then(() => {
      if (active) setCatalogRevision((value) => value + 1);
    }).catch((error) => {
      if (active) setCatalogError(error.message);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { setLimit(72); }, [catalogQuery, family]);
  const savedOptions = state.library.length
    ? state.library.map((entry) => ({
      label: `${entry.name} — ${new Date(entry.updatedAt).toLocaleDateString()}`,
      value: entry.id,
    }))
    : [{ disabled: true, label: 'No saved rocks yet', value: '' }];
  const currentThumbnail = ROCK_PRESET_THUMBNAILS[state.document.preset]
    ?? ROCK_PRESET_THUMBNAILS.boulder;

  return (
    <>
    <toonlab-site-header active="labs" />
    <main className="rg-home tk" data-testid="rock-home-screen">
      <div className="rg-home__content">
        <section className="rg-home__hero">
          <div className="rg-home__hero-copy">
            <span className="rg-home__eyebrow">Rock &amp; Cliff Generation · First-party source geometry</span>
            <h1>Shape production-ready stone.</h1>
            <p>
              Start with a designed formation or load any of ToonLab’s
              {` ${ROCK_VARIATION_CATALOG.length || 480}`} Gallery rock GLBs as the source for a bounded variation.
              Every result remains deterministic and ready for runtime JSON or GLB export.
            </p>
            <div className="rg-home__hero-tags" aria-label="Rock generation capabilities">
              <span>Editable topology</span>
              <span>Deterministic variations</span>
              <span>Runtime GLB + JSON</span>
            </div>
          </div>
          <button
            className="rg-home__resume"
            data-testid="home-continue"
            onClick={() => actions.setHomeOpen(false)}
            type="button"
          >
            <img alt="" src={currentThumbnail} />
            <span className="rg-home__resume-shade" />
            <span className="rg-home__resume-copy">
              <small>Current editable draft</small>
              <strong>{state.document.name}</strong>
              <span>Continue in the rock editor <Icon name="play" /></span>
            </span>
          </button>
        </section>

        {state.library.length > 0 ? (
          <section className="rg-home__section rg-home__saved-section">
            <div className="rg-home__section-title">
              <div>
                <span className="rg-home__section-kicker">Your library</span>
                <h2>Saved projects</h2>
                <p>Search and reopen an editable local rock document.</p>
              </div>
              <strong>{state.library.length} saved</strong>
            </div>
            <div className="rg-home__saved">
              <SearchSelect
                onChange={setSavedId}
                options={savedOptions}
                testId="home-saved-search"
                value={savedId}
              />
              <Button
                disabled={!savedId}
                kind="primary"
                onClick={() => { if (actions.loadLocal(savedId)) actions.setHomeOpen(false); }}
                testId="home-open-saved"
              >
                Open project
              </Button>
            </div>
          </section>
        ) : (
          <div className="rg-home__empty-library">
            <Icon name="stage-export" />
            <div>
              <strong>No saved projects yet</strong>
              <span>Use Save As in the editor and your rocks will appear here.</span>
            </div>
          </div>
        )}

        <section className="rg-home__section">
          <div className="rg-home__section-title">
            <div>
              <span className="rg-home__section-kicker">Procedural generation</span>
              <h2>Generate without a physical template</h2>
              <p>Choose a procedural shape preset, then edit every generator stage.</p>
            </div>
            <strong>{getRockgenPresetOptions().length} presets</strong>
          </div>
          <div className="rg-home__preset-grid">
            {getRockgenPresetOptions().map((entry) => (
              <button
                key={entry.value}
                className="rg-home__preset-card"
                type="button"
                onClick={() => { actions.applyPreset(entry.value); actions.setHomeOpen(false); }}
              >
                <img
                  alt={`${entry.label} procedural rock preview`}
                  loading="lazy"
                  src={ROCK_PRESET_THUMBNAILS[entry.value] ?? ROCK_PRESET_THUMBNAILS.boulder}
                />
                <span className="rg-home__card-copy">
                  <strong>{entry.label}</strong>
                  <small>Editable procedural foundation</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rg-home__section rg-home__catalog-section">
        <div className="rg-home__section-title">
          <div>
            <span className="rg-home__section-kicker">Template-based procedural generation</span>
            <h2>Stylized rock catalog</h2>
            <p>Choose one of 480 physical rock templates as the starting mesh, then procedurally reshape and finish it in the editor.</p>
          </div>
          <strong data-testid="catalog-result-count">{matches.length} matches</strong>
        </div>
        <div className="rg-home__filters">
          <input
            aria-label="Search the rock catalog"
            className="tk-text-field"
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Search by template ID, file, family, geology, or tag…"
            type="search"
            value={catalogQuery}
          />
          <Select
            onChange={setFamily}
            options={[{
              label: `All ${ROCK_VARIATION_FAMILIES.length} families`,
              value: 'all',
            }, ...ROCK_VARIATION_FAMILIES]}
            testId="catalog-family-filter"
            value={family}
          />
        </div>
        <div className="rg-home__catalog-grid" data-testid="variation-catalog">
          {catalogError && <p role="alert">Gallery unavailable: {catalogError}</p>}
          {matches.slice(0, limit).map((entry) => (
            <button
              key={entry.id}
              className="rg-home__catalog-card"
              data-family={entry.familyId}
              data-geology={entry.geology ?? 'unclassified'}
              onClick={() => actions.startCatalogVariation(entry.id)}
              title={`${entry.label} · ${entry.file} · ${entry.geology ?? 'unclassified'} · ${entry.tags.join(', ')}`}
              type="button"
            >
              <img
                alt={`${entry.label} Gallery preview`}
                loading="lazy"
                src={entry.thumbnailUrl}
              />
              <span className="rg-home__card-copy">
                <strong>{entry.label}</strong>
                <small>{entry.variationId}</small>
                <small>{entry.familyLabel} · {entry.geology ?? 'unclassified'}</small>
              </span>
            </button>
          ))}
        </div>
        {matches.length > limit && (
          <Button kind="secondary" onClick={() => setLimit(limit + 72)} testId="catalog-more">
            Show more ({matches.length - limit} remaining)
          </Button>
        )}
        </section>
      </div>
    </main>
    </>
  );
}

function SectionRail({ active, onChange, sourceMesh = false }) {
  const sections = sourceMesh ? SOURCE_SECTIONS : SECTIONS;
  return (
    <nav className="rg-rail tk" data-testid="section-rail">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className="rg-rail-stage"
          data-active={active === section.id}
          data-testid={`section-${section.id}`}
          onClick={() => onChange(section.id)}
          title={`${section.label} — ${section.description}`}
        >
          <Icon name={section.icon} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function GeneratorControls({ actions, state }) {
  const presets = getRockgenPresetOptions();
  const presetValue = state.document.preset ?? 'custom';
  const presetOptions = state.document.preset === null
    ? [{ disabled: true, label: 'Custom document', value: 'custom' }, ...presets]
    : presets;
  const styles = getRockgenStyleOptions();
  return (
    <div className="rg-generator-controls">
      <PresetRowShell label="Preset" title="Switching presets starts a new deterministic procedural document.">
        <Select
          onChange={(value) => { if (value !== 'custom') actions.applyPreset(value); }}
          options={presetOptions}
          testId="preset-select"
          value={presetValue}
        />
      </PresetRowShell>
      <div className="rg-quick-field">
        <span>Style</span>
        <Select
          onChange={actions.applyStyle}
          options={styles}
          testId="style-select"
          value={state.document.style}
        />
      </div>
      <div className="rg-quick-field">
        <span>Seed</span>
        <div className="rg-quick-field__row">
          <TextField
            key={state.document.seed}
            onCommit={actions.setSeed}
            testId="seed-input"
            value={String(state.document.seed)}
          />
          <IconButton icon="dice" label="Randomize seed" onClick={actions.randomizeSeed} />
        </div>
      </div>
      <div className="rg-quick-field">
        <span>Preview resolution</span>
        <Select
          onChange={actions.setResolution}
          options={ROCK_GENERATION_PREVIEW_RESOLUTIONS}
          testId="resolution-select"
          value={state.document.meshing.previewResolution}
        />
      </div>
    </div>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = SECTIONS.find((entry) => entry.id === sectionId) ?? SECTIONS[0];
  return (
    <aside className="rg-inspector tk" data-testid="inspector">
      <GeneratorControls actions={actions} state={state} />
      <div className="rg-inspector-divider" />
      <h2>{section.label}</h2>
      <p>{section.description}</p>
      {section.groups.map((groupId) => (
        <SchemaGroup
          key={groupId}
          fields={ROCKGEN_SETTING_FIELD_SCHEMA[groupId]}
          getValue={(field) => fieldValue(state.document, field)}
          group={GROUPS[groupId]}
          fieldFilter={(field) => groupId !== 'surface' || !CATALOG_PBR_FIELD_KEYS.has(field.key)}
          isDisabled={(field) => disabledReason(state.document, field)}
          onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
        />
      ))}
    </aside>
  );
}

function CatalogSourceInspector({ actions, entry, onSculptChange, sculpt, sectionId, state }) {
  const strength = Math.round((state.document.reference?.variation ?? 0) * 100);
  const storedTopFinish = state.document.reference?.topFinish ?? 'source';
  const topFinish = storedTopFinish === 'source' ? 'bare' : storedTopFinish;
  const finishOptions = topFinish === 'custom'
    ? [...CATALOG_TOP_FINISH_OPTIONS, { disabled: true, label: 'Custom surface', value: 'custom' }]
    : CATALOG_TOP_FINISH_OPTIONS;
  const surfacePreset = catalogSurfacePresetValue(state.document);
  const surfacePresetOptions = surfacePreset === 'custom'
    ? [...CATALOG_SURFACE_PRESET_OPTIONS, { disabled: true, label: 'Custom', value: 'custom' }]
    : CATALOG_SURFACE_PRESET_OPTIONS;
  const usesAuthoredGlbSurface = state.document.style === 'call_me_sensei'
    || state.document.reference?.surfaceMode === 'source';

  if (sectionId === 'surface') {
    return (
      <aside className="rg-inspector tk" data-testid="catalog-surface-inspector">
        <div className="rg-source-card">
          <img alt={`${entry.label} catalog source`} src={entry.thumbnailUrl} />
          <div>
            <span>Editable GLB surface</span>
            <strong>{entry.label}</strong>
            <small>Geometry and UVs stay unchanged</small>
          </div>
        </div>
        <h2>Surface &amp; top finish</h2>
        <p>
          Keep the generated GLB material, select a real Texture Lab PBR map set, or bake the procedural
          surface stack onto this GLB. Top finish and weathering layers remain independent and exportable.
        </p>
        <div className="rg-quick-field">
          <span>Top finish</span>
          <Select
            onChange={actions.applyCatalogTopFinish}
            options={finishOptions}
            testId="catalog-top-finish"
            value={topFinish}
          />
        </div>
        <div className="rg-quick-field">
          <span>Surface preset</span>
          <Select
            onChange={actions.applyCatalogSurfacePreset}
            options={surfacePresetOptions}
            testId="catalog-surface-preset"
            value={surfacePreset}
          />
        </div>
        <div className="rg-inspector-divider" />
        <SchemaGroup
          fieldFilter={(field) => CATALOG_PBR_FIELD_KEYS.has(field.key)}
          fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
          getValue={(field) => fieldValue(state.document, field)}
          group={{
            ...GROUPS.surface,
            description: 'Tileable albedo, normal, and roughness maps generated from a Texture Lab material recipe.',
            label: 'PBR texture maps',
          }}
          isDisabled={(field) => (
            field.key !== 'pbrTexturePreset' && state.document.surface.pbrTexturePreset === 'none'
              ? 'Select a texture map first.'
              : false
          )}
          onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
        />
        <div className="rg-grass-preview" data-testid="catalog-grass-preview">
          <div className="rg-grass-preview__header">
            <div>
              <strong>Preview meadow grass</strong>
              <span>Surface-following Call Me Sensei clumps</span>
            </div>
            <Toggle
              checked={state.grassPreview.enabled}
              onChange={(enabled) => actions.setCatalogGrassPreview({ enabled })}
              testId="catalog-grass-preview-toggle"
            />
          </div>
          <p>
            Preview only. Clumps plant on actual upward-facing triangles and sample the rock beneath
            them, so grass follows the GLB, top finish, vertex colors, and selected PBR texture.
          </p>
          <div className="rg-grass-preview__controls">
            {[
              ['density', 'Density', 0, 240, 1, (value) => `${Math.round(value)} / m²`],
              ['coverage', 'Coverage', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['bladeHeight', 'Blade height', 0.02, 0.5, 0.01, (value) => `${value.toFixed(2)} m`],
              ['heightStart', 'Top height start', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['slopeStart', 'Upward slope', 0, 1, 0.01, (value) => value.toFixed(2)],
              ['spacing', 'Minimum spacing', 0, 0.4, 0.005, (value) => `${value.toFixed(3)} m`],
              ['uprightness', 'Uprightness', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['colorAdaptation', 'Surface color adaptation', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['windStrength', 'Wind strength', 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`],
              ['maxClumps', 'Clump limit', 20, 1200, 20, (value) => Math.round(value).toLocaleString()],
            ].map(([key, label, min, max, step, format]) => (
              <label key={key}>
                <span>{label} <strong>{format(state.grassPreview[key])}</strong></span>
                <input
                  aria-label={`Grass preview ${label.toLowerCase()}`}
                  disabled={!state.grassPreview.enabled}
                  max={max}
                  min={min}
                  onChange={(event) => actions.setCatalogGrassPreview({ [key]: Number(event.target.value) })}
                  step={step}
                  type="range"
                  value={state.grassPreview[key]}
                />
              </label>
            ))}
          </div>
          <small>
            {state.grassPreviewStats.clumps.toLocaleString()} clumps · {state.grassPreviewStats.blades.toLocaleString()} blades · excluded from GLB export
          </small>
        </div>
        {usesAuthoredGlbSurface ? (
          <>
            <SchemaGroup
              fieldFilter={(field) => CATALOG_TOP_FIELD_KEYS.has(field.key)}
              fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
              getValue={(field) => fieldValue(state.document, field)}
              group={{
                ...GROUPS.surface,
                description: 'Masks grass, sand, snow, or another tint to upward-facing cap vertices only.',
                label: 'Top finish mask',
              }}
              isDisabled={(field) => disabledReason(state.document, field)}
              onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
            />
            <SchemaGroup
              fieldFilter={(field) => CATALOG_WEATHERING_FIELD_KEYS.has(field.key)}
              fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
              getValue={(field) => fieldValue(state.document, field)}
              group={{
                ...GROUPS.surface,
                description: 'Optional mineral veins, rain stains, moss, and lichen layered over the authored material.',
                label: 'Weathering overlays',
              }}
              isDisabled={(field) => disabledReason(state.document, field)}
              onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
            />
          </>
        ) : (
          <SchemaGroup
            fieldFilter={(field) => !CATALOG_PBR_FIELD_KEYS.has(field.key)}
            fields={ROCKGEN_SETTING_FIELD_SCHEMA.surface}
            getValue={(field) => fieldValue(state.document, field)}
            group={GROUPS.surface}
            isDisabled={(field) => disabledReason(state.document, field)}
            onChange={(field, value, interaction) => actions.setField(field, value, interaction)}
          />
        )}
      </aside>
    );
  }

  if (sectionId === 'sculpt') {
    const editCount = state.document.reference?.meshEdits?.length ?? 0;
    return (
      <aside className="rg-inspector tk" data-testid="catalog-sculpt-inspector">
        <div className="rg-source-card">
          <img alt={`${entry.label} editable mesh`} src={entry.thumbnailUrl} />
          <div>
            <span>Decoded editable mesh</span>
            <strong>{entry.label}</strong>
            <small>{editCount} saved sculpt edit{editCount === 1 ? '' : 's'}</small>
          </div>
        </div>
        <h2>Sculpt mesh</h2>
        <p>
          Drag directly on the rock to reshape its existing vertices. These edits preserve topology,
          UVs, and material slots, and are included in local saves, JSON, undo, and GLB export.
        </p>
        <div className="rg-sculpt-controls">
          <label>
            <span>Tool</span>
            <Select
              onChange={(tool) => onSculptChange({ tool })}
              options={CATALOG_SCULPT_TOOLS}
              testId="catalog-sculpt-tool"
              value={sculpt.tool}
            />
          </label>
          <label>
            <span>Brush radius <strong>{sculpt.radius.toFixed(2)} m</strong></span>
            <input
              aria-label="Sculpt brush radius"
              max="3"
              min="0.05"
              onChange={(event) => onSculptChange({ radius: Number(event.target.value) })}
              step="0.05"
              type="range"
              value={sculpt.radius}
            />
          </label>
          <label>
            <span>Strength <strong>{Math.round(sculpt.strength * 100)}%</strong></span>
            <input
              aria-label="Sculpt brush strength"
              max="1"
              min="0.05"
              onChange={(event) => onSculptChange({ strength: Number(event.target.value) })}
              step="0.05"
              type="range"
              value={sculpt.strength}
            />
          </label>
          <Button
            disabled={editCount === 0}
            icon="reset"
            kind="secondary"
            onClick={actions.clearCatalogMeshEdits}
            testId="catalog-sculpt-reset"
          >
            Reset sculpt edits
          </Button>
        </div>
        <div className="rg-inspector-divider" />
        <p className="rg-source-note">
          Left-drag sculpts. Right-drag pans and the wheel zooms. Grab moves the brushed area in the
          camera plane; the other tools paint repeated deformation stamps.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rg-inspector tk" data-testid="catalog-source-inspector">
      <div className="rg-source-card">
        <img alt={`${entry.label} catalog source`} src={entry.thumbnailUrl} />
        <div>
          <span>Official Gallery GLB source</span>
          <strong>{entry.label}</strong>
          <small>{entry.variationId} · {entry.geology ?? 'unclassified'}</small>
        </div>
      </div>
      <h2>Source-mesh variation</h2>
      <p>
        This starts from the exact first-party ToonLab GLB shown in the Gallery and decodes it before editing.
        Variation deforms the decoded vertices while preserving topology and materials.
      </p>
      <div className="rg-source-controls">
        <label>
          <span>Variation strength <strong>{strength}%</strong></span>
          <input
            aria-label="Catalog variation strength"
            max="100"
            min="0"
            onChange={(event) => actions.setCatalogVariationStrength(Number(event.target.value) / 100)}
            step="1"
            type="range"
            value={strength}
          />
        </label>
        <Button kind="secondary" onClick={() => actions.setCatalogVariationStrength(0)}>
          Show exact source
        </Button>
        <Button icon="dice" kind="primary" onClick={actions.regenerateCatalogVariation}>
          New variation
        </Button>
        <span className="rg-source-origin">Gallery release · {entry.sourceVersion}</span>
      </div>
      <div className="rg-inspector-divider" />
      <p className="rg-source-note">
        SDF shape, cut, and noise controls apply only to procedural presets. They are hidden here because
        replacing this mesh with a preset would no longer be a variation of the selected asset. Surface edits
        and sculpt edits remain available because they work directly on the decoded GLB.
      </p>
    </aside>
  );
}

function StatusBar({ state }) {
  const stats = state.meshStats;
  return (
    <footer className="rg-status tk" data-testid="status-bar">
      <span>{state.status}</span>
      <span className="rg-status-spacer" />
      <span data-testid="mesh-stats">
        {stats.triangles.toLocaleString()} tris · {stats.vertices.toLocaleString()} vertices · {stats.bounds} · {stats.milliseconds} ms
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('form');
  const [navigationMode, setNavigationMode] = useState('rotate');
  const [sculpt, setSculpt] = useState({ radius: 0.5, strength: 0.35, tool: 'grab' });

  useEffect(() => {
    document.title = `${state.document.name} — Rock & Cliff Generation`;
  }, [state.document.name]);

  const homeRoute = !isLabEditorLocation({ directParams: ['rockPreset', 'rockSeed', 'rockRes'] });
  useEffect(() => {
    syncLabHomeRoute(state.view.home, { directParams: ['rockPreset', 'rockSeed', 'rockRes'] });
  }, [state.view.home]);

  const catalogEntry = getRockVariationCatalogEntry(state.catalogSourceId);
  const sculptEnabled = Boolean(catalogEntry) && sectionId === 'sculpt' && !homeRoute;

  useEffect(() => {
    engine?.setSculptOptions({ ...sculpt, enabled: sculptEnabled });
  }, [engine, sculpt, sculptEnabled]);

  useEffect(() => {
    if (catalogEntry && !SOURCE_SECTIONS.some((section) => section.id === sectionId)) {
      setSectionId('form');
    }
  }, [catalogEntry, sectionId]);

  if (homeRoute) return <RockHome actions={actions} state={state} />;

  return (
    <div className="rg-root tk">
      <TopBar
        actions={actions}
        engine={engine}
        navigationMode={navigationMode}
        onNavigationMode={(mode) => {
          setNavigationMode(mode);
          engine.setNavigationMode(mode);
        }}
        state={state}
      />
      <SectionRail
        active={sectionId}
        onChange={setSectionId}
        sourceMesh={Boolean(catalogEntry)}
      />
      {catalogEntry
        ? (
          <CatalogSourceInspector
            actions={actions}
            entry={catalogEntry}
            onSculptChange={(patch) => setSculpt((current) => ({ ...current, ...patch }))}
            sculpt={sculpt}
            sectionId={sectionId}
            state={state}
          />
        )
        : <Inspector actions={actions} sectionId={sectionId} state={state} />}
      <StatusBar state={state} />
      <PreviewBar
        hint={sculptEnabled
          ? 'Left-drag sculpt · wheel zoom · right-drag pan'
          : 'Left-drag rotate · wheel zoom · right-drag pan'}
        title={sculptEnabled
          ? 'Sculpt changes are saved into the editable mesh document.'
          : 'Camera and stage are preview-only. Preset, style, seed, geometry, surface, and meshing settings are saved in the document.'}
      >
        <span className="rg-preview-meta">
          {catalogEntry ? 'Official Gallery GLB variation' : 'First-party procedural mesh'}
        </span>
        <SegmentedControl
          onChange={(mode) => {
            setNavigationMode(mode);
            engine.setNavigationMode(mode);
          }}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="navigation-mode"
          value={navigationMode}
        />
        <IconButton icon="reset" label="Reset camera (C)" onClick={engine.resetCamera} />
      </PreviewBar>
      <ToastStack />
    </div>
  );
}
