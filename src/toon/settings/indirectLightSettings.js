import * as THREE from 'three';

export const DEFAULT_INDIRECT_LIGHT_SETTINGS = Object.freeze({
  ambientTint: [0.86, 0.91, 1.0],
  defaultIntensity: 0.35,
  defaultMinimumIndirectLight: 0.35,
  enabled: true,
  environmentIndirectLight: 0.56,
  eyeIntensity: 0.35,
  eyeMinimumIndirectLight: 0.35,
  faceIntensity: 0.35,
  faceMinimumIndirectLight: null,
  hairIntensity: 0.35,
  hairMinimumIndirectLight: 0.35,
  hemisphereLightIntensity: 0.42,
  skinIntensity: 0.35,
  skinMinimumIndirectLight: null,
});

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

function nullableNumberOption(value, fallback, bounds) {
  if (value === null) return null;
  if (value === undefined) return fallback;
  return numberOption(value, fallback, bounds);
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

function enabledOption(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== 'off' && normalized !== 'none' && normalized !== 'false' && normalized !== '0';
  }
  return value !== false;
}

function normalizeIndirectLightOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  if (typeof options === 'string') return { enabled: enabledOption(options) };
  return options || {};
}

function roleNumber(source, role, property, fallback, aliases = []) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return numberOption(
    firstDefined(source, [rolePrefix, ...aliases]),
    fallback,
    { min: 0, max: property === 'minimumIndirectLight' ? 1 : 8 },
  );
}

function nullableRoleNumber(source, role, property, fallback, aliases = []) {
  const rolePrefix = role ? `${role}${property[0].toUpperCase()}${property.slice(1)}` : property;
  return nullableNumberOption(
    firstDefined(source, [rolePrefix, ...aliases]),
    fallback,
    { min: 0, max: property === 'minimumIndirectLight' ? 1 : 8 },
  );
}

export function createIndirectLightSettings(options = null) {
  const source = normalizeIndirectLightOptions(options);
  const enabled = enabledOption(source.enabled);
  const explicitDefaultMinimum = firstDefined(source, [
    'defaultMinimumIndirectLight',
    'minimumIndirectLight',
    'minIndirectLight',
    'indirectLightFloor',
  ]) !== undefined;
  const defaultIntensity = enabled
    ? roleNumber(
      source,
      'default',
      'intensity',
      DEFAULT_INDIRECT_LIGHT_SETTINGS.defaultIntensity,
      ['intensity', 'indirectLightIntensity'],
    )
    : 0;
  const defaultMinimumIndirectLight = enabled
    ? roleNumber(
      source,
      'default',
      'minimumIndirectLight',
      DEFAULT_INDIRECT_LIGHT_SETTINGS.defaultMinimumIndirectLight,
      ['minimumIndirectLight', 'minIndirectLight', 'indirectLightFloor'],
    )
    : 0;
  const skinFaceMinimumFallback = explicitDefaultMinimum ? defaultMinimumIndirectLight : null;

  return {
    ambientTint: colorOption(
      firstDefined(source, ['ambientTint', 'indirectTint', 'indirectLightTint']),
      DEFAULT_INDIRECT_LIGHT_SETTINGS.ambientTint,
    ),
    defaultIntensity,
    defaultMinimumIndirectLight,
    enabled,
    environmentIndirectLight: enabled
      ? numberOption(
        firstDefined(source, ['environmentIndirectLight', 'environmentLight', 'indirectEnvironmentLight']),
        DEFAULT_INDIRECT_LIGHT_SETTINGS.environmentIndirectLight,
        { min: 0, max: 8 },
      )
      : 0,
    eyeIntensity: enabled
      ? roleNumber(source, 'eye', 'intensity', defaultIntensity)
      : 0,
    eyeMinimumIndirectLight: enabled
      ? nullableRoleNumber(
        source,
        'eye',
        'minimumIndirectLight',
        defaultMinimumIndirectLight,
      )
      : 0,
    faceIntensity: enabled
      ? roleNumber(source, 'face', 'intensity', defaultIntensity)
      : 0,
    faceMinimumIndirectLight: enabled
      ? nullableRoleNumber(
        source,
        'face',
        'minimumIndirectLight',
        skinFaceMinimumFallback,
        ['faceMinIndirectLight'],
      )
      : 0,
    hairIntensity: enabled
      ? roleNumber(source, 'hair', 'intensity', defaultIntensity)
      : 0,
    hairMinimumIndirectLight: enabled
      ? nullableRoleNumber(
        source,
        'hair',
        'minimumIndirectLight',
        defaultMinimumIndirectLight,
      )
      : 0,
    hemisphereLightIntensity: enabled
      ? numberOption(
        firstDefined(source, ['hemisphereLightIntensity', 'hemisphereIntensity', 'hemiIntensity']),
        DEFAULT_INDIRECT_LIGHT_SETTINGS.hemisphereLightIntensity,
        { min: 0, max: 8 },
      )
      : 0,
    skinIntensity: enabled
      ? roleNumber(source, 'skin', 'intensity', defaultIntensity)
      : 0,
    skinMinimumIndirectLight: enabled
      ? nullableRoleNumber(
        source,
        'skin',
        'minimumIndirectLight',
        skinFaceMinimumFallback,
        ['skinMinIndirectLight'],
      )
      : 0,
  };
}

export function resolveIndirectLightForMaterial(settings, {
  faceMinimumIndirectLightFallback = DEFAULT_INDIRECT_LIGHT_SETTINGS.defaultMinimumIndirectLight,
  isEye = false,
  isFace = false,
  isHair = false,
  isSkin = false,
  skinMinimumIndirectLightFallback = DEFAULT_INDIRECT_LIGHT_SETTINGS.defaultMinimumIndirectLight,
} = {}) {
  if (isEye) {
    return {
      intensity: settings.eyeIntensity,
      minimumIndirectLight: settings.eyeMinimumIndirectLight ?? settings.defaultMinimumIndirectLight,
    };
  }

  if (isFace) {
    return {
      intensity: settings.faceIntensity,
      minimumIndirectLight: settings.faceMinimumIndirectLight ?? faceMinimumIndirectLightFallback,
    };
  }

  if (isSkin) {
    return {
      intensity: settings.skinIntensity,
      minimumIndirectLight: settings.skinMinimumIndirectLight ?? skinMinimumIndirectLightFallback,
    };
  }

  if (isHair) {
    return {
      intensity: settings.hairIntensity,
      minimumIndirectLight: settings.hairMinimumIndirectLight ?? settings.defaultMinimumIndirectLight,
    };
  }

  return {
    intensity: settings.defaultIntensity,
    minimumIndirectLight: settings.defaultMinimumIndirectLight,
  };
}
