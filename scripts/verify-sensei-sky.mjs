#!/usr/bin/env node
// Guards the Sensei sky variation pipeline:
//   1. The bake is deterministic — two runs produce byte-identical binary
//      assets (contract/snapshot JSONs carry a timestamp and are excluded).
//   2. Every baked file carries the correct container magic.
//   3. The contract exposes every field the P18 preview sky renderer reads,
//      and each scenario row fits inside the baked atlases.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'assets-local/generated/sensei-sky');
const GENERATOR = resolve(ROOT, 'scripts/generate-sensei-sky-assets.mjs');

const BINARY_ASSETS = [
  'sky-dome.glb',
  'cloud-shell.glb',
  'sky-atlas.exr',
  'cloud-atlas.exr',
  'cloud-shell.png',
  'background-clouds.png',
];

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function bake() {
  execFileSync(process.execPath, [GENERATOR], { stdio: 'pipe' });
  return Object.fromEntries(BINARY_ASSETS.map((name) => [
    name,
    createHash('sha256').update(readFileSync(resolve(OUT_DIR, name))).digest('hex'),
  ]));
}

const first = bake();
const second = bake();
for (const name of BINARY_ASSETS) {
  check(`${name} deterministic`, first[name] === second[name]);
}

const magic = {
  'background-clouds.png': [0x89, 0x50, 0x4E, 0x47],
  'cloud-atlas.exr': [0x76, 0x2F, 0x31, 0x01],
  'cloud-shell.glb': [0x67, 0x6C, 0x54, 0x46],
  'cloud-shell.png': [0x89, 0x50, 0x4E, 0x47],
  'sky-atlas.exr': [0x76, 0x2F, 0x31, 0x01],
  'sky-dome.glb': [0x67, 0x6C, 0x54, 0x46],
};
for (const [name, expected] of Object.entries(magic)) {
  const head = readFileSync(resolve(OUT_DIR, name)).subarray(0, 4);
  check(`${name} magic`, expected.every((byte, index) => head[index] === byte));
}

const contract = JSON.parse(readFileSync(resolve(OUT_DIR, 'contract.json'), 'utf8'));
const sky = contract.sky ?? {};
// Everything labs/shared/p18/referenceSky.js reads from a sky source.
const requiredSkyFields = [
  'visible', 'mesh', 'atlas', 'atlasWidth', 'atlasHeight', 'curveRow',
  'brightness', 'skySourceComponentScale', 'skySourceUnitsToMeters',
  'backgroundClouds', 'backgroundCloudTexture', 'backgroundCloudStrength',
  'backgroundCloudVerticalOffset', 'backgroundCloudVerticalStretch',
  'cloudShell', 'cloudShellMesh', 'cloudShellTexture', 'cloudShellAtlas',
  'cloudShellAtlasWidth', 'cloudShellAtlasHeight', 'cloudShellCurveRow',
  'cloudShellStrength', 'cloudShellRotationSpeed',
  'cloudShellSourceComponentScale', 'cloudShellGltfUnitsToMeters',
];
for (const field of requiredSkyFields) {
  check(`contract.sky.${field}`, sky[field] !== undefined);
}
check('contract scenarios present', Array.isArray(contract.scenarios)
  && contract.scenarios.length > 0);
for (const scenario of contract.scenarios ?? []) {
  check(
    `scenario ${scenario.id} rows fit atlases`,
    scenario.curveRow >= 0 && scenario.curveRow < sky.atlasHeight
      && scenario.cloudShellCurveRow >= 0
      && scenario.cloudShellCurveRow < sky.cloudShellAtlasHeight,
  );
}
check('provenance declares no source pixels',
  contract.provenance?.sourcePixelsIncluded === false);

if (failures) {
  console.error(`\nSensei sky verification failed (${failures}).`);
  process.exit(1);
}
console.log('\nSensei sky verification passed.');
