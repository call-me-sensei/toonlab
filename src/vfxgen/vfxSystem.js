// The gameplay-VFX layer. Import from '@call-me-sensei/toonlab/vfxgen'.
//
//   const vfx = createVfxSystem({ seed, preset: 'call_me_sensei', heightAt });
//   scene.add(vfx.root);
//   vfx.update(delta, camera);                          // each frame
//
//   // weapon
//   const trail = vfx.spawn('slash', { follow: sword, base: [0, 0, 0], tip: [0, 1.1, 0] });
//   trail.stop();                                       // arc fades out, ribbon pools
//   vfx.spawn('impact', { at: [x, y, z], normal: [0, 1, 0], power: 1 });
//
//   // magic
//   const bolt = vfx.spawn('fireball', { from: [x, y, z], velocity: [6, 3, 0],
//     onHit: (at) => damage(at) });
//   bolt.explode();                                     // or auto on ground/lifetime
//
//   // movement
//   vfx.spawn('footstep', { at, dir: velocity });
//   vfx.spawn('landing', { at, power: 1.5 });
//
//   vfx.setDistanceFog({ color, density, falloff, floorY });  // height-fog layer
//
// Unlike ambientfx (a steady follow-window), everything here is EVENT-DRIVEN
// and pooled: one-shot bursts write into the two-draw-call ring-buffer
// backbone (zero CPU after the spawn write), slash ribbons and fireball
// cores come from small mesh pools bounded by shared.maxTrails /
// maxProjectiles. Per-spawn `look` overrides re-tint any effect without
// touching settings. Fully seeded: same seed + same spawn sequence + same
// update cadence → bit-identical emission (what verify-vfxgen.mjs asserts).

import * as THREE from 'three';

import { createVfxSettings, VFX_EFFECT_IDS } from './vfxSettings.js';
import { resolveVfxPreset } from './vfxPresets.js';
import { createBurstBackbone } from './core/burstBackbone.js';
import { createTrailRibbon } from './core/trailRibbon.js';
import { createProjectileCore } from './core/projectileCore.js';
import { hashCombine, mulberry32 } from './core/vfxRandom.js';
import { emitImpact, emitSlashSparkle } from './effects/weaponEffects.js';
import { emitFireballEmbers, emitFireballExplosion } from './effects/magicEffects.js';
import { emitFootstep, emitLanding } from './effects/movementEffects.js';

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeGroupOverrides(...layers) {
  const merged = {};
  for (const layer of layers) {
    for (const [group, values] of Object.entries(cleanObject(layer))) {
      merged[group] = { ...merged[group], ...cleanObject(values) };
    }
  }
  return merged;
}

function toArray3(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value)) return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
  if (value?.isVector3) return [value.x, value.y, value.z];
  return [...fallback];
}

export function createVfxSystem({
  seed = 1,
  preset = null,
  settings = {},
  effects = {},
  heightAt = null,
} = {}) {
  const worldSeed = Math.max(1, Math.round(Number(seed) || 1)) >>> 0;

  // Per-effect overrides from `effects` (same idiom as ambientfx): `false`
  // disables, an object layers over preset + settings.
  const effectOverrides = {};
  for (const id of VFX_EFFECT_IDS) {
    const raw = effects?.[id];
    if (raw === false) effectOverrides[id] = { enabled: false };
    else if (raw === true) effectOverrides[id] = { enabled: true };
    else if (raw && typeof raw === 'object') effectOverrides[id] = { enabled: true, ...raw };
  }
  const resolved = createVfxSettings(
    mergeGroupOverrides(resolveVfxPreset(preset), settings, effectOverrides));

  const backbone = createBurstBackbone(resolved);
  const u = backbone.uniforms;
  const root = new THREE.Group();
  root.name = 'StylizedVfx';
  for (const group of Object.values(backbone.groups)) root.add(group.mesh);
  // Gameplay flashes are transient — keep them out of the water scene passes
  // (a half-second spark shower isn't worth re-rendering three water grabs).
  for (const group of Object.values(backbone.groups)) group.mesh.userData.waterExclude = true;

  // --- pools -----------------------------------------------------------------
  const trailPool = [];
  const projectilePool = [];
  const liveTrails = [];
  const liveProjectiles = [];

  const acquireTrail = () => {
    const free = trailPool.find((r) => !r.active && r.isDead(time));
    if (free) return free;
    if (trailPool.length < resolved.shared.maxTrails) {
      const ribbon = createTrailRibbon({
        segments: resolved.slash.segments,
        sharedUniforms: u,
      });
      ribbon.mesh.userData.waterExclude = true;
      trailPool.push(ribbon);
      root.add(ribbon.mesh);
      return ribbon;
    }
    // Pool exhausted: steal the oldest live ribbon (combat > correctness).
    const oldest = liveTrails.shift();
    if (oldest) oldest.ribbon.reset();
    return oldest?.ribbon ?? trailPool[0];
  };

  const acquireProjectile = () => {
    const free = projectilePool.find((core) => !core.mesh.visible);
    if (free) return free;
    if (projectilePool.length < resolved.shared.maxProjectiles) {
      const core = createProjectileCore({ sharedUniforms: u });
      core.mesh.userData.waterExclude = true;
      projectilePool.push(core);
      root.add(core.mesh);
      return core;
    }
    const oldest = liveProjectiles.shift();
    if (oldest) oldest.finish(false);
    return oldest?.core ?? projectilePool[0];
  };

  // --- clock + determinism -----------------------------------------------------
  let time = 0;
  let spawnCounter = 0;
  let spawnsTotal = 0;
  const nextRng = () => {
    spawnCounter += 1;
    return mulberry32(hashCombine(worldSeed, spawnCounter));
  };

  const emitRecords = ({ glow = [], puff = [] }) => {
    if (glow.length > 0) backbone.groups.glow.emit(glow);
    if (puff.length > 0) backbone.groups.puff.emit(puff);
    return glow.length + puff.length;
  };

  // --- effect spawners, by category -------------------------------------------

  const spawnSlash = (options, rng) => {
    if (!resolved.slash.enabled) return null;
    const ribbon = acquireTrail();
    const look = cleanObject(options.look);
    ribbon.begin({
      base: toArray3(options.base, [0, 0, 0]),
      bands: look.bands ?? resolved.slash.bands,
      color: look.color ?? resolved.slash.color,
      coreColor: look.coreColor ?? resolved.slash.coreColor,
      follow: options.follow,
      intensity: look.intensity ?? resolved.slash.intensity,
      lifetime: look.lifetime ?? resolved.slash.lifetime,
      tip: toArray3(options.tip, [0, 1, 0]),
    });
    const entry = {
      look,
      ribbon,
      rng,
      sparkleAccum: 0,
      stopped: false,
    };
    liveTrails.push(entry);
    return {
      type: 'slash',
      get active() { return entry.ribbon.active; },
      stop() {
        entry.stopped = true;
        entry.ribbon.stop();
        return this;
      },
    };
  };

  const spawnFireball = (options, rng) => {
    if (!resolved.fireball.enabled) return null;
    const core = acquireProjectile();
    const look = cleanObject(options.look);
    core.arm({
      coreColor: look.coreColor ?? resolved.fireball.coreColor,
      coreSize: look.coreSize ?? resolved.fireball.coreSize,
      flameColor: look.flameColor ?? resolved.fireball.flameColor,
      intensity: look.intensity ?? resolved.fireball.intensity,
      seed: rng(),
    });
    const from = toArray3(options.from ?? options.at, [0, 1, 0]);
    const entry = {
      core,
      done: false,
      emberAccum: 0,
      gravity: Number.isFinite(options.gravity) ? options.gravity : 2.0,
      life: 0,
      look,
      maxLife: Number.isFinite(options.maxLife) ? options.maxLife : 3.0,
      onHit: typeof options.onHit === 'function' ? options.onHit : null,
      position: new THREE.Vector3(...from),
      rng,
      velocity: new THREE.Vector3(...toArray3(options.velocity, [6, 2, 0])),
      finish(detonate = true, at = null) {
        if (entry.done) return;
        entry.done = true;
        const where = at ?? [entry.position.x, entry.position.y, entry.position.z];
        if (detonate) {
          emitRecords(emitFireballExplosion({
            at: where,
            normal: [0, 1, 0],
            now: time,
            overrides: entry.look,
            rng: entry.rng,
            settings: resolved,
          }));
          entry.onHit?.(where);
        }
        entry.core.reset();
      },
    };
    core.setCenter(entry.position);
    liveProjectiles.push(entry);
    return {
      type: 'fireball',
      position: entry.position,
      velocity: entry.velocity,
      get alive() { return !entry.done; },
      explode(at = null) {
        entry.finish(true, at ? toArray3(at) : null);
        return this;
      },
      cancel() {
        entry.finish(false);
        return this;
      },
    };
  };

  const oneShot = (builder, options, rng, extraArgs = {}) => {
    emitRecords(builder({
      now: time,
      overrides: cleanObject(options.look),
      rng,
      settings: resolved,
      ...extraArgs,
    }));
    return null;
  };

  // --- public surface ----------------------------------------------------------

  const vfx = {
    root,
    settings: resolved,

    /** Live pool/backbone state (also what verify-vfxgen.mjs asserts). */
    get stats() {
      const glow = backbone.groups.glow;
      const puff = backbone.groups.puff;
      return {
        capacity: glow.capacity + puff.capacity,
        drawCalls: (glow.liveCount(time) > 0 ? 1 : 0)
          + (puff.liveCount(time) > 0 ? 1 : 0)
          + liveTrails.filter((t) => t.ribbon.samples > 1).length
          + liveProjectiles.filter((b) => !b.done).length,
        live: {
          glow: glow.liveCount(time),
          projectiles: liveProjectiles.filter((b) => !b.done).length,
          puff: puff.liveCount(time),
          trails: liveTrails.length,
        },
        pooled: { projectiles: projectilePool.length, trails: trailPool.length },
        spawnsTotal,
        time,
      };
    },

    /**
     * Spawns an effect at a gameplay moment. Types by category —
     * weapon: 'slash' (returns a handle; stop() when the swing ends),
     *         'impact' ({ at, normal?, power? });
     * magic: 'fireball' ({ from, velocity, gravity?, maxLife?, onHit? } →
     *         handle with .position/.explode()/.cancel());
     * movement: 'footstep' ({ at, dir? }), 'landing' ({ at, power? }).
     * All accept `look: { ...group overrides }` for per-spawn re-tints and
     * `seed` to pin the spawn's randomness.
     */
    spawn(type, options = {}) {
      const rng = Number.isFinite(options.seed)
        ? mulberry32(hashCombine(worldSeed, Math.round(options.seed)))
        : nextRng();
      spawnsTotal += 1;
      switch (type) {
        case 'slash':
          return spawnSlash(options, rng);
        case 'impact':
          return oneShot(emitImpact, options, rng, {
            at: toArray3(options.at),
            normal: toArray3(options.normal, [0, 1, 0]),
            power: options.power,
          });
        case 'fireball':
          return spawnFireball(options, rng);
        case 'footstep':
          return oneShot(emitFootstep, options, rng, {
            at: toArray3(options.at),
            dir: options.dir ? toArray3(options.dir) : null,
          });
        case 'landing':
          return oneShot(emitLanding, options, rng, {
            at: toArray3(options.at),
            power: options.power,
          });
        default:
          spawnsTotal -= 1;
          console.warn(`[vfxgen] Unknown effect type "${type}".`);
          return null;
      }
    },

    /**
     * Per frame. Ticks the shared clock (scaled by shared.timeScale — feed
     * hit-stop here), samples live ribbons, integrates projectiles, and
     * sheds their continuous particles.
     */
    update(delta, camera) {
      const dt = Math.min(Math.max((delta ?? 0.016) * resolved.shared.timeScale, 0), 0.1);
      time += dt;
      u.uTime.value = time;
      if (camera?.isObject3D) {
        const e = camera.matrixWorld.elements;
        u.uCamRight.value.set(e[0], e[1], e[2]);
        u.uCamUp.value.set(e[4], e[5], e[6]);
      }

      // Weapon trails: sample the followed blade, sparkle along the tip.
      for (let i = liveTrails.length - 1; i >= 0; i -= 1) {
        const entry = liveTrails[i];
        const tip = entry.ribbon.sample(time);
        if (tip && resolved.slash.sparkle > 0 && dt > 0) {
          entry.sparkleAccum += (entry.look.sparkle ?? resolved.slash.sparkle) * dt;
          const count = Math.floor(entry.sparkleAccum);
          if (count > 0) {
            entry.sparkleAccum -= count;
            emitRecords(emitSlashSparkle({
              count,
              now: time,
              overrides: entry.look,
              rng: entry.rng,
              settings: resolved,
              tip: [tip.x, tip.y, tip.z],
            }));
          }
        }
        if (entry.ribbon.isDead(time)) {
          entry.ribbon.reset();
          liveTrails.splice(i, 1);
        }
      }

      // Magic projectiles: integrate, shed embers, detonate on ground/lifetime.
      for (let i = liveProjectiles.length - 1; i >= 0; i -= 1) {
        const entry = liveProjectiles[i];
        if (entry.done) {
          liveProjectiles.splice(i, 1);
          continue;
        }
        entry.life += dt;
        entry.velocity.y -= entry.gravity * dt;
        entry.position.addScaledVector(entry.velocity, dt);
        entry.core.setCenter(entry.position);

        if (dt > 0 && resolved.fireball.emberRate > 0) {
          entry.emberAccum += (entry.look.emberRate ?? resolved.fireball.emberRate) * dt;
          const count = Math.floor(entry.emberAccum);
          if (count > 0) {
            entry.emberAccum -= count;
            emitRecords(emitFireballEmbers({
              at: [entry.position.x, entry.position.y, entry.position.z],
              count,
              now: time,
              overrides: entry.look,
              rng: entry.rng,
              settings: resolved,
              velocity: [entry.velocity.x, entry.velocity.y, entry.velocity.z],
            }));
          }
        }

        const groundY = typeof heightAt === 'function'
          ? Number(heightAt(entry.position.x, entry.position.z) || 0)
          : null;
        if (groundY !== null && entry.position.y <= groundY + 0.1) {
          entry.finish(true, [entry.position.x, groundY + 0.05, entry.position.z]);
          liveProjectiles.splice(i, 1);
        } else if (entry.life >= entry.maxLife) {
          entry.finish(true);
          liveProjectiles.splice(i, 1);
        }
      }
      return vfx;
    },

    /**
     * Joins every burst and puff to the environment shader's height-fog
     * layer — same parameters and formula as ambientfx.setDistanceFog, so
     * distant explosions haze out with the terrain. Density 0 disables.
     */
    setDistanceFog({ color, density, falloff, floorY } = {}) {
      if (density !== undefined) u.uFogDensity.value = Math.max(Number(density) || 0, 0);
      if (falloff !== undefined) u.uFogFalloff.value = Math.max(Number(falloff) || 0, 0.001);
      if (floorY !== undefined) u.uFogFloorY.value = Number(floorY) || 0;
      if (color !== undefined) {
        const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
        u.uFogColor.value.copy(next);
      }
      return vfx;
    },

    /** Global VFX clock multiplier — 0 freezes (hit-stop), 1 is realtime. */
    setTimeScale(scale) {
      resolved.shared.timeScale = Math.min(Math.max(Number(scale) || 0, 0), 8);
      return vfx;
    },

    /** Drops every live effect (scene transitions). Pools stay warm. */
    clear() {
      for (const entry of liveTrails) entry.ribbon.reset();
      liveTrails.length = 0;
      for (const entry of liveProjectiles) entry.finish(false);
      liveProjectiles.length = 0;
      for (const group of Object.values(backbone.groups)) group.clear();
      return vfx;
    },

    dispose() {
      vfx.clear();
      for (const ribbon of trailPool) ribbon.dispose();
      for (const core of projectilePool) core.dispose();
      for (const group of Object.values(backbone.groups)) group.dispose();
      root.parent?.remove(root);
    },
  };
  return vfx;
}
