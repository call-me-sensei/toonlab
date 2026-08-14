import * as THREE from 'three';

export const MATERIAL_MAP_SOURCE_MODES = Object.freeze({
  off: 'off',
  source: 'source',
});

export const DEFAULT_MATERIAL_MAP_SETTINGS = Object.freeze({
  aoStrength: 0,
  detailRepeat: [1, 1],
  detailStrength: 0,
  emissiveColor: [1, 1, 1],
  emissiveStrength: 0,
  enabled: true,
  matcapStrength: 0,
  metalnessStrength: 0,
  normalScale: [1, 1],
  normalStrength: 0,
  rampStrength: 0,
  roughnessStrength: 0,
  sourceMode: MATERIAL_MAP_SOURCE_MODES.source,
  specularColorStrength: 0,
});

const COLOR_USER_DATA_TEXTURE_KEYS = Object.freeze([
  'toonDetailMap',
  'detailMap',
  'toonEmissiveMap',
  'emissiveMap',
  'toonMatcapMap',
  'matcapMap',
  'matcap',
  'toonRampMap',
  'rampMap',
  'shadeRampMap',
  'gradientMap',
  'toonSpecularColorMap',
  'specularColorMap',
]);

const DATA_USER_DATA_TEXTURE_KEYS = Object.freeze([
  'toonAoMap',
  'aoMap',
  'toonMetalnessMap',
  'metalnessMap',
  'toonNormalMap',
  'normalMap',
  'toonRoughnessMap',
  'roughnessMap',
]);

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key];
  }
  return undefined;
}

function numberOption(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.min(max, Math.max(min, nextValue));
}

function enabledOption(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== 'off' && normalized !== 'none' && normalized !== 'false' && normalized !== '0';
  }
  return value !== false;
}

function normalizeSourceMode(value, fallback = DEFAULT_MATERIAL_MAP_SETTINGS.sourceMode) {
  if (value === true) return MATERIAL_MAP_SOURCE_MODES.source;
  if (value === false) return MATERIAL_MAP_SOURCE_MODES.off;
  const normalized = String(value ?? fallback).trim().replace(/[\s_-]+/g, '').toLowerCase();
  if (normalized === 'source' || normalized === 'material' || normalized === 'maps') {
    return MATERIAL_MAP_SOURCE_MODES.source;
  }
  return MATERIAL_MAP_SOURCE_MODES.off;
}

function normalizeMaterialMapOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') {
    return {
      enabled: enabledOption(options),
      sourceMode: normalizeSourceMode(options),
    };
  }
  return options || {};
}

function colorOption(value, fallback) {
  if (value?.isColor) return value.clone();

  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Color(
      numberOption(value[0], fallback[0] ?? fallback.r ?? 1),
      numberOption(value[1], fallback[1] ?? fallback.g ?? 1),
      numberOption(value[2], fallback[2] ?? fallback.b ?? 1),
    );
  }

  if (typeof value === 'object' && value !== null) {
    return new THREE.Color(
      numberOption(value.r ?? value.x, fallback[0] ?? fallback.r ?? 1),
      numberOption(value.g ?? value.y, fallback[1] ?? fallback.g ?? 1),
      numberOption(value.b ?? value.z, fallback[2] ?? fallback.b ?? 1),
    );
  }

  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return new THREE.Color(value);
    } catch {
      // Fall through to fallback.
    }
  }

  return Array.isArray(fallback)
    ? new THREE.Color(fallback[0], fallback[1], fallback[2])
    : fallback.clone();
}

function vector2Option(value, fallback) {
  if (value?.isVector2) return value.clone();
  if (Array.isArray(value) && value.length >= 2) {
    return new THREE.Vector2(
      numberOption(value[0], fallback[0] ?? fallback.x ?? 1),
      numberOption(value[1], fallback[1] ?? fallback.y ?? 1),
    );
  }
  if (typeof value === 'object' && value !== null) {
    return new THREE.Vector2(
      numberOption(value.x ?? value.u ?? value.r, fallback[0] ?? fallback.x ?? 1),
      numberOption(value.y ?? value.v ?? value.g, fallback[1] ?? fallback.y ?? 1),
    );
  }
  return Array.isArray(fallback)
    ? new THREE.Vector2(fallback[0], fallback[1])
    : fallback.clone();
}

function textureOption(value) {
  return value?.isTexture ? value : null;
}

function sourceTexture(mat, materialKeys, userDataKeys) {
  for (const key of materialKeys) {
    const texture = textureOption(mat?.[key]);
    if (texture) return texture;
  }
  for (const key of userDataKeys) {
    const texture = textureOption(mat?.userData?.[key]);
    if (texture) return texture;
  }
  return null;
}

export function createMaterialMapSettings(options = null) {
  const source = normalizeMaterialMapOptions(options);
  const enabled = enabledOption(source.enabled);

  return {
    aoMap: textureOption(firstDefined(source, ['aoMap', 'occlusionMap'])),
    aoStrength: enabled
      ? numberOption(firstDefined(source, ['aoStrength', 'occlusionStrength']), DEFAULT_MATERIAL_MAP_SETTINGS.aoStrength, { min: 0, max: 1 })
      : 0,
    detailMap: textureOption(firstDefined(source, ['detailMap', 'toonDetailMap'])),
    detailRepeat: vector2Option(firstDefined(source, ['detailRepeat', 'detailScale']), DEFAULT_MATERIAL_MAP_SETTINGS.detailRepeat),
    detailStrength: enabled
      ? numberOption(firstDefined(source, ['detailStrength', 'detailIntensity']), DEFAULT_MATERIAL_MAP_SETTINGS.detailStrength, { min: 0, max: 1 })
      : 0,
    emissiveColor: colorOption(firstDefined(source, ['emissiveColor', 'emissionColor']), DEFAULT_MATERIAL_MAP_SETTINGS.emissiveColor),
    emissiveMap: textureOption(firstDefined(source, ['emissiveMap', 'emissionMap'])),
    emissiveStrength: enabled
      ? numberOption(firstDefined(source, ['emissiveStrength', 'emissionStrength', 'emissiveIntensity']), DEFAULT_MATERIAL_MAP_SETTINGS.emissiveStrength, { min: 0, max: 8 })
      : 0,
    enabled,
    matcapMap: textureOption(firstDefined(source, ['matcapMap', 'matcap'])),
    matcapStrength: enabled
      ? numberOption(firstDefined(source, ['matcapStrength', 'matcapIntensity']), DEFAULT_MATERIAL_MAP_SETTINGS.matcapStrength, { min: 0, max: 1 })
      : 0,
    metalnessMap: textureOption(firstDefined(source, ['metalnessMap', 'metallicMap'])),
    metalnessStrength: enabled
      ? numberOption(firstDefined(source, ['metalnessStrength', 'metallicStrength']), DEFAULT_MATERIAL_MAP_SETTINGS.metalnessStrength, { min: 0, max: 1 })
      : 0,
    normalMap: textureOption(firstDefined(source, ['normalMap', 'toonNormalMap'])),
    normalScale: vector2Option(firstDefined(source, ['normalScale']), DEFAULT_MATERIAL_MAP_SETTINGS.normalScale),
    normalStrength: enabled
      ? numberOption(firstDefined(source, ['normalStrength', 'normalMapStrength']), DEFAULT_MATERIAL_MAP_SETTINGS.normalStrength, { min: 0, max: 1 })
      : 0,
    rampMap: textureOption(firstDefined(source, ['rampMap', 'shadeRampMap', 'gradientMap'])),
    rampStrength: enabled
      ? numberOption(firstDefined(source, ['rampStrength', 'shadeRampStrength']), DEFAULT_MATERIAL_MAP_SETTINGS.rampStrength, { min: 0, max: 1 })
      : 0,
    roughnessMap: textureOption(firstDefined(source, ['roughnessMap'])),
    roughnessStrength: enabled
      ? numberOption(firstDefined(source, ['roughnessStrength', 'roughnessMapStrength']), DEFAULT_MATERIAL_MAP_SETTINGS.roughnessStrength, { min: 0, max: 1 })
      : 0,
    sourceMode: normalizeSourceMode(firstDefined(source, ['sourceMode', 'sourceMaps', 'useSourceMaps'])),
    specularColorMap: textureOption(firstDefined(source, ['specularColorMap', 'specularMap'])),
    specularColorStrength: enabled
      ? numberOption(firstDefined(source, ['specularColorStrength', 'specularMapStrength']), DEFAULT_MATERIAL_MAP_SETTINGS.specularColorStrength, { min: 0, max: 1 })
      : 0,
  };
}

export function collectMaterialMapTextures(mat) {
  const textures = [];

  for (const key of COLOR_USER_DATA_TEXTURE_KEYS) {
    const texture = textureOption(mat?.userData?.[key]);
    if (texture) textures.push({ texture, colorSpace: THREE.SRGBColorSpace });
  }

  for (const key of DATA_USER_DATA_TEXTURE_KEYS) {
    const texture = textureOption(mat?.userData?.[key]);
    if (texture) textures.push({ texture, colorSpace: THREE.NoColorSpace });
  }

  return textures;
}

export function resolveMaterialMapsForMaterial(settings, mat) {
  const sourceEnabled = settings.enabled && settings.sourceMode === MATERIAL_MAP_SOURCE_MODES.source;

  const normalScale = settings.normalScale.clone();
  if (mat?.normalScale?.isVector2) normalScale.multiply(mat.normalScale);

  const emissiveColor = settings.emissiveColor.clone();
  if (mat?.emissive?.isColor) emissiveColor.multiply(mat.emissive);
  const sourceEmissiveIntensity = Number.isFinite(mat?.emissiveIntensity) ? mat.emissiveIntensity : 1;

  const normalMap = settings.normalMap ?? (sourceEnabled
    ? sourceTexture(mat, ['normalMap'], ['toonNormalMap', 'normalMap'])
    : null);
  const aoMap = settings.aoMap ?? (sourceEnabled
    ? sourceTexture(mat, ['aoMap'], ['toonAoMap', 'aoMap', 'occlusionMap'])
    : null);
  const emissiveMap = settings.emissiveMap ?? (sourceEnabled
    ? sourceTexture(mat, ['emissiveMap'], ['toonEmissiveMap', 'emissiveMap', 'emissionMap'])
    : null);
  const matcapMap = settings.matcapMap ?? (sourceEnabled
    ? sourceTexture(mat, ['matcap'], ['toonMatcapMap', 'matcapMap', 'matcap'])
    : null);
  const rampMap = settings.rampMap ?? (sourceEnabled
    ? sourceTexture(mat, ['gradientMap'], ['toonRampMap', 'rampMap', 'shadeRampMap', 'gradientMap'])
    : null);
  const detailMap = settings.detailMap ?? (sourceEnabled
    ? sourceTexture(mat, [], ['toonDetailMap', 'detailMap'])
    : null);
  const roughnessMap = settings.roughnessMap ?? (sourceEnabled
    ? sourceTexture(mat, ['roughnessMap'], ['toonRoughnessMap', 'roughnessMap'])
    : null);
  const metalnessMap = settings.metalnessMap ?? (sourceEnabled
    ? sourceTexture(mat, ['metalnessMap'], ['toonMetalnessMap', 'metalnessMap', 'metallicMap'])
    : null);
  const specularColorMap = settings.specularColorMap ?? (sourceEnabled
    ? sourceTexture(mat, ['specularColorMap', 'specularMap'], ['toonSpecularColorMap', 'specularColorMap', 'specularMap'])
    : null);

  return {
    aoMap,
    aoStrength: settings.aoStrength,
    detailMap,
    detailRepeat: settings.detailRepeat,
    detailStrength: settings.detailStrength,
    emissiveColor,
    emissiveMap,
    emissiveStrength: settings.emissiveStrength * sourceEmissiveIntensity,
    hasAoMap: Boolean(aoMap),
    hasDetailMap: Boolean(detailMap),
    hasEmissiveMap: Boolean(emissiveMap),
    hasMatcapMap: Boolean(matcapMap),
    hasMetalnessMap: Boolean(metalnessMap),
    hasNormalMap: Boolean(normalMap),
    hasRampMap: Boolean(rampMap),
    hasRoughnessMap: Boolean(roughnessMap),
    hasSpecularColorMap: Boolean(specularColorMap),
    matcapMap,
    matcapStrength: settings.matcapStrength,
    metalness: Number.isFinite(mat?.metalness) ? mat.metalness : 0,
    metalnessMap,
    metalnessStrength: settings.metalnessStrength,
    normalMap,
    normalScale,
    normalStrength: settings.normalStrength,
    rampMap,
    rampStrength: settings.rampStrength,
    roughness: Number.isFinite(mat?.roughness) ? mat.roughness : 0.5,
    roughnessMap,
    roughnessStrength: settings.roughnessStrength,
    specularColorMap,
    specularColorStrength: settings.specularColorStrength,
  };
}
