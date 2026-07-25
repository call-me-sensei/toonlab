// Audited source-mesh catalog for the ToonLab rock library. Entries keep
// stable identities, taxonomy, and exact authored LOD counts. Licensed mesh
// data stays in the gitignored local reference library; `generatorRecipe` is
// retained only as legacy editor-placeholder metadata and is never used to
// build a reference mesh in Rock Lab or its exporter.

import { createRockDocument } from '../rockDocument.js';
import {
  AUDITED_ROCK_REFERENCE_SERIES,
  ROCK_REFERENCE_SOURCE_STYLE_LABELS,
} from './referenceSeries.js';
import {
  AUDITED_LOD0_TRIANGLE_TARGETS,
  AUDITED_ROCK_LOD_TRIANGLE_TARGETS,
} from './referenceTriangleTargets.js';

export const ROCK_REFERENCE_CATALOG_SCHEMA = 'toonlab/rock-reference-catalog';
export const ROCK_REFERENCE_CATALOG_VERSION = 1;
export const ROCK_REFERENCE_RECIPE_SCHEMA = 'toonlab/rock-reference-recipe';

const FAMILY_PROCEDURAL_DEFAULTS = Object.freeze({
  classic: Object.freeze({
    cuts: Object.freeze({ bevel: 0.025, count: 6, depth: 0.22, enabled: true, verticalBias: 0.35 }),
    falloff: Object.freeze({ bottomFlatten: 0.38, radialPinch: 0.04, topTaper: 0.12 }),
    noise: Object.freeze({ amplitude: 0.055, frequency: 1.2, octaves: 3, ridged: false }),
    surface: Object.freeze({
      baseColor: Object.freeze([0.64, 0.65, 0.62]),
      cavityColor: Object.freeze([0.39, 0.4, 0.38]),
      colorNoise: 0.035,
      topColor: Object.freeze([0.74, 0.76, 0.72]),
    }),
  }),
  cubic: Object.freeze({
    cuts: Object.freeze({ bevel: 0.018, count: 8, depth: 0.28, enabled: true, verticalBias: 0.42 }),
    falloff: Object.freeze({ bottomFlatten: 0.45, radialPinch: 0.02, topTaper: 0.08 }),
    noise: Object.freeze({ amplitude: 0.035, frequency: 1.55, octaves: 3, ridged: false }),
    surface: Object.freeze({
      baseColor: Object.freeze([0.58, 0.59, 0.59]),
      cavityColor: Object.freeze([0.33, 0.34, 0.35]),
      colorNoise: 0.025,
      topColor: Object.freeze([0.7, 0.72, 0.72]),
    }),
  }),
  desert: Object.freeze({
    cuts: Object.freeze({ bevel: 0.02, count: 7, depth: 0.24, enabled: true, verticalBias: 0.68 }),
    falloff: Object.freeze({ bottomFlatten: 0.42, radialPinch: 0.08, topTaper: 0.2 }),
    noise: Object.freeze({ amplitude: 0.045, frequency: 1.35, octaves: 3, ridged: false }),
    strata: Object.freeze({
      enabled: true, frequency: 4.2, sharpness: 0.75, strength: 0.075,
      tiltDegrees: 4, warpAmount: 0.12,
    }),
    surface: Object.freeze({
      baseColor: Object.freeze([0.68, 0.48, 0.31]),
      cavityColor: Object.freeze([0.39, 0.25, 0.17]),
      colorNoise: 0.04,
      topColor: Object.freeze([0.8, 0.63, 0.43]),
    }),
  }),
  hexic: Object.freeze({
    columns: Object.freeze({
      enabled: true, grooveDepth: 0.13, grooveWidth: 0.18,
      heightVariation: 0.72, scale: 1.55,
    }),
    cuts: Object.freeze({ bevel: 0.012, count: 5, depth: 0.18, enabled: true, verticalBias: 0.78 }),
    falloff: Object.freeze({ bottomFlatten: 0.4, radialPinch: 0.05, topTaper: 0.16 }),
    noise: Object.freeze({ amplitude: 0.028, frequency: 1.8, octaves: 3, ridged: false }),
    surface: Object.freeze({
      baseColor: Object.freeze([0.55, 0.56, 0.53]),
      cavityColor: Object.freeze([0.29, 0.3, 0.28]),
      colorNoise: 0.025,
      topColor: Object.freeze([0.7, 0.72, 0.67]),
    }),
  }),
  mountains: Object.freeze({
    cuts: Object.freeze({ bevel: 0.01, count: 9, depth: 0.2, enabled: true, verticalBias: 0.76 }),
    falloff: Object.freeze({ bottomFlatten: 0.5, radialPinch: 0.08, topTaper: 0.38 }),
    noise: Object.freeze({ amplitude: 0.04, frequency: 0.82, octaves: 4, ridged: true }),
    strata: Object.freeze({
      enabled: true, frequency: 2.4, sharpness: 0.62, strength: 0.045,
      tiltDegrees: 5, warpAmount: 0.1,
    }),
    surface: Object.freeze({
      baseColor: Object.freeze([0.5, 0.53, 0.54]),
      cavityColor: Object.freeze([0.28, 0.3, 0.31]),
      colorNoise: 0.025,
      topColor: Object.freeze([0.68, 0.71, 0.7]),
    }),
  }),
  spire: Object.freeze({
    cuts: Object.freeze({ bevel: 0.018, count: 7, depth: 0.27, enabled: true, verticalBias: 0.62 }),
    falloff: Object.freeze({ bottomFlatten: 0.4, radialPinch: 0.13, topTaper: 0.36 }),
    noise: Object.freeze({ amplitude: 0.045, frequency: 1.6, octaves: 3, ridged: true }),
    surface: Object.freeze({
      baseColor: Object.freeze([0.57, 0.59, 0.58]),
      cavityColor: Object.freeze([0.31, 0.33, 0.32]),
      colorNoise: 0.03,
      topColor: Object.freeze([0.72, 0.75, 0.72]),
    }),
  }),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function pathSlug(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .split('/')
    .map(slug)
    .filter(Boolean)
    .join('/');
}

/** Stable unsigned FNV-1a seed for a normalized reference id. */
export function rockReferenceSeedForId(id) {
  const normalized = pathSlug(id);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}

function unit(seed, salt) {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function varied(value, seed, salt, amount) {
  return round(value * (1 + (unit(seed, salt) * 2 - 1) * amount));
}

function sourceNameFor(series, index) {
  if (series.variants) return series.variants[index - 1].sourceAssetName;
  const suffix = series.indexPad > 0
    ? String(index).padStart(series.indexPad, '0')
    : String(index);
  return `${series.sourcePrefix}${suffix}`;
}

function countForSeries(series) {
  return series.variants?.length ?? series.count;
}

function parametersFor(series, index, seed) {
  const family = FAMILY_PROCEDURAL_DEFAULTS[series.family];
  const metricDimensions = series.variants?.[index - 1]?.dimensions;
  const scaleSource = metricDimensions ?? series.baseScale;
  const scale = metricDimensions
    ? [...metricDimensions]
    : scaleSource.map((value, axis) => varied(value, seed, axis, 0.14));
  const cuts = {
    ...family.cuts,
    count: Math.max(1, Math.round(family.cuts.count + (unit(seed, 10) * 2 - 1) * 2)),
    depth: varied(family.cuts.depth, seed, 11, 0.16),
    verticalBias: round(Math.min(1, Math.max(0, varied(family.cuts.verticalBias, seed, 12, 0.12)))),
  };
  const falloff = {
    ...family.falloff,
    bottomFlatten: round(Math.min(1, Math.max(0, varied(family.falloff.bottomFlatten, seed, 20, 0.15)))),
    radialPinch: round(Math.min(1, Math.max(0, varied(family.falloff.radialPinch, seed, 21, 0.2)))),
    topTaper: round(Math.min(1, Math.max(0, varied(family.falloff.topTaper, seed, 22, 0.18)))),
  };
  const noise = {
    ...family.noise,
    amplitude: varied(family.noise.amplitude, seed, 30, 0.18),
    frequency: varied(family.noise.frequency, seed, 31, 0.15),
  };
  const parameters = {
    cuts,
    falloff,
    meshing: { normalsMode: 'gradient' },
    noise,
    scale,
    surface: structuredClone(family.surface),
  };
  if (family.columns) {
    parameters.columns = {
      ...family.columns,
      heightVariation: varied(family.columns.heightVariation, seed, 40, 0.15),
      scale: varied(family.columns.scale, seed, 41, 0.12),
    };
  }
  if (family.strata) {
    parameters.strata = {
      ...family.strata,
      frequency: varied(family.strata.frequency, seed, 50, 0.14),
      strength: varied(family.strata.strength, seed, 51, 0.16),
    };
  }
  return parameters;
}

function entryFor(series, index) {
  const indexText = String(index).padStart(2, '0');
  const id = `toonlab/${series.family}/${series.key}/${indexText}`;
  const sourceAssetName = sourceNameFor(series, index);
  const seed = rockReferenceSeedForId(id);
  const target = AUDITED_LOD0_TRIANGLE_TARGETS[sourceAssetName];
  const lodTriangles = AUDITED_ROCK_LOD_TRIANGLE_TARGETS[sourceAssetName];
  const [min, , max] = series.triangles;
  const metric = series.variants?.[index - 1];
  const labelSuffix = metric
    ? metric.sourceAssetName.split('_Metric_')[1].replaceAll('x', '×')
    : indexText;
  return deepFreeze({
    archetype: series.archetype,
    family: series.family,
    generatorRecipe: {
      parameters: parametersFor(series, index, seed),
      presetId: series.presetId,
      schema: ROCK_REFERENCE_RECIPE_SCHEMA,
      seed,
      styleId: 'default',
      version: ROCK_REFERENCE_CATALOG_VERSION,
    },
    id,
    index,
    label: `${series.label} ${labelSuffix}`,
    role: series.role,
    seed,
    series: series.key,
    sourceAssetName,
    sourceStyleLabel: ROCK_REFERENCE_SOURCE_STYLE_LABELS[series.family],
    target: {
      lod0Triangles: { max, min, target },
      lodRatios: lodTriangles.map((triangles) => triangles / lodTriangles[0]),
      lodTriangles: [...lodTriangles],
    },
  });
}

/** Returns a fresh, deeply frozen catalog generated only from audited metadata. */
export function createRockReferenceCatalog() {
  const entries = [];
  for (const series of AUDITED_ROCK_REFERENCE_SERIES) {
    for (let index = 1; index <= countForSeries(series); index += 1) {
      entries.push(entryFor(series, index));
    }
  }
  return deepFreeze(entries);
}

export const ROCK_REFERENCE_CATALOG = createRockReferenceCatalog();

export const ROCK_REFERENCE_SERIES = deepFreeze(AUDITED_ROCK_REFERENCE_SERIES.map((series) => ({
  archetype: series.archetype,
  count: countForSeries(series),
  family: series.family,
  id: `${series.family}/${series.key}`,
  label: series.label,
  presetId: series.presetId,
  role: series.role,
  series: series.key,
  sourceStyleLabel: ROCK_REFERENCE_SOURCE_STYLE_LABELS[series.family],
  targetLod0TriangleRange: { max: series.triangles[2], min: series.triangles[0] },
})));

export const ROCK_REFERENCE_FAMILIES = Object.freeze(
  [...new Set(ROCK_REFERENCE_CATALOG.map((entry) => entry.family))],
);
export const ROCK_REFERENCE_ROLES = Object.freeze(
  [...new Set(ROCK_REFERENCE_CATALOG.map((entry) => entry.role))],
);
export const ROCK_REFERENCE_ARCHETYPES = Object.freeze(
  [...new Set(ROCK_REFERENCE_CATALOG.map((entry) => entry.archetype))],
);

const ENTRY_BY_ID = new Map(ROCK_REFERENCE_CATALOG.map((entry) => [entry.id, entry]));
const ID_ALIASES = new Map();
for (const entry of ROCK_REFERENCE_CATALOG) {
  const indexText = String(entry.index).padStart(2, '0');
  const aliases = [
    entry.id,
    entry.sourceAssetName,
    entry.sourceAssetName.replace(/^SM_/, ''),
    `${entry.family}/${entry.series}/${entry.index}`,
    `${entry.family}/${entry.series}/${indexText}`,
    `toonlab/${entry.family}/${entry.series}/${entry.index}`,
  ];
  for (const alias of aliases) {
    ID_ALIASES.set(String(alias).trim().toLowerCase(), entry.id);
    ID_ALIASES.set(pathSlug(alias), entry.id);
  }
}

/** Normalizes stable ids, short family paths, or original source asset names. */
export function normalizeRockReferenceId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return ID_ALIASES.get(raw.toLowerCase())
    ?? ID_ALIASES.get(pathSlug(raw))
    ?? pathSlug(raw);
}

/** Gets one immutable reference entry by stable id or source asset name. */
export function getRockReferenceEntry(idOrSourceName) {
  return ENTRY_BY_ID.get(normalizeRockReferenceId(idOrSourceName)) ?? null;
}

function matches(value, filter) {
  if (filter === null || filter === undefined || filter === '') return true;
  const wanted = Array.isArray(filter) ? filter : [filter];
  return wanted.some((entry) => String(entry).toLowerCase() === String(value).toLowerCase());
}

/** Lists immutable entries filtered by taxonomy, compatibility preset, or text. */
export function listRockReferenceEntries({
  archetype = null,
  family = null,
  presetId = null,
  role = null,
  series = null,
  text = null,
} = {}) {
  const query = text === null || text === undefined ? '' : String(text).trim().toLowerCase();
  return ROCK_REFERENCE_CATALOG.filter((entry) => {
    if (!matches(entry.archetype, archetype)) return false;
    if (!matches(entry.family, family)) return false;
    if (!matches(entry.generatorRecipe.presetId, presetId)) return false;
    if (!matches(entry.role, role)) return false;
    if (!matches(entry.series, series)) return false;
    if (query) {
      const haystack = `${entry.id} ${entry.label} ${entry.sourceAssetName} ${entry.sourceStyleLabel} ${entry.archetype} ${entry.generatorRecipe.presetId}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function requireEntry(idOrEntry) {
  const entry = typeof idOrEntry === 'object' && idOrEntry
    ? getRockReferenceEntry(idOrEntry.id)
    : getRockReferenceEntry(idOrEntry);
  if (!entry) throw new Error(`Unknown rock reference "${String(idOrEntry?.id ?? idOrEntry)}".`);
  return entry;
}

/**
 * Creates a portable document that points at a licensed local source mesh.
 * Its ordinary preset piece is an editor compatibility placeholder only;
 * Rock Lab and reference exporters use the exact local source LOD geometry
 * and never run that placeholder through the SDF generator.
 */
export function createRockDocumentFromReference(
  idOrEntry,
  { seed, style, variation = 1 } = {},
) {
  const entry = requireEntry(idOrEntry);
  const recipe = entry.generatorRecipe;
  const suppliedSeed = Number(seed);
  if (seed !== undefined && !Number.isFinite(suppliedSeed)) {
    throw new Error(`Rock reference seed must be finite; received "${String(seed)}".`);
  }
  const documentSeed = seed === undefined ? recipe.seed : Math.round(suppliedSeed) >>> 0;
  const styleId = style === undefined ? recipe.styleId : style;
  const variationAmount = clamp(
    Number.isFinite(Number(variation)) ? Number(variation) : 1,
    0,
    1,
  );
  const base = createRockDocument({
    preset: recipe.presetId,
    seed: documentSeed,
    style: styleId,
  });
  return createRockDocument({
    meshing: base.meshing,
    name: `${entry.sourceAssetName} mesh reference`,
    pieces: base.pieces,
    preset: recipe.presetId,
    reference: {
      archetype: entry.archetype,
      catalogVersion: ROCK_REFERENCE_CATALOG_VERSION,
      family: entry.family,
      id: entry.id,
      lodRatios: entry.target.lodRatios,
      lodTriangles: entry.target.lodTriangles,
      role: entry.role,
      series: entry.series,
      sourceMode: 'mesh-template',
      targetTriangles: entry.target.lod0Triangles.target,
      variation: variationAmount,
      variationSeed: documentSeed,
    },
    seed: documentSeed,
    style: styleId,
    surface: base.surface,
  });
}

/** Returns advisory LOD triangle targets without generating any meshes. */
export function getRockReferenceLodPlan(idOrEntry) {
  const entry = requireEntry(idOrEntry);
  return deepFreeze(entry.target.lodTriangles.map((targetTriangles, lod) => ({
    lod,
    maxTriangles: targetTriangles,
    minTriangles: targetTriangles,
    ratio: entry.target.lodRatios[lod],
    targetTriangles,
  })));
}
