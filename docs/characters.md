# Characters and animation

Bring-your-own-model is a first-class feature: any humanoid character in a
common format gets loaded, toon-shaded, and animated — without code changes
in the labs, with rig helpers in `@call-me-sensei/toonlab/character` and optional loader
helpers in `@call-me-sensei/toonlab/loaders` for your own app.

## Loading models

```js
import { loadModelAsset, SUPPORTED_MODEL_FORMATS } from '@call-me-sensei/toonlab/loaders';

const asset = await loadModelAsset('models/hero.vrm');
// asset: { root, clips, format, url, resourcePath, vrm? }
scene.add(asset.root);
```

(Inside this repo the labs import from `../../src/character/...`.)

Supported formats (`SUPPORTED_MODEL_FORMATS`): `pmx`, `pmd`, `fbx`, `glb`,
`gltf`, `vrm` (0 and 1), `obj` (pass `materialUrl` for the MTL), and
text-based `usdz`. VRM models are detected automatically on glTF load,
rotated to the +Z convention, and returned with the `vrm` instance.

Draco or KTX2-compressed glTF assets need an explicit decoder directory:

```js
await loadModelAsset('models/compressed.glb', {
  decoderBasePath: '/vendor/three-decoders/',
  renderer,
});
```

In the labs, use the HUD **Model URL** input or `?model=` — local paths and
hosted URLs both work (hosted URLs need CORS headers on the server; load
failures surface in a HUD banner). Private test models go in the gitignored
`assets-local/models/` drop-in folder: after `npm run assets:local` they
surface in every lab's Model select, no code changes. See
[getting-started.md](getting-started.md#loading-your-own-models) for the
folder shapes the scanner recognizes.

## Bone-role adapters (`characterRig`)

Animation is rig-agnostic because bone *names* are resolved to canonical
humanoid *roles* (VRM humanoid naming, `HUMANOID_ROLES`) once, up front:

```js
import { resolveCharacterRig, targetBoneNameForRole } from '@call-me-sensei/toonlab/character';

const rig = resolveCharacterRig(skinnedMesh, { vrm: asset.vrm });
// rig: { type, targetToMixamo, mixamoToTarget, hipCarrierName } — or null
targetBoneNameForRole(rig, 'head'); // the model's actual head bone name
```

`resolveCharacterRig` tries each convention adapter in order:

1. **VRM** — the humanoid bone map from the VRM extension (spec'd, exact).
2. **MMD/PMX** — Japanese bone names (`頭`, `下半身`, ...), including the
   center-bone hip carrier.
3. **Mixamo-named** — skeletons already using `mixamorig` names (normalized
   for the common prefix variants).
4. **Rigify** — Blender Rigify `DEF-` deform bones, matched loosely
   (heuristic name matching handles export renaming).

If no adapter matches, retargeting is impossible and models fall back to
their embedded clips. Everything downstream (retargeting, the procedural
swim clip, head tracking) works through roles, so a new rig convention is
one name table, not a new pipeline.

## Native-clip fast path

Models that ship their own locomotion clips skip retargeting entirely. A
model qualifies when at least idle + walk resolve against these clip-name
conventions (`NATIVE_LOCOMOTION_CLIP_NAMES` in
`labs/playground/animationPipeline.js`; first match per role wins):

| Role | Accepted clip names |
|---|---|
| idle | `Idle_Loop`, `Idle` |
| walk | `Walk_Loop`, `Walking`, `Walk` |
| run | `Sprint_Loop`, `Jog_Fwd_Loop`, `Running`, `Run` |
| jump | `Jump_Start`, `Jump_Loop`, `Jump` |
| swim | `Swim_Fwd_Loop`, `Swimming`, `Swim` |
| tread | `Swim_Idle_Loop`, `Treading_Water`, `TreadingWater` |

The bundled CC0 mannequin (Quaternius Universal Animation Library, 45
embedded clips) qualifies out of the box — that is why a fresh clone
animates with zero downloads. Author your own GLBs to these names and they
play natively too.

## Mixamo retarget pipeline

For models without native clips, the Playground retargets Mixamo FBX clips
onto the resolved rig with a world-space bake: only the role mapping comes
from `characterRig`; rest-pose differences (T-pose vs. A-pose) and hierarchy
mismatches are solved numerically. This is how a PMX character, a VRM
avatar, and a Rigify export all play the same `Walking.fbx`.

Adobe's terms do not permit redistributing Mixamo clips, so the repo ships
none. Download clips with your own Adobe account from
[mixamo.com](https://www.mixamo.com) and drop them into
`assets-local/animations/` (`Idle.fbx`, `Walking.fbx`, `Running.fbx`,
`Jump.fbx`, `Swimming.fbx`, `Treading_Water.fbx`, ...). Override individual
clips per URL: `?swimAnim=`, `?treadAnim=`, `?diveAnim=`, `?anim=`. See
[ATTRIBUTION.md](../ATTRIBUTION.md).

When a swim/tread retarget source is missing, the pipeline falls back to the
model's native swim clips if it has them.

## Procedural freestyle swim

`createFreestyleSwimClip(targetMesh, rig, options)` generates a freestyle
(front crawl) swim clip with no FBX source: windmilling catch-up arm
strokes, flutter kick, body roll, and a breath every fourth stroke. Motion
is authored as world-space rotation deltas against the bind pose, so the
same code bakes onto any supported skeleton (VRM, MMD, Mixamo-named,
Rigify).

```js
import { createFreestyleSwimClip } from '@call-me-sensei/toonlab/character';

// Skeleton must be in bind pose when you call this.
const clip = createFreestyleSwimClip(targetMesh, rig, {
  clipName: 'FreestyleSwim',
  trackNameStyle: 'skeleton', // 'skeleton' for retarget-style mixers, 'node' for native-clip mixers
});
mixer.clipAction(clip).play();
```

The Playground uses it as the default swim style (`?freestyleAnim=none`
disables it).

## swimVisualLift

Swim physics floats every model at the same capsule depth below the wave
surface — the whole swim backend (vertical control, clamps, ray geometry,
wave exposure) is tuned as a package around one value, and giving models
different physics floats re-exposes tuning bugs. Models that need to *look*
higher or lower in the water get `swimVisualLift`: a visual-only vertical
offset applied to the model group while swimming, which the physics never
sees. The compact mannequin uses `0.18` to read as surface freestyle; a
character with tall hair volume needs none. Per-model values live in the
lab's character options (`labs/shared/sceneHub.js`); override for testing
with `?swimVisualLift=`.
