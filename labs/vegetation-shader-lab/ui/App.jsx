// Vegetation Shader Lab uses the same production lab shell as Grass Lab.
// The document is one IP-wide profile; the amber bar owns every scene-only
// fixture used to prove the same shader works across colors and environments.

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
import {
  getVegetationShaderPresetOptions,
  VEGETATION_SHADER_FIELD_SCHEMA,
  VEGETATION_SHADER_SETTING_GROUPS,
} from '../../../src/vegetation/vegetationShaders.js';
import {
  VEGETATION_PREVIEW_MODES,
  VEGETATION_PREVIEW_PALETTES,
} from './engine.js';

const SECTION_ICONS = Object.freeze({
  bark: 'stage-wood',
  flower: 'stage-flowers',
  foliage: 'stage-leaves',
  grass: 'stage-leaves',
  lighting: 'stage-look',
  stem: 'stage-shape',
  thinSurface: 'stage-leaves',
  weatherResponse: 'stage-animation',
});

const SECTION_LABELS = Object.freeze({
  bark: 'Bark',
  flower: 'Flower',
  foliage: 'Foliage',
  grass: 'Grass',
  lighting: 'Shared',
  stem: 'Stem',
  thinSurface: 'Thin',
  weatherResponse: 'Weather',
});

function PresetRow({ actions, state }) {
  const localIds = new Set(state.localPresets.map((entry) => entry.id));
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...getVegetationShaderPresetOptions().map((entry) => ({
      label: localIds.has(entry.id) ? `${entry.label} · saved` : entry.label,
      value: entry.value ?? entry.id,
    })),
  ];
  const isLocal = localIds.has(state.presetId);
  return (
    <PresetRowShell title="One complete IP-wide profile. Switching replaces every semantic role setting.">
      <Select
        onChange={(id) => { if (id) actions.applyPreset(id); }}
        options={options}
        testId="preset-select"
        value={state.presetId ?? ''}
      />
      {isLocal && (
        <IconButton icon="trash" label="Delete this saved profile" onClick={() => actions.deletePreset(state.presetId)} />
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
    else for (const error of result.errors ?? ['Could not import the profile.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={310}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Vegetation style name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
              else for (const error of result.errors ?? ['Could not save the profile.']) {
                toast(error, { tone: 'danger' });
              }
            }}
          >
            Save
          </Button>
        </div>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to profile
          </Button>
        )}
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(
              actions.exportDocument(),
              `${state.name.replace(/\s+/g, '-').toLowerCase() || 'vegetation'}.vegetation-shader.json`,
              'application/json',
            );
            onClose();
          }}
        >
          Export profile JSON
        </Button>
        <Button kind="secondary" onClick={importJson}>Import profile JSON…</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  return (
    <header className="gr-topbar tk">
      <BrandLockup labName="Vegetation Shader Lab" />
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
      {menuAnchor && (
        <DocumentMenu
          actions={actions}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          state={state}
        />
      )}
    </header>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {VEGETATION_SHADER_SETTING_GROUPS.map((section) => (
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
          <span>{SECTION_LABELS[section.id] ?? section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = VEGETATION_SHADER_SETTING_GROUPS
    .find((entry) => entry.id === sectionId) ?? VEGETATION_SHADER_SETTING_GROUPS[0];
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <SchemaGroup
        fields={VEGETATION_SHADER_FIELD_SCHEMA[section.id]}
        getValue={(field) => state.settings[section.id][field.key]}
        group={section}
        onChange={(field, value) => actions.setSetting(section.id, field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function VegetationPreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar
      hint="Left-drag rotate · wheel zoom · right-drag pan"
      title="Preview only — view, albedo palette, wind, and current weather are never saved into the shader profile."
    >
      <SegmentedControl
        onChange={(viewMode) => actions.setView({ viewMode })}
        options={VEGETATION_PREVIEW_MODES.map((entry) => ({ label: entry.label, value: entry.id }))}
        testId="preview-mode"
        value={state.view.viewMode}
      />
      <span className="gr-stagebar-select--debug" title="Material albedo fixture. 10 colors proves one shader profile is reused unchanged.">
        <Select
          onChange={(palette) => actions.setView({ palette })}
          options={VEGETATION_PREVIEW_PALETTES.map((entry) => ({ label: entry.label, value: entry.id }))}
          testId="preview-palette"
          value={state.view.palette}
        />
      </span>
      <span className="tk-previewbar-slider" title="Scene wind amount; response shape belongs to the profile.">
        <span>Wind</span>
        <Slider max={0.5} min={0} onChange={(windStrength) => actions.setView({ windStrength })} step={0.01} value={state.view.windStrength} />
      </span>
      <PreviewToggle
        checked={state.view.wetness > 0}
        label="Wet"
        onChange={(checked) => actions.setView({ wetness: checked ? 0.8 : 0 })}
        testId="preview-wet"
        title="Current scene wetness; only wetness response belongs to the profile."
      />
      <PreviewToggle
        checked={state.view.snowCover > 0}
        label="Snow"
        onChange={(checked) => actions.setView({ snowCover: checked ? 0.8 : 0 })}
        testId="preview-snow"
        title="Current scene snow coverage; only snow response belongs to the profile."
      />
      <IconButton icon="reset" label="Reset camera (C)" onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const { applied, matched, unsupported, writes } = state.coverage;
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">{state.status}</span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta" data-testid="contract-coverage">
        {matched} materials · {applied} applied · {writes} writes · {unsupported} unsupported
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('lighting');

  useEffect(() => { document.title = `${state.name} — Vegetation Shader Lab`; }, [state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <VegetationPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
