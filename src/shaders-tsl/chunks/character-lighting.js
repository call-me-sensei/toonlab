// TSL port of src/shaders/chunks/character-fragment-lighting.glsl — cel
// banding, face proxy normals, screen-space depth rim + contact shadow, the
// character-only shadow map, average-shadow blending, and the rim mask.
//
// GLSL out-parameters (evaluateDepthEffects) become returned node pairs.
// Uniform-driven early returns become select()/If() with identical operand
// math. Screen-space reads use three's screenUV node, which resolves the
// per-backend viewport orientation the GLSL handled implicitly through
// gl_FragCoord.

import {
  abs,
  clamp,
  dFdx,
  dFdy,
  dot,
  float,
  Fn,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  perspectiveDepthToViewZ,
  pow,
  screenUV,
  select,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export function createLightingChunk({ u, tex, v, flags, frontFacingNode, cameraViewMatrixNode }) {
  // Widens a smoothstep transition by the value's screen derivative so the
  // edge stays ~1px feathered. edgeAntiAliasStrength = 0 → plain smoothstep.
  const toonEdgeSmooth = (value, edgeMin, edgeMax) => {
    const derivative = min(
      abs(dFdx(value)).add(abs(dFdy(value))).mul(u.edgeAntiAliasStrength),
      0.25,
    );
    return smoothstep(edgeMin.sub(derivative), edgeMax.add(derivative), value);
  };

  // NOTE (docs/tsl-conventions.md): select() operands must stay pure
  // expressions — branches that create vars or call Fn()s crash the GLSL
  // builder's detached type-resolution flow (ConditionalNode fallback setup).
  const resolveLightingNormal = (normal) => {
    const flattenWS = normalize(u.headForwardWS);
    const sphereWS = normalize(v.vWorldPosition.sub(u.headPositionWS));
    const fixedWS = normalize(mix(flattenWS, sphereWS, clamp(u.faceSphereBlend, 0.0, 1.0)));
    const headTracked = normalize(cameraViewMatrixNode.mul(vec4(fixedWS, 0.0)).xyz);

    const staticProxy = normalize(v.vFaceProxyNormal);
    // faceHeadSpaceMode 1 uses head-bone data (inert until headDataReady).
    const proxyNormal = select(u.faceHeadSpaceMode.equal(1), headTracked, staticProxy);
    const blended = normalize(mix(normal, proxyNormal, clamp(u.faceNormalProxyBlend, 0.0, 1.0)));

    const headModeUnready = u.faceHeadSpaceMode.equal(1).and(u.headDataReady.not());
    const inactive = u.isFace.not()
      .or(u.faceNormalProxyBlend.lessThanEqual(0.0))
      .or(headModeUnready);
    return select(inactive, normal, blended);
  };

  const calcCelShade = (N, L) => {
    const NoL = dot(N, L);
    const bodyCel = mix(
      toonEdgeSmooth(NoL, u.celShadeMidPoint.sub(u.celShadeSoftness), u.celShadeMidPoint.add(u.celShadeSoftness)),
      1.0,
      u.mainLightIgnoreCelShade,
    );
    const faceCel = mix(
      toonEdgeSmooth(
        NoL,
        u.celShadeMidPointForFaceArea.sub(u.celShadeSoftnessForFaceArea),
        u.celShadeMidPointForFaceArea.add(u.celShadeSoftnessForFaceArea),
      ),
      1.0,
      u.mainLightIgnoreCelShadeForFaceArea,
    );
    return select(u.isFace, faceCel, bodyCel);
  };

  const localLightBand = (normal, lightDirection) => {
    const halfLambert = dot(normal, lightDirection).mul(0.5).add(0.5);
    const softBand = smoothstep(0.08, 0.92, halfLambert);
    const faceBand = smoothstep(-0.15, 0.85, halfLambert);
    return select(u.isFace, mix(faceBand, 1.0, u.faceLocalLightLift), softBand);
  };

  const safeNormalizeDir2 = (value) => value.div(max(length(value), 1e-5));

  // Render-target reads sample at explicit level 0: the RTs have no mips and
  // WGSL forbids implicit-derivative sampling inside non-uniform control flow.
  // Pass targets are float COLOR textures (vec4 on both builders), so .x is
  // the depth channel — depth-texture sampling types differently per builder.
  const readSceneLinearDepth = (screenUv) => {
    const depthSample = tex.sceneDepthTexture.sample(clamp(screenUv, vec2(0.0), vec2(1.0))).level(0).x;
    return perspectiveDepthToViewZ(depthSample, u.cameraNearPlane, u.cameraFarPlane).negate();
  };

  // depthRim < 0 signals "depth data unavailable" (fresnel rim fallback);
  // contactShadow is 1 when unshadowed.
  const evaluateDepthEffects = (N, L, NoL, NoV) => {
    const depthRim = float(-1.0).toVar();
    const contactShadow = float(1.0).toVar();

    const allowed = flags.isOutlinePass
      ? null
      : u.sceneDepthReady.and(u.ditherOpacity.greaterThanEqual(1.0));

    if (allowed !== null) {
      If(allowed, () => {
        const selfDepth = v.vViewPos.z.negate().toVar();
        const screenUv = screenUV.toVar();

        const safeDistance = max(u.rimDepthSafeDistance, 0.05);
        const closeCurve = float(2.0).div(safeDistance)
          .sub(selfDepth.div(safeDistance.mul(safeDistance)));
        const distanceFix = select(
          selfDepth.greaterThan(safeDistance),
          float(1.0).div(selfDepth),
          mix(float(1.0).div(selfDepth), closeCurve, u.rimDepthCloseWidthReduce),
        ).toVar();

        const fovFix = abs(u.cameraProjection11).mul(0.0054);
        const aspectFix = vec2(u.sceneDepthResolution.y.div(u.sceneDepthResolution.x), 1.0);
        const offsetScale = aspectFix.mul(fovFix.mul(distanceFix)).mul(0.707).toVar();
        offsetScale.y.mulAssign(smoothstep(1.0, 0.95, screenUv.y));

        const faceWidthFix = select(u.isFace, float(0.66666), float(1.0));

        // ---- Rim light ----
        const rimDir = safeNormalizeDir2(L.xy);
        const rimUvOffset = offsetScale.mul(rimDir).mul(u.rimDepthWidth.mul(faceWidthFix)).toVar();
        const rimThreshold = clamp(u.rimDepthThresholdOffset.add(0.05), 0.0, 1.0);
        const selfDepthForRim = selfDepth.add(rimThreshold).toVar();
        const rimFade = float(10.0).div(max(u.rimDepthFadeRange, 1e-3)).toVar();

        const rim = clamp(
          readSceneLinearDepth(screenUv.add(rimUvOffset)).sub(selfDepthForRim).mul(rimFade),
          0.0,
          1.0,
        ).toVar();

        If(u.rimDepthDottedLineFix, () => {
          const extend = offsetScale.mul(u.rimDepthWidth).mul(0.5);
          const rimA = clamp(readSceneLinearDepth(screenUv.add(rimUvOffset).add(vec2(-1.0, 0.0).mul(extend))).sub(selfDepthForRim).mul(rimFade), 0.0, 1.0);
          const rimB = clamp(readSceneLinearDepth(screenUv.add(rimUvOffset).add(vec2(1.0, 0.0).mul(extend))).sub(selfDepthForRim).mul(rimFade), 0.0, 1.0);
          const rimC = clamp(readSceneLinearDepth(screenUv.add(rimUvOffset).add(vec2(0.0, 1.0).mul(extend))).sub(selfDepthForRim).mul(rimFade), 0.0, 1.0);
          rim.assign(min(min(rim, rimA), min(rimB, rimC)));
        });

        If(u.rimDepthMask3D, () => {
          const blur = 0.025;
          rim.mulAssign(smoothstep(0.075 - blur, 0.075 + blur, clamp(NoL, 0.0, 1.0).mul(NoV.oneMinus())));
        });

        rim.mulAssign(smoothstep(u.rimDepthFadeEndDistance, u.rimDepthFadeStartDistance, selfDepth));
        depthRim.assign(rim);

        // ---- Contact shadow ----
        If(u.contactShadowStrength.greaterThan(0.0), () => {
          const shadowDirVS = vec3(L).toVar();
          If(u.isFace.and(u.contactShadowFaceHeadUpBlend.greaterThan(0.0)).and(u.headDataReady), () => {
            const headUpVS = normalize(cameraViewMatrixNode.mul(vec4(u.headUpWS, 0.0)).xyz);
            shadowDirVS.assign(normalize(mix(L, headUpVS, u.contactShadowFaceHeadUpBlend)));
          });
          const shadowUvOffset = offsetScale
            .mul(safeNormalizeDir2(shadowDirVS.xy))
            .mul(u.contactShadowWidth.mul(faceWidthFix));
          const shadowThreshold = select(u.isFace, float(0.01), float(0.03)).add(u.contactShadowThresholdOffset);
          const shadowFade = float(50.0).div(max(u.contactShadowFadeRange, 1e-3));
          const unshadowed = clamp(
            readSceneLinearDepth(screenUv.add(shadowUvOffset)).sub(selfDepth.sub(shadowThreshold)).mul(shadowFade),
            0.0,
            1.0,
          );
          contactShadow.assign(mix(1.0, unshadowed, u.contactShadowStrength));
        });
      });
    }

    return { contactShadow, depthRim };
  };

  // ---- Character-only shadow map ----

  const charSelfShadowCompare = (coord) => {
    return step(coord.z, tex.charSelfShadowMap.sample(coord.xy).level(0).x);
  };

  const evaluateCharSelfShadowMap = Fn(() => {
    const shadow = float(1.0).toVar();

    If(u.charSelfShadowReady, () => {
      const worldN = normalize(v.vWorldNormal).mul(select(frontFacingNode, 1.0, -1.0)).toVar();

      const slopeBias = float(1.1).sub(dot(worldN, u.charSelfShadowLightDirection));
      const samplePosition = v.vWorldPosition
        .add(worldN.mul(slopeBias).mul(u.charSelfShadowNormalBias))
        .add(u.charSelfShadowLightDirection.mul(slopeBias).mul(u.charSelfShadowDepthBias));

      // Orthographic shadow camera: w is 1, so clip position is already NDC.
      const shadowNdc = u.charSelfShadowMatrix.mul(vec4(samplePosition, 1.0));
      const coord = shadowNdc.xyz.mul(0.5).add(0.5).toVar();

      const outside = coord.x.lessThan(0.0)
        .or(coord.x.greaterThan(1.0))
        .or(coord.y.lessThan(0.0))
        .or(coord.y.greaterThan(1.0))
        .or(coord.z.greaterThan(1.0))
        .or(coord.z.lessThan(0.0));

      If(outside.not(), () => {
        const sampled = float(0.0).toVar();
        If(u.charSelfShadowQuality.greaterThanEqual(2.0), () => {
          // 9-tap box PCF (unrolled).
          for (let x = -1; x <= 1; x += 1) {
            for (let y = -1; y <= 1; y += 1) {
              sampled.addAssign(charSelfShadowCompare(
                coord.add(vec3(vec2(x, y).mul(u.charSelfShadowTexelSize), 0.0)),
              ));
            }
          }
          sampled.divAssign(9.0);
        }).ElseIf(u.charSelfShadowQuality.greaterThanEqual(1.0), () => {
          const halfTexel = u.charSelfShadowTexelSize.mul(0.5);
          const total = charSelfShadowCompare(coord.add(vec3(halfTexel.negate(), halfTexel.negate(), 0.0)))
            .add(charSelfShadowCompare(coord.add(vec3(halfTexel, halfTexel.negate(), 0.0))))
            .add(charSelfShadowCompare(coord.add(vec3(halfTexel.negate(), halfTexel, 0.0))))
            .add(charSelfShadowCompare(coord.add(vec3(halfTexel, halfTexel, 0.0))));
          sampled.assign(total.mul(0.25));
        }).Else(() => {
          sampled.assign(charSelfShadowCompare(coord));
        });

        If(u.charSelfShadowSharpen.greaterThan(0.0), () => {
          sampled.assign(smoothstep(
            float(0.5).sub(u.charSelfShadowSharpen),
            float(0.5).add(u.charSelfShadowSharpen),
            sampled,
          ));
        });

        const selfDepth = v.vViewPos.z.negate();
        sampled.assign(mix(sampled, 1.0, clamp(selfDepth.sub(u.charSelfShadowFadeDistance.sub(1.0)), 0.0, 1.0)));

        If(u.charSelfShadowNdotLFix, () => {
          sampled.assign(mix(
            1.0,
            sampled,
            smoothstep(0.05, 0.2, clamp(dot(worldN, u.charSelfShadowLightDirection), 0.0, 1.0)),
          ));
        });

        shadow.assign(sampled);
      });
    });

    return shadow;
  });

  const getCharacterSelfShadowVisibility = (sceneShadowVisibility) => {
    // The shadow-map evaluation is hoisted into an If-assigned var: an Fn call
    // inside a select() operand breaks the GLSL builder (see NOTE above), and
    // this also skips the map taps entirely unless sourceMode is 2 — the same
    // shape as the GLSL if-chain.
    const mapVisibility = float(1.0).toVar();
    If(u.selfShadowSourceMode.equal(2), () => {
      mapVisibility.assign(evaluateCharSelfShadowMap());
    });
    return select(u.selfShadowSourceMode.equal(1), sceneShadowVisibility, mapVisibility);
  };

  const applyAverageShadowVisibility = (visibility, sceneShadowVisibility, selfShadowVisibility) => {
    const sourceAverage = visibility.add(sceneShadowVisibility).add(selfShadowVisibility).div(3.0);
    const liftedAverage = max(sourceAverage, u.averageShadowMinLight);
    const easedAverage = mix(liftedAverage, smoothstep(0.0, 1.0, liftedAverage), u.averageShadowSoftness);
    const applied = mix(visibility, easedAverage, u.averageShadowStrength);
    return select(u.averageShadowStrength.lessThanEqual(0.0), visibility, applied);
  };

  const calculateRimMask = (NoV, NoL, finalShadowArea, depthRim) => {
    const rimRaw = NoV.oneMinus().mul(NoL.mul(0.25).add(0.75));
    const fresnelRim = toonEdgeSmooth(rimRaw, u.rimMidPoint.sub(u.rimSoftness), u.rimMidPoint.add(u.rimSoftness));
    const rim = select(
      u.rimLightMode.equal(1).and(depthRim.greaterThanEqual(0.0)),
      depthRim,
      fresnelRim,
    );
    const masked = rim.mul(mix(1.0, finalShadowArea, u.rimBlockByShadow));
    return select(u.useRimLight, masked, 0.0);
  };

  return {
    applyAverageShadowVisibility,
    calcCelShade,
    calculateRimMask,
    evaluateDepthEffects,
    getCharacterSelfShadowVisibility,
    localLightBand,
    resolveLightingNormal,
    toonEdgeSmooth,
  };
}
