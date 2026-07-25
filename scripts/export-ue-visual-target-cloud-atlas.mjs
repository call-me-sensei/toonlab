#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOONLAB_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(TOONLAB_ROOT, '..');
const project = resolve(WORKSPACE_ROOT, 'StylizedExploration/StylizedExploration.uproject');
const commandlet = process.env.TOONLAB_UNREAL_COMMANDLET
  || '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd';
const script = resolve(TOONLAB_ROOT, 'scripts/unreal/export_visual_target_cloud_atlas.py');
const output = resolve(
  TOONLAB_ROOT,
  'assets-local/parity/single-rock/source-references/ue-documented/cloud-atlas',
);

for (const [label, file] of [
  ['Unreal project', project],
  ['Unreal commandlet', commandlet],
  ['export script', script],
]) {
  if (!existsSync(file)) throw new Error(`${label} was not found at ${file}`);
}
mkdirSync(output, { recursive: true });

const result = spawnSync(commandlet, [
  project,
  '-run=pythonscript',
  `-script=${script}`,
  `-ParityCloudAtlasOutput=${output}`,
  '-stdout',
  '-unattended',
  '-nopause',
  '-nosplash',
  '-nosound',
  '-nullrhi',
], { stdio: 'inherit' });
if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) {
  throw new Error(`Unreal cloud-atlas export exited ${result.status}`);
}

const reportFile = resolve(output, 'report.json');
if (!existsSync(reportFile)) throw new Error('Unreal did not emit the cloud-atlas report.');
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
if (
  report.schema !== 'toonlab.ue-visual-target-cloud-atlas'
  || report.source.textureWidth !== 256
  || report.source.curveRow !== 0
  || report.source.srgb !== false
  || !existsSync(report.output.path)
) {
  throw new Error(`Invalid Visual Target cloud-atlas export: ${reportFile}`);
}
console.log(`Exported exact Visual Target Classic Day cloud atlas: ${report.output.sha256}`);
