#!/usr/bin/env node
//
// Joins each licensed rock reference mesh to its source material profile.
//
// Two local artefacts already carry everything needed, so this reads them
// rather than re-running Unreal:
//
//   rock-references/material-audit.json          mesh -> Unreal material instance
//   reference-environment/rock-material-library.json
//                                                Unity material -> resolved
//                                                S_Rock properties, in the exact
//                                                shape src/rock-shader's resolver
//                                                consumes (floats/ints/colors/textures)
//
// The two packs name the same material slightly differently, so the join is by
// name stem with a small alias table. Output is one profile per source asset:
// which top layer the artist enabled, whether it uses an authored UV mask, and
// the blend parameters — the per-asset half of the look. The other half (tints,
// texture sets, overall style) comes from the selected style bundle at view
// time and is deliberately NOT captured here.
//
//   node scripts/build-rock-reference-profiles.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const ASSETS = resolve(ROOT_DIR, 'assets-local');
const AUDIT = resolve(ASSETS, 'rock-references', 'material-audit.json');
const LIBRARY = resolve(ASSETS, 'reference-environment', 'rock-material-library.json');
const OUTPUT = resolve(ASSETS, 'rock-references', 'reference-profiles.json');

export const PROFILE_SCHEMA = 'toonlab.local-rock-reference-profiles';

// The Unreal pack and the Unity pack disagree on two material names.
const STEM_ALIASES = Object.freeze({
  RockHexic_RocksSlanted: 'RockHexic_RockSlanted',
  RockClassic_BoulderClumps: 'RockClassic_ClumpClassic',
});

const TOP_LAYER_FLAGS = Object.freeze([
  ['grass', '_TopGrass'],
  ['snow', '_TopSnow'],
  ['sand', '_TopSand'],
]);

function stem(name) {
  const leaf = String(name).split('/').pop().split('.')[0];
  const bare = leaf.replace(/^(MI|MV|M)_/, '');
  return STEM_ALIASES[bare] ?? bare;
}

function truthy(value) {
  return Number(value ?? 0) > 0.5;
}

function textureGuid(resolved, key) {
  const slot = resolved?.textures?.[key];
  if (!slot) return null;
  const guid = typeof slot === 'string' ? slot : slot.guid;
  if (!guid || Number(slot?.fileID ?? 1) === 0) return null;
  return guid;
}

/** Reduces one resolved Unity material to the per-asset half of the look. */
function toProfile(material) {
  const resolved = material.resolved ?? {};
  const floats = resolved.floats ?? {};
  const enabled = TOP_LAYER_FLAGS.filter(([, key]) => truthy(floats[key])).map(([layer]) => layer);
  const moss = truthy(floats._Moss);
  const maskTopLayer = truthy(floats._MaskTopLayer);
  return {
    blend: {
      offset: Number(floats._TopLayer_Blend_Offset ?? 0),
      sharpness: Number(floats._TopLayer_Blend_Sharpness ?? 1),
    },
    // The source enables at most one of grass/snow/sand; moss is an
    // independent overlay rather than a top layer.
    conflictingTopLayers: enabled.length > 1 ? enabled : null,
    maskTextureGuid: maskTopLayer ? textureGuid(resolved, '_Top_Layer_Mask') : null,
    maskTopLayer,
    material: {
      assetPath: material.assetPath ?? null,
      guid: material.guid,
      isVariant: Boolean(material.isVariant),
      name: material.name,
    },
    moss: moss
      ? {
        enabled: true,
        multiply: Number(floats._Moss_Multiply ?? 1),
        offset: Number(floats._Moss_Offset ?? 0),
        sharpness: Number(floats._Moss_Sharpness ?? 1),
        size: Number(floats._Moss_Size ?? 1),
      }
      : { enabled: false },
    stylizedNormalGuid: textureGuid(resolved, '_Stylized_Normal_Map'),
    topLayer: enabled[0] ?? 'none',
    useSmoothedNormalMap: truthy(floats._UseSmoothedNormalMap),
  };
}

async function main() {
  for (const [label, path] of [['material audit', AUDIT], ['rock material library', LIBRARY]]) {
    if (!existsSync(path)) throw new Error(`Missing ${label} at ${path}`);
  }
  const audit = JSON.parse(await readFile(AUDIT, 'utf8'));
  const library = JSON.parse(await readFile(LIBRARY, 'utf8'));
  if (!Array.isArray(audit.meshes) || !Array.isArray(library.materials)) {
    throw new Error('Unexpected audit or library shape.');
  }

  const byStem = new Map();
  for (const material of library.materials) {
    const key = stem(material.name);
    // Prefer the plain material over its _Snowy/_Mossy/_NoGrass siblings: the
    // siblings are alternates an artist may swap in, not the default assignment.
    if (!byStem.has(key) || (byStem.get(key).name.length > material.name.length)) {
      byStem.set(key, material);
    }
  }

  const entries = [];
  const unresolved = [];
  for (const mesh of audit.meshes) {
    const paths = Array.isArray(mesh.materials) ? mesh.materials : [];
    const match = paths.map((path) => byStem.get(stem(path))).find(Boolean);
    if (!match) {
      unresolved.push({ materials: paths, sourceAssetName: mesh.sourceAssetName });
      continue;
    }
    entries.push({
      sourceAssetName: mesh.sourceAssetName,
      sourcePath: mesh.sourcePath,
      unrealMaterials: paths,
      ...toProfile(match),
    });
  }

  if (unresolved.length > 0) {
    console.error(`${unresolved.length} mesh(es) did not resolve to a material:`);
    for (const item of unresolved.slice(0, 10)) {
      console.error(`  ${item.sourceAssetName} <- ${item.materials.join(', ') || '(none)'}`);
    }
    process.exit(1);
  }

  entries.sort((left, right) => left.sourceAssetName.localeCompare(right.sourceAssetName));
  await writeFile(OUTPUT, `${JSON.stringify({
    schema: PROFILE_SCHEMA,
    version: 1,
    source: {
      materialAudit: { assetRoot: audit.assetRoot, generatedAt: audit.generatedAt },
      materialLibrary: { generatedAt: library.generatedAt, schema: library.schema },
    },
    counts: { entries: entries.length },
    entries,
  }, null, 2)}\n`);

  const tally = (key) => entries.reduce((acc, entry) => {
    const value = String(entry[key]);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`wrote ${entries.length} profiles to ${OUTPUT}\n`);
  console.log('top layer:      ', JSON.stringify(tally('topLayer')));
  console.log('authored mask:  ', JSON.stringify(tally('maskTopLayer')));
  console.log('smoothed normal:', JSON.stringify(tally('useSmoothedNormalMap')));
  console.log('moss overlay:   ', entries.filter((entry) => entry.moss.enabled).length);
  const conflicts = entries.filter((entry) => entry.conflictingTopLayers);
  if (conflicts.length > 0) {
    console.log(`\nNOTE: ${conflicts.length} asset(s) enable more than one top layer:`);
    for (const entry of conflicts.slice(0, 5)) {
      console.log(`  ${entry.sourceAssetName}: ${entry.conflictingTopLayers.join(' + ')}`);
    }
  }
}

await main();
