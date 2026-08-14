/**
 * Portable identity for a source-GLB project. Geometry stays outside the JSON
 * document; the document stores only the stable catalog id, deterministic
 * generation/deformation seed, and exact LOD contract needed to rebuild and
 * decode the first-party GLB source.
 */
export function createRockReferenceIdentity(options?: any): {
    archetype: string;
    catalogVersion: number;
    family: string;
    id: string;
    lodRatios: any;
    lodTriangles: any;
    meshEdits: {
        deltas: any;
        meshIndex: number;
    }[];
    role: string;
    series: string;
    sourceMode: string;
    surfaceMode: string;
    targetTriangles: number;
    topFinish: any;
    variation: number;
    variationSeed: number;
};
/**
 * Creates one rock piece. Accepts a registered piece-preset name, or a
 * partial piece object (`{ name, seed, combine, transform, shape, noise,
 * warp, facet, strata, falloff }`). Ids are assigned when the piece is
 * added to a document.
 */
export function createRockPiece(optionsOrPresetName?: any): {
    columns: {};
    cracks: {};
    cuts: {};
    facet: {};
    heightfield: {};
    falloff: {};
    noise: {};
    shape: {};
    strata: {};
    warp: {};
    hidden: boolean;
    id: any;
    name: string;
    outline: number[][];
    seed: number;
    transform: {
        position: any[];
        rotation: any[];
        scale: number[];
    };
    helper?: {
        kind: string;
    };
    combine: {
        blend: number;
        op: any;
    };
};
/**
 * Creates a rock document. `options` may be a preset name string or
 * `{ seed, preset, style, reference, name, pieces, sculptEdits, surface,
 * meshing }`.
 * With no explicit pieces, one piece is built from the preset (default
 * 'boulder').
 */
export function createRockDocument(options?: any): {
    meshing: {};
    name: string;
    pieces: any[];
    preset: string;
    reference: {
        archetype: string;
        catalogVersion: number;
        family: string;
        id: string;
        lodRatios: any;
        lodTriangles: any;
        meshEdits: {
            deltas: any;
            meshIndex: number;
        }[];
        role: string;
        series: string;
        sourceMode: string;
        surfaceMode: string;
        targetTriangles: number;
        topFinish: any;
        variation: number;
        variationSeed: number;
    };
    revision: number;
    schemaVersion: number;
    sculptEdits: any[];
    seed: number;
    style: string;
    surface: {};
    type: string;
};
/**
 * Apply another IP-wide rock style without replacing the selected asset or
 * destroying edits. Values still equal to the old style baseline adopt the
 * new baseline; authored differences remain intact.
 */
export function rebaseRockDocumentStyle(document: any, style?: string): {
    meshing: {};
    name: string;
    pieces: any[];
    preset: string;
    reference: {
        archetype: string;
        catalogVersion: number;
        family: string;
        id: string;
        lodRatios: any;
        lodTriangles: any;
        meshEdits: {
            deltas: any;
            meshIndex: number;
        }[];
        role: string;
        series: string;
        sourceMode: string;
        surfaceMode: string;
        targetTriangles: number;
        topFinish: any;
        variation: number;
        variationSeed: number;
    };
    revision: number;
    schemaVersion: number;
    sculptEdits: any[];
    seed: number;
    style: string;
    surface: {};
    type: string;
};
/** Marks the document dirty after direct settings mutation. */
export function bumpDocumentRevision(document: any): any;
/** Adds a piece (assigning a unique id if needed) and returns it. */
export function addPieceToDocument(document: any, piece: any): any;
/** Removes a piece by id; returns true when a piece was removed. */
export function removePieceFromDocument(document: any, pieceId: any): boolean;
/** Appends a sculpt edit (assigning a unique id) and returns it. */
export function applySculptEdit(document: any, edit: any): {
    blend: number;
    center: any[];
    end: any[];
    id: any;
    radius: number;
    shape: string;
    tool: string;
};
/** Removes the most recent sculpt edit; returns it (or null). */
export function undoLastSculptEdit(document: any): any;
/** World-space AABB of the document's surface: `{ min: [3], max: [3] }`. */
export function computeDocumentBounds(document: any): {
    max: any[];
    min: any[];
};
/** Serializes a document to JSON (dropping the runtime `revision`). */
export function serializeRockDocument(document: any, { pretty }?: {
    pretty?: boolean;
}): string;
/**
 * Parses, validates, and coerces a rock document from JSON (string or
 * already-parsed object). Unknown fields are dropped, missing fields get
 * defaults, and older schema versions are migrated. Throws with a
 * descriptive message on structural problems.
 */
export function deserializeRockDocument(jsonOrObject: any): {
    meshing: {};
    name: string;
    pieces: any[];
    preset: string;
    reference: {
        archetype: string;
        catalogVersion: number;
        family: string;
        id: string;
        lodRatios: any;
        lodTriangles: any;
        meshEdits: {
            deltas: any;
            meshIndex: number;
        }[];
        role: string;
        series: string;
        sourceMode: string;
        surfaceMode: string;
        targetTriangles: number;
        topFinish: any;
        variation: number;
        variationSeed: number;
    };
    revision: number;
    schemaVersion: number;
    sculptEdits: any[];
    seed: number;
    style: string;
    surface: {};
    type: string;
};
/** Document type tag stamped on saved rockgen project JSON. */
export const ROCKGEN_PROJECT_DOCUMENT_TYPE: "toonlab/rockgen-project";
/** Current schema version for rockgen project documents. */
export const ROCKGEN_PROJECT_SCHEMA_VERSION: 5;
/** Sparse source-mesh edits are packed into the portable document so normal
 * sculpting remains below the hosted creation-document limit. Runtime state
 * is still the convenient array form consumed by the editor and compiler. */
export const ROCKGEN_MAX_MESH_EDIT_OPERATIONS: 200;
export const ROCKGEN_MAX_MESH_EDIT_DELTAS: 10000;
export const ROCKGEN_MESH_EDIT_ENCODING: "base64-f32le-v1";
