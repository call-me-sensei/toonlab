#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mat3, vec3 } from 'three/tsl';
import WGSLNodeBuilder from '../node_modules/three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';

import {
  UE_SOURCE_EXPAND_GAMUT_AP1,
  UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT,
  evaluateUeSourceOutputTransfer,
  resolveUeSourceFilmSettings,
} from '../src/environment/ueSourceTonemapping.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const UE_ENGINE_ROOT = process.env.UE_ENGINE_ROOT
  ?? '/Users/Shared/Epic Games/UE_5.8/Engine';
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(
  ROOT_DIR,
  'assets-local',
  'sostylized',
  'demo-scenes',
  'Demonstration_SnowPines.json',
), 'utf8'));

const post = (manifest.renderState?.components ?? []).find(
  (component) => component.componentClass === 'PostProcessComponent'
    && component.properties?.unbound === true,
)?.postProcessSettings;
assert.ok(post, 'SnowPines unbound post-process settings are missing');

const resolved = resolveUeSourceFilmSettings(post);
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};
const closeVector = (actual, expected, tolerance = 1e-9) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => close(value, expected[index], tolerance));
};

// PostProcessCombineLUTs.usf multiplies FVector4.xyz by FVector4.w. The
// authored [1.1, 1.1, 1.1, 1.1] setting is therefore 1.21, not 1.1.
closeVector(resolved.colorSaturation, [1.21, 1.21, 1.21]);
closeVector(resolved.colorContrast, [1, 1, 1]);
closeVector(resolved.colorGamma, [1, 1, 1]);
closeVector(resolved.colorGain, [1, 1, 1]);
closeVector(resolved.colorOffset, [0, 0, 0]);
close(resolved.expandGamut, 1);
close(resolved.blueCorrection, 0.6, 1e-6);
close(resolved.slope, 1);
close(resolved.toe, 0.3, 1e-6);
close(resolved.shoulder, 1);
close(resolved.toneCurveAmount, 1);

// TSL's scalar mat3 overload takes row-major arguments (THREE.Matrix3
// convention) and emits the backend's column-major constructor order. This is
// the bridge that prevents a second manual transpose of UE's HLSL matrices.
const wgslBuilder = new WGSLNodeBuilder({}, {
  backend: { compatibilityMode: false },
  coordinateSystem: 2000,
  library: { getToneMappingFunction: () => null },
});
const matrixProbe = mat3(
  1, 2, 3,
  4, 5, 6,
  7, 8, 9,
).mul(vec3(10, 20, 30));
let matrixProbeSnippet = null;
for (const stage of ['setup', 'analyze', 'generate']) {
  wgslBuilder.setBuildStage(stage);
  wgslBuilder.setShaderStage('fragment');
  matrixProbeSnippet = matrixProbe.build(wgslBuilder, 'vec3');
}
assert.match(
  matrixProbeSnippet,
  /mat3x3<f32>\( 1\.0, 4\.0, 7\.0, 2\.0, 5\.0, 8\.0, 3\.0, 6\.0, 9\.0 \)/,
  'TSL scalar mat3 row-major bridge changed',
);

// Default white balance is mathematically the identity in UE's LUT builder.
close(Number(post.white_temp), 6500);
close(Number(post.white_tint), 0);

// The capture is fixed to SDR sRGB, gamut 0, and no explicit gamma override.
const captureSource = readFileSync(resolve(
  ROOT_DIR,
  'scripts',
  'unreal',
  'capture-environment-demo-reference.py',
), 'utf8');
for (const contract of [
  '"r.HDR.EnableHDROutput": 0',
  '"r.HDR.Display.ColorGamut": 0',
  '"r.HDR.Display.OutputDevice": 0',
  '"r.TonemapperGamma": 0',
]) {
  assert.ok(captureSource.includes(contract), `capture output contract missing ${contract}`);
}

const multiplyMatrix3 = (matrix, vector) => matrix.map((row) =>
  row.reduce((sum, value, index) => sum + value * vector[index], 0));
const dot = (left, right) => left.reduce(
  (sum, value, index) => sum + value * right[index],
  0,
);
const mix = (left, right, amount) => left.map(
  (value, index) => value + (right[index] - value) * amount,
);

// One independently evaluated CombineLUT pre-film fixture locks the exact
// matrix orientation, exp2 expansion, and 1.21 saturation semantics.
const SRGB_TO_AP1 = [
  [0.6130974024, 0.3395231461, 0.0473794514],
  [0.0701937225, 0.9163538791, 0.0134523986],
  [0.0206155929, 0.1095697729, 0.8698146341],
];
const AP1_LUMA = [0.2722287168, 0.6740817658, 0.0536895174];
const colorAP1 = multiplyMatrix3(SRGB_TO_AP1, [0.05, 0.5, 0.8]);
const luma = dot(colorAP1, AP1_LUMA);
const chromaDelta = colorAP1.map((channel) => channel / luma - 1);
const chromaDistanceSquared = dot(chromaDelta, chromaDelta);
const expandAmount = (1 - 2 ** (-4 * chromaDistanceSquared))
  * (1 - 2 ** (-4 * resolved.expandGamut * luma * luma));
const expanded = mix(
  colorAP1,
  multiplyMatrix3(UE_SOURCE_EXPAND_GAMUT_AP1, colorAP1),
  expandAmount,
);
const expandedLuma = dot(expanded, AP1_LUMA);
const graded = expanded.map((channel, index) => Math.max(
  0,
  expandedLuma + (channel - expandedLuma) * resolved.colorSaturation[index],
));
closeVector(graded, [
  0.15165829007714127,
  0.4912555508098833,
  0.8640562765294655,
], 1e-8);

// Locked EV100 1 plus the project/default +1 EV bias resolves to exactly 1.
close(2 ** (Number(post.auto_exposure_bias) - Number(post.auto_exposure_min_brightness)), 1);
assert.equal(Number(post.auto_exposure_min_brightness), Number(post.auto_exposure_max_brightness));

// Pin the output-device branch. On Apple, an unspecified TonemapperGamma
// becomes 2.2 and forces an SDR sRGB request into ExplicitGammaMapping.
const tonemapCpp = readFileSync(resolve(
  UE_ENGINE_ROOT,
  'Source/Runtime/Renderer/Private/PostProcess/PostProcessTonemap.cpp',
), 'utf8');
const combineLut = readFileSync(resolve(
  UE_ENGINE_ROOT,
  'Shaders/Private/PostProcessCombineLUTs.usf',
), 'utf8');
assert.equal(
  sha256(tonemapCpp),
  'b4e279d5fa49742e8d5ff1a8f173f1843307eb78461ca0476e5ae2fd18c8a899',
);
assert.equal(
  sha256(combineLut),
  'd3913305b5c5a84543ee675a7fdfeb73868d62083a662131d0d56cdc06e473ab',
);
assert.match(
  tonemapCpp,
  /\(PLATFORM_APPLE \|\| OutputDeviceValue == EDisplayOutputFormat::SDR_ExplicitGammaMapping\) && Gamma == 0\.0f/,
);
assert.match(tonemapCpp, /Gamma = 2\.2f;/);
assert.match(
  tonemapCpp,
  /OutputDeviceValue = EDisplayOutputFormat::SDR_ExplicitGammaMapping;/,
);
assert.match(
  combineLut,
  /OutDeviceColor = pow\( OutputGamutColor, InverseGamma\.z \);/,
);

assert.equal(UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT.platform, 'Apple');
assert.equal(UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT.tonemapperGamma, 0);
assert.equal(UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT.displayGamma, 2.2);
assert.equal(
  UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT.mode,
  'SDR_ExplicitGammaMapping',
);
closeVector(
  evaluateUeSourceOutputTransfer([0, 0.01, 0.18, 0.5, 1]),
  [0, 0.12328467394420663, 0.4586564468643811, 0.7297400528407231, 1],
  1e-14,
);

// The screenshot is only tagged sRGB after UE has already written the raw
// gamma-2.2 codes. The browser path must preserve those codes rather than
// applying Three's sRGB OETF a second time.
const referencePng = readFileSync(resolve(
  ROOT_DIR,
  'assets-local/sostylized/demo-scenes/native-reference/CameraRender1.png',
));
let hasSrgbChunk = false;
for (let offset = 8; offset + 12 <= referencePng.length;) {
  const length = referencePng.readUInt32BE(offset);
  const type = referencePng.toString('ascii', offset + 4, offset + 8);
  if (type === 'sRGB') hasSrgbChunk = true;
  offset += length + 12;
}
assert.equal(hasSrgbChunk, true);

const showcaseSource = readFileSync(resolve(
  ROOT_DIR,
  'examples/source-showcase/main.js',
), 'utf8');
const renderOutputSource = readFileSync(resolve(
  ROOT_DIR,
  'node_modules/three/src/nodes/display/RenderOutputNode.js',
), 'utf8');
assert.equal(
  sha256(renderOutputSource),
  '50d95ac17beb0d1aa022465d848aa2458d770dc3077f97065fbbae2c35deb899',
);
assert.match(
  renderOutputSource,
  /outputColorSpace !== NoColorSpace && outputColorSpace !== ColorManagement\.workingColorSpace/,
);
assert.match(showcaseSource, /outputTransfer: UE_SOURCE_SNOWPINES_CAPTURE_OUTPUT/);
assert.match(
  showcaseSource,
  /renderer\.outputColorSpace = useUeToneMapper[\s\S]*?THREE\.LinearSRGBColorSpace/,
);

console.log('UE source tone-mapping verification passed');
