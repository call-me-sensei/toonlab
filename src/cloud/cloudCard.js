import * as THREE from 'three';
import {
  Fn,
  bitangentWorld,
  clamp,
  dot,
  max,
  mix,
  normalWorld,
  normalize,
  pow,
  smoothstep,
  tangentWorld,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import {
  createCloudShaderSettings,
} from './cloudShaderSettings.js';
import {
  createCloudSourceDocument,
  generateCloudSourceMaps,
} from './cloudSource.js';
import {
  createCloudCompositionDocument,
  resolveCloudPlacements,
} from './cloudComposition.js';
import { environmentStateUniformNodes } from '../shaders-tsl/chunks/environment-state.js';
import {
  createCloudVolumeMaterial,
  createCumulusVolumeGeometry,
} from './cloudVolume.js';

function dataTexture(bytes, width, height) {
  const result = new THREE.DataTexture(
    bytes,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  result.colorSpace = THREE.NoColorSpace;
  result.flipY = true;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.wrapS = THREE.ClampToEdgeWrapping;
  result.wrapT = THREE.ClampToEdgeWrapping;
  result.generateMipmaps = true;
  result.needsUpdate = true;
  return result;
}

export function createCloudSourceTextures(maps) {
  return {
    surface: dataTexture(maps.surface, maps.width, maps.height),
    volume: dataTexture(maps.volume, maps.width, maps.height),
  };
}

function setColor(node, channels) {
  node.value.setRGB(channels[0], channels[1], channels[2]);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

export function createCloudCardMaterial({
  artworkMap = null,
  layerOpacity = 1,
  layerTint = [1, 1, 1],
  maps,
  settings,
  sunDirection = [0.35, 0.8, 0.45],
} = {}) {
  const resolved = createCloudShaderSettings(settings);
  const sourceTextures = createCloudSourceTextures(maps);
  const uniforms = {
    depthStrength: uniform(resolved.depthStrength),
    edgeSoftness: uniform(resolved.edgeSoftness),
    erosion: uniform(resolved.erosion),
    litColor: uniform(new THREE.Color(...resolved.litColor)),
    layerOpacity: uniform(clampNumber(layerOpacity, 0, 1)),
    layerTint: uniform(new THREE.Color(...layerTint)),
    normalStrength: uniform(resolved.normalStrength),
    opacity: uniform(resolved.opacity),
    rimColor: uniform(new THREE.Color(...resolved.rimColor)),
    rimPower: uniform(resolved.rimPower),
    rimStrength: uniform(resolved.rimStrength),
    shadeColor: uniform(new THREE.Color(...resolved.shadeColor)),
    shadowStrength: uniform(resolved.shadowStrength),
    sunDirection: uniform(new THREE.Vector3(...sunDirection).normalize()),
    translucencyStrength: uniform(resolved.translucencyStrength),
  };
  const material = new MeshBasicNodeMaterial();
  material.name = 'ToonLabCloudCard';
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  // High-altitude cards own their atmospheric tint. Applying scene fog again
  // can erase them entirely in ordinary ground-level haze.
  material.fog = false;
  material.colorNode = artworkMap ? Fn(() => {
    const sourceUv = uv();
    const artwork = texture(artworkMap).sample(sourceUv);
    const texel = uniform(new THREE.Vector2(
      3 / Math.max(artworkMap.image?.width ?? 1, 1),
      3 / Math.max(artworkMap.image?.height ?? 1, 1),
    ));
    const heightAt = (sampleUv) => {
      const sample = texture(artworkMap).sample(sampleUv);
      return dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)).mul(sample.a);
    };
    const left = heightAt(sourceUv.sub(vec2(texel.x, 0)));
    const right = heightAt(sourceUv.add(vec2(texel.x, 0)));
    const below = heightAt(sourceUv.sub(vec2(0, texel.y)));
    const above = heightAt(sourceUv.add(vec2(0, texel.y)));
    const sourceNormal = normalize(vec3(
      left.sub(right).mul(uniforms.normalStrength).mul(3.2),
      below.sub(above).mul(uniforms.normalStrength).mul(3.2),
      1,
    ));
    const normal = normalize(
      tangentWorld.mul(sourceNormal.x)
        .add(bitangentWorld.mul(sourceNormal.y))
        .add(normalWorld.mul(sourceNormal.z)),
    );
    const sun = normalize(uniforms.sunDirection);
    const diffuse = smoothstep(-0.2, 0.82, dot(normal, sun));
    const underside = smoothstep(0.38, 0.76, sourceUv.y).oneMinus()
      .mul(uniforms.depthStrength)
      .mul(uniforms.shadowStrength);
    const formLight = clamp(diffuse.mul(0.52).add(0.48).sub(underside.mul(0.18)), 0, 1);
    // Transparent PNGs often carry dark, undefined RGB in their fringe. Fade
    // that fringe toward the configured lit color before compositing so the
    // cloud never acquires an accidental ink outline against a bright sky.
    const edgeInterior = smoothstep(0.08, 0.72, artwork.a);
    const authoredColor = mix(uniforms.litColor, artwork.rgb, edgeInterior)
      .mul(uniforms.layerTint);
    const authoredLuminance = dot(authoredColor, vec3(0.2126, 0.7152, 0.0722));
    const structure = mix(0.58, 1.12, pow(clamp(authoredLuminance, 0, 1), 0.78));
    const dayMix = clamp(environmentStateUniformNodes.sunVisibility, 0, 1);
    const keyColor = mix(
      environmentStateUniformNodes.moonColor,
      environmentStateUniformNodes.sunColor,
      dayMix,
    );
    const keyIntensity = mix(
      environmentStateUniformNodes.moonIntensity.mul(0.28),
      environmentStateUniformNodes.sunIntensity,
      dayMix,
    );
    const overcast = clamp(environmentStateUniformNodes.weatherOvercast, 0, 1);
    const precipitation = clamp(environmentStateUniformNodes.weatherPrecipitation, 0, 1);
    const weatherDarkening = clamp(max(
      environmentStateUniformNodes.weatherCloudFade,
      precipitation.mul(0.42),
    ), 0, 0.9);
    const ambientColor = mix(
      uniforms.shadeColor,
      environmentStateUniformNodes.atmosphereFogColor,
      0.58,
    );
    const shade = ambientColor
      .mul(mix(0.48, 0.3, overcast))
      .mul(weatherDarkening.oneMinus());
    const directStrength = keyIntensity.mul(mix(1, 0.22, overcast));
    const light = shade.add(keyColor.mul(directStrength).mul(0.92));
    const color = mix(shade, light, formLight).mul(structure).toVar();

    // A small sun-directed alpha shift isolates the lit silhouette edge. This
    // is the inexpensive 2D equivalent of a volumetric silver lining.
    const sunAcrossCard = vec2(dot(sun, tangentWorld), dot(sun, bitangentWorld));
    const shiftedUv = clamp(
      sourceUv.add(sunAcrossCard.mul(texel).mul(4)),
      vec2(0.001),
      vec2(0.999),
    );
    const shiftedAlpha = texture(artworkMap).sample(shiftedUv).a;
    const silhouetteRim = max(artwork.a.sub(shiftedAlpha), 0);
    const rimFocus = pow(clamp(dot(normal, sun).mul(0.5).add(0.5), 0, 1), uniforms.rimPower);
    color.addAssign(
      uniforms.rimColor
        .mul(silhouetteRim)
        .mul(rimFocus.mul(0.65).add(0.35))
        .mul(uniforms.rimStrength)
        .mul(keyIntensity)
        .mul(mix(1, 0.18, overcast))
        .mul(1.2),
    );
    const forward = pow(max(dot(normal.negate(), sun), 0), 3)
      .mul(artwork.a)
      .mul(uniforms.translucencyStrength)
      .mul(keyIntensity)
      .mul(overcast.oneMinus())
      .mul(0.14);
    color.addAssign(keyColor.mul(forward));
    return vec4(max(color, vec3(0)), 1);
  })() : Fn(() => {
    const surface = texture(sourceTextures.surface).sample(uv());
    const volume = texture(sourceTextures.volume).sample(uv());
    const sourceNormal = surface.rgb.mul(2).sub(1).toVar();
    sourceNormal.xy.mulAssign(uniforms.normalStrength);
    const normal = normalize(
      tangentWorld.mul(sourceNormal.x)
        .add(bitangentWorld.mul(sourceNormal.y))
        .add(normalWorld.mul(sourceNormal.z)),
    );
    const sun = normalize(uniforms.sunDirection);
    const diffuse = smoothstep(-0.18, 0.78, dot(normal, sun));
    const ao = mix(1, volume.g, uniforms.shadowStrength.mul(0.78));
    const underside = smoothstep(0.2, 0.72, uv().y).oneMinus()
      .mul(volume.r)
      .mul(uniforms.depthStrength)
      .mul(uniforms.shadowStrength);
    const formLight = clamp(diffuse.mul(0.58).add(0.42).mul(ao).sub(underside.mul(0.34)), 0, 1);
    const dayMix = clamp(environmentStateUniformNodes.sunVisibility, 0, 1);
    const keyColor = mix(
      environmentStateUniformNodes.moonColor,
      environmentStateUniformNodes.sunColor,
      dayMix,
    );
    const keyIntensity = mix(
      environmentStateUniformNodes.moonIntensity.mul(0.28),
      environmentStateUniformNodes.sunIntensity,
      dayMix,
    );
    const overcast = clamp(environmentStateUniformNodes.weatherOvercast, 0, 1);
    const precipitation = clamp(environmentStateUniformNodes.weatherPrecipitation, 0, 1);
    const weatherDarkening = clamp(max(
      environmentStateUniformNodes.weatherCloudFade,
      precipitation.mul(0.42),
    ), 0, 0.9);
    const shade = mix(
      uniforms.shadeColor,
      environmentStateUniformNodes.atmosphereFogColor,
      0.58,
    ).mul(mix(0.48, 0.3, overcast)).mul(weatherDarkening.oneMinus());
    const light = shade.add(keyColor.mul(keyIntensity).mul(mix(0.92, 0.2, overcast)));
    const color = mix(shade, light, formLight).toVar();
    color.assign(mix(color, shade, underside.mul(0.34)));
    const forward = pow(max(dot(normal.negate(), sun), 0), 3)
      .mul(volume.r.oneMinus())
      .mul(volume.b.mul(0.65).add(0.35))
      .mul(uniforms.translucencyStrength)
      .mul(keyIntensity)
      .mul(overcast.oneMinus());
    color.addAssign(keyColor.mul(forward));
    const rimFocus = pow(clamp(dot(normal, sun).mul(0.5).add(0.5), 0, 1), uniforms.rimPower);
    color.addAssign(
      uniforms.rimColor
        .mul(volume.b)
        .mul(rimFocus)
        .mul(uniforms.rimStrength)
        .mul(keyIntensity)
        .mul(mix(1, 0.18, overcast)),
    );
    return vec4(max(color, vec3(0)), 1);
  })();
  material.opacityNode = artworkMap ? Fn(() => {
    const artwork = texture(artworkMap).sample(uv());
    return smoothstep(
      uniforms.edgeSoftness.mul(0.12),
      max(uniforms.edgeSoftness.mul(0.7), 0.015),
      artwork.a,
    ).mul(uniforms.opacity).mul(uniforms.layerOpacity);
  })() : Fn(() => {
    const surface = texture(sourceTextures.surface).sample(uv());
    const volume = texture(sourceTextures.volume).sample(uv());
    const erodedCoverage = surface.a.sub(volume.a.mul(uniforms.erosion));
    return smoothstep(
      uniforms.edgeSoftness.mul(0.35),
      max(uniforms.edgeSoftness, 0.01),
      erodedCoverage,
    ).mul(uniforms.opacity);
  })();
  material.userData.cloudCard = {
    artworkMap,
    maps,
    settings: resolved,
    sourceTextures,
    uniforms,
  };
  material.userData.applyCloudShaderSettings = (next) => {
    const value = createCloudShaderSettings(next);
    uniforms.depthStrength.value = value.depthStrength;
    uniforms.edgeSoftness.value = value.edgeSoftness;
    uniforms.erosion.value = value.erosion;
    setColor(uniforms.litColor, value.litColor);
    uniforms.normalStrength.value = value.normalStrength;
    uniforms.opacity.value = value.opacity;
    setColor(uniforms.rimColor, value.rimColor);
    uniforms.rimPower.value = value.rimPower;
    uniforms.rimStrength.value = value.rimStrength;
    setColor(uniforms.shadeColor, value.shadeColor);
    uniforms.shadowStrength.value = value.shadowStrength;
    uniforms.translucencyStrength.value = value.translucencyStrength;
    material.userData.cloudCard.settings = value;
    return value;
  };
  return material;
}

export function createCurvedCloudCardGeometry({
  curve = 0.11,
  height = 0.58,
  heightSegments = 8,
  widthSegments = 18,
} = {}) {
  const geometry = new THREE.PlaneGeometry(1, height, widthSegments, heightSegments);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const edge = Math.abs(x) * 2;
    position.setZ(index, -curve * edge * edge * (0.72 + Math.abs(y)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingSphere();
  return geometry;
}

function normalizeSources(input) {
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) {
    return new Map(input.map((source) => {
      const document = createCloudSourceDocument(source);
      return [document.id, document];
    }));
  }
  if (input && typeof input === 'object') {
    return new Map(Object.entries(input).map(([id, source]) => {
      const document = createCloudSourceDocument({ ...source, id: source.id ?? id });
      return [document.id, document];
    }));
  }
  return new Map();
}

export class CloudField extends THREE.Group {
  constructor({
    artworkMap = null,
    composition,
    depthLayers = 4,
    mapResolution = 256,
    renderMode = 'cards',
    shader,
    sources,
    sunDirection,
    volumeResolution = 52,
  } = {}) {
    super();
    this.name = 'ToonLabCloudField';
    this.artworkMap = artworkMap;
    this.depthLayers = Math.round(clampNumber(depthLayers, 1, 5));
    this.renderMode = renderMode === 'volume' ? 'volume' : 'cards';
    this.volumeResolution = Math.round(clampNumber(volumeResolution, 28, 72));
    this.composition = createCloudCompositionDocument(
      composition ?? { ...createCloudCompositionDocument('default-cloud-composition') },
    );
    this.shaderSettings = createCloudShaderSettings(shader);
    this.sources = normalizeSources(sources);
    this.sunDirection = new THREE.Vector3(...(sunDirection ?? [0.35, 0.8, 0.45])).normalize();
    this._records = [];
    this._elapsed = 0;
    this._build(mapResolution);
  }

  _build(mapResolution) {
    const placements = resolveCloudPlacements(this.composition);
    const byLayerAndSource = new Map();
    for (const placement of placements) {
      const source = this.sources.get(placement.sourceRef);
      if (!source) continue;
      const key = `${placement.layerId}:${placement.sourceRef}`;
      const bucket = byLayerAndSource.get(key) ?? { placements: [], source };
      bucket.placements.push(placement);
      byLayerAndSource.set(key, bucket);
    }
    for (const [key, bucket] of byLayerAndSource) {
      if (this.renderMode === 'volume') {
        const layer = this.composition.layers.find((entry) => key.startsWith(`${entry.id}:`));
        const material = createCloudVolumeMaterial({
          settings: this.shaderSettings,
          sunDirection: this.sunDirection.toArray(),
        });
        const geometry = createCumulusVolumeGeometry({
          resolution: this.volumeResolution,
          seed: bucket.source.seed,
        });
        const mesh = new THREE.InstancedMesh(geometry, material, bucket.placements.length);
        mesh.name = `CloudVolumes:${key}`;
        mesh.frustumCulled = false;
        mesh.renderOrder = -880;
        mesh.userData.waterExclude = true;
        const helper = new THREE.Object3D();
        bucket.placements.forEach((placement, index) => {
          const azimuth = THREE.MathUtils.degToRad(placement.azimuth);
          const elevation = THREE.MathUtils.degToRad(placement.elevation);
          const horizontal = Math.cos(elevation) * placement.radius;
          helper.position.set(
            Math.sin(azimuth) * horizontal,
            Math.sin(elevation) * placement.radius,
            Math.cos(azimuth) * horizontal,
          );
          helper.rotation.set(
            0,
            azimuth + THREE.MathUtils.degToRad(placement.rotation),
            0,
          );
          const scale = placement.scale * 0.5;
          helper.scale.setScalar(scale);
          helper.updateMatrix();
          mesh.setMatrixAt(index, helper.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        const root = new THREE.Group();
        root.name = `CloudVolumeLayer:${layer?.id ?? key}`;
        root.add(mesh);
        this.add(root);
        this._records.push({ animate: true, layer, material, mesh, root });
        continue;
      }
      // The accepted hero artwork owns macro-form. Keep procedural generation
      // entirely out of that path; these neutral 1x1 maps only preserve the
      // material contract shared with experimental/generated cloud sources.
      const maps = this.artworkMap ? {
        height: 1,
        surface: new Uint8Array([128, 128, 255, 255]),
        volume: new Uint8Array([255, 255, 255, 0]),
        width: 1,
      } : generateCloudSourceMaps(bucket.source, { resolution: mapResolution });
      const layer = this.composition.layers.find((entry) => key.startsWith(`${entry.id}:`));
      const root = new THREE.Group();
      root.name = `CloudLayer:${layer?.id ?? key}`;
      this.add(root);
      const paintedLayerSpecs = [
        { depth: -0.024, opacity: 0.07, scale: 1.018, tint: [0.72, 0.84, 1] },
        { depth: -0.016, opacity: 0.09, scale: 1.012, tint: [0.8, 0.9, 1] },
        { depth: -0.008, opacity: 0.12, scale: 1.006, tint: [0.91, 0.96, 1] },
        { depth: 0, opacity: 1, scale: 1, tint: [1, 1, 1] },
      ];
      const layerSpecs = this.artworkMap
        ? paintedLayerSpecs.slice(paintedLayerSpecs.length - this.depthLayers)
        : [{ depth: 0, opacity: 1, scale: 1, tint: [1, 1, 1] }];
      layerSpecs.forEach((depthLayer, depthIndex) => {
        const material = createCloudCardMaterial({
          artworkMap: this.artworkMap,
          layerOpacity: depthLayer.opacity * (layer?.opacity ?? 1),
          layerTint: depthLayer.tint,
          maps,
          settings: this.shaderSettings,
          sunDirection: this.sunDirection.toArray(),
        });
        const geometry = createCurvedCloudCardGeometry({
          curve: this.artworkMap ? 0.075 : 0.11,
          height: this.artworkMap ? 0.72 : 0.58,
        });
        const mesh = new THREE.InstancedMesh(geometry, material, bucket.placements.length);
        mesh.name = `CloudCards:${key}:depth-${depthIndex + 1}`;
        mesh.frustumCulled = false;
        mesh.renderOrder = -904 + depthIndex;
        mesh.userData.waterExclude = true;
        const helper = new THREE.Object3D();
        bucket.placements.forEach((placement, index) => {
          const azimuth = THREE.MathUtils.degToRad(placement.azimuth);
          const elevation = THREE.MathUtils.degToRad(placement.elevation);
          const horizontal = Math.cos(elevation) * placement.radius;
          helper.position.set(
            Math.sin(azimuth) * horizontal,
            Math.sin(elevation) * placement.radius,
            Math.cos(azimuth) * horizontal,
          );
          helper.lookAt(0, helper.position.y * 0.22, 0);
          helper.rotateZ(THREE.MathUtils.degToRad(placement.rotation));
          helper.translateZ(depthLayer.depth * placement.scale);
          const scale = placement.scale * depthLayer.scale;
          helper.scale.set(scale, scale, 1);
          helper.updateMatrix();
          mesh.setMatrixAt(index, helper.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        root.add(mesh);
        this._records.push({
          animate: depthIndex === 0,
          layer,
          material,
          mesh,
          root,
        });
      });
    }
  }

  applyCloudShaderSettings(input) {
    this.shaderSettings = createCloudShaderSettings(input);
    for (const record of this._records) {
      record.material.userData.applyCloudShaderSettings(this.shaderSettings);
    }
    return this.shaderSettings;
  }

  setSunDirection(value) {
    if (value?.isVector3) this.sunDirection.copy(value);
    else if (Array.isArray(value)) this.sunDirection.fromArray(value);
    if (this.sunDirection.lengthSq() < 0.00001) this.sunDirection.set(0.35, 0.8, 0.45);
    this.sunDirection.normalize();
    for (const record of this._records) {
      const uniforms = record.material.userData.cloudCard?.uniforms
        ?? record.material.userData.cloudVolume?.uniforms;
      uniforms?.sunDirection?.value.copy(this.sunDirection);
    }
  }

  getWorldShadowField() {
    const count = this.composition.layers.reduce(
      (sum, layer) => sum + (layer.placements.length || layer.count),
      0,
    );
    const coverage = clampNumber(count / 48, 0.1, 0.85);
    const firstWind = this.composition.layers[0]?.wind ?? [0.4, 0.1];
    return {
      coverage,
      scale: 0.0015,
      softness: this.shaderSettings.worldShadowSoftness,
      strength: this.shaderSettings.worldShadowStrength,
      velocity: [...firstWind],
    };
  }

  update(delta = 0) {
    this._elapsed += Math.max(Number(delta) || 0, 0);
    for (const record of this._records) {
      if (!record.animate) continue;
      const wind = record.layer?.wind ?? [0, 0];
      const response = this.shaderSettings.windResponse;
      record.root.rotation.y += wind[0] * response * delta * 0.00008;
      record.root.rotation.x = Math.sin(this._elapsed * wind[1] * 0.01) * 0.0008;
    }
  }

  dispose() {
    for (const record of this._records) {
      record.material.userData.cloudCard?.sourceTextures.surface.dispose();
      record.material.userData.cloudCard?.sourceTextures.volume.dispose();
      record.material.dispose();
      record.mesh.geometry.dispose();
    }
    this._records.length = 0;
    this.clear();
    this.removeFromParent();
  }
}

export function createCloudField(options) {
  return new CloudField(options);
}
