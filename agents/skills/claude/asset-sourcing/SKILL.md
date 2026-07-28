---
name: asset-sourcing
description: Help agents reuse, generate, discover, import, and prepare assets — approved stylized procedural base sets when reliable, curated CC0/CC-BY discovery for gaps, optional image-to-3D, licensing provenance, and portable rendering-domain/material labels.
---

# Asset Sourcing

Use this skill when a developer needs an asset — a model, texture, HDRI,
prop, tree, rock, building, material, or a saved look/behavior preset.

Read first:
- `docs/open-asset-library.md` for scene-kit coverage, approved generator
  base sets, route selection, CC0/CC-BY policy, and acceptance evidence.
- `docs/styles-and-bundles.md` for rendering domains, semantic labels,
  support levels, and Call Me Sensei verification.
- `docs/mcp.md` (only the MCP-routed steps need a connected server)
- `docs/urban-prop-surface-roles.md` when generating, importing, or preparing
  an urban prop GLB, or when building a reusable prop shader. If the repo copy
  is unavailable, use `https://toonlab.io/docs/urban-prop-roles.md`.

**The boundary:** the npm package is the worker for approved procedural
families, style presets, and texture baking. The gallery is optional. Route
through MCP only where it adds something beyond the package: external
discovery, curation/moderation policy, download provenance, shared workspace
state, or explicitly requested managed generation. Do not use MCP tools as a
proxy for package functions. ToonLab Pro may author and review stylized base
sets; their approved documents, recipes, labels, seeds, and provenance must
remain portable so OSS runtimes can use them without a database.

## Decision order

Choose the first route that is both available and accepted for the requested
scene-kit role.

1. **Reuse what exists.** Earlier imports, saved presets, and exports live in
   `.toonlab/` on disk. Query via MCP (`list_my_creations` / `search_assets`
   with `source: 'workspace'` or `'library'`, then `get_my_creation` /
   `get_asset`) or read the folder directly when working inside the project.
   Never regenerate or re-download something already there.
2. **Use an approved procedural family (no gallery).** The built-in catalog
   ships in
   `@call-me-sensei/toonlab/catalog`: `catalog.list({ kind, cluster, tags,
   text })` to browse trees, rocks, debris, props, buildings, paths, then
   `catalog.spawn(id, { seed })` for a deterministic, placeable asset.
   Seamless stylized textures: `@call-me-sensei/toonlab/texgen`. This is the
   direct route only when the requested family has an approved, versioned
   stylized base set and passes the reliability gate in
   `docs/open-asset-library.md`. Preserve base-set version, generator version,
   recipe, seed, domain/material labels, and golden-seed verification. Do not
   treat every legacy catalog entry as approved merely because it can spawn.
3. **Search curated open sources when generation is not approved or is not
   the best fit.**
   `search_cc0_assets({ query, kind, provider })` covers external providers
   for what procedural generation can't make: reference-quality PBR texture
   sets, HDRIs, and photoscanned props. Then `get_cc0_asset` for details and
   `import_cc0_asset` to download the actual files into `.toonlab/imports/`
   with a provenance manifest. This route stays on MCP because it carries the
   network fetch, the owner curation policy, and licensing provenance —
   selection is by name/tags only, so always preview imports in-scene before
   committing to them. Prefer CC0. Accept CC-BY only through a source path that
   exposes the exact creator, asset URL, license/version/URL, provider credit,
   and modification notice; do not assume a tool named `search_cc0_assets`
   returns CC-BY.
4. **Use image-to-3D for a named remaining gap.** First record why accepted
   assets, approved procedural families, and curated open candidates were
   inadequate. Check generation capabilities and rights for the input image.
   Treat output as a candidate that still needs topology, UV, texture, scale,
   collision, LOD, semantic-label, and Call Me Sensei review.
5. **Generate style presets (package first).** Looks and behaviors (post
   grades, camera feel, game feel, lighting styles/fixtures) are generated in
   code: `create*GeneratorRecipe` → `createGenerated*PresetDocument` /
   `generate*Preset` from the matching subpath, deterministic per seed. Use
   the MCP style tools (`create_style_recipe` / `generate_style_presets`)
   only when you want validated batches persisted to the shared workspace
   where the labs and later sessions can see them.

Persist anything worth keeping with `save_creation` (or write the JSON into
the repo); `.toonlab/creations/` is the shared surface labs and later
sessions read.

For every completed asset request, update or report the scene family, kit
role, selected route, license/provenance, rendering domain, material roles,
support level, collision/LOD status, Call Me Sensei verification, and coverage
gap that was closed. State explicitly when gallery search was skipped because
an approved generator owned the role.

## Manufactured environment material contract

For generated or imported props, vehicles, buildings, furniture, and interior
assets, classify each material once with glTF extras / Three.js
`userData.urbanMaterial`. Author the versioned object with these axes:

- `baseMaterial`: `metal`, `mineral`, `wood`, `polymer`, `rubber`, `glass`,
  `ceramic`, `textile`, `leather`, `paper`, `composite`, `fluid`, or
  `genericDielectric`.
- `finish`: `raw`, `painted`, `varnished`, `clearCoated`, `polished`,
  `brushed`, `glazed`, `anodized`, `mirror`, or `matte`.
- `renderMode`: `opaque`, `alphaCutout`, `translucent`, `transmissive`, or
  `unlit`.
- `structuralRole`: `primaryMass`, `secondaryStructure`, `trim`, `fastener`,
  `cavity`, `window`, `graphic`, or `lightEmitter`.
- `contentFlags`: any of `graphic`, `display`, and `emissive`.

Preserve source color and every available PBR map. Classification supplies
stable meaning and fallback priors; it never replaces albedo, roughness,
metalness, normal, AO, emissive, clearcoat, transmission, opacity, or UV data.

- Put classification on the material when a mesh has multiple materials. A
  node classification is a default for every material below it.
- Split materials or provide a material-ID mask when one atlas spans
  incompatible classes such as masonry, wood, metal, and window glass.
- Keep wear, dirt, rust, chipped coating, wetness, burn, snow, and similar
  conditions in continuous masks rather than inventing material classes.
- Never encode pastel amount, palette overrides, cel thresholds, reflection
  strength, or time-of-day values in the model.
- Never reclassify a model to suit a shader. Custom shaders consume the stable
  axes and define global settings plus sparse per-axis profiles.
- Accept the old `urbanSurface` IDs only through the documented compatibility
  map; do not author `lid`, `roof`, or `trim` as physical material classes.
- Reload the exported GLB and inspect classifications, fallback warnings, and
  mixed-atlas boundaries before judging only a beauty render.
- Run `analyzeManufacturedAsset(root)` as the code-first audit. Names, PBR
  slots, alpha/transmission, emission, and metalness can cover clean assets;
  never guess material identity from RGB alone. Use visual analysis only as
  offline assistance for mixed/anonymous atlases and approve its proposal into
  a material split, ID mask, or explicit assignment.
- For FBX, OBJ/MTL, USDZ, VRM, PMX/PMD, third-party GLB, and other sources
  that cannot safely carry custom properties, write a versioned
  `*.toonlab-materials.json` sidecar and apply it after loading. The runtime
  classification layer never edits geometry, UVs, or texture pixels.
- Review and temporarily switch tags in the Manufactured Material Lab; export
  its sidecar to make the result durable.

## Sample and compare (vision-capable agents)

For surfaces that dominate the look (terrain, floors, walls, hero props),
don't take the first hit — produce 2–3 candidates across routes and look at
them before choosing:

- **Generated**: texgen is part of the npm package, not an MCP tool — bake
  candidates headlessly with a short node script:
  `evaluateTextureMaps(createTextureSettings(findTexturePreset(id).settings),
  { size: 256 })` (async, ~50 ms) returns raw RGBA maps; encode the albedo
  to PNG and write it next to the imports.
- **Discovered**: `import_cc0_asset` already leaves real image files in
  `.toonlab/imports/`.

View the swatches side by side, judge fit against the game's stylized look,
then confirm the winner in-scene (toon shading changes how a texture reads).
If you cannot view images, fall back to the routing heuristics and rely on
the in-scene verify step. This costs extra tokens — reserve it for hero
surfaces and take the first good match for incidental materials.

## Which source for which asset

Stable routing (the source list itself grows — treat the registry, not this
table, as the source of truth):

- Seamless PBR material sets (brick, wood, ground …) → ambientCG.
- Photoscanned props, HDRIs, high-end texture sets → Poly Haven.
- Stylized/toon-ready models, vegetation, buildings → the built-in
  procedural catalog first only for families that passed the base-set
  reliability gate; otherwise compare curated external candidates.
- Stylized *seamless textures* → `@call-me-sensei/toonlab/texgen` in code
  (60+ presets); the catalog has no texture entries, so this route is a
  package import, not an MCP call.
- Audio, fonts, adjacent media → not automated; link the developer to the
  source and import the downloaded file.

Sources carry their own metadata (`kinds`, `goodFor`, `qualityTier`,
`enabled`) in the registry (`src/assetlib/sources.js`, surfaced through the
asset tools). New sources appear over time; query rather than assume.

## Licensing and curation rules

- Enabled sources are owner-curated to the project quality bar; disabled
  ones are pending review. Do not bypass the tools with ad-hoc downloads
  from other sites — moderation and provenance exist for a reason.
- CC0 clears copyright, not trademarks, logos, or personality rights
  visible in scans. If an asset shows a brand or a person, flag it instead
  of importing.
- Every imported ref keeps `source` + attribution provenance. Preserve it;
  some sources (e.g. Poly Haven's API terms) want credit even though the
  assets are CC0. Surface attribution in the app's credits.
- CC-BY additionally requires appropriate creator credit, the license link,
  the source link when supplied, and an indication of modifications. Preserve
  those fields through conversions, bundles, scenes, and exports.

## Verify

- Preview imported GLBs/textures in the consumer app's actual scene and
  toon/environment shading — reference-realistic assets can clash with a
  stylized look.
- For procedural assets, pin the `seed` and confirm the app regenerates the
  identical asset.
