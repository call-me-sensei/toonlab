import { resolveLightColor } from './colorIntensity.js';
import { createLightingRecipe } from './lightingDocuments.js';
import { cloneJson, finite, isPlainObject } from './utils.js';

export const UNREAL_LIGHTING_MANIFEST_TYPE = 'toonlab/unreal-lighting-manifest';
export const UNREAL_LIGHTING_MANIFEST_SCHEMA_VERSION = 1;

const UNREAL_CLASS_BY_TYPE = Object.freeze({
  ambient: 'SkyLight',
  directional: 'DirectionalLight',
  discArea: 'RectLight',
  hemisphere: 'SkyLight',
  point: 'PointLight',
  rectArea: 'RectLight',
  spot: 'SpotLight',
  tubeArea: 'RectLight',
});

const LOCAL_TYPES = new Set(['point', 'spot', 'rectArea', 'discArea', 'tubeArea']);

function normalizeIntent(value, fallback = 'prefer') {
  if (value === true) return 'prefer';
  if (value === false) return 'disabled';
  return ['disabled', 'prefer', 'require'].includes(value) ? value : fallback;
}

/** Converts Three.js Y-up meters to Unreal Z-up centimeters. */
export function threePositionToUnreal(position, worldScale = 100) {
  const [x = 0, y = 0, z = 0] = Array.isArray(position) ? position.map(Number) : [];
  const scale = Math.max(finite(worldScale, 100), 0.001);
  return [-z * scale, x * scale, y * scale];
}

function directionFromPoints(position, target) {
  const start = threePositionToUnreal(position, 1);
  const end = threePositionToUnreal(target, 1);
  const direction = end.map((value, index) => value - start[index]);
  const length = Math.hypot(...direction) || 1;
  return direction.map((value) => value / length);
}

function intensityMapping(descriptor) {
  const nativeUnits = {
    directional: ['lux'],
    discArea: ['lumens', 'candela', 'ev'],
    point: ['lumens', 'candela', 'ev'],
    rectArea: ['lumens', 'candela', 'ev'],
    spot: ['lumens', 'candela', 'ev'],
    tubeArea: ['lumens', 'candela', 'ev'],
  }[descriptor.type] ?? ['unitless'];
  return {
    artisticMultiplier: descriptor.intensity.artisticMultiplier,
    conversionRequired: !nativeUnits.includes(descriptor.intensity.unit),
    nativeUnitOptions: nativeUnits,
    referenceDistanceMeters: descriptor.intensity.referenceDistance,
    sourceUnit: descriptor.intensity.unit,
    sourceValue: descriptor.intensity.value,
  };
}

function mapLight(descriptor, options) {
  const isLocal = LOCAL_TYPES.has(descriptor.type);
  const warnings = [];
  if (descriptor.type === 'ambient') warnings.push('AmbientLight maps approximately to a SkyLight intensity contribution.');
  if (descriptor.type === 'hemisphere') warnings.push('HemisphereLight maps approximately to SkyLight upper/lower hemisphere settings.');
  if (descriptor.type === 'discArea') warnings.push('Disc shape intent requires adapter-side RectLight/source-shape tuning.');
  if (descriptor.type === 'tubeArea') warnings.push('Tube shape intent requires adapter-side RectLight/source-width tuning.');
  if (descriptor.cookie) warnings.push('Cookie reference requires generation or assignment of an Unreal Light Function material.');
  if (descriptor.layers.some((layer) => layer > 2)) warnings.push('Unreal exposes only three standard Lighting Channels; higher Three.js layers need adapter policy.');

  return {
    color: {
      resolvedSrgb: resolveLightColor(descriptor.color),
      temperatureKelvin: descriptor.color.temperatureKelvin,
      tint: cloneJson(descriptor.color.tint),
      useTemperature: descriptor.color.temperatureKelvin !== null,
    },
    enabled: descriptor.enabled,
    id: descriptor.id,
    intensity: intensityMapping(descriptor),
    lightFunction: descriptor.cookie ? cloneJson(descriptor.cookie) : null,
    lightLinking: {
      excludeTags: cloneJson(descriptor.linking.excludeTags),
      includeTags: cloneJson(descriptor.linking.includeTags),
      lightingChannels: [0, 1, 2].map((channel) => descriptor.layers.includes(channel)),
    },
    megaLights: {
      eligibleIntent: isLocal,
      requested: options.megaLights !== 'disabled' && isLocal,
      validation: isLocal ? 'Validate material, translucency, and platform support in Unreal.' : 'Not a local-light MegaLights mapping.',
    },
    name: descriptor.name,
    photometricProfile: descriptor.ies ? cloneJson(descriptor.ies) : null,
    shape: {
      angleRadians: descriptor.angle,
      attenuationRadiusMeters: descriptor.distance,
      decay: descriptor.decay,
      heightMeters: descriptor.height,
      penumbra: descriptor.penumbra,
      sourceIntent: descriptor.type,
      widthMeters: descriptor.width,
    },
    shadow: {
      bias: descriptor.shadow.bias,
      castShadow: descriptor.castShadow && descriptor.shadow.enabled,
      mapSizeIntent: descriptor.shadow.mapSize,
      normalBias: descriptor.shadow.normalBias,
      priority: descriptor.shadow.priority,
    },
    toon: cloneJson(descriptor.artistic),
    toonlabType: descriptor.type,
    transform: {
      direction: directionFromPoints(descriptor.position, descriptor.target),
      locationCm: threePositionToUnreal(descriptor.position, options.worldScale),
      targetCm: threePositionToUnreal(descriptor.target, options.worldScale),
    },
    unrealClass: UNREAL_CLASS_BY_TYPE[descriptor.type],
    warnings,
  };
}

/**
 * Exports a data-only Unreal Engine 5.8 handoff manifest.
 *
 * It does not generate `.uasset` files and does not implement MegaLights or
 * Lumen. An Unreal editor/plugin adapter must validate and realize the intent.
 */
export function exportLightingRecipeToUnreal58(recipeOptions, exportOptions = {}) {
  const recipe = createLightingRecipe(recipeOptions);
  const source = isPlainObject(exportOptions) ? exportOptions : {};
  const options = {
    lumen: normalizeIntent(source.lumen, 'prefer'),
    megaLights: normalizeIntent(source.megaLights, 'prefer'),
    worldScale: Math.max(finite(source.worldScale, 100), 0.001),
  };
  const lights = recipe.lights.map((descriptor) => mapLight(descriptor, options));
  const warnings = [
    'This manifest carries authoring intent only; Unreal must create and validate engine assets.',
    'MegaLights is an Unreal renderer feature, not implemented by ToonLab or this export.',
  ];
  if (options.megaLights !== 'disabled' && lights.every((light) => !light.megaLights.eligibleIntent)) {
    warnings.push('The recipe contains no local light types marked as MegaLights-eligible intent.');
  }

  return {
    coordinateSystem: {
      handedness: 'Unreal left-handed',
      mapping: 'UnrealXYZcm = [-ThreeZ, ThreeX, ThreeY] * worldScale',
      sourceUnits: 'meters',
      worldScale: options.worldScale,
    },
    engine: {
      name: 'Unreal Engine',
      targetVersion: '5.8',
    },
    lights,
    rendererIntent: {
      lumen: {
        intent: options.lumen,
        scope: 'global illumination and reflections',
      },
      megaLights: {
        implementation: 'unreal-native',
        intent: options.megaLights,
        scope: 'eligible local direct lights',
      },
    },
    schemaVersion: UNREAL_LIGHTING_MANIFEST_SCHEMA_VERSION,
    source: {
      recipeId: recipe.id,
      recipeName: recipe.name,
      recipeSchemaVersion: recipe.schemaVersion,
      shadowPolicy: cloneJson(recipe.shadowPolicy),
    },
    type: UNREAL_LIGHTING_MANIFEST_TYPE,
    warnings,
  };
}

/** Serializes a previously generated Unreal lighting manifest. */
export function serializeUnrealLightingManifest(manifest, { pretty = false } = {}) {
  if (!isPlainObject(manifest) || manifest.type !== UNREAL_LIGHTING_MANIFEST_TYPE) {
    throw new Error(`Unreal lighting manifest type must be "${UNREAL_LIGHTING_MANIFEST_TYPE}".`);
  }
  return JSON.stringify(manifest, null, pretty ? 2 : undefined);
}
