import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getLibraryState,
  importBrowserStorage,
  readBrowserStorage,
  saveLibraryEntry,
} from '../mcp/workspace.mjs';
import { CALL_ME_SENSEI_STRICT_ASSET_POLICY } from '../src/asset-policy/index.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const serverPath = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));
const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const workspace = await mkdtemp(join(tmpdir(), 'toonlab-mcp-'));

function createClient(child) {
  let sequence = 0;
  let buffer = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line);
        const wait = pending.get(message.id);
        if (wait) {
          pending.delete(message.id);
          wait.resolve(message);
        }
      }
      newline = buffer.indexOf('\n');
    }
  });
  return {
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    request(method, params = {}) {
      sequence += 1;
      const id = sequence;
      child.stdin.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}.`));
        }, 10_000);
        pending.set(id, {
          reject,
          resolve(message) {
            clearTimeout(timer);
            resolve(message);
          },
        });
      });
    },
  };
}

try {
  const empty = await readBrowserStorage(workspace);
  assert.equal(empty.initialized, false);

  const migrated = await importBrowserStorage(workspace, {
    'toonlab.prop-lab.presets.v1': JSON.stringify([{ id: 'local-lantern', label: 'Local lantern' }]),
    'toonlab.texture-lab.ai.v1': JSON.stringify({ keys: { openai: 'never-write-this' } }),
  });
  assert.equal(migrated.initialized, true);
  assert.equal('toonlab.texture-lab.ai.v1' in migrated.entries, false);

  await saveLibraryEntry(workspace, {
    cluster: 'propgen',
    id: 'user/test-entry',
    kind: 'recipe',
    label: 'Test entry',
    recipe: { settings: { asset: { seed: 1, type: 'lantern' } } },
    spawn: 'createPropAssetFromRecipe(entry.recipe)',
    tags: ['user'],
  });
  assert.equal((await getLibraryState(workspace)).entries.length, 1);

  const child = spawn(process.execPath, [serverPath, '--workspace', workspace], {
    cwd: projectRoot,
    env: { ...process.env, TOONLAB_LEGACY_WORKSPACE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const client = createClient(child);

  const initialized = await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'toonlab-verifier', version: '1' },
    protocolVersion: '2025-11-25',
  });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.equal(initialized.result.serverInfo.name, 'toonlab-oss');
  assert.equal(initialized.result.serverInfo.version, packageVersion);
  assert.match(initialized.result.instructions, /anime-style games/i);
  client.notify('notifications/initialized');

  const listed = await client.request('tools/list');
  const toolNames = listed.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes('search_assets'));
  assert.ok(toolNames.includes('generate_asset'));
  assert.ok(toolNames.includes('import_cc0_asset'));
  assert.ok(toolNames.includes('get_anime_game_profile'));
  assert.ok(toolNames.includes('validate_asset_candidate'));
  assert.ok(toolNames.includes('record_asset_gap'));
  assert.equal(toolNames.includes('list_style_labs'), false);
  const searchTool = listed.result.tools.find((tool) => tool.name === 'search_assets');
  assert.ok(searchTool.inputSchema.properties.source.enum.includes('official'));
  assert.equal(searchTool.inputSchema.properties.offset.minimum, 0);
  assert.match(searchTool.description, /dimensions and taxonomy metadata/i);

  const firstBuiltinPage = await client.request('tools/call', {
    arguments: { limit: 1, offset: 0, source: 'builtin' },
    name: 'search_assets',
  });
  assert.equal(firstBuiltinPage.result.structuredContent.count, 1);
  assert.ok(firstBuiltinPage.result.structuredContent.total > 1);
  assert.equal(firstBuiltinPage.result.structuredContent.nextOffset, 1);
  const secondBuiltinPage = await client.request('tools/call', {
    arguments: { limit: 1, offset: 1, source: 'builtin' },
    name: 'search_assets',
  });
  assert.notEqual(
    firstBuiltinPage.result.structuredContent.items[0].id,
    secondBuiltinPage.result.structuredContent.items[0].id,
  );

  const animeProfile = await client.request('tools/call', {
    arguments: {},
    name: 'get_anime_game_profile',
  });
  assert.equal(animeProfile.result.structuredContent.artDirection.family, 'anime-game');
  assert.equal(animeProfile.result.structuredContent.defaultStyleBundle.version, 2);

  const capabilities = await client.request('tools/call', {
    arguments: {},
    name: 'get_generation_capabilities',
  });
  assert.equal(capabilities.result.isError, undefined);
  assert.deepEqual(
    capabilities.result.structuredContent.unsupportedStyleDomains,
    ['lighting', 'vfx', 'renderer'],
  );

  const searched = await client.request('tools/call', {
    arguments: { source: 'library' },
    name: 'search_assets',
  });
  assert.equal(searched.result.isError, undefined);
  assert.equal(searched.result.structuredContent.items[0].id, 'user/test-entry');
  assert.equal(searched.result.structuredContent.items[0].sourceClass, 'toonlab-library');
  assert.equal(searched.result.structuredContent.items[0].policyDecision.decision, 'warn');

  const strictDenied = await client.request('tools/call', {
    arguments: {
      candidate: { domain: 'natural.rock', sourceClass: 'procedural' },
      policy: CALL_ME_SENSEI_STRICT_ASSET_POLICY,
    },
    name: 'validate_asset_candidate',
  });
  assert.equal(strictDenied.result.structuredContent.result.allowed, false);
  const blockedGeneration = await client.request('tools/call', {
    arguments: {
      catalog_id: 'rock/boulder',
      domain: 'natural.rock',
      policy: CALL_ME_SENSEI_STRICT_ASSET_POLICY,
      save: false,
    },
    name: 'generate_asset',
  });
  assert.equal(blockedGeneration.result.isError, true);

  const generated = await client.request('tools/call', {
    arguments: { catalog_id: 'water/lake', name: 'MCP water', seed: 77 },
    name: 'generate_asset',
  });
  assert.equal(generated.result.isError, undefined);
  assert.equal(generated.result.structuredContent.document.seed, 77);
  const generatedPath = generated.result.structuredContent.file.absolutePath;
  assert.match(await readFile(generatedPath, 'utf8'), /"seed": 77/);

  const gap = await client.request('tools/call', {
    arguments: {
      attempts: [{ query: 'anime cloud mesh', tool: 'search_assets' }],
      domain: 'cloud',
      feedbackNeeded: 'Add a reusable anime cloud adapter.',
      id: 'custom-cloud-adapter',
      kind: 'custom-shader-adapter',
      reason: 'No supported adapter matched the host renderer.',
    },
    name: 'record_asset_gap',
  });
  assert.equal(gap.result.isError, undefined);
  assert.match(await readFile(gap.result.structuredContent.jsonPath, 'utf8'), /custom-cloud-adapter/);
  assert.match(await readFile(gap.result.structuredContent.markdownPath, 'utf8'), /Add a reusable anime cloud adapter/);

  const creations = await client.request('tools/call', {
    arguments: { query: 'mcp-water' },
    name: 'list_my_creations',
  });
  assert.equal(creations.result.structuredContent.count, 1);

  const resources = await client.request('resources/list');
  assert.ok(resources.result.resources.some((resource) => resource.name === 'Test entry'));

  child.stdin.end();
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`MCP exited ${code}: ${stderr}`)));
  });

  console.log('MCP + workspace verification passed.');
} finally {
  await rm(workspace, { force: true, recursive: true });
}
