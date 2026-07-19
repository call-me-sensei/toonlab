// Shared vegetation style nodes. These uniforms describe the IP's rendering
// treatment; current sun, wind, weather amounts, albedo, and interaction stay
// in their own namespaces so applying a style cannot overwrite world state.

import * as THREE from 'three';
import {
  abs,
  cameraPosition,
  clamp,
  dot,
  faceDirection,
  mix,
  normalize,
  pow,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

const FALLBACK = Object.freeze({
  lighting: Object.freeze({
    rimPower: 3,
    rimStrength: 0.12,
    shadowTint: Object.freeze([0.36, 0.4, 0.58]),
    shadowTintStrength: 1,
    skyFillStrength: 0.08,
    sunTintStrength: 0.25,
  }),
  thinSurface: Object.freeze({
    diffuseWrap: 0.5,
    normalUpBias: 0,
    transmissionPower: 3.5,
    transmissionShadowFloor: 0.35,
    transmissionStrength: 0.35,
    twoSidedLighting: 1,
  }),
  weatherResponse: Object.freeze({
    snowEdgeSoftness: 0.2,
    snowShadowStrength: 0.65,
    snowTint: Object.freeze([0.92, 0.96, 1]),
    wetDarkening: 0.15,
    wetDesaturation: 0.05,
    wetHighlightStrength: 0.2,
  }),
  grass: Object.freeze({
    backlitStrength: 0.4,
    bandSoftness: 0.1,
    bandThreshold: 0.49,
    bendExponent: 2,
    cloudShadowResponse: 0.35,
    colorVariationStrength: 0.2,
    gustSheenStrength: 0.22,
    gustSheenThreshold: 0.78,
    interactionResponse: 1,
    rootOcclusionHeight: 0.62,
    rootOcclusionStrength: 0.36,
    sceneShadowResponse: 0.7,
    shadowFloor: 0.35,
    tipGradientEnd: 0.95,
    tipGradientStart: 0.1,
  }),
  foliage: Object.freeze({
    backlitStrength: 0.35,
    bandSoftness: 0.18,
    bandThreshold: 0.47,
    cardVariationStrength: 0.16,
    cloudShadowResponse: 0,
    crestSoftness: 0.12,
    crestThreshold: 0.72,
    crownOcclusionStrength: 0.2,
    sceneShadowResponse: 0.55,
    spriteLuminanceStrength: 0.36,
    transmissionPowerMultiplier: 1,
  }),
  flower: Object.freeze({
    backlitStrength: 0.35,
    bandSoftness: 0.1,
    bandThreshold: 0.5,
    centerLightResponse: 0.8,
    centerShadowResponse: 1,
    cupDarkeningStrength: 0.1,
    petalTransmissionMultiplier: 1,
    sceneShadowResponse: 0.85,
    unlitPetalLift: 0.35,
  }),
  bark: Object.freeze({
    bandCount: 3,
    bandSoftness: 0,
    rimStrength: 0,
    shadowFloor: 0.35,
    skyFillStrength: 0.04,
    specularStrength: 0,
    sunTintStrength: 0.15,
    verticalShadeStrength: 0,
  }),
  stem: Object.freeze({
    bandCount: 3,
    bandSoftness: 0.08,
    shadowFloor: 0.42,
    skyFillStrength: 0.06,
    transmissionStrength: 0.08,
    rimStrength: 0.02,
  }),
});

function sourceSettings(profile) {
  return profile?.settings && typeof profile.settings === 'object' ? profile.settings : (profile ?? {});
}

function value(settings, group, key) {
  return settings?.[group]?.[key] ?? FALLBACK[group][key];
}

function color(settings, group, key) {
  const rgb = value(settings, group, key);
  return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

/** Uniform contract shared by every vegetation material role. */
export function createVegetationStyleUniforms(profile = {}, role = null) {
  const settings = sourceSettings(profile);
  const roles = new Set((Array.isArray(role) ? role : [role]).filter(Boolean));
  const hasRole = (...candidates) => candidates.some((candidate) => roles.has(candidate));
  const u = {
    uSnowCover: uniform(0),
    uSnowRetention: uniform(1),
    uStyleLightingRimPower: uniform(value(settings, 'lighting', 'rimPower')),
    uStyleLightingRimStrength: uniform(value(settings, 'lighting', 'rimStrength')),
    uStyleLightingShadowTint: uniform(color(settings, 'lighting', 'shadowTint')),
    uStyleLightingShadowTintStrength: uniform(value(settings, 'lighting', 'shadowTintStrength')),
    uStyleLightingSkyFillStrength: uniform(value(settings, 'lighting', 'skyFillStrength')),
    uStyleLightingSunTintStrength: uniform(value(settings, 'lighting', 'sunTintStrength')),
    uStyleWeatherResponseSnowEdgeSoftness: uniform(value(settings, 'weatherResponse', 'snowEdgeSoftness')),
    uStyleWeatherResponseSnowShadowStrength: uniform(value(settings, 'weatherResponse', 'snowShadowStrength')),
    uStyleWeatherResponseSnowTint: uniform(color(settings, 'weatherResponse', 'snowTint')),
    uStyleWeatherResponseWetDarkening: uniform(value(settings, 'weatherResponse', 'wetDarkening')),
    uStyleWeatherResponseWetDesaturation: uniform(value(settings, 'weatherResponse', 'wetDesaturation')),
    uStyleWeatherResponseWetHighlightStrength: uniform(value(settings, 'weatherResponse', 'wetHighlightStrength')),
    uWetness: uniform(0),
    uWetnessResponse: uniform(1),
  };

  if (hasRole('grassBlade', 'foliageCard', 'flowerPetal')) Object.assign(u, {
    uStyleThinSurfaceDiffuseWrap: uniform(value(settings, 'thinSurface', 'diffuseWrap')),
    uStyleThinSurfaceNormalUpBias: uniform(value(settings, 'thinSurface', 'normalUpBias')),
    uStyleThinSurfaceTransmissionPower: uniform(value(settings, 'thinSurface', 'transmissionPower')),
    uStyleThinSurfaceTransmissionShadowFloor: uniform(value(settings, 'thinSurface', 'transmissionShadowFloor')),
    uStyleThinSurfaceTransmissionStrength: uniform(value(settings, 'thinSurface', 'transmissionStrength')),
    uStyleThinSurfaceTwoSidedLighting: uniform(value(settings, 'thinSurface', 'twoSidedLighting')),
  });
  if (hasRole('grassBlade')) Object.assign(u, {
    uStyleGrassBacklitStrength: uniform(value(settings, 'grass', 'backlitStrength')),
    uStyleGrassBandSoftness: uniform(value(settings, 'grass', 'bandSoftness')),
    uStyleGrassBandThreshold: uniform(value(settings, 'grass', 'bandThreshold')),
    uStyleGrassBendExponent: uniform(value(settings, 'grass', 'bendExponent')),
    uStyleGrassCloudShadowResponse: uniform(value(settings, 'grass', 'cloudShadowResponse')),
    uStyleGrassColorVariationStrength: uniform(value(settings, 'grass', 'colorVariationStrength')),
    uStyleGrassGustSheenStrength: uniform(value(settings, 'grass', 'gustSheenStrength')),
    uStyleGrassGustSheenThreshold: uniform(value(settings, 'grass', 'gustSheenThreshold')),
    uStyleGrassInteractionResponse: uniform(value(settings, 'grass', 'interactionResponse')),
    uStyleGrassRootOcclusionHeight: uniform(value(settings, 'grass', 'rootOcclusionHeight')),
    uStyleGrassRootOcclusionStrength: uniform(value(settings, 'grass', 'rootOcclusionStrength')),
    uStyleGrassSceneShadowResponse: uniform(value(settings, 'grass', 'sceneShadowResponse')),
    uStyleGrassShadowFloor: uniform(value(settings, 'grass', 'shadowFloor')),
    uStyleGrassTipGradientEnd: uniform(value(settings, 'grass', 'tipGradientEnd')),
    uStyleGrassTipGradientStart: uniform(value(settings, 'grass', 'tipGradientStart')),
  });
  if (hasRole('foliageCard')) Object.assign(u, {
    uStyleFoliageBacklitStrength: uniform(value(settings, 'foliage', 'backlitStrength')),
    uStyleFoliageBandSoftness: uniform(value(settings, 'foliage', 'bandSoftness')),
    uStyleFoliageBandThreshold: uniform(value(settings, 'foliage', 'bandThreshold')),
    uStyleFoliageCardVariationStrength: uniform(value(settings, 'foliage', 'cardVariationStrength')),
    uStyleFoliageCloudShadowResponse: uniform(value(settings, 'foliage', 'cloudShadowResponse')),
    uStyleFoliageCrestSoftness: uniform(value(settings, 'foliage', 'crestSoftness')),
    uStyleFoliageCrestThreshold: uniform(value(settings, 'foliage', 'crestThreshold')),
    uStyleFoliageCrownOcclusionStrength: uniform(value(settings, 'foliage', 'crownOcclusionStrength')),
    uStyleFoliageSceneShadowResponse: uniform(value(settings, 'foliage', 'sceneShadowResponse')),
    uStyleFoliageSpriteLuminanceStrength: uniform(value(settings, 'foliage', 'spriteLuminanceStrength')),
    uStyleFoliageTransmissionPowerMultiplier: uniform(value(settings, 'foliage', 'transmissionPowerMultiplier')),
  });
  if (hasRole('flowerPetal', 'flowerCenter')) Object.assign(u, {
    uStyleFlowerBandSoftness: uniform(value(settings, 'flower', 'bandSoftness')),
    uStyleFlowerBandThreshold: uniform(value(settings, 'flower', 'bandThreshold')),
    uStyleFlowerSceneShadowResponse: uniform(value(settings, 'flower', 'sceneShadowResponse')),
  });
  if (hasRole('flowerPetal')) Object.assign(u, {
    uStyleFlowerBacklitStrength: uniform(value(settings, 'flower', 'backlitStrength')),
    uStyleFlowerCupDarkeningStrength: uniform(value(settings, 'flower', 'cupDarkeningStrength')),
    uStyleFlowerPetalTransmissionMultiplier: uniform(value(settings, 'flower', 'petalTransmissionMultiplier')),
    uStyleFlowerUnlitPetalLift: uniform(value(settings, 'flower', 'unlitPetalLift')),
  });
  if (hasRole('flowerCenter')) Object.assign(u, {
    uStyleFlowerCenterLightResponse: uniform(value(settings, 'flower', 'centerLightResponse')),
    uStyleFlowerCenterShadowResponse: uniform(value(settings, 'flower', 'centerShadowResponse')),
  });
  if (hasRole('herbaceousStem')) Object.assign(u, {
    uStyleStemBandCount: uniform(value(settings, 'stem', 'bandCount')),
    uStyleStemBandSoftness: uniform(value(settings, 'stem', 'bandSoftness')),
    uStyleStemShadowFloor: uniform(value(settings, 'stem', 'shadowFloor')),
    uStyleStemRimStrength: uniform(value(settings, 'stem', 'rimStrength')),
    uStyleStemSkyFillStrength: uniform(value(settings, 'stem', 'skyFillStrength')),
    uStyleStemTransmissionStrength: uniform(value(settings, 'stem', 'transmissionStrength')),
  });
  if (hasRole('woodySurface')) Object.assign(u, {
    uStyleBarkBandCount: uniform(value(settings, 'bark', 'bandCount')),
    uStyleBarkBandSoftness: uniform(value(settings, 'bark', 'bandSoftness')),
    uStyleBarkRimStrength: uniform(value(settings, 'bark', 'rimStrength')),
    uStyleBarkShadowFloor: uniform(value(settings, 'bark', 'shadowFloor')),
    uStyleBarkSkyFillStrength: uniform(value(settings, 'bark', 'skyFillStrength')),
    uStyleBarkSpecularStrength: uniform(value(settings, 'bark', 'specularStrength')),
    uStyleBarkSunTintStrength: uniform(value(settings, 'bark', 'sunTintStrength')),
    uStyleBarkVerticalShadeStrength: uniform(value(settings, 'bark', 'verticalShadeStrength')),
  });
  return u;
}

export function vegetationBand(wrap, threshold, softness) {
  const half = softness.mul(0.5);
  return smoothstep(threshold.sub(half), threshold.add(half), wrap);
}

export function vegetationVisibility(
  sceneShadow,
  cloudShadow,
  sceneShadowResponse,
  cloudShadowResponse = 1,
) {
  const scene = mix(1.0, sceneShadow, sceneShadowResponse);
  const cloud = mix(1.0, cloudShadow, cloudShadowResponse);
  return scene.mul(cloud);
}

/** Common thin-surface lighting. Family shaders can layer role bands on top. */
export function shadeVegetationSurface({
  baseColor,
  bandOverride = null,
  bandSoftness,
  bandThreshold,
  cloudShadow,
  u,
  diffuseWrap = u.uStyleThinSurfaceDiffuseWrap,
  normal,
  normalUpBias = u.uStyleThinSurfaceNormalUpBias,
  materialShadowColor = null,
  sceneShadow,
  sceneShadowResponse,
  cloudShadowResponse = 1,
  shadowFloor,
  skyColor,
  sunColor,
  sunDirection,
  rimStrength = u.uStyleLightingRimStrength,
  transmissionMultiplier = 1,
  transmissionPower = u.uStyleThinSurfaceTransmissionPower,
  transmissionShadowFloor = u.uStyleThinSurfaceTransmissionShadowFloor,
  transmissionStrength = u.uStyleThinSurfaceTransmissionStrength,
  twoSidedLighting = u.uStyleThinSurfaceTwoSidedLighting,
  skyFillStrength = u.uStyleLightingSkyFillStrength,
  worldPosition,
}) {
  const doubleSidedNormal = normal.mul(faceDirection);
  const faceAwareNormal = mix(normal, doubleSidedNormal, twoSidedLighting);
  const styledNormal = normalize(mix(
    faceAwareNormal,
    vec3(0, 1, 0),
    normalUpBias,
  ));
  const sun = normalize(sunDirection);
  const wrap = dot(styledNormal, sun)
    .mul(diffuseWrap.oneMinus())
    .add(diffuseWrap);
  const visibility = vegetationVisibility(
    sceneShadow,
    cloudShadow,
    sceneShadowResponse,
    cloudShadowResponse,
  ).toVar();
  const band = (bandOverride ?? vegetationBand(wrap, bandThreshold, bandSoftness))
    .mul(visibility).toVar();
  const colorNode = baseColor.mul(mix(shadowFloor, 1.0, band)).toVar();

  // An asset palette may carry its own shadow tone (grass and tree foliage
  // are the common cases). It establishes the material identity in shadow;
  // the IP-wide treatment tint below still layers over every material.
  const materialShadowAmount = visibility.oneMinus();
  if (materialShadowColor) {
    colorNode.assign(mix(
      colorNode,
      materialShadowColor,
      clamp(materialShadowAmount, 0, 1),
    ));
  }
  const shadowAmount = materialShadowAmount.mul(u.uStyleLightingShadowTintStrength);
  colorNode.mulAssign(mix(
    vec3(1),
    u.uStyleLightingShadowTint,
    clamp(shadowAmount, 0, 1),
  ));
  colorNode.mulAssign(mix(vec3(1), sunColor, band.mul(u.uStyleLightingSunTintStrength)));
  colorNode.addAssign(skyColor.mul(band.oneMinus()).mul(skyFillStrength));

  const viewDirection = normalize(cameraPosition.sub(worldPosition));
  const rim = pow(
    clamp(abs(dot(styledNormal, viewDirection)).oneMinus(), 0, 1),
    u.uStyleLightingRimPower,
  );
  colorNode.addAssign(skyColor.mul(rim).mul(rimStrength));
  const transmission = pow(
    clamp(dot(viewDirection, sun.negate()), 0, 1),
    transmissionPower,
  ).mul(transmissionStrength).mul(transmissionMultiplier);
  colorNode.addAssign(
    sunColor.mul(transmission).mul(mix(
      transmissionShadowFloor,
      1,
      visibility,
    )),
  );

  const wet = clamp(u.uWetness.mul(u.uWetnessResponse), 0, 1).toVar();
  colorNode.mulAssign(wet.mul(u.uStyleWeatherResponseWetDarkening).oneMinus());
  const luminance = dot(colorNode, vec3(0.299, 0.587, 0.114));
  colorNode.assign(mix(
    colorNode,
    vec3(luminance),
    wet.mul(u.uStyleWeatherResponseWetDesaturation),
  ));
  colorNode.addAssign(
    sunColor.mul(wet).mul(u.uStyleWeatherResponseWetHighlightStrength)
      .mul(rim.mul(0.5).add(0.08)),
  );

  const snowSoftness = u.uStyleWeatherResponseSnowEdgeSoftness.max(0.001);
  const snowEdge = snowSoftness.mul(0.5);
  const snowFacing = smoothstep(
    snowSoftness.mul(0.25).sub(snowEdge),
    snowSoftness.mul(0.25).add(snowEdge),
    styledNormal.y,
  );
  const snow = clamp(u.uSnowCover.mul(u.uSnowRetention).mul(snowFacing), 0, 1);
  const snowTint = u.uStyleWeatherResponseSnowTint.mul(mix(
    u.uStyleWeatherResponseSnowShadowStrength,
    1,
    visibility,
  ));
  colorNode.assign(mix(colorNode, snowTint, snow));

  return { band, color: colorNode, normal: styledNormal, visibility, viewDirection };
}

export function tagVegetationRole(material, role, variant) {
  const roles = Object.freeze([...new Set((Array.isArray(role) ? role : [role]).filter(Boolean))]);
  material.userData.toonlabVegetation = Object.freeze({
    role: roles[0] ?? '',
    roles,
    variant,
    version: 1,
  });
  return material;
}
