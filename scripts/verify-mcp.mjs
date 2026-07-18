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

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const serverPath = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));
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
  client.notify('notifications/initialized');

  const listed = await client.request('tools/list');
  const toolNames = listed.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes('search_assets'));
  assert.ok(toolNames.includes('generate_asset'));
  assert.ok(toolNames.includes('import_cc0_asset'));
  assert.ok(toolNames.includes('list_style_labs'));
  assert.ok(toolNames.includes('create_style_recipe'));
  assert.ok(toolNames.includes('generate_style_presets'));
  assert.ok(toolNames.includes('validate_style_document'));

  const styleLabs = await client.request('tools/call', {
    arguments: {},
    name: 'list_style_labs',
  });
  assert.equal(styleLabs.result.isError, undefined);
  assert.deepEqual(
    styleLabs.result.structuredContent.labs.map((lab) => lab.id),
    ['post', 'camera', 'game-feel', 'lighting-style', 'light-fixture'],
  );

  for (const lab of styleLabs.result.structuredContent.labs) {
    const createdRecipe = await client.request('tools/call', {
      arguments: {
        ...(lab.id === 'camera' ? { family: 'wide_exploration' } : {}),
        id: `mcp-${lab.id}`,
        lab: lab.id,
        save: false,
        seed: 8042,
      },
      name: 'create_style_recipe',
    });
    assert.equal(createdRecipe.result.isError, undefined, `${lab.id} recipe creation failed`);
    const recipe = createdRecipe.result.structuredContent.recipe;
    if (lab.id === 'camera') assert.equal(recipe.basePreset, 'wide_exploration');

    const generatedPresets = await client.request('tools/call', {
      arguments: {
        count: 3,
        lab: lab.id,
        quality: 'mobile',
        recipe,
        save: false,
        start_seed: 120,
      },
      name: 'generate_style_presets',
    });
    assert.equal(generatedPresets.result.isError, undefined, `${lab.id} preset generation failed`);
    assert.equal(generatedPresets.result.structuredContent.count, 3);
    assert.equal(
      generatedPresets.result.structuredContent.qualityApplied,
      lab.generation.qualities.length > 0,
      `${lab.id} quality capability drifted`,
    );
    assert.equal(new Set(generatedPresets.result.structuredContent.presets.map((preset) => preset.id)).size, 3);

    const validatedRecipe = await client.request('tools/call', {
      arguments: { document: recipe, kind: 'recipe', lab: lab.id },
      name: 'validate_style_document',
    });
    assert.equal(validatedRecipe.result.structuredContent.ok, true, `${lab.id} recipe validation failed`);
  }

  const invalidDomainRecipe = await client.request('tools/call', {
    arguments: { id: 'invalid-domain', lab: 'post', save: false },
    name: 'create_style_recipe',
  });
  const rejectedDomain = await client.request('tools/call', {
    arguments: {
      document: {
        ...invalidDomainRecipe.result.structuredContent.recipe,
        domains: { exposure: { $type: 'range', min: 2, max: 1 } },
      },
      kind: 'recipe',
      lab: 'post',
    },
    name: 'validate_style_document',
  });
  assert.equal(rejectedDomain.result.structuredContent.ok, false);
  assert.match(rejectedDomain.result.structuredContent.errors.join(' '), /max must be greater/i);

  const savedPostBatch = await client.request('tools/call', {
    arguments: { count: 2, lab: 'post', name: 'MCP post batch', start_seed: 9001 },
    name: 'generate_style_presets',
  });
  assert.equal(savedPostBatch.result.isError, undefined);
  assert.match(
    await readFile(savedPostBatch.result.structuredContent.file.absolutePath, 'utf8'),
    /"schema": "toonlab\/style-preset-batch"/,
  );

  const searched = await client.request('tools/call', {
    arguments: { source: 'library' },
    name: 'search_assets',
  });
  assert.equal(searched.result.isError, undefined);
  assert.equal(searched.result.structuredContent.items[0].id, 'user/test-entry');

  const generated = await client.request('tools/call', {
    arguments: { catalog_id: 'prop/lantern/stone-toro', name: 'MCP lantern', seed: 77 },
    name: 'generate_asset',
  });
  assert.equal(generated.result.isError, undefined);
  assert.equal(generated.result.structuredContent.document.seed, 77);
  const generatedPath = generated.result.structuredContent.file.absolutePath;
  assert.match(await readFile(generatedPath, 'utf8'), /"seed": 77/);

  const creations = await client.request('tools/call', {
    arguments: { query: 'mcp-lantern' },
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
