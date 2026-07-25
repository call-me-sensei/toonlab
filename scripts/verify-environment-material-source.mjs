#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SO_STYLIZED_LANDSCAPE_LAYERS,
  SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT,
  SO_STYLIZED_SOURCE_SCHEMA,
  classifySoStylizedMaterialProfile,
  inspectSoStylizedLandscapeWeightmapSet,
} from '../src/environment/soStylizedSourceLibrary.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const SOURCE_DIR = resolve(
  process.env.TOONLAB_ENVIRONMENT_MATERIAL_SOURCE_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-source'),
);
const MANIFEST_PATH = resolve(SOURCE_DIR, 'manifest.json');
const WEIGHT_MANIFEST_PATH = resolve(
  process.env.TOONLAB_LANDSCAPE_WEIGHT_OUTPUT
    || resolve(
      ROOT_DIR,
      'assets-local',
      'sostylized',
      'landscape-weight-layers',
      'SnowPines',
    ),
  'manifest.json',
);

const EXPECTED = Object.freeze({
  assets: 2125,
  curves: 109,
  functions: 25,
  materials: 394,
  meshes: 773,
  parameterCollections: 1,
  textures: 221,
});

const REQUIRED_CATEGORIES = [
  'Foliage', 'Landscape', 'Misc', 'Rocks', 'Sky', 'Trees', 'Water',
];

const REQUIRED_MASTERS = [
  'M_Bark',
  'M_CelestialBody',
  'M_Foliage',
  'M_Landscape',
  'M_Leaves',
  'M_Mountain',
  'M_Rock',
  'M_Snow',
  'M_StylizedClouds',
  'M_StylizedFogPP',
  'M_StylizedSky',
  'M_StylizedWater',
  'M_TreeSingleMat',
  'M_UnderwaterPPv2',
  'M_Waterfall',
];

const REQUIRED_FUNCTIONS = [
  'MF_FoliageInteraction',
  'MF_FoliageWind',
  'MF_RainWetness',
  'MF_Rock',
  'MF_TreeSway',
  'MF_VTBlend',
  'MF_WindColor',
];

function fail(message) {
  console.error(`environment source verification failed: ${message}`);
  process.exitCode = 1;
}

function objectName(path) {
  return String(path ?? '').split('.').at(-1)?.split('/').at(-1) ?? '';
}

if (!existsSync(MANIFEST_PATH)) {
  fail(`missing ${MANIFEST_PATH}; run npm run export:environment-source`);
} else {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest.schema !== SO_STYLIZED_SOURCE_SCHEMA) {
    fail(`schema is ${manifest.schema}, expected ${SO_STYLIZED_SOURCE_SCHEMA}`);
  }

  const counts = {
    assets: Object.values(manifest.assetClassCounts ?? {}).reduce((sum, value) => sum + value, 0),
    curves: manifest.curves?.length ?? 0,
    functions: manifest.materialFunctions?.length ?? 0,
    materials: manifest.materials?.length ?? 0,
    meshes: manifest.meshes?.length ?? 0,
    parameterCollections: manifest.parameterCollections?.length ?? 0,
    textures: Object.keys(manifest.textures ?? {}).length,
  };
  for (const [name, expected] of Object.entries(EXPECTED)) {
    if (counts[name] !== expected) fail(`${name}: ${counts[name]} (expected ${expected})`);
  }

  const categories = new Set(Object.keys(manifest.categoryCounts ?? {}));
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) fail(`missing mesh category ${category}`);
  }

  const materialPaths = new Set((manifest.materials ?? []).map((profile) => profile.path));
  const materialNames = new Set([...materialPaths].map(objectName));
  for (const master of REQUIRED_MASTERS) {
    if (!materialNames.has(master)) fail(`missing master material ${master}`);
  }

  const functionNames = new Set((manifest.materialFunctions ?? []).map((fn) => objectName(fn.path)));
  for (const fn of REQUIRED_FUNCTIONS) {
    if (!functionNames.has(fn)) fail(`missing material function ${fn}`);
  }

  for (const mesh of manifest.meshes ?? []) {
    for (const slot of mesh.materialSlots ?? []) {
      if (String(slot.material).startsWith('/Game/SoStylized/') && !materialPaths.has(slot.material)) {
        fail(`${mesh.sourceAssetName}/${slot.name} has unresolved material ${slot.material}`);
      }
    }
  }

  for (const [unrealPath, texture] of Object.entries(manifest.textures ?? {})) {
    if (!texture.file) {
      fail(`texture ${unrealPath} has no exported file`);
      continue;
    }
    if (!existsSync(resolve(SOURCE_DIR, texture.file))) {
      fail(`texture file is missing: ${texture.file}`);
    }
  }

  const curvePaths = new Set((manifest.curves ?? []).map((curve) => curve.path));
  for (const atlas of (manifest.curves ?? []).filter((curve) => curve.class === 'CurveLinearColorAtlas')) {
    for (const curvePath of atlas.gradient_curves ?? []) {
      if (!curvePaths.has(curvePath)) fail(`${objectName(atlas.path)} references missing ${curvePath}`);
    }
  }

  const collection = manifest.parameterCollections?.find((entry) =>
    objectName(entry.path) === 'MPC_GlobalEnvironment');
  if (!collection) fail('missing MPC_GlobalEnvironment');
  for (const scalar of ['Global Wind Intensity', 'Day Cycle Progress', 'Overcast', 'Rain Wetness']) {
    if (!collection?.scalar?.some((parameter) => parameter.parameter_name === scalar)) {
      fail(`MPC_GlobalEnvironment is missing ${scalar}`);
    }
  }

  const familyCounts = {};
  for (const profile of manifest.materials ?? []) {
    const family = classifySoStylizedMaterialProfile(profile);
    familyCounts[family] = (familyCounts[family] ?? 0) + 1;
  }

  const snowProfile = (manifest.materials ?? []).find((profile) =>
    objectName(profile.path) === 'MI_Snow');
  if (!snowProfile) {
    fail('missing MI_Snow');
  } else if (classifySoStylizedMaterialProfile(snowProfile) !== 'snow') {
    fail('MI_Snow must resolve to the dedicated snow family');
  }

  if (!existsSync(WEIGHT_MANIFEST_PATH)) {
    fail(`missing ${WEIGHT_MANIFEST_PATH}; run npm run export:landscape-weights`);
  }
  const weightmapRecord = existsSync(WEIGHT_MANIFEST_PATH)
    ? { manifest: JSON.parse(readFileSync(WEIGHT_MANIFEST_PATH, 'utf8')) }
    : null;
  const weightmapInspection = inspectSoStylizedLandscapeWeightmapSet(
    weightmapRecord,
    SO_STYLIZED_SNOWPINES_WEIGHTMAP_CONTRACT,
  );
  if (SO_STYLIZED_LANDSCAPE_LAYERS.length !== 10) {
    fail(`Landscape weightmap contract has ${SO_STYLIZED_LANDSCAPE_LAYERS.length} layers`);
  }
  if (weightmapInspection.status !== 'ready') {
    fail(`invalid SnowPines Landscape weightmaps: ${weightmapInspection.errors.join('; ')}`);
  }

  if (!process.exitCode) {
    console.log('environment source verification passed');
    console.log(JSON.stringify({
      counts,
      families: familyCounts,
      landscapeWeightmaps: {
        requiredLayers: SO_STYLIZED_LANDSCAPE_LAYERS,
        status: weightmapInspection.status,
      },
    }, null, 2));
  }
}
