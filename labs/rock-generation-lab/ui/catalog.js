import {
  bumpDocumentRevision,
  createRockDocument,
} from '../../../src/rockgen/index.js';

// The Rock Lab does not own a second 480-item inventory. OSS reads the local
// Gallery database populated by the Pro release seed; Pro reads its public
// rock-catalog endpoint. Both normalize the same immutable release rows.
const FAMILY_PRESETS = Object.freeze({
  angular_boulder: 'granite-boulder',
  broad_wall: 'cliff-wall',
  capstone_stack: 'column-arch',
  cliff_corner: 'canyon-ridge',
  cliff_corner_kit: 'cliff-wall',
  cliff_overhang: 'sea-stack',
  cliff_termination: 'canyon-ridge',
  column_field: 'basalt-columns',
  column_kit: 'basalt-columns',
  distant_massif: 'canyon-ridge',
  flat_shelf: 'cliff-face',
  fractured_block: 'granite-boulder',
  hoodoo: 'karst-spire',
  hoodoo_cliff: 'karst-spire',
  isolated_peak: 'karst-spire',
  layered_face: 'eroded-mesa',
  layered_slab: 'cliff-wall',
  mesa: 'eroded-mesa',
  metric_block: 'lowpoly-boulder',
  monolith: 'shard-monolith',
  mountain_ridge: 'canyon-ridge',
  natural_arch: 'column-arch',
  river_worn_rock: 'river-boulder',
  rock_clump: 'scree-cluster',
  rock_platform: 'cliff-face',
  rock_ridge: 'canyon-ridge',
  rounded_boulder: 'river-boulder',
  scree_cluster: 'scree-cluster',
  shelf_stack: 'eroded-mesa',
  spire: 'karst-spire',
  stepped_face: 'eroded-mesa',
  straight_cliff_tile: 'cliff-wall',
  talus_rock: 'scree-cluster',
  vertical_face: 'cliff-face',
  weathered_fragment: 'boulder',
});

function title(value) {
  return String(value).split(/[_-]/u)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function releaseFromUrl(value) {
  try {
    return new URL(value, window.location.href).pathname.match(/^\/official\/([^/]+)\//u)?.[1] ?? '';
  } catch {
    return '';
  }
}

function normalizeGalleryAsset(asset, catalogIndex) {
  const metadata = asset.metadata ?? {};
  const taxonomy = asset.taxonomy ?? metadata.taxonomy ?? {};
  const recipe = asset.recipe ?? metadata.recipe ?? {};
  const familyId = String(asset.familyId ?? metadata.familyId ?? '').trim();
  const familyKey = familyId.replaceAll('-', '_');
  const preset = FAMILY_PRESETS[familyKey];
  const artifacts = Array.isArray(asset.artifacts) ? asset.artifacts : [];
  const modelUrl = asset.download_url
    ?? asset.downloadUrl
    ?? artifacts.find((entry) => entry.name === 'rock.glb')?.download
    ?? null;
  const thumbnailUrl = asset.thumbnail_url ?? asset.thumbnailUrl ?? null;
  const id = String(asset.id ?? '');
  const sourceVersion = String(asset.release ?? releaseFromUrl(modelUrl));
  if (!/^rock-\d{4}$/u.test(id) || !familyId || !preset || !modelUrl || !thumbnailUrl || !sourceVersion) {
    throw new Error(`${id || `catalog row ${catalogIndex + 1}`} is not a complete released Gallery rock.`);
  }
  return Object.freeze({
    catalogIndex,
    familyId,
    familyLabel: title(familyId),
    file: 'rock.glb',
    galleryId: id,
    geology: taxonomy.geology,
    id,
    label: String(asset.name ?? id),
    modelUrl,
    preset,
    recipeHash: String(asset.recipeHash ?? metadata.recipeHash ?? ''),
    revision: Number(asset.revision ?? metadata.revision ?? 0),
    seed: Number(recipe.generator?.seed ?? hash(`${sourceVersion}:${id}`)) >>> 0,
    sourceMode: 'official-glb',
    sourceVersion,
    tags: Object.freeze([...(asset.tags ?? [])].map(String)),
    thumbnailUrl,
    variationId: id,
  });
}

export let ROCK_VARIATION_CATALOG = Object.freeze([]);
export let ROCK_VARIATION_FAMILIES = Object.freeze([]);
let entryById = new Map();
let catalogPromise = null;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw Object.assign(new Error(`${url} returned HTTP ${response.status}`), {
    status: response.status,
  });
  return response.json();
}

async function fetchCanonicalGalleryRocks() {
  try {
    const result = await fetchJson('/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=500');
    return result.items ?? [];
  } catch (error) {
    if (error.status !== 404) throw error;
    const result = await fetchJson('/api/v1/rock-catalog');
    return result.assets ?? [];
  }
}

export async function loadRockVariationCatalog({ force = false } = {}) {
  if (!force && ROCK_VARIATION_CATALOG.length === 480) return ROCK_VARIATION_CATALOG;
  if (!force && catalogPromise) return catalogPromise;
  catalogPromise = fetchCanonicalGalleryRocks().then((assets) => {
    const normalized = assets
      .map(normalizeGalleryAsset)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (normalized.length !== 480) {
      throw new Error(`The canonical Gallery returned ${normalized.length} rocks; expected 480.`);
    }
    normalized.forEach((entry, index) => {
      if (entry.id !== `rock-${String(index + 1).padStart(4, '0')}`) {
        throw new Error(`The canonical Gallery is missing rock-${String(index + 1).padStart(4, '0')}.`);
      }
    });
    ROCK_VARIATION_CATALOG = Object.freeze(normalized);
    const familyIds = [...new Set(normalized.map((entry) => entry.familyId))];
    ROCK_VARIATION_FAMILIES = Object.freeze(
      familyIds.map((value) => Object.freeze({ label: title(value), value })),
    );
    entryById = new Map(normalized.map((entry) => [entry.id, entry]));
    return ROCK_VARIATION_CATALOG;
  }).catch((error) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
}

export function getRockVariationCatalogEntry(id) {
  return entryById.get(String(id ?? '')) ?? null;
}

export function searchRockVariationCatalog({ family = 'all', text = '' } = {}) {
  const query = String(text).trim().toLocaleLowerCase();
  return ROCK_VARIATION_CATALOG.filter((entry) => {
    if (family !== 'all' && entry.familyId !== family) return false;
    if (!query) return true;
    return [
      entry.id,
      entry.label,
      entry.file,
      entry.familyId,
      entry.familyLabel,
      entry.geology ?? '',
      entry.preset,
      ...entry.tags,
    ].join(' ').toLocaleLowerCase().includes(query);
  });
}

/** Build a portable, editable project whose source of truth is a Gallery GLB. */
export function createCatalogVariationDocument(idOrEntry, {
  strength = 0.3,
  style = 'default',
  variation = 0,
} = {}) {
  const entry = typeof idOrEntry === 'object' ? idOrEntry : getRockVariationCatalogEntry(idOrEntry);
  if (!entry) throw new Error(`Unknown Rock Lab catalog entry “${String(idOrEntry)}”.`);
  const variationIndex = Math.max(0, Math.round(Number(variation) || 0));
  const seed = hash(`${entry.seed}:${variationIndex}`);
  const document = createRockDocument({
    name: `${entry.label} Variation ${variationIndex + 1}`,
    preset: entry.preset,
    reference: {
      archetype: entry.familyId,
      catalogVersion: 1,
      family: entry.familyId,
      id: entry.id,
      recipeHash: entry.recipeHash,
      revision: entry.revision,
      role: entry.tags[0] ?? 'rock',
      series: entry.sourceVersion,
      sourceMode: 'mesh-template',
      surfaceMode: 'source',
      topFinish: 'source',
      variation: Math.min(Math.max(Number(strength) || 0, 0), 1),
      variationSeed: seed,
    },
    seed,
    style,
  });
  Object.assign(document.surface, {
    lichenCoverage: 0,
    mossCoverage: 0,
    pbrTexturePreset: 'none',
    stainStrength: 0,
    topCoatStrength: 0,
    veinStrength: 0,
  });
  bumpDocumentRevision(document);
  return document;
}
