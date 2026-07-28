// Repository-only reconstruction of the supplied environment reference terrain.
//
// This module intentionally consumes the ToonLab scene export directly. It does
// not route the terrain through ToonLab's procedural terrain painter or through
// the legacy ToonLab landscape masks. Heights, holes, splat weights, layer
// transforms, texture import state, and PBR inputs all come from
// scene-manifest.json and its binary sidecars.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  TBNViewMatrix,
  clamp,
  float,
  normalize,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  assertToonLabTextureUploadReady,
} from '../../../../src/environment/toonLabTextureReadiness.js';
import {
  applyToonLabNormalScaleNode,
  createToonLabNormalIntegrationMetadata,
  decodeToonLabNormalNode,
} from '../../../../src/environment/toonLabNormalIntegration.js';
import {
  applyToonLabRendererCastEligibility,
} from '../../../../src/environment/toonLabShadows.js';
import {
  applyToonLabTerrainNativeAuthority,
  loadToonLabTerrainNativeAuthority,
} from '../../../../src/environment/toonLabTerrainNativeAuthority.js';
import {
  installToonLabSurfaceLighting,
} from '../../../../src/environment/toonLabSurfaceLighting.js';

export const DEFAULT_ENVIRONMENT_REFERENCE_SCENE_URL =
  '/assets-local/reference-environment/environment-scene';

export const ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT = Object.freeze({
  schema: 'toonlab.scene-export',
  schemaVersion: 2,
  heightmapResolution: 513,
  holesResolution: 512,
  alphamapResolution: 2048,
  alphamapLayers: 5,
  coordinateSystem:
    'glTF/Three right-handed Y-up: ToonLab local +Z is reflected to Three local -Z',
  defaultSplatPrecision: 'float32',
  fastSplatPrecision: 'uint8',
  terrainShader: 'ToonLab Terrain/Lit',
});

// TOONLAB Terrain/Lit renders more than four layers as multiple independently lit
// passes. SplatmapFinalColor multiplies each pass' completed BRDF result by
// that pass' unnormalised control weight; TerrainLitAdd then adds the later
// pass with Blend One One. Multiplying only the material inputs before one
// BRDF evaluation is not equivalent, especially for metallic snow.
class EnvironmentReferenceTerrainPassMaterial extends MeshPhysicalNodeMaterial {
  constructor(passWeightNode = null) {
    super();
    this.passWeightNode = passWeightNode;
  }

  setupOutput(builder, outputNode) {
    const sourceWeighted = this.passWeightNode
      ? vec4(outputNode.rgb.mul(this.passWeightNode), 1)
      : outputNode;
    return super.setupOutput(builder, sourceWeighted);
  }
}

const NATIVE_LITTLE_ENDIAN = (() => {
  const word = new Uint32Array([0x01020304]);
  return new Uint8Array(word.buffer)[0] === 0x04;
})();

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number.`);
  }
  return value;
}

function assertInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function joinAssetUrl(baseUrl, relativePath) {
  if (/^(?:data:|blob:|https?:\/\/)/i.test(relativePath)) return relativePath;
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

async function fetchChecked(fetchFn, url) {
  const response = await fetchFn(url);
  if (!response?.ok) {
    throw new Error(`Unable to load environment reference terrain asset ${url} (${response?.status ?? 'no response'}).`);
  }
  return response;
}

/** Decode a little-endian .f32 sidecar without changing any source values. */
export function decodeToonLabFloat32(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new TypeError('ToonLab float sidecar must be supplied as an ArrayBuffer.');
  }
  if (arrayBuffer.byteLength % 4 !== 0) {
    throw new RangeError(`ToonLab float sidecar byte length ${arrayBuffer.byteLength} is not divisible by four.`);
  }
  if (NATIVE_LITTLE_ENDIAN) return new Float32Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const result = new Float32Array(arrayBuffer.byteLength / 4);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = view.getFloat32(index * 4, true);
  }
  return result;
}

/** Decode a little-endian TerrainData detail-density sidecar. */
export function decodeToonLabInt32(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new TypeError('ToonLab integer sidecar must be supplied as an ArrayBuffer.');
  }
  if (arrayBuffer.byteLength % 4 !== 0) {
    throw new RangeError(`ToonLab integer sidecar byte length ${arrayBuffer.byteLength} is not divisible by four.`);
  }
  if (NATIVE_LITTLE_ENDIAN) return new Int32Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const result = new Int32Array(arrayBuffer.byteLength / 4);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = view.getInt32(index * 4, true);
  }
  return result;
}

function validateTerrainRecord(terrain) {
  if (!terrain || typeof terrain !== 'object') {
    throw new TypeError('A terrain record from scene-manifest.json is required.');
  }
  const resolution = assertInteger(terrain.heightmapResolution, 'heightmapResolution');
  const holesResolution = assertInteger(terrain.holesResolution, 'holesResolution');
  if (holesResolution !== resolution - 1) {
    throw new RangeError(
      `ToonLab heightmap ${resolution} requires ${resolution - 1} hole cells; received ${holesResolution}.`,
    );
  }
  if (!Array.isArray(terrain.size) || terrain.size.length < 3) {
    throw new TypeError('ToonLab terrain size must be [x, y, z].');
  }
  terrain.size.forEach((value, index) => assertFinitePositive(value, `terrain.size[${index}]`));
  return terrain;
}

/**
 * Construct the full-resolution reflected-Z ToonLab heightfield.
 *
 * ToonLab's exported holes are sampled per quad: 1 is solid and 0 is a hole,
 * matching TerrainLitInput.hlsl's `clip(hole < epsilon ? -1 : 1)` rule. The
 * vertex grid remains exactly 513x513 even when individual cells are omitted.
 */
export function buildEnvironmentReferenceTerrainGeometry(terrainRecord, heights, holes) {
  const terrain = validateTerrainRecord(terrainRecord);
  const resolution = terrain.heightmapResolution;
  const holesResolution = terrain.holesResolution;
  const vertexCount = resolution * resolution;
  const cellCount = holesResolution * holesResolution;
  if (!(heights instanceof Float32Array) || heights.length !== vertexCount) {
    throw new RangeError(
      `ToonLab terrain heights must contain ${vertexCount} float32 samples; received ${heights?.length ?? 0}.`,
    );
  }
  if (!(holes instanceof Uint8Array) || holes.length !== cellCount) {
    throw new RangeError(
      `ToonLab terrain holes must contain ${cellCount} uint8 samples; received ${holes?.length ?? 0}.`,
    );
  }

  const [sizeX, sizeY, sizeZ] = terrain.size;
  const stepX = sizeX / (resolution - 1);
  const stepZ = sizeZ / (resolution - 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const uvs = new Float32Array(vertexCount * 2);

  for (let sourceZ = 0; sourceZ < resolution; sourceZ += 1) {
    const lowerZ = Math.max(0, sourceZ - 1);
    const upperZ = Math.min(resolution - 1, sourceZ + 1);
    for (let x = 0; x < resolution; x += 1) {
      const lowerX = Math.max(0, x - 1);
      const upperX = Math.min(resolution - 1, x + 1);
      const vertex = sourceZ * resolution + x;
      const positionOffset = vertex * 3;
      const uvOffset = vertex * 2;
      const tangentOffset = vertex * 4;
      const sourceHeight = heights[vertex];

      positions[positionOffset] = x * stepX;
      positions[positionOffset + 1] = sourceHeight * sizeY;
      positions[positionOffset + 2] = -sourceZ * stepZ;
      uvs[uvOffset] = x / (resolution - 1);
      uvs[uvOffset + 1] = sourceZ / (resolution - 1);

      const dx = (heights[sourceZ * resolution + upperX]
        - heights[sourceZ * resolution + lowerX])
        * sizeY / ((upperX - lowerX || 1) * stepX);
      const dz = (heights[upperZ * resolution + x]
        - heights[lowerZ * resolution + x])
        * sizeY / ((upperZ - lowerZ || 1) * stepZ);
      // Source normal is normalize(-dH/dX, 1, -dH/dZ). Reflecting ToonLab +Z
      // produces target normalize(-dH/dX, 1, +dH/dZ).
      const inverseNormalLength = 1 / Math.hypot(dx, 1, dz);
      normals[positionOffset] = -dx * inverseNormalLength;
      normals[positionOffset + 1] = inverseNormalLength;
      normals[positionOffset + 2] = dz * inverseNormalLength;

      // This is ToonLab TerrainLit's X-axis tangent after the coordinate
      // reflection. tangent.w=1 makes Three's bitangent point toward local -Z,
      // which is increasing source terrain V.
      const inverseTangentLength = 1 / Math.hypot(1, dx);
      tangents[tangentOffset] = inverseTangentLength;
      tangents[tangentOffset + 1] = dx * inverseTangentLength;
      tangents[tangentOffset + 2] = 0;
      tangents[tangentOffset + 3] = 1;
    }
  }

  let solidCellCount = 0;
  for (let cell = 0; cell < holes.length; cell += 1) {
    if (holes[cell] !== 0) solidCellCount += 1;
  }
  const indices = new Uint32Array(solidCellCount * 6);
  let indexOffset = 0;
  for (let sourceZ = 0; sourceZ < holesResolution; sourceZ += 1) {
    for (let x = 0; x < holesResolution; x += 1) {
      if (holes[sourceZ * holesResolution + x] === 0) continue;
      const topLeft = sourceZ * resolution + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + resolution;
      const bottomRight = bottomLeft + 1;
      // Z reflection changes handedness, so this winding faces +Y.
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomRight;
      indices[indexOffset++] = bottomLeft;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = `${terrain.terrainDataName ?? terrain.name ?? 'EnvironmentReferenceTerrain'}:513x513`;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.environmentReferenceTerrain = {
    coordinateReflection: 'position.z = -toonLabLocalZ',
    heightScale: sizeY,
    heightmapResolution: resolution,
    holesResolution,
    solidCellCount,
    sourceHeightFile: terrain.heights,
    sourceHolesFile: terrain.holes,
  };
  return geometry;
}

/** Split pixel-major N-layer float weights into one RGBA and one R texture. */
export function splitEnvironmentReferenceSplatWeights(source, width, height, layers) {
  assertInteger(width, 'alphamap width');
  assertInteger(height, 'alphamap height');
  if (layers !== 5) {
    throw new RangeError(`The environment reference terrain requires exactly five splat layers; received ${layers}.`);
  }
  const pixelCount = width * height;
  if (!(source instanceof Float32Array) || source.length !== pixelCount * layers) {
    throw new RangeError(
      `environment reference alphamaps must contain ${pixelCount * layers} float32 values; received ${source?.length ?? 0}.`,
    );
  }
  const firstFour = new Float32Array(pixelCount * 4);
  const fifth = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceOffset = pixel * layers;
    const targetOffset = pixel * 4;
    firstFour[targetOffset] = source[sourceOffset];
    firstFour[targetOffset + 1] = source[sourceOffset + 1];
    firstFour[targetOffset + 2] = source[sourceOffset + 2];
    firstFour[targetOffset + 3] = source[sourceOffset + 3];
    fifth[pixel] = source[sourceOffset + 4];
  }
  return { firstFour, fifth };
}

function configureControlTexture(map, metadata) {
  map.name = metadata.name;
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.flipY = false;
  map.unpackAlignment = 1;
  map.userData.toonLabControlMap = metadata;
  map.needsUpdate = true;
  return map;
}

/** Read one exact exported control texel in ToonLab Terrain layer order. */
export function sampleEnvironmentReferenceTerrainSplat(
  controlTextures,
  width,
  height,
  x,
  sourceZ,
) {
  if (!Array.isArray(controlTextures) || controlTextures.length !== 2) {
    throw new TypeError('Two ToonLab Terrain control textures are required.');
  }
  const resolvedWidth = assertInteger(width, 'alphamap width');
  const resolvedHeight = assertInteger(height, 'alphamap height');
  const texelX = THREE.MathUtils.clamp(Math.round(x), 0, resolvedWidth - 1);
  const texelZ = THREE.MathUtils.clamp(Math.round(sourceZ), 0, resolvedHeight - 1);
  const pixel = texelZ * resolvedWidth + texelX;
  const first = controlTextures[0]?.image?.data;
  const second = controlTextures[1]?.image?.data;
  if (!first || !second || first.length < (pixel + 1) * 4 || second.length <= pixel) {
    throw new Error(`ToonLab Terrain control texel ${texelX},${texelZ} is unavailable.`);
  }
  const firstScale = first instanceof Uint8Array || first instanceof Uint8ClampedArray
    ? 1 / 255
    : 1;
  const secondScale = second instanceof Uint8Array || second instanceof Uint8ClampedArray
    ? 1 / 255
    : 1;
  const offset = pixel * 4;
  return [
    first[offset] * firstScale,
    first[offset + 1] * firstScale,
    first[offset + 2] * firstScale,
    first[offset + 3] * firstScale,
    second[pixel] * secondScale,
  ];
}

async function loadFloatControlTextures(terrain, baseUrl, fetchFn) {
  const response = await fetchChecked(fetchFn, joinAssetUrl(baseUrl, terrain.alphamaps));
  const source = decodeToonLabFloat32(await response.arrayBuffer());
  const { firstFour, fifth } = splitEnvironmentReferenceSplatWeights(
    source,
    terrain.alphamapWidth,
    terrain.alphamapHeight,
    terrain.alphamapLayers,
  );
  const first = configureControlTexture(
    new THREE.DataTexture(
      firstFour,
      terrain.alphamapWidth,
      terrain.alphamapHeight,
      THREE.RGBAFormat,
      THREE.FloatType,
    ),
    {
      name: 'EnvironmentReference:Control0:Float32',
      precision: 'float32',
      source: terrain.alphamaps,
      layers: [0, 1, 2, 3],
    },
  );
  const second = configureControlTexture(
    new THREE.DataTexture(
      fifth,
      terrain.alphamapWidth,
      terrain.alphamapHeight,
      THREE.RedFormat,
      THREE.FloatType,
    ),
    {
      name: 'EnvironmentReference:Control1:Float32',
      precision: 'float32',
      source: terrain.alphamaps,
      layers: [4],
    },
  );
  return [first, second];
}

async function loadUint8ControlTextures(terrain, baseUrl, fetchFn) {
  if (!Array.isArray(terrain.controlMaps) || terrain.controlMaps.length < 2) {
    throw new Error('environment reference uint8 splat mode requires two exported control maps.');
  }
  const expectedLength = terrain.alphamapWidth * terrain.alphamapHeight * 4;
  const rawMaps = await Promise.all(terrain.controlMaps.slice(0, 2).map(async (control) => {
    const response = await fetchChecked(fetchFn, joinAssetUrl(baseUrl, control.raw));
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== expectedLength) {
      throw new RangeError(`${control.raw} contains ${data.length} bytes; expected ${expectedLength}.`);
    }
    return data;
  }));
  const fifth = new Uint8Array(terrain.alphamapWidth * terrain.alphamapHeight);
  for (let pixel = 0; pixel < fifth.length; pixel += 1) fifth[pixel] = rawMaps[1][pixel * 4];
  const first = configureControlTexture(
    new THREE.DataTexture(
      rawMaps[0],
      terrain.alphamapWidth,
      terrain.alphamapHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    ),
    {
      name: 'EnvironmentReference:Control0:Uint8',
      precision: 'uint8',
      source: terrain.controlMaps[0].raw,
      layers: [0, 1, 2, 3],
    },
  );
  const second = configureControlTexture(
    new THREE.DataTexture(
      fifth,
      terrain.alphamapWidth,
      terrain.alphamapHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    ),
    {
      name: 'EnvironmentReference:Control1:Uint8',
      precision: 'uint8',
      source: terrain.controlMaps[1].raw,
      layers: [4],
    },
  );
  return [first, second];
}

function toonLabWrapMode(mode) {
  if (/mirror/i.test(mode ?? '')) return THREE.MirroredRepeatWrapping;
  if (/clamp/i.test(mode ?? '')) return THREE.ClampToEdgeWrapping;
  return THREE.RepeatWrapping;
}

function applyToonLabTextureImport(map, textureRecord) {
  assertToonLabTextureUploadReady(
    map,
    `environment reference terrain texture ${textureRecord.exactSourceCopy ?? textureRecord.name}`,
  );
  const importer = textureRecord.importer ?? {};
  map.name = `EnvironmentReference:${textureRecord.name}`;
  map.colorSpace = importer.sRGBTexture ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = toonLabWrapMode(importer.wrapMode);
  map.wrapT = toonLabWrapMode(importer.wrapMode);
  map.generateMipmaps = importer.mipmapEnabled !== false;
  if (/point/i.test(importer.filterMode ?? '')) {
    map.magFilter = THREE.NearestFilter;
    map.minFilter = map.generateMipmaps
      ? THREE.NearestMipmapNearestFilter
      : THREE.NearestFilter;
  } else if (/trilinear/i.test(importer.filterMode ?? '')) {
    map.magFilter = THREE.LinearFilter;
    map.minFilter = map.generateMipmaps
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearFilter;
  } else {
    // ToonLab FilterMode.Bilinear samples one mip with bilinear filtering.
    map.magFilter = THREE.LinearFilter;
    map.minFilter = map.generateMipmaps
      ? THREE.LinearMipmapNearestFilter
      : THREE.LinearFilter;
  }
  map.anisotropy = Math.max(1, Number(importer.anisoLevel) || 1);
  map.flipY = true;
  map.userData.toonLabTexture = {
    asset: textureRecord.asset,
    exactSourceCopy: textureRecord.exactSourceCopy,
    importedWidth: textureRecord.width,
    importedHeight: textureRecord.height,
    importedFormat: textureRecord.format,
    importer: { ...importer },
    normalDecode: importer.textureType === 'NormalMap'
      ? 'source RG + importer green transform + reconstructed positive Z (UnpackNormalMapRGorAG)'
      : null,
    textureFlipY: true,
  };
  map.needsUpdate = true;
  return map;
}

async function loadTerrainLayers(manifest, terrain, baseUrl, textureLoader) {
  if (!Array.isArray(terrain.layers) || terrain.layers.length !== 5) {
    throw new RangeError(`environment reference terrain must declare five layers; received ${terrain.layers?.length ?? 0}.`);
  }
  const cache = new Map();
  const loadTextureRecord = async (index) => {
    if (!Number.isInteger(index) || index < 0) return null;
    const textureRecord = manifest.textures?.[index];
    if (!textureRecord?.exactSourceCopy) {
      throw new Error(`ToonLab terrain texture index ${index} has no exactSourceCopy.`);
    }
    if (!cache.has(index)) {
      const url = joinAssetUrl(baseUrl, textureRecord.exactSourceCopy);
      cache.set(index, textureLoader.loadAsync(url)
        .then((map) => applyToonLabTextureImport(map, textureRecord))
        .catch((error) => {
          cache.delete(index);
          throw new Error(`Unable to load ToonLab terrain texture ${url}.`, { cause: error });
        }));
    }
    return cache.get(index);
  };
  return Promise.all(terrain.layers.map(async (layer) => {
    if (!layer || !Number.isInteger(layer.index)) {
      throw new TypeError('ToonLab terrain layer record is incomplete.');
    }
    return {
      ...layer,
      diffuseMap: await loadTextureRecord(layer.diffuseTexture),
      normalMap: await loadTextureRecord(layer.normalMapTexture),
      maskMap: await loadTextureRecord(layer.maskMapTexture),
      diffuseTextureRecord: manifest.textures[layer.diffuseTexture],
      normalTextureRecord: layer.normalMapTexture >= 0
        ? manifest.textures[layer.normalMapTexture]
        : null,
    };
  }));
}

function buildEnvironmentReferenceTerrainPassMaterial({
  terrain,
  controlTextures,
  layers,
  splatPrecision = 'float32',
  layerIndices = [0, 1, 2, 3, 4],
  passName = 'combined-compatibility',
  sourceWeightedOutput = false,
} = {}) {
  validateTerrainRecord(terrain);
  if (!Array.isArray(controlTextures) || controlTextures.length !== 2) {
    throw new TypeError('environment reference terrain material requires two control textures.');
  }
  if (!Array.isArray(layers) || layers.length !== 5) {
    throw new TypeError('environment reference terrain material requires five loaded terrain layers.');
  }
  if (!Array.isArray(layerIndices)
    || layerIndices.length === 0
    || layerIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= 5)) {
    throw new RangeError('environment reference terrain pass requires one or more layer indices in [0,4].');
  }
  const sourceUv = uv();
  const controlSize = vec2(terrain.alphamapWidth, terrain.alphamapHeight);
  const controlUv = sourceUv
    .mul(controlSize.sub(1))
    .add(0.5)
    .div(controlSize);
  const firstControl = texture(controlTextures[0]).sample(controlUv);
  const secondControl = texture(controlTextures[1]).sample(controlUv).r;
  const rawWeights = [
    firstControl.r,
    firstControl.g,
    firstControl.b,
    firstControl.a,
    secondControl,
  ];
  let passWeight = float(0);
  for (const index of layerIndices) passWeight = passWeight.add(rawWeights[index]);
  // TerrainLitPasses.hlsl normalizes with `weight + HALF_MIN`, not max(weight,
  // epsilon). Preserve the source half lower bound for both native passes.
  const denominator = passWeight.add(0.00006103515625);
  const weights = rawWeights.map((weight) => weight.div(denominator));

  let colorNode = vec3(0);
  let metallicNode = float(0);
  let smoothnessNode = float(0);
  let tangentNormalNode = vec3(0);
  const [terrainSizeX, , terrainSizeZ] = terrain.size;
  const layerContracts = [];
  for (const index of layerIndices) {
    const layer = layers[index];
    if (!layer.diffuseMap) throw new Error(`ToonLab terrain layer ${layer.name} has no diffuse texture.`);
    const tileSizeX = assertFinitePositive(layer.tileSize?.[0], `${layer.name}.tileSize[0]`);
    const tileSizeY = assertFinitePositive(layer.tileSize?.[1], `${layer.name}.tileSize[1]`);
    const tileOffsetX = Number(layer.tileOffset?.[0]) || 0;
    const tileOffsetY = Number(layer.tileOffset?.[1]) || 0;
    const layerUv = sourceUv
      .mul(vec2(terrainSizeX / tileSizeX, terrainSizeZ / tileSizeY))
      .add(vec2(tileOffsetX / tileSizeX, tileOffsetY / tileSizeY));
    const diffuseSample = texture(layer.diffuseMap).sample(layerUv);
    const diffuseTint = layer.diffuseRemapMax?.slice?.(0, 3) ?? [1, 1, 1];
    const weight = weights[index];
    colorNode = colorNode.add(diffuseSample.rgb.mul(vec3(...diffuseTint)).mul(weight));
    metallicNode = metallicNode.add(float(layer.metallic ?? 0).mul(weight));
    // The supplied diffuse alpha is uniformly one and no mask maps are bound,
    // so Terrain/Lit's resolved smoothness source is the layer constant.
    smoothnessNode = smoothnessNode.add(float(layer.smoothness ?? 0).mul(weight));
    let tangentNormal = vec3(0, 0, 1);
    if (layer.normalMap) {
      const normalSample = texture(layer.normalMap).sample(layerUv).rgb;
      const flipGreenChannel = Boolean(
        layer.normalTextureRecord?.importer?.flipGreenChannel,
      );
      const unpacked = decodeToonLabNormalNode(
        normalSample,
        flipGreenChannel ? -1 : 1,
      );
      tangentNormal = applyToonLabNormalScaleNode(
        unpacked,
        layer.normalScale ?? 1,
      );
    }
    tangentNormalNode = tangentNormalNode.add(tangentNormal.mul(weight));
    layerContracts.push({
      index: layer.index,
      name: layer.name,
      asset: layer.asset,
      diffuseTexture: layer.diffuseTextureRecord?.name ?? null,
      normalTexture: layer.normalTextureRecord?.name ?? null,
      normalFlipGreenChannel:
        layer.normalTextureRecord?.importer?.flipGreenChannel === true,
      tileSize: [...layer.tileSize],
      tileOffset: [...layer.tileOffset],
      metallic: layer.metallic,
      smoothness: layer.smoothness,
      normalScale: layer.normalScale,
    });
  }

  const normalTs = normalize(tangentNormalNode.add(vec3(0, 0, 1e-5)));
  const material = new EnvironmentReferenceTerrainPassMaterial(
    sourceWeightedOutput ? passWeight : null,
  );
  material.name = `EnvironmentReference:TOONLAB Terrain Lit:${passName}`;
  material.side = THREE.FrontSide;
  material.shadowSide = THREE.DoubleSide;
  material.colorNode = colorNode;
  material.metalnessNode = clamp(metallicNode, 0, 1);
  material.roughnessNode = clamp(float(1).sub(smoothnessNode), 0, 1);
  material.normalNode = TBNViewMatrix.mul(normalTs).normalize();
  material.userData.environmentReferenceTerrain = {
    sourceShader: 'ToonLab Terrain/Lit',
    sourceMaterial: terrain.materialTemplate,
    pass: passName,
    layerIndices: [...layerIndices],
    outputWeight: sourceWeightedOutput
      ? 'SplatmapFinalColor: completed pass RGB * unnormalised pass weight'
      : 'none (compatibility material only)',
    splatPrecision,
    splatSampling: '(uv * (controlSize - 1) + 0.5) / controlSize',
    splatNormalization: `selected pass weights / (selected pass sum + HALF_MIN): ${layerIndices.join(',')}`,
    heightBlend: false,
    maskMaps: false,
    layers: layerContracts,
  };
  material.userData.toonLabNormalIntegration = {
    ...createToonLabNormalIntegrationMetadata({
      coordinateZSign: -1,
      decode: 'RG + per-layer importer green transform + reconstructed positive Z; TOONLAB UnpackNormalScale',
      family: 'environment-reference-terrain',
      textureFlipY: true,
    }),
    terrainTangent:
      'reflected ToonLab TerrainLit X tangent; tangent.w=1; bitangent follows increasing ToonLab V',
  };
  installToonLabSurfaceLighting(material, { workflow: 'metallic' });
  return material;
}

/**
 * Build the historical single-draw compatibility material. Runtime parity
 * uses buildEnvironmentReferenceTerrainMaterials() below because TOONLAB Terrain/Lit
 * renders this five-layer terrain as an opaque base pass plus one add pass.
 */
export function buildEnvironmentReferenceTerrainMaterial(options = {}) {
  return buildEnvironmentReferenceTerrainPassMaterial(options);
}

/** Build the exact two-pass TOONLAB Terrain/Lit material set for five layers. */
export function buildEnvironmentReferenceTerrainMaterials(options = {}) {
  const base = buildEnvironmentReferenceTerrainPassMaterial({
    ...options,
    layerIndices: [0, 1, 2, 3],
    passName: 'base-0-3',
    sourceWeightedOutput: true,
  });
  const additive = buildEnvironmentReferenceTerrainPassMaterial({
    ...options,
    layerIndices: [4],
    passName: 'add-4',
    sourceWeightedOutput: true,
  });
  additive.transparent = true;
  additive.depthWrite = false;
  additive.depthTest = true;
  additive.depthFunc = THREE.LessEqualDepth;
  additive.blending = THREE.CustomBlending;
  additive.blendEquation = THREE.AddEquation;
  additive.blendSrc = THREE.OneFactor;
  additive.blendDst = THREE.OneFactor;
  additive.blendEquationAlpha = THREE.AddEquation;
  additive.blendSrcAlpha = THREE.OneFactor;
  additive.blendDstAlpha = THREE.OneFactor;
  // TerrainLitAdd clips a pass when its unnormalised weight is <= 0.005.
  additive.opacityNode = additive.passWeightNode;
  additive.alphaTestNode = float(0.005);
  additive.userData.environmentReferenceTerrain.addPass = {
    blend: 'One One',
    clip: 'weight <= 0.005',
    depthTest: 'LessEqual',
    depthWrite: false,
    sourceShader: 'Hidden/ToonLab Terrain/Lit (Add Pass)',
  };
  additive.needsUpdate = true;
  return Object.freeze({
    additive,
    base,
    materials: Object.freeze([base, additive]),
  });
}

/**
 * Apply ToonLab Terrain's renderer transform, which is deliberately not the
 * Transform component's complete TRS. ToonLab Terrain supports translation
 * only: Core RP builds the renderer matrix with
 * `Matrix4x4.Translate(terrain.GetPosition())` and explicitly states that
 * Terrains cannot be rotated or scaled. TreeInstance and native detail
 * positions share that same translation-only frame.
 */
export function applyEnvironmentReferenceTerrainPosition(root, terrain, node) {
  if (!root || !terrain || !node) {
    throw new Error('environment reference terrain root, record, and node are required.');
  }
  // New exports record Terrain.GetPosition() directly. Older source captures
  // remain exact because Transform.position is the value returned by that API.
  const position = terrain.position ?? node.worldPosition ?? node.localPosition;
  if (!Array.isArray(position) || position.length < 3) {
    throw new Error('environment reference terrain has no Terrain.GetPosition() authority.');
  }
  root.position.set(position[0], position[1], -position[2]);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrix();
  root.updateMatrixWorld(true);
  root.userData.toonLabTerrainTransform = {
    authority: 'ToonLabEngine.Terrain.GetPosition(): translation only',
    ignoredTransformRotation: [...(node.worldRotation ?? node.localRotation ?? [0, 0, 0, 1])],
    ignoredTransformScale: [...(node.worldScale ?? node.localScale ?? [1, 1, 1])],
    sourcePosition: [...position],
  };
  return root;
}

/** Return the manifest population sidecars without instantiating any objects. */
export function getEnvironmentReferenceTerrainPopulation(manifest, terrainIndex = 0) {
  const terrain = validateTerrainRecord(manifest?.terrains?.[terrainIndex]);
  return Object.freeze({
    terrainIndex,
    detailResolution: terrain.detailResolution,
    detailResolutionPerPatch: terrain.detailResolutionPerPatch,
    detailPrototypes: terrain.detailPrototypes ?? [],
    treePrototypes: terrain.treePrototypes ?? [],
    treeInstances: terrain.treeInstances ?? [],
    prefabPrototypes: manifest.prefabPrototypes ?? [],
  });
}

function resolvePrefabRoots(prefabLibrary) {
  if (Array.isArray(prefabLibrary)) return prefabLibrary;
  if (Array.isArray(prefabLibrary?.children)) return prefabLibrary.children;
  if (Array.isArray(prefabLibrary?.scenes?.[1]?.children)) {
    return prefabLibrary.scenes[1].children;
  }
  throw new TypeError(
    'prefabLibrary must be GLTFLoader result.scenes[1], that scene, or its ordered children array.',
  );
}

export const ENVIRONMENT_REFERENCE_DETAIL_COVERAGE_MAX = 255;
export const ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE = 6;
export const ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES = Object.freeze({
  nativeExact: 'native-exact',
  deterministicSourceStyle: 'deterministic-source-style',
});

const ENVIRONMENT_REFERENCE_NATIVE_DETAIL_API =
  'ToonLabEngine.TerrainData.ComputeDetailInstanceTransforms';

function detailHash(seed, x, z, instance, channel) {
  let hash = (2166136261 ^ (Number(seed) >>> 0)) >>> 0;
  for (const value of [x, z, instance, channel]) {
    hash ^= Number(value) >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= hash >>> 13;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function detailRandom(seed, x, z, instance, channel) {
  return detailHash(seed, x, z, instance, channel) / 4294967296;
}

function detailNoise(seed, x, z, channel) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const sample = (sampleX, sampleZ) => detailRandom(
    seed,
    sampleX,
    sampleZ,
    0,
    channel,
  );
  const lower = THREE.MathUtils.lerp(sample(x0, z0), sample(x0 + 1, z0), sx);
  const upper = THREE.MathUtils.lerp(sample(x0, z0 + 1), sample(x0 + 1, z0 + 1), sx);
  return THREE.MathUtils.lerp(lower, upper, sz);
}

function validateDetailDensityField(terrain, prototype, densityField) {
  const resolution = assertInteger(terrain.detailResolution, 'detailResolution');
  const expectedLength = resolution * resolution;
  if (!(densityField instanceof Int32Array) || densityField.length !== expectedLength) {
    throw new RangeError(
      `ToonLab detail ${prototype?.index ?? '?'} must contain ${expectedLength} int32 samples; `
      + `received ${densityField?.length ?? 0}.`,
    );
  }
  return resolution;
}

function resolveDetailDensityScale(terrain, prototype, densityScale) {
  const globalScale = densityScale == null
    ? Number(terrain.detailObjectDensity ?? 1)
    : Number(densityScale);
  if (!Number.isFinite(globalScale) || globalScale < 0) {
    throw new RangeError('ToonLab detail density scale must be a finite non-negative number.');
  }
  return prototype.useDensityScaling === false ? 1 : globalScale;
}

function detailCellExpectedCount(terrain, prototype, coverageValue, densityScale) {
  if (!Number.isInteger(coverageValue)
    || coverageValue < 0
    || coverageValue > ENVIRONMENT_REFERENCE_DETAIL_COVERAGE_MAX) {
    throw new RangeError(
      `ToonLab CoverageMode detail value must be in [0,255]; received ${coverageValue}.`,
    );
  }
  const resolution = terrain.detailResolution;
  const cellArea = (terrain.size[0] / resolution) * (terrain.size[2] / resolution);
  const prototypeDensity = Math.max(0, Number(prototype.density) || 0);
  const targetCoverage = Math.max(0, Number(prototype.targetCoverage ?? 1) || 0);
  return (coverageValue / ENVIRONMENT_REFERENCE_DETAIL_COVERAGE_MAX)
    * prototypeDensity
    * targetCoverage
    * cellArea
    * densityScale;
}

function detailCellInstanceCount(terrain, prototype, coverageValue, x, z, densityScale) {
  const expected = detailCellExpectedCount(
    terrain,
    prototype,
    coverageValue,
    densityScale,
  );
  const whole = Math.floor(expected);
  const fraction = expected - whole;
  return whole + (detailRandom(prototype.noiseSeed, x, z, 0, 0) < fraction ? 1 : 0);
}

/**
 * Count one exported CoverageMode field without materializing transforms.
 *
 * ToonLab's source map is uint8 coverage serialized through GetDetailLayer as
 * int32. The native ComputeDetailInstanceTransforms output was not included in
 * schema v1, so this bridge uses the exported density/coverage controls with
 * deterministic stochastic rounding. It is source-style and reproducible;
 * the runtime metadata deliberately does not label the transforms native-exact.
 */
export function countEnvironmentReferenceDetailInstances({
  terrain,
  prototype,
  densityField,
  densityScale = null,
} = {}) {
  validateTerrainRecord(terrain);
  const resolution = validateDetailDensityField(terrain, prototype, densityField);
  const resolvedDensityScale = resolveDetailDensityScale(terrain, prototype, densityScale);
  let coverageValueTotal = 0;
  let expectedInstanceCount = 0;
  let instanceCount = 0;
  let maxCoverageValue = 0;
  let nonzeroCellCount = 0;
  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const coverageValue = densityField[z * resolution + x];
      if (coverageValue < 0 || coverageValue > ENVIRONMENT_REFERENCE_DETAIL_COVERAGE_MAX) {
        throw new RangeError(
          `ToonLab detail ${prototype?.index ?? '?'} cell ${x},${z} has invalid coverage ${coverageValue}.`,
        );
      }
      coverageValueTotal += coverageValue;
      if (coverageValue > 0) nonzeroCellCount += 1;
      if (coverageValue > maxCoverageValue) maxCoverageValue = coverageValue;
      expectedInstanceCount += detailCellExpectedCount(
        terrain,
        prototype,
        coverageValue,
        resolvedDensityScale,
      );
      instanceCount += detailCellInstanceCount(
        terrain,
        prototype,
        coverageValue,
        x,
        z,
        resolvedDensityScale,
      );
    }
  }
  return Object.freeze({
    coverageValueTotal,
    densityScale: resolvedDensityScale,
    expectedInstanceCount,
    instanceCount,
    maxCoverageValue,
    nonzeroCellCount,
  });
}

/** Build deterministic reflected-Z transforms, ordered in ToonLab patch order. */
export function buildEnvironmentReferenceDetailPlacements({
  terrain,
  prototype,
  densityField,
  sampleHeightLocal,
  densityScale = null,
} = {}) {
  validateTerrainRecord(terrain);
  const resolution = validateDetailDensityField(terrain, prototype, densityField);
  if (typeof sampleHeightLocal !== 'function') {
    throw new TypeError('ToonLab detail placement requires sampleHeightLocal(x, reflectedZ).');
  }
  const resolvedDensityScale = resolveDetailDensityScale(terrain, prototype, densityScale);
  const summary = countEnvironmentReferenceDetailInstances({
    terrain,
    prototype,
    densityField,
    densityScale: resolvedDensityScale,
  });
  const resolutionPerPatch = assertInteger(
    terrain.detailResolutionPerPatch,
    'detailResolutionPerPatch',
  );
  const patchCountX = Math.ceil(resolution / resolutionPerPatch);
  const patchCountZ = Math.ceil(resolution / resolutionPerPatch);
  const patches = new Array(patchCountX * patchCountZ);
  const transforms = new Float32Array(
    summary.instanceCount * ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE,
  );
  const cellSizeX = terrain.size[0] / resolution;
  const cellSizeZ = terrain.size[2] / resolution;
  const positionJitter = THREE.MathUtils.clamp(Number(prototype.positionJitter) || 0, 0, 1);
  const noiseSpread = Math.max(0, Number(prototype.noiseSpread) || 0);
  const minWidth = Number(prototype.minWidth) || 1;
  const maxWidth = Number(prototype.maxWidth) || minWidth;
  const minHeight = Number(prototype.minHeight) || 1;
  const maxHeight = Number(prototype.maxHeight) || minHeight;
  let instanceIndex = 0;

  for (let patchZ = 0; patchZ < patchCountZ; patchZ += 1) {
    const minCellZ = patchZ * resolutionPerPatch;
    const maxCellZ = Math.min(resolution, minCellZ + resolutionPerPatch);
    for (let patchX = 0; patchX < patchCountX; patchX += 1) {
      const minCellX = patchX * resolutionPerPatch;
      const maxCellX = Math.min(resolution, minCellX + resolutionPerPatch);
      const patchIndex = patchZ * patchCountX + patchX;
      const start = instanceIndex;
      for (let z = minCellZ; z < maxCellZ; z += 1) {
        for (let x = minCellX; x < maxCellX; x += 1) {
          const coverageValue = densityField[z * resolution + x];
          const count = detailCellInstanceCount(
            terrain,
            prototype,
            coverageValue,
            x,
            z,
            resolvedDensityScale,
          );
          if (count === 0) continue;
          const gridSide = Math.ceil(Math.sqrt(count));
          for (let slot = 0; slot < count; slot += 1) {
            const orderedX = ((slot % gridSide) + 0.5) / gridSide;
            const orderedZ = (Math.floor(slot / gridSide) + 0.5) / gridSide;
            const offsetX = THREE.MathUtils.lerp(
              orderedX,
              detailRandom(prototype.noiseSeed, x, z, slot, 1),
              positionJitter,
            );
            const offsetZ = THREE.MathUtils.lerp(
              orderedZ,
              detailRandom(prototype.noiseSeed, x, z, slot, 2),
              positionJitter,
            );
            const localX = (x + offsetX) * cellSizeX;
            const sourceZ = (z + offsetZ) * cellSizeZ;
            const reflectedZ = -sourceZ;
            const widthNoise = detailNoise(
              prototype.noiseSeed,
              localX * noiseSpread,
              sourceZ * noiseSpread,
              3,
            );
            const heightNoise = detailNoise(
              prototype.noiseSeed,
              localX * noiseSpread,
              sourceZ * noiseSpread,
              4,
            );
            const offset = instanceIndex * ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE;
            transforms[offset] = localX;
            transforms[offset + 1] = sampleHeightLocal(localX, reflectedZ);
            transforms[offset + 2] = reflectedZ;
            transforms[offset + 3] = detailRandom(
              prototype.noiseSeed,
              x,
              z,
              slot,
              5,
            ) * Math.PI * 2;
            transforms[offset + 4] = THREE.MathUtils.lerp(minWidth, maxWidth, widthNoise);
            transforms[offset + 5] = THREE.MathUtils.lerp(minHeight, maxHeight, heightNoise);
            instanceIndex += 1;
          }
        }
      }
      patches[patchIndex] = Object.freeze({
        count: instanceIndex - start,
        index: patchIndex,
        maxCellX,
        maxCellZ,
        minCellX,
        minCellZ,
        patchX,
        patchZ,
        start,
      });
    }
  }
  if (instanceIndex !== summary.instanceCount) {
    throw new Error(
      `ToonLab detail ${prototype.index} count changed between placement passes `
      + `(${summary.instanceCount} -> ${instanceIndex}).`,
    );
  }
  return Object.freeze({
    ...summary,
    coordinateReflection: 'position.z and rotation.y are negated',
    patchCountX,
    patchCountZ,
    patches: Object.freeze(patches),
    placementAuthority:
      'deterministic CoverageMode bridge; native ComputeDetailInstanceTransforms absent from export schema v1',
    prototypeIndex: prototype.index,
    transformStride: ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE,
    transforms,
  });
}

function validateNativeDetailTransformSet(terrain, prototype, transformSet) {
  const record = transformSet?.record ?? prototype?.nativeTransforms;
  const transforms = transformSet?.transforms;
  if (!record || record.api !== ENVIRONMENT_REFERENCE_NATIVE_DETAIL_API) {
    throw new Error(
      `ToonLab detail ${prototype?.index ?? '?'} has no exact `
      + `${ENVIRONMENT_REFERENCE_NATIVE_DETAIL_API} record.`,
    );
  }
  if (!(transforms instanceof Float32Array)) {
    throw new TypeError(
      `ToonLab detail ${prototype.index} native transforms must be a Float32Array.`,
    );
  }
  if (record.strideFloats !== ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE) {
    throw new RangeError(
      `ToonLab detail ${prototype.index} native stride ${record.strideFloats} is unsupported.`,
    );
  }
  if (record.density !== terrain.detailObjectDensity
    || !String(record.densityAuthority).includes('Terrain.detailObjectDensity')) {
    throw new Error(
      `ToonLab detail ${prototype.index} native density authority does not match the Terrain.`,
    );
  }
  const expectedFloats = record.transformCount * record.strideFloats;
  if (transforms.length !== expectedFloats || record.byteLength !== expectedFloats * 4) {
    throw new RangeError(
      `ToonLab detail ${prototype.index} native transform payload shape drifted.`,
    );
  }
  const patchCountPerAxis = terrain.detailPatchCount
    ?? Math.ceil(terrain.detailResolution / terrain.detailResolutionPerPatch);
  if (record.patchCountPerAxis !== patchCountPerAxis
    || record.patchCount !== patchCountPerAxis * patchCountPerAxis
    || record.patches?.length !== record.patchCount) {
    throw new RangeError(
      `ToonLab detail ${prototype.index} native patch inventory drifted.`,
    );
  }
  let expectedOffset = 0;
  for (let index = 0; index < record.patches.length; index += 1) {
    const patch = record.patches[index];
    const expectedX = index % patchCountPerAxis;
    const expectedZ = Math.floor(index / patchCountPerAxis);
    if (patch.index !== index
      || patch.patchX !== expectedX
      || patch.patchZ !== expectedZ
      || patch.transformOffset !== expectedOffset
      || !Number.isInteger(patch.count)
      || patch.count < 0
      || !Array.isArray(patch.boundsCenter)
      || patch.boundsCenter.length !== 3
      || !Array.isArray(patch.boundsSize)
      || patch.boundsSize.length !== 3) {
      throw new Error(
        `ToonLab detail ${prototype.index} native patch ${index} metadata drifted.`,
      );
    }
    expectedOffset += patch.count;
  }
  if (expectedOffset !== record.transformCount) {
    throw new RangeError(
      `ToonLab detail ${prototype.index} native patch counts do not cover its payload.`,
    );
  }
  for (let offset = 0; offset < transforms.length; offset += 1) {
    if (!Number.isFinite(transforms[offset])) {
      throw new RangeError(
        `ToonLab detail ${prototype.index} native transform contains a non-finite field.`,
      );
    }
  }
  return { record, transforms };
}

/**
 * Reflect ToonLab's exact native detail transforms into the terrain-local Three
 * basis. No placement, density, height, jitter, rotation, or scale value is
 * regenerated here; the six source fields come directly from ToonLab.
 */
export function buildEnvironmentReferenceNativeDetailPlacements({
  terrain,
  prototype,
  transformSet,
} = {}) {
  validateTerrainRecord(terrain);
  const native = validateNativeDetailTransformSet(terrain, prototype, transformSet);
  const record = native.record;
  const transforms = new Float32Array(native.transforms.length);
  for (
    let offset = 0;
    offset < native.transforms.length;
    offset += ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE
  ) {
    transforms[offset] = native.transforms[offset];
    transforms[offset + 1] = native.transforms[offset + 1];
    transforms[offset + 2] = -native.transforms[offset + 2];
    transforms[offset + 3] = native.transforms[offset + 3];
    transforms[offset + 4] = native.transforms[offset + 4];
    transforms[offset + 5] = native.transforms[offset + 5];
  }
  const patches = record.patches.map((patch) => Object.freeze({
    boundsCenter: [
      patch.boundsCenter[0],
      patch.boundsCenter[1],
      -patch.boundsCenter[2],
    ],
    boundsSize: [...patch.boundsSize],
    count: patch.count,
    index: patch.index,
    patchX: patch.patchX,
    patchZ: patch.patchZ,
    start: patch.transformOffset,
  }));
  return Object.freeze({
    coordinateReflection: 'position.z and rotation.y are negated',
    expectedInstanceCount: record.transformCount,
    instanceCount: record.transformCount,
    nativeApi: record.api,
    nativeDensity: record.density,
    nativeSha256: record.sha256,
    nativeToonLabVersion: record.toonLabVersion,
    patchCountX: record.patchCountPerAxis,
    patchCountZ: record.patchCountPerAxis,
    patches: Object.freeze(patches),
    placementAuthority: 'native-exact',
    prototypeIndex: prototype.index,
    transformStride: record.strideFloats,
    transforms,
  });
}

/**
 * Instantiate all 17 exported Terrain detail prototypes as source-mesh
 * InstancedMeshes. All deterministic placements remain resident, while the
 * draw count is repacked with ToonLab's exported detail-object distance and
 * per-patch frustum test, mirroring Terrain's native bounded detail renderer.
 */
export function instantiateEnvironmentReferenceTerrainDetails({
  manifest,
  terrainIndex = 0,
  prefabLibrary,
  densityFields = null,
  transformSets = null,
  placementMode = ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES.nativeExact,
  sampleHeightLocal,
  densityScale = null,
  detailDistance = null,
  onDetailMesh = null,
} = {}) {
  const terrain = validateTerrainRecord(manifest?.terrains?.[terrainIndex]);
  const prototypes = terrain.detailPrototypes ?? [];
  if (!Object.values(ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES).includes(placementMode)) {
    throw new RangeError(`Unsupported ToonLab detail placement mode ${placementMode}.`);
  }
  const nativeExact = placementMode
    === ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES.nativeExact;
  if (nativeExact
    && (!Array.isArray(transformSets) || transformSets.length !== prototypes.length)) {
    throw new RangeError(
      `environment reference parity mode requires ${prototypes.length} native transform sets; `
      + `received ${transformSets?.length ?? 0}. No generated-placement fallback is allowed.`,
    );
  }
  if (!nativeExact
    && (!Array.isArray(densityFields) || densityFields.length !== prototypes.length)) {
    throw new RangeError(
      `environment reference deterministic detail mode requires ${prototypes.length} density fields; `
      + `received ${densityFields?.length ?? 0}.`,
    );
  }
  const prefabRoots = resolvePrefabRoots(prefabLibrary);
  const prefabRecords = manifest.prefabPrototypes ?? [];
  const resolvedDetailDistance = detailDistance == null
    ? Number(terrain.detailObjectDistance)
    : Number(detailDistance);
  if (!Number.isFinite(resolvedDetailDistance) || resolvedDetailDistance < 0) {
    throw new RangeError('ToonLab detail-object distance must be a finite non-negative number.');
  }

  const group = new THREE.Group();
  group.name = `${terrain.name ?? 'Terrain'}:DetailInstances`;
  const prototypeEntries = [];
  const meshes = [];
  let instanceCount = 0;
  let expectedInstanceCount = 0;
  let meshCount = 0;
  let missingPrototypeCount = 0;
  let sourceCoverageValueTotal = 0;

  for (let prototypeIndex = 0; prototypeIndex < prototypes.length; prototypeIndex += 1) {
    const prototype = prototypes[prototypeIndex];
    const prefabIndex = prototype.gltfPrefab;
    const sourceRoot = Number.isInteger(prefabIndex) ? prefabRoots[prefabIndex] : null;
    if (!sourceRoot) {
      missingPrototypeCount += 1;
      continue;
    }
    const prefabRecord = prefabRecords[prefabIndex];
    const placements = nativeExact
      ? buildEnvironmentReferenceNativeDetailPlacements({
        prototype,
        terrain,
        transformSet: transformSets[prototypeIndex],
      })
      : buildEnvironmentReferenceDetailPlacements({
        densityField: densityFields[prototypeIndex],
        densityScale,
        prototype,
        sampleHeightLocal,
        terrain,
      });
    const prototypeGroup = new THREE.Group();
    prototypeGroup.name = `Detail:${prototypeIndex}:${prototype.prototype?.name ?? prefabIndex}`;
    const sourceMeshes = [];
    sourceRoot.updateWorldMatrix(true, true);
    const sourceRootInverse = sourceRoot.matrixWorld.clone().invert();
    sourceRoot.traverse((sourceMesh) => {
      if (!sourceMesh.isMesh || !sourceMesh.geometry || !sourceMesh.material) return;
      sourceMesh.updateWorldMatrix(true, false);
      const prefabNodeIndex = Number(sourceMesh.userData?.toonLabPrefabNode);
      const sourceNode = Number.isInteger(prefabNodeIndex)
        ? prefabRecord?.nodes?.[prefabNodeIndex]
        : null;
      const capacity = Math.max(placements.instanceCount, 1);
      const geometry = sourceMesh.geometry.clone();
      const objectPositions = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('iToonLabObjectPosition', objectPositions);
      const mesh = new THREE.InstancedMesh(geometry, sourceMesh.material, capacity);
      mesh.name = `${prototypeGroup.name}:${sourceMesh.name || 'Mesh'}`;
      mesh.count = 0;
      applyToonLabRendererCastEligibility(mesh, sourceNode?.renderer, manifest);
      mesh.frustumCulled = false;
      mesh.renderOrder = sourceMesh.renderOrder;
      mesh.layers.mask = sourceMesh.layers.mask;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.toonLabTerrainDetail = {
        coordinateReflection: 'position.z and rotation.y are negated',
        gltfPrefab: prefabIndex,
        materialIndices: [...(sourceNode?.renderer?.materialIndices ?? [])],
        placementAuthority: placements.placementAuthority,
        prototype: prototype.prototype,
        prototypeIndex,
        sourceMesh: sourceMesh.name,
      };
      const entry = {
        geometry,
        mesh,
        objectPositions,
        relativeMatrix: sourceRootInverse.clone().multiply(sourceMesh.matrixWorld),
        sourceMesh,
      };
      if (typeof onDetailMesh === 'function') {
        onDetailMesh({
          entry,
          mesh,
          placements,
          prefabRecord,
          prototype,
          prototypeIndex,
          sourceMesh,
        });
      }
      prototypeGroup.add(mesh);
      sourceMeshes.push(entry);
      meshes.push(mesh);
      meshCount += 1;
    });
    if (sourceMeshes.length === 0) {
      prototypeGroup.removeFromParent();
      missingPrototypeCount += 1;
      continue;
    }
    prototypeGroup.userData.toonLabTerrainDetail = {
      expectedInstanceCount: placements.expectedInstanceCount,
      instanceCount: placements.instanceCount,
      nativeSha256: placements.nativeSha256 ?? null,
      placementAuthority: placements.placementAuthority,
      prototypeIndex,
      sourceCoverageValueTotal: placements.coverageValueTotal ?? null,
      sourceMeshCount: sourceMeshes.length,
    };
    group.add(prototypeGroup);
    prototypeEntries.push({
      activeInstanceCount: 0,
      placements,
      prefabRecord,
      prototype,
      prototypeGroup,
      prototypeIndex,
      sourceMeshes,
    });
    instanceCount += placements.instanceCount;
    expectedInstanceCount += placements.expectedInstanceCount;
    sourceCoverageValueTotal += placements.coverageValueTotal ?? 0;
  }

  const detailResolution = terrain.detailResolution;
  const resolutionPerPatch = terrain.detailResolutionPerPatch;
  const patchCountX = Math.ceil(detailResolution / resolutionPerPatch);
  const patchCountZ = Math.ceil(detailResolution / resolutionPerPatch);
  const cellSizeX = terrain.size[0] / detailResolution;
  const cellSizeZ = terrain.size[2] / detailResolution;
  const cameraWorld = new THREE.Vector3();
  const cameraLocal = new THREE.Vector3();
  const cameraProjectionView = new THREE.Matrix4();
  const detailLocalProjectionView = new THREE.Matrix4();
  const detailFrustum = new THREE.Frustum();
  const patchBounds = new THREE.Box3();
  const placementPosition = new THREE.Vector3();
  const placementQuaternion = new THREE.Quaternion();
  const placementScale = new THREE.Vector3();
  const placementMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let activeInstanceCount = 0;
  let activePatchCount = 0;
  let activePrototypePatchCount = 0;
  let activePatchSignature = null;
  let activeSelectionHash = '00000000';

  const metadata = {
    activeInstanceCount,
    activePatchCount,
    activePrototypePatchCount,
    activeSelectionHash,
    coordinateReflection: 'ToonLab Terrain local +Z -> Three local -Z',
    coverageMode: 'CoverageMode:uint8 stored in int32 sidecars',
    detailDistance: resolvedDetailDistance,
    detailPrototypeCount: prototypes.length,
    expectedInstanceCount,
    instanceCount,
    meshCount,
    missingPrototypeCount,
    patchCount: patchCountX * patchCountZ,
    patchDistanceAuthority: nativeExact
      ? 'ToonLab-returned per-prototype patch Bounds; exact 3D distance and full frustum test'
      : 'detail grid patch bounds; horizontal distance to camera',
    placementAuthority: nativeExact
      ? `${ENVIRONMENT_REFERENCE_NATIVE_DETAIL_API}:native-exact`
      : 'deterministic source-style bridge:explicit-non-parity-mode',
    sourceCoverageValueTotal,
    sourceDensityFieldCount: densityFields?.length ?? 0,
    sourceNativeTransformSetCount: transformSets?.length ?? 0,
    sourcePrototypeMeshMaterials: true,
  };
  group.userData.toonLabTerrainDetails = metadata;

  const update = (camera, { force = false } = {}) => {
    if (!camera) {
      return {
        activeInstanceCount,
        activePatchCount,
        activePrototypePatchCount,
        activeSelectionHash,
        changed: false,
        detailDistance: resolvedDetailDistance,
      };
    }
    camera.getWorldPosition(cameraWorld);
    group.worldToLocal(cameraLocal.copy(cameraWorld));
    // ToonLab DetailRenderer::Render first compares
    // CalculateSqrDistance(cameraPosition, patchBounds) with
    // detailObjectDistance^2, then calls IntersectAABBFrustumFull on the same
    // native patch Bounds. Build that frustum in this detail group's local
    // coordinate frame so its AABBs remain byte-derived source values.
    cameraProjectionView.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    detailLocalProjectionView.multiplyMatrices(
      cameraProjectionView,
      group.matrixWorld,
    );
    detailFrustum.setFromProjectionMatrix(
      detailLocalProjectionView,
      camera.coordinateSystem,
      camera.reversedDepth,
    );
    const maxDistanceSquared = resolvedDetailDistance * resolvedDetailDistance;
    const deterministicVisiblePatches = [];
    for (let patchZ = 0; patchZ < patchCountZ; patchZ += 1) {
      const minZ = -Math.min(
        detailResolution,
        (patchZ + 1) * resolutionPerPatch,
      ) * cellSizeZ;
      const maxZ = -(patchZ * resolutionPerPatch) * cellSizeZ;
      const nearestZ = THREE.MathUtils.clamp(cameraLocal.z, minZ, maxZ);
      for (let patchX = 0; patchX < patchCountX; patchX += 1) {
        const minX = patchX * resolutionPerPatch * cellSizeX;
        const maxX = Math.min(
          detailResolution,
          (patchX + 1) * resolutionPerPatch,
        ) * cellSizeX;
        const nearestX = THREE.MathUtils.clamp(cameraLocal.x, minX, maxX);
        const dx = cameraLocal.x - nearestX;
        const dz = cameraLocal.z - nearestZ;
        if (dx * dx + dz * dz <= maxDistanceSquared) {
          deterministicVisiblePatches.push(patchZ * patchCountX + patchX);
        }
      }
    }
    const visiblePatchSets = prototypeEntries.map(({ placements }) => {
      if (!nativeExact) return deterministicVisiblePatches;
      const visible = [];
      for (const patch of placements.patches) {
        if (patch.count === 0) continue;
        const halfX = patch.boundsSize[0] * 0.5;
        const halfY = patch.boundsSize[1] * 0.5;
        const halfZ = patch.boundsSize[2] * 0.5;
        const nearestX = THREE.MathUtils.clamp(
          cameraLocal.x,
          patch.boundsCenter[0] - halfX,
          patch.boundsCenter[0] + halfX,
        );
        const nearestY = THREE.MathUtils.clamp(
          cameraLocal.y,
          patch.boundsCenter[1] - halfY,
          patch.boundsCenter[1] + halfY,
        );
        const nearestZ = THREE.MathUtils.clamp(
          cameraLocal.z,
          patch.boundsCenter[2] - halfZ,
          patch.boundsCenter[2] + halfZ,
        );
        const dx = cameraLocal.x - nearestX;
        const dy = cameraLocal.y - nearestY;
        const dz = cameraLocal.z - nearestZ;
        if (dx * dx + dy * dy + dz * dz > maxDistanceSquared) continue;
        patchBounds.min.set(
          patch.boundsCenter[0] - halfX,
          patch.boundsCenter[1] - halfY,
          patch.boundsCenter[2] - halfZ,
        );
        patchBounds.max.set(
          patch.boundsCenter[0] + halfX,
          patch.boundsCenter[1] + halfY,
          patch.boundsCenter[2] + halfZ,
        );
        if (detailFrustum.intersectsBox(patchBounds)) visible.push(patch.index);
      }
      return visible;
    });
    const signature = visiblePatchSets
      .map((patches, index) => `${index}:${patches.join(',')}`)
      .join('|');
    if (!force && signature === activePatchSignature) {
      return {
        activeInstanceCount,
        activePatchCount,
        activePrototypePatchCount,
        activeSelectionHash,
        changed: false,
        detailDistance: resolvedDetailDistance,
      };
    }

    activeInstanceCount = 0;
    const activePatchIndices = new Set();
    activePrototypePatchCount = 0;
    let selectionHash = 2166136261 >>> 0;
    for (let entryIndex = 0; entryIndex < prototypeEntries.length; entryIndex += 1) {
      const prototypeEntry = prototypeEntries[entryIndex];
      const { placements, sourceMeshes } = prototypeEntry;
      const visiblePatches = visiblePatchSets[entryIndex];
      let prototypeActiveCount = 0;
      for (const patchIndex of visiblePatches) {
        activePatchIndices.add(patchIndex);
        const patch = placements.patches[patchIndex];
        activePrototypePatchCount += 1;
        selectionHash ^= prototypeEntry.prototypeIndex >>> 0;
        selectionHash = Math.imul(selectionHash, 16777619) >>> 0;
        selectionHash ^= patchIndex >>> 0;
        selectionHash = Math.imul(selectionHash, 16777619) >>> 0;
        selectionHash ^= patch.count >>> 0;
        selectionHash = Math.imul(selectionHash, 16777619) >>> 0;
      }
      for (const sourceMeshEntry of sourceMeshes) {
        let targetIndex = 0;
        for (const patchIndex of visiblePatches) {
          const patch = placements.patches[patchIndex];
          const end = patch.start + patch.count;
          for (let sourceIndex = patch.start; sourceIndex < end; sourceIndex += 1) {
            const offset = sourceIndex * ENVIRONMENT_REFERENCE_DETAIL_TRANSFORM_STRIDE;
            placementPosition.fromArray(placements.transforms, offset);
            placementQuaternion.setFromAxisAngle(yAxis, -placements.transforms[offset + 3]);
            placementScale.set(
              placements.transforms[offset + 4],
              placements.transforms[offset + 5],
              placements.transforms[offset + 4],
            );
            placementMatrix.compose(placementPosition, placementQuaternion, placementScale);
            instanceMatrix.multiplyMatrices(placementMatrix, sourceMeshEntry.relativeMatrix);
            sourceMeshEntry.mesh.setMatrixAt(targetIndex, instanceMatrix);
            sourceMeshEntry.objectPositions.setXYZ(
              targetIndex,
              placementPosition.x,
              placementPosition.y,
              placementPosition.z,
            );
            targetIndex += 1;
          }
        }
        sourceMeshEntry.mesh.count = targetIndex;
        sourceMeshEntry.mesh.instanceMatrix.clearUpdateRanges();
        sourceMeshEntry.mesh.instanceMatrix.addUpdateRange(0, targetIndex * 16);
        sourceMeshEntry.mesh.instanceMatrix.needsUpdate = true;
        sourceMeshEntry.objectPositions.clearUpdateRanges();
        sourceMeshEntry.objectPositions.addUpdateRange(0, targetIndex * 3);
        sourceMeshEntry.objectPositions.needsUpdate = true;
        prototypeActiveCount = targetIndex;
      }
      prototypeEntry.activeInstanceCount = prototypeActiveCount;
      prototypeEntry.prototypeGroup.userData.toonLabTerrainDetail.activeInstanceCount =
        prototypeActiveCount;
      prototypeEntry.prototypeGroup.userData.toonLabTerrainDetail.activePatchCount =
        visiblePatches.length;
      activeInstanceCount += prototypeActiveCount;
    }
    activePatchSignature = signature;
    activePatchCount = activePatchIndices.size;
    activeSelectionHash = selectionHash.toString(16).padStart(8, '0');
    metadata.activeInstanceCount = activeInstanceCount;
    metadata.activePatchCount = activePatchCount;
    metadata.activePrototypePatchCount = activePrototypePatchCount;
    metadata.activeSelectionHash = activeSelectionHash;
    return {
      activeInstanceCount,
      activePatchCount,
      activePrototypePatchCount,
      activeSelectionHash,
      changed: true,
      detailDistance: resolvedDetailDistance,
    };
  };

  const dispose = () => {
    group.removeFromParent();
    for (const entry of prototypeEntries) {
      for (const sourceMeshEntry of entry.sourceMeshes) sourceMeshEntry.geometry.dispose();
    }
    group.clear();
    meshes.length = 0;
    prototypeEntries.length = 0;
  };

  return {
    detailDistance: resolvedDetailDistance,
    densityFields,
    transformSets,
    placementMode,
    dispose,
    expectedInstanceCount,
    group,
    instanceCount,
    meshCount,
    meshes,
    metadata,
    missingPrototypeCount,
    prototypeEntries,
    update,
  };
}

/**
 * Clone all 1,695 exported Terrain tree instances from GLB scene 1.
 *
 * The returned `update(camera, { lodBias })` applies the exported ToonLab
 * LODGroup screen-transition metadata and the active QualitySettings.lodBias.
 * Terrain details are handled separately by
 * `instantiateEnvironmentReferenceTerrainDetails`.
 */
export function instantiateEnvironmentReferenceTerrainTrees({
  manifest,
  terrainIndex = 0,
  prefabLibrary,
  clonePrototype = (prototype) => prototype.clone(true),
  onTreeInstance = null,
} = {}) {
  const terrain = validateTerrainRecord(manifest?.terrains?.[terrainIndex]);
  const prefabRoots = resolvePrefabRoots(prefabLibrary);
  const prefabRecords = manifest.prefabPrototypes ?? [];
  const treePrototypes = terrain.treePrototypes ?? [];
  const treeInstances = terrain.treeInstances ?? [];
  const [sizeX, sizeY, sizeZ] = terrain.size;
  const group = new THREE.Group();
  group.name = `${terrain.name ?? 'Terrain'}:TreeInstances`;
  const instances = [];
  const lodEntries = [];
  let missingPrototypeCount = 0;
  let missingLodBindingCount = 0;

  for (let instanceIndex = 0; instanceIndex < treeInstances.length; instanceIndex += 1) {
    const sourceInstance = treeInstances[instanceIndex];
    const treePrototype = treePrototypes[sourceInstance.prototypeIndex];
    const prefabIndex = treePrototype?.gltfPrefab;
    const sourceRoot = Number.isInteger(prefabIndex) ? prefabRoots[prefabIndex] : null;
    if (!sourceRoot) {
      missingPrototypeCount += 1;
      continue;
    }
    const prefabRecord = prefabRecords[prefabIndex];
    const wrapper = new THREE.Group();
    wrapper.name = `Tree:${instanceIndex}:${treePrototype.prefab?.name ?? prefabIndex}`;
    wrapper.position.set(
      sourceInstance.position[0] * sizeX,
      sourceInstance.position[1] * sizeY,
      -sourceInstance.position[2] * sizeZ,
    );
    wrapper.rotation.set(0, -sourceInstance.rotation, 0);
    wrapper.scale.set(
      sourceInstance.widthScale,
      sourceInstance.heightScale,
      sourceInstance.widthScale,
    );
    const clone = clonePrototype(sourceRoot, {
      instanceIndex,
      sourceInstance,
      treePrototype,
      prefabRecord,
    });
    wrapper.add(clone);
    wrapper.userData.toonLabTerrainTree = {
      instanceIndex,
      prototypeIndex: sourceInstance.prototypeIndex,
      gltfPrefab: prefabIndex,
      prefab: treePrototype.prefab,
      bendFactor: treePrototype.bendFactor,
      navMeshLod: treePrototype.navMeshLod,
      color: [...sourceInstance.color],
      lightmapColor: [...sourceInstance.lightmapColor],
      widthScale: sourceInstance.widthScale,
      heightScale: sourceInstance.heightScale,
      toonLabRotationRadians: sourceInstance.rotation,
      lodGroups: prefabRecord?.lodGroups ?? [],
    };

    const nodeByPrefabIndex = new Map();
    clone.traverse((object) => {
      const prefabNode = object.userData?.toonLabPrefabNode;
      if (Number.isInteger(prefabNode)) nodeByPrefabIndex.set(prefabNode, object);
      const sourceNode = Number.isInteger(prefabNode) ? prefabRecord?.nodes?.[prefabNode] : null;
      if (object.isMesh && sourceNode?.renderer) {
        object.castShadow = sourceNode.renderer.shadowCastingMode !== 'Off';
        object.receiveShadow = sourceNode.renderer.receiveShadows !== false;
      }
    });
    for (const lodGroup of prefabRecord?.lodGroups ?? []) {
      const levels = lodGroup.lods.map((lod) => ({
        threshold: lod.screenRelativeTransitionHeight,
        objects: lod.rendererNodes
          .map((nodeIndex) => nodeByPrefabIndex.get(nodeIndex))
          .filter(Boolean),
      }));
      if (levels.some((level, levelIndex) => (
        level.objects.length !== lodGroup.lods[levelIndex].rendererNodes.length
      ))) {
        missingLodBindingCount += 1;
      }
      for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
        for (const object of levels[levelIndex].objects) object.visible = levelIndex === 0;
      }
      lodEntries.push({
        wrapper,
        size: lodGroup.size,
        localReferencePoint: [...lodGroup.localReferencePoint],
        levels,
        currentLevel: levels.length ? 0 : -1,
      });
    }
    if (typeof onTreeInstance === 'function') {
      onTreeInstance({
        wrapper,
        clone,
        instanceIndex,
        sourceInstance,
        treePrototype,
        prefabRecord,
      });
    }
    group.add(wrapper);
    instances.push(wrapper);
  }

  const cameraPosition = new THREE.Vector3();
  const referencePosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const localReferencePoint = new THREE.Vector3();
  const update = (camera, { lodBias = 1 } = {}) => {
    if (!camera) return;
    const resolvedLodBias = Number(lodBias);
    if (!(resolvedLodBias > 0)) throw new RangeError('ToonLab LOD bias must be positive.');
    let casterEntries = 0;
    let culledEntries = 0;
    let selectedEntries = 0;
    let selectedRendererObjects = 0;
    camera.getWorldPosition(cameraPosition);
    const perspectiveDenominator = camera.isPerspectiveCamera
      ? (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)) / resolvedLodBias
      : null;
    for (const entry of lodEntries) {
      entry.wrapper.getWorldScale(worldScale);
      localReferencePoint.set(
        entry.localReferencePoint[0],
        entry.localReferencePoint[1],
        -entry.localReferencePoint[2],
      );
      entry.wrapper.localToWorld(referencePosition.copy(localReferencePoint));
      const scaledSize = entry.size * Math.max(
        Math.abs(worldScale.x),
        Math.abs(worldScale.y),
        Math.abs(worldScale.z),
      );
      const relativeHeight = camera.isOrthographicCamera
        ? scaledSize / Math.max(
          ((camera.top - camera.bottom) / camera.zoom) / resolvedLodBias,
          1e-6,
        )
        : scaledSize / Math.max(
          cameraPosition.distanceTo(referencePosition) * perspectiveDenominator,
          1e-6,
        );
      let selectedLevel = -1;
      for (let levelIndex = 0; levelIndex < entry.levels.length; levelIndex += 1) {
        if (relativeHeight >= entry.levels[levelIndex].threshold) {
          selectedLevel = levelIndex;
          break;
        }
      }
      if (selectedLevel !== entry.currentLevel) {
        for (let levelIndex = 0; levelIndex < entry.levels.length; levelIndex += 1) {
          const visible = levelIndex === selectedLevel;
          for (const object of entry.levels[levelIndex].objects) object.visible = visible;
        }
        entry.currentLevel = selectedLevel;
      }
      if (selectedLevel < 0) {
        culledEntries += 1;
        continue;
      }
      selectedEntries += 1;
      const selectedObjects = entry.levels[selectedLevel]?.objects ?? [];
      selectedRendererObjects += selectedObjects.length;
      if (selectedObjects.some((object) => object.castShadow)) casterEntries += 1;
    }
    const report = {
      casterEntries,
      culledEntries,
      lodBias: resolvedLodBias,
      selectedEntries,
      selectedRendererObjects,
    };
    group.userData.toonLabTerrainTrees.lastLodBias = resolvedLodBias;
    group.userData.toonLabTerrainTrees.lastLodReport = report;
    return report;
  };
  const dispose = () => {
    group.removeFromParent();
    group.clear();
    instances.length = 0;
    lodEntries.length = 0;
  };
  group.userData.toonLabTerrainTrees = {
    sourceTreeInstanceCount: treeInstances.length,
    instanceCount: instances.length,
    treePrototypeCount: treePrototypes.length,
    missingPrototypeCount,
    missingLodBindingCount,
    coordinateReflection:
      'position.z, rotation.y, and LODGroup.localReferencePoint.z are negated',
  };
  return {
    group,
    instances,
    lodEntries,
    instanceCount: instances.length,
    missingPrototypeCount,
    missingLodBindingCount,
    update,
    dispose,
  };
}

/** Load all exported int32 CoverageMode fields in manifest prototype order. */
export async function loadEnvironmentReferenceDetailDensityFields(
  terrain,
  {
    baseUrl = DEFAULT_ENVIRONMENT_REFERENCE_SCENE_URL,
    fetchFn = globalThis.fetch?.bind(globalThis),
  } = {},
) {
  validateTerrainRecord(terrain);
  if (typeof fetchFn !== 'function') {
    throw new TypeError('ToonLab detail density loading requires fetch support.');
  }
  return Promise.all((terrain.detailPrototypes ?? []).map(async (prototype) => {
    if (!prototype?.data) {
      throw new Error(`ToonLab detail prototype ${prototype?.index ?? '?'} has no density sidecar.`);
    }
    const response = await fetchChecked(fetchFn, joinAssetUrl(baseUrl, prototype.data));
    const densityField = decodeToonLabInt32(await response.arrayBuffer());
    validateDetailDensityField(terrain, prototype, densityField);
    return densityField;
  }));
}

async function sha256Hex(arrayBuffer) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Native ToonLab detail parity requires Web Crypto SHA-256 support.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

/** Load and hash-check all exact native detail transform streams. */
export async function loadEnvironmentReferenceNativeDetailTransformSets(
  terrain,
  {
    baseUrl = DEFAULT_ENVIRONMENT_REFERENCE_SCENE_URL,
    fetchFn = globalThis.fetch?.bind(globalThis),
  } = {},
) {
  validateTerrainRecord(terrain);
  if (typeof fetchFn !== 'function') {
    throw new TypeError('ToonLab native detail-transform loading requires fetch support.');
  }
  return Promise.all((terrain.detailPrototypes ?? []).map(async (prototype) => {
    const record = prototype?.nativeTransforms;
    if (!record?.data) {
      throw new Error(
        `environment reference parity mode requires native transforms for detail `
        + `${prototype?.index ?? '?'}. No generated-placement fallback is allowed.`,
      );
    }
    const response = await fetchChecked(fetchFn, joinAssetUrl(baseUrl, record.data));
    const buffer = await response.arrayBuffer();
    const actualSha256 = await sha256Hex(buffer);
    if (actualSha256 !== record.sha256) {
      throw new Error(
        `ToonLab detail ${prototype.index} native transform SHA-256 drifted `
        + `(${record.sha256} -> ${actualSha256}).`,
      );
    }
    const transformSet = Object.freeze({
      actualSha256,
      record,
      transforms: decodeToonLabFloat32(buffer),
    });
    validateNativeDetailTransformSet(terrain, prototype, transformSet);
    return transformSet;
  }));
}

/**
 * Load and construct the full ToonLab EnvironmentReferenceScene terrain.
 *
 * @param {object} options
 * @param {string} [options.baseUrl] URL containing scene-manifest.json.
 * @param {object} [options.manifest] Preloaded manifest.
 * @param {object} [options.terrainNativeAuthority] Preloaded native Terrain
 *   position/probe sidecar. Raw pinned manifests are hydrated automatically.
 * @param {number} [options.terrainIndex=0] Manifest terrain index.
 * @param {'float32'|'uint8'} [options.splatPrecision='float32'] Exact float
 *   weights by default; uint8 is the explicit lower-memory control-map path.
 * @param {Function} [options.fetchFn=globalThis.fetch] Fetch implementation.
 * @param {THREE.TextureLoader} [options.textureLoader] Texture loader.
 * @param {object|THREE.Scene|THREE.Object3D[]} [options.prefabLibrary] Optional
 *   GLTF scene-1 prototype library; supplying it instantiates terrain trees
 *   and, by default, all 17 instanced detail fields.
 * @param {boolean} [options.detailPopulation=true] Load/instantiate detail fields.
 * @param {'native-exact'|'deterministic-source-style'}
 *   [options.detailPlacementMode='native-exact'] Native parity never falls back.
 * @param {number} [options.detailDensityScale] Override Terrain detail density.
 * @param {number} [options.detailDistance] Override exported detail draw distance.
 * @param {Function} [options.onDetailMesh] Optional detail material/routing hook.
 * @param {Function} [options.onTreeInstance] Optional material/routing hook.
 * @returns {Promise<object>} root, mesh, geometry, material, layer/control data,
 *   local height sampler, and dispose().
 */
export async function createEnvironmentReferenceTerrain({
  baseUrl = DEFAULT_ENVIRONMENT_REFERENCE_SCENE_URL,
  manifest = null,
  terrainNativeAuthority = null,
  terrainIndex = 0,
  splatPrecision = 'float32',
  fetchFn = globalThis.fetch?.bind(globalThis),
  textureLoader = new THREE.TextureLoader(),
  prefabLibrary = null,
  detailPopulation = true,
  detailPlacementMode = ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES.nativeExact,
  detailDensityScale = null,
  detailDistance = null,
  onDetailMesh = null,
  onTreeInstance = null,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('createEnvironmentReferenceTerrain requires fetch support.');
  }
  if (!Object.values(ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES)
    .includes(detailPlacementMode)) {
    throw new RangeError(`Unsupported ToonLab detail placement mode ${detailPlacementMode}.`);
  }
  const rawManifest = manifest ?? await fetchChecked(
    fetchFn,
    joinAssetUrl(baseUrl, 'scene-manifest.json'),
  ).then((response) => response.json());
  let sourceManifest = rawManifest;
  if (!rawManifest.terrains?.[terrainIndex]?.position
    || !rawManifest.terrains?.[terrainIndex]?.surfaceProbes) {
    const authority = terrainNativeAuthority
      ?? await loadToonLabTerrainNativeAuthority({ baseUrl, fetchFn });
    if (authority) {
      sourceManifest = applyToonLabTerrainNativeAuthority(rawManifest, authority);
    }
  }
  if (sourceManifest.schema !== ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT.schema
    || sourceManifest.schemaVersion !== ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT.schemaVersion) {
    throw new Error(
      `Unsupported ToonLab scene manifest ${sourceManifest.schema ?? '<missing>'}`
      + ` v${sourceManifest.schemaVersion ?? '<missing>'}.`,
    );
  }
  const terrain = validateTerrainRecord(sourceManifest.terrains?.[terrainIndex]);
  if (terrain.heightmapResolution !== ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT.heightmapResolution
    || terrain.alphamapWidth !== ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT.alphamapResolution
    || terrain.alphamapHeight !== ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT.alphamapResolution
    || terrain.alphamapLayers !== ENVIRONMENT_REFERENCE_TERRAIN_CONTRACT.alphamapLayers) {
    throw new Error('The selected terrain is not the exported ToonLab EnvironmentReferenceScene terrain.');
  }
  const resolvedPrecision = splatPrecision === 'rgba8' ? 'uint8' : splatPrecision;
  if (resolvedPrecision !== 'float32' && resolvedPrecision !== 'uint8') {
    throw new RangeError(`splatPrecision must be "float32" or "uint8"; received ${splatPrecision}.`);
  }

  const [
    heightResponse,
    holesResponse,
    controlTextures,
    layers,
    detailDensityFields,
    detailNativeTransformSets,
  ] = await Promise.all([
    fetchChecked(fetchFn, joinAssetUrl(baseUrl, terrain.heights)),
    fetchChecked(fetchFn, joinAssetUrl(baseUrl, terrain.holes)),
    resolvedPrecision === 'float32'
      ? loadFloatControlTextures(terrain, baseUrl, fetchFn)
      : loadUint8ControlTextures(terrain, baseUrl, fetchFn),
    loadTerrainLayers(sourceManifest, terrain, baseUrl, textureLoader),
    prefabLibrary && detailPopulation
      ? loadEnvironmentReferenceDetailDensityFields(terrain, { baseUrl, fetchFn })
      : Promise.resolve(null),
    prefabLibrary
      && detailPopulation
      && detailPlacementMode === ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES.nativeExact
      ? loadEnvironmentReferenceNativeDetailTransformSets(terrain, { baseUrl, fetchFn })
      : Promise.resolve(null),
  ]);
  const [heightBuffer, holesBuffer] = await Promise.all([
    heightResponse.arrayBuffer(),
    holesResponse.arrayBuffer(),
  ]);
  const heights = decodeToonLabFloat32(heightBuffer);
  const holes = new Uint8Array(holesBuffer);
  const geometry = buildEnvironmentReferenceTerrainGeometry(terrain, heights, holes);
  const terrainMaterials = buildEnvironmentReferenceTerrainMaterials({
    terrain,
    controlTextures,
    layers,
    splatPrecision: resolvedPrecision,
  });
  const material = terrainMaterials.base;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${terrain.name ?? 'Terrain'}:Heightfield`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.environmentReferenceTerrain = {
    terrainIndex,
    hierarchyPath: terrain.hierarchyPath,
    sourceTerrainData: terrain.terrainData,
    shadowCastingMode: terrain.shadowCastingMode,
  };
  const additiveMesh = new THREE.Mesh(geometry, terrainMaterials.additive);
  additiveMesh.name = `${terrain.name ?? 'Terrain'}:Heightfield:AddPass4`;
  additiveMesh.castShadow = false;
  additiveMesh.receiveShadow = true;
  additiveMesh.frustumCulled = false;
  additiveMesh.renderOrder = mesh.renderOrder + 1;
  additiveMesh.userData.environmentReferenceTerrain = {
    ...mesh.userData.environmentReferenceTerrain,
    addPass: true,
    layerIndices: [4],
    shadowCaster: false,
  };

  const root = new THREE.Group();
  root.name = terrain.name ?? 'Terrain';
  root.add(mesh, additiveMesh);
  applyEnvironmentReferenceTerrainPosition(
    root,
    terrain,
    sourceManifest.nodes?.[terrain.node],
  );
  root.userData.environmentReferenceTerrain = {
    sourceScene: sourceManifest.sourceScene,
    terrainIndex,
    nodeIndex: terrain.node,
    coordinateReflection: 'ToonLab +Z -> Three -Z',
  };

  const resolution = terrain.heightmapResolution;
  const [sizeX, sizeY, sizeZ] = terrain.size;
  const sampleHeightLocal = (x, reflectedZ) => {
    const gridX = THREE.MathUtils.clamp(x / sizeX, 0, 1) * (resolution - 1);
    const gridZ = THREE.MathUtils.clamp(-reflectedZ / sizeZ, 0, 1) * (resolution - 1);
    const x0 = Math.floor(gridX);
    const z0 = Math.floor(gridZ);
    const x1 = Math.min(resolution - 1, x0 + 1);
    const z1 = Math.min(resolution - 1, z0 + 1);
    const tx = gridX - x0;
    const tz = gridZ - z0;
    const h00 = heights[z0 * resolution + x0];
    const h10 = heights[z0 * resolution + x1];
    const h01 = heights[z1 * resolution + x0];
    const h11 = heights[z1 * resolution + x1];
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(h00, h10, tx),
      THREE.MathUtils.lerp(h01, h11, tx),
      tz,
    ) * sizeY;
  };

  const population = getEnvironmentReferenceTerrainPopulation(sourceManifest, terrainIndex);
  const details = prefabLibrary && detailDensityFields
    ? instantiateEnvironmentReferenceTerrainDetails({
      densityFields: detailDensityFields,
      densityScale: detailDensityScale,
      detailDistance,
      manifest: sourceManifest,
      onDetailMesh,
      placementMode: detailPlacementMode,
      prefabLibrary,
      sampleHeightLocal,
      terrainIndex,
      transformSets: detailNativeTransformSets,
    })
    : null;
  const trees = prefabLibrary
    ? instantiateEnvironmentReferenceTerrainTrees({
      manifest: sourceManifest,
      terrainIndex,
      prefabLibrary,
      onTreeInstance,
    })
    : null;
  if (details) root.add(details.group);
  if (trees) root.add(trees.group);
  root.userData.environmentReferenceTerrain.population = {
    detailInstanceCount: details?.instanceCount ?? 0,
    detailPlacementMode,
    detailPrototypeCount: population.detailPrototypes.length,
    detailRuntimeStatus: details
      ? (detailPlacementMode === ENVIRONMENT_REFERENCE_DETAIL_PLACEMENT_MODES.nativeExact
        ? 'instantiated-native-exact'
        : 'instantiated-deterministic-source-style')
      : 'not-requested',
    sourceTreeInstanceCount: population.treeInstances.length,
    treeInstanceCount: trees?.instanceCount ?? 0,
  };

  const loadedLayerTextures = new Set();
  for (const layer of layers) {
    if (layer.diffuseMap) loadedLayerTextures.add(layer.diffuseMap);
    if (layer.normalMap) loadedLayerTextures.add(layer.normalMap);
    if (layer.maskMap) loadedLayerTextures.add(layer.maskMap);
  }
  const dispose = () => {
    details?.dispose();
    trees?.dispose();
    geometry.dispose();
    terrainMaterials.materials.forEach((entry) => entry.dispose());
    controlTextures.forEach((map) => map.dispose());
    loadedLayerTextures.forEach((map) => map.dispose());
  };

  return {
    root,
    mesh,
    additiveMesh,
    geometry,
    material,
    materials: terrainMaterials.materials,
    additiveMaterial: terrainMaterials.additive,
    manifest: sourceManifest,
    terrain,
    heights,
    holes,
    controlTextures,
    sampleSplatLocal: (x, sourceZ) => sampleEnvironmentReferenceTerrainSplat(
      controlTextures,
      terrain.alphamapWidth,
      terrain.alphamapHeight,
      x,
      sourceZ,
    ),
    layers,
    splatPrecision: resolvedPrecision,
    population,
    details,
    trees,
    sampleHeightLocal,
    dispose,
  };
}
