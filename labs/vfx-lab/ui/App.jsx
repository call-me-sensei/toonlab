// VFX Lab HUD: design gameplay effects the way the other labs design assets.
// Left rail = the cluster's categories (weapon / magic / movement / shared),
// inspector = schema-driven controls for that category's settings groups,
// bottom bar = gameplay triggers (fire the effect you're tuning), topbar =
// preset picker + seed + the export (recipe JSON / paste-ready code).

import { useEffect, useState } from 'react';

import {
  Button,
  IconButton,
  Kbd,
  Modal,
  ScrubValue,
  Select,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaField } from '../../shared/ui/schema/SchemaField.jsx';
import { SCENE_HUB_OPTIONS, navigateSceneHub } from '../../shared/sceneHub.js';
import { persistLabScene } from '../../shared/labParams.js';
import { downloadBlob } from '../../shared/download.js';
import {
  getMoveOptions,
  getVfxPresetOptions,
  getWeaponOptions,
  VFX_SETTING_FIELD_SCHEMA,
  VFX_SETTING_GROUPS,
} from '../../../src/vfxgen/index.js';

const CATEGORIES = [
  { icon: '⚔️', id: 'weapon', label: 'Weapon' },
  { icon: '🔮', id: 'magic', label: 'Magic' },
  { icon: '👣', id: 'movement', label: 'Movement' },
  { icon: '⚙️', id: 'shared', label: 'Shared' },
];

// Weapon moves come from the move library (authored default motions — the
// user designs the VFX, the swing is provided); the rest are direct spawns.
const MOVE_TRIGGERS = getMoveOptions().map((move, index) => ({
  description: move.description,
  hotkey: String(index + 1),
  id: move.id,
  label: move.label,
}));
const EFFECT_TRIGGERS = [
  { description: 'Lob a fireball across the arena (or click the floor to aim one).', hotkey: '6', id: 'fireball', label: 'Fireball' },
  { description: 'Send the runner on a dash — footstep dust every stride.', hotkey: '7', id: 'footstep', label: 'Run' },
  { description: 'Landing ring at the runner.', hotkey: '8', id: 'landing', label: 'Land' },
];

function groupsFor(categoryId) {
  return VFX_SETTING_GROUPS.filter((group) => (group.category ?? 'shared') === categoryId
    || (categoryId === 'shared' && group.id === 'shared'));
}

/** Min/max meter pairs (vector2 fields) as two scrub values. */
function RangeField({ field, onChange, value }) {
  const bound = (index) => (next) => {
    const pair = [...(Array.isArray(value) ? value : field.defaultValue)];
    pair[index] = next;
    if (pair[0] > pair[1]) pair.sort((a, b) => a - b);
    onChange(pair);
  };
  return (
    <div className="tk-field">
      <span className="tk-field-label" title={field.description}>
        <span className="tk-field-label-text">{field.label}</span>
      </span>
      <span className="vl-range">
        <ScrubValue max={5} min={0} onChange={bound(0)} step={0.005} value={value?.[0] ?? 0} />
        <span className="vl-range-sep">–</span>
        <ScrubValue max={5} min={0} onChange={bound(1)} step={0.005} value={value?.[1] ?? 0} />
      </span>
      <span />
    </div>
  );
}

function GroupPanel({ actions, effective, group }) {
  const fields = VFX_SETTING_FIELD_SCHEMA[group.id] ?? {};
  const values = effective[group.id] ?? {};
  const groupDisabled = values.enabled === false;
  return (
    <section className="tk-section" data-testid={`group-${group.id}`}>
      <div className="tk-section-title">{group.label}</div>
      <div className="tk-section-caption">{group.description}</div>
      <div className="tk-section-fields">
        {Object.values(fields).map((field) => {
          const shared = {
            field,
            onChange: (value) => actions.setField(group.id, field.key, value),
            value: values[field.key],
          };
          if (field.type === 'vector2') return <RangeField key={field.id} {...shared} />;
          return (
            <SchemaField
              key={field.id}
              {...shared}
              disabled={groupDisabled && field.key !== 'enabled'
                ? 'Enable the effect to edit its look.' : false}
            />
          );
        })}
      </div>
    </section>
  );
}

function ExportDialog({ actions, onClose }) {
  const snippet = actions.getCodeSnippet();
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast('Code copied — paste it into your game.');
    } catch {
      toast('Clipboard unavailable — select and copy below.');
    }
  }
  return (
    <Modal onClose={onClose} title="Export VFX design" width={560}>
      <p className="vl-export-note">
        Effects are runtime events, so the artifact is your tuned <strong>recipe</strong> —
        it drops straight into <code>createVfxSystem(…)</code> and every spawn uses this look.
      </p>
      <pre className="vl-snippet">{snippet}</pre>
      <div className="vl-export-actions">
        <Button icon="download" kind="secondary" onClick={() => {
          downloadBlob(JSON.stringify(actions.getRecipeDocument(), null, 2), 'vfx-recipe.json', 'application/json');
          toast('Recipe JSON downloaded.');
        }}
        >
          Recipe JSON
        </Button>
        <Button kind="primary" onClick={copyCode}>Copy code</Button>
      </div>
    </Modal>
  );
}

function TopBar({ actions, onExport, state }) {
  async function share() {
    const url = new URL(window.location.href);
    url.search = `?vfxRecipe=${encodeURIComponent(JSON.stringify(actions.getRecipeDocument()))}`;
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      actions.setStatus('Share link copied to the clipboard.');
    } catch {
      actions.setStatus('Share link written to the address bar.');
    }
  }
  return (
    <header className="vl-topbar tk">
      <span className="vl-brand">✨ VFX Lab</span>
      <span className="vl-preset">
        <Select
          onChange={(id) => actions.applyPreset(id)}
          options={getVfxPresetOptions().map((entry) => ({ label: entry.label, value: entry.id }))}
          value={state.presetId}
        />
      </span>
      <span className="vl-seed">
        seed
        <ScrubValue max={99999} min={1} onChange={(value) => actions.setSeed(value)} step={1} value={state.seed} />
        <IconButton icon="dice" label="New seed" onClick={() => actions.randomizeSeed()} />
      </span>
      <span className="vl-topbar-spacer" />
      <span className="vl-scene-select">
        <Select
          onChange={(id) => { persistLabScene(id); navigateSceneHub(id); }}
          options={SCENE_HUB_OPTIONS.map((entry) => ({ label: entry.label, value: entry.id }))}
          value="vfxLab"
        />
      </span>
      <Button
        kind={state.loop ? 'secondary' : 'ghost'}
        onClick={() => actions.setLoop(!state.loop)}
        testId="loop-toggle"
      >
        {state.loop ? '⏸ Loop on' : '▶ Loop off'}
      </Button>
      <Button icon="link" kind="ghost" onClick={share}>Share</Button>
      <Button icon="stage-export" kind="primary" onClick={onExport} testId="export">Export</Button>
    </header>
  );
}

function TriggerBar({ engine, state }) {
  const [, setTick] = useState(0);
  const [weaponId, setWeaponId] = useState(engine.weaponId ?? 'sword');
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 400);
    return () => clearInterval(timer);
  }, []);
  const glow = document.body.dataset.vfxLiveGlow ?? '0';
  const puff = document.body.dataset.vfxLivePuff ?? '0';
  const draws = document.body.dataset.vfxDrawCalls ?? '0';
  const phase = document.body.dataset.vfxMovePhase || '';
  return (
    <footer className="vl-triggerbar tk">
      <span className="vl-weapon" title="Weapon — its weight scales move timing and hit power.">
        <Select
          onChange={(id) => { setWeaponId(id); engine.setWeapon(id); }}
          options={getWeaponOptions().map((entry) => ({ label: entry.label, value: entry.id }))}
          value={weaponId}
        />
      </span>
      <span className="vl-triggers">
        {MOVE_TRIGGERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="vl-trigger"
            data-testid={`trigger-${entry.id}`}
            title={entry.description}
            onClick={() => engine.trigger(entry.id)}
          >
            {entry.label} <Kbd>{entry.hotkey}</Kbd>
          </button>
        ))}
        <span className="vl-trigger-divider" />
        {EFFECT_TRIGGERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="vl-trigger"
            data-testid={`trigger-${entry.id}`}
            title={entry.description}
            onClick={() => engine.trigger(entry.id)}
          >
            {entry.label} <Kbd>{entry.hotkey}</Kbd>
          </button>
        ))}
      </span>
      <span className="vl-status">
        {phase ? `phase: ${phase}` : (state.status || 'Click the floor to aim a fireball · drag to orbit.')}
      </span>
      <span className="vl-stats">{glow} glow · {puff} puff · {draws} draws</span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const [category, setCategory] = useState('weapon');
  const [exporting, setExporting] = useState(false);
  const effective = store.effectiveSettings(state);
  return (
    <div className="tk">
      <div className="vl-root">
        <TopBar actions={store.actions} onExport={() => setExporting(true)} state={state} />
        <nav className="vl-rail tk">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="vl-rail-item"
              data-active={category === entry.id}
              data-testid={`category-${entry.id}`}
              onClick={() => setCategory(entry.id)}
            >
              <span>{entry.icon}</span>{entry.label}
            </button>
          ))}
        </nav>
        <aside className="vl-inspector tk">
          {groupsFor(category).map((group) => (
            <GroupPanel actions={store.actions} effective={effective} group={group} key={group.id} />
          ))}
        </aside>
        <TriggerBar engine={engine} state={state} />
      </div>
      {exporting && <ExportDialog actions={store.actions} onClose={() => setExporting(false)} />}
      <ToastStack />
    </div>
  );
}
