import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import { meshDocument } from '../../../src/rockgen/index.js';
import {
  createLabRenderer,
  whenRendererReady,
} from '../../shared/rendererFactory.js';
import { getRockVariationCatalogEntry } from './catalog.js';
import {
  createCatalogSourceLoader,
  createCatalogVariation,
  exportCatalogVariation,
  loadCatalogSource,
  sculptCatalogGeometry,
} from './catalogSourceMesh.js';
import { applyRockPbrTexture } from './rockPbrTextures.js';
import { createRockMeadowGrassPreview } from './rockGrassPreview.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function triangleCount(geometry) {
  return Math.round((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3);
}

function formatBounds(box) {
  const size = box.getSize(new THREE.Vector3());
  return `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
}

export async function createRockGenerationEngine({ mount, store }) {
  const renderer = createLabRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);
  const catalogLoader = createCatalogSourceLoader(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b8cce0');
  scene.fog = new THREE.Fog('#b8cce0', 28, 82);
  const groundFieldPass = createEnvironmentGroundFieldPass({ renderer, scene, resolution: 512 });
  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.05,
    200,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 1.2;
  controls.maxDistance = 80;

  let navigationMode = 'rotate';
  const sculptOptions = {
    enabled: false,
    radius: 0.5,
    strength: 0.35,
    tool: 'grab',
  };

  function setNavigationMode(mode = 'rotate') {
    navigationMode = mode;
    controls.mouseButtons.LEFT = sculptOptions.enabled
      ? null
      : mode === 'pan'
        ? THREE.MOUSE.PAN
        : mode === 'zoom' ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  }
  setNavigationMode();

  const world = new THREE.Group();
  world.name = 'ToonLab procedural rock generation stage';
  scene.add(world);

  const sculptCursor = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 64),
    new THREE.MeshBasicMaterial({
      color: '#ffb74d',
      depthTest: false,
      opacity: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  sculptCursor.name = 'ToonLab sculpt brush cursor';
  sculptCursor.renderOrder = 1000;
  sculptCursor.visible = false;
  scene.add(sculptCursor);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(32, 64),
    new THREE.MeshStandardMaterial({ color: '#7f9278', roughness: 1 }),
  );
  floor.name = 'ToonLab generation floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(64, 64, '#718091', '#96a6b1');
  grid.position.y = -0.012;
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  scene.add(grid);

  const sun = new THREE.DirectionalLight('#fff0d2', 3.2);
  sun.position.set(10, 16, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 60;
  const hemisphere = new THREE.HemisphereLight('#dceaff', '#566b59', 1.25);
  const fill = new THREE.AmbientLight('#9db7d2', 0.32);
  scene.add(sun, hemisphere, fill);

  let model = null;
  let modelDisposer = null;
  let previewGrass = null;
  let previewGrassToken = 0;
  let catalogSource = null;
  let catalogVariation = null;
  let remeshTimer = null;
  let disposed = false;
  let buildToken = 0;
  let requestedRevision = -1;
  let requestedViewRevision = -1;
  const deferredDisposals = new Set();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const cameraFacingPlane = new THREE.Plane();
  let sculptGesture = null;

  function eventRay(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      -(((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1),
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray;
  }

  function catalogHit(event) {
    if (!catalogVariation?.previewMeshes?.length) return null;
    eventRay(event);
    return raycaster.intersectObjects(catalogVariation.previewMeshes, false)[0] ?? null;
  }

  function localHitData(hit) {
    const mesh = hit.object;
    const point = mesh.worldToLocal(hit.point.clone());
    const normal = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    return { mesh, normal, point };
  }

  function updateSculptCursor(hit) {
    if (!sculptOptions.enabled || !hit) {
      sculptCursor.visible = false;
      return;
    }
    const localNormal = (hit.face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();
    const worldNormal = localNormal.transformDirection(hit.object.matrixWorld).normalize();
    const worldScale = hit.object.getWorldScale(new THREE.Vector3());
    const radius = sculptOptions.radius * ((worldScale.x + worldScale.y + worldScale.z) / 3);
    sculptCursor.position.copy(hit.point).addScaledVector(worldNormal, Math.max(radius * 0.006, 0.001));
    sculptCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
    sculptCursor.scale.setScalar(radius);
    sculptCursor.visible = true;
  }

  function geometrySnapshot(geometry) {
    const position = geometry.getAttribute('position');
    const values = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      values[index * 3] = position.getX(index);
      values[(index * 3) + 1] = position.getY(index);
      values[(index * 3) + 2] = position.getZ(index);
    }
    return values;
  }

  function refreshLiveSculptGeometry(geometry) {
    geometry.getAttribute('position').needsUpdate = true;
    geometry.computeVertexNormals();
    if (geometry.getAttribute('tangent') && geometry.index && geometry.getAttribute('uv')) {
      try {
        geometry.computeTangents();
      } catch {
        // Preserve the existing tangent vertex slot for the active material.
      }
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  function applySculptStamp(hit) {
    if (!sculptGesture || hit.object !== sculptGesture.mesh) return 0;
    const { normal, point } = localHitData(hit);
    const touched = sculptCatalogGeometry(sculptGesture.geometry, {
      normal: normal.toArray(),
      point: point.toArray(),
      radius: sculptOptions.radius,
      strength: sculptOptions.strength,
      tool: sculptOptions.tool,
    });
    sculptGesture.lastPoint = point;
    return touched;
  }

  function beginSculpt(event) {
    if (!sculptOptions.enabled || event.button !== 0 || !catalogVariation) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const hit = catalogHit(event);
    updateSculptCursor(hit);
    if (!hit) return;
    const { mesh, normal, point } = localHitData(hit);
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const before = geometrySnapshot(geometry);
    sculptGesture = {
      before,
      geometry,
      lastPoint: point,
      mesh,
      meshIndex: catalogVariation.meshes.indexOf(mesh),
      normal,
      point,
      pointerId: event.pointerId,
    };
    renderer.domElement.setPointerCapture?.(event.pointerId);
    if (sculptOptions.tool === 'grab') {
      const cameraNormal = camera.getWorldDirection(new THREE.Vector3());
      cameraFacingPlane.setFromNormalAndCoplanarPoint(cameraNormal, hit.point);
      sculptGesture.dragStartWorld = hit.point.clone();
      sculptGesture.weights = new Float32Array(position.count);
      const vertex = new THREE.Vector3();
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromArray(before, index * 3);
        const distance = vertex.distanceTo(point);
        if (distance > sculptOptions.radius) continue;
        const linear = 1 - (distance / sculptOptions.radius);
        sculptGesture.weights[index] = linear * linear * (3 - (2 * linear));
      }
    } else {
      applySculptStamp(hit);
    }
    store.actions.adoptEngineState({ status: `Sculpting with ${sculptOptions.tool}…` });
  }

  function moveSculpt(event) {
    if (!sculptOptions.enabled) return;
    if (!sculptGesture) {
      updateSculptCursor(catalogHit(event));
      return;
    }
    if (event.pointerId !== sculptGesture.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sculptOptions.tool === 'grab') {
      const intersection = eventRay(event).intersectPlane(cameraFacingPlane, new THREE.Vector3());
      if (!intersection) return;
      const mesh = sculptGesture.mesh;
      const localStart = mesh.worldToLocal(sculptGesture.dragStartWorld.clone());
      const localEnd = mesh.worldToLocal(intersection.clone());
      const delta = localEnd.sub(localStart).multiplyScalar(sculptOptions.strength);
      const position = sculptGesture.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index += 1) {
        const weight = sculptGesture.weights[index];
        position.setXYZ(
          index,
          sculptGesture.before[index * 3] + (delta.x * weight),
          sculptGesture.before[(index * 3) + 1] + (delta.y * weight),
          sculptGesture.before[(index * 3) + 2] + (delta.z * weight),
        );
      }
      refreshLiveSculptGeometry(sculptGesture.geometry);
      return;
    }
    const hit = catalogHit(event);
    updateSculptCursor(hit);
    if (!hit || hit.object !== sculptGesture.mesh) return;
    const point = hit.object.worldToLocal(hit.point.clone());
    if (point.distanceTo(sculptGesture.lastPoint) < sculptOptions.radius * 0.12) return;
    applySculptStamp(hit);
  }

  function finishSculpt(event) {
    if (!sculptGesture || event.pointerId !== sculptGesture.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const gesture = sculptGesture;
    sculptGesture = null;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    const position = gesture.geometry.getAttribute('position');
    const deltas = [];
    for (let index = 0; index < position.count; index += 1) {
      const dx = position.getX(index) - gesture.before[index * 3];
      const dy = position.getY(index) - gesture.before[(index * 3) + 1];
      const dz = position.getZ(index) - gesture.before[(index * 3) + 2];
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-7) continue;
      deltas.push([
        index,
        Math.round(dx * 1e6) / 1e6,
        Math.round(dy * 1e6) / 1e6,
        Math.round(dz * 1e6) / 1e6,
      ]);
    }
    if (deltas.length > 0) {
      store.actions.commitCatalogMeshEdit({ deltas, meshIndex: gesture.meshIndex });
    } else {
      store.actions.adoptEngineState({ status: 'No vertices were inside the sculpt brush.' });
    }
  }

  renderer.domElement.addEventListener('pointerdown', beginSculpt, { capture: true });
  renderer.domElement.addEventListener('pointermove', moveSculpt, { capture: true });
  renderer.domElement.addEventListener('pointerup', finishSculpt, { capture: true });
  renderer.domElement.addEventListener('pointercancel', finishSculpt, { capture: true });

  function retireModel(disposer) {
    if (!disposer) return;
    const record = { disposer, timer: null };
    record.timer = window.setTimeout(() => {
      deferredDisposals.delete(record);
      disposer();
    }, 250);
    deferredDisposals.add(record);
  }

  function disposePreviewGrass({ immediate = false } = {}) {
    previewGrassToken += 1;
    if (!previewGrass) return;
    const retiringGrass = previewGrass;
    world.remove(retiringGrass);
    if (immediate) retiringGrass.dispose?.();
    else retireModel(() => retiringGrass.dispose?.());
    previewGrass = null;
  }

  async function rebuildPreviewGrass(options = store.getState().grassPreview) {
    disposePreviewGrass();
    const token = ++previewGrassToken;
    model?.traverse((object) => {
      if (object.isMesh) object.userData.groundFieldWrite = Boolean(options?.enabled);
    });
    groundFieldPass.invalidate();
    groundFieldPass.update();
    if (!options?.enabled || !model || !catalogVariation) {
      store.actions.adoptEngineState({ grassPreviewStats: { blades: 0, clumps: 0 } });
      return { blades: 0, clumps: 0 };
    }

    const state = store.getState();
    const field = await createRockMeadowGrassPreview(
      model,
      options,
      (state.document.seed ^ (state.document.reference?.variationSeed ?? 0x9e3779b9)) >>> 0,
    );
    if (disposed || token !== previewGrassToken || model !== catalogVariation?.root) {
      field?.dispose?.();
      return { blades: 0, clumps: 0 };
    }
    previewGrass = field;
    if (previewGrass) {
      world.add(previewGrass);
      previewGrass.updateLods?.(camera);
    }
    const stats = {
      blades: previewGrass?.bladeCount ?? 0,
      clumps: previewGrass?.instanceCount ?? 0,
    };
    store.actions.adoptEngineState({ grassPreviewStats: stats });
    return stats;
  }

  function disposeModel({ immediate = false } = {}) {
    if (!model) return;
    disposePreviewGrass({ immediate });
    world.remove(model);
    if (immediate) modelDisposer?.();
    else retireModel(modelDisposer);
    model = null;
    modelDisposer = null;
    catalogVariation = null;
  }

  function resetCamera() {
    if (!model) {
      controls.target.set(0, 1, 0);
      camera.position.set(6, 4.5, 7.5);
      controls.update();
      return;
    }
    const bounds = new THREE.Box3().setFromObject(model, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.55, 1.5);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(
      radius * 1.28,
      radius * 0.82,
      radius * 1.5,
    ));
    camera.near = Math.max(radius / 100, 0.02);
    camera.far = Math.max(radius * 30, 100);
    camera.updateProjectionMatrix();
    controls.update();
  }

  async function buildCatalogModel(entry, state, started, token, reframe) {
    let source = catalogSource;
    if (source?.entry.id !== entry.id) {
      const loaded = await loadCatalogSource(entry, catalogLoader.loader);
      if (disposed || token !== buildToken) {
        loaded.dispose();
        return;
      }
      disposeModel();
      catalogSource?.dispose();
      catalogSource = loaded;
      source = loaded;
    }
    if (disposed || token !== buildToken) return;

    const nextVariation = createCatalogVariation(source, {
      meshEdits: state.document.reference?.meshEdits ?? [],
      preserveSourceMaterial: state.document.style === 'call_me_sensei',
      seed: state.document.reference?.variationSeed ?? state.document.seed,
      strength: state.document.reference?.variation ?? 0.3,
      surface: state.document.surface,
      surfaceMode: state.document.reference?.surfaceMode ?? 'source',
    });
    const disposePbrTexture = await applyRockPbrTexture(nextVariation.root, state.document.surface);
    if (disposed || token !== buildToken) {
      disposePbrTexture?.();
      nextVariation.dispose();
      return;
    }
    const sourceBounds = new THREE.Box3().setFromObject(nextVariation.root, true);
    const center = sourceBounds.getCenter(new THREE.Vector3());
    nextVariation.root.position.set(-center.x, -sourceBounds.min.y, -center.z);
    nextVariation.root.name = state.document.name;
    nextVariation.root.updateWorldMatrix(true, true);
    const displayBounds = new THREE.Box3().setFromObject(nextVariation.root, true);
    disposeModel();
    catalogVariation = nextVariation;
    model = nextVariation.root;
    modelDisposer = () => {
      disposePbrTexture?.();
      nextVariation.dispose();
    };
    world.add(model);
    const grassStats = await rebuildPreviewGrass(state.grassPreview);

    store.actions.adoptEngineState({
      meshStats: {
        bounds: formatBounds(displayBounds),
        milliseconds: Math.round(performance.now() - started),
        triangles: nextVariation.stats.triangles,
        vertices: nextVariation.stats.vertices,
      },
      status: `Loaded and decoded ${entry.label} Gallery GLB · ${Math.round(nextVariation.profile.strength * 100)}% bounded variation · ${(state.document.reference?.meshEdits?.length ?? 0).toLocaleString()} sculpt edit${state.document.reference?.meshEdits?.length === 1 ? '' : 's'} · ${state.document.surface.pbrTexturePreset !== 'none' ? `${state.document.surface.pbrTexturePreset} PBR texture` : state.document.reference?.surfaceMode === 'generated' ? 'editable surface' : 'source material'}${grassStats.clumps > 0 ? ` · ${grassStats.clumps.toLocaleString()} adaptive meadow clumps` : ''}.`,
    });
    if (reframe) resetCamera();
    document.body.dataset.meshTriangles = String(nextVariation.stats.triangles);
    document.body.dataset.meshResolution = 'source';
    document.body.dataset.previewAssetSource = 'toonlab-official-glb';
    document.body.dataset.modelReady = 'true';
  }

  function buildProceduralModel(state, started, reframe) {
    const geometry = meshDocument(state.document, {
      includeHelpers: false,
      resolution: state.document.meshing.previewResolution,
    });
    const bounds = geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute('position'),
    );
    const material = new THREE.MeshStandardMaterial({
      metalness: 0,
      roughness: 0.92,
      vertexColors: true,
    });
    material.name = 'ToonLab baked procedural rock preview';
    const nextMesh = new THREE.Mesh(geometry, material);
    nextMesh.name = state.document.name;
    nextMesh.position.set(
      -(bounds.min.x + bounds.max.x) * 0.5,
      -bounds.min.y,
      -(bounds.min.z + bounds.max.z) * 0.5,
    );
    nextMesh.castShadow = true;
    nextMesh.receiveShadow = true;
    disposeModel();
    model = nextMesh;
    modelDisposer = () => {
      geometry.dispose();
      material.dispose();
    };
    world.add(model);
    store.actions.adoptEngineState({
      meshStats: {
        bounds: formatBounds(bounds),
        milliseconds: Math.round(performance.now() - started),
        triangles: triangleCount(geometry),
        vertices: geometry.getAttribute('position').count,
      },
      status: `Generated ${state.document.name} at ${state.document.meshing.previewResolution} cells.`,
    });
    if (reframe) resetCamera();
    document.body.dataset.meshTriangles = String(triangleCount(geometry));
    document.body.dataset.meshResolution = String(state.document.meshing.previewResolution);
    document.body.dataset.previewAssetSource = 'toonlab-rockgen';
    document.body.dataset.modelReady = 'true';
  }

  async function remesh({ reframe = false } = {}) {
    if (disposed) return;
    const state = store.getState();
    const started = performance.now();
    const token = ++buildToken;
    document.body.dataset.modelReady = 'loading';
    try {
      const entry = getRockVariationCatalogEntry(
        state.catalogSourceId ?? state.document.reference?.id,
      );
      if (state.document.reference?.sourceMode === 'mesh-template' && entry) {
        await buildCatalogModel(entry, state, started, token, reframe);
      } else {
        if (catalogSource) {
          disposeModel();
          catalogSource.dispose();
          catalogSource = null;
        }
        buildProceduralModel(state, started, reframe);
      }
    } catch (error) {
      if (token !== buildToken || disposed) return;
      console.error('Rock generation failed:', error);
      store.actions.adoptEngineState({ status: `Generation failed: ${error.message}` });
      document.body.dataset.modelReady = 'error';
    }
  }

  function scheduleRemesh(reframe = false) {
    clearTimeout(remeshTimer);
    document.body.dataset.modelReady = 'loading';
    remeshTimer = setTimeout(() => { void remesh({ reframe }); }, 75);
  }

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (state.docRevision === requestedRevision) return;
    requestedRevision = state.docRevision;
    const reframe = state.viewRevision !== requestedViewRevision;
    requestedViewRevision = state.viewRevision;
    scheduleRemesh(reframe);
  });

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', handleResize);

  store.actions.registerCatalogRuntime({
    async exportGlb() {
      if (!catalogVariation?.root) throw new Error('The selected catalog GLB is still loading.');
      try {
        return await exportCatalogVariation(catalogVariation.root, renderer);
      } finally {
        handleResize();
      }
    },
    async setGrassPreview(options) {
      try {
        const stats = await rebuildPreviewGrass(options);
        store.actions.adoptEngineState({
          status: options?.enabled
            ? stats.clumps > 0
              ? `Previewing ${stats.clumps.toLocaleString()} meadow clumps (${stats.blades.toLocaleString()} blades) adapted to the rock surface.`
              : 'No upward-facing top area matches the meadow grass mask.'
            : 'Meadow grass preview hidden.',
        });
      } catch (error) {
        console.error('Rock meadow preview failed:', error);
        store.actions.adoptEngineState({ status: `Meadow preview failed: ${error.message}` });
      }
    },
  });

  const clock = new THREE.Clock();
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    controls.update();
    previewGrass?.update?.(clock.getDelta(), camera);
    renderer.render(scene, camera);
  }

  return {
    camera,
    controls,
    dispose() {
      disposed = true;
      clearTimeout(remeshTimer);
      buildToken += 1;
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', beginSculpt, { capture: true });
      renderer.domElement.removeEventListener('pointermove', moveSculpt, { capture: true });
      renderer.domElement.removeEventListener('pointerup', finishSculpt, { capture: true });
      renderer.domElement.removeEventListener('pointercancel', finishSculpt, { capture: true });
      disposeModel({ immediate: true });
      for (const record of deferredDisposals) {
        window.clearTimeout(record.timer);
        record.disposer();
      }
      deferredDisposals.clear();
      catalogSource?.dispose();
      catalogSource = null;
      catalogLoader.dispose();
      groundFieldPass.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      sculptCursor.geometry.dispose();
      sculptCursor.material.dispose();
      renderer.dispose();
    },
    renderer,
    resetCamera,
    setNavigationMode,
    setSculptOptions(options = {}) {
      Object.assign(sculptOptions, options);
      sculptOptions.enabled = Boolean(sculptOptions.enabled);
      sculptOptions.radius = Math.max(Number(sculptOptions.radius) || 0.5, 0.01);
      sculptOptions.strength = clamp(Number(sculptOptions.strength) || 0, 0, 1);
      renderer.domElement.style.cursor = sculptOptions.enabled ? 'crosshair' : '';
      if (!sculptOptions.enabled) sculptCursor.visible = false;
      setNavigationMode(navigationMode);
    },
    scene,
    start() {
      const state = store.getState();
      requestedRevision = state.docRevision;
      requestedViewRevision = state.viewRevision;
      void remesh({ reframe: true });
      animate();
    },
  };
}
