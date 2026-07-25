// Shared material boundary for deterministic environment-parity scenes.
//
// Scene-content modules own geometry, source textures, and authored graph
// records. This module owns how every surface consumes the active environment
// contract, so changing sun/skylight/profile inputs affects rocks, terrain,
// grass, bark, and leaves through one code path.

import { float } from 'three/tsl';

import { installSoStylizedUnityUrpLighting } from './soStylizedUnityUrpLighting.js';
import { installUeSourceDefaultLitLighting } from './ueSourceDefaultLit.js';

export const PARITY_ENVIRONMENT_INPUT_ADAPTERS = Object.freeze({
  unityStage: 'unity-stage',
  ueCapturedScene: 'ue-captured-scene-sh',
});

export function resolveParityEnvironmentInputAdapter(contract) {
  const adapter = contract.sun?.toonlabInputAdapter
    ?? PARITY_ENVIRONMENT_INPUT_ADAPTERS.unityStage;
  if (!Object.values(PARITY_ENVIRONMENT_INPUT_ADAPTERS).includes(adapter)) {
    throw new RangeError(`Unsupported parity lighting input adapter: ${adapter}`);
  }
  return adapter;
}

function sourceWorkflow(material) {
  const sourceShader = material.userData?.soStylizedUnityMaterial?.sourceShader ?? '';
  return material.userData?.soStylizedUnitySceneTree
    || /Foliage|Leaves|Bark/.test(sourceShader)
    ? 'specular'
    : 'metallic';
}

function authoredLightingModel(material) {
  if (material.userData?.ueSourceSubsurfaceLighting) {
    return 'ue-5.8-legacy-subsurface';
  }
  if (material.userData?.ueSourceDefaultLitLighting) {
    return 'ue-5.8-legacy-default-lit';
  }
  if (material.userData?.soStylizedUnityUrpLighting) {
    return 'unity-urp';
  }
  return null;
}

export function bindParityEnvironmentToMaterial(material, contract, {
  installUnityStage = true,
} = {}) {
  const inputAdapter = resolveParityEnvironmentInputAdapter(contract);
  const materialLightingModel = authoredLightingModel(material);
  const contractLightingModel = contract.engineAdapters?.toonlab?.surfaceLightingModel;
  const workflow = sourceWorkflow(material);

  // Family-specific source materials already own the correct shading model.
  // In particular, M_Leaves and M_Foliage use UE's subsurface model; replacing
  // it with the rock contract's Default Lit model removes their transmitted
  // light and makes vegetation unnaturally dark. The shared boundary supplies
  // environment inputs without changing that authored material decision.
  if (materialLightingModel === 'ue-5.8-legacy-subsurface') {
    // The source material builder has already installed and clone-rehydrated
    // the UE subsurface adapter.
  } else if (materialLightingModel === 'ue-5.8-legacy-default-lit') {
    installUeSourceDefaultLitLighting(material, {
      specularNode: material.ueSourceSpecularNode
        ?? float(contract.engineAdapters.toonlab.specularInput),
    });
  } else if (contractLightingModel === 'ue-5.8-legacy-default-lit') {
    installUeSourceDefaultLitLighting(material, {
      specularNode: material.ueSourceSpecularNode
        ?? float(contract.engineAdapters.toonlab.specularInput),
    });
  } else if (inputAdapter === PARITY_ENVIRONMENT_INPUT_ADAPTERS.ueCapturedScene) {
    installSoStylizedUnityUrpLighting(material, { inputAdapter, workflow });
  } else if (installUnityStage) {
    installSoStylizedUnityUrpLighting(material, { workflow });
  }

  material.userData.sharedParityEnvironment = {
    authoredLightingModel: materialLightingModel,
    inputAdapter,
    profileId: contract.profileId,
    surfaceLightingModel: materialLightingModel
      ?? contractLightingModel
      ?? 'unity-urp',
    workflow,
  };
  material.needsUpdate = true;
  return material;
}

export function bindParityEnvironmentToObject(root, contract) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    source.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => bindParityEnvironmentToMaterial(material, contract));
  return materials;
}
