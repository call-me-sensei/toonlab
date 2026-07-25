#!/usr/bin/env node

import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5181';
const fullGraphEnabled = process.env.UNITY_TAA_FULL !== '0';
const metadata = JSON.parse(await readFile(
  new URL('../node_modules/.vite/deps/_metadata.json', import.meta.url),
  'utf8',
));
const optimized = metadata.optimized ?? {};
const webgpuHash = optimized['three/webgpu']?.fileHash;
const tslHash = optimized['three/tsl']?.fileHash;
assert.ok(webgpuHash, 'Vite must optimize three/webgpu before the runtime probe');
assert.ok(tslHash, 'Vite must optimize three/tsl before the runtime probe');

const launchOptions = {
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
};
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) {
  launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
}
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
} else {
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try {
    await access(systemChrome);
    launchOptions.executablePath = systemChrome;
    launchOptions.args.push('--use-angle=metal');
  } catch {
    // Fall back to Playwright's managed Chromium on non-macOS hosts.
  }
}

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { height: 128, width: 128 } });
  await page.goto(`${baseUrl}/docs/unity-shader-port-ledger.json`, {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });

  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const result = await page.evaluate(async ({ taaModuleUrl, tslUrl, webgpuUrl }) => {
    document.body.replaceChildren();
    const THREE = await import(webgpuUrl);
    const TSL = await import(tslUrl);
    const unityTaa = await import(taaModuleUrl);

    const renderer = new THREE.WebGPURenderer({ antialias: false });
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(64, 64);
    document.body.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0.2, 0.3, 0.6);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    scene.add(new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: 0x80a0c0 }),
    ));

    const scenePass = TSL.pass(scene, camera, { samples: 0 });
    scenePass.setMRT(TSL.mrt({
      normal: TSL.normalView,
      output: TSL.output,
      velocity: TSL.velocity,
    }));
    const temporal = unityTaa.soStylizedUnityTraa(
      scenePass.getTextureNode('output'),
      scenePass.getTextureNode('depth'),
      scenePass.getTextureNode('velocity'),
      camera,
    );
    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputNode = temporal;

    for (let frame = 0; frame < 8; frame += 1) {
      camera.position.x = frame * 0.001;
      camera.updateMatrixWorld();
      pipeline.render();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const report = {
      depthHistory: temporal.contract.depthHistory,
      historyDepthAttachment: temporal._historyRenderTarget.depthTexture,
      previousDepthNode: temporal._previousDepthNode,
      usesInheritedUpdate: temporal.updateBefore.toString().includes('super.updateBefore'),
    };
    pipeline.dispose();
    temporal.dispose();
    renderer.dispose();
    return report;
  }, {
    taaModuleUrl: `${baseUrl}/src/environment/soStylizedUnityTemporal.js?runtime-probe=1`,
    tslUrl: `${baseUrl}/node_modules/.vite/deps/three_tsl.js?v=${tslHash}`,
    webgpuUrl: `${baseUrl}/node_modules/.vite/deps/three_webgpu.js?v=${webgpuHash}`,
  });
  await page.waitForTimeout(500);

  const criticalErrors = errors.filter((message) => (
    /copyFramebufferToTexture|GPUValidationError|Render pipeline creation failed|WGSL.*error/i
      .test(message)
  ));
  assert.deepEqual(criticalErrors, [], criticalErrors.join('\n\n'));
  assert.equal(result.depthHistory, false);
  assert.equal(result.historyDepthAttachment, null);
  assert.equal(result.previousDepthNode, null);
  assert.equal(result.usesInheritedUpdate, false);

  console.log('Unity URP High TAA WebGPU runtime: 8 moving-camera frames passed.');
  console.log('Depth history: absent; color history only; no incompatible depth copy.');

  if (fullGraphEnabled) {
    const fullPage = await browser.newPage({ viewport: { height: 540, width: 960 } });
    const fullErrors = [];
    fullPage.on('console', (message) => {
      if (message.type() === 'error') fullErrors.push(`[console] ${message.text()}`);
    });
    fullPage.on('pageerror', (error) => fullErrors.push(`[pageerror] ${error.message}`));

    const fullUrl = new URL('/examples/unity-showcase/', baseUrl);
    for (const [name, value] of Object.entries({
      animate: '0',
      debug: '1',
      dpr: '1',
      post: '1',
      rev: 'taa-full-stack-probe',
      view: 'live',
    })) fullUrl.searchParams.set(name, value);
    await fullPage.goto(fullUrl.href, {
      timeout: 180_000,
      waitUntil: 'domcontentloaded',
    });
    await fullPage.waitForFunction(
      () => document.body.dataset.unityReady === 'true'
        || document.body.dataset.unityReady === 'error',
      undefined,
      { timeout: 180_000 },
    );
    await fullPage.waitForTimeout(3_000);

    const fullReport = await fullPage.evaluate(() => {
      const dataset = { ...document.body.dataset };
      const runtime = globalThis.__TOONLAB_UNITY_SHOWCASE__;
      const temporal = runtime?.post?.temporalAA ?? null;
      const report = {
        dataset,
        diagnostic: document.querySelector('#diagnostic')?.textContent ?? '',
        loading: document.querySelector('#loading')?.textContent ?? '',
        temporal: temporal ? {
          depthHistory: temporal.contract.depthHistory,
          historyDepthAttachment: temporal._historyRenderTarget.depthTexture,
          ownsSetup: Object.hasOwn(Object.getPrototypeOf(temporal), 'setup'),
          previousDepthNode: temporal._previousDepthNode,
        } : null,
      };
      runtime?.renderer?.setAnimationLoop(null);
      return report;
    });
    const fullCriticalErrors = fullErrors.filter((message) => (
      /Cannot set properties of null|TRAANode|soStylizedUnityTemporal|No stack defined for assign operation|copyFramebufferToTexture|GPUValidationError|Render pipeline creation failed|WGSL.*error/i
        .test(message)
    ));
    assert.equal(
      fullReport.dataset.unityReady,
      'true',
      `${fullReport.loading}\n${fullReport.diagnostic}\n${fullErrors.join('\n')}`,
    );
    assert.equal(fullReport.dataset.worldReady, 'true');
    assert.equal(fullReport.dataset.renderFrameGate, 'passed');
    assert.equal(fullReport.dataset.renderFrameNonClear, 'true');
    assert.equal(fullReport.dataset.postRenderPhaseFailed, 'none');
    assert.match(fullReport.dataset.postOrder, /fog>taa>bloom/);
    assert.ok(fullReport.temporal, 'full Mega post graph must instantiate Unity TAA');
    assert.equal(fullReport.temporal.depthHistory, false);
    assert.equal(fullReport.temporal.historyDepthAttachment, null);
    assert.equal(fullReport.temporal.previousDepthNode, null);
    assert.equal(fullReport.temporal.ownsSetup, true);
    assert.deepEqual(fullCriticalErrors, [], fullCriticalErrors.join('\n\n'));
    await fullPage.close();

    console.log('Full M_Demonstration_Mega post graph: non-clear final frame passed.');
    console.log('Full order: opaque > SSAO > fog > TAA > bloom > vignette > LDR grade.');

    const directPage = await browser.newPage({ viewport: { height: 540, width: 960 } });
    const directErrors = [];
    directPage.on('console', (message) => {
      if (message.type() === 'error') directErrors.push(`[console] ${message.text()}`);
    });
    directPage.on('pageerror', (error) => directErrors.push(`[pageerror] ${error.message}`));

    const directUrl = new URL('/examples/unity-showcase/', baseUrl);
    for (const [name, value] of Object.entries({
      animate: '0',
      debug: '1',
      dpr: '1',
      post: '0',
      rev: 'taa-direct-depth-probe',
      view: 'live',
    })) directUrl.searchParams.set(name, value);
    await directPage.goto(directUrl.href, {
      timeout: 180_000,
      waitUntil: 'domcontentloaded',
    });
    await directPage.waitForFunction(
      () => document.body.dataset.unityReady === 'true'
        || document.body.dataset.unityReady === 'error',
      undefined,
      { timeout: 180_000 },
    );
    await directPage.waitForTimeout(3_000);

    const directReport = await directPage.evaluate(() => {
      const dataset = { ...document.body.dataset };
      const runtime = globalThis.__TOONLAB_UNITY_SHOWCASE__;
      const report = {
        dataset,
        diagnostic: document.querySelector('#diagnostic')?.textContent ?? '',
        loading: document.querySelector('#loading')?.textContent ?? '',
        postActive: Boolean(runtime?.post),
      };
      runtime?.renderer?.setAnimationLoop(null);
      return report;
    });
    const directCriticalErrors = directErrors.filter((message) => (
      /Cannot set properties of null|TRAANode|soStylizedUnityTemporal|No stack defined for assign operation|copyFramebufferToTexture|GPUValidationError|Render pipeline creation failed|WGSL.*error/i
        .test(message)
    ));
    assert.equal(
      directReport.dataset.unityReady,
      'true',
      `${directReport.loading}\n${directReport.diagnostic}\n${directErrors.join('\n')}`,
    );
    assert.equal(directReport.dataset.worldReady, 'true');
    assert.equal(directReport.dataset.renderFrameGate, 'passed');
    assert.equal(directReport.dataset.renderFrameNonClear, 'true');
    assert.equal(directReport.dataset.postRenderPhaseFailed, 'none');
    assert.equal(directReport.dataset.postOrder, 'off');
    assert.equal(directReport.postActive, false);
    assert.deepEqual(directCriticalErrors, [], directCriticalErrors.join('\n\n'));
    await directPage.close();

    console.log('Direct M_Demonstration_Mega post=0 graph: non-clear frame passed.');
    console.log('Adaptive viewport depth: full-post and direct source formats passed.');
  }
} finally {
  await browser.close();
}
