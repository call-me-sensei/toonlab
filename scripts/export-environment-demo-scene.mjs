#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_PROJECT = resolve(ROOT_DIR, '..', 'StylizedExploration', 'StylizedExploration.uproject');
const DEFAULT_EDITOR =
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';

const args = process.argv.slice(2);
const optionValue = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const editor = process.env.TOONLAB_UNREAL_EDITOR || DEFAULT_EDITOR;
const project = resolve(optionValue('--project', process.env.TOONLAB_STYLIZED_PROJECT || DEFAULT_PROJECT));
const map = optionValue(
  '--map',
  '/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines',
);
const output = resolve(optionValue(
  '--output',
  resolve(ROOT_DIR, 'assets-local', 'sostylized', 'demo-scenes', `${map.split('/').at(-1)}.json`),
));
const gltfOutput = resolve(optionValue(
  '--glb-output',
  resolve(ROOT_DIR, 'assets-local', 'sostylized', 'demo-scenes', `${map.split('/').at(-1)}.glb`),
));
const authoredGltfOutput = resolve(optionValue(
  '--authored-glb-output',
  resolve(
    ROOT_DIR,
    'assets-local',
    'sostylized',
    'demo-scenes',
    `${map.split('/').at(-1)}-authored.glb`,
  ),
));
const bakeSize = optionValue(
  '--bake-size',
  process.env.TOONLAB_DEMO_MATERIAL_BAKE_SIZE || '256',
);
const exportAuthored = !args.includes('--geometry-only');
const manifestOnly = args.includes('--manifest-only');

for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) {
    console.error(`${label} was not found at ${path}`);
    process.exit(1);
  }
}

console.log(`Exporting authored demo placement from ${map} to ${output}`);
const result = spawnSync(editor, [
  project,
  '-run=pythonscript',
  `-script=${resolve(SCRIPT_DIR, 'unreal', 'export-environment-demo-scene.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-AllowCommandletRendering',
  '-RenderOffscreen',
], {
  env: {
    ...process.env,
    TOONLAB_DEMO_MAP: map,
    TOONLAB_DEMO_AUTHORED_GLTF_OUTPUT: !manifestOnly && exportAuthored ? authoredGltfOutput : '',
    TOONLAB_DEMO_GLTF_OUTPUT: manifestOnly ? '' : gltfOutput,
    TOONLAB_DEMO_MATERIAL_BAKE_SIZE: bakeSize,
    TOONLAB_DEMO_SCENE_OUTPUT: output,
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
