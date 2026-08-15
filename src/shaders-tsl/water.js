// TSL port of src/shaders/water.vert.glsl + water.frag.glsl — the stylized
// water surface. Consumed by createWaterMaterial on the TSL backend; exposes
// `.uniforms` under the exact GLSL uniform names so applyWaterSettingsToMaterial,
// updateWaterMaterialCamera, WaterScenePasses.bindToMaterial, setCloudShadow,
// and setWaterDebugMode keep working unchanged on both backends.
//
// Porting notes (docs/tsl-conventions.md):
// - Quality defines (WATER_QUALITY / WATER_DETAIL_OCTAVES / WATER_FOAM_OCTAVES)
//   and WATER_SHOALING become graph-build flags. Changing quality after
//   creation therefore needs a new material on this backend (the classic path
//   recompiles via defines); the lab HUD never does this live.
// - getShadowMask() → sampleEnvironmentSunShadow(worldPos): inert (1.0) until
//   the shared sun-shadow pass runs, like a scene with no shadow-casting sun.
// - Scene color/depth/reflection/ripple textures are render-target-fed:
//   every sample is .level(0); scene depth is a float COLOR texture with
//   linear window depth (see WaterScenePasses' node-backend depth render).
// - screenUV replaces gl_FragCoord/uResolution for the grab-pass uv; the
//   world reconstruction stays GL-convention in-shader because
//   updateWaterMaterialCamera composes the backend NDC adjustment into
//   uInvViewProjMatrix on the CPU (conventions #6).
// - Debug views are uniform-driven (masked sum, no deep select chains).
//
// TODO(tsl Phase 7): fog ordering — the GLSL applies scene fog AFTER the
// colorspace conversion (fog_fragment follows colorspace_fragment); the node
// pipeline would apply it before. Scene fog is disabled here until the fog
// phase resolves the ordering.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  Discard,
  dot,
  exp,
  float,
  Fn,
  If,
  length,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  pow,
  positionGeometry,
  refract,
  screenUV,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uniformArray,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';
import {
  waterCombineNormal,
  waterFbm,
  waterRotate2d,
} from './chunks/water-common.js';
import { createWaterColorChunk } from './chunks/water-color.js';
import { createWaterFoamChunk } from './chunks/water-foam.js';
import { createWaterLightingChunk } from './chunks/water-lighting.js';
import { createWaterRippleChunk } from './chunks/water-ripple.js';
import { createWaterShoreStateChunk } from './chunks/water-shore-state.js';
import { createWaterWavesChunk } from './chunks/water-waves.js';

// Node-backend placeholders: same roles as waterMaterial.js's placeholders,
// but linear (NoColorSpace) — node-backend render targets hold working-space
// values and TextureNode bakes the colorSpace conversion at graph build, so
// placeholder and live texture must agree (both linear).
function createLinearPlaceholder(rgba) {
  const tex = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

let placeholders = null;
function getPlaceholders() {
  if (!placeholders) {
    placeholders = {
      depth: createLinearPlaceholder([255, 255, 255, 255]),
      reflection: createLinearPlaceholder([126, 190, 218, 255]),
      ripple: createLinearPlaceholder([128, 128, 128, 255]),
      sceneColor: createLinearPlaceholder([80, 150, 190, 255]),
      shoreState: createLinearPlaceholder([0, 0, 0, 0]),
    };
  }
  return placeholders;
}

// UniformArrayNode keeps the authoring array on `.array` (its `.value` is the
// packed GPU buffer created at setup), so the `.uniforms` compatibility
// surface exposes array uniforms through a classic-style wrapper whose
// `.value` is that array — writeWaveUniforms's `uniforms.uWavesA.value[i]`
// writes hit the exact slots the node repacks each render. `.node` carries
// the UniformArrayNode for graph adoption (attachWaveUniforms).
export function waterArrayUniformEntry(node) {
  return { node, value: node.array };
}

// Accepts a UniformArrayNode or a wrapper made by waterArrayUniformEntry.
export function resolveWaterArrayUniformNode(entry) {
  return entry?.isNode ? entry : entry?.node ?? null;
}

/**
 * Creates the water surface NodeMaterial.
 *
 * flags:
 * - waveCount        WATER_WAVE_COUNT
 * - qualityLevel     WATER_QUALITY (0/1/2)
 * - detailOctaves    WATER_DETAIL_OCTAVES
 * - foamOctaves      WATER_FOAM_OCTAVES
 * - shoaling         WATER_SHOALING (aBedHeight attribute present)
 */
export function createWaterNodeMaterial({
  waveCount,
  qualityLevel = 2,
  detailOctaves = 4,
  foamOctaves = 3,
  shoaling = false,
} = {}) {
  const flags = {
    caustics: qualityLevel >= 1,
    chromaticCaustics: qualityLevel >= 2,
    detailOctaves,
    foamOctaves,
    shoaling: Boolean(shoaling),
    sparkles: qualityLevel >= 1,
    waveCount,
  };
  const holders = getPlaceholders();

  const wavesANode = uniformArray(Array.from({ length: waveCount }, () => new THREE.Vector4()), 'vec4');
  const wavesBNode = uniformArray(Array.from({ length: waveCount }, () => new THREE.Vector4()), 'vec4');

  // ---- Uniforms (exact GLSL names; UniformNodes/TextureNodes expose
  //      `.value` like ShaderMaterial uniform entries; array uniforms are
  //      wrapped — see waterArrayUniformEntry) ----
  const u = {
    // Manual scene-fog (linear, matches THREE.Fog). material.fog stays false
    // (see the fog-ordering TODO above); WaterSurface.update() mirrors
    // scene.fog into these each frame so distant water fades into the same
    // haze as everything else instead of cutting sharp against fogged
    // terrain. far <= near disables.
    uSceneFogColor: uniform(new THREE.Color(0.72, 0.83, 0.94)),
    uSceneFogDensity: uniform(0),
    uSceneFogFar: uniform(0),
    uSceneFogNear: uniform(0),
    // Exponential distance fog matching the environment shader's height fog
    // (water sits at the bottom of the height falloff, so the depth term is
    // the whole story). Without this, water at the far shore stays bright
    // while terrain behind it hazes out — reading like water slicing into
    // the mountains. density 0 disables.
    uDistanceFogColor: uniform(new THREE.Color(0.66, 0.8, 0.94)),
    uDistanceFogDensity: uniform(0),
    uTime: uniform(0),
    uResolution: uniform(new THREE.Vector2(1, 1)),
    uCameraNear: uniform(0.05),
    uCameraFar: uniform(200),
    uInvViewProjMatrix: uniform(new THREE.Matrix4()),

    uSceneColor: texture(holders.sceneColor),
    uSceneDepth: texture(holders.depth),
    uUseSceneColor: uniform(0),
    uUseSceneDepth: uniform(0),
    // WaterScenePasses writes a canonical forward [0 near, 1 far] float
    // color target. When the host renderer uses reversed depth, remap that
    // sample before Three's projection-aware depth helpers consume it.
    uDepthTargetNeedsReverse: uniform(0),

    uReflectionMap: texture(holders.reflection),
    uReflectionMatrix: uniform(new THREE.Matrix4()),
    uUseReflectionMap: uniform(0),
    uReflectionStrength: uniform(0.55),
    uReflectionDistortion: uniform(0.04),

    uRippleMap: texture(holders.ripple),
    uUseRippleMap: uniform(0),
    uRippleRegion: uniform(new THREE.Vector4(0, 0, 10, 10)),
    uRippleTexel: uniform(new THREE.Vector2(1 / 256, 1 / 256)),
    uRippleHeightScale: uniform(1),

    uShoreStateMap: texture(holders.shoreState),
    uUseShoreState: uniform(0),
    uShoreStateRegion: uniform(new THREE.Vector4(0, 0, 1, 1)),

    uShoalingDepth: uniform(1.4),
    uShorelineWaves: uniform(0.35),
    uShorelineRunup: uniform(0.6),
    uRunupDistance: uniform(0),
    // Runtime event envelope supplied by WaterSurface. Keeping the irregular
    // sequence on the CPU avoids expanding the already-dense WebGPU graph.
    uSwashRunupScale: uniform(1),
    uSwashStartOffset: uniform(0),
    uSwashEndOffset: uniform(0),
    uSwashCycle: uniform(0),
    uSwashProgress: uniform(0),
    uSwashIncidenceX: uniform(0),
    // (phase radians, alongshore frequency rad/m, amplitude metres).
    uSwashEdgeShape: uniform(new THREE.Vector3(0, 0.1, 0)),
    uBreakerEnabled: uniform(1),
    uBreakerAmount: uniform(0.5),
    uWaveEnergy: uniform(0.3),

    uWavesA: waterArrayUniformEntry(wavesANode),
    uWavesB: waterArrayUniformEntry(wavesBNode),

    uDetailNormalStrength: uniform(0.5),
    uDetailScale: uniform(0.5),
    uFlowDirection: uniform(new THREE.Vector2(1, 0)),
    uFlowSpeed: uniform(0.35),

    uShallowColor: uniform(new THREE.Color()),
    uMidColor: uniform(new THREE.Color()),
    uDeepColor: uniform(new THREE.Color()),
    uDepthFadeDistance: uniform(1.2),
    uDeepFadeDistance: uniform(3),
    uOpacity: uniform(0.9),
    uRefractionStrength: uniform(0.6),
    uIndexOfRefraction: uniform(1.333),
    uUnderwaterTransmission: uniform(1.0),
    uUnderwaterTintStrength: uniform(0.35),
    uCausticsStrength: uniform(0.6),
    uCausticsScale: uniform(1),
    uCausticsSpeed: uniform(1),

    uFoamColor: uniform(new THREE.Color()),
    uFoamAmount: uniform(1),
    uSwashFoamAmount: uniform(1.15),
    uFoamContactDistance: uniform(1),
    uFoamLineSpacing: uniform(1.4),
    uFoamNoiseScale: uniform(0.6),
    uWhitecapAmount: uniform(0.3),
    uRippleFoamStrength: uniform(1),

    uSunDirection: uniform(new THREE.Vector3(0, 1, 0)),
    uSunColor: uniform(new THREE.Color()),
    uSpecularStrength: uniform(0.8),
    uSpecularShininess: uniform(120),
    uSpecularStretch: uniform(0.5),
    uSparkleStrength: uniform(0.5),
    uSparkleScale: uniform(1.2),
    uSparkleSpeed: uniform(1),
    uSunGlowStrength: uniform(0.6),
    uFresnelStrength: uniform(0.6),
    uFresnelPower: uniform(3),
    uFresnelBias: uniform(0.12),
    uReflectionSoftness: uniform(0.4),
    uFresnelColor: uniform(new THREE.Color(1, 1, 1)),
    uSkyZenithColor: uniform(new THREE.Color(0.35, 0.58, 0.85)),
    uSkyHorizonColor: uniform(new THREE.Color(0.85, 0.92, 1.0)),

    uCloudShadowStrength: uniform(0),
    uCloudShadowCoverage: uniform(0.45),
    uCloudShadowScale: uniform(0.012),
    uCloudShadowVelocity: uniform(new THREE.Vector2(0.02, 0.006)),
    uSceneShadowStrength: uniform(0.5),

    uDebugMode: uniform(0, 'int'),
    uCameraBelow: uniform(0),
  };

  const waves = createWaterWavesChunk({ wavesA: wavesANode, wavesB: wavesBNode, waveCount });
  const ripple = createWaterRippleChunk({ u });
  const shoreState = createWaterShoreStateChunk({ u });
  const color = createWaterColorChunk({ u, flags });
  const foam = createWaterFoamChunk({ u, foamOctaves });
  const lighting = createWaterLightingChunk({ u });

  const material = new NodeMaterial();
  material.name = 'StylizedWater';
  material.lights = false;
  // TODO(tsl Phase 7): fog ordering (see module header).
  material.fog = false;
  material.side = THREE.DoubleSide;
  material.transparent = true;
  material.depthWrite = true;

  // ---- Vertex stage (water.vert.glsl) ----
  const vWorldPosition = varying(vec3(), 'vWaterWorldPosition');
  const vRestWorldXZ = varying(vec2(), 'vWaterRestWorldXZ');
  const vCrest = varying(float(), 'vWaterCrest');
  const vGerstnerNormal = varying(vec3(), 'vWaterGerstnerNormal');
  const vShoal = varying(float(), 'vWaterShoal');
  const vBreaker = varying(float(), 'vWaterBreaker');
  // The connected wet/dry geometry is evaluated per vertex, but foam noise
  // is evaluated per fragment. Passing only these smooth physical inputs
  // avoids exposing the water grid as large triangular white patches.
  const vSwashFoamData = varying(vec2(), 'vWaterSwashFoamData');
  // Small shore-normal foam drift. This never displaces geometry: amplifying
  // Gerstner's horizontal orbit folded the near-shore grid into white wedges.
  const vSwashSurge = varying(vec2(), 'vWaterSwashSurge');
  const vSwashZone = varying(float(), 'vWaterSwashZone');
  // Rest-pose column depth (waterline − bed). Deeply negative = the surface
  // is under dry land; the fragment shader discards those fragments so
  // triangles spanning a cliff face can't poke through the terrain.
  const vRestDepth = varying(float(), 'vWaterRestDepth');

  material.vertexNode = Fn(() => {
    const worldPosition = modelWorldMatrix.mul(vec4(positionGeometry, 1.0)).toVar();
    const restXZ = worldPosition.xz.toVar();
    vRestWorldXZ.assign(restXZ);

    // Shallow water filters the spectrum: the short cross chop dies out toward
    // the surf zone, leaving clean parallel lines of the dominant swell.
    const chopWeight = float(1.0).toVar();
    const shoal = float(1.0).toVar();
    const rippleShoal = float(1.0).toVar();
    const breakFoam = float(0.0).toVar();

    let rawWave;
    let nearshore = null;
    const waveDisplacement = vec3(0.0).toVar();
    if (flags.shoaling) {
      const aBedHeight = attribute('aBedHeight', 'float');
      const restDepth = worldPosition.y.sub(aBedHeight).toVar();
      vRestDepth.assign(restDepth);
      // Big swells feel the bottom much deeper than small ones.
      const shoalRange = max(max(u.uShoalingDepth, u.uWaveEnergy.mul(2.2)), 1e-3).toVar();
      chopWeight.assign(mix(0.15, 1.0, smoothstep(shoalRange.mul(0.3), shoalRange.mul(1.4), restDepth)));

      // Packed CPU-baked mild-slope field: q, dq/dx, dq/dz, slot mask. It is fully
      // active through the breaker/swash handoff, fades back to the original
      // plane phase over a broad deep-water band, and only affects the two
      // dominant swell slots. The attribute is a plane-wave fallback on
      // stages where the nearshore solve is disabled or invalid.
      const aNearshorePhase = attribute('aNearshorePhase', 'vec4').toVar();
      const nearshoreBlend = smoothstep(
        shoalRange.mul(0.8),
        shoalRange.mul(1.8),
        restDepth,
      ).oneMinus().toVar();
      nearshore = {
        phaseCoordinate: aNearshorePhase.x,
        waveVector: aNearshorePhase.yz,
        blend: nearshoreBlend,
        slotMask: aNearshorePhase.w,
      };

      rawWave = waves.gerstnerDisplacementFiltered(
        restXZ,
        u.uTime,
        chopWeight,
        nearshore,
      ).toVar();

      // Stylized breaking-wave shoaling (see water.vert.glsl for the model).
      const deepFactor = smoothstep(0.0, shoalRange, restDepth);
      const rearUp = smoothstep(shoalRange.mul(0.45), shoalRange.mul(1.5), restDepth).oneMinus()
        .mul(smoothstep(0.05, 0.35, restDepth));
      shoal.assign(mix(u.uShorelineWaves, 1.0, deepFactor).mul(rearUp.mul(0.3).add(1.0)));

      const targetY = rawWave.y.mul(shoal).toVar();
      const capY = max(restDepth, 0.0).mul(0.72).toVar();
      // Soft cap: 10% of the excess bleeds through so sustained over-cap swell
      // reads as rounded rollers instead of flat-topped plateaus.
      const capExcess = max(targetY.sub(capY), 0.0).toVar();
      const brokenY = min(targetY, capY).add(capExcess.mul(0.1)).toVar();
      // A trough can never dip below the seabed.
      brokenY.assign(max(brokenY, max(restDepth, 0.0).negate().add(0.04)));
      breakFoam.assign(
        clamp(capExcess.mul(0.9).div(max(u.uWaveEnergy.mul(0.3), 1e-3)), 0.0, 1.0)
          .mul(u.uBreakerAmount)
          .mul(u.uBreakerEnabled),
      );

      // The surf hands into one connected swash event. The dominant crest's
      // shoreline arrival starts a quick uprush; gravity then owns the longer
      // drain. Offshore Gerstner phase still sets the visible incidence angle,
      // while the wet/dry edge remains one inequality instead of many islands.
      const aBedSlope = attribute('aBedSlope', 'float');
      const aBedGradient = attribute('aBedGradient', 'vec2').toVar();
      const bedSlope = max(aBedSlope, 0.005).toVar();
      const shoreDirection = aBedGradient.div(max(length(aBedGradient), 0.005)).toVar();
      const alongDirection = vec2(shoreDirection.y, shoreDirection.x.negate()).toVar();
      const alongCoordinate = dot(restXZ, alongDirection).toVar();
      // WaterSurface computes this frame once on the CPU and shares it with
      // the persistent foam/wetness pass. That keeps the visible lip, foam
      // injection, and wet-sand history on the exact same event and removes a
      // duplicate phase/easing stack from this already-large shader.
      const swashCycle = u.uSwashCycle.toVar();
      const swashProgress = u.uSwashProgress.toVar();

      // The user setting is the maximum horizontal reach. Runtime event
      // uniforms vary ordinary peaks over 80–100%, carry the previous rundown
      // endpoint into the next uprush, and let each backwash stop at a slightly
      // different point around the still-water shoreline.
      const explicitRunup = u.uRunupDistance.greaterThan(0.01);
      const maximumHorizontalReach = select(
        explicitRunup,
        u.uRunupDistance,
        u.uShorelineRunup.mul(u.uWaveEnergy).div(bedSlope),
      ).toVar();
      const runupDistance = maximumHorizontalReach
        .mul(select(explicitRunup, u.uSwashRunupScale, 1.0)).toVar();
      const startOffset = select(explicitRunup, u.uSwashStartOffset, 0.0).toVar();
      const endOffset = select(explicitRunup, u.uSwashEndOffset, 0.0).toVar();
      const edgeDistance = select(
        swashCycle.lessThan(0.34),
        mix(startOffset, runupDistance, swashProgress),
        mix(endOffset, runupDistance, swashProgress),
      ).toVar();
      const maximumSwashReach = maximumHorizontalReach.mul(bedSlope).toVar();
      // Match the incoming oblique crest instead of marching the whole beach
      // forward like a ruler. A broad tilt supplies the incidence angle; two
      // small traveling scallops break up the lip without splitting it.
      // Retain a modest angle even at nominal rest/full reach: an oblique
      // crest reaches one end of a real beach first. Forcing every X column
      // onto the same endpoint created the conspicuous horizontal ruler line.
      const edgeEnvelope = mix(0.18, 1.0, sin(swashProgress.mul(Math.PI))).toVar();
      const incidenceSlope = clamp(u.uSwashIncidenceX.mul(0.52), -0.2, 0.2).toVar();
      const rawEdgeTilt = alongCoordinate.mul(incidenceSlope).negate().toVar();
      // Bounded soft-sign: preserves the local crest angle without ever
      // reaching a flat clamp. The former unbounded x*slope term reached
      // ±22 m across this lab and pinned whole shoreline blocks to one cap.
      const edgeTilt = rawEdgeTilt.div(abs(rawEdgeTilt).div(2.0).add(1.0)).toVar();
      const edgeScallop = sin(alongCoordinate.mul(0.32).sub(u.uTime.mul(0.35)))
        .sub(sin(u.uTime.mul(-0.35)))
        .add(
          sin(alongCoordinate.mul(0.91).add(u.uTime.mul(0.18)))
            .sub(sin(u.uTime.mul(0.18)))
            .mul(0.35),
        )
        .mul(0.4);
      // Broad per-event tongues make the actual water silhouette irregular,
      // not merely the foam painted behind it. The squared cycle envelope is
      // zero with zero velocity at event boundaries, so shape seeds may vary
      // each wave without a shoreline pop. Subtracting the x=0 samples keeps
      // the calibrated 8-10 m centerline reach unchanged.
      const macroWave = sin(swashCycle.mul(Math.PI)).toVar();
      const secondaryPhase = u.uSwashEdgeShape.x.mul(-0.71).toVar();
      const edgeMacro = sin(
        alongCoordinate.mul(u.uSwashEdgeShape.y).add(u.uSwashEdgeShape.x),
      ).sub(sin(u.uSwashEdgeShape.x))
        .add(
          sin(
            alongCoordinate.mul(u.uSwashEdgeShape.y).mul(2.35).add(secondaryPhase),
          ).sub(sin(secondaryPhase)).mul(0.42),
        )
        .mul(u.uSwashEdgeShape.z)
        .mul(macroWave.mul(macroWave))
        .toVar();
      const edgeHead = edgeDistance.mul(bedSlope)
        .add(
          edgeTilt.add(edgeScallop).mul(edgeEnvelope)
            .add(edgeMacro)
            .mul(bedSlope),
        ).toVar();
      const filmHead = restDepth.add(edgeHead).toVar();
      // Behind the edge the sheet is centimetres deep, not a second full-body
      // water plane. Dry vertices remain conformal just above the bed; the
      // fragment-space signed head owns visibility, avoiding lifting rows.
      const film = clamp(filmHead.mul(0.45).add(0.008), 0.003, 0.045).toVar();
      // Cap the drape: the film follows the bed up the beach, but a steep
      // bank (terraced shore, cliff base) puts a whole cliff step inside one
      // mesh cell — the dry vertex would ride 10m+ up the slope and drag
      // surviving near-shore fragments with it (giant white "iceberg"
      // wedges at distant shorelines). Real swash never climbs above ~½m
      // over the rest waterline, so clamp the geometry there and let the
      // vRestDepth fragment discard own the rest.
      const filmY = min(
        aBedHeight.sub(worldPosition.y).add(film),
        max(0.5, maximumSwashReach.mul(1.1)),
      );
      // Hand off over the last ~4 m of the 1:20 profile. Deeper water stays
      // the Gerstner surface, preventing the visible "three stacked systems"
      // boundary that a reach-sized blend band created.
      const beach = smoothstep(0.06, 0.22, restDepth).oneMinus().toVar();
      vSwashZone.assign(beach);

      rippleShoal.assign(smoothstep(0.0, 0.18, restDepth));
      const foamWidth = max(bedSlope.mul(0.68), 0.018).toVar();
      vSwashFoamData.assign(vec2(filmHead, foamWidth));
      breakFoam.mulAssign(beach.oneMinus());
      shoal.mulAssign(beach.oneMinus());
      // Foam moves metres with the sheet, not a token 24 cm texture wobble.
      // Continuous alongshore drift plus the non-resetting animation clock
      // prevents successive drains retracing the exact same texture path.
      const surgeDistance = min(runupDistance.mul(0.32), 3.2).toVar();
      const swashDrift = shoreDirection.mul(swashProgress).mul(surgeDistance)
        .add(alongDirection.mul(sin(u.uTime.mul(0.37))).mul(swashProgress).mul(0.55));
      vSwashSurge.assign(swashDrift.mul(beach));
      waveDisplacement.assign(vec3(
        rawWave.x.mul(shoal),
        mix(brokenY, filmY, beach),
        rawWave.z.mul(shoal),
      ));
    } else {
      vSwashSurge.assign(vec2(0.0));
      vSwashZone.assign(float(0.0));
      vSwashFoamData.assign(vec2(-1.0, 0.018));
      vRestDepth.assign(float(1000.0));
      rawWave = waves.gerstnerDisplacementFiltered(restXZ, u.uTime, chopWeight).toVar();
      waveDisplacement.assign(rawWave);
    }

    const rippleState = ripple.rippleSample(restXZ);
    const rippleHeight = rippleState.r.mul(u.uRippleHeightScale).mul(rippleShoal).toVar();

    worldPosition.xyz.addAssign(waveDisplacement);
    worldPosition.y.addAssign(rippleHeight);

    // Evaluate the analytic long-wave frame once per vertex. The former
    // per-fragment eight-wave loop was the largest source of WebGPU private
    // address-space pressure; interpolating this macro normal leaves the
    // fragment stage's high-frequency detail and ripple normals intact.
    const gerstner = waves.gerstnerNormalFiltered(
      restXZ,
      u.uTime,
      chopWeight,
      nearshore,
    );
    const shoalBlend = clamp(shoal, 0.0, 1.0).toVar();
    vGerstnerNormal.assign(normalize(mix(vec3(0.0, 1.0, 0.0), gerstner.normal, shoalBlend)));
    vCrest.assign(gerstner.crest);
    vShoal.assign(shoal);
    vBreaker.assign(breakFoam);
    vWorldPosition.assign(worldPosition.xyz);

    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(worldPosition.xyz, 1.0));
  })();

  // ---- Fragment stage (water.frag.glsl) ----
  material.fragmentNode = Fn(() => {
    // Apply the nonlinear wet threshold after the signed film head has been
    // interpolated. Evaluating smoothstep at sparse vertices first exposed
    // individual triangle rows as the water advanced at a grazing angle.
    if (flags.shoaling) {
      const fragmentWet = mix(
        1.0,
        smoothstep(-0.004, 0.012, vSwashFoamData.x),
        clamp(vSwashZone, 0.0, 1.0),
      );
      Discard(fragmentWet.lessThan(0.015));
    }
    const screenUv = screenUV.toVar();
    const toCamera = cameraPosition.sub(vWorldPosition).toVar();
    const viewDir = normalize(toCamera).toVar();
    const viewDistance = length(toCamera).toVar();

    // --- surface normal: interpolated Gerstner frame + fbm detail + ripples ---
    const gerstnerNormal = normalize(vGerstnerNormal).toVar();
    const crest = float(vCrest).toVar();
    const shoalBlend = clamp(vShoal, 0.0, 1.0).toVar();
    crest.assign(clamp(crest.mul(shoalBlend).add(vBreaker.mul(crest.mul(0.55).add(0.45))), 0.0, 1.0));
    const gerstnerNormalY = gerstnerNormal.y.toVar();

    const detailFade = smoothstep(16.0, 60.0, viewDistance).oneMinus();
    // Beyond ~100 m the ripple field is far below one texel per period, so the
    // 20% residual left by `detailFade` stopped reading as water and started
    // reading as a fixed screen-space weave that crawls with the camera — the
    // "uniformly tiled ripple pattern" §13 rejects outright. Fading it to a
    // 10% floor across 100-360 m removes the aliasing without flattening any
    // distance a hero shot can actually resolve (D19-061).
    const horizonFade = smoothstep(100.0, 360.0, viewDistance).oneMinus();
    const swashOptics = clamp(vSwashZone, 0.0, 1.0).toVar();
    // A centimetres-thin film is optically smooth at this camera scale. Full
    // open-water normal detail turned every texel into a bright grazing-angle
    // mirror and made the swash look like an opaque sheet of snow.
    const detailStrength = u.uDetailNormalStrength
      .mul(mix(0.2, 1.0, detailFade))
      .mul(mix(0.1, 1.0, horizonFade))
      .mul(mix(1.0, 0.18, swashOptics)).toVar();
    const flowOffset = u.uFlowDirection.mul(u.uTime).mul(u.uFlowSpeed).toVar();
    const detailUv1 = vRestWorldXZ.mul(u.uDetailScale).add(flowOffset.mul(0.55));
    const detailUv2 = waterRotate2d(1.9).mul(vRestWorldXZ).mul(u.uDetailScale.mul(1.63)).sub(flowOffset.mul(0.34));
    const waterDetailGradient = (detailUv) => {
      const uv = vec2(detailUv).toVar();
      const center = waterFbm(uv, flags.detailOctaves).toVar();
      const dx = waterFbm(uv.add(vec2(0.11, 0.0)), flags.detailOctaves);
      const dy = waterFbm(uv.add(vec2(0.0, 0.11)), flags.detailOctaves);
      return vec2(dx.sub(center), dy.sub(center)).div(0.11);
    };
    const detailGradient = waterDetailGradient(detailUv1).mul(detailStrength)
      .add(waterDetailGradient(detailUv2).mul(detailStrength).mul(0.55)).toVar();
    const rippleGradient = ripple.rippleGradient(vRestWorldXZ);
    const rippleState = ripple.rippleSample(vRestWorldXZ).toVar();
    const waveNormal = waterCombineNormal(gerstnerNormal, rippleGradient).toVar();
    const surfaceNormal = waterCombineNormal(waveNormal, detailGradient).toVar();
    // Refraction reads with most of the micro detail removed.
    const refractionNormal = waterCombineNormal(waveNormal, detailGradient.mul(0.3)).toVar();

    const output = vec4(0.0).toVar();
    If(u.uCameraBelow.greaterThan(0.5), () => {
      // --- underside: camera below the surface looking up ---
      // Trace the view ray from water into air. The grab pass uses a clipped
      // same-pose camera while submerged, so this lookup contains the actual
      // sky, clouds, and above-water silhouettes rather than a sky-color
      // approximation. The physical critical angle anchors the composition;
      // color and edge shaping stay deliberately stylized.
      const incident = viewDir.negate().toVar();
      const eta = clamp(u.uIndexOfRefraction, 1.0001, 1.8).toVar();
      const cosIncident = clamp(dot(incident, surfaceNormal), 0.0, 1.0).toVar();
      const criticalCos = max(
        float(1.0).sub(float(1.0).div(eta.mul(eta))),
        0.0,
      ).sqrt().toVar();
      const snellWindow = smoothstep(
        criticalCos.sub(0.04),
        criticalCos.add(0.045),
        cosIncident,
      ).toVar();
      const refractedDirection = refract(
        incident,
        surfaceNormal.negate(),
        eta,
      ).toVar();
      // refract() returns zero under total internal reflection. Blend toward
      // the incident ray there to keep the projection numerically stable;
      // snellWindow prevents that fallback ray from becoming transmission.
      const transmissionDirection = normalize(mix(
        incident,
        refractedDirection,
        max(snellWindow, 0.001),
      )).toVar();
      const transmissionWorld = vWorldPosition.add(
        transmissionDirection.mul(min(u.uCameraFar.mul(0.75), 400.0)),
      );
      const transmissionClip = cameraProjectionMatrix
        .mul(cameraViewMatrix)
        .mul(vec4(transmissionWorld, 1.0)).toVar();
      const transmissionUv = transmissionClip.xy
        .div(max(abs(transmissionClip.w), 1e-5))
        .mul(vec2(0.5, -0.5))
        .add(0.5)
        .add(refractionNormal.xz.mul(u.uRefractionStrength).mul(0.012))
        .toVar();
      const insideCapture = smoothstep(-0.01, 0.01, transmissionUv.x)
        .mul(smoothstep(0.99, 1.01, transmissionUv.x).oneMinus())
        .mul(smoothstep(-0.01, 0.01, transmissionUv.y))
        .mul(smoothstep(0.99, 1.01, transmissionUv.y).oneMinus())
        .mul(smoothstep(0.001, 0.03, transmissionClip.w));
      const capturedAir = u.uSceneColor
        .sample(clamp(transmissionUv, vec2(0.0), vec2(1.0)))
        .level(0).rgb;
      const transmitted = mix(
        lighting.proceduralSky(transmissionDirection),
        capturedAir,
        clamp(insideCapture.mul(u.uUseSceneColor), 0.0, 1.0),
      ).toVar();

      // Compact Beer-Lambert-inspired attenuation through the camera's water
      // column. This uses ToonLab's authored palette, keeping the result
      // graphic and readable instead of pursuing the reference's realism.
      const cameraDepth = max(vWorldPosition.y.sub(cameraPosition.y), 0.0).toVar();
      const volumeAbsorb = exp(
        cameraDepth.div(max(
          u.uDepthFadeDistance.add(u.uDeepFadeDistance.mul(0.5)),
          0.1,
        )).negate(),
      ).oneMinus().toVar();
      const waterTint = mix(
        u.uShallowColor,
        u.uMidColor,
        clamp(volumeAbsorb.mul(1.35), 0.0, 1.0),
      ).toVar();
      transmitted.mulAssign(mix(
        vec3(1.0),
        waterTint.mul(1.12),
        volumeAbsorb.mul(0.3),
      ));
      transmitted.assign(mix(
        transmitted,
        waterTint,
        volumeAbsorb.mul(u.uUnderwaterTintStrength),
      ));

      const f0 = eta.sub(1.0).div(eta.add(1.0)).pow2().toVar();
      const fresnel = f0.add(
        f0.oneMinus().mul(pow(cosIncident.oneMinus(), 5.0)),
      ).toVar();
      const transmissionWeight = fresnel.oneMinus()
        .mul(snellWindow)
        .mul(u.uUnderwaterTransmission)
        .toVar();
      const tirColor = mix(
        u.uDeepColor.mul(0.48),
        u.uMidColor.mul(0.72),
        cosIncident.mul(0.3),
      );
      const underColor = mix(
        tirColor,
        transmitted,
        clamp(transmissionWeight, 0.0, 1.0),
      ).toVar();
      const criticalRim = smoothstep(
        criticalCos.sub(0.085),
        criticalCos,
        cosIncident,
      ).mul(smoothstep(
        criticalCos,
        criticalCos.add(0.1),
        cosIncident,
      ).oneMinus());
      underColor.addAssign(u.uFresnelColor.mul(criticalRim).mul(0.12));
      underColor.addAssign(
        lighting.sparkles(vRestWorldXZ, surfaceNormal, viewDir, viewDistance, u.uTime).mul(0.5),
      );
      // The captured air-side scene is already composited; render the
      // underside opaque to avoid double-blending the main scene behind it.
      output.assign(vec4(underColor, 1.0));
    }).Else(() => {
      // --- scene depth, refraction, and the water body color ---
      const waterViewDistance = cameraViewMatrix.mul(vec4(vWorldPosition, 1.0)).z.negate().toVar();
      const sceneRawDepth = color.sceneRawDepth(screenUv).toVar();
      const sceneViewDistance = color.viewDistanceFromDepth(sceneRawDepth).toVar();
      const viewDepthDiff = max(sceneViewDistance.sub(waterViewDistance), 0.0).toVar();

      const refractedUv = color.refractedUv(screenUv, refractionNormal, waterViewDistance, viewDepthDiff).toVar();
      const refractedRawDepth = color.sceneRawDepth(refractedUv).toVar();
      const groundWorld = color.worldFromDepth(refractedUv, refractedRawDepth).toVar();
      const columnDepth = select(
        u.uUseSceneDepth.greaterThan(0.5),
        max(vWorldPosition.y.sub(groundWorld.y), 0.0),
        u.uDepthFadeDistance.add(u.uDeepFadeDistance),
      ).toVar();
      const effectiveDepth = columnDepth.add(viewDepthDiff.mul(0.18));

      const { absorb, tint: absorptionTint } = color.absorptionTint(effectiveDepth);

      const bodyColor = vec3(0.0).toVar();
      const alpha = float(1.0).toVar();
      If(u.uUseSceneColor.greaterThan(0.5), () => {
        const sceneColor = u.uSceneColor.sample(refractedUv).level(0).rgb;
        const tintedScene = sceneColor.mul(mix(vec3(1.0), u.uShallowColor.mul(1.25), clamp(absorb.mul(0.6), 0.0, 1.0)));
        bodyColor.assign(mix(tintedScene, absorptionTint, absorb));
        alpha.assign(1.0);
      }).Else(() => {
        bodyColor.assign(absorptionTint);
        alpha.assign(clamp(u.uOpacity.add(absorb.mul(0.3)), 0.0, 1.0));
      });
      // A thin film still has a readable water body. Preserve enough of the
      // sand for a wet-ground cue, but keep the shallow tint and sky sheen so
      // the run-up remains visibly connected to the sea.
      const clearScene = u.uSceneColor.sample(screenUv).level(0).rgb;
      const wetScene = clearScene.mul(0.85);
      const clearSceneWeight = select(u.uUseSceneColor.greaterThan(0.5), 0.48, 0.0);
      bodyColor.assign(mix(bodyColor, wetScene, swashOptics.mul(clearSceneWeight)));
      bodyColor.assign(mix(bodyColor, u.uShallowColor, swashOptics.mul(0.18)));

      // Steep wave faces act like windows, not lenses: drop caustics there,
      // and fade the dappling with view distance (WATER_QUALITY >= 1).
      const caustics = flags.caustics
        ? color.caustics(groundWorld, columnDepth, u.uTime)
          .mul(smoothstep(0.62, 0.85, gerstnerNormalY))
          .mul(smoothstep(14.0, 38.0, viewDistance).oneMinus())
          .toVar()
        : vec3(0.0);

      // --- foam ---
      // Foam pattern follows the swash sheet's orbital surge (zero offshore),
      // so the drain visibly pulls the foam seaward instead of the pattern
      // staying glued to rest space while only the envelope moves.
      const foamXZ = vRestWorldXZ.sub(vSwashSurge).toVar();
      const pierce = color.pierceProximity(screenUv, waterViewDistance, vWorldPosition.y).toVar();
      const shoreFoam = foam.shoreFoam(columnDepth, viewDepthDiff, foamXZ, u.uTime, pierce)
        // The legacy contact mask assumes a water body deeper than the foam
        // distance. On a centimetre-thin swash film it is almost 1 everywhere,
        // so keep its familiar offshore/rock character but let the dedicated
        // turbulent edge above own the beach foam.
        .mul(mix(1.0, 0.05, clamp(vSwashZone, 0.0, 1.0))).toVar();
      const whitecaps = foam.whitecaps(crest, gerstnerNormalY, foamXZ, u.uTime).toVar();
      const rippleFoamRaw = clamp(
        rippleState.b.mul(u.uRippleFoamStrength).add(abs(rippleState.r).mul(u.uRippleFoamStrength).mul(4.0)),
        0.0,
        1.0,
      );
      const swashFoamRaw = float(0.0).toVar();
      const persistentShoreState = flags.shoaling
        ? shoreState.shoreStateSample(vRestWorldXZ)
        : vec4(0.0);
      const persistentShoreCoverage = flags.shoaling
        ? shoreState.shoreStateCoverage(vRestWorldXZ)
        : float(0.0);
      if (flags.shoaling) {
        // The temporal shore field owns transport, decay, breakup, and
        // event-to-event variation. Keep this main material deliberately
        // small: duplicating procedural noise here can exceed WebGPU's hard
        // 8 KiB private-variable budget for StylizedWater.
        If(vSwashZone.greaterThan(0.001), () => {
          const filmHead = vSwashFoamData.x.toVar();
          const foamWidth = max(vSwashFoamData.y, 0.018).toVar();
          const fallbackBand = smoothstep(-0.006, 0.004, filmHead)
            .mul(smoothstep(foamWidth.mul(0.7), foamWidth.mul(1.25), filmHead).oneMinus());
          const storedFoam = clamp(
            // The state pass deliberately stores low-energy values so its
            // advection remains stable. Remap those values into the original
            // foamShape range here: the former 0.16..0.58 / 0.82 mapping
            // required active state B ~= 0.34 before a single solid pixel
            // could appear, and residue A could never reach the shape's
            // onset at all. Active foam gets the lower presentation onset;
            // residue stays a quiet modifier so old events cannot rebuild a
            // continuous bright shoreline. This does not add a coverage
            // floor or refill the source's true gaps.
            smoothstep(0.12, 0.48, persistentShoreState.b).mul(0.9)
              .add(smoothstep(0.25, 0.7, persistentShoreState.a).mul(0.18)),
            0.0,
            1.0,
          );
          swashFoamRaw.assign(
            max(
              storedFoam,
              fallbackBand.mul(persistentShoreCoverage.oneMinus()),
            ).mul(vSwashZone),
          );
        });
      }
      const foamAmount = clamp(u.uFoamAmount, 0.0, 2.0).toVar();
      const baseFoamRaw = clamp(
        shoreFoam.add(whitecaps).add(vBreaker.mul(0.85)).add(rippleFoamRaw),
        0.0,
        1.0,
      ).mul(foamAmount).toVar();
      const swashFoamValue = clamp(
        swashFoamRaw.mul(clamp(u.uSwashFoamAmount, 0.0, 2.0)),
        0.0,
        1.0,
      ).toVar();
      // The pre-session foam looked better because every source shared this
      // crisp solid-core + dissolve-fringe shaping. Shape stored swash foam
      // together with offshore/contact foam; never max an unshaped milky mask
      // over the final result.
      const foamRaw = max(baseFoamRaw, swashFoamValue).toVar();
      const foamValue = foam.foamShape(foamRaw, foamXZ, u.uTime).toVar();

      // Drifting cloud shadows plus scene shadows (shared sun-shadow pass).
      const proceduralCloudShadow = stylizedCloudShadow(
        vRestWorldXZ, u.uTime,
        u.uCloudShadowStrength, u.uCloudShadowCoverage, u.uCloudShadowScale, u.uCloudShadowVelocity,
      );
      const cloudShadow = sampleEnvironmentCloudShadow(
        vWorldPosition,
        proceduralCloudShadow,
      ).toVar();
      const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uSceneShadowStrength);
      const sunVisibility = cloudShadow.mul(sceneShadow).toVar();
      // Keep one caustic field across the offshore body and the running sheet.
      // The caustics chunk already fades from the sampled scene depth; applying
      // an additional swash-zone multiplier here exposed the implementation
      // handoff as a hard, visibly separate rendering system.
      bodyColor.addAssign(caustics.mul(foamValue.oneMinus()).mul(sunVisibility));

      // --- reflection, fresnel, glints ---
      const fresnel = lighting.fresnelFactor(viewDir, surfaceNormal).toVar();
      const reflection = lighting.reflectionColor(vWorldPosition, surfaceNormal, viewDir).toVar();
      // Thin swash still catches the sky at its lip, but the interior should
      // mostly reveal wet sand. Attenuate (rather than remove) its Fresnel,
      // reflection and glints while keeping offshore water unchanged.
      const swashLight = mix(1.0, 0.36, swashOptics).toVar();
      const surfaceFresnel = fresnel.mul(swashLight).toVar();
      const reflectionMix = clamp(
        surfaceFresnel.mul(u.uReflectionStrength), 0.0, 0.92,
      ).toVar();
      const litColor = mix(bodyColor, reflection, reflectionMix).toVar();
      litColor.addAssign(
        u.uFresnelColor.mul(surfaceFresnel).mul(surfaceFresnel).mul(0.35),
      );
      litColor.addAssign(
        lighting.specular(viewDir, surfaceNormal, foamValue.mul(0.75).oneMinus())
          .mul(sunVisibility).mul(swashLight),
      );
      if (flags.sparkles) {
        litColor.addAssign(
          lighting.sparkles(vRestWorldXZ, surfaceNormal, viewDir, viewDistance, u.uTime)
            .mul(foamValue.oneMinus()).mul(sunVisibility).mul(swashLight),
        );
      }
      // Keep cast shadows legible across a reflective anime surface. The
      // previous 6–20% value loss disappeared under the sky reflection and
      // made characters, trees, and rocks look ungrounded; this cool ramp
      // preserves the blue daytime bounce while clearly separating shadow.
      litColor.mulAssign(mix(vec3(0.34, 0.46, 0.72), vec3(1.0), sceneShadow));
      litColor.mulAssign(mix(vec3(0.8, 0.85, 0.94), vec3(1.0), cloudShadow));

      // --- foam overlay, slightly shaded by the sun for a two-tone toon read ---
      const foamLight = clamp(dot(surfaceNormal, u.uSunDirection), 0.0, 1.0).mul(0.18).add(0.82)
        .mul(sunVisibility.mul(0.18).add(0.82));
      // Preserve the original bright foam, with just enough shallow-water
      // shade at its porous fringe to show volume instead of flat white paint.
      const foamShade = mix(u.uShallowColor, u.uFoamColor, 0.8).toVar();
      const foamTint = mix(
        foamShade,
        u.uFoamColor.mul(foamLight),
        smoothstep(0.5, 0.82, foamRaw),
      ).toVar();
      // Foam is sky-lit and remains readable in shade, but it cannot remain a
      // pure-white post-lighting overlay. Consume the same shared cast-shadow
      // visibility as the water body so its white line cools and dims while
      // direct-sun sparkle disappears.
      foamTint.mulAssign(mix(
        vec3(0.44, 0.62, 0.76),
        vec3(1.0),
        sceneShadow,
      ));
      foamTint.mulAssign(mix(
        vec3(0.82, 0.88, 0.94),
        vec3(1.0),
        cloudShadow,
      ));
      litColor.assign(mix(litColor, foamTint, foamValue));
      alpha.assign(max(alpha, foamValue.mul(0.92)));
      // The swash film is only centimeters deep; give it body.
      alpha.assign(max(alpha, swashFoamValue.mul(0.55)));
      alpha.assign(max(
        alpha,
        clamp(reflectionMix.add(surfaceFresnel.mul(0.4)), 0.0, 1.0).mul(0.85),
      ));

      // Fog last: foam, sparkles, and shorelines haze out with the rest of
      // the world. Exponential term mirrors the environment height fog;
      // linear term mirrors scene.fog.
      If(u.uDistanceFogDensity.greaterThan(0.0), () => {
        const depthTerm = exp(viewDistance.mul(u.uDistanceFogDensity).negate()).oneMinus();
        litColor.assign(mix(litColor, u.uDistanceFogColor, clamp(depthTerm, 0.0, 1.0)));
      });
      If(u.uSceneFogFar.greaterThan(u.uSceneFogNear), () => {
        const fogAmount = clamp(
          viewDistance.sub(u.uSceneFogNear)
            .div(max(u.uSceneFogFar.sub(u.uSceneFogNear), 1e-3)),
          0.0,
          1.0,
        );
        litColor.assign(mix(litColor, u.uSceneFogColor, fogAmount));
      });
      If(u.uSceneFogDensity.greaterThan(0.0), () => {
        const fogExponent = u.uSceneFogDensity
          .mul(u.uSceneFogDensity)
          .mul(viewDistance)
          .mul(viewDistance);
        const fogAmount = clamp(exp(fogExponent.negate()).oneMinus(), 0.0, 1.0);
        litColor.assign(mix(litColor, u.uSceneFogColor, fogAmount));
      });

      // --- debug visualizations (?waterDebug=...) ---
      // Masked sum instead of an if/else chain (docs/tsl-conventions.md #3);
      // always compiled — every input already lives in the graph.
      const debugEntries = [
        [1, vec4(clamp(viewDepthDiff.div(3.0), 0.0, 1.0), clamp(columnDepth.div(3.0), 0.0, 1.0), absorb, 1.0)],
        [2, vec4(vec3(foamValue), 1.0)],
        [3, vec4(surfaceNormal.mul(0.5).add(0.5), 1.0)],
        [4, vec4(rippleState.r.mul(2.0).add(0.5), rippleState.b, float(0.5).sub(rippleState.r.mul(2.0)), 1.0)],
        [5, vec4(reflection, 1.0)],
        [6, vec4(caustics, 1.0)],
        [7, vec4(
          lighting.specular(viewDir, surfaceNormal, float(1.0))
            .add(lighting.sparkles(vRestWorldXZ, surfaceNormal, viewDir, viewDistance, u.uTime)),
          1.0,
        )],
        [8, vec4(vec3(fresnel), 1.0)],
        [9, vec4(crest, vCrest, whitecaps, 1.0)],
        [10, vec4(
          persistentShoreState.r,
          persistentShoreState.g,
          max(persistentShoreState.b, persistentShoreState.a),
          1.0,
        )],
      ];
      let debugMask = float(0.0);
      let debugSum = vec4(0.0);
      for (const [mode, value] of debugEntries) {
        const entryMask = select(u.uDebugMode.equal(mode), float(1.0), float(0.0));
        debugMask = debugMask.add(entryMask);
        debugSum = debugSum.add(value.mul(entryMask));
      }
      debugMask = debugMask.min(1.0);
      output.assign(vec4(litColor, alpha).mul(debugMask.oneMinus()).add(debugSum));
    });

    return output;
  })();

  material.uniforms = u;
  // The classic material's define block, mirrored so shared bookkeeping
  // (applyWaterSettingsToMaterial's quality diff, attachWaveUniforms' wave
  // count check) reads identically on both backends.
  material.defines = {
    WATER_WAVE_COUNT: waveCount,
    WATER_QUALITY: qualityLevel,
    WATER_DETAIL_OCTAVES: detailOctaves,
    WATER_FOAM_OCTAVES: foamOctaves,
    ...(flags.shoaling ? { WATER_SHOALING: 1 } : {}),
  };
  material.userData.isToonNodeMaterial = true;
  material.userData.waterFlags = flags;
  return material;
}
