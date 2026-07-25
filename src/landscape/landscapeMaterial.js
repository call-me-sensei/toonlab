// Landscape terrain material — one MeshStandardNodeMaterial shared by every
// tile, blending the four splat layers from the field's global weight brick.
// Layers render as flat toon tints until a layer gets a texture; per-layer
// textures sample world-space XZ so they tile independently of terrain size.

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { color, positionWorld, texture, uniform, vec2 } from 'three/tsl';

import { landscapeSplatColorNode } from '../shaders-tsl/chunks/landscape-splat.js';

function configureSplatTexture(map) {
  map.name = 'LandscapeSplatWeights';
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.flipY = false;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  return map;
}

function configureLayerTexture(map) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

/**
 * Builds the shared terrain material for a landscape field.
 *
 * Returned material exposes `material.userData.landscape`:
 *   `splatTexture` — upload with `refreshSplat()` after splat strokes settle
 *   `setLayerTint(index, [r,g,b])` — live tint update, no recompile
 *   `setLayerTexture(index, THREE.Texture|null, { repeat })` — rebuilds nodes
 *   `setMacro(amount, scale)` — live macro-variation update
 */
export function createLandscapeMaterial({ field, layers = [] } = {}) {
  if (!field?.splat) throw new TypeError('A landscape field is required to build the terrain material.');
  const splatTexture = configureSplatTexture(
    new THREE.DataTexture(field.splat, field.splatW, field.splatD, THREE.RGBAFormat, THREE.UnsignedByteType),
  );

  const tintUniforms = Array.from({ length: 4 }, (_, index) => {
    const tint = layers[index]?.tint ?? [0.5, 0.5, 0.5];
    return uniform(new THREE.Color(...tint));
  });
  const macroAmount = uniform(0.16);
  const macroScale = uniform(0.045);
  const layerTextures = [null, null, null, null];
  const layerRepeats = [0.35, 0.35, 0.35, 0.35];

  const material = new MeshStandardNodeMaterial({
    roughness: 0.94,
    metalness: 0,
    // Cave interiors look up at the heightfield from below (hole-punched
    // overhangs/domes) — the underside must render, not clip to sky.
    side: THREE.DoubleSide,
  });

  function rebuildColorNode() {
    const layerColorNodes = tintUniforms.map((tint, index) => {
      const layerTexture = layerTextures[index];
      if (!layerTexture) return color(tint);
      const worldUv = vec2(positionWorld.x, positionWorld.z).mul(layerRepeats[index]);
      return texture(layerTexture, worldUv).rgb.mul(color(tint));
    });
    material.colorNode = landscapeSplatColorNode({
      splatTexture,
      layerColorNodes,
      macroAmount,
      macroScale,
      worldPositionNode: positionWorld,
    });
    material.needsUpdate = true;
  }

  rebuildColorNode();

  material.userData.landscape = {
    splatTexture,
    refreshSplat() {
      splatTexture.needsUpdate = true;
    },
    setLayerTint(index, tint) {
      if (index < 0 || index > 3 || !Array.isArray(tint)) return;
      tintUniforms[index].value.setRGB(tint[0] ?? 0.5, tint[1] ?? 0.5, tint[2] ?? 0.5);
    },
    setLayerTexture(index, map, { repeat = 0.35 } = {}) {
      if (index < 0 || index > 3) return;
      layerTextures[index] = map ? configureLayerTexture(map) : null;
      layerRepeats[index] = repeat;
      rebuildColorNode();
    },
    setMacro(amount, scale) {
      if (Number.isFinite(amount)) macroAmount.value = amount;
      if (Number.isFinite(scale)) macroScale.value = scale;
    },
    dispose() {
      splatTexture.dispose();
    },
  };

  return material;
}
