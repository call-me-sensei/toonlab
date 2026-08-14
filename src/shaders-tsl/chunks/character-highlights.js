// TSL port of src/shaders/chunks/character-fragment-highlights.glsl —
// specular band, hair strand highlight, eye gloss, and procedural glitter.

import {
  abs,
  clamp,
  dot,
  float,
  Fn,
  fract,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  reflect,
  select,
  smoothstep,
  sqrt,
  vec2,
  vec3,
} from 'three/tsl';

function maskChannel(maskTexel, channelUniform) {
  return select(channelUniform.equal(1), maskTexel.g,
    select(channelUniform.equal(2), maskTexel.b,
      select(channelUniform.equal(3), maskTexel.a, maskTexel.r)));
}

export function createHighlightsChunk({ u, tex, v, flags, toonEdgeSmooth }) {
  const sampleSpecularMask = () => {
    if (!flags.hasSpecularMask) return float(1.0);
    const maskTexel = tex.specularMaskMap.sample(v.vUv);
    const mask = maskChannel(maskTexel, u.specularMaskChannel);
    return select(
      u.useSpecularMask,
      mix(1.0, clamp(mask, 0.0, 1.0), u.specularMaskStrength),
      1.0,
    );
  };

  const calculateSpecularArea = (NoH, NoV, finalShadowArea, roughnessValue) => {
    const roughnessPower = mix(192.0, 8.0, clamp(roughnessValue, 0.0, 1.0));
    const resolvedPower = mix(u.specularPower, roughnessPower, u.materialRoughnessStrength);
    // View mode anchors the highlight to the surface instead of the light.
    const specularSource = select(u.specularDirectionMode.equal(1), NoV, NoH);
    const specularRaw = pow(specularSource, max(resolvedPower, 1.0));
    const specStart = max(0.0, u.specularAreaRemapMidPoint.sub(u.specularAreaRemapRange));
    const specEnd = min(1.0, u.specularAreaRemapMidPoint.add(u.specularAreaRemapRange));
    const specularArea = toonEdgeSmooth(specularRaw, specStart, specEnd);
    const specularShadowMask = mix(finalShadowArea, 1.0, u.specularShowInShadowArea);
    const roughnessMask = mix(1.0, roughnessValue.mul(0.65).oneMinus(), u.materialRoughnessStrength);
    const result = specularArea.mul(specularShadowMask).mul(roughnessMask).mul(sampleSpecularMask());
    return select(u.useSpecular, result, 0.0);
  };

  const sampleHairHighlightMask = (uv) => {
    if (!flags.hasHairHighlightMask) return float(1.0);
    const maskTexel = tex.hairHighlightMaskMap.sample(uv);
    const mask = maskChannel(maskTexel, u.hairHighlightMaskChannel);
    return select(
      u.useHairHighlightMask,
      mix(1.0, clamp(mask, 0.0, 1.0), u.hairHighlightMaskStrength),
      1.0,
    );
  };

  const sampleEyeHighlightMask = (uv) => {
    if (!flags.hasEyeHighlightMask) return float(1.0);
    const maskTexel = tex.eyeHighlightMaskMap.sample(uv);
    const mask = maskChannel(maskTexel, u.eyeHighlightMaskChannel);
    return select(
      u.useEyeHighlightMask,
      mix(1.0, clamp(mask, 0.0, 1.0), u.eyeHighlightMaskStrength),
      1.0,
    );
  };

  const calculateHairHighlightMask = (V, N, H, uv, finalShadowArea) => {
    const strandDirection = normalize(u.hairHighlightDirection);
    const tangentHalf = dot(strandDirection, H);
    const strandTangent = pow(
      clamp(sqrt(max(0.0, tangentHalf.mul(tangentHalf).oneMinus())), 0.0, 1.0),
      u.hairHighlightStrandPower,
    );
    const strandReflect = pow(
      clamp(abs(dot(strandDirection, reflect(V.negate(), N))).oneMinus(), 0.0, 1.0),
      u.hairHighlightStrandPower,
    );
    const strand = select(u.hairHighlightMode.equal(1), strandTangent, strandReflect);

    const uvCoord = select(u.hairHighlightUvBandAxis.equal(1), uv.y, uv.x);
    const sideBand = pow(
      clamp(
        abs(uvCoord.sub(u.hairHighlightUvBandCenter)).div(max(u.hairHighlightUvBandHalfWidth, 0.001)).oneMinus(),
        0.0,
        1.0,
      ),
      u.hairHighlightSideBandPower,
    );
    const result = strand.mul(sideBand)
      .mul(sampleHairHighlightMask(uv))
      .mul(mix(u.hairHighlightShadowFloor, 1.0, finalShadowArea));
    return select(u.useHairHighlight, result, 0.0);
  };

  const calculateEyeHighlightMask = (L, N, V, uv) => {
    const gloss = pow(clamp(dot(reflect(L.negate(), N), V), 0.0, 1.0), max(u.eyeHighlightPower, 1.0));
    return select(u.useEyeHighlight, gloss.mul(sampleEyeHighlightMask(uv)), 0.0);
  };

  // Procedural glitter — one particle per UV cell with a random orientation,
  // lit by a very tight reflection lobe. Only built when glitter is enabled
  // on the material (GLSL: USE_TOON_GLITTER define).
  const toonGlitterHash = /*@__PURE__*/ Fn(([p]) => {
    const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
    p3.addAssign(dot(p3, p3.yzx.add(33.33)));
    return fract(p3.x.add(p3.y).mul(p3.z));
  });

  const toonGlitterHash2 = /*@__PURE__*/ Fn(([p]) => {
    const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
    p3.addAssign(dot(p3, p3.yzx.add(33.33)));
    return fract(p3.xx.add(p3.yz).mul(p3.zy));
  });

  const toonGlitterHash3 = /*@__PURE__*/ Fn(([p]) => {
    const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
    p3.addAssign(dot(p3, p3.yxz.add(33.33)));
    return fract(p3.xxy.add(p3.yzz).mul(p3.zyx)).mul(2.0).sub(1.0);
  });

  const evaluateGlitter = (uv, V, N, L) => {
    const particleSize = u.glitterSize.mul(0.25).toVar();
    const scaledUv = uv.mul(u.glitterDensity).mul(1000.0).toVar();
    const cellId = scaledUv.floor().toVar();
    const cellUv = fract(scaledUv).toVar();
    const glitter = vec3(0.0).toVar();

    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const neighborCell = cellId.add(vec2(x, y)).toVar();
        const particlePos = vec2(x, y).add(toonGlitterHash2(neighborCell));
        const dist = length(particlePos.sub(cellUv)).toVar();
        If(dist.lessThan(particleSize), () => {
          const particleNormal = normalize(mix(
            N,
            normalize(toonGlitterHash3(neighborCell)),
            u.glitterRandomNormalStrength,
          ));
          const reflectDir = reflect(V.negate(), particleNormal);
          const sparkle = pow(max(dot(reflectDir, L), 0.0), 1000.0);
          const viewAlignment = pow(max(dot(V, particleNormal), 0.0), 5.0);
          const fade = smoothstep(particleSize.mul(0.2), particleSize, dist).oneMinus();
          const sparkleIntensity = sparkle.mul(viewAlignment).mul(fade).mul(100.0);
          const colorSeed = toonGlitterHash(neighborCell.add(50.0));
          glitter.addAssign(
            mix(vec3(1.0, 0.98, 0.95), vec3(0.95, 0.97, 1.0), colorSeed).mul(sparkleIntensity),
          );
        });
      }
    }
    return glitter;
  };

  return {
    calculateEyeHighlightMask,
    calculateHairHighlightMask,
    calculateSpecularArea,
    evaluateGlitter,
  };
}
