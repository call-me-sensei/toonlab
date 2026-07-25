#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SO_STYLIZED_MATERIAL_FAMILIES } from '../src/environment/soStylizedSourceLibrary.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const LEDGER_PATH = resolve(ROOT_DIR, 'docs', 'source-shader-port-ledger.json');
const NODE_MAP_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'shader-node-map.json',
);

const [ledgerText, nodeMapText] = await Promise.all([
  readFile(LEDGER_PATH, 'utf8'),
  readFile(NODE_MAP_PATH, 'utf8'),
]);
const ledger = JSON.parse(ledgerText);
const nodeMap = JSON.parse(nodeMapText);

assert.equal(ledger.schema, 'toonlab.sostylized-source-port-ledger');
assert.equal(ledger.version, 1);
assert.deepEqual(
  ledger.shaderFamilies.map(({ family }) => family).sort(),
  [...SO_STYLIZED_MATERIAL_FAMILIES].sort(),
  'port ledger must cover every source family exactly once',
);
assert.equal(new Set(ledger.shaderFamilies.map(({ family }) => family)).size, 19);

const validStatuses = new Set(['complete', 'partial', 'not-started', 'mapped']);
for (const entry of ledger.shaderFamilies) {
  assert.equal(entry.profiles, nodeMap.familyCounts[entry.family], `${entry.family} profile count drifted`);
  assert.equal(entry.sourceMap, 'complete', `${entry.family} source map is no longer complete`);
  assert.ok(validStatuses.has(entry.runtimePort), `${entry.family} has invalid runtime status`);
  assert.ok(validStatuses.has(entry.parity), `${entry.family} has invalid parity status`);
  assert.ok(entry.nextGate, `${entry.family} needs an explicit next gate`);
}
for (const entry of ledger.rendererSystems) {
  assert.ok(validStatuses.has(entry.status), `${entry.system} has invalid status`);
  assert.ok(entry.remaining, `${entry.system} needs an explicit remaining contract`);
}

function counts(entries, field) {
  return entries.reduce((result, entry) => {
    const status = entry[field];
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
}

const runtime = counts(ledger.shaderFamilies, 'runtimePort');
const parity = counts(ledger.shaderFamilies, 'parity');
const renderer = counts(ledger.rendererSystems, 'status');
const summary = {
  sourceInventory: nodeMap.counts,
  shaderFamilies: {
    total: ledger.shaderFamilies.length,
    runtimeComplete: runtime.complete ?? 0,
    runtimePartial: runtime.partial ?? 0,
    runtimeNotStarted: runtime['not-started'] ?? 0,
    parityComplete: parity.complete ?? 0,
    leftToParity: ledger.shaderFamilies.length - (parity.complete ?? 0),
  },
  rendererSystems: {
    total: ledger.rendererSystems.length,
    complete: renderer.complete ?? 0,
    partial: renderer.partial ?? 0,
    notStarted: renderer['not-started'] ?? 0,
  },
};

console.log('So Stylized UE -> ToonLab port ledger verified');
console.log(JSON.stringify(summary, null, 2));
console.log('\nShader families');
for (const entry of ledger.shaderFamilies) {
  console.log(
    `${entry.family.padEnd(14)} profiles=${String(entry.profiles).padStart(3)}`
    + ` source=${entry.sourceMap.padEnd(8)} runtime=${entry.runtimePort.padEnd(11)}`
    + ` parity=${entry.parity}`,
  );
}
console.log('\nRenderer and scene systems');
for (const entry of ledger.rendererSystems) {
  console.log(`${entry.system.padEnd(24)} ${entry.status}`);
}
