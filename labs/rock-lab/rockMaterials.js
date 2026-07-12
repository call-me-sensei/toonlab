// Composition point between the rockgen cluster (geometry with baked
// color + envVertexAo) and the environment cluster (toon shader, raycast
// vertex-AO baker). Materials are converted ONCE per mesh slot — geometry
// swaps afterwards never recompile the shader because `color` and
// `envVertexAo` are present from the first conversion, so the material's
// defines never change.

import * as THREE from 'three';
import {
  CENTER,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';

import {
  applyEnvironmentShader,
  bakeEnvironmentVertexAo,
  updateEnvironmentBoundsUniforms,
} from '../../src/environment/environmentMaterialAdapter.js';

let raycastAccelerationInstalled = false;

function installRaycastAcceleration() {
  if (raycastAccelerationInstalled) return;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  raycastAccelerationInstalled = true;
}

function prepareRockRaycastGeometry(geometry) {
  if (!geometry?.attributes?.position) return geometry;
  installRaycastAcceleration();
  geometry.computeBoundsTree({ strategy: CENTER });
  return geometry;
}

function disposeRockGeometry(geometry) {
  if (!geometry) return;
  geometry.disposeBoundsTree?.();
  geometry.dispose();
}

/** Wraps a rockgen geometry in a mesh ready for shader conversion. */
export function createRockMesh(geometry, name = 'Rock') {
  const mesh = new THREE.Mesh(prepareRockRaycastGeometry(geometry), new THREE.MeshStandardMaterial({ vertexColors: true }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Converts a mesh (rock or ground) to the toon environment shader. The
 * rockgen SDF AO is already in `envVertexAo`, so the adapter's own bake
 * stays off; the raycast scheduler below refreshes AO with scene context.
 */
export async function convertRockMesh(mesh, environmentBox) {
  await applyEnvironmentShader(mesh, {
    bakeVertexAo: false,
    environmentBox,
    hasSun: true,
    // Untextured-scene grading (cf. the 'interiorStudio' environment
    // preset): without base textures the default shade goes near-black.
    parameters: {
      ambientStrength: 0.72,
      aoWarmth: 0.5,
      shadowLift: 0.38,
      untexturedGradientStrength: 0.3,
      vertexAoStrength: 1.0,
    },
    scanStylize: false,
  });
  return mesh;
}

/** Swaps generated geometry into a converted mesh (no material work). */
export function swapRockGeometry(mesh, geometry) {
  const previous = mesh.geometry;
  mesh.geometry = prepareRockRaycastGeometry(geometry);
  if (previous && previous !== geometry) disposeRockGeometry(previous);
}

/** Pushes a grown/shrunk environment box into every converted material. */
export function refreshEnvironmentBounds(rockRoot, environmentBox) {
  rockRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      // Converted materials on either backend expose the bounds uniforms
      // through the same-name `.uniforms` surface (TSL materials are not
      // isShaderMaterial, so gate on the uniform itself).
      if (material?.uniforms?.environmentCenter) updateEnvironmentBoundsUniforms(material, environmentBox);
    }
  });
}

/**
 * Debounced raycast vertex-AO rebake for the preview scene: overwrites the
 * field-derived SDF AO with scene-aware occlusion (ground contact, and
 * later inter-piece shadowing). Preview polish only — exports keep the
 * asset-intrinsic SDF AO.
 *
 * `getRevision` tags each bake; if the document moved on while baking, the
 * result is already stale and a fresh bake is queued immediately.
 */
export function createAoScheduler({
  delay = 500,
  getEnvironmentBox,
  getMeshes,
  getOccluderRoot,
  getRevision,
  onBaked = () => {},
  shouldBake = () => true,
}) {
  let timer = 0;
  let baking = false;

  async function bake() {
    if (baking) return;
    if (!shouldBake()) return;
    baking = true;
    const revision = getRevision();
    try {
      const meshes = getMeshes();
      if (meshes.length > 0) {
        const result = await bakeEnvironmentVertexAo(meshes, {
          environmentBox: getEnvironmentBox(),
          occluderRoot: getOccluderRoot(),
          rayCount: 12,
          shouldContinue: shouldBake,
          vertexBudget: 300000,
        });
        if (result.aborted) return;
        for (const mesh of meshes) {
          const attribute = mesh.geometry.getAttribute('envVertexAo');
          if (attribute) attribute.needsUpdate = true;
        }
      }
    } finally {
      baking = false;
    }
    if (getRevision() !== revision) {
      schedule();
    } else {
      onBaked();
    }
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!shouldBake()) return;
    timer = window.setTimeout(bake, delay);
  }

  return {
    /** Awaitable immediate bake (used for the first-ready signal). */
    bakeNow: bake,
    cancel: () => window.clearTimeout(timer),
    schedule,
  };
}
