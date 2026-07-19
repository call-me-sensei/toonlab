// Character Shader Lab workspace: top bar, left workflow rail, focused schema
// groups in the right inspector, floating stage bar, and status bar — the
// same chrome as Tree/Water/Debris Lab. Pure view over the store; the engine
// renders the character underneath and hosts the walk-preview controller.

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
  Select,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { CHARACTER_MODEL_OPTIONS, normalizeModelPath } from '../../shared/sceneHub.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import {
  TOON_SETTING_FIELD_SCHEMA,
  TOON_SETTING_GROUP_METADATA,
} from '../../../src/toon/toonMaterialAdapter.js';
import { getBuiltInToonPresetOptions } from './store.js';

const WORKSPACE_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Source texture policy, material roles, and alpha behavior.',
    groups: Object.freeze(['baseTexture', 'materialRoles', 'alpha']),
    icon: 'stage-look',
    id: 'base',
    label: 'Base',
  }),
  Object.freeze({
    description: 'Skin warmth and the face-area lighting overrides.',
    groups: Object.freeze(['skinTone', 'faceLighting']),
    icon: 'stage-flowers',
    id: 'skin',
    label: 'Skin',
  }),
  Object.freeze({
    description: 'Cel band thresholds, softness, and shadow tinting.',
    groups: Object.freeze(['celShade', 'shadowColor']),
    icon: 'stage-detail',
    id: 'cel',
    label: 'Cel',
  }),
  Object.freeze({
    description: 'Scene, self, averaged, and contact shadows.',
    groups: Object.freeze(['sceneShadow', 'selfShadow', 'averageShadow', 'contactShadow']),
    icon: 'stage-wood',
    id: 'shadows',
    label: 'Shadow',
  }),
  Object.freeze({
    description: 'Indirect bounce, local lights, rim light, and speculars.',
    groups: Object.freeze(['indirectLight', 'localLights', 'rimLight', 'specular']),
    icon: 'stage-animation',
    id: 'light',
    label: 'Light',
  }),
  Object.freeze({
    description: 'Hair highlight band and eye highlights.',
    groups: Object.freeze(['hairHighlight', 'eyeHighlight']),
    icon: 'tool-crown',
    id: 'hair',
    label: 'Hair',
  }),
  Object.freeze({
    description: 'Material maps, glitter, stickers, fur, and perspective fixes.',
    groups: Object.freeze(['materialMaps', 'glitter', 'sticker', 'fur', 'perspectiveRemoval']),
    icon: 'tool-sculpt-add',
    id: 'detail',
    label: 'Detail',
  }),
  Object.freeze({
    description: 'Ink outline width, color, and per-role behavior.',
    groups: Object.freeze(['outline']),
    icon: 'sketch',
    id: 'outline',
    label: 'Outline',
  }),
]);

function PresetRow({ actions, state }) {
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...getBuiltInToonPresetOptions().map((entry) => ({ label: entry.label, value: entry.id })),
    ...state.localPresets.map((entry) => ({ label: `${entry.label} · saved`, value: entry.id })),
  ];
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  return (
    <PresetRowShell title="The toon preset you are editing — switching replaces every shader value.">
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
      <div className="cs-doc-menu">
        <div className="cs-save-row">
          <TextField onCommit={setName} placeholder="Look name…" value={name} />
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
            downloadBlob(actions.exportDocument(), `${state.name.replace(/\s+/g, '-').toLowerCase() || 'toon'}.toon-preset.json`, 'application/json');
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
    <header className="cs-topbar tk">
      <BrandLockup labName="Character Shader Lab" />
      <button
        type="button"
        className="cs-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="cs-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <IconButton disabled={!state.canUndo} icon="undo" label="Undo (⌘Z)" onClick={() => actions.undo()} />
      <IconButton disabled={!state.canRedo} icon="redo" label="Redo (⇧⌘Z)" onClick={() => actions.redo()} />
      <span className="cs-topbar-spacer" />
      <RendererToggle />
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </header>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="cs-rail tk" data-testid="section-rail">
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="cs-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={section.icon} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, engine, sectionId, state }) {
  const section = WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId) ?? WORKSPACE_SECTIONS[0];
  return (
    <aside className="cs-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="cs-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="cs-inspector-caption">{section.description}</p>
      {section.groups.map((groupId) => (
        <SchemaGroup
          key={groupId}
          fields={TOON_SETTING_FIELD_SCHEMA[groupId]}
          getValue={(field) => state.settings[groupId]?.[field.key]}
          group={TOON_SETTING_GROUP_METADATA[groupId]}
          onChange={(field, value) => actions.setSetting(groupId, field.key, value)}
        />
      ))}
    </aside>
  );
}

// Scene-preview configuration — bottom bar over the viewport (texture-lab
// pattern). Amber = never saved into the preset.
function CharacterPreviewBar({ actions, engine, state }) {
  const hostedLab = window.location.pathname.startsWith('/labs');
  const matched = CHARACTER_MODEL_OPTIONS.some(
    (option) => normalizeModelPath(option.model) === normalizeModelPath(state.modelUrl),
  );
  const options = [
    ...CHARACTER_MODEL_OPTIONS.map((option) => ({ label: option.label, value: option.model })),
    ...(matched ? [] : [{
      label: `Custom: ${state.modelUrl.slice(state.modelUrl.lastIndexOf('/') + 1)}`,
      value: state.modelUrl,
    }]),
  ];
  return (
    <PreviewBar
      hint={state.walkPreview
        ? 'WASD/arrows move · Shift runs · Space jumps'
        : 'Left-drag rotate · wheel zoom · right-drag pan'}
      title={hostedLab
        ? 'Preview only — never saved into your preset. Upload characters on a character page (Characters → Media).'
        : 'Preview only — never saved into your preset. Add characters: drop files into assets-local/models/, run `npm run assets:local`, restart.'}
    >
      <span className="cs-stagebar-select">
        <Select
          onChange={(model) => {
            const option = CHARACTER_MODEL_OPTIONS.find((entry) => entry.model === model);
            actions.setModel(model, option?.mtl ?? null);
            engine.setModel(model, option?.mtl ?? null);
            const params = new URLSearchParams(window.location.search);
            params.set('model', model);
            window.history.replaceState(null, '', `?${params}`);
          }}
          options={options}
          testId="stage-model"
          value={matched ? CHARACTER_MODEL_OPTIONS.find(
            (option) => normalizeModelPath(option.model) === normalizeModelPath(state.modelUrl),
          ).model : state.modelUrl}
        />
      </span>
      <PreviewToggle
        checked={state.animate && state.hasClips}
        disabled={!state.hasClips}
        label="Idle"
        onChange={(animate) => actions.setAnimate(animate)}
        testId="stage-animate"
        title="Play the character's idle clip"
      />
      <PreviewToggle
        checked={state.walkPreview}
        label="Walk"
        onChange={(walkPreview) => actions.setWalkPreview(walkPreview)}
        testId="walk-preview"
        title={WALK_PREVIEW_TITLE}
      />
      <IconButton icon="reset" label="Reset camera (C)" onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="cs-status tk" data-testid="status-bar">
      <span className="cs-status-message">{state.status}</span>
      <span className="cs-status-spacer" />
      <span className="cs-status-meta">
        {state.settings.presetLabel} · {state.convertedMeshCount} materials · {state.modelUrl.split('/').pop()}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('base');

  useEffect(() => { document.title = `${state.name} — Character Shader Lab`; }, [state.name]);

  return (
    <div className="tk">
      <div className="cs-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} engine={engine} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <CharacterPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
