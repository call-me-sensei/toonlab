#!/usr/bin/env node

// Build a compact, deterministic contract from Unity's own generated Shader
// Graph pass source. This records the executable graph region, connected
// surface/vertex outputs, branch properties, and helper calls. It is intended
// for source-to-source parity checks; it contains no screenshot measurements.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..', '..');
const GENERATED_ROOT = resolve(
  PACKAGE_ROOT,
  'assets-local',
  'sostylized-unity',
  'generated-shaders',
);
const DEFAULT_OUTPUT = resolve(
  PACKAGE_ROOT,
  'docs',
  'source-shader-audits',
  'unity-generated-shader-contracts.json',
);
const SCENE_MANIFEST = resolve(
  PACKAGE_ROOT,
  'assets-local',
  'sostylized-unity',
  'mega-scene',
  'scene-manifest.json',
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSource(value) {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim() + '\n';
}

function pickAuthorityPass(shader) {
  const preferred = shader.passes.find((pass) => pass.name === 'ForwardLit')
    ?? shader.passes.find((pass) => pass.name === 'Unlit')
    ?? shader.passes.find((pass) => pass.name === 'Pass')
    ?? shader.passes[0];
  if (!preferred) throw new Error(`${shader.shaderName} has no generated pass.`);
  return preferred;
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing generated-source marker ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing generated-source marker ${endMarker}`);
  return normalizeSource(source.slice(start, end));
}

function unique(values) {
  return [...new Set(values)].sort();
}

function matches(source, expression, map = (match) => match[1]) {
  return [...source.matchAll(expression)].map(map);
}

function propertyAliases(graphFunctions) {
  const result = {};
  for (const match of graphFunctions.matchAll(
    /\b(_Property_[A-Za-z0-9]+_Out_\d+_[A-Za-z0-9]+)\s*=\s*(_[A-Za-z][A-Za-z0-9_]*)\s*;/g,
  )) {
    result[match[1]] = match[2];
  }
  return result;
}

function outputAssignments(graphFunctions, objectName) {
  const result = {};
  const expression = new RegExp(`^${objectName}\\.([A-Za-z0-9_]+)\\s*=\\s*(.+);$`, 'gm');
  for (const match of graphFunctions.matchAll(expression)) result[match[1]] = match[2];
  return result;
}

function branchProperties(graphFunctions, aliases) {
  const result = [];
  for (const match of graphFunctions.matchAll(
    /\bUnity_Branch_[A-Za-z0-9_]+\((_[A-Za-z0-9_]+),/g,
  )) {
    result.push(aliases[match[1]] ?? match[1]);
  }
  return unique(result);
}

function declaredGraphProperties(graphRegion) {
  return unique(matches(
    graphRegion,
    /^(?:float(?:[234](?:x[234])?)?|half(?:[234])?|int|uint)\s+(_[A-Za-z][A-Za-z0-9_]*)\s*;/gm,
  ).concat(matches(
    graphRegion,
    /^(?:TEXTURE\w*|SAMPLER)\((_?[A-Za-z][A-Za-z0-9_]*)\)\s*;/gm,
  )));
}

function connectedGraphProperties(graphFunctions, declared) {
  return declared.filter((name) => new RegExp(`\\b${name}\\b`).test(graphFunctions));
}

async function buildContract(shader, scenePropertyNames = []) {
  const authorityPass = pickAuthorityPass(shader);
  const passPath = resolve(GENERATED_ROOT, authorityPass.file);
  const fullSource = normalizeSource(await readFile(passPath, 'utf8'));
  const graphRegion = section(
    fullSource,
    '// Graph\n',
    '// --------------------------------------------------\n// Build Graph Inputs',
  );
  const graphFunctions = section(
    fullSource,
    '// Graph Functions',
    '// --------------------------------------------------\n// Build Graph Inputs',
  );
  const graphProperties = section(
    fullSource,
    '// Graph Properties',
    '// Graph Includes',
  );
  const aliases = propertyAliases(graphFunctions);
  const declared = declaredGraphProperties(graphProperties);
  const connected = connectedGraphProperties(graphFunctions, declared);

  return {
    shaderName: shader.shaderName,
    assetPath: shader.assetPath,
    assetGuid: shader.assetGuid,
    graphSha256: shader.graphSha256,
    authorityPass: {
      subshader: authorityPass.subshader,
      pass: authorityPass.pass,
      name: authorityPass.name,
      file: authorityPass.file,
      fullSourceSha256: sha256(fullSource),
      exportedSha256: authorityPass.sha256,
      graphRegionSha256: sha256(graphRegion),
      graphFunctionsSha256: sha256(graphFunctions),
    },
    outputs: {
      vertex: outputAssignments(graphFunctions, 'description'),
      surface: outputAssignments(graphFunctions, 'surface'),
    },
    properties: {
      declared,
      connected,
      disconnected: declared.filter((name) => !connected.includes(name)),
      branchSelectors: branchProperties(graphFunctions, aliases),
      sceneMaterial: {
        declared: scenePropertyNames,
        connected: scenePropertyNames.filter((name) => (
          new RegExp(`\\b${name}\\b`).test(graphFunctions)
        )),
        disconnected: scenePropertyNames.filter((name) => (
          !new RegExp(`\\b${name}\\b`).test(graphFunctions)
        )),
      },
    },
    helperCalls: unique(matches(
      graphFunctions,
      /\b((?:Unity|SG)_[A-Za-z0-9_]+)\s*\(/g,
    )),
    generatedFunctions: unique(matches(
      graphFunctions,
      /^(?:void|float(?:[234])?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    )),
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(GENERATED_ROOT, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'toonlab.sostylized-unity.generated-shaders') {
    throw new Error(`Unsupported generated shader schema: ${manifest.schema}`);
  }
  const sceneManifest = JSON.parse(await readFile(SCENE_MANIFEST, 'utf8'));
  const sceneProperties = new Map();
  for (const material of sceneManifest.materials ?? []) {
    if (!sceneProperties.has(material.shaderName)) sceneProperties.set(material.shaderName, new Set());
    const target = sceneProperties.get(material.shaderName);
    for (const property of material.properties ?? []) target.add(property.name);
  }
  const contracts = [];
  for (const shader of manifest.shaders) {
    contracts.push(await buildContract(
      shader,
      [...(sceneProperties.get(shader.shaderName) ?? [])].sort(),
    ));
  }
  const output = resolve(process.argv[2] ?? DEFAULT_OUTPUT);
  const document = {
    schema: 'toonlab.sostylized-unity.generated-shader-contracts',
    schemaVersion: 1,
    authority: {
      unityVersion: manifest.unityVersion,
      exporterSchema: manifest.schema,
      source: 'ShaderUtil.GetShaderPassSourceCode',
      comparisonMethod: 'source-to-source; no visual measurements',
    },
    counts: {
      shaders: contracts.length,
      generatedPasses: manifest.passCount,
      connectedProperties: contracts.reduce(
        (sum, contract) => sum + contract.properties.connected.length,
        0,
      ),
      connectedSceneMaterialProperties: contracts.reduce(
        (sum, contract) => sum + contract.properties.sceneMaterial.connected.length,
        0,
      ),
    },
    shaders: contracts,
  };
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`Generated ${contracts.length} Unity shader source contracts at ${output}`);
}

await main();
