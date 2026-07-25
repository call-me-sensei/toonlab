#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifySoStylizedMaterialProfile } from '../src/environment/soStylizedSourceLibrary.js';
import { UE_MATERIAL_NODE_CROSSWALK } from './environment-shader-node-crosswalk.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const AUDIT_PATH = resolve(
  process.env.TOONLAB_ENVIRONMENT_MATERIAL_AUDIT_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-audit.json'),
);
const SOURCE_MANIFEST_PATH = resolve(
  process.env.TOONLAB_ENVIRONMENT_MATERIAL_SOURCE_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'material-source'),
  'manifest.json',
);
const OUTPUT_PATH = resolve(
  process.env.TOONLAB_ENVIRONMENT_SHADER_NODE_MAP_OUTPUT
    || resolve(ROOT_DIR, 'assets-local', 'sostylized', 'shader-node-map.json'),
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function localNodeName(reference) {
  if (!reference) return null;
  const separator = String(reference).lastIndexOf(':');
  return separator >= 0 ? String(reference).slice(separator + 1) : String(reference);
}

function normalizeInputs(inputs = {}) {
  const names = inputs.names ?? [];
  const nodes = inputs.nodes ?? [];
  const outputs = inputs.outputs ?? [];
  const outputIndices = inputs.outputIndices ?? [];
  const masks = inputs.masks ?? [];
  const length = Math.max(
    names.length,
    nodes.length,
    outputs.length,
    outputIndices.length,
    masks.length,
  );
  return Array.from({ length }, (_, index) => ({
    name: names[index] ?? `Input${index}`,
    mask: masks[index] ?? null,
    sourceNode: localNodeName(nodes[index]),
    sourceOutput: outputs[index] ?? '',
    sourceOutputIndex: outputIndices[index] ?? null,
  }));
}

function normalizeNode(node) {
  const {
    class: nodeClass,
    desc,
    inputs,
    name,
    outputs,
    ...properties
  } = node;
  const translation = UE_MATERIAL_NODE_CROSSWALK[nodeClass];
  if (!translation) {
    throw new Error(`No UE/TSL crosswalk entry for ${nodeClass}`);
  }
  return {
    id: name,
    ueClass: nodeClass,
    description: desc ?? '',
    inputs: normalizeInputs(inputs),
    outputs: outputs ?? [],
    properties,
    translation,
  };
}

function normalizePropertyInputs(propertyInputs = {}) {
  return Object.fromEntries(Object.entries(propertyInputs).map(([property, input]) => [
    property,
    {
      sourceNode: localNodeName(input?.node),
      sourceOutput: input?.output ?? '',
    },
  ]));
}

function normalizeGraph(record, kind) {
  const nodes = (record.expressions ?? []).map(normalizeNode);
  const graph = {
    path: record.path,
    kind,
    surface: kind === 'material' ? {
      blendMode: record.blend_mode,
      domain: record.material_domain,
      propertyInputs: normalizePropertyInputs(record.propertyInputs),
      shadingModel: record.shading_model,
      twoSided: record.two_sided,
      useMaterialAttributes: record.use_material_attributes,
    } : null,
    nodes,
  };
  graph.signature = sha256(JSON.stringify(graph));
  return graph;
}

function statusCounts(nodes) {
  return Object.fromEntries([...nodes.reduce((counts, node) => {
    const status = node.translation.status;
    counts.set(status, (counts.get(status) ?? 0) + 1);
    return counts;
  }, new Map())].sort(([a], [b]) => a.localeCompare(b)));
}

const [auditText, sourceManifestText] = await Promise.all([
  readFile(AUDIT_PATH, 'utf8'),
  readFile(SOURCE_MANIFEST_PATH, 'utf8'),
]);
const audit = JSON.parse(auditText);
const sourceManifest = JSON.parse(sourceManifestText);

const materialGraphs = (audit.materials ?? [])
  .filter((record) => (record.expressions ?? []).length > 0)
  .map((record) => normalizeGraph(record, 'material'))
  .sort((a, b) => a.path.localeCompare(b.path));
const functionGraphs = (audit.materialFunctions ?? [])
  .filter((record) => (record.expressions ?? []).length > 0)
  .map((record) => normalizeGraph(record, 'material-function'))
  .sort((a, b) => a.path.localeCompare(b.path));
const allGraphs = [...materialGraphs, ...functionGraphs];
const allNodes = allGraphs.flatMap((graph) => graph.nodes);
const graphPaths = new Set(materialGraphs.map((graph) => graph.path));

const profiles = (sourceManifest.materials ?? []).map((profile) => ({
  chain: profile.chain ?? [],
  class: profile.class,
  family: classifySoStylizedMaterialProfile(profile),
  masterGraph: [...(profile.chain ?? [])].reverse().find((path) => graphPaths.has(path)) ?? null,
  parameters: profile.parameters,
  path: profile.path,
})).sort((a, b) => a.path.localeCompare(b.path));

const familyCounts = Object.fromEntries([...profiles.reduce((counts, profile) => {
  counts.set(profile.family, (counts.get(profile.family) ?? 0) + 1);
  return counts;
}, new Map())].sort(([a], [b]) => a.localeCompare(b)));
const expressionClasses = [...new Set(allNodes.map((node) => node.ueClass))].sort();

const output = {
  schema: 'toonlab.sostylized-environment-shader-node-map',
  version: 1,
  generatedAt: new Date().toISOString(),
  authority: {
    auditPath: 'assets-local/sostylized/material-audit.json',
    auditSchema: audit.schema,
    auditSha256: sha256(auditText),
    sourceManifestPath: 'assets-local/sostylized/material-source/manifest.json',
    sourceManifestSchema: sourceManifest.schema,
    sourceManifestSha256: sha256(sourceManifestText),
  },
  counts: {
    expressionClasses: expressionClasses.length,
    functionGraphs: functionGraphs.length,
    materialGraphs: materialGraphs.length,
    nodes: allNodes.length,
    profiles: profiles.length,
  },
  mapping: {
    classCrosswalk: UE_MATERIAL_NODE_CROSSWALK,
    expressionClasses,
    nodeStatusCounts: statusCounts(allNodes),
  },
  familyCounts,
  profiles,
  materialGraphs,
  functionGraphs,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

console.log('environment shader node map generated');
console.log(JSON.stringify({
  output: OUTPUT_PATH,
  counts: output.counts,
  familyCounts,
  nodeStatusCounts: output.mapping.nodeStatusCounts,
}, null, 2));
