import * as THREE from 'three';

import {
  createAnimeNodeMaterial,
  syncToonSceneLights,
  updateToonStorageSkinning,
} from '../shaders-tsl/anime.js';

// Node materials read scene lights from shared uniforms (see
// chunks/character-scene-lights.js) instead of three's classic light blocks;
// converted meshes mirror the light state right before they render. Both
// renderers invoke Object3D.onBeforeRender. Skinned meshes also refresh the
// storage-skinning bone buffer (WebGL2-backend path).
function toonNodeLightSync(renderer, scene, camera) {
  syncToonSceneLights(scene, camera);
  if (this.isSkinnedMesh) updateToonStorageSkinning(this);
}

import {
  alphaTestForMaterial,
  createAlphaSettings,
  DEFAULT_ALPHA_SETTINGS,
  materialAlphaDrawOrder,
  resolveAlphaForMaterial,
  sourceOpacity,
  usesAlphaBlend,
  usesAlphaCutout,
} from './settings/alphaSettings.js';
import {
  createAverageShadowSettings,
  DEFAULT_AVERAGE_SHADOW_SETTINGS,
  resolveAverageShadowForMaterial,
} from './settings/averageShadowSettings.js';
import {
  createBaseTextureSettings,
  getSourceMaterialColor,
  resolveBaseMapSaturation,
  resolveBaseMaterialColor,
} from './settings/baseTextureSettings.js';
import {
  CEL_SHADE_PRESETS,
  createCelShadeSettings,
  DEFAULT_CEL_SHADE_SETTINGS,
  REFERENCE_CEL_SHADE_SETTINGS,
} from './settings/celShadeSettings.js';
import {
  createContactShadowSettings,
  DEFAULT_CONTACT_SHADOW_SETTINGS,
  resolveContactShadowForMaterial,
} from './settings/contactShadowSettings.js';
import {
  createFurSettings,
  DEFAULT_FUR_SETTINGS,
  materialUsesFur,
} from './settings/furSettings.js';
import {
  createGlitterSettings,
  DEFAULT_GLITTER_SETTINGS,
  resolveGlitterForMaterial,
} from './settings/glitterSettings.js';
import {
  createPerspectiveRemovalSettings,
  DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS,
} from './settings/perspectiveRemovalSettings.js';
import {
  createStickerSettings,
  DEFAULT_STICKER_SETTINGS,
  resolveStickerForMaterial,
  STICKER_BLEND_MODES,
} from './settings/stickerSettings.js';
import {
  createFaceLightingSettings,
  DEFAULT_FACE_LIGHTING_SETTINGS,
  FACE_HEAD_SPACE_MODE_VALUES,
  FACE_HEAD_SPACE_MODES,
} from './settings/faceLightingSettings.js';
import {
  createEyeHighlightSettings,
  DEFAULT_EYE_HIGHLIGHT_SETTINGS,
  EYE_HIGHLIGHT_SOURCE_MASK_MODES,
  resolveEyeHighlightForMaterial,
} from './settings/eyeHighlightSettings.js';
import {
  createIndirectLightSettings,
  DEFAULT_INDIRECT_LIGHT_SETTINGS,
  resolveIndirectLightForMaterial,
} from './settings/indirectLightSettings.js';
import {
  createHairHighlightSettings,
  DEFAULT_HAIR_HIGHLIGHT_SETTINGS,
  HAIR_HIGHLIGHT_MASK_CHANNELS,
  HAIR_HIGHLIGHT_MODES,
  HAIR_HIGHLIGHT_MODE_VALUES,
  HAIR_HIGHLIGHT_SOURCE_MASK_MODES,
  resolveHairHighlightForMaterial,
} from './settings/hairHighlightSettings.js';
import {
  createLocalLightSettings,
  DEFAULT_LOCAL_LIGHT_SETTINGS,
  resolveLocalLightForMaterial,
} from './settings/localLightSettings.js';
import {
  collectMaterialMapTextures,
  createMaterialMapSettings,
  DEFAULT_MATERIAL_MAP_SETTINGS,
  resolveMaterialMapsForMaterial,
} from './settings/materialMapSettings.js';
import {
  createOutlineSettings,
  DEFAULT_OUTLINE_SETTINGS,
  resolveOutlineForMaterial,
} from './settings/outlineSettings.js';
import {
  createRimLightSettings,
  DEFAULT_RIM_LIGHT_SETTINGS,
  resolveRimLightForMaterial,
  RIM_LIGHT_MODES,
} from './settings/rimLightSettings.js';
import {
  createSpecularSettings,
  DEFAULT_SPECULAR_SETTINGS,
  resolveSpecularForMaterial,
} from './settings/specularSettings.js';
import {
  createSkinToneSettings,
  DEFAULT_SKIN_TONE_SETTINGS,
} from './settings/skinToneSettings.js';
import {
  createToonSettings,
} from './toonSettings.js';
import {
  createShadowColorSettings,
  DEFAULT_SHADOW_COLOR_SETTINGS,
  REFERENCE_SHADOW_COLOR_SETTINGS,
  SHADOW_COLOR_PRESETS,
} from './settings/shadowColorSettings.js';
import {
  createSceneShadowSettings,
  DEFAULT_SCENE_SHADOW_SETTINGS,
  resolveSceneShadowForMaterial,
} from './settings/sceneShadowSettings.js';
import {
  createSelfShadowSettings,
  DEFAULT_SELF_SHADOW_SETTINGS,
  resolveSelfShadowForMaterial,
  SELF_SHADOW_SOURCE_MODES,
} from './settings/selfShadowSettings.js';
import {
  classifyMaterialRole,
  MATERIAL_ROLES,
  normalizeMaterialRoleOverrides,
  roleIsEye,
  roleIsEyeHighlight,
  roleIsFace,
  roleIsHair,
  roleIsSkin,
  roleIsTransparentOverlay,
} from '../core/materialRoles.js';

export {
  alphaTestForMaterial,
  createAlphaSettings,
  DEFAULT_ALPHA_SETTINGS,
  resolveAlphaForMaterial,
  sourceOpacity,
  usesAlphaBlend,
  usesAlphaCutout,
} from './settings/alphaSettings.js';

export {
  createAverageShadowSettings,
  DEFAULT_AVERAGE_SHADOW_SETTINGS,
  resolveAverageShadowForMaterial,
} from './settings/averageShadowSettings.js';

export {
  BASE_TEXTURE_MATERIAL_COLOR_MODES,
  BASE_TEXTURE_SATURATION_MODES,
  createBaseTextureSettings,
  DEFAULT_BASE_TEXTURE_SETTINGS,
} from './settings/baseTextureSettings.js';

export {
  CEL_SHADE_PRESETS,
  createCelShadeSettings,
  DEFAULT_CEL_SHADE_SETTINGS,
  REFERENCE_CEL_SHADE_SETTINGS,
} from './settings/celShadeSettings.js';

export {
  createContactShadowSettings,
  DEFAULT_CONTACT_SHADOW_SETTINGS,
  resolveContactShadowForMaterial,
} from './settings/contactShadowSettings.js';

export {
  createFaceLightingSettings,
  DEFAULT_FACE_LIGHTING_SETTINGS,
  FACE_HEAD_SPACE_MODES,
} from './settings/faceLightingSettings.js';

export {
  createFurSettings,
  DEFAULT_FUR_SETTINGS,
  materialUsesFur,
} from './settings/furSettings.js';

export {
  createGlitterSettings,
  DEFAULT_GLITTER_SETTINGS,
  resolveGlitterForMaterial,
} from './settings/glitterSettings.js';

export {
  createPerspectiveRemovalSettings,
  DEFAULT_PERSPECTIVE_REMOVAL_SETTINGS,
} from './settings/perspectiveRemovalSettings.js';

export {
  createStickerSettings,
  DEFAULT_STICKER_SETTINGS,
  resolveStickerForMaterial,
  STICKER_BLEND_MODES,
} from './settings/stickerSettings.js';

export {
  createEyeHighlightSettings,
  DEFAULT_EYE_HIGHLIGHT_SETTINGS,
  EYE_HIGHLIGHT_MASK_CHANNELS,
  EYE_HIGHLIGHT_SOURCE_MASK_MODES,
  resolveEyeHighlightForMaterial,
} from './settings/eyeHighlightSettings.js';

export {
  createIndirectLightSettings,
  DEFAULT_INDIRECT_LIGHT_SETTINGS,
  resolveIndirectLightForMaterial,
} from './settings/indirectLightSettings.js';

export {
  createHairHighlightSettings,
  DEFAULT_HAIR_HIGHLIGHT_SETTINGS,
  HAIR_HIGHLIGHT_MASK_CHANNELS,
  HAIR_HIGHLIGHT_MODES,
  HAIR_HIGHLIGHT_MODE_VALUES,
  HAIR_HIGHLIGHT_SOURCE_MASK_MODES,
  resolveHairHighlightForMaterial,
} from './settings/hairHighlightSettings.js';

export {
  createLocalLightSettings,
  DEFAULT_LOCAL_LIGHT_SETTINGS,
  resolveLocalLightForMaterial,
} from './settings/localLightSettings.js';

export {
  createMaterialMapSettings,
  DEFAULT_MATERIAL_MAP_SETTINGS,
} from './settings/materialMapSettings.js';

export {
  createOutlineSettings,
  DEFAULT_OUTLINE_SETTINGS,
  resolveOutlineForMaterial,
} from './settings/outlineSettings.js';

export {
  createRimLightSettings,
  DEFAULT_RIM_LIGHT_SETTINGS,
  resolveRimLightForMaterial,
  RIM_LIGHT_MODES,
} from './settings/rimLightSettings.js';

export {
  createSpecularSettings,
  DEFAULT_SPECULAR_SETTINGS,
  resolveSpecularForMaterial,
  SPECULAR_DIRECTION_MODES,
  SPECULAR_MASK_CHANNELS,
  SPECULAR_SOURCE_MASK_MODES,
} from './settings/specularSettings.js';

export {
  createSkinToneSettings,
  DEFAULT_SKIN_TONE_SETTINGS,
} from './settings/skinToneSettings.js';

export {
  createShadowColorSettings,
  DEFAULT_SHADOW_COLOR_SETTINGS,
  REFERENCE_SHADOW_COLOR_SETTINGS,
  SHADOW_COLOR_PRESETS,
} from './settings/shadowColorSettings.js';

export {
  createSceneShadowSettings,
  DEFAULT_SCENE_SHADOW_SETTINGS,
  resolveSceneShadowForMaterial,
} from './settings/sceneShadowSettings.js';

export {
  createSelfShadowSettings,
  DEFAULT_SELF_SHADOW_SETTINGS,
  resolveSelfShadowForMaterial,
  SELF_SHADOW_SOURCE_MODES,
} from './settings/selfShadowSettings.js';

export {
  createToonPresetDocument,
  createToonSettings,
  getToonPresetDefinition,
  getToonPresetIds,
  getToonPresetMetadata,
  getToonPresetOptions,
  getToonSettingFieldSchema,
  getToonSettingGroupMetadata,
  normalizeToonPresetName,
  parseToonPresetDocument,
  registerToonPreset,
  registerSerializedToonPreset,
  sanitizeToonPresetSettings,
  serializeToonPreset,
  TOON_PRESET_DOCUMENT_TYPE,
  TOON_PRESET_IDS,
  TOON_PRESET_SCHEMA_VERSION,
  TOON_SETTING_DEFAULTS,
  TOON_SETTING_FIELD_SCHEMA,
  TOON_SETTING_GROUP_METADATA,
  TOON_SETTING_GROUPS,
  validateToonPresetDocument,
} from './toonSettings.js';

export {
  classifyMaterialRole,
  materialRoleName,
  materialRoleValue,
  MATERIAL_ROLE_LABELS,
  MATERIAL_ROLE_NAMES_BY_VALUE,
  MATERIAL_ROLES,
  normalizeMaterialRole,
  normalizeMaterialRoleOverrides,
  roleIsCatchlight,
  roleIsEye,
  roleIsEyeHighlight,
  roleIsIris,
  roleIsPupil,
  roleIsSclera,
} from '../core/materialRoles.js';

export const TOON_DEBUG_OUTPUT_MODES = Object.freeze({
  off: 0,
  final: 0,
  albedo: 1,
  sourceAlbedo: 8,
  rawAlbedo: 8,
  source: 8,
  raw: 8,
  band: 2,
  cel: 2,
  shadow: 3,
  sceneShadow: 3,
  selfShadow: 9,
  directVisibility: 10,
  averageShadow: 10,
  rim: 11,
  rimLight: 11,
  depthRim: 23,
  contactShadow: 24,
  specular: 12,
  specularArea: 12,
  specularMask: 12,
  hairHighlight: 13,
  eyeHighlight: 14,
  normalMap: 15,
  aoMap: 16,
  emissiveMap: 17,
  matcap: 18,
  ramp: 19,
  detailMap: 20,
  roughnessMap: 21,
  metalnessMap: 22,
  shadowColor: 4,
  lit: 5,
  lighting: 5,
  role: 6,
  alpha: 7,
});

export const TOON_DEBUG_OUTPUT_LABELS = Object.freeze({
  off: 'Off',
  albedo: 'Albedo',
  sourceAlbedo: 'Source Albedo',
  band: 'Cel Band',
  shadow: 'Scene Shadow',
  selfShadow: 'Self Shadow',
  directVisibility: 'Direct Visibility',
  rim: 'Rim Light',
  depthRim: 'Depth Rim',
  contactShadow: 'Contact Shadow',
  specular: 'Specular',
  hairHighlight: 'Hair Highlight',
  eyeHighlight: 'Eye Highlight',
  normalMap: 'Normal Map',
  aoMap: 'AO Map',
  emissiveMap: 'Emissive Map',
  matcap: 'MatCap',
  ramp: 'Ramp',
  detailMap: 'Detail Map',
  roughnessMap: 'Roughness Map',
  metalnessMap: 'Metalness Map',
  shadowColor: 'Shadow Color',
  lit: 'Lighting',
  role: 'Material Role',
  alpha: 'Alpha',
});

const fallbackWhiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
fallbackWhiteTexture.colorSpace = THREE.SRGBColorSpace;
fallbackWhiteTexture.needsUpdate = true;

const fallbackNormalTexture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
fallbackNormalTexture.colorSpace = THREE.NoColorSpace;
fallbackNormalTexture.needsUpdate = true;

const fallbackSkinTexture = new THREE.DataTexture(new Uint8Array([255, 222, 205, 255]), 1, 1);
fallbackSkinTexture.colorSpace = THREE.SRGBColorSpace;
fallbackSkinTexture.needsUpdate = true;

const COLOR_TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'matcap',
  'sheenColorMap',
  'specularColorMap',
];

const DATA_TEXTURE_KEYS = [
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
];

const TOON_DEBUG_MODE_ALIASES = Object.freeze({
  '': 'off',
  none: 'off',
  normal: 'off',
  final: 'off',
  off: 'off',
  albedo: 'albedo',
  base: 'albedo',
  basecolor: 'albedo',
  basemap: 'albedo',
  raw: 'sourceAlbedo',
  rawalbedo: 'sourceAlbedo',
  source: 'sourceAlbedo',
  sourcealbedo: 'sourceAlbedo',
  sourcebase: 'sourceAlbedo',
  sourcetexture: 'sourceAlbedo',
  band: 'band',
  cel: 'band',
  celband: 'band',
  shade: 'band',
  shadow: 'shadow',
  sceneshadow: 'shadow',
  shadowvisibility: 'shadow',
  visibility: 'shadow',
  self: 'selfShadow',
  selfshadow: 'selfShadow',
  charactershadow: 'selfShadow',
  characterselfshadow: 'selfShadow',
  averageshadow: 'directVisibility',
  direct: 'directVisibility',
  directvisibility: 'directVisibility',
  combinedvisibility: 'directVisibility',
  finalvisibility: 'directVisibility',
  lightvisibility: 'directVisibility',
  rim: 'rim',
  rimlight: 'rim',
  fresnel: 'rim',
  depthrim: 'depthRim',
  rimdepth: 'depthRim',
  screenrim: 'depthRim',
  contactshadow: 'contactShadow',
  depthshadow: 'contactShadow',
  hairshadow: 'contactShadow',
  spec: 'specular',
  specular: 'specular',
  speculararea: 'specular',
  specularmask: 'specular',
  highlight: 'specular',
  hair: 'hairHighlight',
  hairhighlight: 'hairHighlight',
  strand: 'hairHighlight',
  strandhighlight: 'hairHighlight',
  catchlight: 'eyeHighlight',
  eye: 'eyeHighlight',
  eyeglint: 'eyeHighlight',
  eyegloss: 'eyeHighlight',
  eyehighlight: 'eyeHighlight',
  eyeshine: 'eyeHighlight',
  normalmap: 'normalMap',
  materialnormal: 'normalMap',
  normaltexture: 'normalMap',
  ao: 'aoMap',
  aomap: 'aoMap',
  occlusion: 'aoMap',
  occlusionmap: 'aoMap',
  emissive: 'emissiveMap',
  emissivemap: 'emissiveMap',
  emission: 'emissiveMap',
  emissionmap: 'emissiveMap',
  matcap: 'matcap',
  matcapmap: 'matcap',
  ramp: 'ramp',
  rampmap: 'ramp',
  shaderamp: 'ramp',
  shaderampmap: 'ramp',
  gradient: 'ramp',
  gradientmap: 'ramp',
  detail: 'detailMap',
  detailmap: 'detailMap',
  roughness: 'roughnessMap',
  roughnessmap: 'roughnessMap',
  metalness: 'metalnessMap',
  metalnessmap: 'metalnessMap',
  metallic: 'metalnessMap',
  metallicmap: 'metalnessMap',
  shadowcolor: 'shadowColor',
  finalshadow: 'shadowColor',
  lit: 'lit',
  light: 'lit',
  lighting: 'lit',
  role: 'role',
  materialrole: 'role',
  material: 'role',
  alpha: 'alpha',
  opacity: 'alpha',
});

function normalizeToonDebugKey(value) {
  return String(value ?? 'off')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

export function resolveToonDebugOutputMode(value) {
  if (Number.isFinite(value)) {
    const numericValue = Math.round(value);
    const name = Object.entries(TOON_DEBUG_OUTPUT_MODES)
      .find(([key, mode]) => key in TOON_DEBUG_OUTPUT_LABELS && mode === numericValue)?.[0] ?? 'off';
    return {
      label: TOON_DEBUG_OUTPUT_LABELS[name] ?? TOON_DEBUG_OUTPUT_LABELS.off,
      name,
      value: TOON_DEBUG_OUTPUT_MODES[name] ?? 0,
    };
  }

  const key = normalizeToonDebugKey(value);
  const name = TOON_DEBUG_MODE_ALIASES[key] ?? 'off';
  return {
    label: TOON_DEBUG_OUTPUT_LABELS[name] ?? TOON_DEBUG_OUTPUT_LABELS.off,
    name,
    value: TOON_DEBUG_OUTPUT_MODES[name] ?? 0,
  };
}

function toMaterialArray(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

export function waitForTexture(texture) {
  if (!texture) return Promise.resolve(texture);
  if (texture.image && (texture.image.width || texture.image.videoWidth || texture.image.data)) {
    return Promise.resolve(texture);
  }

  if (Array.isArray(texture.readyCallbacks)) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(texture), 5000);
      texture.readyCallbacks.push(() => {
        window.clearTimeout(timer);
        resolve(texture);
      });
    });
  }

  return Promise.resolve(texture);
}

function collectTexturesFromMaterial(mat, textures) {
  for (const key of [...COLOR_TEXTURE_KEYS, ...DATA_TEXTURE_KEYS]) {
    if (mat?.[key]?.isTexture) textures.add(mat[key]);
  }
  for (const { texture } of collectMaterialMapTextures(mat)) {
    textures.add(texture);
  }
}

export function waitForObjectTextures(root) {
  const textures = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) collectTexturesFromMaterial(mat, textures);
  });
  return Promise.all([...textures].map(waitForTexture));
}

export function setObjectTextureColorSpaces(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) {
      for (const key of COLOR_TEXTURE_KEYS) {
        if (mat?.[key]?.isTexture) mat[key].colorSpace = THREE.SRGBColorSpace;
      }
      for (const key of DATA_TEXTURE_KEYS) {
        if (mat?.[key]?.isTexture) mat[key].colorSpace = THREE.NoColorSpace;
      }
      for (const { texture, colorSpace } of collectMaterialMapTextures(mat)) {
        texture.colorSpace = colorSpace;
      }
    }
  });
}

function ensureGeometryAttributes(geometry) {
  const position = geometry?.attributes?.position;
  if (!position) return;

  if (!geometry.attributes.normal) geometry.computeVertexNormals();

  if (!geometry.attributes.uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }

  if (!geometry.attributes.uv2) {
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());
  }
}

// Averages normals across position-duplicate vertices and stores the result as
// an outlineSmoothNormal attribute. The inverted-hull outline expands along
// these instead of the render normals, so hard-edged geometry (split vertices
// at creases — Rigify mannequin, arbitrary GLB props) keeps a closed hull
// instead of cracking open at every sharp edge. Smooth-shaded meshes (typical
// PMX characters) are detected and skipped, costing no extra memory.
function bakeSmoothedOutlineNormals(geometry) {
  const position = geometry?.attributes?.position;
  const normal = geometry?.attributes?.normal;
  if (!position || !normal || geometry.attributes.outlineSmoothNormal) {
    return Boolean(geometry?.attributes?.outlineSmoothNormal);
  }

  const groups = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const entry = groups.get(key);
    if (entry) entry.push(i);
    else groups.set(key, [i]);
  }

  let hasSplitNormals = false;
  const smoothed = new Float32Array(position.count * 3);
  for (const indices of groups.values()) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const index of indices) {
      x += normal.getX(index);
      y += normal.getY(index);
      z += normal.getZ(index);
    }
    const length = Math.sqrt(x * x + y * y + z * z) || 1;
    x /= length;
    y /= length;
    z /= length;
    for (const index of indices) {
      smoothed[index * 3] = x;
      smoothed[index * 3 + 1] = y;
      smoothed[index * 3 + 2] = z;
      if (!hasSplitNormals) {
        const dot = x * normal.getX(index) + y * normal.getY(index) + z * normal.getZ(index);
        if (dot < 0.999) hasSplitNormals = true;
      }
    }
  }

  if (!hasSplitNormals) return false;
  geometry.setAttribute('outlineSmoothNormal', new THREE.BufferAttribute(smoothed, 3));
  return true;
}

function materialDrawOrder(mat, materialRoleOverrides = null, alphaSettings = createAlphaSettings()) {
  const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
  return materialAlphaDrawOrder(alphaSettings, mat, roleInfo);
}

function promoteOverlayGroups(geometry, materials, materialRoleOverrides = null, alphaSettings = createAlphaSettings()) {
  if (!geometry?.groups?.length || !Array.isArray(materials)) return;
  geometry.groups = geometry.groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const aOrder = materialDrawOrder(materials[a.group.materialIndex], materialRoleOverrides, alphaSettings);
      const bOrder = materialDrawOrder(materials[b.group.materialIndex], materialRoleOverrides, alphaSettings);
      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ group }) => group);
}

function materialNumericSuffix(name) {
  const match = String(name ?? '').match(/^(.+?)[_\s-]*(\d{1,4})$/);
  if (!match) return null;

  const stem = match[1].replace(/[_\s-]+$/g, '').toLowerCase();
  const suffix = Number(match[2]);
  return stem && Number.isFinite(suffix) ? { stem, suffix } : null;
}

function anonymousMaterialIndex(name) {
  const normalized = String(name ?? '').trim().toLowerCase();
  if (normalized === 'material') return 0;

  const match = normalized.match(/^material[_\s-]+(\d{1,4})$/);
  if (!match) return null;

  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

function materialHasReadableGltfTextureName(mat) {
  const source = mat?.userData?.toonSource || {};
  const materialName = String(source.materialName || '').trim();
  const hasReadableMaterialName = materialName && anonymousMaterialIndex(materialName) === null;
  return Boolean(hasReadableMaterialName || source.textureName || source.imageName || source.imageUri);
}

function inferAnonymousGltfAtlasRoles(root, materialRoleOverrides, nextOverrides) {
  const groups = new Map();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    for (const mat of toMaterialArray(obj.material)) {
      if (!mat?.uuid || nextOverrides.byUuid.has(mat.uuid)) continue;

      const existingRole = classifyMaterialRole(mat, materialRoleOverrides);
      if (existingRole.role !== 'default') continue;

      const source = mat.userData?.toonSource || {};
      if (source.format !== 'gltf' || materialHasReadableGltfTextureName(mat)) continue;

      const materialIndex = anonymousMaterialIndex(mat.name);
      if (!Number.isInteger(materialIndex) || !Number.isInteger(source.imageIndex)) continue;

      const key = source.sourceUrl || 'anonymous-gltf';
      const group = groups.get(key) ?? {
        imageCount: source.imageCount ?? 0,
        materials: [],
        usedImages: new Set(),
      };
      group.imageCount = Math.max(group.imageCount, source.imageCount ?? 0);
      group.materials.push({ imageIndex: source.imageIndex, mat, materialIndex });
      group.usedImages.add(source.imageIndex);
      groups.set(key, group);
    }
  });

  for (const group of groups.values()) {
    if (group.imageCount < 3 || group.materials.length < 3) continue;
    if (!group.usedImages.has(0) || !group.usedImages.has(1) || !group.usedImages.has(2)) continue;

    for (const { imageIndex, mat } of group.materials) {
      let role = 'costume';
      if (imageIndex === 0) role = 'face';
      else if (imageIndex === 2) role = 'hair';

      if (mat.uuid && !nextOverrides.byUuid.has(mat.uuid)) {
        nextOverrides.byUuid.set(mat.uuid, role);
        nextOverrides.sourcesByUuid.set(mat.uuid, 'inferred:anonymous-gltf-atlas');
      }
    }
  }
}

function createInferredMaterialRoleOverrides(root, materialRoleOverrides, {
  inferAnonymousGltfAtlases = true,
  inferPackedTriplets = true,
} = {}) {
  const nextOverrides = {
    byName: new Map(materialRoleOverrides.byName),
    byUuid: new Map(materialRoleOverrides.byUuid),
    patterns: [...materialRoleOverrides.patterns],
    sourcesByUuid: new Map(materialRoleOverrides.sourcesByUuid ?? []),
  };

  const groups = new Map();

  if (inferPackedTriplets) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      for (const mat of toMaterialArray(obj.material)) {
        if (!mat?.uuid || nextOverrides.byUuid.has(mat.uuid)) continue;

        const existingRole = classifyMaterialRole(mat, materialRoleOverrides);
        if (existingRole.role !== 'default') continue;

        const suffixInfo = materialNumericSuffix(mat.name);
        if (!suffixInfo) continue;

        const group = groups.get(suffixInfo.stem) ?? new Map();
        group.set(suffixInfo.suffix, mat);
        groups.set(suffixInfo.stem, group);
      }
    });

    for (const group of groups.values()) {
      // Common packed game-model export pattern: body/face/hair materials lose
      // texture filenames in GLB but retain the source material numeric suffixes.
      const suffixRoles = [
        [81, 'skin'],
        [82, 'face'],
        [83, 'hair'],
      ];
      if (!suffixRoles.every(([suffix]) => group.has(suffix))) continue;

      for (const [suffix, role] of suffixRoles) {
        const mat = group.get(suffix);
        if (mat?.uuid && !nextOverrides.byUuid.has(mat.uuid)) {
          nextOverrides.byUuid.set(mat.uuid, role);
          nextOverrides.sourcesByUuid.set(mat.uuid, 'inferred:packed-triplet');
        }
      }
    }
  }

  if (inferAnonymousGltfAtlases) {
    inferAnonymousGltfAtlasRoles(root, materialRoleOverrides, nextOverrides);
  }

  return nextOverrides;
}

function addMaterialRoleSummaryEntry(summary, mat, roleInfo) {
  const role = roleInfo.role || 'default';
  summary.total += 1;
  summary.counts[role] = (summary.counts[role] ?? 0) + 1;
  if (summary.materials.length >= 120) return;

  const source = mat?.userData?.toonSource || {};
  summary.materials.push({
    imageIndex: Number.isInteger(source.imageIndex) ? source.imageIndex : null,
    materialIndex: Number.isInteger(source.materialIndex) ? source.materialIndex : null,
    name: mat?.name ?? '',
    role,
    source: roleInfo.source,
    texture: mat?.map?.name || source.imageName || source.imageUri || source.textureName || '',
  });
}

function colorFromUniformValue(value, fallback = new THREE.Color(1, 1, 1)) {
  return new THREE.Color(
    value?.r ?? value?.x ?? fallback.r,
    value?.g ?? value?.y ?? fallback.g,
    value?.b ?? value?.z ?? fallback.b,
  );
}

function vectorFromUniformValue(value, fallback = [0, 0, 1]) {
  return [
    value?.x ?? fallback[0],
    value?.y ?? fallback[1],
    value?.z ?? fallback[2],
  ];
}

function celShadeSettingsFromAnimeMaterial(mat) {
  return createCelShadeSettings({
    bodyCelMidPoint: mat?.uniforms?.celShadeMidPoint?.value,
    bodyCelSoftness: mat?.uniforms?.celShadeSoftness?.value,
    bodyMainLightIgnoreCelShade: mat?.uniforms?.mainLightIgnoreCelShade?.value,
    edgeAntiAliasStrength: mat?.uniforms?.edgeAntiAliasStrength?.value,
  });
}

function faceLightingSettingsFromAnimeMaterial(mat) {
  return createFaceLightingSettings({
    faceCelMidPoint: mat?.uniforms?.celShadeMidPointForFaceArea?.value,
    faceCelSoftness: mat?.uniforms?.celShadeSoftnessForFaceArea?.value,
    faceLocalLightLift: mat?.uniforms?.faceLocalLightLift?.value,
    faceMainLightIgnoreCelShade: mat?.uniforms?.mainLightIgnoreCelShadeForFaceArea?.value,
    faceNormalProxyBlend: mat?.uniforms?.faceNormalProxyBlend?.value,
    faceProxyNormal: vectorFromUniformValue(
      mat?.uniforms?.faceProxyNormalObject?.value,
      DEFAULT_FACE_LIGHTING_SETTINGS.faceProxyNormal,
    ),
    faceSceneShadowStrength: mat?.uniforms?.faceSceneShadowStrength?.value,
    faceSphereBlend: mat?.uniforms?.faceSphereBlend?.value,
    headSpaceMode: (mat?.uniforms?.faceHeadSpaceMode?.value ?? 1) === 0
      ? FACE_HEAD_SPACE_MODES.static
      : FACE_HEAD_SPACE_MODES.headBone,
  });
}

function shadowColorSettingsFromAnimeMaterial(mat) {
  return createShadowColorSettings({
    enabled: mat?.uniforms?.enableShadowColor?.value,
    lowSaturationFallbackColor: mat?.uniforms?.lowSaturationFallbackColor?.value,
    selfShadowAlbedoMulStrength: mat?.uniforms?.selfShadowAlbedoMulStrength?.value,
    selfShadowAreaHSVStrength: mat?.uniforms?.selfShadowAreaHSVStrength?.value,
    selfShadowAreaHueOffset: mat?.uniforms?.selfShadowAreaHueOffset?.value,
    selfShadowAreaSaturationBoost: mat?.uniforms?.selfShadowAreaSaturationBoost?.value,
    selfShadowAreaValueMul: mat?.uniforms?.selfShadowAreaValueMul?.value,
    selfShadowTintColor: mat?.uniforms?.selfShadowTintColor?.value,
    transitionAreaHueOffset: mat?.uniforms?.litToShadowTransitionAreaHueOffset?.value,
    transitionAreaIntensity: mat?.uniforms?.litToShadowTransitionAreaIntensity?.value,
    transitionAreaSaturationBoost: mat?.uniforms?.litToShadowTransitionAreaSaturationBoost?.value,
    transitionAreaTintColor: mat?.uniforms?.litToShadowTransitionAreaTintColor?.value,
    transitionAreaValueMul: mat?.uniforms?.litToShadowTransitionAreaValueMul?.value,
  });
}

function sceneShadowSettingsFromAnimeMaterial(mat) {
  const strength = mat?.uniforms?.receivedShadowStrength?.value;
  const minLight = mat?.uniforms?.receivedShadowMinLight?.value;
  return createSceneShadowSettings({
    defaultMinLight: minLight,
    defaultStrength: strength,
    eyeMinLight: minLight,
    eyeStrength: strength,
    faceMinLight: minLight,
    faceStrength: strength,
    shadowAreaStrength: mat?.uniforms?.receivedShadowAreaStrength?.value,
    skinMinLight: minLight,
    skinStrength: strength,
  });
}

function selfShadowSettingsFromAnimeMaterial(mat) {
  const strength = mat?.uniforms?.selfShadowStrength?.value;
  const minLight = mat?.uniforms?.selfShadowMinLight?.value;
  return createSelfShadowSettings({
    defaultMinLight: minLight,
    defaultStrength: strength,
    enabled: (mat?.uniforms?.selfShadowSourceMode?.value ?? 0) > 0,
    eyeMinLight: minLight,
    eyeStrength: strength,
    faceMinLight: minLight,
    faceStrength: strength,
    hairMinLight: minLight,
    hairStrength: strength,
    shadowAreaStrength: mat?.uniforms?.selfShadowAreaStrength?.value,
    skinMinLight: minLight,
    skinStrength: strength,
    sourceMode: mat?.uniforms?.selfShadowSourceMode?.value === SELF_SHADOW_SOURCE_MODES.sceneProxy
      ? 'sceneProxy'
      : 'off',
  });
}

function averageShadowSettingsFromAnimeMaterial(mat) {
  const strength = mat?.uniforms?.averageShadowStrength?.value;
  const minLight = mat?.uniforms?.averageShadowMinLight?.value;
  return createAverageShadowSettings({
    defaultMinLight: minLight,
    defaultStrength: strength,
    enabled: strength > 0,
    eyeMinLight: minLight,
    eyeStrength: strength,
    faceMinLight: minLight,
    faceStrength: strength,
    hairMinLight: minLight,
    hairStrength: strength,
    skinMinLight: minLight,
    skinStrength: strength,
    softness: mat?.uniforms?.averageShadowSoftness?.value,
  });
}

function skinToneSettingsFromAnimeMaterial(mat) {
  return createSkinToneSettings({
    faceMaxDirectLight: mat?.uniforms?.faceMaxDirectLight?.value,
    faceMinimumIndirectLight: mat?.uniforms?.faceMinimumIndirectLight?.value,
    faceShadowBrightness: mat?.uniforms?.faceShadowBrightness?.value,
    faceShadowSaturation: mat?.uniforms?.faceShadowSaturation?.value,
    faceShadowTint: colorFromUniformValue(
      mat?.uniforms?.faceShadowTintColor?.value,
      new THREE.Color(...DEFAULT_SKIN_TONE_SETTINGS.faceShadowTint),
    ),
    faceShadowTintStrength: mat?.uniforms?.overrideByFaceShadowTintColor?.value,
    skinMaxDirectLight: mat?.uniforms?.skinMaxDirectLight?.value,
    skinMinimumIndirectLight: mat?.uniforms?.skinMinimumIndirectLight?.value,
    skinShadowBrightness: mat?.uniforms?.skinShadowBrightness?.value,
    skinShadowSaturation: mat?.uniforms?.skinShadowSaturation?.value,
    skinShadowTint: colorFromUniformValue(
      mat?.uniforms?.skinShadowTintColor?.value,
      new THREE.Color(...DEFAULT_SKIN_TONE_SETTINGS.skinShadowTint),
    ),
    skinShadowTintStrength: mat?.uniforms?.overrideBySkinShadowTintColor?.value,
  });
}

function localLightSettingsFromAnimeMaterial(mat) {
  return createLocalLightSettings({
    defaultIntensity: mat?.uniforms?.localLightIntensity?.value,
    defaultMaxContribution: mat?.uniforms?.localLightMaxContribution?.value,
    defaultShadowLift: mat?.uniforms?.localLightShadowLift?.value,
    eyeIntensity: mat?.uniforms?.localLightIntensity?.value,
    eyeMaxContribution: mat?.uniforms?.localLightMaxContribution?.value,
    eyeShadowLift: mat?.uniforms?.localLightShadowLift?.value,
    faceIntensity: mat?.uniforms?.localLightIntensity?.value,
    faceMaxContribution: mat?.uniforms?.localLightMaxContribution?.value,
    faceShadowLift: mat?.uniforms?.localLightShadowLift?.value,
    hairIntensity: mat?.uniforms?.localLightIntensity?.value,
    hairMaxContribution: mat?.uniforms?.localLightMaxContribution?.value,
    hairShadowLift: mat?.uniforms?.localLightShadowLift?.value,
    skinIntensity: mat?.uniforms?.localLightIntensity?.value,
    skinMaxContribution: mat?.uniforms?.localLightMaxContribution?.value,
    skinShadowLift: mat?.uniforms?.localLightShadowLift?.value,
  });
}

function indirectLightSettingsFromAnimeMaterial(mat) {
  const intensity = mat?.uniforms?.indirectLightIntensity?.value;
  const minimumIndirectLight = mat?.uniforms?.minimumIndirectLight?.value;
  return createIndirectLightSettings({
    ambientTint: colorFromUniformValue(
      mat?.uniforms?.ambientTint?.value,
      new THREE.Color(...DEFAULT_INDIRECT_LIGHT_SETTINGS.ambientTint),
    ),
    defaultIntensity: intensity,
    defaultMinimumIndirectLight: minimumIndirectLight,
    environmentIndirectLight: mat?.uniforms?.environmentIndirectLight?.value,
    eyeIntensity: intensity,
    eyeMinimumIndirectLight: minimumIndirectLight,
    faceIntensity: intensity,
    faceMinimumIndirectLight: minimumIndirectLight,
    hairIntensity: intensity,
    hairMinimumIndirectLight: minimumIndirectLight,
    hemisphereLightIntensity: mat?.uniforms?.hemisphereLightIntensity?.value,
    skinIntensity: intensity,
    skinMinimumIndirectLight: minimumIndirectLight,
  });
}

function rimLightSettingsFromAnimeMaterial(mat) {
  return createRimLightSettings({
    blockByShadow: mat?.uniforms?.rimBlockByShadow?.value,
    defaultIntensity: mat?.uniforms?.rimIntensity?.value,
    depthCloseWidthReduce: mat?.uniforms?.rimDepthCloseWidthReduce?.value,
    depthDottedLineFix: mat?.uniforms?.rimDepthDottedLineFix?.value,
    depthFadeEndDistance: mat?.uniforms?.rimDepthFadeEndDistance?.value,
    depthFadeRange: mat?.uniforms?.rimDepthFadeRange?.value,
    depthFadeStartDistance: mat?.uniforms?.rimDepthFadeStartDistance?.value,
    depthMask3D: mat?.uniforms?.rimDepthMask3D?.value,
    depthSafeDistance: mat?.uniforms?.rimDepthSafeDistance?.value,
    depthThresholdOffset: mat?.uniforms?.rimDepthThresholdOffset?.value,
    depthWidth: mat?.uniforms?.rimDepthWidth?.value,
    mode: (mat?.uniforms?.rimLightMode?.value ?? 1) === 0
      ? RIM_LIGHT_MODES.fresnel
      : RIM_LIGHT_MODES.depthTexture,
    defaultTintColor: colorFromUniformValue(
      mat?.uniforms?.rimTintColor?.value,
      new THREE.Color(...DEFAULT_RIM_LIGHT_SETTINGS.defaultTintColor),
    ),
    eyeIntensity: mat?.uniforms?.rimIntensity?.value,
    faceIntensity: mat?.uniforms?.rimIntensity?.value,
    hairIntensity: mat?.uniforms?.rimIntensity?.value,
    midPoint: mat?.uniforms?.rimMidPoint?.value,
    mixWithBaseMapColor: mat?.uniforms?.rimMixWithBaseMapColor?.value,
    skinIntensity: mat?.uniforms?.rimIntensity?.value,
    softness: mat?.uniforms?.rimSoftness?.value,
  });
}

function specularSettingsFromAnimeMaterial(mat) {
  return createSpecularSettings({
    defaultColor: colorFromUniformValue(
      mat?.uniforms?.specularColor?.value,
      new THREE.Color(...DEFAULT_SPECULAR_SETTINGS.defaultColor),
    ),
    directionMode: (mat?.uniforms?.specularDirectionMode?.value ?? 0) === 1 ? 'view' : 'light',
    defaultIntensity: mat?.uniforms?.specularIntensity?.value,
    defaultMidPoint: mat?.uniforms?.specularAreaRemapMidPoint?.value,
    defaultPower: mat?.uniforms?.specularPower?.value,
    defaultRange: mat?.uniforms?.specularAreaRemapRange?.value,
    defaultShowInShadowArea: mat?.uniforms?.specularShowInShadowArea?.value,
    eyeIntensity: mat?.uniforms?.specularIntensity?.value,
    faceIntensity: mat?.uniforms?.specularIntensity?.value,
    hairIntensity: mat?.uniforms?.specularIntensity?.value,
    hairPower: mat?.uniforms?.specularPower?.value,
    maskChannel: mat?.uniforms?.specularMaskChannel?.value,
    maskStrength: mat?.uniforms?.specularMaskStrength?.value,
    metalIntensity: mat?.uniforms?.specularIntensity?.value,
    skinIntensity: mat?.uniforms?.specularIntensity?.value,
  });
}

function hairHighlightSettingsFromAnimeMaterial(mat) {
  return createHairHighlightSettings({
    direction: vectorFromUniformValue(
      mat?.uniforms?.hairHighlightDirection?.value,
      DEFAULT_HAIR_HIGHLIGHT_SETTINGS.direction,
    ),
    enabled: mat?.uniforms?.useHairHighlight?.value ?? true,
    intensity: mat?.uniforms?.hairHighlightIntensity?.value,
    maskChannel: mat?.uniforms?.hairHighlightMaskChannel?.value,
    maskMap: mat?.uniforms?.hairHighlightMaskMap?.value ?? null,
    maskStrength: mat?.uniforms?.hairHighlightMaskStrength?.value,
    mode: mat?.uniforms?.hairHighlightMode?.value === HAIR_HIGHLIGHT_MODE_VALUES.anisotropic
      ? HAIR_HIGHLIGHT_MODES.anisotropic
      : HAIR_HIGHLIGHT_MODES.legacy,
    shadowFloor: mat?.uniforms?.hairHighlightShadowFloor?.value,
    sideBandPower: mat?.uniforms?.hairHighlightSideBandPower?.value,
    strandPower: mat?.uniforms?.hairHighlightStrandPower?.value,
    uvBandAxis: mat?.uniforms?.hairHighlightUvBandAxis?.value,
    uvBandCenter: mat?.uniforms?.hairHighlightUvBandCenter?.value,
    uvBandHalfWidth: mat?.uniforms?.hairHighlightUvBandHalfWidth?.value,
  });
}

function eyeHighlightSettingsFromAnimeMaterial(mat) {
  return createEyeHighlightSettings({
    color: colorFromUniformValue(
      mat?.uniforms?.eyeHighlightColor?.value,
      new THREE.Color(...DEFAULT_EYE_HIGHLIGHT_SETTINGS.color),
    ),
    enabled: mat?.uniforms?.useEyeHighlight?.value ?? true,
    intensity: mat?.uniforms?.eyeHighlightIntensity?.value,
    maskChannel: mat?.uniforms?.eyeHighlightMaskChannel?.value,
    maskMap: mat?.uniforms?.eyeHighlightMaskMap?.value ?? null,
    maskStrength: mat?.uniforms?.eyeHighlightMaskStrength?.value,
    power: mat?.uniforms?.eyeHighlightPower?.value,
    showInShadowArea: mat?.uniforms?.eyeHighlightShowInShadowArea?.value,
  });
}

function sourceEyeHighlightMaskMap(mat, eyeHighlightSettings) {
  if (eyeHighlightSettings.sourceMaskMode !== EYE_HIGHLIGHT_SOURCE_MASK_MODES.source) return null;
  return mat?.userData?.toonEyeHighlightMaskMap ??
    mat?.userData?.eyeHighlightMaskMap ??
    mat?.userData?.toonCatchlightMaskMap ??
    mat?.userData?.catchlightMaskMap ??
    mat?.userData?.highlightMaskMap ??
    null;
}

function sourceHairHighlightMaskMap(mat, hairHighlightSettings) {
  if (hairHighlightSettings.sourceMaskMode !== HAIR_HIGHLIGHT_SOURCE_MASK_MODES.source) return null;
  return mat?.userData?.toonHairHighlightMaskMap ??
    mat?.userData?.hairHighlightMaskMap ??
    mat?.userData?.highlightMaskMap ??
    null;
}

function sourceSpecularMaskMap(mat, specularSettings) {
  if (specularSettings.sourceMaskMode !== 'source') return null;
  return mat?.userData?.toonSpecularMaskMap ??
    mat?.userData?.specularMaskMap ??
    mat?.specularIntensityMap ??
    mat?.specularMap ??
    mat?.specularColorMap ??
    null;
}

function createAnimeMaterial({
  alphaBlend = false,
  alphaTest = -1.0,
  averageShadowSettings = createAverageShadowSettings(),
  base = null,
  baseColor = new THREE.Color(1, 1, 1),
  baseMapSaturation = 1,
  celShadeSettings = createCelShadeSettings(),
  contactShadowSettings = createContactShadowSettings(),
  debugOutputMode = 0,
  depthWrite = null,
  eyeHighlightSettings = createEyeHighlightSettings(),
  faceLightingSettings = createFaceLightingSettings(),
  glitterSettings = createGlitterSettings(),
  hairHighlightSettings = createHairHighlightSettings(),
  isEye = false,
  isFace = false,
  isHair = false,
  isMetal = false,
  isOutline = false,
  isSkin = false,
  isTransparentOverlay = false,
  indirectLightSettings = createIndirectLightSettings(),
  localLightSettings = createLocalLightSettings(),
  perspectiveRemovalSettings = createPerspectiveRemovalSettings(),
  stickerSettings = createStickerSettings(),
  materialMaps = null,
  materialRole = MATERIAL_ROLES.default,
  opacity = 1,
  outlineSettings = createOutlineSettings(),
  rimLightSettings = createRimLightSettings(),
  sceneShadowSettings = createSceneShadowSettings(),
  selfShadowSettings = createSelfShadowSettings(),
  shadowColorSettings = createShadowColorSettings(),
  side = THREE.DoubleSide,
  sourceBaseColor = new THREE.Color(1, 1, 1),
  sourceMaterial = null,
  specularMask = null,
  specularSettings = createSpecularSettings(),
  hairHighlightMask = null,
  eyeHighlightMask = null,
  skinToneSettings = createSkinToneSettings(),
  transparent = false,
} = {}) {
  const resolvedMaterialMaps = materialMaps ?? resolveMaterialMapsForMaterial(createMaterialMapSettings(), sourceMaterial);
  const outline = isOutline
    ? resolveOutlineForMaterial(outlineSettings, {
      alphaTest,
      isEye,
      isFace,
      isHair,
      isMetal,
      isSkin,
      isTransparentOverlay,
    })
    : resolveOutlineForMaterial(createOutlineSettings(false));
  const averageShadow = resolveAverageShadowForMaterial(averageShadowSettings, { isEye, isFace, isHair, isSkin });
  const indirectLight = resolveIndirectLightForMaterial(indirectLightSettings, {
    faceMinimumIndirectLightFallback: skinToneSettings.faceMinimumIndirectLight,
    isEye,
    isFace,
    isHair,
    isSkin,
    skinMinimumIndirectLightFallback: skinToneSettings.skinMinimumIndirectLight,
  });
  const localLight = resolveLocalLightForMaterial(localLightSettings, { isEye, isFace, isHair, isSkin });
  const eyeHighlight = resolveEyeHighlightForMaterial(eyeHighlightSettings, {
    isEye,
    isOutline,
    maskMap: eyeHighlightMask,
  });
  const hairHighlight = resolveHairHighlightForMaterial(hairHighlightSettings, {
    isHair,
    isOutline,
    maskMap: hairHighlightMask,
    material: sourceMaterial,
  });
  const rimLight = resolveRimLightForMaterial(rimLightSettings, { isEye, isFace, isHair, isOutline, isSkin });
  const specular = resolveSpecularForMaterial(specularSettings, {
    isEye,
    isFace,
    isHair,
    isMetal,
    isOutline,
    isSkin,
    maskMap: specularMask,
  });
  const sceneShadow = resolveSceneShadowForMaterial(sceneShadowSettings, { isEye, isFace, isSkin });
  const selfShadow = resolveSelfShadowForMaterial(selfShadowSettings, { isEye, isFace, isHair, isSkin });
  const contactShadow = resolveContactShadowForMaterial(contactShadowSettings, { isEye, isFace, isOutline });
  const glitter = resolveGlitterForMaterial(glitterSettings, { isEye, isFace, isHair, isOutline, isSkin });
  const sticker = resolveStickerForMaterial(stickerSettings, { isOutline, sourceMaterial });

  // TSL backend: same resolved settings, node-material assembly. The
  // returned material exposes `.uniforms` under the GLSL names so every
  // adapter write-through below (and the settings panels) works unchanged.
  return createAnimeNodeMaterial({
    alphaBlend,
    alphaTest,
    averageShadow,
    averageShadowSettings,
    base,
    baseColor,
    baseMapSaturation,
    celShadeSettings,
    contactShadow,
    debugOutputMode,
    depthWrite,
    eyeHighlight,
    faceHeadSpaceModeValue: FACE_HEAD_SPACE_MODE_VALUES[faceLightingSettings.headSpaceMode] ?? 1,
    faceLightingSettings,
    glitter,
    hairHighlight,
    indirectLight,
    indirectLightSettings,
    isEye,
    isFace,
    isHair,
    isMetal,
    isOutline,
    isSkin,
    isTransparentOverlay,
    localLight,
    materialRole,
    opacity,
    outline,
    perspectiveRemovalSettings,
    resolvedMaterialMaps,
    rimLight,
    sceneShadow,
    sceneShadowSettings,
    selfShadow,
    selfShadowSettings,
    shadowColorSettings,
    side,
    skinToneSettings,
    sourceBaseColor,
    sourceMaterial,
    specular,
    sticker,
    transparent,
  });
}

function createAnimeMaterialFromOriginalMaterial(mat, {
  alphaSettings = createAlphaSettings(),
  averageShadowSettings = createAverageShadowSettings(),
  baseTextureSettings = createBaseTextureSettings(),
  celShadeSettings = createCelShadeSettings(),
  contactShadowSettings = createContactShadowSettings(),
  debugOutputMode = 0,
  eyeHighlightSettings = createEyeHighlightSettings(),
  faceLightingSettings = createFaceLightingSettings(),
  glitterSettings = createGlitterSettings(),
  hairHighlightSettings = createHairHighlightSettings(),
  indirectLightSettings = createIndirectLightSettings(),
  localLightSettings = createLocalLightSettings(),
  materialMapSettings = createMaterialMapSettings(),
  materialRoleOverrides = null,
  outlineSettings = createOutlineSettings(),
  perspectiveRemovalSettings = createPerspectiveRemovalSettings(),
  rimLightSettings = createRimLightSettings(),
  sceneShadowSettings = createSceneShadowSettings(),
  selfShadowSettings = createSelfShadowSettings(),
  shadowColorSettings = createShadowColorSettings(),
  specularSettings = createSpecularSettings(),
  skinToneSettings = createSkinToneSettings(),
  stickerSettings = createStickerSettings(),
} = {}) {
  const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
  const isSkin = roleIsSkin(roleInfo);
  const isFace = roleIsFace(roleInfo);
  const isEye = roleIsEye(roleInfo);
  const isHair = roleIsHair(roleInfo);
  const isMetal = Boolean(roleInfo?.isMetal);
  const isTransparentOverlay = roleIsTransparentOverlay(roleInfo);
  const alpha = resolveAlphaForMaterial(alphaSettings, mat, roleInfo);
  const sourceBaseColor = getSourceMaterialColor(mat);
  const eyeHighlightMask = sourceEyeHighlightMaskMap(mat, eyeHighlightSettings);
  const hairHighlightMask = sourceHairHighlightMaskMap(mat, hairHighlightSettings);
  const specularMask = sourceSpecularMaskMap(mat, specularSettings);
  const materialMaps = resolveMaterialMapsForMaterial(materialMapSettings, mat);
  const material = createAnimeMaterial({
    alphaBlend: alpha.alphaBlend,
    alphaTest: alpha.alphaTest,
    averageShadowSettings,
    base: mat?.map ?? (isSkin ? fallbackSkinTexture : null),
    baseColor: resolveBaseMaterialColor(mat, baseTextureSettings),
    baseMapSaturation: resolveBaseMapSaturation({ isFace, isSkin }, baseTextureSettings),
    celShadeSettings,
    contactShadowSettings,
    debugOutputMode,
    depthWrite: alpha.depthWrite,
    eyeHighlightSettings,
    faceLightingSettings,
    glitterSettings,
    hairHighlightSettings,
    isSkin,
    isFace,
    isEye,
    isHair,
    isMetal,
    indirectLightSettings,
    isTransparentOverlay,
    localLightSettings,
    materialMaps,
    materialRole: roleInfo.roleValue,
    opacity: alpha.opacity,
    outlineSettings,
    perspectiveRemovalSettings,
    rimLightSettings,
    stickerSettings,
    sceneShadowSettings,
    selfShadowSettings,
    shadowColorSettings,
    side: THREE.DoubleSide,
    sourceBaseColor,
    sourceMaterial: mat,
    eyeHighlightMask,
    hairHighlightMask,
    specularMask,
    specularSettings,
    skinToneSettings,
    transparent: alpha.transparent,
  });

  material.name = mat?.name ?? '';
  material.visible = mat?.visible ?? true;
  material.uniforms.ditherOpacity.value = alphaSettings.ditherOpacity ?? 1;
  material.userData.materialRole = roleInfo.role;
  material.userData.materialRoleLabel = roleInfo.roleLabel;
  material.userData.materialRoleSource = roleInfo.source;
  material.userData.sourceMaterialName = mat?.name ?? '';
  material.userData.sourceMaterialUuid = mat?.uuid ?? '';

  if (isEye || roleIsEyeHighlight(roleInfo)) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = roleIsEyeHighlight(roleInfo) ? -2 : -1;
    material.polygonOffsetUnits = roleIsEyeHighlight(roleInfo) ? -2 : -1;
  }

  return material;
}

function createDebugMaterial(mat, shaderMode, {
  alphaSettings = createAlphaSettings(),
  baseTextureSettings = createBaseTextureSettings(),
  materialRoleOverrides = null,
} = {}) {
  const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
  if (shaderMode === 'normal') {
    return new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  }

  const alpha = resolveAlphaForMaterial(alphaSettings, mat, roleInfo);
  const params = {
    alphaMap: mat?.alphaMap ?? null,
    alphaTest: alpha.alphaCutout ? alpha.alphaTest : mat?.alphaTest ?? 0,
    color: resolveBaseMaterialColor(mat, baseTextureSettings),
    map: mat?.map ?? null,
    opacity: alpha.opacity,
    side: THREE.DoubleSide,
    transparent: alpha.alphaBlend,
    depthWrite: alpha.depthWrite,
  };

  if (shaderMode === 'toon') return new THREE.MeshToonMaterial(params);
  return new THREE.MeshBasicMaterial(params);
}

function createBodyMaterial(mat, shaderMode, {
  alphaSettings = createAlphaSettings(),
  averageShadowSettings = createAverageShadowSettings(),
  baseTextureSettings = createBaseTextureSettings(),
  celShadeSettings = createCelShadeSettings(),
  contactShadowSettings = createContactShadowSettings(),
  debugOutputMode = 0,
  eyeHighlightSettings = createEyeHighlightSettings(),
  faceLightingSettings = createFaceLightingSettings(),
  glitterSettings = createGlitterSettings(),
  hairHighlightSettings = createHairHighlightSettings(),
  indirectLightSettings = createIndirectLightSettings(),
  localLightSettings = createLocalLightSettings(),
  materialMapSettings = createMaterialMapSettings(),
  materialRoleOverrides = null,
  outlineSettings = createOutlineSettings(),
  perspectiveRemovalSettings = createPerspectiveRemovalSettings(),
  rimLightSettings = createRimLightSettings(),
  sceneShadowSettings = createSceneShadowSettings(),
  selfShadowSettings = createSelfShadowSettings(),
  shadowColorSettings = createShadowColorSettings(),
  specularSettings = createSpecularSettings(),
  skinToneSettings = createSkinToneSettings(),
  stickerSettings = createStickerSettings(),
} = {}) {
  if (shaderMode === 'anime') {
    return createAnimeMaterialFromOriginalMaterial(mat, {
      alphaSettings,
      averageShadowSettings,
      baseTextureSettings,
      celShadeSettings,
      contactShadowSettings,
      debugOutputMode,
      eyeHighlightSettings,
      faceLightingSettings,
      glitterSettings,
      hairHighlightSettings,
      indirectLightSettings,
      localLightSettings,
      materialMapSettings,
      materialRoleOverrides,
      outlineSettings,
      perspectiveRemovalSettings,
      rimLightSettings,
      sceneShadowSettings,
      selfShadowSettings,
      shadowColorSettings,
      specularSettings,
      skinToneSettings,
      stickerSettings,
    });
  }
  return createDebugMaterial(mat, shaderMode, { alphaSettings, baseTextureSettings, materialRoleOverrides });
}

function createOutlineMaterialFromAnimeMaterial(mat, outlineSettings = createOutlineSettings()) {
  const materialRole = mat?.uniforms?.materialRole?.value ?? MATERIAL_ROLES.default;
  const isTransparentOverlay = [
    MATERIAL_ROLES.blush,
    MATERIAL_ROLES.catchlight,
    MATERIAL_ROLES.eyeHighlight,
    MATERIAL_ROLES.transparentOverlay,
  ].includes(materialRole);
  const material = createAnimeMaterial({
    alphaBlend: false,
    alphaTest: mat?.uniforms?.aCutoff?.value ?? 0.01,
    averageShadowSettings: averageShadowSettingsFromAnimeMaterial(mat),
    base: mat?.uniforms?.base?.value ?? fallbackWhiteTexture,
    baseColor: new THREE.Color(
      mat?.uniforms?.baseColor?.value?.x ?? 1,
      mat?.uniforms?.baseColor?.value?.y ?? 1,
      mat?.uniforms?.baseColor?.value?.z ?? 1,
    ),
    baseMapSaturation: mat?.uniforms?.baseMapSaturation?.value ?? 1,
    celShadeSettings: celShadeSettingsFromAnimeMaterial(mat),
    debugOutputMode: mat?.uniforms?.debugOutputMode?.value ?? 0,
    eyeHighlightSettings: eyeHighlightSettingsFromAnimeMaterial(mat),
    faceLightingSettings: faceLightingSettingsFromAnimeMaterial(mat),
    hairHighlightSettings: hairHighlightSettingsFromAnimeMaterial(mat),
    isOutline: true,
    isSkin: mat?.uniforms?.isSkin?.value ?? false,
    isFace: mat?.uniforms?.isFace?.value ?? false,
    isEye: mat?.uniforms?.isEye?.value ?? false,
    isHair: mat?.uniforms?.isHair?.value ?? false,
    isMetal: materialRole === MATERIAL_ROLES.metal,
    isTransparentOverlay,
    indirectLightSettings: indirectLightSettingsFromAnimeMaterial(mat),
    localLightSettings: localLightSettingsFromAnimeMaterial(mat),
    materialRole,
    opacity: 1,
    outlineSettings,
    perspectiveRemovalSettings: createPerspectiveRemovalSettings({
      amount: mat?.uniforms?.perspectiveRemovalAmount?.value,
      endHeight: mat?.uniforms?.perspectiveRemovalEndHeight?.value,
      radius: mat?.uniforms?.perspectiveRemovalRadius?.value,
      startHeight: mat?.uniforms?.perspectiveRemovalStartHeight?.value,
    }),
    rimLightSettings: rimLightSettingsFromAnimeMaterial(mat),
    sceneShadowSettings: sceneShadowSettingsFromAnimeMaterial(mat),
    selfShadowSettings: selfShadowSettingsFromAnimeMaterial(mat),
    shadowColorSettings: shadowColorSettingsFromAnimeMaterial(mat),
    side: THREE.BackSide,
    sourceBaseColor: new THREE.Color(
      mat?.uniforms?.sourceBaseColor?.value?.x ?? 1,
      mat?.uniforms?.sourceBaseColor?.value?.y ?? 1,
      mat?.uniforms?.sourceBaseColor?.value?.z ?? 1,
    ),
    sourceMaterial: {
      name: mat?.userData?.sourceMaterialName ?? mat?.name ?? '',
      uuid: mat?.userData?.sourceMaterialUuid ?? '',
      userData: mat?.userData ?? {},
    },
    eyeHighlightMask: mat?.uniforms?.eyeHighlightMaskMap?.value ?? null,
    hairHighlightMask: mat?.uniforms?.hairHighlightMaskMap?.value ?? null,
    specularMask: mat?.uniforms?.specularMaskMap?.value ?? null,
    specularSettings: specularSettingsFromAnimeMaterial(mat),
    skinToneSettings: skinToneSettingsFromAnimeMaterial(mat),
    transparent: false,
  });
  material.name = mat?.name ?? '';
  material.visible = Boolean(mat?.visible ?? true) && (material.uniforms?.outlineThickness?.value ?? 0) > 0;
  material.userData.materialRole = 'outline';
  material.userData.materialRoleLabel = 'Outline';
  material.userData.materialRoleSource = mat?.userData?.materialRoleSource ?? 'outline';
  return material;
}

export function setToonDebugOutput(root, debugOutputMode = 'off') {
  const resolved = resolveToonDebugOutputMode(debugOutputMode);
  root?.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) {
      if (!mat?.uniforms?.debugOutputMode) continue;
      mat.uniforms.debugOutputMode.value = resolved.value;
      if (resolved.value > 0 && !mat.defines?.TOON_DEBUG_VIEWS) {
        mat.defines = { ...mat.defines, TOON_DEBUG_VIEWS: 1 };
      }
      mat.needsUpdate = true;
    }
  });
  return resolved;
}

// Bayer screen-door fade for a whole character (1 = opaque, 0 = gone).
// Works with cutout, outlines, and depth writes; also freezes the screen-space
// depth effects while fading so they cannot sparkle against stale depth.
export function setToonDitherOpacity(target, opacity = 1) {
  const value = Math.min(1, Math.max(0, Number(opacity) ?? 1));
  let updatedMaterialCount = 0;

  const updateMaterial = (material) => {
    for (const mat of toMaterialArray(material)) {
      if (!mat?.uniforms?.ditherOpacity) continue;
      mat.uniforms.ditherOpacity.value = value;
      updatedMaterialCount += 1;
    }
  };

  if (target?.isMaterial || Array.isArray(target)) {
    updateMaterial(target);
  } else {
    target?.traverse?.((obj) => {
      if (!obj.isMesh || !obj.material) return;
      updateMaterial(obj.material);
    });
  }

  return updatedMaterialCount;
}

function copyUniformValue(uniform, value) {
  if (!uniform || value === undefined) return;
  const current = uniform.value;
  if (current?.isColor && value?.isColor && current.copy) {
    current.copy(value);
    return;
  }
  if (current?.isVector2 && value?.isVector2 && current.copy) {
    current.copy(value);
    return;
  }
  if (current?.isVector3 && value?.isVector3 && current.copy) {
    current.copy(value);
    return;
  }
  if (current?.isVector4 && value?.isVector4 && current.copy) {
    current.copy(value);
    return;
  }
  uniform.value = value?.clone ? value.clone() : value;
}

function setToonUniform(uniforms, name, value) {
  copyUniformValue(uniforms?.[name], value);
}

function textureOrNull(texture, fallbackTexture = fallbackWhiteTexture) {
  return texture?.isTexture && texture !== fallbackTexture ? texture : null;
}

function roleFlagsFromAnimeMaterial(mat) {
  const uniforms = mat?.uniforms || {};
  const materialRole = uniforms.materialRole?.value ?? MATERIAL_ROLES.default;
  return {
    isEye: Boolean(uniforms.isEye?.value),
    isFace: Boolean(uniforms.isFace?.value),
    isHair: Boolean(uniforms.isHair?.value),
    isMetal: materialRole === MATERIAL_ROLES.metal,
    isOutline: Boolean(uniforms.isOutline?.value),
    isSkin: Boolean(uniforms.isSkin?.value),
    isTransparentOverlay: [
      MATERIAL_ROLES.blush,
      MATERIAL_ROLES.catchlight,
      MATERIAL_ROLES.eyeHighlight,
      MATERIAL_ROLES.transparentOverlay,
    ].includes(materialRole),
    materialRole,
  };
}

function applyToonSettingsToAnimeMaterial(mat, settings) {
  const uniforms = mat?.uniforms;
  if (!uniforms?.materialRole) return false;

  const flags = roleFlagsFromAnimeMaterial(mat);
  const sceneShadow = resolveSceneShadowForMaterial(settings.sceneShadow, flags);
  const selfShadow = resolveSelfShadowForMaterial(settings.selfShadow, flags);
  const averageShadow = resolveAverageShadowForMaterial(settings.averageShadow, flags);
  const indirectLight = resolveIndirectLightForMaterial(settings.indirectLight, flags);
  const localLight = resolveLocalLightForMaterial(settings.localLights, flags);
  const rimLight = resolveRimLightForMaterial(settings.rimLight, flags);
  const specularMask = textureOrNull(uniforms.specularMaskMap?.value);
  const specular = resolveSpecularForMaterial(settings.specular, {
    ...flags,
    maskMap: specularMask,
  });
  const hairHighlightMask = textureOrNull(uniforms.hairHighlightMaskMap?.value);
  const hairHighlight = resolveHairHighlightForMaterial(settings.hairHighlight, {
    isHair: flags.isHair,
    isOutline: flags.isOutline,
    maskMap: hairHighlightMask,
    material: mat,
  });
  const eyeHighlightMask = textureOrNull(uniforms.eyeHighlightMaskMap?.value);
  const eyeHighlight = resolveEyeHighlightForMaterial(settings.eyeHighlight, {
    isEye: flags.isEye,
    isOutline: flags.isOutline,
    maskMap: eyeHighlightMask,
  });
  const outline = resolveOutlineForMaterial(settings.outline, {
    alphaTest: uniforms.aCutoff?.value ?? -1,
    ...flags,
  });
  const contactShadow = resolveContactShadowForMaterial(settings.contactShadow ?? createContactShadowSettings(), flags);
  const glitter = resolveGlitterForMaterial(settings.glitter ?? createGlitterSettings(), flags);
  const sticker = resolveStickerForMaterial(settings.sticker ?? createStickerSettings(), {
    isOutline: flags.isOutline,
    sourceMaterial: { userData: mat.userData ?? {} },
  });
  const stickerMapResolved = sticker.map ?? textureOrNull(uniforms.stickerMap?.value);
  const perspectiveRemoval = settings.perspectiveRemoval ?? createPerspectiveRemovalSettings();
  const fur = settings.fur ?? createFurSettings();

  setToonUniform(uniforms, 'enableShadowColor', settings.shadowColor.enabled);
  setToonUniform(uniforms, 'celShadeMidPoint', settings.celShade.bodyCelMidPoint);
  setToonUniform(uniforms, 'celShadeSoftness', settings.celShade.bodyCelSoftness);
  setToonUniform(uniforms, 'mainLightIgnoreCelShade', settings.celShade.bodyMainLightIgnoreCelShade);
  setToonUniform(uniforms, 'edgeAntiAliasStrength', settings.celShade.edgeAntiAliasStrength);
  setToonUniform(uniforms, 'celShadeMidPointForFaceArea', settings.faceLighting.faceCelMidPoint);
  setToonUniform(uniforms, 'celShadeSoftnessForFaceArea', settings.faceLighting.faceCelSoftness);
  setToonUniform(uniforms, 'mainLightIgnoreCelShadeForFaceArea', settings.faceLighting.faceMainLightIgnoreCelShade);
  setToonUniform(uniforms, 'faceSceneShadowStrength', settings.faceLighting.faceSceneShadowStrength);
  setToonUniform(uniforms, 'faceLocalLightLift', settings.faceLighting.faceLocalLightLift);
  setToonUniform(uniforms, 'faceNormalProxyBlend', settings.faceLighting.faceNormalProxyBlend);
  setToonUniform(uniforms, 'faceSphereBlend', settings.faceLighting.faceSphereBlend);
  setToonUniform(
    uniforms,
    'faceHeadSpaceMode',
    FACE_HEAD_SPACE_MODE_VALUES[settings.faceLighting.headSpaceMode] ?? 1,
  );
  setToonUniform(uniforms, 'contactShadowStrength', contactShadow.strength);
  setToonUniform(uniforms, 'contactShadowWidth', contactShadow.width);
  setToonUniform(uniforms, 'contactShadowThresholdOffset', contactShadow.thresholdOffset);
  setToonUniform(uniforms, 'contactShadowFadeRange', contactShadow.fadeRange);
  setToonUniform(uniforms, 'contactShadowFaceHeadUpBlend', contactShadow.faceHeadUpBlend);
  setToonUniform(uniforms, 'ditherOpacity', settings.alpha.ditherOpacity);
  setToonUniform(
    uniforms,
    'faceProxyNormalObject',
    new THREE.Vector3(...settings.faceLighting.faceProxyNormal).normalize(),
  );

  setToonUniform(uniforms, 'selfShadowTintColor', settings.shadowColor.selfShadowTintColor);
  setToonUniform(uniforms, 'selfShadowAreaHSVStrength', settings.shadowColor.selfShadowAreaHSVStrength);
  setToonUniform(uniforms, 'selfShadowAreaHueOffset', settings.shadowColor.selfShadowAreaHueOffset);
  setToonUniform(uniforms, 'selfShadowAreaSaturationBoost', settings.shadowColor.selfShadowAreaSaturationBoost);
  setToonUniform(uniforms, 'selfShadowAreaValueMul', settings.shadowColor.selfShadowAreaValueMul);
  setToonUniform(uniforms, 'selfShadowAlbedoMulStrength', settings.shadowColor.selfShadowAlbedoMulStrength);
  setToonUniform(uniforms, 'litToShadowTransitionAreaIntensity', settings.shadowColor.transitionAreaIntensity);
  setToonUniform(uniforms, 'litToShadowTransitionAreaTintColor', settings.shadowColor.transitionAreaTintColor);
  setToonUniform(uniforms, 'litToShadowTransitionAreaHueOffset', settings.shadowColor.transitionAreaHueOffset);
  setToonUniform(uniforms, 'litToShadowTransitionAreaSaturationBoost', settings.shadowColor.transitionAreaSaturationBoost);
  setToonUniform(uniforms, 'litToShadowTransitionAreaValueMul', settings.shadowColor.transitionAreaValueMul);
  setToonUniform(uniforms, 'lowSaturationFallbackColor', settings.shadowColor.lowSaturationFallbackColor);

  setToonUniform(uniforms, 'overrideBySkinShadowTintColor', settings.skinTone.skinShadowTintStrength);
  setToonUniform(uniforms, 'skinShadowTintColor', settings.skinTone.skinShadowTint);
  setToonUniform(uniforms, 'skinShadowBrightness', settings.skinTone.skinShadowBrightness);
  setToonUniform(uniforms, 'skinShadowSaturation', settings.skinTone.skinShadowSaturation);
  setToonUniform(uniforms, 'overrideByFaceShadowTintColor', settings.skinTone.faceShadowTintStrength);
  setToonUniform(uniforms, 'faceShadowTintColor', settings.skinTone.faceShadowTint);
  setToonUniform(uniforms, 'faceShadowBrightness', settings.skinTone.faceShadowBrightness);
  setToonUniform(uniforms, 'faceShadowSaturation', settings.skinTone.faceShadowSaturation);
  setToonUniform(uniforms, 'skinMinimumIndirectLight', settings.skinTone.skinMinimumIndirectLight);
  setToonUniform(uniforms, 'faceMinimumIndirectLight', settings.skinTone.faceMinimumIndirectLight);
  setToonUniform(uniforms, 'skinMaxDirectLight', settings.skinTone.skinMaxDirectLight);
  setToonUniform(uniforms, 'faceMaxDirectLight', settings.skinTone.faceMaxDirectLight);

  setToonUniform(uniforms, 'ambientTint', settings.indirectLight.ambientTint);
  setToonUniform(uniforms, 'indirectLightIntensity', indirectLight.intensity);
  setToonUniform(uniforms, 'minimumIndirectLight', indirectLight.minimumIndirectLight);
  setToonUniform(uniforms, 'environmentIndirectLight', settings.indirectLight.environmentIndirectLight);
  setToonUniform(uniforms, 'hemisphereLightIntensity', settings.indirectLight.hemisphereLightIntensity);
  setToonUniform(uniforms, 'localLightIntensity', localLight.intensity);
  setToonUniform(uniforms, 'localLightMaxContribution', localLight.maxContribution);
  setToonUniform(uniforms, 'localLightShadowLift', localLight.shadowLift);

  setToonUniform(uniforms, 'receivedShadowStrength', sceneShadow.strength);
  setToonUniform(uniforms, 'receivedShadowMinLight', sceneShadow.minLight);
  setToonUniform(uniforms, 'receivedShadowAreaStrength', settings.sceneShadow.shadowAreaStrength);
  setToonUniform(uniforms, 'selfShadowSourceMode', settings.selfShadow.sourceMode);
  setToonUniform(uniforms, 'selfShadowStrength', selfShadow.strength);
  setToonUniform(uniforms, 'selfShadowMinLight', selfShadow.minLight);
  setToonUniform(uniforms, 'selfShadowAreaStrength', settings.selfShadow.shadowAreaStrength);
  setToonUniform(uniforms, 'averageShadowStrength', averageShadow.strength);
  setToonUniform(uniforms, 'averageShadowMinLight', averageShadow.minLight);
  setToonUniform(uniforms, 'averageShadowSoftness', settings.averageShadow.softness);
  setToonUniform(uniforms, 'averageShadowMeasuredBlend', settings.averageShadow.measuredBlend);

  setToonUniform(uniforms, 'useSpecular', specular.enabled);
  setToonUniform(uniforms, 'specularIntensity', specular.intensity);
  setToonUniform(uniforms, 'specularColor', specular.color);
  setToonUniform(uniforms, 'specularAreaRemapMidPoint', specular.midPoint);
  setToonUniform(uniforms, 'specularAreaRemapRange', specular.range);
  setToonUniform(uniforms, 'specularPower', specular.power);
  setToonUniform(uniforms, 'specularShowInShadowArea', specular.showInShadowArea);
  setToonUniform(uniforms, 'specularDirectionMode', specular.directionModeValue);
  setToonUniform(uniforms, 'specularMaskMap', specular.maskMap ?? fallbackWhiteTexture);
  setToonUniform(uniforms, 'useSpecularMask', specular.useMask);
  setToonUniform(uniforms, 'specularMaskStrength', specular.maskStrength);
  setToonUniform(uniforms, 'specularMaskChannel', specular.maskChannel);

  setToonUniform(uniforms, 'useRimLight', rimLight.enabled);
  setToonUniform(uniforms, 'rimTintColor', rimLight.tintColor);
  setToonUniform(uniforms, 'rimIntensity', rimLight.intensity);
  setToonUniform(uniforms, 'rimMidPoint', rimLight.midPoint);
  setToonUniform(uniforms, 'rimSoftness', rimLight.softness);
  setToonUniform(uniforms, 'rimMixWithBaseMapColor', rimLight.mixWithBaseMapColor);
  setToonUniform(uniforms, 'rimBlockByShadow', rimLight.blockByShadow);
  setToonUniform(uniforms, 'rimLightMode', rimLight.modeValue);
  setToonUniform(uniforms, 'rimDepthWidth', rimLight.depthWidth);
  setToonUniform(uniforms, 'rimDepthThresholdOffset', rimLight.depthThresholdOffset);
  setToonUniform(uniforms, 'rimDepthFadeRange', rimLight.depthFadeRange);
  setToonUniform(uniforms, 'rimDepthSafeDistance', rimLight.depthSafeDistance);
  setToonUniform(uniforms, 'rimDepthCloseWidthReduce', rimLight.depthCloseWidthReduce);
  setToonUniform(uniforms, 'rimDepthDottedLineFix', rimLight.depthDottedLineFix);
  setToonUniform(uniforms, 'rimDepthMask3D', rimLight.depthMask3D);
  setToonUniform(uniforms, 'rimDepthFadeStartDistance', rimLight.depthFadeStartDistance);
  setToonUniform(uniforms, 'rimDepthFadeEndDistance', rimLight.depthFadeEndDistance);

  setToonUniform(uniforms, 'useHairHighlight', hairHighlight.enabled);
  setToonUniform(uniforms, 'hairHighlightDirection', new THREE.Vector3(...hairHighlight.direction));
  setToonUniform(uniforms, 'hairHighlightIntensity', hairHighlight.intensity);
  setToonUniform(uniforms, 'hairHighlightMaskMap', hairHighlight.maskMap ?? fallbackWhiteTexture);
  setToonUniform(uniforms, 'hairHighlightMaskChannel', hairHighlight.maskChannel);
  setToonUniform(uniforms, 'hairHighlightMaskStrength', hairHighlight.maskStrength);
  setToonUniform(uniforms, 'hairHighlightMode', hairHighlight.modeValue);
  setToonUniform(uniforms, 'hairHighlightShadowFloor', hairHighlight.shadowFloor);
  setToonUniform(uniforms, 'hairHighlightSideBandPower', hairHighlight.sideBandPower);
  setToonUniform(uniforms, 'hairHighlightStrandPower', hairHighlight.strandPower);
  setToonUniform(uniforms, 'hairHighlightUvBandAxis', hairHighlight.uvBandAxis);
  setToonUniform(uniforms, 'hairHighlightUvBandCenter', hairHighlight.uvBandCenter);
  setToonUniform(uniforms, 'hairHighlightUvBandHalfWidth', hairHighlight.uvBandHalfWidth);
  setToonUniform(uniforms, 'useHairHighlightMask', hairHighlight.useMask);

  setToonUniform(uniforms, 'useEyeHighlight', eyeHighlight.enabled);
  setToonUniform(uniforms, 'eyeHighlightMaskMap', eyeHighlight.maskMap ?? fallbackWhiteTexture);
  setToonUniform(uniforms, 'useEyeHighlightMask', eyeHighlight.useMask);
  setToonUniform(uniforms, 'eyeHighlightColor', eyeHighlight.color);
  setToonUniform(uniforms, 'eyeHighlightIntensity', eyeHighlight.intensity);
  setToonUniform(uniforms, 'eyeHighlightMaskChannel', eyeHighlight.maskChannel);
  setToonUniform(uniforms, 'eyeHighlightMaskStrength', eyeHighlight.maskStrength);
  setToonUniform(uniforms, 'eyeHighlightPower', eyeHighlight.power);
  setToonUniform(uniforms, 'eyeHighlightShowInShadowArea', eyeHighlight.showInShadowArea);

  setToonUniform(uniforms, 'baseMapSaturation', resolveBaseMapSaturation(flags, settings.baseTexture));
  setToonUniform(uniforms, 'materialAoStrength', settings.materialMaps.aoStrength);
  setToonUniform(uniforms, 'materialDetailRepeat', settings.materialMaps.detailRepeat);
  setToonUniform(uniforms, 'materialDetailStrength', settings.materialMaps.detailStrength);
  setToonUniform(uniforms, 'materialEmissiveColor', settings.materialMaps.emissiveColor);
  setToonUniform(uniforms, 'materialEmissiveStrength', settings.materialMaps.emissiveStrength);
  setToonUniform(uniforms, 'materialMatcapStrength', settings.materialMaps.matcapStrength);
  setToonUniform(uniforms, 'materialMetalnessStrength', settings.materialMaps.metalnessStrength);
  setToonUniform(uniforms, 'materialNormalScale', settings.materialMaps.normalScale);
  setToonUniform(uniforms, 'materialNormalStrength', settings.materialMaps.normalStrength);
  setToonUniform(uniforms, 'useMaterialNormalMap', Boolean(uniforms.hasMaterialNormalMap?.value) && settings.materialMaps.normalStrength > 0);
  setToonUniform(uniforms, 'materialRampStrength', settings.materialMaps.rampStrength);
  setToonUniform(uniforms, 'materialRoughnessStrength', settings.materialMaps.roughnessStrength);
  setToonUniform(uniforms, 'materialSpecularColorStrength', settings.materialMaps.specularColorStrength);

  setToonUniform(uniforms, 'outlineTintColor', outline.tintColor);
  setToonUniform(uniforms, 'outlineTintColorSkinAreaOverride', outline.skinTintColor);
  setToonUniform(uniforms, 'outlineSkinAreaOverrideStrength', outline.skinTintStrength);
  setToonUniform(uniforms, 'outlineLightingMix', outline.lightingMix);
  setToonUniform(uniforms, 'outlineMinBrightness', outline.minBrightness);
  setToonUniform(uniforms, 'outlineMaxBrightness', outline.maxBrightness);
  setToonUniform(uniforms, 'outlineDepthOffset', outline.depthOffset);
  setToonUniform(uniforms, 'outlineThickness', outline.width);
  setToonUniform(uniforms, 'outlineScreenSpaceFix', outline.screenSpaceWidth);
  setToonUniform(uniforms, 'outlineReferenceDistance', outline.referenceDistance);
  setToonUniform(
    uniforms,
    'outlineReferenceProjection11',
    1 / Math.tan(THREE.MathUtils.degToRad((outline.referenceFov ?? 40) / 2)),
  );
  setToonUniform(uniforms, 'outlineWidthFadeDistance', outline.widthFadeDistance);
  mat.visible = flags.isOutline ? outline.enabled : mat.visible;

  setToonUniform(uniforms, 'useGlitter', glitter.enabled);
  setToonUniform(uniforms, 'glitterIntensity', glitter.intensity);
  setToonUniform(uniforms, 'glitterDensity', glitter.density);
  setToonUniform(uniforms, 'glitterSize', glitter.size);
  setToonUniform(uniforms, 'glitterRandomNormalStrength', glitter.randomNormalStrength);
  setToonUniform(uniforms, 'glitterShowInShadowArea', glitter.showInShadowArea);
  setToonUniform(uniforms, 'glitterUvChannel', glitter.uvChannel);

  setToonUniform(uniforms, 'useSticker', sticker.enabled || (Boolean(stickerMapResolved) && settings.sticker?.enabled === true));
  setToonUniform(uniforms, 'stickerMap', stickerMapResolved ?? fallbackWhiteTexture);
  setToonUniform(uniforms, 'stickerBlendMode', sticker.blendModeValue);
  setToonUniform(uniforms, 'stickerStrength', sticker.strength);
  setToonUniform(uniforms, 'stickerRepeat', new THREE.Vector2(...sticker.repeat));
  setToonUniform(uniforms, 'stickerOffset', new THREE.Vector2(...sticker.offset));
  setToonUniform(uniforms, 'stickerUvChannel', sticker.uvChannel);

  // Outline and fur-shell materials get the same amount so they stay attached
  // to the flattened body.
  setToonUniform(uniforms, 'perspectiveRemovalAmount', perspectiveRemoval.amount);
  setToonUniform(uniforms, 'perspectiveRemovalRadius', perspectiveRemoval.radius);
  setToonUniform(uniforms, 'perspectiveRemovalStartHeight', perspectiveRemoval.startHeight);
  setToonUniform(uniforms, 'perspectiveRemovalEndHeight', perspectiveRemoval.endHeight);

  // Fur shells created at conversion time follow live global fur tuning
  // (furLayer stays per-shell; density/shape are shared).
  if (mat.userData?.toonFlags?.isFurShell) {
    setToonUniform(uniforms, 'furLength', fur.length);
    setToonUniform(uniforms, 'furGravity', fur.gravity);
    setToonUniform(uniforms, 'furDensity', fur.density);
    setToonUniform(uniforms, 'furRootOffset', fur.rootOffset);
    setToonUniform(uniforms, 'furRootShade', fur.rootShade);
  }

  mat.needsUpdate = true;
  return true;
}

export function applyToonSettingsToMaterial(target, settingsInput = {}) {
  const settings = createToonSettings(settingsInput);
  let updatedMaterialCount = 0;

  const updateMaterial = (material) => {
    const materials = toMaterialArray(material);
    for (const mat of materials) {
      if (applyToonSettingsToAnimeMaterial(mat, settings)) updatedMaterialCount += 1;
    }
  };

  if (target?.isMaterial || Array.isArray(target)) {
    updateMaterial(target);
  } else {
    target?.traverse?.((obj) => {
      if (!obj.isMesh || !obj.material) return;
      updateMaterial(obj.material);
    });
  }

  return {
    settings,
    updatedMaterialCount,
  };
}

function addOutlinePass(mesh, outlineSettings = createOutlineSettings()) {
  const outline = mesh.clone(false);
  outline.geometry = mesh.geometry;
  outline.material = Array.isArray(mesh.material)
    ? mesh.material.map((m) => createOutlineMaterialFromAnimeMaterial(m, outlineSettings))
    : createOutlineMaterialFromAnimeMaterial(mesh.material, outlineSettings);

  if (outlineSettings.smoothNormals !== false && bakeSmoothedOutlineNormals(mesh.geometry)) {
    // Node materials have no GLSL defines: give the hull its own geometry
    // that shares every buffer with the source but swaps the normal attribute
    // for the baked smoothed one.
    const source = mesh.geometry;
    const hullGeometry = new THREE.BufferGeometry();
    hullGeometry.index = source.index;
    for (const name of Object.keys(source.attributes)) {
      hullGeometry.setAttribute(name, source.attributes[name]);
    }
    hullGeometry.setAttribute('normal', source.getAttribute('outlineSmoothNormal'));
    hullGeometry.morphAttributes = source.morphAttributes;
    hullGeometry.morphTargetsRelative = source.morphTargetsRelative;
    hullGeometry.groups = source.groups;
    hullGeometry.drawRange = source.drawRange;
    hullGeometry.boundingSphere = source.boundingSphere;
    hullGeometry.boundingBox = source.boundingBox;
    outline.geometry = hullGeometry;
  }

  outline.userData.isToonOutline = true;
  outline.renderOrder = (mesh.renderOrder ?? 0) + 1;
  outline.frustumCulled = false;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.position.set(0, 0, 0);
  outline.quaternion.identity();
  outline.scale.set(1, 1, 1);
  outline.updateMatrix();
  outline.updateMatrixWorld(true);

  if (mesh.isSkinnedMesh && outline.isSkinnedMesh) {
    outline.bindMode = mesh.bindMode;
    outline.bindMatrix.copy(mesh.bindMatrix);
    outline.bindMatrixInverse.copy(mesh.bindMatrixInverse);
    outline.skeleton = mesh.skeleton;
  }

  mesh.add(outline);
}

const hiddenFurSlotMaterial = new THREE.MeshBasicMaterial({ name: 'ToonFurHiddenSlot', visible: false });

// Shell fur: N sibling meshes sharing the geometry and skeleton; each shell
// gets its own node material so per-shell uniform nodes are not shared.
function addFurShells(mesh, furMatchesByIndex, furSettings) {
  const baseMaterials = toMaterialArray(mesh.material);
  if (!furMatchesByIndex.some(Boolean)) return;

  for (let shellIndex = 0; shellIndex < furSettings.shellCount; shellIndex++) {
    const layer = (shellIndex + 1) / furSettings.shellCount;
    const shellMaterials = baseMaterials.map((mat, materialIndex) => {
      if (!furMatchesByIndex[materialIndex] || !mat?.uniforms) return hiddenFurSlotMaterial;
      if (typeof mat.userData?.createFurShellVariant === 'function') {
        const shellMat = mat.userData.createFurShellVariant(furSettings, layer);
        shellMat.name = `${mat.name} (fur shell ${shellIndex + 1})`;
        return shellMat;
      }
      return hiddenFurSlotMaterial;
    });

    const shell = mesh.clone(false);
    shell.geometry = mesh.geometry;
    shell.material = Array.isArray(mesh.material) ? shellMaterials : shellMaterials[0];
    shell.userData.isToonFurShell = true;
    shell.renderOrder = (mesh.renderOrder ?? 0) + 1;
    shell.frustumCulled = false;
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.position.set(0, 0, 0);
    shell.quaternion.identity();
    shell.scale.set(1, 1, 1);
    shell.updateMatrix();

    if (mesh.isSkinnedMesh && shell.isSkinnedMesh) {
      shell.bindMode = mesh.bindMode;
      shell.bindMatrix.copy(mesh.bindMatrix);
      shell.bindMatrixInverse.copy(mesh.bindMatrixInverse);
      shell.skeleton = mesh.skeleton;
    }

    mesh.add(shell);
  }
}

export function findPrimarySkinnedMesh(root) {
  let bestMesh = null;
  let bestVertexCount = -1;

  root.traverse((obj) => {
    if (!obj.isSkinnedMesh || !obj.skeleton) return;
    const vertexCount = obj.geometry?.attributes?.position?.count ?? 0;
    if (vertexCount > bestVertexCount) {
      bestMesh = obj;
      bestVertexCount = vertexCount;
    }
  });

  return bestMesh;
}

function compactToonSettingsOptions(options) {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined && value !== null),
  );
}

export function applyToonShader(root, {
  alpha = null,
  averageShadow = null,
  baseTexture = null,
  celShade = null,
  contactShadow = null,
  debugOutputMode = 'off',
  eyeHighlight = null,
  faceLighting = null,
  fur = null,
  glitter = null,
  hairHighlight = null,
  indirectLight = null,
  localLights = null,
  materialMaps = null,
  materialRoles = null,
  outline = undefined,
  perspectiveRemoval = null,
  preset = null,
  rimLight = null,
  sceneShadow = null,
  selfShadow = null,
  settings = null,
  shadowColor = null,
  shaderMode = 'anime',
  specular = null,
  skinTone = null,
  sticker = null,
} = {}) {
  const settingsInput = typeof settings === 'string' ? { preset: settings } : settings || {};
  const toonSettings = createToonSettings({
    ...settingsInput,
    ...compactToonSettingsOptions({
      alpha,
      averageShadow,
      baseTexture,
      celShade,
      contactShadow,
      eyeHighlight,
      faceLighting,
      fur,
      glitter,
      hairHighlight,
      indirectLight,
      localLights,
      materialMaps,
      materialRoles,
      outline,
      perspectiveRemoval,
      preset,
      rimLight,
      sceneShadow,
      selfShadow,
      shadowColor,
      specular,
      skinTone,
      sticker,
    }),
  });
  const normalizedShaderMode = ['anime', 'basic', 'toon', 'normal'].includes(shaderMode)
    ? shaderMode
    : 'anime';
  const resolvedDebugOutputMode = resolveToonDebugOutputMode(debugOutputMode);
  const alphaSettings = toonSettings.alpha;
  const averageShadowSettings = toonSettings.averageShadow;
  const baseTextureSettings = toonSettings.baseTexture;
  const celShadeSettings = toonSettings.celShade;
  const contactShadowSettings = toonSettings.contactShadow;
  const furSettings = toonSettings.fur;
  const glitterSettings = toonSettings.glitter;
  const perspectiveRemovalSettings = toonSettings.perspectiveRemoval;
  const stickerSettings = toonSettings.sticker;
  const eyeHighlightSettings = toonSettings.eyeHighlight;
  const faceLightingSettings = toonSettings.faceLighting;
  const hairHighlightSettings = toonSettings.hairHighlight;
  const indirectLightSettings = toonSettings.indirectLight;
  const localLightSettings = toonSettings.localLights;
  const materialMapSettings = toonSettings.materialMaps;
  const outlineSettings = toonSettings.outline;
  const normalizedMaterialRoleOverrides = normalizeMaterialRoleOverrides(toonSettings.materialRoles);
  const materialRoleOverrides = createInferredMaterialRoleOverrides(
    root,
    normalizedMaterialRoleOverrides,
    { inferPackedTriplets: toonSettings.materialRoles?.inferPackedTriplets !== false },
  );
  const rimLightSettings = toonSettings.rimLight;
  const sceneShadowSettings = toonSettings.sceneShadow;
  const selfShadowSettings = toonSettings.selfShadow;
  const shadowColorSettings = toonSettings.shadowColor;
  const specularSettings = toonSettings.specular;
  const skinToneSettings = toonSettings.skinTone;
  let convertedMeshCount = 0;
  const materialRoleSummary = { counts: {}, materials: [], total: 0 };

  root.traverse((obj) => {
    if (obj.userData?.isToonOutline || obj.userData?.isToonFurShell || !obj.isMesh || !obj.geometry || !obj.material) return;

    const originalMaterials = toMaterialArray(obj.material);
    ensureGeometryAttributes(obj.geometry);
    promoteOverlayGroups(obj.geometry, originalMaterials, materialRoleOverrides, alphaSettings);

    // Fur opt-in is decided against the source materials (names/userData);
    // remembered by slot index for shell creation after conversion.
    const furMatchesByIndex = originalMaterials.map((mat) => (
      materialUsesFur(furSettings, mat, classifyMaterialRole(mat, materialRoleOverrides))
    ));

    for (const mat of originalMaterials) {
      addMaterialRoleSummaryEntry(
        materialRoleSummary,
        mat,
        classifyMaterialRole(mat, materialRoleOverrides),
      );
    }

    obj.material = Array.isArray(obj.material)
      ? originalMaterials.map((mat) => createBodyMaterial(mat, normalizedShaderMode, {
        alphaSettings,
        averageShadowSettings,
        baseTextureSettings,
        celShadeSettings,
        contactShadowSettings,
        debugOutputMode: resolvedDebugOutputMode.value,
        eyeHighlightSettings,
        faceLightingSettings,
        glitterSettings,
        hairHighlightSettings,
        indirectLightSettings,
        localLightSettings,
        materialMapSettings,
        materialRoleOverrides,
        outlineSettings,
        perspectiveRemovalSettings,
        rimLightSettings,
        sceneShadowSettings,
        selfShadowSettings,
        shadowColorSettings,
        specularSettings,
        skinToneSettings,
        stickerSettings,
      }))
      : createBodyMaterial(originalMaterials[0], normalizedShaderMode, {
        alphaSettings,
        averageShadowSettings,
        baseTextureSettings,
        celShadeSettings,
        contactShadowSettings,
        debugOutputMode: resolvedDebugOutputMode.value,
        eyeHighlightSettings,
        faceLightingSettings,
        glitterSettings,
        hairHighlightSettings,
        indirectLightSettings,
        localLightSettings,
        materialMapSettings,
        materialRoleOverrides,
        outlineSettings,
        perspectiveRemovalSettings,
        rimLightSettings,
        sceneShadowSettings,
        selfShadowSettings,
        shadowColorSettings,
        specularSettings,
        skinToneSettings,
        stickerSettings,
      });

    obj.renderOrder = obj.renderOrder ?? 0;
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.onBeforeRender = toonNodeLightSync;
    convertedMeshCount += 1;

    if (outlineSettings.enabled && normalizedShaderMode === 'anime') addOutlinePass(obj, outlineSettings);
    if (furSettings.enabled && normalizedShaderMode === 'anime') addFurShells(obj, furMatchesByIndex, furSettings);
  });

  return {
    convertedMeshCount,
    debugOutputMode: resolvedDebugOutputMode,
    materialRoleSummary,
    primarySkinnedMesh: findPrimarySkinnedMesh(root),
    settings: toonSettings,
    shaderMode: normalizedShaderMode,
    toonPreset: toonSettings.preset,
  };
}
