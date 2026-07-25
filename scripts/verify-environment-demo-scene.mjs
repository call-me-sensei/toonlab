#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UE_SOURCE_RADIOMETRIC_SCALE,
  UE_SOURCE_STAGE_INPUT_SCALES,
  computeUeCascadeBreaks,
  evaluateUeRadialAttenuation,
  resolveUeDirectionalIntensity,
  resolveUePointLightContract,
  resolveUeSkyLightIntensity,
} from '../src/environment/ueSourceLighting.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DEMO_DIR = resolve(ROOT_DIR, 'assets-local', 'sostylized', 'demo-scenes');
const MATERIAL_SOURCE = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'material-source',
  'manifest.json',
);
const MANIFEST_PATH = resolve(DEMO_DIR, 'Demonstration_SnowPines.json');
const GEOMETRY_PATH = resolve(DEMO_DIR, 'Demonstration_SnowPines.glb');
const AUTHORED_PATH = resolve(DEMO_DIR, 'Demonstration_SnowPines-authored.glb');
const SHOWCASE_PATH = resolve(ROOT_DIR, 'examples', 'source-showcase', 'main.js');
const NATIVE_REFERENCE_DIR = resolve(DEMO_DIR, 'native-reference');
const NATIVE_REFERENCE_PATHS = Array.from(
  { length: 16 },
  (_, index) => resolve(NATIVE_REFERENCE_DIR, `CameraRender${index + 1}.png`),
);
const UNREAL_CONFIG_PATH = resolve(
  ROOT_DIR,
  '..',
  'StylizedExploration',
  'Config',
  'DefaultEngine.ini',
);
const REFERENCE_MAP =
  '/Game/ToonLab/Reference/SoStylized/SnowPines/Demonstration_SnowPines_UE52Reference';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  invariant(existsSync(path), `Missing ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readGlbJson(path) {
  invariant(existsSync(path), `Missing ${path}`);
  const bytes = readFileSync(path);
  invariant(bytes.toString('ascii', 0, 4) === 'glTF', `${path} is not a GLB`);
  invariant(bytes.readUInt32LE(4) === 2, `${path} is not glTF 2.0`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  return { bytes, json };
}

function readPngSize(path) {
  invariant(existsSync(path), `Missing ${path}`);
  const bytes = readFileSync(path);
  invariant(bytes.length >= 24, `${path} is not a complete PNG`);
  invariant(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${path} is not a PNG`,
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const manifest = readJson(MANIFEST_PATH);
const showcaseSource = readFileSync(SHOWCASE_PATH, 'utf8');
invariant(
  UE_SOURCE_STAGE_INPUT_SCALES.directionalLight === 1
    && UE_SOURCE_STAGE_INPUT_SCALES.skyLight === 1
    && UE_SOURCE_STAGE_INPUT_SCALES.fogDensity === 1,
  'The source showcase stage inputs must not carry presentation calibration',
);
invariant(
  /numberParam\(\s*'sunScale',\s*UE_SOURCE_STAGE_INPUT_SCALES\.directionalLight/s
    .test(showcaseSource),
  'The source showcase must default sunScale to the exact radiometric boundary',
);
invariant(
  /numberParam\(\s*'iblScale',\s*UE_SOURCE_STAGE_INPUT_SCALES\.skyLight/s
    .test(showcaseSource),
  'The source showcase must default iblScale to the exact SkyLight boundary',
);
invariant(
  /numberParam\(\s*'fogScale',\s*UE_SOURCE_STAGE_INPUT_SCALES\.fogDensity/s
    .test(showcaseSource),
  'The source showcase must default fogScale to the authored density',
);
invariant(
  /params\.has\('aoIntensity'\)[\s\S]*postSettings\?\.ambient_occlusion_intensity/
    .test(showcaseSource),
  'The source showcase must preserve authored AO unless the diagnostic query overrides it',
);
invariant(manifest.schema === 'toonlab.sostylized-demo-scene', 'Unexpected demo schema');
invariant(
  manifest.sourceMap === '/Game/SoStylized/Maps/SnowPines/Demonstration_SnowPines',
  'Unexpected source demo map',
);
invariant(Array.isArray(manifest.actors), 'Demo actors are missing');
invariant(manifest.counts.actors === manifest.actors.length, 'Actor count does not match records');

const components = manifest.actors.flatMap((actor) => actor.staticMeshes ?? []);
const instances = components.reduce(
  (total, component) => total + (component.instances?.length ?? 0),
  0,
);
const uniqueMeshes = new Set(components.map((component) => component.mesh).filter(Boolean));
invariant(manifest.counts.meshComponents === components.length, 'Mesh component count mismatch');
invariant(
  components.every((component) => component.renderProperties),
  'Every authored mesh component must export its render properties',
);
invariant(manifest.counts.instances === instances, 'Instance count mismatch');
invariant(manifest.counts.uniqueMeshes === uniqueMeshes.size, 'Unique mesh count mismatch');
invariant(manifest.counts.actors === 316, 'SnowPines actor inventory changed');
invariant(manifest.counts.instances === 8939, 'SnowPines instance inventory changed');

const expectedCvars = {
  'r.AllowStaticLighting': 0,
  'r.LegacyLuminanceFactors': 1,
  'r.VirtualTextures': 1,
  'r.VT.EnableAutoImport': 0,
  'r.GenerateMeshDistanceFields': 1,
  'r.CustomDepth': 3,
  'r.AntiAliasingMethod': 2,
  'r.Shadow.Virtual.Enable': 0,
  'r.DynamicGlobalIlluminationMethod': 0,
  'r.ReflectionMethod': 2,
  'r.RayTracing': 0,
  'r.RayTracing.RayTracingProxies.ProjectEnabled': 0,
  'r.Substrate': 0,
  'r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange': 1,
  'r.DefaultFeature.LocalExposure.HighlightContrastScale': 1,
  'r.DefaultFeature.LocalExposure.ShadowContrastScale': 1,
};
const effectiveCvars = manifest.projectSettings?.cvars ?? {};
for (const [name, expected] of Object.entries(expectedCvars)) {
  invariant(
    Number(effectiveCvars[name]) === expected,
    `${name} must be ${expected}; received ${effectiveCvars[name]}`,
  );
}
const expectedEpicScalability = [
  'sg.ViewDistanceQuality',
  'sg.AntiAliasingQuality',
  'sg.ShadowQuality',
  'sg.GlobalIlluminationQuality',
  'sg.ReflectionQuality',
  'sg.PostProcessQuality',
  'sg.TextureQuality',
  'sg.EffectsQuality',
  'sg.FoliageQuality',
  'sg.ShadingQuality',
];
const effectiveScalability = manifest.projectSettings?.scalability ?? {};
for (const name of expectedEpicScalability) {
  invariant(
    Number(effectiveScalability[name]) === 3,
    `${name} must be Epic (3); received ${effectiveScalability[name]}`,
  );
}
invariant(
  [0, 100].includes(Number(effectiveScalability['sg.ResolutionQuality'])),
  'Resolution quality must be the project-default native sentinel (0) or explicit native (100)',
);
invariant(
  Number(manifest.projectSettings?.nearClipPlane) === 5,
  `Near clip plane must be 5 cm; received ${manifest.projectSettings?.nearClipPlane}`,
);

const unrealConfig = readFileSync(UNREAL_CONFIG_PATH, 'utf8');
const requiredConfigLines = [
  `EditorStartupMap=${REFERENCE_MAP}`,
  `GameDefaultMap=${REFERENCE_MAP}`,
  'r.VirtualTextures=True',
  'r.VT.EnableAutoImport=False',
  'r.GenerateMeshDistanceFields=True',
  'r.CustomDepth=3',
  'r.AntiAliasingMethod=2',
  'r.Shadow.Virtual.Enable=0',
  'r.DynamicGlobalIlluminationMethod=0',
  'r.ReflectionMethod=2',
  'r.RayTracing=False',
  'r.RayTracing.RayTracingProxies.ProjectEnabled=False',
  'r.Substrate=False',
  'r.LegacyLuminanceFactors=True',
  'r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange=True',
  'r.DefaultFeature.LocalExposure.HighlightContrastScale=1.000000',
  'r.DefaultFeature.LocalExposure.ShadowContrastScale=1.000000',
  'NearClipPlane=5.000000',
];
for (const line of requiredConfigLines) {
  invariant(unrealConfig.split(/\r?\n/).includes(line), `Missing Unreal baseline: ${line}`);
}

const landscapes = manifest.sceneSetup?.landscapes ?? [];
invariant(landscapes.length === 1, 'SnowPines must contain one authored Landscape');
const landscape = landscapes[0];
invariant(
  String(landscape.properties?.landscape_material ?? '').includes('MI_Landscape'),
  'SnowPines Landscape must use MI_Landscape',
);
const landscapeRvts = landscape.properties?.runtime_virtual_textures ?? [];
invariant(landscapeRvts.length === 2, 'SnowPines Landscape must draw into two RVTs');
invariant(
  landscapeRvts.some((path) => String(path).includes('RVT_Landscape.RVT_Landscape')),
  'SnowPines Landscape is missing RVT_Landscape',
);
invariant(
  landscapeRvts.some((path) => String(path).includes('RVT_LandscapeHeight.RVT_LandscapeHeight')),
  'SnowPines Landscape is missing RVT_LandscapeHeight',
);
const rvtVolumes = manifest.sceneSetup?.runtimeVirtualTextureVolumes ?? [];
invariant(rvtVolumes.length === 2, 'SnowPines must contain two authored RVT volumes');

const renderComponents = manifest.renderState?.components ?? [];
const authoredSky = (componentClass) => renderComponents.find(
  (component) => component.actor === 'BP_StylizedSky_Lite'
    && component.componentClass === componentClass,
);
const directionalLight = authoredSky('DirectionalLightComponent');
const skyLight = authoredSky('SkyLightComponent');
const fog = authoredSky('ExponentialHeightFogComponent');
const postProcess = authoredSky('PostProcessComponent');
const pointLights = renderComponents.filter(
  (component) => component.componentClass === 'PointLightComponent',
);
invariant(directionalLight, 'Authored directional light is missing');
invariant(Number(directionalLight.properties?.intensity) === 8, 'Authored sun intensity changed');
invariant(
  resolveUeDirectionalIntensity(
    directionalLight.properties,
    UE_SOURCE_RADIOMETRIC_SCALE,
  ) === 8,
  'The browser renderer must preserve the authored directional radiometry',
);
invariant(
  String(directionalLight.properties?.mobility).includes('MOVABLE'),
  'Authored sun must remain movable',
);
invariant(skyLight, 'Authored skylight is missing');
invariant(
  Math.abs(Number(skyLight.properties?.intensity) - 1.2) < 0.001,
  'Authored skylight intensity changed',
);
invariant(
  Math.abs(resolveUeSkyLightIntensity(
    skyLight.properties,
    UE_SOURCE_RADIOMETRIC_SCALE,
  ) - 1.2) < 0.001,
  'The browser renderer must preserve the authored SkyLight radiometry',
);
invariant(
  String(skyLight.properties?.mobility).includes('MOVABLE'),
  'Authored skylight must remain movable',
);
invariant(skyLight.properties?.cast_shadows === false, 'Authored skylight shadows changed');
invariant(skyLight.properties?.real_time_capture === false, 'Authored skylight must use its scene capture');
invariant(
  skyLight.properties?.lower_hemisphere_is_black === true,
  'Authored SkyLight lower-hemisphere replacement changed',
);
invariant(
  skyLight.properties?.capture_emissive_only === false,
  'Authored SkyLight capture must retain ordinary scene lighting',
);
invariant(
  Number(skyLight.properties?.cubemap_resolution) === 128,
  'Authored SkyLight capture resolution changed',
);
invariant(
  Number(skyLight.properties?.sky_distance_threshold) === 150000,
  'Authored SkyLight distance threshold changed',
);
invariant(
  skyLight.properties?.affect_reflection === true,
  'Authored SkyLight must affect reflections',
);
invariant(
  skyLight.properties?.affect_global_illumination === true,
  'Authored SkyLight GI participation changed',
);
invariant(
  String(skyLight.properties?.source_type).includes('SLS_CAPTURED_SCENE'),
  'Authored skylight source must remain Captured Scene',
);
invariant(fog, 'Authored exponential height fog is missing');
invariant(Number(fog.properties?.enable_volumetric_fog) === 0, 'SnowPines volumetric fog must be off');
invariant(postProcess?.properties?.unbound === true, 'Authored post process must be unbound');
invariant(pointLights.length === 2, 'SnowPines point-light inventory changed');
for (const pointLight of pointLights) {
  const properties = pointLight.properties ?? {};
  const contract = resolveUePointLightContract(properties);
  invariant(
    String(properties.intensity_units).includes('UNITLESS'),
    `${pointLight.actor} must use unitless intensity`,
  );
  invariant(
    properties.use_inverse_squared_falloff === false,
    `${pointLight.actor} must use UE radial falloff`,
  );
  invariant(contract.intensity === 4, `${pointLight.actor} intensity changed`);
  invariant(
    contract.attenuationRadiusMeters === 25,
    `${pointLight.actor} attenuation radius changed`,
  );
  invariant(
    contract.lightFalloffExponent === 6,
    `${pointLight.actor} falloff exponent changed`,
  );
  invariant(properties.cast_shadows === false, `${pointLight.actor} shadows changed`);
}
invariant(
  Math.abs(evaluateUeRadialAttenuation(12.5, 25, 6) - (0.75 ** 6)) < 1e-12,
  'UE radial point-light attenuation mapping changed',
);
invariant(evaluateUeRadialAttenuation(0, 25, 6) === 1, 'UE radial light must peak at one');
invariant(evaluateUeRadialAttenuation(25, 25, 6) === 0, 'UE radial light must end at radius');
invariant(evaluateUeRadialAttenuation(30, 25, 6) === 0, 'UE radial light must remain zero outside radius');
invariant(
  resolveUePointLightContract({
    attenuation_radius: 2500,
    intensity: 4,
    intensity_units: '<LightUnits.UNITLESS: 0>',
    use_inverse_squared_falloff: true,
  }).intensity === 64,
  'UE inverse-square unitless legacy intensity rule changed',
);
const sourceCascadeBreaks = computeUeCascadeBreaks({
  cascadeCount: Number(directionalLight.properties?.dynamic_shadow_cascades),
  exponent: Number(directionalLight.properties?.cascade_distribution_exponent),
});
const expectedCascadeBreaks = [1 / 40, 4 / 40, 13 / 40, 1];
invariant(
  sourceCascadeBreaks.every(
    (value, index) => Math.abs(value - expectedCascadeBreaks[index]) < 1e-12,
  ),
  `Authored CSM split distribution changed: ${sourceCascadeBreaks.join(', ')}`,
);
const post = postProcess.postProcessSettings ?? {};
invariant(post.override_auto_exposure_min_brightness === true, 'Authored exposure minimum override is missing');
invariant(post.override_auto_exposure_max_brightness === true, 'Authored exposure maximum override is missing');
invariant(Number(post.auto_exposure_min_brightness) === 1, 'Authored exposure minimum changed');
invariant(Number(post.auto_exposure_max_brightness) === 1, 'Authored exposure maximum changed');
invariant(post.override_color_saturation === true, 'Authored saturation override is missing');
invariant(Math.abs(Number(post.color_saturation?.[0]) - 1.1) < 0.001, 'Authored saturation changed');
invariant(post.override_motion_blur_amount === true, 'Authored motion-blur override is missing');
invariant(Number(post.motion_blur_amount) === 0, 'Authored motion blur must be disabled');
invariant(
  renderComponents.filter((component) => component.componentClass === 'CineCameraComponent').length === 16,
  'Authored render-state camera inventory must be 16',
);

const materialSource = readJson(MATERIAL_SOURCE);
const knownMaterialNames = new Set(materialSource.materials.map((material) =>
  String(material.path).split('.').at(-1).split('/').at(-1)));
const geometry = readGlbJson(GEOMETRY_PATH);
const geometryMaterialNames = (geometry.json.materials ?? []).map((material) => material.name ?? '');
const unknownMaterials = geometryMaterialNames.filter((name) => !knownMaterialNames.has(name));
invariant((geometry.json.cameras?.length ?? 0) === 16, 'Authored camera inventory must be 16');
invariant((geometry.json.nodes?.length ?? 0) > 9000, 'Authored level nodes are incomplete');
invariant(geometryMaterialNames.length >= 50, 'Authored material slots are incomplete');
invariant(unknownMaterials.length === 0, `Unknown authored materials: ${unknownMaterials.join(', ')}`);

const authored = readGlbJson(AUTHORED_PATH);
invariant((authored.json.cameras?.length ?? 0) === 16, 'Baked scene camera inventory must be 16');
invariant((authored.json.images?.length ?? 0) > 0, 'Native Unreal bake contains no images');
invariant((authored.json.textures?.length ?? 0) > 0, 'Native Unreal bake contains no textures');
invariant(
  statSync(AUTHORED_PATH).size > statSync(GEOMETRY_PATH).size,
  'Native Unreal bake should include more data than geometry-only GLB',
);
const nativeReferenceSizes = NATIVE_REFERENCE_PATHS.map((path) => ({
  path,
  ...readPngSize(path),
}));
for (const nativeReference of nativeReferenceSizes) {
  invariant(
    nativeReference.width === 1920 && nativeReference.height === 1080,
    `${nativeReference.path} must be 1920x1080`,
  );
}

console.log('environment demo verification passed');
console.log(JSON.stringify({
  actors: manifest.counts.actors,
  authoredCameras: geometry.json.cameras.length,
  authoredInstances: manifest.counts.instances,
  bakedImages: authored.json.images.length,
  bakedMaterials: authored.json.materials?.length ?? 0,
  bakedSizeMiB: Number((authored.bytes.length / 1024 / 1024).toFixed(2)),
  geometryMaterials: geometryMaterialNames.length,
  meshComponents: manifest.counts.meshComponents,
  nativeReferences: {
    count: nativeReferenceSizes.length,
    resolution: `${nativeReferenceSizes[0].width}x${nativeReferenceSizes[0].height}`,
  },
  scalability: 'Epic',
  renderer: {
    antiAliasing: effectiveCvars['r.AntiAliasingMethod'],
    dynamicGlobalIllumination: effectiveCvars['r.DynamicGlobalIlluminationMethod'],
    reflections: effectiveCvars['r.ReflectionMethod'],
    virtualShadowMaps: effectiveCvars['r.Shadow.Virtual.Enable'],
    sourceCascadeBreaks,
    sourceSkyLightIntensity: resolveUeSkyLightIntensity(skyLight.properties),
    sourceSunIntensity: resolveUeDirectionalIntensity(directionalLight.properties),
    sourcePointLights: pointLights.map((light) => resolveUePointLightContract(light.properties)),
  },
  meshRenderProperties: components.filter((component) => component.renderProperties).length,
  runtimeVirtualTextures: landscapeRvts.length,
  uniqueMeshes: manifest.counts.uniqueMeshes,
}, null, 2));
