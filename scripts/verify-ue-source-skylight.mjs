#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UE_SOURCE_SKYLIGHT_CONTRACT,
  createUeSourceSkyShFromCoefficients,
  evaluateUeSourceSkySh,
  resolveUeSourceSkyLightContract,
  tintUeSourceSkySh,
} from '../src/environment/ueSourceSkyLight.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
);
const SHOWCASE_PATH = resolve(ROOT_DIR, 'examples/source-showcase/main.js');
const MODULE_PATH = resolve(ROOT_DIR, 'src/environment/ueSourceSkyLight.js');
const LEDGER_PATH = resolve(ROOT_DIR, 'docs/source-shader-port-ledger.json');
const NATIVE_IRRADIANCE_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/demo-scenes/native-reference/sky-light-irradiance.json',
);

const [
  manifestText,
  showcaseSource,
  moduleSource,
  ledgerText,
  nativeIrradianceText,
] = await Promise.all([
  readFile(MANIFEST_PATH, 'utf8'),
  readFile(SHOWCASE_PATH, 'utf8'),
  readFile(MODULE_PATH, 'utf8'),
  readFile(LEDGER_PATH, 'utf8'),
  readFile(NATIVE_IRRADIANCE_PATH, 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const nativeIrradiance = JSON.parse(nativeIrradianceText);
const component = manifest.renderState?.components?.find(
  (entry) => entry.componentClass === 'SkyLightComponent',
);
assert.ok(component, 'SnowPines SkyLightComponent is missing');

const source = component.properties ?? {};
assert.equal(source.source_type.includes('SLS_CAPTURED_SCENE'), true);
assert.equal(source.cubemap_resolution, 128);
assert.equal(source.sky_distance_threshold, 150000);
assert.equal(source.lower_hemisphere_is_black, true);
assert.equal(source.real_time_capture, false);
assert.equal(source.capture_emissive_only, false);
assert.equal(source.cast_shadows, false);
assert.equal(source.affect_reflection, true);
assert.equal(source.affect_global_illumination, true);
assert.deepEqual(source.light_color, [195, 223, 255, 255]);

const contract = resolveUeSourceSkyLightContract(component);
assert.equal(contract.sourceType, 'captured-scene');
assert.equal(contract.captureResolution, 128);
assert.equal(contract.diffuseCubemapSize, 32);
assert.equal(contract.diffuseMipLevel, 2);
assert.equal(contract.skyDistanceThresholdMeters, 1500);
assert.equal(contract.lowerHemisphereIsSolidColor, true);
assert.equal(contract.captureEmissiveOnly, false);
assert.equal(contract.castShadows, false);
assert.equal(contract.capturePosition.length(), 0);
assert.ok(Math.abs(contract.intensity - 1.2) < 0.000001);
const expectedTint = [0.5457244613615395, 0.7379104087672317, 1];
contract.lightColor.toArray().forEach((channel, index) => {
  assert.ok(Math.abs(channel - expectedTint[index]) < 1e-12);
});
assert.deepEqual(
  contract.lowerHemisphereColor.toArray(),
  source.lower_hemisphere_color.slice(0, 3),
);

assert.equal(nativeIrradiance.schema, 'toonlab.ue-skylight-irradiance');
assert.equal(
  nativeIrradiance.source,
  'USkyLightComponent::GetIrradianceEnvironmentMap',
);
assert.equal(nativeIrradiance.unrealCoefficients.length, 9);
assert.equal(nativeIrradiance.threeCoefficients.length, 9);
const nativeSh = createUeSourceSkyShFromCoefficients(
  nativeIrradiance.threeCoefficients,
);
assert.deepEqual(
  nativeSh.coefficients.map((coefficient) => coefficient.toArray()),
  nativeIrradiance.threeCoefficients,
);
const upwardNativeIrradiance = evaluateUeSourceSkySh(
  nativeIrradiance.threeCoefficients,
  [0, 1, 0],
);
assert.deepEqual(
  upwardNativeIrradiance.toArray().map((value) => Number(value.toFixed(6))),
  [0.296841, 0.814877, 2.408437],
  'native renderer SH must retain the strong blue upward irradiance',
);
const tintedNativeSh = tintUeSourceSkySh(nativeSh, contract.lightColor);
const expectedTintedCoefficient0 = nativeIrradiance.threeCoefficients[0].map(
  (channel, index) => channel * expectedTint[index],
);
tintedNativeSh.coefficients[0].toArray().forEach((channel, index) => {
  assert.ok(
    Number.isFinite(channel)
      && Math.abs(channel - expectedTintedCoefficient0[index]) < 1e-12,
    'native SkyLight SH tint must remain finite and use Color.r/g/b channels',
  );
});
assert.deepEqual(
  nativeSh.coefficients[0].toArray(),
  nativeIrradiance.threeCoefficients[0],
  'SkyLight tinting must not mutate the exported native SH source',
);
assert.throws(
  () => tintUeSourceSkySh(nativeSh, { x: 1, y: 1, z: 1 }),
  /finite linear RGB/i,
  'Vector3-shaped tints must not be accepted accidentally',
);

// A constant unit-radiance sphere has only L00=sqrt(4*PI). The SH helper
// returns cosine-weighted irradiance PI; Three's Lambert stage supplies 1/PI.
const constantSh = Array.from({ length: 9 }, () => [0, 0, 0]);
constantSh[0] = Array(3).fill(Math.sqrt(4 * Math.PI));
const constantIrradiance = evaluateUeSourceSkySh(constantSh, [0, 1, 0]);
constantIrradiance.toArray().forEach((channel) => {
  assert.ok(Math.abs(channel - Math.PI) < 0.00001);
});
const negativeSh = Array.from({ length: 9 }, () => [0, 0, 0]);
negativeSh[0] = [-1, 2, -3];
assert.deepEqual(
  evaluateUeSourceSkySh(negativeSh, [0, 0, 1]).toArray(),
  [0, 1.772454, 0],
  'UE GetSkySHDiffuse must clamp every negative output channel',
);

assert.equal(UE_SOURCE_SKYLIGHT_CONTRACT.stage, 'partial');
assert.equal(UE_SOURCE_SKYLIGHT_CONTRACT.capture.diffuseCubemapSize, 32);
assert.equal(UE_SOURCE_SKYLIGHT_CONTRACT.capture.postProcessing, false);
assert.match(UE_SOURCE_SKYLIGHT_CONTRACT.diffuse.clamp, /max\(0/);
assert.equal(UE_SOURCE_SKYLIGHT_CONTRACT.remainingBridges.length, 3);

assert.match(moduleSource, /scene\.fogNode != null/);
assert.match(moduleSource, /skyDistanceThresholdMeters/);
assert.match(moduleSource, /getShIrradianceAt\(normalWorld, this\.lightProbe\)/);
assert.match(moduleSource, /tintUeSourceSkySh\(rawSh, captureTint\)/);
assert.doesNotMatch(moduleSource, /coefficient\.multiply\(captureTint\)/);
assert.match(moduleSource, /PMREMGenerator\(renderer\)/);
assert.doesNotMatch(showcaseSource, /scene\.environment\s*=\s*renderTarget\.texture/);
const renderStateIndex = showcaseSource.indexOf('const sourceRenderState = useUnityAuthority');
const skyCaptureIndex = showcaseSource.indexOf('const sourceSkyLight = await configureSourceSkyLight');
const conditionalSkyCaptureIndex = showcaseSource.indexOf('const sourceSkyLight = useUnityAuthority');
assert.ok(
  renderStateIndex > 0
    && (skyCaptureIndex > renderStateIndex || conditionalSkyCaptureIndex > renderStateIndex),
  'analytic fog must be installed before SkyLight capture');
assert.match(showcaseSource, /installUeSourceSkyLightNode\(renderer\)/);
assert.match(showcaseSource, /ueSourceSkyCapture/);
assert.match(showcaseSource, /DEMO_NATIVE_SKYLIGHT/);
assert.match(showcaseSource, /diffuseCoefficients: irradiance\.threeCoefficients/);
assert.match(showcaseSource, /skyLightNativeIrradiance/);

const ledger = JSON.parse(ledgerText);
const ledgerEntry = ledger.rendererSystems.find(
  (entry) => entry.system === 'skylight-indirect',
);
assert.equal(ledgerEntry?.status, 'partial');
assert.match(ledgerEntry.remaining, /exact nine RGB renderer coefficients/);
assert.match(ledgerEntry.remaining, /GetIrradianceEnvironmentMap/);
assert.match(ledgerEntry.remaining, /GGX specular PMREM/);

console.log('UE source SkyLight verification passed');
console.log(JSON.stringify({
  capture: {
    diffuseMipLevel: contract.diffuseMipLevel,
    diffuseSize: contract.diffuseCubemapSize,
    fogParticipation: true,
    lowerHemisphereIsSolidColor: contract.lowerHemisphereIsSolidColor,
    nearMeters: contract.skyDistanceThresholdMeters,
    resolution: contract.captureResolution,
    visibility: UE_SOURCE_SKYLIGHT_CONTRACT.capture.visibility,
  },
  lighting: {
    intensity: contract.intensity,
    linearTint: contract.lightColor.toArray(),
    nativeUpwardIrradiance: upwardNativeIrradiance.toArray(),
    tintedCoefficient0: tintedNativeSh.coefficients[0].toArray(),
  },
  remainingBridges: UE_SOURCE_SKYLIGHT_CONTRACT.remainingBridges,
  stage: UE_SOURCE_SKYLIGHT_CONTRACT.stage,
}, null, 2));
