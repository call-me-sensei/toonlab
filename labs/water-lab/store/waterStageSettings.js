// Ground-relative water settings for Water Lab. Presets describe a body of
// water, while Ground defines the local shoreline coordinate system. Keeping
// this pure makes the stage contract independently verifiable.

export const BEACH_RUNUP_DISTANCE = 10;
export const BEACH_WATER_LEVEL = 0.36;
export const BEACH_WAVE_SPEED = 0.35;
export const BEACH_DIRECTION_SPREAD = 0.18;

export const SHOREWARD_ORIENTATION = Object.freeze({
  // The beach rises on +Z, but real swell almost never meets it perfectly
  // square. This ~20 degree incidence gives the breaker a visible peel and
  // drives an oblique, still-connected swash lip.
  flowDirection: Object.freeze([0.34, 0.94]),
  waveDirection: Object.freeze([0.34, 0.94]),
});

export function waterStageOverrides(stage, baseSettings = {}) {
  if (stage === 'beach') {
    return {
      flowDirection: [...SHOREWARD_ORIENTATION.flowDirection],
      runupDistance: BEACH_RUNUP_DISTANCE,
      // beachBedHeight is calibrated around this rest line: the edge starts
      // at z=0, reaches z=10, then drains back across the same 10 m.
      waterLevel: BEACH_WATER_LEVEL,
      // About 2.2 s of uprush and 4.5 s of backwash for the Coast wavelength.
      waveSpeed: BEACH_WAVE_SPEED,
      waveDirection: [...SHOREWARD_ORIENTATION.waveDirection],
      waveDirectionSpread: BEACH_DIRECTION_SPREAD,
    };
  }
  if (stage === 'shore') {
    return {
      flowDirection: [...SHOREWARD_ORIENTATION.flowDirection],
      runupDistance: 0,
      ...(Number.isFinite(baseSettings.waterLevel)
        ? { waterLevel: baseSettings.waterLevel }
        : {}),
      ...(Number.isFinite(baseSettings.waveSpeed)
        ? { waveSpeed: baseSettings.waveSpeed }
        : {}),
      ...(Number.isFinite(baseSettings.waveDirectionSpread)
        ? { waveDirectionSpread: baseSettings.waveDirectionSpread }
        : {}),
      waveDirection: [...SHOREWARD_ORIENTATION.waveDirection],
    };
  }
  if (stage === 'open') {
    return {
      ...(baseSettings.flowDirection ? { flowDirection: [...baseSettings.flowDirection] } : {}),
      runupDistance: 0,
      ...(Number.isFinite(baseSettings.waterLevel)
        ? { waterLevel: baseSettings.waterLevel }
        : {}),
      ...(Number.isFinite(baseSettings.waveSpeed)
        ? { waveSpeed: baseSettings.waveSpeed }
        : {}),
      ...(Number.isFinite(baseSettings.waveDirectionSpread)
        ? { waveDirectionSpread: baseSettings.waveDirectionSpread }
        : {}),
      ...(baseSettings.waveDirection ? { waveDirection: [...baseSettings.waveDirection] } : {}),
    };
  }
  return {};
}
