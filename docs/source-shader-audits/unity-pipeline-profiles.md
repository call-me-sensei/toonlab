# Unity renderer profile evidence

## Result

The supplied Unity project contains two materially different URP setups. They
must remain separate references until both native captures exist:

1. **Current sample project** — the active `PC` Quality tier and
   `GraphicsSettings` both select `PC_RPAsset`, which selects `PC_Renderer`.
2. **Documented intended pack setup** — the supplied Unity guide says to use
   `URP_Asset_SoStylized` for every Quality tier. That asset selects
   `URP_Renderer_SoStylized`, but it is not currently selected by the supplied
   project's `PC` tier or `GraphicsSettings`.

The public, immutable records are in
`src/environment/soStylizedUnityPipelineProfiles.js`. They are evidence only:
this change does not alter the current runtime render contract, switch the
Unity project, or overwrite either native capture.

## Look-critical differences

| Field | Current sample | Documented intended |
| --- | ---: | ---: |
| Renderer path | Forward+ | Deferred |
| HDR | on | on |
| depth / opaque texture | on / on | on / on |
| MSAA | 1 | 4 |
| render scale | 1 | 1 |
| main shadow atlas | 2048 | 4096 |
| cascade tile in the 2×2 atlas | 1024 | 2048 |
| shadow distance | 50 | 500 |
| four-cascade splits | `.123, .2926, .536, 1` | `.016, .08, .269, 1` |
| cascade border | `.107758604` | `.352` |
| depth / normal bias | `.1 / .5` | `.3 / .13` |
| color grading mode | LDR | HDR |
| SSAO method | Blue Noise | Interleaved Gradient |
| SSAO radius | `.3` (`.45` effective) | `2` |
| SSAO direct-light strength | `.25` | `.5` |
| SSAO samples | Medium / 8 | High / 12 |
| SSAO falloff | `100` | `9999` |
| intermediate texture | Auto | Always |

The SSAO method labels above come from the installed URP 17.5 enum, not from
guessing the numeric values: `AOMethod = 0` is `BlueNoise` and `1` is
`InterleavedGradient`. Blue Noise alone applies URP's `1.5` radius multiplier.
This corrects the easy-to-make inverse interpretation of those serialized
integers.

## Source authority

- Unity guide:
  [UNITY SoStylized Documentation](https://docs.google.com/document/d/1DO2epMFrkPEauO7-2zf-KXt_M1oRlx9PGnAMT3Iy8Js/edit?tab=t.0#heading=h.p3v51fi53inf)
- Current pipeline asset:
  `Assets/SourceFiles/Settings/PC_RPAsset.asset`
- Current renderer:
  `Assets/SourceFiles/Settings/PC_Renderer.asset`
- Documented pipeline asset:
  `Assets/SoStylized-Unity/Settings/URP_Asset_SoStylized.asset`
- Documented renderer:
  `Assets/SoStylized-Unity/Settings/URP_Renderer_SoStylized.asset`
- Active selection:
  `ProjectSettings/QualitySettings.asset` and
  `ProjectSettings/GraphicsSettings.asset`
- Enum authority:
  URP 17.5 `ScreenSpaceAmbientOcclusion.cs`,
  `UniversalRenderPipelineAsset.cs`, and `UniversalRenderer.cs`

`docs/source-shader-audits/unity-pipeline-profile-evidence.json` locks the
project-relative paths, GUIDs, SHA-256 hashes, serialized values, active
selection, engine revision, and URP version.

## Verification

```bash
node scripts/verify-so-stylized-unity-pipeline-profiles.mjs
```

The verifier always derives both public profiles independently from the
checked evidence JSON. If the source Unity project exists at
`$TOONLAB_UNITY_PROJECT`, `--unity-project=/path`, or the supplied project's
default location under the current user's home directory, it additionally
re-reads and hashes every asset/meta/project-settings file, parses all locked
fields, confirms the active pipeline GUIDs, and checks the URP enum order.

## Runtime integration boundary

Do not replace `SO_STYLIZED_UNITY_RENDER_CONTRACT` implicitly. A future native
capture should explicitly select one profile ID and record that ID plus the
four asset GUIDs/hashes in its manifest. The intended comparison should then
pair a native capture made with `documented-intended-so-stylized` with a
ToonLab render configured from that same profile. The existing current-sample
capture remains evidence for `current-sample-pc`.
