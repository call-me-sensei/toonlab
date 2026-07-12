// TSL port of src/shaders/sky.vert.glsl + sky.frag.glsl — stylized procedural
// sky dome. Vertical gradient, sun disc with glow, painterly two-tone fbm
// clouds, and twinkling stars. Fully procedural; pairs with the water's
// procedural sky fallback.
//
// Parity notes vs the GLSL ShaderMaterial:
// - The dome renders at the far plane via a custom vertexNode
//   (gl_Position.z = w * 0.99995 in the GLSL vertex stage).
// - GLSL ends with tonemapping_fragment + colorspace_fragment; the node
//   renderer applies the same output transforms automatically.
// - The material exposes `.uniforms` (node objects keyed by the GLSL uniform
//   names, each with a `.value`) so applySkySettingsToMaterial and
//   StylizedSky.update write the same slots on both backends.

import * as THREE from 'three';
import {
  acos,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  dot,
  float,
  Fn,
  If,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  pow,
  select,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import { waterFbm, waterHash12, waterToonStep, waterVoronoi2 } from './chunks/water-common.js';

export function createSkyNodeMaterial() {
  const uniforms = {
    uCloudColor: uniform(new THREE.Color()),
    uCloudCoverage: uniform(0),
    uCloudScale: uniform(0),
    uCloudShadeColor: uniform(new THREE.Color()),
    uCloudSpeed: uniform(0),
    uGroundColor: uniform(new THREE.Color()),
    uHorizonColor: uniform(new THREE.Color()),
    uHorizonScattering: uniform(0),
    uStarsStrength: uniform(0),
    uSunColor: uniform(new THREE.Color()),
    uSunDirection: uniform(new THREE.Vector3(0, 1, 0)),
    uSunGlowStrength: uniform(0),
    uSunSize: uniform(0),
    uTime: uniform(0),
    uZenithColor: uniform(new THREE.Color()),
  };

  const material = new MeshBasicNodeMaterial({
    depthWrite: false,
    side: THREE.BackSide,
  });
  material.name = 'StylizedSky';
  material.fog = false;
  material.lights = false;

  // Vertex stage: dome pinned to the far plane regardless of sphere radius,
  // so it never clips scene geometry and works inside reflection passes.
  const clipPosition = cameraProjectionMatrix
    .mul(cameraViewMatrix)
    .mul(modelWorldMatrix)
    .mul(vec4(positionLocal, 1.0));
  material.vertexNode = vec4(
    clipPosition.x,
    clipPosition.y,
    clipPosition.w.mul(0.99995),
    clipPosition.w,
  );

  material.colorNode = Fn(() => {
    const direction = normalize(positionLocal).toVar();
    const up = direction.y.toVar();

    // Base vertical gradient with a mirrored ground fade below the horizon.
    const zenithMix = pow(clamp(up, 0.0, 1.0), 0.48);
    const color = select(
      up.greaterThanEqual(0.0),
      mix(uniforms.uHorizonColor, uniforms.uZenithColor, zenithMix),
      mix(uniforms.uHorizonColor, uniforms.uGroundColor, pow(clamp(up.negate(), 0.0, 1.0), 0.55)),
    ).toVar();

    // Sun disc and glow.
    const cosAngle = dot(direction, uniforms.uSunDirection).toVar();
    const angle = acos(clamp(cosAngle, -1.0, 1.0));
    const sunDisc = smoothstep(uniforms.uSunSize.mul(0.5), uniforms.uSunSize, angle)
      .oneMinus()
      .mul(smoothstep(0.55, 0.82, uniforms.uCloudCoverage).oneMinus());
    const sunGlow = pow(max(cosAngle, 0.0), 5.0).mul(0.16)
      .add(pow(max(cosAngle, 0.0), 60.0).mul(0.5))
      .toVar();
    color.addAssign(
      uniforms.uSunColor.mul(sunDisc.mul(2.4).add(sunGlow.mul(uniforms.uSunGlowStrength))),
    );

    // Atmospheric scattering hint: a warm wedge along the sun-side horizon
    // that fades with altitude.
    const horizonBand = smoothstep(0.0, 0.42, up.abs()).oneMinus();
    const sunward = pow(clamp(cosAngle.mul(0.5).add(0.5), 0.0, 1.0), 5.0);
    color.addAssign(
      uniforms.uSunColor
        .mul(horizonBand)
        .mul(sunward)
        .mul(uniforms.uHorizonScattering)
        .mul(0.35),
    );

    // Stars: sparse grid glints, hidden below the horizon and near the sun.
    // The If guard matches the GLSL branch — it also keeps the projected UV
    // division (up + 0.28 crosses zero below the horizon) out of reach.
    If(uniforms.uStarsStrength.greaterThan(0.001).and(up.greaterThan(0.02)), () => {
      const starUv = direction.xz.div(up.add(0.28)).mul(14.0);
      const starVoro = waterVoronoi2(starUv);
      const starRandom = waterHash12(starVoro.zw);
      const twinkle = uniforms.uTime
        .mul(starRandom.mul(2.4).add(1.2))
        .add(starRandom.mul(31.0))
        .sin()
        .mul(0.4)
        .add(0.6);
      const star = smoothstep(0.0, 0.06, starVoro.x).oneMinus().mul(step(0.72, starRandom));
      color.addAssign(
        vec3(1.0, 0.98, 0.92)
          .mul(star)
          .mul(twinkle)
          .mul(uniforms.uStarsStrength)
          .mul(smoothstep(0.03, 0.24, up))
          .mul(sunGlow.oneMinus()),
      );
    });

    // Painterly clouds: fbm silhouettes with a toon-stepped shadow side and a
    // silver lining toward the sun, projected onto a virtual cloud plane.
    If(uniforms.uCloudCoverage.greaterThan(0.001).and(up.greaterThan(0.015)), () => {
      const cloudUv = direction.xz
        .div(up.add(0.22))
        .mul(uniforms.uCloudScale)
        .add(uniforms.uTime.mul(uniforms.uCloudSpeed).mul(vec2(0.021, 0.006)))
        .toVar();
      const cloudBase = waterFbm(cloudUv, 4).toVar();
      const threshold = mix(0.74, 0.34, clamp(uniforms.uCloudCoverage, 0.0, 1.0));
      const cloudCore = smoothstep(threshold.add(0.1), threshold.add(0.24), cloudBase);
      const cloudEdge = smoothstep(threshold, threshold.add(0.1), cloudBase);
      const cloudMask = max(cloudCore, cloudEdge.mul(0.65));

      const litSample = waterFbm(cloudUv.sub(uniforms.uSunDirection.xz.mul(0.4)), 4);
      const shade = waterToonStep(float(0.02), float(0.06), cloudBase.sub(litSample));
      const cloudColor = mix(uniforms.uCloudColor, uniforms.uCloudShadeColor, shade.mul(0.85))
        .add(uniforms.uSunColor.mul(pow(max(cosAngle, 0.0), 10.0)).mul(0.3))
        .toVar();

      const horizonFade = smoothstep(0.015, 0.16, up);
      color.assign(mix(color, cloudColor, cloudMask.mul(horizonFade)));
    });

    return vec4(color, 1.0);
  })();

  // Same-name uniform slots as the ShaderMaterial (UniformNodes expose
  // `.value` just like ShaderMaterial uniform entries).
  material.uniforms = uniforms;
  return material;
}
