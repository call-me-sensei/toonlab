#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_ROOT = resolve(
  PACKAGE_ROOT,
  'assets-local',
  'sostylized-unity',
  'generated-shaders',
);
const CONTRACT_PATH = resolve(
  PACKAGE_ROOT,
  'docs',
  'source-shader-audits',
  'unity-generated-shader-contracts.json',
);
const SOURCE_CANDIDATES = [
  resolve(PACKAGE_ROOT, '..', 'SoStylized-Unity'),
  '/Users/jackvinijtrongjit/Setup Guide In-Editor Tutorial/Assets/SoStylized-Unity',
];
const SOURCE_ROOT = SOURCE_CANDIDATES.find(existsSync);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSource(value) {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim() + '\n';
}

assert.ok(SOURCE_ROOT, 'The supplied SoStylized-Unity source directory is required.');
assert.ok(existsSync(CONTRACT_PATH), 'Generated Unity shader contracts are missing.');
assert.ok(
  existsSync(resolve(GENERATED_ROOT, 'manifest.json')),
  'Run UnityGeneratedShaderExport before verifying generated pass source.',
);

const manifest = readJson(resolve(GENERATED_ROOT, 'manifest.json'));
const contracts = readJson(CONTRACT_PATH);
assert.equal(manifest.schema, 'toonlab.sostylized-unity.generated-shaders');
assert.equal(manifest.unityVersion, '6000.5.4f1');
assert.equal(manifest.shaderCount, 15);
assert.equal(manifest.passCount, 152);
assert.equal(contracts.schema, 'toonlab.sostylized-unity.generated-shader-contracts');
assert.equal(contracts.authority.unityVersion, manifest.unityVersion);
assert.equal(contracts.authority.source, 'ShaderUtil.GetShaderPassSourceCode');
assert.equal(contracts.authority.comparisonMethod, 'source-to-source; no visual measurements');
assert.equal(contracts.counts.shaders, manifest.shaderCount);
assert.equal(contracts.counts.generatedPasses, manifest.passCount);

const manifestByShader = new Map(manifest.shaders.map((shader) => [shader.shaderName, shader]));
const contractByShader = new Map(contracts.shaders.map((shader) => [shader.shaderName, shader]));
assert.equal(manifestByShader.size, manifest.shaderCount);
assert.equal(contractByShader.size, manifest.shaderCount);

for (const shader of manifest.shaders) {
  const relativeSource = shader.assetPath.replace(/^Assets\/SoStylized-Unity\//, '');
  const graphPath = resolve(SOURCE_ROOT, relativeSource);
  assert.ok(existsSync(graphPath), `Missing supplied graph source ${graphPath}`);
  assert.equal(
    sha256(readFileSync(graphPath)),
    shader.graphSha256,
    `${shader.shaderName} graph changed; regenerate and re-audit generated source`,
  );
  assert.equal(shader.passes.length, shader.passCount);
  for (const pass of shader.passes) {
    const passPath = resolve(GENERATED_ROOT, pass.file);
    assert.ok(existsSync(passPath), `Missing generated pass ${pass.file}`);
    assert.equal(
      sha256(readFileSync(passPath)),
      pass.sha256,
      `${shader.shaderName}/${pass.name} generated source changed`,
    );
  }
  const contract = contractByShader.get(shader.shaderName);
  assert.ok(contract, `Missing source contract for ${shader.shaderName}`);
  assert.equal(contract.graphSha256, shader.graphSha256);
  const authorityPass = shader.passes.find((pass) => (
    pass.subshader === contract.authorityPass.subshader
      && pass.pass === contract.authorityPass.pass
  ));
  assert.ok(authorityPass, `Missing authority pass for ${shader.shaderName}`);
  assert.equal(contract.authorityPass.exportedSha256, authorityPass.sha256);
  assert.equal(
    contract.authorityPass.fullSourceSha256,
    sha256(normalizeSource(readFileSync(resolve(GENERATED_ROOT, authorityPass.file), 'utf8'))),
  );
}

const expectedOutputs = {
  'Shader Graphs/S_FoliageShader': [
    'BaseColor', 'NormalTS', 'Emission', 'Specular', 'Smoothness',
    'Occlusion', 'Alpha', 'AlphaClipThreshold',
  ],
  'Shader Graphs/S_Rock': [
    'BaseColor', 'NormalTS', 'Emission', 'Metallic', 'Smoothness', 'Occlusion',
  ],
  'Shader Graphs/S_Mountain': [
    'BaseColor', 'NormalTS', 'Emission', 'Metallic', 'Smoothness', 'Occlusion',
  ],
  'Shader Graphs/S_Snow': [
    'BaseColor', 'NormalTS', 'Emission', 'Metallic', 'Smoothness', 'Occlusion',
  ],
  'Shader Graphs/S_Leaves': [
    'BaseColor', 'NormalTS', 'Emission', 'Specular', 'Smoothness',
    'Occlusion', 'Alpha', 'AlphaClipThreshold',
  ],
  'Shader Graphs/S_Bark': [
    'BaseColor', 'NormalTS', 'Emission', 'Specular', 'Smoothness', 'Occlusion',
  ],
  'Shader Graphs/S_StylizedSky': ['BaseColor'],
  'Shader Graphs/S_StylizedClouds': ['BaseColor', 'Alpha'],
  'Shader Graphs/S_StylizedBasic': [
    'BaseColor', 'NormalTS', 'Emission', 'Metallic', 'Smoothness', 'Occlusion',
  ],
  'Shader Graphs/S_StylizedWater': [
    'BaseColor', 'NormalTS', 'Emission', 'Specular', 'Smoothness',
    'Occlusion', 'Alpha',
  ],
  'Shader Graphs/S_WaterWaves': [
    'BaseColor', 'NormalTS', 'Emission', 'Specular', 'Smoothness',
    'Occlusion', 'Alpha', 'AlphaClipThreshold',
  ],
  'Shader Graphs/S_Waterfall': [
    'BaseColor', 'NormalTS', 'Emission', 'Specular', 'Smoothness',
    'Occlusion', 'Alpha',
  ],
};

for (const [shaderName, outputs] of Object.entries(expectedOutputs)) {
  const contract = contractByShader.get(shaderName);
  assert.ok(contract, `Missing Mega-family generated contract ${shaderName}`);
  assert.deepEqual(Object.keys(contract.outputs.surface), outputs, `${shaderName} surface outputs changed`);
}

const disconnectedGraphInputs = {
  'Shader Graphs/S_FoliageShader': ['_Height_Blend'],
  'Shader Graphs/S_Rock': ['_Moss_Specular', '_Sand_Blend_Offset', '_Sand_Contrast'],
  'Shader Graphs/S_StylizedClouds': ['_Tint'],
  'Shader Graphs/S_Bark': ['_Moss_Smoothness', '_Moss_Specular', '_Specular'],
  'Shader Graphs/S_Leaves': ['_Smoothness_Texture', '_Specular', '_UseSmoothnessMap'],
  'Shader Graphs/S_StylizedWater': ['_Water_Emissive_Strength'],
  'Shader Graphs/S_Waterfall': ['_Specular'],
};

for (const [shaderName, names] of Object.entries(disconnectedGraphInputs)) {
  const disconnected = contractByShader.get(shaderName).properties.sceneMaterial.disconnected;
  for (const name of names) {
    assert.ok(disconnected.includes(name), `${shaderName} ${name} must remain disconnected`);
  }
}

for (const [shaderName, connectedNames] of Object.entries({
  'Shader Graphs/S_Leaves': ['_Smoothness', '_Specular_Color'],
  'Shader Graphs/S_Bark': ['_Smoothness_Texture', '_Smoothness_Multiplier', '_Specular_Color'],
  'Shader Graphs/S_Rock': ['_RockMetallic', '_Smoothness'],
})) {
  const connected = contractByShader.get(shaderName).properties.sceneMaterial.connected;
  for (const name of connectedNames) {
    assert.ok(connected.includes(name), `${shaderName} ${name} must remain connected`);
  }
}

console.log(
  `Unity generated-shader source verification passed: ${manifest.shaderCount} graphs, ${manifest.passCount} passes, ${contracts.counts.connectedSceneMaterialProperties} connected Mega material inputs.`,
);
