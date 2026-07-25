// Source-mesh variation for licensed local rock references. Unlike the SDF
// rock generator, this path clones each authored LOD and deforms its existing
// vertices in place. Topology, UVs, vertex colors, material slots, and exact
// triangle counts are preserved.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

import { installToonLabSurfaceLighting } from '../../environment/toonLabSurfaceLighting.js';
import { rockReferenceSeedForId } from './referenceCatalog.js';

export const ROCK_REFERENCE_GEOMETRY_MODES = Object.freeze(['original', 'variation']);
export const ROCK_REFERENCE_MATERIAL_MODES = Object.freeze([
  'source',
  'toonlab',
  // Kept as an input alias for links and callers created before the
  // ToonLab-derived S_Rock implementation became ToonLab's baseline.
  'toonlab',
  'authored',
  'neutral',
  'legacy',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixSeed(seed, salt) {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function signed(seed, salt) {
  return (mixSeed(seed, salt) / 0xffffffff) * 2 - 1;
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / Math.max(max - min, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function geometryTriangleCount(geometry) {
  if (!geometry?.getAttribute?.('position')) return 0;
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);
}

/**
 * Produces a bounded deterministic deformation profile. A zero strength is
 * an exact identity; strength one remains deliberately conservative so UVs
 * and the source silhouette language survive.
 */
export function createRockReferenceVariationProfile({
  referenceId = '',
  seed = 0,
  strength = 1,
} = {}) {
  const amount = clamp(Number(strength) || 0, 0, 1);
  const identitySeed = rockReferenceSeedForId(`${referenceId}:${Math.round(Number(seed) || 0) >>> 0}`);
  return Object.freeze({
    bulge: round(signed(identitySeed, 8) * 0.09 * amount),
    leanX: round(signed(identitySeed, 3) * 0.11 * amount),
    leanZ: round(signed(identitySeed, 4) * 0.11 * amount),
    noiseAmplitude: round((0.012 + Math.abs(signed(identitySeed, 9)) * 0.022) * amount),
    noiseFrequency: round(1.15 + Math.abs(signed(identitySeed, 10)) * 1.35),
    phases: Object.freeze([
      round(signed(identitySeed, 11) * Math.PI),
      round(signed(identitySeed, 12) * Math.PI),
      round(signed(identitySeed, 13) * Math.PI),
    ]),
    scale: Object.freeze([
      round(1 + signed(identitySeed, 0) * 0.1 * amount),
      round(1 + signed(identitySeed, 1) * 0.12 * amount),
      round(1 + signed(identitySeed, 2) * 0.1 * amount),
    ]),
    seed: Math.round(Number(seed) || 0) >>> 0,
    strength: amount,
    taper: round(signed(identitySeed, 7) * 0.13 * amount),
    twist: round(signed(identitySeed, 5) * 0.14 * amount),
  });
}

/**
 * Clones and deforms one authored BufferGeometry. The same world-space
 * analytic field is evaluated for every LOD, so independent authored LODs
 * remain visually coherent without requiring vertex correspondence.
 */
export function deformRockReferenceGeometry(geometry, profile, {
  sourceBounds = null,
} = {}) {
  if (!geometry?.isBufferGeometry) {
    throw new TypeError('A THREE.BufferGeometry is required for reference deformation.');
  }
  const result = geometry.clone();
  if (!profile || profile.strength <= 0) {
    result.computeBoundingBox();
    result.computeBoundingSphere();
    return result;
  }

  geometry.computeBoundingBox();
  const bounds = sourceBounds?.isBox3 ? sourceBounds.clone() : geometry.boundingBox.clone();
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const baseY = bounds.min.y;
  const extentX = Math.max(size.x * 0.5, 1e-4);
  const extentY = Math.max(size.y, 1e-4);
  const extentZ = Math.max(size.z * 0.5, 1e-4);
  const referenceScale = Math.max(Math.min(extentX, extentY * 0.5, extentZ), 1e-4);
  const position = result.getAttribute('position');
  const sourceNormal = geometry.getAttribute('normal');
  const vector = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    const originalX = position.getX(index);
    const originalY = position.getY(index);
    const originalZ = position.getZ(index);
    const height = clamp((originalY - baseY) / extentY, 0, 1);
    const baseLock = smoothstep(0.03, 0.24, height);
    const centeredHeight = height - 0.5;
    const taper = 1 + profile.taper * centeredHeight;

    let x = (originalX - center.x) * profile.scale[0] * taper;
    let y = (originalY - baseY) * profile.scale[1];
    let z = (originalZ - center.z) * profile.scale[2] * taper;

    const bulge = 1 + profile.bulge * Math.sin(Math.PI * height);
    x *= bulge;
    z *= bulge;

    const twist = profile.twist * height * baseLock;
    const cosine = Math.cos(twist);
    const sine = Math.sin(twist);
    const twistedX = x * cosine - z * sine;
    const twistedZ = x * sine + z * cosine;
    x = twistedX + profile.leanX * extentY * height * baseLock;
    z = twistedZ + profile.leanZ * extentY * height * baseLock;

    const nx = (originalX - center.x) / extentX;
    const ny = centeredHeight * 2;
    const nz = (originalZ - center.z) / extentZ;
    const frequency = profile.noiseFrequency;
    const noise = (
      Math.sin(nx * frequency * 2.13 + profile.phases[0])
      * Math.cos(ny * frequency * 1.37 + profile.phases[1])
      * Math.sin(nz * frequency * 1.79 + profile.phases[2])
    );
    const displacement = noise * profile.noiseAmplitude * referenceScale * baseLock;
    if (sourceNormal) {
      vector.set(sourceNormal.getX(index), sourceNormal.getY(index), sourceNormal.getZ(index)).normalize();
    } else {
      vector.set(nx, 0.25, nz).normalize();
    }
    x += vector.x * displacement;
    y += vector.y * displacement;
    z += vector.z * displacement;

    position.setXYZ(index, center.x + x, baseY + y, center.z + z);
  }

  position.needsUpdate = true;
  result.deleteAttribute('normal');
  result.computeVertexNormals();
  result.deleteAttribute('tangent');
  if (result.index && result.getAttribute('uv')) {
    try {
      result.computeTangents();
    } catch {
      // Degenerate source UV islands can make tangent reconstruction fail;
      // normals and the original UVs remain valid in that case.
    }
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  result.userData = {
    ...result.userData,
    toonlabReferenceVariation: structuredClone(profile),
  };
  return result;
}

function neutralMaterial() {
  return new THREE.MeshStandardMaterial({
    // Light clay stays legible against Rock Lab's sky/ground without adding
    // ToonLab ramps, vertex tinting, or source textures.
    color: 0xb8b1a6,
    metalness: 0,
    roughness: 0.9,
  });
}

/**
 * THREE.Material.clone() copies node slots and userData, but it does not copy
 * instance-owned setupLightingModel overrides. Reinstall the ToonLab bridge
 * on the clone so its closure reads the cloned material's authored nodes.
 */
function cloneRockReferenceMaterial(material) {
  if (!material?.clone) throw new TypeError('A clonable THREE.Material is required.');
  const clone = material.clone();
  const toonLabLighting = material.userData?.toonLabSurfaceLighting;
  if (toonLabLighting && clone.isNodeMaterial) {
    installToonLabSurfaceLighting(clone, { workflow: toonLabLighting.workflow });
  }
  return clone;
}

function cloneMaterial(asset, mode) {
  if (mode === 'source' && asset.sourceMaterial) {
    return cloneRockReferenceMaterial(asset.sourceMaterial);
  }
  if ((mode === 'toonlab' || mode === 'toonlab') && asset.toonLabMaterial) {
    return cloneRockReferenceMaterial(asset.toonLabMaterial);
  }
  if (mode === 'authored' && asset.authoredMaterial) {
    return cloneRockReferenceMaterial(asset.authoredMaterial);
  }
  return neutralMaterial();
}

/** Builds a native THREE.LOD from exact authored source LOD geometries. */
export function createRockReferenceLodObject(asset, {
  geometryMode = 'original',
  materialMode = 'authored',
  seed = 0,
  strength = 1,
} = {}) {
  if (!asset?.entry || !Array.isArray(asset.lods) || asset.lods.length === 0) {
    throw new TypeError('A loaded rock reference asset with at least one LOD is required.');
  }
  const resolvedGeometryMode = geometryMode === 'variation' ? 'variation' : 'original';
  const resolvedMaterialMode = ROCK_REFERENCE_MATERIAL_MODES.includes(materialMode)
    ? materialMode
    : 'neutral';
  const profile = createRockReferenceVariationProfile({
    referenceId: asset.entry.id,
    seed,
    strength: resolvedGeometryMode === 'variation' ? strength : 0,
  });
  asset.lods[0].geometry.computeBoundingBox();
  asset.lods[0].geometry.computeBoundingSphere();
  const sourceBounds = asset.lods[0].geometry.boundingBox.clone();
  const sourceRadius = Math.max(asset.lods[0].geometry.boundingSphere?.radius ?? 1, 0.1);
  const lod = new THREE.LOD();
  lod.name = `${asset.entry.sourceAssetName}_${resolvedGeometryMode}`;
  const levels = asset.lods.map((source, index) => {
    const geometry = deformRockReferenceGeometry(source.geometry, profile, { sourceBounds });
    const material = cloneMaterial(asset, resolvedMaterialMode);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${asset.entry.sourceAssetName}_LOD${index}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const distance = index === 0 ? 0 : sourceRadius * (index === 1 ? 9 : 22);
    lod.addLevel(mesh, distance);
    return {
      actualTriangles: geometryTriangleCount(geometry),
      distance,
      geometry,
      lod: index,
      material,
      mesh,
      targetTriangles: asset.entry.target.lodTriangles[index],
    };
  });
  lod.userData.toonlabRockReference = {
    geometryMode: resolvedGeometryMode,
    id: asset.entry.id,
    materialMode: resolvedMaterialMode,
    profile: structuredClone(profile),
    sourceAssetName: asset.entry.sourceAssetName,
  };
  return {
    dispose() {
      for (const level of levels) {
        level.geometry.dispose();
        level.material.dispose();
      }
      lod.removeFromParent();
    },
    levels,
    lod,
    profile,
    report: {
      levels: levels.map((level) => ({
        actualTriangles: level.actualTriangles,
        lod: level.lod,
        targetTriangles: level.targetTriangles,
      })),
      method: resolvedGeometryMode === 'variation'
        ? 'authored-source-lod-vertex-deformation'
        : 'authored-source-lod-original',
      sourceAssetName: asset.entry.sourceAssetName,
    },
  };
}

/** Exports the original or varied authored LOD set without re-meshing it. */
export async function exportRockReferenceAssetToGLB(asset, options = {}) {
  const built = createRockReferenceLodObject(asset, options);
  const root = new THREE.Group();
  root.name = `${asset.entry.sourceAssetName}_LODSet`;
  root.userData.toonlabRockReference = {
    ...built.lod.userData.toonlabRockReference,
    lodTriangles: built.levels.map((level) => level.actualTriangles),
  };
  for (const level of built.levels) {
    const mesh = level.mesh.clone();
    mesh.geometry = level.geometry.clone();
    mesh.material = cloneRockReferenceMaterial(level.material);
    mesh.visible = true;
    root.add(mesh);
  }
  try {
    const exporter = new GLTFExporter();
    const buffer = await exporter.parseAsync(root, {
      binary: true,
      onlyVisible: false,
      trs: false,
    });
    return { buffer, report: built.report };
  } finally {
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material?.dispose();
      }
    });
    built.dispose();
  }
}
