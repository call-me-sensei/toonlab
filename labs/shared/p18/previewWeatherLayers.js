// Preview-only weather layers for the accepted P18 comparison environment.
//
// These wrappers never edit the retained source materials. They clone the
// currently assigned ground material and add a zero-at-clear-weather snow
// layer, so a shader lab can verify vegetation against continuous ground
// accumulation without changing the accepted dry P18 fallback.

import * as THREE from 'three';
import {
  clamp,
  normalWorldGeometry,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import {
  buildSnowSurfaceLayer,
  createSnowSurfaceUniforms,
  updateSnowSurfaceUniforms,
} from '../../../src/weather/snowSurfaceShader.js';

const NEUTRAL_SNOW_SURFACE_SETTINGS = Object.freeze({
  color: Object.freeze({
    powderTint: Object.freeze([0.8, 0.82, 0.85]),
    shadowTint: Object.freeze([0.34, 0.38, 0.44]),
    shadowTintStrength: 0.26,
  }),
  structure: Object.freeze({
    macroStrength: 0.04,
    microStrength: 0.02,
    troughDarkening: 0.04,
  }),
  response: Object.freeze({
    sparkleStrength: 0,
  }),
});

function materialEntries(material) {
  return Array.isArray(material) ? material : [material];
}

function sourceColorNode(material) {
  if (material.colorNode) return material.colorNode;
  const color = material.color?.isColor
    ? material.color
    : new THREE.Color(1, 1, 1);
  return vec3(color.r, color.g, color.b);
}

function createSnowVariant(source, snowCover, snowUniforms) {
  const material = source.clone();
  const accumulation = smoothstep(0.08, 0.72, snowCover);
  const upwardSurface = smoothstep(-0.05, 0.52, normalWorldGeometry.y);
  const layer = buildSnowSurfaceLayer({
    baseColor: sourceColorNode(source),
    baseRoughness: source.roughnessNode ?? source.roughness ?? 0.9,
    baseSpecular: source.specularIntensityNode ?? 0.08,
    coverage: clamp(accumulation.mul(upwardSurface), 0, 1),
    uniforms: snowUniforms,
  });
  material.colorNode = layer.color;
  material.roughnessNode = layer.roughness;
  material.specularIntensityNode = layer.specular;
  material.name = `${source.name || 'P18 ground'} · preview snow blanket`;
  material.userData = {
    ...material.userData,
    toonlabPreviewGroundSnow: {
      source,
      zeroDeltaAtClearWeather: true,
    },
  };
  material.needsUpdate = true;
  return material;
}

export function createP18PreviewGroundSnowLayer(root) {
  const snowCover = uniform(0);
  const snowUniforms = createSnowSurfaceUniforms();
  const variantBySource = new Map();
  const sourceByVariant = new WeakMap();
  let desiredSnowCover = 0;
  let visible = true;

  function variantFor(source) {
    if (!source?.isMaterial) return source;
    if (!variantBySource.has(source)) {
      const variant = createSnowVariant(source, snowCover, snowUniforms);
      variantBySource.set(source, variant);
      sourceByVariant.set(variant, source);
    }
    return variantBySource.get(source);
  }

  return {
    apply() {
      root?.traverse?.((object) => {
        if (!object.isMesh || !object.material) return;
        const current = materialEntries(object.material);
        const next = current.map((material) => (
          sourceByVariant.has(material) ? material : variantFor(material)
        ));
        object.material = Array.isArray(object.material) ? next : next[0];
      });
    },
    dispose() {
      root?.traverse?.((object) => {
        if (!object.isMesh || !object.material) return;
        const current = materialEntries(object.material);
        const restored = current.map((material) => (
          sourceByVariant.get(material) ?? material
        ));
        object.material = Array.isArray(object.material)
          ? restored
          : restored[0];
      });
      variantBySource.forEach((material) => material.dispose?.());
      variantBySource.clear();
    },
    setStyle(style) {
      updateSnowSurfaceUniforms(
        snowUniforms,
        style === 'neutral_review'
          ? NEUTRAL_SNOW_SURFACE_SETTINGS
          : {},
      );
      document.body.dataset.previewSnowSurfaceStyle = style;
    },
    setVisible(nextVisible) {
      visible = Boolean(nextVisible);
      snowCover.value = visible ? desiredSnowCover : 0;
      document.body.dataset.previewSnowSurfaceVisible = String(visible);
    },
    setSnowCover(amount) {
      desiredSnowCover = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
      snowCover.value = visible ? desiredSnowCover : 0;
    },
    uniform: snowCover,
  };
}
