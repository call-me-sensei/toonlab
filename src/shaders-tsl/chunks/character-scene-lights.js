// TSL replacement for the three.js classic light uniforms the GLSL character
// shader consumes via <lights_pars_begin> (directionalLights[0], pointLights,
// spotLights, hemisphereLights, ambientLightColor).
//
// The node renderer has its own light system (LightsNode + LightingModel),
// but the toon model needs raw ingredients — the first directional light as
// "the main light", per-light toon bands instead of physical accumulation,
// and the shadow mask separate from the light color — so the light state is
// mirrored into shared uniforms instead. `syncToonSceneLights(scene, camera)`
// runs from the converted meshes' onBeforeRender (both renderers call it),
// so no per-lab plumbing is needed; every toon material shares these nodes.
//
// View-space conventions and attenuation math replicate three's WebGLLights
// exactly (direction = toward the light, color premultiplied by intensity).

import * as THREE from 'three';
import {
  dot,
  float,
  Fn,
  If,
  max,
  mix,
  normalize,
  pow,
  smoothstep,
  uniform,
  uniformArray,
  vec3,
} from 'three/tsl';

export const MAX_TOON_POINT_LIGHTS = 8;
export const MAX_TOON_SPOT_LIGHTS = 4;
export const MAX_TOON_HEMI_LIGHTS = 2;

function vectorArray(count) {
  return Array.from({ length: count }, () => new THREE.Vector3());
}

export const toonSceneLights = {
  ambientLightColor: uniform(new THREE.Color(0, 0, 0)),
  hasMainLight: uniform(0, 'float'),
  mainLightColor: uniform(new THREE.Color(1, 1, 1)),
  mainLightDirection: uniform(new THREE.Vector3(0.35, 0.75, 0.55)),

  pointLightColors: uniformArray(vectorArray(MAX_TOON_POINT_LIGHTS), 'vec3'),
  pointLightCount: uniform(0, 'float'),
  // x: cutoff distance, y: decay exponent
  pointLightParams: uniformArray(
    Array.from({ length: MAX_TOON_POINT_LIGHTS }, () => new THREE.Vector2()),
    'vec2',
  ),
  pointLightPositions: uniformArray(vectorArray(MAX_TOON_POINT_LIGHTS), 'vec3'),

  spotLightColors: uniformArray(vectorArray(MAX_TOON_SPOT_LIGHTS), 'vec3'),
  spotLightCount: uniform(0, 'float'),
  spotLightDirections: uniformArray(vectorArray(MAX_TOON_SPOT_LIGHTS), 'vec3'),
  // x: cutoff distance, y: decay, z: coneCos, w: penumbraCos
  spotLightParams: uniformArray(
    Array.from({ length: MAX_TOON_SPOT_LIGHTS }, () => new THREE.Vector4()),
    'vec4',
  ),
  spotLightPositions: uniformArray(vectorArray(MAX_TOON_SPOT_LIGHTS), 'vec3'),

  hemiLightCount: uniform(0, 'float'),
  hemiLightDirections: uniformArray(vectorArray(MAX_TOON_HEMI_LIGHTS), 'vec3'),
  hemiLightGroundColors: uniformArray(vectorArray(MAX_TOON_HEMI_LIGHTS), 'vec3'),
  hemiLightSkyColors: uniformArray(vectorArray(MAX_TOON_HEMI_LIGHTS), 'vec3'),
};

const workColor = new THREE.Color();
const workVectorA = new THREE.Vector3();
const workVectorB = new THREE.Vector3();

function lightIsOn(light) {
  return light.visible !== false && (light.intensity ?? 0) > 0;
}

/**
 * Mirrors the scene's light state into the shared toon light uniforms —
 * the node-backend equivalent of three's WebGLLights setup for the subset
 * the character shader reads. Cheap enough to run once per rendered frame.
 */
export function syncToonSceneLights(scene, camera) {
  if (!scene || !camera) return;
  const viewMatrix = camera.matrixWorldInverse;
  const s = toonSceneLights;

  let ambientR = 0;
  let ambientG = 0;
  let ambientB = 0;
  let mainLightFound = false;
  let pointCount = 0;
  let spotCount = 0;
  let hemiCount = 0;

  scene.traverse((light) => {
    if (!light.isLight || !lightIsOn(light)) return;

    if (light.isAmbientLight) {
      ambientR += light.color.r * light.intensity;
      ambientG += light.color.g * light.intensity;
      ambientB += light.color.b * light.intensity;
      return;
    }

    if (light.isDirectionalLight) {
      // First directional light in traversal order is "the main light",
      // matching directionalLights[0] in the classic pipeline.
      if (mainLightFound) return;
      mainLightFound = true;
      workVectorA.setFromMatrixPosition(light.matrixWorld);
      workVectorB.setFromMatrixPosition(light.target.matrixWorld);
      workVectorA.sub(workVectorB).transformDirection(viewMatrix);
      s.mainLightDirection.value.copy(workVectorA);
      workColor.copy(light.color).multiplyScalar(light.intensity);
      s.mainLightColor.value.copy(workColor);
      return;
    }

    if (light.isPointLight && pointCount < MAX_TOON_POINT_LIGHTS) {
      const index = pointCount;
      pointCount += 1;
      workVectorA.setFromMatrixPosition(light.matrixWorld).applyMatrix4(viewMatrix);
      s.pointLightPositions.array[index].copy(workVectorA);
      workColor.copy(light.color).multiplyScalar(light.intensity);
      s.pointLightColors.array[index].set(workColor.r, workColor.g, workColor.b);
      s.pointLightParams.array[index].set(light.distance ?? 0, light.decay ?? 2);
      return;
    }

    if (light.isSpotLight && spotCount < MAX_TOON_SPOT_LIGHTS) {
      const index = spotCount;
      spotCount += 1;
      workVectorA.setFromMatrixPosition(light.matrixWorld).applyMatrix4(viewMatrix);
      s.spotLightPositions.array[index].copy(workVectorA);
      workVectorA.setFromMatrixPosition(light.matrixWorld);
      workVectorB.setFromMatrixPosition(light.target.matrixWorld);
      workVectorA.sub(workVectorB).transformDirection(viewMatrix);
      s.spotLightDirections.array[index].copy(workVectorA);
      workColor.copy(light.color).multiplyScalar(light.intensity);
      s.spotLightColors.array[index].set(workColor.r, workColor.g, workColor.b);
      s.spotLightParams.array[index].set(
        light.distance ?? 0,
        light.decay ?? 2,
        Math.cos(light.angle),
        Math.cos(light.angle * (1 - light.penumbra)),
      );
      return;
    }

    if (light.isHemisphereLight && hemiCount < MAX_TOON_HEMI_LIGHTS) {
      const index = hemiCount;
      hemiCount += 1;
      workVectorA.setFromMatrixPosition(light.matrixWorld).transformDirection(viewMatrix);
      s.hemiLightDirections.array[index].copy(workVectorA);
      workColor.copy(light.color).multiplyScalar(light.intensity);
      s.hemiLightSkyColors.array[index].set(workColor.r, workColor.g, workColor.b);
      workColor.copy(light.groundColor).multiplyScalar(light.intensity);
      s.hemiLightGroundColors.array[index].set(workColor.r, workColor.g, workColor.b);
    }
  });

  s.ambientLightColor.value.setRGB(ambientR, ambientG, ambientB);
  s.hasMainLight.value = mainLightFound ? 1 : 0;
  s.pointLightCount.value = pointCount;
  s.spotLightCount.value = spotCount;
  s.hemiLightCount.value = hemiCount;
}

/** getMainLightDirection(): first directional light or the GLSL fallback. */
export const getMainLightDirection = /*@__PURE__*/ Fn(() => {
  const fallback = normalize(vec3(0.35, 0.75, 0.55));
  const main = normalize(toonSceneLights.mainLightDirection);
  return mix(fallback, main, toonSceneLights.hasMainLight);
});

/** getMainLightColor(): clamped main light color or white fallback. */
export function getMainLightColor(mainLightMaxContribution) {
  const clamped = min3(vec3(mainLightMaxContribution), toonSceneLights.mainLightColor);
  return mix(vec3(1.0), clamped, toonSceneLights.hasMainLight);
}

function min3(a, b) {
  return vec3(a).min(vec3(b));
}

// three's getDistanceAttenuation (common.glsl) — physically based falloff
// with the artist cutoff window.
const distanceAttenuation = /*@__PURE__*/ Fn(([lightDistance, cutoffDistance, decayExponent]) => {
  const distanceFalloff = float(1.0).div(max(pow(lightDistance, decayExponent), 0.01)).toVar();
  If(cutoffDistance.greaterThan(0.0), () => {
    const ratio = lightDistance.div(cutoffDistance);
    const ratio2 = ratio.mul(ratio);
    const window1 = ratio2.mul(ratio2).oneMinus().clamp(0.0, 1.0);
    distanceFalloff.mulAssign(window1.mul(window1));
  });
  return distanceFalloff;
});

/**
 * evaluateLocalLightFill + evaluateHemisphereFill, assembled per material.
 * `localLightBand` is the toon band the GLSL applies per local light; the
 * caller provides it (it depends on material uniforms). Returns
 * { localLight, strongestLocalLight, hemisphereFill } node factories.
 */
export function createLocalLightEvaluators({ localLightBand }) {
  const s = toonSceneLights;

  const evaluateLocalLightFill = (normal, geometryPosition, localLightIntensity, localLightMaxContribution) => {
    const localLight = vec3(0.0).toVar();

    for (let i = 0; i < MAX_TOON_POINT_LIGHTS; i += 1) {
      If(float(i).lessThan(s.pointLightCount), () => {
        const lVector = s.pointLightPositions.element(i).sub(geometryPosition);
        const lightDistance = lVector.length();
        const direction = lVector.div(max(lightDistance, 1e-6));
        const params = s.pointLightParams.element(i);
        const attenuation = distanceAttenuation(lightDistance, params.x, params.y);
        const color = s.pointLightColors.element(i).mul(attenuation).toVar();
        If(maxComponent3(color).greaterThan(0.0), () => {
          const band = localLightBand(normal, direction);
          localLight.addAssign(color.mul(band));
        });
      });
    }

    for (let i = 0; i < MAX_TOON_SPOT_LIGHTS; i += 1) {
      If(float(i).lessThan(s.spotLightCount), () => {
        const lVector = s.spotLightPositions.element(i).sub(geometryPosition);
        const lightDistance = lVector.length();
        const direction = lVector.div(max(lightDistance, 1e-6));
        const params = s.spotLightParams.element(i);
        const angleCos = dot(direction, normalize(s.spotLightDirections.element(i)));
        const spotAttenuation = smoothstep(params.z, params.w, angleCos);
        const attenuation = distanceAttenuation(lightDistance, params.x, params.y)
          .mul(spotAttenuation);
        const color = s.spotLightColors.element(i).mul(attenuation).toVar();
        If(maxComponent3(color).greaterThan(0.0), () => {
          const band = localLightBand(normal, direction);
          localLight.addAssign(color.mul(band));
        });
      });
    }

    const limited = min3(localLight.mul(localLightIntensity), vec3(localLightMaxContribution)).toVar();
    const strongestLocalLight = maxComponent3(limited);
    return { localLight: limited, strongestLocalLight };
  };

  const evaluateHemisphereFill = (normal, hemisphereLightIntensity) => {
    const hemisphereFill = vec3(0.0).toVar();
    for (let i = 0; i < MAX_TOON_HEMI_LIGHTS; i += 1) {
      If(float(i).lessThan(s.hemiLightCount), () => {
        const dotNL = dot(normal, normalize(s.hemiLightDirections.element(i)));
        const hemiDiffuseWeight = dotNL.mul(0.5).add(0.5);
        hemisphereFill.addAssign(
          mix(s.hemiLightGroundColors.element(i), s.hemiLightSkyColors.element(i), hemiDiffuseWeight),
        );
      });
    }
    return hemisphereFill.mul(hemisphereLightIntensity);
  };

  return { evaluateHemisphereFill, evaluateLocalLightFill };
}

function maxComponent3(value) {
  return max(value.r, max(value.g, value.b));
}
