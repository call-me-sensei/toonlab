// Shared readers for canonical records in the exported Unity Mega manifest.
// Kept independent of the scene dispatcher so family builders can consume
// records without creating an import cycle.

import * as THREE from 'three';
import { assertSoStylizedUnityTextureUploadReady } from './soStylizedUnityTextureReadiness.js';

export const DEFAULT_SO_STYLIZED_UNITY_SCENE_RECORD_BASE_URL =
  '/assets-local/sostylized-unity/mega-scene';

const texturePromises = new Map();

function joinUrl(baseUrl, relativePath) {
  if (/^(?:data:|blob:|https?:\/\/|\/\/)/i.test(String(relativePath))) {
    return String(relativePath);
  }
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

function wrappingFromUnity(value) {
  if (/clamp/i.test(String(value))) return THREE.ClampToEdgeWrapping;
  if (/mirror/i.test(String(value))) return THREE.MirroredRepeatWrapping;
  return THREE.RepeatWrapping;
}

/** Return a stable name -> exported property lookup for one material record. */
export function indexSoStylizedUnityMaterialProperties(materialRecord) {
  return new Map((materialRecord?.properties ?? []).map((property) => [
    property.name,
    property,
  ]));
}

export function readSoStylizedUnityScalar(properties, name, fallback = 0) {
  const value = Number(properties?.get(name)?.value?.[0]);
  return Number.isFinite(value) ? value : fallback;
}

export function readSoStylizedUnityVector(properties, name, fallback = [0, 0, 0, 0]) {
  const value = properties?.get(name)?.value;
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((channel, index) => (
    Number.isFinite(Number(value[index])) ? Number(value[index]) : channel
  ));
}

/**
 * Convert a serialized Unity non-HDR Color property into linear graph space.
 *
 * UnitySceneExport records Material.GetColor()/the inspector value. Shader
 * Graph ColorMode.Default and ShaderLab `Color` properties are decoded from
 * sRGB before their material-CBUFFER value participates in linear shader
 * math. Numeric TSL constants have no automatic color-space conversion, so
 * the RGB transfer must be made explicit; alpha remains linear/unmodified.
 */
export function linearizeSoStylizedUnityColorProperty(
  value,
  fallback = [0, 0, 0, 0],
) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value)
    ? Array.from(value)
    : [];
  return fallback.map((fallbackChannel, index) => {
    const candidate = Number(source[index]);
    const channel = Number.isFinite(candidate) ? candidate : Number(fallbackChannel) || 0;
    if (index >= 3) return channel;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
}

export function readSoStylizedUnityTextureIndex(properties, name) {
  const value = Number(properties?.get(name)?.texture);
  return Number.isInteger(value) && value >= 0 ? value : -1;
}

/** Load an exact copied Unity texture and reproduce its TextureImporter state. */
export async function loadSoStylizedUnitySceneTexture(
  manifest,
  textureIndex,
  {
    baseUrl = DEFAULT_SO_STYLIZED_UNITY_SCENE_RECORD_BASE_URL,
    textureLoader = null,
  } = {},
) {
  const record = manifest?.textures?.[textureIndex];
  if (!record?.exactSourceCopy) return null;
  const url = joinUrl(baseUrl, record.exactSourceCopy);
  if (!texturePromises.has(url)) {
    texturePromises.set(url, (async () => {
      let resolvedLoader = textureLoader;
      if (!resolvedLoader) {
        if (/\.exr(?:$|[?#])/i.test(url)) {
          const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
          resolvedLoader = new EXRLoader();
        } else {
          resolvedLoader = new THREE.TextureLoader();
        }
      }
      return resolvedLoader.loadAsync(url);
    })().then((result) => {
      assertSoStylizedUnityTextureUploadReady(
        result,
        `Unity scene texture ${url}`,
      );
      const importer = record.importer ?? {};
      const mipmaps = importer.mipmapEnabled !== false;
      const filter = String(importer.filterMode ?? 'Bilinear');
      const isGeneratedCubemap = record.dimension === 'Cube'
        || importer.textureShape === 'TextureCube';
      result.name = `SoStylizedUnity:${record.name}`;
      result.colorSpace = importer.sRGBTexture
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace;
      // UnitySceneExport.cs copies Unity UV.y unchanged. Unlike GLTFLoader's
      // usual texture path, these exact source PNGs are loaded independently
      // through TextureLoader, so its default Y flip is the required bridge.
      result.flipY = true;
      if (isGeneratedCubemap) {
        // Unity imports the supplied 2:1 EXR with Generate Cubemap (method 6).
        // CubeMapNode performs the equivalent renderer-side conversion while
        // retaining the source EXR rather than replacing it with tuned faces.
        result.mapping = THREE.EquirectangularReflectionMapping;
        result.flipY = false;
      }
      result.wrapS = wrappingFromUnity(importer.wrapModeU ?? importer.wrapMode);
      result.wrapT = wrappingFromUnity(importer.wrapModeV ?? importer.wrapMode);
      result.magFilter = /point/i.test(filter)
        ? THREE.NearestFilter
        : THREE.LinearFilter;
      result.minFilter = /point/i.test(filter)
        ? (mipmaps ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter)
        : /trilinear/i.test(filter)
          ? (mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter)
          : (mipmaps ? THREE.LinearMipmapNearestFilter : THREE.LinearFilter);
      result.generateMipmaps = mipmaps;
      result.anisotropy = Math.max(1, Number(importer.anisoLevel) || 1);
      result.userData.soStylizedUnityTexture = {
        exactSourceCopy: record.exactSourceCopy,
        flipGreenChannel: importer.flipGreenChannel === true,
        guid: record.asset?.guid ?? null,
        importer,
        generatedCubemapBridge: isGeneratedCubemap
          ? 'source equirectangular EXR -> CubeMapNode/CubeRenderTarget'
          : null,
        normalIntegration: {
          coordinateZSign: -1,
          textureFlipY: !isGeneratedCubemap,
          uvExport: 'Unity UV copied unchanged by UnitySceneExport.cs',
        },
        textureIndex,
      };
      result.needsUpdate = true;
      return result;
    }).catch((error) => {
      texturePromises.delete(url);
      throw error;
    }));
  }
  return texturePromises.get(url);
}
