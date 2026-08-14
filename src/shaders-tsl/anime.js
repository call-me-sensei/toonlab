// TSL port of src/shaders/anime.vert.glsl + anime.frag.glsl — the toon
// character material. Consumed by toonMaterialAdapter's createAnimeMaterial on
// the TSL backend; receives the same resolved settings objects the GLSL
// ShaderMaterial uniform block is built from, and exposes `.uniforms` under
// the exact GLSL uniform names so every adapter/HUD write-through works
// unchanged on both backends.
//
// Porting notes (docs/tsl-conventions.md):
// - Optional samplers are gated by the same conditions as the GLSL defines
//   (JS guards instead of #ifdef) so unused textures never enter the graph.
// - Runtime feature toggles stay uniform-driven branches, exactly like GLSL.
// - Scene lights come from chunks/character-scene-lights.js (shared uniforms
//   mirrored from the scene each frame) instead of <lights_pars_begin>.
// - getShadowMask() (scene shadow maps on the character) is a Phase 3 item;
//   until then sceneShadowVisibility falls back to 1.0 exactly like a scene
//   with no shadow-casting lights.
// - Render-target-fed textures sample at explicit level 0 (WGSL forbids
//   implicit-derivative sampling in non-uniform control flow).

import * as THREE from 'three';
import {
  abs,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  Discard,
  dot,
  float,
  floor,
  Fn,
  frontFacing,
  If,
  int,
  length,
  mat3,
  max,
  min,
  mix,
  mod,
  normalize,
  normalLocal,
  normalView,
  pow,
  screenCoordinate,
  select,
  smoothstep,
  texture,
  transformNormalToView,
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
import { attribute, positionLocal, positionWorld, modelWorldMatrix } from 'three/tsl';

import { DEFAULT_FUR_SETTINGS } from '../toon/settings/furSettings.js';
import { maxColorComponent } from './chunks/character-color.js';
import { sampleEnvironmentSunShadowWithNormal } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import { updateToonStorageSkinning, withToonStorageSkinning } from './chunks/character-skinning.js';

export { updateToonStorageSkinning, withToonStorageSkinning };

// three r185's built-in SkinningNode keeps bone matrices in a uniform buffer,
// which exceeds GL_MAX_UNIFORM_BLOCK_SIZE for MMD-scale skeletons (>256
// bones) on the forced-WebGL2 backend. The mixin reroutes skinning to a
// storage/PBO path there; WebGPU keeps the built-in buffer path.
const ToonAnimeNodeMaterial = withToonStorageSkinning(NodeMaterial);
import { createHighlightsChunk } from './chunks/character-highlights.js';
import { createLightingChunk } from './chunks/character-lighting.js';
import { createMaterialMapChunk } from './chunks/character-material-maps.js';
import { createRolesChunk } from './chunks/character-roles.js';
import {
  createLocalLightEvaluators,
  getMainLightDirection,
  getMainLightColor,
  syncToonSceneLights,
  toonSceneLights,
} from './chunks/character-scene-lights.js';
import { createShadowColorChunk } from './chunks/character-shadow-color.js';

export { syncToonSceneLights, toonSceneLights };

const fallbackWhiteTexture = /* created lazily */ (() => {
  let tex = null;
  return () => {
    if (!tex) {
      const data = new Uint8Array([255, 255, 255, 255]);
      tex = new THREE.DataTexture(data, 1, 1);
      tex.needsUpdate = true;
    }
    return tex;
  };
})();

function boolUniform(value) {
  return uniform(Boolean(value), 'bool');
}

function intUniform(value) {
  return uniform(Math.trunc(value ?? 0), 'int');
}

// 4x4 Bayer threshold, closed form of the GLSL table:
// t = (4*M2[x&1][y&1] + M2[(x>>1)&1][(y>>1)&1] + 1) / 17, M2 = [[0,2],[3,1]].
function bayerThreshold(pixel) {
  const m2 = (a, b) => select(a.equal(0.0), select(b.equal(0.0), float(0.0), float(2.0)), select(b.equal(0.0), float(3.0), float(1.0)));
  const fx = mod(pixel.x, 4.0);
  const fy = mod(pixel.y, 4.0);
  const x1 = mod(fx, 2.0);
  const y1 = mod(fy, 2.0);
  const x2 = mod(floor(fx.div(2.0)), 2.0);
  const y2 = mod(floor(fy.div(2.0)), 2.0);
  return m2(x1, y1).mul(4.0).add(m2(x2, y2)).add(1.0).div(17.0);
}

export function createAnimeNodeMaterial(params) {
  const {
    alphaBlend = false,
    alphaTest = -1.0,
    averageShadow,
    averageShadowSettings,
    base = null,
    baseColor = new THREE.Color(1, 1, 1),
    baseMapSaturation = 1,
    celShadeSettings,
    contactShadow,
    debugOutputMode = 0,
    depthWrite = null,
    eyeHighlight,
    faceHeadSpaceModeValue = 1,
    faceLightingSettings,
    glitter,
    hairHighlight,
    indirectLight,
    indirectLightSettings,
    isEye = false,
    isFace = false,
    isFurShell = false,
    isHair = false,
    isOutline = false,
    isSkin = false,
    localLight,
    materialRole = 0,
    opacity = 1,
    outline,
    perspectiveRemovalSettings,
    resolvedMaterialMaps,
    rimLight,
    sceneShadow,
    sceneShadowSettings,
    selfShadow,
    selfShadowSettings,
    shadowColorSettings,
    side = THREE.DoubleSide,
    skinToneSettings,
    sourceBaseColor = new THREE.Color(1, 1, 1),
    specular,
    sticker,
    transparent = false,
  } = params;

  const maps = resolvedMaterialMaps;

  // Compile-time graph shape — mirrors the GLSL defines, except hasDebugViews:
  // the debug select-chain always compiles in (it adds no bindings — all its
  // inputs are already in the graph) so setToonDebugOutput stays a pure
  // uniform write on this backend instead of a define flip + recompile.
  const flags = {
    hasAoMap: Boolean(maps.hasAoMap),
    hasDebugViews: true,
    hasDetailMap: Boolean(maps.hasDetailMap),
    hasEmissiveMap: Boolean(maps.hasEmissiveMap),
    hasEyeHighlightMask: Boolean(eyeHighlight.maskMap),
    hasGlitter: Boolean(glitter.enabled),
    hasHairHighlightMask: Boolean(hairHighlight.maskMap),
    hasMatcapMap: Boolean(maps.hasMatcapMap),
    hasMetalnessMap: Boolean(maps.hasMetalnessMap),
    hasNormalMap: Boolean(maps.hasNormalMap),
    hasRampMap: Boolean(maps.hasRampMap),
    hasRoughnessMap: Boolean(maps.hasRoughnessMap),
    hasSpecularColorMap: Boolean(maps.hasSpecularColorMap),
    hasSpecularMask: Boolean(specular.maskMap),
    hasSticker: Boolean(sticker.enabled),
    isFurShell: Boolean(isFurShell),
    isOutlinePass: Boolean(isOutline),
    useAverageShadowMeasure: (averageShadowSettings.measuredBlend ?? 0) > 0,
  };

  // ---- Uniforms (GLSL names; UniformNodes expose `.value` like
  //      ShaderMaterial uniform entries) ----
  const u = {
    base: texture(base || fallbackWhiteTexture()),
    gCutoff: uniform(-1.0),
    aCutoff: uniform(alphaTest),
    alphaBlend: boolUniform(alphaBlend),

    baseColor: uniform(new THREE.Vector4(baseColor.r, baseColor.g, baseColor.b, opacity)),
    sourceBaseColor: uniform(new THREE.Vector4(sourceBaseColor.r, sourceBaseColor.g, sourceBaseColor.b, opacity)),
    baseColor2: uniform(new THREE.Vector4(1, 1, 1, 1)),
    baseMapBrightness: uniform(1.0),
    baseMapHue: uniform(0.0),
    baseMapSaturation: uniform(baseMapSaturation),
    baseMapValue: uniform(1.0),
    baseMapGamma: uniform(1.0),

    isOutline: boolUniform(isOutline),
    isSkin: boolUniform(isSkin),
    isFace: boolUniform(isFace),
    isEye: boolUniform(isEye),
    isHair: boolUniform(isHair),
    materialRole: intUniform(materialRole),
    debugOutputMode: intUniform(debugOutputMode),

    enableShadowColor: boolUniform(shadowColorSettings.enabled),
    celShadeMidPoint: uniform(celShadeSettings.bodyCelMidPoint),
    celShadeSoftness: uniform(celShadeSettings.bodyCelSoftness),
    celShadeMidPointForFaceArea: uniform(faceLightingSettings.faceCelMidPoint),
    celShadeSoftnessForFaceArea: uniform(faceLightingSettings.faceCelSoftness),
    mainLightIgnoreCelShade: uniform(celShadeSettings.bodyMainLightIgnoreCelShade),
    mainLightIgnoreCelShadeForFaceArea: uniform(faceLightingSettings.faceMainLightIgnoreCelShade),
    faceSceneShadowStrength: uniform(faceLightingSettings.faceSceneShadowStrength),
    faceLocalLightLift: uniform(faceLightingSettings.faceLocalLightLift),
    faceNormalProxyBlend: uniform(faceLightingSettings.faceNormalProxyBlend),
    faceProxyNormalObject: uniform(new THREE.Vector3(...faceLightingSettings.faceProxyNormal).normalize()),

    selfShadowTintColor: uniform(shadowColorSettings.selfShadowTintColor.clone?.() ?? new THREE.Color(shadowColorSettings.selfShadowTintColor)),
    selfShadowAreaHSVStrength: uniform(shadowColorSettings.selfShadowAreaHSVStrength),
    selfShadowAreaHueOffset: uniform(shadowColorSettings.selfShadowAreaHueOffset),
    selfShadowAreaSaturationBoost: uniform(shadowColorSettings.selfShadowAreaSaturationBoost),
    selfShadowAreaValueMul: uniform(shadowColorSettings.selfShadowAreaValueMul),
    selfShadowAlbedoMulStrength: uniform(shadowColorSettings.selfShadowAlbedoMulStrength),

    litToShadowTransitionAreaIntensity: uniform(shadowColorSettings.transitionAreaIntensity),
    litToShadowTransitionAreaTintColor: uniform(shadowColorSettings.transitionAreaTintColor.clone?.() ?? new THREE.Color(shadowColorSettings.transitionAreaTintColor)),
    litToShadowTransitionAreaHueOffset: uniform(shadowColorSettings.transitionAreaHueOffset),
    litToShadowTransitionAreaSaturationBoost: uniform(shadowColorSettings.transitionAreaSaturationBoost),
    litToShadowTransitionAreaValueMul: uniform(shadowColorSettings.transitionAreaValueMul),

    overrideBySkinShadowTintColor: uniform(skinToneSettings.skinShadowTintStrength),
    skinShadowTintColor: uniform(skinToneSettings.skinShadowTint.clone?.() ?? new THREE.Color(skinToneSettings.skinShadowTint)),
    skinShadowBrightness: uniform(skinToneSettings.skinShadowBrightness),
    skinShadowSaturation: uniform(skinToneSettings.skinShadowSaturation),
    skinShadowTintColor2: uniform(new THREE.Color(1, 1, 1)),
    overrideByFaceShadowTintColor: uniform(skinToneSettings.faceShadowTintStrength),
    faceShadowTintColor: uniform(skinToneSettings.faceShadowTint.clone?.() ?? new THREE.Color(skinToneSettings.faceShadowTint)),
    faceShadowBrightness: uniform(skinToneSettings.faceShadowBrightness),
    faceShadowSaturation: uniform(skinToneSettings.faceShadowSaturation),
    faceShadowTintColor2: uniform(new THREE.Color(1, 1, 1)),
    lowSaturationFallbackColor: uniform(
      shadowColorSettings.lowSaturationFallbackColor.clone?.() ??
      new THREE.Vector4().copy(shadowColorSettings.lowSaturationFallbackColor),
    ),

    ambientTint: uniform(indirectLightSettings.ambientTint.clone()),
    indirectLightIntensity: uniform(indirectLight.intensity),
    minimumIndirectLight: uniform(indirectLight.minimumIndirectLight),
    mainLightMaxContribution: uniform(1.08),
    skinMinimumIndirectLight: uniform(skinToneSettings.skinMinimumIndirectLight),
    faceMinimumIndirectLight: uniform(skinToneSettings.faceMinimumIndirectLight),
    skinMaxDirectLight: uniform(skinToneSettings.skinMaxDirectLight),
    faceMaxDirectLight: uniform(skinToneSettings.faceMaxDirectLight),
    receivedShadowStrength: uniform(sceneShadow.strength),
    receivedShadowMinLight: uniform(sceneShadow.minLight),
    receivedShadowAreaStrength: uniform(sceneShadowSettings.shadowAreaStrength),
    averageShadowStrength: uniform(averageShadow.strength),
    averageShadowMinLight: uniform(averageShadow.minLight),
    averageShadowSoftness: uniform(averageShadowSettings.softness),
    selfShadowSourceMode: intUniform(selfShadowSettings.sourceMode),
    selfShadowStrength: uniform(selfShadow.strength),
    selfShadowMinLight: uniform(selfShadow.minLight),
    selfShadowAreaStrength: uniform(selfShadowSettings.shadowAreaStrength),
    environmentIndirectLight: uniform(indirectLightSettings.environmentIndirectLight),
    localLightIntensity: uniform(localLight.intensity),
    localLightMaxContribution: uniform(localLight.maxContribution),
    localLightShadowLift: uniform(localLight.shadowLift),
    hemisphereLightIntensity: uniform(indirectLightSettings.hemisphereLightIntensity),

    useSpecular: boolUniform(specular.enabled),
    specularIntensity: uniform(specular.intensity),
    specularColor: uniform(specular.color.clone()),
    specularAreaRemapMidPoint: uniform(specular.midPoint),
    specularAreaRemapRange: uniform(specular.range),
    specularPower: uniform(specular.power),
    specularShowInShadowArea: uniform(specular.showInShadowArea),
    useSpecularMask: boolUniform(specular.useMask),
    specularMaskStrength: uniform(specular.maskStrength),
    specularMaskChannel: intUniform(specular.maskChannel),

    useRimLight: boolUniform(rimLight.enabled),
    rimTintColor: uniform(rimLight.tintColor.clone()),
    rimIntensity: uniform(rimLight.intensity),
    rimMidPoint: uniform(rimLight.midPoint),
    rimSoftness: uniform(rimLight.softness),
    rimMixWithBaseMapColor: uniform(rimLight.mixWithBaseMapColor),
    rimBlockByShadow: uniform(rimLight.blockByShadow),
    rimLightMode: intUniform(rimLight.modeValue),
    rimDepthWidth: uniform(rimLight.depthWidth),
    rimDepthThresholdOffset: uniform(rimLight.depthThresholdOffset),
    rimDepthFadeRange: uniform(rimLight.depthFadeRange),
    rimDepthSafeDistance: uniform(rimLight.depthSafeDistance),
    rimDepthCloseWidthReduce: uniform(rimLight.depthCloseWidthReduce),
    rimDepthDottedLineFix: boolUniform(rimLight.depthDottedLineFix),
    rimDepthMask3D: boolUniform(rimLight.depthMask3D),
    rimDepthFadeStartDistance: uniform(rimLight.depthFadeStartDistance),
    rimDepthFadeEndDistance: uniform(rimLight.depthFadeEndDistance),

    sceneDepthReady: boolUniform(false),
    sceneDepthTexture: texture(fallbackWhiteTexture()),
    sceneDepthResolution: uniform(new THREE.Vector2(1, 1)),
    cameraNearPlane: uniform(0.1),
    cameraFarPlane: uniform(100),
    cameraProjection11: uniform(2.75),

    contactShadowStrength: uniform(contactShadow.strength),
    contactShadowWidth: uniform(contactShadow.width),
    contactShadowThresholdOffset: uniform(contactShadow.thresholdOffset),
    contactShadowFadeRange: uniform(contactShadow.fadeRange),
    contactShadowFaceHeadUpBlend: uniform(contactShadow.faceHeadUpBlend),

    charSelfShadowReady: boolUniform(false),
    charSelfShadowMap: texture(fallbackWhiteTexture()),
    charSelfShadowMatrix: uniform(new THREE.Matrix4()),
    charSelfShadowLightDirection: uniform(new THREE.Vector3(0, 1, 0)),
    charSelfShadowTexelSize: uniform(1 / 2048),
    charSelfShadowQuality: uniform(2),
    charSelfShadowSharpen: uniform(0.25),
    charSelfShadowNormalBias: uniform(0.02),
    charSelfShadowDepthBias: uniform(0.02),
    charSelfShadowFadeDistance: uniform(20),
    charSelfShadowNdotLFix: boolUniform(true),

    headDataReady: boolUniform(false),
    headPositionWS: uniform(new THREE.Vector3()),
    headForwardWS: uniform(new THREE.Vector3(0, 0, 1)),
    headUpWS: uniform(new THREE.Vector3(0, 1, 0)),
    faceHeadSpaceMode: intUniform(faceHeadSpaceModeValue),
    faceSphereBlend: uniform(faceLightingSettings.faceSphereBlend),

    averageShadowMeasureReady: boolUniform(false),
    averageShadowMeasureTexture: texture(fallbackWhiteTexture()),
    averageShadowMeasureSlot: uniform(0.5),
    averageShadowMeasuredBlend: uniform(averageShadowSettings.measuredBlend ?? 0),

    ditherOpacity: uniform(1),
    edgeAntiAliasStrength: uniform(celShadeSettings.edgeAntiAliasStrength ?? 1),
    specularDirectionMode: intUniform(specular.directionModeValue ?? 0),

    useGlitter: boolUniform(glitter.enabled),
    glitterIntensity: uniform(glitter.intensity),
    glitterDensity: uniform(glitter.density),
    glitterSize: uniform(glitter.size),
    glitterRandomNormalStrength: uniform(glitter.randomNormalStrength),
    glitterShowInShadowArea: uniform(glitter.showInShadowArea),
    glitterUvChannel: intUniform(glitter.uvChannel),

    useSticker: boolUniform(sticker.enabled),
    stickerBlendMode: intUniform(sticker.blendModeValue),
    stickerStrength: uniform(sticker.strength),
    stickerRepeat: uniform(new THREE.Vector2(...sticker.repeat)),
    stickerOffset: uniform(new THREE.Vector2(...sticker.offset)),
    stickerUvChannel: intUniform(sticker.uvChannel),

    perspectiveRemovalAmount: uniform(perspectiveRemovalSettings.amount ?? 0),
    perspectiveRemovalRadius: uniform(perspectiveRemovalSettings.radius ?? 1.4),
    perspectiveRemovalStartHeight: uniform(perspectiveRemovalSettings.startHeight ?? 0),
    perspectiveRemovalEndHeight: uniform(perspectiveRemovalSettings.endHeight ?? 1),

    // Fur uniforms live on every material so fur shell clones can vary
    // furLayer per shell (same as the GLSL uniform block).
    furLayer: uniform(1),
    furLength: uniform(DEFAULT_FUR_SETTINGS.length),
    furGravity: uniform(DEFAULT_FUR_SETTINGS.gravity),
    furDensity: uniform(DEFAULT_FUR_SETTINGS.density),
    furRootOffset: uniform(DEFAULT_FUR_SETTINGS.rootOffset),
    furRootShade: uniform(DEFAULT_FUR_SETTINGS.rootShade),

    useHairHighlight: boolUniform(hairHighlight.enabled),
    hairHighlightDirection: uniform(new THREE.Vector3(...hairHighlight.direction)),
    hairHighlightIntensity: uniform(hairHighlight.intensity),
    hairHighlightMaskChannel: intUniform(hairHighlight.maskChannel),
    hairHighlightMaskStrength: uniform(hairHighlight.maskStrength),
    hairHighlightMode: intUniform(hairHighlight.modeValue),
    hairHighlightShadowFloor: uniform(hairHighlight.shadowFloor),
    hairHighlightSideBandPower: uniform(hairHighlight.sideBandPower),
    hairHighlightStrandPower: uniform(hairHighlight.strandPower),
    hairHighlightUvBandAxis: intUniform(hairHighlight.uvBandAxis),
    hairHighlightUvBandCenter: uniform(hairHighlight.uvBandCenter),
    hairHighlightUvBandHalfWidth: uniform(hairHighlight.uvBandHalfWidth),
    useHairHighlightMask: boolUniform(hairHighlight.useMask),
    useEyeHighlight: boolUniform(eyeHighlight.enabled),
    useEyeHighlightMask: boolUniform(eyeHighlight.useMask),
    eyeHighlightColor: uniform(eyeHighlight.color.clone()),
    eyeHighlightIntensity: uniform(eyeHighlight.intensity),
    eyeHighlightMaskChannel: intUniform(eyeHighlight.maskChannel),
    eyeHighlightMaskStrength: uniform(eyeHighlight.maskStrength),
    eyeHighlightPower: uniform(eyeHighlight.power),
    eyeHighlightShowInShadowArea: uniform(eyeHighlight.showInShadowArea),

    hasMaterialNormalMap: boolUniform(maps.hasNormalMap),
    useMaterialNormalMap: boolUniform(maps.hasNormalMap && maps.normalStrength > 0),
    materialNormalScale: uniform(maps.normalScale),
    materialNormalStrength: uniform(maps.normalStrength),
    hasMaterialAoMap: boolUniform(maps.hasAoMap),
    materialAoStrength: uniform(maps.aoStrength),
    hasMaterialDetailMap: boolUniform(maps.hasDetailMap),
    materialDetailRepeat: uniform(maps.detailRepeat),
    materialDetailStrength: uniform(maps.detailStrength),
    hasMaterialEmissiveMap: boolUniform(maps.hasEmissiveMap),
    materialEmissiveColor: uniform(maps.emissiveColor),
    materialEmissiveStrength: uniform(maps.emissiveStrength),
    hasMaterialMatcapMap: boolUniform(maps.hasMatcapMap),
    materialMatcapStrength: uniform(maps.matcapStrength),
    hasMaterialMetalnessMap: boolUniform(maps.hasMetalnessMap),
    materialMetalness: uniform(maps.metalness),
    materialMetalnessStrength: uniform(maps.metalnessStrength),
    hasMaterialRampMap: boolUniform(maps.hasRampMap),
    materialRampStrength: uniform(maps.rampStrength),
    hasMaterialRoughnessMap: boolUniform(maps.hasRoughnessMap),
    materialRoughness: uniform(maps.roughness),
    materialRoughnessStrength: uniform(maps.roughnessStrength),
    hasMaterialSpecularColorMap: boolUniform(maps.hasSpecularColorMap),
    materialSpecularColorStrength: uniform(maps.specularColorStrength),

    outlineTintColor: uniform(outline.tintColor.clone()),
    outlineTintColorSkinAreaOverride: uniform(outline.skinTintColor.clone()),
    outlineSkinAreaOverrideStrength: uniform(outline.skinTintStrength),
    outlineLightingMix: uniform(outline.lightingMix),
    outlineMinBrightness: uniform(outline.minBrightness),
    outlineMaxBrightness: uniform(outline.maxBrightness),

    outlineDepthOffset: uniform(outline.depthOffset),
    outlineThickness: uniform(outline.width),
    outlineScreenSpaceFix: uniform(outline.screenSpaceWidth ?? 0),
    outlineReferenceDistance: uniform(outline.referenceDistance ?? 4),
    outlineReferenceProjection11: uniform(1 / Math.tan(THREE.MathUtils.degToRad((outline.referenceFov ?? 40) / 2))),
    outlineWidthFadeDistance: uniform(outline.widthFadeDistance ?? 12),
  };

  // Optional-map texture nodes (only created when the map exists — the
  // GLSL-define analog). Also registered in `u` so uniform-name `.value`
  // writes keep working for texture swaps.
  const tex = { sceneDepthTexture: u.sceneDepthTexture, charSelfShadowMap: u.charSelfShadowMap, averageShadowMeasureTexture: u.averageShadowMeasureTexture };
  const registerMap = (name, map) => {
    const node = texture(map);
    u[name] = node;
    tex[name] = node;
  };
  if (flags.hasSpecularMask) registerMap('specularMaskMap', specular.maskMap);
  if (flags.hasHairHighlightMask) registerMap('hairHighlightMaskMap', hairHighlight.maskMap);
  if (flags.hasEyeHighlightMask) registerMap('eyeHighlightMaskMap', eyeHighlight.maskMap);
  if (flags.hasNormalMap) registerMap('materialNormalMap', maps.normalMap);
  if (flags.hasAoMap) registerMap('materialAoMap', maps.aoMap);
  if (flags.hasDetailMap) registerMap('materialDetailMap', maps.detailMap);
  if (flags.hasEmissiveMap) registerMap('materialEmissiveMap', maps.emissiveMap);
  if (flags.hasMatcapMap) registerMap('materialMatcapMap', maps.matcapMap);
  if (flags.hasMetalnessMap) registerMap('materialMetalnessMap', maps.metalnessMap);
  if (flags.hasRampMap) registerMap('materialRampMap', maps.rampMap);
  if (flags.hasRoughnessMap) registerMap('materialRoughnessMap', maps.roughnessMap);
  if (flags.hasSpecularColorMap) registerMap('materialSpecularColorMap', maps.specularColorMap);
  if (flags.hasSticker) registerMap('stickerMap', sticker.map);

  const material = new ToonAnimeNodeMaterial();
  material.name = 'ToonAnimeNode';
  material.lights = false;
  material.fog = false;
  material.side = isOutline ? THREE.BackSide : side;
  material.transparent = alphaBlend || transparent || opacity < 1;
  material.alphaTest = 0; // alpha cutout is in-graph (aCutoff), like the GLSL
  material.depthWrite = depthWrite ?? (!alphaBlend && !transparent);
  if (isOutline) {
    material.depthTest = outline.depthTest;
    material.depthWrite = outline.depthWrite;
    material.polygonOffset = outline.polygonOffset;
    material.polygonOffsetFactor = outline.polygonOffsetFactor;
    material.polygonOffsetUnits = outline.polygonOffsetUnits;
  }

  // ---- Vertex stage ----
  // positionWorld/normalLocal reflect skinning + morphs (NodeMaterial runs
  // setupPosition before vertexNode is evaluated). Varyings are declared up
  // front and assigned imperatively inside the single vertexNode Fn — the
  // GLSL builder cannot stack VarNodes reached only through varying inputs.
  const vWorldPosition = varying(vec3(), 'vToonWorldPosition');
  const vWorldNormal = varying(vec3(), 'vToonWorldNormal');
  const vFaceProxyNormal = varying(vec3(), 'vToonFaceProxyNormal');
  const vViewPos = varying(vec4(), 'vToonViewPos');
  const vViewDir = varying(vec3(), 'vToonViewDir');

  material.vertexNode = Fn(() => {
    const worldNormal = normalize(mat3(modelWorldMatrix).mul(normalLocal)).toVar();
    const worldPos = positionWorld.toVar();
    if (flags.isFurShell) {
      // Shell fur: push outward along the (skinned) world normal; gravity
      // sags the direction toward world-down more at the tip.
      const furDirection = vec3(
        worldNormal.x,
        worldNormal.y.sub(u.furGravity.mul(u.furLayer)),
        worldNormal.z,
      );
      worldPos.addAssign(normalize(furDirection).mul(u.furLength).mul(u.furLayer));
    }
    vWorldPosition.assign(worldPos);
    vWorldNormal.assign(worldNormal);
    vFaceProxyNormal.assign(transformNormalToView(u.faceProxyNormalObject));

    const viewPos = cameraViewMatrix.mul(vec4(worldPos, 1.0)).toVar();
    if (flags.isOutlinePass) {
      // Screen-space width correction (see anime.vert.glsl for rationale).
      const p11 = cameraProjectionMatrix.element(1).y;
      const orthographic = cameraProjectionMatrix.element(3).w.equal(1.0);
      const viewDistance = select(
        orthographic,
        float(2.0).div(max(abs(p11), 1e-4)),
        abs(viewPos.z),
      );
      const distanceFix = min(viewDistance, u.outlineWidthFadeDistance).div(max(u.outlineReferenceDistance, 1e-4));
      const fovFix = select(orthographic, float(1.0), u.outlineReferenceProjection11.div(max(abs(p11), 1e-4)));
      const widthFix = select(
        u.outlineScreenSpaceFix.greaterThan(0.0),
        mix(1.0, distanceFix.mul(fovFix), u.outlineScreenSpaceFix),
        float(1.0),
      );
      viewPos.xyz.addAssign(normalize(normalView).mul(u.outlineThickness).mul(widthFix));
      viewPos.z.subAssign(u.outlineDepthOffset);
    }
    vViewPos.assign(viewPos);
    vViewDir.assign(normalize(viewPos.xyz.negate()));

    const clipPosition = cameraProjectionMatrix.mul(viewPos).toVar();

    // Perspective removal: flatten clip XY toward the head-center depth.
    const perspective = cameraProjectionMatrix.element(3).w.notEqual(1.0);
    If(u.perspectiveRemovalAmount.greaterThan(0.0).and(u.headDataReady).and(perspective), () => {
      const sphereMask = clamp(
        worldPos.sub(u.headPositionWS).length().div(max(u.perspectiveRemovalRadius, 1e-4)).oneMinus(),
        0.0,
        1.0,
      );
      const heightMask = clamp(
        worldPos.y.sub(u.perspectiveRemovalStartHeight)
          .div(max(u.perspectiveRemovalEndHeight.sub(u.perspectiveRemovalStartHeight), 1e-4)),
        0.0,
        1.0,
      );
      const removalAmount = u.perspectiveRemovalAmount.mul(sphereMask).mul(heightMask);
      const centerViewZ = cameraViewMatrix.mul(vec4(u.headPositionWS, 1.0)).z;
      const flattenedXY = clipPosition.xy.mul(abs(clipPosition.w)).div(max(abs(centerViewZ), 1e-4));
      clipPosition.xy.assign(mix(clipPosition.xy, flattenedXY, removalAmount));
    });

    return clipPosition;
  })();

  // ---- Fragment stage ----
  const vUv = uv();
  const vUv2 = attribute('uv2', 'vec2');
  const v = { vFaceProxyNormal, vUv, vUv2, vViewDir, vViewPos, vWorldNormal, vWorldPosition };

  material.userData.createDepthColorVariant = () => {
    const depthMaterial = new ToonAnimeNodeMaterial();
    depthMaterial.name = `${material.name || 'ToonAnimeNode'}Depth`;
    depthMaterial.lights = false;
    depthMaterial.fog = false;
    depthMaterial.side = material.side;
    depthMaterial.transparent = false;
    depthMaterial.depthWrite = true;
    depthMaterial.depthTest = material.depthTest;
    depthMaterial.isShadowPassMaterial = true;
    depthMaterial.vertexNode = material.vertexNode;
    depthMaterial.fragmentNode = Fn(() => {
      const baseTex = u.base.sample(vUv).toVar();
      const rawAlpha = baseTex.a.mul(u.baseColor.w).mul(u.baseColor2.w).toVar();
      const greenCut = u.gCutoff.greaterThanEqual(0.0)
        .and(baseTex.rgb.sub(vec3(0.0, 1.0, 0.0)).length().lessThan(u.gCutoff));
      const alphaCut = u.aCutoff.greaterThanEqual(0.0).and(rawAlpha.lessThan(u.aCutoff));
      Discard(greenCut.or(alphaCut));

      const orthographic = cameraProjectionMatrix.element(3).w.equal(1.0);
      const depth01 = select(
        orthographic,
        viewZToOrthographicDepth(vViewPos.z, cameraNear, cameraFar),
        viewZToPerspectiveDepth(vViewPos.z, cameraNear, cameraFar),
      );
      return vec4(vec3(depth01), 1.0);
    })();
    return depthMaterial;
  };

  const lighting = createLightingChunk({
    cameraViewMatrixNode: cameraViewMatrix,
    flags,
    frontFacingNode: frontFacing,
    tex,
    u,
    v,
  });
  const materialMaps = createMaterialMapChunk({ flags, tex, u, v });
  const shadowColorChunk = createShadowColorChunk({ u });
  const highlights = createHighlightsChunk({ flags, tex, u, v, toonEdgeSmooth: lighting.toonEdgeSmooth });
  const roles = createRolesChunk({ flags, u });
  const localEvaluators = createLocalLightEvaluators({ localLightBand: lighting.localLightBand });

  material.fragmentNode = Fn(() => {
    const baseTex = u.base.sample(vUv).toVar();
    const rawAlpha = baseTex.a.mul(u.baseColor.w).mul(u.baseColor2.w).toVar();

    const greenCut = u.gCutoff.greaterThanEqual(0.0)
      .and(baseTex.rgb.sub(vec3(0.0, 1.0, 0.0)).length().lessThan(u.gCutoff));
    const alphaCut = u.aCutoff.greaterThanEqual(0.0).and(rawAlpha.lessThan(u.aCutoff));
    Discard(greenCut.or(alphaCut));

    // 4x4 Bayer screen-door fade (needs no sorting, keeps depth writes).
    If(u.ditherOpacity.lessThan(1.0), () => {
      const pixel = floor(screenCoordinate.xy);
      Discard(u.ditherOpacity.lessThan(bayerThreshold(pixel)));
    });

    if (flags.isFurShell) {
      // Shell fur strand cutout (see anime.frag.glsl).
      const furUv = vUv.mul(u.furDensity).mul(100.0).toVar();
      const furCellUv = furUv.fract().sub(0.5);
      const furSeed3 = vec3(dot(floor(furUv), vec2(127.1, 311.7))).mul(vec3(0.1031, 0.103, 0.0973)).fract().toVar();
      const furSeed = furSeed3.x.add(furSeed3.y).mul(furSeed3.z)
        .add(dot(floor(furUv), vec2(0.013, 0.027))).fract();
      const furNoise = clamp(furSeed.mul(length(furCellUv).mul(1.4).oneMinus()), 0.0, 1.0);
      const furShift = u.furLayer.sub(u.furLayer.mul(u.furRootOffset)).add(u.furRootOffset);
      const furAlpha = clamp(furNoise.sub(furShift.mul(abs(furShift)).mul(abs(furShift))), 0.0, 1.0);
      Discard(clamp(furAlpha.mul(5.0).sub(2.0), 0.0, 1.0).lessThanEqual(0.0));
    }

    const alpha = select(u.alphaBlend, rawAlpha, float(1.0)).toVar();

    // Albedo edits (character-fragment-color.glsl).
    const sourceAlbedo = baseTex.rgb.mul(u.sourceBaseColor.rgb).toVar();
    const editedRgb = baseTex.rgb.mul(u.baseColor.rgb).mul(u.baseColor2.rgb).mul(u.baseMapBrightness);
    const albedoVar = applyBaseColorEditNode(editedRgb, u).toVar();
    albedoVar.assign(materialMaps.applyMaterialDetail(albedoVar));

    if (flags.hasSticker) {
      If(u.useSticker, () => {
        const stickerUv = select(u.stickerUvChannel.equal(1), vUv2, vUv)
          .mul(u.stickerRepeat).add(u.stickerOffset);
        const stickerTexel = tex.stickerMap.sample(stickerUv);
        const blendAmount = clamp(stickerTexel.a.mul(u.stickerStrength), 0.0, 1.0);
        const added = albedoVar.add(stickerTexel.rgb.mul(blendAmount));
        const multiplied = albedoVar.mul(mix(vec3(1.0), stickerTexel.rgb, blendAmount));
        const mixed = mix(albedoVar, stickerTexel.rgb, blendAmount);
        albedoVar.assign(select(u.stickerBlendMode.equal(1), added,
          select(u.stickerBlendMode.equal(2), multiplied, mixed)));
      });
    }
    const albedoFinal = albedoVar;

    const N = normalize(normalView).mul(select(frontFacing, float(1.0), float(-1.0))).toVar();
    N.assign(materialMaps.applyMaterialNormalMap(N));
    N.assign(lighting.resolveLightingNormal(N));

    const V = normalize(vViewDir).toVar();
    const geometryPosition = vViewPos.xyz;
    const L = getMainLightDirection().toVar();
    const H = normalize(L.add(V)).toVar();

    const NoV = clamp(dotNode(N, V), 0.0, 1.0).toVar();
    const NoL = clamp(dotNode(N, L), 0.0, 1.0).toVar();
    const NoH = clamp(dotNode(N, H), 0.0, 1.0).toVar();

    // Scene shadow mask: getShadowMask() replacement — the shared sun-shadow
    // pass publishes map+matrix; inert (1.0) until it runs, which matches a
    // scene with no shadow-casting lights.
    // The character varying is the smooth, skinned world normal. Using the
    // generic geometric normal here offsets every triangle independently and
    // exposes the world shadow map as diagonal facets on hair and clothing.
    const sceneShadowVisibility = sampleEnvironmentSunShadowWithNormal(
      vWorldPosition,
      vWorldNormal,
    ).mul(sampleEnvironmentCloudShadow(vWorldPosition, 1)).toVar();
    if (flags.useAverageShadowMeasure) {
      If(u.averageShadowMeasureReady.and(u.averageShadowMeasuredBlend.greaterThan(0.0)), () => {
        const measured = tex.averageShadowMeasureTexture
          .sample(vec2(u.averageShadowMeasureSlot, 0.5)).level(0).x;
        sceneShadowVisibility.assign(mix(sceneShadowVisibility, measured, u.averageShadowMeasuredBlend));
      });
    }

    const materialShadowStrength = u.receivedShadowStrength
      .mul(select(u.isFace, u.faceSceneShadowStrength, float(1.0))).toVar();
    const directVisibility = mix(1.0, max(sceneShadowVisibility, u.receivedShadowMinLight), materialShadowStrength);
    const selfShadowVisibility = lighting.getCharacterSelfShadowVisibility(sceneShadowVisibility).toVar();
    const selfShadowDirectVisibility = mix(1.0, max(selfShadowVisibility, u.selfShadowMinLight), u.selfShadowStrength);
    const selfShadowArea = mix(1.0, selfShadowDirectVisibility, u.selfShadowAreaStrength);
    const combinedDirectVisibility = directVisibility.mul(selfShadowArea);
    const finalDirectVisibility = lighting.applyAverageShadowVisibility(
      combinedDirectVisibility, sceneShadowVisibility, selfShadowVisibility,
    ).toVar();

    const materialAo = flags.hasAoMap ? materialMaps.sampleMaterialAo().toVar() : float(1.0);
    const materialRoughnessValue = materialMaps.sampleMaterialRoughness().toVar();
    const materialMetalnessValue = materialMaps.sampleMaterialMetalness().toVar();

    const { contactShadow: contactShadowValue, depthRim } = lighting.evaluateDepthEffects(N, L, NoL, NoV);

    const finalShadowArea = lighting.calcCelShade(N, L)
      .mul(contactShadowValue)
      .mul(mix(1.0, finalDirectVisibility, u.receivedShadowAreaStrength))
      .toVar();
    const shadowColor = shadowColorChunk.calculateShadowColor(albedoFinal, finalShadowArea).toVar();
    const lightColorIndependentLitColor = mix(shadowColor, albedoFinal, finalShadowArea)
      .mul(mix(vec3(1.0), materialMaps.sampleMaterialRamp(finalShadowArea), u.materialRampStrength))
      .toVar();
    const rimMask = lighting.calculateRimMask(NoV, NoL, finalShadowArea, depthRim).toVar();
    const specularArea = highlights.calculateSpecularArea(NoH, NoV, finalShadowArea, materialRoughnessValue).toVar();
    const hairHighlightMaskValue = highlights.calculateHairHighlightMask(V, N, H, vUv, finalShadowArea).toVar();
    const eyeHighlightMaskValue = highlights.calculateEyeHighlightMask(L, N, V, vUv).toVar();

    // ---- Outline pass output ----
    if (flags.isOutlinePass) {
      const outlineTint = mix(
        u.outlineTintColor,
        u.outlineTintColorSkinAreaOverride,
        select(u.isSkin, u.outlineSkinAreaOverrideStrength, float(0.0)),
      );
      const outlineColor = lightColorIndependentLitColor.mul(outlineTint).toVar();
      const outlineLighting = mix(1.0, finalShadowArea.mul(0.45).add(0.55), u.outlineLightingMix);
      outlineColor.mulAssign(outlineLighting);
      const outlineBrightness = maxColorComponent(outlineColor);
      const clampedBrightness = clamp(outlineBrightness, u.outlineMinBrightness, u.outlineMaxBrightness);
      outlineColor.mulAssign(clampedBrightness.div(max(outlineBrightness, 0.001)));

      if (flags.hasDebugViews) {
        const debugColor = buildDebugColor({
          albedo: albedoFinal, alpha, contactShadowValue, depthRim,
          eyeHighlightMaskValue, finalDirectVisibility, finalShadowArea,
          hairHighlightMaskValue, litColor: null, materialAo, materialMaps,
          materialMetalnessValue, materialRoughnessValue, N, rimMask, roles,
          sceneShadowVisibility, selfShadowVisibility, shadowColor,
          sourceAlbedo, specularArea, u,
        });
        // mix + scalar mask instead of a conditional root: see the masked-sum
        // note in buildDebugColor.
        const debugMask = select(u.debugOutputMode.greaterThan(0), float(1.0), float(0.0));
        return mix(vec4(outlineColor, alpha), debugColor, debugMask);
      }
      return vec4(outlineColor, alpha);
    }

    // ---- Lit accumulation ----
    const mainLight = getMainLightColor(u.mainLightMaxContribution).toVar();
    const directResult = mainLight.mul(lightColorIndependentLitColor).mul(finalDirectVisibility).toVar();
    const maxDirectLight = select(u.isFace, u.faceMaxDirectLight, select(u.isSkin, u.skinMaxDirectLight, float(100.0)));
    directResult.assign(min(directResult, albedoFinal.mul(maxDirectLight)));

    const hemisphereFill = localEvaluators.evaluateHemisphereFill(N, u.hemisphereLightIntensity);
    const ambientSource = max(toonSceneLights.ambientLightColor.add(hemisphereFill), vec3(u.environmentIndirectLight));
    const indirectResult = ambientSource.mul(u.ambientTint).mul(u.indirectLightIntensity)
      .mul(mix(shadowColor, albedoFinal, max(finalShadowArea, u.minimumIndirectLight)));
    const color = directResult.add(indirectResult).toVar();

    const { localLight: localLightValue, strongestLocalLight } = localEvaluators.evaluateLocalLightFill(
      N, geometryPosition, u.localLightIntensity, u.localLightMaxContribution,
    );
    const localFillMask = smoothstep(float(0.015), max(0.06, u.localLightMaxContribution.mul(0.55)), strongestLocalLight);
    const localLitColor = mix(shadowColor, albedoFinal, max(finalShadowArea, u.localLightShadowLift));
    color.addAssign(localLightValue.mul(localLitColor));
    color.assign(mix(color, max(color, albedoFinal.mul(u.localLightShadowLift)), localFillMask.mul(0.08)));
    color.mulAssign(mix(1.0, materialAo, u.materialAoStrength));

    If(u.useSpecular, () => {
      const resolvedSpecularColor = u.specularColor
        .mul(mix(vec3(1.0), materialMaps.sampleMaterialSpecularColor(), u.materialSpecularColorStrength))
        .toVar();
      resolvedSpecularColor.assign(mix(resolvedSpecularColor, albedoFinal, materialMetalnessValue.mul(u.materialMetalnessStrength)));
      const resolvedSpecularIntensity = u.specularIntensity
        .mul(materialMetalnessValue.mul(u.materialMetalnessStrength).add(1.0));
      color.addAssign(resolvedSpecularColor.mul(mainLight).mul(specularArea).mul(resolvedSpecularIntensity).mul(finalDirectVisibility));
    });

    If(u.useHairHighlight, () => {
      color.addAssign(mainLight.mul(albedoFinal).mul(hairHighlightMaskValue).mul(u.hairHighlightIntensity).mul(finalDirectVisibility));
    });

    If(u.useEyeHighlight, () => {
      color.addAssign(
        u.eyeHighlightColor.mul(eyeHighlightMaskValue).mul(u.eyeHighlightIntensity)
          .mul(mix(finalDirectVisibility, 1.0, u.eyeHighlightShowInShadowArea)),
      );
    });

    If(u.useRimLight, () => {
      const rimColor = mainLight.mul(u.rimTintColor).mul(mix(vec3(1.0), albedoFinal, u.rimMixWithBaseMapColor));
      color.addAssign(rimColor.mul(rimMask).mul(u.rimIntensity).mul(finalDirectVisibility));
    });

    if (flags.hasGlitter) {
      If(u.useGlitter, () => {
        const glitterUv = select(u.glitterUvChannel.equal(1), vUv2, vUv);
        const glitterResult = highlights.evaluateGlitter(glitterUv, V, N, L);
        const glitterVisibility = mix(finalShadowArea.mul(finalDirectVisibility), 1.0, u.glitterShowInShadowArea);
        color.addAssign(glitterResult.mul(mainLight).mul(u.glitterIntensity).mul(glitterVisibility));
      });
    }

    if (flags.isFurShell) {
      // Cheap fur self-occlusion: darken roots.
      color.mulAssign(mix(u.furRootShade, float(1.0), u.furLayer));
    }

    if (flags.hasMatcapMap) {
      If(u.materialMatcapStrength.greaterThan(0.0).and(u.hasMaterialMatcapMap), () => {
        color.addAssign(albedoFinal.mul(materialMaps.sampleMaterialMatcap(N)).mul(u.materialMatcapStrength));
      });
    }

    If(u.materialEmissiveStrength.greaterThan(0.0), () => {
      color.addAssign(materialMaps.sampleMaterialEmissive().mul(u.materialEmissiveStrength));
    });

    color.assign(max(color, vec3(0.0)));

    if (flags.hasDebugViews) {
      const debugColor = buildDebugColor({
        albedo: albedoFinal, alpha, contactShadowValue, depthRim,
        eyeHighlightMaskValue, finalDirectVisibility, finalShadowArea,
        hairHighlightMaskValue, litColor: color, materialAo, materialMaps,
        materialMetalnessValue, materialRoughnessValue, N, rimMask, roles,
        sceneShadowVisibility, selfShadowVisibility, shadowColor,
        sourceAlbedo, specularArea, u,
      });
      // mix + scalar mask instead of a conditional root (see buildDebugColor).
      const debugMask = select(u.debugOutputMode.greaterThan(0), float(1.0), float(0.0));
      return mix(vec4(color, alpha), debugColor, debugMask);
    }

    return vec4(color, alpha);
  })();

  // Same-name uniform slots (ShaderMaterial-compatible `.value` access).
  material.uniforms = u;
  material.userData.isToonNodeMaterial = true;
  material.userData.toonFlags = flags;

  // Fur shells need per-shell materials (the GLSL path deep-clones uniform
  // dicts; NodeMaterial.clone would SHARE uniform nodes, so shells rebuild
  // with the same params + current uniform values instead).
  material.userData.createFurShellVariant = (furSettings, layer) => {
    const shellMaterial = createAnimeNodeMaterial({ ...params, isFurShell: true });
    copyToonUniformValues(shellMaterial.uniforms, u);
    shellMaterial.uniforms.furLayer.value = layer;
    shellMaterial.uniforms.furLength.value = furSettings.length;
    shellMaterial.uniforms.furGravity.value = furSettings.gravity;
    shellMaterial.uniforms.furDensity.value = furSettings.density;
    shellMaterial.uniforms.furRootOffset.value = furSettings.rootOffset;
    shellMaterial.uniforms.furRootShade.value = furSettings.rootShade;
    // Shells are cutout-discarded in the fragment shader; keep depth writes
    // so they sort correctly against outlines and transparents.
    shellMaterial.transparent = false;
    shellMaterial.depthWrite = true;
    return shellMaterial;
  };

  // Scene lights are mirrored into the shared uniforms once per rendered
  // frame from the converted meshes (see toonMaterialAdapter).
  return material;
}

// Mirrors current uniform values from one anime node material to another
// (the fur-shell analog of ShaderMaterial.clone's uniform deep copy).
function copyToonUniformValues(target, source) {
  for (const [name, node] of Object.entries(target)) {
    const sourceNode = source[name];
    if (!sourceNode || sourceNode === node) continue;
    const value = sourceNode.value;
    if (value === undefined) continue;
    if (value?.isColor || value?.isVector2 || value?.isVector3 || value?.isVector4 || value?.isMatrix4) {
      node.value?.copy?.(value);
    } else {
      node.value = value;
    }
  }
}

// dot() with a name that doesn't collide with the import list ordering above.
function dotNode(a, b) {
  return a.dot(b);
}

// applyBaseColorEdit (character-fragment-color.glsl) — kept here because it
// mixes uniform access with the color-chunk helpers.
import { applyHSVChange as _applyHSVChange, hsvToRgb as _hsvToRgb, rgbToHsv as _rgbToHsv } from './chunks/character-color.js';
import { fract as _fract } from 'three/tsl';

function applyBaseColorEditNode(editedRgb, u) {
  const hsv = _rgbToHsv(max(editedRgb, vec3(0.0))).toVar();
  hsv.x.assign(_fract(hsv.x.add(u.baseMapHue)));
  hsv.y.assign(clamp(hsv.y.mul(u.baseMapSaturation), 0.0, 1.0));
  hsv.z.mulAssign(u.baseMapValue);
  const color = _hsvToRgb(hsv);
  return pow(max(color, vec3(0.0)), vec3(max(u.baseMapGamma, 0.01)));
}

// Debug output select-chain (character-fragment-debug.glsl + the mode table
// in anime.frag.glsl). Only built when debugOutputMode > 0 at creation time
// (the TOON_DEBUG_VIEWS define analog).
function buildDebugColor(ctx) {
  const {
    albedo, alpha, contactShadowValue, depthRim, eyeHighlightMaskValue,
    finalDirectVisibility, finalShadowArea, hairHighlightMaskValue, litColor,
    materialAo, materialMaps, materialMetalnessValue, materialRoughnessValue,
    N, rimMask, roles, sceneShadowVisibility, selfShadowVisibility,
    shadowColor, sourceAlbedo, specularArea, u,
  } = ctx;

  const dbg = (color) => vec4(max(vec3(color), vec3(0.0)), alpha);

  const entries = [
    [1, dbg(albedo)],
    [2, dbg(vec3(finalShadowArea))],
    [3, dbg(vec3(sceneShadowVisibility))],
    [4, dbg(shadowColor)],
    [6, dbg(roles.debugMaterialRoleColor())],
    [7, vec4(max(vec3(alpha), vec3(0.0)), 1.0)],
    [8, dbg(sourceAlbedo)],
    [9, dbg(vec3(selfShadowVisibility))],
    [10, dbg(vec3(finalDirectVisibility))],
    [11, dbg(vec3(rimMask))],
    [12, dbg(vec3(specularArea))],
    [13, dbg(vec3(hairHighlightMaskValue))],
    [14, dbg(vec3(eyeHighlightMaskValue))],
    [15, dbg(materialMaps.sampleMaterialNormalMapColor())],
    [16, dbg(vec3(materialAo))],
    [17, dbg(materialMaps.sampleMaterialEmissive())],
    [18, dbg(materialMaps.sampleMaterialMatcap(N))],
    [19, dbg(materialMaps.sampleMaterialRamp(finalShadowArea))],
    [20, dbg(materialMaps.sampleMaterialDetail())],
    [21, dbg(vec3(materialRoughnessValue))],
    [22, dbg(vec3(materialMetalnessValue))],
    [23, dbg(vec3(max(depthRim, 0.0)))],
    [24, dbg(vec3(contactShadowValue))],
  ];
  if (litColor !== null) {
    const lightingFactor = litColor.div(max(albedo, vec3(0.06)));
    entries.push([5, dbg(clamp(lightingFactor.mul(0.5), vec3(0.0), vec3(1.0)))]);
  }

  // Masked sum instead of nested selects: deep ConditionalNode chains hit the
  // GLSL builder's detached type-resolution fallback (see the vec4-root note
  // at the call sites); per-entry scalar masks stay flat and hazard-free.
  let result = vec4(0.0, 0.0, 0.0, alpha).mul(knownModeMask(u, entries).oneMinus());
  for (const [mode, value] of entries) {
    result = result.add(vec4(value).mul(select(u.debugOutputMode.equal(mode), float(1.0), float(0.0))));
  }
  return result;
}

// 1 when debugOutputMode matches any table entry, else 0 — keeps the
// fallback-black default for unknown modes without a conditional chain.
function knownModeMask(u, entries) {
  let mask = float(0.0);
  for (const [mode] of entries) {
    mask = mask.add(select(u.debugOutputMode.equal(mode), float(1.0), float(0.0)));
  }
  return mask.min(1.0);
}
