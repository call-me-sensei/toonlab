// Lightweight world collision. Import from '@call-me-sensei/toonlab'.
//
// Not a physics engine — a walkability service for stylized worlds, so a
// third-person character can't stroll through tree trunks and boulders and
// always knows the ground height. `createStylizedWorld` builds one
// automatically (forest trunks pre-registered) and exposes it as
// `world.collision`; register your own blockers (rocks, props, buildings)
// with one call and resolve the character every frame:
//
//   world.collision.addCircles(rockBlockers);         // [{ x, z, radius }]
//   // in the controller, after applying movement:
//   world.collision.resolve(character.position, 0.35); // pushes out of blockers
//
// Blockers are 2D circles on a spatial hash — thousands resolve in
// microseconds. Hosts that outgrow this (dynamic bodies, ragdolls) graduate
// to a real physics engine; the two coexist fine.

export function createWorldCollision({ heightAt = null, cellSize = 16 } = {}) {
  const circles = [];
  const grid = new Map();
  const cell = Math.max(Number(cellSize) || 16, 1);
  const keyOf = (ix, iz) => `${ix},${iz}`;

  function addCircle(x, z, radius) {
    const circle = {
      radius: Math.max(Number(radius) || 0, 0),
      x: Number(x) || 0,
      z: Number(z) || 0,
    };
    if (circle.radius <= 0) return circle;
    circles.push(circle);
    const reach = Math.ceil(circle.radius / cell);
    const cx = Math.floor(circle.x / cell);
    const cz = Math.floor(circle.z / cell);
    for (let ix = cx - reach; ix <= cx + reach; ix += 1) {
      for (let iz = cz - reach; iz <= cz + reach; iz += 1) {
        const key = keyOf(ix, iz);
        const bucket = grid.get(key);
        if (bucket) bucket.push(circle);
        else grid.set(key, [circle]);
      }
    }
    return circle;
  }

  /** Registers `[{ x, z, radius }]` blockers in bulk. */
  function addCircles(list = []) {
    for (const entry of list) addCircle(entry.x, entry.z, entry.radius);
  }

  /**
   * Pushes a position (mutated in place) out of every overlapping blocker.
   * Two passes settle corner cases where one push slides into a neighbor.
   * Returns the position for chaining. `y` is untouched — pair with
   * `groundHeight(x, z)` for vertical placement.
   */
  function resolve(position, radius = 0.35) {
    const bodyRadius = Math.max(Number(radius) || 0, 0);
    for (let pass = 0; pass < 2; pass += 1) {
      const cx = Math.floor(position.x / cell);
      const cz = Math.floor(position.z / cell);
      let pushed = false;
      for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
        for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
          const bucket = grid.get(keyOf(ix, iz));
          if (!bucket) continue;
          for (const circle of bucket) {
            const dx = position.x - circle.x;
            const dz = position.z - circle.z;
            const minDistance = circle.radius + bodyRadius;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq >= minDistance * minDistance) continue;
            const distance = Math.sqrt(distanceSq) || 1e-4;
            const push = (minDistance - distance) / distance;
            position.x += dx * push;
            position.z += dz * push;
            pushed = true;
          }
        }
      }
      if (!pushed) break;
    }
    return position;
  }

  /** Terrain height at a point (0 without a heightAt sampler). */
  function groundHeight(x, z) {
    if (typeof heightAt !== 'function') return 0;
    const y = Number(heightAt(x, z));
    return Number.isFinite(y) ? y : 0;
  }

  return { addCircle, addCircles, circles, groundHeight, resolve };
}
