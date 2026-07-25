// TransformControls wrapper for piece placement. The gizmo drags the
// piece's scene GROUP live (no re-meshing mid-drag); on release the
// transform is written back into the document and committed through the
// host's callback (history snapshot + optional merged re-mesh).
//
// r185 note: TransformControls is no longer an Object3D — its visual goes
// into the scene via getHelper().

import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const GIZMO_MODES = Object.freeze(['translate', 'rotate', 'scale']);

export function createTransformGizmo({
  camera,
  domElement,
  mode = 'translate',
  onChange,
  onCommit,
  orbitControls,
  scene,
}) {
  const controls = new TransformControls(camera, domElement);
  controls.setSize(0.85);
  controls.setMode(GIZMO_MODES.includes(mode) ? mode : 'translate');
  const helper = controls.getHelper();
  scene.add(helper);

  let attachedPieceId = null;

  function targetTransform() {
    const target = controls.object;
    return {
      position: target.position.toArray(),
      rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      scale: target.scale.toArray(),
    };
  }

  controls.addEventListener('objectChange', () => {
    if (attachedPieceId && controls.object) onChange?.(attachedPieceId, targetTransform());
  });

  controls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
    if (!event.value && attachedPieceId && controls.object) {
      onCommit(attachedPieceId, targetTransform());
    }
  });

  return {
    attach(group, pieceId) {
      attachedPieceId = pieceId;
      controls.attach(group);
      helper.visible = controls.enabled;
    },
    controls,
    detach() {
      attachedPieceId = null;
      controls.detach();
      helper.visible = false;
    },
    helper,
    isTransformActive() {
      return Boolean(controls.dragging || controls.axis);
    },
    setEnabled(enabled) {
      controls.enabled = enabled;
      helper.visible = enabled && Boolean(controls.object);
    },
    // TransformControlsRoot has a back-reference to its controls instance.
    // Three's WebGPU shadow/post passes clone scene nodes but not that private
    // back-reference, so a mounted helper crashes updateMatrixWorld even while
    // hidden. Reference rendering never needs the authoring gizmo; physically
    // remove it from render passes and remount it for editable ToonLab rocks.
    setSceneMounted(mounted) {
      if (mounted) {
        if (helper.parent !== scene) scene.add(helper);
      } else {
        helper.removeFromParent();
      }
    },
    setMode(nextMode) {
      if (GIZMO_MODES.includes(nextMode)) controls.setMode(nextMode);
    },
  };
}
