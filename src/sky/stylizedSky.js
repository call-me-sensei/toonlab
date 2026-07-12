import * as THREE from 'three';

import { createSkyNodeMaterial } from '../shaders-tsl/sky.js';

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
  sunGlowStrength: 1.0,
  horizonScattering: 0.5,
  cloudCoverage: 0.42,
  cloudScale: 1.6,
  cloudSpeed: 1.0,
  cloudColor: [1.0, 1.0, 1.0],
  cloudShadeColor: [0.68, 0.78, 0.92],
  starsStrength: 0.0,
});

// Named sky presets: 'default' is the baseline; 'call_me_sensei' is the
// studio-managed signature look, curated and updated over releases.
// Community presets register alongside them via registerSkyPreset().
const skyPresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline daytime sky.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature sky, curated by Call Me Sensei and updated over releases. Currently the tuned library defaults.',
    label: 'Call Me Sensei',
    settings: Object.freeze({}),
  })],
]);

/**
 * Registers a named sky preset so it resolves in `createSkySettings({
 * preset })` exactly like the built-ins. Accepts `{ label?, description?,
 * settings? }` or flat settings.
 */
export function registerSkyPreset(name, preset = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('Sky preset name is required.');
  if (!overwrite && skyPresetRegistry.has(id)) {
    throw new Error(`Sky preset "${id}" already exists.`);
  }
  const source = preset && typeof preset === 'object' ? preset : {};
  const { label, description, settings, ...flat } = source;
  const entry = Object.freeze({
    description: typeof description === 'string' ? description : '',
    label: typeof label === 'string' && label ? label : id,
    settings: Object.freeze({ ...(settings && typeof settings === 'object' ? settings : flat) }),
  });
  skyPresetRegistry.set(id, entry);
  return { description: entry.description, id, label: entry.label };
}

/** Lists registered sky presets as `{ id, label, description }` (for HUDs). */
export function getSkyPresetOptions() {
  return Array.from(skyPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const source = options && typeof options === 'object' ? options : {};
  const presetSettings = skyPresetRegistry.get(source.preset)?.settings;
  const base = presetSettings ? { ...DEFAULT_SKY_SETTINGS, ...presetSettings } : DEFAULT_SKY_SETTINGS;
  return {
    radius: Math.max(finiteNumber(source.radius, base.radius), 0.1),
    zenithColor: colorArray(source.zenithColor, base.zenithColor),
    horizonColor: colorArray(source.horizonColor, base.horizonColor),
    groundColor: colorArray(source.groundColor, base.groundColor),
    sunDirection: vector3Array(source.sunDirection, base.sunDirection),
    sunColor: colorArray(source.sunColor, base.sunColor),
    sunSize: finiteNumber(source.sunSize, base.sunSize),
    sunGlowStrength: finiteNumber(source.sunGlowStrength, base.sunGlowStrength),
    horizonScattering: finiteNumber(source.horizonScattering, base.horizonScattering),
    cloudCoverage: finiteNumber(source.cloudCoverage, base.cloudCoverage),
    cloudScale: finiteNumber(source.cloudScale, base.cloudScale),
    cloudSpeed: finiteNumber(source.cloudSpeed, base.cloudSpeed),
    cloudColor: colorArray(source.cloudColor, base.cloudColor),
    cloudShadeColor: colorArray(source.cloudShadeColor, base.cloudShadeColor),
    starsStrength: finiteNumber(source.starsStrength, base.starsStrength),
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
    horizonScattering: {
      description: 'How far the bright horizon band bleeds up into the sky.',
      label: 'Horizon Scattering',
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
    sunGlowStrength: {
      description: 'Intensity of the soft glow halo around the sun disc.',
      label: 'Sun Glow Strength',
      range: { max: 4, min: 0, step: 0.01 },
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
    cloudSpeed: {
      description: 'How fast clouds drift across the dome.',
      label: 'Cloud Speed',
      range: { max: 4, min: 0, step: 0.01 },
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
  },
  stars: {
    starsStrength: {
      description: 'Brightness of the procedural star field. 0 (default) hides stars for daytime skies.',
      label: 'Stars Strength',
      range: { max: 2, min: 0, step: 0.01 },
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

function setSrgbColorUniform(uniform, rgb) {
  uniform.value.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

export function applySkySettingsToMaterial(material, options = {}) {
  // Both backends expose `.uniforms` under the same names: ShaderMaterial
  // natively, the TSL factory via same-name UniformNodes (`.value` on both).
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  const settings = createSkySettings(options);
  setSrgbColorUniform(uniforms.uZenithColor, settings.zenithColor);
  setSrgbColorUniform(uniforms.uHorizonColor, settings.horizonColor);
  setSrgbColorUniform(uniforms.uGroundColor, settings.groundColor);
  uniforms.uSunDirection.value.set(...settings.sunDirection).normalize();
  setSrgbColorUniform(uniforms.uSunColor, settings.sunColor);
  uniforms.uSunSize.value = settings.sunSize;
  uniforms.uSunGlowStrength.value = settings.sunGlowStrength;
  uniforms.uHorizonScattering.value = settings.horizonScattering;
  uniforms.uCloudCoverage.value = settings.cloudCoverage;
  uniforms.uCloudScale.value = settings.cloudScale;
  uniforms.uCloudSpeed.value = settings.cloudSpeed;
  setSrgbColorUniform(uniforms.uCloudColor, settings.cloudColor);
  setSrgbColorUniform(uniforms.uCloudShadeColor, settings.cloudShadeColor);
  uniforms.uStarsStrength.value = settings.starsStrength;
  material.userData.skySettings = settings;
  return material;
}

export function createSkyMaterial(options = {}) {
  return applySkySettingsToMaterial(createSkyNodeMaterial(), options);
}

export class StylizedSky extends THREE.Mesh {
  /**
   * @param {Object} [options] Flat sky settings (see
   *   {@link DEFAULT_SKY_SETTINGS}); legacy individual constructor options
   *   are the same keys, so existing callers keep working unchanged.
   */
  constructor(options = {}) {
    const settings = createSkySettings(options);
    super(new THREE.SphereGeometry(settings.radius, 48, 24), createSkyMaterial(settings));
    this.name = 'StylizedSky';
    this.frustumCulled = false;
    this.renderOrder = -100;
  }

  get settings() {
    return this.material.userData.skySettings;
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
    applySkySettingsToMaterial(this.material, { ...this.settings, ...options });
    return this.settings;
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
  }
}
