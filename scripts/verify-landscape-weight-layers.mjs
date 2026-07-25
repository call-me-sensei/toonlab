#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodePng,
  maskStatistics,
  sha256,
} from './landscape-weight-export-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const args = process.argv.slice(2);
const optionValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const output = resolve(optionValue(
  '--output',
  process.env.TOONLAB_LANDSCAPE_WEIGHT_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'landscape-weight-layers', 'SnowPines'),
));
const manifestPath = resolve(output, 'manifest.json');
const EXPECTED_LAYERS = [
  'Grass',
  'Dirt',
  'Sand',
  'Rock',
  'SnowGrass',
  'Snow',
  'SnowGrassBlue',
  'DesertSand',
  'DesertGrass',
  'DesertDirt',
];
const UNALLOCATED_LAYERS = new Set(['DesertSand', 'DesertGrass', 'DesertDirt']);
const EXPECTED_RUNTIME_PACKS = [
  { r: 'Grass', g: 'Dirt', b: 'Sand', a: 'Rock' },
  { r: 'SnowGrass', g: 'Snow', b: 'SnowGrassBlue', a: 'DesertSand' },
  { r: 'DesertGrass', g: 'DesertDirt', b: null, a: null },
];

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

invariant(existsSync(manifestPath), `Missing Landscape weight manifest: ${manifestPath}`);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
invariant(
  manifest.schema === 'toonlab.sostylized-landscape-weight-layers' && manifest.version === 1,
  `Unsupported manifest ${manifest.schema}@${manifest.version}`,
);
invariant(
  manifest.sourceMap === '/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines',
  'Landscape weights must come from the authored SnowPines map',
);
invariant(manifest.extent.width === 505 && manifest.extent.height === 505, 'Masks must be 505x505');
invariant(manifest.layers.length === 10, 'SnowPines must contain exactly ten material layer masks');
invariant(
  JSON.stringify(manifest.layers.map((layer) => layer.name)) === JSON.stringify(EXPECTED_LAYERS),
  'Landscape material layer order/names differ from the audited ten-layer contract',
);
invariant(manifest.counts.paintedLayers === 7, 'Source-allocated painted-layer count is inconsistent');
invariant(manifest.counts.exportedLayers === 10, 'Exported-layer count is inconsistent');
invariant(manifest.counts.materialGraphLayers === 10, 'Material-graph layer count is inconsistent');
invariant(manifest.encoding.bitDepth === 8, 'Landscape weights must remain 8-bit');
invariant(
  manifest.provenance.deprecatedRenderTargetApiUsed === false,
  'The UE 5.8 deprecated render-target export must not be used',
);

const layerNames = new Set();
const layerFiles = new Set();
const layerPixelsByName = new Map();
for (const layer of manifest.layers) {
  invariant(!layerNames.has(layer.name), `Duplicate layer name ${layer.name}`);
  invariant(!layerFiles.has(layer.file), `Duplicate layer file ${layer.file}`);
  layerNames.add(layer.name);
  layerFiles.add(layer.file);
  const filePath = resolve(output, layer.file);
  invariant(existsSync(filePath), `Missing mask ${filePath}`);
  const file = readFileSync(filePath);
  invariant(sha256(file) === layer.fileSha256, `${layer.name} file checksum changed`);
  invariant(file.length === layer.byteLength, `${layer.name} byte length changed`);
  const image = decodePng(file);
  invariant(image.width === 505 && image.height === 505, `${layer.name} is not 505x505`);
  invariant(image.bitDepth === 8 && image.colorType === 0, `${layer.name} is not grayscale8`);
  invariant(!image.chunkTypes.includes('gAMA'), `${layer.name} contains a display gamma chunk`);
  invariant(!image.chunkTypes.includes('sRGB'), `${layer.name} contains an sRGB chunk`);
  invariant(sha256(image.pixels) === layer.pixelSha256, `${layer.name} pixel checksum changed`);
  invariant(
    JSON.stringify(maskStatistics(image.pixels)) === JSON.stringify(layer.statistics),
    `${layer.name} statistics changed`,
  );
  if (UNALLOCATED_LAYERS.has(layer.name)) {
    invariant(layer.sourceAllocated === false, `${layer.name} should be marked unallocated`);
    invariant(layer.allocations === 0, `${layer.name} unexpectedly has component allocations`);
    invariant(
      layer.statistics.min === 0
        && layer.statistics.max === 0
        && layer.statistics.nonZeroSamples === 0,
      `${layer.name} must be UE's exact zero result for an unallocated graph input`,
    );
  } else {
    invariant(layer.sourceAllocated === true, `${layer.name} should be marked source-allocated`);
    invariant(layer.statistics.max > 0, `${layer.name} is unexpectedly empty`);
    invariant(layer.allocations > 0, `${layer.name} has no component allocations`);
  }
  const rawPath = resolve(output, layer.rawFile);
  invariant(existsSync(rawPath), `Missing UE .r8 source ${rawPath}`);
  const raw = readFileSync(rawPath);
  invariant(raw.length === 505 * 505, `${layer.name} .r8 source is not 505x505`);
  invariant(sha256(raw) === layer.rawSha256, `${layer.name} UE .r8 checksum changed`);
  invariant(raw.equals(image.pixels), `${layer.name} PNG is not byte-exact to UE .r8`);
  layerPixelsByName.set(layer.name, raw);
}

invariant(manifest.runtimePacking?.packCount === 3, 'Runtime weights must use three packs');
invariant(
  manifest.runtimePacking?.bitDepth === 8
    && manifest.runtimePacking?.colorType === 'RGBA'
    && String(manifest.runtimePacking?.colorSpace).startsWith('linear scalar data'),
  'Runtime packs must be linear RGBA8 data',
);
invariant(manifest.runtimePacks?.length === 3, 'Runtime pack manifest must contain three files');
const channelNames = ['r', 'g', 'b', 'a'];
for (let packIndex = 0; packIndex < EXPECTED_RUNTIME_PACKS.length; packIndex += 1) {
  const pack = manifest.runtimePacks[packIndex];
  const expectedChannels = EXPECTED_RUNTIME_PACKS[packIndex];
  invariant(
    JSON.stringify(pack.channels) === JSON.stringify(expectedChannels),
    `Runtime pack ${packIndex + 1} channel mapping changed`,
  );
  const filePath = resolve(output, pack.file);
  invariant(existsSync(filePath), `Missing runtime pack ${filePath}`);
  const file = readFileSync(filePath);
  invariant(file.length === pack.byteLength, `Runtime pack ${packIndex + 1} length changed`);
  invariant(sha256(file) === pack.fileSha256, `Runtime pack ${packIndex + 1} checksum changed`);
  const image = decodePng(file);
  invariant(image.width === 505 && image.height === 505, `Runtime pack ${packIndex + 1} size changed`);
  invariant(image.bitDepth === 8 && image.colorType === 6, `Runtime pack ${packIndex + 1} is not RGBA8`);
  invariant(!image.chunkTypes.includes('gAMA'), `Runtime pack ${packIndex + 1} contains gAMA`);
  invariant(!image.chunkTypes.includes('sRGB'), `Runtime pack ${packIndex + 1} contains sRGB`);
  invariant(sha256(image.pixels) === pack.pixelSha256, `Runtime pack ${packIndex + 1} pixels changed`);
  for (let channelIndex = 0; channelIndex < channelNames.length; channelIndex += 1) {
    const channel = channelNames[channelIndex];
    const unpacked = Buffer.alloc(505 * 505);
    for (let sampleIndex = 0; sampleIndex < unpacked.length; sampleIndex += 1) {
      unpacked[sampleIndex] = image.pixels[sampleIndex * 4 + channelIndex];
    }
    const layerName = expectedChannels[channel];
    invariant(
      layerName ? unpacked.equals(layerPixelsByName.get(layerName)) : unpacked.every((value) => value === 0),
      `Runtime pack ${packIndex + 1}.${channel} is not byte-exact ${layerName ?? 'zero'}`,
    );
  }
}

const mappedAllocations = manifest.components.flatMap((component) => component.allocations);
for (const layer of manifest.layers) {
  const allocations = mappedAllocations.filter((allocation) => allocation.layer === layer.name);
  invariant(
    allocations.length === layer.allocations,
    `${layer.name} component-allocation mapping is incomplete`,
  );
}
invariant(
  manifest.packedTextures.every((texture) => texture.width > 0 && texture.height > 0),
  'Packed source-texture mapping has invalid dimensions',
);
const exactFiles = (directory, extension) => readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
  .map((entry) => entry.name)
  .sort();
invariant(
  JSON.stringify(exactFiles(resolve(output, '_source', 'raw'), '.r8'))
    === JSON.stringify(manifest.layers.map((layer) => layer.rawFile.split('/').at(-1)).sort()),
  'Raw output directory contains stale or missing .r8 files',
);
invariant(
  JSON.stringify(exactFiles(resolve(output, 'masks'), '.png'))
    === JSON.stringify(manifest.layers.map((layer) => layer.file.split('/').at(-1)).sort()),
  'Mask output directory contains stale or missing PNG files',
);
invariant(
  JSON.stringify(exactFiles(resolve(output, 'packed'), '.png'))
    === JSON.stringify(manifest.runtimePacks.map((pack) => pack.file.split('/').at(-1)).sort()),
  'Runtime pack directory contains stale or missing PNG files',
);

console.log(
  `Landscape weight verification passed: ${manifest.layers.length} graph layers (${manifest.counts.paintedLayers} source-allocated), ${manifest.runtimePacks.length} byte-exact runtime RGBA packs, ${manifest.extent.width}x${manifest.extent.height}, ${manifest.components.length} components, ${manifest.packedTextures.length} packed source textures.`,
);
