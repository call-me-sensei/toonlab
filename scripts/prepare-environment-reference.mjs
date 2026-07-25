#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_PROJECT = resolve(
  ROOT_DIR,
  '..',
  'StylizedExploration',
  'StylizedExploration.uproject',
);
const DEFAULT_EDITOR =
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';
const SOURCE_MAP = '/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines';
const REFERENCE_MAP =
  '/Game/ToonLab/Reference/SoStylized/SnowPines/Demonstration_SnowPines_UE52Reference';
const args = process.argv.slice(2);
const optionValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const editor = process.env.TOONLAB_UNREAL_EDITOR || DEFAULT_EDITOR;
const project = resolve(optionValue(
  '--project',
  process.env.TOONLAB_STYLIZED_PROJECT || DEFAULT_PROJECT,
));
for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) throw new Error(`${label} was not found at ${path}`);
}

const referenceMap = optionValue('--reference-map', REFERENCE_MAP);
const sourceMap = optionValue('--source-map', SOURCE_MAP);
const referenceFile = resolve(
  dirname(project),
  'Content',
  `${referenceMap.replace(/^\/Game\//, '')}.umap`,
);
const pythonScript = resolve(SCRIPT_DIR, 'unreal', 'prepare-environment-reference.py');
const runEditor = (map, extraEnv = {}) => spawnSync(editor, [
  project,
  map,
  `-ExecutePythonScript=${pythonScript}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-RenderOffscreen',
], {
  env: {
    ...process.env,
    TOONLAB_REFERENCE_MAP: referenceMap,
    TOONLAB_SOURCE_MAP: sourceMap,
    ...extraEnv,
  },
  stdio: 'inherit',
});

if (!existsSync(referenceFile)) {
  const duplicateResult = runEditor(sourceMap, { TOONLAB_REFERENCE_DUPLICATE_ONLY: '1' });
  if (duplicateResult.error) throw duplicateResult.error;
  if ((duplicateResult.status ?? 1) !== 0 || !existsSync(referenceFile)) {
    process.exit((duplicateResult.status ?? 1) || 1);
  }
}

const result = runEditor(referenceMap);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
