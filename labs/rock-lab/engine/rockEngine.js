// Rock Lab engine: owns the three.js scene, the document -> mesh pipeline
// (per-piece and merged previews), the AO scheduler, and the transform
// gizmo. Subscribes to the rock store and re-meshes on document revision
// changes; React (or nothing, under ?hud=0) renders above it.
//
// Composition model is unchanged from the pre-React lab: the document's
// piece list is the source of truth, the scene graph is a projection.
//   per-piece preview: each piece meshed in LOCAL space, transform on its
//     Group (fast edits, live gizmo drags, subtract pieces as red cutters);
//   merged preview: one mesh of the folded field, exactly what Export sees.

import * as THREE from 'three';

import {
  advanceEnvironmentShaderTime,
  resetEnvironmentShaderTime,
  setEnvironmentDebugOutput,
} from '../../../src/environment/environmentMaterialAdapter.js';
import { isRockHelperPiece, meshDocument } from '../../../src/rockgen/index.js';
import {
  convertRockMesh,
  createAoScheduler,
  createRockMesh,
  refreshEnvironmentBounds,
  swapRockGeometry,
} from '../rockMaterials.js';
import { createRockScene } from '../rockScene.js';
import { createTransformGizmo } from '../transformGizmo.js';
import { whenRendererReady } from '../../shared/rendererFactory.js';
import { createEnvironmentSunShadowPass } from '../../../src/environment/environmentSunShadowPass.js';

const REGENERATE_DEBOUNCE_MS = 150;
const MOVE_MODE_BUTTONS = Object.freeze({
  pan: THREE.MOUSE.PAN,
  rotate: THREE.MOUSE.ROTATE,
  zoom: THREE.MOUSE.DOLLY,
});
const SELECTION_PIVOT_ID = '__rock_selection_pivot__';

function isHelperPiece(piece) {
  return isRockHelperPiece(piece);
}

export function createRockEngine({ mount, store, urlParams }) {
  const hudHidden = urlParams.get('hud') === '0';
  const captureView = (urlParams.get('captureView') || '').toLowerCase();
  const deterministic = hudHidden || Boolean(captureView);

  document.body.dataset.scene = 'rock';
  document.body.dataset.modelReady = 'false';
  if (captureView) document.body.dataset.captureView = captureView;

  const sceneContext = createRockScene({ container: mount });
  const {
    ambient, camera, controls, environmentBox, frameComposition, renderer, rockRoot, scene,
    setSunState,
  } = sceneContext;
  if (deterministic) controls.enabled = false;

  function syncOrbitMouseButtons(state = store.getState()) {
    controls.mouseButtons.LEFT = state.tool === 'orbit'
      ? (MOVE_MODE_BUTTONS[state.moveMode] ?? THREE.MOUSE.ROTATE)
      : THREE.MOUSE.ROTATE;
  }
  syncOrbitMouseButtons();

  // All generated meshes live under a lift group so the composition rests
  // on the ground plane no matter where the document's origin sits.
  const compositionGroup = new THREE.Group();
  compositionGroup.name = 'Rock composition';
  rockRoot.add(compositionGroup);

  const selectionPivot = new THREE.Object3D();
  selectionPivot.name = 'Rock selection pivot';
  compositionGroup.add(selectionPivot);
  const selectionPivotBase = new THREE.Vector3();

  const CUTTER_MATERIAL = new THREE.MeshStandardMaterial({
    color: 0xd05548,
    opacity: 0.32,
    transparent: true,
  });
  CUTTER_MATERIAL.userData.environmentShaderExclude = true;

  const pieceViews = new Map(); // pieceId -> { group, mesh, converted, isCutter }
  let mergedMesh = null;
  let mergedConverted = false;
  let regenerateTimer = 0;
  let rebuilding = false;
  const rebuiltListeners = new Set();
  const frameListeners = new Set();
  const dynamicShadowCasters = new Set();
  let sunShadowRefreshFrames = 1;

  const doc = () => store.getState().document;

  function selectedPieceIds(state = store.getState()) {
    const available = new Set(state.document.pieces
      .filter((piece) => !isHelperPiece(piece))
      .map((piece) => piece.id));
    const source = Array.isArray(state.selectedPieceIds)
      ? state.selectedPieceIds
      : [state.selectedPieceId];
    const ids = [];
    for (const id of source) {
      if (available.has(id) && !ids.includes(id)) ids.push(id);
    }
    if (!ids.length && available.has(state.selectedPieceId)) ids.push(state.selectedPieceId);
    if (!ids.length) {
      const fallback = state.document.pieces.find((piece) => !isHelperPiece(piece));
      if (fallback) ids.push(fallback.id);
    }
    return ids;
  }

  function selectionKey(state = store.getState()) {
    return selectedPieceIds(state).join('|');
  }

  function selectionCenter(pieceIds) {
    const state = store.getState();
    const center = new THREE.Vector3();
    let count = 0;
    for (const pieceId of pieceIds) {
      const piece = state.document.pieces.find((entry) => entry.id === pieceId);
      if (!piece) continue;
      const position = piece.transform?.position ?? [0, 0, 0];
      center.add(new THREE.Vector3(
        Number(position[0]) || 0,
        Number(position[1]) || 0,
        Number(position[2]) || 0,
      ));
      count += 1;
    }
    if (count) center.multiplyScalar(1 / count);
    return center;
  }

  function applySelectionPreview(delta) {
    const state = store.getState();
    for (const pieceId of selectedPieceIds(state)) {
      const view = pieceViews.get(pieceId);
      const piece = state.document.pieces.find((entry) => entry.id === pieceId);
      if (!view || !piece) continue;
      const position = piece.transform?.position ?? [0, 0, 0];
      view.group.position.set(
        (Number(position[0]) || 0) + delta.x,
        (Number(position[1]) || 0) + delta.y,
        (Number(position[2]) || 0) + delta.z,
      );
    }
  }

  function visibleRockMeshes() {
    if (store.getState().mergePreview) {
      return mergedMesh && mergedMesh.visible ? [mergedMesh] : [];
    }
    return [...pieceViews.values()]
      .filter((view) => view.group.visible && !view.isCutter && !view.isHelper)
      .map((view) => view.mesh);
  }

  function authoredFloorY() {
    let minY = Infinity;
    for (const piece of store.getState().document.pieces) {
      const op = piece.combine?.op;
      if (piece.hidden || op === 'subtract' || op === 'intersect') continue;
      const y = Number(piece.transform?.position?.[1]) || 0;
      minY = Math.min(minY, y);
    }
    return Number.isFinite(minY) ? minY : 0;
  }

  function shouldBakePreviewAo() {
    return store.getState().tool === 'orbit';
  }

  const aoScheduler = createAoScheduler({
    getEnvironmentBox: () => environmentBox,
    getMeshes: () => visibleRockMeshes(),
    getOccluderRoot: () => rockRoot,
    getRevision: () => doc().revision,
    onBaked: () => {
      document.body.dataset.rockAoState = 'baked';
    },
    shouldBake: shouldBakePreviewAo,
  });

  function applyPieceTransform(view, piece) {
    view.group.position.fromArray(piece.transform.position);
    view.group.rotation.set(...piece.transform.rotation);
    view.group.scale.fromArray(piece.transform.scale);
  }

  // Rests the document's authored floor on the ground plane. The authored
  // floor ignores intentional piece Y translation, so moving every piece up
  // creates a real visible gap instead of being normalized away.
  function settleOnGround() {
    compositionGroup.position.y = 0;
    compositionGroup.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const mesh of visibleRockMeshes()) {
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    if (!box.isEmpty()) compositionGroup.position.y = -(box.min.y - authoredFloorY()) - 0.03;
    compositionGroup.updateMatrixWorld(true);
  }

  function afterGeometryChange({ reframe = false } = {}) {
    settleOnGround();
    sceneContext.updateEnvironmentBox();
    refreshEnvironmentBounds(rockRoot, environmentBox);
    sunShadowRefreshFrames = Math.max(sunShadowRefreshFrames, 1);
    if (reframe || deterministic) frameComposition(captureView || null);

    let vertexCount = 0;
    for (const mesh of visibleRockMeshes()) {
      vertexCount += mesh.geometry.getAttribute('position').count;
    }
    document.body.dataset.rockVertexCount = String(vertexCount);
    document.body.dataset.rockResolution = String(store.getState().previewResolution);
    document.body.dataset.rockPieceCount = String(doc().pieces.length);
    document.body.dataset.rockAoState = 'pending';
    aoScheduler.schedule();
    for (const listener of rebuiltListeners) listener();
    if (!deterministic) attachGizmoToSelection();
  }

  async function ensurePieceView(piece) {
    let view = pieceViews.get(piece.id);
    if (!view) {
      const isCutter = piece.combine.op === 'subtract' || piece.combine.op === 'intersect';
      const isHelper = isHelperPiece(piece);
      const group = new THREE.Group();
      group.name = `Piece ${piece.id}`;
      const mesh = createRockMesh(new THREE.BufferGeometry(), piece.name);
      if (isCutter) {
        // Cutters are editing aids, not geometry: no toon conversion, no
        // shadows, and they must not darken the AO bake.
        mesh.material = CUTTER_MATERIAL;
        mesh.castShadow = false;
        mesh.userData.environmentShaderExclude = true;
        mesh.userData.environmentVertexAoOccluderExclude = true;
      }
      group.add(mesh);
      compositionGroup.add(group);
      view = {
        converted: false, group, isCutter, isHelper, mesh,
      };
      pieceViews.set(piece.id, view);
    }
    return view;
  }

  async function regeneratePieceView(piece) {
    const view = await ensurePieceView(piece);
    const geometry = meshDocument(doc(), {
      pieceId: piece.id,
      resolution: store.getState().previewResolution,
    });
    swapRockGeometry(view.mesh, geometry);
    applyPieceTransform(view, piece);
    view.group.visible = !store.getState().mergePreview && !piece.hidden && !isHelperPiece(piece);
    if (!view.converted && !view.isCutter) {
      view.converted = true;
      await convertRockMesh(view.mesh, environmentBox);
      const mode = store.getState().envDebugMode;
      if (mode !== 'off') setEnvironmentDebugOutput(view.mesh, mode);
    }
    return view;
  }

  async function regenerateMerged() {
    const geometry = meshDocument(doc(), {
      includeHelpers: false,
      resolution: store.getState().previewResolution,
    });
    if (!mergedMesh) {
      mergedMesh = createRockMesh(geometry, 'Merged composition');
      compositionGroup.add(mergedMesh);
    } else {
      swapRockGeometry(mergedMesh, geometry);
    }
    if (!mergedConverted) {
      mergedConverted = true;
      await convertRockMesh(mergedMesh, environmentBox);
      const mode = store.getState().envDebugMode;
      if (mode !== 'off') setEnvironmentDebugOutput(mergedMesh, mode);
    }
    mergedMesh.visible = true;
  }

  function syncPreviewModeVisibility() {
    const { mergePreview } = store.getState();
    if (mergedMesh) mergedMesh.visible = mergePreview;
    for (const [pieceId, view] of pieceViews) {
      const piece = doc().pieces.find((entry) => entry.id === pieceId);
      view.group.visible = !mergePreview && Boolean(piece) && !piece.hidden && !isHelperPiece(piece);
    }
  }

  // Removes views whose pieces are gone, then re-meshes what the current
  // preview mode shows.
  async function rebuildAll({ reframe = false } = {}) {
    rebuilding = true;
    const started = performance.now();
    for (const [pieceId, view] of [...pieceViews]) {
      const piece = doc().pieces.find((entry) => entry.id === pieceId);
      if (piece && !isHelperPiece(piece)) continue;
      view.group.removeFromParent();
      view.mesh.geometry.dispose();
      pieceViews.delete(pieceId);
    }
    try {
      if (store.getState().mergePreview) {
        await regenerateMerged();
        // Keep (possibly empty) piece groups positioned so the gizmo can
        // still attach and drag pieces while previewing the merged field.
        for (const piece of doc().pieces) {
          if (isHelperPiece(piece)) continue;
          const view = await ensurePieceView(piece); // eslint-disable-line no-await-in-loop
          applyPieceTransform(view, piece);
        }
      } else {
        for (const piece of doc().pieces) {
          if (isHelperPiece(piece)) continue;
          await regeneratePieceView(piece); // eslint-disable-line no-await-in-loop
        }
      }
    } catch (error) {
      rebuilding = false;
      store.actions.setStatus(`Generation failed: ${error.message}`);
      return;
    }
    syncPreviewModeVisibility();
    rebuilding = false;
    afterGeometryChange({ reframe });
    const vertexCount = document.body.dataset.rockVertexCount;
    store.actions.setStatus(
      `${Number(vertexCount).toLocaleString()} verts at ${store.getState().previewResolution}³ `
      + `in ${Math.round(performance.now() - started)} ms`,
    );
  }

  async function regenerateSelected() {
    if (store.getState().mergePreview) {
      await rebuildAll();
      return;
    }
    const piece = store.actions.getSelectedPiece();
    const started = performance.now();
    rebuilding = true;
    try {
      await regeneratePieceView(piece);
    } catch (error) {
      rebuilding = false;
      store.actions.setStatus(`Generation failed: ${error.message}`);
      return;
    }
    rebuilding = false;
    afterGeometryChange();
    store.actions.setStatus(`Updated "${piece.name}" in ${Math.round(performance.now() - started)} ms`);
  }

  function raycastPiece(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const candidates = [...pieceViews.entries()]
      .filter(([, view]) => view.group.visible)
      .map(([pieceId, view]) => ({ mesh: view.mesh, pieceId }));
    const hit = intersectFirst(candidates.map((entry) => entry.mesh));
    if (!hit) return null;
    const candidate = candidates.find((entry) => entry.mesh === hit.object);
    return candidate ? { ...candidate, hit, point: hit.point.clone() } : null;
  }

  function hasDynamicShadowCaster() {
    for (const source of dynamicShadowCasters) {
      if (source()) return true;
    }
    return false;
  }

  // --- Store subscription: revision diffing --------------------------------

  let seenRevision = doc().revision;
  let seenDocument = doc();
  let seenMerge = store.getState().mergePreview;
  let seenSelection = selectionKey();
  let seenEnvDebug = store.getState().envDebugMode;
  let seenGizmoMode = store.getState().gizmoMode;
  let seenMoveMode = store.getState().moveMode;
  let seenTool = store.getState().tool;
  let galleryVisible = !hudHidden && store.getState().view.gallery;
  if (galleryVisible) renderer.domElement.style.visibility = 'hidden';

  store.subscribe(() => {
    const state = store.getState();

    if (!hudHidden && state.view.gallery !== galleryVisible) {
      galleryVisible = state.view.gallery;
      renderer.domElement.style.visibility = galleryVisible ? 'hidden' : '';
    }

    if (state.envDebugMode !== seenEnvDebug) {
      seenEnvDebug = state.envDebugMode;
      setEnvironmentDebugOutput(rockRoot, state.envDebugMode);
    }

    if (state.gizmoMode !== seenGizmoMode) {
      seenGizmoMode = state.gizmoMode;
      gizmo.setMode(state.gizmoMode);
    }

    if (state.tool !== seenTool) {
      seenTool = state.tool;
      gizmo.setEnabled(!deterministic && state.tool === 'orbit');
      syncOrbitMouseButtons(state);
      if (state.tool === 'orbit') aoScheduler.schedule();
      else {
        aoScheduler.cancel();
        if (document.body.dataset.rockAoState === 'pending') {
          document.body.dataset.rockAoState = 'paused';
        }
      }
    }

    if (state.moveMode !== seenMoveMode) {
      seenMoveMode = state.moveMode;
      syncOrbitMouseButtons(state);
    }

    if (state.mergePreview !== seenMerge) {
      seenMerge = state.mergePreview;
      rebuildAll();
    }

    const nextSelection = selectionKey(state);
    if (nextSelection !== seenSelection) {
      seenSelection = nextSelection;
      attachGizmoToSelection();
    }

    if (state.document !== seenDocument || state.docRevision !== seenRevision) {
      const documentSwapped = state.document !== seenDocument;
      seenDocument = state.document;
      seenRevision = state.docRevision;
      const { immediate, pieceLevel, reframe } = state.lastChange;
      clearTimeout(regenerateTimer);
      if (immediate || documentSwapped) {
        rebuildAll({ reframe });
      } else {
        regenerateTimer = setTimeout(() => {
          if (pieceLevel) regenerateSelected();
          else rebuildAll({ reframe });
        }, REGENERATE_DEBOUNCE_MS);
      }
    }
  });

  // --- Gizmo ----------------------------------------------------------------

  const gizmo = createTransformGizmo({
    camera,
    domElement: renderer.domElement,
    mode: store.getState().gizmoMode,
    onChange: (pieceId, transform) => {
      if (pieceId !== SELECTION_PIVOT_ID) return;
      const nextPosition = new THREE.Vector3().fromArray(transform.position);
      applySelectionPreview(nextPosition.sub(selectionPivotBase));
    },
    onCommit: (pieceId, transform) => {
      if (pieceId === SELECTION_PIVOT_ID) {
        const nextPosition = new THREE.Vector3().fromArray(transform.position);
        store.actions.translateSelectedPieces(nextPosition.sub(selectionPivotBase).toArray());
        return;
      }
      const ids = selectedPieceIds();
      if (ids.length > 1 && ids.includes(pieceId)) {
        const piece = doc().pieces.find((entry) => entry.id === pieceId);
        const previous = piece?.transform?.position ?? [0, 0, 0];
        const nextPosition = new THREE.Vector3().fromArray(transform.position);
        const delta = nextPosition.sub(new THREE.Vector3(
          Number(previous[0]) || 0,
          Number(previous[1]) || 0,
          Number(previous[2]) || 0,
        ));
        if (delta.lengthSq() > 1e-10) {
          store.actions.translateSelectedPieces(delta.toArray());
          return;
        }
      }
      store.actions.setPieceTransform(pieceId, transform);
    },
    orbitControls: controls,
    scene,
  });
  gizmo.setEnabled(!deterministic && store.getState().tool === 'orbit');

  function attachGizmoToSelection() {
    const ids = selectedPieceIds();
    if (ids.length > 1) {
      selectionPivot.position.copy(selectionCenter(ids));
      selectionPivot.rotation.set(0, 0, 0);
      selectionPivot.scale.set(1, 1, 1);
      selectionPivot.updateMatrixWorld(true);
      selectionPivotBase.copy(selectionPivot.position);
      gizmo.setMode('translate');
      gizmo.attach(selectionPivot, SELECTION_PIVOT_ID);
      return;
    }

    const pieceId = ids[0] ?? store.getState().selectedPieceId;
    const view = pieceViews.get(pieceId);
    if (view) {
      gizmo.setMode(store.getState().gizmoMode);
      gizmo.attach(view.group, pieceId);
    } else {
      gizmo.detach();
    }
  }

  // --- Public API ------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function intersectFirst(objects) {
    const previousFirstHitOnly = raycaster.firstHitOnly;
    try {
      raycaster.firstHitOnly = true;
      const hits = raycaster.intersectObjects(objects, false);
      return hits[0] ?? null;
    } finally {
      raycaster.firstHitOnly = previousFirstHitOnly;
    }
  }

  const engine = {
    ambient,
    camera,
    compositionGroup,
    controls,
    deterministic,
    frameComposition,
    gizmo,
    onFrame(listener) {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    registerDynamicShadowCaster(source) {
      dynamicShadowCasters.add(source);
      return () => dynamicShadowCasters.delete(source);
    },
    onRebuilt(listener) {
      rebuiltListeners.add(listener);
      return () => rebuiltListeners.delete(listener);
    },
    isRebuilding() {
      return rebuilding;
    },
    async rebuild(options) {
      await rebuildAll(options);
    },
    renderer,
    raycastPiece,
    /** Raycasts the visible rock surface; returns the hit or null. */
    raycastRock(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return intersectFirst(visibleRockMeshes());
    },
    raycasterFor(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster;
    },
    scene,
    setSunState,
    /** World -> document space (undoes the ground-settle lift). */
    toDocumentSpace(point) {
      return compositionGroup.worldToLocal(point.clone());
    },
    visibleRockMeshes,
  };

  // --- Boot + render loop ----------------------------------------------------

  engine.start = async () => {
    // WebGPU backends boot asynchronously; renders (incl. AO bakes) wait.
    await whenRendererReady(renderer);
    // Ground converts once; generated meshes convert as their views appear.
    await convertRockMesh(sceneContext.ground, environmentBox);
    await rebuildAll({ reframe: true });
    if (!deterministic) attachGizmoToSelection();
    if (deterministic) {
      resetEnvironmentShaderTime(0);
      // Captures wait for the scene-aware AO, not the debounced pass.
      await aoScheduler.bakeNow();
    }
    document.body.dataset.modelReady = 'true';

    const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      if (galleryVisible) return;
      if (!deterministic) {
        advanceEnvironmentShaderTime(delta);
        for (const listener of frameListeners) listener(delta);
      }
      controls.update();
      const refreshSunShadow = sunShadowRefreshFrames > 0;
      sunShadowPass.update({
        dynamic: refreshSunShadow || hasDynamicShadowCaster(),
      });
      if (refreshSunShadow) sunShadowRefreshFrames -= 1;
      renderer.render(scene, camera);
    });
  };

  return engine;
}
