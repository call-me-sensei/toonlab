# Local MCP and `.toonlab` workspace

The open-source ToonLab server is a local [Model Context Protocol](https://modelcontextprotocol.io/)
server that lets coding agents use the same assets and recipes as the browser
labs. It uses the stdio transport and does not require a ToonLab account,
OAuth, or a hosted service.

## Start and connect

```bash
npm install
npm run dev
```

Open `http://localhost:5175/settings/` and copy the generated JSON into your
client's local MCP configuration. The paths are absolute so the client can
start the server from any working directory.

You can also start the server directly:

```bash
npm run mcp -- --workspace /absolute/path/to/project/.toonlab
```

When installed from npm, the package exposes the `toonlab-mcp` binary:

```bash
npx -y @call-me-sensei/toonlab@latest --workspace /absolute/path/to/project/.toonlab
```

## Workspace layout

`.toonlab/` is the local source of truth and is ignored by Git by default.

```text
.toonlab/
  assets/           # project-owned asset files
  creations/        # MCP-created recipes and documents
  exports/          # copies of files exported from browser labs
  imports/          # downloaded CC0 bundles and attribution manifests
  library/entries/  # catalog entries saved from any lab
  presets/          # portable preset files
  storage/          # browser lab documents mirrored as JSON
  toonlab.json      # workspace version and migration markers
```

Existing ToonLab `localStorage` and IndexedDB catalog data is imported the
first time the local Vite server sees it. After that, disk wins at startup and
browser changes are mirrored back to disk. The current synchronous lab stores
therefore keep working without hiding data from MCP.

Provider API keys are intentionally excluded from the workspace. They remain
in browser storage and are never made available to MCP.

## Tools

The OSS server currently exposes:

- `get_workspace_info` — workspace path, version, and migration status.
- `search_assets` / `get_asset` — built-in procedural catalog, saved library,
  lab documents, presets, imports, and exports.
- `list_my_creations` / `get_my_creation` / `save_creation` — direct local
  project persistence.
- `generate_asset` — deterministic seeded recipes from built-in catalog
  entries, saved into `.toonlab/creations` by default.
- `search_cc0_assets` / `get_cc0_asset` / `import_cc0_asset` — public CC0
  models, textures, and HDRIs from Poly Haven and ambientCG, including source
  and attribution metadata.
- `get_generation_capabilities` — a machine-readable description of what is
  local versus hosted-Pro functionality.
- `list_style_labs` — the seven open-ended style generators, browser paths,
  npm runtime imports, extension families, and generation capabilities.
- `create_style_recipe` — create and optionally save a portable Post, Camera,
  Motion, UI Theme, Biome, Soundscape, or Game Feel generator recipe.
- `generate_style_presets` — resolve and validate one to 64 deterministic
  runtime presets from any style recipe; consecutive seeds make large design
  searches efficient without a fixed catalog.
- `validate_style_document` — validate a generator recipe or resolved preset
  against the selected lab schema.

The server also exposes assets as `toonlab://asset/...` MCP resources. Small
JSON/text files and binaries can be read inline; every disk file includes an
absolute path so local development tools can consume larger files directly.

Style generation is a design-time workflow. Labs and MCP author recipes and
resolve candidates; the `@call-me-sensei/toonlab/*` npm subpaths own the
shipping runtime that applies the selected flat preset. See
[Generative style labs](style-labs.md) for the shared recipe contract and all
seven runtime APIs.

## OSS and Pro boundary

Open source owns the local workflow: disk persistence, procedural generation,
CC0 discovery/import, and stdio MCP. ToonLab Pro can use the same conceptual
tool schemas with cloud adapters, adding remote Streamable HTTP + OAuth,
private cloud libraries, cross-device/team sync, and managed image/3D
generation providers.
