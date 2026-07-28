// P18 preview adapter for the public Tree, Grass, and Flower shader profiles.
//
// The accepted comparison uses retained source geometry and material graphs.
// Exact source-graph inputs are written back into retained source profiles.
// Shared treatment fields, plus the complete Tree contract, are layered as a
// zero-at-Call-Me-Sensei semantic delta so the accepted baseline stays exact.

import {
  createToonLabSourceMaterialFromProfile,
} from '../environment/toonLabSourceMaterials.js';
import {
  createVegetationShaderScopeSettings,
  getVegetationShaderScopeFieldSchema,
  tagVegetationMaterial,
  VEGETATION_MATERIAL_ROLES,
  VEGETATION_MATERIAL_VARIANTS,
  VEGETATION_SHADER_SCOPES,
} from './vegetationShaders.js';
import {
  applyP18VegetationStyleOverlay,
  getP18VegetationOverlayFields,
} from './p18VegetationStyleOverlay.js';

export const P18_VEGETATION_SOURCE_ASSET = 'Demonstration_ToonLabShowcase';

const SOURCE_MATERIALS = Object.freeze({
  bark: Object.freeze({
    match: '/MI_PineBark.MI_PineBark',
    roles: Object.freeze([VEGETATION_MATERIAL_ROLES.woodySurface]),
    scope: 'tree',
    variant: VEGETATION_MATERIAL_VARIANTS.mesh,
  }),
  flower: Object.freeze({
    match: '/MI_Daisy.MI_Daisy',
    roles: Object.freeze([
      VEGETATION_MATERIAL_ROLES.flowerPetal,
      VEGETATION_MATERIAL_ROLES.flowerCenter,
      VEGETATION_MATERIAL_ROLES.herbaceousStem,
    ]),
    scope: 'flower',
    variant: VEGETATION_MATERIAL_VARIANTS.cutout,
  }),
  grass: Object.freeze({
    match: '/MI_Grass.MI_Grass',
    roles: Object.freeze([VEGETATION_MATERIAL_ROLES.grassBlade]),
    scope: 'grass',
    variant: VEGETATION_MATERIAL_VARIANTS.cutout,
  }),
  leaves: Object.freeze({
    match: '/MI_PineLeaves.MI_PineLeaves',
    roles: Object.freeze([VEGETATION_MATERIAL_ROLES.foliageCard]),
    scope: 'tree',
    variant: VEGETATION_MATERIAL_VARIANTS.cutout,
  }),
});

const BINDINGS = Object.freeze({
  bark: Object.freeze([
    ['bark.tint', 'vector', 'TintColor'],
    ['bark.tintStrength', 'scalar', 'TintMix'],
    ['bark.roughness', 'scalar', 'RoughMult'],
    ['bark.normalFlatness', 'scalar', 'NormalFlatness'],
    ['bark.emissiveStrength', 'scalar', 'Emissive Strength'],
    ['bark.specularStrength', 'scalar', 'Specular'],
  ]),
  flower: Object.freeze([
    ['flower.roughness', 'scalar', 'Roughness'],
    ['flower.specularStrength', 'scalar', 'Specular'],
    ['flower.emissiveStrength', 'scalar', 'Emissive Strength'],
    ['flower.subsurfaceStrength', 'scalar', 'SS Strength'],
    ['flower.subsurfaceOpacity', 'scalar', 'SS Opacity'],
  ]),
  grass: Object.freeze([
    ['grass.baseColor', 'vector', 'Base Color'],
    ['grass.tipBrightness', 'scalar', 'Tip Brightness'],
    ['grass.tipDesaturation', 'scalar', 'Tip Desaturation'],
    ['grass.tipHueShift', 'scalar', 'Tip Hue Shift'],
    ['grass.roughness', 'scalar', 'Roughness'],
    ['grass.specularStrength', 'scalar', 'Specular'],
    ['grass.emissiveStrength', 'scalar', 'Emissive Strength'],
    ['grass.interactionResponse', 'scalar', 'Interaction Strength', 250],
  ]),
  leaves: Object.freeze([
    ['foliage.gradientOffset', 'scalar', 'Gradient Offset'],
    ['foliage.gradientContrast', 'scalar', 'Gradient Contrast'],
    ['foliage.hueVariation', 'scalar', 'Hue Variation'],
    ['foliage.hueShift', 'scalar', 'Hue Shift'],
    ['foliage.roughness', 'scalar', 'Roughness'],
    ['foliage.specularStrength', 'scalar', 'Specular'],
    ['foliage.emissiveStrength', 'scalar', 'Emissive Strength'],
    ['foliage.subsurfaceStrength', 'scalar', 'SS Strength'],
    ['foliage.subsurfaceOpacity', 'scalar', 'SS Opacity'],
  ]),
});

const SOURCE_CONTROL_FIELDS = Object.freeze({
  grass: Object.freeze(['grass.styleColorStrength']),
});

function materialDefinition(path) {
  return Object.entries(SOURCE_MATERIALS)
    .find(([, definition]) => path.endsWith(definition.match)) ?? null;
}

function profileValue(settings, path) {
  const [groupId, key] = path.split('.');
  return settings[groupId]?.[key];
}

function lerpColor(a, b, amount) {
  return [0, 1, 2].map((index) => (
    Number(a?.[index] ?? b[index]) * (1 - amount) + Number(b[index]) * amount
  ));
}

function writeBinding(
  profile,
  settings,
  [path, kind, sourceName, scale = 1],
  {
    baseProfile,
    materialId,
  } = {},
) {
  const value = profileValue(settings, path);
  if (kind === 'vector') {
    const alpha = profile.parameters.vector?.[sourceName]?.[3] ?? 1;
    const styleColorPath = materialId === 'leaves'
      ? 'foliage.styleColorStrength'
      : materialId === 'grass'
        ? 'grass.styleColorStrength'
        : null;
    const strength = styleColorPath ? profileValue(settings, styleColorPath) : 1;
    const colorValue = styleColorPath
      ? lerpColor(baseProfile.parameters.vector?.[sourceName], value, strength)
      : value;
    profile.parameters.vector[sourceName] = [...colorValue, alpha];
  } else {
    profile.parameters.scalar[sourceName] = Number(value) * scale;
  }
}

function supportedFields(scope) {
  const paths = new Set();
  for (const [materialId, definition] of Object.entries(SOURCE_MATERIALS)) {
    if (definition.scope !== scope) continue;
    for (const [path] of BINDINGS[materialId]) paths.add(path);
    for (const path of SOURCE_CONTROL_FIELDS[materialId] ?? []) paths.add(path);
    for (const path of getP18VegetationOverlayFields(
      scope,
      definition.roles[0],
    )) paths.add(path);
  }
  return paths;
}

export const P18_VEGETATION_SUPPORTED_FIELDS_BY_SCOPE = Object.freeze(
  Object.fromEntries(Object.keys(VEGETATION_SHADER_SCOPES).map((scope) => [
    scope,
    Object.freeze([...supportedFields(scope)]),
  ])),
);

export function isP18VegetationFieldSupported(scope, fieldOrPath) {
  const path = typeof fieldOrPath === 'string'
    ? fieldOrPath
    : fieldOrPath?.id;
  return P18_VEGETATION_SUPPORTED_FIELDS_BY_SCOPE[scope]?.includes(path) ?? false;
}

export async function createP18VegetationShaderMaterial(
  sourceMaterial,
  scope,
  settings = {},
  {
    hasUv2 = false,
    hasVertexColors = false,
    library,
    localHeight = 1,
    localMinY = 0,
    sourceActorIdentity = null,
    sourceAssetName = P18_VEGETATION_SOURCE_ASSET,
    sourceSceneVariant = null,
    state,
  } = {},
) {
  const materialPath = sourceMaterial?.userData?.toonLabSource?.materialPath;
  const matched = materialDefinition(materialPath ?? '');
  if (!matched || matched[1].scope !== scope) return null;
  const [materialId, definition] = matched;
  const baseProfile = library.resolveMaterial(materialPath);
  if (!baseProfile) {
    throw new Error(`P18 ${scope} shader could not resolve ${materialPath}.`);
  }
  const resolvedSettings = createVegetationShaderScopeSettings(scope, settings);
  const sourceProfile = structuredClone(baseProfile);
  for (const binding of BINDINGS[materialId]) {
    writeBinding(sourceProfile, resolvedSettings, binding, {
      baseProfile,
      materialId,
    });
  }
  const material = await createToonLabSourceMaterialFromProfile(sourceProfile, {
    hasUv2,
    hasVertexColors,
    library,
    sourceActorIdentity,
    sourceAssetName,
    sourceSceneVariant,
    state,
  });
  material.name = `ToonLab ${VEGETATION_SHADER_SCOPES[scope].label} · P18 ${materialId}`;
  tagVegetationMaterial(material, {
    roles: definition.roles,
    variant: definition.variant,
  });
  const overlayFields = applyP18VegetationStyleOverlay(
    material,
    scope,
    resolvedSettings,
    {
      localHeight,
      localMinY,
      role: definition.roles[0],
      state,
    },
  );
  const mappedFields = [...new Set([
    ...BINDINGS[materialId].map(([path]) => path),
    ...(SOURCE_CONTROL_FIELDS[materialId] ?? []),
    ...overlayFields,
  ])];
  material.userData.toonlabP18VegetationShader = {
    mappedFields,
    originalMaterial: sourceMaterial.userData?.toonlabP18VegetationShader?.originalMaterial
      ?? sourceMaterial,
    settings: resolvedSettings,
    sourceMaterial: materialPath,
  };
  return material;
}

export async function applyP18VegetationShader(root, scope, settings = {}, context = {}) {
  if (!VEGETATION_SHADER_SCOPES[scope]) {
    throw new Error(`Unknown P18 vegetation shader scope "${scope}".`);
  }
  const jobs = [];
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const sources = Array.isArray(object.material)
      ? object.material
      : [object.material];
    object.geometry?.computeBoundingBox?.();
    const localMinY = object.geometry?.boundingBox?.min?.y ?? 0;
    const localHeight = Math.max(
      (object.geometry?.boundingBox?.max?.y ?? 1) - localMinY,
      0.001,
    );
    jobs.push(Promise.all(sources.map((source) => (
      createP18VegetationShaderMaterial(source, scope, settings, {
        ...context,
        hasUv2: Boolean(object.geometry?.attributes?.uv2),
        hasVertexColors: Boolean(object.geometry?.attributes?.color),
        localHeight,
        localMinY,
      }).then((material) => material ?? source)
    ))).then((materials) => ({
      materials,
      object,
      wasArray: Array.isArray(object.material),
    })));
  });
  const assignments = await Promise.all(jobs);
  let matched = 0;
  let visited = 0;
  let writes = 0;
  for (const { materials, object, wasArray } of assignments) {
    visited += materials.length;
    for (const material of materials) {
      const adapter = material.userData?.toonlabP18VegetationShader;
      if (!adapter) continue;
      matched += 1;
      writes += adapter.mappedFields.length;
    }
    object.material = wasArray ? materials : materials[0];
  }
  const supported = supportedFields(scope);
  const allFields = Object.values(getVegetationShaderScopeFieldSchema(scope))
    .flatMap((group) => Object.values(group));
  const unsupported = allFields
    .filter((field) => !supported.has(field.id))
    .map((field) => ({
      field: field.id,
      reason: 'The retained P18 fixture does not yet expose this role-specific field.',
    }));
  return {
    applied: matched,
    matched,
    skipped: visited - matched,
    unsupported,
    visited,
    writes,
  };
}

export function restoreP18VegetationShader(root) {
  let restored = 0;
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const restoredMaterials = materials.map((material) => {
      const original = material.userData?.toonlabP18VegetationShader?.originalMaterial;
      if (!original) return material;
      restored += 1;
      return original;
    });
    object.material = Array.isArray(object.material)
      ? restoredMaterials
      : restoredMaterials[0];
  });
  return restored;
}

export function disposeP18VegetationShaderMaterials(root) {
  const disposed = new Set();
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (
        material.userData?.toonlabP18VegetationShader
        && !disposed.has(material)
      ) {
        disposed.add(material);
        material.dispose?.();
      }
    }
  });
  return disposed.size;
}
