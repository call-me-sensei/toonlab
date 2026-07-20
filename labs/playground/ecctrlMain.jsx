import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, KeyboardControls, MapControls } from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody, TrimeshCollider, useBeforePhysicsStep } from '@react-three/rapier';
import Ecctrl, { EcctrlJoystick } from 'ecctrl';

import { loadModelAsset } from '../../src/character/modelLoader.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import { createEnvironmentSunShadowPass } from '../../src/environment/environmentSunShadowPass.js';
import {
  resolveCharacterRig,
  targetBoneNameForRole,
} from '../../src/character/characterRig.js';
import {
  applyToonShader,
  findPrimarySkinnedMesh,
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '../../src/toon/toonMaterialAdapter.js';
import { createWaterSettings } from '../../src/water/waterSettings.js';
import { createFreestyleSwimClip } from '../../src/character/freestyleSwimClip.js';
import {
  bakeSolidBaseColorTextures,
  createArmPoseState,
  exposePoseDebug,
  fitModelForController,
  loadIdleClipForTarget,
  loadJumpClipForTarget,
  loadRunningClipForTarget,
  loadSitClipForTarget,
  loadSwimClipForTarget,
  loadWalkingClipForTarget,
  prepareModelForRealtime,
  resolveNativeLocomotionClips,
  snapshotSkeletonLocalPose,
} from './animationPipeline.js';
import { updateAnimationToggle, updateModeLabel } from './hud.js';
import { mountCharacterToonHud } from './characterHud.js';
import {
  ANIMATION_REQUESTED,
  ARM_POSE_MODE,
  BODY_CENTER_AT_REST,
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  DIVE_ANIMATION_URL,
  ECCTRL_MODE,
  ENABLE_IDLE_ANIMATION,
  ENABLE_JUMP_ANIMATION,
  ENABLE_NATIVE_ANIMATION,
  ENABLE_RUNNING_ANIMATION,
  ENABLE_SWIM_ANIMATION,
  ENABLE_TOUCH_CONTROLS,
  ENABLE_WALKING_ANIMATION,
  FLOAT_HEIGHT,
  IDLE_ANIMATION_URL,
  IDLE_BODY_MODE,
  INDOOR_ENVIRONMENT_SIZE,
  INDOOR_SCENE_ENABLED,
  INITIAL_WATER_DEBUG_MODE,
  JUMP_ANIMATION_URL,
  JUMP_BODY_MODE,
  MODEL_URL,
  RELAXED_ARM_Z_OFFSET,
  RENDERER_FALLBACK_NOTE,
  RETARGET_MODE,
  RUN_BLEND_MIN_SPEED,
  RUNNING_ANIMATION_URL,
  RUNNING_BODY_MODE,
  SHADER_MODE,
  SIT_ANIMATION_URL,
  SIT_VISUAL_DROP,
  SWIM_ANIMATION_URL,
  SWIM_DIVE_SPEED,
  SWIM_ENTER_DEPTH,
  SWIM_EXIT_DEPTH,
  SWIM_SPEED,
  SWIM_SPRINT_SPEED,
  SWIM_STROKE_GRACE,
  SWIM_SURFACE_OFFSET,
  SWIM_VERTICAL_SPEED,
  SWIM_VISUAL_LIFT,
  SWIM_VISUAL_PIVOT_SHIFT,
  TARGET_MODEL_HEIGHT,
  TREAD_ANIMATION_URL,
  URL_PARAMS,
  WALKING_ANIMATION_URL,
  WALKING_BODY_MODE,
  WATER_SCENE_ENABLED,
  createInitialWaterSettings,
  keyboardMap,
} from './params.js';
import {
  IndoorBackdrop,
  IndoorGroundRecovery,
  IndoorSceneDebugProbe,
  useIndoorEnvironment,
} from './scenes/indoorScene.jsx';
import {
  INITIAL_WATER_ENVIRONMENT,
  WATER_ENVIRONMENT_PRESETS,
  seaBedHeight,
} from './scenes/stage.js';
import {
  GrassField,
  ShowcaseTreeRow,
  TreeFoliageRig,
} from './scenes/vegetation.jsx';
import {
  BENCH_SEAT,
  BenchSitController,
  HorizonSilhouettes,
  KelpField,
  MegascanProps,
  RainView,
  SeaBedCollider,
  SeaRocks,
  SeaStage,
  StylizedSkyView,
  UnderwaterAtmosphere,
  WaterBall,
  WaterHud,
  WaterSurfaceView,
} from './scenes/waterScenes.jsx';

const facingHeadScratch = new THREE.Vector3();
const facingHipsScratch = new THREE.Vector3();
const snapPosScratch = new THREE.Vector3();

function LoadingLabel({ children }) {
  return (
    <Html center>
      <div className="scene-status">{children}</div>
    </Html>
  );
}

const SIT_SCRATCH_QUAT = new THREE.Quaternion();
const SIT_SCRATCH_EULER = new THREE.Euler();

// ecctrl's float spring settles ~0.04 m below BODY_CENTER_AT_REST under
// gravity (measured at rest on flat ground), so every scene lifts the visual
// group by the same amount — without it characters stand heel-deep in the
// floor.
const FLOAT_SPRING_SAG = 0.04;

function ControlledPmxModel({ controllerRef, swimStateRef = null, sitStateRef = null, visualYOffset = 0 }) {
  const gl = useThree((state) => state.gl);
  const mixerRef = useRef(null);
  const idleActionRef = useRef(null);
  const walkActionRef = useRef(null);
  const runActionRef = useRef(null);
  const jumpActionRef = useRef(null);
  const swimActionRef = useRef(null);
  const treadActionRef = useRef(null);
  const diveActionRef = useRef(null);
  const freestyleActionRef = useRef(null);
  const sitActionRef = useRef(null);
  const sitBlendRef = useRef(0);
  const swimBlendRef = useRef(0);
  const swimMoveBlendRef = useRef(0);
  const strokeGraceRef = useRef(0);
  const sprintGraceRef = useRef(0);
  const diveBlendRef = useRef(0);
  const freestyleBlendRef = useRef(0);
  const walkWeightRef = useRef(0);
  const runBlendRef = useRef(0);
  const jumpWeightRef = useRef(0);
  const jumpPlayingRef = useRef(false);
  const jumpRequestRef = useRef(false);
  const runKeyRef = useRef(false);
  const moveKeyRef = useRef(false);
  const armPoseRef = useRef(null);
  const vrmRef = useRef(null);
  const visualGroupRef = useRef(null);
  const facingBonesRef = useRef(null);
  const snapDetectRef = useRef({ pos: new THREE.Vector3(), valid: false });
  const [modelState, setModelState] = useState({
    error: null,
    root: null,
  });

  useEffect(() => {
    let cancelled = false;
    let cleanupButton = updateAnimationToggle({ label: 'Controller Loading' });
    let cleanupToonHud = () => {};

    async function loadCharacter() {
      try {
        updateModeLabel('loading');
        const asset = await loadModelAsset(MODEL_URL, { renderer: gl });

        if (cancelled) return;

        await waitForObjectTextures(asset.root);
        if (cancelled) return;

        setObjectTextureColorSpaces(asset.root);
        const bounds = fitModelForController(asset.root, TARGET_MODEL_HEIGHT);
        bakeSolidBaseColorTextures(asset.root);
        const toonState = applyToonShader(asset.root, {
          outline: SHADER_MODE === 'anime',
          preset: URL_PARAMS.get('toonPreset') || null,
          shaderMode: SHADER_MODE,
        });
        cleanupToonHud = mountCharacterToonHud({
          initialSettings: toonState.settings,
          modelRoot: asset.root,
        });

        prepareModelForRealtime(asset.root);
        vrmRef.current = asset.vrm ?? null;

        let action = null;
        let actions = [];
        const targetMesh = findPrimarySkinnedMesh(asset.root);
        // The relaxed-arm override fights the mixer (it rewrites the arm bones
        // after every update), so only use it when no Mixamo clip drives the body.
        const armPoseAllowed = !(ENABLE_IDLE_ANIMATION || ENABLE_WALKING_ANIMATION);
        armPoseRef.current = targetMesh && armPoseAllowed ? createArmPoseState(targetMesh) : null;
        armPoseRef.current?.apply();
        document.body.dataset.armPoseMode = ARM_POSE_MODE;
        document.body.dataset.armPoseRelax = String(RELAXED_ARM_Z_OFFSET);
        exposePoseDebug(asset.root, targetMesh, null, actions);
        const nativeLocomotionClips = (ENABLE_IDLE_ANIMATION || ENABLE_WALKING_ANIMATION)
          ? resolveNativeLocomotionClips(asset.clips)
          : null;
        // Both branches want the rig: the retarget path keys every clip off
        // it, the native path uses it to bake the procedural freestyle clip.
        const rig = targetMesh ? resolveCharacterRig(targetMesh, { vrm: asset.vrm }) : null;
        if (rig) document.body.dataset.rigType = rig.type;
        if (targetMesh && rig) {
          const boneByRole = (role) => {
            const name = targetBoneNameForRole(rig, role);
            return targetMesh.skeleton.bones.find((bone) => bone.name === name) || null;
          };
          facingBonesRef.current = { head: boneByRole('head'), hips: boneByRole('hips') };
        }
        if (nativeLocomotionClips) {
          // Native clips animate scene nodes by name, so the mixer roots at
          // the model scene rather than the skinned mesh.
          const mixer = new THREE.AnimationMixer(asset.root);
          mixerRef.current = mixer;
          exposePoseDebug(asset.root, targetMesh, mixer, actions);
          // Bones are still in bind pose here (nothing awaits before the
          // actions start), but snapshot anyway so the freestyle bake below
          // is robust against anything posing the skeleton in between.
          const restoreBindPose = targetMesh ? snapshotSkeletonLocalPose(targetMesh) : null;

          const startLoopingAction = (clip, weight) => {
            const loopAction = mixer.clipAction(clip);
            loopAction.reset();
            loopAction.enabled = true;
            loopAction.setLoop(THREE.LoopRepeat, Infinity);
            loopAction.setEffectiveWeight(weight);
            loopAction.play();
            actions.push(loopAction);
            return loopAction;
          };

          idleActionRef.current = startLoopingAction(nativeLocomotionClips.idle, 1);
          action = idleActionRef.current;
          document.body.dataset.idleAnimationReady = 'true';
          document.body.dataset.idleAnimationUrl = `${MODEL_URL}#${nativeLocomotionClips.idle.name}`;
          document.body.dataset.idleRetargetMode = 'native';
          document.body.dataset.idleAnimationWeight = '1.000';

          if (ENABLE_WALKING_ANIMATION) {
            walkActionRef.current = startLoopingAction(nativeLocomotionClips.walk, 0);
            walkWeightRef.current = 0;
            document.body.dataset.walkingAnimationUrl = `${MODEL_URL}#${nativeLocomotionClips.walk.name}`;
            document.body.dataset.walkingRetargetMode = 'native';

            if (ENABLE_RUNNING_ANIMATION && nativeLocomotionClips.run) {
              runActionRef.current = startLoopingAction(nativeLocomotionClips.run, 0);
              runBlendRef.current = 0;
              document.body.dataset.runningAnimationUrl = `${MODEL_URL}#${nativeLocomotionClips.run.name}`;
              document.body.dataset.runningAnimationWeight = '0.000';
            }

            if (ENABLE_JUMP_ANIMATION && nativeLocomotionClips.jump) {
              const jumpClip = nativeLocomotionClips.jump;
              const jumpAction = mixer.clipAction(jumpClip);
              jumpAction.reset();
              jumpAction.enabled = true;
              // One-shot: hold the final airborne pose during long falls.
              jumpAction.setLoop(THREE.LoopOnce, 0);
              jumpAction.clampWhenFinished = true;
              jumpAction.timeScale = Math.max(1, jumpClip.duration / 1.25);
              jumpAction.setEffectiveWeight(0);
              jumpActionRef.current = jumpAction;
              jumpWeightRef.current = 0;
              actions.push(jumpAction);
              document.body.dataset.jumpAnimationUrl = `${MODEL_URL}#${jumpClip.name}`;
              document.body.dataset.jumpAnimationWeight = '0.000';
            }

            if (ENABLE_SWIM_ANIMATION) {
              if (targetMesh && rig) {
                // The swim controller's float height and prone orientation
                // conventions come from the Mixamo world bake (hip height is
                // normalized onto the carrier bone). Native swim clips are
                // authored against the ground plane and sink the body, so a
                // model with a resolvable rig swims with the same retargeted
                // Mixamo set every other character uses.
                const swimClipSpecs = [
                  { key: 'swim', ref: swimActionRef, url: SWIM_ANIMATION_URL, name: 'Swimming' },
                  { key: 'tread', ref: treadActionRef, url: TREAD_ANIMATION_URL, name: 'TreadingWater' },
                  { key: 'dive', ref: diveActionRef, url: DIVE_ANIMATION_URL, name: 'DiveSwim' },
                ];
                for (const spec of swimClipSpecs) {
                  try {
                    restoreBindPose?.();
                    const { clip, sourceTrackCount } = await loadSwimClipForTarget(
                      targetMesh, rig, spec.url, spec.name, { trackNameStyle: 'node' });
                    if (cancelled) return;
                    spec.ref.current = startLoopingAction(clip, 0);
                    document.body.dataset[spec.key + 'AnimationUrl'] = spec.url;
                    console.log(`${spec.name} animation retargeted onto native-clip model (${rig.type}): ${sourceTrackCount} source tracks -> ${clip.tracks.length} target tracks`);
                  } catch (error) {
                    if (cancelled) return;
                    // No Mixamo FBX (fresh clones ship none — see the
                    // assets-local drop-in in docs/characters.md): fall
                    // back to the model's own clip for this role. Native
                    // swim clips are ground-authored and ride lower in the
                    // water than the retargeted set.
                    const nativeClip = nativeLocomotionClips?.[spec.key];
                    if (nativeClip) {
                      spec.ref.current = startLoopingAction(nativeClip, 0);
                      document.body.dataset[spec.key + 'AnimationUrl'] = `${MODEL_URL}#${nativeClip.name}`;
                      console.warn(`${spec.name} retarget unavailable (${spec.url}); using native clip ${nativeClip.name}:`, error);
                    } else {
                      console.warn(`${spec.name} animation unavailable (${spec.url}):`, error);
                    }
                  }
                }
              } else {
                if (nativeLocomotionClips.swim) {
                  swimActionRef.current = startLoopingAction(nativeLocomotionClips.swim, 0);
                  document.body.dataset.swimAnimationUrl = `${MODEL_URL}#${nativeLocomotionClips.swim.name}`;
                }
                if (nativeLocomotionClips.tread) {
                  treadActionRef.current = startLoopingAction(nativeLocomotionClips.tread, 0);
                  document.body.dataset.treadAnimationUrl = `${MODEL_URL}#${nativeLocomotionClips.tread.name}`;
                }
              }

              // The sprint stroke is procedural, so native-clip models get it
              // too when their skeleton maps onto the humanoid roles.
              if (URL_PARAMS.get('freestyleAnim') !== 'none' && targetMesh && rig) {
                try {
                  restoreBindPose?.();
                  const freestyleClip = createFreestyleSwimClip(targetMesh, rig, { trackNameStyle: 'node' });
                  const freestyleAction = mixer.clipAction(freestyleClip);
                  freestyleAction.reset();
                  freestyleAction.enabled = true;
                  freestyleAction.setLoop(THREE.LoopRepeat, Infinity);
                  freestyleAction.setEffectiveWeight(0);
                  freestyleAction.play();
                  freestyleActionRef.current = freestyleAction;
                  actions.push(freestyleAction);
                  document.body.dataset.freestyleAnimationSource = 'procedural';
                  console.log(`Freestyle swim clip generated procedurally (${rig.type} rig): ${freestyleClip.tracks.length} tracks`);
                } catch (error) {
                  if (cancelled) return;
                  console.warn('Freestyle swim clip generation failed:', error);
                }
              }
            }
          }

          if (targetMesh && rig) {
            try {
              restoreBindPose?.();
              const { clip: sitClip, sourceTrackCount } = await loadSitClipForTarget(
                targetMesh, rig, { trackNameStyle: 'node' });
              if (cancelled) return;
              sitActionRef.current = startLoopingAction(sitClip, 0);
              document.body.dataset.sitAnimationUrl = SIT_ANIMATION_URL;
              console.log(`SittingIdle animation retargeted onto native-clip model (${rig.type}): ${sourceTrackCount} source tracks -> ${sitClip.tracks.length} target tracks`);
            } catch (error) {
              if (cancelled) return;
              console.warn(`SittingIdle animation unavailable (${SIT_ANIMATION_URL}):`, error);
            }
          }

          console.log(`Native locomotion clips (no retarget): ${Object.entries(nativeLocomotionClips)
            .map(([role, clip]) => `${role}=${clip.name}`)
            .join(', ')}`);
          document.body.dataset.animationReady = 'true';
        } else if (ENABLE_IDLE_ANIMATION || ENABLE_WALKING_ANIMATION) {
          if (!targetMesh) {
            throw new Error('No skinned mesh was found for Mixamo FBX retargeting.');
          }
          if (!rig) {
            throw new Error('No known humanoid rig convention matched this model (VRM, MMD, Mixamo, or Rigify bone names) and it ships no usable native clips.');
          }

          const mixer = new THREE.AnimationMixer(targetMesh);
          mixerRef.current = mixer;
          // The mixer starts posing bones as soon as the first action plays,
          // while later clips are still loading. Snapshot the bind pose now so
          // the procedural freestyle clip can be baked against it.
          const restoreBindPose = snapshotSkeletonLocalPose(targetMesh);
          exposePoseDebug(asset.root, targetMesh, mixer, actions);

          if (ENABLE_IDLE_ANIMATION) {
            const { clip: idleClip, sourceTrackCount } = await loadIdleClipForTarget(targetMesh, rig);
            if (cancelled) return;

            const idleAction = mixer.clipAction(idleClip);
            idleAction.reset();
            idleAction.enabled = true;
            idleAction.setLoop(THREE.LoopRepeat, Infinity);
            idleAction.setEffectiveWeight(1);
            idleAction.play();
            idleActionRef.current = idleAction;
            action = action || idleAction;
            actions.push(idleAction);
            document.body.dataset.idleAnimationReady = 'true';
            document.body.dataset.idleAnimationUrl = IDLE_ANIMATION_URL;
            document.body.dataset.idleRetargetMode = RETARGET_MODE;
            document.body.dataset.idleBodyMode = IDLE_BODY_MODE;
            document.body.dataset.idleSourceTrackCount = String(sourceTrackCount);
            document.body.dataset.idleRetargetTrackCount = String(idleClip.tracks.length);
            document.body.dataset.idleAnimationWeight = '1.000';
            console.log(`Idle animation retargeted (${RETARGET_MODE}/${IDLE_BODY_MODE}): ${sourceTrackCount} source tracks -> ${idleClip.tracks.length} target tracks`);
          }

          if (ENABLE_WALKING_ANIMATION) {
            const { clip: walkingClip, sourceTrackCount } = await loadWalkingClipForTarget(targetMesh, rig);
            if (cancelled) return;

            const walkingAction = mixer.clipAction(walkingClip);
            walkingAction.reset();
            walkingAction.enabled = true;
            walkingAction.setLoop(THREE.LoopRepeat, Infinity);
            walkingAction.setEffectiveWeight(0);
            walkingAction.play();
            walkActionRef.current = walkingAction;
            walkWeightRef.current = 0;
            action = action || walkingAction;
            actions.push(walkingAction);
            document.body.dataset.walkingAnimationUrl = WALKING_ANIMATION_URL;
            document.body.dataset.walkingRetargetMode = RETARGET_MODE;
            document.body.dataset.walkingBodyMode = WALKING_BODY_MODE;
            document.body.dataset.walkingSourceTrackCount = String(sourceTrackCount);
            document.body.dataset.walkingRetargetTrackCount = String(walkingClip.tracks.length);
            console.log(`Walking animation retargeted (${RETARGET_MODE}/${WALKING_BODY_MODE}): ${sourceTrackCount} source tracks -> ${walkingClip.tracks.length} target tracks`);
          }

          if (ENABLE_RUNNING_ANIMATION) {
            try {
              const { clip: runningClip, sourceTrackCount } = await loadRunningClipForTarget(targetMesh, rig);
              if (cancelled) return;

              const runningAction = mixer.clipAction(runningClip);
              runningAction.reset();
              runningAction.enabled = true;
              runningAction.setLoop(THREE.LoopRepeat, Infinity);
              runningAction.setEffectiveWeight(0);
              runningAction.play();
              runActionRef.current = runningAction;
              runBlendRef.current = 0;
              actions.push(runningAction);
              document.body.dataset.runningAnimationUrl = RUNNING_ANIMATION_URL;
              document.body.dataset.runningRetargetTrackCount = String(runningClip.tracks.length);
              document.body.dataset.runningAnimationWeight = '0.000';
              console.log(`Running animation retargeted (${RETARGET_MODE}/${RUNNING_BODY_MODE}): ${sourceTrackCount} source tracks -> ${runningClip.tracks.length} target tracks`);
            } catch (error) {
              if (cancelled) return;
              console.warn(`Running animation unavailable (${RUNNING_ANIMATION_URL}):`, error);
            }
          }

          if (ENABLE_JUMP_ANIMATION) {
            try {
              const { clip: jumpClip, sourceTrackCount } = await loadJumpClipForTarget(targetMesh, rig);
              if (cancelled) return;

              const jumpAction = mixer.clipAction(jumpClip);
              jumpAction.reset();
              jumpAction.enabled = true;
              // One-shot: hold the final airborne pose during long falls.
              jumpAction.setLoop(THREE.LoopOnce, 0);
              jumpAction.clampWhenFinished = true;
              // Mixamo jump clips run 2s+; compress toward ecctrl's ~1.2s air
              // time so the animation lands roughly when the body does.
              jumpAction.timeScale = Math.max(1, jumpClip.duration / 1.25);
              jumpAction.setEffectiveWeight(0);
              jumpActionRef.current = jumpAction;
              jumpWeightRef.current = 0;
              actions.push(jumpAction);
              document.body.dataset.jumpAnimationUrl = JUMP_ANIMATION_URL;
              document.body.dataset.jumpRetargetTrackCount = String(jumpClip.tracks.length);
              document.body.dataset.jumpAnimationWeight = '0.000';
              console.log(`Jump animation retargeted (${RETARGET_MODE}/${JUMP_BODY_MODE}): ${sourceTrackCount} source tracks -> ${jumpClip.tracks.length} target tracks`);
            } catch (error) {
              if (cancelled) return;
              console.warn(`Jump animation unavailable (${JUMP_ANIMATION_URL}):`, error);
            }
          }

          if (ENABLE_SWIM_ANIMATION) {
            const swimClipSpecs = [
              { key: 'swim', ref: swimActionRef, url: SWIM_ANIMATION_URL, name: 'Swimming' },
              { key: 'tread', ref: treadActionRef, url: TREAD_ANIMATION_URL, name: 'TreadingWater' },
              { key: 'dive', ref: diveActionRef, url: DIVE_ANIMATION_URL, name: 'DiveSwim' },
            ];
            for (const spec of swimClipSpecs) {
              try {
                const { clip, sourceTrackCount } = await loadSwimClipForTarget(targetMesh, rig, spec.url, spec.name);
                if (cancelled) return;
                const swimClipAction = mixer.clipAction(clip);
                swimClipAction.reset();
                swimClipAction.enabled = true;
                swimClipAction.setLoop(THREE.LoopRepeat, Infinity);
                swimClipAction.setEffectiveWeight(0);
                swimClipAction.play();
                spec.ref.current = swimClipAction;
                actions.push(swimClipAction);
                document.body.dataset[spec.key + 'AnimationUrl'] = spec.url;
                console.log(`${spec.name} animation retargeted: ${sourceTrackCount} source tracks -> ${clip.tracks.length} target tracks`);
              } catch (error) {
                if (cancelled) return;
                console.warn(`${spec.name} animation unavailable (${spec.url}):`, error);
              }
            }

            if (URL_PARAMS.get('freestyleAnim') !== 'none') {
              try {
                // Generated in code, not loaded from an FBX; needs the bind
                // pose the mixer has been overwriting since the idle clip
                // started playing.
                restoreBindPose();
                const freestyleClip = createFreestyleSwimClip(targetMesh, rig);
                const freestyleAction = mixer.clipAction(freestyleClip);
                freestyleAction.reset();
                freestyleAction.enabled = true;
                freestyleAction.setLoop(THREE.LoopRepeat, Infinity);
                freestyleAction.setEffectiveWeight(0);
                freestyleAction.play();
                freestyleActionRef.current = freestyleAction;
                actions.push(freestyleAction);
                document.body.dataset.freestyleAnimationSource = 'procedural';
                console.log(`Freestyle swim clip generated procedurally: ${freestyleClip.tracks.length} tracks`);
              } catch (error) {
                if (cancelled) return;
                console.warn('Freestyle swim clip generation failed:', error);
              }
            }
          }

          try {
            const { clip: sitClip, sourceTrackCount } = await loadSitClipForTarget(targetMesh, rig);
            if (cancelled) return;
            const sitAction = mixer.clipAction(sitClip);
            sitAction.reset();
            sitAction.enabled = true;
            sitAction.setLoop(THREE.LoopRepeat, Infinity);
            sitAction.setEffectiveWeight(0);
            sitAction.play();
            sitActionRef.current = sitAction;
            actions.push(sitAction);
            document.body.dataset.sitAnimationUrl = SIT_ANIMATION_URL;
            console.log(`SittingIdle animation retargeted: ${sourceTrackCount} source tracks -> ${sitClip.tracks.length} target tracks`);
          } catch (error) {
            if (cancelled) return;
            console.warn(`SittingIdle animation unavailable (${SIT_ANIMATION_URL}):`, error);
          }

          exposePoseDebug(asset.root, targetMesh, mixer, actions);

          document.body.dataset.animationReady = 'true';
        } else if (ENABLE_NATIVE_ANIMATION && asset.clips?.length) {
          const mixer = new THREE.AnimationMixer(asset.root);
          action = mixer.clipAction(asset.clips[0]);
          action.reset().play();
          mixerRef.current = mixer;
          actions = [action];
          document.body.dataset.animationReady = 'true';
        } else {
          document.body.dataset.animationReady = ANIMATION_REQUESTED ? 'none' : 'none';
          document.body.dataset.animationPlayback = 'off';
        }

        cleanupButton();
        cleanupButton = updateAnimationToggle({
          actions,
          enabled: actions.length > 0,
          label: 'Controller On',
        });

        document.body.dataset.modelFormat = asset.format;
        document.body.dataset.modelUrl = MODEL_URL;
        document.body.dataset.convertedMeshCount = String(toonState.convertedMeshCount);
        document.body.dataset.modelBoundsHeight = bounds
          ? bounds.getSize(new THREE.Vector3()).y.toFixed(3)
          : '0';
        document.body.dataset.modelReady = 'true';
        updateModeLabel('ready');

        setModelState({
          error: null,
          root: asset.root,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load ecctrl character:', error);
        cleanupButton();
        cleanupButton = updateAnimationToggle({ label: 'Controller Error' });
        document.body.dataset.modelReady = 'error';
        document.body.dataset.animationReady = 'error';
        updateModeLabel('error');
        setModelState({
          error,
          root: null,
        });
      }
    }

    loadCharacter();

    return () => {
      cancelled = true;
      cleanupButton();
      cleanupToonHud();
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      idleActionRef.current = null;
      walkActionRef.current = null;
      runActionRef.current = null;
      jumpActionRef.current = null;
      swimActionRef.current = null;
      treadActionRef.current = null;
      diveActionRef.current = null;
      freestyleActionRef.current = null;
      sitActionRef.current = null;
      sitBlendRef.current = 0;
      swimBlendRef.current = 0;
      swimMoveBlendRef.current = 0;
      strokeGraceRef.current = 0;
      sprintGraceRef.current = 0;
      diveBlendRef.current = 0;
      freestyleBlendRef.current = 0;
      walkWeightRef.current = 0;
      runBlendRef.current = 0;
      jumpWeightRef.current = 0;
      jumpPlayingRef.current = false;
      jumpRequestRef.current = false;
      armPoseRef.current = null;
      vrmRef.current = null;
      facingBonesRef.current = null;
    };
  }, [controllerRef, gl]);

  useEffect(() => {
    // Mirror ecctrl's inputs for the animation blend. The physics body is not
    // a reliable source here: in the water scene the ground stabilizer holds
    // it in a fall/snap loop that injects both vertical and planar velocity.
    const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const heldMoveCodes = new Set();
    const onKeyDown = (event) => {
      if (event.key === 'Shift') runKeyRef.current = true;
      if (event.code === 'Space') jumpRequestRef.current = true;
      if (MOVE_CODES.has(event.code)) {
        heldMoveCodes.add(event.code);
        moveKeyRef.current = true;
      }
    };
    const onKeyUp = (event) => {
      if (event.key === 'Shift') runKeyRef.current = false;
      if (MOVE_CODES.has(event.code)) {
        heldMoveCodes.delete(event.code);
        moveKeyRef.current = heldMoveCodes.size > 0;
      }
    };
    const onBlur = () => {
      heldMoveCodes.clear();
      moveKeyRef.current = false;
      runKeyRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame((_, delta) => {
    const clampedDelta = Math.min(delta, 0.05);
    const walkAction = walkActionRef.current;
    const body = controllerRef.current?.group;

    if (walkAction && body) {
      const velocity = body.linvel();
      const planarSpeed = Math.hypot(velocity.x, velocity.z);
      const grounded = Boolean(body.userData?.canJump);
      const runAction = runActionRef.current;
      const jumpAction = jumpActionRef.current;

      const swimState = swimStateRef?.current;
      const swimming = Boolean(swimState?.swimming)
        && Boolean(swimActionRef.current || treadActionRef.current || freestyleActionRef.current);

      // Jump: input-triggered one-shot that fades back out as the clip ends.
      // Suppressed while swimming — space means "swim up" there.
      if (jumpAction) {
        if (jumpRequestRef.current && !jumpPlayingRef.current && !swimming) {
          jumpAction.reset().play();
          jumpPlayingRef.current = true;
        }
        const jumpDuration = jumpAction.getClip().duration;
        if (jumpPlayingRef.current && (jumpAction.paused || jumpAction.time >= jumpDuration - 0.2)) {
          jumpPlayingRef.current = false;
        }
        jumpWeightRef.current = THREE.MathUtils.damp(
          jumpWeightRef.current,
          jumpPlayingRef.current ? 1 : 0,
          14,
          clampedDelta,
        );
      }
      jumpRequestRef.current = false;
      const jumpWeight = jumpAction ? jumpWeightRef.current : 0;

      // Grounded locomotion gated on movement input (physics velocity is
      // noisy here), split walk<->run by the sprint key.
      const moving = moveKeyRef.current;
      const locomotionTarget = grounded && moving && !swimming ? 1 : 0;
      walkWeightRef.current = THREE.MathUtils.damp(walkWeightRef.current, locomotionTarget, 10, clampedDelta);
      const sprinting = runKeyRef.current || planarSpeed > RUN_BLEND_MIN_SPEED;
      const runTarget = runAction && sprinting && moving ? 1 : 0;
      runBlendRef.current = THREE.MathUtils.damp(runBlendRef.current, runTarget, 10, clampedDelta);

      // Swim layer: surface tread <-> surface stroke <-> dive stroke.
      swimBlendRef.current = THREE.MathUtils.damp(swimBlendRef.current, swimming ? 1 : 0, 8, clampedDelta);
      // Reversing direction (left then right) usually overlaps both keys for
      // a moment: the inputs cancel and planar speed dips through zero, so
      // without a grace hold the pose flaps stroke -> tread -> stroke — the
      // body rears up vertical and flattens again, reading as a jump. Real
      // swimmers glide through a reversal: hold the stroke (and the sprint
      // crawl) for a beat after their conditions lapse.
      const strokeActive = Boolean(swimState?.diving) || moving || planarSpeed > 0.4;
      strokeGraceRef.current = strokeActive
        ? SWIM_STROKE_GRACE
        : Math.max(0, strokeGraceRef.current - clampedDelta);
      const swimMoveTarget = swimming && (strokeActive || strokeGraceRef.current > 0) ? 1 : 0;
      swimMoveBlendRef.current = THREE.MathUtils.damp(swimMoveBlendRef.current, swimMoveTarget, 8, clampedDelta);
      diveBlendRef.current = THREE.MathUtils.damp(diveBlendRef.current, swimState?.diving ? 1 : 0, 8, clampedDelta);
      // Sprinting at the surface swaps the stroke for the freestyle crawl.
      const sprintActive = Boolean(swimState?.sprinting) || planarSpeed > RUN_BLEND_MIN_SPEED;
      sprintGraceRef.current = sprintActive
        ? SWIM_STROKE_GRACE
        : Math.max(0, sprintGraceRef.current - clampedDelta);
      const swimSprinting = swimming && !swimState?.diving
        && (sprintActive || sprintGraceRef.current > 0);
      freestyleBlendRef.current = THREE.MathUtils.damp(freestyleBlendRef.current, swimSprinting ? 1 : 0, 8, clampedDelta);

      const swimAction = swimActionRef.current;
      const treadAction = treadActionRef.current;
      const diveAction = diveActionRef.current;
      const freestyleAction = freestyleActionRef.current;
      const swimBlend = (swimAction || treadAction || freestyleAction) ? swimBlendRef.current : 0;
      const groundScale = 1 - swimBlend;

      // Seated overlay: replaces grounded locomotion while the bench sit
      // state is active; swimming always wins.
      const seated = Boolean(sitStateRef?.current?.sitting) && Boolean(sitActionRef.current) && !swimming;
      sitBlendRef.current = THREE.MathUtils.damp(sitBlendRef.current, seated ? 1 : 0, 8, clampedDelta);
      const sitBlend = sitActionRef.current ? sitBlendRef.current : 0;
      const seatScale = 1 - sitBlend;

      // Ground weights sum to (1 - swimBlend): idle + walk + run + jump + sit.
      const locomotionWeight = walkWeightRef.current * (1 - jumpWeight) * groundScale * seatScale;
      const runWeight = locomotionWeight * runBlendRef.current;
      const walkWeight = locomotionWeight - runWeight;
      const idleWeight = (1 - walkWeightRef.current) * (1 - jumpWeight) * groundScale * seatScale;
      const sitWeight = sitBlend * groundScale;

      // Swim weights sum to swimBlend, with fallbacks when a clip is missing.
      let diveWeight = diveAction ? swimBlend * diveBlendRef.current : 0;
      let strokeWeight = (swimBlend - diveWeight) * swimMoveBlendRef.current;
      let treadWeight = swimBlend - diveWeight - strokeWeight;
      let freestyleWeight = freestyleAction ? strokeWeight * freestyleBlendRef.current : 0;
      strokeWeight -= freestyleWeight;
      if (!swimAction) { treadWeight += strokeWeight; strokeWeight = 0; }
      if (!treadAction && swimAction) { strokeWeight += treadWeight; treadWeight = 0; }

      walkAction.setEffectiveWeight(walkWeight);
      walkAction.timeScale = THREE.MathUtils.clamp(planarSpeed / 1.45, 0.65, 1.45);
      if (runAction) {
        runAction.setEffectiveWeight(runWeight);
        runAction.timeScale = THREE.MathUtils.clamp(planarSpeed / 3.0, 0.75, 1.35);
      }
      jumpAction?.setEffectiveWeight(jumpWeight * groundScale * seatScale);
      idleActionRef.current?.setEffectiveWeight(idleWeight);
      sitActionRef.current?.setEffectiveWeight(sitWeight);
      if (swimAction) {
        swimAction.setEffectiveWeight(strokeWeight);
        swimAction.timeScale = THREE.MathUtils.clamp(planarSpeed / 1.7, 0.75, 1.35);
      }
      treadAction?.setEffectiveWeight(treadWeight);
      diveAction?.setEffectiveWeight(diveWeight);
      if (freestyleAction) {
        freestyleAction.setEffectiveWeight(freestyleWeight);
        freestyleAction.timeScale = THREE.MathUtils.clamp(planarSpeed / SWIM_SPRINT_SPEED, 0.8, 1.3);
      }

      document.body.dataset.idleAnimationWeight = idleWeight.toFixed(3);
      document.body.dataset.walkingAnimationWeight = walkWeight.toFixed(3);
      document.body.dataset.runningAnimationWeight = runWeight.toFixed(3);
      document.body.dataset.jumpAnimationWeight = (jumpWeight * groundScale).toFixed(3);
      document.body.dataset.swimAnimationWeight = strokeWeight.toFixed(3);
      document.body.dataset.treadAnimationWeight = treadWeight.toFixed(3);
      document.body.dataset.diveAnimationWeight = diveWeight.toFixed(3);
      document.body.dataset.freestyleAnimationWeight = freestyleWeight.toFixed(3);
      document.body.dataset.sitAnimationWeight = sitWeight.toFixed(3);
      document.body.dataset.walkingAnimationSpeed = walkAction.timeScale.toFixed(3);
      document.body.dataset.planarSpeed = planarSpeed.toFixed(3);
    }

    mixerRef.current?.update(clampedDelta);
    // Spring bones (hair/skirt physics), lookAt, and expressions; the
    // humanoid bone copy is disabled at load since the mixer drives the raw
    // bones directly.
    vrmRef.current?.update(clampedDelta);
    armPoseRef.current?.apply();
    if (visualGroupRef.current) {
      visualGroupRef.current.position.z = swimBlendRef.current * SWIM_VISUAL_PIVOT_SHIFT;
      visualGroupRef.current.position.y = -BODY_CENTER_AT_REST + visualYOffset
        + swimBlendRef.current * SWIM_VISUAL_LIFT
        - sitBlendRef.current * SIT_VISUAL_DROP;
      // Seated facing: ecctrl re-asserts the model yaw from its own input
      // euler every frame, so the seat-facing turn lives on the visual group
      // as a blended local offset against the parent's current world yaw.
      const seatYaw = sitStateRef?.current?.seatYaw;
      if (sitBlendRef.current > 0.005 && Number.isFinite(seatYaw) && visualGroupRef.current.parent) {
        visualGroupRef.current.parent.getWorldQuaternion(SIT_SCRATCH_QUAT);
        SIT_SCRATCH_EULER.setFromQuaternion(SIT_SCRATCH_QUAT, 'YXZ');
        const deltaYaw = THREE.MathUtils.euclideanModulo(
          seatYaw - SIT_SCRATCH_EULER.y + Math.PI, Math.PI * 2) - Math.PI;
        visualGroupRef.current.rotation.y = deltaYaw * sitBlendRef.current;
      } else {
        visualGroupRef.current.rotation.y = 0;
      }
    }
    // Publish the prone body's facing (horizontal head-hips direction of the
    // actual bones — convention-free across rigs) so the swim controller can
    // fade propulsion while the swimmer points away from the steered
    // direction. Near-vertical poses (treading) publish NaN, which opens the
    // gate: turning in place while vertical is unproblematic.
    // Snap detector (diagnostic): the visible model should never move farther
    // in one frame than its speed allows. When it does, dump the full swim
    // state so live sessions can report exactly what snapped and when —
    // headless verification can't observe this class of bug.
    if (visualGroupRef.current) {
      visualGroupRef.current.getWorldPosition(snapPosScratch);
      const snapState = snapDetectRef.current;
      if (snapState.valid) {
        const moved = snapPosScratch.distanceTo(snapState.pos);
        const speedNow = Number(document.body.dataset.planarSpeed) || 0;
        // Raw frame delta: on slow frames the body legitimately covers
        // speed * elapsed between paints — the clamped delta would flag it.
        const allowance = Math.max(0.4, (speedNow + 1) * delta * 3 + 0.25);
        if (moved > allowance) {
          const info = {
            moved: +moved.toFixed(2),
            from: snapState.pos.toArray().map((v) => +v.toFixed(2)),
            to: snapPosScratch.toArray().map((v) => +v.toFixed(2)),
            swimMode: document.body.dataset.swimMode,
            swimDepth: document.body.dataset.swimDepth,
            speed: document.body.dataset.planarSpeed,
            facingError: document.body.dataset.swimFacingError,
            weights: {
              swim: document.body.dataset.swimAnimationWeight,
              tread: document.body.dataset.treadAnimationWeight,
              freestyle: document.body.dataset.freestyleAnimationWeight,
              idle: document.body.dataset.idleAnimationWeight,
            },
          };
          console.warn('[swim-snap]', JSON.stringify(info));
          document.body.dataset.lastSwimSnap = JSON.stringify(info);
        }
      }
      snapState.pos.copy(snapPosScratch);
      snapState.valid = true;
    }
    const facingBones = facingBonesRef.current;
    if (swimStateRef?.current && facingBones?.head && facingBones?.hips) {
      facingHeadScratch.setFromMatrixPosition(facingBones.head.matrixWorld);
      facingHipsScratch.setFromMatrixPosition(facingBones.hips.matrixWorld);
      facingHeadScratch.sub(facingHipsScratch);
      facingHeadScratch.y = 0;
      swimStateRef.current.facingYaw = facingHeadScratch.lengthSq() > 0.09
        ? Math.atan2(facingHeadScratch.x, facingHeadScratch.z)
        : NaN;
    }
  });

  if (modelState.error) {
    return <LoadingLabel>Failed to load character</LoadingLabel>;
  }

  if (!modelState.root) {
    return <LoadingLabel>Loading character</LoadingLabel>;
  }

  return (
    <group
      ref={visualGroupRef}
      position={[0, -BODY_CENTER_AT_REST + visualYOffset, 0]}
      userData={{ skipWaterReflection: true }}
    >
      <primitive object={modelState.root} />
    </group>
  );
}

// The forced-WebGL2 node backend buffer-skins skinned shadow casters; an MMD
// skeleton (ganyu, >256 bones) then overflows GL_MAX_UNIFORM_BLOCK_SIZE and
// the shadow render throws. Drop just that mesh from the shadow map there so
// the rest of the scene still casts. Native WebGPU (storage skinning) and
// legacy WebGL keep the caster.
const MAX_SHADOW_SKIN_BONES = 256;
function guardOversizedShadowCaster(root, gl) {
  const forcedGl = gl?.isWebGPURenderer && gl?.backend?.isWebGPUBackend !== true;
  if (!forcedGl) return;
  root.traverse((obj) => {
    if (obj.isSkinnedMesh && (obj.skeleton?.bones?.length ?? 0) > MAX_SHADOW_SKIN_BONES) {
      obj.castShadow = false;
    }
  });
}

// The water scene mixes two shadow-receiver families: MeshToonMaterial ground/
// banks/bench (native three shadows, kept ON here) and the TSL grass + tree
// canopies, whose custom fragmentNode materials instead sample the shared
// sun-shadow pass (they never plug into three's node lighting). So on the node
// backends we run BOTH: native covers the toon ground, this pass covers the
// grass/canopies. Classic WebGL uses only native (its GLSL grass reads the
// native shadow map), so this driver no-ops there.
function NodeSunShadowDriver() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const passRef = useRef(null);

  useEffect(() => {
    if (!gl?.isWebGPURenderer) return undefined;
    const pass = createEnvironmentSunShadowPass({ renderer: gl, scene });
    passRef.current = pass;
    return () => { passRef.current = null; pass.dispose(); };
  }, [gl, scene]);

  // Runs at normal priority and is mounted after the scene content, so
  // animation mixers and wind deformation update casters before this pass
  // snapshots them into the shared sun-shadow map.
  // Also drop oversized skinned casters on forced-GL (idempotent, cheap
  // early-out off that backend) so a late-loaded MMD model can't overflow the
  // native shadow render's UBO.
  useFrame(() => {
    guardOversizedShadowCaster(scene, gl);
    passRef.current?.update({ dynamic: true });
  });

  return null;
}

// Frame stats overlay. Samples renderer.info once per frame BEFORE resetting
// it, so draw calls/triangles cover every pass the water runs (ripple sim,
// grab, reflection, main). DOM is written directly to keep React out of the
// measurement loop.
function PerfMonitor({ note }) {
  const { gl } = useThree();
  const statsRef = useRef({ frames: 0, lastSample: 0, lastTime: 0, maxMs: 0 });

  useEffect(() => {
    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previousAutoReset;
    };
  }, [gl]);

  useFrame(() => {
    const stats = statsRef.current;
    const now = performance.now();
    if (stats.lastTime > 0) stats.maxMs = Math.max(stats.maxMs, now - stats.lastTime);
    stats.lastTime = now;
    stats.frames += 1;
    if (stats.lastSample === 0) stats.lastSample = now;

    const elapsed = now - stats.lastSample;
    if (elapsed >= 500 && stats.frames > 0) {
      const element = document.getElementById('ecctrlPerfHud');
      if (element) {
        const fps = (stats.frames * 1000) / elapsed;
        const avgMs = elapsed / stats.frames;
        const render = gl.info.render;
        const triangles = render.triangles >= 1e6
          ? (render.triangles / 1e6).toFixed(1) + 'm'
          : Math.round(render.triangles / 1000) + 'k';
        const backend = gl.isWebGPURenderer
          ? (gl.backend?.isWebGPUBackend === true ? 'WebGPU' : 'WebGL2 fallback')
          : 'WebGL2';
        element.innerHTML = [
          '<b>' + Math.round(fps) + '</b> fps',
          avgMs.toFixed(1) + ' ms avg &middot; ' + stats.maxMs.toFixed(1) + ' ms max',
          render.calls + ' draw calls &middot; ' + triangles + ' tris',
          backend + ' &middot; DPR ' + gl.getPixelRatio().toFixed(2) +
            (note ? '<br/><span class="perf-hud-note">' + note + '</span>' : ''),
        ].join('<br/>');
        document.body.dataset.perfFps = String(Math.round(fps));
        document.body.dataset.perfDrawCalls = String(render.calls);
      }
      stats.frames = 0;
      stats.maxMs = 0;
      stats.lastSample = now;
    }
    gl.info.reset();
  }, -100);

  return null;
}

const SWIM_WORLD_UP = new THREE.Vector3(0, 1, 0);

// Swimming physics on top of ecctrl: once the local water column passes
// SWIM_ENTER_DEPTH the body's gravity is zeroed and its velocity is steered —
// spring to the wave surface by default, sink while the dive key (C / Ctrl)
// is held, rise with Space, WASD propels relative to the camera. Runs after
// the ground stabilizer so canJump can be overruled while swimming.
function SwimController({ controllerRef, swimStateRef, waterApiRef }) {
  const { camera } = useThree();
  const keysRef = useRef({
    forward: false, backward: false, left: false, right: false,
    up: false, dive: false, sprint: false,
  });
  const swimmingRef = useRef(false);
  const swimEnforceRef = useRef({ active: false, minY: -Infinity, maxY: Infinity, maxPlanar: Infinity });
  const forwardScratch = useMemo(() => new THREE.Vector3(), []);
  const rightScratch = useMemo(() => new THREE.Vector3(), []);

  // ecctrl applies its floating-capsule forces inside the physics step (after
  // every useFrame), so the swim clamps must get the true last word there too.
  // This hook registers after ecctrl's, and runs after it each step.
  useBeforePhysicsStep(() => {
    const enforce = swimEnforceRef.current;
    const body = controllerRef.current?.group;
    if (!enforce.active || !body?.translation) return;
    if (body.gravityScale && body.gravityScale() !== 0) body.setGravityScale(0, true);
    const velocity = body.linvel();
    // Hard planar speed cap: ecctrl impulses and wave-face carry can compound
    // past the swim targets between frames — a swimmer that outruns the
    // follow camera reads as a snap when anything stops it. The cap tracks
    // the current swim target plus flow headroom (set per frame below).
    const planarSpeed = Math.hypot(velocity.x, velocity.z);
    const planarScale = planarSpeed > enforce.maxPlanar ? enforce.maxPlanar / planarSpeed : 1;
    if (planarScale < 1 || Math.abs(velocity.y) > 1e-6) {
      body.setLinvel({ x: velocity.x * planarScale, y: 0, z: velocity.z * planarScale }, true);
    }
    const position = body.translation();
    const clampedY = Math.min(Math.max(position.y, enforce.minY), enforce.maxY);
    if (Math.abs(clampedY - position.y) > 1e-5) {
      body.setTranslation({ x: position.x, y: clampedY, z: position.z }, true);
    }
  });

  useEffect(() => {
    const setKey = (event, down) => {
      const keys = keysRef.current;
      switch (event.code) {
        case 'KeyW': case 'ArrowUp': keys.forward = down; break;
        case 'KeyS': case 'ArrowDown': keys.backward = down; break;
        case 'KeyA': case 'ArrowLeft': keys.left = down; break;
        case 'KeyD': case 'ArrowRight': keys.right = down; break;
        case 'Space': keys.up = down; break;
        case 'KeyC': case 'ControlLeft': case 'ControlRight': keys.dive = down; break;
        case 'ShiftLeft': case 'ShiftRight': keys.sprint = down; break;
        default: break;
      }
    };
    const onKeyDown = (event) => setKey(event, true);
    const onKeyUp = (event) => setKey(event, false);
    const onBlur = () => {
      const keys = keysRef.current;
      Object.keys(keys).forEach((key) => { keys[key] = false; });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame((_, delta) => {
    const body = controllerRef.current?.group;
    const api = waterApiRef.current;
    const state = swimStateRef.current;
    if (!body?.translation || !api) return;
    const dt = Math.min(Math.max(delta, 1e-4), 0.05);
    const position = body.translation();
    const velocity = body.linvel();
    const inWater = api.contains ? api.contains(position.x, position.z) : false;
    const waterHeight = inWater ? api.getHeightAt(position.x, position.z) : -Infinity;
    const bedHeight = seaBedHeight(position.x, position.z);
    // Gate swim mode on the rest waterline, not the instantaneous wave height:
    // surf rolling across the threshold would otherwise toggle swim/walk every
    // wave period. The float target below still tracks the moving waves.
    const restLevel = inWater ? (api.getLevel?.() ?? waterHeight) : -Infinity;
    const depth = restLevel - bedHeight;

    const wasSwimming = swimmingRef.current;
    const swimming = wasSwimming
      ? inWater && depth > SWIM_EXIT_DEPTH
      : inWater && depth > SWIM_ENTER_DEPTH && position.y < waterHeight + 0.35;

    if (swimming !== wasSwimming) {
      swimmingRef.current = swimming;
      body.setGravityScale(swimming ? 0 : 1, true);
      if (!swimming) document.body.dataset.swimMode = 'off';
    }

    if (!swimming) {
      swimEnforceRef.current.active = false;
      state.swimming = false;
      state.diving = false;
      state.sprinting = false;
      state.planarSpeed = Math.hypot(velocity.x, velocity.z);
      return;
    }

    if (body.gravityScale && body.gravityScale() !== 0) body.setGravityScale(0, true);

    const keys = keysRef.current;
    const diving = keys.dive;

    // Camera-relative propulsion.
    camera.getWorldDirection(forwardScratch);
    forwardScratch.y = 0;
    if (forwardScratch.lengthSq() < 1e-6) forwardScratch.set(0, 0, -1);
    forwardScratch.normalize();
    rightScratch.crossVectors(forwardScratch, SWIM_WORLD_UP);

    let moveX = 0;
    let moveZ = 0;
    if (keys.forward) { moveX += forwardScratch.x; moveZ += forwardScratch.z; }
    if (keys.backward) { moveX -= forwardScratch.x; moveZ -= forwardScratch.z; }
    if (keys.right) { moveX += rightScratch.x; moveZ += rightScratch.z; }
    if (keys.left) { moveX -= rightScratch.x; moveZ -= rightScratch.z; }
    const moveLength = Math.hypot(moveX, moveZ);
    const hasInput = moveLength > 1e-3;
    const targetSpeed = diving ? SWIM_DIVE_SPEED : (keys.sprint ? SWIM_SPRINT_SPEED : SWIM_SPEED);
    // Surf carry: a breaking wave passing the swimmer adds its surge to the
    // velocity target — the whitewater bore shoves you shoreward faster than
    // you can swim against it, exactly like real surf. The float target below
    // already rides the shell face (getHeightAt includes it), so together the
    // wave lifts you up its face and carries you in.
    const flow = api.getFlowAt?.(position.x, position.z);
    const flowX = flow?.x ?? 0;
    const flowZ = flow?.y ?? 0;
    // Facing gate: translating at full speed while the body is still rotating
    // toward the new direction displaces the apparent turn pivot by v/ω —
    // reversals looked like the swimmer pivoting around a point that drifted
    // with input timing. Swimmers decelerate through a direction change and
    // stroke out of it, so propulsion fades as the body points away from the
    // steered direction.
    let facingScale = 1;
    if (hasInput && Number.isFinite(state.facingYaw)) {
      const desiredYaw = Math.atan2(moveX / moveLength, moveZ / moveLength);
      const yawError = Math.atan2(
        Math.sin(desiredYaw - state.facingYaw),
        Math.cos(desiredYaw - state.facingYaw),
      );
      facingScale = Math.max(0.12, Math.cos(Math.min(Math.abs(yawError), Math.PI / 2)));
      document.body.dataset.swimFacingError = yawError.toFixed(2);
    }
    const targetVx = (hasInput ? (moveX / moveLength) * targetSpeed * facingScale : 0) + flowX;
    const targetVz = (hasInput ? (moveZ / moveLength) * targetSpeed * facingScale : 0) + flowZ;
    const flowGrab = Math.hypot(flowX, flowZ);
    const horizontalBlend = 1 - Math.exp(-((hasInput ? 6 : 3) + flowGrab * 2) * dt);

    // Horizontal: velocity steering. Vertical: kinematic — ecctrl's floating
    // spring still sees the seabed within its ray in mid-depth water and pins
    // the capsule toward bed height; integrating y directly means nothing can
    // out-muscle the surface float or the dive.
    body.setLinvel({
      x: THREE.MathUtils.lerp(velocity.x, targetVx, horizontalBlend),
      y: 0,
      z: THREE.MathUtils.lerp(velocity.z, targetVz, horizontalBlend),
    }, true);

    const surfaceTargetY = waterHeight - SWIM_SURFACE_OFFSET;
    let verticalRate;
    if (diving) {
      verticalRate = -SWIM_VERTICAL_SPEED;
    } else if (keys.up) {
      verticalRate = position.y < surfaceTargetY - 0.05 ? SWIM_VERTICAL_SPEED : 0;
    } else {
      verticalRate = THREE.MathUtils.clamp(
        (surfaceTargetY - position.y) * 3.2, -SWIM_VERTICAL_SPEED, SWIM_VERTICAL_SPEED * 1.1);
    }
    let nextY = position.y + verticalRate * dt;
    if (!diving) {
      // The wave surface can drop faster than a body sinks; a hard ceiling
      // clamp teleports the swimmer down each frame when a wave passes.
      // Follow the surface down at a bounded rate instead.
      const ceilingY = surfaceTargetY + 0.02;
      if (nextY > ceilingY) {
        nextY = Math.max(ceilingY, position.y - SWIM_VERTICAL_SPEED * 1.6 * dt);
      }
    }
    nextY = Math.max(nextY, bedHeight + 0.88);
    body.setTranslation({ x: position.x, y: nextY, z: position.z }, true);
    swimEnforceRef.current.active = true;
    swimEnforceRef.current.minY = bedHeight + 0.88;
    // While surfacing, the ceiling doubles as the float target so ecctrl's
    // step-time forces can never hold the body under; allow only a bounded
    // instant drop per step so a passing wave can't yank the body down.
    swimEnforceRef.current.maxY = diving
      ? Infinity
      : Math.max(surfaceTargetY + 0.02, position.y - 0.12);
    // Swim speed ceiling for the physics-step clamp: the steered target plus
    // wave-flow headroom (the surf carry stays a feature, runaway speed not).
    swimEnforceRef.current.maxPlanar = targetSpeed + flowGrab + 0.5;

    // Space means swim up here, never an ecctrl jump.
    if (body.userData) body.userData.canJump = false;

    state.swimming = true;
    state.diving = diving;
    state.sprinting = keys.sprint && hasInput && !diving;
    state.planarSpeed = Math.hypot(velocity.x, velocity.z);
    state.surfaced = Math.abs(position.y - surfaceTargetY) < 0.35;
    document.body.dataset.swimMode = diving ? 'dive' : 'surface';
    document.body.dataset.swimDepth = (waterHeight - position.y).toFixed(2);
  });

  return null;
}

// The controller-scene floor is a thin slab, and rapier's timeStep="vary"
// clamps a janky frame at 0.5s — long enough (heavy model load / toon shader
// compile) for the capsule to step past the slab and free-fall with ecctrl's
// float ray never seeing ground again. Mirror of the water scene's
// fall-through recovery, for the flat floor at y=0.
function FlatGroundRecovery({ controllerRef }) {
  useFrame(() => {
    const body = controllerRef.current?.group;
    if (!body) return;

    const position = body.translation();
    if (position.y >= BODY_CENTER_AT_REST - 1.2) return;

    const velocity = body.linvel();
    body.setTranslation({ x: position.x, y: BODY_CENTER_AT_REST + 0.02, z: position.z }, true);
    body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
    if (body.userData) body.userData.canJump = true;
  });

  return null;
}

function ControllerGroundStabilizer({ controllerRef }) {
  const uprightEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);
  const uprightQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const currentQuaternion = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const body = controllerRef.current?.group;
    if (!body) return;

    const position = body.translation();
    const velocity = body.linvel();
    // Rest height rides the sampled terrain; only recover on a real
    // fall-through (well below the local bed), never on normal wading.
    const restY = seaBedHeight(position.x, position.z) + BODY_CENTER_AT_REST;
    if (position.y < restY - 1.2) {
      body.setTranslation({ x: position.x, y: restY, z: position.z }, true);
      body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);
      body.userData.canJump = true;
      document.body.dataset.waterControllerStabilized = 'true';
    } else if (position.y < restY + 0.1) {
      body.userData.canJump = true;
    }

    const rotation = body.rotation();
    currentQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    uprightEuler.setFromQuaternion(currentQuaternion);
    uprightEuler.x = 0;
    uprightEuler.z = 0;
    uprightQuaternion.setFromEuler(uprightEuler);
    body.setRotation({
      w: uprightQuaternion.w,
      x: uprightQuaternion.x,
      y: uprightQuaternion.y,
      z: uprightQuaternion.z,
    }, true);
    const angularVelocity = body.angvel();
    body.setAngvel({ x: 0, y: angularVelocity.y, z: 0 }, true);
  });

  return null;
}

function WaterPlaygroundScene({ ballSpawnToken, cameraMode = 'follow', debugMode, envPreset, settings, sinkerSpawnToken }) {
  const controllerRef = useRef(null);
  const waterApiRef = useRef(null);
  const swimStateRef = useRef({ swimming: false, diving: false, sprinting: false, planarSpeed: 0, surfaced: false });
  const sitStateRef = useRef({ sitting: false, seatYaw: BENCH_SEAT.yaw });
  const nextBallIdRef = useRef(1);
  const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
  const sunPosition = useMemo(() => {
    const direction = new THREE.Vector3(...environment.water.sunDirection).normalize();
    // Water Lab is much wider than Tree Lab, and sunset pushes shadows
    // nearly sideways across the meadow. Keep the light far enough back that
    // low-sun casters do not sit on the near plane, while the orthographic
    // camera below covers the full grass/tree play area.
    return direction.multiplyScalar(140).toArray();
  }, [environment]);
  const [balls, setBalls] = useState([
    {
      color: 0xffd36a,
      id: 0,
      kind: 'floater',
      position: [-1.1, 2.8, -0.8],
      radius: 0.18,
    },
  ]);
  // ecctrl always yaws the body toward the movement direction. turnSpeed 13
  // is right for a standing character (the turn axis runs through the body),
  // but a prone swimmer reversing direction whips 180° in a couple frames —
  // the body sweeps a ~1m arc that reads as a teleport. Swimmers arc: slow
  // the turn while swim mode is active.
  const [swimming, setSwimming] = useState(false);
  useFrame(() => {
    const swimmingNow = Boolean(swimStateRef.current?.swimming);
    setSwimming((current) => (current === swimmingNow ? current : swimmingNow));
  });

  useEffect(() => {
    if (ballSpawnToken <= 0) return;
    const id = nextBallIdRef.current;
    nextBallIdRef.current += 1;
    const offset = ((id * 37) % 100) / 100;
    const x = -1.8 + offset * 3.6;
    const z = -1.8 + (((id * 53) % 100) / 100) * 2.6;
    const color = [0x6ad7ff, 0xffb86a, 0xe7f08a, 0xf29bd2][id % 4];
    setBalls((current) => [
      ...current.slice(-7),
      {
        color,
        id,
        kind: 'floater',
        position: [x, 3.1, z],
        radius: 0.18,
      },
    ]);
  }, [ballSpawnToken]);

  useEffect(() => {
    if (sinkerSpawnToken <= 0) return;
    const id = nextBallIdRef.current;
    nextBallIdRef.current += 1;
    const side = id % 2 === 0 ? -1 : 1;
    const row = Math.floor(id / 2) % 3;
    const x = side * (0.62 + row * 0.22);
    const z = 0.38 + row * 0.18;
    setBalls((current) => [
      ...current.slice(-7),
      {
        color: 0x31425f,
        id,
        kind: 'sinker',
        position: [x, 3.8, z],
        radius: 0.21,
      },
    ]);
  }, [sinkerSpawnToken]);

  useEffect(() => {
    document.body.dataset.waterBallCount = String(balls.length);
  }, [balls.length]);

  return (
    <>
      <fog
        key={`fog-${envPreset}`}
        attach="fog"
        args={[environment.fog.color, environment.fog.near, environment.fog.far]}
      />
      <StylizedSkyView envPreset={envPreset} />
      <ambientLight
        intensity={environment.lights.ambient.intensity}
        color={environment.lights.ambient.color}
      />
      <hemisphereLight
        intensity={environment.lights.hemisphere.intensity}
        color={environment.lights.hemisphere.sky}
        groundColor={environment.lights.hemisphere.ground}
      />
      <directionalLight
        castShadow
        intensity={environment.lights.sun.intensity}
        color={environment.lights.sun.color}
        position={sunPosition}
        shadow-mapSize={[WATER_SUN_SHADOW.mapSize, WATER_SUN_SHADOW.mapSize]}
        shadow-camera-near={WATER_SUN_SHADOW.near}
        shadow-camera-left={WATER_SUN_SHADOW.left}
        shadow-camera-right={WATER_SUN_SHADOW.right}
        shadow-camera-top={WATER_SUN_SHADOW.top}
        shadow-camera-bottom={WATER_SUN_SHADOW.bottom}
        shadow-camera-far={WATER_SUN_SHADOW.far}
        shadow-bias={-0.00035}
        shadow-normalBias={0.02}
      />
      <Physics timeStep="vary" gravity={[0, -9.81, 0]}>
        <SeaBedCollider />
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[220, 2, 220]} position={[0, -10, 0]} friction={1.1} />
        </RigidBody>
        <KeyboardControls map={keyboardMap}>
          <Ecctrl
            ref={controllerRef}
            mode={ECCTRL_MODE}
            // Spawn on dry sand just behind the waterline: the previous spawn
            // stood chest-deep in the surf, so "third person" always framed a
            // half-submerged body.
            position={[0, seaBedHeight(0, -4) + BODY_CENTER_AT_REST + 0.25, -4]}
            ccd
            capsuleHalfHeight={CAPSULE_HALF_HEIGHT}
            capsuleRadius={CAPSULE_RADIUS}
            floatHeight={FLOAT_HEIGHT}
            disableFollowCam={cameraMode === 'free'}
            camInitDis={-4.6}
            // Follow mode is a LOCKED third-person framing: the zoom window
            // stays inside the range where the whole body is in frame (fov 44
            // fits ~2.9 m of height at the near end). Unlimited pan/zoom
            // lives in the free camera mode (V).
            camMaxDis={-9}
            camMinDis={-3.6}
            // Aim at mid-torso with the camera slightly above, looking gently
            // down — the whole body sits in frame at the DEFAULT distance, no
            // zooming needed. ecctrl adds (capsuleHalfHeight +
            // capsuleRadius/2) ≈ 0.68 on top of camTargetPos.y, so -0.75
            // lands the look-at point at body center; the old 0.72 aimed a
            // full meter ABOVE the head with the camera below it looking up,
            // which pushed the legs out of the frame.
            camInitDir={{ x: 0.12, y: 0.04 }}
            camCollision={false}
            camUpLimit={1.5}
            camLowLimit={-1.5}
            camTargetPos={{ x: 0, y: -0.75, z: 0 }}
            maxVelLimit={2.35}
            sprintMult={1.55}
            jumpVel={4.0}
            rayHitForgiveness={0.18}
            turnSpeed={swimming ? 6 : 13}
            autoBalanceSpringK={0.35}
            autoBalanceDampingC={0.045}
          >
            <ControlledPmxModel controllerRef={controllerRef} swimStateRef={swimStateRef} sitStateRef={sitStateRef} visualYOffset={FLOAT_SPRING_SAG} />
          </Ecctrl>
          <ControllerTelemetry controllerRef={controllerRef} />
          <ControllerGroundStabilizer controllerRef={controllerRef} />
          <SwimController
            controllerRef={controllerRef}
            swimStateRef={swimStateRef}
            waterApiRef={waterApiRef}
          />
          <BenchSitController controllerRef={controllerRef} sitStateRef={sitStateRef} />
        </KeyboardControls>
        {balls.map((ball) => (
          <WaterBall
            key={ball.id}
            ball={ball}
            settings={settings}
            waterApiRef={waterApiRef}
          />
        ))}
        <SeaRocks />
        <MegascanProps />
        <SeaStage envPreset={envPreset} />
        <ShowcaseTreeRow envPreset={envPreset} />
      </Physics>
      <HorizonSilhouettes envPreset={envPreset} />
      <KelpField settings={settings} />
      <GrassField controllerRef={controllerRef} envPreset={envPreset} />
      <TreeFoliageRig envPreset={envPreset} />
      <RainView
        controllerRef={controllerRef}
        envPreset={envPreset}
        waterApiRef={waterApiRef}
        waterLevel={settings.waterLevel}
      />
      <UnderwaterAtmosphere envPreset={envPreset} settings={settings} />
      <WaterSurfaceView
        controllerRef={controllerRef}
        debugMode={debugMode}
        envPreset={envPreset}
        settings={settings}
        swimStateRef={swimStateRef}
        waterApiRef={waterApiRef}
      />
      {cameraMode === 'free' && <FreeCameraControls controllerRef={controllerRef} />}
    </>
  );
}

function ControllerTelemetry({ controllerRef }) {
  useFrame(() => {
    const body = controllerRef.current?.group;
    if (!body) return;

    const position = body.translation();
    const velocity = body.linvel();
    document.body.dataset.ecctrlCanJump = String(Boolean(body.userData?.canJump));
    document.body.dataset.ecctrlX = position.x.toFixed(3);
    document.body.dataset.ecctrlY = position.y.toFixed(3);
    document.body.dataset.ecctrlZ = position.z.toFixed(3);
    document.body.dataset.ecctrlVelocityY = velocity.y.toFixed(3);
    document.body.dataset.ecctrlPlanarSpeed = Math.hypot(velocity.x, velocity.z).toFixed(3);
  });

  return null;
}

const freeCamScratch = new THREE.Vector3();

const WATER_SUN_SHADOW = Object.freeze({
  bottom: -120,
  far: 360,
  left: -120,
  mapSize: 4096,
  near: 0.1,
  right: 120,
  top: 120,
});

// Free inspection camera (camera mode "free", toggled with V): the character
// follow-cam is disabled and MapControls takes over — left-drag pans across
// the ground, right-drag orbits, wheel zooms, no tether to the character.
// On entry the orbit pivot starts at the character so the view doesn't jump.
function FreeCameraControls({ controllerRef }) {
  const controlsRef = useRef(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    // ?freecam=x,y,z,tx,ty,tz pins an exact camera pose (shareable views,
    // deterministic screenshots). Otherwise pivot on the character.
    const pinned = new URLSearchParams(window.location.search).get('freecam');
    const pose = pinned?.split(',').map(Number);
    if (pose?.length === 6 && pose.every(Number.isFinite)) {
      camera.position.set(pose[0], pose[1], pose[2]);
      controls.target.set(pose[3], pose[4], pose[5]);
      controls.update();
      return;
    }
    const body = controllerRef?.current?.group;
    if (body?.translation) {
      const position = body.translation();
      controls.target.set(position.x, position.y + 0.6, position.z);
    } else {
      camera.getWorldDirection(freeCamScratch);
      controls.target.copy(camera.position).addScaledVector(freeCamScratch, 10);
    }
    controls.update();
  }, [camera, controllerRef]);

  return (
    <MapControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      minDistance={0.4}
      maxDistance={380}
      zoomSpeed={1.2}
      panSpeed={1.1}
      rotateSpeed={0.8}
    />
  );
}

function IndoorRoomScene({ cameraMode = 'follow' }) {
  const controllerRef = useRef(null);
  const environment = useIndoorEnvironment();

  const roomSize = environment?.box?.getSize(new THREE.Vector3()) ?? null;
  // Spawn on the raycast-verified floor point at the room center, slightly
  // above rest height — spawning offset from the verified spot risks starting
  // inside a table trimesh and being depenetration-launched.
  const spawnPosition = environment
    ? [0, environment.floorY + BODY_CENTER_AT_REST + 0.25, 0]
    : [0, BODY_CENTER_AT_REST, 0];

  return (
    <>
      <IndoorSceneDebugProbe />
      <color attach="background" args={['#101216']} />
      {/* Afternoon sun angled in from behind the window wall (-z). */}
      <ambientLight intensity={0.5} color={0xbfc8dd} />
      <hemisphereLight intensity={0.32} color={0xf4e9d4} groundColor={0x3a3128} />
      <directionalLight
        castShadow
        intensity={1.35}
        color={0xffe3b8}
        position={roomSize ? [roomSize.x * 0.32, roomSize.y * 1.7, -roomSize.z * 1.4] : [2.5, 8, -9]}
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={9}
        shadow-camera-bottom={-8}
        shadow-camera-far={40}
        shadow-bias={-0.0001}
        shadow-normalBias={0.01}
      />
      {/* Warm ceiling lamps, mirroring the viewer's interior fill. */}
      {roomSize && (
        <>
          <pointLight
            color={0xffc27a}
            intensity={1.9}
            distance={Math.max(3.5, roomSize.y * 1.6)}
            decay={1.6}
            position={[-roomSize.x * 0.2, roomSize.y * 0.82, 0]}
          />
          <pointLight
            color={0xffc27a}
            intensity={1.9}
            distance={Math.max(3.5, roomSize.y * 1.6)}
            decay={1.6}
            position={[roomSize.x * 0.2, roomSize.y * 0.82, -roomSize.z * 0.14]}
          />
        </>
      )}
      {environment && <primitive object={environment.root} />}
      {environment && <IndoorBackdrop box={environment.box} />}
      <Physics timeStep="vary" gravity={[0, -9.81, 0]}>
        {environment && (
          <RigidBody type="fixed" colliders={false}>
            {environment.trimesh && (
              <TrimeshCollider
                args={[environment.trimesh.vertices, environment.trimesh.indices]}
                friction={1.1}
              />
            )}
            {/* Safety slab under the interior floor so a physics hiccup can
                never drop the capsule into the void. */}
            <CuboidCollider
              args={[INDOOR_ENVIRONMENT_SIZE * 2, 1, INDOOR_ENVIRONMENT_SIZE * 2]}
              position={[0, environment.floorY - 1.4, 0]}
              friction={1.2}
            />
          </RigidBody>
        )}
        {environment && (
          <KeyboardControls map={keyboardMap}>
            <Ecctrl
              ref={controllerRef}
              mode={ECCTRL_MODE}
              position={spawnPosition}
              ccd
              capsuleHalfHeight={CAPSULE_HALF_HEIGHT}
              capsuleRadius={CAPSULE_RADIUS}
              floatHeight={FLOAT_HEIGHT}
              disableFollowCam={cameraMode === 'free'}
              // Interior framing: keep the zoom window inside the room so the
              // follow camera never backs through a wall.
              camInitDis={-2.9}
              camMaxDis={-4.2}
              camMinDis={-1.6}
              camInitDir={{ x: 0.12, y: 0 }}
              camTargetPos={{ x: 0, y: -0.75, z: 0 }}
              maxVelLimit={2.35}
              sprintMult={1.55}
              jumpVel={4.0}
              rayHitForgiveness={0.18}
              turnSpeed={13}
              autoBalanceSpringK={0.35}
              autoBalanceDampingC={0.045}
            >
              <ControlledPmxModel controllerRef={controllerRef} visualYOffset={FLOAT_SPRING_SAG} />
            </Ecctrl>
            <ControllerTelemetry controllerRef={controllerRef} />
            {/* Same upright damping as the water scenes: without it, quick
                direction reversals on long frames tip the capsule over. */}
            <ControllerGroundStabilizer controllerRef={controllerRef} />
            <IndoorGroundRecovery controllerRef={controllerRef} floorY={environment.floorY} />
          </KeyboardControls>
        )}
      </Physics>
      {cameraMode === 'free' && <FreeCameraControls controllerRef={controllerRef} />}
    </>
  );
}

function ControllerScene({ cameraMode = 'follow' }) {
  const controllerRef = useRef(null);

  return (
    <>
      <color attach="background" args={['#1a1a1a']} />
      <ambientLight intensity={0.42} color={0xa8b7d4} />
      <hemisphereLight intensity={0.36} color={0xe8f0ff} groundColor={0x2b2630} />
      <directionalLight
        castShadow
        intensity={1.25}
        position={[3.5, 5.2, 4.2]}
        shadow-mapSize={[2048, 2048]}
      />
      <Physics timeStep="vary" gravity={[0, -9.81, 0]}>
        <KeyboardControls map={keyboardMap}>
          <Ecctrl
            ref={controllerRef}
            mode={ECCTRL_MODE}
            position={[0, BODY_CENTER_AT_REST, 0]}
            capsuleHalfHeight={CAPSULE_HALF_HEIGHT}
            capsuleRadius={CAPSULE_RADIUS}
            floatHeight={FLOAT_HEIGHT}
            disableFollowCam={cameraMode === 'free'}
            camInitDis={-3.6}
            camMaxDis={-7}
            camMinDis={-2.6}
            camInitDir={{ x: 0.1, y: 0 }}
            camTargetPos={{ x: 0, y: -0.75, z: 0 }}
            maxVelLimit={2.6}
            sprintMult={1.85}
            jumpVel={4.2}
            rayHitForgiveness={0.18}
            turnSpeed={13}
            autoBalanceSpringK={0.35}
            autoBalanceDampingC={0.045}
          >
            <ControlledPmxModel controllerRef={controllerRef} visualYOffset={FLOAT_SPRING_SAG} />
          </Ecctrl>
          <ControllerTelemetry controllerRef={controllerRef} />
          <FlatGroundRecovery controllerRef={controllerRef} />
        </KeyboardControls>
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[24, 1, 24]} position={[0, -1, 0]} friction={1.2} />
        </RigidBody>
      </Physics>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color={0x2d2f31} roughness={0.92} />
      </mesh>
      {cameraMode === 'free' && <FreeCameraControls controllerRef={controllerRef} />}
    </>
  );
}

function EcctrlApp() {
  const [waterSettings, setWaterSettings] = useState(() => createInitialWaterSettings());
  const [waterDebugMode, setWaterDebugMode] = useState(INITIAL_WATER_DEBUG_MODE);
  const [waterEnvPreset, setWaterEnvPreset] = useState(INITIAL_WATER_ENVIRONMENT);
  // 'follow' = third-person camera locked to the character (full body in
  // frame); 'free' = detached MapControls — pan, orbit, zoom anywhere.
  const [cameraMode, setCameraMode] = useState('follow');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || (event.key !== 'v' && event.key !== 'V')) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      setCameraMode((mode) => (mode === 'free' ? 'follow' : 'free'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.body.dataset.cameraMode = cameraMode;
  }, [cameraMode]);

  // Environment presets co-tune the water's sun/sky settings.
  const applyEnvironmentPreset = useCallback((presetName) => {
    const environment = WATER_ENVIRONMENT_PRESETS[presetName];
    if (!environment) return;
    setWaterEnvPreset(presetName);
    setWaterSettings((current) => createWaterSettings({ ...current, ...environment.water }));
  }, []);

  useEffect(() => {
    if (!WATER_SCENE_ENABLED) return;
    const environment = WATER_ENVIRONMENT_PRESETS[INITIAL_WATER_ENVIRONMENT];
    if (environment && INITIAL_WATER_ENVIRONMENT !== 'noon') {
      setWaterSettings((current) => createWaterSettings({ ...current, ...environment.water }));
    }
  }, []);
  const [ballSpawnToken, setBallSpawnToken] = useState(0);
  const [sinkerSpawnToken, setSinkerSpawnToken] = useState(0);

  useEffect(() => {
    updateModeLabel('loading');
    return updateAnimationToggle({ label: 'Controller Loading' });
  }, []);

  useEffect(() => {
    if (!WATER_SCENE_ENABLED) return;
    document.body.dataset.waterMode = waterSettings.mode;
    document.body.dataset.waterStyle = waterSettings.style;
    document.body.dataset.waterTone = waterSettings.colorTone;
    document.body.dataset.waterLevel = waterSettings.waterLevel.toFixed(3);
  }, [waterSettings]);

  return (
    <>
      {WATER_SCENE_ENABLED && (
        <WaterHud
          settings={waterSettings}
          cameraMode={cameraMode}
          debugMode={waterDebugMode}
          envPreset={waterEnvPreset}
          onCameraModeChange={setCameraMode}
          onDebugModeChange={setWaterDebugMode}
          onEnvPresetChange={applyEnvironmentPreset}
          onSettingsChange={setWaterSettings}
          onDropBall={() => setBallSpawnToken((value) => value + 1)}
          onDropSinker={() => setSinkerSpawnToken((value) => value + 1)}
        />
      )}
      <div className="perf-hud" id="ecctrlPerfHud"><b>—</b> fps</div>
      <div className="controls-hud">
        <div className="controls-hud-title">Controls</div>
        <div><kbd>W A S D</kbd> Move · swim direction in water</div>
        <div><kbd>Shift</kbd> Sprint / fast swim</div>
        <div><kbd>Space</kbd> Jump · swim up in water</div>
        {WATER_SCENE_ENABLED && (
          <>
            <div><kbd>C</kbd> or <kbd>Ctrl</kbd> Hold to dive underwater</div>
            <div><kbd>F</kbd> Sit / stand at the bench</div>
          </>
        )}
        <div><kbd>Drag</kbd> Orbit camera (left mouse / trackpad)</div>
        <div><kbd>Scroll</kbd> Zoom camera (wheel / two-finger)</div>
        <div>
          <kbd>V</kbd> Camera: {cameraMode === 'free'
            ? 'free — left-drag pan, right-drag orbit'
            : 'follow (third person)'}
        </div>
      </div>
      {ENABLE_TOUCH_CONTROLS && (
        <EcctrlJoystick
          buttonNumber={1}
          joystickHeightAndWidth={150}
          buttonHeightAndWidth={150}
          joystickPositionLeft={16}
          joystickPositionBottom={16}
          buttonPositionRight={16}
          buttonPositionBottom={16}
        />
      )}
      <Canvas
        shadows
        camera={{
          fov: 44,
          near: 0.05,
          far: 420,
          position: [0, 1.4, 4.8],
        }}
        gl={async (defaultProps) => {
          // Shared renderer factory honors ?renderer=. The default is native
          // WebGPU; renderer=webgl keeps the TSL WebGL2 fallback available.
          const renderer = createLabRenderer({ ...defaultProps, antialias: true });
          await whenRendererReady(renderer);
          return renderer;
        }}
        onCreated={(state) => {
          const { gl } = state;
          // Debug/automation handle (same pattern as tree-lab's __treeDesigner).
          window.__playground = state;
          // The water scene's ground/banks/bench are MeshToonMaterial, which
          // receive shadows only through three's native shadow system — the
          // shared sun-shadow pass (used by the other labs' TSL materials)
          // never reaches them. So keep native shadows ON here for every
          // backend. The forced-WebGL2 backend still buffer-skins skinned
          // casters, so an oversized MMD skeleton (ganyu, >256 bones) can
          // overflow GL_MAX_UNIFORM_BLOCK_SIZE there; guardOversizedShadowCaster
          // drops that one mesh from the shadow map. Native WebGPU uses storage
          // skinning and has the headroom.
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.setClearColor(0x1a1a1a);
          gl.toneMapping = THREE.NoToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setPixelRatio(window.devicePixelRatio);
        }}
      >
        <PerfMonitor note={RENDERER_FALLBACK_NOTE} />
        {WATER_SCENE_ENABLED
          ? (
            <WaterPlaygroundScene
              ballSpawnToken={ballSpawnToken}
              cameraMode={cameraMode}
              debugMode={waterDebugMode}
              envPreset={waterEnvPreset}
              settings={waterSettings}
              sinkerSpawnToken={sinkerSpawnToken}
            />
          )
          : INDOOR_SCENE_ENABLED
            ? <IndoorRoomScene cameraMode={cameraMode} />
            : <ControllerScene cameraMode={cameraMode} />}
        <NodeSunShadowDriver />
      </Canvas>
    </>
  );
}

createRoot(document.getElementById('app')).render(<EcctrlApp />);
