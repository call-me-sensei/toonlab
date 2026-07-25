#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  encodeLinearGrayscalePng,
  encodeLinearRgbaPng,
  maskStatistics,
  sha256,
} from './landscape-weight-export-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_ENGINE = '/Users/Shared/Epic Games/UE_5.8/Engine';
const DEFAULT_PROJECT = resolve(ROOT_DIR, '..', 'StylizedExploration', 'StylizedExploration.uproject');
const DEFAULT_MAP = '/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines';
const DEFAULT_OUTPUT = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'landscape-weight-layers',
  'SnowPines',
);
const PLUGIN_NAME = 'ToonLabLandscapeWeightExporter';
const PLUGIN_SOURCE = resolve(SCRIPT_DIR, 'unreal', 'ue58-landscape-weight-exporter');

const args = process.argv.slice(2);
const optionValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const engine = resolve(optionValue('--engine', process.env.TOONLAB_UNREAL_ENGINE || DEFAULT_ENGINE));
const editor = resolve(optionValue(
  '--editor',
  process.env.TOONLAB_UNREAL_EDITOR
    || resolve(engine, 'Binaries', 'Mac', 'UnrealEditor.app', 'Contents', 'MacOS', 'UnrealEditor'),
));
const project = resolve(optionValue('--project', process.env.TOONLAB_STYLIZED_PROJECT || DEFAULT_PROJECT));
const map = optionValue('--map', process.env.TOONLAB_LANDSCAPE_WEIGHT_MAP || DEFAULT_MAP);
const output = resolve(optionValue('--output', process.env.TOONLAB_LANDSCAPE_WEIGHT_OUTPUT || DEFAULT_OUTPUT));
const sourceOutput = resolve(output, '_source');
const layoutPath = resolve(sourceOutput, 'layout.json');
const assembleOnly = args.includes('--assemble-only');

function listFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

function pluginSourceHash() {
  const hash = createHash('sha256');
  for (const path of listFiles(PLUGIN_SOURCE)) {
    hash.update(relative(PLUGIN_SOURCE, path));
    hash.update(readFileSync(path));
  }
  return hash.digest('hex').slice(0, 16);
}

function pruneGeneratedFiles(directory, expectedNames, extension) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isFile()
      && entry.name.endsWith(extension)
      && !expectedNames.has(entry.name)
    ) {
      unlinkSync(resolve(directory, entry.name));
    }
  }
}

function run(command, commandArgs, label, options = {}) {
  console.log(label);
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!assembleOnly) {
  const runUat = resolve(engine, 'Build', 'BatchFiles', 'RunUAT.sh');
  const sourcePlugin = resolve(PLUGIN_SOURCE, `${PLUGIN_NAME}.uplugin`);
  for (const [label, path] of [
    ['Unreal Editor', editor],
    ['Unreal project', project],
    ['RunUAT', runUat],
    ['Landscape exporter plugin', sourcePlugin],
  ]) {
    if (!existsSync(path)) throw new Error(`${label} was not found at ${path}`);
  }

  const pluginBuild = resolve(output, '_tool', pluginSourceHash());
  const packagedPlugin = resolve(pluginBuild, `${PLUGIN_NAME}.uplugin`);
  if (!existsSync(packagedPlugin)) {
    mkdirSync(dirname(pluginBuild), { recursive: true });
    run(runUat, [
      'BuildPlugin',
      `-Plugin=${sourcePlugin}`,
      `-Package=${pluginBuild}`,
      '-TargetPlatforms=Mac',
      '-Rocket',
    ], `Building the external UE 5.8 Landscape exporter bridge (${basename(pluginBuild)})`);
  }

  mkdirSync(sourceOutput, { recursive: true });
  run(editor, [
    project,
    `-PLUGIN=${packagedPlugin}`,
    `-EnablePlugins=${PLUGIN_NAME}`,
    '-run=pythonscript',
    `-script=${resolve(SCRIPT_DIR, 'unreal', 'export-landscape-weight-layers.py')}`,
    '-unattended',
    '-nop4',
    '-nosplash',
    '-nosound',
    '-nullrhi',
  ], `Exporting final merged Landscape weights from ${map}`, {
    env: {
      ...process.env,
      TOONLAB_LANDSCAPE_WEIGHT_MAP: map,
      TOONLAB_LANDSCAPE_WEIGHT_SOURCE_OUTPUT: sourceOutput,
    },
  });
}

if (!existsSync(layoutPath)) {
  throw new Error(`Landscape source layout was not found at ${layoutPath}`);
}
const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
if (layout.schema !== 'toonlab.ue58-landscape-weight-export' || layout.version !== 1) {
  throw new Error(`Unsupported Landscape layout ${layout.schema}@${layout.version}`);
}
if (layout.extent.width !== 505 || layout.extent.height !== 505) {
  throw new Error(`SnowPines Landscape must be 505x505, found ${layout.extent.width}x${layout.extent.height}`);
}
if (layout.layers.length !== 10) {
  throw new Error(`SnowPines material contract must expose ten layer masks, found ${layout.layers.length}`);
}

mkdirSync(resolve(output, 'masks'), { recursive: true });
const sampleCount = layout.extent.width * layout.extent.height;
const layerRecords = [];
const layerPixels = new Map();
for (let index = 0; index < layout.layers.length; index += 1) {
  const sourceLayer = layout.layers[index];
  const rawPath = resolve(sourceOutput, sourceLayer.rawFile);
  if (!existsSync(rawPath)) throw new Error(`Missing UE .r8 export ${rawPath}`);
  const pixels = readFileSync(rawPath);
  if (pixels.length !== sampleCount) {
    throw new Error(`${sourceLayer.name} has ${pixels.length} samples; expected ${sampleCount}`);
  }
  const filename = `${String(index + 1).padStart(2, '0')}-${sourceLayer.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.png`;
  const relativeFile = `masks/${filename}`;
  const png = encodeLinearGrayscalePng(layout.extent.width, layout.extent.height, pixels);
  writeFileSync(resolve(output, relativeFile), png);
  layerPixels.set(sourceLayer.name, pixels);
  layerRecords.push({
    ...sourceLayer,
    rawFile: `_source/${sourceLayer.rawFile}`,
    rawSha256: sha256(pixels),
    file: relativeFile,
    pixelSha256: sha256(pixels),
    fileSha256: sha256(png),
    byteLength: png.length,
    statistics: maskStatistics(pixels),
  });
}
pruneGeneratedFiles(
  resolve(sourceOutput, 'raw'),
  new Set(layout.layers.map((layer) => basename(layer.rawFile))),
  '.r8',
);
pruneGeneratedFiles(
  resolve(output, 'masks'),
  new Set(layerRecords.map((layer) => basename(layer.file))),
  '.png',
);

const runtimePackLayout = [
  ['Grass', 'Dirt', 'Sand', 'Rock'],
  ['SnowGrass', 'Snow', 'SnowGrassBlue', 'DesertSand'],
  ['DesertGrass', 'DesertDirt', null, null],
];
const channelNames = ['r', 'g', 'b', 'a'];
mkdirSync(resolve(output, 'packed'), { recursive: true });
const runtimePacks = runtimePackLayout.map((layerNames, packIndex) => {
  const pixels = Buffer.alloc(sampleCount * 4, 0);
  for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
    const layerName = layerNames[channelIndex];
    if (!layerName) continue;
    const source = layerPixels.get(layerName);
    if (!source) throw new Error(`Runtime pack references missing layer ${layerName}`);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      pixels[sampleIndex * 4 + channelIndex] = source[sampleIndex];
    }
  }
  const filename = `${String(packIndex + 1).padStart(2, '0')}-LandscapeWeights.png`;
  const relativeFile = `packed/${filename}`;
  const png = encodeLinearRgbaPng(layout.extent.width, layout.extent.height, pixels);
  writeFileSync(resolve(output, relativeFile), png);
  return {
    file: relativeFile,
    fileSha256: sha256(png),
    pixelSha256: sha256(pixels),
    byteLength: png.length,
    channels: Object.fromEntries(channelNames.map((channel, channelIndex) => [
      channel,
      layerNames[channelIndex],
    ])),
  };
});
pruneGeneratedFiles(
  resolve(output, 'packed'),
  new Set(runtimePacks.map((pack) => basename(pack.file))),
  '.png',
);

const manifest = {
  schema: 'toonlab.sostylized-landscape-weight-layers',
  version: 1,
  generatedAt: new Date().toISOString(),
  engineVersion: layout.engineVersion,
  sourceMap: map,
  landscape: layout.landscape,
  extent: layout.extent,
  counts: layout.counts,
  encoding: {
    format: 'PNG',
    bitDepth: 8,
    colorType: 'grayscale',
    colorSpace: 'linear scalar data (no gAMA or sRGB chunk)',
    range: [0, 255],
    rowOrder: 'row 0 is Landscape minY; columns increase from minX',
    sampleMeaning:
      'final merged painted layer weight; an unallocated material-graph input is exactly zero',
  },
  runtimePacking: {
    format: 'PNG',
    bitDepth: 8,
    colorType: 'RGBA',
    colorSpace: 'linear scalar data (no gAMA or sRGB chunk)',
    packCount: runtimePacks.length,
    purpose: 'lossless sampler-count reduction; each channel is one authored R8 mask',
  },
  provenance: {
    deprecatedRenderTargetApiUsed: false,
    engineAuthority:
      'UE 5.8 LandscapeEdit.cpp ULandscapeInfo::ExportLayer/FLandscapeEditDataInterface::GetWeightDataFast',
    method: layout.sourceReadMethod,
    bridge:
      'external editor-only plugin; source project and licensed assets remain unmodified',
    rawLayout: '_source/layout.json',
  },
  layers: layerRecords,
  runtimePacks,
  packedTextures: layout.packedTextures,
  components: layout.components,
};

const manifestPath = resolve(output, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Exported ${manifest.layers.length} exact linear ${manifest.extent.width}x${manifest.extent.height} masks to ${relative(ROOT_DIR, output)}`,
);
