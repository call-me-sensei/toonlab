import * as THREE from 'three';

import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { createSkyNodeMaterial } from '../shaders-tsl/sky.js';
import { SKY_SCENE_OVERRIDE_PRIORITIES } from './sceneOverrideLayers.js';
import { resolveSkyQuality } from './skyQuality.js';

export { SKY_SCENE_OVERRIDE_PRIORITIES } from './sceneOverrideLayers.js';
export { SKY_QUALITY_OPTIONS, SKY_QUALITY_TIERS, resolveSkyQuality } from './skyQuality.js';

// Procedural stylized sky dome: vertical gradient, sun disc, painterly
// two-tone clouds, and stars — no texture assets. Designed as the companion
// backdrop for the stylized water (it appears in the water's planar
// reflections automatically), but works standalone with any scene.
//
//   const sky = new StylizedSky({ preset-ish options });
//   scene.add(sky);
//   sky.update(delta, camera);       // each frame
//   sky.applySettings({ sunDirection: [..], cloudCoverage: 0.6 });

/**
 * Default sky settings. Every value equals the historical hardcoded/
 * constructor default, so `new StylizedSky()` renders identically to
 * previous releases. `radius` is construction-only (dome geometry).
 */
export const DEFAULT_SKY_SETTINGS = Object.freeze({
  radius: 100,
  zenithColor: [0.28, 0.56, 0.92],
  horizonColor: [0.78, 0.92, 1.0],
  groundColor: [0.42, 0.48, 0.55],
  sunDirection: [0.35, 0.8, 0.45],
  sunColor: [1.0, 0.95, 0.82],
  sunSize: 0.026,
  sunDiscSoftness: 0.5,
  sunGlowStrength: 1.0,
  sunDiscIntensity: 2.4,
  sunGlowSpread: 5.0,
  sunGlowCoreSharpness: 60.0,
  sunGlowBroadStrength: 0.16,
  sunGlowCoreStrength: 0.5,
  sunCloudOcclusionStrength: 1.0,
  horizonScattering: 0.5,
  zenithExponent: 0.48,
  groundExponent: 0.55,
  horizonBandSize: 0.42,
  horizonSunPower: 5.0,
  cloudCoverage: 0.42,
  cloudScale: 1.6,
  cloudSpeed: 1.0,
  cloudDirection: Object.freeze([0.9615239476, 0.2747211279]),
  cloudSeed: 0,
  cloudProjection: 0.22,
  cloudSoftness: 0.1,
  cloudEdgeOpacity: 0.65,
  cloudOpacity: 1.0,
  cloudShadeStrength: 0.85,
  cloudShadeThreshold: 0.02,
  cloudShadeSoftness: 0.06,
  cloudLightOffset: 0.4,
  cloudSilverLiningStrength: 0.3,
  cloudSunPower: 10.0,
  cloudHorizonFade: 0.16,
  cloudColor: [1.0, 1.0, 1.0],
  cloudShadeColor: [0.68, 0.78, 0.92],
  starsStrength: 0.0,
  starsColor: Object.freeze([1.0, 0.98, 0.92]),
  starsSeed: 0,
  starsScale: 14.0,
  starsDensity: 0.28,
  starsSize: 0.06,
  starsTwinkleStrength: 0.8,
  starsTwinkleSpeed: 1.0,
  starsHorizonFade: 0.24,
});

/** Document `type` discriminator for portable sky-look presets. */
export const SKY_PRESET_DOCUMENT_TYPE = 'toonlab/sky-preset';

/** Current portable sky preset schema version. */
export const SKY_PRESET_SCHEMA_VERSION = 1;

// Named sky looks. Built-ins and imported preset documents use the same
// registry so a preset behaves identically whether it shipped with Toonlab or
// was authored in a lab and registered at runtime.
const skyPresetRegistry = new Map();

/**
 * Registers a named sky preset so it resolves in `createSkySettings({
 * preset })` exactly like the built-ins. Accepts `{ label?, description?,
 * settings? }` or flat settings.
 */
export function registerSkyPreset(name, preset = {}, { overwrite = false } = {}) {
  const document = createSkyPresetDocument(name, preset);
  if (!overwrite && skyPresetRegistry.has(document.id)) {
    throw new Error(`Sky preset "${document.id}" already exists.`);
  }
  const entry = Object.freeze({
    description: document.description,
    label: document.label,
    settings: Object.freeze({ ...document.settings }),
  });
  skyPresetRegistry.set(document.id, entry);
  return { description: entry.description, id: document.id, label: entry.label };
}

/** Lists registered sky presets as `{ id, label, description }` (for HUDs). */
export function getSkyPresetOptions() {
  return Array.from(skyPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

function finiteNumber(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function colorArray(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const color = new THREE.Color(value);
      return [color.r, color.g, color.b];
    } catch {
      return fallback.slice();
    }
  }
  return fallback.slice();
}

function vector3Array(value, fallback) {
  if (value?.isVector3) return [value.x, value.y, value.z];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function vector2Array(value, fallback) {
  if (value?.isVector2) return [value.x, value.y];
  if (Array.isArray(value) && value.length >= 2) {
    const next = value.slice(0, 2).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function direction2Array(value, fallback) {
  const supplied = value?.isVector2 || (
    Array.isArray(value)
    && value.length >= 2
    && value.slice(0, 2).every((channel) => Number.isFinite(Number(channel)))
  );
  if (!supplied) return fallback.slice();
  const next = vector2Array(value, fallback);
  const length = Math.hypot(next[0], next[1]);
  if (length < 1e-6) return fallback.slice();
  return [next[0] / length, next[1] / length]
    .map((channel) => Number(channel.toFixed(10)));
}

/**
 * Validates and merges partial sky options over {@link DEFAULT_SKY_SETTINGS}.
 * Unknown keys are ignored; malformed values fall back to their defaults.
 * `createSkySettings()` deep-equals the defaults object.
 *
 * @param {Object} [options] Partial settings (legacy constructor options are
 *   the same flat shape, so they work unchanged).
 * @returns {Object} A complete, plain sky settings object.
 */
export function createSkySettings(options = {}) {
  const source = typeof options === 'string'
    ? { preset: options }
    : (options && typeof options === 'object' ? options : {});
  const presetSettings = skyPresetRegistry.get(source.preset)?.settings;
  const base = presetSettings ? { ...DEFAULT_SKY_SETTINGS, ...presetSettings } : DEFAULT_SKY_SETTINGS;
  return {
    radius: Math.max(finiteNumber(source.radius, base.radius), 0.1),
    zenithColor: colorArray(source.zenithColor, base.zenithColor),
    horizonColor: colorArray(source.horizonColor, base.horizonColor),
    groundColor: colorArray(source.groundColor, base.groundColor),
    sunDirection: vector3Array(source.sunDirection, base.sunDirection),
    sunColor: colorArray(source.sunColor, base.sunColor),
    sunSize: finiteNumber(source.sunSize, base.sunSize, { max: 0.2, min: 0 }),
    sunDiscSoftness: finiteNumber(source.sunDiscSoftness, base.sunDiscSoftness, { max: 1, min: 0.01 }),
    sunGlowStrength: finiteNumber(source.sunGlowStrength, base.sunGlowStrength, { max: 4, min: 0 }),
    sunDiscIntensity: finiteNumber(source.sunDiscIntensity, base.sunDiscIntensity, { max: 8, min: 0 }),
    sunGlowSpread: finiteNumber(source.sunGlowSpread, base.sunGlowSpread, { max: 20, min: 1 }),
    sunGlowCoreSharpness: finiteNumber(source.sunGlowCoreSharpness, base.sunGlowCoreSharpness, { max: 200, min: 5 }),
    sunGlowBroadStrength: finiteNumber(source.sunGlowBroadStrength, base.sunGlowBroadStrength, { max: 2, min: 0 }),
    sunGlowCoreStrength: finiteNumber(source.sunGlowCoreStrength, base.sunGlowCoreStrength, { max: 2, min: 0 }),
    sunCloudOcclusionStrength: finiteNumber(source.sunCloudOcclusionStrength, base.sunCloudOcclusionStrength, { max: 1, min: 0 }),
    horizonScattering: finiteNumber(source.horizonScattering, base.horizonScattering, { max: 1, min: 0 }),
    zenithExponent: finiteNumber(source.zenithExponent, base.zenithExponent, { max: 4, min: 0.1 }),
    groundExponent: finiteNumber(source.groundExponent, base.groundExponent, { max: 4, min: 0.1 }),
    horizonBandSize: finiteNumber(source.horizonBandSize, base.horizonBandSize, { max: 1, min: 0.02 }),
    horizonSunPower: finiteNumber(source.horizonSunPower, base.horizonSunPower, { max: 20, min: 0.5 }),
    cloudCoverage: finiteNumber(source.cloudCoverage, base.cloudCoverage, { max: 1, min: 0 }),
    cloudScale: finiteNumber(source.cloudScale, base.cloudScale, { max: 6, min: 0.1 }),
    cloudSpeed: finiteNumber(source.cloudSpeed, base.cloudSpeed, { max: 4, min: 0 }),
    cloudDirection: direction2Array(source.cloudDirection, base.cloudDirection),
    cloudSeed: Math.round(finiteNumber(source.cloudSeed, base.cloudSeed, { max: 1000, min: 0 })),
    cloudProjection: finiteNumber(source.cloudProjection, base.cloudProjection, { max: 0.8, min: 0.05 }),
    cloudSoftness: finiteNumber(source.cloudSoftness, base.cloudSoftness, { max: 0.3, min: 0.01 }),
    cloudEdgeOpacity: finiteNumber(source.cloudEdgeOpacity, base.cloudEdgeOpacity, { max: 1, min: 0 }),
    cloudOpacity: finiteNumber(source.cloudOpacity, base.cloudOpacity, { max: 1, min: 0 }),
    cloudShadeStrength: finiteNumber(source.cloudShadeStrength, base.cloudShadeStrength, { max: 1, min: 0 }),
    cloudShadeThreshold: finiteNumber(source.cloudShadeThreshold, base.cloudShadeThreshold, { max: 0.3, min: -0.3 }),
    cloudShadeSoftness: finiteNumber(source.cloudShadeSoftness, base.cloudShadeSoftness, { max: 0.3, min: 0.001 }),
    cloudLightOffset: finiteNumber(source.cloudLightOffset, base.cloudLightOffset, { max: 2, min: 0 }),
    cloudSilverLiningStrength: finiteNumber(source.cloudSilverLiningStrength, base.cloudSilverLiningStrength, { max: 2, min: 0 }),
    cloudSunPower: finiteNumber(source.cloudSunPower, base.cloudSunPower, { max: 40, min: 1 }),
    cloudHorizonFade: finiteNumber(source.cloudHorizonFade, base.cloudHorizonFade, { max: 0.8, min: 0.02 }),
    cloudColor: colorArray(source.cloudColor, base.cloudColor),
    cloudShadeColor: colorArray(source.cloudShadeColor, base.cloudShadeColor),
    starsStrength: finiteNumber(source.starsStrength, base.starsStrength, { max: 2, min: 0 }),
    starsColor: colorArray(source.starsColor, base.starsColor),
    starsSeed: Math.round(finiteNumber(source.starsSeed, base.starsSeed, { max: 1000, min: 0 })),
    starsScale: finiteNumber(source.starsScale, base.starsScale, { max: 64, min: 2 }),
    starsDensity: finiteNumber(source.starsDensity, base.starsDensity, { max: 1, min: 0 }),
    starsSize: finiteNumber(source.starsSize, base.starsSize, { max: 0.2, min: 0.005 }),
    starsTwinkleStrength: finiteNumber(source.starsTwinkleStrength, base.starsTwinkleStrength, { max: 1, min: 0 }),
    starsTwinkleSpeed: finiteNumber(source.starsTwinkleSpeed, base.starsTwinkleSpeed, { max: 4, min: 0 }),
    starsHorizonFade: finiteNumber(source.starsHorizonFade, base.starsHorizonFade, { max: 1, min: 0.04 }),
  };
}

/**
 * Panel group metadata for the sky settings, in display order. Settings
 * themselves stay flat; each group lists which flat keys it owns via
 * {@link SKY_SETTING_FIELD_SCHEMA}.
 */
export const SKY_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Sky dome geometry. Construction-only.',
    id: 'dome',
    label: 'Dome',
  }),
  Object.freeze({
    description: 'Vertical zenith-to-horizon-to-ground gradient and horizon scattering.',
    id: 'gradient',
    label: 'Gradient',
  }),
  Object.freeze({
    description: 'Sun disc position, size, tint, and glow halo.',
    id: 'sun',
    label: 'Sun',
  }),
  Object.freeze({
    description: 'Painterly two-tone procedural clouds.',
    id: 'clouds',
    label: 'Clouds',
  }),
  Object.freeze({
    description: 'Procedural star field for night skies.',
    id: 'stars',
    label: 'Stars',
  }),
]);

const SKY_FIELD_DEFINITIONS = Object.freeze({
  dome: {
    radius: {
      description: 'Sphere radius of the sky dome in meters. Construction-only: baked into the dome geometry; applySettings stores but does not rebuild it.',
      label: 'Radius',
      range: { max: 1000, min: 10, step: 1 },
      serializable: false,
      type: 'number',
    },
  },
  gradient: {
    zenithColor: {
      description: 'Sky color straight up at the top of the dome.',
      label: 'Zenith Color',
      type: 'color',
    },
    horizonColor: {
      description: 'Sky color at the horizon band.',
      label: 'Horizon Color',
      type: 'color',
    },
    groundColor: {
      description: 'Dome color below the horizon.',
      label: 'Ground Color',
      type: 'color',
    },
    zenithExponent: {
      description: 'Shape of the horizon-to-zenith gradient. Lower values bring the zenith color farther toward the horizon.',
      label: 'Zenith Gradient Shape',
      range: { max: 4, min: 0.1, step: 0.01 },
      type: 'number',
    },
    groundExponent: {
      description: 'Shape of the mirrored below-horizon fade into the ground color.',
      label: 'Ground Gradient Shape',
      range: { max: 4, min: 0.1, step: 0.01 },
      type: 'number',
    },
    horizonBandSize: {
      description: 'Vertical size of the sun-side atmospheric scattering band around the horizon.',
      label: 'Horizon Band Size',
      range: { max: 1, min: 0.02, step: 0.01 },
      type: 'number',
    },
    horizonSunPower: {
      description: 'How tightly horizon scattering concentrates toward the sun direction.',
      label: 'Horizon Sun Focus',
      range: { max: 20, min: 0.5, step: 0.1 },
      type: 'number',
    },
    horizonScattering: {
      description: 'Strength of the bright sun-side atmospheric wedge at the horizon.',
      label: 'Horizon Scatter Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  sun: {
    sunDirection: {
      description: 'World-space direction toward the sun (normalized on apply). Match your main directional light.',
      label: 'Sun Direction',
      type: 'vector3',
    },
    sunColor: {
      description: 'Tint of the sun disc and its glow.',
      label: 'Sun Color',
      type: 'color',
    },
    sunSize: {
      description: 'Angular size of the sun disc.',
      label: 'Sun Size',
      range: { max: 0.2, min: 0, step: 0.001 },
      type: 'number',
    },
    sunDiscSoftness: {
      description: 'Fraction of the disc radius used for its anti-aliased painterly edge.',
      label: 'Disc Edge Softness',
      range: { max: 1, min: 0.01, step: 0.01 },
      type: 'number',
    },
    sunDiscIntensity: {
      description: 'Brightness multiplier of the solid sun disc before the renderer tone map.',
      label: 'Disc Intensity',
      range: { max: 8, min: 0, step: 0.05 },
      type: 'number',
    },
    sunGlowStrength: {
      description: 'Master intensity of the broad and core sun glow terms.',
      label: 'Glow Strength',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    sunGlowSpread: {
      description: 'Falloff power of the broad halo. Lower values spread the glow across more sky.',
      label: 'Glow Spread',
      range: { max: 20, min: 1, step: 0.1 },
      type: 'number',
    },
    sunGlowCoreSharpness: {
      description: 'Falloff power of the tight inner halo. Higher values make a smaller, sharper core.',
      label: 'Core Sharpness',
      range: { max: 200, min: 5, step: 1 },
      type: 'number',
    },
    sunGlowBroadStrength: {
      description: 'Contribution of the broad halo inside the master glow strength.',
      label: 'Broad Halo',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    sunGlowCoreStrength: {
      description: 'Contribution of the tight inner halo inside the master glow strength.',
      label: 'Core Halo',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    sunCloudOcclusionStrength: {
      description: 'How strongly dense cloud coverage hides the sun disc. 0 keeps the disc visible through cloud.',
      label: 'Cloud Occlusion',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  clouds: {
    cloudCoverage: {
      description: 'Fraction of the sky filled by clouds. 0 clears the sky.',
      label: 'Cloud Coverage',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudScale: {
      description: 'Noise scale of the cloud shapes; higher gives smaller, busier clouds.',
      label: 'Cloud Scale',
      range: { max: 6, min: 0.1, step: 0.01 },
      type: 'number',
    },
    cloudSoftness: {
      description: 'Width of the painterly cloud silhouette transition.',
      label: 'Edge Softness',
      range: { max: 0.3, min: 0.01, step: 0.005 },
      type: 'number',
    },
    cloudProjection: {
      description: 'Perspective offset of the virtual cloud plane; higher values flatten clouds toward the horizon.',
      label: 'Layer Projection',
      range: { max: 0.8, min: 0.05, step: 0.01 },
      type: 'number',
    },
    cloudOpacity: {
      description: 'Overall blend opacity of the procedural cloud layer.',
      label: 'Cloud Opacity',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudEdgeOpacity: {
      description: 'Opacity of the soft outer silhouette relative to the solid cloud core.',
      label: 'Edge Opacity',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudSpeed: {
      description: 'How fast the authored cloud layer drifts across the dome.',
      label: 'Cloud Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudDirection: {
      description: 'Normalized horizontal drift direction of the authored cloud layer; speed is controlled separately.',
      label: 'Cloud Direction',
      type: 'vector2',
    },
    cloudSeed: {
      description: 'Offsets the procedural cloud field to produce a different deterministic composition.',
      integer: true,
      label: 'Cloud Pattern Seed',
      range: { max: 1000, min: 0, step: 1 },
      type: 'number',
    },
    cloudColor: {
      description: 'Lit tone of the two-tone painterly clouds.',
      label: 'Cloud Color',
      type: 'color',
    },
    cloudShadeColor: {
      description: 'Shaded underside tone of the two-tone painterly clouds.',
      label: 'Cloud Shade Color',
      type: 'color',
    },
    cloudShadeStrength: {
      description: 'Strength of the two-tone shaded underside.',
      label: 'Shade Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadeThreshold: {
      description: 'Noise-difference threshold that separates the lit and shaded cloud tones.',
      label: 'Shade Threshold',
      range: { max: 0.3, min: -0.3, step: 0.005 },
      type: 'number',
    },
    cloudShadeSoftness: {
      description: 'Softness of the transition between the two cloud tones.',
      label: 'Shade Softness',
      range: { max: 0.3, min: 0.001, step: 0.005 },
      type: 'number',
    },
    cloudLightOffset: {
      description: 'Distance of the secondary noise sample toward the sun; controls the depth and directionality of cloud shading.',
      label: 'Light Sample Offset',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudSilverLiningStrength: {
      description: 'Warm sun-colored lining added to cloud edges facing the sun.',
      label: 'Silver Lining',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudSunPower: {
      description: 'Angular focus of the sun-colored cloud lining.',
      label: 'Lining Focus',
      range: { max: 40, min: 1, step: 0.5 },
      type: 'number',
    },
    cloudHorizonFade: {
      description: 'Altitude at which the cloud layer reaches full opacity above the horizon.',
      label: 'Horizon Fade',
      range: { max: 0.8, min: 0.02, step: 0.01 },
      type: 'number',
    },
  },
  stars: {
    starsStrength: {
      description: 'Brightness of the procedural star field. 0 (default) hides stars for daytime skies.',
      label: 'Stars Strength',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    starsColor: {
      description: 'Tint of the procedural star glints.',
      label: 'Stars Color',
      type: 'color',
    },
    starsSeed: {
      description: 'Offsets the deterministic star pattern without changing density or size.',
      integer: true,
      label: 'Stars Pattern Seed',
      range: { max: 1000, min: 0, step: 1 },
      type: 'number',
    },
    starsDensity: {
      description: 'Fraction of candidate cells allowed to contain a visible star.',
      label: 'Stars Density',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    starsScale: {
      description: 'Density scale of the projected star grid; higher values produce more, smaller cells.',
      label: 'Stars Scale',
      range: { max: 64, min: 2, step: 0.5 },
      type: 'number',
    },
    starsSize: {
      description: 'Size of each procedural star glint inside its cell.',
      label: 'Stars Size',
      range: { max: 0.2, min: 0.005, step: 0.005 },
      type: 'number',
    },
    starsTwinkleStrength: {
      description: 'Depth of per-star brightness animation. 0 disables twinkle without hiding stars.',
      label: 'Twinkle Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    starsTwinkleSpeed: {
      description: 'Speed multiplier of the seeded per-star twinkle animation.',
      label: 'Twinkle Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    starsHorizonFade: {
      description: 'Altitude at which the star field reaches full brightness above the horizon.',
      label: 'Horizon Fade',
      range: { max: 1, min: 0.04, step: 0.01 },
      type: 'number',
    },
  },
});

function createSkyFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_SKY_SETTINGS[key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    integer: field.integer ?? false,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: field.serializable ?? true,
    type: field.type,
  });
}

/**
 * Field metadata (id/group/key/label/description/type/range/defaultValue/
 * serializable) per settings group, in the shape consumed by
 * `createSettingsPanel`. Keys are the flat {@link DEFAULT_SKY_SETTINGS} keys.
 */
export const SKY_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    SKY_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(SKY_FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createSkyFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

const SKY_FIELDS_BY_KEY = Object.freeze(Object.fromEntries(
  Object.values(SKY_SETTING_FIELD_SCHEMA)
    .flatMap((fields) => Object.entries(fields)),
));

function cleanSkyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeSkyPresetId(value) {
  return String(value ?? '').trim();
}

function collectTopLevelSkySettings(source) {
  const input = cleanSkyObject(source);
  return Object.fromEntries(
    Object.keys(SKY_FIELDS_BY_KEY)
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]]),
  );
}

function collectSkyPresetWarnings(settings = {}) {
  const warnings = [];
  for (const key of Object.keys(cleanSkyObject(settings))) {
    const field = SKY_FIELDS_BY_KEY[key];
    if (!field) warnings.push(`Unknown sky setting "${key}" was ignored.`);
    else if (!field.serializable) {
      warnings.push(`Sky setting "${key}" is construction-only and was not stored in the preset.`);
    }
  }
  return warnings;
}

/**
 * Normalizes a sky look into a complete, JSON-safe settings object. Runtime
 * construction state such as the dome radius is intentionally excluded.
 */
export function sanitizeSkyPresetSettings(settings = {}) {
  const knownSettings = collectTopLevelSkySettings(settings);
  const normalized = createSkySettings(knownSettings);
  return Object.fromEntries(
    Object.entries(SKY_FIELDS_BY_KEY)
      .filter(([, field]) => field.serializable)
      .map(([key]) => [key, normalized[key]]),
  );
}

function migrateSkyPresetDocument(input) {
  const source = cleanSkyObject(input);
  const numericVersion = Number(source.version ?? source.schemaVersion ?? 0);
  const version = Number.isFinite(numericVersion) ? Math.round(numericVersion) : 0;
  if (version > SKY_PRESET_SCHEMA_VERSION) return { ...source, version };
  const nestedSettings = cleanSkyObject(source.settings);
  return {
    description: source.description ?? '',
    id: source.id ?? source.name ?? source.preset ?? '',
    label: source.label ?? source.title ?? source.name ?? source.id ?? '',
    settings: Object.keys(nestedSettings).length > 0
      ? nestedSettings
      : collectTopLevelSkySettings(source),
    type: source.type ?? SKY_PRESET_DOCUMENT_TYPE,
    version: SKY_PRESET_SCHEMA_VERSION,
  };
}

/** Validates and normalizes a portable sky preset document. Never throws. */
export function validateSkyPresetDocument(input) {
  if (cleanSkyObject(input).type !== undefined && input.type !== SKY_PRESET_DOCUMENT_TYPE) {
    return {
      errors: [`Sky preset type must be "${SKY_PRESET_DOCUMENT_TYPE}".`],
      ok: false,
      value: null,
      warnings: [],
    };
  }
  return validateSettingsPresetDocument(input, {
    collectWarnings: collectSkyPresetWarnings,
    documentType: SKY_PRESET_DOCUMENT_TYPE,
    migrateDocument: migrateSkyPresetDocument,
    normalizeId: normalizeSkyPresetId,
    sanitizeSettings: sanitizeSkyPresetSettings,
    schemaVersion: SKY_PRESET_SCHEMA_VERSION,
  });
}

/** Parses JSON text or an object into a validated sky preset document. */
export function parseSkyPresetDocument(input) {
  return parsePresetDocument(input, validateSkyPresetDocument, {
    invalidJsonLabel: 'sky preset',
  });
}

/** Creates a canonical, versioned sky preset document. */
export function createSkyPresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => source.settings ?? collectTopLevelSkySettings(source),
    documentType: SKY_PRESET_DOCUMENT_TYPE,
    schemaVersion: SKY_PRESET_SCHEMA_VERSION,
    validateDocument: validateSkyPresetDocument,
  });
}

/** Serializes a sky preset id/definition or document-like object as JSON. */
export function serializeSkyPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createSkyPresetDocument,
    pretty,
  });
}

/** Registers a portable preset document, overwriting an existing id by default. */
export function registerSerializedSkyPreset(input, options = {}) {
  const result = parseSkyPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerSkyPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

// Keep the historical ids stable, then provide distinct looks that are useful
// as authoring starting points rather than aliases for the same daytime sky.
registerSkyPreset('default', {
  description: 'Baseline stylized daytime sky.',
  label: 'Default',
});

registerSkyPreset('call_me_sensei', {
  description: 'Studio-managed signature sky, curated by Call Me Sensei and updated over releases.',
  label: 'Call Me Sensei',
  settings: {
    cloudCoverage: 0.36,
    cloudScale: 1.45,
    cloudSeed: 7,
    cloudSoftness: 0.12,
    horizonScattering: 0.56,
    sunGlowStrength: 1.1,
    zenithColor: [0.24, 0.52, 0.92],
  },
});

registerSkyPreset('clear_day', {
  description: 'Crisp blue daylight with sparse, slow-moving clouds.',
  label: 'Clear Day',
  settings: {
    cloudCoverage: 0.12,
    cloudEdgeOpacity: 0.48,
    cloudScale: 1.9,
    cloudSeed: 12,
    cloudSoftness: 0.075,
    cloudSpeed: 0.65,
    horizonColor: [0.76, 0.93, 1.0],
    horizonScattering: 0.42,
    sunGlowStrength: 1.15,
    zenithColor: [0.2, 0.52, 0.95],
  },
});

registerSkyPreset('golden_hour', {
  description: 'Low warm sun, peach horizon, and softly lit evening clouds.',
  label: 'Golden Hour',
  settings: {
    cloudColor: [1.0, 0.78, 0.6],
    cloudCoverage: 0.34,
    cloudProjection: 0.28,
    cloudSeed: 47,
    cloudShadeColor: [0.58, 0.38, 0.52],
    cloudSilverLiningStrength: 0.62,
    groundColor: [0.3, 0.22, 0.28],
    horizonColor: [1.0, 0.55, 0.28],
    horizonScattering: 0.76,
    starsStrength: 0.04,
    sunColor: [1.0, 0.62, 0.3],
    sunDirection: [0.76, 0.18, 0.36],
    sunGlowStrength: 1.85,
    sunGlowSpread: 3.8,
    sunDiscIntensity: 3.0,
    sunSize: 0.036,
    zenithColor: [0.22, 0.36, 0.68],
  },
});

registerSkyPreset('overcast', {
  description: 'Dense cool cloud cover with broad, low-contrast daylight.',
  label: 'Overcast',
  settings: {
    cloudColor: [0.78, 0.83, 0.9],
    cloudCoverage: 0.88,
    cloudEdgeOpacity: 0.82,
    cloudScale: 1.2,
    cloudSeed: 88,
    cloudShadeColor: [0.42, 0.5, 0.62],
    cloudShadeSoftness: 0.1,
    cloudSoftness: 0.17,
    cloudSpeed: 0.72,
    groundColor: [0.3, 0.35, 0.42],
    horizonColor: [0.62, 0.7, 0.78],
    horizonScattering: 0.72,
    sunColor: [0.82, 0.88, 1.0],
    sunGlowStrength: 0.16,
    sunSize: 0.018,
    zenithColor: [0.38, 0.49, 0.62],
  },
});

registerSkyPreset('moonlit', {
  description: 'Deep blue night with a cool moon glow, quiet clouds, and bright stars.',
  label: 'Moonlit Night',
  settings: {
    cloudColor: [0.2, 0.27, 0.42],
    cloudCoverage: 0.28,
    cloudSeed: 31,
    cloudShadeColor: [0.06, 0.08, 0.17],
    cloudSpeed: 0.35,
    groundColor: [0.015, 0.02, 0.05],
    horizonColor: [0.09, 0.14, 0.25],
    horizonScattering: 0.25,
    starsStrength: 1.1,
    starsColor: [0.72, 0.82, 1.0],
    starsDensity: 0.42,
    starsScale: 18,
    starsSeed: 173,
    starsSize: 0.045,
    starsTwinkleStrength: 0.9,
    sunColor: [0.58, 0.7, 1.0],
    sunDirection: [-0.45, 0.6, 0.3],
    sunGlowStrength: 0.38,
    sunSize: 0.018,
    zenithColor: [0.015, 0.035, 0.11],
  },
});

function setSrgbColorUniform(uniform, rgb) {
  uniform.value.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

export function applySkySettingsToMaterial(material, options = {}) {
  // Both backends expose `.uniforms` under the same names: ShaderMaterial
  // natively, the TSL factory via same-name UniformNodes (`.value` on both).
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  const source = cleanSkyObject(options);
  const settings = createSkySettings({
    ...(source.preset === undefined ? cleanSkyObject(material.userData?.skySettings) : {}),
    ...source,
  });
  setSrgbColorUniform(uniforms.uZenithColor, settings.zenithColor);
  setSrgbColorUniform(uniforms.uHorizonColor, settings.horizonColor);
  setSrgbColorUniform(uniforms.uGroundColor, settings.groundColor);
  uniforms.uZenithExponent.value = settings.zenithExponent;
  uniforms.uGroundExponent.value = settings.groundExponent;
  uniforms.uHorizonBandSize.value = settings.horizonBandSize;
  uniforms.uHorizonSunPower.value = settings.horizonSunPower;
  uniforms.uSunDirection.value.set(...settings.sunDirection).normalize();
  setSrgbColorUniform(uniforms.uSunColor, settings.sunColor);
  uniforms.uSunSize.value = settings.sunSize;
  uniforms.uSunDiscSoftness.value = settings.sunDiscSoftness;
  uniforms.uSunDiscIntensity.value = settings.sunDiscIntensity;
  uniforms.uSunGlowStrength.value = settings.sunGlowStrength;
  uniforms.uSunGlowSpread.value = settings.sunGlowSpread;
  uniforms.uSunGlowCoreSharpness.value = settings.sunGlowCoreSharpness;
  uniforms.uSunGlowBroadStrength.value = settings.sunGlowBroadStrength;
  uniforms.uSunGlowCoreStrength.value = settings.sunGlowCoreStrength;
  uniforms.uSunCloudOcclusionStrength.value = settings.sunCloudOcclusionStrength;
  uniforms.uHorizonScattering.value = settings.horizonScattering;
  uniforms.uCloudCoverage.value = settings.cloudCoverage;
  uniforms.uCloudScale.value = settings.cloudScale;
  uniforms.uCloudSpeed.value = settings.cloudSpeed;
  uniforms.uCloudDirection.value.set(...settings.cloudDirection);
  uniforms.uCloudSeed.value = settings.cloudSeed;
  uniforms.uCloudProjection.value = settings.cloudProjection;
  uniforms.uCloudSoftness.value = settings.cloudSoftness;
  uniforms.uCloudEdgeOpacity.value = settings.cloudEdgeOpacity;
  uniforms.uCloudOpacity.value = settings.cloudOpacity;
  uniforms.uCloudShadeStrength.value = settings.cloudShadeStrength;
  uniforms.uCloudShadeThreshold.value = settings.cloudShadeThreshold;
  uniforms.uCloudShadeSoftness.value = settings.cloudShadeSoftness;
  uniforms.uCloudLightOffset.value = settings.cloudLightOffset;
  uniforms.uCloudSilverLiningStrength.value = settings.cloudSilverLiningStrength;
  uniforms.uCloudSunPower.value = settings.cloudSunPower;
  uniforms.uCloudHorizonFade.value = settings.cloudHorizonFade;
  setSrgbColorUniform(uniforms.uCloudColor, settings.cloudColor);
  setSrgbColorUniform(uniforms.uCloudShadeColor, settings.cloudShadeColor);
  uniforms.uStarsStrength.value = settings.starsStrength;
  setSrgbColorUniform(uniforms.uStarsColor, settings.starsColor);
  uniforms.uStarsSeed.value = settings.starsSeed;
  uniforms.uStarsScale.value = settings.starsScale;
  uniforms.uStarsDensity.value = settings.starsDensity;
  uniforms.uStarsSize.value = settings.starsSize;
  uniforms.uStarsTwinkleStrength.value = settings.starsTwinkleStrength;
  uniforms.uStarsTwinkleSpeed.value = settings.starsTwinkleSpeed;
  uniforms.uStarsHorizonFade.value = settings.starsHorizonFade;
  material.userData.skySettings = settings;
  return material;
}

export function createSkyMaterial(options = {}) {
  return applySkySettingsToMaterial(
    createSkyNodeMaterial({ quality: options?.quality }),
    options,
  );
}

export class StylizedSky extends THREE.Mesh {
  /**
   * @param {Object} [options] Flat sky settings (see
   *   {@link DEFAULT_SKY_SETTINGS}); legacy individual constructor options
   *   are the same keys, so existing callers keep working unchanged.
   */
  constructor(options = {}) {
    const settings = createSkySettings(options);
    const quality = resolveSkyQuality(options?.quality);
    super(
      new THREE.SphereGeometry(settings.radius, 48, 24),
      createSkyMaterial({ ...settings, quality }),
    );
    this.name = 'StylizedSky';
    this.frustumCulled = false;
    this.renderOrder = -100;
    this._authoredSettings = settings;
    this._quality = quality;
    this._retiredMaterials = [];
    this._sceneOverrideLayers = new Map();
    this._sceneOverrideSequence = 0;
    this._sceneOverrides = {};
  }

  get settings() {
    return this._authoredSettings;
  }

  /** Current compile-time deployment tier; not part of the authored preset. */
  get quality() {
    return this._quality;
  }

  /** The settings currently uploaded after transient scene overrides. */
  get renderedSettings() {
    return this.material.userData.skySettings;
  }

  /** Current transient scene overrides, kept separate from authored settings. */
  get sceneOverrides() {
    return structuredClone(this._sceneOverrides);
  }

  /** Ordered runtime layer metadata, without exposing mutable resolvers. */
  get sceneOverrideLayers() {
    return [...this._sceneOverrideLayers.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((layer) => ({ id: layer.id, priority: layer.priority }));
  }

  _composeSceneSettings() {
    let composed = createSkySettings(this._authoredSettings);
    const layers = [...this._sceneOverrideLayers.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (const layer of layers) {
      const source = layer.resolve
        ? layer.resolve(structuredClone(composed))
        : layer.settings;
      const next = collectTopLevelSkySettings(source);
      delete next.radius;
      composed = createSkySettings({ ...composed, ...next });
    }
    return composed;
  }

  _applyComposedSceneSettings() {
    const composed = this._composeSceneSettings();
    this._sceneOverrides = Object.fromEntries(
      Object.keys(SKY_FIELDS_BY_KEY)
        .filter((key) => key !== 'radius')
        .filter((key) => JSON.stringify(composed[key]) !== JSON.stringify(this._authoredSettings[key]))
        .map((key) => [key, composed[key]]),
    );
    applySkySettingsToMaterial(this.material, composed);
    return this.renderedSettings;
  }

  /**
   * Runtime re-tune: merges `options` into the current settings and pushes
   * every value into the material uniforms. `radius` is construction-only
   * (baked into the dome geometry); a new value is stored but the dome is
   * not rebuilt.
   *
   * @param {Object} [options] Partial flat settings, same keys as
   *   {@link DEFAULT_SKY_SETTINGS}.
   * @returns {Object} The updated settings object.
   */
  applySettings(options = {}) {
    if (cleanSkyObject(options).preset !== undefined) {
      const { preset, ...overrides } = options;
      return this.setPreset(preset, overrides);
    }
    this._authoredSettings = createSkySettings({ ...this._authoredSettings, ...options });
    this._applyComposedSceneSettings();
    return this.settings;
  }

  /** Replaces the authored look from a registered preset, then recomposes runtime layers. */
  setPreset(name, overrides = {}) {
    this._authoredSettings = createSkySettings({ preset: name, ...cleanSkyObject(overrides) });
    this._applyComposedSceneSettings();
    return this.settings;
  }

  /**
   * Adds or replaces one transient world-state layer. A resolver receives the
   * result of all lower-priority layers, which lets Weather tint the current
   * Lighting time-of-day instead of competing with it.
   */
  setSceneOverrideLayer(id, optionsOrResolver = {}, {
    priority = SKY_SCENE_OVERRIDE_PRIORITIES.scene,
    replace = true,
  } = {}) {
    if ((typeof id !== 'string' || id.length === 0) && typeof id !== 'symbol') {
      throw new TypeError('A sky scene override layer needs a non-empty string or Symbol id.');
    }
    const existing = this._sceneOverrideLayers.get(id);
    const resolve = typeof optionsOrResolver === 'function' ? optionsOrResolver : null;
    let settings = null;
    if (!resolve) {
      const next = collectTopLevelSkySettings(optionsOrResolver);
      delete next.radius;
      settings = !replace && existing?.settings
        ? { ...existing.settings, ...next }
        : next;
    }
    this._sceneOverrideLayers.set(id, {
      id,
      order: existing?.order ?? this._sceneOverrideSequence++,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : SKY_SCENE_OVERRIDE_PRIORITIES.scene,
      resolve,
      settings,
    });
    return this._applyComposedSceneSettings();
  }

  /** Removes one runtime owner without disturbing any other active layer. */
  clearSceneOverrideLayer(id) {
    if (!this._sceneOverrideLayers.delete(id)) return this.renderedSettings;
    return this._applyComposedSceneSettings();
  }

  /**
   * Applies transient Lighting/Weather/world-state inputs without modifying
   * the authored sky preset returned by {@link settings}.
   */
  setSceneOverrides(options = {}, { replace = false } = {}) {
    return this.setSceneOverrideLayer('scene', options, {
      priority: SKY_SCENE_OVERRIDE_PRIORITIES.scene,
      replace,
    });
  }

  /** Clears only the compatibility/manual `scene` layer. */
  clearSceneOverrides() {
    return this.clearSceneOverrideLayer('scene');
  }

  /** Explicit full teardown for hosts that own every runtime Sky layer. */
  clearAllSceneOverrideLayers() {
    this._sceneOverrideLayers.clear();
    return this._applyComposedSceneSettings();
  }

  /** Rebuilds only the material graph for a new deployment-quality tier. */
  setQuality(value) {
    const quality = resolveSkyQuality(value);
    if (quality.cloudOctaves === this._quality.cloudOctaves) return this;
    const previous = this.material;
    const elapsed = previous.uniforms?.uTime?.value ?? 0;
    this._quality = quality;
    this.material = createSkyMaterial({ ...this.renderedSettings, quality });
    this.material.uniforms.uTime.value = elapsed;
    // WebGPU submission is asynchronous. Disposing the old graph here can
    // destroy binding buffers still referenced by the command buffer already
    // in flight. Quality changes are rare deployment/lab actions, so retain
    // replaced graphs and release them with the Sky object at safe teardown.
    this._retiredMaterials.push(previous);
    return this;
  }

  // Advances cloud/star animation and keeps the dome centered on the camera.
  update(delta, camera) {
    this.material.uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    if (camera) camera.getWorldPosition(this.position);
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    for (const material of this._retiredMaterials) material.dispose();
    this._retiredMaterials.length = 0;
  }
}
