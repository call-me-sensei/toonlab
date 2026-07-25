#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const PROJECT = resolve(
  ROOT_DIR,
  '..',
  'StylizedExploration',
  'StylizedExploration.uproject',
);
const COMMANDLET =
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd';
const OUTPUT = resolve(
  ROOT_DIR,
  'assets-local',
  'parity',
  'minimal-environment',
  'p19-author-hard',
  'spire-05',
);
const CONTRACT = resolve(
  ROOT_DIR,
  'assets-local',
  'parity',
  'minimal-environment',
  'p13-author-hard',
  'spire-05',
  'contract.json',
);
const P19_CONTRACT = resolve(
  ROOT_DIR,
  'assets-local',
  'parity',
  'environment',
  'p19-mountain-cliff.json',
);
const BUILD_SCRIPT = resolve(
  SCRIPT_DIR,
  'unreal',
  'build_p19_mountain_cliff_unreal.py',
);
const CAPTURE_SCRIPT = resolve(
  SCRIPT_DIR,
  'capture-environment-demo-reference.mjs',
);
const MAP =
  '/Game/ToonLab/Parity/MinimalEnvironment/L_MinimalEnvironmentDemoP19';
const expected = Array.from(
  { length: 5 },
  (_, index) => resolve(OUTPUT, `CameraRender${index + 1}.png`),
);

for (const [label, path] of [
  ['Unreal project', PROJECT],
  ['Unreal commandlet', COMMANDLET],
  ['P13 lighting contract', CONTRACT],
  ['P19 fixture contract', P19_CONTRACT],
  ['P19 Unreal builder', BUILD_SCRIPT],
]) {
  if (!existsSync(path)) throw new Error(`${label} was not found at ${path}`);
}
mkdirSync(OUTPUT, { recursive: true });

const build = spawnSync(COMMANDLET, [
  PROJECT,
  '-run=pythonscript',
  `-script=${BUILD_SCRIPT}`,
  `-ParityContract=${CONTRACT}`,
  `-P19MountainCliffContract=${P19_CONTRACT}`,
  `-ParityOutput=${OUTPUT}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-nullrhi',
  '-stdout',
  '-FullStdOutLogOutput',
], {
  stdio: 'inherit',
});
if (build.error) throw build.error;
if ((build.status ?? 1) !== 0) {
  throw new Error(`P19 Unreal map build failed with status ${build.status}`);
}
const levelReportPath = resolve(OUTPUT, 'unreal-level-report.json');
if (!existsSync(levelReportPath)) {
  throw new Error('P19 Unreal map build produced no level report');
}
const levelReport = JSON.parse(readFileSync(levelReportPath, 'utf8'));
if (levelReport.status !== 'complete' || levelReport.cameras?.length !== 5) {
  throw new Error('P19 Unreal level report is incomplete');
}

const captureStartedAt = Date.now();
const capture = spawnSync(process.execPath, [
  CAPTURE_SCRIPT,
  '--project',
  PROJECT,
  '--map',
  MAP,
  '--output',
  OUTPUT,
  '--all',
  '--count',
  '5',
  '--width',
  '1920',
  '--height',
  '1080',
  '--warmup-frames',
  '180',
  '--shadow-mode',
  'hard',
  '--p19-family-isolation',
  '1',
], {
  stdio: 'inherit',
});
if (capture.error) throw capture.error;
const fresh = expected.every(
  (path) => existsSync(path) && statSync(path).mtimeMs >= captureStartedAt - 1000,
);
if (!fresh) {
  throw new Error('P19 Unreal capture did not produce all five fresh native frames');
}
if ((capture.status ?? 1) !== 0) {
  throw new Error(`P19 Unreal capture failed with status ${capture.status}`);
}

writeFileSync(
  resolve(OUTPUT, 'capture-manifest.json'),
  `${JSON.stringify({
    schema: 'toonlab.p19-native-unreal-captures',
    version: 1,
    status: 'complete',
    map: MAP,
    sourceLevelReport: levelReportPath,
    captures: [
      {
        view: 'front',
        file: 'CameraRender1.png',
        isolation: 'accepted-p13-p17-baseline',
      },
      {
        view: 'back',
        file: 'CameraRender2.png',
        isolation: 'accepted-p13-p17-baseline',
      },
      { view: 'mountain', file: 'CameraRender3.png', isolation: 'mountain-cliff-family' },
      { view: 'mountain-surface', file: 'CameraRender4.png', isolation: 'mountain-cliff-family' },
      { view: 'cliff', file: 'CameraRender5.png', isolation: 'mountain-cliff-family' },
    ],
  }, null, 2)}\n`,
);
console.log(`P19 native Unreal comparison captured at ${OUTPUT}`);
