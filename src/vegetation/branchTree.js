import * as THREE from 'three';

import { StylizedTree } from './stylizedTree.js';

export const BRANCH_TREE_DOCUMENT_TYPE = 'toonlab/branch-tree';
export const BRANCH_TREE_DOCUMENT_VERSION = 1;

export const BRANCH_TREE_LEAF_SHAPES = Object.freeze([
  'teardrop',
  'round',
  'oak',
  'maple',
  'gingko',
]);

export const DEFAULT_BRANCH_TREE_SETTINGS = Object.freeze({
  seed: 1,
  size: 1,
  branches: Object.freeze({
    angle: 54,
    children: 5,
    forceStrength: 0.018,
    gnarliness: 0.16,
    lengthRatio: 0.48,
    levels: 3,
    radialSegments: 8,
    radiusRatio: 0.68,
    start: 0.34,
  }),
  trunk: Object.freeze({
    bend: 0.18,
    color: Object.freeze([0.48, 0.29, 0.16]),
    gnarl: 0.18,
    height: 2.1,
    lean: 0.12,
    radialSegments: 10,
    radiusBottom: 0.22,
    radiusTop: 0.075,
    textureRef: null,
    twist: 0.08,
  }),
  leaves: Object.freeze({
    color: Object.freeze([0.19, 0.48, 0.22]),
    coverageScale: 1,
    density: 1,
    palette: Object.freeze({}),
    shape: 'round',
    textureRef: null,
  }),
  roots: 'small',
});

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finite(value, fallback, minimum = -Infinity, maximum = Infinity) {
  const number = Number(value);
  return Number.isFinite(number)
    ? THREE.MathUtils.clamp(number, minimum, maximum)
    : fallback;
}

function integer(value, fallback, minimum, maximum) {
  return Math.round(finite(value, fallback, minimum, maximum));
}

function color(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map(Number);
    if (channels.every(Number.isFinite)) {
      return channels.map((channel) => THREE.MathUtils.clamp(channel, 0, 1));
    }
  }
  if (value?.isColor) return value.clone().convertLinearToSRGB().toArray();
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return new THREE.Color(value).convertLinearToSRGB().toArray();
    } catch {
      // Fall through to the documented default.
    }
  }
  return [...fallback];
}

function reference(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canopyPalette(value) {
  const source = plainObject(value);
  const result = {};
  for (const tone of ['lit', 'shadow', 'crown']) {
    if (source[tone] === undefined) continue;
    const resolved = color(source[tone], [NaN, NaN, NaN]);
    if (resolved.every(Number.isFinite)) result[tone] = resolved;
  }
  return result;
}

/**
 * Normalize the intentionally small supported BranchTree surface.
 *
 * `trunk.map` and `leaves.map` may be live THREE.Texture values. They are
 * runtime inputs and are omitted from portable documents; use textureRef to
 * retain the caller-owned asset identity beside the procedural recipe.
 */
export function createBranchTreeSettings(options = {}) {
  const source = plainObject(options);
  const branches = plainObject(source.branches);
  const trunk = plainObject(source.trunk);
  const leaves = plainObject(source.leaves);
  const defaults = DEFAULT_BRANCH_TREE_SETTINGS;
  return {
    seed: integer(source.seed, defaults.seed, -2147483648, 2147483647),
    size: finite(source.size, defaults.size, 0.05, 100),
    branches: {
      angle: finite(branches.angle, defaults.branches.angle, 10, 120),
      children: integer(branches.children, defaults.branches.children, 1, 12),
      forceStrength: finite(
        branches.forceStrength,
        defaults.branches.forceStrength,
        -0.08,
        0.15,
      ),
      gnarliness: finite(branches.gnarliness, defaults.branches.gnarliness, 0, 0.6),
      lengthRatio: finite(branches.lengthRatio, defaults.branches.lengthRatio, 0.15, 0.9),
      levels: integer(branches.levels, defaults.branches.levels, 1, 4),
      radialSegments: integer(
        branches.radialSegments,
        defaults.branches.radialSegments,
        3,
        16,
      ),
      radiusRatio: finite(branches.radiusRatio, defaults.branches.radiusRatio, 0.3, 0.9),
      start: finite(branches.start, defaults.branches.start, 0, 0.85),
    },
    trunk: {
      bend: finite(trunk.bend, defaults.trunk.bend, -1.2, 1.2),
      color: color(trunk.color, defaults.trunk.color),
      gnarl: finite(trunk.gnarl, defaults.trunk.gnarl, 0, 1),
      height: finite(trunk.height, defaults.trunk.height, 0.2, 30),
      lean: finite(trunk.lean, defaults.trunk.lean, -1.2, 1.2),
      map: trunk.map?.isTexture ? trunk.map : null,
      radialSegments: integer(
        trunk.radialSegments,
        defaults.trunk.radialSegments,
        3,
        24,
      ),
      radiusBottom: finite(trunk.radiusBottom, defaults.trunk.radiusBottom, 0.01, 5),
      radiusTop: finite(trunk.radiusTop, defaults.trunk.radiusTop, 0.002, 3),
      textureRef: reference(trunk.textureRef),
      twist: finite(trunk.twist, defaults.trunk.twist, -Math.PI * 4, Math.PI * 4),
    },
    leaves: {
      color: color(leaves.color, defaults.leaves.color),
      coverageScale: finite(
        leaves.coverageScale,
        defaults.leaves.coverageScale,
        0.25,
        4,
      ),
      density: finite(leaves.density, defaults.leaves.density, 0.1, 2),
      map: leaves.map?.isTexture ? leaves.map : null,
      palette: canopyPalette(leaves.palette),
      shape: BRANCH_TREE_LEAF_SHAPES.includes(leaves.shape)
        ? leaves.shape
        : defaults.leaves.shape,
      textureRef: reference(leaves.textureRef),
    },
    roots: ['none', 'small', 'medium', 'large'].includes(source.roots)
      ? source.roots
      : defaults.roots,
  };
}

function portableSettings(options = {}) {
  const settings = createBranchTreeSettings(options);
  const { map: trunkMap, ...trunk } = settings.trunk;
  const { map: leafMap, ...leaves } = settings.leaves;
  void trunkMap;
  void leafMap;
  return {
    ...settings,
    branches: { ...settings.branches },
    leaves,
    trunk,
  };
}

export function createBranchTreeDocument(options = {}) {
  return {
    type: BRANCH_TREE_DOCUMENT_TYPE,
    version: BRANCH_TREE_DOCUMENT_VERSION,
    settings: portableSettings(options),
  };
}

export function parseBranchTreeDocument(input) {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return { errors: ['BranchTree document is not valid JSON.'], ok: false, value: null };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { errors: ['BranchTree document must be an object.'], ok: false, value: null };
  }
  if (value.type !== BRANCH_TREE_DOCUMENT_TYPE) {
    return { errors: [`Expected type "${BRANCH_TREE_DOCUMENT_TYPE}".`], ok: false, value: null };
  }
  if (value.version !== BRANCH_TREE_DOCUMENT_VERSION) {
    return {
      errors: [`Unsupported BranchTree document version ${String(value.version)}.`],
      ok: false,
      value: null,
    };
  }
  return {
    errors: [],
    ok: true,
    value: createBranchTreeDocument(value.settings),
  };
}

/**
 * Stable first-party procedural broadleaf tree.
 *
 * This deliberately exposes one branch architecture. Leaf silhouette/color/
 * texture and trunk color/texture are inputs; botanical species claims are
 * outside the 0.4.6 contract.
 */
export class BranchTree extends StylizedTree {
  constructor(options = {}) {
    const settings = createBranchTreeSettings(options);
    const source = plainObject(options);
    super({
      tree: {
        canopyColor: settings.leaves.color,
        canopyPalette: settings.leaves.palette,
        canopyDepth: 0.92,
        canopyScale: 1,
        canopyWidth: 1.18,
        leafDensity: settings.leaves.density,
        leafPlacement: 'tips',
        seed: settings.seed,
        size: settings.size,
        trunkColor: settings.trunk.color,
      },
      trunk: {
        bend: settings.trunk.bend,
        gnarl: settings.trunk.gnarl,
        height: settings.trunk.height,
        lean: settings.trunk.lean,
        radialSegments: settings.trunk.radialSegments,
        radiusBottom: settings.trunk.radiusBottom,
        radiusTop: settings.trunk.radiusTop,
        twist: settings.trunk.twist,
      },
      skeleton: {
        branchAngle: settings.branches.angle,
        branchStart: settings.branches.start,
        childrenCount: settings.branches.children,
        forceStrength: settings.branches.forceStrength,
        generator: 'branching',
        gnarliness: settings.branches.gnarliness,
        lengthRatio: settings.branches.lengthRatio,
        levels: settings.branches.levels,
        radialSegments: settings.branches.radialSegments,
        radiusRatio: settings.branches.radiusRatio,
      },
      foliage: {
        ...plainObject(source.foliage),
        ...(settings.leaves.map ? { leafMap: settings.leaves.map } : {}),
      },
      canopy: {
        // Physical tree size still participates so leaf cards retain a useful
        // world-space density. The explicit factor lets an author tune that
        // coverage independently instead of enlarging the whole tree.
        coverageScale: settings.size * settings.leaves.coverageScale,
      },
      leafShape: settings.leaves.map ? null : { preset: settings.leaves.shape },
      roots: { preset: settings.roots },
      styleTarget: source.styleTarget ?? {},
      trunkMap: settings.trunk.map,
      vegetationShader: source.vegetationShader ?? null,
    });
    this.name = 'BranchTree';
    this.branchTreeSettings = settings;
  }

  toJSON() {
    return createBranchTreeDocument(this.branchTreeSettings);
  }
}

export function createBranchTree(options = {}) {
  return new BranchTree(options);
}
