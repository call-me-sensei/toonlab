# Asset attribution

Code is MIT-licensed by Hyperbond Studio PTE. LTD. (see LICENSE). The assets bundled in this repository:

## Bundled assets

| Asset | Location | License | Source |
|---|---|---|---|
| Mannequin character (45 embedded animation clips) | `public/characters/mannequin.glb` | CC0 1.0 | [Quaternius — Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), recolored to neutral grays. See `public/characters/LICENSE.md`. |
| Landscape textures (grassy-land, land, mountain, rock, sand, tree-trunk) | `labs/shared/textures/` | CC0 1.0 | First-party (created by the toonlab authors), dedicated to the public domain. |

Everything else that renders — water, sky, grass, flowers, trees, foliage,
splashes, post-processing — is procedural code, no asset files.

## Not bundled (bring your own)

The labs can additionally load content from a gitignored `assets-local/`
folder that is **not** part of this repository:

- **Mixamo animation clips** (`assets-local/animations/*.fbx`) — the retarget
  pipeline plays Adobe Mixamo clips on any humanoid model. Download clips
  with your own Adobe account from [mixamo.com](https://www.mixamo.com) and
  drop them in; Adobe's terms do not permit us to redistribute the files.
  Without them, models fall back to their own embedded clips (the bundled
  mannequin covers idle/walk/run/jump/swim/tread natively).
- **Your models** (`assets-local/models/`) — PMX/VRM/GLB/FBX/OBJ characters
  for testing; or pass any hosted URL via the HUD's Model URL field /
  `?model=`. Make sure you have the rights to any model you load.
- **Scanned props/environments** (`assets-local/environments/`) — licensed
  packs (Fab/Megascans etc.) can be dropped in for the demo scenes;
  the scenes render procedural stand-ins when they're absent.

## Recommended free sources

- [Quaternius](https://quaternius.com) — CC0 models + the Universal
  Animation Library (v1 and v2 free tiers).
- [Poly Haven](https://polyhaven.com) — CC0 textures/HDRIs/models.
- [Kenney](https://kenney.nl) — CC0 game assets.
- [OpenGameArt](https://opengameart.org) — filter by CC0/CC-BY.
- [VRoid Hub](https://hub.vroid.com) — VRM avatars (check per-model terms).
