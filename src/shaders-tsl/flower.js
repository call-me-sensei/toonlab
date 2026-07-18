// TSL port of src/shaders/flower.vert.glsl + flower.frag.glsl — procedural
// daisy heads riding the grass canopy as camera-facing billboards. Also home
// to the tree lab's flower-patch materials (textured species heads + toon
// stems), so every flower path renders through node materials.

import * as THREE from 'three';
import {
  abs,
  atan,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  Discard,
  dot,
  float,
  Fn,
  instanceIndex,
  length,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  varying,
  vertexColor,
  vec2,
  vec3,
  vec4,
  attribute,
} from 'three/tsl';
import { MeshBasicNodeMaterial, MeshToonNodeMaterial, NodeMaterial } from 'three/webgpu';

import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';

export function createFlowerNodeMaterial(settings) {
  const u = {
    uCenterColor: uniform(new THREE.Color()),
    uPetalColor: uniform(new THREE.Color()),
    uShadowStrength: uniform(settings.shadowStrength),
    uTime: uniform(0),
    uWindDirection: uniform(new THREE.Vector2(settings.windDirection[0], settings.windDirection[1])),
    uWindSpeed: uniform(settings.windSpeed),
    uWindStrength: uniform(settings.windStrength),
  };

  const material = new NodeMaterial();
  material.name = 'StylizedFlowers';
  material.side = THREE.DoubleSide;
  material.fog = true;

  const vPetal = varying(vec2(), 'vFlowerPetal');
  const vPhase = varying(float(), 'vFlowerPhase');
  const vWorldPosition = varying(vec3(), 'vFlowerWorldPosition');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    const iInfo = attribute('iInfo', 'vec4');

    vPetal.assign(positionLocal.xy.mul(2.0));
    vPhase.assign(iInfo.y);

    const windDirection = normalize(u.uWindDirection.add(vec2(1e-4, 0.0)));
    const phase = u.uTime.mul(u.uWindSpeed).add(iInfo.y.mul(6.2831))
      .add(dot(iOrigin.xz, vec2(0.35, 0.28)));
    const flutter = sin(phase).mul(0.5).add(0.5).add(sin(phase.mul(2.33).add(1.7)).mul(0.3));
    const sway = windDirection.mul(flutter).mul(u.uWindStrength).mul(0.55).mul(iInfo.z);

    const center = iOrigin.add(vec3(sway.x, iInfo.z, sway.y));
    // viewMatrix rows 0/1 = camera right/up (GLSL viewMatrix[c][r] indexing).
    const cameraRight = vec3(
      cameraViewMatrix.element(0).x,
      cameraViewMatrix.element(1).x,
      cameraViewMatrix.element(2).x,
    );
    const cameraUp = vec3(
      cameraViewMatrix.element(0).y,
      cameraViewMatrix.element(1).y,
      cameraViewMatrix.element(2).y,
    );
    const flowerPosition = center.add(
      cameraRight.mul(positionLocal.x).add(cameraUp.mul(positionLocal.y)).mul(iInfo.x),
    );

    const worldPosition = modelWorldMatrix.mul(vec4(flowerPosition, 1.0));
    vWorldPosition.assign(worldPosition.xyz);
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  material.fragmentNode = Fn(() => {
    const radius = length(vPetal);
    const angle = atan(vPetal.y, vPetal.x);
    // Eight wide petals with narrow notches between them.
    const petalEdge = pow(abs(cos(angle.mul(4.0).add(vPhase.mul(6.2831)))), 0.35)
      .mul(0.58).add(0.42);
    Discard(radius.greaterThan(petalEdge));

    const centerMask = smoothstep(0.34, 0.2, radius);
    const color = mix(u.uPetalColor, u.uCenterColor, centerMask).toVar();
    // Petals cup slightly: darken toward their outer edge.
    color.mulAssign(radius.div(petalEdge).oneMinus().mul(0.12).add(0.9));

    // Scene shadows: cool dark tint matched to the grass field's response.
    const sceneShadow = mix(1.0, sampleEnvironmentSunShadow(vWorldPosition), u.uShadowStrength);
    color.mulAssign(mix(vec3(0.44, 0.48, 0.62), vec3(1.0), sceneShadow));

    return vec4(color, 1.0);
  })();

  material.uniforms = u;
  return material;
}

// Shared instance-phased sway for the tree lab's flower patch. Heads use the
// full amplitude; stems scale it by height fraction so a head stays glued to
// its stem tip (head and stem instances share the same index order, so the
// phases line up).
function flowerSway(u) {
  const phase = time.mul(u.uWindSpeed).add(float(instanceIndex).mul(1.618));
  return vec3(sin(phase), 0.0, cos(phase.mul(0.7)).mul(0.5)).mul(u.uWindStrength);
}

/**
 * Unlit cutout material for textured flower heads (species sprites drawn on
 * a canvas, including hand-drawn petals). TSL replacement for the flower
 * patch's old MeshBasicMaterial billboards, plus a gentle wind bob the
 * classic material never had.
 */
export function createFlowerHeadNodeMaterial({ map, alphaCutoff = 0.4, windSpeed = 1, windStrength = 0 } = {}) {
  const u = {
    uAlphaCutoff: uniform(alphaCutoff),
    uMap: texture(map),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
  };

  const material = new MeshBasicNodeMaterial();
  material.name = 'FlowerPatchHead';
  material.side = THREE.DoubleSide;
  material.transparent = true;

  material.positionNode = positionLocal.add(flowerSway(u));
  material.colorNode = u.uMap; // TextureNode samples at uv() by default
  material.alphaTestNode = u.uAlphaCutoff;

  material.uniforms = u;
  return material;
}

/**
 * Camera-facing textured bloom material for StylizedFlower plants: instanced
 * billboard quads (iOrigin vec3 + iInfo vec4 = size / roll / sway amplitude)
 * sampling a species head sprite, with the daisy field's wind bob. A bloom
 * never renders edge-on, from any camera.
 */
export function createFlowerHeadBillboardNodeMaterial({
  map, alphaCutoff = 0.4, windDirection = [1, 0.3], windSpeed = 1, windStrength = 0,
} = {}) {
  const u = {
    uAlphaCutoff: uniform(alphaCutoff),
    uMap: texture(map),
    uWindDirection: uniform(new THREE.Vector2(windDirection[0], windDirection[1])),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
  };

  const material = new NodeMaterial();
  material.name = 'StylizedFlowerHeads';
  material.side = THREE.DoubleSide;

  const vUv = varying(vec2(), 'vFlowerHeadUv');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    const iInfo = attribute('iInfo', 'vec4');
    vUv.assign(uv());

    const windDir = normalize(u.uWindDirection.add(vec2(1e-4, 0.0)));
    const phase = time.mul(u.uWindSpeed).add(iInfo.y.mul(6.2831));
    const flutter = sin(phase).mul(0.5).add(0.5).add(sin(phase.mul(2.33).add(1.7)).mul(0.3));
    const sway = windDir.mul(flutter).mul(u.uWindStrength).mul(iInfo.z);
    const center = iOrigin.add(vec3(sway.x, 0.0, sway.y));

    // Static per-head roll so repeated petal sprites don't align.
    const roll = iInfo.y.mul(6.2831);
    const rollCos = cos(roll);
    const rollSin = sin(roll);
    const corner = vec2(
      positionLocal.x.mul(rollCos).sub(positionLocal.y.mul(rollSin)),
      positionLocal.x.mul(rollSin).add(positionLocal.y.mul(rollCos)),
    );

    // viewMatrix rows 0/1 = camera right/up (GLSL viewMatrix[c][r] indexing).
    const cameraRight = vec3(
      cameraViewMatrix.element(0).x,
      cameraViewMatrix.element(1).x,
      cameraViewMatrix.element(2).x,
    );
    const cameraUp = vec3(
      cameraViewMatrix.element(0).y,
      cameraViewMatrix.element(1).y,
      cameraViewMatrix.element(2).y,
    );
    const headPosition = center.add(
      cameraRight.mul(corner.x).add(cameraUp.mul(corner.y)).mul(iInfo.x),
    );
    const worldPosition = modelWorldMatrix.mul(vec4(headPosition, 1.0));
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition);
  })();

  material.fragmentNode = Fn(() => {
    const sprite = u.uMap.sample(vUv).toVar();
    Discard(sprite.a.lessThan(u.uAlphaCutoff));
    return vec4(sprite.rgb, 1.0);
  })();

  material.uniforms = u;
  return material;
}

/**
 * Toon material for 3D bloom-head meshes (vertex-colored petals + center
 * from createFlowerHeadGeometry), with the shared instance-phased wind bob.
 */
export function createFlowerBloomNodeMaterial({ unlitLift = 0.35, windSpeed = 1, windStrength = 0 } = {}) {
  const u = {
    uUnlitLift: uniform(unlitLift),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
  };

  const material = new MeshToonNodeMaterial({ side: THREE.DoubleSide, vertexColors: true });
  material.name = 'StylizedFlowerBloom';
  material.positionNode = positionLocal.add(flowerSway(u));
  // Petal-tinted floor for unlit faces (the flower shader's Unlit Petal
  // Lift): cup interiors and shaded petals read as darker petal color
  // instead of toon-band black.
  material.emissiveNode = vertexColor().rgb.mul(u.uUnlitLift);

  material.uniforms = u;
  return material;
}

/**
 * Toon stem material for ground flowers. Bends with the same sway as the
 * head, scaled by height fraction (root stays planted, tip follows the head).
 */
export function createFlowerStemNodeMaterial({ color = 0x4d8a3f, height = 1, windSpeed = 1, windStrength = 0 } = {}) {
  const u = {
    uHeight: uniform(Math.max(height, 1e-3)),
    uWindSpeed: uniform(windSpeed),
    uWindStrength: uniform(windStrength),
  };

  const material = new MeshToonNodeMaterial({ color });
  material.name = 'FlowerPatchStem';

  const bend = clamp(positionLocal.y.div(u.uHeight), 0.0, 1.0);
  material.positionNode = positionLocal.add(flowerSway(u).mul(bend));

  material.uniforms = u;
  return material;
}
