import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENE_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
);
const MATERIAL_MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/material-source/manifest.json',
);
const MESH_MANIFEST_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/catalog-meshes/manifest.json',
);
const HEIGHT_GRID_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/landscape-heightfields/SnowPines/'
    + 'p14-camera-render1-patch.json',
);
const COMPARISON_CONTRACT_PATH = resolve(
  ROOT_DIR,
  'assets-local/parity/minimal-environment/p13-author-hard/spire-05/contract.json',
);
const OUTPUT_PATH = resolve(
  ROOT_DIR,
  'assets-local/sostylized/foliage/p17-ue-daisy-contract.json',
);

const SOURCE_MESH =
  '/Game/SoStylized/Environment/Foliage/SM_Flower_Daisies1.SM_Flower_Daisies1';
const SOURCE_MATERIAL =
  '/Game/SoStylized/Environment/Foliage/Materials/MI_Daisy.MI_Daisy';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseGlbJson(path) {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`Expected a glTF 2.0 binary: ${path}`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) {
    throw new Error(`First GLB chunk is not JSON: ${path}`);
  }
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\u0000+$/u, ''),
  );
}

const scene = readJson(SCENE_PATH);
const materialManifest = readJson(MATERIAL_MANIFEST_PATH);
const meshManifest = readJson(MESH_MANIFEST_PATH);
const heightGrid = readJson(HEIGHT_GRID_PATH);
const comparisonContract = readJson(COMPARISON_CONTRACT_PATH);

const actor = scene.actors.find((candidate) =>
  candidate.staticMeshes?.some((component) => component.mesh === SOURCE_MESH));
const component = actor?.staticMeshes?.find((candidate) =>
  candidate.mesh === SOURCE_MESH);
const material = materialManifest.materials.find((candidate) =>
  candidate.path === SOURCE_MATERIAL);
const mesh = meshManifest.entries.find((candidate) =>
  candidate.sourcePath === SOURCE_MESH.split('.')[0]);

if (!actor || !component || !material || !mesh) {
  throw new Error('Could not resolve the complete P17 daisy source contract.');
}
const comparisonPlacement =
  comparisonContract?.capture?.environment?.placement?.flowers;
if (
  !Array.isArray(comparisonPlacement?.position)
  || comparisonPlacement.position.length !== 3
  || !Number.isFinite(Number(comparisonPlacement.scale))
) {
  throw new Error('Could not resolve the shared one-clump flower comparison fixture.');
}

const lod0Path = resolve(
  ROOT_DIR,
  'assets-local/sostylized/catalog-meshes',
  mesh.lods[0].file,
);
const lod0 = parseGlbJson(lod0Path);
const primitives = lod0.meshes.flatMap((entry) => entry.primitives ?? []);
if (primitives.length !== 1) {
  throw new Error(`Expected one SM_Flower_Daisies1 LOD0 primitive, got ${primitives.length}.`);
}
const primitive = primitives[0];
const positionAccessor = lod0.accessors[primitive.attributes.POSITION];
const indexAccessor = lod0.accessors[primitive.indices];
const gltfMaterial = lod0.materials[primitive.material];
const meshAudit = {
  file: mesh.lods[0].file,
  sha256: sha256(lod0Path),
  nodeCount: lod0.nodes.length,
  meshCount: lod0.meshes.length,
  primitiveCount: primitives.length,
  attributes: Object.keys(primitive.attributes).sort(),
  vertexCount: positionAccessor.count,
  indexCount: indexAccessor.count,
  triangleCount: indexAccessor.count / 3,
  material: {
    name: gltfMaterial.name,
    alphaMode: gltfMaterial.alphaMode,
    alphaCutoff: gltfMaterial.alphaCutoff,
    doubleSided: gltfMaterial.doubleSided,
  },
};
if (
  meshAudit.vertexCount !== 255
  || meshAudit.indexCount !== 432
  || meshAudit.triangleCount !== mesh.lods[0].triangles
  || meshAudit.material.name !== 'MI_Daisy'
  || meshAudit.material.alphaMode !== 'MASK'
  || meshAudit.material.doubleSided !== true
) {
  throw new Error('SM_Flower_Daisies1 LOD0 no longer matches the P17 source mesh oracle.');
}

const anchorCm = heightGrid.anchorUeWorldCentimetersXY;
const halfExtentCm = Number(heightGrid.halfExtentMeters) * 100;
const patchInstances = component.instances
  .map((instance, sourceIndex) => ({ ...instance, sourceIndex }))
  .filter(({ translation }) =>
    Math.abs(Number(translation[0]) - Number(anchorCm[0])) <= halfExtentCm
    && Math.abs(Number(translation[1]) - Number(anchorCm[1])) <= halfExtentCm);

function bilinearScalar(values, size, x, y) {
  const clampedX = Math.max(0, Math.min(size - 1, x));
  const clampedY = Math.max(0, Math.min(size - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const a = values[y0 * size + x0] * (1 - tx) + values[y0 * size + x1] * tx;
  const b = values[y1 * size + x0] * (1 - tx) + values[y1 * size + x1] * tx;
  return a * (1 - ty) + b * ty;
}

const landscapeSupportToleranceMeters = 1;
const unsupportedPatchInstances = [];
const instances = [];
for (const instance of patchInstances) {
  const ueXmeters = Number(instance.translation[0]) / 100;
  const ueYmeters = Number(instance.translation[1]) / 100;
  const localX = ueYmeters - Number(anchorCm[1]) / 100;
  const localZ = -(ueXmeters - Number(anchorCm[0]) / 100);
  const gridX = (localX + Number(heightGrid.halfExtentMeters))
    / Number(heightGrid.stepMeters);
  const gridZ = (localZ + Number(heightGrid.halfExtentMeters))
    / Number(heightGrid.stepMeters);
  const landscapeHeightMeters = bilinearScalar(
    heightGrid.heightsMeters,
    Number(heightGrid.sampleCount),
    gridX,
    gridZ,
  );
  const sourceHeightMeters = Number(instance.translation[2]) / 100
    - Number(heightGrid.anchorHeightCentimeters) / 100;
  const sourceHeightDeltaMeters = sourceHeightMeters - landscapeHeightMeters;
  const record = {
    ...instance,
    sourceTranslation: [...instance.translation],
    translation: [
      Number(instance.translation[0]),
      Number(instance.translation[1]),
      Number(heightGrid.anchorHeightCentimeters) + landscapeHeightMeters * 100,
    ],
    landscapeHeightMeters,
    sourceHeightDeltaMeters,
  };
  if (Math.abs(sourceHeightDeltaMeters) <= landscapeSupportToleranceMeters) {
    instances.push(record);
  } else {
    unsupportedPatchInstances.push(record);
  }
}

const textures = Object.values(material.parameters.texture)
  .map((path) => {
    const record = materialManifest.textures[path];
    return record ? { path, ...record } : null;
  })
  .filter(Boolean);

const contract = {
  schema: 'toonlab.p17-ue-daisy-contract',
  version: 2,
  engine: '5.8.0-55116800+++UE5+Release-5.8',
  sourceMap: scene.sourceMap,
  provenance: {
    scene: {
      file: 'assets-local/sostylized/demo-scenes/Demonstration_SnowPines.json',
      sha256: sha256(SCENE_PATH),
    },
    materialManifest: {
      file: 'assets-local/sostylized/material-source/manifest.json',
      sha256: sha256(MATERIAL_MANIFEST_PATH),
    },
    meshManifest: {
      file: 'assets-local/sostylized/catalog-meshes/manifest.json',
      sha256: sha256(MESH_MANIFEST_PATH),
    },
    heightGrid: {
      file:
        'assets-local/sostylized/landscape-heightfields/SnowPines/'
        + 'p14-camera-render1-patch.json',
      sha256: sha256(HEIGHT_GRID_PATH),
    },
    comparisonContract: {
      file:
        'assets-local/parity/minimal-environment/p13-author-hard/'
        + 'spire-05/contract.json',
      sha256: sha256(COMPARISON_CONTRACT_PATH),
    },
  },
  patch: {
    anchorUeWorldCentimetersXY: anchorCm,
    anchorHeightCentimeters: heightGrid.anchorHeightCentimeters,
    halfExtentMeters: heightGrid.halfExtentMeters,
    placementBasis:
      'Three position = [UE Y-anchorY, UE Z-anchorHeight, -(UE X-anchorX)] / 100',
    rotationBasis:
      'UE static-mesh basis (X,Y,Z) -> Three (X,Z,-Y); R3 = B * Rue * inverse(B)',
  },
  actor: {
    name: actor.name,
    label: actor.label,
    class: actor.class,
    path: actor.path,
    transform: actor.transform,
  },
  component: {
    name: component.name,
    class: component.class,
    mesh: component.mesh,
    materials: component.materials,
    transform: component.transform,
    visible: component.visible,
    hiddenInGame: component.hiddenInGame,
    renderProperties: component.renderProperties,
    sourceInstanceCount: component.instances.length,
    xyPatchInstanceCount: patchInstances.length,
    retainedPatchInstanceCount: instances.length,
    unsupportedPatchInstanceCount: unsupportedPatchInstances.length,
  },
  mesh: {
    ...mesh,
    audit: meshAudit,
  },
  material: {
    path: material.path,
    parent: material.chain.at(-1),
    scalar: material.parameters.scalar,
    vector: material.parameters.vector,
    texture: material.parameters.texture,
    staticSwitch: material.parameters.static_switch,
  },
  textures,
  instances,
  placementSupport: {
    policy:
      'retain exact source XY/quaternion/scale only when the authored origin is '
      + 'within 1 m of the retained P14 Landscape; store an exact bilinear P14 '
      + 'reference height while runtime resolves final root height and surface '
      + 'alignment from the active terrain',
    landscapeSupportToleranceMeters,
    xyPatchInstanceCount: patchInstances.length,
    retainedLandscapeInstanceCount: instances.length,
    excludedUnsupportedInstanceCount: unsupportedPatchInstances.length,
    excludedSourceIndices: unsupportedPatchInstances.map(({ sourceIndex }) => sourceIndex),
    maximumExcludedHeightDeltaMeters: Math.max(
      ...unsupportedPatchInstances.map(({ sourceHeightDeltaMeters }) =>
        Math.abs(sourceHeightDeltaMeters)),
    ),
    reason:
      'XY-only selection included flowers authored on source rocks/cliffs that '
      + 'are intentionally absent from the compact P14-P17 comparison scene',
  },
  comparisonFixture: {
    policy:
      'render exactly one source LOD0 clump at the immutable shared '
      + 'Unity/Unreal/ToonLab comparison transform; retain the 68-clump '
      + 'source inventory above for full-scene reconstruction only',
    source:
      'assets-local/parity/minimal-environment/p13-author-hard/spire-05/'
      + 'contract.json#capture.environment.placement.flowers',
    instanceCount: 1,
    sourceLod0ClumpCount: 1,
    positionMeters: comparisonPlacement.position.map(Number),
    scale: Number(comparisonPlacement.scale),
    castShadow: false,
    receiveShadow: true,
    shadowAuthority:
      'the shared native Unity and Unreal compact fixture disables daisy '
      + 'cast shadows; rock, tree, and terrain hard shadows remain active',
    terrainAttachment:
      'runtime bilinear active height field + surface-normal correction',
  },
  deterministicCheckpointInputs: {
    materialTimeSeconds: 0,
    perInstanceFadeAmount: 1,
    visiblePassCameraOcclusion: 1,
    shadowPassCameraOcclusion: 1,
    spatialCullingLandscapeHeightSpecular: 0,
    spatialCullingMultiplier: 1,
    playerInteractionWpoMeters: [0, 0, 0],
    dayCycleProgress: 0,
    overcast: 0,
    rainStrength: 0,
    authority: {
      visibility:
        'source component has no cull distance; warmed TAA resolves full visibility',
      occlusion:
        'fixed camera/player sphere does not intersect retained daisy cards; '
        + 'MF_Occlusion shadow output is ShadowReplace(1)',
      spatialCulling:
        'retained P14 RVT height compatibility input is explicit zero',
      interaction: 'fixed comparison has no player overlap',
      weather: 'clear source baseline',
    },
  },
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(contract, null, 2)}\n`);
console.log(`P17_DAISY_CONTRACT=${OUTPUT_PATH}`);
console.log(`P17_DAISY_INSTANCE_COUNT=${instances.length}`);
console.log(`P17_DAISY_UNSUPPORTED_INSTANCE_COUNT=${unsupportedPatchInstances.length}`);
