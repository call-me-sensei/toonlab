// Exact P18 Ground Shader runtime adapter. It executes the existing audited
// ten-layer landscape graph with a portable v3 Ground profile. Landscape
// geometry, painted weight packs, layer textures, and current scene state are
// supplied by the host/source-library context rather than serialized here.
// Snow appearance, desert material identity, weather switches, and the
// environment emission cycle remain retained source/runtime inputs; the
// portable Ground profile does not take ownership of them.

import {
  buildToonLabLandscapeMaterial,
} from '../environment/toonLabSourceMaterials.js';
import {
  createGroundShaderSettings,
  createGroundShaderSourceProfile,
  GROUND_SHADER_FIELD_SCHEMA,
  GROUND_SHADER_SCHEMA_VERSION,
} from './p18GroundShaderSettings.js';

export const P18_GROUND_SOURCE_MATERIAL = 'MI_Landscape_Snow';
export const P18_GROUND_SOURCE_ASSET = 'Demonstration_ToonLabShowcase';

function fieldCount() {
  return Object.values(GROUND_SHADER_FIELD_SCHEMA)
    .reduce((total, fields) => total + Object.keys(fields).length, 0);
}

function collectGroundMeshes(target) {
  const meshes = [];
  const append = (object) => {
    if (!object?.isMesh) return;
    if (
      object.userData?.sourceLandscapePatch
      || object.material?.userData?.toonlabGroundShader?.version
    ) {
      meshes.push(object);
    }
  };
  append(target);
  target?.traverse?.((object) => {
    if (object !== target) append(object);
  });
  return meshes;
}

export async function createGroundShaderMaterial({
  library,
  settings = {},
  sourceAssetName = P18_GROUND_SOURCE_ASSET,
  sourceMaterial = P18_GROUND_SOURCE_MATERIAL,
  state,
} = {}) {
  if (!library) {
    throw new TypeError('Ground Shader needs a source library that resolves its external texture inputs.');
  }
  if (!state?.uniforms) {
    throw new TypeError('Ground Shader needs the host environment state for current time and weather inputs.');
  }
  const baseProfile = library.resolveMaterial(sourceMaterial);
  if (!baseProfile || baseProfile.family !== 'landscape') {
    throw new Error(`Ground Shader could not resolve landscape profile ${sourceMaterial}.`);
  }
  const resolvedSettings = createGroundShaderSettings(settings);
  const sourceProfile = createGroundShaderSourceProfile(
    baseProfile,
    resolvedSettings,
  );
  const material = await buildToonLabLandscapeMaterial(sourceProfile, {
    hasUv2: false,
    hasVertexColors: false,
    library,
    sourceActorIdentity: null,
    sourceAssetName,
    sourceSceneVariant: 'p18-ground-shader',
    state,
  });
  material.name = 'ToonLab Ground Shader · P18 ten-layer graph';
  material.userData.toonlabGroundShader = {
    fieldCount: fieldCount(),
    settings: resolvedSettings,
    sourceAssetName,
    sourceMaterial: baseProfile.path,
    sourceProfile,
    state,
    version: GROUND_SHADER_SCHEMA_VERSION,
  };
  return material;
}

export async function applyGroundShader(target, settings = {}, context = {}) {
  const meshes = collectGroundMeshes(target);
  const report = {
    applied: 0,
    matched: meshes.length,
    skipped: 0,
    visited: meshes.length,
    writes: 0,
  };
  for (const mesh of meshes) {
    const previous = mesh.material;
    const material = await createGroundShaderMaterial({
      ...context,
      settings,
    });
    material.userData.toonlabGroundShader.originalMaterial = previous;
    mesh.material = material;
    report.applied += 1;
    report.writes += material.userData.toonlabGroundShader.fieldCount;
  }
  return report;
}

export function setGroundShaderSceneState(target, {
  wetness,
} = {}) {
  const materials = new Set();
  if (target?.isMaterial) materials.add(target);
  collectGroundMeshes(target).forEach((mesh) => materials.add(mesh.material));
  let updated = 0;
  for (const material of materials) {
    const adapter = material?.userData?.toonlabGroundShader;
    if (!adapter || adapter.version !== GROUND_SHADER_SCHEMA_VERSION) continue;
    if (Number.isFinite(Number(wetness)) && adapter.state?.uniforms?.rainWetness) {
      adapter.state.uniforms.rainWetness.value = Math.min(
        Math.max(Number(wetness), 0),
        1,
      );
    }
    updated += 1;
  }
  return updated;
}

export function restoreGroundShader(target) {
  let restored = 0;
  for (const mesh of collectGroundMeshes(target)) {
    const adapter = mesh.material?.userData?.toonlabGroundShader;
    if (!adapter?.originalMaterial) continue;
    const current = mesh.material;
    mesh.material = adapter.originalMaterial;
    current.dispose?.();
    restored += 1;
  }
  return restored;
}

export function disposeGroundShaderMaterial(material) {
  material?.dispose?.();
}
