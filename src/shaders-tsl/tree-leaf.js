// TSL port of src/shaders/treeLeaf.vert.glsl + treeLeaf.frag.glsl (+ the
// treeLeafDepth cutout depth variant) — world-anchored leaf-cluster cards
// with the canopy-volume shading normal.
//
// The color material exposes userData.createDepthColorVariant() so the sun
// shadow pass can render leafy cutout shadows with the exact same card
// vertex placement (the classic path uses mesh.customDepthMaterial instead).

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraFar,
  cameraNear,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  cross,
  Discard,
  dot,
  float,
  Fn,
  fract,
  mat2,
  mix,
  modelWorldMatrix,
  mat3,
  normalize,
  positionLocal,
  pow,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';
import { applyFoliageFog, createFoliageFogUniforms } from './chunks/foliage-fog.js';

// Shared card-placement vertex logic (color + depth variants). Returns the
// clip position; assigns the provided varyings when given.
function buildLeafVertexNode(u, { vUv, vWorldNormal, vWorldPosition, vTint, vHeightT, vViewZ }) {
  return Fn(() => {
    const aCorner = attribute('aCorner', 'vec2');
    const aShadeNormal = attribute('aShadeNormal', 'vec3');
    const aInfo = attribute('aInfo', 'vec4');

    vUv.assign(uv());
    if (vTint) vTint.assign(aInfo.z);
    if (vHeightT) vHeightT.assign(aInfo.w);
    if (vWorldNormal) vWorldNormal.assign(normalize(mat3(modelWorldMatrix).mul(aShadeNormal)));

    const worldCenter = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).toVar();

    // Coherent canopy sway, stronger toward the crown.
    const phase = u.uTime.mul(u.uWindSpeed).add(worldCenter.x.mul(0.6)).add(worldCenter.z.mul(0.5));
    const sway = sin(phase).mul(0.6).add(sin(phase.mul(1.7).add(1.3)).mul(0.4));
    worldCenter.xz.addAssign(
      normalize(u.uWindDirection.add(vec2(1e-4, 0.0)))
        .mul(sway).mul(u.uWindStrength).mul(aInfo.w.mul(0.75).add(0.25)),
    );
    if (vWorldPosition) vWorldPosition.assign(worldCenter.xyz);

    // Static random roll per card + light flutter.
    const roll = aInfo.y.mul(6.2831).add(
      sin(u.uTime.mul(fract(aInfo.y.mul(7.31)).add(1.1)).mul(u.uWindSpeed).add(aInfo.y.mul(37.0))).mul(0.09),
    );
    const rollCos = cos(roll);
    const rollSin = sin(roll);
    // GLSL mat2(c, s, -s, c) is column-major; TSL matN() scalars are
    // row-major — transposed argument order (docs/tsl-conventions.md).
    const corner = mat2(rollCos, rollSin.negate(), rollSin, rollCos).mul(aCorner).mul(aInfo.x);

    // World-anchored cylindrical billboard (cameraPosition is the light
    // during the shadow pass, matching the classic depth-pass behavior).
    const toCamera = cameraPosition.sub(worldCenter.xyz);
    const facing = normalize(mix(
      vec3(toCamera.x, 0.0, toCamera.z).add(vec3(1e-4, 0.0, 0.0)),
      toCamera,
      0.35,
    ));
    const cardRight = normalize(cross(vec3(0.0, 1.0, 0.0), facing));
    const cardUp = normalize(cross(facing, cardRight));
    worldCenter.xyz.addAssign(cardRight.mul(corner.x).add(cardUp.mul(corner.y)));

    const viewPosition = cameraViewMatrix.mul(worldCenter).toVar();
    if (vViewZ) vViewZ.assign(viewPosition.z);
    return cameraProjectionMatrix.mul(viewPosition);
  })();
}

export function createTreeLeafNodeMaterial(settings) {
  const u = {
    uAlphaCutoff: uniform(settings.alphaCutoff ?? 0.5),
    uBacklitStrength: uniform(settings.backlitStrength ?? 0),
    uCloudShadowCoverage: uniform(settings.cloudShadowCoverage ?? 0),
    uCloudShadowScale: uniform(settings.cloudShadowScale ?? 1),
    uCloudShadowStrength: uniform(settings.cloudShadowStrength ?? 0),
    uCloudShadowVelocity: uniform(new THREE.Vector2(...(settings.cloudShadowVelocity ?? [0, 0]))),
    uCrownColor: uniform(new THREE.Color()),
    uLeafMap: texture(settings.leafMap),
    uLitColor: uniform(new THREE.Color()),
    uSceneShadowStrength: uniform(settings.sceneShadowStrength ?? 0),
    uShadowColor: uniform(new THREE.Color()),
    uSkyColor: uniform(new THREE.Color()),
    uSunColor: uniform(new THREE.Color()),
    uSunDirection: uniform(new THREE.Vector3(0.35, 0.75, 0.5).normalize()),
    uTime: uniform(0),
    uWindDirection: uniform(new THREE.Vector2(...(settings.windDirection ?? [1, 0.4]))),
    uWindSpeed: uniform(settings.windSpeed ?? 1),
    uWindStrength: uniform(settings.windStrength ?? 0.06),
    ...createFoliageFogUniforms(),
  };

  const material = new NodeMaterial();
  material.name = 'StylizedTreeFoliage';
  // Manual fog (see chunks/foliage-fog.js): the custom billboard vertexNode
  // makes three's built-in node fog read the wrong view depth.
  material.fog = false;

  const vUv = varying(vec2(), 'vLeafUv');
  const vWorldNormal = varying(vec3(), 'vLeafWorldNormal');
  const vWorldPosition = varying(vec3(), 'vLeafWorldPosition');
  const vTint = varying(float(), 'vLeafTint');
  const vHeightT = varying(float(), 'vLeafHeightT');
  const vViewZ = varying(float(), 'vLeafViewZ');

  material.vertexNode = buildLeafVertexNode(u, { vHeightT, vTint, vUv, vViewZ, vWorldNormal, vWorldPosition });

  material.fragmentNode = Fn(() => {
    const sprite = u.uLeafMap.sample(vUv).toVar();
    Discard(sprite.a.lessThan(u.uAlphaCutoff));

    const normal = normalize(vWorldNormal).toVar();
    const sunDirection = normalize(u.uSunDirection);
    const wrap = dot(normal, sunDirection).mul(0.5).add(0.5).toVar();
    const cloudShadow = stylizedCloudShadow(
      vWorldPosition.xz, u.uTime,
      u.uCloudShadowStrength, u.uCloudShadowCoverage, u.uCloudShadowScale, u.uCloudShadowVelocity,
    );
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uSceneShadowStrength).toVar();
    const sunVisibility = cloudShadow.mul(sceneShadow).toVar();

    const litBand = smoothstep(0.38, 0.56, wrap).mul(sunVisibility).toVar();
    const crestBand = smoothstep(0.66, 0.78, wrap).mul(sunVisibility)
      .mul(smoothstep(0.3, 0.8, vHeightT.mul(normal.y.mul(0.5).add(0.5).mul(0.3).add(0.7))));

    const color = mix(u.uShadowColor, u.uLitColor, litBand).toVar();
    color.assign(mix(color, u.uCrownColor, crestBand));
    color.mulAssign(mix(vec3(1.0), u.uSunColor, litBand.mul(0.35)));

    // Baked per-leaf luminance + per-card jitter.
    color.mulAssign(sprite.r.mul(0.36).add(0.78));
    color.mulAssign(vTint.mul(0.16).add(0.92));

    // Sky fill + silhouette rim.
    color.addAssign(u.uSkyColor.mul(normal.y.mul(0.5).add(0.5)).mul(litBand.oneMinus()).mul(0.10));
    const viewDirection = normalize(cameraPosition.sub(vWorldPosition));
    const rim = pow(abs(dot(normal, viewDirection)).oneMinus(), 3.0);
    color.addAssign(u.uSkyColor.mul(rim).mul(0.12).mul(vHeightT.mul(0.6).add(0.4)));

    // Backlit translucency.
    const backlit = pow(clamp(dot(viewDirection, sunDirection.negate()), 0.0, 1.0), 4.0);
    color.addAssign(
      u.uSunColor.mul(backlit).mul(u.uBacklitStrength)
        .mul(sprite.r.mul(0.7).add(0.3))
        .mul(sunVisibility.mul(0.65).add(0.35)),
    );

    // Occluded crowns read clearly darker.
    color.mulAssign(mix(0.8, 1.0, sceneShadow));

    // Manual linear scene fog on the true billboarded depth (see foliage-fog).
    color.assign(applyFoliageFog(color, vViewZ, u));

    return vec4(color, 1.0);
  })();

  material.uniforms = u;

  // Native node-renderer shadow casting (tree/rock labs keep three's shadow
  // system — no MMD skeletons there): the shadow pass takes a LOCAL-space
  // position override plus a cutout mask. cameraPosition binds to the light
  // during that pass, matching the classic depth-pass card facing; the world
  // card placement is pulled back to local via the inverse model matrix.
  material.castShadowPositionNode = (() => {
    return Fn(() => {
      const aCorner = attribute('aCorner', 'vec2');
      const aInfo = attribute('aInfo', 'vec4');
      const worldCenter = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).toVar();
      const phase = u.uTime.mul(u.uWindSpeed).add(worldCenter.x.mul(0.6)).add(worldCenter.z.mul(0.5));
      const sway = sin(phase).mul(0.6).add(sin(phase.mul(1.7).add(1.3)).mul(0.4));
      worldCenter.xz.addAssign(
        normalize(u.uWindDirection.add(vec2(1e-4, 0.0)))
          .mul(sway).mul(u.uWindStrength).mul(aInfo.w.mul(0.75).add(0.25)),
      );
      const roll = aInfo.y.mul(6.2831).add(
        sin(u.uTime.mul(fract(aInfo.y.mul(7.31)).add(1.1)).mul(u.uWindSpeed).add(aInfo.y.mul(37.0))).mul(0.09),
      );
      const rollCos = cos(roll);
      const rollSin = sin(roll);
      const corner = mat2(rollCos, rollSin.negate(), rollSin, rollCos).mul(aCorner).mul(aInfo.x);
      const toCamera = cameraPosition.sub(worldCenter.xyz);
      const facing = normalize(mix(
        vec3(toCamera.x, 0.0, toCamera.z).add(vec3(1e-4, 0.0, 0.0)),
        toCamera,
        0.35,
      ));
      const cardRight = normalize(cross(vec3(0.0, 1.0, 0.0), facing));
      const cardUp = normalize(cross(facing, cardRight));
      worldCenter.xyz.addAssign(cardRight.mul(corner.x).add(cardUp.mul(corner.y)));
      return modelWorldMatrix.inverse().mul(worldCenter).xyz;
    })();
  })();
  // Cutout in the shadow pass only (the custom fragmentNode bypasses
  // maskNode in the main render).
  material.maskNode = u.uLeafMap.sample(uv()).a.greaterThanEqual(u.uAlphaCutoff);

  // Leafy cutout depth variant for the Water Lab's custom sun-shadow pass.
  // Native WebGPU shadows consume castShadowPositionNode/maskNode from the
  // source material, but Water Lab swaps in this material and renders a color
  // depth target. Make it self-contained with the same full billboard vertex
  // path, so it does not depend on native-shadow-only override hooks.
  material.userData.createDepthColorVariant = () => {
    const depthMaterial = new NodeMaterial();
    depthMaterial.name = 'StylizedTreeFoliageDepth';
    depthMaterial.side = THREE.DoubleSide;
    depthMaterial.fog = false;
    depthMaterial.isShadowPassMaterial = true;

    const vDepthUv = varying(vec2(), 'vLeafDepthUv');
    const vDepthViewZ = varying(float(), 'vLeafDepthViewZ');
    depthMaterial.vertexNode = buildLeafVertexNode(u, {
      vUv: vDepthUv,
      vViewZ: vDepthViewZ,
    });
    depthMaterial.fragmentNode = Fn(() => {
      const sprite = u.uLeafMap.sample(vDepthUv).toVar();
      Discard(sprite.a.lessThan(u.uAlphaCutoff));
      const orthographic = cameraProjectionMatrix.element(3).w.equal(1.0);
      const depth01 = select(
        orthographic,
        viewZToOrthographicDepth(vDepthViewZ, cameraNear, cameraFar),
        viewZToPerspectiveDepth(vDepthViewZ, cameraNear, cameraFar),
      ).toVar();
      return vec4(vec3(depth01), 1.0);
    })();
    return depthMaterial;
  };

  return material;
}
