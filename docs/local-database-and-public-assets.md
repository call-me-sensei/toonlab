# Local database and public asset releases

ToonLab OSS uses local Postgres as the authoritative structured store. The
browser is an editing surface, not a durable database. `.toonlab/objects`
contains opaque binaries only; `files` rows carry their identity, checksum,
type, size, and relationship to a creation.

## Setup

```sh
cp .env.example .env
npm install
npm run setup
npm run dev
```

`npm run setup` starts the bundled Postgres 17 Compose service when
`DATABASE_URL` is unset or points at the bundled local service. For an
existing Postgres installation, set `DATABASE_URL`; setup skips Compose,
applies schema migrations, applies catalog seeds, and reports which provider
keys are enabled.

Docker Desktop users must start the application and complete its first-run
setup before running ToonLab setup. The runner accepts `docker compose`,
Docker Desktop's bundled macOS Compose binary, or `docker-compose`, and emits
a targeted error if the engine is not running.

For every later release:

```sh
git pull --ff-only
npm install
npm run update
```

`npm run update` uses the same idempotent migration and seed runner as setup.
End users never choose individual SQL files. Fresh databases apply every
versioned catalog batch; existing databases apply only batches missing from
`catalog_seed_batches`. Released seed files are append-only history and must
not be edited or replaced.

The development server binds to `127.0.0.1` by default. Provider keys remain
in the Node environment and are never returned to browser code:

- `TRIPO_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ARK_API_KEY`
- `POLYPIZZA_API_KEY`

## Durable data

- `creations`: named lab documents, imported/generated assets, style profiles,
  and style bundles.
- `lab_drafts`: explicit in-progress documents.
- `lab_state`: a compatibility bridge for synchronous lab stores. Values are
  held only in browser memory while the app is running and are committed to
  Postgres.
- `files`: metadata for content-addressed binaries in `.toonlab/objects`.
- `catalog_assets`: official public release metadata and R2 URLs.
- `generation_jobs`: local provider requests and results.
- `schema_migrations` and `catalog_seed_batches`: independent idempotency
  ledgers.

On first connection, browser localStorage and the old IndexedDB library are
imported in transactions. Import runs record imported/skipped counts and
validation failures. After a successful browser-state commit, durable browser
copies are removed.

## Official asset release procedure

Official assets use:

```text
official/<release>/<asset-id>/<filename>
```

Redistributable asset packs use stable subtrees without flattening extracted
paths:

```text
official/<release>/<asset-id>/
  original/<original-archive-name>.zip
  files/<preserved-relative-path>
  thumbnails/catalog.webp
  notices/<original-readme-and-license-files>
```

Do not overwrite or reuse release keys.

The ToonLab OSS public bucket is `toonlab-oss`. Official release manifests and
catalog seeds must use `https://assets.toonlab.io` as their public base. The
private CDN, signed URLs, `creation-files` paths, `r2.dev`, and the
credentials-protected S3 API endpoint are rejected by the release and seed
validators.

1. Verify license, attribution, original-archive redistribution, extracted-file
   redistribution, preview rights, quality, and OSS eligibility for every
   asset. Custom terms must have an approved checked-in reviewed-license
   record and evidence; site-wide terms alone are not enough when a pack
   README or contributed creator may govern.
2. Normalize the distributable file and thumbnails.
3. Upload the immutable objects to R2.
4. Verify CDN GET/HEAD behavior, CORS, SHA-256, byte size, and content type.
5. Download the verified `toonlab.oss-catalog-release.v2` manifest from
   ToonLab Pro and run:

   ```sh
   npm run catalog:seed:generate -- \
     --manifest release.json \
     --out database/seeds/catalog/0002_release_name.sql
   ```

6. Run `npm run db:seed` against both a clean database and an upgraded
   database.

The generator rejects unsafe or duplicate extracted paths, missing review
fields, invalid content types/checksums, non-public or non-immutable URLs,
files outside the approved scope, and unapproved custom licenses. It emits an
upsert so a later immutable release can move an existing stable asset ID to its
new verified URL while leaving omitted catalog entries untouched. See
`docs/catalog-asset-pack-manifest.example.json` for the manifest shape.

Catalog withdrawals are append-only metadata releases. A withdrawal hides the
primary and individual download URLs and records a reason. A legal takedown may
also remove the corresponding R2 objects despite the normal immutable-object
rule.

Schema migrations never contain catalog content. A seed filename and digest
are immutable once applied. `catalog_seed_batches` prevents upgrades from
resetting or deleting local Library data.

Each official dataset is a new numbered content seed, not a schema migration
and not a replacement for one mutable master seed. Keeping all batches in the
repository ensures a clean installation and a fully upgraded installation
converge on the same catalog.

The repository currently contains only the empty bootstrap batch until a
verified Pro manifest is downloaded and committed as the next numbered seed.
`npm run setup` reports the resulting official asset count explicitly; an
applied bootstrap batch does not imply that the Gallery has official rows.

Community publications are not official releases. Pro first exports an
explicit allowlist, copies the selected verified bytes into an `official/`
release prefix, and only then produces an OSS seed. First-party ToonLab rocks
and trees plus eligible mirrored open assets are official OSS datasets; there
is currently no premium asset tier. Pro releases them from the
exact-email-controlled OSS release page after their published revisions,
license scope, and public delivery verify. Character Setup,
private/team content, retracted/taken-down publications, prompts, reports,
references, and generation attempts remain excluded.

First-party rock rows must include `metadata.dimensionsMeters` with positive
numeric `width`, `height`, and `depth`. These are the realized LOD0 target
bounds in meters. Gallery and MCP search results expose this compact spatial
metadata with family/profile and taxonomy so an agent can shortlist rocks
without downloading or rendering each GLB; the detail call retains the full
recipe, lineage, and immutable artifact list.
