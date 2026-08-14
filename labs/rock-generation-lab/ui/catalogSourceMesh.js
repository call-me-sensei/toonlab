import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import * as WebGPUTextureUtils from 'three/examples/jsm/utils/WebGPUTextureUtils.js';

import { computeVertexColors } from '../../../src/rockgen/mesh/meshAttributes.js';

const LOD_NAME = /(?:^|_)LOD(\d+)(?:$|_)/i;
const adjacencyCache = new WeakMap();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
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
  const amount = clamp((value - min) / Math.max(max - min, 1e-6), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3);
}

function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function cloneMaterial(material) {
  return material?.clone?.() ?? material;
}

function cloneMaterials(material) {
  return Array.isArray(material) ? material.map(cloneMaterial) : cloneMaterial(material);
}

function packedAttribute(attribute) {
  const values = new Float32Array(attribute.count * attribute.itemSize);
  for (let index = 0; index < attribute.count; index += 1) {
    values[index * attribute.itemSize] = attribute.getX(index);
    if (attribute.itemSize > 1) values[(index * attribute.itemSize) + 1] = attribute.getY(index);
    if (attribute.itemSize > 2) values[(index * attribute.itemSize) + 2] = attribute.getZ(index);
    if (attribute.itemSize > 3) values[(index * attribute.itemSize) + 3] = attribute.getW(index);
  }
  return values;
}

function refreshEditedGeometry(geometry, { tangents = false } = {}) {
  const position = geometry.getAttribute('position');
  if (!position) return;
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  if ((tangents || geometry.getAttribute('tangent'))
    && geometry.index && geometry.getAttribute('uv')) {
    try {
      geometry.computeTangents();
    } catch {
      // Keep the prior tangent buffer when degenerate source UV islands
      // prevent reconstruction; removing an active WebGPU vertex slot would
      // invalidate the material pipeline mid-frame.
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function geometryAdjacency(geometry) {
  let cached = adjacencyCache.get(geometry);
  if (cached) return cached;
  const count = geometry.getAttribute('position')?.count ?? 0;
  const sets = Array.from({ length: count }, () => new Set());
  const index = geometry.index;
  const addEdge = (left, right) => {
    if (left === right || left < 0 || right < 0 || left >= count || right >= count) return;
    sets[left].add(right);
    sets[right].add(left);
  };
  const triangleCount = Math.floor((index?.count ?? count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const a = index ? index.getX(offset) : offset;
    const b = index ? index.getX(offset + 1) : offset + 1;
    const c = index ? index.getX(offset + 2) : offset + 2;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  cached = sets.map((entry) => [...entry]);
  adjacencyCache.set(geometry, cached);
  return cached;
}

/** Replay portable sparse vertex deltas onto one decoded catalog mesh. */
export function applyCatalogMeshEdits(geometry, meshEdits, meshIndex = 0) {
  if (!geometry?.isBufferGeometry || !Array.isArray(meshEdits)) return 0;
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  let applied = 0;
  for (const edit of meshEdits) {
    if (Math.max(0, Math.round(Number(edit?.meshIndex) || 0)) !== meshIndex) continue;
    for (const delta of Array.isArray(edit?.deltas) ? edit.deltas : []) {
      const vertexIndex = Math.round(Number(delta?.[0]));
      const x = Number(delta?.[1]);
      const y = Number(delta?.[2]);
      const z = Number(delta?.[3]);
      if (vertexIndex < 0 || vertexIndex >= position.count || ![x, y, z].every(Number.isFinite)) {
        continue;
      }
      position.setXYZ(
        vertexIndex,
        position.getX(vertexIndex) + x,
        position.getY(vertexIndex) + y,
        position.getZ(vertexIndex) + z,
      );
      applied += 1;
    }
  }
  if (applied > 0) refreshEditedGeometry(geometry, { tangents: true });
  return applied;
}

/** Apply one live sculpt stamp to decoded BufferGeometry without changing topology or UVs. */
export function sculptCatalogGeometry(geometry, {
  point,
  normal = [0, 1, 0],
  radius = 0.5,
  strength = 0.35,
  tool = 'inflate',
} = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(point)) return 0;
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const brushRadius = Math.max(Number(radius) || 0.5, 0.001);
  const brushStrength = clamp(Number(strength) || 0, 0, 1);
  const center = new THREE.Vector3(...point);
  const planeNormal = new THREE.Vector3(...normal).normalize();
  const vertex = new THREE.Vector3();
  const average = new THREE.Vector3();
  const neighbors = tool === 'smooth' ? geometryAdjacency(geometry) : null;
  const next = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    next[index * 3] = position.getX(index);
    next[(index * 3) + 1] = position.getY(index);
    next[(index * 3) + 2] = position.getZ(index);
  }
  let touched = 0;
  for (let index = 0; index < position.count; index += 1) {
    vertex.set(position.getX(index), position.getY(index), position.getZ(index));
    const distance = vertex.distanceTo(center);
    if (distance > brushRadius) continue;
    const linear = 1 - (distance / brushRadius);
    const weight = linear * linear * (3 - (2 * linear));
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (tool === 'smooth') {
      const adjacent = neighbors[index];
      if (adjacent.length === 0) continue;
      average.set(0, 0, 0);
      for (const neighbor of adjacent) {
        average.x += position.getX(neighbor);
        average.y += position.getY(neighbor);
        average.z += position.getZ(neighbor);
      }
      average.multiplyScalar(1 / adjacent.length).sub(vertex).multiplyScalar(brushStrength * weight * 0.65);
      ({ x: dx, y: dy, z: dz } = average);
    } else if (tool === 'flatten') {
      const signedDistance = vertex.clone().sub(center).dot(planeNormal);
      const amount = -signedDistance * brushStrength * weight;
      dx = planeNormal.x * amount;
      dy = planeNormal.y * amount;
      dz = planeNormal.z * amount;
    } else {
      const direction = tool === 'deflate' ? -1 : 1;
      const amount = brushRadius * brushStrength * weight * 0.16 * direction;
      dx = normals.getX(index) * amount;
      dy = normals.getY(index) * amount;
      dz = normals.getZ(index) * amount;
    }
    next[index * 3] += dx;
    next[(index * 3) + 1] += dy;
    next[(index * 3) + 2] += dz;
    touched += 1;
  }
  if (touched === 0) return 0;
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(index, next[index * 3], next[(index * 3) + 1], next[(index * 3) + 2]);
  }
  refreshEditedGeometry(geometry);
  return touched;
}

/** Bake the regular Rock Generation surface stack onto an imported GLB mesh. */
export function applyCatalogGeneratedSurface(geometry, surface, seed = 0) {
  if (!geometry?.isBufferGeometry || !surface) return false;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return false;
  const positions = packedAttribute(position);
  const normals = packedAttribute(normal);
  const ao = new Float32Array(position.count).fill(1);
  const bounds = geometry.boundingBox;
  const colors = computeVertexColors(
    positions,
    normals,
    ao,
    surface,
    Math.round(Number(seed) || 0) >>> 0,
    {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    },
  );
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return true;
}

/** Tint only the upward-facing cap while leaving the authored GLB material neutral elsewhere. */
export function applyCatalogSourceTopOverlay(geometry, surface, seed = 0) {
  if (!geometry?.isBufferGeometry || !surface) return false;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const bounds = geometry.boundingBox;
  if (!position || !normal || !bounds) return false;

  const positions = packedAttribute(position);
  const normals = packedAttribute(normal);
  const boundsArray = {
    min: [bounds.min.x, bounds.min.y, bounds.min.z],
    max: [bounds.max.x, bounds.max.y, bounds.max.z],
  };
  const colors = computeVertexColors(
    positions,
    normals,
    new Float32Array(position.count).fill(1),
    {
      ...surface,
      baseColor: [1, 1, 1],
      cavityColor: [1, 1, 1],
      colorNoise: 0,
      textureStrength: 0,
      textureStyle: 'none',
      topCoatStrength: 0,
    },
    Math.round(Number(seed) || 0) >>> 0,
    boundsArray,
  );
  const coat = clamp(Number(surface.topCoatStrength) || 0, 0, 1);
  const topHeightStart = clamp(Number(surface.topHeightStart) || 0, 0, 1);
  const topSlopeStart = clamp(Number(surface.topSlopeStart) || 0, 0, 1);
  const sourceColor = Array.isArray(surface.topColor) ? surface.topColor : [1, 1, 1];
  const topColor = sourceColor.map((channel) => {
    const srgb = clamp(Number(channel) || 0, 0, 1);
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const heightSpan = Math.max(bounds.max.y - bounds.min.y, 1e-6);
  for (let index = 0; index < position.count; index += 1) {
    const normalizedHeight = (position.getY(index) - bounds.min.y) / heightSpan;
    const heightMask = smoothstep(topHeightStart, Math.min(topHeightStart + 0.16, 1), normalizedHeight);
    const slopeMask = smoothstep(topSlopeStart, Math.min(topSlopeStart + 0.18, 1), normal.getY(index));
    const blend = clamp(heightMask * slopeMask * coat, 0, 1);
    const offset = index * 3;
    colors[offset] += (topColor[0] - colors[offset]) * blend;
    colors[offset + 1] += (topColor[1] - colors[offset + 1]) * blend;
    colors[offset + 2] += (topColor[2] - colors[offset + 2]) * blend;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return true;
}

function enableVertexColors(material) {
  for (const entry of materialsOf({ material })) {
    if (!entry) continue;
    entry.vertexColors = true;
    entry.needsUpdate = true;
  }
}

function disposeMaterials(material, { textures = false } = {}) {
  for (const entry of Array.isArray(material) ? material : [material]) {
    if (!entry) continue;
    if (textures) {
      for (const value of Object.values(entry)) {
        if (value?.isTexture) value.dispose();
      }
    }
    entry.dispose?.();
  }
}

function createVariationProfile(referenceId, seed, strength) {
  const amount = clamp(Number(strength) || 0, 0, 1);
  const identitySeed = hash(`${referenceId}:${Math.round(Number(seed) || 0) >>> 0}`);
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

/** Clone and conservatively deform one rock template mesh without changing topology or UVs. */
export function deformCatalogGeometry(source, profile) {
  if (!source?.isBufferGeometry) throw new TypeError('Catalog variation requires BufferGeometry.');
  const result = source.clone();
  result.computeBoundingBox();
  if (!profile || profile.strength <= 0) {
    result.computeBoundingSphere();
    return result;
  }

  const bounds = result.boundingBox.clone();
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const baseY = bounds.min.y;
  const extentX = Math.max(size.x * 0.5, 1e-4);
  const extentY = Math.max(size.y, 1e-4);
  const extentZ = Math.max(size.z * 0.5, 1e-4);
  const referenceScale = Math.max(Math.min(extentX, extentY * 0.5, extentZ), 1e-4);
  const position = result.getAttribute('position');
  const sourceNormal = source.getAttribute('normal');
  const normal = new THREE.Vector3();

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
    const noise = Math.sin(nx * profile.noiseFrequency * 2.13 + profile.phases[0])
      * Math.cos(ny * profile.noiseFrequency * 1.37 + profile.phases[1])
      * Math.sin(nz * profile.noiseFrequency * 1.79 + profile.phases[2]);
    const displacement = noise * profile.noiseAmplitude * referenceScale * baseLock;
    if (sourceNormal) {
      normal.set(sourceNormal.getX(index), sourceNormal.getY(index), sourceNormal.getZ(index)).normalize();
    } else {
      normal.set(nx, 0.25, nz).normalize();
    }
    position.setXYZ(
      index,
      center.x + x + normal.x * displacement,
      baseY + y + normal.y * displacement,
      center.z + z + normal.z * displacement,
    );
  }

  position.needsUpdate = true;
  result.deleteAttribute('normal');
  result.computeVertexNormals();
  result.deleteAttribute('tangent');
  if (result.index && result.getAttribute('uv')) {
    try {
      result.computeTangents();
    } catch {
      // Degenerate source UV islands can prevent tangent reconstruction.
    }
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function createCatalogSourceLoader(renderer) {
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath('/basis/')
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2Loader);
  return {
    dispose() {
      ktx2Loader.dispose();
    },
    loader,
  };
}

export async function loadCatalogSource(entry, loader) {
  let gltf;
  try {
    if (entry?.sourceMode !== 'official-glb' || !entry?.modelUrl) {
      throw new Error('The Gallery entry has no immutable public GLB.');
    }
    gltf = await loader.loadAsync(entry.modelUrl);
  } catch (error) {
    throw new Error(`Unable to load ${entry?.label ?? 'catalog rock'} from the Gallery GLB: ${error.message}`);
  }
  const meshes = [];
  gltf.scene.traverse((object) => {
    if (object.isMesh && object.geometry) meshes.push(object);
  });
  if (meshes.length === 0) throw new Error(`${entry.label} contains no mesh geometry.`);
  return {
    dispose() {
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose?.();
        disposeMaterials(object.material, { textures: true });
      });
    },
    entry,
    meshes,
    root: gltf.scene,
  };
}

export function createCatalogVariation(source, {
  meshEdits = [],
  preserveSourceMaterial = false,
  seed = 0,
  strength = 0.3,
  surface = null,
  surfaceMode = 'source',
} = {}) {
  const profile = createVariationProfile(source.entry.variationId, seed, strength);
  const root = source.root.clone(true);
  const sourceMeshes = [];
  const clonedMeshes = [];
  source.root.traverse((object) => { if (object.isMesh) sourceMeshes.push(object); });
  root.traverse((object) => { if (object.isMesh) clonedMeshes.push(object); });
  if (sourceMeshes.length !== clonedMeshes.length) {
    throw new Error('The catalog GLB could not be cloned without changing its mesh hierarchy.');
  }

  const previewMeshes = [];
  for (let index = 0; index < clonedMeshes.length; index += 1) {
    const sourceMesh = sourceMeshes[index];
    const mesh = clonedMeshes[index];
    mesh.geometry = deformCatalogGeometry(sourceMesh.geometry, profile);
    applyCatalogMeshEdits(mesh.geometry, meshEdits, index);
    mesh.material = cloneMaterials(sourceMesh.material);
    if (surfaceMode === 'generated') {
      const applied = (preserveSourceMaterial
        ? applyCatalogSourceTopOverlay
        : applyCatalogGeneratedSurface)(
        mesh.geometry,
        surface,
        (Math.round(Number(seed) || 0) + index) >>> 0,
      );
      if (applied && preserveSourceMaterial) {
        enableVertexColors(mesh.material);
      } else if (applied) {
        disposeMaterials(mesh.material);
        mesh.material = new THREE.MeshStandardMaterial({
          metalness: 0,
          roughness: 0.92,
          vertexColors: true,
        });
        mesh.material.name = 'ToonLab editable catalog rock surface';
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const match = String(mesh.name).match(LOD_NAME);
    mesh.visible = !match || Number(match[1]) === 0;
    if (mesh.visible) previewMeshes.push(mesh);
  }
  if (previewMeshes.length === 0) {
    clonedMeshes[0].visible = true;
    previewMeshes.push(clonedMeshes[0]);
  }
  root.userData.toonlabCatalogVariation = {
    galleryId: source.entry.galleryId,
    profile: structuredClone(profile),
    preserveSourceMaterial,
    sourceMode: source.entry.sourceMode,
    sourceVersion: source.entry.sourceVersion,
    surfaceMode,
    variationId: source.entry.variationId,
  };
  return {
    dispose() {
      root.removeFromParent();
      for (const mesh of clonedMeshes) {
        mesh.geometry.dispose();
        disposeMaterials(mesh.material);
      }
    },
    meshes: clonedMeshes,
    previewMeshes,
    profile,
    root,
    stats: {
      triangles: previewMeshes.reduce((total, mesh) => total + triangleCount(mesh.geometry), 0),
      vertices: previewMeshes.reduce(
        (total, mesh) => total + (mesh.geometry.getAttribute('position')?.count ?? 0),
        0,
      ),
    },
  };
}

export async function exportCatalogVariation(root, renderer) {
  if (!root) throw new Error('The selected catalog GLB is still loading.');
  const exporter = new GLTFExporter();
  exporter.setTextureUtils({
    decompress: (texture, maxTextureSize) => (
      WebGPUTextureUtils.decompress(texture, maxTextureSize, renderer)
    ),
  });
  return exporter.parseAsync(root, {
    binary: true,
    maxTextureSize: 2048,
    onlyVisible: false,
    trs: false,
  });
}
