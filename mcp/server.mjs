#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { publicMcpCatalogEntries } from './public-catalog.mjs';
import {
  fetchPolyhavenFiles,
  fetchPolyhavenIndex,
  resolvePolyhavenModelDownload,
  resolvePolyhavenTextureDownload,
} from '../src/assetlib/polyhaven.js';
import { filterAssetRefs } from '../src/assetlib/assetRef.js';
import {
  resolveAmbientcgDownload,
  searchAmbientcg,
} from '../src/assetlib/ambientcg.js';
import {
  getWorkspaceInfo as getLegacyWorkspaceInfo,
  listLibraryEntries as listLegacyLibraryEntries,
  listStorageDocuments as listLegacyStorageDocuments,
  listWorkspaceFiles as listLegacyWorkspaceFiles,
  matchesText,
  readWorkspaceFile as readLegacyWorkspaceFile,
  resolveWorkspacePath,
  saveCreation as saveLegacyCreation,
  writeWorkspaceFile as writeLegacyWorkspaceFile,
} from './workspace.mjs';
import {
  databaseInfo,
  getCatalogAsset as getDatabaseCatalogAsset,
  listCatalogAssets as listDatabaseCatalogAssets,
  listLibraryEntries as listDatabaseLibraryEntries,
  listObjects,
  readLabState,
  readObject,
  saveCreationDocument,
  saveObject,
} from '../database/repository.mjs';
import {
  ASSET_POLICY_MODES,
  ASSET_SOURCE_CLASSES,
  createAssetGapRecord,
  evaluateAssetCandidate,
  renderAssetGapReport,
  validateAssetSourcingPolicy,
} from '../src/asset-policy/index.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  STYLE_DOMAIN_SLOT_ROUTES,
  TOONLAB_ANIME_GAME_PROFILE,
} from '../src/styles/index.js';

const SERVER_NAME = 'toonlab-oss';
const SERVER_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  LATEST_PROTOCOL_VERSION,
  '2025-06-18',
  '2025-03-26',
]);

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'mcp') args.shift();
  let workspace = process.env.TOONLAB_WORKSPACE ?? '.toonlab';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--workspace' && args[index + 1]) {
      workspace = args[index + 1];
      index += 1;
    }
  }
  return { workspace: resolveWorkspacePath(workspace) };
}

const { workspace } = parseArguments(process.argv.slice(2));
const legacyWorkspace = process.env.TOONLAB_LEGACY_WORKSPACE === '1';

async function getWorkspaceInfo() {
  if (legacyWorkspace) return getLegacyWorkspaceInfo(workspace);
  return {
    database: await databaseInfo(),
    mode: 'postgres',
    path: workspace,
  };
}

async function listLibraryEntries() {
  if (legacyWorkspace) return listLegacyLibraryEntries(workspace);
  return listDatabaseLibraryEntries();
}

async function listStorageDocuments() {
  if (legacyWorkspace) return listLegacyStorageDocuments(workspace);
  const entries = await readLabState();
  const documents = [];
  for (const [key, raw] of Object.entries(entries)) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const values = Array.isArray(parsed) ? parsed : [parsed];
    values.forEach((document, index) => {
      if (!document || typeof document !== 'object') return;
      documents.push({
        cluster: key.match(/^toonlab\.([a-z0-9-]+)/i)?.[1] ?? 'lab',
        document,
        id: `state:${key}:${document.id ?? document.presetId ?? index}`,
        key,
        kind: Array.isArray(parsed) ? 'preset' : 'document',
        label: String(document.label ?? document.name ?? document.id ?? `Document ${index + 1}`),
        source: 'workspace-storage',
      });
    });
  }
  return documents;
}

async function listWorkspaceFiles() {
  if (legacyWorkspace) return listLegacyWorkspaceFiles(workspace);
  return listObjects(workspace);
}

async function readWorkspaceFile(_workspace, relativePath) {
  if (legacyWorkspace) return readLegacyWorkspaceFile(workspace, relativePath);
  return readObject(workspace, relativePath);
}

async function saveCreation(_workspace, options) {
  if (legacyWorkspace) return saveLegacyCreation(workspace, options);
  return saveCreationDocument(options);
}

const MIME_BY_EXTENSION = {
  '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

async function writeWorkspaceFile(_workspace, relativePath, data) {
  if (legacyWorkspace) return writeLegacyWorkspaceFile(workspace, relativePath, data);
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  return saveObject(workspace, bytes, {
    contentType: MIME_BY_EXTENSION[extname(relativePath).toLowerCase()] ?? 'application/octet-stream',
    name: basename(relativePath),
  });
}

function jsonContent(value) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' }],
    structuredContent: value,
  };
}

function errorContent(error) {
  return {
    content: [{ text: error?.message ?? String(error), type: 'text' }],
    isError: true,
  };
}

function limitValue(value, fallback = 25, max = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withSeed(recipe, seed) {
  const next = clone(recipe ?? {});
  if (next.settings?.asset) next.settings.asset.seed = seed;
  else if (next.options) next.options.seed = seed;
  else if (next.settings) next.settings.seed = seed;
  else next.seed = seed;
  return next;
}

const SOURCE_CLASS_BY_SOURCE = Object.freeze({
  builtin: 'procedural',
  library: 'toonlab-library',
  official: 'toonlab-library',
  workspace: 'project-library',
  'workspace-storage': 'project-library',
});

function sourceClassFor(entry) {
  return entry.sourceClass
    ?? SOURCE_CLASS_BY_SOURCE[entry.source]
    ?? 'project-library';
}

function animeStyleSupport(entry) {
  const tags = (entry.tags ?? []).map((tag) => String(tag).toLowerCase());
  const explicit = entry.animeStyleSupport ?? entry.supportLevel;
  if (explicit) return explicit;
  if (tags.some((tag) => ['anime', 'cel-shaded', 'toon', 'stylized'].includes(tag))) {
    return 'reviewed-candidate';
  }
  return 'needs-in-scene-review';
}

function normalizeDiscovery(entry, summary, { domain = '', policy = null } = {}) {
  const sourceClass = sourceClassFor(entry);
  return {
    ...summary,
    animeStyleSupport: animeStyleSupport(entry),
    assetKind: entry.kind ?? entry.assetKind ?? null,
    license: entry.license ?? entry.attribution?.license ?? null,
    policyDecision: evaluateAssetCandidate(policy, { domain, sourceClass }),
    provenance: entry.provenance ?? entry.attribution ?? null,
    sourceClass,
  };
}

function summarizeCatalogEntry(entry) {
  const metadata = entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
    ? entry.metadata
    : {};
  const searchableMetadata = Object.fromEntries([
    'catalog',
    'dimensionsMeters',
    'familyId',
    'profileId',
    'taxonomy',
    'releaseWave',
    'revision',
    'recipeHash',
  ].flatMap((key) => metadata[key] == null ? [] : [[key, metadata[key]]]));
  return {
    cluster: entry.cluster,
    description: entry.description ?? null,
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    source: entry.source ?? 'builtin',
    tags: entry.tags ?? [],
    thumbnail: entry.thumbnail ?? null,
    ...(Object.keys(searchableMetadata).length > 0 ? { metadata: searchableMetadata } : {}),
  };
}

function summarizeStorageDocument(entry) {
  return {
    cluster: entry.cluster,
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    source: entry.source,
    storageKey: entry.key,
  };
}

function normalizeOfficialCatalogAsset(asset) {
  const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata
    : {};
  return {
    catalogProvider: asset.source,
    cluster: metadata.catalog ?? 'official',
    description: asset.description ?? null,
    downloadUrl: asset.download_url ?? null,
    files: asset.files ?? [],
    id: asset.id,
    kind: asset.kind,
    label: asset.name,
    license: asset.license,
    metadata,
    provenance: {
      attribution: asset.attribution ?? null,
      provider: asset.source,
      sourceId: asset.source_id ?? null,
      sourceUrl: asset.source_url ?? null,
    },
    source: 'official',
    sourceClass: 'toonlab-library',
    tags: asset.tags ?? [],
    thumbnail: asset.thumbnail_url ?? null,
  };
}

async function listOfficialCatalogEntries() {
  if (legacyWorkspace) return [];
  const entries = [];
  let offset = 0;
  let total = 1;
  while (offset < total) {
    const page = await listDatabaseCatalogAssets({ limit: 100, offset });
    entries.push(...page.items.map(normalizeOfficialCatalogAsset));
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  }
  return entries;
}

async function allAssets(source = null) {
  const includes = (candidate) => source == null || source === candidate;
  const [library, official, storage, files] = await Promise.all([
    includes('library') ? listLibraryEntries(workspace) : [],
    includes('official') ? listOfficialCatalogEntries() : [],
    includes('workspace-storage') ? listStorageDocuments(workspace) : [],
    includes('workspace') ? listWorkspaceFiles(workspace) : [],
  ]);
  return [
    ...(includes('builtin') ? publicMcpCatalogEntries().map((entry) => ({ ...entry, source: 'builtin' })) : []),
    ...library.map((entry) => ({ ...entry, source: 'library' })),
    ...official,
    ...storage,
    ...files,
  ];
}

async function findAsset(id, source = null) {
  const assets = await allAssets(source);
  return assets.find((entry) => entry.id === id && (!source || entry.source === source)) ?? null;
}

function matchesTags(entry, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return true;
  const actual = new Set((entry.tags ?? []).map((tag) => String(tag).toLowerCase()));
  return tags.every((tag) => actual.has(String(tag).toLowerCase()));
}

async function searchAssets(args) {
  const assets = await allAssets(args.source ?? null);
  const matched = assets.filter((entry) => {
    if (args.source && entry.source !== args.source) return false;
    if (args.cluster && entry.cluster !== args.cluster) return false;
    if (args.kind && entry.kind !== args.kind) return false;
    if (!matchesTags(entry, args.tags)) return false;
    return matchesText(entry, args.query);
  });
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const limit = limitValue(args.limit);
  const results = matched.slice(offset, offset + limit);
  return {
    count: results.length,
    total: matched.length,
    offset,
    limit,
    nextOffset: offset + limit < matched.length ? offset + limit : null,
    items: results.map((entry) => {
      const summary = entry.source === 'workspace'
        ? entry
        : entry.source === 'workspace-storage'
          ? summarizeStorageDocument(entry)
          : summarizeCatalogEntry(entry);
      return normalizeDiscovery(entry, summary, args);
    }),
  };
}

async function getAsset(args) {
  if (args.source === 'official' && !legacyWorkspace) {
    const complete = await getDatabaseCatalogAsset(args.id);
    if (!complete) throw new Error(`Official asset "${args.id}" was not found.`);
    const normalized = normalizeOfficialCatalogAsset(complete);
    return normalizeDiscovery(normalized, normalized, args);
  }
  const asset = await findAsset(args.id, args.source);
  if (!asset) throw new Error(`Asset "${args.id}" was not found.`);
  if (asset.source === 'official' && !legacyWorkspace) {
    const complete = await getDatabaseCatalogAsset(asset.id);
    if (!complete) throw new Error(`Official asset "${args.id}" was not found.`);
    const normalized = normalizeOfficialCatalogAsset(complete);
    return normalizeDiscovery(normalized, normalized, args);
  }
  return normalizeDiscovery(asset, asset, args);
}

async function listMyCreations(args) {
  const [library, storage, files] = await Promise.all([
    listLibraryEntries(workspace),
    listStorageDocuments(workspace),
    listWorkspaceFiles(workspace, { roots: ['assets', 'creations', 'exports', 'imports', 'presets'] }),
  ]);
  const query = args.query ?? null;
  const items = [
    ...library.map((entry) => summarizeCatalogEntry({ ...entry, source: 'library' })),
    ...storage.map(summarizeStorageDocument),
    ...files,
  ].filter((entry) => matchesText(entry, query)).slice(0, limitValue(args.limit, 50, 200));
  return { count: items.length, items, workspace };
}

async function getMyCreation(args) {
  const asset = await findAsset(args.id);
  if (!asset || asset.source === 'builtin') throw new Error(`Workspace creation "${args.id}" was not found.`);
  if (asset.source !== 'workspace') return asset;
  const file = await readWorkspaceFile(workspace, asset.relativePath);
  if (file.data.length > 5 * 1024 * 1024) {
    return { ...asset, note: 'File is larger than 5 MB; use absolutePath to read it directly.' };
  }
  if (file.mimeType.startsWith('text/') || file.mimeType === 'application/json' || ['.gltf'].includes(extname(file.name))) {
    return { ...asset, content: file.data.toString('utf8') };
  }
  return { ...asset, base64: file.data.toString('base64'), encoding: 'base64' };
}

async function generateAsset(args) {
  const entry = publicMcpCatalogEntries().find((item) => item.id === args.catalog_id);
  if (!entry) throw new Error(`Unknown built-in catalog asset "${args.catalog_id}".`);
  const policyDecision = evaluateAssetCandidate(args.policy ?? null, {
    domain: args.domain ?? entry.domain ?? entry.cluster ?? '',
    sourceClass: 'procedural',
  });
  if (!policyDecision.allowed) throw new Error(policyDecision.reason);
  const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : Math.floor(Math.random() * 1_000_000);
  const name = String(args.name ?? `${entry.label} ${seed}`);
  const document = {
    catalog: {
      cluster: entry.cluster,
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
    },
    generatedAt: new Date().toISOString(),
    recipe: withSeed(entry.recipe, seed),
    schema: 'toonlab/generated-asset',
    seed,
    spawn: entry.spawn,
    version: 1,
  };
  const file = args.save === false ? null : await saveCreation(workspace, {
    document,
    kind: entry.cluster,
    name,
  });
  return {
    document,
    file,
    policyDecision,
    next: entry.cluster === 'water' || entry.cluster === 'sky' || entry.cluster === 'post' || entry.cluster === 'toon'
      ? 'Use the spawn snippet in your project; this is a settings preset.'
      : 'Open the matching ToonLab lab to preview or export this recipe as GLB.',
  };
}

function compactCc0Ref(ref) {
  return {
    attribution: ref.attribution,
    authors: ref.authors,
    categories: ref.categories,
    id: ref.id,
    kind: ref.kind,
    name: ref.name,
    pageUrl: ref.pageUrl,
    source: ref.source,
    tags: ref.tags,
    thumbnailUrl: ref.thumbnailUrl,
    animeStyleSupport: 'needs-in-scene-review',
    assetKind: ref.kind,
    license: ref.attribution?.license ?? 'CC0',
    provenance: ref.attribution ?? null,
    sourceClass: 'external-cc0',
  };
}

function polyhavenType(kind) {
  return { hdri: 'hdris', model: 'models', texture: 'textures' }[kind] ?? 'models';
}

function ambientcgType(kind) {
  return { hdri: 'HDRI', model: 'Model', texture: 'Material' }[kind] ?? 'Model';
}

async function searchCc0Assets(args) {
  const provider = args.provider ?? 'all';
  const kind = args.kind ?? 'model';
  const limit = limitValue(args.limit, 20, 50);
  const searches = [];
  if (provider === 'all' || provider === 'polyhaven') {
    searches.push((async () => {
      const refs = await fetchPolyhavenIndex({ type: polyhavenType(kind) });
      return filterAssetRefs(refs, { kind, text: args.query ?? null }).slice(0, limit);
    })());
  }
  if (provider === 'all' || provider === 'ambientcg') {
    searches.push(searchAmbientcg({
      limit,
      query: args.query ?? '',
      type: ambientcgType(kind),
    }));
  }
  if (searches.length === 0) throw new Error('provider must be all, polyhaven, or ambientcg.');
  const settled = await Promise.allSettled(searches);
  const results = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const errors = settled.flatMap((result) => result.status === 'rejected' ? [result.reason?.message ?? String(result.reason)] : []);
  return {
    count: Math.min(results.length, limit),
    errors,
    items: results.slice(0, limit).map((ref) => ({
      ...compactCc0Ref(ref),
      policyDecision: evaluateAssetCandidate(args.policy ?? null, {
        domain: args.domain ?? '',
        sourceClass: 'external-cc0',
      }),
    })),
  };
}

async function getCc0AssetDetails(args) {
  const {
    domain = '',
    id,
    kind = 'model',
    policy = null,
    provider,
    resolution = '1k',
  } = args;
  const policyDecision = evaluateAssetCandidate(policy, {
    domain,
    sourceClass: 'external-cc0',
  });
  if (provider === 'ambientcg') {
    const [ref] = await searchAmbientcg({ id });
    if (!ref) throw new Error(`ambientCG asset "${id}" was not found.`);
    const download = resolveAmbientcgDownload(ref, { resolution: resolution.toUpperCase() });
    return { download, policyDecision, ref: compactCc0Ref(ref) };
  }
  if (provider === 'polyhaven') {
    const refs = await fetchPolyhavenIndex({ type: polyhavenType(kind) });
    const ref = refs.find((item) => item.id === id);
    if (!ref) throw new Error(`Poly Haven asset "${id}" was not found.`);
    const files = await fetchPolyhavenFiles(id);
    const download = kind === 'model'
      ? resolvePolyhavenModelDownload(files, { resolution })
      : kind === 'texture'
        ? resolvePolyhavenTextureDownload(files, { resolution })
        : null;
    return { download, policyDecision, ref: compactCc0Ref(ref) };
  }
  throw new Error('provider must be polyhaven or ambientcg.');
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed with ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function filenameFromUrl(url, fallback) {
  try {
    return basename(new URL(url).pathname) || fallback;
  } catch {
    return fallback;
  }
}

async function importCc0Asset(args) {
  const policyDecision = evaluateAssetCandidate(args.policy ?? null, {
    domain: args.domain ?? '',
    sourceClass: 'external-cc0',
  });
  if (!policyDecision.allowed) throw new Error(policyDecision.reason);
  const details = await getCc0AssetDetails(args);
  if (!details.download) {
    throw new Error('This asset kind does not yet expose a direct downloadable bundle. Use get_cc0_asset for its source page.');
  }
  const folder = `imports/${args.provider}/${String(args.id).replace(/[^a-z0-9._-]+/gi, '-')}`;
  const files = [];
  if (args.provider === 'ambientcg') {
    const name = filenameFromUrl(details.download.url, `${args.id}.zip`);
    files.push(await writeWorkspaceFile(workspace, `${folder}/${name}`, await fetchBytes(details.download.url)));
  } else if (details.download.url) {
    const name = filenameFromUrl(details.download.url, `${args.id}.gltf`);
    files.push(await writeWorkspaceFile(workspace, `${folder}/${name}`, await fetchBytes(details.download.url)));
    for (const [relativePath, url] of Object.entries(details.download.resources ?? {})) {
      files.push(await writeWorkspaceFile(workspace, `${folder}/${relativePath}`, await fetchBytes(url)));
    }
  } else {
    for (const [slot, file] of Object.entries(details.download.maps ?? {})) {
      const name = filenameFromUrl(file.url, `${slot}.jpg`);
      files.push(await writeWorkspaceFile(workspace, `${folder}/${name}`, await fetchBytes(file.url)));
    }
  }
  const manifest = await writeWorkspaceFile(workspace, `${folder}/toonlab-import.json`, `${JSON.stringify({
    importedAt: new Date().toISOString(),
    ...details,
  }, null, 2)}\n`);
  return { ...details, files: [...files, manifest], policyDecision, workspace };
}

async function recordAssetGap(args) {
  const record = createAssetGapRecord(args);
  const reportsDirectory = join(workspace, 'reports');
  const jsonPath = join(reportsDirectory, 'style-asset-gaps.json');
  const projectDirectory = basename(workspace) === '.toonlab'
    ? dirname(workspace)
    : workspace;
  const markdownPath = join(projectDirectory, 'TOONLAB_ASSET_GAPS.md');
  let records = [];
  try {
    const existing = JSON.parse(await readFile(jsonPath, 'utf8'));
    records = Array.isArray(existing.records) ? existing.records : [];
  } catch {
    records = [];
  }
  const next = records.filter((entry) => entry.id !== record.id);
  next.push(record);
  next.sort((left, right) => left.id.localeCompare(right.id));
  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify({
    records: next,
    schema: 'toonlab/asset-gap-report',
    version: 1,
  }, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderAssetGapReport(next), 'utf8');
  return { jsonPath, markdownPath, record, total: next.length };
}

const TOOLS = [
  {
    annotations: { readOnlyHint: true },
    description: 'Return ToonLab\'s anime-game art direction, canonical Call Me Sensei bundle, and explicit shader-routing table.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_anime_game_profile',
    title: 'Get ToonLab anime-game profile',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Show the local .toonlab workspace path, migration status, and item counts.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_workspace_info',
    title: 'Get ToonLab workspace info',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Search built-in procedural assets, the paginated complete official Gallery catalog, saved library entries, lab presets, and files on disk. Official rock summaries include compact dimensions and taxonomy metadata; follow nextOffset until null.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        cluster: { type: 'string' },
        domain: { type: 'string' },
        kind: { type: 'string' },
        limit: { maximum: 100, minimum: 1, type: 'integer' },
        offset: { minimum: 0, type: 'integer' },
        policy: { type: 'object' },
        query: { type: 'string' },
        source: { enum: ['builtin', 'official', 'library', 'workspace', 'workspace-storage'], type: 'string' },
        tags: { items: { type: 'string' }, type: 'array' },
      },
      type: 'object',
    },
    name: 'search_assets',
    title: 'Search ToonLab assets',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Get a complete asset, recipe, preset, library entry, or workspace file descriptor by id.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        policy: { type: 'object' },
        source: { type: 'string' },
      },
      required: ['id'],
      type: 'object',
    },
    name: 'get_asset',
    title: 'Get a ToonLab asset',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'List the developer\'s disk-backed library, saved lab documents, presets, imports, and exports.',
    inputSchema: {
      additionalProperties: false,
      properties: { limit: { type: 'integer' }, query: { type: 'string' } },
      type: 'object',
    },
    name: 'list_my_creations',
    title: 'List my ToonLab creations',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Read a saved creation or small workspace file. Binary files are returned as base64 and always include a direct absolute path.',
    inputSchema: { additionalProperties: false, properties: { id: { type: 'string' } }, required: ['id'], type: 'object' },
    name: 'get_my_creation',
    title: 'Get my ToonLab creation',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Save a JSON or text creation into .toonlab/creations so labs and coding agents can share it.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        document: {},
        filename: { type: 'string' },
        kind: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['document', 'name'],
      type: 'object',
    },
    name: 'save_creation',
    title: 'Save a ToonLab creation',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: false },
    description: 'Generate a deterministic editable asset recipe from a built-in ToonLab catalog entry and optionally save it to disk.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        catalog_id: { type: 'string' },
        domain: { type: 'string' },
        name: { type: 'string' },
        policy: { type: 'object' },
        save: { default: true, type: 'boolean' },
        seed: { type: 'integer' },
      },
      required: ['catalog_id'],
      type: 'object',
    },
    name: 'generate_asset',
    title: 'Generate a procedural ToonLab asset',
  },
  {
    annotations: { openWorldHint: true, readOnlyHint: true },
    description: 'Search CC0 models, textures, or HDRIs from Poly Haven and ambientCG.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        limit: { maximum: 50, minimum: 1, type: 'integer' },
        policy: { type: 'object' },
        provider: { enum: ['all', 'polyhaven', 'ambientcg'], type: 'string' },
        query: { type: 'string' },
      },
      type: 'object',
    },
    name: 'search_cc0_assets',
    title: 'Search public CC0 assets',
  },
  {
    annotations: { openWorldHint: true, readOnlyHint: true },
    description: 'Resolve source, attribution, and download metadata for one CC0 asset.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        policy: { type: 'object' },
        provider: { enum: ['polyhaven', 'ambientcg'], type: 'string' },
        resolution: { default: '1k', type: 'string' },
      },
      required: ['provider', 'id'],
      type: 'object',
    },
    name: 'get_cc0_asset',
    title: 'Get a public CC0 asset',
  },
  {
    annotations: { destructiveHint: false, openWorldHint: true },
    description: 'Download a CC0 asset and attribution manifest into .toonlab/imports for direct use by the project.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        id: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        policy: { type: 'object' },
        provider: { enum: ['polyhaven', 'ambientcg'], type: 'string' },
        resolution: { default: '1k', type: 'string' },
      },
      required: ['provider', 'id'],
      type: 'object',
    },
    name: 'import_cc0_asset',
    title: 'Import a public CC0 asset',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Validate a strict, advisory, or open sourcing policy and evaluate whether one candidate may be selected.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        candidate: {
          additionalProperties: false,
          properties: {
            domain: { type: 'string' },
            sourceClass: { enum: ASSET_SOURCE_CLASSES, type: 'string' },
          },
          required: ['domain', 'sourceClass'],
          type: 'object',
        },
        policy: { type: 'object' },
      },
      required: ['candidate'],
      type: 'object',
    },
    name: 'validate_asset_candidate',
    title: 'Validate an asset candidate',
  },
  {
    annotations: { destructiveHint: false, idempotentHint: true },
    description: 'Record why a custom shader or asset was required and regenerate JSON plus Markdown feedback reports.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        approvedBy: { type: ['string', 'null'] },
        attempts: { items: { type: 'object' }, type: 'array' },
        bundleSlot: { type: ['string', 'null'] },
        customImplementation: {},
        domain: { type: 'string' },
        feedbackNeeded: { type: 'string' },
        id: { type: 'string' },
        kind: { type: 'string' },
        provenance: {},
        reason: { type: 'string' },
        status: { type: 'string' },
        targetId: { type: ['string', 'null'] },
      },
      required: ['id', 'domain', 'kind', 'reason'],
      type: 'object',
    },
    name: 'record_asset_gap',
    title: 'Record a custom asset or shader gap',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Explain what asset generation is available in the open-source local server.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_generation_capabilities',
    title: 'Get local generation capabilities',
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'get_anime_game_profile': return {
      artDirection: TOONLAB_ANIME_GAME_PROFILE,
      defaultStyleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
      product: 'Anime-style game, character, and environment development for Three.js',
      routing: STYLE_DOMAIN_SLOT_ROUTES,
    };
    case 'get_workspace_info': return getWorkspaceInfo(workspace);
    case 'search_assets': return searchAssets(args);
    case 'get_asset': return getAsset(args);
    case 'list_my_creations': return listMyCreations(args);
    case 'get_my_creation': return getMyCreation(args);
    case 'save_creation': return saveCreation(workspace, args);
    case 'generate_asset': return generateAsset(args);
    case 'search_cc0_assets': return searchCc0Assets(args);
    case 'get_cc0_asset': return getCc0AssetDetails(args);
    case 'import_cc0_asset': return importCc0Asset(args);
    case 'validate_asset_candidate': {
      const policyValidation = args.policy
        ? validateAssetSourcingPolicy(args.policy)
        : { ok: true, value: null };
      return {
        availableModes: ASSET_POLICY_MODES,
        policyValidation,
        result: policyValidation.ok
          ? evaluateAssetCandidate(policyValidation.value, args.candidate)
          : { allowed: false, decision: 'deny', reason: policyValidation.errors.join(' ') },
      };
    }
    case 'record_asset_gap': return recordAssetGap(args);
    case 'get_generation_capabilities': return {
      available: [
        'Generate deterministic recipes from the stable public ToonLab catalog entries.',
        'Save and retrieve editable lab documents through the shared .toonlab workspace.',
        'Search and import CC0 assets from Poly Haven and ambientCG.',
        'Use each recipe\'s spawn snippet to integrate it into a Three.js project.',
      ],
      unsupportedStyleDomains: ['lighting', 'vfx', 'renderer'],
      hostedProAdds: [
        'Managed image and 3D model generation providers',
        'Cloud library and cross-device sync',
        'Remote Streamable HTTP transport with OAuth',
      ],
      mode: 'open-source-local',
    };
    default: throw new Error(`Unknown tool "${name}".`);
  }
}

async function listResources() {
  const assets = await allAssets();
  return assets.slice(0, 500).map((entry) => ({
    description: entry.description ?? `${entry.source} ToonLab asset`,
    mimeType: entry.mimeType ?? 'application/json',
    name: entry.label ?? entry.name ?? entry.id,
    uri: `toonlab://asset/${encodeURIComponent(entry.id)}`,
  }));
}

async function readResource(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'toonlab:' || parsed.hostname !== 'asset') throw new Error(`Unsupported resource URI: ${uri}`);
  const id = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const asset = await getAsset({ id });
  if (asset.source === 'workspace') {
    const file = await readWorkspaceFile(workspace, asset.relativePath);
    if (file.data.length > 5 * 1024 * 1024) throw new Error('Resource is larger than the 5 MB MCP inline limit. Use its absolutePath.');
    if (file.mimeType === 'application/json' || file.mimeType.startsWith('text/')) {
      return { contents: [{ mimeType: file.mimeType, text: file.data.toString('utf8'), uri }] };
    }
    return { contents: [{ blob: file.data.toString('base64'), mimeType: file.mimeType, uri }] };
  }
  return { contents: [{ mimeType: 'application/json', text: JSON.stringify(asset, null, 2), uri }] };
}

async function handleRequest(message) {
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    const requested = params.protocolVersion;
    return {
      id,
      jsonrpc: '2.0',
      result: {
        capabilities: { resources: {}, tools: {} },
        instructions: 'ToonLab builds anime-style games, characters, and environments for Three.js. Load the selected style bundle first. If no asset-sourcing policy exists, ask the developer, then continue with library-first advisory discovery while recording the unresolved decision. Search the project and ToonLab libraries before public sources; generate or hand-author only when policy permits. Validate every candidate, preserve provenance, evaluate anime-fit in scene, and record a gap before adding a custom shader, texture, model, or adapter.',
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : LATEST_PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }
  if (method === 'ping') return { id, jsonrpc: '2.0', result: {} };
  if (method === 'tools/list') return { id, jsonrpc: '2.0', result: { tools: TOOLS } };
  if (method === 'tools/call') {
    try {
      return { id, jsonrpc: '2.0', result: jsonContent(await callTool(params.name, params.arguments ?? {})) };
    } catch (error) {
      return { id, jsonrpc: '2.0', result: errorContent(error) };
    }
  }
  if (method === 'resources/list') return { id, jsonrpc: '2.0', result: { resources: await listResources() } };
  if (method === 'resources/read') {
    try {
      return { id, jsonrpc: '2.0', result: await readResource(params.uri) };
    } catch (error) {
      return { error: { code: -32002, message: error?.message ?? String(error) }, id, jsonrpc: '2.0' };
    }
  }
  return { error: { code: -32601, message: `Method not found: ${method}` }, id, jsonrpc: '2.0' };
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  input += chunk;
  let newline = input.indexOf('\n');
  while (newline >= 0) {
    const line = input.slice(0, newline).trim();
    input = input.slice(newline + 1);
    if (line) {
      try {
        const message = JSON.parse(line);
        if (message.id !== undefined && message.id !== null) {
          process.stdout.write(`${JSON.stringify(await handleRequest(message))}\n`);
        }
      } catch (error) {
        process.stdout.write(`${JSON.stringify({
          error: { code: -32700, message: error?.message ?? 'Parse error' },
          id: null,
          jsonrpc: '2.0',
        })}\n`);
      }
    }
    newline = input.indexOf('\n');
  }
});

process.stdin.on('end', () => process.exit(0));
