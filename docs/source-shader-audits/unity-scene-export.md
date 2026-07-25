# So Stylized Unity scene export

`scripts/unity/UnitySceneExport.cs` exports the supplied
`M_Demonstration_Mega` scene from Unity itself. Unity is the authority: the
tool reads imported meshes, resolved material values, prefab overrides, and
`TerrainData` through Editor APIs instead of trying to infer them from YAML.

The licensed output is written under gitignored
`assets-local/sostylized-unity/mega-scene/`.

## Run

Copy the exporter into an `Assets/Editor` folder in a disposable project copy,
then run the exact Unity editor version used for the parity work:

```sh
cp scripts/unity/UnitySceneExport.cs \
  /private/tmp/toonlab-unity-parity-project/Assets/Editor/UnitySceneExport.cs

/Applications/Unity/Hub/Editor/6000.5.4f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -nographics \
  -projectPath /private/tmp/toonlab-unity-parity-project \
  -executeMethod ToonLab.Editor.UnitySceneExport.Run \
  -scene Assets/SoStylized-Unity/Demo/M_Demonstration_Mega.unity \
  -captureLabel package-recommended-urp-settings \
  -pipeline Assets/SoStylized-Unity/Settings/URP_Asset_SoStylized.asset \
  -output "$PWD/assets-local/sostylized-unity/mega-scene-native-package-recommended" \
  -quit
```

Validate the result with:

```sh
node scripts/verify-so-stylized-unity-scene-export.mjs \
  --input assets-local/sostylized-unity/mega-scene-native-package-recommended
```

The labeled profile manifests preserve URP 17.5's serialized AO enum and an
explicit decoded name. `AOMethod=0` is `BlueNoise` (current PC: radius `.3`,
effective radius `.45`, direct `.25`, Medium/8 samples); `AOMethod=1` is
`InterleavedGradient` (package-recommended: radius `2`, direct `.5`, High/12
samples).

## Output contract

`scene.glb` has two glTF scenes:

1. `Unity Scene` (the default) is the exact Unity scene hierarchy. It includes
   active and inactive objects, reflected Unity-to-glTF transforms, every
   `MeshFilter` mesh, every submesh, positions, normals, tangents, vertex
   colors, UV0-UV7, material slots, and the camera. Mesh geometry is reused;
   mesh/material combinations are separate glTF mesh definitions.
2. `Unity Terrain Prefab Prototypes` is a library, not visible in the default
   scene. Its roots are every terrain detail/tree prefab. Clone the root named
   by `prefabPrototypes[index].gltfRoot` for terrain placement.

The GLB reflects Unity Z to enter glTF's right-handed coordinate system. It
also reverses triangle winding and tangent handedness. The manifest keeps all
original Unity transforms unchanged so audit values remain comparable to the
Inspector.

`scene-manifest.json` contains Unity-only state that glTF cannot preserve:

- full scene hierarchy, original local/world transforms, prefab source
  GUID/local-file-ID, component types, layers, tags, and static flags;
- renderer enabled/forced-off state, cast/receive shadows, motion vectors,
  light/reflection probes, rendering layer mask, sorting, bounds, and exact
  material slots;
- every resolved Unity material property, shader name/reference, keywords,
  render queue, instancing/GI flags, and texture importer settings;
- camera, directional light, render settings, active render-pipeline asset,
  renderer asset, GUIDs, exact YAML hashes, MSAA/HDR/depth/opaque/color-grade,
  shadow, SSAO, scene LOD groups, and prefab LOD groups;
- complete terrain layers, tree/detail prototypes, tree instances, and terrain
  renderer settings.

`terrain-native-authority.json` is deliberately separate from that manifest.
It stores `Terrain.GetPosition()` (Unity Terrain renders translation-only), the
explicit renderer-transform contract, and 81 native TerrainData surface probes.
Keeping later diagnostic probes in this independently hashed sidecar preserves
the byte identity of an already capture-pinned `scene-manifest.json`.

Material indices have one canonical space. These all identify the same value:

```text
scene-manifest.json materials[N]
node.renderer.materialIndices[submesh]
scene.glb materials[N]
scene.glb mesh.primitives[submesh].material
scene.glb material.extras.unityMaterial
```

The GLB material is intentionally a neutral transport material. Reconstruct
the Unity/ToonLab shader from `materials[N]`; do not judge parity using the
neutral glTF PBR fallback.

Exact source texture bytes used by exported materials are copied to
`textures/source/`. The manifest retains sRGB/linear, normal-map type,
green-channel flip, mipmap, wrap, filter, anisotropy, and alpha-import state.

## Terrain sidecars

Terrain stays a heightfield rather than being frozen into a very large mesh.
All binary files are little-endian and row-major, with row `z` first and `x`
second:

- `heights.f32`: `heightmapResolution²` normalized Unity heights. Local height
  in metres is `height * terrain.size[1]`.
- `alphamaps.f32`: `height * width * layerCount` authoritative splat weights,
  ordered `z, x, layer`.
- `control-NN.rgba8` and `.png`: convenient four-layer control maps. These are
  8-bit derivatives; use `alphamaps.f32` when exact weights matter.
- `holes.u8`: one byte per hole sample (`1` means terrain exists, matching
  `TerrainData.GetHoles`).
- `detail-NNN.i32`: one signed 32-bit density value per detail cell.
- `detail-NNN-native-transforms.f32`: schema-v2 patch-major native fields
  `posX,posY,posZ,rotationY,scaleXZ,scaleY` returned by Unity 6000.5.4f1's
  `TerrainData.ComputeDetailInstanceTransforms`. Each prototype record carries
  its SHA-256, source density, Unity version, and all 256 patch offsets, counts,
  and returned bounds. The validated total is 270,871 exact transforms.

To construct terrain inside a glTF/Three hierarchy, reflect the local Z
coordinate like the GLB mesh exporter:

```js
const localPosition = new THREE.Vector3(
  normalizedX * terrain.size[0],
  normalizedHeight * terrain.size[1],
  -normalizedZ * terrain.size[2],
);
```

For each `treeInstances[]` entry, clone the scene-1 root whose
`userData.unityPrefab` equals
`treePrototypes[prototypeIndex].gltfPrefab` (or index the root directly from
`prefabPrototypes[index].gltfRoot`), set local position with the same formula, use scale
`[widthScale, heightScale, widthScale]`, and negate the Unity Y rotation after
the Z reflection.

The scene's Terrain component itself remains a hierarchy node in GLB scene 0,
but Unity's Terrain renderer does **not** inherit that serialized rotation and
scale. Place the reconstructed heightfield and its detail/tree instances in an
identity root translated from `terrain-native-authority.json.position`; the
sidecar's counterexample probes verify why `TransformPoint` is not authoritative.

## Current captured baseline

The validated supplied scene currently contains:

- 1,555 scene nodes and 802 scene `LODGroup`s;
- 488 unique imported mesh geometries and 585 mesh/material variants;
- 145 materials and 105 exact source texture files;
- one 513×513 heightfield, five 2048×2048 splat layers, 17 1024×1024 detail
  density fields, 270,871 native detail transforms, 158 unique detail/tree
  prefab prototypes, and 1,695 terrain tree instances;
- one camera and one directional light.

There are no `SkinnedMeshRenderer`s in this scene. The exporter records a
limitation if a future scene contains one: its bind-pose mesh is retained, but
joints, weights, blend shapes, and animation are not yet emitted.
