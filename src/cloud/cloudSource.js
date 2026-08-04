// Editable 2.5D cloud-source documents and the deterministic map generator.
// The generator is DOM-free so the lab worker, Node verification, and runtime
// all produce identical bytes for the same source document.

export const CLOUD_SOURCE_DOCUMENT_TYPE = 'toonlab/cloud-source';
export const CLOUD_SOURCE_SCHEMA_VERSION = 1;

export const CLOUD_SOURCE_PRESETS = Object.freeze({
  distant_bank: Object.freeze({
    depth: 0.46,
    detail: 0.28,
    erosion: 0.18,
    label: 'Distant Bank',
    lobeScale: 0.2,
    puffiness: 0.48,
    softness: 0.16,
    undersideWeight: 0.4,
  }),
  puffy_cumulus: Object.freeze({
    depth: 0.8,
    detail: 0.62,
    erosion: 0,
    label: 'Puffy Cumulus',
    lobeScale: 0.13,
    puffiness: 0.82,
    softness: 0.1,
    undersideWeight: 0.62,
  }),
  towering_cumulus: Object.freeze({
    depth: 0.95,
    detail: 0.74,
    erosion: 0.2,
    label: 'Towering Cumulus',
    lobeScale: 0.11,
    puffiness: 0.92,
    softness: 0.08,
    undersideWeight: 0.72,
  }),
  wispy: Object.freeze({
    depth: 0.34,
    detail: 0.86,
    erosion: 0.42,
    label: 'Wispy',
    lobeScale: 0.07,
    puffiness: 0.32,
    softness: 0.2,
    undersideWeight: 0.3,
  }),
});

const DEFAULT_PRESET = 'puffy_cumulus';
const MAX_STROKES = 2_000;
const MAX_POINTS = 20_000;

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function slug(value, fallback = 'cloud') {
  return String(value ?? fallback).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function normalizePoint(value) {
  if (Array.isArray(value)) {
    return {
      pressure: clamp(value[2] ?? 1, 0.05, 1),
      x: clamp(value[0], 0, 1),
      y: clamp(value[1], 0, 1),
    };
  }
  return {
    pressure: clamp(value?.pressure ?? 1, 0.05, 1),
    x: clamp(value?.x, 0, 1),
    y: clamp(value?.y, 0, 1),
  };
}

function normalizeStroke(value, index) {
  const points = Array.isArray(value?.points)
    ? value.points.slice(0, MAX_POINTS).map(normalizePoint)
    : [];
  return {
    id: slug(value?.id, `stroke-${index + 1}`),
    mode: value?.mode === 'erase' ? 'erase' : 'paint',
    points,
    radius: clamp(value?.radius ?? 0.055, 0.002, 0.25),
  };
}

export function createCloudGenerationSettings(input = {}, presetId = DEFAULT_PRESET) {
  const resolvedPreset = CLOUD_SOURCE_PRESETS[presetId]
    ?? CLOUD_SOURCE_PRESETS[DEFAULT_PRESET];
  return {
    depth: clamp(input.depth ?? resolvedPreset.depth, 0.05, 1),
    detail: clamp(input.detail ?? resolvedPreset.detail, 0, 1),
    erosion: clamp(input.erosion ?? resolvedPreset.erosion, 0, 1),
    lobeScale: clamp(input.lobeScale ?? resolvedPreset.lobeScale, 0.025, 0.4),
    puffiness: clamp(input.puffiness ?? resolvedPreset.puffiness, 0, 1),
    softness: clamp(input.softness ?? resolvedPreset.softness, 0.01, 0.35),
    undersideWeight: clamp(
      input.undersideWeight ?? resolvedPreset.undersideWeight,
      0,
      1,
    ),
  };
}

function canonicalCloudSource(input = {}) {
  const source = isObject(input) ? input : {};
  const preset = CLOUD_SOURCE_PRESETS[source.preset] ? source.preset : DEFAULT_PRESET;
  return {
    description: String(source.description ?? ''),
    generation: createCloudGenerationSettings(source.generation, preset),
    id: slug(source.id, 'cloud-source'),
    label: String(source.label ?? source.name ?? source.id ?? 'Cloud Source').trim()
      || 'Cloud Source',
    outputs: isObject(source.outputs) ? {
      generatedAt: source.outputs.generatedAt == null
        ? null : String(source.outputs.generatedAt),
      maps: isObject(source.outputs.maps) ? { ...source.outputs.maps } : {},
      resolution: Number.isFinite(Number(source.outputs.resolution))
        ? Math.round(Number(source.outputs.resolution)) : null,
    } : null,
    preset,
    seed: Math.round(clamp(source.seed ?? 20260803, 0, 0xffffffff)),
    strokes: (Array.isArray(source.strokes) ? source.strokes : [])
      .slice(0, MAX_STROKES)
      .map(normalizeStroke),
    type: CLOUD_SOURCE_DOCUMENT_TYPE,
    version: CLOUD_SOURCE_SCHEMA_VERSION,
  };
}

export function validateCloudSourceDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid Cloud Source JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isObject(source)) {
    return { errors: ['Cloud Source must be a JSON object.'], ok: false, value: null, warnings: [] };
  }
  const errors = [];
  const warnings = [];
  if (source.type !== CLOUD_SOURCE_DOCUMENT_TYPE) {
    errors.push(`Cloud Source type must be "${CLOUD_SOURCE_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? source.schemaVersion ?? CLOUD_SOURCE_SCHEMA_VERSION);
  if (!Number.isFinite(version)) errors.push('Cloud Source version must be a number.');
  else if (version > CLOUD_SOURCE_SCHEMA_VERSION) {
    errors.push(`Cloud Source version ${version} is newer than supported version ${CLOUD_SOURCE_SCHEMA_VERSION}.`);
  }
  if (!String(source.id ?? '').trim()) errors.push('Cloud Source id is required.');
  if (!Array.isArray(source.strokes)) errors.push('Cloud Source strokes must be an array.');
  const canonical = errors.length ? null : canonicalCloudSource(source);
  if (canonical && canonical.strokes.every((stroke) => stroke.points.length === 0)) {
    warnings.push('Cloud Source has no painted points yet.');
  }
  return { errors, ok: errors.length === 0, value: canonical, warnings };
}

export const parseCloudSourceDocument = validateCloudSourceDocument;

export function createCloudSourceDocument(idOrDefinition, definition = {}) {
  const source = typeof idOrDefinition === 'string'
    ? { ...definition, id: idOrDefinition }
    : idOrDefinition;
  const document = canonicalCloudSource(source);
  const result = validateCloudSourceDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeCloudSourceDocument(input, { pretty = true } = {}) {
  return JSON.stringify(createCloudSourceDocument(input), null, pretty ? 2 : 0);
}

export function getCloudSourcePresetOptions() {
  return Object.entries(CLOUD_SOURCE_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    value: id,
  }));
}

export function createDefaultCloudStrokes(preset = DEFAULT_PRESET) {
  const definitions = {
    distant_bank: [
      { points: [[0.14, 0.62], [0.86, 0.62]], radius: 0.075 },
      { points: [[0.25, 0.56], [0.42, 0.58], [0.58, 0.54], [0.76, 0.59]], radius: 0.08 },
    ],
    puffy_cumulus: [
      { points: [[0.16, 0.68], [0.84, 0.68]], radius: 0.09 },
      { points: [[0.24, 0.59], [0.72, 0.59]], radius: 0.1 },
      { points: [[0.22, 0.61]], radius: 0.1 },
      { points: [[0.32, 0.54]], radius: 0.12 },
      { points: [[0.42, 0.45]], radius: 0.135 },
      { points: [[0.49, 0.31]], radius: 0.145 },
      { points: [[0.58, 0.44]], radius: 0.13 },
      { points: [[0.68, 0.52]], radius: 0.12 },
      { points: [[0.78, 0.6]], radius: 0.1 },
    ],
    towering_cumulus: [
      { points: [[0.22, 0.69], [0.78, 0.69]], radius: 0.12 },
      { points: [[0.34, 0.6], [0.44, 0.45]], radius: 0.14 },
      { points: [[0.47, 0.49], [0.52, 0.22]], radius: 0.155 },
      { points: [[0.55, 0.38], [0.68, 0.58]], radius: 0.135 },
    ],
    wispy: [
      { points: [[0.1, 0.54], [0.3, 0.5], [0.5, 0.52], [0.7, 0.47], [0.9, 0.5]], radius: 0.048 },
      { points: [[0.2, 0.59], [0.48, 0.57], [0.78, 0.55]], radius: 0.032 },
    ],
  };
  return (definitions[preset] ?? definitions.puffy_cumulus).map((stroke, index) => ({
    id: `starter-cloud-${index + 1}`,
    mode: 'paint',
    points: stroke.points.map(([x, y]) => ({ pressure: 1, x, y })),
    radius: stroke.radius,
  }));
}

function smoothstep(low, high, value) {
  const t = clamp((value - low) / Math.max(high - low, 0.000001), 0, 1);
  return t * t * (3 - 2 * t);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq < 0.000001) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export function rasterizeCloudStrokes(strokes, width, height = width) {
  const mask = new Float32Array(width * height);
  const aspect = width / Math.max(height, 1);
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    const pairs = stroke.points.length === 1
      ? [[stroke.points[0], stroke.points[0]]]
      : stroke.points.slice(0, -1).map((point, index) => [point, stroke.points[index + 1]]);
    for (const [a, b] of pairs) {
      const radius = stroke.radius * Math.min(a.pressure, b.pressure);
      const minX = Math.max(Math.floor((Math.min(a.x, b.x) - radius) * width), 0);
      const maxX = Math.min(Math.ceil((Math.max(a.x, b.x) + radius) * width), width - 1);
      const minY = Math.max(Math.floor((Math.min(a.y, b.y) - radius) * height), 0);
      const maxY = Math.min(Math.ceil((Math.max(a.y, b.y) + radius) * height), height - 1);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const px = (x + 0.5) / width;
          const py = (y + 0.5) / height;
          const distance = distanceToSegment(
            px * aspect,
            py,
            a.x * aspect,
            a.y,
            b.x * aspect,
            b.y,
          );
          const value = 1 - smoothstep(radius * 0.72, radius, distance);
          const index = y * width + x;
          mask[index] = stroke.mode === 'erase'
            ? Math.min(mask[index], 1 - value)
            : Math.max(mask[index], value);
        }
      }
    }
  }
  return mask;
}

function blurField(input, width, height, passes = 1) {
  let source = input;
  for (let pass = 0; pass < passes; pass += 1) {
    const output = new Float32Array(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          const sy = Math.min(Math.max(y + oy, 0), height - 1);
          for (let ox = -1; ox <= 1; ox += 1) {
            const sx = Math.min(Math.max(x + ox, 0), width - 1);
            const sampleWeight = ox === 0 && oy === 0 ? 4 : (ox === 0 || oy === 0 ? 2 : 1);
            sum += source[sy * width + sx] * sampleWeight;
            weight += sampleWeight;
          }
        }
        output[y * width + x] = sum / weight;
      }
    }
    source = output;
  }
  return source;
}

function hash2(x, y, seed) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, scale, seed) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

function insideDistance(mask, width, height) {
  const diagonal = Math.SQRT2;
  const distance = new Float32Array(mask.length);
  const inf = width + height;
  for (let index = 0; index < mask.length; index += 1) {
    distance[index] = mask[index] > 0.42 ? inf : 0;
  }
  const read = (x, y) => distance[Math.min(Math.max(y, 0), height - 1) * width
    + Math.min(Math.max(x, 0), width - 1)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!distance[index]) continue;
      distance[index] = Math.min(
        distance[index],
        read(x - 1, y) + 1,
        read(x, y - 1) + 1,
        read(x - 1, y - 1) + diagonal,
        read(x + 1, y - 1) + diagonal,
      );
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (!distance[index]) continue;
      distance[index] = Math.min(
        distance[index],
        read(x + 1, y) + 1,
        read(x, y + 1) + 1,
        read(x + 1, y + 1) + diagonal,
        read(x - 1, y + 1) + diagonal,
      );
    }
  }
  return distance;
}

function hashBytes(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function generateCloudSourceMaps(input, {
  resolution = 512,
} = {}) {
  const document = createCloudSourceDocument(input);
  const size = Math.round(clamp(resolution, 32, 2048));
  const width = size;
  const height = size;
  const raw = rasterizeCloudStrokes(document.strokes, width, height);
  const lobeDepth = new Float32Array(raw.length);
  const aspect = width / Math.max(height, 1);
  const paintLobe = (cx, cy, radius, strength = 1) => {
    const minX = Math.max(Math.floor((cx - radius) * width), 0);
    const maxX = Math.min(Math.ceil((cx + radius) * width), width - 1);
    const minY = Math.max(Math.floor((cy - radius) * height), 0);
    const maxY = Math.min(Math.ceil((cy + radius) * height), height - 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(
          ((x + 0.5) / width - cx) * aspect,
          (y + 0.5) / height - cy,
        );
        const value = (1 - smoothstep(radius * 0.62, radius, distance)) * strength;
        const sphereDepth = Math.sqrt(Math.max(1 - (distance / radius) ** 2, 0)) * strength;
        const index = y * width + x;
        raw[index] = Math.max(raw[index], value);
        lobeDepth[index] = Math.max(lobeDepth[index], sphereDepth);
      }
    }
  };
  for (const stroke of document.strokes.filter((entry) => entry.mode === 'paint')) {
    if (!stroke.points.length) continue;
    const pairs = stroke.points.length === 1
      ? [[stroke.points[0], stroke.points[0]]]
      : stroke.points.slice(0, -1).map((point, index) => [point, stroke.points[index + 1]]);
    let sampleIndex = 0;
    for (const [a, b] of pairs) {
      const distance = Math.hypot((b.x - a.x) * aspect, b.y - a.y);
      const spacing = Math.max(document.generation.lobeScale * 0.48, 0.025);
      const count = Math.max(1, Math.ceil(distance / spacing));
      for (let step = 0; step <= count; step += 1) {
        const amount = count ? step / count : 0;
        const random = hash2(sampleIndex++, stroke.id.length, document.seed);
        const random2 = hash2(sampleIndex + 91, stroke.id.length + 17, document.seed + 53);
        const baseRadius = stroke.radius * (0.72 + document.generation.puffiness * 0.48);
        const radius = baseRadius * (0.78 + random * 0.48);
        const cx = a.x + (b.x - a.x) * amount + (random - 0.5) * radius * 0.38;
        const cy = a.y + (b.y - a.y) * amount - random2 * radius * document.generation.puffiness * 0.36;
        paintLobe(cx, cy, radius, 0.8 + document.generation.puffiness * 0.2);
      }
    }
  }
  const eraseStrokes = document.strokes
    .filter((entry) => entry.mode === 'erase')
    .map((entry) => ({ ...entry, mode: 'paint' }));
  if (eraseStrokes.length) {
    const erased = rasterizeCloudStrokes(eraseStrokes, width, height);
    for (let index = 0; index < raw.length; index += 1) raw[index] *= 1 - erased[index];
  }
  const paintedPixels = raw.reduce((count, value) => count + (value > 0.05 ? 1 : 0), 0);
  if (paintedPixels < Math.max(24, size * size * 0.0008)) {
    throw new Error(
      'Paint a larger cloud shape before generating. '
      + 'Start from createDefaultCloudStrokes(preset) or author non-empty strokes.',
    );
  }
  const settings = document.generation;
  const smoothed = blurField(raw, width, height, Math.max(1, Math.round(settings.softness * 12)));
  const coverageFloat = new Float32Array(smoothed.length);
  const lobePixels = Math.max(settings.lobeScale * size, 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const coarse = valueNoise(x, y, lobePixels, document.seed);
      const fine = valueNoise(x + 17, y - 31, Math.max(lobePixels * 0.42, 2), document.seed + 97);
      const billow = (1 - Math.abs(coarse * 2 - 1)) * 0.7 + fine * 0.3;
      const micro = valueNoise(
        x - 71,
        y + 53,
        Math.max(lobePixels * (0.28 - settings.detail * 0.16), 1.5),
        document.seed + 307,
      );
      const edgeNoise = (
        (billow - 0.5) * (0.72 + settings.detail * 0.28)
        + (micro - 0.5) * settings.detail * 0.32
      ) * settings.erosion * 0.62;
      coverageFloat[index] = smoothstep(
        0.26 - settings.softness * 0.18,
        0.66 + settings.softness * 0.18,
        smoothed[index] + edgeNoise,
      );
    }
  }
  const distance = insideDistance(coverageFloat, width, height);
  const softenedLobes = blurField(lobeDepth, width, height, 2);
  let maxDistance = 1;
  for (const value of distance) maxDistance = Math.max(maxDistance, value);
  const depth = new Float32Array(distance.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (coverageFloat[index] <= 0.002) continue;
      const normalizedDistance = distance[index] / maxDistance;
      const lobe = valueNoise(x, y, Math.max(lobePixels * 0.75, 3), document.seed + 211);
      const rounded = normalizedDistance ** (0.5 + (1 - settings.puffiness) * 0.7);
      const structuredDepth = rounded * 0.36
        + softenedLobes[index] * (0.5 + settings.puffiness * 0.16);
      depth[index] = clamp(
        structuredDepth * settings.depth * (0.78 + lobe * 0.32),
        0,
        1,
      ) * coverageFloat[index];
    }
  }
  const softenedDepth = blurField(depth, width, height, 1);
  const surface = new Uint8Array(width * height * 4);
  const volume = new Uint8Array(width * height * 4);
  const sampleDepth = (x, y) => softenedDepth[
    Math.min(Math.max(y, 0), height - 1) * width
    + Math.min(Math.max(x, 0), width - 1)
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const out = index * 4;
      const dx = sampleDepth(x + 1, y) - sampleDepth(x - 1, y);
      const dy = sampleDepth(x, y + 1) - sampleDepth(x, y - 1);
      const normalStrength = 3.6 + settings.depth * 4;
      let nx = -dx * normalStrength;
      let ny = dy * normalStrength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const centerDepth = softenedDepth[index];
      const laplacian = Math.abs(
        sampleDepth(x - 1, y) + sampleDepth(x + 1, y)
        + sampleDepth(x, y - 1) + sampleDepth(x, y + 1)
        - centerDepth * 4,
      );
      const ao = clamp(
        1 - centerDepth * settings.undersideWeight * 0.42 - laplacian * 3.2,
        0,
        1,
      );
      const rim = 1 - smoothstep(0, Math.max(size * 0.035, 2), distance[index]);
      const erosion = valueNoise(x + 43, y - 19, Math.max(lobePixels * 0.34, 2), document.seed + 401);
      surface[out] = Math.round((nx * 0.5 + 0.5) * 255);
      surface[out + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      surface[out + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      surface[out + 3] = Math.round(coverageFloat[index] * 255);
      volume[out] = Math.round(centerDepth * 255);
      volume[out + 1] = Math.round(ao * 255);
      volume[out + 2] = Math.round(rim * coverageFloat[index] * 255);
      volume[out + 3] = Math.round(erosion * coverageFloat[index] * 255);
    }
  }
  return {
    document,
    height,
    hashes: {
      surface: hashBytes(surface),
      volume: hashBytes(volume),
    },
    paintedPixels,
    surface,
    volume,
    width,
  };
}

export function withCloudSourceOutputs(input, maps, { generatedAt = null } = {}) {
  const document = createCloudSourceDocument(input);
  return createCloudSourceDocument({
    ...document,
    outputs: {
      generatedAt,
      maps: {
        surface: maps.hashes.surface,
        volume: maps.hashes.volume,
      },
      resolution: maps.width,
    },
  });
}
