---
name: camera
description: Help developers use ToonLab's composable camera rig — follow, framing, collision, damping, noise, impulse, and lens operators, director blending, and camera preset documents.
---

# Camera

Use this skill when a developer wants a third-person or gameplay camera:
smooth follow with framerate-independent damping, screen-space framing,
look-ahead, collision recovery, procedural shake/noise, event impulses, lens
control, blending between camera rigs, or portable camera preset documents.

Public imports:
- `@call-me-sensei/toonlab/camera`

Read first:
- `docs/style-labs.md` (Camera section)

Quickstart:

```js
import { createCameraRig, createCameraDirector } from '@call-me-sensei/toonlab/camera';

const rig = createCameraRig({
  camera,                       // a THREE.Camera the app owns
  target: player,               // Object3D, Vector3, or () => position
  collisionQuery: (from, to) => raycastDistance(from, to), // app-owned probe
  settings: preset?.settings,   // optional generated/saved camera preset
});

// per frame
rig.update(delta);

// gameplay events
rig.addImpulse({ amplitude: 0.4, duration: 0.3 });
```

Developer guidance:
- The rig is an ordered operator stack (follow, lookAhead, framing, collision,
  damping, lens, noise, impulse). Enable/disable/extend operators via
  `setOperators` or `registerCameraOperator`; do not fork the rig for one
  behavior change.
- Collision is delegated: the app supplies `collisionQuery(from, to)` against
  its own physics/raycaster and returns a distance, point, or
  `{ distance, hit }`. Without it the rig simply skips collision.
- Damping is exponential and framerate-independent — do not wrap the rig in
  additional lerp smoothing.
- Use `createCameraDirector(camera)` with `addRig`/`setActive` to blend
  between rigs (exploration/combat/cutscene) instead of mutating one rig.
- For portable documents, use `createCameraGeneratorRecipeDocument` +
  `generateCameraPreset` in code (deterministic per seed); the MCP
  `generate_style_presets` tool is only for persisting validated batches to
  the shared workspace. Ship the flat preset, not the recipe, when exact
  behavior is required.
- The app owns the render loop, input, and character controller; the rig only
  writes camera position/quaternion/fov.

Verify:
- Run the consumer app and check follow behavior while moving, turning, and
  teleporting (teleports must snap, not swoop).
- If collision is wired, back the character into a wall and confirm the camera
  recovers smoothly without clipping.
