// Data-only catalog used by the published MCP server. It intentionally uses
// stable public domains only; repository-only generators and pre-beta systems
// are never pulled into the npm tarball through the MCP dependency graph.

import { BUILT_IN_DEBRIS_PRESETS } from '../src/debrisgen/debrisPresets.js';
import { POST_PROCESSING_PRESETS } from '../src/post/postProcessing.js';
import { getRockgenPresetOptions } from '../src/rockgen/rockgenPresets.js';
import { getSkyPresetOptions } from '../src/sky/stylizedSky.js';
import { getToonPresetOptions } from '../src/toon/toonSettings.js';
import { getWaterPresetOptions } from '../src/water/waterSettings.js';

const slug = (value) => String(value)
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const thumbnailFor = (id) => `thumbs/${id.replaceAll('/', '-')}.webp`;

function entry(input) {
  return Object.freeze({
    description: null,
    tags: [],
    thumbnail: null,
    ...input,
  });
}

const CURATED_PLANT_RECIPES = Object.freeze([
  entry({
    cluster: 'vegetation',
    description: 'Mid-size broadleaf starting recipe for anime environments.',
    id: 'tree/broadleaf/sensei',
    kind: 'recipe',
    label: 'Sensei broadleaf',
    recipe: {
      options: { seed: 3, size: 3.2 },
      schema: 'treeRecipe',
      type: 'tree',
      version: 1,
    },
    spawn: 'createPlantFromRecipe(entry.recipe)',
    tags: ['tree', 'vegetation', 'anime'],
    thumbnail: thumbnailFor('tree/broadleaf/sensei'),
  }),
  entry({
    cluster: 'vegetation',
    description: 'Ground-hugging foliage mass for yards and path edges.',
    id: 'tree/bush/hedge',
    kind: 'recipe',
    label: 'Hedge bush',
    recipe: {
      options: { seed: 5, size: 1.2 },
      schema: 'treeRecipe',
      type: 'bush',
      version: 1,
    },
    spawn: 'createPlantFromRecipe(entry.recipe)',
    tags: ['bush', 'vegetation', 'anime'],
    thumbnail: thumbnailFor('tree/bush/hedge'),
  }),
  entry({
    cluster: 'vegetation',
    description: 'Flowering plant with daisy heads.',
    id: 'tree/flower/daisy',
    kind: 'recipe',
    label: 'Daisy flower',
    recipe: {
      options: { seed: 9, size: 0.5, species: 'daisy' },
      schema: 'treeRecipe',
      type: 'flower',
      version: 1,
    },
    spawn: 'createPlantFromRecipe(entry.recipe)',
    tags: ['flower', 'vegetation', 'anime'],
    thumbnail: thumbnailFor('tree/flower/daisy'),
  }),
]);

let cached = null;

export function publicMcpCatalogEntries() {
  if (cached) return cached;
  const entries = [...CURATED_PLANT_RECIPES];

  for (const option of getRockgenPresetOptions()) {
    const id = `rock/${slug(option.value)}`;
    entries.push(entry({
      cluster: 'rockgen',
      description: option.description,
      id,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.value, schema: 'rockgenPresetRef', version: 1 },
      spawn: 'meshDocument(createRockDocument({ preset: entry.recipe.preset, seed }))',
      tags: ['rock', 'nature', 'stone'],
      thumbnail: thumbnailFor(id),
    }));
  }

  for (const preset of BUILT_IN_DEBRIS_PRESETS) {
    const id = `debris/${slug(preset.id)}`;
    entries.push(entry({
      cluster: 'debrisgen',
      description: preset.description,
      id,
      kind: 'recipe',
      label: preset.label,
      recipe: { schema: 'debrisSettings', settings: preset.settings, version: 1 },
      spawn: 'createDebrisAsset(entry.recipe.settings)',
      tags: ['debris', preset.type, slug(preset.variant)],
      thumbnail: thumbnailFor(id),
    }));
  }

  for (const option of getWaterPresetOptions()) {
    entries.push(entry({
      cluster: 'water',
      description: option.description,
      id: `water/${slug(option.id)}`,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.id, schema: 'waterPresetRef', version: 1 },
      spawn: `new WaterSurface({ preset: '${option.id}', width, depth, bedHeight: heightAt })`,
      tags: ['water', 'settings', 'anime'],
    }));
  }

  for (const option of getSkyPresetOptions()) {
    entries.push(entry({
      cluster: 'sky',
      description: option.description,
      id: `sky/${slug(option.id)}`,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.id, schema: 'skyPresetRef', version: 1 },
      spawn: `new StylizedSky({ preset: '${option.id}' })`,
      tags: ['sky', 'settings', 'anime'],
    }));
  }

  for (const id of Object.keys(POST_PROCESSING_PRESETS)) {
    entries.push(entry({
      cluster: 'post',
      id: `post/${slug(id)}`,
      kind: 'preset',
      label: id,
      recipe: { preset: id, schema: 'postPresetRef', version: 1 },
      spawn: `createPostProcessingPipeline({ renderer, scene, camera, preset: '${id}' })`,
      tags: ['post', 'settings', 'anime'],
    }));
  }

  for (const option of getToonPresetOptions()) {
    entries.push(entry({
      cluster: 'toon',
      description: option.description,
      id: `toon/${slug(option.id)}`,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.id, schema: 'toonPresetRef', version: 1 },
      spawn: `applyToonShader(characterRoot, { settings: createToonSettings({ preset: '${option.id}' }) })`,
      tags: ['toon', 'character', 'anime'],
    }));
  }

  cached = Object.freeze(entries);
  return cached;
}
