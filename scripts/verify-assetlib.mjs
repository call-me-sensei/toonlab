// assetlib verification — pure-Node, OFFLINE by design: fixtures mirror real
// API payloads captured 2026-07-14 (shapes asserted against the live APIs),
// so normalization, download resolution, donation-vault filtering, and the
// catalog-entry contract are checked without touching the network.
// Run: node scripts/verify-assetlib.mjs

import process from 'node:process';
import { deflateRawSync } from 'node:zlib';

import {
  collectAssetCategories,
  filterAssetRefs,
  pickResolution,
  slugifyAssetId,
} from '../src/assetlib/assetRef.js';
import {
  fetchPolyhavenIndex,
  normalizePolyhavenIndex,
  polyhavenThumbnailUrl,
  resolvePolyhavenModelDownload,
  resolvePolyhavenTextureDownload,
} from '../src/assetlib/polyhaven.js';
import {
  normalizeAmbientcgAssets,
  resolveAmbientcgDownload,
} from '../src/assetlib/ambientcg.js';
import { importedAssetCatalogEntry } from '../src/assetlib/importedEntry.js';
import {
  normalizePolyPizzaModel,
  rewritePolyPizzaDownloadUrl,
  searchPolyPizza,
} from '../src/assetlib/polypizza.js';
import { readZipEntries } from '../src/assetlib/zip.js';
import { validateCatalogEntry } from '../src/catalog/manifest.js';
import { createCatalog } from '../src/catalog/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- fixtures (shape-faithful subsets of live payloads) ----------------------------

const NOW = 1_752_000_000; // fixed epoch seconds — determinism discipline

const POLYHAVEN_INDEX = {
  ArmChair_01: {
    authors: { 'Kirill Sannikov': 'All' },
    categories: ['furniture', 'seating'],
    date_published: NOW - 1000,
    name: 'Arm Chair 01',
    polycount: 5626,
    tags: ['gothic', 'chair', 'Wood'],
    type: 2,
  },
  vault_asset: {
    authors: {},
    categories: ['props'],
    date_published: NOW + 99_999, // donation vault / early access — must drop
    name: 'Vault Asset',
    tags: [],
    type: 2,
  },
  wooden_crate_01: {
    authors: { 'James Ray Cock': 'All' },
    categories: ['props', 'storage'],
    date_published: NOW - 5000,
    name: 'Wooden Crate 01',
    polycount: 2000,
    tags: ['crate', 'wood'],
    type: 2,
  },
};

const POLYHAVEN_MODEL_FILES = {
  blend: {},
  gltf: {
    '1k': {
      gltf: {
        include: {
          'textures/wooden_crate_01_diff_1k.jpg': { size: 711_292, url: 'https://dl.polyhaven.org/m/diff_1k.jpg' },
          'wooden_crate_01.bin': { size: 189_408, url: 'https://dl.polyhaven.org/m/model.bin' },
        },
        size: 5612,
        url: 'https://dl.polyhaven.org/m/model_1k.gltf',
      },
    },
    '4k': {
      gltf: { include: {}, size: 6000, url: 'https://dl.polyhaven.org/m/model_4k.gltf' },
    },
  },
};

const POLYHAVEN_TEXTURE_FILES = {
  AO: { '1k': { jpg: { size: 100, url: 'https://dl.polyhaven.org/t/ao_1k.jpg' } } },
  Diffuse: {
    '1k': {
      jpg: { size: 694_500, url: 'https://dl.polyhaven.org/t/diff_1k.jpg' },
      png: { size: 2_208_159, url: 'https://dl.polyhaven.org/t/diff_1k.png' },
    },
    '2k': { jpg: { size: 900_000, url: 'https://dl.polyhaven.org/t/diff_2k.jpg' } },
  },
  Rough: { '1k': { png: { size: 200, url: 'https://dl.polyhaven.org/t/rough_1k.png' } } },
  arm: { '1k': { jpg: { size: 776_699, url: 'https://dl.polyhaven.org/t/arm_1k.jpg' } } },
  nor_gl: { '1k': { jpg: { size: 594_076, url: 'https://dl.polyhaven.org/t/nor_1k.jpg' } } },
};

const AMBIENTCG_PAYLOAD = {
  foundAssets: [{
    assetId: 'Bricks097',
    dataType: 'Material',
    displayCategory: 'Bricks',
    displayName: 'Bricks 097',
    downloadFolders: {
      default: {
        downloadFiletypeCategories: {
          zip: {
            downloads: [
              { attribute: '1K-JPG', downloadLink: 'https://ambientcg.com/get?file=Bricks097_1K-JPG.zip', fileName: 'Bricks097_1K-JPG.zip', filetype: 'zip', size: 5_172_084 },
              { attribute: '2K-JPG', downloadLink: 'https://ambientcg.com/get?file=Bricks097_2K-JPG.zip', fileName: 'Bricks097_2K-JPG.zip', filetype: 'zip', size: 15_930_202 },
            ],
          },
        },
      },
    },
    previewImage: { '256-PNG': 'https://acg-media.struffelproductions.com/Bricks097_256.png' },
    shortLink: 'https://ambientcg.com/a/Bricks097',
    tags: ['brick', 'red'],
  }],
};

// --- normalization -----------------------------------------------------------------

const refs = normalizePolyhavenIndex(POLYHAVEN_INDEX, { now: NOW, type: 'models' });
check('polyhaven: vault (future-dated) assets are dropped',
  refs.length === 2 && !refs.some((ref) => ref.id === 'vault_asset'));
check('polyhaven: refs normalized (kind, lowercase tags, attribution, authors)', (() => {
  const chair = refs.find((ref) => ref.id === 'ArmChair_01');
  return chair.kind === 'model'
    && chair.tags.includes('wood')
    && chair.attribution.license === 'CC0'
    && chair.authors[0] === 'Kirill Sannikov'
    && chair.pageUrl.includes('polyhaven.com/a/ArmChair_01');
})());
check('polyhaven: thumbnail constructed when absent',
  refs.every((ref) => ref.thumbnailUrl === polyhavenThumbnailUrl(ref.id)));
check('polyhaven: sorted by name', refs[0].name <= refs[1].name);

check('filterAssetRefs: text + category + kind', (() => {
  const wood = filterAssetRefs(refs, { text: 'wood' });
  const props = filterAssetRefs(refs, { category: 'props' });
  const none = filterAssetRefs(refs, { kind: 'texture' });
  return wood.length === 2 && props.length === 1 && none.length === 0;
})());
check('collectAssetCategories: most-used first', collectAssetCategories(refs)[0] !== undefined
  && collectAssetCategories(refs).length === 4);
check('slugifyAssetId: catalog-safe', slugifyAssetId('ArmChair_01') === 'armchair-01');

// --- download resolution -----------------------------------------------------------

check('pickResolution: exact, nearest, empty',
  pickResolution({ '1k': 1, '4k': 1 }, '1k') === '1k'
  && pickResolution({ '1k': 1, '4k': 1 }, '2k') === '1k'
  && pickResolution({ '4k': 1, '8k': 1 }, '1k') === '4k'
  && pickResolution({}, '1k') === null);

const modelDownload = resolvePolyhavenModelDownload(POLYHAVEN_MODEL_FILES, { resolution: '1k' });
check('polyhaven model download: url + resources + size sum',
  modelDownload.url.endsWith('model_1k.gltf')
  && Object.keys(modelDownload.resources).length === 2
  && modelDownload.sizeBytes === 5612 + 711_292 + 189_408);
check('polyhaven model download: nearest resolution fallback',
  resolvePolyhavenModelDownload(POLYHAVEN_MODEL_FILES, { resolution: '8k' }).resolution === '4k');

const textureSet = resolvePolyhavenTextureDownload(POLYHAVEN_TEXTURE_FILES, { resolution: '1k' });
check('polyhaven texture set: diffuse/normal/arm resolved + png fallback',
  textureSet.maps.diffuse.url.endsWith('diff_1k.jpg')
  && textureSet.maps.normal.url.endsWith('nor_1k.jpg')
  && textureSet.maps.arm.url.endsWith('arm_1k.jpg')
  && textureSet.maps.roughness.url.endsWith('rough_1k.png'));
check('polyhaven texture set: throws without diffuse', (() => {
  try {
    resolvePolyhavenTextureDownload({ nor_gl: POLYHAVEN_TEXTURE_FILES.nor_gl });
    return false;
  } catch {
    return true;
  }
})());

// --- ambientCG ---------------------------------------------------------------------

const acgRefs = normalizeAmbientcgAssets(AMBIENTCG_PAYLOAD);
check('ambientcg: normalized ref with downloads',
  acgRefs.length === 1
  && acgRefs[0].kind === 'texture'
  && acgRefs[0].downloads.length === 2
  && acgRefs[0].thumbnailUrl.includes('256'));
check('ambientcg: exact attribute download',
  resolveAmbientcgDownload(acgRefs[0], { format: 'JPG', resolution: '2K' }).fileName === 'Bricks097_2K-JPG.zip');
check('ambientcg: smallest-zip fallback',
  resolveAmbientcgDownload(acgRefs[0], { format: 'EXR', resolution: '16K' }).fileName === 'Bricks097_1K-JPG.zip');

// --- Poly Pizza ----------------------------------------------------------------------

const POLYPIZZA_PAYLOAD = {
  results: [
    {
      Attribution: 'Pine Tree by Quaternius',
      Category: 'Nature',
      Creator: { Username: 'Quaternius' },
      Download: 'https://static.poly.pizza/abc123.glb',
      ID: 'abc123',
      Licence: 'CC0',
      Tags: ['Tree', 'Forest'],
      Thumbnail: 'https://static.poly.pizza/thumbs/abc123.webp',
      Title: 'Pine Tree',
      'Tri Count': 512,
    },
    {
      Attribution: 'Old Car by Somebody [CC-BY] via Poly Pizza',
      Creator: { Username: 'Somebody' },
      Download: 'https://static.poly.pizza/def456.glb',
      ID: 'def456',
      Licence: 'CC-BY',
      Title: 'Old Car',
    },
  ],
  total: 2,
};

const ppRef = normalizePolyPizzaModel(POLYPIZZA_PAYLOAD.results[0]);
check('polypizza: normalized ref (kind, license, attribution text, download)',
  ppRef.kind === 'model'
  && ppRef.attribution.license === 'CC0'
  && ppRef.attribution.text === 'Pine Tree by Quaternius'
  && ppRef.download.url.endsWith('abc123.glb')
  && ppRef.polycount === 512
  && ppRef.tags.includes('tree'));
check('polypizza: proxy url rewrite',
  rewritePolyPizzaDownloadUrl('https://static.poly.pizza/abc123.glb') === '/api/polypizza-static/abc123.glb');

const ppStub = async () => ({ json: async () => POLYPIZZA_PAYLOAD, ok: true, status: 200 });
check('polypizza: cc0Only default drops CC-BY',
  (await searchPolyPizza({ fetchImpl: ppStub, query: 'tree' })).length === 1
  && (await searchPolyPizza({ cc0Only: false, fetchImpl: ppStub, query: 'tree' })).length === 2);
check('polypizza: 401 explains the missing key', await searchPolyPizza({
  fetchImpl: async () => ({ ok: false, status: 401 }),
  query: 'tree',
}).then(() => false, (error) => error.message.includes('poly.pizza/settings/api')));

const ppEntry = importedAssetCatalogEntry(ppRef, { download: ppRef.download });
check('polypizza: imported entry validates', validateCatalogEntry(ppEntry).ok
  && ppEntry.id === 'imported/polypizza/abc123');

// --- catalog entry contract ---------------------------------------------------------

const crate = refs.find((ref) => ref.id === 'wooden_crate_01');
const entry = importedAssetCatalogEntry(crate, { download: modelDownload });
check('imported entry validates against the frozen manifest', validateCatalogEntry(entry).ok,
  validateCatalogEntry(entry).errors.join(' '));
check('imported entry shape: id/kind/cluster/tags',
  entry.id === 'imported/polyhaven/wooden-crate-01'
  && entry.kind === 'imported-glb'
  && entry.cluster === 'assetlib'
  && entry.tags.includes('imported') && entry.tags.includes('polyhaven'));
check('imported entry recipe carries re-download + attribution',
  entry.recipe.download.url === modelDownload.url
  && entry.recipe.attribution.license === 'CC0'
  && entry.recipe.attribution.sourceLabel === 'Poly Haven');

const isolated = createCatalog();
isolated.register(entry, { source: 'library' });
check('imported entry registers + lists in the catalog',
  isolated.list({ tags: ['imported'] }).length === 1);
check('imported entry refuses sync spawn with the async snippet', (() => {
  try {
    isolated.spawn(entry.id);
    return false;
  } catch (error) {
    return error.message.includes('loadImportedAsset');
  }
})());

const texEntry = importedAssetCatalogEntry(
  { ...acgRefs[0] },
  { textureSet: { format: 'jpg', maps: { diffuse: { url: 'https://x/diff.jpg' } }, resolution: '1k' } },
);
check('texture imports produce valid entries too', validateCatalogEntry(texEntry).ok
  && texEntry.id === 'imported/ambientcg/bricks097');

// --- zip reader (archive built in-memory — still offline) ----------------------------

function buildTestZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content, method] of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBytes, eocd]);
}

const zipEntries = await readZipEntries(buildTestZip([
  ['Bricks_Color.jpg', 'stored-bytes', 0],
  ['Bricks_NormalGL.jpg', 'deflated-bytes-deflated-bytes', 8],
]));
check('zip reader: STORE + DEFLATE entries decode', zipEntries.length === 2
  && new TextDecoder().decode(zipEntries[0].data) === 'stored-bytes'
  && new TextDecoder().decode(zipEntries[1].data) === 'deflated-bytes-deflated-bytes');
check('zip reader: rejects non-zip input', await readZipEntries(new Uint8Array(64)).then(() => false, () => true));

// --- fetch cache seam (stubbed — still offline) --------------------------------------

let calls = 0;
const stubFetch = async () => {
  calls += 1;
  return { json: async () => POLYHAVEN_INDEX, ok: true };
};
const first = await fetchPolyhavenIndex({ fetchImpl: stubFetch, now: NOW, type: 'models' });
await fetchPolyhavenIndex({ fetchImpl: stubFetch, now: NOW, type: 'models' });
check('index fetch is cached per type per session', calls === 1 && first.length === 2);

console.log(failures === 0 ? '\nverify-assetlib: all checks passed' : `\nverify-assetlib: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
