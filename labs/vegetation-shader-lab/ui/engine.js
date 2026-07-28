// Tree, Grass, and Flower Shader Labs share the exact accepted P18 outdoor
// comparison scene. The authored profile is applied only to its retained P18
// target; every surrounding shader, visibility choice, camera, time, wind,
// and current weather value remains preview state.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  applyP18VegetationShader,
  applyVegetationShaderScope,
  applyRetainedGrassShaderV2,
  createPlantFromRecipe,
  disposeRetainedGrassShaderV2Materials,
  disposeP18VegetationShaderMaterials,
  getVegetationShaderScopeFieldSchema,
  resolveRetainedGrassShaderV2Modules,
  restoreRetainedGrassShaderV2,
  restoreP18VegetationShader,
  RETAINED_GRASS_SHADER_V2_FALLBACK_ID,
  RETAINED_GRASS_SHADER_V2_ID,
  syncRetainedGrassShaderV2Runtime,
  VEGETATION_SHADER_SCOPES,
} from '../../../src/vegetation/index.js';
import {
  createP18ReferenceRenderer,
  createP18ShaderPreviewScene,
} from '../../shared/p18/referenceScene.js';
import {
  createP18PreviewGroundSnowLayer,
} from '../../shared/p18/previewWeatherLayers.js';
import { whenRendererReady } from '../../shared/rendererFactory.js';

export const VEGETATION_PREVIEW_MODES = Object.freeze([
  Object.freeze({ id: 'composition', label: 'Composition' }),
  Object.freeze({ id: 'isolate', label: 'Isolate' }),
  Object.freeze({ id: 'top', label: 'Top' }),
]);

const SCOPE_COMPONENT = Object.freeze({
  flower: 'flowers',
  grass: 'grass',
  tree: 'tree',
  vegetation: Object.freeze(['tree', 'grass', 'flowers']),
});

const SCOPE_TARGET = Object.freeze({
  flower: 'flowers',
  grass: 'grass',
  tree: 'tree',
});

const SCOPE_SCENE_VARIANT = Object.freeze({
  flower: 'retained-instanced-daisies',
  grass: 'landscape-auto-grass',
  tree: null,
});

function collectGeneratedMaterials(root) {
  const materials = new Set();
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const entries = Array.isArray(object.material)
      ? object.material
      : [object.material];
    entries.forEach((material) => {
      if (
        material?.userData?.toonlabP18VegetationShader
        || material?.userData?.toonlabRetainedGrassShaderV2
      ) {
        materials.add(material);
      }
    });
  });
  return materials;
}

function disposeRetiredMaterials(materials, roots) {
  const active = new Set();
  for (const root of roots) {
    root?.traverse?.((object) => {
      if (!object.isMesh || !object.material) return;
      const entries = Array.isArray(object.material)
        ? object.material
        : [object.material];
      entries.forEach((material) => active.add(material));
    });
  }
  materials.forEach((material) => {
    if (!active.has(material)) material.dispose?.();
  });
}

function invalidPositionMeshes(root) {
  const invalid = [];
  root?.traverse?.((object) => {
    if (!object.isMesh) return;
    const values = object.geometry?.getAttribute?.('position')?.array;
    if (!values) return;
    for (let index = 0; index < values.length; index += 1) {
      if (Number.isFinite(values[index])) continue;
      invalid.push(object.name || object.type || `mesh-${object.id}`);
      break;
    }
  });
  return invalid;
}

function syncGeneratedWeather(root, { snowCover = 0, wetness = 0 } = {}) {
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      if (!material?.userData?.toonlabP18VegetationShader) return;
      if (material.uniforms?.uSnowCover) {
        material.uniforms.uSnowCover.value = snowCover;
      }
      if (material.uniforms?.uWetness) {
        material.uniforms.uWetness.value = wetness;
      }
    });
  });
}

function retainedFallbackReport(modules) {
  return {
    adapter: RETAINED_GRASS_SHADER_V2_FALLBACK_ID,
    applied: 0,
    errors: [],
    fallback: 1,
    fallbackAdapter: RETAINED_GRASS_SHADER_V2_FALLBACK_ID,
    matched: 0,
    modules,
    skipped: 1,
    unsupported: Object.values(
      getVegetationShaderScopeFieldSchema('grass'),
    ).flatMap((group) => Object.values(group).map((field) => ({
      field: field.id,
      reason: 'The retained P18 fallback is intentionally immutable.',
    }))),
    visited: 1,
    writes: 0,
  };
}

function targetRoots(environmentContent, scope) {
  if (scope === 'vegetation') {
    return [
      ['tree', environmentContent.tree],
      ['grass', environmentContent.grass],
      ['flower', environmentContent.flowers],
    ];
  }
  return [[scope, environmentContent[SCOPE_TARGET[scope]]]];
}

export async function createVegetationMaterialLabEngine({ mount, store }) {
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

  const scope = store.getState().scope;
  const urlParams = new URLSearchParams(window.location.search);
  const requestedGrassAdapter = urlParams.get('grassAdapter');
  const grassAdapter = scope === 'grass'
    && requestedGrassAdapter === RETAINED_GRASS_SHADER_V2_FALLBACK_ID
    ? RETAINED_GRASS_SHADER_V2_FALLBACK_ID
    : RETAINED_GRASS_SHADER_V2_ID;
  const grassModules = resolveRetainedGrassShaderV2Modules(
    urlParams.get('grassModules'),
  );
  document.body.dataset.grassShaderAdapter = grassAdapter;
  document.body.dataset.grassShaderFallback =
    RETAINED_GRASS_SHADER_V2_FALLBACK_ID;
  document.body.dataset.grassShaderModules = grassModules.join(',');
  const referenceScene = await createP18ShaderPreviewScene({
    authoredComponent: SCOPE_COMPONENT[scope],
    camera,
    renderer,
    scene,
  });
  const referenceTargets = targetRoots(referenceScene.environmentContent, scope);
  if (referenceTargets.some(([, root]) => !root)) {
    throw new Error(`The accepted P18 comparison scene has no ${scope} shader target.`);
  }
  const sourceActorIdentity = referenceScene.environmentContent.group
    .userData.sourceEnvironmentTestContent
    ?.treeContract?.source?.visualTargetActor ?? null;
  const referenceTargetBounds = new THREE.Box3();
  referenceTargets.forEach(([, root]) => referenceTargetBounds.expandByObject(root, true));
  const referenceTargetCenter = referenceTargetBounds.getCenter(new THREE.Vector3());
  const referenceTargetSize = referenceTargetBounds.getSize(new THREE.Vector3());
  const interactionPositionLocal = referenceTargetCenter.toArray();
  const interactionRadius = Math.max(
    Math.min(Math.max(referenceTargetSize.x, referenceTargetSize.z) * 0.025, 4),
    1.5,
  );
  const previewGroundSnow = scope === 'grass'
    && grassAdapter === RETAINED_GRASS_SHADER_V2_ID
    ? createP18PreviewGroundSnowLayer(
      referenceScene.environmentContent.groundRoot,
    )
    : null;
  const modularGrassOwnsSnow = scope === 'grass'
    && grassAdapter === RETAINED_GRASS_SHADER_V2_ID;
  // Isolate framing must remain stable even when the retained comparison
  // camera has been authored from an overhead position. Keep a readable
  // three-quarter inspection angle for every interchangeable asset.
  const isolateDirection = new THREE.Vector3(0.82, 0.34, 1).normalize();

  let appliedPreviewHour = null;
  let appliedPreviewAssetId = null;
  let appliedPreviewState = null;
  let appliedRevision = -1;
  let appliedViewMode = null;
  let autoCycleAccumulator = 0;
  let disposed = false;
  let profileQueued = false;
  let profileRunning = false;
  let proceduralPreviewRoot = null;
  const timer = new THREE.Timer();
  timer.connect(document);

  function activeTargets() {
    if ((scope === 'tree' || scope === 'flower') && proceduralPreviewRoot) {
      return [[scope, proceduralPreviewRoot]];
    }
    return referenceTargets;
  }

  function activeTargetMetrics() {
    const bounds = new THREE.Box3();
    activeTargets().forEach(([, root]) => bounds.expandByObject(root, true));
    return {
      bounds,
      center: bounds.getCenter(new THREE.Vector3()),
      size: bounds.getSize(new THREE.Vector3()),
    };
  }

  function disposeProceduralPreview() {
    if (!proceduralPreviewRoot) return;
    scene.remove(proceduralPreviewRoot);
    proceduralPreviewRoot.dispose?.();
    proceduralPreviewRoot = null;
  }

  function alignProceduralPreview(root) {
    root.updateMatrixWorld(true);
    const invalidMeshes = invalidPositionMeshes(root);
    document.body.dataset.previewInvalidGeometry =
      invalidMeshes.join(',');
    const bounds = new THREE.Box3().setFromObject(root, true);
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.x += referenceTargetCenter.x - center.x;
    root.position.y += referenceTargetBounds.min.y - bounds.min.y;
    root.position.z += referenceTargetCenter.z - center.z;
    root.updateMatrixWorld(true);
    document.body.dataset.previewProceduralBoundsFinite = String(
      [
        bounds.min.x, bounds.min.y, bounds.min.z,
        bounds.max.x, bounds.max.y, bounds.max.z,
      ].every(Number.isFinite),
    );
  }

  function syncPreviewAsset() {
    if (scope !== 'tree' && scope !== 'flower') return false;
    const previewAsset = store.getState().view.previewAsset;
    const nextId = previewAsset?.id
      ?? (scope === 'tree' ? 'p18-retained-pine' : 'p18-retained-daisies');
    if (nextId === appliedPreviewAssetId) return false;
    appliedPreviewAssetId = nextId;
    disposeProceduralPreview();
    if (previewAsset?.kind === 'procedural' && previewAsset.recipe) {
      const retainedRoot = referenceScene.environmentContent[SCOPE_TARGET[scope]];
      const generated = collectGeneratedMaterials(retainedRoot);
      restoreP18VegetationShader(retainedRoot);
      generated.forEach((material) => material.dispose?.());
      proceduralPreviewRoot = createPlantFromRecipe(previewAsset.recipe);
      proceduralPreviewRoot.name =
        `${VEGETATION_SHADER_SCOPES[scope]?.label ?? scope} Preview · ${previewAsset.label}`;
      proceduralPreviewRoot.userData.toonlabShaderPreviewAsset = {
        id: previewAsset.id,
        kind: previewAsset.kind,
        source: previewAsset.source,
      };
      scene.add(proceduralPreviewRoot);
      alignProceduralPreview(proceduralPreviewRoot);
    }
    // The retained P18 fixture keeps its accepted ±10 m shadow box exactly.
    // Larger generated trees can project their canopy beyond that box, so
    // expand only the procedural preview's transient shadow coverage.
    const shadowExtent = proceduralPreviewRoot
      ? THREE.MathUtils.clamp(
        Math.max(activeTargetMetrics().size.length() * 1.4, 10),
        10,
        28,
      )
      : 10;
    referenceScene.setShadowExtent(shadowExtent);
    document.body.dataset.previewShadowExtent = shadowExtent.toFixed(2);
    document.body.dataset.previewAsset = nextId;
    document.body.dataset.previewAssetKind =
      proceduralPreviewRoot ? 'procedural' : 'reference';
    return true;
  }

  function frameMode(mode = store.getState().view.viewMode) {
    const { center: targetCenter, size: targetSize } = activeTargetMetrics();
    const targetRadius = Math.max(targetSize.length() * 0.5, 0.5);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(
      Math.tan(verticalFov * 0.5) * Math.max(camera.aspect, 0.1),
    );
    const fitDistance = (
      targetRadius
      / Math.max(
        Math.min(
          Math.tan(verticalFov * 0.5),
          Math.tan(horizontalFov * 0.5),
        ),
        0.01,
      )
    ) * 1.18;
    camera.up.set(0, 1, 0);
    if (mode === 'composition') {
      controls.target.copy(referenceScene.resetCamera());
      controls.update();
      return;
    }
    controls.target.copy(targetCenter);
    if (mode === 'top') {
      camera.position.copy(targetCenter).add(new THREE.Vector3(
        0.01,
        fitDistance,
        0.01,
      ));
      camera.up.set(0, 0, -1);
    } else {
      const minimumDistance = scope === 'flower' ? 2.7 : scope === 'tree' ? 7 : 10;
      const distance = Math.max(
        fitDistance,
        minimumDistance,
      );
      camera.position.copy(targetCenter)
        .addScaledVector(isolateDirection, distance);
    }
    camera.lookAt(controls.target);
    controls.update();
  }

  function applyPreviewState() {
    const { preview, view } = store.getState();
    const styles = referenceScene.applyComponentStyles(preview);
    previewGroundSnow?.setStyle(styles.snowSurface);
    previewGroundSnow?.apply();
    const visible = referenceScene.applyComponentVisibility(preview);
    previewGroundSnow?.setVisible(visible.snowSurface);
    if ((scope === 'tree' || scope === 'flower') && proceduralPreviewRoot) {
      const componentId = SCOPE_COMPONENT[scope];
      referenceScene.environmentContent[SCOPE_TARGET[scope]].visible = false;
      proceduralPreviewRoot.visible = visible[componentId];
    }
    if (view.viewMode === 'isolate') {
      const authored = new Set(
        Array.isArray(SCOPE_COMPONENT[scope])
          ? SCOPE_COMPONENT[scope]
          : [SCOPE_COMPONENT[scope]],
      );
      if (!authored.has('rock')) referenceScene.rockRoot.visible = false;
      if (!authored.has('grass')) {
        referenceScene.environmentContent.grass.visible = false;
      }
      if (!authored.has('tree')) {
        referenceScene.environmentContent.tree.visible = false;
      }
      if (!authored.has('flowers')) {
        referenceScene.environmentContent.flowers.visible = false;
      }
      if (!authored.has('manufacturedProps')) {
        referenceScene.environmentContent.stylizedBasic.visible = false;
      }
    }
    if ((scope === 'tree' || scope === 'flower') && proceduralPreviewRoot) {
      const componentId = SCOPE_COMPONENT[scope];
      referenceScene.environmentContent[SCOPE_TARGET[scope]].visible = false;
      proceduralPreviewRoot.visible = visible[componentId] !== false;
    }
    appliedPreviewState = JSON.stringify(preview);
  }

  function syncAuthoredRuntimeState() {
    if (scope !== 'grass') return;
    const { view } = store.getState();
    syncRetainedGrassShaderV2Runtime(
      referenceScene.environmentContent.grass,
      {
        interactionAmount: view.interactionAmount,
        interactionPositionLocal,
        interactionRadius,
        snowCover: view.snowCover,
        wetness: view.wetness,
      },
    );
    document.body.dataset.previewGrassInteraction =
      String(view.interactionAmount);
  }

  function syncProceduralPlantRuntime(timeState = null) {
    if (!proceduralPreviewRoot) return;
    const { view } = store.getState();
    const resolvedTime = timeState
      ?? referenceScene.applyTime(store.getState().previewHour);
    const sunColor = resolvedTime.directColor.clone()
      .convertLinearToSRGB()
      .toArray();
    const skyColor = resolvedTime.skyColor.clone()
      .convertLinearToSRGB()
      .toArray();
    proceduralPreviewRoot.setSun?.({
      color: sunColor,
      direction: resolvedTime.sunDirection.toArray(),
      intensity: resolvedTime.timeState.directEnergy,
      sky: skyColor,
      skyIntensity: resolvedTime.timeState.ambientEnergy,
    });
    proceduralPreviewRoot.setWind?.({
      speed: 1,
      strength: 0.05 * view.windStrength,
    });
    proceduralPreviewRoot.setCloudShadow?.({
      coverage: 0.58,
      scale: 0.035,
      strength: 0.62,
      velocity: [0.007, -0.004],
    });
    proceduralPreviewRoot.setSurfaceWeather?.({
      snowCover: view.snowCover,
      wetness: view.wetness,
    });
  }

  function applyWorldState() {
    const state = store.getState();
    const timeState = referenceScene.applyTime(state.previewHour);
    previewGroundSnow?.setSnowCover(state.view.snowCover);
    const uniforms = referenceScene.environmentContent.vegetationState?.uniforms;
    if (uniforms?.rainWetness) uniforms.rainWetness.value = state.view.wetness;
    if (uniforms?.snowCover) {
      uniforms.snowCover.value = modularGrassOwnsSnow
        ? 0
        : state.view.snowCover;
    }
    document.body.dataset.previewSnowCover = String(state.view.snowCover);
    document.body.dataset.previewSnowUniform = String(uniforms?.snowCover?.value);
    document.body.dataset.previewAuthoredSnowAmount =
      String(state.view.snowCover);
    document.body.dataset.previewWetness = String(state.view.wetness);
    activeTargets().forEach(([, root]) => syncGeneratedWeather(root, {
      snowCover: state.view.snowCover,
      wetness: state.view.wetness,
    }));
    if (uniforms?.windIntensity) {
      uniforms.windIntensity.value = state.view.windStrength;
    }
    syncAuthoredRuntimeState();
    syncProceduralPlantRuntime(timeState);
    appliedPreviewHour = state.previewHour;
  }

  async function applyProfileOnce() {
    syncPreviewAsset();
    const settings = store.getState().settings;
    const targets = activeTargets();
    const retired = new Set();
    targets.forEach(([, root]) => {
      collectGeneratedMaterials(root).forEach((material) => retired.add(material));
    });
    const reports = await Promise.all(targets.map(([targetScope, root]) => {
      if (root === proceduralPreviewRoot) {
        const report = applyVegetationShaderScope(
          root,
          targetScope,
          settings,
        );
        return {
          ...report,
          adapter: 'canonical-vegetation-procedural',
          errors: [],
          fallback: 0,
        };
      }
      if (targetScope === 'grass' && scope === 'grass') {
        restoreP18VegetationShader(root);
        if (grassAdapter === RETAINED_GRASS_SHADER_V2_FALLBACK_ID) {
          restoreRetainedGrassShaderV2(root);
          return retainedFallbackReport(grassModules);
        }
        return applyRetainedGrassShaderV2(root, settings, {
          interactionAmount: store.getState().view.interactionAmount,
          interactionPositionLocal,
          interactionRadius,
          library: referenceScene.environmentContent.library,
          modules: grassModules,
          sourceSceneVariant: SCOPE_SCENE_VARIANT[targetScope],
          state: referenceScene.environmentContent.vegetationState,
        });
      }
      restoreRetainedGrassShaderV2(root);
      return applyP18VegetationShader(root, targetScope, settings, {
        library: referenceScene.environmentContent.library,
        sourceActorIdentity: targetScope === 'tree' ? sourceActorIdentity : null,
        sourceSceneVariant: SCOPE_SCENE_VARIANT[targetScope],
        state: referenceScene.environmentContent.vegetationState,
      });
    }));
    if (disposed) return;
    disposeRetiredMaterials(retired, targets.map(([, root]) => root));
    syncAuthoredRuntimeState();
    const coverage = reports.reduce((total, report) => ({
      applied: total.applied + report.applied,
      fallback: total.fallback + Number(report.fallback ?? 0),
      matched: total.matched + report.matched,
      unsupported: total.unsupported + report.unsupported.length,
      writes: total.writes + report.writes,
    }), {
      applied: 0,
      fallback: 0,
      matched: 0,
      unsupported: 0,
      writes: 0,
    });
    const errors = reports.flatMap((report) => report.errors ?? []);
    store.actions.adoptEngineState({
      coverage,
      runtimeAdapter: reports[0]?.adapter
        ?? (scope === 'grass' ? grassAdapter : 'p18-vegetation'),
      runtimeErrors: errors,
      ...(errors.length > 0 ? {
        status: `Grass V2 fell back to retained P18: ${errors[0]}`,
      } : {}),
    });
    document.body.dataset.referenceScene = 'accepted-p18-outdoor-spire';
    document.body.dataset.referenceCheckpoint = 'stylized-basic';
    document.body.dataset.shaderAdapter = reports[0]?.adapter
      ?? (scope === 'grass' ? grassAdapter : 'p18-vegetation');
    document.body.dataset.shaderFallbackCount = String(coverage.fallback);
    document.body.dataset.shaderMatched = String(coverage.matched);
    document.body.dataset.shaderScope = scope;
    document.body.dataset.shaderUnsupported = String(coverage.unsupported);
    document.body.dataset.shaderWrites = String(coverage.writes);
    document.body.dataset.shaderRuntimeErrors = String(errors.length);
    syncProceduralPlantRuntime();
  }

  async function applyProfile() {
    if (profileRunning) {
      profileQueued = true;
      return;
    }
    profileRunning = true;
    document.body.dataset.vegetationShaderLoading = 'true';
    try {
      do {
        profileQueued = false;
        await applyProfileOnce();
      } while (profileQueued && !disposed);
    } finally {
      profileRunning = false;
      document.body.dataset.vegetationShaderLoading = 'false';
    }
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    let profileNeedsApply = false;
    if (
      (scope === 'tree' || scope === 'flower')
      && state.view.previewAsset?.id !== appliedPreviewAssetId
    ) {
      syncPreviewAsset();
      profileNeedsApply = true;
      frameMode();
      applyPreviewState();
    }
    if (state.docRevision !== appliedRevision) {
      appliedRevision = state.docRevision;
      profileNeedsApply = true;
    }
    if (profileNeedsApply) void applyProfile();
    if (state.previewHour !== appliedPreviewHour) applyWorldState();
    else {
      const uniforms = referenceScene.environmentContent.vegetationState?.uniforms;
      if (uniforms?.rainWetness) uniforms.rainWetness.value = state.view.wetness;
      if (uniforms?.snowCover) {
        uniforms.snowCover.value = modularGrassOwnsSnow
          ? 0
          : state.view.snowCover;
      }
      previewGroundSnow?.setSnowCover(state.view.snowCover);
      document.body.dataset.previewSnowCover = String(state.view.snowCover);
      document.body.dataset.previewSnowUniform = String(uniforms?.snowCover?.value);
      document.body.dataset.previewAuthoredSnowAmount =
        String(state.view.snowCover);
      document.body.dataset.previewWetness = String(state.view.wetness);
      activeTargets().forEach(([, root]) => syncGeneratedWeather(root, {
        snowCover: state.view.snowCover,
        wetness: state.view.wetness,
      }));
      if (uniforms?.windIntensity) {
        uniforms.windIntensity.value = state.view.windStrength;
      }
      syncAuthoredRuntimeState();
      syncProceduralPlantRuntime();
    }
    if (JSON.stringify(state.preview) !== appliedPreviewState) applyPreviewState();
    if (state.view.viewMode !== appliedViewMode) {
      appliedViewMode = state.view.viewMode;
      frameMode();
      applyPreviewState();
    }
  });

  function animate(timestamp) {
    if (disposed) return;
    requestAnimationFrame(animate);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.05);
    if (store.getState().previewAutoCycle) {
      autoCycleAccumulator += delta;
      if (autoCycleAccumulator >= 0.1) {
        const elapsed = autoCycleAccumulator;
        autoCycleAccumulator = 0;
        store.actions.setPreviewHour(
          store.getState().previewHour + elapsed * 0.5,
        );
      }
    } else {
      autoCycleAccumulator = 0;
    }
    referenceScene.update(delta);
    proceduralPreviewRoot?.update?.(delta);
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
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      disposeProceduralPreview();
      referenceTargets.forEach(([, root]) => {
        const generated = collectGeneratedMaterials(root);
        restoreRetainedGrassShaderV2(root);
        restoreP18VegetationShader(root);
        generated.forEach((material) => material.dispose?.());
        disposeRetainedGrassShaderV2Materials(root);
        disposeP18VegetationShaderMaterials(root);
      });
      previewGroundSnow?.dispose();
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
      syncPreviewAsset();
      applyPreviewState();
      applyWorldState();
      await applyProfile();
      frameMode();
      document.body.dataset.modelReady = 'true';
      requestAnimationFrame(animate);
    },
  };
}
