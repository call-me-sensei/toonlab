// TSL port of src/shaders/chunks/water-waves.glsl — the Gerstner wave stack
// shared by the water vertex and fragment stages (and the breaker shells).
// Wave parameters are prebuilt on the CPU (buildGerstnerWaveUniforms in
// waterSettings.js) so the exact same spectrum can be evaluated in JS for
// buoyancy queries. Keep the math in sync with sampleGerstnerHeight.
//
// uWavesA[i] = (direction.x, direction.z, angularFrequency, waveNumber)
// uWavesB[i] = (amplitude, phaseOffset, steepness, crestWeight)
//
// Convention (docs/tsl-conventions.md): the wave count is a compile-time
// constant (the GLSL WATER_WAVE_COUNT define), so the chunk is a factory of
// plain JS composition functions whose loops unroll at graph-build time.
// The GLSL `i < 2 ? 1.0 : chopWeight` slot filter is a JS-side ternary per
// unrolled iteration — slots 0/1 (the dominant swell / set-beat pair) always
// pass at full strength, the shorter cross chop fades toward the surf zone.

import {
  clamp,
  cross,
  cos,
  dot,
  float,
  normalize,
  sin,
  vec3,
} from 'three/tsl';

export function createWaterWavesChunk({ wavesA, wavesB, waveCount }) {
  const count = Math.max(1, Math.trunc(waveCount));

  // vec3 displacement of the rest position; chopWeight ∈ [0,1] filters the
  // short cross-running components (1 = full open-water spectrum).
  const gerstnerDisplacementFiltered = (restXZ, time, chopWeight) => {
    const displacement = vec3(0.0).toVar();
    for (let i = 0; i < count; i += 1) {
      const a = wavesA.element(i).toVar();
      const b = wavesB.element(i).toVar();
      const direction = a.xy;
      const omega = a.z;
      const waveNumber = a.w;
      const amplitude = (i < 2 ? b.x : b.x.mul(chopWeight)).toVar();
      const phase = b.y;
      const steepness = b.z;
      const theta = waveNumber.mul(dot(direction, restXZ)).sub(omega.mul(time)).add(phase).toVar();
      const sinTheta = sin(theta);
      const cosTheta = cos(theta);
      displacement.y.addAssign(amplitude.mul(sinTheta));
      displacement.xz.addAssign(direction.mul(steepness.mul(amplitude).mul(cosTheta)));
    }
    return displacement;
  };

  const gerstnerDisplacement = (restXZ, time) => gerstnerDisplacementFiltered(restXZ, time, float(1.0));

  // Analytic surface frame at the rest position plus the 0..1 crest factor
  // used for whitecap foam (GLSL `out float crest` → returned alongside).
  const gerstnerNormalFiltered = (restXZ, time, chopWeight) => {
    const tangent = vec3(1.0, 0.0, 0.0).toVar();
    const bitangent = vec3(0.0, 0.0, 1.0).toVar();
    const crestSum = float(0.0).toVar();
    const crestTotal = float(1e-4).toVar();
    for (let i = 0; i < count; i += 1) {
      const a = wavesA.element(i).toVar();
      const b = wavesB.element(i).toVar();
      const direction = a.xy;
      const omega = a.z;
      const waveNumber = a.w;
      const amplitude = (i < 2 ? b.x : b.x.mul(chopWeight)).toVar();
      const phase = b.y;
      const steepness = b.z;
      const crestWeight = b.w;
      const theta = waveNumber.mul(dot(direction, restXZ)).sub(omega.mul(time)).add(phase).toVar();
      const sinTheta = sin(theta).toVar();
      const cosTheta = cos(theta).toVar();
      const waveKA = waveNumber.mul(amplitude).toVar();
      tangent.x.subAssign(steepness.mul(direction.x).mul(direction.x).mul(waveKA).mul(sinTheta));
      tangent.y.addAssign(direction.x.mul(waveKA).mul(cosTheta));
      tangent.z.subAssign(steepness.mul(direction.x).mul(direction.y).mul(waveKA).mul(sinTheta));
      bitangent.x.subAssign(steepness.mul(direction.x).mul(direction.y).mul(waveKA).mul(sinTheta));
      bitangent.y.addAssign(direction.y.mul(waveKA).mul(cosTheta));
      bitangent.z.subAssign(steepness.mul(direction.y).mul(direction.y).mul(waveKA).mul(sinTheta));
      const crestPeak = sinTheta.mul(0.5).add(0.5).toVar();
      crestSum.addAssign(crestWeight.mul(amplitude).mul(crestPeak).mul(crestPeak));
      crestTotal.addAssign(crestWeight.mul(amplitude));
    }
    return {
      crest: clamp(crestSum.div(crestTotal), 0.0, 1.0).toVar(),
      normal: normalize(cross(bitangent, tangent)).toVar(),
    };
  };

  const gerstnerNormal = (restXZ, time) => gerstnerNormalFiltered(restXZ, time, float(1.0));

  return {
    gerstnerDisplacement,
    gerstnerDisplacementFiltered,
    gerstnerNormal,
    gerstnerNormalFiltered,
  };
}
