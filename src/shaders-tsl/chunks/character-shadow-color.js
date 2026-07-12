// TSL port of src/shaders/chunks/character-fragment-shadow-color.glsl —
// the tinted/HSV-shifted albedo used inside shadow areas.

import { abs, clamp, max, mix, vec3 } from 'three/tsl';

import { adjustSaturation, applyHSVChange, rgbToHsv } from './character-color.js';

export function createShadowColorChunk({ u }) {
  const calculateShadowColor = (albedo, finalShadowArea) => {
    const transitionArea = clamp(
      abs(finalShadowArea.sub(0.5)).mul(2.0).oneMinus().mul(u.litToShadowTransitionAreaIntensity),
      0.0,
      1.0,
    );
    const hueOffset = u.selfShadowAreaHueOffset.mul(u.selfShadowAreaHSVStrength)
      .add(u.litToShadowTransitionAreaHueOffset.mul(transitionArea));
    const saturationBoost = u.selfShadowAreaSaturationBoost.mul(u.selfShadowAreaHSVStrength)
      .add(u.litToShadowTransitionAreaSaturationBoost.mul(transitionArea));
    const valueMul = mix(1.0, u.selfShadowAreaValueMul, u.selfShadowAreaHSVStrength)
      .mul(mix(1.0, u.litToShadowTransitionAreaValueMul, transitionArea));

    const originalHSV = rgbToHsv(max(albedo, vec3(0.0)));
    const result = applyHSVChange(albedo, hueOffset, saturationBoost, valueMul).toVar();

    const fallbackColor = albedo.mul(u.lowSaturationFallbackColor.rgb);
    const fallbackMask = mix(1.0, clamp(originalHSV.y.mul(5.0), 0.0, 1.0), u.lowSaturationFallbackColor.a);
    result.assign(mix(fallbackColor, result, fallbackMask));

    result.mulAssign(u.selfShadowTintColor);
    result.mulAssign(mix(vec3(1.0), u.litToShadowTransitionAreaTintColor, transitionArea));

    // Skin/face overrides (uniform-mixed like the GLSL branches — isSkin and
    // isFace are per-material constants carried as uniforms).
    const skinShadow = adjustSaturation(
      albedo.mul(u.skinShadowTintColor).mul(u.skinShadowTintColor2).mul(u.skinShadowBrightness),
      u.skinShadowSaturation,
    );
    result.assign(mix(
      result,
      mix(result, skinShadow, u.overrideBySkinShadowTintColor),
      u.isSkin.select(1.0, 0.0),
    ));

    const faceShadow = adjustSaturation(
      albedo.mul(u.faceShadowTintColor).mul(u.faceShadowTintColor2).mul(u.faceShadowBrightness),
      u.faceShadowSaturation,
    );
    result.assign(mix(
      result,
      mix(result, faceShadow, u.overrideByFaceShadowTintColor),
      u.isFace.select(1.0, 0.0),
    ));

    result.assign(mix(result, result.mul(albedo), u.selfShadowAlbedoMulStrength));

    // enableShadowColor=false → plain albedo (GLSL early return).
    return mix(albedo, result, u.enableShadowColor.select(1.0, 0.0));
  };

  return { calculateShadowColor };
}
