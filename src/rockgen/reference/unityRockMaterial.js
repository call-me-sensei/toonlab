// Exact material-input reconstruction of So Stylized Unity's S_Rock Shader Graph.
//
// This is intentionally separate from referenceSourceMaterial.js. The Unity and
// Unreal packages share art direction and source textures, but their rock graphs,
// material values, distance metrics, and PBR attribute semantics are not identical.

import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearMipmapNearestFilter,
  MirroredRepeatWrapping,
  NearestFilter,
  NearestMipmapNearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  TBNViewMatrix,
  abs,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  cos,
  distance,
  dot,
  float,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  positionWorld,
  pow,
  sin,
  step,
  texture,
  transformNormalByViewMatrix,
  transpose,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import {
  applySoStylizedUnityNormalStrengthNode as unityNormalStrength,
  createSoStylizedUnityNormalIntegrationMetadata,
  decodeSoStylizedUnityNormalNode as decodeUnityNormal,
} from '../../environment/soStylizedUnityNormalIntegration.js';
import {
  SURFACE_MATERIAL_MODE,
  registerSurfaceMaterialMode,
} from '../../environment/surfaceMaterialModes.js';
import { installSoStylizedUnityUrpLighting } from '../../environment/soStylizedUnityUrpLighting.js';

export const UNITY_ROCK_MANIFEST_SCHEMA = 'toonlab.sostylized-unity.rock-material-library';
export const UNITY_ROCK_MANIFEST_VERSION = 1;
export const UNITY_ROCK_SHADER_GUID = 'a6fcfd526cd108942a6a8db5ebeda498';
export const UNITY_MOUNTAIN_SHADER_GUID = '6e81e92635c971147869e2fa22f70601';
export const DEFAULT_UNITY_ROCK_LIBRARY_BASE_URL = '/assets-local/sostylized-unity';

// Both source Shader Graphs retain Unity's default Position/Normal/Tangent
// vertex blocks, but none of those blocks has an incoming edge. Neither graph
// contains a Time node. Their generated vertex position is therefore the
// authored mesh position in visible, depth, motion-vector and ShadowCaster
// passes; Terrain placement must not classify rock prototypes as wind trees.
export const UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT = Object.freeze({
  [UNITY_ROCK_SHADER_GUID]: Object.freeze({
    mode: 'authored-static',
    sourceShader: 'Shader Graphs/S_Rock',
    sourceVertexPositionConnected: false,
    timeDependent: false,
  }),
  [UNITY_MOUNTAIN_SHADER_GUID]: Object.freeze({
    mode: 'authored-static',
    sourceShader: 'Shader Graphs/S_Mountain',
    sourceVertexPositionConnected: false,
    timeDependent: false,
  }),
});

const UNITY_CONTRAST_MIDPOINT = 0.217637640824031;
const UNITY_FLOAT_EPSILON = 5.960464478e-8;
const texturePromiseCache = new Map();

/**
 * Clean, engine-independent representation of the exposed S_Rock properties.
 * Distances and texture scales are Unity world meters. Colors are the numeric
 * shader-property values; texture color-space decoding is controlled by the
 * manifest's TextureImporter metadata.
 *
 * `layers.*.smoothness`, `moss.specular`, `layers.worldAligned`, and the
 * serialized Sand Blend Offset are deliberately absent: those exposed Unity
 * properties do not reach S_Rock's connected master outputs.
 */
export const UNITY_ROCK_PROFILE_DEFAULTS = Object.freeze({
  id: 'unity-rock-default',
  sourceName: 'S_Rock graph defaults',
  sourcePath: null,
  sourceGuid: null,
  coordinates: Object.freeze({
    // Provisional Unity-world handedness bridge. Keep +1 while applying this
    // material to already-authored Three geometry; use -1 when the paired
    // scene conversion maps Unity (x,y,z) to Three (x,y,-z).
    zSign: 1,
    // Multiplies authored world-distance thresholds without changing any
    // triplanar texture scale. Unity-authored values and the glTF/Three scene
    // are both expressed in metres, including UE exports whose centimetres
    // were converted by the glTF exporter, so the parity value is 1.
    distanceScale: 1,
  }),
  base: Object.freeze({
    scale: 1,
    tint: Object.freeze([1, 1, 1]),
    saturation: 1,
    contrast: 1,
    brightness: 0,
    projectionContrast: 0.5,
    sideOnly: false,
    closeTintDistance: 500,
    farTintDistance: 15000,
    distantTint: Object.freeze([0.7882353663, 0.7882353663, 0.7882353663]),
    distantTintMix: 0.5,
    metallic: 0,
    smoothness: 0,
    useSmoothnessTexture: false,
    smoothnessContrast: 1,
    emissiveStrength: 0.3,
    striping: Object.freeze({
      enabled: false,
      scale: 2500,
      contrast: 0.25,
      color: Object.freeze([1, 0, 1]),
    }),
  }),
  normals: Object.freeze({
    distance: 20000,
    nearFlatten: 0,
    farFlatten: 1,
    useSmoothed: false,
    // Unity's TextureImporter flipGreenChannel is false for the supplied maps.
    // Set to -1 only when a resolver supplies a green-flipped normal texture.
    normalGreenSign: 1,
  }),
  moss: Object.freeze({
    enabled: false,
    size: 1200,
    sharpness: 1,
    offset: 0.3,
    multiply: 2,
    colorPower: 1.3,
    lowColor: Object.freeze([0.2156862915, 0.3254902065, 0.1019607931]),
    highColor: Object.freeze([0.3333333433, 0.4078431726, 0.2470588386]),
  }),
  layers: Object.freeze({
    maskEnabled: true,
    sharpness: 0.8,
    offset: 0.3,
    grass: Object.freeze({
      enabled: true,
      scale: 1,
      tint: Object.freeze([1, 1, 1]),
      saturation: 1,
      emission: 0,
    }),
    snow: Object.freeze({
      enabled: false,
      scale: 500,
      tint: Object.freeze([0, 0, 0]),
      saturation: 1,
      emission: 0,
    }),
    sand: Object.freeze({
      enabled: true,
      scale: 500,
      tint: Object.freeze([0, 0, 0]),
      saturation: 0,
      emission: 0,
      normalScale: 0,
      normalStrength: 1,
      normalRotationDegrees: 30,
    }),
  }),
  textureRefs: Object.freeze({}),
});

export const UNITY_MOUNTAIN_PROFILE_DEFAULTS = Object.freeze({
  id: 'unity-mountain-default',
  sourceName: 'S_Mountain graph defaults',
  sourcePath: null,
  sourceGuid: null,
  coordinates: Object.freeze({
    zSign: 1,
    // Unity's FBX UVs are bottom-origin. UE's glTF exporter writes the same
    // mesh UVs in glTF's top-origin convention; texture sampling compensates
    // through image conventions, but S_Mountain's procedural UV.y gradients
    // require an explicit flip for those exported meshes.
    flipProceduralUvY: false,
  }),
  textureScale: 500,
  grassSlopeMax: 0,
  grassTopFadeout: 0.6,
  grassNoiseStrength: 0.25,
  noiseSize: 1000,
  smoothness: 0,
  snowNoiseStrength: 0.5,
  snowTopAmount: 0.3,
  textureRefs: Object.freeze({}),
});

function finite(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (Number.isFinite(Number(value))) return Number(value) !== 0;
  return fallback;
}

function color3(value, fallback) {
  if (Array.isArray(value)) {
    return [
      finite(value[0], fallback[0]),
      finite(value[1], fallback[1]),
      finite(value[2], fallback[2]),
    ];
  }
  if (value && typeof value === 'object') {
    return [
      finite(value.r ?? value.x, fallback[0]),
      finite(value.g ?? value.y, fallback[1]),
      finite(value.b ?? value.z, fallback[2]),
    ];
  }
  return [...fallback];
}

function unitySrgbChannelToLinear(value) {
  const channel = finite(value, 0);
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function unityColorProperty(value) {
  // Every exposed S_Rock color is ColorMode.Default. Shader Graph declares
  // those values as ShaderLab `Color` properties, so Unity converts the
  // serialized inspector/sRGB value to linear before placing it in the
  // material CBUFFER. TSL constants are already working-space values and need
  // that conversion explicitly; using the YAML numbers directly made moss,
  // distant tint, and layer tints substantially too bright.
  return vec3(...color3(value, [0, 0, 0]).map(unitySrgbChannelToLinear));
}

/**
 * Fills omitted profile fields from the serialized S_Rock graph defaults.
 * The returned object is detached from both the input and exported defaults.
 */
export function normalizeUnityRockProfile(profile = {}) {
  const defaults = UNITY_ROCK_PROFILE_DEFAULTS;
  const coordinates = profile.coordinates ?? {};
  const base = profile.base ?? {};
  const striping = base.striping ?? {};
  const normals = profile.normals ?? {};
  const moss = profile.moss ?? {};
  const layers = profile.layers ?? {};
  const grass = layers.grass ?? {};
  const snow = layers.snow ?? {};
  const sand = layers.sand ?? {};

  return {
    id: String(profile.id ?? defaults.id),
    sourceName: String(profile.sourceName ?? defaults.sourceName),
    sourcePath: profile.sourcePath == null ? null : String(profile.sourcePath),
    sourceGuid: profile.sourceGuid == null ? null : String(profile.sourceGuid),
    coordinates: {
      zSign: finite(coordinates.zSign, defaults.coordinates.zSign) < 0 ? -1 : 1,
      distanceScale: Math.max(
        finite(coordinates.distanceScale, defaults.coordinates.distanceScale),
        0.000001,
      ),
    },
    base: {
      scale: finite(base.scale, defaults.base.scale),
      tint: color3(base.tint, defaults.base.tint),
      saturation: finite(base.saturation, defaults.base.saturation),
      contrast: finite(base.contrast, defaults.base.contrast),
      brightness: finite(base.brightness, defaults.base.brightness),
      projectionContrast: finite(
        base.projectionContrast,
        defaults.base.projectionContrast,
      ),
      sideOnly: bool(base.sideOnly, defaults.base.sideOnly),
      closeTintDistance: finite(
        base.closeTintDistance,
        defaults.base.closeTintDistance,
      ),
      farTintDistance: finite(base.farTintDistance, defaults.base.farTintDistance),
      distantTint: color3(base.distantTint, defaults.base.distantTint),
      distantTintMix: finite(base.distantTintMix, defaults.base.distantTintMix),
      metallic: finite(base.metallic, defaults.base.metallic),
      smoothness: finite(base.smoothness, defaults.base.smoothness),
      useSmoothnessTexture: bool(
        base.useSmoothnessTexture,
        defaults.base.useSmoothnessTexture,
      ),
      smoothnessContrast: finite(
        base.smoothnessContrast,
        defaults.base.smoothnessContrast,
      ),
      emissiveStrength: finite(base.emissiveStrength, defaults.base.emissiveStrength),
      striping: {
        enabled: bool(striping.enabled, defaults.base.striping.enabled),
        scale: finite(striping.scale, defaults.base.striping.scale),
        contrast: finite(striping.contrast, defaults.base.striping.contrast),
        color: color3(striping.color, defaults.base.striping.color),
      },
    },
    normals: {
      distance: finite(normals.distance, defaults.normals.distance),
      // Do not clamp: shipped Classic Rocks deliberately uses -0.1, producing
      // Normal Strength 1.1 in the source graph.
      nearFlatten: finite(normals.nearFlatten, defaults.normals.nearFlatten),
      farFlatten: finite(normals.farFlatten, defaults.normals.farFlatten),
      useSmoothed: bool(normals.useSmoothed, defaults.normals.useSmoothed),
      normalGreenSign: finite(normals.normalGreenSign, defaults.normals.normalGreenSign),
    },
    moss: {
      enabled: bool(moss.enabled, defaults.moss.enabled),
      size: finite(moss.size, defaults.moss.size),
      sharpness: finite(moss.sharpness, defaults.moss.sharpness),
      offset: finite(moss.offset, defaults.moss.offset),
      multiply: finite(moss.multiply, defaults.moss.multiply),
      colorPower: finite(moss.colorPower, defaults.moss.colorPower),
      lowColor: color3(moss.lowColor, defaults.moss.lowColor),
      highColor: color3(moss.highColor, defaults.moss.highColor),
    },
    layers: {
      maskEnabled: bool(layers.maskEnabled, defaults.layers.maskEnabled),
      sharpness: finite(layers.sharpness, defaults.layers.sharpness),
      offset: finite(layers.offset, defaults.layers.offset),
      grass: {
        enabled: bool(grass.enabled, defaults.layers.grass.enabled),
        scale: finite(grass.scale, defaults.layers.grass.scale),
        tint: color3(grass.tint, defaults.layers.grass.tint),
        saturation: finite(grass.saturation, defaults.layers.grass.saturation),
        emission: finite(grass.emission, defaults.layers.grass.emission),
      },
      snow: {
        enabled: bool(snow.enabled, defaults.layers.snow.enabled),
        scale: finite(snow.scale, defaults.layers.snow.scale),
        tint: color3(snow.tint, defaults.layers.snow.tint),
        saturation: finite(snow.saturation, defaults.layers.snow.saturation),
        emission: finite(snow.emission, defaults.layers.snow.emission),
      },
      sand: {
        enabled: bool(sand.enabled, defaults.layers.sand.enabled),
        scale: finite(sand.scale, defaults.layers.sand.scale),
        tint: color3(sand.tint, defaults.layers.sand.tint),
        saturation: finite(sand.saturation, defaults.layers.sand.saturation),
        emission: finite(sand.emission, defaults.layers.sand.emission),
        normalScale: finite(sand.normalScale, defaults.layers.sand.normalScale),
        normalStrength: finite(sand.normalStrength, defaults.layers.sand.normalStrength),
        normalRotationDegrees: finite(
          sand.normalRotationDegrees,
          defaults.layers.sand.normalRotationDegrees,
        ),
      },
    },
    textureRefs: { ...(profile.textureRefs ?? {}) },
  };
}

export function normalizeUnityMountainProfile(profile = {}) {
  const defaults = UNITY_MOUNTAIN_PROFILE_DEFAULTS;
  const coordinates = profile.coordinates ?? {};
  return {
    id: String(profile.id ?? defaults.id),
    sourceName: String(profile.sourceName ?? defaults.sourceName),
    sourcePath: profile.sourcePath == null ? null : String(profile.sourcePath),
    sourceGuid: profile.sourceGuid == null ? null : String(profile.sourceGuid),
    coordinates: {
      zSign: finite(coordinates.zSign, defaults.coordinates.zSign) < 0 ? -1 : 1,
      flipProceduralUvY: bool(
        coordinates.flipProceduralUvY,
        defaults.coordinates.flipProceduralUvY,
      ),
    },
    textureScale: finite(profile.textureScale, defaults.textureScale),
    grassSlopeMax: finite(profile.grassSlopeMax, defaults.grassSlopeMax),
    grassTopFadeout: finite(
      profile.grassTopFadeout,
      defaults.grassTopFadeout,
    ),
    grassNoiseStrength: finite(
      profile.grassNoiseStrength,
      defaults.grassNoiseStrength,
    ),
    noiseSize: finite(profile.noiseSize, defaults.noiseSize),
    smoothness: finite(profile.smoothness, defaults.smoothness),
    snowNoiseStrength: finite(
      profile.snowNoiseStrength,
      defaults.snowNoiseStrength,
    ),
    snowTopAmount: finite(profile.snowTopAmount, defaults.snowTopAmount),
    textureRefs: { ...(profile.textureRefs ?? {}) },
  };
}

function resolvedNumber(resolved, key, fallback) {
  return finite(resolved?.floats?.[key] ?? resolved?.ints?.[key], fallback);
}

function resolvedBool(resolved, key, fallback) {
  const value = resolved?.floats?.[key] ?? resolved?.ints?.[key];
  return bool(value, fallback);
}

function resolvedColor(resolved, key, fallback) {
  return color3(resolved?.colors?.[key], fallback);
}

function firstTextureSlot(resolved, ...keys) {
  for (const key of keys) {
    const slot = resolved?.textures?.[key];
    if (slot && Number(slot.fileID) !== 0 && slot.guid) return slot;
  }
  return null;
}

/**
 * Converts one material entry from rock-material-library.json into the clean
 * profile contract consumed by createUnityRockMaterial().
 */
export function unityRockProfileFromResolvedMaterial(materialEntry) {
  if (!materialEntry?.resolved) {
    throw new TypeError('A Unity rock material entry with resolved properties is required.');
  }
  const shaderGuid = materialEntry.shader?.guid ?? materialEntry.directShader?.guid;
  if (shaderGuid && shaderGuid !== UNITY_ROCK_SHADER_GUID) {
    throw new Error(
      `${materialEntry.name ?? materialEntry.assetPath ?? 'Material'} uses ${shaderGuid}, not S_Rock.`,
    );
  }

  const d = UNITY_ROCK_PROFILE_DEFAULTS;
  const r = materialEntry.resolved;
  return normalizeUnityRockProfile({
    id: materialEntry.guid ?? materialEntry.assetPath ?? materialEntry.name,
    sourceName: materialEntry.name,
    sourcePath: materialEntry.assetPath,
    sourceGuid: materialEntry.guid,
    base: {
      scale: resolvedNumber(r, '_Rock_Scale', d.base.scale),
      tint: resolvedColor(r, '_Rock_Tint', d.base.tint),
      saturation: resolvedNumber(r, '_Saturation', d.base.saturation),
      contrast: resolvedNumber(r, '_Contrast', d.base.contrast),
      brightness: resolvedNumber(r, '_Rock_Brightness', d.base.brightness),
      projectionContrast: resolvedNumber(
        r,
        '_Projection_Contrast',
        d.base.projectionContrast,
      ),
      sideOnly: resolvedBool(r, '_Side_Project_Only', d.base.sideOnly),
      closeTintDistance: resolvedNumber(
        r,
        '_Close_Tint_Blend_Distance',
        d.base.closeTintDistance,
      ),
      farTintDistance: resolvedNumber(
        r,
        '_Far_Tint_Blend_Distance',
        d.base.farTintDistance,
      ),
      distantTint: resolvedColor(r, '_Distant_Tint_Blend', d.base.distantTint),
      distantTintMix: resolvedNumber(
        r,
        '_Distant_Tint_Blend_Lerp_Alpha_Mix',
        d.base.distantTintMix,
      ),
      metallic: resolvedNumber(r, '_RockMetallic', d.base.metallic),
      smoothness: resolvedNumber(r, '_Smoothness', d.base.smoothness),
      useSmoothnessTexture: resolvedBool(
        r,
        '_Smoothness_Texture_1',
        d.base.useSmoothnessTexture,
      ),
      smoothnessContrast: resolvedNumber(
        r,
        '_Smoothness_Contrast',
        d.base.smoothnessContrast,
      ),
      emissiveStrength: resolvedNumber(
        r,
        '_Emissive_Strength',
        d.base.emissiveStrength,
      ),
      striping: {
        enabled: resolvedBool(r, '_RockStriping', d.base.striping.enabled),
        scale: resolvedNumber(r, '_Rock_Strping_Scale', d.base.striping.scale),
        contrast: resolvedNumber(
          r,
          '_Rock_Striping_Contrast',
          d.base.striping.contrast,
        ),
        color: resolvedColor(
          r,
          '_Rock_Striping_Overlay_Color',
          d.base.striping.color,
        ),
      },
    },
    normals: {
      distance: resolvedNumber(r, '_Rock_Normal_Distance', d.normals.distance),
      nearFlatten: resolvedNumber(r, '_Rock_Normal_Flatten', d.normals.nearFlatten),
      farFlatten: resolvedNumber(
        r,
        '_Distant_Rock_Normal_Flatten',
        d.normals.farFlatten,
      ),
      useSmoothed: resolvedBool(r, '_UseSmoothedNormalMap', d.normals.useSmoothed),
      normalGreenSign: d.normals.normalGreenSign,
    },
    moss: {
      enabled: resolvedBool(r, '_Moss', d.moss.enabled),
      size: resolvedNumber(r, '_Moss_Size', d.moss.size),
      sharpness: resolvedNumber(r, '_Moss_Sharpness', d.moss.sharpness),
      offset: resolvedNumber(r, '_Moss_Offset', d.moss.offset),
      multiply: resolvedNumber(r, '_Moss_Multiply', d.moss.multiply),
      colorPower: resolvedNumber(r, '_Moss_Smoothness', d.moss.colorPower),
      lowColor: resolvedColor(r, '_Moss_Color_2', d.moss.lowColor),
      highColor: resolvedColor(r, '_Moss_Color', d.moss.highColor),
    },
    layers: {
      maskEnabled: resolvedBool(r, '_MaskTopLayer', d.layers.maskEnabled),
      sharpness: resolvedNumber(
        r,
        '_TopLayer_Blend_Sharpness',
        d.layers.sharpness,
      ),
      offset: resolvedNumber(r, '_TopLayer_Blend_Offset', d.layers.offset),
      grass: {
        enabled: resolvedBool(r, '_TopGrass', d.layers.grass.enabled),
        scale: resolvedNumber(r, '_Grass_Scale', d.layers.grass.scale),
        tint: resolvedColor(r, '_Grass_Tint', d.layers.grass.tint),
        saturation: resolvedNumber(r, '_Grass_Saturation', d.layers.grass.saturation),
        emission: resolvedNumber(r, '_Grass_Emission', d.layers.grass.emission),
      },
      snow: {
        enabled: resolvedBool(r, '_TopSnow', d.layers.snow.enabled),
        scale: resolvedNumber(r, '_Snow_Scale', d.layers.snow.scale),
        tint: resolvedColor(r, '_Snow_Tint', d.layers.snow.tint),
        // S_Rock leaves the SG_SubLayer saturation input disconnected for snow.
        saturation: 1,
        emission: resolvedNumber(r, '_Snow_Emission', d.layers.snow.emission),
      },
      sand: {
        enabled: resolvedBool(r, '_TopSand', d.layers.sand.enabled),
        scale: resolvedNumber(r, '_Sand_Scale', d.layers.sand.scale),
        tint: resolvedColor(r, '_Sand_Tint', d.layers.sand.tint),
        saturation: resolvedNumber(r, '_Sand_Saturation', d.layers.sand.saturation),
        emission: resolvedNumber(r, '_Sand_Emission', d.layers.sand.emission),
        normalScale: resolvedNumber(r, '_Sand_Normal_Scale', d.layers.sand.normalScale),
        normalStrength: resolvedNumber(
          r,
          '_Sand_Normal_Strength',
          d.layers.sand.normalStrength,
        ),
        normalRotationDegrees: 30,
      },
    },
    textureRefs: {
      rock: firstTextureSlot(r, '_Rock_Texture'),
      rockNormal: firstTextureSlot(r, '_Rock_Normal_Texture'),
      stylizedNormal: firstTextureSlot(r, '_Stylized_Normal_Map'),
      smoothness: firstTextureSlot(r, '_Smoothness_Texture'),
      stripe: firstTextureSlot(r, '_Rock_Striping_Texture'),
      moss: firstTextureSlot(r, '_MossTexture'),
      // `_Base_Color` is a serialized legacy slot and is disconnected from
      // S_Rock. A null `_Top_Layer_Mask` means the Shader Graph default white.
      topMask: firstTextureSlot(r, '_Top_Layer_Mask'),
      grass: firstTextureSlot(r, '_Grass_Texture'),
      snow: firstTextureSlot(r, '_Snow_Texture'),
      sand: firstTextureSlot(r, '_Sand_Texture'),
      sandNormal: firstTextureSlot(r, '_Sand_Normal_Texture'),
    },
  });
}

/** Converts one resolved S_Mountain material entry into its connected graph inputs. */
export function unityMountainProfileFromResolvedMaterial(materialEntry) {
  if (!materialEntry?.resolved) {
    throw new TypeError('A Unity mountain material entry with resolved properties is required.');
  }
  const shaderGuid = materialEntry.shader?.guid ?? materialEntry.directShader?.guid;
  if (shaderGuid && shaderGuid !== UNITY_MOUNTAIN_SHADER_GUID) {
    throw new Error(
      `${materialEntry.name ?? materialEntry.assetPath ?? 'Material'} uses ${shaderGuid}, not S_Mountain.`,
    );
  }

  const d = UNITY_MOUNTAIN_PROFILE_DEFAULTS;
  const r = materialEntry.resolved;
  return normalizeUnityMountainProfile({
    id: materialEntry.guid ?? materialEntry.assetPath ?? materialEntry.name,
    sourceName: materialEntry.name,
    sourcePath: materialEntry.assetPath,
    sourceGuid: materialEntry.guid,
    textureScale: resolvedNumber(r, '_Texture_Scale', d.textureScale),
    grassSlopeMax: resolvedNumber(r, '_Grass_Slope_Max', d.grassSlopeMax),
    grassTopFadeout: resolvedNumber(
      r,
      '_Grass_Top_Fadeout',
      d.grassTopFadeout,
    ),
    grassNoiseStrength: resolvedNumber(
      r,
      '_Grass_Noise_Strength',
      d.grassNoiseStrength,
    ),
    noiseSize: resolvedNumber(r, '_Noise_Size', d.noiseSize),
    smoothness: resolvedNumber(r, '_Smoothness', d.smoothness),
    snowNoiseStrength: resolvedNumber(
      r,
      '_Snow_Noise_Strength',
      d.snowNoiseStrength,
    ),
    snowTopAmount: resolvedNumber(r, '_Snow_Top_Amount', d.snowTopAmount),
    textureRefs: {
      noise: firstTextureSlot(
        r,
        '_SampleTexture2D_4da0d8ebd864413a95e355934b01bf4b_Texture_1_Texture2D',
      ),
      rock: firstTextureSlot(
        r,
        '_SampleTexture2D_5fb9278c5b51455bb51fcf51e6afd491_Texture_1_Texture2D',
      ),
      snow: firstTextureSlot(
        r,
        '_SampleTexture2D_d8b599d9da0b48309b3bf5702f47bc6c_Texture_1_Texture2D',
      ),
      grass: firstTextureSlot(
        r,
        '_SampleTexture2D_f70ef7e3c77a4c2b97e36f9585a47570_Texture_1_Texture2D',
      ),
    },
  });
}

function safeScale(value) {
  return max(abs(float(value)), 0.000001);
}

function unitySourcePosition(coordinates) {
  return vec3(
    positionWorld.x,
    positionWorld.y,
    positionWorld.z.mul(coordinates.zSign),
  );
}

function unitySourceGeometryNormal(coordinates) {
  return vec3(
    normalWorldGeometry.x,
    normalWorldGeometry.y,
    normalWorldGeometry.z.mul(coordinates.zSign),
  );
}

// Exact Shader Graph Saturation node coefficients.
function unitySaturation(input, amount) {
  const luma = dot(input, vec3(0.2126729, 0.7151522, 0.0721750));
  return vec3(luma).add(input.sub(vec3(luma)).mul(float(amount)));
}

// Exact Shader Graph Contrast node: gamma-space midpoint, no output clamp.
function unityContrast(input, amount) {
  return input.sub(UNITY_CONTRAST_MIDPOINT)
    .mul(float(amount))
    .add(UNITY_CONTRAST_MIDPOINT);
}

function unityLinearRamp(input, low, high) {
  return clamp(
    input.sub(float(low)).div(max(float(high).sub(float(low)), 0.000001)),
    0,
    1,
  );
}

function unityTriplanarWeights(normalNode, blend) {
  // Shader Graph's SafePositivePow clamps abs(base) to FLT_EPS. Its exponent
  // cap is irrelevant to the supplied 0.5-3.0 material values.
  const safeNormal = max(abs(normalNode), vec3(UNITY_FLOAT_EPSILON));
  const weights = pow(safeNormal, vec3(Math.max(finite(blend, 1), 0.000001)));
  return weights.div(max(weights.x.add(weights.y).add(weights.z), 0.000001));
}

function unityTriplanarColor(map, scale, blend = 1, coordinates = { zSign: 1 }) {
  const mapNode = texture(map);
  const sourcePosition = unitySourcePosition(coordinates);
  const sourceNormal = unitySourceGeometryNormal(coordinates);
  const projected = sourcePosition.div(safeScale(scale));
  const weights = unityTriplanarWeights(sourceNormal, blend);
  return mapNode.sample(projected.zy).rgb.mul(weights.x)
    .add(mapNode.sample(projected.xz).rgb.mul(weights.y))
    .add(mapNode.sample(projected.xy).rgb.mul(weights.z));
}

function unitySideProjection(map, scale, projectionContrast, {
  negativeScale = true,
  clampResult = true,
  coordinates = { zSign: 1 },
} = {}) {
  const denominator = negativeScale ? safeScale(scale).negate() : safeScale(scale);
  const sourcePosition = unitySourcePosition(coordinates);
  const sourceNormal = unitySourceGeometryNormal(coordinates);
  const projected = sourcePosition.div(denominator);
  const mapNode = texture(map);
  // The Contrast result is intentionally not saturated before Lerp. Values
  // above one extrapolate when Projection Contrast is high.
  const blend = unityContrast(abs(sourceNormal.x), projectionContrast);
  const projectedColor = mix(
    mapNode.sample(projected.xy).rgb,
    mapNode.sample(projected.zy).rgb,
    blend,
  );
  return clampResult ? clamp(projectedColor, 0, 1) : projectedColor;
}

function unityRockProjection(map, profile) {
  return profile.base.sideOnly
    ? unitySideProjection(map, profile.base.scale, profile.base.projectionContrast, {
      coordinates: profile.coordinates,
    })
    : unityTriplanarColor(
      map,
      profile.base.scale,
      profile.base.projectionContrast,
      profile.coordinates,
    );
}

function unityOverlay(base, blend, opacity) {
  const low = base.mul(blend).mul(2);
  const high = vec3(1).sub(vec3(1).sub(base).mul(vec3(1).sub(blend)).mul(2));
  const overlay = mix(low, high, step(vec3(0.5), base));
  return mix(base, overlay, opacity);
}

function normalGreenSignForTexture(map, profileSign) {
  // TextureImporter.flipGreenChannel is applied while Unity builds the
  // runtime normal texture. ToonLab samples the licensed source PNG directly,
  // so reproduce that import transform before the Shader Graph sees it.
  const importerSign = map?.userData?.unityImportSettings?.flipGreenChannel ? -1 : 1;
  return finite(profileSign, 1) * importerSign;
}

function worldNormalToTangent(worldNormal) {
  const viewNormal = transformNormalByViewMatrix(worldNormal, cameraViewMatrix);
  return normalize(transpose(TBNViewMatrix).mul(viewNormal));
}

function tangentNormalToView(tangentNormal) {
  return normalize(TBNViewMatrix.mul(tangentNormal));
}

function unityTriplanarNormal(map, scale, blend, greenSign, coordinates) {
  const projected = unitySourcePosition(coordinates).div(safeScale(scale));
  const geometryNormal = unitySourceGeometryNormal(coordinates);
  const weights = unityTriplanarWeights(geometryNormal, blend);
  const mapNode = texture(map);
  let normalX = decodeUnityNormal(mapNode.sample(projected.zy).rgb, greenSign);
  let normalY = decodeUnityNormal(mapNode.sample(projected.xz).rgb, greenSign);
  let normalZ = decodeUnityNormal(mapNode.sample(projected.xy).rgb, greenSign);

  // Shader Graph Triplanar's normal-texture whiteout blend, before its
  // AbsoluteWorld -> Tangent space conversion.
  normalX = vec3(normalX.xy.add(geometryNormal.zy), abs(normalX.z).mul(geometryNormal.x));
  normalY = vec3(normalY.xy.add(geometryNormal.xz), abs(normalY.z).mul(geometryNormal.y));
  normalZ = vec3(normalZ.xy.add(geometryNormal.xy), abs(normalZ.z).mul(geometryNormal.z));
  const sourceWorldNormal = normalX.zyx.mul(weights.x)
    .add(normalY.xzy.mul(weights.y))
    .add(normalZ.xyz.mul(weights.z));
  const worldNormal = vec3(
    sourceWorldNormal.x,
    sourceWorldNormal.y,
    sourceWorldNormal.z.mul(coordinates.zSign),
  );
  return worldNormalToTangent(worldNormal);
}

function unityNormalBlend(a, b) {
  // S_Rock's Normal Blend node uses BlendMode.Default, not RNM.
  return normalize(vec3(a.xy.add(b.xy), a.z.mul(b.z)));
}

function unityRotateDegrees(inputUv, degrees) {
  const centered = inputUv.sub(vec2(0.5));
  const angle = float(degrees * (Math.PI / 180));
  const sine = sin(angle);
  const cosine = cos(angle);
  return vec2(
    centered.x.mul(cosine).add(centered.y.mul(sine)),
    centered.x.mul(sine).negate().add(centered.y.mul(cosine)),
  ).add(vec2(0.5));
}

function unitySandNormal(map, layer, greenSign, coordinates) {
  // The source graph uses Absolute World XZ / -abs(scale), then a fixed
  // 30-degree rotation around (0.5, 0.5), not UV0 or triplanar sampling.
  const projected = unitySourcePosition(coordinates)
    .div(safeScale(layer.normalScale).negate());
  const rotatedUv = unityRotateDegrees(projected.xz, layer.normalRotationDegrees);
  const decoded = decodeUnityNormal(
    texture(map).sample(rotatedUv).rgb,
    normalGreenSignForTexture(map, greenSign),
  );
  return unityNormalStrength(decoded, layer.normalStrength);
}

function unityTopMask(profile, topMaskTexture) {
  const denominator = Math.max(1 - profile.layers.offset, 0.000001);
  let mask = clamp(
    normalWorldGeometry.y
      .sub(profile.layers.offset)
      .div(denominator)
      .mul(profile.layers.sharpness),
    0,
    1,
  );
  if (profile.layers.maskEnabled && topMaskTexture) {
    mask = mask.mul(texture(topMaskTexture).sample(uv()).r);
  }
  return clamp(mask, 0, 1);
}

function applyUnitySubLayer(state, layer, map, mask, coordinates) {
  if (!layer.enabled) return state;
  const sampled = unitySaturation(
    unityTriplanarColor(map, layer.scale, 1, coordinates),
    layer.saturation,
  ).mul(unityColorProperty(layer.tint));
  const color = mix(state.color, sampled, mask);
  // This unusual dependency is exact SG_SubLayer behavior: emission is based
  // on the already blended Out_BC and multiplied by Alpha a second time.
  const emission = state.emission.add(color.mul(layer.emission).mul(mask));
  return { color, emission };
}

function assertTexture(value, key, reason) {
  if (!value?.isTexture) {
    throw new TypeError(`Unity S_Rock requires textures.${key} ${reason}.`);
  }
}

function validateTextures(profile, textures) {
  assertTexture(textures.rock, 'rock', 'for the base projection');
  if (profile.base.useSmoothnessTexture) {
    assertTexture(textures.smoothness, 'smoothness', 'when useSmoothnessTexture is true');
  }
  if (profile.base.striping.enabled) {
    assertTexture(textures.stripe, 'stripe', 'when striping is enabled');
  }
  if (profile.moss.enabled) assertTexture(textures.moss, 'moss', 'when moss is enabled');
  if (profile.layers.grass.enabled) {
    assertTexture(textures.grass, 'grass', 'when the grass sublayer is enabled');
  }
  if (profile.layers.snow.enabled) {
    assertTexture(textures.snow, 'snow', 'when the snow sublayer is enabled');
  }
  if (profile.layers.sand.enabled) {
    assertTexture(textures.sand, 'sand', 'when the sand sublayer is enabled');
    assertTexture(textures.sandNormal, 'sandNormal', 'when the sand sublayer is enabled');
  }
}

function textureKeysForProfile(profile) {
  const keys = new Set(['rock']);
  if (profile.textureRefs.rockNormal) keys.add('rockNormal');
  if (profile.normals.useSmoothed && profile.textureRefs.stylizedNormal) {
    keys.add('stylizedNormal');
  }
  if (profile.base.useSmoothnessTexture) keys.add('smoothness');
  if (profile.base.striping.enabled) keys.add('stripe');
  if (profile.moss.enabled) keys.add('moss');
  // Alpha also suppresses smoothness without an enabled color sublayer.
  if (profile.layers.maskEnabled && profile.textureRefs.topMask) keys.add('topMask');
  if (profile.layers.grass.enabled) keys.add('grass');
  if (profile.layers.snow.enabled) keys.add('snow');
  if (profile.layers.sand.enabled) {
    keys.add('sand');
    keys.add('sandNormal');
  }
  return keys;
}

/**
 * Builds an opaque TSL material from a normalized profile and resolved
 * THREE.Texture objects. This ports the S_Rock graph inputs; final pixels still
 * depend on matching Unity URP's deferred BRDF, SSAO, shadows, ambient probe,
 * fog, TAA, and post-processing.
 */
export function createUnityRockMaterial({ profile = {}, textures = {}, name = null } = {}) {
  const resolvedProfile = normalizeUnityRockProfile(profile);
  validateTextures(resolvedProfile, textures);

  const radialDistance = distance(cameraPosition, positionWorld);
  const authoredDistanceScale = resolvedProfile.coordinates.distanceScale;
  const topMask = unityTopMask(resolvedProfile, textures.topMask);
  const rockProjection = unityRockProjection(textures.rock, resolvedProfile);
  let colorNode = unityContrast(
    unitySaturation(rockProjection, resolvedProfile.base.saturation),
    resolvedProfile.base.contrast,
  ).add(resolvedProfile.base.brightness).mul(
    unityColorProperty(resolvedProfile.base.tint),
  );

  const distantAmount = unityLinearRamp(
    radialDistance,
    resolvedProfile.base.closeTintDistance * authoredDistanceScale,
    resolvedProfile.base.farTintDistance * authoredDistanceScale,
  );
  colorNode = mix(
    colorNode,
    mix(
      colorNode,
      unityColorProperty(resolvedProfile.base.distantTint),
      resolvedProfile.base.distantTintMix,
    ),
    distantAmount,
  );

  if (resolvedProfile.base.striping.enabled) {
    const stripeProjected = unitySideProjection(
      textures.stripe,
      resolvedProfile.base.striping.scale,
      resolvedProfile.base.projectionContrast,
      {
        negativeScale: false,
        clampResult: false,
        coordinates: resolvedProfile.coordinates,
      },
    );
    const stripeOpacity = clamp(
      unityContrast(stripeProjected.r, resolvedProfile.base.striping.contrast),
      0,
      1,
    );
    colorNode = unityOverlay(
      colorNode,
      unityColorProperty(resolvedProfile.base.striping.color),
      stripeOpacity,
    );
  }

  if (resolvedProfile.moss.enabled) {
    const mossSample = unityTriplanarColor(
      textures.moss,
      resolvedProfile.moss.size,
      1,
      resolvedProfile.coordinates,
    );
    const mossPattern = pow(
      max(mossSample, vec3(0)),
      vec3(resolvedProfile.moss.colorPower),
    );
    const mossColor = mix(
      unityColorProperty(resolvedProfile.moss.lowColor),
      unityColorProperty(resolvedProfile.moss.highColor),
      mossPattern,
    );
    const slope = clamp(
      normalWorldGeometry.y
        .mul(resolvedProfile.moss.sharpness)
        .sub(resolvedProfile.moss.offset),
      0,
      1,
    );
    const mossMask = clamp(
      pow(mossSample.mul(resolvedProfile.moss.multiply).mul(slope), vec3(2)),
      0,
      1,
    );
    colorNode = mix(colorNode, mossColor, mossMask);
  }

  let layerState = {
    color: colorNode,
    // The base emission multiply receives the post-moss color branch.
    emission: colorNode.mul(resolvedProfile.base.emissiveStrength),
  };
  // Exact graph order: later enabled calls paint over earlier calls.
  layerState = applyUnitySubLayer(
    layerState,
    resolvedProfile.layers.grass,
    textures.grass,
    topMask,
    resolvedProfile.coordinates,
  );
  layerState = applyUnitySubLayer(
    layerState,
    resolvedProfile.layers.snow,
    textures.snow,
    topMask,
    resolvedProfile.coordinates,
  );
  layerState = applyUnitySubLayer(
    layerState,
    resolvedProfile.layers.sand,
    textures.sand,
    topMask,
    resolvedProfile.coordinates,
  );

  const smoothnessSource = resolvedProfile.base.useSmoothnessTexture
    ? unityContrast(
      clamp(unityRockProjection(textures.smoothness, resolvedProfile).r, 0, 1),
      resolvedProfile.base.smoothnessContrast,
    )
    : float(1);
  const rockSmoothness = smoothnessSource.mul(resolvedProfile.base.smoothness);
  // The S_Rock graph applies this mask even when every top-layer toggle is off.
  const finalSmoothness = rockSmoothness.mul(topMask.oneMinus());

  const stylizedNormal = resolvedProfile.normals.useSmoothed && textures.stylizedNormal
    ? decodeUnityNormal(
      texture(textures.stylizedNormal).sample(uv()).rgb,
      normalGreenSignForTexture(
        textures.stylizedNormal,
        resolvedProfile.normals.normalGreenSign,
      ),
    )
    : vec3(0, 0, 1);
  let combinedNormal = stylizedNormal;
  if (textures.rockNormal) {
    const crackNormal = unityTriplanarNormal(
      textures.rockNormal,
      resolvedProfile.base.scale,
      resolvedProfile.base.projectionContrast,
      normalGreenSignForTexture(
        textures.rockNormal,
        resolvedProfile.normals.normalGreenSign,
      ),
      resolvedProfile.coordinates,
    );
    const normalFade = clamp(
      radialDistance.div(Math.max(
        resolvedProfile.normals.distance * authoredDistanceScale,
        0.000001,
      )),
      0,
      1,
    );
    const flatness = mix(
      resolvedProfile.normals.nearFlatten,
      resolvedProfile.normals.farFlatten,
      normalFade,
    );
    combinedNormal = unityNormalBlend(
      stylizedNormal,
      unityNormalStrength(crackNormal, float(1).sub(flatness)),
    );
  }

  const hasTopLayer = resolvedProfile.layers.grass.enabled
    || resolvedProfile.layers.snow.enabled
    || resolvedProfile.layers.sand.enabled;
  if (hasTopLayer) {
    const topNormal = resolvedProfile.layers.sand.enabled
      ? unitySandNormal(
        textures.sandNormal,
        resolvedProfile.layers.sand,
        resolvedProfile.normals.normalGreenSign,
        resolvedProfile.coordinates,
      )
      : stylizedNormal;
    combinedNormal = normalize(mix(combinedNormal, topNormal, topMask));
  }

  const material = new MeshPhysicalNodeMaterial();
  material.name = name ?? `SoStylizedUnity_${resolvedProfile.sourceName}`;
  material.colorNode = layerState.color;
  material.normalNode = tangentNormalToView(combinedNormal);
  material.metalnessNode = clamp(float(resolvedProfile.base.metallic), 0, 1);
  // URP exposes smoothness while Three exposes roughness.
  material.roughnessNode = clamp(finalSmoothness.oneMinus(), 0, 1);
  // URP metallic workflow's dielectric reflectance is 0.04, matching IOR 1.5.
  material.iorNode = float(1.5);
  material.specularIntensityNode = float(1);
  material.emissiveNode = layerState.emission;
  material.aoNode = float(1);
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.userData.unityRockProfile = resolvedProfile;
  material.userData.unitySourceShader = {
    assetPath: 'Environment/Rocks/Shaders/S_Rock.shadergraph',
    guid: UNITY_ROCK_SHADER_GUID,
  };
  material.userData.soStylizedUnityVertexMotion = {
    ...UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[UNITY_ROCK_SHADER_GUID],
  };
  material.userData.unityNormalImport = {
    decode: 'UnpackNormalMapRGorAG-compatible RG + reconstructed positive Z',
    perTextureFlipGreenChannel: true,
  };
  const rockTextureFlipY = textures.rockNormal?.isTexture
    ? Boolean(textures.rockNormal.flipY)
    : null;
  material.userData.soStylizedUnityNormalIntegration =
    createSoStylizedUnityNormalIntegrationMetadata({
      coordinateZSign: resolvedProfile.coordinates.zSign,
      decode: 'RG + per-texture importer green transform + reconstructed positive Z; Shader Graph Normal Strength',
      family: 'unity-s-rock',
      flipGreenChannel: 'per-texture TextureImporter state',
      textureFlipY: rockTextureFlipY,
    });
  // Live Preview diagnostics must be sourced by the material family itself.
  // The raw branch is the untouched source albedo projection: no tint,
  // distance color, moss/top layers, normal response, emission, or lighting.
  // Keeping it here prevents pages from substituting a flat fallback color for
  // any S_Rock material loaded through the Unity source-material path.
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.neutralLit, {
    colorNode: rockProjection,
    family: 'rock',
    keepsLighting: true,
    keepsTextures: true,
    vertexDeformation: false,
  });
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.rawTexture, {
    colorNode: rockProjection,
    family: 'rock',
    keepsLighting: false,
    keepsTextures: true,
    vertexDeformation: false,
  });
  installSoStylizedUnityUrpLighting(material, { workflow: 'metallic' });
  return material;
}

function validateMountainTextures(textures) {
  for (const key of ['noise', 'rock', 'grass', 'snow']) {
    assertTexture(textures[key], key, 'for the connected S_Mountain graph input');
  }
}

/**
 * Exact connected outputs of Unity's separate S_Mountain Shader Graph.
 * Unlike S_Rock, this graph has no normal texture or emission branch: it
 * projects rock/grass/snow in world XZ, then derives grass and snow masks from
 * geometry normal, UV0.y, and one shared noise sample.
 */
export function createUnityMountainMaterial({
  profile = {},
  textures = {},
  name = null,
} = {}) {
  const resolvedProfile = normalizeUnityMountainProfile(profile);
  validateMountainTextures(textures);

  const sourcePosition = unitySourcePosition(resolvedProfile.coordinates);
  const planar = vec2(sourcePosition.x, sourcePosition.z);
  const baseUv = planar.div(safeScale(resolvedProfile.textureScale));
  const noiseUv = planar.div(safeScale(resolvedProfile.noiseSize));
  const rock = texture(textures.rock).sample(baseUv).rgb;
  const grass = texture(textures.grass).sample(baseUv.mul(2)).rgb;
  const snow = texture(textures.snow).sample(baseUv).rgb;
  const centeredNoise = texture(textures.noise).sample(noiseUv).r.sub(0.5);

  const sourceUvY = resolvedProfile.coordinates.flipProceduralUvY
    ? uv().y.oneMinus()
    : uv().y;
  const authoredUvY = clamp(sourceUvY, 0, 1);
  const slopeStart = 1 - resolvedProfile.grassSlopeMax;
  // S_Mountain uses an unclamped Remap here; the product is saturated only
  // after the procedural UV-height fade has been applied.
  const grassSlope = normalWorldGeometry.y
    .add(centeredNoise.mul(resolvedProfile.grassNoiseStrength))
    .sub(slopeStart)
    .div(0.04);
  // The first two-key Gradient is black->white. Its subsequent remap from
  // [fade-1, fade] to [1, 0] reduces exactly to fade - UV.y.
  const grassHeight = clamp(
    float(resolvedProfile.grassTopFadeout).sub(authoredUvY),
    0,
    1,
  );
  const grassMask = clamp(grassSlope.mul(grassHeight), 0, 1);

  // The snow Gradient is white->black; noise is added before the reversed
  // 0.05-wide threshold remap.
  const snowHeight = authoredUvY.oneMinus().add(
    centeredNoise.mul(resolvedProfile.snowNoiseStrength),
  );
  const snowMask = clamp(
    float(1).sub(
      snowHeight.sub(resolvedProfile.snowTopAmount).div(0.05),
    ),
    0,
    1,
  );

  const material = new MeshPhysicalNodeMaterial();
  material.name = name ?? `SoStylizedUnity_${resolvedProfile.sourceName}`;
  material.colorNode = mix(mix(rock, grass, grassMask), snow, snowMask);
  material.metalnessNode = float(0);
  material.roughnessNode = clamp(float(1 - resolvedProfile.smoothness), 0, 1);
  material.iorNode = float(1.5);
  material.specularIntensityNode = float(1);
  material.emissiveNode = vec3(0);
  material.aoNode = float(1);
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.userData.unityMountainProfile = resolvedProfile;
  material.userData.unitySourceShader = {
    assetPath: 'Environment/Rocks/Shaders/S_Mountain.shadergraph',
    guid: UNITY_MOUNTAIN_SHADER_GUID,
  };
  material.userData.soStylizedUnityVertexMotion = {
    ...UNITY_ROCK_FAMILY_VERTEX_MOTION_CONTRACT[UNITY_MOUNTAIN_SHADER_GUID],
  };
  const mountainTexture = textures.rock ?? textures.noise;
  material.userData.soStylizedUnityNormalIntegration =
    createSoStylizedUnityNormalIntegrationMetadata({
      coordinateZSign: resolvedProfile.coordinates.zSign,
      decode: 'geometry-only; S_Mountain has no connected normal-map input',
      family: 'unity-s-mountain',
      textureFlipY: mountainTexture?.isTexture
        ? Boolean(mountainTexture.flipY)
        : null,
    });
  installSoStylizedUnityUrpLighting(material, { workflow: 'metallic' });
  return material;
}

function joinUrl(baseUrl, relativePath) {
  if (!relativePath) return null;
  if (/^(?:data:|blob:|https?:\/\/|\/\/)/i.test(relativePath)) return relativePath;
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

function manifestDirectory(url) {
  const value = String(url);
  const slash = value.lastIndexOf('/');
  return slash >= 0 ? value.slice(0, slash) : '.';
}

async function resolveManifest(manifest, baseUrl) {
  if (manifest && typeof manifest === 'object') {
    return { manifest, baseUrl: baseUrl ?? DEFAULT_UNITY_ROCK_LIBRARY_BASE_URL };
  }
  const manifestUrl = typeof manifest === 'string'
    ? joinUrl(baseUrl ?? '', manifest)
    : joinUrl(
      baseUrl ?? DEFAULT_UNITY_ROCK_LIBRARY_BASE_URL,
      'rock-material-library.json',
    );
  const response = await fetch(manifestUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Unity rock material manifest is unavailable (${response.status}).`);
  }
  return {
    manifest: await response.json(),
    baseUrl: baseUrl ?? manifestDirectory(manifestUrl),
  };
}

function validateManifest(manifest) {
  if (manifest?.schema !== UNITY_ROCK_MANIFEST_SCHEMA
    || Number(manifest?.schemaVersion) !== UNITY_ROCK_MANIFEST_VERSION) {
    throw new Error('Invalid So Stylized Unity rock material library manifest.');
  }
  if (!Array.isArray(manifest.materials) || !manifest.texturesByGuid) {
    throw new Error('Unity rock manifest is missing materials or texturesByGuid.');
  }
}

function findMaterialEntry(manifest, selector) {
  if (selector?.resolved) return selector;
  const value = String(selector ?? '');
  const entry = manifest.materials.find((candidate) => (
    candidate.assetPath === value || candidate.guid === value || candidate.name === value
  ));
  if (!entry) throw new Error(`Unity rock material was not found: ${value || '(empty selector)'}`);
  return entry;
}

function wrappingFromUnity(value) {
  if (Number(value) === 1) return ClampToEdgeWrapping;
  if (Number(value) === 2 || Number(value) === 3) return MirroredRepeatWrapping;
  return RepeatWrapping;
}

function applyTextureImportSettings(result, record, { textureFlipY = false } = {}) {
  const settings = record?.importSettings ?? {};
  result.name = record?.assetPath?.split('/').at(-1) ?? record?.guid ?? result.name;
  result.colorSpace = settings.sRGBTexture || settings.colorSpace === 'srgb'
    ? SRGBColorSpace
    : NoColorSpace;
  result.flipY = Boolean(textureFlipY);
  result.wrapS = wrappingFromUnity(settings.wrapU);
  result.wrapT = wrappingFromUnity(settings.wrapV);
  result.generateMipmaps = settings.mipmapEnabled !== false;
  const filterMode = Number(settings.filterMode ?? 1);
  if (filterMode === 0) {
    result.magFilter = NearestFilter;
    result.minFilter = result.generateMipmaps ? NearestMipmapNearestFilter : NearestFilter;
  } else if (filterMode === 2) {
    result.magFilter = LinearFilter;
    result.minFilter = result.generateMipmaps ? LinearMipmapLinearFilter : LinearFilter;
  } else {
    result.magFilter = LinearFilter;
    result.minFilter = result.generateMipmaps ? LinearMipmapNearestFilter : LinearFilter;
  }
  result.anisotropy = Math.max(1, finite(settings.aniso, 1));
  result.userData.unityTextureGuid = record?.guid ?? null;
  result.userData.unityImportSettings = {
    ...settings,
    textureFlipY: Boolean(textureFlipY),
  };
  result.needsUpdate = true;
  return result;
}

async function loadManifestTexture({
  key,
  slot,
  manifest,
  material,
  baseUrl,
  resolveTexture,
  textureFlipY,
  textureLoader,
}) {
  if (!slot || Number(slot.fileID) === 0 || !slot.guid) return null;
  const record = manifest.texturesByGuid[slot.guid];
  if (!record?.outputFile) {
    throw new Error(`Unity texture ${slot.guid} for ${material.name}/${key} is unresolved.`);
  }
  if (resolveTexture) {
    const resolved = await resolveTexture({
      key,
      slot,
      record,
      manifest,
      material,
      baseUrl,
      textureFlipY,
    });
    if (resolved != null && !resolved.isTexture) {
      throw new TypeError(`resolveTexture returned a non-Texture for ${material.name}/${key}.`);
    }
    return resolved;
  }

  const url = joinUrl(baseUrl, record.outputFile);
  const cacheKey = `${url}|flipY=${Boolean(textureFlipY)}`;
  if (!texturePromiseCache.has(cacheKey)) {
    texturePromiseCache.set(cacheKey, textureLoader.loadAsync(url)
      .then((result) => applyTextureImportSettings(result, record, { textureFlipY }))
      .catch((error) => {
        texturePromiseCache.delete(cacheKey);
        throw error;
      }));
  }
  return texturePromiseCache.get(cacheKey);
}

/**
 * High-level loader for the generated Unity library manifest.
 *
 * `material` may be an assetPath, GUID, material name, or a manifest entry.
 * `resolveTexture({ key, slot, record, manifest, material, baseUrl })` can be
 * supplied by hosts with their own cache/asset system. Without it, outputFile
 * paths are loaded relative to baseUrl with TextureImporter metadata applied.
 * `coordinates: { zSign: -1 }` reconstructs Unity projection space when the
 * paired scene conversion reflects Unity Z into Three Z. `distanceScale`
 * bridges source distance units without changing world-projected texture
 * scales. Unity material values and glTF/Three scene coordinates are both
 * metres after export, so source parity normally uses 1.
 * `textureFlipY` is false for the supplied SnowPines UE glTF bridge and true
 * for UnitySceneExport.cs geometry, whose UV.y values are copied unchanged.
 */
export async function loadUnityRockMaterial({
  manifest = null,
  material,
  baseUrl = null,
  resolveTexture = null,
  textureLoader = new TextureLoader(),
  name = null,
  coordinates = null,
  normalGreenSign = null,
  textureFlipY = false,
} = {}) {
  const resolvedLibrary = await resolveManifest(manifest, baseUrl);
  validateManifest(resolvedLibrary.manifest);
  const entry = findMaterialEntry(resolvedLibrary.manifest, material);
  let profile = unityRockProfileFromResolvedMaterial(entry);
  if (coordinates) profile = normalizeUnityRockProfile({ ...profile, coordinates });
  if (normalGreenSign != null) {
    profile = normalizeUnityRockProfile({
      ...profile,
      normals: {
        ...profile.normals,
        normalGreenSign,
      },
    });
  }
  const textures = {};
  const textureKeys = textureKeysForProfile(profile);
  await Promise.all([...textureKeys].map(async (key) => {
    const slot = profile.textureRefs[key];
    textures[key] = await loadManifestTexture({
      key,
      slot,
      manifest: resolvedLibrary.manifest,
      material: entry,
      baseUrl: resolvedLibrary.baseUrl,
      resolveTexture,
      textureFlipY,
      textureLoader,
    });
  }));
  const result = createUnityRockMaterial({ profile, textures, name });
  result.userData.soStylizedUnityNormalIntegration.textureFlipY = Boolean(textureFlipY);
  return result;
}

/** High-level loader for the S_Mountain entries in the shared Unity manifest. */
export async function loadUnityMountainMaterial({
  manifest = null,
  material,
  baseUrl = null,
  resolveTexture = null,
  textureLoader = new TextureLoader(),
  name = null,
  coordinates = null,
  textureFlipY = false,
} = {}) {
  const resolvedLibrary = await resolveManifest(manifest, baseUrl);
  validateManifest(resolvedLibrary.manifest);
  const entry = findMaterialEntry(resolvedLibrary.manifest, material);
  let profile = unityMountainProfileFromResolvedMaterial(entry);
  if (coordinates) {
    profile = normalizeUnityMountainProfile({ ...profile, coordinates });
  }
  const textures = {};
  await Promise.all(['noise', 'rock', 'grass', 'snow'].map(async (key) => {
    const slot = profile.textureRefs[key];
    textures[key] = await loadManifestTexture({
      key,
      slot,
      manifest: resolvedLibrary.manifest,
      material: entry,
      baseUrl: resolvedLibrary.baseUrl,
      resolveTexture,
      textureFlipY,
      textureLoader,
    });
  }));
  const result = createUnityMountainMaterial({ profile, textures, name });
  result.userData.soStylizedUnityNormalIntegration.textureFlipY = Boolean(textureFlipY);
  return result;
}
