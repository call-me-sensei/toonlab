// Source-faithful runtime for So Stylized's M_SunCloudShadows_LF family.
//
// This is a UE light function, not a surface material. The graph therefore
// multiplies only the owning directional light's direct contribution. UE 5.8
// supplies TextureCoordinate from the light's WorldToLight projection, then
// evaluates the material through the 128 px Light Function Atlas by default.

import {
  DirectionalLight,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { DirectionalLightNode } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  float,
  fract,
  mix,
  positionWorld,
  select,
  texture,
  vec2,
  vec3,
} from 'three/tsl';

import {
  soStylizedScalar,
  soStylizedTexturePath,
} from './soStylizedSourceLibrary.js';

export const SO_STYLIZED_CLOUD_SHADOW_MASTER =
  '/Game/SoStylized/Environment/Sky/Materials/M_SunCloudShadows_LF.M_SunCloudShadows_LF';
export const SO_STYLIZED_CLOUD_SHADOW_STANDARD =
  '/Game/SoStylized/Environment/Sky/Materials/MI_SunCloudShadows_LF.MI_SunCloudShadows_LF';
export const SO_STYLIZED_CLOUD_SHADOW_DESERT =
  '/Game/SoStylized/Environment/Sky/Materials/MI_SunCloudShadows_Desert_LF.MI_SunCloudShadows_Desert_LF';

const DISTORTION_TEXTURE =
  '/Game/SoStylized/Textures/Noise/T_NoiseRough.T_NoiseRough';
const DEFAULT_CLOUD_TEXTURE = DISTORTION_TEXTURE;

// Defaults come from the master graph and ULightComponent's UE 5.8 CDO. The
// supplied full BP_StylizedSky keeps these exact light settings and assigns
// the standard instance; BP_StylizedSky_Lite assigns no light function.
export const SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS = Object.freeze({
  atlas: Object.freeze({
    enabled: true,
    format: 'PF_R8',
    slotResolution: 128,
  }),
  disabledBrightness: 0.5,
  fadeDistanceMeters: 1000,
  lightFunctionScaleCm: Object.freeze([1024, 1024, 1024]),
  parameters: Object.freeze({
    cloudMaxOpacity: 1,
    cloudMultiply: 1,
    cloudSpeedX: 1,
    cloudSpeedY: 1,
    cloudSubtract: 0.2,
    cloudsScale: 50,
    distortion: 1,
    distortionScale: 15,
    windSpeed: 1,
  }),
});

export const SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT = Object.freeze({
  graphSignature: '13d12d9b68a4873c491a847e1e21e8fcd6fb4289ff016071ab8adcb644d05364',
  nodeCount: 51,
  profileCount: 3,
  graph: Object.freeze({
    dayNightGate: 'lerp(1-remap(saturate((cloud.r-CloudSubtract)*CloudMultiply)),1,dayNightTriangle)',
    distortionPanner: 'TexCoord/DistortionScale + Time*(-.002*float2(CloudSpeedX,CloudSpeedY))',
    mainPanner: '(TexCoord+distortion.r*Distortion)/CloudsScale + Time*(-.003*WindSpeed*float2(CloudSpeedY,CloudSpeedX))',
  }),
  projection: 'UE WorldToLight, scale swizzle, z/y TextureCoordinate, UE-to-Three axis and cm/m conversion',
  remainingBridges: Object.freeze([
    'The browser evaluates the mapped graph directly instead of rasterizing and resampling UE 5.8\'s 128x128 PF_R8 light-function atlas, so atlas UNORM quantization, border texels, and derivative-selected source mips remain renderer differences.',
    'The source graph modulates direct surface lighting and captured-scene lighting; UE volumetric-fog, translucent-injection, Lumen, and MegaLights light-function consumers are not separate browser passes.',
    'SnowPines uses BP_StylizedSky_Lite, whose directional light has no light-function material. Pixel parity of the active full BP_StylizedSky path still needs a locked UE capture.',
  ]),
  source: 'M_SunCloudShadows_LF + UE 5.8 LightFunctionCommon/LightFunctionAtlas',
  stage: 'partial',
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector3Array(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    return value.slice(0, 3).map((entry, index) => finiteNumber(entry, fallback[index]));
  }
  if (value?.isVector3) return value.toArray();
  return [...fallback];
}

function quaternionArray(value) {
  if (Array.isArray(value) && value.length >= 4) {
    return value.slice(0, 4).map((entry, index) => finiteNumber(entry, index === 3 ? 1 : 0));
  }
  if (value?.isQuaternion) return value.toArray();
  return [0, 0, 0, 1];
}

/** Resolve the two supplied instances or the master defaults without guessing. */
export function resolveSoStylizedSourceCloudShadowParameters(profile) {
  const defaults = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.parameters;
  return Object.freeze({
    cloudMaxOpacity: soStylizedScalar(profile, 'Cloud Max Opacity', defaults.cloudMaxOpacity),
    cloudMultiply: soStylizedScalar(profile, 'Cloud Multiply', defaults.cloudMultiply),
    cloudSpeedX: soStylizedScalar(profile, 'Cloud SpeedX', defaults.cloudSpeedX),
    cloudSpeedY: soStylizedScalar(profile, 'Cloud SpeedY', defaults.cloudSpeedY),
    cloudSubtract: soStylizedScalar(profile, 'CloudSubtract', defaults.cloudSubtract),
    cloudTexturePath: soStylizedTexturePath(profile, 'Cloud Texture', DEFAULT_CLOUD_TEXTURE),
    cloudsScale: soStylizedScalar(profile, 'Clouds Scale', defaults.cloudsScale),
    distortion: soStylizedScalar(profile, 'Distortion', defaults.distortion),
    distortionScale: soStylizedScalar(profile, 'Distortion Scale', defaults.distortionScale),
    distortionTexturePath: DISTORTION_TEXTURE,
    windSpeed: soStylizedScalar(profile, 'Wind Speed', defaults.windSpeed),
  });
}

/**
 * Build the affine TextureCoordinate projection used by a directional UE
 * light function. Returned axes consume Three world metres directly.
 */
export function computeUeDirectionalLightFunctionProjection({
  lightFunctionScaleCm = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.lightFunctionScaleCm,
  rotation = [0, 0, 0, 1],
  translationCm = [0, 0, 0],
} = {}) {
  const scale = vector3Array(
    lightFunctionScaleCm,
    SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.lightFunctionScaleCm,
  ).map((entry) => Math.max(Math.abs(entry), Number.EPSILON));
  const translation = new Vector3(...vector3Array(translationCm, [0, 0, 0]));
  const inverseRotation = new Quaternion(...quaternionArray(rotation)).normalize().invert();

  // UE Three-axis adapter: UE(X,Y,Z) cm = Three(X,-Z,Y) m * 100.
  const project = (point) => {
    const local = new Vector3(
      point.x * 100,
      -point.z * 100,
      point.y * 100,
    ).sub(translation).applyQuaternion(inverseRotation);
    // LightFunctionCommon swaps z/x after WorldToLight. Combined with UE's
    // (Scale.Z,Scale.Y,Scale.X) inverse-scale swizzle, directional TexCoord is
    // local.z/Scale.X, local.y/Scale.Y.
    return new Vector2(local.z / scale[0], local.y / scale[1]);
  };

  const origin = project(new Vector3());
  const x = project(new Vector3(1, 0, 0)).sub(origin);
  const y = project(new Vector3(0, 1, 0)).sub(origin);
  const z = project(new Vector3(0, 0, 1)).sub(origin);
  return Object.freeze({
    lightFunctionScaleCm: Object.freeze(scale),
    offset: origin,
    uAxis: new Vector3(x.x, y.x, z.x),
    vAxis: new Vector3(x.y, y.y, z.y),
  });
}

function sourceDayNightTriangleNode(state) {
  const currentTime = state.uniforms.currentTime;
  const dayLength = state.uniforms.dayLength;
  const nightLength = state.uniforms.nightLength;
  const dayTriangle = clamp(abs(currentTime.div(dayLength).sub(0.5)).mul(2), 0, 1);
  const nightTriangle = clamp(
    abs(currentTime.sub(dayLength).div(nightLength).sub(0.5)).mul(2),
    0,
    1,
  );
  // AEqualsB is disconnected in the UE If node, so UE compiles A >= B to
  // AGreaterThanB and A < B to ALessThanB (EqualsThreshold is unused).
  return select(currentTime.greaterThanEqual(dayLength), nightTriangle, dayTriangle);
}

/** Build the exact mapped graph as a direct-light visibility TSL node. */
export function createSoStylizedSourceCloudShadowNode({
  cloudTexture,
  distortionTexture,
  parameters,
  projection,
  state,
  disabledBrightness = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.disabledBrightness,
  fadeDistanceMeters = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.fadeDistanceMeters,
  emulateLightFunctionAtlas = true,
}) {
  if (!cloudTexture || !distortionTexture) {
    throw new Error('Both exported cloud-shadow textures are required.');
  }
  if (!state?.uniforms) {
    throw new Error('A So Stylized source environment state is required.');
  }

  const projected = vec2(
    positionWorld.dot(vec3(...projection.uAxis.toArray())),
    positionWorld.dot(vec3(...projection.vAxis.toArray())),
  ).add(vec2(...projection.offset.toArray()));
  // UE 5.8's enabled Light Function Atlas repeats the projected coordinate
  // before sampling its slot. The material graph itself still uses wrap
  // samplers for both 2048 source textures.
  const lightFunctionUv = emulateLightFunctionAtlas ? fract(projected) : projected;
  const distortionSpeed = vec2(
    parameters.cloudSpeedX,
    parameters.cloudSpeedY,
  ).mul(-0.002);
  const distortionUv = lightFunctionUv
    .div(parameters.distortionScale)
    .add(distortionSpeed.mul(state.uniforms.time));
  const distortion = texture(distortionTexture)
    .sample(distortionUv)
    .r
    .mul(parameters.distortion);
  const mainSpeed = vec2(
    parameters.cloudSpeedY,
    parameters.cloudSpeedX,
  ).mul(parameters.windSpeed * -0.003);
  const mainUv = lightFunctionUv
    .add(distortion)
    .div(parameters.cloudsScale)
    .add(mainSpeed.mul(state.uniforms.time));
  const cloud = clamp(
    texture(cloudTexture)
      .sample(mainUv)
      .r
      .sub(parameters.cloudSubtract)
      .mul(parameters.cloudMultiply),
    0,
    1,
  ).mul(parameters.cloudMaxOpacity);
  const graphVisibility = mix(
    cloud.oneMinus(),
    float(1),
    sourceDayNightTriangleNode(state),
  );

  const fadeDistance = Math.max(Number.EPSILON, finiteNumber(fadeDistanceMeters, 1000));
  const viewDistance = positionWorld.sub(cameraPosition).length();
  const distanceFade = clamp(
    float(fadeDistance).sub(viewDistance).div(fadeDistance * 0.2),
    0,
    1,
  );
  return mix(
    float(finiteNumber(disabledBrightness, 0.5)),
    graphVisibility,
    distanceFade,
  );
}

/** CPU evaluator used by deterministic graph fixtures and tooling. */
export function evaluateSoStylizedSourceCloudShadowCpu({
  cameraDistanceMeters = 0,
  currentTime = 0,
  dayLength = 500,
  disabledBrightness = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.disabledBrightness,
  distortionSample = 0,
  fadeDistanceMeters = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.fadeDistanceMeters,
  materialTime = 0,
  nightLength = 500,
  parameters = SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.parameters,
  projectedUv = [0, 0],
  sampleCloud = () => 0,
  emulateLightFunctionAtlas = true,
} = {}) {
  const fractNumber = (value) => value - Math.floor(value);
  const baseUv = emulateLightFunctionAtlas
    ? projectedUv.map(fractNumber)
    : [...projectedUv];
  const distortionUv = [
    baseUv[0] / parameters.distortionScale
      + materialTime * parameters.cloudSpeedX * -0.002,
    baseUv[1] / parameters.distortionScale
      + materialTime * parameters.cloudSpeedY * -0.002,
  ];
  const distortion = finiteNumber(distortionSample, 0) * parameters.distortion;
  const mainUv = [
    (baseUv[0] + distortion) / parameters.cloudsScale
      + materialTime * parameters.cloudSpeedY * parameters.windSpeed * -0.003,
    (baseUv[1] + distortion) / parameters.cloudsScale
      + materialTime * parameters.cloudSpeedX * parameters.windSpeed * -0.003,
  ];
  const cloudSample = finiteNumber(sampleCloud(mainUv, distortionUv), 0);
  const saturated = Math.min(
    1,
    Math.max(0, (cloudSample - parameters.cloudSubtract) * parameters.cloudMultiply),
  );
  const cloud = saturated * parameters.cloudMaxOpacity;
  const dayTriangle = Math.min(1, Math.max(0, Math.abs(currentTime / dayLength - 0.5) * 2));
  const nightTriangle = Math.min(
    1,
    Math.max(0, Math.abs((currentTime - dayLength) / nightLength - 0.5) * 2),
  );
  const cycle = currentTime >= dayLength ? nightTriangle : dayTriangle;
  const graphVisibility = (1 - cloud) * (1 - cycle) + cycle;
  const distanceFade = Math.min(
    1,
    Math.max(0, (fadeDistanceMeters - cameraDistanceMeters) / (fadeDistanceMeters * 0.2)),
  );
  const visibility = disabledBrightness * (1 - distanceFade)
    + graphVisibility * distanceFade;
  return Object.freeze({
    baseUv: Object.freeze(baseUv),
    cloud,
    cloudSample,
    cycle,
    distanceFade,
    distortion,
    distortionUv: Object.freeze(distortionUv),
    graphVisibility,
    mainUv: Object.freeze(mainUv),
    visibility,
  });
}

/** Directional-light node that applies the source light function after CSM. */
export class SoStylizedSourceDirectionalLightNode extends DirectionalLightNode {
  static get type() {
    return 'SoStylizedSourceDirectionalLightNode';
  }

  setupDirect(builder) {
    const direct = super.setupDirect(builder);
    const contract = this.light?.userData?.soStylizedSourceCloudShadow;
    if (!contract?.enabled || !contract.visibilityNode) return direct;
    return {
      ...direct,
      lightColor: direct.lightColor.mul(contract.visibilityNode),
    };
  }
}

export function installSoStylizedSourceCloudShadowLightNode(renderer) {
  if (!renderer?.library?.lightNodes) {
    throw new Error('A WebGPU renderer node library is required.');
  }
  renderer.library.lightNodes.set(DirectionalLight, SoStylizedSourceDirectionalLightNode);
}

/** Load the authored graph textures and bind its visibility to one light. */
export async function bindSoStylizedSourceCloudShadow(light, {
  component = {},
  emulateLightFunctionAtlas = true,
  library,
  profile = SO_STYLIZED_CLOUD_SHADOW_STANDARD,
  state,
} = {}) {
  if (!light?.isDirectionalLight) {
    throw new Error('A THREE.DirectionalLight is required.');
  }
  if (!library) throw new Error('A So Stylized source library is required.');
  const resolvedProfile = library.resolveMaterial(profile);
  if (!resolvedProfile || resolvedProfile.family !== 'cloudShadow') {
    throw new Error(`Unknown So Stylized cloud-shadow profile: ${profile}`);
  }
  const parameters = resolveSoStylizedSourceCloudShadowParameters(resolvedProfile);
  const [cloudTexture, distortionTexture] = await Promise.all([
    library.loadTexture(parameters.cloudTexturePath),
    library.loadTexture(parameters.distortionTexturePath),
  ]);
  const properties = component.properties ?? component;
  const projection = computeUeDirectionalLightFunctionProjection({
    lightFunctionScaleCm: properties.light_function_scale
      ?? SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.lightFunctionScaleCm,
    rotation: component.transform?.rotation ?? [0, 0, 0, 1],
    translationCm: component.transform?.translation ?? [0, 0, 0],
  });
  const disabledBrightness = finiteNumber(
    properties.disabled_brightness,
    SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.disabledBrightness,
  );
  const fadeDistanceMeters = finiteNumber(
    properties.light_function_fade_distance,
    SO_STYLIZED_CLOUD_SHADOW_SOURCE_DEFAULTS.fadeDistanceMeters * 100,
  ) * 0.01;
  const visibilityNode = createSoStylizedSourceCloudShadowNode({
    cloudTexture,
    disabledBrightness,
    distortionTexture,
    emulateLightFunctionAtlas,
    fadeDistanceMeters,
    parameters,
    projection,
    state,
  });
  const contract = {
    bridges: [...SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT.remainingBridges],
    disabledBrightness,
    emulateLightFunctionAtlas,
    enabled: true,
    fadeDistanceMeters,
    parameters,
    profile: resolvedProfile,
    projection,
    runtime: SO_STYLIZED_CLOUD_SHADOW_RUNTIME_CONTRACT,
    textures: { cloudTexture, distortionTexture },
    visibilityNode,
  };
  light.userData.soStylizedSourceCloudShadow = contract;
  return contract;
}

export function unbindSoStylizedSourceCloudShadow(light) {
  if (light?.userData) delete light.userData.soStylizedSourceCloudShadow;
}
