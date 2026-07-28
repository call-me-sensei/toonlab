// Repository-only loader for the ToonLab-authoritative EnvironmentReferenceScene export.
//
// The GLB deliberately contains neutral carrier materials. This module uses
// the canonical material index stored in `material.userData.toonLabMaterial` to
// reconstruct ToonLab inputs from scene-manifest.json. Shader-family builders
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
  loadToonLabMountainMaterial,
  loadToonRockMaterial,
} from '../../../../src/rock-shader/rockMaterial.js';
import {
  indexToonLabMaterialProperties,
  loadToonLabSceneTexture,
  readToonLabScalar,
  readToonLabVector,
} from '../../../../src/environment/toonLabSceneRecords.js';
import {
  buildToonLabSceneFoliageMaterial,
  isToonLabSceneFoliageRecord,
} from '../../../../src/environment/toonLabSceneFoliageMaterials.js';
import {
  buildToonLabSceneTreeMaterial,
  isToonLabSceneTreeMaterialRecord,
} from '../../../../src/environment/toonLabSceneTreeMaterials.js';
import {
  buildToonLabSceneSkyFamilyMaterial,
  isToonLabSceneSkyFamilyRecord,
} from '../../../../src/environment/toonLabSceneSkyMaterials.js';
import {
  buildToonLabSceneBasicMaterial,
  isToonLabSceneBasicMaterialRecord,
} from '../../../../src/environment/toonLabSceneBasicMaterials.js';
import {
  buildToonLabSceneWaterFamilyMaterial,
  isToonLabSceneWaterFamilyRecord,
  TOONLAB_SCENE_WATERFALL_SHADER,
} from '../../../../src/environment/toonLabSceneWaterMaterials.js';
import {
  createToonLabPassCouplingReport,
} from '../../../../src/environment/toonLabMaterialPassCoupling.js';
import {
  resolveToonLabShadowCasterPass,
} from '../../../../src/environment/toonLabShadows.js';
import {
  installToonLabSurfaceLighting,
} from '../../../../src/environment/toonLabSurfaceLighting.js';
import {
  applyToonLabTerrainNativeAuthority,
  loadToonLabTerrainNativeAuthority,
} from '../../../../src/environment/toonLabTerrainNativeAuthority.js';

export {
  indexToonLabMaterialProperties,
  loadToonLabSceneTexture,
  readToonLabScalar,
  readToonLabTextureIndex,
  readToonLabVector,
} from '../../../../src/environment/toonLabSceneRecords.js';

export const DEFAULT_ENVIRONMENT_REFERENCE_BASE_URL =
  '/assets-local/reference-environment/environment-scene';
export const DEFAULT_TOONLAB_ROCK_BASE_URL =
  '/assets-local/reference-environment';

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
async function buildToonLabPartialFallbackMaterial(record, manifest, options) {
  const properties = indexToonLabMaterialProperties(record);
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
    ? await loadToonLabSceneTexture(manifest, textureProperty.texture, options)
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
  const smoothness = readToonLabScalar(properties, '_Smoothness', 0);
  const metallic = readToonLabScalar(
    properties,
    '_Metallic',
    readToonLabScalar(properties, '_RockMetallic', 0),
  );
  const specular = readToonLabVector(
    properties,
    '_Specular_Color',
    readToonLabVector(properties, '_SpecColor', [0.04, 0.04, 0.04, 1]),
  );
  const specularStrength = readToonLabScalar(properties, '_Specular', 1);
  const emissiveStrength = readToonLabScalar(properties, '_Emissive_Strength', 0);
  const isSpecularWorkflow = /(?:Leaves|Bark|Foliage|Water)/.test(record.shaderName ?? '');

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLabPartial:${record.name}`;
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
  const alphaClip = readToonLabScalar(
    properties,
    '_Alpha_Clip',
    readToonLabScalar(properties, '_Alpha_Clip_Threshold', 0),
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
  material.userData.toonLabMaterial = {
    exactInputs: true,
    materialIndex: record.index,
    reconstruction: 'partial-family-fallback',
    sourceMaterial: record.name,
    sourceShader: record.shaderName,
  };
  installToonLabSurfaceLighting(material, {
    workflow: isSpecularWorkflow ? 'specular' : 'metallic',
  });
  return material;
}

async function loadRockLibrary(baseUrl) {
  if (!rockLibraryPromise) {
    rockLibraryPromise = fetch(joinUrl(baseUrl, 'rock-material-library.json'), {
      cache: 'no-cache',
    }).then((response) => {
      if (!response.ok) throw new Error(`ToonLab rock library unavailable (${response.status}).`);
      return response.json();
    }).catch((error) => {
      rockLibraryPromise = null;
      throw error;
    });
  }
  return rockLibraryPromise;
}

/** Build one ToonLab material from the canonical exported manifest record. */
export async function buildEnvironmentReferenceMaterial(record, manifest, {
  baseUrl = DEFAULT_ENVIRONMENT_REFERENCE_BASE_URL,
  geometry = null,
  geometryHints = null,
  rockBaseUrl = DEFAULT_TOONLAB_ROCK_BASE_URL,
  state = null,
  textureLoader = undefined,
} = {}) {
  if (!record) throw new TypeError('A ToonLab material record is required.');
  const options = { baseUrl, ...(textureLoader ? { textureLoader } : {}) };
  const capabilities = {
    hasTangents: Boolean(geometry?.getAttribute?.('tangent')),
    hasUv2: Boolean(geometry?.getAttribute?.('uv2')),
    hasVertexColors: Boolean(geometry?.getAttribute?.('color')),
  };
  if (record.shaderName === 'ToonLab Graphs/S_Rock') {
    const rockLibrary = await loadRockLibrary(rockBaseUrl);
    const material = await loadToonRockMaterial({
      manifest: rockLibrary,
      material: record.name,
      baseUrl: rockBaseUrl,
      coordinates: { zSign: -1, distanceScale: 1 },
      name: `ToonLab:${record.name}`,
      textureFlipY: true,
    });
    material.userData.toonLabMaterial = {
      exactInputs: true,
      graphExact: true,
      materialIndex: record.index,
      sourceMaterial: record.name,
      sourceShader: record.shaderName,
    };
    return material;
  }
  if (record.shaderName === 'ToonLab Graphs/S_Mountain') {
    const rockLibrary = await loadRockLibrary(rockBaseUrl);
    const material = await loadToonLabMountainMaterial({
      manifest: rockLibrary,
      material: record.name,
      baseUrl: rockBaseUrl,
      coordinates: { zSign: -1, flipProceduralUvY: false },
      name: `ToonLab:${record.name}`,
      textureFlipY: true,
    });
    material.userData.toonLabMaterial = {
      exactInputs: true,
      graphExact: true,
      materialIndex: record.index,
      sourceMaterial: record.name,
      sourceShader: record.shaderName,
    };
    return material;
  }
  if (isToonLabSceneFoliageRecord(record)) {
    return buildToonLabSceneFoliageMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  if (isToonLabSceneTreeMaterialRecord(record)) {
    return buildToonLabSceneTreeMaterial(record, {
      ...options,
      coordinateZSign: -1,
      geometryCapabilities: capabilities,
      state,
      textureRecords: manifest.textures,
    });
  }
  if (isToonLabSceneSkyFamilyRecord(record)) {
    return buildToonLabSceneSkyFamilyMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  if (isToonLabSceneBasicMaterialRecord(record)) {
    return buildToonLabSceneBasicMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  if (isToonLabSceneWaterFamilyRecord(record)) {
    return buildToonLabSceneWaterFamilyMaterial(record, manifest, {
      ...options,
      geometryHints: {
        ...capabilities,
        ...(geometryHints ?? {}),
      },
      state,
    });
  }
  return buildToonLabPartialFallbackMaterial(record, manifest, options);
}

function normalizeMaterialArray(material) {
  return Array.isArray(material) ? material : [material];
}

function sourceToonLabMaterialIndex(material) {
  return Number(
    material?.userData?.toonLabMaterial
      ?? material?.userData?.toonLabMaterial?.materialIndex,
  );
}

function materialVariantKey(materialIndex, geometry, geometryHints, manifest) {
  const rendererBounds = manifest?.materials?.[materialIndex]?.shaderName
    === TOONLAB_SCENE_WATERFALL_SHADER
    ? geometryHints?.rendererBoundsSize?.join(',') ?? 'missing-renderer-bounds'
    : 'shared-bounds';
  return [
    materialIndex,
    geometry?.getAttribute?.('color') ? 'color' : 'no-color',
    geometry?.getAttribute?.('tangent') ? 'tangent' : 'no-tangent',
    geometry?.getAttribute?.('uv2') ? 'uv2' : 'no-uv2',
    geometry?.getAttribute?.('iToonLabObjectPosition')
      ? 'instance-object-position'
      : 'model-object-position',
    rendererBounds,
  ].join(':');
}

function materialGeometryHints(object, manifest) {
  const result = {};
  if (object?.geometry?.getAttribute?.('iToonLabObjectPosition')) {
    result.objectPositionNode = modelWorldMatrix
      .mul(vec4(attribute('iToonLabObjectPosition', 'vec3'), 1))
      .xyz;
  }
  let owner = object;
  while (owner) {
    const index = Number(owner.userData?.toonLabNode);
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

/** Replace every neutral GLB carrier with its canonical ToonLab material. */
export async function applyEnvironmentReferenceMaterials(root, manifest, options = {}) {
  const carriers = new Map();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    for (const material of normalizeMaterialArray(object.material)) {
      const index = sourceToonLabMaterialIndex(material);
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
    await buildEnvironmentReferenceMaterial(
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
      const index = sourceToonLabMaterialIndex(carrier);
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
  const passCoupling = createToonLabPassCouplingReport(root);
  return {
    materialCount: replacements.size,
    meshCount,
    passCoupling,
    sourceMaterialCount: new Set([...carriers.values()].map((usage) => usage.index)).size,
    unresolved,
  };
}

function traverseOwnedToonLabRendererMeshes(object, callback) {
  const visit = (child, isOwner = false) => {
    if (!isOwner && Number.isInteger(Number(child.userData?.toonLabNode))) return;
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
      pass: resolveToonLabShadowCasterPass(shader),
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
export function applyEnvironmentReferenceRendererState(root, manifest) {
  const objects = new Map();
  root.traverse((object) => {
    const index = Number(object.userData?.toonLabNode);
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
    // ToonLab JsonUtility materializes a default RendererRecord object for the
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
    object.userData.toonLabRenderer = rendererMetadata;
    traverseOwnedToonLabRendererMeshes(object, (child) => {
      rendererMeshCount += 1;
      child.castShadow = castsShadow;
      child.receiveShadow = receivesShadow;
      child.frustumCulled = true;
      child.userData.toonLabRenderer = { ...rendererMetadata };
    });
  }
  root.userData.toonLabNodeObjects = objects;
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
  root.userData.toonLabRendererState = report;
  return report;
}

/** Reflect a ToonLab-space position into the GLB/Three right-handed basis. */
export function reflectEnvironmentReferencePosition(source, target = new THREE.Vector3()) {
  if (!Array.isArray(source) || source.length < 3) {
    throw new TypeError('ToonLab position must be a three-component array.');
  }
  return target.set(Number(source[0]), Number(source[1]), -Number(source[2]));
}

/** Reflect a ToonLab quaternion across Z; q and -q remain equivalent rotations. */
export function reflectEnvironmentReferenceQuaternion(source, target = new THREE.Quaternion()) {
  if (!Array.isArray(source) || source.length < 4) {
    throw new TypeError('ToonLab quaternion must be a four-component array.');
  }
  return target.set(
    -Number(source[0]),
    -Number(source[1]),
    Number(source[2]),
    Number(source[3]),
  ).normalize();
}

/** Apply every portable projection field from one exported ToonLab camera. */
export function applyEnvironmentReferenceCameraRecord(
  camera,
  cameraRecord,
  { aspect = cameraRecord?.aspect } = {},
) {
  if (!camera || !cameraRecord) {
    throw new TypeError('A Three camera and exported ToonLab camera record are required.');
  }
  const near = Number(cameraRecord.nearClipPlane);
  const far = Number(cameraRecord.farClipPlane);
  if (!(near > 0) || !(far > near)) {
    throw new RangeError(`Invalid ToonLab camera clip range ${near}..${far}.`);
  }
  camera.near = near;
  camera.far = far;
  camera.zoom = 1;
  if (cameraRecord.orthographic) {
    if (!camera.isOrthographicCamera) {
      throw new TypeError('ToonLab orthographic camera record requires a Three OrthographicCamera.');
    }
    const halfHeight = Number(cameraRecord.orthographicSize);
    const resolvedAspect = Number(aspect);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * resolvedAspect;
    camera.right = halfHeight * resolvedAspect;
  } else {
    if (!camera.isPerspectiveCamera) {
      throw new TypeError('ToonLab perspective camera record requires a Three PerspectiveCamera.');
    }
    camera.fov = Number(cameraRecord.fieldOfView);
    camera.aspect = Number(aspect);
    camera.filmGauge = Number(cameraRecord.sensorSize?.[0]) || camera.filmGauge;
    camera.filmOffset = 0;
    camera.clearViewOffset?.();
  }
  camera.updateProjectionMatrix();
  camera.userData.toonLabCamera = {
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

/** Compute one ToonLab LODGroup screen-height equation in reflected world space. */
export function calculateEnvironmentReferenceLodSelection(
  groupObject,
  groupRecord,
  camera,
  { lodBias = 1 } = {},
) {
  if (!groupObject || !groupRecord || !camera) {
    throw new TypeError('LOD selection requires a group object, record, and camera.');
  }
  const resolvedLodBias = Number(lodBias);
  if (!(resolvedLodBias > 0)) throw new RangeError('ToonLab LOD bias must be positive.');
  const localReferencePoint = reflectEnvironmentReferencePosition(
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
    throw new TypeError('ToonLab LOD selection supports perspective or orthographic cameras.');
  }
  let selectedLevel = -1;
  for (let index = 0; index < (groupRecord.lods ?? []).length; index += 1) {
    if (relativeHeight >= Number(groupRecord.lods[index].screenRelativeTransitionHeight)) {
      selectedLevel = index;
      break;
    }
  }
  return {
    coordinateReflection: 'localReferencePoint.z = -toonLabLocalReferencePoint.z',
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
 * Update all 802 exported ToonLab LODGroups and publish equation coverage.
 * ToonLab's render pipeline implementation uses world size divided by Euclidean
 * camera distance and `2*tan(verticalFov/2)/lodBias`; orthographic cameras use
 * vertical span/lodBias. All supplied groups use FadeMode.None.
 */
export function updateEnvironmentReferenceLods(
  root,
  manifest,
  camera,
  { lodBias = 1 } = {},
) {
  const objects = root.userData.toonLabNodeObjects;
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
    const selection = calculateEnvironmentReferenceLodSelection(
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
    const rendererState = rendererObject.userData?.toonLabRenderer;
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
  root.userData.toonLabLods = { ...report, selections };
  return report;
}

/** Load the exact two-scene GLB and its authoritative sidecar manifest. */
export async function loadEnvironmentReferenceScene({
  baseUrl = DEFAULT_ENVIRONMENT_REFERENCE_BASE_URL,
  gltfLoader = new GLTFLoader(),
} = {}) {
  const [manifestResponse, terrainNativeAuthority, gltf] = await Promise.all([
    fetch(joinUrl(baseUrl, 'scene-manifest.json'), { cache: 'no-cache' }),
    loadToonLabTerrainNativeAuthority({ baseUrl }),
    gltfLoader.loadAsync(joinUrl(baseUrl, 'scene.glb')),
  ]);
  if (!manifestResponse.ok) {
    throw new Error(`environment reference manifest unavailable (${manifestResponse.status}).`);
  }
  const rawManifest = await manifestResponse.json();
  if (rawManifest.schema !== 'toonlab.scene-export') {
    throw new Error(`Unsupported environment reference scene schema: ${rawManifest.schema ?? 'missing'}.`);
  }
  const manifest = terrainNativeAuthority
    ? applyToonLabTerrainNativeAuthority(rawManifest, terrainNativeAuthority)
    : rawManifest;
  const root = gltf.scene;
  const prototypeLibrary = gltf.scenes[1];
  const rendererState = applyEnvironmentReferenceRendererState(root, manifest);
  const cameraRecord = manifest.cameras?.[0];
  const camera = root.userData.toonLabNodeObjects?.get(cameraRecord?.node)
    ?? root.getObjectByName(cameraRecord?.name ?? 'Camera');
  if (camera && cameraRecord) {
    applyEnvironmentReferenceCameraRecord(camera, cameraRecord);
    const cameraNode = manifest.nodes?.[cameraRecord.node];
    if (cameraNode) {
      camera.userData.toonLabCamera.expectedReflectedWorldPosition =
        reflectEnvironmentReferencePosition(cameraNode.worldPosition).toArray();
      camera.userData.toonLabCamera.expectedReflectedWorldQuaternion =
        reflectEnvironmentReferenceQuaternion(cameraNode.worldRotation).toArray();
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
