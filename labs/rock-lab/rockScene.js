// Rock Lab preview scene: renderer, orbit camera, ground disc, sun rig,
// ambient fill. The ground is a normal environment mesh (converted by the
// same shader pass as the rocks) so it catches sun shadows and participates
// in the vertex-AO bake as an occluder.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';

import { createEnvironmentSunRig } from '../../src/environment/environmentRigs.js';
import { SO_STYLIZED_UNITY_RENDER_CONTRACT } from '../../src/environment/soStylizedUnityRendering.js';
import {
  configureSoStylizedUnityStageRenderer,
  createSoStylizedUnityStageLights,
} from '../../src/environment/soStylizedUnityStage.js';
import { installSoStylizedUnityUrpLighting } from '../../src/environment/soStylizedUnityUrpLighting.js';
import { createLabRenderer } from '../shared/rendererFactory.js';

const GROUND_RADIUS = 30;
const BASE_FOG = Object.freeze({ far: 160, near: 40 });

// Camera directions per ?captureView= (normalized offsets from the
// composition center; distance derives from the bounding sphere).
const CAPTURE_VIEWS = Object.freeze({
  front: [0, 0.18, 1],
  hero: [0.85, 0.45, 1.05],
  side: [1, 0.18, 0],
  top: [0.02, 1, 0.02],
});

function createUnityShadowReceiverMaterial() {
  // A neutral receiver isolates the renderer contract from terrain art while
  // still exercising the exact URP BRDF, ambient probe, and native shadow
  // attenuation used by the source rock. This is deliberately not a ToonLab
  // ground shader or a painted contact-shadow decal.
  const material = new MeshPhysicalNodeMaterial({
    color: 0x8b8d88,
    metalness: 0,
    roughness: 1,
  });
  material.name = 'Unity URP rock validation shadow receiver';
  material.userData.environmentShaderExclude = true;
  material.userData.soStylizedUnityShadowReceiver = true;
  installSoStylizedUnityUrpLighting(material, { workflow: 'metallic' });
  return material;
}

export function createRockScene({ container, unityShadowsEnabled = true }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true; // no skinned MMD casters here — native shadows are safe on all backends
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db8c9);
  scene.fog = new THREE.Fog(0x9db8c9, BASE_FOG.near, BASE_FOG.far);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(3.2, 1.8, 4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.screenSpacePanning = true;
  controls.target.set(0, 0.5, 0);

  // These are presentation metrics only. Source-reference geometry remains
  // in its authored coordinate system; the camera, fog, and ground adapt to
  // whatever scale that geometry actually uses.
  const presentation = {
    fogFar: BASE_FOG.far,
    fogNear: BASE_FOG.near,
    fogScale: 1,
    radius: 1,
  };

  function applyPresentationFog() {
    if (!scene.fog) return;
    const scale = Math.max(Number(presentation.fogScale) || 1, 0.01);
    scene.fog.near = presentation.fogNear / scale;
    scene.fog.far = presentation.fogFar / scale;
  }

  function setFogScale(scale = 1) {
    presentation.fogScale = Math.max(Number(scale) || 1, 0.01);
    applyPresentationFog();
  }

  function updateCameraDependentPresentation() {
    const radius = Math.max(presentation.radius, 0.5);
    const distance = Math.max(camera.position.distanceTo(controls.target), radius);
    // Keep the inspected asset completely in front of the clear-fog range.
    // Weather can still pull this range inward through setFogScale().
    presentation.fogNear = Math.max(BASE_FOG.near, distance + radius * 1.25);
    presentation.fogFar = Math.max(BASE_FOG.far, distance + radius * 5);
    applyPresentationFog();
  }

  controls.addEventListener('change', updateCameraDependentPresentation);

  // Everything under rockRoot is converted to the environment shader and
  // acts as a vertex-AO occluder; helpers stay outside it.
  const rockRoot = new THREE.Group();
  rockRoot.name = 'Rock Lab root';
  scene.add(rockRoot);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(GROUND_RADIUS, 64),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.4, 0.35) }),
  );
  ground.name = 'Ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  rockRoot.add(ground);

  const groundMaterials = {
    lab: ground.material,
    unity: createUnityShadowReceiverMaterial(),
  };

  const ambient = new THREE.AmbientLight(0xdfe8f2, 0.55);
  scene.add(ambient);

  // Unity validation lighting is a separate scene-graph branch. Toggling the
  // branch prevents the generic Rock Lab rig from leaking any fill or direct
  // light into the source-material result.
  const unityLightRoot = new THREE.Group();
  unityLightRoot.name = 'Unity source renderer lighting';
  scene.add(unityLightRoot);
  const unityStageLights = createSoStylizedUnityStageLights(unityLightRoot, {
    castShadow: unityShadowsEnabled,
    target: [0, 0, 0],
  });
  unityLightRoot.visible = false;

  const unityBackground = new THREE.Color().setRGB(
    ...SO_STYLIZED_UNITY_RENDER_CONTRACT.fog.colorLinear,
    THREE.LinearSRGBColorSpace,
  );
  const labBackground = scene.background.clone();
  const labFog = scene.fog;
  let renderAuthority = 'legacy';

  const environmentBox = new THREE.Box3(
    new THREE.Vector3(-3, -0.5, -3),
    new THREE.Vector3(3, 3, 3),
  );

  let sunRig = null;
  let sunRigBoxSize = 0;

  // Sky/weather overrides (rockSky.js): color + intensity + direction are
  // re-applied on every rig recreation, so time-of-day survives the
  // frustum-driven rebuilds.
  const sunState = {
    color: new THREE.Color(1.0, 0.94, 0.85),
    intensity: 1,
    sourceRatios: { x: -0.75, y: 1.4, z: -0.55 },
  };

  // (Re)creates the sun rig when the composition outgrows the shadow
  // frustum by >25% — recreation is cheap and keeps shadows crisp.
  function updateSunRig({ force = false } = {}) {
    const size = environmentBox.getSize(new THREE.Vector3()).length();
    if (sunRig && !force && size < sunRigBoxSize * 1.25 && size > sunRigBoxSize * 0.5) return;
    if (sunRig) {
      // The rig adds its group to the scene itself; removing the plain
      // return object (as the lab used to) leaked one rig per rebuild.
      scene.remove(sunRig.group);
      sunRig.dispose();
    }
    sunRig = createEnvironmentSunRig({
      accents: {
        beam: { enabled: false },
        disk: { enabled: false },
        shaft: { enabled: false },
        spill: { enabled: false },
      },
      color: sunState.color.clone(),
      environmentBox,
      intensity: sunState.intensity,
      scene,
      sourceRatios: { ...sunState.sourceRatios },
      targetRatios: { x: 0, y: 0, z: 0 },
    });
    sunRig.group.visible = renderAuthority !== 'source';
    sunRigBoxSize = size;
  }

  function updateUnityLightTarget() {
    const targetWorld = environmentBox.getCenter(new THREE.Vector3());
    const rayDirection = new THREE.Vector3(
      ...SO_STYLIZED_UNITY_RENDER_CONTRACT.sun.rayDirection,
    ).normalize();
    unityStageLights.light.target.position.copy(targetWorld);
    unityStageLights.light.position.copy(targetWorld).addScaledVector(rayDirection, -250);
    unityStageLights.light.target.updateMatrixWorld(true);
    unityStageLights.light.updateMatrixWorld(true);
  }

  function setRenderAuthority(value = 'legacy') {
    renderAuthority = value === 'source' ? 'source' : 'legacy';
    const source = renderAuthority === 'source';
    ambient.visible = !source;
    if (sunRig?.group) sunRig.group.visible = !source;
    unityLightRoot.visible = source;
    ground.material = source ? groundMaterials.unity : groundMaterials.lab;

    if (source) {
      configureSoStylizedUnityStageRenderer(renderer, scene);
      scene.background = unityBackground;
      scene.fog = null;
      camera.fov = SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.fieldOfView;
      camera.near = SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.near;
      camera.far = SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.far;
      updateUnityLightTarget();
    } else {
      scene.background = labBackground;
      scene.fog = labFog;
      camera.fov = 45;
      camera.near = Math.max(0.01, presentation.radius / 5000);
    }
    camera.updateProjectionMatrix();
    if (typeof document !== 'undefined') {
      document.body.dataset.rockRenderAuthority = renderAuthority;
      document.body.dataset.rockUnityAmbient = String(unityStageLights.ambient.visible && source);
      document.body.dataset.rockUnitySun = String(unityStageLights.light.visible && source);
      document.body.dataset.rockShadowReceiver = String(ground.receiveShadow && source);
    }
    return renderAuthority;
  }

  function registerLabGroundMaterial(material) {
    if (!material) return;
    groundMaterials.lab = material;
    ground.material = renderAuthority === 'source' ? groundMaterials.unity : groundMaterials.lab;
  }

  /** Applies sky/weather sun overrides and rebuilds the rig around them. */
  function setSunState({ color = null, intensity = null, sourceRatios = null } = {}) {
    if (color) sunState.color.copy(color);
    if (intensity !== null) sunState.intensity = intensity;
    if (sourceRatios) sunState.sourceRatios = { ...sourceRatios };
    updateSunRig({ force: true });
  }

  // AABB of the VISIBLE rock meshes (any nesting depth), excluding the
  // ground disc and hidden preview modes.
  function visibleContentBox(box) {
    box.makeEmpty();
    rockRoot.updateMatrixWorld(true);
    rockRoot.traverse((obj) => {
      if (!obj.isMesh || obj === ground || !obj.geometry?.boundingBox) return;
      let visible = obj.visible;
      for (let node = obj.parent; visible && node; node = node.parent) visible = node.visible;
      if (!visible) return;
      box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
    });
    return box;
  }

  /**
   * Recomputes the environment box from the rock meshes plus a slab of
   * ground around them (not the full disc, which would blow up the shadow
   * frustum and the untextured gradient range).
   */
  function updateEnvironmentBox() {
    const box = visibleContentBox(new THREE.Box3());
    if (box.isEmpty()) box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Keep the presentation floor outside the camera frustum even for the
    // kilometre-scale mountain backdrops, and place it just beneath the
    // authored bounds instead of assuming every source pivot sits at Y=0.
    // Tall, narrow spires push the camera back based on height, so horizontal
    // footprint alone is not enough to keep the circular floor edge offscreen.
    const groundRadius = Math.max(
      GROUND_RADIUS,
      Math.max(size.x, size.y, size.z) * 2.4,
    );
    const groundClearance = Math.max(0.001, size.y * 0.0005);
    ground.position.set(center.x, box.min.y - groundClearance, center.z);
    ground.scale.setScalar(groundRadius / GROUND_RADIUS);
    ground.updateMatrixWorld(true);
    const pad = Math.max(size.x, size.z) * 0.6;
    box.expandByVector(new THREE.Vector3(pad, 0, pad));
    box.min.y = Math.min(box.min.y, -0.01);
    environmentBox.copy(box);
    updateSunRig();
    updateUnityLightTarget();
    return environmentBox;
  }

  /** Frames the rock meshes (not the padded ground slab) for orbit or a
   *  fixed ?captureView= angle. */
  function frameComposition(view = null) {
    const box = visibleContentBox(new THREE.Box3());
    if (box.isEmpty()) box.copy(environmentBox);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
    const distance = (radius * 1.15) / Math.tan((camera.fov * Math.PI) / 360);
    const direction = new THREE.Vector3(...(CAPTURE_VIEWS[view] ?? CAPTURE_VIEWS.hero)).normalize();
    presentation.radius = radius;
    controls.minDistance = Math.max(0.05, radius * 0.05);
    controls.maxDistance = Math.max(100, distance * 8);
    camera.near = renderAuthority === 'source'
      ? SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.near
      : Math.max(0.01, radius / 5000);
    camera.far = renderAuthority === 'source'
      ? SO_STYLIZED_UNITY_RENDER_CONTRACT.camera.far
      : Math.max(400, controls.maxDistance + radius * 4);
    camera.updateProjectionMatrix();
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.update();
    updateCameraDependentPresentation();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  updateSunRig({ force: true });

  return {
    ambient,
    camera,
    controls,
    environmentBox,
    frameComposition,
    ground,
    getRenderAuthority: () => renderAuthority,
    registerLabGroundMaterial,
    renderer,
    rockRoot,
    scene,
    setFogScale,
    setRenderAuthority,
    setSunState,
    unityStageLights,
    updateEnvironmentBox,
  };
}
