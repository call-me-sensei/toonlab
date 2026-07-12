import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  clamp, exp, length, max, mix, positionView, positionWorld, texture, uniform, vec4, vertexColor,
} from 'three/tsl';

import { StylizedTree } from './stylizedTree.js';
import { disposeExportGroup, prepareTreeForExport } from './treeExport.js';

// Two quads crossed at 90°, anchored so the tree base sits at the instance
// origin. 8 vertices — the whole point of the billboard path.
function buildCrossQuadGeometry(width, height, minY) {
  const hw = width / 2;
  const top = minY + height;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -hw, minY, 0, hw, minY, 0, hw, top, 0, -hw, top, 0,
    0, minY, -hw, 0, minY, hw, 0, top, hw, 0, top, -hw,
  ]), 3));
  // v is flipped: the node renderer writes render targets top-down (see the
  // water reflection's FLIP_Y_UV_MATRIX), so the bake's tree-top lives at
  // v = 0. Unflipped, every billboard renders trunk-up.
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 1, 1, 1, 1, 0, 0, 0,
    0, 1, 1, 1, 1, 0, 0, 0,
  ]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

// Horizontal canopy slice for aerial cameras: crossed vertical quads all but
// vanish seen from above (an X of edge-on planes), so flyover/top-down views
// need this cap textured with a top-down bake.
function buildCanopyCapGeometry(width, capY) {
  const hw = width / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -hw, capY, -hw, hw, capY, -hw, hw, capY, hw, -hw, capY, hw,
  ]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 1, 1, 1, 1, 0, 0, 0,
  ]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

// LOD forest. Import from '@call-me-sensei/toonlab/vegetation'.
//
// A real stylized world needs thousands of trees, but a full StylizedTree
// (live foliage shader, wind, per-puff cards) is a near-field asset. The
// forest splits the work the way anime open worlds do:
//
//  - FAR (default, pass `renderer`): every placement renders as a crossed
//    pair of textured quads — each variant is baked ONCE to a small texture
//    (lighting pre-baked via prepareTreeForExport vertex colors) and
//    instanced. 16 vertices per tree instead of the ~12k of the merged
//    export mesh: the water grab/reflection passes and the main pass all
//    redraw the whole forest, so full-geometry "impostors" put tens of
//    millions of vertices in flight per frame (~20 fps); billboards make
//    the same forest cost thousands.
//  - FAR (no renderer): legacy merged-geometry instancing — correct but
//    expensive; only for hosts that cannot hand the forest a renderer.
//  - NEAR: a budgeted pool of live detailed trees (mesh clones of the
//    variants, animated wind through shared materials) swaps in around the
//    camera; the matching far instances collapse to zero scale.
//
// Reassignment runs on an interval, not per frame, and is hysteresis-free by
// budget: the `detailCount` nearest placements inside `detailDistance` win.
//
//   const forest = new StylizedForest({
//     placements: scatterForest({ ... }),      // [{ x, y, z, seed }]
//     preset: 'call_me_sensei',
//     settings: { tree: { size: 3.2 } },
//     variants: 8,
//   });
//   scene.add(forest);
//   forest.update(delta, camera);              // per frame
export class StylizedForest extends THREE.Group {
  constructor({
    placements = [],
    preset = null,
    settings = {},
    canopyColors = null,        // optional color-spec list; variant i picks canopyColors[i % length]
    variants = 8,
    detailDistance = 150,
    detailCount = 110,
    updateInterval = 0.3,
    castShadow = true,          // near live clones cast; anchors the forest to the ground
    renderer = null,            // enables texture-baked billboard impostors (strongly recommended)
    impostorTextureSize = 256,  // billboard bake resolution per variant
  } = {}) {
    super();
    this.name = 'StylizedForest';
    this.detailDistance = detailDistance;
    this.detailCount = detailCount;
    this.updateInterval = updateInterval;
    this._timer = updateInterval; // force an assignment on the first update

    const variantCount = Math.max(1, Math.min(variants, Math.max(placements.length, 1)));

    // Unique silhouettes. The variant trees never enter the scene directly —
    // they are geometry/material sources, and their update() drives the wind
    // uniforms shared by every near clone.
    this.variantTrees = [];
    this._bakedVariants = [];
    for (let i = 0; i < variantCount; i += 1) {
      const seed = placements[i]?.seed ?? i * 7919 + 1;
      // Shallow-merge (settings may hold textures/THREE objects that don't
      // survive structuredClone); only the tree group is overridden.
      const variantSettings = { ...settings, tree: { ...settings?.tree } };
      if (Array.isArray(canopyColors) && canopyColors.length > 0) {
        variantSettings.tree.canopyColor = canopyColors[i % canopyColors.length];
      }
      const tree = new StylizedTree({ preset, seed, ...variantSettings });
      this.variantTrees.push(tree);
      this._bakedVariants.push(prepareTreeForExport(tree));
    }

    // Per-placement bookkeeping + far instancing (two draws per variant).
    this._placements = placements.map((p, index) => ({
      detailed: null,
      index,
      matrix: null,
      seed: p.seed ?? index,
      variant: (p.seed ?? index) % variantCount,
      x: p.x, y: p.y, z: p.z,
    }));
    const perVariant = Array.from({ length: variantCount }, () => []);
    for (const entry of this._placements) perVariant[entry.variant].push(entry);

    this._instanced = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const compose = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    // Impostor materials are unlit (MeshBasic): lighting is already baked
    // into the export's vertex colors, and unlit flat color is exactly how
    // distant anime trees should read — no scene-light dependency, no
    // near-black shadow sides.
    //
    // They also carry the environment shader's height fog (same formula,
    // shared uniforms — see setDistanceFog). scene.fog alone is the linear
    // layer; at 700 m+ the terrain is mostly height-fog haze while a
    // scene.fog-only impostor is still ~20% fogged, so far canopies float
    // on the mountains as saturated dots. Density 0 disables the layer.
    this._fogUniforms = {
      color: uniform(new THREE.Color(0.66, 0.8, 0.94)),
      density: uniform(0),
      falloff: uniform(400),
      floorY: uniform(0),
    };
    const fogU = this._fogUniforms;
    const impostorMaterial = (source) => {
      const material = new MeshBasicNodeMaterial({
        alphaTest: source.alphaTest ?? 0,
        fog: true,
        name: `${source.name ?? 'Impostor'}Unlit`,
        side: source.side ?? THREE.FrontSide,
      });
      let rgba = vec4(uniform(source.color?.clone() ?? new THREE.Color(0xffffff)), 1.0);
      if (source.map) rgba = rgba.mul(texture(source.map));
      if (source.vertexColors) rgba = rgba.mul(vec4(vertexColor().rgb, 1.0));
      // Mirror of environment.js world-height fog: dense near the world
      // floor, thinning with altitude, exponential in view distance.
      const heightFalloff = exp(
        max(positionWorld.y.sub(fogU.floorY), 0.0).div(max(fogU.falloff, 0.001)).negate(),
      );
      const depthTerm = exp(length(positionView).mul(fogU.density).negate()).oneMinus();
      material.colorNode = vec4(
        mix(rgba.rgb, fogU.color, clamp(depthTerm.mul(heightFalloff), 0.0, 1.0)),
        rgba.a,
      );
      return material;
    };
    this._impostorMaterials = new Map();
    this._impostorTargets = [];
    for (let v = 0; v < variantCount; v += 1) {
      const entries = perVariant[v];
      const meshes = [];
      if (renderer) {
        // Billboard path: bake the variant once (side + top views), instance
        // two crossed quads plus a horizontal canopy cap for aerial cameras.
        const bake = this._bakeVariantTexture(renderer, this._bakedVariants[v], impostorTextureSize);
        const topBake = this._bakeVariantTexture(renderer, this._bakedVariants[v], impostorTextureSize, 'top');
        this._impostorTargets.push(bake.target, topBake.target);
        const parts = [
          [buildCrossQuadGeometry(bake.width, bake.height, bake.minY), bake.target.texture, 'TreeBillboard'],
          [buildCanopyCapGeometry(bake.width, bake.minY + bake.height * 0.68), topBake.target.texture, 'TreeBillboardCap'],
        ];
        for (const [geometry, map, name] of parts) {
          const instanced = new THREE.InstancedMesh(
            geometry,
            impostorMaterial({ alphaTest: 0.35, map, name, side: THREE.DoubleSide }),
            Math.max(entries.length, 1),
          );
          // Alpha-cutout quads in the shadow map ink solid rectangles, and
          // the follow-target shadow window only covers live-clone range.
          instanced.castShadow = false;
          instanced.receiveShadow = false;
          instanced.frustumCulled = false; // instances span the whole map
          this.add(instanced);
          meshes.push(instanced);
        }
      } else {
        for (const source of this._bakedVariants[v].children) {
          let material = this._impostorMaterials.get(source.material);
          if (!material) {
            material = impostorMaterial(source.material);
            this._impostorMaterials.set(source.material, material);
          }
          const instanced = new THREE.InstancedMesh(source.geometry, material, Math.max(entries.length, 1));
          instanced.castShadow = castShadow;
          instanced.receiveShadow = false;
          instanced.frustumCulled = false; // instances span the whole map
          this.add(instanced);
          meshes.push(instanced);
        }
      }
      entries.forEach((entry, slot) => {
        entry.instanceSlot = slot;
        entry.meshes = meshes;
        quaternion.setFromAxisAngle(up, ((entry.seed >>> 4) % 628) / 100);
        const jitter = 0.9 + (((entry.seed >>> 12) % 21) / 100);
        compose.compose(
          new THREE.Vector3(entry.x, entry.y, entry.z),
          quaternion,
          new THREE.Vector3(jitter, jitter, jitter),
        );
        entry.matrix = compose.clone();
        for (const mesh of meshes) mesh.setMatrixAt(slot, entry.matrix);
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      this._instanced.push(meshes);
    }
    this._zeroMatrix = zero;
    if (renderer) {
      // The merged export geometry only existed to feed the billboard bakes.
      for (const baked of this._bakedVariants) disposeExportGroup(baked);
      this._bakedVariants = [];
    }

    // Near pool: lazily-built clone groups, recycled between placements.
    this._pool = [];
    this._detailed = new Set();
  }

  /**
   * Renders one baked variant into a small transparent texture from a
   * horizontal orthographic view. The baked group already carries its
   * lighting in vertex colors, so an unlit render IS the finished look.
   */
  _bakeVariantTexture(renderer, baked, size, view = 'side') {
    const bounds = new THREE.Box3().setFromObject(baked);
    const extent = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const width = Math.max(extent.x, extent.z) * 1.02;
    const height = extent.y * 1.02;

    const bakeScene = new THREE.Scene();
    const unlitMaterials = [];
    for (const child of baked.children) {
      const source = child.material;
      const unlit = new THREE.MeshBasicMaterial({
        alphaTest: source.alphaTest ?? 0,
        color: source.color?.clone() ?? new THREE.Color(0xffffff),
        map: source.map ?? null,
        side: THREE.DoubleSide,
        vertexColors: Boolean(source.vertexColors),
      });
      unlitMaterials.push(unlit);
      const mesh = new THREE.Mesh(child.geometry, unlit);
      mesh.position.copy(child.position);
      mesh.rotation.copy(child.rotation);
      mesh.scale.copy(child.scale);
      bakeScene.add(mesh);
    }

    let camera;
    let targetHeight;
    if (view === 'top') {
      camera = new THREE.OrthographicCamera(
        -width / 2, width / 2, width / 2, -width / 2,
        0.1, extent.y + 10,
      );
      camera.position.set(center.x, bounds.max.y + 2, center.z);
      camera.up.set(0, 0, -1);
      camera.lookAt(center.x, bounds.min.y, center.z);
      targetHeight = size;
    } else {
      camera = new THREE.OrthographicCamera(
        -width / 2, width / 2, height / 2, -height / 2,
        0.1, Math.max(extent.z, extent.x) + 10,
      );
      camera.position.set(center.x, center.y, center.z + Math.max(extent.z, extent.x) / 2 + 2);
      camera.lookAt(center);
      targetHeight = Math.max(64, Math.round((size * height) / Math.max(width, 0.001)));
    }

    const target = new THREE.WebGLRenderTarget(
      size,
      targetHeight,
      { depthBuffer: true, stencilBuffer: false },
    );
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(bakeScene, camera);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    for (const material of unlitMaterials) material.dispose();

    return { height, minY: bounds.min.y, target, width };
  }

  _acquireClone(variant) {
    const idle = this._pool.find((entry) => entry.placement === null && entry.variant === variant);
    if (idle) return idle;
    const source = this.variantTrees[variant];
    const group = new THREE.Group();
    for (const child of source.children) {
      const clone = child.clone();
      // Mesh.clone() drops customDepthMaterial — without it the canopy
      // casts no shadow on the WebGL fallback path.
      if (child.customDepthMaterial) clone.customDepthMaterial = child.customDepthMaterial;
      group.add(clone);
    }
    const entry = { group, placement: null, variant };
    this._pool.push(entry);
    this.add(group);
    return entry;
  }

  /** Reassign near/far LOD around a world-space point (usually the camera). */
  _assign(focus) {
    const nearSq = this.detailDistance * this.detailDistance;
    const candidates = [];
    for (const entry of this._placements) {
      const dx = entry.x - focus.x;
      // True 3D distance: a top-down or flyover camera hundreds of meters up
      // is NOT near the trees under it — horizontal-only distance promotes
      // them to saturated live clones that pop against the fogged impostors.
      const dy = entry.y - focus.y;
      const dz = entry.z - focus.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq <= nearSq) candidates.push([distanceSq, entry]);
    }
    candidates.sort((a, b) => a[0] - b[0]);
    const next = new Set(candidates.slice(0, this.detailCount).map(([, entry]) => entry));

    for (const entry of this._detailed) {
      if (next.has(entry)) continue;
      // demote: restore far instance, release the clone
      for (const mesh of entry.meshes) {
        mesh.setMatrixAt(entry.instanceSlot, entry.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
      entry.detailed.placement = null;
      entry.detailed.group.visible = false;
      entry.detailed = null;
    }
    for (const entry of next) {
      if (entry.detailed) continue;
      // promote: hide far instance, place a live clone
      const clone = this._acquireClone(entry.variant);
      clone.placement = entry;
      clone.group.visible = true;
      clone.group.position.set(entry.x, entry.y, entry.z);
      clone.group.rotation.y = ((entry.seed >>> 4) % 628) / 100;
      const jitter = 0.9 + (((entry.seed >>> 12) % 21) / 100);
      clone.group.scale.setScalar(jitter);
      entry.detailed = clone;
      for (const mesh of entry.meshes) {
        mesh.setMatrixAt(entry.instanceSlot, this._zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this._detailed = next;
  }

  /**
   * Per frame. Ticks wind on the variant materials (shared by every near
   * clone) and periodically re-picks which trees deserve full detail.
   */
  update(delta, camera) {
    for (const tree of this.variantTrees) tree.update(delta);
    this._timer += delta;
    if (camera && this._timer >= this.updateInterval) {
      this._timer = 0;
      this._assign(camera.getWorldPosition(new THREE.Vector3()));
    }
  }

  /** Re-tune live foliage uniforms on every variant (near clones share them). */
  applySettings(options = {}) {
    for (const tree of this.variantTrees) tree.applySettings(options);
    return this;
  }

  setCloudShadow(options) {
    for (const tree of this.variantTrees) tree.setCloudShadow?.(options);
    return this;
  }

  /**
   * Matches the impostors' fog to the environment shader's height fog so far
   * canopies haze with the terrain they stand on. Pass the same
   * `heightFogColor` / `heightFogDensity` / `heightFogFalloff` the
   * environment uses, plus the world floor height (environment box bottom).
   * Density 0 disables the layer. createStylizedWorld wires this by default.
   */
  setDistanceFog({ color, density, falloff, floorY } = {}) {
    const u = this._fogUniforms;
    if (density !== undefined) u.density.value = Math.max(Number(density) || 0, 0);
    if (falloff !== undefined) u.falloff.value = Math.max(Number(falloff) || 0, 0.001);
    if (floorY !== undefined) u.floorY.value = Number(floorY) || 0;
    if (color !== undefined) {
      const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
      u.color.value.copy(next);
    }
    return this;
  }

  get count() {
    return this._placements.length;
  }

  /** Read-only `[{ x, y, z, seed }]` of every tree (for collision, minimaps, ...). */
  get placements() {
    return this._placements.map(({ seed, x, y, z }) => ({ seed, x, y, z }));
  }

  dispose() {
    for (const meshes of this._instanced) {
      for (const mesh of meshes) {
        mesh.geometry?.dispose?.();
        mesh.dispose();
      }
    }
    for (const baked of this._bakedVariants) disposeExportGroup(baked);
    for (const target of this._impostorTargets) target.dispose();
    this.parent?.remove(this);
  }
}
