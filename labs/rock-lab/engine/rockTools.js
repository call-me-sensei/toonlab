// Rock Lab pointer tools (Phase D + doodle-to-rock):
//
//   adjacentTile — hover a side of a visible piece and click to generate a
//     neighboring tile from that piece, with a ground footprint preview.
//
//   sculptAdd — filled build brush. Start on rock, paint in screen space,
//     and release to add a shallow outward-biased batch of brush capsules.
//
//   sculptSubtract — through-carve brush. Start on rock, draw through the
//     volume in screen space, and release to apply a batch of camera-depth
//     drill capsules. That keeps large cuts practical and avoids remeshing
//     every pointer sample.
//
//   doodle — draw a rock outline on a camera-facing vertical work plane
//     (Tree Lab's sketch convention). The closed stroke becomes a
//     'sketch' piece: the polygon extruded into a slab, rock stages on top.
//
// The store owns which tool is active; this module owns pointer plumbing,
// the live preview ink, and the world -> document space math.

import * as THREE from 'three';

import { createStrokeEdit } from '../../../src/rockgen/sdf/sculptEdits.js';
import { simplifyStroke } from '../../tree-lab/sketchTools.js';

const SCULPT_COLORS = { sculptAdd: 0x8fc6ff, sculptSubtract: 0xf07a6a };
const DOODLE_COLOR = 0xf0c05a;
const ADJACENT_COLOR = 0x8fe6a5;
const PAINT_STROKE_SCREEN_STEP = 6;
const THROUGH_CARVE_MIN_DEPTH = 2.5;
const BUILD_FILL_DEPTH_RADIUS = 2.2;
const BUILD_FILL_OUTWARD_RATIO = 0.72;
const ADJACENT_FOOTPRINT_GROUND_Y = 0.025;
const ADJACENT_POINTER_REACH = 1.15;
const ADJACENT_DIRECTIONS = Object.freeze({
  east: new THREE.Vector3(1, 0, 0),
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  west: new THREE.Vector3(-1, 0, 0),
});
const ADJACENT_DIRECTION_LABELS = Object.freeze({
  east: 'east',
  north: 'north',
  south: 'south',
  west: 'west',
});

export function installRockTools({ engine, store }) {
  const element = engine.renderer.domElement;

  // Brush cursor: a translucent sphere hugging the hovered surface point.
  const cursorMaterial = new THREE.MeshBasicMaterial({
    depthTest: false, opacity: 0.35, transparent: true,
  });
  const cursor = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), cursorMaterial);
  cursor.renderOrder = 998;
  cursor.visible = false;
  engine.scene.add(cursor);

  const adjacentPreview = new THREE.Group();
  adjacentPreview.name = 'Adjacent tile footprint preview';
  adjacentPreview.visible = false;
  const adjacentFootprint = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: ADJACENT_COLOR,
      depthTest: false,
      depthWrite: false,
      opacity: 0.42,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  adjacentFootprint.rotation.x = -Math.PI / 2;
  adjacentFootprint.renderOrder = 998;
  const adjacentOutline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, 0.5),
      new THREE.Vector3(-0.5, 0, 0.5),
    ]),
    new THREE.LineBasicMaterial({ color: ADJACENT_COLOR, depthTest: false, opacity: 0.95, transparent: true }),
  );
  adjacentOutline.renderOrder = 999;
  adjacentPreview.add(adjacentFootprint, adjacentOutline);
  engine.scene.add(adjacentPreview);

  let paintStroke = null; // { tool, points: Vector3[] (world), plane, normal, lastScreen }
  let doodleStroke = null; // { points: Vector3[] (world), plane, normal, lastScreen }
  let previewLine = null;
  let paintPreview = null; // { group, geometry, material, normal, radius, last }
  let adjacentHover = null; // { direction, pieceId }
  let lastPointer = null; // last canvas pointer position, for post-rebuild cursor refresh
  let pendingCursorEvent = null;
  let cursorFrame = 0;

  function activeTool() {
    return store.getState().tool;
  }

  function isSculpt(tool) {
    return tool === 'sculptAdd' || tool === 'sculptSubtract';
  }

  function isAdjacent(tool) {
    return tool === 'adjacentTile';
  }

  function rememberPointer(event) {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
  }

  function cancelCursorUpdate() {
    if (cursorFrame) {
      window.cancelAnimationFrame(cursorFrame);
      cursorFrame = 0;
    }
    pendingCursorEvent = null;
  }

  function scheduleCursorUpdate(event = lastPointer) {
    if (!event) return;
    pendingCursorEvent = { clientX: event.clientX, clientY: event.clientY };
    if (cursorFrame) return;
    cursorFrame = window.requestAnimationFrame(() => {
      cursorFrame = 0;
      const next = pendingCursorEvent;
      pendingCursorEvent = null;
      if (next) updateCursor(next);
    });
  }

  function refreshCursor() {
    if (!lastPointer) return;
    scheduleCursorUpdate(lastPointer);
  }

  // Orbit controls own the pointer only when no tool is armed.
  store.subscribe(() => {
    const tool = activeTool();
    engine.controls.enabled = tool === 'orbit';
    element.style.cursor = tool === 'orbit' || isAdjacent(tool) ? '' : 'crosshair';
    if (isSculpt(tool)) refreshCursor();
    else cursor.visible = false;
    if (!isAdjacent(tool)) hideAdjacentPreview();
  });
  engine.onRebuilt(() => {
    refreshCursor();
    if (isAdjacent(activeTool()) && lastPointer) updateAdjacentPreview(lastPointer);
  });

  function updateCursor(event) {
    const tool = activeTool();
    if (!isSculpt(tool)) return;
    if (paintStroke || engine.isRebuilding?.()) {
      cursor.visible = false;
      return;
    }
    const hit = engine.raycastRock(event);
    cursor.visible = Boolean(hit);
    if (!hit) return;
    cursor.position.copy(hit.point);
    const { radius } = store.getState().brush;
    cursor.scale.setScalar(radius);
    cursorMaterial.color.setHex(SCULPT_COLORS[tool]);
  }

  function beginSculpt(event) {
    beginPaintStroke(event);
  }

  function selectPiece(event) {
    if (engine.gizmo?.isTransformActive?.()) return;
    const hit = engine.raycastPiece(event);
    if (hit?.pieceId) {
      store.actions.selectPiece(hit.pieceId, {
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        preserveMulti: true,
      });
    }
  }

  function directionFromHorizontal(vector) {
    const x = vector.x;
    const z = vector.z;
    if (Math.abs(x) < 1e-4 && Math.abs(z) < 1e-4) return null;
    if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? 'east' : 'west';
    return z >= 0 ? 'south' : 'north';
  }

  function pieceYaw(piece) {
    const value = Number(piece.transform?.rotation?.[1]);
    return Number.isFinite(value) ? value : 0;
  }

  function finiteNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function isCutterPiece(piece) {
    const op = piece?.combine?.op;
    return op === 'subtract' || op === 'intersect';
  }

  function isTileSourcePiece(piece) {
    return piece && !piece.hidden && !piece.helper && !isCutterPiece(piece);
  }

  function selectedTileSourcePiece() {
    const state = store.getState();
    return state.document.pieces.find((piece) => piece.id === state.selectedPieceId && isTileSourcePiece(piece))
      ?? state.document.pieces.find(isTileSourcePiece)
      ?? null;
  }

  function piecePosition(piece) {
    const position = Array.isArray(piece.transform?.position) ? piece.transform.position : [0, 0, 0];
    return [
      Number(position[0]) || 0,
      Number(position[1]) || 0,
      Number(position[2]) || 0,
    ];
  }

  function outlinePlanarExtent(outline) {
    if (!Array.isArray(outline) || outline.length < 3) return 1;
    let extent = 0;
    for (const point of outline) {
      if (!Array.isArray(point)) continue;
      extent = Math.max(extent, Math.abs(Number(point[0]) || 0));
    }
    return Math.max(extent, 0.05);
  }

  function tileFootprintFromPiece(piece) {
    const shape = piece.shape ?? {};
    const type = shape.type ?? 'ellipsoid';
    const baseX = type === 'sketch'
      ? outlinePlanarExtent(piece.outline)
      : Math.max(finiteNumber(shape.sizeX, 1), 0.05);
    const baseZ = Math.max(finiteNumber(shape.sizeZ, baseX), 0.05);
    const scale = Array.isArray(piece.transform?.scale) ? piece.transform.scale : [1, 1, 1];
    const width = Math.max(baseX * 2 * finiteNumber(scale[0], 1), 0.1);
    const depth = Math.max(baseZ * 2 * finiteNumber(scale[2], 1), 0.1);
    return {
      centerX: 0,
      centerZ: 0,
      depth,
      step: [Math.max(width * 0.94, 0.35), Math.max(depth * 0.94, 0.35)],
      width,
    };
  }

  function worldToPieceLocalHorizontal(piece, vector) {
    const yaw = pieceYaw(piece);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return new THREE.Vector3(
      cos * vector.x - sin * vector.z,
      0,
      sin * vector.x + cos * vector.z,
    );
  }

  function rotateLocalOffset(piece, localX, localZ) {
    const yaw = pieceYaw(piece);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return [
      cos * localX + sin * localZ,
      -sin * localX + cos * localZ,
    ];
  }

  function tileFootprintFromHit(info) {
    const geometry = info.hit?.object?.geometry;
    if (!geometry) return tileFootprintFromPiece(info.piece);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return tileFootprintFromPiece(info.piece);
    const scale = Array.isArray(info.piece.transform?.scale) ? info.piece.transform.scale : [1, 1, 1];
    const sizeX = (box.max.x - box.min.x) * (Number(scale[0]) || 1);
    const sizeZ = (box.max.z - box.min.z) * (Number(scale[2]) || 1);
    const centerX = ((box.min.x + box.max.x) / 2) * (Number(scale[0]) || 1);
    const centerZ = ((box.min.z + box.max.z) / 2) * (Number(scale[2]) || 1);
    const width = Number.isFinite(sizeX) && sizeX > 0 ? sizeX : 1;
    const depth = Number.isFinite(sizeZ) && sizeZ > 0 ? sizeZ : 1;
    return {
      centerX: Number.isFinite(centerX) ? centerX : 0,
      centerZ: Number.isFinite(centerZ) ? centerZ : 0,
      depth,
      step: [Math.max(width * 0.94, 0.35), Math.max(depth * 0.94, 0.35)],
      width,
    };
  }

  function updateAdjacentFootprintPreview(info) {
    const footprint = info.footprint;
    if (!footprint) return;
    const direction = ADJACENT_DIRECTIONS[info.direction] ?? ADJACENT_DIRECTIONS.east;
    const position = Array.isArray(info.piece.transform?.position) ? info.piece.transform.position : [0, 0, 0];
    const [tileX, tileZ] = rotateLocalOffset(
      info.piece,
      direction.x * footprint.step[0],
      direction.z * footprint.step[1],
    );
    const [centerX, centerZ] = rotateLocalOffset(info.piece, footprint.centerX, footprint.centerZ);
    const center = engine.compositionGroup.localToWorld(new THREE.Vector3(
      (Number(position[0]) || 0) + tileX + centerX,
      0,
      (Number(position[2]) || 0) + tileZ + centerZ,
    ));
    center.y = ADJACENT_FOOTPRINT_GROUND_Y;
    adjacentPreview.position.copy(center);
    adjacentPreview.rotation.set(0, pieceYaw(info.piece), 0);
    adjacentPreview.visible = true;
    adjacentFootprint.scale.set(footprint.width, footprint.depth, 1);
    adjacentOutline.scale.set(footprint.width, 1, footprint.depth);
  }

  function hoveredAdjacentSide(hit) {
    if (!hit?.pieceId || !hit.point) return null;
    const piece = store.getState().document.pieces.find((entry) => entry.id === hit.pieceId);
    if (!piece) return null;

    let direction = null;
    if (hit.hit?.face?.normal && hit.hit?.object?.matrixWorld) {
      const worldNormal = hit.hit.face.normal.clone()
        .transformDirection(hit.hit.object.matrixWorld);
      worldNormal.y = 0;
      if (worldNormal.lengthSq() > 0.08) {
        direction = directionFromHorizontal(worldToPieceLocalHorizontal(piece, worldNormal.normalize()));
      }
    }
    if (!direction) {
      const documentPoint = engine.toDocumentSpace(hit.point);
      const center = piece.transform.position;
      direction = directionFromHorizontal(worldToPieceLocalHorizontal(piece, new THREE.Vector3(
        documentPoint.x - (Number(center?.[0]) || 0),
        0,
        documentPoint.z - (Number(center?.[2]) || 0),
      ))) ?? 'east';
    }
    return {
      direction,
      footprint: tileFootprintFromHit({ ...hit, piece }),
      piece,
      pieceId: hit.pieceId,
    };
  }

  function hoveredMergedAdjacentSide(hit) {
    if (!hit?.point) return null;
    const piece = selectedTileSourcePiece();
    if (!piece) return null;
    const documentPoint = engine.toDocumentSpace(hit.point);
    const center = piece.transform?.position ?? [0, 0, 0];
    const direction = directionFromHorizontal(worldToPieceLocalHorizontal(piece, new THREE.Vector3(
      documentPoint.x - (Number(center?.[0]) || 0),
      0,
      documentPoint.z - (Number(center?.[2]) || 0),
    ))) ?? 'east';
    return {
      direction,
      footprint: tileFootprintFromPiece(piece),
      piece,
      pieceId: piece.id,
    };
  }

  function hoveredFootprintAdjacentSide(event) {
    const piece = selectedTileSourcePiece();
    if (!piece) return null;
    const footprint = tileFootprintFromPiece(piece);
    const [pieceX, pieceY, pieceZ] = piecePosition(piece);
    const worldPlanePoint = engine.compositionGroup.localToWorld(new THREE.Vector3(pieceX, pieceY, pieceZ));
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -worldPlanePoint.y);
    const point = new THREE.Vector3();
    if (!engine.raycasterFor(event).ray.intersectPlane(groundPlane, point)) return null;
    const documentPoint = engine.toDocumentSpace(point);
    const local = worldToPieceLocalHorizontal(piece, new THREE.Vector3(
      documentPoint.x - pieceX,
      0,
      documentPoint.z - pieceZ,
    ));
    const reachX = (footprint.step[0] + footprint.width * 0.5) * ADJACENT_POINTER_REACH;
    const reachZ = (footprint.step[1] + footprint.depth * 0.5) * ADJACENT_POINTER_REACH;
    if (Math.abs(local.x) > reachX || Math.abs(local.z) > reachZ) return null;
    return {
      direction: directionFromHorizontal(local) ?? adjacentHover?.direction ?? 'east',
      footprint,
      piece,
      pieceId: piece.id,
    };
  }

  function hideAdjacentPreview() {
    adjacentHover = null;
    adjacentPreview.visible = false;
  }

  function updateAdjacentPreview(event) {
    if (!isAdjacent(activeTool())) return null;
    const info = (store.getState().mergePreview
      ? hoveredMergedAdjacentSide(engine.raycastRock(event))
      : hoveredAdjacentSide(engine.raycastPiece(event)))
      ?? hoveredFootprintAdjacentSide(event);
    if (!info) {
      hideAdjacentPreview();
      return null;
    }
    if (!info.footprint) {
      hideAdjacentPreview();
      return null;
    }
    updateAdjacentFootprintPreview(info);
    const changedHover = !adjacentHover
      || adjacentHover.pieceId !== info.pieceId
      || adjacentHover.direction !== info.direction;
    adjacentHover = {
      direction: info.direction, pieceId: info.pieceId, space: 'local', step: info.footprint.step,
    };
    if (changedHover) {
      store.actions.setStatus(
        `Click to add a ${ADJACENT_DIRECTION_LABELS[info.direction]} tile from "${info.piece.name}".`,
      );
    }
    return adjacentHover;
  }

  function addAdjacentFromHover(event) {
    const hover = updateAdjacentPreview(event);
    if (!hover) {
      store.actions.setStatus('Hover a side of a rock piece, then click to add a tile.');
      return;
    }
    store.actions.addAdjacentPiece(hover);
    hideAdjacentPreview();
  }

  // --- Filled paint strokes -------------------------------------------------

  function clearPreviewLine() {
    if (!previewLine) return;
    engine.scene.remove(previewLine);
    previewLine.geometry.dispose();
    previewLine.material.dispose();
    previewLine = null;
  }

  function clearPaintPreview() {
    if (!paintPreview) return;
    engine.scene.remove(paintPreview.group);
    paintPreview.geometry.dispose();
    paintPreview.material.dispose();
    paintPreview = null;
  }

  function stampPaintPreview(point) {
    if (!paintPreview) return;
    const disc = new THREE.Mesh(paintPreview.geometry, paintPreview.material);
    disc.position.copy(point);
    disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), paintPreview.normal);
    disc.renderOrder = 1001;
    paintPreview.group.add(disc);
  }

  function stampPaintPreviewTo(point) {
    if (!paintPreview) return;
    if (!paintPreview.last) {
      stampPaintPreview(point);
      paintPreview.last = point.clone();
      return;
    }
    const segment = point.clone().sub(paintPreview.last);
    const length = segment.length();
    if (length < 1e-6) return;
    segment.divideScalar(length);
    const spacing = paintPreview.radius * 0.45;
    for (let d = spacing; d <= length; d += spacing) {
      stampPaintPreview(paintPreview.last.clone().addScaledVector(segment, d));
    }
    stampPaintPreview(point);
    paintPreview.last.copy(point);
  }

  function beginPaintPreview(point, normal, tool) {
    clearPaintPreview();
    const { radius } = store.getState().brush;
    paintPreview = {
      geometry: new THREE.CircleGeometry(radius, 24),
      group: new THREE.Group(),
      last: null,
      material: new THREE.MeshBasicMaterial({
        color: SCULPT_COLORS[tool],
        depthTest: false,
        depthWrite: false,
        opacity: 0.48,
        side: THREE.DoubleSide,
        transparent: true,
      }),
      normal: normal.clone().normalize(),
      radius,
    };
    paintPreview.group.name = `${tool === 'sculptAdd' ? 'Build' : 'Carve'} filled stroke preview`;
    paintPreview.group.renderOrder = 1001;
    engine.scene.add(paintPreview.group);
    stampPaintPreviewTo(point);
  }

  function beginPaintStroke(event) {
    const tool = activeTool();
    const hit = engine.raycastRock(event);
    if (!hit) {
      store.actions.setStatus(`Start the ${tool === 'sculptAdd' ? 'build' : 'carve'} stroke on the rock surface.`);
      return;
    }
    cancelCursorUpdate();
    cursor.visible = false;
    element.setPointerCapture(event.pointerId);
    const normal = new THREE.Vector3();
    engine.camera.getWorldDirection(normal);
    normal.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
    paintStroke = {
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
      normal,
      plane,
      points: [hit.point.clone()],
      tool,
    };
    beginPaintPreview(hit.point, normal, tool);
    store.actions.setStatus(`Paint the area to ${tool === 'sculptAdd' ? 'build' : 'carve'}, then release.`);
  }

  function movePaintStroke(event, { force = false } = {}) {
    if (!paintStroke) return;
    const screen = new THREE.Vector2(event.clientX, event.clientY);
    if (!force && screen.distanceTo(paintStroke.lastScreen) < PAINT_STROKE_SCREEN_STEP) return;
    const raycaster = engine.raycasterFor(event);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(paintStroke.plane, point)) return;
    if (!force && point.distanceTo(paintStroke.points[paintStroke.points.length - 1])
      < Math.max(store.getState().brush.radius * 0.25, 0.04)) {
      return;
    }
    paintStroke.lastScreen.copy(screen);
    paintStroke.points.push(point);
    stampPaintPreviewTo(point);
  }

  function densifyPoints(points, step) {
    if (points.length < 2) return points.map((point) => point.clone());
    const dense = [points[0].clone()];
    for (let i = 1; i < points.length; i += 1) {
      const start = points[i - 1];
      const end = points[i];
      const distance = start.distanceTo(end);
      const count = Math.max(1, Math.ceil(distance / step));
      for (let j = 1; j <= count; j += 1) {
        dense.push(new THREE.Vector3().lerpVectors(start, end, j / count));
      }
    }
    return dense;
  }

  function throughCarveDepth() {
    const box = new THREE.Box3().setFromObject(engine.compositionGroup);
    const sceneSize = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
    return Math.max(sceneSize, THROUGH_CARVE_MIN_DEPTH) + store.getState().brush.radius * 4;
  }

  function buildFillDepth() {
    const { radius } = store.getState().brush;
    return Math.max(radius * BUILD_FILL_DEPTH_RADIUS, 0.32);
  }

  function paintStrokeEdits(points, normal, tool) {
    const { radius, strength } = store.getState().brush;
    const simplified = simplifyStroke(points, Math.max(0.02, radius * 0.18));
    const dense = densifyPoints(simplified, Math.max(radius * 0.55, 0.04));
    const subtracting = tool === 'sculptSubtract';
    const depth = subtracting ? throughCarveDepth() : buildFillDepth();
    return dense.map((point) => {
      const fromDistance = subtracting ? -depth : -depth * BUILD_FILL_OUTWARD_RATIO;
      const toDistance = subtracting ? depth : depth * (1 - BUILD_FILL_OUTWARD_RATIO);
      const from = engine.toDocumentSpace(point.clone().addScaledVector(normal, fromDistance));
      const to = engine.toDocumentSpace(point.clone().addScaledVector(normal, toDistance));
      return createStrokeEdit({
        blend: strength,
        from: [from.x, from.y, from.z],
        radius,
        to: [to.x, to.y, to.z],
        tool: subtracting ? 'subtract' : 'add',
      });
    });
  }

  function endPaintStroke() {
    if (!paintStroke) return;
    const { normal, points, tool } = paintStroke;
    paintStroke = null;
    clearPaintPreview();
    const edits = paintStrokeEdits(points, normal, tool);
    store.actions.applySculptStroke(edits, {
      label: tool === 'sculptAdd' ? 'Built painted area' : 'Carved painted area through',
    });
  }

  // --- Doodle ---------------------------------------------------------------

  function beginDoodle(event) {
    element.setPointerCapture(event.pointerId);
    // Camera-facing but vertical work plane through the composition center,
    // so the outline lands in the upright slice the user is looking at.
    const normal = new THREE.Vector3();
    engine.camera.getWorldDirection(normal);
    normal.y = 0;
    if (normal.lengthSq() < 1e-4) normal.set(0, 0, 1);
    normal.normalize();
    const center = new THREE.Vector3();
    engine.compositionGroup.getWorldPosition(center);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);

    const raycaster = engine.raycasterFor(event);
    const start = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, start)) return;

    doodleStroke = {
      lastScreen: new THREE.Vector2(event.clientX, event.clientY),
      normal,
      plane,
      points: [start],
    };
    previewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(doodleStroke.points),
      new THREE.LineBasicMaterial({
        color: DOODLE_COLOR, depthTest: false, opacity: 0.9, transparent: true,
      }),
    );
    previewLine.renderOrder = 999;
    engine.scene.add(previewLine);
  }

  function moveDoodle(event) {
    if (!doodleStroke) return;
    const screen = new THREE.Vector2(event.clientX, event.clientY);
    if (screen.distanceTo(doodleStroke.lastScreen) < 6) return;
    const raycaster = engine.raycasterFor(event);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(doodleStroke.plane, point)) return;
    if (point.distanceTo(doodleStroke.points[doodleStroke.points.length - 1]) < 0.04) return;
    doodleStroke.lastScreen.copy(screen);
    doodleStroke.points.push(point);
    previewLine.geometry.dispose();
    previewLine.geometry = new THREE.BufferGeometry().setFromPoints(
      // Live-close the loop so the user sees the rock they'll get.
      [...doodleStroke.points, doodleStroke.points[0]],
    );
  }

  function endDoodle() {
    if (!doodleStroke) return;
    const { normal, points } = doodleStroke;
    doodleStroke = null;
    clearPreviewLine();

    const span = points.reduce(
      (sum, point, index) => (index ? sum + point.distanceTo(points[index - 1]) : 0),
      0,
    );
    if (points.length < 3 || span < 0.3) {
      store.actions.setStatus('Doodle too small — draw the rock outline larger.');
      return;
    }
    const simplified = simplifyStroke(points, Math.max(0.02, span * 0.008));

    // Project onto the plane basis: u along the horizontal right vector,
    // v along world up. yaw aligns the piece's local XY plane back to it.
    const right = new THREE.Vector3(normal.z, 0, -normal.x);
    const yaw = Math.atan2(normal.x, normal.z);
    const documentPoints = simplified.map((point) => engine.toDocumentSpace(point));
    const outline = documentPoints.map((point) => [point.dot(right), point.y]);

    // Center the outline so the piece transform carries the placement.
    let cu = 0;
    let cv = 0;
    for (const [u, v] of outline) {
      cu += u / outline.length;
      cv += v / outline.length;
    }
    let radius = 0;
    const centered = outline.map(([u, v]) => {
      const point = [Number((u - cu).toFixed(4)), Number((v - cv).toFixed(4))];
      radius = Math.max(radius, Math.abs(point[0]), Math.abs(point[1]));
      return point;
    });
    if (radius < 0.05) {
      store.actions.setStatus('Doodle too small — draw the rock outline larger.');
      return;
    }

    // Document-space anchor of the outline centroid: the composition origin
    // plus the in-plane offset (the plane passes through the origin).
    const position = [
      right.x * cu + normal.x * 0,
      cv,
      right.z * cu + normal.z * 0,
    ];
    store.actions.addDoodlePiece({
      outline: centered, position, radius, yaw,
    });
  }

  // --- Pointer wiring ---------------------------------------------------------

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    rememberPointer(event);
    const tool = activeTool();
    if (isAdjacent(tool)) addAdjacentFromHover(event);
    else if (isSculpt(tool)) beginSculpt(event);
    else if (tool === 'doodle') beginDoodle(event);
    else if (tool === 'orbit') selectPiece(event);
  });
  element.addEventListener('pointerenter', (event) => {
    rememberPointer(event);
    updateAdjacentPreview(event);
    scheduleCursorUpdate(event);
  });
  element.addEventListener('pointermove', (event) => {
    rememberPointer(event);
    updateAdjacentPreview(event);
    scheduleCursorUpdate(event);
    if (paintStroke) movePaintStroke(event);
    else if (doodleStroke) moveDoodle(event);
  });
  element.addEventListener('pointerup', (event) => {
    if (paintStroke) movePaintStroke(event, { force: true });
    endPaintStroke();
    endDoodle();
  });
  element.addEventListener('pointerleave', () => {
    lastPointer = null;
    cancelCursorUpdate();
    cursor.visible = false;
    hideAdjacentPreview();
    endPaintStroke();
    endDoodle();
  });
}
