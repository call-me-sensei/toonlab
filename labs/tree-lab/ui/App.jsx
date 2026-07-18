// Tree Lab workspace shell: top bar, workflow rail, right inspector /
// power drawer, floating tool strip + options bar, status bar, and the
// modal/popover layers. Pure view over the designer store; the engine
// renders underneath.

import { useEffect, useRef, useState } from 'react';
import {
  Badge, BrandLockup, Button, Icon, IconButton, Modal, Popover, PresetRowShell,
  PreviewBar, PreviewToggle, RendererToggle, SegmentedControl, Select, Slider,
  TextField, ToastStack, useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { WEATHER_PRESETS } from '../engine/skyWeather.js';
import { BARK_TEXTURE_PRESETS } from '../engine/barkTextures.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import { findTreePreset } from '../treePresetStore.js';
import { STAGES } from './stageMap.js';
import { TREE_SETTING_FIELD_SCHEMA } from '../../../src/vegetation/treeRecipe.js';
import { applyBarkShader, applyFlowerShader, applyFoliageShader, applyGrassShader, VEGETATION_SHADERS } from '../../../src/vegetation/vegetationShaders.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';

// Two editing contexts, never mixed: ASSETS is the creation lab (the recipe
// you export); SHADER edits the vegetation shaders. Within Shader mode the
// rail lists each vegetation shader — its own sections and fields.
const LAB_MODES = Object.freeze([
  Object.freeze({ label: 'Shader', value: 'shader' }),
  Object.freeze({ label: 'Assets', value: 'assets' }),
]);

const SHADER_ICONS = Object.freeze({ bark: 'stage-wood', flower: 'stage-flowers', foliage: 'stage-leaves', grass: 'tool-leaves' });
const SHADER_STORAGE_KEY = 'toonlab.vegetationShaders.v1';

function loadShaderDocuments() {
  try {
    const raw = window.localStorage?.getItem(SHADER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveShaderDocuments(documents) {
  try {
    window.localStorage?.setItem(SHADER_STORAGE_KEY, JSON.stringify(documents));
  } catch {
    // Private modes may reject storage — the lab keeps working unsaved.
  }
}
import { StagePanel } from './panels/StagePanel.jsx';
import { PowerDrawer } from './panels/PowerDrawer.jsx';
import { ExportDialog } from './panels/ExportDialog.jsx';
import { AnimationPanel } from './panels/AnimationPanel.jsx';
import { FlowersPanel } from './panels/FlowersPanel.jsx';
import { CustomShapeDialog, LeafPaletteSection, LeafStyleSection } from './LeafStylePanel.jsx';
import { GalleryScreen } from './screens/GalleryScreen.jsx';
import { OptionsBar, SketchModeBar, ToolStrip } from './ToolStripTree.jsx';
import { BranchInspectorPopover } from './BranchInspectorPopover.jsx';

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState('');
  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={260}>
      <div className="td-doc-menu">
        <div style={{ display: 'flex', gap: 8 }}>
          <TextField onCommit={setName} placeholder="Preset name…" testId="preset-name" value={name} />
          <Button
            disabled={!name.trim()}
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
            }}
            testId="preset-save"
          >
            Save
          </Button>
        </div>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to preset
          </Button>
        )}
        <Button kind="ghost" onClick={() => { actions.setView({ gallery: true }); onClose(); }}>
          Open gallery
        </Button>
        <Button kind="danger" onClick={() => actions.resetLab()} testId="reset-lab">
          Reset designer…
        </Button>
      </div>
    </Popover>
  );
}

function EnvironmentMenu({ actions, anchor, onClose, state }) {
  const hour = state.sky.hour;
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  return (
    <Popover anchor={anchor} onClose={onClose} title="Environment" width={360}>
      <div style={{ display: 'grid', gap: 10, padding: '4px 2px' }}>
        <div className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">Time of day</span></span>
          <Slider
            defaultValue={12}
            max={24}
            min={0}
            onChange={(value) => actions.setSky({ hour: value })}
            step={0.5}
            testId="sky-hour"
            value={hour}
          />
          <span style={{ font: 'var(--type-value)', textAlign: 'right' }}>{clock}</span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="tk-field-label"><span className="tk-field-label-text">Weather</span></span>
          <Select
            onChange={(weather) => actions.setSky({ weather })}
            options={Object.entries(WEATHER_PRESETS)
              .map(([value, preset]) => ({ label: preset.label, value }))}
            testId="sky-weather"
            value={state.sky.weather}
          />
        </div>
        <span style={{ font: 'var(--type-caption)', opacity: 0.6 }}>
          Presentation only — never part of the recipe or exports.
        </span>
      </div>
    </Popover>
  );
}

function TopBar({ actions, engine, mode, onModeChange, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const preset = state.presetId ? findTreePreset(state.presetId) : null;
  const title = preset?.label ?? 'Untitled tree';

  async function share() {
    const url = new URL(window.location.href);
    url.search = `?recipe=${encodeURIComponent(JSON.stringify(actions.getRecipeDocument()))}`;
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      actions.setStatus('Link copied to clipboard.');
    } catch {
      actions.setStatus('Link written to the address bar (clipboard unavailable).');
    }
  }

  return (
    <header className="td-topbar tk">
      <BrandLockup labName="Vegetation Lab" />
      <button
        type="button"
        className="td-topbar-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {title}
        {state.presetDirty && <span className="td-dirty-dot">●</span>}
        <Icon name="chevron-down" />
      </button>
      <IconButton disabled={!state.canUndo} icon="undo" label="Undo (⌘Z)" onClick={() => actions.undo()} testId="undo" />
      <IconButton disabled={!state.canRedo} icon="redo" label="Redo (⇧⌘Z)" onClick={() => actions.redo()} testId="redo" />
      <span className="td-sublab" data-testid="mode-switch" title="Assets is the creation lab (recipes you export); Shader edits the vegetation shaders. The two are never edited at the same time.">
        <SegmentedControl onChange={onModeChange} options={[...LAB_MODES]} value={mode} />
      </span>
      <span className="td-topbar-spacer" />
      <RendererToggle />
      <Button icon="link" kind="ghost" onClick={share} testId="share">Share</Button>
      <Button
        icon="stage-export"
        kind="primary"
        onClick={() => actions.setView({ export: true })}
        testId="export-open"
      >
        Export
      </Button>
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

function StageRail({ actions, activeShader, mode, onShaderChange, state }) {
  if (mode === 'shader') {
    return (
      <nav className="td-rail tk" data-testid="stage-rail">
        {VEGETATION_SHADERS.map((master) => (
          <button
            key={master.id}
            type="button"
            className="td-rail-stage"
            data-active={activeShader === master.id}
            data-testid={`shader-${master.id}`}
            title={`${master.label} — ${master.description}`}
            onClick={() => onShaderChange(master.id)}
          >
            <Icon name={SHADER_ICONS[master.id]} />
            <span>{master.label}</span>
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav className="td-rail tk" data-testid="stage-rail">
      {/* Move is a UTILITY, not a stage: it shows whether your hands are on
          the camera (no tool held) and clicking it puts any tool down. Its
          active style is deliberately different from stage highlighting so
          the rail never shows two "selections". Hold Space to pan/orbit
          temporarily while a tool is held. */}
      <button
        type="button"
        className="td-rail-stage td-rail-mode"
        data-mode-active={state.tool === 'move'}
        data-testid="rail-move"
        title="Move (V) — select to choose what left-drag does: Rotate, Pan, or Zoom. Esc deselects (drag still rotates by default); hold Space for a quick pan mid-tool."
        onClick={() => {
          // Inside Sketch mode, Move only parks the brush — the pending
          // doodle stays so you can orbit and keep drawing from a new angle.
          const putDown = state.sketchMode ? 'doodleWood' : 'orbit';
          actions.setTool(state.tool === 'move' ? putDown : 'move');
        }}
      >
        <Icon name="tool-move" />
        <span>Move</span>
      </button>
      <div style={{ height: 1, width: 36, background: 'var(--border-subtle)' }} />
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="td-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          data-testid={`stage-${stage.id}`}
          title={`${stage.label} (${stage.key}) — ${stage.description}`}
          onClick={() => {
            actions.setStage(stage.id);
            actions.setView({ drawer: false });
          }}
        >
          <Icon name={stage.icon} />
          <span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="td-rail-stage td-rail-bottom"
        data-active={state.view.drawer}
        data-testid="drawer-toggle"
        title="All controls (`)"
        onClick={() => actions.setView({ drawer: !state.view.drawer })}
      >
        <Icon name="drawer" />
        <span>All</span>
      </button>
    </nav>
  );
}

function BarkTextureSection({ actions, state }) {
  const fileRef = useRef(null);
  const current = state.barkTexture?.id ?? 'classic';

  function onUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // Downscale to 512px so the dataURL stays localStorage-friendly.
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      actions.setBarkTexture({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), id: 'custom' });
    };
    image.onerror = () => actions.setStatus('That file could not be read as an image.');
    image.src = url;
  }

  return (
    <section className="tk-section" data-testid="bark-texture-section">
      <div className="tk-section-title">Bark texture</div>
      <div className="tk-section-caption">
        Surface detail for trunk and branches — presets, your own image, or
        flat toon color.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 4px' }}>
        {[
          ...Object.entries(BARK_TEXTURE_PRESETS).map(([id, preset]) => [id, preset.label]),
          ['none', 'None'],
          ['custom', 'Custom'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="tk-button"
            data-kind={current === id ? 'primary' : 'secondary'}
            data-testid={`bark-${id}`}
            disabled={id === 'custom' && !state.barkTexture?.dataUrl}
            title={id === 'custom' && !state.barkTexture?.dataUrl
              ? 'Upload an image below first' : undefined}
            onClick={() => actions.setBarkTexture(
              { ...(state.barkTexture ?? {}), id })}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ margin: '8px 4px 0' }}>
        <Button kind="secondary" onClick={() => fileRef.current?.click()} testId="bark-upload">
          ⬆️ Upload texture…
        </Button>
        <input
          ref={fileRef}
          accept="image/*"
          hidden
          onChange={onUpload}
          type="file"
        />
      </div>
    </section>
  );
}

function TrunkShapeSection({ actions, state }) {
  const [drawing, setDrawing] = useState(false);
  return (
    <section className="tk-section" data-testid="trunk-shape-section">
      <div className="tk-section-title">Trunk shape</div>
      <div className="tk-section-caption">
        Draw the trunk&apos;s cross-section — the grounded stems sweep it
        instead of a circle (buttress, fluted, gnarled bases).
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '0 4px' }}>
        <Button kind="secondary" onClick={() => setDrawing(true)} testId="trunk-shape-draw">
          ✏️ Draw base shape…
        </Button>
        {state.trunkProfile && (
          <Button kind="ghost" onClick={() => actions.setTrunkProfile(null)} testId="trunk-shape-clear">
            Reset to round
          </Button>
        )}
      </div>
      {drawing && (
        <CustomShapeDialog
          onClose={() => setDrawing(false)}
          onSave={(outline) => {
            actions.setTrunkProfile({ outline });
            setDrawing(false);
          }}
          title="Draw the trunk cross-section"
        />
      )}
    </section>
  );
}

function WoodDetailsSection({ actions, state }) {
  const details = state.woodDetails ?? { knots: 0, scars: 0 };
  const set = (patch) => actions.setWoodDetails({ ...details, ...patch });
  return (
    <section className="tk-section" data-testid="wood-details-section">
      <div className="tk-section-title">Details</div>
      <div className="tk-section-caption">
        Knots and scars on the lower trunk — real trees are never perfect.
      </div>
      {[['Knots', 'knots'], ['Scars', 'scars']].map(([label, key]) => (
        <div key={key} className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">{label}</span></span>
          <Slider
            defaultValue={0}
            max={1}
            min={0}
            onChange={(value) => set({ [key]: value })}
            step={0.05}
            testId={`wood-${key}`}
            value={details[key]}
          />
          <ScrubValue
            max={1}
            min={0}
            onChange={(value) => set({ [key]: value })}
            step={0.05}
            value={details[key]}
          />
        </div>
      ))}
    </section>
  );
}

// Top-down root layout: draw each root as a stroke from the trunk (center
// dot) outward — exact plan-view control instead of the uniform radial
// presets. Paths are normalized to [-1, 1] around the trunk.
function RootLayoutDialog({ onClose, onSave }) {
  const canvasRef = useRef(null);
  const pathsRef = useRef([]);
  const activeRef = useRef(null);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const mid = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    // Trunk cross-section at the center for reference.
    ctx.fillStyle = 'rgba(176,122,74,0.9)';
    ctx.beginPath();
    ctx.arc(mid, mid, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(138,90,58,0.9)';
    for (const path of [...pathsRef.current, activeRef.current].filter(Boolean)) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  useEffect(redraw, []);

  return (
    <Modal onClose={onClose} title="Draw the root layout (top view)" width={340}>
      <p style={{ color: 'var(--text-secondary)', font: 'var(--type-caption)', marginBottom: 8 }}>
        You&apos;re looking straight down at the trunk (center dot). Draw each
        root from the trunk outward — length and direction are exactly what
        you draw.
      </p>
      <canvas
        ref={canvasRef}
        data-testid="root-layout-canvas"
        height={260}
        width={260}
        style={{
          background: 'var(--surface-2)', borderRadius: 8, cursor: 'crosshair', touchAction: 'none',
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          activeRef.current = [[event.clientX - rect.left, event.clientY - rect.top]];
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch { /* synthetic pointers */ }
        }}
        onPointerMove={(event) => {
          if (!activeRef.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          activeRef.current.push([event.clientX - rect.left, event.clientY - rect.top]);
          redraw();
        }}
        onPointerUp={() => {
          if (activeRef.current && activeRef.current.length >= 3) {
            pathsRef.current.push(activeRef.current);
          }
          activeRef.current = null;
          redraw();
        }}
      />
      <div className="td-export-actions">
        <Button kind="ghost" onClick={() => { pathsRef.current = []; activeRef.current = null; redraw(); }}>
          Clear
        </Button>
        <Button
          kind="primary"
          onClick={() => {
            const size = canvasRef.current.width;
            const paths = pathsRef.current
              .map((path) => {
                const step = Math.max(1, Math.floor(path.length / 20));
                return path
                  .filter((_, index) => index % step === 0)
                  .map(([x, y]) => [
                    Number(((x / size) * 2 - 1).toFixed(3)),
                    Number(((y / size) * 2 - 1).toFixed(3)),
                  ]);
              })
              .filter((path) => path.length >= 2);
            if (!paths.length) return;
            onSave(paths);
            onClose();
          }}
          testId="root-layout-save"
        >
          Use this layout
        </Button>
      </div>
    </Modal>
  );
}

function RootsSection({ actions, state }) {
  const [drawing, setDrawing] = useState(false);
  const current = state.roots?.preset ?? 'none';
  return (
    <section className="tk-section" data-testid="roots-section">
      <div className="tk-section-title">Roots</div>
      <div className="tk-section-caption">
        Surface roots radiating from the base collar. Draw the exact layout
        from above, or add individual ones with the 🫚 Root brush in Sketch
        mode.
      </div>
      <div className="tk-segmented" style={{ margin: '0 4px' }}>
        {['none', 'small', 'medium', 'large'].map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={current === preset}
            data-testid={`roots-${preset}`}
            onClick={() => actions.setRoots(preset === 'none' ? null : { preset })}
          >
            {preset[0].toUpperCase() + preset.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '8px 4px 0' }}>
        <Button
          kind={current === 'custom' ? 'primary' : 'secondary'}
          onClick={() => setDrawing(true)}
          testId="roots-draw"
        >
          ✏️ Draw layout…
        </Button>
        {current === 'custom' && (
          <Badge>{state.roots.paths.length} drawn</Badge>
        )}
      </div>
      {drawing && (
        <RootLayoutDialog
          onClose={() => setDrawing(false)}
          onSave={(paths) => actions.setRoots({ paths, preset: 'custom' })}
        />
      )}
    </section>
  );
}

function ShaderInspector({ activeShader, onShaderSetting, onShaderPreset, shaderState }) {
  const master = VEGETATION_SHADERS.find((entry) => entry.id === activeShader) ?? VEGETATION_SHADERS[0];
  const current = shaderState[master.id];
  return (
    <aside className="td-inspector tk" data-testid="inspector">
      <PresetRowShell title={`The ${master.label.toLowerCase()} shader preset you are editing — treatment only; albedo stays on the asset, light stays on the scene.`}>
        <Select
          onChange={(id) => { if (id) onShaderPreset(master.id, id); }}
          options={[
            ...(current.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
            ...master.getPresetOptions(),
          ]}
          testId="shader-preset-select"
          value={current.presetId ?? ''}
        />
      </PresetRowShell>
      <h2 style={{ font: 'var(--type-title)', margin: 'var(--space-1)' }} data-testid="inspector-title">{master.label} shader</h2>
      <p style={{ color: 'var(--text-tertiary)', font: 'var(--type-caption)', margin: '0 var(--space-1) var(--space-3)' }}>
        {master.description}
      </p>
      <SchemaGroup
        fields={master.fieldSchema}
        getValue={(field) => current.settings[field.key]}
        group={{ description: master.description, id: master.id, label: `${master.label} treatment` }}
        onChange={(field, value) => onShaderSetting(master.id, field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function Inspector({ actions, state }) {
  if (state.view.drawer) {
    return (
      <aside className="td-inspector tk" data-drawer="true" data-testid="inspector">
        <PowerDrawer actions={actions} state={state} />
      </aside>
    );
  }
  const stage = STAGES.find((entry) => entry.id === state.stage) ?? STAGES[0];
  return (
    <aside className="td-inspector tk" data-testid="inspector">
      <div className="td-inspector-header">{stage.label}</div>
      <div className="td-inspector-caption">{stage.description}</div>
      {stage.id === 'animation' && <AnimationPanel actions={actions} state={state} />}
      {stage.id === 'flowers' && <FlowersPanel actions={actions} state={state} />}
      {stage.id === 'look' && <LeafStyleSection actions={actions} state={state} />}
      {stage.id === 'look' && <LeafPaletteSection actions={actions} state={state} />}
      {stage.id === 'look' && <BarkTextureSection actions={actions} state={state} />}
      {stage.id === 'wood' && <TrunkShapeSection actions={actions} state={state} />}
      {stage.id === 'wood' && <WoodDetailsSection actions={actions} state={state} />}
      {stage.id === 'wood' && <RootsSection actions={actions} state={state} />}
      <StagePanel actions={actions} groupIds={stage.groups} state={state} />
    </aside>
  );
}

function StatusBar({ actions, engine, state }) {
  // Re-read the engine's dataset stats after every rebuild.
  const [, setTick] = useState(0);
  useEffect(() => engine.onRebuilt(() => setTick((tick) => tick + 1)), [engine]);
  const cards = document.body.dataset.treeCardCount ?? '0';
  return (
    <footer className="td-status tk" data-testid="status-bar">
      <span>{state.status}</span>
      <span className="td-status-stats">
        seed {state.settings.plant.seed} · {Number(cards).toLocaleString()} cards
      </span>
    </footer>
  );
}

// Scene-preview configuration — the bottom bar over the viewport (shared
// PreviewBar): time of day, weather, scale mannequin, walking. All
// presentation, never part of the recipe or the shader preset.
function TreePreviewBar({ actions, state }) {
  const hour = state.sky.hour;
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  return (
    <PreviewBar
      hint={state.walkPreview ? 'WASD/arrows move · Shift runs · Space jumps' : null}
      title="Preview only — time, weather, mannequin, and walking are presentation; never part of the recipe or exports."
    >
      <span className="tk-previewbar-slider" title={`Time of day — ${clock}`}>
        <span>{clock}</span>
        <Slider defaultValue={12} max={24} min={0} onChange={(value) => actions.setSky({ hour: value })} step={0.5} testId="sky-hour" value={hour} />
      </span>
      <span className="td-previewbar-select">
        <Select
          onChange={(weather) => actions.setSky({ weather })}
          options={Object.entries(WEATHER_PRESETS).map(([value, preset]) => ({ label: preset.label, value }))}
          testId="sky-weather"
          value={state.sky.weather}
        />
      </span>
      <span className="tk-previewbar-slider" title="Wind strength — scene atmosphere; the canopy flutter it drives is live, never baked into exports.">
        <span>Wind</span>
        <Slider
          max={TREE_SETTING_FIELD_SCHEMA.wind.strength.range?.max ?? 0.3}
          min={0}
          onChange={(value) => actions.setField(TREE_SETTING_FIELD_SCHEMA.wind.strength, value)}
          step={TREE_SETTING_FIELD_SCHEMA.wind.strength.range?.step ?? 0.005}
          testId="wind-strength"
          value={state.settings.wind.strength}
        />
      </span>
      <span className="tk-previewbar-slider" title="Wind speed — how fast the flutter oscillates.">
        <span>Speed</span>
        <Slider
          max={TREE_SETTING_FIELD_SCHEMA.wind.speed.range?.max ?? 3}
          min={0}
          onChange={(value) => actions.setField(TREE_SETTING_FIELD_SCHEMA.wind.speed, value)}
          step={TREE_SETTING_FIELD_SCHEMA.wind.speed.range?.step ?? 0.05}
          testId="wind-speed"
          value={state.settings.wind.speed}
        />
      </span>
      <PreviewToggle
        checked={Boolean(state.mannequin)}
        label="Scale"
        onChange={(mannequin) => actions.setMannequin(mannequin)}
        testId="mannequin-toggle"
        title="Show a 1.8m mannequin next to the tree for scale"
      />
      <PreviewToggle
        checked={Boolean(state.walkPreview)}
        label="Walk"
        onChange={(on) => {
          if (on) actions.setMannequin(true);
          actions.setWalkPreview(on);
        }}
        testId="walk-toggle"
        title={WALK_PREVIEW_TITLE}
      />
    </PreviewBar>
  );
}

export function App({ dressing, engine, sketchBindings, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [mode, setMode] = useState('assets');
  const [activeShader, setActiveShader] = useState('foliage');
  // Per-master shader preset state: { presetId, settings }, persisted.
  const [shaderState, setShaderState] = useState(() => {
    const saved = loadShaderDocuments();
    return Object.fromEntries(VEGETATION_SHADERS.map((master) => {
      const entry = saved[master.id];
      return [master.id, {
        presetId: entry?.presetId ?? 'call_me_sensei',
        settings: master.createSettings(entry?.settings ?? { preset: 'call_me_sensei' }),
      }];
    }));
  });

  function applyShaderToScene(masterId, settings) {
    const plantRoot = engine.scene;
    if (masterId === 'foliage') applyFoliageShader(plantRoot, settings);
    if (masterId === 'grass' && dressing?.grass) applyGrassShader(dressing.grass, settings);
    if (masterId === 'flower') applyFlowerShader(plantRoot, settings);
    if (masterId === 'bark') applyBarkShader(plantRoot, settings);
  }

  function commitShaderState(next) {
    setShaderState(next);
    saveShaderDocuments(Object.fromEntries(Object.entries(next).map(([id, entry]) => [id, entry])));
  }

  function handleShaderSetting(masterId, key, value) {
    const master = VEGETATION_SHADERS.find((entry) => entry.id === masterId);
    const settings = master.createSettings({ ...shaderState[masterId].settings, [key]: value });
    applyShaderToScene(masterId, settings);
    commitShaderState({ ...shaderState, [masterId]: { presetId: null, settings } });
  }

  function handleShaderPreset(masterId, presetId) {
    const master = VEGETATION_SHADERS.find((entry) => entry.id === masterId);
    const settings = master.createSettings({ preset: presetId });
    applyShaderToScene(masterId, settings);
    commitShaderState({ ...shaderState, [masterId]: { presetId, settings } });
  }

  // Apply on mount and re-apply after every rebuild — rebuilds replace
  // materials, so treatment must survive edits and plant switches.
  useEffect(() => {
    const applyAll = () => {
      for (const master of VEGETATION_SHADERS) applyShaderToScene(master.id, shaderState[master.id].settings);
    };
    applyAll();
    return engine.onRebuilt?.(applyAll);
  }, [engine, shaderState]);

  if (state.view.gallery) {
    return (
      <div className="tk">
        <GalleryScreen actions={actions} state={state} />
        <ToastStack />
      </div>
    );
  }

  return (
    <div className="tk">
      <div className="td-root">
        <TopBar actions={actions} engine={engine} mode={mode} onModeChange={setMode} state={state} />
        <StageRail actions={actions} activeShader={activeShader} mode={mode} onShaderChange={setActiveShader} state={state} />
        {mode === 'shader'
          ? (
            <ShaderInspector
              activeShader={activeShader}
              onShaderPreset={handleShaderPreset}
              onShaderSetting={handleShaderSetting}
              shaderState={shaderState}
            />
          )
          : <Inspector actions={actions} state={state} />}
        <StatusBar actions={actions} engine={engine} state={state} />
      </div>
      {state.sketchMode
        ? <SketchModeBar actions={actions} sketchBindings={sketchBindings} state={state} />
        : (
          <>
            <ToolStrip actions={actions} state={state} />
            <OptionsBar actions={actions} state={state} />
          </>
        )}
      <TreePreviewBar actions={actions} state={state} />
      <BranchInspectorPopover actions={actions} state={state} />
      {state.view.export && (
        <ExportDialog
          actions={actions}
          engine={engine}
          onClose={() => actions.setView({ export: false })}
          state={state}
        />
      )}
      <ToastStack />
    </div>
  );
}
