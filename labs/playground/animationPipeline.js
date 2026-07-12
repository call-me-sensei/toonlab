// The retarget/bake animation pipeline: Mixamo FBX world-space retarget bake,
// alternate retarget strategies, per-clip loaders, native-clip resolution, and
// the model fitting/material prep helpers that run before the toon shader.
// Non-React machinery: everything takes the mesh/rig/urls as arguments.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';

import {
  MIXAMO_CHAIN_CHILD,
  normalizeMixamoBoneName,
} from '../../src/character/characterRig.js';
import {
  NATIVE_LOCOMOTION_CLIP_NAMES,
  resolveNativeLocomotionClips,
} from '../shared/walkPreview.js';
import {
  ARM_POSE_MODE,
  ENABLE_POSE_DEBUG,
  ENABLE_ROOT_MOTION,
  IDLE_ANIMATION_URL,
  IDLE_BODY_MODE,
  JUMP_ANIMATION_URL,
  JUMP_BODY_MODE,
  RELAXED_ARM_Z_OFFSET,
  RETARGET_MODE,
  RUNNING_ANIMATION_URL,
  RUNNING_BODY_MODE,
  SIT_ANIMATION_URL,
  WALKING_ANIMATION_URL,
  WALKING_BODY_MODE,
} from './params.js';

// Bone-name knowledge lives in characterRig.js (canonical humanoid roles +
// per-convention adapters); a resolved `rig` for the loaded model threads
// through the retarget pipeline below. The body-mode debug filters here are
// MMD-specific by design (they only matter for the PMX test flows).
const LOWER_BODY_WALK_BONES = new Set([
  '下半身',
  '左足',
  '左ひざ',
  '左足首',
  '左つま先',
  '右足',
  '右ひざ',
  '右足首',
  '右つま先',
  '左足D',
  '左ひざD',
  '左足首D',
  '左足先EX',
  '右足D',
  '右ひざD',
  '右足首D',
  '右足先EX',
]);

const TORSO_IDLE_BONES = new Set([
  '上半身',
  '上半身2',
  '上半身3',
  '首',
  '頭',
]);

const UPPER_BODY_IDLE_BONES = new Set([
  ...TORSO_IDLE_BONES,
  '左肩',
  '左腕',
  '左ひじ',
  '左手首',
  '右肩',
  '右腕',
  '右ひじ',
  '右手首',
  '左親指０',
  '左親指１',
  '左親指２',
  '左人指１',
  '左人指２',
  '左人指３',
  '左中指１',
  '左中指２',
  '左中指３',
  '左薬指１',
  '左薬指２',
  '左薬指３',
  '左小指１',
  '左小指２',
  '左小指３',
  '右親指０',
  '右親指１',
  '右親指２',
  '右人指１',
  '右人指２',
  '右人指３',
  '右中指１',
  '右中指２',
  '右中指３',
  '右薬指１',
  '右薬指２',
  '右薬指３',
  '右小指１',
  '右小指２',
  '右小指３',
]);

function targetBoneNameFromAnimationTrack(trackName) {
  const boneMatch = trackName.match(/^\.bones\[([^\]]+)\]\./);
  if (boneMatch) return boneMatch[1];

  const separatorIndex = trackName.lastIndexOf('.');
  return separatorIndex > 0 ? trackName.slice(0, separatorIndex) : null;
}

function filterClipForBoneSet(clip, boneNames, clipName) {
  const tracks = clip.tracks.filter((track) => {
    if (track.name.endsWith('.position')) {
      // センター carries the detrended hip sway, which keeps any stance balanced.
      return ENABLE_ROOT_MOTION || targetBoneNameFromAnimationTrack(track.name) === 'センター';
    }

    const boneName = targetBoneNameFromAnimationTrack(track.name);
    return boneName ? boneNames.has(boneName) : false;
  });

  return new THREE.AnimationClip(clipName, clip.duration, tracks).optimize();
}

function filterIdleClipForBodyMode(clip) {
  if (IDLE_BODY_MODE === 'full') return clip;
  if (IDLE_BODY_MODE === 'none') {
    return new THREE.AnimationClip(`${clip.name} no-idle-bones`, clip.duration, []);
  }
  if (IDLE_BODY_MODE === 'upper') {
    return filterClipForBoneSet(clip, UPPER_BODY_IDLE_BONES, `${clip.name} ${IDLE_BODY_MODE}`);
  }

  return filterClipForBoneSet(clip, TORSO_IDLE_BONES, `${clip.name} ${IDLE_BODY_MODE}`);
}

function filterWalkingClipForBodyMode(clip) {
  if (WALKING_BODY_MODE === 'full') return clip;

  return filterClipForBoneSet(clip, LOWER_BODY_WALK_BONES, `${clip.name} ${WALKING_BODY_MODE}`);
}

function filterJumpClipForBodyMode(clip) {
  if (JUMP_BODY_MODE === 'full') return clip;

  return filterClipForBoneSet(clip, LOWER_BODY_WALK_BONES, `${clip.name} ${JUMP_BODY_MODE}`);
}

function filterRunningClipForBodyMode(clip) {
  if (RUNNING_BODY_MODE === 'full') return clip;

  return filterClipForBoneSet(clip, LOWER_BODY_WALK_BONES, `${clip.name} ${RUNNING_BODY_MODE}`);
}

function computeModelBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasBounds = false;

  root.traverse((obj) => {
    if (obj.userData?.isToonOutline || !obj.isMesh || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    if (!obj.geometry.boundingBox) return;

    meshBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
    if (!Number.isFinite(meshBox.min.x) || !Number.isFinite(meshBox.max.x)) return;
    box.union(meshBox);
    hasBounds = true;
  });

  return hasBounds ? box : null;
}

function fitModelForController(root, targetHeight) {
  const box = computeModelBounds(root);
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0 && targetHeight > 0) {
    root.scale.multiplyScalar(targetHeight / size.y);
  }

  root.updateMatrixWorld(true);
  const fittedBox = computeModelBounds(root);
  if (!fittedBox) return null;

  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fittedBox.min.y;
  root.updateMatrixWorld(true);

  return computeModelBounds(root);
}

// Untextured materials (e.g. the bundled mannequin's flat-color GLB materials)
// get their base color baked into a 1x1 sRGB texture so the anime shader runs
// its normal textured path — cel bands, rim, outline — instead of the
// no-base-map fallback. The color moves into the texture, so the material
// color resets to white to avoid tinting twice.
function bakeSolidBaseColorTextures(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat || mat.map?.isTexture || !mat.color) continue;
      const srgb = mat.color.clone().convertLinearToSRGB();
      const texel = new Uint8Array([
        Math.round(THREE.MathUtils.clamp(srgb.r, 0, 1) * 255),
        Math.round(THREE.MathUtils.clamp(srgb.g, 0, 1) * 255),
        Math.round(THREE.MathUtils.clamp(srgb.b, 0, 1) * 255),
        255,
      ]);
      const texture = new THREE.DataTexture(texel, 1, 1);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      mat.map = texture;
      mat.color.setRGB(1, 1, 1);
      mat.needsUpdate = true;
    }
  });
}

function prepareModelForRealtime(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData?.isToonOutline || obj.userData?.isToonFurShell) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
  });
}

function loadAsync(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function collectBones(root) {
  const bones = [];
  root.traverse((obj) => {
    if (obj.isBone) bones.push(obj);
  });
  return bones;
}

function exposePoseDebug(root, targetMesh, mixer, actions) {
  if (!ENABLE_POSE_DEBUG || !targetMesh) return;

  window.__toonEcctrlPoseDebug = {
    root,
    targetMesh,
    mixer,
    actions,
    getBone(name) {
      return targetMesh.skeleton.bones.find((bone) => bone.name === name) || null;
    },
  };
}

function createArmPoseState(targetMesh) {
  if (ARM_POSE_MODE !== 'relaxed') return null;

  const arms = [
    { bone: targetMesh.skeleton.bones.find((candidate) => candidate.name === '左腕'), zOffset: -RELAXED_ARM_Z_OFFSET },
    { bone: targetMesh.skeleton.bones.find((candidate) => candidate.name === '右腕'), zOffset: RELAXED_ARM_Z_OFFSET },
  ].filter(({ bone }) => bone);

  if (arms.length === 0) return null;

  const restRotations = arms.map(({ bone, zOffset }) => ({
    bone,
    x: bone.rotation.x,
    y: bone.rotation.y,
    z: bone.rotation.z,
    zOffset,
  }));

  return {
    apply() {
      for (const { bone, x, y, z, zOffset } of restRotations) {
        bone.rotation.set(x, y, z + zOffset);
        bone.updateMatrix();
      }

      targetMesh.updateMatrixWorld(true);
      targetMesh.skeleton.update();
    },
  };
}

function snapshotSkeletonLocalPose(targetMesh) {
  const boneStates = targetMesh.skeleton.bones.map((bone) => ({
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  }));

  return () => {
    for (const { bone, position, quaternion, scale } of boneStates) {
      bone.position.copy(position);
      bone.quaternion.copy(quaternion);
      bone.scale.copy(scale);
      bone.updateMatrix();
    }

    targetMesh.updateMatrixWorld(true);
    targetMesh.skeleton.update();
  };
}

function remapMixamoClipTrackNames(sourceClip, rig, clipName = 'Mixamo direct retarget') {
  const tracks = [];

  for (const track of sourceClip.tracks) {
    const separatorIndex = track.name.lastIndexOf('.');
    if (separatorIndex === -1) continue;

    const sourceBoneName = normalizeMixamoBoneName(track.name.slice(0, separatorIndex));
    const propertyName = track.name.slice(separatorIndex + 1);
    const targetBoneName = rig.mixamoToTarget.get(sourceBoneName);

    if (!targetBoneName) continue;

    if (propertyName === 'quaternion') {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${targetBoneName}].quaternion`;
      tracks.push(clonedTrack);
    }

    if (ENABLE_ROOT_MOTION && propertyName === 'position' && sourceBoneName === 'mixamorigHips' && rig.hipCarrierName) {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${rig.hipCarrierName}].position`;
      tracks.push(clonedTrack);
    }
  }

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function remapMixamoClipWithRestDeltas(sourceClip, sourceBones, targetMesh, rig, clipName = 'Mixamo delta retarget') {
  const sourceRestByName = new Map(sourceBones.map((bone) => [
    normalizeMixamoBoneName(bone.name),
    bone.quaternion.clone(),
  ]));
  const targetRestByName = new Map(targetMesh.skeleton.bones.map((bone) => [bone.name, bone.quaternion.clone()]));
  const tracks = [];
  const sourceRestInverse = new THREE.Quaternion();
  const sourceQuat = new THREE.Quaternion();
  const targetRest = new THREE.Quaternion();
  const targetQuat = new THREE.Quaternion();

  for (const track of sourceClip.tracks) {
    const separatorIndex = track.name.lastIndexOf('.');
    if (separatorIndex === -1) continue;

    const sourceBoneName = normalizeMixamoBoneName(track.name.slice(0, separatorIndex));
    const propertyName = track.name.slice(separatorIndex + 1);
    const targetBoneName = rig.mixamoToTarget.get(sourceBoneName);

    if (!targetBoneName) continue;

    if (propertyName === 'quaternion') {
      const sourceRest = sourceRestByName.get(sourceBoneName);
      const targetRestValue = targetRestByName.get(targetBoneName);
      if (!sourceRest || !targetRestValue) continue;

      sourceRestInverse.copy(sourceRest).invert();
      targetRest.copy(targetRestValue);

      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        sourceQuat.fromArray(track.values, i);
        targetQuat.copy(targetRest)
          .multiply(sourceRestInverse)
          .multiply(sourceQuat)
          .normalize();
        targetQuat.toArray(values, i);
      }

      tracks.push(new THREE.QuaternionKeyframeTrack(
        `.bones[${targetBoneName}].quaternion`,
        track.times,
        values,
      ));
    }

    if (ENABLE_ROOT_MOTION && propertyName === 'position' && sourceBoneName === 'mixamorigHips' && rig.hipCarrierName) {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${rig.hipCarrierName}].position`;
      tracks.push(clonedTrack);
    }
  }

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function createSameNameSkeletonClip(targetMesh, sourceClip, clipName = 'Same-name skeleton retarget') {
  const targetBoneNames = new Set(targetMesh.skeleton.bones.map((bone) => bone.name));
  const tracks = sourceClip.tracks
    .filter((track) => {
      const separatorIndex = track.name.lastIndexOf('.');
      if (separatorIndex === -1) return false;

      const boneName = track.name.slice(0, separatorIndex);
      const propertyName = track.name.slice(separatorIndex + 1);
      if (!targetBoneNames.has(boneName)) return false;
      return ENABLE_ROOT_MOTION || propertyName !== 'position';
    })
    .map((track) => track.clone());

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function bakeSkeletonRetargetClip(targetMesh, sourceClip, sourceBones, rig, clipName = 'Mixamo skeleton retarget') {
  const sourceSkeleton = new THREE.Skeleton(sourceBones);
  const retargeted = retargetClip(targetMesh, sourceSkeleton, sourceClip, {
    names: Object.fromEntries(rig.targetToMixamo),
    hip: 'mixamorigHips',
    fps: 30,
    useFirstFramePosition: true,
    preserveBoneMatrix: true,
    preserveBonePositions: true,
    useTargetMatrix: false,
  });

  const tracks = ENABLE_ROOT_MOTION
    ? retargeted.tracks
    : retargeted.tracks.filter((track) => !track.name.endsWith('.position'));

  return new THREE.AnimationClip(clipName, retargeted.duration, tracks).optimize();
}

function buildTargetBoneNodes(targetMesh) {
  const targetBones = targetMesh.skeleton.bones;
  const targetBoneSet = new Set(targetBones);
  const nodes = [];

  const visit = (bone, parentIndex) => {
    const index = nodes.length;
    nodes.push({
      bone,
      parentIndex,
      restLocalQuat: bone.quaternion.clone(),
      restWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion()),
      restWorldPos: bone.getWorldPosition(new THREE.Vector3()),
      parentRestWorldQuat: parentIndex === -1 && bone.parent
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
        : null,
      source: null,
      correction: null,
      resolvedCorrection: null,
      values: null,
    });
    for (const child of bone.children) {
      if (child.isBone) visit(child, index);
    }
  };

  for (const bone of targetBones) {
    if (!targetBoneSet.has(bone.parent)) visit(bone, -1);
  }

  return nodes;
}

// Bakes the Mixamo clip by sampling it and matching each mapped target bone's
// world-space rotation delta to its Mixamo counterpart. Works regardless of
// rest-pose differences (T-pose vs A-pose) or hierarchy mismatches, because
// every mapped bone is solved in world space against the target rest pose.
// Which target bone plays which role comes from the resolved `rig`.
function bakeWorldSpaceMixamoClip(targetMesh, fbx, sourceClip, sourceBones, rig, clipName = 'Mixamo world retarget', {
  // 'full': keep the (detrended, centered) XZ sway — right for stationary
  // stance clips like idle, where the weight shift over a leg is the pose.
  // 'vertical': keep only the Y bob — right for traveling clips (walk/run/
  // jump), whose XZ wander is real travel that the physics body provides.
  hipTranslationMode = 'full',
  // 'skeleton' emits ".bones[name].prop" for mixers rooted at the skinned
  // mesh; 'node' emits "name.prop" for mixers rooted at the model scene
  // (the native-clip path retargets its swim layer through here).
  trackNameStyle = 'skeleton',
} = {}) {
  const fps = 30;
  const bakedTrackName = (boneName, property) => (trackNameStyle === 'node'
    ? `${boneName}.${property}`
    : `.bones[${boneName}].${property}`);

  fbx.updateMatrixWorld(true);
  const sourceByName = new Map();
  for (const bone of sourceBones) {
    const name = normalizeMixamoBoneName(bone.name);
    if (!sourceByName.has(name)) {
      sourceByName.set(name, {
        bone,
        restWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion()),
        restWorldPos: bone.getWorldPosition(new THREE.Vector3()),
      });
    }
  }
  const findSource = (mixamoName) =>
    sourceByName.get(mixamoName) || sourceByName.get(mixamoName.replace(/^mixamorig/, ''));

  targetMesh.updateMatrixWorld(true);
  const nodes = buildTargetBoneNodes(targetMesh);
  const targetNodeByName = new Map();
  for (const node of nodes) {
    if (!targetNodeByName.has(node.bone.name)) targetNodeByName.set(node.bone.name, node);
  }

  for (const [targetName, mixamoName] of rig.targetToMixamo) {
    const node = targetNodeByName.get(targetName);
    const source = node ? findSource(mixamoName) : null;
    if (!node || !source) continue;
    node.source = source;

    const chainMixamoName = MIXAMO_CHAIN_CHILD[mixamoName];
    const chainSource = chainMixamoName ? findSource(chainMixamoName) : null;
    const chainTargetName = chainMixamoName ? rig.mixamoToTarget.get(chainMixamoName) : null;
    const chainNode = chainTargetName ? targetNodeByName.get(chainTargetName) : null;
    if (!chainSource || !chainNode) continue;

    const sourceDir = chainSource.restWorldPos.clone().sub(source.restWorldPos);
    const targetDir = chainNode.restWorldPos.clone().sub(node.restWorldPos);
    if (sourceDir.lengthSq() < 1e-10 || targetDir.lengthSq() < 1e-10) continue;
    node.correction = new THREE.Quaternion().setFromUnitVectors(
      targetDir.normalize(),
      sourceDir.normalize(),
    );
  }

  // Nodes are ordered parent-before-child, so corrections cascade down the
  // chain (fingers reuse the hand correction, the head reuses the neck's, ...).
  for (const node of nodes) {
    const inherited = node.parentIndex === -1 ? null : nodes[node.parentIndex].resolvedCorrection;
    node.resolvedCorrection = node.correction || inherited;
  }

  const frameCount = Math.max(2, Math.ceil(sourceClip.duration * fps) + 1);
  const times = new Float32Array(frameCount);
  const mappedNodes = nodes.filter((node) => node.source);
  for (const node of mappedNodes) node.values = new Float32Array(frameCount * 4);

  // Hip translation matters even without root motion: Mixamo clips shift the
  // hips over the supporting leg (idle) and bob them (walk/run/jump). Applying
  // only the rotations leaves the stance unbalanced — the body reads as leaning.
  // Bake the hips position onto センター, scaled to the target's hip height;
  // net travel is removed later unless root motion is requested.
  const hipsSource = findSource('mixamorigHips');
  const hipsTargetNode = targetNodeByName.get(rig.mixamoToTarget.get('mixamorigHips')) || null;
  const centerNode = (rig.hipCarrierName ? targetNodeByName.get(rig.hipCarrierName) : null) || hipsTargetNode;
  const hipSwayState = centerNode && hipsSource && hipsTargetNode ? {
    values: new Float32Array(frameCount * 3),
    restLocalPos: centerNode.bone.position.clone(),
    hipsRestWorldPos: hipsSource.restWorldPos,
    parentRestWorldQuatInverse: centerNode.bone.parent
      ? centerNode.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      : new THREE.Quaternion(),
    parentWorldScale: centerNode.bone.parent
      ? centerNode.bone.parent.getWorldScale(new THREE.Vector3())
      : new THREE.Vector3(1, 1, 1),
    heightScale: Math.abs(hipsSource.restWorldPos.y) > 1e-6
      ? hipsTargetNode.restWorldPos.y / hipsSource.restWorldPos.y
      : 1,
  } : null;

  const mixer = new THREE.AnimationMixer(fbx);
  mixer.clipAction(sourceClip).play();

  const worldQuats = nodes.map(() => new THREE.Quaternion());
  const sourceWorldQuat = new THREE.Quaternion();
  const deltaQuat = new THREE.Quaternion();
  const localQuat = new THREE.Quaternion();
  const hipsWorldPos = new THREE.Vector3();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = Math.min(frame / fps, sourceClip.duration);
    times[frame] = time;
    mixer.setTime(time);
    fbx.updateMatrixWorld(true);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const parentQuat = node.parentIndex === -1
        ? node.parentRestWorldQuat
        : worldQuats[node.parentIndex];
      const worldQuat = worldQuats[i];

      if (node.source) {
        node.source.bone.getWorldQuaternion(sourceWorldQuat);
        // world delta relative to the source rest pose: D = animated * restInverse
        deltaQuat.copy(node.source.restWorldQuat).invert().premultiply(sourceWorldQuat);
        worldQuat.copy(node.restWorldQuat);
        if (node.resolvedCorrection) worldQuat.premultiply(node.resolvedCorrection);
        worldQuat.premultiply(deltaQuat);

        localQuat.copy(parentQuat ?? worldQuat).invert().multiply(worldQuat).normalize();
        localQuat.toArray(node.values, frame * 4);
      } else {
        worldQuat.copy(node.restLocalQuat);
        if (parentQuat) worldQuat.premultiply(parentQuat);
      }
    }

    if (hipSwayState) {
      // Store the raw WORLD-space delta; mode filtering must happen on world
      // axes before mapping into the carrier's parent-local frame. Rigs whose
      // carrier parent has a rest rotation (Rigify's root bone is -90° about
      // X) would otherwise get the "vertical" bob pinned on LOCAL x/z — which
      // is horizontal in the world, shoving the whole body sideways with the
      // clip's hip motion.
      hipsSource.bone.getWorldPosition(hipsWorldPos);
      hipsWorldPos.sub(hipSwayState.hipsRestWorldPos)
        .multiplyScalar(hipSwayState.heightScale);
      hipsWorldPos.toArray(hipSwayState.values, frame * 3);
    }
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(fbx);

  if (hipSwayState) {
    const { values } = hipSwayState;

    if (!ENABLE_ROOT_MOTION && frameCount > 1) {
      if (hipTranslationMode === 'vertical') {
        // Traveling clip: its XZ path is locomotion, which the physics body
        // already provides. Keep only the vertical bob.
        for (let frame = 0; frame < frameCount; frame += 1) {
          values[frame * 3] = 0;
          values[frame * 3 + 2] = 0;
        }
      } else {
        // Stationary clip: physics keeps the character in place, so the sway
        // must stay centered on the capsule. Remove the linear XZ drift, then
        // the mean, so only the oscillation is left — a constant offset would
        // hang the model outside the collider.
        const last = frameCount - 1;
        const trendX = (values[last * 3] - values[0]) / last;
        const trendZ = (values[last * 3 + 2] - values[2]) / last;
        let sumX = 0;
        let sumZ = 0;
        for (let frame = 0; frame < frameCount; frame += 1) {
          values[frame * 3] -= trendX * frame;
          values[frame * 3 + 2] -= trendZ * frame;
          sumX += values[frame * 3];
          sumZ += values[frame * 3 + 2];
        }
        const meanX = sumX / frameCount;
        const meanZ = sumZ / frameCount;
        for (let frame = 0; frame < frameCount; frame += 1) {
          values[frame * 3] -= meanX;
          values[frame * 3 + 2] -= meanZ;
        }
      }
    }

    // Map the filtered world deltas into the carrier's parent-local frame.
    for (let frame = 0; frame < frameCount; frame += 1) {
      hipsWorldPos.fromArray(values, frame * 3)
        .applyQuaternion(hipSwayState.parentRestWorldQuatInverse)
        .divide(hipSwayState.parentWorldScale)
        .add(hipSwayState.restLocalPos);
      hipsWorldPos.toArray(values, frame * 3);
    }
  }

  const tracks = mappedNodes.map((node) => new THREE.QuaternionKeyframeTrack(
    bakedTrackName(node.bone.name, 'quaternion'),
    times.slice(),
    node.values,
  ));

  if (hipSwayState) {
    tracks.push(new THREE.VectorKeyframeTrack(
      bakedTrackName(centerNode.bone.name, 'position'),
      times.slice(),
      hipSwayState.values,
    ));
  }

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function createMixamoClipForTarget(targetMesh, fbx, sourceClip, sourceBones, rig, clipName = 'Walking retarget', retargetOptions = {}) {
  const sameNameClip = createSameNameSkeletonClip(targetMesh, sourceClip, `${clipName} same-name`);
  if (sameNameClip.tracks.length > 0) return sameNameClip;

  if (RETARGET_MODE === 'direct') {
    return remapMixamoClipTrackNames(sourceClip, rig, `${clipName} direct`);
  }

  if (RETARGET_MODE === 'delta') {
    return remapMixamoClipWithRestDeltas(sourceClip, sourceBones, targetMesh, rig, `${clipName} delta`);
  }

  if (RETARGET_MODE === 'skeleton') {
    return bakeSkeletonRetargetClip(targetMesh, sourceClip, sourceBones, rig, `${clipName} skeleton`);
  }

  return bakeWorldSpaceMixamoClip(targetMesh, fbx, sourceClip, sourceBones, rig, `${clipName} world`, retargetOptions);
}

async function loadRetargetedMixamoClipForTarget(targetMesh, {
  animationUrl,
  clipName,
  filterClip,
  retargetOptions = {},
  rig,
}) {
  const loader = new FBXLoader();
  const fbx = await loadAsync(loader, animationUrl);
  const sourceClip = fbx.animations[0];
  const sourceBones = collectBones(fbx);

  if (!sourceClip || sourceBones.length === 0) {
    throw new Error(`${animationUrl} has no usable Mixamo skeleton animation.`);
  }

  const restoreTargetPose = snapshotSkeletonLocalPose(targetMesh);
  targetMesh.updateMatrixWorld(true);
  fbx.updateMatrixWorld(true);

  try {
    const retargetedClip = createMixamoClipForTarget(targetMesh, fbx, sourceClip, sourceBones, rig, clipName, retargetOptions);
    const filteredClip = filterClip(retargetedClip);
    if (filteredClip.tracks.length === 0) {
      throw new Error(`${animationUrl} did not retarget to any compatible bones (rig: ${rig?.type ?? 'none'}).`);
    }

    return {
      clip: filteredClip,
      sourceTrackCount: sourceClip.tracks.length,
    };
  } finally {
    restoreTargetPose();
  }
}

async function loadIdleClipForTarget(targetMesh, rig) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl: IDLE_ANIMATION_URL,
    clipName: 'Idle',
    filterClip: filterIdleClipForBodyMode,
    retargetOptions: { hipTranslationMode: 'full' },
    rig,
  });
}

async function loadWalkingClipForTarget(targetMesh, rig) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl: WALKING_ANIMATION_URL,
    clipName: 'Walking',
    filterClip: filterWalkingClipForBodyMode,
    retargetOptions: { hipTranslationMode: 'vertical' },
    rig,
  });
}

async function loadJumpClipForTarget(targetMesh, rig) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl: JUMP_ANIMATION_URL,
    clipName: 'Jump',
    filterClip: filterJumpClipForBodyMode,
    retargetOptions: { hipTranslationMode: 'vertical' },
    rig,
  });
}

async function loadRunningClipForTarget(targetMesh, rig) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl: RUNNING_ANIMATION_URL,
    clipName: 'Running',
    filterClip: filterRunningClipForBodyMode,
    retargetOptions: { hipTranslationMode: 'vertical' },
    rig,
  });
}

async function loadSwimClipForTarget(targetMesh, rig, animationUrl, clipName, retargetOptions = {}) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName,
    // Swim strokes animate the whole body; keep every retargeted track.
    filterClip: (clip) => clip,
    retargetOptions: { hipTranslationMode: 'vertical', ...retargetOptions },
    rig,
  });
}

async function loadSitClipForTarget(targetMesh, rig, retargetOptions = {}) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl: SIT_ANIMATION_URL,
    clipName: 'SittingIdle',
    // Seated pose animates the whole body; keep every retargeted track.
    filterClip: (clip) => clip,
    // 'vertical' pins horizontal hip drift but keeps the chair-height hip
    // drop that makes the pose read as sitting.
    retargetOptions: { hipTranslationMode: 'vertical', ...retargetOptions },
    rig,
  });
}

export {
  computeModelBounds,
  fitModelForController,
  bakeSolidBaseColorTextures,
  prepareModelForRealtime,
  loadAsync,
  collectBones,
  exposePoseDebug,
  createArmPoseState,
  snapshotSkeletonLocalPose,
  loadRetargetedMixamoClipForTarget,
  loadIdleClipForTarget,
  loadWalkingClipForTarget,
  loadJumpClipForTarget,
  loadRunningClipForTarget,
  loadSwimClipForTarget,
  loadSitClipForTarget,
  NATIVE_LOCOMOTION_CLIP_NAMES,
  resolveNativeLocomotionClips,
};
