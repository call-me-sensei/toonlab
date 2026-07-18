// Rock Lab workspace shell (P6 of the toonlab UI redesign): top bar,
// workflow rail, right inspector / power drawer, floating tool strip +
// options bar, status bar. Pure view over the rock store; the engine
// renders underneath.

import { useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Icon, IconButton, Popover, SchemaGroup, SegmentedControl, Select, Slider,
  TextField, ToastStack, toast, useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { SCENE_HUB_OPTIONS, navigateSceneHub } from '../../shared/sceneHub.js';
import { persistLabScene } from '../../shared/labParams.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import { ENVIRONMENT_DEBUG_MODES } from '../../../src/environment/environmentSettings.js';
import {
  ROCKGEN_SETTING_FIELD_SCHEMA,
  ROCKGEN_SETTING_GROUPS,
  ROCK_SURFACE_TEXTURE_PRESETS,
  getRockgenPresetOptions,
  isRockHelperPiece,
  resolveRockgenPreset,
  serializeRockDocument,
} from '../../../src/rockgen/index.js';
import { WEATHER_PRESETS } from '../engine/rockSky.js';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { exportRockDocumentToFile } from '../exportGlb.js';
import { saveRockProject } from '../rockProjectStore.js';
import { STAGES, TOOLS } from './stageMap.js';
import { getRockPresetThumbnails } from './thumbnails.js';

const GROUPS_BY_ID = Object.fromEntries(ROCKGEN_SETTING_GROUPS.map((group) => [group.id, group]));
const RESOLUTION_OPTIONS = [32, 40, 48, 64, 80, 96, 128];
const DOCUMENT_GROUPS = new Set(['surface', 'meshing']);
const SCALE_RANGE = { max: 4, min: 0.05, step: 0.01 };
const ROTATION_RANGE = { max: 180, min: -180, step: 1 };
const FILL_TILE_RANGE = { max: 6, min: 1, step: 1 };
const SCALE_AXES = [
  { axis: 0, label: 'Width', testId: 'piece-scale-x' },
  { axis: 1, label: 'Height', testId: 'piece-scale-y' },
  { axis: 2, label: 'Depth', testId: 'piece-scale-z' },
];
const ROTATION_AXES = [
  { axis: 1, label: 'Yaw', testId: 'piece-rotation-yaw' },
  { axis: 0, label: 'Pitch', testId: 'piece-rotation-pitch' },
  { axis: 2, label: 'Roll', testId: 'piece-rotation-roll' },
];
const GIZMO_MODE_OPTIONS = [
  {
    icon: 'tool-move', label: 'Move', title: 'Move selected piece', value: 'translate',
  },
  {
    icon: 'tool-rotate', label: 'Rotate', title: 'Rotate selected piece', value: 'rotate',
  },
  {
    icon: 'tool-size', label: 'Scale', title: 'Scale selected piece', value: 'scale',
  },
];
const MOVE_MODE_OPTIONS = [
  { label: 'Rotate', value: 'rotate' },
  { label: 'Pan', value: 'pan' },
  { label: 'Zoom', value: 'zoom' },
];
const RESIZE_MODE_OPTIONS = [
  { label: 'Stretch', value: 'stretch' },
  { label: 'Fill', value: 'fill' },
];
const CAMERA_VIEW_BUTTONS = [
  { label: 'Hero', testId: 'view-hero', title: 'Frame composition from the hero angle', view: 'hero' },
  { label: 'Top', testId: 'view-top', title: 'Frame composition from above', view: 'top' },
  { label: 'Front', testId: 'view-front', title: 'Frame composition from the front', view: 'front' },
  { label: 'Side', testId: 'view-side', title: 'Frame composition from the side', view: 'side' },
];
const GRASS_OPTIONS = [
  { label: 'Off', title: 'Disable Rock Lab grass for fastest editing', value: 0 },
  { label: 'Light', title: 'Preview a light grass field', value: 50_000 },
  { label: 'Full', title: 'Use the old dense meadow', value: 500_000 },
];
const STAGE_TOOLS = Object.freeze({
  detail: ['sculptAdd', 'sculptSubtract'],
  export: [],
  look: [],
  pieces: [],
  shape: ['doodle'],
});
const GLOBAL_TOOL_IDS = Object.freeze(['adjacentTile']);
const TOOL_CAPTIONS = Object.freeze({
  adjacentTile: 'Tile',
  doodle: 'Doodle',
  sculptAdd: 'Build',
  sculptSubtract: 'Carve',
});
const GALLERY_PRESET_OPTIONS = getRockgenPresetOptions()
  .map((option) => ({
    ...option,
    preset: resolveRockgenPreset(option.value),
  }));
const GALLERY_PRESET_THUMBNAILS = getRockPresetThumbnails(GALLERY_PRESET_OPTIONS);

// --- Field plumbing -----------------------------------------------------------

function fieldTarget(state, field) {
  if (DOCUMENT_GROUPS.has(field.group)) return state.document;
  return state.document.pieces.find((piece) => piece.id === state.selectedPieceId && !isHelperPiece(piece))
    ?? state.document.pieces.find((piece) => !isHelperPiece(piece))
    ?? state.document.pieces[0];
}

function fieldValue(state, field) {
  return fieldTarget(state, field)[field.group][field.key];
}

function selectedPieceIds(state) {
  const available = new Set(state.document.pieces
    .filter((piece) => !isHelperPiece(piece))
    .map((piece) => piece.id));
  const source = Array.isArray(state.selectedPieceIds)
    ? state.selectedPieceIds
    : [state.selectedPieceId];
  const ids = [];
  for (const id of source) {
    if (available.has(id) && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length && available.has(state.selectedPieceId)) ids.push(state.selectedPieceId);
  if (!ids.length) {
    const fallback = state.document.pieces.find((piece) => !isHelperPiece(piece));
    if (fallback) ids.push(fallback.id);
  }
  return ids;
}

function selectedPieces(state) {
  const selected = new Set(selectedPieceIds(state));
  return state.document.pieces.filter((piece) => selected.has(piece.id));
}

function isHelperPiece(piece) {
  return isRockHelperPiece(piece);
}

// Stage-gated fields read clearer than a wall of dead sliders: everything
// in a disabled stage grays out except its own switch, and shape params
// irrelevant to the selected primitive gray out with a reason.
function isFieldDisabled(state, field) {
  const target = fieldTarget(state, field);
  const group = target[field.group];
  if (field.key !== 'enabled' && typeof group.enabled === 'boolean' && !group.enabled) {
    return 'Turn the stage on first (Enabled).';
  }
  if (field.group === 'shape') {
    const { type } = group;
    if (field.key === 'capsuleLength' && type !== 'capsule') return 'Capsule shapes only.';
    if (field.key === 'cornerRadius' && type !== 'box' && type !== 'sketch') {
      return 'Box and sketch shapes only.';
    }
    if ((field.key === 'sizeY' || field.key === 'sizeZ') && (type === 'sphere' || type === 'capsule')) {
      return 'Spheres and capsules size from Size X.';
    }
    if ((field.key === 'sizeX' || field.key === 'sizeY') && type === 'sketch') {
      return 'Sketch shapes size from the drawn outline; Size Z is the slab depth.';
    }
  }
  return false;
}

function StageGroups({ actions, groupIds, state }) {
  return groupIds.map((groupId) => (
    <SchemaGroup
      key={groupId}
      fields={ROCKGEN_SETTING_FIELD_SCHEMA[groupId]}
      getValue={(field) => fieldValue(state, field)}
      group={GROUPS_BY_ID[groupId]}
      isDisabled={(field) => isFieldDisabled(state, field)}
      onChange={(field, value) => actions.setField(field, value)}
    />
  ));
}

function toolBelongsToStage(tool, stageId) {
  return GLOBAL_TOOL_IDS.includes(tool) || (STAGE_TOOLS[stageId] ?? []).includes(tool);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function radiansToDegrees(value) {
  let degrees = (value * 180) / Math.PI;
  while (degrees > 180) degrees -= 360;
  while (degrees < -180) degrees += 360;
  return Number(degrees.toFixed(3));
}

function degreesToRadians(value) {
  return Number(((value * Math.PI) / 180).toFixed(6));
}

function averageScale(scale) {
  return Number((scale.reduce((total, value) => total + value, 0) / scale.length).toFixed(3));
}

function roundTileCount(value) {
  return Math.min(Math.max(Math.round(Number(value)) || 1, FILL_TILE_RANGE.min), FILL_TILE_RANGE.max);
}

function pieceGroundGap(piece) {
  return Math.max(Number(piece.transform?.position?.[1]) || 0, 0);
}

function canFillGroundGap(piece) {
  const op = piece.combine?.op;
  return !piece.hidden && op !== 'subtract' && op !== 'intersect' && pieceGroundGap(piece) > 0.05;
}

function isCutterPiece(piece) {
  const op = piece.combine?.op;
  return op === 'subtract' || op === 'intersect';
}

function gapFillDisplayPieces(state, pieces) {
  const direct = pieces.filter(canFillGroundGap);
  if (direct.length) return direct;
  if (pieces.some((piece) => !piece.hidden && isCutterPiece(piece))) {
    return state.document.pieces.filter(canFillGroundGap);
  }
  return [];
}

function pieceTransformWith(piece, key, values) {
  return {
    position: [...piece.transform.position],
    rotation: [...piece.transform.rotation],
    scale: [...piece.transform.scale],
    [key]: values,
  };
}

function TransformSliderRow({
  defaultValue, label, max, min, onChange, step, testId, unit = null, value,
}) {
  return (
    <div className="tk-field">
      <span className="tk-field-label"><span className="tk-field-label-text">{label}</span></span>
      <Slider
        defaultValue={defaultValue}
        max={max}
        min={min}
        onChange={onChange}
        step={step}
        testId={testId}
        value={value}
      />
      <ScrubValue max={max} min={min} onChange={onChange} step={step} unit={unit} value={value} />
    </div>
  );
}

function PieceTransformControls({ actions, piece }) {
  const [resizeMode, setResizeMode] = useState('stretch');
  const [fillWidth, setFillWidth] = useState(2);
  const [fillDepth, setFillDepth] = useState(1);
  const scale = piece.transform.scale;
  const rotation = piece.transform.rotation;
  const uniformScale = averageScale(scale);

  function setScale(nextScale) {
    actions.setPieceTransform(piece.id, pieceTransformWith(piece, 'scale', nextScale), { coalesce: true });
  }

  function setScaleAxis(axis, value) {
    const nextScale = [...scale];
    nextScale[axis] = clamp(value, SCALE_RANGE.min, SCALE_RANGE.max);
    setScale(nextScale);
  }

  function setUniformScale(value) {
    const clamped = clamp(value, SCALE_RANGE.min, SCALE_RANGE.max);
    const factor = clamped / Math.max(uniformScale, SCALE_RANGE.min);
    setScale(scale.map((entry) => clamp(Number((entry * factor).toFixed(6)), SCALE_RANGE.min, SCALE_RANGE.max)));
  }

  function setRotationAxis(axis, value) {
    const nextRotation = [...rotation];
    nextRotation[axis] = degreesToRadians(clamp(value, ROTATION_RANGE.min, ROTATION_RANGE.max));
    actions.setPieceTransform(piece.id, pieceTransformWith(piece, 'rotation', nextRotation), { coalesce: true });
  }

  return (
    <div className="rk-transform-controls" data-testid="piece-transform-controls">
      <div className="rk-transform-heading">Resize</div>
      <SegmentedControl
        onChange={setResizeMode}
        options={RESIZE_MODE_OPTIONS}
        testId="resize-mode"
        value={resizeMode}
      />
      {resizeMode === 'stretch' ? (
        <>
          <TransformSliderRow
            defaultValue={1}
            label="Size"
            max={SCALE_RANGE.max}
            min={SCALE_RANGE.min}
            onChange={setUniformScale}
            step={SCALE_RANGE.step}
            testId="piece-size"
            value={uniformScale}
          />
          {SCALE_AXES.map((axis) => (
            <TransformSliderRow
              key={axis.testId}
              defaultValue={1}
              label={axis.label}
              max={SCALE_RANGE.max}
              min={SCALE_RANGE.min}
              onChange={(value) => setScaleAxis(axis.axis, value)}
              step={SCALE_RANGE.step}
              testId={axis.testId}
              value={scale[axis.axis]}
            />
          ))}
        </>
      ) : (
        <div className="rk-fill-resize" data-testid="fill-resize-controls">
          <TransformSliderRow
            defaultValue={2}
            label="Tiles wide"
            max={FILL_TILE_RANGE.max}
            min={FILL_TILE_RANGE.min}
            onChange={(value) => setFillWidth(roundTileCount(value))}
            step={FILL_TILE_RANGE.step}
            testId="fill-width"
            value={fillWidth}
          />
          <TransformSliderRow
            defaultValue={1}
            label="Tiles deep"
            max={FILL_TILE_RANGE.max}
            min={FILL_TILE_RANGE.min}
            onChange={(value) => setFillDepth(roundTileCount(value))}
            step={FILL_TILE_RANGE.step}
            testId="fill-depth"
            value={fillDepth}
          />
          <Button
            disabled={fillWidth === 1 && fillDepth === 1}
            icon="plus"
            kind="secondary"
            onClick={() => actions.fillResize({ depthTiles: fillDepth, widthTiles: fillWidth })}
            testId="fill-resize"
          >
            Fill
          </Button>
        </div>
      )}
      <div className="rk-transform-heading">Rotation</div>
      {ROTATION_AXES.map((axis) => (
        <TransformSliderRow
          key={axis.testId}
          defaultValue={0}
          label={axis.label}
          max={ROTATION_RANGE.max}
          min={ROTATION_RANGE.min}
          onChange={(value) => setRotationAxis(axis.axis, value)}
          step={ROTATION_RANGE.step}
          testId={axis.testId}
          unit="deg"
          value={radiansToDegrees(rotation[axis.axis])}
        />
      ))}
    </div>
  );
}

function GroundGapControls({ actions, pieces, state }) {
  const raisedPieces = gapFillDisplayPieces(state, pieces);
  if (!raisedPieces.length) return null;
  const maxGap = Math.max(...raisedPieces.map(pieceGroundGap));
  return (
    <div className="rk-ground-gap" data-testid="ground-gap-controls">
      <div className="rk-transform-heading">Ground gap</div>
      <div className="rk-ground-gap-row">
        <span>{maxGap.toFixed(2)}</span>
        <Button
          icon="plus"
          kind="secondary"
          onClick={() => actions.fillGroundGap({ pieceIds: pieces.map((piece) => piece.id) })}
          testId="fill-ground-gap"
        >
          Fill gap
        </Button>
      </div>
    </div>
  );
}

// --- Start gallery -------------------------------------------------------------

function presetTone(presetId, preset) {
  const name = `${presetId} ${preset.label}`.toLowerCase();
  if (name.includes('moss')) return 'moss';
  if (name.includes('mesa') || name.includes('canyon')) return 'warm';
  if (name.includes('river')) return 'cool';
  if (preset.kind === 'document') return 'stack';
  if (preset.piece?.shape?.type === 'heightfield') return 'terrain';
  if (preset.piece?.shape?.type === 'capsule') return 'spire';
  return 'stone';
}

function presetMeta(preset) {
  if (preset.kind === 'document') {
    return `${preset.pieces?.length ?? 1} pieces`;
  }
  return preset.piece?.shape?.type ?? 'piece';
}

function RockGalleryScreen({ actions, state }) {
  const hasWork = state.bootSource !== 'fresh';

  async function loadProject() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      actions.loadDocumentJson(await file.text(), { label: file.name });
      actions.setView({ gallery: false });
      toast(`Loaded ${file.name}.`);
    } catch (error) {
      toast(`Load failed: ${error.message}`);
    }
  }

  return (
    <div className="rk-gallery tk" data-testid="gallery">
      <header className="rk-gallery-header">
        <span className="rk-gallery-brand"><Icon name="logo-toonlab" /> toonlab / Rock Lab</span>
        <Button icon="download" kind="ghost" onClick={loadProject} testId="gallery-load">
          Load project JSON...
        </Button>
      </header>
      <h1 className="rk-gallery-title">Shape some stone</h1>
      <p className="rk-gallery-sub">Start from a blank slab, a generated rock, or a tuned preset.</p>

      {hasWork && (
        <button
          type="button"
          className="rk-continue"
          data-testid="gallery-continue"
          onClick={() => actions.setView({ gallery: false })}
        >
          <div>
            <div style={{ font: 'var(--type-label)' }}>Continue where you left off</div>
            <div style={{ color: 'var(--text-tertiary)', font: 'var(--type-caption)' }}>
              {state.document.name} · seed {state.seed} · {state.document.pieces.length} piece{state.document.pieces.length === 1 ? '' : 's'}
            </div>
          </div>
          <span className="tk-button" data-kind="primary">Resume</span>
        </button>
      )}

      <div className="rk-gallery-section">Start fresh</div>
      <div className="rk-gallery-grid rk-gallery-grid-start">
        <button
          type="button"
          className="rk-card rk-card-special"
          data-testid="gallery-blank"
          onClick={() => actions.startFromScratch()}
        >
          <Icon name="stage-shape" />
          <div>Blank Canvas</div>
          <span>Begin with a clean drawn slab</span>
        </button>
        <button
          type="button"
          className="rk-card rk-card-special"
          data-testid="gallery-procedural"
          onClick={() => actions.startProcedural()}
        >
          <Icon name="dice" />
          <div>Procedural Seed</div>
          <span>Roll an archetype and seed</span>
        </button>
      </div>

      <div className="rk-gallery-section">Presets ({GALLERY_PRESET_OPTIONS.length})</div>
      <div className="rk-gallery-grid">
        {GALLERY_PRESET_OPTIONS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className="rk-card"
            data-testid={`gallery-preset-${entry.value}`}
            onClick={() => actions.startFromPreset(entry.value)}
          >
            {GALLERY_PRESET_THUMBNAILS[entry.value]
              ? <img alt="" className="rk-card-thumb-image" src={GALLERY_PRESET_THUMBNAILS[entry.value]} />
              : <span className="rk-card-thumb" data-tone={presetTone(entry.value, entry.preset)} />}
            <div>{entry.label}</div>
            <span>{presetMeta(entry.preset)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Top bar --------------------------------------------------------------------

function DocumentMenu({ actions, anchor, onClose, state }) {
  async function saveJson() {
    const filename = `${state.document.name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}.rockproj.json`;
    downloadBlob(serializeRockDocument(state.document, { pretty: true }), filename, 'application/json');
    saveRockProject(state.document, { meta: { preset: state.presetName, seed: state.seed } });
    toast(`Saved ${filename}.`);
    onClose();
  }
  async function loadJson() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      actions.loadDocumentJson(await file.text(), { label: file.name });
      toast(`Loaded ${file.name}.`);
    } catch (error) {
      toast(`Load failed: ${error.message}`);
    }
    onClose();
  }
  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={260}>
      <div className="rk-doc-menu">
        <Button kind="secondary" onClick={saveJson} testId="save-json">Save project JSON…</Button>
        <Button kind="secondary" onClick={loadJson} testId="load-json">Load project JSON…</Button>
        <Button kind="ghost" onClick={() => { actions.setView({ gallery: true }); onClose(); }}>
          Open start screen
        </Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }} testId="reset-lab">
          Reset to preset…
        </Button>
      </div>
    </Popover>
  );
}

function EnvironmentMenu({ actions, anchor, onClose, state }) {
  const { hour } = state.sky;
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
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="tk-field-label"><span className="tk-field-label-text">Grass</span></span>
          <SegmentedControl
            onChange={(grassBlades) => actions.setGrassBlades(grassBlades)}
            options={GRASS_OPTIONS}
            testId="grass-density"
            value={state.grassBlades}
          />
        </div>
        <span style={{ font: 'var(--type-caption)', opacity: 0.6 }}>
          Presentation only — never part of the document or exports.
        </span>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [envAnchor, setEnvAnchor] = useState(null);
  const [exporting, setExporting] = useState(false);

  async function share() {
    const params = new URLSearchParams({
      rockPreset: state.presetName,
      rockRes: String(state.previewResolution),
      rockSeed: String(state.seed),
      scene: 'rock',
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Share URL copied — it rebuilds preset + seed only; use Save JSON for edits.');
    } catch {
      actions.setStatus(url);
    }
  }

  async function exportGlb() {
    setExporting(true);
    try {
      await exportRockDocumentToFile(state.document, { onStatus: actions.setStatus });
      toast('GLB exported.');
    } catch (error) {
      toast(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="rk-topbar tk">
      <button
        type="button"
        className="rk-brand"
        data-testid="topbar-home"
        title="Open start screen"
        onClick={() => actions.setView({ gallery: true })}
      >
        <Icon name="logo-toonlab" /> Rock Lab
      </button>
      <button
        type="button"
        className="rk-topbar-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.document.name}
        <Icon name="chevron-down" />
      </button>
      <IconButton disabled={!state.canUndo} icon="undo" label="Undo (⌘Z)" onClick={() => actions.undo()} testId="undo" />
      <IconButton disabled={!state.canRedo} icon="redo" label="Redo (⇧⌘Z)" onClick={() => actions.redo()} testId="redo" />
      <span className="rk-topbar-spacer" />
      <span className="rk-scene-select">
        <Select
          onChange={(id) => {
            persistLabScene(id);
            navigateSceneHub(id);
          }}
          options={SCENE_HUB_OPTIONS.map((option) => ({ label: option.label, value: option.id }))}
          testId="scene-hub"
          value="rockLab"
        />
      </span>
      <Button
        kind="ghost"
        onClick={(event) => setEnvAnchor({ x: event.clientX, y: event.clientY + 10 })}
        testId="environment-open"
      >
        🌤 Environment
      </Button>
      <Button icon="link" kind="ghost" onClick={share} testId="share">Share</Button>
      <Button
        disabled={exporting}
        icon="stage-export"
        kind="primary"
        onClick={exportGlb}
        testId="export-glb"
      >
        {exporting ? 'Exporting…' : 'Export GLB'}
      </Button>
      {menuAnchor && (
        <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />
      )}
      {envAnchor && (
        <EnvironmentMenu actions={actions} anchor={envAnchor} onClose={() => setEnvAnchor(null)} state={state} />
      )}
    </header>
  );
}

// --- Rail + tools ---------------------------------------------------------------

function StageRail({ actions, state }) {
  return (
    <nav className="rk-rail tk" data-testid="stage-rail">
      <button
        type="button"
        className="rk-rail-stage rk-rail-mode"
        data-mode-active={state.tool === 'orbit'}
        data-testid="rail-move"
        title="Move (V) — rotate, pan, zoom, or transform the selected piece."
        onClick={() => actions.setTool('orbit')}
      >
        <Icon name="tool-move" />
        <span>Move</span>
      </button>
      <div style={{ height: 1, width: 36, background: 'var(--border-subtle)' }} />
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="rk-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          data-testid={`stage-${stage.id}`}
          title={`${stage.label} (${stage.key}) — ${stage.description}`}
          onClick={() => {
            actions.setStage(stage.id);
            actions.setView({ drawer: false });
            if (stage.id === 'pieces') {
              actions.setTool('adjacentTile');
            } else if (state.tool !== 'orbit' && !toolBelongsToStage(state.tool, stage.id)) {
              actions.setTool('orbit');
            }
          }}
        >
          <Icon name={stage.icon} />
          <span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="rk-rail-stage rk-rail-bottom"
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

function ToolStrip({ actions, state }) {
  const stageToolIds = STAGE_TOOLS[state.stage] ?? [];
  const toolIds = [
    ...GLOBAL_TOOL_IDS,
    ...stageToolIds.filter((id) => !GLOBAL_TOOL_IDS.includes(id)),
  ];
  const tools = toolIds.map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);
  if (!tools.length) return null;
  return (
    <div className="rk-toolstrip tk" data-testid="tool-strip">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="rk-tool"
          data-active={state.tool === tool.id}
          data-testid={`tool-${tool.id}`}
          title={`${tool.label} (${tool.key}) — ${tool.description}`}
          onClick={() => actions.setTool(state.tool === tool.id ? 'orbit' : tool.id)}
        >
          <Icon name={tool.icon} />
          <span>{TOOL_CAPTIONS[tool.id] ?? tool.label}</span>
        </button>
      ))}
    </div>
  );
}

function GizmoModeControl({ actions, value }) {
  return (
    <div className="rk-gizmo-mode tk-segmented" data-testid="gizmo-mode" role="group" aria-label="Piece transform mode">
      {GIZMO_MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          data-testid={`gizmo-mode-${option.value}`}
          title={option.title}
          onClick={() => actions.setGizmoMode(option.value)}
        >
          <Icon name={option.icon} />
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function GroundGapQuickAction({ actions, state }) {
  const pieces = selectedPieces(state);
  const raisedPieces = gapFillDisplayPieces(state, pieces);
  if (!raisedPieces.length) return null;
  const maxGap = Math.max(...raisedPieces.map(pieceGroundGap));
  return (
    <div className="rk-gap-quick" data-testid="gap-quick-action">
      <span>Gap {maxGap.toFixed(2)}</span>
      <Button
        icon="plus"
        kind="secondary"
        onClick={() => actions.fillGroundGap({ pieceIds: pieces.map((piece) => piece.id) })}
        testId="fill-ground-gap-quick"
      >
        Fill gap
      </Button>
    </div>
  );
}

function OptionsBar({ actions, state }) {
  const { brush, tool } = state;
  if (tool === 'orbit') {
    return (
      <div className="rk-optionsbar tk" data-testid="options-bar">
        <span>Camera</span>
        <SegmentedControl
          onChange={(mode) => actions.setMoveMode(mode)}
          options={MOVE_MODE_OPTIONS}
          testId="move-mode"
          value={state.moveMode}
        />
        <GizmoModeControl actions={actions} value={state.gizmoMode} />
        <GroundGapQuickAction actions={actions} state={state} />
      </div>
    );
  }
  if (tool === 'adjacentTile') {
    return (
      <div className="rk-optionsbar tk" data-testid="options-bar">
        <span>Tile</span>
        <span className="rk-options-hint">Hover a rock side, then click to add an adjacent tile.</span>
      </div>
    );
  }
  const sculpting = tool === 'sculptAdd' || tool === 'sculptSubtract';
  return (
    <div className="rk-optionsbar tk" data-testid="options-bar">
      {sculpting && (
        <>
          <span>Brush</span>
          <Slider
            defaultValue={0.25}
            max={0.8}
            min={0.05}
            onChange={(radius) => actions.setBrush({ radius })}
            step={0.01}
            testId="brush-radius"
            value={brush.radius}
          />
          <ScrubValue max={0.8} min={0.05} onChange={(radius) => actions.setBrush({ radius })} step={0.01} value={brush.radius} />
          <span>Blend</span>
          <Slider
            defaultValue={0.06}
            max={0.3}
            min={0}
            onChange={(strength) => actions.setBrush({ strength })}
            step={0.005}
            testId="brush-strength"
            value={brush.strength}
          />
          <span className="rk-options-hint">
            {tool === 'sculptAdd' ? 'Paint the area to build; strokes add rock at brush width.' : 'Paint the area to carve; strokes cut through at brush width.'}
          </span>
        </>
      )}
      {tool === 'doodle' && (
        <>
          <span>Depth</span>
          <Slider
            defaultValue={0.45}
            max={1}
            min={0.1}
            onChange={(doodleDepth) => actions.setBrush({ doodleDepth })}
            step={0.01}
            testId="doodle-depth"
            value={brush.doodleDepth}
          />
          <span className="rk-options-hint">
            Draw a closed outline in the air — it becomes a new rock slab piece.
          </span>
        </>
      )}
    </div>
  );
}

// --- Inspector panels -------------------------------------------------------------

function PresetSection({ actions, state }) {
  return (
    <section className="tk-section" data-testid="preset-section">
      <div className="tk-section-title">Document</div>
      <div className="tk-field">
        <span className="tk-field-label"><span className="tk-field-label-text">Preset</span></span>
        <Select
          onChange={(value) => actions.setPreset(value)}
          options={getRockgenPresetOptions().map((option) => ({ label: option.label, value: option.value }))}
          testId="rock-preset"
          value={state.presetName}
        />
        <span />
      </div>
      <div className="tk-field">
        <span className="tk-field-label"><span className="tk-field-label-text">Seed</span></span>
        <div style={{ display: 'flex', gap: 6 }}>
          <TextField
            onCommit={(value) => actions.setSeed(value)}
            testId="rock-seed"
            value={String(state.seed)}
          />
          <IconButton icon="dice" label="Reroll seed (R)" onClick={() => actions.randomizeSeed()} testId="seed-reroll" />
        </div>
        <span />
      </div>
      <div className="tk-field">
        <span className="tk-field-label"><span className="tk-field-label-text">Preview</span></span>
        <Select
          onChange={(value) => actions.setResolution(Number(value))}
          options={RESOLUTION_OPTIONS.map((cells) => ({ label: `${cells} cells`, value: cells }))}
          testId="rock-resolution"
          value={state.previewResolution}
        />
        <span />
      </div>
    </section>
  );
}

function PiecesPanel({ actions, state }) {
  const [addPreset, setAddPreset] = useState('boulder');
  const doc = state.document;
  const editablePieces = doc.pieces.filter((piece) => !isHelperPiece(piece));
  const selectedIds = selectedPieceIds(state);
  const selectedSet = new Set(selectedIds);
  const selectedPieces = editablePieces.filter((piece) => selectedSet.has(piece.id));
  const selected = selectedPieces.find((piece) => piece.id === state.selectedPieceId)
    ?? selectedPieces[0]
    ?? editablePieces[0]
    ?? doc.pieces[0];
  const hasMultiSelection = selectedPieces.length > 1;

  return (
    <>
      <section className="tk-section" data-testid="pieces-panel">
        <div className="tk-section-title">Pieces</div>
        <div className="tk-section-caption">
          Left-fold order: each piece combines onto the ones above it. Click
          a piece in the scene or list to edit its Shape/Detail stages.
        </div>
        <div className="rk-piece-list">
          {editablePieces.map((piece) => (
            <div
              key={piece.id}
              className="rk-piece-row"
              data-selected={selectedSet.has(piece.id)}
              data-testid={`piece-${piece.id}`}
            >
              <button
                type="button"
                className="rk-piece-name"
                onClick={(event) => actions.selectPiece(piece.id, {
                  additive: event.shiftKey || event.metaKey || event.ctrlKey,
                })}
                title={`${piece.combine.op}${piece.combine.blend ? ` (blend ${piece.combine.blend})` : ''}`}
              >
                {piece.name}
              </button>
              <Badge>{piece.combine.op === 'union' ? '∪' : piece.combine.op === 'smoothUnion' ? '∪˜' : piece.combine.op === 'subtract' ? '−' : '∩'}</Badge>
              <IconButton
                icon={piece.hidden ? 'close' : 'check'}
                label={piece.hidden ? 'Show piece' : 'Hide piece'}
                onClick={() => actions.setPieceHidden(piece.id, !piece.hidden)}
                testId={`piece-hide-${piece.id}`}
              />
              <IconButton icon="plus" label="Duplicate piece" onClick={() => actions.duplicatePiece(piece.id)} testId={`piece-dup-${piece.id}`} />
              <IconButton icon="tool-erase" label="Delete piece" onClick={() => actions.removePiece(piece.id)} testId={`piece-del-${piece.id}`} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, margin: '8px 4px 0' }}>
          <Select
            onChange={setAddPreset}
            options={getRockgenPresetOptions('piece').map((option) => ({ label: option.label, value: option.value }))}
            testId="add-piece-preset"
            value={addPreset}
          />
          <Button kind="secondary" onClick={() => actions.addPiece(addPreset)} testId="add-piece">
            + Add
          </Button>
        </div>
      </section>
      <section className="tk-section" data-testid="selected-piece-section">
        <div className="tk-section-title">
          Selected: {hasMultiSelection ? `${selectedPieces.length} pieces` : selected.name}
        </div>
        {hasMultiSelection ? (
          <>
            <div className="tk-section-caption" data-testid="multi-piece-selection">
              Group selection: move gizmo translates all selected pieces.
            </div>
            <GroundGapControls actions={actions} pieces={selectedPieces} state={state} />
          </>
        ) : (
          <>
            <div className="tk-field">
              <span className="tk-field-label"><span className="tk-field-label-text">Name</span></span>
              <TextField
                onCommit={(name) => actions.setPieceName(selected.id, name)}
                testId="piece-name"
                value={selected.name}
              />
              <span />
            </div>
            <div className="tk-field">
              <span className="tk-field-label"><span className="tk-field-label-text">Combine</span></span>
              <Select
                onChange={(op) => actions.setPieceCombine({ op })}
                options={[
                  { label: 'Union', value: 'union' },
                  { label: 'Smooth union', value: 'smoothUnion' },
                  { label: 'Subtract', value: 'subtract' },
                  { label: 'Intersect', value: 'intersect' },
                ]}
                testId="piece-combine"
                value={selected.combine.op}
              />
              <span />
            </div>
            <div className="tk-field">
              <span className="tk-field-label"><span className="tk-field-label-text">Blend</span></span>
              <Slider
                defaultValue={0}
                max={0.8}
                min={0}
                onChange={(blend) => actions.setPieceCombine({ blend })}
                step={0.01}
                testId="piece-blend"
                value={selected.combine.blend}
              />
              <ScrubValue max={0.8} min={0} onChange={(blend) => actions.setPieceCombine({ blend })} step={0.01} value={selected.combine.blend} />
            </div>
            <PieceTransformControls actions={actions} piece={selected} />
            <GroundGapControls actions={actions} pieces={[selected]} state={state} />
          </>
        )}
        <div className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">Merged view</span></span>
          <SegmentedControl
            onChange={(value) => actions.setMergePreview(value === 'merged')}
            options={[
              { label: 'Merged', value: 'merged' },
              { label: 'Per piece', value: 'pieces' },
            ]}
            testId="merge-preview"
            value={state.mergePreview ? 'merged' : 'pieces'}
          />
          <span />
        </div>
      </section>
    </>
  );
}

function sameSurfaceValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

function activeSurfaceTexturePreset(surface) {
  for (const [id, preset] of Object.entries(ROCK_SURFACE_TEXTURE_PRESETS)) {
    const matches = Object.entries(preset.surface)
      .every(([key, value]) => sameSurfaceValue(surface[key], value));
    if (matches) return id;
  }
  return null;
}

function SurfaceTextureSection({ actions, state }) {
  const surface = state.document.surface;
  const active = activeSurfaceTexturePreset(surface);
  return (
    <section className="tk-section" data-testid="surface-texture-section">
      <div className="tk-section-title">Surface texture</div>
      <div className="tk-section-caption">
        Stone grain, veins, staining, lichen, moss, and snow/dust coats.
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 4px',
      }}
      >
        {Object.entries(ROCK_SURFACE_TEXTURE_PRESETS).map(([id, preset]) => (
          <button
            key={id}
            type="button"
            className="tk-button"
            data-kind={active === id ? 'primary' : 'secondary'}
            data-testid={`surface-texture-${id}`}
            title={preset.description}
            onClick={() => actions.setSurfaceTexturePreset(id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function LookExtras({ actions, state }) {
  return (
    <section className="tk-section" data-testid="env-debug-section">
      <div className="tk-section-title">Debug view</div>
      <div className="tk-field">
        <span className="tk-field-label"><span className="tk-field-label-text">Channel</span></span>
        <Select
          onChange={(mode) => actions.setEnvDebug(mode)}
          options={Object.keys(ENVIRONMENT_DEBUG_MODES).map((mode) => ({ label: mode, value: mode }))}
          testId="env-debug"
          value={state.envDebugMode}
        />
        <span />
      </div>
    </section>
  );
}

function PowerDrawer({ actions, state }) {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const matches = (field) => !query
    || field.label.toLowerCase().includes(query)
    || field.group.toLowerCase().includes(query);
  return (
    <>
      <div className="rk-drawer-filter">
        <TextField onCommit={setFilter} placeholder="Filter fields…" testId="drawer-filter" value={filter} />
      </div>
      {ROCKGEN_SETTING_GROUPS.map((group) => (
        <SchemaGroup
          key={group.id}
          fieldFilter={matches}
          fields={ROCKGEN_SETTING_FIELD_SCHEMA[group.id]}
          flat
          getValue={(field) => fieldValue(state, field)}
          group={group}
          isDisabled={(field) => isFieldDisabled(state, field)}
          onChange={(field, value) => actions.setField(field, value)}
          showCaption={false}
        />
      ))}
    </>
  );
}

function Inspector({ actions, state }) {
  if (state.view.drawer) {
    return (
      <aside className="rk-inspector tk" data-drawer="true" data-testid="inspector">
        <div className="rk-inspector-header">All controls</div>
        <div className="rk-inspector-caption">
          Piece groups edit the selected piece; Surface &amp; Meshing edit the document.
        </div>
        <PowerDrawer actions={actions} state={state} />
      </aside>
    );
  }
  const stage = STAGES.find((entry) => entry.id === state.stage) ?? STAGES[0];
  return (
    <aside className="rk-inspector tk" data-testid="inspector">
      <div className="rk-inspector-header">{stage.label}</div>
      <div className="rk-inspector-caption">{stage.description}</div>
      {stage.id === 'shape' && <PresetSection actions={actions} state={state} />}
      {stage.id === 'pieces' && <PiecesPanel actions={actions} state={state} />}
      {stage.id === 'look' && <SurfaceTextureSection actions={actions} state={state} />}
      {stage.id === 'look' && <LookExtras actions={actions} state={state} />}
      <StageGroups actions={actions} groupIds={stage.groups} state={state} />
    </aside>
  );
}

function StatusBar({ actions, engine, state }) {
  // Re-read the engine's dataset stats after every rebuild.
  const [, setTick] = useState(0);
  useEffect(() => engine.onRebuilt(() => setTick((tick) => tick + 1)), [engine]);
  const verts = document.body.dataset.rockVertexCount ?? '0';
  const pieces = document.body.dataset.rockPieceCount ?? '1';
  return (
    <footer className="rk-status tk" data-testid="status-bar">
      <span>{state.status}</span>
      <span className="rk-status-stats">
        seed {state.seed} · {Number(verts).toLocaleString()} verts · {pieces} piece{pieces === '1' ? '' : 's'}
      </span>
      <span className="rk-view-buttons">
        {CAMERA_VIEW_BUTTONS.map((view) => (
          <button
            key={view.view}
            type="button"
            className="tk-button"
            data-kind="ghost"
            data-testid={view.testId}
            title={view.title}
            onClick={() => engine.frameComposition(view.view)}
          >
            {view.label}
          </button>
        ))}
      </span>
      <button
        type="button"
        className="tk-button"
        data-kind={state.mannequin ? 'primary' : 'ghost'}
        data-testid="mannequin-toggle"
        title="Show a 1.8m mannequin next to the rocks for scale"
        onClick={() => actions.setMannequin(!state.mannequin)}
      >
        🧍 Scale
      </button>
      <button
        type="button"
        className="tk-button"
        data-kind={state.walkPreview ? 'primary' : 'ghost'}
        data-testid="walk-toggle"
        title={WALK_PREVIEW_TITLE}
        onClick={() => actions.setWalkPreview(!state.walkPreview)}
      >
        🚶 Walk
      </button>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;

  if (state.view.gallery) {
    return (
      <div className="tk">
        <RockGalleryScreen actions={actions} state={state} />
        <ToastStack />
      </div>
    );
  }

  return (
    <div className="tk">
      <div className="rk-root">
        <TopBar actions={actions} state={state} />
        <StageRail actions={actions} state={state} />
        <Inspector actions={actions} state={state} />
        <StatusBar actions={actions} engine={engine} state={state} />
      </div>
      <ToolStrip actions={actions} state={state} />
      <OptionsBar actions={actions} state={state} />
      <ToastStack />
    </div>
  );
}
