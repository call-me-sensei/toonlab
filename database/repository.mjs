import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { getPool, withTransaction } from './client.mjs';

const now = () => new Date().toISOString();
const hash = (value) => createHash('sha256').update(value).digest('hex');

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || !String(entry.id ?? '').trim()) {
    throw Object.assign(new Error('A library entry with an id is required.'), { statusCode: 400 });
  }
  const document = { ...entry };
  delete document._local;
  return {
    docKey: String(entry.id),
    type: String(entry.type ?? entry.kind ?? 'asset'),
    label: String(entry.label ?? entry.name ?? entry.id).slice(0, 120),
    description: entry.description ? String(entry.description).slice(0, 2000) : null,
    document,
    aiGenerated: entry.aiGenerated === true,
  };
}

export async function databaseInfo() {
  const pool = await getPool();
  const result = await pool.query(
    `select
       (select count(*)::int from creations) as creation_count,
       (select count(*)::int from catalog_assets) as catalog_count`,
  );
  return result.rows[0];
}

export async function listLibraryEntries() {
  const pool = await getPool();
  const result = await pool.query(
    `select id, doc_key, type, label, description, document, source,
            ai_generated, created_at, updated_at
     from creations
     order by updated_at desc, label`,
  );
  return result.rows.map((row) => ({
    ...row.document,
    id: row.doc_key,
    type: row.type,
    label: row.label,
    description: row.description ?? row.document?.description ?? '',
    aiGenerated: row.ai_generated || row.document?.aiGenerated === true,
    _local: {
      creationId: row.id,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }));
}

export async function saveLibraryEntry(entry) {
  const value = normalizeEntry(entry);
  const pool = await getPool();
  const saved = await pool.query(
    `insert into creations (doc_key, type, label, description, document, ai_generated)
     values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (type, doc_key) do update set
       label = excluded.label,
       description = excluded.description,
       document = excluded.document,
       ai_generated = creations.ai_generated or excluded.ai_generated,
       updated_at = now()
     returning id, source, created_at, updated_at`,
    [
      value.docKey,
      value.type,
      value.label,
      value.description,
      JSON.stringify(value.document),
      value.aiGenerated,
    ],
  );
  const fileId = entry?.result?.file?.id ?? entry?.file?.id ?? null;
  if (fileId) {
    await pool.query(
      `update files set creation_id = $1
       where id = $2 and creation_id is null`,
      [saved.rows[0].id, fileId],
    );
  }
  return {
    ...value.document,
    _local: {
      creationId: saved.rows[0].id,
      source: saved.rows[0].source,
      createdAt: saved.rows[0].created_at,
      updatedAt: saved.rows[0].updated_at,
    },
  };
}

export async function deleteLibraryEntry(id) {
  const pool = await getPool();
  const result = await pool.query('delete from creations where doc_key = $1', [String(id)]);
  return result.rowCount > 0;
}

export async function readLabState() {
  const pool = await getPool();
  const result = await pool.query('select key, value from lab_state order by key');
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

export function extractNamedLabStateDocuments(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map((document) => ({ document, storeKey: null }));
  }
  if (!parsed || typeof parsed !== 'object') return [];
  return Object.entries(parsed)
    .filter(([storeKey]) => !storeKey.startsWith('__'))
    .map(([storeKey, stored]) => {
      if (!stored || typeof stored !== 'object') return { document: null, storeKey };
      if (!('json' in stored)) return { document: stored, storeKey };
      try {
        return {
          document: typeof stored.json === 'string' ? JSON.parse(stored.json) : stored.json,
          storeKey,
        };
      } catch {
        return { document: null, storeKey };
      }
    });
}

async function setLabStateWithClient(client, key, value) {
  const stateKey = String(key);
  const stateValue = String(value);
  await client.query(
    `insert into lab_state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [stateKey, stateValue],
  );
  let parsed;
  try {
    parsed = JSON.parse(stateValue);
  } catch {
    return;
  }
  const labId = stateKey.match(/^toonlab\.([a-z0-9-]+)/i)?.[1] ?? 'lab';
  if (/\.document(?:\.|$)/.test(stateKey) && parsed && typeof parsed === 'object') {
    await client.query(
      `insert into lab_drafts (lab_id, draft_key, document)
       values ($1, $2, $3::jsonb)
       on conflict (lab_id, draft_key) do update set
         document = excluded.document,
         updated_at = now()`,
      [labId, stateKey, JSON.stringify(parsed)],
    );
  }
  if (!/\.(?:presets|projects)(?:\.|$)/.test(stateKey)) return;
  await client.query(
    `delete from creations
     where source = 'lab-state'
       and left(doc_key, char_length($1)) = $1`,
    [`state:${stateKey}:`],
  );
  const storedEntries = extractNamedLabStateDocuments(parsed);
  for (const { document, storeKey } of storedEntries) {
    if (!document || typeof document !== 'object' || Array.isArray(document)) continue;
    const identity = String(
      document.id
      ?? document.presetId
      ?? storeKey
      ?? '',
    ).trim();
    const explicitLabel = String(document.label ?? document.name ?? storeKey ?? '').trim();
    // A working draft/autosave has no stable user-facing identity and belongs
    // in lab_state/lab_drafts, not in the Library.
    if (!identity || !explicitLabel || identity.startsWith('__')) continue;
    const docKey = `state:${stateKey}:${identity}`;
    const type = String(document.type ?? `${labId}-${stateKey.includes('.projects') ? 'project' : 'preset'}`);
    const label = explicitLabel.slice(0, 120);
    const entry = {
      document,
      id: docKey,
      label,
      source: 'lab',
      type,
    };
    await client.query(
      `insert into creations (doc_key, type, label, document, source)
       values ($1, $2, $3, $4::jsonb, 'lab-state')
       on conflict (type, doc_key) do update set
         label = excluded.label,
         document = excluded.document,
         updated_at = now()`,
      [docKey, type, label, JSON.stringify(entry)],
    );
  }
}

export async function setLabState(key, value) {
  await withTransaction((client) => setLabStateWithClient(client, key, value));
}

export async function deleteLabState(key) {
  const stateKey = String(key);
  await withTransaction(async (client) => {
    await client.query('delete from lab_state where key = $1', [stateKey]);
    await client.query('delete from lab_drafts where draft_key = $1', [stateKey]);
    await client.query(
      `delete from creations
       where source = 'lab-state'
         and left(doc_key, char_length($1)) = $1`,
      [`state:${stateKey}:`],
    );
  });
}

export async function clearLabState() {
  await withTransaction(async (client) => {
    await client.query('truncate lab_state');
    await client.query('truncate lab_drafts');
    await client.query(`delete from creations where source = 'lab-state'`);
  });
}

export async function hasLegacyImport(source) {
  const pool = await getPool();
  const result = await pool.query(
    `select 1 from legacy_import_runs
     where source = $1 and failures = '[]'::jsonb
     limit 1`,
    [source],
  );
  return result.rowCount > 0;
}

export async function migrateLegacy({
  browserEntries = {},
  libraryEntries = [],
  source = 'browser-workspace',
} = {}) {
  const report = await withTransaction(async (client) => {
    const failures = [];
    let imported = 0;
    let skipped = 0;
    const seen = new Set();
    for (const entry of Array.isArray(libraryEntries) ? libraryEntries : []) {
      try {
        const value = normalizeEntry(entry);
        const fingerprint = `${value.type}:${value.docKey}`;
        if (seen.has(fingerprint)) {
          skipped += 1;
          continue;
        }
        seen.add(fingerprint);
        const insert = await client.query(
          `insert into creations (doc_key, type, label, description, document, ai_generated)
           values ($1, $2, $3, $4, $5::jsonb, $6)
           on conflict (type, doc_key) do nothing`,
          [value.docKey, value.type, value.label, value.description, JSON.stringify(entry), value.aiGenerated],
        );
        if (insert.rowCount) imported += 1;
        else skipped += 1;
      } catch (error) {
        failures.push({ id: entry?.id ?? null, error: error.message });
      }
    }
    for (const [key, value] of Object.entries(browserEntries ?? {})) {
      if (typeof value !== 'string') {
        failures.push({ id: key, error: 'Browser storage value is not a string.' });
        skipped += 1;
        continue;
      }
      const existing = await client.query(
        'select 1 from lab_state where key = $1',
        [key],
      );
      await setLabStateWithClient(client, key, value);
      if (!existing.rowCount) imported += 1;
      else skipped += 1;
    }
    const result = await client.query(
      `insert into legacy_import_runs (source, imported, skipped, failures)
       values ($4, $1, $2, $3::jsonb)
       returning *`,
      [imported, skipped, JSON.stringify(failures), source],
    );
    return result.rows[0];
  });
  return report;
}

export async function listCatalogAssets({ q = '', kind = '', limit = 60, offset = 0 } = {}) {
  const pool = await getPool();
  const values = [];
  const where = [`availability_status = 'active'`];
  if (q) {
    values.push(q);
    where.push(`(
      search_tsv @@ plainto_tsquery('simple', $${values.length})
      or source ilike '%' || $${values.length} || '%'
      or exists (select 1 from unnest(tags) tag where tag ilike '%' || $${values.length} || '%')
    )`);
  }
  if (kind) {
    values.push(kind);
    where.push(`kind = $${values.length}`);
  }
  values.push(Math.min(Math.max(Number(limit) || 60, 1), 100));
  const limitIndex = values.length;
  values.push(Math.max(Number(offset) || 0, 0));
  const offsetIndex = values.length;
  const clause = `where ${where.join(' and ')}`;
  const result = await pool.query(
    `select *, count(*) over()::int as total
     from catalog_assets ${clause}
     order by created_at desc, id
     limit $${limitIndex} offset $${offsetIndex}`,
    values,
  );
  return {
    items: result.rows.map(({ total: _total, ...row }) => row),
    total: result.rows[0]?.total ?? 0,
  };
}

export async function getCatalogAsset(id) {
  const pool = await getPool();
  const asset = await pool.query(
    'select * from catalog_assets where id = $1 limit 1',
    [String(id)],
  );
  if (!asset.rowCount) return null;
  const files = await pool.query(
    `select asset_id, relative_path, kind, download_url, sha256,
            byte_size, content_type, notice, compatibility, created_at
     from catalog_asset_files
     where asset_id = $1
     order by relative_path`,
    [String(id)],
  );
  return { ...asset.rows[0], files: files.rows };
}

export async function saveObject(workspacePath, bytes, { name, contentType, creationId = null, kind = 'asset' }) {
  const digest = hash(bytes);
  const extension = String(name ?? '').includes('.') ? `.${String(name).split('.').pop()}` : '';
  const objectKey = `${digest.slice(0, 2)}/${digest}${extension}`;
  const destination = join(workspacePath, 'objects', objectKey);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const pool = await getPool();
  const result = await pool.query(
    `insert into files (creation_id, kind, object_key, content_type, byte_size, sha256)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (creation_id, object_key) do update set object_key = excluded.object_key
     returning *`,
    [creationId, kind, objectKey, contentType, bytes.byteLength, digest],
  );
  return {
    ...result.rows[0],
    absolutePath: destination,
    mimeType: contentType,
    modifiedAt: now(),
    name,
    relativePath: `objects/${objectKey}`,
    sizeBytes: bytes.byteLength,
  };
}

export async function readObject(workspacePath, relativePath) {
  const normalized = String(relativePath ?? '').replaceAll('\\', '/').replace(/^objects\//, '');
  if (!normalized || normalized.split('/').includes('..')) throw new Error('Invalid object path.');
  const root = resolve(workspacePath, 'objects');
  const absolutePath = resolve(root, normalized);
  if (!absolutePath.startsWith(`${root}${sep}`)) throw new Error('Object path escapes the workspace.');
  const pool = await getPool();
  const result = await pool.query(
    'select content_type, byte_size from files where object_key = $1',
    [normalized],
  );
  if (!result.rowCount) throw Object.assign(new Error('Object not found.'), { statusCode: 404 });
  const info = await stat(absolutePath);
  return {
    data: await readFile(absolutePath),
    mimeType: result.rows[0].content_type,
    name: normalized.split('/').pop(),
    relativePath: `objects/${normalized}`,
    sizeBytes: Number(info.size),
  };
}

export async function listObjects(workspacePath) {
  const pool = await getPool();
  const result = await pool.query('select * from files order by created_at desc');
  return result.rows.map((file) => ({
    absolutePath: join(workspacePath, 'objects', file.object_key),
    id: `file:objects/${file.object_key}`,
    kind: file.kind,
    mimeType: file.content_type,
    modifiedAt: file.created_at,
    name: file.object_key.split('/').pop(),
    relativePath: `objects/${file.object_key}`,
    sizeBytes: Number(file.byte_size),
    source: 'workspace',
  }));
}

export async function saveCreationDocument({
  document,
  kind = 'creation',
  name = 'Untitled',
} = {}) {
  if (document === undefined) throw new Error('document is required.');
  const id = `creation:${randomUUID()}`;
  const entry = {
    document,
    id,
    kind,
    label: name,
    source: 'library',
    type: kind,
  };
  await saveLibraryEntry(entry);
  return entry;
}

export function providerConfiguration() {
  const providers = {
    tripo: Boolean(process.env.TRIPO_API_KEY || process.env.TRIPO_API_KEYS),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS),
    openai: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEYS),
    ark: Boolean(process.env.ARK_API_KEY || process.env.ARK_API_KEYS),
    polypizza: Boolean(process.env.POLYPIZZA_API_KEY),
  };
  return {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    imageModels: [
      {
        configured: providers.gemini,
        id: 'nano-banana-2-lite',
        label: 'Nano Banana 2 Lite',
        model: 'gemini-3.1-flash-lite-image',
        provider: 'gemini',
        resolutions: ['1k'],
      },
      {
        configured: providers.gemini,
        id: 'nano-banana-2',
        label: 'Nano Banana 2',
        model: 'gemini-3.1-flash-image',
        provider: 'gemini',
        resolutions: ['1k', '2k', '4k'],
      },
      {
        configured: providers.gemini,
        id: 'nano-banana-pro',
        label: 'Nano Banana Pro',
        model: 'gemini-3-pro-image',
        provider: 'gemini',
        resolutions: ['1k', '2k', '4k'],
      },
    ],
    promptEnhancementConfigured: providers.gemini || providers.openai,
    providers,
    styles: [
      { id: 'stylized', label: 'Stylized (game asset)' },
      { id: 'cartoon', label: 'Cartoon / toon' },
      { id: 'raw', label: 'Raw (no style hint)' },
    ],
  };
}

export async function createGenerationJob(provider, kind, request) {
  const pool = await getPool();
  const result = await pool.query(
    `insert into generation_jobs (provider, kind, status, request, started_at)
     values ($1, $2, 'running', $3::jsonb, now())
     returning *`,
    [provider, kind, JSON.stringify(request ?? {})],
  );
  return result.rows[0];
}

export async function finishGenerationJob(id, { result = null, error = null } = {}) {
  const pool = await getPool();
  const updated = await pool.query(
    `update generation_jobs set
       status = $2,
       result = $3::jsonb,
       error = $4,
       completed_at = now(),
       updated_at = now()
     where id = $1
     returning *`,
    [id, error ? 'failed' : 'succeeded', JSON.stringify(result), error],
  );
  return updated.rows[0] ?? null;
}

export async function updateGenerationJob(id, result) {
  const pool = await getPool();
  const updated = await pool.query(
    `update generation_jobs set
       status = 'running',
       result = $2::jsonb,
       error = null,
       updated_at = now()
     where id = $1 and status in ('queued', 'running')
     returning *`,
    [id, JSON.stringify(result ?? {})],
  );
  return updated.rows[0] ?? null;
}

export async function getGenerationJob(id) {
  const pool = await getPool();
  const result = await pool.query('select * from generation_jobs where id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function listGenerationJobs({
  kind = '',
  limit = 60,
  q = '',
} = {}) {
  const pool = await getPool();
  const values = [];
  const where = [];
  if (kind) {
    values.push(kind);
    where.push(`kind = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    where.push(`coalesce(request->>'prompt', request->>'user', '') ilike $${values.length}`);
  }
  values.push(Math.min(Math.max(Number(limit) || 60, 1), 100));
  const result = await pool.query(
    `select * from generation_jobs
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by created_at desc
     limit $${values.length}`,
    values,
  );
  return result.rows;
}

export async function cancelGenerationJob(id) {
  const pool = await getPool();
  const result = await pool.query(
    `update generation_jobs set
       status = 'cancelled',
       error = 'Cancelled locally',
       completed_at = now(),
       updated_at = now()
     where id = $1 and status in ('queued', 'running')
     returning *`,
    [id],
  );
  return result.rows[0] ?? getGenerationJob(id);
}
