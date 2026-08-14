import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const index = await read('rock-lab/index.html');
const app = await read('labs/rock-generation-lab/ui/App.jsx');
const appCss = await read('labs/rock-generation-lab/ui/app.css');
const engine = await read('labs/rock-generation-lab/ui/engine.js');
const main = await read('labs/rock-generation-lab/ui/main.jsx');
const store = await read('labs/rock-generation-lab/ui/store.js');
const catalog = await read('labs/rock-generation-lab/ui/catalog.js');
const catalogInventory = await read('labs/rock-generation-lab/ui/catalogInventory.generated.js');
const catalogSourceMesh = await read('labs/rock-generation-lab/ui/catalogSourceMesh.js');
const rockPbrTextures = await read('labs/rock-generation-lab/ui/rockPbrTextures.js');
const rockGrassPreview = await read('labs/rock-generation-lab/ui/rockGrassPreview.js');
const source = [index, app, engine, main, store, catalog, catalogInventory, catalogSourceMesh, rockPbrTextures, rockGrassPreview].join('\n');
const catalogModule = await import('../labs/rock-generation-lab/ui/catalog.js');
const { ROCK_GALLERY_INVENTORY } = await import(
  '../labs/rock-generation-lab/ui/catalogInventory.generated.js'
);
const catalogSourceMeshModule = await import('../labs/rock-generation-lab/ui/catalogSourceMesh.js');
const rockPbrTexturesModule = await import('../labs/rock-generation-lab/ui/rockPbrTextures.js');
const rockGrassPreviewModule = await import('../labs/rock-generation-lab/ui/rockGrassPreview.js');
const rockgenModule = await import('../src/rockgen/index.js');

const storage = new Map();
globalThis.window = {
  location: { search: '' },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  },
};
const storeModule = await import('../labs/rock-generation-lab/ui/store.js');
const {
  CATALOG_SURFACE_PRESET_OPTIONS,
  catalogSurfacePresetValue,
  createRockGenerationStore,
} = storeModule;

assert.match(index, /labs\/rock-generation-lab\/ui\/main\.jsx/);
assert.match(index, /id="stage"/);
assert.doesNotMatch(index, /labs\/shared\/entry\.js/);

for (const moduleSource of [app, engine, store]) {
  for (const match of moduleSource.matchAll(/from ['"]([^'"]*rockgen[^'"]*)['"]/g)) {
    assert.equal(match[1], '../../../src/rockgen/index.js', 'Rockgen calls must use its public barrel.');
  }
}

assert.match(engine, /meshDocument/);
assert.match(engine, /vertexColors: true/);
assert.match(engine, /previewAssetSource = 'toonlab-rockgen'/);
assert.match(engine, /previewAssetSource = 'toonlab-official-glb'/);
assert.match(catalogSourceMesh, /GLTFLoader/);
assert.match(catalogSourceMesh, /KTX2Loader/);
assert.match(catalogSourceMesh, /deformCatalogGeometry/);
assert.match(app, /testId="preset-select"/);
assert.match(app, /testId="style-select"/);
assert.match(app, /testId="seed-input"/);
assert.match(app, /testId="resolution-select"/);
assert.match(app, /<LabEditorHeader className="rg-topbar" menus=\{menus\}/);
assert.match(app, /'update-local' : 'save-local'/);
assert.match(app, /id: 'save-local-as'/);
assert.match(app, /id: 'delete-local'/);
assert.match(app, /id: 'export-glb'/);
assert.match(app, /label: 'File'/);
assert.match(app, /label: 'Edit'/);
assert.match(app, /label: 'View'/);
assert.match(app, /data-testid="rock-home-screen"/);
assert.match(app, /testId="home-saved-search"/);
assert.match(app, /testId="navigation-mode"/);
assert.match(app, /testId="catalog-top-finish"/);
assert.match(app, /testId="catalog-surface-preset"/);
assert.equal((app.match(/New variation/g) ?? []).length, 1, 'New variation belongs only in the Variation inspector.');
assert.match(app, /data-testid="catalog-surface-inspector"/);
assert.match(app, /PBR texture maps/);
assert.match(app, /Weathering overlays/);
assert.match(app, /Preview meadow grass/);
assert.match(app, /testId="catalog-grass-preview-toggle"/);
assert.match(app, /Surface color adaptation/);
assert.match(engine, /createEnvironmentGroundFieldPass/);
assert.match(engine, /createRockMeadowGrassPreview/);
assert.match(appCss, /\.rg-inspector > \.rg-quick-field \+ \.rg-quick-field/);
assert.match(app, /testId="catalog-sculpt-tool"/);
assert.match(app, /data-testid="catalog-sculpt-inspector"/);
assert.match(engine, /setSculptOptions/);
assert.match(engine, /commitCatalogMeshEdit/);
assert.match(app, /Stylized rock catalog/);
assert.match(app, /Generate without a physical template/);
assert.match(app, /Template-based procedural generation/);
assert.match(app, /480 physical rock templates as the starting mesh/);
assert.match(app, /BrandLockup[\s\S]*labName="Rock & Cliff Generation"/);
assert.match(app, /onLabNameClick=\{\(\) => actions\.setHomeOpen\(true\)\}|onLabNameClick=\{openHome\}/);
assert.doesNotMatch(app, /label="Open rock home"/);
assert.match(store, /serializeRockDocument/);
assert.match(store, /deserializeRockDocument/);
assert.match(store, /exportDocumentToGLB/);
assert.match(store, /LIBRARY_STORAGE_KEY/);
assert.match(store, /saveLocal\(\)/);
assert.match(store, /saveLocalAs\(value/);
assert.match(store, /deleteLocal\(\)/);
assert.match(store, /startCatalogVariation\(id/);
assert.match(store, /regenerateCatalogVariation\(\)/);
assert.match(store, /importDocument\(text\)/);
assert.match(store, /exportJson\(\)/);
assert.match(engine, /setNavigationMode/);
assert.equal(ROCK_GALLERY_INVENTORY.length, 480);
globalThis.fetch = async (url) => {
  assert.equal(String(url), '/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=500');
  return {
    ok: true,
    async json() {
      return {
        items: ROCK_GALLERY_INVENTORY.map((entry, index) => {
          const id = `rock-${String(index + 1).padStart(4, '0')}`;
          const familyId = entry.variationId.replace(/_\d{4}$/u, '').replaceAll('_', '-');
          return {
            download_url: `https://assets.toonlab.io/official/2026-08/${id}/rock.glb`,
            id,
            metadata: {
              familyId,
              recipe: { generator: { seed: index + 1 } },
              recipeHash: `${index}`.padStart(64, '0'),
              revision: 1,
              taxonomy: { geology: entry.geology },
            },
            name: entry.label,
            release: '2026-08',
            tags: entry.tags,
            thumbnail_url: `https://assets.toonlab.io/official/2026-08/${id}/thumbnail.png`,
          };
        }),
      };
    },
  };
};
await catalogModule.loadRockVariationCatalog();
assert.equal(catalogModule.ROCK_VARIATION_CATALOG.length, 480);
assert.equal(new Set(catalogModule.ROCK_VARIATION_CATALOG.map((entry) => entry.id)).size, 480);
assert.equal(catalogModule.ROCK_VARIATION_CATALOG[0].id, 'rock-0001');
assert.equal(catalogModule.ROCK_VARIATION_CATALOG.at(-1).id, 'rock-0480');
assert.equal(catalogModule.ROCK_VARIATION_FAMILIES.length, 35);
for (const [entryIndex, sourceEntry] of ROCK_GALLERY_INVENTORY.entries()) {
  const adaptedEntry = catalogModule.ROCK_VARIATION_CATALOG[entryIndex];
  const galleryId = `rock-${String(entryIndex + 1).padStart(4, '0')}`;
  assert.equal(adaptedEntry.id, galleryId);
  assert.equal(adaptedEntry.variationId, galleryId);
  assert.equal(adaptedEntry.label, sourceEntry.label);
  assert.equal(adaptedEntry.file, 'rock.glb');
  assert.equal(adaptedEntry.geology, sourceEntry.geology);
  assert.equal(adaptedEntry.galleryId, galleryId);
  assert.equal(adaptedEntry.thumbnailUrl, `https://assets.toonlab.io/official/2026-08/${galleryId}/thumbnail.png`);
  assert.equal(adaptedEntry.modelUrl, `https://assets.toonlab.io/official/2026-08/${galleryId}/rock.glb`);
  assert.equal(adaptedEntry.sourceMode, 'official-glb');
  assert.equal(adaptedEntry.sourceVersion, '2026-08');
  assert.deepEqual(adaptedEntry.tags, sourceEntry.tags);
}
assert.ok(catalogModule.searchRockVariationCatalog({ text: 'weathered-limestone' }).length > 0);
assert.ok(catalogModule.searchRockVariationCatalog({ text: 'fragments' }).length > 0);
assert.equal(
  catalogModule.searchRockVariationCatalog({ text: 'rock-0001' })[0].id,
  'rock-0001',
);
const generated = catalogModule.createCatalogVariationDocument('rock-0480', { variation: 2 });
assert.equal(generated.type, 'toonlab/rockgen-project');
assert.equal(generated.name, 'Isolated Peak 3 Variation 3');
assert.equal(generated.reference.sourceMode, 'mesh-template');
assert.equal(generated.reference.id, 'rock-0480');
assert.equal(generated.reference.variation, 0.3);
assert.equal(generated.reference.surfaceMode, 'source');
assert.equal(generated.reference.topFinish, 'source');
assert.equal(generated.surface.pbrTexturePreset, 'none');
assert.equal(generated.surface.mossCoverage, 0);
assert.ok(rockgenModule.ROCK_PBR_TEXTURE_PRESETS.length >= 10);
assert.ok(rockgenModule.ROCKGEN_SETTING_FIELD_SCHEMA.surface.pbrTexturePreset.options.includes('cliff-rock'));

globalThis.FileReader ??= class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    }, (error) => {
      this.error = error;
      this.onloadend?.();
    });
  }
};
assert.match(catalogSourceMesh, /loader\.loadAsync\(entry\.modelUrl\)/);
assert.doesNotMatch(catalogSourceMesh, /createFirstPartyCatalogSourceGlb/);

const sourceGeometry = new (await import('three')).BoxGeometry(2, 3, 4, 2, 2, 2);
const variedGeometry = catalogSourceMeshModule.deformCatalogGeometry(sourceGeometry, {
  bulge: 0.03,
  leanX: 0.02,
  leanZ: -0.02,
  noiseAmplitude: 0.01,
  noiseFrequency: 1.7,
  phases: [0.1, 0.2, 0.3],
  scale: [1.02, 0.98, 1.01],
  strength: 0.3,
  taper: 0.02,
  twist: 0.03,
});
assert.equal(variedGeometry.getAttribute('position').count, sourceGeometry.getAttribute('position').count);
assert.equal(variedGeometry.index.count, sourceGeometry.index.count);
assert.notDeepEqual(
  [...variedGeometry.getAttribute('position').array],
  [...sourceGeometry.getAttribute('position').array],
);
const topologyBeforeSurface = {
  indices: variedGeometry.index.count,
  vertices: variedGeometry.getAttribute('position').count,
};
assert.equal(catalogSourceMeshModule.applyCatalogGeneratedSurface(
  variedGeometry,
  generated.surface,
  generated.seed,
), true);
assert.ok(variedGeometry.getAttribute('color'));
assert.deepEqual({
  indices: variedGeometry.index.count,
  vertices: variedGeometry.getAttribute('position').count,
}, topologyBeforeSurface);
const authoredMaterial = new (await import('three')).MeshStandardMaterial({
  color: '#8da1b4',
  roughness: 0.47,
});
const authoredRoot = new (await import('three')).Group();
authoredRoot.add(new (await import('three')).Mesh(sourceGeometry, authoredMaterial));
const preservedVariation = catalogSourceMeshModule.createCatalogVariation({
  entry: {
    galleryId: 'qa-source',
    modelUrl: '/qa-source.glb',
    variationId: 'qa_source',
  },
  root: authoredRoot,
}, {
  preserveSourceMaterial: true,
  seed: 7,
  strength: 0,
  surface: {
    ...generated.surface,
    topColor: [0.34, 0.52, 0.2],
    topCoatStrength: 1,
  },
  surfaceMode: 'generated',
});
assert.equal(preservedVariation.meshes[0].material.color.getHex(), authoredMaterial.color.getHex());
assert.equal(preservedVariation.meshes[0].material.roughness, authoredMaterial.roughness);
assert.equal(preservedVariation.meshes[0].material.vertexColors, true);
assert.equal(preservedVariation.root.userData.toonlabCatalogVariation.preserveSourceMaterial, true);
const preservedGeometry = preservedVariation.meshes[0].geometry;
const preservedColors = preservedGeometry.getAttribute('color');
const preservedNormals = preservedGeometry.getAttribute('normal');
let tintedTopVertices = 0;
for (let index = 0; index < preservedColors.count; index += 1) {
  const color = [preservedColors.getX(index), preservedColors.getY(index), preservedColors.getZ(index)];
  if (preservedNormals.getY(index) <= generated.surface.topSlopeStart) {
    assert.deepEqual(color, [1, 1, 1], 'non-top vertices must preserve the source GLB color exactly');
  } else if (color.some((channel) => channel < 0.999)) {
    tintedTopVertices += 1;
  }
}
assert.ok(tintedTopVertices > 0, 'the top finish should tint upward-facing vertices');
preservedVariation.dispose();
authoredMaterial.dispose();
const textureRoot = new (await import('three')).Group();
const textureMesh = new (await import('three')).Mesh(
  new (await import('three')).BoxGeometry(1, 1, 1),
  new (await import('three')).MeshStandardMaterial({ color: '#714a2c' }),
);
textureMesh.geometry.deleteAttribute('uv');
textureRoot.add(textureMesh);
const disposeTextureSet = await rockPbrTexturesModule.applyRockPbrTexture(textureRoot, {
  pbrNormalStrength: 0.7,
  pbrRoughness: 0.82,
  pbrTexturePreset: 'cliff-rock',
  pbrTextureScale: 3,
});
assert.equal(typeof disposeTextureSet, 'function');
assert.ok(textureMesh.geometry.getAttribute('uv'));
assert.ok(textureMesh.material.map?.isTexture);
assert.ok(textureMesh.material.normalMap?.isTexture);
assert.ok(textureMesh.material.roughnessMap?.isTexture);
assert.equal(textureMesh.material.color.getHex(), 0xffffff);
assert.equal(textureMesh.material.map.repeat.x, 3);
assert.equal(textureRoot.userData.toonlabRockPbrTexture.presetId, 'cliff-rock');
disposeTextureSet();
textureMesh.geometry.dispose();
textureMesh.material.dispose();
const meadowRoot = new (await import('three')).Group();
const meadowRock = new (await import('three')).Mesh(
  new (await import('three')).BoxGeometry(2, 1, 2),
  new (await import('three')).MeshStandardMaterial(),
);
meadowRoot.add(meadowRock);
const meadowSettings = {
  ...rockGrassPreviewModule.DEFAULT_ROCK_GRASS_PREVIEW,
  density: 18,
  enabled: true,
  heightStart: 0.4,
  maxClumps: 40,
  slopeStart: 0.5,
  spacing: 0.04,
};
const meadowPlacements = rockGrassPreviewModule.scatterRockMeadowGrass(
  meadowRoot,
  meadowSettings,
  42,
);
assert.ok(meadowPlacements.length > 0);
assert.ok(meadowPlacements.length <= meadowSettings.maxClumps);
assert.ok(meadowPlacements.every((placement) => placement.y > 0.49));
assert.ok(meadowPlacements.every((placement) => placement.normal[1] >= meadowSettings.slopeStart));
assert.deepEqual(
  rockGrassPreviewModule.scatterRockMeadowGrass(meadowRoot, meadowSettings, 42),
  meadowPlacements,
  'meadow placement must be deterministic',
);
assert.deepEqual(
  rockGrassPreviewModule.scatterRockMeadowGrass(meadowRoot, { ...meadowSettings, enabled: false }, 42),
  [],
);
meadowRock.geometry.dispose();
meadowRock.material.dispose();
const sculptBefore = [...variedGeometry.getAttribute('position').array];
assert.ok(catalogSourceMeshModule.sculptCatalogGeometry(variedGeometry, {
  point: [0, 1.5, 0],
  radius: 3,
  strength: 0.5,
  tool: 'inflate',
}) > 0);
const sculptAfter = [...variedGeometry.getAttribute('position').array];
assert.notDeepEqual(sculptAfter, sculptBefore);
const deltas = [];
for (let index = 0; index < sculptAfter.length / 3; index += 1) {
  const dx = sculptAfter[index * 3] - sculptBefore[index * 3];
  const dy = sculptAfter[(index * 3) + 1] - sculptBefore[(index * 3) + 1];
  const dz = sculptAfter[(index * 3) + 2] - sculptBefore[(index * 3) + 2];
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-8) deltas.push([index, dx, dy, dz]);
}
const replayGeometry = variedGeometry.clone();
const replayPosition = replayGeometry.getAttribute('position');
for (let index = 0; index < sculptBefore.length / 3; index += 1) {
  replayPosition.setXYZ(
    index,
    sculptBefore[index * 3],
    sculptBefore[(index * 3) + 1],
    sculptBefore[(index * 3) + 2],
  );
}
assert.equal(catalogSourceMeshModule.applyCatalogMeshEdits(
  replayGeometry,
  [{ deltas, meshIndex: 0 }],
  0,
), deltas.length);
assert.deepEqual([...replayGeometry.getAttribute('position').array], sculptAfter);
sourceGeometry.dispose();
variedGeometry.dispose();
replayGeometry.dispose();

const firstStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.deepEqual(CATALOG_SURFACE_PRESET_OPTIONS.map((entry) => entry.label), [
  'Call Me Sensei',
  'Bare',
  'Granite',
  'Sandstone',
  'Basalt',
  'Limestone',
  'Veined',
  'Moss',
  'Lichen',
  'Snow Cap',
]);
assert.equal(firstStore.actions.startCatalogVariation('rock-0480', 2), true);
firstStore.actions.setCatalogGrassPreview({ enabled: true, colorAdaptation: 0.88 });
assert.equal(firstStore.getState().grassPreview.enabled, true);
assert.equal(firstStore.getState().grassPreview.colorAdaptation, 0.88);
assert.equal(firstStore.actions.applyCatalogTopFinish('sand'), true);
assert.equal(firstStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(firstStore.getState().document.reference.topFinish, 'sand');
firstStore.actions.setField(
  rockgenModule.ROCKGEN_SETTING_FIELD_SCHEMA.surface.pbrTexturePreset,
  'cliff-rock',
);
assert.equal(firstStore.getState().document.surface.pbrTexturePreset, 'cliff-rock');
assert.equal(firstStore.getState().document.reference.topFinish, 'sand');
assert.equal(firstStore.getState().document.style, 'call_me_sensei');
assert.equal(firstStore.actions.applyCatalogSurfacePreset('sandstone'), true);
assert.equal(firstStore.getState().document.surface.pbrTexturePreset, 'none');
assert.equal(catalogSurfacePresetValue(firstStore.getState().document), 'sandstone');
assert.equal(firstStore.getState().document.surface.textureStyle, 'sandstone');
const sandstoneBase = {
  baseColor: [...firstStore.getState().document.surface.baseColor],
  cavityColor: [...firstStore.getState().document.surface.cavityColor],
  textureStrength: firstStore.getState().document.surface.textureStrength,
  textureStyle: firstStore.getState().document.surface.textureStyle,
};
assert.equal(firstStore.actions.applyCatalogTopFinish('snow'), true);
assert.deepEqual({
  baseColor: firstStore.getState().document.surface.baseColor,
  cavityColor: firstStore.getState().document.surface.cavityColor,
  textureStrength: firstStore.getState().document.surface.textureStrength,
  textureStyle: firstStore.getState().document.surface.textureStyle,
}, sandstoneBase);
assert.equal(catalogSurfacePresetValue(firstStore.getState().document), 'sandstone');
assert.equal(firstStore.actions.applyCatalogSurfacePreset('call_me_sensei'), true);
assert.equal(firstStore.getState().document.style, 'call_me_sensei');
assert.equal(firstStore.getState().document.reference.surfaceMode, 'source');
assert.equal(firstStore.getState().document.reference.topFinish, 'source');
assert.equal(catalogSurfacePresetValue(firstStore.getState().document), 'call_me_sensei');
assert.match(firstStore.getState().status, /original material/);
assert.equal(firstStore.actions.applyCatalogTopFinish('sand'), true);
const sandRevision = firstStore.getState().docRevision;
assert.equal(firstStore.actions.applyCatalogTopFinish('source'), true);
assert.ok(firstStore.getState().docRevision > sandRevision);
assert.equal(firstStore.getState().document.reference.surfaceMode, 'source');
assert.equal(firstStore.actions.applyCatalogTopFinish('sand'), true);
assert.equal(firstStore.actions.commitCatalogMeshEdit({
  deltas: [[0, 0.125, 0, 0]],
  meshIndex: 0,
}), true);
assert.equal(firstStore.getState().document.reference.meshEdits.length, 1);
const draftReloadStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(draftReloadStore.getState().catalogSourceId, 'rock-0480');
assert.equal(draftReloadStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(draftReloadStore.getState().document.reference.meshEdits.length, 1);
assert.equal(firstStore.actions.saveLocalAs('Peak QA'), true);
const reloadedStore = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(reloadedStore.getState().library.length, 1);
assert.equal(reloadedStore.actions.loadLocal(reloadedStore.getState().library[0].id), true);
assert.equal(reloadedStore.getState().document.name, 'Peak QA');
assert.equal(reloadedStore.getState().document.type, 'toonlab/rockgen-project');
assert.equal(reloadedStore.getState().catalogSourceId, 'rock-0480');
assert.equal(reloadedStore.getState().catalogVariation, 2);
assert.equal(reloadedStore.getState().document.reference.surfaceMode, 'generated');
assert.equal(reloadedStore.getState().document.reference.topFinish, 'sand');
assert.deepEqual(reloadedStore.getState().document.reference.meshEdits, [{
  deltas: [[0, 0.125, 0, 0]],
  meshIndex: 0,
}]);

assert.doesNotMatch(
  source,
  /assets-local|So\s*Stylized|SoStylized|Sky\s*Pro|\bP18\b|shared\/p18|rockgen\/reference/i,
  'The active Rock Generation graph must remain first-party and procedural.',
);
assert.doesNotMatch(source, /assets\.toonlab\.io\/official\/2026-08\/rock-/i);

console.log('Rock & Cliff Generation builds first-party GLB sources and supports editable surfaces, mesh sculpting, and adaptive meadow previews.');
