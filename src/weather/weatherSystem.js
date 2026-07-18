import * as THREE from 'three';
import { Fn, uniform, vec4 } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { setEnvironmentCloudShadow } from '../environment/environmentShaderMaterials.js';
import { createWeatherPresetDocument, resolveWeatherSettings } from './weatherPresets.js';
import {
  createWeatherSettings,
  interpolateWeatherSettings,
  mergeWeatherSettings,
} from './weatherSettings.js';
import { WeatherPrecipitation } from './weatherPrecipitation.js';

const scratchCenter = new THREE.Vector3();
const scratchCamera = new THREE.Vector3();
const scratchRipple = new THREE.Vector3();

function resolveTarget(value) {
  return typeof value === 'function' ? value() : value;
}

function copySettings(settings) {
  return createWeatherSettings(settings);
}

function seededRandom(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weatheredColor(source, tint, darkening, desaturation) {
  const channels = Array.isArray(source) ? source : [source.r, source.g, source.b];
  const result = channels.map((value, index) => value * (tint[index] ?? 1) * (1 - darkening));
  const gray = result[0] * 0.299 + result[1] * 0.587 + result[2] * 0.114;
  return result.map((value) => value + (gray - value) * desaturation);
}

function snapshotSunRig(sunRig) {
  const light = sunRig?.light;
  if (!light) return null;
  const opacity = (mesh) => mesh?.material?.uniforms?.opacity?.value ?? null;
  return {
    beamOpacity: opacity(sunRig.beam),
    color: light.color.clone(),
    diskOpacity: opacity(sunRig.disk),
    intensity: light.intensity,
    shaftOpacity: opacity(sunRig.shaft),
    spillOpacity: opacity(sunRig.spill),
  };
}

function targetWorldPosition(target, output) {
  if (!target) return null;
  if (typeof target.getWorldPosition === 'function') return target.getWorldPosition(output);
  if (target.position) return output.copy(target.position);
  if (Number.isFinite(target.x)) return output.set(target.x, target.y ?? 0, target.z ?? 0);
  return null;
}

function createLightningFlash() {
  const uniforms = {
    uColor: uniform(new THREE.Color(0xb8ccff)),
    uIntensity: uniform(0),
  };
  const material = new NodeMaterial();
  material.name = 'WeatherLightningFlash';
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.lights = false;
  material.side = THREE.BackSide;
  material.fragmentNode = Fn(() => vec4(uniforms.uColor, uniforms.uIntensity))();
  material.uniforms = uniforms;

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 20, 12), material);
  mesh.name = 'Weather lightning flash';
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;
  mesh.intensity = 0;
  mesh.userData.environmentShaderExclude = true;
  mesh.userData.waterExclude = true;
  return mesh;
}

/**
 * Cross-system weather coordinator. It owns only precipitation and lightning;
 * every other visual response is applied through the existing public APIs.
 */
export class WeatherSystem extends THREE.EventDispatcher {
  constructor({
    ambientFx = null,
    camera = null,
    environmentRoot = null,
    fauna = null,
    flowers = null,
    followTarget = null,
    forest = null,
    grass = null,
    groundHeightAt = null,
    onLightning = null,
    onSurfaceChange = null,
    onThunder = null,
    precipitationFloorY = 0,
    preset = 'call_me_sensei',
    renderer = null,
    scene = null,
    seed = 1,
    setCloudShadow = null,
    settings = {},
    sky = null,
    sunRig = null,
    water = null,
  } = {}) {
    super();
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.followTarget = followTarget;
    this.environmentRoot = environmentRoot;
    this.targets = { ambientFx, fauna, flowers, forest, grass, sky, sunRig, water };
    this.groundHeightAt = typeof groundHeightAt === 'function' ? groundHeightAt : null;
    this.precipitationFloorY = Number(precipitationFloorY) || 0;
    this.setCloudShadowAdapter = typeof setCloudShadow === 'function' ? setCloudShadow : null;
    this.onSurfaceChange = typeof onSurfaceChange === 'function' ? onSurfaceChange : null;
    this.random = seededRandom(seed);
    this.root = new THREE.Group();
    this.root.name = 'WeatherSystem';
    this.root.userData.environmentShaderExclude = true;
    this.root.userData.waterExclude = true;

    this.currentPreset = preset;
    this.settings = resolveWeatherSettings(preset, settings);
    this.targetSettings = copySettings(this.settings);
    this.transition = null;
    this._dirty = true;
    this._rippleAccumulator = 0;
    this._lightningCountdown = 0;
    this._flashRemaining = 0;
    this._thunderQueue = [];

    const precipitation = new WeatherPrecipitation({
      maxParticles: this.settings.precipitation.maxParticles,
      seed,
      settings: this.settings.precipitation,
    });
    this.precipitation = precipitation;
    this.root.add(precipitation);

    // A camera-enclosing additive flash avoids mutating the scene-light
    // layout during a WebGPU submit. The public name stays `lightningLight`
    // for compatibility with the original coordinator API.
    this.lightningLight = createLightningFlash();
    this.root.add(this.lightningLight);

    this._originalFog = scene?.fog ?? null;
    this._baseFog = this._originalFog?.isFog
      ? { color: this._originalFog.color.clone(), far: this._originalFog.far, near: this._originalFog.near }
      : { color: new THREE.Color(0.72, 0.83, 0.94), far: 900, near: 180 };
    this._weatherFog = this._originalFog?.isFog
      ? this._originalFog
      : new THREE.Fog(this._baseFog.color.clone(), this._baseFog.near, this._baseFog.far);

    const skyTarget = resolveTarget(sky);
    this._baseSky = skyTarget?.settings ? structuredClone(skyTarget.settings) : null;
    this._baseSun = snapshotSunRig(resolveTarget(sunRig));
    const waterTarget = resolveTarget(water);
    this._baseWaterWaveIntensity = Number(waterTarget?.settings?.waveIntensity) || 0;
    this._ambientLights = new Map();
    scene?.traverse?.((object) => {
      if (object.isAmbientLight || object.isHemisphereLight) this._ambientLights.set(object, object.intensity);
    });

    if (onLightning) this.addEventListener('lightning', onLightning);
    if (onThunder) this.addEventListener('thunder', onThunder);
    scene?.add?.(this.root);
    this._applyFrame(this.settings);
  }

  get state() {
    return {
      preset: this.currentPreset,
      settings: copySettings(this.settings),
      transitioning: Boolean(this.transition),
      transitionProgress: this.transition
        ? Math.min(this.transition.elapsed / this.transition.duration, 1)
        : 1,
    };
  }

  setPreset(name, overrides = {}) {
    this.currentPreset = name;
    this.settings = resolveWeatherSettings(name, overrides);
    this.targetSettings = copySettings(this.settings);
    this.transition = null;
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  applySettings(overrides = {}, { duration = 0 } = {}) {
    const target = mergeWeatherSettings(this.settings, overrides);
    if (duration > 0) return this.transitionTo(target, { duration });
    this.currentPreset = null;
    this.settings = target;
    this.targetSettings = copySettings(target);
    this.transition = null;
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  transitionTo(presetOrSettings, { duration = 4, overrides = {} } = {}) {
    const target = typeof presetOrSettings === 'string'
      ? resolveWeatherSettings(presetOrSettings, overrides)
      : mergeWeatherSettings(createWeatherSettings(presetOrSettings), overrides);
    this.currentPreset = typeof presetOrSettings === 'string' ? presetOrSettings : null;
    this.targetSettings = target;
    const seconds = Math.max(Number(duration) || 0, 0);
    if (seconds === 0) {
      this.settings = copySettings(target);
      this.transition = null;
      this._applyFrame(this.settings);
      return this;
    }
    this.transition = { duration: seconds, elapsed: 0, from: copySettings(this.settings), to: copySettings(target) };
    return this;
  }

  setWeather(presetOrSettings, options) {
    return this.transitionTo(presetOrSettings, options);
  }

  refresh() {
    this._dirty = true;
    this._applyFrame(this.settings);
    return this;
  }

  _applyFrame(settings) {
    const atmosphere = settings.atmosphere;
    const wind = settings.wind;
    const sky = resolveTarget(this.targets.sky);
    if (sky?.applySettings && this._baseSky) {
      const zenith = weatheredColor(this._baseSky.zenithColor, atmosphere.skyTint, atmosphere.skyDarkening, atmosphere.skyDesaturation);
      const horizon = weatheredColor(this._baseSky.horizonColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.7, atmosphere.skyDesaturation);
      const ground = weatheredColor(this._baseSky.groundColor, atmosphere.skyTint, atmosphere.skyDarkening, atmosphere.skyDesaturation);
      const cloudColor = weatheredColor(this._baseSky.cloudColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.45, atmosphere.skyDesaturation);
      const cloudShadeColor = weatheredColor(this._baseSky.cloudShadeColor, atmosphere.skyTint, atmosphere.skyDarkening * 0.7, atmosphere.skyDesaturation);
      sky.applySettings({
        cloudColor,
        cloudCoverage: atmosphere.cloudCoverage,
        cloudShadeColor,
        cloudSpeed: this._baseSky.cloudSpeed * atmosphere.cloudSpeed,
        groundColor: ground,
        horizonColor: horizon,
        zenithColor: zenith,
      });
    }

    const sunRig = resolveTarget(this.targets.sunRig);
    if (sunRig?.light && this._baseSun) {
      const color = this._baseSun.color.clone();
      color.multiply(new THREE.Color(...atmosphere.sunTint));
      sunRig.setState?.({
        beamOpacity: this._baseSun.beamOpacity === null ? undefined : this._baseSun.beamOpacity * atmosphere.sunIntensity,
        color,
        diskOpacity: this._baseSun.diskOpacity === null ? undefined : this._baseSun.diskOpacity * atmosphere.sunIntensity,
        intensity: this._baseSun.intensity * atmosphere.sunIntensity,
        shaftOpacity: this._baseSun.shaftOpacity === null ? undefined : this._baseSun.shaftOpacity * atmosphere.sunIntensity,
        spillOpacity: this._baseSun.spillOpacity === null ? undefined : this._baseSun.spillOpacity * atmosphere.sunIntensity,
      });
    }
    for (const [light, intensity] of this._ambientLights) {
      light.intensity = intensity * atmosphere.ambientIntensity;
    }

    if (this.scene) {
      this.scene.fog = this._weatherFog;
      const color = atmosphere.fogColor
        ? new THREE.Color(...atmosphere.fogColor)
        : this._baseFog.color;
      this._weatherFog.color.copy(color);
      this._weatherFog.near = this._baseFog.near / atmosphere.fogRangeScale;
      this._weatherFog.far = this._baseFog.far / atmosphere.fogRangeScale;
    }

    const cloudShadow = {
      coverage: atmosphere.cloudShadowCoverage,
      scale: atmosphere.cloudShadowScale,
      strength: atmosphere.cloudShadowStrength,
      velocity: [
        wind.direction[0] * wind.speed * 0.012,
        wind.direction[1] * wind.speed * 0.012,
      ],
    };
    if (this.setCloudShadowAdapter) this.setCloudShadowAdapter(cloudShadow);
    else {
      setEnvironmentCloudShadow(cloudShadow);
      resolveTarget(this.targets.water)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.grass)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.forest)?.setCloudShadow?.(cloudShadow);
      resolveTarget(this.targets.fauna)?.setCloudShadow?.(cloudShadow);
    }

    resolveTarget(this.targets.grass)?.setWind?.({
      direction: wind.direction,
      gustFrequency: wind.gustFrequency,
      gustSpeed: wind.gustSpeed,
      speed: wind.speed,
      strength: wind.strength,
    });
    resolveTarget(this.targets.flowers)?.setWind?.({
      direction: wind.direction,
      speed: wind.speed,
      strength: wind.strength,
    });
    resolveTarget(this.targets.forest)?.applySettings?.({ foliage: {
      windDirection: wind.direction,
      windSpeed: wind.speed,
      windStrength: wind.strength,
    } });
    resolveTarget(this.targets.ambientFx)?.setWind?.({
      windDirection: wind.direction,
      windSpeed: wind.speed,
      windStrength: wind.strength,
    });

    const water = resolveTarget(this.targets.water);
    water?.applySettings?.({ waveIntensity: Math.min(this._baseWaterWaveIntensity + settings.surface.waterWaveBoost, 1) });
    this.precipitation.applySettings(settings.precipitation, wind);
    this.lightningLight.material.uniforms.uColor.value.setRGB(
      ...settings.lightning.color,
      THREE.SRGBColorSpace,
    );
    this.root.userData.weatherSurface = { ...settings.surface };
    this.onSurfaceChange?.({ ...settings.surface });
    this.dispatchEvent({ settings: copySettings(settings), type: 'change' });
    this._dirty = false;
  }

  _resolveCenter() {
    const target = resolveTarget(this.followTarget);
    const camera = resolveTarget(this.camera);
    const targetPosition = targetWorldPosition(target, scratchCenter);
    const cameraPosition = targetWorldPosition(camera, scratchCamera);
    const position = targetPosition ?? cameraPosition ?? scratchCenter.set(0, 0, 0);
    let floorY = targetPosition?.y ?? this.precipitationFloorY;
    if (this.groundHeightAt) floorY = Number(this.groundHeightAt(position.x, position.z)) || floorY;
    return scratchCenter.set(position.x, floorY, position.z);
  }

  _scheduleLightning() {
    const rate = this.settings.lightning.strikesPerMinute;
    if (!(rate > 0)) {
      this._lightningCountdown = Infinity;
      return;
    }
    this._lightningCountdown = (60 / rate) * (0.5 + this.random());
  }

  triggerLightning() {
    const lightning = this.settings.lightning;
    if (!lightning.enabled) return this;
    const center = this._resolveCenter();
    const angle = this.random() * Math.PI * 2;
    const distance = 60 + this.random() * 240;
    this.lightningLight.position.set(
      center.x + Math.cos(angle) * distance,
      center.y + 35 + this.random() * 80,
      center.z + Math.sin(angle) * distance,
    );
    this._flashRemaining = lightning.duration;
    const thunderDelay = Math.max(distance / 343, 0.08);
    const event = { distance, position: this.lightningLight.position.clone(), thunderDelay, type: 'lightning' };
    this.dispatchEvent(event);
    this._thunderQueue.push({ distance, remaining: thunderDelay });
    return this;
  }

  _updateLightning(delta) {
    const lightning = this.settings.lightning;
    if (lightning.enabled && lightning.strikesPerMinute > 0) {
      if (!Number.isFinite(this._lightningCountdown) || this._lightningCountdown <= 0) this._scheduleLightning();
      this._lightningCountdown -= delta;
      if (this._lightningCountdown <= 0) {
        this.triggerLightning();
        this._scheduleLightning();
      }
    } else {
      this._lightningCountdown = Infinity;
    }

    if (this._flashRemaining > 0) {
      this._flashRemaining = Math.max(this._flashRemaining - delta, 0);
      const phase = this._flashRemaining / Math.max(lightning.duration, 0.01);
      const stutter = Math.sin(phase * 42) > 0.15 ? 1 : 0.22;
      this.lightningLight.intensity = lightning.intensity * phase * phase * stutter;
    } else {
      this.lightningLight.intensity = 0;
    }
    this.lightningLight.material.uniforms.uIntensity.value = Math.min(
      this.lightningLight.intensity * 0.075,
      0.72,
    );

    for (let index = this._thunderQueue.length - 1; index >= 0; index -= 1) {
      const thunder = this._thunderQueue[index];
      thunder.remaining -= delta;
      if (thunder.remaining <= 0) {
        this.dispatchEvent({ distance: thunder.distance, type: 'thunder' });
        this._thunderQueue.splice(index, 1);
      }
    }
  }

  _updateWaterRipples(delta, center) {
    const water = resolveTarget(this.targets.water);
    const rate = this.settings.surface.waterRippleRate;
    if (!water?.addRipple || !(rate > 0)) return;
    this._rippleAccumulator += rate * delta;
    let count = Math.min(Math.floor(this._rippleAccumulator), 5);
    this._rippleAccumulator -= count;
    const radius = this.settings.precipitation.areaSize * 0.42;
    while (count > 0) {
      count -= 1;
      const angle = this.random() * Math.PI * 2;
      const distance = Math.sqrt(this.random()) * radius;
      scratchRipple.set(
        center.x + Math.cos(angle) * distance,
        water.position?.y ?? 0,
        center.z + Math.sin(angle) * distance,
      );
      water.addRipple(scratchRipple, {
        radius: 0.14 + this.random() * 0.2,
        strength: 0.12 + this.settings.precipitation.intensity * 0.2,
      });
    }
  }

  update(delta = 0.016) {
    const dt = Math.min(Math.max(Number(delta) || 0.016, 0), 0.1);
    if (this.transition) {
      this.transition.elapsed = Math.min(this.transition.elapsed + dt, this.transition.duration);
      const raw = this.transition.elapsed / this.transition.duration;
      const eased = raw * raw * (3 - 2 * raw);
      this.settings = interpolateWeatherSettings(this.transition.from, this.transition.to, eased);
      this._applyFrame(this.settings);
      if (raw >= 1) {
        this.settings = copySettings(this.transition.to);
        this.transition = null;
      }
    } else if (this._dirty) {
      this._applyFrame(this.settings);
    }
    const center = this._resolveCenter();
    this.precipitation.update(dt, { center, renderer: resolveTarget(this.renderer) });
    this._updateLightning(dt);
    this._updateWaterRipples(dt, center);
    return this;
  }

  toJSON({ id = this.currentPreset ?? 'custom-weather', label = 'Custom Weather' } = {}) {
    return createWeatherPresetDocument(id, { label, settings: this.targetSettings });
  }

  dispose() {
    this.precipitation.dispose();
    this.lightningLight.geometry.dispose();
    this.lightningLight.material.dispose();
    this.root.parent?.remove(this.root);
    if (this._originalFog?.isFog) {
      this._originalFog.color.copy(this._baseFog.color);
      this._originalFog.near = this._baseFog.near;
      this._originalFog.far = this._baseFog.far;
    }
    if (this.scene) this.scene.fog = this._originalFog;
    for (const [light, intensity] of this._ambientLights) light.intensity = intensity;
    const sunRig = resolveTarget(this.targets.sunRig);
    if (sunRig?.light && this._baseSun) {
      sunRig.setState?.({ color: this._baseSun.color, intensity: this._baseSun.intensity });
    }
    resolveTarget(this.targets.water)?.applySettings?.({ waveIntensity: this._baseWaterWaveIntensity });
  }
}

export function createWeatherSystem(options = {}) {
  return new WeatherSystem(options);
}
