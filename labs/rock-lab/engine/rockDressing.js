// Rock Lab scene dressing: Tree Lab's grass meadow, 1.8m
// mannequin scale reference, and keyboard walk preview, adapted to rocks.
// Walker collision samples the final-visible merged rock SDF, so subtractive
// openings remain walkable and hidden construction helpers never block the
// path. Scene furniture only, never document data or exports.
//
// Grass is session-only scene dressing. It defaults off for editor
// performance and can be enabled from the Environment menu.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { compileDocument, evaluateField, isRockHelperPiece } from '../../../src/rockgen/index.js';
import { createWalkPreviewActions, installWalkPreviewController } from '../../shared/walkPreview.js';
import { StylizedGrassField } from '../../../src/vegetation/index.js';

const WALKER_COLLISION_SAMPLES = Object.freeze([
  { height: 0.38, radius: 0.26 },
  { height: 0.95, radius: 0.28 },
]);
const COLLISION_EPSILON = 0.04;
const COLLISION_ITERATIONS = 3;
const COLLISION_SLOP = 0.015;
const BLADES_PER_CLUMP = 9;
const MEADOW_RADIUS = 26; // inside the 30m ground disc, fading first

export function createRockDressing({ engine, store }) {
  const { camera, controls, scene } = engine;

  // --- Grass meadow ----------------------------------------------------------
  let grass = null;
  let grassFrameUnsubscribe = null;
  let lastGrassBlades = -1;
  let pendingGrassSettings = {};

  const grassHandle = {
    applySettings(settings) {
      pendingGrassSettings = { ...pendingGrassSettings, ...settings };
      grass?.applySettings(settings);
      return this;
    },
  };

  function createGrass(bladeBudget) {
    const placements = new Array(bladeBudget);
    let filled = 0;
    while (filled < bladeBudget) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * MEADOW_RADIUS * (0.75 + Math.random() * 0.25);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const clumpSpread = 0.35 + Math.random() * 0.5;
      for (let i = 0; i < BLADES_PER_CLUMP && filled < bladeBudget; i += 1) {
        placements[filled] = {
          x: cx + (Math.random() - 0.5) * clumpSpread,
          y: 0,
          z: cz + (Math.random() - 0.5) * clumpSpread,
        };
        filled += 1;
      }
    }
    const field = new StylizedGrassField({ placements });
    field.material.uniforms.uFadeStart.value = MEADOW_RADIUS * 0.8;
    field.material.uniforms.uFadeEnd.value = MEADOW_RADIUS;
    field.applySettings(pendingGrassSettings);
    scene.add(field);
    grassFrameUnsubscribe = engine.onFrame((delta) => field.update(delta));
    return field;
  }

  function disposeGrass() {
    grassFrameUnsubscribe?.();
    grassFrameUnsubscribe = null;
    if (!grass) return;
    scene.remove(grass);
    grass.dispose();
    grass = null;
  }

  function syncGrass() {
    const bladeBudget = store.getState().grassBlades;
    if (bladeBudget === lastGrassBlades) return;
    lastGrassBlades = bladeBudget;
    disposeGrass();
    if (bladeBudget > 0) {
      grass = createGrass(bladeBudget);
      if (mannequin) grass.setPushTarget(mannequin);
    }
  }

  // --- Mannequin + walk preview ---------------------------------------------
  let mannequin = null;
  let loading = false;
  let mixer = null;
  let walkActions = null;
  let lastWalkPreview = false;
  let walkController = null;

  function loadMannequin() {
    if (mannequin || loading) return;
    loading = true;
    new GLTFLoader().load('/characters/mannequin.glb', (gltf) => {
      mannequin = gltf.scene;
      mannequin.name = 'Scale mannequin';
      mannequin.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      resetMannequinStart();
      mannequin.visible = Boolean(store.getState().mannequin);
      scene.add(mannequin);
      // Real locomotion, never a T-pose: shared native idle/walk/run/jump
      // action setup, matching the controller lab's clip names.
      mixer = new THREE.AnimationMixer(mannequin);
      walkActions = createWalkPreviewActions({ clips: gltf.animations, mixer });
      // Blades part around the walker.
      grass?.setPushTarget(mannequin);
      loading = false;
    }, undefined, (error) => {
      loading = false;
      console.warn('Mannequin failed to load:', error);
      store.actions.setStatus('Mannequin model not available in this checkout.');
    });
  }

  engine.onFrame((delta) => {
    if (mannequin?.visible) mixer?.update(delta);
  });
  engine.registerDynamicShadowCaster(() => Boolean(mannequin?.visible));

  store.subscribe(() => {
    const { mannequin: wanted, walkPreview } = store.getState();
    syncGrass();
    if ((wanted || walkPreview) && !mannequin) loadMannequin();
    if (mannequin && walkPreview && !lastWalkPreview) resetMannequinStart();
    lastWalkPreview = Boolean(walkPreview);
    if (mannequin) mannequin.visible = Boolean(wanted || walkPreview);
  });
  syncGrass();

  function distanceAt(program, x, y, z) {
    const point = engine.toDocumentSpace(new THREE.Vector3(x, y, z));
    return evaluateField(program, point.x, point.y, point.z);
  }

  function hasCollisionField(doc) {
    return doc.pieces.some((piece) => !piece.hidden && !isRockHelperPiece(piece));
  }

  function clearanceAt(program, position) {
    let clearance = Infinity;
    for (const { height, radius } of WALKER_COLLISION_SAMPLES) {
      const distance = distanceAt(program, position.x, position.y + height, position.z);
      clearance = Math.min(clearance, distance - radius);
    }
    return clearance;
  }

  function fallbackSpawnPosition(box) {
    if (box.isEmpty()) return new THREE.Vector3(2, 0, 2);
    return new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      0,
      box.max.z + 1.2,
    );
  }

  function walkerSpawnPosition() {
    const box = new THREE.Box3().setFromObject(engine.compositionGroup);
    const fallback = fallbackSpawnPosition(box);
    const doc = store.getState().document;
    if (box.isEmpty() || !hasCollisionField(doc)) return fallback;

    const program = compileDocument(doc, { includeHelpers: false });
    const minX = box.min.x - 0.35;
    const maxX = box.max.x + 0.35;
    const frontZ = box.max.z + 1.2;
    const backZ = box.min.z - 0.6;
    let best = { score: -Infinity, x: fallback.x };
    for (let i = 0; i <= 48; i += 1) {
      const x = minX + (maxX - minX) * (i / 48);
      let score = Infinity;
      for (let j = 0; j <= 32; j += 1) {
        const z = frontZ + (backZ - frontZ) * (j / 32);
        score = Math.min(score, clearanceAt(program, new THREE.Vector3(x, 0, z)));
      }
      if (score > best.score) best = { score, x };
    }
    return new THREE.Vector3(best.x, 0, frontZ);
  }

  function resetMannequinStart() {
    if (!mannequin) return;
    mannequin.position.copy(walkerSpawnPosition());
    mannequin.rotation.set(0, 0, 0);
    walkController?.resetJump(mannequin);
  }

  function resolveRockCollision(program, nextPosition) {
    for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration += 1) {
      let moved = false;
      for (const { height, radius } of WALKER_COLLISION_SAMPLES) {
        const y = nextPosition.y + height;
        const distance = distanceAt(program, nextPosition.x, y, nextPosition.z);
        if (distance >= radius) continue;

        const dx = distanceAt(program, nextPosition.x + COLLISION_EPSILON, y, nextPosition.z)
          - distanceAt(program, nextPosition.x - COLLISION_EPSILON, y, nextPosition.z);
        const dz = distanceAt(program, nextPosition.x, y, nextPosition.z + COLLISION_EPSILON)
          - distanceAt(program, nextPosition.x, y, nextPosition.z - COLLISION_EPSILON);
        const length = Math.hypot(dx, dz);
        if (length < 1e-5) continue;

        const push = (radius - distance) / length;
        nextPosition.x += dx * push;
        nextPosition.z += dz * push;
        moved = true;
      }
      if (!moved) return true;
    }
    return clearanceAt(program, nextPosition) >= -COLLISION_SLOP;
  }

  function moveWithCollision(delta) {
    const doc = store.getState().document;
    if (!hasCollisionField(doc)) {
      mannequin.position.add(delta);
      return;
    }
    const program = compileDocument(doc, { includeHelpers: false });
    const start = mannequin.position.clone();
    const attempt = (base, step) => {
      const candidate = base.clone().add(step);
      const clear = resolveRockCollision(program, candidate);
      return clear ? candidate : null;
    };

    const fullMove = attempt(start, delta);
    if (fullMove) {
      mannequin.position.copy(fullMove);
      return;
    }

    const axisSteps = Math.abs(delta.x) >= Math.abs(delta.z)
      ? [new THREE.Vector3(delta.x, 0, 0), new THREE.Vector3(0, 0, delta.z)]
      : [new THREE.Vector3(0, 0, delta.z), new THREE.Vector3(delta.x, 0, 0)];
    const next = start.clone();
    for (const step of axisSteps) {
      if (step.lengthSq() < 1e-10) continue;
      const axisMove = attempt(next, step);
      if (axisMove) next.copy(axisMove);
    }
    mannequin.position.copy(next);
  }

  walkController = installWalkPreviewController({
    camera,
    controls,
    engine,
    getActions: () => walkActions,
    getEnabled: () => store.getState().walkPreview,
    getWalker: () => mannequin,
    moveHorizontal: moveWithCollision,
  });

  return { grass: grassHandle };
}
