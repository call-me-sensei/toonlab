#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_PROJECT = resolve(ROOT_DIR, '..', 'StylizedExploration', 'StylizedExploration.uproject');
const DEFAULT_OUTPUT = resolve(ROOT_DIR, 'assets-local', 'sostylized', 'catalog-meshes');
const DEFAULT_MAC_EDITOR =
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';

const args = process.argv.slice(2);
const optionValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const editor = process.env.TOONLAB_UNREAL_EDITOR || DEFAULT_MAC_EDITOR;
const project = resolve(optionValue('--project', process.env.TOONLAB_STYLIZED_PROJECT || DEFAULT_PROJECT));
const output = resolve(optionValue('--output', DEFAULT_OUTPUT));
const filter = optionValue('--filter', '');
const force = args.includes('--force');
const materials = args.includes('--materials');
const bakeSize = optionValue(
  '--bake-size',
  process.env.TOONLAB_ENVIRONMENT_REFERENCE_BAKE_SIZE || '128',
);

for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) {
    console.error(`${label} was not found at ${path}`);
    process.exit(1);
  }
}

console.log(`Exporting the complete local environment mesh catalog to ${output}`);
const result = spawnSync(editor, [
  project,
  '-run=pythonscript',
  `-script=${resolve(SCRIPT_DIR, 'unreal', 'export-rock-reference-assets.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-AllowCommandletRendering',
  '-RenderOffscreen',
], {
  env: {
    ...process.env,
    TOONLAB_REFERENCE_ASSET_ROOT: '/Game/SoStylized/Environment',
    TOONLAB_REFERENCE_MANIFEST_SCHEMA: 'toonlab.local-environment-references',
    TOONLAB_REFERENCE_OUTPUT: output,
    TOONLAB_REFERENCE_PRESERVE_PATHS: '1',
    TOONLAB_ROCK_REFERENCE_FILTER: filter,
    TOONLAB_ROCK_REFERENCE_FORCE: force ? '1' : '0',
    TOONLAB_ROCK_REFERENCE_MATERIALS: materials ? '1' : '0',
    TOONLAB_ROCK_REFERENCE_BAKE_SIZE: bakeSize,
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
