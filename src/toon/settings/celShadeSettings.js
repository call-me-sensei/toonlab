export const DEFAULT_CEL_SHADE_SETTINGS = Object.freeze({
  bodyCelMidPoint: 0.06,
  bodyCelSoftness: 0.045,
  bodyMainLightIgnoreCelShade: 0.02,
  edgeAntiAliasStrength: 1,
  enabled: true,
});

export const REFERENCE_CEL_SHADE_SETTINGS = Object.freeze({
  bodyCelMidPoint: 0,
  bodyCelSoftness: 0.05,
  bodyMainLightIgnoreCelShade: 0,
  edgeAntiAliasStrength: 1,
  enabled: true,
});

export const CEL_SHADE_PRESETS = Object.freeze({
  baseline: DEFAULT_CEL_SHADE_SETTINGS,
  reference: REFERENCE_CEL_SHADE_SETTINGS,
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

function resolvePresetDefaults(source) {
  const presetName = String(firstDefined(source, ['preset', 'profile']) || 'baseline').toLowerCase();
  return CEL_SHADE_PRESETS[presetName] || DEFAULT_CEL_SHADE_SETTINGS;
}

export function createCelShadeSettings(options = null) {
  const source = typeof options === 'string' ? { preset: options } : options || {};
  const presetDefaults = resolvePresetDefaults(source);
  const enabled = source.enabled !== false;

  return {
    bodyCelMidPoint: enabled
      ? numberOption(
        firstDefined(source, [
          'bodyCelMidPoint',
          'bodyCelThreshold',
          'celMidPoint',
          'mainCelMidPoint',
          'mainLightCelMidPoint',
        ]),
        presetDefaults.bodyCelMidPoint,
        { min: -1, max: 1 },
      )
      : presetDefaults.bodyCelMidPoint,
    bodyCelSoftness: enabled
      ? numberOption(
        firstDefined(source, [
          'bodyCelSoftness',
          'bodyCelFeather',
          'celSoftness',
          'mainCelSoftness',
          'mainLightCelSoftness',
        ]),
        presetDefaults.bodyCelSoftness,
        { min: 0.001, max: 1 },
      )
      : presetDefaults.bodyCelSoftness,
    bodyMainLightIgnoreCelShade: enabled
      ? numberOption(
        firstDefined(source, [
          'bodyMainLightIgnoreCelShade',
          'bodyLightIgnoreCelShade',
          'mainLightIgnoreCelShade',
          'lightIgnoreCelShade',
        ]),
        presetDefaults.bodyMainLightIgnoreCelShade,
        { min: 0, max: 1 },
      )
      : presetDefaults.bodyMainLightIgnoreCelShade,
    // Widens cel/rim/specular transitions by the per-pixel screen derivative so
    // band edges stay ~1px feathered at any resolution or camera distance.
    // 0 disables and reproduces the raw smoothstep edge.
    edgeAntiAliasStrength: enabled
      ? numberOption(
        firstDefined(source, ['edgeAntiAliasStrength', 'edgeAntiAlias', 'edgeAA']),
        presetDefaults.edgeAntiAliasStrength ?? DEFAULT_CEL_SHADE_SETTINGS.edgeAntiAliasStrength,
        { min: 0, max: 4 },
      )
      : 0,
    enabled,
  };
}
