#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UE_MATERIAL_NODE_CROSSWALK } from './environment-shader-node-crosswalk.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const AUDIT_PATH = resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-audit.json');
const SOURCE_MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'material-source',
  'manifest.json',
);
const NODE_MAP_PATH = resolve(
  process.env.TOONLAB_ENVIRONMENT_SHADER_NODE_MAP_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'shader-node-map.json'),
);

const EXPECTED = Object.freeze({
  expressionClasses: 95,
  functionGraphs: 25,
  materialGraphs: 27,
  nodes: 4664,
  profiles: 394,
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const [auditText, sourceManifestText, mapText] = await Promise.all([
  readFile(AUDIT_PATH, 'utf8'),
  readFile(SOURCE_MANIFEST_PATH, 'utf8'),
  readFile(NODE_MAP_PATH, 'utf8'),
]);
const nodeMap = JSON.parse(mapText);

assert.equal(nodeMap.schema, 'toonlab.sostylized-environment-shader-node-map');
assert.equal(nodeMap.version, 1);
assert.equal(nodeMap.authority.auditSha256, sha256(auditText), 'material audit changed; regenerate map');
assert.equal(
  nodeMap.authority.sourceManifestSha256,
  sha256(sourceManifestText),
  'source manifest changed; regenerate map',
);
assert.deepEqual(nodeMap.counts, EXPECTED);

const mappedClasses = Object.keys(UE_MATERIAL_NODE_CROSSWALK).sort();
assert.deepEqual(nodeMap.mapping.expressionClasses, mappedClasses);
assert.equal(mappedClasses.length, EXPECTED.expressionClasses);

const graphs = [...nodeMap.materialGraphs, ...nodeMap.functionGraphs];
assert.equal(graphs.length, EXPECTED.materialGraphs + EXPECTED.functionGraphs);
let nodeCount = 0;
for (const graph of graphs) {
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.equal(ids.size, graph.nodes.length, `${graph.path} has duplicate node ids`);
  for (const node of graph.nodes) {
    nodeCount += 1;
    const expectedTranslation = UE_MATERIAL_NODE_CROSSWALK[node.ueClass];
    assert.ok(expectedTranslation, `${graph.path}/${node.id} is unmapped`);
    assert.deepEqual(node.translation, expectedTranslation);
    for (const input of node.inputs) {
      if (input.sourceNode) {
        assert.ok(
          ids.has(input.sourceNode),
          `${graph.path}/${node.id}.${input.name} references missing ${input.sourceNode}`,
        );
        assert.ok(
          Number.isInteger(input.sourceOutputIndex),
          `${graph.path}/${node.id}.${input.name} is missing its UE output index`,
        );
      }
    }
  }
  for (const [property, input] of Object.entries(graph.surface?.propertyInputs ?? {})) {
    if (input.sourceNode) {
      assert.ok(ids.has(input.sourceNode), `${graph.path}/${property} references missing node`);
    }
  }
  const { signature, ...unsignedGraph } = graph;
  assert.equal(signature, sha256(JSON.stringify(unsignedGraph)), `${graph.path} signature changed`);
}
assert.equal(nodeCount, EXPECTED.nodes);

const functionPaths = new Set(nodeMap.functionGraphs.map((graph) => graph.path));
for (const graph of graphs) {
  for (const node of graph.nodes) {
    const called = node.properties.material_function;
    if (called?.startsWith('/Game/SoStylized/')) {
      assert.ok(functionPaths.has(called), `${graph.path} calls unaudited pack function ${called}`);
    }
  }
}

assert.equal(nodeMap.profiles.length, EXPECTED.profiles);
assert.equal(new Set(nodeMap.profiles.map((profile) => profile.path)).size, EXPECTED.profiles);
for (const profile of nodeMap.profiles) {
  assert.ok(profile.family, `${profile.path} has no material family`);
  assert.ok(profile.masterGraph, `${profile.path} has no audited master graph`);
}

const statusTotal = Object.values(nodeMap.mapping.nodeStatusCounts)
  .reduce((sum, value) => sum + value, 0);
assert.equal(statusTotal, EXPECTED.nodes);
assert.equal(nodeMap.mapping.nodeStatusCounts.unmapped, undefined);

console.log('environment shader node map verification passed');
console.log(JSON.stringify({
  counts: nodeMap.counts,
  families: nodeMap.familyCounts,
  nodeStatusCounts: nodeMap.mapping.nodeStatusCounts,
}, null, 2));
