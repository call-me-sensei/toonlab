#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const project = resolve(
  process.env.TOONLAB_STYLIZED_PROJECT
    || resolve(ROOT_DIR, '..', 'StylizedExploration', 'StylizedExploration.uproject'),
);
const editor = process.env.TOONLAB_UNREAL_EDITOR
  || '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';
const output = resolve(
  process.env.TOONLAB_FOG_VOLUME_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'fog-volume'),
);

for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) {
    console.error(`${label} was not found at ${path}`);
    process.exit(1);
  }
}

const result = spawnSync(editor, [
  project,
  '-run=pythonscript',
  `-script=${resolve(SCRIPT_DIR, 'unreal', 'export-so-stylized-fog-volume.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-nullrhi',
], {
  env: { ...process.env, TOONLAB_FOG_VOLUME_OUTPUT: output },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
