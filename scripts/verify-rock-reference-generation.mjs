// Exhaustive source-mesh reference contract for all 324 audited rock types.
// This test never invokes the legacy SDF generator. It verifies deterministic
// vertex deformation on a topology-rich fixture and, when the gitignored
// Unreal exports are present, checks every authored GLB and exact LOD count.
//
//   node scripts/verify-rock-reference-generation.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  ROCK_REFERENCE_CATALOG,
  createRockReferenceLodObject,
  createRockReferenceVariationProfile,
  deformRockReferenceGeometry,
} from '../src/rockgen/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = resolve(SCRIPT_DIR, '..', 'assets-local', 'rock-references');
const MANIFEST_PATH = resolve(LOCAL_ROOT, 'manifest.json');
const MATERIAL_SOURCE_MANIFEST_PATH = resolve(LOCAL_ROOT, 'material-source', 'manifest.json');

function triangles(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);
}

function arrayCopy(attribute) {
  return Array.from(attribute.array);
}

function fixtureGeometry() {
  const geometry = new THREE.BoxGeometry(2.4, 3.1, 1.7, 3, 4, 3);
  const position = geometry.getAttribute('position');
  const color = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    color[index * 3] = (index % 5) / 4;
    color[index * 3 + 1] = (index % 7) / 6;
    color[index * 3 + 2] = (index % 11) / 10;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeTangents();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function assertPreservedChannels(source, result, label) {
  assert.deepEqual(Array.from(result.index.array), Array.from(source.index.array), `${label}: indices`);
  assert.deepEqual(arrayCopy(result.getAttribute('uv')), arrayCopy(source.getAttribute('uv')), `${label}: UVs`);
  assert.deepEqual(
    arrayCopy(result.getAttribute('color')),
    arrayCopy(source.getAttribute('color')),
    `${label}: vertex colors`,
  );
  assert.equal(triangles(result), triangles(source), `${label}: triangle count`);
}

function geometryPositions(geometry) {
  return arrayCopy(geometry.getAttribute('position'));
}

function parseGlb(path) {
  const bytes = readFileSync(path);
  assert.ok(bytes.length >= 20, `${path}: non-empty GLB`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path}: glTF magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${path}: glTF version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${path}: declared byte length`);
  let offset = 12;
  let json = null;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    assert.ok(chunkEnd <= bytes.length, `${path}: valid chunk bounds`);
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(bytes.subarray(chunkStart, chunkEnd).toString('utf8').trim());
    }
    offset = chunkEnd;
  }
  assert.ok(json, `${path}: JSON chunk`);
  return json;
}

function glbTriangleCount(json) {
  let count = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      assert.equal(primitive.mode ?? 4, 4, 'rock GLB uses triangle primitives');
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const accessor = json.accessors?.[accessorIndex];
      assert.ok(accessor, 'rock GLB primitive has a count accessor');
      count += Math.floor(accessor.count / 3);
    }
  }
  return count;
}

function assertRawGeometryChannels(json, label) {
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  assert.ok(primitives.length > 0, `${label}: mesh primitive`);
  for (const primitive of primitives) {
    assert.ok(Number.isInteger(primitive.attributes?.POSITION), `${label}: positions`);
    assert.ok(Number.isInteger(primitive.attributes?.NORMAL), `${label}: normals`);
    assert.ok(Number.isInteger(primitive.attributes?.TEXCOORD_0), `${label}: UV0`);
  }
}

const source = fixtureGeometry();
const sourcePositions = geometryPositions(source);
const sourceNormals = arrayCopy(source.getAttribute('normal'));
const sourceTangents = arrayCopy(source.getAttribute('tangent'));
const familyCounts = {};
let changedProfiles = 0;

for (const entry of ROCK_REFERENCE_CATALOG) {
  const identityProfile = createRockReferenceVariationProfile({
    referenceId: entry.id,
    seed: entry.seed,
    strength: 0,
  });
  const identity = deformRockReferenceGeometry(source, identityProfile);
  assertPreservedChannels(source, identity, `${entry.id} original`);
  assert.deepEqual(geometryPositions(identity), sourcePositions, `${entry.id}: original positions`);
  assert.deepEqual(arrayCopy(identity.getAttribute('normal')), sourceNormals, `${entry.id}: original normals`);
  assert.deepEqual(arrayCopy(identity.getAttribute('tangent')), sourceTangents, `${entry.id}: original tangents`);

  const profile = createRockReferenceVariationProfile({
    referenceId: entry.id,
    seed: entry.seed + 17,
    strength: 0.65,
  });
  const repeatedProfile = createRockReferenceVariationProfile({
    referenceId: entry.id,
    seed: entry.seed + 17,
    strength: 0.65,
  });
  assert.deepEqual(profile, repeatedProfile, `${entry.id}: deterministic profile`);
  const varied = deformRockReferenceGeometry(source, profile);
  const repeated = deformRockReferenceGeometry(source, repeatedProfile);
  assertPreservedChannels(source, varied, `${entry.id} variation`);
  assert.deepEqual(geometryPositions(varied), geometryPositions(repeated), `${entry.id}: deterministic vertices`);
  if (JSON.stringify(geometryPositions(varied)) !== JSON.stringify(sourcePositions)) changedProfiles += 1;

  const sourceSize = source.boundingBox.getSize(new THREE.Vector3());
  const variedSize = varied.boundingBox.getSize(new THREE.Vector3());
  for (const axis of ['x', 'y', 'z']) {
    const ratio = variedSize[axis] / sourceSize[axis];
    assert.ok(ratio >= 0.7 && ratio <= 1.35, `${entry.id}: bounded ${axis.toUpperCase()} extent`);
  }

  const assetLods = entry.target.lodTriangles.map((target, lod) => ({
    geometry: source.clone(),
    lod,
    triangles: target,
  }));
  const authoredMaterial = new THREE.MeshStandardMaterial({ color: 0x807060 });
  const builtOriginal = createRockReferenceLodObject({
    authoredMaterial,
    entry,
    lods: assetLods,
  }, {
    geometryMode: 'original',
    materialMode: 'authored',
    seed: entry.seed,
    strength: 1,
  });
  assert.equal(builtOriginal.levels.length, entry.target.lodTriangles.length, `${entry.id}: source LOD count`);
  assert.ok(
    builtOriginal.levels.every((level) => triangles(level.geometry) === triangles(source)),
    `${entry.id}: source topology retained by every LOD object`,
  );
  assert.deepEqual(
    builtOriginal.report.levels.map((level) => level.targetTriangles),
    entry.target.lodTriangles,
    `${entry.id}: exact authored LOD targets`,
  );
  assert.equal(builtOriginal.report.method, 'authored-source-lod-original', `${entry.id}: original method`);
  builtOriginal.dispose();
  authoredMaterial.dispose();
  assetLods.forEach((lod) => lod.geometry.dispose());

  identity.dispose();
  varied.dispose();
  repeated.dispose();
  familyCounts[entry.family] = (familyCounts[entry.family] ?? 0) + 1;
}

source.dispose();
assert.equal(changedProfiles, ROCK_REFERENCE_CATALOG.length, 'every catalog type produces a real variation');

let localAssets = 'not present (source-contract checks only)';
let localBytes = 0;
let localLodFiles = 0;
let sourceMaterials = 'not present';
if (existsSync(MANIFEST_PATH)) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.schema, 'toonlab.local-rock-references', 'local manifest schema');
  assert.equal(manifest.version, 1, 'local manifest version');
  assert.equal(manifest.entries.length, ROCK_REFERENCE_CATALOG.length, 'all 324 local source meshes exported');
  assert.equal(manifest.count, ROCK_REFERENCE_CATALOG.length, 'local manifest count');
  const localByName = new Map(manifest.entries.map((entry) => [entry.sourceAssetName, entry]));
  assert.equal(localByName.size, ROCK_REFERENCE_CATALOG.length, 'local source names are unique');

  for (const entry of ROCK_REFERENCE_CATALOG) {
    const local = localByName.get(entry.sourceAssetName);
    assert.ok(local, `${entry.sourceAssetName}: local manifest entry`);
    assert.equal(local.lods.length, entry.target.lodTriangles.length, `${entry.sourceAssetName}: authored LOD count`);
    for (let lod = 0; lod < local.lods.length; lod += 1) {
      const record = local.lods[lod];
      const path = resolve(LOCAL_ROOT, record.file);
      assert.ok(path.startsWith(`${LOCAL_ROOT}/`), `${entry.sourceAssetName}: local LOD path stays in root`);
      assert.ok(existsSync(path), `${entry.sourceAssetName} LOD${lod}: source GLB exists`);
      const json = parseGlb(path);
      const actualTriangles = glbTriangleCount(json);
      assert.equal(record.lod, lod, `${entry.sourceAssetName}: sequential LOD index`);
      assert.equal(record.triangles, entry.target.lodTriangles[lod], `${entry.sourceAssetName} LOD${lod}: manifest triangles`);
      assert.equal(actualTriangles, entry.target.lodTriangles[lod], `${entry.sourceAssetName} LOD${lod}: GLB triangles`);
      assertRawGeometryChannels(json, `${entry.sourceAssetName} LOD${lod}`);
      localBytes += statSync(path).size;
      localLodFiles += 1;
    }

    const authoredPath = resolve(LOCAL_ROOT, local.authoredFile);
    assert.ok(authoredPath.startsWith(`${LOCAL_ROOT}/`), `${entry.sourceAssetName}: authored path stays in root`);
    assert.ok(existsSync(authoredPath), `${entry.sourceAssetName}: authored GLB exists`);
    const authoredJson = parseGlb(authoredPath);
    assert.ok((authoredJson.materials?.length ?? 0) > 0, `${entry.sourceAssetName}: authored material`);
    assert.equal(glbTriangleCount(authoredJson), entry.target.lodTriangles[0], `${entry.sourceAssetName}: authored LOD0 geometry`);
    localBytes += statSync(authoredPath).size;
  }
  localAssets = `${manifest.entries.length} meshes / ${localLodFiles} exact LOD files`;
} else {
  console.warn('Local Unreal export is absent; run node scripts/export-rock-reference-assets.mjs for GLB verification.');
}

if (existsSync(MATERIAL_SOURCE_MANIFEST_PATH)) {
  const materialManifest = JSON.parse(readFileSync(MATERIAL_SOURCE_MANIFEST_PATH, 'utf8'));
  assert.equal(materialManifest.schema, 'toonlab.rock-material-source', 'source material manifest schema');
  assert.equal(materialManifest.version, 1, 'source material manifest version');
  assert.equal(
    materialManifest.meshes.length,
    ROCK_REFERENCE_CATALOG.length,
    'source material manifest covers all 324 meshes',
  );
  const profilePaths = new Set(materialManifest.materials.map((profile) => profile.path));
  const assignedPaths = new Set(materialManifest.meshes
    .flatMap((mesh) => mesh.materials ?? [])
    .filter(Boolean));
  assert.deepEqual(profilePaths, assignedPaths, 'every assigned source material has one runtime profile');
  assert.equal(profilePaths.size, 23, 'the 324 meshes resolve to 23 effective source material profiles');

  const textureEntries = Object.entries(materialManifest.textures ?? {});
  assert.ok(textureEntries.length >= 54, 'complete source function graph exports at least 54 2D textures');
  for (const [unrealPath, record] of textureEntries) {
    const texturePath = resolve(LOCAL_ROOT, 'material-source', record.file);
    assert.ok(
      texturePath.startsWith(`${resolve(LOCAL_ROOT, 'material-source')}/`),
      `${unrealPath}: texture path stays in material-source root`,
    );
    assert.ok(existsSync(texturePath), `${unrealPath}: source texture exists`);
    assert.ok(record.width > 0 && record.height > 0, `${unrealPath}: source dimensions`);
  }
  for (const profile of materialManifest.materials) {
    for (const unrealPath of Object.values(profile.parameters?.texture ?? {}).filter(Boolean)) {
      assert.ok(
        materialManifest.textures[unrealPath],
        `${profile.path}: parameter texture exported (${unrealPath})`,
      );
    }
  }
  sourceMaterials = `${profilePaths.size} profiles / ${textureEntries.length} source textures`;
} else {
  console.warn('Source material cache is absent; run node scripts/export-rock-material-source.mjs for shader verification.');
}

console.log('verify-rock-reference-generation: all checks passed');
console.log(JSON.stringify({
  changedProfiles,
  familyCounts,
  localAssets,
  localMiB: Math.round((localBytes / 1024 / 1024) * 10) / 10,
  sourceMaterials,
  sourceMeshTypes: ROCK_REFERENCE_CATALOG.length,
}, null, 2));
