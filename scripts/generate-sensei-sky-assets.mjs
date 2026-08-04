#!/usr/bin/env node
// Bakes the Call Me Sensei sky-dome + cloud variation from its parameter
// document (labs/sensei-sky-lab/params.js) into assets-local/generated/
// sensei-sky. Fully procedural and deterministic: same params + seed → the
// same bytes, so the binaries stay out of git and regenerate on demand.
//
// Outputs (contract-compatible with labs/shared/p18/referenceSky.js):
//   sky-dome.glb        inward-facing unit sphere, v=1 at zenith
//   cloud-shell.glb     squashed dome band, v=0 at rim
//   sky-atlas.exr       one gradient row per scenario (linear float RGB)
//   cloud-atlas.exr     one cel shading ramp row per scenario
//   cloud-shell.png     r = shading curve index (sRGB-encoded), a = mask
//   background-clouds.png  r = distant streak mask (sRGB-encoded)
//   contract.json       preview contract consumed by the sensei-sky-lab
//   params-snapshot.json exact params used for this bake

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
  SENSEI_SKY_ASSET_ROOT,
  SENSEI_SKY_PARAMS,
} from '../labs/sensei-sky-lab/params.js';

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../assets-local/generated/sensei-sky',
);

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Color + math helpers
// ---------------------------------------------------------------------------

function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(c) {
  const clamped = Math.min(Math.max(c, 0), 1);
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function hexToLinear(hex) {
  const value = hex.replace('#', '');
  return [0, 1, 2].map((i) =>
    srgbChannelToLinear(parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255));
}

function srgbEncodedByte(linearValue) {
  return Math.round(linearChannelToSrgb(linearValue) * 255);
}

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (lo, hi, v) => {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const smin = (a, b, k) => {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);

function latticeHash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth5 = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Value noise on a lattice that wraps horizontally after periodX units, so
// every octave tiles around the dome seam regardless of cell size.
function periodicValueNoise(x, y, cell, periodX, seed) {
  const columns = Math.max(1, Math.round(periodX / cell));
  const columnWidth = periodX / columns;
  const gx = ((x / columnWidth) % columns + columns) % columns;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth5(gx - x0);
  const fy = smooth5(gy - y0);
  const x1 = (x0 + 1) % columns;
  const n00 = latticeHash(x0, y0, seed);
  const n10 = latticeHash(x1, y0, seed);
  const n01 = latticeHash(x0, y0 + 1, seed);
  const n11 = latticeHash(x1, y0 + 1, seed);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

// Centered fbm; cells list the octave sizes coarse → fine. Averaging value
// noise concentrates the raw distribution tightly around 0, so the result is
// variance-normalized: typical output reaches roughly ±0.5 (occasionally
// beyond), letting amplitude parameters mean what they say.
function periodicFbm(x, y, cells, periodX, seed) {
  let sum = 0;
  let ampSum = 0;
  let amp = 1;
  for (let i = 0; i < cells.length; i += 1) {
    sum += amp * periodicValueNoise(x, y, cells[i], periodX, seed + i * 101);
    ampSum += amp;
    amp *= 0.72;
  }
  return (sum / ampSum - 0.5) * 2.8;
}

function gradientAt(linearStops, t) {
  if (t <= linearStops[0].t) return linearStops[0].rgb;
  const last = linearStops[linearStops.length - 1];
  if (t >= last.t) return last.rgb;
  for (let i = 0; i < linearStops.length - 1; i += 1) {
    const a = linearStops[i];
    const b = linearStops[i + 1];
    if (t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return [0, 1, 2].map((c) => lerp(a.rgb[c], b.rgb[c], f));
    }
  }
  return last.rgb;
}

function prepareStops(stops) {
  return stops.map((stop) => ({ rgb: hexToLinear(stop.color), t: stop.t }));
}

// Cel ramp: colors snap to band centers with a short smooth transition at
// each boundary, so the baked ramp itself carries the stepped anime shading.
function celRampAt(linearStops, bands, hardness, t) {
  if (!bands) return gradientAt(linearStops, clamp01(t));
  const soft = Math.max((1 - hardness) / 2, 0.001);
  const center = (band) => (band + 0.5) / bands;
  const scaled = clamp01(t) * bands;
  const band = Math.min(Math.floor(scaled), bands - 1);
  const frac = scaled - band;
  let samplePosition = center(band);
  if (frac < soft && band > 0) {
    samplePosition = lerp(
      center(band - 1),
      center(band),
      smoothstep(-soft, soft, frac),
    );
  } else if (frac > 1 - soft && band < bands - 1) {
    samplePosition = lerp(
      center(band),
      center(band + 1),
      smoothstep(1 - soft, 1 + soft, frac),
    );
  }
  return gradientAt(linearStops, samplePosition);
}

// ---------------------------------------------------------------------------
// PNG writer (8-bit RGBA, filter 0)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function writePng(path, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const file = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, file);
  return file.length;
}

// ---------------------------------------------------------------------------
// EXR writer (uncompressed, 32-bit float, channels B/G/R)
// ---------------------------------------------------------------------------

function exrAttribute(name, type, payload) {
  return Buffer.concat([
    Buffer.from(`${name}\0${type}\0`, 'ascii'),
    (() => {
      const size = Buffer.alloc(4);
      size.writeInt32LE(payload.length, 0);
      return size;
    })(),
    payload,
  ]);
}

function exrBox2i(xMin, yMin, xMax, yMax) {
  const box = Buffer.alloc(16);
  box.writeInt32LE(xMin, 0);
  box.writeInt32LE(yMin, 4);
  box.writeInt32LE(xMax, 8);
  box.writeInt32LE(yMax, 12);
  return box;
}

// rows: array of Float32Array(width * 3) in RGB order, row 0 = file top.
function writeExr(path, width, height, rows) {
  const channelNames = ['B', 'G', 'R']; // must be ascending
  const chlist = Buffer.alloc(channelNames.length * 18 + 1);
  let offset = 0;
  for (const name of channelNames) {
    chlist.write(`${name}\0`, offset, 'ascii');
    offset += 2;
    chlist.writeInt32LE(2, offset); // FLOAT
    offset += 4;
    offset += 4; // pLinear + reserved = 0
    chlist.writeInt32LE(1, offset); // xSampling
    offset += 4;
    chlist.writeInt32LE(1, offset); // ySampling
    offset += 4;
  }

  const floatOne = Buffer.alloc(4);
  floatOne.writeFloatLE(1, 0);
  const header = Buffer.concat([
    exrAttribute('channels', 'chlist', chlist),
    exrAttribute('compression', 'compression', Buffer.from([0])),
    exrAttribute('dataWindow', 'box2i', exrBox2i(0, 0, width - 1, height - 1)),
    exrAttribute('displayWindow', 'box2i', exrBox2i(0, 0, width - 1, height - 1)),
    exrAttribute('lineOrder', 'lineOrder', Buffer.from([0])),
    exrAttribute('pixelAspectRatio', 'float', floatOne),
    exrAttribute('screenWindowCenter', 'v2f', Buffer.alloc(8)),
    exrAttribute('screenWindowWidth', 'float', floatOne),
    Buffer.from([0]),
  ]);

  const preamble = Buffer.alloc(8);
  preamble.writeUInt32LE(0x01312F76, 0); // magic
  preamble.writeInt32LE(2, 4); // version

  const tableStart = preamble.length + header.length;
  const table = Buffer.alloc(height * 8);
  const blockSize = 8 + width * 3 * 4;
  const blocks = Buffer.alloc(height * blockSize);
  for (let y = 0; y < height; y += 1) {
    const blockOffset = tableStart + table.length + y * blockSize;
    table.writeBigUInt64LE(BigInt(blockOffset), y * 8);
    let cursor = y * blockSize;
    blocks.writeInt32LE(y, cursor);
    blocks.writeInt32LE(width * 3 * 4, cursor + 4);
    cursor += 8;
    const row = rows[y];
    for (const channel of [2, 1, 0]) { // file order B, G, R
      for (let x = 0; x < width; x += 1) {
        blocks.writeFloatLE(row[x * 3 + channel], cursor);
        cursor += 4;
      }
    }
  }
  const file = Buffer.concat([preamble, header, table, blocks]);
  writeFileSync(path, file);
  return file.length;
}

// ---------------------------------------------------------------------------
// GLB writer
// ---------------------------------------------------------------------------

function alignTo(buffer, alignment, fill) {
  const remainder = buffer.length % alignment;
  if (!remainder) return buffer;
  return Buffer.concat([
    buffer,
    Buffer.alloc(alignment - remainder, fill),
  ]);
}

function writeGlb(path, meshName, geometry) {
  const { indices, normals, positions, uvs } = geometry;
  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const uvBytes = Buffer.from(new Float32Array(uvs).buffer);
  const indexBytes = Buffer.from(new Uint32Array(indices).buffer);

  const views = [];
  const chunks = [];
  let byteOffset = 0;
  for (const bytes of [positionBytes, normalBytes, uvBytes, indexBytes]) {
    views.push({ buffer: 0, byteLength: bytes.length, byteOffset });
    chunks.push(bytes);
    byteOffset += bytes.length;
  }
  const bin = Buffer.concat(chunks);

  const bounds = { max: [-Infinity, -Infinity, -Infinity], min: [Infinity, Infinity, Infinity] };
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      bounds.min[c] = Math.min(bounds.min[c], positions[i + c]);
      bounds.max[c] = Math.max(bounds.max[c], positions[i + c]);
    }
  }

  const json = {
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        max: bounds.max,
        min: bounds.min,
        type: 'VEC3',
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    asset: { generator: 'toonlab sensei-sky generator', version: '2.0' },
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
    meshes: [{
      name: meshName,
      primitives: [{
        attributes: { NORMAL: 1, POSITION: 0, TEXCOORD_0: 2 },
        indices: 3,
        mode: 4,
      }],
    }],
    nodes: [{ mesh: 0, name: meshName }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };

  const jsonChunk = alignTo(Buffer.from(JSON.stringify(json), 'utf8'), 4, 0x20);
  const binChunk = alignTo(bin, 4, 0);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const file = Buffer.alloc(total);
  let cursor = 0;
  file.writeUInt32LE(0x46546C67, cursor); cursor += 4; // 'glTF'
  file.writeUInt32LE(2, cursor); cursor += 4;
  file.writeUInt32LE(total, cursor); cursor += 4;
  file.writeUInt32LE(jsonChunk.length, cursor); cursor += 4;
  file.writeUInt32LE(0x4E4F534A, cursor); cursor += 4; // 'JSON'
  jsonChunk.copy(file, cursor); cursor += jsonChunk.length;
  file.writeUInt32LE(binChunk.length, cursor); cursor += 4;
  file.writeUInt32LE(0x004E4942, cursor); cursor += 4; // 'BIN'
  binChunk.copy(file, cursor);
  writeFileSync(path, file);
  return file.length;
}

// Inward-facing spherical band. v runs 0 at elevationStart → 1 at
// elevationEnd; u wraps the azimuth with a duplicated seam column.
function buildDomeGeometry({
  elevationEndDeg,
  elevationStartDeg,
  segments,
  verticalScale = 1,
}) {
  const [widthSegments, heightSegments] = segments;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const startRad = (elevationStartDeg * Math.PI) / 180;
  const endRad = (elevationEndDeg * Math.PI) / 180;
  for (let iy = 0; iy <= heightSegments; iy += 1) {
    const v = iy / heightSegments;
    const elevation = lerp(startRad, endRad, v);
    const y = Math.sin(elevation) * verticalScale;
    const ring = Math.cos(elevation);
    for (let ix = 0; ix <= widthSegments; ix += 1) {
      const azimuth = (ix / widthSegments) * Math.PI * 2;
      const x = Math.cos(azimuth) * ring;
      const z = Math.sin(azimuth) * ring;
      positions.push(x, y, z);
      const length = Math.hypot(x, y, z) || 1;
      normals.push(-x / length, -y / length, -z / length);
      uvs.push(ix / widthSegments, v);
    }
  }
  const stride = widthSegments + 1;
  for (let iy = 0; iy < heightSegments; iy += 1) {
    for (let ix = 0; ix < widthSegments; ix += 1) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, b, c, a, c, d);
    }
  }
  // Faces must point INWARD (the preview material is FrontSide and the
  // camera sits inside the dome). Probe one mid-sphere triangle and flip
  // the winding if its face normal points away from the center.
  const probe = indices.length / 2 - (indices.length / 2) % 3;
  const point = (index) => positions.slice(indices[index] * 3, indices[index] * 3 + 3);
  const [pa, pb, pc] = [point(probe), point(probe + 1), point(probe + 2)];
  const ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
  const ac = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
  const face = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  if (face[0] * pa[0] + face[1] * pa[1] + face[2] * pa[2] > 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
  }
  return { indices, normals, positions, uvs };
}
// ---------------------------------------------------------------------------
// Cloud shell painter — density field with light marching
//
// Learned from the licensed reference layer (statistics only, no pixels):
// its clouds are not unions of round lobes. Shape and shading come from one
// continuous fractal field — silhouette detail and interior shadow detail
// correspond exactly, at every scale, which is what reads as "painted".
//
// So each cloud is built as a scalar density field: a soft envelope from a
// few scaffold blobs, eroded by multi-octave BILLOW noise (|2n-1| inverted —
// the cauliflower basis). Alpha thresholds that field. Lighting marches the
// same field toward the sun and applies Beer's law to the accumulated mass,
// so every crumb the noise carves also lights and shadows itself.
// ---------------------------------------------------------------------------

// Billow noise: rounded lobes instead of smooth blobs — the cauliflower
// basis. Averaging octaves collapses the distribution toward its 0.5 mean,
// so the result is variance-normalized back to roughly the full [0,1] range.
function periodicBillowFbm(x, y, cells, periodX, seed, falloff) {
  let sum = 0;
  let ampSum = 0;
  let amp = 1;
  for (let i = 0; i < cells.length; i += 1) {
    const v = periodicValueNoise(x, y, cells[i], periodX, seed + i * 131);
    sum += amp * (1 - Math.abs(2 * v - 1));
    ampSum += amp;
    amp *= falloff;
  }
  return clamp01((sum / ampSum - 0.5) * 2.6 + 0.5);
}

// Envelope scaffolds. These only rough out the mass — the noise supplies all
// visible structure, so a handful of soft blobs is enough.
function scaffoldBank(rng, size, aspect) {
  const roots = [];
  const span = size * aspect;
  const count = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i += 1) {
    const fx = (i + 0.5) / count - 0.5;
    const profile = Math.cos(fx * Math.PI) ** 0.7;
    roots.push({
      radius: size * (0.5 + 0.55 * profile) * lerp(0.85, 1.15, rng()),
      x: fx * span,
      y: size * (0.45 + 0.4 * profile * rng()),
    });
  }
  return roots;
}

function scaffoldTower(rng, size, aspect) {
  const roots = [];
  const tiers = 3 + Math.floor(rng() * 2);
  let y = size * 0.45;
  for (let tier = 0; tier < tiers; tier += 1) {
    const shrink = 1 - tier * 0.17;
    const tierWidth = size * aspect * 0.95 * shrink;
    const radius = size * lerp(0.36, 0.48, rng()) * shrink;
    const count = Math.max(2, Math.round(tierWidth / (radius * 0.85)));
    for (let i = 0; i < count; i += 1) {
      const fx = count === 1 ? 0 : i / (count - 1) - 0.5;
      roots.push({
        radius,
        x: fx * tierWidth + (rng() - 0.5) * radius * 0.5,
        y: y + (rng() - 0.5) * radius * 0.3,
      });
    }
    y += radius * lerp(0.85, 1.05, rng());
  }
  return roots;
}

function scaffoldFragment(rng, size) {
  const roots = [];
  const count = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = size * lerp(0.6, 1.1, rng());
    roots.push({
      radius,
      x: (i - (count - 1) / 2) * radius * 1.2,
      y: radius * 0.7 + (rng() - 0.5) * radius * 0.3,
    });
  }
  return roots;
}

// Grow a blob hierarchy: children ride the outward arc of their parent,
// shrinking per level, so the merged silhouette carries rounded lobes at
// several scales instead of one smooth outline.
function growBlobs(rng, roots, growth) {
  const { childScale, children, maxDepth, spawnFalloff } = growth;
  const cx = roots.reduce((a, r) => a + r.x, 0) / roots.length;
  const cy = roots.reduce((a, r) => a + r.y, 0) / roots.length - roots[0].radius * 0.5;
  const all = [];
  const queue = roots.map((r) => ({ ...r, depth: 0 }));
  while (queue.length) {
    const blob = queue.shift();
    all.push(blob);
    if (blob.depth >= maxDepth) continue;
    const chance = spawnFalloff ** blob.depth;
    const count = Math.round(lerp(children[0], children[1], rng()));
    const outward = Math.atan2(blob.y - cy || 0.4, blob.x - cx || rng() - 0.5);
    for (let i = 0; i < count; i += 1) {
      if (rng() > chance) continue;
      const angle = outward + (rng() - 0.5) * 2.4;
      const radius = blob.radius * lerp(childScale[0], childScale[1], rng());
      const reach = blob.radius * lerp(0.55, 0.85, rng());
      const y = blob.y + Math.sin(angle) * reach * 0.9;
      if (y - radius * 0.5 < 0) continue;
      queue.push({
        depth: blob.depth + 1,
        radius,
        x: blob.x + Math.cos(angle) * reach,
        y,
      });
    }
  }
  return all;
}

function buildCloud(rng, archetype, config, width, height, anisotropy, slot) {
  const size = lerp(config.size[0], config.size[1], rng()) * height;
  const aspect = config.aspect ? lerp(config.aspect[0], config.aspect[1], rng()) : 1;
  const centerX = slot
    ? ((slot.index + 0.15 + 0.7 * rng()) / slot.count) * width
    : rng() * width;
  const baseY = lerp(config.elevationBand[0], config.elevationBand[1], rng()) * height;
  let roots;
  if (archetype === 'tower') roots = scaffoldTower(rng, size, aspect);
  else if (archetype === 'fragment') roots = scaffoldFragment(rng, size);
  else roots = scaffoldBank(rng, size, aspect);
  return {
    archetype,
    baseY,
    blobs: growBlobs(rng, roots, config.growth).map((blob) => ({
      radius: blob.radius,
      x: centerX + blob.x / anisotropy,
      y: baseY + blob.y,
    })),
    noiseOffset: rng() * 4096,
    size,
  };
}

function paintCloud(cloud, buffers, config, width, height, anisotropy, periodX) {
  const { field, lighting } = config;
  const { baseY, blobs, size } = cloud;

  // Bounding box in texture pixels, with margin for the noise-grown fringe
  // and for the light march to read mass above the top.
  const reach = field.envelopeReach;
  const margin = size * 0.4 + 8;
  const boxX0 = Math.floor(Math.min(
    ...blobs.map((b) => b.x - (b.radius * reach) / anisotropy),
  ) - margin / anisotropy);
  const boxX1 = Math.ceil(Math.max(
    ...blobs.map((b) => b.x + (b.radius * reach) / anisotropy),
  ) + margin / anisotropy);
  const boxY0 = Math.max(Math.floor(
    Math.min(...blobs.map((b) => b.y - b.radius * reach), baseY) - margin,
  ), 0);
  const boxY1 = Math.min(Math.ceil(
    Math.max(...blobs.map((b) => b.y + b.radius * reach)) + margin,
  ), height - 1);
  const boxW = boxX1 - boxX0 + 1;
  const boxH = boxY1 - boxY0 + 1;
  if (boxW <= 0 || boxH <= 0) return;

  // Octaves are fractions of this cloud's own size: the coarsest lobes are
  // cloud-scale, the finest reach a couple of pixels.
  const cells = field.cellFractions.map((f) => Math.max(f * size, 2));

  // Pass 1 — rasterize the density field once.
  const density = new Float32Array(boxW * boxH).fill(-1);
  for (let y = boxY0; y <= boxY1; y += 1) {
    for (let gx = boxX0; gx <= boxX1; gx += 1) {
      let envelope = 0;
      for (const blob of blobs) {
        const dx = (gx - blob.x) * anisotropy;
        const dy = y - blob.y;
        const q = (dx * dx + dy * dy) / (blob.radius * blob.radius * reach * reach);
        // Wyvill kernel: neighbouring blobs merge into one smooth mass while
        // an outlying blob still bulges the boundary into its own lobe.
        if (q < 1) envelope += (1 - q) ** 3;
      }
      if (envelope <= 0.0005) continue;
      // Flat base: the envelope is cut below the cloud's baseline and the
      // noise is calmed there, so bottoms stay level like real cumulus.
      const baseMask = cloud.archetype === 'fragment'
        ? 1
        : smoothstep(baseY - size * field.baseSoftness, baseY, y);
      if (baseMask <= 0) continue;
      const visualX = gx * anisotropy + cloud.noiseOffset;
      const billow = periodicBillowFbm(
        visualX,
        y + cloud.noiseOffset,
        cells,
        periodX,
        field.seed,
        field.octaveFalloff,
      );
      const swing = field.noiseAmplitude * lerp(field.baseNoiseCalm, 1, baseMask);
      const gain = lerp(1 - swing, 1 + swing, billow);
      density[(y - boxY0) * boxW + (gx - boxX0)] =
        Math.min(envelope, field.envelopeCap) * baseMask * gain - field.threshold;
    }
  }

  // Pass 2 — light transport. The light direction is the same for every
  // pixel, so instead of stochastically marching each one (which aliases into
  // bands, or into grain once jittered), integrate the density along the ray
  // exactly: accumulate row by row starting from the sun side. O(1) per
  // pixel, and the shadow detail matches the field detail perfectly.
  const dxPerRow = (lighting.direction[0] / lighting.direction[1]) / anisotropy;
  const rayPerRow = Math.hypot(dxPerRow * anisotropy, 1);
  // Two shadow scales, both exact: a short-range one that makes each lobe's
  // own relief read (crumb chiaroscuro), and a long-range one that carries
  // the whole cloud's form shadow. Real cumulus — and the reference — show
  // both at once; either alone looks flat.
  const near = new Float32Array(boxW * boxH);
  const far = new Float32Array(boxW * boxH);
  for (let by = boxH - 2; by >= 0; by -= 1) {
    const src = (by + 1) * boxW;
    const dst = by * boxW;
    for (let bx = 0; bx < boxW; bx += 1) {
      const fx = bx + dxPerRow;
      const ix = Math.floor(fx);
      if (ix < 0 || ix >= boxW - 1) continue;
      const t = fx - ix;
      const massAbove = lerp(
        clamp01(density[src + ix]),
        clamp01(density[src + ix + 1]),
        t,
      ) * rayPerRow;
      near[dst + bx] = lerp(near[src + ix], near[src + ix + 1], t)
        * lighting.nearDecay + massAbove;
      far[dst + bx] = lerp(far[src + ix], far[src + ix + 1], t)
        * lighting.farDecay + massAbove;
    }
  }

  const { alpha, shade } = buffers;
  const featherHalf = field.edgeSoftness;
  for (let y = boxY0; y <= boxY1; y += 1) {
    for (let gx = boxX0; gx <= boxX1; gx += 1) {
      const d = density[(y - boxY0) * boxW + (gx - boxX0)];
      if (d <= -featherHalf) continue;
      const localAlpha = smoothstep(-featherHalf, featherHalf, d);
      if (localAlpha <= 0.004) continue;

      // Optical depth = mass integrated along the light ray. Absorption is
      // per PIXEL of travel, not per sample, so the march length can cover a
      // whole cloud without every deep pixel pinning to maximum shadow.
      // Self-shadowing plus a thin-edge translucency term: wisps with little
      // mass in front of them stay luminous instead of going flat white.
      const localIndex = (y - boxY0) * boxW + (gx - boxX0);
      const direct = Math.exp(
        -(near[localIndex] * lighting.nearAbsorption
          + far[localIndex] * lighting.farAbsorption),
      );
      const thickness = clamp01(d / field.depthScale);
      const value = clamp01(
        lighting.ambient
        + lighting.direct * direct
        + lighting.heightLift * clamp01((y - baseY) / Math.max(size, 1))
        - lighting.depthDarken * thickness * (1 - direct),
      );
      void thickness;

      const x = ((gx % width) + width) % width;
      const globalIndex = y * width + x;
      const previous = alpha[globalIndex];
      const outAlpha = localAlpha + previous * (1 - localAlpha);
      shade[globalIndex] = outAlpha > 0.002
        ? (value * localAlpha + shade[globalIndex] * previous * (1 - localAlpha)) / outAlpha
        : value;
      alpha[globalIndex] = outAlpha;
    }
  }
}

function paintCloudShellTexture(rng, config, anisotropy) {
  const { height, width } = config;
  const periodX = width * anisotropy;
  const buffers = {
    alpha: new Float32Array(width * height),
    shade: new Float32Array(width * height),
  };
  const { archetypes } = config;
  const clouds = [];
  for (let i = 0; i < archetypes.banks.count; i += 1) {
    clouds.push(buildCloud(rng, 'bank', { ...archetypes.banks, growth: config.growth },
      width, height, anisotropy, { count: archetypes.banks.count, index: i }));
  }
  for (let i = 0; i < archetypes.towers.count; i += 1) {
    clouds.push(buildCloud(rng, 'tower', { ...archetypes.towers, growth: config.growth },
      width, height, anisotropy, { count: archetypes.towers.count, index: i }));
  }
  for (let i = 0; i < archetypes.fragments.count; i += 1) {
    clouds.push(buildCloud(rng, 'fragment',
      { ...archetypes.fragments, growth: { ...config.growth, maxDepth: 1 } },
      width, height, anisotropy, null));
  }
  for (const cloud of clouds) {
    paintCloud(cloud, buffers, config, width, height, anisotropy, periodX);
  }

  const { fades } = config;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const elevation = y / (height - 1);
    const zenithFade = 1 - smoothstep(fades.zenithStart, fades.zenithEnd, elevation);
    const floorFade = smoothstep(fades.floorEnd, fades.floorStart, elevation);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const out = index * 4;
      // Sampled as sRGB but read as a linear curve index — pre-encode.
      const encoded = srgbEncodedByte(buffers.shade[index]);
      rgba[out] = encoded;
      rgba[out + 1] = encoded;
      rgba[out + 2] = encoded;
      rgba[out + 3] = Math.round(
        clamp01(buffers.alpha[index] * zenithFade * floorFade) * 255,
      );
    }
  }
  return { height, rgba, width };
}

function paintBackgroundTexture(rng, config, anisotropy) {
  const { height, width } = config;
  const periodX = width * anisotropy;
  const field = new Float32Array(width * height);
  for (const band of config.bands) {
    for (let i = 0; i < band.blobs; i += 1) {
      const blobHeight = band.thickness * height * lerp(0.6, 1.3, rng());
      const blobWidth = (blobHeight * band.stretch * lerp(0.8, 1.3, rng()))
        / anisotropy;
      const centerX = rng() * width;
      const centerY = (band.elevation + (rng() - 0.5) * band.thickness) * height;
      const x0 = Math.floor(centerX - blobWidth - 2);
      const x1 = Math.ceil(centerX + blobWidth + 2);
      const y0 = Math.max(Math.floor(centerY - blobHeight - 2), 0);
      const y1 = Math.min(Math.ceil(centerY + blobHeight + 2), height - 1);
      for (let y = y0; y <= y1; y += 1) {
        for (let gx = x0; gx <= x1; gx += 1) {
          const x = ((gx % width) + width) % width;
          const dx = (gx - centerX) / blobWidth;
          const dy = (y - centerY) / blobHeight;
          const falloff = Math.max(0, 1 - (dx * dx + dy * dy)) ** 1.5;
          const value = falloff * band.intensity;
          const index = y * width + x;
          if (value > field[index]) field[index] = value;
        }
      }
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < field.length; index += 1) {
    const soft = config.edgeSoftness;
    const noiseCells = config.noise?.cellsPx ?? [128, 48];
    const noiseAmp = config.noise?.amplitude ?? 0;
    const px = index % width;
    const py = Math.floor(index / width);
    const wispy = field[index] + periodicFbm(
      px * anisotropy,
      py,
      noiseCells,
      periodX,
      config.noise?.seed ?? 31,
    ) * noiseAmp * smoothstep(0.04, 0.3, field[index]);
    const value = smoothstep(0.24, 0.24 + soft, wispy);
    const encoded = srgbEncodedByte(value);
    const out = index * 4;
    rgba[out] = encoded;
    rgba[out + 1] = encoded;
    rgba[out + 2] = encoded;
    rgba[out + 3] = 255;
  }
  return { height, rgba, width };
}

// ---------------------------------------------------------------------------
// Atlases
// ---------------------------------------------------------------------------

function buildSkyAtlasRows(params) {
  const { width } = params.atlas;
  const rows = [];
  const fallback = params.scenarios[0];
  for (let row = 0; row < params.atlas.height; row += 1) {
    const scenario = params.scenarios.find((entry) => entry.curveRow === row)
      ?? fallback;
    const stops = prepareStops(scenario.gradient);
    const data = new Float32Array(width * 3);
    for (let x = 0; x < width; x += 1) {
      const rgb = gradientAt(stops, x / (width - 1));
      data.set(rgb, x * 3);
    }
    rows.push(data);
  }
  return rows;
}

function buildCloudAtlasRows(params) {
  const { width } = params.atlas;
  const rows = [];
  const fallback = params.scenarios[0];
  for (let row = 0; row < params.atlas.height; row += 1) {
    const scenario = params.scenarios
      .find((entry) => entry.cloudShellCurveRow === row) ?? fallback;
    const ramp = scenario.cloudRamp;
    const stops = prepareStops(ramp.stops);
    const data = new Float32Array(width * 3);
    for (let x = 0; x < width; x += 1) {
      const rgb = celRampAt(stops, ramp.bands, ramp.hardness, x / (width - 1));
      data.set(rgb, x * 3);
    }
    rows.push(data);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

function buildContract(params, generatedAt) {
  const root = SENSEI_SKY_ASSET_ROOT;
  const { shell, sky } = params.dome;
  const { camera } = params.stage;
  return {
    schema: 'toonlab.sensei-sky-variation.contract',
    version: 1,
    generatedAt,
    seed: params.seed,
    provenance: {
      method: 'procedural bake from labs/sensei-sky-lab/params.js',
      sourcePixelsIncluded: false,
    },
    camera: {
      far: camera.farMeters,
      lookAt: [...camera.lookAt],
      near: camera.near,
      position: [...camera.position],
      up: [...camera.up],
      verticalFieldOfViewDegrees: camera.verticalFieldOfViewDegrees,
    },
    render: { clearColor: [...params.stage.clearColor] },
    ground: {
      radiusMeters: params.stage.ground.radiusMeters,
      visible: params.stage.ground.visible,
    },
    sky: {
      visible: true,
      mesh: `${root}/sky-dome.glb`,
      atlas: `${root}/sky-atlas.exr`,
      atlasWidth: params.atlas.width,
      atlasHeight: params.atlas.height,
      curveRow: params.scenarios[0].curveRow,
      brightness: 1,
      skySourceComponentScale: [1],
      skySourceUnitsToMeters: sky.radiusMeters,
      toonlabUeGltfBasisYawDegrees: 0,
      toonlabCameraFarMeters: camera.farMeters,
      backgroundClouds: true,
      backgroundCloudTexture: `${root}/background-clouds.png`,
      backgroundCloudStrength:
        params.scenarios[0].cloudShader.backgroundCloudStrength,
      backgroundCloudTint: [1, 1, 1],
      backgroundCloudVerticalOffset:
        params.clouds.backgroundMapping.verticalOffset,
      backgroundCloudVerticalStretch:
        params.clouds.backgroundMapping.verticalStretch,
      cloudShell: true,
      cloudShellMesh: `${root}/cloud-shell.glb`,
      cloudShellTexture: `${root}/cloud-shell.png`,
      cloudShellAtlas: `${root}/cloud-atlas.exr`,
      cloudShellAtlasWidth: params.atlas.width,
      cloudShellAtlasHeight: params.atlas.height,
      cloudShellCurveRow: params.scenarios[0].cloudShellCurveRow,
      cloudShellStrength: 1,
      cloudShellRotationSpeed: params.clouds.drift.rotationSpeed,
      cloudShellDeterministicTime: 0,
      cloudShellVerticalOffset: 0,
      cloudShellVerticalStretch: 1,
      cloudShellSourceComponentScale: [1],
      cloudShellGltfUnitsToMeters: shell.radiusMeters,
    },
    scenarios: params.scenarios.map((scenario) => ({
      cloudShader: { ...scenario.cloudShader },
      cloudShellCurveRow: scenario.cloudShellCurveRow,
      curveRow: scenario.curveRow,
      energy: scenario.energy,
      groundColor: scenario.groundColor,
      hour: scenario.hour,
      id: scenario.id,
      label: scenario.label,
      skyShader: { ...scenario.skyShader },
      tint: [...scenario.tint],
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const params = SENSEI_SKY_PARAMS;
  const generatedAt = new Date().toISOString();
  mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  const track = (name, bytes) => written.push({ bytes, name });

  const skyDome = buildDomeGeometry({
    elevationEndDeg: 90,
    elevationStartDeg: -90,
    segments: params.dome.sky.segments,
  });
  track('sky-dome.glb', writeGlb(resolve(OUT_DIR, 'sky-dome.glb'), 'SenseiSkyDome', skyDome));

  const shell = buildDomeGeometry({
    elevationEndDeg: params.dome.shell.topElevationDegrees,
    elevationStartDeg: params.dome.shell.rimElevationDegrees,
    segments: params.dome.shell.segments,
    verticalScale: params.dome.shell.verticalScale,
  });
  track('cloud-shell.glb', writeGlb(resolve(OUT_DIR, 'cloud-shell.glb'), 'SenseiCloudShell', shell));

  track('sky-atlas.exr', writeExr(
    resolve(OUT_DIR, 'sky-atlas.exr'),
    params.atlas.width,
    params.atlas.height,
    buildSkyAtlasRows(params),
  ));
  track('cloud-atlas.exr', writeExr(
    resolve(OUT_DIR, 'cloud-atlas.exr'),
    params.atlas.width,
    params.atlas.height,
    buildCloudAtlasRows(params),
  ));

  // Angular anisotropy of each texture: vertical pixels-per-degree over
  // horizontal pixels-per-degree, so painted shapes render round in the sky.
  const shellConfig = params.clouds.shellTexture;
  const shellElevationRange = params.dome.shell.topElevationDegrees
    - params.dome.shell.rimElevationDegrees;
  const shellAnisotropy = (shellConfig.height / shellElevationRange)
    / (shellConfig.width / 360);
  const shellRng = mulberry32(params.seed);
  const shellTexture = paintCloudShellTexture(shellRng, shellConfig, shellAnisotropy);
  track('cloud-shell.png', writePng(
    resolve(OUT_DIR, 'cloud-shell.png'),
    shellTexture.width,
    shellTexture.height,
    shellTexture.rgba,
  ));

  const backgroundConfig = params.clouds.backgroundTexture;
  const backgroundAnisotropy = (backgroundConfig.height
    / (180 * params.clouds.backgroundMapping.verticalStretch))
    / (backgroundConfig.width / 360);
  const backgroundRng = mulberry32(params.seed + 101);
  const background = paintBackgroundTexture(
    backgroundRng,
    backgroundConfig,
    backgroundAnisotropy,
  );
  track('background-clouds.png', writePng(
    resolve(OUT_DIR, 'background-clouds.png'),
    background.width,
    background.height,
    background.rgba,
  ));

  const contract = buildContract(params, generatedAt);
  const contractJson = `${JSON.stringify(contract, null, 2)}\n`;
  writeFileSync(resolve(OUT_DIR, 'contract.json'), contractJson);
  track('contract.json', contractJson.length);

  const snapshotJson = `${JSON.stringify({ generatedAt, params }, null, 2)}\n`;
  writeFileSync(resolve(OUT_DIR, 'params-snapshot.json'), snapshotJson);
  track('params-snapshot.json', snapshotJson.length);

  console.log(`Sensei sky variation baked to ${OUT_DIR}`);
  for (const entry of written) {
    console.log(`  ${entry.name.padEnd(24)} ${(entry.bytes / 1024).toFixed(1)} KiB`);
  }
}

main();
