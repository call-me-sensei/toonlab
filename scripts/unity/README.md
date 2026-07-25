# Unity licensed-source extractors

`extract-rock-materials.mjs` converts the local SoStylized Unity rock-material
library into deterministic runtime-neutral data without checking licensed
assets into Git.

Run it from the ToonLab package root:

```sh
node scripts/unity/extract-rock-materials.mjs \
  --source "/path/to/Assets/SoStylized-Unity"
```

The tool is intentionally restricted to writing beneath the gitignored
`assets-local/sostylized-unity/` directory. Its default output is:

```text
assets-local/sostylized-unity/
  rock-material-library.json
  textures/<source-relative texture path>
```

## JSON contract

The schema is `toonlab.sostylized-unity.rock-material-library`, version 1.

- `materials[]` contains every `.mat` under `Environment/Rocks`.
- `direct` contains only values serialized on that material or material
  variant.
- `resolved` merges the entire Unity `m_Parent` chain root-to-leaf. A child
  property replaces the same parent property within its category.
- `propertySources` identifies the material that supplied every final value.
- `inheritanceChain` is ordered root first and selected variant last.
- Texture entries retain Unity `fileID`, GUID, scale, and offset. A `fileID`
  of zero is an explicit null texture.
- A non-null texture GUID indexes `texturesByGuid`, which records the original
  source-relative asset path, copied output path, SHA-256, byte length, and
  relevant `TextureImporter` settings such as sRGB/linear, normal-map type,
  green-channel flip, mipmaps, filtering, anisotropy, and wrapping.
- Numeric and color values are the serialized Unity values. The extractor
  performs no unit, color-space, normal-convention, smoothness, or roughness
  conversion.

Missing parent or texture GUIDs fail extraction by default. Use
`--allow-unresolved` only for diagnostics. Use `--no-copy-textures` to build
the index without copying texture source files.

## Authoritative demo-scene export

`UnitySceneExport.cs` runs inside Unity Editor and exports the active
`M_Demonstration_Mega` hierarchy to a two-scene GLB plus exact TerrainData and
material sidecars. Copy it into the disposable Unity project's
`Assets/Editor/` folder, then invoke
`ToonLab.Editor.UnitySceneExport.Run` in batch mode. Licensed output belongs
under gitignored `assets-local/sostylized-unity/mega-scene/`.

Scene-export schema v2 also writes every native
`TerrainData.ComputeDetailInstanceTransforms` field as patch-major float32,
with per-patch offsets/counts/bounds, density authority, editor version, and
SHA-256. Use `-captureLabel` and optional `-pipeline <Assets path>` so current
and package-recommended pipeline evidence stays in separate labeled outputs.

See `docs/source-shader-audits/unity-scene-export.md` for the command, binary
layout, Three.js loading contract, and the current validated inventory. Run
`npm run verify:unity-scene-export` after every capture.
