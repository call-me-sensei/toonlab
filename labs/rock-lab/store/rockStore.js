// Rock Lab store: framework-agnostic document + session state on the
// shared createStore, mirroring Tree Lab's layering. The rock
// document itself is the mutable rockDocument.js object (its revision
// counter drives the engine); the store mirrors that revision into
// immutable state (`docRevision`) so React re-renders, and tags every
// mutation with `lastChange` so the engine knows how much to re-mesh.
//
// Undo/redo are JSON snapshots of the document (the same model the old
// history.js used), coalesced per burst of slider edits.

import { createStore } from '../../shared/ui/index.js';
import {
  addPieceToDocument,
  applySculptEdit,
  bumpDocumentRevision,
  compileDocument,
  createRockDocument,
  createRockPiece,
  deserializeRockDocument,
  normalizeRockgenPresetName,
  removePieceFromDocument,
  ROCK_SURFACE_TEXTURE_PRESETS,
  getRockgenPresetOptions,
  isRockHelperPiece,
  serializeRockDocument,
} from '../../../src/rockgen/index.js';
import { loadRockProject, removeRockProject, saveRockProject } from '../rockProjectStore.js';
import { setLabParams } from '../../shared/labParams.js';

const UNDO_LIMIT = 50;
const EDIT_BURST_MS = 600;

/** Rock Lab tools: camera, adjacent tiling, the sculpt brushes, and the doodle pen. */
export const ROCK_TOOLS = Object.freeze(['orbit', 'adjacentTile', 'sculptAdd', 'sculptSubtract', 'doodle']);
export const ROCK_GIZMO_MODES = Object.freeze(['translate', 'rotate', 'scale']);
export const ROCK_MOVE_MODES = Object.freeze(['rotate', 'pan', 'zoom']);

const TILE_OVERLAP = 0.9;
const GAP_SUPPORT_CELL_SIZE = 0.42;
const GAP_SUPPORT_MAX_COLUMNS = 18;
const GAP_SUPPORT_MAX_ROWS = 12;
const GAP_SUPPORT_FILL = 0.9;
const GAP_SUPPORT_SOLID_THRESHOLD = 0.02;
const TILE_DIRECTIONS = Object.freeze({
  east: [1, 0],
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
});
const PROCEDURAL_START_PRESETS = Object.freeze([
  'boulder',
  'river-boulder',
  'karst-spire',
  'sea-stack',
  'granite-boulder',
  'basalt-columns',
  'cliff-wall',
  'eroded-mesa',
  'canyon-ridge',
  'column-arch',
  'cliff-face',
  'scree-cluster',
  'lowpoly-boulder',
  'mossy-boulder',
  'shard-monolith',
]);
const SCRATCH_OUTLINE = Object.freeze([
  [-0.82, -0.42],
  [0.66, -0.5],
  [0.92, 0.18],
  [0.26, 0.56],
  [-0.68, 0.46],
]);
const DEFAULT_BRUSH_STATE = Object.freeze({ doodleDepth: 0.45, radius: 0.25, strength: 0.06 });
const DEFAULT_GRASS_BLADES = 0;
const MAX_GRASS_BLADES = 500_000;
const DEFAULT_SKY_STATE = Object.freeze({ hour: 12, weather: 'clear' });

function cloneSurfacePatch(patch) {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [
    key,
    Array.isArray(value) ? [...value] : value,
  ]));
}

function finiteNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function parseGrassBlades(value, fallback = DEFAULT_GRASS_BLADES) {
  if (value === null || value === undefined) return fallback;
  const next = Math.floor(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(MAX_GRASS_BLADES, next));
}

function outlinePlanarExtent(outline) {
  if (!Array.isArray(outline) || outline.length < 3) return 1;
  let extent = 0;
  for (const point of outline) {
    if (!Array.isArray(point)) continue;
    extent = Math.max(extent, Math.abs(Number(point[0]) || 0));
  }
  return Math.max(extent, 0.05);
}

function pieceLocalHalfExtents(piece) {
  const shape = piece.shape ?? {};
  const type = shape.type ?? 'ellipsoid';
  const sizeX = Math.max(finiteNumber(shape.sizeX, 1), 0.05);
  const sizeY = Math.max(finiteNumber(shape.sizeY, sizeX), 0.05);
  const sizeZ = Math.max(finiteNumber(shape.sizeZ, sizeX), 0.05);
  if (type === 'sphere') return [sizeX, sizeX, sizeX];
  if (type === 'capsule') return [sizeX, Math.max(finiteNumber(shape.capsuleLength, 1.5) / 2 + sizeX, 0.05), sizeX];
  if (type === 'sketch') return [outlinePlanarExtent(piece.outline), sizeY, sizeZ];
  return [sizeX, sizeY, sizeZ];
}

function pieceTileStep(piece) {
  const [extentX, , extentZ] = pieceLocalHalfExtents(piece);
  const scale = Array.isArray(piece.transform?.scale) ? piece.transform.scale : [1, 1, 1];
  return [
    Math.max(extentX * 2 * finiteNumber(scale[0], 1) * TILE_OVERLAP, 0.35),
    Math.max(extentZ * 2 * finiteNumber(scale[2], 1) * TILE_OVERLAP, 0.35),
  ];
}

function pieceGroundGap(piece) {
  return Math.max(finiteNumber(piece.transform?.position?.[1], 0), 0);
}

function isCutterPiece(piece) {
  const op = piece.combine?.op;
  return op === 'subtract' || op === 'intersect';
}

function isHelperPiece(piece) {
  return isRockHelperPiece(piece);
}

function canFillGroundGap(piece) {
  return !piece.hidden && !isHelperPiece(piece) && !isCutterPiece(piece)
    && pieceGroundGap(piece) > 0.05;
}

function piecePlanarBounds(piece) {
  const [extentX, , extentZ] = pieceLocalHalfExtents(piece);
  const scale = Array.isArray(piece.transform?.scale) ? piece.transform.scale : [1, 1, 1];
  const yaw = pieceYaw(piece);
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const halfX = cos * extentX * finiteNumber(scale[0], 1) + sin * extentZ * finiteNumber(scale[2], 1);
  const halfZ = sin * extentX * finiteNumber(scale[0], 1) + cos * extentZ * finiteNumber(scale[2], 1);
  const position = Array.isArray(piece.transform?.position) ? piece.transform.position : [0, 0, 0];
  const x = finiteNumber(position[0], 0);
  const z = finiteNumber(position[2], 0);
  return {
    maxX: x + halfX,
    maxZ: z + halfZ,
    minX: x - halfX,
    minZ: z - halfZ,
  };
}

function planarBoundsOverlap(a, b, padding = 0.12) {
  const boundsA = piecePlanarBounds(a);
  const boundsB = piecePlanarBounds(b);
  return boundsA.minX <= boundsB.maxX + padding
    && boundsA.maxX + padding >= boundsB.minX
    && boundsA.minZ <= boundsB.maxZ + padding
    && boundsA.maxZ + padding >= boundsB.minZ;
}

function pieceYaw(piece) {
  return finiteNumber(piece.transform?.rotation?.[1], 0);
}

function rotateLocalOffset(piece, localX, localZ) {
  const yaw = pieceYaw(piece);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    cos * localX + sin * localZ,
    -sin * localX + cos * localZ,
  ];
}

function tileSteps(piece, step = null) {
  const [fallbackX, fallbackZ] = pieceTileStep(piece);
  if (Array.isArray(step)) {
    return [
      Math.max(finiteNumber(step[0], fallbackX), 0.35),
      Math.max(finiteNumber(step[1], fallbackZ), 0.35),
    ];
  }
  const scalar = Number(step);
  if (Number.isFinite(scalar) && scalar > 0) {
    return [Math.max(scalar, 0.35), Math.max(scalar, 0.35)];
  }
  return [fallbackX, fallbackZ];
}

function adjacentTileOffset(piece, direction, { space = 'world', step = null } = {}) {
  const vector = TILE_DIRECTIONS[direction] ?? TILE_DIRECTIONS.east;
  const [stepX, stepZ] = tileSteps(piece, step);
  if (space === 'local') {
    const localX = vector[0] * stepX;
    const localZ = vector[1] * stepZ;
    return rotateLocalOffset(piece, localX, localZ);
  }

  const [dirX, dirZ] = vector;
  const [localXAxisX, localXAxisZ] = rotateLocalOffset(piece, 1, 0);
  const [localZAxisX, localZAxisZ] = rotateLocalOffset(piece, 0, 1);
  const projectedHalfStep = Math.abs(dirX * localXAxisX + dirZ * localXAxisZ) * (stepX / 2)
    + Math.abs(dirX * localZAxisX + dirZ * localZAxisZ) * (stepZ / 2);
  const worldStep = Math.max(projectedHalfStep * 2, 0.35);
  return [dirX * worldStep, dirZ * worldStep];
}

function fillTileOffset(piece, tileX, tileZ) {
  const [stepX, stepZ] = pieceTileStep(piece);
  return rotateLocalOffset(piece, tileX * stepX, tileZ * stepZ);
}

function tileSeed(doc, source, sequence) {
  const base = (finiteNumber(doc.seed, 0) + finiteNumber(source.seed, 0)) >>> 0;
  return (base + (sequence + 1) * 2654435761) >>> 0;
}

function createTilePiece(doc, source, { offsetX, offsetZ, sequence }) {
  const copy = createRockPiece(structuredClone({ ...source, id: null }));
  copy.name = `${source.name} Tile ${doc.pieces.length + 1}`;
  copy.seed = tileSeed(doc, source, sequence);
  copy.transform.position = [
    finiteNumber(source.transform?.position?.[0], 0) + offsetX,
    finiteNumber(source.transform?.position?.[1], 0),
    finiteNumber(source.transform?.position?.[2], 0) + offsetZ,
  ];
  if (copy.combine.op === 'subtract' || copy.combine.op === 'intersect' || copy.combine.op === 'union') {
    copy.combine.op = 'smoothUnion';
    copy.combine.blend = Math.max(copy.combine.blend, 0.08);
  }
  return copy;
}

function fillGapSources(doc, ids) {
  const selected = ids
    .map((id) => doc.pieces.find((piece) => piece.id === id))
    .filter(Boolean);
  const sources = [];
  const sourceIds = new Set();
  const addSource = (piece) => {
    if (!canFillGroundGap(piece) || sourceIds.has(piece.id)) return;
    sources.push(piece);
    sourceIds.add(piece.id);
  };

  for (const piece of selected) {
    if (!isCutterPiece(piece)) addSource(piece);
  }

  const selectedCutters = selected.filter((piece) => !piece.hidden && isCutterPiece(piece));
  for (const cutter of selectedCutters) {
    const cutterIndex = doc.pieces.indexOf(cutter);
    for (let index = 0; index < cutterIndex; index += 1) {
      const candidate = doc.pieces[index];
      if (!isHelperPiece(candidate) && planarBoundsOverlap(candidate, cutter, 0.25)) addSource(candidate);
    }
  }

  if (!sources.length && selectedCutters.length) {
    for (const candidate of doc.pieces) {
      if (!isHelperPiece(candidate)) addSource(candidate);
    }
  }
  return sources;
}

function clonedGroup(group) {
  return group && typeof group === 'object' ? structuredClone(group) : {};
}

function supportDetailFromSource(source) {
  const noise = clonedGroup(source.noise);
  noise.amplitude = Math.min(finiteNumber(noise.amplitude, 0.02), 0.035);
  return {
    columns: clonedGroup(source.columns),
    cracks: clonedGroup(source.cracks),
    cuts: { ...clonedGroup(source.cuts), depth: Math.min(finiteNumber(source.cuts?.depth, 0.08), 0.12) },
    facet: clonedGroup(source.facet),
    falloff: { ...clonedGroup(source.falloff), bottomFlatten: 0.15 },
    noise,
    strata: clonedGroup(source.strata),
    warp: clonedGroup(source.warp),
  };
}

function sourceSupportGrid(source) {
  const bounds = piecePlanarBounds(source);
  const width = Math.max(bounds.maxX - bounds.minX, 0.1);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 0.1);
  const columns = Math.min(Math.max(Math.ceil(width / GAP_SUPPORT_CELL_SIZE), 2), GAP_SUPPORT_MAX_COLUMNS);
  const rows = Math.min(Math.max(Math.ceil(depth / GAP_SUPPORT_CELL_SIZE), 2), GAP_SUPPORT_MAX_ROWS);
  return {
    bounds,
    cellDepth: depth / rows,
    cellWidth: width / columns,
    columns,
    rows,
    sampleY: finiteNumber(source.transform?.position?.[1], 0),
  };
}

function supportCellIsSolid(program, x, y, z) {
  return program.evaluate(x, y, z) <= GAP_SUPPORT_SOLID_THRESHOLD;
}

function createSupportPlacements(program, source, sequenceStart) {
  const gap = pieceGroundGap(source);
  if (gap <= 0.05) return { placements: [], sequence: sequenceStart };
  const grid = sourceSupportGrid(source);
  const placements = [];
  let sequence = sequenceStart;
  for (let row = 0; row < grid.rows; row += 1) {
    const centerZ = grid.bounds.minZ + (row + 0.5) * grid.cellDepth;
    let runStart = null;
    for (let column = 0; column <= grid.columns; column += 1) {
      const centerX = grid.bounds.minX + (column + 0.5) * grid.cellWidth;
      const solid = column < grid.columns
        && supportCellIsSolid(program, centerX, grid.sampleY, centerZ);
      if (solid && runStart === null) runStart = column;
      if ((!solid || column === grid.columns) && runStart !== null) {
        const runEnd = column - 1;
        const runWidth = (runEnd - runStart + 1) * grid.cellWidth;
        placements.push({
          centerX: grid.bounds.minX + (runStart + (runEnd - runStart + 1) / 2) * grid.cellWidth,
          centerZ,
          gap,
          sequence,
          sizeX: Math.max((runWidth * GAP_SUPPORT_FILL) / 2, 0.05),
          sizeY: Math.max(gap, 0.12),
          sizeZ: Math.max((grid.cellDepth * GAP_SUPPORT_FILL) / 2, 0.05),
          source,
        });
        sequence += 1;
        runStart = null;
      }
    }
  }
  return { placements, sequence };
}

function createGroundSupportPiece(doc, placement) {
  const { source } = placement;
  const detail = supportDetailFromSource(source);
  return createRockPiece({
    ...detail,
    combine: { blend: 0.14, op: 'smoothUnion' },
    helper: { kind: 'groundSupport' },
    name: `${source.name} Ground Support ${placement.sequence + 1}`,
    seed: tileSeed(doc, source, placement.sequence),
    shape: {
      cornerRadius: 0.12,
      sizeX: placement.sizeX,
      sizeY: placement.sizeY,
      sizeZ: placement.sizeZ,
      type: 'box',
    },
    transform: {
      position: [
        Number(placement.centerX.toFixed(6)),
        0,
        Number(placement.centerZ.toFixed(6)),
      ],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  });
}

function hasExplicitRockStart(urlParams) {
  return ['rockPreset', 'rockSeed', 'rockRes'].some((key) => urlParams.has(key));
}

function randomSeed() {
  return Math.floor(Math.random() * 100000);
}

function createScratchRockDocument({ seed = 0 } = {}) {
  return createRockDocument({
    meshing: { normalsMode: 'flat', previewResolution: 64 },
    name: 'Untitled Rock',
    pieces: [{
      cuts: { enabled: false },
      falloff: { bottomFlatten: 0.08 },
      name: 'Drawn Blank',
      noise: { amplitude: 0.015, enabled: false },
      outline: SCRATCH_OUTLINE,
      shape: {
        cornerRadius: 0.22,
        sizeZ: 0.42,
        type: 'sketch',
      },
      strata: { enabled: false },
      warp: { enabled: false },
    }],
    seed,
    surface: {
      baseColor: [0.52, 0.5, 0.46],
      cavityColor: [0.32, 0.3, 0.26],
      topColor: [0.68, 0.7, 0.66],
    },
  });
}

function randomProceduralPreset() {
  const registered = new Set(getRockgenPresetOptions().map((option) => option.value));
  const candidates = PROCEDURAL_START_PRESETS.filter((preset) => registered.has(preset));
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 'boulder';
}

function shouldStartMerged(doc) {
  return doc.pieces.length > 1
    || doc.pieces.some((piece, index) => index > 0
      && (piece.combine?.op === 'subtract' || piece.combine?.op === 'intersect'));
}

export function createRockStore({ urlParams }) {
  const presetName = normalizeRockgenPresetName(urlParams.get('rockPreset'));
  const seed = Math.max(Math.round(Number(urlParams.get('rockSeed'))) || 0, 0);
  const explicitStart = hasExplicitRockStart(urlParams);

  // Boot document priority: explicit URL starts fresh; otherwise restore an
  // autosaved working copy only while it matches the current preset + seed.
  let document = null;
  let bootSource = explicitStart ? 'url' : 'fresh';
  const autosaved = explicitStart ? null : loadRockProject();
  if (autosaved && autosaved.meta.preset === presetName && autosaved.meta.seed === seed) {
    document = autosaved.document;
    bootSource = 'persisted';
  }
  if (!document) document = createRockDocument({ preset: presetName, seed });

  const store = createStore({
    brush: { ...DEFAULT_BRUSH_STATE },
    bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: document.revision,
    document,
    envDebugMode: urlParams.get('envDebug') || 'off',
    grassBlades: parseGrassBlades(urlParams.get('grass')),
    gizmoMode: 'translate',
    // Engine hint for the latest document change: pieceLevel edits re-mesh
    // only the selected piece in per-piece preview; reframe recenters the
    // camera (preset/load); immediate skips the re-mesh debounce.
    lastChange: { immediate: false, pieceLevel: false, reframe: false },
    mannequin: false,
    mergePreview: urlParams.get('rockMerge') !== '0',
    moveMode: 'rotate',
    presetName,
    previewResolution: Math.round(Number(urlParams.get('rockRes'))) || document.meshing.previewResolution,
    seed,
    selectedPieceId: document.pieces[0].id,
    selectedPieceIds: [document.pieces[0].id],
    // Environment presentation (session-only, never document data).
    sky: { ...DEFAULT_SKY_STATE },
    stage: 'shape',
    status: 'Ready.',
    tool: 'orbit',
    view: { drawer: false, export: false, gallery: bootSource === 'fresh' },
    walkPreview: false,
  });

  const undoStack = [];
  const redoStack = [];
  let lastSnapshotAt = -Infinity;
  let lastSnapshotKey = null;
  let autosaveTimer = 0;

  function currentDocument() {
    return store.getState().document;
  }

  function autosaveSoon() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const state = store.getState();
      saveRockProject(state.document, { meta: { preset: state.presetName, seed: state.seed } });
    }, 1000);
  }

  function clearHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
    resetSnapshotBurst();
  }

  function replaceDocumentForStart(doc, {
    mergePreview = false,
    preset = 'boulder',
    seed: nextSeed = doc.seed,
    status = 'Ready.',
    stage = 'shape',
    tool = 'orbit',
  } = {}) {
    removeRockProject();
    clearHistory();
    store.setState({
      bootSource: 'started',
      brush: { ...DEFAULT_BRUSH_STATE },
      canRedo: false,
      canUndo: false,
      document: doc,
      envDebugMode: 'off',
      grassBlades: DEFAULT_GRASS_BLADES,
      gizmoMode: 'translate',
      mannequin: false,
      mergePreview,
      moveMode: 'rotate',
      presetName: normalizeRockgenPresetName(preset),
      previewResolution: doc.meshing.previewResolution,
      seed: nextSeed,
      selectedPieceId: doc.pieces[0].id,
      selectedPieceIds: [doc.pieces[0].id],
      sky: { ...DEFAULT_SKY_STATE },
      stage,
      status,
      tool,
      view: { drawer: false, export: false, gallery: false },
      walkPreview: false,
    });
    setLabParams({
      envDebug: null,
      rockMerge: mergePreview ? null : '0',
      rockPreset: preset,
      rockRes: String(doc.meshing.previewResolution),
      rockSeed: String(nextSeed),
    }, { navigate: false });
    commit({ immediate: true, reframe: true });
  }

  /** Pushes an undo snapshot; bursts within EDIT_BURST_MS coalesce. */
  function snapshot({ coalesce = false, key = 'document' } = {}) {
    const now = performance.now();
    if (coalesce && key === lastSnapshotKey && now - lastSnapshotAt < EDIT_BURST_MS) {
      lastSnapshotAt = now;
      return;
    }
    lastSnapshotAt = now;
    lastSnapshotKey = coalesce ? key : null;
    undoStack.push({
      json: serializeRockDocument(currentDocument()),
      selectedPieceId: store.getState().selectedPieceId,
      selectedPieceIds: [...(store.getState().selectedPieceIds ?? [])],
    });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function resetSnapshotBurst() {
    lastSnapshotAt = -Infinity;
    lastSnapshotKey = null;
  }

  /** Publishes a document mutation to subscribers (engine + React). */
  function commit(change = {}) {
    const doc = currentDocument();
    store.setState({
      canRedo: redoStack.length > 0,
      canUndo: undoStack.length > 0,
      docRevision: doc.revision,
      lastChange: {
        immediate: false, pieceLevel: false, reframe: false, ...change,
      },
    });
    autosaveSoon();
  }

  function restore(entry, counterpartStack) {
    resetSnapshotBurst();
    counterpartStack.push({
      json: serializeRockDocument(currentDocument()),
      selectedPieceId: store.getState().selectedPieceId,
      selectedPieceIds: [...(store.getState().selectedPieceIds ?? [])],
    });
    const restored = deserializeRockDocument(entry.json);
    bumpDocumentRevision(restored);
    const selectedPieceId = restored.pieces.some((piece) => piece.id === entry.selectedPieceId)
      ? entry.selectedPieceId
      : restored.pieces[0].id;
    const selectedPieceIds = Array.isArray(entry.selectedPieceIds)
      ? entry.selectedPieceIds.filter((id) => restored.pieces.some((piece) => piece.id === id))
      : [selectedPieceId];
    store.setState({
      document: restored,
      selectedPieceId,
      selectedPieceIds: selectedPieceIds.length ? selectedPieceIds : [selectedPieceId],
    });
    commit({ immediate: true });
  }

  function selectedPiece() {
    const state = store.getState();
    return state.document.pieces.find((piece) => piece.id === state.selectedPieceId && !isHelperPiece(piece))
      ?? state.document.pieces.find((piece) => !isHelperPiece(piece))
      ?? state.document.pieces[0];
  }

  function validSelectedPieceIds(doc = currentDocument(), ids = store.getState().selectedPieceIds) {
    const available = new Set(doc.pieces
      .filter((piece) => !isHelperPiece(piece))
      .map((piece) => piece.id));
    const unique = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (available.has(id) && !unique.includes(id)) unique.push(id);
    }
    const fallback = doc.pieces.find((piece) => !isHelperPiece(piece)) ?? doc.pieces[0];
    return unique.length ? unique : [fallback.id];
  }

  function transformVector(value, fallback, { min = -Infinity } = {}) {
    const source = Array.isArray(value) ? value : fallback;
    return [0, 1, 2].map((axis) => {
      const fallbackValue = Number(fallback?.[axis]) || 0;
      const next = Number(source?.[axis]);
      return Math.max(Number.isFinite(next) ? next : fallbackValue, min);
    });
  }

  store.actions = {
    /**
     * Adds a doodled sketch piece from the doodle tool. `outline` is the
     * centered 2D polygon, `position`/`yaw` place its work plane in
     * document space, `radius` is the outline's max planar extent.
     */
    addDoodlePiece({ outline, position, radius, yaw }) {
      snapshot();
      const doc = currentDocument();
      const { doodleDepth } = store.getState().brush;
      const piece = createRockPiece({
        // The drawn silhouette IS the shape: displacement stays quiet and
        // cuts stay off so the outline survives to the mesh.
        falloff: { bottomFlatten: 0 },
        name: `Doodle Rock ${doc.pieces.length + 1}`,
        noise: { amplitude: 0.05, frequency: 1.6, octaves: 3 },
        outline,
        shape: { cornerRadius: 0.3, sizeZ: Math.max(radius * doodleDepth, 0.05), type: 'sketch' },
        transform: { position, rotation: [0, yaw, 0] },
        warp: { enabled: false },
      });
      piece.seed = doc.pieces.length * 11 + 3;
      addPieceToDocument(doc, piece);
      store.setState({ selectedPieceId: piece.id, selectedPieceIds: [piece.id] });
      commit();
      this.setStatus(`Drew "${piece.name}" — its stages are now editable like any piece.`);
    },

    addPiece(piecePresetName) {
      snapshot();
      const doc = currentDocument();
      const piece = createRockPiece(piecePresetName);
      // Seeded side placement so new pieces don't spawn inside the others.
      const offset = 1.2 + doc.pieces.length * 0.7;
      piece.transform.position = [offset, 0, ((doc.pieces.length % 3) - 1) * 0.8];
      piece.seed = doc.pieces.length * 7 + 1;
      addPieceToDocument(doc, piece);
      store.setState({ selectedPieceId: piece.id, selectedPieceIds: [piece.id] });
      commit();
    },

    addAdjacentPiece({
      direction = 'east', pieceId = null, space = 'world', step = null,
    } = {}) {
      const doc = currentDocument();
      const source = pieceId
        ? doc.pieces.find((piece) => piece.id === pieceId)
        : selectedPiece();
      if (!source) return;
      const [offsetX, offsetZ] = adjacentTileOffset(source, direction, { space, step });
      snapshot();
      const copy = createTilePiece(doc, source, {
        offsetX,
        offsetZ,
        sequence: 0,
      });
      addPieceToDocument(doc, copy);
      store.setState({ selectedPieceId: copy.id, selectedPieceIds: [copy.id] });
      commit();
      this.setStatus(`Added ${direction} tile from "${source.name}".`);
    },

    /** Sculpt stroke lifecycle: one undo snapshot per stroke, live edits. */
    beginSculptStroke() {
      snapshot();
    },
    duplicatePiece(pieceId) {
      snapshot();
      const doc = currentDocument();
      const source = doc.pieces.find((piece) => piece.id === pieceId);
      if (!source) return;
      const copy = createRockPiece(structuredClone({ ...source, id: null }));
      copy.name = `${source.name} Copy`;
      copy.transform.position[0] += 0.8;
      addPieceToDocument(doc, copy);
      store.setState({ selectedPieceId: copy.id, selectedPieceIds: [copy.id] });
      commit();
    },
    endSculptStroke(editCount) {
      commit();
      this.setStatus(`Sculpted ${editCount} segment${editCount === 1 ? '' : 's'}.`);
    },
    applySculptStroke(edits, { label = 'Sculpted' } = {}) {
      if (!Array.isArray(edits) || edits.length === 0) return;
      snapshot();
      const doc = currentDocument();
      for (const edit of edits) applySculptEdit(doc, edit);
      commit({ immediate: true });
      this.setStatus(`${label} ${edits.length} segment${edits.length === 1 ? '' : 's'}.`);
    },
    extendSculptStroke(edit) {
      applySculptEdit(currentDocument(), edit);
      commit();
    },

    fillResize({ depthTiles = 1, widthTiles = 2 } = {}) {
      const doc = currentDocument();
      const source = selectedPiece();
      if (!source) return;
      const width = Math.min(Math.max(Math.round(Number(widthTiles)) || 1, 1), 6);
      const depth = Math.min(Math.max(Math.round(Number(depthTiles)) || 1, 1), 6);
      const count = width * depth - 1;
      if (count <= 0) {
        this.setStatus('Fill resize needs at least two tiles.');
        return;
      }
      snapshot();
      let sequence = 0;
      for (let z = 0; z < depth; z += 1) {
        for (let x = 0; x < width; x += 1) {
          if (x === 0 && z === 0) continue;
          const [offsetX, offsetZ] = fillTileOffset(source, x, z);
          const copy = createTilePiece(doc, source, {
            offsetX,
            offsetZ,
            sequence,
          });
          addPieceToDocument(doc, copy);
          sequence += 1;
        }
      }
      store.setState({ selectedPieceId: source.id, selectedPieceIds: [source.id] });
      commit();
      this.setStatus(`Filled ${width} x ${depth} tiles with ${count} generated piece${count === 1 ? '' : 's'}.`);
    },

    fillGroundGap({ pieceIds = null } = {}) {
      const doc = currentDocument();
      const ids = validSelectedPieceIds(doc, pieceIds ?? store.getState().selectedPieceIds);
      const sources = fillGapSources(doc, ids);
      if (!sources.length) {
        this.setStatus('No raised pieces need ground gap fill.');
        return;
      }

      const program = compileDocument(doc, { includeHelpers: false });
      const placements = [];
      let sequence = 0;
      for (const source of sources) {
        const result = createSupportPlacements(program, source, sequence);
        placements.push(...result.placements);
        sequence = result.sequence;
      }
      if (!placements.length) {
        this.setStatus('No solid underside found to drop supports from.');
        return;
      }

      snapshot();
      const createdIds = [];
      for (const placement of placements) {
        const copy = createGroundSupportPiece(doc, placement);
        addPieceToDocument(doc, copy);
        createdIds.push(copy.id);
      }
      setLabParams({ rockMerge: null }, { navigate: false });
      store.setState({
        mergePreview: true,
        selectedPieceId: ids.includes(store.getState().selectedPieceId)
          ? store.getState().selectedPieceId
          : ids[0],
        selectedPieceIds: ids,
      });
      commit({ immediate: true });
      this.setStatus(`Filled ground gap with ${createdIds.length} hidden support${createdIds.length === 1 ? '' : 's'}.`);
    },

    getSelectedPiece: selectedPiece,

    loadDocumentJson(jsonText, { label = 'document' } = {}) {
      snapshot();
      const restored = deserializeRockDocument(jsonText);
      bumpDocumentRevision(restored);
      store.setState({
        document: restored,
        previewResolution: restored.meshing.previewResolution,
        selectedPieceId: restored.pieces[0].id,
        selectedPieceIds: [restored.pieces[0].id],
      });
      commit({ immediate: true, reframe: true });
      this.setStatus(`Loaded ${label}.`);
    },

    randomizeSeed() {
      this.setSeed(Math.floor(Math.random() * 100000));
    },

    startFromPreset(preset) {
      const nextPreset = normalizeRockgenPresetName(preset);
      const nextSeed = 0;
      const doc = createRockDocument({ preset: nextPreset, seed: nextSeed });
      replaceDocumentForStart(doc, {
        mergePreview: shouldStartMerged(doc),
        preset: nextPreset,
        seed: nextSeed,
        status: `Started from ${doc.name}.`,
      });
    },

    startFromScratch() {
      const doc = createScratchRockDocument({ seed: 0 });
      replaceDocumentForStart(doc, {
        preset: 'boulder',
        seed: 0,
        status: 'Blank rock ready - draw a silhouette with the Doodle tool or edit the starter slab.',
        tool: 'doodle',
      });
    },

    startProcedural() {
      const nextPreset = randomProceduralPreset();
      const nextSeed = randomSeed();
      const doc = createRockDocument({ preset: nextPreset, seed: nextSeed });
      replaceDocumentForStart(doc, {
        mergePreview: shouldStartMerged(doc),
        preset: nextPreset,
        seed: nextSeed,
        status: `Fresh procedural ${doc.name} - tweak the seed, pieces, or surface texture.`,
      });
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
    },

    removePiece(pieceId) {
      const doc = currentDocument();
      if (doc.pieces.length <= 1) {
        this.setStatus('A document needs at least one piece.');
        return;
      }
      snapshot();
      removePieceFromDocument(doc, pieceId);
      const state = store.getState();
      const selectedPieceIds = validSelectedPieceIds(doc, (state.selectedPieceIds ?? [state.selectedPieceId])
        .filter((id) => id !== pieceId));
      const selectedPieceId = selectedPieceIds.includes(state.selectedPieceId)
        ? state.selectedPieceId
        : selectedPieceIds[0];
      store.setState({ selectedPieceId, selectedPieceIds });
      commit();
    },

    resetLab() {
      removeRockProject();
      const state = store.getState();
      setLabParams({
        envDebug: null, rockMerge: null, rockPreset: null, rockRes: null, rockSeed: null,
      }, { navigate: false });
      const fresh = createRockDocument({ preset: state.presetName, seed: state.seed });
      snapshot();
      store.setState({
        brush: { ...DEFAULT_BRUSH_STATE },
        document: fresh,
        envDebugMode: 'off',
        grassBlades: DEFAULT_GRASS_BLADES,
        gizmoMode: 'translate',
        mannequin: false,
        moveMode: 'rotate',
        previewResolution: fresh.meshing.previewResolution,
        selectedPieceId: fresh.pieces[0].id,
        selectedPieceIds: [fresh.pieces[0].id],
        sky: { ...DEFAULT_SKY_STATE },
        stage: 'shape',
        tool: 'orbit',
        view: { drawer: false, export: false, gallery: false },
        walkPreview: false,
      });
      commit({ immediate: true, reframe: true });
      this.setStatus('Lab reset to the preset document.');
    },

    selectPiece(pieceId, { additive = false, preserveMulti = false } = {}) {
      const doc = currentDocument();
      if (!doc.pieces.some((piece) => piece.id === pieceId && !isHelperPiece(piece))) return;
      const current = validSelectedPieceIds(doc);
      if (!additive) {
        if (preserveMulti && current.length > 1 && current.includes(pieceId)) {
          store.setState({ selectedPieceId: pieceId, selectedPieceIds: current });
          return;
        }
        store.setState({ selectedPieceId: pieceId, selectedPieceIds: [pieceId] });
        return;
      }
      const state = store.getState();
      const wasSelected = current.includes(pieceId);
      const selectedPieceIds = wasSelected
        ? current.filter((id) => id !== pieceId)
        : [...current, pieceId];
      const next = selectedPieceIds.length ? selectedPieceIds : [pieceId];
      const selectedPieceId = wasSelected && next.includes(state.selectedPieceId)
        ? state.selectedPieceId
        : next[next.length - 1];
      store.setState({ selectedPieceId, selectedPieceIds: next });
    },

    setBrush(patch) {
      store.setState({ brush: { ...store.getState().brush, ...patch } });
    },

    setEnvDebug(mode) {
      store.setState({ envDebugMode: mode });
      setLabParams({ envDebug: mode === 'off' ? null : mode }, { navigate: false });
    },

    setGizmoMode(mode) {
      if (!ROCK_GIZMO_MODES.includes(mode)) return;
      const patch = { gizmoMode: mode, tool: 'orbit' };
      if (store.getState().mergePreview) {
        patch.mergePreview = false;
        setLabParams({ rockMerge: '0' }, { navigate: false });
      }
      store.setState(patch);
    },

    /**
     * Schema field edit. Piece groups route to the selected piece; surface
     * and meshing live on the document. Surface/meshing changes always
     * re-mesh the whole document (baked colors / normals mode).
     */
    setField(field, value) {
      const doc = currentDocument();
      const isDocumentGroup = field.group === 'surface' || field.group === 'meshing';
      const snapshotKey = isDocumentGroup
        ? `field:document:${field.group}.${field.key}`
        : `field:${store.getState().selectedPieceId}:${field.group}.${field.key}`;
      snapshot({ coalesce: true, key: snapshotKey });
      const target = isDocumentGroup ? doc[field.group] : selectedPiece()[field.group];
      target[field.key] = value;
      bumpDocumentRevision(doc);
      commit({ pieceLevel: !isDocumentGroup });
    },

    setMannequin(value) {
      store.setState({ mannequin: Boolean(value) });
    },

    setMergePreview(value) {
      store.setState({ mergePreview: value });
      setLabParams({ rockMerge: value ? null : '0' }, { navigate: false });
    },

    setMoveMode(moveMode) {
      if (!ROCK_MOVE_MODES.includes(moveMode)) return;
      store.setState({ moveMode, tool: 'orbit' });
    },

    setPieceCombine(patch) {
      const piece = selectedPiece();
      if (!piece) return;
      snapshot({ coalesce: true, key: `combine:${piece.id}` });
      piece.combine = { ...piece.combine, ...patch };
      bumpDocumentRevision(currentDocument());
      commit();
    },

    setPieceHidden(pieceId, hidden) {
      snapshot();
      const doc = currentDocument();
      const piece = doc.pieces.find((entry) => entry.id === pieceId);
      if (!piece) return;
      piece.hidden = hidden;
      bumpDocumentRevision(doc);
      commit();
    },

    setPieceName(pieceId, name) {
      const doc = currentDocument();
      const piece = doc.pieces.find((entry) => entry.id === pieceId);
      if (!piece || !name.trim()) return;
      snapshot();
      piece.name = name.trim();
      bumpDocumentRevision(doc);
      commit({ pieceLevel: true });
    },

    setPieceTransform(pieceId, transform, { coalesce = false } = {}) {
      const doc = currentDocument();
      const piece = doc.pieces.find((entry) => entry.id === pieceId);
      if (!piece) return;
      snapshot({ coalesce, key: `transform:${pieceId}` });
      piece.transform = {
        position: transformVector(transform?.position, piece.transform.position),
        rotation: transformVector(transform?.rotation, piece.transform.rotation),
        scale: transformVector(transform?.scale, piece.transform.scale, { min: 0.001 }),
      };
      bumpDocumentRevision(doc);
      commit({ pieceLevel: true });
    },

    translateSelectedPieces(delta) {
      const doc = currentDocument();
      const selectedPieceIds = validSelectedPieceIds(doc);
      if (selectedPieceIds.length <= 1) return;
      const vector = transformVector(delta, [0, 0, 0]);
      if (vector.every((entry) => Math.abs(entry) < 1e-6)) return;
      snapshot({ key: `translate:${selectedPieceIds.join('|')}` });
      for (const pieceId of selectedPieceIds) {
        const piece = doc.pieces.find((entry) => entry.id === pieceId);
        if (!piece) continue;
        piece.transform.position = piece.transform.position.map((entry, axis) => (
          Number((entry + vector[axis]).toFixed(6))
        ));
      }
      bumpDocumentRevision(doc);
      commit({ immediate: true });
    },

    setPreset(value) {
      snapshot();
      const state = store.getState();
      const nextPreset = normalizeRockgenPresetName(value);
      const doc = createRockDocument({ preset: nextPreset, seed: state.seed });
      const mergePreview = shouldStartMerged(doc);
      store.setState({
        document: doc,
        mergePreview,
        presetName: nextPreset,
        // Resolution is part of a preset's look (low-poly presets mesh
        // coarse), so preset changes drive the resolution, not the reverse.
        previewResolution: doc.meshing.previewResolution,
        selectedPieceId: doc.pieces[0].id,
        selectedPieceIds: [doc.pieces[0].id],
      });
      setLabParams(
        {
          rockMerge: mergePreview ? null : '0',
          rockPreset: nextPreset,
          rockRes: String(doc.meshing.previewResolution),
        },
        { navigate: false },
      );
      commit({ immediate: true, reframe: true });
    },

    setResolution(value) {
      const doc = currentDocument();
      snapshot({ coalesce: true, key: 'resolution' });
      store.setState({ previewResolution: value });
      doc.meshing.previewResolution = value;
      bumpDocumentRevision(doc);
      setLabParams({ rockRes: String(value) }, { navigate: false });
      commit();
    },

    setSeed(value) {
      snapshot();
      const doc = currentDocument();
      const next = Math.max(Math.round(Number(value)) || 0, 0);
      store.setState({ seed: next });
      doc.seed = next >>> 0;
      bumpDocumentRevision(doc);
      setLabParams({ rockSeed: String(next) }, { navigate: false });
      commit();
    },

    setSurfaceTexturePreset(presetId) {
      const preset = ROCK_SURFACE_TEXTURE_PRESETS[presetId];
      if (!preset) return;
      snapshot();
      const doc = currentDocument();
      doc.surface = {
        ...doc.surface,
        ...cloneSurfacePatch(preset.surface),
      };
      bumpDocumentRevision(doc);
      commit();
      this.setStatus(`Applied ${preset.label} surface texture.`);
    },

    setSky(patch) {
      store.setState({ sky: { ...store.getState().sky, ...patch } });
    },

    setGrassBlades(value) {
      store.setState({ grassBlades: parseGrassBlades(value) });
    },

    setStage(stage) {
      const patch = { stage };
      if (stage === 'pieces' && store.getState().stage !== 'pieces') {
        patch.tool = 'adjacentTile';
      }
      store.setState(patch);
    },

    setStatus(status) {
      store.setState({ status });
    },

    setTool(tool) {
      if (!ROCK_TOOLS.includes(tool)) return;
      const patch = { tool };
      // Sculpt edits apply to the folded field, which only the merged
      // preview shows — flip it on rather than sculpting blind.
      if ((tool === 'sculptAdd' || tool === 'sculptSubtract') && !store.getState().mergePreview) {
        patch.mergePreview = true;
        setLabParams({ rockMerge: null }, { navigate: false });
      }
      store.setState(patch);
    },

    setView(patch) {
      store.setState({ view: { ...store.getState().view, ...patch } });
    },

    setWalkPreview(value) {
      store.setState({ walkPreview: Boolean(value) });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
    },
  };

  return store;
}
