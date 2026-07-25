// Runtime loader for the Unity-authoritative M_Demonstration_Mega export.
//
// The GLB deliberately contains neutral carrier materials. This module uses
// the canonical material index stored in `material.userData.unityMaterial` to
// reconstruct Unity inputs from scene-manifest.json. Shader-family builders
// are kept separate so the scene dispatcher remains the single routing point.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  attribute,
  clamp,
  float,
  modelWorldMatrix,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import {
  loadUnityMountainMaterial,
  loadUnityRockMaterial,
} from '../rockgen/reference/unityRockMaterial.js';
import {
  indexSoStylizedUnityMaterialProperties,
  loadSoStylizedUnitySceneTexture,
  readSoStylizedUnityScalar,
  readSoStylizedUnityVector,
} from './soStylizedUnitySceneRecords.js';
import {
  buildSoStylizedUnitySceneFoliageMaterial,
  isSoStylizedUnitySceneFoliageRecord,
} from './soStylizedUnitySceneFoliageMaterials.js';
import {
  buildSoStylizedUnitySceneTreeMaterial,
  isSoStylizedUnitySceneTreeMaterialRecord,
} from './soStylizedUnitySceneTreeMaterials.js';
import {
  buildSoStylizedUnitySceneSkyFamilyMaterial,
  isSoStylizedUnitySceneSkyFamilyRecord,
} from './soStylizedUnitySceneSkyMaterials.js';
import {
  buildSoStylizedUnitySceneBasicMaterial,
  isSoStylizedUnitySceneBasicMaterialRecord,
} from './soStylizedUnitySceneBasicMaterials.js';
import {
  buildSoStylizedUnitySceneWaterFamilyMaterial,
  isSoStylizedUnitySceneWaterFamilyRecord,
  SO_STYLIZED_UNITY_SCENE_WATERFALL_SHADER,
} from './soStylizedUnitySceneWaterMaterials.js';
import { createSoStylizedUnityPassCouplingReport } from './soStylizedUnityMaterialPassCoupling.js';
import { resolveSoStylizedUnityShadowCasterPass } from './soStylizedUnityShadows.js';
import { installSoStylizedUnityUrpLighting } from './soStylizedUnityUrpLighting.js';
import {
  applySoStylizedUnityTerrainNativeAuthority,
  loadSoStylizedUnityTerrainNativeAuthority,
} from './soStylizedUnityTerrainNativeAuthority.js';

export {
  indexSoStylizedUnityMaterialProperties,
  loadSoStylizedUnitySceneTexture,
  readSoStylizedUnityScalar,
  readSoStylizedUnityTextureIndex,
  readSoStylizedUnityVector,
} from './soStylizedUnitySceneRecords.js';

export const DEFAULT_SO_STYLIZED_UNITY_MEGA_BASE_URL =
  '/assets-local/sostylized-unity/mega-scene';
export const DEFAULT_SO_STYLIZED_UNITY_ROCK_BASE_URL =
  '/assets-local/sostylized-unity';

let rockLibraryPromise = null;

function joinUrl(baseUrl, relativePath) {
  if (/^(?:data:|blob:|https?:\/\/|\/\/)/i.test(String(relativePath))) {
    return String(relativePath);
  }
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

function firstProperty(properties, names) {
  for (const name of names) {
    const property = properties.get(name);
    if (property) return property;
  }
  return null;
}

/**
 * Conservative carrier replacement used only until a family-specific Shader
 * Graph builder is connected. It consumes exact texture/color/PBR inputs and
 * labels itself partial so the UI cannot mistake it for a completed port.
 */
async function buildUnityPartialFallbackMaterial(record, manifest, options) {
  const properties = indexSoStylizedUnityMaterialProperties(record);
  const textureProperty = firstProperty(properties, [
    '_BaseMap',
    '_Base_Texture',
    '_Base_Color',
    '_Diffuse_Texture',
    '_Foliage_Texture',
    '_Basic_Color_Texture',
    '_Leaf_Texture',
    '_MainTex',
  ]);
  const sourceMap = textureProperty?.texture >= 0
    ? await loadSoStylizedUnitySceneTexture(manifest, textureProperty.texture, options)
    : null;
  const tintProperty = firstProperty(properties, [
    '_BaseColor',
    '_Color',
    '_Main_Color',
    '_Texture_Tint',
    '_Tint_Color',
    '_Rock_Tint',
  ]);
  const tint = Array.isArray(tintProperty?.value)
    ? tintProperty.value
    : [1, 1, 1, 1];
  const sourceUv = textureProperty
    ? uv().mul(vec2(...(textureProperty.textureScale ?? [1, 1])))
      .add(vec2(...(textureProperty.textureOffset ?? [0, 0])))
    : uv();
  const sampled = sourceMap ? texture(sourceMap).sample(sourceUv) : null;
  const colorNode = sampled
    ? sampled.rgb.mul(vec3(...tint.slice(0, 3)))
    : vec3(...tint.slice(0, 3));
  const smoothness = readSoStylizedUnityScalar(properties, '_Smoothness', 0);
  const metallic = readSoStylizedUnityScalar(
    properties,
    '_Metallic',
    readSoStylizedUnityScalar(properties, '_RockMetallic', 0),
  );
  const specular = readSoStylizedUnityVector(
    properties,
    '_Specular_Color',
    readSoStylizedUnityVector(properties, '_SpecColor', [0.04, 0.04, 0.04, 1]),
  );
  const specularStrength = readSoStylizedUnityScalar(properties, '_Specular', 1);
  const emissiveStrength = readSoStylizedUnityScalar(properties, '_Emissive_Strength', 0);
  const isSpecularWorkflow = /(?:Leaves|Bark|Foliage|Water)/.test(record.shaderName ?? '');

  const material = new MeshPhysicalNodeMaterial();
  material.name = `UnityPartial:${record.name}`;
  material.colorNode = colorNode;
  material.emissiveNode = colorNode.mul(emissiveStrength);
  material.metalnessNode = float(isSpecularWorkflow ? 0 : metallic);
  material.roughnessNode = clamp(float(1 - smoothness), 0, 1);
  material.specularColorNode = vec3(...specular.slice(0, 3)).mul(specularStrength);
  material.specularIntensityNode = float(1);
  material.side = /(?:Leaves|Foliage|Snow|Water|Cloud|Sky)/.test(record.shaderName ?? '')
    ? THREE.DoubleSide
    : THREE.FrontSide;
  material.depthWrite = !/(?:Cloud|Water)/.test(record.shaderName ?? '');
  const alphaClip = readSoStylizedUnityScalar(
    properties,
    '_Alpha_Clip',
    readSoStylizedUnityScalar(properties, '_Alpha_Clip_Threshold', 0),
  );
  if (sampled && alphaClip > 0) {
    const alphaNode = /Leaves|Foliage/.test(record.shaderName ?? '')
      ? sampled.r
      : sampled.a;
    const alphaMask = alphaNode.greaterThanEqual(alphaClip);
    material.opacityNode = alphaNode;
    material.maskNode = alphaMask;
    material.maskShadowNode = alphaMask;
  }
  material.userData.soStylizedUnityMaterial = {
    exactInputs: true,
    materialIndex: record.index,
    reconstruction: 'partial-family-fallback',
    sourceMaterial: record.name,
    sourceShader: record.shaderName,
  };
  installSoStylizedUnityUrpLighting(material, {
    workflow: isSpecularWorkflow ? 'specular' : 'metallic',
  });
  return material;
}

async function loadRockLibrary(baseUrl) {
  if (!rockLibraryPromise) {
    rockLibraryPromise = fetch(joinUrl(baseUrl, 'rock-material-library.json'), {
      cache: 'no-cache',
    }).then((response) => {
      if (!response.ok) throw new Error(`Unity rock library unavailable (${response.status}).`);
      return response.json();
    }).catch((error) => {
      rockLibraryPromise = null;
      throw error;
    });
  }
  return rockLibraryPromise;
}

/** Build one Unity material from the canonical exported manifest record. */
export async function buildSoStylizedUnityMegaMaterial(record, manifest, {
  baseUrl = DEFAULT_SO_STYLIZED_UNITY_MEGA_BASE_URL,
  geometry = null,
  geometryHints = null,
  rockBaseUrl = DEFAULT_SO_STYLIZED_UNITY_ROCK_BASE_URL,
  state = null,
  textureLoader = undefined,
} = {}) {
  if (!record) throw new TypeError('A Unity material record is required.');
  const options = { baseUrl, ...(textureLoader ? { textureLoader } : {}) };
  const capabilities = {
    hasTangents: Boolean(geometry?.getAttribute?.('tangent')),
    hasUv2: Boolean(geometry?.getAttribute?.('uv2')),
    hasVertexColors: Boolean(geometry?.getAttribute?.('color')),
  };
  if (record.shaderName === 'Shader Graphs/S_Rock') {
    const rockLibrary = await loadRockLibrary(rockBaseUrl);
    const material = await loadUnityRockMaterial({
      manifest: rockLibrary,
      material: record.name,
      baseUrl: rockBaseUrl,
      coordinates: { zSign: -1, distanceScale: 1 },
      name: `Unity:${record.name}`,
      textureFlipY: true,
    });
    material.userData.soStylizedUnityMaterial = {
      exactInputs: true,
      graphExact: true,
      materialIndex: record.index,
      sourceMaterial: record.name,
      sourceShader: record.shaderName,
    };
    return material;
  }
  if (record.shaderName === 'Shader Graphs/S_Mountain') {
    const rockLibrary = await loadRockLibrary(rockBaseUrl);
    const material = await loadUnityMountainMaterial({
      manifest: rockLibrary,
      material: record.name,
      baseUrl: rockBaseUrl,
      coordinates: { zSign: -1, flipProceduralUvY: false },
      name: `Unity:${record.name}`,
      textureFlipY: true,
    });
    material.userData.soStylizedUnityMaterial = {
      exactInputs: true,
      graphExact: true,
      materialIndex: record.index,
      sourceMaterial: record.name,
      sourceShader: record.shaderName,
    };
    return material;
  }
  if (isSoStylizedUnitySceneFoliageRecord(record)) {
    return buildSoStylizedUnitySceneFoliageMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  if (isSoStylizedUnitySceneTreeMaterialRecord(record)) {
    return buildSoStylizedUnitySceneTreeMaterial(record, {
      ...options,
      coordinateZSign: -1,
      geometryCapabilities: capabilities,
      state,
      textureRecords: manifest.textures,
    });
  }
  if (isSoStylizedUnitySceneSkyFamilyRecord(record)) {
    return buildSoStylizedUnitySceneSkyFamilyMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  if (isSoStylizedUnitySceneBasicMaterialRecord(record)) {
    return buildSoStylizedUnitySceneBasicMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  if (isSoStylizedUnitySceneWaterFamilyRecord(record)) {
    return buildSoStylizedUnitySceneWaterFamilyMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  return buildUnityPartialFallbackMaterial(record, manifest, options);
}

function normalizeMaterialArray(material) {
  return Array.isArray(material) ? material : [material];
}

function sourceUnityMaterialIndex(material) {
  return Number(
    material?.userData?.unityMaterial
      ?? material?.userData?.soStylizedUnityMaterial?.materialIndex,
  );
}

function materialVariantKey(materialIndex, geometry, geometryHints, manifest) {
  const rendererBounds = manifest?.materials?.[materialIndex]?.shaderName
    === SO_STYLIZED_UNITY_SCENE_WATERFALL_SHADER
    ? geometryHints?.rendererBoundsSize?.join(',') ?? 'missing-renderer-bounds'
    : 'shared-bounds';
  return [
    materialIndex,
    geometry?.getAttribute?.('color') ? 'color' : 'no-color',
    geometry?.getAttribute?.('tangent') ? 'tangent' : 'no-tangent',
    geometry?.getAttribute?.('uv2') ? 'uv2' : 'no-uv2',
    geometry?.getAttribute?.('iUnityObjectPosition')
      ? 'instance-object-position'
      : 'model-object-position',
    rendererBounds,
  ].join(':');
}

function materialGeometryHints(object, manifest) {
  const result = {};
  if (object?.geometry?.getAttribute?.('iUnityObjectPosition')) {
    result.objectPositionNode = modelWorldMatrix
      .mul(vec4(attribute('iUnityObjectPosition', 'vec3'), 1))
      .xyz;
  }
  let owner = object;
  while (owner) {
    const index = Number(owner.userData?.unityNode);
    const renderer = Number.isInteger(index) && index >= 0
      ? manifest?.nodes?.[index]?.renderer
      : null;
    if (String(renderer?.type ?? '').trim()) {
      if (Array.isArray(renderer.boundsSize) && renderer.boundsSize.length >= 3) {
        result.rendererBoundsSize = renderer.boundsSize.slice(0, 3).map(Number);
      }
      break;
    }
    owner = owner.parent;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Replace every neutral GLB carrier with its canonical Unity material. */
export async function applySoStylizedUnityMegaMaterials(root, manifest, options = {}) {
  const carriers = new Map();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    for (const material of normalizeMaterialArray(object.material)) {
      const index = sourceUnityMaterialIndex(material);
      if (!Number.isInteger(index) || index < 0) continue;
      const geometryHints = materialGeometryHints(object, manifest);
      const key = materialVariantKey(index, object.geometry, geometryHints, manifest);
      if (!carriers.has(key)) carriers.set(key, {
        geometryHints,
        index,
        object,
      });
    }
  });

  const replacements = new Map(await Promise.all([...carriers].map(async ([key, usage]) => [
    key,
    await buildSoStylizedUnityMegaMaterial(
      manifest.materials[usage.index],
      manifest,
      {
        ...options,
        geometry: usage.object.geometry,
        geometryHints: {
          ...(options.geometryHints ?? {}),
          ...(usage.geometryHints ?? {}),
        },
      },
    ),
  ])));
  const unresolved = [];
  let meshCount = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    meshCount += 1;
    const source = normalizeMaterialArray(object.material);
    const next = source.map((carrier) => {
      const index = sourceUnityMaterialIndex(carrier);
      const geometryHints = materialGeometryHints(object, manifest);
      const key = materialVariantKey(
        index,
        object.geometry,
        geometryHints,
        manifest,
      );
      const replacement = replacements.get(key);
      if (!replacement) unresolved.push({ materialIndex: index, object: object.name });
      return replacement ?? carrier;
    });
    object.material = Array.isArray(object.material) ? next : next[0];
  });
  const passCoupling = createSoStylizedUnityPassCouplingReport(root);
  return {
    materialCount: replacements.size,
    meshCount,
    passCoupling,
    sourceMaterialCount: new Set([...carriers.values()].map((usage) => usage.index)).size,
    unresolved,
  };
}

function traverseOwnedUnityRendererMeshes(object, callback) {
  const visit = (child, isOwner = false) => {
    if (!isOwner && Number.isInteger(Number(child.userData?.unityNode))) return;
    if (child.isMesh) callback(child);
    for (const descendant of child.children ?? []) visit(descendant);
  };
  visit(object, true);
}

function resolveRendererShadowCasterPass(renderer, manifest) {
  const materials = (renderer.materialIndices ?? []).map((materialIndex) => {
    const shader = manifest.materials?.[materialIndex]?.shaderName ?? null;
    return {
      materialIndex,
      pass: resolveSoStylizedUnityShadowCasterPass(shader),
      shader,
    };
  });
  return {
    exact: materials.every((material) => material.pass !== null),
    // Preserve the renderer flag for unknown third-party shaders. Audited
    // source shaders with pass=false are suppressed exactly.
    hasPass: materials.some((material) => material.pass !== false),
    materials,
  };
}

/** Apply exported object/renderer visibility and shadow flags to scene 0. */
export function applySoStylizedUnityMegaRendererState(root, manifest) {
  const objects = new Map();
  root.traverse((object) => {
    const index = Number(object.userData?.unityNode);
    if (Number.isInteger(index) && index >= 0) objects.set(index, object);
  });
  let casterRendererCount = 0;
  let receiverRendererCount = 0;
  let rendererCount = 0;
  let rendererMeshCount = 0;
  let selfShadowRendererCount = 0;
  let shadowCastingModeRendererCount = 0;
  let skippedEmptyRendererRecordCount = 0;
  let rendererWithoutShadowCasterPassCount = 0;
  for (const record of manifest.nodes ?? []) {
    const object = objects.get(record.index);
    if (!object) continue;
    object.visible = record.activeInHierarchy !== false;
    // Unity JsonUtility materializes a default RendererRecord object for the
    // 360 scene nodes that have no Renderer component. Its empty `type` is the
    // authoritative discriminator; treating `enabled:false` on that placeholder
    // as real used to hide whole parent subtrees and erase their shadow flags.
    if (!String(record.renderer?.type ?? '').trim()) {
      if (record.renderer) skippedEmptyRendererRecordCount += 1;
      continue;
    }
    rendererCount += 1;
    const enabled = record.renderer.enabled !== false
      && record.renderer.forceRenderingOff !== true;
    const shadowCastingMode = String(
      record.renderer.shadowCastingMode ?? 'On',
    );
    const castingModeEnabled = enabled && !/^Off$/i.test(shadowCastingMode);
    const casterPass = resolveRendererShadowCasterPass(record.renderer, manifest);
    const castsShadow = castingModeEnabled && casterPass.hasPass;
    const receivesShadow = enabled && record.renderer.receiveShadows !== false;
    const shadowsOnly = /^ShadowsOnly$/i.test(shadowCastingMode);
    const sourceBoundsCenter = Array.isArray(record.renderer.boundsCenter)
      && record.renderer.boundsCenter.length >= 3
      ? [
          Number(record.renderer.boundsCenter[0]),
          Number(record.renderer.boundsCenter[1]),
          -Number(record.renderer.boundsCenter[2]),
        ]
      : null;
    const sourceBoundsSize = Array.isArray(record.renderer.boundsSize)
      && record.renderer.boundsSize.length >= 3
      ? record.renderer.boundsSize.slice(0, 3).map(Number)
      : null;
    object.visible = object.visible && enabled && !shadowsOnly;
    if (castingModeEnabled) shadowCastingModeRendererCount += 1;
    if (castingModeEnabled && !casterPass.hasPass) {
      rendererWithoutShadowCasterPassCount += 1;
    }
    if (castsShadow) casterRendererCount += 1;
    if (receivesShadow) receiverRendererCount += 1;
    if (castsShadow && receivesShadow) selfShadowRendererCount += 1;
    const rendererMetadata = {
      castsShadow,
      enabled,
      node: record.index,
      receivesShadow,
      shadowCasterPass: casterPass,
      selfShadowEligible: castsShadow && receivesShadow,
      shadowCastingMode,
      sourceBoundsCenter,
      sourceBoundsSize,
      sourceType: record.renderer.type,
    };
    object.userData.soStylizedUnityRenderer = rendererMetadata;
    traverseOwnedUnityRendererMeshes(object, (child) => {
      rendererMeshCount += 1;
      child.castShadow = castsShadow;
      child.receiveShadow = receivesShadow;
      child.frustumCulled = true;
      child.userData.soStylizedUnityRenderer = { ...rendererMetadata };
    });
  }
  root.userData.soStylizedUnityNodeObjects = objects;
  const report = {
    casterRendererCount,
    objectCount: objects.size,
    receiverRendererCount,
    rendererCount,
    rendererMeshCount,
    rendererWithoutShadowCasterPassCount,
    selfShadowRendererCount,
    shadowCastingModeRendererCount,
    skippedEmptyRendererRecordCount,
  };
  root.userData.soStylizedUnityRendererState = report;
  return report;
}

/** Reflect a Unity-space position into the GLB/Three right-handed basis. */
export function reflectSoStylizedUnityMegaPosition(source, target = new THREE.Vector3()) {
  if (!Array.isArray(source) || source.length < 3) {
    throw new TypeError('Unity position must be a three-component array.');
  }
  return target.set(Number(source[0]), Number(source[1]), -Number(source[2]));
}

/** Reflect a Unity quaternion across Z; q and -q remain equivalent rotations. */
export function reflectSoStylizedUnityMegaQuaternion(source, target = new THREE.Quaternion()) {
  if (!Array.isArray(source) || source.length < 4) {
    throw new TypeError('Unity quaternion must be a four-component array.');
  }
  return target.set(
    -Number(source[0]),
    -Number(source[1]),
    Number(source[2]),
    Number(source[3]),
  ).normalize();
}

/** Apply every portable projection field from one exported Unity camera. */
export function applySoStylizedUnityMegaCameraRecord(
  camera,
  cameraRecord,
  { aspect = cameraRecord?.aspect } = {},
) {
  if (!camera || !cameraRecord) {
    throw new TypeError('A Three camera and exported Unity camera record are required.');
  }
  const near = Number(cameraRecord.nearClipPlane);
  const far = Number(cameraRecord.farClipPlane);
  if (!(near > 0) || !(far > near)) {
    throw new RangeError(`Invalid Unity camera clip range ${near}..${far}.`);
  }
  camera.near = near;
  camera.far = far;
  camera.zoom = 1;
  if (cameraRecord.orthographic) {
    if (!camera.isOrthographicCamera) {
      throw new TypeError('Unity orthographic camera record requires a Three OrthographicCamera.');
    }
    const halfHeight = Number(cameraRecord.orthographicSize);
    const resolvedAspect = Number(aspect);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * resolvedAspect;
    camera.right = halfHeight * resolvedAspect;
  } else {
    if (!camera.isPerspectiveCamera) {
      throw new TypeError('Unity perspective camera record requires a Three PerspectiveCamera.');
    }
    camera.fov = Number(cameraRecord.fieldOfView);
    camera.aspect = Number(aspect);
    camera.filmGauge = Number(cameraRecord.sensorSize?.[0]) || camera.filmGauge;
    camera.filmOffset = 0;
    camera.clearViewOffset?.();
  }
  camera.updateProjectionMatrix();
  camera.userData.soStylizedUnityCamera = {
    allowDynamicResolution: cameraRecord.allowDynamicResolution,
    allowHDR: cameraRecord.allowHDR,
    allowMSAA: cameraRecord.allowMSAA,
    aspect: Number(aspect),
    cameraIndex: cameraRecord.index,
    coordinateReflection: 'worldPosition.z reflected; quaternion=(-x,-y,z,w)',
    farClipPlane: far,
    fieldOfView: cameraRecord.fieldOfView,
    gateFit: cameraRecord.gateFit,
    nearClipPlane: near,
    node: cameraRecord.node,
    orthographic: cameraRecord.orthographic,
    sourceAspect: cameraRecord.aspect,
    useOcclusionCulling: cameraRecord.useOcclusionCulling,
  };
  return camera;
}

/** Compute one Unity LODGroup screen-height equation in reflected world space. */
export function calculateSoStylizedUnityMegaLodSelection(
  groupObject,
  groupRecord,
  camera,
  { lodBias = 1 } = {},
) {
  if (!groupObject || !groupRecord || !camera) {
    throw new TypeError('LOD selection requires a group object, record, and camera.');
  }
  const resolvedLodBias = Number(lodBias);
  if (!(resolvedLodBias > 0)) throw new RangeError('Unity LOD bias must be positive.');
  const localReferencePoint = reflectSoStylizedUnityMegaPosition(
    groupRecord.localReferencePoint ?? [0, 0, 0],
  );
  const referenceWorld = groupObject.localToWorld(localReferencePoint.clone());
  const cameraWorld = camera.getWorldPosition(new THREE.Vector3());
  const worldScale = groupObject.getWorldScale(new THREE.Vector3());
  const worldSize = Number(groupRecord.size)
    * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
  let distance = 0;
  let screenRelativeMetric = 0;
  let relativeHeight = 0;
  if (camera.isOrthographicCamera) {
    screenRelativeMetric = Math.max((camera.top - camera.bottom) / camera.zoom, 1e-6)
      / resolvedLodBias;
    relativeHeight = worldSize / screenRelativeMetric;
  } else if (camera.isPerspectiveCamera) {
    distance = Math.max(referenceWorld.distanceTo(cameraWorld), 1e-6);
    screenRelativeMetric = (2 * Math.tan(
      THREE.MathUtils.degToRad(camera.fov) * 0.5,
    )) / resolvedLodBias;
    relativeHeight = worldSize / (distance * screenRelativeMetric);
  } else {
    throw new TypeError('Unity LOD selection supports perspective or orthographic cameras.');
  }
  let selectedLevel = -1;
  for (let index = 0; index < (groupRecord.lods ?? []).length; index += 1) {
    if (relativeHeight >= Number(groupRecord.lods[index].screenRelativeTransitionHeight)) {
      selectedLevel = index;
      break;
    }
  }
  return {
    coordinateReflection: 'localReferencePoint.z = -unityLocalReferencePoint.z',
    distance,
    localReferencePoint: localReferencePoint.toArray(),
    referenceWorld: referenceWorld.toArray(),
    relativeHeight,
    screenRelativeMetric,
    selectedLevel,
    worldSize,
  };
}

/**
 * Update all 802 exported Unity LODGroups and publish equation coverage.
 * Unity 6000.5's SRP implementation uses world size divided by Euclidean
 * camera distance and `2*tan(verticalFov/2)/lodBias`; orthographic cameras use
 * vertical span/lodBias. All supplied groups use FadeMode.None.
 */
export function updateSoStylizedUnityMegaLods(
  root,
  manifest,
  camera,
  { lodBias = 1 } = {},
) {
  const objects = root.userData.soStylizedUnityNodeObjects;
  if (!(objects instanceof Map)) {
    return {
      culledGroups: 0,
      evaluatedGroups: 0,
      groups: 0,
      missingGroupObjects: 0,
      missingRendererBindings: 0,
      selectedGroups: 0,
      selectionHash: '00000000',
      visibleRenderers: 0,
    };
  }
  const groups = manifest.lodGroups ?? [];
  const rendererVisibility = new Map();
  const selectedRendererNodes = new Set();
  let evaluatedGroups = 0;
  let selectedGroups = 0;
  let culledGroups = 0;
  let missingGroupObjects = 0;
  let missingRendererBindings = 0;
  let selectionHash = 2166136261 >>> 0;
  const selections = [];

  for (const group of groups) {
    const groupObject = objects.get(group.node);
    if (!groupObject) {
      missingGroupObjects += 1;
      continue;
    }
    if (group.enabled === false) continue;
    const selection = calculateSoStylizedUnityMegaLodSelection(
      groupObject,
      group,
      camera,
      { lodBias },
    );
    evaluatedGroups += 1;
    if (selection.selectedLevel >= 0) selectedGroups += 1;
    else culledGroups += 1;
    selectionHash ^= Number(group.index) >>> 0;
    selectionHash = Math.imul(selectionHash, 16777619) >>> 0;
    selectionHash ^= (selection.selectedLevel + 1) >>> 0;
    selectionHash = Math.imul(selectionHash, 16777619) >>> 0;
    selections.push({
      groupIndex: group.index,
      node: group.node,
      referenceWorld: selection.referenceWorld,
      relativeHeight: selection.relativeHeight,
      selectedLevel: selection.selectedLevel,
      worldSize: selection.worldSize,
    });

    const selectedNodes = new Set(
      selection.selectedLevel >= 0
        ? (group.lods[selection.selectedLevel]?.rendererNodes ?? [])
          .filter((node) => Number.isInteger(node) && node >= 0)
        : [],
    );
    for (const lod of group.lods ?? []) {
      for (const rendererNode of lod.rendererNodes ?? []) {
        if (!Number.isInteger(rendererNode) || rendererNode < 0) continue;
        if (!objects.has(rendererNode)) missingRendererBindings += 1;
        const visible = selectedNodes.has(rendererNode);
        rendererVisibility.set(
          rendererNode,
          Boolean(rendererVisibility.get(rendererNode)) || visible,
        );
        if (visible) selectedRendererNodes.add(rendererNode);
      }
    }
  }
  for (const [rendererNode, visible] of rendererVisibility) {
    const rendererObject = objects.get(rendererNode);
    if (!rendererObject) continue;
    const rendererState = rendererObject.userData?.soStylizedUnityRenderer;
    rendererObject.visible = visible && rendererState?.enabled !== false;
  }
  const report = {
    coordinateReflection: 'LODGroup.localReferencePoint.z reflected before localToWorld',
    culledGroups,
    evaluatedGroups,
    groups: groups.length,
    lodBias: Number(lodBias),
    missingGroupObjects,
    missingRendererBindings,
    selectedGroups,
    selectionHash: selectionHash.toString(16).padStart(8, '0'),
    visibleRenderers: selectedRendererNodes.size,
  };
  root.userData.soStylizedUnityLods = { ...report, selections };
  return report;
}

/** Load the exact two-scene GLB and its authoritative sidecar manifest. */
export async function loadSoStylizedUnityMegaScene({
  baseUrl = DEFAULT_SO_STYLIZED_UNITY_MEGA_BASE_URL,
  gltfLoader = new GLTFLoader(),
} = {}) {
  const [manifestResponse, terrainNativeAuthority, gltf] = await Promise.all([
    fetch(joinUrl(baseUrl, 'scene-manifest.json'), { cache: 'no-cache' }),
    loadSoStylizedUnityTerrainNativeAuthority({ baseUrl }),
    gltfLoader.loadAsync(joinUrl(baseUrl, 'scene.glb')),
  ]);
  if (!manifestResponse.ok) {
    throw new Error(`Unity Mega manifest unavailable (${manifestResponse.status}).`);
  }
  const rawManifest = await manifestResponse.json();
  if (rawManifest.schema !== 'toonlab.sostylized-unity.scene-export') {
    throw new Error(`Unsupported Unity Mega scene schema: ${rawManifest.schema ?? 'missing'}.`);
  }
  const manifest = terrainNativeAuthority
    ? applySoStylizedUnityTerrainNativeAuthority(rawManifest, terrainNativeAuthority)
    : rawManifest;
  const root = gltf.scene;
  const prototypeLibrary = gltf.scenes[1];
  const rendererState = applySoStylizedUnityMegaRendererState(root, manifest);
  const cameraRecord = manifest.cameras?.[0];
  const camera = root.userData.soStylizedUnityNodeObjects?.get(cameraRecord?.node)
    ?? root.getObjectByName(cameraRecord?.name ?? 'Camera');
  if (camera && cameraRecord) {
    applySoStylizedUnityMegaCameraRecord(camera, cameraRecord);
    const cameraNode = manifest.nodes?.[cameraRecord.node];
    if (cameraNode) {
      camera.userData.soStylizedUnityCamera.expectedReflectedWorldPosition =
        reflectSoStylizedUnityMegaPosition(cameraNode.worldPosition).toArray();
      camera.userData.soStylizedUnityCamera.expectedReflectedWorldQuaternion =
        reflectSoStylizedUnityMegaQuaternion(cameraNode.worldRotation).toArray();
    }
  }
  return {
    camera,
    gltf,
    manifest,
    prototypeLibrary,
    rendererState,
    root,
    terrainNativeAuthority,
  };
}
