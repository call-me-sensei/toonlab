// TSL port of src/shaders/grass.vert.glsl + grass.frag.glsl — instanced,
// wind-swayed, character-aware stylized grass blades.
//
// Scene-shadow reception (getShadowMask) comes from the shared sun-shadow
// pass; cloud shadows from the stylized-cloud-shadow chunk. Uniforms keep
// their GLSL names on `.uniforms` (StylizedGrassField.applySettings writes
// them by name on both backends).

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  Discard,
  distance,
  dot,
  float,
  Fn,
  fract,
  length,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';

export function createGrassNodeMaterial(settings) {
  const u = {
    uBacklitStrength: uniform(settings.backlitStrength),
    uBaseColor: uniform(new THREE.Color()),
    uCloudShadowCoverage: uniform(settings.cloudShadowCoverage),
    uCloudShadowScale: uniform(settings.cloudShadowScale),
    uCloudShadowStrength: uniform(settings.cloudShadowStrength),
    uCloudShadowVelocity: uniform(new THREE.Vector2(settings.cloudShadowVelocity[0], settings.cloudShadowVelocity[1])),
    uFadeEnd: uniform(1e6 + 1),
    uFadeStart: uniform(1e6),
    uGustFrequency: uniform(settings.gustFrequency),
    uGustSpeed: uniform(settings.gustSpeed),
    uPushPosition: uniform(new THREE.Vector3(0, -1e5, 0)),
    uPushRadius: uniform(settings.pushRadius),
    uShadowStrength: uniform(settings.shadowStrength),
    uShadowTint: uniform(new THREE.Color()),
    uSkyColor: uniform(new THREE.Color()),
    uSunColor: uniform(new THREE.Color()),
    uSunDirection: uniform(new THREE.Vector3(...settings.sunDirection).normalize()),
    uTime: uniform(0),
    uTipColor: uniform(new THREE.Color()),
    uWindDirection: uniform(new THREE.Vector2(settings.windDirection[0], settings.windDirection[1])),
    uWindSpeed: uniform(settings.windSpeed),
    uWindStrength: uniform(settings.windStrength),
  };

  const material = new NodeMaterial();
  material.name = 'StylizedGrass';
  material.side = THREE.DoubleSide;
  material.fog = true;

  const vUv = uv();
  const vJitter = varying(float(), 'vGrassJitter');
  const vGust = varying(float(), 'vGrassGust');
  const vNormal = varying(vec3(), 'vGrassNormal');
  const vWorldPosition = varying(vec3(), 'vGrassWorldPosition');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    const iInfo = attribute('iInfo', 'vec4');

    vJitter.assign(fract(iInfo.y.mul(13.73)));
    const heightFraction = vUv.y;
    const facing = vec2(cos(iInfo.w), sin(iInfo.w)).toVar();
    const windDirection = normalize(u.uWindDirection.add(vec2(1e-4, 0.0))).toVar();

    const bladePosition = vec3(iOrigin).toVar();
    bladePosition.xz.addAssign(facing.mul(positionLocal.x.mul(iInfo.z)));
    bladePosition.y.addAssign(heightFraction.mul(iInfo.x));

    const bendCurve = heightFraction.mul(heightFraction).toVar();

    // Static per-blade lean (see grass.vert.glsl).
    const bowDirection = vec2(facing.y.negate(), facing.x);
    const leanDirection = normalize(
      bowDirection.mul(vJitter.sub(0.5))
        .add(facing.mul(fract(iInfo.y.mul(7.31)).sub(0.5)))
        .add(vec2(1e-4, 0.0)),
    ).toVar();
    const leanAmount = fract(iInfo.y.mul(3.17)).mul(0.5).add(0.18).toVar();
    bladePosition.xz.addAssign(leanDirection.mul(leanAmount).mul(bendCurve).mul(iInfo.x));
    bladePosition.y.subAssign(leanAmount.mul(leanAmount).mul(0.4).mul(bendCurve).mul(iInfo.x));

    // Traveling gust wave.
    const gustPhase = dot(iOrigin.xz, windDirection).mul(u.uGustFrequency)
      .sub(u.uTime.mul(u.uGustSpeed));
    const gust = sin(gustPhase).mul(0.5)
      .add(sin(gustPhase.mul(0.43).add(1.7)).mul(0.3))
      .add(sin(gustPhase.mul(2.3).add(iInfo.y.mul(4.0))).mul(0.2));
    vGust.assign(clamp(gust.mul(0.5).add(0.5), 0.0, 1.0));

    const phase = u.uTime.mul(u.uWindSpeed).add(iInfo.y.mul(6.2831))
      .add(dot(iOrigin.xz, vec2(0.35, 0.28)));
    const flutter = sin(phase).mul(0.5).add(0.5).add(sin(phase.mul(2.33).add(1.7)).mul(0.3));
    const wind = windDirection.mul(flutter.mul(0.6).add(vGust.mul(1.1))).toVar();
    bladePosition.xz.addAssign(wind.mul(u.uWindStrength).mul(bendCurve).mul(iInfo.x));

    // Character push.
    const fromPush = bladePosition.xz.sub(u.uPushPosition.xz).toVar();
    const pushDistance = length(fromPush);
    const push = smoothstep(0.0, u.uPushRadius, pushDistance).oneMinus()
      .mul(step(abs(iOrigin.y.sub(u.uPushPosition.y)), 1.8));
    bladePosition.xz.addAssign(
      normalize(fromPush.add(vec2(1e-4, 0.0))).mul(push).mul(0.42).mul(bendCurve).mul(iInfo.x),
    );
    bladePosition.y.subAssign(push.mul(0.14).mul(bendCurve).mul(iInfo.x));

    // Shared field normal, tilted by the current bend.
    const tilt = wind.mul(u.uWindStrength).add(leanDirection.mul(leanAmount).mul(0.35)).mul(heightFraction);
    vNormal.assign(normalize(vec3(tilt.x.mul(1.4), 1.0, tilt.y.mul(1.4))));

    // Distance fade to a degenerate point.
    const fadeDistance = distance(modelWorldMatrix.mul(vec4(iOrigin, 1.0)).xz, cameraPosition.xz);
    const fade = smoothstep(u.uFadeStart, u.uFadeEnd, fadeDistance).oneMinus();
    bladePosition.assign(mix(iOrigin, bladePosition, fade));

    const worldPosition = modelWorldMatrix.mul(vec4(bladePosition, 1.0));
    vWorldPosition.assign(worldPosition.xyz);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  material.fragmentNode = Fn(() => {
    // Rounded taper silhouette.
    const taper = pow(vUv.y, 1.6).mul(0.96).oneMinus();
    const halfWidth = taper.mul(0.5);
    Discard(abs(vUv.x.sub(0.5)).greaterThan(halfWidth));

    const tipMix = smoothstep(0.1, 0.95, vUv.y.mul(vJitter.mul(0.3).add(0.85))).toVar();
    const color = mix(u.uBaseColor, u.uTipColor, tipMix).toVar();
    color.mulAssign(vJitter.mul(0.2).add(0.9));

    // Dense-field AO toward the roots.
    color.mulAssign(mix(0.64, 1.0, smoothstep(0.0, 0.62, vUv.y)));

    const normal = normalize(vNormal);
    const sunDirection = normalize(u.uSunDirection);
    const cloudShadow = stylizedCloudShadow(
      vWorldPosition.xz, u.uTime,
      u.uCloudShadowStrength, u.uCloudShadowCoverage, u.uCloudShadowScale, u.uCloudShadowVelocity,
    );
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uShadowStrength);
    const sunVisibility = cloudShadow.mul(sceneShadow).toVar();
    const wrap = dot(normal, sunDirection).mul(0.5).add(0.5);
    const litBand = smoothstep(0.44, 0.54, wrap).mul(sunVisibility).toVar();
    color.mulAssign(mix(0.86, 1.06, litBand));
    color.mulAssign(mix(vec3(1.0), u.uSunColor, litBand.mul(0.25)));

    // Occlusion darkening shared with the terrain response.
    color.mulAssign(mix(u.uShadowTint, vec3(1.0), sunVisibility));

    // Sky fill + gust sheen.
    color.addAssign(u.uSkyColor.mul(litBand.oneMinus()).mul(0.07));
    const sheen = smoothstep(0.78, 1.0, vGust).mul(tipMix);
    color.addAssign(u.uSunColor.mul(sheen).mul(0.22).mul(litBand));

    // Backlit translucency.
    const viewDirection = normalize(cameraPosition.sub(vWorldPosition));
    const backlit = pow(clamp(dot(viewDirection, sunDirection.negate()), 0.0, 1.0), 3.0);
    color.addAssign(
      u.uSunColor.mul(backlit).mul(tipMix).mul(u.uBacklitStrength)
        .mul(sunVisibility.mul(0.65).add(0.35)),
    );

    return vec4(color, 1.0);
  })();

  material.uniforms = u;
  return material;
}
