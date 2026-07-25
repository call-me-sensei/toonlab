#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SO_STYLIZED_UNITY_GRASS,
  SO_STYLIZED_UNITY_GRASS_VARIANTS,
  SO_STYLIZED_UNITY_TERRAIN_LAYERS,
  isSoStylizedUnityGrassProfile,
  resolveSoStylizedUnityGrassVariant,
  soStylizedUnityGrassCastsShadow,
} from '../src/environment/soStylizedUnityEnvironmentMaterials.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized-unity/environment-baseline/environment-baseline.json',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function close(actual, expected, epsilon = 1e-7) {
  return Math.abs(Number(actual) - Number(expected)) <= epsilon;
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
assert(manifest.schema === 'toonlab.sostylized-unity.environment-baseline', 'Unexpected baseline schema.');
assert(manifest.version === 1, 'Unexpected baseline schema version.');
assert(manifest.grass.shaderGuid === SO_STYLIZED_UNITY_GRASS.shaderGuid, 'Grass shader GUID drifted.');
assert(close(manifest.grass.values.smoothness, SO_STYLIZED_UNITY_GRASS.smoothness), 'Grass smoothness drifted.');
assert(close(manifest.grass.values.emissiveStrength, SO_STYLIZED_UNITY_GRASS.emissiveStrength), 'Grass emission drifted.');
assert(close(manifest.grass.values.alphaClipThreshold, SO_STYLIZED_UNITY_GRASS.alphaClipThreshold), 'Grass alpha clip drifted.');
assert(manifest.grass.gradient.length === 4, 'Unity grass must retain all four gradient keys.');
assert(Object.keys(manifest.grass.variants).length === 2, 'Snow/desert grass variants are missing.');
for (const [name, variant] of Object.entries(SO_STYLIZED_UNITY_GRASS_VARIANTS)) {
  if (name === 'grass') continue;
  const extracted = manifest.grass.variants[name];
  assert(extracted, `Unity grass variant ${name} is missing.`);
  assert(close(extracted.smoothness, variant.smoothness), `${name} grass smoothness drifted.`);
  assert(close(extracted.hueVariation, variant.hueVariation), `${name} grass hue variation drifted.`);
}

const runtimeLayers = Object.entries(SO_STYLIZED_UNITY_TERRAIN_LAYERS);
assert(runtimeLayers.length === 8, 'Unity Terrain/Lit baseline must expose eight layers.');
assert(SO_STYLIZED_UNITY_TERRAIN_LAYERS.Grass.diffuse === 'T_Grass2_BC.png', 'Terrain grass must use T_Grass2_BC.');
for (const [name, runtime] of runtimeLayers) {
  const extracted = manifest.terrain.layers.find((layer) => layer.id === name);
  assert(extracted, `Extracted Terrain/Lit layer ${name} is missing.`);
  assert(extracted.diffuseTexture.endsWith(runtime.diffuse), `${name} diffuse mismatch.`);
  assert(extracted.normalTexture === null || extracted.normalTexture.endsWith(runtime.normal), `${name} normal mismatch.`);
  assert(close(extracted.tileSize, runtime.tileSize), `${name} tile size mismatch.`);
  assert(close(extracted.metallic, runtime.metallic), `${name} metallic mismatch.`);
  assert(close(extracted.smoothness, runtime.smoothness), `${name} smoothness mismatch.`);
}

const grassProfile = {
  family: 'foliage',
  path: '/Game/SoStylized/Environment/Foliage/Materials/MI_Grass.MI_Grass',
};
assert(isSoStylizedUnityGrassProfile(grassProfile), 'MI_Grass no longer resolves to Unity S_Foliage.');
assert(!soStylizedUnityGrassCastsShadow(grassProfile), 'Unity grass prefab shadow override was lost.');
const snowGrassProfile = {
  family: 'foliage',
  path: '/Game/SoStylized/Environment/Foliage/Materials/MI_GrassSnow_NoRVT.MI_GrassSnow_NoRVT',
};
assert(resolveSoStylizedUnityGrassVariant(snowGrassProfile) === 'snow', 'SnowPines snow grass is not routed to MV_GrassSnow.');
assert(!soStylizedUnityGrassCastsShadow(snowGrassProfile), 'Unity snow grass must not cast shadows.');

for (const [source, record] of Object.entries(manifest.sources)) {
  const actual = await hashFile(resolve(manifest.sourceRoot, source));
  assert(actual === record.sha256, `Unity source hash changed: ${source}`);
}
for (const [source, record] of Object.entries(manifest.textures)) {
  const actual = await hashFile(resolve(manifest.sourceRoot, source));
  assert(actual === record.sha256, `Unity texture hash changed: ${source}`);
  await readFile(resolve(dirname(MANIFEST_PATH), record.file));
}

const sourceMaterialCode = await readFile(
  resolve(ROOT_DIR, 'src/environment/soStylizedSourceMaterials.js'),
  'utf8',
);
assert(sourceMaterialCode.includes("reconstruction: 'unity-s-foliage'"), 'Unity grass route is not connected.');
assert(sourceMaterialCode.includes('loadSoStylizedUnityTerrainTextures()'), 'Unity Terrain/Lit route is not connected.');
assert(sourceMaterialCode.includes("'disabled; absent from Unity URP Terrain/Lit'"), 'UE AutoCliff is still active on the Unity terrain path.');

console.log('So Stylized Unity environment baseline verified.');
console.log('Grass: 3/3 Unity variants; cast shadows off; 4/4 gradient keys connected.');
console.log(`Terrain: ${runtimeLayers.length}/8 URP Terrain/Lit layers connected; T_Grass2_BC active.`);
