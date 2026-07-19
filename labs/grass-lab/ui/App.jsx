// Grass Lab workspace — the standard redesigned-lab chrome: product-only
// rail/inspector (the grass preset), shared amber PreviewBar at the bottom
// (blade/tuft/patch/meadow planting, scene lights, walking).

import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  Icon,
  IconButton,
  Popover,
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SegmentedControl,
  Select,
  Slider,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import {
  GRASS_COLOR_PALETTES,
  getGrassPresetOptions,
  GRASS_SETTING_FIELD_SCHEMA,
  GRASS_SETTING_GROUPS,
  matchGrassColorPalette,
} from '../../../src/vegetation/stylizedGrass.js';
import { GRASS_PREVIEW_MODES } from './engine.js';

const SECTION_ICONS = Object.freeze({
  blades: 'stage-leaves',
  interaction: 'tool-move',
  lighting: 'stage-look',
  palette: 'stage-flowers',
  shadows: 'stage-wood',
  wind: 'stage-animation',
});

// Scene-owned groups (group.scene) never appear as product settings — the
// engine wires those uniforms from the preview rig, a game wires them from
// its own sun/sky/weather.
const WORKSPACE_SECTIONS = Object.freeze(
  GRASS_SETTING_GROUPS.filter((group) => !group.scene).map((group) => Object.freeze({
    description: group.description,
    id: group.id,
    label: group.label,
  })),
);

function PresetRow({ actions, state }) {
  const localIds = new Set(state.localPresets.map((entry) => entry.id));
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...getGrassPresetOptions().map((entry) => ({
      label: `${entry.label}${localIds.has(entry.id) ? ' · saved' : ''}`,
      value: entry.value ?? entry.id,
    })),
  ];
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  return (
    <PresetRowShell title="The grass preset you are editing — switching replaces every value in this panel.">
      <Select
        onChange={(id) => { if (id) actions.applyPreset(id); }}
        options={options}
        testId="preset-select"
        value={state.presetId ?? ''}
      />
      {isLocal && (
        <IconButton icon="trash" label="Delete this saved preset" onClick={() => actions.deletePreset(state.presetId)} />
      )}
    </PresetRowShell>
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not import the preset.']) toast(error, { tone: 'danger' });
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={290}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Grass name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
              else for (const error of result.errors ?? ['Could not save the preset.']) toast(error, { tone: 'danger' });
            }}
          >
            Save
          </Button>
        </div>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to preset
          </Button>
        )}
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(actions.exportDocument(), `${state.name.replace(/\s+/g, '-').toLowerCase() || 'grass'}.grass-preset.json`, 'application/json');
            onClose();
          }}
        >
          Export preset JSON
        </Button>
        <Button kind="secondary" onClick={importJson}>Import preset JSON…</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  return (
    <header className="gr-topbar tk">
      <BrandLockup labName="Grass Lab" />
      <button
        type="button"
        className="gr-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="gr-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <IconButton disabled={!state.canUndo} icon="undo" label="Undo (⌘Z)" onClick={() => actions.undo()} />
      <IconButton disabled={!state.canRedo} icon="redo" label="Redo (⇧⌘Z)" onClick={() => actions.redo()} />
      <span className="gr-topbar-spacer" />
      <RendererToggle />
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </header>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="gr-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id] ?? 'stage-shape'} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function grassColorCss(value) {
  return `rgb(${value.map((channel) => Math.round(channel * 255)).join(', ')})`;
}

function GrassPaletteSection({ actions, state }) {
  const active = matchGrassColorPalette(state.settings);
  return (
    <section className="tk-section gr-palette-section" data-testid="grass-palette-section">
      <div className="tk-section-title">Preset Palettes</div>
      <div className="tk-section-caption">
        Each palette is a coordinated base, tip, and shadow-tint set. Selecting
        one also changes the grass color in shadow; fine-tune Shadow Tint under Shadows.
      </div>
      <div className="gr-palette-grid">
        {GRASS_COLOR_PALETTES.map((palette) => (
          <button
            key={palette.id}
            type="button"
            aria-pressed={active?.id === palette.id}
            data-active={active?.id === palette.id}
            data-testid={`grass-palette-${palette.id}`}
            title={`${palette.description} Sets Base Color, Tip Color, and Shadow Tint together.`}
            onClick={() => actions.applyColorPalette(palette)}
          >
            <span className="gr-palette-swatches" aria-hidden="true">
              {['baseColor', 'tipColor', 'shadowTint'].map((key) => (
                <span key={key} style={{ background: grassColorCss(palette[key]) }} />
              ))}
            </span>
            <span className="gr-palette-label">{palette.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId) ?? WORKSPACE_SECTIONS[0];
  const group = GRASS_SETTING_GROUPS.find((entry) => entry.id === section.id);
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      {group?.id === 'palette' && <GrassPaletteSection actions={actions} state={state} />}
      {group && (
        <SchemaGroup
          fields={GRASS_SETTING_FIELD_SCHEMA[group.id]}
          getValue={(field) => state.settings[field.key]}
          group={group.id === 'palette' ? { ...group, label: 'Fine Tune' } : group}
          onChange={(field, value) => actions.setSetting(field.key, value)}
          showCaption={false}
        />
      )}
    </aside>
  );
}

function GrassPreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar
      hint={state.view.walkPreview
        ? 'WASD/arrows move · Shift runs · Space jumps — blades part around you'
        : 'Left-drag rotate · wheel zoom · right-drag pan'}
      title="Preview only — planting, light, weather, and interaction are never saved into your grass preset."
    >
      <SegmentedControl
        onChange={(mode) => actions.setView({ mode })}
        options={GRASS_PREVIEW_MODES.map((entry) => ({ label: entry.label, value: entry.id }))}
        testId="preview-mode"
        value={state.view.mode}
      />
      <span className="tk-previewbar-slider" title="Scene sun intensity — a preview fixture, not part of the preset.">
        <span>Sun</span>
        <Slider max={2.5} min={0} onChange={(sunIntensity) => actions.setView({ sunIntensity })} step={0.05} value={state.view.sunIntensity} />
      </span>
      <span className="tk-previewbar-slider" title="Scene ambient intensity — a preview fixture, not part of the preset.">
        <span>Amb</span>
        <Slider max={1.2} min={0} onChange={(ambientIntensity) => actions.setView({ ambientIntensity })} step={0.02} value={state.view.ambientIntensity} />
      </span>
      <span className="tk-previewbar-slider" title="Current scene wind strength — multiplied by the grass asset's Wind Response.">
        <span>Wind</span>
        <Slider max={0.6} min={0} onChange={(windStrength) => actions.setView({ windStrength })} step={0.01} value={state.view.windStrength} />
      </span>
      <PreviewToggle
        checked={state.view.cloudShadowStrength > 0}
        label="Cloud"
        onChange={(enabled) => actions.setView({ cloudShadowStrength: enabled ? 0.45 : 0 })}
        testId="cloud-shadow-preview"
        title="Current scene cloud-shadow field — preview only, not part of the grass asset."
      />
      <PreviewToggle
        checked={state.view.walkPreview}
        label="Walk"
        onChange={(walkPreview) => actions.setView({ walkPreview })}
        testId="walk-preview"
        title={WALK_PREVIEW_TITLE}
      />
      <IconButton icon="reset" label="Reset camera (C)" onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">{state.status}</span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta">
        {state.bladeCount.toLocaleString()} blades · {state.view.mode}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('blades');

  useEffect(() => { document.title = `${state.name} — Grass Lab`; }, [state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <GrassPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
