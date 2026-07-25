#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
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
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/'
  + 'UnrealEditor.app/Contents/MacOS/UnrealEditor';
const DEFAULT_MAP =
  '/Game/ToonLab/Reference/SoStylized/SnowPines/'
  + 'Demonstration_SnowPines_UE52Reference';

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
const map = optionValue('--map', DEFAULT_MAP);
const output = resolve(optionValue(
  '--output',
  resolve(
    ROOT_DIR,
    'assets-local',
    'sostylized',
    'demo-scenes',
    'native-reference',
    'sky-light-irradiance.json',
  ),
));

for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) throw new Error(`${label} was not found at ${path}`);
}

const result = spawnSync(editor, [
  project,
  map,
  `-ExecutePythonScript=${resolve(SCRIPT_DIR, 'unreal', 'export-source-skylight-irradiance.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-RenderOffscreen',
], {
  env: {
    ...process.env,
    TOONLAB_DEMO_MAP: map,
    TOONLAB_SKYLIGHT_IRRADIANCE_OUTPUT: output,
  },
  stdio: 'inherit',
});
if (result.error) throw result.error;

if (!existsSync(output)) {
  throw new Error(`Unreal did not write ${output}`);
}
const artifact = JSON.parse(readFileSync(output, 'utf8'));
if (artifact.schema !== 'toonlab.ue-skylight-irradiance') {
  throw new Error(`Unexpected SkyLight artifact schema in ${output}`);
}
for (const field of ['unrealCoefficients', 'threeCoefficients']) {
  if (!Array.isArray(artifact[field]) || artifact[field].length !== 9) {
    throw new Error(`${field} must contain exactly nine RGB coefficients`);
  }
  if (artifact[field].some((coefficient) => (
    !Array.isArray(coefficient)
    || coefficient.length !== 3
    || coefficient.some((value) => !Number.isFinite(value))
  ))) {
    throw new Error(`${field} contains an invalid RGB coefficient`);
  }
}
const energy = artifact.unrealCoefficients.flat().reduce(
  (sum, value) => sum + Math.abs(value),
  0,
);
if (!(energy > 0)) throw new Error('The exported SkyLight contains no radiance');

console.log(`Exact UE SkyLight SH: ${output}`);
console.log(`Absolute coefficient energy: ${energy.toPrecision(8)}`);
if ((result.status ?? 1) !== 0) {
  console.warn(
    'Unreal exited non-zero after writing and validating the exact SkyLight artifact.',
  );
}
process.exit(0);
