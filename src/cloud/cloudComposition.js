export const CLOUD_COMPOSITION_DOCUMENT_TYPE = 'toonlab/cloud-composition';
export const CLOUD_COMPOSITION_SCHEMA_VERSION = 1;

export const DEFAULT_CLOUD_COMPOSITION = Object.freeze({
  id: 'default-cloud-composition',
  label: 'Default Cloud Composition',
  layers: Object.freeze([
    Object.freeze({
      azimuth: Object.freeze([0, 360]),
      count: 12,
      elevation: Object.freeze([8, 24]),
      id: 'hero-cumulus',
      opacity: 1,
      parallax: 1,
      radius: 1_800,
      scale: Object.freeze([170, 340]),
      seed: 71,
      sourceRefs: Object.freeze(['hero-cloud']),
      wind: Object.freeze([0.7, 0.18]),
    }),
    Object.freeze({
      azimuth: Object.freeze([0, 360]),
      count: 18,
      elevation: Object.freeze([2, 12]),
      id: 'distant-banks',
      opacity: 0.72,
      parallax: 0.42,
      radius: 2_800,
      scale: Object.freeze([240, 520]),
      seed: 193,
      sourceRefs: Object.freeze(['hero-cloud']),
      wind: Object.freeze([0.32, 0.08]),
    }),
  ]),
  seed: 20260803,
  type: CLOUD_COMPOSITION_DOCUMENT_TYPE,
  version: CLOUD_COMPOSITION_SCHEMA_VERSION,
});

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function slug(value, fallback) {
  return String(value ?? fallback).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function range(value, fallback, min, max) {
  const source = Array.isArray(value) ? value : fallback;
  const a = clamp(source[0], min, max);
  const b = clamp(source[1], min, max);
  return a <= b ? [a, b] : [b, a];
}

function vector2(value, fallback, min, max) {
  const source = Array.isArray(value) ? value : fallback;
  return [clamp(source[0], min, max), clamp(source[1], min, max)];
}

function canonicalPlacement(input, index, layer) {
  return {
    azimuth: clamp(input?.azimuth ?? 180, 0, 360),
    elevation: clamp(input?.elevation ?? 14, -8, 80),
    id: slug(input?.id, `${layer.id}-fixed-${index + 1}`),
    opacity: clamp(input?.opacity ?? layer.opacity, 0, 1),
    parallax: clamp(input?.parallax ?? layer.parallax, 0, 2),
    radius: clamp(input?.radius ?? layer.radius, 100, 20_000),
    rotation: clamp(input?.rotation ?? 0, -180, 180),
    scale: clamp(input?.scale ?? layer.scale[0], 1, 5_000),
    sourceRef: slug(input?.sourceRef, layer.sourceRefs[0] ?? 'hero-cloud'),
    wind: vector2(input?.wind, layer.wind, -8, 8),
  };
}

function canonicalLayer(input, index) {
  const fallback = DEFAULT_CLOUD_COMPOSITION.layers[
    index % DEFAULT_CLOUD_COMPOSITION.layers.length
  ];
  const layer = {
    azimuth: range(input?.azimuth, fallback.azimuth, 0, 360),
    count: Math.round(clamp(input?.count ?? fallback.count, 0, 256)),
    elevation: range(input?.elevation, fallback.elevation, -8, 80),
    id: slug(input?.id, `layer-${index + 1}`),
    opacity: clamp(input?.opacity ?? fallback.opacity, 0, 1),
    parallax: clamp(input?.parallax ?? fallback.parallax, 0, 2),
    radius: clamp(input?.radius ?? fallback.radius, 100, 20_000),
    scale: range(input?.scale, fallback.scale, 1, 5_000),
    seed: Math.round(clamp(input?.seed ?? fallback.seed, 0, 0xffffffff)),
    sourceRefs: (Array.isArray(input?.sourceRefs) ? input.sourceRefs : fallback.sourceRefs)
      .map((value) => slug(value, 'hero-cloud'))
      .filter(Boolean)
      .slice(0, 32),
    wind: vector2(input?.wind, fallback.wind, -8, 8),
  };
  return {
    ...layer,
    placements: (Array.isArray(input?.placements) ? input.placements : [])
      .slice(0, 256)
      .map((placement, placementIndex) => canonicalPlacement(placement, placementIndex, layer)),
  };
}

function canonical(input = {}) {
  const source = isObject(input) ? input : {};
  const layers = (Array.isArray(source.layers) ? source.layers : DEFAULT_CLOUD_COMPOSITION.layers)
    .slice(0, 32)
    .map(canonicalLayer);
  return {
    description: String(source.description ?? ''),
    id: slug(source.id, DEFAULT_CLOUD_COMPOSITION.id),
    label: String(source.label ?? source.name ?? source.id ?? DEFAULT_CLOUD_COMPOSITION.label).trim()
      || DEFAULT_CLOUD_COMPOSITION.label,
    layers,
    seed: Math.round(clamp(source.seed ?? DEFAULT_CLOUD_COMPOSITION.seed, 0, 0xffffffff)),
    type: CLOUD_COMPOSITION_DOCUMENT_TYPE,
    version: CLOUD_COMPOSITION_SCHEMA_VERSION,
  };
}

export function validateCloudCompositionDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid Cloud Composition JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isObject(source)) {
    return { errors: ['Cloud Composition must be a JSON object.'], ok: false, value: null, warnings: [] };
  }
  const errors = [];
  const warnings = [];
  if (source.type !== CLOUD_COMPOSITION_DOCUMENT_TYPE) {
    errors.push(`Cloud Composition type must be "${CLOUD_COMPOSITION_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? source.schemaVersion ?? CLOUD_COMPOSITION_SCHEMA_VERSION);
  if (!Number.isFinite(version)) errors.push('Cloud Composition version must be a number.');
  else if (version > CLOUD_COMPOSITION_SCHEMA_VERSION) {
    errors.push(`Cloud Composition version ${version} is newer than supported version ${CLOUD_COMPOSITION_SCHEMA_VERSION}.`);
  }
  if (!String(source.id ?? '').trim()) errors.push('Cloud Composition id is required.');
  if (!Array.isArray(source.layers)) errors.push('Cloud Composition layers must be an array.');
  const value = errors.length ? null : canonical(source);
  if (value?.layers.some((layer) => layer.sourceRefs.length === 0)) {
    warnings.push('One or more cloud layers have no source references.');
  }
  return { errors, ok: errors.length === 0, value, warnings };
}

export const parseCloudCompositionDocument = validateCloudCompositionDocument;

export function createCloudCompositionDocument(idOrDefinition, definition = {}) {
  const source = typeof idOrDefinition === 'string'
    ? { ...definition, id: idOrDefinition }
    : idOrDefinition;
  const document = canonical(source);
  const result = validateCloudCompositionDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeCloudCompositionDocument(input, { pretty = true } = {}) {
  return JSON.stringify(createCloudCompositionDocument(input), null, pretty ? 2 : 0);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function resolveCloudPlacements(input) {
  const composition = createCloudCompositionDocument(input);
  const placements = [];
  for (const layer of composition.layers) {
    if (layer.placements.length) {
      for (const placement of layer.placements) {
        placements.push({ ...placement, layerId: layer.id });
      }
      continue;
    }
    const random = mulberry32((composition.seed ^ layer.seed) >>> 0);
    for (let index = 0; index < layer.count; index += 1) {
      const sourceRef = layer.sourceRefs[
        Math.min(Math.floor(random() * layer.sourceRefs.length), layer.sourceRefs.length - 1)
      ];
      if (!sourceRef) continue;
      const azimuth = lerp(layer.azimuth[0], layer.azimuth[1], random());
      const elevation = lerp(layer.elevation[0], layer.elevation[1], random());
      const scale = lerp(layer.scale[0], layer.scale[1], random());
      placements.push({
        azimuth,
        elevation,
        id: `${layer.id}-${index + 1}`,
        layerId: layer.id,
        opacity: layer.opacity,
        parallax: layer.parallax,
        radius: layer.radius,
        rotation: (random() - 0.5) * 12,
        scale,
        sourceRef,
        wind: [...layer.wind],
      });
    }
  }
  return placements;
}
