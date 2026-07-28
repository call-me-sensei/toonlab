// Rock Shader Lab's source-of-truth outdoor preview. The scene is assembled
// from the same contract, geometry, retained landscape, vegetation, sky,
// clouds, camera, and lighting used by the accepted spire comparison.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  exp2,
  float,
  fog,
  max,
  mix,
  positionWorld,
  sign,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  bindParityEnvironmentToObject,
} from '../../../src/environment/parityEnvironmentSurfaceBinding.js';
import { createEnvironmentGroundFieldPass } from '../../../src/environment/environmentGroundFieldPass.js';
import { createSourceEnvironmentTestContent } from '../../../src/environment/sourceEnvironmentTestContent.js';
import {
  createToonLabSourceSkyShFromCoefficients,
  installToonLabSourceSkyLightNode,
  tintToonLabSourceSkySh,
} from '../../../src/environment/toonLabSourceSkyLight.js';
import {
  applyToonLabDirectionalShadowFilterContract,
  computeToonLabDirectionalShadowBiasContract,
} from '../../../src/environment/toonLabSourceShadowFilter.js';
import {
  loadToonLabRockMaterialIndex,
  resolveToonLabRockMaterial,
} from '../../../src/environment/toonLabRockMaterialResolver.js';
import {
  applyRockShader,
  loadToonRockMaterialInputs,
} from '../../../src/rock-shader/index.js';
import { environmentGroundField } from '../../../src/shaders-tsl/chunks/environment-ground-field.js';
import {
  formatLabPreviewHour,
  sampleLabPreviewReferenceState,
} from '../previewEnvironmentContract.js';
import {
  createLabRenderer,
  resolveRendererKind,
} from '../rendererFactory.js';
import {
  createP18PreviewSettings,
  resolveP18PreviewComponentStyles,
} from './previewStyles.js';
import { createP18PreviewReferenceSky } from './referenceSky.js';

const PROFILE_REGISTRY_URL = '/assets-local/parity/single-rock/profiles.json';
const PROFILE_ROOT_URL = '/assets-local/parity/single-rock';
const LOCAL_ROCK_MATERIAL_BASE_URL = '/assets-local/reference-environment';
const LOCAL_ROCK_MATERIAL_LIBRARY_URL =
  `${LOCAL_ROCK_MATERIAL_BASE_URL}/rock-material-library.json`;
const CONTROL_SCENE_URL = `${PROFILE_ROOT_URL}/${['un', 'ity-scene.glb'].join('')}`;
const SPIRE_FIXTURE_MATERIAL = 'MV_RockSpire_Spires';

export const ROCK_SHADER_PREVIEW_FIXTURES = Object.freeze(
  Array.from({ length: 8 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return Object.freeze({
      assetName: `SM_RockSpire_Spire${number}`,
      groundInsetFraction: number === '05' ? 0.22 : 0.08,
      id: `spire-${number}`,
      label: `Spire ${number}`,
      sourceMaterial: SPIRE_FIXTURE_MATERIAL,
    });
  }),
);

const TIME_ANCHORS = Object.freeze([
  Object.freeze({
    ambientColor: [0.20, 0.28, 0.48],
    ambientEnergy: 0.72,
    currentTime: 950,
    dayCycleProgress: 0.75,
    directColor: [1.0, 0.55, 0.31],
    directEnergy: 0.58,
    elevationDegrees: 10,
    hour: 6,
    reverseAzimuth: true,
    skyEnergy: 0.82,
    skyTint: [0.72, 0.66, 0.82],
  }),
  Object.freeze({
    ambientColor: [1, 1, 1],
    ambientEnergy: 1,
    currentTime: 250,
    dayCycleProgress: 0,
    directColor: [1, 1, 1],
    directEnergy: 1,
    elevationDegrees: null,
    hour: 13,
    reverseAzimuth: false,
    skyEnergy: 1,
    skyTint: [1, 1, 1],
  }),
  Object.freeze({
    ambientColor: [0.18, 0.20, 0.45],
    ambientEnergy: 0.68,
    currentTime: 575,
    dayCycleProgress: 0.25,
    directColor: [1.0, 0.38, 0.16],
    directEnergy: 0.48,
    elevationDegrees: 8,
    hour: 18,
    reverseAzimuth: false,
    skyEnergy: 0.66,
    skyTint: [0.68, 0.48, 0.72],
  }),
  Object.freeze({
    ambientColor: [0.08, 0.15, 0.36],
    ambientEnergy: 0.42,
    currentTime: 740,
    dayCycleProgress: 0.5,
    directColor: [0.24, 0.38, 0.74],
    directEnergy: 0.16,
    elevationDegrees: 38,
    hour: 22,
    reverseAzimuth: true,
    skyEnergy: 0.34,
    skyTint: [0.10, 0.18, 0.42],
  }),
  Object.freeze({
    ambientColor: [0.20, 0.28, 0.48],
    ambientEnergy: 0.72,
    currentTime: 950,
    dayCycleProgress: 0.75,
    directColor: [1.0, 0.55, 0.31],
    directEnergy: 0.58,
    elevationDegrees: 10,
    hour: 30,
    reverseAzimuth: true,
    skyEnergy: 0.82,
    skyTint: [0.72, 0.66, 0.82],
  }),
]);

const NEUTRAL_TINTS = Object.freeze({
  flowers: [0.92, 0.9, 0.86],
  grass: [0.7, 0.76, 0.68],
  ground: [0.78, 0.8, 0.76],
  manufacturedProps: [0.78, 0.8, 0.82],
  rock: [0.72, 0.75, 0.8],
  tree: [0.74, 0.76, 0.72],
});

export async function createP18ReferenceRenderer() {
  const requestedKind = resolveRendererKind();
  const kind = 'webgpu';
  if (requestedKind !== kind) {
    const url = new URL(window.location.href);
    url.searchParams.set('renderer', kind);
    window.history.replaceState(null, '', url);
  }
  document.body.dataset.previewRendererRequirement = kind;
  if (!navigator.gpu) {
    throw new Error(
      'The exact P18 reference scene requires WebGPU. Portable shader WebGL validation is a separate release gate.',
    );
  }
  const adapter = await navigator.gpu.requestAdapter({
    featureLevel: 'compatibility',
  });
  const available = Number(adapter?.limits?.maxSampledTexturesPerShaderStage ?? 16);
  const sampledTextureLimit = Math.min(32, available);
  document.body.dataset.sampledTextureLimit = String(sampledTextureLimit);
  if (!adapter || sampledTextureLimit < 31) {
    throw new Error(
      'The P18 reference landscape needs a graphics adapter with at least 31 sampled textures per shader stage.',
    );
  }
  const device = await adapter.requestDevice({
    requiredFeatures: Array.from(adapter.features),
    requiredLimits: { maxSampledTexturesPerShaderStage: sampledTextureLimit },
  });
  return createLabRenderer({
    antialias: false,
    device,
    preserveDrawingBuffer: true,
    requiredLimits: { maxSampledTexturesPerShaderStage: sampledTextureLimit },
    reversedDepthBuffer: true,
  }, kind);
}

function lerpNumber(from, to, amount) {
  return THREE.MathUtils.lerp(from, to, amount);
}

function lerpArray(from, to, amount) {
  return from.map((value, index) => lerpNumber(value, to[index], amount));
}

export function sampleP18ReferenceTime(hourInput) {
  const normalizedHour = ((Number(hourInput) % 24) + 24) % 24;
  const hour = normalizedHour < 6 ? normalizedHour + 24 : normalizedHour;
  let from = TIME_ANCHORS[0];
  let to = TIME_ANCHORS[1];
  for (let index = 0; index < TIME_ANCHORS.length - 1; index += 1) {
    if (hour >= TIME_ANCHORS[index].hour && hour <= TIME_ANCHORS[index + 1].hour) {
      from = TIME_ANCHORS[index];
      to = TIME_ANCHORS[index + 1];
      break;
    }
  }
  const amount = (hour - from.hour) / Math.max(to.hour - from.hour, 0.0001);
  return {
    ambientColor: lerpArray(from.ambientColor, to.ambientColor, amount),
    ambientEnergy: lerpNumber(from.ambientEnergy, to.ambientEnergy, amount),
    currentTime: lerpNumber(from.currentTime, to.currentTime, amount),
    dayCycleProgress: lerpNumber(
      from.dayCycleProgress,
      to.dayCycleProgress,
      amount,
    ),
    directColor: lerpArray(from.directColor, to.directColor, amount),
    directEnergy: lerpNumber(from.directEnergy, to.directEnergy, amount),
    from,
    skyEnergy: lerpNumber(from.skyEnergy, to.skyEnergy, amount),
    skyTint: lerpArray(from.skyTint, to.skyTint, amount),
    to,
    amount,
  };
}

function linearLightColor(source) {
  return new THREE.Color().setRGB(
    source[0],
    source[1],
    source[2],
    THREE.SRGBColorSpace,
  );
}

function linearSrgb8Color(source) {
  return linearLightColor(source.slice(0, 3).map((channel) => channel / 255));
}

function convertStagePosition([x, y, z]) {
  return [x, y, -z];
}

function baseLightRay(contract) {
  const rotation = new THREE.Quaternion(...contract.sun.worldRotationQuaternion);
  const sourceRay = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize();
  return new THREE.Vector3(sourceRay.x, sourceRay.y, -sourceRay.z).normalize();
}

function anchorLightRay(baseRay, anchor) {
  if (anchor.elevationDegrees == null) return baseRay.clone();
  const horizontal = new THREE.Vector3(baseRay.x, 0, baseRay.z);
  if (horizontal.lengthSq() < 1e-8) horizontal.set(1, 0, 0);
  horizontal.normalize();
  if (anchor.reverseAzimuth) horizontal.negate();
  const elevation = THREE.MathUtils.degToRad(anchor.elevationDegrees);
  return horizontal.multiplyScalar(Math.cos(elevation))
    .add(new THREE.Vector3(0, -Math.sin(elevation), 0))
    .normalize();
}

function sampleLightRay(baseRay, timeState) {
  return anchorLightRay(baseRay, timeState.from)
    .lerp(anchorLightRay(baseRay, timeState.to), timeState.amount)
    .normalize();
}

export async function loadP18ReferenceContract() {
  const registryResponse = await fetch(PROFILE_REGISTRY_URL, { cache: 'no-store' });
  if (!registryResponse.ok) throw new Error('Reference profile registry is unavailable.');
  const registry = await registryResponse.json();
  const profile = registry.profiles?.find(
    (entry) => entry.materialCheckpoint === 'stylized-basic',
  );
  if (!profile?.contractPath) {
    throw new Error('The accepted outdoor comparison profile is missing.');
  }
  const response = await fetch(
    `${PROFILE_ROOT_URL}/${profile.contractPath}/contract.json`,
    { cache: 'no-store' },
  );
  if (!response.ok) throw new Error('Reference outdoor contract is unavailable.');
  const inherited = await response.json();
  return {
    ...inherited,
    checkpoint: profile.checkpoint ?? inherited.checkpoint,
    inheritedProfileId: inherited.profileId,
    materialCheckpoint: profile.materialCheckpoint,
    profileId: profile.id,
  };
}

async function loadReferenceSpireMaterialInputs() {
  const index = await loadToonLabRockMaterialIndex({
    url: LOCAL_ROCK_MATERIAL_LIBRARY_URL,
  });
  const fixture = ROCK_SHADER_PREVIEW_FIXTURES[4];
  const resolution = resolveToonLabRockMaterial(fixture.sourceMaterial, {
    allowFallback: false,
    index,
    sourceAssetName: fixture.assetName,
  });
  if (!resolution?.materialRecord || !resolution.isExact) {
    throw new Error('The accepted spire material could not be resolved exactly.');
  }
  const inputs = await loadToonRockMaterialInputs({
    baseUrl: LOCAL_ROCK_MATERIAL_BASE_URL,
    coordinates: {
      distanceScale: 1,
      zSign: 1,
    },
    includeInactiveTextures: true,
    manifest: index.manifest,
    material: resolution.materialRecord,
  });
  return {
    ...inputs,
    matchKind: resolution.matchKind,
  };
}

function normalizeSpireGeometry(geometry, contract, fixture) {
  geometry.computeBoundingBox();
  const sourceBounds = geometry.boundingBox.clone();
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const targetSize = new THREE.Vector3(...contract.rock.sourceMeshBounds.size);
  const targetCenter = new THREE.Vector3(...contract.rock.sourceMeshBounds.center);
  const scale = targetSize.y / sourceSize.y;
  const sourceAnchor = new THREE.Vector3(
    sourceCenter.x,
    sourceBounds.min.y,
    sourceCenter.z,
  );
  const targetAnchor = new THREE.Vector3(
    targetCenter.x,
    targetCenter.y - targetSize.y * 0.5
      - targetSize.y * fixture.groundInsetFraction,
    targetCenter.z,
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
    -sourceAnchor.x,
    -sourceAnchor.y,
    -sourceAnchor.z,
  ));
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale));
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
    targetAnchor.x,
    targetAnchor.y,
    targetAnchor.z,
  ));
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function findFirstMesh(root) {
  let result = null;
  root?.traverse?.((object) => {
    if (!result && object.isMesh) result = object;
  });
  return result;
}

function findControlRoots(sceneRoot) {
  let rockRoot = null;
  let groundRoot = null;
  sceneRoot.traverse((object) => {
    if (!rockRoot && object.name.includes('SM_CliffClassic2')) rockRoot = object;
    if (!groundRoot && /^Parity[_ ]Ground$/.test(object.name)) groundRoot = object;
  });
  if (!rockRoot) throw new Error('Reference control rock is missing.');
  if (!groundRoot) throw new Error('Reference control ground is missing.');
  groundRoot.visible = false;
  rockRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });
  return { groundRoot, rockRoot };
}

function createDirectionalLight(contract, ray, target) {
  const light = new THREE.DirectionalLight();
  light.name = 'Rock Lab reference sun';
  light.color.copy(linearLightColor(contract.sun.color));
  light.intensity = contract.sun.intensity;
  light.castShadow = true;
  light.position.copy(target).addScaledVector(ray, -35);
  light.target.position.copy(target);
  const shadowResolution = 2048;
  light.shadow.mapSize.set(shadowResolution, shadowResolution);
  light.shadow.camera.left = -10;
  light.shadow.camera.right = 10;
  light.shadow.camera.top = 10;
  light.shadow.camera.bottom = -10;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 70;
  light.shadow.bias = 0;
  light.shadow.normalBias = 0;
  light.shadow.radius = 0;
  const shadowContract = computeToonLabDirectionalShadowBiasContract({
    cascadeBiasDistribution: 1,
    csmDepthBias: 10,
    csmSlopeScaleDepthBias: 3,
    maxSlopeDepthBias: 1,
    radius: 10,
    receiverBias: 0,
    resolution: shadowResolution - 8,
    subjectDepthRange: 100,
    userShadowBias: 0.5,
    userShadowSlopeBias: 0.5,
  });
  applyToonLabDirectionalShadowFilterContract(light.shadow, shadowContract);
  light.shadow.toonLabLightDirectionToLight.copy(ray).negate();
  return light;
}

function createDiffuseSkyLight(contract) {
  const source = contract.skyLight;
  const rawSh = createToonLabSourceSkyShFromCoefficients(source.threeCoefficients);
  const tintedSh = tintToonLabSourceSkySh(
    rawSh,
    linearSrgb8Color(source.colorSrgb8),
  );
  const probe = new THREE.LightProbe(tintedSh.clone(), source.intensity);
  probe.name = 'Rock Lab reference diffuse sky light';
  probe.userData.referenceBaseSh = tintedSh;
  return probe;
}

function installReferenceHeightFog(scene, contract, sharedState) {
  const source = contract.sky?.heightFog;
  if (!source?.enabled) return;
  const fogDensityPerCm = Math.max(0, Number(source.density) / 1000);
  const heightFalloffPerCm = Math.max(0, Number(source.heightFalloff) / 1000);
  const startDistanceMeters = Math.max(0, Number(source.startDistance) / 100);
  const fogHeightCm = Number(source.heightCentimeters) || 0;
  const cameraToReceiver = positionWorld.sub(cameraPosition);
  const cameraToReceiverMeters = max(cameraToReceiver.length(), 0.000001);
  const exclusionAlpha = clamp(
    float(startDistanceMeters).div(cameraToReceiverMeters),
    0,
    1,
  );
  const rayLengthCm = max(
    cameraToReceiverMeters.sub(startDistanceMeters),
    0,
  ).mul(100);
  const rayDirectionHeightCm = cameraToReceiver.y
    .mul(float(1).sub(exclusionAlpha))
    .mul(100);
  const exclusionHeightCm = cameraPosition.y
    .add(cameraToReceiver.y.mul(exclusionAlpha))
    .mul(100);
  const exponent = max(
    float(heightFalloffPerCm).mul(exclusionHeightCm.sub(fogHeightCm)),
    -127,
  );
  const rayOriginTerms = exp2(exponent.negate()).mul(fogDensityPerCm);
  const falloff = max(float(heightFalloffPerCm).mul(rayDirectionHeightCm), -127);
  const absoluteFalloff = abs(falloff);
  const safeSign = mix(float(1), sign(falloff), step(0.000001, absoluteFalloff));
  const safeFalloff = safeSign.mul(max(absoluteFalloff, 0.000001));
  const lineIntegral = float(1).sub(exp2(falloff.negate())).div(safeFalloff);
  const lineIntegralTaylor = float(Math.LN2)
    .sub(falloff.mul(0.5 * Math.LN2 * Math.LN2));
  const sharedLineIntegral = rayOriginTerms.mul(mix(
    lineIntegralTaylor,
    lineIntegral,
    step(0.000001, absoluteFalloff),
  ));
  const fogFactor = exp2(sharedLineIntegral.mul(rayLengthCm).negate()).oneMinus();
  scene.fog = null;
  scene.fogNode = fog(
    vec3(...source.inscatteringColorLinear.slice(0, 3))
      .mul(sharedState.uniforms.fogTint)
      .mul(sharedState.uniforms.fogEnergy),
    clamp(fogFactor, 0, Math.min(Math.max(Number(source.maxOpacity) || 0, 0), 1)),
  );
}

function captureMaterialAssignments(root) {
  const assignments = new Map();
  root?.traverse?.((object) => {
    if (object.isMesh && object.material) assignments.set(object, object.material);
  });
  return assignments;
}

function makeNeutralMaterial(sourceMaterial, tint) {
  const material = new MeshBasicNodeMaterial();
  material.name = `${sourceMaterial.name || 'surface'} — neutral review`;
  material.colorNode = sourceMaterial.colorNode
    ? sourceMaterial.colorNode.mul(vec3(...tint))
    : vec3(...tint);
  material.opacityNode = sourceMaterial.opacityNode ?? null;
  material.alphaTestNode = sourceMaterial.alphaTestNode ?? null;
  material.transparent = sourceMaterial.transparent;
  material.alphaToCoverage = sourceMaterial.alphaToCoverage;
  material.depthTest = sourceMaterial.depthTest;
  material.depthWrite = sourceMaterial.depthWrite;
  material.side = sourceMaterial.side;
  material.fog = true;
  material.userData.rockPreviewNeutral = true;
  return material;
}

function createStyleTarget(root, componentId) {
  const originals = captureMaterialAssignments(root);
  const replacements = new Map();
  return {
    apply(style) {
      for (const [mesh, source] of originals) {
        if (style === 'call_me_sensei') {
          mesh.material = source;
          continue;
        }
        const sourceMaterials = Array.isArray(source) ? source : [source];
        const next = sourceMaterials.map((sourceMaterial) => {
          if (!replacements.has(sourceMaterial)) {
            replacements.set(
              sourceMaterial,
              makeNeutralMaterial(
                sourceMaterial,
                NEUTRAL_TINTS[componentId] ?? [0.8, 0.8, 0.8],
              ),
            );
          }
          return replacements.get(sourceMaterial);
        });
        mesh.material = Array.isArray(source) ? next : next[0];
      }
    },
    dispose() {
      replacements.forEach((material) => material.dispose());
    },
  };
}

function focusCameraOnRock(camera, contract, rockRoot) {
  const target = new THREE.Vector3(...convertStagePosition(contract.camera.lookAt));
  const position = new THREE.Vector3(...convertStagePosition(contract.camera.position));
  const offset = position.sub(target);
  const focus = new THREE.Box3()
    .setFromObject(rockRoot, true)
    .getCenter(new THREE.Vector3());
  camera.position.copy(focus).add(offset);
  camera.up.fromArray(convertStagePosition(contract.camera.up));
  camera.lookAt(focus);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return focus;
}

function disposeTree(root, excludedRoot = null) {
  const materials = new Set();
  const geometries = new Set();
  root?.traverse?.((object) => {
    if (!object.isMesh || excludedRoot?.getObjectById?.(object.id)) return;
    geometries.add(object.geometry);
    const source = Array.isArray(object.material) ? object.material : [object.material];
    source.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export async function createP18ShaderPreviewScene({
  authoredComponent = 'rock',
  camera,
  renderer,
  scene,
}) {
  const authoredComponents = new Set(
    (Array.isArray(authoredComponent) ? authoredComponent : [authoredComponent])
      .filter(Boolean),
  );
  const contract = await loadP18ReferenceContract();
  installToonLabSourceSkyLightNode(renderer);
  const baseRay = baseLightRay(contract);
  const sharedState = {
    uniforms: {
      currentTime: uniform(250),
      dayCycleProgress: uniform(0),
      fogEnergy: uniform(1),
      fogTint: uniform(new THREE.Vector3(1, 1, 1)),
      skyColor: uniform(new THREE.Color(0.45, 0.62, 0.9)),
      snowCover: uniform(0),
      sunDirection: uniform(baseRay.clone()),
      sunColor: uniform(new THREE.Color(1, 0.9, 0.72)),
      time: uniform(0),
    },
    userData: { preview: 'rock-shader-lab' },
  };

  const [
    controlGltf,
    referenceSky,
    environmentContent,
    spireMaterialInputs,
  ] = await Promise.all([
    new GLTFLoader().loadAsync(CONTROL_SCENE_URL),
    createP18PreviewReferenceSky(contract),
    createSourceEnvironmentTestContent({
      groundSize: contract.ground.size,
      materialCheckpoint: contract.materialCheckpoint,
      state: sharedState,
    }),
    loadReferenceSpireMaterialInputs(),
  ]);

  const { groundRoot: controlGround, rockRoot } = findControlRoots(controlGltf.scene);
  controlGround.visible = false;
  scene.add(controlGltf.scene);
  scene.add(environmentContent.group);
  if (referenceSky) scene.add(referenceSky.root);

  bindParityEnvironmentToObject(environmentContent.group, contract);
  scene.background = new THREE.Color(...contract.render.clearColor.slice(0, 3));
  const referenceClearColor = scene.background.clone();
  scene.environment = null;
  scene.environmentIntensity = 0;
  installReferenceHeightFog(scene, contract, sharedState);

  camera.fov = contract.camera.verticalFieldOfViewDegrees;
  camera.near = contract.camera.near;
  camera.far = contract.sky?.toonlabCameraFarMeters ?? contract.camera.far;

  const lightTarget = new THREE.Vector3(...convertStagePosition(contract.camera.lookAt));
  const sun = createDirectionalLight(contract, baseRay, lightTarget);
  const skyLight = createDiffuseSkyLight(contract);
  scene.add(sun, sun.target, skyLight);
  sun.target.updateMatrixWorld(true);

  const variantGeometryCache = new Map();
  let activeFixtureId = null;
  async function setRockFixture(fixtureId) {
    const fixture = ROCK_SHADER_PREVIEW_FIXTURES.find(({ id }) => id === fixtureId)
      ?? ROCK_SHADER_PREVIEW_FIXTURES[4];
    if (activeFixtureId === fixture.id) return;
    if (!variantGeometryCache.has(fixture.id)) {
      const gltf = await new GLTFLoader().loadAsync(
        `/assets-local/rock-references/${fixture.assetName}/lod0.glb`,
      );
      const mesh = findFirstMesh(gltf.scene);
      if (!mesh) throw new Error(`${fixture.label} has no renderable geometry.`);
      variantGeometryCache.set(
        fixture.id,
        normalizeSpireGeometry(mesh.geometry.clone(), contract, fixture),
      );
    }
    rockRoot.traverse((object) => {
      if (!object.isMesh) return;
      if (object.userData.rockPreviewFixtureGeometry) object.geometry.dispose();
      object.geometry = variantGeometryCache.get(fixture.id).clone();
      object.userData.rockPreviewFixtureGeometry = true;
    });
    activeFixtureId = fixture.id;
    document.body.dataset.previewRockFixture = fixture.id;
  }
  await setRockFixture('spire-05');
  const referenceRockTextures = {
    ...spireMaterialInputs.textures,
    // The accepted graph has no authored top-mask texture. A null slot is the
    // exact white source default, not the portable procedural fallback mask.
    topMask: null,
  };
  applyRockShader(rockRoot, { preset: 'call_me_sensei' }, {
    name: 'P18 reference rock shader',
    textures: referenceRockTextures,
  });
  document.body.dataset.referenceCheckpoint = contract.materialCheckpoint;
  document.body.dataset.referenceMaterialMatch = spireMaterialInputs.matchKind;

  const focus = focusCameraOnRock(camera, contract, rockRoot);
  const groundFieldPass = createEnvironmentGroundFieldPass({
    renderer,
    resolution: 2048,
    scene,
  });
  environmentGroundField.colorMipLevel.value = 4;
  groundFieldPass.update();

  const styleTargets = {
    flowers: createStyleTarget(environmentContent.flowers, 'flowers'),
    grass: createStyleTarget(environmentContent.grass, 'grass'),
    ground: createStyleTarget(environmentContent.groundRoot, 'ground'),
    manufacturedProps: createStyleTarget(
      environmentContent.stylizedBasic,
      'manufacturedProps',
    ),
    rock: createStyleTarget(rockRoot, 'rock'),
    tree: createStyleTarget(environmentContent.tree, 'tree'),
  };
  let lightingStyle = 'call_me_sensei';
  let lastTime = null;

  function applyComponentStyles(previewSettings) {
    const styles = resolveP18PreviewComponentStyles(previewSettings);
    for (const [componentId, target] of Object.entries(styleTargets)) {
      if (authoredComponents.has(componentId)) continue;
      target?.apply(styles[componentId]);
    }
    referenceSky?.setComponentStyles(styles);
    lightingStyle = styles.lighting;
    if (lastTime !== null) applyTime(lastTime);
    document.body.dataset.previewStyleBundle = previewSettings.bundle;
    document.body.dataset.previewComponentStyles = JSON.stringify(styles);
    return styles;
  }

  function applyComponentVisibility(previewSettings) {
    const settings = createP18PreviewSettings(previewSettings);
    const visible = { ...settings.componentVisibility };
    authoredComponents.forEach((componentId) => {
      visible[componentId] = true;
    });
    if (environmentContent.groundRoot) {
      environmentContent.groundRoot.visible = visible.ground;
    }
    if (environmentContent.grass) environmentContent.grass.visible = visible.grass;
    if (environmentContent.tree) environmentContent.tree.visible = visible.tree;
    if (environmentContent.flowers) {
      environmentContent.flowers.visible = visible.flowers;
    }
    if (environmentContent.stylizedBasic) {
      environmentContent.stylizedBasic.visible = visible.manufacturedProps;
    }
    rockRoot.visible = visible.rock;
    referenceSky?.setVisibility({
      clouds: visible.clouds,
      sky: visible.sky,
    });
    document.body.dataset.previewComponentVisibility = JSON.stringify(visible);
    return visible;
  }

  function applyTime(hour) {
    lastTime = hour;
    const timeState = sampleP18ReferenceTime(hour);
    const ray = sampleLightRay(baseRay, timeState);
    sharedState.uniforms.currentTime.value = timeState.currentTime;
    sharedState.uniforms.dayCycleProgress.value = timeState.dayCycleProgress;
    sharedState.uniforms.fogEnergy.value = timeState.skyEnergy;
    sharedState.uniforms.fogTint.value.fromArray(timeState.skyTint);
    sharedState.uniforms.sunDirection.value.copy(ray);

    sun.position.copy(lightTarget).addScaledVector(ray, -35);
    sun.shadow.toonLabLightDirectionToLight.copy(ray).negate();
    sun.color.copy(linearLightColor(contract.sun.color))
      .multiply(new THREE.Color(...timeState.directColor));
    sun.intensity = contract.sun.intensity * timeState.directEnergy;
    sharedState.uniforms.sunColor.value.copy(sun.color);
    sharedState.uniforms.skyColor.value.copy(linearLightColor(timeState.ambientColor));
    // The sky dome is intentionally camera-relative, but the clear color can
    // still appear behind cutout/culled pixels. Keep that fallback at the
    // exact P18 clear color at Day and tint/attenuate it with the same
    // preview-time state everywhere else.
    scene.background.copy(referenceClearColor)
      .multiply(new THREE.Color(...timeState.skyTint))
      .multiplyScalar(timeState.skyEnergy);

    const sourceSh = skyLight.userData.referenceBaseSh;
    const nextSh = sourceSh.clone();
    nextSh.coefficients.forEach((coefficient) => {
      if (lightingStyle === 'neutral_review') {
        const luminance = coefficient.x * 0.2126
          + coefficient.y * 0.7152
          + coefficient.z * 0.0722;
        coefficient.setScalar(luminance);
      }
      coefficient.multiply(
        new THREE.Vector3(...timeState.ambientColor),
      ).multiplyScalar(timeState.ambientEnergy);
    });
    skyLight.sh.copy(nextSh);
    skyLight.intensity = contract.skyLight.intensity;
    referenceSky?.setTime({
      energy: timeState.skyEnergy,
      tint: timeState.skyTint,
    });

    const reference = sampleLabPreviewReferenceState(hour);
    document.body.dataset.previewTimeOfDay = formatLabPreviewHour(reference.hour);
    document.body.dataset.previewPreset = reference.preset;
    document.body.dataset.previewShadowTint = reference.shadowTint;
    document.body.dataset.previewSkyColor = `#${linearLightColor(
      timeState.skyTint,
    ).getHexString(
      THREE.SRGBColorSpace,
    )}`;
    return {
      directColor: sun.color.clone(),
      reference,
      skyColor: linearLightColor(timeState.ambientColor),
      sunDirection: ray.clone().negate(),
      timeState,
    };
  }

  function resetCamera() {
    focusCameraOnRock(camera, contract, rockRoot);
    return focus.clone();
  }

  function setShadowExtent(value = 10) {
    const extent = THREE.MathUtils.clamp(Number(value) || 10, 10, 28);
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
    return extent;
  }

  return {
    applyComponentStyles,
    applyComponentVisibility,
    applyTime,
    contract,
    environmentContent,
    focus,
    resetCamera,
    rockRoot,
    rockProfile: spireMaterialInputs.profile,
    rockTextures: referenceRockTextures,
    setShadowExtent,
    setRockFixture,
    update(delta = 0) {
      const elapsed = Math.max(0, Math.min(Number(delta) || 0, 0.1));
      sharedState.uniforms.time.value += elapsed;
    },
    dispose() {
      groundFieldPass.dispose();
      Object.values(styleTargets).forEach((target) => target?.dispose());
      referenceSky?.dispose();
      variantGeometryCache.forEach((geometry) => geometry.dispose());
      disposeTree(controlGltf.scene, rockRoot);
      disposeTree(environmentContent.group);
      sun.dispose();
    },
  };
}
