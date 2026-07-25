// Focused contract and construction checks for the So Stylized rock/mountain
// source-material port. Texture IO is stubbed; the real TSL node graphs are
// still built for representative snow/moss and mountain profiles.
//
//   node scripts/verify-rock-reference-materials.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import { loadRockReferenceSourceMaterialProfile } from
  '../src/rockgen/reference/referenceSourceMaterial.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(
  SCRIPT_DIR,
  '..',
  'src',
  'rockgen',
  'reference',
  'referenceSourceMaterial.js',
);
const source = readFileSync(SOURCE_PATH, 'utf8');

function section(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `${start}: source section exists`);
  return source.slice(first, last);
}

function saturate(value) {
  return Math.min(Math.max(value, 0), 1);
}

function linearRamp(value, low, high) {
  return saturate((value - low) / (high - low));
}

function cheapContrast(value, contrast) {
  return saturate((value - 0.5) * (contrast + 1) + 0.5);
}

function iorFromUnrealSpecular(specular) {
  const rootF0 = Math.sqrt(saturate(specular) * 0.08);
  return (1 + rootF0) / (1 - rootF0);
}

function dielectricF0(ior) {
  return ((ior - 1) / (ior + 1)) ** 2;
}

// The source ramps are piecewise linear, including the authored top mask.
assert.equal(linearRamp(10, 10, 20), 0);
assert.equal(linearRamp(15, 10, 20), 0.5);
assert.equal(linearRamp(20, 10, 20), 1);
assert.equal(cheapContrast(0.25, 0.3), 0.175);
assert.equal(cheapContrast(0.5, 0.3), 0.5);
assert.equal(saturate(0.2 * 12 - 2), 0.40000000000000036);

for (const specular of [0.2, 0.7]) {
  const ior = iorFromUnrealSpecular(specular);
  assert.ok(
    Math.abs(dielectricF0(ior) - 0.08 * specular) < 1e-12,
    `UE Specular ${specular} maps to the same dielectric F0`,
  );
}

// Source-shape assertions keep the high-impact parity decisions from silently
// regressing to the former radial/smoothstep and fixed-projection shortcuts.
assert.match(source, /function sourcePixelDepth\(\)[\s\S]*?positionView\.z\.negate\(\)/);
assert.doesNotMatch(source, /distance\s*\(\s*cameraPosition\s*,\s*positionWorld\s*\)/);
assert.match(source, /function sourceLinearRamp\(/);
assert.match(source, /function sourceCheapContrast\(/);
assert.match(source, /pow\(abs\(normalNode\), vec3\(projectionPower\)\)/);
assert.match(source, /function sourceWorldAlignedNormal\(/);
assert.match(source, /function sourceWorldAlignedNormal\([\s\S]*?CreateThirdOrthogonalVector/);
assert.match(source, /const projectedXyz = mix\(projectedXY, projectedZWorld, zAlpha\)/);
assert.match(source, /function sourceWorldNormalToTangent\(/);
assert.match(source, /function sourceTangentNormalToView\(/);
assert.match(source, /function sourceBlendAngleCorrectedNormals\(/);
assert.match(source, /t\.mul\(dot\(t, u\)\)\.sub\(u\.mul\(t\.z\)\)/);
assert.match(source, /sourceWorldNormalToTangent\(crackWorld\)/);
assert.match(source, /sourceBlendAngleCorrectedNormals\(tangent, crackTangent\)/);
assert.match(source, /normalResponseBridge = 0/);
assert.match(source, /stylizedNormalResponseBridge = 0/);
assert.match(source, /const stylizedBridge = THREE\.MathUtils\.clamp/);

const mountainSection = section('function buildMountainMaterial', 'function buildRockNormals');
assert.match(mountainSection, /sourceCheapContrast\(/);
assert.match(mountainSection, /const authoredV = uv\(\)\.y/);
assert.match(mountainSection, /sourceLinearRamp\([\s\S]*?sourcePixelDepth\(\)/);
assert.doesNotMatch(mountainSection, /smoothstep\(/);
assert.doesNotMatch(mountainSection, /distance\(/);

const mossSection = section('function buildMossSurface', 'function buildSnowSurface');
assert.ok(
  mossSection.indexOf("'Moss Color 2'") < mossSection.indexOf("'Moss Color'"),
  'moss preserves the source Color 2 -> Color interpolation order',
);
assert.match(mossSection, /const alpha = clamp\(pow\(/);

const snowSection = section('function buildSnowSurface', 'function buildTopLayerMask');
assert.match(snowSection, /const color = sourcePlanar\(/);
assert.match(snowSection, /maps\.snowSpecular/);
assert.doesNotMatch(snowSection, /sourceTriplanar\(/);

const topMaskSection = section('function buildTopLayerMask', 'function buildRockMaterial');
assert.match(topMaskSection, /explicitNormalWorld\.y[\s\S]*?'Top Layer Sharpness'/);
assert.match(topMaskSection, /\.add\(scalar\(profile, 'Top Layer Offset'/);
assert.match(topMaskSection, /texture\(maps\.topMask\)\.sample\(uv\(\)\)\.r/);

const rockSection = section('function buildRockMaterial', 'async function buildProfileTemplate');
assert.ok(
  rockSection.indexOf("switchValue(profile, 'Moss?', false)")
    < rockSection.indexOf("switchValue(profile, 'TopGrass?', false)"),
  'moss attributes are blended before the mutually exclusive top layer',
);
assert.ok(
  rockSection.indexOf('if (topGrass)') < rockSection.indexOf('else if (topSnow)'),
  'top-layer static priority keeps grass before snow',
);
assert.ok(
  rockSection.indexOf('else if (topSnow)') < rockSection.indexOf('else if (topSand)'),
  'top-layer static priority keeps snow before sand',
);
assert.match(rockSection, /material\.iorNode = sourceIorFromSpecular\(specularNode\)/);
assert.match(rockSection, /material\.specularIntensityNode = float\(1\.0\)/);

const loaderSection = section('async function buildProfileTemplate', 'async function buildTemplate');
assert.match(loaderSection, /snowSpecular: topSnow \? ROCK_FUNCTION_TEXTURES\.snowSpecular : null/);
assert.match(loaderSection, /topMask: \(topGrass \|\| topSnow \|\| topSand\)/);

const texturePaths = Object.freeze({
  crack: '/Game/Test/T_Crack_N.T_Crack_N',
  grass: '/Game/SoStylized/Environment/Landscape/Textures/T_Grass1_BC.T_Grass1_BC',
  moss: '/Game/Test/T_Moss.T_Moss',
  mountainNoise: '/Game/SoStylized/Textures/Noise/T_NoiseStylized.T_NoiseStylized',
  mountainRock: '/Game/SoStylized/Environment/Rocks/Textures/Classic/T_RockClassic_BC.T_RockClassic_BC',
  rock: '/Game/Test/T_Rock.T_Rock',
  snow: '/Game/SoStylized/Environment/Landscape/Textures/T_Snow_BC.T_Snow_BC',
  snowSpecular: '/Game/SoStylized/Textures/Noise/T_ChromaNoise_Blurred.T_ChromaNoise_Blurred',
  stylized: '/Game/Test/T_Stylized_N.T_Stylized_N',
  topMask: '/Game/Test/T_TopMask.T_TopMask',
});

const rockPath = '/Game/Test/MI_RockSnow.MI_RockSnow';
const mountainPath = '/Game/Test/MI_Mountain_Snowy.MI_Mountain_Snowy';
const manifest = {
  schema: 'toonlab.rock-material-source',
  materials: [
    {
      path: rockPath,
      chain: ['/Game/Test/M_Rock.M_Rock', rockPath],
      parameters: {
        scalar: {
          'Moss Multiply': 5,
          MossOffset: 0.3,
          MossSharpness: 1,
          MossSize: 1200,
          'Projection Contrast': 0.5,
          'Rock Normal Distance': 20000,
          'Rock Scale': 2500,
          'Snow Scale': 5000,
          'Snow Specular Scale': 75,
          'Top Layer Offset': -2,
          'Top Layer Sharpness': 12,
        },
        static_switch: {
          'MaskTopLayer?': true,
          'Moss?': true,
          'TopGrass?': false,
          'TopSand?': false,
          'TopSnow?': true,
          'UseStylizedNormalMap?': true,
        },
        texture: {
          MossTexture: texturePaths.moss,
          'Rock Normal Texture': texturePaths.crack,
          'Rock Texture': texturePaths.rock,
          'Snow Texture': texturePaths.snow,
          'Stylized Normal Map': texturePaths.stylized,
          'Top Layer Mask': texturePaths.topMask,
        },
        vector: {},
      },
    },
    {
      path: mountainPath,
      chain: ['/Game/Test/M_Mountain.M_Mountain', mountainPath],
      parameters: {
        scalar: {
          'Distant Fade End': 400000,
          'Distant Fade Max': 0.4,
          'Distant Fade Start': 50000,
          'Grass Noise Strength': 0.133068994,
          'Grass Slope Max': 0.126000002,
          'Grass Top Fadeout': 0.032000002,
          'Noise Contrast': 0.3,
          'Noise Size': 320000,
          'Snow Noise Strength': 0.952030003,
          'Snow Top Amount': 0.660000026,
          Specular: 0.7,
          'Textures Scale': 32000,
        },
        static_switch: {},
        texture: {},
        vector: {},
      },
    },
  ],
  textures: {},
};

for (const [name, unrealPath] of Object.entries(texturePaths)) {
  manifest.textures[unrealPath] = {
    addressX: 'TA_Wrap',
    addressY: 'TA_Wrap',
    file: `textures/${name}.png`,
    srgb: !/(_N|normal|stylized|crack)/i.test(`${name}:${unrealPath}`),
  };
}

const requestedTextures = [];
const originalFetch = globalThis.fetch;
const originalLoadAsync = THREE.TextureLoader.prototype.loadAsync;
const testBaseUrl = 'https://rock-material-contract.invalid/material-source';

globalThis.fetch = async (url) => {
  assert.equal(String(url), `${testBaseUrl}/manifest.json`, 'manifest request URL');
  return {
    json: async () => manifest,
    ok: true,
    status: 200,
  };
};
THREE.TextureLoader.prototype.loadAsync = async (url) => {
  requestedTextures.push(String(url));
  return new THREE.Texture();
};

try {
  const [rockMaterial, mountainMaterial] = await Promise.all([
    loadRockReferenceSourceMaterialProfile(rockPath, { baseUrl: testBaseUrl }),
    loadRockReferenceSourceMaterialProfile(mountainPath, { baseUrl: testBaseUrl }),
  ]);

  assert.ok(rockMaterial.isMeshPhysicalNodeMaterial, 'rock profile constructs a physical node material');
  assert.ok(rockMaterial.colorNode, 'rock profile constructs the base/top color graph');
  assert.ok(rockMaterial.normalNode, 'rock profile constructs the authored combined normal graph');
  assert.ok(rockMaterial.iorNode, 'rock profile constructs UE-compatible IOR/F0 graph');
  assert.ok(mountainMaterial.isMeshPhysicalNodeMaterial, 'mountain profile constructs a node material');
  assert.ok(mountainMaterial.colorNode, 'mountain profile constructs remapped color masks');
  assert.ok(mountainMaterial.iorNode, 'mountain profile maps UE specular to IOR/F0');

  for (const requiredFile of [
    'textures/snowSpecular.png',
    'textures/topMask.png',
    'textures/crack.png',
    'textures/stylized.png',
  ]) {
    assert.ok(
      requestedTextures.some((url) => url.endsWith(requiredFile)),
      `${requiredFile}: active source texture is requested`,
    );
  }

  rockMaterial.dispose();
  mountainMaterial.dispose();
} finally {
  globalThis.fetch = originalFetch;
  THREE.TextureLoader.prototype.loadAsync = originalLoadAsync;
}

console.log('Rock reference source materials: parity contract and node construction OK.');
