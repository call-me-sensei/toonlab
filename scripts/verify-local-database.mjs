import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const migration = await readFile(new URL('../database/migrations/0001_local_workspace.sql', import.meta.url), 'utf8');
const compose = await readFile(new URL('../compose.yaml', import.meta.url), 'utf8');
const repository = await readFile(new URL('../database/repository.mjs', import.meta.url), 'utf8');
const cleanupMigration = await readFile(
  new URL('../database/migrations/0003_remove_autosaves_from_library.sql', import.meta.url),
  'utf8',
);
const packMigration = await readFile(
  new URL('../database/migrations/0004_catalog_asset_packs.sql', import.meta.url),
  'utf8',
);
const vitePlugin = await readFile(new URL('../mcp/vite-plugin.mjs', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../labs/shared/workspace-bootstrap.js', import.meta.url), 'utf8');
const gallery = await readFile(new URL('../labs/gallery/main.js', import.meta.url), 'utf8');
const libraryPage = await readFile(new URL('../labs/library/main.js', import.meta.url), 'utf8');
const libraryHtml = await readFile(new URL('../library/index.html', import.meta.url), 'utf8');
const stylesPage = await readFile(new URL('../labs/styles/main.js', import.meta.url), 'utf8');
const setup = await readFile(new URL('./setup-local.mjs', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
for (const table of [
  'creations',
  'lab_drafts',
  'files',
  'catalog_assets',
  'generation_jobs',
  'schema_migrations',
  'catalog_seed_batches',
]) {
  assert.match(migration, new RegExp(`create table if not exists ${table}\\b`));
}
assert.match(migration, /references creations\(id\) on delete cascade/);
assert.match(migration, /search_tsv tsvector generated always/);
assert.match(packMigration, /create table if not exists catalog_asset_files/);
assert.match(packMigration, /availability_status in \('active', 'withdrawn'\)/);
assert.match(compose, /127\.0\.0\.1:\$\{TOONLAB_POSTGRES_PORT:-55432\}:5432/);
assert.match(vitePlugin, /saveLibraryEntry\(entry\)/);
assert.doesNotMatch(vitePlugin, /saveLibraryEntry\(workspacePath,\s*entry\)/);
assert.match(vitePlugin, /deleteLibraryEntry\(id\)/);
assert.match(bootstrap, /if \(!migrated\?\.initialized\)/);
assert.match(repository, /setLabStateWithClient\(client, key, value\)/);
assert.doesNotMatch(repository, /for \(const \[key, value\].*await setLabState\(key, value\)/s);
assert.match(repository, /filter\(\(\[storeKey\]\) => !storeKey\.startsWith\('__'\)\)/);
assert.match(cleanupMigration, /\? '__current__'/);
assert.match(libraryPage, /\/library\/\?id=/);
assert.match(libraryHtml, /Nothing saved yet/);
assert.match(stylesPage, /STYLE_BUNDLE_SLOTS/);
assert.match(stylesPage, /The Styles editor metadata is out of sync/);
assert.match(stylesPage, /Your saved documents/);
assert.match(gallery, /offset: String\(\(state\.page - 1\) \* PAGE_SIZE\)/);
assert.equal(packageJson.scripts.update, 'node scripts/setup-local.mjs --update');
assert.match(setup, /applyMigrations\(\)/);
assert.match(setup, /applyCatalogSeeds\(\)/);
assert.match(setup, /Official catalog assets:/);
assert.match(setup, /no verified release seed is checked in yet/);
assert.match(setup, /Docker\.app\/Contents\/Resources\/cli-plugins\/docker-compose/);
assert.match(setup, /Docker Desktop is installed but its engine is not running/);
assert.match(setup, /ToonLab setup could not continue/);
assert.match(readme, /Never edit, rename, or replace a released migration or\s+seed file/);
assert.match(readme, /npm run update/);

const { extractNamedLabStateDocuments } = await import('../database/repository.mjs');
assert.deepEqual(
  extractNamedLabStateDocuments({
    __current__: { json: '{"id":"draft","label":"Draft"}' },
  }),
  [],
);
assert.deepEqual(
  extractNamedLabStateDocuments({
    'named-rock': { json: '{"type":"rock-project","label":"Named rock"}' },
  }),
  [{
    document: { type: 'rock-project', label: 'Named rock' },
    storeKey: 'named-rock',
  }],
);

const directory = await mkdtemp(join(tmpdir(), 'toonlab-seed-'));
try {
  const manifestPath = join(directory, 'release.json');
  const seedPath = join(directory, 'seed.sql');
  await writeFile(manifestPath, JSON.stringify({
    schema: 'toonlab.oss-catalog-release.v2',
    assets: [{
      attribution: 'Example',
      byteSize: 123,
      contentType: 'model/gltf-binary',
      downloadUrl: 'https://assets.toonlab.io/official/2026-08/example/asset.glb',
      id: 'example',
      kind: 'model',
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      redistributionScope: 'archive',
      reviewedAt: '2026-08-03',
      attributionRequired: false,
      licenseReview: {
        allowedScope: 'archive',
        evidenceSha256: 'b'.repeat(64),
        requiredCredit: 'None required',
        reviewedAt: '2026-08-03',
        reviewer: 'ToonLab verification',
      },
      name: 'Example',
      sha256: 'a'.repeat(64),
      source: 'test',
      tags: ['test'],
    }],
    publicBaseUrl: 'https://assets.toonlab.io',
    release: '2026-08',
  }));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', manifestPath,
      '--out', seedPath,
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`seed generator exited ${code}`)));
  });
  const seed = await readFile(seedPath, 'utf8');
  assert.match(seed, /insert into catalog_assets/);
  assert.match(seed, /on conflict \(id\) do update set/);
  assert.match(seed, /download_url = excluded\.download_url/);
  assert.match(seed, /delete from catalog_asset_files where asset_id in/);
  assert.doesNotMatch(seed, /on conflict \(id\) do nothing/);

  const missingRockDimensionsPath = join(directory, 'missing-rock-dimensions.json');
  const missingRockDimensions = JSON.parse(await readFile(manifestPath, 'utf8'));
  missingRockDimensions.assets[0].metadata = { catalog: 'rocks' };
  await writeFile(missingRockDimensionsPath, JSON.stringify(missingRockDimensions));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', missingRockDimensionsPath,
      '--out', join(directory, 'missing-rock-dimensions.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('rock release without dimensions was accepted')));
  });

  const signedManifestPath = join(directory, 'signed-release.json');
  const signedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  signedManifest.assets[0].downloadUrl += '?sign=private';
  await writeFile(signedManifestPath, JSON.stringify(signedManifest));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', signedManifestPath,
      '--out', join(directory, 'signed.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('signed catalog URL was accepted')));
  });

  const invalidManifestPath = join(directory, 'invalid-release.json');
  await writeFile(invalidManifestPath, JSON.stringify({
    schema: 'toonlab.oss-catalog-release.v2',
    assets: [{
      byteSize: 123,
      contentType: 'model/gltf-binary',
      downloadUrl: 'https://assets.toonlab.io/official/2026-08/example/asset.glb',
      id: 'example',
      kind: 'model',
      license: 'LicenseRef-DENDEWA-ASSETS-2026-04-07',
      licenseUrl: 'https://dendewa.vercel.app/legal/assets-license',
      redistributionScope: 'archive-and-files',
      reviewedAt: '2026-08-03',
      attributionRequired: true,
      attribution: 'Required credit',
      licenseReview: {
        allowedScope: 'archive-and-files',
        permissionEvidence: 'unverified-placeholder',
        evidenceSha256: 'b'.repeat(64),
        requiredCredit: 'Required credit',
        reviewedAt: '2026-08-03',
        reviewer: 'ToonLab verification',
      },
      name: 'Example',
      sha256: 'a'.repeat(64),
      source: 'test',
    }],
    publicBaseUrl: 'https://assets.toonlab.io',
    release: '2026-08',
  }));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      new URL('./generate-catalog-seed.mjs', import.meta.url).pathname,
      '--manifest', invalidManifestPath,
      '--out', join(directory, 'invalid.sql'),
    ], { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => code !== 0 ? resolve() : reject(new Error('unapproved Dandewa redistribution was accepted')));
  });
} finally {
  await rm(directory, { force: true, recursive: true });
}

console.log('Local database and catalog-seed verification passed.');
