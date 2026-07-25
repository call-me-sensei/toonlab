#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5176';
const outputPath = process.env.SOURCE_SHOWCASE_SCREENSHOT
  ?? '/private/tmp/toonlab-source-showcase-smoke.png';
const materialMode = process.env.SOURCE_MATERIAL_MODE ?? 'live';
const fogProfile = process.env.SOURCE_FOG_PROFILE?.trim() || null;
const sourcePostEnabled = process.env.SOURCE_POST !== '0';
const temporalEnabled = process.env.SOURCE_TAA !== '0';
const relaxedPostAssertions = process.env.SOURCE_PROBE_RELAXED === '1';
const debugLog = (message) => {
  if (process.env.SOURCE_SHOWCASE_DEBUG === '1') process.stderr.write(`[probe] ${message}\n`);
};
const ledger = JSON.parse(await readFile(
  new URL('../docs/source-shader-port-ledger.json', import.meta.url),
  'utf8',
));
const statusCount = (entries, field, status) => entries.filter(
  (entry) => entry[field] === status,
).length;
const url = new URL('/examples/source-showcase/', baseUrl);
for (const [name, value] of Object.entries({
  animate: '0',
  camera: '1',
  dpr: '1',
  material: materialMode,
  post: sourcePostEnabled ? '1' : '0',
  shadowBias: '0',
  shadowNormalBias: '0',
  taa: temporalEnabled ? '1' : '0',
  tone: 'ue',
})) url.searchParams.set(name, value);
if (fogProfile) url.searchParams.set('fogPP', fogProfile);
for (const [environmentName, queryName] of [
  ['SOURCE_AO', 'ao'],
  ['SOURCE_BLOOM', 'bloom'],
  ['SOURCE_BLOOM_DEBUG', 'bloomDebug'],
  ['SOURCE_BLOOM_INPUT', 'bloomInput'],
  ['SOURCE_DOF', 'dof'],
  ['SOURCE_POST_STAGE', 'postStage'],
  ['SOURCE_SHADOWS', 'shadows'],
  ['SOURCE_VIGNETTE', 'vignette'],
]) {
  if (process.env[environmentName] !== undefined) {
    url.searchParams.set(queryName, process.env[environmentName]);
  }
}

const launchOptions = {
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
};
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) {
  launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
}
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
}
const browser = await chromium.launch(launchOptions);

try {
  debugLog(`navigate ${url.href}`);
  const page = await browser.newPage({ viewport: {
    height: Number(process.env.SOURCE_SHOWCASE_HEIGHT) || 900,
    width: Number(process.env.SOURCE_SHOWCASE_WIDTH) || 1600,
  } });
  const failedResponses = [];
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`[console] ${message.text()}`);
    else if (process.env.SOURCE_SHOWCASE_DEBUG === '1'
      && message.text().startsWith('[UE Source Bloom]')) {
      debugLog(message.text());
    }
  });
  page.on('pageerror', (error) => runtimeErrors.push(`[pageerror] ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  debugLog('domcontentloaded');
  await page.waitForFunction(
    () => document.body.dataset.stageReady === 'true'
      || Boolean(document.body.dataset.stageError),
    undefined,
    { timeout: 120_000 },
  );
  debugLog('stageReady');
  await page.waitForFunction(
    () => document.body.dataset.worldReady === 'true'
      || Boolean(document.body.dataset.stageError),
    undefined,
    { timeout: 120_000 },
  );
  debugLog('worldReady');
  // A ready flag is set from the render loop itself. Keep several additional
  // frames alive so deferred WebGPU pipeline errors are included in the smoke.
  await page.waitForTimeout(5_000);
  debugLog('deferred-error window complete');

  const dataset = await page.evaluate(() => ({ ...document.body.dataset }));
  // Capture renderer pixels only. The comparison controls are intentionally
  // HTML overlays and would otherwise contaminate deterministic image metrics.
  await page.evaluate(() => {
    for (const selector of [
      '#hud',
      '#badge',
      '#port-status',
      '#hint',
      '#camera-name',
      '#comparison',
      '#loading',
      '#native-reference',
    ]) {
      const element = document.querySelector(selector);
      if (element) element.style.display = 'none';
    }
  });
  await page.locator('canvas').first().screenshot({ path: outputPath });
  debugLog(`screenshot ${outputPath}`);

  if (process.env.SOURCE_SHOWCASE_DEBUG === '1') {
    console.log(JSON.stringify({ dataset, failedResponses, runtimeErrors }, null, 2));
  }

  assert.equal(dataset.stageError, undefined, dataset.stageError);
  assert.equal(dataset.stageReady, 'true', 'source showcase must finish staging');
  assert.equal(dataset.worldReady, 'true', 'source showcase must render a frame');
  assert.equal(dataset.materialMode, materialMode, 'smoke must exercise the requested source mode');
  assert.equal(dataset.unresolvedCount, '0', 'all source material slots must resolve');
  assert.ok(Number(dataset.materialCount) > 0, 'showcase must stage source materials');
  const lightingAdapterAudit = JSON.parse(dataset.materialLightingAdapterAudit);
  assert.equal(lightingAdapterAudit.mismatches.length, 0);
  assert.ok(
    lightingAdapterAudit.rockMountainExactCount > 0,
    'rock/mountain materials must consume the UE captured-SkyLight input adapter',
  );
  assert.equal(
    dataset.renderMetadataMatchedComponentCount,
    dataset.renderMetadataComponentCount,
    'every exported static-mesh component must consume its authored render metadata',
  );
  assert.equal(dataset.renderMetadataMissingCount, '0');
  assert.equal(
    dataset.shadowDisabledComponentCount,
    '19',
    'SnowPines must preserve all 19 authored non-shadow-casting components',
  );
  assert.equal(
    dataset.shaderRuntimeComplete,
    String(statusCount(ledger.shaderFamilies, 'runtimePort', 'complete')),
  );
  assert.equal(
    dataset.shaderRuntimePartial,
    String(statusCount(ledger.shaderFamilies, 'runtimePort', 'partial')),
  );
  assert.equal(
    dataset.shaderRuntimeNotStarted,
    String(statusCount(ledger.shaderFamilies, 'runtimePort', 'not-started')),
  );
  assert.equal(
    dataset.shaderParityLeft,
    String(ledger.shaderFamilies.length - statusCount(
      ledger.shaderFamilies,
      'parity',
      'complete',
    )),
  );
  assert.equal(
    dataset.rendererComplete,
    String(statusCount(ledger.rendererSystems, 'status', 'complete')),
  );
  assert.equal(
    dataset.rendererPartial,
    String(statusCount(ledger.rendererSystems, 'status', 'partial')),
  );
  assert.equal(
    dataset.rendererNotStarted,
    String(statusCount(ledger.rendererSystems, 'status', 'not-started')),
  );
  if ((materialMode === 'live' || materialMode === 'compare') && !relaxedPostAssertions) {
    assert.equal(dataset.skyLightMode, 'native-irradiance-sh');
    assert.equal(dataset.skyLightNativeIrradiance, 'true');
    assert.equal(dataset.skyLightCaptureResolution, '128');
    assert.equal(dataset.skyLightCaptureNear, '1500');
    assert.equal(dataset.skyLightDiffuseMip, '2');
    assert.equal(dataset.skyLightDiffuseSize, '32');
    assert.equal(dataset.skyLightFogParticipation, 'true');
    assert.equal(dataset.skyLightCaptureVisibility, 'complete-scene-near-plane');
    assert.ok(Number(dataset.skyLightCaptureMeshCount) > 0);
    assert.ok(Number(dataset.skyLightSourceSkyMeshCount) > 0);
    const diffuseSh = JSON.parse(dataset.skyLightDiffuseSh);
    const tintedDiffuseSh = JSON.parse(dataset.skyLightTintedDiffuseSh);
    const browserDiffuseSh = JSON.parse(dataset.skyLightBrowserDiffuseSh);
    assert.equal(diffuseSh.length, 9);
    assert.equal(tintedDiffuseSh.length, 9);
    assert.equal(browserDiffuseSh.length, 9);
    assert.equal(dataset.skyLightTintedFinite, 'true');
    assert.equal(tintedDiffuseSh.flat().every(Number.isFinite), true);
    assert.ok(Number(dataset.skyLightShMaximumDelta) > 0);
    assert.ok(
      Number(dataset.skyLightShMaximumDelta) < 0.1,
      'browser recapture must remain a bounded diagnostic around native UE SH',
    );
    assert.equal(diffuseSh.flat().every(Number.isFinite), true);
    assert.equal(
      diffuseSh.flat().some((value) => Math.abs(value) > 0.00001),
      true,
      'captured SkyLight SH must contain radiance',
    );
    assert.doesNotMatch(
      dataset.skyLightRemainingBridges,
      /does not expose.*irradiance SH/,
    );
    assert.match(dataset.skyLightRemainingBridges, /GGX VNDF/);
    assert.equal(dataset.shadowFilter, 'UE Manual5x5PCF raw gather');
    assert.equal(dataset.shadowConstantBiasBridge, 'orthographic receiver-equivalent');
    assert.equal(dataset.shadowSlopeRasterBias, 'contract-exported-runtime-gap');
    const csmDebug = JSON.parse(dataset.csmDebug);
    assert.equal(csmDebug.boundToAuthoredCamera, true);
    assert.ok(Math.abs(csmDebug.camera.near - 0.05) < 0.000001);
    assert.equal(csmDebug.camera.far, 2000);
    assert.equal(csmDebug.breaks.length, 4);
    assert.equal(csmDebug.breaks.at(-1), 1);
    assert.equal(
      csmDebug.breaks.every((value, index, values) =>
        value > 0 && value <= 1 && (index === 0 || value > values[index - 1])),
      true,
      'source CSM breaks must be strictly increasing rather than capture-camera collapsed',
    );
    assert.equal(csmDebug.shadowContracts.length, 4);
    assert.equal(csmDebug.shadowLayouts.length, 4);
    assert.equal(
      csmDebug.shadowLayouts.every((layout) =>
        layout.x.physical === 2048
        && layout.x.interior === 2040
        && layout.x.border === 4
        && layout.y.physical === 2048
        && layout.y.interior === 2040
        && layout.y.border === 4),
      true,
      'every source CSM must preserve UE Metal physical/interior/border sizing',
    );
    assert.equal(
      csmDebug.shadowContracts.every((contract) =>
        Number.isFinite(contract.depthBias)
        && Number.isFinite(contract.transitionScale)),
      true,
    );
    assert.equal(dataset.bloomMethod, 'BM_SOG desktop Gaussian bloom');
    assert.equal(dataset.bloomIntensity, '5');
    assert.equal(dataset.bloomThreshold, '0.5');
    assert.equal(dataset.vignetteType, 'CosineFourthLaw');
    assert.equal(dataset.vignetteIntensity, '0.4000000059604645');
    assert.equal(dataset.vignetteAspectRatio, String(9 / 16));
    assert.equal(dataset.dofMode, 'UE physical CoC + WebGPU gather bridge');
    assert.ok(Number(dataset.dofFocusDistance) > 0);
    assert.ok(Number(dataset.dofInfinityCocRadius) > 0);
    assert.equal(dataset.dofBladeCount, '7');
    assert.match(dataset.dofRemainingBridges, /DiaphragmDOF gather\/scatter/);
    assert.equal(dataset.ambientOcclusionMethod, 'SSAO');
    assert.equal(dataset.ambientOcclusionRadius, '160');
    assert.equal(dataset.ambientOcclusionFullResRadius, '0.1');
    assert.equal(dataset.ambientOcclusionHalfResRadius, '0.17');
    assert.equal(dataset.ambientOcclusionQuality, '50');
    assert.equal(dataset.ambientOcclusionShaderQuality, '2');
    assert.equal(dataset.ambientOcclusionLevels, '2');
    assert.equal(dataset.ambientOcclusionSampleLookups, '12,24');
    assert.match(dataset.ambientOcclusionRemainingBridges, /WedgeWithNormal/);
    assert.equal(dataset.temporalDitherGraphCount, '8');
    assert.equal(dataset.temporalDitherRuntimeBindingCount, '4');
    assert.equal(dataset.temporalSequenceLength, temporalEnabled ? '8' : '0');
    assert.equal(dataset.temporalAntiAliasing, temporalEnabled ? 'true' : 'false');
    if (temporalEnabled) {
      assert.equal(dataset.temporalAntiAliasingMode, 'AAM_TemporalAA / MainUpsampling');
      assert.match(dataset.temporalJitter, /Halton/);
      assert.equal(dataset.temporalSourceCurrentFrameWeight, '0.04');
      assert.equal(dataset.temporalRuntimeResolveCurrentFrameWeight, '0.04');
      assert.match(dataset.temporalHistoryResolve, /UE Gen4 MainUpsampling High/);
      assert.match(dataset.temporalRemainingBridges, /responsive-AA stencil/);
      assert.match(dataset.temporalRemainingBridges, /primitive mobility/);
      assert.match(dataset.temporalDither, /exact graph/);
    }
  }
  if (fogProfile) {
    assert.match(dataset.fogPostProcess ?? '', /M[I]?_StylizedFogPP_/);
    assert.equal(dataset.fogPostBlendableLocation, 'BL_SCENE_COLOR_AFTER_DOF');
    assert.equal(dataset.fogVolumeStatus, 'authored-volume-bound');
  }
  const actionableErrors = runtimeErrors.filter(
    (message) => !message.includes('Failed to load resource: the server responded with a status of 404'),
  );
  const actionableResponses = failedResponses.filter(
    (message) => !message.endsWith('/favicon.ico'),
  );
  assert.deepEqual(actionableErrors, [], actionableErrors.join('\n'));
  assert.deepEqual(actionableResponses, [], actionableResponses.join('\n'));

  console.log(JSON.stringify({
    materialCount: Number(dataset.materialCount),
    skyLight: {
      captureFar: Number(dataset.skyLightCaptureFar),
      captureMeshes: Number(dataset.skyLightCaptureMeshCount),
      captureNear: Number(dataset.skyLightCaptureNear),
      captureResolution: Number(dataset.skyLightCaptureResolution),
      diffuseMip: Number(dataset.skyLightDiffuseMip),
      diffuseSize: Number(dataset.skyLightDiffuseSize),
      fogParticipation: dataset.skyLightFogParticipation === 'true',
      mode: dataset.skyLightMode,
      sourceSkyMeshes: Number(dataset.skyLightSourceSkyMeshCount),
    },
    fogPostProcess: dataset.fogPostProcess,
    fogVolumeStatus: dataset.fogVolumeStatus,
    meshCount: Number(dataset.meshCount),
    outputPath,
    ignoredResponses: failedResponses.filter((entry) => entry.endsWith('/favicon.ico')),
    rendererBackend: dataset.rendererBackend ?? 'WebGPURenderer',
    unresolvedCount: Number(dataset.unresolvedCount),
    worldReady: dataset.worldReady,
  }, null, 2));
} finally {
  await browser.close();
}
