import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDatabase, getPool, withTransaction } from './client.mjs';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));

export async function applySqlDirectory(directory, ledger) {
  const pool = await getPool();
  if (ledger === 'schema_migrations') {
    await pool.query(
      `create table if not exists schema_migrations (
        name text primary key,
        sha256 text not null,
        applied_at timestamptz not null default now()
      )`,
    );
  } else {
    await pool.query(
      `create table if not exists catalog_seed_batches (
        name text primary key,
        sha256 text not null,
        release text,
        asset_count integer not null default 0,
        applied_at timestamptz not null default now()
      )`,
    );
  }
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const applied = [];
  for (const name of files) {
    const sql = await readFile(join(directory, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const status = await withTransaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`toonlab:${ledger}`]);
      const existing = await client.query(
        `select sha256 from ${ledger} where name = $1`,
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== hash) {
          throw new Error(`${ledger} entry ${name} changed after it was applied`);
        }
        return 'unchanged';
      }
      const beforeCount = ledger === 'catalog_seed_batches'
        ? Number((await client.query('select count(*)::int as count from catalog_assets')).rows[0].count)
        : 0;
      await client.query(sql);
      if (ledger === 'catalog_seed_batches') {
        const afterCount = Number(
          (await client.query('select count(*)::int as count from catalog_assets')).rows[0].count,
        );
        const declaredCount = Number(sql.match(/^-- Asset count: (\d+)$/m)?.[1]);
        const declaredRelease = sql.match(/^-- Release: ([a-z0-9._-]+)$/im)?.[1];
        await client.query(
          `insert into catalog_seed_batches (name, sha256, release, asset_count)
           values ($1, $2, $3, $4)`,
          [
            name,
            hash,
            declaredRelease ?? basename(name, '.sql'),
            Number.isSafeInteger(declaredCount)
              ? declaredCount
              : Math.max(0, afterCount - beforeCount),
          ],
        );
      } else {
        await client.query(
          `insert into schema_migrations (name, sha256) values ($1, $2)`,
          [name, hash],
        );
      }
      return 'applied';
    });
    applied.push({ name, status });
  }
  return applied;
}

export async function applyMigrations() {
  return applySqlDirectory(join(databaseDirectory, 'migrations'), 'schema_migrations');
}

export async function applyCatalogSeeds() {
  return applySqlDirectory(join(databaseDirectory, 'seeds', 'catalog'), 'catalog_seed_batches');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'all';
  try {
    const result = {};
    if (mode === 'all' || mode === 'migrate') result.migrations = await applyMigrations();
    if (mode === 'all' || mode === 'seed') result.seeds = await applyCatalogSeeds();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await closeDatabase();
  }
}
