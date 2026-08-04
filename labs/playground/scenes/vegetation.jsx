// Vegetation dressing for the water scenes: the environment foliage clock and
// the dense grass/flower meadow carpet.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';

import {
  advanceEnvironmentShaderTime,
  setEnvironmentCloudShadow,
} from '../../../src/environment/environmentMaterialAdapter.js';
import { syncFoliageFog } from '../../../src/shaders-tsl/chunks/foliage-fog.js';
import { StylizedGrassField } from '../../../src/vegetation/stylizedGrass.js';
import { StylizedFlowerField } from '../../../src/vegetation/stylizedFlowers.js';
import { BODY_CENTER_AT_REST } from '../params.js';
import {
  WATER_ENVIRONMENT_PRESETS,
  cloudShadowSettingsFor,
  seaBedHeight,
} from './stage.js';
import {
  applyBroadleafEnvironment,
  createBroadleafTreeInstance,
} from './toonlabBroadleaf.js';

function TreeFoliageRig({ envPreset }) {
  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    const cloudShadow = cloudShadowSettingsFor(environment);
    setEnvironmentCloudShadow(cloudShadow);
  }, [envPreset]);

  useFrame((_, delta) => {
    advanceEnvironmentShaderTime(delta);
  });

  return null;
}

const SHOWCASE_ROW_Z = -16;
const BROADLEAF_SHOWCASE_TREES = Object.freeze([
  Object.freeze({
    id: 'example_branching',
    animationIntensity: 0.24,
    animationPreset: 'falling',
    barkTextureId: 'beech',
    canopyColor: '#5fae57',
    leafShape: 'teardrop',
    seedOffset: 0,
    sizeScale: 0.98,
    rotation: 0.35,
    windSpeedScale: 0.9,
    windStrengthScale: 0.95,
    woodDetails: { knots: 0.16, scars: 0.08 },
  }),
  Object.freeze({
    id: 'species_oak_small',
    animationIntensity: 0.18,
    animationPreset: 'drifting',
    barkTextureId: 'oak',
    canopyColor: '#4d8f47',
    leafShape: 'round',
    seedOffset: 8,
    sizeScale: 1.05,
    rotation: 5.65,
    windSpeedScale: 1.1,
    windStrengthScale: 0.86,
    woodDetails: { knots: 0.4, scars: 0.16 },
  }),
  Object.freeze({
    id: 'species_ash',
    animationIntensity: 0.28,
    animationPreset: 'falling',
    barkTextureId: 'ash',
    canopyColor: '#7ac05e',
    leafShape: 'maple',
    seedOffset: 14,
    sizeScale: 0.96,
    rotation: 1.2,
    windSpeedScale: 0.78,
    windStrengthScale: 1.15,
    woodDetails: { knots: 0.18, scars: 0.22 },
  }),
  Object.freeze({
    id: 'species_aspen',
    animationIntensity: 0.36,
    animationPreset: 'fluttering',
    barkTextureId: 'birch',
    canopyColor: '#e5c947',
    leafShape: 'gingko',
    seedOffset: 22,
    sizeScale: 0.95,
    rotation: 2.45,
    windSpeedScale: 1.28,
    windStrengthScale: 0.72,
  }),
  Object.freeze({
    id: 'species_oak_large',
    animationIntensity: 0.22,
    animationPreset: 'drifting',
    barkTextureId: 'oak',
    canopyColor: '#c87332',
    leafShape: 'maple',
    seedOffset: 31,
    sizeScale: 0.86,
    rotation: 3.6,
    windSpeedScale: 0.84,
    windStrengthScale: 1.22,
    woodDetails: { knots: 0.5, scars: 0.28 },
  }),
]);

function ShowcaseTreeRow({ envPreset }) {
  const scene = useThree((state) => state.scene);
  const instances = useMemo(() => {
    const spacing = 6.2;
    const center = (BROADLEAF_SHOWCASE_TREES.length - 1) * spacing * 0.5;
    return BROADLEAF_SHOWCASE_TREES.map((config, index) => {
      const instance = createBroadleafTreeInstance({
        animationIntensity: config.animationIntensity,
        animationPreset: config.animationPreset,
        barkTextureId: config.barkTextureId,
        canopyColor: config.canopyColor,
        leafShape: config.leafShape,
        presetId: config.id,
        seedOffset: config.seedOffset,
        sizeScale: config.sizeScale,
        windSpeedScale: config.windSpeedScale,
        windStrengthScale: config.windStrengthScale,
        woodDetails: config.woodDetails,
      });
      const { tree } = instance;
      const x = index * spacing - center;
      tree.position.set(x, seaBedHeight(x, SHOWCASE_ROW_Z) - 0.05, SHOWCASE_ROW_Z);
      tree.rotation.y = config.rotation;
      return instance;
    });
  }, []);
  const trees = useMemo(() => instances.map((instance) => instance.tree), [instances]);

  useEffect(() => () => trees.forEach((tree) => tree.dispose()), [trees]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    trees.forEach((tree) => {
      applyBroadleafEnvironment(tree, environment, {
        cloudShadow: cloudShadowSettingsFor(environment),
      });
    });
  }, [trees, envPreset]);

  useFrame((_, delta) => trees.forEach((tree) => {
    tree.update(delta);
    tree.userData.leafParticles?.update(delta);
    syncFoliageFog(tree.canopyMesh?.material, scene.fog);
  }));

  return (
    <group>
      {trees.map((tree, index) => {
        const size = tree.settings?.tree?.size ?? 1;
        return (
          <group key={`broadleaf-showcase-${BROADLEAF_SHOWCASE_TREES[index].id}`}>
            <primitive object={tree} />
            <RigidBody type="fixed" colliders={false}>
              <CapsuleCollider
                args={[0.72 * size, 0.22 * size]}
                position={[tree.position.x, tree.position.y + 0.86 * size, tree.position.z]}
              />
            </RigidBody>
          </group>
        );
      })}
    </group>
  );
}

function GrassField({ controllerRef, envPreset }) {
  const { grass, flowers } = useMemo(() => {
    const placements = [];
    const flowerPlacements = [];
    // Continuous carpet over the dune/grass ring around the bay. A jittered
    // grid guarantees every patch of the band gets a tuft (random scatter
    // leaves bald spots), and each tuft grows a dense clump of blades with
    // coherent height and sway phase so the field reads as reference anime-style
    // grass cover rather than isolated sprigs.
    const clumpSpacing = 0.46;
    const maxBlades = 560000;
    for (let gx = -48; gx <= 48 && placements.length < maxBlades; gx += clumpSpacing) {
      for (let gz = -34; gz <= 58 && placements.length < maxBlades; gz += clumpSpacing) {
        const clumpX = gx + (Math.random() - 0.5) * clumpSpacing;
        const clumpZ = gz + (Math.random() - 0.5) * clumpSpacing;
        const clumpY = seaBedHeight(clumpX, clumpZ);
        // Feathered band edges: full density on the dune tops and island
        // crowns, thinning tufts where grass meets sand.
        const edge = THREE.MathUtils.smoothstep(clumpY, 0.42, 0.56) *
          (1 - THREE.MathUtils.smoothstep(clumpY, 1.02, 1.14));
        if (edge <= 0 || Math.random() > edge) continue;
        const clumpPhase = Math.random();
        const clumpHeight = 0.26 + Math.random() * 0.3;
        // Clumps overlap their neighbors so the canopy closes with no bald
        // seams between grid cells.
        const clumpRadius = clumpSpacing * 1.35;
        const blades = 22 + Math.floor(Math.random() * 11);
        for (let blade = 0; blade < blades; blade += 1) {
          const x = clumpX + (Math.random() - 0.5) * clumpRadius;
          const z = clumpZ + (Math.random() - 0.5) * clumpRadius;
          const y = seaBedHeight(x, z);
          if (y < 0.4 || y > 1.2) continue;
          placements.push({
            x,
            y: y - 0.03,
            z,
            height: clumpHeight * (0.78 + Math.random() * 0.44),
            phase: (clumpPhase + Math.random() * 0.12) % 1,
          });
        }
        // A few clumps host daisy clusters whose heads float just above the
        // local canopy, like the reference games' meadow flowers.
        if (Math.random() < 0.05) {
          const heads = 1 + Math.floor(Math.random() * 3);
          for (let head = 0; head < heads; head += 1) {
            const x = clumpX + (Math.random() - 0.5) * clumpRadius;
            const z = clumpZ + (Math.random() - 0.5) * clumpRadius;
            const y = seaBedHeight(x, z);
            if (y < 0.4 || y > 1.2) continue;
            flowerPlacements.push({
              x,
              y: y - 0.03,
              z,
              headHeight: clumpHeight * (1.0 + Math.random() * 0.25),
            });
          }
        }
      }
    }
    const field = new StylizedGrassField({ placements });
    // Dunes barely reflect in the water; skip the mirror pass for them.
    field.userData.waterReflectionExclude = true;
    const flowerField = new StylizedFlowerField({ placements: flowerPlacements });
    flowerField.userData.waterReflectionExclude = true;
    return { grass: field, flowers: flowerField };
  }, []);

  useEffect(() => () => {
    grass.dispose();
    flowers.dispose();
  }, [grass, flowers]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    const wind = environment.wind ?? { speed: 1, strength: 0.16 };
    grass.setWind({
      direction: [1, 0.3],
      speed: wind.speed,
      strength: wind.strength,
      gustSpeed: 1.0 + wind.speed * 0.8,
    });
    grass.setSun({
      direction: environment.water.sunDirection,
      color: environment.water.sunColor,
      sky: environment.sky.horizonColor,
    });
    grass.setCloudShadow(cloudShadowSettingsFor(environment));
    // Blades past the fog line are invisible anyway; collapse them so the
    // 240k-instance field stops paying fill rate for fully fogged grass.
    grass.setDistanceFade({
      start: environment.fog.far * 0.8,
      end: environment.fog.far * 1.05,
    });
    flowers.setWind({
      direction: [1, 0.3],
      speed: wind.speed,
      strength: wind.strength,
    });
  }, [grass, flowers, envPreset]);

  useEffect(() => {
    grass.setPushTarget((out) => {
      const body = controllerRef.current?.group;
      if (!body?.translation) return null;
      const position = body.translation();
      return out.set(position.x, position.y - BODY_CENTER_AT_REST + 0.3, position.z);
    });
    return () => grass.setPushTarget(null);
  }, [controllerRef, grass]);

  useFrame((_, delta) => {
    grass.update(delta);
    flowers.update(delta);
  });

  return (
    <>
      <primitive object={grass} />
      <primitive object={flowers} />
    </>
  );
}

export {
  TreeFoliageRig,
  ShowcaseTreeRow,
  GrassField,
};
