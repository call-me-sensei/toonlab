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
  scene.add(controls.getHelper());

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
      controls.getHelper().visible = controls.enabled;
    },
    controls,
    detach() {
      attachedPieceId = null;
      controls.detach();
      controls.getHelper().visible = false;
    },
    isTransformActive() {
      return Boolean(controls.dragging || controls.axis);
    },
    setEnabled(enabled) {
      controls.enabled = enabled;
      controls.getHelper().visible = enabled && Boolean(controls.object);
    },
    setMode(nextMode) {
      if (GIZMO_MODES.includes(nextMode)) controls.setMode(nextMode);
    },
  };
}
