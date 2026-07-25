# Unity Mega source-frame parity

This gate isolates camera/world-frame correctness from every material,
lighting, fog, and post-process comparison.

## Root cause

The exported camera is the child of `C_SpectatorCamera`. `OrbitControls`
performs an update in its constructor with a default world-space target at the
origin, but reads and writes `camera.position` as though it were world space.
On the nested glTF camera that field is local `(0,0,0)`. The constructor
therefore changed the source camera rotation before the first rendered frame.

The deterministic regression fixture measures the change as:

- `0.074544` radians
- `4.271` degrees

That was enough to show a different valley/path region even though the source
camera transform, static meshes, Terrain, trees, and details had all been
exported correctly.

## Runtime correction

Before controls are created, the camera is attached to the identity render
Scene with its world transform preserved. Immediately after the controls
constructor, the source position/quaternion are restored and the controls
target is placed 100 metres along the exact source forward ray.

The native capture also locks its projection to the capture target's
`1920x1080` (`16:9`) aspect. The manifest's `1.3333333` aspect records the
editor Game View at export time and is not the 1920x1080 capture projection.
Future native capture reports include both the world-to-camera and projection
matrices.

## Numerical acceptance gate

`npm run verify:unity-mega-frame` currently proves:

- reflected camera position error: `0.0000085535 m`
- reflected camera quaternion error: `0.0000000298 rad`
- 1,256 independently projected source landmarks
- maximum in-frame Unity-to-Three NDC error: `0.0000002614`
- 1,555 / 1,555 static scene nodes bound to the reflected source frame
- Terrain root matrix error: `0.0000001192`
- sampled Terrain tree world-position error: `0.0000197058 m`
- sampled native-detail world-position error: `0.0000328958 m`
- reflected Terrain corner/axis error: `0`

The landmark projection uses Unity's independent camera convention (`+Z`
forward) and compares it with the reflected Three camera (`-Z` forward). It
samples static renderer bounds, Terrain corners, five Terrain tree records,
and three native transforms from every detail prototype. The showcase refuses
to start if this source-frame gate fails.

