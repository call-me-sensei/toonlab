// Sky Lab uses the standard production lab shell. The inspector is the saved
// sky-system document; the amber preview bar owns deployment-only fixtures.

import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  Icon,
  IconButton,
  Popover,
  PresetRowShell,
  PreviewBar,
  RendererToggle,
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
  getSkyPresetOptions,
  SKY_QUALITY_OPTIONS,
  SKY_SETTING_FIELD_SCHEMA,
  SKY_SETTING_GROUPS,
} from '../../../src/sky/stylizedSky.js';
import { getWeatherPresetOptions } from '../../../src/weather/weatherPresets.js';

const AUTHORED_SECTIONS = Object.freeze(
  SKY_SETTING_GROUPS.filter((group) => group.id !== 'dome'),
);

const SECTION_ICONS = Object.freeze({
  clouds: 'stage-animation',
  gradient: 'stage-look',
  stars: 'stage-shape',
  sun: 'stage-look',
});

const WEATHER_OPTIONS = Object.freeze([
  Object.freeze({ label: 'Authored sky', value: 'authored' }),
  ...getWeatherPresetOptions().map((entry) => Object.freeze({
    label: entry.label,
    value: entry.id,
  })),
]);

function weatherLabel(id) {
  return WEATHER_OPTIONS.find((entry) => entry.value === id)?.label ?? id;
}

function PresetRow({ actions, state }) {
  const localIds = new Set(state.localPresets.map((entry) => entry.id));
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...getSkyPresetOptions()
      // Runtime registry entries remain valid after their browser-local
      // document is deleted; hide that lab-local id from this picker.
      .filter((entry) => !entry.id.startsWith('local_') || localIds.has(entry.id))
      .map((entry) => ({
        label: localIds.has(entry.id) ? `${entry.label} · saved` : entry.label,
        value: entry.value ?? entry.id,
      })),
  ];
  const isLocal = localIds.has(state.presetId);
  return (
    <PresetRowShell title="The complete reusable sky-system preset. Switching replaces every authored sky value.">
      <Select
        onChange={(id) => { if (id) actions.applyPreset(id); }}
        options={options}
        testId="preset-select"
        value={state.presetId ?? ''}
      />
      {isLocal && (
        <IconButton icon="trash" label="Delete this saved sky" onClick={() => actions.deletePreset(state.presetId)} />
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
    else for (const error of result.errors ?? ['Could not import the sky preset.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={300}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Sky name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
              else for (const error of result.errors ?? ['Could not save the sky preset.']) {
                toast(error, { tone: 'danger' });
              }
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
            downloadBlob(
              actions.exportDocument(),
              `${state.name.replace(/\s+/g, '-').toLowerCase() || 'sky'}.sky-preset.json`,
              'application/json',
            );
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
      <BrandLockup labName="Sky Lab" />
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
      {AUTHORED_SECTIONS.map((section) => (
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

function Inspector({ actions, sectionId, state }) {
  const section = AUTHORED_SECTIONS.find((entry) => entry.id === sectionId) ?? AUTHORED_SECTIONS[0];
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <SchemaGroup
        fields={SKY_SETTING_FIELD_SCHEMA[section.id]}
        getValue={(field) => state.settings[field.key]}
        group={section}
        onChange={(field, value) => actions.setSetting(field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function SkyPreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar
      hint="Left-drag rotate · wheel zoom · right-drag pan"
      title="Preview only — current weather, scene lights, and camera are never saved into the sky preset."
    >
      <span className="gr-stagebar-select--debug" title="Current world weather response; not part of the authored sky preset.">
        <Select
          onChange={(weather) => actions.setView({ weather })}
          options={WEATHER_OPTIONS}
          testId="preview-weather"
          value={state.view.weather}
        />
      </span>
      <span className="gr-stagebar-select--debug" title="Compile-time cloud detail for the target device; never saved into the art preset.">
        <Select
          onChange={(quality) => actions.setView({ quality })}
          options={SKY_QUALITY_OPTIONS.map((value) => ({ label: `${value[0].toUpperCase()}${value.slice(1)} quality`, value }))}
          testId="preview-quality"
          value={state.view.quality}
        />
      </span>
      <span className="tk-previewbar-slider" title="Directional-light intensity in this preview scene.">
        <span>Sun</span>
        <Slider max={2.5} min={0} onChange={(sunIntensity) => actions.setView({ sunIntensity })} step={0.05} value={state.view.sunIntensity} />
      </span>
      <span className="tk-previewbar-slider" title="Hemisphere-light intensity in this preview scene.">
        <span>Amb</span>
        <Slider max={1.2} min={0} onChange={(ambientIntensity) => actions.setView({ ambientIntensity })} step={0.02} value={state.view.ambientIntensity} />
      </span>
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
        {Object.keys(state.settings).length} authored settings · {weatherLabel(state.view.weather)} preview
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('gradient');

  useEffect(() => { document.title = `${state.name} — Sky Lab`; }, [state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <SkyPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
