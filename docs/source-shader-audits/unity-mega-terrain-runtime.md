# Unity Mega Terrain/Lit runtime

This runtime is reconstructed source-to-source. No screenshot values or
visual tuning are used. The authorities are `scripts/unity/UnitySceneExport.cs`,
the capture-pinned `scene-manifest.json`, `terrain-native-authority.json`,
`unity-terrain-detail-native-culling-audit.json`,
the binary `TerrainData` sidecars, Unity 6000.5 URP
17.5 `TerrainLitInput.hlsl` and `TerrainLitPasses.hlsl`, and ToonLab's literal
URP metallic BRDF bridge.

The implementation is `src/environment/soStylizedUnityMegaTerrain.js`. Run:

```sh
npm run verify:unity-mega-terrain
```

## Runtime use

```js
import { createSoStylizedUnityMegaTerrain } from '@call-me-sensei/toonlab/environment';

const terrain = await createSoStylizedUnityMegaTerrain();
scene.add(terrain.root);

// Passing scene.glb's prototype-library scene clones all serialized trees and
// requires schema-v2 native detail transforms. Parity mode never falls back.
const populated = await createSoStylizedUnityMegaTerrain({
  prefabLibrary: gltf.scenes[1],
  onTreeInstance({ clone }) {
    // Optional hook for the Unity material dispatcher.
  },
  onDetailMesh({ mesh }) {
    // Optional hook for per-instance material dispatch/routing.
  },
});
scene.add(populated.root);
populated.trees.update(camera);
populated.details.update(camera);
```

## Exact connected data

- `scene-manifest.json` remains byte-identical to the native image capture's
  pinned export. `terrain-native-authority.json` separately binds the exact
  `Terrain.GetPosition()` translation-only renderer frame and a 9x9 native
  height/normal/splat probe grid. Runtime hydration adds exactly those three
  fields (`position`, `renderTransformAuthority`, `surfaceProbes`) and cannot
  rewrite any other manifest path.
- All 263,169 samples become `[x, height * sizeY, -sourceZ]`, preserving the
  exact 513x513 reflected-Z grid. `holes.u8` omits zero-valued 512x512 cells.
- Control UVs use URP's `(uv * (resolution - 1) + .5) / resolution` formula.
- Default `float32` uploads all 20,971,520 splat values without quantization
  as RGBA32F layers 0-3 plus R32F layer 4. `splatPrecision: 'uint8'` is the
  explicit lower-memory control-map path.
- The five manifest layers are `TL_Grass`, `TL_Dirt`, `TL_Sand`, `TL_Rock`,
  and `TL_Snow`. Each texture, tile size/offset, normal scale, metallic,
  smoothness, sRGB/linear state, wrap/filter/mipmap/anisotropy setting, normal
  import type, and green-flip setting is manifest-driven.
- Terrain/Lit's weighted tangent-normal composition is retained, including
  flat contributions for layers without normals and the normalization epsilon.
- Unity's five-layer 4+1 draw topology is retained. Layers 0-3 normalize and
  run through the metallic URP BRDF as the opaque base pass. Layer 4
  independently normalizes and runs through the same BRDF, clips at source
  pass weight `<= .005`, disables depth writes, and uses `Blend One One`.
  `SplatmapFinalColor` weighting is applied to each completed pass result, not
  to a five-layer average before lighting.
- Population instantiates all 141 tree prototypes and all 1,695 exact tree
  instances. It also decodes all 17 exact CoverageMode density sidecars and all
  270,871 native `TerrainData.ComputeDetailInstanceTransforms` records from
  Unity 6000.5.4f1. Position, rotation, and scale are never regenerated.
  Source meshes, materials, vertex colors, reflected transforms, and
  per-renderer shadow-caster eligibility remain connected.
- Detail meshes expose each instance's Unity object origin through the
  `iUnityObjectPosition` vec3 attribute for foliage hue/distance logic. The
  exported 16x16 patch layout, Unity-returned per-prototype bounds, and
  150-unit draw distance bound the active draw set. Unity 6000.5.4f1 native
  disassembly proves the exact order: nearest-point squared camera-to-AABB
  distance, then full patch-AABB/frustum intersection. Replaying that predicate
  for Camera 0 selects 13 unique patches, 45 prototype-patches, and 79,086
  instances; the deterministic selection hash is `f5e76234`. This fixture is
  not presented as a native Frame Debugger draw-event count.
- The 17 fields contain 3,989 flower instances. The exact source-camera patch
  window contains 976: 721 daisies plus 255 daffodils. The runtime does not
  synthesize or omit those meshes.
- All 1,695 terrain trees retain their 103 distinct exported instance colors
  as metadata. The compiled `S_Leaves` and `S_Bark` Shader Graph programs do
  not consume `_TreeInstanceColor`, `_TreeInstanceScale`, or
  `TerrainEngine.cginc`; consequently the runtime does not invent a tint from
  those metadata fields.
- The exported camera projection and reflected world pose are applied without
  visual tuning. All 802 scene LODGroups evaluate their reflected local
  reference point, world size, camera distance, vertical FOV, and thresholds.

## Explicit renderer/API bridges

1. Unity uses native adaptive Terrain patches. ToonLab keeps the complete
   513x513 grid resident; `heightmapPixelError=5` tessellation is not emulated.
2. Unity imports several 4096 source PNGs as 2048 DXT1/DXT5. The browser uses
   exact source PNG bytes and importer state, not Unity's platform DXT blocks.
3. The LOD updater exactly implements Unity's exported screen-height equation
   for these `FadeMode.None` groups. Three still owns final per-object
   frustum/occlusion culling. Terrain detail patch culling is the exception:
   its native distance-then-frustum sequence is reproduced before the surviving
   instances are repacked into aggregate InstancedMeshes.
4. Schema v2 stores every native detail transform in patch-major order with
   per-patch offsets, counts, bounds, source density, Unity version, and
   SHA-256. `native-exact` is the parity default and throws if any sidecar or
   hash is missing. `deterministic-source-style` remains an explicit non-parity
   compatibility mode only; it is never an automatic fallback.
