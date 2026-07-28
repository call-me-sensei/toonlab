// Preview fixtures are lab state, never shader-profile state. The retained
// P18 fixtures remain the immutable defaults; procedural recipes are
// additional correctly labeled consumers used to prove that one Tree or
// Flower Shader profile works across different asset palettes and silhouettes.

import {
  validateTreeRecipeDocument,
} from '../../src/vegetation/index.js';
import {
  BUILT_IN_TREE_PRESETS,
  loadLocalTreePresets,
} from '../tree-lab/treePresetStore.js';

export const P18_TREE_SHADER_PREVIEW_ASSET = Object.freeze({
  description:
    'Immutable retained pine from the accepted P18 comparison scene.',
  id: 'p18-retained-pine',
  kind: 'reference',
  label: 'P18 retained pine',
  source: 'P18 reference',
});

export const P18_FLOWER_SHADER_PREVIEW_ASSET = Object.freeze({
  description:
    'Immutable retained daisy field from the accepted P18 comparison scene. Its combined material cannot isolate every petal, center, and stem control.',
  id: 'p18-retained-daisies',
  kind: 'reference',
  label: 'P18 retained daisies',
  source: 'P18 reference',
});

function recipeOption(document, source) {
  const assetKind = document.type === 'flower'
    ? 'Procedural flower'
    : document.type === 'bush'
      ? 'Procedural shrub'
      : 'Procedural tree';
  return {
    description: document.description
      || `${assetKind} recipe with asset-owned geometry, seed, and botanical palette.`,
    id: `${source}:${document.id}`,
    kind: 'procedural',
    label: document.label || document.id,
    recipe: document,
    source: source === 'saved' ? 'Saved procedural' : 'Built-in procedural',
  };
}

function savedPlantRecipes() {
  return typeof document === 'undefined' ? [] : loadLocalTreePresets();
}

export function getTreeShaderPreviewAssets() {
  const builtIn = BUILT_IN_TREE_PRESETS
    .filter((entry) => entry.type === 'tree' || entry.type === 'bush')
    .map((entry) => recipeOption(entry, 'built-in'));
  const saved = savedPlantRecipes()
    .filter((entry) => entry.type === 'tree' || entry.type === 'bush')
    .map((entry) => recipeOption(entry, 'saved'));
  return [P18_TREE_SHADER_PREVIEW_ASSET, ...saved, ...builtIn];
}

export function getFlowerShaderPreviewAssets() {
  const builtIn = BUILT_IN_TREE_PRESETS
    .filter((entry) => entry.type === 'flower')
    .map((entry) => recipeOption(entry, 'built-in'));
  const saved = savedPlantRecipes()
    .filter((entry) => entry.type === 'flower')
    .map((entry) => recipeOption(entry, 'saved'));
  return [P18_FLOWER_SHADER_PREVIEW_ASSET, ...saved, ...builtIn];
}

export function parseTreeShaderPreviewAsset(input, {
  fallbackLabel = 'Imported procedural tree',
} = {}) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid tree recipe JSON: ${error.message}`],
        ok: false,
        value: null,
      };
    }
  }
  const result = validateTreeRecipeDocument(source);
  if (!result.ok) return { ...result, value: null };
  if (result.value.type !== 'tree' && result.value.type !== 'bush') {
    return {
      errors: ['Tree Shader preview accepts tree or bush recipes. Use Flower Shader Lab for flower recipes.'],
      ok: false,
      value: null,
    };
  }
  const identity = String(
    result.value.id
      || source?.id
      || `imported_${Date.now().toString(36)}`,
  );
  const document = {
    ...result.value,
    id: identity,
    label: result.value.label || source?.label || fallbackLabel,
  };
  return {
    errors: [],
    ok: true,
    value: {
      ...recipeOption(document, 'imported'),
      id: `imported:${identity}`,
      source: 'Imported procedural',
    },
  };
}

export function normalizeTreeShaderPreviewAsset(value) {
  if (!value || value.id === P18_TREE_SHADER_PREVIEW_ASSET.id) {
    return P18_TREE_SHADER_PREVIEW_ASSET;
  }
  if (value.kind !== 'procedural' || !value.recipe) {
    return P18_TREE_SHADER_PREVIEW_ASSET;
  }
  const result = parseTreeShaderPreviewAsset(value.recipe, {
    fallbackLabel: value.label,
  });
  if (!result.ok) return P18_TREE_SHADER_PREVIEW_ASSET;
  return {
    ...result.value,
    id: String(value.id || result.value.id),
    label: String(value.label || result.value.label),
    source: String(value.source || result.value.source),
  };
}

export function parseFlowerShaderPreviewAsset(input, {
  fallbackLabel = 'Imported procedural flower',
} = {}) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid flower recipe JSON: ${error.message}`],
        ok: false,
        value: null,
      };
    }
  }
  const result = validateTreeRecipeDocument(source);
  if (!result.ok) return { ...result, value: null };
  if (result.value.type !== 'flower') {
    return {
      errors: ['Flower Shader preview accepts flower recipes. Use Tree Shader Lab for tree or bush recipes.'],
      ok: false,
      value: null,
    };
  }
  const identity = String(
    result.value.id
      || source?.id
      || `imported_${Date.now().toString(36)}`,
  );
  const document = {
    ...result.value,
    id: identity,
    label: result.value.label || source?.label || fallbackLabel,
  };
  return {
    errors: [],
    ok: true,
    value: {
      ...recipeOption(document, 'imported'),
      id: `imported:${identity}`,
      source: 'Imported procedural',
    },
  };
}

export function normalizeFlowerShaderPreviewAsset(value) {
  if (!value || value.id === P18_FLOWER_SHADER_PREVIEW_ASSET.id) {
    return P18_FLOWER_SHADER_PREVIEW_ASSET;
  }
  if (value.kind !== 'procedural' || !value.recipe) {
    return P18_FLOWER_SHADER_PREVIEW_ASSET;
  }
  const result = parseFlowerShaderPreviewAsset(value.recipe, {
    fallbackLabel: value.label,
  });
  if (!result.ok) return P18_FLOWER_SHADER_PREVIEW_ASSET;
  return {
    ...result.value,
    id: String(value.id || result.value.id),
    label: String(value.label || result.value.label),
    source: String(value.source || result.value.source),
  };
}
