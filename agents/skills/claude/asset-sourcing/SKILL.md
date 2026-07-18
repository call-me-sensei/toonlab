---
name: asset-sourcing
description: Help agents find, generate, and import assets — package-first procedural generation, the ToonLab MCP for external CC0 discovery/import and shared workspace state, and licensing provenance.
---

# Asset Sourcing

Use this skill when a developer needs an asset — a model, texture, HDRI,
prop, tree, rock, building, material, or a saved look/behavior preset.

Read first:
- `docs/mcp.md` (only the MCP-routed steps need a connected server)

**The boundary:** the npm package is the default worker — anything it can do
(procedural generation, style presets, texture baking) happens as code in the
app or a short node script. Route through the ToonLab MCP only where it adds
something beyond the package: external discovery, curation/moderation policy,
download provenance, or shared workspace state. Do not use MCP tools as a
proxy for package functions.

## Decision order

Work down this list; stop at the first hit.

1. **Reuse what exists.** Earlier imports, saved presets, and exports live in
   `.toonlab/` on disk. Query via MCP (`list_my_creations` / `search_assets`
   with `source: 'workspace'` or `'library'`, then `get_my_creation` /
   `get_asset`) or read the folder directly when working inside the project.
   Never regenerate or re-download something already there.
2. **Generate with the package (no server).** The built-in catalog ships in
   `@call-me-sensei/toonlab/catalog`: `catalog.list({ kind, cluster, tags,
   text })` to browse trees, rocks, debris, props, buildings, paths, then
   `catalog.spawn(id, { seed })` for a deterministic, placeable asset.
   Seamless stylized textures: `@call-me-sensei/toonlab/texgen`. This is the
   best fit for a stylized/toon look and stays re-rollable and re-editable;
   prefer it over downloads for anything the package covers.
3. **Search CC0 sources (MCP earns its place here).**
   `search_cc0_assets({ query, kind, provider })` covers external providers
   for what procedural generation can't make: reference-quality PBR texture
   sets, HDRIs, and photoscanned props. Then `get_cc0_asset` for details and
   `import_cc0_asset` to download the actual files into `.toonlab/imports/`
   with a provenance manifest. This route stays on MCP because it carries the
   network fetch, the owner curation policy, and licensing provenance —
   selection is by name/tags only, so always preview imports in-scene before
   committing to them.
4. **Generate style presets (package first).** Looks and behaviors (post
   grades, camera feel, game feel, lighting styles/fixtures) are generated in
   code: `create*GeneratorRecipe` → `createGenerated*PresetDocument` /
   `generate*Preset` from the matching subpath, deterministic per seed. Use
   the MCP style tools (`create_style_recipe` / `generate_style_presets`)
   only when you want validated batches persisted to the shared workspace
   where the labs and later sessions can see them.

Persist anything worth keeping with `save_creation` (or write the JSON into
the repo); `.toonlab/creations/` is the shared surface labs and later
sessions read.

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
  procedural catalog first; external low-poly sources only if curated.
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

## Verify

- Preview imported GLBs/textures in the consumer app's actual scene and
  toon/environment shading — reference-realistic assets can clash with a
  stylized look.
- For procedural assets, pin the `seed` and confirm the app regenerates the
  identical asset.
