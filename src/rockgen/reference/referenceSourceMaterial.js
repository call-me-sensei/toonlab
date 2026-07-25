// Runtime reconstruction of the licensed ToonLab rock material.
// Parameters and textures come from scripts/toonlab/audit-rock-reference-materials.py
// and export-rock-material-source.py. This path intentionally remains
// separate from ToonLab's environment shader: it is the source-look baseline.

import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  TBNViewMatrix,
  abs,
  cameraViewMatrix,
  cameraPosition,
  clamp,
  cross,
  dot,
  float,
  length,
  luminance,
  max,
  mix,
  normalMap as normalMapNode,
  normalViewGeometry,
  normalWorldGeometry,
  normalize,
  positionView,
  positionWorld,
  pow,
  sqrt,
  smoothstep,
  step,
  texture,
  transformNormalByInverseViewMatrix,
  transformNormalByViewMatrix,
  transpose,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { toonLabSourceDitherTemporalAA } from '../../environment/toonLabSourceTemporal.js';
import {
  SURFACE_MATERIAL_MODE,
  copySurfaceMaterialModes,
  registerSurfaceMaterialMode,
} from '../../environment/surfaceMaterialModes.js';

export const DEFAULT_ROCK_REFERENCE_MATERIAL_SOURCE_BASE_URL =
  '/assets-local/rock-references/material-source';

const manifestPromises = new Map();
const materialTemplatePromises = new Map();
const temporalMaterialTemplatePromises = new WeakMap();
const texturePromises = new Map();
const manifestTextureIndexes = new WeakMap();

const MOUNTAIN_TEXTURES = Object.freeze({
  grass: '/Game/ToonLab/Environment/Landscape/Textures/T_Grass1_BC.T_Grass1_BC',
  noise: '/Game/ToonLab/Textures/Noise/T_NoiseStylized.T_NoiseStylized',
  rock: '/Game/ToonLab/Environment/Rocks/Textures/Classic/T_RockClassic_BC.T_RockClassic_BC',
  snow: '/Game/ToonLab/Environment/Landscape/Textures/T_Snow_BC.T_Snow_BC',
});

const ROCK_FUNCTION_TEXTURES = Object.freeze({
  grassVariance: '/Game/ToonLab/Textures/Noise/T_NoiseRough.T_NoiseRough',
  sandNormal: '/Game/ToonLab/Environment/Landscape/Textures/T_DesertSand_N.T_DesertSand_N',
  sandRoughness: '/Game/ToonLab/Textures/Noise/T_ChromaNoise_Bilinear.T_ChromaNoise_Bilinear',
  sandVariance: '/Game/ToonLab/Textures/Noise/T_NoiseRough_HighContrast.T_NoiseRough_HighContrast',
  snowSpecular: '/Game/ToonLab/Textures/Noise/T_ChromaNoise_Blurred.T_ChromaNoise_Blurred',
});

const TOONLAB_SHOWCASE_SOURCE_ASSET = 'Demonstration_ToonLabShowcase';
const TOONLAB_SHOWCASE_COLORMAP =
  '/Game/ToonLab/Environment/Landscape/Textures/T_Grass_ColormapSnow.T_Grass_ColormapSnow';

function toonLabShowcaseRockProfile(profile, sourceAssetName) {
  if (sourceAssetName !== TOONLAB_SHOWCASE_SOURCE_ASSET
    || !profile?.path?.includes('/Environment/Rocks/Materials/Classic/')) {
    return profile;
  }
  const next = structuredClone(profile);
  next.parameters.texture['Color Map'] = TOONLAB_SHOWCASE_COLORMAP;
  next.parameters.scalar['Grass Colormap ScaleX'] = 50000;
  next.parameters.scalar['Grass Colormap ScaleY'] = 50000;
  return next;
}

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

function finite(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function scalar(profile, name, fallback) {
  return finite(profile.parameters?.scalar?.[name], fallback);
}

function vector(profile, name, fallback) {
  const value = profile.parameters?.vector?.[name];
  return Array.isArray(value) && value.length >= 3 ? value : fallback;
}

function switchValue(profile, name, fallback = false) {
  const value = profile.parameters?.static_switch?.[name];
  return typeof value === 'boolean' ? value : fallback;
}

function texturePath(profile, name, fallback = null) {
  return profile.parameters?.texture?.[name] || fallback;
}

function sourceLinearRamp(value, low, high) {
  const lowNode = float(low);
  const highNode = float(high);
  return clamp(
    value.sub(lowNode).div(max(highNode.sub(lowNode), 0.000001)),
    0.0,
    1.0,
  );
}

function sourceCheapContrast(value, contrast) {
  return clamp(
    value.sub(0.5).mul(float(contrast).add(1.0)).add(0.5),
    0.0,
    1.0,
  );
}

function sourcePixelDepth() {
  // ToonLab PixelDepth is positive view-axis depth, not radial camera distance.
  return positionView.z.negate();
}

function sourceIorFromSpecular(specularNode) {
  // ToonLab Default Lit dielectric F0 is 0.08 * Specular. Three's physical shader
  // derives F0 from IOR, so solve IOR=(1+sqrt(F0))/(1-sqrt(F0)) and leave
  // specularIntensity at one. This also supports texture/layer-varying values.
  const rootF0 = sqrt(clamp(float(specularNode).mul(0.08), 0.0, 0.99));
  return float(1.0).add(rootF0).div(max(float(1.0).sub(rootF0), 0.000001));
}

async function loadManifest(baseUrl) {
  if (!manifestPromises.has(baseUrl)) {
    manifestPromises.set(baseUrl, fetch(joinUrl(baseUrl, 'manifest.json'), { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Source material manifest is unavailable (${response.status}).`);
        }
        const manifest = await response.json();
        if (![
          'toonlab.rock-material-source',
          'toonlab.environment-material-source',
        ].includes(manifest?.schema)) {
          throw new Error('Invalid source material manifest.');
        }
        return manifest;
      })
      .catch((error) => {
        manifestPromises.delete(baseUrl);
        throw error;
      }));
  }
  return manifestPromises.get(baseUrl);
}

function migratedSourceAssetIdentity(path) {
  return String(path)
    .replace(/\\/g, '/')
    .replace(/^\/Game\/[^/]+(?=\/)/i, '/Game')
    .toLowerCase();
}

function resolveManifestTexture(manifest, requestedPath) {
  const exact = manifest.textures?.[requestedPath];
  if (exact?.file) return { path: requestedPath, record: exact };

  let index = manifestTextureIndexes.get(manifest);
  if (!index) {
    index = new Map();
    for (const [path, record] of Object.entries(manifest.textures ?? {})) {
      const identity = migratedSourceAssetIdentity(path);
      const matches = index.get(identity) ?? [];
      matches.push({ path, record });
      index.set(identity, matches);
    }
    manifestTextureIndexes.set(manifest, index);
  }

  const matches = index.get(migratedSourceAssetIdentity(requestedPath)) ?? [];
  if (matches.length === 1 && matches[0].record?.file) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Source texture migration is ambiguous for ${requestedPath}: `
      + matches.map((entry) => entry.path).join(', '),
    );
  }
  throw new Error(`Source texture is missing from the manifest: ${requestedPath}`);
}

async function loadSourceTexture(manifest, toonLabPath, baseUrl) {
  if (!toonLabPath) return null;
  const resolved = resolveManifestTexture(manifest, toonLabPath);
  const { record } = resolved;
  const key = `${baseUrl}|${resolved.path}`;
  if (!texturePromises.has(key)) {
    texturePromises.set(key, new THREE.TextureLoader().loadAsync(joinUrl(baseUrl, record.file))
      .then((result) => {
        result.name = toonLabPath.split('.').at(-1) ?? toonLabPath;
        result.colorSpace = record.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        result.flipY = false;
        result.wrapS = /CLAMP/i.test(record.addressX ?? '')
          ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        result.wrapT = /CLAMP/i.test(record.addressY ?? '')
          ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        result.minFilter = THREE.LinearMipmapLinearFilter;
        result.magFilter = THREE.LinearFilter;
        result.anisotropy = 8;
        result.needsUpdate = true;
        return result;
      })
      .catch((error) => {
        texturePromises.delete(key);
        throw error;
      }));
  }
  return texturePromises.get(key);
}

function sourceTriplanar(map, scaleMeters, {
  contrast = 3,
  normalNode = normalWorldGeometry,
  sideOnly = false,
} = {}) {
  const mapNode = texture(map);
  const scale = max(float(scaleMeters), 0.001);
  const projectionPower = Math.max(finite(contrast, 3), 0.0001);
  const weights = pow(abs(normalNode), vec3(projectionPower));
  const weightX = weights.x;
  const weightY = sideOnly ? float(0.0) : weights.y;
  const weightZ = weights.z;
  const weightSum = max(weightX.add(weightY).add(weightZ), 0.0001);
  // ToonLab world X/Y/Z is converted by glTF to Three X/Z/-Y. Rebuild the
  // original ToonLab projection axes before sampling the source textures.
  return mapNode.sample(vec2(positionWorld.z.negate(), positionWorld.y).div(scale)).rgb.mul(weightX)
    .add(mapNode.sample(vec2(positionWorld.x, positionWorld.z.negate()).div(scale)).rgb.mul(weightY))
    .add(mapNode.sample(positionWorld.xy.div(scale)).rgb.mul(weightZ))
    .div(weightSum);
}

function unpackSourceNormal(sampleNode, { invertGreen = true } = {}) {
  // ToonLab normal maps use the DirectX (+Y) convention. The source PNGs are
  // loaded without vertical flipping, so invert the sampled green component
  // before projection-basis reconstruction.
  return vec3(
    sampleNode.r.mul(2.0).sub(1.0),
    invertGreen
      ? float(1.0).sub(sampleNode.g.mul(2.0))
      : sampleNode.g.mul(2.0).sub(1.0),
    sampleNode.b.mul(2.0).sub(1.0),
  );
}

function sourceWorldAlignedNormal(map, scaleMeters, {
  contrast = 3,
  flatTop = false,
  sideOnly = false,
} = {}) {
  const mapNode = texture(map);
  const scale = max(float(scaleMeters), 0.001);
  // Literal ToonLab WorldAlignedNormal high-quality branch reconstruction.
  // WorldAlignedNormals_HighQuality builds an orthonormal frame around the
  // vertex normal for the side pair and another for the Z projection. That
  // frame is the part the low-quality branch omits; without it, the projected
  // crack map tears into horizontal bands at face/projection transitions.
  // Reconstruct in ToonLab coordinates, then convert ToonLab X/Y/Z to Three's glTF
  // X/Z/-Y basis.
  const positionToonLab = vec3(positionWorld.x, positionWorld.z.negate(), positionWorld.y);
  const geometryNormalToonLab = normalize(vec3(
    normalWorldGeometry.x,
    normalWorldGeometry.z.negate(),
    normalWorldGeometry.y,
  ));
  const negativeUv = positionToonLab.div(scale).negate();
  const decodeToonLabNormal = (sampleNode) => vec3(
    sampleNode.r.mul(2.0).sub(1.0),
    sampleNode.g.mul(2.0).sub(1.0),
    sampleNode.b.mul(2.0).sub(1.0),
  );
  const sampleX = decodeToonLabNormal(mapNode.sample(negativeUv.yz).rgb);
  const sampleY = decodeToonLabNormal(mapNode.sample(negativeUv.xz).rgb);
  const sampleZ = decodeToonLabNormal(mapNode.sample(negativeUv.xy).rgb);

  // Node-for-node sign vectors from WorldAlignedNormals_HighQuality.T3D.
  const signX = step(0.0, geometryNormalToonLab.x).mul(2.0).sub(1.0);
  const signY = step(0.0, geometryNormalToonLab.y).mul(2.0).sub(1.0);
  const signZ = step(0.0, geometryNormalToonLab.z).mul(2.0).sub(1.0);
  const projectedX = sampleX.mul(vec3(
    signX,
    -1.0,
    1.0,
  ));
  const projectedY = sampleY.mul(vec3(
    signY.negate(),
    -1.0,
    1.0,
  ));
  const projectedZ = sampleZ.mul(vec3(
    signZ,
    -1.0,
    1.0,
  ));

  // CreateThirdOrthogonalVector(N, axis), followed by Transform3x3Matrix:
  //   V3 = safeNormalize(cross(N, axis))
  //   V2 = safeNormalize(cross(cross(N, axis), N))
  //   transformed = V3*x + V2*y + N*z
  const safeNormalize = (value) => value.div(max(length(value), 0.000001));
  const transformAroundNormal = (value, axis) => {
    const rawThird = cross(geometryNormalToonLab, axis);
    const basisX = safeNormalize(rawThird);
    const basisY = safeNormalize(cross(rawThird, geometryNormalToonLab));
    return basisX.mul(value.x)
      .add(basisY.mul(value.y))
      .add(geometryNormalToonLab.mul(value.z));
  };
  const xAlpha = sourceCheapContrast(abs(geometryNormalToonLab.x), contrast);
  const zAlpha = sourceCheapContrast(abs(geometryNormalToonLab.z), contrast);
  const projectedXY = transformAroundNormal(
    mix(projectedY, projectedX, xAlpha),
    vec3(0, 0, 1),
  );
  const projectedZWorld = transformAroundNormal(
    projectedZ,
    vec3(0, 1, 0),
  );
  const projectedXyz = mix(projectedXY, projectedZWorld, zAlpha);
  const projectedFlatTop = mix(projectedXY, geometryNormalToonLab, zAlpha);
  const selectedToonLab = sideOnly
    ? projectedXY
    : flatTop
      ? projectedFlatTop
      : projectedXyz;
  return vec3(selectedToonLab.x, selectedToonLab.z, selectedToonLab.y.negate());
}

function sourceWorldNormalToTangent(worldNormal) {
  const viewNormal = transformNormalByViewMatrix(worldNormal, cameraViewMatrix);
  return normalize(transpose(TBNViewMatrix).mul(viewNormal));
}

function sourceTangentNormalToView(tangentNormal) {
  return normalize(TBNViewMatrix.mul(tangentNormal));
}

// ToonLab /Engine/Functions/Engine_MaterialFunctions02/Utility/
// BlendAngleCorrectedNormals, transcribed node-for-node from the exported T3D:
//   t = (Base.xy, Base.z + 1)
//   u = (-Additional.xy, Additional.z)
//   normalize(t * dot(t, u) - u * t.z)
function sourceBlendAngleCorrectedNormals(baseNormal, additionalNormal) {
  const t = vec3(baseNormal.xy, baseNormal.z.add(1));
  const u = vec3(additionalNormal.xy.negate(), additionalNormal.z);
  return normalize(t.mul(dot(t, u)).sub(u.mul(t.z)));
}

function sourcePlanar(map, scaleMeters) {
  return texture(map).sample(
    vec2(positionWorld.x, positionWorld.z.negate())
      .div(max(float(scaleMeters), 0.001)),
  ).rgb;
}

function overlayBlend(base, blend) {
  const low = base.mul(blend).mul(2.0);
  const high = vec3(1.0).sub(
    vec3(1.0).sub(base).mul(vec3(1.0).sub(blend)).mul(2.0),
  );
  return mix(low, high, step(vec3(0.5), base));
}

function sourcePlanarCentered(map, scaleXMeters, scaleYMeters, offsetX = 0, offsetY = 0) {
  const scale = vec2(
    Math.max(finite(scaleXMeters, 1), 0.001),
    Math.max(finite(scaleYMeters, 1), 0.001),
  );
  const mapUv = vec2(positionWorld.x, positionWorld.z.negate())
    .div(scale)
    .add(vec2(0.5 + offsetX, 0.5 + offsetY));
  return texture(map).sample(mapUv).rgb;
}

function buildGrassSurface(profile, maps) {
  const globalScale = scalar(profile, 'Global Scale', 1600) / 100;
  const varianceScale = scalar(profile, 'Grass Variance Scale', 8417.2) / 100;
  const varianceStrength = scalar(profile, 'Grass Variance Multiply', 2);
  const variance = maps.grassVariance
    ? clamp(sourcePlanar(maps.grassVariance, varianceScale).r.mul(varianceStrength), 0.0, 1.0)
    : float(0.0);
  const worldAlignedSides = switchValue(profile, 'WorldAlignedSides?', false);
  const sampledColor = worldAlignedSides
    ? sourceTriplanar(maps.grass, globalScale, { contrast: 3 })
    : mix(
      sourcePlanar(maps.grass, globalScale),
      sourcePlanar(maps.grass, globalScale * 1.75),
      variance,
    );
  const grassTint = vec3(...vector(profile, 'Grass Tint', [0.42, 0.6, 0.433]).slice(0, 3));
  let color = sampledColor.mul(grassTint);

  if (maps.grassColormap && switchValue(profile, 'UseColorMap?', false)) {
    const scaleX = scalar(profile, 'Grass Colormap ScaleX', 100000) / 100;
    const scaleY = scalar(profile, 'Grass Colormap ScaleY', 100000) / 100;
    const colormap = sourcePlanarCentered(
      maps.grassColormap,
      scaleX,
      scaleY,
      scalar(profile, 'Grass Colormap OffsetX', 0),
      scalar(profile, 'Grass Colormap OffsetY', 0),
    );
    const grey = luminance(sampledColor);
    const low = colormap.mul(grey.mul(2.0));
    const high = vec3(1.0).sub(vec3(1.0).sub(colormap).mul(grey.oneMinus().mul(2.0)));
    color = mix(low, high, step(0.5, grey));
  }

  const roughness = maps.grassRoughness
    ? (worldAlignedSides
      ? sourceTriplanar(maps.grassRoughness, globalScale, { contrast: 3 }).r
      : mix(
        sourcePlanar(maps.grassRoughness, globalScale).r,
        sourcePlanar(maps.grassRoughness, globalScale * 1.75).r,
        variance,
      ))
    : float(0.9);
  return {
    color,
    emissive: color.mul(scalar(profile, 'Grass Emissive', 0.03)),
    metalness: float(0.0),
    roughness,
    // The static no-wind end of MF_Grass's authored wind/day specular lerp.
    specular: float(0.1),
  };
}

function buildSandSurface(profile, maps, viewDistance) {
  const sandScale = scalar(profile, 'Desert Sand Scale', 1024) / 100;
  const base = sourcePlanar(maps.sandColor, sandScale);
  const grey = vec3(luminance(base));
  const tintA = vec3(...vector(profile, 'Desert Sand Tint', [0.597, 0.292, 0.156]).slice(0, 3));
  const tintB = vec3(...vector(profile, 'Desert Sand Tint 2', [0.597, 0.246, 0.114]).slice(0, 3));
  const varianceScale = scalar(profile, 'Desert Sand Color Variance Scale', 50000) / 100;
  const variance = sourcePlanar(maps.sandVariance, varianceScale).r;
  let color = mix(overlayBlend(grey, tintA), overlayBlend(grey, tintB), variance);
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const facing = clamp(dot(normalWorldGeometry, viewDirection), 0.0, 1.0);
  const fresnel = pow(
    facing.oneMinus(),
    scalar(profile, 'Desert Sand Fresnel Falloff', 4),
  );
  color = mix(
    color,
    color.mul(scalar(profile, 'Desert Sand Fresnel Multiply', 2)),
    fresnel,
  );

  const roughnessNoise = sourcePlanar(maps.sandRoughness, 5).r;
  const roughness = mix(
    scalar(profile, 'Desert Sand Roughness Min', 0.5),
    scalar(profile, 'Desert Sand Roughness Max', 0.7),
    roughnessNoise,
  );
  const normalDistance = scalar(profile, 'Desert Sand Normal Far Distance', 3000) / 100;
  const distanceFade = smoothstep(0.0, Math.max(normalDistance, 0.001), viewDistance);
  const nearDetail = 1 - THREE.MathUtils.clamp(
    scalar(profile, 'Desert Sand Normal Near Flatness', 0), 0, 1,
  );
  const farDetail = 1 - THREE.MathUtils.clamp(
    scalar(profile, 'Desert Sand Normal Far Flatness', 1), 0, 1,
  );
  const detail = mix(nearDetail, farDetail, distanceFade);
  const normalSample = sourceTriplanar(
    maps.sandNormal,
    scalar(profile, 'Desert Sand Normal Texture Scale', 2400) / 100,
  );
  const mappedNormal = normalMapNode(normalSample, vec2(1.0, -1.0));
  return {
    color,
    emissive: color.mul(scalar(profile, 'Desert Sand Emissive', 0.1)),
    metalness: float(0.0),
    normal: normalize(mix(normalViewGeometry, mappedNormal, detail)),
    roughness,
    specular: clamp(float(scalar(profile, 'Desert Sand Specular', 0.2)), 0.0, 1.0),
  };
}

function buildMountainMaterial(profile, maps) {
  const textureScale = scalar(profile, 'Textures Scale', 32000) / 100;
  const noiseScale = scalar(profile, 'Noise Size', 300000) / 100;
  const rock = sourcePlanar(maps.rock, textureScale);
  // M_Mountain multiplies only the grass projection coordinates by two.
  const grassRaw = sourcePlanar(maps.grass, textureScale / 2);
  const grassDesaturation = clamp(
    float(scalar(profile, 'Grass PreTint Desaturation', 0)),
    0.0,
    1.0,
  );
  const grassSample = mix(grassRaw, vec3(luminance(grassRaw)), grassDesaturation);
  const grass = grassSample
    .mul(vec3(...vector(profile, 'Grass Tint', [1, 1, 1]).slice(0, 3)));
  const grassAccent = grassSample
    .mul(vec3(...vector(profile, 'Grass Tint 2', [0.47, 0.4, 0.09]).slice(0, 3)));
  const snow = sourcePlanar(maps.snow, textureScale);
  const noise = sourceCheapContrast(
    sourcePlanar(maps.noise, noiseScale).r,
    scalar(profile, 'Noise Contrast', 0),
  );
  const centeredNoise = noise.sub(0.5);
  const authoredV = uv().y;
  const flatness = normalWorldGeometry.y;
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const facing = clamp(dot(normalWorldGeometry, viewDirection), 0.0, 1.0);

  const grassSlopeMax = scalar(profile, 'Grass Slope Max', 0.19);
  const grassTopFade = scalar(profile, 'Grass Top Fadeout', 0.6);
  const grassNoise = scalar(profile, 'Grass Noise Strength', 0.25);
  const slopeStart = 1 - grassSlopeMax;
  const flatMask = sourceLinearRamp(
    flatness.add(centeredNoise.mul(grassNoise)),
    slopeStart,
    slopeStart + 0.05,
  );
  const grassHeightMask = sourceLinearRamp(
    authoredV.oneMinus(),
    grassTopFade,
    grassTopFade + 0.2,
  ).oneMinus();
  const grassMask = clamp(flatMask.mul(grassHeightMask), 0.0, 1.0);
  let grassColor = mix(grass, grassAccent, centeredNoise);
  const grassFresnel = pow(facing.oneMinus(), 5.0);
  grassColor = mix(grassColor, grassColor.mul(3.0), grassFresnel);

  const snowTop = scalar(profile, 'Snow Top Amount', 0.4);
  const snowNoise = scalar(profile, 'Snow Noise Strength', 0.75);
  const snowMask = sourceLinearRamp(
    authoredV.add(centeredNoise.mul(snowNoise)),
    snowTop,
    snowTop + 0.05,
  ).oneMinus();
  let colorNode = mix(rock, grassColor, grassMask);
  colorNode = mix(colorNode, snow, snowMask);

  const distantFade = sourceLinearRamp(
    sourcePixelDepth(),
    scalar(profile, 'Distant Fade Start', 50000) / 100,
    scalar(profile, 'Distant Fade End', 400000) / 100,
  ).mul(clamp(float(scalar(profile, 'Distant Fade Max', 0.75)), 0.0, 1.0));
  const distantColor = vector(profile, 'Distant Fade Color', [0.017, 0.133, 0.365]);
  const distantBase = vec3(...distantColor.slice(0, 3));
  const distantFresnel = pow(facing.oneMinus(), 2.0);
  const distantShaded = mix(distantBase, distantBase.mul(1.2), distantFresnel);
  colorNode = mix(colorNode, distantShaded, distantFade);

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLabSource_${profile.path.split('.').at(-1)}`;
  material.colorNode = colorNode;
  material.metalnessNode = float(0.0);
  material.roughnessNode = clamp(float(scalar(profile, 'Roughness', 0.7)), 0.0, 1.0);
  material.iorNode = sourceIorFromSpecular(scalar(profile, 'Specular', 0.7));
  material.specularIntensityNode = float(1.0);
  // Preserve ToonLab's literal per-pixel Specular graph separately from Three's
  // IOR remap. Renderer adapters such as ToonLab Default Lit must consume this
  // node directly (F0 = 0.08 * Specular), including top-layer variation.
  material.toonLabSourceSpecularNode = float(scalar(profile, 'Specular', 0.7));
  return material;
}

function buildRockNormals(profile, maps, {
  projectedCrackNormalStrength = 1,
  normalResponseBridge = 0,
  pixelDepth,
  projectionContrast,
  rockScale,
  sideOnly,
  stylizedNormalFlipV = false,
  stylizedNormalGreenConvention = 'directx',
  stylizedNormalResponseBridge = 0,
  stylizedNormalStrength = 1,
  stylizedNormalUvChannel = 0,
}) {
  const useStylizedNormal = maps.stylizedNormal
    && switchValue(profile, 'UseStylizedNormalMap?', true);
  const stylizedUv = uv(stylizedNormalUvChannel === 1 ? 1 : 0);
  const sampledStylizedUv = stylizedNormalFlipV
    ? vec2(stylizedUv.x, float(1).sub(stylizedUv.y))
    : stylizedUv;
  let tangent = useStylizedNormal
    ? unpackSourceNormal(
      texture(maps.stylizedNormal).sample(sampledStylizedUv).rgb,
      { invertGreen: stylizedNormalGreenConvention !== 'opengl' },
    )
    : vec3(0, 0, 1);
  const authoredStylizedStrength = THREE.MathUtils.clamp(
    Number(stylizedNormalStrength) || 0,
    0,
    1,
  );
  if (useStylizedNormal && authoredStylizedStrength < 1) {
    tangent = normalize(mix(
      vec3(0, 0, 1),
      tangent,
      float(authoredStylizedStrength),
    ));
  }
  // ToonLab's Normal sampler and deferred lighting preserve the broad sculpted
  // planes in this atlas with a softer response than the same unit tangent
  // vector receives at the WebGPU renderer boundary. Keep this correction on
  // the authored atlas *before* RNM so the separately restored world-aligned
  // crack layer retains its accepted definition. This is intentionally not
  // the rejected P10 bridge, which flattened the final combined normal and
  // made the whole rock round.
  const stylizedBridge = THREE.MathUtils.clamp(
    Number(stylizedNormalResponseBridge) || 0,
    0,
    1,
  );
  if (useStylizedNormal && stylizedBridge > 0) {
    tangent = normalize(mix(
      tangent,
      vec3(0, 0, 1),
      float(stylizedBridge),
    ));
  }

  let distanceFlatness = float(0);
  if (maps.crackNormal) {
    const crackWorld = sourceWorldAlignedNormal(maps.crackNormal, rockScale, {
      contrast: projectionContrast,
      flatTop: switchValue(profile, 'FlatTopCrackNormals?', false),
      sideOnly,
    });
    const crackTangentProjected = sourceWorldNormalToTangent(crackWorld);
    const authoredCrackStrength = THREE.MathUtils.clamp(
      Number(projectedCrackNormalStrength) || 0,
      0,
      1,
    );
    const closeFlatness = THREE.MathUtils.clamp(
      scalar(profile, 'Rock Normal Flatten', 0), 0, 1,
    );
    const farFlatness = switchValue(profile, 'FlattenDistantCracks?', true)
      ? THREE.MathUtils.clamp(scalar(profile, 'Distant Rock Normal Flatten', 1), 0, 1)
      : closeFlatness;
    const normalFade = clamp(
      pixelDepth.div(Math.max(scalar(profile, 'Rock Normal Distance', 20000) / 100, 0.001)),
      0.0,
      1.0,
    );
    distanceFlatness = mix(closeFlatness, farFlatness, normalFade);
    // ToonLab FlattenNormal is exactly lerp(Normal, float3(0,0,1), Flatness)
    // without an intermediate normalize. Apply it in tangent space before
    // BlendAngleCorrectedNormals, exactly as M_Rock/MF_Rock do.
    const crackTangent = mix(
      vec3(0, 0, 1),
      mix(crackTangentProjected, vec3(0, 0, 1), distanceFlatness),
      float(authoredCrackStrength),
    );
    tangent = useStylizedNormal
      ? sourceBlendAngleCorrectedNormals(tangent, crackTangent)
      : crackTangent;
  }

  // ToonLab's graph flattens the detail normal before RNM. Three's physical-light
  // response gives the surviving baked stylized atlas substantially more
  // contrast than ToonLab's deferred path in the ToonLabShowcase acceptance frame. This
  // optional renderer-boundary bridge attenuates that surviving atlas normal
  // consistently at every distance. The source distance fade has already
  // been evaluated on the crack normal above; multiplying the bridge by that
  // fade made nearby rocks retain Three's excess normal contrast. Zero remains
  // the literal M_Rock graph; the showcase supplies a calibrated value.
  const bridgeStrength = THREE.MathUtils.clamp(Number(normalResponseBridge) || 0, 0, 1);
  if (bridgeStrength > 0) {
    tangent = normalize(mix(
      tangent,
      vec3(0, 0, 1),
      float(bridgeStrength),
    ));
  }

  const view = sourceTangentNormalToView(tangent);

  return {
    view,
    world: transformNormalByInverseViewMatrix(view, cameraViewMatrix),
  };
}

function buildMossSurface(profile, maps, explicitNormalWorld) {
  const mossScale = scalar(
    profile,
    'MossSize',
    scalar(profile, 'Moss Size', 1200),
  ) / 100;
  const moss = sourceTriplanar(maps.moss, mossScale, {
    contrast: 3,
    normalNode: explicitNormalWorld,
  });
  const mossPattern = pow(clamp(moss, 0.0, 1.0), vec3(2.0));
  const color = mix(
    vec3(...vector(profile, 'Moss Color 2', [0.05, 0.21, 0]).slice(0, 3)),
    vec3(...vector(profile, 'Moss Color', [0.22, 0.42, 0.08]).slice(0, 3)),
    mossPattern,
  );
  const slope = clamp(
    explicitNormalWorld.y
      .mul(scalar(profile, 'MossSharpness', 1))
      .sub(scalar(profile, 'MossOffset', 0.3)),
    0.0,
    1.0,
  );
  const alpha = clamp(pow(
    clamp(moss.r, 0.0, 1.0)
      .mul(scalar(profile, 'Moss Multiply', 5))
      .mul(slope),
    2.0,
  ), 0.0, 1.0);
  return {
    alpha,
    color,
    emissive: color.mul(scalar(profile, 'Moss Emissive Strength', 0)),
    metalness: float(0.0),
    roughness: clamp(moss.r.mul(scalar(profile, 'Moss Roughness', 1.3)), 0.0, 1.0),
    specular: float(scalar(profile, 'Moss Specular', 0.5)),
  };
}

function buildSnowSurface(profile, maps) {
  const snowScale = scalar(profile, 'Snow Scale', 5000) / 100;
  const color = sourcePlanar(maps.snow, snowScale);
  const specularNoise = maps.snowSpecular
    ? sourcePlanar(
      maps.snowSpecular,
      scalar(profile, 'Snow Specular Scale', 75) / 100,
    ).r
    : float(0.5);
  return {
    color,
    emissive: color.mul(scalar(profile, 'Snow Emission', 0.05)),
    metalness: float(0.0),
    roughness: float(scalar(profile, 'Snow Rough', 0.5)),
    specular: mix(
      scalar(profile, 'Snow Spec Min', 0.1),
      scalar(profile, 'Snow Spec Max', 0.3),
      specularNoise,
    ),
  };
}

function buildTopLayerMask(profile, maps, explicitNormalWorld) {
  let result = clamp(
    explicitNormalWorld.y
      .mul(scalar(profile, 'Top Layer Sharpness', 12))
      .add(scalar(profile, 'Top Layer Offset', -2)),
    0.0,
    1.0,
  );
  if (maps.topMask && switchValue(profile, 'MaskTopLayer?', true)) {
    result = result.mul(texture(maps.topMask).sample(uv()).r);
  }
  return clamp(result, 0.0, 1.0);
}

function buildRockMaterial(profile, maps, temporalState = null, {
  projectedCrackNormalStrength = 1,
  normalResponseBridge = 0,
  stylizedNormalFlipV = false,
  stylizedNormalGreenConvention = 'directx',
  stylizedNormalResponseBridge = 0,
  stylizedNormalStrength = 1,
  stylizedNormalUvChannel = 0,
} = {}) {
  const rockScale = scalar(profile, 'Rock Scale', 2500) / 100;
  const projectionContrast = scalar(profile, 'Projection Contrast', 0.5);
  const sideOnly = switchValue(profile, 'SideProjectOnly?', false);
  const pixelDepth = sourcePixelDepth();
  const rockNormals = buildRockNormals(profile, maps, {
    projectedCrackNormalStrength,
    normalResponseBridge,
    pixelDepth,
    projectionContrast,
    rockScale,
    sideOnly,
    stylizedNormalFlipV,
    stylizedNormalGreenConvention,
    stylizedNormalResponseBridge,
    stylizedNormalStrength,
    stylizedNormalUvChannel,
  });
  const rockProjection = sourceTriplanar(maps.rock, rockScale, {
    contrast: projectionContrast,
    sideOnly,
  });
  const rockTint = vector(profile, 'Rock Tint', [0.893, 0.922, 0.83]);
  let colorNode = rockProjection.mul(vec3(...rockTint.slice(0, 3)));

  const tintDistance = sourceLinearRamp(
    pixelDepth,
    scalar(profile, 'Close Tint Blend Distance', 500) / 100,
    scalar(profile, 'Far Tint Blend Distance', 15000) / 100,
  );
  const tintFade = tintDistance.mul(clamp(
    float(scalar(profile, 'Distant Tint Blend Lerp Alpha Mix', 0.5)), 0.0, 1.0,
  ));
  const distantTint = vector(profile, 'Distant Tint Blend', [0.594, 0.594, 0.594]);
  colorNode = mix(colorNode, vec3(...distantTint.slice(0, 3)), tintFade);

  if (maps.rockColorMap && switchValue(profile, 'RockColorMap?', false)) {
    const colormapScale = scalar(profile, 'Rock Colormap Size', 100000) / 100;
    colorNode = colorNode.mul(sourcePlanarCentered(
      maps.rockColorMap,
      colormapScale,
      colormapScale,
    ));
  }

  if (maps.stripe && switchValue(profile, 'RockStriping?', false)) {
    const stripeScale = scalar(profile, 'Rock Striping Scale', 2500) / 100;
    const stripe = sourceTriplanar(maps.stripe, stripeScale, {
      contrast: projectionContrast,
      sideOnly,
    }).r;
    const overlay = vec3(...vector(
      profile, 'Rock Striping Overlay Color', [1, 1, 1],
    ).slice(0, 3));
    const stripeMask = sourceCheapContrast(
      stripe,
      scalar(profile, 'Rock Striping Contrast', 0.25),
    );
    colorNode = mix(colorNode, overlayBlend(colorNode, overlay), stripeMask);
  }

  const roughnessSource = maps.roughnessMap && switchValue(profile, 'RoughnessMap?', false)
    ? sourceTriplanar(maps.roughnessMap, rockScale, {
      contrast: projectionContrast,
      sideOnly,
    }).r
    : sourceCheapContrast(rockProjection.r, 0.3);
  let roughnessNode = clamp(
    roughnessSource.mul(scalar(profile, 'Roughness', 1.2)), 0.0, 1.0,
  );
  let metalnessNode = clamp(float(scalar(profile, 'Metallic', 0.1)), 0.0, 1.0);
  let specularNode = clamp(float(scalar(profile, 'Specular', 0.2)), 0.0, 1.0);
  let emissiveNode = vec3(0.0);
  let surfaceNormal = rockNormals.view;

  // M_Rock blends moss into the rock attributes before selecting a mutually
  // exclusive top material. Applying moss last incorrectly paints over snow.
  if (maps.moss && switchValue(profile, 'Moss?', false)) {
    const moss = buildMossSurface(profile, maps, rockNormals.world);
    colorNode = mix(colorNode, moss.color, moss.alpha);
    roughnessNode = mix(roughnessNode, moss.roughness, moss.alpha);
    metalnessNode = mix(metalnessNode, moss.metalness, moss.alpha);
    specularNode = mix(specularNode, moss.specular, moss.alpha);
    emissiveNode = mix(emissiveNode, moss.emissive, moss.alpha);
  }

  const topGrass = Boolean(maps.grass) && switchValue(profile, 'TopGrass?', false);
  const topSnow = Boolean(maps.snow) && switchValue(profile, 'TopSnow?', false);
  const topSand = Boolean(maps.sandColor) && switchValue(profile, 'TopSand?', false);
  let topSurface = null;
  if (topGrass) topSurface = buildGrassSurface(profile, maps);
  else if (topSnow) topSurface = buildSnowSurface(profile, maps);
  else if (topSand) topSurface = buildSandSurface(profile, maps, pixelDepth);

  if (topSurface) {
    const topMask = buildTopLayerMask(profile, maps, rockNormals.world);
    colorNode = mix(colorNode, topSurface.color, topMask);
    roughnessNode = mix(roughnessNode, topSurface.roughness, topMask);
    metalnessNode = mix(metalnessNode, topSurface.metalness, topMask);
    specularNode = mix(specularNode, topSurface.specular, topMask);
    emissiveNode = mix(emissiveNode, topSurface.emissive, topMask);
    const topNormal = topSurface.normal ?? normalViewGeometry;
    surfaceNormal = normalize(mix(surfaceNormal, topNormal, topMask));
  }

  const material = new MeshPhysicalNodeMaterial();
  material.name = `ToonLabSource_${profile.path.split('.').at(-1)}`;
  material.colorNode = colorNode;
  material.roughnessNode = clamp(roughnessNode, 0.0, 1.0);
  material.metalnessNode = clamp(metalnessNode, 0.0, 1.0);
  material.iorNode = sourceIorFromSpecular(specularNode);
  material.specularIntensityNode = float(1.0);
  material.emissiveNode = emissiveNode;
  material.normalNode = surfaceNormal;
  // ToonLab's material Specular input is not Three's IOR control. Preserve the
  // literal graph output for the Default Lit adapter, including any top-layer
  // blend, so the renderer does not silently fall back to Specular=0.5.
  material.toonLabSourceSpecularNode = specularNode;
  if (temporalState) {
    // M_Rock's only opacity is DitherTemporalAA(PerInstanceFadeAmount).
    // Exported source meshes are fully visible here, so the exact input is 1;
    // evaluated cull/LOD fades remain a renderer-system bridge.
    const temporalFade = toonLabSourceDitherTemporalAA(float(1), temporalState);
    material.opacityNode = temporalFade;
    material.alphaTestNode = float(1 / 3);
    material.maskShadowNode = temporalFade.greaterThan(float(1 / 3));
    material.alphaToCoverage = false;
  }
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.neutralLit, {
    colorNode: rockProjection,
    family: 'rock',
    keepsLighting: true,
    keepsTextures: true,
    vertexDeformation: false,
  });
  registerSurfaceMaterialMode(material, SURFACE_MATERIAL_MODE.rawTexture, {
    colorNode: rockProjection,
    family: 'rock',
    keepsLighting: false,
    keepsTextures: true,
    vertexDeformation: false,
  });
  return material;
}

async function buildProfileTemplate(
  profile,
  manifest,
  baseUrl,
  sourceAssetName = null,
  temporalState = null,
  normalResponseBridge = 0,
  projectedCrackNormalStrength = 1,
  stylizedNormalFlipV = false,
  stylizedNormalGreenConvention = 'directx',
  stylizedNormalResponseBridge = 0,
  stylizedNormalStrength = 1,
  stylizedNormalUvChannel = 0,
) {
  profile = toonLabShowcaseRockProfile(profile, sourceAssetName);
  const materialPath = profile?.path;
  if (!profile) throw new Error(`No source rock material profile for ${materialPath ?? sourceAssetName}.`);
  const isMountain = profile.chain.some((path) => path.includes('/M_Mountain.'));
  let material;
  if (isMountain) {
    const [grass, noise, rock, snow] = await Promise.all([
      loadSourceTexture(manifest, MOUNTAIN_TEXTURES.grass, baseUrl),
      loadSourceTexture(manifest, MOUNTAIN_TEXTURES.noise, baseUrl),
      loadSourceTexture(manifest, MOUNTAIN_TEXTURES.rock, baseUrl),
      loadSourceTexture(manifest, MOUNTAIN_TEXTURES.snow, baseUrl),
    ]);
    material = buildMountainMaterial(profile, { grass, noise, rock, snow });
  } else {
    const topGrass = switchValue(profile, 'TopGrass?', false);
    const topSand = switchValue(profile, 'TopSand?', false);
    const topSnow = switchValue(profile, 'TopSnow?', false);
    const moss = switchValue(profile, 'Moss?', false);
    const striping = switchValue(profile, 'RockStriping?', false);
    const rockColorMap = switchValue(profile, 'RockColorMap?', false);
    const roughnessMap = switchValue(profile, 'RoughnessMap?', false);
    const stylizedNormal = switchValue(profile, 'UseStylizedNormalMap?', true);
    const paths = {
      crackNormal: texturePath(profile, 'Rock Normal Texture'),
      grass: topGrass ? texturePath(profile, 'Grass Color Texture') : null,
      grassColormap: topGrass && switchValue(profile, 'UseColorMap?', false)
        ? texturePath(profile, 'Color Map') : null,
      grassRoughness: topGrass ? texturePath(profile, 'Grass Roughness Texture') : null,
      grassVariance: topGrass ? ROCK_FUNCTION_TEXTURES.grassVariance : null,
      moss: moss ? texturePath(profile, 'MossTexture') : null,
      rock: texturePath(profile, 'Rock Texture'),
      rockColorMap: rockColorMap ? texturePath(profile, 'Rock Color Map') : null,
      roughnessMap: roughnessMap ? texturePath(profile, 'Roughness Map') : null,
      sandColor: topSand ? texturePath(profile, 'Desert Sand Texture') : null,
      sandNormal: topSand ? ROCK_FUNCTION_TEXTURES.sandNormal : null,
      sandRoughness: topSand ? ROCK_FUNCTION_TEXTURES.sandRoughness : null,
      sandVariance: topSand ? ROCK_FUNCTION_TEXTURES.sandVariance : null,
      snow: topSnow ? texturePath(profile, 'Snow Texture') : null,
      snowSpecular: topSnow ? ROCK_FUNCTION_TEXTURES.snowSpecular : null,
      stripe: striping ? texturePath(profile, 'Rock Stiriping Texture') : null,
      stylizedNormal: stylizedNormal ? texturePath(profile, 'Stylized Normal Map') : null,
      topMask: (topGrass || topSnow || topSand) && switchValue(profile, 'MaskTopLayer?', true)
        ? texturePath(profile, 'Top Layer Mask') : null,
    };
    const values = await Promise.all(Object.values(paths).map(
      (path) => loadSourceTexture(manifest, path, baseUrl),
    ));
    material = buildRockMaterial(profile, Object.fromEntries(
      Object.keys(paths).map((key, index) => [key, values[index]]),
    ), temporalState, {
      normalResponseBridge,
      projectedCrackNormalStrength,
      stylizedNormalFlipV,
      stylizedNormalGreenConvention,
      stylizedNormalResponseBridge,
      stylizedNormalStrength,
      stylizedNormalUvChannel,
    });
  }
  material.fog = true;
  material.userData.environmentShaderExclude = true;
  material.userData.environmentVertexAoOccluderExclude = false;
  material.userData.toonlabRockSourceMaterial = {
    materialPath,
    sourceAssetName,
    normalResponseBridge,
    projectedCrackNormalStrength,
    stylizedNormalFlipV,
    stylizedNormalGreenConvention,
    stylizedNormalResponseBridge,
    stylizedNormalStrength,
    stylizedNormalUvChannel,
    temporalDither: temporalState
      ? 'ToonLab DitherTemporalAA; fully-visible PerInstanceFadeAmount=1'
      : 'not-bound',
  };
  return material;
}

async function buildTemplate(sourceAssetName, manifest, baseUrl) {
  const meshRecord = manifest.meshes.find((entry) => entry.sourceAssetName === sourceAssetName);
  const materialPath = meshRecord?.materials?.find(Boolean);
  const profile = manifest.materials.find((entry) => entry.path === materialPath);
  if (!profile) throw new Error(`No source material profile for ${sourceAssetName}.`);
  return buildProfileTemplate(profile, manifest, baseUrl, sourceAssetName);
}

/** Loads an authored M_Rock/M_Mountain profile directly by ToonLab object path. */
export async function loadRockReferenceSourceMaterialProfile(materialPath, {
  baseUrl = DEFAULT_ROCK_REFERENCE_MATERIAL_SOURCE_BASE_URL,
  normalResponseBridge = 0,
  projectedCrackNormalStrength = 1,
  sourceAssetName = null,
  stylizedNormalFlipV = false,
  stylizedNormalGreenConvention = 'directx',
  stylizedNormalResponseBridge = 0,
  stylizedNormalStrength = 1,
  stylizedNormalUvChannel = 0,
  temporalState = null,
} = {}) {
  const manifest = await loadManifest(baseUrl);
  const profile = manifest.materials.find((entry) => entry.path === materialPath);
  if (!profile) throw new Error(`No source material profile for ${materialPath}.`);
  const bridge = THREE.MathUtils.clamp(Number(normalResponseBridge) || 0, 0, 1);
  const crackStrength = THREE.MathUtils.clamp(
    Number(projectedCrackNormalStrength) || 0,
    0,
    1,
  );
  const stylizedStrength = THREE.MathUtils.clamp(
    Number(stylizedNormalStrength) || 0,
    0,
    1,
  );
  const stylizedBridge = THREE.MathUtils.clamp(
    Number(stylizedNormalResponseBridge) || 0,
    0,
    1,
  );
  const stylizedUvChannel = Number(stylizedNormalUvChannel) === 1 ? 1 : 0;
  const stylizedGreenConvention = stylizedNormalGreenConvention === 'opengl'
    ? 'opengl'
    : 'directx';
  const stylizedFlipV = Boolean(stylizedNormalFlipV);
  const key = `${baseUrl}|profile|${materialPath}|asset:${sourceAssetName ?? ''}|normalBridge:${bridge}|crack:${crackStrength}|stylized:${stylizedStrength}|stylizedBridge:${stylizedBridge}|stylizedUv:${stylizedUvChannel}|stylizedGreen:${stylizedGreenConvention}|stylizedFlipV:${stylizedFlipV}`;
  let cache = materialTemplatePromises;
  if (temporalState) {
    if (!temporalMaterialTemplatePromises.has(temporalState)) {
      temporalMaterialTemplatePromises.set(temporalState, new Map());
    }
    cache = temporalMaterialTemplatePromises.get(temporalState);
  }
  if (!cache.has(key)) {
    cache.set(key, buildProfileTemplate(
      profile,
      manifest,
      baseUrl,
      sourceAssetName,
      temporalState,
      bridge,
      crackStrength,
      stylizedFlipV,
      stylizedGreenConvention,
      stylizedBridge,
      stylizedStrength,
      stylizedUvChannel,
    ).catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  const template = await cache.get(key);
  const material = template.clone();
  material.name = template.name;
  material.userData = structuredClone(template.userData);
  material.toonLabSourceSpecularNode = template.toonLabSourceSpecularNode;
  copySurfaceMaterialModes(template, material);
  return material;
}

/** Loads a cached source-material template and returns a disposable clone. */
export async function loadRockReferenceSourceMaterial(sourceAssetName, {
  baseUrl = DEFAULT_ROCK_REFERENCE_MATERIAL_SOURCE_BASE_URL,
} = {}) {
  const manifest = await loadManifest(baseUrl);
  const meshRecord = manifest.meshes.find((entry) => entry.sourceAssetName === sourceAssetName);
  const materialPath = meshRecord?.materials?.find(Boolean);
  if (!materialPath) throw new Error(`No source material assignment for ${sourceAssetName}.`);
  const key = `${baseUrl}|${materialPath}`;
  if (!materialTemplatePromises.has(key)) {
    materialTemplatePromises.set(key, buildTemplate(sourceAssetName, manifest, baseUrl)
      .catch((error) => {
        materialTemplatePromises.delete(key);
        throw error;
      }));
  }
  const template = await materialTemplatePromises.get(key);
  const material = template.clone();
  material.name = template.name;
  material.userData = structuredClone(template.userData);
  copySurfaceMaterialModes(template, material);
  return material;
}
