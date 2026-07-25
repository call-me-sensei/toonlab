#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Color, SRGBColorSpace, Vector3 } from 'three';

import {
  evaluateSoStylizedUnityUrpDiffuseDecomposition,
} from '../src/environment/soStylizedUnityUrpLighting.js';
import {
  createUeSourceSkyShFromCoefficients,
  evaluateUeSourceSkySh,
  resolveUeSourceSkyLightContract,
  tintUeSourceSkySh,
} from '../src/environment/ueSourceSkyLight.js';
import {
  unityMountainProfileFromResolvedMaterial,
  unityRockProfileFromResolvedMaterial,
} from '../src/rockgen/reference/unityRockMaterial.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const WORKSPACE_DIR = resolve(ROOT_DIR, '..');

const paths = {
  generatedRock:
    'assets-local/sostylized-unity/generated-shaders/passes/S_Rock/'
    + 'sub-00-pass-00-ForwardLit.shader',
  nativeSky:
    'assets-local/sostylized/demo-scenes/native-reference/'
    + 'sky-light-irradiance.json',
  rockLibrary: 'assets-local/sostylized-unity/rock-material-library.json',
  scene: 'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
  skyRuntime: 'src/environment/ueSourceSkyLight.js',
};

const [
  generatedRock,
  nativeSkyText,
  rockLibraryText,
  sceneText,
  skyRuntime,
  rockGraph,
] = await Promise.all([
  readFile(resolve(ROOT_DIR, paths.generatedRock), 'utf8'),
  readFile(resolve(ROOT_DIR, paths.nativeSky), 'utf8'),
  readFile(resolve(ROOT_DIR, paths.rockLibrary), 'utf8'),
  readFile(resolve(ROOT_DIR, paths.scene), 'utf8'),
  readFile(resolve(ROOT_DIR, paths.skyRuntime), 'utf8'),
  readFile(resolve(
    WORKSPACE_DIR,
    'SoStylized-Unity/Environment/Rocks/Shaders/S_Rock.shadergraph',
  )),
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(
  sha256(rockGraph),
  'a3bb01037314605728ba852d407df95e3bd9374f87e42c28cc28da49172e5f5b',
  'S_Rock source changed; re-audit the generated graph before updating this oracle',
);
assert.match(generatedRock, /float _Emissive_Strength;/);
assert.match(generatedRock, /surface\.Emission\s*=/);
assert.match(generatedRock, /surface\.Occlusion\s*=\s*float\(1\)/);
assert.match(skyRuntime, /tintUeSourceSkySh\(rawSh, captureTint\)/);
assert.doesNotMatch(skyRuntime, /coefficient\.multiply\(captureTint\)/);

const nativeSky = JSON.parse(nativeSkyText);
const rockLibrary = JSON.parse(rockLibraryText);
const sceneManifest = JSON.parse(sceneText);
const skyComponent = sceneManifest.renderState.components.find(
  (entry) => entry.componentClass === 'SkyLightComponent',
);
assert.ok(skyComponent, 'SnowPines SkyLightComponent is missing');
const skyContract = resolveUeSourceSkyLightContract(skyComponent);
const nativeSh = createUeSourceSkyShFromCoefficients(nativeSky.threeCoefficients);
const tintedSh = tintUeSourceSkySh(nativeSh, skyContract.lightColor);
assert.ok(
  tintedSh.coefficients.flatMap((coefficient) => coefficient.toArray())
    .every(Number.isFinite),
  'the source SkyLight must reach the renderer as finite SH coefficients',
);

// This is the invalid operation the runtime previously used. A Three Color has
// r/g/b fields, while Vector3.multiply() reads x/y/z, producing NaN in r185.
const legacyTintResult = new Vector3(1, 1, 1).multiply(new Color(1, 1, 1));
assert.ok(
  legacyTintResult.toArray().every(Number.isNaN),
  'the legacy Color-as-Vector3 tint demonstration no longer reproduces',
);

const rockRecord = rockLibrary.materials.find(
  (material) => material.name === 'MV_RockClassic_Rocks',
);
const mountainRecord = rockLibrary.materials.find(
  (material) => material.name === 'MV_Mountain',
);
assert.ok(rockRecord && mountainRecord, 'source rock/mountain materials are missing');
const rockProfile = unityRockProfileFromResolvedMaterial(rockRecord);
const mountainProfile = unityMountainProfileFromResolvedMaterial(mountainRecord);
assert.equal(rockProfile.base.metallic, 0.2);
assert.equal(rockProfile.base.emissiveStrength, 0.12);
assert.equal(mountainProfile.smoothness, 0.066);

function sourceSkyOnlyNeutralResponse({
  emissionStrength,
  metallic,
  normal,
}) {
  const neutralAlbedo = [0.25, 0.25, 0.25];
  const rawIrradiance = evaluateUeSourceSkySh(
    nativeSky.threeCoefficients,
    normal,
  ).toArray();
  const tint = skyContract.lightColor.toArray();
  const physicalIrradiance = rawIrradiance.map(
    (channel, index) => channel * tint[index] * skyContract.intensity,
  );
  const brdfDiffuse = neutralAlbedo.map(
    (channel) => channel * 0.96 * (1 - metallic),
  );
  const decomposition = evaluateSoStylizedUnityUrpDiffuseDecomposition({
    brdfDiffuse,
    indirectInput: physicalIrradiance,
    inputAdapter: 'ue-captured-scene-sh',
  });
  const emission = neutralAlbedo.map((channel) => channel * emissionStrength);
  return {
    physicalIrradiance,
    shaded: decomposition.indirectDiffuse.map(
      (channel, index) => channel + emission[index],
    ),
  };
}

// A fully shadowed side still receives UE's captured SkyLight. The source
// values below are an oracle, not a tuned acceptance threshold: they are the
// literal native SH, linear 195/223/255 tint, 1.2 intensity, URP 1/PI input
// boundary, metallic workflow, and serialized S_Rock emission.
const rockShade = sourceSkyOnlyNeutralResponse({
  emissionStrength: rockProfile.base.emissiveStrength,
  metallic: rockProfile.base.metallic,
  normal: [0, 0, -1],
});
const mountainShade = sourceSkyOnlyNeutralResponse({
  emissionStrength: 0,
  metallic: 0,
  normal: [0, 0, -1],
});
const rounded = (values) => values.map((value) => Number(value.toFixed(9)));
assert.deepEqual(
  rounded(rockShade.shaded),
  [0.043357129, 0.067372293, 0.140787103],
  'Classic rock source shade drifted from the native SkyLight/URP oracle',
);
assert.deepEqual(
  rounded(mountainShade.shaded),
  [0.016696411, 0.046715367, 0.138483878],
  'mountain source shade drifted from the native SkyLight/URP oracle',
);
assert.ok(
  rockShade.shaded[2] > rockShade.shaded[0] * 3,
  'source Classic rock shade must remain blue-dominant even with authored emission',
);
assert.ok(
  mountainShade.shaded[2] > mountainShade.shaded[0] * 8,
  'source mountain shade must remain strongly blue-dominant',
);

console.log('Source rock/SkyLight oracle passed');
console.log(JSON.stringify({
  input: {
    intensity: skyContract.intensity,
    linearTint: skyContract.lightColor.toArray(),
    rockEmission: rockProfile.base.emissiveStrength,
    rockMetallic: rockProfile.base.metallic,
  },
  output: {
    mountainShade: mountainShade.shaded,
    rockShade: rockShade.shaded,
  },
  source: {
    generatedRock: paths.generatedRock,
    graphSha256: sha256(rockGraph),
    nativeSky: paths.nativeSky,
  },
}, null, 2));
