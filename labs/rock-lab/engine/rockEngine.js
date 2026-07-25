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
import {
  createRockReferenceLodObject,
  exportRockReferenceAssetToGLB,
  isRockHelperPiece,
  loadRockReferenceAsset,
  loadRockReferenceAssetManifest,
  loadRockReferenceSourceMaterial,
  loadToonRockMaterial,
  meshDocument,
} from '../../../src/rockgen/index.js';
import {
  loadToonLabRockMaterialIndex,
  resolveToonLabRockMaterial,
} from '../../../src/environment/toonLabRockMaterialResolver.js';
import { TOONLAB_RENDER_CONTRACT } from '../../../src/environment/toonLabRendering.js';
import { installToonLabShadowCasterBias } from '../../../src/environment/toonLabShadows.js';
import { createToonLabStagePostPipeline } from '../../../src/environment/toonLabStage.js';
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
const TOONLAB_DIRECTION_TO_LIGHT = Object.freeze(
  TOONLAB_RENDER_CONTRACT.sun.rayDirection.map((value) => -value),
);

function isHelperPiece(piece) {
  return isRockHelperPiece(piece);
}

export function createRockEngine({ mount, store, urlParams }) {
  const hudHidden = urlParams.get('hud') === '0';
  const captureView = (urlParams.get('captureView') || '').toLowerCase();
  const deterministic = hudHidden || Boolean(captureView);
  const inspectEnabled = urlParams.get('inspect') === '1';
  const toonLabCasterBiasEnabled = urlParams.get('toonLabCasterBias') !== '0';
  const toonLabPostEnabled = urlParams.get('toonLabPost') !== '0';
  const toonLabShadowsEnabled = urlParams.get('toonLabShadows') !== '0';

  document.body.dataset.scene = 'rock';
  document.body.dataset.modelReady = 'false';
  if (captureView) document.body.dataset.captureView = captureView;

  const sceneContext = createRockScene({
    container: mount,
    toonLabShadowsEnabled,
  });
  const {
    ambient, camera, controls, environmentBox, frameComposition, renderer, rockRoot, scene,
    getRenderAuthority, registerLabGroundMaterial, setFogScale, setRenderAuthority, setSunState,
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
  let referenceAsset = null;
  let referenceBuild = null;
  let referenceLoadToken = 0;
  let referenceManifestPromise = null;
  let toonRockMaterialIndexPromise = null;
  let regenerateTimer = 0;
  let rebuilding = false;
  const rebuiltListeners = new Set();
  const frameListeners = new Set();
  const dynamicShadowCasters = new Set();
  let sunShadowRefreshFrames = 1;
  let toonLabPost = null;
  let toonLabPostDirty = true;
  let gizmo = null;

  const doc = () => store.getState().document;

  function reportToonLabInspector() {
    if (!inspectEnabled) return;
    const rockMeshes = visibleRockMeshes();
    const rockBox = new THREE.Box3();
    for (const mesh of rockMeshes) {
      rockBox.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    const { ground, toonLabStageLights } = sceneContext;
    const csm = toonLabStageLights.cascadedShadows[0];
    const casters = [];
    scene.traverse((object) => {
      if (!object.isMesh || !object.castShadow) return;
      let hierarchyVisible = object.visible;
      for (let parent = object.parent; hierarchyVisible && parent; parent = parent.parent) {
        hierarchyVisible = parent.visible;
      }
      const bounds = object.geometry?.boundingBox
        ? object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
        : null;
      casters.push({
        hierarchyVisible,
        max: bounds?.max.toArray() ?? null,
        min: bounds?.min.toArray() ?? null,
        name: object.name,
        parent: object.parent?.name ?? null,
      });
    });
    document.body.dataset.rockInspectState = JSON.stringify({
      camera: {
        far: camera.far,
        fov: camera.fov,
        near: camera.near,
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      },
      cascades: csm.lights.map((light) => ({
        camera: {
          bottom: light.shadow.camera.bottom,
          far: light.shadow.camera.far,
          left: light.shadow.camera.left,
          near: light.shadow.camera.near,
          right: light.shadow.camera.right,
          top: light.shadow.camera.top,
        },
        mapAllocated: Boolean(light.shadow.map),
        mapSize: light.shadow.mapSize.toArray(),
        matrix: light.shadow.matrix.toArray(),
        parent: light.parent?.name ?? null,
        position: light.position.toArray(),
        target: light.target.position.toArray(),
      })),
      casters,
      ground: {
        material: ground.material.name,
        position: ground.position.toArray(),
        receiveShadow: ground.receiveShadow,
        scale: ground.scale.toArray(),
      },
      rock: {
        castShadow: rockMeshes.every((mesh) => mesh.castShadow),
        max: rockBox.isEmpty() ? null : rockBox.max.toArray(),
        min: rockBox.isEmpty() ? null : rockBox.min.toArray(),
        receiveShadow: rockMeshes.every((mesh) => mesh.receiveShadow),
      },
      sun: {
        castShadow: toonLabStageLights.light.castShadow,
        position: toonLabStageLights.light.position.toArray(),
        shadowNode: toonLabStageLights.light.shadow.shadowNode?.constructor?.name ?? null,
        target: toonLabStageLights.light.target.position.toArray(),
        visible: toonLabStageLights.light.visible,
      },
    });
  }

  function activeReferenceId(state = store.getState()) {
    return state.document.reference?.sourceMode === 'mesh-template'
      ? state.document.reference.id
      : null;
  }

  function isReferenceMode(state = store.getState()) {
    return Boolean(activeReferenceId(state));
  }

  function desiredRenderAuthority(state = store.getState()) {
    return isReferenceMode(state) && state.referenceMaterialMode === 'toonlab'
      ? 'source'
      : 'legacy';
  }

  function syncRenderAuthority(state = store.getState()) {
    const next = desiredRenderAuthority(state);
    if (getRenderAuthority() !== next) {
      setRenderAuthority(next);
      toonLabPostDirty = true;
    }
    gizmo?.setSceneMounted(next !== 'source');
    return next;
  }

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
    if (isReferenceMode()) {
      return referenceBuild?.levels
        .filter((level) => level.mesh.visible)
        .map((level) => level.mesh) ?? [];
    }
    if (store.getState().mergePreview) {
      return mergedMesh && mergedMesh.visible ? [mergedMesh] : [];
    }
    return [...pieceViews.values()]
      .filter((view) => view.group.visible && !view.isCutter && !view.isHelper)
      .map((view) => view.mesh);
  }

  function authoredFloorY() {
    if (isReferenceMode()) return 0;
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
    const state = store.getState();
    return state.tool === 'orbit'
      && (!isReferenceMode(state) || state.referenceMaterialMode === 'legacy');
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
    document.body.dataset.rockResolution = isReferenceMode()
      ? 'source'
      : String(store.getState().previewResolution);
    document.body.dataset.rockPieceCount = isReferenceMode() ? '1' : String(doc().pieces.length);
    document.body.dataset.rockAoState = 'pending';
    const toonlab = getRenderAuthority() === 'source';
    const rockMeshes = visibleRockMeshes();
    document.body.dataset.rockToonLabCaster = String(
      toonlab && rockMeshes.length > 0 && rockMeshes.every((mesh) => mesh.castShadow),
    );
    document.body.dataset.rockToonLabSelfShadow = String(
      toonlab && rockMeshes.length > 0 && rockMeshes.every((mesh) => mesh.receiveShadow),
    );
    toonLabPostDirty = true;
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

  function disposeReferenceBuild() {
    if (!referenceBuild) return;
    referenceBuild.dispose();
    referenceBuild = null;
  }

  function disposeReferenceAsset() {
    disposeReferenceBuild();
    referenceAsset?.dispose();
    referenceAsset = null;
  }

  function hideProceduralViews() {
    if (mergedMesh) mergedMesh.visible = false;
    for (const view of pieceViews.values()) view.group.visible = false;
  }

  async function ensureReferenceAsset(referenceId, token) {
    if (referenceAsset?.entry.id === referenceId) return referenceAsset;
    if (!referenceManifestPromise) {
      referenceManifestPromise = loadRockReferenceAssetManifest().catch((error) => {
        referenceManifestPromise = null;
        throw error;
      });
    }
    const manifest = await referenceManifestPromise;
    let loaded;
    try {
      loaded = await loadRockReferenceAsset(referenceId, { manifest });
    } catch (error) {
      // The local exporter writes its manifest incrementally. If Rock Lab is
      // open during that process, let the next selection/retry fetch the
      // newly advanced inventory rather than pinning the early snapshot.
      if (/missing from the local reference manifest/i.test(error.message)) {
        referenceManifestPromise = null;
      }
      throw error;
    }
    if (token !== referenceLoadToken) {
      loaded.dispose();
      return null;
    }
    referenceAsset?.dispose();
    referenceAsset = loaded;
    return loaded;
  }

  async function rebuildReference({ reframe = false } = {}) {
    const state = store.getState();
    const referenceId = activeReferenceId(state);
    if (!referenceId) return false;
    const token = ++referenceLoadToken;
    hideProceduralViews();
    store.actions.setReferenceAssetStatus('loading');
    document.body.dataset.rockReferenceStatus = 'loading';
    try {
      const asset = await ensureReferenceAsset(referenceId, token);
      if (!asset || token !== referenceLoadToken) return true;
      if (state.referenceMaterialMode === 'source' && !asset.sourceMaterial) {
        const sourceMaterial = await loadRockReferenceSourceMaterial(asset.entry.sourceAssetName);
        if (token !== referenceLoadToken) {
          sourceMaterial.dispose();
          return true;
        }
        asset.sourceMaterial = sourceMaterial;
      }
      if (state.referenceMaterialMode === 'toonlab' && !asset.toonLabMaterial) {
        toonRockMaterialIndexPromise ??= loadToonLabRockMaterialIndex();
        const index = await toonRockMaterialIndexPromise;
        const materialReference = asset.localEntry.materials?.find(Boolean);
        const resolution = resolveToonLabRockMaterial(materialReference, {
          allowFallback: true,
          index,
          sourceAssetName: asset.entry.sourceAssetName,
        });
        if (!resolution?.materialRecord) {
          throw new Error(`No ToonLab S_Rock material matches ${asset.entry.sourceAssetName}.`);
        }
        const toonLabMaterial = await loadToonRockMaterial({
          manifest: index.manifest,
          material: resolution.materialRecord,
          coordinates: {
            zSign: 1,
            // ToonLab's authored thresholds and the glTF reference geometry
            // are both in metres after export.
            distanceScale: 1,
          },
        });
        if (token !== referenceLoadToken) {
          toonLabMaterial.dispose();
          return true;
        }
        if (toonLabCasterBiasEnabled) {
          installToonLabShadowCasterBias(toonLabMaterial, {
            directionToLight: TOONLAB_DIRECTION_TO_LIGHT,
          });
        }
        toonLabMaterial.userData.environmentShaderExclude = true;
        toonLabMaterial.userData.toonlabRockSourceMaterial = {
          materialPath: materialReference,
          sourceAssetName: asset.entry.sourceAssetName,
          toonLabMaterial: resolution.toonLabMaterialName,
        };
        asset.toonLabMaterial = toonLabMaterial;
      }
      disposeReferenceBuild();
      const materialMode = ['source', 'toonlab', 'authored'].includes(state.referenceMaterialMode)
        ? state.referenceMaterialMode
        : 'neutral';
      referenceBuild = createRockReferenceLodObject(asset, {
        geometryMode: state.referenceGeometryMode,
        materialMode,
        seed: state.seed,
        strength: state.referenceVariation,
      });
      // The visible LOD must be selected from the player's camera. Three's
      // default automatic LOD update also runs for every shadow camera. With
      // cascaded shadows that lets cascade 0 select one mesh, cascade 1 select
      // another, and leaves the later shadow passes with mutated visibility.
      // ToonLab chooses the renderer LOD for the view before shadow submission,
      // so pin Three's automatic updates and make the same choice explicitly.
      referenceBuild.lod.autoUpdate = false;
      compositionGroup.add(referenceBuild.lod);
      if (state.referenceMaterialMode === 'legacy') {
        for (const level of referenceBuild.levels) {
          if (!level.geometry.getAttribute('envVertexAo')) {
            const count = level.geometry.getAttribute('position').count;
            level.geometry.setAttribute(
              'envVertexAo',
              new THREE.BufferAttribute(new Float32Array(count).fill(1), 1),
            );
          }
          const previousMaterial = level.mesh.material;
          await convertRockMesh(level.mesh, environmentBox); // eslint-disable-line no-await-in-loop
          level.material = level.mesh.material;
          if (previousMaterial !== level.material) previousMaterial?.dispose?.();
        }
      }
      if (token !== referenceLoadToken) {
        disposeReferenceBuild();
        return true;
      }
      referenceBuild.lod.update(camera);
      store.actions.setReferenceLodReport(referenceBuild.report);
      store.actions.setReferenceAssetStatus('ready');
      document.body.dataset.rockReferenceStatus = 'ready';
      afterGeometryChange({ reframe });
      const counts = referenceBuild.levels
        .map((level) => level.actualTriangles.toLocaleString())
        .join(' / ');
      const geometryLabel = state.referenceGeometryMode === 'original'
        ? 'Original source'
        : `Source-derived variation ${state.seed}`;
      const materialLabel = state.referenceMaterialMode === 'authored'
        ? 'ToonLab material bake'
        : state.referenceMaterialMode === 'source'
          ? 'source material graph port'
          : state.referenceMaterialMode === 'toonlab'
            ? 'ToonLab S_Rock shader (ToonLab source port)'
          : state.referenceMaterialMode === 'neutral' ? 'neutral material' : 'legacy ToonLab material';
      store.actions.setStatus(
        `${geometryLabel}: ${asset.entry.sourceAssetName} · ${counts} tris · ${materialLabel}`,
      );
      return true;
    } catch (error) {
      if (token !== referenceLoadToken) return true;
      disposeReferenceBuild();
      const missing = /manifest is unavailable|missing from the local reference manifest/i.test(error.message);
      store.actions.setReferenceAssetStatus(missing ? 'missing' : 'error');
      document.body.dataset.rockReferenceStatus = missing ? 'missing' : 'error';
      store.actions.setStatus(`Reference load failed: ${error.message}`);
      return true;
    }
  }

  function syncPreviewModeVisibility() {
    if (isReferenceMode()) {
      hideProceduralViews();
      if (referenceBuild) referenceBuild.lod.visible = true;
      return;
    }
    if (referenceBuild) referenceBuild.lod.visible = false;
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
    if (isReferenceMode()) {
      await rebuildReference({ reframe });
      rebuilding = false;
      return;
    }
    referenceLoadToken += 1;
    disposeReferenceAsset();
    store.actions.setReferenceAssetStatus('idle');
    document.body.dataset.rockReferenceStatus = 'idle';
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
    if (isReferenceMode()) {
      rebuilding = true;
      await rebuildReference();
      rebuilding = false;
      return;
    }
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
  let seenReferenceGeometryMode = store.getState().referenceGeometryMode;
  let seenReferenceMaterialMode = store.getState().referenceMaterialMode;
  let seenReferenceVariation = store.getState().referenceVariation;
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
      if (!isReferenceMode(state)) rebuildAll();
    }

    const documentChanged = state.document !== seenDocument || state.docRevision !== seenRevision;
    const referenceViewChanged = state.referenceGeometryMode !== seenReferenceGeometryMode
      || state.referenceMaterialMode !== seenReferenceMaterialMode
      || state.referenceVariation !== seenReferenceVariation;
    seenReferenceGeometryMode = state.referenceGeometryMode;
    seenReferenceMaterialMode = state.referenceMaterialMode;
    seenReferenceVariation = state.referenceVariation;
    if (referenceViewChanged && isReferenceMode(state) && !documentChanged) {
      syncRenderAuthority(state);
      rebuildAll();
    }

    const nextSelection = selectionKey(state);
    if (nextSelection !== seenSelection) {
      seenSelection = nextSelection;
      attachGizmoToSelection();
    }

    if (documentChanged) {
      syncRenderAuthority(state);
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

  gizmo = createTransformGizmo({
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
  syncRenderAuthority();

  function attachGizmoToSelection() {
    if (isReferenceMode()) {
      gizmo.detach();
      return;
    }
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
    getRenderAuthority,
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
    async exportReferenceGLB() {
      const state = store.getState();
      const referenceId = activeReferenceId(state);
      if (!referenceId) throw new Error('The current document is not a source-mesh reference.');
      if (referenceAsset?.entry.id !== referenceId) await rebuildReference();
      if (!referenceAsset || referenceAsset.entry.id !== referenceId) {
        throw new Error(`The local source asset for ${referenceId} is not ready.`);
      }
      const result = await exportRockReferenceAssetToGLB(referenceAsset, {
        geometryMode: state.referenceGeometryMode,
        materialMode: state.referenceMaterialMode === 'neutral' ? 'neutral' : 'authored',
        seed: state.seed,
        strength: state.referenceVariation,
      });
      store.actions.setReferenceLodReport(result.report);
      return result;
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
    setFogScale,
    setRenderAuthority(authority) {
      const next = sceneContext.setRenderAuthority(authority);
      toonLabPostDirty = true;
      return next;
    },
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
    // Prepare the normal lab ground once, then restore the requested
    // authority. ToonLab mode swaps to its dedicated surface receiver so native
    // cascade shadows are not routed through ToonLab's custom shadow texture.
    const requestedAuthority = desiredRenderAuthority();
    setRenderAuthority('toonlab');
    await convertRockMesh(sceneContext.ground, environmentBox);
    // `convertRockMesh()` makes normal environment meshes both casters and
    // receivers. This validation floor must only receive; otherwise its
    // coplanar shadow-map render self-occludes the distant half of the disc
    // and disguises the rock's real footprint as a giant dark horizon band.
    sceneContext.ground.castShadow = false;
    sceneContext.ground.receiveShadow = true;
    registerLabGroundMaterial(sceneContext.ground.material);
    setRenderAuthority(requestedAuthority);
    await rebuildAll({ reframe: true });
    if (!deterministic) attachGizmoToSelection();
    if (deterministic) {
      resetEnvironmentShaderTime(0);
      // Captures wait for the scene-aware AO, not the debounced pass.
      await aoScheduler.bakeNow();
    }
    document.body.dataset.modelReady = 'true';

    const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });
    const timer = new THREE.Timer();
    timer.connect(document);
    renderer.setAnimationLoop((timestamp) => {
      timer.update(timestamp);
      const delta = timer.getDelta();
      if (galleryVisible) return;
      if (!deterministic) {
        advanceEnvironmentShaderTime(delta);
        for (const listener of frameListeners) listener(delta);
      }
      controls.update();
      // Keep the source rock's LOD tied to the view camera. Shadow cameras
      // must render this already-selected level without changing it.
      referenceBuild?.lod.update(camera);
      const sourceAuthority = getRenderAuthority() === 'source';
      if (sourceAuthority && toonLabPostEnabled && toonLabPostDirty) {
        toonLabPost?.pipeline?.dispose?.();
        toonLabPost = createToonLabStagePostPipeline({
          camera,
          renderer,
          scene,
        });
        toonLabPostDirty = false;
        document.body.dataset.rockToonLabPost = 'ready';
        document.body.dataset.rockToonLabCascadeCount = String(
          TOONLAB_RENDER_CONTRACT.shadows.cascadeCount,
        );
      }
      if (sourceAuthority && !toonLabPostEnabled) {
        document.body.dataset.rockToonLabPost = 'disabled';
      }
      const refreshSunShadow = sunShadowRefreshFrames > 0;
      if (!sourceAuthority) {
        sunShadowPass.update({
          dynamic: refreshSunShadow || hasDynamicShadowCaster(),
        });
      }
      if (refreshSunShadow) sunShadowRefreshFrames -= 1;
      if (sourceAuthority && toonLabPostEnabled) toonLabPost.pipeline.render();
      else renderer.render(scene, camera);
      reportToonLabInspector();
    });
  };

  return engine;
}
