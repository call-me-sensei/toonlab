import * as THREE from 'three';

// Toonlab-native broadleaf scene assembly.
import {
  createPlantFromRecipe,
} from '../../../src/vegetation/experimental.js';
import { BUILT_IN_TREE_PRESETS } from '../../tree-lab/treePresetStore.js';
import { createBarkMaterial } from '../../tree-lab/engine/barkTextures.js';
import {
  LEAF_ANIMATION_PRESETS,
  ToonlabLeafParticleLayer,
} from '../../tree-lab/engine/leafParticles.js';

const BROADLEAF_PRESET_IDS = Object.freeze([
  'example_branching',
  'species_oak_large',
  'species_ash',
  'species_aspen',
  'species_oak_small',
]);

const BROADLEAF_PRESETS = new Map(
  BUILT_IN_TREE_PRESETS
    .filter((preset) => BROADLEAF_PRESET_IDS.includes(preset.id))
    .map((preset) => [preset.id, preset]),
);

const PROCEDURAL_BARK_IDS = Object.freeze(['oak', 'ash', 'beech', 'birch']);
const BROADLEAF_LEAF_SHAPES = Object.freeze(['teardrop', 'round', 'maple', 'gingko']);
const LEAF_ANIMATION_MAP = new Map(LEAF_ANIMATION_PRESETS.map((preset) => [preset.id, preset]));

function seededRng(seed) {
  let state = Math.max(1, Math.floor(seed * 1000003)) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createBroadleafTreeRecipe({
  animationPreset = 'none',
  animationIntensity = 0.45,
  barkTextureId = 'oak',
  canopyColor = null,
  leafShape = 'teardrop',
  presetId = 'example_branching',
  seedOffset = 0,
  sizeScale = 1,
  windSpeedScale = 1,
  windStrengthScale = 1,
  woodDetails = null,
} = {}) {
  const preset = BROADLEAF_PRESETS.get(presetId) ?? BROADLEAF_PRESETS.get('example_branching');
  const options = structuredClone(preset.options);
  if (canopyColor) options.canopyColor = canopyColor;
  if (seedOffset) options.seed = (options.seed ?? 1) + seedOffset;
  options.size = (options.size ?? 1) * sizeScale;
  options.leafShape = { preset: BROADLEAF_LEAF_SHAPES.includes(leafShape) ? leafShape : 'teardrop' };
  options.barkTexture = { id: PROCEDURAL_BARK_IDS.includes(barkTextureId) ? barkTextureId : 'oak' };
  options.foliage = {
    ...(options.foliage ?? {}),
    windSpeed: (options.foliage?.windSpeed ?? 1.0) * windSpeedScale,
    windStrength: (options.foliage?.windStrength ?? 0.05) * windStrengthScale,
  };
  if (animationPreset !== 'none' && LEAF_ANIMATION_MAP.has(animationPreset)) {
    options.animation = {
      intensity: THREE.MathUtils.clamp(animationIntensity, 0.05, 1),
      preset: animationPreset,
    };
  }
  if (woodDetails && (woodDetails.knots || woodDetails.scars)) options.woodDetails = woodDetails;
  return {
    schema: preset.schema,
    version: preset.version,
    type: preset.type,
    id: preset.id,
    label: preset.label,
    options,
  };
}

export function createBroadleafTreeInstance(options = {}) {
  const recipe = createBroadleafTreeRecipe(options);
  const tree = createPlantFromRecipe(recipe, {
    trunkMaterial: createBarkMaterial(recipe.options.barkTexture),
  });
  const leafParticles = recipe.options.animation
    ? new ToonlabLeafParticleLayer({
      animation: recipe.options.animation,
      canopyColor: recipe.options.canopyColor,
      leafShape: recipe.options.leafShape,
      plant: tree,
      rng: seededRng((recipe.options.seed ?? 1) + 71),
      seed: recipe.options.seed ?? 1,
      size: recipe.options.size ?? 1,
      space: 'local',
    })
    : null;
  if (leafParticles) {
    leafParticles.userData.environmentShaderExclude = true;
    leafParticles.userData.skipWaterReflection = true;
    leafParticles.userData.waterReflectionExclude = true;
    leafParticles.time = ((recipe.options.seed ?? 1) * 0.17) % 100;
    tree.add(leafParticles);
    tree.userData.leafParticles = leafParticles;
  }
  tree.traverse((obj) => {
    if (!obj.isMesh) return;
    // Water Lab's environment adapter wraps generic stage meshes. Tree
    // Toonlab plant meshes already have their own materials, depth
    // variants, and shadow contract, so keep them on that shared path.
    obj.userData.environmentShaderExclude = true;
  });
  const disposeTree = tree.dispose.bind(tree);
  tree.dispose = () => {
    leafParticles?.dispose();
    disposeTree();
  };
  tree.userData.treeDesignerRecipe = recipe;
  tree.userData.waterTreeWind = {
    speedScale: options.windSpeedScale ?? 1,
    strengthScale: options.windStrengthScale ?? 1,
  };
  const uniforms = tree.canopyMesh?.material?.uniforms;
  if (uniforms?.uTime) uniforms.uTime.value = ((recipe.options.seed ?? 1) * 0.137) % 100;
  return { recipe, tree };
}

export function applyBroadleafEnvironment(tree, environment, { cloudShadow, windDirection = [1, 0.3] } = {}) {
  const wind = environment.wind ?? { speed: 1, strength: 0.16 };
  const windScale = tree.userData.waterTreeWind ?? { speedScale: 1, strengthScale: 1 };
  tree.setSun({
    direction: environment.water.sunDirection,
    color: environment.water.sunColor,
    sky: environment.sky.horizonColor,
  });
  tree.setWind({
    direction: windDirection,
    speed: wind.speed * windScale.speedScale,
    strength: (wind.strength ?? 0.16) * 0.45 * windScale.strengthScale,
  });
  if (cloudShadow) tree.setCloudShadow(cloudShadow);
}
