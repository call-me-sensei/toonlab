// Semantic style overlay for retained P18 vegetation materials.
//
// P18 remains the visual authority: the accepted Call Me Sensei settings are
// evaluated beside the edited settings and only their delta is layered over
// the retained source graph. At the baseline the delta is exactly zero, so the
// lab never replaces the approved source material merely to expose controls.

import {
  abs,
  cameraPosition,
  clamp,
  dot,
  faceDirection,
  floor,
  fract,
  max,
  mix,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';

import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { stylizedCloudShadow } from '../shaders-tsl/chunks/stylized-cloud-shadow.js';
import { createVegetationStyleUniforms } from '../shaders-tsl/chunks/vegetation-style.js';
import {
  createVegetationShaderScopeSettings,
  getVegetationShaderScopeFieldSchema,
  VEGETATION_MATERIAL_ROLES,
  VEGETATION_SHARED_SHADER_GROUP_IDS,
} from './vegetationShaders.js';

const TREE_ROLE_GROUP = Object.freeze({
  [VEGETATION_MATERIAL_ROLES.foliageCard]: 'foliage',
  [VEGETATION_MATERIAL_ROLES.woodySurface]: 'bark',
});

function groupFieldPaths(scope, groups, role) {
  const schema = getVegetationShaderScopeFieldSchema(scope);
  return groups.flatMap((groupId) => Object.values(schema[groupId] ?? {})
    .filter((field) => !role || field.roles.includes(role))
    .map((field) => field.id));
}

export function getP18VegetationOverlayFields(scope, role = null) {
  const groups = [...VEGETATION_SHARED_SHADER_GROUP_IDS];
  if (scope === 'tree' && TREE_ROLE_GROUP[role]) groups.push(TREE_ROLE_GROUP[role]);
  return Object.freeze(groupFieldPaths(scope, groups, role));
}

function withWorldState(uniforms, state) {
  const world = state?.uniforms ?? {};
  if (world.rainWetness) uniforms.uWetness.value = world.rainWetness.value;
  if (world.snowCover) uniforms.uSnowCover.value = world.snowCover.value;
  return uniforms;
}

function sharedInputs(state) {
  const world = state?.uniforms ?? {};
  return {
    cloudShadow: stylizedCloudShadow(
      positionWorld.xz,
      world.time,
      0.62,
      0.58,
      0.035,
      vec2(0.007, -0.004),
    ),
    sceneShadow: sampleEnvironmentSunShadow(positionWorld),
    skyColor: world.skyColor,
    sunColor: world.sunColor,
    sunDirection: normalize(world.sunDirection.negate()),
  };
}

function stylizedNormal(u, thinSurface) {
  if (!thinSurface) return normalize(normalWorld);
  const doubleSided = normalWorld.mul(faceDirection);
  const faceAware = mix(normalWorld, doubleSided, u.uStyleThinSurfaceTwoSidedLighting);
  return normalize(mix(
    faceAware,
    vec3(0, 1, 0),
    u.uStyleThinSurfaceNormalUpBias,
  ));
}

function applySharedTreatment(baseColor, u, inputs, {
  cloudShadowResponse = 0,
  sceneShadowResponse = 1,
  thinSurface = false,
  transmissionMultiplier = 1,
} = {}) {
  const normal = stylizedNormal(u, thinSurface);
  const nDotL = clamp(dot(normal, inputs.sunDirection), 0, 1);
  const direct = thinSurface
    ? clamp(
      nDotL.mul(u.uStyleThinSurfaceDiffuseWrap.oneMinus())
        .add(u.uStyleThinSurfaceDiffuseWrap),
      0,
      1,
    )
    : nDotL;
  const sceneVisibility = mix(1, inputs.sceneShadow, sceneShadowResponse);
  const cloudVisibility = mix(1, inputs.cloudShadow, cloudShadowResponse);
  const visibility = sceneVisibility.mul(cloudVisibility);
  const lit = direct.mul(visibility);

  const shadowAmount = lit.oneMinus()
    .mul(u.uStyleLightingShadowTintStrength);
  const shadowedColor = baseColor.mul(mix(
    vec3(1),
    u.uStyleLightingShadowTint,
    clamp(shadowAmount, 0, 1),
  ));
  const sunTintedColor = shadowedColor.mul(mix(
    vec3(1),
    inputs.sunColor,
    lit.mul(u.uStyleLightingSunTintStrength),
  ));
  const skyFilledColor = sunTintedColor.add(
    inputs.skyColor.mul(lit.oneMinus()).mul(u.uStyleLightingSkyFillStrength),
  );

  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(
    clamp(abs(dot(normal, viewDirection)).oneMinus(), 0, 1),
    u.uStyleLightingRimPower,
  );
  const rimmedColor = skyFilledColor.add(
    inputs.skyColor.mul(rim).mul(u.uStyleLightingRimStrength),
  );
  const color = thinSurface
    ? rimmedColor.add(inputs.sunColor.mul(
      pow(
      clamp(dot(viewDirection, inputs.sunDirection.negate()), 0, 1),
      u.uStyleThinSurfaceTransmissionPower,
      )
        .mul(u.uStyleThinSurfaceTransmissionStrength)
        .mul(transmissionMultiplier),
    ).mul(mix(
      u.uStyleThinSurfaceTransmissionShadowFloor,
      1,
      visibility,
    )))
    : rimmedColor;

  return {
    color,
    direct,
    normal,
    rim,
    visibility,
    viewDirection,
  };
}

function applyWeatherTreatment(baseColor, u, inputs, { thinSurface = false } = {}) {
  const normal = stylizedNormal(u, thinSurface);
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(
    clamp(abs(dot(normal, viewDirection)).oneMinus(), 0, 1),
    u.uStyleLightingRimPower,
  );
  const wet = clamp(u.uWetness.mul(u.uWetnessResponse), 0, 1);
  const darkenedColor = baseColor.mul(
    wet.mul(u.uStyleWeatherResponseWetDarkening).oneMinus(),
  );
  const luminance = dot(darkenedColor, vec3(0.299, 0.587, 0.114));
  const desaturatedColor = mix(
    darkenedColor,
    vec3(luminance),
    wet.mul(u.uStyleWeatherResponseWetDesaturation),
  );
  return desaturatedColor.add(
    inputs.sunColor.mul(wet).mul(u.uStyleWeatherResponseWetHighlightStrength)
      .mul(rim.mul(0.5).add(0.08)),
  );
}

function applyFoliageTreatment(baseColor, u, inputs, bounds) {
  const shared = applySharedTreatment(baseColor, u, inputs, {
    cloudShadowResponse: u.uStyleFoliageCloudShadowResponse,
    sceneShadowResponse: u.uStyleFoliageSceneShadowResponse,
    thinSurface: true,
    transmissionMultiplier: u.uStyleFoliageTransmissionPowerMultiplier,
  });
  const halfSoftness = u.uStyleFoliageBandSoftness.mul(0.5);
  const band = smoothstep(
    u.uStyleFoliageBandThreshold.sub(halfSoftness),
    u.uStyleFoliageBandThreshold.add(halfSoftness),
    shared.direct,
  ).mul(shared.visibility);
  const bandedColor = shared.color.mul(mix(0.58, 1, band));

  const height = clamp(
    positionLocal.y.sub(bounds.localMinY).div(max(bounds.localHeight, 0.001)),
    0,
    1,
  );
  const crestHalf = u.uStyleFoliageCrestSoftness.mul(0.5);
  const crest = smoothstep(
    u.uStyleFoliageCrestThreshold.sub(crestHalf),
    u.uStyleFoliageCrestThreshold.add(crestHalf),
    height,
  );
  const crestedColor = bandedColor.add(bandedColor.mul(crest).mul(0.12));
  const occludedColor = crestedColor.mul(
    shared.visibility.oneMinus()
      .mul(u.uStyleFoliageCrownOcclusionStrength)
      .oneMinus(),
  );

  const paintedLuminance = dot(baseColor, vec3(0.299, 0.587, 0.114));
  const luminanceVariedColor = occludedColor.mul(mix(
    1,
    paintedLuminance.mul(0.8).add(0.6),
    u.uStyleFoliageSpriteLuminanceStrength,
  ));
  const cardNoise = fract(sin(
    dot(positionWorld.xz, vec2(12.9898, 78.233)),
  ).mul(43758.5453)).sub(0.5).mul(2);
  const cardVariedColor = luminanceVariedColor.mul(
    cardNoise.mul(u.uStyleFoliageCardVariationStrength).mul(0.35).add(1),
  );

  const backlit = pow(
    clamp(dot(shared.viewDirection, inputs.sunDirection.negate()), 0, 1),
    u.uStyleThinSurfaceTransmissionPower
      .mul(u.uStyleFoliageTransmissionPowerMultiplier),
  );
  return cardVariedColor.add(
    inputs.sunColor.mul(backlit)
      .mul(u.uStyleFoliageBacklitStrength)
      .mul(0.2),
  );
}

function applyBarkTreatment(baseColor, u, inputs, bounds) {
  const shared = applySharedTreatment(baseColor, u, inputs);
  const intervals = max(u.uStyleBarkBandCount.sub(1), 1);
  const stepped = floor(
    shared.direct.mul(shared.visibility).mul(intervals).add(0.0001),
  ).div(intervals);
  const band = mix(
    stepped,
    shared.direct.mul(shared.visibility),
    u.uStyleBarkBandSoftness,
  );
  const bandedColor = shared.color.mul(mix(u.uStyleBarkShadowFloor, 1, band));
  const sunTintedColor = bandedColor.mul(mix(
    vec3(1),
    inputs.sunColor,
    band.mul(u.uStyleBarkSunTintStrength),
  ));
  const skyFilledColor = sunTintedColor.add(
    inputs.skyColor.mul(band.oneMinus()).mul(u.uStyleBarkSkyFillStrength),
  );
  const rimmedColor = skyFilledColor.add(
    inputs.skyColor.mul(shared.rim).mul(u.uStyleBarkRimStrength),
  );
  const height = clamp(
    positionLocal.y.sub(bounds.localMinY).div(max(bounds.localHeight, 0.001)),
    0,
    1,
  );
  return rimmedColor.mul(
    height.oneMinus().mul(u.uStyleBarkVerticalShadeStrength).mul(0.5).oneMinus(),
  );
}

function evaluate(baseColor, u, inputs, scope, role, bounds) {
  if (scope === 'tree' && role === VEGETATION_MATERIAL_ROLES.foliageCard) {
    return applyFoliageTreatment(baseColor, u, inputs, bounds);
  }
  if (scope === 'tree' && role === VEGETATION_MATERIAL_ROLES.woodySurface) {
    return applyBarkTreatment(baseColor, u, inputs, bounds);
  }
  return applySharedTreatment(baseColor, u, inputs, {
    thinSurface: role !== VEGETATION_MATERIAL_ROLES.woodySurface
      && role !== VEGETATION_MATERIAL_ROLES.herbaceousStem,
  }).color;
}

export function applyP18VegetationStyleOverlay(material, scope, settings, {
  localHeight = 1,
  localMinY = 0,
  role,
  state,
} = {}) {
  if (!material?.colorNode || !state?.uniforms) return Object.freeze([]);
  const baseline = createVegetationShaderScopeSettings(scope, {
    preset: 'call_me_sensei',
  });
  const currentUniforms = withWorldState(
    createVegetationStyleUniforms(settings, role),
    state,
  );
  // P18 is approved in its dry, snow-free state. Keep the reference side
  // neutral so preview wetness/snow exercises the edited response instead of
  // being subtracted away with the baseline treatment.
  const baselineUniforms = createVegetationStyleUniforms(baseline, role);
  const inputs = sharedInputs(state);
  const bounds = {
    localHeight,
    localMinY,
  };
  const retainedColor = material.colorNode;
  const current = evaluate(retainedColor, currentUniforms, inputs, scope, role, bounds);
  const accepted = evaluate(retainedColor, baselineUniforms, inputs, scope, role, bounds);
  const styledColor = retainedColor.add(current.sub(accepted));
  const thinSurface = role === VEGETATION_MATERIAL_ROLES.grassBlade
    || role === VEGETATION_MATERIAL_ROLES.foliageCard
    || role === VEGETATION_MATERIAL_ROLES.flowerPetal;
  const finalColor = applyWeatherTreatment(
    styledColor,
    currentUniforms,
    inputs,
    { thinSurface },
  );
  const snowNormal = stylizedNormal(currentUniforms, thinSurface);
  const snowSoftness = max(
    currentUniforms.uStyleWeatherResponseSnowEdgeSoftness,
    0.001,
  );
  // Thin cards represent leaf/needle/blade volumes rather than literal flat
  // sheets. Use a stable retention response so the lab can inspect snow on
  // card-authored vegetation; opaque surfaces retain world-up accumulation.
  const snowFacing = thinSurface
    ? 0.9
    : smoothstep(
      snowSoftness.mul(-0.25),
      snowSoftness.mul(0.75),
      snowNormal.y,
    );
  const snow = clamp(
    currentUniforms.uSnowCover
      .mul(currentUniforms.uSnowRetention)
      .mul(snowFacing),
    0,
    1,
  );
  const snowTint = currentUniforms.uStyleWeatherResponseSnowTint.mul(mix(
    currentUniforms.uStyleWeatherResponseSnowShadowStrength,
    1,
    inputs.sceneShadow,
  ));
  // The retained P18 SSS/default-lit adapters finalize their diffuse input
  // before this fixture overlay is attached. Feed the semantic delta through
  // the material's additive output as well, which preserves the source graph
  // at a zero delta and guarantees the authored correction survives those
  // custom lighting models.
  const colorCorrection = finalColor.sub(retainedColor)
    .add(snowTint.sub(styledColor).mul(snow));
  material.emissiveNode = (material.emissiveNode ?? vec3(0)).add(colorCorrection);
  material.needsUpdate = true;
  material.uniforms = {
    ...(material.uniforms ?? {}),
    ...currentUniforms,
  };
  return getP18VegetationOverlayFields(scope, role);
}
