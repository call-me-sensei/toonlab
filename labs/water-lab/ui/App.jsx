// Water Lab workspace: top bar, left workflow rail, one focused schema group
// in the right inspector, camera controls, stage toys, and status bar.

import { useEffect, useState } from 'react';

import {
  Button,
  Icon,
  IconButton,
  Popover,
  SegmentedControl,
  Select,
  Slider,
  toast,
  ToastStack,
  TextField,
  Toggle,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { SCENE_HUB_OPTIONS, navigateSceneHub } from '../../shared/sceneHub.js';
import { persistLabScene } from '../../shared/labParams.js';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { downloadBlob, pickFile } from '../../shared/download.js';
import {
  WATER_COLOR_TONES,
  WATER_DEBUG_MODES,
  WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
  WATER_SETTING_GROUPS,
  getWaterPresetOptions,
} from '../../../src/water/index.js';
import { WATER_LAB_STAGES } from '../engine/waterLabEngine.js';

const DEBUG_OPTIONS = Object.keys(WATER_DEBUG_MODES).map((id) => ({
  label: id === 'off' ? 'Debug: off' : `Debug: ${id}`,
  value: id,
}));

const SECTION_ICONS = Object.freeze({
  foam: 'stage-flowers',
  lighting: 'stage-look',
  quality: 'stage-export',
  ripples: 'stage-animation',
  splashes: 'tool-sculpt-add',
  stage: 'stage-pieces',
  surface: 'stage-look',
  waves: 'stage-detail',
});

const WATER_WORKSPACE_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Choose the ground and the depth, flow, and interaction gauges shown in the scene.',
    id: 'stage',
    label: 'Stage',
  }),
  ...WATER_SETTING_GROUPS.map((group) => Object.freeze({
    description: group.description,
    id: group.id,
    label: group.label,
  })),
]);

const CAMERA_MODE_OPTIONS = Object.freeze([
  Object.freeze({ label: 'Rotate', value: 'rotate' }),
  Object.freeze({ label: 'Pan', value: 'pan' }),
  Object.freeze({ label: 'Zoom', value: 'zoom' }),
]);

/** Fields a non-classic color tone forces — edits would silently snap back. */
function toneDisabledReason(settings, field) {
  const tone = WATER_COLOR_TONES[settings.colorTone];
  if (!tone || settings.colorTone === 'classic') return false;
  if (field.key in tone) return 'Color Tone overrides this — set tone to Classic to edit.';
  return false;
}

function WaterSchemaGroup({ actions, group, settings, showCaption = true }) {
  return (
    <SchemaGroup
      fields={WATER_SETTING_FIELD_SCHEMA_BY_GROUP[group.id]}
      getValue={(field) => settings[field.key]}
      group={group}
      isDisabled={(field) => toneDisabledReason(settings, field)}
      onChange={(field, value) => actions.setSetting(field.key, value)}
      showCaption={showCaption}
    />
  );
}

function PresetRow({ actions, state }) {
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...getWaterPresetOptions().map((entry) => ({ label: entry.label, value: entry.id })),
    ...state.localPresets.map((entry) => ({ label: `${entry.label} · saved`, value: entry.id })),
  ];
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  return (
    <div className="wl-preset-row">
      <Select
        onChange={(id) => { if (id) actions.applyPreset(id); }}
        options={options}
        testId="preset-select"
        value={state.presetId ?? ''}
      />
      {isLocal && (
        <IconButton
          icon="trash"
          label="Delete this saved preset"
          onClick={() => actions.deletePreset(state.presetId)}
        />
      )}
    </div>
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) {
      for (const warning of result.warnings) toast(warning, { tone: 'warning' });
      onClose();
    } else {
      for (const error of result.errors) toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={290}>
      <div className="wl-doc-menu">
        <div className="wl-save-row">
          <TextField onCommit={setName} placeholder="Water name…" value={name} />
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
            downloadBlob(actions.exportDocument(), `${state.name.replace(/\s+/g, '-').toLowerCase() || 'water'}.water-preset.json`, 'application/json');
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

function previewInScene(actions) {
  const stashed = setLabHandoff('water-lab-preview', actions.getHandoffPayload());
  if (!stashed) {
    toast('Could not stash the settings for the preview scene.', { tone: 'danger' });
    return;
  }
  window.location.href = '/playground/?scene=water';
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  return (
    <header className="wl-topbar tk">
      <span className="wl-brand"><Icon name="logo-toonlab" /> Water Lab</span>
      <button
        type="button"
        className="wl-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="wl-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <IconButton disabled={!state.canUndo} icon="undo" label="Undo (⌘Z)" onClick={() => actions.undo()} />
      <IconButton disabled={!state.canRedo} icon="redo" label="Redo (⇧⌘Z)" onClick={() => actions.redo()} />
      <span className="wl-topbar-spacer" />
      <span className="wl-scene-select">
        <Select
          onChange={(id) => { persistLabScene(id); navigateSceneHub(id); }}
          options={SCENE_HUB_OPTIONS.map((entry) => ({ label: entry.label, value: entry.id }))}
          value="waterLab"
        />
      </span>
      <Button icon="play" kind="primary" onClick={() => previewInScene(actions)} testId="preview-scene">
        Preview in scene
      </Button>
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </header>
  );
}

/** Kit field row for the non-schema stage params (view state, not settings). */
function StageParamRow({ field, onChange, value }) {
  return (
    <div className="tk-field">
      <span className="tk-field-label"><span className="tk-field-label-text">{field.label}</span></span>
      <Slider max={field.max} min={field.min} onChange={(next) => onChange(Math.round(next))} step={field.step} value={value} />
      <ScrubValue max={field.max} min={field.min} onChange={(next) => onChange(Math.round(next))} step={field.step} value={value} />
    </div>
  );
}

// Test objects on the stage: rocks at stepped depths (see-through/depth-fade
// reference), a koi school, and flow-reactive kelp. Their interaction
// *response* parameters are real water settings and live in the schema groups
// (Waves: flow, Ripples, Splashes) — this section only sizes the stage.
function StageSection({ actions, state }) {
  return (
    <section className="tk-section" data-testid="group-stage">
      <div className="tk-section-title">Stage</div>
      <div className="tk-section-caption">
        Test objects for seeing through the water and watching interactions.
        Tune their response under Waves (Flow), Ripples, and Splashes.
      </div>
      <div className="tk-section-fields">
        <div className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">Ground</span></span>
          <Select
            onChange={(stage) => actions.setView({ stage })}
            options={WATER_LAB_STAGES.map((entry) => ({ label: entry.label, value: entry.id }))}
            testId="stage-ground"
            value={state.view.stage}
          />
          <span />
        </div>
        <div className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">Depth rocks</span></span>
          <Toggle checked={state.view.rocks} onChange={(rocks) => actions.setView({ rocks })} testId="stage-rocks" />
          <span />
        </div>
        <StageParamRow
          field={{ label: 'Fish', max: 90, min: 0, step: 1 }}
          onChange={(fish) => actions.setView({ fish })}
          value={state.view.fish}
        />
        <StageParamRow
          field={{ label: 'Kelp', max: 160, min: 0, step: 1 }}
          onChange={(kelp) => actions.setView({ kelp })}
          value={state.view.kelp}
        />
      </div>
    </section>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="wl-rail tk" data-testid="section-rail">
      <button
        type="button"
        className="wl-rail-stage wl-rail-camera"
        data-mode-active="true"
        data-testid="rail-camera"
        title="Camera — choose Rotate, Pan, or Zoom from the control bar above the viewport."
      >
        <Icon name="tool-move" />
        <span>Camera</span>
      </button>
      <div className="wl-rail-divider" />
      {WATER_WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="wl-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id]} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = WATER_WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId)
    ?? WATER_WORKSPACE_SECTIONS[0];
  const group = WATER_SETTING_GROUPS.find((entry) => entry.id === section.id);
  return (
    <aside className="wl-inspector tk" data-testid="inspector">
      <h2 className="wl-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="wl-inspector-caption">{section.description}</p>
      {section.id === 'stage' && <PresetRow actions={actions} state={state} />}
      {section.id === 'stage' && <StageSection actions={actions} state={state} />}
      {group && (
        <WaterSchemaGroup
          actions={actions}
          group={group}
          settings={state.settings}
          showCaption={false}
        />
      )}
    </aside>
  );
}

function CameraBar({ engine, mode, onModeChange }) {
  return (
    <div className="wl-camerabar tk" data-testid="camera-bar">
      <span>Camera</span>
      <SegmentedControl
        onChange={onModeChange}
        options={CAMERA_MODE_OPTIONS}
        testId="camera-mode"
        value={mode}
      />
      <IconButton icon="reset" label="Reset camera" onClick={() => engine.resetCamera()} />
      <span className="wl-camerabar-hint">Left-drag selected mode · wheel zoom · right-drag pan</span>
    </div>
  );
}

function StageBar({ actions, engine, state }) {
  return (
    <div className="wl-stagebar tk">
      <Select onChange={(debug) => actions.setView({ debug })} options={DEBUG_OPTIONS} value={state.view.debug} />
      <Button kind="secondary" onClick={() => engine.dropBall()} testId="drop-ball">Drop ball</Button>
      <Button kind="secondary" onClick={() => engine.dropBall({ sinker: true })} testId="drop-sinker">Drop sinker</Button>
      <label className="wl-rain">
        <Toggle checked={state.view.rain} onChange={(rain) => actions.setView({ rain })} />
        <span>Rain</span>
      </label>
      <span className="wl-stagebar-hint">⇧-drag the water to splash</span>
    </div>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="wl-status tk" data-testid="status-bar">
      <span className="wl-status-message">{state.status}</span>
      <span className="wl-status-spacer" />
      <span className="wl-status-meta">
        {state.settings.mode} · {state.settings.colorTone} · {state.settings.quality}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('stage');
  const [cameraMode, setCameraModeState] = useState('rotate');

  useEffect(() => { document.title = `${state.name} — Water Lab`; }, [state.name]);
  useEffect(() => { engine.setCameraMode(cameraMode); }, [cameraMode, engine]);

  return (
    <div className="tk">
      <div className="wl-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <CameraBar engine={engine} mode={cameraMode} onModeChange={setCameraModeState} />
      <StageBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
