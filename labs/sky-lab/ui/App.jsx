import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  Icon,
  IconButton,
  LabTimeOfDayControl,
  Popover,
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SegmentedControl,
  Select,
  TextField,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import {
  SKY_SHADER_FIELD_COUNT,
  SKY_SHADER_FIELD_SCHEMA,
  SKY_SHADER_SETTING_GROUPS,
  getSkyShaderPresetOptions,
} from '../../../src/sky/skyShaderSettings.js';
import { getWeatherPresetOptions } from '../../../src/weather/weatherPresets.js';

const SECTION_ICONS = Object.freeze({
  gradient: 'stage-look',
  moon: 'stage-shape',
  stars: 'stage-shape',
  sun: 'stage-look',
});

const CONDITION_OPTIONS = Object.freeze([
  Object.freeze({ label: 'No condition · authored', value: 'authored' }),
  ...getWeatherPresetOptions().map((entry) => Object.freeze({
    label: entry.label,
    value: entry.id,
  })),
]);

const CLOUD_CONTEXT_OPTIONS = Object.freeze([
  Object.freeze({ label: 'Call Me Sensei clouds', value: 'call_me_sensei' }),
  Object.freeze({ label: 'Neutral review clouds', value: 'neutral_review' }),
  Object.freeze({ label: 'Hide clouds', value: 'hidden' }),
]);

function conditionLabel(id) {
  return CONDITION_OPTIONS.find((entry) => entry.value === id)?.label ?? id;
}

function styleOptions(state) {
  const localIds = new Set(state.localPresets.map((entry) => entry.id));
  return getSkyShaderPresetOptions()
    .filter((entry) => !entry.id.startsWith('local_') || localIds.has(entry.id))
    .sort((a, b) => {
      if (a.id === 'call_me_sensei') return -1;
      if (b.id === 'call_me_sensei') return 1;
      return a.label.localeCompare(b.label);
    })
    .map((entry) => ({
      label: localIds.has(entry.id) ? `${entry.label} · saved` : entry.label,
      value: entry.value,
    }));
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not import the sky shader.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={300}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Sky shader name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
              else for (const error of result.errors ?? ['Could not save the sky shader.']) {
                toast(error, { tone: 'danger' });
              }
            }}
          >
            Save
          </Button>
        </div>
        {state.presetId && state.presetDirty && (
          <Button
            kind="secondary"
            onClick={() => {
              actions.applyPreset(state.presetId);
              onClose();
            }}
          >
            Revert to style
          </Button>
        )}
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(
              actions.exportDocument(),
              `${state.name.replace(/\s+/g, '-').toLowerCase() || 'sky'}.sky-shader.json`,
              'application/json',
            );
            onClose();
          }}
        >
          Export shader JSON
        </Button>
        <Button kind="secondary" onClick={importJson}>Import shader JSON…</Button>
        <Button
          kind="danger"
          onClick={() => {
            actions.resetLab();
            onClose();
          }}
        >
          Reset lab
        </Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  return (
    <header className="gr-topbar tk">
      <BrandLockup labName="Sky Shader Lab" />
      <button
        type="button"
        className="gr-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({
          x: event.clientX,
          y: event.clientY + 10,
        })}
      >
        {state.name}
        {state.presetDirty && <span className="gr-dirty">●</span>}
        <Icon name="chevron-down" />
      </button>
      <IconButton
        disabled={!state.canUndo}
        icon="undo"
        label="Undo (⌘Z)"
        onClick={actions.undo}
      />
      <IconButton
        disabled={!state.canRedo}
        icon="redo"
        label="Redo (⇧⌘Z)"
        onClick={actions.redo}
      />
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
      {SKY_SHADER_SETTING_GROUPS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="gr-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id] ?? 'stage-look'} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = SKY_SHADER_SETTING_GROUPS
    .find((entry) => entry.id === sectionId)
    ?? SKY_SHADER_SETTING_GROUPS[0];
  const localIds = new Set(state.localPresets.map((entry) => entry.id));
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRowShell
        label="Style"
        title="Reusable visible-sky appearance. Time, clouds, atmosphere, and weather are preview-only."
      >
        <Select
          onChange={(id) => {
            if (id) actions.applyPreset(id);
          }}
          options={styleOptions(state)}
          testId="sky-style-select"
          value={state.presetId ?? ''}
        />
        {localIds.has(state.presetId) && (
          <IconButton
            icon="trash"
            label="Delete this saved sky shader"
            onClick={() => actions.deletePreset(state.presetId)}
          />
        )}
      </PresetRowShell>
      <div className="sky-boundary-note">
        <strong>Sky shader only.</strong>
        {' '}These values own the P18 sky gradient, visible horizon, sun/moon
        appearance, and stars. Clouds, fog, current time, celestial direction,
        lighting energy, source assets, and camera remain separate inputs.
      </div>
      <h2 className="gr-inspector-header" data-testid="inspector-title">
        {section.label}
      </h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <SchemaGroup
        fields={SKY_SHADER_FIELD_SCHEMA[section.id]}
        getValue={(field) => state.settings[field.key]}
        group={section}
        onChange={(field, value) => actions.setSetting(field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function SkyPreviewBar({ actions, engine, state }) {
  const conditionActive = state.view.weather !== 'authored';
  return (
    <PreviewBar
      hint="Left-drag rotate · wheel zoom · right-drag pan"
      title="P18 comparison stage. Framing, cloud context, time, weather condition, particles, and source assets are preview-only."
    >
      <SegmentedControl
        onChange={(viewMode) => actions.setView({ viewMode })}
        options={[
          { label: 'Sky Focus', value: 'sky' },
          { label: 'Celestial Focus', value: 'celestial' },
          { label: 'P18 Framing', value: 'horizon' },
        ]}
        testId="sky-preview-view"
        value={state.view.viewMode}
      />
      <span
        className="gr-stagebar-select--debug"
        title="Comparison cloud style. This never enters the Sky Shader document."
      >
        <Select
          onChange={(cloudStyle) => actions.setView({ cloudStyle })}
          options={CLOUD_CONTEXT_OPTIONS}
          testId="sky-preview-cloud-style"
          value={state.view.cloudStyle}
        />
      </span>
      <span
        className="gr-stagebar-select--debug"
        title="Optional atmospheric-condition stress test. It is never saved in the Sky Shader."
      >
        <Select
          onChange={(weather) => actions.setView({
            particles: false,
            weather,
          })}
          options={CONDITION_OPTIONS}
          testId="sky-preview-condition"
          value={state.view.weather}
        />
      </span>
      <PreviewToggle
        checked={conditionActive && state.view.particles}
        disabled={!conditionActive}
        label="Particles"
        onChange={(particles) => actions.setView({ particles })}
        testId="sky-preview-particles"
        title="Show condition particles. Off by default so the visible sky remains readable."
      />
      <LabTimeOfDayControl
        autoCycle={state.view.autoCycle}
        hour={state.view.hour}
        onAutoCycleChange={actions.setPreviewAutoCycle}
        onHourChange={actions.setPreviewHour}
      />
      <IconButton
        icon="reset"
        label="Reset camera (C)"
        onClick={() => engine.resetCamera()}
      />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">
        {state.status || (state.engineReady
          ? 'Live sky shader preview ready.'
          : 'Loading P18 sky shader preview…')}
      </span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta">
        {SKY_SHADER_FIELD_COUNT} authored settings · {conditionLabel(state.view.weather)} preview
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('gradient');

  useEffect(() => {
    document.title = `${state.name} — Sky Shader Lab`;
  }, [state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail
          activeSection={sectionId}
          onSectionChange={setSectionId}
        />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <SkyPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
