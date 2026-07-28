// Private reference layer (?ref=1): places ToonLab pack assets exported
// from the private reference archive (assets-local/reference-materials — gitignored, dev-served,
// never shipped) in a lineup near spawn, re-shaded by the environment
// shader. Purpose: apples-to-apples comparison — their hand-authored meshes
// under OUR lighting/shading isolates renderer gaps from asset gaps.

import * as THREE from 'three';

import { loadModelAsset } from '@call-me-sensei/toonlab/loaders';
import {
  applyEnvironmentShader,
  resolveEnvironmentPreset,
} from '@call-me-sensei/toonlab/environment';

export const MANIFEST_URL = '/assets-local/reference-materials/manifest.json';
export const REFERENCE_TEXTURES_BASE = '/assets-local/reference-materials/textures';

export function toServedUrl(file) {
  // Manifest paths are absolute on-disk; everything under the repo root is
  // dev-served at the same relative path.
  const marker = '/toonlab/assets-local/';
  const index = file.indexOf(marker);
  return index >= 0 ? file.slice(index + '/toonlab'.length) : file;
}

// ToonLab exports in centimeters, but FBXLoader's unit handling varies by file —
// measure and normalize instead of trusting either.
export function autoUnitScale(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  return maxDim > 150 ? 0.01 : 1;
}

function textureStem(file) {
  const name = file.split('/').pop().replace(/\.(png|tga)$/i, '');
  return name.replace(/^T_/, '').replace(/_(BC|N|R|H|W)$/i, '');
}

export function buildTextureIndex(manifest) {
  const index = [];
  for (const entry of manifest.textures ?? []) {
    // Base-color textures plus the unsuffixed T_Leaf_* card masks (their
    // leaves carry shape/alpha in the texture, color in material curves).
    if (!/_BC\.(png|tga)$/i.test(entry.file) && !/T_Leaf_[A-Za-z]+\.(png|tga)$/i.test(entry.file)) continue;
    index.push({ stem: textureStem(entry.file).toLowerCase(), url: toServedUrl(entry.file) });
  }
  return index;
}

export function matchTexture(materialName, textureIndex) {
  let name = (materialName ?? '').toLowerCase().replace(/^m[i]?_/, '');
  if (!name) return null;
  // Their rock family shares one texture set across cliff/boulder/platform
  // material instances.
  name = name.replace(/cliff|boulder|platform|shelves|spire/, 'rock');
  // Leaf materials are MI_<Tree>Leaves; their card masks are T_Leaf_<Tree>.
  // The far-LOD merged material (MI_<Tree>Tree_SingleMat) reuses the same
  // leaf mask.
  const leafMatch = /^([a-z]+?)leaves/.exec(name) ?? /^([a-z]+?)tree_singlemat/.exec(name);
  if (leafMatch) {
    const tree = leafMatch[1];
    const leafEntry = textureIndex.find((entry) =>
      entry.stem === `leaf_${tree}` || entry.stem.startsWith(`leaf_${tree}`));
    if (leafEntry) return leafEntry;
    // Deciduous broadleaf trees share one generic card mask.
    const generic = textureIndex.find((entry) => entry.stem === 'leaf_deciduous');
    if (generic) return generic;
  }
  let best = null;
  for (const entry of textureIndex) {
    if (name.includes(entry.stem) || entry.stem.includes(name)) {
      if (!best || entry.stem.length > best.stem.length) best = entry;
    }
  }
  return best;
}

async function fetchManifest() {
  try {
    const response = await fetch(MANIFEST_URL);
    if (response.ok) return await response.json();
  } catch {
    // fall through
  }
  return null;
}

export function prepareReferenceMaterials(object, textureIndex, loadTexture) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat) continue;
      const match = matchTexture(mat.name, textureIndex);
      const isFoliage = /leaves|leaf|flower|grass|bush|frond|singlemat/i.test(mat.name ?? '');
      if (match) {
        if (isFoliage && /\/T_Leaf_/i.test(match.url)) {
          // Their leaf cards are grayscale opacity masks (no alpha channel,
          // color lives in material curves) — route through alphaMap so the
          // environment adapter's luminance-cutout path takes over.
          mat.alphaMap = loadTexture(match.url);
        } else {
          mat.map = loadTexture(match.url);
        }
      }
      if (isFoliage) {
        // LOD cohesion: near levels multiply the tint by the dark leaf-mask
        // luminance (~0.45 average); the far merged material has no mask
        // texel in its color path, so pre-darken its tint to match or far
        // trees pop brighter than near ones.
        if (/singlemat/i.test(mat.name ?? '')) mat.color?.setRGB(0.21, 0.33, 0.14);
        else mat.color?.setRGB(0.42, 0.62, 0.28);
        mat.transparent = false;
        mat.alphaTest = 0.3;
        mat.side = THREE.DoubleSide;
      }
      mat.needsUpdate = true;
    }
  });
}

export function createTextureLoaderCache() {
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  return (url) => {
    if (!cache.has(url)) {
      const texture = loader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      cache.set(url, texture);
    }
    return cache.get(url);
  };
}

// The converted environment materials need two nudges for their leaf-card
// class: the grayscale masks carry opacity in LUMINANCE (the PNG has no
// alpha channel, so the default alpha path reads a constant 1 and the cards
// render as solid quads), and the untextured-gradient wash must not lift
// the curve-tinted green toward white.
export function fixupConvertedFoliage(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of materials) {
      if (!mat?.uniforms) continue;
      // Their textures are UV-ATLAS mapped — the environment preset's
      // world-space triplanar re-sampling turns an atlas into striped
      // garbage on every steep face. Authored UVs are always right here.
      if (mat.uniforms.triplanarDetail) mat.uniforms.triplanarDetail.value = 0;
      if (!/leaves|leaf|flower|grass|bush|frond|singlemat/i.test(mat.name ?? '')) continue;
      if (mat.uniforms.alphaFromLuminance) mat.uniforms.alphaFromLuminance.value = 1;
      if (mat.uniforms.alphaCutoff) mat.uniforms.alphaCutoff.value = 0.28;
      if (mat.uniforms.untexturedGradientStrength) mat.uniforms.untexturedGradientStrength.value = 0;
    }
  });
}

// ToonLab FBX LOD export nests each level as a child named …LOD0/…LOD1. Rebuild
// that chain as a THREE.LOD so their handmade distance meshes actually do
// their job (their LOD contract: far levels also drop wind/detail cost).
// Tighter than their ToonLab screen-size switches: at 20 fps the frame needs the
// cheap levels sooner, and the toon shading hides the swap well.
const LOD_DISTANCES = [0, 32, 75, 150, 260];

export function assembleLodTemplate(object) {
  const levels = [];
  object.traverse((child) => {
    const match = /LOD_?(\d+)$/i.exec(child.name ?? '');
    if (match) levels.push({ index: Number(match[1]), node: child });
  });
  // Keep topmost matches only — a matched group's meshes may re-match.
  const tops = levels.filter(({ node }) => {
    let ancestor = node.parent;
    while (ancestor) {
      if (levels.some((entry) => entry.node === ancestor)) return false;
      ancestor = ancestor.parent;
    }
    return true;
  });
  if (tops.length < 2) return object;
  const lod = new THREE.LOD();
  lod.name = object.name;
  // Preserve each level's WORLD transform when re-parenting: the FBX root
  // carries the Z-up→Y-up correction (and unit scaling) that a bare
  // removeFromParent() would drop — trees render sideways without it.
  object.updateMatrixWorld(true);
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  for (const { index, node } of tops.sort((a, b) => a.index - b.index)) {
    node.getWorldQuaternion(worldQuaternion);
    node.getWorldScale(worldScale);
    node.removeFromParent();
    node.quaternion.copy(worldQuaternion);
    node.scale.copy(worldScale);
    node.position.set(0, 0, 0);
    lod.addLevel(node, LOD_DISTANCES[Math.min(index, LOD_DISTANCES.length - 1)]);
  }
  return lod;
}

/**
 * Reference-first forest: their tree meshes scattered as the world's forest
 * (dev-only), re-shaded by the environment pipeline. Placements come from
 * the caller's masks; template selection cycles the available full trees.
 */
export async function createReferenceForest({ heightAt, placements = [], terrainRoot }) {
  const manifest = await fetchManifest();
  if (!manifest?.meshes?.length || placements.length === 0) return null;
  const textureIndex = buildTextureIndex(manifest);
  const loadTexture = createTextureLoaderCache();

  const templateEntries = manifest.meshes.filter((entry) =>
    /SM_(Pine0\d|BirchTree\d|Oak\d|OakTree\d|Fir\d)\.fbx$/i.test(entry.file));
  const templates = [];
  for (const entry of templateEntries) {
    try {
      const asset = await loadModelAsset(toServedUrl(entry.file));
      let object = asset.root;
      const unitScale = autoUnitScale(object);
      prepareReferenceMaterials(object, textureIndex, loadTexture);
      object = assembleLodTemplate(object);
      object.scale.setScalar(unitScale);
      templates.push(object);
    } catch (error) {
      console.warn('[referenceForest] failed to load', entry.file, error.message);
    }
  }
  if (templates.length === 0) return null;

  const root = new THREE.Group();
  root.name = 'ReferenceForest';
  placements.forEach((p, i) => {
    const template = templates[i % templates.length];
    const tree = template.clone(true);
    // Perf: the water re-renders the scene for reflection/refraction; 300
    // leaf-card trees in those passes are a large slice of the frame. Skip
    // them there until the parity pass decides reflections matter.
    tree.traverse((node) => { node.userData.waterExclude = true; });
    const jitter = 0.8 + ((i * 2654435761) % 1000) / 2500;
    tree.scale.multiplyScalar(jitter);
    tree.rotation.y = i * 2.39996;
    tree.position.set(p.x, (p.y ?? heightAt(p.x, p.z)) - 0.08, p.z);
    root.add(tree);
  });
  terrainRoot.add(root);
  // No AO bake: 300 cloned trees would blow the vertex budget and stall the
  // boot for a value the toon canopy shading barely reads.
  await applyEnvironmentShader(root, {
    ...resolveEnvironmentPreset('call_me_sensei', 'exteriorDay'),
    bakeVertexAo: false,
  });
  fixupConvertedFoliage(root);
  console.info(`[referenceForest] ${placements.length} trees from ${templates.length} templates`);
  return { root, templateCount: templates.length };
}

export async function createReferenceLayer({ heightAt, spawn, terrainRoot }) {
  let manifest = null;
  try {
    const response = await fetch(MANIFEST_URL);
    if (response.ok) manifest = await response.json();
  } catch {
    // fall through
  }
  if (!manifest?.meshes?.length) {
    console.warn('[referenceLayer] no exported assets at assets-local/reference-materials.');
    return null;
  }

  const textureIndex = buildTextureIndex(manifest);
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();
  const loadTexture = (url) => {
    if (!textureCache.has(url)) {
      const texture = textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      textureCache.set(url, texture);
    }
    return textureCache.get(url);
  };

  const root = new THREE.Group();
  root.name = 'ToonLabReference';

  const byCategory = new Map();
  for (const entry of manifest.meshes) {
    const category = entry.file.split('/toonlab/')[1]?.split('/')[0] ?? 'misc';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(entry);
  }

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  let rowZ = spawn.z + 14;
  const loaded = [];
  for (const [category, entries] of byCategory) {
    let cursorX = spawn.x + 10;
    let rowDepth = 4;
    for (const entry of entries.slice(0, 8)) {
      try {
        const asset = await loadModelAsset(toServedUrl(entry.file));
        const object = asset.root;
        object.scale.setScalar(autoUnitScale(object));
        box.setFromObject(object);
        box.getSize(size);
        // Anything vista-scale (their cliffs run 30 m+) gets capped so the
        // lineup stays walkable; the mesh detail is what we're comparing.
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 16) object.scale.multiplyScalar(16 / maxDim);
        box.setFromObject(object);
        box.getSize(size);
        const radius = Math.max(size.x, size.z) / 2;

        object.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of materials) {
            if (!mat) continue;
            const match = matchTexture(mat.name, textureIndex);
            if (match) mat.map = loadTexture(match.url);
            if (/leaves|leaf|flower|grass|bush|frond|singlemat/i.test(mat.name ?? '')) {
              // Their leaf textures are grayscale masks colored by in-material
              // gradient curves — approximate the curve with a canopy tint.
              mat.color?.setRGB(0.42, 0.62, 0.28);
              mat.transparent = false;
              mat.alphaTest = 0.35;
              mat.side = THREE.DoubleSide;
            }
            mat.needsUpdate = true;
          }
        });

        cursorX += radius + 2;
        const x = cursorX;
        const z = rowZ;
        object.position.set(x, heightAt(x, z) - box.min.y + object.position.y, z);
        // Ground the asset: FBX pivots sit at origin, but sink slightly like
        // the reference placements do.
        object.position.y = heightAt(x, z) - Math.max(box.min.y, 0) - 0.05;
        cursorX += radius + 2;
        rowDepth = Math.max(rowDepth, size.z + 4);
        root.add(object);
        loaded.push({ category, name: entry.asset.split('/').pop()?.split('.')[0] });
      } catch (error) {
        console.warn('[referenceLayer] failed to load', entry.file, error.message);
      }
    }
    if (entries.length > 0) rowZ += rowDepth + 4;
  }

  terrainRoot.add(root);
  // Re-shade with the environment pipeline so their meshes live under our
  // light, fog, and cloud shadows — the whole point of the comparison.
  await applyEnvironmentShader(root, {
    ...resolveEnvironmentPreset('call_me_sensei', 'exteriorDay'),
    bakeVertexAo: false,
  });
  fixupConvertedFoliage(root);
  console.info(`[referenceLayer] placed ${loaded.length} reference assets:`,
    loaded.map((l) => `${l.category}/${l.name}`).join(', '));
  return { loaded, root };
}
