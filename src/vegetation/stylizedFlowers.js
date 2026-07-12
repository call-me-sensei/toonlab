import * as THREE from 'three';

import { createFlowerNodeMaterial } from '../shaders-tsl/flower.js';

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
 * Default flower-field settings. Every value equals the field's historical
 * hardcoded/constructor default, so `new StylizedFlowerField({ placements })`
 * renders identically to previous releases.
 */
export const DEFAULT_FLOWER_SETTINGS = Object.freeze({
  centerColor: Object.freeze([0.98, 0.8, 0.34]),
  petalColor: Object.freeze([1.0, 0.98, 0.92]),
  shadowStrength: 0.85,
  sizeRange: Object.freeze([0.045, 0.08]),
  windDirection: Object.freeze([1, 0.3]),
  windSpeed: 1.0,
  windStrength: 0.16,
});

/**
 * Validates, clamps, and merges partial flower options over
 * {@link DEFAULT_FLOWER_SETTINGS}. Unknown keys are ignored; malformed values
 * fall back to their defaults. `createFlowerSettings()` deep-equals the
 * defaults object.
 *
 * @param {Object} [options] Partial settings (legacy constructor options are
 *   the same flat shape, so they work unchanged).
 * @returns {Object} A complete, plain flower settings object.
 */
// Named flower presets: 'default' is the baseline; 'call_me_sensei' is the
// studio-managed signature look, curated and updated over releases.
// Community presets register alongside them via registerFlowerPreset().
const flowerPresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline meadow flowers.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature flowers, curated by Call Me Sensei and updated over releases. Currently the tuned library defaults.',
    label: 'Call Me Sensei',
    settings: Object.freeze({}),
  })],
]);

/**
 * Registers a named flower preset so it resolves in `createFlowerSettings({
 * preset })` exactly like the built-ins. Accepts `{ label?, description?,
 * settings? }` or flat settings.
 */
export function registerFlowerPreset(name, preset = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('Flower preset name is required.');
  if (!overwrite && flowerPresetRegistry.has(id)) {
    throw new Error(`Flower preset "${id}" already exists.`);
  }
  const { label, description, settings, ...flat } = cleanObject(preset);
  const entry = Object.freeze({
    description: typeof description === 'string' ? description : '',
    label: typeof label === 'string' && label ? label : id,
    settings: Object.freeze({ ...cleanObject(settings ?? flat) }),
  });
  flowerPresetRegistry.set(id, entry);
  return { description: entry.description, id, label: entry.label };
}

/** Lists registered flower presets as `{ id, label, description }` (for HUDs). */
export function getFlowerPresetOptions() {
  return Array.from(flowerPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

export function createFlowerSettings(options = {}) {
  const source = cleanObject(options);
  const presetSettings = flowerPresetRegistry.get(source.preset)?.settings;
  const base = presetSettings ? { ...DEFAULT_FLOWER_SETTINGS, ...presetSettings } : DEFAULT_FLOWER_SETTINGS;
  return {
    centerColor: colorArray(source.centerColor, base.centerColor),
    petalColor: colorArray(source.petalColor, base.petalColor),
    shadowStrength: finiteNumber(source.shadowStrength, base.shadowStrength, { min: 0, max: 1 }),
    sizeRange: vectorArray(source.sizeRange, base.sizeRange, 2),
    windDirection: vectorArray(source.windDirection, base.windDirection, 2),
    windSpeed: finiteNumber(source.windSpeed, base.windSpeed),
    windStrength: finiteNumber(source.windStrength, base.windStrength, { min: 0 }),
  };
}

/**
 * Panel group metadata for the flower settings, in display order. Settings
 * themselves stay flat; each group lists which flat keys it owns via
 * {@link FLOWER_SETTING_FIELD_SCHEMA}.
 */
export const FLOWER_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Random head sizes baked into the instance attributes when the field is built. Construction-only.',
    id: 'heads',
    label: 'Heads',
  }),
  Object.freeze({
    description: 'Wind sway shared with the surrounding grass so heads and blades move together.',
    id: 'wind',
    label: 'Wind',
  }),
  Object.freeze({
    description: 'Petal/center palette and scene-shadow darkening.',
    id: 'appearance',
    label: 'Appearance',
  }),
]);

const FLOWER_FIELD_DEFINITIONS = Object.freeze({
  heads: {
    sizeRange: {
      description: 'Min/max head size in meters for placements without an explicit size. Construction-only: baked into instance attributes.',
      label: 'Size Range',
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
      description: 'How fast the head sway oscillates.',
      label: 'Wind Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    windStrength: {
      description: 'How far flower heads bob with the wind.',
      label: 'Wind Strength',
      range: { max: 1, min: 0, step: 0.005 },
      type: 'number',
    },
  },
  appearance: {
    petalColor: {
      description: 'Petal color of the procedural daisies.',
      label: 'Petal Color',
      type: 'color',
    },
    centerColor: {
      description: 'Center-disc color of the procedural daisies.',
      label: 'Center Color',
      type: 'color',
    },
    shadowStrength: {
      description: 'How strongly renderer shadow maps darken flower heads.',
      label: 'Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
  },
});

function createFlowerFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_FLOWER_SETTINGS[key];
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
 * `createSettingsPanel`. Keys are the flat {@link DEFAULT_FLOWER_SETTINGS}
 * keys.
 */
export const FLOWER_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    FLOWER_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(FLOWER_FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createFlowerFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

// Procedural daisies scattered through a grass canopy: instanced billboard
// quads whose petals are drawn in the fragment shader. One draw call, no
// texture assets. Stems are implied — heads float at canopy height and the
// dense grass below sells the attachment.
//
//   const flowers = new StylizedFlowerField({
//     placements: spots.map((p) => ({ x: p.x, y: ground(p), z: p.z, headHeight: 0.4 })),
//   });
//   scene.add(flowers);
//   flowers.update(delta);                    // each frame
//   flowers.applySettings({ petalColor: [1, 0.9, 0.95] });
//
// Options are a flat settings object (see DEFAULT_FLOWER_SETTINGS) plus
// `placements`; legacy individual constructor options are the same keys, so
// existing callers keep working unchanged.
export class StylizedFlowerField extends THREE.Mesh {
  constructor(options = {}) {
    const { placements = [] } = cleanObject(options);
    const settings = createFlowerSettings(options);
    const { sizeRange } = settings;

    const quad = new THREE.PlaneGeometry(1, 1);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.attributes.position);
    geometry.setAttribute('uv', quad.attributes.uv);

    const count = Math.max(placements.length, 1);
    const origins = new Float32Array(count * 3);
    const infos = new Float32Array(count * 4);
    placements.forEach((placement, i) => {
      origins[i * 3] = placement.x ?? 0;
      origins[i * 3 + 1] = placement.y ?? 0;
      origins[i * 3 + 2] = placement.z ?? 0;
      infos[i * 4] = placement.size ??
        THREE.MathUtils.lerp(sizeRange[0], sizeRange[1], Math.random());
      infos[i * 4 + 1] = Math.random();
      infos[i * 4 + 2] = placement.headHeight ?? 0.3;
      infos[i * 4 + 3] = 0;
    });
    geometry.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute('iInfo', new THREE.InstancedBufferAttribute(infos, 4));
    geometry.instanceCount = placements.length;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const material = createFlowerNodeMaterial(settings);
    setSrgbColor(material.uniforms.uPetalColor.value, settings.petalColor);
    setSrgbColor(material.uniforms.uCenterColor.value, settings.centerColor);

    super(geometry, material);
    this.name = 'StylizedFlowerField';
    this.frustumCulled = false;
    this.receiveShadow = true;
    this.settings = settings;
  }

  /**
   * Runtime re-tune: merges `options` into the current settings and pushes
   * every material-driven value (wind, palette, shadow strength) into the
   * uniforms. `sizeRange` is baked into the instance attributes at
   * construction and is construction-only; a new value is stored but does not
   * resize existing heads.
   *
   * @param {Object} [options] Partial flat settings, same keys as
   *   {@link DEFAULT_FLOWER_SETTINGS}.
   * @returns {Object} The updated settings object.
   */
  applySettings(options = {}) {
    const merged = { ...this.settings };
    for (const [key, value] of Object.entries(cleanObject(options))) {
      if (value !== undefined) merged[key] = value;
    }
    const settings = createFlowerSettings(merged);
    this.settings = settings;

    const uniforms = this.material.uniforms;
    uniforms.uShadowStrength.value = settings.shadowStrength;
    uniforms.uWindDirection.value.set(settings.windDirection[0], settings.windDirection[1]);
    uniforms.uWindSpeed.value = settings.windSpeed;
    uniforms.uWindStrength.value = settings.windStrength;
    setSrgbColor(uniforms.uPetalColor.value, settings.petalColor);
    setSrgbColor(uniforms.uCenterColor.value, settings.centerColor);
    return this.settings;
  }

  setWind({ direction, speed, strength } = {}) {
    this.applySettings({
      windDirection: direction,
      windSpeed: speed,
      windStrength: strength,
    });
    return this;
  }

  update(delta) {
    this.material.uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
