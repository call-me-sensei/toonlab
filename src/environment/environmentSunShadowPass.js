// Sun shadow pass for the node backends (WebGPU / forced WebGL2).
//
// The classic pipeline gets scene shadows from three's shadow-map system via
// materials with lights:true; the TSL toon/environment materials never use
// the node lighting system, so nothing would render the sun's shadow map.
// This pass renders the scene from the shadow-casting directional light's
// own shadow camera (the sun rig configures its bounds) into a float color
// target holding linear window depth, then publishes map/matrix through the
// shared uniforms in src/shaders-tsl/chunks/environment-sun-shadow.js, which
// both the environment material (getShadowMask replacement) and the toon
// character (sceneShadowVisibility) sample.
//
// Classic WebGL path: unused — three's own shadow system keeps doing the job.

import * as THREE from 'three';

import {
  applyShadowClipAdjust,
  createPassDepthColorMaterial,
} from '../shaders-tsl/chunks/pass-depth-color.js';
import { environmentSunShadow, sunShadowMapNode } from '../shaders-tsl/chunks/environment-sun-shadow.js';

export function createEnvironmentSunShadowPass({ renderer, scene } = {}) {
  if (!renderer || !scene) {
    throw new Error('createEnvironmentSunShadowPass requires { renderer, scene }.');
  }

  const isNodeBackend = Boolean(renderer.isWebGPURenderer);
  let shadowTarget = null;
  const shadowMatrix = new THREE.Matrix4();
  const depthMaterialCache = new WeakMap();
  const skinnedDepthMaterialCache = new WeakMap();
  // Swapped material (or material ARRAY) per mesh, keyed by the source
  // material identity: handing the renderer a fresh array every frame churns
  // its render-object cache, destroying object uniform buffers that queued
  // submits still reference (WebGPU validation error).
  const meshSwapCache = new WeakMap();
  const materialRestores = [];
  const visibilityRestores = [];
  let cachedSunLight = null;

  function findShadowSun() {
    if (cachedSunLight?.parent && cachedSunLight.visible && cachedSunLight.castShadow) {
      return cachedSunLight;
    }
    cachedSunLight = null;
    scene.traverse((obj) => {
      if (cachedSunLight) return;
      if (obj.isDirectionalLight && obj.visible && obj.castShadow) cachedSunLight = obj;
    });
    return cachedSunLight;
  }

  // three's WebGLShadowMap renders shadow depth with flipped culling unless
  // material.shadowSide overrides it (FrontSide casters render their back
  // faces). One-sided planes facing the light — the environments' baked
  // shadow-decal meshes — therefore never occlude in the classic map; the
  // pass must match or those decals black out the sunlit interior.
  const shadowSideFor = {
    [THREE.FrontSide]: THREE.BackSide,
    [THREE.BackSide]: THREE.FrontSide,
    [THREE.DoubleSide]: THREE.DoubleSide,
  };

  function cacheForDepthMaterial(object) {
    if (!object?.isSkinnedMesh) return depthMaterialCache;
    let cache = skinnedDepthMaterialCache.get(object);
    if (!cache) {
      cache = new WeakMap();
      skinnedDepthMaterialCache.set(object, cache);
    }
    return cache;
  }

  function depthMaterialFor(material, object = null) {
    const cache = cacheForDepthMaterial(object);
    let depthMaterial = cache.get(material);
    if (!depthMaterial) {
      if (typeof material?.userData?.createDepthColorVariant === 'function') {
        // Materials with custom vertex displacement (tree foliage cards)
        // provide their own cutout depth variant.
        depthMaterial = material.userData.createDepthColorVariant();
      } else {
        // Toon/environment TSL materials expose their cutout through the
        // same-name uniform surface; classic materials through alphaTest/map.
        const cutoff = material?.uniforms?.aCutoff?.value ??
          material?.uniforms?.alphaCutoff?.value ??
          (material?.alphaTest > 0 ? material.alphaTest : -1);
        const map = material?.uniforms?.base?.value ??
          material?.uniforms?.baseMap?.value ??
          material?.map ?? null;
        depthMaterial = createPassDepthColorMaterial({
          alphaTest: cutoff > 0 ? cutoff : 0,
          map: cutoff > 0 ? map : null,
          side: THREE.DoubleSide,
        });
        depthMaterial.side = material?.shadowSide ?? shadowSideFor[material?.side] ?? THREE.DoubleSide;
      }
      cache.set(material, depthMaterial);
    }
    // three's WebGLShadowMap skips invisible source materials per group
    // (multi-material building meshes carry their opened window panes as a
    // hidden group); keep the depth replacement in step every update.
    depthMaterial.visible = material?.visible !== false;
    return depthMaterial;
  }

  // Static scenes render the shadow map once: r185's render-object
  // revalidation churn (dispose + recreate) intermittently destroys buffers
  // that queued submits still reference, and a pass that stops submitting
  // when nothing changed sidesteps the race entirely. Callers pass
  // `dynamic: true` while animation moves casters.
  let lastRenderSignature = '';

  function renderSignature(sun) {
    return `${sun.uuid}:${sun.matrixWorld.elements.join(',')}:${sun.target?.matrixWorld.elements.join(',')}:${sun.shadow.camera.far}:${scene.children.length}`;
  }

  function update({ dynamic = false } = {}) {
    if (!isNodeBackend) return;

    // Note: renderer.shadowMap stays DISABLED on the node backends (the labs
    // gate it) — three's own shadow-map pass would re-render every skinned
    // caster with built-in buffer skinning (the >256-bone UBO overflow) and
    // nothing consumes its maps here. The light's castShadow flag alone
    // drives this pass.
    const sun = findShadowSun();
    if (!sun) {
      environmentSunShadow.ready.value = false;
      return;
    }

    if (!dynamic) {
      const signature = renderSignature(sun);
      if (signature === lastRenderSignature && environmentSunShadow.ready.value) return;
      lastRenderSignature = signature;
    } else {
      lastRenderSignature = '';
    }

    const shadow = sun.shadow;
    const mapSize = Math.max(shadow.mapSize?.x ?? 2048, 1);
    if (!shadowTarget || shadowTarget.width !== mapSize) {
      shadowTarget?.dispose();
      shadowTarget = new THREE.WebGLRenderTarget(mapSize, mapSize, {
        depthBuffer: true,
        stencilBuffer: false,
      });
      shadowTarget.texture.name = 'EnvironmentSunShadow.Depth';
      shadowTarget.texture.type = THREE.FloatType;
      shadowTarget.texture.minFilter = THREE.NearestFilter;
      shadowTarget.texture.magFilter = THREE.NearestFilter;
    }

    // The sun rig frames the light's orthographic shadow camera bounds, but
    // POSING the camera (position/orientation from light + target) is a
    // side effect of three's own shadow pass — which is disabled on the node
    // backends. updateMatrices() is that pose step as a public API.
    sun.updateMatrixWorld(true);
    sun.target?.updateMatrixWorld(true);
    shadow.updateMatrices(sun);
    const shadowCamera = shadow.camera;
    shadowCamera.coordinateSystem = renderer.coordinateSystem;
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    shadowMatrix.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    applyShadowClipAdjust(shadowMatrix, renderer);

    scene.updateMatrixWorld(true);

    // Swap every visible caster to a depth-color material (cutout-aware);
    // hide non-casters and derived hulls/shells for the duration.
    materialRestores.length = 0;
    visibilityRestores.length = 0;
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.visible) return;
      if (!obj.castShadow || obj.userData?.isToonOutline || obj.userData?.isToonFurShell) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      // three's WebGLShadowMap skips materials with visible === false; the
      // environment's window-opening materials rely on that so sunlight can
      // stream through opened windows. Match it before the material swap.
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (!sourceMaterials.some((mat) => mat && mat.visible !== false)) {
        obj.visible = false;
        visibilityRestores.push(obj);
        return;
      }
      if (obj.isSkinnedMesh) obj.skeleton?.update();
      materialRestores.push({ material: obj.material, mesh: obj });
      const customDepthMaterial = obj.customDepthMaterial ?? null;
      let swap = meshSwapCache.get(obj);
      if (!swap || swap.source !== obj.material || swap.customDepthMaterial !== customDepthMaterial) {
        swap = {
          customDepthMaterial,
          source: obj.material,
          swapped: customDepthMaterial ?? (
            Array.isArray(obj.material)
              ? obj.material.map((mat) => depthMaterialFor(mat, obj))
              : depthMaterialFor(obj.material, obj)
          ),
        };
        meshSwapCache.set(obj, swap);
      } else if (!customDepthMaterial && Array.isArray(swap.swapped)) {
        // Keep per-group visibility in step (depthMaterialFor refreshes the
        // single-material case internally).
        for (let i = 0; i < swap.source.length; i += 1) {
          depthMaterialFor(swap.source[i], obj);
        }
      } else if (!customDepthMaterial) {
        depthMaterialFor(swap.source, obj);
      }
      obj.material = swap.swapped;
    });

    const previousTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    // If a lab keeps three's native shadows on alongside this pass (the water
    // playground does, for its MeshToonMaterial ground), rendering our
    // depth-swapped scene must not also trigger three's native shadow-map
    // render of that swapped scene — disable it just for this render.
    const previousShadowAutoUpdate = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    scene.background = null;
    renderer.setRenderTarget(shadowTarget);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(scene, shadowCamera);
    renderer.setRenderTarget(previousTarget);
    renderer.shadowMap.enabled = previousShadowAutoUpdate;
    scene.background = previousBackground;

    for (const { material, mesh } of materialRestores) mesh.material = material;
    for (const obj of visibilityRestores) obj.visible = true;
    materialRestores.length = 0;
    visibilityRestores.length = 0;

    environmentSunShadow.matrix.value.copy(shadowMatrix);
    environmentSunShadow.mapSize.value = mapSize;
    environmentSunShadow.radius.value = shadow.radius ?? 1;
    // Native shadow maps keep far more precision than the old packed-depth
    // approximation. Keep the shared node-backend pass in float precision too,
    // otherwise low sunset angles can collapse canopy-vs-grass depth and make
    // nearby tree shadows disappear while taller/farther trees still work.
    environmentSunShadow.bias.value = shadow.bias ?? -0.00004;
    sunShadowMapNode().value = shadowTarget.texture;
    environmentSunShadow.ready.value = true;
  }

  // The static-scene signature only tracks the sun pose and child count —
  // swapping a subject for another with the same bounds (or retexturing a
  // cutout material) changes the casters without changing the signature.
  function invalidate() {
    lastRenderSignature = '';
  }

  function dispose() {
    shadowTarget?.dispose();
    shadowTarget = null;
    environmentSunShadow.ready.value = false;
  }

  return {
    get shadowTexture() {
      return shadowTarget?.texture ?? null;
    },
    get shadowMatrix() {
      return shadowMatrix;
    },
    dispose,
    invalidate,
    update,
  };
}
