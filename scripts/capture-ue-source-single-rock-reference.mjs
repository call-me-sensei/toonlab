#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOONLAB_ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = resolve(TOONLAB_ROOT, '..');
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, 'StylizedExploration');
const DEFAULT_PROJECT = resolve(PROJECT_ROOT, 'StylizedExploration.uproject');
const DEFAULT_COMMANDLET =
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd';
const DEFAULT_CONTRACT = resolve(
  TOONLAB_ROOT,
  'assets-local/parity/single-rock/contract.json',
);
const DEFAULT_OUTPUT = resolve(
  TOONLAB_ROOT,
  'assets-local/parity/single-rock/source-references/ue-documented',
);
const VISUAL_TARGET_LEVEL =
  '/Game/ToonLab/Parity/SingleRock/L_SingleRockSourceReference';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const mode = option('--mode', 'hard');
if (!['hard', 'off', 'all'].includes(mode)) {
  throw new Error('--mode must be hard, off, or all');
}
const lightMode = option('--light-mode', 'contract');
if (!['author', 'contract'].includes(lightMode)) {
  throw new Error('--light-mode must be author or contract');
}

const project = resolve(option('--project', DEFAULT_PROJECT));
const contractPath = resolve(option('--contract', DEFAULT_CONTRACT));
const output = resolve(option('--output', DEFAULT_OUTPUT));
const commandlet = option('--commandlet', process.env.TOONLAB_UNREAL_COMMANDLET || DEFAULT_COMMANDLET);
const warmupFrames = String(Math.max(2, Number(option('--warmup-frames', '180')) || 180));
for (const [label, path] of [
  ['Unreal project', project],
  ['Unreal commandlet', commandlet],
  ['Parity contract', contractPath],
]) {
  if (!existsSync(path)) throw new Error(`${label} was not found at ${path}`);
}

mkdirSync(output, { recursive: true });
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const builder = resolve(PROJECT_ROOT, 'Scripts/build_source_single_rock_reference_unreal.py');
const build = spawnSync(commandlet, [
  project,
  '-run=pythonscript',
  `-script=${builder}`,
  `-ParityContract=${contractPath}`,
  `-ParitySourceOutput=${output}`,
  `-ParityVisualTargetLightMode=${lightMode}`,
  '-stdout',
  '-unattended',
  '-nopause',
  '-nosplash',
  '-nosound',
  '-nullrhi',
], { stdio: 'inherit' });
if (build.error) throw build.error;
if ((build.status ?? 1) !== 0) {
  throw new Error(`Unreal Visual Target level build exited ${build.status}`);
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const requestedModes = mode === 'all' ? ['off', 'hard'] : [mode];
const captures = [];
for (const shadowMode of requestedModes) {
  const staging = mkdtempSync(resolve(tmpdir(), `toonlab-ue-visual-target-${lightMode}-${shadowMode}-`));
  try {
    const capture = spawnSync(process.execPath, [
      resolve(TOONLAB_ROOT, 'scripts/capture-environment-demo-reference.mjs'),
      '--project', project,
      '--map', VISUAL_TARGET_LEVEL,
      '--output', staging,
      '--camera', '1',
      '--width', String(contract.render.width),
      '--height', String(contract.render.height),
      '--warmup-frames', warmupFrames,
      '--shadow-mode', shadowMode,
      '--recapture-skylight', '0',
    ], { stdio: 'inherit' });
    const staged = resolve(staging, 'CameraRender1.png');
    if (capture.error) throw capture.error;
    if ((capture.status ?? 1) !== 0 || !existsSync(staged)) {
      throw new Error(`Unreal Visual Target ${shadowMode} capture failed`);
    }
    const destination = resolve(
      output,
      `unreal-${lightMode}-light-shadow-${shadowMode}.png`,
    );
    copyFileSync(staged, destination);
    captures.push({
      id: `ue-visual-target-${lightMode}-${shadowMode}`,
      lightMode,
      shadowMode,
      path: destination,
      width: Number(contract.render.width),
      height: Number(contract.render.height),
      format: 'PNG native Unreal editor viewport SDR sRGB',
      bytes: statSync(destination).size,
      sha256: sha256(destination),
      warmupFrames: Number(warmupFrames),
      sourceSkyLightRecaptured: false,
    });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const levelReportPath = resolve(output, 'level-report.json');
const configurationPath = resolve(
  TOONLAB_ROOT,
  'assets-local/parity/single-rock/source-configurations/ue-so-stylized-documented.json',
);
const reportPath = resolve(output, 'report.json');
let previousReport = null;
if (existsSync(reportPath)) {
  try {
    previousReport = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    previousReport = null;
  }
}
const previousCaptures = previousReport?.schema === 'toonlab.ue-visual-target-capture'
  ? previousReport.captures.filter((capture) => (
      ['author', 'contract'].includes(capture.lightMode) && existsSync(capture.path)
    ))
  : [];
const captureIndex = new Map(previousCaptures.map((capture) => [capture.id, capture]));
for (const capture of captures) captureIndex.set(capture.id, capture);
const levelReport = JSON.parse(readFileSync(levelReportPath, 'utf8'));
const levelReports = {
  ...(previousReport?.levelReports || {}),
  [lightMode]: levelReport,
};
const report = {
  schema: 'toonlab.ue-visual-target-capture',
  version: 1,
  status: 'complete',
  displayRole: 'UE 5.8 Visual Target',
  visualTargetAuthority: 'Pack-author documented production/reference setup',
  contract: {
    path: contractPath,
    sha256: sha256(contractPath),
    checkpoint: contract.checkpoint,
  },
  configuration: {
    path: configurationPath,
    sha256: sha256(configurationPath),
  },
  generatedLevel: VISUAL_TARGET_LEVEL,
  levelReports,
  captures: [...captureIndex.values()].sort((left, right) => left.id.localeCompare(right.id)),
  comparisonPolicy: {
    diagnosticProfile: 'p01-cool-sh0 remains unchanged',
    contractLight: 'shared P01 sun quaternion; direct shadow placement is comparable',
    authorLight: 'untouched pack-demo sun direction; production-look reference',
    visualTargetTrack: 'native viewport captures remain outside numerical parity gates',
    equivalentUnityAndToonLabTracks: 'pending explicit source-environment adapters',
  },
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Captured UE 5.8 single-rock Visual Target (${lightMode} light): ${output}`);
