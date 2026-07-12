// TSL port of src/shaders/chunks/character-fragment-color.glsl — albedo color
// edits and HSV helpers shared by the toon character shader.
//
// GLSL's applyHSVChange returns the edited color and its original HSV through
// an out-parameter; here the two are separate calls (rgbToHsv is cheap and the
// builder de-duplicates identical subgraphs).

import {
  abs,
  clamp,
  dot,
  float,
  Fn,
  fract,
  max,
  min,
  mix,
  pow,
  select,
  step,
  vec3,
  vec4,
} from 'three/tsl';

export const LUMA = vec3(0.2126, 0.7152, 0.0722);

export const maxColorComponent = /*@__PURE__*/ Fn(([value]) => {
  return max(value.r, max(value.g, value.b));
});

export const rgbToHsv = /*@__PURE__*/ Fn(([c]) => {
  const K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  const p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)).toVar();
  const q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)).toVar();
  const d = q.x.sub(min(q.w, q.y));
  const e = float(1.0e-10);
  return vec3(
    abs(q.z.add(q.w.sub(q.y).div(d.mul(6.0).add(e)))),
    d.div(q.x.add(e)),
    q.x,
  );
});

export const hsvToRgb = /*@__PURE__*/ Fn(([c]) => {
  const p = abs(fract(c.xxx.add(vec3(0.0, 2.0 / 3.0, 1.0 / 3.0))).mul(6.0).sub(3.0));
  return c.z.mul(mix(vec3(1.0), clamp(p.sub(1.0), 0.0, 1.0), c.y));
});

// GLSL applyHSVChange without the originalHSV out-param — callers that need
// the original HSV call rgbToHsv themselves.
export const applyHSVChange = /*@__PURE__*/ Fn(([color, hueOffset, saturationBoost, valueMul]) => {
  const hsv = rgbToHsv(max(color, vec3(0.0))).toVar();
  hsv.x.assign(fract(hsv.x.add(hueOffset)));
  hsv.y.assign(clamp(hsv.y.add(saturationBoost), 0.0, 1.0));
  hsv.z.mulAssign(valueMul);
  return hsvToRgb(hsv);
});

export const adjustSaturation = /*@__PURE__*/ Fn(([color, saturation]) => {
  const luma = dot(color, LUMA);
  const adjusted = mix(vec3(luma), color, max(saturation, 0.0));
  // GLSL early-outs when |saturation - 1| < 1e-4; same result via select.
  return select(abs(saturation.sub(1.0)).lessThan(0.0001), color, adjusted);
});
