// One showcase scene per file. This module owns the walkable sample's layout
// and composition; shared character/controller services are injected so the
// scene never reimplements loading, rigging, animation, or camera plumbing.
import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';

import {
  BODY_CENTER_AT_REST,
} from '../../params.js';
import { seaBedHeight } from '../stage.js';
import { GrassField, ShowcaseTreeRow, TreeFoliageRig } from '../vegetation.jsx';
import {
  BENCH_SEAT,
  BenchSitController,
  HorizonSilhouettes,
  KelpField,
  ManufacturedProps,
  RainView,
  SeaBedCollider,
  SeaRocks,
  SeaStage,
  ToonLabSkyView,
  UnderwaterAtmosphere,
  WaterBall,
  WaterSurfaceView,
} from '../waterScenes.jsx';
import { WalkableSceneHost } from './WalkableSceneHost.jsx';

export const WALKABLE_SAMPLE_SCENE = Object.freeze({
  aliases: Object.freeze(['water', 'walkable', 'walkable-sample']),
  id: 'walkable-sample',
  label: 'Walkable Sample',
});

const HOURS = Object.freeze({
  moonlit: 0,
  noon: 13,
  overcast: 13,
  storm: 13,
  sunset: 18,
});

export function WalkableSampleScene({
  ballSpawnToken,
  cameraMode = 'follow',
  debugMode,
  envPreset,
  inspector,
  onInspectorReady,
  services,
  settings,
  sinkerSpawnToken,
}) {
  const {
    SceneLook,
  } = services;
  const controllerRef = useRef(null);
  const waterApiRef = useRef(null);
  const swimStateRef = useRef({
    diving: false,
    planarSpeed: 0,
    sprinting: false,
    surfaced: false,
    swimming: false,
  });
  const sitStateRef = useRef({ seatYaw: BENCH_SEAT.yaw, sitting: false });
  const nextBallIdRef = useRef(1);
  const [skySystem, setSkySystem] = useState(null);
  const [waterSurface, setWaterSurface] = useState(null);
  const [balls, setBalls] = useState([]);
  const [swimming, setSwimming] = useState(false);

  useFrame(() => {
    const next = Boolean(swimStateRef.current?.swimming);
    setSwimming((current) => (current === next ? current : next));
  });

  useEffect(() => {
    if (ballSpawnToken <= 0) return;
    const id = nextBallIdRef.current++;
    const offset = ((id * 37) % 100) / 100;
    setBalls((current) => [...current.slice(-7), {
      color: [0x6ad7ff, 0xffb86a, 0xe7f08a, 0xf29bd2][id % 4],
      id,
      kind: 'floater',
      position: [-1.8 + offset * 3.6, 3.1, -1.8 + (((id * 53) % 100) / 100) * 2.6],
      radius: 0.18,
    }]);
  }, [ballSpawnToken]);

  useEffect(() => {
    if (sinkerSpawnToken <= 0) return;
    const id = nextBallIdRef.current++;
    const side = id % 2 === 0 ? -1 : 1;
    const row = Math.floor(id / 2) % 3;
    setBalls((current) => [...current.slice(-7), {
      color: 0x31425f,
      id,
      kind: 'sinker',
      position: [side * (0.62 + row * 0.22), 3.8, 0.38 + row * 0.18],
      radius: 0.21,
    }]);
  }, [sinkerSpawnToken]);

  useEffect(() => {
    document.body.dataset.waterBallCount = String(balls.length);
  }, [balls.length]);

  return (
    <>
      <SceneLook
        onInspectorReady={onInspectorReady}
        sky={skySystem}
        timeOfDay={HOURS[envPreset] ?? 13}
        water={waterSurface}
      />
      <ToonLabSkyView envPreset={envPreset} onReady={setSkySystem} />
      <WalkableSceneHost
        cameraMode={cameraMode}
        characterProps={{ sitStateRef, swimStateRef, waterApiRef }}
        controllerRef={controllerRef}
        ground={seaBedHeight}
        keyboardChildren={(
          <BenchSitController controllerRef={controllerRef} sitStateRef={sitStateRef} />
        )}
        services={services}
        controllerProps={{
          autoBalanceDampingC: 0.045,
          autoBalanceSpringK: 0.35,
          camCollision: false,
          camInitDir: { x: 0.12, y: 0.04 },
          camInitDis: -4.6,
          camLowLimit: -1.5,
          camMaxDis: -9,
          camMinDis: -3.6,
          camTargetPos: { x: 0, y: -0.75, z: 0 },
          camUpLimit: 1.5,
          ccd: true,
          jumpVel: 4.0,
          maxVelLimit: 2.35,
          position: [0, seaBedHeight(0, -4) + BODY_CENTER_AT_REST + 0.25, -4],
          rayHitForgiveness: 0.18,
          sprintMult: 1.55,
          turnSpeed: swimming ? 6 : 13,
        }}
        physicsBefore={(
          <>
            <SeaBedCollider />
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[220, 2, 220]} position={[0, -10, 0]} friction={1.1} />
            </RigidBody>
          </>
        )}
        physicsAfter={(
          <>
            {balls.map((ball) => (
              <WaterBall key={ball.id} ball={ball} settings={settings} waterApiRef={waterApiRef} />
            ))}
            <SeaRocks inspector={inspector} />
            <ManufacturedProps inspector={inspector} />
            <SeaStage envPreset={envPreset} inspector={inspector} />
            <ShowcaseTreeRow envPreset={envPreset} />
          </>
        )}
      />
      <HorizonSilhouettes envPreset={envPreset} inspector={inspector} />
      <KelpField settings={settings} />
      <GrassField controllerRef={controllerRef} envPreset={envPreset} />
      <TreeFoliageRig envPreset={envPreset} />
      <RainView
        controllerRef={controllerRef}
        envPreset={envPreset}
        waterApiRef={waterApiRef}
        waterLevel={settings.waterLevel}
      />
      <UnderwaterAtmosphere settings={settings} />
      <WaterSurfaceView
        controllerRef={controllerRef}
        debugMode={debugMode}
        envPreset={envPreset}
        onReady={setWaterSurface}
        settings={settings}
        swimStateRef={swimStateRef}
        waterApiRef={waterApiRef}
      />
    </>
  );
}
