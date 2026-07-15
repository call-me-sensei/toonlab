// Water settings/schema/preset-document verification — the contracts the
// standalone Water Lab builds on: the field schema covers the defaults, the
// grouped schema plugs into SchemaGroup, preset documents round-trip, and
// registration feeds the preset picker. Run: node scripts/verify-watergen.mjs

import process from 'node:process';

import {
  DEFAULT_WATER_SETTINGS,
  WATER_COLOR_TONES,
  WATER_PRESET_NAMES,
  WATER_SETTING_FIELD_SCHEMA,
  WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
  WATER_SETTING_GROUPS,
  buildGerstnerWaves,
  computeBreakingDepth,
  createWaterPresetDocument,
  createWaterSettings,
  extractBreakLineChains,
  getWaterPresetOptions,
  parseWaterPresetDocument,
  registerSerializedWaterPreset,
  sampleGerstnerSwellHeight,
  samplePrimarySwellCycle,
  samplePrimarySwellSequence,
  sampleSwashCycleVariation,
  sampleSwashDistance,
  sampleSwashEdgeOffset,
  sanitizeWaterPresetSettings,
  serializeWaterPreset,
  shapeSwashProgress,
  shouldUseDedicatedBreakerShell,
  validateWaterPresetDocument,
} from '../src/water/index.js';
import { beachBedHeight } from '../labs/water-lab/engine/waterLabEngine.js';
import {
  BEACH_DIRECTION_SPREAD,
  BEACH_RUNUP_DISTANCE,
  BEACH_WATER_LEVEL,
  BEACH_WAVE_SPEED,
  waterStageOverrides,
} from '../labs/water-lab/store/waterStageSettings.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- schema coverage -----------------------------------------------------------
const schemaKeys = Object.keys(WATER_SETTING_FIELD_SCHEMA);
check('schema is substantial (≥ 70 fields)', schemaKeys.length >= 70, `${schemaKeys.length}`);
check('every schema key has a default value',
  schemaKeys.every((key) => DEFAULT_WATER_SETTINGS[key] !== undefined),
  schemaKeys.filter((key) => DEFAULT_WATER_SETTINGS[key] === undefined).join(', '));

const groupIds = new Set(WATER_SETTING_GROUPS.map((group) => group.id));
check('every schema field belongs to a declared group',
  schemaKeys.every((key) => groupIds.has(WATER_SETTING_FIELD_SCHEMA[key].group)));
const groupedKeys = Object.values(WATER_SETTING_FIELD_SCHEMA_BY_GROUP)
  .flatMap((fields) => Object.keys(fields));
check('grouped schema covers the full flat schema',
  groupedKeys.length === schemaKeys.length && groupedKeys.every((key) => WATER_SETTING_FIELD_SCHEMA[key]));
check('grouped schema only uses declared group ids',
  Object.keys(WATER_SETTING_FIELD_SCHEMA_BY_GROUP).every((id) => groupIds.has(id)));
check('number fields carry a complete range',
  schemaKeys.every((key) => {
    const field = WATER_SETTING_FIELD_SCHEMA[key];
    if (field.type !== 'number') return true;
    return Number.isFinite(field.range?.min) && Number.isFinite(field.range?.max) && field.range.step > 0;
  }));

// --- presets resolve -------------------------------------------------------------
for (const name of WATER_PRESET_NAMES) {
  const settings = createWaterSettings({ preset: name });
  check(`preset '${name}' resolves through createWaterSettings`, settings.preset === name);
}
check('preset picker lists the built-ins',
  WATER_PRESET_NAMES.every((name) => getWaterPresetOptions().some((option) => option.id === name)));

// --- tone override contract (the lab disables these fields in the UI) ---------------
const tealTone = WATER_COLOR_TONES.teal;
const teal = createWaterSettings({ colorTone: 'teal', shallowColor: [1, 0, 0] });
check('non-classic tone forces its palette over explicit values',
  deepEqual(teal.shallowColor, tealTone.shallowColor));
const classic = createWaterSettings({ colorTone: 'classic', shallowColor: [1, 0, 0] });
check('classic tone leaves explicit colors alone', deepEqual(classic.shallowColor, [1, 0, 0]));

// --- sanitize + document round-trips -----------------------------------------------
const sanitized = sanitizeWaterPresetSettings(DEFAULT_WATER_SETTINGS);
check('sanitize covers every schema key from the defaults',
  schemaKeys.every((key) => sanitized[key] !== undefined));
check('sanitize drops preset/mode identity keys',
  sanitized.preset === undefined && sanitized.mode === undefined);
check('sanitize round-trips', deepEqual(sanitizeWaterPresetSettings(sanitized), sanitized));

const custom = sanitizeWaterPresetSettings(createWaterSettings({
  preset: 'ocean',
  colorTone: 'lagoon',
  waveAmplitude: 1.7,
  waveDirection: [0.2, -0.9],
}));
const document = createWaterPresetDocument('verify_suite_water', {
  description: 'verify-watergen round-trip preset',
  label: 'Verify Suite Water',
  settings: custom,
});
check('document creation normalizes type/version/id',
  document.type === 'toonlab/water-preset' && document.version === 1 && document.id === 'verify_suite_water');
const serialized = serializeWaterPreset(document);
const parsed = parseWaterPresetDocument(serialized);
check('serialize → parse round-trips ok', parsed.ok, parsed.errors.join(' '));
check('round-tripped settings are deep-equal', deepEqual(parsed.value.settings, custom));
check('round-tripped label/description survive',
  parsed.value.label === 'Verify Suite Water' && parsed.value.description.includes('round-trip'));

// --- registration feeds the picker ---------------------------------------------------
const registered = registerSerializedWaterPreset(serialized);
check('registerSerializedWaterPreset returns the preset id', registered.id === 'verify_suite_water');
check('registered preset appears in the picker options',
  getWaterPresetOptions().some((option) => option.id === 'verify_suite_water'));
const resolved = createWaterSettings({ preset: 'verify_suite_water' });
check('registered preset resolves with its settings',
  Math.abs(resolved.waveAmplitude - 1.7) < 1e-9 && resolved.colorTone === 'lagoon');

// --- legacy / loose document shapes ----------------------------------------------------
const legacy = validateWaterPresetDocument({
  name: 'Legacy Shape',
  waveIntensity: 0.9,
  normalStrength: 0.5, // legacy alias for detailNormalStrength
});
check('legacy loose document migrates + validates', legacy.ok, legacy.errors.join(' '));
check('legacy alias keys resolve to canonical names',
  legacy.ok && legacy.value.settings.detailNormalStrength === 0.5);
const invalid = parseWaterPresetDocument('{not json');
check('invalid JSON reports errors without throwing', !invalid.ok && invalid.errors.length > 0);

// --- vector fields (the SchemaField vector2/vector3 contract) ---------------------------
const vectorFields = schemaKeys.filter((key) => ['vector2', 'vector3'].includes(WATER_SETTING_FIELD_SCHEMA[key].type));
check('vector fields exist (waveDirection/flowDirection/sunDirection)', vectorFields.length === 3, vectorFields.join(', '));
check('vector defaults are plain numeric arrays',
  vectorFields.every((key) => Array.isArray(DEFAULT_WATER_SETTINGS[key]) && DEFAULT_WATER_SETTINGS[key].every(Number.isFinite)));

// --- Water Lab ground-relative shoreline contract -------------------------------
const oceanBase = createWaterSettings({ preset: 'ocean' });
const oceanBeach = createWaterSettings({ ...oceanBase, ...waterStageOverrides('beach', oceanBase) });
check('beach ground forces the documented 10 m run-up contract',
  oceanBeach.runupDistance === BEACH_RUNUP_DISTANCE
    && oceanBeach.waterLevel === BEACH_WATER_LEVEL
    && oceanBeach.waveSpeed === BEACH_WAVE_SPEED
    && oceanBeach.waveDirectionSpread === BEACH_DIRECTION_SPREAD);
check('beach ground orients Ocean swell shoreward at an oblique angle',
  oceanBeach.waveDirection[1] > 0.8
    && oceanBeach.flowDirection[1] > 0.8
    && Math.abs(oceanBeach.waveDirection[0]) > 0.2
    && Math.abs(oceanBeach.flowDirection[0]) > 0.2);
const reopenedOcean = createWaterSettings({ ...oceanBeach, ...waterStageOverrides('open', oceanBase) });
check('returning to open ground restores the preset direction and disables explicit run-up',
  deepEqual(reopenedOcean.waveDirection, oceanBase.waveDirection)
    && deepEqual(reopenedOcean.flowDirection, oceanBase.flowDirection)
    && reopenedOcean.waterLevel === oceanBase.waterLevel
    && reopenedOcean.waveSpeed === oceanBase.waveSpeed
    && reopenedOcean.waveDirectionSpread === oceanBase.waveDirectionSpread
    && reopenedOcean.runupDistance === 0);

const swellProbe = [
  { amplitude: 2, dirX: 0, dirZ: 1, omega: 0, phase: Math.PI / 2, waveNumber: 1 },
  { amplitude: 1, dirX: 0, dirZ: 1, omega: 0, phase: Math.PI / 2, waveNumber: 0.5 },
  { amplitude: 99, dirX: 1, dirZ: 0, omega: 0, phase: Math.PI / 2, waveNumber: 4 },
];
check('swash signal uses only the two surf-surviving swell slots',
  Math.abs(sampleGerstnerSwellHeight(swellProbe, 0, 0, 0) - 3) < 1e-9);

const phaseProbe = [
  { amplitude: 0.2, dirX: 0, dirZ: 1, omega: 2, phase: Math.PI / 2, waveNumber: 1 },
  { amplitude: 999, dirX: 1, dirZ: 0, omega: 0, phase: 0, waveNumber: 9 },
];
const eventPeaks = Array.from({ length: 32 }, (_, index) => sampleSwashDistance(
  phaseProbe,
  (index + 0.34) * Math.PI,
  BEACH_RUNUP_DISTANCE,
));
const eventRundowns = Array.from({ length: 32 }, (_, index) => sampleSwashDistance(
  phaseProbe,
  (index + 0.999999) * Math.PI,
  BEACH_RUNUP_DISTANCE,
));
check('explicit swash varies ordinary 10 m peaks over a bounded 8–10 m range',
  Math.min(...eventPeaks) >= 8 - 1e-9
    && Math.max(...eventPeaks) <= 10 + 1e-9
    && Math.max(...eventPeaks) - Math.min(...eventPeaks) > 0.7);
check('successive swash events share one continuous rundown/uprush boundary',
  Array.from({ length: 12 }, (_, index) => {
    const boundary = (index + 1) * Math.PI;
    return Math.abs(
      sampleSwashDistance(phaseProbe, boundary - 1e-7, BEACH_RUNUP_DISTANCE)
      - sampleSwashDistance(phaseProbe, boundary + 1e-7, BEACH_RUNUP_DISTANCE),
    ) < 1e-4;
  }).every(Boolean));
check('rundown endpoints vary around the still-water shoreline',
  Math.min(...eventRundowns) >= -0.91
    && Math.max(...eventRundowns) <= 0.36
    && Math.max(...eventRundowns) - Math.min(...eventRundowns) > 0.35);
check('swash sequence and variation expose the event used by the renderer',
  samplePrimarySwellSequence(phaseProbe, Math.PI * 4.2).index === 4
    && sampleSwashCycleVariation(4).runupScale >= 0.8
    && sampleSwashCycleVariation(4).runupScale <= 1);
check('oblique swash retains an alongshore arrival lag at nominal endpoints',
  sampleSwashEdgeOffset(-8, 0, 0, 0.34) > sampleSwashEdgeOffset(8, 0, 0, 0.34)
    && sampleSwashEdgeOffset(-8, 0, 1, 0.34) > sampleSwashEdgeOffset(8, 0, 1, 0.34)
    && sampleSwashEdgeOffset(0, 7.3, 0.63, 0.34) === 0);
check('swash timing reserves more of each wave cycle for backwash than uprush',
  shapeSwashProgress(0.17) > 0.45
    && shapeSwashProgress(0.67) > 0.45);

check('the measured 20 m beach is a monotonic 1:20 plane from z=-10 to z=10',
  Math.abs(beachBedHeight(0, -10) + 0.14) < 1e-9
    && Math.abs(beachBedHeight(0, 0) - 0.36) < 1e-9
    && Math.abs(beachBedHeight(0, 10) - 0.86) < 1e-9
    && Math.abs(beachBedHeight(8, 4) - beachBedHeight(-8, 4)) < 1e-9);

const coastBeach = createWaterSettings({
  preset: 'coast',
  ...waterStageOverrides('beach', createWaterSettings({ preset: 'coast' })),
});
const coastWaves = buildGerstnerWaves(coastBeach);
const coastEnergy = coastWaves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0);
const coastBreakDepth = computeBreakingDepth(coastBeach, coastEnergy);
const coastBreakLines = extractBreakLineChains({
  bedSampler: beachBedHeight,
  breakDepth: coastBreakDepth,
  depth: 40,
  originX: 0,
  originZ: 0,
  surfaceY: coastBeach.waterLevel,
  waveDirX: coastWaves[0].dirX,
  waveDirZ: coastWaves[0].dirZ,
  width: 40,
});
check('shoreward Coast swell produces a continuous beach-facing break line',
  coastBreakLines.length > 0
    && coastBreakLines.some((chain) => chain.length >= 20)
    && coastBreakLines.flat().every((point) => point.facing > 0.25));
check('explicit beach swash uses the welded heightfield breaker, not a detached shell',
  !shouldUseDedicatedBreakerShell(coastBeach, true)
    && shouldUseDedicatedBreakerShell(createWaterSettings({ preset: 'coast', runupDistance: 0 }), true));

if (failures > 0) {
  console.error(`\nverify-watergen: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nverify-watergen: all checks passed');
