#!/usr/bin/env node

// One-time, byte-preserving migration for the two captured Unity Mega bundles.
// It restores the pre-probe scene-manifest.json bytes and moves exactly the
// three later Terrain authority fields into their own hashable sidecar.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_BUNDLES = [
  'assets-local/sostylized-unity/mega-scene-native-pc-current',
  'assets-local/sostylized-unity/mega-scene-native-package-recommended',
];
const EXPECTED_RESTORED_HASHES = new Map([
  ['mega-scene-native-pc-current', '762ac1e90938e2d793618163dc150990f8c03ccdb02fedde70646c7244170179'],
  ['mega-scene-native-package-recommended', '9090c20497ce1f111cab989e7f0fb7d05ce18634187616edb4c60dcc556bf563'],
]);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function findArrayEnd(source, start) {
  let depth = 1;
  let escaped = false;
  let quoted = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) return index + 1;
  }
  throw new Error('Unterminated JSON array while restoring Unity manifest.');
}

function removeArrayProperty(source, name, { last = false } = {}) {
  const token = `            "${name}": [`;
  const propertyStart = source.indexOf(token);
  assert.notEqual(propertyStart, -1, `missing Terrain ${name}`);
  const propertyEnd = findArrayEnd(source, propertyStart + token.length);
  if (last) {
    assert.equal(source.slice(propertyStart - 2, propertyStart), ',\n', `${name} is not the final property`);
    return source.slice(0, propertyStart - 2) + source.slice(propertyEnd);
  }
  assert.equal(source.slice(propertyEnd, propertyEnd + 2), ',\n', `${name} has no trailing comma`);
  return source.slice(0, propertyStart) + source.slice(propertyEnd + 2);
}

function stripNativeAuthorityBytes(source) {
  let restored = removeArrayProperty(source, 'position');
  const transformLine = /^            "renderTransformAuthority": .*\n/m;
  assert.match(restored, transformLine, 'missing Terrain renderTransformAuthority');
  restored = restored.replace(transformLine, '');
  return removeArrayProperty(restored, 'surfaceProbes', { last: true });
}

function createNativeAuthority(manifest) {
  return {
    schema: 'toonlab.sostylized-unity.terrain-native-authority',
    schemaVersion: 1,
    sourceScene: manifest.sourceScene,
    terrains: manifest.terrains.map((terrain) => ({
      index: terrain.index,
      node: terrain.node,
      terrainData: terrain.terrainData,
      position: terrain.position,
      renderTransformAuthority: terrain.renderTransformAuthority,
      surfaceProbes: terrain.surfaceProbes,
    })),
  };
}

for (const relativeBundle of process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : DEFAULT_BUNDLES) {
  const bundle = path.resolve(ROOT, relativeBundle);
  const manifestPath = path.join(bundle, 'scene-manifest.json');
  const sidecarPath = path.join(bundle, 'terrain-native-authority.json');
  const currentBytes = fs.readFileSync(manifestPath);
  const currentText = currentBytes.toString('utf8');
  const expectedHash = EXPECTED_RESTORED_HASHES.get(path.basename(bundle));
  assert.ok(expectedHash, `no restored hash oracle for ${path.basename(bundle)}`);

  if (!currentText.includes('            "surfaceProbes": [')) {
    assert.equal(sha256(currentBytes), expectedHash, `${relativeBundle} restored manifest drifted`);
    assert.ok(fs.existsSync(sidecarPath), `${relativeBundle} native authority sidecar is missing`);
    console.log(`${relativeBundle}: already migrated (${expectedHash})`);
    continue;
  }

  const manifest = JSON.parse(currentText);
  assert.equal(manifest.terrains.length, 1, 'Mega migration expects exactly one Terrain');
  const authority = createNativeAuthority(manifest);
  assert.equal(authority.terrains[0].surfaceProbes.length, 81, 'native probe grid is not 9x9');
  const semanticManifest = structuredClone(manifest);
  for (const terrain of semanticManifest.terrains) {
    delete terrain.position;
    delete terrain.renderTransformAuthority;
    delete terrain.surfaceProbes;
  }

  const restoredText = stripNativeAuthorityBytes(currentText);
  assert.deepEqual(JSON.parse(restoredText), semanticManifest, 'migration removed a non-authority field');
  assert.equal(sha256(restoredText), expectedHash, `${relativeBundle} did not reproduce pinned bytes`);

  fs.writeFileSync(sidecarPath, `${JSON.stringify(authority, null, 4)}\n`);
  fs.writeFileSync(manifestPath, restoredText);
  console.log(`${relativeBundle}: restored ${expectedHash}`);
  console.log(`  authority: ${sha256(fs.readFileSync(sidecarPath))}`);
}
