# Launch-world filler register

**Purpose.** Track every capability implemented *outside* ToonLab to reach benchmark scene
quality, so each one is later merged **into** ToonLab and then removed from the scene.

> **Developer direction (2026-08-15):** *"You can even go ahead and fill the gap, but note
> it down that these should be merged into ToonLab after this and then we can test by
> removing the filler and we still have the exact looking scene."*

> **Developer framing (2026-08-15):** *"Debts will become features and enhancements."*

This is a **product pipeline, not a debt ledger**. Nothing in it is permanent, and nothing
in it is an apology. Every entry is a ToonLab feature that happens to be living in the wrong
place for now — the launch world is where they get proven against a real benchmark scene
before they become part of the package.

Write each entry accordingly: describe the capability as a **feature a ToonLab user would
want**, not merely as a thing that unblocked our scene. The `Public API shape` field is the
feature's eventual interface, so design it for the general case, not for this world.

Companion documents:
- `deficiencies-0.4.19.md` — what ToonLab gets *wrong* (fix in place).
- This file — what ToonLab does not *have* (fill now, merge later).

---

## The filler contract

Any scene-local implementation that substitutes for, extends, or precedes a ToonLab system
**must** be registered here before it is considered done. An unregistered filler is a defect.

Each entry records:

| Field | Meaning |
| --- | --- |
| **ID** | `FILL-nnn`, stable |
| **Capability** | What it does, in one line |
| **Lives in** | Current scene-local path |
| **Target** | The ToonLab system/slot it must merge into (`src/...`) |
| **Why not ToonLab today** | The gap — cross-reference a `D19-nnn` deficiency where one exists |
| **Public API shape** | The signature it should have once merged, so the merge is a move, not a redesign |
| **Equivalence test** | How we prove removal is safe (below) |
| **Status** | `filler` → `merged` → `removed` |

### The equivalence test — the whole point

Filler is only acceptable because its removal is *provable*. For every entry:

1. **Before merge:** capture the hero frames listed in §12 Gate 3 (front/hero, three-quarter,
   side/depth, character close-up, environment close-up, neutral, ToonLab, 50/50 wipe) at
   3840×2160, with the filler active. Store under
   `launch-plan/review/captures/equivalence/<FILL-id>/before/`.
2. **Merge** the capability into ToonLab behind the same public API shape.
3. **Remove** the filler from the scene and re-capture the identical frames — same camera
   matrices, same animation time, same lighting transforms, same exposure, same seed.
4. **Compare.** The scene must look the same. Pass condition: **perceptual diff ≤ 1% of
   pixels above a just-noticeable threshold**, with zero structural differences (no moved
   geometry, no changed silhouettes, no lost density). Any regression fails the merge, not
   the test.
5. Record the diff figure and both captures in the entry. Only then does status become
   `removed`.

Determinism is a precondition — seeded placement, fixed animation time, no per-load
regeneration. A filler whose output is not reproducible cannot be equivalence-tested and
must be made deterministic first.

### Rules that still bind

- **Never** a scene-local duplicate of something ToonLab *already does*. That is not filler,
  it is a fork — fix the ToonLab system instead and log it in `deficiencies-0.4.19.md`.
- **Never** a replacement renderer, and never a generic Three.js stand-in for a system
  ToonLab owns (grass, water, sky, cloud, rock, tree, ground, terrain, toon, post).
- Filler is for capabilities ToonLab genuinely **lacks** — or for quality that ToonLab's
  current implementation cannot yet reach — not for convenience.
- Write filler at production quality with the API shape it will have after the merge.
  Throwaway code makes the merge a rewrite and the equivalence test a fiction.

---

## Register

| ID | Capability | Target | Deficiency | Status |
| --- | --- | --- | --- | --- |
| FILL-001 | §11 shot rig (real focal lengths, per-shot render policy, footprint solver) + the launch-world binding for the single-load A/B | `src/camera/`, `src/renderer/` | D19-001 | `filler` |
| FILL-002 | Neutral (un-stylized standard PBR) counterpart for every style slot | per-domain settings modules | D19-002 | `merged` |
| FILL-003 | Terrain height-field authoring: shoreline curve, walkable profile, bluffs, slope query | `src/runtime/sceneSurfaceRuntime.js` | D19-003 | `filler` |
| FILL-005 | Semantic material-role masks (lawn / promenade / cliff / sand) → RGBA splat + scatter predicates | `src/ground-shader/` | D19-022 | `filler` |
| FILL-011 | World-scaled tiling-material binding — declare a texture recipe's world tile size, bind it to a surface at that scale, and report achieved texel density | `src/texgen/`, `src/environment/` | D19-052 | `filler` |
| FILL-012 | Per-layer PBR ground layers — normal + roughness (+ metalness/AO) per splat channel, so terrain can carry relief and a wet/dry response | `src/ground-shader/` | D19-058 | `recorded` |
| FILL-013 | Shoreline-relative instance placement — author scatter and hand placement in a curve-relative frame (distance along / inland from a spine) instead of world XZ | `src/vegetation/scatter.js` | D19-066 | `filler` |
| FILL-YUA-01 | Per-foot ground contact for a character — footprint, sole height and clearance per foot from the live skeleton | `src/character/groundStabilizer.js` | D19-084 | `filler` |
| FILL-008 | Catalog rock surface completion — detail-map resolution and scale-tuned projection for the §6.3 cliff set | `src/catalog/officialCatalogRockSurfaces.js` | D19-010, D19-031, D19-033 | `filler` |
| FILL-006 | Deterministic figure population — N original animated figures from one humanoid source, with grounding and contact shadows | new `src/crowd/` | D19-100, D19-101, D19-102 | `paused` |

---

### FILL-001 · §11 shot rig and single-load A/B binding

| Field | Value |
| --- | --- |
| **ID** | FILL-001 |
| **Capability** | Two halves. (a) A **shot rig** that takes a real photographic focal length rather than a field of view, re-derives the fov whenever the aspect changes, reports the render policy a shot imposes (motion blur off and exposure held during an A/B), and can answer whether a shot's required camera distance actually exists inside the scene. (b) The **binding** that lets a scene contribute subjects to a comparison without owning any comparison code. |
| **Lives in** | `labs/launch-world/wipe/shots.js` (rig, §11 shot table, `solveDistanceForSubjectBand`, `assertShotFitsFootprint`), `labs/launch-world/wipe/index.js` (`createLaunchStyleWipe`, `mountWipeDivider`), `labs/launch-world/wipe/groundSubject.js` (the worked non-character subject) |
| **Target** | `src/camera/` beside `cameraRig.js` for the rig; the comparison primitive it drives already landed in `src/renderer/styleComparison.js` |
| **Why not ToonLab today** | **D19-001** is FIXED in the package — `createStyleComparison` and `verifyStyleComparisonIdentity` ship in `src/renderer/`. What stays here is genuinely scene-shaped: the §11 shot table, the DOM divider, and the subject list. But the *rig* is not scene-shaped and should move: ToonLab has no way to say "give me a 50 mm" — `cameraSettings.js` takes an fov, so every consumer converts by hand, gets the film gauge wrong, and silently changes lens on resize. Nor can any consumer ask whether a shot fits its scene, which is the question a small scene makes unavoidable (D19-063). |
| **Public API shape** | `createShotRig({ camera, post, filmGaugeMm = 36 })` → `{ setShot, setAspect, describe, policy, lensMm }`, where a shot is `{ ab, lensMm, motion, id }`.<br>`verticalFovForLens(lensMm, aspect, { filmGaugeMm })` → degrees.<br>`solveDistanceForSubjectBand(metres, verticalFovDeg)` → metres.<br>`assertShotFitsFootprint(shot, bandMetres, aspect, { footprint })` → `{ distance, fits, limit, note }`.<br>`createStyleComparisonMount({ camera, renderer, scene, subjects, sceneState })` → the binding, where a subject is `{ id, root, applyStyle, mixer? }` and `applyStyle` installs a **pre-built** styled material rather than mutating the neutral one. |
| **Equivalence test** | Deterministic by construction: the shot table is constants, the lens solve is closed-form, the ground subject's height field, splat and layer textures are pure functions of position with fixed seeds, and the comparison never advances a clock. `node scripts/verify-style-comparison.mjs` captures S02 and S07 at splits 0/25/50/75/100 into `launch-plan/review/captures/wipe/` and runs the eleven-assertion pixel proof. After the merge, re-run with the scene-local rig deleted; the captures must be bit-identical (not merely within 1%), because both paths must resolve to the same focal length, the same solved distance and the same snapped split — any drift means the lens moved. |
| **Status** | `filler` |
| **Notes** | `assertShotFitsFootprint` already earns its place: it proves S07's locked 50 mm **cannot** frame a 12 m band inside Stillwater Garden (29.6 m required, 28.3 m available), (D19-110) which is why S07 is framed at an 8 m band instead of the lens being quietly widened. Widening S07 would break its pairing with S02, and the two wipes sharing a lens is the point. |

### FILL-002 · Neutral counterpart for every style slot

| Field | Value |
| --- | --- |
| **ID** | FILL-002 |
| **Capability** | Every ToonLab style slot gains a `neutral` counterpart: an un-stylized **standard PBR** rendition of the same assets, at the same tiling, with the same masks and the same geometry — the honest "before" half of any comparison, and a baseline a user can A/B their own scene against. |
| **Lives in** | **Nowhere scene-local — this merged straight into the package**: `src/styles/neutralStylePresets.js`, exported from `src/styles/index.js`. Registered here rather than in a lab because a neutral preset is worthless unless it resolves through each domain's own registry, which only the package can do. |
| **Target** | Already there. Remaining work is upstream in two domains, not here (see Notes). |
| **Why not ToonLab today** | **D19-002.** Only `rock` shipped a `neutral` preset, so nine domains had nothing to compare against and any whole-scene "here is what ToonLab does" claim was unfalsifiable. |
| **Public API shape** | `createXSettings({ preset: 'neutral' })` for every domain, through the registrar each already had — no new call shape to learn.<br>`NEUTRAL_STYLE_BUNDLE` — the counterpart of `CALL_ME_SENSEI_STYLE_BUNDLE`, generated from the same slot list.<br>`describeNeutralStyleCoverage()` → `[{ slot, coverage, abSafe, inBundle, note }]` so a gap is visible instead of implied.<br>`auditNeutralStyleShadingOnly()` → `{ ok, issues, warnings, domains }`. |
| **Equivalence test** | Two parts, both mechanical. **(1) Shading-only invariant:** `auditNeutralStyleShadingOnly()` resolves each domain twice with an identical synthetic host recipe and asserts every geometry / mask / tiling / motion key is equal; `issues` must be empty. It already caught a real defect — the first draft's neutral grass resolved `bladesPerClump` to 1 instead of 40, so the neutral half would have grown different grass. **(2) Symmetry:** `NEUTRAL_STYLE_BUNDLE` and `CALL_ME_SENSEI_STYLE_BUNDLE` are generated from the same slot list, so a slot cannot be added to one and forgotten in the other. Visual sign-off is deliberately **deferred**: D19-062 makes everything built through `installToonLabSurfaceLighting` render flat navy in a styled scene, so judging a neutral preset by eye today would be judging that bug. |
| **Status** | `merged` |
| **Notes** | Two slots are deliberately unpaired and `describeNeutralStyleCoverage()` says so: **`lighting`**, because a lighting style owns sun intensity and the day cycle and would therefore change *light transforms*, which §11 requires both halves to share; and **`post`**, because post runs over the composited frame and cannot differ per half. `cloud` resolves to schema defaults for every style including neutral (D19-006) — which *are* the un-stylized cloud — and is recorded as `inherited`, not as authored. Sky `cloudSeed` is pinned to the styled value on purpose: two halves drawing differently shaped clouds is a scene comparison, not a shader comparison. |

### FILL-011 · World-scaled tiling material binding

> Filed 2026-08-15 by the §9 texture workstream. Originally numbered FILL-008/009; five
> workstreams edited this register concurrently and those IDs were taken, so these two
> entries are FILL-011/012. Related deficiencies renumbered to D19-050…060 for the same
> reason.

| Field | Value |
| --- | --- |
| **ID** | FILL-011 |
| **Capability** | Give a ToonLab texture recipe a declared **world-space tile size** in metres, bind it to any surface at exactly that scale, and report the achieved texel density (px/cm) so a scene can assert its own §8 compliance. |
| **Lives in** | `toonlab/scripts/launch-world-material-set.mjs` (the `tile` field, `texelDensity()`, and the per-material role table), `toonlab/scripts/bake-launch-world-materials.mjs` (density + seam + macro-contrast report, and the semantic-role gate), `toonlab/quality/launch-world-materials/proof.js` (`worldScaleUv`) |
| **Target** | `src/texgen/textureSettings.js` (a `worldTile` field on the recipe document) and `src/environment/environmentMaterialAdapter.js` (honour it when binding maps to a surface) |
| **Why not ToonLab today** | D19-052. A recipe carries its source resolution but not its intended tile size, and §8's bar is `resolution / (tile x 100)` px/cm. The same 4K map is 20.48 px/cm at a 2 m tile and 5.12 px/cm at 8 m, so a recipe alone cannot state whether it meets the bar. Every consumer re-derives `texture.repeat = span / tile` by hand from a sidecar, and nothing checks it. This is the mechanism D-003 depends on: tiling trim-sheets are the only construction that reaches the hero bar on architecture, and tiling scale is the whole reason they work. |
| **Public API shape** | `createTextureRecipeDocument(settings, { name, worldTile: 2.0 })` — metres, optional, defaults to null.<br>`applyEnvironmentShader(root, { textureSets: { [materialId]: { maps, worldTile } } })` — sets `repeat` from measured surface extents in world space, per material slot, honouring non-uniform scale.<br>`reportTextureDensity(root)` → `[{ materialId, worldTile, sourceResolution, pxPerCm, bar, passes }]` so a scene, a lab, or a CI gate can assert §8 rather than trust a table. |
| **Equivalence test** | Deterministic by construction: tile sizes are constants in a checked-in table, bakes are seeded and pure-CPU, the proof camera is fixed per material. Before merge, capture the §12 Gate 3 frames at 3840x2160 with the filler active into `launch-plan/review/captures/equivalence/FILL-011/before/`. After the merge, remove the sidecar table, declare `worldTile` on each recipe, re-capture. Because both paths must resolve to the **same** `texture.repeat` values, the pass condition is stricter than the register default: the frames must be **bit-identical**, not merely within 1% perceptual diff. Any drift means the adapter derived a different repeat and the density claim moved. |
| **Status** | `filler` — **active, retargeted** to Stillwater Garden 2026-08-15 by the §9 texture workstream. Not paused: the garden set is built on this mechanism and exercises it harder than the city did (0.25 m to 1.6 m tiles, 20.48 to 91.02 px/cm). |
>
> **Retargeted 2026-08-15 - Stillwater Garden.** The capability is unchanged and the
> evidence is now stronger, not weaker. The garden is read from 1.4-3.5 m with no distant
> band at all, so every tile size in the set moved down: 0.25 m (tatami border) to 1.6 m
> (paving and pond bed), against 1.0-3.0 m for the cancelled city. The set now spans
> **20.48 to 91.02 px/cm** at declared tile sizes, which is 2.0x to 8.9x the hero bar - and
> the whole spread comes from the tile column, not from resolution. That is the argument
> for FILL-011 in one table: the identical 4096 map is 91.02 px/cm at a 0.45 m tile and
> 25.60 px/cm at 1.6 m, and a recipe still cannot say which one it is.
>
> It also makes the close-camera trap concrete. The `call_me_sensei` ground preset's
> projection scales are landscape-scale and read as a boulder field under a garden camera.
> A recipe carrying `worldTile` would let a scene detect that mismatch instead of
> discovering it in a capture.

### FILL-012 · Per-layer PBR ground layers

| Field | Value |
| --- | --- |
| **ID** | FILL-012 |
| **Capability** | Let a ground splat layer carry a full material, not just a base-colour texture: normal and roughness at minimum, metalness and AO where the layer needs them. A beach then reads wet where the water says it is wet, a gravel verge holds its relief at grazing sun, and a terrain layer stops being flatter than everything standing on it. |
| **Lives in** | Nowhere yet — **not built**. Recorded so the terrain/ground owner registers against a plan rather than inventing one. The §9 material set works around it by routing all ten materials through Manufactured Surface (`styleDomain` in `assets-local/launch-world/materials/material-set.json`), with `terrainDomainBlocked: "D19-058"` on MAT-COAST-02. |
| **Target** | `src/ground-shader/groundShaderMaterial.js` (`createConvertedGroundMaterial`, `GROUND_SOURCE_TEXTURE_KEYS`) |
| **Why not ToonLab today** | D19-058. The ground shader throws on `normalMap`, `roughnessMap`, `metalnessMap` and `aoMap` and keeps only `map`. MAT-COAST-02's dry/compacted/wet states are identical in albedo structure and differ in **roughness** (0.92 / 0.86 / 0.28) — that is the wet-sand read §6.4 drives from swash and wet-sand memory, and the ground shader deletes it. |
| **Public API shape** | `createGroundShaderMaterial({ layers: [{ texture, normalMap, roughnessMap, metalnessMap, aoMap, worldTile }] })` — per-layer maps sampled with the layer's own world tiling and blended by the same splat weight as its albedo, so a layer is a material rather than a colour. Consumers passing only `texture` keep today's behaviour exactly. |
| **Equivalence test** | Deterministic: fixed seeds, fixed camera, fixed water state. Capture the §12 Gate 3 coastal frames with the beach on Manufactured Surface (the current routing), then re-capture with the beach on `terrain.ground` carrying the same maps through the merged API. Additionally capture the waterline at three swash phases so the dry → compacted → wet transition is compared, not just a static frame. Pass condition per the register default: perceptual diff ≤ 1% of pixels, zero structural differences, and the measured wet-band roughness response must match between paths. |
| **Status** | `recorded` (not yet filler — nothing has been built) |
>
> **Retargeted 2026-08-15 - Stillwater Garden.** MAT-COAST-02's wet-sand roughness is no
> longer the motivating case, and the case that replaced it is broader. The garden brief
> (2) puts **four genuinely distinct ground surfaces in one frame** - raked gravel, moss,
> stone paving, packed earth - plus a pond margin read through water. All are hero
> close-camera surfaces whose quality lives in relief: 9 mm gravel grains, 36 mm moss
> cushions, a real joint groove between paving stones, 13 cm submerged stones. Routed
> through the shipped Ground Shader all of them collapse to flat albedo, and the garden's
> most-looked-at surfaces become its flattest. All five now carry
> `terrainDomainBlocked: "D19-058"` in `material-set.json` and route through Manufactured
> Surface instead. The API shape below is unchanged and is exactly what a four-surface
> garden ground needs.

**Note on FILL-005 from the §9 texture workstream (D19-022, 4 fixed splat channels).**
This set needs one role the ground splat cannot name: MAT-CITY-03 sidewalk/plaza stone is
a *promenade* surface and has to ride the **`dirt` (G)** channel, which reads misleadingly
against its semantic intent. MAT-CITY-04 roadway has no channel at all. MAT-COAST-02 sand
maps honestly onto **`sand` (A)**. Recorded against FILL-005 rather than built — the splat
masks are the terrain/ground workstream's to author, and the material set only declares
the intent (`groundSplat` in `material-set.json`).

### FILL-008 · Catalog rock surface completion

| Field | Value |
| --- | --- |
| **Capability** | Gives a published catalog rock a complete, believable surface: binds the detail normal the artifact omits, sets a projection period appropriate to the asset's own size, and applies deterministic per-asset moss so several rocks of one family do not read as one rock repeated. |
| **Lives in** | `labs/rock-gate1/rockSet.js` |
| **Target** | `src/catalog/officialCatalogRockSurfaces.js` |
| **Why not ToonLab today** | Most of this pass landed *in* the package rather than here — `createCatalogRockSurface`, the degenerate-map guard (`src/rock-shader/rockTextureIntegrity.js`) and the `variation` texture-set seed are all shipped. What stays scene-local is only what the package genuinely cannot own yet: **texture content**, because ToonLab ships no rock normal maps at all (**D19-010**), and two **tuned constants** that exist purely to compensate for package defects — `FORMATION_PROJECTION_SCALE` because the shader is not asset-scale aware (**D19-031**), and `FORMATION_NORMAL_FLATTEN` because the shipped normals are full-amplitude (**D19-033**). Fix those three and this file collapses to a list of rock ids. |
| **Public API shape** | Already merged and stable: `createCatalogRockSurface({ geology, variation, moss, mossCoverage, paletteAnchor, harmonize, tint }) -> { settings, requiredTextures, geology, variation }`. The remaining move is for `requiredTextures` to resolve against package-shipped maps instead of an application URL table, and for `projection.scale` / `normals` to stop needing an override. Consumers call `applyRockShader(root, settings, { textures, variation })` either way, so the merge is a deletion here, not a redesign. |
| **Equivalence test** | `node scripts/capture-rock-gate1.mjs` renders 20 deterministic frames — fixed camera, fixed light, fixed variation indices, LOD0 pinned, no per-load regeneration — into `launch-plan/review/captures/rocks/`. Baseline captured 2026-08-15 with the filler active. After the merge, re-run with the scene-local constants and URL table removed; frames must match within the <=1% perceptual-diff threshold, with `ROCK-COAST-01-rock-0119-detail-85mm.png` as the governing close-up because it is the frame the tuned constants were set against. |
| **Status** | `filler` — **paused**, city scene cancelled 2026-08-15. Not withdrawn: it describes a real ToonLab gap any future town/village-scale demo hits again. Handover: `launch-plan/review/city-scene-standdown.md`. |
| **Notes** | `variation` is a fixed per-asset index recorded in `AZURE_HEADLAND_ROCKS` and must not be renumbered — every moss parameter derives from it through an integer hash, so renumbering silently rewrites the surfaces and invalidates the baseline. The tint harmonization (D-010) is a developer ruling, not a defect workaround, and stays after the merge as a `paletteAnchor` argument. |

### FILL-013 · Curve-relative instance placement

| Field | Value |
| --- | --- |
| **ID** | FILL-013 |
| **Capability** | Place instances in a frame defined by an authored curve rather than by world axes: `(alongX, inland)` against a shoreline, a path, a wall or a pond margin, resolved to world XZ at build time. A ridge line authored this way stays parallel to the coast for its whole length; the same list authored in world z crosses the beach at one end and sits behind the camera at the other. |
| **Lives in** | `labs/launch-world/coast/props.js` (`RIDGE_LINE`, `GROVE_CLUSTER`, `boulderPlacements`, all resolved through `shoreZ(x) + inland`) |
| **Target** | `src/vegetation/scatter.js` — beside `scatterInRect` |
| **Why not ToonLab today** | **D19-066.** `scatterInRect` takes an axis-aligned rectangle and a boolean mask. Every natural scene boundary — a shoreline, a path, a pond edge, a wall — is a curve, and the mask can only *reject* placements outside it, never *distribute* along it. The observable cost: a hand-authored 16-instance tree ridge placed at constant world z drifted from 0 m to 60 m of separation from the shoreline across the world, and the correction was mechanical once the frame was right. |
| **Public API shape** | `createCurveFrame({ spine: (t) => ({ x, z }), domain: [min, max] })` → `{ toWorld({ along, offset }), fromWorld(x, z), scatterAlong({ count, offsetRange, spacing, seed, mask, heightAt }) }` — so both hand placement and seeded scatter share one frame, and a scene's spine function is authored once. |
| **Equivalence test** | Deterministic: the spine is a pure analytic function and the scatter is seeded. Assert the merged `toWorld` returns bit-identical coordinates for the checked-in `RIDGE_LINE` / `GROVE_CLUSTER` tables, which makes the placement identical and the pixel diff 0%. Before/after captures are the hero and wide shots. |
| **Status** | `filler` |
| **Notes** | Transfers directly to Stillwater Garden (doc 20): the pond margin, the stone path and the boundary wall are all spines, and stepping stones and pond-edge planting are exactly `scatterAlong` cases. |

### FILL-009 · Original non-textual graphic-mark authoring with a measured colour budget

| Field | Value |
| --- | --- |
| **ID** | FILL-009 |
| **Capability** | Author a family of **original graphic marks** — signs, fabric bands, safety plates, decals — entirely from ToonLab's own procedural generators, with **no readable text in any language**, and prove two things about the result rather than asserting them: that each entry meets §8's texel-density bar at a declared world tile size, and that the family stays inside the scene's **colour budget**. The second half is the novel part. A scene has a finite amount of saturation it can spend before the accent stops reading as accent (§10 gives it as 5%); today nothing in ToonLab can express that as a constraint, so it is enforced by taste and discovered in a review. This makes it a number an entry declares up front and a bake measures and gates on. |
| **Lives in** | `toonlab/scripts/launch-world-signage-set.mjs` (18 entries: the `accentBudget`, `panel`, `mapping` and `mark` fields, the fixed palette, and the shared canvas/printed/enamel surface responses)<br>`toonlab/scripts/bake-launch-world-signage.mjs` (`saturationProfile()` accent-fraction metric, the density/accent/emissive gates, contact sheet)<br>`toonlab/assets-local/launch-world/signage/signage-set.json` (the measured manifest) |
| **Target** | `src/texgen/` — a `graphicMark` authoring layer over the existing generators, plus a `colorBudget` field on the recipe document and an accent-fraction readout beside the existing map evaluation. The mark composition itself needs **no new generators**: `dots` at 1x1 is a disc, at 1x1 with a wide bevel a concentric ring, `hex` at columns 1 a hexagon, `grid` at 1x1 a framed plate, `scales` at rows 1 a scalloped lappet band, `chevron` a diagonal or zigzag device. That vocabulary is already shipped and was simply undiscovered. |
| **Why not ToonLab today** | Three gaps, in descending order of cost. **(1) D19-080** — accent overlays cannot target a specific pattern cell, so "fill exactly one hex / one panel / one bar" is unexpressible; this broke 6 of 18 entries and is the single blocker for composed multi-colour marks. **(2)** No recipe field expresses a colour budget, so nothing can state or check how much saturation an asset is allowed to spend. **(3) D19-052 / FILL-011** — a recipe still cannot declare its world tile size, which this set works around the same way the §9 set does, with a sidecar table. |
| **Public API shape** | `createTextureRecipeDocument(settings, { name, worldTile, colorBudget: { threshold: 0.55, maxFraction: 0.12 } })`<br>`evaluateTextureMaps(settings, { size, measure: ['accentFraction', 'meanSaturation', 'lumaRange'] })` → maps plus a `metrics` block, so a lab, a scene or a CI gate can assert a colour policy instead of eyeballing it.<br>`accentA.target = { cell: 'one', selector: 'hash' \| 'index', index: 2 }` — the D19-080 fix, letting an overlay claim a named module of the base pattern rather than thresholding a mask across all of them. |
| **Equivalence test** | Deterministic by construction: seeded, pure-CPU, DOM-free bakes from a constant entry table. Assert the merged path produces **byte-identical albedo/normal/roughness/metalness/ao/orm/height** for all 18 checked-in recipes, and that the reported `accentFraction` matches `signage-set.json` to 4 decimal places. Byte-identical maps ⇒ 0% pixel diff, so the visual pass condition is trivially met and the real test is the metric agreeing. Contact sheet: `launch-plan/review/captures/signage/contact-sheet.png`. |
| **Status** | `filler` — **paused**, city and coastal scenes both cancelled 2026-08-15 (Stillwater Garden, doc 20, has essentially no signage). Not withdrawn: the capability is scene-independent, and §8's blank-panel contradiction returns in full the moment any populated scene does. Handover: `launch-plan/review/signage-standdown.md`. |
| **Notes** | The reusable finding is narrower and more useful than "we made signs": **marks built from the base + detail ramp came out clean; marks that depended on an accent overlay to place a colour came out wrong.** All 6 accent-dependent entries failed and all 6 ramp-only entries passed. That is a design rule for the merged API — the ramp is the mark, and overlays should be reserved for weathering, not composition, until D19-080 is fixed. Also worth carrying: the no-readable-text constraint cost nothing. Safety flags, roundels, hazard triangles, dot-row bay markers and hazard banding are all language-free in reality, so originality and legibility were never actually in tension. |

### FILL-006 · Deterministic figure population

> **Status note, 2026-08-15.** Registered `paused`, not `withdrawn`. The workstream was
> cancelled mid-build when the launch scene changed from Azure Headland to Stillwater
> Garden (doc 20) and the figure requirement dropped from 6–10 to 0–2 — a scope change
> upstream of the capability, not a verdict on it. Everything is on disk and working;
> the Gate 4 cost is measured. See `launch-plan/review/figures-standdown.md`.

| Field | Value |
| --- | --- |
| **ID** | FILL-006 |
| **Capability** | Load ONE humanoid asset and get N original, individually-designed, animated, ground-contacted figures out of it. Figures borrow the source skeleton, so the source's clips play with **zero retargeting**; each figure's visible geometry is authored procedurally from a design library (proportions, garment volumes, hair mass, carried items) and coloured from a shared palette strip, so silhouette and colourway vary per figure without varying the rig. Includes seeded placement, patrol paths, per-figure clip phase, terrain grounding and a single-draw-call contact-shadow layer. |
| **Lives in** | `labs/launch-world/crowd/` — `figureParts.js` (skinned parts collector + bind-pose rig view + palette), `figureLibrary.js` (11 original designs + activity→clip table), `crowdRuntime.js` (the runtime), `placements.js` (placement documents), `index.js` (barrel). Review lab at `labs/launch-world/crowd/index.html`, capture at `scripts/capture-crowd-figures.mjs`. |
| **Target** | A new `src/crowd/` beside `src/character/`. `figureParts.js`'s collector belongs beside `src/propgen/propParts.js` (it is the skinned sibling of `PartsBuilder`); the bind-pose rig view belongs in `src/character/characterRig.js`. |
| **Why not ToonLab today** | No crowd, NPC, pedestrian or multi-figure system exists anywhere in `src/`. `createCharacterRuntime` is fully re-entrant but is a **hero** runtime: it loads one asset, converts it, resolves a rig, retargets locomotion and owns a mixer, at roughly a second per instance — the wrong unit of cost for a figure that occupies 40 px. The specific missing pieces are (a) **skeleton sharing** — nothing lets N meshes ride one source rig so clips bind without retargeting (**D19-100**); (b) **no distance-gated outline control**, so every background figure pays the hero outline pass (**D19-101**); (c) **no ground contact shadow for non-hero objects** when the sun cascade is off (D19-041), which is what makes a figure read as floating. |
| **Public API shape** | `createCrowdPopulation({ parent, renderer, placements, heightAt, normalAt, seed, sourceUrl, toon, contactShadow, onProgress }) -> { root, figures, census, timings, rig, palette, update(delta), setAnimationTime(seconds), setVisible(bool), dispose() }`.<br>A **placement** is data, never code: `{ figure, at: [x, z], yaw?, activity?, path?, speed?, phase?, colors?, scale? }`.<br>A **design** is `{ id, label, height, mass, shoulder, activity[], slots, build(parts, rig, resolveColour) }`, where `build` authors in model space at the bind pose and the collector solves skin weights.<br>`census` reports `{ figures, archetypes, colourways, materials, triangles, sourceLoads, retargets }` so a scene or a CI gate can assert its own §13 variety and its own Gate 4 budget rather than trust a table. |
| **Equivalence test** | Deterministic by construction — one integer seed drives placement, colourway rotation, activity choice and clip phase through `mulberry32`; no `Math.random`, no clock, no per-load regeneration. `node scripts/capture-crowd-figures.mjs` renders five fixed review frames plus an 8-row Gate 4 sweep into `launch-plan/review/captures/figures/`. Baseline captured 2026-08-15 with the filler active. After the merge, re-run with the scene-local module deleted and the package API in its place; frames must match within the register's ≤1% perceptual-diff threshold, with `lineup-11-archetypes.png` as the governing frame because it is the one the §13 repetition criterion is graded against. |
| **Status** | `paused` — built, working, measured, not mounted in any shipping scene. |
| **Notes** | The source humanoid is ToonLab's own shipped CC0 mannequin (`toonlab.character.mannequin.v1`, Quaternius Universal Animation Library, 46 clips). **None of its geometry ever enters the scene** — the runtime deletes every skinned mesh from the clone and keeps only the armature and the clip library, so the visible figure is entirely original ToonLab geometry. Zero 3D-generation credits were spent. |

### FILL-003 · Terrain height-field authoring

| Field | Value |
| --- | --- |
| **Capability** | Authors a coastal height field as a pure `heightAt(x, z)`: an asymmetric shoreline curve, a beach-berm-to-ridge land profile with guaranteed-walkable gradients, an equilibrium nearshore bed, fading dune relief, swash-line micro-relief, and two headland bluffs shaped to cross the Ground Shader's automatic rock threshold. Also exposes `slopeAt` and `inland`. |
| **Lives in** | `labs/launch-world/coast/terrain.js` |
| **Target** | `src/runtime/sceneSurfaceRuntime.js` (or a new `src/terrain/` beside it) |
| **Why not ToonLab today** | **D19-003.** `createStylizedTerrain` and `src/landscape/**` are unreachable from the package, and `createSceneSurfaceRuntime` takes a `heightAt` it does not help you write. There is no shipped way to author a shoreline, guarantee a walkable gradient, or query slope. The contracts file (§4.2) names host-authored `heightAt` as the only working route. |
| **Public API shape** | `createCoastalHeightField({ bounds, waterLevel, shoreline: { curve, ripple }, land: { bermSlope, ridgeCurvature, detail }, bed: { nearshoreSlope, curvature, maxDepth }, bluffs: [{ centreX, halfWidth, height, faceDepth }] })` → `{ heightAt, slopeAt, inland, shoreZ, buildGeometry, maxWalkableSlope }` |
| **Equivalence test** | Deterministic by construction: pure analytic functions, no RNG, no per-load regeneration — `heightAt(x, z)` is bit-identical run to run. Before/after captures are the five `coast-pass1*` shots. Pass condition is stricter than the general rule: the merged implementation must return **exactly** the same heights (assert `heightAt` over a 1 m lattice across the bounds, max abs delta 0), which makes the pixel diff trivially 0%. |
| **Status** | `filler` — **paused**, city scene cancelled 2026-08-15. Not withdrawn: it describes a real ToonLab gap any future town/village-scale demo hits again. Handover: `launch-plan/review/city-scene-standdown.md`. |
| **Notes** | Authored heights land within 0.2 m of every §10.2 mark: Yua `(4, 2.2, 18)` measures 2.34 m; ARCH-COAST-01 `(-20, 1.0, 8)` measures 0.90 m; ARCH-COAST-02 `(26, 0.8, -4)` measures 0.86 m. Shoreline arc length over x = -50..50 measures ≈110 m per §10.2. |

### FILL-005 · Semantic material-role masks

| Field | Value |
| --- | --- |
| **Capability** | One authoritative role definition — `roleWeights(x, z) -> { lawn, promenade, cliff, sand }` — consumed twice: baked into the Ground Shader's RGBA splat brick, and evaluated as boolean predicates for grass/prop scatter. Includes slope-driven cliff derivation, role-suppression rules (sand is suppressed under cliff, promenade under cliff), and a shared `edgeWiggle` so painted boundaries and scattered boundaries wander identically instead of tracing analytic contours. |
| **Lives in** | `labs/launch-world/coast/terrain.js` (`roleWeights`, `buildGroundField`, `grassMask`, `plantableMask`, `edgeWiggle`) |
| **Target** | `src/ground-shader/` — a role-authoring module beside `groundShaderMaterial.js` |
| **Why not ToonLab today** | **D19-022.** The splat has four fixed channels (grass/dirt/rock/sand). There is no notion of a *semantic* role, no shipped way to bake roles into a splat, and — the part that actually costs quality — nothing keeps the painted mask and the scatter mask in agreement, so grass grows on painted pavement unless the host writes both by hand from the same source. Without the suppression rules, a bluff normalises to 50/50 sand+rock and cliffs render as tan dunes (observed and fixed in this pass). |
| **Public API shape** | `createMaterialRoles({ roles: { lawn, promenade, cliff, sand }, channels: { grass: 'lawn', dirt: 'promenade', rock: 'cliff', sand: 'sand' }, suppress: [['cliff','sand',0.92], ['cliff','promenade',1]], edgeNoise: { amplitude, wavelengths } })` → `{ bakeSplat({ bounds, width, depth }), maskFor(role, { threshold }), weightsAt(x, z) }` |
| **Equivalence test** | Deterministic: analytic weights, no RNG. Assert the baked `Uint8Array` is byte-identical to the filler's output at 512×384, and that `maskFor('lawn')` agrees with `grassMask` at every scatter placement seed (4211 / 7331). Byte-identical splat + identical placements ⇒ 0% pixel diff. Before/after captures: the five `coast-pass1*` shots. |
| **Status** | `filler` — **paused**, city scene cancelled 2026-08-15. Not withdrawn: it describes a real ToonLab gap any future town/village-scale demo hits again. Handover: `launch-plan/review/city-scene-standdown.md`. |
| **Notes** | Still constrained to four channels — this filler makes the *authoring* first-class, not the channel count. Lifting the 4-channel limit is a separate, larger change and the reason the promenade currently renders as bare earth rather than sunlit concrete (§10.2). |

---

## Anticipated entries

Recorded in advance from known gaps, so owners register against a plan rather than
inventing IDs. These become real entries when actually built.

| ID | Likely capability | Target | Related |
| --- | --- | --- | --- |
| FILL-003 | Terrain height-field authoring + walkable-slope generation | `src/runtime/sceneSurfaceRuntime.js` | D19-003 |
| FILL-004 | Call Me Sensei cloud styling actually carried through the bundle | `src/styles/styleBundle.js` | D19-006 |
| FILL-005 | Semantic material-role masks beyond the 4 fixed splat channels | `src/ground-shader/` | D19-022 |
| FILL-006 | Crowd / distant-figure population for scene density | new subsystem — see art-direction analysis | — |
| FILL-007 | Manufactured-surface application of §9 tiling materials to generated architecture by semantic role | `src/environment/`, `src/texgen/` | D-003 |
| FILL-009 | *Promoted to a real entry above — the graphic-mark authoring half is built. The remaining anticipated half is the **fixing-point** side: attaching sign, banner and fascia panels to generated architecture at correct heights and offsets* | `src/buildinggen/` (fixing points) | — |
| FILL-013 | Curve-relative instance placement (shoreline / path / pond-margin frames) | `src/vegetation/scatter.js` | D19-066 |
| FILL-010 | Overhead street elements: signal masts spanning a roadway, catenary and service-cable runs, pole banner arms — the analysis's #9 gap, zero of which exist in any ToonLab system | new `src/streetgen/` | — |
| FILL-011 | City facade construction over `buildinggen`: parapets, cornices, ground-floor retail plinth with real recess depth, modeled entrances, balconies, roof plant, window reveals, curtain-wall fins and spandrel bands. Built at `labs/launch-world/city/facade.js`; **paused** with the city scene | `src/buildinggen/` (mesher elements) | D19-037 |
| FILL-012 | **Per-scene exposure offset** the lighting system composes with its day curve instead of overwriting. NOT city-specific — the coastal scene needs it to grade against §12 | `src/lighting/lightingSystem.js` | D19-043 |


---

### FILL-YUA-01 · Per-foot ground contact

| Field | Value |
| --- | --- |
| **ID** | FILL-YUA-01 |
| **Capability** | Tell a host where a character's feet actually are and what is underneath each one. For every foot: the footprint centre in world XZ, the sole height, the support height sampled under *that* foot, and the signed clearance between them. A character can then be grounded on irregular ground — stepping stones, kerbs, rock shelves, stairs — without one foot floating and the other inside the geometry. |
| **Lives in** | `labs/launch-world/character/yuaCharacter.js` (`measureFeet`, the second grounding pass in `placeAt`, and the per-foot block of `groundReport`), plus the deterministic stepping-stone height profile `steppingStoneHeight` in `labs/launch-world/character/main.js` that exercises it |
| **Target** | `src/character/groundStabilizer.js` — alongside `createGroundSampler` / `createGroundStabilizer`, which today take exactly one sample at the body origin |
| **Why not ToonLab today** | D19-084. `createGroundStabilizer` is a rigid-body contract: one `(x, z)` query, one corrected body Y. It is correct for a capsule and cannot express two supports at different heights. There is no per-foot query and no foot IK anywhere in `src/character/`. Stillwater Garden leads with Yua on an irregular stone path read at 70–85 mm with her feet in frame, and §13 rejects floating contacts, so the launch scene's most-scrutinised contact is precisely the case the package cannot describe. |
| **Public API shape** | `sampleFootSupport(runtime, { heightAt })` → `{ left, right }`, each `{ x, z, soleY, support, clearance }` (clearance positive = floating, negative = penetrating), or `null` for a foot whose mesh is absent. Derived from the live skeleton, so it is valid mid-clip, not only at bind pose. Composes with the existing stabilizer rather than replacing it: `createGroundStabilizer({ heightAt, feet: sampleFootSupport })` lifts to the higher support instead of to the origin sample. The follow-on feature — two-bone foot IK driven from the same samples — is deliberately *not* in this filler; it belongs in the package because it changes the pose, and this filler only measures. |
| **Equivalence test** | Fully deterministic: the stone profile is a closed-form function of `(x, z)` with no seed, the pose is a fixed frame of a packaged clip, the camera is fixed per framing. Before merge, capture `grounding-stones-contact`, `grounding-stones-shoes`, `grounding-stones-wide` and `grounding-stones-walk` at 3840×2160 into `launch-plan/review/captures/equivalence/FILL-YUA-01/before/`, with `evidence.json`. After merging into `groundStabilizer`, delete `measureFeet` and the second pass in `placeAt`, re-place from the package call, re-capture. Pass condition is stricter than the register default because both paths must compute the *same* correction: the reported `feetClearanceMm` must match to **0.01 mm** on both feet, and the frames must be within the default 1% perceptual diff with zero structural change. A clearance drift means the merged sampler split the feet differently and the grounding claim moved. |
| **Status** | `filler` |

**Note on `steppingStoneHeight`.** It is registered as part of this entry rather than separately
because it exists only to exercise the capability: it is a *test fixture*, not a scene asset, and
it is replaced automatically the moment `labs/launch-world/garden/terrain.js` publishes a height
function (`resolveGardenHeight` in `labs/launch-world/character/main.js` prefers the garden's own
field and falls back only when it is absent). It is not a duplicate of a ToonLab system — ToonLab
does not author height fields at all (D19-003).
