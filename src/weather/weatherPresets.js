import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import {
  createWeatherSettings,
  mergeWeatherSettings,
} from './weatherSettings.js';

export const WEATHER_PRESET_DOCUMENT_TYPE = 'toonlab/weather-preset';
export const WEATHER_PRESET_SCHEMA_VERSION = 1;

const DEFINITIONS = new Map();

function registerBuiltIn(id, label, description, settings) {
  DEFINITIONS.set(id, Object.freeze({ description, label, settings: createWeatherSettings(settings) }));
}

registerBuiltIn('clear', 'Clear', 'Bright sky, light breeze, and sparse cloud shadows.', {
  atmosphere: { cloudCoverage: 0.08, cloudShadowStrength: 0.08 },
});

registerBuiltIn('call_me_sensei', 'Call Me Sensei', 'Studio-managed signature weather: vivid sky, painterly moving clouds, and a cohesive world breeze.', {
  atmosphere: { cloudCoverage: 0.42, cloudShadowCoverage: 0.45, cloudShadowStrength: 0.35, skyDarkening: 0, skyDesaturation: 0 },
  wind: { direction: [1, 0.3], gustFrequency: 0.42, gustSpeed: 1.2, speed: 1, strength: 0.18 },
});

registerBuiltIn('partlyCloudy', 'Partly Cloudy', 'Broken cloud cover with moving pools of sunlight.', {
  atmosphere: { cloudCoverage: 0.48, cloudShadowCoverage: 0.48, cloudShadowStrength: 0.45, sunIntensity: 0.86 },
  wind: { speed: 1.25, strength: 0.22 },
});

registerBuiltIn('cloudy', 'Cloudy', 'Cool, soft daylight under broad cloud cover.', {
  atmosphere: { ambientIntensity: 1.05, cloudCoverage: 0.68, cloudShadowCoverage: 0.62, cloudShadowStrength: 0.55, skyDesaturation: 0.3, sunIntensity: 0.68 },
  wind: { speed: 1.35, strength: 0.24 },
});

registerBuiltIn('overcast', 'Overcast', 'Flat, diffuse light with dense gray cloud and closer haze.', {
  atmosphere: { ambientIntensity: 1.08, cloudCoverage: 0.92, cloudShadowStrength: 0, fogColor: [0.64, 0.7, 0.76], fogRangeScale: 1.55, skyDarkening: 0.18, skyDesaturation: 0.66, sunIntensity: 0.38 },
  wind: { speed: 1.2, strength: 0.2 },
});

registerBuiltIn('haze', 'Haze', 'Warm suspended haze that softens long sightlines without precipitation.', {
  atmosphere: { cloudCoverage: 0.22, fogColor: [0.82, 0.79, 0.7], fogRangeScale: 1.8, skyDesaturation: 0.25, skyTint: [1, 0.94, 0.82], sunIntensity: 0.82 },
  surface: { wetness: 0 },
});

registerBuiltIn('mist', 'Mist', 'Low-contrast humid air with gentle cloud and almost no wind.', {
  atmosphere: { ambientIntensity: 1.08, cloudCoverage: 0.55, cloudShadowStrength: 0.12, fogColor: [0.76, 0.84, 0.88], fogRangeScale: 2.4, skyDesaturation: 0.38, sunIntensity: 0.58 },
  wind: { speed: 0.45, strength: 0.06 },
  surface: { wetness: 0.18 },
});

registerBuiltIn('fog', 'Dense Fog', 'Dense visibility-limiting fog with muted sun and nearly still air.', {
  atmosphere: { ambientIntensity: 1.12, cloudCoverage: 0.72, cloudShadowStrength: 0, fogColor: [0.7, 0.76, 0.78], fogRangeScale: 4.8, skyDarkening: 0.16, skyDesaturation: 0.72, sunIntensity: 0.22 },
  wind: { speed: 0.25, strength: 0.03 },
  surface: { wetness: 0.22 },
});

registerBuiltIn('windy', 'High Wind', 'Fast-moving broken clouds and strong gust response without precipitation.', {
  atmosphere: { cloudCoverage: 0.5, cloudShadowStrength: 0.5, cloudSpeed: 2.4, sunIntensity: 0.82 },
  wind: { gustFrequency: 0.72, gustSpeed: 3.4, speed: 3.4, strength: 0.72 },
  surface: { waterWaveBoost: 0.28 },
});

registerBuiltIn('drizzle', 'Drizzle', 'Fine light rain under a cool, soft sky.', {
  atmosphere: { cloudCoverage: 0.82, cloudShadowStrength: 0.18, fogColor: [0.63, 0.71, 0.78], fogRangeScale: 1.55, skyDesaturation: 0.52, sunIntensity: 0.48 },
  precipitation: { intensity: 0.28, opacity: 0.34, speed: 10, streakLength: 0.2, type: 'rain' },
  surface: { waterRippleRate: 2, wetness: 0.45 },
  wind: { speed: 0.9, strength: 0.14 },
});

registerBuiltIn('rain', 'Rain', 'Steady rain with dim light, wet surfaces, and active water ripples.', {
  atmosphere: { cloudCoverage: 0.94, cloudShadowStrength: 0, fogColor: [0.53, 0.62, 0.7], fogRangeScale: 2.05, skyDarkening: 0.24, skyDesaturation: 0.72, sunIntensity: 0.28 },
  precipitation: { intensity: 0.68, opacity: 0.52, speed: 17, streakLength: 0.45, type: 'rain' },
  surface: { waterRippleRate: 7, waterWaveBoost: 0.08, wetness: 0.8 },
  wind: { speed: 1.5, strength: 0.28 },
});

registerBuiltIn('heavyRain', 'Heavy Rain', 'Dense wind-driven rain and rough water under a dark sky.', {
  atmosphere: { ambientIntensity: 0.96, cloudCoverage: 1, cloudShadowStrength: 0, fogColor: [0.42, 0.5, 0.58], fogRangeScale: 2.7, skyDarkening: 0.38, skyDesaturation: 0.82, skyTint: [0.82, 0.9, 1], sunIntensity: 0.16 },
  precipitation: { areaSize: 52, intensity: 1, opacity: 0.62, speed: 22, streakLength: 0.66, type: 'rain' },
  surface: { waterRippleRate: 14, waterWaveBoost: 0.25, wetness: 1 },
  wind: { gustFrequency: 0.8, gustSpeed: 3.2, speed: 2.8, strength: 0.58 },
});

registerBuiltIn('thunderstorm', 'Thunderstorm', 'Heavy rain, severe gusts, rough water, lightning flashes, and thunder events.', {
  atmosphere: { ambientIntensity: 0.9, cloudCoverage: 1, cloudShadowStrength: 0, fogColor: [0.34, 0.4, 0.5], fogRangeScale: 3.2, skyDarkening: 0.56, skyDesaturation: 0.86, skyTint: [0.72, 0.8, 1], sunIntensity: 0.08 },
  lightning: { enabled: true, intensity: 7, strikesPerMinute: 7 },
  precipitation: { areaSize: 58, intensity: 1, opacity: 0.68, speed: 25, streakLength: 0.8, type: 'rain' },
  surface: { waterRippleRate: 18, waterWaveBoost: 0.52, wetness: 1 },
  wind: { gustFrequency: 1.1, gustSpeed: 4.5, speed: 4, strength: 0.9 },
});

registerBuiltIn('tropicalStorm', 'Tropical Storm', 'Warm torrential rain, extreme wind, dense cloud, and frequent lightning.', {
  atmosphere: { ambientIntensity: 0.96, cloudCoverage: 1, cloudSpeed: 2.2, cloudShadowStrength: 0, fogColor: [0.38, 0.48, 0.5], fogRangeScale: 3.4, skyDarkening: 0.48, skyDesaturation: 0.72, skyTint: [0.72, 0.92, 0.9], sunIntensity: 0.1 },
  lightning: { enabled: true, intensity: 6.5, strikesPerMinute: 5 },
  precipitation: { areaSize: 64, intensity: 1, opacity: 0.7, speed: 27, streakLength: 0.9, type: 'rain' },
  surface: { waterRippleRate: 20, waterWaveBoost: 0.7, wetness: 1 },
  wind: { direction: [1, 0.8], gustFrequency: 1.3, gustSpeed: 5.2, speed: 5.5, strength: 1.25 },
});

registerBuiltIn('snow', 'Snow', 'Gentle snow with quiet wind, cool diffuse light, and early accumulation.', {
  atmosphere: { ambientIntensity: 1.08, cloudCoverage: 0.78, cloudShadowStrength: 0.08, fogColor: [0.78, 0.84, 0.9], fogRangeScale: 1.7, skyDesaturation: 0.42, skyTint: [0.88, 0.94, 1], sunIntensity: 0.56 },
  precipitation: { color: [0.94, 0.97, 1], intensity: 0.52, opacity: 0.82, size: 0.2, speed: 1.35, type: 'snow' },
  surface: { snowCover: 0.45, wetness: 0.15 },
  wind: { speed: 0.7, strength: 0.12 },
});

registerBuiltIn('heavySnow', 'Heavy Snow', 'Dense snowfall, reduced visibility, and deep accumulation.', {
  atmosphere: { ambientIntensity: 1.04, cloudCoverage: 0.96, cloudShadowStrength: 0, fogColor: [0.72, 0.78, 0.84], fogRangeScale: 2.8, skyDarkening: 0.2, skyDesaturation: 0.72, skyTint: [0.84, 0.91, 1], sunIntensity: 0.3 },
  precipitation: { areaSize: 52, color: [0.94, 0.97, 1], intensity: 0.95, opacity: 0.9, size: 0.24, speed: 1.8, type: 'snow' },
  surface: { snowCover: 0.9, wetness: 0.2 },
  wind: { speed: 1.3, strength: 0.28 },
});

registerBuiltIn('blizzard', 'Blizzard', 'Wind-driven snow, whiteout fog, severe gusts, and icy surfaces.', {
  atmosphere: { ambientIntensity: 1.06, cloudCoverage: 1, cloudSpeed: 2.5, cloudShadowStrength: 0, fogColor: [0.78, 0.82, 0.84], fogRangeScale: 5.5, skyDarkening: 0.28, skyDesaturation: 0.9, skyTint: [0.82, 0.9, 1], sunIntensity: 0.14 },
  precipitation: { areaSize: 62, color: [0.94, 0.97, 1], intensity: 1, opacity: 0.92, size: 0.22, speed: 3.2, type: 'snow' },
  surface: { ice: 0.6, snowCover: 1, wetness: 0.08 },
  wind: { direction: [1, 0.7], gustFrequency: 1.25, gustSpeed: 5, speed: 5.2, strength: 1.2 },
});

registerBuiltIn('sleet', 'Sleet', 'Mixed ice pellets and rain with sharp wind and slick surfaces.', {
  atmosphere: { cloudCoverage: 0.98, cloudShadowStrength: 0, fogColor: [0.58, 0.66, 0.74], fogRangeScale: 2.5, skyDarkening: 0.3, skyDesaturation: 0.76, sunIntensity: 0.22 },
  precipitation: { color: [0.82, 0.9, 0.98], intensity: 0.84, opacity: 0.7, size: 0.1, speed: 10, streakLength: 0.26, type: 'sleet' },
  surface: { ice: 0.35, snowCover: 0.18, waterRippleRate: 8, wetness: 0.88 },
  wind: { speed: 2.4, strength: 0.48 },
});

registerBuiltIn('freezingRain', 'Freezing Rain', 'Cold rain that produces heavy wetness and rapid surface icing.', {
  atmosphere: { cloudCoverage: 1, cloudShadowStrength: 0, fogColor: [0.52, 0.61, 0.7], fogRangeScale: 2.4, skyDarkening: 0.32, skyDesaturation: 0.82, sunIntensity: 0.18 },
  precipitation: { color: [0.76, 0.88, 1], intensity: 0.82, opacity: 0.62, speed: 19, streakLength: 0.54, type: 'rain' },
  surface: { ice: 0.9, waterRippleRate: 9, wetness: 1 },
  wind: { speed: 1.7, strength: 0.32 },
});

registerBuiltIn('hail', 'Hail', 'Fast ice pellets, hard impacts, storm light, and rough water.', {
  atmosphere: { ambientIntensity: 0.96, cloudCoverage: 1, cloudShadowStrength: 0, fogColor: [0.44, 0.52, 0.6], fogRangeScale: 2.7, skyDarkening: 0.44, skyDesaturation: 0.82, sunIntensity: 0.12 },
  lightning: { enabled: true, intensity: 5, strikesPerMinute: 3 },
  precipitation: { color: [0.88, 0.94, 1], intensity: 0.9, opacity: 0.88, size: 0.16, speed: 18, type: 'hail' },
  surface: { ice: 0.2, waterRippleRate: 16, waterWaveBoost: 0.28, wetness: 0.75 },
  wind: { gustFrequency: 0.9, gustSpeed: 3.8, speed: 3.3, strength: 0.68 },
});

registerBuiltIn('dustStorm', 'Dust Storm', 'Airborne earth, hot haze, strong wind, and severely reduced visibility.', {
  atmosphere: { ambientIntensity: 0.9, cloudCoverage: 0.72, cloudShadowStrength: 0.12, fogColor: [0.58, 0.42, 0.27], fogRangeScale: 4.3, skyDarkening: 0.36, skyDesaturation: 0.5, skyTint: [1, 0.7, 0.45], sunIntensity: 0.3 },
  precipitation: { color: [0.68, 0.45, 0.24], intensity: 0.82, opacity: 0.34, size: 0.32, speed: 2.4, type: 'dust' },
  wind: { direction: [1, 0.45], gustFrequency: 1, gustSpeed: 4.2, speed: 4.8, strength: 1.1 },
});

registerBuiltIn('sandstorm', 'Sandstorm', 'Extreme wind-driven sand and near-whiteout amber atmosphere.', {
  atmosphere: { ambientIntensity: 0.88, cloudCoverage: 0.84, cloudShadowStrength: 0, fogColor: [0.65, 0.46, 0.25], fogRangeScale: 6.2, skyDarkening: 0.46, skyDesaturation: 0.62, skyTint: [1, 0.62, 0.3], sunIntensity: 0.16 },
  precipitation: { areaSize: 64, color: [0.78, 0.54, 0.26], intensity: 1, opacity: 0.42, size: 0.38, speed: 3.2, type: 'dust' },
  wind: { direction: [1, 0.65], gustFrequency: 1.4, gustSpeed: 5.8, speed: 6.4, strength: 1.55 },
});

const ALIASES = Object.freeze({
  storm: 'thunderstorm',
  snowy: 'snow',
  rainy: 'rain',
  cloudyDay: 'cloudy',
  clearDay: 'clear',
});

export function normalizeWeatherPresetName(name) {
  const requested = String(name ?? '').trim();
  const id = ALIASES[requested] ?? requested;
  return DEFINITIONS.has(id) ? id : 'call_me_sensei';
}

export function getWeatherPresetOptions() {
  return Array.from(DEFINITIONS.entries()).map(([id, definition]) => ({
    description: definition.description,
    id,
    label: definition.label,
  }));
}

export function resolveWeatherPreset(name) {
  const id = normalizeWeatherPresetName(name);
  const definition = DEFINITIONS.get(id);
  return {
    description: definition.description,
    id,
    label: definition.label,
    settings: createWeatherSettings(definition.settings),
  };
}

export function registerWeatherPreset(name, definition = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('Weather preset name is required.');
  if (!overwrite && DEFINITIONS.has(id)) throw new Error(`Weather preset "${id}" already exists.`);
  const source = definition && typeof definition === 'object' ? definition : {};
  const settings = source.settings ?? source;
  DEFINITIONS.set(id, Object.freeze({
    description: String(source.description ?? ''),
    label: String(source.label ?? id),
    settings: createWeatherSettings(settings),
  }));
  return { description: String(source.description ?? ''), id, label: String(source.label ?? id) };
}

function migrateWeatherDocument(document) {
  return {
    ...document,
    type: document.type ?? WEATHER_PRESET_DOCUMENT_TYPE,
    version: Number(document.version ?? document.schemaVersion ?? WEATHER_PRESET_SCHEMA_VERSION),
  };
}

export function validateWeatherPresetDocument(input) {
  return validateSettingsPresetDocument(input, {
    documentType: WEATHER_PRESET_DOCUMENT_TYPE,
    migrateDocument: migrateWeatherDocument,
    normalizeId: (id) => String(id ?? '').trim(),
    sanitizeSettings: createWeatherSettings,
    schemaVersion: WEATHER_PRESET_SCHEMA_VERSION,
  });
}

export function parseWeatherPresetDocument(input) {
  return parsePresetDocument(input, validateWeatherPresetDocument, { invalidJsonLabel: 'weather preset' });
}

export function createWeatherPresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => createWeatherSettings(source.settings ?? source),
    documentType: WEATHER_PRESET_DOCUMENT_TYPE,
    schemaVersion: WEATHER_PRESET_SCHEMA_VERSION,
    validateDocument: validateWeatherPresetDocument,
  });
}

export function serializeWeatherPresetDocument(idOrDocument, definition = {}, pretty = true) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createWeatherPresetDocument,
    pretty,
  });
}

export function registerWeatherPresetDocument(input, { overwrite = false } = {}) {
  const result = parseWeatherPresetDocument(input);
  if (!result.ok) return result;
  const { id, ...definition } = result.value;
  registerWeatherPreset(id, definition, { overwrite });
  return result;
}

/** Resolves a preset and merges developer overrides over it. */
export function resolveWeatherSettings(preset = 'call_me_sensei', overrides = {}) {
  return mergeWeatherSettings(resolveWeatherPreset(preset).settings, overrides);
}

