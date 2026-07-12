// TSL port of src/shaders/chunks/character-fragment-material-maps.glsl.
//
// GLSL compiles each optional sampler in via a USE_TOON_* define so unused
// units are never declared (ANGLE's 16-sampler limit). Here the same
// conditions become JS guards: when a map is absent the no-map stub result is
// baked into the graph, so the WGSL/GLSL the builder emits never references
// the texture. The `has*`/strength uniforms stay runtime-tweakable exactly
// like the GLSL versions.
//
// The factory receives:
//   u     — uniform-node map (GLSL uniform names)
//   tex   — texture nodes (only the ones the material actually carries)
//   v     — varyings ({ vUv, vUv2, vViewPos })
//   flags — compile-time booleans mirroring the GLSL defines

import {
  clamp,
  cross,
  dFdx,
  dFdy,
  dot,
  Fn,
  inverseSqrt,
  max,
  mix,
  normalize,
  select,
  vec2,
  vec3,
} from 'three/tsl';

export function createMaterialMapChunk({ u, tex, v, flags }) {
  const sampleMaterialNormalMapColor = () => {
    if (!flags.hasNormalMap) return vec3(0.5, 0.5, 1.0);
    return select(u.hasMaterialNormalMap, tex.materialNormalMap.sample(v.vUv).rgb, vec3(0.5, 0.5, 1.0));
  };

  // Pure dataflow (no Fn wrapper, no toVar) — see the select() purity note in
  // character-lighting.js.
  const applyMaterialNormalMap = (N) => {
    if (!flags.hasNormalMap) return N;
    const raw = sampleMaterialNormalMapColor().mul(2.0).sub(1.0);
    const scaledXY = raw.xy.mul(u.materialNormalScale.mul(u.materialNormalStrength));
    const mapN = normalize(vec3(scaledXY, raw.z));

    // cotangentFrame(N, vViewPos.xyz, vUv), written out inline.
    const p = v.vViewPos.xyz;
    const dp1 = dFdx(p);
    const dp2 = dFdy(p);
    const duv1 = dFdx(v.vUv);
    const duv2 = dFdy(v.vUv);
    const dp2perp = cross(dp2, N);
    const dp1perp = cross(N, dp1);
    const T = dp2perp.mul(duv1.x).add(dp1perp.mul(duv2.x));
    const B = dp2perp.mul(duv1.y).add(dp1perp.mul(duv2.y));
    const invMax = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1.0e-6));
    // mat3(T*invMax, B*invMax, N) * mapN, expanded column-wise.
    const perturbed = normalize(
      T.mul(invMax).mul(mapN.x)
        .add(B.mul(invMax).mul(mapN.y))
        .add(N.mul(mapN.z)),
    );
    const blended = normalize(mix(N, perturbed, clamp(u.materialNormalStrength, 0.0, 1.0)));
    return select(u.useMaterialNormalMap, blended, N);
  };

  const sampleMaterialAo = () => {
    if (!flags.hasAoMap) return null; // caller substitutes 1.0
    return select(u.hasMaterialAoMap, clamp(tex.materialAoMap.sample(v.vUv2).r, 0.0, 1.0), 1.0);
  };

  const sampleMaterialDetail = () => {
    if (!flags.hasDetailMap) return vec3(0.5);
    return select(
      u.hasMaterialDetailMap,
      tex.materialDetailMap.sample(v.vUv.mul(u.materialDetailRepeat)).rgb,
      vec3(0.5),
    );
  };

  const applyMaterialDetail = (albedo) => {
    if (!flags.hasDetailMap) return albedo;
    const detail = sampleMaterialDetail().mul(2.0);
    const applied = albedo.mul(mix(vec3(1.0), detail, clamp(u.materialDetailStrength, 0.0, 1.0)));
    const active = u.hasMaterialDetailMap.and(u.materialDetailStrength.greaterThan(0.0));
    return select(active, applied, albedo);
  };

  const sampleMaterialEmissive = () => {
    if (!flags.hasEmissiveMap) return u.materialEmissiveColor;
    const texel = select(u.hasMaterialEmissiveMap, tex.materialEmissiveMap.sample(v.vUv).rgb, vec3(1.0));
    return texel.mul(u.materialEmissiveColor);
  };

  const sampleMaterialMatcap = (N) => {
    if (!flags.hasMatcapMap) return vec3(0.0);
    const matcapUv = N.xy.mul(0.5).add(0.5);
    return select(u.hasMaterialMatcapMap, tex.materialMatcapMap.sample(vec2(matcapUv)).rgb, vec3(0.0));
  };

  const sampleMaterialRamp = (shadeArea) => {
    if (!flags.hasRampMap) return vec3(1.0);
    return select(
      u.hasMaterialRampMap,
      tex.materialRampMap.sample(vec2(clamp(shadeArea, 0.0, 1.0), 0.5)).rgb,
      vec3(1.0),
    );
  };

  const sampleMaterialRoughness = () => {
    if (!flags.hasRoughnessMap) return clamp(u.materialRoughness, 0.0, 1.0);
    return select(
      u.hasMaterialRoughnessMap,
      clamp(tex.materialRoughnessMap.sample(v.vUv).g, 0.0, 1.0),
      clamp(u.materialRoughness, 0.0, 1.0),
    );
  };

  const sampleMaterialMetalness = () => {
    if (!flags.hasMetalnessMap) return clamp(u.materialMetalness, 0.0, 1.0);
    return select(
      u.hasMaterialMetalnessMap,
      clamp(tex.materialMetalnessMap.sample(v.vUv).b, 0.0, 1.0),
      clamp(u.materialMetalness, 0.0, 1.0),
    );
  };

  const sampleMaterialSpecularColor = () => {
    if (!flags.hasSpecularColorMap) return vec3(1.0);
    return select(u.hasMaterialSpecularColorMap, tex.materialSpecularColorMap.sample(v.vUv).rgb, vec3(1.0));
  };

  return {
    applyMaterialDetail,
    applyMaterialNormalMap,
    sampleMaterialAo,
    sampleMaterialDetail,
    sampleMaterialEmissive,
    sampleMaterialMatcap,
    sampleMaterialMetalness,
    sampleMaterialNormalMapColor,
    sampleMaterialRamp,
    sampleMaterialRoughness,
    sampleMaterialSpecularColor,
  };
}
