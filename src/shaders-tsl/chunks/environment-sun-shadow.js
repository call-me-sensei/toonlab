// Shared sun-shadow sampling for TSL environment + character materials —
// the node-backend replacement for three's <shadowmask_pars_fragment>
// getShadowMask() (the classic renderer's shadow system is driven by
// materials with lights:true, which the toon pipeline never uses on the node
// backends).
//
// A dedicated pass (src/environment/environmentSunShadowPass.js) renders the
// scene from the shadow-casting sun into a float color target (linear window
// depth — see docs/tsl-conventions.md on depth-texture sampling) and fills
// these shared uniforms. Until that pass runs, `ready` stays false and the
// mask is 1.0 everywhere — identical to a scene with no shadow-casting sun.

import * as THREE from 'three';
import {
  clamp,
  dot,
  float,
  Fn,
  If,
  mix,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';

export const environmentSunShadow = {
  bias: uniform(-0.00004),
  map: null, // TextureNode, created lazily below (needs a fallback texture)
  mapSize: uniform(2048),
  matrix: uniform(new THREE.Matrix4()),
  radius: uniform(1),
  ready: uniform(false, 'bool'),
};

let fallbackTexture = null;

export function sunShadowMapNode() {
  if (!environmentSunShadow.map) {
    if (!fallbackTexture) {
      const data = new Uint8Array([255, 255, 255, 255]);
      fallbackTexture = new THREE.DataTexture(data, 1, 1);
      fallbackTexture.needsUpdate = true;
    }
    environmentSunShadow.map = texture(fallbackTexture);
  }
  return environmentSunShadow.map;
}

/**
 * getShadowMask() replacement: 1 fully lit, 0 fully shadowed. worldPosition
 * is the fragment's world position node. The matrix is CPU-composed to yield
 * GL-convention clip coords under the shader's *0.5+0.5 remap on every
 * backend (see shadowClipAdjust in the pass).
 */
export const sampleEnvironmentSunShadow = /*@__PURE__*/ Fn(([worldPosition]) => {
  const shadow = float(1.0).toVar();
  If(environmentSunShadow.ready, () => {
    const shadowNdc = environmentSunShadow.matrix.mul(vec4(worldPosition, 1.0));
    const coord = shadowNdc.xyz.div(shadowNdc.w).mul(0.5).add(0.5).toVar();
    const inside = coord.x.greaterThanEqual(0.0).and(coord.x.lessThanEqual(1.0))
      .and(coord.y.greaterThanEqual(0.0)).and(coord.y.lessThanEqual(1.0))
      .and(coord.z.lessThanEqual(1.0)).and(coord.z.greaterThanEqual(0.0));
    If(inside, () => {
      const texel = float(1.0).div(environmentSunShadow.mapSize);
      // Match THREE.LightShadow.bias: negative values move the receiver
      // reference toward the light and reduce self-shadow acne.
      const reference = coord.z.add(environmentSunShadow.bias);
      const map = sunShadowMapNode();
      // 3×3 PCF (classic PCFSoftShadowMap kernel footprint): averages the
      // 8-bit-quantized self-shadowing into the fine dither the approved
      // interior look was tuned around; radius scales the spread.
      const spread = texel.mul(environmentSunShadow.radius);
      const visibility = float(0.0).toVar();
      for (let y = -1; y <= 1; y += 1) {
        for (let x = -1; x <= 1; x += 1) {
          visibility.addAssign(step(
            reference,
            map.sample(coord.xy.add(vec2(x, y).mul(spread))).level(0).x,
          ));
        }
      }
      shadow.assign(visibility.div(9.0));
    });
  });
  return shadow;
});
