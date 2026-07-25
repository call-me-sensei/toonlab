#!/usr/bin/env node

/**
 * Copy the licensed Unity foliage/terrain inputs needed by ToonLab's exact
 * So Stylized baseline into the gitignored local-asset area. The emitted
 * manifest records source hashes and the numeric material/layer values used by
 * the runtime; licensed textures never enter tracked source control.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..', '..');
const LICENSED_OUTPUT_ROOT = resolve(ROOT_DIR, 'assets-local', 'sostylized-unity');
const DEFAULT_PROJECT_SOURCE =
  '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity';
const PACKAGE_SOURCE = resolve(ROOT_DIR, '..', 'SoStylized-Unity');
const DEFAULT_OUTPUT = resolve(LICENSED_OUTPUT_ROOT, 'environment-baseline');

const GRASS = Object.freeze({
  sourceMaterial: 'Environment/Foliage/Materials/MV_Grass.mat',
  sourceParent: 'Environment/Foliage/Materials/M_Foliage.mat',
  sourceShaderGraph: 'Environment/Foliage/Shaders/S_FoliageShader.shadergraph',
  shaderGuid: '9def86e0e2fee9a4a8b1dbb313e05b9f',
  noise: 'Textures/Noise/T_NoiseRough_SplatterMap.png',
  values: Object.freeze({
    useTexture: false,
    bottomColor: [0.35493752, 0.631, 0.25813636],
    tipColor: [0.5241386, 0.7924528, 0.34015664],
    specularColor: [0.17273237, 0.511, 0.057577446],
    smoothness: 0.05,
    emissiveStrength: 0.03,
    hueVariationScale: 50,
    startFadeDistance: 80,
    endFadeDistance: 100,
    alphaClipThreshold: 0.9,
    additionalYOffset: 0.2,
    useWind: true,
    windIntensity: 10,
    windSpeed: 0.1,
    windWeight: 0.05,
  }),
  gradient: Object.freeze([
    { color: [0.4357688, 0.894, 0.03144722], position: 0 },
    { color: [0.243, 0.702, 0.043875], position: 0.2735332 },
    { color: [0.1446691, 0.5660378, 0.01334995], position: 0.6558785 },
    { color: [0.7573569, 0.879, 0.05892735], position: 0.9499962 },
  ]),
  variants: Object.freeze({
    snow: Object.freeze({
      sourceMaterial: 'Environment/Foliage/Materials/MV_GrassSnow.mat',
      bottomColor: [0.735849, 0.735849, 0.735849],
      tipColor: [0.67637706, 0.791317, 0.809],
      specularColor: [0.025364896, 0.3272502, 0.3584906],
      smoothness: 0.039,
      hueVariation: 0.08,
      useSolidTipColor: true,
    }),
    desert: Object.freeze({
      sourceMaterial: 'Environment/Foliage/Materials/MV_GrassDesert.mat',
      bottomColor: [0.7830189, 0.5712707, 0.40258992],
      tipColor: [0.72300005, 0.61576706, 0.138093],
      specularColor: [0.5566038, 0.41351464, 0.27042544],
      smoothness: 0.253,
      hueVariation: 0.02,
      useSolidTipColor: true,
    }),
  }),
});

const TERRAIN_LAYERS = Object.freeze([
  {
    id: 'DesertDirt', source: 'Environment/Landscape/Layer/TL_DesertDirt.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_DesertDirt_BC.png', normal: null,
    tileSize: 26, metallic: 0.438, smoothness: 0.38, normalScale: 1,
  },
  {
    id: 'DesertGrass', source: 'Environment/Landscape/Layer/TL_DesertGrass.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_DesertGrass_BC.png', normal: null,
    tileSize: 10, metallic: 0.499, smoothness: 0.405, normalScale: 0.2,
  },
  {
    id: 'DesertSand', source: 'Environment/Landscape/Layer/TL_DesertSand.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_DesertSand_BC.png',
    normal: 'Environment/Landscape/Textures/T_DesertSand_N.png',
    tileSize: 20, metallic: 0.499, smoothness: 0.405, normalScale: 0.2,
  },
  {
    id: 'Dirt', source: 'Environment/Landscape/Layer/TL_Dirt.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_Dirt_BC.png',
    normal: 'Environment/Landscape/Textures/T_Dirt_N.png',
    tileSize: 16, metallic: 0, smoothness: 0, normalScale: 1,
  },
  {
    id: 'Grass', source: 'Environment/Landscape/Layer/TL_Grass.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_Grass2_BC.png', normal: null,
    tileSize: 12, metallic: 0.099, smoothness: 0.25, normalScale: 1,
  },
  {
    id: 'Rock', source: 'Environment/Landscape/Layer/TL_Rock.terrainlayer',
    diffuse: 'Environment/Rocks/Textures/Classic/T_RockClassic_BC.PNG',
    normal: 'Environment/Rocks/Textures/Classic/T_RockClassic_N.PNG',
    tileSize: 32, metallic: 0, smoothness: 0, normalScale: 1,
  },
  {
    id: 'Sand', source: 'Environment/Landscape/Layer/TL_Sand.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_Sand.png',
    normal: 'Environment/Landscape/Textures/T_Sand_N.png',
    tileSize: 12, metallic: 0.614, smoothness: 0.228, normalScale: 1,
  },
  {
    id: 'Snow', source: 'Environment/Landscape/Layer/TL_Snow.terrainlayer',
    diffuse: 'Environment/Landscape/Textures/T_Snow_BC.PNG', normal: null,
    tileSize: 32, metallic: 0.791, smoothness: 0, normalScale: 1,
  },
]);

function parseArguments(argv) {
  const result = { source: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--source' || argument === '--output') {
      if (!argv[index + 1]) throw new Error(`${argument} requires a path.`);
      result[argument.slice(2)] = argv[index + 1];
      index += 1;
    } else if (argument.startsWith('--source=')) {
      result.source = argument.slice('--source='.length);
    } else if (argument.startsWith('--output=')) {
      result.output = argument.slice('--output='.length);
    } else if (argument === '--help') {
      console.log('Usage: node scripts/unity/extract-environment-baseline.mjs [--source path] [--output path]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function isWithin(root, target) {
  const next = relative(root, target);
  return next === '' || (!next.startsWith('..') && !isAbsolute(next));
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function numberProperty(text, name) {
  const match = text.match(new RegExp(`^\\s*- ${name}:\\s*([-+0-9.e]+)\\s*$`, 'm'));
  return match ? Number(match[1]) : null;
}

function colorProperty(text, name) {
  const match = text.match(new RegExp(
    `^\\s*- ${name}: \\{r: ([-+0-9.e]+), g: ([-+0-9.e]+), b: ([-+0-9.e]+), a: [-+0-9.e]+\\}\\s*$`,
    'm',
  ));
  return match ? match.slice(1, 4).map(Number) : null;
}

function assertClose(actual, expected, label, epsilon = 1e-7) {
  const values = Array.isArray(expected) ? expected : [expected];
  const actualValues = Array.isArray(actual) ? actual : [actual];
  if (actualValues.length !== values.length
    || values.some((value, index) => Math.abs(value - actualValues[index]) > epsilon)) {
    throw new Error(`${label} changed in the Unity source: expected ${values}, received ${actualValues}.`);
  }
}

async function verifyGrassSource(sourceRoot) {
  const materialText = await readFile(resolve(sourceRoot, GRASS.sourceMaterial), 'utf8');
  const parentText = await readFile(resolve(sourceRoot, GRASS.sourceParent), 'utf8');
  const checks = [
    [materialText, '_Use_Texture', 0],
    [materialText, '_Smoothness', GRASS.values.smoothness],
    [materialText, '_Emissive_Strength', GRASS.values.emissiveStrength],
    [materialText, '_Hue_Variation_Scale', GRASS.values.hueVariationScale],
    [materialText, '_Start_Fade_Distance', GRASS.values.startFadeDistance],
    [materialText, '_End_Fade_Distance', GRASS.values.endFadeDistance],
    [materialText, '_Additional_Z_Offset', GRASS.values.additionalYOffset],
    [parentText, '_Alpha_Clip_Threshold', GRASS.values.alphaClipThreshold],
    [parentText, '_UseWind', 1],
    [parentText, '_WindIntensity', GRASS.values.windIntensity],
    [parentText, '_WindSpeed', GRASS.values.windSpeed],
    [parentText, '_WindWeight', GRASS.values.windWeight],
  ];
  for (const [text, name, expected] of checks) {
    assertClose(numberProperty(text, name), expected, `MV_Grass ${name}`);
  }
  assertClose(colorProperty(materialText, '_Bottom_Color'), GRASS.values.bottomColor, 'MV_Grass bottom color');
  assertClose(colorProperty(materialText, '_Tip_Color'), GRASS.values.tipColor, 'MV_Grass tip color');
  assertClose(colorProperty(materialText, '_Specular_Color'), GRASS.values.specularColor, 'MV_Grass specular color');
  for (const [variantName, variant] of Object.entries(GRASS.variants)) {
    const text = await readFile(resolve(sourceRoot, variant.sourceMaterial), 'utf8');
    assertClose(numberProperty(text, '_Smoothness'), variant.smoothness, `${variantName} grass smoothness`);
    assertClose(numberProperty(text, '_Hue_Variation'), variant.hueVariation, `${variantName} grass hue variation`);
    assertClose(numberProperty(text, '_UseSolidTipColor'), variant.useSolidTipColor ? 1 : 0,
      `${variantName} grass solid-tip switch`);
    assertClose(colorProperty(text, '_Bottom_Color'), variant.bottomColor, `${variantName} grass bottom color`);
    assertClose(colorProperty(text, '_Tip_Color'), variant.tipColor, `${variantName} grass tip color`);
    assertClose(colorProperty(text, '_Specular_Color'), variant.specularColor,
      `${variantName} grass specular color`);
  }
}

async function verifyTerrainSource(sourceRoot) {
  for (const layer of TERRAIN_LAYERS) {
    const text = await readFile(resolve(sourceRoot, layer.source), 'utf8');
    const scalar = (key) => Number(text.match(new RegExp(`^\\s*${key}:\\s*([-+0-9.e]+)\\s*$`, 'm'))?.[1]);
    assertClose(scalar('m_Metallic'), layer.metallic, `${layer.id} metallic`);
    assertClose(scalar('m_Smoothness'), layer.smoothness, `${layer.id} smoothness`);
    assertClose(scalar('m_NormalScale'), layer.normalScale, `${layer.id} normal scale`);
    const tile = text.match(/^\s*m_TileSize: \{x: ([-+0-9.e]+), y: ([-+0-9.e]+)\}\s*$/m);
    assertClose(tile ? [Number(tile[1]), Number(tile[2])] : null,
      [layer.tileSize, layer.tileSize], `${layer.id} tile size`);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const sourceRoot = resolve(args.source
    ?? process.env.TOONLAB_SOSTYLIZED_UNITY_SOURCE
    ?? (existsSync(DEFAULT_PROJECT_SOURCE) ? DEFAULT_PROJECT_SOURCE : PACKAGE_SOURCE));
  const outputRoot = resolve(args.output
    ?? process.env.TOONLAB_SOSTYLIZED_UNITY_ENVIRONMENT_OUTPUT
    ?? DEFAULT_OUTPUT);
  if (!isWithin(LICENSED_OUTPUT_ROOT, outputRoot)) {
    throw new Error(`Output must stay inside ${LICENSED_OUTPUT_ROOT}.`);
  }
  if (!existsSync(sourceRoot)) throw new Error(`Unity source root not found: ${sourceRoot}`);

  await verifyGrassSource(sourceRoot);
  await verifyTerrainSource(sourceRoot);
  await mkdir(resolve(outputRoot, 'textures'), { recursive: true });

  const textureSources = [GRASS.noise];
  for (const layer of TERRAIN_LAYERS) {
    textureSources.push(layer.diffuse);
    if (layer.normal) textureSources.push(layer.normal);
  }
  const textureRecords = {};
  for (const source of [...new Set(textureSources)]) {
    const input = resolve(sourceRoot, source);
    if (!existsSync(input)) throw new Error(`Required Unity texture is missing: ${input}`);
    const outputName = source.split('/').at(-1);
    const output = resolve(outputRoot, 'textures', outputName);
    await copyFile(input, output);
    textureRecords[source] = {
      file: `textures/${outputName}`,
      sha256: await hashFile(input),
    };
  }

  const sourceRecords = {};
  for (const source of [
    GRASS.sourceMaterial,
    GRASS.sourceParent,
    GRASS.sourceShaderGraph,
    ...Object.values(GRASS.variants).map((variant) => variant.sourceMaterial),
    ...TERRAIN_LAYERS.map((layer) => layer.source),
  ]) {
    sourceRecords[source] = { sha256: await hashFile(resolve(sourceRoot, source)) };
  }

  const manifest = {
    schema: 'toonlab.sostylized-unity.environment-baseline',
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot,
    sourceEngine: 'Unity 6000.5 / URP 17.5',
    grass: {
      ...GRASS,
      noiseTexture: textureRecords[GRASS.noise].file,
    },
    terrain: {
      shader: 'Universal Render Pipeline/Terrain/Lit',
      workflow: 'metallic',
      layers: TERRAIN_LAYERS.map((layer) => ({
        ...layer,
        diffuseTexture: textureRecords[layer.diffuse].file,
        normalTexture: layer.normal ? textureRecords[layer.normal].file : null,
      })),
    },
    sources: sourceRecords,
    textures: textureRecords,
  };
  await writeFile(
    resolve(outputRoot, 'environment-baseline.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Unity environment baseline: ${outputRoot}`);
  console.log(
    `Copied ${Object.keys(textureRecords).length} textures; verified `
      + `${1 + Object.keys(GRASS.variants).length} grass materials and `
      + `${TERRAIN_LAYERS.length} terrain layers.`,
  );
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
