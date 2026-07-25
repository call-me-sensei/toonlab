import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// GLB-export baking for stylized trees/bushes: the runtime canopy is a
// billboard quad soup driven by a ShaderMaterial (wind, toon ramp, backlit),
// none of which glTF can carry. prepareTreeForExport() converts a live plant
// into a plain-material THREE.Group any engine can import:
//
//   - Foliage cards become STATIC quads oriented by each card's baked
//     shading normal ('normal' mode) or crossed quad pairs ('crossed',
//     default — view-robust from every angle at 2× the triangles).
//   - Every vertex keeps aShadeNormal as its normal, so the imported mesh
//     still lights as one soft volume — the core of the stylized look.
//   - The three-tone palette is baked into vertex colors exactly as the leaf
//     fragment shader computes it under the plant's current sun.
//   - Wind does not survive (it lives in the vertex shader): exports are
//     static meshes, like every tree-tool GLB.
//
// The group also carries the plant's recipe in userData.treeRecipe, which
// GLTFExporter serializes into glTF `extras` — a GLB can always be traced
// back to (and regenerated from) its recipe.

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Expand the canopy quad soup (4 verts/card: position = center, aCorner,
// aShadeNormal, aInfo = [worldSize, phase, tint, heightT]) into static quads.
//   matrix — applied to card centers (canopy-local → export space). Card
//            extents deliberately are NOT scaled: aInfo.x is world size, the
//            same convention the billboard shader uses.
export function bakeFoliageGeometry(canopyGeometry, {
  mode = 'crossed',
  palette,
  sunDirection = [0.35, 0.72, 0.42],
  sunColor = [1.0, 0.96, 0.84],
  matrix = null,
} = {}) {
  const positions = canopyGeometry.attributes.position;
  const shadeNormals = canopyGeometry.attributes.aShadeNormal;
  const infos = canopyGeometry.attributes.aInfo;
  const cardCount = positions.count / 4;
  const hybridCrossedCount = mode === 'hybrid' ? Math.round(cardCount * 0.3) : 0;
  const quadCount = mode === 'crossed'
    ? cardCount * 2
    : cardCount + hybridCrossedCount;

  const outPositions = new Float32Array(quadCount * 4 * 3);
  const outNormals = new Float32Array(quadCount * 4 * 3);
  const outUvs = new Float32Array(quadCount * 4 * 2);
  const outColors = new Float32Array(quadCount * 4 * 3);
  const outIndices = new Uint32Array(quadCount * 6);

  const cornerOffsets = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const cornerUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];

  const worldUp = new THREE.Vector3(0, 1, 0);
  const sun = new THREE.Vector3(...sunDirection).normalize();
  const sunTint = new THREE.Color(...sunColor);
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const rolledRight = new THREE.Vector3();
  const rolledUp = new THREE.Vector3();
  const quadRight = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const color = new THREE.Color();

  let quadIndex = 0;
  for (let card = 0; card < cardCount; card += 1) {
    // Spread hybrid crossed cards over the full attachment order instead of
    // concentrating the view-robust pairs on the first few branches.
    const hybridCrossed = mode === 'hybrid'
      && ((card * 17) % Math.max(cardCount, 1)) < hybridCrossedCount;
    const quadsPerCard = mode === 'crossed' || hybridCrossed ? 2 : 1;
    const base = card * 4;
    center.fromBufferAttribute(positions, base);
    if (matrix) center.applyMatrix4(matrix);
    normal.fromBufferAttribute(shadeNormals, base).normalize();
    const size = infos.getX(base);
    const phase = infos.getY(base);
    const tint = infos.getZ(base);
    const heightT = infos.getW(base);

    // Stable tangent frame from the shading normal; the fallback covers
    // straight-up/down normals where the up-cross degenerates.
    right.crossVectors(worldUp, normal);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(normal, right);

    // Keep each card's static roll (aInfo.y drives it in the shader too) so
    // the baked crown keeps its shimmered variety instead of gridded quads.
    const roll = phase * Math.PI * 2;
    const rollCos = Math.cos(roll);
    const rollSin = Math.sin(roll);
    rolledRight.copy(right).multiplyScalar(rollCos).addScaledVector(up, rollSin);
    rolledUp.copy(up).multiplyScalar(rollCos).addScaledVector(right, -rollSin);

    // Vertex color = the leaf fragment shader's palette math under this sun
    // (treeLeaf.frag.glsl): two-band wrap ramp + height-gated crown crest +
    // per-card tint jitter. Sprite luminance multiplies at render via `map`;
    // view-dependent terms (rim, backlit, sky fill) can't bake.
    const wrap = normal.dot(sun) * 0.5 + 0.5;
    const litBand = smoothstep(0.38, 0.56, wrap);
    const crestBand = smoothstep(0.66, 0.78, wrap) *
      smoothstep(0.3, 0.8, heightT * (0.7 + 0.3 * (normal.y * 0.5 + 0.5)));
    color.copy(palette.shadow).lerp(palette.lit, litBand);
    color.lerp(palette.crown, crestBand);
    color.r *= THREE.MathUtils.lerp(1, sunTint.r, litBand * 0.35);
    color.g *= THREE.MathUtils.lerp(1, sunTint.g, litBand * 0.35);
    color.b *= THREE.MathUtils.lerp(1, sunTint.b, litBand * 0.35);
    color.multiplyScalar(0.92 + tint * 0.16);

    for (let quad = 0; quad < quadsPerCard; quad += 1) {
      if (quad === 0) {
        quadRight.copy(rolledRight);
      } else {
        // Second quad: the card plane rotated 90° around its up axis, so the
        // pair reads solid from every heading.
        quadRight.crossVectors(rolledUp, rolledRight);
      }
      for (let corner = 0; corner < 4; corner += 1) {
        const out = (quadIndex * 4 + corner) * 3;
        vertex.copy(center)
          .addScaledVector(quadRight, cornerOffsets[corner][0] * size)
          .addScaledVector(rolledUp, cornerOffsets[corner][1] * size);
        outPositions[out] = vertex.x;
        outPositions[out + 1] = vertex.y;
        outPositions[out + 2] = vertex.z;
        outNormals[out] = normal.x;
        outNormals[out + 1] = normal.y;
        outNormals[out + 2] = normal.z;
        outColors[out] = color.r;
        outColors[out + 1] = color.g;
        outColors[out + 2] = color.b;
        const uvOut = (quadIndex * 4 + corner) * 2;
        outUvs[uvOut] = cornerUvs[corner][0];
        outUvs[uvOut + 1] = cornerUvs[corner][1];
      }
      const vertexBase = quadIndex * 4;
      outIndices.set([
        vertexBase, vertexBase + 1, vertexBase + 2,
        vertexBase, vertexBase + 2, vertexBase + 3,
      ], quadIndex * 6);
      quadIndex += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(outIndices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(outPositions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(outUvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(outColors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// Export copy of the leaf sprite with the fragment shader's luminance remap
// (color *= 0.78 + sprite.r * 0.36) baked into the pixels: a standard
// material multiplies the RAW map, which reads ~25% darker than the shader.
// The 1.14 ceiling clamps — the lost top sliver is invisible in practice.
export function createBakedLeafTexture(sourceTexture) {
  const image = sourceTexture?.image;
  if (!image) return sourceTexture;
  if (sourceTexture.isDataTexture && image.data) {
    const data = new Uint8Array(image.data);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, 0.78 * 255 + data[i] * 0.36);
      data[i + 1] = Math.min(255, 0.78 * 255 + data[i + 1] * 0.36);
      data[i + 2] = Math.min(255, 0.78 * 255 + data[i + 2] * 0.36);
    }
    const texture = new THREE.DataTexture(
      data, image.width, image.height, sourceTexture.format, sourceTexture.type,
    );
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    texture.userData.bakedLeafTexture = true;
    return texture;
  }
  if (typeof document === 'undefined') return sourceTexture;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, 0.78 * 255 + data[i] * 0.36);
    data[i + 1] = Math.min(255, 0.78 * 255 + data[i + 1] * 0.36);
    data[i + 2] = Math.min(255, 0.78 * 255 + data[i + 2] * 0.36);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = sourceTexture.anisotropy ?? 4;
  // Owned by the export group; disposeExportGroup frees it (shared source
  // textures like the bark map are left alone).
  texture.userData.bakedLeafTexture = true;
  return texture;
}

// Standard-material counterpart of the leaf shader: the (remapped) sprite RGB
// carries per-leaf luminance, so map × vertex color approximates the shader's
// palette-times-sprite shading. alphaTest exports as glTF MASK/alphaCutoff.
export function createBakedFoliageMaterial({ leafMap = null, alphaTest = 0.3 } = {}) {
  return new THREE.MeshStandardMaterial({
    name: 'BakedFoliage',
    map: leafMap ? createBakedLeafTexture(leafMap) : null,
    color: 0xffffff,
    vertexColors: true,
    alphaTest,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
}

// Live plant (StylizedTree | StylizedBush | StylizedFlower) → export-ready group with plain
// materials, world scale baked into the vertices (identity transforms), and
// the recipe attached as userData.treeRecipe (→ glTF extras).
export function prepareTreeForExport(plant, { foliageMode = 'crossed' } = {}) {
  const group = new THREE.Group();
  group.name = plant.name || 'StylizedPlant';
  const size = plant.scale.x;

  if (plant.trunkMesh) {
    const trunkGeometry = plant.trunkMesh.geometry.clone()
      .applyMatrix4(new THREE.Matrix4().makeScale(size, size, size));
    const source = plant.trunkMesh.material;
    const trunkMaterial = new THREE.MeshStandardMaterial({
      name: 'BakedBark',
      color: source.color?.clone() ?? new THREE.Color(0xc9ab8a),
      map: source.map ?? null,
      roughness: 1,
      metalness: 0,
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.name = 'Trunk';
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
  }

  const canopyMesh = plant.canopyMesh;
  const uniforms = canopyMesh.material.uniforms;
  // Canopy-local point → plant-root space: scale by (size × canopyScale)
  // around the anchor. Card extents stay world-sized (see bakeFoliageGeometry).
  const canopyMatrix = new THREE.Matrix4().compose(
    canopyMesh.position.clone().multiplyScalar(size),
    new THREE.Quaternion(),
    new THREE.Vector3().setScalar(size * canopyMesh.scale.x),
  );
  const foliageGeometry = bakeFoliageGeometry(canopyMesh.geometry, {
    mode: foliageMode,
    palette: {
      lit: uniforms.uLitColor.value,
      shadow: uniforms.uShadowColor.value,
      crown: uniforms.uCrownColor.value,
    },
    sunDirection: uniforms.uSunDirection.value.toArray(),
    sunColor: uniforms.uSunColor.value.toArray(),
    matrix: canopyMatrix,
  });
  const foliage = new THREE.Mesh(foliageGeometry, createBakedFoliageMaterial({
    leafMap: uniforms.uLeafMap.value,
    alphaTest: uniforms.uAlphaCutoff.value,
  }));
  foliage.name = 'Foliage';
  foliage.castShadow = true;
  group.add(foliage);

  // Flower plants: bake the instanced 3D bloom meshes (vertex-colored
  // petals, canopy-local matrices) into one static mesh so blooms survive
  // the GLB.
  if (plant.headsMesh) {
    const headsMesh = plant.headsMesh;
    const instanceMatrix = new THREE.Matrix4();
    const pieces = [];
    for (let i = 0; i < headsMesh.count; i += 1) {
      headsMesh.getMatrixAt(i, instanceMatrix);
      pieces.push(headsMesh.geometry.clone()
        .applyMatrix4(instanceMatrix)
        .applyMatrix4(canopyMatrix));
    }
    if (pieces.length) {
      const headMaterial = new THREE.MeshStandardMaterial({
        name: 'BakedBlooms',
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      });
      const blooms = new THREE.Mesh(mergeGeometries(pieces), headMaterial);
      pieces.forEach((piece) => piece.dispose());
      blooms.name = 'Blooms';
      blooms.castShadow = true;
      group.add(blooms);
    }
  }

  if (typeof plant.toJSON === 'function') {
    group.userData.treeRecipe = plant.toJSON();
  }
  return group;
}

// Free everything prepareTreeForExport allocated (baked geometry + materials;
// shared textures are left alone).
export function disposeExportGroup(group) {
  group.traverse((node) => {
    if (node.isMesh) {
      node.geometry.dispose();
      if (node.material.map?.userData?.bakedLeafTexture) node.material.map.dispose();
      node.material.dispose();
    }
  });
}
