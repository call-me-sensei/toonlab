import * as THREE from 'three';

import { createGrassNodeMaterial } from '../shaders-tsl/grass.js';

const pushScratch = new THREE.Vector3();

function setSrgbColor(color, rgb) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
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

function vectorArray(value, fallback, size) {
  const keys = ['x', 'y', 'z', 'w'];
  const read = (index) => {
    if (Array.isArray(value)) return Number(value[index]);
    if (value && typeof value === 'object') return Number(value[keys[index]]);
    return NaN;
  };
  const next = Array.from({ length: size }, (_, index) => read(index));
  return next.every(Number.isFinite) ? next : fallback.slice(0, size);
}

/**
 * Default grass-field settings. Every value equals the field's historical
 * hardcoded/constructor default, so `new StylizedGrassField({ placements })`
 * renders identically to previous releases.
 */
export const DEFAULT_GRASS_SETTINGS = Object.freeze({
  backlitStrength: 0.3,
  baseColor: Object.freeze([0.42, 0.68, 0.24]),
  bladeHeightRange: Object.freeze([0.16, 0.42]),
  bladeWidthRange: Object.freeze([0.05, 0.085]),
  cloudShadowCoverage: 0.45,
  cloudShadowScale: 0.012,
  cloudShadowStrength: 0,
  cloudShadowVelocity: Object.freeze([0.02, 0.006]),
  gustFrequency: 0.35,
  gustSpeed: 1.6,
  pushRadius: 0.9,
  shadowStrength: 0.9,
  shadowTint: Object.freeze([0.42, 0.47, 0.62]),
  skyColor: Object.freeze([0.62, 0.78, 0.95]),
  sunColor: Object.freeze([1.0, 0.96, 0.84]),
  sunDirection: Object.freeze([0.35, 0.72, 0.42]),
  tipColor: Object.freeze([0.74, 0.9, 0.42]),
  windDirection: Object.freeze([1, 0.3]),
  windSpeed: 1.0,
  windStrength: 0.16,
});

// Named grass presets: 'default' is the baseline; 'call_me_sensei' is the
// studio-managed signature look, curated and updated over releases.
// Community presets register alongside them via registerGrassPreset().
const grassPresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline meadow grass.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature grass, curated by Call Me Sensei and updated over releases. Currently the tuned library defaults.',
    label: 'Call Me Sensei',
    settings: Object.freeze({}),
  })],
]);

/**
 * Registers a named grass preset so it resolves in `createGrassSettings({
 * preset })` exactly like the built-ins. Accepts `{ label?, description?,
 * settings? }` or flat settings.
 */
export function registerGrassPreset(name, preset = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('Grass preset name is required.');
  if (!overwrite && grassPresetRegistry.has(id)) {
    throw new Error(`Grass preset "${id}" already exists.`);
  }
  const { label, description, settings, ...flat } = cleanObject(preset);
  const entry = Object.freeze({
    description: typeof description === 'string' ? description : '',
    label: typeof label === 'string' && label ? label : id,
    settings: Object.freeze({ ...cleanObject(settings ?? flat) }),
  });
  grassPresetRegistry.set(id, entry);
  return { description: entry.description, id, label: entry.label };
}

/** Lists registered grass presets as `{ id, label, description }` (for HUDs). */
export function getGrassPresetOptions() {
  return Array.from(grassPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

/**
 * Validates, clamps, and merges partial grass options over
 * {@link DEFAULT_GRASS_SETTINGS}. Unknown keys are ignored; malformed values
 * fall back to their defaults. `createGrassSettings()` deep-equals the
 * defaults object.
 *
 * @param {Object} [options] Partial settings (legacy constructor options are
 *   the same flat shape, so they work unchanged). `preset` resolves a
 *   registered preset under the overrides.
 * @returns {Object} A complete, plain grass settings object.
 */
export function createGrassSettings(options = {}) {
  const source = cleanObject(options);
  const presetSettings = grassPresetRegistry.get(source.preset)?.settings;
  const base = presetSettings ? { ...DEFAULT_GRASS_SETTINGS, ...presetSettings } : DEFAULT_GRASS_SETTINGS;
  return {
    backlitStrength: finiteNumber(source.backlitStrength, base.backlitStrength, { min: 0 }),
    baseColor: colorArray(source.baseColor, base.baseColor),
    bladeHeightRange: vectorArray(source.bladeHeightRange, base.bladeHeightRange, 2),
    bladeWidthRange: vectorArray(source.bladeWidthRange, base.bladeWidthRange, 2),
    cloudShadowCoverage: finiteNumber(source.cloudShadowCoverage, base.cloudShadowCoverage, { min: 0, max: 1 }),
    cloudShadowScale: finiteNumber(source.cloudShadowScale, base.cloudShadowScale, { min: 0.0001 }),
    cloudShadowStrength: finiteNumber(source.cloudShadowStrength, base.cloudShadowStrength, { min: 0, max: 1 }),
    cloudShadowVelocity: vectorArray(source.cloudShadowVelocity, base.cloudShadowVelocity, 2),
    gustFrequency: finiteNumber(source.gustFrequency, base.gustFrequency, { min: 0 }),
    gustSpeed: finiteNumber(source.gustSpeed, base.gustSpeed, { min: 0 }),
    pushRadius: finiteNumber(source.pushRadius, base.pushRadius, { min: 0 }),
    shadowStrength: finiteNumber(source.shadowStrength, base.shadowStrength, { min: 0, max: 1 }),
    shadowTint: colorArray(source.shadowTint, base.shadowTint),
    skyColor: colorArray(source.skyColor, base.skyColor),
    sunColor: colorArray(source.sunColor, base.sunColor),
    sunDirection: vectorArray(source.sunDirection, base.sunDirection, 3),
    tipColor: colorArray(source.tipColor, base.tipColor),
    windDirection: vectorArray(source.windDirection, base.windDirection, 2),
    windSpeed: finiteNumber(source.windSpeed, base.windSpeed),
    windStrength: finiteNumber(source.windStrength, base.windStrength, { min: 0 }),
  };
}

/**
 * Panel group metadata for the grass settings, in display order. Settings
 * themselves stay flat; each group lists which flat keys it owns via
 * {@link GRASS_SETTING_FIELD_SCHEMA}.
 */
export const GRASS_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Random blade dimensions baked into the instance attributes when the field is built. Construction-only.',
    id: 'blades',
    label: 'Blades',
  }),
  Object.freeze({
    description: 'Per-blade wind sway and the traveling gust bands that ripple across the field.',
    id: 'wind',
    label: 'Wind',
  }),
  Object.freeze({
    description: "The blades' own colors — the grass's identity, whatever the scene lighting does. Magical blue grass welcome.",
    id: 'palette',
    label: 'Palette',
  }),
  Object.freeze({
    description: 'How the blades RESPOND to scene light — e.g. the backlit glow on blades between the camera and the sun.',
    id: 'lighting',
    label: 'Lighting',
  }),
  Object.freeze({
    // Scene-owned uniforms: a game (or lab preview rig / weather system)
    // pushes these from its actual sun and sky every frame. They are NOT
    // part of a grass look — labs must not present them as shader settings.
    description: 'Wired from the scene at runtime: the active sun direction/color and sky color the blades respond to.',
    id: 'sceneLight',
    label: 'Scene Light',
    scene: true,
  }),
  Object.freeze({
    description: 'Scene-shadow darkening and the drifting procedural cloud shadows over the field.',
    id: 'shadows',
    label: 'Shadows',
  }),
  Object.freeze({
    description: 'Character push-away response around the push target.',
    id: 'interaction',
    label: 'Interaction',
  }),
]);

const GRASS_FIELD_DEFINITIONS = Object.freeze({
  blades: {
    bladeHeightRange: {
      description: 'Min/max blade height in meters for placements without an explicit height. Construction-only: baked into instance attributes.',
      label: 'Blade Height Range',
      type: 'vector2',
    },
    bladeWidthRange: {
      description: 'Min/max blade width in meters for placements without an explicit width. Construction-only: baked into instance attributes.',
      label: 'Blade Width Range',
      type: 'vector2',
    },
  },
  wind: {
    windDirection: {
      description: 'Horizontal (XZ) heading the wind blows toward. Magnitude does not matter; use wind strength for amplitude.',
      label: 'Wind Direction',
      type: 'vector2',
    },
    windSpeed: {
      description: 'How fast the per-blade sway oscillates.',
      label: 'Wind Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    windStrength: {
      description: 'How far blade tips bend with the wind.',
      label: 'Wind Strength',
      range: { max: 1, min: 0, step: 0.005 },
      type: 'number',
    },
    gustFrequency: {
      description: 'Spatial frequency of the traveling gust bands; higher packs gust waves closer together.',
      label: 'Gust Frequency',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    gustSpeed: {
      description: 'How fast gust bands travel across the field.',
      label: 'Gust Speed',
      range: { max: 6, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  palette: {
    baseColor: {
      description: 'Blade color at the root.',
      label: 'Base Color',
      type: 'color',
    },
    tipColor: {
      description: 'Blade color at the tip; blades gradient from base to tip.',
      label: 'Tip Color',
      type: 'color',
    },
  },
  lighting: {
    backlitStrength: {
      description: 'Translucent backlight boost when the camera looks toward the sun through the blades.',
      label: 'Backlit Strength',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  sceneLight: {
    sunDirection: {
      description: 'World-space direction toward the sun (normalized on apply). Match your main directional light.',
      label: 'Sun Direction',
      type: 'vector3',
    },
    sunColor: {
      description: 'Sunlight tint applied to lit blades.',
      label: 'Sun Color',
      type: 'color',
    },
    skyColor: {
      description: 'Ambient sky tint mixed into shaded blades.',
      label: 'Sky Color',
      type: 'color',
    },
  },
  shadows: {
    shadowStrength: {
      description: 'How strongly renderer shadow maps (trees, rocks, the character) darken blades.',
      label: 'Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    shadowTint: {
      description: 'Color a fully shadowed blade is multiplied by (cool and dark so grass matches the terrain shadow response).',
      label: 'Shadow Tint',
      type: 'color',
    },
    cloudShadowStrength: {
      description: 'How strongly drifting procedural cloud shadows darken the field. 0 disables the effect.',
      label: 'Cloud Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowCoverage: {
      description: 'Fraction of the field covered by cloud shadow at any moment.',
      label: 'Cloud Shadow Coverage',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowScale: {
      description: 'World-to-noise scale of the cloud shadow pattern; smaller values give larger cloud shapes.',
      label: 'Cloud Shadow Scale',
      range: { max: 0.1, min: 0.001, step: 0.001 },
      type: 'number',
    },
    cloudShadowVelocity: {
      description: 'Cloud shadow drift in noise-space units per second (world drift = velocity / scale).',
      label: 'Cloud Shadow Velocity',
      type: 'vector2',
    },
  },
  interaction: {
    pushRadius: {
      description: 'Radius in meters around the push target within which blades bend away.',
      label: 'Push Radius',
      range: { max: 3, min: 0, step: 0.01 },
      type: 'number',
    },
  },
});

function createGrassFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_GRASS_SETTINGS[key];
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
 * `createSettingsPanel`. Keys are the flat {@link DEFAULT_GRASS_SETTINGS}
 * keys.
 */
export const GRASS_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    GRASS_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(GRASS_FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createGrassFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

// Dense instanced grass: procedural tapered blades with wind sway and a
// push-away radius around a character. One draw call for the whole field;
// emitting is a one-time attribute fill, animation is entirely in the vertex
// shader. No texture assets.
//
//   const grass = new StylizedGrassField({
//     placements: points.map((p) => ({ x: p.x, y: terrainHeight(p), z: p.z })),
//   });
//   scene.add(grass);
//   grass.setPushTarget(characterObject3D);
//   grass.update(delta);                     // each frame
//   grass.applySettings({ windStrength: 0.3, cloudShadowStrength: 0.5 });
//
// Options are a flat settings object (see DEFAULT_GRASS_SETTINGS) plus
// `placements`; legacy individual constructor options are the same keys, so
// existing callers keep working unchanged.
export class StylizedGrassField extends THREE.Mesh {
  constructor(options = {}) {
    const { placements = [] } = cleanObject(options);
    const settings = createGrassSettings(options);
    const { bladeHeightRange, bladeWidthRange } = settings;

    const blade = new THREE.PlaneGeometry(1, 1, 1, 3);
    blade.translate(0, 0.5, 0);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = blade.index;
    geometry.setAttribute('position', blade.attributes.position);
    geometry.setAttribute('uv', blade.attributes.uv);

    const count = Math.max(placements.length, 1);
    const origins = new Float32Array(count * 3);
    const infos = new Float32Array(count * 4);
    placements.forEach((placement, i) => {
      origins[i * 3] = placement.x ?? 0;
      origins[i * 3 + 1] = placement.y ?? 0;
      origins[i * 3 + 2] = placement.z ?? 0;
      infos[i * 4] = placement.height ??
        THREE.MathUtils.lerp(bladeHeightRange[0], bladeHeightRange[1], Math.random());
      infos[i * 4 + 1] = placement.phase ?? Math.random();
      infos[i * 4 + 2] = placement.width ??
        THREE.MathUtils.lerp(bladeWidthRange[0], bladeWidthRange[1], Math.random());
      infos[i * 4 + 3] = Math.random() * Math.PI * 2;
    });
    geometry.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute('iInfo', new THREE.InstancedBufferAttribute(infos, 4));
    geometry.instanceCount = placements.length;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const material = createGrassNodeMaterial(settings);
    setSrgbColor(material.uniforms.uBaseColor.value, settings.baseColor);
    setSrgbColor(material.uniforms.uTipColor.value, settings.tipColor);
    setSrgbColor(material.uniforms.uSunColor.value, settings.sunColor);
    setSrgbColor(material.uniforms.uSkyColor.value, settings.skyColor);
    setSrgbColor(material.uniforms.uShadowTint.value, settings.shadowTint);

    super(geometry, material);
    this.name = 'StylizedGrassField';
    this.frustumCulled = false;
    this.receiveShadow = true;
    this.pushTarget = null;
    this.settings = settings;
  }

  /**
   * Runtime re-tune: merges `options` into the current settings and pushes
   * every material-driven value (wind, palette, sun, shadows, push radius)
   * into the uniforms. `bladeHeightRange` / `bladeWidthRange` are baked into
   * the instance attributes at construction and are construction-only; new
   * values are stored but do not reshape existing blades.
   *
   * @param {Object} [options] Partial flat settings, same keys as
   *   {@link DEFAULT_GRASS_SETTINGS}.
   * @returns {Object} The updated settings object.
   */
  applySettings(options = {}) {
    const merged = { ...this.settings };
    for (const [key, value] of Object.entries(cleanObject(options))) {
      if (value !== undefined) merged[key] = value;
    }
    const settings = createGrassSettings(merged);
    this.settings = settings;

    const uniforms = this.material.uniforms;
    uniforms.uShadowStrength.value = settings.shadowStrength;
    uniforms.uWindDirection.value.set(settings.windDirection[0], settings.windDirection[1]);
    uniforms.uWindSpeed.value = settings.windSpeed;
    uniforms.uWindStrength.value = settings.windStrength;
    uniforms.uGustFrequency.value = settings.gustFrequency;
    uniforms.uGustSpeed.value = settings.gustSpeed;
    uniforms.uPushRadius.value = settings.pushRadius;
    uniforms.uBacklitStrength.value = settings.backlitStrength;
    uniforms.uCloudShadowStrength.value = settings.cloudShadowStrength;
    uniforms.uCloudShadowCoverage.value = settings.cloudShadowCoverage;
    uniforms.uCloudShadowScale.value = settings.cloudShadowScale;
    uniforms.uCloudShadowVelocity.value.set(
      settings.cloudShadowVelocity[0], settings.cloudShadowVelocity[1]);
    uniforms.uSunDirection.value.set(...settings.sunDirection).normalize();
    setSrgbColor(uniforms.uBaseColor.value, settings.baseColor);
    setSrgbColor(uniforms.uTipColor.value, settings.tipColor);
    setSrgbColor(uniforms.uSunColor.value, settings.sunColor);
    setSrgbColor(uniforms.uSkyColor.value, settings.skyColor);
    setSrgbColor(uniforms.uShadowTint.value, settings.shadowTint);
    return this.settings;
  }

  setWind({ direction, speed, strength, gustFrequency, gustSpeed } = {}) {
    this.applySettings({
      gustFrequency,
      gustSpeed,
      windDirection: direction,
      windSpeed: speed,
      windStrength: strength,
    });
    return this;
  }

  setSun({ direction, color, sky } = {}) {
    this.applySettings({
      skyColor: sky,
      sunColor: color,
      sunDirection: direction,
    });
    return this;
  }

  // Scene-shadow response: strength lerps the renderer shadow mask, tint is
  // the color a fully shadowed blade is multiplied by.
  setSceneShadow({ strength, tint } = {}) {
    this.applySettings({
      shadowStrength: strength,
      shadowTint: tint,
    });
    return this;
  }

  // Drifting procedural cloud shadows over the field. strength 0 disables.
  // velocity is uv-space drift per second (worldDrift = velocity / scale).
  setCloudShadow({ strength, coverage, scale, velocity } = {}) {
    this.applySettings({
      cloudShadowCoverage: coverage,
      cloudShadowScale: scale,
      cloudShadowStrength: strength,
      cloudShadowVelocity: velocity,
    });
    return this;
  }

  // Collapse blades between start and end meters from the camera so distant,
  // fog-swallowed grass stops costing fill rate. Pass nothing to disable.
  setDistanceFade({ start = 1e6, end } = {}) {
    const uniforms = this.material.uniforms;
    uniforms.uFadeStart.value = start;
    uniforms.uFadeEnd.value = Number.isFinite(end) ? Math.max(end, start + 0.01) : start + 1;
    return this;
  }

  // target: Object3D | (outVector3) => position | { x, y, z } | null.
  setPushTarget(target) {
    this.pushTarget = target;
    return this;
  }

  update(delta) {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    const target = this.pushTarget;
    if (!target) {
      uniforms.uPushPosition.value.set(0, -1e5, 0);
    } else if (typeof target === 'function') {
      const resolved = target(pushScratch);
      if (resolved && Number.isFinite(resolved.x)) uniforms.uPushPosition.value.copy(resolved);
    } else if (target.isObject3D) {
      uniforms.uPushPosition.value.copy(target.getWorldPosition(pushScratch));
    } else if (Number.isFinite(target.x)) {
      uniforms.uPushPosition.value.set(target.x, target.y ?? 0, target.z ?? 0);
    }
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
