import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  Fn,
  attribute,
  cameraPosition,
  clamp,
  dot,
  max,
  mix,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import { environmentStateUniformNodes } from '../shaders-tsl/chunks/environment-state.js';
import { createCloudShaderSettings } from './cloudShaderSettings.js';

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function randomFactory(seed = 1) {
  let state = (Math.round(Number(seed)) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z, seed) {
  const value = Math.sin(
    x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19,
  ) * 43758.5453123;
  return value - Math.floor(value);
}

function valueNoise3(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const lerp = THREE.MathUtils.lerp;
  const x00 = lerp(hash3(ix, iy, iz, seed), hash3(ix + 1, iy, iz, seed), sx);
  const x10 = lerp(hash3(ix, iy + 1, iz, seed), hash3(ix + 1, iy + 1, iz, seed), sx);
  const x01 = lerp(hash3(ix, iy, iz + 1, seed), hash3(ix + 1, iy, iz + 1, seed), sx);
  const x11 = lerp(hash3(ix, iy + 1, iz + 1, seed), hash3(ix + 1, iy + 1, iz + 1, seed), sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

function baseCumulusLobes() {
  return [
    // A broad, connected base and shoulder masses establish the realistic
    // cumulus macro-form before any smaller cauliflower detail is added.
    { x: 0.5, y: 0.31, z: 0.5, rx: 0.34, ry: 0.15, rz: 0.23, weight: 1.15 },
    { x: 0.25, y: 0.34, z: 0.49, rx: 0.22, ry: 0.16, rz: 0.19, weight: 0.96 },
    { x: 0.75, y: 0.35, z: 0.5, rx: 0.23, ry: 0.17, rz: 0.2, weight: 0.98 },
    { x: 0.39, y: 0.46, z: 0.48, rx: 0.23, ry: 0.22, rz: 0.2, weight: 1.02 },
    { x: 0.6, y: 0.48, z: 0.52, rx: 0.24, ry: 0.23, rz: 0.21, weight: 1.04 },
    { x: 0.48, y: 0.62, z: 0.5, rx: 0.22, ry: 0.23, rz: 0.2, weight: 1.03 },
    { x: 0.43, y: 0.76, z: 0.5, rx: 0.16, ry: 0.19, rz: 0.16, weight: 0.94 },
    { x: 0.61, y: 0.65, z: 0.47, rx: 0.16, ry: 0.17, rz: 0.16, weight: 0.88 },
    // Real depth masses prevent the source becoming a front-facing relief.
    { x: 0.37, y: 0.42, z: 0.35, rx: 0.2, ry: 0.18, rz: 0.18, weight: 0.9 },
    { x: 0.61, y: 0.43, z: 0.67, rx: 0.2, ry: 0.19, rz: 0.18, weight: 0.92 },
    { x: 0.5, y: 0.58, z: 0.34, rx: 0.18, ry: 0.2, rz: 0.16, weight: 0.86 },
  ];
}

function createCumulusLobes(seed) {
  const random = randomFactory(seed);
  const lobes = baseCumulusLobes();
  const parents = lobes.slice(1, 8);
  for (let index = 0; index < 18; index += 1) {
    const parent = parents[index % parents.length];
    const angle = random() * Math.PI * 2;
    const verticalBias = random() * 0.8 - 0.18;
    const radius = 0.055 + random() * 0.05;
    lobes.push({
      x: clampNumber(parent.x + Math.cos(angle) * parent.rx * (0.72 + random() * 0.25), 0.08, 0.92),
      y: clampNumber(parent.y + verticalBias * parent.ry, 0.16, 0.91),
      z: clampNumber(parent.z + Math.sin(angle) * parent.rz * (0.68 + random() * 0.28), 0.12, 0.88),
      rx: radius * (0.88 + random() * 0.32),
      ry: radius * (0.95 + random() * 0.4),
      rz: radius * (0.86 + random() * 0.32),
      weight: 0.62 + random() * 0.2,
    });
  }
  const secondary = lobes.slice(-18);
  for (let index = 0; index < 16; index += 1) {
    const parent = secondary[index % secondary.length];
    const angle = random() * Math.PI * 2;
    const radius = 0.032 + random() * 0.026;
    lobes.push({
      x: clampNumber(parent.x + Math.cos(angle) * parent.rx * (0.68 + random() * 0.24), 0.06, 0.94),
      y: clampNumber(parent.y + (random() * 0.72 - 0.12) * parent.ry, 0.14, 0.94),
      z: clampNumber(parent.z + Math.sin(angle) * parent.rz * (0.66 + random() * 0.26), 0.1, 0.9),
      rx: radius * (0.9 + random() * 0.24),
      ry: radius * (1 + random() * 0.32),
      rz: radius * (0.88 + random() * 0.24),
      weight: 0.46 + random() * 0.16,
    });
  }
  return lobes;
}

/**
 * Builds a connected, genuinely three-dimensional cumulus surface. The
 * density field is intentionally low-frequency: realistic large forms first,
 * with only restrained secondary lobes instead of turbulent fractal noise.
 */
export function createCumulusVolumeGeometry({ resolution = 52, seed = 1 } = {}) {
  const size = Math.round(clampNumber(resolution, 28, 72));
  const scratchMaterial = new THREE.MeshBasicMaterial();
  const marching = new MarchingCubes(size, scratchMaterial, false, false, 120_000);
  const lobes = createCumulusLobes(seed);
  const field = marching.field;
  const size2 = size * size;
  const threshold = 0;

  const smoothMinimum = (a, b, radius) => {
    if (!Number.isFinite(a)) return b;
    const amount = clampNumber(0.5 + 0.5 * (b - a) / radius, 0, 1);
    return THREE.MathUtils.lerp(b, a, amount) - radius * amount * (1 - amount);
  };

  for (let z = 0; z < size; z += 1) {
    const pz = z / (size - 1);
    for (let y = 0; y < size; y += 1) {
      const py = y / (size - 1);
      const row = z * size2 + y * size;
      for (let x = 0; x < size; x += 1) {
        const px = x / (size - 1);
        let distance = Infinity;
        for (const lobe of lobes) {
          const dx = (px - lobe.x) / lobe.rx;
          const dy = (py - lobe.y) / lobe.ry;
          const dz = (pz - lobe.z) / lobe.rz;
          const distance2 = dx * dx + dy * dy + dz * dz;
          const lobeDistance = (Math.sqrt(distance2) - 1)
            * Math.min(lobe.rx, lobe.ry, lobe.rz)
            / Math.max(lobe.weight, 0.2);
          distance = smoothMinimum(distance, lobeDistance, 0.014);
        }
        // Very low-amplitude coherent variation breaks mathematical symmetry
        // without adding the fine turbulent detail the target deliberately omits.
        const variation = Math.sin(px * 19 + py * 11 + pz * 7)
          * Math.sin(px * 7 - py * 13 + pz * 17) * 0.0035;
        field[row + x] = -distance + variation;
      }
    }
  }

  marching.isolation = threshold;
  marching.blur(0.03);
  marching.update();
  const count = marching.geometry.drawRange.count;
  if (count <= 0) throw new Error('Cumulus volume generation produced no surface.');
  const sourcePosition = marching.geometry.getAttribute('position');
  const sourceNormal = marching.geometry.getAttribute('normal');
  const rawGeometry = new THREE.BufferGeometry();
  rawGeometry.setAttribute('position', new THREE.BufferAttribute(
    sourcePosition.array.slice(0, count * 3), 3,
  ));
  rawGeometry.setAttribute('normal', new THREE.BufferAttribute(
    sourceNormal.array.slice(0, count * 3), 3,
  ));
  const rawPosition = rawGeometry.getAttribute('position');
  const rawNormal = rawGeometry.getAttribute('normal');
  const displacementSeed = Math.round(Number(seed)) || 1;
  for (let index = 0; index < rawPosition.count; index += 1) {
    const x = rawPosition.getX(index);
    const y = rawPosition.getY(index);
    const z = rawPosition.getZ(index);
    const medium = valueNoise3((x + 1) * 3.1, (y + 1) * 3.1, (z + 1) * 3.1, displacementSeed);
    const small = valueNoise3((x + 1) * 6.2, (y + 1) * 6.2, (z + 1) * 6.2, displacementSeed + 17);
    const displacement = (medium - 0.5) * 0.032 + (small - 0.5) * 0.01;
    const nx = rawNormal.getX(index);
    const ny = rawNormal.getY(index);
    const nz = rawNormal.getZ(index);
    const normalLength = Math.hypot(nx, ny, nz) || 1;
    rawPosition.setXYZ(
      index,
      x + (nx / normalLength) * displacement,
      y + (ny / normalLength) * displacement,
      z + (nz / normalLength) * displacement,
    );
  }
  rawPosition.needsUpdate = true;
  rawGeometry.deleteAttribute('normal');
  const geometry = mergeVertices(rawGeometry, 1e-4);
  rawGeometry.dispose();
  geometry.computeVertexNormals();
  const positions = geometry.getAttribute('position');
  const mergedCount = positions.count;
  const mergedOcclusion = new Float32Array(mergedCount);
  for (let index = 0; index < mergedCount; index += 1) {
    const px = positions.getX(index) * 0.5 + 0.5;
    const py = positions.getY(index) * 0.5 + 0.5;
    const pz = positions.getZ(index) * 0.5 + 0.5;
    let total = 0;
    let strongest = 0;
    for (const lobe of lobes) {
      const dx = (px - lobe.x) / lobe.rx;
      const dy = (py - lobe.y) / lobe.ry;
      const dz = (pz - lobe.z) / lobe.rz;
      const distance2 = dx * dx + dy * dy + dz * dz;
      if (distance2 >= 1.35) continue;
      const influence = Math.max(1 - distance2 / 1.35, 0);
      const contribution = influence * influence * lobe.weight;
      total += contribution;
      strongest = Math.max(strongest, contribution);
    }
    const overlap = Math.max(total - strongest, 0);
    mergedOcclusion[index] = clampNumber(1 - overlap * 2.8, 0.5, 1);
  }
  geometry.setAttribute('cloudOcclusion', new THREE.BufferAttribute(mergedOcclusion, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.cloudVolume = {
    lobeCount: lobes.length,
    resolution: size,
    seed: Math.round(Number(seed)) || 1,
    triangleCount: count / 3,
  };
  marching.geometry.dispose();
  scratchMaterial.dispose();
  return geometry;
}

function setColor(node, channels) {
  node.value.setRGB(channels[0], channels[1], channels[2]);
}

export function createCloudVolumeMaterial({ settings, sunDirection = [0.35, 0.8, 0.45] } = {}) {
  const resolved = createCloudShaderSettings(settings);
  const uniforms = {
    depthStrength: uniform(resolved.depthStrength),
    litColor: uniform(new THREE.Color(...resolved.litColor)),
    rimColor: uniform(new THREE.Color(...resolved.rimColor)),
    rimPower: uniform(resolved.rimPower),
    rimStrength: uniform(resolved.rimStrength),
    shadeColor: uniform(new THREE.Color(...resolved.shadeColor)),
    shadowStrength: uniform(resolved.shadowStrength),
    sunDirection: uniform(new THREE.Vector3(...sunDirection).normalize()),
    translucencyStrength: uniform(resolved.translucencyStrength),
  };
  const material = new MeshBasicNodeMaterial();
  material.name = 'ToonLabPhysicalCumulusVolume';
  material.depthWrite = true;
  // Volumes already blend toward the shared atmosphere color in the graph.
  // Renderer fog would apply the same extinction twice.
  material.fog = false;
  material.transparent = false;
  material.side = THREE.FrontSide;
  material.colorNode = Fn(() => {
    const normal = normalize(normalWorld);
    const sun = normalize(uniforms.sunDirection);
    const view = normalize(cameraPosition.sub(positionWorld));
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

    // Wrapped diffuse and a broad underside term create readable volume while
    // keeping the target's transitions soft and clean rather than photoreal.
    const diffuse = smoothstep(-0.3, 0.72, dot(normal, sun));
    const upness = smoothstep(-0.28, 0.58, normal.y);
    const lowerMass = smoothstep(-0.5, 0.34, positionLocal.y).oneMinus();
    const underside = upness.oneMinus().mul(0.58).add(lowerMass.mul(0.28))
      .mul(uniforms.depthStrength)
      .mul(uniforms.shadowStrength);
    const creaseOcclusion = mix(
      1,
      attribute('cloudOcclusion', 'float'),
      uniforms.shadowStrength.mul(0.72),
    );
    const formLight = clamp(diffuse.mul(0.68).add(upness.mul(0.16)).add(0.18)
      .sub(underside.mul(0.42)), 0, 1);

    const ambientColor = mix(
      uniforms.shadeColor,
      environmentStateUniformNodes.atmosphereFogColor,
      0.54,
    );
    const shade = ambientColor
      .mul(mix(0.48, 0.3, overcast))
      .mul(weatherDarkening.oneMinus());
    const light = shade.add(
      mix(uniforms.litColor, keyColor, 0.72)
        .mul(keyIntensity)
        .mul(mix(0.98, 0.2, overcast)),
    );

    const color = mix(shade, light, formLight)
      .mul(creaseOcclusion).toVar();

    const fresnel = pow(max(dot(normal, view), 0).oneMinus(), uniforms.rimPower);
    const sunFacingEdge = smoothstep(-0.15, 0.72, dot(normal, sun));
    color.addAssign(
      uniforms.rimColor
        .mul(fresnel)
        .mul(sunFacingEdge)
        .mul(uniforms.rimStrength)
        .mul(keyIntensity)
        .mul(mix(1, 0.16, overcast))
        .mul(0.48),
    );
    const backlight = pow(max(dot(normal.negate(), sun), 0), 3)
      .mul(fresnel)
      .mul(uniforms.translucencyStrength)
      .mul(keyIntensity)
      .mul(overcast.oneMinus())
      .mul(0.22);
    color.addAssign(keyColor.mul(backlight));
    return vec4(max(color, vec3(0)), 1);
  })();
  material.userData.cloudVolume = { settings: resolved, uniforms };
  material.userData.applyCloudShaderSettings = (next) => {
    const value = createCloudShaderSettings(next);
    uniforms.depthStrength.value = value.depthStrength;
    setColor(uniforms.litColor, value.litColor);
    setColor(uniforms.rimColor, value.rimColor);
    uniforms.rimPower.value = value.rimPower;
    uniforms.rimStrength.value = value.rimStrength;
    setColor(uniforms.shadeColor, value.shadeColor);
    uniforms.shadowStrength.value = value.shadowStrength;
    uniforms.translucencyStrength.value = value.translucencyStrength;
    material.userData.cloudVolume.settings = value;
    return value;
  };
  return material;
}
