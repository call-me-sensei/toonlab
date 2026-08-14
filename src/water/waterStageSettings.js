// Ground-relative water settings shared by Water Lab and host scenes. Water
// presets describe the body; this profile describes how that body meets an
// authored beach. Keeping it public prevents showcase scenes from copying or
// silently disabling the package's calibrated swash behavior.

export const BEACH_RUNUP_DISTANCE = 10;
export const BEACH_WATER_LEVEL = 0.36;
export const BEACH_WAVE_SPEED = 0.35;
export const BEACH_DIRECTION_SPREAD = 0.18;

export const SHOREWARD_ORIENTATION = Object.freeze({
  flowDirection: Object.freeze([0.34, 0.94]),
  waveDirection: Object.freeze([0.34, 0.94]),
});

export function waterStageOverrides(stage, baseSettings = {}) {
  if (stage === 'beach') {
    return {
      flowDirection: [...SHOREWARD_ORIENTATION.flowDirection],
      runupDistance: BEACH_RUNUP_DISTANCE,
      waterLevel: BEACH_WATER_LEVEL,
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
