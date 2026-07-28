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
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { P18PreviewStylesModal } from '../../shared/p18/PreviewStylesModal.jsx';
import {
  getGroundShaderPresetOptions,
  GROUND_SHADER_FIELD_SCHEMA,
  GROUND_SHADER_SETTING_GROUPS,
} from '../../../src/ground-shader/index.js';

const SECTION_ICONS = Object.freeze({
  blending: 'stage-shape',
  dirt: 'stage-surface',
  grass: 'stage-surface',
  rock: 'stage-shape',
  sand: 'stage-surface',
  wetness: 'stage-animation',
});

const GRASS_COLORMAP_FIELDS = new Set([
  'colormapOffsetX',
  'colormapOffsetY',
  'colormapScaleX',
  'colormapScaleY',
  'huePostOffset',
  'huePreOffset',
  'hueVarianceScale',
  'hueVarianceStrength',
  'varianceMultiply',
  'varianceScale',
]);
const GRASS_WIND_COLOR_FIELDS = new Set([
  'windColorBoost',
  'windMaskMultiply',
  'windMaskSize',
  'windSize',
]);
function disabledGroundFieldReason(field, settings) {
  const group = settings[field.group];
  if (field.group === 'grass') {
    if (field.key === 'tint' && group.useColorMap) {
      return 'P18 uses the colormap branch while Use Color Map is enabled.';
    }
    if (GRASS_COLORMAP_FIELDS.has(field.key) && !group.useColorMap) {
      return 'Enable Use Color Map to activate the P18 colormap branch.';
    }
    if (GRASS_WIND_COLOR_FIELDS.has(field.key) && !group.useWindColor) {
      return 'Enable Use Wind Color to activate the P18 wind-color branch.';
    }
  }
  if (
    field.group === 'rock'
    && ['distantNormalFlatness', 'normalFadeDistance'].includes(field.key)
    && !group.flattenDistantNormals
  ) {
    return 'Enable Flatten Distant Cracks to activate distance-based normal flattening.';
  }
  return false;
}

function PresetRow({ actions, state }) {
  return (
    <PresetRowShell label="Style" title="One reusable Ground Shader profile. Terrain geometry and painted splat weights remain external.">
      <Select
        onChange={actions.applyPreset}
        options={getGroundShaderPresetOptions().map((entry) => ({
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
    if (result.ok) {
      for (const warning of result.warnings ?? []) {
        toast(warning, { tone: 'warning' });
      }
      onClose();
    } else for (const error of result.errors ?? ['Could not import the Ground Shader profile.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Ground Shader document" width={320}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Ground Shader name…" value={name} />
          <Button kind="primary" onClick={() => { actions.setName(name); onClose(); }}>Rename</Button>
        </div>
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(
              actions.exportDocument(),
              `${state.name.replace(/\s+/g, '-').toLowerCase() || 'ground'}.ground-shader.json`,
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
      <BrandLockup labName="Ground Shader Lab" />
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
        unsupportedReason="The exact P18 ten-layer landscape exceeds the WebGL texture budget. Portable WebGL validation remains a separate release gate."
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
      {GROUND_SHADER_SETTING_GROUPS.map((section) => (
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
          <span>{section.label.replace(' Response', '').replace(' Treatment', '')}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = GROUND_SHADER_SETTING_GROUPS
    .find((entry) => entry.id === sectionId) ?? GROUND_SHADER_SETTING_GROUPS[0];
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      {section.id === 'grass' && (
        <div className="vg-asset-owner" data-testid="vegetated-ground-owner">
          <strong>Terrain substrate, not grass blades</strong>
          <span>
            These controls shade the painted terrain beneath vegetation.
            Blade color, wind, bending, density, burial, and snow caps belong
            to Grass Shader and its asset/runtime inputs.
          </span>
        </div>
      )}
      {section.id === 'wetness' && (
        <div className="vg-shared-impact" data-testid="coverage-response-owner">
          <strong>Receiver response only</strong>
          <span>
            This Ground profile controls how the terrain responds after a
            host supplies wetness. Current wetness is preview state. Snow
            appearance comes from the selected cross-domain Snow Surface
            profile; this document never saves either condition.
          </span>
        </div>
      )}
      <SchemaGroup
        fields={GROUND_SHADER_FIELD_SCHEMA[section.id]}
        getValue={(field) => state.settings[section.id][field.key]}
        group={section}
        isDisabled={(field) => disabledGroundFieldReason(field, state.settings)}
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
        {state.coverage.matched} ground material · {state.coverage.writes} profile writes · {state.coverage.skipped} skipped
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState(GROUND_SHADER_SETTING_GROUPS[0].id);
  const [previewStylesOpen, setPreviewStylesOpen] = useState(false);

  useEffect(() => { document.title = `${state.name} — Ground Shader Lab`; }, [state.name]);

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
        title="Accepted P18 comparison scene. Geometry, ten painted weight layers, texture inputs, surrounding styles, visibility, current weather, time, and camera are preview-only."
      >
        <SegmentedControl
          onChange={(viewMode) => actions.setView({ viewMode })}
          options={[
            { label: 'Composition', value: 'composition' },
            { label: 'Surface', value: 'surface' },
            { label: 'Top', value: 'top' },
          ]}
          testId="preview-mode"
          value={state.view.viewMode}
        />
        <PreviewToggle
          checked={state.view.wetness > 0}
          label="Wet"
          onChange={(checked) => actions.setView({ wetness: checked ? 0.8 : 0 })}
          testId="preview-wet"
          title="Current scene wetness. The Ground profile saves only its receiving response."
        />
        <PreviewToggle
          checked={state.view.snowCover > 0}
          label="Snow"
          onChange={(checked) => actions.setView({ snowCover: checked ? 1 : 0 })}
          testId="preview-snow"
          title="Preview the selected cross-domain Snow Surface profile on this ground. Snow amount and appearance are not saved in the Ground profile."
        />
        <Button
          icon="stage-look"
          kind="secondary"
          onClick={() => setPreviewStylesOpen(true)}
          testId="preview-styles"
          title="Select a complete style bundle, override surrounding shaders, or hide scene components."
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
          artifactLabel="ground shader"
          authoredComponent="ground"
          onClose={() => setPreviewStylesOpen(false)}
          state={state}
        />
      )}
      <ToastStack />
    </div>
  );
}
