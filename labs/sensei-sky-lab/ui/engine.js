// Sensei Sky Lab preview.
//
// Renders the procedurally baked Call Me Sensei sky-dome + cloud variation
// through the same preview renderer that shows the licensed reference set
// (labs/shared/p18/referenceSky.js) — the variation is a pure asset swap.
// The licensed P18 reference loads only as an optional comparison side and
// the lab degrades to Sensei-only when that private archive is absent.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createLabRenderer,
  whenRendererReady,
} from '../../shared/rendererFactory.js';
import {
  loadP18ReferenceContract,
  sampleP18ReferenceTime,
} from '../../shared/p18/referenceEnvironment.js';
import { createP18PreviewReferenceSky } from '../../shared/p18/referenceSky.js';
import { SENSEI_SKY_ASSET_ROOT } from '../params.js';

const CONTRACT_URL = `${SENSEI_SKY_ASSET_ROOT}/contract.json`;

function createGroundDisc(radius, name) {
  const material = new THREE.MeshBasicMaterial({ color: 0x445544 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), material);
  disc.rotation.x = -Math.PI / 2;
  disc.name = name;
  return disc;
}

export function createSenseiSkyLabEngine({ mount, store }) {
  const renderer = createLabRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 1);
  mount.appendChild(renderer.domElement);

  // Both comparison sides render every frame from the same camera; in split
  // mode the halves are scissored so the framing stays spatially aligned.
  const senseiScene = new THREE.Scene();
  const referenceScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2_000_000,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxDistance = 60;
  controls.minDistance = 1;
  controls.maxPolarAngle = Math.PI - 0.02;
  controls.minPolarAngle = 0.02;

  let contract = null;
  let senseiSky = null;
  let senseiGround = null;
  let referenceContract = null;
  let referenceSky = null;
  let referenceGround = null;
  let referenceState = 'unloaded'; // unloaded | loading | ready | unavailable
  let disposed = false;
  let started = false;
  let scenarioToken = 0;
  let previousFrameTime = performance.now();
  let cycleAccumulator = 0;

  function activeScenario() {
    const { scenarioId } = store.getState();
    return contract?.scenarios.find((entry) => entry.id === scenarioId)
      ?? contract?.scenarios[0]
      ?? null;
  }

  function resetCamera() {
    if (!contract) return;
    camera.position.fromArray(contract.camera.position);
    camera.up.fromArray(contract.camera.up);
    controls.target.fromArray(contract.camera.lookAt);
    camera.lookAt(controls.target);
    controls.update();
  }

  function applyTime() {
    const scenario = activeScenario();
    if (!scenario) return;
    const { hour } = store.getState().view;
    senseiSky?.setTime({
      energy: scenario.energy,
      hour,
      tint: scenario.tint,
    });
    if (referenceSky) {
      const time = sampleP18ReferenceTime(hour);
      referenceSky.setTime({ energy: time.skyEnergy, tint: time.skyTint });
    }
    document.body.dataset.previewTimeOfDay =
      `${String(Math.floor(hour)).padStart(2, '0')}:${
        String(Math.round((hour % 1) * 60)).padStart(2, '0')
      }`;
  }

  function applyGroundVisibility() {
    const visible = store.getState().view.ground;
    if (senseiGround) senseiGround.visible = visible;
    if (referenceGround) referenceGround.visible = visible;
  }

  async function applyScenario() {
    const scenario = activeScenario();
    if (!scenario) return;
    scenarioToken += 1;
    const token = scenarioToken;
    const previous = senseiSky;
    // Scenario rows live in the baked atlases; the preview renderer reads
    // the row once at build time, so switching scenarios rebuilds the sky
    // from browser-cached assets.
    const built = await createP18PreviewReferenceSky({
      ...contract,
      sky: {
        ...contract.sky,
        backgroundCloudStrength: scenario.cloudShader.backgroundCloudStrength,
        cloudShellCurveRow: scenario.cloudShellCurveRow,
        curveRow: scenario.curveRow,
      },
    });
    if (disposed || token !== scenarioToken) {
      built?.dispose();
      return;
    }
    if (previous) {
      senseiScene.remove(previous.root);
      previous.dispose();
    }
    senseiSky = built;
    senseiScene.add(senseiSky.root);
    senseiSky.setComponentStyles({ clouds: 'call_me_sensei', sky: 'call_me_sensei' });
    senseiSky.setVisibility({ clouds: true, sky: true });
    senseiSky.applySkyShaderSettings(scenario.skyShader);
    senseiSky.applyCloudShaderSettings(scenario.cloudShader);
    senseiGround?.material.color.set(scenario.groundColor);
    // The licensed parity stage uses a plain white measurement plane; share
    // the scenario ground so the halves compare skies, not stages.
    referenceGround?.material.color.set(scenario.groundColor);
    applyTime();
    document.body.dataset.senseiSkyScenario = scenario.id;
    store.actions.adoptEngineState({
      status: `${scenario.label} — baked from params seed ${contract.seed}.`,
    });
  }

  async function ensureReferenceSide() {
    if (referenceState !== 'unloaded') return;
    referenceState = 'loading';
    try {
      referenceContract = await loadP18ReferenceContract();
      if (disposed) return;
      referenceSky = await createP18PreviewReferenceSky(referenceContract);
      if (disposed) {
        referenceSky?.dispose();
        return;
      }
      referenceScene.add(referenceSky.root);
      referenceSky.setComponentStyles({ clouds: 'call_me_sensei', sky: 'call_me_sensei' });
      referenceSky.setVisibility({ clouds: true, sky: true });
      referenceGround = createGroundDisc(
        contract.ground.radiusMeters,
        'Reference comparison ground',
      );
      referenceGround.material.color.set(
        activeScenario()?.groundColor ?? '#445544',
      );
      referenceScene.add(referenceGround);
      referenceState = 'ready';
      applyGroundVisibility();
      applyTime();
      store.actions.adoptEngineState({ referenceAvailable: true });
    } catch (error) {
      referenceState = 'unavailable';
      store.actions.adoptEngineState({
        referenceAvailable: false,
        status: `Reference side unavailable: ${error?.message ?? 'archive missing'}. Showing Sensei set only.`,
      });
      store.actions.setView({ compare: 'sensei' });
    }
  }

  let appliedScenarioId = null;
  let appliedHour = null;
  let appliedCompare = null;
  let appliedGroundVisible = null;

  const unsubscribe = store.subscribe(() => {
    if (!contract) return;
    const state = store.getState();
    if (state.scenarioId !== appliedScenarioId) {
      appliedScenarioId = state.scenarioId;
      applyScenario();
    }
    if (state.view.hour !== appliedHour) {
      appliedHour = state.view.hour;
      applyTime();
    }
    if (state.view.compare !== appliedCompare) {
      appliedCompare = state.view.compare;
      if (state.view.compare !== 'sensei') ensureReferenceSide();
      document.body.dataset.senseiSkyCompare = state.view.compare;
    }
    if (state.view.ground !== appliedGroundVisible) {
      appliedGroundVisible = state.view.ground;
      applyGroundVisibility();
    }
  });

  function renderFrame(frameTime = performance.now()) {
    if (disposed) return;
    const delta = Math.min(Math.max((frameTime - previousFrameTime) / 1000, 0), 0.1);
    previousFrameTime = frameTime;
    const state = store.getState();
    if (state.view.autoCycle) {
      cycleAccumulator += delta;
      if (cycleAccumulator >= 0.1) {
        store.actions.setPreviewHour(state.view.hour + cycleAccumulator * 0.5);
        cycleAccumulator = 0;
      }
    } else {
      cycleAccumulator = 0;
    }
    controls.update();
    if (state.view.drift) {
      senseiSky?.update(delta);
      referenceSky?.update(delta);
    }

    const compare = state.view.compare;
    const showReference = compare !== 'sensei' && referenceState === 'ready';
    if (compare === 'split' && showReference) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const half = Math.floor(width / 2);
      // Every pixel is overdrawn by a sky dome, so the halves only need a
      // shared depth reset before the two scissored passes.
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, half, height);
      renderer.render(senseiScene, camera);
      renderer.setScissor(half, 0, width - half, height);
      renderer.render(referenceScene, camera);
      renderer.setScissorTest(false);
      renderer.autoClear = true;
    } else {
      renderer.render(showReference ? referenceScene : senseiScene, camera);
    }
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  return {
    camera,
    controls,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      renderer.setAnimationLoop(null);
      senseiSky?.dispose();
      referenceSky?.dispose();
      senseiGround?.geometry.dispose();
      senseiGround?.material.dispose();
      referenceGround?.geometry.dispose();
      referenceGround?.material.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    renderer,
    resetCamera,
    async start() {
      if (started) return;
      started = true;
      await whenRendererReady(renderer);
      if (disposed) return;

      const response = await fetch(CONTRACT_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(
          'The baked Sensei sky set is missing — run `npm run assets:sensei-sky` first.',
        );
      }
      contract = await response.json();
      if (disposed) return;

      camera.fov = contract.camera.verticalFieldOfViewDegrees;
      camera.near = contract.camera.near;
      camera.updateProjectionMatrix();

      senseiGround = createGroundDisc(
        contract.ground.radiusMeters,
        'Sensei stage ground',
      );
      senseiGround.visible = contract.ground.visible;
      senseiScene.add(senseiGround);

      const state = store.getState();
      appliedScenarioId = state.scenarioId;
      appliedHour = state.view.hour;
      appliedCompare = state.view.compare;
      appliedGroundVisible = state.view.ground;
      store.actions.adoptEngineState({
        contractMeta: {
          generatedAt: contract.generatedAt,
          seed: contract.seed,
        },
        scenarios: contract.scenarios.map((entry) => ({
          hour: entry.hour,
          id: entry.id,
          label: entry.label,
        })),
      });
      await applyScenario();
      if (disposed) return;
      applyGroundVisibility();
      resetCamera();
      if (state.view.compare !== 'sensei') ensureReferenceSide();

      previousFrameTime = performance.now();
      renderer.setAnimationLoop(renderFrame);
      document.body.dataset.modelReady = 'true';
      document.body.dataset.senseiSkyLabReady = 'true';
      store.actions.adoptEngineState({
        engineReady: true,
        status: 'Sensei sky variation ready.',
      });
    },
  };
}
