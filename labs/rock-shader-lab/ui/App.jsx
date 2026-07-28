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
  RendererToggle,
  Select,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { P18PreviewStylesModal } from '../../shared/p18/PreviewStylesModal.jsx';
import {
  getRockShaderPresetOptions,
  ROCK_SHADER_FIELD_SCHEMA,
  ROCK_SHADER_SETTING_GROUPS,
} from '../../../src/rock-shader/index.js';
import { ROCK_SHADER_PREVIEW_FIXTURES } from './engine.js';

const SECTION_ICONS = Object.freeze({
  assetIntegration: 'stage-shape',
  distanceTint: 'stage-look',
  grassLayer: 'stage-leaves',
  layerMask: 'stage-surface',
  material: 'stage-surface',
  moss: 'stage-leaves',
  normals: 'stage-detail',
  projection: 'stage-look',
  sandLayer: 'stage-surface',
  snowLayer: 'stage-look',
  striping: 'stage-detail',
});

function PresetRow({ actions, state }) {
  return (
    <PresetRowShell label="Style" title="One complete reusable rock material profile. Geometry remains external.">
      <Select
        onChange={(id) => actions.applyPreset(id)}
        options={getRockShaderPresetOptions().map((entry) => ({
          label: entry.label,
          value: entry.value,
        }))}
        testId="preset-select"
        value={state.presetId ?? ''}
      />
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
    <Popover anchor={anchor} onClose={onClose} title="Rock shader document" width={320}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Rock shader name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              actions.setName(name);
              onClose();
            }}
          >
            Rename
          </Button>
        </div>
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(
              actions.exportDocument(),
              `${state.name.replace(/\s+/g, '-').toLowerCase() || 'rock'}.rock-shader.json`,
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
      <BrandLockup labName="Rock Shader Lab" />
      <button
        type="button"
        className="gr-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="gr-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <IconButton disabled={!state.canUndo} icon="undo" label="Undo (⌘Z)" onClick={actions.undo} />
      <IconButton disabled={!state.canRedo} icon="redo" label="Redo (⇧⌘Z)" onClick={actions.redo} />
      <span className="gr-topbar-spacer" />
      <RendererToggle
        supportedKinds={['webgpu']}
        unsupportedReason="The exact P18 reference scene exceeds the WebGL texture budget. Portable rock-shader WebGL validation is a separate release gate."
      />
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
      {ROCK_SHADER_SETTING_GROUPS.map((section) => (
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
          <span>{section.label.replace(' Layer', '').replace(' Response', '')}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = ROCK_SHADER_SETTING_GROUPS
    .find((entry) => entry.id === sectionId) ?? ROCK_SHADER_SETTING_GROUPS[0];
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <SchemaGroup
        fields={ROCK_SHADER_FIELD_SCHEMA[section.id]}
        getValue={(field) => state.settings[section.id][field.key]}
        group={section}
        onChange={(field, value) => actions.setSetting(section.id, field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">{state.status}</span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta" data-testid="contract-coverage">
        {state.coverage.matched} rock meshes · {state.coverage.applied} applied · {state.coverage.skipped} skipped
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('projection');
  const [previewStylesOpen, setPreviewStylesOpen] = useState(false);

  useEffect(() => { document.title = `${state.name} — Rock Shader Lab`; }, [state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <PreviewBar
        hint="Left-drag rotate · wheel zoom · right-drag pan"
        title="Accepted outdoor reference scene. Its geometry, context styles, time, camera, lighting, and fixture selection are preview-only."
      >
        <label className="rock-preview-fixture">
          <span>Rock</span>
          <Select
            onChange={(fixture) => actions.setView({ fixture })}
            options={ROCK_SHADER_PREVIEW_FIXTURES.map((entry) => ({
              label: entry.label,
              value: entry.id,
            }))}
            testId="preview-fixture"
            value={state.view.fixture}
          />
        </label>
        <Button
          icon="stage-look"
          kind="secondary"
          onClick={() => setPreviewStylesOpen(true)}
          testId="preview-styles"
          title="Select a complete style bundle or override individual preview domains."
        >
          Preview styles
        </Button>
        <LabTimeOfDayControl
          autoCycle={state.previewAutoCycle}
          hour={state.previewHour}
          onAutoCycleChange={actions.setPreviewAutoCycle}
          onHourChange={actions.setPreviewHour}
        />
        <IconButton icon="reset" label="Reset camera (C)" onClick={engine.resetCamera} />
      </PreviewBar>
      {previewStylesOpen && (
        <P18PreviewStylesModal
          actions={actions}
          artifactLabel="rock shader"
          authoredComponent="rock"
          onClose={() => setPreviewStylesOpen(false)}
          state={state}
        />
      )}
      <ToastStack />
    </div>
  );
}
