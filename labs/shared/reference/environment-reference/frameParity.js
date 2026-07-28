// Repository-only numerical source-frame verification for the environment reference comparison.
//
// This module is deliberately independent from the material and post stack.
// It proves that the source camera, static GLB nodes, reconstructed Terrain,
// Terrain trees, and native detail transforms share one reflected-Z world
// frame before anyone judges shader or lighting parity from a screenshot.

import * as THREE from 'three';

import {
  reflectEnvironmentReferencePosition,
  reflectEnvironmentReferenceQuaternion,
} from './sceneLoader.js';

export const ENVIRONMENT_REFERENCE_PARITY_VIEWPORT = Object.freeze({
  width: 1920,
  height: 1080,
  aspect: 1920 / 1080,
});

const DEFAULT_POSITION_TOLERANCE = 1e-4;
const DEFAULT_QUATERNION_TOLERANCE_RADIANS = 1e-5;
// Exported local float32 TRS hierarchies with non-uniform scale decompose to a
// world quaternion within about 2.82e-4 rad of ToonLab Transform.rotation. This
// bound is only for static-node inventory; the camera keeps the tighter gate.
const DEFAULT_NODE_QUATERNION_TOLERANCE_RADIANS = 5e-4;
const DEFAULT_PROJECTION_TOLERANCE = 1e-5;
const DEFAULT_TREE_SURFACE_MAXIMUM_TOLERANCE_METERS = 0.35;
const DEFAULT_TREE_SURFACE_MEAN_TOLERANCE_METERS = 0.05;

function assertFinitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${label} must be a finite positive number.`);
  }
  return number;
}

function assertVector(source, length, label) {
  if (!Array.isArray(source) || source.length < length) {
    throw new TypeError(`${label} must contain ${length} numeric fields.`);
  }
  for (let index = 0; index < length; index += 1) {
    if (!Number.isFinite(Number(source[index]))) {
      throw new TypeError(`${label}[${index}] must be finite.`);
    }
  }
  return source;
}

function quaternionAngularError(a, b) {
  return 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(a.dot(b)), -1, 1));
}

function matrixMaxAbsDelta(a, b) {
  let maximum = 0;
  for (let index = 0; index < 16; index += 1) {
    maximum = Math.max(maximum, Math.abs(a.elements[index] - b.elements[index]));
  }
  return maximum;
}

function sourceTerrainPosition(terrain, node, target = new THREE.Vector3()) {
  const source = terrain?.position ?? node?.worldPosition ?? node?.localPosition;
  return target.fromArray(assertVector(source, 3, 'terrain.position'));
}

// ToonLab's Terrain renderer, Terrain trees, and native details use only
// Terrain.GetPosition(). Transform rotation/scale values can exist in the
// serialized scene but are explicitly ignored by the native renderer.
function sourceTerrainTranslationMatrix(terrain, node, target = new THREE.Matrix4()) {
  return target.makeTranslation(...sourceTerrainPosition(terrain, node).toArray());
}

function reflectedTerrainTranslationMatrix(terrain, node, target = new THREE.Matrix4()) {
  const position = sourceTerrainPosition(terrain, node);
  position.z = -position.z;
  return target.makeTranslation(position.x, position.y, position.z);
}

function terrainProbeIndices(resolution) {
  const last = resolution - 1;
  const result = [];
  for (let index = 0; index <= 8; index += 1) {
    result.push(Math.round(last * index / 8));
  }
  return result;
}

function sampleTerrainHeightNormalized(heights, resolution, normalizedX, normalizedZ) {
  const gridX = THREE.MathUtils.clamp(Number(normalizedX), 0, 1) * (resolution - 1);
  const gridZ = THREE.MathUtils.clamp(Number(normalizedZ), 0, 1) * (resolution - 1);
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const tx = gridX - x0;
  const tz = gridZ - z0;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(
      heights[z0 * resolution + x0],
      heights[z0 * resolution + x1],
      tx,
    ),
    THREE.MathUtils.lerp(
      heights[z1 * resolution + x0],
      heights[z1 * resolution + x1],
      tx,
    ),
    tz,
  );
}

/**
 * Project one ToonLab world-space point with the source camera convention.
 * ToonLab cameras look down local +Z; the returned x/y are OpenGL-style NDC.
 */
export function projectEnvironmentReferenceSourcePoint(
  sourceWorldPoint,
  cameraNode,
  cameraRecord,
  { aspect = ENVIRONMENT_REFERENCE_PARITY_VIEWPORT.aspect } = {},
) {
  const resolvedAspect = assertFinitePositive(aspect, 'projection aspect');
  const sourcePoint = new THREE.Vector3().fromArray(assertVector(
    sourceWorldPoint,
    3,
    'sourceWorldPoint',
  ));
  const cameraPosition = new THREE.Vector3().fromArray(assertVector(
    cameraNode?.worldPosition,
    3,
    'cameraNode.worldPosition',
  ));
  const inverseCameraQuaternion = new THREE.Quaternion().fromArray(assertVector(
    cameraNode?.worldRotation,
    4,
    'cameraNode.worldRotation',
  )).normalize().invert();
  const cameraPoint = sourcePoint.sub(cameraPosition).applyQuaternion(inverseCameraQuaternion);

  if (cameraRecord?.orthographic) {
    const halfHeight = assertFinitePositive(
      cameraRecord.orthographicSize,
      'cameraRecord.orthographicSize',
    );
    return {
      camera: cameraPoint.toArray(),
      inFront: cameraPoint.z >= Number(cameraRecord.nearClipPlane),
      ndc: [
        cameraPoint.x / (halfHeight * resolvedAspect),
        cameraPoint.y / halfHeight,
      ],
    };
  }

  const halfFovTangent = Math.tan(
    THREE.MathUtils.degToRad(Number(cameraRecord?.fieldOfView)) * 0.5,
  );
  if (!(halfFovTangent > 0)) {
    throw new RangeError('cameraRecord.fieldOfView must define a positive perspective frustum.');
  }
  return {
    camera: cameraPoint.toArray(),
    inFront: cameraPoint.z >= Number(cameraRecord.nearClipPlane),
    ndc: [
      cameraPoint.x / (cameraPoint.z * halfFovTangent * resolvedAspect),
      cameraPoint.y / (cameraPoint.z * halfFovTangent),
    ],
  };
}

/**
 * OrbitControls reads and writes camera.position as world space. A glTF camera
 * remains parented under its exported source rig, so constructing controls on
 * it silently rotates the camera toward the default world-space target. Move
 * it to the identity render-scene root first while preserving its world pose.
 */
export function attachEnvironmentReferenceCameraToRenderScene(
  camera,
  renderScene,
  {
    cameraNode = null,
    positionTolerance = DEFAULT_POSITION_TOLERANCE,
    quaternionToleranceRadians = DEFAULT_QUATERNION_TOLERANCE_RADIANS,
  } = {},
) {
  if (!camera?.isCamera || !renderScene?.isScene) {
    throw new TypeError('A Three camera and render Scene are required.');
  }
  renderScene.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const previousParent = camera.parent;
  const beforePosition = camera.getWorldPosition(new THREE.Vector3());
  const beforeQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  renderScene.attach(camera);
  renderScene.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const afterPosition = camera.getWorldPosition(new THREE.Vector3());
  const afterQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  const positionError = afterPosition.distanceTo(beforePosition);
  const quaternionErrorRadians = quaternionAngularError(afterQuaternion, beforeQuaternion);
  if (positionError > positionTolerance
    || quaternionErrorRadians > quaternionToleranceRadians) {
    throw new Error(
      'Reparenting the source camera changed its world pose '
      + `(position ${positionError}, rotation ${quaternionErrorRadians} rad).`,
    );
  }

  let sourcePositionError = null;
  let sourceQuaternionErrorRadians = null;
  if (cameraNode) {
    const expectedPosition = reflectEnvironmentReferencePosition(cameraNode.worldPosition);
    const expectedQuaternion = reflectEnvironmentReferenceQuaternion(cameraNode.worldRotation);
    sourcePositionError = afterPosition.distanceTo(expectedPosition);
    sourceQuaternionErrorRadians = quaternionAngularError(
      afterQuaternion,
      expectedQuaternion,
    );
    if (sourcePositionError > positionTolerance
      || sourceQuaternionErrorRadians > quaternionToleranceRadians) {
      throw new Error(
        'The render camera does not match the reflected source pose '
        + `(position ${sourcePositionError}, rotation ${sourceQuaternionErrorRadians} rad).`,
      );
    }
  }

  const report = Object.freeze({
    cameraParent: renderScene.type,
    detachedFromExportedParent: previousParent !== renderScene,
    previousParent: previousParent?.name ?? previousParent?.type ?? null,
    positionError,
    quaternionErrorRadians,
    sourcePositionError,
    sourceQuaternionErrorRadians,
    worldPosePreserved: true,
  });
  camera.userData.toonLabCameraFrame = report;
  return report;
}

function collectProjectionLandmarks(manifest, terrainRuntime) {
  const landmarks = [];
  for (const node of manifest.nodes ?? []) {
    const center = node?.renderer?.boundsCenter;
    if (node?.activeInHierarchy === false
      || node?.renderer?.enabled === false
      || !Array.isArray(center)
      || center.length < 3) continue;
    landmarks.push({
      id: `node:${node.index}`,
      kind: 'static-renderer-bounds',
      sourceWorld: center.slice(0, 3),
    });
  }

  const terrain = manifest.terrains?.[0];
  const terrainNode = terrain && manifest.nodes?.[terrain.node];
  if (terrain && terrainNode) {
    const matrix = sourceTerrainTranslationMatrix(terrain, terrainNode);
    const [sizeX, , sizeZ] = terrain.size;
    for (const [label, local] of [
      ['origin', [0, 0, 0]],
      ['x-edge', [sizeX, 0, 0]],
      ['z-edge', [0, 0, sizeZ]],
      ['opposite', [sizeX, 0, sizeZ]],
      ['center', [sizeX * 0.5, 0, sizeZ * 0.5]],
    ]) {
      landmarks.push({
        id: `terrain:${label}`,
        kind: 'terrain-frame',
        sourceWorld: new THREE.Vector3().fromArray(local).applyMatrix4(matrix).toArray(),
      });
    }

    const resolution = terrain.heightmapResolution;
    const heights = terrainRuntime?.heights;
    if (terrain.surfaceProbes?.length > 0) {
      for (const probe of terrain.surfaceProbes) {
        landmarks.push({
          id: `terrain-native-surface:${probe.heightmapX}:${probe.heightmapZ}`,
          kind: 'native-terrain-data-surface',
          sourceWorld: [...probe.rendererWorldPosition],
        });
      }
    } else if (heights?.length === resolution * resolution) {
      const stepX = sizeX / (resolution - 1);
      const stepZ = sizeZ / (resolution - 1);
      for (const sourceZ of terrainProbeIndices(resolution)) {
        for (const x of terrainProbeIndices(resolution)) {
          const vertex = sourceZ * resolution + x;
          landmarks.push({
            id: `terrain-surface:${x}:${sourceZ}`,
            kind: 'terrain-heightfield-surface',
            sourceWorld: new THREE.Vector3(
              x * stepX,
              heights[vertex] * terrain.size[1],
              sourceZ * stepZ,
            ).applyMatrix4(matrix).toArray(),
          });
        }
      }
    }

    const treeInstances = terrain.treeInstances ?? [];
    const treeIndices = new Set([
      0,
      Math.floor(treeInstances.length * 0.25),
      Math.floor(treeInstances.length * 0.5),
      Math.floor(treeInstances.length * 0.75),
      treeInstances.length - 1,
    ]);
    for (const index of treeIndices) {
      const tree = treeInstances[index];
      if (!tree) continue;
      const local = new THREE.Vector3(
        tree.position[0] * sizeX,
        tree.position[1] * terrain.size[1],
        tree.position[2] * sizeZ,
      );
      landmarks.push({
        id: `tree:${index}`,
        kind: 'terrain-tree',
        sourceWorld: local.applyMatrix4(matrix).toArray(),
      });
    }

    for (const entry of terrainRuntime?.details?.prototypeEntries ?? []) {
      const placements = entry.placements;
      if (!placements?.instanceCount) continue;
      const indices = new Set([
        0,
        Math.floor(placements.instanceCount * 0.5),
        placements.instanceCount - 1,
      ]);
      for (const index of indices) {
        const offset = index * placements.transformStride;
        const reflectedLocal = new THREE.Vector3().fromArray(placements.transforms, offset);
        const sourceLocal = reflectedLocal.clone();
        sourceLocal.z = -sourceLocal.z;
        landmarks.push({
          id: `detail:${entry.prototypeIndex}:${index}`,
          kind: 'terrain-detail',
          sourceWorld: sourceLocal.applyMatrix4(matrix).toArray(),
        });
      }
    }
  }
  return landmarks;
}

function compareNodeFrame(sceneRoot, manifest) {
  const objects = sceneRoot?.userData?.toonLabNodeObjects;
  if (!(objects instanceof Map)) {
    return {
      compared: 0,
      maximumPositionError: Infinity,
      maximumQuaternionErrorRadians: Infinity,
      missing: manifest.nodes?.length ?? 0,
    };
  }
  sceneRoot.updateWorldMatrix(true, true);
  let compared = 0;
  let maximumPositionError = 0;
  let maximumQuaternionErrorRadians = 0;
  let missing = 0;
  for (const node of manifest.nodes ?? []) {
    const object = objects.get(node.index);
    if (!object) {
      missing += 1;
      continue;
    }
    object.updateWorldMatrix(true, false);
    const actualPosition = object.getWorldPosition(new THREE.Vector3());
    const actualQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
    const expectedPosition = reflectEnvironmentReferencePosition(node.worldPosition);
    const expectedQuaternion = reflectEnvironmentReferenceQuaternion(node.worldRotation);
    maximumPositionError = Math.max(
      maximumPositionError,
      actualPosition.distanceTo(expectedPosition),
    );
    maximumQuaternionErrorRadians = Math.max(
      maximumQuaternionErrorRadians,
      quaternionAngularError(actualQuaternion, expectedQuaternion),
    );
    compared += 1;
  }
  return {
    compared,
    maximumPositionError,
    maximumQuaternionErrorRadians,
    missing,
  };
}

function compareTerrainFrame(terrainRuntime, manifest) {
  const terrain = manifest.terrains?.[terrainRuntime?.terrainIndex ?? 0];
  const terrainNode = terrain && manifest.nodes?.[terrain.node];
  if (!terrainRuntime?.root || !terrain || !terrainNode) {
    return {
      available: false,
      geometryCornerError: Infinity,
      geometrySampleError: Infinity,
      maximumSurfacePositionError: Infinity,
      maximumNativeProbeHeightError: Infinity,
      maximumNativeProbeSplatError: Infinity,
      maximumNativeProbeWorldPositionError: Infinity,
      maximumDetailPositionError: Infinity,
      maximumTreePositionError: Infinity,
      maximumTreeSurfaceHeightError: Infinity,
      meanTreeSurfaceHeightError: Infinity,
      rootMatrixError: Infinity,
    };
  }
  terrainRuntime.root.updateWorldMatrix(true, true);
  const expectedRoot = reflectedTerrainTranslationMatrix(terrain, terrainNode);
  const rootMatrixError = matrixMaxAbsDelta(terrainRuntime.root.matrixWorld, expectedRoot);
  const position = terrainRuntime.geometry?.getAttribute?.('position');
  const heights = terrainRuntime.heights;
  const resolution = terrain.heightmapResolution;
  let geometryCornerError = 0;
  if (position && position.count === resolution * resolution) {
    for (const [index, expectedX, expectedZ] of [
      [0, 0, 0],
      [resolution - 1, terrain.size[0], 0],
      [(resolution - 1) * resolution, 0, -terrain.size[2]],
      [resolution * resolution - 1, terrain.size[0], -terrain.size[2]],
    ]) {
      geometryCornerError = Math.max(
        geometryCornerError,
        Math.abs(position.getX(index) - expectedX),
        Math.abs(position.getZ(index) - expectedZ),
      );
    }
  } else {
    geometryCornerError = Infinity;
  }

  let geometrySampleError = 0;
  let maximumSurfacePositionError = 0;
  if (position?.count === resolution * resolution
    && heights?.length === resolution * resolution) {
    const stepX = terrain.size[0] / (resolution - 1);
    const stepZ = terrain.size[2] / (resolution - 1);
    const sourceMatrix = sourceTerrainTranslationMatrix(terrain, terrainNode);
    for (const sourceZ of terrainProbeIndices(resolution)) {
      for (const x of terrainProbeIndices(resolution)) {
        const vertex = sourceZ * resolution + x;
        const expectedLocal = new THREE.Vector3(
          x * stepX,
          heights[vertex] * terrain.size[1],
          -sourceZ * stepZ,
        );
        const actualLocal = new THREE.Vector3(
          position.getX(vertex),
          position.getY(vertex),
          position.getZ(vertex),
        );
        geometrySampleError = Math.max(
          geometrySampleError,
          actualLocal.distanceTo(expectedLocal),
        );
        const expectedSourceWorld = new THREE.Vector3(
          expectedLocal.x,
          expectedLocal.y,
          -expectedLocal.z,
        ).applyMatrix4(sourceMatrix);
        const expectedWorld = reflectEnvironmentReferencePosition(
          expectedSourceWorld.toArray(),
        );
        const actualWorld = actualLocal.applyMatrix4(terrainRuntime.root.matrixWorld);
        maximumSurfacePositionError = Math.max(
          maximumSurfacePositionError,
          actualWorld.distanceTo(expectedWorld),
        );
      }
    }
  } else {
    geometrySampleError = Infinity;
    maximumSurfacePositionError = Infinity;
  }

  const sourceMatrix = sourceTerrainTranslationMatrix(terrain, terrainNode);
  let maximumTreePositionError = 0;
  let maximumTreeSurfaceHeightError = 0;
  let treeSurfaceHeightErrorSum = 0;
  let treeSurfaceHeightSampleCount = 0;
  const trees = terrainRuntime.trees?.instances ?? [];
  for (const index of new Set([
    0,
    Math.floor(trees.length * 0.25),
    Math.floor(trees.length * 0.5),
    Math.floor(trees.length * 0.75),
    trees.length - 1,
  ])) {
    const wrapper = trees[index];
    const record = terrain.treeInstances?.[index];
    if (!wrapper || !record) continue;
    const sourceWorld = new THREE.Vector3(
      record.position[0] * terrain.size[0],
      record.position[1] * terrain.size[1],
      record.position[2] * terrain.size[2],
    ).applyMatrix4(sourceMatrix);
    const expected = reflectEnvironmentReferencePosition(sourceWorld.toArray());
    const actual = wrapper.getWorldPosition(new THREE.Vector3());
    maximumTreePositionError = Math.max(
      maximumTreePositionError,
      actual.distanceTo(expected),
    );
  }

  if (heights?.length === resolution * resolution) {
    for (const record of terrain.treeInstances ?? []) {
      const sampledHeight = sampleTerrainHeightNormalized(
        heights,
        resolution,
        record.position[0],
        record.position[2],
      ) * terrain.size[1];
      const instanceHeight = record.position[1] * terrain.size[1];
      const error = Math.abs(sampledHeight - instanceHeight);
      maximumTreeSurfaceHeightError = Math.max(maximumTreeSurfaceHeightError, error);
      treeSurfaceHeightErrorSum += error;
      treeSurfaceHeightSampleCount += 1;
    }
  } else {
    maximumTreeSurfaceHeightError = Infinity;
  }
  const meanTreeSurfaceHeightError = treeSurfaceHeightSampleCount > 0
    ? treeSurfaceHeightErrorSum / treeSurfaceHeightSampleCount
    : Infinity;

  let maximumNativeProbeHeightError = 0;
  let maximumNativeProbeSplatError = 0;
  let maximumNativeProbeWorldPositionError = 0;
  let nativeRendererVsSerializedTransformMaximumDelta = 0;
  let nativeSurfaceProbeCount = 0;
  const nativeProbes = terrain.surfaceProbes ?? [];
  if (position?.count === resolution * resolution
    && typeof terrainRuntime.sampleSplatLocal === 'function'
    && nativeProbes.length > 0) {
    for (const probe of nativeProbes) {
      const vertex = probe.heightmapZ * resolution + probe.heightmapX;
      const actualLocal = new THREE.Vector3(
        position.getX(vertex),
        position.getY(vertex),
        position.getZ(vertex),
      );
      maximumNativeProbeHeightError = Math.max(
        maximumNativeProbeHeightError,
        Math.abs(actualLocal.y - Number(probe.nativeHeight)),
        Math.abs(Number(probe.nativeHeight) - Number(probe.interpolatedHeight)),
      );
      const actualWorld = actualLocal.applyMatrix4(terrainRuntime.root.matrixWorld);
      const expectedWorld = reflectEnvironmentReferencePosition(
        probe.rendererWorldPosition,
      );
      maximumNativeProbeWorldPositionError = Math.max(
        maximumNativeProbeWorldPositionError,
        actualWorld.distanceTo(expectedWorld),
      );
      const sampledSplat = terrainRuntime.sampleSplatLocal(
        probe.alphamapX,
        probe.alphamapZ,
      );
      for (let layer = 0; layer < probe.splatWeights.length; layer += 1) {
        maximumNativeProbeSplatError = Math.max(
          maximumNativeProbeSplatError,
          Math.abs(sampledSplat[layer] - probe.splatWeights[layer]),
        );
      }
      if (Array.isArray(probe.serializedTransformWorldPosition)) {
        nativeRendererVsSerializedTransformMaximumDelta = Math.max(
          nativeRendererVsSerializedTransformMaximumDelta,
          new THREE.Vector3().fromArray(probe.rendererWorldPosition).distanceTo(
            new THREE.Vector3().fromArray(probe.serializedTransformWorldPosition),
          ),
        );
      }
      nativeSurfaceProbeCount += 1;
    }
  } else {
    maximumNativeProbeHeightError = Infinity;
    maximumNativeProbeSplatError = Infinity;
    maximumNativeProbeWorldPositionError = Infinity;
  }

  let maximumDetailPositionError = 0;
  for (const entry of terrainRuntime.details?.prototypeEntries ?? []) {
    const placements = entry.placements;
    if (!placements?.instanceCount) continue;
    for (const index of new Set([
      0,
      Math.floor(placements.instanceCount * 0.5),
      placements.instanceCount - 1,
    ])) {
      const offset = index * placements.transformStride;
      const reflectedLocal = new THREE.Vector3().fromArray(placements.transforms, offset);
      const sourceLocal = reflectedLocal.clone();
      sourceLocal.z = -sourceLocal.z;
      const expected = reflectEnvironmentReferencePosition(
        sourceLocal.applyMatrix4(sourceMatrix).toArray(),
      );
      const actual = reflectedLocal.applyMatrix4(terrainRuntime.root.matrixWorld);
      maximumDetailPositionError = Math.max(
        maximumDetailPositionError,
        actual.distanceTo(expected),
      );
    }
  }
  return {
    available: true,
    geometryCornerError,
    geometrySampleError,
    maximumSurfacePositionError,
    maximumDetailPositionError,
    maximumNativeProbeHeightError,
    maximumNativeProbeSplatError,
    maximumNativeProbeWorldPositionError,
    maximumTreePositionError,
    maximumTreeSurfaceHeightError,
    meanTreeSurfaceHeightError,
    rootMatrixError,
    nativeRendererVsSerializedTransformMaximumDelta,
    nativeSurfaceProbeCount,
    surfaceProbeCount: heights?.length === resolution * resolution ? 81 : 0,
    treeSurfaceHeightSampleCount,
    transformAuthority: 'ToonLabEngine.Terrain.GetPosition(): translation only',
  };
}

/**
 * Prove that the live runtime occupies the same source-camera frame.
 * `exact` only covers geometry/camera/projection authority; it intentionally
 * says nothing about material, lighting, post, or pixel-color parity.
 */
export function createEnvironmentReferenceFrameParityReport({
  camera,
  manifest,
  renderScene,
  sceneRoot,
  terrainRuntime = null,
  width = ENVIRONMENT_REFERENCE_PARITY_VIEWPORT.width,
  height = ENVIRONMENT_REFERENCE_PARITY_VIEWPORT.height,
  positionTolerance = DEFAULT_POSITION_TOLERANCE,
  quaternionToleranceRadians = DEFAULT_QUATERNION_TOLERANCE_RADIANS,
  projectionTolerance = DEFAULT_PROJECTION_TOLERANCE,
} = {}) {
  if (!camera?.isCamera || !manifest || !renderScene?.isScene) {
    throw new TypeError('camera, manifest, and renderScene are required.');
  }
  const resolvedWidth = assertFinitePositive(width, 'viewport width');
  const resolvedHeight = assertFinitePositive(height, 'viewport height');
  const aspect = resolvedWidth / resolvedHeight;
  const cameraRecord = manifest.cameras?.[0];
  const cameraNode = cameraRecord && manifest.nodes?.[cameraRecord.node];
  if (!cameraRecord || !cameraNode) throw new Error('The exported source camera is missing.');

  renderScene.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const actualPosition = camera.getWorldPosition(new THREE.Vector3());
  const actualQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  const expectedPosition = reflectEnvironmentReferencePosition(cameraNode.worldPosition);
  const expectedQuaternion = reflectEnvironmentReferenceQuaternion(cameraNode.worldRotation);
  const cameraPositionError = actualPosition.distanceTo(expectedPosition);
  const cameraQuaternionErrorRadians = quaternionAngularError(
    actualQuaternion,
    expectedQuaternion,
  );
  const cameraAspectError = Math.abs(Number(camera.aspect) - aspect);
  const cameraFovError = cameraRecord.orthographic
    ? 0
    : Math.abs(Number(camera.fov) - Number(cameraRecord.fieldOfView));

  let maximumAllProjectionError = 0;
  let maximumProjectionError = 0;
  let projectedLandmarkCount = 0;
  let frustumLandmarkCount = 0;
  const projectionLandmarks = [];
  for (const landmark of collectProjectionLandmarks(manifest, terrainRuntime)) {
    const source = projectEnvironmentReferenceSourcePoint(
      landmark.sourceWorld,
      cameraNode,
      cameraRecord,
      { aspect },
    );
    const reflected = reflectEnvironmentReferencePosition(landmark.sourceWorld);
    const targetNdc = reflected.clone().project(camera);
    const error = Math.max(
      Math.abs(source.ndc[0] - targetNdc.x),
      Math.abs(source.ndc[1] - targetNdc.y),
    );
    if (Number.isFinite(error)) {
      maximumAllProjectionError = Math.max(maximumAllProjectionError, error);
    }
    const insideComparisonFrustum = source.inFront
      && Math.abs(source.ndc[0]) <= 1.25
      && Math.abs(source.ndc[1]) <= 1.25;
    if (insideComparisonFrustum) {
      maximumProjectionError = Math.max(maximumProjectionError, error);
      frustumLandmarkCount += 1;
    }
    projectedLandmarkCount += 1;
    if (projectionLandmarks.length < 24 || error > projectionTolerance) {
      projectionLandmarks.push({
        error,
        id: landmark.id,
        inFront: source.inFront,
        kind: landmark.kind,
        sourceNdc: source.ndc,
        targetNdc: [targetNdc.x, targetNdc.y],
      });
    }
  }

  const nodeFrame = compareNodeFrame(sceneRoot, manifest);
  const terrainFrame = compareTerrainFrame(terrainRuntime, manifest);
  const exact = camera.parent === renderScene
    && cameraPositionError <= positionTolerance
    && cameraQuaternionErrorRadians <= quaternionToleranceRadians
    && cameraAspectError <= projectionTolerance
    && cameraFovError <= projectionTolerance
    && maximumProjectionError <= projectionTolerance
    && nodeFrame.missing === 0
    && nodeFrame.maximumPositionError <= positionTolerance
    && nodeFrame.maximumQuaternionErrorRadians
      <= DEFAULT_NODE_QUATERNION_TOLERANCE_RADIANS
    && terrainFrame.available
    && terrainFrame.rootMatrixError <= positionTolerance
    && terrainFrame.geometryCornerError <= positionTolerance
    && terrainFrame.geometrySampleError <= positionTolerance
    && terrainFrame.maximumSurfacePositionError <= positionTolerance
    && terrainFrame.nativeSurfaceProbeCount === 81
    && terrainFrame.maximumNativeProbeHeightError <= positionTolerance
    && terrainFrame.maximumNativeProbeSplatError <= projectionTolerance
    && terrainFrame.maximumNativeProbeWorldPositionError <= positionTolerance
    && terrainFrame.maximumTreePositionError <= positionTolerance
    && terrainFrame.maximumDetailPositionError <= positionTolerance
    && terrainFrame.maximumTreeSurfaceHeightError
      <= DEFAULT_TREE_SURFACE_MAXIMUM_TOLERANCE_METERS
    && terrainFrame.meanTreeSurfaceHeightError
      <= DEFAULT_TREE_SURFACE_MEAN_TOLERANCE_METERS;

  const report = {
    aspect,
    camera: {
      actualPosition: actualPosition.toArray(),
      actualQuaternion: actualQuaternion.toArray(),
      aspectError: cameraAspectError,
      expectedPosition: expectedPosition.toArray(),
      expectedQuaternion: expectedQuaternion.toArray(),
      fieldOfViewError: cameraFovError,
      parentIsRenderScene: camera.parent === renderScene,
      positionError: cameraPositionError,
      quaternionErrorRadians: cameraQuaternionErrorRadians,
    },
    exact,
    nodeFrame,
    projection: {
      maximumAllError: maximumAllProjectionError,
      landmarks: projectionLandmarks,
      maximumError: maximumProjectionError,
      projectedLandmarkCount,
      frustumLandmarkCount,
    },
    terrainFrame,
    tolerances: {
      position: positionTolerance,
      projection: projectionTolerance,
      quaternionRadians: quaternionToleranceRadians,
      staticNodeQuaternionRadians: DEFAULT_NODE_QUATERNION_TOLERANCE_RADIANS,
      treeSurfaceMaximumMeters: DEFAULT_TREE_SURFACE_MAXIMUM_TOLERANCE_METERS,
      treeSurfaceMeanMeters: DEFAULT_TREE_SURFACE_MEAN_TOLERANCE_METERS,
    },
    viewport: { width: resolvedWidth, height: resolvedHeight },
  };
  camera.userData.toonLabFrameParity = report;
  return report;
}
