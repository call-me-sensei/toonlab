import * as THREE from 'three';
import { float, Fn, If, int, uniform, uniformArray, uv, vec3, vec4 } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import {
  applyShadowClipAdjust,
  createPassDepthColorMaterial,
  PassBasicNodeMaterial,
} from '../shaders-tsl/chunks/pass-depth-color.js';
import {
  environmentSunShadow,
  sampleEnvironmentSunShadow,
} from '../shaders-tsl/chunks/environment-sun-shadow.js';

// Runtime render passes for the character toon shader.
//
// applyToonShader() alone produces a complete material; this module adds the
// per-frame passes that unlock the screen-space and shadow-map features:
//
//  1. Scene depth prepass  -> depth-texture rim light + contact shadow
//  2. Character-only orthographic shadow map -> real self shadow
//  3. Head bone tracking   -> head-space face shading
//  4. Average shadow measurement -> per-character uniform scene shadow
//  5. Character mask       -> character-aware bloom in the post pipeline
//
// Every pass is auto-gated: it only renders when at least one registered
// material actually consumes its output, so leaving this running with the
// features disabled costs almost nothing.
//
// Usage:
//   const passes = createCharacterRenderPasses({ renderer, scene, camera });
//   passes.registerCharacterRoot(modelRoot);      // after applyToonShader
//   ...in the render loop, before rendering:
//   passes.update();

// Layer used to draw character meshes in isolation (self shadow, mask).
export const TOON_CHARACTER_LAYER = 15;

const MAX_MEASURE_SLOTS = 16;

const DEFAULT_SELF_SHADOW_OPTIONS = Object.freeze({
  // 'mainLight' follows the scene's directional light; 'cameraRelative' keeps
  // an art-directed angle relative to the camera so face/neck shadows stay
  // attractive from any viewpoint.
  directionMode: 'mainLight',
  cameraRelativePitch: 30,
  cameraRelativeYaw: 0,
  enabled: true,
  mapSize: 2048,
  // World-space receiver biases, slope-scaled in the shader.
  depthBias: 0.01,
  normalBias: 0.015,
  ndotLFix: true,
  // 0 = 1 tap, 1 = 4-tap PCF, 2 = 9-tap PCF.
  quality: 2,
  // Re-sharpen half-width applied after PCF so soft shadows keep a cel edge.
  sharpen: 0.25,
  // View distance at which the self shadow fades out entirely.
  fadeDistance: 20,
});

function toMaterialArray(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

function isAnimeToonMaterial(mat) {
  return Boolean(mat?.uniforms?.materialRole);
}

function collectToonMaterials(root) {
  const materials = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) {
      if (isAnimeToonMaterial(mat)) materials.push(mat);
    }
  });
  return materials;
}

function setUniform(materials, name, value) {
  for (const mat of materials) {
    const uniform = mat.uniforms?.[name];
    if (!uniform) continue;
    if (value?.isVector3 && uniform.value?.isVector3) uniform.value.copy(value);
    else if (value?.isVector2 && uniform.value?.isVector2) uniform.value.copy(value);
    else if (value?.isMatrix4 && uniform.value?.isMatrix4) uniform.value.copy(value);
    else uniform.value = value;
  }
}

function anyUniform(materials, predicate) {
  return materials.some((mat) => predicate(mat.uniforms));
}

// ---------------------------------------------------------------------------
// Head bone resolution
// ---------------------------------------------------------------------------

function looseName(name) {
  return String(name ?? '').replace(/[^a-z0-9぀-ヿ一-鿿]/gi, '').toLowerCase();
}

function findHeadBone(root) {
  const candidates = [];
  root.traverse((obj) => {
    if (!obj.isBone && !(obj.isObject3D && /bone/i.test(obj.type))) return;
    const name = looseName(obj.name);
    if (!name) return;
    // Exact conventions first: VRM/Mixamo 'head', Rigify 'DEF-head'/'defhead',
    // MMD '頭'. Reject end/tip/top helper bones.
    if (name === 'head' || name === 'defhead' || name === 'mixamorighead' || name === '頭') {
      candidates.push({ obj, score: 0 });
    } else if (/head/.test(name) && !/(end|tip|top|band|phone|wear|acc)/.test(name)) {
      candidates.push({ obj, score: 1 });
    }
  });
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.obj ?? null;
}

function createHeadTracker(root, { forward = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0) } = {}) {
  const headBone = findHeadBone(root);
  if (!headBone) return null;

  // Calibrate against the pose at registration (rest pose right after load):
  // capture which bone-local directions correspond to the model's world
  // forward/up so animated bone rotations carry them correctly afterwards.
  root.updateMatrixWorld(true);
  const restQuat = headBone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const forwardLocal = forward.clone().applyQuaternion(restQuat).normalize();
  const upLocal = up.clone().applyQuaternion(restQuat).normalize();

  const worldQuat = new THREE.Quaternion();
  const state = {
    forward: new THREE.Vector3(0, 0, 1),
    position: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  };

  return {
    headBone,
    state,
    update() {
      headBone.getWorldQuaternion(worldQuat);
      headBone.getWorldPosition(state.position);
      state.forward.copy(forwardLocal).applyQuaternion(worldQuat).normalize();
      state.up.copy(upLocal).applyQuaternion(worldQuat).normalize();
    },
  };
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

export function createCharacterRenderPasses({
  renderer,
  scene,
  camera,
  depthPrepass = true,
  selfShadow = {},
} = {}) {
  if (!renderer || !scene || !camera) {
    throw new Error('createCharacterRenderPasses requires { renderer, scene, camera }.');
  }

  const selfShadowOptions = { ...DEFAULT_SELF_SHADOW_OPTIONS, ...(selfShadow === false ? { enabled: false } : selfShadow) };

  const registered = [];
  let characterMaskEnabled = false;

  // Pass targets are consumed through float color attachments. Depth buffers
  // still gate rasterization, but shader reads use the color targets.

  // ---- Scene depth prepass ----
  const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const depthTarget = new THREE.WebGLRenderTarget(drawingBufferSize.x, drawingBufferSize.y, {
    depthBuffer: true,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    stencilBuffer: false,
  });
  depthTarget.texture.name = 'ToonScenePrepass.Color';
  depthTarget.depthTexture = new THREE.DepthTexture(drawingBufferSize.x, drawingBufferSize.y);
  depthTarget.depthTexture.name = 'ToonScenePrepass.Depth';
  depthTarget.depthTexture.type = THREE.UnsignedIntType;
  depthTarget.texture.type = THREE.FloatType;
  const depthOverrideMaterial = createPassDepthColorMaterial();
  const depthResolution = new THREE.Vector2(drawingBufferSize.x, drawingBufferSize.y);

  // ---- Character self-shadow map ----
  const shadowTarget = new THREE.WebGLRenderTarget(selfShadowOptions.mapSize, selfShadowOptions.mapSize, {
    depthBuffer: true,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    stencilBuffer: false,
  });
  shadowTarget.texture.name = 'ToonCharSelfShadow.Color';
  shadowTarget.depthTexture = new THREE.DepthTexture(selfShadowOptions.mapSize, selfShadowOptions.mapSize);
  shadowTarget.depthTexture.name = 'ToonCharSelfShadow.Depth';
  shadowTarget.depthTexture.type = THREE.UnsignedIntType;
  shadowTarget.texture.type = THREE.FloatType;
  const shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const shadowMatrix = new THREE.Matrix4();
  const shadowLightDirection = new THREE.Vector3(0, 1, 0);

  // ---- Average shadow measurement ----
  const measureTarget = new THREE.WebGLRenderTarget(MAX_MEASURE_SLOTS, 1, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  measureTarget.texture.name = 'ToonAverageShadowMeasure';
  measureTarget.texture.minFilter = THREE.NearestFilter;
  measureTarget.texture.magFilter = THREE.NearestFilter;
  const measureScene = new THREE.Scene();
  const measureCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const measureMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  measureMesh.frustumCulled = false;
  measureScene.add(measureMesh);

  // Same 9-jitter average over each character bounding sphere, sampled from
  // the shared sun-shadow pass. The output feeds vec2(slot, 0.5) lookups, so
  // RT row orientation is irrelevant.
  const measureJitterOffsets = [
    [0.0, 0.0, 0.0], [0.7, 0.3, 0.0], [-0.7, 0.3, 0.0],
    [0.0, 0.7, 0.5], [0.0, 0.7, -0.5], [0.5, -0.5, 0.5],
    [-0.5, -0.5, -0.5], [0.4, -0.2, -0.6], [-0.4, 1.0, 0.2],
  ];
  const measureNodeUniforms = {
    sphereCount: uniform(0, 'int'),
    sphereData: uniformArray(
      Array.from({ length: MAX_MEASURE_SLOTS }, () => new THREE.Vector4()),
      'vec4',
    ),
  };
  let measureNodeMaterial = null;
  function ensureMeasureNodeMaterial() {
    if (measureNodeMaterial) return measureNodeMaterial;
    measureNodeMaterial = new NodeMaterial();
    measureNodeMaterial.name = 'ToonAverageShadowMeasureNode';
    measureNodeMaterial.depthTest = false;
    measureNodeMaterial.depthWrite = false;
    measureNodeMaterial.fragmentNode = Fn(() => {
      const slot = int(uv().x.mul(MAX_MEASURE_SLOTS).floor()).toVar();
      const result = float(1.0).toVar();
      If(slot.lessThan(measureNodeUniforms.sphereCount), () => {
        const sphere = measureNodeUniforms.sphereData.element(slot);
        const visibility = float(0.0).toVar();
        for (const [x, y, z] of measureJitterOffsets) {
          visibility.addAssign(sampleEnvironmentSunShadow(
            sphere.xyz.add(vec3(x, y, z).mul(sphere.w).mul(0.6)),
          ));
        }
        result.assign(visibility.div(measureJitterOffsets.length));
      });
      return vec4(vec3(result), 1.0);
    })();
    return measureNodeMaterial;
  }

  // ---- Character mask (for character-aware bloom) ----
  let maskTarget = null;

  const boundsBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const boundsSphere = new THREE.Sphere();
  const tempVector = new THREE.Vector3();
  const cameraQuat = new THREE.Quaternion();
  const visibilityRestore = [];

  let cachedDirectionalLight = null;

  function findDirectionalLight() {
    if (cachedDirectionalLight?.parent && cachedDirectionalLight.visible) return cachedDirectionalLight;
    cachedDirectionalLight = null;
    scene.traverse((obj) => {
      if (cachedDirectionalLight) return;
      if (obj.isDirectionalLight && obj.visible) cachedDirectionalLight = obj;
    });
    return cachedDirectionalLight;
  }

  function registerCharacterRoot(root, { headBoneForward, headBoneUp, headCenterOffset = 0 } = {}) {
    if (!root) return null;
    const materials = collectToonMaterials(root);
    if (materials.length === 0) return null;

    // Node materials have the pass subgraphs uniform-gated and read the
    // passes' float color targets, so registration no longer mutates
    // per-material defines.

    const characterMeshes = [];
    const shadowSwaps = [];
    root.traverse((obj) => {
      // Outline hulls and fur shells are derived geometry: they must not cast
      // into the self-shadow map or appear in the character mask twice.
      if (!obj.isMesh || obj.userData?.isToonOutline || obj.userData?.isToonFurShell) return;
      obj.layers.enable(TOON_CHARACTER_LAYER);
      characterMeshes.push(obj);

      // Per-mesh depth materials that honor the source cutout so hair cards
      // cast card-shaped shadows instead of solid quads.
      const buildDepthMaterial = (mat) => {
        const cutoff = mat?.uniforms?.aCutoff?.value ?? -1;
        const baseMap = mat?.uniforms?.base?.value ?? null;
        const params = {
          alphaTest: cutoff > 0 ? cutoff : 0,
          map: cutoff > 0 ? baseMap : null,
          side: THREE.DoubleSide,
        };
        return createPassDepthColorMaterial(params);
      };
      const depthMaterial = Array.isArray(obj.material)
        ? obj.material.map(buildDepthMaterial)
        : buildDepthMaterial(obj.material);
      // Per-mesh PassBasicNodeMaterial swaps keep MMD-scale skeletons on the
      // same storage-skinning path as the depth swaps.
      const buildMaskMaterial = () => {
        const material = new PassBasicNodeMaterial();
        material.color.set(0xffffff);
        material.side = THREE.DoubleSide;
        return material;
      };
      const maskMaterial = Array.isArray(obj.material) ? obj.material.map(buildMaskMaterial) : buildMaskMaterial();
      shadowSwaps.push({ depthMaterial, maskMaterial, mesh: obj });
    });

    const headTracker = createHeadTracker(root, {
      forward: headBoneForward ? new THREE.Vector3(...headBoneForward) : undefined,
      up: headBoneUp ? new THREE.Vector3(...headBoneUp) : undefined,
    });

    const entry = {
      characterMeshes,
      headCenterOffset,
      headTracker,
      materials,
      root,
      shadowSwaps,
      slot: registered.length % MAX_MEASURE_SLOTS,
    };
    registered.push(entry);
    return entry;
  }

  function unregisterCharacterRoot(root) {
    const index = registered.findIndex((entry) => entry.root === root);
    if (index >= 0) registered.splice(index, 1);
  }

  function computeCharacterBounds() {
    boundsBox.makeEmpty();
    for (const entry of registered) {
      for (const mesh of entry.characterMeshes) {
        if (!mesh.visible) continue;
        // computeBoundingBox on skinned geometry ignores the pose; expand the
        // static box generously instead of paying per-vertex skinning on CPU.
        meshBox.setFromObject(mesh);
        if (!meshBox.isEmpty()) boundsBox.union(meshBox);
      }
    }
    if (boundsBox.isEmpty()) return false;
    boundsBox.getBoundingSphere(boundsSphere);
    boundsSphere.radius *= 1.15;
    return true;
  }

  function renderDepthPrepass(anyMaterials) {
    const needed = anyUniform(anyMaterials, (u) => (
      (u.rimLightMode?.value === 1 && u.useRimLight?.value) || (u.contactShadowStrength?.value ?? 0) > 0
    ));
    if (!needed) {
      setUniform(anyMaterials, 'sceneDepthReady', false);
      return;
    }

    // Outline hulls and fully transparent meshes must not write prepass depth:
    // the hull would put a rim around itself, and a transparent water plane
    // would occlude the swimmer's rim.
    visibilityRestore.length = 0;
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.visible) return;
      const materials = toMaterialArray(obj.material);
      // Fur shells discard by noise in their own shader; the override depth
      // material would write them as solid geometry, so keep them out too.
      const skip = obj.userData?.isToonOutline ||
        obj.userData?.isToonFurShell ||
        (materials.length > 0 && materials.every((mat) => mat?.transparent === true));
      if (skip) {
        obj.visible = false;
        visibilityRestore.push(obj);
      }
    });

    const previousOverride = scene.overrideMaterial;
    const previousTarget = renderer.getRenderTarget();
    scene.overrideMaterial = depthOverrideMaterial;
    renderer.setRenderTarget(depthTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(previousTarget);
    scene.overrideMaterial = previousOverride;

    for (const obj of visibilityRestore) obj.visible = true;
    visibilityRestore.length = 0;

    setUniform(anyMaterials, 'sceneDepthReady', true);
    setUniform(anyMaterials, 'sceneDepthTexture', depthTarget.texture);
    setUniform(anyMaterials, 'sceneDepthResolution', depthResolution);
    setUniform(anyMaterials, 'cameraNearPlane', camera.near);
    setUniform(anyMaterials, 'cameraFarPlane', camera.far);
    setUniform(anyMaterials, 'cameraProjection11', camera.projectionMatrix.elements[5]);
  }

  function renderSelfShadow(anyMaterials) {
    const needed = selfShadowOptions.enabled &&
      anyUniform(anyMaterials, (u) => u.selfShadowSourceMode?.value === 2 && (u.selfShadowStrength?.value ?? 0) >= 0);
    if (!needed || !computeCharacterBounds()) {
      setUniform(anyMaterials, 'charSelfShadowReady', false);
      return;
    }

    // Shadow direction: scene main light, or an art-directed camera-relative
    // angle (classic anime trick — face shadows stay pretty from any view).
    if (selfShadowOptions.directionMode === 'cameraRelative') {
      camera.getWorldQuaternion(cameraQuat);
      shadowLightDirection.set(0, 0, 1)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(selfShadowOptions.cameraRelativePitch))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(selfShadowOptions.cameraRelativeYaw))
        .applyQuaternion(cameraQuat)
        .normalize();
    } else {
      const light = findDirectionalLight();
      if (light) {
        shadowLightDirection.copy(light.position).sub(light.target?.position ?? tempVector.set(0, 0, 0)).normalize();
      } else {
        shadowLightDirection.set(0.35, 0.75, 0.55).normalize();
      }
    }

    // Tight-fit orthographic camera around only the registered characters:
    // all shadow-map texels are spent on the character, which is what makes a
    // 2k map produce crisp hair-on-face shadows.
    const radius = boundsSphere.radius;
    shadowCamera.left = -radius;
    shadowCamera.right = radius;
    shadowCamera.top = radius;
    shadowCamera.bottom = -radius;
    shadowCamera.near = 0.01;
    shadowCamera.far = radius * 2 + 0.1;
    shadowCamera.position.copy(boundsSphere.center).addScaledVector(shadowLightDirection, radius + 0.05);
    shadowCamera.up.set(0, 1, 0);
    if (Math.abs(shadowLightDirection.y) > 0.99) shadowCamera.up.set(0, 0, 1);
    shadowCamera.lookAt(boundsSphere.center);
    shadowCamera.coordinateSystem = renderer.coordinateSystem;
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    shadowMatrix.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    applyShadowClipAdjust(shadowMatrix, renderer);

    // Swap character materials to cutout-aware depth materials, render only
    // the character layer, restore.
    const restores = [];
    for (const entry of registered) {
      for (const { depthMaterial, mesh } of entry.shadowSwaps ?? []) {
        restores.push({ material: mesh.material, mesh });
        mesh.material = depthMaterial;
      }
    }

    const previousTarget = renderer.getRenderTarget();
    shadowCamera.layers.set(TOON_CHARACTER_LAYER);
    renderer.setRenderTarget(shadowTarget);
    renderer.clear();
    renderer.render(scene, shadowCamera);
    renderer.setRenderTarget(previousTarget);

    for (const { material, mesh } of restores) mesh.material = material;

    setUniform(anyMaterials, 'charSelfShadowReady', true);
    setUniform(anyMaterials, 'charSelfShadowMap', shadowTarget.texture);
    setUniform(anyMaterials, 'charSelfShadowMatrix', shadowMatrix);
    setUniform(anyMaterials, 'charSelfShadowLightDirection', shadowLightDirection);
    setUniform(anyMaterials, 'charSelfShadowTexelSize', 1 / selfShadowOptions.mapSize);
    setUniform(anyMaterials, 'charSelfShadowQuality', selfShadowOptions.quality);
    setUniform(anyMaterials, 'charSelfShadowSharpen', selfShadowOptions.sharpen);
    setUniform(anyMaterials, 'charSelfShadowNormalBias', selfShadowOptions.normalBias);
    setUniform(anyMaterials, 'charSelfShadowDepthBias', selfShadowOptions.depthBias);
    setUniform(anyMaterials, 'charSelfShadowFadeDistance', selfShadowOptions.fadeDistance);
    setUniform(anyMaterials, 'charSelfShadowNdotLFix', selfShadowOptions.ndotLFix);
  }

  function renderAverageShadowMeasure(anyMaterials) {
    const shadowSourceReady = environmentSunShadow.ready.value === true;
    const needed = shadowSourceReady &&
      anyUniform(anyMaterials, (u) => (u.averageShadowMeasuredBlend?.value ?? 0) > 0);
    if (!needed) {
      setUniform(anyMaterials, 'averageShadowMeasureReady', false);
      return;
    }

    const sphereData = measureNodeUniforms.sphereData.array;
    let count = 0;
    for (const entry of registered) {
      if (count >= MAX_MEASURE_SLOTS) break;
      meshBox.makeEmpty();
      for (const mesh of entry.characterMeshes) {
        if (mesh.visible) meshBox.expandByObject(mesh);
      }
      if (meshBox.isEmpty()) continue;
      meshBox.getBoundingSphere(boundsSphere);
      entry.slot = count;
      sphereData[count].set(boundsSphere.center.x, boundsSphere.center.y, boundsSphere.center.z, boundsSphere.radius);
      count += 1;
    }
    if (count === 0) {
      setUniform(anyMaterials, 'averageShadowMeasureReady', false);
      return;
    }

    measureNodeUniforms.sphereCount.value = count;
    measureMesh.material = ensureMeasureNodeMaterial();

    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(measureTarget);
    renderer.render(measureScene, measureCamera);
    renderer.setRenderTarget(previousTarget);

    for (const entry of registered) {
      setUniform(entry.materials, 'averageShadowMeasureReady', true);
      setUniform(entry.materials, 'averageShadowMeasureTexture', measureTarget.texture);
      setUniform(entry.materials, 'averageShadowMeasureSlot', (entry.slot + 0.5) / MAX_MEASURE_SLOTS);
    }
  }

  function renderCharacterMask() {
    if (!characterMaskEnabled || registered.length === 0) return null;
    if (!maskTarget) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      maskTarget = new THREE.WebGLRenderTarget(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1), {
        depthBuffer: true,
        stencilBuffer: false,
      });
      maskTarget.texture.name = 'ToonCharacterMask';
    }

    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousBackground = scene.background;
    const previousCameraLayers = camera.layers.mask;

    scene.background = null;
    // Swap per-mesh mask materials so MMD-scale skeletons keep the
    // storage-skinning path (see registerCharacterRoot).
    const maskSwapRestores = [];
    for (const entry of registered) {
      for (const swap of entry.shadowSwaps) {
        if (!swap.maskMaterial) continue;
        maskSwapRestores.push({ material: swap.mesh.material, mesh: swap.mesh });
        swap.mesh.material = swap.maskMaterial;
      }
    }
    camera.layers.set(TOON_CHARACTER_LAYER);
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(maskTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    for (const restore of maskSwapRestores) restore.mesh.material = restore.material;
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;
    camera.layers.mask = previousCameraLayers;
    return maskTarget.texture;
  }

  function updateHeadTracking() {
    for (const entry of registered) {
      if (!entry.headTracker) {
        setUniform(entry.materials, 'headDataReady', false);
        continue;
      }
      entry.headTracker.update();
      const { forward, position, up } = entry.headTracker.state;
      if (entry.headCenterOffset) {
        tempVector.copy(position).addScaledVector(up, entry.headCenterOffset);
      } else {
        tempVector.copy(position);
      }
      setUniform(entry.materials, 'headDataReady', true);
      setUniform(entry.materials, 'headPositionWS', tempVector);
      setUniform(entry.materials, 'headForwardWS', forward);
      setUniform(entry.materials, 'headUpWS', up);
    }
  }

  function update() {
    if (registered.length === 0) return;
    const anyMaterials = registered.flatMap((entry) => entry.materials);

    updateHeadTracking();
    if (depthPrepass) renderDepthPrepass(anyMaterials);
    renderSelfShadow(anyMaterials);
    renderAverageShadowMeasure(anyMaterials);
    renderCharacterMask();
  }

  function setSize(width, height, pixelRatio = renderer.getPixelRatio()) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    depthTarget.setSize(w, h);
    depthResolution.set(w, h);
    if (maskTarget) maskTarget.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  function dispose() {
    depthTarget.dispose();
    shadowTarget.dispose();
    measureTarget.dispose();
    maskTarget?.dispose();
    depthOverrideMaterial.dispose();
  }

  return {
    get characterMaskTexture() {
      return maskTarget?.texture ?? null;
    },
    get registeredCount() {
      return registered.length;
    },
    dispose,
    registerCharacterRoot,
    selfShadowCamera: shadowCamera,
    selfShadowOptions,
    setCharacterMaskEnabled(enabled) {
      characterMaskEnabled = Boolean(enabled);
    },
    setSize,
    unregisterCharacterRoot,
    update,
  };
}
