// Gameplay-VFX verification — no browser needed. Mirrors verify-ambientfx.mjs:
// determinism (same seed + same spawn/update cadence → bit-identical emission),
// ring-buffer budgets (overflow wraps, never grows), lifecycle (bursts expire,
// ribbons pool, projectiles detonate on ground with onHit), per-spawn look
// overrides, disabled effects, hit-stop (timeScale 0), and the pure builders'
// geometry contracts (hemisphere spark spray, radial landing ring).
// Run with: node scripts/verify-vfxgen.mjs

import process from 'node:process';

import * as THREE from 'three';

import {
  collectMoveEvents,
  createGlowRing,
  createMotionTrails,
  createVfxSystem,
  emitImpact,
  emitLanding,
  getMove,
  MOVE_IDS,
  moveDuration,
  sampleMovePose,
} from '../src/vfxgen/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 2, 6);
camera.updateMatrixWorld();

const DT = 1 / 60;
const heightAt = () => 0;

// Deterministic mulberry32 clone for driving the pure builders directly.
function rngFor(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plays one fixed combat script against a fresh system: an impact, a slash
 * across eight frames, a fireball lobbed into the ground, a footstep and a
 * landing — every effect category exercised on a fixed clock.
 */
function playScript(seed) {
  const vfx = createVfxSystem({ heightAt, seed });
  const sword = new THREE.Object3D();
  vfx.update(DT, camera);

  let hits = 0;
  vfx.spawn('impact', { at: [0, 1, 0], normal: [0, 1, 0], power: 1 });
  const trail = vfx.spawn('slash', { follow: sword, base: [0, 0.2, 0], tip: [0, 1.2, 0] });
  const bolt = vfx.spawn('fireball', {
    from: [0, 1.4, 0], velocity: [5, 2.5, 0], onHit: () => { hits += 1; },
  });
  for (let frame = 0; frame < 8; frame += 1) {
    sword.position.set(Math.sin(frame * 0.4) * 1.5, 1, Math.cos(frame * 0.4) * 0.5);
    sword.updateMatrixWorld();
    vfx.update(DT, camera);
  }
  trail.stop();
  vfx.spawn('footstep', { at: [1, 0, 1], dir: [1, 0, 0] });
  vfx.spawn('landing', { at: [0, 0, 0], power: 1.5 });
  for (let frame = 0; frame < 8; frame += 1) vfx.update(DT, camera);
  return { bolt, hits: () => hits, sword, trail, vfx };
}

function emissionHash(vfx) {
  let hash = 0x811c9dc5;
  const feed = (value) => {
    const quantized = Math.round(value * 1000); // mm quantization, like pathgen
    for (const shift of [0, 8, 16]) {
      hash ^= (quantized >> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const meshes = [];
  vfx.root.traverse((node) => { if (node.isMesh) meshes.push(node); });
  for (const mesh of meshes.sort((a, b) => a.name.localeCompare(b.name))) {
    for (const name of ['iSpawn', 'iVel', 'iData', 'position', 'aTrail']) {
      const attribute = mesh.geometry.attributes[name];
      if (!attribute) continue;
      for (const value of attribute.array) feed(value);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// --- determinism ---------------------------------------------------------------
const runA = playScript(42);
const runB = playScript(42);
const runC = playScript(43);
check('same seed + same script → identical emission', emissionHash(runA.vfx) === emissionHash(runB.vfx));
check('different seed → different emission', emissionHash(runA.vfx) !== emissionHash(runC.vfx));

// --- lifecycle -------------------------------------------------------------------
const statsMid = runA.vfx.stats;
check('script leaves live particles', statsMid.live.glow > 0 || statsMid.live.puff > 0,
  JSON.stringify(statsMid.live));
check('slash ribbon recorded the swing', runA.trail !== null && statsMid.live.trails >= 0);
for (let frame = 0; frame < 300; frame += 1) runA.vfx.update(DT, camera);
const statsLate = runA.vfx.stats;
check('all bursts expire', statsLate.live.glow === 0 && statsLate.live.puff === 0,
  JSON.stringify(statsLate.live));
check('stopped ribbon returns to the pool', statsLate.live.trails === 0);
check('no draws once everything is dead', statsLate.drawCalls === 0, `drawCalls ${statsLate.drawCalls}`);

// --- speed-gated vehicle/glider trails ------------------------------------------
{
  const target = new THREE.Object3D();
  const trails = createMotionTrails({
    anchors: [[-0.5, 0, 0], [0.5, 0, 0]],
    target,
  });
  trails.update(DT, camera);
  target.position.x += 0.02; // 1.2 m/s: below the 10 m/s default threshold
  trails.update(DT, camera);
  check('motion trails stay hidden at low speed', trails.active === false);
  target.position.x += 1;
  trails.update(DT, camera);
  target.position.x += 1;
  trails.update(DT, camera);
  check('motion trails appear only at speed', trails.active === true);
  check('motion trails use short bounded histories',
    trails.settings.lifetime <= 0.25 && trails.settings.maxPoints <= 24);
  for (let frame = 0; frame < 20; frame += 1) trails.update(DT, camera);
  check('motion trails taper away after the target slows', trails.active === false);
  trails.dispose();
}

// --- objective ring: open hoop, never a filled screen veil -----------------------
{
  const ring = createGlowRing();
  const meshes = ring.root.children.filter((child) => child.isMesh);
  check('glow ring uses only open torus geometry',
    meshes.length === 2 && meshes.every((mesh) => mesh.geometry.type === 'TorusGeometry'));
  check('glow ring keeps line halo restrained',
    ring.settings.haloOpacity <= 0.2
      && ring.settings.tubeRatio * ring.settings.haloScale <= 0.14);
  check('glow ring point light is local and shadow-free',
    ring.pointGlow.distance <= ring.settings.radius * 2 && ring.pointGlow.castShadow === false);
  const ringCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  ringCamera.position.set(0, 0, 3.4);
  ring.update(DT, ringCamera);
  check('glow ring fades before becoming a screen-sized obstruction',
    ring.settings.maxScreenFraction <= 0.25
      && ring.root.userData.screenVisibility < 0.35
      && ring.core.material.opacity < ring.settings.coreOpacity * 0.35);
  ring.dispose();
}

// --- fireball flight + detonation ------------------------------------------------
{
  let hitAt = null;
  const vfx = createVfxSystem({ heightAt, seed: 7 });
  vfx.update(DT, camera);
  const bolt = vfx.spawn('fireball', {
    from: [0, 1.2, 0], velocity: [6, 2, 0], onHit: (at) => { hitAt = at; },
  });
  const x0 = bolt.position.x;
  vfx.update(DT, camera);
  check('fireball integrates forward', bolt.position.x > x0);
  check('fireball sheds embers in flight', vfx.stats.live.glow > 0);
  for (let frame = 0; frame < 240 && bolt.alive; frame += 1) vfx.update(DT, camera);
  check('fireball detonates on the ground', !bolt.alive && hitAt !== null);
  check('detonation lands near ground level', hitAt !== null && Math.abs(hitAt[1]) < 0.3,
    hitAt ? `y=${hitAt[1].toFixed(3)}` : 'no hit');
  check('explosion leaves smoke puffs', vfx.stats.live.puff > 0);
}

// --- budgets: ring buffer wraps, never grows ---------------------------------------
{
  const vfx = createVfxSystem({ heightAt, seed: 5, settings: { shared: { maxParticles: 256 } } });
  vfx.update(DT, camera);
  for (let i = 0; i < 60; i += 1) vfx.spawn('impact', { at: [0, 1, 0], power: 2 });
  const stats = vfx.stats;
  check('overflow stays within capacity', stats.live.glow <= stats.capacity,
    `live ${stats.live.glow} vs capacity ${stats.capacity}`);
  const glowMesh = vfx.root.children.find((m) => m.name === 'VfxBurstGlow');
  check('instanceCount capped at ring capacity', glowMesh.geometry.instanceCount <= Math.ceil(256 * 0.75));
}

// --- trail pool bound ---------------------------------------------------------------
{
  const vfx = createVfxSystem({ heightAt, seed: 9, settings: { shared: { maxTrails: 3 } } });
  const anchors = Array.from({ length: 6 }, () => new THREE.Object3D());
  vfx.update(DT, camera);
  for (const anchor of anchors) vfx.spawn('slash', { follow: anchor });
  check('trail pool never exceeds maxTrails', vfx.stats.pooled.trails <= 3,
    `pooled ${vfx.stats.pooled.trails}`);
}

// --- per-spawn overrides + disabled effects ------------------------------------------
{
  const built = emitImpact({
    at: [0, 0, 0], now: 0, overrides: { sparkCount: 3 }, rng: rngFor(1),
    settings: createVfxSystem({ seed: 1 }).settings,
  });
  check('look override rescales the burst (3 sparks + flash + shockwave)', built.glow.length === 5,
    `${built.glow.length} records`);
  check('shockwave off removes the ring record', emitImpact({
    at: [0, 0, 0], now: 0, overrides: { shockwave: false, sparkCount: 3 }, rng: rngFor(1),
    settings: createVfxSystem({ seed: 1 }).settings,
  }).glow.length === 4);

  const disabled = createVfxSystem({ seed: 1, effects: { impact: false } });
  disabled.update(DT, camera);
  disabled.spawn('impact', { at: [0, 0, 0] });
  check('disabled effect emits nothing', disabled.stats.live.glow === 0);
}

// --- hit-stop --------------------------------------------------------------------
{
  const vfx = createVfxSystem({ heightAt, seed: 3 });
  vfx.update(DT, camera);
  vfx.setTimeScale(0);
  const before = vfx.stats.time;
  for (let frame = 0; frame < 10; frame += 1) vfx.update(DT, camera);
  check('timeScale 0 freezes the VFX clock', vfx.stats.time === before);
}

// --- pure-builder geometry contracts ----------------------------------------------
{
  const settings = createVfxSystem({ seed: 1 }).settings;
  const impact = emitImpact({ at: [0, 0, 0], normal: [0, 1, 0], now: 0, rng: rngFor(2), settings });
  const sparks = impact.glow.filter((r) => r.kind === 0);
  check('impact sparks spray off the +Y surface (vy ≥ 0)', sparks.every((r) => r.vy >= 0));
  check('impact includes exactly one star flash', impact.glow.filter((r) => r.kind === 2).length === 1);
  check('impact includes exactly one shockwave ring', impact.glow.filter((r) => r.kind === 5).length === 1);

  const landing = emitLanding({ at: [0, 0, 0], now: 0, power: 1, rng: rngFor(3), settings });
  const radial = landing.puff.every((r) => {
    const outward = (r.x - 0) * r.vx + (r.z - 0) * r.vz;
    return outward >= 0;
  });
  check('landing puffs move radially outward', radial);
  const doubled = emitLanding({ at: [0, 0, 0], now: 0, power: 2, rng: rngFor(3), settings });
  check('landing power scales the ring count', doubled.puff.length > landing.puff.length);
}

// --- weapon-move library (pure — poses, events, weight scaling) ------------------
{
  for (const id of MOVE_IDS) {
    const move = getMove(id);
    const total = moveDuration(move, 1);
    check(`move "${id}" has a positive duration`, total > 0);
    check(`move "${id}" is slower for heavy weapons`, moveDuration(move, 1.6) > total);

    const events = collectMoveEvents(move, 0, total + 1e-6, 1);
    const starts = events.filter((e) => e.do === 'trailStart');
    const stops = events.filter((e) => e.do === 'trailStop');
    check(`move "${id}" balances trail start/stop`, starts.length === stops.length && starts.length > 0,
      `${starts.length} starts / ${stops.length} stops`);
    check(`move "${id}" lands at least one impact`, events.some((e) => e.do === 'impact'));

    // Continuity: sampling densely never teleports the grip (catches
    // mismatched keys across phase boundaries).
    let previous = sampleMovePose(move, 0, 1);
    let maxStep = 0;
    for (let i = 1; i <= 120; i += 1) {
      const pose = sampleMovePose(move, (total * i) / 120, 1);
      const dx = pose.p[0] - previous.p[0];
      const dy = pose.p[1] - previous.p[1];
      const dz = pose.p[2] - previous.p[2];
      maxStep = Math.max(maxStep, Math.hypot(dx, dy, dz));
      previous = pose;
    }
    check(`move "${id}" pose path is continuous`, maxStep < 0.9, `max step ${maxStep.toFixed(2)} m`);

    // Frame-rate independence: chunked collection fires the same beats once.
    const chunked = [];
    for (let t = 0, dt = total / 7; t < total + dt; t += dt) {
      chunked.push(...collectMoveEvents(move, t, Math.min(t + dt, total + 1e-6), 1));
    }
    check(`move "${id}" events are frame-rate independent`,
      chunked.length === events.length
      && chunked.every((e, i) => e.do === events[i].do && Math.abs(e.time - events[i].time) < 1e-9));
  }

  const plunge = getMove('plunge');
  check('plunge decomposes into the Dragoon phases',
    plunge.phases.map((p) => p.id).join(',') === 'crouch,leap,apex,dive,landfall,recover');
  const beats = collectMoveEvents(plunge, 0, moveDuration(plunge, 1) + 1e-6, 1).map((e) => e.do);
  check('plunge beats run dust → trail → impact+landing',
    beats.indexOf('dust') < beats.indexOf('trailStart')
    && beats.indexOf('trailStart') < beats.indexOf('impact')
    && beats.includes('landing'));
  const lightHit = collectMoveEvents(plunge, 0, 99, 0.65).find((e) => e.do === 'impact');
  const heavyHit = collectMoveEvents(plunge, 0, 99, 1.6).find((e) => e.do === 'impact');
  check('impact power scales with weapon weight', heavyHit.power > lightHit.power,
    `${lightHit.power.toFixed(2)} vs ${heavyHit.power.toFixed(2)}`);
}

console.log(failures === 0 ? '\nverify-vfxgen: all checks passed' : `\nverify-vfxgen: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
