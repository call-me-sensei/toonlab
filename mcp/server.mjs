#!/usr/bin/env node

import { basename, extname } from 'node:path';
import { builtinCatalogEntries } from '../src/catalog/builtinEntries.js';
import {
  fetchPolyhavenFiles,
  fetchPolyhavenIndex,
  filterAssetRefs,
  resolvePolyhavenModelDownload,
  resolvePolyhavenTextureDownload,
  searchAmbientcg,
  resolveAmbientcgDownload,
} from '../src/assetlib/index.js';
import {
  getWorkspaceInfo,
  listLibraryEntries,
  listStorageDocuments,
  listWorkspaceFiles,
  matchesText,
  readWorkspaceFile,
  resolveWorkspacePath,
  saveCreation,
  writeWorkspaceFile,
} from './workspace.mjs';
import {
  STYLE_LAB_TOOLS,
  callStyleLabTool,
  isStyleLabTool,
} from './style-lab-tools.mjs';

const SERVER_NAME = 'toonlab-oss';
const SERVER_VERSION = '0.2.0';
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

function summarizeCatalogEntry(entry) {
  return {
    cluster: entry.cluster,
    description: entry.description ?? null,
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    source: entry.source ?? 'builtin',
    tags: entry.tags ?? [],
    thumbnail: entry.thumbnail ?? null,
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

async function allAssets() {
  const [library, storage, files] = await Promise.all([
    listLibraryEntries(workspace),
    listStorageDocuments(workspace),
    listWorkspaceFiles(workspace),
  ]);
  return [
    ...builtinCatalogEntries().map((entry) => ({ ...entry, source: 'builtin' })),
    ...library.map((entry) => ({ ...entry, source: 'library' })),
    ...storage,
    ...files,
  ];
}

async function findAsset(id, source = null) {
  const assets = await allAssets();
  return assets.find((entry) => entry.id === id && (!source || entry.source === source)) ?? null;
}

function matchesTags(entry, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return true;
  const actual = new Set((entry.tags ?? []).map((tag) => String(tag).toLowerCase()));
  return tags.every((tag) => actual.has(String(tag).toLowerCase()));
}

async function searchAssets(args) {
  const assets = await allAssets();
  const results = assets.filter((entry) => {
    if (args.source && entry.source !== args.source) return false;
    if (args.cluster && entry.cluster !== args.cluster) return false;
    if (args.kind && entry.kind !== args.kind) return false;
    if (!matchesTags(entry, args.tags)) return false;
    return matchesText(entry, args.query);
  }).slice(0, limitValue(args.limit));
  return {
    count: results.length,
    items: results.map((entry) => {
      if (entry.source === 'workspace') return entry;
      if (entry.source === 'workspace-storage') return summarizeStorageDocument(entry);
      return summarizeCatalogEntry(entry);
    }),
  };
}

async function getAsset(args) {
  const asset = await findAsset(args.id, args.source);
  if (!asset) throw new Error(`Asset "${args.id}" was not found.`);
  if (asset.source === 'workspace') return asset;
  if (asset.source === 'workspace-storage') return asset;
  return asset;
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
  const entry = builtinCatalogEntries().find((item) => item.id === args.catalog_id);
  if (!entry) throw new Error(`Unknown built-in catalog asset "${args.catalog_id}".`);
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
  return { count: Math.min(results.length, limit), errors, items: results.slice(0, limit).map(compactCc0Ref) };
}

async function getCc0AssetDetails({ id, kind = 'model', provider, resolution = '1k' }) {
  if (provider === 'ambientcg') {
    const [ref] = await searchAmbientcg({ id });
    if (!ref) throw new Error(`ambientCG asset "${id}" was not found.`);
    const download = resolveAmbientcgDownload(ref, { resolution: resolution.toUpperCase() });
    return { download, ref: compactCc0Ref(ref) };
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
    return { download, ref: compactCc0Ref(ref) };
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
  return { ...details, files: [...files, manifest], workspace };
}

const TOOLS = [
  {
    annotations: { readOnlyHint: true },
    description: 'Show the local .toonlab workspace path, migration status, and item counts.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_workspace_info',
    title: 'Get ToonLab workspace info',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Search built-in procedural assets, saved library entries, lab presets, and files on disk.',
    inputSchema: {
      additionalProperties: false,
      properties: {
        cluster: { type: 'string' },
        kind: { type: 'string' },
        limit: { maximum: 100, minimum: 1, type: 'integer' },
        query: { type: 'string' },
        source: { enum: ['builtin', 'library', 'workspace', 'workspace-storage'], type: 'string' },
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
      properties: { id: { type: 'string' }, source: { type: 'string' } },
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
        name: { type: 'string' },
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
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
        limit: { maximum: 50, minimum: 1, type: 'integer' },
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
        id: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
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
        id: { type: 'string' },
        kind: { enum: ['model', 'texture', 'hdri'], type: 'string' },
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
    description: 'Explain what asset generation is available in the open-source local server.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'get_generation_capabilities',
    title: 'Get local generation capabilities',
  },
  ...STYLE_LAB_TOOLS,
];

async function callTool(name, args = {}) {
  switch (name) {
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
    case 'get_generation_capabilities': return {
      available: [
        'Generate deterministic recipes from every built-in ToonLab catalog entry.',
        'Author, validate, and batch-resolve open-domain recipes for the generative style domains (post, camera, game feel, lighting styles, light fixtures).',
        'Save and retrieve editable lab documents through the shared .toonlab workspace.',
        'Search and import CC0 assets from Poly Haven and ambientCG.',
        'Use each recipe\'s spawn snippet to integrate it into a Three.js project.',
      ],
      hostedProAdds: [
        'Managed image and 3D model generation providers',
        'Cloud library and cross-device sync',
        'Remote Streamable HTTP transport with OAuth',
      ],
      mode: 'open-source-local',
    };
    default:
      if (isStyleLabTool(name)) {
        return callStyleLabTool(name, args, { saveCreation, workspace });
      }
      throw new Error(`Unknown tool "${name}".`);
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
        instructions: 'Use ToonLab to search public and private assets, create deterministic recipes, import CC0 files, and work with the local .toonlab workspace.',
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
