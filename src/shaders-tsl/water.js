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
  positionGeometry,
  screenUV,
  select,
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
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';
import { waterCombineNormal, waterFbm, waterRotate2d } from './chunks/water-common.js';
import { createWaterColorChunk } from './chunks/water-color.js';
import { createWaterFoamChunk } from './chunks/water-foam.js';
import { createWaterLightingChunk } from './chunks/water-lighting.js';
import { createWaterRippleChunk } from './chunks/water-ripple.js';
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

    uShoalingDepth: uniform(1.4),
    uShorelineWaves: uniform(0.35),
    uShorelineRunup: uniform(0.6),
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
    uCausticsStrength: uniform(0.6),
    uCausticsScale: uniform(1),
    uCausticsSpeed: uniform(1),

    uFoamColor: uniform(new THREE.Color()),
    uFoamAmount: uniform(1),
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
  const vShoal = varying(float(), 'vWaterShoal');
  const vBreaker = varying(float(), 'vWaterBreaker');
  const vSwash = varying(float(), 'vWaterSwash');
  const vChop = varying(float(), 'vWaterChop');
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
    const swash = float(0.0).toVar();

    let rawWave;
    const waveDisplacement = vec3(0.0).toVar();
    if (flags.shoaling) {
      const aBedHeight = attribute('aBedHeight', 'float');
      const restDepth = worldPosition.y.sub(aBedHeight).toVar();
      vRestDepth.assign(restDepth);
      // Big swells feel the bottom much deeper than small ones.
      const shoalRange = max(max(u.uShoalingDepth, u.uWaveEnergy.mul(2.2)), 1e-3).toVar();
      chopWeight.assign(mix(0.15, 1.0, smoothstep(shoalRange.mul(0.3), shoalRange.mul(1.4), restDepth)));

      rawWave = waves.gerstnerDisplacementFiltered(restXZ, u.uTime, chopWeight).toVar();

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
      breakFoam.assign(clamp(capExcess.mul(0.9).div(max(u.uWaveEnergy.mul(0.3), 1e-3)), 0.0, 1.0));

      const wavePhase = clamp(rawWave.y.div(max(u.uWaveEnergy, 1e-3)), -1.0, 1.0).toVar();
      const runup = u.uShorelineRunup.mul(u.uWaveEnergy).mul(max(wavePhase, 0.0));
      // Dry land tucks the film 20cm under the terrain.
      const film = clamp(restDepth.add(runup), -0.2, 0.05).toVar();
      // Cap the drape: the film follows the bed up the beach, but a steep
      // bank (terraced shore, cliff base) puts a whole cliff step inside one
      // mesh cell — the dry vertex would ride 10m+ up the slope and drag
      // surviving near-shore fragments with it (giant white "iceberg"
      // wedges at distant shorelines). Real swash never climbs above ~½m
      // over the rest waterline, so clamp the geometry there and let the
      // vRestDepth fragment discard own the rest.
      const filmY = min(aBedHeight.sub(worldPosition.y).add(film), 0.5);
      const beach = smoothstep(-0.02, 0.06, restDepth).oneMinus().toVar();

      rippleShoal.assign(smoothstep(0.0, 0.12, restDepth));
      swash.assign(beach.mul(smoothstep(0.004, 0.02, film)).mul(wavePhase.mul(0.45).add(0.55)));
      shoal.mulAssign(beach.oneMinus());
      waveDisplacement.assign(vec3(
        rawWave.x.mul(shoal),
        mix(brokenY, filmY, beach),
        rawWave.z.mul(shoal),
      ));
    } else {
      vRestDepth.assign(float(1000.0));
      rawWave = waves.gerstnerDisplacementFiltered(restXZ, u.uTime, chopWeight).toVar();
      waveDisplacement.assign(rawWave);
    }

    const rippleState = ripple.rippleSample(restXZ);
    const rippleHeight = rippleState.r.mul(u.uRippleHeightScale).mul(rippleShoal).toVar();

    worldPosition.xyz.addAssign(waveDisplacement);
    worldPosition.y.addAssign(rippleHeight);

    const { crest } = waves.gerstnerNormalFiltered(restXZ, u.uTime, chopWeight);
    vCrest.assign(crest.mul(clamp(shoal, 0.0, 1.0)));
    vChop.assign(chopWeight);
    vShoal.assign(shoal);
    vBreaker.assign(breakFoam);
    vSwash.assign(swash);
    vWorldPosition.assign(worldPosition.xyz);

    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(worldPosition.xyz, 1.0));
  })();

  // ---- Fragment stage (water.frag.glsl) ----
  material.fragmentNode = Fn(() => {
    // Surface sections tucked under dry land (see vRestDepth) never shade:
    // without this, water triangles spanning steep banks slice through the
    // terrain as visible shards.
    if (flags.shoaling) {
      Discard(vRestDepth.lessThan(-0.35));
    }
    const screenUv = screenUV.toVar();
    const toCamera = cameraPosition.sub(vWorldPosition).toVar();
    const viewDir = normalize(toCamera).toVar();
    const viewDistance = length(toCamera).toVar();

    // --- surface normal: Gerstner (analytic, per-pixel) + fbm detail + ripples ---
    const gerstner = waves.gerstnerNormalFiltered(vRestWorldXZ, u.uTime, vChop);
    const gerstnerNormal = vec3(gerstner.normal).toVar();
    const crest = float(gerstner.crest).toVar();
    const shoalBlend = clamp(vShoal, 0.0, 1.0).toVar();
    gerstnerNormal.assign(normalize(mix(vec3(0.0, 1.0, 0.0), gerstnerNormal, shoalBlend)));
    crest.assign(clamp(crest.mul(shoalBlend).add(vBreaker.mul(crest.mul(0.55).add(0.45))), 0.0, 1.0));
    const gerstnerNormalY = gerstnerNormal.y.toVar();

    const detailFade = smoothstep(16.0, 60.0, viewDistance).oneMinus();
    const detailStrength = u.uDetailNormalStrength.mul(mix(0.2, 1.0, detailFade)).toVar();
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
      // A stylized Snell-window: bright sky punches through overhead, the
      // surface darkens to the deep tint toward grazing angles.
      const throughDir = normalize(
        viewDir.negate().add(vec3(surfaceNormal.x, 0.0, surfaceNormal.z).mul(0.7)),
      ).toVar();
      const skyThrough = lighting.proceduralSky(throughDir);
      const window = smoothstep(0.15, 0.8, throughDir.y).toVar();
      const underColor = mix(u.uDeepColor.mul(0.55), skyThrough.mul(1.15), window).toVar();
      underColor.addAssign(
        lighting.sparkles(vRestWorldXZ, surfaceNormal, viewDir, viewDistance, u.uTime).mul(0.5),
      );
      output.assign(vec4(underColor, mix(0.95, 0.62, window)));
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

      // Steep wave faces act like windows, not lenses: drop caustics there,
      // and fade the dappling with view distance (WATER_QUALITY >= 1).
      const caustics = flags.caustics
        ? color.caustics(groundWorld, columnDepth, u.uTime)
          .mul(smoothstep(0.62, 0.85, gerstnerNormalY))
          .mul(smoothstep(14.0, 38.0, viewDistance).oneMinus())
          .toVar()
        : vec3(0.0);

      // --- foam ---
      const pierce = color.pierceProximity(screenUv, waterViewDistance, vWorldPosition.y).toVar();
      const shoreFoam = foam.shoreFoam(columnDepth, viewDepthDiff, vRestWorldXZ, u.uTime, pierce).toVar();
      const whitecaps = foam.whitecaps(crest, gerstnerNormalY, vRestWorldXZ, u.uTime).toVar();
      const rippleFoamRaw = clamp(
        rippleState.b.mul(u.uRippleFoamStrength).add(abs(rippleState.r).mul(u.uRippleFoamStrength).mul(4.0)),
        0.0,
        1.0,
      );
      const foamRaw = clamp(shoreFoam.add(whitecaps).add(rippleFoamRaw).add(vSwash), 0.0, 1.0)
        .mul(clamp(u.uFoamAmount, 0.0, 2.0));
      const foamValue = foam.foamShape(foamRaw, vRestWorldXZ, u.uTime).toVar();

      // Drifting cloud shadows plus scene shadows (shared sun-shadow pass).
      const cloudShadow = stylizedCloudShadow(
        vRestWorldXZ, u.uTime,
        u.uCloudShadowStrength, u.uCloudShadowCoverage, u.uCloudShadowScale, u.uCloudShadowVelocity,
      );
      const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uSceneShadowStrength);
      const sunVisibility = cloudShadow.mul(sceneShadow).toVar();
      bodyColor.addAssign(caustics.mul(foamValue.oneMinus()).mul(sunVisibility));

      // --- reflection, fresnel, glints ---
      const fresnel = lighting.fresnelFactor(viewDir, surfaceNormal).toVar();
      const reflection = lighting.reflectionColor(vWorldPosition, surfaceNormal, viewDir).toVar();
      const reflectionMix = clamp(fresnel.mul(u.uReflectionStrength), 0.0, 0.92).toVar();
      const litColor = mix(bodyColor, reflection, reflectionMix).toVar();
      litColor.addAssign(u.uFresnelColor.mul(fresnel).mul(fresnel).mul(0.35));
      litColor.addAssign(lighting.specular(viewDir, surfaceNormal, foamValue.mul(0.75).oneMinus()).mul(sunVisibility));
      if (flags.sparkles) {
        litColor.addAssign(
          lighting.sparkles(vRestWorldXZ, surfaceNormal, viewDir, viewDistance, u.uTime)
            .mul(foamValue.oneMinus()).mul(sunVisibility),
        );
      }
      litColor.mulAssign(mix(vec3(0.8, 0.85, 0.94), vec3(1.0), sunVisibility));

      // --- foam overlay, slightly shaded by the sun for a two-tone toon read ---
      const foamLight = clamp(dot(surfaceNormal, u.uSunDirection), 0.0, 1.0).mul(0.18).add(0.82)
        .mul(sunVisibility.mul(0.18).add(0.82));
      litColor.assign(mix(litColor, u.uFoamColor.mul(foamLight), foamValue));
      alpha.assign(max(alpha, foamValue.mul(0.92)));
      // The swash film is only centimeters deep; give it body.
      alpha.assign(max(alpha, vSwash.mul(0.55)));
      alpha.assign(max(alpha, clamp(reflectionMix.add(fresnel.mul(0.4)), 0.0, 1.0).mul(0.85)));

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
