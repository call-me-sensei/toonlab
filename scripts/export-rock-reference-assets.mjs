#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_PROJECT = resolve(ROOT_DIR, '..', 'StylizedExploration', 'StylizedExploration.uproject');
const DEFAULT_OUTPUT = resolve(ROOT_DIR, 'assets-local', 'rock-references');
const DEFAULT_MAC_EDITOR = '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';

const args = process.argv.slice(2);
const optionValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);

const editor = process.env.TOONLAB_UNREAL_EDITOR || DEFAULT_MAC_EDITOR;
const project = resolve(optionValue('--project', process.env.TOONLAB_STYLIZED_PROJECT || DEFAULT_PROJECT));
const output = resolve(optionValue('--output', DEFAULT_OUTPUT));
const bakeSize = Math.max(64, Math.min(4096, Number(optionValue('--bake-size', '256')) || 256));
const geometryOnly = has('--geometry-only');
const force = has('--force');
const filter = optionValue('--filter', '');

for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) {
    console.error(`${label} was not found at ${path}`);
    process.exit(1);
  }
}

const unrealArgs = [
  project,
  '-run=pythonscript',
  `-script=${resolve(SCRIPT_DIR, 'unreal', 'export-rock-reference-assets.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
];
if (geometryOnly) unrealArgs.push('-nullrhi');
else unrealArgs.push('-AllowCommandletRendering', '-RenderOffscreen');

console.log(`Exporting local rock references to ${output}`);
const result = spawnSync(editor, unrealArgs, {
  env: {
    ...process.env,
    TOONLAB_ROCK_REFERENCE_BAKE_SIZE: String(bakeSize),
    TOONLAB_ROCK_REFERENCE_FILTER: filter,
    TOONLAB_ROCK_REFERENCE_FORCE: force ? '1' : '0',
    TOONLAB_ROCK_REFERENCE_MATERIALS: geometryOnly ? '0' : '1',
    TOONLAB_ROCK_REFERENCE_OUTPUT: output,
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
