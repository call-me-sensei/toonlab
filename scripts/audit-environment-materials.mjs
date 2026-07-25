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
  process.env.TOONLAB_ENVIRONMENT_MATERIAL_AUDIT_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-audit.json'),
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
  `-script=${resolve(SCRIPT_DIR, 'unreal', 'audit-rock-reference-materials.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-nullrhi',
], {
  env: {
    ...process.env,
    TOONLAB_MATERIAL_AUDIT_ASSET_ROOT: '/Game/SoStylized/Environment',
    TOONLAB_MATERIAL_AUDIT_INCLUDE_ALL: '1',
    TOONLAB_MATERIAL_AUDIT_OUTPUT: output,
    TOONLAB_MATERIAL_AUDIT_SCHEMA: 'toonlab.sostylized-environment-material-audit',
    TOONLAB_MATERIAL_AUDIT_SOURCE_ROOT: '/Game/SoStylized/',
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
