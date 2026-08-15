# ToonLab 0.4.19 — deficiency log

**Living document.** Findings are appended as they are discovered during the Pro
launch-video world production (`launch-prep` branch). Every entry is something that cost
production time, silently produced a wrong result, or blocked a documented capability —
recorded so it can be fixed in the package rather than worked around in one scene.

> **Standing direction (developer, 2026-08-15):** *"We can always fix ToonLab library, but
> the scene itself has to be the same quality as Ananta or better."*
>
> Scene quality outranks library stability. Where a deficiency below blocks the scene from
> reaching benchmark quality, **fix the library** rather than working around it in
> scene-local code. Entries fixed during production are marked **FIXED** with the commit
> or file touched. What remains prohibited regardless: scene-local duplicates of a ToonLab
> feature, replacement renderers, and generic Three.js stand-ins for systems ToonLab owns —
> if a system is inadequate, improve that system.

Each entry: **severity** · **area** · what was expected · what actually happens ·
evidence (`file:line` or measured data) · suggested fix.

Severity scale:
- **S1 blocker** — a documented capability cannot be built with shipped code.
- **S2 silent-wrong** — code runs, produces a wrong or ignored result, no warning.
- **S3 hard-fail** — throws or is invalid, but fails loudly.
- **S4 data/curation** — shipped asset or catalog data does not meet its own declaration.
- **S5 papercut** — discoverability, naming, docs, or dead surface area.

---

## S1 — Blockers

### D19-001 · No single-load neutral↔styled A/B path
**Area:** styles / renderer · **Found:** launch §11 shader wipe

A before/after shader wipe is a flagship ToonLab demonstration, but there is no shipped way
to render the *same* geometry buffers twice with different material treatment in one frame.
Both in-repo wipes load the model **twice** into separate mixers
(`labs/character-comparison/main.js:185-192`) or separate carriers
(`labs/launch-world/main.js:74`). Two loads cannot guarantee identical animation time,
camera matrices, light transforms or exposure — which is exactly what a credible A/B claim
requires. `styleTransaction`'s `setTargetEnabled` is the closest primitive and is too
expensive to toggle per-frame.

**Suggested fix:** a first-class comparison API — single load, dual material assignment,
scissor/mask split — so the A/B is a renderer feature rather than something every consumer
re-implements incorrectly.

### D19-002 · Only `rock` ships a `neutral` preset
**Area:** styles

Neutral (un-stylized) counterparts exist for rock but not for toon, environment,
manufactured surface, tree, grass, ground, water, sky or cloud. Any honest "here is what
ToonLab does to your scene" comparison needs a neutral baseline for every domain, and
today most domains have nothing to compare against.

**Suggested fix:** ship a `neutral` preset per style slot, generated from the same schema
so the pairing is guaranteed symmetric.

### D19-003 · Terrain ships as unreachable code
**Area:** landscape / packaging

`createStylizedTerrain` and `resolveWorldPreset` exist as source files but are **exported by
nothing**, and `src/landscape/**` is excluded from the npm package. A consumer following the
terrain story finds files in the repo that they cannot import from the published package.
Working route is `createSceneSurfaceRuntime` (`src/runtime/sceneSurfaceRuntime.js:84`) with
a host-supplied `heightAt`.

**Suggested fix:** either export and ship it, or remove it and document
`createSceneSurfaceRuntime` as the terrain entry point.

---

## S2 — Silent-wrong

### D19-004 · Water silently falls back on unknown `preset` and `style`
**Area:** water · `src/water/waterSettings.js`

An unrecognized `preset` silently becomes `lake`; an unrecognized `style` silently becomes
`default`. A typo in a coastal scene yields a lake with no diagnostic. This is the most
dangerous class of failure in the package — the scene renders, looks plausible, and is wrong.

**Suggested fix:** warn on unknown enum values (dev builds at minimum). Applies to every
settings factory with a fallback, not just water.

### D19-005 · `reflectionStrength` and `detailNormalStrength` are inert under `colorTone: 'anime'`
**Area:** water

Both keys are real, correctly spelled, accepted without complaint — and then force-applied
over by the `anime` colorTone. Authors tune values that cannot take effect.

**Suggested fix:** warn when an explicitly-passed key is overridden by a tone/preset, or
make colorTone supply defaults that explicit values win against.

### D19-006 · Style bundle `cloud` slot resolves to schema defaults
**Area:** styles · `src/styles/styleBundle.js:228-232`

The Call Me Sensei cloud look "is not carried over in this pass" — the bundle advertises a
`cloud` slot with `style: 'call_me_sensei'`, but resolving it yields schema defaults. A
consumer selecting the bundle reasonably believes clouds are styled; they are not.

**Suggested fix:** carry the cloud style through, or mark the slot explicitly unimplemented
in the bundle payload so it is visible rather than silently inert.

### D19-007 · `toon` `call_me_sensei` preset is an empty override set
**Area:** toon · `src/toon/toonSettings.js:78`

Unlike rock and ground, the toon preset contributes no overrides. Character styling in the
"protected first-party style" is therefore whatever the defaults happen to be.

**Suggested fix:** author real toon overrides, or document that toon defaults *are* the
Call Me Sensei treatment.

### D19-008 · Legacy-woody trees report an inert `levels` value
**Area:** vegetation

Tree recipes on `architecture: legacy-woody` resolve to `skeleton.generator: 'limbs'`
(`src/vegetation/stylizedTree.js:1378`), a space-colonization grower capped at 140 nodes.
`levels` is documented as *"Branching generator only"*
(`src/vegetation/stylizedTree.js:1843`) — yet a recipe reports `levels: 3`, which does
nothing. Three Library trees were specified and approved on the strength of a number that
has no effect.

**Suggested fix:** omit or null inert fields per architecture rather than reporting a
default, so recipe inspection reflects what will actually be built.

### D19-009 · Quality-profile vocabulary is inconsistent across subsystems
**Area:** cross-cutting · `src/renderer/sceneQualityProfiles.js:200-211`, `:223`

Scene quality profiles accept only `balanced` | `performance`. Sky accepts `high` on a
different axis. Passing `quality: 'high'` to grass **throws**. Two different meanings of
"quality" in one package is a reliable source of author error.

**Suggested fix:** unify the vocabulary, or namespace the axes so `high` is never
plausible-but-invalid.

---

## S4 — Shipped data and catalog curation

### D19-010 · Catalog cliff assets ship a 4×4-pixel normal map · **PARTIALLY FIXED**
**Area:** rock catalog · **Evidence:** `rock-0169`, `rock-0449`, `rock-0460`, and all 16
`cliff-corner` assets

The normal map is **307 bytes, 4×4 pixels**; ORM is effectively constant. Only 3 of 7
declared maps ship, and no height map compensates. The upstream texture candidate declares
gate `"noNormalMap": true` — so there is no normal map anywhere in the chain, while the
asset presents as fully surfaced.

**Scope is wider than first recorded.** Hashing the embedded images of all 16 `cliff-corner`
assets shows the same placeholder (`39850138606827d0…`, 307 B, 4×4) in **every one**. This
is a catalog-wide condition, not a property of the rejected `cliff-corner-kit` family, and
no asset selection can avoid it.

**FIXED (runtime):** a placeholder in a real slot is worse than an empty slot, because it
displaces the shader's own deterministic fallback. `src/rock-shader/rockTextureIntegrity.js`
(new) rejects detail maps below 16×16; `rockShaderRuntime.js` applies it to both the
supplied texture set and the imported `sourceNormal`, and reports drops on
`applyRockShader(...).rejectedTextures`; `src/catalog/officialCatalogPlacement.js` no longer
harvests a degenerate normal off the artifact and accepts caller-supplied maps. Measured:
every catalog cliff now reports `sourceNormal 4x4` rejected instead of binding it.

**STILL RECORDED (data):** the artifacts themselves are unchanged, and the package ships no
replacement normal maps. `assets-local/rock-textures/rock-*-normal.png` exist unreferenced,
but only **four are distinct across six geologies** — `rock-weathered-limestone-normal.png`
and `rock-sharp-karst-normal.png` are byte-identical (`84fdf38f…`). Publishing real
per-geology normals remains the data-side fix.

### D19-011 · "Distinct" catalog assets ship byte-identical textures · **PARTIALLY FIXED**
**Area:** rock catalog

All three cliff assets ship textures with matching hashes. Per-asset material seeds and
weathering parameters exist **in the recipes** but were never baked into the artifacts.

**Corrected characterisation.** Across all 16 `cliff-corner` assets there are exactly
**three distinct albedos and three distinct ORMs, keyed one-per-geology**. Two assets of the
same geology are guaranteed identical maps regardless of their differing `material.seed`.
The original claim that this "yields three identically-surfaced rocks" was, however,
overstated: the rock shader projects the base map with **world-space triplanar**
(`positionWorld`, `rockMaterial.js:740-742`), so two rocks at different positions never
sample the same region. Shared texture bytes do not imply a shared rendered surface. The
rejected kit's repetition was driven by duplicate *geometry* (`shape-290` twice) at 252
triangles, not by the shared texture.

**FIXED (runtime):** `createRockShaderTextureSet({ variation })` in `rockShaderRuntime.js`
decorrelates every generated fallback map per asset, and `applyRockShader(root, settings,
{ variation })` / `loadOfficialCatalogAsset({ variation })` plumb it through. Variation 0
reproduces the reviewed set byte-for-byte, so existing captures are unaffected.

**STILL RECORDED (data):** publish-time per-asset baking is unchanged.

### D19-012 · Declared moss/lichen is metadata-only · **FIXED (consumer path)**
**Area:** rock catalog

Recipes advertise weathered-limestone + moss-lichen, while artifacts ship
`moss.enabled: false`, `mossCoverage: 0`, `lichenCoverage: 0`.

Additional finding: within the amended `cliff-corner` family **no asset is both
weathered-limestone and moss-lichen** — the limestone members are all `mineral-stained`. The
combination §6.3 asks for exists only as inert metadata on the rejected kit.

**FIXED:** `src/catalog/officialCatalogRockSurfaces.js` (new) derives enabled, deterministic
per-asset moss settings from a variation index, so a consumer placing catalog rocks gets
authored moss instead of a disabled flag. See also D19-032 for why the shipped coverage gain
could not produce visible moss.

**STILL RECORDED (data):** artifacts continue to ship `moss.enabled: false`.

### D19-013 · Two "distinct" catalog assets are the same shape mirrored · **RECORDED**
**Area:** rock catalog

`rock-0169` and `rock-0449` share `profileId shape-290`. They are presented as separate
catalog entries (Cliff Corner Kit 3 and Kit 2) and were selected as two of three distinct
hero cliffs on that basis.

**Confirmed structural, not incidental.** In `cliff-corner`, eight of sixteen assets share a
`profileId` with exactly one sibling (`shape-092/-100/-108/-116/-124`), differing only by
generator seed; paired members have near-identical GLB byte sizes (`rock-0095` 296,212 B vs
`rock-0281` 296,204 B). Selection must treat `profileId` as the identity key. The replacement
set uses `shape-132`/`shape-124`/`shape-108` — all distinct.

**Suggested fix:** surface `profileId` collisions in search results so a consumer can avoid
selecting duplicates unknowingly.

### D19-014 · Catalog records carry `license: null` · **FIXED (failure mode)**
**Area:** catalog metadata · `src/asset-policy/catalogLicenses.js`

All three cliff records return a null license. Any provenance-tracking consumer has no
value to record — and ToonLab's own docs require provenance capture. Confirmed unchanged on
the replacement `cliff-corner` selections: `license: null` is a property of the rock catalog,
not of one family.

**This was a latent hard failure, not only a blank field.** `resolveCatalogLicense(null)`
returns `null`, so `assertCatalogLicenseRelease({ id: null })` threw
`"(missing license) is not in the reviewed-license registry"` — which reads as an unreviewed
*third-party* license rather than an absent field, and would crash any release path that
asserted against a first-party rock.

**FIXED:** added `CATALOG_LICENSE_UNSPECIFIED` and `describeCatalogLicense(id)`, which
classifies as `approved` | `unspecified` | `unrecognized` without throwing, so callers can
branch instead of using exceptions for control flow. `assertCatalogLicenseRelease` now emits
a distinct, actionable message for the unspecified case. Deny-by-default is unchanged —
absence is still never an approval.

**STILL RECORDED (data):** the catalog must publish a real license value before §15 can be
completed or anything is shared publicly.

### D19-015 · `cliff-corner-kit` is a tiling kit presented as cliff formations
**Area:** catalog curation

252–262 triangles on a 3.2 m formation; renders as a featureless rounded box with a visible
two-piece union seam. The sibling `cliff-corner` family is 6–16× denser (`rock-0119`:
4,006 triangles with real strata and fracture columns). Both surface under the same cliff
search with nothing distinguishing intended use.

**Suggested fix:** tag tiling kits distinctly from hero formations, and expose triangle
count in search results.

### D19-016 · LOD1 bounds overshoot LOD0 · **RECORDED**
**Area:** rock catalog

LOD1 exceeds LOD0 bounds by up to 0.05 m, so a naive bounding-box union across LODs
inflates measured dimensions. Any consumer measuring an asset by unioning its LODs gets a
wrong answer.

Confirmed on the replacement set; measured all-LOD union overshoot is 0.0099 m
(`rock-0119`), 0.0203 m (`rock-0111`), 0.0399 m (`rock-0281`). All published dimensions in
the §6.3 amendment are LOD0-only.

### D19-017 · Catalog ships 3 LODs where the recipe declares 2 · **RECORDED — family-specific**
**Area:** rock catalog

The artifacts carry three LOD levels; the recipe declares two — leaving the LOD2 switch
distance undefined and forcing the consumer to author it.

Scoped to `cliff-corner-kit`. The `cliff-corner` family declares `lod.count: 3`,
`ratios: [1, 0.5, 0.25]`, `distances: [0, 45, 120]` and ships exactly that, so the
replacement set carries no undefined switch distance.

### D19-018 · Library tree recipes ship without thumbnails
**Area:** library

None of the three audited tree records has a thumbnail, so no visual triage is possible
before building the tree — the failure mode that let three proxy-grade trees be specified
as launch heroes.

---

## S5 — Papercuts

### D19-019 · Lab-only bark textures are not runtime-resolvable
**Area:** vegetation

`beech` and `birch` bark exist only as Tree Lab canvas painters, with no runtime
equivalent — but they are the natural names to reach for when authoring a BranchTree
recipe, and they resolve to nothing.

### D19-020 · Wind and LOD are not BranchTree parameters
**Area:** vegetation

Both are documented tree requirements but are supplied elsewhere — LOD via
`src/vegetation/treeLodCompiler.js`, wind and shadow casting via scene assembly. Nothing at
the `createBranchTree` call site indicates this.

### D19-021 · `legacy-woody` is absent from the engine-specific LOD table
**Area:** vegetation · `src/vegetation/treeLodCompiler.js:16`

Defaults `[12000, 7000, 3500, 140]` therefore apply. The practical consequence: a
legacy-woody tree's *hero, full-detail* mesh can land below the LOD2 cap — i.e. the
runtime budgets more geometry for a distance proxy than the asset provides at full detail,
with nothing flagging the inversion.

### D19-022 · Ground splat exposes 4 fixed channels only
**Area:** ground shader

Channels are grass/dirt/rock/sand. Authored scenes needing other material roles
(promenade, lawn, boardwalk) must remap onto those four, which makes masks read
misleadingly against their semantic intent.

### D19-023 · Tone mapping is a renderer setting, not a post setting
**Area:** post · `src/renderer/rendererConfiguration.js:104`

There is no `toneMapping` key in post settings. "Filmic tone mapping" is a natural thing to
look for in the post slot and is not there.

### D19-024 · Sun elevation has no direct parameter
**Area:** lighting

Elevation is derived from `timeOfDay` via `sunPath`; shipped defaults put hour 10 at 47.2°.
Hitting a specific elevation requires either solving for the hour or overriding
`sunPath.heightScale` — neither discoverable from the lighting API.

### D19-025 · Post `call_me_sensei` preset ships `bloom: false`
**Area:** post

The first-party style preset disables bloom, so any bloom in a Call Me Sensei scene must be
re-enabled explicitly. Worth confirming this is intended rather than an oversight.

---

## Appended 2026-08-15 — BranchTree authoring pass

### D19-026 · BranchTree ships a bare trunk under a style bundle · **S2**
**Area:** vegetation · fix in progress

A freshly built BranchTree has `map: null` on the trunk **even with
`vegetationShader: 'call_me_sensei'`**, because the bark fallback tests `options.preset`
and BranchTree never forwards it. The style bundle appears applied and the trunk is
untextured. A hero tree with a bare trunk fails §13's "generic low-poly appearance" on
sight at close camera.

### D19-027 · `trunk.textureRef` has no consumer anywhere in `src/` · **S5**
**Area:** vegetation

The field is accepted, stored and serialized as provenance, but nothing in the runtime
reads it. An author naming a bark texture there gets no error and no texture — the field
silently does nothing.

**Suggested fix:** resolve it, or rename/document it as provenance-only.

### D19-028 · Lean direction is not authorable on BranchTree · **S1**
**Area:** vegetation

`leanOffset` / `bendDirection` are not forwarded, so lean *magnitude* is authorable but
lean *direction* is fixed at placement. Nine instances of a "windswept ridge" tree
(§6.1 TREE-COAST-HQ-A, §10.2) therefore lean in nine different directions — measured yaws
+158.0° / +198.5° / +186.4° across three variants. Wind-shaped vegetation that does not
share a downwind bearing reads as broken geometry, not as wind. This blocks a documented
composition, so it is S1 rather than S5.

**Suggested fix:** forward lean direction so a scene can align vegetation with its wind
and swell direction (§6.4 `waveDirection`).

### D19-029 · `legacy-woody` LOD0 cap is below what a spec-compliant tree needs · **S3**
**Area:** vegetation · `src/vegetation/treeLodCompiler.js`

A tree meeting §6.1's stated minimums — four branch levels, 12 radial segments — reaches
~11k triangles in **wood alone**, before any foliage. The `legacy-woody` default LOD0 cap
is 12,000, so every compliant tree reports `report.valid === false` (measured LOD0
25,280–29,046 across nine families). LOD1/2/3 all pass. `TREE_LOD_ENGINE_TRIANGLE_CAPS`
already carries a `woody-axis` envelope `[40000,21000,11000,140]` for denser scaffolds
under which all nine validate — BranchTree simply is not registered to it.

**Suggested fix:** register BranchTree under the correct engine envelope so validity
reflects reality instead of requiring a per-asset exception.

### D19-030 · Recipe `size` silently destroys foliage when used to scale · **S2**
**Area:** vegetation · `src/vegetation/stylizedTree.js:2677`

`size` is a group scale whose *other* effect is the canopy card budget
(`coverage = clamp(size,0.4)²`, capped at 9). Lowering `size` to hit a target height
destroys **61–78% of leaf cards** while leaving wood untouched — measured: HQ-A
4,489 → 977 cards, 660 → 145 cards/m — with no LOD benefit. Scaling the instance
transform preserves the mesh exactly. Nothing at the call site warns that `size` is not a
neutral scale control.

**Suggested fix:** decouple the card budget from `size`, or warn when `size` is used
below the threshold where foliage starts dropping.

---

## Appended 2026-08-15 — cliff re-selection pass

### D19-031 · `resolveCatalogLicense(null)` throws, and every rock record is `license: null` · **S1** · **FIXED (code) / RECORDED (data)**
**Area:** asset-policy · `src/asset-policy/catalogLicenses.js`

Escalated from D19-014. The null license is not merely a blank provenance field: the
resolver **throws** on `null`, and every rock catalog record supplies exactly that. Any
release, export or compliance path that asserts a license will crash on a shipped
first-party asset. Latent because nothing on the current happy path calls it.

**Suggested fix:** populate real license values on catalog records, and make the resolver
fail soft with a diagnostic rather than throwing.

**FIXED (code), verified 2026-08-15.** Measured after the fix:
`resolveCatalogLicense(null)` -> `null` (no throw); `describeCatalogLicense(null)` ->
`{ id: null, policy: null, state: 'unspecified' }`; `describeCatalogLicense('Nope-1.0')` ->
`state: 'unrecognized'`; `assertCatalogLicenseRelease({ id: null })` throws the precise
"catalog license is unspecified … absence is not an approval" diagnostic instead of the
misleading registry error. A compliance path can now branch instead of catching.

**STILL RECORDED (data):** every rock catalog record continues to ship `license: null`, so
§15 still has no provenance value to log for ROCK-COAST-01/02/03. The code no longer
crashes on it; it reports it.

### D19-032 · The 4×4 normal placeholder is family-wide, and real normals ship unreferenced · **S4** — escalates D19-010
**Area:** rock catalog

Hashing embedded images across all 16 `cliff-corner` assets: the **307-byte 4×4 normal is
byte-identical in all 16** — the same hash the rejected `cliff-corner-kit` shipped. So this
is catalog-architectural, not a bad-family artifact.

The aggravating detail: the correct **2048² normal maps already exist in-repo, unreferenced**,
and every `material-config` texture ref resolves with matching hashes. The catalog ships a
placeholder while the real asset sits beside it. Wiring these up lifts every cliff in the
catalog at essentially zero authoring cost.

### D19-033 · Only 3 distinct albedos and 3 distinct ORMs exist across 16 cliff assets · **S4** — escalates D19-011
**Area:** rock catalog

Maps are keyed one-per-geology, so two same-geology assets are *guaranteed* identical
textures regardless of their differing per-asset material seeds. Because only two geologies
contain cliff-reading profiles, a fully-distinct-texture trio is **impossible** from this
family. Per-asset variation must therefore come from moss/lichen masks — which ship disabled
(D19-012). The catalog advertises per-asset weathering it structurally cannot deliver.

### D19-034 · Family name does not predict asset form · **S4**
**Area:** rock catalog curation

Within `cliff-corner`, only `shape-100/108/124/132` render as actual cliffs. The rest —
including a `weathered-limestone` member, `rock-0322` — are smooth mesa-topped stumps.
Verified against shipped thumbnails; metadata does not distinguish them. A consumer
selecting by family name and geology gets an unusable asset with no warning.

**Suggested fix:** tag form/silhouette class, and expose triangle count and a thumbnail in
search results so visual triage is possible before download.

### D19-035 · `rock-0111` ships a cool tint over a limestone base · **S4**
**Area:** rock catalog · shipped `call_me_sensei` setting

`material.tint [0.831, 0.8964, 1]` renders cool blue-grey while its own rockgen surface
declares `textureStyle: "limestone"` with a baseColor identical to its warm-beige siblings.
The blue is purely tint. Placed beside other family members it breaks palette coherence —
and against a coastal scene it competes with the water highlights the composition protects.
**Harmonized during production** (developer ruling 2026-08-15); recorded because the shipped
default is the problem.

### D19-036 · §6.3's own description does not match the artifacts · **S5**
**Area:** docs / catalog metadata

The spec's "weathered-limestone + moss-lichen recipes, 1024 source textures" is factually
wrong for these assets: maps ship at **2048²**, and no `cliff-corner` asset is both
weathered-limestone *and* moss-lichen. The description was presumably taken from catalog
metadata, which means the metadata itself misdescribes the artifacts.

---

## Production pass — trees / vegetation (2026-08-15)

Appended during §14 step 2 (authoring the three §6.1 BranchTree families and their nine
seed variants). Evidence and measurements: `launch-plan/review/tree-replacement-authoring.md`.
Regression check for every `src/` change below: existing seeds on both the `branching` and
`limbs` generators produce **byte-identical geometry** (sha256 over position + index
buffers, 11 seeds), and 32 of the 34 vegetation-touching `verify-*` scripts pass — the two
that fail (`verify-catalog`, `verify-lab-preview`) fail identically on unmodified `src/`.

### D19-019 · Lab-only bark textures are not runtime-resolvable — **FIXED**
**Area:** vegetation · `src/vegetation/treeSurfaceTextures.js`, `src/vegetation/branchTree.js`

Promoted `beech` and `birch` from Tree Lab DOM-canvas painters into first-party runtime
surface profiles, generated by the same periodic-noise `DataTexture` path as the existing
profiles (so they work headlessly and in export, which the canvas painters never did):

- `beech-smooth-v1` — smooth mottled patches, no fissures, pale grey-green ground, softer
  light bands (`bandSoftness` 0.115) because smooth bark has no relief for a hard
  terminator. Measured tile: 128×256, red channel 135–174 (narrow, as smooth bark should be).
- `birch-papery-v1` — near-white papery ground with high-contrast horizontal lenticel
  dashes and sparse shed-limb patches. Measured tile: red channel 68–246, mean 230.

Added `TREE_SURFACE_PROFILE_ALIASES` + `resolveTreeSurfaceProfileId()` so the species words
authors actually reach for (`beech`, `birch`, `oak`, `bamboo`, `yucca`, `saguaro`,
`classic`) resolve to profile ids, case-insensitively. Both are exported from the
`vegetation` barrel.

**`trunk.textureRef` is now live.** It had no consumer anywhere in `src/` — it serialized
and was read by nothing, so a recipe naming its bark silently got none. `BranchTree` now
resolves it to a registered profile; an unrecognized ref stays caller-owned provenance and
falls through to the style default, so every existing document keeps working unchanged.

### D19-026 · BranchTree built a bare, untextured trunk — **FIXED** · S2 silent-wrong
**Area:** vegetation · `src/vegetation/stylizedTree.js:2643`

The bark fallback tested `options.preset === 'call_me_sensei'`, but `BranchTree` forwards
the style as `vegetationShader` and never sets `preset`. Every BranchTree therefore shipped
with `trunkMesh.material.map === null` — a flat, untextured trunk — unless the caller
separately ran `ensureTrunkSurface()`. Nothing warned. At §11 S08's 85 mm detail montage a
bark-less hero trunk is exactly the "generic low-poly appearance" §13 rejects on sight.

Fixed by resolving the requested style from `options.preset` **or** the `vegetationShader`
profile (string, `{ style }`, or `{ preset }` — the shape `setVegetationShader` already
accepts) and looking it up in `TREE_SURFACE_PROFILE_DEFAULTS`. Additive: it only installs
bark where there previously was none, and only when the caller asked for a style.

Verified: `createBranchTree({ vegetationShader: 'call_me_sensei' })` now reports
`{ profileId: 'call-me-sensei-bark-v1', source: 'registered-profile' }` at construction;
with `trunk.textureRef: 'beech'` it reports `beech-smooth-v1`. An unstyled tree still gets
no map, which remains correct.

### D19-027 · `bendDirection` / `leanOffset` ignored by the `branching` generator — **FIXED** · S2 silent-wrong
**Area:** vegetation · `src/vegetation/stylizedTree.js:765`, `:820`, `:1089`

`createTreeSkeleton` (the `limbs` generator) honours both fields, and both are parsed into
`settings.trunk` — but `createBranchingTreeSkeleton` never destructured them, so on the
`branching` generator (which is what **BranchTree hard-sets**) the values were accepted,
serialized, and silently discarded. Lean direction was therefore seed-luck only.

This blocked §6.1's TREE-COAST-HQ-A "strong directional lean" as a *stand*: §10.2 places
nine of them as a windswept ridge, and nine seeds leaned nine different ways (measured
crown azimuths 314.5° / 274.0° / 286.1° — a 40° scatter with no relationship to any wind).
Wind-shaped vegetation that disagrees with itself reads as damage, not weather.

Fixed by accepting both fields in `createBranchingTreeSkeleton` with the **same semantics
the other generator already uses** — `bendDirection` is the world heading the trunk bows
toward, `leanOffset` is the lean heading relative to that bow — so one recipe field cannot
mean two different things depending on generator. Because tilting about a horizontal axis
displaces the trunk 90° from that axis, authored headings are stored rotated back a quarter
turn. `null` keeps the historical seeded pick, and the seeded draw is consumed either way,
so **no existing seed's geometry moves** (verified byte-identical).

`BranchTree` exposes both as portable `trunk.bendDirection` / `trunk.leanOffset` fields
(nullable, normalized into `[0, 2π)`). The document version is deliberately **not** bumped:
the new fields default to `null`, so every existing v1 document still parses and builds
identically.

### D19-021 · `legacy-woody` is absent from the engine-specific LOD table — partially addressed
**Area:** vegetation · `src/vegetation/treeLodCompiler.js:16`

**BranchTree half — FIXED.** BranchTree was inheriting the legacy default
`[12000, 7000, 3500, 140]`, under which **§6.1's own minimums cannot pass**: four levels at
12 radial segments spend 14.7k–15.6k triangles on wood before a single leaf, and LOD0
exports crossed leaf cards at 4 triangles each. All nine families reported
`report.valid === false` on LOD0 alone while LOD1–LOD3 sat comfortably inside their caps.

Registered BranchTree as its own architecture rather than widening `legacy-woody` — raising
the legacy caps would silently un-flag the genuinely over-budget legacy library assets this
very entry exists to catch:

- `TREE_LOD_ENGINE_TRIANGLE_CAPS['branch-tree'] = [46000, 27000, 13000, 140]`
- `LOD_ENGINE_MESHING['branch-tree']` = `radialFactors [1, 0.75, 0.4]`,
  `sectionStrides [1, 1, 1]` — BranchTree already tapers its own branch cross-sections per
  level (`radialSegments`, −2, −4, 3), so longitudinal decimation on top of that hits the
  three-side floor and squares off the twigs. Reduce tube sides only, as `woody-axis` does.
- `'branch-tree'` added to `TREE_ARCHITECTURE_ENGINE_IDS`.
- `createBranchTreeRecipe()` added to `src/vegetation/branchTree.js` — the adapter that
  wraps BranchTree settings in the tree-recipe envelope the compiler consumes, tagged with
  the new architecture. Without it the envelope was unreachable. It shares
  `branchTreeStylizedOptions()` with the constructor, so the compiler meshes exactly the
  tree the runtime renders (verified: identical triangle counts both ways).

Caps follow the file's stated policy — introduced against a reviewed benchmark, which is
the nine measured launch-world families (wood 14,740–15,622; leaf cards 5,274–6,683; LOD0
35,962–41,598). LOD0 takes an 11% margin over the measured maximum; LOD1 and LOD2 sit at
59% and 28% of it, inside the 55–78% / 24–42% family ratios `woody-axis` established.
**All nine now report `valid: true` at every level.**

**Legacy half — still open.** `legacy-woody` itself remains absent from the table and keeps
the default caps. That is deliberate: the inversion this entry describes is a real signal
for the existing library, and it should be resolved by reviewing those assets, not by
raising their budget.

### D19-020 · Wind and LOD are not BranchTree parameters — LOD half addressed
**Area:** vegetation · `src/vegetation/branchTree.js`

LOD is now reachable directly from a BranchTree via `createBranchTreeRecipe()` (above), so
the call site no longer has to know how to hand-build a legacy recipe envelope.

Wind and shadow casting are unchanged and this is correct, not a defect: the runtime guide
(`get_runtime_guide`, topic `tree`) states wind, weather, lighting, interaction, collision
and placement are live host-scene state, not recipe fields. Shadow casting is already
automatic and unconditional (`castShadow` on trunk and canopy plus a `customDepthMaterial`
for alpha-correct leaf shadows). Recorded so the split is documented rather than surprising.

### D19-028 · `branches.children` above 8 silently produces a leafless tree — RECORDED · S2 silent-wrong
**Area:** vegetation · `src/vegetation/branchTree.js:151`, `src/vegetation/stylizedTree.js:748`, `:810`, `:1057`

`createBranchTreeSettings` advertises `branches.children` as 1–12 and accepts every value in
that range without clamping. But `createBranchingTreeSkeleton` grows breadth-first against a
fixed `branchBudget = maxBranches` (420, `:810`), and breaks out when it is exhausted
(`:1057`). At high child counts levels 1 and 2 consume the entire budget before the
leaf-bearing level-3 twigs are ever queued, so the tree loses its foliage instead of
gaining any. Measured leaf cards at seed 4107, size 3.2, four levels, 12 radial segments:

| `children` | 5 | 6 | 7 | 8 | 10 | 12 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| leaf cards | 4,489 | 6,614 | 7,540 | 6,662 | 1,119 | **19** |
| branch attachments | 192 | 280 | 320 | 282 | 48 | **1** |

At `children: 12` — the top of the advertised range — the tree is a bare skeleton with 19
leaf cards. Nothing warns. Not fixed here: raising or reallocating the branch budget would
change the geometry of every existing `branching`-generator tree, which is out of scope for
a tree-authoring pass. Suggested fix: either scale `maxBranches` with `levels × children`,
or clamp `children` to the range that actually produces a foliaged tree and say so.

### Not a deficiency — recorded so it is not re-litigated
The canopy card budget saturates at `coverage = clamp(size × coverageScale, 0.4)²` capped
at **9** (`src/vegetation/stylizedTreeFoliage.js:501`). Any recipe at `size ≥ 3` is already
at that ceiling, so `leaves.coverageScale` is inert for TREE-CITY-HQ-A (3.2) and
TREE-COAST-HQ-A (3.0). Canopy fullness for those families has to come from branch
attachments (`branches.children`), not from coverage. Documented because reaching for
`coverageScale` first is the obvious move and it does nothing.

---

## Appended 2026-08-15 — Azure Headland coastal scene, pass 1

Found while building `labs/launch-world/coast/` (§10.2). **No `src/` file was modified
in this pass** — every entry below is recorded, not fixed.

### D19-026 · Water's grab pass throws on any texture that has not decoded yet
**Severity:** S3 hard-fail · **Area:** water / renderer · `src/water/waterScenePasses.js:441`

`WaterScenePasses.renderGrabPass` re-renders the whole scene. If *any* material in that
scene still holds a `THREE.Texture` whose `image` is null — the normal state for one or two
frames after `TextureLoader.load()` — the WebGPU backend throws
`TypeError: Cannot read properties of null (reading 'complete')` out of
`Textures.updateTexture`. It is an uncaught page error, not a warning, and it points at
three.js internals rather than at the offending texture or the pass that triggered it.

The host has no way to know that adding a water surface makes asynchronous texture loading
anywhere else in the scene fatal. Workaround in the scene: `await loader.loadAsync(url)` for
every ground-shader layer before the ground mesh is constructed
(`labs/launch-world/coast/scene.js` `loadLayerTexture`).

**Suggested fix:** skip un-decoded textures in the grab pass, or fail with a ToonLab-level
message naming the material and texture.

### D19-027 · The `call_me_sensei` grass preset reads as pale wheat at field scale
**Severity:** S4 data/curation · **Area:** vegetation · `src/vegetation/stylizedGrass.js:118-133`

`baseColor [0.172, 0.318, 0.053]` against `tipColor [0.62, 0.84, 0.28]` is a strong
root-to-tip gradient. At single-clump scale it is the signature look. Across a 180 m field
the viewer sees almost only tips, and under the shipped `call-me-sensei` lighting at
`timeOfDay 8.5` with ACES the headland renders as a **pale cream-yellow wheat field**, not
§10.2's "saturated but natural greens" — while the Ground Shader lawn *directly underneath
it* renders as a saturated green. The grass and the ground it stands on read as two
different biomes.

Ruled out during diagnosis: it is **not** alpha blending (forcing `washOpacity: 1.0` — i.e.
opaque blades — changes nothing), and **not** ground adoption (`groundAdoptStrength` is
already 1). It is the tip colour.

Evidence: `launch-plan/review/captures/coast-pass1-wide.png` (tip pulled to
`[0.40, 0.63, 0.19]`) versus the same frame at the shipped tip colour.

**Suggested fix:** either re-grade the shipped tip colour, or make the tip gradient
distance-aware so it survives being seen as a field rather than as a clump.

### D19-028 · The `coast` water preset's direction spread renders as a diamond lattice
**Severity:** S4 data/curation · **Area:** water · `src/water/waterSettings.js:348`, `:770`

`coast` ships `waveDirectionSpread: 0.5`, which `resolveWaterSettings` expands to
`0.5 * PI * 0.85` ≈ **76 degrees** of fan. Two coherent Gerstner trains at that angle
produce a regular criss-cross diamond pattern across the entire bay — a §13 automatic
rejection ("repeated pattern obvious in the hero frame"). Real nearshore swell refracts
almost parallel to the beach, which is what the preset's own comment ("Onshore swell: surf
only exists when waves travel toward the shallows") describes.

The scene overrides to `0.14` (≈21 degrees). Note that §6.4 of the production plan does not
list `waveDirectionSpread` at all, so anyone following the spec literally gets the lattice.

**Suggested fix:** lower the shipped `coast` spread, and/or let the nearshore-phase
refraction narrow the fan automatically as the bed shoals — it already has the bed sampler.

### D19-029 · No distance fade on water surface detail — grazing-angle moiré
**Severity:** S2 silent-wrong · **Area:** water

Even with a narrow direction spread, the water's normal/detail bands alias into visible
moiré from ~120 m out at grazing angles (`coast-pass1-wide.png`, upper third). There is a
`detailScale` but no distance-based roll-off of the detail normal or the wave normal, so the
far half of any large water tile shimmers. The larger the tile — and §10.2 requires water
"beyond the camera frustum" — the worse it gets.

**Suggested fix:** fade detail-normal strength (and ideally wave normal amplitude) toward
the horizon by view distance, the way the Ground Shader's `distance` group already does for
terrain.

### D19-030 · `createWaterSurface` silently defaults a scene-scale water body to 10 m
**Severity:** S2 silent-wrong · **Area:** runtime · `src/runtime/sceneSurfaceRuntime.js:190-191`

`const width = finite(options.width ?? 10, 'water.width')`. Omitting `width` — easy, since
the same call takes `depth`, `position`, `segmentsPerMeter`, `maxSegments` and ~15 water
settings — yields a **10 m** strip in a 240 m world. Nothing warns; the scene renders, the
surface audit passes, and the failure looks like a shader or occlusion bug. It cost real
time here.

**Suggested fix:** require `width`/`depth` explicitly (they have no sensible default at
scene scale), or warn when a water body is more than an order of magnitude smaller than the
declared scene bounds.

### D19-031 · `surface.audit` fails legitimate review cameras
**Severity:** S5 papercut · **Area:** runtime · `src/runtime/sceneSurfaceRuntime.js:265`

`audit({ camera })` returns `camera-outside-review-surface` for any camera positioned
outside the declared bounds. Wide establishing and aerial composition shots — §12 Gate 3
explicitly requires them — are outside the footprint by design. The audit's genuinely
valuable checks (`grass-off-surface`, `grass-in-water-footprint`, grounding drift) are
therefore unavailable for exactly the frames that get reviewed.

**Suggested fix:** make the camera-containment check opt-in, or report it as a separate
non-blocking note rather than folding it into `ok`.

### D19-032 · The style bundle silently reverts per-field grass authoring
**Severity:** S2 silent-wrong · **Area:** styles · `src/styles/styleAdapters.js` `applyGrass`

`applyGrass` calls `subject.applySettings(resolvedSettings.grass)`, so every option passed to
`createCallMeSenseiGrassField` that overlaps `createGrassSettings` is overwritten the moment
the bundle is applied. The ordering constraint (author grass *after* `runtime.apply`, never
before) is not stated anywhere, and there is no report of what was overridden. The same
hazard applies to any domain whose adapter re-applies full settings.

**Suggested fix:** report overridden keys in the style-application result, and document the
"author after apply" ordering rule alongside the bundle.

---

## Appended 2026-08-15 — catalog rock surface pass

Found while completing the §6.3 cliff set (`launch-plan/review/cliff-asset-reselection.md`).
`src/` changes from this pass: `rock-shader/rockTextureIntegrity.js` (new),
`rock-shader/rockShaderRuntime.js`, `rock-shader/index.js`,
`catalog/officialCatalogRockSurfaces.js` (new), `catalog/officialCatalogPlacement.js`,
`asset-policy/catalogLicenses.js`.

### D19-031 · Rock projection scale is not asset-scale aware · **S2** · **RECORDED**
**Area:** rock shader · `src/rock-shader/rockShaderSettings.js`

`projection.scale` is a world-space period in metres and the `call_me_sensei` preset ships
**48 m**, tuned against the licensed mountain-scale reference meshes. A formation-scale
catalog cliff is 4–6 m, so it samples roughly 8% of the map: low-frequency blobs are
magnified to the size of the silhouette and the rock reads as marbled plastic rather than
stone. Nothing warns, because 48 is a legitimate value — it is simply the wrong one for a
4 m asset, and the shader has no idea how big its subject is.

Measured on `rock-0119` (4.26 × 5.94 × 3.79 m): at the shipped 48 m the surface is blotchy
and unreadable; at 26 m it reads as bedded limestone. Evidence:
`launch-plan/review/captures/rocks/`.

**Suggested fix:** derive a default projection period from the styled subject's bounds (the
placement path already computes them), or expose a `scaleClass` on the preset so
`formation`, `boulder` and `prop` rocks resolve different defaults from one style document.

### D19-032 · `call_me_sensei` moss coverage gain cannot produce visible moss · **S2** · **FIXED (consumer path)**
**Area:** rock shader · `src/rock-shader/rockShaderSettings.js`, `rockMaterial.js:1155-1160`

The shader computes `mossMask = clamp(pow(luminance(moss) * multiply * slope, 2), 0, 1)`.
Real moss albedo is dark: the shipped `layer-moss-albedo.png` has a mean sRGB of
(79, 107, 57), a linear luminance near **0.13**. The preset's `moss.multiply: 1.94` therefore
resolves to `(0.13 × 1.94)² ≈ 0.06` — about 6% blend, which is indistinguishable from moss
being off. The squaring is what makes this severe: halving the gain quarters the coverage.

This went unnoticed because the preset also ships `moss.enabled: false`, so nobody had
turned moss on to discover that the gain does nothing.

**FIXED (consumer path):** `createCatalogRockMossSettings` bases gain at 5.2 so that its
`coverage` argument behaves like a real 0..1 dial. Verified visually — moss is now present on
upward faces and differs per asset (`ab-moss-off.png` vs `ab-moss-on.png`).

**Suggested fix (package):** re-tune `moss.multiply`'s default against the shipped moss
texture, or normalize the moss sample by its own mean so the gain is texture-independent.

### D19-033 · Shipped rock normal maps are full-amplitude with no strength control in the preset · **S2** · **RECORDED**
**Area:** rock shader / textures

`assets-local/rock-textures/rock-*-normal.png` are valid tangent-space maps but
full-amplitude: red and green span 0–254 with a mean blue of 149, i.e. near-vertical slopes
across the whole map. The `call_me_sensei` preset applies them at `normals.nearFlatten: 0`
— full strength — and under a directional key those slopes shade to black, so the rock reads
as crumpled foil. Reaching a stone read required `nearFlatten: 0.93`, i.e. admitting 7% of
the map.

A dial that is only usable in the top 7% of its range is effectively miscalibrated. Note
`nearFlatten` is also the wrong *name* for the control an author reaches for here — it reads
as a distance-fade parameter, not as detail-normal strength.

**Suggested fix:** ship normal maps at a usable amplitude, or add an explicit
`normals.detailStrength` distinct from the near/far flattening ramp.

### D19-034 · Rock texture candidates ship a constant roughness map · **S4** · **RECORDED**
**Area:** rock textures · `assets-local/rock-texture-candidates/**/rock-roughness.png`

`rocks-weathered-limestone-subtle-v2/rock-roughness.png` is 2048×2048 and **every texel is
230**. Binding it with `base.useSmoothnessTexture: true` costs a 2048² sample per pixel and
returns exactly what the scalar `material.smoothness` already provides. The karst candidate
has a different hash but the same constant character.

Related: the candidates' albedo maps are near-constant too — the limestone albedo spans only
169–185 across all channels, so the "subtle" texture contributes essentially no macro
variation. Surface interest in a catalog rock comes almost entirely from geometry and the
detail normal, which makes D19-010 and D19-033 more load-bearing than they appear.

**Suggested fix:** drop constant maps from the candidate rather than shipping them, so a
consumer binding them is not paying for a no-op.

---

## Appended 2026-08-15 — §9 Texture Lab material-set authoring pass

> **ID note (2026-08-15):** originally filed as D19-031…041. Five workstreams appended to
> this log concurrently and all picked the same "next free" numbers, so this block was
> renumbered to **D19-050…060** to remove the collision. No other block was touched.

### D19-050 · `create_lab_document` ignores `preset`, `seed`, `style` and `variation` for 14 of 15 labs · **S2**
**Area:** MCP lab authoring · `mcp/lab-management.mjs:418-443` · **RECORDED**

`createLabDocument` branches on `id === 'rock'`. Rock honours `preset`, `seed` and
`style`; every other lab falls to `document = clone(STARTER_DOCUMENTS[id])` and only
`label` and `docKey` are applied. The tool schema advertises all four parameters for
all 15 labs, and the server-side instructions tell agents to "use `create_lab_document`
for a valid starter" — so the documented authoring entry point silently discards the
author's intent.

Measured: `create_lab_document({ lab: 'texture', preset: 'concrete', seed: 1801 })`
returns the bare default with `global.seed: 1337`. Texture Lab ships **76**
`BUILT_IN_TEXTURE_PRESETS` (`src/texgen/texturePresets.js`) covering exactly the
families §9 needs — `concrete`, `asphalt`, `cobblestone`, `bathroom-tiles`,
`oak-planks`, `brushed-steel`, `desert-sand`, `stucco` — and none of them is reachable
through the MCP starter. Two silent consequences: every recipe must be hand-authored
from the default, and two "different" starters made in one session share seed 1337.

**Suggested fix:** resolve `preset` per lab from that lab's shipped preset table
(`findTexturePreset`, `findWaterPreset`, …) and apply `seed` wherever the document has
a seed field — or drop the parameters from the schema for labs that cannot honour them.

### D19-051 · Grid generators baked an anisotropic joint on non-square modules · **S2** · **FIXED**
**Area:** texgen · `src/texgen/textureGenerators.js`

`faceProfile` measured distance-to-edge in **cell-local fractions**, so `gap`/`bevel`
resolved to different world widths per axis by exactly the cell aspect ratio. A
200 x 100 mm subway tile got horizontal grout twice the width of vertical grout; a
200 x 800 mm deck board got a butt joint four times the width of the board gap. Both
are §9 materials (MAT-CITY-05, MAT-COAST-01) and both are hero close-shot surfaces
(S03 70 mm, S08 85 mm), so this is visible, not academic. No parameter existed to
correct it — `stretchX`/`stretchY` are in the layer schema but were not in `GRID_USES`
and were ignored by `bricks`, `tiles` and `grid`.

**Fixed** by evaluating the profile per axis and scaling the joint by the layer's
existing `stretchX`/`stretchY` (added to `GRID_USES`). Provably non-breaking: at
`sx = sy = 1` the new form is `min(smoothstep(du), smoothstep(dv))` and the old form
was `smoothstep(min(du, dv))`; smoothstep is monotonic, so these are the same function.
Measured max |old - new| over 400x400 samples across five gap/bevel parameter sets:
**1.11e-16**. No shipped preset changes. `npm run verify:texgen` passes.

### D19-052 · A texture recipe cannot declare its intended world-space tile size · **S1**
**Area:** texgen / environment · **filler FILL-008**

§8's texel-density contract is `pxPerCm = sourceResolution / (worldTileMetres * 100)`.
Resolution is in the recipe; **tile size is nowhere**. A 4K map is 20.48 px/cm at a 2 m
tile and 5.12 px/cm at an 8 m tile — the same asset passes or fails the hero bar
depending on a number the asset does not carry. So a Texture Lab recipe on its own
cannot state whether it meets the quality bar, and every consumer re-derives
`texture.repeat = span / tile` by hand from a sidecar.

This is the load-bearing gap for D-003 in the launch decision log: tiling trim-sheet
materials are the only construction that reaches 10.24 px/cm on hero architecture, and
tiling scale is the entire mechanism. Shipping the mechanism without the parameter
makes the density claim unverifiable at runtime.

**Suggested fix:** a `worldTile` field on the recipe document, honoured by the
environment/manufactured-surface adapter when it binds maps to a surface, plus a
density report so a scene can assert its own compliance. See FILL-008.

### D19-053 · Pattern `scale` caps at 64, setting a floor on feature size per tile · **S4**
**Area:** texgen · `src/texgen/textureSettings.js`

Feature size is `tile / scale`, and `scale` is clamped to 64. A 4 m tile therefore
cannot express a feature below ~6 cm. Urban asphalt aggregate is 1–2 cm, so
MAT-CITY-04 had to drop to a **1.5 m** tile purely to reach 2.3 cm chips — a texel
density decision forced by a generator limit rather than by the camera. Harmless for
asphalt (no macro landmark), but it would block any large-tile material that needs
genuinely fine structure.

### D19-054 · `cavity` and `sheen` bake occlusion and a highlight into albedo, and are on by default · **S2**
**Area:** texgen · `src/texgen/textureSettings.js`, `evaluateTexture.js`

`color.cavity` darkens crevices toward `cavityTint` **in base colour**, and
`color.sheen` screens `sheenTint` over ridges **in base colour**. Those are an
occlusion term and a highlight term written into albedo — which every PBR contract and
§8 of the launch spec explicitly forbid ("no baked directional lighting, cast shadows,
matcaps or fake reflections in albedo"; AO is its own channel and is generated
separately by this very module). The starter document ships `cavity: 0.35` and
`sheen: 0.18`, so **the default Texture Lab output is not PBR-clean**, and the maps
double-count occlusion once the AO/ORM channel is also applied.

All ten §9 recipes hold `cavity: 0`; `sheen` is used only where it stands for real
pigment loss on worn edges (max 0.06).

**Suggested fix:** default both to 0, and label them in the schema as stylisation that
leaves the PBR contract — or route them to a separate "painted detail" output so the
albedo stays clean.

### D19-055 · Detail layers default to `overlay`, which is a no-op over a pattern base · **S2**
**Area:** texgen · `src/texgen/textureSettings.js`

Pattern generators (`bricks`, `tiles`, `grid`, `hex`, `basketWeave`) emit a near-binary
mask: ~1.0 on the module face, ~0 in the joint. `overlay` at h≈1 behaves as screen and
returns ≈1, so **every detail layer blended over a pattern base is discarded on the
face**. The result is a texture whose modules are perfectly flat colour fields — which
is precisely §13's "generic low-poly appearance" — while the sliders read as if a
material grain were applied. `multiply` or `min` is required, and nothing in the field
schema, the descriptions or the runtime guide says so. Cost three authoring iterations
on MAT-CITY-03/05 and MAT-COAST-01 before the cause was located.

**Suggested fix:** default `detailA.blend` to `multiply` when the base generator is in
the pattern category, or warn when an overlay layer's measured contribution over the
base is below a threshold.

### D19-056 · `jitterCells` reads only the BASE layer's cell id · **S5**
**Area:** texgen · `src/texgen/evaluateTexture.js:445,460`

Per-module hue/value variance — the single most effective anti-repetition device for
paving, tile and decking — is keyed off `baseOut.cell`. Detail-layer cell ids are
discarded. So an author who wants a noise base with a pattern detail cannot have
per-module tint, and the pattern is forced into the base slot whether or not that is
the right height construction.

### D19-057 · Per-module tint variety equals the module count in one tile · **S2**
**Area:** texgen · `src/texgen/textureGenerators.js` (`hash3u(seed, col % cols, row % rows, 0)`)

The cell hash wraps at `columns`/`rows`, so a tile with 4x4 modules has exactly **16**
distinct module tints, and tiling it reproduces the same 16 in the same arrangement.
Measured on a first-pass MAT-CITY-03 (2 m tile, 4x4 500 mm pavers): the 4-cell tonal
rhythm is plainly legible across a 4x4 tiling, tripping §13's "repeated pattern obvious
in the hero frame". The fix is to spend texel density on more modules per tile — that
material moved to a 3 m tile with 6x6 pavers (36 tints, 13.65 px/cm) — but nothing in
the lab surfaces the trade, and `cellVariation`/`jitterCells` present as if they
supplied unbounded variety.

**Suggested fix:** hash the cell against the unwrapped lattice index rather than the
wrapped one where the generator can afford it, or report the achievable module-tint
count alongside `columns`/`rows`.

### D19-058 · Ground Shader accepts `map` only and throws on the rest of the PBR set · **S1**
**Area:** ground shader · `src/ground-shader/groundShaderMaterial.js:143-149`

`createConvertedGroundMaterial` collects `normalMap`, `roughnessMap`, `metalnessMap`,
`aoMap`, `emissiveMap` and `alphaMap` and **throws** if any is present:

```
Ground Shader cannot preserve source texture inputs: normalMap, roughnessMap, metalnessMap, aoMap.
```

Only `map` survives, as a single splat layer texture. This collides head-on with §9,
which requires every material to output "albedo, normal, roughness, metalness, AO, ORM,
and height where relevant", and with §6.5, which routes ground appearance through
`createGroundShaderSettings`. Any ground surface whose quality lives in relief or in
specular response cannot be both spec-compliant and ground-shaded.

It bites hardest on **MAT-COAST-02**. The three sand states share one height stack and
differ almost entirely in `roughness` — 0.92 dry, 0.86 compacted, **0.28 wet**. That
roughness delta *is* the wet-sand read that §6.4's swash and wet-sand memory exist to
drive. Routed through the shipped Ground Shader, all three states collapse to the same
matte surface and the water system's most visible ground interaction disappears.

Failing loudly is the right behaviour for a contract this lossy — but there is no
supported alternative, so the launch material set routes every §9 material through
**Manufactured Surface** instead (the only ToonLab shader that carries the full set)
and records the terrain routing as blocked. See FILL-009.

**Suggested fix:** accept a per-layer PBR set on the ground shader — at minimum normal
and roughness per splat layer — so terrain can carry relief and a wet/dry response
rather than flat albedo.

### D19-059 · Style-label roles and manufactured material roles are two disconnected vocabularies · **S2**
**Area:** styles / environment · `src/styles/` (`createStyleMaterialContract`) vs `src/environment/manufacturedMaterialContract.js`

Both APIs use the words `primaryMass`, `secondaryStructure`, `trim`, `cavity`, `window`.
Only one of them means anything to the Manufactured Surface shader.

`createStyleMaterialContract(domain, { assignments: { MyMat: { roles: ['secondaryStructure'] } } })`
is the documented scene-label path (runtime guide, `quality/level-d-consumer/main.js`),
and it carries **no** `baseMaterial`, `finish` or `renderMode`. The classification the
shader actually reads comes from `material.userData.urbanMaterial`, written by
`applyManufacturedMaterialManifest` — a completely separate call that nothing in the
style-bundle path mentions.

Measured consequence: MAT-CITY-06 brushed stainless, labelled `secondaryStructure` with
`metalness: 1` and a full metalness map, converted to a **diffuse grey wall** with no
metallic response at all. It looked like painted board, not steel — §4's material
separation failing on the one material whose entire job is to read as metal. Adding the
manifest before `runtime.apply` fixes it, but nothing pointed there; the shared role
words actively suggest the label alone is sufficient.

This is also exactly the §8 requirement — "every material receives semantic ToonLab
roles **before** the Manufactured Surface shader is applied" — so the ordering is
load-bearing and undiscoverable.

**Follow-up measurement — the roles alone do not restore the metal read.** After adding
`applyManufacturedMaterialManifest` before `runtime.apply` (6 assignments applied, the
surface classified `metal` / `brushed` / `opaque` / `secondaryStructure`, `metalness: 1`
plus a full metalness map), the captured frame is **visually identical** to the
unclassified one: still a diffuse grey panel with no metallic response, and
indistinguishable from `mineral` / `raw` concrete rendered in the same stage under the
same key. Evidence: `launch-plan/review/captures/materials/MAT-CITY-06-applied.png`
against `MAT-CITY-01-applied.png`.

§4 requires that "painted metal, concrete, tile, timber ... read differently at a
glance". If a cel-shaded target deliberately suppresses metallic specular that is a
legitimate art choice, but then the anime shader needs *some* metal cue — a rim, a
narrow controlled highlight, a value shift — or the semantic classification has no
observable effect and §4 cannot be satisfied for metals. Needs a ruling from the
shader owner: either metalness is honoured, or `baseMaterial: 'metal'` drives an
explicit anime metal treatment.

**Suggested fix:** let the style material contract carry a full classification
(`baseMaterial`/`finish`/`renderMode`/`structuralRole`) and forward it, or warn when a
material converts to Manufactured Surface with no `urbanMaterial` classification and a
non-default metalness/transmission.

### D19-060 · `stretchX` produces vertical features and `stretchY` horizontal ones · **S5**
**Area:** texgen · `src/texgen/textureGenerators.js` (`periods`)

`periods()` computes `px = round(scale * stretchX)`, so raising `stretchX` raises the
frequency along U and **compresses** features horizontally — the result is vertical
streaks. The field description says "Horizontal anisotropy (brushed metal, wood planks)",
which reads as the opposite. Authoring a horizontally brushed steel panel from the
description gives a vertically brushed one, and the error is only visible once the map is
on a surface at the right orientation.

**Suggested fix:** rename to a period/frequency framing ("U repeats", "V repeats") or
invert the mapping so the label matches the result.

---

## City architecture and density pass (Nova Promenade §10.1 background massing)

Recorded while building `labs/launch-world/city/` — 28 background/midground building
masses on the shipped `buildinggen` grammar, in answer to the art-direction parity
analysis's #1 ranked gap.

### D19-037 · `buildinggen` is a village grammar, and it is honest about that — RECORDED · S3 scope
**Area:** buildinggen · `src/buildinggen/buildingSettings.js:6-32`, `:34`, `:78-114`

The parity analysis proposes `buildinggen` as the source of city background mass. It is the
right call for *construction* and the wrong call for *vocabulary*, and the difference matters
when §2 prohibits "procedural box buildings".

What it genuinely delivers, per volume: paired leaning inner/outer wall quads with sealed
corners, a stone base course, a buried foundation skirt, a per-bay timber/pilaster grid with
floor bands, surface-mounted window frames with glass and sills, doors with frames and stone
thresholds, roof slabs with undersides, eave fascia and gable-end infill, optional ridge caps
and finials, and a service riser. That is real construction and it clears the §2 bar.

What it does not deliver: any *city* form. `BUILDING_TYPES` is `cottage | shed | farmhouse |
watchtower | shrine`; `BUILDING_ROOF_KINDS` is `gable | hip | shed | pagoda` — no flat roof,
no parapet; `footprint.kind` is `rect | L | T` — no U, no courtyard, no chamfered corner. There
is no balcony, ledge, cornice, canopy, awning, shopfront, storefront return, plant enclosure,
sign fixing, or setback terrace. A modern promenade block has to be *composed* out of several
volumes rather than requested.

Not a defect to fix in place; recorded so the next consumer does not expect a city out of it,
and as the scoping note for a `buildinggen` city vocabulary (flat/parapet roof kind, U and
courtyard footprints, a ledge/cornice band, a canopy element).

### D19-038 · Building settings advertise ranges the runtime does not enforce — RECORDED · S2 silent-wrong
**Area:** buildinggen · `src/buildinggen/buildingSettings.js:124-169`, `:219-238`

`BUILDING_SETTING_FIELD_SCHEMA` advertises `footprint.width` max 14 m, `footprint.depth`
max 12 m, `massing.floorHeight` max 3.4 m, `massing.floors` max 5, `roof.pitch` min 0.25 and
`facade.windowWidth` max 1.4 m. `createBuildingSettings` clamps exactly three things — `floors`
(to 1..6, which already disagrees with the schema's 5), `roof.kind`, and `footprint.kind`.
Everything else passes through unvalidated.

This cuts both ways and both need saying:

- **It is what makes a city reachable.** The launch massing runs 30 x 20 m footprints, 4.8 m
  podium floors, `roof.pitch` 0.055 (the flat-roof-with-a-fall read that the roof-kind enum
  cannot express), and 2.45 m curtain-wall glazing. None of that is in range and all of it is
  correct, deliberate, and verified clean against `checkPlanInvariants`.
- **Nothing tells a caller either way.** A typo of 140 for 14 silently produces a 140 m
  building. The schema is presented as the contract and is not one.

Suggested fix: either clamp to the advertised ranges and widen them to something city-capable,
or mark the ranges explicitly as UI hints and document the real domain. Do not leave it
ambiguous. Also reconcile `floors`: schema says 5, the clamp says 6.

### D19-039 · Collision circles miss the middle of an elongated footprint — RECORDED · S2 silent-wrong
**Area:** buildinggen · `src/buildinggen/buildingGrammar.js:202-223`, `:301-309`

For a rect whose long span exceeds 1.5x its short span, `resolveBuildingPlan` emits exactly two
collision circles of radius `min(spanX,spanZ) * 0.62`, offset by `max/2 - radius*0.7`. Coverage
of the rect centre requires `max <= 2.108 * min`. Past that the two circles separate and the
middle of the building has no collision at all — and invariant 5 ("footprint circle misses a
rect center") fires, so `checkPlanInvariants` already knows.

The 1000-seed suite never sees it because every shipped type is inside the ratio: the widest is
`farmhouse` at 9 x 6 = 1.5. Any consumer authoring a slab hits it immediately — measured on a
30 x 13.3 m volume, the circles sit at +-9.22 m with radius 8.25 m and the centre is uncovered.

Worked around scene-side by holding every authored volume inside 2.05:1
(`labs/launch-world/city/massing.js`, `volumeSettings`). Suggested fix: emit
`ceil(maxSpan / (radius * 1.4))` circles along the long axis instead of exactly two. That is
strictly more conservative, so it can only reduce accepted village placements — worth a
`verify:villagegen` re-baseline.

### D19-040 · Plain standard materials collapse to saturated blue under the Call Me Sensei rig — FIXED (scene-side) · S1 blocking
**Area:** lighting / environment · `src/lighting/callMeSenseiLightingContract.js`, `src/buildinggen/buildingRecipe.js:57-73`

`buildingRecipe.roleMaterial` builds `MeshStandardMaterial`s. Dropped into a
`createSceneStyleRuntime` scene on a WebGPU backend, they are lit by exactly two things: the sun
`DirectionalLight` and the Call Me Sensei SH sky probe (`#c3dfff`, intensity 1.2). There is no
ambient term and no shadow-lift, so every surface with `N·L <= 0` receives *only* the cool probe
and renders a dark, saturated blue. Measured on the first city build: the entire 28-mass
background read as navy, at every band, with no facade value structure at all.

Fixed by routing the architecture through `applyEnvironmentShader` before it enters the scene —
which is what §3 of the production plan requires anyway ("Manufactured architecture -> ToonLab
Environment + Manufactured Surface"). The environment node material supplies `ambientStrength`,
`shadowLift`, `aoWarmth` and the untextured gradient, and shadow-side facades land inside the
mid value plateau instead of crushing.

Recorded rather than closed silently because **nothing warns**. A caller who adds any generated
`propgen`/`buildinggen`/`debrisgen` asset to a styled scene without the environment conversion
gets a plausible-looking but badly wrong result. Either the style runtime should report
unconverted standard materials in its discovery report, or `createSceneStyleRuntime` should
offer to convert them.

**Update 2026-08-15 (lighting/renderer owner) — this is broader than "plain standard materials".**
D19-062 traced the identical collapse on *fully converted* ToonLab node materials and measured the
cause: a Call Me Sensei rig has **no ambient light at all** — `Lighting System Ambient` is intensity
0 and `visible: false` — so the entire shadow side of every surface, converted or not, is lit only
by the SH sky probe, whose measured radiance is R:G:B = **1 : 2.24 : 5.33** before its `#c3dfff`
tint. Conversion helps because the environment node material carries `ambientStrength`/`shadowLift`;
the underlying rig gap is unchanged. `installToonLabSurfaceLighting` now has the equivalent lever
(`shadowFill`, default 0 — see D19-062), which covers occluded-but-sun-facing surfaces. Surfaces
with `nDotL <= 0` still have only `indirectTint`/`skyFillTint` and remain a look-dev decision.

### D19-041 · The package sun-shadow pass writes an empty depth map at launch-world scale — **SUPERSEDED by measurement; detection FIXED** · S1 blocking
**Area:** environment / lighting · `src/environment/environmentSunShadowPass.js:336-560`, `src/lighting/callMeSenseiLightingContract.js:54-63`

With `environmentRoot` bound and the pass scheduled, the Nova Promenade scene renders **uniformly
shadowed with no cast shadows anywhere** — no building shades the ground, no building shades
another, and every receiver is darkened by a constant factor.

Diagnosis, in order:

- `shadowPass.renderCount` advances normally (0 -> 32 over 30 frames), `ready` becomes `true`.
- `shadowPass.inspectDepthContent()` reports `writtenSampleCount: 0` at **both** cascades. The
  depth target is allocated and cleared and nothing is ever drawn into it, so every receiver
  samples cleared depth and tests as occluded.
- Casters are correct: all five `CityMass-*` meshes carry `castShadow: true`, `visible: true`,
  and visible materials.
- The shipped contract sizes the shadow for a character scene: near cascade +-34 m / far 140 m,
  far cascade 110 m extent / 300 m far. §10.1's world is 160 x 140 m and its modeled skyline runs
  to 280 m, so the shipped numbers cannot cover it regardless.
- Widening both cascades (+-340 m, far extent 340), setting a negative orthographic near
  (-800/800) so the frustum contains casters behind the light, raising `mapSize` to 4096, and
  sweeping `bias` / `normalBias` across two orders of magnitude **do not change the result**.
  The map stays empty.

`labs/launch-world/city/` therefore defaults to `shadows: false` (`?shadows=1` re-engages it for
whoever picks this up). The scene renders with the sun's directional term only: a correct
sunlit/shaded facade split, but no cast shadows and no contact shadows, which §13 will reject as
"floating contacts" once hero assets land. **This blocks Gate 3 for both launch scenes** — the
coastal lab reports `coastShadowPass` as `Boolean(runtime.shadowPass)`, which is true whenever
the object exists and therefore does not detect this.

Measured cost, S01 plate, parity metric: shadows on 26.3% detailOcc / 4.7% flat / shadow hue
244deg; shadows off 26.6% / 3.3% / 227deg. The pass is not currently buying image quality — it is
buying a global multiply.

**Update 2026-08-15 (lighting/renderer owner).** Re-measured on the live coastal scene: the pass
**does** run and **does** publish a usable map — `shadowPass.renderCount` 223, `ready` true,
`farReady` true, with `Lighting System Sun` found as the caster light. Cast shadows are present and
land in the geometrically correct place; verified against CPU ray-traced ground truth under D19-062
(94/101 agreement, zero false shadows). The "empty depth map" diagnosis above no longer reproduces
and should not be carried forward. What was true and is now fixed is the **detection**:

- `environmentSunShadowPass` gains a real `health` getter — `{ ok, ready, renderCount, casterCount,
  hiddenNonCasterCount, farReady, sunName, reason }`. `ok` requires a published map *and* at least
  one caster mesh actually drawn into it; `reason` names the failure ("no visible DirectionalLight
  with castShadow in the scene", "no visible castShadow mesh was drawn into the map", ...).
- `createSceneStyleRuntime`'s inspector diagnostic `shadows.sharedPass` was
  `Boolean(shadowPass?.shadowTexture)` — true from the moment the pass allocated a target. It is now
  `shadowPass.health.ok`, with the full `shadows.sharedPassHealth` object beside it. A scene that
  renders with no shadows can no longer report healthy shadows.

Hosts gating a review on shadows (the coastal lab's `data-coast-shadow-pass`, written as
`Boolean(world.runtime.shadowPass)`) must read `runtime.shadowPass.health.ok` instead. That host-side
line is a scene edit and is left to the scene owner.

### D19-042 · Warm-up frames throw out of the animation loop, permanently — RECORDED · S2 silent-wrong
**Area:** environment / post · `src/environment/environmentSunShadowPass.js`, `src/post/postProcessing.js`

On a hot-reloaded page the first ~8 rendered frames threw
`TypeError: Cannot read properties of null (reading 'isTexture')` out of
`post.render(delta)`. Because the throw escapes the `renderer.setAnimationLoop` callback, the
loop stops and the page freezes on whatever frame last succeeded — with a fully built,
apparently healthy scene and a stale image. Clean loads do not reproduce it, which makes it
exactly the kind of failure that ships.

Same family as D19-026 (WebGPU throwing on materials holding undecoded textures), but here the
texture is `null` rather than undecoded, and the lazily allocated render targets of the
sun-shadow and god-ray passes are the likely source. Worked around in
`labs/launch-world/city/main.js` by catching only within the first 12 frames and re-throwing
after — the window is reported on `document.body.dataset.cityWarmupError` rather than hidden.

### D19-043 · Scene exposure cannot be authored by the consumer — RECORDED · S2 silent-wrong
**Area:** lighting / post · `src/lighting/lightingSystem.js:509`, `src/post/postProcessing.js:363`

The analysis's §5.1 requirement is >= 3 *separated* luminance plateaus in the Gate 2 grayscale
still. Measured on the S01 plate, the three modal plateaus sit at **0.59 / 0.75 / 0.78** — two of
them 0.03 apart — against `01-city-street-vehicles.png`'s **0.12 / 0.22 / 0.34**. The launch
plate is roughly a stop and a half hot and its value structure is correspondingly compressed.

Neither documented exposure control moves it:

- `createSceneStyleRuntime({ rendererConfiguration: { toneMappingExposure } })` is accepted and
  then silently overwritten — `lightingSystem` writes `renderer.toneMappingExposure = frame.exposure`
  from the bundle's day curve every frame, and its own header declares that ownership.
- `post.setSettings({ parameters: { exposure } })` after `runtime.apply(...)` also has no
  measurable effect on the plate (the bundle's post settings are re-applied under
  `watch: true`).

So the only reachable lever is re-authoring `CALL_ME_SENSEI_STYLE_BUNDLE.lighting.exposure`,
which is a global look change affecting both launch scenes and every consumer of the bundle.
There should be a per-scene exposure offset that the lighting system composes with its day curve
rather than overwrites. Assigned to look-dev, not to scene assembly.

### D19-044 · Window glazing sat proud of its frame and had no reveal — FIXED · S2
**Area:** buildinggen · `src/buildinggen/buildingMesh.js`

`buildWallsAndFacades` drew the window frame 0.06 m deep and the glass pane **0.08 m** deep, both
centred on the same point — so the glass protruded 0.01 m past the frame on the outward face and
there was no reveal at all. §4 requires "modeled recesses" and §13 rejects "paper-thin glazing or
no interior depth"; a proud pane is the opposite of both, and it is the single most-repeated
element in any facade.

Fixed: the frame is now 0.13 m deep, the pane 0.05 m, and the pane is pushed inward along the
wall normal so it sits entirely behind the frame's outer face — a 0.135 m reveal with real glass
thickness. Triangle counts and draw calls are unchanged; `verify:buildinggen` passes, including
the 1000-seed invariant suite and both determinism checks.

### D19-045 · Window glass colour was hard-coded — FIXED · S2
**Area:** buildinggen · `src/buildinggen/buildingMesh.js`, `src/buildinggen/buildingSettings.js`

Glazing was a module constant `[0.22, 0.31, 0.38]`. Every other material role on a building is
authorable through `palette`; glass was not, which makes warm lit interiors, tinted curtain wall
and night windows unreachable. §10.1 asks specifically for "warm interior pools against a bright
cool exterior" and there was no way to express it.

Fixed: `palette.glass` added to `DEFAULT_BUILDING_SETTINGS` and to the field schema, defaulting
to the exact previous constant, so every existing recipe, preset and thumbnail is byte-identical.
`verify:buildinggen` passes.

---

## Appended 2026-08-15 — rocks/cliffs continuation pass

> **ID note:** D19-031…036 above and D19-050…060 are both taken, so this block starts at
> **D19-070** to leave headroom for the workstreams still appending concurrently.

Continuation of the cliff re-selection pass. Evidence:
`launch-plan/review/captures/rocks/` (20 captures + `manifest.json`, all regenerated this
pass), `launch-plan/review/cliff-asset-reselection.md`.

**Reproducibility check.** Re-running `scripts/capture-rock-gate1.mjs` against unchanged code
reproduced all 20 captures **byte-identically**. The rock evidence is deterministic, so a
future diff in these files means a real render change, not capture noise.

### D19-070 · The D19-010 integrity guard broke `verify:rock-shader` · **S1** · **FIXED**
**Area:** rock shader · `scripts/verify-rock-shader.mjs`

The runtime half of D19-010 rejects detail maps below 16x16 (`MIN_DETAIL_MAP_EDGE_TEXELS`).
The existing "optional asset channels" check built its `sourceNormal` fixture as a **1x1**
`DataTexture`, so the guard correctly dropped it and the check failed
(`retainedSourceTextures` 2 !== 3). `npm run verify:rock-shader` was red on the branch.

The fixture was incidental, not intentional — nothing in that check is about 1x1 normals —
so the *test* was wrong once the guard landed, and lowering the threshold would have
re-admitted the 4x4 catalog placeholder the guard exists to reject.

**FIXED:** the fixture is now a 16x16 normal (the smallest the guard accepts), which restores
`retainedSourceTextures: 3` and `sourceTextureCount: 3` coherently. The guard itself was
untested, so a dedicated check was added — a 4x4 placeholder at the exact resolution the
catalog ships is asserted to be rejected with slot and `4x4` resolution reported, and a 16x16
map is asserted to survive. `verify:rock-shader` now passes 10 checks; `verify:types` passes.

### D19-071 · `describeCatalogLicense` reported a rejected license as `approved` · **S2** · **FIXED**
**Area:** asset-policy · `src/asset-policy/catalogLicenses.js`

The classifier returned `state: policy ? 'approved' : 'unrecognized'`, so **any** license
present in the registry was reported `approved` — including one reviewed and explicitly
refused. `assertCatalogLicenseRelease` has an `if (!policy.approved)` branch, which proves the
registry is meant to hold rejected policies, so the two disagreed. A caller branching on
`state === 'approved'` to skip the assert would have shipped an asset the review rejected.

Latent today only because every current registry entry is approved — it fails open the moment
a refused license is added, which is exactly when it matters.

**FIXED:** `not-approved` is now a distinct state from `unrecognized`, derived from
`policy.approved`, with the JSDoc contract and the reasoning recorded at the call site.
No production caller existed (the symbol is exported via `src/asset-policy/index.js` but
unused), so no consumer changed.

### D19-072 · The Gate 1 capture script crashed on a context-destruction race · **S2** · **FIXED**
**Area:** review tooling · `scripts/capture-rock-gate1.mjs`

The lab re-bootstraps on a query-string change, so a late reload could destroy the execution
context between `page.screenshot()` and the `page.evaluate()` that reads the report —
`"Execution context was destroyed"`, killing the whole run partway and leaving the evidence
directory half-updated. Intermittent: the same command succeeded and then failed on shot 1.

**FIXED:** the two dataset reads are now one atomic `evaluate`, retried up to three times with
a re-settle in between, and a missing `rockReport` now fails with the shot name instead of a
bare `JSON.parse` stack. A partial evidence set is worse than a failed run, because it looks
complete.

### D19-073 · Moss and tint A/B evidence was captured where the effect is invisible · **S3** · **FIXED**
**Area:** review evidence · `scripts/capture-rock-gate1.mjs`

Both A/B pairs were shot on the **trio** view. Harmonization only moves ROCK-COAST-02 (the
other two are already at the weathered-limestone anchor), and moss lands on upward ledges, so
averaging three rocks across a wide frame diluted the one real change. Measured on the old
pairs: tint `mean|d| 0.90`, `4.5%` of pixels changed; moss `mean|d| 0.61`, `2.7%` changed.
Neither supported the claim it was filed as evidence for.

A second symptom: `ab-moss-on`, `ab-tint-harmonized` and `trio-call_me_sensei` were **three
byte-identical files** (`d592a9cc…`), because all three were the same default trio render.
Legitimate, but it reads as duplicated evidence under review.

**FIXED:** each A/B is now shot on the asset it actually affects, at hero framing — moss on
ROCK-COAST-03 (`mossCoverage: 1`, and the asset that shares an albedo with ROCK-COAST-01),
tint on ROCK-COAST-02. Tint separation improved to `mean|d| 3.50` / `18.4%` of pixels; moss
peak delta rose from 21 to **141** where it lands. The two remaining byte-identical pairs are
now correct by construction — an A/B "on" state *is* that asset's shipped hero.

### D19-074 · Both cliff geologies resolve to the same normal-map bytes · **S3** · **RECORDED** — extends D19-010
**Area:** rock textures · `assets-local/rock-textures/`

`rock-weathered-limestone-normal.png` and `rock-sharp-karst-normal.png` are **byte-identical**
(`34fa2954…`), as are `rock-alpine-granite-normal.png` and `rock-blocky-granite-normal.png`
(`77f21fb2…`) — four distinct normals across six geologies. Since the §6.3 set is two
limestone plus one karst, **all three rocks share one normal map**, and ROCK-COAST-01/03 share
their albedo as well (D19-033).

This does not read as repetition in the shipped frames — the rock shader projects world-space
triplanar, so no two placements sample the same region — but it means per-asset surface
variety rests entirely on geometry, moss and the per-variation generated maps, with no
authored texture separation underneath. Measured moss coverage at the set's maximum
(`mossCoverage: 1`) changes only ~2.5% of a hero frame, so it is a genuine but thin
differentiator.

**Suggested fix:** publish real per-geology normals; a karst normal that is not a copy of the
limestone one is the single highest-value texture the rock catalog could ship.

### Non-deficiency changes landed this pass

- **`labs/rock-gate1/rockSet.js` -> `labs/shared/azureHeadlandRocks.js`.** The coastal scene
  needs the same completion layer as the Gate 1 lab, and a launch-world scene importing from a
  review lab is the wrong dependency direction. Behaviour-neutral: all 20 captures reproduced
  byte-identically after the move. Importers updated in `labs/rock-gate1/main.js` and
  `scripts/capture-rock-gate1.mjs`.
- **`labs/launch-world/coast/props.js`** imported the module at its old path and was broken by
  that move; repointed to `../../shared/azureHeadlandRocks.js`.
- **`labs/launch-world/coast/scene.js`** — the `INTEGRATION: ROCK-COAST-*` stub still named the
  **rejected** `rock-0169`/`rock-0449`/`rock-0460`. Corrected to the amended set and rewritten
  to state that `resolveRockSurface()` is not optional, since a bare
  `loadOfficialCatalogAsset` renders flat, mossless stone (D19-010/D19-012).

---

## Appended 2026-08-15 — §9 Texture Lab material-set, second pass (bring every material to benchmark)

> Continues the §9 texture workstream. The first pass reported four of ten materials at
> benchmark; this pass fixes the rest. Where a deficiency stood between a material and the
> Ananta bar, it was **fixed in `src/`** per the standing direction at the top of this file
> rather than worked around. IDs continue at **D19-075**; if another workstream claimed
> these concurrently, renumber these three, not theirs.

### D19-053 · Pattern `scale` caps at 64, setting a floor on feature size per tile · **S4** · **FIXED**
**Area:** texgen · `src/texgen/textureSettings.js`, `src/texgen/textureGenerators.js`

Raised the caps that set the floor on feature size relative to the world tile:

| Field | Was | Now | What it unblocks |
| --- | ---: | ---: | --- |
| `scale` | 64 | **256** | 1 cm detail on a 2 m tile (was 3.1 cm) |
| `columns` / `rows` | 64 (48 on hex/basketWeave/scales) | **256** | module counts that match real construction |
| `rings` | 32 (24 on marble) | **128** | plank cathedral figure at board pitch |
| `jitterScale` | 64 | **256** | painterly drift finer than the base pattern |
| `stretchX` / `stretchY` | 0.25 – 8 | **0.125 – 16** | 8:1 modules — a 1.6 m deck board in a 200 mm run |

The generator clamps in `textureGenerators.js` were raised to match, including
`jointAspect()` so an 8:1 module still carries an even world-space joint. Nothing in the
noise or cellular path allocates per period (`noise2.js` is pure lattice hashing), so the
change is O(1) in cost.

**Proof it is non-breaking.** All 69 shipped presets were scanned for authored values
outside the *old* ranges: **zero**. Raising a clamp can only change a result that was
previously being clamped, so no shipped preset moves. `npm run verify:texgen` passes.

**What it bought in the set.** MAT-CITY-04 asphalt moved back from its forced 1.5 m tile to
**2.5 m** — the same physical 3.8 cm aggregate now expressed at `scale: 66` instead of 40 —
which is 40 % fewer repeats across the S01 roadway at 16.38 px/cm (still 1.60x over the hero
bar). MAT-CITY-01 façade concrete gained a 1.4 cm speckle layer (`scale: 140`) that the old
cap put at 3.1 cm minimum. MAT-COAST-01 decking went from 800 mm boards to **1.2 m** boards
because the stretch clamp moved; at 4:1 it read as floor tile.

### D19-057 · Per-module tint variety equals the module count in one tile · **S2** · **FIXED** (bounded part remains)
**Area:** texgen · `src/texgen/evaluateTexture.js`, `src/texgen/textureSettings.js`

Two separate problems were bundled under this entry, and only one of them is inherent.

**Inherent and unfixable:** a periodic tile can only hold `columns * rows` distinct cell
ids. That is what periodicity *means*; hashing an unwrapped lattice index (the original
suggested fix) would break tiling. The lever is more modules per tile, which D19-053 now
makes affordable, plus per-instance variation at bind time, which no single tile can supply.

**Fixed:** the tints were also far less various than the count implied. The legacy path read
hue from `baseCell & 0xffff` and value from `(baseCell >>> 8) & 0xffff` — two overlapping
16-bit slices of the *same* hash — so a cell's hue was correlated with its brightness, and
every cell was a perfectly **flat** swatch because the per-cell draw *replaced* the painterly
drift instead of riding on it. Sixteen pavers therefore read as sixteen flat, hue-locked
patches, which is a stronger repetition cue than sixteen ids would suggest.

New schema field **`color.jitterCellVariety`** (0–1, default **0**): above zero, hue and
value come from independent salted 32-bit hashes (`cellUnit()`), and the painterly drift
keeps running inside each cell at `variety * 0.6` of the jitter amount, so modules stop
being flat. At the default of 0 both branches take the legacy code path unchanged, so the
17 shipped presets that use `jitterCells` are byte-identical.

Applied at 0.55 on MAT-CITY-03 pavers, 0.5 on MAT-CITY-05 glazed tile and 0.6 on
MAT-COAST-01 decking — the three module-based materials in the set.

### D19-059 · Style-label roles and manufactured material roles are two disconnected vocabularies · **S2** · **PARTLY FIXED**
**Area:** styles / environment

The first pass's follow-up measurement — semantic roles applied correctly, frame still
identical to concrete — was accurate but stopped one layer short of the cause. See D19-075:
the manifest *does* reach the shader; the shader profile it selected was throwing the albedo
away. With that fixed, `metal` / `brushed` now renders visibly differently from `mineral` /
`raw` in the same stage under the same key, so §4's "read differently at a glance" is
satisfiable for metals through this path.

The vocabulary split itself stands **RECORDED**: `createStyleMaterialContract` still carries
no `baseMaterial`/`finish`/`renderMode`, and the ordering requirement is still undiscoverable.

### D19-075 · The `bareMetal` Manufactured Surface profile discards the authored albedo entirely · **S1** · **FIXED**
**Area:** environment / manufactured surface · `src/environment/urbanPropMaterial.js`

`resolveUrbanMaterialProfile()` sends every bare-metal finish — `raw`, `polished`,
**`brushed`**, `anodized`, `mirror` — to the `bareMetal` surface profile, which is defined
with `sourceHueAuthorityScale: 0`, `sourceValueAuthorityScale: 0` and `roleColorMix: 1`. Both
authority scales are compiled into the shader as literal `0.0` multipliers on the mixes that
would let the source map steer paint hue and paint value, so the surface is painted from the
`bareMetalColor` control (`0x788087`) and the authored albedo contributes nothing but its
normal and roughness. `wearScale: 0.95` and `sharpRustBoost: 3.2` then add scrapyard rust on
top.

That is a defensible signature look for an untextured or scanned prop. It is silently wrong
for an authored map: MAT-CITY-06 is a 2048 px brushed-stainless albedo with a 0.19–0.97 value
range, and every bit of that structure was discarded before it reached the frame. The
material was reported "not at benchmark, and the reason is not the texture" — correct, but
the reason was not metalness either.

**FIXED** by giving `brushed` its own profile rather than changing `bareMetal`:
`SURFACE_PROFILES.brushedMetal` keeps the metal response (role hue, `fresnelScale: 0.55`,
`planarSheenScale` raised to 0.5, low `lightValueCap`) and turns `sourceValueAuthorityScale`
back to 1 so the authored brush drives paint value, with `wearScale` 0.95 → 0.45 and
`sharpRustBoost` 3.2 → 0.5. `raw` / `polished` / `anodized` / `mirror` still resolve to
`bareMetal` unchanged, so no existing asset moves unless it is explicitly classified
`finish: 'brushed'` — which today produces the wrong result anyway.

**Suggested follow-up:** the general form is that any profile with zero source authority
should say so, or should fall back to honouring the map when one is bound. An author has no
way to discover that their albedo is being ignored.

### D19-076 · The `finish` axis of the manufactured material contract had no effect in the shipped signature style · **S2** · **FIXED**
**Area:** environment · `src/environment/environmentPresets.js` (`call_me_sensei.materialLook`)

`MANUFACTURED_MATERIAL_FINISHES` has ten members and
`validateManufacturedMaterialManifest` enforces them, but the shipped `call_me_sensei`
`materialLook` declared profiles for `baseMaterials`, `contentFlags`, `objectClasses` and
`structuralRoles` — and an **empty** `finishes` table. Through the environment-adapter path a
brushed panel, a glazed tile and a raw concrete wall with the same base material therefore
resolved to identical shader parameters. The finish was validated, stored on the material,
and then dropped.

**FIXED:** ten sparse finish profiles added, ordered so a finish refines its base rather than
fighting it (resolution order is `baseMaterials` → `finishes`). `brushed` gets a broad
smeared highlight plus a real `skyTintStrength: 0.34` pickup — the cool skylight in the
mid-tones is what says "metal" in an anime frame, since the toon shader has no metalness
input; `painted` sits at `specularStrength: 0.14` so powder coat separates from bare metal at
a glance; `raw`/`matte` sit near zero. `npm run verify:manufactured-materials` passes.

### D19-077 · `manufactured.surface` and the environment adapter resolve material response through two unrelated tables · **S2** · **RECORDED**
**Area:** styles / environment · `src/styles/styleAdapters.js:40` vs `src/environment/environmentMaterialAdapter.js:338`

The same `urbanMaterial` classification drives two completely separate response systems:

- `applyStyleBundle` on a `manufactured.surface` target → `applyManufacturedSurface` →
  `classifyUrbanPropSurface` → `SURFACE_PROFILES` in `urbanPropMaterial.js` (compile-time
  literals baked into the shader string).
- `applyEnvironmentShader` → `environmentMaterialAdapter` → `resolveManufacturedMaterialLook`
  → the preset's `materialLook` (runtime uniform patches).

Neither consults the other. Measured: adding a full `finishes` table to the `call_me_sensei`
`materialLook` (D19-076) produced a **byte-identical** proof frame — 1 345 772 bytes before
and after — because the proof stage goes through the style-bundle path, which never reads
`materialLook`. Authoring a look for a classification therefore requires knowing which of the
two paths a given scene happens to use, and the same classification can legitimately look
different in each.

**Suggested fix:** one resolution table consulted by both adapters, or `materialLook` as the
authored layer and `SURFACE_PROFILES` as its built-in defaults.

### D19-060 · `stretchX` produces vertical features and `stretchY` horizontal ones · **S5** · **FIXED**
**Area:** texgen · `src/texgen/textureSettings.js`

Relabelled to a frequency framing, which is what the code actually does, with zero behaviour
change: `stretchX` → **"X frequency"**, *"Multiplies feature periods across U. Higher = finer
in U, so features elongate along V and read as VERTICAL streaks"*, and the mirror for
`stretchY`. The grid-pattern overload (on `bricks`/`tiles`/`grid` the same fields scale joint
width per axis instead) is now stated in both descriptions.

This was a live cost, not a papercut: MAT-CITY-06 was authored from the old description with
`stretchX: 8` and came out brushed **vertically** on a service door. It is now `stretchX:
0.125, stretchY: 16` and brushed horizontally.

### D19-046 · Ground splat masks bled grass across the roadway — FIXED (scene-side) · S2
**Area:** ground-shader / scene authoring · `src/ground-shader/`, `src/landscape/landscapeSettings.js:32-37`

Two separate traps, both hit while authoring the city ground plate. Recorded together because
any scene that mixes a natural surface with a manufactured one will hit both.

**1. Mask bleed.** The promenade splat painted its "planted verge" bands from a distance-band
function — `min(|‖x‖ − 15|/4, |‖z − 8.5‖ − 12|/4)` — which has no concept of the surfaces it
crosses, so it evaluated happily over the carriageway and put grass down the middle of the road.
§6.2 forbids exactly that ("no grass on pavement, building footprints"). Masks must be authored
as **role predicates with explicit exclusion** (`isRoad(x, z) → 0`), never as a distance band.
Fixed by reducing the plate to a single channel and modeling the street surfaces as geometry.

Not a code defect — but the ground shader gives a caller no way to *declare* an exclusion, and
the four splat channels are fixed and semantic-free (R grass, G dirt, B rock, A sand), so
"promenade", "wet sand" and "roadway" all have to be smuggled into one of the four. That is the
same gap FILL-005 / D19-022 already record; this is a second, independent instance of it biting.

**2. Projection scale is landscape-scale.** The `call_me_sensei` ground preset ships
`grassScale 16, dirtScale 13, rockScale 25`. At street scale the stone layer renders as a
**boulder field**, not paving — it needed `rockScale 2.1` to read as aggregate. The preset is
authored for terrain seen from tens of metres up and there is nothing in its description saying
so. Any scene with a camera closer than ~15 m needs to re-author the projection scales, and
should be told that.

### D19-047 · `shadowHue` cannot be measured without cast shadows — **UNBLOCKED** · S2 method
**Area:** review method · companion to D19-041

Recorded so the coastal owner does not repeat the search. The parity metric's `shadowHue` is the
mean hue of the darkest luminance quartile of the lower two-thirds. In a frame with **no cast
shadows** that quartile is not shadow — it is mid-tone sunlit geometry — so the metric returns
the *sun's* hue and no amount of palette work moves it.

Measured on the city plate, `shadowHue` held at **26–28°** across: a full exposure sweep
(0.30 → 0.52, which also made saturation worse as ACES came off its shoulder), a global chroma
scale of 0.72 with a cool bias, `aoWarmth` dropped 0.5 → 0.1, and a twelve-family palette
re-authored cool. Overlaying the sampled quartile as a mask showed it landing on window mullions
and reveals across every **sunlit** facade, never on a shadow.

Consequence: the §5.2 shadow-family gates (city 250–270°, coast 320–335°) are **blocked behind
D19-041** and are not achievable by look-dev alone. Also: `shadowPass.inspectDepthContent()` is
not a diagnostic for this — its sample points derive from caster *style targets*, so an
unlabelled scene always reports `sampleCount: 0` regardless of what the depth map contains.

**Update 2026-08-15 (lighting/renderer owner).** The precondition is met: cast shadows do render
and are geometrically correct (see the D19-041 update — `renderCount` 223, `ready` true, verified
against CPU ray-traced ground truth). `shadowHue` is therefore **measurable now** and the §5.2
gates are no longer blocked on the shadow pass. Two caveats for whoever measures it:

- Before D19-062's `shadowFill` is adopted, the darkest quartile of a styled frame is
  *fully* unlit ToonLab surface lit only by the SH probe, so `shadowHue` will read the probe's own
  hue (R:G:B 1 : 2.24 : 5.33 before its `#c3dfff` tint — roughly 220-225°) rather than a composed
  shadow colour. That is a real reading, not an artefact, but it measures the probe, not the look.
- `inspectDepthContent()` still needs labelled caster style targets; use
  `shadowPass.health` for a label-free liveness check.

### Stand-down note — Nova Promenade city scene, 2026-08-15
The city scene was cancelled (it demonstrated generated architecture, the one asset class
ToonLab does not own, while exercising almost none of the product). D19-037…D19-047 above were
all found during that work and remain valid; D19-040, D19-041, D19-043, D19-046 and D19-047
apply directly to the coastal scene. Full handover, including the `buildinggen`/`villagegen`
capability survey and the transferable findings, is at
`launch-plan/review/city-scene-standdown.md`.

### D19-075 · Catalog rock geometry facets visibly at close framing · **S1** · **FIXED (src)**
**Area:** rock shader · `src/rock-shader/rockGeometryDetail.js` (new), `rockShaderRuntime.js`

Published cliff assets are 1,586-4,006 triangles. That is ample at mid distance and visibly
faceted at shot S08's 85 mm framing: dead-straight silhouette edges and broad planar spans
that **no normal map can break up**, because the geometry genuinely is flat there. §4's
camera-ready-detail bar and §13's faceting criterion both fail, and §16 forbids reframing to
hide it. Swapping assets does not help — 4,006 was already the densest `cliff-corner` member.

**FIXED (src):** a new public module adds the missing geometry at load time — midpoint
subdivision, then displacement along the interpolated normal by a value-noise fBm evaluated
in the mesh's own local space. Opt-in via `applyRockShader(root, settings, { detail })`, and
reported on `report.geometryDetail` because it multiplies triangles by 4^subdivisions.

Two implementation decisions, because the obvious routes are both wrong:

- **Normals are not recomputed.** Subdivision output is non-indexed, so
  `computeVertexNormals()` yields flat per-face normals and makes faceting *worse*. Welding
  by position instead over-smooths — a rock's crisp arris edges are load-bearing in the
  stylized read, and averaging across them rounds the asset into a pebble. The original
  normals are interpolated through subdivision and then perturbed by the **gradient of the
  same height field** that moved the vertices, so shading tracks the new surface while every
  authored hard edge survives.
- **Local space, not world.** A rock's surface must not swim when the scene moves it, and
  keying the field to `variation` is what makes the displacement a per-asset lever (D19-074).

**Measured on ROCK-COAST-01 at S08's framing** (`s08-detail-off.png` vs `s08-detail-on.png`):
mean edge energy **+31.7%**, 53.9% of pixels changed, peak delta 116. For comparison the
detail-normal wiring moved 17.5% of pixels. Straight silhouette edges now read as eroded.

**Tuning is narrow and was swept, not guessed.** At `amount: 0.055` the edges soften but the
faces stay planar; at `0.16` / `scale 0.40` the asset turns to lumpy wax and the stylized
arris is gone. Shipped default `amount: 0.1`, `scale: 0.65`, `subdivisions: 2` (16x
triangles) — which resolves this feature scale nearly as well as `3` (64x) at a quarter the
cost. Subdivisions 3 is reserved for a hero close-up; S08 uses it.

Hidden meshes are skipped: catalog artifacts pack every LOD as a sibling node and the
consumer hides all but LOD0, so subdividing the rest tripled the cost for geometry never
drawn (measured 3 meshes / 7,010 tris before the skip, 1 mesh / 3,292 after).

`verify:rock-shader` passes 10 checks. The module carries explicit JSDoc contracts so it
generates an **exact** type declaration rather than a permissive fallback.

### D19-090 · `verify:types` is red on the branch, from `src/renderer/` · **S2** · **RECORDED (not mine)**

> **ID note:** first filed as D19-076, which collided with the §9 texture owner's `finish`-axis
> entry at line ~1467. Renumbered to D19-090; 070-075 in this pass are unaffected. Five
> workstreams are appending concurrently — pick from 090+ next.
**Area:** build · `types/renderer/styleComparison.d.ts`

`verify:types` fails `permissive declaration fallback count must not regress` (72 -> 73).
Isolated: the single new permissive declaration is **`types/renderer/styleComparison.d.ts`**,
regressed by in-flight uncommitted work in `src/renderer/`. It is not from the rock pass —
`types/rock-shader/rockGeometryDetail.d.ts` generates as an exact contract, and
`rockShaderRuntime.d.ts`/`rockMaterial.d.ts` were already fallbacks before this pass.

Recorded rather than fixed because it belongs to another owner's active work. Flagged so the
red build is not mistaken for the rock changes.

**Note on generated types.** `types/*.d.ts` is build output regenerated wholesale by
`npm run types:build`; running it during this pass necessarily picked up other workstreams'
in-flight `src/` changes. Whoever lands first owns the regenerated file set.

### D19-074 update · displacement is now the second per-asset variation lever

D19-074 recorded that all three §6.3 rocks share one normal map and that ROCK-COAST-01/03
share an albedo, leaving moss (~2.5% of a hero frame) as the only differentiator. Local-space
displacement keyed to `variation` now separates them **geometrically**: measured max vertex
delta between variation 0 and variation 2 is **0.088 m** (mean 0.014 m) at the shipped
`amount: 0.1`. Two rocks of the same geology no longer carry the same relief, which is a
stronger separation than the shared texture maps could ever provide. The data-side fix
(publish real per-geology normals) remains open.

### D19-061 · Water detail normals alias into a fixed screen-space weave past ~100 m — FIXED · S2
**Area:** water · `src/shaders-tsl/water.js:562-575`

`detailFade = smoothstep(16, 60, viewDistance).oneMinus()` fades the procedural ripple normals to a
**20% floor** and holds them there to infinity. On a lake that is invisible. On a 400 m coastal tile
seen at a grazing angle it is not: past ~100 m the fbm period falls well below one texel, so the
residual 20% stops reading as water and starts reading as a regular weave fixed in screen space that
crawls as the camera moves. Measured on `coast-pass1.png`, where it covers the entire ocean from the
shore to the horizon — an automatic §13 rejection ("repeated pattern obvious in the hero frame").

Fixed by adding a second, longer fade — `horizonFade = smoothstep(100, 360, viewDistance).oneMinus()`
— multiplying the detail strength down to a 10% floor across 100–360 m. Nothing inside 100 m changes
by any amount, so no existing lake/river/pond scene moves.

### D19-005 · `reflectionStrength` and `detailNormalStrength` are inert under `colorTone: 'anime'` — FIXED · S2 silent-wrong

A colour tone documented itself as forcing its **palette**, and then also force-applied seven
non-colour scalars — `detailNormalStrength`, `depthFadeDistance`, `deepFadeDistance`,
`causticsStrength`, `fresnelBias`, `reflectionStrength`, `reflectionSoftness` — over any explicit
caller value, via `tone.X ?? source.X`. Two consequences:

- §6.4 of the production plan asks for `reflectionStrength: 0.46` and `detailNormalStrength: 0.38`
  alongside `colorTone: 'anime'`. Both were silently discarded. They happened to equal the tone's own
  values, so nothing looked wrong — but no other value was reachable.
- More seriously, `depthFadeDistance`/`deepFadeDistance` are **clarity distances**, not palette. The
  `anime` tone ships 1.8 m / 4.2 m, tuned for a lake. On a coastal shelf that puts the entire
  shallow→mid→deep gradient inside the first 40 m offshore, so a bay renders as one flat mid-blue
  from the shore to the horizon and §10.2's "luminous turquoise-to-deep-blue" is unreachable **by
  construction**. This was the single largest contributor to the coastal water failing pass 1.

Fixed in `src/water/waterSettings.js` with a `toneScalar(key)` helper: an explicit caller value now
wins over the tone for the seven scalars; the four **colours** (`shallowColor`, `midColor`,
`deepColor`, `fresnelColor`) remain tone-forced, which is the documented contract. A caller that
passes nothing resolves to exactly the previous values, so no existing scene moves.

### D19-062 · Styled-scene ToonLab surfaces lose their whole sun term where the package shadow pass occludes them — **FIXED (library capability) + REDIAGNOSED** · S1 blocking
**Area:** environment / lighting · `src/environment/toonLabSurfaceLighting.js:244-290`,
`src/environment/environmentSunShadowPass.js`, `src/styles/sceneStyleRuntime.js`

**Original symptom stands, the original diagnosis does not.** Every catalog rock in a
`createSceneStyleRuntime` scene renders as a flat, saturated navy slab with no readable stone
surface, while the same assets render correctly in `labs/rock-gate1/`. Reproduced headlessly at
1600x900 in `launch-plan/review/captures/lighting/before-hero.png`.

**Minimal reproduction, and it is NOT scale.** `labs/d19062-probe/` builds one catalog rock
(`rock-0119`, the same `resolveRockSurface()` settings and textures rock-gate1 uses) in a ~12 m
scene, under two rigs selected by `?mode=plain|styled`. `?mode=styled` reproduces the defect
exactly in a *small* world, which rules out the "works small, fails large" hypothesis raised
against D19-041. `labs/d19062-probe/probe.mjs` prints measured patch colour for both;
`coast-diag.mjs` dumps the live coastal scene's lighting state.

Measured on the rock's centre patch (sRGB 0-255 mean / brightest):

| Rig | mean | brightest |
| --- | --- | --- |
| `?mode=plain` (rock-gate1 rig) | 91, 97, 93 | 140, 140, 126 |
| `?mode=styled` | **42, 58, 97** | **43, 60, 103** |
| `?mode=styled&cast=0` (rock is not a shadow caster) | 57, 71, 105 | **192, 190, 182** |
| `?mode=styled&sunshadow=0` (sun-shadow pass never runs) | 57, 71, 105 | **192, 190, 182** |

So the discriminator is not the styled *rig* and not `installToonLabSurfaceLighting`: it is
whether the object is a **shadow caster** while the package sun-shadow pass is live. Both
backends agree (WebGPU 42,58,97 / WebGL2 fallback 42,59,98).

**The sun-shadow pass is correct.** Instrumented `pass.nearShadowTarget` (new getter) and compared,
per fragment, the depth the receiver computes against the depth the pass wrote:

- A flat double-sided caster agrees to **0.0007 of normalized depth** (~0.1 m over a 140 m range).
- A sphere caster agrees to **0.00002 median**, 2.3% occluded — no false self-shadow.
- Against **CPU ray-traced ground truth** (cast a ray from each sampled fragment to the sun and
  test it against the rock), the map and the rays agree on **94 of 101** samples with **zero false
  shadows**; the 7 disagreements are all the map being *permissive*. Ground truth says **96% of the
  camera-facing rock surface is genuinely occluded by the rock's own upper mass.**

The y-flip in `applyShadowClipAdjust` is also correct: removing it lights the rock but detaches its
cast shadow and throws it ~15 m across the ground
(`d19062-sunshadow-mask.png` shows the raw mask; the un-flipped variant was captured and rejected).

**Actual root cause — three things, none of them a broken `directDiffuse`:**

1. **The sun is behind the subject** (D19-064). The camera-facing faces are the shadow side, so
   `nDotL` is legitimately 0 on much of what the frame sees.
2. **Where `nDotL > 0`, the package sun-shadow pass correctly reports occlusion** — a 5.9 m cliff
   corner shadows its own lower two thirds at a 47 deg sun.
3. **`ToonLabSurfaceLightingModel.direct()` multiplied that hard 0/1 mask into the direct term raw,
   with no authored strength** — and a Call Me Sensei rig has *no ambient light at all*
   (`Lighting System Ambient` is intensity 0 and `visible: false`, confirmed live in both the probe
   and the coastal scene). The only remaining light is the SH sky probe, whose measured radiance is
   R:G:B = **1 : 2.24 : 5.33** before its `#c3dfff` tint. An occluded ToonLab surface therefore
   receives *nothing but strongly blue light* and collapses to flat navy with no value structure.

Point 3 is the same mechanism as **D19-040**, in the converted-material path: the environment node
material has always had `shadowLift`/`ambientStrength`; this bridge had neither.

**Fix (library).** `installToonLabSurfaceLighting(material, { shadowFill, shadowFillTint })` — an
authored, tintable fraction of the sun retained where the shadow pass reports occlusion:

```js
sharedSunVisibility = mix(shadowFill * shadowFillTint, 1, rawSunVisibility)
```

`shadowFill` defaults to **0**, so every existing caller resolves to the previous expression
**byte-identically** — verified: with the fix in place and `shadowFill` unset the probe still
measures 42, 58, 97 / 43, 60, 103, the exact pre-change numbers. It is recorded on
`material.userData.toonLabSurfaceLighting` and named in `TOONLAB_SURFACE_LIGHTING_CONTRACT`, so the
deviation from the TOONLAB literal BRDF is declared rather than hidden.

At `shadowFill: 0.35` the same patch measures **50, 65, 100 mean / 122, 124, 137 brightest** — the
occluded ledges recover a readable stone value, and the cast shadow on the ground lifts out of
crushed navy into the mid plateau §5.1 asks for. Before/after at identical framing:
`launch-plan/review/captures/lighting/d19062-styled-before.png`,
`d19062-styled-after-shadowfill.png`, with `d19062-plain-reference.png` as the rock-gate1 control.

**What `shadowFill` does NOT fix, deliberately.** Faces with `nDotL <= 0` are not occluded, they are
turned away — no shadow term can reach them. Those stay on the blue probe until either the scene
puts the sun somewhere useful (D19-064) or the surface authors `skyFillTint` away from neutral. The
library lever for that already exists (`indirectTint` / the rock profile's `skyFillTint`); choosing
its value is art direction and belongs to look-dev, not here.

**Adoption.** One line where the surface is built, e.g. in `resolveRockSurface`'s consumer:

```js
installToonLabSurfaceLighting(material, { shadowFill: 0.35, workflow: 'metallic' });
```

Rock/tree/foliage/water-shore/environment materials all call the same installer, so the same option
reaches every one of them.

### D19-063 · Catalog cliffs have no small-boulder scale class — RECORDED · S4 scope
**Area:** catalog / scene assembly

The art-direction parity analysis asks for "8–14 small boulders at the wet-sand line to break the
rock/sand seam", but §6.3 constrains cliff-role placement to a 0.92–1.08 scale band with no
stretching, and the smallest accepted asset (`rock-0281`) measures 4.22 × 3.69 × 4.57 m. There is no
boulder-scale asset in the accepted set. `labs/launch-world/coast/props.js` therefore places 13
instances at a uniform 0.20–0.42 downscale as a **declared deviation**: uniform scale only, never
stretch, and only at the shoreline where screen size is small. The projection period is world-space,
so a downscaled instance samples a smaller patch of the detail map and reads lower-frequency — an
acceptable trade at that screen size, and a real one to record. Under doc 20 this becomes a scope
item rather than a workaround: a garden needs stepping stones and gravel-sea islands, which are
genuinely a different size class, not a scaled cliff.

### D19-064 · The `call-me-sensei` sun path has no azimuth authored for a scene, only an hour — RECORDED · S2
**Area:** lighting · `src/lighting/lightingStyle.js:100-109`, `:198-224`

Sun **elevation** is derivable from `timeOfDay` (contracts §6.3), and that is well documented. Sun
**azimuth** is derived from the same hour by `az = azimuthOffset + (hour/24 - 0.5) x azimuthArc`
(measured, not documented), and the shipped `azimuthOffset` is 0. At hour 8.5 that places the sun at
azimuth −42° — the north-west. For the coastal scene, whose only interesting view direction is out
over a north-facing bay, that puts the sun *behind everything the camera can see*: every land surface
in frame was its own shadow side, and because the Call Me Sensei rig disables `ambientLight` in
favour of an SH probe, those surfaces had only a dim cool probe to light them. The result reads as
the D19-040 defect but is purely a camera/sun relationship.

There is no way to say "put the sun over the camera's shoulder" — a scene must reverse-engineer the
formula and author `sunPath.azimuthOffset`. `createSceneStyleRuntime` should accept a sun azimuth (or
a `sunOverShoulder(camera)` helper) alongside `timeOfDay`, since the two together are what actually
determine whether a scene is lit.

Also recorded: choosing the hour to hit an elevation drags the **whole day-cycle palette** with it.
Hour 8.5 hits §6.5's 42° exactly and interpolates 36% of the way from the style's hour-6 keyframe,
so the rig delivers a dawn palette — warm-orange sun, dim cold probe — which is precisely what makes
sand render cold. The coastal scene instead takes hour 10 with `sunPath.heightScale = 0.4219`, which
lands the same 42° on a late-morning palette. Both routes are "correct" per the contracts; only one
of them is correct for the picture.

### D19-065 · `runtime.lighting.frame` exposes `sunElevation` as a ratio, and no scene-space sun direction — RECORDED · S4
**Area:** lighting · `src/lighting/lightingStyle.js`

`labs/launch-world/coast/main.js` reports `data-coast-sun-elevation` as `unknown` because
`runtime.lighting.frame` has no `sunDirection`. It has `sunSourceRatios` and a `sunElevation` that is
the raw `sin()` **factor** (0.866 at hour 10), not degrees. Any consumer wanting to assert §6.5's
"42° elevation" must either read the DirectionalLight's world position out of the scene graph or
re-derive `atan((heightBase + elevation x heightScale) / orbitRadius)` by hand. A `sunDirection`
(and a `sunElevationDegrees`) on the frame would make the requirement checkable.

### D19-066 · Scatter can only reject against a curve, never distribute along one — RECORDED · S3
**Area:** vegetation · `src/vegetation/scatter.js:139`

`scatterInRect({ min, max, count, seed, minSpacing, heightAt, mask })` is the only shipped
placement primitive. Its domain is an axis-aligned rectangle and its only shape control is a boolean
`mask`, which can reject a placement but cannot bias the distribution. Every boundary a natural
scene actually has — a shoreline, a path, a pond margin, a wall, a tree line — is a **curve**, so a
host either accepts a rectangular distribution with a curved hole punched in it, or hand-authors
coordinates.

Cost observed directly: a 16-instance tree ridge hand-authored at constant world z drifted from 0 m
to 60 m of separation from the authored shoreline across the width of the world, putting a third of
the ridge on the beach and a third behind the hero camera. Re-authoring the same table as
`(x, inland)` against the shoreline function fixed it mechanically. Registered as **FILL-013**.

### D19-067 · A shared dev server lets one lab's syntax error corrupt another lab's capture — RECORDED · S4
**Area:** tooling · `scripts/capture-launch-*.mjs`

Several agents share one Vite dev server. A syntax error in any lab pops a full-screen
`<vite-error-overlay>` on **every** page the server renders, including pages that compiled fine.
A headless capture then silently records the overlay instead of the scene, and the readiness dataset
still reports `ready: true`, so nothing detects it. `scripts/capture-launch-coast.mjs` now strips
`vite-error-overlay` before screenshotting. Any capture script used during parallel work needs the
same guard, or a check that the frame is not 40% dark chrome.

---

## Appended 2026-08-15 — release-scope directive

### D19-078 · `buildinggen` / `villagegen` are prohibited — do not use · **DIRECTIVE**
**Area:** release scope · **Developer instruction, 2026-08-15:** *"buildinggen/villagegen
should not have been part of the release. Do not use them."*

**Verified packaging status — they do NOT ship.** Neither module appears in `package.json`
`files`, the `exports` map, or `src/index.js`. No npm consumer can import them. They are
repo-only, the same status as `src/landscape/**` (D19-003).

**Repo-side consumers at time of directive:**

| Path | Status |
| --- | --- |
| `labs/launch-world/city/{scene,streetkit,facade,massing,parts}.js` | Cancelled with the city scene — no further work |
| `labs/building-lab/**` | A lab, not a launch-scene dependency |
| `labs/catalog/ui/App.jsx`, `labs/library/main.js` | Incidental references |

**The Stillwater Garden scene never used them and must not.** ARCH-GDN-01 (teahouse) and
ARCH-GDN-02 (gate + wall) come from the D-003 generation pipeline — gpt-image-2 concept →
Meshy 7 image-to-3D for massing and construction geometry → surfaced with §9 tiling materials
by semantic role. Not from `buildinggen`.

**Consequences for entries already filed:**

- **D19-037** (`buildinggen` is a village grammar) and **D19-038** (settings advertise ranges
  the runtime does not enforce — a typo of 140 for 14 silently builds a 140 m building) are
  **superseded as production concerns**. Retained as a record of why the system is unsuitable
  for general "building" use, which is the substance of this directive.
- **D19-044** (window glazing sat proud of its frame with no reveal) and **D19-045** (glass
  colour hard-coded) were **fixed in `buildinggen`** during the city pass. Those fixes are now
  **moot for the launch** — correct, harmless, byte-identical for existing recipes, but landing
  in a module that is not to be used. Recorded so nobody mistakes them for active work.
- **D19-039** (collision circles miss the middle of an elongated footprint) came from that
  survey but describes a **general** collision behaviour — verify whether it also affects the
  shipped collision path before dismissing it with the module.
- **D19-040** (generated assets render dark navy under the Call Me Sensei rig) is **NOT**
  superseded. It affects `rockgen`, `propgen` and `debrisgen` too — all of which *do* ship —
  and remains critical path for the garden.

**Open release question for the maintainers:** `buildinggen`, `villagegen` and
`src/landscape/**` all sit in the repo, unexported and unshipped, while looking to any reader
like part of the toolkit. `createStylizedTerrain` in particular is documented-adjacent and
exported by nothing (D19-003). The repo should either ship these or remove them; the current
middle state is what let a launch scene get built on a module that was never meant for it.

---

## Signage / graphic-mark authoring (2026-08-15)

> Filed by the sign-art workstream. IDs deliberately start at **D19-080** rather than at the
> next free number (D19-079): five workstreams have appended to this file concurrently today
> and all picked "next free" at once, which already forced one renumbering. A separated block
> is cheaper than a second collision.
>
> Both entries below were found authoring the original non-textual sign-art set
> (`scripts/launch-world-signage-set.mjs`, 18 entries). Workstream stood down when the launch
> scene became Stillwater Garden; handover in `launch-plan/review/signage-standdown.md`.

### D19-080 · An accent overlay cannot target a specific pattern cell · **S2** · **RECORDED**
**Area:** texgen / accent overlays · **Found:** authoring composed multi-colour graphic marks

**Expected.** A graphic mark is usually "a field, plus one element in a second colour": one
hex of six filled coral, one panel of a 2x3 grid lit ochre, one bar of four in accent, a
border rule inboard of a plate edge. The accent overlay slots (`accentA` / `accentB`) look
like the mechanism — they take their own mask generator with its own `columns` / `rows`, plus
`coverage`, `softness` and `creviceBias`.

**Actual.** The overlay thresholds its mask by *height*, not by *cell identity*. A mask
generator with cell structure therefore paints wherever the mask exceeds the coverage
threshold, which is every cell or no cell — never a chosen one. There is no selector for
"one module of this pattern".

**Evidence.** Measured across the 18-entry set, at 256 px, `--validate`:

| Entry | Intended mark | What the overlay produced |
| --- | --- | --- |
| SGN-CAFE-01 | one coral disc, off centre | scattered tilted ellipses across the tile |
| SGN-CAFE-02 | one hex of six filled coral | small specks in every hex, reading as blemishes |
| SGN-MENU-01 | one panel of six in ochre | ochre blob in all six panels |
| SGN-FLAG-01 | a single hoist band | several vertical stripes across the flag |
| SGN-PLATE-02 | four coral dots inside a border | border covered the plate; dots lost |
| SGN-SAFE-01 | ochre field + charcoal triangle | whole tile crushed to near-black |

The split is clean and is the actual finding: **all 6 entries whose mark depended on an accent
overlay failed; all 6 built purely from the base + detail height ramp passed** (SGN-PARA-02,
SGN-AWN-01, SGN-AWN-02, SGN-FLAG-02, SGN-WAY-01, SGN-LOOK-01). Contact sheet:
`launch-plan/review/captures/signage/contact-sheet.png`.

**Why it matters beyond signage.** Any per-module colour call hits this — a single red door in
a row of shutters, one lit window in a facade, one worn tread on a stair. The workaround that
does exist (`jitterCells` + `jitterCellVariety`, D19-057) randomises *all* cells and cannot
place one.

**Suggested fix.** A selector on the overlay:
`accentA.target = { cell: 'one' | 'some', selector: 'hash' | 'index', index, fraction }`,
resolved against the base layer's cell id — the same id `jitterCells` already reads, so the
plumbing exists. Interacts with D19-056 (`jitterCells` reads only the base layer's cell id):
both want cell identity to be a first-class, addressable quantity rather than a hash tapped in
one place.

### D19-081 · `scales` is not V-periodic at `rows: 1` · **S3** · **RECORDED**
**Area:** texgen / generators · **Found:** authoring a scalloped valance band (SGN-PARA-03)

**Expected.** Every texture generator in `src/texgen/textureGenerators.js` is periodic by
construction — the §9 material set relies on it and measures seam error at 0.01–2.14 / 255
across 13 materials.

**Actual.** `scales` at `rows: 1` breaks the V wrap. Measured seam error on SGN-PARA-03:

```
seam U  0.51 / 255      seam V  79.96 / 255     (~31% of full range)
```

For comparison the worst seam anywhere in the §9 set is 2.14/255, and the same bake reports
0.00–5.03/255 on the other 17 signage entries. The visible result is that the scallops
resolve at the tile's top *and* bottom edges with a solid field between, instead of one
hanging lappet band, so the generator cannot express a single-row shingle course at all.

**Evidence.** `scripts/bake-launch-world-signage.mjs --validate`, entry SGN-PARA-03
(`generator: 'scales', columns: 7, rows: 1`). Compare SGN-PARA-01/02 (`stripes`, same tile,
same weave detail) at seam V 0.18 and 1.84.

**Why it matters.** A single-row shingle course is the natural way to author any scalloped
hem — awning valances, parasol skirts, kiosk fascias, roof eaves courses — and `scales` is
the only generator that produces the form. At `rows: 1` it is unusable, which pushes the
author toward faking it in geometry.

**Suggested fix.** Audit `scales`' V-axis wrap for the `rows === 1` case; the row offset that
staggers alternate courses is the likely culprit, since with a single row there is no second
course for it to stagger against. Add a periodicity assertion to `verify:texgen` covering
every generator at `columns`/`rows` of 1 — the §9 set never exercised that corner because
wall materials never want a single module.

**Note, not a defect.** Two measurement nuances worth recording beside these, since both cost
authoring time. The accent-fraction gate uses HSV saturation > 0.55; the set's ochre
(`[0.925, 0.741, 0.435]`) computes to 0.53 and is therefore invisible to the gate, so warm
ochre is effectively free against a colour budget while coral and marine blue are not. And
`chevron` blended at `min` with a high `amount` (SGN-SAFE-01, 0.85) drives the whole tile to
the ramp's dark stop rather than cutting a triangle out of it — `min` composites against the
full height field, not against the mark.

### D19-031 (projection) · Rock projection scale is not asset-scale aware · **S2** · **FIXED (src)**
**Area:** catalog surfaces · `src/catalog/officialCatalogRockSurfaces.js`

Previously recorded as RECORDED; promoted to a fix because the Stillwater Garden re-scope
(`launch-plan/20-stillwater-garden-scene-brief.md`) puts small stone in close frame, where it
stops being cosmetic. The rock shader's projection period is absolute metres, so the single
value tuned for a 4-6 m cliff is wrong for every other size: a 0.5 m stepping stone samples a
proportionally tinier patch of the map and reads as a flat wash with one low-frequency blob
drifting across it. The same defect the city owner hit with landscape-scale ground presets.

**FIXED:** `resolveCatalogRockProjectionScale({ size })` derives the period from the asset's
largest measured dimension against a documented reference pair (5.94 m cliff : 26 m period),
clamped to 1.5-64 m. Holding *texel density* constant rather than the period is what makes
stone of different sizes read as the same rock type. `resolveRockSurface` now derives it per
asset from `rock.measured` instead of a fixed constant; an explicit number still overrides.

Derived: 5.94 m cliff -> 26.00 m (the reviewed value, unchanged); 4.57 m -> 20.00; 1.8 m set
stone -> 7.88; 1.1 m gravel island -> 4.81; 0.6 m stepping stone -> 2.63; 0.35 m edging ->
1.53. Every stone class the garden needs now has a sane period instead of sharing 26 m.

ROCK-COAST-02/03 move from 26 m to ~20 m, so their captured evidence changed; all 22 Gate 1
captures were regenerated. ROCK-COAST-01 is unchanged, so the S08 evidence still stands.

---

## Yua character workstream (§5) — 2026-08-15

Filed by the character materials / rigging / animation / grounding owner. Evidence for every
entry is in `launch-plan/review/captures/yua/` (frames plus `evidence.json`, the measurement
block published by `labs/launch-world/character/`). Scene-independent: recorded before the
city/coast standdown and re-verified against the Stillwater Garden stone path.

### D19-001 update · Single-load neutral↔toon material swap — **FIXED in `src/`** · S1
**Area:** character · `src/character/characterRuntime.js`

The original entry is correct: no shipped path could render one set of geometry buffers twice
with two material treatments in one frame, which is exactly what §11 demands and what every
in-repo wipe faked with two loads.

Fixed by adding `materialModes: true` to `createCharacterRuntime`. It builds the neutral
material set from the retained imported materials *after* toon conversion — without mounting
or disposing anything — and returns `setMaterialMode('neutral'|'toon')` plus a
`materialMode` getter. The swap rebinds `mesh.material`, restores the matching
`onBeforeRender` (storage skinning vs. toon light sync), toggles the outline/fur child meshes'
`.visible`, and calls `toonlabCharacterStyleIntegration.refresh()` so the depth prepass and
self-shadow target follow. It is a reference assignment per mesh — cheap enough to call twice
inside one frame between two `renderer.render` calls.

`prepareNeutralCharacterSource` is left exactly as it was for the single-mode `toon: false`
path; it mounts destructively and disposes its sources, which is right there and wrong for a
comparison. Default is `false`, so no existing consumer changes behaviour.

Proven end-to-end in `labs/launch-world/character/` (`renderComparison`) and in
`launch-plan/review/captures/yua/three-quarter-wipe.png`. **The wipe workstream should switch
`labs/launch-world/wipe/main.js` off its `toon: false` + `applyToonShader`-in-place approach**,
which is one-way and cannot swap back per frame.

### D19-007 update · The `call_me_sensei` toon preset was an empty override set — **FIXED in `src/`** · S1
**Area:** toon · `src/toon/toonSettings.js`

Confirmed exactly as recorded, and worse than recorded: `assets-local/models/yua/yua-launch.toon.json`,
the file named as the character's launch look, is generated by
`scripts/prepare-yua-launch-preset.mjs` as
`sanitizeToonPresetSettings(createToonSettings({ preset: 'call_me_sensei' }))` — a verbatim dump
of library defaults. So "the ToonLab-converted hero character" and "a preset-less character"
were byte-identical, and the §11 wipe was demonstrating cel shading in general rather than any
authored ToonLab look. With Yua now the only figure in the launch scene, that is the difference
between the video having a character art direction and not having one.

Fixed by authoring `CALL_ME_SENSEI_TOON_PRESET_SETTINGS` — **43 deltas from Default** across six
groups, on three axes chosen because they are what makes material families separate rather than
what makes an image look processed:

1. **Outline weight by role.** `defaultWidth` 0.002 → 0.0024 with a darker, less light-mixed
   tint; `hairWidth` **0.00055 → 0.0016** (the baseline hair line is invisible past ~2 m and hair
   contour is the single strongest anime material cue); `metalWidth` 0.0022 with a cool near-neutral
   tint; `skinWidth` 0.0011 warm; face outline stays at 0 — a line across a cel-shaded face reads
   as dirt.
2. **Specular by role.** Cloth stays matte (`defaultIntensity` 0.09, `defaultPower` 48, later
   onset), hair broadens (0.18 → 0.24 @ power 44), metal takes a tight bright hit
   (**`metalIntensity` 0.075 → 0.5**), and `sourceMaskMode` is switched to `'source'` so a
   *fifth* family — leather — is reachable per-material via `userData.toonSpecularMaskMap`
   without inventing a role.
3. **Coloured shadow families.** `selfShadowAreaHueOffset` 0 → −0.022 (blue-violet),
   `selfShadowAreaSaturationBoost` 0.2 → 0.34, `selfShadowAreaValueMul` 0.68 → 0.63, and a warmer,
   more saturated terminator band (`transitionAreaSaturationBoost` 0.36 → 0.5). §4's "coloured
   shadow families" and the garden brief's "warm, luminous, *coloured* — never neutral grey".

Plus a crisper terminator (`celShade`), stronger occlusion under collars and chins
(`contactShadow.strength` 0.5 → 0.62) and a stronger hair band and rim.

`preset: 'default'` is untouched, so this is opt-in for every consumer that does not ask for the
house style. **Note for the look-dev owner:** `CALL_ME_SENSEI_STYLE_BUNDLE`'s toon slot resolves
this preset, so every character in every bundle scene now inherits it — that is the intent, but
it is a global look change and should be re-reviewed against any existing bundle captures.

### D19-082 · `createCharacterRuntime`'s `onStage` hook is not awaited, so async source-material authoring silently lands after conversion · **S2** · **RECORDED**
**Area:** character · `src/character/characterRuntime.js:47`

`stage(callback, name, detail)` is `callback?.({ detail, stage: name })` — the return value is
discarded. `CHARACTER_RUNTIME_STAGE.STYLE` fires with the imported materials still mounted and the
model already fitted, which makes it the only correct point to author source materials before
`applyToonShader` bakes `userData` into uniforms. But any `await` inside the handler resumes
*after* conversion has already run.

Cost: an `async onStage` that assigned the `metal` role to Yua's buckles and bound her specular
and hair-highlight masks appeared to work — the handler's own counters reported 2 metal and 6
specular bindings — while `toonState.materialRoleSummary.counts` showed **`metal: 0`** and the
frames were unchanged. The bindings had landed on orphaned materials. Nothing warned.

**Suggested fix:** `await callback?.(...)` in `stage()` (the pipeline is already async at every
call site), or document the hook as strictly synchronous and say so in the type declaration.
Worked around here by pre-loading the mask textures before `createCharacterRuntime` so the
handler is synchronous.

### D19-083 · `fitModelForController` centres the carrier on the whole-body bounding box, not on the feet · **S2** · **RECORDED**
**Area:** character · `src/character/animationRetarget.js:193`

After scaling, the function does `root.position.x -= center.x; root.position.z -= center.z;` using
the centre of the **whole-body** XZ bounding box, then `root.position.y -= box.min.y`. The Y term is
right — it produces a true foot origin. The XZ terms are not: any silhouette that is not
symmetric in plan puts the carrier origin somewhere other than the ground contact.

Measured on Yua: her ponytail reaches 0.291 m behind her and her toes 0.138 m in front, so the bbox
centre lands **96.4 mm behind her feet** (`footOffset.z = 0.0964`, `evidence.json`). Placing the
carrier on a hero mark therefore puts her *feet* 96 mm off it. On flat ground that is a composition
error; on any height field it is also a **sampling** error, because the host samples `heightAt` at
the origin while the feet stand somewhere else — on a 20° slope, 35 mm of height error, and on the
garden's stepping stones it can be the difference between two different stones.

**Suggested fix:** centre XZ on the lowest slab of the bounds (the contact footprint), not the whole
body — or return the offset in `bounds` so a host can compensate deliberately. Worked around in
`labs/launch-world/character/yuaCharacter.js` by measuring the shoe meshes and rotating the offset
with the character's yaw before subtracting it (`markErrorMm: 0` after the correction).

### D19-084 · Nothing in the character runtime grounds per foot · **S1** · **RECORDED**
**Area:** character · `src/character/groundStabilizer.js`, `src/character/characterRuntime.js`

`createGroundStabilizer` takes **one** `(x, z)` sample at the body origin and corrects a single
body Y. That is a physics-body contract and it is correct for a capsule, but it cannot express the
case the launch scene now leads with: Yua on irregular stepping stones, feet in frame at 70–85 mm.
With one sample, one foot floats and the other penetrates, and §13 rejects both as the same defect
("floating contacts").

There is no per-foot query, no support-height report, and no IK, anywhere in `src/character/`.

**Suggested fix:** a `sampleFootSupport(runtime)` that returns per-foot footprint centre, sole
height and clearance from the live skeleton, and — the real feature — two-bone foot IK driven from
it. Filled scene-side as **FILL-YUA-01**; the measurement half is built and reported
(`feetClearanceMm`), the IK half is not, so an authored pose is still required for a stride that
straddles two stones.

### D19-085 · Yua's humanoid rig is missing `upperChest` · **S4** · **RECORDED**
**Area:** asset data · `assets-local/models/yua/yua.glb`

`resolveCharacterRig` maps **51 of 52** `HUMANOID_ROLES`. All 30 finger bones map (§5's finger
requirement passes in full); the single gap is `upperChest` → `mixamorigSpine2`, because the source
skeleton has `Hips/Spine/Chest` and `scripts/prepare-yua-character.py`'s `BONE_RENAMES` maps
`Chest → mixamorigSpine1` with nothing left for `Spine2`.

Consequence: every retargeted clip's `mixamorigSpine2` track is dropped, so the mannequin's upper-torso
counter-rotation collapses onto `Spine1`. Visible as a slightly stiffer upper body in `run` (the
clip with the most torso travel) and not visible at all in `idle`.

**Suggested fix:** asset-side — insert a `Spine2` bone between `Chest` and `Neck` in the clean
blend and extend `BONE_RENAMES`. Package-side, `resolveCharacterRig` could redistribute a missing
intermediate spine role onto its neighbours rather than dropping the track.

### D19-086 · `MIXAMO_BONE_BY_ROLE` was private, so a host could not audit a rig against the humanoid contract · **S5** · **FIXED in `src/`**
**Area:** character · `src/character/characterRig.js:22`

`HUMANOID_ROLES` shipped but the role → bone-name table did not, so a consumer holding a resolved
rig could count `targetToMixamo` entries but could not say *which* roles failed to resolve — the
only answer that leads to a fix. Exported; one line, no behaviour change. It is what produced
D19-085's `missingHumanoidRoles: ["upperChest"]`.

### D19-087 · A style bundle applied with `watch: true` converts an already-converted character a second time · **S2** · **RECORDED (worked around scene-side)**
**Area:** styles / character · `src/styles/sceneStyleRuntime.js` (discovery), `src/character/characterRuntime.js` (`attachCharacterStyleMetadata`)

`createCharacterRuntime` labels its carrier as style target `toonlab/character` and marks its
materials managed — correctly, so a scene can *see* the character. But the character has already
run its own `applyToonShader`. A scene that then calls
`runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, { discovery: 'scene-labels', watch: true })` — the
documented assembly order, and the order every launch scene uses — has its watcher pick the
character up when it is added and apply the toon domain **on top of the toon NodeMaterials**.

Measured on Yua (`labs/launch-world/character/`, WebGPU):

| | `watch: true` | `watch: false` |
| --- | ---: | ---: |
| outline child meshes (13 body meshes) | **26** | 13 |
| `Outer_low` shader `aCutoff` (source `alphaMode: MASK`, `alphaTest` 0.5) | **0.35** | 0.50 |

The cutoff regression is the mechanism: the second pass reads the *first pass's* material, whose
three.js `alphaTest` is 0 because the cutout lives in the shader's `aCutoff` uniform, so
`alphaTestForMaterial` (`src/toon/settings/alphaSettings.js:141`) falls through to
`Math.max(0, cutoutCutoff)` = 0.35 and the outerwear's alpha mask is cut 0.15 lower than authored —
a visible fringe on every cut edge. The doubled outline hull is drawn twice at every silhouette.

Neither is reported. `applyToonShader` returns no "already converted" signal and nothing warns.

**Suggested fix:** make the toon domain idempotent — either skip materials already carrying
`uniforms.materialRole` (the marker exists), or have `applyToonShader` reconstruct `alphaTest`
from `uniforms.aCutoff` when re-applied. Either would make the documented assembly order safe.
Worked around here with `watch: false`, which is not a general answer: a scene that needs the
watcher for its environment gets no way to exclude the character.

### D19-088 · Yua's outerwear reads translucent and cyan-cast under the toon shader, and its alpha cut stair-steps · **S1** · **RECORDED — blocking §5/§13**
**Area:** toon · `src/toon/toonMaterialAdapter.js`

At the §11 S02 three-quarter framing, `costume_outerwear` renders as a pale **translucent cyan
sheet** with the arm reading through it, against an opaque, correctly-coloured white garment on
the neutral half of the same frame — same geometry buffers, same light rig, same exposure.
The cut edge along the rolled sleeve stair-steps hard.

Evidence: `launch-plan/review/captures/yua/three-quarter-wipe.png` (the wipe is the proof — the
two halves differ only by bound material). Material state at capture, after D19-087 was worked
around: `aCutoff 0.5`, `alphaBlend false`, `transparent false`, `depthWrite true`,
`side DoubleSide` — i.e. the material is nominally **opaque**, so the translucency is coming out
of the shader graph, not out of the blend state.

Two separable defects:
- **Cyan cast / translucency.** The garment is white in the source and on the neutral half. The
  toon path is either compositing the double-sided back faces or lifting the cool indirect term
  far enough to swamp a near-white albedo.
- **Alpha stair-stepping.** The cutout is a hard `discard` with no alpha-to-coverage and no
  derivative-based edge softening, so a 1-bit mask on a rolled cuff aliases badly at 3840×2160.
  `celShade.edgeAntiAliasStrength` covers the cel terminator, not the alpha edge.

§13 rejects "paper-thin glazing", "alpha halos" and "photoreal asset that does not integrate with
the anime value structure"; this is the character equivalent of all three, on the only figure in
the launch video, in the shot whose entire purpose is to show what ToonLab does. **This is the top
character blocker.** Not fixed here: it is inside the toon shader graph, it affects every
converted character rather than only Yua, and it wants the toon owner rather than a scene-side
tint. Reproduce with `/labs/launch-world/character/?shot=outerwear&compare=50`.

### D19-091 · Moss coverage has no crevice or cavity input · **S1** · **PARTIALLY FIXED**
**Area:** rock shader · `src/rock-shader/rockGeometryDetail.js`, `rockMaterial.js`, `rockShaderRuntime.js`

Escalates D19-012/D19-032. The shipped mask is
`clamp(pow(luminance(moss) * multiply * slope, 2))` — **luminance times slope, nothing else**.
Slope is `normalWorldGeometry.y`, so moss can only appear on upward faces. Real moss
colonises where moisture lingers and light is indirect: crevices, hollows, the shaded
junctions where one slab meets another. Slope cannot express any of that, which is exactly
why the result reads as a flat tint painted onto ledges. Critical path now that Stillwater
Garden makes moss on stone a hero material seen at close camera in nearly every frame.

**FIXED (structure):** a `rockCavity` vertex channel now feeds the mask.
`computeMeshCavity()` estimates discrete mean curvature per welded vertex — centroid of the
one-ring projected onto the vertex normal, normalised by local edge length so the same term
works on a 0.4 m stepping stone and a 6 m cliff. It is computed **before** subdivision, where
the coarse mesh's edges span the macro form and the real crevices are; subdivision then
interpolates it for free into a smooth moisture field. The displacement pass folds its own
pits into the same channel (`cavityMicro`), so both scales arrive through one attribute.

The mask becomes `moisture = clamp(slope + cavity * 1.6)`, so a vertical cleft that slope
scores at zero now grows moss, while exposed convex faces still depend on slope and stay
bare. Gated like the other optional vertex channels: `vertexCavityStrength` is only non-zero
when every enriched mesh actually carries the attribute, so meshes without geometry detail
are byte-identical and a partial write can never produce a shader failure.

Measured: cavity resolves to 0.000-0.362 on a convex test sphere (correctly near-zero where
there are no hollows). On the catalog cliffs, moss now appears in the vertical clefts and the
notch on the shaded side, not only on the upward ledges. `verify:rock-shader` passes 10 checks.

**STILL OPEN — the look is not at the bar.** The structural input is right and the placement
now follows the form, but at 85 mm the moss still reads as a **pale sage tint**, not the soft
living surface a Japanese garden needs. Remaining, and none of it is a parameter tweak:

1. **Palette.** `moss.lowColor`/`highColor` in `call_me_sensei` are desaturated sage tuned for
   incidental weathering on a distant cliff. Garden moss wants a deeper, richer green. This
   must be agreed with the §9 texture owner authoring the moss *ground* material — where moss
   on stone meets moss on ground at the base of a set stone they have to read as one
   continuous material, so palette and projection scale are a shared decision, not mine alone.
2. **No depth.** Moss is a pure `mix()` on base colour only — it does not perturb the normal or
   the roughness, so it cannot read as a material sitting *on* the stone. A moss-driven normal
   and roughness contribution is the next real step.
3. **No fringe.** The boundary is wherever the mask crosses; there is no edge break-up or
   sub-pixel fringe, which is a large part of why it reads as paint.

Recorded honestly rather than closed: the crevice input was the specific ask and it landed,
but "hero material" is not yet met.

### D19-089 · Yua's ground contact shadow is pure black, hard-edged and heavily stair-stepped · **S2** · **RECORDED**
**Area:** lighting / shadows · Call Me Sensei sun contract

Good news first, against D19-041: at **character-plate scale** (a 14 m ground mesh, 4096 shadow
map, shipped cascade numbers) the package sun shadow **does** produce a cast shadow — D19-041's
"no cast shadows" is a large-world failure, not a universal one, so a small scene like Stillwater
Garden is not automatically blocked. Verified in
`launch-plan/review/captures/yua/grounding-stones-shoes.png`.

The shadow it produces is not usable as-is. Under Yua's weighted foot it is a **pure black**
silhouette with a **hard** edge and pronounced axis-aligned **stair-stepping** several
centimetres wide at 85 mm framing — no penumbra, no colour, no filtering. §13 rejects "unstable
shadows"; §4 and the garden brief both require shadows that are *coloured* and luminous rather
than crushed ("warm, luminous, and *coloured* — never neutral grey"). A black hard-edged blob
under the hero character in the video's closest framing fails both.

The toon `shadowColor` group tints **self**-shadow and the terminator; it does not reach the
scene shadow the ground receives, and `sceneShadow.skinMinLight` etc. lift the character's
received shadow, not the shadow it casts onto the ground.

**Suggested fix:** the sun contract needs PCF/PCSS filtering and a shadow *colour* (a lift and a
hue, not a multiply toward black) reachable from the lighting style — the same colour family the
toon shader already applies to self-shadow, so a character and the ground under it agree.
Assigned to lighting/look-dev, not to the character module.

### D19-090 · (method note) Character evidence must be sampled at the captured animation time · **S5** · **RECORDED**
**Area:** review harness · `labs/launch-world/character/main.js`

The review rig publishes its measurement block once, immediately after `placeAt`, while the
capture is taken at frame 150+ — a different point in the idle cycle. So `feetClearanceMm`
reports the *placement* pose and the frame shows the *settled* pose. In
`grounding-stones-shoes.png` the off-weight foot is visibly raised while the block reports 0 mm
clearance on both feet. Neither number is wrong; they describe different instants, which makes
the pair misleading.

Both are still valid for their own claim — placement correctness is a placement-time property —
but a per-foot contact claim about a *moving* character has to be sampled on the captured frame.
**Fix before Gate 3:** publish the block on the same frame the screenshot is taken, and for the
locomotion frames report min/max clearance across a full clip rather than a single instant.

---

## Appended 2026-08-15 — §11 camera choreography and shader wipe

`src/` changes from this pass: `renderer/styleComparison.js` (new),
`renderer/index.js`, `styles/neutralStylePresets.js` (new), `styles/index.js`.
Scene-local: `labs/launch-world/wipe/**`, `scripts/verify-style-comparison.mjs`.
Filler entries: **FILL-001**, **FILL-002**.

> **ID note.** This block was first written as D19-063…066 and renumbered to
> **D19-110…113** before hand-off: several workstreams appended concurrently and
> those numbers were already taken (D19-066 in particular is the curve-relative
> placement gap referenced by FILL-013). No other block was touched.

### D19-001 · No single-load neutral↔styled A/B path — **FIXED** · S1 blocker
**Area:** renderer · `src/renderer/styleComparison.js` (new)

`createStyleComparison({ renderer, scene, camera })` makes the A/B a renderer
feature instead of something every consumer re-implements incorrectly. One load,
one skeleton, one `AnimationMixer`, one camera, one light rig, one exposure; two
material assignments captured as named variants; a scissor split at a draggable
boundary. `capture()` pays the one-time snapshot cost; `activate()` is a Map walk
that assigns material references, which is what makes it affordable per frame
where `styleTransaction.setTargetEnabled` was not.

Both in-repo wipes are now obsolete: `labs/character-comparison/main.js:185-192`
(two runtimes, two scenes, two mixers) and `labs/launch-world/main.js:74`
(two carriers). Neither could support the §11 claim; this can, and proves it.

**Three renderer defects were found and fixed while making the composite exact.
All three are silent — each renders a plausible image and fails only under pixel
comparison, which is precisely why §11 demands a proof rather than a screenshot.**

1. **three keeps two scissor rectangles, and a render target ignores the one you
   set.** `Renderer._renderScene` reads the rect from `renderTarget.scissor` when
   a target is bound and from the canvas target otherwise
   (`three/build/three.webgpu.js:60797-60809`), while gating both on the CANVAS
   target's `scissorTest`. Setting only `renderer.setScissor()` therefore renders
   a full frame into a render target with no error. Measured: the "before" half
   covered 100% of the frame; every intermediate split silently showed one
   variant. `setScissorFor()` now writes both.
2. **A colour-attachment clear is always attachment-wide.** No graphics API
   scissors a clear, so the second pass cannot clear colour without erasing the
   first pass. Suppressing the clear instead leaves a residue: wherever the first
   variant drew OUTSIDE the second variant's silhouette — which is exactly what a
   toon outline shell is — its pixels survive into the other half as a ghost.
   Measured 3–6 px per frame at 320×180, all on the silhouette. Fixed with a
   scissored repaint quad (`paintScissorClear`).
3. **`autoClearDepth = false` leaks into three's nested shadow-map passes.**
   `resetRendererState` (`three.webgpu.js:44264-44270`) forces `autoClear` but
   *not* `autoClearColor` / `autoClearDepth` / `autoClearStencil`, so a suppressed
   depth clear reaches every shadow render and the shadow map accumulates stale
   depth. The symptom is shadow pixels that drift with the split position —
   invisible in a screenshot, ~4,000 wrong pixels per frame at 480×270. Fixed by
   keeping `autoClearDepth` true; the scissor already prevents out-of-region
   colour writes, so clearing depth costs nothing.

**Suggested fix (upstream three):** `resetRendererState` should save and force
all four `autoClear*` flags, not just `autoClear`. Filed here because any
consumer combining scissored multi-pass rendering with shadows hits it.

**Proof — measured, and partially red on purpose.**
`verifyStyleComparisonIdentity(comparison)` (`scripts/verify-style-comparison.mjs`)
runs eleven assertions. Result at 480x270, both shots:

| Assertion | S02 | S07 |
| --- | --- | --- |
| `split-0` bit-identical to a full ToonLab frame | **0 px** | **0 px** |
| `split-1` bit-identical to a full neutral frame | **0 px** | **0 px** |
| camera / lights / exposure / animation clocks unchanged by the wipe | **pass** | **pass** |
| differences confined to the treated subject | **0 px** | **0 px** |
| shared geometry buffers, skeletons, morph influences | **pass** | **pass** |
| intermediate splits (0.25 / 0.5 / 0.75), per region | **~3,000 px** | **~21,000 px** |

The first five are the load-bearing claims and they are exact: at `split=0` and
`split=1` the composite is **bit-identical** to a standalone full-frame render of
its variant, which is only possible if both halves share one camera, one framing
and one exposure — the §11 requirement. Everything that differs between the two
halves lies inside the subject.

**The intermediate-split residual is real and is NOT signed off.** See D19-113.

### D19-002 · Only `rock` shipped a `neutral` preset — **FIXED** · S1 blocker
**Area:** styles · `src/styles/neutralStylePresets.js` (new)

`neutral` is now registered for **toon, environment, manufactured surface, tree
shader, grass shader, flower shader, grass, ground shader, water, sky** and
**post**, through each domain's own registrar, from one table so the pairing with
`CALL_ME_SENSEI_STYLE_SLOT_IDS` is structurally symmetric. `NEUTRAL_STYLE_BUNDLE`
is the counterpart of `CALL_ME_SENSEI_STYLE_BUNDLE`.

Neutral means **un-stylized standard PBR, not "off"**: source albedo/normal/
roughness/metalness/AO stay bound at full strength and real shadows, specular and
transmission stay on. What is removed is the stylization over them — cel banding,
outlines, rim and edge ink, colour lifts, hue shifts, palette tints, aerial
distance tint, graphic projection, painted wash.

**Two slots are deliberately unpaired, and `describeNeutralStyleCoverage()`
reports why rather than hiding it:**

- **`lighting`** — a lighting style owns sun intensity, sun path and the day
  cycle, so a neutral lighting style changes **light transforms**, which §11
  requires both halves to share. It would be unusable in the only construction it
  exists for.
- **`post`** — registered and usable, but post runs over the composited frame,
  after both scissored renders, so it cannot differ per half.

`cloud` resolves to schema defaults for every style including neutral (D19-006),
which *are* the un-stylized cloud; recorded as `inherited`, not as authored.

**A new invariant, and the bug it caught.** A neutral preset may differ in
**shading only** — never geometry, density, placement, tiling, masking or motion —
because a comparison whose halves have different geometry is the exact failure
this pass exists to remove. `auditNeutralStyleShadingOnly()` asserts it
mechanically and immediately caught a real defect in the first draft: resolving
`createGrassSettings({ preset: 'neutral' })` fell through to schema defaults for
`bladesPerClump` (1 vs 40), `clumpRadius` (0.055 vs 0.68) and
`bladeHeightRange`, so the neutral half would have grown **different grass**. The
audit separates `issues` (must be empty — with an identical host recipe the
non-shading keys must resolve identically) from `warnings` (keys the host must
pass to both halves, which is correct for a field recipe). Sky `cloudSeed` is
pinned to the styled value for the same reason: two halves drawing differently
shaped clouds is a scene comparison, not a shader comparison.

### D19-113 · A scissored second pass does not compose exactly with the first · **S2** · **RECORDED — cause not yet isolated**
**Area:** renderer / three.js WebGPU · blocks the last 0.6% of the wipe proof

`split=0` and `split=1` are bit-identical to standalone full-frame renders, but
an intermediate split is not: a fixed population of roughly **3,000 pixels
(S02, 2.2% of the frame) / 21,000 pixels (S07)** differs, max channel delta
~200, concentrated in dark ground pixels. Which regions fail depends only on
whether they contain that population — at `split=0.25` the *outside* region is
exact and the inside is not; at `split=0.75` the reverse.

**What has been eliminated, each by measurement rather than reasoning:**

| Hypothesis | Test | Result |
| --- | --- | --- |
| Scissor rectangle wrong | `split=1` scissors the full frame | exact — not the rect |
| Colour-clear suppression residue | scissored repaint quad added | fixed a *different*, smaller population (3–6 px, silhouette only) |
| Depth-clear leak into shadow passes | `autoClearDepth` kept true | fixed a *different* population (~1,000 px); this one survives |
| MSAA resolve / attachment discard | re-measured with `?aa=0` | unchanged to within 20 px — **not MSAA** |
| Shadow-map re-use across the two passes | re-measured with `?shadows=0` | unchanged to within 40 px — **not shadows** |
| Animation clock / camera / exposure drift | `frame-state-stable`; two consecutive identical renders with the loop halted | 0 differing px — **not temporal** |
| Character material path | swapped `applyToonShader`-in-place for `setMaterialMode` | unchanged — **not the character** |

**An earlier draft of this entry blamed shadow-map re-use. That was wrong and is
corrected here**: disabling shadows entirely leaves the residual intact. The
honest current statement is that a second `renderer.render()` confined to a
scissor rectangle does not compose bit-exactly with the first on three's WebGPU
pipeline, and the remaining candidate is the internal framebuffer target that
both passes route through.

**Impact.** Cosmetically negligible — 0.6% of pixels in the darkest region of the
frame, with no structural or silhouette difference; the wipe reads correctly at
every split (`launch-plan/review/captures/wipe/`). **Materially, it is why this
workstream does not claim a fully bit-identical wipe.** The verification script
exits non-zero rather than being loosened to pass: a tolerance wide enough to
absorb this would also hide a genuinely broken half, which is the failure mode
the proof exists to catch.

**Do not re-derive from scratch.** A full-frame composite was attempted and
abandoned: it reproduced the frame exactly at `split=0`/`split=1` but no
mechanism tracked the split reliably across backends — texture `offset`/`repeat`
sub-rectangles introduced a half-texel skew (~3,000 edge pixels), a
`clippingPlane` was ignored by the WebGPU backend's cached material pipelines
(one variant covered the whole frame), and a TSL `step`/`mix` branch inside one
quad did not follow its own split uniform. All three are worse than the defect
they replace. The two promising routes left are (a) `copyTextureToTexture` of
the scissor region from a full-frame variant target, which involves no render
pass at all, and (b) fixing three's framebuffer-target reload.

### D19-110 · `resolveLaunchShot`-class framing cannot be eyeballed in a small scene — **RECORDED** · S5
**Area:** camera / launch scene

Stillwater Garden is ~40 × 40 m walkable with ~24 × 18 m of hero camera space.
At a fixed focal length the only way to fit more in frame is to move back, and
the garden runs out of room. Measured at the §11 master aspect (50 mm ⇒ 22.90°
vertical):

| Shot | Subject band | Distance required | Available inside the footprint |
| --- | ---: | ---: | ---: |
| S02 | 1.62 m (Yua three-quarter) | 4.0 m | 28.3 m — fits |
| S07 | 6 m | 14.8 m | 28.3 m — fits |
| S07 | 8 m | 19.8 m | 28.3 m — fits |
| S07 | 12 m (a wide garden read) | **29.6 m** | 28.3 m — **does not fit** |

S07 is framed at an 8 m band. §11's product point for S07 is "Whole-scene
**conversion**" — every domain flipping in one frame — which an 8 m band
satisfies while still reading as the garden. **Widening S07 off 50 mm would break
its pairing with S02, which is the entire reason the two wipes share a lens**, so
the lens was not touched. `assertShotFitsFootprint()` in
`labs/launch-world/wipe/shots.js` makes this checkable rather than a matter of
taste, and will fail loudly if the garden footprint shrinks further.

### D19-111 · Exposure can be rewritten mid-frame, which silently invalidates an A/B — **GUARDED** · S2
**Area:** renderer / lighting · relates to **D19-043**

§11 requires both halves of a wipe to share exposure exactly. `createStyleComparison`
never touches `toneMappingExposure`, but ToonLab's lighting system rewrites it
every frame (D19-043, owned by the lighting workstream). A rewrite landing
*between* the two scissored renders would make one half brighter than the other
with nothing in the image to explain it — an artefact a reviewer would read as a
shader difference.

Not fixable from here — the write belongs to lighting — so it is **guarded**:
`render()` samples `toneMappingExposure` and `toneMapping` before the first pass
and after the second, and on any change records `comparison.exposureDrift`,
raises an issue in `auditIdentity()`, and warns once. The check is free and the
failure is otherwise impossible to see.

**Coordination note:** this guard detects the hazard, it does not remove it.
D19-043 still has to land for exposure to be authorable at all.

### D19-112 · `verify:types` ratchet: attribution — **NOT THIS WORKSTREAM**
**Area:** packaging · `scripts/verify-packaged-types.mjs`

Recorded because this pass was asked to clear it. Measured by generating
declarations from a clean `git archive HEAD` extract and from the working tree:

| Tree | Permissive fallbacks |
| --- | ---: |
| `HEAD` (clean) | **72** — matches the ratchet |
| Working tree, without this workstream's modules | **73** |
| Working tree, with this workstream's modules | **73** |

`src/renderer/styleComparison.js` and `src/styles/neutralStylePresets.js` both
generate **exact** declarations and the fallback set is byte-identical with and
without them, so this workstream contributes **zero**. The first draft of
`styleComparison.js` did fall back, for the reason the rocks workstream
described: parameters destructured from `= {}` with no JSDoc infer as `{}`, and
`@param {THREE.WebGPURenderer}` is unresolvable because that class is exported
from `three/webgpu`, not `three`. Both fixed with explicit JSDoc contracts and a
structural `StyleComparisonRenderer` typedef.

**The remaining +1 over the ratchet is `types/rock-shader/rockGeometryDetail.d.ts`**,
regressed by in-flight uncommitted `src/rock-shader/` work — the rock-shader
workstream's to clear. The baseline was deliberately not bumped, so the signal
stays intact for them.

---

## Appended 2026-08-15 — §9 material set retargeted to Stillwater Garden

> The city and coastal scenes were cancelled mid-pass in favour of **Stillwater Garden**
> (`launch-plan/20-stillwater-garden-scene-brief.md`). The §9 method survives unchanged —
> declared world tile per material, measured px/cm, seam and macro-contrast metrics,
> determinism, `tEXt` provenance, semantic role tuples — and so do every `src/` fix above.
> Two new deficiencies surfaced authoring the garden set, both on the manufactured material
> contract. IDs continue at **D19-078**.

### D19-078 · The manufactured material contract has no organic base material · **S4** · **RECORDED**
**Area:** environment · `src/environment/manufacturedMaterialContract.js`
(`MANUFACTURED_MATERIAL_BASES`)

The thirteen base materials are `metal`, `mineral`, `wood`, `polymer`, `rubber`, `glass`,
`ceramic`, `textile`, `leather`, `paper`, `composite`, `fluid`, `genericDielectric`. Every
one is a *manufactured* class, which is consistent with the contract's name — but ToonLab is
a **nature toolkit**, and its own shipped systems produce surfaces that none of these
describe. MAT-GDN-02, the hero material of the launch scene, is a living moss bed; the
closest honest classification is `genericDielectric` / `matte`, which is the contract's
explicit "I could not tell" fallback. Grass, foliage, bark, lichen and algae are all in the
same position.

The practical cost is that the look table cannot address them: a style cannot say "all
organic surfaces get this subsurface warmth" because there is no key to hang it on, and
`analyzeManufacturedAsset` reports every one of them as a `fallback` classification, which
is the signal a scene is supposed to act on.

**Suggested fix:** add `organic` (and possibly `soil`) to `MANUFACTURED_MATERIAL_BASES`,
with a matching `SURFACE_PROFILES.organic` in `urbanPropMaterial.js`. Additive; nothing
currently classifies as either, so no shipped asset moves.

### D19-079 · `renderMode: translucent` / `transmissive` is validated and then ignored · **S1** · **FIXED**
**Area:** environment / manufactured surface · `src/environment/urbanPropMaterial.js`

`MANUFACTURED_RENDER_MODES` has carried `translucent` and `transmissive` since v1;
`validateManufacturedMaterialManifest` enforces them, `classifyManufacturedMaterial` infers
them from source transmission, and `applyManufacturedMaterialManifest` stores them. Nothing
downstream read them. `resolveUrbanMaterialProfile` switches on `baseMaterial` and `finish`
only, and `createUrbanAnimePropNodeMaterial` builds a `MeshToonNodeMaterial` with no
transmission input at all — `transparent` and `opacity` are copied from the source material
and that is the whole of it.

So a shoji screen classified `paper` / `matte` / **`translucent`** converted to exactly the
same opaque toon surface as a paper poster. The signature read of ARCH-GDN-01 — warm
interior light glowing through paper with the kumiko lattice dark against it, which is what
makes a teahouse look like a teahouse — was not expressible through the shipped shader. This
is the same class of failure as D19-076 (`finish` validated, then dropped) and D19-075
(`brushed` routed to a profile that discarded the map): the contract's vocabulary is wider
than the response behind it.

**FIXED** by adding a diffusing-sheet axis to Manufactured Surface:

- `SURFACE_PROFILES.paperTranslucent`, selected by `resolveUrbanMaterialProfile` when
  `baseMaterial: 'paper'` carries `renderMode: 'translucent'` or `'transmissive'`. Opaque
  paper still resolves to `paper`, so no existing asset moves.
- A `translucencyScale` profile field (absent ⇒ 0 ⇒ no term ⇒ every other profile
  unchanged).
- Three controls — `translucencyEnabled`, `translucencyStrength` (0.85),
  `translucencyColor` (`#ffd7a0`) — which the profile document schema picks up
  automatically, since `createUrbanPropShaderProfileSettings` is key-driven.
- The response on both adapters. WebGPU/TSL gets the full form; the WebGL
  `MeshToonMaterial` path gets the flat form.

**The response is deliberately not physical transmission.** A diffuser is not a window: you
do not see through a shoji, you see it lit. So the term is a view-independent emissive lift,
tinted by `translucencyColor`, **multiplied by the sheet's own albedo** so a fibre inclusion
or a stain reads darker when backlit — that is precisely what makes washi look like washi
rather than like a light box — eased off toward grazing incidence where a real sheet
presents more thickness, and **not** gated by `sceneShadow`, because the light behind the
screen is the interior, not the sun. A screen that stopped glowing when a cloud crossed
would be exactly wrong.

**Suggested follow-up (not built):** genuine transmission for `glass` is a separate problem
and still open. `src/environment/transparentMaterialProfile.js` already describes it
properly — ior, thickness, attenuation, clearcoat — but it is a standalone lab profile that
no shader path consumes. The garden has no glazing, so nothing here is blocked by it.

### Materials retired, not deleted

Thirteen recipes authored for the cancelled scenes keep their bakes, recipe documents and
proof sheets on disk but are removed from the live `materials` array in
`material-set.json` and listed under a new `retired` key with their last measured row. A
consumer scanning the manifest for a tile size cannot now pick up a surface that is in no
scene and under no quality claim. The `src/` fixes those materials paid for — D19-053,
D19-057, D19-059, D19-060, D19-075, D19-076 — all stand and are all load-bearing in the
garden set.

---

## Appended 2026-08-15 — background figures / crowd workstream (FILL-006)

Recorded from a working scene-local implementation (`labs/launch-world/crowd/`), not from
reading source. The workstream was stood down when the launch scene changed to Stillwater
Garden and the figure count dropped to 0–2; these findings are scene-independent and are
the reason they are logged anyway. Numbering starts at 100 to stay clear of six concurrent
workstreams renumbering in the 60–91 range.

Full context and the measured Gate 4 table: `launch-plan/review/figures-standdown.md`.

### D19-100 · Nothing lets many meshes share one skeleton, so N background figures cost N retargets · **S2** · **RECORDED (worked around scene-side)**
**Area:** character · `src/character/characterRuntime.js:291`, `src/character/animationRetarget.js`

`createCharacterRuntime` is genuinely re-entrant — two instances already run side by side —
but it is a **hero** runtime and its unit of cost says so: one asset load, one toon
conversion, one rig resolution, one locomotion retarget and one mixer per instance,
measured at roughly a second. There is no cheaper unit. A background figure that occupies
40 px on screen has to buy the whole thing.

The retarget is the part that does not have to be paid at all, and the analysis's framing —
"clip sharing across skeletons is absent, so add a rig-keyed clip cache" — treats the
symptom. A cache still retargets once per distinct rig. The actual missing capability is
one level up: **nothing in the package lets several meshes ride a single source skeleton**,
which is the case where retargeting is not merely cacheable but unnecessary, because the
source's own clips already bind to those bone names.

Measured with that inversion applied (`labs/launch-world/crowd/crowdRuntime.js`): **36
figures, 0 retargets, one source load, 138 ms total build.** The same 36 through
`createCharacterRuntime` would be 36 loads and 36 retargets.

What the package should grow: a way to instance a loaded humanoid's *armature* — clone the
bone hierarchy, bind arbitrary skinned geometry to the clone, share the source
`AnimationClip` objects across every instance. Everything else in the crowd module is
authoring; this is the only part that belongs in `src/character/`.

### D19-101 · The toon outline pass has no distance or per-object gate, so a 40 px background figure pays the hero silhouette cost · **S3** · **RECORDED**
**Area:** toon · `src/toon/toonMaterialAdapter.js:2048` (`applyToonShader`, `outline` option)

`outline` is a per-**call** option: a subtree either has outlines or does not. There is no
per-object flag, no distance gate, and no LOD hook, so a scene that wants ToonLab outlines
on its hero and not on figures 60 m away has to split its population into two roots and
call `applyToonShader` twice — which then also splits the material set and defeats the
draw-call consolidation the split was for.

Measured cost of the outline pass on a background figure, from
`launch-plan/review/captures/figures/gate4-crowd-cost.json`:

| | per figure |
| --- | ---: |
| authored triangles | 1,861 |
| triangles actually rendered | 3,379 (**1.82x**) |
| draw calls, WebGL fallback backend | **5** |
| draw calls, WebGPU backend | **8** |

Three merged materials per figure should be three draws. It is five on WebGL and eight on
WebGPU, and the difference is outline shells plus depth variants. At 36 figures that is 183
draw calls where 110 would do.

The fix is small and general: accept `outline: { maxDistance }` (or an `outlineLod`
predicate) so the adapter can build shells for near objects only, and let a host re-evaluate
it on camera move. It is worth more than the number suggests, because outlines are the one
part of the ToonLab look that a *distant* object does not need and a near one cannot do
without.

### D19-102 · The loose bone-name normaliser a host needs is private, and the exported one does not strip the separator glTF removes · **S3** · **RECORDED**
**Area:** character · `src/character/characterRig.js:234` (`looseBoneName`, private), `:238` (`normalizeMixamoBoneName`, exported)

glTF import runs every node name through `PropertyBinding.sanitizeNodeName`, which strips
`. : / [ ]`. A Rigify humanoid whose file says `DEF-shin.L` therefore arrives in the scene
graph as `DEF-shinL`, while the source file, every authoring tool, every retarget table and
every human writing host code still says `DEF-shin.L`.

ToonLab itself is safe: `looseBoneName` strips non-alphanumerics and `resolveCharacterRig`
goes through it. But `looseBoneName` is **private**, and the function that *is* exported —
`normalizeMixamoBoneName` — only handles the `mixamorig:` prefix and colons. It does not
strip the dot. So any host addressing a bone by name (an attachment point, a pinned prop,
a crowd figure's garment binding, an IK target) either re-derives the normaliser or, far
more likely, looks up the dotted name and silently misses.

Cost it caused here: the first run of the crowd module threw `Unknown bone "DEF-shin.L"` on
a skeleton that plainly had that bone. The failure is loud in this case only because the
lookup threw; a lookup that returns `undefined` and falls back to a default bone would have
produced a subtly wrong bind with no error at all.

Fix: export `looseBoneName` (or fold it into `normalizeMixamoBoneName`) so name-keyed bone
access has one shipped, correct answer.

### D19-103 · (method note) Draw-call counts are not comparable between the WebGPU and WebGL backends, which makes a Gate 4 budget ambiguous · **S4** · **RECORDED**
**Area:** renderer · measurement contract

The identical scene, identical figure count, identical materials measures **5 draw calls per
figure on the WebGL fallback backend and 8 on WebGPU** (`renderer.info.render.drawCalls`,
single frame, after `info.reset()`). Both numbers are correct for their backend; neither is
"the" draw-call count.

This matters for §12 Gate 4 specifically, because the gate is written as a frame-rate
target and the evidence scripts run under headless Chromium, which has no WebGPU adapter and
therefore silently measures the *other* backend. Two further traps found while measuring:

- `renderer.info.render` **accumulates across `renderAsync` calls** made outside the
  animation loop. A measurement loop must call `info.reset()` and then render exactly once,
  or it reports the sum of every frame it drew.
- An automation tab whose `document.visibilityState` is `hidden` never runs `requestAnimationFrame`
  and never presents, so any fps derived from the render loop is either absent or
  meaningless. The figures in the standdown report come from Playwright, where rAF runs.

Gate 4 should name the backend, the resolution and the measurement method, or its numbers
cannot be reproduced or compared.
