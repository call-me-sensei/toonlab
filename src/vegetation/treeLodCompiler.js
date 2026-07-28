import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

import { createPlantFromRecipe, parseTreeRecipeDocument } from './treeRecipe.js';
import { disposeExportGroup, prepareTreeForExport } from './treeExport.js';
import {
  COMPILED_TREE_MANIFEST_SCHEMA,
  COMPILED_TREE_MANIFEST_VERSION,
} from './compiledTree.js';

export const TREE_LOD_TRIANGLE_CAPS = Object.freeze([12000, 7000, 3500, 140]);
export const TREE_LOD_SCREEN_COVERAGE = Object.freeze([0.16, 0.075, 0.025, 0]);

// Branch LOD follows the same structural rule as EZ-Tree 2: grow the full
// tree, then remesh every branch from the identical centerline data. Larger
// longitudinal strides and radial factors provide the reduction; branch
// levels are never deleted, because doing so destroys conifer silhouettes.
const LOD_RADIAL_FACTORS = Object.freeze([1, 0.75, 0.4]);
const LOD_SECTION_STRIDES = Object.freeze([1, 3, 6]);
// Static export cards lose the live shader's camera-facing behavior. Retain
// more authored cards than EZ-Tree's generic every-other-leaf default, then
// use modest scale compensation; the triangle budget remains the hard cap.
const LOD_FOLIAGE_RETENTION = Object.freeze([1, 1, 1]);
const LOD_FOLIAGE_SCALE = Object.freeze([1, 1, 1]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.attributes.position.count) / 3);
}

function rootTriangles(root) {
  let total = 0;
  root.traverse((object) => {
    if (object.isMesh && object.geometry) total += triangleCount(object.geometry);
  });
  return total;
}

function rootMaterialCount(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => materials.add(material));
  });
  return materials.size;
}

export function createProceduralTreeLeafTexture({ resolution = 128, seed = 1 } = {}) {
  const size = Math.max(16, Math.min(512, Math.round(resolution)));
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let value = (Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
      ^ Math.imul(Math.round(seed) + 1, 2246822519)) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const taper = Math.max(0, 1 - Math.abs(v) * 0.34);
      const leaf = (u / Math.max(taper, 0.05)) ** 2 + (v * 0.92) ** 2;
      const serration = Math.sin((Math.atan2(v, u) + 3.2) * 11) * 0.045;
      const alpha = leaf <= 0.76 + serration ? 255 : leaf <= 0.88 ? 128 : 0;
      const luminance = Math.round(180 + hash(x, y) * 65);
      const index = (y * size + x) * 4;
      data[index] = luminance;
      data[index + 1] = luminance;
      data[index + 2] = luminance;
      data[index + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'ToonLabTreeLeafAtlas';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createTreeLodRecipe(recipeInput, level) {
  const recipe = parseTreeRecipeDocument(recipeInput);
  const lod = THREE.MathUtils.clamp(Math.round(level), 0, 2);
  const options = cloneJson(recipe.options);
  options.canopy = { ...(options.canopy ?? {}) };
  options.skeleton = { ...(options.skeleton ?? {}) };
  options.trunk = { ...(options.trunk ?? {}) };
  // The skeleton grower still computes every source centerline and foliage
  // attachment at every LOD. Only the meshing density changes, so transitions
  // do not re-roll the tree or delete complete limb levels.
  options.skeleton.meshSectionStride = LOD_SECTION_STRIDES[lod];
  delete options.skeleton.meshLevelLimit;
  const skeletonRadialSegments = Number(options.skeleton.radialSegments) || 8;
  options.skeleton.radialSegments = Math.max(
    3,
    Math.round(skeletonRadialSegments * LOD_RADIAL_FACTORS[lod]),
  );
  const trunkRadialSegments = Number(options.trunk.radialSegments) || 10;
  options.trunk.radialSegments = Math.max(
    3,
    Math.round(trunkRadialSegments * LOD_RADIAL_FACTORS[lod]),
  );
  options.trunk.heightSegments = Math.max(
    6,
    Math.round((Number(options.trunk.heightSegments) || 14) * (1 - lod * 0.2)),
  );
  if (lod >= 1) options.foliage = { ...(options.foliage ?? {}), windStrength: 0.025 };
  if (lod >= 2) options.foliage = { ...(options.foliage ?? {}), windStrength: 0 };
  return { ...recipe, options };
}

function groundTreeLevel(root) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(bounds.min.y) && Math.abs(bounds.min.y) > 1e-6) {
    root.position.y -= bounds.min.y;
    root.updateWorldMatrix(true, true);
  }
  return root;
}

function ensureAttribute(geometry, name, itemSize, fill) {
  if (geometry.getAttribute(name)) return;
  const values = new Float32Array(geometry.attributes.position.count * itemSize);
  for (let index = 0; index < geometry.attributes.position.count; index += 1) {
    const entry = Array.isArray(fill) ? fill : [fill];
    for (let component = 0; component < itemSize; component += 1) {
      values[index * itemSize + component] = entry[component] ?? entry[0] ?? 0;
    }
  }
  geometry.setAttribute(name, new THREE.BufferAttribute(values, itemSize));
}

function remapUvColumn(geometry, offset, scale) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setX(index, offset + THREE.MathUtils.clamp(uv.getX(index), 0, 1) * scale);
  }
  uv.needsUpdate = true;
}

function textureData(texture) {
  const image = texture?.image;
  if (!texture?.isDataTexture || !image?.data || !image.width || !image.height) return null;
  return {
    data: image.data,
    height: image.height,
    width: image.width,
  };
}

function createSingleMaterialAtlas(trunkMap, foliageMap) {
  const trunk = textureData(trunkMap);
  const foliage = textureData(foliageMap);
  const tileWidth = Math.max(16, trunk?.width ?? 0, foliage?.width ?? 0, 128);
  const tileHeight = Math.max(16, trunk?.height ?? 0, foliage?.height ?? 0, 128);
  const data = new Uint8Array(tileWidth * 2 * tileHeight * 4);
  const sample = (source, x, y, fallback) => {
    if (!source) return fallback;
    const sourceX = Math.min(source.width - 1, Math.floor(x / tileWidth * source.width));
    const sourceY = Math.min(source.height - 1, Math.floor(y / tileHeight * source.height));
    const offset = (sourceY * source.width + sourceX) * 4;
    return [
      source.data[offset] ?? 255,
      source.data[offset + 1] ?? 255,
      source.data[offset + 2] ?? 255,
      source.data[offset + 3] ?? 255,
    ];
  };
  for (let y = 0; y < tileHeight; y += 1) {
    for (let x = 0; x < tileWidth; x += 1) {
      const bark = sample(trunk, x, y, [255, 255, 255, 255]);
      const barkOffset = (y * tileWidth * 2 + x) * 4;
      data.set(bark, barkOffset);

      let leaf;
      if (foliage) {
        leaf = sample(foliage, x, y, [255, 255, 255, 0]);
      } else {
        const u = (x + 0.5) / tileWidth * 2 - 1;
        const v = (y + 0.5) / tileHeight * 2 - 1;
        const taper = Math.max(0.05, 1 - Math.abs(v) * 0.34);
        const shape = (u / taper) ** 2 + (v * 0.92) ** 2;
        leaf = [255, 255, 255, shape <= 0.8 ? 255 : shape <= 0.9 ? 128 : 0];
      }
      const leafOffset = (y * tileWidth * 2 + tileWidth + x) * 4;
      data.set(leaf, leafOffset);
    }
  }
  const atlas = new THREE.DataTexture(
    data,
    tileWidth * 2,
    tileHeight,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  atlas.name = 'TreeLod2SurfaceAtlas';
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.flipY = false;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.needsUpdate = true;
  atlas.userData.bakedLeafTexture = true;
  return atlas;
}

function combinedSingleMaterialLevel(exported) {
  const trunk = exported.children.find((child) => child.name === 'Trunk');
  const foliage = exported.children.find((child) => child.name === 'Foliage');
  const pieces = [trunk, foliage].filter(Boolean).map((mesh, index) => {
    const geometry = mesh.geometry.clone();
    ensureAttribute(geometry, 'normal', 3, [0, 1, 0]);
    ensureAttribute(geometry, 'uv', 2, [0, 0]);
    const materialColor = mesh.material?.color ?? new THREE.Color(1, 1, 1);
    ensureAttribute(
      geometry,
      'color',
      3,
      index === 0
        ? [materialColor.r, materialColor.g, materialColor.b]
        : [1, 1, 1],
    );
    remapUvColumn(geometry, index === 0 ? 0 : 0.5, 0.5);
    ensureAttribute(geometry, 'treeMaterialSelector', 1, index === 0 ? 0 : 1);
    return geometry;
  });
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error('Could not merge the single-material tree LOD.');
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createSingleMaterialAtlas(trunk?.material?.map, foliage?.material?.map),
    alphaTest: foliage?.material?.alphaTest ?? 0.3,
    metalness: 0,
    roughness: 1,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.name = 'TreeSingleMaterial';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'TreeSingleMaterialMesh';
  mesh.castShadow = true;
  root.add(mesh);
  return root;
}

function averageFoliageColor(root) {
  const color = new THREE.Color(0.26, 0.56, 0.24);
  const foliage = root.children.find((child) => child.name === 'Foliage');
  const colors = foliage?.geometry?.attributes?.color;
  if (!colors?.count) return color;
  color.setRGB(0, 0, 0);
  const stride = Math.max(1, Math.floor(colors.count / 2048));
  let samples = 0;
  for (let index = 0; index < colors.count; index += stride) {
    color.r += colors.getX(index);
    color.g += colors.getY(index);
    color.b += colors.getZ(index);
    samples += 1;
  }
  return color.multiplyScalar(1 / Math.max(samples, 1));
}

function createCrownEnvelopeGeometry(sourceRoot, bounds, color, minimumY = -Infinity) {
  const size = bounds.getSize(new THREE.Vector3());
  const ringCount = 8;
  const radialSegments = 8;
  const pointsXY = [];
  const pointsZY = [];
  const pointsXZ = [];
  const points3D = [];
  const addPoint = (point) => {
    if (point.y < minimumY) return;
    pointsXY.push([point.x, point.y]);
    pointsZY.push([point.z, point.y]);
    pointsXZ.push([point.x, point.z]);
    points3D.push(point.clone());
  };
  sourceRoot?.updateWorldMatrix(true, true);
  sourceRoot?.traverse((object) => {
    const position = object?.geometry?.attributes?.position;
    if (!position) return;
    const uv = object.geometry.getAttribute('uv');
    const vertex = new THREE.Vector3();
    if (/foliage|leaf/i.test(object.name) && uv && position.count % 4 === 0) {
      const corners = new Array(4);
      for (let offset = 0; offset < position.count; offset += 4) {
        corners.fill(null);
        for (let corner = 0; corner < 4; corner += 1) {
          const index = offset + corner;
          const u = Math.round(uv.getX(index));
          const v = Math.round(uv.getY(index));
          corners[v * 2 + u] = vertex.fromBufferAttribute(position, index).clone();
        }
        if (corners.some((corner) => !corner)) continue;
        // Sample the same analytical alpha contour used by the leaf atlas.
        // Export-card corners are transparent; including them would inflate a
        // far proxy even though those pixels never contribute to the source
        // silhouette.
        for (let sample = 0; sample <= 16; sample += 1) {
          const leafY = sample / 16 * 2 - 1;
          const taper = Math.max(0.05, 1 - Math.abs(leafY) * 0.34);
          const leafX = taper * Math.sqrt(Math.max(0, 0.88 - (leafY * 0.92) ** 2));
          for (const signedX of [-leafX, leafX]) {
            const u = (signedX + 1) * 0.5;
            const v = (leafY + 1) * 0.5;
            vertex.copy(corners[0]).multiplyScalar((1 - u) * (1 - v))
              .addScaledVector(corners[1], u * (1 - v))
              .addScaledVector(corners[2], (1 - u) * v)
              .addScaledVector(corners[3], u * v)
              .applyMatrix4(object.matrixWorld);
            addPoint(vertex);
          }
        }
      }
      return;
    }
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      addPoint(vertex);
    }
  });
  const projectedHull = (points, firstAxis, secondAxis) => {
    const unique = new Map();
    for (const point of points) {
      const first = point[firstAxis];
      const second = point[secondAxis];
      unique.set(`${first.toFixed(6)}:${second.toFixed(6)}`, { first, second, point });
    }
    const sorted = [...unique.values()].sort((left, right) => (
      left.first - right.first || left.second - right.second
    ));
    if (sorted.length < 3) return sorted;
    const turn = (a, b, c) => (b.first - a.first) * (c.second - a.second)
      - (b.second - a.second) * (c.first - a.first);
    const lower = [];
    for (const entry of sorted) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], entry) <= 0) {
        lower.pop();
      }
      lower.push(entry);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const entry = sorted[index];
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], entry) <= 0) {
        upper.pop();
      }
      upper.push(entry);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  };
  if (points3D.length >= 4) {
    // Preserve every extreme point in the three authored review projections.
    // A convex hull built from this union has the same front, side and top
    // convex envelopes as the source geometry, while remaining a genuinely
    // camera-independent 3D proxy. Most stylized crowns need fewer than 40
    // triangles; keep 12 triangles in reserve for the grounded trunk.
    const projectionSupports = new Map();
    for (const [firstAxis, secondAxis] of [['x', 'y'], ['z', 'y'], ['x', 'z']]) {
      for (const entry of projectedHull(points3D, firstAxis, secondAxis)) {
        const point = entry.point;
        projectionSupports.set(
          `${point.x.toFixed(5)}:${point.y.toFixed(5)}:${point.z.toFixed(5)}`,
          point,
        );
      }
    }
    if (projectionSupports.size >= 4) {
      const exactGeometry = new ConvexGeometry([...projectionSupports.values()]);
      if (triangleCount(exactGeometry) <= 128) {
        ensureAttribute(exactGeometry, 'uv', 2, [0, 0]);
        ensureAttribute(exactGeometry, 'color', 3, [color.r, color.g, color.b]);
        return exactGeometry;
      }
      exactGeometry.dispose();
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    half.set(Math.max(half.x, 1e-5), Math.max(half.y, 1e-5), Math.max(half.z, 1e-5));
    const directions = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
    for (const latitude of [-60, -30, 0, 30, 60]) {
      const polar = THREE.MathUtils.degToRad(latitude);
      for (let segment = 0; segment < 8; segment += 1) {
        const angle = segment / 8 * Math.PI * 2;
        directions.push(new THREE.Vector3(
          Math.cos(polar) * Math.cos(angle),
          Math.sin(polar),
          Math.cos(polar) * Math.sin(angle),
        ));
      }
    }
    const supports = new Map();
    for (const direction of directions) {
      let best = null;
      let bestScore = -Infinity;
      for (const point of points3D) {
        const score = ((point.x - center.x) / half.x) * direction.x
          + ((point.y - center.y) / half.y) * direction.y
          + ((point.z - center.z) / half.z) * direction.z;
        if (score > bestScore) {
          bestScore = score;
          best = point;
        }
      }
      if (best) supports.set(`${best.x.toFixed(5)}:${best.y.toFixed(5)}:${best.z.toFixed(5)}`, best);
    }
    if (supports.size >= 4) {
      const geometry = new ConvexGeometry([...supports.values()]);
      ensureAttribute(geometry, 'uv', 2, [0, 0]);
      ensureAttribute(geometry, 'color', 3, [color.r, color.g, color.b]);
      return geometry;
    }
  }
  const hull = (points) => {
    if (points.length < 3) return points;
    const sorted = [...points].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  };
  const rangeAt = (polygon, y, fallbackMin, fallbackMax) => {
    const values = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if (Math.abs(a[1] - y) < 1e-5) values.push(a[0]);
      if ((a[1] < y && b[1] > y) || (b[1] < y && a[1] > y)) {
        values.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    if (values.length >= 2) return [Math.min(...values), Math.max(...values)];
    if (values.length === 1) {
      const padding = (fallbackMax - fallbackMin) * 0.025;
      return [values[0] - padding, values[0] + padding];
    }
    return [fallbackMin, fallbackMax];
  };
  const hullXY = hull(pointsXY);
  const hullZY = hull(pointsZY);
  const hullXZ = hull(pointsXZ);
  const overallCx = (bounds.min.x + bounds.max.x) * 0.5;
  const overallCz = (bounds.min.z + bounds.max.z) * 0.5;
  const overallRx = Math.max((bounds.max.x - bounds.min.x) * 0.5, 1e-5);
  const overallRz = Math.max((bounds.max.z - bounds.min.z) * 0.5, 1e-5);
  const radialShape = Array.from({ length: radialSegments }, (_, segment) => {
    const angle = segment / radialSegments * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const support = hullXZ.reduce((best, point) => {
      const score = ((point[0] - overallCx) / overallRx) * dx
        + ((point[1] - overallCz) / overallRz) * dz;
      return !best || score > best.score ? { point, score } : best;
    }, null);
    return support
      ? [(support.point[0] - overallCx) / overallRx, (support.point[1] - overallCz) / overallRz]
      : [dx, dz];
  });
  const rings = Array.from({ length: ringCount }, (_, ring) => {
    const y = THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, ring / (ringCount - 1));
    const [minX, maxX] = rangeAt(hullXY, y, bounds.min.x, bounds.max.x);
    const [minZ, maxZ] = rangeAt(hullZY, y, bounds.min.z, bounds.max.z);
    return { y, minX, maxX, minZ, maxZ };
  });
  const positions = [];
  const colors = [];
  const uvs = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    const band = rings[ring];
    const cx = (band.minX + band.maxX) * 0.5;
    const cz = (band.minZ + band.maxZ) * 0.5;
    const rx = Math.max((band.maxX - band.minX) * 0.5, size.x * 0.12);
    const rz = Math.max((band.maxZ - band.minZ) * 0.5, size.z * 0.12);
    for (let segment = 0; segment < radialSegments; segment += 1) {
      positions.push(
        cx + radialShape[segment][0] * rx,
        band.y,
        cz + radialShape[segment][1] * rz,
      );
      colors.push(color.r, color.g, color.b);
      uvs.push(segment / radialSegments, ring / (ringCount - 1));
    }
  }
  const indices = [];
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = ring * radialSegments + next;
      const c = (ring + 1) * radialSegments + next;
      const d = (ring + 1) * radialSegments + segment;
      indices.push(a, b, c, a, c, d);
    }
  }
  const bottomCenter = positions.length / 3;
  const bottomBand = rings[0];
  const topBand = rings[ringCount - 1];
  positions.push(
    (bottomBand.minX + bottomBand.maxX) * 0.5, bounds.min.y,
    (bottomBand.minZ + bottomBand.maxZ) * 0.5,
  );
  colors.push(color.r, color.g, color.b);
  uvs.push(0.5, 0);
  const topCenter = positions.length / 3;
  positions.push(
    (topBand.minX + topBand.maxX) * 0.5, bounds.max.y,
    (topBand.minZ + topBand.maxZ) * 0.5,
  );
  colors.push(color.r, color.g, color.b);
  uvs.push(0.5, 1);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(bottomCenter, next, segment);
    const topOffset = (ringCount - 1) * radialSegments;
    indices.push(topCenter, topOffset + segment, topOffset + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function upperBounds(reference, minimumY) {
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  reference.traverse((object) => {
    const position = object?.geometry?.attributes?.position;
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      if (vertex.y >= minimumY) bounds.expandByPoint(vertex);
    }
  });
  return bounds;
}

function trunkBase(reference, fullBounds) {
  const trunk = reference.children.find((child) => child.name === 'Trunk');
  const position = trunk?.geometry?.attributes?.position;
  if (!position) return new THREE.Vector3(
    (fullBounds.min.x + fullBounds.max.x) * 0.5,
    fullBounds.min.y,
    (fullBounds.min.z + fullBounds.max.z) * 0.5,
  );
  const threshold = fullBounds.min.y + Math.max(fullBounds.max.y - fullBounds.min.y, 0.1) * 0.035;
  const result = new THREE.Vector3();
  let count = 0;
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    if (y > threshold) continue;
    result.x += position.getX(index);
    result.y += y;
    result.z += position.getZ(index);
    count += 1;
  }
  return count ? result.multiplyScalar(1 / count) : new THREE.Vector3(0, fullBounds.min.y, 0);
}

function createUltraFarProxy(reference) {
  const foliage = reference.children.find((child) => child.name === 'Foliage');
  reference.updateWorldMatrix(true, true);
  const fullBounds = new THREE.Box3().setFromObject(reference);
  const foliageBounds = new THREE.Box3().setFromObject(foliage ?? reference);
  const fullSize = fullBounds.getSize(new THREE.Vector3());
  const foliageSize = foliageBounds.getSize(new THREE.Vector3());
  const architecture = reference.userData?.treeRecipe?.options?.canopy?.architecture;
  const radialFronds = architecture === 'radial-fronds';
  const needleWhorls = architecture === 'needle-whorls';
  const sparseUpperCrown = foliageSize.y / Math.max(fullSize.y, 1e-5) < 0.25;
  const wholeTreeEnvelope = sparseUpperCrown && !radialFronds && !needleWhorls;
  const useUpperSkeleton = radialFronds || needleWhorls || sparseUpperCrown;
  const crownStart = needleWhorls ? 0.12 : radialFronds ? 0.28 : 0.1;
  const minimumCrownY = useUpperSkeleton
    ? THREE.MathUtils.lerp(fullBounds.min.y, fullBounds.max.y, crownStart)
    : -Infinity;
  const upper = useUpperSkeleton ? upperBounds(reference, minimumCrownY) : null;
  const bounds = wholeTreeEnvelope
    ? fullBounds.clone()
    : upper && !upper.isEmpty()
      ? upper
      : new THREE.Box3().setFromObject(foliage ?? reference);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const color = averageFoliageColor(reference);
  const pieces = [createCrownEnvelopeGeometry(
    useUpperSkeleton ? reference : foliage,
    bounds,
    color,
    wholeTreeEnvelope ? -Infinity : minimumCrownY,
  )];
  // A real volumetric far tree still needs a grounded trunk. Six radial
  // segments keep the crown-plus-trunk proxy below 140 triangles, below the
  // 140-triangle contract, while retaining the upright silhouette from every
  // camera direction (a billboard cannot do this).
  if (wholeTreeEnvelope) {
    const geometry = pieces[0];
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    material.name = 'TreeVolumetricProxy';
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'TreeVolumetricProxyMesh';
    root.add(mesh);
    return root;
  }
  const base = trunkBase(reference, fullBounds);
  const join = new THREE.Vector3(center.x, bounds.min.y + size.y * 0.18, center.z);
  const trunkDirection = join.clone().sub(base);
  const trunkHeight = Math.max(trunkDirection.length(), size.y * 0.28);
  const trunkRadius = Math.max(Math.min(size.x, size.z) * 0.045, 0.045);
  const trunkSource = new THREE.CylinderGeometry(
    trunkRadius * 0.58,
    trunkRadius,
    trunkHeight,
    6,
    1,
    true,
  );
  trunkSource.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    trunkDirection.normalize(),
  ));
  trunkSource.translate(
    (base.x + join.x) * 0.5,
    (base.y + join.y) * 0.5,
    (base.z + join.z) * 0.5,
  );
  const trunk = trunkSource.toNonIndexed();
  trunkSource.dispose();
  ensureAttribute(trunk, 'uv', 2, [0, 0]);
  ensureAttribute(trunk, 'color', 3, [0.34, 0.24, 0.15]);
  pieces.push(trunk);
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  material.name = 'TreeVolumetricProxy';
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TreeVolumetricProxyMesh';
  root.add(mesh);
  return root;
}

function boundsForLevels(levels) {
  const box = new THREE.Box3().setFromObject(levels[0]);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return {
    box: { min: box.min.toArray(), max: box.max.toArray() },
    center: sphere.center.toArray(),
    radius: sphere.radius,
  };
}

export function compileTreeLodLevels(recipeInput, { leafTexture = null } = {}) {
  const recipe = parseTreeRecipeDocument(recipeInput);
  const ownedLeafTexture = leafTexture ?? createProceduralTreeLeafTexture({
    seed: recipe.options.seed ?? 1,
  });
  const levels = [];
  try {
    for (let level = 0; level < 3; level += 1) {
      const lodRecipe = createTreeLodRecipe(recipe, level);
      const runtimeRecipe = {
        ...lodRecipe,
        options: {
          ...lodRecipe.options,
          foliage: { ...(lodRecipe.options.foliage ?? {}), leafMap: ownedLeafTexture },
        },
      };
      const plant = createPlantFromRecipe(runtimeRecipe);
      let exported;
      try {
        const trunkTriangles = plant.trunkMesh?.geometry
          ? triangleCount(plant.trunkMesh.geometry)
          : 0;
        exported = prepareTreeForExport(plant, {
          // LOD1 keeps the exact authored crossed-card crown. LOD2 retains
          // every card center but converts most pairs to one plane, with a
          // distributed crossed subset for view robustness. Hard caps still
          // invoke nested card thinning on exceptionally dense trees.
          foliageMode: level < 2 ? 'crossed' : 'hybrid',
          foliageCardRetention: LOD_FOLIAGE_RETENTION[level],
          foliageCardScale: LOD_FOLIAGE_SCALE[level],
          // LOD0 remains the exact authored high-detail source. Lower levels
          // distribute their leaf-card budget after the continuous bark mesh
          // has been accounted for, so neither can exceed its contract merely
          // because a species has an unusually complex skeleton.
          foliageTriangleBudget: level === 0
            ? Infinity
            : Math.max(0, TREE_LOD_TRIANGLE_CAPS[level] - trunkTriangles),
        });
      } finally {
        plant.dispose();
      }
      if (level === 2) {
        const combined = combinedSingleMaterialLevel(exported);
        disposeExportGroup(exported);
        exported = combined;
      }
      groundTreeLevel(exported);
      exported.name = `Tree_LOD${level}`;
      levels.push(exported);
    }
    // LOD2 is deliberately merged to one material, so retain LOD1's named
    // trunk/foliage separation while constructing the silhouette envelope.
    const far = createUltraFarProxy(levels[1]);
    far.name = 'Tree_LOD3';
    levels.push(far);
    const report = levels.map((root, level) => ({
      level,
      materials: rootMaterialCount(root),
      minScreenCoverage: TREE_LOD_SCREEN_COVERAGE[level],
      node: root.name,
      triangleCap: TREE_LOD_TRIANGLE_CAPS[level],
      triangles: rootTriangles(root),
    }));
    const valid = report.every((entry) => entry.triangles <= entry.triangleCap)
      && report[0].materials <= 2 && report[1].materials <= 2
      && report[2].materials === 1 && report[3].materials === 1;
    return {
      levels,
      leafTexture: ownedLeafTexture,
      ownsLeafTexture: !leafTexture,
      report: { valid, levels: report },
      manifestBase: {
        schema: COMPILED_TREE_MANIFEST_SCHEMA,
        version: COMPILED_TREE_MANIFEST_VERSION,
        bounds: boundsForLevels(levels),
        lods: report,
        surfaceLooks: cloneJson(recipe.surfaceLooks ?? []),
      },
      dispose() {
        levels.forEach((root) => disposeExportGroup(root));
        if (!leafTexture) ownedLeafTexture.dispose();
      },
    };
  } catch (error) {
    levels.forEach((root) => disposeExportGroup(root));
    if (!leafTexture) ownedLeafTexture.dispose();
    throw error;
  }
}

export function createCompiledTreeScene(compilation) {
  const scene = new THREE.Group();
  scene.name = 'ToonLabCompiledTree';
  compilation.levels.forEach((level) => scene.add(level));
  return scene;
}
