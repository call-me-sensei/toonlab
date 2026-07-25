#!/usr/bin/env node

// Source-sensitive gate for the Mega scene's glossy-environment path. This is
// deliberately a no-radiance contract, not an omitted feature: the source
// scene selects Skybox reflection mode while assigning neither a skybox
// material nor a custom reflection cubemap.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  SO_STYLIZED_UNITY_URP_LIGHTING_CONTRACT,
  SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE,
  SoStylizedUnityUrpLightingModel,
} from '../src/environment/soStylizedUnityUrpLighting.js';

const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const repoPath = (relativePath) => fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
const unityProject = process.env.SO_STYLIZED_UNITY_PROJECT
  ?? fileURLToPath(new URL('../../../../Setup Guide In-Editor Tutorial/', import.meta.url));

const paths = {
  captureReport: repoPath(SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.captureReport),
  sceneManifest: repoPath(SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.sceneManifest),
  sceneYaml: `${unityProject}/${SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE.sceneYaml}`,
  adapter: repoPath('src/environment/soStylizedUnityUrpLighting.js'),
};
const sources = Object.fromEntries(await Promise.all(Object.entries(paths).map(
  async ([key, sourcePath]) => [key, await readFile(sourcePath, 'utf8')],
)));

for (const key of ['captureReport', 'sceneManifest', 'sceneYaml']) {
  assert.equal(
    sha256(sources[key]),
    SO_STYLIZED_UNITY_URP_LIGHTING_SOURCE[`${key}Sha256`],
    `${key} source hash`,
  );
}

assert.match(sources.sceneYaml, /m_DefaultReflectionMode:\s*0/);
assert.match(sources.sceneYaml, /m_ReflectionBounces:\s*1/);
assert.match(sources.sceneYaml, /m_ReflectionIntensity:\s*1/);
assert.match(sources.sceneYaml, /m_SkyboxMaterial:\s*\{fileID:\s*0\}/);
assert.match(sources.sceneYaml, /m_CustomReflection:\s*\{fileID:\s*0\}/);

const manifest = JSON.parse(sources.sceneManifest);
assert.equal(manifest.renderSettings.defaultReflectionMode, 'Skybox');
assert.equal(manifest.renderSettings.reflectionIntensity, 1);
assert.equal(manifest.renderSettings.reflectionBounces, 1);
assert.equal(manifest.renderSettings.skybox, -1);
assert.equal(manifest.renderSettings.customReflection, -1);

assert.match(sources.captureReport, /^reflection\.intensity=1$/m);
assert.match(sources.captureReport, /^reflection\.mode=Skybox$/m);
assert.match(sources.captureReport, /^reflection\.custom=not-custom$/m);
assert.match(sources.captureReport, /^skybox=none$/m);

const contract = SO_STYLIZED_UNITY_URP_LIGHTING_CONTRACT.environmentReflections;
assert.equal(contract.activeContribution, 'black');
assert.equal(contract.defaultMode, 'Skybox');
assert.equal(contract.reflectionIntensity, 1);
assert.equal(contract.reflectionBounces, 1);
assert.equal(contract.skyboxMaterial, null);
assert.equal(contract.customReflection, null);

const model = new SoStylizedUnityUrpLightingModel();
assert.equal(model.indirectSpecular(), undefined);
assert.match(
  sources.adapter,
  /indirectSpecular\(\)\s*\{\}/,
  'source baseline must not inherit Three scene.environment radiance',
);

console.log('Unity Mega glossy-environment contract verified.');
console.log('Skybox mode + no skybox/custom cubemap resolves to an explicit black indirect-specular path.');
