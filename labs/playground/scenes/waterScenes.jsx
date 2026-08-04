// The stylized water-scene stage pieces: the Water Lab HUD, the water surface
// wiring, floaters/sinkers, sky/horizon backdrops, the sea stage (seabed,
// rocks, islands, fish, scan props, bench sit), rain, kelp, and the
// underwater atmosphere swap.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, ConvexHullCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';

import { loadModelAsset } from '../../../src/character/modelLoader.js';
import { applyEnvironmentShader } from '../../../src/environment/environmentMaterialAdapter.js';
import { createRockDocument, meshDocument } from '../../../src/rockgen/index.js';
import { syncFoliageFog } from '../../../src/shaders-tsl/chunks/foliage-fog.js';
import { StylizedSky } from '../../../src/sky/stylizedSky.js';
import {
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '../../../src/toon/toonMaterialAdapter.js';
import {
  createWaterSettings,
  sanitizeWaterPresetSettings,
  WATER_COLOR_TONE_NAMES,
  WATER_DEBUG_MODES,
  WATER_PRESET_NAMES,
} from '../../../src/water/waterSettings.js';
import { WaterSurface } from '../../../src/water/waterSurface.js';
import { WaterRain } from '../../../src/water/waterRain.js';
import { WaterKelpField } from '../../../src/water/waterVegetation.js';
import {
  CHARACTER_MODEL_OPTIONS,
  navigateSceneHub,
  navigateToCharacterModel,
  normalizeModelPath,
  SCENE_HUB_OPTIONS,
} from '../../shared/sceneHub.js';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { modelLabelFromUrl } from '../hud.js';
import {
  BODY_CENTER_AT_REST,
  MODEL_URL,
  SEA_BED_CENTER_Z,
  WATER_SURFACE_CENTER_Z,
  WATER_SURFACE_SIZE_X,
  WATER_SURFACE_SIZE_Z,
} from '../params.js';
import { collectEnvironmentTrimesh } from './indoorScene.jsx';
import {
  GRASSY_LAND_TEXTURE,
  LAND_TEXTURE,
  MOUNTAIN_TEXTURE,
  ROCK_TEXTURE,
  SAND_TEXTURE,
  TOON_GRADIENT_MAP,
  WATER_ENVIRONMENT_PRESETS,
  WATER_ENVIRONMENT_PRESET_NAMES,
  cloudShadowSettingsFor,
  createSeaBedGeometry,
  createSeaBedOverlayGeometry,
  seaBedHeight,
  toonMaterial,
} from './stage.js';
import {
  applyBroadleafEnvironment,
  createBroadleafTreeInstance,
} from './toonlabBroadleaf.js';

// Fab-licensed props live in the gitignored assets-local/ tree, so they are
// runtime URLs, never bundler imports — a clone without them must still build.
// Root-absolute: this page is served from /playground/, so page-relative
// paths would resolve into the SPA fallback.
const nordicBeachRocksUrl = '/assets-local/environments/assets/nordic_beach_rocks_ulznddxva_mid.glb';
const woodenTableUrl = '/assets-local/environments/assets/wooden_table_ulzrcgoaw_mid.glb';

function formatWaterValue(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function WaterHud({ cameraMode = 'follow', debugMode, envPreset, onCameraModeChange, onDebugModeChange, onDropBall, onDropSinker, onEnvPresetChange, onSettingsChange, settings }) {
  const sceneHubId = 'waterPlayground';
  const sceneHubLabel = SCENE_HUB_OPTIONS.find((option) => option.id === sceneHubId)?.label || 'Water Playground';

  // Round trip with the standalone Water Lab: carry the live settings over so
  // in-scene tweaks keep editing from where they left off.
  const editInWaterLab = useCallback(() => {
    setLabHandoff('water-lab-import', {
      preset: settings.mode ?? null,
      settings: sanitizeWaterPresetSettings(settings),
    });
    window.location.href = '/water-lab/';
  }, [settings]);
  const updateSetting = useCallback((key, value) => {
    if (key === 'mode') {
      // Fresh preset load, re-tinted by the active environment preset. The
      // chosen color tone survives the reload.
      const environment = WATER_ENVIRONMENT_PRESETS[envPreset];
      onSettingsChange(createWaterSettings({
        mode: value,
        ...(environment?.water ?? {}),
        colorTone: settings.colorTone,
      }));
      return;
    }

    if (key === 'colorTone') {
      // Drop the palette values the previous tone forced, then rebuild with
      // the environment tint so 'classic' returns to the preset/env colors.
      const {
        shallowColor, midColor, deepColor,
        depthFadeDistance, deepFadeDistance, fresnelColor,
        fresnelBias, reflectionStrength, reflectionSoftness, causticsStrength,
        detailNormalStrength,
        ...rest
      } = settings;
      const environment = WATER_ENVIRONMENT_PRESETS[envPreset];
      onSettingsChange(createWaterSettings({
        ...rest,
        ...(environment?.water ?? {}),
        colorTone: value,
      }));
      return;
    }

    onSettingsChange(createWaterSettings({
      ...settings,
      [key]: value,
    }));
  }, [envPreset, onSettingsChange, settings]);

  return (
    <div className="water-hud">
      <div className="water-hud-title">Water Lab</div>
      <div className="water-hud-grid">
        <label htmlFor="waterSceneHub">Scene</label>
        <select
          id="waterSceneHub"
          value={sceneHubId}
          onChange={(event) => navigateSceneHub(event.target.value)}
        >
          {SCENE_HUB_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <output htmlFor="waterSceneHub">{sceneHubLabel}</output>

        <label htmlFor="waterModel">Model</label>
        <select
          id="waterModel"
          value={CHARACTER_MODEL_OPTIONS.find((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL))?.model ?? MODEL_URL}
          onChange={(event) => navigateToCharacterModel(event.target.value)}
        >
          {CHARACTER_MODEL_OPTIONS.map((option) => (
            <option key={option.model} value={option.model}>{option.label}</option>
          ))}
          {!CHARACTER_MODEL_OPTIONS.some((option) => normalizeModelPath(option.model) === normalizeModelPath(MODEL_URL)) && (
            <option value={MODEL_URL}>{`Custom: ${modelLabelFromUrl(MODEL_URL)}`}</option>
          )}
        </select>
        <output htmlFor="waterModel">{modelLabelFromUrl(MODEL_URL)}</output>

        <label htmlFor="waterMode">Mode</label>
        <select
          id="waterMode"
          value={settings.mode}
          onChange={(event) => updateSetting('mode', event.target.value)}
        >
          {WATER_PRESET_NAMES.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
          {!WATER_PRESET_NAMES.includes(settings.mode) && (
            <option value={settings.mode}>{settings.mode}</option>
          )}
        </select>
        <output htmlFor="waterMode">{settings.mode}</output>

        <label htmlFor="waterTone">Tone</label>
        <select
          id="waterTone"
          value={settings.colorTone}
          onChange={(event) => updateSetting('colorTone', event.target.value)}
        >
          {WATER_COLOR_TONE_NAMES.map((tone) => (
            <option key={tone} value={tone}>{tone}</option>
          ))}
        </select>
        <output htmlFor="waterTone">{settings.colorTone}</output>

        <label htmlFor="waterEnv">Env</label>
        <select
          id="waterEnv"
          value={envPreset}
          onChange={(event) => onEnvPresetChange(event.target.value)}
        >
          {WATER_ENVIRONMENT_PRESET_NAMES.map((name) => (
            <option key={name} value={name}>{WATER_ENVIRONMENT_PRESETS[name].label}</option>
          ))}
        </select>
        <output htmlFor="waterEnv">{envPreset}</output>

        <label htmlFor="waterCamera">Camera</label>
        <select
          id="waterCamera"
          value={cameraMode}
          onChange={(event) => onCameraModeChange?.(event.target.value)}
        >
          <option value="follow">Follow (3rd person)</option>
          <option value="free">Free (pan / zoom)</option>
        </select>
        <output htmlFor="waterCamera">{cameraMode} · V</output>

        <label htmlFor="waterIntensity">Intensity</label>
        <input
          id="waterIntensity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.waveIntensity}
          onChange={(event) => updateSetting('waveIntensity', Number(event.target.value))}
        />
        <output htmlFor="waterIntensity">{formatWaterValue(settings.waveIntensity)}</output>

        <label htmlFor="waterBreakers">Breakers</label>
        <input
          id="waterBreakers"
          type="checkbox"
          checked={settings.breakerEnabled !== false}
          onChange={(event) => updateSetting('breakerEnabled', event.target.checked)}
        />
        <output htmlFor="waterBreakers">{settings.breakerEnabled !== false ? 'on' : 'off'}</output>

        <label htmlFor="waterSurf">Surf</label>
        <input
          id="waterSurf"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.breakerAmount}
          onChange={(event) => updateSetting('breakerAmount', Number(event.target.value))}
        />
        <output htmlFor="waterSurf">{formatWaterValue(settings.breakerAmount)}</output>

        <label htmlFor="waterHeight">Height</label>
        <input
          id="waterHeight"
          type="range"
          min="0.05"
          max="5"
          step="0.05"
          value={settings.waveAmplitude}
          onChange={(event) => updateSetting('waveAmplitude', Number(event.target.value))}
        />
        <output htmlFor="waterHeight">{formatWaterValue(settings.waveAmplitude)}</output>

        <label htmlFor="waterSets">Sets</label>
        <input
          id="waterSets"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.waveSetStrength}
          onChange={(event) => updateSetting('waveSetStrength', Number(event.target.value))}
        />
        <output htmlFor="waterSets">{formatWaterValue(settings.waveSetStrength)}</output>

        <label htmlFor="waterSetTime">Set Time</label>
        <input
          id="waterSetTime"
          type="range"
          min="10"
          max="300"
          step="5"
          value={settings.waveSetPeriod}
          onChange={(event) => updateSetting('waveSetPeriod', Number(event.target.value))}
        />
        <output htmlFor="waterSetTime">{Math.round(settings.waveSetPeriod)}s</output>

        <label htmlFor="waterCurl">Curl</label>
        <input
          id="waterCurl"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.breakerCurl}
          onChange={(event) => updateSetting('breakerCurl', Number(event.target.value))}
        />
        <output htmlFor="waterCurl">{formatWaterValue(settings.breakerCurl)}</output>

        <label htmlFor="waterLevel">Level</label>
        <input
          id="waterLevel"
          type="range"
          min="0.12"
          max="0.68"
          step="0.01"
          value={settings.waterLevel}
          onChange={(event) => updateSetting('waterLevel', Number(event.target.value))}
        />
        <output htmlFor="waterLevel">{formatWaterValue(settings.waterLevel)}</output>

        <label htmlFor="waterSplash">Splash</label>
        <input
          id="waterSplash"
          type="range"
          min="0"
          max="2.5"
          step="0.05"
          value={settings.splashStrength}
          onChange={(event) => updateSetting('splashStrength', Number(event.target.value))}
        />
        <output htmlFor="waterSplash">{formatWaterValue(settings.splashStrength)}</output>

        <label htmlFor="waterFlowSpeed">Flow</label>
        <input
          id="waterFlowSpeed"
          type="range"
          min="0"
          max="1.25"
          step="0.01"
          value={settings.flowSpeed}
          onChange={(event) => updateSetting('flowSpeed', Number(event.target.value))}
        />
        <output htmlFor="waterFlowSpeed">{formatWaterValue(settings.flowSpeed)}</output>

        <label htmlFor="waterFoam">Foam</label>
        <input
          id="waterFoam"
          type="range"
          min="0"
          max="1.2"
          step="0.01"
          value={settings.foamAmount}
          onChange={(event) => updateSetting('foamAmount', Number(event.target.value))}
        />
        <output htmlFor="waterFoam">{formatWaterValue(settings.foamAmount)}</output>

        <label htmlFor="waterReflection">Reflect</label>
        <input
          id="waterReflection"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.reflectionStrength}
          onChange={(event) => updateSetting('reflectionStrength', Number(event.target.value))}
        />
        <output htmlFor="waterReflection">{formatWaterValue(settings.reflectionStrength)}</output>

        <label htmlFor="waterDamping">Damping</label>
        <input
          id="waterDamping"
          type="range"
          min="0.94"
          max="0.998"
          step="0.001"
          value={settings.rippleDamping}
          onChange={(event) => updateSetting('rippleDamping', Number(event.target.value))}
        />
        <output htmlFor="waterDamping">{formatWaterValue(settings.rippleDamping, 3)}</output>

        <label htmlFor="waterImpulse">Impulse</label>
        <input
          id="waterImpulse"
          type="range"
          min="0.1"
          max="2.5"
          step="0.01"
          value={settings.rippleStrength}
          onChange={(event) => updateSetting('rippleStrength', Number(event.target.value))}
        />
        <output htmlFor="waterImpulse">{formatWaterValue(settings.rippleStrength)}</output>

        <label htmlFor="waterDebug">Debug</label>
        <select
          id="waterDebug"
          value={debugMode}
          onChange={(event) => onDebugModeChange(event.target.value)}
        >
          {Object.keys(WATER_DEBUG_MODES).map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
        </select>
        <output htmlFor="waterDebug">{debugMode}</output>
      </div>
      <div className="water-drop-buttons">
        <button className="water-drop-button" type="button" onClick={onDropBall}>Drop Ball</button>
        <button className="water-sinker-button" type="button" onClick={onDropSinker}>Drop Sinker</button>
        <button className="water-drop-button" type="button" onClick={editInWaterLab}>Edit in Water Lab</button>
      </div>
    </div>
  );
}

function WaterSurfaceView({ controllerRef, debugMode, envPreset, settings, swimStateRef, waterApiRef }) {
  const { camera, gl, scene } = useThree();
  const water = useMemo(() => {
    const surface = new WaterSurface({
      width: WATER_SURFACE_SIZE_X,
      depth: WATER_SURFACE_SIZE_Z,
      segmentsPerMeter: 2.2,
      maxSegments: 420,
      simulation: { resolution: 320, worldSize: 30 },
      // Shoaling: waves flatten over the rising seabed instead of clipping
      // through the beach, islands, and grass line at high intensity.
      bedHeight: seaBedHeight,
      ...settings,
    });
    // Draw the water early in the transparent pass: after the seabed splat
    // overlays (-2/-1) but before character materials (0+). The water writes
    // depth, so alpha-blended hair (depthWrite off) drawn later still wins
    // where it is closer — otherwise the shoreline swash film paints its foam
    // over heads that overlap the waterline — while submerged parts keep
    // failing the depth test and show through refraction instead.
    surface.renderOrder = -0.5;
    return surface;
  }, []);

  useEffect(() => () => water.dispose(), [water]);

  useEffect(() => {
    water.applySettings(settings);
    water.position.set(0, settings.waterLevel, WATER_SURFACE_CENTER_Z);
    document.body.dataset.waterMode = settings.mode;
    document.body.dataset.waterLevel = settings.waterLevel.toFixed(3);
  }, [water, settings]);

  useEffect(() => {
    water.setDebugMode(debugMode);
  }, [water, debugMode]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    water.setCloudShadow(cloudShadowSettingsFor(environment));
  }, [water, envPreset]);

  useEffect(() => {
    const interactorId = water.addInteractor((out) => {
      const body = controllerRef.current?.group;
      if (!body?.translation) return out.set(0, -1e6, 0);
      const position = body.translation();
      // Standing: track the shins. Swimming: the body is prone, track its
      // center so a diver's capsule head can't fake surface contact.
      const swimming = swimStateRef?.current?.swimming;
      return out.set(
        position.x,
        swimming ? position.y : position.y - BODY_CENTER_AT_REST + 0.24,
        position.z,
      );
    }, {
      radius: 0.34,
      // Pose-dependent extent: shin-to-head while wading, a slim prone band
      // while swimming — wakes fire only when the waterline crosses the body.
      height: () => {
        const swim = swimStateRef?.current;
        if (!swim?.swimming) return 1.4;
        return swim.diving ? 0.18 : 0.35;
      },
      splashStrength: 0.85,
      onSplash: () => {
        document.body.dataset.waterSplashCount =
          String(Number(document.body.dataset.waterSplashCount || 0) + 1);
      },
    });
    water.setFollowTarget((out) => {
      const body = controllerRef.current?.group;
      if (!body?.translation) return null;
      const position = body.translation();
      return out.set(position.x, position.y, position.z);
    });
    return () => {
      water.removeInteractor(interactorId);
      water.setFollowTarget(null);
    };
  }, [controllerRef, water]);

  useEffect(() => {
    if (!waterApiRef) return undefined;
    waterApiRef.current = {
      contains: (worldX, worldZ) => water.containsPoint(worldX, worldZ),
      getHeightAt: (worldX, worldZ) => water.getHeightAt(worldX, worldZ),
      // Horizontal surf push (m/s): the surge of a breaking wave passing
      // this point. Applied to floating bodies and the swimmer.
      getFlowAt: (worldX, worldZ) => water.getFlowAt(worldX, worldZ, flowScratch),
      // Rest waterline (no wave motion) — mode decisions gate on this so surf
      // rolling over a depth threshold can't flap swim mode on and off.
      getLevel: () => water.position.y,
      injectWorld: (worldX, worldZ, options = {}) => {
        water.addRipple({ x: worldX, z: worldZ }, options);
      },
      splashWorld: (worldX, worldY, worldZ, options = {}) => {
        water.splash({ x: worldX, y: worldY, z: worldZ }, options);
      },
    };
    document.body.dataset.waterReady = 'true';
    return () => {
      if (waterApiRef.current) waterApiRef.current = null;
      document.body.dataset.waterReady = 'false';
    };
  }, [water, waterApiRef]);

  useFrame((_, delta) => {
    water.update(gl, scene, camera, delta);
  });

  return <primitive object={water} />;
}

const flowScratch = new THREE.Vector2();

function WaterBall({ ball, settings, waterApiRef }) {
  const bodyRef = useRef(null);
  const hasImpactedWaterRef = useRef(false);
  const previousYRef = useRef(ball.position[1]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const position = body.translation();
    const velocity = body.linvel();
    // Follow the animated Gerstner height so balls bob on the swell.
    const waterSurfaceY = waterApiRef.current?.getHeightAt?.(position.x, position.z) ??
      settings.waterLevel;
    const impactHeight = waterSurfaceY + ball.radius * 0.32;
    const isSinker = ball.kind === 'sinker';

    if (previousYRef.current > impactHeight && position.y <= impactHeight && velocity.y < -0.2) {
      const impactStrength = isSinker
        ? Math.min(2.4, 0.95 + Math.abs(velocity.y) * 0.28)
        : Math.min(1.4, 0.35 + Math.abs(velocity.y) * 0.16);
      waterApiRef.current?.splashWorld?.(position.x, waterSurfaceY, position.z, {
        radius: ball.radius * (isSinker ? 2.6 : 1.6),
        strength: impactStrength * (isSinker ? 1 : 0.4),
      });
      if (isSinker && !hasImpactedWaterRef.current) {
        hasImpactedWaterRef.current = true;
      }
      document.body.dataset.waterSplashCount = String(Number(document.body.dataset.waterSplashCount || 0) + 1);
      document.body.dataset.waterLastBallImpact = `${position.x.toFixed(2)},${position.z.toFixed(2)}`;
    }

    // Surf push: drag steers the ball toward the local water flow (the surge
    // of a passing breaker) instead of plain zero, so waves carry floaters
    // shoreward and even shove dense sinkers along the bed a little.
    const flow = waterApiRef.current?.getFlowAt?.(position.x, position.z);
    const flowX = flow?.x ?? 0;
    const flowZ = flow?.y ?? 0;

    if (!isSinker && position.y < waterSurfaceY + ball.radius && typeof body.applyImpulse === 'function') {
      const depth = Math.min(1.2, waterSurfaceY + ball.radius - position.y);
      body.applyImpulse({
        x: (flowX - velocity.x) * 0.004,
        y: depth * 0.045 * delta * 60 - velocity.y * 0.003,
        z: (flowZ - velocity.z) * 0.004,
      }, true);
    }

    if (isSinker && position.y < waterSurfaceY + ball.radius && typeof body.applyImpulse === 'function') {
      body.applyImpulse({
        x: (flowX * 0.45 - velocity.x) * 0.0025,
        y: -0.012 * delta * 60,
        z: (flowZ * 0.45 - velocity.z) * 0.0025,
      }, true);
    }

    previousYRef.current = position.y;
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders="ball"
      ccd
      canSleep={false}
      position={ball.position}
      restitution={ball.kind === 'sinker' ? 0.06 : 0.28}
      friction={0.72}
      gravityScale={ball.kind === 'sinker' ? 1.65 : 1}
      linearDamping={ball.kind === 'sinker' ? 0.06 : 0.18}
      angularDamping={ball.kind === 'sinker' ? 0.16 : 0.08}
    >
      <mesh castShadow receiveShadow userData={{ skipWaterReflection: true }}>
        <sphereGeometry args={[ball.radius, 32, 16]} />
        <meshStandardMaterial
          color={ball.color}
          roughness={ball.kind === 'sinker' ? 0.34 : 0.54}
          metalness={ball.kind === 'sinker' ? 0.28 : 0.02}
        />
      </mesh>
    </RigidBody>
  );
}

function StylizedSkyView({ envPreset }) {
  const { camera } = useThree();
  const sky = useMemo(() => new StylizedSky({ radius: 96 }), []);

  useEffect(() => () => sky.dispose(), [sky]);

  useEffect(() => {
    sky.applySettings(WATER_ENVIRONMENT_PRESETS[envPreset]?.sky ?? {});
  }, [sky, envPreset]);

  useFrame((_, delta) => {
    sky.update(delta, camera);
  });

  return <primitive object={sky} />;
}

// Layered flat skyline silhouettes ringing the scene — the painterly
// backdrop approach stylized games use for distant terrain. Each band is a
// strip whose top edge traces a procedural ridge; nearer bands are darker,
// farther bands melt into the horizon haze. Scene fog is intentionally off:
// the haze is painted into the layer colors so silhouettes stay visible.
function buildHorizonRidgeGeometry({ radius = 200, amplitude = 18, seed = 1, segments = 240 }) {
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const base = 0.16 +
      0.34 * Math.sin(angle * 3 + seed) +
      0.24 * Math.sin(angle * 7 + seed * 2.1) +
      0.18 * Math.sin(angle * 12 + seed * 4.7) +
      0.09 * Math.sin(angle * 23 + seed * 9.3);
    const height = Math.max(0.03, base) * amplitude;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    vertices.push(x, height, z, x, -5, z);
    uvs.push(i / segments, 1, i / segments, 0);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const HORIZON_LAYERS = [
  { radius: 150, amplitude: 26, seed: 3.7, haze: 0.42 },
  { radius: 200, amplitude: 34, seed: 1.2, haze: 0.62 },
  { radius: 255, amplitude: 44, seed: 8.4, haze: 0.78 },
];

function HorizonSilhouettes({ envPreset }) {
  const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
  const geometries = useMemo(() => HORIZON_LAYERS.map((layer) => buildHorizonRidgeGeometry(layer)), []);
  const materials = useMemo(() => HORIZON_LAYERS.map(() => new THREE.MeshBasicMaterial({
    map: MOUNTAIN_TEXTURE,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  })), []);

  useEffect(() => {
    const ridgeTone = new THREE.Color('#48708c');
    const hazeTone = new THREE.Color(environment.fog.color);
    materials.forEach((material, index) => {
      material.color.copy(ridgeTone).lerp(hazeTone, HORIZON_LAYERS[index].haze);
    });
  }, [environment, materials]);

  useEffect(() => {
    return () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    };
  }, [geometries, materials]);

  return (
    <group position={[0, 0, 40]}>
      {HORIZON_LAYERS.map((layer, index) => (
        <mesh key={'horizon-' + index} geometry={geometries[index]} material={materials[index]} renderOrder={-40 + index} />
      ))}
    </group>
  );
}

const RIM_ROCK_A_POSITION = [8.6, seaBedHeight(8.6, -2.6) + 0.16, -2.6];
const RIM_ROCK_B_POSITION = [-9.8, seaBedHeight(-9.8, -3.8) + 0.2, -3.8];

const ROCK_HULL_VERTICES = (() => {
  const base = new THREE.IcosahedronGeometry(1, 1);
  const vertices = Float32Array.from(base.attributes.position.array);
  base.dispose();
  return vertices;
})();

function scaledRockHull(scale) {
  const vertices = new Float32Array(ROCK_HULL_VERTICES.length);
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] = ROCK_HULL_VERTICES[i] * scale[0];
    vertices[i + 1] = ROCK_HULL_VERTICES[i + 1] * scale[1];
    vertices[i + 2] = ROCK_HULL_VERTICES[i + 2] * scale[2];
  }
  return vertices;
}

const SEA_ROCKS = [
  // Emergent rocks near the shallows: foam rings form around their waterline.
  { position: [2.9, 0.14, 4.6], scale: [0.85, 0.72, 0.7], color: 0x8fa3ad, collider: 0.7 },
  { position: [-3.6, 0.02, 3.6], scale: [0.62, 0.58, 0.54], color: 0x97a8b0, collider: 0.5 },
  { position: [5.8, -0.08, 7.4], scale: [1.15, 0.9, 0.95], color: 0x8a9ca6, collider: 0.9 },
  // Submerged rocks at increasing depth: clarity / refraction reference.
  { position: [1.3, -0.3, 5.8], scale: [0.66, 0.46, 0.56], color: 0x86979f },
  { position: [-1.6, -0.5, 7.0], scale: [0.9, 0.6, 0.76], color: 0x7d8e96 },
  { position: [-5.2, -0.35, 5.6], scale: [0.72, 0.48, 0.58], color: 0x87989f },
];

// Converts a mounted subtree to the project's anime-style environment
// shader (wrapped lighting, sky tint, scene shadow mask) — the same adapter
// used for loaded FBX scenes, here running over the procedural stage.
function useEnvironmentShaderOn(groupRef, label) {
  useEffect(() => {
    let cancelled = false;
    const root = groupRef.current;
    if (!root) return undefined;
    applyEnvironmentShader(root, {
      // Outdoor sun mode: full lighting influence, no shadow lift, and the
      // adapter re-enables cast/receiveShadow on converted meshes.
      hasSun: true,
      // The stage has no alpha-card foliage; without this, the 'tree' in the
      // trunk texture filename classifies trunks as foliage and the cutout
      // discards their dark bark texels. Likewise 'grass' in the grassy-land
      // texture filename would classify the terrain splat overlay as a cutout
      // and binarize its soft vertex-alpha blend mask into a hard edge.
      features: { foliageCutout: false, alphaCutout: false },
      parameters: {
        ambientStrength: 0.42,
        shadowTintColor: [0.74, 0.78, 0.88],
      },
    })
      .then((report) => {
        if (cancelled) return;
        document.body.dataset[label + 'EnvShader'] = 'true';
        console.log('Environment shader applied to ' + label, report);
      })
      .catch((error) => console.warn('Environment shader failed for ' + label + ':', error));
    return () => { cancelled = true; };
  }, [groupRef, label]);
}

function WaterBroadleafTree({
  animationIntensity = 0.45,
  animationPreset = 'none',
  barkTextureId = 'oak',
  canopyColor = null,
  collidable = true,
  envPreset,
  leafShape = 'teardrop',
  position,
  presetId = 'example_branching',
  rotation = 0,
  seedOffset = 0,
  sizeScale = 1,
  windSpeedScale = 1,
  windStrengthScale = 1,
  woodDetails = null,
}) {
  const scene = useThree((state) => state.scene);
  const px = position?.[0] ?? 0;
  const py = position?.[1] ?? 0;
  const pz = position?.[2] ?? 0;
  const woodDetailsKey = woodDetails
    ? `${woodDetails.knots ?? 0}:${woodDetails.scars ?? 0}`
    : '';
  const instance = useMemo(
    () => createBroadleafTreeInstance({
      animationIntensity,
      animationPreset,
      barkTextureId,
      canopyColor,
      leafShape,
      presetId,
      seedOffset,
      sizeScale,
      windSpeedScale,
      windStrengthScale,
      woodDetails,
    }),
    [
      animationIntensity,
      animationPreset,
      barkTextureId,
      canopyColor,
      leafShape,
      presetId,
      seedOffset,
      sizeScale,
      windSpeedScale,
      windStrengthScale,
      woodDetailsKey,
    ],
  );
  const { recipe } = instance;
  const tree = useMemo(() => {
    instance.tree.position.set(px, py, pz);
    instance.tree.rotation.y = rotation;
    return instance.tree;
  }, [instance, px, py, pz, rotation]);
  const colliderSize = tree.settings?.tree?.size ?? recipe.options?.size ?? 1;

  useEffect(() => () => tree.dispose(), [tree]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    applyBroadleafEnvironment(tree, environment, {
      cloudShadow: cloudShadowSettingsFor(environment),
    });
  }, [envPreset, tree]);

  useFrame((_, delta) => {
    tree.update(delta);
    tree.userData.leafParticles?.update(delta);
    syncFoliageFog(tree.canopyMesh?.material, scene.fog);
  });

  return (
    <>
      <primitive object={tree} />
      {collidable && (
        <RigidBody type="fixed" colliders={false} position={[px, py, pz]} rotation={[0, rotation, 0]}>
          <CapsuleCollider args={[0.55 * colliderSize, 0.22 * colliderSize]} position={[0, 0.78 * colliderSize, 0]} />
        </RigidBody>
      )}
    </>
  );
}

function scaleVector3(scale) {
  if (Array.isArray(scale)) return [scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1];
  return [scale, scale, scale];
}

function trimeshFromGeometry(geometry, scale = 1) {
  const [sx, sy, sz] = scaleVector3(scale);
  const position = geometry.getAttribute('position');
  const minY = geometry.boundingBox?.min.y ?? 0;
  const vertices = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    vertices[i * 3] = position.getX(i) * sx;
    vertices[i * 3 + 1] = (position.getY(i) - minY) * sy;
    vertices[i * 3 + 2] = position.getZ(i) * sz;
  }
  const indices = geometry.index
    ? new Uint32Array(geometry.index.array)
    : Uint32Array.from({ length: position.count }, (_, index) => index);
  return { indices, vertices };
}

function ErodedMesaRock({
  position,
  rotation = 0,
  scale = [1.35, 1.1, 1.25],
}) {
  const groupRef = useRef(null);
  useEnvironmentShaderOn(groupRef, 'erodedMesa');
  const document = useMemo(() => createRockDocument({ preset: 'eroded-mesa', seed: 11671 }), []);
  const geometry = useMemo(() => meshDocument(document), [document]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true }), []);
  const meshOffsetY = -(geometry.boundingBox?.min.y ?? 0) * scaleVector3(scale)[1];
  const trimesh = useMemo(() => trimeshFromGeometry(geometry, scale), [geometry, scale]);

  useEffect(() => () => {
    const root = groupRef.current;
    root?.traverse((obj) => {
      if (!obj.isMesh) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((entry) => entry?.dispose?.());
    });
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group ref={groupRef}>
        <mesh
          geometry={geometry}
          material={material}
          name="Eroded Mesa"
          position={[0, meshOffsetY, 0]}
          scale={scale}
          castShadow
          receiveShadow
        />
      </group>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[trimesh.vertices, trimesh.indices]} friction={1} />
      </RigidBody>
    </group>
  );
}

function SeaRocks() {
  const rocksRef = useRef(null);
  useEnvironmentShaderOn(rocksRef, 'seaRocks');
  return (
    <group ref={rocksRef}>
      {SEA_ROCKS.map((rock, index) => {
        const rotation = [0.2 + index * 0.7, index * 1.3, 0.1 + index * 0.4];
        return (
          <group key={`rock-${index}`}>
            <mesh
              position={rock.position}
              scale={rock.scale}
              rotation={rotation}
              castShadow
              receiveShadow
              material={toonMaterial(rock.color, { map: ROCK_TEXTURE })}
            >
              <icosahedronGeometry args={[1, 1]} />
            </mesh>
            <RigidBody type="fixed" colliders={false}>
              <ConvexHullCollider
                args={[scaledRockHull(rock.scale)]}
                position={rock.position}
                rotation={rotation}
                friction={0.9}
              />
            </RigidBody>
          </group>
        );
      })}
    </group>
  );
}

// photoscan catalogs scan-asset probes: Fab GLBs (baseColor + ORM + normal photoscan
// textures) run through the same environment adapter as the procedural stage.
// The mesh accessors are in centimeters but a wrapper node bakes the cm→m
// conversion, so the loaded scene is real-world meters at scale 1.
// Low-poly toon rock cluster: stands in for the Fab beach-rocks scan when
// assets-local/ is absent (fresh clones), so the shoreline keeps its hero
// outcrop. Deterministic (seeded by index), cel-shaded like the seabed.
function FallbackRockCluster({ position, rotation = 0, scale = 1 }) {
  const group = useMemo(() => {
    const cluster = new THREE.Group();
    const rocks = [
      { pos: [0, 0.25, 0], r: 0.85, squash: 0.62, seed: 1 },
      { pos: [0.9, 0.16, 0.35], r: 0.55, squash: 0.58, seed: 2 },
      { pos: [-0.75, 0.12, 0.5], r: 0.45, squash: 0.55, seed: 3 },
      { pos: [0.25, 0.1, -0.7], r: 0.4, squash: 0.6, seed: 4 },
      { pos: [-0.3, 0.08, -0.35], r: 0.3, squash: 0.5, seed: 5 },
    ];
    for (const rock of rocks) {
      const geometry = new THREE.IcosahedronGeometry(rock.r, 1);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        // Hash-noise displacement: same layout on every load.
        const n = Math.sin(rock.seed * 91.7 + i * 12.9898) * 43758.5453;
        const bump = 1 + ((n - Math.floor(n)) - 0.5) * 0.36;
        positions.setXYZ(
          i,
          positions.getX(i) * bump,
          positions.getY(i) * bump * rock.squash,
          positions.getZ(i) * bump,
        );
      }
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color: 0x8b8a94 }));
      mesh.position.set(...rock.pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cluster.add(mesh);
    }
    return cluster;
  }, []);

  return (
    <primitive object={group} position={position} rotation={[0, rotation, 0]} scale={scale} />
  );
}

function ScanProp({ url, label, position, rotation = 0, scale = 1, fallback = null }) {
  const { gl } = useThree();
  const [model, setModel] = useState(null);
  const [failed, setFailed] = useState(false);
  const [trimesh, setTrimesh] = useState(null);

  // World-space trimesh collider, built after the primitive mounts so the
  // placement transforms are baked into obj.matrixWorld.
  useEffect(() => {
    if (!model) return;
    setTrimesh(collectEnvironmentTrimesh(model));
  }, [model]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = await loadModelAsset(url, { renderer: gl });
        await waitForObjectTextures(asset.root);
        setObjectTextureColorSpaces(asset.root);
        const report = await applyEnvironmentShader(asset.root, {
          hasSun: true,
          parameters: {
            ambientStrength: 0.42,
            shadowTintColor: [0.74, 0.78, 0.88],
          },
        });
        if (cancelled) return;
        document.body.dataset[label + 'EnvShader'] = String(report?.convertedMeshCount ?? 0);
        document.body.dataset[label + 'ScanStylized'] = String(report?.scanStylizedMaterialCount ?? 0);
        console.log('Environment shader applied to ' + label, report);
        setModel(asset.root);
      } catch (error) {
        if (cancelled) return;
        console.warn('Scan prop ' + label + ' failed to load:', error);
        document.body.dataset[label + 'EnvShader'] = 'error';
        setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [gl, url, label]);

  if (failed) return fallback;
  if (!model) return null;
  return (
    <>
      <primitive
        object={model}
        position={position}
        rotation={[0, rotation, 0]}
        scale={scale}
      />
      {trimesh && (
        <RigidBody type="fixed" colliders={false}>
          <TrimeshCollider args={[trimesh.vertices, trimesh.indices]} friction={0.9} />
        </RigidBody>
      )}
    </>
  );
}

// Table placement is shared with the bench-sit interaction below.
const WOODEN_TABLE_POSITION = [3.0, seaBedHeight(3.0, -5.6) - 0.03, -5.6];
const WOODEN_TABLE_ROTATION = -0.4;
// Bench seat on the tabletop: the top is ~0.72 m above the base; the seat
// point sits toward the water-side (+Z local) edge, facing the water.
const BENCH_SEAT = (() => {
  const yaw = WOODEN_TABLE_ROTATION;
  const x = WOODEN_TABLE_POSITION[0] + Math.sin(yaw) * 0.22;
  const z = WOODEN_TABLE_POSITION[2] + Math.cos(yaw) * 0.22;
  // Dismount point on the ground in front of the seat, clear of the tabletop.
  const standX = x + Math.sin(yaw) * 0.85;
  const standZ = z + Math.cos(yaw) * 0.85;
  return {
    x,
    z,
    top: WOODEN_TABLE_POSITION[1] + 0.72,
    yaw,
    radius: 2.0,
    standX,
    standZ,
    standY: seaBedHeight(standX, standZ) + BODY_CENTER_AT_REST + 0.02,
  };
})();

function PhotoscanProps() {
  return (
    <>
      {/* Rock cluster straddling the waterline (1.6x real size, hero
          outcrop) so the foam ring and underwater tint read against the
          scan texture. */}
      <ScanProp
        url={nordicBeachRocksUrl}
        label="nordicRocks"
        position={[-6.2, seaBedHeight(-6.2, 1.4) - 0.05, 1.4]}
        rotation={0.6}
        scale={1.6}
        fallback={(
          <FallbackRockCluster
            position={[-6.2, seaBedHeight(-6.2, 1.4) - 0.05, 1.4]}
            rotation={0.6}
            scale={1.6}
          />
        )}
      />
      {/* Table at real size on the flat clamped dune shelf (bed height caps
          at 0.9 behind the shoreline) so its legs sit level. */}
      <ScanProp
        url={woodenTableUrl}
        label="woodenTable"
        position={WOODEN_TABLE_POSITION}
        rotation={WOODEN_TABLE_ROTATION}
      />
    </>
  );
}

// Sit/stand toggle for the scan-prop bench: F near the seat sits the
// character on the tabletop facing the water; F again (or any move/jump key)
// stands up. While seated the capsule is pinned standing on the bench top —
// the seated pose comes from the sit clip plus the visual drop in
// ControlledPmxModel, so the physics never fights the table collider.
function BenchSitController({ controllerRef, sitStateRef }) {
  const toggleRef = useRef(false);
  const standRef = useRef(false);

  useEffect(() => {
    const STAND_CODES = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    ]);
    const onKeyDown = (event) => {
      if (event.code === 'KeyF') toggleRef.current = true;
      else if (STAND_CODES.has(event.code)) standRef.current = true;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useFrame(() => {
    const body = controllerRef.current?.group;
    const state = sitStateRef.current;
    const toggle = toggleRef.current;
    const stand = standRef.current;
    toggleRef.current = false;
    standRef.current = false;
    if (!body || !state) return;

    const position = body.translation();
    const pinY = BENCH_SEAT.top + BODY_CENTER_AT_REST + 0.02;

    if (!state.sitting) {
      const near = Math.hypot(position.x - BENCH_SEAT.x, position.z - BENCH_SEAT.z) < BENCH_SEAT.radius
        && Math.abs(position.y - pinY) < 2.5;
      document.body.dataset.benchSitAvailable = String(near);
      document.body.dataset.benchSitDistance = [
        Math.hypot(position.x - BENCH_SEAT.x, position.z - BENCH_SEAT.z).toFixed(2),
        position.x.toFixed(2), position.y.toFixed(2), position.z.toFixed(2),
      ].join(',');
      if (near && toggle) {
        state.sitting = true;
        state.seatYaw = BENCH_SEAT.yaw;
        body.setTranslation({ x: BENCH_SEAT.x, y: pinY, z: BENCH_SEAT.z }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        document.body.dataset.benchSitting = 'true';
      }
      return;
    }

    if (toggle || stand) {
      state.sitting = false;
      document.body.dataset.benchSitting = 'false';
      // Dismount beside the bench, not standing on the tabletop.
      body.setTranslation({ x: BENCH_SEAT.standX, y: BENCH_SEAT.standY, z: BENCH_SEAT.standZ }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    body.setTranslation({ x: BENCH_SEAT.x, y: pinY, z: BENCH_SEAT.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });

  return null;
}

const FISH_VARIANTS = [
  { body: 0xff8c42, tail: 0xffb37a },
  { body: 0xf4f0e4, tail: 0xff9d5c },
  { body: 0x5c7f9e, tail: 0x7ba3c4 },
];

const FISH_PATHS = Array.from({ length: 7 }, (_, index) => ({
  centerX: [2.2, -1.8, 0.6, -3.0, 3.6, -0.4, 1.2][index],
  centerZ: [4.6, 5.0, 6.2, 5.4, 5.6, 7.2, 3.8][index],
  radiusX: 1.1 + (index % 3) * 0.6,
  radiusZ: 0.8 + ((index + 1) % 3) * 0.55,
  depth: -0.26 - (index % 3) * 0.14,
  speed: 0.45 + (index % 3) * 0.18,
  phase: index * 1.7,
  direction: index % 2 === 0 ? 1 : -1,
  scale: 0.8 + (index % 3) * 0.24,
  variant: FISH_VARIANTS[index % FISH_VARIANTS.length],
}));

function FishSchool() {
  const fishRefs = useRef([]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    FISH_PATHS.forEach((path, index) => {
      const fish = fishRefs.current[index];
      if (!fish) return;
      const angle = (time * path.speed + path.phase) * path.direction;
      const x = path.centerX + Math.cos(angle) * path.radiusX;
      const z = path.centerZ + Math.sin(angle) * path.radiusZ;
      const y = path.depth + Math.sin(time * 1.3 + path.phase) * 0.05;
      fish.position.set(x, y, z);
      // Heading along the ellipse tangent plus a tail-wag yaw wiggle.
      const tangentX = -Math.sin(angle) * path.radiusX * path.direction;
      const tangentZ = Math.cos(angle) * path.radiusZ * path.direction;
      fish.rotation.y = Math.atan2(tangentX, tangentZ) +
        Math.sin(time * 7 + path.phase) * 0.14;
    });
  });

  return (
    <>
      {FISH_PATHS.map((path, index) => (
        <group
          key={`fish-${index}`}
          ref={(node) => { fishRefs.current[index] = node; }}
          scale={path.scale}
        >
          <mesh material={toonMaterial(path.variant.body)} castShadow receiveShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
          </mesh>
          <mesh position={[0, 0, -0.13]} material={toonMaterial(path.variant.tail)} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <coneGeometry args={[0.055, 0.14, 6]} />
          </mesh>
          <mesh position={[0, 0.055, 0.02]} material={toonMaterial(path.variant.tail)} rotation={[Math.PI * 0.42, 0, 0]} castShadow receiveShadow>
            <coneGeometry args={[0.03, 0.09, 5]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// Physics terrain sampled from the same seaBedHeight() function that builds
// the visual seabed, so the character walks dunes and wades slopes with no
// visual/physics mismatch.
function SeaBedCollider() {
  const [vertices, indices] = useMemo(() => {
    const size = 200;
    const segments = 200;
    const verts = new Float32Array((segments + 1) * (segments + 1) * 3);
    let write = 0;
    for (let i = 0; i <= segments; i += 1) {
      for (let j = 0; j <= segments; j += 1) {
        const x = (j / segments - 0.5) * size;
        const z = (i / segments - 0.5) * size + 6;
        verts[write] = x;
        verts[write + 1] = seaBedHeight(x, z);
        verts[write + 2] = z;
        write += 3;
      }
    }
    const idx = [];
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < segments; j += 1) {
        const a = i * (segments + 1) + j;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return [verts, new Uint32Array(idx)];
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[vertices, indices]} friction={0.7} />
    </RigidBody>
  );
}

function DistantIsland({ envPreset, x, z, scale = 1, mirror = false }) {
  const flip = mirror ? -1 : 1;
  const dress = useMemo(() => {
    const place = (offsetX, offsetZ) => {
      const worldX = x + offsetX * flip * scale;
      const worldZ = z + offsetZ * scale;
      return [worldX, seaBedHeight(worldX, worldZ) - 0.12, worldZ];
    };
    return {
      rock: place(1.7, -0.6),
      treeA: place(-0.9, 0.2),
      treeB: place(0.6, 0.75),
    };
  }, [flip, scale, x, z]);

  return (
    <group>
      <mesh position={dress.rock} scale={[1.15 * scale, 0.8 * scale, 0.95 * scale]} castShadow receiveShadow material={toonMaterial(0xa8b6bd, { map: ROCK_TEXTURE })}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <ConvexHullCollider args={[scaledRockHull([1.15 * scale, 0.8 * scale, 0.95 * scale])]} position={dress.rock} friction={0.9} />
      </RigidBody>
      <WaterBroadleafTree
        envPreset={envPreset}
        position={dress.treeA}
        presetId="species_oak_small"
        canopyColor="#6aa85c"
        barkTextureId="oak"
        leafShape="round"
        animationPreset="falling"
        animationIntensity={0.18}
        seedOffset={Math.round(scale * 10)}
        sizeScale={scale}
        windSpeedScale={0.85}
        windStrengthScale={0.9}
        woodDetails={{ knots: 0.35, scars: 0.18 }}
      />
      <WaterBroadleafTree
        envPreset={envPreset}
        position={dress.treeB}
        rotation={2.1}
        presetId="species_aspen"
        canopyColor="#9fc65b"
        barkTextureId="birch"
        leafShape="gingko"
        animationPreset="drifting"
        animationIntensity={0.16}
        seedOffset={Math.round(scale * 13)}
        sizeScale={scale}
        windSpeedScale={1.15}
        windStrengthScale={0.8}
      />
    </group>
  );
}

function SeaStage({ envPreset }) {
  const stageRef = useRef(null);
  useEnvironmentShaderOn(stageRef, 'seaStage');
  const bedGeometry = useMemo(() => createSeaBedGeometry(), []);
  // Dirt band between beach sand and the grass line. Bands overlap the grass
  // ramp below so sand->dirt->grass crossfade over ~1.5m each.
  const landOverlayGeometry = useMemo(() => createSeaBedOverlayGeometry(
    (y) => THREE.MathUtils.smoothstep(y, 0.26, 0.46) * (1 - THREE.MathUtils.smoothstep(y, 0.54, 0.74)),
    0.008,
  ), []);
  // Grassy cover on the dune ring and island caps.
  const grassOverlayGeometry = useMemo(() => createSeaBedOverlayGeometry(
    (y) => THREE.MathUtils.smoothstep(y, 0.48, 0.74),
    0.014,
  ), []);
  // Opacity must sit below the adapter's 0.999 alpha-blend threshold or the
  // converted material renders opaque and ignores the vertex-alpha splat mask.
  const landOverlayMaterial = useMemo(() => new THREE.MeshToonMaterial({
    map: LAND_TEXTURE,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    gradientMap: TOON_GRADIENT_MAP,
  }), []);
  const grassOverlayMaterial = useMemo(() => new THREE.MeshToonMaterial({
    map: GRASSY_LAND_TEXTURE,
    // Shift the olive texture toward the grass blades' chartreuse so ground
    // glimpsed between blades reads as more meadow, not bare yellow.
    color: new THREE.Color('#a4dc66'),
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    gradientMap: TOON_GRADIENT_MAP,
  }), []);
  const bedMaterial = useMemo(() => new THREE.MeshToonMaterial({
    vertexColors: true,
    map: SAND_TEXTURE,
    gradientMap: TOON_GRADIENT_MAP,
  }), []);
  useEffect(() => {
    return () => {
      bedGeometry.dispose();
      bedMaterial.dispose();
      landOverlayGeometry.dispose();
      grassOverlayGeometry.dispose();
      landOverlayMaterial.dispose();
      grassOverlayMaterial.dispose();
    };
  }, [bedGeometry, bedMaterial, landOverlayGeometry, grassOverlayGeometry, landOverlayMaterial, grassOverlayMaterial]);

  return (
    <group ref={stageRef}>
      <mesh geometry={bedGeometry} material={bedMaterial} position={[0, 0, SEA_BED_CENTER_Z]} receiveShadow />
      {/* Blended splat overlays draw before the water surface (renderOrder 0)
          and land-under-grass; distance sorting is unstable for coplanar
          meshes sharing a bounding center. */}
      <mesh geometry={landOverlayGeometry} material={landOverlayMaterial} position={[0, 0, SEA_BED_CENTER_Z]} receiveShadow renderOrder={-2} />
      <mesh geometry={grassOverlayGeometry} material={grassOverlayMaterial} position={[0, 0, SEA_BED_CENTER_Z]} receiveShadow renderOrder={-1} />
      <FishSchool />
      {/* Beach dressing behind the shoreline. */}
      <WaterBroadleafTree
        envPreset={envPreset}
        position={[6.8, seaBedHeight(6.8, -4.4) - 0.1, -4.4]}
        presetId="example_branching"
        canopyColor="#5fae57"
        barkTextureId="beech"
        leafShape="teardrop"
        animationPreset="falling"
        animationIntensity={0.32}
        seedOffset={3}
        windSpeedScale={0.9}
        windStrengthScale={0.95}
        woodDetails={{ knots: 0.22, scars: 0.12 }}
      />
      <WaterBroadleafTree
        envPreset={envPreset}
        position={[-7.4, seaBedHeight(-7.4, -5.4) - 0.1, -5.4]}
        rotation={1.4}
        presetId="species_ash"
        canopyColor="#7cc45f"
        barkTextureId="ash"
        leafShape="round"
        animationPreset="drifting"
        animationIntensity={0.26}
        seedOffset={11}
        windSpeedScale={1.12}
        windStrengthScale={1.05}
        woodDetails={{ knots: 0.18, scars: 0.2 }}
      />
      <WaterBroadleafTree
        envPreset={envPreset}
        position={[10.6, seaBedHeight(10.6, -7.8) - 0.1, -7.8]}
        rotation={2.6}
        presetId="species_oak_large"
        canopyColor="#c86b32"
        barkTextureId="oak"
        leafShape="maple"
        animationPreset="falling"
        animationIntensity={0.38}
        seedOffset={17}
        windSpeedScale={0.76}
        windStrengthScale={1.22}
        woodDetails={{ knots: 0.45, scars: 0.25 }}
      />
      <WaterBroadleafTree
        envPreset={envPreset}
        position={[-12.2, seaBedHeight(-12.2, -9.0) - 0.1, -9.0]}
        rotation={4.1}
        presetId="species_aspen"
        canopyColor="#f0c437"
        barkTextureId="birch"
        leafShape="gingko"
        animationPreset="fluttering"
        animationIntensity={0.42}
        seedOffset={23}
        windSpeedScale={1.32}
        windStrengthScale={0.72}
      />
      <ErodedMesaRock
        position={[13.8, seaBedHeight(13.8, -11.2) + 0.02, -11.2]}
        rotation={0.55}
        scale={[1.55, 1.18, 1.35]}
      />
      <mesh position={RIM_ROCK_A_POSITION} scale={[0.9, 0.55, 0.7]} castShadow receiveShadow material={toonMaterial(0xa9b8bf, { map: ROCK_TEXTURE })}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <ConvexHullCollider args={[scaledRockHull([0.9, 0.55, 0.7])]} position={RIM_ROCK_A_POSITION} friction={0.9} />
        <ConvexHullCollider args={[scaledRockHull([1.2, 0.7, 0.9])]} position={RIM_ROCK_B_POSITION} friction={0.9} />
      </RigidBody>
      <mesh position={RIM_ROCK_B_POSITION} scale={[1.2, 0.7, 0.9]} castShadow receiveShadow material={toonMaterial(0xa5b3ba, { map: ROCK_TEXTURE })}>
        <icosahedronGeometry args={[1, 1]} />
      </mesh>
      {/* Mid-distance islands: reflection and scale reference on the water. */}
      <DistantIsland envPreset={envPreset} x={-15} z={26} scale={1.15} />
      <DistantIsland envPreset={envPreset} x={16} z={32} scale={1.45} mirror />
      <DistantIsland envPreset={envPreset} x={-7} z={44} scale={2.0} />
    </group>
  );
}

// --- Rain, kelp, and underwater atmosphere -----------------------------------

function RainView({ controllerRef, envPreset, waterApiRef, waterLevel }) {
  const { camera, gl } = useThree();
  const rain = useMemo(() => new WaterRain({ count: 2600 }), []);
  const intensity = WATER_ENVIRONMENT_PRESETS[envPreset]?.rain ?? 0;

  useEffect(() => () => rain.dispose(), [rain]);
  useEffect(() => {
    rain.setIntensity(intensity);
  }, [rain, intensity]);

  useFrame((_, delta) => {
    if (!rain.visible) return;
    rain.update(delta, camera, gl, waterLevel);
    // Raindrop dimples on the water around the character.
    const api = waterApiRef.current;
    if (!api) return;
    const body = controllerRef.current?.group;
    const centerX = body?.translation ? body.translation().x : camera.position.x;
    const centerZ = body?.translation ? body.translation().z : camera.position.z;
    const drops = Math.floor(intensity * 4 + Math.random() * 2 * intensity);
    for (let i = 0; i < drops; i += 1) {
      api.injectWorld(
        centerX + (Math.random() * 2 - 1) * 9,
        centerZ + (Math.random() * 2 - 1) * 9,
        { radius: 0.1 + Math.random() * 0.12, strength: 0.28 + Math.random() * 0.35 },
      );
    }
  });

  return <primitive object={rain} />;
}

function KelpField({ settings }) {
  const kelp = useMemo(() => {
    const placements = [];
    let attempts = 0;
    while (placements.length < 46 && attempts < 400) {
      attempts += 1;
      const x = (Math.random() * 2 - 1) * 7.5;
      const z = 3.4 + Math.random() * 5.8;
      const y = seaBedHeight(x, z);
      if (y > -0.35 || y < -2.0) continue;
      placements.push({
        x,
        y: y - 0.04,
        z,
        height: Math.min(0.5 + Math.random() * 1.1, 0.36 - y - 0.16),
      });
    }
    return new WaterKelpField({
      placements,
      kelpColor: [0.2, 0.55, 0.36],
      kelpShadeColor: [0.07, 0.28, 0.22],
    });
  }, []);

  useEffect(() => () => kelp.dispose(), [kelp]);
  useEffect(() => {
    kelp.setFlow(settings.flowDirection, settings.flowSpeed);
  }, [kelp, settings]);
  useFrame((_, delta) => kelp.update(delta));

  return <primitive object={kelp} />;
}

// Swaps the scene fog to a dense underwater tint whenever the camera dips
// below the surface, so diving under reads as being inside the water body.
function UnderwaterAtmosphere({ envPreset, settings }) {
  const { camera, scene } = useThree();
  const underwaterColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const fog = scene.fog;
    if (!fog) return;
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    if (camera.position.y < settings.waterLevel) {
      underwaterColor.setRGB(
        settings.midColor[0] * 0.8,
        settings.midColor[1] * 0.85,
        settings.midColor[2] * 0.9,
      );
      fog.color.copy(underwaterColor);
      fog.near = 0.5;
      fog.far = 32;
    } else {
      fog.color.set(environment.fog.color);
      fog.near = environment.fog.near;
      fog.far = environment.fog.far;
    }
  });

  return null;
}

export {
  formatWaterValue,
  WaterHud,
  WaterSurfaceView,
  WaterBall,
  StylizedSkyView,
  HorizonSilhouettes,
  useEnvironmentShaderOn,
  SeaRocks,
  ScanProp,
  BENCH_SEAT,
  PhotoscanProps,
  BenchSitController,
  FishSchool,
  SeaBedCollider,
  DistantIsland,
  SeaStage,
  RainView,
  KelpField,
  UnderwaterAtmosphere,
};
