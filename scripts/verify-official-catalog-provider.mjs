import assert from 'node:assert/strict';

import {
  createOfficialCatalogProvider,
  normalizeOfficialCatalogAsset,
  OFFICIAL_CATALOG_ASSET_VERSION,
  OfficialCatalogProviderError,
  resolveOfficialCatalogUrl,
} from '../src/catalog/officialCatalogProvider.js';

function rockRow(overrides = {}) {
  return {
    id: 'rock-0303',
    kind: 'model',
    name: 'Alpine ridge',
    source: 'toonlab-rock',
    download_url: 'official/2026-08/rock-0303/rock.glb',
    thumbnail_url: 'official/2026-08/rock-0303/thumb.webp',
    metadata: {
      catalog: 'rocks',
      recipeHash: 'recipe-sha-0303',
      revision: 7,
      recipe: {
        kind: 'toonlab/rock-recipe',
        lod: { count: 3, distances: [0, 45, 120] },
        version: 1,
      },
    },
    ...overrides,
  };
}

const localRequests = [];
const localProvider = createOfficialCatalogProvider({
  baseUrl: 'http://127.0.0.1:5176/',
  fetchImpl: async (url, init) => {
    localRequests.push({ init, url });
    if (url.includes('/rock-0303')) {
      return new Response(JSON.stringify({ asset: rockRow() }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [rockRow()], total: 1 }), { status: 200 });
  },
  headers: { authorization: 'Bearer local-test' },
  transport: 'workspace',
});
const localAsset = await localProvider.getAsset('rock-0303');
assert.equal(localRequests[0].url, 'http://127.0.0.1:5176/api/toonlab/catalog/rock-0303');
assert.equal(localRequests[0].init.headers.authorization, 'Bearer local-test');
assert.equal(localAsset.schemaVersion, OFFICIAL_CATALOG_ASSET_VERSION);
assert.equal(localAsset.domain, 'natural.rock');
assert.equal(localAsset.modelUrl, 'http://127.0.0.1:5176/official/2026-08/rock-0303/rock.glb');
assert.equal(localAsset.thumbnailUrl, 'http://127.0.0.1:5176/official/2026-08/rock-0303/thumb.webp');
assert.equal(localAsset.identity, 'toonlab-rock:rock-0303@7:recipe-sha-0303');
assert.equal(Object.isFrozen(localAsset), true);
assert.equal(Object.isFrozen(localAsset.recipe.lod), true);

const publicRequests = [];
const hostedProvider = createOfficialCatalogProvider({
  baseUrl: 'https://toonlab.io/',
  fetchImpl: async (url) => {
    publicRequests.push(url);
    return new Response(JSON.stringify({
      assets: [{
        ...rockRow({ download_url: undefined, source: undefined, thumbnail_url: undefined }),
        artifacts: [{
          byteSize: 42,
          contentType: 'model/gltf-binary',
          download: '/official/2026-08/rock-0303/rock.glb',
          name: 'rock.glb',
          sha256: 'model-sha-0303',
        }],
        recipe: rockRow().metadata.recipe,
        recipeHash: 'recipe-sha-0303',
        revision: 7,
        thumbnailUrl: '/official/2026-08/rock-0303/thumb.webp',
      }],
      schemaVersion: 1,
    }), { status: 200 });
  },
  transport: 'public-rock',
});
const hostedAsset = await hostedProvider.getAsset('rock-0303');
assert.equal(publicRequests[0], 'https://toonlab.io/api/v1/rock-catalog');
assert.equal(hostedAsset.modelUrl, 'https://toonlab.io/official/2026-08/rock-0303/rock.glb');
assert.equal(hostedAsset.provenance.modelSha256, 'model-sha-0303');
assert.equal(hostedAsset.provenance.source, 'toonlab-rock');

assert.equal(
  resolveOfficialCatalogUrl('../models/rock.glb', 'https://assets.toonlab.io/releases/current/'),
  'https://assets.toonlab.io/releases/models/rock.glb',
);

assert.throws(() => normalizeOfficialCatalogAsset(
  rockRow({ id: 'rock-9999' }),
  {
    baseUrl: 'https://toonlab.io/',
    expectedId: 'rock-0303',
    expectedSource: 'toonlab-rock',
  },
), OfficialCatalogProviderError);
assert.throws(() => normalizeOfficialCatalogAsset(
  rockRow({ metadata: { ...rockRow().metadata, recipeHash: '' } }),
  { baseUrl: 'https://toonlab.io/', expectedSource: 'toonlab-rock' },
), /recipeHash is required/u);

console.log('Official catalog provider verification passed.');
