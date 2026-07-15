# Getting started

## Clone and run

```bash
git clone https://github.com/call-me-sensei/toonlab.git && cd toonlab
npm install
npm run dev
```

Vite opens `http://localhost:5175` with the Shader Lab and the bundled CC0
mannequin already toon-shaded. Everything you see out of the box — water,
sky, grass, trees, flowers, splashes — is procedural; the mannequin is the
only bundled model.

Rendering uses Three's `WebGPURenderer` by default. Use `?renderer=webgl` for
the TSL WebGL2 fallback, or `?renderer=webgpu` to make the default explicit.

`npm run build` produces a production build in `dist/`.

## The labs

The demo labs live in `labs/` (they are not part of the npm package). The
HUD **Scene** select switches between them; these are the direct URLs:

| Lab | URL | What it shows |
|---|---|---|
| Shader Lab | `/` | Character + environment shader tuning. Every toon setting (23 groups) and environment setting as live controls, preset selection/export/import, debug views, animation playback. Exercises `@call-me-sensei/toonlab/toon`, `@call-me-sensei/toonlab/environment`, `@call-me-sensei/toonlab/debug`. |
| Playground: Controller Test | `/playground/` | Third-person character controller (WASD + mouse, Space to jump, Shift to sprint) on a vegetated stage. Exercises `@call-me-sensei/toonlab/character` retargeting + the vegetation systems. |
| Environment Lab (Indoor) | `/playground/?scene=indoor` | Walkable indoor environment scene with a live Environment Settings panel (every environment shader feature and parameter from the field schema). Loads the first environment from your gitignored `assets-local/environments/` drop-in (bring your own scene — a load banner appears without one). Exercises `@call-me-sensei/toonlab/environment` + `@call-me-sensei/toonlab/debug`. |
| Water Lab | `/playground/?scene=water` | Every water scene in one lab — the HUD **Mode** select switches wadeable lake (ripples, wakes, buoyancy), flowing river with current, and ocean beach with shoaling swell, plunging breakers, and swash. Walk in past chest depth and the character swims; C/Ctrl dives, Space swims up. Exercises the full `@call-me-sensei/toonlab/water` system. |
| Rock Lab | `/rock-lab/` | Procedural stylized rocks, cliffs, heightfields, sculpt edits, and GLB export from `@call-me-sensei/toonlab/rockgen`. |
| Tree Lab | `/tree-lab/` | Procedural stylized trees, flowers, sketches, recipes, and GLB export from `@call-me-sensei/toonlab/vegetation`. |
| Debris Lab | `/debris-lab/` | Procedural debris and scatter pieces with preset thumbnails and GLB export from `@call-me-sensei/toonlab/debrisgen`. |
| Texture Lab | `/texture-lab/` | Seamless procedural PBR textures for anything — 60+ material presets, layered pattern/color/overlay controls, an AI prompt box (offline mapper built in; add your own Gemini/OpenAI key for smarter mapping), and PNG/ZIP export from `@call-me-sensei/toonlab/texgen`. |

The water scenes expose an **Env** lighting select (Noon / Sunset / Moonlit /
Overcast / Storm), water **Mode** and **Tone** selects, quality tiers, debug
views (`?waterDebug=foam`, `depth`, `ripple`, ...), and Drop Ball / Drop
Sinker buttons for buoyancy testing.

## URL params, persistence, and Reset Lab

Every URL parameter has a HUD control — the HUD writes the parameter back
into the URL, so any lab state is shareable as a deep link. Key params:

```text
?model=<path or URL>       character model (see below)
?toonPreset=default        toon preset
?toonDebug=band            toon debug view (docs/toon-shading.md)
?envPreset=interiorDay     environment preset
?envDebug=albedo           environment debug view (docs/environment.md)
?waterMode=ocean           water preset; ?waterTone=, ?waterQuality=, ?waterDebug=
?post=1&postPreset=softAnime  post-processing (docs/post-processing.md)
```

Lab state (selected model, presets, debug views) is saved per lab in
`localStorage` and restored when you return with a bare URL. An explicit URL
parameter always wins over a stored value. The **Reset Lab** button clears
the stored state for the current lab and reloads it clean.

## Loading your own models

Three ways, no code changes required (details in
[characters.md](characters.md)):

1. **Model URL input** — paste any local path or hosted URL into the HUD's
   Model URL field (or use `?model=`). Supported formats: GLB/glTF, VRM 0
   and 1, PMX/PMD, FBX, OBJ (+ `&mtl=`), and text-based USDZ. Hosted URLs
   must be served with CORS headers (`Access-Control-Allow-Origin`);
   failures show an error banner in the HUD instead of a blank scene.
2. **`assets-local/` drop-in folder** — a gitignored folder for private test
   assets. Drop a character in `assets-local/models/` and run
   `npm run assets:local`; it appears in every lab's Model select alongside
   the bundled mannequin. A model is picked up when its path matches one of
   these shapes (sibling textures/materials load automatically):

   ```
   assets-local/models/hero.glb                 # loose file
   assets-local/models/hero/hero.pmx            # folder named after the character
   assets-local/models/hero/model.vrm           # or a "model.*" main file
   assets-local/models/hero/source/hero.fbx     # packaged marketplace download
   assets-local/models/tests/<FORMAT>/<name>/…  # format test grid
   ```

   Nothing in `assets-local/` is ever committed or published. The discovery
   rules live in `labs/shared/localModelCatalog.js`.
3. **Bundled default** — the CC0 Quaternius mannequin
   (`public/characters/mannequin.glb`) with 45 embedded clips, so every lab
   works with zero downloads.

### Mixamo animation clips

Models without embedded locomotion clips are animated by retargeting Mixamo
FBX clips. Adobe's terms do not allow redistributing the clips, so download
them with your own Adobe account from [mixamo.com](https://www.mixamo.com)
and drop the FBX files into `assets-local/animations/` (e.g. `Idle.fbx`,
`Walking.fbx`, `Swimming.fbx`). Without them, models fall back to their own
embedded clips. See [ATTRIBUTION.md](../ATTRIBUTION.md) for the full
asset-licensing picture.

## Regenerating the settings reference

[settings-reference.md](settings-reference.md) is generated from the settings
schemas — never edit it by hand:

```bash
node scripts/generate-settings-reference.mjs
```

The script starts its own dev server on port 5192, extracts every settings
schema through a headless browser, and writes the markdown. Set
`TOONLAB_DOCS_BASE_URL=http://localhost:5175` to reuse a dev server that is
already running.

## Next steps

- [Toon character shading](toon-shading.md)
- [Environment shading](environment.md)
- [Water](water.md)
- [Vegetation and sky](vegetation-sky.md)
- [Post-processing](post-processing.md)
- [Characters and animation](characters.md)
- [Debug panel](debug-panel.md)
