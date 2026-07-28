// TSL ground material shared by the Ground Shader Lab and Landscape runtime.
// The portable profile controls response; splat weights, textures, current
// lighting, weather, and water level are explicit scene/asset inputs.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  distance,
  dot,
  Fn,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

import { worldFbm2 } from '../shaders-tsl/chunks/world-noise.js';
import {
  createGroundShaderSettings,
  GROUND_SHADER_FIELD_SCHEMA,
  GROUND_SHADER_SCHEMA_VERSION,
} from './groundShaderSettings.js';

function configureSplatTexture(map) {
  map.name = 'GroundShaderSplatWeights';
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.flipY = false;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  return map;
}

function configureLayerTexture(map) {
  if (!map) return null;
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

function makeUniform(value) {
  if (Array.isArray(value)) {
    return uniform(new THREE.Color().setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace));
  }
  return uniform(value);
}

function buildStyleUniforms(settings) {
  const uniforms = {};
  for (const [groupId, fields] of Object.entries(GROUND_SHADER_FIELD_SCHEMA)) {
    for (const [key, field] of Object.entries(fields)) {
      uniforms[field.uniform] = makeUniform(settings[groupId][key]);
    }
  }
  return uniforms;
}

function setUniformValue(node, value) {
  if (Array.isArray(value) && node.value?.isColor) {
    node.value.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace);
  } else {
    node.value = Array.isArray(value) ? [...value] : value;
  }
}

function cloneSettings(settings) {
  return Object.fromEntries(Object.entries(settings).map(([groupId, group]) => [
    groupId,
    Object.fromEntries(Object.entries(group).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ])),
  ]));
}

function collectMaterials(target, output = new Set()) {
  if (!target) return output;
  if (Array.isArray(target)) {
    target.forEach((entry) => collectMaterials(entry, output));
    return output;
  }
  if (target.isMaterial) {
    output.add(target);
    return output;
  }
  const append = (object) => {
    const materials = Array.isArray(object?.material) ? object.material : [object?.material];
    materials.filter(Boolean).forEach((material) => output.add(material));
  };
  append(target);
  target.traverse?.((object) => {
    if (object !== target) append(object);
  });
  return output;
}

function layerTintOverrides(layers) {
  const keys = ['grassTint', 'dirtTint', 'rockTint', 'sandTint'];
  const overrides = {};
  keys.forEach((key, index) => {
    if (Array.isArray(layers[index]?.tint)) overrides[key] = layers[index].tint;
  });
  return overrides;
}

/**
 * Creates the canonical Ground Shader material.
 *
 * `field` owns the RGBA splat brick. `layers` may provide asset textures and
 * compatibility tints. `settings` is the reusable Ground Shader profile.
 */
export function createCompatibilityGroundShaderMaterial({
  field,
  layers = [],
  settings = {},
} = {}) {
  if (!field?.splat || !field.splatW || !field.splatD) {
    throw new TypeError('Ground Shader needs a field with RGBA splat weights.');
  }

  let resolvedSettings = createGroundShaderSettings({
    ...settings,
    layers: {
      ...(settings.layers ?? {}),
      ...layerTintOverrides(layers),
    },
  });
  const splatTexture = configureSplatTexture(new THREE.DataTexture(
    field.splat,
    field.splatW,
    field.splatD,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  ));
  const layerTextures = Array.from({ length: 4 }, (_, index) => (
    configureLayerTexture(layers[index]?.texture ?? layers[index]?.map ?? null)
  ));
  const styleUniforms = buildStyleUniforms(resolvedSettings);
  const sceneUniforms = {
    uSceneGroundSnowCover: uniform(0),
    uSceneGroundSunColor: uniform(new THREE.Color(0xfff0d2)),
    uSceneGroundSunDirection: uniform(new THREE.Vector3(0.45, 0.75, 0.5).normalize()),
    uSceneGroundSkyColor: uniform(new THREE.Color(0xc7dcff)),
    uSceneGroundWaterLevel: uniform(-10000),
    uSceneGroundWetness: uniform(0),
  };

  const u = (groupId, key) => styleUniforms[GROUND_SHADER_FIELD_SCHEMA[groupId][key].uniform];
  // The graph below computes the complete stylized sun/sky/shadow response.
  // A lit NodeMaterial would apply renderer lighting a second time and crush
  // the accepted ground colors, especially under the blue daytime fill.
  const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.name = 'ToonLab Ground Shader';
  material.uniforms = { ...styleUniforms, ...sceneUniforms };

  function sampleProjectedLayer(index, scale) {
    const map = layerTextures[index];
    if (!map) return vec3(1);
    const mapNode = texture(map);
    const safeScale = max(scale, 0.001);
    const planar = mapNode.sample(positionWorld.xz.div(safeScale)).rgb;
    const weights = pow(abs(normalWorldGeometry), vec3(u('projection', 'triplanarSharpness'))).toVar();
    const total = max(weights.x.add(weights.y).add(weights.z), 0.0001);
    const triplanar = mapNode.sample(positionWorld.zy.div(safeScale)).rgb.mul(weights.x)
      .add(mapNode.sample(positionWorld.xz.div(safeScale)).rgb.mul(weights.y))
      .add(mapNode.sample(positionWorld.xy.div(safeScale)).rgb.mul(weights.z))
      .div(total);
    const steepness = abs(normalWorldGeometry.y).oneMinus();
    const projectionBlend = steepness.mul(u('projection', 'triplanarStrength')).clamp(0, 1);
    return mix(planar, triplanar, projectionBlend);
  }

  function shoreWetMaskNode() {
    return smoothstep(
      0,
      u('shoreline', 'wetBandWidth').add(0.001),
      abs(positionWorld.y.sub(sceneUniforms.uSceneGroundWaterLevel)),
    ).oneMinus();
  }

  function currentWetnessNode() {
    return clamp(
      sceneUniforms.uSceneGroundWetness.add(shoreWetMaskNode().mul(0.55)),
      0,
      1,
    );
  }

  function rebuildNodes() {
    material.colorNode = Fn(() => {
    const weights = texture(splatTexture, uv());
    const total = max(weights.r.add(weights.g).add(weights.b).add(weights.a), 0.0001);
    const channels = [weights.r, weights.g, weights.b, weights.a];
    const tintNodes = [
      u('layers', 'grassTint'),
      u('layers', 'dirtTint'),
      u('layers', 'rockTint'),
      u('layers', 'sandTint'),
    ];
    const scaleNodes = [
      u('projection', 'grassScale'),
      u('projection', 'dirtScale'),
      u('projection', 'rockScale'),
      u('projection', 'sandScale'),
    ];
    const layerNodes = tintNodes.map((tintNode, index) => {
      const detail = sampleProjectedLayer(index, scaleNodes[index]);
      return tintNode.mul(mix(vec3(1), detail, u('layers', 'textureStrength')));
    });

    let groundColor = vec3(0).toVar();
    layerNodes.forEach((layerNode, index) => {
      groundColor.addAssign(layerNode.mul(channels[index].div(total)));
    });

    const viewDistance = distance(cameraPosition, positionWorld).toVar();
    const distanceMask = smoothstep(
      u('distance', 'start'),
      max(u('distance', 'end'), u('distance', 'start').add(0.001)),
      viewDistance,
    ).toVar();
    const detailRetention = clamp(
      distanceMask.mul(u('distance', 'detailFade')).oneMinus(),
      0,
      1,
    ).toVar();

    const slopeNoise = worldFbm2(
      positionWorld.xz.mul(max(u('slope', 'noiseScale'), 0.0001)),
    ).sub(0.5).mul(2).mul(u('slope', 'noiseStrength'));
    const slopeValue = abs(normalWorldGeometry.y).oneMinus().add(slopeNoise).toVar();
    const steepMask = smoothstep(
      u('slope', 'start'),
      u('slope', 'start').add(max(u('slope', 'fade'), 0.001)),
      slopeValue,
    ).toVar();
    groundColor.assign(mix(
      groundColor,
      layerNodes[2],
      steepMask.mul(u('slope', 'autoRockStrength')).clamp(0, 1),
    ));
    const lip = steepMask.mul(steepMask.oneMinus()).mul(4)
      .mul(clamp(normalWorldGeometry.y, 0, 1))
      .mul(u('slope', 'edgeHighlight'));
    groundColor.mulAssign(mix(vec3(1), vec3(1.22, 1.15, 1.03), lip));

    const shoreDistance = abs(positionWorld.y.sub(sceneUniforms.uSceneGroundWaterLevel));
    const shoreMask = smoothstep(
      u('shoreline', 'bandWidth'),
      u('shoreline', 'bandWidth').add(u('shoreline', 'softness')),
      shoreDistance,
    ).oneMinus().mul(steepMask.oneMinus()).toVar();
    groundColor.assign(mix(
      groundColor,
      layerNodes[3],
      shoreMask.mul(u('shoreline', 'autoSandStrength')).clamp(0, 1),
    ));
    const shoreWetMask = shoreWetMaskNode();
    groundColor.mulAssign(
      vec3(1).sub(shoreWetMask.mul(u('shoreline', 'wetBandDarkening'))),
    );

    const macroPrimary = worldFbm2(positionWorld.xz.mul(u('macro', 'scale')));
    const macroSecondary = worldFbm2(
      positionWorld.xz.mul(u('macro', 'secondaryScale')).add(vec2(37.2, 11.9)),
    );
    const macroDelta = macroPrimary.sub(0.5).mul(u('macro', 'amount'))
      .add(macroSecondary.sub(0.5).mul(u('macro', 'secondaryAmount')))
      .mul(detailRetention);
    groundColor.mulAssign(vec3(1).add(macroDelta));
    groundColor.assign(mix(
      groundColor,
      groundColor.mul(u('macro', 'tint')),
      macroPrimary.mul(u('macro', 'tintStrength')).mul(detailRetention).clamp(0, 1),
    ));

    const luminance = dot(groundColor, vec3(0.2126, 0.7152, 0.0722));
    groundColor.assign(mix(vec3(luminance), groundColor, u('layers', 'saturation')));
    groundColor.assign(
      groundColor.sub(0.5).mul(u('layers', 'contrast')).add(0.5)
        .add(u('layers', 'brightness')),
    );
    const microOcclusion = slopeValue.mul(0.55)
      .add(macroSecondary.oneMinus().mul(0.45))
      .mul(u('material', 'microOcclusionStrength'));
    groundColor.mulAssign(vec3(1).sub(microOcclusion.clamp(0, 0.75)));

    const wetness = currentWetnessNode().toVar();
    const wetLuminance = dot(groundColor, vec3(0.2126, 0.7152, 0.0722));
    groundColor.assign(mix(
      groundColor,
      vec3(wetLuminance),
      wetness.mul(u('weatherResponse', 'wetDesaturation')),
    ));
    groundColor.mulAssign(
      vec3(1).sub(wetness.mul(u('weatherResponse', 'wetDarkening'))),
    );

    const snowSlope = smoothstep(
      u('weatherResponse', 'snowSlopeStart'),
      u('weatherResponse', 'snowSlopeStart').add(max(u('weatherResponse', 'snowSoftness'), 0.001)),
      normalWorldGeometry.y,
    );
    const snowMask = sceneUniforms.uSceneGroundSnowCover
      .mul(u('weatherResponse', 'snowStrength'))
      .mul(snowSlope)
      .clamp(0, 1);
    groundColor.assign(mix(groundColor, u('weatherResponse', 'snowTint'), snowMask));

    const normal = normalize(normalWorldGeometry);
    const direct = clamp(dot(normal, normalize(sceneUniforms.uSceneGroundSunDirection)), 0, 1);
    const shade = smoothstep(0.06, 0.72, direct).oneMinus().toVar();
    const shadowColor = groundColor.mul(mix(
      vec3(1),
      u('lighting', 'shadowTint'),
      u('lighting', 'shadowTintStrength'),
    ));
    const liftedShadow = mix(
      shadowColor,
      groundColor.mul(0.82).add(sceneUniforms.uSceneGroundSkyColor.mul(0.18)),
      u('lighting', 'shadowLift'),
    );
    groundColor.assign(mix(groundColor, liftedShadow, shade));
    groundColor.assign(mix(
      groundColor,
      groundColor.mul(sceneUniforms.uSceneGroundSunColor),
      direct.mul(u('lighting', 'sunTintStrength')),
    ));
    groundColor.addAssign(
      sceneUniforms.uSceneGroundSkyColor
        .mul(shade)
        .mul(u('lighting', 'skyFillStrength'))
        .mul(groundColor),
    );
    const viewDirection = normalize(cameraPosition.sub(positionWorld));
    const rim = clamp(dot(normal, viewDirection), 0, 1).oneMinus().mul(u('lighting', 'rimStrength'));
    groundColor.assign(mix(groundColor, sceneUniforms.uSceneGroundSkyColor, rim.clamp(0, 1)));
    const effectiveRoughness = mix(
      u('material', 'roughness'),
      u('weatherResponse', 'wetRoughness'),
      currentWetnessNode(),
    );
    const halfVector = normalize(
      normalize(sceneUniforms.uSceneGroundSunDirection).add(viewDirection),
    );
    const specularPower = mix(128, 4, effectiveRoughness);
    const specularAmount = pow(
      clamp(dot(normal, halfVector), 0, 1),
      specularPower,
    ).mul(mix(0.04, 1, u('material', 'metalness')));
    const specularColor = mix(
      sceneUniforms.uSceneGroundSunColor,
      groundColor.mul(sceneUniforms.uSceneGroundSunColor),
      u('material', 'metalness'),
    );
    groundColor.addAssign(specularColor.mul(specularAmount));
    groundColor.addAssign(
      groundColor.mul(u('material', 'emissiveStrength')),
    );

    groundColor.assign(mix(
      groundColor,
      u('distance', 'color'),
      distanceMask.mul(u('distance', 'strength')).clamp(0, 1),
    ));

    return groundColor.clamp(0, 4);
    })();
    material.needsUpdate = true;
  }

  function applySettings(next) {
    resolvedSettings = createGroundShaderSettings(next);
    for (const [groupId, fields] of Object.entries(GROUND_SHADER_FIELD_SCHEMA)) {
      for (const [key, field] of Object.entries(fields)) {
        setUniformValue(styleUniforms[field.uniform], resolvedSettings[groupId][key]);
      }
    }
    material.userData.toonlabGroundShader.settings = cloneSettings(resolvedSettings);
    return cloneSettings(resolvedSettings);
  }

  function setSceneState({
    snowCover,
    sunColor,
    sunDirection,
    skyColor,
    waterLevel,
    wetness,
  } = {}) {
    if (Number.isFinite(Number(snowCover))) {
      sceneUniforms.uSceneGroundSnowCover.value = THREE.MathUtils.clamp(Number(snowCover), 0, 1);
    }
    if (sunColor !== undefined) sceneUniforms.uSceneGroundSunColor.value.set(sunColor);
    if (Array.isArray(sunDirection) && sunDirection.length >= 3) {
      sceneUniforms.uSceneGroundSunDirection.value.set(...sunDirection).normalize();
    } else if (sunDirection?.isVector3) {
      sceneUniforms.uSceneGroundSunDirection.value.copy(sunDirection).normalize();
    }
    if (skyColor !== undefined) sceneUniforms.uSceneGroundSkyColor.value.set(skyColor);
    if (Number.isFinite(Number(waterLevel))) {
      sceneUniforms.uSceneGroundWaterLevel.value = Number(waterLevel);
    }
    if (Number.isFinite(Number(wetness))) {
      sceneUniforms.uSceneGroundWetness.value = THREE.MathUtils.clamp(Number(wetness), 0, 1);
    }
  }

  material.userData.toonlabGroundShader = {
    applySettings,
    refreshSplat() {
      splatTexture.needsUpdate = true;
    },
    sceneUniforms,
    settings: cloneSettings(resolvedSettings),
    setLayerTexture(index, map) {
      if (index < 0 || index > 3) return;
      layerTextures[index] = configureLayerTexture(map);
      rebuildNodes();
    },
    setSceneState,
    splatTexture,
    styleUniforms,
    version: GROUND_SHADER_SCHEMA_VERSION,
  };

  rebuildNodes();
  return material;
}

/** Applies a Ground Shader profile only to explicitly compatible materials. */
export function applyCompatibilityGroundShader(target, profile = {}) {
  const settings = createGroundShaderSettings(profile);
  const materials = collectMaterials(target);
  const report = {
    applied: 0,
    matched: 0,
    skipped: 0,
    visited: materials.size,
    writes: 0,
  };
  for (const material of materials) {
    const adapter = material.userData?.toonlabGroundShader;
    if (!adapter || adapter.version !== GROUND_SHADER_SCHEMA_VERSION) {
      report.skipped += 1;
      continue;
    }
    report.matched += 1;
    adapter.applySettings(settings);
    report.applied += 1;
    report.writes += Object.values(GROUND_SHADER_FIELD_SCHEMA)
      .reduce((count, fields) => count + Object.keys(fields).length, 0);
  }
  return report;
}

/** Updates current scene inputs without modifying the portable profile. */
export function setCompatibilityGroundShaderSceneState(target, state = {}) {
  const materials = collectMaterials(target);
  let updated = 0;
  for (const material of materials) {
    const adapter = material.userData?.toonlabGroundShader;
    if (!adapter || adapter.version !== GROUND_SHADER_SCHEMA_VERSION) continue;
    adapter.setSceneState(state);
    updated += 1;
  }
  return updated;
}

export function disposeCompatibilityGroundShaderMaterial(material) {
  material?.userData?.toonlabGroundShader?.splatTexture?.dispose?.();
  material?.dispose?.();
}
