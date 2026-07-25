#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const WORKSPACE = resolve(ROOT, '..');
const configuration = JSON.parse(readFileSync(resolve(
  ROOT,
  'assets-local/parity/single-rock/source-configurations/ue-so-stylized-documented.json',
), 'utf8'));
const engineIni = readFileSync(resolve(
  WORKSPACE,
  'StylizedExploration/Config/DefaultEngine.ini',
), 'utf8');
const scene = JSON.parse(readFileSync(resolve(
  ROOT,
  'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
), 'utf8'));
const diagnosticScript = readFileSync(resolve(
  WORKSPACE,
  'StylizedExploration/Scripts/single_rock_parity_unreal.py',
), 'utf8');
const viewportCapture = readFileSync(resolve(
  ROOT,
  'scripts/unreal/capture-environment-demo-reference.py',
), 'utf8');

const expectedIni = new Map([
  ['r.VirtualTextures', 'True'],
  ['r.VT.EnableAutoImport', 'False'],
  ['r.GenerateMeshDistanceFields', 'True'],
  ['r.CustomDepth', '3'],
  ['r.AntiAliasingMethod', '2'],
  ['r.Shadow.Virtual.Enable', '0'],
  ['r.DynamicGlobalIlluminationMethod', '0'],
  ['r.ReflectionMethod', '2'],
  ['NearClipPlane', '5.000000'],
]);
for (const [key, expected] of expectedIni) {
  const match = engineIni.match(new RegExp(`^${key.replaceAll('.', '\\.') }=(.+)$`, 'm'));
  assert(match, `Missing documented project setting ${key}`);
  assert.equal(match[1].trim(), expected, `${key} must match the documented setup`);
}

assert(configuration.documentedProjectSettings.every((item) => item.match));
const exported = scene.projectSettings.cvars;
for (const [key, expected] of [
  ['r.VirtualTextures', 1],
  ['r.VT.EnableAutoImport', 0],
  ['r.GenerateMeshDistanceFields', 1],
  ['r.CustomDepth', 3],
  ['r.AntiAliasingMethod', 2],
  ['r.Shadow.Virtual.Enable', 0],
  ['r.DynamicGlobalIlluminationMethod', 0],
  ['r.ReflectionMethod', 2],
]) {
  assert.equal(exported[key], expected, `Exported source scene ${key}`);
}
assert.equal(scene.projectSettings.nearClipPlane, 5);

const components = scene.renderState.components.filter(
  (component) => component.actor === 'BP_StylizedSky_Lite',
);
const component = (name) => {
  const match = components.find((candidate) => candidate.component === name);
  assert(match, `Missing source lighting component ${name}`);
  return match;
};
const directional = component('SkyDirectionalLight');
assert.equal(directional.properties.intensity, 8);
assert.equal(directional.properties.dynamic_shadow_cascades, 4);
assert.deepEqual(directional.direction, configuration.documentedSceneSetup.directionalLight.direction);
const sky = component('SkyLight');
assert.equal(sky.properties.intensity, 1.2000000476837158);
assert.equal(sky.properties.source_type, '<SkyLightSourceType.SLS_CAPTURED_SCENE: 0>');
assert.deepEqual(sky.properties.light_color, [195, 223, 255, 255]);
const fog = component('ExponentialHeightFog');
assert.equal(fog.properties.fog_density, 0.05000000074505806);
assert.deepEqual(
  fog.properties.fog_inscattering_luminance,
  configuration.documentedSceneSetup.heightFog.inscatteringColorLinear,
);
const post = component('PostProcess').postProcessSettings;
assert.equal(post.auto_exposure_min_brightness, 1);
assert.equal(post.auto_exposure_max_brightness, 1);
assert.equal(post.bloom_intensity, 5);
assert.deepEqual(post.color_saturation, [1.1, 1.1, 1.1, 1.1]);

for (const literal of [
  '"r.ReflectionMethod": "0"',
  '"r.AntiAliasingMethod": "0"',
  '("PostProcessing", False)',
  '("Fog", False)',
  '("Bloom", False)',
]) {
  assert(diagnosticScript.includes(literal), `P01 diagnostic isolation must retain ${literal}`);
}
assert(viewportCapture.includes('take_high_res_screenshot'));
assert(viewportCapture.includes('WARMUP_FRAMES'));
assert(viewportCapture.includes('EPIC_SCALABILITY'));
assert(viewportCapture.includes('RECAPTURE_SKYLIGHT'));
assert.equal(configuration.controlledDiagnostic.isSourceIntendedProductionLook, false);
assert.equal(configuration.decision.sourceIntendedReferenceMustUseDocumentedSettings, true);
console.log('UE So Stylized documented configuration verification passed.');
