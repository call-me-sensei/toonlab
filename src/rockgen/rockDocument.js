// Rock document: the JSON-serializable source of truth for one rock /
// cliff / mountain project. A flat ordered list of SDF pieces (left-folded
// with their combine ops) plus a global sculpt-edit list — no node graph.
// `revision` is a runtime dirty counter (never serialized); every mutation
// helper bumps it so compileDocument's cache and the lab's schedulers can
// tell stale work from fresh.

import {
  createRockPieceSettings,
  createRockSurfaceSettings,
  createRockgenMeshingSettings,
} from './rockgenSettings.js';
import {
  normalizeRockgenPresetName,
  normalizeRockgenStyleName,
  resolveRockgenPreset,
} from './rockgenPresets.js';
import { compileDocument } from './sdf/fieldCompiler.js';

/** Document type tag stamped on saved rockgen project JSON. */
export const ROCKGEN_PROJECT_DOCUMENT_TYPE = 'toonlab/rockgen-project';

/** Current schema version for rockgen project documents. */
export const ROCKGEN_PROJECT_SCHEMA_VERSION = 2;

const COMBINE_OPS = Object.freeze(['union', 'smoothUnion', 'subtract', 'intersect']);

function vector3Option(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const parts = value.slice(0, 3).map(Number);
    if (parts.every(Number.isFinite)) return parts;
  }
  return [...fallback];
}

function createRockTransform(options = null) {
  const source = options && typeof options === 'object' ? options : {};
  const scale = vector3Option(source.scale, [1, 1, 1]).map((entry) => Math.max(entry, 0.001));
  return {
    position: vector3Option(source.position, [0, 0, 0]),
    rotation: vector3Option(source.rotation, [0, 0, 0]),
    scale,
  };
}

// Drawn outline for 'sketch' shapes: [[x, y], ...] in the piece's local XY
// plane (3+ points, implicit close). Invalid or missing -> null; the
// compiler falls back to the ellipsoid until an outline is drawn.
function outlineOption(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) return null;
    const px = Number(entry[0]);
    const py = Number(entry[1]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    points.push([px, py]);
  }
  return points;
}

function createCombine(options = null) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    blend: Math.max(Number(source.blend) || 0, 0),
    op: COMBINE_OPS.includes(source.op) ? source.op : 'union',
  };
}

function helperOption(value) {
  if (!value || typeof value !== 'object') return null;
  const kind = String(value.kind ?? '').trim();
  return kind ? { kind } : null;
}

function nextId(prefix, entries) {
  let highest = 0;
  for (const entry of entries) {
    const match = /^\w+-(\d+)$/.exec(String(entry.id ?? ''));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${highest + 1}`;
}

/**
 * Creates one rock piece. Accepts a registered piece-preset name, or a
 * partial piece object (`{ name, seed, combine, transform, shape, noise,
 * warp, facet, strata, falloff }`). Ids are assigned when the piece is
 * added to a document.
 */
export function createRockPiece(optionsOrPresetName = null) {
  let source = optionsOrPresetName;
  if (typeof source === 'string') {
    source = resolveRockgenPreset(source).piece;
  }
  source = source && typeof source === 'object' ? source : {};
  const helper = helperOption(source.helper);
  return {
    combine: createCombine(source.combine),
    ...(helper ? { helper } : {}),
    hidden: Boolean(source.hidden),
    id: typeof source.id === 'string' ? source.id : null,
    name: String(source.name ?? 'Rock'),
    outline: outlineOption(source.outline),
    seed: Math.round(Number(source.seed) || 0),
    transform: createRockTransform(source.transform),
    ...createRockPieceSettings(source),
  };
}

/**
 * Creates a rock document. `options` may be a preset name string or
 * `{ seed, preset, style, name, pieces, sculptEdits, surface, meshing }`.
 * With no explicit pieces, one piece is built from the preset (default
 * 'boulder').
 */
export function createRockDocument(options = null) {
  const source = typeof options === 'string'
    ? { preset: options }
    : options && typeof options === 'object' ? options : {};
  // Preset and style are portable identity, not merely Lab UI metadata. A
  // custom/scratch document may explicitly use `preset: null`; otherwise the
  // historical no-argument default remains Boulder.
  const presetId = source.preset === null ? null : normalizeRockgenPresetName(source.preset);
  const styleId = normalizeRockgenStyleName(source.style);
  const preset = resolveRockgenPreset(presetId ?? 'boulder', { style: styleId });

  const document = {
    meshing: createRockgenMeshingSettings(source.meshing ?? preset.meshing),
    name: String(source.name ?? preset.label ?? 'Untitled Rock'),
    pieces: [],
    preset: presetId,
    revision: 0,
    schemaVersion: ROCKGEN_PROJECT_SCHEMA_VERSION,
    sculptEdits: [],
    seed: Math.round(Number(source.seed) || 0) >>> 0,
    style: styleId,
    surface: createRockSurfaceSettings(source.surface ?? preset.surface),
    type: ROCKGEN_PROJECT_DOCUMENT_TYPE,
  };

  const pieceSources = Array.isArray(source.pieces) && source.pieces.length > 0
    ? source.pieces
    : preset.kind === 'document' && Array.isArray(preset.pieces) && preset.pieces.length > 0
      ? preset.pieces
      : [preset.piece ?? {}];
  for (const pieceSource of pieceSources) {
    addPieceToDocument(document, createRockPiece(pieceSource));
  }
  for (const edit of Array.isArray(source.sculptEdits) ? source.sculptEdits : []) {
    applySculptEdit(document, edit);
  }
  document.revision = 0;
  return document;
}

function rockValuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => rockValuesEqual(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key)
        && rockValuesEqual(left[key], right[key]));
  }
  return false;
}

function rebaseRockValue(current, oldBase, newBase) {
  if (rockValuesEqual(current, oldBase)) return structuredClone(newBase);
  if (Array.isArray(current)) {
    if (!Array.isArray(oldBase) || !Array.isArray(newBase)) return structuredClone(current);
    const keyedObjects = current.every((entry) => entry && typeof entry === 'object' && entry.id)
      && oldBase.every((entry) => entry && typeof entry === 'object' && entry.id)
      && newBase.every((entry) => entry && typeof entry === 'object' && entry.id);
    if (!keyedObjects) return structuredClone(current);
    const oldById = new Map(oldBase.map((entry) => [entry.id, entry]));
    const newById = new Map(newBase.map((entry) => [entry.id, entry]));
    return current.map((entry) => (
      oldById.has(entry.id) && newById.has(entry.id)
        ? rebaseRockValue(entry, oldById.get(entry.id), newById.get(entry.id))
        : structuredClone(entry)
    ));
  }
  if (current && typeof current === 'object'
    && oldBase && typeof oldBase === 'object'
    && newBase && typeof newBase === 'object') {
    return Object.fromEntries(Object.keys(current).map((key) => [
      key,
      Object.hasOwn(oldBase, key) && Object.hasOwn(newBase, key)
        ? rebaseRockValue(current[key], oldBase[key], newBase[key])
        : structuredClone(current[key]),
    ]));
  }
  return structuredClone(current);
}

/**
 * Apply another IP-wide rock style without replacing the selected asset or
 * destroying edits. Values still equal to the old style baseline adopt the
 * new baseline; authored differences remain intact.
 */
export function rebaseRockDocumentStyle(document, style = 'default') {
  const current = createRockDocument(document);
  const oldBase = createRockDocument({
    preset: current.preset,
    seed: current.seed,
    style: current.style,
  });
  const nextStyle = normalizeRockgenStyleName(style);
  const newBase = createRockDocument({
    preset: current.preset,
    seed: current.seed,
    style: nextStyle,
  });
  const rebased = rebaseRockValue(current, oldBase, newBase);
  const normalized = createRockDocument({
    ...rebased,
    preset: current.preset,
    style: nextStyle,
  });
  normalized.revision = Math.max(Number(document?.revision) || 0, 0) + 1;
  return normalized;
}

/** Marks the document dirty after direct settings mutation. */
export function bumpDocumentRevision(document) {
  document.revision += 1;
  return document.revision;
}

/** Adds a piece (assigning a unique id if needed) and returns it. */
export function addPieceToDocument(document, piece) {
  if (!piece.id || document.pieces.some((entry) => entry.id === piece.id)) {
    piece.id = nextId('piece', document.pieces);
  }
  document.pieces.push(piece);
  bumpDocumentRevision(document);
  return piece;
}

/** Removes a piece by id; returns true when a piece was removed. */
export function removePieceFromDocument(document, pieceId) {
  const index = document.pieces.findIndex((entry) => entry.id === pieceId);
  if (index === -1) return false;
  document.pieces.splice(index, 1);
  bumpDocumentRevision(document);
  return true;
}

/** Appends a sculpt edit (assigning a unique id) and returns it. */
export function applySculptEdit(document, edit) {
  const applied = {
    blend: Math.max(Number(edit.blend) || 0, 0),
    center: vector3Option(edit.center, [0, 0, 0]),
    end: edit.end ? vector3Option(edit.end, [0, 0, 0]) : null,
    id: null,
    radius: Math.max(Number(edit.radius) || 0.1, 0.001),
    shape: edit.shape === 'capsule' ? 'capsule' : 'sphere',
    tool: edit.tool === 'subtract' ? 'subtract' : 'add',
  };
  applied.id = nextId('edit', document.sculptEdits);
  document.sculptEdits.push(applied);
  bumpDocumentRevision(document);
  return applied;
}

/** Removes the most recent sculpt edit; returns it (or null). */
export function undoLastSculptEdit(document) {
  const edit = document.sculptEdits.pop() ?? null;
  if (edit) bumpDocumentRevision(document);
  return edit;
}

/** World-space AABB of the document's surface: `{ min: [3], max: [3] }`. */
export function computeDocumentBounds(document) {
  const { bounds } = compileDocument(document, { includeHelpers: false });
  return { max: [...bounds.max], min: [...bounds.min] };
}

/** Serializes a document to JSON (dropping the runtime `revision`). */
export function serializeRockDocument(document, { pretty = false } = {}) {
  const { revision, ...serializable } = document;
  return JSON.stringify(serializable, null, pretty ? 2 : undefined);
}

// Ordered migrations: index N upgrades a version-N document to N+1.
// v2 moves the selected asset preset and IP-wide style into the portable
// project itself. Old projects had those values only in browser-local entry
// metadata, so standalone v1 JSON safely falls back to custom/default.
const MIGRATIONS = Object.freeze([
  (document) => ({
    ...document,
    preset: typeof document.preset === 'string' ? document.preset : null,
    schemaVersion: 2,
    style: typeof document.style === 'string' ? document.style : 'default',
  }),
]);

/**
 * Parses, validates, and coerces a rock document from JSON (string or
 * already-parsed object). Unknown fields are dropped, missing fields get
 * defaults, and older schema versions are migrated. Throws with a
 * descriptive message on structural problems.
 */
export function deserializeRockDocument(jsonOrObject) {
  let source = jsonOrObject;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid rock document JSON: ${error.message}`);
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Rock document must be a JSON object.');
  }
  if (source.type !== ROCKGEN_PROJECT_DOCUMENT_TYPE) {
    throw new Error(`Rock document type must be "${ROCKGEN_PROJECT_DOCUMENT_TYPE}".`);
  }
  let version = Number(source.schemaVersion);
  if (!Number.isFinite(version)) version = ROCKGEN_PROJECT_SCHEMA_VERSION;
  if (version > ROCKGEN_PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Rock document schema version ${version} is newer than supported version ${ROCKGEN_PROJECT_SCHEMA_VERSION}.`,
    );
  }
  let migrated = source;
  for (; version < ROCKGEN_PROJECT_SCHEMA_VERSION; version += 1) {
    migrated = MIGRATIONS[version - 1](migrated);
  }
  if (!Array.isArray(migrated.pieces) || migrated.pieces.length === 0) {
    throw new Error('Rock document must contain at least one piece.');
  }
  return createRockDocument({
    meshing: migrated.meshing,
    name: migrated.name,
    pieces: migrated.pieces,
    preset: migrated.preset,
    sculptEdits: migrated.sculptEdits,
    seed: migrated.seed,
    style: migrated.style,
    surface: migrated.surface,
  });
}
