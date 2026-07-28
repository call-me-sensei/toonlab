// Ground Shader Lab authors one portable Ground profile inside the accepted
// P18 comparison scene. The P18 terrain geometry and every surrounding
// component are fixed preview context; visibility, style overrides, time,
// weather, and camera never enter the exported shader document.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createGroundShaderMaterial,
  disposeGroundShaderMaterial,
  setGroundShaderSceneState,
} from '../../../src/ground-shader/index.js';
import {
  createP18ReferenceRenderer,
  createP18ShaderPreviewScene,
} from '../../shared/p18/referenceScene.js';
import {
  createP18PreviewGroundSnowLayer,
} from '../../shared/p18/previewWeatherLayers.js';
import { whenRendererReady } from '../../shared/rendererFactory.js';

export async function createGroundShaderLabEngine({ mount, store }) {
  const renderer = await createP18ReferenceRenderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2_000_000,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;

  const referenceScene = await createP18ShaderPreviewScene({
    authoredComponent: 'ground',
    camera,
    renderer,
    scene,
  });
  const groundRoot = referenceScene.environmentContent.groundRoot;
  if (!groundRoot?.isMesh) {
    throw new Error('The accepted P18 comparison scene has no Ground Shader target.');
  }
  const sourceGroundMaterial = groundRoot.material;
  let material = await createGroundShaderMaterial({
    library: referenceScene.environmentContent.library,
    settings: store.getState().settings,
    state: referenceScene.environmentContent.state,
  });
  groundRoot.material = material;
  groundRoot.receiveShadow = true;
  const previewGroundSnow = createP18PreviewGroundSnowLayer(groundRoot);

  const groundBounds = new THREE.Box3().setFromObject(groundRoot, true);
  const groundCenter = groundBounds.getCenter(new THREE.Vector3());
  const groundSize = groundBounds.getSize(new THREE.Vector3());
  let appliedRevision = -1;
  let appliedPreviewHour = null;
  let appliedPreviewState = null;
  let appliedViewMode = null;
  let autoCycleAccumulator = 0;
  let disposed = false;
  let profileRequest = 0;
  const clock = new THREE.Clock();

  function frameMode(mode = store.getState().view.viewMode) {
    if (mode === 'composition') {
      controls.target.copy(referenceScene.resetCamera());
      controls.update();
      return;
    }
    camera.up.set(0, 1, 0);
    if (mode === 'surface') {
      controls.target.copy(groundCenter);
      camera.position.copy(groundCenter).add(new THREE.Vector3(
        groundSize.x * 0.28,
        Math.max(groundSize.y + 2.4, 4.4),
        groundSize.z * 0.38,
      ));
    } else {
      controls.target.copy(groundCenter);
      camera.position.copy(groundCenter).add(new THREE.Vector3(
        0.01,
        Math.max(groundSize.x, groundSize.z) * 0.78,
        0.01,
      ));
      camera.up.set(0, 0, -1);
    }
    camera.lookAt(controls.target);
    controls.update();
  }

  async function applyProfile() {
    const request = ++profileRequest;
    document.body.dataset.groundShaderLoading = 'true';
    try {
      const next = await createGroundShaderMaterial({
        library: referenceScene.environmentContent.library,
        settings: store.getState().settings,
        state: referenceScene.environmentContent.state,
      });
      if (disposed || request !== profileRequest) {
        disposeGroundShaderMaterial(next);
        return;
      }
      const previous = material;
      previewGroundSnow.dispose();
      material = next;
      groundRoot.material = material;
      previewGroundSnow.apply();
      disposeGroundShaderMaterial(previous);
      const writes = material.userData.toonlabGroundShader.fieldCount;
      const report = { applied: 1, matched: 1, skipped: 0, visited: 1, writes };
      store.actions.adoptEngineState({ coverage: report });
      document.body.dataset.groundShaderMatched = '1';
      document.body.dataset.groundShaderWrites = String(writes);
      setGroundShaderSceneState(material, {
        wetness: store.getState().view.wetness,
      });
      previewGroundSnow.setSnowCover(store.getState().view.snowCover);
    } finally {
      if (request === profileRequest) {
        document.body.dataset.groundShaderLoading = 'false';
      }
    }
  }

  function applyWorldState() {
    const state = store.getState();
    referenceScene.applyTime(state.previewHour);
    setGroundShaderSceneState(material, {
      wetness: state.view.wetness,
    });
    previewGroundSnow.setSnowCover(state.view.snowCover);
    document.body.dataset.previewGroundSnowCover = String(state.view.snowCover);
    document.body.dataset.previewGroundWetness = String(state.view.wetness);
    appliedPreviewHour = state.previewHour;
  }

  function applyPreviewState() {
    const { preview, view } = store.getState();
    const styles = referenceScene.applyComponentStyles(preview);
    previewGroundSnow.setStyle(styles.snowSurface);
    previewGroundSnow.apply();
    const visible = referenceScene.applyComponentVisibility(preview);
    previewGroundSnow.setVisible(visible.snowSurface);
    previewGroundSnow.setSnowCover(view.snowCover);
    appliedPreviewState = JSON.stringify(preview);
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      void applyProfile();
    }
    if (state.previewHour !== appliedPreviewHour) applyWorldState();
    else {
      setGroundShaderSceneState(material, {
        wetness: state.view.wetness,
      });
      previewGroundSnow.setSnowCover(state.view.snowCover);
      document.body.dataset.previewGroundSnowCover = String(state.view.snowCover);
      document.body.dataset.previewGroundWetness = String(state.view.wetness);
    }
    if (JSON.stringify(state.preview) !== appliedPreviewState) applyPreviewState();
    if (state.view.viewMode !== appliedViewMode) {
      appliedViewMode = state.view.viewMode;
      frameMode();
    }
  });

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (store.getState().previewAutoCycle) {
      autoCycleAccumulator += delta;
      if (autoCycleAccumulator >= 0.1) {
        const elapsed = autoCycleAccumulator;
        autoCycleAccumulator = 0;
        store.actions.setPreviewHour(store.getState().previewHour + elapsed * 0.5);
      }
    } else {
      autoCycleAccumulator = 0;
    }
    controls.update();
    renderer.render(scene, camera);
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
      disposed = true;
      profileRequest += 1;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      previewGroundSnow.dispose();
      groundRoot.material = sourceGroundMaterial;
      disposeGroundShaderMaterial(material);
      referenceScene.dispose();
      renderer.dispose();
    },
    renderer,
    resetCamera() {
      frameMode();
    },
    scene,
    async start() {
      const state = store.getState();
      appliedRevision = state.docRevision;
      appliedPreviewHour = state.previewHour;
      appliedPreviewState = JSON.stringify(state.preview);
      appliedViewMode = state.view.viewMode;
      applyPreviewState();
      const writes = material.userData.toonlabGroundShader.fieldCount;
      store.actions.adoptEngineState({
        coverage: { applied: 1, matched: 1, skipped: 0, visited: 1, writes },
      });
      document.body.dataset.groundShaderMatched = '1';
      document.body.dataset.groundShaderWrites = String(writes);
      document.body.dataset.groundShaderLoading = 'false';
      applyWorldState();
      frameMode();
      document.body.dataset.modelReady = 'true';
      document.body.dataset.referenceScene = 'accepted-p18-outdoor-spire';
      document.body.dataset.referenceStyle = 'call-me-sensei-p18';
      animate();
    },
  };
}
