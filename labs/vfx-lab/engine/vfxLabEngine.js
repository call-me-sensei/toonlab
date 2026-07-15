// Three.js half of VFX Lab: the arena, a REAL weapon performing authored
// moves from the vfxgen move library (the VFX rides the actual swept path —
// what you tune here is what a game gets), the pooled vfx system rebuilt
// (debounced) when the designed settings change, and the optional auto loop
// that cycles every move. Camera, weapon, and actors survive rebuilds — only
// the vfx system is torn down, so tuning feels live.
//
// Automation contract (capture scripts assert these, do not rename):
//   document.body.dataset.vfxLabReady          — 'true' after the first frame
//   document.body.dataset.vfxLiveGlow/LivePuff/DrawCalls/Spawns — per frame
//   document.body.dataset.vfxMovePhase         — active move phase id or ''

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  createMoveController,
  createStylizedWeapon,
  createVfxSystem,
  MOVE_IDS,
  moveDuration,
  getMove,
} from '../../../src/vfxgen/index.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';

const REBUILD_DEBOUNCE_MS = 90;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function createVfxLabEngine({ mount, store }) {
  document.body.dataset.scene = 'vfx';
  document.body.dataset.vfxLabReady = 'false';

  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121722);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 4.2, 11);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.1, 0);
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 3;
  controls.maxDistance = 30;

  // Arena dressing.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x2a3242 }),
  );
  scene.add(floor);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x333d51 }),
  );
  inner.position.y = 0.005;
  scene.add(inner);
  const dummy = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 1.0, 4, 12),
    new THREE.MeshBasicMaterial({ color: 0x4a5670 }),
  );
  dummy.position.set(-2.4, 0.85, 0);
  scene.add(dummy);
  const runner = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x5a6a8a }),
  );
  runner.position.set(4.6, 0.2, 0);
  scene.add(runner);

  // The wielder: an actor anchor the weapon performs moves around. Moves are
  // authored facing −X, which points at the dummy from here.
  const actor = new THREE.Group();
  actor.position.set(1.4, 0, 0.2);
  scene.add(actor);

  let weapon = null;
  let weaponId = null;
  let attack = null;

  const disposeWeapon = () => {
    if (!weapon) return;
    weapon.root.traverse((node) => {
      if (node.isMesh) {
        node.geometry.dispose();
        node.material.dispose();
      }
    });
    actor.remove(weapon.root);
    weapon = null;
  };

  // --- vfx system lifecycle ----------------------------------------------------
  let vfx = null;
  const rebuiltListeners = new Set();

  const rebuildAttack = () => {
    attack?.stop();
    attack = weapon && vfx ? createMoveController({ groundY: 0, vfx, weapon }) : null;
  };

  const setWeapon = (type) => {
    if (type === weaponId && weapon) return;
    disposeWeapon();
    weapon = createStylizedWeapon({ type });
    weaponId = weapon.type;
    actor.add(weapon.root);
    rebuildAttack();
  };

  function buildSystem() {
    const state = store.getState();
    vfx?.dispose();
    vfx = createVfxSystem({
      heightAt: () => 0,
      preset: state.presetId,
      seed: state.seed,
      settings: state.overrides,
    });
    scene.add(vfx.root);
    rebuildAttack();
    for (const listener of [...rebuiltListeners]) listener();
  }

  let lastSignature = null;
  let rebuildTimer = null;
  function signatureOf(state) {
    return `${state.seed}|${state.presetId}|${JSON.stringify(state.overrides)}`;
  }
  store.subscribe(() => {
    const signature = signatureOf(store.getState());
    if (signature === lastSignature) return;
    lastSignature = signature;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(buildSystem, REBUILD_DEBOUNCE_MS);
  });

  // --- gameplay triggers ---------------------------------------------------------
  let clockTime = 0;
  let runnerActive = 0;
  let lastStep = -1;

  const api = {
    onRebuilt(listener) {
      rebuiltListeners.add(listener);
      return () => rebuiltListeners.delete(listener);
    },
    get system() { return vfx; },
    get weaponId() { return weaponId; },
    setWeapon,
    /** Plays a weapon move by id, or fires a non-weapon effect. */
    trigger(type) {
      if (!vfx) return;
      if (MOVE_IDS.includes(type)) {
        attack?.play(type);
        return;
      }
      switch (type) {
        case 'fireball':
          vfx.spawn('fireball', {
            from: [4.5, 1.6, -3.5],
            gravity: 4.5,
            velocity: [-4.2, 3.2, 2.6],
          });
          break;
        case 'footstep':
          runnerActive = 2.2;
          break;
        case 'landing':
          vfx.spawn('landing', { at: [runner.position.x, 0, runner.position.z], power: 1.5 });
          break;
        default:
          break;
      }
    },
    /** Click-to-aim fireball at an arena point (NDC from the canvas). */
    throwAt(ndcX, ndcY) {
      if (!vfx) return;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const target = new THREE.Vector3();
      if (!ray.ray.intersectPlane(GROUND, target)) return;
      vfx.spawn('fireball', {
        from: [camera.position.x, 1.8, camera.position.z - 2],
        gravity: 6,
        velocity: [
          (target.x - camera.position.x) * 0.9,
          3.4,
          (target.z - camera.position.z + 2) * 0.9,
        ],
      });
    },
  };

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const onUp = (up) => {
      renderer.domElement.removeEventListener('pointerup', onUp);
      if (Math.hypot(up.clientX - startX, up.clientY - startY) > 6) return;
      api.throwAt(
        (up.clientX / window.innerWidth) * 2 - 1,
        -(up.clientY / window.innerHeight) * 2 + 1,
      );
    };
    renderer.domElement.addEventListener('pointerup', onUp);
  });

  // --- auto loop: cycle every move with breathing room between ------------------
  let loopMoveIndex = 0;
  let nextMoveAt = 0.8;
  let lastBolt = -1;

  function runLoop(t) {
    if (!attack?.playing && t >= nextMoveAt) {
      const moveId = MOVE_IDS[loopMoveIndex % MOVE_IDS.length];
      loopMoveIndex += 1;
      attack?.play(moveId);
      nextMoveAt = t + moveDuration(getMove(moveId), weapon?.profile?.weight ?? 1) + 0.7;
    }
    const boltId = Math.floor(t / 3.2);
    if (boltId !== lastBolt) {
      lastBolt = boltId;
      const side = boltId % 2 === 0 ? 1 : -1;
      vfx.spawn('fireball', {
        from: [4.8 * side, 1.6, -3.8],
        gravity: 4.5,
        velocity: [-4.0 * side, 3.2, 2.8],
      });
    }
    runnerActive = 0.5;
  }

  function updateRunner(t, delta) {
    if (runnerActive <= 0) return;
    runnerActive -= delta;
    const lapT = t * 0.55;
    runner.position.set(Math.cos(lapT) * 4.6, 0.2, Math.sin(lapT) * 4.6);
    const stepId = Math.floor(t / 0.22);
    if (stepId !== lastStep) {
      lastStep = stepId;
      vfx.spawn('footstep', {
        at: [runner.position.x, 0, runner.position.z],
        dir: [-Math.sin(lapT), 0, Math.cos(lapT)],
      });
    }
  }

  // --- loop ------------------------------------------------------------------------
  const clock = new THREE.Clock();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  async function start() {
    await whenRendererReady(renderer);
    lastSignature = signatureOf(store.getState());
    setWeapon(new URLSearchParams(window.location.search).get('weapon') || 'sword');
    buildSystem();
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.1);
      clockTime += delta;
      controls.update();
      if (vfx) {
        if (store.getState().loop) runLoop(clockTime);
        attack?.update(delta);
        updateRunner(clockTime, delta);
        vfx.update(delta, camera);
      }
      renderer.render(scene, camera);
      if (vfx) {
        const stats = vfx.stats;
        document.body.dataset.vfxLabReady = 'true';
        document.body.dataset.vfxLiveGlow = String(stats.live.glow);
        document.body.dataset.vfxLivePuff = String(stats.live.puff);
        document.body.dataset.vfxDrawCalls = String(stats.drawCalls);
        document.body.dataset.vfxSpawns = String(stats.spawnsTotal);
        document.body.dataset.vfxMovePhase = attack?.playing ? attack.phase : '';
      }
    });
  }

  return { ...api, camera, renderer, scene, start };
}
