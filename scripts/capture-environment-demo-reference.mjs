#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_PROJECT = resolve(ROOT_DIR, '..', 'StylizedExploration', 'StylizedExploration.uproject');
const DEFAULT_EDITOR =
  '/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';
const REFERENCE_MAP =
  '/Game/ToonLab/Reference/SoStylized/SnowPines/Demonstration_SnowPines_UE52Reference';
const args = process.argv.slice(2);
const optionValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const editor = process.env.TOONLAB_UNREAL_EDITOR || DEFAULT_EDITOR;
const project = resolve(optionValue('--project', process.env.TOONLAB_STYLIZED_PROJECT || DEFAULT_PROJECT));
const output = resolve(optionValue(
  '--output',
  resolve(ROOT_DIR, 'assets-local', 'sostylized', 'demo-scenes', 'native-reference'),
));
for (const [label, path] of [['Unreal Editor', editor], ['Unreal project', project]]) {
  if (!existsSync(path)) throw new Error(`${label} was not found at ${path}`);
}

const cameraNumber = Math.max(1, Math.min(16, Number(optionValue('--camera', '1')) || 1));
const captureCount = Math.max(
  1,
  Math.min(16, Number(optionValue('--count', '16')) || 16),
);
const expectedFiles = args.includes('--all')
  ? Array.from(
      { length: captureCount },
      (_, index) => resolve(output, `CameraRender${index + 1}.png`),
    )
  : [resolve(output, `CameraRender${cameraNumber}.png`)];
const captureStartedAt = Date.now();
const captureMap = optionValue('--map', REFERENCE_MAP);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function ensurePngSrgb(path) {
  const bytes = readFileSync(path);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'sRGB') return;
    if (type === 'IHDR') {
      const end = offset + 12 + length;
      const srgb = pngChunk('sRGB', Buffer.from([0]));
      writeFileSync(path, Buffer.concat([bytes.subarray(0, end), srgb, bytes.subarray(end)]));
      return;
    }
    offset += 12 + length;
  }
  throw new Error(`${path} is not a complete PNG`);
}

const result = spawnSync(editor, [
  project,
  captureMap,
  `-ExecutePythonScript=${resolve(SCRIPT_DIR, 'unreal', 'capture-environment-demo-reference.py')}`,
  '-unattended',
  '-nop4',
  '-nosplash',
  '-nosound',
  '-RenderOffscreen',
], {
  env: {
    ...process.env,
    TOONLAB_DEMO_CAPTURE_ALL: args.includes('--all') ? '1' : '0',
    TOONLAB_DEMO_APPLY_SNOWPINES_COMPATIBILITY:
      optionValue('--snowpines-compatibility', '1'),
    TOONLAB_DEMO_CAPTURE_CAMERA: optionValue('--camera', '1'),
    TOONLAB_DEMO_CAPTURE_HEIGHT: optionValue('--height', '1080'),
    TOONLAB_DEMO_CAPTURE_WARMUP_FRAMES: optionValue('--warmup-frames', '180'),
    TOONLAB_DEMO_CAPTURE_OUTPUT: output,
    TOONLAB_DEMO_CAPTURE_WIDTH: optionValue('--width', '1920'),
    TOONLAB_DEMO_EXPOSURE_ADD: optionValue('--exposure-add', '0'),
    TOONLAB_DEMO_FOG_DENSITY_MULTIPLIER: optionValue('--fog-multiplier', '1'),
    TOONLAB_DEMO_MAP: captureMap,
    TOONLAB_DEMO_P19_FAMILY_ISOLATION:
      optionValue('--p19-family-isolation', '0'),
    // The source map stores its authored captured-scene cubemap with realtime
    // capture disabled. Preserve that bake by default; recapture remains an
    // explicit diagnostic option for renderer/platform comparisons.
    TOONLAB_DEMO_RECAPTURE_SKYLIGHT: optionValue('--recapture-skylight', '0'),
    TOONLAB_DEMO_SKYLIGHT_MULTIPLIER: optionValue('--skylight-multiplier', '1'),
    TOONLAB_DEMO_SKY_LAYER_MODE: optionValue('--sky-layer-mode', 'both'),
    TOONLAB_DEMO_SHADOW_MODE: optionValue('--shadow-mode', 'source'),
    TOONLAB_DEMO_SUNLIGHT_MULTIPLIER: optionValue('--sunlight-multiplier', '1'),
    TOONLAB_DEMO_VIEW_MODE: optionValue('--view-mode', 'lit'),
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
const capturedFreshFiles = expectedFiles.every((path) =>
  existsSync(path) && statSync(path).mtimeMs >= captureStartedAt - 1000);
if (capturedFreshFiles) expectedFiles.forEach(ensurePngSrgb);
if ((result.status ?? 1) !== 0 && capturedFreshFiles) {
  // UE 5.8 on macOS can fault while finalizing its embedded Python runtime
  // after QUIT_EDITOR. The viewport screenshot has already completed and was
  // atomically written; treat that verified artifact as capture success.
  console.warn('Unreal exited non-zero after writing every requested native reference frame.');
  process.exit(0);
}
process.exit(result.status ?? 1);
