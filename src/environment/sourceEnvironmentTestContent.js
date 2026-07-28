// Minimal source-asset content used to audit a shared outdoor environment.
//
// This module owns only scene content. Sky, sun, skylight, fog, exposure, and
// post remain owned by the caller so every parity content preset consumes the
// same environment implementation and contract.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  applyToonLabNamedSourceMaterials,
  applyToonLabSourceMaterials,
  createToonLabSourceEnvironmentState,
  createToonLabSourceMaterial,
} from './toonLabSourceMaterials.js';
import { loadToonLabSourceLibrary } from './toonLabSourceLibrary.js';
import {
  loadRockReferenceSourceMaterialProfile,
} from '../rockgen/reference/referenceSourceMaterial.js';
import {
  classifyUrbanPropSurface,
  createUrbanAnimePropNodeMaterial,
  createUrbanPropShaderControls,
} from '../../examples/urban-prop-shader/urbanPropMaterial.js';

const TOONLAB_SOURCE_PINE_LOD0_URL =
  '/assets-local/reference-materials/catalog-meshes/Trees/Pine/SM_Pine01/lod0.glb';
const TOONLAB_SOURCE_GRASS_LOD0_URL =
  '/assets-local/reference-materials/catalog-meshes/Foliage/SM_Grass1/lod0.glb';
const TOONLAB_SOURCE_DAISIES_LOD0_URL =
  '/assets-local/reference-materials/catalog-meshes/Foliage/SM_Flower_Daisies1/lod0.glb';
const P18_PROP_CONTRACT_URL =
  '/assets-local/parity/environment/p18-stylized-basic-props.json';
const P19_MOUNTAIN_CLIFF_CONTRACT_URL =
  '/assets-local/parity/environment/p19-mountain-cliff.json?v=4';
const TOONLAB_SOURCE_STYLIZED_BASIC_FIXTURES = Object.freeze([
  Object.freeze({
    name: 'SM_Beach_BandedTulip',
    url: '/assets-local/reference-materials/catalog-meshes/Misc/SM_Beach_BandedTulip/lod0.glb',
    positionMeters: [1.05, 0, -0.72],
    rotationYDegrees: -18,
    scale: 1,
    supportVertexQuantile: 0.18,
    castShadow: false,
  }),
  Object.freeze({
    name: 'SM_Beach_Conch',
    url: '/assets-local/reference-materials/catalog-meshes/Misc/SM_Beach_Conch/lod0.glb',
    positionMeters: [2.05, 0, -0.55],
    rotationYDegrees: 32,
    scale: 0.62,
    supportVertexQuantile: 0.18,
    castShadow: true,
  }),
  Object.freeze({
    name: 'SM_Beach_SandDollar',
    url: '/assets-local/reference-materials/catalog-meshes/Misc/SM_Beach_SandDollar/lod0.glb',
    positionMeters: [1.48, 0, -0.16],
    rotationYDegrees: 11,
    scale: 1,
    supportVertexQuantile: 0.18,
    castShadow: false,
  }),
  Object.freeze({
    name: 'SM_Beach_Scallop',
    url: '/assets-local/reference-materials/catalog-meshes/Misc/SM_Beach_Scallop/lod0.glb',
    positionMeters: [2.55, 0, -0.12],
    rotationYDegrees: -28,
    scale: 1,
    supportVertexQuantile: 0.18,
    castShadow: false,
  }),
  Object.freeze({
    name: 'SM_Beach_Starfish',
    url: '/assets-local/reference-materials/catalog-meshes/Misc/SM_Beach_Starfish/lod0.glb',
    positionMeters: [2.93, 0, -0.58],
    rotationYDegrees: 17,
    scale: 1,
    supportVertexQuantile: 0.18,
    castShadow: true,
  }),
]);
const TOONLAB_SOURCE_TOONLAB_SHOWCASE_HEIGHT_GRID_URL =
  '/assets-local/reference-materials/landscape-heightfields/ToonLabShowcase/'
  + 'p14-camera-render1-patch.json';
const TOONLAB_SOURCE_TOONLAB_SHOWCASE_GRASS_WEIGHT_URLS = Object.freeze({
  Grass: '/assets-local/reference-materials/landscape-weight-layers/ToonLabShowcase/'
    + '_source/raw/01-Grass.r8',
  SnowGrass: '/assets-local/reference-materials/landscape-weight-layers/ToonLabShowcase/'
    + '_source/raw/05-SnowGrass.r8',
  SnowGrassBlue: '/assets-local/reference-materials/landscape-weight-layers/ToonLabShowcase/'
    + '_source/raw/07-SnowGrassBlue.r8',
});
const TOONLAB_SOURCE_AUTO_CLIFF_NOISE_URL =
  '/assets-local/reference-materials/material-source/textures/'
  + 'ToonLab/Textures/Noise/T_NoiseStylized.png';
const TOONLAB_SOURCE_P15_GRASS_CONTRACT_URL =
  '/assets-local/reference-materials/grass/p15-toonlab-grass-contract.json';
const TOONLAB_SOURCE_P16_TREE_CONTRACT_URL =
  '/assets-local/reference-materials/trees/p16-toonlab-pine-contract.json';
const TOONLAB_SOURCE_P17_DAISY_CONTRACT_URL =
  '/assets-local/reference-materials/foliage/p17-toonlab-daisy-contract.json';
const LOCAL_MATERIAL_SOURCE_BASE_URL =
  '/assets-local/reference-materials/material-source';
const LOCAL_LANDSCAPE_WEIGHT_BASE_URL =
  '/assets-local/reference-materials/landscape-weight-layers/ToonLabShowcase';
const LOCAL_ENVIRONMENT_TEXTURE_BASE_URL =
  '/assets-local/reference-environment/environment-baseline';
const TOONLAB_VISUAL_TARGET_SOURCE_ASSET = 'Demonstration_ToonLabShowcase';
// CameraRender1's authored grassy foreground footprint in the retained
// ToonLabShowcase level, expressed in ToonLab world X/Y meters. The compact stage remains
// centered near the origin; source world-aligned material sampling is offset
// to this exact retained-demo patch.
const TOONLAB_VISUAL_TARGET_PATCH_XY_METERS = Object.freeze([
  198.76090883374,
  -181.1957621749962,
]);
const P14_GROUND_CHECKPOINT = 'ground';
const P15_GRASS_CHECKPOINT = 'grass';
const P16_TREE_CHECKPOINT = 'tree';
const P17_FLOWER_CHECKPOINT = 'flowers';
const P18_STYLIZED_BASIC_CHECKPOINT = 'stylized-basic';
const P19_MOUNTAIN_CLIFF_CHECKPOINT = 'mountain-cliff';

// P19's catalog GLBs are direct ToonLab exports. ToonLab bakes its X-forward,
// Y-right, Z-up mesh basis into glTF X-right, Y-up, -Z-forward vertices.
const TOONLAB_LANDSCAPE_ORIGIN_METERS = Object.freeze([-252, -252]);
const TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS = 63;
const TOONLAB_LANDSCAPE_COMPONENT_COUNT = 8;
const TOONLAB_LANDSCAPE_WEIGHTMAP_SIZE = 505;

export const SOURCE_ENVIRONMENT_TEST_CONTENT = Object.freeze({
  id: 'source-ground-grass-pine-daisies',
  ground: Object.freeze({
    layer: 'ToonLab M_Landscape grass branch',
    source: '/Game/ToonLab/Environment/Landscape/Materials/MI_Landscape_Snow',
    colorTexture: '/Game/ToonLab/Environment/Landscape/Textures/T_Grass1_BC',
    roughnessTexture: '/Game/ToonLab/Environment/Landscape/Textures/T_Grass1_R',
  }),
  grass: Object.freeze({
    densitySource: '/Game/ToonLab/Environment/Landscape/LG_Grass',
    landscapeLayer: '/Game/ToonLab/Environment/Landscape/LL_Grass',
    objectName: 'SM_Grass1',
    material: 'MI_Grass',
    shader: '/Game/ToonLab/Environment/Foliage/Materials/M_Foliage',
  }),
  tree: Object.freeze({
    objectName: 'SM_Pine01',
    materials: Object.freeze(['MI_PineBark', 'MI_PineLeaves']),
    shaders: Object.freeze([
      '/Game/ToonLab/Environment/Trees/Materials/M_Bark',
      '/Game/ToonLab/Environment/Trees/Materials/M_Leaves',
    ]),
  }),
  flowers: Object.freeze({
    objectName: 'Daisies',
    material: 'MI_Daisy',
    toonLabMesh: '/Game/ToonLab/Environment/Foliage/SM_Flower_Daisies1',
  }),
  stylizedBasic: Object.freeze({
    material: 'MI_BeachShells',
    objects: Object.freeze(
      TOONLAB_SOURCE_STYLIZED_BASIC_FIXTURES.map((fixture) => fixture.name),
    ),
    shader: '/Game/ToonLab/Materials/M_StylizedBasic',
    presentationShader: 'ToonLab Urban Anime Prop Shader v4 · WebGPU/TSL',
    testObjects: Object.freeze([
      'outdoor-bench.glb',
      'lamp_post_light.glb',
      'painted_sword.glb',
      'military_trenches_storage_crate_wood_worn_01_zjkocdjtq_mid.glb',
    ]),
  }),
  mountainCliff: Object.freeze({
    contract: P19_MOUNTAIN_CLIFF_CONTRACT_URL,
    families: Object.freeze(['M_Mountain', 'M_Rock']),
    fixtures: Object.freeze(['SM_Mountain01', 'SM_CliffClassic5']),
  }),
});

function createEnvironmentState(library, sharedState, {
  visualTargetGround = false,
} = {}) {
  const state = createToonLabSourceEnvironmentState(library);
  for (const [name, sourceUniform] of Object.entries(sharedState?.uniforms ?? {})) {
    if (state.uniforms[name] && sourceUniform) {
      state.uniforms[name] = sourceUniform;
    }
  }
  state.userData = {
    ...(sharedState?.userData ?? {}),
    authority: visualTargetGround
      ? 'P14 ToonLab Visual Target ground graph'
      : 'P13 retained source environment baseline',
    ...(visualTargetGround
      ? { worldOffsetToonLabMeters: [...TOONLAB_VISUAL_TARGET_PATCH_XY_METERS] }
      : {}),
  };
  return state;
}

function retainedActorPosition(actorMetadata, heightGrid) {
  const locationCm = actorMetadata?.locationCm;
  if (!Array.isArray(locationCm) || locationCm.length < 3) return null;
  const position = attachToonLabTranslationToRetainedLandscape(
    locationCm,
    heightGrid,
    new THREE.Vector3(),
  );
  return position ? position.toArray() : null;
}

async function makeGroundMaterial({
  library,
  state,
  visualTargetGround,
}) {
  const material = await createToonLabSourceMaterial(
    visualTargetGround ? 'MI_Landscape_Snow' : 'MI_LandscapeVol1',
    {
    library,
    sourceAssetName: visualTargetGround ? TOONLAB_VISUAL_TARGET_SOURCE_ASSET : null,
    state,
    },
  );
  material.name = visualTargetGround
    ? 'P14 Visual Target MI_Landscape_Snow full painted graph'
    : 'P13 retained MI_LandscapeVol1 ground baseline';
  material.userData.sourceEnvironmentGround = {
    layer: SOURCE_ENVIRONMENT_TEST_CONTENT.ground.layer,
    source: SOURCE_ENVIRONMENT_TEST_CONTENT.ground.source,
    colorTexture: SOURCE_ENVIRONMENT_TEST_CONTENT.ground.colorTexture,
    roughnessTexture: SOURCE_ENVIRONMENT_TEST_CONTENT.ground.roughnessTexture,
    globalScaleMeters: 16,
    graph: '/Game/ToonLab/Environment/Landscape/Materials/M_Landscape',
    checkpoint: visualTargetGround ? 'P14' : 'P13',
    coordinateAdapter: visualTargetGround
      ? {
          anchorToonLabWorldMeters: [...TOONLAB_VISUAL_TARGET_PATCH_XY_METERS],
          threeToToonLabLandscapeXY: '(-positionWorld.z, positionWorld.x)',
          weightmapOriginCm: [-25200, -25200],
          weightmapQuadScaleCm: [100, 100],
        }
      : null,
    policy: visualTargetGround
      ? 'Full ToonLabShowcase ToonLab source graph with the retained scene weightmap authority.'
      : 'Frozen pre-P14 landscape baseline; P14 owns the ground-only delta.',
  };
  // P15's MI_Grass samples the landscape Runtime Virtual Texture. The
  // top-down ground-field pass needs the exact P14 flat albedo graph rather
  // than a generic color/map approximation.
  material.userData.createGroundColorVariant = () => {
    const variant = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    variant.name = `${material.name} — RVT ground-color writer`;
    variant.colorNode = material.colorNode;
    return variant;
  };
  material.userData.createGroundSurfaceVariant = () => {
    const variant = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    variant.name = `${material.name} — RVT ground-surface writer`;
    variant.colorNode = vec3(
      material.roughnessNode ?? material.roughness ?? 0.5,
      material.specularIntensityNode ?? 0.5,
      material.metalnessNode ?? material.metalness ?? 0,
    );
    return variant;
  };
  return material;
}

function preparePlacedSource(object, {
  name,
  position,
  rotationYDegrees = 0,
  scale,
  castShadow,
  receiveShadow,
}) {
  const clone = object.clone(true);
  clone.name = name;
  clone.position.fromArray(position);
  clone.rotation.set(0, THREE.MathUtils.degToRad(rotationYDegrees), 0);
  clone.scale.setScalar(scale);
  clone.visible = true;
  clone.traverse((child) => {
    child.visible = true;
    if (!child.isMesh) return;
    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;
  });
  return clone;
}

function appliedMaterialContracts(root) {
  const contracts = [];
  const seen = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      const source = material?.userData?.toonLabSource;
      const key = `${material?.name ?? ''}|${source?.materialPath ?? ''}`;
      if (!source || seen.has(key)) continue;
      seen.add(key);
      contracts.push({
        contract: source.contract ?? null,
        material: material.name,
        reconstruction: source.reconstruction ?? null,
        sourceEngine: source.sourceEngine ?? null,
        sourcePath: source.materialPath ?? null,
      });
    }
  });
  return contracts;
}

async function createP18StylizedBasicFixtures({
  heightGrid,
  library,
  loadedFixtures,
  propContract,
  propGltfs,
  state,
}) {
  const group = new THREE.Group();
  group.name = 'P18 urban-shaded object fixtures and overlook vignette';
  const reports = [];
  const urbanControls = createUrbanPropShaderControls('source');
  const createUrbanMaterial = (object, sourceMaterial, sourceAssetName) => {
    const surface = classifyUrbanPropSurface(object, sourceMaterial);
    const material = createUrbanAnimePropNodeMaterial(sourceMaterial, {
      controls: urbanControls,
      surface,
    });
    material.userData.p18UrbanPresentation = {
      renderer: 'WebGPU/TSL',
      shader: 'ToonLab Urban Anime Prop Shader v4',
      sourceAssetName,
      sourceMaterial: sourceMaterial?.name ?? null,
      surface,
    };
    return material;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const vertex = new THREE.Vector3();
  const worldVertexHeightQuantile = (root, quantile) => {
    const heights = [];
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      const positions = child.isMesh
        ? child.geometry?.getAttribute('position')
        : null;
      if (!positions) return;
      for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
        vertex.fromBufferAttribute(positions, vertexIndex)
          .applyMatrix4(child.matrixWorld);
        heights.push(vertex.y);
      }
    });
    if (heights.length === 0) {
      throw new Error(`${root.name} has no geometry vertices for terrain support.`);
    }
    heights.sort((a, b) => a - b);
    const index = Math.round(
      THREE.MathUtils.clamp(Number(quantile), 0, 1) * (heights.length - 1),
    );
    return heights[index];
  };
  for (let index = 0; index < TOONLAB_SOURCE_STYLIZED_BASIC_FIXTURES.length; index += 1) {
    const fixture = TOONLAB_SOURCE_STYLIZED_BASIC_FIXTURES[index];
    const object = loadedFixtures[index].scene.clone(true);
    object.name = `P18 ${fixture.name} source LOD0`;
    const report = await applyToonLabSourceMaterials(object, {
      library,
      sourceAssetName: fixture.name,
      state,
    });
    if (report.unresolved.length > 0) {
      throw new Error(`P18 ${fixture.name} material slots unresolved: ${
        report.unresolved.map((entry) => entry.material).join(', ')
      }`);
    }
    reports.push(report);
    object.traverse((child) => {
      if (!child.isMesh || !child.material || !child.visible) return;
      const materialWasArray = Array.isArray(child.material);
      const sourceMaterials = materialWasArray ? child.material : [child.material];
      const urbanMaterials = sourceMaterials.map((sourceMaterial) => (
        createUrbanMaterial(child, sourceMaterial, fixture.name)
      ));
      child.material = materialWasArray ? urbanMaterials : urbanMaterials[0];
    });

    const position = new THREE.Vector3();
    const terrainNormal = new THREE.Vector3();
    if (!attachLocalTranslationToRetainedLandscape(
      fixture.positionMeters,
      heightGrid,
      position,
      terrainNormal,
    )) {
      throw new Error(`P18 ${fixture.name} has no valid terrain attachment.`);
    }
    object.position.copy(position);
    object.quaternion.setFromUnitVectors(up, terrainNormal);
    object.rotateY(THREE.MathUtils.degToRad(fixture.rotationYDegrees));
    object.scale.setScalar(fixture.scale);
    object.updateMatrixWorld(true);

    // The supplied shell origins sit at authored pivots slightly inside the
    // surface. Resolve the support offset from the unchanged LOD0 geometry so
    // the fixture remains attached if P14 terrain is regenerated or edited.
    const supportVertexQuantile = Number(
      fixture.supportVertexQuantile ?? 0,
    );
    const supportPlaneY = worldVertexHeightQuantile(
      object,
      supportVertexQuantile,
    );
    const supportInset = supportPlaneY
      - new THREE.Box3().setFromObject(object).min.y;
    object.position.y += position.y - supportPlaneY;
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = fixture.castShadow;
      child.receiveShadow = true;
      child.userData.p18StylizedBasicFixture = fixture.name;
    });
    object.userData.p18StylizedBasicFixture = {
      material: 'MI_BeachShells',
      presentationMaterial: 'ToonLab Urban Anime Prop Shader v4 · WebGPU/TSL',
      positionMeters: [...fixture.positionMeters],
      rotationYDegrees: fixture.rotationYDegrees,
      scale: fixture.scale,
      supportVertexQuantile,
      supportInsetMeters: supportInset,
      castShadow: fixture.castShadow,
      receiveShadow: true,
      shader: '/Game/ToonLab/Materials/M_StylizedBasic',
      presentationShader: 'ToonLab Urban Anime Prop Shader v4',
      sourceAssetName: fixture.name,
      sourceLod: 0,
      terrainAttachment:
        'runtime P14 heightfield + geometry support offset - proportional burial',
    };
    group.add(object);
  }

  if (
    propContract?.schema !== 'toonlab.p18-stylized-basic-prop-contract'
    || !Array.isArray(propContract.props)
    || propContract.props.length !== propGltfs.length
  ) {
    throw new Error('P18 shared prop contract is missing or inconsistent.');
  }

  const propFixtures = [];
  const settleLowestSupportEnvelope = (
    root,
    {
      insetMeters = 0,
      toleranceMeters = 0.025,
    } = {},
  ) => {
    const points = [];
    const supportVertex = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!child.isMesh || !child.visible) return;
      const positions = child.geometry?.getAttribute('position');
      if (!positions) return;
      for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
        supportVertex.fromBufferAttribute(positions, vertexIndex)
          .applyMatrix4(child.matrixWorld);
        points.push(supportVertex.clone());
      }
    });
    if (points.length === 0) {
      throw new Error(`${root.name} has no visible geometry vertices for grounding.`);
    }
    const localPoints = points.map((point) => root.worldToLocal(point.clone()));
    const lowestSupportY = localPoints.reduce(
      (minimum, point) => Math.min(minimum, point.y),
      Infinity,
    );
    // Pick support vertices in the prop's own up-axis. World-Y filtering drops
    // the uphill side of slope-aligned objects and lets that edge sink.
    const supportPoints = points.filter(
      (_point, index) => localPoints[index].y <= lowestSupportY + toleranceMeters,
    );
    // Every support point must remain on or above the terrain. Taking the
    // minimum shift only grounds the lowest terrain sample and buries the rest
    // of a wide prop on a slope; the maximum is the actual no-penetration
    // constraint.
    const requiredShiftY = supportPoints.reduce((maximumShift, point) => {
      const terrainY = sampleHeightField(heightGrid, point.x, point.z);
      return Math.max(
        maximumShift,
        terrainY - insetMeters - point.y,
      );
    }, -Infinity);
    if (!Number.isFinite(requiredShiftY)) {
      throw new Error(`${root.name} has no valid terrain support samples.`);
    }
    root.position.y += requiredShiftY;
    root.updateMatrixWorld(true);
    return {
      insetMeters,
      lowestSupportY,
      requiredShiftY,
      supportPointCount: supportPoints.length,
      toleranceMeters,
    };
  };
  for (let index = 0; index < propContract.props.length; index += 1) {
    const prop = propContract.props[index];
    const object = propGltfs[index].scene.clone(true);
    object.name = `${prop.label} — ${prop.id}`;

    // The bench source contains two authored design alternatives. P18 uses
    // one deliberate seat, so hide every sibling design rather than placing
    // both variants next to each other.
    if (prop.sourceNode) {
      const selected = object.getObjectByName(prop.sourceNode);
      if (!selected) {
        throw new Error(`P18 ${prop.id} source node is missing: ${prop.sourceNode}`);
      }
      const selectedAncestors = new Set();
      for (let current = selected; current; current = current.parent) {
        selectedAncestors.add(current);
      }
      const selectedTree = new Set();
      selected.traverse((child) => selectedTree.add(child));
      object.traverse((child) => {
        if (
          child === object
          || selectedAncestors.has(child)
          || selectedTree.has(child)
        ) return;
        child.visible = false;
      });
    }

    const materialJobs = [];
    object.traverse((child) => {
      if (!child.isMesh || !child.material || !child.visible) return;
      const materialWasArray = Array.isArray(child.material);
      const originals = materialWasArray ? child.material : [child.material];
      materialJobs.push(Promise.all(originals.map(async (original) => {
        const translucentGlass = prop.id === 'lamp-post'
          && (
            original.transparent
            || original.name === 'T_light_glass_1001'
          );
        if (translucentGlass) {
          const passthrough = original.clone();
          passthrough.userData = {
            ...original.userData,
            p18ExcludedFamily: 'translucent-glass',
            p18Policy: 'Frozen passthrough; the later glass family owns this material.',
          };
          return passthrough;
        }
        const materialOverride = prop.materialOverrides?.[original.name] ?? null;
        const sourceMaterial = materialOverride?.baseColorSrgb
          ? original.clone()
          : original;
        if (materialOverride?.baseColorSrgb) {
          sourceMaterial.color.setRGB(
            ...materialOverride.baseColorSrgb,
            THREE.SRGBColorSpace,
          );
          sourceMaterial.userData = {
            ...sourceMaterial.userData,
            p18PortableMaterialOverride: materialOverride,
          };
        }
        return createUrbanMaterial(child, sourceMaterial, prop.id);
      })).then((materials) => {
        child.material = materialWasArray ? materials : materials[0];
        child.castShadow = Boolean(prop.castShadow);
        child.receiveShadow = Boolean(prop.receiveShadow);
        child.userData.p18StylizedBasicFixture = prop.id;
      }));
    });
    await Promise.all(materialJobs);

    const canonicalPosition = prop.canonicalPositionMeters;
    const localTranslation = [
      canonicalPosition[0],
      canonicalPosition[1],
      -canonicalPosition[2],
    ];
    const position = new THREE.Vector3();
    const terrainNormal = new THREE.Vector3();
    if (!attachLocalTranslationToRetainedLandscape(
      localTranslation,
      heightGrid,
      position,
      terrainNormal,
    )) {
      throw new Error(`P18 ${prop.id} has no valid terrain attachment.`);
    }
    object.position.copy(position);
    const slopeQuaternion = prop.alignToTerrainNormal === false
      ? new THREE.Quaternion()
      : new THREE.Quaternion().setFromUnitVectors(up, terrainNormal);
    const rotation = prop.toonlabRotationEulerDegrees
      ?? [
        prop.canonicalRotationEulerDegrees[0],
        -prop.canonicalRotationEulerDegrees[1],
        -prop.canonicalRotationEulerDegrees[2],
      ];
    const authoredQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(rotation[0]),
        THREE.MathUtils.degToRad(rotation[1]),
        THREE.MathUtils.degToRad(rotation[2]),
        'YXZ',
      ),
    );
    object.quaternion.copy(slopeQuaternion).multiply(authoredQuaternion);
    object.scale.fromArray(prop.canonicalScale);
    object.updateMatrixWorld(true);
    let terrainSupport;
    if (prop.groundingMode === 'lowest-support-envelope') {
      terrainSupport = settleLowestSupportEnvelope(object, {
        insetMeters: Number(prop.groundInsetMeters ?? 0),
        toleranceMeters: Number(prop.supportVertexToleranceMeters ?? 0.025),
      });
    } else {
      const bounds = new THREE.Box3().setFromObject(object);
      object.position.y += position.y
        - bounds.min.y
        - Number(prop.groundInsetMeters ?? 0);
      object.updateMatrixWorld(true);
      terrainSupport = {
        insetMeters: Number(prop.groundInsetMeters ?? 0),
        mode: 'center-sample-bounds-min',
      };
    }
    object.userData.p18StylizedBasicFixture = {
      ...prop,
      canonicalCoordinates: 'ToonLab-style left-handed metres',
      material: 'ToonLab Urban Anime Prop Shader v4 from authored GLB PBR inputs',
      shader: 'ToonLab Urban Anime Prop Shader v4 · WebGPU/TSL',
      sourceMaterialFamily: prop.materialFamily,
      sourceLod: 'supplied GLB',
      terrainAttachmentResolved:
        'runtime P14 heightfield + geometry support offset - ground inset',
      terrainSupport,
    };
    group.add(object);
    propFixtures.push(object.userData.p18StylizedBasicFixture);
  }

  group.userData.p18StylizedBasic = {
    benchmark: propFixtures,
    fixtures: TOONLAB_SOURCE_STYLIZED_BASIC_FIXTURES.map((fixture) => ({
      ...fixture,
    })),
    material: 'ToonLab Urban Anime Prop Shader v4 · WebGPU/TSL',
    materialContracts: appliedMaterialContracts(group),
    policy: 'P18 presents every opaque shell and prop fixture with the urban shader; lamp glass and P14-P17 nature materials remain frozen.',
    propContract: P18_PROP_CONTRACT_URL,
    props: propFixtures,
    shader: 'ToonLab Urban Anime Prop Shader v4 · WebGPU/TSL',
    sourceShader: '/Game/ToonLab/Materials/M_StylizedBasic',
  };
  return { group, reports };
}

async function loadJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function loadR8(url, expectedLength) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== expectedLength) {
    throw new Error(
      `${url} has ${bytes.length} bytes; expected ${expectedLength}.`,
    );
  }
  return bytes;
}

async function loadSrgbImageRedChannel(url) {
  const image = await new THREE.ImageLoader().loadAsync(url);
  const width = Number(image.naturalWidth ?? image.videoWidth ?? image.width);
  const height = Number(image.naturalHeight ?? image.videoHeight ?? image.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`${url} did not decode to a valid image.`);
  }
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error(`Could not create a readback surface for ${url}.`);
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const values = new Float32Array(width * height);
  for (let index = 0; index < values.length; index += 1) {
    const encoded = rgba[index * 4] / 255;
    // T_NoiseStylized is authored as sRGB in ToonLab. Texture sampling decodes it
    // before AutoCliff multiplies it, so the CPU placement oracle must too.
    values[index] = encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  }
  return { height, values, width };
}

function createRetainedLandscapePatch(heightGrid, groundMaterial, {
  groundFieldWriter = false,
} = {}) {
  if (heightGrid?.schema !== 'toonlab.landscape-height-grid') {
    throw new Error('P14 retained Landscape height grid has an invalid schema.');
  }
  const sampleCount = Number(heightGrid.sampleCount);
  const step = Number(heightGrid.stepMeters);
  const halfExtent = Number(heightGrid.halfExtentMeters);
  const heights = heightGrid.heightsMeters;
  const normals = heightGrid.normals;
  const vertexCount = sampleCount * sampleCount;
  if (
    !Number.isInteger(sampleCount)
    || sampleCount < 2
    || heights?.length !== vertexCount
    || normals?.length !== vertexCount * 3
  ) {
    throw new Error('P14 retained Landscape height grid dimensions are invalid.');
  }

  const positions = new Float32Array(vertexCount * 3);
  const normalValues = new Float32Array(normals);
  const uvs = new Float32Array(vertexCount * 2);
  for (let zIndex = 0; zIndex < sampleCount; zIndex += 1) {
    const localZ = -halfExtent + zIndex * step;
    for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
      const localX = -halfExtent + xIndex * step;
      const vertex = zIndex * sampleCount + xIndex;
      positions[vertex * 3] = localX;
      positions[vertex * 3 + 1] = Number(heights[vertex]);
      positions[vertex * 3 + 2] = localZ;
      uvs[vertex * 2] = xIndex / (sampleCount - 1);
      uvs[vertex * 2 + 1] = zIndex / (sampleCount - 1);
    }
  }
  const triangleCount = (sampleCount - 1) * (sampleCount - 1) * 2;
  const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(triangleCount * 3);
  let cursor = 0;
  for (let zIndex = 0; zIndex < sampleCount - 1; zIndex += 1) {
    for (let xIndex = 0; xIndex < sampleCount - 1; xIndex += 1) {
      const a = zIndex * sampleCount + xIndex;
      const b = a + 1;
      const c = a + sampleCount;
      const d = c + 1;
      // Counter-clockwise when viewed from above in Three's +Y-up frame.
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normalValues, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const patch = new THREE.Mesh(geometry, groundMaterial);
  patch.name = 'P14 native ToonLabShowcase Landscape heightfield patch';
  patch.castShadow = false;
  patch.receiveShadow = true;
  patch.frustumCulled = false;
  patch.userData.groundFieldWrite = groundFieldWriter;
  patch.userData.sourceLandscapePatch = {
    anchorToonLabWorldMeters: [...TOONLAB_VISUAL_TARGET_PATCH_XY_METERS],
    anchorHeightCentimeters: heightGrid.anchorHeightCentimeters,
    geometry: TOONLAB_SOURCE_TOONLAB_SHOWCASE_HEIGHT_GRID_URL,
    halfExtentMeters: halfExtent,
    sampleCount,
    stepMeters: step,
    threeToToonLabLandscapeXY: '(-positionWorld.z, positionWorld.x) + anchor',
    verticalPlacement: 'native ToonLab Landscape collision samples relative to anchor',
  };
  return patch;
}

function parsePerPlatformDefault(value, fallback) {
  if (Number.isFinite(value)) return Number(value);
  const match = String(value ?? '').match(/default:\s*(-?\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : fallback;
}

function bilinearScalar(values, size, x, y) {
  const clampedX = THREE.MathUtils.clamp(x, 0, size - 1);
  const clampedY = THREE.MathUtils.clamp(y, 0, size - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const a = THREE.MathUtils.lerp(values[y0 * size + x0], values[y0 * size + x1], tx);
  const b = THREE.MathUtils.lerp(values[y1 * size + x0], values[y1 * size + x1], tx);
  return THREE.MathUtils.lerp(a, b, ty);
}

function sampleHeightField(heightGrid, localX, localZ, normalTarget) {
  const size = Number(heightGrid.sampleCount);
  const step = Number(heightGrid.stepMeters);
  const halfExtent = Number(heightGrid.halfExtentMeters);
  const gridX = (localX + halfExtent) / step;
  const gridZ = (localZ + halfExtent) / step;
  const height = bilinearScalar(heightGrid.heightsMeters, size, gridX, gridZ);
  if (normalTarget) {
    const normals = heightGrid.normals;
    const clampedX = THREE.MathUtils.clamp(gridX, 0, size - 1);
    const clampedZ = THREE.MathUtils.clamp(gridZ, 0, size - 1);
    const x0 = Math.floor(clampedX);
    const z0 = Math.floor(clampedZ);
    const x1 = Math.min(x0 + 1, size - 1);
    const z1 = Math.min(z0 + 1, size - 1);
    const tx = clampedX - x0;
    const tz = clampedZ - z0;
    const normalAt = (x, z, axis) => normals[(z * size + x) * 3 + axis];
    for (let axis = 0; axis < 3; axis += 1) {
      const a = THREE.MathUtils.lerp(normalAt(x0, z0, axis), normalAt(x1, z0, axis), tx);
      const b = THREE.MathUtils.lerp(normalAt(x0, z1, axis), normalAt(x1, z1, axis), tx);
      normalTarget.setComponent(axis, THREE.MathUtils.lerp(a, b, tz));
    }
    normalTarget.normalize();
  }
  return height;
}

function attachToonLabTranslationToRetainedLandscape(
  translationCm,
  heightGrid,
  positionTarget,
  normalTarget = null,
) {
  if (
    !Array.isArray(translationCm)
    || translationCm.length < 2
    || heightGrid?.schema !== 'toonlab.landscape-height-grid'
  ) {
    return null;
  }
  const toonLabX = Number(translationCm[0]) / 100;
  const toonLabY = Number(translationCm[1]) / 100;
  if (![toonLabX, toonLabY].every(Number.isFinite)) return null;
  // ToonLab X = anchorX - Three Z; ToonLab Y = anchorY + Three X. Height and normal
  // are always sampled from the active retained terrain, so vegetation stays
  // attached if that terrain is regenerated or edited.
  const localX = toonLabY - TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[1];
  const localZ = -(toonLabX - TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[0]);
  return attachLocalTranslationToRetainedLandscape(
    [localX, 0, localZ],
    heightGrid,
    positionTarget,
    normalTarget,
  );
}

function attachLocalTranslationToRetainedLandscape(
  translationMeters,
  heightGrid,
  positionTarget,
  normalTarget = null,
) {
  if (
    !Array.isArray(translationMeters)
    || translationMeters.length < 3
    || heightGrid?.schema !== 'toonlab.landscape-height-grid'
  ) {
    return null;
  }
  const localX = Number(translationMeters[0]);
  const heightOffset = Number(translationMeters[1]);
  const localZ = Number(translationMeters[2]);
  if (![localX, heightOffset, localZ].every(Number.isFinite)) return null;
  const localY = sampleHeightField(heightGrid, localX, localZ, normalTarget)
    + heightOffset;
  positionTarget.set(localX, localY, localZ);
  return positionTarget;
}

function landscapeWeightCoordinates(localX, localZ) {
  // Retained Landscape basis from the P14 height/weight export:
  // ToonLab X = anchorX - Three Z; ToonLab Y = anchorY + Three X.
  const toonLabX = TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[0] - localZ;
  const toonLabY = TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[1] + localX;
  return [
    toonLabX - TOONLAB_LANDSCAPE_ORIGIN_METERS[0],
    toonLabY - TOONLAB_LANDSCAPE_ORIGIN_METERS[1],
  ];
}

function sampleLandscapeWeight(weightBytes, localX, localZ) {
  const [pixelX, pixelY] = landscapeWeightCoordinates(localX, localZ);
  return bilinearScalar(
    weightBytes,
    TOONLAB_LANDSCAPE_WEIGHTMAP_SIZE,
    pixelX,
    pixelY,
  ) / 255;
}

function wrapIndex(index, size) {
  return ((index % size) + size) % size;
}

function bilinearRepeatScalar(field, u, v) {
  const { height, values, width } = field;
  const pixelX = u * width - 0.5;
  const pixelY = v * height - 0.5;
  const x0 = Math.floor(pixelX);
  const y0 = Math.floor(pixelY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = pixelX - x0;
  const ty = pixelY - y0;
  const sample = (x, y) => values[
    wrapIndex(y, height) * width + wrapIndex(x, width)
  ];
  const a = THREE.MathUtils.lerp(sample(x0, y0), sample(x1, y0), tx);
  const b = THREE.MathUtils.lerp(sample(x0, y1), sample(x1, y1), tx);
  return THREE.MathUtils.lerp(a, b, ty);
}

function sampleP15GrassOutputMask({
  localX,
  localZ,
  normal,
  noiseField,
  outputContract,
  weightLayers,
}) {
  const combinedGrassWeight = THREE.MathUtils.clamp(
    outputContract.layers.reduce(
      (sum, layerName) => sum + sampleLandscapeWeight(
        weightLayers[layerName],
        localX,
        localZ,
      ),
      0,
    ),
    0,
    1,
  );
  const [pixelX, pixelY] = landscapeWeightCoordinates(localX, localZ);
  const cliff = outputContract.autoCliff;
  const slope = (normal.y - cliff.start) / (cliff.fade - cliff.start);
  const noise = bilinearRepeatScalar(
    noiseField,
    pixelX / cliff.noiseScale,
    pixelY / cliff.noiseScale,
  ) * cliff.noiseStrength;
  const autoCliffMask = cliff.enabled
    ? THREE.MathUtils.clamp(slope - noise, 0, 1)
    : 0;
  const maskedWeight = combinedGrassWeight * (1 - autoCliffMask);
  return maskedWeight > outputContract.threshold ? maskedWeight : 0;
}

function hashUnit(x, y, stream = 0) {
  let hash = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b);
  hash ^= Math.imul((y | 0) ^ 0x7f4a7c15, 0xc2b2ae35);
  hash ^= Math.imul((stream | 0) ^ 0x165667b1, 0x27d4eb2d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return (hash >>> 0) / 4294967296;
}

function firstMesh(root) {
  let result = null;
  root.traverse((object) => {
    if (!result && object.isMesh) result = object;
  });
  return result;
}

function createP18GrassExclusionZones(propContract) {
  return (propContract?.props ?? []).map((prop) => {
    const position = prop.canonicalPositionMeters ?? [0, 0, 0];
    const exclusion = prop.grassExclusion ?? {};
    return {
      centerX: Number(position[0]),
      centerZ: -Number(position[2]),
      halfExtentsMeters: exclusion.halfExtentsMeters?.map(Number) ?? null,
      id: prop.id,
      paddingMeters: Number(exclusion.paddingMeters ?? 0),
      radiusMeters: Number(exclusion.radiusMeters ?? 0),
      rotationYRadians: THREE.MathUtils.degToRad(
        Number(
          prop.toonlabRotationEulerDegrees?.[1]
          ?? -prop.canonicalRotationEulerDegrees?.[1]
          ?? 0,
        ),
      ),
      shape: exclusion.shape ?? 'circle',
    };
  });
}

function createContractGrassExclusionZones(contract) {
  return (contract?.fixtures ?? [])
    .filter((fixture) => fixture.grassExclusion)
    .map((fixture) => {
      const position = fixture.positionMeters ?? [0, 0, 0];
      const exclusion = fixture.grassExclusion;
      return {
        centerX: Number(position[0]),
        centerZ: Number(position[2]),
        halfExtentsMeters: exclusion.halfExtentsMeters?.map(Number) ?? null,
        id: fixture.id,
        paddingMeters: Number(exclusion.paddingMeters ?? 0),
        radiusMeters: Number(exclusion.radiusMeters ?? 0),
        rotationYRadians: THREE.MathUtils.degToRad(
          Number(fixture.rotationYDegrees ?? 0),
        ),
        shape: exclusion.shape ?? 'circle',
      };
    });
}

async function createP19MountainCliffFixtures({
  contract,
  debugRotationYDegrees = null,
  heightGrid,
  loadedFixtures,
}) {
  if (
    contract?.schema !== 'toonlab.p19-mountain-cliff-contract'
    || !Array.isArray(contract.fixtures)
    || contract.fixtures.length !== loadedFixtures.length
  ) {
    throw new Error('P19 mountain/cliff contract is missing or inconsistent.');
  }
  const group = new THREE.Group();
  group.name = 'P19 exact source mountain and cliff fixtures';
  const fixtures = [];
  for (let index = 0; index < contract.fixtures.length; index += 1) {
    const fixture = contract.fixtures[index];
    const object = loadedFixtures[index].scene.clone(true);
    object.name = `P19 ${fixture.sourceAssetName} source LOD0`;
    const sourceMaterial = await loadRockReferenceSourceMaterialProfile(
      fixture.sourceMaterial,
      { sourceAssetName: fixture.sourceAssetName },
    );
    let meshCount = 0;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = sourceMaterial;
      child.castShadow = Boolean(fixture.castShadow);
      child.receiveShadow = Boolean(fixture.receiveShadow);
      child.frustumCulled = false;
      child.userData.p19MountainCliffFixture = fixture.id;
      meshCount += 1;
    });
    if (meshCount === 0) {
      throw new Error(`P19 ${fixture.sourceAssetName} LOD0 has no mesh.`);
    }
    object.position.fromArray(fixture.positionMeters);
    const hasDebugRotation = (
      debugRotationYDegrees !== null
      && debugRotationYDegrees !== undefined
      && debugRotationYDegrees !== ''
      && Number.isFinite(Number(debugRotationYDegrees))
    );
    const rotationYDegrees = (
      fixture.id === 'classic-cliff-control'
      && hasDebugRotation
    )
      ? Number(debugRotationYDegrees)
      : Number(
        fixture.toonlabRotationYDegrees
        ?? fixture.rotationYDegrees
        ?? 0
      );
    object.rotation.set(
      0,
      THREE.MathUtils.degToRad(rotationYDegrees),
      0,
    );
    // Catalog GLBs are exported in metre-valued coordinates, whereas the
    // original ToonLab StaticMesh vertices are centimetre-valued. P19's native
    // capture converts the compact contract scalar to an ToonLab actor scale
    // with a ×100 unit adapter. Apply that same adapter here before any
    // world-position texture, PixelDepth, normal-distance, fog, or camera-fit
    // calculation. Refitting a camera around a 100× smaller object preserves
    // only its silhouette; it does not preserve the authored material graph.
    const sourceScaleMultiplier = Number(
      fixture.toonlabSourceScaleMultiplier ?? 1,
    );
    object.scale.setScalar(Number(fixture.scale) * sourceScaleMultiplier);
    object.updateMatrixWorld(true);
    const groundingProbeCanonical = fixture.groundingProbeMeters
      ?? [fixture.positionMeters[0], fixture.positionMeters[2]];
    const groundingProbeThree = [
      Number(groundingProbeCanonical[0]),
      0,
      Number(groundingProbeCanonical[1]),
    ];
    const terrainY = sampleHeightField(
      heightGrid,
      groundingProbeThree[0],
      groundingProbeThree[2],
    );
    const bounds = new THREE.Box3().setFromObject(object, true);
    const burialDepthMeters = Number(fixture.burialDepthMeters ?? 0);
    object.position.y += terrainY - bounds.min.y - burialDepthMeters;
    object.updateMatrixWorld(true);
    const groundedBounds = new THREE.Box3().setFromObject(object, true);
    const record = {
      ...fixture,
      groundedWorldBoundsMeters: {
        max: groundedBounds.max.toArray(),
        min: groundedBounds.min.toArray(),
        size: groundedBounds.getSize(new THREE.Vector3()).toArray(),
      },
      materialFamily: fixture.sourceMaterial.includes('/Mountain/')
        ? 'M_Mountain'
        : 'M_Rock',
      meshCount,
      sourceScaleMultiplier,
      resolvedToonlabScale: Number(fixture.scale) * sourceScaleMultiplier,
      groundingProbeCanonicalMeters: groundingProbeCanonical.map(Number),
      groundingProbeMeters: [
        groundingProbeThree[0],
        groundingProbeThree[2],
      ],
      burialDepthMeters,
      sourceLod: 0,
      terrainHeightMeters: terrainY,
    };
    object.userData.p19MountainCliffFixture = record;
    fixtures.push(record);
    group.add(object);
  }
  group.userData.p19MountainCliff = {
    contract: P19_MOUNTAIN_CLIFF_CONTRACT_URL,
    fixtures,
    policy: 'P19 changes only exact source mountain/cliff geometry and M_Mountain/M_Rock materials; P18 props are excluded.',
  };
  return group;
}

function isInsideGrassExclusion(localX, localZ, exclusionZones) {
  return exclusionZones.some((zone) => {
    const deltaX = localX - zone.centerX;
    const deltaZ = localZ - zone.centerZ;
    if (zone.shape === 'oriented-box' && zone.halfExtentsMeters) {
      const cosine = Math.cos(-zone.rotationYRadians);
      const sine = Math.sin(-zone.rotationYRadians);
      const boxX = cosine * deltaX - sine * deltaZ;
      const boxZ = sine * deltaX + cosine * deltaZ;
      return Math.abs(boxX)
          <= zone.halfExtentsMeters[0] + zone.paddingMeters
        && Math.abs(boxZ)
          <= zone.halfExtentsMeters[1] + zone.paddingMeters;
    }
    return deltaX * deltaX + deltaZ * deltaZ
      <= zone.radiusMeters * zone.radiusMeters;
  });
}

function createP15AutoGrass({
  exclusionZones = [],
  grassPrototype,
  heightGrid,
  metadata,
  noiseField,
  weightLayers,
}) {
  const variety = metadata?.grassVarieties?.[0];
  if (!variety || !String(variety.grassMesh).includes('SM_Grass1')) {
    throw new Error('P15 ToonLab metadata does not resolve the expected SM_Grass1 variety.');
  }
  const outputContract = metadata?.landscapeGrassOutput;
  if (
    !outputContract
    || !Array.isArray(outputContract.layers)
    || outputContract.layers.some((layerName) => !weightLayers?.[layerName])
    || !noiseField?.values
  ) {
    throw new Error('P15 ToonLab LandscapeGrassOutput mask contract is incomplete.');
  }
  const densityPerTenMeterSquare = parsePerPlatformDefault(variety.grass_density, 175);
  const scaleMin = Number(variety.scaleX?.min ?? 0.75);
  const scaleMax = Number(variety.scaleX?.max ?? 1.25);
  const jitter = THREE.MathUtils.clamp(Number(variety.placement_jitter ?? 1), 0, 0.99);
  const halfExtent = Number(heightGrid.halfExtentMeters);
  const minLocal = -halfExtent;
  const maxLocal = halfExtent;
  const minToonLabX = TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[0] - maxLocal;
  const maxToonLabX = TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[0] - minLocal;
  const minToonLabY = TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[1] + minLocal;
  const maxToonLabY = TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[1] + maxLocal;
  const componentMinX = THREE.MathUtils.clamp(
    Math.floor((minToonLabX - TOONLAB_LANDSCAPE_ORIGIN_METERS[0])
      / TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS),
    0,
    TOONLAB_LANDSCAPE_COMPONENT_COUNT - 1,
  );
  const componentMaxX = THREE.MathUtils.clamp(
    Math.floor((maxToonLabX - TOONLAB_LANDSCAPE_ORIGIN_METERS[0] - 1e-6)
      / TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS),
    0,
    TOONLAB_LANDSCAPE_COMPONENT_COUNT - 1,
  );
  const componentMinY = THREE.MathUtils.clamp(
    Math.floor((minToonLabY - TOONLAB_LANDSCAPE_ORIGIN_METERS[1])
      / TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS),
    0,
    TOONLAB_LANDSCAPE_COMPONENT_COUNT - 1,
  );
  const componentMaxY = THREE.MathUtils.clamp(
    Math.floor((maxToonLabY - TOONLAB_LANDSCAPE_ORIGIN_METERS[1] - 1e-6)
      / TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS),
    0,
    TOONLAB_LANDSCAPE_COMPONENT_COUNT - 1,
  );

  // LandscapeGrass.cpp:
  // ceil(sqrt(abs(ExtentCm.X * ExtentCm.Y * GrassDensity / 1000 / 1000))).
  const componentExtentCm = TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS * 100;
  const gridSize = Math.ceil(Math.sqrt(
    Math.abs(
      componentExtentCm
      * componentExtentCm
      * densityPerTenMeterSquare
      / 1000
      / 1000
    ),
  ));
  const cellSize = TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS / gridSize;
  const maxJitter = jitter * cellSize * 0.5;
  const accepted = [];
  const normal = new THREE.Vector3();

  for (let componentX = componentMinX; componentX <= componentMaxX; componentX += 1) {
    for (let componentY = componentMinY; componentY <= componentMaxY; componentY += 1) {
      const componentOriginX = TOONLAB_LANDSCAPE_ORIGIN_METERS[0]
        + componentX * TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS;
      const componentOriginY = TOONLAB_LANDSCAPE_ORIGIN_METERS[1]
        + componentY * TOONLAB_LANDSCAPE_COMPONENT_SIZE_METERS;
      for (let xStart = 0; xStart < gridSize; xStart += 1) {
        for (let yStart = 0; yStart < gridSize; yStart += 1) {
          const cellX = componentX * gridSize + xStart;
          const cellY = componentY * gridSize + yStart;
          const toonLabX = componentOriginX
            + (xStart + 0.5) * cellSize
            + (hashUnit(cellX, cellY, 0) * 2 - 1) * maxJitter;
          const toonLabY = componentOriginY
            + (yStart + 0.5) * cellSize
            + (hashUnit(cellX, cellY, 1) * 2 - 1) * maxJitter;
          const localX = toonLabY - TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[1];
          const localZ = -(toonLabX - TOONLAB_VISUAL_TARGET_PATCH_XY_METERS[0]);
          if (
            localX < minLocal
            || localX > maxLocal
            || localZ < minLocal
            || localZ > maxLocal
          ) {
            continue;
          }
          if (isInsideGrassExclusion(localX, localZ, exclusionZones)) continue;
          const y = sampleHeightField(heightGrid, localX, localZ, normal);
          const weight = sampleP15GrassOutputMask({
            localX,
            localZ,
            noiseField,
            normal,
            outputContract,
            weightLayers,
          });
          if (weight <= 0 || weight < hashUnit(cellX, cellY, 2)) continue;
          accepted.push({
            localX,
            localZ,
            normal: normal.clone(),
            scale: THREE.MathUtils.lerp(scaleMin, scaleMax, hashUnit(cellX, cellY, 3)),
            y,
            yaw: hashUnit(cellX, cellY, 4) * Math.PI * 2,
          });
        }
      }
    }
  }

  const sourceMesh = firstMesh(grassPrototype);
  if (!sourceMesh) throw new Error('SM_Grass1 LOD0 glTF has no mesh.');
  sourceMesh.updateWorldMatrix(true, false);
  const geometry = sourceMesh.geometry.clone();
  geometry.applyMatrix4(sourceMesh.matrixWorld);
  const grass = new THREE.InstancedMesh(geometry, sourceMesh.material, accepted.length);
  grass.name = 'P15 ToonLab Landscape AutoGrass — SM_Grass1';
  grass.castShadow = Boolean(variety.cast_dynamic_shadow);
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const align = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < accepted.length; index += 1) {
    const instance = accepted[index];
    position.set(instance.localX, instance.y, instance.localZ);
    align.setFromUnitVectors(up, instance.normal);
    yaw.setFromAxisAngle(up, instance.yaw);
    rotation.multiplyQuaternions(align, yaw);
    scale.setScalar(instance.scale);
    matrix.compose(position, rotation, scale);
    grass.setMatrixAt(index, matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.userData.sourceAutoGrass = {
    alignToSurface: Boolean(variety.align_to_surface),
    authoredWeightMasks: { ...TOONLAB_SOURCE_TOONLAB_SHOWCASE_GRASS_WEIGHT_URLS },
    autoCliff: { ...outputContract.autoCliff },
    castDynamicShadow: Boolean(variety.cast_dynamic_shadow),
    cullDistanceMeters: [
      parsePerPlatformDefault(variety.start_cull_distance, 5000) / 100,
      parsePerPlatformDefault(variety.end_cull_distance, 8000) / 100,
    ],
    densityPerTenMeterSquare,
    engineAlgorithm: 'ToonLab LandscapeGrass.cpp jittered grid',
    exclusionZones,
    gridSizePer63MeterComponent: gridSize,
    instanceCount: accepted.length,
    jitter,
    material: '/Game/ToonLab/Environment/Foliage/Materials/MI_Grass',
    materialColorPath: 'Landscape RVT color, mip 4',
    metadata: TOONLAB_SOURCE_P15_GRASS_CONTRACT_URL,
    outputExpression: outputContract.expression,
    randomRotation: Boolean(variety.random_rotation),
    scaleUniform: [scaleMin, scaleMax],
    sourceMesh: variety.grassMesh,
    threshold: outputContract.threshold,
  };
  return grass;
}

function createP17RetainedDaisies({
  flowerPrototype,
  heightGrid,
  metadata,
}) {
  const retainedSchema = String(metadata?.schema ?? '');
  const retainedMesh = String(metadata?.component?.mesh ?? '');
  const expectedSchema = 'toonlab.p17-toonlab-daisy-contract';
  const expectedMesh =
    '/Game/ToonLab/Environment/Foliage/SM_Flower_Daisies1.SM_Flower_Daisies1';
  const compatibleSchema = retainedSchema === expectedSchema
    || (
      retainedSchema.startsWith('toonlab.p17-')
      && retainedSchema.endsWith('-daisy-contract')
    );
  const canonicalObjectPath = (value) => String(value ?? '')
    .replace(/^\/Game\/[^/]+\//, '/Game/{source}/');
  const compatibleMesh =
    canonicalObjectPath(retainedMesh) === canonicalObjectPath(expectedMesh);
  const resolvedMetadata = compatibleSchema && compatibleMesh
    ? {
        ...metadata,
        schema: expectedSchema,
        component: {
          ...metadata.component,
          mesh: expectedMesh,
        },
      }
    : metadata;
  const comparisonFixture = resolvedMetadata?.comparisonFixture;
  if (
    resolvedMetadata?.schema !== 'toonlab.p17-toonlab-daisy-contract'
    || resolvedMetadata?.version !== 2
    || resolvedMetadata?.component?.mesh
      !== '/Game/ToonLab/Environment/Foliage/SM_Flower_Daisies1.SM_Flower_Daisies1'
    || !Array.isArray(resolvedMetadata.instances)
    || resolvedMetadata.instances.length
      !== resolvedMetadata?.placementSupport?.retainedLandscapeInstanceCount
    || comparisonFixture?.instanceCount !== 1
    || comparisonFixture?.sourceLod0ClumpCount !== 1
    || !Array.isArray(comparisonFixture?.positionMeters)
    || comparisonFixture.positionMeters.length !== 3
  ) {
    throw new Error('P17 ToonLab metadata does not resolve the retained daisy foliage contract.');
  }
  const sourceMesh = firstMesh(flowerPrototype);
  if (!sourceMesh) throw new Error('SM_Flower_Daisies1 LOD0 glTF has no mesh.');
  sourceMesh.updateWorldMatrix(true, false);
  const geometry = sourceMesh.geometry.clone();
  geometry.applyMatrix4(sourceMesh.matrixWorld);
  const flowers = new THREE.InstancedMesh(
    geometry,
    sourceMesh.material,
    comparisonFixture.instanceCount,
  );
  flowers.name = 'P17 shared parity fixture — one SM_Flower_Daisies1 clump';
  flowers.castShadow = Boolean(comparisonFixture.castShadow);
  flowers.receiveShadow = Boolean(comparisonFixture.receiveShadow);
  flowers.frustumCulled = false;
  flowers.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  // P17's full 68-clump retained source inventory remains in metadata for
  // reconstruction. The compact parity scene deliberately renders the same
  // one-clump fixture used by native ToonLab and ToonLab. Only its terrain height
  // and surface alignment are resolved dynamically.
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const terrainNormal = new THREE.Vector3();
  const scale = new THREE.Vector3();
  if (!attachLocalTranslationToRetainedLandscape(
    comparisonFixture.positionMeters,
    heightGrid,
    position,
    terrainNormal,
  )) {
    throw new Error('P17 comparison flower clump has no valid terrain attachment.');
  }
  rotation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), terrainNormal);
  scale.setScalar(Number(comparisonFixture.scale));
  matrix.compose(position, rotation, scale);
  flowers.setMatrixAt(0, matrix);
  flowers.instanceMatrix.needsUpdate = true;
  flowers.userData.sourceFoliage = {
    actor: resolvedMetadata.actor.path,
    component: resolvedMetadata.component.name,
    componentClass: resolvedMetadata.component.class,
    excludedUnsupportedInstanceCount:
      resolvedMetadata.placementSupport.excludedUnsupportedInstanceCount,
    comparisonFixture,
    instanceCount: comparisonFixture.instanceCount,
    retainedSourceInventoryCount: resolvedMetadata.instances.length,
    landscapeSupportToleranceMeters:
      resolvedMetadata.placementSupport.landscapeSupportToleranceMeters,
    lod: 0,
    material: resolvedMetadata.material.path,
    materialParent: resolvedMetadata.material.parent,
    meshAudit: resolvedMetadata.mesh.audit,
    metadata: TOONLAB_SOURCE_P17_DAISY_CONTRACT_URL,
    placementSupport: resolvedMetadata.placementSupport,
    placementBasis: resolvedMetadata.patch.placementBasis,
    rotationBasis: resolvedMetadata.patch.rotationBasis,
    sourceInstanceCount: resolvedMetadata.component.sourceInstanceCount,
    sourceMesh: resolvedMetadata.component.mesh,
    sourcePatch: resolvedMetadata.patch,
    terrainAttachment:
      'runtime bilinear active height field + surface-normal correction',
    xyPatchInstanceCount: resolvedMetadata.component.xyPatchInstanceCount,
  };
  return flowers;
}

/**
 * Load one exact source grass patch and pine LOD0 plus the source grass
 * Terrain/Lit layer. Placement is deterministic but does not modify geometry.
 */
export async function createSourceEnvironmentTestContent({
  groundSize = [20, 16],
  materialCheckpoint = null,
  p19DebugRotationYDegrees = null,
  state = null,
} = {}) {
  const visualTargetMountainCliff =
    materialCheckpoint === P19_MOUNTAIN_CLIFF_CHECKPOINT;
  const visualTargetStylizedBasic =
    materialCheckpoint === P18_STYLIZED_BASIC_CHECKPOINT;
  const visualTargetFlowers = materialCheckpoint === P17_FLOWER_CHECKPOINT
    || visualTargetStylizedBasic
    || visualTargetMountainCliff;
  const visualTargetTree = materialCheckpoint === P16_TREE_CHECKPOINT
    || visualTargetFlowers;
  const visualTargetGrass = materialCheckpoint === P15_GRASS_CHECKPOINT
    || visualTargetTree;
  const visualTargetGround = materialCheckpoint === P14_GROUND_CHECKPOINT
    || visualTargetGrass;
  const stylizedBasicPropContract = visualTargetStylizedBasic
    ? await loadJson(P18_PROP_CONTRACT_URL)
    : null;
  const mountainCliffContract = visualTargetMountainCliff
    ? await loadJson(P19_MOUNTAIN_CLIFF_CONTRACT_URL, { cache: 'no-store' })
    : null;
  const [
    library,
    treeGltf,
    grassGltf,
    daisiesGltf,
    heightGrid,
    grassMetadata,
    grassWeights,
    autoCliffNoise,
    treeMetadata,
    flowerMetadata,
    stylizedBasicGltfs,
    stylizedBasicPropGltfs,
    mountainCliffGltfs,
  ] = await Promise.all([
    loadToonLabSourceLibrary({
      baseUrl: LOCAL_MATERIAL_SOURCE_BASE_URL,
      environmentBaseUrl: LOCAL_ENVIRONMENT_TEXTURE_BASE_URL,
      landscapeWeightBaseUrl: LOCAL_LANDSCAPE_WEIGHT_BASE_URL,
    }),
    new GLTFLoader().loadAsync(TOONLAB_SOURCE_PINE_LOD0_URL),
    new GLTFLoader().loadAsync(TOONLAB_SOURCE_GRASS_LOD0_URL),
    new GLTFLoader().loadAsync(TOONLAB_SOURCE_DAISIES_LOD0_URL),
    visualTargetGround
      ? loadJson(TOONLAB_SOURCE_TOONLAB_SHOWCASE_HEIGHT_GRID_URL)
      : Promise.resolve(null),
    visualTargetGrass
      ? loadJson(TOONLAB_SOURCE_P15_GRASS_CONTRACT_URL)
      : Promise.resolve(null),
    visualTargetGrass
      ? Promise.all(Object.entries(TOONLAB_SOURCE_TOONLAB_SHOWCASE_GRASS_WEIGHT_URLS)
        .map(async ([layerName, url]) => [
          layerName,
          await loadR8(
            url,
            TOONLAB_LANDSCAPE_WEIGHTMAP_SIZE * TOONLAB_LANDSCAPE_WEIGHTMAP_SIZE,
          ),
        ]))
        .then((entries) => Object.fromEntries(entries))
      : Promise.resolve(null),
    visualTargetGrass
      ? loadSrgbImageRedChannel(TOONLAB_SOURCE_AUTO_CLIFF_NOISE_URL)
      : Promise.resolve(null),
    visualTargetTree
      ? loadJson(TOONLAB_SOURCE_P16_TREE_CONTRACT_URL)
      : Promise.resolve(null),
    visualTargetFlowers
      ? loadJson(TOONLAB_SOURCE_P17_DAISY_CONTRACT_URL)
      : Promise.resolve(null),
    visualTargetStylizedBasic
      ? Promise.all(TOONLAB_SOURCE_STYLIZED_BASIC_FIXTURES.map(
          (fixture) => new GLTFLoader().loadAsync(fixture.url),
        ))
      : Promise.resolve(null),
    visualTargetStylizedBasic
      ? Promise.all(stylizedBasicPropContract.props.map(
          (prop) => new GLTFLoader().loadAsync(prop.sourceGlb),
        ))
      : Promise.resolve(null),
    visualTargetMountainCliff
      ? Promise.all(mountainCliffContract.fixtures.map(
          (fixture) => new GLTFLoader().loadAsync(fixture.sourceGlb),
        ))
      : Promise.resolve(null),
  ]);
  // P14 owns only the ground family. Give the Landscape its retained-world
  // coordinate adapter while keeping every later vegetation checkpoint on
  // the sealed P13 state.
  const vegetationState = createEnvironmentState(
    library,
    state,
    { visualTargetGround: visualTargetGrass },
  );
  const groundState = visualTargetGround
    ? createEnvironmentState(library, state, { visualTargetGround: true })
    : vegetationState;
  const groundMaterial = await makeGroundMaterial({
    library,
    state: groundState,
    visualTargetGround,
  });
  const group = new THREE.Group();
  group.name = 'Visual Target ground + grass + pine + daisies audit content';
  const groundRoot = heightGrid
    ? createRetainedLandscapePatch(heightGrid, groundMaterial, {
        groundFieldWriter: visualTargetGrass,
      })
    : null;
  if (groundRoot) group.add(groundRoot);

  const retainedTreePosition = visualTargetTree
    ? retainedActorPosition(treeMetadata?.visualTargetActor, heightGrid)
    : null;
  const tree = preparePlacedSource(
    treeGltf.scene,
    {
      name: 'Visual Target SM_Pine01 LOD0 audit tree',
      position: retainedTreePosition ?? [-4.1, 0, 1.25],
      // ToonLab and Three share the same signed angle for a ToonLab Z-up yaw after
      // mapping ToonLab (X,Y,Z) to Three (X,Z,-Y). The retained target actor is
      // yawed -90 degrees; preserving that authored orientation is required
      // for identical card normals, leaf silhouette, and direct light.
      rotationYDegrees: visualTargetTree
        ? treeMetadata?.visualTargetActor?.rotationPitchYawRoll?.[1] ?? 0
        : 0,
      scale: 0.36,
      castShadow: true,
      receiveShadow: true,
    },
  );
  const grassPrototype = preparePlacedSource(
    grassGltf.scene,
    {
      name: 'Visual Target SM_Grass1 LOD0 material prototype',
      position: [0, 0, 0],
      scale: 1,
      castShadow: false,
      receiveShadow: true,
    },
  );
  const flowerPrototype = preparePlacedSource(
    daisiesGltf.scene,
    {
      name: 'Visual Target SM_Flower_Daisies1 LOD0 material prototype',
      position: [0, 0, 0],
      scale: 1,
      castShadow: true,
      receiveShadow: true,
    },
  );
  group.add(tree);
  const baseMaterialReports = await Promise.all([
    applyToonLabNamedSourceMaterials(tree, {
      library,
      sourceActorIdentity: visualTargetTree
        ? treeMetadata?.visualTargetActor
        : null,
      sourceAssetName: visualTargetTree
        ? TOONLAB_VISUAL_TARGET_SOURCE_ASSET
        : 'authored-scene',
      state: vegetationState,
    }),
    applyToonLabNamedSourceMaterials(grassPrototype, {
      library,
      sourceAssetName: visualTargetGrass
        ? TOONLAB_VISUAL_TARGET_SOURCE_ASSET
        : 'authored-scene',
      sourceSceneVariant: visualTargetGrass ? 'landscape-auto-grass' : null,
      state: vegetationState,
    }),
    applyToonLabNamedSourceMaterials(flowerPrototype, {
      library,
      sourceAssetName: visualTargetFlowers
        ? TOONLAB_VISUAL_TARGET_SOURCE_ASSET
        : 'authored-scene',
      sourceSceneVariant: visualTargetFlowers
        ? 'retained-instanced-daisies'
        : null,
      state: vegetationState,
    }),
  ]);
  const unresolved = baseMaterialReports.flatMap((report) => report.unresolved);
  if (unresolved.length > 0) {
    throw new Error(`Visual Target environment material slots unresolved: ${
      unresolved.map((entry) => `${entry.object}:${entry.material}`).join(', ')
    }`);
  }
  const grass = visualTargetGrass
    ? createP15AutoGrass({
        exclusionZones: visualTargetStylizedBasic
          ? createP18GrassExclusionZones(stylizedBasicPropContract)
          : visualTargetMountainCliff
          ? createContractGrassExclusionZones(mountainCliffContract)
          : [],
        grassPrototype,
        heightGrid,
        metadata: grassMetadata,
        noiseField: autoCliffNoise,
        weightLayers: grassWeights,
      })
    : preparePlacedSource(
        grassPrototype,
        {
          name: 'Visual Target SM_Grass1 LOD0 audit patch',
          position: [3.15, 0.02, 1.2],
          scale: 0.68,
          castShadow: false,
          receiveShadow: true,
        },
      );
  const flowers = visualTargetFlowers
    ? createP17RetainedDaisies({
        flowerPrototype,
        heightGrid,
        metadata: flowerMetadata,
      })
    : preparePlacedSource(
        flowerPrototype,
        {
          name: 'Visual Target SM_Flower_Daisies1 audit patch',
          position: [1.6, 0.02, -1.5],
          scale: 0.8,
          castShadow: false,
          receiveShadow: true,
        },
      );
  group.add(grass, flowers);
  const stylizedBasicResult = visualTargetStylizedBasic
    ? await createP18StylizedBasicFixtures({
        heightGrid,
        library,
        loadedFixtures: stylizedBasicGltfs,
        propContract: stylizedBasicPropContract,
        propGltfs: stylizedBasicPropGltfs,
        state: vegetationState,
      })
    : null;
  const stylizedBasic = stylizedBasicResult?.group ?? null;
  if (stylizedBasic) group.add(stylizedBasic);
  const mountainCliff = visualTargetMountainCliff
    ? await createP19MountainCliffFixtures({
        contract: mountainCliffContract,
        debugRotationYDegrees: p19DebugRotationYDegrees,
        heightGrid,
        loadedFixtures: mountainCliffGltfs,
      })
    : null;
  if (mountainCliff) group.add(mountainCliff);
  const materialReports = [
    ...baseMaterialReports,
    ...(stylizedBasicResult?.reports ?? []),
  ];
  group.userData.sourceEnvironmentTestContent = {
    ...SOURCE_ENVIRONMENT_TEST_CONTENT,
    authority: visualTargetMountainCliff
      ? 'P19 M_Mountain/M_Rock-only ToonLab source authority'
      : visualTargetStylizedBasic
      ? 'P18 urban-prop presentation over retained source inputs'
      : visualTargetFlowers
      ? 'P17 flowers-only ToonLab Visual Target authority'
      : visualTargetTree
      ? 'P16 tree-only ToonLab Visual Target authority'
      : visualTargetGrass
      ? 'P15 grass-only ToonLab Visual Target authority'
      : visualTargetGround
      ? 'P14 ground-only Visual Target authority'
      : 'P13 retained source environment baseline',
    groundSize: [...groundSize],
    materialCheckpoint,
    changedModules: visualTargetMountainCliff
      ? ['mountainCliff']
      : visualTargetStylizedBasic
      ? ['stylizedBasic']
      : visualTargetFlowers
      ? ['flowers']
      : visualTargetTree
      ? ['tree']
      : visualTargetGrass
      ? ['grass']
      : visualTargetGround
      ? ['ground']
      : [],
    groundGeometry: groundRoot?.userData.sourceLandscapePatch ?? {
      geometry: 'compact parity plane',
    },
    materialReports: materialReports.map((report) => ({
      materialCount: report.materialCount,
      meshCount: report.meshCount,
      sourceAssetName: report.sourceAssetName,
      unresolved: report.unresolved,
    })),
    treeContract: visualTargetTree
      ? {
          appliedMaterials: appliedMaterialContracts(tree),
          metadata: TOONLAB_SOURCE_P16_TREE_CONTRACT_URL,
          source: treeMetadata,
        }
      : null,
    flowerContract: visualTargetFlowers
      ? {
          appliedMaterials: appliedMaterialContracts(flowerPrototype),
          metadata: TOONLAB_SOURCE_P17_DAISY_CONTRACT_URL,
          source: flowerMetadata,
        }
      : null,
    stylizedBasicContract: stylizedBasic?.userData.p18StylizedBasic ?? null,
    mountainCliffContract:
      mountainCliff?.userData.p19MountainCliff ?? null,
    placement: {
      grass: visualTargetGrass
        ? grass.userData.sourceAutoGrass
        : { position: grass.position.toArray(), scale: grass.scale.x },
      tree: {
        position: tree.position.toArray(),
        positionAuthority: retainedTreePosition
          ? 'retained ToonLab actor XYZ through the P14 Landscape basis'
          : 'legacy compact-stage fallback',
        rotationYDegrees: THREE.MathUtils.radToDeg(tree.rotation.y),
        scale: tree.scale.x,
      },
      flowers: visualTargetFlowers
        ? flowers.userData.sourceFoliage
        : { position: flowers.position.toArray(), scale: flowers.scale.x },
      stylizedBasic: stylizedBasic
        ? stylizedBasic.children.map(
            (object) => object.userData.p18StylizedBasicFixture,
          )
        : null,
      mountainCliff: mountainCliff
        ? mountainCliff.children.map(
            (object) => object.userData.p19MountainCliffFixture,
          )
        : null,
    },
    policy: visualTargetMountainCliff
      ? 'P19 changes only mountain/cliff: exact source LOD0 geometry, M_Mountain/M_Rock graphs, deterministic terrain attachment, and grass exclusion. Accepted P14 ground, P15 grass, P16 tree, P17 flowers, rock test fixture, lighting, sky, clouds, camera, and post remain frozen. P18 props are intentionally absent.'
      : visualTargetStylizedBasic
      ? 'P18 changes only object-surface presentation: the urban shader shades the bench, lamp housing, sword, crate, and exact source LOD0 beach shells while lamp glass and accepted P14 ground, P15 grass, P16 tree, P17 flowers, rock, lighting, sky, clouds, camera, and post remain frozen.'
      : visualTargetFlowers
      ? 'P17 changes only SM_Flower_Daisies1: the shared one-clump comparison fixture, source LOD0, MI_Daisy/M_Foliage graph, comparison shadow flags, and WPO. The 68-clump retained source inventory remains metadata-only. P14 ground, P15 grass, P16 tree, rock, lighting, sky, camera, and post remain frozen.'
      : visualTargetTree
      ? 'P16 changes only SM_Pine01: exact LOD0 bark/leaves materials and the retained actor XYZ/yaw/scale through the frozen P14 Landscape basis. P14 ground, P15 grass, flowers, rock, lighting, sky, camera, and post remain frozen.'
      : visualTargetGrass
      ? 'P15 changes AutoGrass only. P14 ground and all later foliage families remain frozen.'
      : visualTargetGround
      ? 'P14 changes ground only. Grass, flowers, and tree remain frozen for later checkpoints.'
      : 'P13 is frozen. Shared environment remains caller-owned.',
  };
  return {
    flowers,
    grass,
    groundMaterial,
    groundRoot,
    group,
    library,
    state: groundState,
    stylizedBasic,
    mountainCliff,
    tree,
    vegetationState,
  };
}
